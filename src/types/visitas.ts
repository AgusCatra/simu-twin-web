export interface Escuela {
  id: string;
  nombre_institucion: string;
  nombre_corto: string;
  direccion: string;
}

export type TurnoVisita = 'Mañana' | 'Tarde';

export interface SolicitudVisitaInput {
  id_escuela: string;
  fecha_visita: string;
  turno: TurnoVisita;
  division: string;
  cant_alumnos: number;
  nombre_director: string;
  cel_director: string;
  nombre_docente: string;
  cel_docente: string;
  drive_nomina_url?: string;
}

export interface VisitaEducativa extends SolicitudVisitaInput {
  id: string;
  estado_visita: string;
  estado_poliza: string;
}
