/**
-- =============================================================================
-- SIMUCORE TWIN · VENADO TUERTO
-- Contratos de Datos: Duplas Pedagógicas y Sesiones Prácticas
--
-- Directiva Operativa ODD - Sprint 1:
-- Mapeo relacional de duplas_cabina, sesiones_practica y sus DTOs asociados.
-- =============================================================================
*/

import type {
  EstadoAsistenciaSesion,
  FranjaCursado,
  GrupoCursado,
  RolSesion,
} from './cohorte-v2';

// Re-exportar tipos base para facilitar importaciones centralizadas
export type {
  EstadoCohorteV2,
  GrupoCursado,
  FranjaCursado,
  EstadoAsistenciaSesion,
  RolSesion,
  EstadoEgreso,
  PerfilLaboral,
  EvaluacionFinalEgreso,
  GuardarEgresoInput,
} from './cohorte-v2';

/** Modelo que mapea exactamente una fila de public.duplas_cabina. */
export interface DuplaCabina {
  id: string;
  cohorte_id: string;
  grupo: GrupoCursado;
  franja: FranjaCursado;
  alumno_1_id: string;
  alumno_2_id: string;
  activo: boolean;
  created_at: string;
}

/** Resumen de postulante para visualización en componentes de dupla. */
export interface PostulanteDuplaResumen {
  id: string;
  nombre_completo: string;
  dni: string;
  ranking_orden?: number;
  telefono?: string | null;
}

/** Dupla con datos resueltos de los alumnos integrantes (vistas / joins). */
export interface DuplaConAlumnos extends DuplaCabina {
  alumno_1: PostulanteDuplaResumen;
  alumno_2: PostulanteDuplaResumen;
}

/** Modelo que mapea exactamente una fila de public.sesiones_practica. */
export interface SesionPractica {
  id: string;
  cohorte_id: string;
  dupla_id: string;
  alumno_id: string;
  /** Número de sesión en el ciclo formativo (1 a 6). */
  numero_sesion: number;
  /** Fecha planificada de la clase (formato ISO YYYY-MM-DD). */
  fecha_programada: string;
  /** Fecha efectiva en que se completó (formato ISO YYYY-MM-DD). */
  fecha_real: string | null;
  /** True si la sesión se recuperó en el buffer operativo de los viernes. */
  es_recuperatorio_viernes: boolean;
  estado_asistencia: EstadoAsistenciaSesion;
  rol_inicio: RolSesion;
  minutos_operacion: number;
  minutos_observacion: number;
  evaluacion_id: string | null;
  observaciones_instructor: string | null;
  created_at: string;
}

/** Sesión con detalle del postulante y la franja para interfaces de instructor. */
export interface SesionConDetalle extends SesionPractica {
  alumno: PostulanteDuplaResumen;
  dupla: {
    grupo: GrupoCursado;
    franja: FranjaCursado;
  };
}

/** DTO para la creación / asignación de una dupla de cabina. */
export interface CrearDuplaInput {
  cohorte_id: string;
  grupo: GrupoCursado;
  franja: FranjaCursado;
  alumno_1_id: string;
  alumno_2_id: string;
  activo?: boolean;
}

/** DTO para registrar la asistencia y métricas de una sesión práctica individual. */
export interface RegistrarAsistenciaSesionInput {
  sesion_id?: string;
  cohorte_id: string;
  dupla_id: string;
  alumno_id: string;
  numero_sesion: number;
  fecha_real?: string | null;
  estado_asistencia: EstadoAsistenciaSesion;
  rol_inicio?: RolSesion;
  es_recuperatorio_viernes?: boolean;
  minutos_operacion?: number;
  minutos_observacion?: number;
  evaluacion_id?: string | null;
  observaciones_instructor?: string | null;
}

/** Filtro para listado de sesiones en la consola de instructor. */
export interface FiltroSesionesInput {
  cohorte_id: string;
  grupo?: GrupoCursado;
  franja?: FranjaCursado;
  fecha?: string;
  numero_sesion?: number;
  estado_asistencia?: EstadoAsistenciaSesion;
}
