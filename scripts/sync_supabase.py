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
    (1, "Alvarez Franco", "35470555", "TM"),
    (2, "Cococcioni Alejandro", "37813869", "TT"),
    (3, "Cornejo Alejandro Martin", "35031746", "TT"),
    (4, "Robledo Daniel", "45653916", "TM"),
    (5, "Jaime Mario Alberto", "40450534", "TM"),
    (6, "Gomez Alejandro Omar", "41056629", "TT"),
    (7, "Oharriz Prevosto Juan Martin", "40313411", "TT"),
    (8, "Juarez Nicolas", "37813997", "TM"),
    (9, "Greco Agustin", "41407606", "TT"),
    (10, "Fernandez Cristian", "37814369", "TT"),
    (11, "Ponce Agustin", "46538801", "TT"),
    (12, "Brajuscovich Marcela", "36038267", "TM"),
    (13, "Fernandez de la Cruz Gianfranco", "94994565", "TT"),
    (14, "Roca Erica Soledad", "39175533", "TT"),
    (15, "Guzman Gustavo Nazareno", "28859579", "TT"),
    (16, "Medero Facundo", "33581322", "TT"),
    (17, "Velez Maximiliano", "34311440", "TM"),
    (18, "Garcia Kevin", "47290210", "TM"),
    (19, "Machado Gustavo", "37814447", "TM"),
    (20, "Bonacorsi Carlos", "37813469", "TT"),
    (21, "Diaz Lautaro Ruben", "36895258", "TT"),
    (22, "Lopez Matias Daniel", "43238474", "TM"),
    (23, "Compañuchi Giuliano", "47584377", "TM"),
    (24, "Ludueña Alejandra", "40785955", "TM"),
    (25, "Britos Federico", "46298020", "TM"),
    (26, "Barrionuevo Lucio Gabriel", "45410154", "TM"),
    (27, "Fernandez Fabio", "37097518", "TM"),
    (28, "O`Connell Daniel", "32542983", "TM"),
    (29, "Castillo Santiago", "45827958", "TM"),
    (30, "Galarza Dandrea Micaela", "33833341", "TM"),
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


def vincular():
    with open(ROOT / "telemetria_cohortes.json", encoding="utf-8") as fh:
        reportes = json.load(fh)
    if not isinstance(reportes, list):
        raise SyncError("telemetria_cohortes.json debe contener una lista")
    links = []
    for ranking, nombre, dni, turno in NOMINA:
        candidatos = [r for r in reportes if compatible(nombre, r.get("student_name"))]
        elegido = max(candidatos, key=lambda r: (fecha_reporte(r), r.get("archivo") or ""), default=None)
        links.append({"ranking": ranking, "nombre": nombre, "dni": dni, "turno": turno, "rep": elegido})
    usados = [x["rep"]["archivo"] for x in links if x["rep"]]
    if len(usados) != len(set(usados)):
        raise SyncError("Un mismo reporte quedó asignado a más de un postulante")
    return links


def entero(valor, campo):
    if valor is None:
        return None
    try:
        return int(valor)
    except (TypeError, ValueError) as exc:
        raise SyncError(f"{campo} debe ser entero o null") from exc


def evaluacion(postulante_id, rep):
    tel = rep.get("telemetria") or {}
    clasi = rep.get("clasificacion") or {}
    riesgo = clasi.get("riesgo")
    dictamen = clasi.get("aptitud")
    if riesgo not in RIESGO or dictamen not in DICTAMEN:
        raise SyncError(f"Clasificación inválida en {rep.get('archivo')}")
    try:
        score = round(float(rep["score"]), 2) if rep.get("score") is not None else None
    except (TypeError, ValueError) as exc:
        raise SyncError(f"Score inválido en {rep.get('archivo')}") from exc
    serrucho = tel.get("steering_serrucho_index")
    volantazos = tel.get("steering_volantazos_extremos")
    frenadas = tel.get("frenadas_panico_count")
    speed = tel.get("speed_max_estimada_kmh")
    mastil = [
        x["descripcion"] for x in rep.get("infracciones_conduccion", [])
        if "fork" in x.get("descripcion", "").casefold() or "mastil" in x.get("descripcion", "").casefold()
    ]
    return {
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
        "archivo_fuente": rep.get("archivo"),
    }


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

    con_rep = [x for x in links if x["rep"]]
    ids = [por_dni[x["dni"]] for x in con_rep]
    previas = []
    if ids:
        previas = db.table("evaluacion_diagnostico").select(
            "id,postulante_id,archivo_fuente"
        ).in_("postulante_id", ids).execute().data or []
    por_fuente = {(x["postulante_id"], x["archivo_fuente"]): x["id"] for x in previas}
    inserts, updates = [], []
    for x in con_rep:
        payload = evaluacion(por_dni[x["dni"]], x["rep"])
        clave = (payload["postulante_id"], payload["archivo_fuente"])
        if clave in por_fuente:
            updates.append({"id": por_fuente[clave], **payload})
        else:
            inserts.append(payload)
    if inserts:
        db.table("evaluacion_diagnostico").insert(inserts).execute()
    if updates:
        db.table("evaluacion_diagnostico").upsert(updates, on_conflict="id").execute()

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
    esperadas = {(por_dni[x["dni"]], x["rep"]["archivo"]) for x in con_rep}
    if not esperadas.issubset(presentes):
        raise SyncError(f"Verificación de evaluaciones: {len(presentes & esperadas)}/{len(esperadas)}")
    return {"cohorte": cid, "franjas": len(franjas), "postulantes": len(por_dni),
            "inscripciones": len(insc), "evaluaciones": len(esperadas)}


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
    con_rep = [x for x in links if x["rep"]]
    sin_rep = [x for x in links if not x["rep"]]
    if "--dry-run" in sys.argv:
        for x in links:
            destino = x["rep"]["archivo"] if x["rep"] else "SIN REPORTE IDENTIFICABLE"
            print(f"#{x['ranking']:02d} {x['nombre']} -> {destino}")
        print(f"RESUMEN: {len(con_rep)} con telemetría, {len(sin_rep)} sin telemetría")
        return
    res = sincronizar(cliente(), links)
    print("=" * 58)
    print(f"Cohorte activa: {CODIGO}")
    print(f"Franjas verificadas: {res['franjas']}/7")
    print(f"Postulantes cargados: {res['postulantes']}/30")
    print(f"Inscripciones enlazadas (ranking 1-30): {res['inscripciones']}/30")
    print(f"Evaluaciones con telemetría: {res['evaluaciones']}/{len(con_rep)}")
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
            print("Aplicá primero supabase/migrations/0005_gestion_empleo_sheets.sql.", file=sys.stderr)
        sys.exit(1)
