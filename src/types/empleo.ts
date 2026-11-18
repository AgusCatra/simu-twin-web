/**
 * Modelo del panel /gestion/cohortes (Gestión de Empleo).
 * Proyección de `cohortes`, `franjas_cabina`, `cohorte_inscripciones`,
 * `postulantes` y `evaluacion_diagnostico` (migraciones 0005 + 0006 + 0007).
 */

import type { InformeEmpleoIA } from '@/lib/ia/generador-informe';
import type { MetricasSimulador, PerfilOperador } from '@/lib/telemetria/parser-simulador';
import type {
  EstadoEgreso,
  FranjaCursado,
  GrupoCursado,
  PerfilLaboral,
  RolSesion,
} from './cohorte-v2';

export type TurnoFranja = 'Mañana' | 'Tarde';

export type EstadoCohorte = 'borrador' | 'activa' | 'finalizada';

export type EstadoInscripcion = 'DISPONIBLE' | 'CONFIRMADO' | 'DESCARTADO';

export type TipoMaquinariaCohorte =
  | 'AUTOELEVADOR'
  | 'PALA_FRONTAL'
  | 'RETROEXCAVADORA';

export interface ConfiguracionCursadoCohorte {
  modalidad: 'DUPLAS';
  dias_grupo_a: number[];
  dias_grupo_b: number[];
  franjas_activas: string[];
  sesiones_objetivo: number;
}

export type EstadoAsistenciaUI =
  | 'PENDIENTE'
  | 'PRESENTE'
  | 'AUSENTE_JUSTIFICADO'
  | 'AUSENTE_INJUSTIFICADO'
  | 'REPROGRAMADA';

export type ResultadoPracticaReal =
  | 'aprobado'
  | 'requiere_refuerzo'
  | 'no_apto';

export interface CohorteResumen {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoCohorte;
  tipo_maquinaria: string | null;
  fecha_teoria: string | null;
  fecha_inicio_sim: string | null;
}

export interface CohorteActiva {
  id: string;
  codigo: string;
  nombre: string;
  estado?: EstadoCohorte;
  /** YYYY-MM-DD o null si aún no se configuró. */
  fecha_teoria: string | null;
  fecha_inicio_sim: string | null;
  fecha_fin_sim: string | null;
  fecha_pase_planta: string | null;
  cant_dias_sim: number;
  max_titulares: number;
  configuracion_cursado: ConfiguracionCursadoCohorte;
}

export interface FranjaCabina {
  id: string;
  turno: TurnoFranja;
  horario_label: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_maximo: number;
  /** Inscriptos CONFIRMADO en la franja, por ranking. */
  ocupantes: OcupanteFranja[];
}

export interface OcupanteFranja {
  inscripcion_id: string;
  nombre_completo: string;
  dni: string;
  ranking_orden: number;
}

/**
 * Telemetría TITAN reconstruida desde filas con `archivo_fuente != CABINA_TABLET*`.
 * `tiene_datos` es false cuando el postulante aún no tiene reporte TITAN procesado.
 */
export interface TelemetriaTitan {
  tiene_datos: boolean;
  score_puntos: number | null;
  tiempo_vuelta_seg: number | null;
  colisiones: number | null;
  colisiones_descartadas: number | null;
  indice_serrucho: number | null;
  volantazos_extremos: number | null;
}

/** Última evaluación de diagnóstico del postulante (tabla singular, 0005+0006+0008). */
export interface FichaEvaluacion {
  dictamen: string | null;
  asistencia_cabina: string | null;
  nivel_asistencia: string | null;
  bloque_split: string | null;
  tiene_evaluacion_tablet: boolean;
  etapa_tablet: EtapaEvaluacion | null;
  score_tablet: number | null;
  hard_fail: boolean;
  motivo_hard_fail: string | null;
  instructor_evaluador: string | null;
  observaciones_rapidas: string[] | null;
  observaciones_detalle: string | null;
  /** Puntajes enteros 0/10/20 de la consola táctil; null si no fue evaluado allí. */
  puntaje_lateralidad: number | null;
  puntaje_tacto_mandos: number | null;
  puntaje_mastil: number | null;
  puntaje_control_receptividad: number | null;
  /** Descripciones textuales legacy del pipeline PDF. */
  eje_lateralidad: string | null;
  eje_tacto_mandos: string | null;
  eje_mastil: string | null;
  eje_control_receptividad: string | null;
  telemetria: TelemetriaTitan;
  telemetria_archivo_nombre: string | null;
  telemetria_metricas: MetricasSimulador | null;
  informe_ia: InformeEmpleoIA | null;
  perfil_operador?: PerfilOperador | null;
  horas_recomendadas?: number | null;
  modulos_recomendados?: string[] | null;
}

export interface PostulanteFila {
  inscripcion_id: string;
  postulante_id: string;
  ranking_orden: number;
  nombre_completo: string;
  dni: string;
  origen_turno: 'TM' | 'TT' | 'INDEFINIDO';
  estado: EstadoInscripcion;
  motivo_baja: string | null;
  /** Notas sociolaborales del equipo de Empleo (`obs_empleo`). */
  obs_empleo: string | null;
  franja_id: string | null;
  evaluacion: FichaEvaluacion | null;
}

export interface DuplaPersistidaItem {
  id: string;
  cohorte_id: string;
  grupo: GrupoCursado;
  franja: FranjaCursado;
  horario_label: string;
  alumno_1_id: string;
  alumno_2_id: string;
  activo: boolean;
}

export interface SesionPracticaItem {
  id: string;
  cohorte_id: string;
  dupla_id: string;
  alumno_id: string;
  numero_sesion: number;
  fecha_programada: string;
  fecha_real: string | null;
  es_recuperatorio_viernes: boolean;
  estado_asistencia: EstadoAsistenciaUI;
  rol_inicio: RolSesion;
  minutos_operacion: number;
  minutos_observacion: number;
  observaciones_instructor: string | null;
}

export interface PracticaRealItem {
  id: string;
  fecha_practica: string;
  lugar_predio: string | null;
  maquina_utilizada: string | null;
  instructor_patio: string | null;
  resultado: ResultadoPracticaReal;
  observaciones_terreno: string | null;
  pdf_reporte_path: string | null;
  pdf_url_firmada: string | null;
}

export interface EvaluacionFinalEgresoItem {
  id: string;
  cohorte_id: string;
  postulante_id: string;
  estado_egreso: EstadoEgreso;
  paso_a_terreno_aprobado: boolean | null;
  recomendacion_laboral: PerfilLaboral;
  observaciones_egreso: string | null;
  sesiones_asistidas: number;
  horas_practica_completadas: number;
  fecha_evaluacion: string | null;
}

export interface Legajo360Postulante {
  sesiones: SesionPracticaItem[];
  viernesSugeridos: string[];
  practicaReal: PracticaRealItem | null;
  egreso: EvaluacionFinalEgresoItem | null;
}

export interface DatosCohorteActiva {
  cohorte: CohorteActiva;
  franjas: FranjaCabina[];
  postulantes: PostulanteFila[];
  totalConfirmados: number;
  duplasPersistidas: DuplaPersistidaItem[];
  sesionesPractica: SesionPracticaItem[];
}

export interface ConfiguracionCohorteInput {
  /** YYYY-MM-DD. */
  fecha_teoria: string;
  max_titulares: number;
  configuracion_cursado?: ConfiguracionCursadoCohorte;
}

// ─────────────────────────────────────────────────────────────────────────
// Evaluación multi-intento V1 / V2 / FINAL (migración 0008)
// ─────────────────────────────────────────────────────────────────────────

export type EtapaEvaluacion = 'DIAG_INTENTO_1' | 'DIAG_INTENTO_2' | 'FINAL';

/** Métricas de una pasada (V1, V2 o Prueba Final) de evaluacion_diagnostico. */
export interface MetricasIntento {
  evaluacionId: string;
  etapa: EtapaEvaluacion;
  archivoFuente: string | null;
  dictamen: string | null;
  asistenciaCabina: string | null;
  tiempoVueltaSeg: number | null;
  colisiones: number | null;
  colisionesDescartadas: number | null;
  scorePuntos: number | null;
  indiceSerrucho: number | null;
  volantazosExtremos: number | null;
  esMejorDiagnostico: boolean;
}

/**
 * Signo: valor de la pasada menos su referencia. Para INTENTO_2 la referencia
 * es INTENTO_1; para FINAL es el registro con es_mejor_diagnostico = TRUE.
 */
export interface DeltasIntento {
  deltaTiempoSeg: number | null;
  deltaColisiones: number | null;
  deltaScore: number | null;
  deltaSerrucho: number | null;
}

/** Lectura cualitativa de la evolución V1 → V2 para el drawer/gráficos. */
export type EvaluacionReceptividad =
  | 'Alta Asimilación'
  | 'Estable'
  | 'Ansiedad Operativa'
  | 'Sin Datos';

export type EjeRadar = 'Lateralidad' | 'Mandos' | 'Mástil' | 'Control';

export interface PuntoRadar {
  eje: EjeRadar;
  /** 0 - 100; escala de puntaje_* (0/10/20) ×5 o heurística legacy. */
  valorDiagnostico: number;
  /** 0 - 100; sin Prueba Final se repite el valor del mejor diagnóstico. */
  valorFinal: number;
}

/** Payload estructurado para Radar/Spider chart y comparativa temporal. */
export interface ComparativaProgreso {
  postulanteId: string;
  tieneTelemetriaTitan: boolean;
  tieneEvaluacionTablet: boolean;
  v1: MetricasIntento | null;
  /** null mientras el postulante no tenga segunda pasada TITAN sincronizada. */
  v2: MetricasIntento | null;
  deltaDiagnostico: {
    /** delta_tiempo_seg de V2 (negativo = mejoró). null si falta V2 o dato. */
    deltaTiempoSeg: number | null;
    /** delta_colisiones de V2 (negativo = redujo colisiones). null si falta V2. */
    deltaColisiones: number | null;
    /** delta_score de V2 (positivo = mejoró). null si falta V2 o dato. */
    deltaScore: number | null;
    /** delta_tiempo_seg de V2 (negativo = mejoró). 0 si no hay V2. */
    mejoraTiempoSeg: number;
    /** reducción de colisiones V1→V2 (positivo = mejoró). 0 si no hay V2. */
    reduccionColisiones: number;
    /** delta_score de V2 (positivo = mejoró). 0 si no hay V2. */
    evolucionScore: number;
    evaluacionReceptividad: EvaluacionReceptividad;
  } | null;
  mejorDiagnostico: MetricasIntento | null;
  pruebaFinal?: MetricasIntento;
  deltaFinal?: DeltasIntento & {
    /** (scoreFinal - scoreMejorDiag) / scoreMejorDiag × 100. */
    mejoraTotalPorcentaje: number;
    /** dictamen FINAL === 'APTO_DIRECTO'. */
    aptoParaPlanta: boolean;
  };
  radarEjes: PuntoRadar[];
  tieneComparativaFinalRadar: boolean;
}

export interface CrearCohorteInput {
  codigo: string;
  nombre: string;
  tipo_maquinaria: TipoMaquinariaCohorte;
  fecha_teoria: string;
  cupo_alumnos: number;
  max_titulares: number;
  activar_inmediatamente?: boolean;
  configuracion_cursado?: ConfiguracionCursadoCohorte;
}

export interface SincronizarDuplasInput {
  cohorte_id: string;
  asignaciones: Array<{
    grupo: GrupoCursado;
    franja: FranjaCursado;
    alumno_1_id: string;
    alumno_2_id: string;
  }>;
}

export interface ActualizarAsistenciaSesionInput {
  sesion_id: string;
  cohorte_id: string;
  estado_asistencia: EstadoAsistenciaUI;
  fecha_reprogramacion?: string | null;
  observaciones_instructor?: string | null;
}

export interface GuardarEgresoLegajoInput {
  cohorte_id: string;
  postulante_id: string;
  estado_egreso: EstadoEgreso;
  paso_a_terreno_aprobado: boolean | null;
  recomendacion_laboral: PerfilLaboral;
  observaciones_egreso?: string | null;
}

export interface CrearPostulanteInput {
  cohorte_id: string;
  nombre_completo: string;
  dni: string;
  origen_turno: 'TM' | 'TT' | 'INDEFINIDO';
  telefono?: string | null;
  ranking_orden: number;
  obs_empleo?: string | null;
}

export interface AnalizarTelemetriaIAInput {
  postulante_id: string;
  cohorte_id?: string | null;
  archivo_nombre: string;
  metricas: MetricasSimulador;
}

export type ResultadoAccion = { ok: true } | { ok: false; error: string };

export type ResultadoCrearCohorte =
  | { ok: true; cohorte_id: string }
  | { ok: false; error: string };

export type ResultadoCrearPostulante =
  | { ok: true; postulante_id: string; inscripcion_id: string }
  | { ok: false; error: string };

export type ResultadoAnalisisIA =
  | { ok: true; informe: InformeEmpleoIA; persistido: boolean }
  | { ok: false; error: string };

export type ResultadoSincronizarDuplas =
  | {
      ok: true;
      duplasGuardadas: number;
      sesionesGeneradas: number;
      advertencia?: string;
    }
  | { ok: false; error: string };

export type ResultadoPracticaRealAccion =
  | { ok: true; practicaReal: PracticaRealItem }
  | { ok: false; error: string };

export type ResultadoEgresoAccion =
  | { ok: true; egreso: EvaluacionFinalEgresoItem }
  | { ok: false; error: string };
