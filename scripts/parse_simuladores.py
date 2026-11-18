"""TITAN TELEMETRY ENGINE
Extrae texto estructurado, eventos de consola y las 6 curvas rasterizadas
desde reportes PDF del simulador de autoelevadores (ETECH Simulation),
clasifica intentos cronologicamente (DIAG_INTENTO_1 / DIAG_INTENTO_2 / FINAL),
calcula deltas V1->V2 y T0->T1 y soporta modo --dry-run con cotejo contra
`public.postulantes` de Supabase.
"""
import argparse
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

DEFAULT_INPUT_DIR = r"D:\descargas google\Reportes diagnostico nov"
DEFAULT_OUTPUT_JSON = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "telemetria_cohortes.json",
)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Indices (en orden global de imagenes de paginas de graficos) de los 6 canales objetivo
IDX_ACCEL_PAD = 3
IDX_BRAKE = 4
IDX_FORK_HEIGHT = 7
IDX_TILT_ANGLE = 8
IDX_STEERING = 9
IDX_SPEED = 10

# Paso de rejilla (valor entre lineas de grid) por canal
GRID_STEP = {
    "accel_pad": 1.0,
    "brake": 1.0,
    "fork_height": 0.5,
    "tilt_angle": 2.0,
    "steering": 5.0,
    "speed": 0.5,
}

RE_TIME = re.compile(r"^\d{2}:\d{2}:\d{2}$")
TYPES = {
    "PrechecksViolation",
    "Driving",
    "Collision",
    "ExerciseTasks",
    "VehicleParking",
}

RE_ARTEFACTO_SUELO = re.compile(
    r"\b(floor|ground|terrain|mesh)\b"
    r"|minimum\s*fork\s*height\s*\(?\s*(?:mtrs|mts|m)?\s*\)?"
    r"|fork\s*height\s*\(?\s*(?:mtrs|mts|m)?\s*\)?\s*(?:=|:)?\s*-"
    r"|\bhorn\s*-(?:contact|touch)\b",
    re.I,
)

COVER_FIELDS = [
    "Penalties",
    "Task Of Exercise",
    "Score",
    "Student Name",
    "Student Id",
    "Class name",
    "Class Id",
    "Instructor Name",
    "Exercise Name",
    "Equipment Name",
    "Exercise Start Time",
    "Exercise Duration",
]


def hms_a_segundos(cad):
    """'00:08:59' -> 539"""
    if not cad:
        return None
    m = re.match(r"^(\d+):(\d{2}):(\d{2})$", str(cad).strip())
    if not m:
        return None
    h, mi, s = map(int, m.groups())
    return h * 3600 + mi * 60 + s


def parse_float_seguro(cad):
    if cad is None:
        return None
    try:
        return float(str(cad).replace(",", ".").strip())
    except ValueError:
        return None


def parse_start_time_iso(raw):
    """Convierte '19 October 2026 at 05:04 pm' a ('2026-10-19T17:04:00', '2026-10-19')."""
    if not raw:
        return None, None
    texto = re.sub(r"\s+", " ", str(raw).strip())
    for fmt in (
        "%d %B %Y at %I:%M %p",
        "%d %b %Y at %I:%M %p",
        "%d %B %Y %I:%M %p",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(texto, fmt)
            return dt.strftime("%Y-%m-%dT%H:%M:%S"), dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None, None


def normalizar_nombre_alumno(raw):
    if not raw:
        return "SIN_NOMBRE"
    texto = str(raw).replace(";", "ñ")
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto or "SIN_NOMBRE"


def clave_normalizada_ascii(raw):
    texto = normalizar_nombre_alumno(raw)
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)
    )
    limpio = re.sub(r"[^a-z0-9\s]", " ", sin_tildes.lower())
    return re.sub(r"\s+", " ", limpio).strip()


def levenshtein(a, b):
    if a == b:
        return 0
    if len(a) < len(b):
        a, b = b, a
    if len(b) == 0:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            ins = prev[j + 1] + 1
            dele = curr[j] + 1
            sub = prev[j] + (ca != cb)
            curr.append(min(ins, dele, sub))
        prev = curr
    return prev[-1]


def token_coincide(t1, t2):
    if t1 == t2:
        return True
    if min(len(t1), len(t2)) >= 4 and t1[0] == t2[0]:
        dist = levenshtein(t1, t2)
        if dist <= (2 if max(len(t1), len(t2)) >= 7 else 1):
            return True
    return False


def buscar_postulante_match(nombre_pdf, postulantes):
    clave = clave_normalizada_ascii(nombre_pdf)
    if not clave or clave == "test" or clave == "sin nombre":
        return None
    tokens_s = [t for t in clave.split() if len(t) >= 2]
    if len(tokens_s) < 2:
        return None

    mejor = None
    mejor_puntaje = -1
    for p in postulantes:
        tokens_p = [t for t in clave_normalizada_ascii(p.get("nombre_completo", "")).split() if len(t) >= 2]
        if not tokens_p:
            continue
        usados = set()
        exactos = 0
        aprox = 0
        for ts in tokens_s:
            idx_exact = next((i for i, tp in enumerate(tokens_p) if i not in usados and tp == ts), None)
            if idx_exact is not None:
                usados.add(idx_exact)
                exactos += 1
                continue
            idx_fuzzy = next((i for i, tp in enumerate(tokens_p) if i not in usados and token_coincide(ts, tp)), None)
            if idx_fuzzy is not None:
                usados.add(idx_fuzzy)
                aprox += 1

        if exactos + aprox == len(tokens_s):
            puntaje = exactos * 10 + aprox * 4 - abs(len(tokens_p) - len(tokens_s))
            if puntaje > mejor_puntaje:
                mejor_puntaje = puntaje
                mejor = p
    return mejor


def parse_portada(page):
    lineas = [l.strip() for l in page.get_text().splitlines() if l.strip()]
    out = {}
    for i, l in enumerate(lineas):
        if l in COVER_FIELDS and l not in out and i + 1 < len(lineas):
            out[l] = lineas[i + 1]
    return out


def detectar_secciones_paginas(doc):
    """Detecta dinamicamente paginas de Assessment Log, Graficos y Console Events."""
    pags_log = []
    pags_charts = []
    pags_console = []
    en_console = False
    for i in range(1, doc.page_count):
        txt = doc[i].get_text()
        if "Student Console Events" in txt:
            en_console = True
        if en_console:
            pags_console.append(i)
        elif "Assessment Log" in txt or "Fault Log" in txt:
            pags_log.append(i)
        elif len(doc[i].get_images(full=True)) > 0:
            pags_charts.append(i)

    if not pags_log and doc.page_count >= 4:
        pags_log = [1, 2, 3]
    if not pags_charts and doc.page_count >= 12:
        pags_charts = list(range(4, min(doc.page_count, 12)))
    if not pags_console and doc.page_count >= 13:
        pags_console = list(range(12, doc.page_count))
    return pags_log, pags_charts, pags_console


def parse_faltas(pages):
    """Recorre las paginas de Assessment Log y agrupa filas ancladas en Type."""
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
                marks = (
                    partes[1]
                    if len(partes) > 1
                    else (lineas[j + 1] if j + 1 < len(lineas) else "")
                )
                filas.append(
                    {
                        "sno": sno,
                        "timestamp": ts,
                        "descripcion": " ".join(desc),
                        "tipo": tipo,
                        "marks": marks,
                    }
                )
                i = j + 2
                continue
        i += 1
    return filas


def sanitizar_faltas(faltas):
    """Separa faltas reales de artefactos fantasma de suelo/malla (bug -2)."""
    reales, descartes = [], []
    for f in faltas:
        desc = f.get("descripcion") or ""
        if RE_ARTEFACTO_SUELO.search(desc):
            descartes.append({**f, "motivo_descarte": "ARTEFACTO_SUELO"})
        else:
            reales.append(f)
    return reales, descartes


def parse_console_events(pages):
    """Analiza Student Console Events (pags finales): cinturon y saturaciones."""
    lineas = []
    for p in pages:
        lineas += [l.strip() for l in p.get_text().splitlines() if l.strip()]

    seatbelt_visto_on = False
    desconexiones_cinturon_mov = []
    saturaciones_palancas = {
        "fork_up_down": 0,
        "fork_tilt": 0,
        "fork_left_right": 0,
        "total": 0,
    }
    en_saturacion = {
        "Fork Up/ Down": False,
        "Fork Tilt": False,
        "Fork Left/ Right": False,
    }

    i = 0
    while i < len(lineas) - 2:
        ts = lineas[i]
        if RE_TIME.match(ts):
            ev = lineas[i + 1]
            st = lineas[i + 2]
            seg = hms_a_segundos(ts) or 0

            if ev == "Seat Belt":
                st_up = st.upper()
                if st_up == "ON":
                    seatbelt_visto_on = True
                elif st_up == "OFF" and (seatbelt_visto_on or seg >= 30):
                    desconexiones_cinturon_mov.append({"timestamp": ts, "status": st})
            elif ev in en_saturacion:
                val = parse_float_seguro(st)
                activo = val is not None and abs(val) >= 9.9
                if activo and not en_saturacion[ev]:
                    en_saturacion[ev] = True
                    saturaciones_palancas["total"] += 1
                    if ev == "Fork Up/ Down":
                        saturaciones_palancas["fork_up_down"] += 1
                    elif ev == "Fork Tilt":
                        saturaciones_palancas["fork_tilt"] += 1
                    else:
                        saturaciones_palancas["fork_left_right"] += 1
                elif not activo:
                    en_saturacion[ev] = False
            i += 3
            continue
        i += 1

    return {
        "desconexiones_cinturon_movimiento": len(desconexiones_cinturon_mov),
        "desconexiones_cinturon_detalle": desconexiones_cinturon_mov,
        "saturaciones_palancas": saturaciones_palancas,
    }


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
    gris = (
        (np.abs(a[:, :, 0] - a[:, :, 1]) < 6)
        & (np.abs(a[:, :, 1] - a[:, :, 2]) < 6)
        & (a[:, :, 0] > 100)
        & (a[:, :, 0] < 245)
    )
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
    return [
        c
        for c in centros
        if abs((c - centros[0]) / paso - round((c - centros[0]) / paso)) < 0.2
    ]


def serie_curva(a, y_min=0, y_max=None):
    """Mascara violeta acotada al area del grafico (excluye barra de leyenda)."""
    h = a.shape[0]
    y0 = max(0, int(y_min))
    y1 = min(h, int(y_max) + 1) if y_max is not None else h
    if y1 <= y0:
        return np.array([]), np.array([])
    sub = a[y0:y1]
    r, g, b = sub[:, :, 0], sub[:, :, 1], sub[:, :, 2]
    mask = (b - g > 25) & (r - g > 15)
    ys = []
    xs = []
    for x in range(sub.shape[1]):
        rows = np.where(mask[:, x])[0]
        if rows.size:
            xs.append(x)
            ys.append(float(rows.mean()) + y0)
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
    xs, ys = serie_curva(a, y_min=max(0, y_top - 2), y_max=y_bot + 2)
    if xs.size == 0:
        return None
    vals = v_max + (ys - y_top) * (v_min - v_max) / max(y_bot - y_top, 1e-9)
    if v_min >= 0.0:
        vals = np.maximum(vals, 0.0)
    return {"vals": vals, "v_max": v_max, "v_min": v_min}


def _contar_rachas(mask):
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
    tope = 14.0 - 0.5
    volantazos = _contar_rachas((v >= tope) | (v <= -tope))
    return round(serrucho, 3), volantazos


def metricas_brake(doc, orden):
    if len(orden) <= IDX_BRAKE:
        return None
    pg, li = orden[IDX_BRAKE]
    d = analizar_canal(doc, pg, li, "brake")
    if not d:
        return None
    return _contar_rachas(d["vals"] >= 9.5)


def metricas_speed(doc, orden):
    if len(orden) <= IDX_SPEED:
        return None
    pg, li = orden[IDX_SPEED]
    d = analizar_canal(doc, pg, li, "speed")
    if not d:
        return None
    return round(float(np.max(d["vals"])), 2)


def metricas_accel_pad(doc, orden):
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
    if len(orden) <= IDX_FORK_HEIGHT:
        return None, None, None
    pg, li = orden[IDX_FORK_HEIGHT]
    d = analizar_canal(doc, pg, li, "fork_height")
    if not d:
        return None, None, None
    v = d["vals"]
    sobre_cota = v > 0.35
    return (
        int(np.sum(sobre_cota)),
        round(float(np.mean(sobre_cota) * 100.0), 1),
        round(float(np.max(v)), 2),
    )


def metricas_tilt_angle(doc, orden):
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


def clasificar_perfil_operador(score_dep, dur_seg, n_col, telemetria):
    """Replica exactamente la taxonomia de 5 arquetipos de parser-simulador.ts."""
    serrucho = telemetria.get("steering_serrucho_index")
    volantazos = telemetria.get("steering_volantazos_extremos")
    speed_max = telemetria.get("speed_max_estimada_kmh")
    frenadas = telemetria.get("frenadas_panico_count")
    accel_picos = telemetria.get("accel_pad_picos_count")
    accel_fondo = telemetria.get("accel_pad_fondo_pct")
    fork_alta_pct = telemetria.get("fork_height_elevada_pct")
    tilt_osc = telemetria.get("tilt_oscilaciones_count")

    if score_dep is not None and score_dep < 55:
        return "NOVATO"
    if (
        n_col >= 2
        or (fork_alta_pct is not None and fork_alta_pct >= 25)
        or (tilt_osc is not None and tilt_osc >= 4)
    ):
        return "SIN_NOCION_ESPACIO"
    tiempo_bajo_medio = dur_seg is None or dur_seg <= 390
    senal_exceso = (
        (speed_max is not None and speed_max >= 11)
        or (frenadas is not None and frenadas >= 2)
        or (serrucho is not None and serrucho >= 2.0)
        or (volantazos is not None and volantazos >= 3)
        or (accel_picos is not None and accel_picos >= 3)
        or (accel_fondo is not None and accel_fondo >= 35)
        or (n_col == 1 and dur_seg is not None and dur_seg < 330)
    )
    if tiempo_bajo_medio and senal_exceso:
        return "APURADO"
    if (dur_seg is not None and dur_seg > 450) or (
        n_col <= 1 and score_dep is not None and score_dep < 75
    ):
        return "INEFICIENTE"
    return "EFICIENTE"


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


def procesar_pdf(ruta, root_dir=None):
    doc = fitz.open(ruta)
    try:
        portada = parse_portada(doc[0])
        pags_log, pags_charts, pags_console = detectar_secciones_paginas(doc)
        faltas = parse_faltas([doc[p] for p in pags_log])
        faltas_reales, descartes = sanitizar_faltas(faltas)
        colisiones = [f for f in faltas_reales if f["tipo"] == "Collision"]
        prechecks = [f for f in faltas_reales if f["tipo"] == "PrechecksViolation"]
        conduccion = [f for f in faltas_reales if f["tipo"] == "Driving"]

        descarte_puntos = sum(
            abs(parse_float_seguro(d.get("marks")) or 0.0) for d in descartes
        )
        score_raw = parse_float_seguro(portada.get("Score"))
        score_depurado = (
            round(min(100.0, score_raw + descarte_puntos), 2)
            if score_raw is not None
            else None
        )

        orden = []
        for i in pags_charts:
            for k in range(len(doc[i].get_images(full=True))):
                orden.append((i, k))

        serrucho, volantazos = metricas_steering(doc, orden)
        frenadas = metricas_brake(doc, orden)
        speed_max = metricas_speed(doc, orden)
        accel_picos, accel_fondo_pct = metricas_accel_pad(doc, orden)
        fork_muestras_altas, fork_alta_pct, fork_max_m = metricas_fork_height(doc, orden)
        tilt_oscilaciones, tilt_inestabilidad = metricas_tilt_angle(doc, orden)
        console_events = parse_console_events([doc[p] for p in pags_console])

        dur = portada.get("Exercise Duration", "")
        dur_seg = hms_a_segundos(dur)
        inicio_raw = portada.get("Exercise Start Time")
        inicio_iso, fecha_cal = parse_start_time_iso(inicio_raw)

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
        perfil_operador = clasificar_perfil_operador(
            score_depurado, dur_seg, len(colisiones), bloque_telemetria
        )
        archivo_rel = (
            os.path.relpath(ruta, root_dir) if root_dir else os.path.basename(ruta)
        )
        student_name = normalizar_nombre_alumno(portada.get("Student Name"))
        student_id = (portada.get("Student Id") or "").strip() or None

        return {
            "archivo": archivo_rel,
            "archivo_fuente": os.path.basename(ruta),
            "paginas": doc.page_count,
            "student_name": student_name,
            "student_id": student_id,
            "class_name": portada.get("Class name"),
            "class_id": portada.get("Class Id"),
            "equipment_name": portada.get("Equipment Name"),
            "score": portada.get("Score"),
            "score_raw": score_raw,
            "score_depurado": score_depurado,
            "penalties": portada.get("Penalties"),
            "exercise_name": portada.get("Exercise Name"),
            "exercise_duration": dur,
            "exercise_duration_seg": dur_seg,
            "exercise_start_time": inicio_raw,
            "exercise_start_time_iso": inicio_iso,
            "fecha_calendario": fecha_cal,
            "timestamp_inicio": inicio_iso or inicio_raw,
            "n_prechecks_violation": len(prechecks),
            "colisiones": [
                {"timestamp": c["timestamp"], "descripcion": c["descripcion"]}
                for c in colisiones
            ],
            "n_colisiones": len(colisiones),
            "infracciones_conduccion": [
                {"timestamp": c["timestamp"], "descripcion": c["descripcion"]}
                for c in conduccion
            ],
            "descartes_sanitizados": descartes,
            "console_events": console_events,
            "telemetria": bloque_telemetria,
            "metricas_sanitizadas": {
                "n_colisiones_reales": len(colisiones),
                "colisiones_descartadas": len(descartes),
                "score_depurado": score_depurado,
                **bloque_telemetria,
            },
            "perfil_operador": perfil_operador,
            "clasificacion": {"riesgo": riesgo, "aptitud": aptitud},
            "etapa_sugerida": None,
            "es_mejor_diagnostico": False,
            "intento_abortado": bool(
                dur_seg is not None and dur_seg < 60 and len(colisiones) == 0
            ),
            "duplicado_de": None,
        }
    finally:
        doc.close()


def diff_num(b, a):
    if a is None or b is None:
        return None
    return round(b - a, 3)


def calcular_delta_par(base, comp):
    tb = base.get("telemetria", {})
    tc = comp.get("telemetria", {})
    return {
        "desde_archivo": base["archivo"],
        "hasta_archivo": comp["archivo"],
        "desde_etapa": base["etapa_sugerida"],
        "hasta_etapa": comp["etapa_sugerida"],
        "delta_score_depurado": diff_num(
            comp.get("score_depurado"), base.get("score_depurado")
        ),
        "delta_tiempo_seg": diff_num(
            comp.get("exercise_duration_seg"), base.get("exercise_duration_seg")
        ),
        "delta_colisiones": diff_num(comp.get("n_colisiones"), base.get("n_colisiones")),
        "delta_curvas": {
            "steering_serrucho_index": diff_num(
                tc.get("steering_serrucho_index"), tb.get("steering_serrucho_index")
            ),
            "speed_max_estimada_kmh": diff_num(
                tc.get("speed_max_estimada_kmh"), tb.get("speed_max_estimada_kmh")
            ),
            "frenadas_panico_count": diff_num(
                tc.get("frenadas_panico_count"), tb.get("frenadas_panico_count")
            ),
            "accel_pad_fondo_pct": diff_num(
                tc.get("accel_pad_fondo_pct"), tb.get("accel_pad_fondo_pct")
            ),
            "fork_height_max_m": diff_num(
                tc.get("fork_height_max_m"), tb.get("fork_height_max_m")
            ),
            "tilt_inestabilidad_index": diff_num(
                tc.get("tilt_inestabilidad_index"), tb.get("tilt_inestabilidad_index")
            ),
        },
        "evolucion_perfil": (
            f"{base.get('perfil_operador')} -> {comp.get('perfil_operador')}"
        ),
    }


def es_medium_load_operation(exercise_name):
    """Determina si el ejercicio corresponde al estandar Medium Load Operation."""
    norm = " ".join(str(exercise_name or "").strip().lower().split())
    return norm == "medium load operation"


def calcular_indice_cuidado_mecanico(rep):
    """Replica el Indice de Cuidado Mecanico (0-100%) de analitica-predictiva.ts."""
    tel = rep.get("telemetria") or {}
    console = rep.get("console_events") or {}
    frenadas = max(0, float(tel.get("frenadas_panico_count") or 0))
    serrucho = max(0, float(tel.get("steering_serrucho_index") or 0))
    volantazos = max(0, float(tel.get("steering_volantazos_extremos") or 0))
    horquilla_pct = max(0, float(tel.get("fork_height_elevada_pct") or 0))
    osc_tilt = max(0, float(tel.get("tilt_oscilaciones_count") or 0))
    colisiones = max(0, float(rep.get("n_colisiones") or 0))
    sats = max(0, float((console.get("saturaciones_palancas") or {}).get("total") or 0))

    pen_frenos = min(24.0, frenadas * 3.0)
    pen_dir = min(28.0, min(18.0, max(0.0, (serrucho - 0.8) * 6.0)) + min(20.0, volantazos * 3.0))
    pen_hid = min(28.0, min(16.0, sats * 2.0) + min(15.0, (horquilla_pct / 100.0) * 25.0) + min(10.0, osc_tilt * 2.0))
    pen_col = min(36.0, colisiones * 12.0)
    return int(round(max(0.0, min(100.0, 100.0 - pen_frenos - pen_dir - pen_hid - pen_col))))


def agrupar_y_clasificar_lote(resultados, postulantes_db):
    """Agrupa cronologicamente por alumno, filtra abortados/duplicados y calcula deltas."""
    grupos = {}
    for r in resultados:
        clave = (
            clave_normalizada_ascii(r.get("student_name")),
            (r.get("student_id") or "").lower(),
        )
        grupos.setdefault(clave, []).append(r)

    resumen_alumnos = []
    filtrados_abortados = 0
    filtrados_duplicados = 0

    for clave, items in sorted(grupos.items(), key=lambda kv: kv[1][0]["student_name"]):
        items.sort(
            key=lambda x: (
                x.get("exercise_start_time_iso") or "9999-99-99T99:99:99",
                x["archivo"],
            )
        )

        vistos = {}
        validos = []
        for it in items:
            if it["intento_abortado"]:
                it["etapa_sugerida"] = "INTENTO_ABORTADO"
                filtrados_abortados += 1
                continue
            firma = (
                it.get("exercise_start_time_iso"),
                it.get("exercise_duration_seg"),
                it.get("score_raw"),
            )
            if it.get("exercise_start_time_iso") and firma in vistos:
                it["duplicado_de"] = vistos[firma]
                it["etapa_sugerida"] = "DUPLICADO"
                filtrados_duplicados += 1
                continue
            if it.get("exercise_start_time_iso"):
                vistos[firma] = it["archivo"]
            validos.append(it)

        medium_load = []
        intermedias = []
        for it in validos:
            it["indice_cuidado_mecanico"] = calcular_indice_cuidado_mecanico(it)
            if es_medium_load_operation(it.get("exercise_name")):
                medium_load.append(it)
            else:
                it["etapa_sugerida"] = "PRACTICA_INTERMEDIA"
                intermedias.append(it)

        fecha_diag = None
        if medium_load:
            fecha_diag = medium_load[0].get("fecha_calendario") or "SIN_FECHA"

        primer_dia = []
        dias_posteriores = []
        for it in medium_load:
            f_cal = it.get("fecha_calendario") or "SIN_FECHA"
            if f_cal == fecha_diag:
                it["etapa_sugerida"] = (
                    "DIAG_INTENTO_1" if len(primer_dia) == 0 else "DIAG_INTENTO_2"
                )
                primer_dia.append(it)
            else:
                it["etapa_sugerida"] = "FINAL"
                dias_posteriores.append(it)

        mejor_t0 = None
        if primer_dia:
            mejor_t0 = min(
                primer_dia,
                key=lambda x: (
                    -(x.get("score_depurado") if x.get("score_depurado") is not None else -999),
                    x.get("n_colisiones", 999),
                    x.get("exercise_duration_seg") or 999999,
                ),
            )
            mejor_t0["es_mejor_diagnostico"] = True

        # Deltas V1->V2 y T0->T1 calculados EXCLUSIVAMENTE sobre Medium Load Operation
        delta_v1_v2 = None
        if len(primer_dia) >= 2:
            delta_v1_v2 = calcular_delta_par(primer_dia[0], primer_dia[-1])

        delta_t0_t1 = None
        if mejor_t0 and dias_posteriores:
            ultimo_final = dias_posteriores[-1]
            delta_t0_t1 = calcular_delta_par(mejor_t0, ultimo_final)

        nombre_display = items[0]["student_name"]
        match_db = buscar_postulante_match(nombre_display, postulantes_db)

        resumen_alumnos.append(
            {
                "student_name": nombre_display,
                "student_id": items[0].get("student_id"),
                "match_postulante": match_db,
                "total_pdfs": len(items),
                "validos": len(validos),
                "practicas_intermedias": len(intermedias),
                "fechas": sorted(
                    {
                        (x.get("exercise_start_time_iso") or x.get("exercise_start_time") or "N/D")
                        for x in validos
                    }
                ),
                "etapas": [x["etapa_sugerida"] for x in items],
                "perfiles": [x["perfil_operador"] for x in medium_load],
                "delta_v1_v2": delta_v1_v2,
                "delta_t0_t1": delta_t0_t1,
            }
        )

    return resumen_alumnos, filtrados_abortados, filtrados_duplicados


def cargar_postulantes_supabase():
    env_path = os.path.join(REPO_ROOT, ".env.local")
    if not os.path.exists(env_path):
        return []
    env = {}
    with open(env_path, encoding="utf-8") as fh:
        for line in fh:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k.strip()] = v.strip()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        return []
    try:
        req = urllib.request.Request(
            f"{url}/rest/v1/postulantes?select=id,nombre_completo,dni,origen_turno",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"[AVISO] No se pudo consultar Supabase postulantes: {exc}", file=sys.stderr)
        return []


def main():
    parser = argparse.ArgumentParser(description="Motor Titán PDF Batch & Dry-Run")
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_JSON)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo lectura y reporte en consola; no sobreescribe JSON ni escribe en Supabase.",
    )
    args = parser.parse_args()

    if not os.path.isdir(args.input_dir):
        print(f"[ERROR] No existe la carpeta de entrada: {args.input_dir}", file=sys.stderr)
        sys.exit(1)

    pdfs = sorted(
        os.path.join(r, f)
        for r, _, fs in os.walk(args.input_dir)
        for f in fs
        if f.lower().endswith(".pdf")
    )

    resultados = []
    fallos = []
    for ruta in pdfs:
        try:
            resultados.append(procesar_pdf(ruta, root_dir=args.input_dir))
        except Exception as e:  # noqa: BLE001
            fallos.append((os.path.relpath(ruta, args.input_dir), repr(e)))

    postulantes_db = cargar_postulantes_supabase()
    resumen_alumnos, n_abortados, n_duplicados = agrupar_y_clasificar_lote(
        resultados, postulantes_db
    )

    validos_count = len(resultados) - n_abortados - n_duplicados
    con_match = sum(1 for a in resumen_alumnos if a["match_postulante"] is not None)
    con_delta_v1_v2 = [a for a in resumen_alumnos if a["delta_v1_v2"] is not None]
    con_delta_t0_t1 = [a for a in resumen_alumnos if a["delta_t0_t1"] is not None]

    print("=" * 96)
    print("PREVISUALIZACION (DRY-RUN) · LOTE REPORTES PDF SIMULADOR")
    print("=" * 96)
    print(f"Carpeta origen                  : {args.input_dir}")
    print(f"Total PDFs leidos               : {len(pdfs)} (fallos lectura: {len(fallos)})")
    print(f"Intentos validos                : {validos_count}")
    print(f"Filtrados (<60s / abortados)    : {n_abortados}")
    print(f"Filtrados (duplicados exactos)  : {n_duplicados}")
    print(f"Alumnos unicos detectados       : {len(resumen_alumnos)}")
    print(f"Coincidencias con postulantes DB: {con_match} / {len(postulantes_db)} en Supabase")
    print(f"Alumnos con Delta V1->V2 (dia 1): {len(con_delta_v1_v2)}")
    print(f"Alumnos con Delta T0->T1 (final): {len(con_delta_t0_t1)}")

    for f, err in fallos[:10]:
        print(f"  [FALLA] {f}: {err}")

    print("\n--- TABLA DE ALUMNOS ---")
    for a in resumen_alumnos:
        match_txt = (
            f"MATCH DB -> {a['match_postulante']['nombre_completo']} (DNI {a['match_postulante']['dni']})"
            if a["match_postulante"]
            else "SIN MATCH DB"
        )
        fechas_txt = ", ".join(a["fechas"]) if a["fechas"] else "N/D"
        etapas_txt = " | ".join(str(e) for e in a["etapas"])
        perfiles_txt = " -> ".join(a["perfiles"]) if a["perfiles"] else "N/A"
        print(
            f"* {a['student_name']} [id={a['student_id'] or '-'}] · {a['total_pdfs']} PDFs · {match_txt}\n"
            f"    Fechas  : {fechas_txt}\n"
            f"    Etapas  : {etapas_txt}\n"
            f"    Perfiles: {perfiles_txt}"
        )

    print("\n--- ALUMNOS CON DELTAS CALCULADOS ---")
    if not con_delta_v1_v2 and not con_delta_t0_t1:
        print("Ninguno.")
    for a in con_delta_t0_t1:
        d = a["delta_t0_t1"]
        print(
            f"[T0->T1 FINAL] {a['student_name']}: "
            f"dScore={d['delta_score_depurado']}, dTiempo={d['delta_tiempo_seg']}s, "
            f"dCol={d['delta_colisiones']}, perfil={d['evolucion_perfil']}, curvas={d['delta_curvas']}"
        )
    for a in con_delta_v1_v2:
        d = a["delta_v1_v2"]
        print(
            f"[V1->V2 MISMO DIA] {a['student_name']}: "
            f"dScore={d['delta_score_depurado']}, dTiempo={d['delta_tiempo_seg']}s, "
            f"dCol={d['delta_colisiones']}, perfil={d['evolucion_perfil']}, curvas={d['delta_curvas']}"
        )

    if not args.dry_run:
        with open(args.output, "w", encoding="utf-8") as fh:
            json.dump(resultados, fh, ensure_ascii=False, indent=2)
        print(f"\nJSON generado en: {args.output}")
    else:
        print("\n[DRY-RUN] Sin escritura en disco ni en Supabase.")


if __name__ == "__main__":
    main()
