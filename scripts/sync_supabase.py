"""Sincroniza el lote real de PDFs del simulador Titán con Supabase Cloud."""
import argparse
import os
import re
import sys
import unicodedata
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import parse_simuladores as ps  # noqa: E402

CODIGO_COHORTE_DEFECTO = "AUTO-2026-C1"
DEFAULT_INPUT_DIR = r"D:\descargas google\Reportes diagnostico nov"

RIESGO = {
    "Mínima (Autónomo)": "MINIMA_AUTONOMO",
    "Media": "MEDIA",
    "Alta": "ALTA",
}
DICTAMEN = {
    "Apto Directo": "APTO_DIRECTO",
    "Apto / Observación": "APTO_OBSERVACION",
    "No Apto": "NO_APTO",
    "Condicional": "CONDICIONAL",
}

RECETA_POR_PERFIL = {
    "NOVATO": {
        "horas": 8.0,
        "modulos": [
            "Familiarización integral de mandos, pedales y ergonomía de cabina",
            "Circuitos básicos de avance, detención controlada y marcha atrás sin carga",
            "Procedimiento guiado de horquillas e inclinación de mástil paso a paso",
        ],
    },
    "SIN_NOCION_ESPACIO": {
        "horas": 8.0,
        "modulos": [
            "Geometría de giro con dirección trasera (barrido de contrapeso)",
            "Circulación y giro en pasillos estrechos con referencias visuales/espejos",
            "Control de cota segura de horquillas e inclinación de mástil con pallet",
        ],
    },
    "APURADO": {
        "horas": 6.0,
        "modulos": [
            "Control progresivo de acelerador y velocidad máxima en depósito",
            "Anticipación de frenado y reducción de volantazos en aproximación a racks",
            "Maniobras de estiba cadenciadas con verificación previa de entorno",
        ],
    },
    "INEFICIENTE": {
        "horas": 7.0,
        "modulos": [
            "Fluidez operativa y encadenamiento continuo de toma, traslado y descarga",
            "Reducción de tiempos muertos con seguridad e independencia de guía verbal",
            "Práctica cronometrada Split 30/30 orientada a ritmo estándar de planta",
        ],
    },
    "EFICIENTE": {
        "horas": 4.0,
        "modulos": [
            "Consolidación operativa en estiba multinivel y rampas con carga completa",
            "Evaluación integradora final orientada a pase directo a máquina real",
        ],
    },
}


class SyncError(Exception):
    pass


def es_registro_test(rep: dict) -> bool:
    """Excluye reportes de prueba (`Test [id=Test]`)."""
    nombre = ps.clave_normalizada_ascii(rep.get("student_name") or "")
    sid = str(rep.get("student_id") or "").strip().casefold()
    return nombre == "test" or sid == "test"


def dni_sintetico_para(student_id: str | None, nombre: str) -> str:
    """Genera un identificador único determinista para altas sin DNI en portada."""
    sid_limpio = re.sub(r"[^A-Za-z0-9]+", "", str(student_id or "").strip())
    if sid_limpio:
        return f"SIM-ID-{sid_limpio.zfill(3)}"
    slug = re.sub(r"[^a-z0-9]+", "", ps.clave_normalizada_ascii(nombre))[:10]
    return f"SIM-{slug.upper() or 'SINID'}"


def cliente_supabase():
    load_dotenv(ROOT / ".env.local")
    url = (os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip().rstrip("/")
    url = re.sub(r"/rest/v1$", "", url)
    service = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    anon = (os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or "").strip()
    key = service or anon
    if not url.startswith("https://") or not key:
        raise SyncError("Faltan NEXT_PUBLIC_SUPABASE_URL y una clave Supabase válida.")
    if not service:
        raise SyncError("La sincronización real requiere SUPABASE_SERVICE_ROLE_KEY en .env.local.")
    return create_client(url, key)


def obtener_cohorte_activa(db) -> dict:
    res = (
        db.table("cohortes")
        .select("id,codigo,nombre,estado")
        .eq("estado", "activa")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not res:
        res = (
            db.table("cohortes")
            .select("id,codigo,nombre,estado")
            .eq("codigo", CODIGO_COHORTE_DEFECTO)
            .limit(1)
            .execute()
            .data
            or []
        )
    if not res:
        raise SyncError("No se encontró ninguna cohorte activa en Supabase.")
    return res[0]


def construir_infracciones_consola(rep: dict) -> list[dict]:
    """Combina conducción del log + eventos críticos de consola (cinturón/palancas)."""
    salida = [
        {
            "timestamp": inf.get("timestamp"),
            "descripcion": inf.get("descripcion") or "",
            "tipo": "Driving",
        }
        for inf in (rep.get("infracciones_conduccion") or [])
        if inf.get("descripcion")
    ]
    console = rep.get("console_events") or {}
    for ev in console.get("desconexiones_cinturon_detalle") or []:
        salida.append(
            {
                "timestamp": ev.get("timestamp"),
                "descripcion": "Desconexión de cinturón de seguridad en movimiento (Seat Belt OFF)",
                "tipo": "DESCONEXION_CINTURON_MOVIMIENTO",
            }
        )
    sats = console.get("saturaciones_palancas") or {}
    if (sats.get("total") or 0) > 0:
        salida.append(
            {
                "timestamp": None,
                "descripcion": (
                    f"Saturaciones máximas de palanca hidráulica: total={sats.get('total', 0)} "
                    f"(Up/Down={sats.get('fork_up_down', 0)}, "
                    f"Tilt={sats.get('fork_tilt', 0)}, "
                    f"Left/Right={sats.get('fork_left_right', 0)})"
                ),
                "tipo": "SATURACION_PALANCA",
            }
        )
    return salida


def construir_metricas_camel(rep: dict) -> dict:
    """Genera el objeto `MetricasSimulador` compatible 1:1 con TypeScript."""
    tel = rep.get("telemetria") or {}
    clasi = rep.get("clasificacion") or {}
    colisiones_det = [
        {
            "timestamp": c.get("timestamp"),
            "descripcion": c.get("descripcion") or "",
            "tipo": "Collision",
        }
        for c in (rep.get("colisiones") or [])
    ]
    descartes_det = [
        {
            "timestamp": d.get("timestamp"),
            "descripcion": d.get("descripcion") or "",
            "tipo": "ARTEFACTO_SUELO",
        }
        for d in (rep.get("descartes_sanitizados") or [])
    ]
    infracciones = construir_infracciones_consola(rep)

    hallazgos_mastil = []
    vistos_mastil = set()
    for ev in colisiones_det + infracciones:
        desc = ev.get("descripcion") or ""
        if re.search(r"fork|mastil|mástil|tilt|pallet", desc, re.I) and desc not in vistos_mastil:
            vistos_mastil.add(desc)
            hallazgos_mastil.append(desc)
        if len(hallazgos_mastil) >= 8:
            break

    return {
        "archivoFuente": rep.get("archivo"),
        "studentName": rep.get("student_name"),
        "studentId": rep.get("student_id"),
        "exerciseName": rep.get("exercise_name"),
        "exerciseStartTime": rep.get("exercise_start_time_iso") or rep.get("exercise_start_time"),
        "scorePuntos": rep.get("score_depurado"),
        "tiempoDuracionSeg": rep.get("exercise_duration_seg"),
        "colisionesReales": int(rep.get("n_colisiones") or 0),
        "colisionesDescartadas": len(descartes_det),
        "colisionesDetalle": colisiones_det,
        "descartesDetalle": descartes_det,
        "infraccionesConduccion": infracciones,
        "indiceSerrucho": tel.get("steering_serrucho_index"),
        "volantazosExtremos": tel.get("steering_volantazos_extremos"),
        "velocidadMaxKmh": tel.get("speed_max_estimada_kmh"),
        "frenadasPanico": tel.get("frenadas_panico_count"),
        "picosAceleracion": tel.get("accel_pad_picos_count"),
        "porcentajeAceleradorFondo": tel.get("accel_pad_fondo_pct"),
        "muestrasHorquillaElevada": tel.get("fork_height_muestras_elevadas"),
        "porcentajeCirculacionHorquillaAlta": tel.get("fork_height_elevada_pct"),
        "alturaMaximaHorquillaM": tel.get("fork_height_max_m"),
        "oscilacionesMastil": tel.get("tilt_oscilaciones_count"),
        "indiceInestabilidadTilt": tel.get("tilt_inestabilidad_index"),
        "clasificacionRiesgo": clasi.get("riesgo"),
        "clasificacionAptitud": clasi.get("aptitud"),
        "hallazgosMastil": hallazgos_mastil,
        "alertaFalsoPositivoSuelo": len(descartes_det) > 0,
    }


def deltas_payload(rep: dict, ref: dict | None) -> dict:
    if not ref:
        return {
            "delta_tiempo_seg": None,
            "delta_colisiones": None,
            "delta_score": None,
            "delta_serrucho": None,
        }
    tel = rep.get("telemetria") or {}
    tel_ref = ref.get("telemetria") or {}

    def diff_int(a, b):
        return None if a is None or b is None else int(a) - int(b)

    def diff_flt(a, b, dec):
        return None if a is None or b is None else round(float(a) - float(b), dec)

    return {
        "delta_tiempo_seg": diff_int(
            rep.get("exercise_duration_seg"), ref.get("exercise_duration_seg")
        ),
        "delta_colisiones": diff_int(rep.get("n_colisiones"), ref.get("n_colisiones")),
        "delta_score": diff_flt(rep.get("score_depurado"), ref.get("score_depurado"), 2),
        "delta_serrucho": diff_flt(
            tel.get("steering_serrucho_index"), tel_ref.get("steering_serrucho_index"), 3
        ),
    }


def construir_evaluacion_row(postulante_id: str, rep: dict, etapa: str, es_mejor: bool, ref: dict | None) -> dict:
    tel = rep.get("telemetria") or {}
    clasi = rep.get("clasificacion") or {}
    riesgo = clasi.get("riesgo")
    dictamen = clasi.get("aptitud")
    if riesgo not in RIESGO or dictamen not in DICTAMEN:
        raise SyncError(f"Clasificación inválida en {rep.get('archivo')}")

    perfil = rep.get("perfil_operador") or "INEFICIENTE"
    receta = RECETA_POR_PERFIL.get(perfil, RECETA_POR_PERFIL["INEFICIENTE"])
    console = rep.get("console_events") or {}
    cinturon_mov = int(console.get("desconexiones_cinturon_movimiento") or 0)
    sats_total = (console.get("saturaciones_palancas") or {}).get("total", 0)
    prechecks = int(rep.get("n_prechecks_violation") or 0)

    metricas_camel = construir_metricas_camel(rep)
    mastil_desc = [
        ev["descripcion"]
        for ev in metricas_camel["infraccionesConduccion"]
        if re.search(r"fork|mastil|mástil|tilt", ev.get("descripcion", ""), re.I)
    ]

    archivo_fuente = (rep.get("archivo") or "").strip()
    if not archivo_fuente or archivo_fuente.upper().startswith("CABINA_TABLET"):
        raise SyncError(f"archivo_fuente inválido para telemetría TITAN: {archivo_fuente!r}")

    payload = {
        "postulante_id": postulante_id,
        "asistencia_cabina": RIESGO[riesgo],
        "dictamen": DICTAMEN[dictamen],
        "eje_lateralidad": (
            f"serrucho={tel.get('steering_serrucho_index')}; "
            f"volantazos_extremos={tel.get('steering_volantazos_extremos')}"
        ),
        "eje_tacto_mandos": (
            f"frenadas_panico={tel.get('frenadas_panico_count')}; "
            f"speed_max_estimada_kmh={tel.get('speed_max_estimada_kmh')}; "
            f"accel_fondo_pct={tel.get('accel_pad_fondo_pct')}"
        ),
        "eje_mastil": "; ".join(mastil_desc[:5]) or None,
        "eje_control_receptividad": (
            f"prechecks={prechecks}; cinturon_mov_off={cinturon_mov}; "
            f"palancas_saturadas={sats_total}"
        ),
        "tiempo_vuelta_seg": rep.get("exercise_duration_seg"),
        "colisiones": int(rep.get("n_colisiones") or 0),
        "score_puntos": rep.get("score_depurado"),
        "archivo_fuente": archivo_fuente,
        "etapa": etapa,
        "es_mejor_diagnostico": bool(es_mejor),
        "colisiones_descartadas": len(rep.get("descartes_sanitizados") or []),
        "telemetria_archivo_nombre": archivo_fuente,
        "telemetria_metricas": metricas_camel,
        "perfil_operador": perfil,
        "horas_recomendadas": receta["horas"],
        "modulos_recomendados": receta["modulos"],
    }
    payload.update(deltas_payload(rep, ref))
    return payload


def resolver_o_crear_postulante(db, cohorte_id: str, grupo_items: list[dict], postulantes_db: list[dict], next_ranking: list[int]) -> tuple[dict, bool]:
    """Busca postulante existente sin fusionar casos homónimos/similares; crea si falta."""
    nombre_portada = ps.normalizar_nombre_alumno(grupo_items[0].get("student_name"))
    sid = grupo_items[0].get("student_id")
    dni_cand = dni_sintetico_para(sid, nombre_portada)

    # 1. Buscar primero por DNI sintético exacto si ya se creó en una corrida previa
    for p in postulantes_db:
        if p.get("dni") == dni_cand:
            return p, False

    # 2. Match exacto o fuzzy SOLO contra postulantes con DNI real de nómina
    #    (evita fusionar personas nuevas distintas como Acosta Joana vs Acosta Juana)
    candidatos_nomina = [
        p for p in postulantes_db if not str(p.get("dni") or "").startswith("SIM-ID-")
    ]
    match = ps.buscar_postulante_match(nombre_portada, candidatos_nomina)
    if match:
        return match, False

    # 3. Alta nueva en public.postulantes + inscripción en cohorte activa
    creado = (
        db.table("postulantes")
        .insert(
            {
                "nombre_completo": nombre_portada,
                "dni": dni_cand,
                "origen_turno": "INDEFINIDO",
            }
        )
        .execute()
        .data
    )
    if not creado:
        raise SyncError(f"No se pudo crear postulante para {nombre_portada} ({dni_cand})")
    nuevo_p = creado[0]
    postulantes_db.append(nuevo_p)

    ranking = next_ranking[0]
    next_ranking[0] += 1
    db.table("cohorte_inscripciones").upsert(
        {
            "cohorte_id": cohorte_id,
            "postulante_id": nuevo_p["id"],
            "ranking_orden": ranking,
            "estado": "DISPONIBLE",
        },
        on_conflict="cohorte_id,postulante_id",
    ).execute()
    return nuevo_p, True


def ejecutar_sync(input_dir: str, dry_run: bool = False):
    rutas_pdf = sorted(
        str(p) for p in Path(input_dir).rglob("*.pdf") if p.is_file()
    )
    if not rutas_pdf:
        raise SyncError(f"No se encontraron archivos PDF en {input_dir}")

    crudos = []
    excluidos_test = 0
    for ruta in rutas_pdf:
        rep = ps.procesar_pdf(ruta, root_dir=input_dir)
        if es_registro_test(rep):
            excluidos_test += 1
            continue
        crudos.append(rep)

    db = cliente_supabase()
    cohorte = obtener_cohorte_activa(db)
    cid = cohorte["id"]

    postulantes_db = (
        db.table("postulantes")
        .select("id,nombre_completo,dni,origen_turno")
        .execute()
        .data
        or []
    )
    inscripciones_db = (
        db.table("cohorte_inscripciones")
        .select("postulante_id,ranking_orden")
        .eq("cohorte_id", cid)
        .execute()
        .data
        or []
    )
    inscritos_ids = {r["postulante_id"] for r in inscripciones_db if r.get("postulante_id")}
    max_ranking = max((r.get("ranking_orden") or 0 for r in inscripciones_db), default=0)
    next_ranking = [max_ranking + 1]

    # Agrupar por (nombre normalizado, student_id) para mantener Acosta Joana y Acosta Juana separadas
    grupos = {}
    for rep in crudos:
        clave = (
            ps.clave_normalizada_ascii(rep.get("student_name")),
            str(rep.get("student_id") or "").strip().lower(),
        )
        grupos.setdefault(clave, []).append(rep)

    # Clasificar cronológicamente y preparar payloads
    nuevos_creados = []
    postulantes_tocar = set()
    filas_upsert = []
    deltas_v1_v2 = 0
    deltas_t0_t1 = 0

    for _clave, items in sorted(grupos.items(), key=lambda kv: kv[1][0]["student_name"]):
        items.sort(
            key=lambda x: (
                x.get("exercise_start_time_iso") or "9999-99-99T99:99:99",
                x["archivo"],
            )
        )
        validos = [it for it in items if not it.get("intento_abortado")]
        if not validos:
            continue

        if dry_run:
            match = ps.buscar_postulante_match(validos[0]["student_name"], postulantes_db)
            pid = match["id"] if match else f"NEW:{validos[0]['student_id']}"
            if not match:
                nuevos_creados.append(
                    f"{validos[0]['student_name']} ({dni_sintetico_para(validos[0].get('student_id'), validos[0]['student_name'])})"
                )
        else:
            p_row, fue_creado = resolver_o_crear_postulante(
                db, cid, validos, postulantes_db, next_ranking
            )
            pid = p_row["id"]
            if fue_creado:
                nuevos_creados.append(f"{p_row['nombre_completo']} (dni={p_row['dni']})")
            elif pid not in inscritos_ids:
                db.table("cohorte_inscripciones").upsert(
                    {
                        "cohorte_id": cid,
                        "postulante_id": pid,
                        "ranking_orden": next_ranking[0],
                        "estado": "DISPONIBLE",
                    },
                    on_conflict="cohorte_id,postulante_id",
                ).execute()
                next_ranking[0] += 1
                inscritos_ids.add(pid)

        postulantes_tocar.add(pid)

        fecha_diag = validos[0].get("fecha_calendario") or "SIN_FECHA"
        primer_dia = [x for x in validos if (x.get("fecha_calendario") or "SIN_FECHA") == fecha_diag]
        posteriores = [x for x in validos if (x.get("fecha_calendario") or "SIN_FECHA") != fecha_diag]

        mejor_t0 = min(
            primer_dia,
            key=lambda x: (
                -(x.get("score_depurado") if x.get("score_depurado") is not None else -999),
                x.get("n_colisiones", 999),
                x.get("exercise_duration_seg") or 999999,
            ),
        )

        if len(primer_dia) >= 2:
            deltas_v1_v2 += 1
        if posteriores:
            deltas_t0_t1 += 1

        for idx, rep in enumerate(primer_dia):
            etapa = "DIAG_INTENTO_1" if idx == 0 else "DIAG_INTENTO_2"
            ref = None if idx == 0 else primer_dia[0]
            es_mejor = rep is mejor_t0
            filas_upsert.append(
                construir_evaluacion_row(pid, rep, etapa, es_mejor, ref)
            )

        for rep in posteriores:
            filas_upsert.append(
                construir_evaluacion_row(pid, rep, "FINAL", False, mejor_t0)
            )

    if dry_run:
        print(
            f"[DRY-RUN] PDFs leídos={len(rutas_pdf)}, Excluidos Test={excluidos_test}, "
            f"Reportes reales a persistir={len(filas_upsert)}, "
            f"Altas nuevas={len(nuevos_creados)} {nuevos_creados}, "
            f"Deltas V1->V2={deltas_v1_v2}, Deltas T0->T1={deltas_t0_t1}"
        )
        return

    ids_lista = sorted(postulantes_tocar)
    if ids_lista:
        # Limpia flags previos solo en filas TITAN (preserva CABINA_TABLET* y DECISION_*)
        db.table("evaluacion_diagnostico").update({"es_mejor_diagnostico": False}).in_(
            "postulante_id", ids_lista
        ).not_.like("archivo_fuente", "CABINA_TABLET%").not_.like(
            "archivo_fuente", "DECISION_%"
        ).execute()

    # Upsert por lotes para respetar límites de payload PostgREST
    for i in range(0, len(filas_upsert), 20):
        lote = filas_upsert[i : i + 20]
        db.table("evaluacion_diagnostico").upsert(
            lote, on_conflict="postulante_id,archivo_fuente"
        ).execute()

    total_post = db.table("postulantes").select("id", count="exact").limit(1).execute().count
    total_insc = (
        db.table("cohorte_inscripciones")
        .select("id", count="exact")
        .eq("cohorte_id", cid)
        .limit(1)
        .execute()
        .count
    )
    total_eval = (
        db.table("evaluacion_diagnostico").select("id", count="exact").limit(1).execute().count
    )

    print("=" * 68)
    print(f"SYNC SUPABASE COMPLETADO · Cohorte {cohorte['codigo']} ({cid})")
    print(f"PDFs totales escaneados    : {len(rutas_pdf)}")
    print(f"Excluidos Test [id=Test]   : {excluidos_test}")
    print(f"Reportes reales persistidos: {len(filas_upsert)}")
    print(f"Altas nuevas creadas       : {len(nuevos_creados)} -> {nuevos_creados}")
    print(f"Alumnos con Delta V1->V2   : {deltas_v1_v2}")
    print(f"Alumnos con Delta T0->T1   : {deltas_t0_t1}")
    print(f"Conteo final DB postulantes: {total_post}")
    print(f"Conteo final DB inscripc.  : {total_insc}")
    print(f"Conteo final DB evaluacion : {total_eval}")
    print("=" * 68)


def main():
    parser = argparse.ArgumentParser(
        description="Sincroniza reportes PDF reales de Titán con Supabase."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    ejecutar_sync(args.input_dir, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
