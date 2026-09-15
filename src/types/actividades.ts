/**
 * Tipos del módulo "Registro de Actividades" del panel administrativo.
 *
 * Las interfaces reflejan 1:1 las columnas de las tablas
 * `simuladores`, `actividades`, `actividad_participantes` y
 * `actividad_simuladores`. Los campos opcionales en el DTO de entrada
 * se NORMALIZAN a `null` en la Server Action antes del insert (nunca ""
 * en columnas date/time/uuid de Postgres).
 */

/** Estados operativos admitidos por la tabla `simuladores`. */
export type EstadoSimulador = 'libre' | 'en_operacion' | 'mantenimiento';

/** Estados que puede conmutar el operador desde el Rack (excluye mantenimiento). */
export type EstadoSimuladorConmutable = 'libre' | 'en_operacion';

/** Tipos de actividad presencial registrables en el panel. */
export type TipoActividad =
  | 'empresa'
  | 'institucional'
  | 'capacitacion'
  | 'visita_especial'
  | 'mantenimiento'
  | 'otro';

/** Ciclo de vida de una actividad registrada. */
export type EstadoActividad = 'planificada' | 'en_curso' | 'finalizada';

/** Valores admitidos para la columna `genero` de `actividad_participantes`. */
export type GeneroParticipante = 'hombre' | 'mujer' | 'otro' | 'no_especifica';

/** Fila de la tabla `simuladores` (vista del rack en vivo). */
export interface Simulador {
  id: string;
  nombre: string;
  estado: EstadoSimulador;
  horas_uso_totales: number;
  actividad_actual_id: string | null;
}

/** Participante tal como llega del formulario (DTO de entrada). */
export interface ParticipanteInput {
  apellido_nombre: string;
  dni?: string;
  genero: GeneroParticipante;
  puesto?: string;
}

/** Participante ya persistido en `actividad_participantes`. */
export interface ParticipanteActividad {
  id: string;
  actividad_id: string;
  apellido_nombre: string;
  dni: string | null;
  genero: GeneroParticipante;
  puesto: string | null;
}

/** DTO completo de creación de actividad enviado por el formulario. */
export interface ActividadInput {
  tipo: TipoActividad;
  entidad_nombre: string;
  contacto_nombre?: string;
  contacto_telefono?: string;
  fecha_actividad: string;
  hora_inicio?: string;
  hora_fin?: string;
  duracion_minutos: number;
  estado: EstadoActividad;
  observaciones?: string;
  participantes: ParticipanteInput[];
  simuladores_ids: string[];
}

/**
 * Actividad con sus relaciones resueltas (participantes + simuladores
 * asociados). Es la forma que consume la tabla de historial.
 */
export interface ActividadItem {
  id: string;
  tipo: TipoActividad;
  entidad_nombre: string;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  fecha_actividad: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  duracion_minutos: number;
  estado: EstadoActividad;
  observaciones: string | null;
  created_at: string | null;
  participantes: ParticipanteActividad[];
  simuladores: SimuladorActividad[];
}

/** Fila de `actividad_simuladores` con el nombre del equipo resuelto. */
export interface SimuladorActividad {
  id: string;
  actividad_id: string;
  simulador_id: string;
  minutos_uso: number | null;
  /** Nombre del simulador, resuelto por join para mostrarlo en el badge. */
  simulador_nombre?: string | null;
}

/** Retorno estándar de las Server Actions de este módulo. */
export type ResultadoAccion =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/** Etiquetas legibles de los tipos de actividad (uso en selects y badges). */
export const ETIQUETAS_TIPO_ACTIVIDAD: Readonly<Record<TipoActividad, string>> = {
  empresa: 'Empresa',
  institucional: 'Institucional',
  capacitacion: 'Capacitación',
  visita_especial: 'Visita especial',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro',
};

/** Etiquetas legibles de los estados de actividad. */
export const ETIQUETAS_ESTADO_ACTIVIDAD: Readonly<Record<EstadoActividad, string>> = {
  planificada: 'Planificada',
  en_curso: 'En curso',
  finalizada: 'Finalizada',
};

/** Etiquetas legibles de los estados del simulador. */
export const ETIQUETAS_ESTADO_SIMULADOR: Readonly<Record<EstadoSimulador, string>> = {
  libre: 'LIBRE',
  en_operacion: 'EN OPERACIÓN',
  mantenimiento: 'MANTENIMIENTO',
};

/** Etiquetas del selector de género en el formulario. */
export const ETIQUETAS_GENERO: Readonly<Record<GeneroParticipante, string>> = {
  hombre: 'Hombre',
  mujer: 'Mujer',
  otro: 'Otro',
  no_especifica: 'N/E',
};

/** Etiquetas cortas de género para botones segmentados en tablet. */
export const ETIQUETAS_GENERO_CORTAS: Readonly<Record<GeneroParticipante, string>> = {
  hombre: 'H',
  mujer: 'M',
  otro: 'O',
  no_especifica: 'N/E',
};

/**
 * DTO para iniciar una sesión en vivo.
 * Los campos de tiempo/estado los fija el servidor (no el cliente).
 */
export interface IniciarSesionInput {
  tipo: TipoActividad;
  entidad_nombre: string;
  contacto_nombre?: string;
  contacto_telefono?: string;
  observaciones?: string;
  /** IDs de simuladores a vincular (≥1 obligatorio). */
  simuladores_ids: string[];
  /** Nómina inicial (opcional: se puede cargar durante la sesión). */
  participantes?: ParticipanteInput[];
}

/**
 * DTO para finalizar una sesión en vivo.
 * La hora_fin la fija el servidor con now() — no se acepta del cliente.
 */
export interface FinalizarSesionInput {
  actividad_id: string;
  /** Nómina final actualizada. */
  participantes: ParticipanteInput[];
  observaciones?: string;
}
