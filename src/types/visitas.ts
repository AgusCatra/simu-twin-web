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
  /** Se calcula en el servicio a partir de la escuela seleccionada. */
  requiere_tup: boolean;
  nombre_director: string;
  cel_director: string;
  nombre_docente: string;
  cel_docente: string;
  email_contacto: string;
  acepta_imagenes: boolean;
  acepta_medidas_judiciales: boolean;
  asistentes: AsistenteInput[];
}

export interface VisitaEducativa extends SolicitudVisitaInput {
  id: string;
  codigo_reserva: string;
  estado_visita: string;
  estado_poliza: string;
  tup_horario_ida_desde: string;
  tup_horario_ida_hasta: string;
  tup_horario_vuelta_desde: string;
  tup_horario_vuelta_hasta: string;
  created_at: string;
}
