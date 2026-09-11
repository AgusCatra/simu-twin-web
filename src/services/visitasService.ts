import { supabase } from '@/lib/supabase';
import type {
  AsistenteVisita,
  CampoCheckOperativo,
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

  if (!datos.asistentes || datos.asistentes.length === 0) {
    throw new Error(
      'Debe cargar la nómina de alumnos y acompañantes para confirmar la reserva.'
    );
  }

  // Si seleccionó una escuela de la lista oficial, lleva TUP automáticamente.
  // Si es texto libre ("+ Otra institución"), no lleva transporte municipal.
  const requiereTup = !!datos.id_escuela;

  const codigoReserva = generarCodigoReserva();
  const { asistentes, ...datosVisita } = datos;

  const { data, error } = await supabase
    .from('visitas_educativas')
    .insert({
      ...datosVisita,
      requiere_tup: requiereTup,
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

/**
 * Lista todas las reservas para el panel de administración,
 * con las más recientes primero.
 */
export async function obtenerVisitasAdmin(): Promise<VisitaEducativa[]> {
  const { data, error } = await supabase
    .from('visitas_educativas')
    .select('*')
    .order('fecha_visita', { ascending: false });

  if (error) throw error;

  return (data ?? []) as VisitaEducativa[];
}

/**
 * Persiste el estado de un checkbox operativo (seguro, TUP, facturas o Drive)
 * para una visita puntual.
 */
export async function actualizarCheckOperativo(
  id: string,
  campo: CampoCheckOperativo,
  valor: boolean
): Promise<void> {
  const { error } = await supabase
    .from('visitas_educativas')
    .update({ [campo]: valor })
    .eq('id', id);

  if (error) throw error;
}

/** Obtiene la nómina de alumnos y docentes cargada para una visita. */
export async function obtenerAsistentesPorVisita(
  idVisita: string
): Promise<AsistenteVisita[]> {
  const { data, error } = await supabase
    .from('visita_asistentes')
    .select('id, id_visita, apellido_nombre, dni, fecha_nacimiento, rol')
    .eq('id_visita', idVisita)
    .order('apellido_nombre', { ascending: true });

  if (error) throw error;

  return (data ?? []) as AsistenteVisita[];
}
