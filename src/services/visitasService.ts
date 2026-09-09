import { supabase } from '@/lib/supabase';
import type {
  Escuela,
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

export async function crearSolicitudVisita(
  datos: SolicitudVisitaInput
): Promise<VisitaEducativa> {
  const disponible = await verificarTurnoDisponible(datos.fecha_visita, datos.turno);

  if (!disponible) {
    throw new Error('El turno seleccionado ya se encuentra ocupado');
  }

  const { data, error } = await supabase
    .from('visitas_educativas')
    .insert({
      ...datos,
      estado_visita: 'Confirmada',
      estado_poliza: 'Pendiente',
    })
    .select()
    .single();

  if (error) throw error;

  return data as VisitaEducativa;
}
