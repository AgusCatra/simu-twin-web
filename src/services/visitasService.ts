import { supabase } from '@/lib/supabase';
import type {
  Escuela,
  FechaHabilitada,
  SolicitudVisitaInput,
  TurnoVisita,
  VisitaEducativa,
} from '@/types/visitas';

export async function obtenerEscuelas(): Promise<Escuela[]> {
  const { data, error } = await supabase
    .from('escuelas')
    .select('id, nombre_institucion, nombre_corto, direccion')
    .order('nombre_institucion', { ascending: true });

  if (error) throw error;

  return (data ?? []) as Escuela[];
}

export async function obtenerFechasHabilitadas(): Promise<FechaHabilitada[]> {
  const { data, error } = await supabase
    .from('fechas_habilitadas')
    .select('id, fecha, habilitada, observaciones')
    .eq('habilitada', true)
    .order('fecha', { ascending: true });

  if (error) throw error;

  return (data ?? []) as FechaHabilitada[];
}

export async function verificarTurnoDisponible(
  fecha: string,
  turno: TurnoVisita
): Promise<boolean> {
  const { data, error } = await supabase
    .from('visitas_educativas')
    .select('id')
    .eq('fecha_visita', fecha)
    .eq('turno', turno)
    .neq('estado_visita', 'Cancelada');

  if (error) throw error;

  return (data ?? []).length === 0;
}

function generarCodigoReserva(): string {
  const numero = Math.floor(Math.random() * 90000) + 10000;
  return `CS-${numero}`;
}

export const CUPO_MAXIMO_ALUMNOS = 40;

export async function crearSolicitudVisita(
  datos: SolicitudVisitaInput
): Promise<VisitaEducativa> {
  if (!datos.acepta_imagenes || !datos.acepta_medidas_judiciales) {
    throw new Error(
      'Debe aceptar las condiciones legales y de imagen para continuar'
    );
  }

  if (datos.cant_alumnos > CUPO_MAXIMO_ALUMNOS) {
    throw new Error('El cupo máximo permitido es de 40 alumnos');
  }

  const disponible = await verificarTurnoDisponible(datos.fecha_visita, datos.turno);

  if (!disponible) {
    throw new Error('El turno seleccionado ya se encuentra ocupado');
  }

  const codigoReserva = generarCodigoReserva();
  const { asistentes, ...datosVisita } = datos;

  const { data, error } = await supabase
    .from('visitas_educativas')
    .insert({
      ...datosVisita,
      codigo_reserva: codigoReserva,
      estado_visita: 'Confirmada',
      estado_poliza: 'Pendiente',
      tup_horario_ida_desde: '08:00',
      tup_horario_ida_hasta: '08:15',
      tup_horario_vuelta_desde: '11:30',
      tup_horario_vuelta_hasta: '11:45',
    })
    .select()
    .single();

  if (error) throw error;

  const visitaInsertada = data as VisitaEducativa;

  if (asistentes.length > 0) {
    const { error: errorAsistentes } = await supabase
      .from('visita_asistentes')
      .insert(
        asistentes.map((asistente) => ({
          id_visita: visitaInsertada.id,
          apellido_nombre: asistente.apellido_nombre,
          dni: asistente.dni,
          fecha_nacimiento: asistente.fecha_nacimiento ?? null,
          rol: asistente.rol,
        }))
      );

    if (errorAsistentes) throw errorAsistentes;
  }

  return visitaInsertada;
}
