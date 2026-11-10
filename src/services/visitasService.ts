import { createClient } from '@/lib/supabase/client';
import type {
  AsistenteVisita,
  CampoCheckOperativo,
  Escuela,
  FechaHabilitada,
  TurnoVisita,
  VisitaEducativa,
} from '@/types/visitas';

/** Fecha calendario de hoy en huso horario de Argentina (YYYY-MM-DD). */
function obtenerFechaHoyArgentinaISO(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const anio = partes.find((p) => p.type === 'year')?.value ?? '2026';
  const mes = partes.find((p) => p.type === 'month')?.value ?? '01';
  const dia = partes.find((p) => p.type === 'day')?.value ?? '01';
  return `${anio}-${mes}-${dia}`;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function aTexto(valor: unknown, fallback = ''): string {
  return typeof valor === 'string' ? valor : fallback;
}

export async function obtenerEscuelas(): Promise<Escuela[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('escuelas')
    .select('id, nombre_institucion, nombre_corto, direccion')
    .order('nombre_institucion', { ascending: true });

  if (error) throw error;

  const lista: unknown[] = Array.isArray(data) ? data : [];
  return lista.filter(esObjeto).map((fila) => ({
    id: aTexto(fila.id),
    nombre_institucion: aTexto(fila.nombre_institucion),
    nombre_corto: aTexto(fila.nombre_corto),
    direccion: aTexto(fila.direccion),
  }));
}

export async function obtenerFechasHabilitadas(): Promise<FechaHabilitada[]> {
  const supabase = createClient();
  const hoyISO = obtenerFechaHoyArgentinaISO();

  const [resFechas, resOcupadas] = await Promise.all([
    supabase
      .from('fechas_habilitadas')
      .select('id, fecha, habilitada, observaciones')
      .eq('habilitada', true)
      .gte('fecha', hoyISO)
      .order('fecha', { ascending: true }),
    supabase
      .from('visitas_educativas')
      .select('fecha_visita')
      .gte('fecha_visita', hoyISO)
      .neq('estado_visita', 'Cancelada'),
  ]);

  if (resFechas.error) throw resFechas.error;

  const filasOcupadas: unknown[] =
    !resOcupadas.error && Array.isArray(resOcupadas.data) ? resOcupadas.data : [];
  const fechasOcupadas = new Set(
    filasOcupadas
      .filter(esObjeto)
      .map((fila) => aTexto(fila.fecha_visita))
      .filter((f) => f.length > 0)
  );

  const filasFechas: unknown[] = Array.isArray(resFechas.data) ? resFechas.data : [];
  return filasFechas.filter(esObjeto).map((fila) => {
    const fecha = aTexto(fila.fecha);
    return {
      id: aTexto(fila.id),
      fecha,
      habilitada: Boolean(fila.habilitada),
      observaciones: typeof fila.observaciones === 'string' ? fila.observaciones : null,
      ocupada: fechasOcupadas.has(fecha),
    };
  });
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
