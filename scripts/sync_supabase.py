"""Sincroniza la cohorte AUTO-2026-C1 y su telemetría con Supabase."""
import json
import os
import re
import subprocess
import sys
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

try:
    from dotenv import load_dotenv
    from supabase import create_client
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "supabase", "python-dotenv"])
    from dotenv import load_dotenv
    from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
CODIGO = "AUTO-2026-C1"
NOMINA = [
    (1, "Postulante Test 01", "20000001", "TM"),
    (2, "Postulante Test 02", "20000002", "TT"),
    (3, "Postulante Test 03", "20000003", "TT"),
    (4, "Postulante Test 04", "20000004", "TM"),
    (5, "Postulante Test 05", "20000005", "TM"),
    (6, "Postulante Test 06", "20000006", "TT"),
    (7, "Postulante Test 07", "20000007", "TT"),
    (8, "Postulante Test 08", "20000008", "TM"),
    (9, "Postulante Test 09", "20000009", "TT"),
    (10, "Postulante Test 10", "20000010", "TT"),
    (11, "Postulante Test 11", "20000011", "TT"),
    (12, "Postulante Test 12", "20000012", "TM"),
    (13, "Postulante Test 13", "20000013", "TT"),
    (14, "Postulante Test 14", "20000014", "TT"),
    (15, "Postulante Test 15", "20000015", "TT"),
    (16, "Postulante Test 16", "20000016", "TT"),
    (17, "Postulante Test 17", "20000017", "TM"),
    (18, "Postulante Test 18", "20000018", "TM"),
    (19, "Postulante Test 19", "20000019", "TM"),
    (20, "Postulante Test 20", "20000020", "TT"),
    (21, "Postulante Test 21", "20000021", "TT"),
    (22, "Postulante Test 22", "20000022", "TM"),
    (23, "Postulante Test 23", "20000023", "TM"),
    (24, "Postulante Test 24", "20000024", "TM"),
    (25, "Postulante Test 25", "20000025", "TM"),
    (26, "Postulante Test 26", "20000026", "TM"),
    (27, "Postulante Test 27", "20000027", "TM"),
    (28, "Postulante Test 28", "20000028", "TM"),
    (29, "Postulante Test 29", "20000029", "TM"),
    (30, "Postulante Test 30", "20000030", "TM"),
]
FRANJAS = [
    ("Mañana", "08:00 - 09:00", "08:00:00", "09:00:00"),
    ("Mañana", "09:00 - 10:00", "09:00:00", "10:00:00"),
    ("Mañana", "10:00 - 11:00", "10:00:00", "11:00:00"),
    ("Mañana", "11:00 - 12:00", "11:00:00", "12:00:00"),
    ("Tarde", "16:00 - 17:00", "16:00:00", "17:00:00"),
    ("Tarde", "17:00 - 18:00", "17:00:00", "18:00:00"),
    ("Tarde", "18:00 - 19:00", "18:00:00", "19:00:00"),
]
RIESGO = {"Mínima (Autónomo)": "MINIMA_AUTONOMO", "Media": "MEDIA", "Alta": "ALTA"}
DICTAMEN = {
    "Apto Directo": "APTO_DIRECTO",
    "Apto / Observación": "APTO_OBSERVACION",
    "No Apto": "NO_APTO",
    "Condicional": "CONDICIONAL",
}
MESES = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}
STOP = {"de", "del", "la", "el"}

# Etapas del flujo de doble pasada (migración 0008).
ETAPA_INTENTO_1 = "DIAG_INTENTO_1"
ETAPA_INTENTO_2 = "DIAG_INTENTO_2"
ETAPA_FINAL = "FINAL"

# Grafías de portada alternativas aceptadas por ranking, para apellidos que el
# umbral fuzzy no alcanza (OCR, apóstrofos raros u orden invertido). Cada alias
# se compara con el mismo compatible(); la normalización de tokens() YA neutraliza
# apóstrofes (' ’ ` ´) y acentos, así "O'Connell"/"O`Connell"/"O Connell" vinculan
# solos si el reporte existe.
#
# AUDITORÍA nov/2026 sobre el corpus real (71 PDF + 87 TraineeName de los 363
# metadatos de grabación): NO existe ningún reporte de #4 Robledo Daniel ni de
# #28 O`Connell Daniel bajo NINGUNA grafía. Ambos quedan legítimamente SIN
# TELEMETRÍA (el script nunca inventa datos). Cuando se incorpore su PDF, cargar
# acá la grafía exacta de portada, p.ej.: 4: ["Robledo Daniel E"], 28: ["OConnell"].
ALIASES = {}


class SyncError(Exception):
    pass


def tokens(texto):
    plano = unicodedata.normalize("NFKD", texto or "")
    plano = plano.encode("ascii", "ignore").decode().casefold()
    return [t for t in re.split(r"[^a-z0-9]+", plano) if len(t) > 2 and t not in STOP]


def compatible(oficial, reporte):
    base = tokens(oficial)
    candidatos = tokens(reporte)
    if not base or not candidatos:
        return False
    for t in candidatos:
        if max(SequenceMatcher(None, t, o).ratio() for o in base) < 0.72:
            return False
    return True


def fecha_reporte(rep):
    texto = rep.get("exercise_start_time") or ""
    m = re.search(r"(\d{1,2}) (\w+) (\d{4}) at (\d{1,2}):(\d{2}) (am|pm)", texto, re.I)
    if not m:
        return datetime.min
    dia, mes, anio, hora, minuto, ampm = m.groups()
    if mes.casefold() not in MESES:
        return datetime.min
    hora = int(hora) % 12 + (12 if ampm.casefold() == "pm" else 0)
    return datetime(int(anio), MESES[mes.casefold()], int(dia), hora, int(minuto))


def es_final(rep):
    """Un reporte es Prueba Final si su Exercise Name (o el nombre base del
    archivo, sin extensión) lo rotula. Se excluye la extensión para que
    '71.pdf' no calce por el substring '1f'."""
    nombre = rep.get("exercise_name") or ""
    if "final" in nombre.casefold():
        return True
    base = (rep.get("archivo") or "")
    return "final" in os.path.splitext(base)[0].casefold()


def vincular():
    """Agrupa TODOS los reportes de cada postulante de la nómina, ordenados
    cronológicamente por timestamp_inicio (ya no se descarta por max(fecha))."""
    with open(ROOT / "telemetria_cohortes.json", encoding="utf-8") as fh:
        reportes = json.load(fh)
    if not isinstance(reportes, list):
        raise SyncError("telemetria_cohortes.json debe contener una lista")
    links = []
    usados = []
    for ranking, nombre, dni, turno in NOMINA:
        aceptados = [nombre, *ALIASES.get(ranking, [])]
        candidatos = [r for r in reportes
                      if any(compatible(a, r.get("student_name")) for a in aceptados)]
        ordenados = sorted(candidatos, key=lambda r: (fecha_reporte(r), r.get("archivo") or ""))
        usados += [r.get("archivo") for r in ordenados]
        links.append({"ranking": ranking, "nombre": nombre, "dni": dni,
                      "turno": turno, "reportes": ordenados})
    if len(usados) != len(set(usados)):
        raise SyncError("Un mismo reporte quedó asignado a más de un postulante")
    return links


def plan_evaluaciones(links):
    """Asigna etapa a cada reporte (FINAL rotulado; el resto DIAG_INTENTO_1/2
    por orden cronológico), marca el mejor diagnóstico y calcula deltas.

    Criterio 'Mejor Diagnóstico' entre V1 y V2:
      1. menor colisiones reales; 2. empate -> menor serrucho; 3. empate ->
      menor duración. Con un único diagnóstico, ese resulta el mejor.
    Los deltas de INTENTO_2 se calculan contra INTENTO_1; los de FINAL contra
    el mejor diagnóstico.
    """
    plan = []
    for x in links:
        reps = x["reportes"]
        if not reps:
            continue
        finales = [r for r in reps if es_final(r)]
        diagnosticos = [r for r in reps if not es_final(r)]
        etapas = {}
        for i, r in enumerate(diagnosticos[:2]):
            etapas[r["archivo"]] = ETAPA_INTENTO_1 if i == 0 else ETAPA_INTENTO_2
        for r in finales[:1]:
            etapas[r["archivo"]] = ETAPA_FINAL
        if len(diagnosticos) > 2:
            print(f"AVISO: #{x['ranking']} {x['nombre']} tiene {len(diagnosticos)} "
                  f"diagnósticos; se toman los 2 más tempranos y el resto no se sincroniza.")

        base = {ETAPA_INTENTO_1: diagnosticos[0] if diagnosticos else None,
                ETAPA_INTENTO_2: diagnosticos[1] if len(diagnosticos) > 1 else None}
        vigentes = {k: v for k, v in base.items() if v}
        mejor_etapa = min(vigentes, key=lambda e: clave_mejor(vigentes[e])) if vigentes else None

        for archivo, etapa in etapas.items():
            rep = next(r for r in reps if r["archivo"] == archivo)
            ref = None
            if etapa == ETAPA_INTENTO_2:
                ref = base.get(ETAPA_INTENTO_1)
            elif etapa == ETAPA_FINAL and mejor_etapa:
                ref = base[mejor_etapa]
            plan.append({
                "dni": x["dni"],
                "rep": rep,
                "etapa": etapa,
                "es_mejor": etapa == mejor_etapa,
                "ref": ref,
            })
    return plan


def clave_mejor(rep):
    """Tupla de orden del 'Mejor Diagnóstico' (menor es mejor)."""
    san = rep.get("metricas_sanitizadas") or rep.get("telemetria") or {}
    colisiones = entero(rep.get("n_colisiones"), "n_colisiones") or 0
    serrucho = san.get("steering_serrucho_index")
    dur = entero(rep.get("exercise_duration_seg"), "exercise_duration_seg")
    return (colisiones,
            serrucho if serrucho is not None else float("inf"),
            dur if dur is not None else float("inf"))


def flotar(valor):
    if valor is None:
        return None
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def deltas(rep, ref):
    """Deltas del intento respecto de su referencia (rep - ref)."""
    if not ref:
        return {"delta_tiempo_seg": None, "delta_colisiones": None,
                "delta_score": None, "delta_serrucho": None}
    tel = rep.get("metricas_sanitizadas") or rep.get("telemetria") or {}
    tel_ref = ref.get("metricas_sanitizadas") or ref.get("telemetria") or {}

    def resta(a, b):
        return None if a is None or b is None else a - b

    delta_score = resta(flotar(rep.get("score")), flotar(ref.get("score")))
    delta_serrucho = resta(
        flotar(tel.get("steering_serrucho_index")),
        flotar(tel_ref.get("steering_serrucho_index")),
    )

    return {
        "delta_tiempo_seg": resta(entero(rep.get("exercise_duration_seg"), "t"),
                                  entero(ref.get("exercise_duration_seg"), "t")),
        "delta_colisiones": resta(entero(rep.get("n_colisiones"), "c"),
                                  entero(ref.get("n_colisiones"), "c")),
        "delta_score": round(delta_score, 2) if delta_score is not None else None,
        "delta_serrucho": round(delta_serrucho, 3) if delta_serrucho is not None else None,
    }


def entero(valor, campo):
    if valor is None:
        return None
    try:
        return int(valor)
    except (TypeError, ValueError) as exc:
        raise SyncError(f"{campo} debe ser entero o null") from exc


def evaluacion(postulante_id, rep, etapa, es_mejor, ref):
    archivo_fuente = (rep.get("archivo") or "").strip()
    if not archivo_fuente or archivo_fuente.upper().startswith("CABINA_TABLET"):
        raise SyncError(
            f"archivo_fuente inválido para telemetría TITAN: {archivo_fuente!r}"
        )
    tel = rep.get("metricas_sanitizadas") or rep.get("telemetria") or {}
    clasi = rep.get("clasificacion") or {}
    riesgo = clasi.get("riesgo")
    dictamen = clasi.get("aptitud")
    if riesgo not in RIESGO or dictamen not in DICTAMEN:
        raise SyncError(f"Clasificación inválida en {archivo_fuente}")
    try:
        score = round(float(rep["score"]), 2) if rep.get("score") is not None else None
    except (TypeError, ValueError) as exc:
        raise SyncError(f"Score inválido en {archivo_fuente}") from exc
    serrucho = tel.get("steering_serrucho_index")
    volantazos = tel.get("steering_volantazos_extremos")
    frenadas = tel.get("frenadas_panico_count")
    speed = tel.get("speed_max_estimada_kmh")
    mastil = [
        x["descripcion"] for x in rep.get("infracciones_conduccion", [])
        if "fork" in x.get("descripcion", "").casefold() or "mastil" in x.get("descripcion", "").casefold()
    ]
    payload = {
        "postulante_id": postulante_id,
        "asistencia_cabina": RIESGO[riesgo],
        "dictamen": DICTAMEN[dictamen],
        "eje_lateralidad": f"serrucho={serrucho}; volantazos_extremos={volantazos}",
        "eje_tacto_mandos": f"frenadas_panico={frenadas}; speed_max_estimada_kmh={speed}",
        "eje_mastil": "; ".join(mastil) or None,
        "eje_control_receptividad": None,
        "tiempo_vuelta_seg": entero(rep.get("exercise_duration_seg"), "exercise_duration_seg"),
        "colisiones": entero(rep.get("n_colisiones"), "n_colisiones") or 0,
        "score_puntos": score,
        "archivo_fuente": archivo_fuente,
        # Columnas multi-intento (migración 0008)
        "etapa": etapa,
        "es_mejor_diagnostico": es_mejor,
        "colisiones_descartadas": entero(
            rep.get("metricas_sanitizadas", {}).get("colisiones_descartadas")
            if rep.get("metricas_sanitizadas") else len(rep.get("descartes_sanitizados") or []),
            "colisiones_descartadas") or 0,
    }
    payload.update(deltas(rep, ref))
    return payload


def uno(res, descripcion):
    if not res.data:
        raise SyncError(f"No se pudo recuperar {descripcion}")
    return res.data[0]


def sincronizar(db, links):
    db.table("cohortes").upsert({
        "codigo": CODIGO,
        "nombre": "Autoelevador Nivel Inicial - Cohorte 1",
        "cant_dias_sim": 6,
        "max_titulares": 20,
        "estado": "activa",
    }, on_conflict="codigo").execute()
    cohorte = uno(db.table("cohortes").select("id").eq("codigo", CODIGO).limit(1).execute(), "la cohorte")
    cid = cohorte["id"]

    actuales = db.table("franjas_cabina").select(
        "turno,horario_label,hora_inicio,hora_fin"
    ).eq("cohorte_id", cid).execute().data or []
    existentes = {(x["turno"], x["horario_label"], x["hora_inicio"], x["hora_fin"]) for x in actuales}
    nuevas = [
        {"cohorte_id": cid, "turno": t, "horario_label": label,
         "hora_inicio": ini, "hora_fin": fin, "cupo_maximo": 3}
        for t, label, ini, fin in FRANJAS
        if (t, label, ini, fin) not in existentes
    ]
    if nuevas:
        db.table("franjas_cabina").insert(nuevas).execute()

    db.table("postulantes").upsert([
        {"dni": x["dni"], "nombre_completo": x["nombre"], "origen_turno": x["turno"]}
        for x in links
    ], on_conflict="dni").execute()
    dnis = [x["dni"] for x in links]
    filas = db.table("postulantes").select("id,dni").in_("dni", dnis).execute().data or []
    por_dni = {x["dni"]: x["id"] for x in filas}
    if len(por_dni) != 30:
        raise SyncError(f"Verificación de postulantes: {len(por_dni)}/30")

    db.table("cohorte_inscripciones").upsert([
        {"cohorte_id": cid, "postulante_id": por_dni[x["dni"]], "ranking_orden": x["ranking"]}
        for x in links
    ], on_conflict="cohorte_id,postulante_id").execute()

    plan = plan_evaluaciones(links)
    ids = sorted({por_dni[e["dni"]] for e in plan})
    if ids:
        # Idempotencia: apagar las banderas de mejor diagnóstico solo en filas
        # TITAN de los postulantes del lote ANTES de reescribir (no toca
        # evaluaciones de CABINA_TABLET*). Garantiza que uq_mejor_diagnostico_por_postulante
        # nunca observe dos TRUE en re-ejecuciones.
        db.table("evaluacion_diagnostico").update(
            {"es_mejor_diagnostico": False}
        ).in_("postulante_id", ids).not_.like(
            "archivo_fuente", "CABINA_TABLET%"
        ).execute()

    payloads = [
        evaluacion(por_dni[e["dni"]], e["rep"], e["etapa"], e["es_mejor"], e["ref"])
        for e in plan
    ]
    plan_claves = {(p["postulante_id"], p["archivo_fuente"]) for p in payloads}

    # UPSERT directo sobre la clave natural (postulante_id, archivo_fuente) de
    # `public.evaluacion_diagnostico` (migración 0008 uq_postulante_archivo).
    if payloads:
        db.table("evaluacion_diagnostico").upsert(
            payloads, on_conflict="postulante_id,archivo_fuente"
        ).execute()

    insc = db.table("cohorte_inscripciones").select(
        "postulante_id,ranking_orden"
    ).eq("cohorte_id", cid).execute().data or []
    if len(insc) != 30 or {x["ranking_orden"] for x in insc} != set(range(1, 31)):
        raise SyncError(f"Verificación de inscripciones: {len(insc)}/30")
    franjas = db.table("franjas_cabina").select("id").eq("cohorte_id", cid).execute().data or []
    if len(franjas) != 7:
        raise SyncError(f"Verificación de franjas: {len(franjas)}/7")
    evals = db.table("evaluacion_diagnostico").select(
        "postulante_id,archivo_fuente"
    ).in_("postulante_id", ids).execute().data or [] if ids else []
    presentes = {(x["postulante_id"], x["archivo_fuente"]) for x in evals}
    esperadas = plan_claves
    if not esperadas.issubset(presentes):
        raise SyncError(f"Verificación de evaluaciones: {len(presentes & esperadas)}/{len(esperadas)}")
    por_etapa = {}
    for e in plan:
        por_etapa[e["etapa"]] = por_etapa.get(e["etapa"], 0) + 1
    return {"cohorte": cid, "franjas": len(franjas), "postulantes": len(por_dni),
            "inscripciones": len(insc), "evaluaciones": len(esperadas),
            "por_etapa": por_etapa,
            "mejores": sum(1 for e in plan if e["es_mejor"])}


def cliente():
    load_dotenv(ROOT / ".env.local")
    url = (os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip().rstrip("/")
    url = re.sub(r"/rest/v1$", "", url)
    service = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    anon = (os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or "").strip()
    key = service or anon
    if not url.startswith("https://") or not key:
        raise SyncError("Faltan NEXT_PUBLIC_SUPABASE_URL y una clave Supabase válida")
    if not service:
        print("ADVERTENCIA: usando clave anon; RLS puede exigir SUPABASE_SERVICE_ROLE_KEY.")
    return create_client(url, key)


def main():
    links = vincular()
    con_rep = [x for x in links if x["reportes"]]
    sin_rep = [x for x in links if not x["reportes"]]
    if "--dry-run" in sys.argv:
        plan = plan_evaluaciones(links)
        for x in links:
            if not x["reportes"]:
                print(f"#{x['ranking']:02d} {x['nombre']} -> SIN REPORTE IDENTIFICABLE")
                continue
            entradas = [e for e in plan if e["dni"] == x["dni"]]
            detalle = ", ".join(
                f"{e['etapa']}={e['rep']['archivo']}" + ("*" if e["es_mejor"] else "")
                for e in sorted(entradas, key=lambda e: e["etapa"]))
            print(f"#{x['ranking']:02d} {x['nombre']} -> {detalle}")
        etapas = {}
        for e in plan:
            etapas[e["etapa"]] = etapas.get(e["etapa"], 0) + 1
        print(f"RESUMEN: {len(con_rep)} postulantes con telemetría, "
              f"{len(sin_rep)} sin telemetría, {len(plan)} evaluaciones {etapas}")
        print("(*) = es_mejor_diagnostico")
        return
    res = sincronizar(cliente(), links)
    print("=" * 58)
    print(f"Cohorte activa: {CODIGO}")
    print(f"Franjas verificadas: {res['franjas']}/7")
    print(f"Postulantes cargados: {res['postulantes']}/30")
    print(f"Inscripciones enlazadas (ranking 1-30): {res['inscripciones']}/30")
    print(f"Evaluaciones sincronizadas: {res['evaluaciones']} {res['por_etapa']}")
    print(f"Marcadas como mejor diagnóstico: {res['mejores']}")
    for x in sin_rep:
        print(f"SIN TELEMETRÍA: #{x['ranking']} {x['nombre']} (DNI {x['dni']})")
    print("=" * 58)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        detalle = str(exc).casefold()
        if "row-level security" in detalle or "permission denied" in detalle:
            print("La ingesta requiere SUPABASE_SERVICE_ROLE_KEY en .env.local.", file=sys.stderr)
        elif "could not find" in detalle or "pgrst" in detalle:
            print("Aplicá primero supabase/migrations/0005_gestion_empleo_sheets.sql "
                  "y 0008_evaluacion_multi_intento.sql.", file=sys.stderr)
        elif "23505" in detalle or "uq_postulante_archivo" in detalle:
            print("Quedó más de una fila por (postulante_id, archivo_fuente): "
                  "deduplicá antes de aplicar 0008.", file=sys.stderr)
        sys.exit(1)
