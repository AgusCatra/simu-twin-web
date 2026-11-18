'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import {
  CONFIGURACION_CURSADO_DEFECTO,
  mapearFranjasActivasACodigos,
  normalizarConfiguracionCursado,
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
import type {
  MetricasSimulador,
  PerfilOperador,
} from '@/lib/telemetria/parser-simulador';
import type {
  EstadoEgreso,
  FranjaCursado,
  GrupoCursado,
  PerfilLaboral,
  RolSesion,
} from '@/types/cohorte-v2';
import type {
  ActualizarAsistenciaSesionInput,
  AnalizarTelemetriaIAInput,
  CohorteResumen,
  ComparativaProgreso,
  ConfiguracionCohorteInput,
  CrearCohorteInput,
  CrearPostulanteInput,
  DatosCohorteActiva,
  DuplaPersistidaItem,
  EjeRadar,
  EstadoAsistenciaUI,
  EstadoCohorte,
  EstadoInscripcion,
  EtapaEvaluacion,
  EvaluacionFinalEgresoItem,
  EvaluacionReceptividad,
  FichaEvaluacion,
  FranjaCabina,
  GuardarEgresoLegajoInput,
  Legajo360Postulante,
  MetricasIntento,
  OcupanteFranja,
  PostulanteFila,
  PracticaRealItem,
  PuntoRadar,
  ResultadoAccion,
  ResultadoAnalisisIA,
  ResultadoCrearCohorte,
  ResultadoCrearPostulante,
  ResultadoEgresoAccion,
  ResultadoPracticaReal,
  ResultadoPracticaRealAccion,
  ResultadoSincronizarDuplas,
  SesionPracticaItem,
  SincronizarDuplasInput,
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
  estado: string | null;
  fecha_teoria: string | null;
  fecha_inicio_sim: string | null;
  fecha_fin_sim: string | null;
  fecha_pase_planta: string | null;
  cant_dias_sim: number | null;
  max_titulares: number | null;
  configuracion_cursado?: unknown;
}

interface FilaDuplaDB {
  id: string;
  cohorte_id: string;
  grupo: string;
  franja: string;
  alumno_1_id: string;
  alumno_2_id: string;
  activo: boolean;
}

interface FilaSesionPracticaDB {
  id: string;
  cohorte_id: string;
  dupla_id: string;
  alumno_id: string;
  numero_sesion: number;
  fecha_programada: string;
  fecha_real: string | null;
  es_recuperatorio_viernes: boolean;
  estado_asistencia: string;
  rol_inicio: string;
  minutos_operacion: number;
  minutos_observacion: number;
  observaciones_instructor: string | null;
}

interface FilaCohorteResumenDB {
  id: string;
  codigo: string;
  nombre: string;
  estado: string | null;
  tipo_maquinaria: string | null;
  fecha_teoria: string | null;
  fecha_inicio_sim: string | null;
  created_at: string | null;
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
  perfil_operador?: string | null;
  horas_recomendadas?: number | string | null;
  modulos_recomendados?: unknown;
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

const PERFILES_OPERADOR_VALIDOS: readonly PerfilOperador[] = [
  'NOVATO',
  'SIN_NOCION_ESPACIO',
  'APURADO',
  'INEFICIENTE',
  'EFICIENTE',
];

function normalizarPerfilOperador(v: unknown): PerfilOperador | null {
  return typeof v === 'string' &&
    (PERFILES_OPERADOR_VALIDOS as readonly string[]).includes(v)
    ? (v as PerfilOperador)
    : null;
}

function normalizarModulosGuardados(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const lista = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return lista.length > 0 ? lista : null;
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

  const informeGuardado = filaConIA
    ? normalizarInformeGuardado(filaConIA.informe_ia)
    : null;

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
    informe_ia: informeGuardado,
    perfil_operador:
      normalizarPerfilOperador(filaConIA?.perfil_operador) ??
      normalizarPerfilOperador(informeGuardado?.perfilOperador) ??
      null,
    horas_recomendadas:
      numeroOrNull(filaConIA?.horas_recomendadas) ??
      (typeof informeGuardado?.horasRecomendadas === 'number'
        ? informeGuardado.horasRecomendadas
        : null),
    modulos_recomendados:
      normalizarModulosGuardados(filaConIA?.modulos_recomendados) ??
      normalizarModulosGuardados(informeGuardado?.modulosRecomendados) ??
      null,
  };
}

function esTurnoFranja(v: string): v is TurnoFranja {
  return v === 'Mañana' || v === 'Tarde';
}

function esEstadoInscripcion(v: string): v is EstadoInscripcion {
  return (ESTADOS_VALIDOS as readonly string[]).includes(v);
}

function esEstadoCohorte(v: string | null | undefined): EstadoCohorte {
  if (v === 'activa' || v === 'finalizada' || v === 'borrador') return v;
  return 'borrador';
}

const PREFIJO_REPROGRAMADA = '[REPROGRAMADA]';

function mapearEstadoAsistenciaDBaUI(
  fila: Pick<
    FilaSesionPracticaDB,
    'estado_asistencia' | 'es_recuperatorio_viernes' | 'fecha_real' | 'observaciones_instructor'
  >
): EstadoAsistenciaUI {
  if (fila.estado_asistencia === 'PRESENTE') return 'PRESENTE';
  if (fila.estado_asistencia === 'AUSENTE_JUSTIFICADO') {
    return 'AUSENTE_JUSTIFICADO';
  }
  if (fila.estado_asistencia === 'AUSENTE_INJUSTIFICADO') {
    return 'AUSENTE_INJUSTIFICADO';
  }
  if (fila.estado_asistencia === 'REPROGRAMADA') return 'REPROGRAMADA';
  if (
    fila.es_recuperatorio_viernes ||
    Boolean(fila.fecha_real) ||
    (fila.observaciones_instructor ?? '').includes(PREFIJO_REPROGRAMADA)
  ) {
    return 'REPROGRAMADA';
  }
  return 'PENDIENTE';
}

function esGrupoCursado(v: string): v is GrupoCursado {
  return v === 'GRUPO_A' || v === 'GRUPO_B';
}

function esFranjaCursado(v: string): v is FranjaCursado {
  return (
    v === 'M1_10_11' ||
    v === 'M2_11_12' ||
    v === 'T1_16_17' ||
    v === 'T2_17_18'
  );
}

function mapearSesionDB(
  fila: FilaSesionPracticaDB
): SesionPracticaItem {
  const obsLimpia = (fila.observaciones_instructor ?? '')
    .replace(PREFIJO_REPROGRAMADA, '')
    .trim();

  return {
    id: fila.id,
    cohorte_id: fila.cohorte_id,
    dupla_id: fila.dupla_id,
    alumno_id: fila.alumno_id,
    numero_sesion: fila.numero_sesion,
    fecha_programada: (fila.fecha_programada ?? '').split('T')[0],
    fecha_real: fila.fecha_real ? fila.fecha_real.split('T')[0] : null,
    es_recuperatorio_viernes: fila.es_recuperatorio_viernes === true,
    estado_asistencia: mapearEstadoAsistenciaDBaUI(fila),
    rol_inicio:
      fila.rol_inicio === 'COPILOTO_INICIAL'
        ? 'COPILOTO_INICIAL'
        : 'PILOTO_INICIAL',
    minutos_operacion: numeroOrNull(fila.minutos_operacion) ?? 30,
    minutos_observacion: numeroOrNull(fila.minutos_observacion) ?? 30,
    observaciones_instructor: obsLimpia.length > 0 ? obsLimpia : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura del panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista todas las cohortes registradas ordenadas por fecha de inicio descendente
 * (y creación descendente como desempate) para el selector de cohorte activa / histórica.
 */
export async function listarCohortesDisponibles(): Promise<CohorteResumen[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('cohortes')
    .select(
      'id, codigo, nombre, estado, tipo_maquinaria, fecha_teoria, fecha_inicio_sim, created_at'
    )
    .order('fecha_inicio_sim', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .returns<FilaCohorteResumenDB[]>();

  if (error) {
    console.error('[listarCohortesDisponibles] Error al listar cohortes:', {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    estado: esEstadoCohorte(c.estado),
    tipo_maquinaria: c.tipo_maquinaria ?? null,
    fecha_teoria: c.fecha_teoria ?? null,
    fecha_inicio_sim: c.fecha_inicio_sim ?? null,
  }));
}

/**
 * Carga la cohorte solicitada por ID (si es UUID válido y existe), o en su
 * defecto la cohorte con `estado = 'activa'`, o la más reciente disponible.
 * Filtra franjas_cabina y cohorte_inscripciones estrictamente por ese `cohorte_id`.
 */
export async function obtenerDatosCohorteActiva(
  cohorteIdSolicitada?: string | null
): Promise<DatosCohorteActiva | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const COLUMNAS_COHORTE =
    'id, codigo, nombre, estado, fecha_teoria, fecha_inicio_sim, fecha_fin_sim, fecha_pase_planta, cant_dias_sim, max_titulares, configuracion_cursado';

  const cohorteIdLimpia =
    typeof cohorteIdSolicitada === 'string' ? cohorteIdSolicitada.trim() : '';

  let filaCohorte: FilaCohorte | null = null;

  if (UUID_RE.test(cohorteIdLimpia)) {
    const { data, error } = await supabase
      .from('cohortes')
      .select(COLUMNAS_COHORTE)
      .eq('id', cohorteIdLimpia)
      .maybeSingle<FilaCohorte>();

    if (error) {
      console.error('[obtenerDatosCohorteActiva] Error al buscar cohorte solicitada:', {
        code: error.code,
        message: error.message,
      });
    } else {
      filaCohorte = data ?? null;
    }
  }

  if (!filaCohorte) {
    const { data: cohorteActiva, error: errActiva } = await supabase
      .from('cohortes')
      .select(COLUMNAS_COHORTE)
      .eq('estado', 'activa')
      .order('fecha_inicio_sim', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<FilaCohorte>();

    if (errActiva) {
      console.error('[obtenerDatosCohorteActiva] Error al buscar cohorte activa:', {
        code: errActiva.code,
        message: errActiva.message,
      });
      return null;
    }
    filaCohorte = cohorteActiva ?? null;
  }

  if (!filaCohorte) {
    const { data: cohorteReciente, error: errReciente } = await supabase
      .from('cohortes')
      .select(COLUMNAS_COHORTE)
      .order('fecha_inicio_sim', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<FilaCohorte>();

    if (errReciente) {
      console.error('[obtenerDatosCohorteActiva] Error al buscar última cohorte:', {
        code: errReciente.code,
        message: errReciente.message,
      });
      return null;
    }
    filaCohorte = cohorteReciente ?? null;
  }

  if (!filaCohorte) return null;

  const [
    { data: franjas, error: errFranjas },
    { data: inscripciones, error: errInscripciones },
    { data: filasDuplas, error: errDuplas },
    { data: filasSesiones, error: errSesiones },
  ] = await Promise.all([
    supabase
      .from('franjas_cabina')
      .select('id, turno, horario_label, hora_inicio, hora_fin, cupo_maximo')
      .eq('cohorte_id', filaCohorte.id)
      .order('hora_inicio', { ascending: true }),
    supabase
      .from('cohorte_inscripciones')
      .select(
        `id, ranking_orden, estado, motivo_baja, obs_empleo, franja_id, postulante_id,
         postulantes(nombre_completo, dni, origen_turno,
           evaluacion_diagnostico(id, created_at, dictamen, asistencia_cabina,
             nivel_asistencia, bloque_split, telemetria_archivo_nombre,
             telemetria_metricas, informe_ia,
             perfil_operador, horas_recomendadas, modulos_recomendados,
             archivo_fuente, etapa, es_mejor_diagnostico,
             hard_fail, motivo_hard_fail, instructor_evaluador,
             observaciones_rapidas, observaciones_detalle,
             puntaje_lateralidad, puntaje_tacto_mandos, puntaje_mastil,
             puntaje_control_receptividad, eje_lateralidad, eje_tacto_mandos,
             eje_mastil, eje_control_receptividad, tiempo_vuelta_seg, colisiones,
             colisiones_descartadas, score_puntos))`
      )
      .eq('cohorte_id', filaCohorte.id)
      .order('ranking_orden', { ascending: true }),
    supabase
      .from('duplas_cabina')
      .select('id, cohorte_id, grupo, franja, alumno_1_id, alumno_2_id, activo')
      .eq('cohorte_id', filaCohorte.id)
      .eq('activo', true)
      .returns<FilaDuplaDB[]>(),
    supabase
      .from('sesiones_practica')
      .select(
        'id, cohorte_id, dupla_id, alumno_id, numero_sesion, fecha_programada, fecha_real, es_recuperatorio_viernes, estado_asistencia, rol_inicio, minutos_operacion, minutos_observacion, observaciones_instructor'
      )
      .eq('cohorte_id', filaCohorte.id)
      .order('numero_sesion', { ascending: true })
      .returns<FilaSesionPracticaDB[]>(),
  ]);

  if (errDuplas) {
    console.error('[obtenerDatosCohorteActiva] Aviso al leer duplas_cabina:', {
      code: errDuplas.code,
      message: errDuplas.message,
    });
  }
  if (errSesiones) {
    console.error('[obtenerDatosCohorteActiva] Aviso al leer sesiones_practica:', {
      code: errSesiones.code,
      message: errSesiones.message,
    });
  }

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

  const configCursado = normalizarConfiguracionCursado(
    filaCohorte.configuracion_cursado
  );
  const mapeoFranjas = mapearFranjasActivasACodigos(
    configCursado.franjas_activas
  );
  const labelPorCodigo = new Map<FranjaCursado, string>();
  for (const m of mapeoFranjas) {
    if (!labelPorCodigo.has(m.codigo)) {
      labelPorCodigo.set(m.codigo, m.label);
    }
  }

  const duplasPersistidas: DuplaPersistidaItem[] = [];
  for (const d of filasDuplas ?? []) {
    if (!esGrupoCursado(d.grupo) || !esFranjaCursado(d.franja)) continue;
    duplasPersistidas.push({
      id: d.id,
      cohorte_id: d.cohorte_id,
      grupo: d.grupo,
      franja: d.franja,
      horario_label: labelPorCodigo.get(d.franja) ?? d.franja,
      alumno_1_id: d.alumno_1_id,
      alumno_2_id: d.alumno_2_id,
      activo: d.activo !== false,
    });
  }

  const sesionesPractica: SesionPracticaItem[] = (filasSesiones ?? []).map(
    (s) => mapearSesionDB(s)
  );

  return {
    cohorte: {
      id: filaCohorte.id,
      codigo: filaCohorte.codigo,
      nombre: filaCohorte.nombre,
      estado: esEstadoCohorte(filaCohorte.estado),
      fecha_teoria: filaCohorte.fecha_teoria,
      fecha_inicio_sim: filaCohorte.fecha_inicio_sim,
      fecha_fin_sim: filaCohorte.fecha_fin_sim,
      fecha_pase_planta: filaCohorte.fecha_pase_planta,
      cant_dias_sim:
        numeroOrNull(filaCohorte.cant_dias_sim) ??
        configCursado.sesiones_objetivo,
      max_titulares: numeroOrNull(filaCohorte.max_titulares) ?? 0,
      configuracion_cursado: configCursado,
    },
    franjas: franjasDto,
    postulantes,
    totalConfirmados,
    duplasPersistidas,
    sesionesPractica,
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
        .select('id, configuracion_cursado')
        .eq('id', cohorte_id.trim())
        .maybeSingle<{ id: string; configuracion_cursado: unknown }>(),
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

  const configCursado = normalizarConfiguracionCursado(
    configuracion.configuracion_cursado ?? cohorte.configuracion_cursado
  );

  if (configCursado.dias_grupo_a.length === 0) {
    return { ok: false, error: 'El Grupo A debe tener al menos un día de cursado.' };
  }
  if (configCursado.franjas_activas.length === 0) {
    return { ok: false, error: 'Debe configurar al menos una franja horaria.' };
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
      configuracionCursado: configCursado,
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
      cant_dias_sim: configCursado.sesiones_objetivo,
      total_sesiones_requeridas: configCursado.sesiones_objetivo,
      configuracion_cursado: configCursado,
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
  postulante_id: string,
  cohorte_id?: string | null
): Promise<ComparativaProgreso | null> {
  if (!idsValidos(postulante_id) || !UUID_RE.test(postulante_id.trim())) return null;

  const postulanteId = postulante_id.trim();
  const cohorteIdInput =
    typeof cohorte_id === 'string' ? cohorte_id.trim() : '';
  if (cohorteIdInput && !UUID_RE.test(cohorteIdInput)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let cohorteIdValidada = cohorteIdInput;
  if (!cohorteIdValidada) {
    const { data: cohorteActiva } = await supabase
      .from('cohortes')
      .select('id')
      .eq('estado', 'activa')
      .order('fecha_inicio_sim', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    cohorteIdValidada = cohorteActiva?.id ?? '';
  }

  // Anti-IDOR: el postulante debe estar inscripto en la cohorte solicitada (o en alguna cohorte existente).
  let inscQuery = supabase
    .from('cohorte_inscripciones')
    .select('id')
    .eq('postulante_id', postulanteId)
    .limit(1);

  if (cohorteIdValidada) {
    inscQuery = inscQuery.eq('cohorte_id', cohorteIdValidada);
  }

  const { data: insc, error: errInsc } = await inscQuery.maybeSingle<{ id: string }>();
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
    .eq('postulante_id', postulanteId)
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
    picosAceleracion: numOrNull(obj.picosAceleracion, 0, 1000),
    porcentajeAceleradorFondo: numOrNull(obj.porcentajeAceleradorFondo, 0, 100),
    muestrasHorquillaElevada: numOrNull(obj.muestrasHorquillaElevada, 0, 100000),
    porcentajeCirculacionHorquillaAlta: numOrNull(
      obj.porcentajeCirculacionHorquillaAlta,
      0,
      100
    ),
    alturaMaximaHorquillaM: numOrNull(obj.alturaMaximaHorquillaM, 0, 20),
    oscilacionesMastil: numOrNull(obj.oscilacionesMastil, 0, 1000),
    indiceInestabilidadTilt: numOrNull(obj.indiceInestabilidadTilt, 0, 100),
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

  const configCursado = normalizarConfiguracionCursado(
    input.configuracion_cursado ?? CONFIGURACION_CURSADO_DEFECTO
  );

  if (configCursado.dias_grupo_a.length === 0) {
    return { ok: false, error: 'El Grupo A debe tener al menos un día de cursado.' };
  }
  if (configCursado.franjas_activas.length === 0) {
    return { ok: false, error: 'Debe configurar al menos una franja horaria.' };
  }

  let proyeccion;
  try {
    parsearFechaUtc(fechaTeoria);
    const fechaInicioSimulador = obtenerProximoLunesPosterior(fechaTeoria);
    proyeccion = proyectarCalendarioCohorteV2({
      fechaInicioTeoria: fechaTeoria,
      fechaInicioSimulador,
      diasBloqueados,
      estrategiaFeriados: 'MOVER_A_VIERNES',
      configuracionCursado: configCursado,
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
      cant_dias_sim: configCursado.sesiones_objetivo,
      max_titulares: maxTitulares,
      cupo_alumnos: cupoAlumnos,
      duracion_semanas: 3,
      total_sesiones_requeridas: configCursado.sesiones_objetivo,
      configuracion_cursado: configCursado,
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

  const cohorteIdInput =
    typeof input.cohorte_id === 'string' ? input.cohorte_id.trim() : '';
  if (cohorteIdInput && !UUID_RE.test(cohorteIdInput)) {
    return { ok: false, error: 'Identificador de cohorte inválido.' };
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

  let cohorteIdValidada = '';
  if (cohorteIdInput) {
    const { data: cohorteSol } = await supabase
      .from('cohortes')
      .select('id')
      .eq('id', cohorteIdInput)
      .maybeSingle<{ id: string }>();
    if (!cohorteSol?.id) {
      return { ok: false, error: 'La cohorte seleccionada no existe.' };
    }
    cohorteIdValidada = cohorteSol.id;
  } else {
    const { data: cohorteActiva } = await supabase
      .from('cohortes')
      .select('id')
      .eq('estado', 'activa')
      .order('fecha_inicio_sim', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    cohorteIdValidada = cohorteActiva?.id ?? '';
  }

  if (!cohorteIdValidada) {
    return { ok: false, error: 'No hay una cohorte válida para verificar la inscripción.' };
  }

  // Anti-IDOR: el postulante debe estar inscripto en la cohorte consultada.
  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select(
      'id, obs_empleo, postulantes(nombre_completo, dni)'
    )
    .eq('cohorte_id', cohorteIdValidada)
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
      error: 'El postulante no pertenece a la cohorte seleccionada.',
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
      'id, created_at, dictamen, asistencia_cabina, nivel_asistencia, bloque_split, score_puntos, puntaje_lateralidad, puntaje_tacto_mandos, puntaje_mastil, puntaje_control_receptividad, hard_fail, motivo_hard_fail, observaciones_rapidas, archivo_fuente'
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
    puntaje_lateralidad: number | null;
    puntaje_tacto_mandos: number | null;
    puntaje_mastil: number | null;
    puntaje_control_receptividad: number | null;
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
    puntajeLateralidad: numeroOrNull(filaCabina?.puntaje_lateralidad),
    puntajeTactoMandos: numeroOrNull(filaCabina?.puntaje_tacto_mandos),
    puntajeMastil: numeroOrNull(filaCabina?.puntaje_mastil),
    puntajeControlReceptividad: numeroOrNull(
      filaCabina?.puntaje_control_receptividad
    ),
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
    const payloadUpdateBase = {
      telemetria_archivo_nombre: archivoNombre,
      telemetria_metricas: metricas,
      informe_ia: informe,
    };
    const payloadUpdateCompleto = {
      ...payloadUpdateBase,
      perfil_operador: informe.perfilOperador ?? null,
      horas_recomendadas: informe.horasRecomendadas ?? null,
      modulos_recomendados: informe.modulosRecomendados ?? [],
    };

    const { error: errPersist } = await supabase
      .from('evaluacion_diagnostico')
      .update(payloadUpdateCompleto)
      .eq('id', filaCabina.id)
      .eq('postulante_id', postulanteId);

    if (errPersist?.code === '42703') {
      const { error: errFallback } = await supabase
        .from('evaluacion_diagnostico')
        .update(payloadUpdateBase)
        .eq('id', filaCabina.id)
        .eq('postulante_id', postulanteId);

      if (errFallback) {
        console.error('[analizarTelemetriaPostulanteAction] Error al persistir (fallback):', {
          code: errFallback.code,
          message: errFallback.message,
        });
      } else {
        persistido = true;
      }
    } else if (errPersist) {
      console.error('[analizarTelemetriaPostulanteAction] Error al persistir informe:', {
        code: errPersist.code,
        message: errPersist.message,
      });
    } else {
      persistido = true;
    }
  } else {
    const tiempoSegRedondeado =
      typeof metricas.tiempoDuracionSeg === 'number' &&
      Number.isFinite(metricas.tiempoDuracionSeg)
        ? Math.max(0, Math.round(metricas.tiempoDuracionSeg))
        : null;

    const payloadInsertBase = {
      postulante_id: postulanteId,
      etapa: 'DIAG_INTENTO_1',
      es_mejor_diagnostico: true,
      asistencia_cabina: 'MINIMA_AUTONOMO',
      dictamen: informe.dictamenSugerido,
      tiempo_vuelta_seg: tiempoSegRedondeado,
      colisiones: metricas.colisionesReales,
      colisiones_descartadas: metricas.colisionesDescartadas,
      score_puntos: metricas.scorePuntos,
      archivo_fuente: archivoNombre,
      telemetria_archivo_nombre: archivoNombre,
      telemetria_metricas: metricas,
      informe_ia: informe,
    };
    const payloadInsertCompleto = {
      ...payloadInsertBase,
      perfil_operador: informe.perfilOperador ?? null,
      horas_recomendadas: informe.horasRecomendadas ?? null,
      modulos_recomendados: informe.modulosRecomendados ?? [],
    };

    const { error: errInsert } = await supabase
      .from('evaluacion_diagnostico')
      .insert(payloadInsertCompleto);

    if (errInsert?.code === '42703') {
      const { error: errInsertFallback } = await supabase
        .from('evaluacion_diagnostico')
        .insert(payloadInsertBase);

      if (errInsertFallback) {
        console.error('[analizarTelemetriaPostulanteAction] Error al insertar fila inicial (fallback):', {
          code: errInsertFallback.code,
          message: errInsertFallback.message,
        });
      } else {
        persistido = true;
      }
    } else if (errInsert) {
      console.error('[analizarTelemetriaPostulanteAction] Error al insertar fila inicial:', {
        code: errInsert.code,
        message: errInsert.message,
      });
    } else {
      persistido = true;
    }
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true, informe, persistido };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloque 2: Sincronización de Duplas, Asistencia, Práctica Real y Legajo 360°
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET_PRACTICA_REAL = 'expedientes-practica-real';
const MAX_PDF_PRACTICA_BYTES = 10 * 1024 * 1024;
const ESTADOS_ASISTENCIA_UI_VALIDOS: readonly EstadoAsistenciaUI[] = [
  'PENDIENTE',
  'PRESENTE',
  'AUSENTE_JUSTIFICADO',
  'AUSENTE_INJUSTIFICADO',
  'REPROGRAMADA',
];
const RESULTADOS_PRACTICA_VALIDOS: readonly ResultadoPracticaReal[] = [
  'aprobado',
  'requiere_refuerzo',
  'no_apto',
];
const ESTADOS_EGRESO_VALIDOS: readonly EstadoEgreso[] = [
  'CERTIFICADO',
  'INCOMPLETO',
  'ABANDONO',
];
const PERFILES_LABORALES_VALIDOS: readonly PerfilLaboral[] = [
  'DESTACADO',
  'ESTANDAR',
  'CON_OBSERVACIONES',
  'NO_RECOMENDADO',
];

function esFechaIsoValida(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const limpia = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return false;
  try {
    parsearFechaUtc(limpia);
    return true;
  } catch {
    return false;
  }
}

function sanitizarNombreArchivoPdf(nombre: string): string {
  const base = nombre
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${base || 'expediente'}.pdf`;
}

function tieneCabeceraPdfValida(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  // %PDF-
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function obtenerFechaBaseCalendarioHoy(): string {
  const hoy = new Date();
  return hoy.toISOString().split('T')[0];
}

function calcularViernesMismaSemanaIso(fechaIso: string): string {
  const d = parsearFechaUtc(fechaIso);
  const dia = d.getUTCDay(); // 0 dom..6 sab
  const deltaViernes = dia === 0 ? 5 : 5 - dia;
  const target = new Date(d.getTime());
  target.setUTCDate(target.getUTCDate() + (deltaViernes >= 0 ? deltaViernes : deltaViernes + 7));
  return target.toISOString().split('T')[0];
}

function decodificarLegacyPractica(obsRaw: string | null): {
  resultadoMeta: ResultadoPracticaReal | null;
  lugarPredio: string | null;
  maquinaUtilizada: string | null;
  observacionesLimpias: string | null;
} {
  if (!obsRaw) {
    return {
      resultadoMeta: null,
      lugarPredio: null,
      maquinaUtilizada: null,
      observacionesLimpias: null,
    };
  }
  const match = obsRaw.match(/^\[TERRENO\|res=([^|\]]*)\|lugar=([^|\]]*)\|maq=([^\]]*)\]\s*([\s\S]*)$/);
  if (!match) {
    return {
      resultadoMeta: null,
      lugarPredio: null,
      maquinaUtilizada: null,
      observacionesLimpias: obsRaw.trim() || null,
    };
  }
  const resRaw = match[1].trim();
  const resultadoMeta = RESULTADOS_PRACTICA_VALIDOS.includes(
    resRaw as ResultadoPracticaReal
  )
    ? (resRaw as ResultadoPracticaReal)
    : null;
  const lugarPredio = match[2].trim() || null;
  const maquinaUtilizada = match[3].trim() || null;
  const observacionesLimpias = match[4].trim() || null;
  return { resultadoMeta, lugarPredio, maquinaUtilizada, observacionesLimpias };
}

async function generarUrlFirmadaPractica(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null
): Promise<string | null> {
  if (!path) return null;
  const storageClient = createAdminClient() ?? supabase;
  const { data, error } = await storageClient.storage
    .from(BUCKET_PRACTICA_REAL)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Sincroniza la parrilla oficial de Duplas en `public.duplas_cabina` y genera
 * (preservando asistencias previas por alumno y sesión) sus `sesiones_practica`.
 */
export async function sincronizarDuplasYSesionesAction(
  input: SincronizarDuplasInput
): Promise<ResultadoSincronizarDuplas> {
  if (!input || !UUID_RE.test(input.cohorte_id ?? '')) {
    return { ok: false, error: 'Cohorte inválida.' };
  }
  if (!Array.isArray(input.asignaciones) || input.asignaciones.length === 0) {
    return { ok: false, error: 'Debe haber al menos una dupla completa para sincronizar.' };
  }
  if (input.asignaciones.length > 16) {
    return { ok: false, error: 'Cantidad máxima de duplas excedida.' };
  }

  const cohorteId = input.cohorte_id.trim();
  const clavesFranja = new Set<string>();
  const alumnosEnDuplas = new Set<string>();

  for (const a of input.asignaciones) {
    if (!a || !esGrupoCursado(a.grupo) || !esFranjaCursado(a.franja)) {
      return { ok: false, error: 'Grupo o franja de cursado inválida.' };
    }
    if (!UUID_RE.test(a.alumno_1_id) || !UUID_RE.test(a.alumno_2_id)) {
      return { ok: false, error: 'Cada dupla requiere dos postulantes válidos.' };
    }
    if (a.alumno_1_id === a.alumno_2_id) {
      return { ok: false, error: 'Una dupla no puede asignar dos veces al mismo postulante.' };
    }
    const claveSlot = `${a.grupo}::${a.franja}`;
    if (clavesFranja.has(claveSlot)) {
      return { ok: false, error: `Franja duplicada en ${a.grupo} (${a.franja}).` };
    }
    clavesFranja.add(claveSlot);

    if (alumnosEnDuplas.has(a.alumno_1_id) || alumnosEnDuplas.has(a.alumno_2_id)) {
      return { ok: false, error: 'Un mismo postulante no puede figurar en más de una dupla.' };
    }
    alumnosEnDuplas.add(a.alumno_1_id);
    alumnosEnDuplas.add(a.alumno_2_id);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const [
    { data: cohorte, error: errCohorte },
    { data: filasFeriados },
    { data: inscripciones, error: errInsc },
    { data: sesionesPrevias },
  ] = await Promise.all([
    supabase
      .from('cohortes')
      .select('id, fecha_teoria, fecha_inicio_sim, configuracion_cursado')
      .eq('id', cohorteId)
      .maybeSingle<{
        id: string;
        fecha_teoria: string | null;
        fecha_inicio_sim: string | null;
        configuracion_cursado: unknown;
      }>(),
    supabase
      .from('feriados_municipales')
      .select('fecha')
      .order('fecha', { ascending: true })
      .returns<Array<{ fecha: string | null }>>(),
    supabase
      .from('cohorte_inscripciones')
      .select('postulante_id, estado')
      .eq('cohorte_id', cohorteId)
      .returns<Array<{ postulante_id: string; estado: string }>>(),
    supabase
      .from('sesiones_practica')
      .select(
        'alumno_id, numero_sesion, fecha_real, es_recuperatorio_viernes, estado_asistencia, rol_inicio, minutos_operacion, minutos_observacion, observaciones_instructor'
      )
      .eq('cohorte_id', cohorteId)
      .returns<
        Array<{
          alumno_id: string;
          numero_sesion: number;
          fecha_real: string | null;
          es_recuperatorio_viernes: boolean;
          estado_asistencia: string;
          rol_inicio: string;
          minutos_operacion: number;
          minutos_observacion: number;
          observaciones_instructor: string | null;
        }>
      >(),
  ]);

  if (errCohorte || !cohorte) {
    return { ok: false, error: 'Cohorte no encontrada.' };
  }
  if (errInsc) {
    return { ok: false, error: 'No se pudo verificar la nómina de postulantes de la cohorte.' };
  }

  const elegibles = new Set(
    (inscripciones ?? [])
      .filter((i) => i.estado !== 'DESCARTADO')
      .map((i) => i.postulante_id)
  );
  for (const alumnoId of alumnosEnDuplas) {
    if (!elegibles.has(alumnoId)) {
      return {
        ok: false,
        error: 'Uno de los postulantes seleccionados no pertenece como activo a esta cohorte.',
      };
    }
  }

  const configCursado = normalizarConfiguracionCursado(cohorte.configuracion_cursado);
  const diasBloqueados = (filasFeriados ?? [])
    .map((f) => (typeof f.fecha === 'string' ? f.fecha.split('T')[0] : ''))
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f));

  const fechaTeoriaBase = esFechaIsoValida(cohorte.fecha_teoria)
    ? cohorte.fecha_teoria
    : obtenerFechaBaseCalendarioHoy();
  const fechaInicioSim = esFechaIsoValida(cohorte.fecha_inicio_sim)
    ? cohorte.fecha_inicio_sim
    : obtenerProximoLunesPosterior(fechaTeoriaBase);

  let proyeccion;
  try {
    proyeccion = proyectarCalendarioCohorteV2({
      fechaInicioTeoria: fechaTeoriaBase,
      fechaInicioSimulador: fechaInicioSim,
      diasBloqueados,
      estrategiaFeriados: 'MOVER_A_VIERNES',
      configuracionCursado: configCursado,
    });
  } catch {
    return { ok: false, error: 'No se pudo proyectar el calendario de sesiones de la cohorte.' };
  }

  // Backup en memoria de asistencias/notas previas antes de regenerar las duplas.
  const backupSesiones = new Map<
    string,
    {
      fecha_real: string | null;
      es_recuperatorio_viernes: boolean;
      estado_asistencia: string;
      minutos_operacion: number;
      minutos_observacion: number;
      observaciones_instructor: string | null;
    }
  >();
  for (const prev of sesionesPrevias ?? []) {
    backupSesiones.set(`${prev.alumno_id}::${prev.numero_sesion}`, {
      fecha_real: prev.fecha_real,
      es_recuperatorio_viernes: prev.es_recuperatorio_viernes === true,
      estado_asistencia: prev.estado_asistencia,
      minutos_operacion: numeroOrNull(prev.minutos_operacion) ?? 30,
      minutos_observacion: numeroOrNull(prev.minutos_observacion) ?? 30,
      observaciones_instructor: prev.observaciones_instructor ?? null,
    });
  }

  const { error: errDelDuplas } = await supabase
    .from('duplas_cabina')
    .delete()
    .eq('cohorte_id', cohorteId);

  if (errDelDuplas) {
    console.error('[sincronizarDuplasYSesionesAction] Error al limpiar duplas previas:', {
      code: errDelDuplas.code,
      message: errDelDuplas.message,
    });
    return { ok: false, error: 'No se pudo reemplazar la grilla previa de duplas.' };
  }

  const { data: duplasCreadas, error: errInsDuplas } = await supabase
    .from('duplas_cabina')
    .insert(
      input.asignaciones.map((a) => ({
        cohorte_id: cohorteId,
        grupo: a.grupo,
        franja: a.franja,
        alumno_1_id: a.alumno_1_id,
        alumno_2_id: a.alumno_2_id,
        activo: true,
      }))
    )
    .select('id, grupo, franja, alumno_1_id, alumno_2_id')
    .returns<
      Array<{
        id: string;
        grupo: string;
        franja: string;
        alumno_1_id: string;
        alumno_2_id: string;
      }>
    >();

  if (errInsDuplas || !duplasCreadas) {
    console.error('[sincronizarDuplasYSesionesAction] Error al insertar duplas:', {
      code: errInsDuplas?.code,
      message: errInsDuplas?.message,
    });
    return {
      ok: false,
      error:
        errInsDuplas?.code === '23505'
          ? 'Conflicto de franja o postulante duplicado al guardar duplas.'
          : 'No se pudieron guardar las duplas en base de datos.',
    };
  }

  interface PayloadSesionInsert {
    cohorte_id: string;
    dupla_id: string;
    alumno_id: string;
    numero_sesion: number;
    fecha_programada: string;
    fecha_real: string | null;
    es_recuperatorio_viernes: boolean;
    estado_asistencia: string;
    rol_inicio: RolSesion;
    minutos_operacion: number;
    minutos_observacion: number;
    observaciones_instructor: string | null;
  }

  const sesionesAInsertar: PayloadSesionInsert[] = [];

  for (const dupla of duplasCreadas) {
    const planificadas = proyeccion.matrizSesiones.filter(
      (s) => s.grupo === dupla.grupo && s.franja === dupla.franja
    );

    for (const s of planificadas) {
      const esImpar = s.numeroSesion % 2 === 1;
      const pareja: Array<{ alumnoId: string; rol: RolSesion }> = [
        {
          alumnoId: dupla.alumno_1_id,
          rol: esImpar ? 'PILOTO_INICIAL' : 'COPILOTO_INICIAL',
        },
        {
          alumnoId: dupla.alumno_2_id,
          rol: esImpar ? 'COPILOTO_INICIAL' : 'PILOTO_INICIAL',
        },
      ];

      for (const miembro of pareja) {
        const previa = backupSesiones.get(`${miembro.alumnoId}::${s.numeroSesion}`);
        sesionesAInsertar.push({
          cohorte_id: cohorteId,
          dupla_id: dupla.id,
          alumno_id: miembro.alumnoId,
          numero_sesion: s.numeroSesion,
          fecha_programada: s.fechaProgramada,
          fecha_real: previa?.fecha_real ?? null,
          es_recuperatorio_viernes:
            previa?.es_recuperatorio_viernes ?? s.esRecuperatorioViernes,
          estado_asistencia: previa?.estado_asistencia ?? 'PROGRAMADA',
          rol_inicio: miembro.rol,
          minutos_operacion: previa?.minutos_operacion ?? 30,
          minutos_observacion: previa?.minutos_observacion ?? 30,
          observaciones_instructor: previa?.observaciones_instructor ?? null,
        });
      }
    }
  }

  let sesionesGeneradas = 0;
  let advertencia: string | undefined;

  if (sesionesAInsertar.length > 0) {
    const { error: errSes } = await supabase
      .from('sesiones_practica')
      .insert(sesionesAInsertar);

    if (errSes?.code === '23514') {
      // Compatibilidad previa a migración 0010 (CHECK numero_sesion BETWEEN 1 AND 6).
      const sesionesAcotadas = sesionesAInsertar.filter(
        (s) => s.numero_sesion <= TOTAL_SESIONES_CICLO
      );
      const { error: errSesRetry } = await supabase
        .from('sesiones_practica')
        .insert(sesionesAcotadas);

      if (errSesRetry) {
        console.error('[sincronizarDuplasYSesionesAction] Error al generar sesiones acotadas:', {
          code: errSesRetry.code,
          message: errSesRetry.message,
        });
        return { ok: false, error: 'Las duplas se guardaron, pero falló la generación de sesiones.' };
      }
      sesionesGeneradas = sesionesAcotadas.length;
      advertencia =
        'Se sincronizaron hasta 6 sesiones por alumno; ejecutá la migración 0010 en Supabase para soportar más de 6 sesiones.';
    } else if (errSes) {
      console.error('[sincronizarDuplasYSesionesAction] Error al generar sesiones:', {
        code: errSes.code,
        message: errSes.message,
      });
      return { ok: false, error: 'Las duplas se guardaron, pero falló la generación de sesiones.' };
    } else {
      sesionesGeneradas = sesionesAInsertar.length;
    }
  }

  revalidatePath(RUTA_PANEL);
  return {
    ok: true,
    duplasGuardadas: duplasCreadas.length,
    sesionesGeneradas,
    advertencia,
  };
}

/**
 * Actualiza el estado de asistencia de una sesión práctica y permite
 * reprogramar ausencias justificadas al Viernes Buffer.
 */
export async function actualizarAsistenciaSesionAction(
  input: ActualizarAsistenciaSesionInput
): Promise<ResultadoAccion> {
  if (
    !input ||
    !UUID_RE.test(input.sesion_id ?? '') ||
    !UUID_RE.test(input.cohorte_id ?? '')
  ) {
    return { ok: false, error: 'Identificadores de sesión inválidos.' };
  }
  if (!ESTADOS_ASISTENCIA_UI_VALIDOS.includes(input.estado_asistencia)) {
    return { ok: false, error: 'Estado de asistencia inválido.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const { data: sesion, error: errSesion } = await supabase
    .from('sesiones_practica')
    .select('id, cohorte_id, fecha_programada, observaciones_instructor')
    .eq('id', input.sesion_id.trim())
    .eq('cohorte_id', input.cohorte_id.trim())
    .maybeSingle<{
      id: string;
      cohorte_id: string;
      fecha_programada: string;
      observaciones_instructor: string | null;
    }>();

  if (errSesion || !sesion) {
    return { ok: false, error: 'Sesión práctica no encontrada en la cohorte.' };
  }

  const obsBase =
    typeof input.observaciones_instructor === 'string'
      ? input.observaciones_instructor.replace(PREFIJO_REPROGRAMADA, '').trim().slice(0, 1000)
      : (sesion.observaciones_instructor ?? '').replace(PREFIJO_REPROGRAMADA, '').trim();

  let estadoDB = 'PROGRAMADA';
  let esRecuperatorio = false;
  let fechaReal: string | null = null;
  let observacionesFinal: string | null = obsBase.length > 0 ? obsBase : null;

  if (input.estado_asistencia === 'PRESENTE') {
    estadoDB = 'PRESENTE';
  } else if (input.estado_asistencia === 'AUSENTE_JUSTIFICADO') {
    estadoDB = 'AUSENTE_JUSTIFICADO';
  } else if (input.estado_asistencia === 'AUSENTE_INJUSTIFICADO') {
    estadoDB = 'AUSENTE_INJUSTIFICADO';
  } else if (input.estado_asistencia === 'REPROGRAMADA') {
    const fechaSugerida = esFechaIsoValida(input.fecha_reprogramacion)
      ? input.fecha_reprogramacion.trim()
      : calcularViernesMismaSemanaIso(sesion.fecha_programada.split('T')[0]);
    // Usa 'PROGRAMADA' + flag recuperatorio + prefijo para compatibilidad con enum 0008 y 0010.
    estadoDB = 'PROGRAMADA';
    esRecuperatorio = true;
    fechaReal = fechaSugerida;
    observacionesFinal = `${PREFIJO_REPROGRAMADA}${obsBase ? ` ${obsBase}` : ''}`.trim();
  }

  const { error: errUpd } = await supabase
    .from('sesiones_practica')
    .update({
      estado_asistencia: estadoDB,
      es_recuperatorio_viernes: esRecuperatorio,
      fecha_real: fechaReal,
      observaciones_instructor: observacionesFinal,
    })
    .eq('id', sesion.id)
    .eq('cohorte_id', sesion.cohorte_id);

  if (errUpd) {
    console.error('[actualizarAsistenciaSesionAction] Error al actualizar:', {
      code: errUpd.code,
      message: errUpd.message,
    });
    return { ok: false, error: 'No se pudo actualizar la asistencia de la sesión.' };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

/**
 * Lee el Legajo 360° completo (sesiones, Viernes Buffer, práctica en terreno + PDF y egreso)
 * de un postulante perteneciente a una cohorte (verificación anti-IDOR obligatoria).
 */
export async function obtenerLegajo360PostulanteAction(
  postulanteId: string,
  cohorteId: string
): Promise<{ ok: true; data: Legajo360Postulante } | { ok: false; error: string }> {
  if (!UUID_RE.test(postulanteId ?? '') || !UUID_RE.test(cohorteId ?? '')) {
    return { ok: false, error: 'Identificadores inválidos.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const pid = postulanteId.trim();
  const cid = cohorteId.trim();

  const { data: inscripcion, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id, postulantes(dni)')
    .eq('cohorte_id', cid)
    .eq('postulante_id', pid)
    .maybeSingle<{
      id: string;
      postulantes: { dni: string } | { dni: string }[] | null;
    }>();

  if (errInsc || !inscripcion) {
    return { ok: false, error: 'El postulante no pertenece a la cohorte indicada.' };
  }

  const dniPostulante = Array.isArray(inscripcion.postulantes)
    ? inscripcion.postulantes[0]?.dni
    : inscripcion.postulantes?.dni;

  const [
    { data: filasSesiones },
    { data: filaCohorte },
    { data: filasFeriados },
    { data: filaEgreso },
  ] = await Promise.all([
    supabase
      .from('sesiones_practica')
      .select(
        'id, cohorte_id, dupla_id, alumno_id, numero_sesion, fecha_programada, fecha_real, es_recuperatorio_viernes, estado_asistencia, rol_inicio, minutos_operacion, minutos_observacion, observaciones_instructor'
      )
      .eq('cohorte_id', cid)
      .eq('alumno_id', pid)
      .order('numero_sesion', { ascending: true })
      .returns<FilaSesionPracticaDB[]>(),
    supabase
      .from('cohortes')
      .select('fecha_teoria, fecha_inicio_sim, configuracion_cursado')
      .eq('id', cid)
      .maybeSingle<{
        fecha_teoria: string | null;
        fecha_inicio_sim: string | null;
        configuracion_cursado: unknown;
      }>(),
    supabase
      .from('feriados_municipales')
      .select('fecha')
      .order('fecha', { ascending: true })
      .returns<Array<{ fecha: string | null }>>(),
    supabase
      .from('evaluacion_final_egreso')
      .select(
        'id, cohorte_id, postulante_id, estado_egreso, aprobado_practica_terreno, perfil_laboral, devolucion_empleo, sesiones_asistidas, horas_practica_completadas, fecha_evaluacion'
      )
      .eq('cohorte_id', cid)
      .eq('postulante_id', pid)
      .maybeSingle<{
        id: string;
        cohorte_id: string;
        postulante_id: string;
        estado_egreso: string;
        aprobado_practica_terreno: boolean | null;
        perfil_laboral: string;
        devolucion_empleo: string | null;
        sesiones_asistidas: number;
        horas_practica_completadas: number;
        fecha_evaluacion: string | null;
      }>(),
  ]);

  let viernesSugeridos: string[] = [];
  if (filaCohorte) {
    try {
      const configCursado = normalizarConfiguracionCursado(
        filaCohorte.configuracion_cursado
      );
      const fechaTeoriaBase = esFechaIsoValida(filaCohorte.fecha_teoria)
        ? filaCohorte.fecha_teoria
        : obtenerFechaBaseCalendarioHoy();
      const fechaInicioSim = esFechaIsoValida(filaCohorte.fecha_inicio_sim)
        ? filaCohorte.fecha_inicio_sim
        : obtenerProximoLunesPosterior(fechaTeoriaBase);
      const diasBloqueados = (filasFeriados ?? [])
        .map((f) => (typeof f.fecha === 'string' ? f.fecha.split('T')[0] : ''))
        .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f));

      const proyeccion = proyectarCalendarioCohorteV2({
        fechaInicioTeoria: fechaTeoriaBase,
        fechaInicioSimulador: fechaInicioSim,
        diasBloqueados,
        estrategiaFeriados: 'MOVER_A_VIERNES',
        configuracionCursado: configCursado,
      });
      viernesSugeridos = proyeccion.viernesEstado.map((v) => v.fecha);
    } catch {
      viernesSugeridos = [];
    }
  }

  let practicaReal: PracticaRealItem | null = null;
  const dbReader = createAdminClient() ?? supabase;

  const { data: filasPracNueva, error: errPracNueva } = await dbReader
    .from('practica_real')
    .select(
      'id, fecha_practica, lugar_predio, maquina_utilizada, instructor_patio, resultado, observaciones_terreno, pdf_reporte_path, storage_pdf_path, observaciones'
    )
    .eq('cohorte_id', cid)
    .eq('postulante_id', pid)
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<
      Array<{
        id: string;
        fecha_practica: string;
        lugar_predio: string | null;
        maquina_utilizada: string | null;
        instructor_patio: string | null;
        resultado: string;
        observaciones_terreno: string | null;
        pdf_reporte_path: string | null;
        storage_pdf_path: string | null;
        observaciones: string | null;
      }>
    >();

  if (!errPracNueva && filasPracNueva && filasPracNueva.length > 0) {
    const p = filasPracNueva[0];
    const pdfPath = p.pdf_reporte_path ?? p.storage_pdf_path ?? null;
    const resNormalizado: ResultadoPracticaReal = RESULTADOS_PRACTICA_VALIDOS.includes(
      p.resultado as ResultadoPracticaReal
    )
      ? (p.resultado as ResultadoPracticaReal)
      : p.resultado === 'desaprobado'
        ? 'requiere_refuerzo'
        : 'aprobado';

    practicaReal = {
      id: p.id,
      fecha_practica: p.fecha_practica.split('T')[0],
      lugar_predio: p.lugar_predio ?? null,
      maquina_utilizada: p.maquina_utilizada ?? null,
      instructor_patio: p.instructor_patio ?? null,
      resultado: resNormalizado,
      observaciones_terreno: p.observaciones_terreno ?? p.observaciones ?? null,
      pdf_reporte_path: pdfPath,
      pdf_url_firmada: await generarUrlFirmadaPractica(supabase, pdfPath),
    };
  } else if (errPracNueva?.code === '42703' && dniPostulante) {
    // Fallback hacia esquema legacy 0004 (alumnos -> practica_real).
    const { data: alumnoLegacy } = await dbReader
      .from('alumnos')
      .select('id')
      .eq('dni', dniPostulante)
      .maybeSingle<{ id: string }>();

    if (alumnoLegacy?.id) {
      const { data: filasPracLegacy } = await dbReader
        .from('practica_real')
        .select('id, fecha_practica, instructor_patio, resultado, observaciones, storage_pdf_path')
        .eq('alumno_id', alumnoLegacy.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .returns<
          Array<{
            id: string;
            fecha_practica: string;
            instructor_patio: string | null;
            resultado: string;
            observaciones: string | null;
            storage_pdf_path: string | null;
          }>
        >();

      if (filasPracLegacy && filasPracLegacy.length > 0) {
        const leg = filasPracLegacy[0];
        const decoded = decodificarLegacyPractica(leg.observaciones);
        const resFallback: ResultadoPracticaReal =
          decoded.resultadoMeta ??
          (leg.resultado === 'aprobado' ? 'aprobado' : 'requiere_refuerzo');
        practicaReal = {
          id: leg.id,
          fecha_practica: leg.fecha_practica.split('T')[0],
          lugar_predio: decoded.lugarPredio,
          maquina_utilizada: decoded.maquinaUtilizada,
          instructor_patio: leg.instructor_patio ?? null,
          resultado: resFallback,
          observaciones_terreno: decoded.observacionesLimpias,
          pdf_reporte_path: leg.storage_pdf_path ?? null,
          pdf_url_firmada: await generarUrlFirmadaPractica(
            supabase,
            leg.storage_pdf_path ?? null
          ),
        };
      }
    }
  }

  const egreso: EvaluacionFinalEgresoItem | null = filaEgreso
    ? {
        id: filaEgreso.id,
        cohorte_id: filaEgreso.cohorte_id,
        postulante_id: filaEgreso.postulante_id,
        estado_egreso: ESTADOS_EGRESO_VALIDOS.includes(filaEgreso.estado_egreso as EstadoEgreso)
          ? (filaEgreso.estado_egreso as EstadoEgreso)
          : 'INCOMPLETO',
        paso_a_terreno_aprobado:
          typeof filaEgreso.aprobado_practica_terreno === 'boolean'
            ? filaEgreso.aprobado_practica_terreno
            : null,
        recomendacion_laboral: PERFILES_LABORALES_VALIDOS.includes(
          filaEgreso.perfil_laboral as PerfilLaboral
        )
          ? (filaEgreso.perfil_laboral as PerfilLaboral)
          : 'ESTANDAR',
        observaciones_egreso: filaEgreso.devolucion_empleo ?? null,
        sesiones_asistidas: numeroOrNull(filaEgreso.sesiones_asistidas) ?? 0,
        horas_practica_completadas:
          numeroOrNull(filaEgreso.horas_practica_completadas) ?? 0,
        fecha_evaluacion: filaEgreso.fecha_evaluacion
          ? filaEgreso.fecha_evaluacion.split('T')[0]
          : null,
      }
    : null;

  return {
    ok: true,
    data: {
      sesiones: (filasSesiones ?? []).map((s) => mapearSesionDB(s)),
      viernesSugeridos,
      practicaReal,
      egreso,
    },
  };
}

/**
 * Registra o actualiza la práctica real en terreno del postulante y sube su
 * comprobante PDF al bucket privado `expedientes-practica-real`.
 */
export async function guardarPracticaRealAction(
  formData: FormData
): Promise<ResultadoPracticaRealAccion> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const cohorteId = String(formData.get('cohorte_id') ?? '').trim();
  const postulanteId = String(formData.get('postulante_id') ?? '').trim();
  const fechaPractica = String(formData.get('fecha_practica') ?? '').trim();
  const lugarPredio = String(formData.get('lugar_predio') ?? '').trim().slice(0, 150);
  const maquinaUtilizada = String(formData.get('maquina_utilizada') ?? '').trim().slice(0, 120);
  const instructorPatio =
    String(formData.get('instructor_patio') ?? '').trim().slice(0, 120) ||
    'Equipo de Instructores';
  const resultadoRaw = String(formData.get('resultado') ?? '').trim();
  const observacionesTerreno = String(formData.get('observaciones_terreno') ?? '')
    .trim()
    .slice(0, 2000);
  const pdfPrevioPath = String(formData.get('pdf_previo_path') ?? '').trim() || null;

  if (!UUID_RE.test(cohorteId) || !UUID_RE.test(postulanteId)) {
    return { ok: false, error: 'Identificadores de cohorte o postulante inválidos.' };
  }
  if (!esFechaIsoValida(fechaPractica)) {
    return { ok: false, error: 'La fecha de práctica en terreno debe tener formato YYYY-MM-DD.' };
  }
  if (!lugarPredio || lugarPredio.length < 2) {
    return { ok: false, error: 'Ingresá el lugar o predio de la práctica en terreno.' };
  }
  if (!maquinaUtilizada || maquinaUtilizada.length < 2) {
    return { ok: false, error: 'Ingresá la máquina real utilizada.' };
  }
  if (!RESULTADOS_PRACTICA_VALIDOS.includes(resultadoRaw as ResultadoPracticaReal)) {
    return { ok: false, error: 'Resultado de práctica en terreno inválido.' };
  }
  const resultado = resultadoRaw as ResultadoPracticaReal;

  const { data: inscripcion, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id, postulantes(nombre_completo, dni)')
    .eq('cohorte_id', cohorteId)
    .eq('postulante_id', postulanteId)
    .maybeSingle<{
      id: string;
      postulantes:
        | { nombre_completo: string; dni: string }
        | { nombre_completo: string; dni: string }[]
        | null;
    }>();

  if (errInsc || !inscripcion) {
    return { ok: false, error: 'El postulante no pertenece a la cohorte indicada.' };
  }

  const infoPostulante = Array.isArray(inscripcion.postulantes)
    ? inscripcion.postulantes[0]
    : inscripcion.postulantes;

  const archivoEntrada = formData.get('archivo_pdf');
  let pdfPathFinal: string | null = pdfPrevioPath;

  const adminOrUser = createAdminClient() ?? supabase;

  if (archivoEntrada instanceof File && archivoEntrada.size > 0) {
    if (archivoEntrada.size > MAX_PDF_PRACTICA_BYTES) {
      return { ok: false, error: 'El PDF excede el límite máximo permitido de 10 MB.' };
    }
    const nombreLower = archivoEntrada.name.toLowerCase();
    const mimeValido =
      archivoEntrada.type === 'application/pdf' ||
      archivoEntrada.type === '' ||
      nombreLower.endsWith('.pdf');
    if (!mimeValido) {
      return { ok: false, error: 'Solo se admiten archivos en formato PDF.' };
    }

    const buffer = await archivoEntrada.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!tieneCabeceraPdfValida(bytes)) {
      return { ok: false, error: 'El archivo adjunto no posee una cabecera %PDF válida.' };
    }

    const nombreSeguro = sanitizarNombreArchivoPdf(archivoEntrada.name);
    const storagePath = `${cohorteId}/${postulanteId}/${Date.now()}-${nombreSeguro}`;

    const { error: errUpload } = await adminOrUser.storage
      .from(BUCKET_PRACTICA_REAL)
      .upload(storagePath, bytes, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (errUpload) {
      console.error('[guardarPracticaRealAction] Error al subir PDF a Storage:', {
        message: errUpload.message,
      });
      return {
        ok: false,
        error: 'No se pudo subir el comprobante PDF al bucket privado.',
      };
    }

    pdfPathFinal = storagePath;
  }

  // Intento 1: Esquema alineado (migración 0010).
  const { data: existenteNuevo, error: errCheckNuevo } = await adminOrUser
    .from('practica_real')
    .select('id')
    .eq('cohorte_id', cohorteId)
    .eq('postulante_id', postulanteId)
    .maybeSingle<{ id: string }>();

  let practicaGuardadaId: string | null = null;
  let usarFallbackLegacy = errCheckNuevo?.code === '42703';

  if (!usarFallbackLegacy) {
    const payloadNuevo = {
      cohorte_id: cohorteId,
      postulante_id: postulanteId,
      fecha_practica: fechaPractica,
      lugar_predio: lugarPredio,
      maquina_utilizada: maquinaUtilizada,
      instructor_patio: instructorPatio,
      resultado,
      observaciones_terreno: observacionesTerreno || null,
      observaciones: observacionesTerreno || null,
      pdf_reporte_path: pdfPathFinal,
      storage_pdf_path: pdfPathFinal,
    };

    if (existenteNuevo?.id) {
      const { data: upd, error: errUpd } = await adminOrUser
        .from('practica_real')
        .update(payloadNuevo)
        .eq('id', existenteNuevo.id)
        .select('id')
        .single<{ id: string }>();
      if (errUpd && ['42703', '23502', '23503', '23514'].includes(errUpd.code ?? '')) {
        usarFallbackLegacy = true;
      } else if (errUpd || !upd?.id) {
        return { ok: false, error: 'No se pudo actualizar la práctica en terreno.' };
      } else {
        practicaGuardadaId = upd.id;
      }
    } else {
      const { data: ins, error: errIns } = await adminOrUser
        .from('practica_real')
        .insert(payloadNuevo)
        .select('id')
        .single<{ id: string }>();
      if (errIns && ['42703', '23502', '23503', '23514'].includes(errIns.code ?? '')) {
        usarFallbackLegacy = true;
      } else if (errIns || !ins?.id) {
        console.error('[guardarPracticaRealAction] Error al insertar práctica:', {
          code: errIns?.code,
          message: errIns?.message,
        });
        return { ok: false, error: 'No se pudo guardar la práctica en terreno.' };
      } else {
        practicaGuardadaId = ins.id;
      }
    }
  }

  if (usarFallbackLegacy) {
    if (!infoPostulante?.dni) {
      return {
        ok: false,
        error: 'Ejecutá la migración 0010 en Supabase para vincular práctica en terreno sin alumno legacy.',
      };
    }

    let alumnoId: string | null = null;
    const { data: alumnoExist } = await adminOrUser
      .from('alumnos')
      .select('id')
      .eq('dni', infoPostulante.dni)
      .maybeSingle<{ id: string }>();

    if (alumnoExist?.id) {
      alumnoId = alumnoExist.id;
    } else {
      const { data: alumnoCreado, error: errAl } = await adminOrUser
        .from('alumnos')
        .insert({
          nombre_completo: infoPostulante.nombre_completo,
          dni: infoPostulante.dni,
          genero: 'M',
          estado_general: 'en_practica_real',
        })
        .select('id')
        .single<{ id: string }>();

      if (errAl || !alumnoCreado?.id) {
        return { ok: false, error: 'No se pudo crear el espejo de alumno para práctica legacy.' };
      }
      alumnoId = alumnoCreado.id;
    }

    const obsCodificada = `[TERRENO|res=${resultado}|lugar=${lugarPredio.replace(/[|\]]/g, ' ')}|maq=${maquinaUtilizada.replace(/[|\]]/g, ' ')}]${observacionesTerreno ? ` ${observacionesTerreno}` : ''}`;

    const { data: legacyIns, error: errLeg } = await adminOrUser
      .from('practica_real')
      .insert({
        alumno_id: alumnoId,
        fecha_practica: fechaPractica,
        instructor_patio: instructorPatio,
        resultado: resultado === 'aprobado' ? 'aprobado' : 'desaprobado',
        observaciones: obsCodificada,
        storage_pdf_path: pdfPathFinal,
      })
      .select('id')
      .single<{ id: string }>();

    if (errLeg || !legacyIns?.id) {
      console.error('[guardarPracticaRealAction] Error en fallback legacy:', {
        code: errLeg?.code,
        message: errLeg?.message,
      });
      return { ok: false, error: 'No se pudo registrar la práctica en terreno.' };
    }
    practicaGuardadaId = legacyIns.id;
  }

  const pdfUrlFirmada = await generarUrlFirmadaPractica(supabase, pdfPathFinal);
  revalidatePath(RUTA_PANEL);

  return {
    ok: true,
    practicaReal: {
      id: practicaGuardadaId ?? crypto.randomUUID(),
      fecha_practica: fechaPractica,
      lugar_predio: lugarPredio,
      maquina_utilizada: maquinaUtilizada,
      instructor_patio: instructorPatio,
      resultado,
      observaciones_terreno: observacionesTerreno || null,
      pdf_reporte_path: pdfPathFinal,
      pdf_url_firmada: pdfUrlFirmada,
    },
  };
}

/**
 * Registra o actualiza la evaluación final de egreso del postulante en
 * `public.evaluacion_final_egreso`.
 */
export async function guardarEvaluacionFinalEgresoAction(
  input: GuardarEgresoLegajoInput
): Promise<ResultadoEgresoAccion> {
  if (!input || !UUID_RE.test(input.cohorte_id ?? '') || !UUID_RE.test(input.postulante_id ?? '')) {
    return { ok: false, error: 'Identificadores inválidos.' };
  }
  if (!ESTADOS_EGRESO_VALIDOS.includes(input.estado_egreso)) {
    return { ok: false, error: 'Estado de egreso inválido.' };
  }
  if (!PERFILES_LABORALES_VALIDOS.includes(input.recomendacion_laboral)) {
    return { ok: false, error: 'Perfil laboral recomendado inválido.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const cid = input.cohorte_id.trim();
  const pid = input.postulante_id.trim();

  const [{ data: inscripcion }, { data: filasSesiones }] = await Promise.all([
    supabase
      .from('cohorte_inscripciones')
      .select('id')
      .eq('cohorte_id', cid)
      .eq('postulante_id', pid)
      .maybeSingle<{ id: string }>(),
    supabase
      .from('sesiones_practica')
      .select('estado_asistencia')
      .eq('cohorte_id', cid)
      .eq('alumno_id', pid)
      .returns<Array<{ estado_asistencia: string }>>(),
  ]);

  if (!inscripcion?.id) {
    return { ok: false, error: 'El postulante no pertenece a la cohorte indicada.' };
  }

  const sesionesAsistidas = (filasSesiones ?? []).filter(
    (s) => s.estado_asistencia === 'PRESENTE'
  ).length;
  const horasCompletadas = sesionesAsistidas;
  const observacionesLimpia =
    typeof input.observaciones_egreso === 'string'
      ? input.observaciones_egreso.trim().slice(0, MAX_NOTAS_EMPLEO)
      : '';
  const fechaEvaluacion = obtenerFechaBaseCalendarioHoy();

  const { data: egresoGuardado, error: errEgreso } = await supabase
    .from('evaluacion_final_egreso')
    .upsert(
      {
        cohorte_id: cid,
        postulante_id: pid,
        estado_egreso: input.estado_egreso,
        aprobado_practica_terreno: input.paso_a_terreno_aprobado,
        perfil_laboral: input.recomendacion_laboral,
        devolucion_empleo: observacionesLimpia.length > 0 ? observacionesLimpia : null,
        sesiones_asistidas: sesionesAsistidas,
        horas_practica_completadas: horasCompletadas,
        fecha_evaluacion: fechaEvaluacion,
      },
      { onConflict: 'cohorte_id,postulante_id' }
    )
    .select(
      'id, cohorte_id, postulante_id, estado_egreso, aprobado_practica_terreno, perfil_laboral, devolucion_empleo, sesiones_asistidas, horas_practica_completadas, fecha_evaluacion'
    )
    .single<{
      id: string;
      cohorte_id: string;
      postulante_id: string;
      estado_egreso: EstadoEgreso;
      aprobado_practica_terreno: boolean | null;
      perfil_laboral: PerfilLaboral;
      devolucion_empleo: string | null;
      sesiones_asistidas: number;
      horas_practica_completadas: number;
      fecha_evaluacion: string | null;
    }>();

  if (errEgreso || !egresoGuardado) {
    console.error('[guardarEvaluacionFinalEgresoAction] Error al guardar egreso:', {
      code: errEgreso?.code,
      message: errEgreso?.message,
    });
    return { ok: false, error: 'No se pudo guardar el dictamen final de egreso.' };
  }

  revalidatePath(RUTA_PANEL);
  return {
    ok: true,
    egreso: {
      id: egresoGuardado.id,
      cohorte_id: egresoGuardado.cohorte_id,
      postulante_id: egresoGuardado.postulante_id,
      estado_egreso: egresoGuardado.estado_egreso,
      paso_a_terreno_aprobado: egresoGuardado.aprobado_practica_terreno,
      recomendacion_laboral: egresoGuardado.perfil_laboral,
      observaciones_egreso: egresoGuardado.devolucion_empleo,
      sesiones_asistidas: numeroOrNull(egresoGuardado.sesiones_asistidas) ?? 0,
      horas_practica_completadas:
        numeroOrNull(egresoGuardado.horas_practica_completadas) ?? 0,
      fecha_evaluacion: egresoGuardado.fecha_evaluacion
        ? egresoGuardado.fecha_evaluacion.split('T')[0]
        : fechaEvaluacion,
    },
  };
}
