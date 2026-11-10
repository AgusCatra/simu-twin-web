/**
 * Modelo de la Consola Viva de Cabina (tablet). Proyección del postulante en
 * turno y del payload de evaluación que persiste en `evaluacion_diagnostico`.
 * Los puntajes por eje y el bonus son enteros discretos validados en DB (0006).
 */

export type PuntajeEje = 0 | 10 | 20;

export type ClaveEje =
  | 'lateralidad'
  | 'tacto_mandos'
  | 'mastil'
  | 'control_receptividad';

export type AsistenciaCabina = 'MINIMA_AUTONOMO' | 'MEDIA' | 'ALTA';

export type NivelAsistencia =
  | 'AUTONOMO'
  | 'AYUDA_VERBAL'
  | 'INTERVENCION_CONSTANTE'
  | 'INTERVENCION_CRITICA';

export type BloqueSplit =
  | 'PILOTO_A'
  | 'COPILOTO_B'
  | 'PILOTO_B'
  | 'COPILOTO_A';

export type EtapaEvaluacionCabina = 'DIAG_INTENTO_1' | 'DIAG_INTENTO_2' | 'FINAL';

export type DictamenCabina =
  | 'APTO_DIRECTO'
  | 'APTO_OBSERVACION'
  | 'NO_APTO'
  | 'CONDICIONAL';

export interface AlumnoTurno {
  inscripcion_id: string;
  postulante_id: string;
  nombre_completo: string;
  dni: string;
  estado: string;
  ranking_orden: number;
}

export interface EvaluacionCabinaInput {
  postulante_id: string;
  inscripcion_id: string;
  etapa?: EtapaEvaluacionCabina;
  puntaje_lateralidad: PuntajeEje;
  puntaje_tacto_mandos: PuntajeEje;
  puntaje_mastil: PuntajeEje;
  puntaje_control_receptividad: PuntajeEje;
  bonus_segundo_intento: 0 | 10;
  nivel_asistencia: NivelAsistencia;
  asistencia_cabina?: AsistenciaCabina;
  bloque_split?: BloqueSplit | null;
  hard_fail: boolean;
  motivo_hard_fail?: string | null;
  tiempo_vuelta_seg?: number | null;
  instructor_evaluador?: string | null;
  observaciones_rapidas?: string[] | null;
  observaciones_detalle?: string | null;
}

export interface ResultadoGuardar {
  ok: boolean;
  error?: string;
  dictamen?: DictamenCabina;
  score?: number;
}
