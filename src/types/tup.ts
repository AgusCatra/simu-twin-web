/**
 * Modelo del módulo LOGÍSTICA TUP (H4 · traslados municipales).
 *
 * Un TrasladoTupItem es la proyección mínima que necesita el panel móvil del
 * chofer/operador TUP: datos de la reserva, de la institución, contacto y
 * horarios de ida/vuelta. La fuente de verdad es `visitas_educativas` filtrada
 * por `requiere_tup = true` y `estado_visita IN ('Confirmada', 'Reprogramada')`.
 */

export const ESTADOS_TRASLADO_TUP = [
  'pendiente',
  'en_camino',
  'en_destino',
  'finalizado',
] as const;

export type EstadoTrasladoTup = (typeof ESTADOS_TRASLADO_TUP)[number];

export interface TrasladoTupItem {
  id: string;
  codigo_reserva: string;
  fecha_visita: string;
  turno: string | null;
  cant_alumnos: number;
  institucion_nombre: string;
  institucion_direccion?: string | null;
  institucion_telefono?: string | null;
  nombre_docente: string | null;
  cel_docente: string | null;
  tup_horario_ida_desde: string | null;
  tup_horario_ida_hasta: string | null;
  tup_horario_vuelta_desde: string | null;
  tup_horario_vuelta_hasta: string | null;
  tup_chofer_nombre: string | null;
  tup_estado_traslado: EstadoTrasladoTup;
  estado_visita: string;
}

export interface ActualizarEstadoTrasladoInput {
  visita_id: string;
  tup_estado_traslado?: EstadoTrasladoTup;
  tup_chofer_nombre?: string | null;
}

export type ResultadoActualizarTrasladoTup =
  | {
      ok: true;
      tup_estado_traslado?: EstadoTrasladoTup;
      tup_chofer_nombre?: string | null;
    }
  | { ok: false; error: string };
