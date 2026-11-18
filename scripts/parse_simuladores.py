"""TITAN TELEMETRY ENGINE
Extrae texto estructurado y metricas analiticas de los reportes PDF del
simulador de autoelevadores (ETECH Simulation) y vuelca telemetria_cohortes.json.

Entrada : carpeta "Reportes diagnostico nov" (fuera del workspace, en el Desktop)
Salida  : telemetria_cohortes.json en la raiz del proyecto

Estructura verificada de cada PDF (16 paginas):
  pag 1    : portada (pares etiqueta->valor) + tabla Consolidated Results
  pag 2-3  : Assessment Log (S no. | Sim Time | Description | Type | Marks)
  pag 4    : Fault Log
  pag 5-12 : 16 graficos raster (2 por pagina) con SMask; orden fijo:
             0 Gear, 1 Pitch, 2 Distance, 3 AccelPad, 4 BRAKE, 5 RPM,
             6 ForkShift, 7 ForkHeight, 8 Tilt, 9 STEERING, 10 SPEED, 11 Roll,
             12-15 multi-serie
  pag 13-16: Student Console Events
"""
import io
import json
import os
import re
import sys

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

INPUT_DIR = r"C:\Users\catra\Desktop\Reportes diagnostico nov"
OUTPUT_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "telemetria_cohortes.json")

# indices (en orden de aparicion de imagenes de las pags 5-12) de los 6 canales objetivo
IDX_ACCEL_PAD = 3
IDX_BRAKE = 4
IDX_FORK_HEIGHT = 7
IDX_TILT_ANGLE = 8
IDX_STEERING = 9
IDX_SPEED = 10

# paso de rejilla (valor entre lineas de grid) por canal, segun plantilla verificada
GRID_STEP = {
    "accel_pad": 1.0,
    "brake": 1.0,
    "fork_height": 0.5,
    "tilt_angle": 2.0,
    "steering": 5.0,
    "speed": 0.5,
}

RE_TIME = re.compile(r"^\d{2}:\d{2}:\d{2}$")
TYPES = {"PrechecksViolation", "Driving", "Collision", "ExerciseTasks", "VehicleParking"}

# Patrones del bug conocido de fisica/sensores del simulador: colisiones
# fantasma contra el suelo/malla y rebote de uñas a cota de piso (sensor de
# altura de mastil en -2). Toda falta cuya descripcion coincida se descarta
# de las metricas y queda auditada en descartes_sanitizados.
RE_ARTEFACTO_SUELO = re.compile(
    r"\b(floor|ground|terrain|mesh)\b"
    r"|fork\s*height\s*\(?\s*(?:mtrs|mts|m)?\s*\)?\s*(?:=|:)?\s*-"
    r"|\bhorn\s*-(?:contact|touch)\b",
    re.I,
)

COVER_FIELDS = ["Penalties", "Task Of Exercise", "Score", "Student Name", "Student Id",
                "Class name", "Class Id", "Instructor Name", "Exercise Name",
                "Equipment Name", "Exercise Start Time", "Exercise Duration"]


def hms_a_segundos(cad):
    """'00:08:59' -> 539"""
    m = re.match(r"^(\d+):(\d{2}):(\d{2})$", cad.strip())
    if not m:
        return None
    h, mi, s = map(int, m.groups())
    return h * 3600 + mi * 60 + s


def parse_portada(page):
    lineas = [l.strip() for l in page.get_text().splitlines() if l.strip()]
    out = {}
    for i, l in enumerate(lineas):
        if l in COVER_FIELDS and l not in out and i + 1 < len(lineas):
            out[l] = lineas[i + 1]
    return out


def parse_faltas(pages):
    """Recorre las lineas de las pags de Assessment Log y agrupa filas ancladas en Type."""
    lineas = []
    for p in pages:
        lineas += [l.strip() for l in p.get_text().splitlines() if l.strip()]
    filas = []
    i = 0
    while i < len(lineas):
        if lineas[i].isdigit() and i + 1 < len(lineas) and RE_TIME.match(lineas[i + 1]):
            sno = int(lineas[i])
            ts = lineas[i + 1]
            j = i + 2
            desc = []
            while j < len(lineas):
                if j >= i + 3 and lineas[j].split(" ")[0] in TYPES:
                    break
                desc.append(lineas[j])
                j += 1
            if j < len(lineas) and desc:
                partes = lineas[j].split(" ")
                tipo = partes[0]
                marks = partes[1] if len(partes) > 1 else \
                    (lineas[j + 1] if j + 1 < len(lineas) else "")
                filas.append({"sno": sno, "timestamp": ts,
                              "descripcion": " ".join(desc), "tipo": tipo, "marks": marks})
                i = j + 2
                continue
        i += 1
    return filas


def sanitizar_faltas(faltas):
    """Separa faltas reales de artefactos fantasma de suelo/malla (bug -2).

    Funcion pura: no muta la entrada. Retorna (reales, descartes), donde
    descartes conserva la fila original mas el motivo de exclusion para
    auditoria post-corrida.
    """
    reales, descartes = [], []
    for f in faltas:
        desc = f.get("descripcion") or ""
        if RE_ARTEFACTO_SUELO.search(desc):
            descartes.append({**f, "motivo_descarte": "ARTEFACTO_SUELO"})
        else:
            reales.append(f)
    return reales, descartes


def curva_de_grafico(doc, page, idx):
    """Devuelve la imagen RGBA real (RGB base + SMask) compuesta sobre blanco."""
    imgs = page.get_images(full=True)
    if idx >= len(imgs):
        return None
    xref = imgs[idx][0]
    base = doc.extract_image(xref)
    im = Image.open(io.BytesIO(base["image"])).convert("RGB")
    smask = base.get("smask", 0)
    if smask:
        al = Image.open(io.BytesIO(doc.extract_image(smask)["image"])).convert("L")
        rgba = im.convert("RGBA")
        rgba.putalpha(al)
    else:
        rgba = im.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    return np.array(Image.alpha_composite(bg, rgba).convert("RGB")).astype(int)


def filas_grid(a):
    """Centros de filas de lineas de rejilla/eje, equiespaciadas.
    Filtra la banda de etiquetas diagonales del eje X (no forma progresion)."""
    gris = (np.abs(a[:, :, 0] - a[:, :, 1]) < 6) & (np.abs(a[:, :, 1] - a[:, :, 2]) < 6) \
        & (a[:, :, 0] > 100) & (a[:, :, 0] < 245)
    cuenta = gris.sum(axis=1)
    crudas = np.where(cuenta > a.shape[1] * 0.6)[0]
    grupos = []
    for r in crudas:
        if grupos and r - grupos[-1][-1] <= 2:
            grupos[-1].append(r)
        else:
            grupos.append([r])
    centros = [float(np.mean(g)) for g in grupos]
    if len(centros) < 2:
        return centros
    gaps = np.diff(centros)
    paso = float(np.median(gaps))
    if paso <= 0:
        return centros
    keep = [c for c in centros
            if abs((c - centros[0]) / paso - round((c - centros[0]) / paso)) < 0.2]
    return keep


def serie_curva(a):
    """Mascara violeta -> por columna, fila media de la curva."""
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mask = (b - g > 25) & (r - g > 15)
    ys = []
    xs = []
    for x in range(a.shape[1]):
        rows = np.where(mask[:, x])[0]
        if rows.size:
            xs.append(x)
            ys.append(rows.mean())
    return np.array(xs), np.array(ys)


def analizar_canal(doc, page_no, local_idx, canal):
    a = curva_de_grafico(doc, doc[page_no], local_idx)
    if a is None:
        return None
    grid = filas_grid(a)
    if len(grid) < 2:
        return None
    y_top, y_bot = grid[0], grid[-1]
    n_int = len(grid) - 1
    paso = GRID_STEP[canal]
    if canal in ("steering", "tilt_angle"):
        v_max, v_min = paso * n_int / 2.0, -paso * n_int / 2.0
    else:
        v_max, v_min = paso * n_int, 0.0
    xs, ys = serie_curva(a)
    if xs.size == 0:
        return None
    vals = v_max + (ys - y_top) * (v_min - v_max) / max(y_bot - y_top, 1e-9)
    if v_min >= 0.0:
        # Canales no bipolares (accel_pad, brake, speed, fork_height): el artefacto de
        # sensor -2 cae bajo la ultima gridline y la extrapolacion lineal lo
        # conserva. Se clampea a 0.0 para no distorsionar medias ni picos.
        vals = np.maximum(vals, 0.0)
    return {"vals": vals, "v_max": v_max, "v_min": v_min}


def _contar_rachas(mask):
    """Cuenta eventos consecutivos donde una condicion booleana se activa."""
    if not mask.size:
        return 0
    return int(np.sum(mask[1:] & ~mask[:-1]) + (1 if mask[0] else 0))


def metricas_steering(doc, orden):
    if len(orden) <= IDX_STEERING:
        return None, None
    pg, li = orden[IDX_STEERING]
    d = analizar_canal(doc, pg, li, "steering")
    if not d:
        return None, None
    v = d["vals"]
    serrucho = float(np.mean(np.abs(np.diff(v)))) if v.size > 1 else 0.0
    tope = 14.0 - 0.5  # topes mecanicos +/-14 segun plantilla
    contacto = (v >= tope) | (v <= -tope)
    volantazos = _contar_rachas(contacto)
    return round(serrucho, 3), volantazos


def metricas_brake(doc, orden):
    if len(orden) <= IDX_BRAKE:
        return None
    pg, li = orden[IDX_BRAKE]
    d = analizar_canal(doc, pg, li, "brake")
    if not d:
        return None
    v = d["vals"]
    pico = v >= 9.5  # nivel 10
    return _contar_rachas(pico)


def metricas_speed(doc, orden):
    if len(orden) <= IDX_SPEED:
        return None
    pg, li = orden[IDX_SPEED]
    d = analizar_canal(doc, pg, li, "speed")
    if not d:
        return None
    return round(float(np.max(d["vals"])), 2)


def metricas_accel_pad(doc, orden):
    """Digitaliza Acceleration Pad (idx 3): picos bruscos y % a fondo."""
    if len(orden) <= IDX_ACCEL_PAD:
        return None, None
    pg, li = orden[IDX_ACCEL_PAD]
    d = analizar_canal(doc, pg, li, "accel_pad")
    if not d:
        return None, None
    v = d["vals"]
    umbral_pico = max(d["v_max"] * 0.85, 1e-6)
    umbral_fondo = max(d["v_max"] * 0.80, 1e-6)
    picos = _contar_rachas(v >= umbral_pico)
    pct_fondo = round(float(np.mean(v >= umbral_fondo) * 100.0), 1)
    return picos, pct_fondo


def metricas_fork_height(doc, orden):
    """Digitaliza Fork Height (idx 7): circulacion con horquillas sobre cota segura (0.35 m)."""
    if len(orden) <= IDX_FORK_HEIGHT:
        return None, None, None
    pg, li = orden[IDX_FORK_HEIGHT]
    d = analizar_canal(doc, pg, li, "fork_height")
    if not d:
        return None, None, None
    v = d["vals"]
    cota_segura = 0.35
    sobre_cota = v > cota_segura
    muestras_elevadas = int(np.sum(sobre_cota))
    pct_elevada = round(float(np.mean(sobre_cota) * 100.0), 1)
    altura_max_m = round(float(np.max(v)), 2)
    return muestras_elevadas, pct_elevada, altura_max_m


def metricas_tilt_angle(doc, orden):
    """Digitaliza Tilt Angle (idx 8): oscilaciones extremas e inestabilidad de mastil."""
    if len(orden) <= IDX_TILT_ANGLE:
        return None, None
    pg, li = orden[IDX_TILT_ANGLE]
    d = analizar_canal(doc, pg, li, "tilt_angle")
    if not d:
        return None, None
    v = d["vals"]
    inestabilidad = float(np.mean(np.abs(np.diff(v)))) if v.size > 1 else 0.0
    tope_tilt = max(d["v_max"] * 0.65, 3.0)
    oscilaciones = _contar_rachas(np.abs(v) >= tope_tilt)
    return oscilaciones, round(inestabilidad, 3)


def clasificar(colisiones, serrucho, frenadas):
    if serrucho is None:
        serrucho = 99.0
    if frenadas is None:
        frenadas = 99
    if colisiones <= 1 and serrucho < 1.8 and frenadas <= 1:
        return "Mínima (Autónomo)", "Apto Directo"
    if colisiones <= 2 and serrucho < 3.2:
        return "Media", "Apto / Observación"
    return "Alta", "Condicional"


def procesar_pdf(ruta):
    doc = fitz.open(ruta)
    try:
        portada = parse_portada(doc[0])
        faltas = parse_faltas([doc[1], doc[2], doc[3]])
        faltas_reales, descartes = sanitizar_faltas(faltas)
        colisiones = [f for f in faltas_reales if f["tipo"] == "Collision"]
        conduccion = [f for f in faltas_reales if f["tipo"] == "Driving"]

        # lista global de imagenes de graficos en orden de pagina (pags 5-12)
        orden = []
        for i in range(4, min(doc.page_count, 12)):
            for k in range(len(doc[i].get_images(full=True))):
                orden.append((i, k))
        serrucho, volantazos = metricas_steering(doc, orden)
        frenadas = metricas_brake(doc, orden)
        speed_max = metricas_speed(doc, orden)
        accel_picos, accel_fondo_pct = metricas_accel_pad(doc, orden)
        fork_muestras_altas, fork_alta_pct, fork_max_m = metricas_fork_height(doc, orden)
        tilt_oscilaciones, tilt_inestabilidad = metricas_tilt_angle(doc, orden)

        dur = portada.get("Exercise Duration", "")
        inicio = portada.get("Exercise Start Time")
        riesgo, aptitud = clasificar(len(colisiones), serrucho, frenadas)
        bloque_telemetria = {
            "steering_serrucho_index": serrucho,
            "steering_volantazos_extremos": volantazos,
            "speed_max_estimada_kmh": speed_max,
            "frenadas_panico_count": frenadas,
            "accel_pad_picos_count": accel_picos,
            "accel_pad_fondo_pct": accel_fondo_pct,
            "fork_height_muestras_elevadas": fork_muestras_altas,
            "fork_height_elevada_pct": fork_alta_pct,
            "fork_height_max_m": fork_max_m,
            "tilt_oscilaciones_count": tilt_oscilaciones,
            "tilt_inestabilidad_index": tilt_inestabilidad,
        }
        return {
            "archivo": os.path.basename(ruta),
            "archivo_fuente": os.path.basename(ruta),
            "student_name": portada.get("Student Name"),
            "student_id": portada.get("Student Id"),
            "score": portada.get("Score"),
            "penalties": portada.get("Penalties"),
            "exercise_name": portada.get("Exercise Name"),
            "exercise_duration": dur,
            "exercise_duration_seg": hms_a_segundos(dur),
            "exercise_start_time": inicio,
            "timestamp_inicio": inicio,
            "colisiones": [{"timestamp": c["timestamp"], "descripcion": c["descripcion"]}
                           for c in colisiones],
            "n_colisiones": len(colisiones),
            "infracciones_conduccion": [{"timestamp": c["timestamp"],
                                         "descripcion": c["descripcion"]} for c in conduccion],
            "descartes_sanitizados": descartes,
            "telemetria": bloque_telemetria,
            "metricas_sanitizadas": {
                "n_colisiones_reales": len(colisiones),
                "colisiones_descartadas": len(descartes),
                **bloque_telemetria,
            },
            "clasificacion": {"riesgo": riesgo, "aptitud": aptitud},
        }
    finally:
        doc.close()


def main():
    pdfs = sorted(f for f in os.listdir(INPUT_DIR) if f.lower().endswith(".pdf"))
    resultados = []
    ok = 0
    fallos = []
    for f in pdfs:
        try:
            resultados.append(procesar_pdf(os.path.join(INPUT_DIR, f)))
            ok += 1
        except Exception as e:  # noqa: BLE001
            fallos.append((f, repr(e)))
    with open(OUTPUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(resultados, fh, ensure_ascii=False, indent=2)

    print("=" * 60)
    print(f"PDFs encontrados : {len(pdfs)}")
    print(f"Procesados con exito : {ok}")
    print(f"Fallidos : {len(fallos)}")
    for f, e in fallos[:10]:
        print("   FALLA", f, e)
    print(f"Salida : {OUTPUT_JSON}")
    print("=" * 60)
    print("PRIMERAS 2 ENTRADAS:")
    print(json.dumps(resultados[:2], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
