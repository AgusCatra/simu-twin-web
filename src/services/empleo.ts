'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  obtenerProximoLunesPosterior,
  parsearFechaUtc,
  proyectarCalendarioCohorteV2,
  TOTAL_SESIONES_CICLO,
} from '@/lib/calendario-duplas';
import {
  generarInformeEmpleoIA,
  type ContextoPostulanteIA,
  type InformeEmpleoIA,
} from '@/lib/ia/generador-informe';
import type { MetricasSimulador } from '@/lib/telemetria/parser-simulador';
import type {
  AnalizarTelemetriaIAInput,
  ComparativaProgreso,
  ConfiguracionCohorteInput,
  CrearCohorteInput,
  CrearPostulanteInput,
  DatosCohorteActiva,
  EjeRadar,
  EstadoInscripcion,
  EtapaEvaluacion,
  EvaluacionReceptividad,
  FichaEvaluacion,
  FranjaCabina,
  MetricasIntento,
  OcupanteFranja,
  PostulanteFila,
  PuntoRadar,
  ResultadoAccion,
  ResultadoAnalisisIA,
  ResultadoCrearCohorte,
  ResultadoCrearPostulante,
  TelemetriaTitan,
  TipoMaquinariaCohorte,
  TurnoFranja,
} from '@/types/empleo';

/**
 * Servicio del panel /gestion/cohortes (Gestión de Empleo).
 * Solo exports async: cualquier helper pura vive en src/lib/ (restricción del
 * bundler sobre módulos 'use server'). Todas las acciones exigen sesión y
 * re-leen el objetivo acotado (anti-IDOR): RLS USING(true) no autoriza por fila.
 */

const RUTA_PANEL = '/gestion/cohortes';
const ESTADOS_VALIDOS: readonly EstadoInscripcion[] = [
  'DISPONIBLE',
  'CONFIRMADO',
  'DESCARTADO',
];
const TIPOS_MAQUINARIA_VALIDOS: readonly TipoMaquinariaCohorte[] = [
  'AUTOELEVADOR',
  'PALA_FRONTAL',
  'RETROEXCAVADORA',
];
const TURNOS_ORIGEN_VALIDOS: readonly ('TM' | 'TT' | 'INDEFINIDO')[] = [
  'TM',
  'TT',
  'INDEFINIDO',
];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MOTIVO_BAJA = 500;
const MAX_NOTAS_EMPLEO = 2000;

const FRANJAS_CABINA_ESTANDAR: readonly {
  turno: TurnoFranja;
  horario_label: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_maximo: number;
}[] = [
  { turno: 'Mañana', horario_label: '08:00 - 09:00', hora_inicio: '08:00:00', hora_fin: '09:00:00', cupo_maximo: 3 },
  { turno: 'Mañana', horario_label: '09:00 - 10:00', hora_inicio: '09:00:00', hora_fin: '10:00:00', cupo_maximo: 3 },
  { turno: 'Mañana', horario_label: '10:00 - 11:00', hora_inicio: '10:00:00', hora_fin: '11:00:00', cupo_maximo: 3 },
  { turno: 'Mañana', horario_label: '11:00 - 12:00', hora_inicio: '11:00:00', hora_fin: '12:00:00', cupo_maximo: 3 },
  { turno: 'Tarde', horario_label: '16:00 - 17:00', hora_inicio: '16:00:00', hora_fin: '17:00:00', cupo_maximo: 3 },
  { turno: 'Tarde', horario_label: '17:00 - 18:00', hora_inicio: '17:00:00', hora_fin: '18:00:00', cupo_maximo: 3 },
  { turno: 'Tarde', horario_label: '18:00 - 19:00', hora_inicio: '18:00:00', hora_fin: '19:00:00', cupo_maximo: 3 },
];

// Umbrales de receptividad sobre delta_tiempo_seg relativo V1→V2 (%).
const UMBRAL_ASIMILACION_SEG = -10;
const UMBRAL_ANSIEDAD_SEG = 10;
// Techo de la heurística legacy para normalizar serrucho/frenadas a 0-100.
const SERRUCHO_TECHO = 3.2;
const FRENADAS_TECHO = 10;
const NEUTRO_RADAR = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Formas crudas de PostgREST
// ─────────────────────────────────────────────────────────────────────────────

interface FilaCohorte {
  id: string;
  codigo: string;
  nombre: string;
  fecha_teoria: string | null;
  fecha_inicio_sim: string | null;
  fecha_fin_sim: string | null;
  fecha_pase_planta: string | null;
  cant_dias_sim: number | null;
  max_titulares: number | null;
}

interface FilaFranja {
  id: string;
  turno: string;
  horario_label: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_maximo: number | null;
}

interface FilaEvaluacion {
  id: string;
  created_at: string | null;
  dictamen: string | null;
  asistencia_cabina: string | null;
  nivel_asistencia: string | null;
  bloque_split: string | null;
  hard_fail: boolean | null;
  motivo_hard_fail: string | null;
  instructor_evaluador: string | null;
  observaciones_rapidas: string[] | null;
  observaciones_detalle: string | null;
  puntaje_lateralidad: number | null;
  puntaje_tacto_mandos: number | null;
  puntaje_mastil: number | null;
  puntaje_control_receptividad: number | null;
  eje_lateralidad: string | null;
  eje_tacto_mandos: string | null;
  eje_mastil: string | null;
  eje_control_receptividad: string | null;
  tiempo_vuelta_seg: number | null;
  colisiones: number | null;
  score_puntos: number | string | null;
  // Columnas multi-intento (migración 0008)
  etapa: string | null;
  es_mejor_diagnostico: boolean | null;
  archivo_fuente: string | null;
  colisiones_descartadas: number | null;
  delta_tiempo_seg: number | null;
  delta_colisiones: number | null;
  delta_score: number | string | null;
  delta_serrucho: number | string | null;
  telemetria_archivo_nombre?: string | null;
  telemetria_metricas?: unknown;
  informe_ia?: unknown;
}

interface FilaInscripcion {
  id: string;
  ranking_orden: number;
  estado: string;
  motivo_baja: string | null;
  obs_empleo: string | null;
  franja_id: string | null;
  postulante_id: string | null;
  // La evaluación se anida bajo postulantes: NO hay FK directa entre
  // cohorte_inscripciones y evaluacion_diagnostico; ambas cuelgan de postulantes.
  postulantes:
    | {
        nombre_completo: string;
        dni: string;
        origen_turno: string;
        evaluacion_diagnostico: FilaEvaluacion[] | null;
      }
    | {
        nombre_completo: string;
        dni: string;
        origen_turno: string;
        evaluacion_diagnostico: FilaEvaluacion[] | null;
      }[]
    | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo crudo → DTO
// ─────────────────────────────────────────────────────────────────────────────

function numeroOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function esArchivoTablet(fuente: string | null | undefined): boolean {
  return typeof fuente === 'string' && fuente.startsWith('CABINA_TABLET');
}

function esArchivoTitan(fuente: string | null | undefined): boolean {
  return (
    typeof fuente === 'string' &&
    fuente.trim().length > 0 &&
    !fuente.startsWith('CABINA_TABLET')
  );
}

function tienePuntajeTablet(f: FilaEvaluacion): boolean {
  return (
    numeroOrNull(f.puntaje_lateralidad) !== null ||
    numeroOrNull(f.puntaje_tacto_mandos) !== null ||
    numeroOrNull(f.puntaje_mastil) !== null ||
    numeroOrNull(f.puntaje_control_receptividad) !== null
  );
}

function prioridadEtapa(etapa: string | null): number {
  if (etapa === 'FINAL') return 3;
  if (etapa === 'DIAG_INTENTO_2') return 2;
  if (etapa === 'DIAG_INTENTO_1') return 1;
  return 0;
}

/**
 * Extrae el índice de serrucho y los volantazos extremos del texto legacy
 * "serrucho=X; volantazos_extremos=Y" escrito por scripts/sync_supabase.py.
 */
function parsearTelemetriaLateralidad(texto: string | null): {
  indice_serrucho: number | null;
  volantazos_extremos: number | null;
} {
  if (!texto) return { indice_serrucho: null, volantazos_extremos: null };
  const serrucho = texto.match(/serrucho\s*=\s*(-?\d+(?:[.,]\d+)?)/i);
  const volantazos = texto.match(
    /volantazos_extremos\s*=\s*(-?\d+(?:[.,]\d+)?)/i
  );
  return {
    indice_serrucho: serrucho ? numeroOrNull(serrucho[1].replace(',', '.')) : null,
    volantazos_extremos: volantazos
      ? numeroOrNull(volantazos[1].replace(',', '.'))
      : null,
  };
}

function normalizarMetricasGuardadas(raw: unknown): MetricasSimulador | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.colisionesReales !== 'number') return null;
  return obj as unknown as MetricasSimulador;
}

function normalizarInformeGuardado(raw: unknown): InformeEmpleoIA | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.puntos) || obj.puntos.length !== 3) return null;
  if (typeof obj.dictamenSugerido !== 'string') return null;
  return obj as unknown as InformeEmpleoIA;
}

function mapearEvaluacion(filas: FilaEvaluacion[] | null): FichaEvaluacion | null {
  if (!filas || filas.length === 0) return null;

  const ordenadasReciente = [...filas].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  );

  const filasTablet = ordenadasReciente
    .filter((f) => esArchivoTablet(f.archivo_fuente) || (f.archivo_fuente === null && tienePuntajeTablet(f)))
    .sort((a, b) => {
      const diffEtapa = prioridadEtapa(b.etapa) - prioridadEtapa(a.etapa);
      return diffEtapa !== 0
        ? diffEtapa
        : (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });

  const filasTitan = ordenadasReciente
    .filter((f) => esArchivoTitan(f.archivo_fuente))
    .sort((a, b) => {
      if (a.es_mejor_diagnostico !== b.es_mejor_diagnostico) {
        return a.es_mejor_diagnostico ? -1 : 1;
      }
      const diffEtapa = prioridadEtapa(b.etapa) - prioridadEtapa(a.etapa);
      return diffEtapa !== 0
        ? diffEtapa
        : (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });

  const filaTablet = filasTablet[0] ?? null;
  const filaTitan = filasTitan[0] ?? null;
  const filaBase = filaTablet ?? filaTitan ?? ordenadasReciente[0];
  const filaConIA =
    ordenadasReciente.find((f) => normalizarInformeGuardado(f.informe_ia) !== null) ??
    null;
  const filaConMetricasJson =
    ordenadasReciente.find(
      (f) => normalizarMetricasGuardadas(f.telemetria_metricas) !== null
    ) ?? null;

  const telemetriaTexto = parsearTelemetriaLateralidad(
    filaTitan?.eje_lateralidad ?? null
  );
  const telemetria: TelemetriaTitan = filaTitan
    ? {
        tiene_datos: true,
        score_puntos: numeroOrNull(filaTitan.score_puntos),
        tiempo_vuelta_seg: numeroOrNull(filaTitan.tiempo_vuelta_seg),
        colisiones: numeroOrNull(filaTitan.colisiones),
        colisiones_descartadas: numeroOrNull(filaTitan.colisiones_descartadas),
        indice_serrucho: telemetriaTexto.indice_serrucho,
        volantazos_extremos: telemetriaTexto.volantazos_extremos,
      }
    : {
        tiene_datos: false,
        score_puntos: null,
        tiempo_vuelta_seg: null,
        colisiones: null,
        colisiones_descartadas: null,
        indice_serrucho: null,
        volantazos_extremos: null,
      };

  return {
    dictamen: filaBase.dictamen,
    asistencia_cabina: filaBase.asistencia_cabina,
    nivel_asistencia: filaTablet?.nivel_asistencia ?? filaBase.nivel_asistencia ?? null,
    bloque_split: filaTablet?.bloque_split ?? filaBase.bloque_split ?? null,
    tiene_evaluacion_tablet: filaTablet !== null,
    etapa_tablet: filaTablet ? normalizarEtapa(filaTablet.etapa) : null,
    score_tablet: filaTablet ? numeroOrNull(filaTablet.score_puntos) : null,
    hard_fail: filaTablet?.hard_fail === true,
    motivo_hard_fail: filaTablet?.motivo_hard_fail ?? null,
    instructor_evaluador: filaTablet?.instructor_evaluador ?? null,
    observaciones_rapidas: Array.isArray(filaTablet?.observaciones_rapidas)
      ? filaTablet.observaciones_rapidas
      : null,
    observaciones_detalle: filaTablet?.observaciones_detalle ?? null,
    puntaje_lateralidad: numeroOrNull(filaTablet?.puntaje_lateralidad),
    puntaje_tacto_mandos: numeroOrNull(filaTablet?.puntaje_tacto_mandos),
    puntaje_mastil: numeroOrNull(filaTablet?.puntaje_mastil),
    puntaje_control_receptividad: numeroOrNull(
      filaTablet?.puntaje_control_receptividad
    ),
    eje_lateralidad: filaTitan?.eje_lateralidad ?? filaBase.eje_lateralidad,
    eje_tacto_mandos: filaTitan?.eje_tacto_mandos ?? filaBase.eje_tacto_mandos,
    eje_mastil: filaTitan?.eje_mastil ?? filaBase.eje_mastil,
    eje_control_receptividad:
      filaTitan?.eje_control_receptividad ?? filaBase.eje_control_receptividad,
    telemetria,
    telemetria_archivo_nombre:
      filaConIA?.telemetria_archivo_nombre ??
      filaConMetricasJson?.telemetria_archivo_nombre ??
      null,
    telemetria_metricas: filaConMetricasJson
      ? normalizarMetricasGuardadas(filaConMetricasJson.telemetria_metricas)
      : null,
    informe_ia: filaConIA ? normalizarInformeGuardado(filaConIA.informe_ia) : null,
  };
}

function esTurnoFranja(v: string): v is TurnoFranja {
  return v === 'Mañana' || v === 'Tarde';
}

function esEstadoInscripcion(v: string): v is EstadoInscripcion {
  return (ESTADOS_VALIDOS as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura del panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cohorte activa + franjas con sus ocupantes CONFIRMADO + postulantes ordenados
 * por ranking con su última evaluacion_diagnostico. Devuelve null si no hay
 * sesión, cohorte activa o si falla la lectura.
 */
export async function obtenerDatosCohorteActiva(): Promise<DatosCohorteActiva | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: cohorte, error: errCohorte } = await supabase
    .from('cohortes')
    .select(
      'id, codigo, nombre, fecha_teoria, fecha_inicio_sim, fecha_fin_sim, fecha_pase_planta, cant_dias_sim, max_titulares'
    )
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errCohorte) {
    console.error('[obtenerDatosCohorteActiva] Error al buscar cohorte activa:', {
      code: errCohorte.code,
      message: errCohorte.message,
    });
    return null;
  }
  const filaCohorte = cohorte as FilaCohorte | null;
  if (!filaCohorte) return null;

  const { data: franjas, error: errFranjas } = await supabase
    .from('franjas_cabina')
    .select('id, turno, horario_label, hora_inicio, hora_fin, cupo_maximo')
    .eq('cohorte_id', filaCohorte.id)
    .order('hora_inicio', { ascending: true });

  const { data: inscripciones, error: errInscripciones } = await supabase
    .from('cohorte_inscripciones')
    .select(
      `id, ranking_orden, estado, motivo_baja, obs_empleo, franja_id, postulante_id,
       postulantes(nombre_completo, dni, origen_turno,
         evaluacion_diagnostico(id, created_at, dictamen, asistencia_cabina,
           nivel_asistencia, bloque_split, telemetria_archivo_nombre,
           telemetria_metricas, informe_ia,
           archivo_fuente, etapa, es_mejor_diagnostico,
           hard_fail, motivo_hard_fail, instructor_evaluador,
           observaciones_rapidas, observaciones_detalle,
           puntaje_lateralidad, puntaje_tacto_mandos, puntaje_mastil,
           puntaje_control_receptividad, eje_lateralidad, eje_tacto_mandos,
           eje_mastil, eje_control_receptividad, tiempo_vuelta_seg, colisiones,
           colisiones_descartadas, score_puntos))`
    )
    .eq('cohorte_id', filaCohorte.id)
    .order('ranking_orden', { ascending: true });

  if (errFranjas || errInscripciones) {
    console.error('[obtenerDatosCohorteActiva] Error al cargar franjas/inscripciones:', {
      franjas: errFranjas ? { code: errFranjas.code, message: errFranjas.message } : null,
      inscripciones: errInscripciones
        ? { code: errInscripciones.code, message: errInscripciones.message }
        : null,
    });
    return null;
  }

  const filasInscripcion = (inscripciones ?? []) as unknown as FilaInscripcion[];

  const postulantes: PostulanteFila[] = [];
  const ocupantesPorFranja = new Map<string, OcupanteFranja[]>();
  let totalConfirmados = 0;

  for (const f of filasInscripcion) {
    const rel = Array.isArray(f.postulantes) ? f.postulantes[0] : f.postulantes;
    if (!rel || !f.postulante_id) continue;

    const estado: EstadoInscripcion = esEstadoInscripcion(f.estado)
      ? f.estado
      : 'DISPONIBLE';
    if (estado === 'CONFIRMADO') totalConfirmados += 1;

    if (estado === 'CONFIRMADO' && f.franja_id) {
      const lista = ocupantesPorFranja.get(f.franja_id) ?? [];
      lista.push({
        inscripcion_id: f.id,
        nombre_completo: rel.nombre_completo,
        dni: rel.dni,
        ranking_orden: f.ranking_orden,
      });
      ocupantesPorFranja.set(f.franja_id, lista);
    }

    postulantes.push({
      inscripcion_id: f.id,
      postulante_id: f.postulante_id,
      ranking_orden: f.ranking_orden,
      nombre_completo: rel.nombre_completo,
      dni: rel.dni,
      origen_turno:
        rel.origen_turno === 'TM' || rel.origen_turno === 'TT'
          ? rel.origen_turno
          : 'INDEFINIDO',
      estado,
      motivo_baja: f.motivo_baja,
      obs_empleo: f.obs_empleo,
      franja_id: f.franja_id,
      evaluacion: mapearEvaluacion(rel.evaluacion_diagnostico),
    });
  }

  const franjasDto: FranjaCabina[] = ((franjas ?? []) as unknown as FilaFranja[]).map(
    (fr) => ({
      id: fr.id,
      turno: esTurnoFranja(fr.turno) ? fr.turno : 'Mañana',
      horario_label: fr.horario_label,
      hora_inicio: fr.hora_inicio,
      hora_fin: fr.hora_fin,
      cupo_maximo: numeroOrNull(fr.cupo_maximo) ?? 3,
      ocupantes: ocupantesPorFranja.get(fr.id) ?? [],
    })
  );

  return {
    cohorte: {
      id: filaCohorte.id,
      codigo: filaCohorte.codigo,
      nombre: filaCohorte.nombre,
      fecha_teoria: filaCohorte.fecha_teoria,
      fecha_inicio_sim: filaCohorte.fecha_inicio_sim,
      fecha_fin_sim: filaCohorte.fecha_fin_sim,
      fecha_pase_planta: filaCohorte.fecha_pase_planta,
      cant_dias_sim: numeroOrNull(filaCohorte.cant_dias_sim) ?? 0,
      max_titulares: numeroOrNull(filaCohorte.max_titulares) ?? 0,
    },
    franjas: franjasDto,
    postulantes,
    totalConfirmados,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Acciones de asignación
// ─────────────────────────────────────────────────────────────────────────────

function idsValidos(...ids: (string | null | undefined)[]): boolean {
  return ids.every((id) => typeof id === 'string' && id.trim().length > 0);
}

/**
 * Asigna un postulante a una franja de cabina y lo confirma.
 * Valida cupo de la franja (3 confirmados) antes de escribir; el trigger
 * trg_validar_cupo_franja queda como red ante carreras concurrentes.
 */
export async function asignarPostulanteFranja(
  inscripcion_id: string,
  franja_id: string
): Promise<ResultadoAccion> {
  if (!idsValidos(inscripcion_id, franja_id)) {
    return { ok: false, error: 'Datos inválidos' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id, cohorte_id, estado')
    .eq('id', inscripcion_id.trim())
    .maybeSingle();

  if (errInsc || !insc) {
    console.error('[asignarPostulanteFranja] Error al leer inscripción:', {
      code: errInsc?.code,
      message: errInsc?.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }

  const { data: franja, error: errFranja } = await supabase
    .from('franjas_cabina')
    .select('id, cohorte_id, cupo_maximo')
    .eq('id', franja_id.trim())
    .maybeSingle();

  if (errFranja || !franja) {
    console.error('[asignarPostulanteFranja] Error al leer franja:', {
      code: errFranja?.code,
      message: errFranja?.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }

  // Anti-IDOR: la franja debe pertenecer a la cohorte de la inscripción.
  if (franja.cohorte_id !== insc.cohorte_id) {
    return { ok: false, error: 'La franja no pertenece a la cohorte del postulante' };
  }

  const cupo = numeroOrNull(franja.cupo_maximo) ?? 3;
  const { count, error: errCount } = await supabase
    .from('cohorte_inscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('franja_id', franja.id)
    .eq('estado', 'CONFIRMADO')
    .neq('id', insc.id);

  if (errCount) {
    console.error('[asignarPostulanteFranja] Error al contar ocupantes:', {
      code: errCount.code,
      message: errCount.message,
    });
    return { ok: false, error: 'No se pudo validar el cupo de la franja' };
  }
  if ((count ?? 0) >= cupo) {
    return { ok: false, error: 'FRANJA_COMPLETA: la franja ya tiene 3 confirmados' };
  }

  const { error: errUpdate } = await supabase
    .from('cohorte_inscripciones')
    .update({
      franja_id: franja.id,
      estado: 'CONFIRMADO',
      motivo_baja: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insc.id);

  if (errUpdate) {
    console.error('[asignarPostulanteFranja] Error al asignar:', {
      code: errUpdate.code,
      message: errUpdate.message,
    });
    const mensaje = errUpdate.message.includes('FRANJA_COMPLETA')
      ? 'La franja se completó antes de confirmar al postulante'
      : errUpdate.message.includes('COHORTE_COMPLETA')
        ? 'Se alcanzó el tope de titulares de la cohorte'
        : 'No se pudo asignar el postulante a la franja';
    return { ok: false, error: mensaje };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

/**
 * Baja de un postulante: libera la franja, pasa a DESCARTADO y guarda el motivo.
 * Escribir estado <> 'CONFIRMADO' no dispara los triggers de cupo/tope.
 */
export async function darDeBajaPostulante(
  inscripcion_id: string,
  motivo_baja: string
): Promise<ResultadoAccion> {
  const motivo =
    typeof motivo_baja === 'string' ? motivo_baja.trim().slice(0, MAX_MOTIVO_BAJA) : '';
  if (!idsValidos(inscripcion_id) || motivo.length === 0) {
    return { ok: false, error: 'Datos inválidos: se requiere un motivo de baja' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id')
    .eq('id', inscripcion_id.trim())
    .maybeSingle();

  if (errInsc || !insc) {
    console.error('[darDeBajaPostulante] Error al leer inscripción:', {
      code: errInsc?.code,
      message: errInsc?.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }

  const { error: errUpdate } = await supabase
    .from('cohorte_inscripciones')
    .update({
      franja_id: null,
      estado: 'DESCARTADO',
      motivo_baja: motivo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insc.id);

  if (errUpdate) {
    console.error('[darDeBajaPostulante] Error al dar de baja:', {
      code: errUpdate.code,
      message: errUpdate.message,
    });
    return { ok: false, error: 'No se pudo dar de baja al postulante' };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

/**
 * Persiste las notas sociolaborales del equipo de Empleo sobre la inscripción
 * (columna obs_empleo). Texto vacío => NULL.
 */
export async function guardarNotasEmpleo(
  inscripcion_id: string,
  notas: string
): Promise<ResultadoAccion> {
  if (!idsValidos(inscripcion_id)) {
    return { ok: false, error: 'Datos inválidos' };
  }
  const texto = typeof notas === 'string' ? notas.trim().slice(0, MAX_NOTAS_EMPLEO) : '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const { error } = await supabase
    .from('cohorte_inscripciones')
    .update({
      obs_empleo: texto.length > 0 ? texto : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inscripcion_id.trim());

  if (error) {
    console.error('[guardarNotasEmpleo] Error al guardar notas:', {
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: 'No se pudieron guardar las notas' };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

/**
 * Configuración de la cohorte bajo el modelo de duplas de 16 alumnos:
 * validación estricta del input, lectura de `feriados_municipales`,
 * proyección con `calendario-duplas.ts` (absorción en Viernes Buffer) y
 * persistencia de fechas + cupo en `cohortes`.
 */
export async function actualizarConfiguracionCohorte(
  cohorte_id: string,
  configuracion: ConfiguracionCohorteInput
): Promise<ResultadoAccion> {
  if (!idsValidos(cohorte_id) || !configuracion) {
    return { ok: false, error: 'Datos inválidos' };
  }

  const cupo = configuracion.max_titulares;
  if (!Number.isInteger(cupo) || cupo <= 0 || cupo > 200) {
    return { ok: false, error: 'El cupo debe ser un entero entre 1 y 200' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(configuracion.fecha_teoria ?? '')) {
    return { ok: false, error: 'La fecha de teoría debe tener formato YYYY-MM-DD' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const [{ data: cohorte, error: errCohorte }, { data: filasFeriados, error: errFeriados }] =
    await Promise.all([
      supabase
        .from('cohortes')
        .select('id')
        .eq('id', cohorte_id.trim())
        .maybeSingle(),
      supabase
        .from('feriados_municipales')
        .select('fecha')
        .order('fecha', { ascending: true })
        .returns<Array<{ fecha: string | null }>>(),
    ]);

  if (errCohorte || !cohorte) {
    console.error('[actualizarConfiguracionCohorte] Error al leer cohorte:', {
      code: errCohorte?.code,
      message: errCohorte?.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }

  if (errFeriados) {
    console.error('[actualizarConfiguracionCohorte] Error al leer feriados_municipales:', {
      code: errFeriados.code,
      message: errFeriados.message,
    });
  }

  const diasBloqueados = (filasFeriados ?? [])
    .map((f) => (typeof f.fecha === 'string' ? f.fecha.split('T')[0] : ''))
    .filter((fecha) => /^\d{4}-\d{2}-\d{2}$/.test(fecha));

  let proyeccion;
  try {
    const fechaInicioSimulador = obtenerProximoLunesPosterior(
      configuracion.fecha_teoria
    );
    proyeccion = proyectarCalendarioCohorteV2({
      fechaInicioTeoria: configuracion.fecha_teoria,
      fechaInicioSimulador,
      diasBloqueados,
      estrategiaFeriados: 'MOVER_A_VIERNES',
    });
  } catch {
    return { ok: false, error: 'No se pudo proyectar el calendario con esos datos' };
  }

  // Lista blanca de columnas actualizables desde la cabecera de configuración.
  const { error: errUpdate } = await supabase
    .from('cohortes')
    .update({
      fecha_teoria: configuracion.fecha_teoria,
      max_titulares: cupo,
      fecha_inicio_sim: proyeccion.fechaInicioSimulador,
      fecha_fin_sim: proyeccion.fechaFinSimulador,
      fecha_pase_planta: proyeccion.fechaPaseTerreno,
      cant_dias_sim: TOTAL_SESIONES_CICLO,
    })
    .eq('id', cohorte.id);

  if (errUpdate) {
    console.error('[actualizarConfiguracionCohorte] Error al actualizar:', {
      code: errUpdate.code,
      message: errUpdate.message,
    });
    return { ok: false, error: 'No se pudo guardar la configuración de la cohorte' };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Comparativa de progreso multi-intento (V1 / V2 / FINAL, migración 0008)
// ─────────────────────────────────────────────────────────────────────────

/** Extrae frenadas_panico del texto legacy "frenadas_panico=X; ...". */
function parsearFrenadasLegacy(texto: string | null): number | null {
  if (!texto) return null;
  const m = texto.match(/frenadas_panico\s*=\s*(-?\d+(?:[.,]\d+)?)/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

function normalizarEtapa(v: string | null): EtapaEvaluacion {
  return v === 'DIAG_INTENTO_2' || v === 'FINAL' ? v : 'DIAG_INTENTO_1';
}

function clamp01a100(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function mapearIntento(f: FilaEvaluacion): MetricasIntento {
  const tel = parsearTelemetriaLateralidad(f.eje_lateralidad);
  return {
    evaluacionId: f.id,
    etapa: normalizarEtapa(f.etapa),
    archivoFuente: f.archivo_fuente,
    dictamen: f.dictamen,
    asistenciaCabina: f.asistencia_cabina,
    tiempoVueltaSeg: numeroOrNull(f.tiempo_vuelta_seg),
    colisiones: numeroOrNull(f.colisiones),
    colisionesDescartadas: numeroOrNull(f.colisiones_descartadas),
    scorePuntos: numeroOrNull(f.score_puntos),
    indiceSerrucho: tel.indice_serrucho,
    volantazosExtremos: tel.volantazos_extremos,
    esMejorDiagnostico: f.es_mejor_diagnostico === true,
  };
}

function puntajeTabletRadar(f: FilaEvaluacion | null, eje: EjeRadar): number | null {
  if (!f) return null;
  let crudo: number | null = null;
  switch (eje) {
    case 'Lateralidad':
      crudo = numeroOrNull(f.puntaje_lateralidad);
      break;
    case 'Mandos':
      crudo = numeroOrNull(f.puntaje_tacto_mandos);
      break;
    case 'Mástil':
      crudo = numeroOrNull(f.puntaje_mastil);
      break;
    case 'Control':
      crudo = numeroOrNull(f.puntaje_control_receptividad);
      break;
  }
  return crudo !== null ? clamp01a100(crudo * 5) : null;
}

/**
 * Valor 0-100 de un eje del radar para una pasada: prefiere el puntaje entero
 * de consola táctil (0/10/20 ×5); sin él, heurística sobre la telemetría TITAN
 * legacy; sin datos, valor neutro 50.
 */
function valorRadar(
  f: FilaEvaluacion | null,
  eje: EjeRadar,
  tel: { indice_serrucho: number | null; volantazos_extremos: number | null }
): number {
  const tablet = puntajeTabletRadar(f, eje);
  if (tablet !== null) return tablet;
  if (!f) return NEUTRO_RADAR;
  switch (eje) {
    case 'Lateralidad': {
      if (tel.indice_serrucho !== null)
        return clamp01a100((1 - tel.indice_serrucho / SERRUCHO_TECHO) * 100);
      return NEUTRO_RADAR;
    }
    case 'Mandos': {
      const frenadas = parsearFrenadasLegacy(f.eje_tacto_mandos);
      if (frenadas !== null) return clamp01a100((1 - frenadas / FRENADAS_TECHO) * 100);
      return NEUTRO_RADAR;
    }
    case 'Mástil':
    case 'Control':
      return NEUTRO_RADAR;
  }
}

function puntosRadarCombinado(
  tabletDiag: FilaEvaluacion | null,
  tabletFinal: FilaEvaluacion | null,
  titanDiag: FilaEvaluacion | null,
  titanFinal: FilaEvaluacion | null
): PuntoRadar[] {
  const telDiag = parsearTelemetriaLateralidad(titanDiag?.eje_lateralidad ?? null);
  const telFinal = titanFinal
    ? parsearTelemetriaLateralidad(titanFinal.eje_lateralidad)
    : telDiag;
  const ejes: EjeRadar[] = ['Lateralidad', 'Mandos', 'Mástil', 'Control'];
  return ejes.map((eje) => {
    const valDiagTablet = puntajeTabletRadar(tabletDiag, eje);
    const valDiag =
      valDiagTablet !== null
        ? valDiagTablet
        : valorRadar(titanDiag, eje, telDiag);

    const valFinalTablet = puntajeTabletRadar(tabletFinal, eje);
    let valFinal = valDiag;
    if (valFinalTablet !== null) {
      valFinal = valFinalTablet;
    } else if (titanFinal) {
      const valFinalTitan = valorRadar(titanFinal, eje, telFinal);
      if (valDiagTablet === null || eje === 'Lateralidad' || eje === 'Mandos') {
        valFinal = valFinalTitan;
      }
    }

    return {
      eje,
      valorDiagnostico: valDiag,
      valorFinal: valFinal,
    };
  });
}

/**
 * Lectura cualitativa de la receptividad V1→V2 sobre el delta relativo de
 * tiempo: mejora ≥10% = Alta Asimilación; empeora >10% = Ansiedad Operativa;
 * el resto, Estable. Sin V2 no hay datos.
 */
function receptividad(deltaSeg: number | null, base: number | null): EvaluacionReceptividad {
  if (deltaSeg === null || !base || base <= 0) return 'Sin Datos';
  const pct = (deltaSeg / base) * 100;
  if (pct <= UMBRAL_ASIMILACION_SEG) return 'Alta Asimilación';
  if (pct >= UMBRAL_ANSIEDAD_SEG) return 'Ansiedad Operativa';
  return 'Estable';
}

/**
 * Payload de comparativa V1/V2/FINAL + ejes pedagógicos de tablet para el
 * Radar y la tarjeta de Telemetría Física TITAN en el Drawer del postulante.
 * Conviven limpiamente las evaluaciones `CABINA_TABLET*` y los PDF TITAN.
 */
export async function obtenerComparativaProgreso(
  postulante_id: string
): Promise<ComparativaProgreso | null> {
  if (!idsValidos(postulante_id)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: cohorte } = await supabase
    .from('cohortes')
    .select('id')
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cohorte) return null;

  // Anti-IDOR: el postulante debe estar inscripto en la cohorte activa.
  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id')
    .eq('cohorte_id', cohorte.id)
    .eq('postulante_id', postulante_id.trim())
    .maybeSingle();
  if (errInsc || !insc) {
    console.error('[obtenerComparativaProgreso] Error al validar inscripción:', {
      code: errInsc?.code,
      message: errInsc?.message,
    });
    return null;
  }

  const { data: filas, error: errEvals } = await supabase
    .from('evaluacion_diagnostico')
    .select(
      `id, created_at, dictamen, asistencia_cabina, puntaje_lateralidad,
       puntaje_tacto_mandos, puntaje_mastil, puntaje_control_receptividad,
       eje_lateralidad, eje_tacto_mandos, eje_mastil, eje_control_receptividad,
       tiempo_vuelta_seg, colisiones, score_puntos, etapa, es_mejor_diagnostico,
       archivo_fuente, colisiones_descartadas, delta_tiempo_seg,
       delta_colisiones, delta_score, delta_serrucho`
    )
    .eq('postulante_id', postulante_id.trim())
    .order('created_at', { ascending: true });

  if (errEvals) {
    console.error('[obtenerComparativaProgreso] Error al leer evaluaciones:', {
      code: errEvals.code,
      message: errEvals.message,
    });
    return null;
  }

  const todas = (filas ?? []) as unknown as FilaEvaluacion[];
  const titan = todas.filter((f) => esArchivoTitan(f.archivo_fuente));
  const tablet = todas.filter(
    (f) =>
      esArchivoTablet(f.archivo_fuente) ||
      (f.archivo_fuente === null && tienePuntajeTablet(f))
  );

  if (titan.length === 0 && tablet.length === 0) return null;

  const porEtapaTitan = new Map<EtapaEvaluacion, FilaEvaluacion>();
  for (const f of titan) porEtapaTitan.set(normalizarEtapa(f.etapa), f);

  const porEtapaTablet = new Map<EtapaEvaluacion, FilaEvaluacion>();
  for (const f of tablet) porEtapaTablet.set(normalizarEtapa(f.etapa), f);

  const fV1 = porEtapaTitan.get('DIAG_INTENTO_1') ?? null;
  const fV2 = porEtapaTitan.get('DIAG_INTENTO_2') ?? null;
  const fFinal = porEtapaTitan.get('FINAL') ?? null;

  const tabletDiag =
    porEtapaTablet.get('DIAG_INTENTO_2') ??
    porEtapaTablet.get('DIAG_INTENTO_1') ??
    null;
  const tabletFinal = porEtapaTablet.get('FINAL') ?? null;

  const v1 = fV1 ? mapearIntento(fV1) : null;
  const v2 = fV2 ? mapearIntento(fV2) : null;

  const mejorFila =
    [fV1, fV2].find((f) => f?.es_mejor_diagnostico === true) ?? fV2 ?? fV1 ?? null;
  const mejorDiagnostico = mejorFila ? mapearIntento(mejorFila) : null;

  const deltaTiempo = fV2 ? numeroOrNull(fV2.delta_tiempo_seg) : null;
  const deltaScore = fV2 ? numeroOrNull(fV2.delta_score) : null;
  const deltaColisiones = fV2 ? numeroOrNull(fV2.delta_colisiones) : null;

  const deltaDiagnostico =
    titan.length > 0
      ? {
          deltaTiempoSeg: deltaTiempo,
          deltaColisiones,
          deltaScore,
          mejoraTiempoSeg: deltaTiempo ?? 0,
          reduccionColisiones: deltaColisiones !== null ? -deltaColisiones : 0,
          evolucionScore: deltaScore ?? 0,
          evaluacionReceptividad: receptividad(
            deltaTiempo,
            v1?.tiempoVueltaSeg ?? null
          ),
        }
      : null;

  const payload: ComparativaProgreso = {
    postulanteId: postulante_id.trim(),
    tieneTelemetriaTitan: titan.length > 0,
    tieneEvaluacionTablet: tablet.length > 0,
    v1,
    v2,
    deltaDiagnostico,
    mejorDiagnostico,
    radarEjes: puntosRadarCombinado(tabletDiag, tabletFinal, mejorFila, fFinal),
    tieneComparativaFinalRadar: Boolean(fFinal || tabletFinal),
  };

  if (fFinal) {
    const final = mapearIntento(fFinal);
    const scoreFinal = numeroOrNull(fFinal.score_puntos);
    const scoreMejor = mejorFila ? numeroOrNull(mejorFila.score_puntos) : null;
    payload.pruebaFinal = final;
    payload.deltaFinal = {
      deltaTiempoSeg: numeroOrNull(fFinal.delta_tiempo_seg),
      deltaColisiones: numeroOrNull(fFinal.delta_colisiones),
      deltaScore: numeroOrNull(fFinal.delta_score),
      deltaSerrucho: numeroOrNull(fFinal.delta_serrucho),
      mejoraTotalPorcentaje:
        scoreFinal !== null && scoreMejor !== null && scoreMejor > 0
          ? Math.round(((scoreFinal - scoreMejor) / scoreMejor) * 10000) / 100
          : 0,
      aptoParaPlanta: fFinal.dictamen === 'APTO_DIRECTO',
    };
  }

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 4 · Alta de Cohorte, Alta de Postulante y Motor IA Empleo
// ─────────────────────────────────────────────────────────────────────────────

function normalizarMetricasInput(raw: unknown): MetricasSimulador | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const numOrNull = (val: unknown, min: number, max: number): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    if (val < min || val > max) return null;
    return val;
  };

  const intOrZero = (val: unknown, max: number): number | null => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    const trunc = Math.trunc(val);
    if (trunc < 0 || trunc > max) return null;
    return trunc;
  };

  const colisionesReales = intOrZero(obj.colisionesReales, 1000);
  const colisionesDescartadas = intOrZero(obj.colisionesDescartadas, 1000);
  if (colisionesReales === null || colisionesDescartadas === null) return null;

  const hallazgosMastil = Array.isArray(obj.hallazgosMastil)
    ? obj.hallazgosMastil
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim().slice(0, 200))
        .slice(0, 8)
    : [];

  return {
    archivoFuente:
      typeof obj.archivoFuente === 'string'
        ? obj.archivoFuente.trim().slice(0, 160)
        : null,
    studentName:
      typeof obj.studentName === 'string'
        ? obj.studentName.trim().slice(0, 120)
        : null,
    studentId:
      typeof obj.studentId === 'string' ? obj.studentId.trim().slice(0, 40) : null,
    exerciseName:
      typeof obj.exerciseName === 'string'
        ? obj.exerciseName.trim().slice(0, 120)
        : null,
    exerciseStartTime:
      typeof obj.exerciseStartTime === 'string'
        ? obj.exerciseStartTime.trim().slice(0, 80)
        : null,
    scorePuntos: numOrNull(obj.scorePuntos, 0, 200),
    tiempoDuracionSeg: numOrNull(obj.tiempoDuracionSeg, 0, 36000),
    colisionesReales,
    colisionesDescartadas,
    colisionesDetalle: [],
    descartesDetalle: [],
    infraccionesConduccion: [],
    indiceSerrucho: numOrNull(obj.indiceSerrucho, 0, 100),
    volantazosExtremos: numOrNull(obj.volantazosExtremos, 0, 1000),
    velocidadMaxKmh: numOrNull(obj.velocidadMaxKmh, 0, 100),
    frenadasPanico: numOrNull(obj.frenadasPanico, 0, 1000),
    clasificacionRiesgo:
      typeof obj.clasificacionRiesgo === 'string'
        ? obj.clasificacionRiesgo.trim().slice(0, 60)
        : null,
    clasificacionAptitud:
      typeof obj.clasificacionAptitud === 'string'
        ? obj.clasificacionAptitud.trim().slice(0, 60)
        : null,
    hallazgosMastil,
    alertaFalsoPositivoSuelo: obj.alertaFalsoPositivoSuelo === true,
  };
}

/**
 * Crea una nueva cohorte con proyección determinista de calendario V2
 * (Grupos A/B, 8 duplas, Viernes Buffer) y siembra sus 7 franjas de cabina.
 */
export async function crearCohorteAction(
  input: CrearCohorteInput
): Promise<ResultadoCrearCohorte> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Payload inválido.' };
  }

  const codigo =
    typeof input.codigo === 'string'
      ? input.codigo.trim().toUpperCase().replace(/\s+/g, '-')
      : '';
  if (!/^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/.test(codigo)) {
    return {
      ok: false,
      error: 'El código debe tener 3 a 32 caracteres alfanuméricos o guiones (ej: AUTO-2026-C2).',
    };
  }

  const nombre =
    typeof input.nombre === 'string' ? input.nombre.trim().slice(0, 120) : '';
  if (nombre.length < 3) {
    return { ok: false, error: 'El nombre de la cohorte debe tener al menos 3 caracteres.' };
  }

  if (
    typeof input.tipo_maquinaria !== 'string' ||
    !(TIPOS_MAQUINARIA_VALIDOS as readonly string[]).includes(input.tipo_maquinaria)
  ) {
    return { ok: false, error: 'Tipo de maquinaria inválido.' };
  }

  const fechaTeoria = typeof input.fecha_teoria === 'string' ? input.fecha_teoria.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTeoria)) {
    return { ok: false, error: 'La fecha de teoría debe tener formato YYYY-MM-DD.' };
  }

  const cupoAlumnos = input.cupo_alumnos;
  if (!Number.isInteger(cupoAlumnos) || cupoAlumnos < 2 || cupoAlumnos > 32) {
    return { ok: false, error: 'El cupo de alumnos en duplas debe estar entre 2 y 32.' };
  }

  const maxTitulares = input.max_titulares;
  if (!Number.isInteger(maxTitulares) || maxTitulares < 1 || maxTitulares > 200) {
    return { ok: false, error: 'El tope de titulares debe ser un entero entre 1 y 200.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const [{ data: existente }, { data: filasFeriados }] = await Promise.all([
    supabase
      .from('cohortes')
      .select('id')
      .eq('codigo', codigo)
      .maybeSingle<{ id: string }>(),
    supabase
      .from('feriados_municipales')
      .select('fecha')
      .order('fecha', { ascending: true })
      .returns<Array<{ fecha: string | null }>>(),
  ]);

  if (existente?.id) {
    return { ok: false, error: `Ya existe una cohorte con el código ${codigo}.` };
  }

  const diasBloqueados = (filasFeriados ?? [])
    .map((f) => (typeof f.fecha === 'string' ? f.fecha.split('T')[0] : ''))
    .filter((fecha) => /^\d{4}-\d{2}-\d{2}$/.test(fecha));

  let proyeccion;
  try {
    parsearFechaUtc(fechaTeoria);
    const fechaInicioSimulador = obtenerProximoLunesPosterior(fechaTeoria);
    proyeccion = proyectarCalendarioCohorteV2({
      fechaInicioTeoria: fechaTeoria,
      fechaInicioSimulador,
      diasBloqueados,
      estrategiaFeriados: 'MOVER_A_VIERNES',
    });
  } catch {
    return { ok: false, error: 'La fecha de teoría no es válida para proyectar calendario.' };
  }

  const activar = input.activar_inmediatamente !== false;

  const { data: cohorteCreada, error: errInsert } = await supabase
    .from('cohortes')
    .insert({
      codigo,
      nombre,
      tipo_maquinaria: input.tipo_maquinaria,
      fecha_teoria: fechaTeoria,
      fecha_inicio_sim: proyeccion.fechaInicioSimulador,
      fecha_fin_sim: proyeccion.fechaFinSimulador,
      fecha_pase_planta: proyeccion.fechaPaseTerreno,
      cant_dias_sim: TOTAL_SESIONES_CICLO,
      max_titulares: maxTitulares,
      cupo_alumnos: cupoAlumnos,
      duracion_semanas: 3,
      total_sesiones_requeridas: TOTAL_SESIONES_CICLO,
      estado: activar ? 'activa' : 'borrador',
      estado_v2: 'PLANIFICADA',
    })
    .select('id')
    .single<{ id: string }>();

  if (errInsert || !cohorteCreada?.id) {
    console.error('[crearCohorteAction] Error al crear cohorte:', {
      code: errInsert?.code,
      message: errInsert?.message,
    });
    return {
      ok: false,
      error:
        errInsert?.code === '23505'
          ? `El código ${codigo} ya se encuentra registrado.`
          : 'No se pudo crear la cohorte.',
    };
  }

  const franjasInsert = FRANJAS_CABINA_ESTANDAR.map((f) => ({
    cohorte_id: cohorteCreada.id,
    turno: f.turno,
    horario_label: f.horario_label,
    hora_inicio: f.hora_inicio,
    hora_fin: f.hora_fin,
    cupo_maximo: f.cupo_maximo,
  }));

  const { error: errFranjas } = await supabase
    .from('franjas_cabina')
    .insert(franjasInsert);

  if (errFranjas) {
    console.error('[crearCohorteAction] Error al sembrar franjas:', {
      code: errFranjas.code,
      message: errFranjas.message,
    });
    await supabase.from('cohortes').delete().eq('id', cohorteCreada.id);
    return { ok: false, error: 'No se pudieron inicializar las franjas de cabina.' };
  }

  if (activar) {
    const { error: errDesactivar } = await supabase
      .from('cohortes')
      .update({ estado: 'finalizada' })
      .eq('estado', 'activa')
      .neq('id', cohorteCreada.id);

    if (errDesactivar) {
      console.error('[crearCohorteAction] Aviso al cerrar cohorte previa:', {
        code: errDesactivar.code,
        message: errDesactivar.message,
      });
    }
  }

  revalidatePath(RUTA_PANEL);
  revalidatePath('/cabina/evaluacion');
  revalidatePath('/admin');
  return { ok: true, cohorte_id: cohorteCreada.id };
}

/**
 * Da de alta un postulante en `public.postulantes` (o reutiliza su legajo
 * existente por DNI) y lo inscribe en la cohorte indicada con estado DISPONIBLE.
 */
export async function crearPostulanteAction(
  input: CrearPostulanteInput
): Promise<ResultadoCrearPostulante> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Payload inválido.' };
  }

  const cohorteId = typeof input.cohorte_id === 'string' ? input.cohorte_id.trim() : '';
  if (!UUID_RE.test(cohorteId)) {
    return { ok: false, error: 'Identificador de cohorte inválido.' };
  }

  const nombreCompleto =
    typeof input.nombre_completo === 'string'
      ? input.nombre_completo.trim().replace(/\s+/g, ' ').slice(0, 120)
      : '';
  if (nombreCompleto.length < 3) {
    return { ok: false, error: 'El nombre completo debe tener al menos 3 caracteres.' };
  }

  const dniLimpio =
    typeof input.dni === 'string' ? input.dni.replace(/\D+/g, '') : '';
  if (!/^\d{7,9}$/.test(dniLimpio)) {
    return { ok: false, error: 'El DNI debe contener entre 7 y 9 dígitos numéricos.' };
  }

  if (
    typeof input.origen_turno !== 'string' ||
    !(TURNOS_ORIGEN_VALIDOS as readonly string[]).includes(input.origen_turno)
  ) {
    return { ok: false, error: 'Turno de origen inválido.' };
  }

  const rankingOrden = input.ranking_orden;
  if (!Number.isInteger(rankingOrden) || rankingOrden < 1 || rankingOrden > 999) {
    return { ok: false, error: 'El orden de ranking debe ser un entero entre 1 y 999.' };
  }

  const telefono =
    typeof input.telefono === 'string'
      ? input.telefono.trim().slice(0, 30) || null
      : null;
  if (telefono && !/^[+\d\s()-]{5,30}$/.test(telefono)) {
    return { ok: false, error: 'Formato de teléfono inválido.' };
  }

  const obsEmpleo =
    typeof input.obs_empleo === 'string'
      ? input.obs_empleo.trim().slice(0, MAX_NOTAS_EMPLEO) || null
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  // Anti-IDOR: verificar que la cohorte exista en base de datos
  const { data: cohorte, error: errCohorte } = await supabase
    .from('cohortes')
    .select('id')
    .eq('id', cohorteId)
    .maybeSingle<{ id: string }>();

  if (errCohorte || !cohorte?.id) {
    return { ok: false, error: 'La cohorte seleccionada no existe.' };
  }

  const { data: postulanteExistente, error: errBuscarDni } = await supabase
    .from('postulantes')
    .select('id')
    .eq('dni', dniLimpio)
    .maybeSingle<{ id: string }>();

  if (errBuscarDni) {
    console.error('[crearPostulanteAction] Error al buscar DNI:', {
      code: errBuscarDni.code,
      message: errBuscarDni.message,
    });
    return { ok: false, error: 'No se pudo verificar el DNI en el padrón.' };
  }

  let postulanteId = postulanteExistente?.id ?? null;

  if (!postulanteId) {
    const { data: creado, error: errCrearPost } = await supabase
      .from('postulantes')
      .insert({
        dni: dniLimpio,
        nombre_completo: nombreCompleto,
        origen_turno: input.origen_turno,
        telefono,
      })
      .select('id')
      .single<{ id: string }>();

    if (errCrearPost || !creado?.id) {
      console.error('[crearPostulanteAction] Error al crear postulante:', {
        code: errCrearPost?.code,
        message: errCrearPost?.message,
      });
      return { ok: false, error: 'No se pudo registrar el postulante.' };
    }
    postulanteId = creado.id;
  } else {
    const { data: yaInscripto } = await supabase
      .from('cohorte_inscripciones')
      .select('id')
      .eq('cohorte_id', cohorteId)
      .eq('postulante_id', postulanteId)
      .maybeSingle<{ id: string }>();

    if (yaInscripto?.id) {
      return {
        ok: false,
        error: `El postulante con DNI ${dniLimpio} ya figura inscripto en esta cohorte.`,
      };
    }

    await supabase
      .from('postulantes')
      .update({
        nombre_completo: nombreCompleto,
        origen_turno: input.origen_turno,
        ...(telefono ? { telefono } : {}),
      })
      .eq('id', postulanteId);
  }

  const { data: inscripcionCreada, error: errInscripcion } = await supabase
    .from('cohorte_inscripciones')
    .insert({
      cohorte_id: cohorteId,
      postulante_id: postulanteId,
      ranking_orden: rankingOrden,
      estado: 'DISPONIBLE',
      obs_empleo: obsEmpleo,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single<{ id: string }>();

  if (errInscripcion || !inscripcionCreada?.id) {
    console.error('[crearPostulanteAction] Error al inscribir en cohorte:', {
      code: errInscripcion?.code,
      message: errInscripcion?.message,
    });
    return { ok: false, error: 'No se pudo inscribir al postulante en la cohorte.' };
  }

  revalidatePath(RUTA_PANEL);
  revalidatePath('/cabina/evaluacion');
  revalidatePath('/admin');
  return {
    ok: true,
    postulante_id: postulanteId,
    inscripcion_id: inscripcionCreada.id,
  };
}

/**
 * Ejecuta en servidor el análisis IA (Gemini 2.5 Flash con fallback heurístico)
 * sobre las métricas parseadas de un reporte `.json` y persiste los resultados
 * en la última evaluación del postulante si existe en `evaluacion_diagnostico`.
 */
export async function analizarTelemetriaPostulanteAction(
  input: AnalizarTelemetriaIAInput
): Promise<ResultadoAnalisisIA> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Datos de análisis inválidos.' };
  }

  const postulanteId =
    typeof input.postulante_id === 'string' ? input.postulante_id.trim() : '';
  if (!UUID_RE.test(postulanteId)) {
    return { ok: false, error: 'Identificador de postulante inválido.' };
  }

  const archivoNombre =
    typeof input.archivo_nombre === 'string'
      ? input.archivo_nombre.trim().slice(0, 160)
      : 'telemetria.json';
  const metricas = normalizarMetricasInput(input.metricas);
  if (!metricas) {
    return { ok: false, error: 'Métricas de telemetría inválidas.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const { data: cohorte } = await supabase
    .from('cohortes')
    .select('id')
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!cohorte?.id) {
    return { ok: false, error: 'No hay una cohorte activa para validar la consulta.' };
  }

  // Anti-IDOR: el postulante debe estar inscripto en la cohorte activa.
  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select(
      'id, obs_empleo, postulantes(nombre_completo, dni)'
    )
    .eq('cohorte_id', cohorte.id)
    .eq('postulante_id', postulanteId)
    .maybeSingle<{
      id: string;
      obs_empleo: string | null;
      postulantes:
        | { nombre_completo: string; dni: string }
        | { nombre_completo: string; dni: string }[]
        | null;
    }>();

  if (errInsc || !insc) {
    return {
      ok: false,
      error: 'El postulante no pertenece a la cohorte activa.',
    };
  }

  const rel = Array.isArray(insc.postulantes)
    ? insc.postulantes[0]
    : insc.postulantes;
  if (!rel) {
    return { ok: false, error: 'Legajo del postulante no encontrado.' };
  }

  const { data: evalFilas } = await supabase
    .from('evaluacion_diagnostico')
    .select(
      'id, created_at, dictamen, asistencia_cabina, nivel_asistencia, bloque_split, score_puntos, hard_fail, motivo_hard_fail, observaciones_rapidas, archivo_fuente'
    )
    .eq('postulante_id', postulanteId)
    .order('created_at', { ascending: false });

  const filas = (evalFilas ?? []) as unknown as Array<{
    id: string;
    dictamen: string | null;
    asistencia_cabina: string | null;
    nivel_asistencia: string | null;
    bloque_split: string | null;
    score_puntos: number | string | null;
    hard_fail: boolean | null;
    motivo_hard_fail: string | null;
    observaciones_rapidas: string[] | null;
    archivo_fuente: string | null;
  }>;

  const filaCabina =
    filas.find((f) => esArchivoTablet(f.archivo_fuente)) ?? filas[0] ?? null;

  const contexto: ContextoPostulanteIA = {
    nombreCompleto: rel.nombre_completo,
    dni: rel.dni,
    dictamenCabina: filaCabina?.dictamen ?? null,
    nivelAsistenciaCabina: filaCabina?.nivel_asistencia ?? null,
    asistenciaCabinaLegacy: filaCabina?.asistencia_cabina ?? null,
    bloqueSplit: filaCabina?.bloque_split ?? null,
    scoreCabina: numeroOrNull(filaCabina?.score_puntos),
    hardFailCabina: filaCabina?.hard_fail === true,
    motivoHardFailCabina: filaCabina?.motivo_hard_fail ?? null,
    observacionesCabina: Array.isArray(filaCabina?.observaciones_rapidas)
      ? filaCabina.observaciones_rapidas
      : null,
    notasEmpleo: insc.obs_empleo,
  };

  const informe = await generarInformeEmpleoIA(metricas, contexto);

  let persistido = false;
  if (filaCabina?.id) {
    const { error: errPersist } = await supabase
      .from('evaluacion_diagnostico')
      .update({
        telemetria_archivo_nombre: archivoNombre,
        telemetria_metricas: metricas,
        informe_ia: informe,
      })
      .eq('id', filaCabina.id)
      .eq('postulante_id', postulanteId);

    if (errPersist) {
      console.error('[analizarTelemetriaPostulanteAction] Error al persistir informe:', {
        code: errPersist.code,
        message: errPersist.message,
      });
    } else {
      persistido = true;
    }
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true, informe, persistido };
}
