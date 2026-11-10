/**
 * Modelo del panel /gestion/cohortes (Gestión de Empleo).
 * Proyección de `cohortes`, `franjas_cabina`, `cohorte_inscripciones`,
 * `postulantes` y `evaluacion_diagnostico` (migraciones 0005 + 0006 + 0007).
 */

export type TurnoFranja = 'Mañana' | 'Tarde';

export type EstadoInscripcion = 'DISPONIBLE' | 'CONFIRMADO' | 'DESCARTADO';

export interface CohorteActiva {
  id: string;
  codigo: string;
  nombre: string;
  /** YYYY-MM-DD o null si aún no se configuró. */
  fecha_teoria: string | null;
  fecha_inicio_sim: string | null;
  fecha_fin_sim: string | null;
  fecha_pase_planta: string | null;
  cant_dias_sim: number;
  max_titulares: number;
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

export interface DatosCohorteActiva {
  cohorte: CohorteActiva;
  franjas: FranjaCabina[];
  postulantes: PostulanteFila[];
  totalConfirmados: number;
}

export interface ConfiguracionCohorteInput {
  /** YYYY-MM-DD. */
  fecha_teoria: string;
  max_titulares: number;
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

export type ResultadoAccion = { ok: true } | { ok: false; error: string };
