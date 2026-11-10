/**
-- =============================================================================
-- SIMUCORE TWIN · VENADO TUERTO
-- Contratos de Datos: Cohortes V2 y Modelo de 16 Alumnos
--
-- Directiva Operativa ODD - Sprint 1:
-- Modelo de capacitación en duplas fijas pedagógicas (16 alumnos por cohorte,
-- 6 clases prácticas de 1h = 3 semanas).
-- =============================================================================
*/

/** Estados del ciclo de vida operativo de una cohorte V2. */
export type EstadoCohorteV2 =
  | 'PLANIFICADA'
  | 'DIAGNOSTICO'
  | 'EN_CURSO'
  | 'FINALIZADA'
  | 'CANCELADA';

/** Grupos pedagógicos semanales de cursado (8 alumnos / 4 duplas por grupo). */
export type GrupoCursado = 'GRUPO_A' | 'GRUPO_B';

/**
 * Franjas horarias fijas de cabina (4 turnos diarios de 1 hora):
 * - M1_10_11: 10:00 a 11:00
 * - M2_11_12: 11:00 a 12:00
 * - T1_16_17: 16:00 a 17:00
 * - T2_17_18: 17:00 a 18:00
 */
export type FranjaCursado =
  | 'M1_10_11'
  | 'M2_11_12'
  | 'T1_16_17'
  | 'T2_17_18';

/** Estados de asistencia por alumno en cada sesión práctica. */
export type EstadoAsistenciaSesion =
  | 'PROGRAMADA'
  | 'PRESENTE'
  | 'AUSENTE_JUSTIFICADO'
  | 'AUSENTE_INJUSTIFICADO';

/** Rol inicial asignado al inicio de la hora de práctica (rotación a los 30 min). */
export type RolSesion = 'PILOTO_INICIAL' | 'COPILOTO_INICIAL';

/** Resultado formal del egreso tras el ciclo de 6 clases. */
export type EstadoEgreso = 'CERTIFICADO' | 'INCOMPLETO' | 'ABANDONO';

/** Perfil sociolaboral asignado para presentación a empresas. */
export type PerfilLaboral =
  | 'DESTACADO'
  | 'ESTANDAR'
  | 'CON_OBSERVACIONES'
  | 'NO_RECOMENDADO';

/** Metadatos de franjas horarias para consumo en componentes UI. */
export interface DetalleFranja {
  codigo: FranjaCursado;
  turno: 'Mañana' | 'Tarde';
  horarioLabel: string;
  horaInicio: string;
  horaFin: string;
}

export const DETALLES_FRANJAS: Record<FranjaCursado, DetalleFranja> = {
  M1_10_11: {
    codigo: 'M1_10_11',
    turno: 'Mañana',
    horarioLabel: '10:00 - 11:00',
    horaInicio: '10:00',
    horaFin: '11:00',
  },
  M2_11_12: {
    codigo: 'M2_11_12',
    turno: 'Mañana',
    horarioLabel: '11:00 - 12:00',
    horaInicio: '11:00',
    horaFin: '12:00',
  },
  T1_16_17: {
    codigo: 'T1_16_17',
    turno: 'Tarde',
    horarioLabel: '16:00 - 17:00',
    horaInicio: '16:00',
    horaFin: '17:00',
  },
  T2_17_18: {
    codigo: 'T2_17_18',
    turno: 'Tarde',
    horarioLabel: '17:00 - 18:00',
    horaInicio: '17:00',
    horaFin: '18:00',
  },
};

/** Días calendario asignados a cada grupo. */
export const DIAS_CURSADO_GRUPO: Record<GrupoCursado, readonly string[]> = {
  GRUPO_A: ['Lunes', 'Miércoles'],
  GRUPO_B: ['Martes', 'Jueves'],
};

/** Modelo de cohorte extendida (tabla public.cohortes con columnas V2). */
export interface CohorteV2 {
  id: string;
  codigo: string;
  nombre: string;
  tipo_maquinaria: string;
  estado_v2: EstadoCohorteV2;
  cupo_alumnos: number;
  duracion_semanas: number;
  total_sesiones_requeridas: number;
  fecha_teoria: string | null;
  fecha_inicio_sim: string | null;
  fecha_fin_sim: string | null;
  fecha_pase_planta: string | null;
  cant_dias_sim?: number | null;
  max_titulares?: number | null;
  created_at?: string;
}

/** Modelo de la tabla public.evaluacion_final_egreso. */
export interface EvaluacionFinalEgreso {
  id: string;
  cohorte_id: string;
  postulante_id: string;
  horas_practica_completadas: number;
  sesiones_asistidas: number;
  estado_egreso: EstadoEgreso;
  perfil_laboral: PerfilLaboral;
  devolucion_empleo: string | null;
  aprobado_practica_terreno: boolean | null;
  fecha_evaluacion: string | null;
  created_at: string;
}

/** DTO para registrar o actualizar el egreso de un alumno. */
export interface GuardarEgresoInput {
  cohorte_id: string;
  postulante_id: string;
  horas_practica_completadas?: number;
  sesiones_asistidas?: number;
  estado_egreso: EstadoEgreso;
  perfil_laboral: PerfilLaboral;
  devolucion_empleo?: string | null;
  aprobado_practica_terreno?: boolean | null;
  fecha_evaluacion?: string | null;
}

// Re-exportar contratos del motor de calendario para acceso unificado
export type {
  ProyeccionCohorteV2Input,
  SesionPlanificada,
  EstadoViernesBuffer,
  ProyeccionCohorteV2Resultado,
} from '@/lib/calendario-duplas';

