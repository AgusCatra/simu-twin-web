import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PanelLogisticaTup from '@/components/admin/tup/PanelLogisticaTup';
import type { EstadoTrasladoTup, TrasladoTupItem } from '@/types/tup';

/**
 * /admin/tup — Server Component del módulo LOGÍSTICA TUP (H4).
 *
 * Muestra únicamente traslados activos (`requiere_tup = true` y `estado_visita`
 * en `'Confirmada' | 'Reprogramada'`) desde la fecha actual en huso horario de
 * Argentina (`America/Argentina/Buenos_Aires`), ordenados cronológicamente por
 * fecha y franja horaria.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Logística TUP · Hub Simuladores',
  description:
    'Panel móvil de traslados municipales (TUP) para visitas educativas: estados, horarios, chofer y contacto directo.',
};

type EscuelaJoinTup =
  | {
      nombre_institucion: string | null;
      direccion: string | null;
      telefono: string | null;
    }
  | Array<{
      nombre_institucion: string | null;
      direccion: string | null;
      telefono: string | null;
    }>
  | null;

interface FilaTrasladoTup {
  id: string;
  codigo_reserva: string | null;
  fecha_visita: string | null;
  turno: string | null;
  cant_alumnos: number | null;
  id_escuela: string | null;
  otra_institucion_nombre: string | null;
  nombre_docente: string | null;
  cel_docente: string | null;
  tup_horario_ida_desde: string | null;
  tup_horario_ida_hasta: string | null;
  tup_horario_vuelta_desde: string | null;
  tup_horario_vuelta_hasta: string | null;
  tup_chofer_nombre: string | null;
  tup_estado_traslado: string | null;
  estado_visita: string | null;
  requiere_tup: boolean | null;
  escuelas?: EscuelaJoinTup;
}

const SELECT_TRASLADOS = `
  id,
  codigo_reserva,
  fecha_visita,
  turno,
  cant_alumnos,
  id_escuela,
  otra_institucion_nombre,
  nombre_docente,
  cel_docente,
  tup_horario_ida_desde,
  tup_horario_ida_hasta,
  tup_horario_vuelta_desde,
  tup_horario_vuelta_hasta,
  tup_chofer_nombre,
  tup_estado_traslado,
  estado_visita,
  requiere_tup,
  escuelas(nombre_institucion, direccion, telefono)
`;

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

function obtenerEscuelaObjeto(join: EscuelaJoinTup): {
  nombre_institucion: string | null;
  direccion: string | null;
  telefono: string | null;
} | null {
  if (!join) return null;
  return Array.isArray(join) ? (join[0] ?? null) : join;
}

function normalizarEstadoTraslado(raw: string | null | undefined): EstadoTrasladoTup {
  const norm = (raw ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (norm === 'en_camino') return 'en_camino';
  if (norm === 'en_destino') return 'en_destino';
  if (norm === 'finalizado' || norm === 'completado') return 'finalizado';
  return 'pendiente';
}

function mapearTraslado(fila: FilaTrasladoTup): TrasladoTupItem {
  const escuela = obtenerEscuelaObjeto(fila.escuelas ?? null);
  const institucionNombre =
    escuela?.nombre_institucion?.trim() ||
    fila.otra_institucion_nombre?.trim() ||
    'Institución sin registrar';

  return {
    id: fila.id,
    codigo_reserva: fila.codigo_reserva ?? '',
    fecha_visita: (fila.fecha_visita ?? '').split('T')[0],
    turno: fila.turno ?? null,
    cant_alumnos:
      typeof fila.cant_alumnos === 'number' && Number.isFinite(fila.cant_alumnos)
        ? fila.cant_alumnos
        : 0,
    institucion_nombre: institucionNombre,
    institucion_direccion: escuela?.direccion?.trim() || null,
    institucion_telefono: escuela?.telefono?.trim() || null,
    nombre_docente: fila.nombre_docente ?? null,
    cel_docente: fila.cel_docente ?? null,
    tup_horario_ida_desde: fila.tup_horario_ida_desde ?? null,
    tup_horario_ida_hasta: fila.tup_horario_ida_hasta ?? null,
    tup_horario_vuelta_desde: fila.tup_horario_vuelta_desde ?? null,
    tup_horario_vuelta_hasta: fila.tup_horario_vuelta_hasta ?? null,
    tup_chofer_nombre: fila.tup_chofer_nombre ?? null,
    tup_estado_traslado: normalizarEstadoTraslado(fila.tup_estado_traslado),
    estado_visita: fila.estado_visita ?? '',
  };
}

function ordenarCronologicamente(a: TrasladoTupItem, b: TrasladoTupItem): number {
  const cmpFecha = a.fecha_visita.localeCompare(b.fecha_visita);
  if (cmpFecha !== 0) return cmpFecha;

  const horaA = a.tup_horario_ida_desde ?? '99:99';
  const horaB = b.tup_horario_ida_desde ?? '99:99';
  const cmpHora = horaA.localeCompare(horaB);
  if (cmpHora !== 0) return cmpHora;

  const pesoTurno = (turno: string | null): number =>
    turno?.toLowerCase().includes('mañana') ? 0 : 1;
  return pesoTurno(a.turno) - pesoTurno(b.turno);
}

export default async function TupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const hoyISO = obtenerFechaHoyArgentinaISO();

  const { data, error } = await supabase
    .from('visitas_educativas')
    .select(SELECT_TRASLADOS)
    .eq('requiere_tup', true)
    .in('estado_visita', ['Confirmada', 'Reprogramada'])
    .gte('fecha_visita', hoyISO)
    .order('fecha_visita', { ascending: true })
    .order('tup_horario_ida_desde', { ascending: true })
    .returns<FilaTrasladoTup[]>();

  let errorLectura: string | null = null;
  if (error) {
    errorLectura = 'No se pudieron consultar los traslados TUP en este momento.';
    console.error('[/admin/tup] Error al cargar traslados TUP:', {
      code: error.code,
      message: error.message,
    });
  }

  const traslados = (data ?? [])
    .filter(
      (fila) =>
        (fila.tup_estado_traslado ?? '').trim().toLowerCase() !== 'cancelado'
    )
    .map(mapearTraslado)
    .sort(ordenarCronologicamente);

  return (
    <div className="mx-auto w-full max-w-lg">
      {/* ── Cabecera de la página ───────────────────────────────── */}
      <header className="mb-5 border-b border-zinc-800 pb-3">
        <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-600">
          /ADMIN/TUP · MÓDULO H4
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">
          Logística TUP{' '}
          <span className="font-mono text-zinc-500">{'// TRASLADOS MUNICIPALES'}</span>
        </h2>
        <p className="mt-1 font-mono text-[10.5px] leading-relaxed tracking-[0.08em] text-zinc-500">
          PANEL TÁCTIL DE DESPACHO · CHOFERES TUP · HOY {hoyISO}
        </p>
      </header>

      <PanelLogisticaTup
        traslados={traslados}
        hoyISO={hoyISO}
        errorLectura={errorLectura}
      />
    </div>
  );
}
