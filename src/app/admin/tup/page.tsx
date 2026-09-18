import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import PanelLogisticaTup from '@/components/admin/tup/PanelLogisticaTup';
import type { EstadoTrasladoTup, TrasladoTupItem } from '@/types/tup';

/**
 * /admin/tup — Server Component del módulo LOGÍSTICA TUP (H4).
 *
 * La tabla `visitas_educativas` NO tiene columnas `nombre_institucion` /
 * `direccion_institucion` directas: la institución se resuelve vía FK
 * `id_escuela -> escuelas` o, en su defecto, con el texto libre
 * `otra_institucion_nombre`. Por eso se usa el embed de PostgREST
 * `escuelas(nombre_institucion, direccion)` y se aplica el fallback en el map.
 *
 * Solo se listan traslados activos: `requiere_tup = true` y visitas que no
 * estén canceladas. Orden cronológico por fecha y por horario de ida.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Logística TUP · Hub Simuladores',
  description:
    'Panel móvil de traslados municipales (TUP) para visitas educativas: estados, horarios y contacto con docentes.',
};

/** Forma cruda devuelta por PostgREST con el embed de `escuelas`. */
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
  tup_estado_traslado: EstadoTrasladoTup | null;
  estado_visita: string | null;
  requiere_tup: boolean | null;
  escuelas?: { nombre_institucion: string | null; direccion: string | null } | null;
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
  escuelas(nombre_institucion, direccion)
`;

/** Resuelve el nombre visible de la institución (FK o texto libre). */
function resolverInstitucionNombre(fila: FilaTrasladoTup): string {
  const desdeFk = fila.escuelas?.nombre_institucion?.trim();
  if (desdeFk) return desdeFk;
  const libre = fila.otra_institucion_nombre?.trim();
  if (libre) return libre;
  return 'Institución sin registrar';
}

/** Normaliza la fila cruda al DTO público que consume el panel. */
function mapearTraslado(fila: FilaTrasladoTup): TrasladoTupItem {
  return {
    id: fila.id,
    codigo_reserva: fila.codigo_reserva ?? '',
    fecha_visita: fila.fecha_visita ?? '',
    turno: fila.turno ?? null,
    cant_alumnos: fila.cant_alumnos ?? 0,
    institucion_nombre: resolverInstitucionNombre(fila),
    institucion_direccion: fila.escuelas?.direccion ?? null,
    nombre_docente: fila.nombre_docente ?? null,
    cel_docente: fila.cel_docente ?? null,
    tup_horario_ida_desde: fila.tup_horario_ida_desde ?? null,
    tup_horario_ida_hasta: fila.tup_horario_ida_hasta ?? null,
    tup_horario_vuelta_desde: fila.tup_horario_vuelta_desde ?? null,
    tup_horario_vuelta_hasta: fila.tup_horario_vuelta_hasta ?? null,
    tup_chofer_nombre: fila.tup_chofer_nombre ?? null,
    tup_estado_traslado: fila.tup_estado_traslado ?? 'pendiente',
    estado_visita: fila.estado_visita ?? '',
  };
}

export default async function TupPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('visitas_educativas')
    .select(SELECT_TRASLADOS)
    .eq('requiere_tup', true)
    .neq('estado_visita', 'Cancelada')
    .order('fecha_visita', { ascending: true })
    .order('tup_horario_ida_desde', { ascending: true })
    .returns<FilaTrasladoTup[]>();

  // Un fallo de lectura no bloquea el render: se muestra el panel vacío y el
  // operador puede reintentar recargando. Registramos solo code/message (sin
  // PII de menores) por consistencia con las demás páginas del admin.
  if (error) {
    console.error('[/admin/tup] Error al cargar traslados TUP:', {
      code: error.code,
      message: error.message,
    });
  }

  const traslados: TrasladoTupItem[] = (data ?? []).map(mapearTraslado);

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
          PANEL TÁCTIL DE DESPACHO · CHOFERES TUP
        </p>
      </header>

      <PanelLogisticaTup traslados={traslados} />
    </div>
  );
}
