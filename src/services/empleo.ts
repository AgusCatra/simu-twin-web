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
import {
  calcularCargaHorariaOperador,
  calcularHorasHombreYMaquina,
  resolverParametrosHoras,
} from '@/lib/horas-capacitacion';
import {
  analizarCohortePredictiva,
  calcularCuidadoDesdeMetricas,
  esMediumLoadOperation,
  type RegistroEvaluacionAnalitica,
} from '@/lib/telemetria/analitica-predictiva';
import {
  esNivelAsistenciaValido,
  mapearNivelAsistenciaACabina,
  PUNTAJES_EJE_VALIDOS,
} from '@/lib/cabina/dictamen';
import {
  clasificarPerfilOperador,
  type MetricasSimulador,
  type PerfilOperador,
} from '@/lib/telemetria/parser-simulador';
import type { PuntajeEje } from '@/types/cabina';
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
  DecisionInstructorCohorteItem,
  DecisionInstructorT0,
  DecisionInstructorTerreno,
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
  GuardarDecisionInstructorInput,
  GuardarEgresoLegajoInput,
  GuardarPracticaRealSinStorageInput,
  ItemLoteTelemetriaInput,
  Legajo360Postulante,
  MetricasIntento,
  OcupanteFranja,
  PostulanteFila,
  PracticaIntermediaItem,
  PracticaRealItem,
  PuntoRadar,
  ResultadoAccion,
  ResultadoAnalisisIA,
  ResultadoCrearCohorte,
  ResultadoCrearPostulante,
  ResultadoEgresoAccion,
  ResultadoImportarLoteTelemetria,
  ResultadoLoteTelemetriaItem,
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
  fecha_fin_sim: string | null;
  cupo_alumnos: number | null;
  max_titulares: number | null;
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

const ARCHIVO_FUENTE_TERRENO = 'CABINA_TABLET_TERRENO';
const ARCHIVO_FUENTE_DECISION = 'DECISION_INSTRUCTOR_COHORTE';

function esArchivoTablet(fuente: string | null | undefined): boolean {
  return (
    typeof fuente === 'string' &&
    fuente.startsWith('CABINA_TABLET') &&
    fuente !== ARCHIVO_FUENTE_TERRENO
  );
}

function esArchivoTitan(fuente: string | null | undefined): boolean {
  return (
    typeof fuente === 'string' &&
    fuente.trim().length > 0 &&
    !fuente.startsWith('CABINA_TABLET') &&
    fuente !== ARCHIVO_FUENTE_DECISION
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

function esFilaMediumLoad(f: {
  etapa?: string | null;
  telemetria_metricas?: unknown;
}): boolean {
  if (f.etapa === 'PRACTICA_INTERMEDIA') return false;
  const m = normalizarMetricasGuardadas(f.telemetria_metricas);
  if (m?.exerciseName && m.exerciseName.trim().length > 0) {
    return esMediumLoadOperation(m.exerciseName);
  }
  return true;
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
    .filter((f) => esArchivoTitan(f.archivo_fuente) && esFilaMediumLoad(f))
    .sort((a, b) => {
      if (a.es_mejor_diagnostico !== b.es_mejor_diagnostico) {
        return a.es_mejor_diagnostico ? -1 : 1;
      }
      const diffEtapa = prioridadEtapa(b.etapa) - prioridadEtapa(a.etapa);
      return diffEtapa !== 0
        ? diffEtapa
        : (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });

  const practicasIntermedias: PracticaIntermediaItem[] = ordenadasReciente
    .filter((f) => esArchivoTitan(f.archivo_fuente) && !esFilaMediumLoad(f))
    .map((f) => {
      const m = normalizarMetricasGuardadas(f.telemetria_metricas);
      const lat = parsearTelemetriaLateralidad(f.eje_lateralidad);
      const fren = parsearFrenadasLegacy(f.eje_tacto_mandos);
      const satMatch = (f.eje_control_receptividad ?? '').match(/palancas_saturadas\s*=\s*(\d+)/i);
      const cuidado = m
        ? calcularCuidadoDesdeMetricas(m).indiceCuidadoMecanico
        : null;
      return {
        id: f.id,
        archivo_nombre: f.archivo_fuente ?? f.telemetria_archivo_nombre ?? null,
        exercise_name: m?.exerciseName?.trim() || 'Práctica Intermedia',
        fecha: m?.exerciseStartTime ?? f.created_at ?? null,
        score_puntos: m?.scorePuntos ?? numeroOrNull(f.score_puntos),
        tiempo_vuelta_seg: m?.tiempoDuracionSeg ?? numeroOrNull(f.tiempo_vuelta_seg),
        colisiones: m?.colisionesReales ?? numeroOrNull(f.colisiones),
        indice_cuidado_mecanico:
          cuidado ??
          (lat.indice_serrucho !== null || fren !== null || satMatch
            ? null
            : null),
      };
    });

  const filaTablet = filasTablet[0] ?? null;
  const filaTitan = filasTitan[0] ?? null;
  const filaBase = filaTablet ?? filaTitan ?? ordenadasReciente[0];
  const filaConIA =
    ordenadasReciente.find((f) => normalizarInformeGuardado(f.informe_ia) !== null) ??
    null;
  const filaConMetricasJson =
    ordenadasReciente.find(
      (f) =>
        esFilaMediumLoad(f) &&
        normalizarMetricasGuardadas(f.telemetria_metricas) !== null
    ) ??
    ordenadasReciente.find(
      (f) => normalizarMetricasGuardadas(f.telemetria_metricas) !== null
    ) ??
    null;

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
    practicas_intermedias: practicasIntermedias,
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

  const [{ data, error }, { data: inscRows }] = await Promise.all([
    supabase
      .from('cohortes')
      .select(
        'id, codigo, nombre, estado, tipo_maquinaria, fecha_teoria, fecha_inicio_sim, fecha_fin_sim, cupo_alumnos, max_titulares, created_at'
      )
      .order('fecha_inicio_sim', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .returns<FilaCohorteResumenDB[]>(),
    supabase
      .from('cohorte_inscripciones')
      .select('cohorte_id')
      .neq('estado', 'DESCARTADO')
      .returns<Array<{ cohorte_id: string }>>(),
  ]);

  if (error) {
    console.error('[listarCohortesDisponibles] Error al listar cohortes:', {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  const conteoPorCohorte = new Map<string, number>();
  for (const r of inscRows ?? []) {
    if (!r.cohorte_id) continue;
    conteoPorCohorte.set(r.cohorte_id, (conteoPorCohorte.get(r.cohorte_id) ?? 0) + 1);
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    estado: esEstadoCohorte(c.estado),
    tipo_maquinaria: c.tipo_maquinaria ?? null,
    fecha_teoria: c.fecha_teoria ?? null,
    fecha_inicio_sim: c.fecha_inicio_sim ?? null,
    fecha_fin_sim: c.fecha_fin_sim ?? null,
    cupo_alumnos: numeroOrNull(c.cupo_alumnos),
    max_titulares: numeroOrNull(c.max_titulares),
    total_inscriptos: conteoPorCohorte.get(c.id) ?? 0,
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
    { data: filasPracticasReales },
    { data: filasEgresosCohorte },
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
             colisiones_descartadas, score_puntos, delta_tiempo_seg,
             delta_colisiones, delta_score, delta_serrucho))`
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
    supabase
      .from('practica_real')
      .select(
        'id, postulante_id, fecha_practica, lugar_predio, maquina_utilizada, instructor_patio, resultado, observaciones_terreno, observaciones, created_at'
      )
      .eq('cohorte_id', filaCohorte.id)
      .order('created_at', { ascending: false })
      .returns<
        Array<{
          id: string;
          postulante_id: string | null;
          fecha_practica: string;
          lugar_predio: string | null;
          maquina_utilizada: string | null;
          instructor_patio: string | null;
          resultado: string;
          observaciones_terreno: string | null;
          observaciones: string | null;
        }>
      >(),
    supabase
      .from('evaluacion_final_egreso')
      .select(
        'id, cohorte_id, postulante_id, estado_egreso, aprobado_practica_terreno, perfil_laboral, devolucion_empleo, sesiones_asistidas, horas_practica_completadas, fecha_evaluacion'
      )
      .eq('cohorte_id', filaCohorte.id)
      .returns<
        Array<{
          id: string;
          cohorte_id: string;
          postulante_id: string;
          estado_egreso: string | null;
          aprobado_practica_terreno: boolean | null;
          perfil_laboral: string | null;
          devolucion_empleo: string | null;
          sesiones_asistidas: number | null;
          horas_practica_completadas: number | null;
          fecha_evaluacion: string | null;
        }>
      >(),
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

  const sesionesPresentesPorAlumno = new Map<string, number>();
  for (const s of sesionesPractica) {
    if (s.estado_asistencia === 'PRESENTE') {
      sesionesPresentesPorAlumno.set(
        s.alumno_id,
        (sesionesPresentesPorAlumno.get(s.alumno_id) ?? 0) + 1
      );
    }
  }
  const practicaPorAlumno = new Map<
    string,
    NonNullable<typeof filasPracticasReales>[number]
  >();
  for (const pr of filasPracticasReales ?? []) {
    if (pr.postulante_id && !practicaPorAlumno.has(pr.postulante_id)) {
      practicaPorAlumno.set(pr.postulante_id, pr);
    }
  }
  const egresoRowPorAlumno = new Map<
    string,
    NonNullable<typeof filasEgresosCohorte>[number]
  >();
  for (const eg of filasEgresosCohorte ?? []) {
    if (!egresoRowPorAlumno.has(eg.postulante_id)) {
      egresoRowPorAlumno.set(eg.postulante_id, eg);
    }
  }

  const resumenExtraPorPostulante = new Map<
    string,
    {
      v1_diagnostico: PostulanteFila['v1_diagnostico'];
      v2_diagnostico: PostulanteFila['v2_diagnostico'];
      prueba_final: PostulanteFila['prueba_final'];
      decision_instructor: PostulanteFila['decision_instructor'];
      practica_real: PostulanteFila['practica_real'];
    }
  >();

  const fuentesImpacto = filasInscripcion.flatMap((f) => {
    const rel = Array.isArray(f.postulantes) ? f.postulantes[0] : f.postulantes;
    if (!rel || !f.postulante_id) return [];

    const evalsRaw = rel.evaluacion_diagnostico ?? [];
    const filaTerreno = evalsRaw.find((e) => e.archivo_fuente === ARCHIVO_FUENTE_TERRENO) ?? null;
    const filaDecision = evalsRaw.find((e) => e.archivo_fuente === ARCHIVO_FUENTE_DECISION) ?? null;
    const metaTerreno = filaTerreno
      ? parsearTerrenoDetalle({
          puntaje_lateralidad: filaTerreno.puntaje_lateralidad,
          puntaje_tacto_mandos: filaTerreno.puntaje_tacto_mandos,
          puntaje_mastil: filaTerreno.puntaje_mastil,
          puntaje_control_receptividad: filaTerreno.puntaje_control_receptividad,
          nivel_asistencia: filaTerreno.nivel_asistencia,
          telemetria_metricas: filaTerreno.telemetria_metricas,
        })
      : null;
    const decInst = filaDecision
      ? parsearDecisionInstructor({
          instructor_evaluador: filaDecision.instructor_evaluador,
          created_at: filaDecision.created_at,
          telemetria_metricas: filaDecision.telemetria_metricas,
        })
      : null;

    const evalsTitan: RegistroEvaluacionAnalitica[] = evalsRaw
      .filter((e) => esArchivoTitan(e.archivo_fuente))
      .map((e) => {
        const mGuard = normalizarMetricasGuardadas(e.telemetria_metricas);
        const lat = parsearTelemetriaLateralidad(e.eje_lateralidad);
        const fren = parsearFrenadasLegacy(e.eje_tacto_mandos);
        const satMatch = (e.eje_control_receptividad ?? '').match(/palancas_saturadas\s*=\s*(\d+)/i);
        return {
          postulanteId: f.postulante_id as string,
          archivoFuente: e.archivo_fuente,
          etapa: normalizarEtapa(e.etapa),
          esMejorDiagnostico: e.es_mejor_diagnostico === true,
          scorePuntos: mGuard?.scorePuntos ?? numeroOrNull(e.score_puntos),
          tiempoVueltaSeg: mGuard?.tiempoDuracionSeg ?? numeroOrNull(e.tiempo_vuelta_seg),
          colisiones: mGuard?.colisionesReales ?? numeroOrNull(e.colisiones),
          indiceSerrucho: mGuard?.indiceSerrucho ?? lat.indice_serrucho,
          volantazosExtremos: mGuard?.volantazosExtremos ?? lat.volantazos_extremos,
          frenadasPanico: mGuard?.frenadasPanico ?? fren,
          porcentajeHorquillaAlta: mGuard?.porcentajeCirculacionHorquillaAlta ?? null,
          oscilacionesMastil: mGuard?.oscilacionesMastil ?? null,
          saturacionesPalancasCount: satMatch ? Number(satMatch[1]) : 0,
          perfilOperador: normalizarPerfilOperador(e.perfil_operador),
          createdAt: e.created_at,
          metricas: mGuard,
        };
      });

    const pRow = postulantes.find((p) => p.postulante_id === f.postulante_id);
    const prRow = practicaPorAlumno.get(f.postulante_id) ?? null;
    const resPrac = prRow?.resultado;
    const resultadoPracTipado: ResultadoPracticaReal =
      resPrac === 'requiere_refuerzo'
        ? 'requiere_refuerzo'
        : resPrac === 'no_apto'
          ? 'no_apto'
          : 'aprobado';
    const pracLite =
      metaTerreno || resPrac
        ? {
            asistencia_terreno: metaTerreno?.asistencia_terreno ?? ('PRESENTE' as const),
            horas_practica_terreno: metaTerreno?.horas_practica_terreno ?? 1.5,
            horas_extra_terreno: metaTerreno?.horas_extra_terreno ?? 0,
            horas_extra_sugeridas: metaTerreno?.horas_extra_sugeridas ?? 0,
            resultado: resultadoPracTipado,
            decision_instructor_terreno: metaTerreno?.decision_instructor_terreno ?? null,
          }
        : null;

    const practicaCompleta: PracticaRealItem | null = prRow
      ? {
          id: prRow.id,
          fecha_practica: prRow.fecha_practica.split('T')[0],
          lugar_predio: prRow.lugar_predio ?? null,
          maquina_utilizada: prRow.maquina_utilizada ?? null,
          instructor_patio: prRow.instructor_patio ?? null,
          resultado: resultadoPracTipado,
          observaciones_terreno:
            prRow.observaciones_terreno ?? prRow.observaciones ?? null,
          asistencia_terreno: metaTerreno?.asistencia_terreno ?? 'PRESENTE',
          horas_practica_terreno: metaTerreno?.horas_practica_terreno ?? 1.5,
          horas_extra_terreno: metaTerreno?.horas_extra_terreno ?? 0,
          requiere_horas_extra: metaTerreno?.requiere_horas_extra ?? false,
          horas_extra_sugeridas: metaTerreno?.horas_extra_sugeridas ?? 0,
          puntaje_lateralidad: metaTerreno?.puntaje_lateralidad ?? null,
          puntaje_tacto_mandos: metaTerreno?.puntaje_tacto_mandos ?? null,
          puntaje_mastil: metaTerreno?.puntaje_mastil ?? null,
          puntaje_control_receptividad:
            metaTerreno?.puntaje_control_receptividad ?? null,
          nivel_asistencia: metaTerreno?.nivel_asistencia ?? null,
          decision_instructor_terreno:
            metaTerreno?.decision_instructor_terreno ??
            (resultadoPracTipado === 'aprobado'
              ? 'APROBADO_EMPRESAS'
              : resultadoPracTipado === 'requiere_refuerzo'
                ? 'REQUIERE_MAS_HORAS'
                : 'NO_APTO'),
          pdf_reporte_path: null,
          pdf_url_firmada: null,
        }
      : null;

    const extractPasada = (etapaTarget: 'DIAG_INTENTO_1' | 'DIAG_INTENTO_2' | 'FINAL') => {
      const reg = evalsTitan.find(
        (e) =>
          e.etapa === etapaTarget &&
          (!e.metricas?.exerciseName || esMediumLoadOperation(e.metricas.exerciseName))
      );
      if (!reg) return null;
      return {
        score_puntos: reg.scorePuntos,
        tiempo_seg: reg.tiempoVueltaSeg,
        colisiones: reg.colisiones,
        cuidado_mecanico: reg.metricas
          ? calcularCuidadoDesdeMetricas(reg.metricas).indiceCuidadoMecanico
          : null,
      };
    };

    resumenExtraPorPostulante.set(f.postulante_id, {
      v1_diagnostico: extractPasada('DIAG_INTENTO_1'),
      v2_diagnostico: extractPasada('DIAG_INTENTO_2'),
      prueba_final: extractPasada('FINAL'),
      decision_instructor: decInst,
      practica_real: practicaCompleta,
    });

    const egRow = egresoRowPorAlumno.get(f.postulante_id);

    return [
      {
        postulanteId: f.postulante_id,
        estadoInscripcion: f.estado,
        sesionesPresentes: sesionesPresentesPorAlumno.get(f.postulante_id) ?? 0,
        tieneCabinaTablet: Boolean(pRow?.evaluacion?.tiene_evaluacion_tablet),
        decisionInstructor: decInst,
        practicaReal: pracLite,
        aprobadoEgresoTerreno: egRow?.aprobado_practica_terreno ?? null,
        horasRecomendadasTitan: pRow?.evaluacion?.horas_recomendadas ?? null,
        evaluacionesTitan: evalsTitan,
      },
    ];
  });

  const { horasMaquinaSimulador } = calcularHorasHombreYMaquina(
    sesionesPractica,
    resolverParametrosHoras(configCursado).horas_por_sesion_simulador
  );
  const { porPostulante: analiticaPorPostulante, resumenCohorte } =
    analizarCohortePredictiva({
      cohorteConfig: configCursado,
      postulantes: fuentesImpacto,
      horasMaquinaSimulador,
    });

  const postulantesConAnalitica: PostulanteFila[] = postulantes.map((p) => {
    const extra = resumenExtraPorPostulante.get(p.postulante_id);
    const egRaw = egresoRowPorAlumno.get(p.postulante_id);
    const egresoMap: EvaluacionFinalEgresoItem | null = egRaw
      ? {
          id: egRaw.id,
          cohorte_id: egRaw.cohorte_id,
          postulante_id: egRaw.postulante_id,
          estado_egreso:
            egRaw.estado_egreso === 'CERTIFICADO' || egRaw.estado_egreso === 'ABANDONO'
              ? egRaw.estado_egreso
              : 'INCOMPLETO',
          paso_a_terreno_aprobado:
            typeof egRaw.aprobado_practica_terreno === 'boolean'
              ? egRaw.aprobado_practica_terreno
              : null,
          recomendacion_laboral:
            egRaw.perfil_laboral === 'DESTACADO' ||
            egRaw.perfil_laboral === 'CON_OBSERVACIONES' ||
            egRaw.perfil_laboral === 'NO_RECOMENDADO'
              ? egRaw.perfil_laboral
              : 'ESTANDAR',
          observaciones_egreso: egRaw.devolucion_empleo ?? null,
          sesiones_asistidas: numeroOrNull(egRaw.sesiones_asistidas) ?? 0,
          horas_practica_completadas:
            numeroOrNull(egRaw.horas_practica_completadas) ?? 0,
          fecha_evaluacion: egRaw.fecha_evaluacion
            ? egRaw.fecha_evaluacion.split('T')[0]
            : null,
        }
      : null;

    return {
      ...p,
      analitica: analiticaPorPostulante[p.postulante_id] ?? null,
      v1_diagnostico: extra?.v1_diagnostico ?? null,
      v2_diagnostico: extra?.v2_diagnostico ?? null,
      prueba_final: extra?.prueba_final ?? null,
      decision_instructor: extra?.decision_instructor ?? null,
      practica_real: extra?.practica_real ?? null,
      egreso: egresoMap,
      sesiones_presentes: sesionesPresentesPorAlumno.get(p.postulante_id) ?? 0,
    };
  });

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
    postulantes: postulantesConAnalitica,
    totalConfirmados,
    duplasPersistidas,
    sesionesPractica,
    impactoIndustrial: resumenCohorte,
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
  if (
    v === 'DIAG_INTENTO_2' ||
    v === 'FINAL' ||
    v === 'PRACTICA_INTERMEDIA'
  ) {
    return v;
  }
  return 'DIAG_INTENTO_1';
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
       archivo_fuente, telemetria_metricas, colisiones_descartadas, delta_tiempo_seg,
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
  const titan = todas.filter(
    (f) => esArchivoTitan(f.archivo_fuente) && esFilaMediumLoad(f)
  );
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
      'id, estado, obs_empleo, postulantes(nombre_completo, dni)'
    )
    .eq('cohorte_id', cohorteIdValidada)
    .eq('postulante_id', postulanteId)
    .maybeSingle<{
      id: string;
      estado: string;
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

  const [
    { data: evalFilas },
    { data: sesFilas },
    { data: pracFila },
    { data: cohRowIA },
  ] = await Promise.all([
    supabase
      .from('evaluacion_diagnostico')
      .select(
        'id, created_at, dictamen, asistencia_cabina, nivel_asistencia, bloque_split, score_puntos, colisiones, tiempo_vuelta_seg, etapa, es_mejor_diagnostico, delta_score, delta_colisiones, delta_tiempo_seg, puntaje_lateralidad, puntaje_tacto_mandos, puntaje_mastil, puntaje_control_receptividad, hard_fail, motivo_hard_fail, observaciones_rapidas, instructor_evaluador, telemetria_metricas, archivo_fuente'
      )
      .eq('postulante_id', postulanteId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sesiones_practica')
      .select('estado_asistencia')
      .eq('cohorte_id', cohorteIdValidada)
      .eq('alumno_id', postulanteId)
      .returns<Array<{ estado_asistencia: string }>>(),
    supabase
      .from('practica_real')
      .select('fecha_practica, resultado, maquina_utilizada, observaciones_terreno')
      .eq('cohorte_id', cohorteIdValidada)
      .eq('postulante_id', postulanteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{
        fecha_practica: string;
        resultado: string;
        maquina_utilizada: string | null;
        observaciones_terreno: string | null;
      }>(),
    supabase
      .from('cohortes')
      .select('configuracion_cursado')
      .eq('id', cohorteIdValidada)
      .maybeSingle<{ configuracion_cursado: unknown }>(),
  ]);

  const filas = (evalFilas ?? []) as unknown as Array<{
    id: string;
    created_at: string | null;
    dictamen: string | null;
    asistencia_cabina: string | null;
    nivel_asistencia: string | null;
    bloque_split: string | null;
    score_puntos: number | string | null;
    colisiones: number | null;
    tiempo_vuelta_seg: number | null;
    etapa: string | null;
    es_mejor_diagnostico: boolean | null;
    delta_score: number | string | null;
    delta_colisiones: number | null;
    delta_tiempo_seg: number | null;
    puntaje_lateralidad: number | null;
    puntaje_tacto_mandos: number | null;
    puntaje_mastil: number | null;
    puntaje_control_receptividad: number | null;
    hard_fail: boolean | null;
    motivo_hard_fail: string | null;
    observaciones_rapidas: string[] | null;
    instructor_evaluador: string | null;
    telemetria_metricas: unknown;
    archivo_fuente: string | null;
  }>;

  const filaCabina =
    filas.find((f) => esArchivoTablet(f.archivo_fuente)) ?? filas[0] ?? null;
  const filaV2 = filas.find(
    (f) =>
      esArchivoTitan(f.archivo_fuente) &&
      f.etapa === 'DIAG_INTENTO_2' &&
      esFilaMediumLoad(f)
  );
  const filaFinalT1 = filas.find(
    (f) =>
      esArchivoTitan(f.archivo_fuente) &&
      f.etapa === 'FINAL' &&
      esFilaMediumLoad(f)
  );
  const filaTerreno = filas.find((f) => f.archivo_fuente === ARCHIVO_FUENTE_TERRENO) ?? null;
  const filaDecision = filas.find((f) => f.archivo_fuente === ARCHIVO_FUENTE_DECISION) ?? null;
  const metaTerreno = filaTerreno
    ? parsearTerrenoDetalle({
        puntaje_lateralidad: filaTerreno.puntaje_lateralidad,
        puntaje_tacto_mandos: filaTerreno.puntaje_tacto_mandos,
        puntaje_mastil: filaTerreno.puntaje_mastil,
        puntaje_control_receptividad: filaTerreno.puntaje_control_receptividad,
        nivel_asistencia: filaTerreno.nivel_asistencia,
        telemetria_metricas: filaTerreno.telemetria_metricas,
      })
    : null;
  const decInst = filaDecision
    ? parsearDecisionInstructor({
        instructor_evaluador: filaDecision.instructor_evaluador,
        created_at: filaDecision.created_at,
        telemetria_metricas: filaDecision.telemetria_metricas,
      })
    : null;

  const sesionesPres = (sesFilas ?? []).filter(
    (s) => s.estado_asistencia === 'PRESENTE'
  ).length;
  const cfgCohorteIA = normalizarConfiguracionCursado(cohRowIA?.configuracion_cursado);
  const cargaIA = calcularCargaHorariaOperador({
    config: cfgCohorteIA,
    asistioTeoria:
      decInst?.asistio_teoria ??
      (insc.estado === 'CONFIRMADO' || sesionesPres > 0 || Boolean(pracFila)),
    sesionesPresentes: sesionesPres,
    tieneInstanciaCabina: true,
    horasRefuerzoSimulador: decInst?.horas_refuerzo_simulador ?? 0,
    practicaReal:
      pracFila || metaTerreno
        ? {
            asistencia_terreno: metaTerreno?.asistencia_terreno ?? 'PRESENTE',
            horas_practica_terreno: metaTerreno?.horas_practica_terreno ?? 1.5,
            horas_extra_terreno: metaTerreno?.horas_extra_terreno ?? 0,
            horas_extra_sugeridas: metaTerreno?.horas_extra_sugeridas ?? 0,
            resultado:
              pracFila?.resultado === 'aprobado' ||
              pracFila?.resultado === 'requiere_refuerzo' ||
              pracFila?.resultado === 'no_apto'
                ? pracFila.resultado
                : 'aprobado',
          }
        : null,
  });

  const metricasFinalGuardadas = filaFinalT1
    ? normalizarMetricasGuardadas(filaFinalT1.telemetria_metricas)
    : null;

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
    decisionManualT0: decInst?.decision_t0 ?? null,
    deltaV1V2: filaV2
      ? {
          deltaScore: numeroOrNull(filaV2.delta_score),
          deltaColisiones: numeroOrNull(filaV2.delta_colisiones),
          deltaTiempoSeg: numeroOrNull(filaV2.delta_tiempo_seg),
        }
      : null,
    capacitacion: {
      sesionesPresentes: sesionesPres,
      horasTotalesCertificadas: cargaIA.totalCertificadas,
      horasTeoria: cargaIA.horasTeoria,
      horasSimulador: cargaIA.horasSimuladorTotal,
      horasTerreno: cargaIA.horasTerrenoTotal,
    },
    pruebaFinalT1: filaFinalT1
      ? {
          scorePuntos: numeroOrNull(filaFinalT1.score_puntos),
          colisiones: numeroOrNull(filaFinalT1.colisiones),
          tiempoSeg: numeroOrNull(filaFinalT1.tiempo_vuelta_seg),
          deltaScoreVsT0: numeroOrNull(filaFinalT1.delta_score),
          deltaColisionesVsT0: numeroOrNull(filaFinalT1.delta_colisiones),
          cuidadoMecanicoPct: metricasFinalGuardadas
            ? calcularCuidadoDesdeMetricas(metricasFinalGuardadas).indiceCuidadoMecanico
            : null,
        }
      : null,
    practicaRealTerreno: pracFila
      ? {
          fecha: pracFila.fecha_practica.split('T')[0],
          resultado: pracFila.resultado,
          asistencia: metaTerreno?.asistencia_terreno ?? 'PRESENTE',
          maquina: pracFila.maquina_utilizada,
          decisionTerreno: metaTerreno?.decision_instructor_terreno ?? null,
          nivelAsistencia: metaTerreno?.nivel_asistencia ?? null,
          observaciones: pracFila.observaciones_terreno,
        }
      : null,
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

    const esMedium =
      !metricas.exerciseName || esMediumLoadOperation(metricas.exerciseName);
    const payloadInsertBase = {
      postulante_id: postulanteId,
      etapa: esMedium ? 'DIAG_INTENTO_1' : 'PRACTICA_INTERMEDIA',
      es_mejor_diagnostico: esMedium,
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
const DECISIONES_T0_VALIDAS: readonly DecisionInstructorT0[] = [
  'APROBADO_A_CAPACITACION',
  'PENDIENTE',
  'RECHAZADO',
];
const DECISIONES_TERRENO_VALIDAS: readonly DecisionInstructorTerreno[] = [
  'APROBADO_EMPRESAS',
  'REQUIERE_MAS_HORAS',
  'NO_APTO',
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

function sanitizarHorasInput(val: unknown, fallback: number, max = 40): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
    return fallback;
  }
  return Math.round(Math.min(max, val) * 10) / 10;
}

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

interface TerrenoMetaGuardada {
  asistencia_terreno: 'PRESENTE' | 'AUSENTE';
  horas_practica_terreno: number;
  horas_extra_terreno: number;
  requiere_horas_extra: boolean;
  horas_extra_sugeridas: number;
  decision_instructor_terreno: DecisionInstructorTerreno | null;
}

function parsearTerrenoDetalle(
  fila: {
    puntaje_lateralidad: number | null;
    puntaje_tacto_mandos: number | null;
    puntaje_mastil: number | null;
    puntaje_control_receptividad: number | null;
    nivel_asistencia: string | null;
    telemetria_metricas: unknown;
  } | null
): (TerrenoMetaGuardada & {
  puntaje_lateralidad: number | null;
  puntaje_tacto_mandos: number | null;
  puntaje_mastil: number | null;
  puntaje_control_receptividad: number | null;
  nivel_asistencia: string | null;
}) | null {
  if (!fila) return null;
  const raw =
    fila.telemetria_metricas &&
    typeof fila.telemetria_metricas === 'object' &&
    !Array.isArray(fila.telemetria_metricas)
      ? (fila.telemetria_metricas as Record<string, unknown>)
      : {};

  const decisionRaw = raw.decision_instructor_terreno;
  const decisionTerreno =
    typeof decisionRaw === 'string' &&
    (DECISIONES_TERRENO_VALIDAS as readonly string[]).includes(decisionRaw)
      ? (decisionRaw as DecisionInstructorTerreno)
      : null;

  return {
    asistencia_terreno:
      raw.asistencia_terreno === 'AUSENTE' ? 'AUSENTE' : 'PRESENTE',
    horas_practica_terreno: sanitizarHorasInput(raw.horas_practica_terreno, 1.5, 24),
    horas_extra_terreno: sanitizarHorasInput(raw.horas_extra_terreno, 0, 24),
    requiere_horas_extra: raw.requiere_horas_extra === true,
    horas_extra_sugeridas: sanitizarHorasInput(raw.horas_extra_sugeridas, 0, 24),
    decision_instructor_terreno: decisionTerreno,
    puntaje_lateralidad: numeroOrNull(fila.puntaje_lateralidad),
    puntaje_tacto_mandos: numeroOrNull(fila.puntaje_tacto_mandos),
    puntaje_mastil: numeroOrNull(fila.puntaje_mastil),
    puntaje_control_receptividad: numeroOrNull(fila.puntaje_control_receptividad),
    nivel_asistencia: fila.nivel_asistencia ?? null,
  };
}

function parsearDecisionInstructor(
  fila: {
    instructor_evaluador: string | null;
    created_at: string | null;
    telemetria_metricas: unknown;
  } | null
): DecisionInstructorCohorteItem | null {
  if (!fila) return null;
  const raw =
    fila.telemetria_metricas &&
    typeof fila.telemetria_metricas === 'object' &&
    !Array.isArray(fila.telemetria_metricas)
      ? (fila.telemetria_metricas as Record<string, unknown>)
      : {};

  const decRaw = raw.decision_t0;
  const decisionT0 =
    typeof decRaw === 'string' &&
    (DECISIONES_T0_VALIDAS as readonly string[]).includes(decRaw)
      ? (decRaw as DecisionInstructorT0)
      : null;

  return {
    decision_t0: decisionT0,
    observacion_decision_t0:
      typeof raw.observacion_decision_t0 === 'string'
        ? raw.observacion_decision_t0
        : null,
    horas_refuerzo_simulador: sanitizarHorasInput(
      raw.horas_refuerzo_simulador,
      0,
      40
    ),
    asistio_teoria: raw.asistio_teoria !== false,
    instructor_decision: fila.instructor_evaluador ?? null,
    fecha_decision: fila.created_at ? fila.created_at.split('T')[0] : null,
  };
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
    .select(
      'id, cohorte_id, dupla_id, numero_sesion, fecha_programada, fecha_real, estado_asistencia, observaciones_instructor'
    )
    .eq('id', input.sesion_id.trim())
    .eq('cohorte_id', input.cohorte_id.trim())
    .maybeSingle<{
      id: string;
      cohorte_id: string;
      dupla_id: string;
      numero_sesion: number;
      fecha_programada: string;
      fecha_real: string | null;
      estado_asistencia: string;
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

  // Verifica si el compañero de dupla ya activó este turno para no duplicar odómetro de SIM-01
  const { data: companerasSlot } = await supabase
    .from('sesiones_practica')
    .select('id, estado_asistencia')
    .eq('cohorte_id', sesion.cohorte_id)
    .eq('dupla_id', sesion.dupla_id)
    .eq('numero_sesion', sesion.numero_sesion)
    .neq('id', sesion.id)
    .returns<Array<{ id: string; estado_asistencia: string }>>();

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

  // Regla Horas-Máquina SIM-01: 1 turno de dupla suma 1.0 h reloj solo si pasa 0 -> >=1 PRESENTE
  const otroPresente = (companerasSlot ?? []).some(
    (c) => c.estado_asistencia === 'PRESENTE'
  );
  const eraActivo = sesion.estado_asistencia === 'PRESENTE' || otroPresente;
  const esActivoAhora = estadoDB === 'PRESENTE' || otroPresente;

  if (eraActivo !== esActivoAhora) {
    const dbSim = createAdminClient() ?? supabase;
    const { data: cohRow } = await dbSim
      .from('cohortes')
      .select('configuracion_cursado')
      .eq('id', sesion.cohorte_id)
      .maybeSingle<{ configuracion_cursado: unknown }>();
    const cfg = normalizarConfiguracionCursado(cohRow?.configuracion_cursado);
    const horasTurno = resolverParametrosHoras(cfg).horas_por_sesion_simulador;
    const deltaMaquina = esActivoAhora ? horasTurno : -horasTurno;

    const { data: sims } = await dbSim
      .from('simuladores')
      .select('id, horas_uso_totales')
      .in('id', ['autoelevador', 'SIM-01'])
      .returns<Array<{ id: string; horas_uso_totales: number | null }>>();

    for (const sim of sims ?? []) {
      const actual =
        typeof sim.horas_uso_totales === 'number' && Number.isFinite(sim.horas_uso_totales)
          ? sim.horas_uso_totales
          : 0;
      const nuevoTotal = Math.max(0, Math.round((actual + deltaMaquina) * 100) / 100);
      await dbSim
        .from('simuladores')
        .update({
          horas_uso_totales: nuevoTotal,
          actualizado_el: new Date().toISOString(),
        })
        .eq('id', sim.id);
    }
  }

  revalidatePath(RUTA_PANEL);
  revalidatePath('/admin');
  revalidatePath('/admin/registro-actividades');
  revalidatePath('/');
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
  let decisionInstructor: DecisionInstructorCohorteItem | null = null;
  const dbReader = createAdminClient() ?? supabase;

  const [{ data: filasPracNueva, error: errPracNueva }, { data: filasMetaEval }] =
    await Promise.all([
      dbReader
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
        >(),
      dbReader
        .from('evaluacion_diagnostico')
        .select(
          'archivo_fuente, created_at, instructor_evaluador, nivel_asistencia, puntaje_lateralidad, puntaje_tacto_mandos, puntaje_mastil, puntaje_control_receptividad, telemetria_metricas'
        )
        .eq('postulante_id', pid)
        .in('archivo_fuente', [ARCHIVO_FUENTE_TERRENO, ARCHIVO_FUENTE_DECISION])
        .returns<
          Array<{
            archivo_fuente: string | null;
            created_at: string | null;
            instructor_evaluador: string | null;
            nivel_asistencia: string | null;
            puntaje_lateralidad: number | null;
            puntaje_tacto_mandos: number | null;
            puntaje_mastil: number | null;
            puntaje_control_receptividad: number | null;
            telemetria_metricas: unknown;
          }>
        >(),
    ]);

  const filaTerrenoTablet =
    (filasMetaEval ?? []).find((f) => f.archivo_fuente === ARCHIVO_FUENTE_TERRENO) ??
    null;
  const filaDecision =
    (filasMetaEval ?? []).find((f) => f.archivo_fuente === ARCHIVO_FUENTE_DECISION) ??
    null;
  const metaTerreno = parsearTerrenoDetalle(filaTerrenoTablet);
  decisionInstructor = parsearDecisionInstructor(filaDecision);

  if (!errPracNueva && filasPracNueva && filasPracNueva.length > 0) {
    const p = filasPracNueva[0];
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
      asistencia_terreno: metaTerreno?.asistencia_terreno ?? 'PRESENTE',
      horas_practica_terreno: metaTerreno?.horas_practica_terreno ?? 1.5,
      horas_extra_terreno: metaTerreno?.horas_extra_terreno ?? 0,
      requiere_horas_extra: metaTerreno?.requiere_horas_extra ?? false,
      horas_extra_sugeridas: metaTerreno?.horas_extra_sugeridas ?? 0,
      puntaje_lateralidad: metaTerreno?.puntaje_lateralidad ?? null,
      puntaje_tacto_mandos: metaTerreno?.puntaje_tacto_mandos ?? null,
      puntaje_mastil: metaTerreno?.puntaje_mastil ?? null,
      puntaje_control_receptividad: metaTerreno?.puntaje_control_receptividad ?? null,
      nivel_asistencia: metaTerreno?.nivel_asistencia ?? null,
      decision_instructor_terreno:
        metaTerreno?.decision_instructor_terreno ??
        (resNormalizado === 'aprobado'
          ? 'APROBADO_EMPRESAS'
          : resNormalizado === 'requiere_refuerzo'
            ? 'REQUIERE_MAS_HORAS'
            : 'NO_APTO'),
      pdf_reporte_path: null,
      pdf_url_firmada: null,
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
        .select('id, fecha_practica, instructor_patio, resultado, observaciones')
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
          asistencia_terreno: metaTerreno?.asistencia_terreno ?? 'PRESENTE',
          horas_practica_terreno: metaTerreno?.horas_practica_terreno ?? 1.5,
          horas_extra_terreno: metaTerreno?.horas_extra_terreno ?? 0,
          requiere_horas_extra: metaTerreno?.requiere_horas_extra ?? false,
          horas_extra_sugeridas: metaTerreno?.horas_extra_sugeridas ?? 0,
          puntaje_lateralidad: metaTerreno?.puntaje_lateralidad ?? null,
          puntaje_tacto_mandos: metaTerreno?.puntaje_tacto_mandos ?? null,
          puntaje_mastil: metaTerreno?.puntaje_mastil ?? null,
          puntaje_control_receptividad: metaTerreno?.puntaje_control_receptividad ?? null,
          nivel_asistencia: metaTerreno?.nivel_asistencia ?? null,
          decision_instructor_terreno: metaTerreno?.decision_instructor_terreno ?? null,
          pdf_reporte_path: null,
          pdf_url_firmada: null,
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
      decisionInstructor,
    },
  };
}

/**
 * Registra o actualiza la práctica real en terreno (CERO Storage: solo SQL/JSONB)
 * junto con los 4 ejes táctiles de patio, horas extra y decisión del instructor.
 */
export async function guardarPracticaRealAction(
  input: GuardarPracticaRealSinStorageInput
): Promise<ResultadoPracticaRealAccion> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Datos de práctica en terreno inválidos.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const cohorteId = String(input.cohorte_id ?? '').trim();
  const postulanteId = String(input.postulante_id ?? '').trim();
  const fechaPractica = String(input.fecha_practica ?? '').trim();
  const lugarPredio = String(input.lugar_predio ?? '').trim().slice(0, 150);
  const maquinaUtilizada = String(input.maquina_utilizada ?? '').trim().slice(0, 120);
  const instructorPatio =
    String(input.instructor_patio ?? '').trim().slice(0, 120) ||
    user.email?.slice(0, 120) ||
    'Equipo de Instructores';
  const resultadoRaw = String(input.resultado ?? '').trim();
  const observacionesTerreno = String(input.observaciones_terreno ?? '')
    .trim()
    .slice(0, 2000);
  const asistenciaTerreno: 'PRESENTE' | 'AUSENTE' =
    input.asistencia_terreno === 'AUSENTE' ? 'AUSENTE' : 'PRESENTE';
  const horasPracticaTerreno =
    asistenciaTerreno === 'AUSENTE'
      ? 0
      : sanitizarHorasInput(input.horas_practica_terreno, 1.5, 24);
  const horasExtraTerreno =
    asistenciaTerreno === 'AUSENTE'
      ? 0
      : sanitizarHorasInput(input.horas_extra_terreno, 0, 24);
  const requiereHorasExtra = input.requiere_horas_extra === true;
  const horasExtraSugeridas = requiereHorasExtra
    ? sanitizarHorasInput(input.horas_extra_sugeridas, 2.0, 24)
    : 0;

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

  const validarEje = (v: unknown): PuntajeEje | null =>
    typeof v === 'number' && (PUNTAJES_EJE_VALIDOS as readonly number[]).includes(v)
      ? (v as PuntajeEje)
      : null;

  const pLat = validarEje(input.puntaje_lateralidad);
  const pMan = validarEje(input.puntaje_tacto_mandos);
  const pMas = validarEje(input.puntaje_mastil);
  const pCon = validarEje(input.puntaje_control_receptividad);
  const nivelAsistencia = esNivelAsistenciaValido(input.nivel_asistencia)
    ? input.nivel_asistencia
    : null;

  const decisionTerreno: DecisionInstructorTerreno =
    input.decision_instructor_terreno &&
    DECISIONES_TERRENO_VALIDAS.includes(input.decision_instructor_terreno)
      ? input.decision_instructor_terreno
      : resultado === 'aprobado'
        ? 'APROBADO_EMPRESAS'
        : resultado === 'requiere_refuerzo'
          ? 'REQUIERE_MAS_HORAS'
          : 'NO_APTO';

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

  const adminOrUser = createAdminClient() ?? supabase;

  // Intento 1: Esquema alineado (migración 0010), costo $0 en Storage (sin subir archivos)
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
      pdf_reporte_path: null,
      storage_pdf_path: null,
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
        storage_pdf_path: null,
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

  // Guarda metadatos de patio + 4 ejes de tablet en evaluacion_diagnostico (cero Storage)
  const dictamenTerreno =
    decisionTerreno === 'APROBADO_EMPRESAS'
      ? 'APTO_DIRECTO'
      : decisionTerreno === 'REQUIERE_MAS_HORAS'
        ? 'CONDICIONAL'
        : 'NO_APTO';
  const scoreTerreno =
    pLat !== null && pMan !== null && pMas !== null && pCon !== null
      ? pLat + pMan + pMas + pCon
      : null;

  const { error: errMetaTerreno } = await adminOrUser
    .from('evaluacion_diagnostico')
    .upsert(
      {
        postulante_id: postulanteId,
        etapa: 'FINAL',
        es_mejor_diagnostico: false,
        archivo_fuente: ARCHIVO_FUENTE_TERRENO,
        asistencia_cabina: nivelAsistencia
          ? mapearNivelAsistenciaACabina(nivelAsistencia)
          : resultado === 'aprobado'
            ? 'MINIMA_AUTONOMO'
            : resultado === 'requiere_refuerzo'
              ? 'MEDIA'
              : 'ALTA',
        nivel_asistencia: nivelAsistencia,
        dictamen: dictamenTerreno,
        puntaje_lateralidad: pLat,
        puntaje_tacto_mandos: pMan,
        puntaje_mastil: pMas,
        puntaje_control_receptividad: pCon,
        score_puntos: scoreTerreno,
        instructor_evaluador: instructorPatio,
        observaciones_detalle: observacionesTerreno || null,
        telemetria_metricas: {
          tipo: 'TERRENO_DETALLE',
          cohorte_id: cohorteId,
          asistencia_terreno: asistenciaTerreno,
          horas_practica_terreno: horasPracticaTerreno,
          horas_extra_terreno: horasExtraTerreno,
          requiere_horas_extra: requiereHorasExtra,
          horas_extra_sugeridas: horasExtraSugeridas,
          decision_instructor_terreno: decisionTerreno,
        },
      },
      { onConflict: 'postulante_id,archivo_fuente' }
    );

  if (errMetaTerreno) {
    console.error('[guardarPracticaRealAction] Aviso al persistir detalle tablet terreno:', {
      code: errMetaTerreno.code,
      message: errMetaTerreno.message,
    });
  }

  revalidatePath(RUTA_PANEL);
  revalidatePath('/cabina/evaluacion');

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
      asistencia_terreno: asistenciaTerreno,
      horas_practica_terreno: horasPracticaTerreno,
      horas_extra_terreno: horasExtraTerreno,
      requiere_horas_extra: requiereHorasExtra,
      horas_extra_sugeridas: horasExtraSugeridas,
      puntaje_lateralidad: pLat,
      puntaje_tacto_mandos: pMan,
      puntaje_mastil: pMas,
      puntaje_control_receptividad: pCon,
      nivel_asistencia: nivelAsistencia,
      decision_instructor_terreno: decisionTerreno,
      pdf_reporte_path: null,
      pdf_url_firmada: null,
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

  const [
    { data: inscripcion },
    { data: filasSesiones },
    { data: filaCohorte },
    { data: filasMeta },
  ] = await Promise.all([
    supabase
      .from('cohorte_inscripciones')
      .select('id, estado')
      .eq('cohorte_id', cid)
      .eq('postulante_id', pid)
      .maybeSingle<{ id: string; estado: string }>(),
    supabase
      .from('sesiones_practica')
      .select('estado_asistencia')
      .eq('cohorte_id', cid)
      .eq('alumno_id', pid)
      .returns<Array<{ estado_asistencia: string }>>(),
    supabase
      .from('cohortes')
      .select('configuracion_cursado')
      .eq('id', cid)
      .maybeSingle<{ configuracion_cursado: unknown }>(),
    supabase
      .from('evaluacion_diagnostico')
      .select(
        'archivo_fuente, created_at, instructor_evaluador, nivel_asistencia, puntaje_lateralidad, puntaje_tacto_mandos, puntaje_mastil, puntaje_control_receptividad, telemetria_metricas'
      )
      .eq('postulante_id', pid)
      .in('archivo_fuente', [ARCHIVO_FUENTE_TERRENO, ARCHIVO_FUENTE_DECISION])
      .returns<
        Array<{
          archivo_fuente: string | null;
          created_at: string | null;
          instructor_evaluador: string | null;
          nivel_asistencia: string | null;
          puntaje_lateralidad: number | null;
          puntaje_tacto_mandos: number | null;
          puntaje_mastil: number | null;
          puntaje_control_receptividad: number | null;
          telemetria_metricas: unknown;
        }>
      >(),
  ]);

  if (!inscripcion?.id) {
    return { ok: false, error: 'El postulante no pertenece a la cohorte indicada.' };
  }

  const sesionesAsistidas = (filasSesiones ?? []).filter(
    (s) => s.estado_asistencia === 'PRESENTE'
  ).length;
  const cfg = normalizarConfiguracionCursado(filaCohorte?.configuracion_cursado);
  const metaTerreno = parsearTerrenoDetalle(
    (filasMeta ?? []).find((f) => f.archivo_fuente === ARCHIVO_FUENTE_TERRENO) ??
      null
  );
  const decInst = parsearDecisionInstructor(
    (filasMeta ?? []).find((f) => f.archivo_fuente === ARCHIVO_FUENTE_DECISION) ??
      null
  );
  const carga = calcularCargaHorariaOperador({
    config: cfg,
    asistioTeoria:
      decInst?.asistio_teoria ??
      (inscripcion.estado === 'CONFIRMADO' || sesionesAsistidas > 0),
    sesionesPresentes: sesionesAsistidas,
    horasRefuerzoSimulador: decInst?.horas_refuerzo_simulador ?? 0,
    practicaReal: metaTerreno
      ? {
          asistencia_terreno: metaTerreno.asistencia_terreno,
          horas_practica_terreno: metaTerreno.horas_practica_terreno,
          horas_extra_terreno: metaTerreno.horas_extra_terreno,
          horas_extra_sugeridas: metaTerreno.horas_extra_sugeridas,
          resultado: 'aprobado',
        }
      : null,
  });
  const horasCompletadas = carga.totalCertificadas;
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

/**
 * Registra la decisión manual del instructor (T0 pase a capacitación, refuerzo
 * manual en simulador y asistencia teórica) sin dependencia de archivos en Storage.
 */
export async function guardarDecisionInstructorAction(
  input: GuardarDecisionInstructorInput
): Promise<
  { ok: true; decisionInstructor: DecisionInstructorCohorteItem } | { ok: false; error: string }
> {
  if (!input || !UUID_RE.test(input.cohorte_id ?? '') || !UUID_RE.test(input.postulante_id ?? '')) {
    return { ok: false, error: 'Identificadores de decisión inválidos.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const cid = input.cohorte_id.trim();
  const pid = input.postulante_id.trim();

  const { data: inscripcion } = await supabase
    .from('cohorte_inscripciones')
    .select('id, estado')
    .eq('cohorte_id', cid)
    .eq('postulante_id', pid)
    .maybeSingle<{ id: string; estado: string }>();

  if (!inscripcion?.id) {
    return { ok: false, error: 'El postulante no pertenece a la cohorte indicada.' };
  }

  const decisionT0: DecisionInstructorT0 =
    input.decision_t0 && DECISIONES_T0_VALIDAS.includes(input.decision_t0)
      ? input.decision_t0
      : 'PENDIENTE';
  const horasRefuerzo = sanitizarHorasInput(input.horas_refuerzo_simulador, 0, 40);
  const asistioTeoria = input.asistio_teoria !== false;
  const obsDecision =
    typeof input.observacion_decision_t0 === 'string'
      ? input.observacion_decision_t0.trim().slice(0, 1000) || null
      : null;

  const dictamenMap =
    decisionT0 === 'RECHAZADO'
      ? 'NO_APTO'
      : decisionT0 === 'PENDIENTE'
        ? 'CONDICIONAL'
        : 'APTO_DIRECTO';

  const adminOrUser = createAdminClient() ?? supabase;
  const instructor = user.email?.slice(0, 120) ?? 'Instructor';

  const { error: errUpsert } = await adminOrUser
    .from('evaluacion_diagnostico')
    .upsert(
      {
        postulante_id: pid,
        etapa: 'DIAG_INTENTO_1',
        es_mejor_diagnostico: false,
        archivo_fuente: ARCHIVO_FUENTE_DECISION,
        asistencia_cabina: 'MINIMA_AUTONOMO',
        dictamen: dictamenMap,
        instructor_evaluador: instructor,
        observaciones_detalle: obsDecision,
        telemetria_metricas: {
          tipo: 'DECISION_INSTRUCTOR',
          cohorte_id: cid,
          decision_t0: decisionT0,
          observacion_decision_t0: obsDecision,
          horas_refuerzo_simulador: horasRefuerzo,
          asistio_teoria: asistioTeoria,
        },
      },
      { onConflict: 'postulante_id,archivo_fuente' }
    );

  if (errUpsert) {
    console.error('[guardarDecisionInstructorAction] Error al persistir decisión:', {
      code: errUpsert.code,
      message: errUpsert.message,
    });
    return { ok: false, error: 'No se pudo guardar la decisión del instructor.' };
  }

  const ahoraIso = new Date().toISOString();
  if (decisionT0 === 'RECHAZADO') {
    await adminOrUser
      .from('cohorte_inscripciones')
      .update({
        estado: 'DESCARTADO',
        motivo_baja: obsDecision
          ? `Decisión manual T0: ${obsDecision}`.slice(0, MAX_MOTIVO_BAJA)
          : 'Rechazado en decisión manual de diagnóstico (T0)',
        franja_id: null,
        updated_at: ahoraIso,
      })
      .eq('id', inscripcion.id)
      .eq('postulante_id', pid);
  } else if (
    decisionT0 === 'APROBADO_A_CAPACITACION' &&
    inscripcion.estado === 'DESCARTADO'
  ) {
    await adminOrUser
      .from('cohorte_inscripciones')
      .update({
        estado: 'DISPONIBLE',
        motivo_baja: null,
        updated_at: ahoraIso,
      })
      .eq('id', inscripcion.id)
      .eq('postulante_id', pid);
  }

  revalidatePath(RUTA_PANEL);
  revalidatePath('/cabina/evaluacion');
  return {
    ok: true,
    decisionInstructor: {
      decision_t0: decisionT0,
      observacion_decision_t0: obsDecision,
      horas_refuerzo_simulador: horasRefuerzo,
      asistio_teoria: asistioTeoria,
      instructor_decision: instructor,
      fecha_decision: obtenerFechaBaseCalendarioHoy(),
    },
  };
}

function mapearRiesgoTitanADB(riesgo: string | null): 'MINIMA_AUTONOMO' | 'MEDIA' | 'ALTA' {
  if (riesgo === 'Mínima (Autónomo)') return 'MINIMA_AUTONOMO';
  if (riesgo === 'Media') return 'MEDIA';
  return 'ALTA';
}

function mapearAptitudTitanADB(
  aptitud: string | null
): 'APTO_DIRECTO' | 'APTO_OBSERVACION' | 'NO_APTO' | 'CONDICIONAL' {
  if (aptitud === 'Apto Directo') return 'APTO_DIRECTO';
  if (aptitud === 'Apto / Observación') return 'APTO_OBSERVACION';
  if (aptitud === 'No Apto') return 'NO_APTO';
  return 'CONDICIONAL';
}

function extraerFechaCalendarioDeMetricas(
  startTime: string | null | undefined,
  createdAt?: string | null
): string {
  if (typeof startTime === 'string') {
    const m = startTime.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (typeof createdAt === 'string') {
    const m = createdAt.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return '9999-99-99';
}

/**
 * Importa en batch múltiples reportes PDF/JSON parseados en el navegador
 * (CERO Storage), asignando T0 (DIAG_INTENTO_1/2) vs T1 (FINAL) por fecha y
 * recalculando deltas cronológicos en `public.evaluacion_diagnostico`.
 */
export async function importarLoteTelemetriaCohorteAction(
  cohorteId: string,
  items: ItemLoteTelemetriaInput[]
): Promise<ResultadoImportarLoteTelemetria> {
  if (!UUID_RE.test(cohorteId ?? '')) {
    return { ok: false, error: 'Cohorte inválida.' };
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 150) {
    return { ok: false, error: 'El lote debe contener entre 1 y 150 reportes.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const cid = cohorteId.trim();
  const db = createAdminClient() ?? supabase;

  const { data: inscritos } = await db
    .from('cohorte_inscripciones')
    .select('postulante_id')
    .eq('cohorte_id', cid)
    .returns<Array<{ postulante_id: string | null }>>();

  const validPostulantes = new Set(
    (inscritos ?? [])
      .map((i) => i.postulante_id)
      .filter((id): id is string => typeof id === 'string')
  );

  // Agrupa reportes válidos del lote por postulante
  const porPostulante = new Map<
    string,
    Array<{ archivo_nombre: string; metricas: MetricasSimulador }>
  >();
  const detalles: ResultadoLoteTelemetriaItem[] = [];
  let errores = 0;

  for (const item of items) {
    const pid = typeof item?.postulante_id === 'string' ? item.postulante_id.trim() : '';
    const archivo =
      typeof item?.archivo_nombre === 'string' && item.archivo_nombre.trim()
        ? item.archivo_nombre.trim().slice(0, 160)
        : 'reporte.pdf';
    const metricas = normalizarMetricasInput(item?.metricas);

    if (!UUID_RE.test(pid) || !validPostulantes.has(pid)) {
      errores++;
      detalles.push({
        archivo_nombre: archivo,
        postulante_id: pid,
        etapa: 'DIAG_INTENTO_1',
        perfil_operador: 'INEFICIENTE',
        es_mejor_diagnostico: false,
        delta_score: null,
        ok: false,
        error: 'El postulante no pertenece a la cohorte activa.',
      });
      continue;
    }

    if (!metricas) {
      errores++;
      detalles.push({
        archivo_nombre: archivo,
        postulante_id: pid,
        etapa: 'DIAG_INTENTO_1',
        perfil_operador: 'INEFICIENTE',
        es_mejor_diagnostico: false,
        delta_score: null,
        ok: false,
        error: 'Métricas de telemetría inválidas.',
      });
      continue;
    }

    const lista = porPostulante.get(pid) ?? [];
    // Evita colisión si en el mismo lote viene duplicado el mismo archivo_nombre
    const idxPrev = lista.findIndex((x) => x.archivo_nombre === archivo);
    if (idxPrev >= 0) lista[idxPrev] = { archivo_nombre: archivo, metricas };
    else lista.push({ archivo_nombre: archivo, metricas });
    porPostulante.set(pid, lista);
  }

  let guardados = 0;

  for (const [pid, nuevosItems] of porPostulante.entries()) {
    const { data: existentesRaw } = await db
      .from('evaluacion_diagnostico')
      .select(
        'id, etapa, archivo_fuente, created_at, tiempo_vuelta_seg, colisiones, score_puntos, eje_lateralidad, telemetria_metricas'
      )
      .eq('postulante_id', pid)
      .returns<
        Array<{
          id: string;
          etapa: string | null;
          archivo_fuente: string | null;
          created_at: string | null;
          tiempo_vuelta_seg: number | null;
          colisiones: number | null;
          score_puntos: number | string | null;
          eje_lateralidad: string | null;
          telemetria_metricas: unknown;
        }>
      >();

    const existentesTitan = (existentesRaw ?? []).filter((f) =>
      esArchivoTitan(f.archivo_fuente)
    );

    // 1) Discriminar y guardar Prácticas Intermedias (Exercise Name != Medium Load Operation):
    //    Se guardan en el historial del alumno con su nombre e índice de cuidado mecánico,
    //    pero se EXCLUYEN por completo del cálculo T0/FINAL, deltas T0->T1 y percentiles.
    const intermediasNuevas = nuevosItems.filter(
      (nv) => !esMediumLoadOperation(nv.metricas.exerciseName)
    );
    for (const nv of intermediasNuevas) {
      const m = nv.metricas;
      const clasif = clasificarPerfilOperador(m);
      const cuidado = calcularCuidadoDesdeMetricas(m).indiceCuidadoMecanico;
      const tiempoInt =
        typeof m.tiempoDuracionSeg === 'number' && Number.isFinite(m.tiempoDuracionSeg)
          ? Math.max(0, Math.round(m.tiempoDuracionSeg))
          : null;

      const { error: errInter } = await db
        .from('evaluacion_diagnostico')
        .upsert(
          {
            postulante_id: pid,
            archivo_fuente: nv.archivo_nombre,
            telemetria_archivo_nombre: nv.archivo_nombre,
            telemetria_metricas: m,
            etapa: 'PRACTICA_INTERMEDIA',
            es_mejor_diagnostico: false,
            asistencia_cabina: mapearRiesgoTitanADB(m.clasificacionRiesgo),
            dictamen: mapearAptitudTitanADB(m.clasificacionAptitud),
            eje_lateralidad: `serrucho=${m.indiceSerrucho}; volantazos_extremos=${m.volantazosExtremos}`,
            eje_tacto_mandos: `frenadas_panico=${m.frenadasPanico}; speed_max_estimada_kmh=${m.velocidadMaxKmh}`,
            eje_mastil: m.hallazgosMastil.slice(0, 5).join('; ') || null,
            tiempo_vuelta_seg: tiempoInt,
            colisiones: m.colisionesReales,
            colisiones_descartadas: m.colisionesDescartadas,
            score_puntos: m.scorePuntos,
            delta_tiempo_seg: null,
            delta_colisiones: null,
            delta_score: null,
            delta_serrucho: null,
            perfil_operador: clasif.perfilOperador,
            horas_recomendadas: clasif.horasRecomendadas,
            modulos_recomendados: clasif.modulosRecomendados,
          },
          { onConflict: 'postulante_id,archivo_fuente' }
        );

      if (errInter) {
        errores++;
        detalles.push({
          archivo_nombre: nv.archivo_nombre,
          postulante_id: pid,
          etapa: 'PRACTICA_INTERMEDIA',
          perfil_operador: clasif.perfilOperador,
          es_mejor_diagnostico: false,
          delta_score: null,
          exercise_name: m.exerciseName,
          indice_cuidado_mecanico: cuidado,
          ok: false,
          error: errInter.message,
        });
      } else {
        guardados++;
        detalles.push({
          archivo_nombre: nv.archivo_nombre,
          postulante_id: pid,
          etapa: 'PRACTICA_INTERMEDIA',
          perfil_operador: clasif.perfilOperador,
          es_mejor_diagnostico: false,
          delta_score: null,
          exercise_name: m.exerciseName,
          indice_cuidado_mecanico: cuidado,
          ok: true,
        });
      }
    }

    // 2) Pipeline estricto "Medium Load Operation" (T0 DIAG_INTENTO_1/2 vs T1 FINAL)
    const mediumNuevos = nuevosItems.filter((nv) =>
      esMediumLoadOperation(nv.metricas.exerciseName)
    );
    if (mediumNuevos.length === 0) continue;

    interface CandidatoOrdenado {
      archivo_fuente: string;
      fechaSort: string;
      fechaCal: string;
      scorePuntos: number | null;
      tiempoDuracionSeg: number | null;
      colisiones: number;
      serrucho: number | null;
      esNuevo: boolean;
      metricas?: MetricasSimulador;
    }

    const mapaUnificado = new Map<string, CandidatoOrdenado>();

    for (const ex of existentesTitan) {
      if (!esFilaMediumLoad(ex)) continue;
      const af = ex.archivo_fuente ?? '';
      if (!af) continue;
      const mGuard = normalizarMetricasGuardadas(ex.telemetria_metricas);
      const lat = parsearTelemetriaLateralidad(ex.eje_lateralidad);
      const startIso = mGuard?.exerciseStartTime ?? ex.created_at ?? '';
      const fechaCal = extraerFechaCalendarioDeMetricas(startIso, ex.created_at);
      mapaUnificado.set(af, {
        archivo_fuente: af,
        fechaSort: startIso || `${fechaCal}T00:00:00`,
        fechaCal,
        scorePuntos: mGuard?.scorePuntos ?? numeroOrNull(ex.score_puntos),
        tiempoDuracionSeg:
          mGuard?.tiempoDuracionSeg ?? numeroOrNull(ex.tiempo_vuelta_seg),
        colisiones: mGuard?.colisionesReales ?? numeroOrNull(ex.colisiones) ?? 0,
        serrucho: mGuard?.indiceSerrucho ?? lat.indice_serrucho,
        esNuevo: false,
      });
    }

    for (const nv of mediumNuevos) {
      const fechaCal = extraerFechaCalendarioDeMetricas(nv.metricas.exerciseStartTime);
      mapaUnificado.set(nv.archivo_nombre, {
        archivo_fuente: nv.archivo_nombre,
        fechaSort: nv.metricas.exerciseStartTime ?? `${fechaCal}T00:00:00`,
        fechaCal,
        scorePuntos: nv.metricas.scorePuntos,
        tiempoDuracionSeg: nv.metricas.tiempoDuracionSeg,
        colisiones: nv.metricas.colisionesReales,
        serrucho: nv.metricas.indiceSerrucho,
        esNuevo: true,
        metricas: nv.metricas,
      });
    }

    const todos = Array.from(mapaUnificado.values()).sort((a, b) =>
      a.fechaSort !== b.fechaSort
        ? a.fechaSort.localeCompare(b.fechaSort)
        : a.archivo_fuente.localeCompare(b.archivo_fuente)
    );
    if (todos.length === 0) continue;

    const fechasConocidas = todos
      .map((t) => t.fechaCal)
      .filter((f) => f !== '9999-99-99');
    const fechaDiag = fechasConocidas[0] ?? todos[0].fechaCal;

    const primerDia = todos.filter(
      (t) => t.fechaCal === fechaDiag || t.fechaCal === '9999-99-99'
    );

    const mejorT0 =
      primerDia.length > 0
        ? [...primerDia].sort((a, b) => {
            const diffScore = (b.scorePuntos ?? -999) - (a.scorePuntos ?? -999);
            if (diffScore !== 0) return diffScore;
            if (a.colisiones !== b.colisiones) return a.colisiones - b.colisiones;
            return (a.tiempoDuracionSeg ?? 999999) - (b.tiempoDuracionSeg ?? 999999);
          })[0]
        : null;

    // Resetea bandera mejor diagnóstico previa antes del upsert para evitar conflicto 23505
    await db
      .from('evaluacion_diagnostico')
      .update({ es_mejor_diagnostico: false })
      .eq('postulante_id', pid)
      .not('archivo_fuente', 'like', 'CABINA_TABLET%')
      .not('archivo_fuente', 'like', 'DECISION_%');

    if (mejorT0 && !mejorT0.esNuevo) {
      await db
        .from('evaluacion_diagnostico')
        .update({ es_mejor_diagnostico: true })
        .eq('postulante_id', pid)
        .eq('archivo_fuente', mejorT0.archivo_fuente);
    }

    const refV1 = primerDia[0] ?? null;

    for (const cand of todos) {
      if (!cand.esNuevo || !cand.metricas) continue;
      const m = cand.metricas;
      const esPrimerDia = primerDia.includes(cand);
      const etapa: EtapaEvaluacion = esPrimerDia
        ? primerDia.indexOf(cand) === 0
          ? 'DIAG_INTENTO_1'
          : 'DIAG_INTENTO_2'
        : 'FINAL';
      const ref =
        etapa === 'DIAG_INTENTO_2'
          ? refV1
          : etapa === 'FINAL'
            ? (mejorT0 ?? refV1)
            : null;

      const deltaScore =
        ref && m.scorePuntos !== null && ref.scorePuntos !== null
          ? Math.round((m.scorePuntos - ref.scorePuntos) * 100) / 100
          : null;
      const deltaTiempo =
        ref && m.tiempoDuracionSeg !== null && ref.tiempoDuracionSeg !== null
          ? Math.trunc(m.tiempoDuracionSeg) - Math.trunc(ref.tiempoDuracionSeg)
          : null;
      const deltaColisiones = ref ? m.colisionesReales - ref.colisiones : null;
      const deltaSerrucho =
        ref && m.indiceSerrucho !== null && ref.serrucho !== null
          ? Math.round((m.indiceSerrucho - ref.serrucho) * 1000) / 1000
          : null;

      const clasif = clasificarPerfilOperador(m);
      const esMejor = mejorT0?.archivo_fuente === cand.archivo_fuente;
      const tiempoInt =
        typeof m.tiempoDuracionSeg === 'number' && Number.isFinite(m.tiempoDuracionSeg)
          ? Math.max(0, Math.round(m.tiempoDuracionSeg))
          : null;

      const { error: errUpsert } = await db
        .from('evaluacion_diagnostico')
        .upsert(
          {
            postulante_id: pid,
            archivo_fuente: cand.archivo_fuente,
            telemetria_archivo_nombre: cand.archivo_fuente,
            telemetria_metricas: m,
            etapa,
            es_mejor_diagnostico: esMejor,
            asistencia_cabina: mapearRiesgoTitanADB(m.clasificacionRiesgo),
            dictamen: mapearAptitudTitanADB(m.clasificacionAptitud),
            eje_lateralidad: `serrucho=${m.indiceSerrucho}; volantazos_extremos=${m.volantazosExtremos}`,
            eje_tacto_mandos: `frenadas_panico=${m.frenadasPanico}; speed_max_estimada_kmh=${m.velocidadMaxKmh}`,
            eje_mastil: m.hallazgosMastil.slice(0, 5).join('; ') || null,
            tiempo_vuelta_seg: tiempoInt,
            colisiones: m.colisionesReales,
            colisiones_descartadas: m.colisionesDescartadas,
            score_puntos: m.scorePuntos,
            delta_tiempo_seg: deltaTiempo,
            delta_colisiones: deltaColisiones,
            delta_score: deltaScore,
            delta_serrucho: deltaSerrucho,
            perfil_operador: clasif.perfilOperador,
            horas_recomendadas: clasif.horasRecomendadas,
            modulos_recomendados: clasif.modulosRecomendados,
          },
          { onConflict: 'postulante_id,archivo_fuente' }
        );

      if (errUpsert) {
        errores++;
        detalles.push({
          archivo_nombre: cand.archivo_fuente,
          postulante_id: pid,
          etapa,
          perfil_operador: clasif.perfilOperador,
          es_mejor_diagnostico: esMejor,
          delta_score: deltaScore,
          ok: false,
          error: errUpsert.message,
        });
      } else {
        guardados++;
        detalles.push({
          archivo_nombre: cand.archivo_fuente,
          postulante_id: pid,
          etapa,
          perfil_operador: clasif.perfilOperador,
          es_mejor_diagnostico: esMejor,
          delta_score: deltaScore,
          ok: true,
        });
      }
    }
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true, guardados, errores, detalles };
}
