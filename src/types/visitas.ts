export interface Escuela {
  id: string;
  nombre_institucion: string;
  nombre_corto: string;
  direccion: string;
}

export interface FechaHabilitada {
  id: string;
  fecha: string;
  habilitada: boolean;
  observaciones?: string | null;
}

export type TurnoVisita = 'Mañana' | 'Tarde';

export type AnioEscolar = '5°' | '6°';

export type RolAsistente = 'Alumno' | 'Docente';

export interface AsistenteInput {
  apellido_nombre: string;
  dni: string;
  fecha_nacimiento?: string;
  rol: RolAsistente;
}

export interface SolicitudVisitaInput {
  id_escuela?: string | null;
  otra_institucion_nombre?: string | null;
  fecha_visita: string;
  turno?: string;
  anio: AnioEscolar;
  division: string;
  /** Cupo máximo permitido: 40 alumnos. */
  cant_alumnos: number;
  /**
   * Opcional en la entrada: la calcula el SERVIDOR (Server Action) a partir de
   * la escuela seleccionada. El cliente no la envía como verdad.
   */
  requiere_tup?: boolean;
  nombre_director: string;
  cel_director: string;
  nombre_docente: string;
  cel_docente: string;
  email_contacto: string;
  acepta_imagenes: boolean;
  acepta_medidas_judiciales: boolean;
  asistentes: AsistenteInput[];
}

/**
 * Columnas booleanas de seguimiento operativo que se marcan desde el panel
 * de administración (seguro, transporte, facturas y carga en Drive).
 */
export type CampoCheckOperativo =
  | 'check_poliza'
  | 'check_tup'
  | 'check_facturas'
  | 'check_drive_sum';

export interface VisitaEducativa extends SolicitudVisitaInput {
  id: string;
  /** La fila persistida siempre incluye este campo (lo fija el servidor). */
  requiere_tup: boolean;
  codigo_reserva: string;
  estado_visita: string;
  estado_poliza: string;
  tup_horario_ida_desde: string;
  tup_horario_ida_hasta: string;
  tup_horario_vuelta_desde: string;
  tup_horario_vuelta_hasta: string;
  created_at: string;
  check_poliza?: boolean | null;
  check_tup?: boolean | null;
  check_facturas?: boolean | null;
  check_drive_sum?: boolean | null;
}

/** Fila de la tabla `visita_asistentes` asociada a una visita educativa. */
export interface AsistenteVisita {
  id: string;
  id_visita: string;
  apellido_nombre: string;
  dni: string;
  fecha_nacimiento: string | null;
  rol: RolAsistente;
}

/** Proyección enriquecida de fechas_habilitadas para el selector de edición. */
export interface FechaDisponibleItem {
  id: string;
  fecha: string;
  habilitada: boolean;
  observaciones?: string | null;
  /** True si otra reserva activa ocupa esta fecha. */
  ocupada: boolean;
  /** Código de la reserva que la ocupa (para mostrar en UI). */
  ocupada_por_codigo?: string | null;
}

/** DTO de entrada para la Server Action de edición de visitas. */
export interface EditarVisitaInput {
  id: string;
  fecha_visita: string;
  turno?: 'Mañana' | 'Tarde' | null;
  division?: string | null;
  cant_alumnos: number;
  nombre_director?: string | null;
  cel_director?: string | null;
  nombre_docente?: string | null;
  cel_docente?: string | null;
  email_contacto?: string | null;
  requiere_tup: boolean;
  tup_horario_ida_desde?: string | null;
  tup_horario_ida_hasta?: string | null;
  tup_horario_vuelta_desde?: string | null;
  tup_horario_vuelta_hasta?: string | null;
  tup_chofer_nombre?: string | null;
  estado_visita: 'Confirmada' | 'Reprogramada' | 'Cancelada' | 'Completada' | 'Pendiente';
  observaciones_docente?: string | null;
}

/** Resultado tipado de la acción de actualización. */
export type ResultadoEdicionVisita =
  | { ok: true }
  | { ok: false; error: string };
