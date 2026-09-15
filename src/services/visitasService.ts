import { createClient } from '@/lib/supabase/client';
import type {
  AsistenteVisita,
  CampoCheckOperativo,
  Escuela,
  FechaHabilitada,
  TurnoVisita,
  VisitaEducativa,
} from '@/types/visitas';

export async function obtenerEscuelas(): Promise<Escuela[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('escuelas')
    .select('id, nombre_institucion, nombre_corto, direccion')
    .order('nombre_institucion', { ascending: true });

  if (error) throw error;

  return (data ?? []) as Escuela[];
}

export async function obtenerFechasHabilitadas(): Promise<FechaHabilitada[]> {
  const supabase = createClient();
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
  const supabase = createClient();
  const { data, error } = await supabase
    .from('visitas_educativas')
    .select('id')
    .eq('fecha_visita', fecha)
    .eq('turno', turno)
    .neq('estado_visita', 'Cancelada');

  if (error) throw error;

  return (data ?? []).length === 0;
}

/** Cupo máximo de alumnos por jornada, compartido con la Server Action. */
export const CUPO_MAXIMO_ALUMNOS = 40;

/**
 * Lista todas las reservas para el panel de administración,
 * con las más recientes primero.
 */
export async function obtenerVisitasAdmin(): Promise<VisitaEducativa[]> {
  const supabase = createClient();
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
  const supabase = createClient();
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
  const supabase = createClient();
  const { data, error } = await supabase
    .from('visita_asistentes')
    .select('id, id_visita, apellido_nombre, dni, fecha_nacimiento, rol')
    .eq('id_visita', idVisita)
    .order('apellido_nombre', { ascending: true });

  if (error) throw error;

  return (data ?? []) as AsistenteVisita[];
}
