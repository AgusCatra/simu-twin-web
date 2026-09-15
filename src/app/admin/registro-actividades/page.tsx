import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import RackSimuladores from '@/components/admin/actividades/RackSimuladores';
import TablaActividades from '@/components/admin/actividades/TablaActividades';
import type {
  ActividadItem,
  EstadoActividad,
  EstadoSimulador,
  GeneroParticipante,
  ParticipanteActividad,
  Simulador,
  SimuladorActividad,
  TipoActividad,
} from '@/types/actividades';

/**
 * /admin/registro-actividades — Server Component.
 *
 * La página consulta en paralelo la flota (simuladores) y el historial de
 * actividades con sus relaciones anidadas (participantes + simuladores),
 * y entrega la foto a los componentes cliente del Rack, la Tabla y el Modal.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Registro de Actividades · Hub Simuladores',
  description:
    'Rack en vivo de simuladores y registro de actividades presenciales con nómina de participantes.',
};

/** Forma cruda devuelta por PostgREST para la tabla `simuladores`. */
interface FilaSimulador {
  id: string;
  nombre: string;
  estado: EstadoSimulador;
  horas_uso_totales: number | null;
  actividad_actual_id: string | null;
}

/** Participante anidado dentro del SELECT de `actividades`. */
interface FilaParticipante {
  id: string;
  actividad_id: string;
  apellido_nombre: string;
  dni: string | null;
  genero: GeneroParticipante;
  puesto: string | null;
}

/**
 * Simulador asociado anidado. PostgREST puede devolver la relación muchos-a-uno
 * como objeto o como array (según el FK detectado), por eso se normaliza.
 */
interface FilaActividadSimulador {
  id: string;
  actividad_id: string;
  simulador_id: string;
  minutos_uso: number | null;
  simuladores?:
    | { id: string; nombre: string }
    | { id: string; nombre: string }[]
    | null;
}

/** Fila cruda de la tabla `actividades` con sus relaciones. */
interface FilaActividad {
  id: string;
  tipo: TipoActividad;
  entidad_nombre: string;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  fecha_actividad: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  duracion_minutos: number | null;
  estado: EstadoActividad;
  observaciones: string | null;
  created_at: string | null;
  actividad_participantes?: FilaParticipante[] | null;
  actividad_simuladores?: FilaActividadSimulador[] | null;
}

/** Normaliza la fila cruda al tipo público `Simulador`. */
function mapearSimulador(fila: FilaSimulador): Simulador {
  return {
    id: fila.id,
    nombre: fila.nombre,
    estado: fila.estado,
    horas_uso_totales: fila.horas_uso_totales ?? 0,
    actividad_actual_id: fila.actividad_actual_id,
  };
}

/** Extrae el nombre del simulador anidado (objeto o array, indistintamente). */
function resolverNombreSimulador(
  relacion: FilaActividadSimulador['simuladores']
): string | null {
  if (!relacion) return null;
  if (Array.isArray(relacion)) {
    return relacion[0]?.nombre ?? null;
  }
  return relacion.nombre ?? null;
}

/** Normaliza la fila cruda al tipo público `ActividadItem`. */
function mapearActividad(fila: FilaActividad): ActividadItem {
  const participantes: ParticipanteActividad[] = (
    fila.actividad_participantes ?? []
  ).map((p) => ({
    id: p.id,
    actividad_id: p.actividad_id,
    apellido_nombre: p.apellido_nombre,
    dni: p.dni,
    genero: p.genero,
    puesto: p.puesto,
  }));

  const simuladores: SimuladorActividad[] = (fila.actividad_simuladores ?? []).map(
    (s) => ({
      id: s.id,
      actividad_id: s.actividad_id,
      simulador_id: s.simulador_id,
      minutos_uso: s.minutos_uso,
      simulador_nombre: resolverNombreSimulador(s.simuladores),
    })
  );

  return {
    id: fila.id,
    tipo: fila.tipo,
    entidad_nombre: fila.entidad_nombre,
    contacto_nombre: fila.contacto_nombre,
    contacto_telefono: fila.contacto_telefono,
    fecha_actividad: fila.fecha_actividad,
    hora_inicio: fila.hora_inicio,
    hora_fin: fila.hora_fin,
    duracion_minutos: fila.duracion_minutos ?? 0,
    estado: fila.estado,
    observaciones: fila.observaciones,
    created_at: fila.created_at,
    participantes,
    simuladores,
  };
}

/** SELECT anidado de actividades + participantes + simuladores (con nombre). */
const SELECT_ACTIVIDADES =
  '*, actividad_participantes(*), actividad_simuladores(*, simuladores(id, nombre))';

export default async function RegistroActividadesPage() {
  const supabase = await createClient();

  const [respuestaSimuladores, respuestaActividades] = await Promise.all([
    supabase
      .from('simuladores')
      .select('*')
      .order('nombre', { ascending: true })
      .returns<FilaSimulador[]>(),
    supabase
      .from('actividades')
      .select(SELECT_ACTIVIDADES)
      .order('fecha_actividad', { ascending: false })
      .limit(50)
      .returns<FilaActividad[]>(),
  ]);

  // Fallos de lectura no bloquean la página: se renderiza vacío y el operador
  // puede reintentar con el botón REFRESCAR del toolbar.
  if (respuestaSimuladores.error) {
    console.error('[registro-actividades] Error al cargar simuladores:', {
      code: respuestaSimuladores.error.code,
      message: respuestaSimuladores.error.message,
    });
  }
  if (respuestaActividades.error) {
    console.error('[registro-actividades] Error al cargar actividades:', {
      code: respuestaActividades.error.code,
      message: respuestaActividades.error.message,
    });
  }

  const simuladores: Simulador[] = (respuestaSimuladores.data ?? []).map(
    mapearSimulador
  );
  const actividades: ActividadItem[] = (respuestaActividades.data ?? []).map(
    mapearActividad
  );

  const enOperacion = simuladores.filter((s) => s.estado === 'en_operacion').length;
  const enMantenimiento = simuladores.filter((s) => s.estado === 'mantenimiento').length;
  const libres = simuladores.length - enOperacion - enMantenimiento;

  return (
    <section className="space-y-6">
      {/* ── Cabecera de la página ─────────────────────────────── */}
      <header className="border-b border-zinc-800 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
          Registro de Actividades
        </h2>
        <p className="mt-1 font-mono text-[11px] tracking-[0.1em] text-zinc-500">
          /ADMIN/REGISTRO-ACTIVIDADES · RACK EN VIVO + HISTORIAL
        </p>
      </header>

      {/* ── Rack SCADA en vivo ────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-zinc-800 bg-zinc-950 px-4 py-3">
          <div>
            <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.16em] text-zinc-100">
              RACK DE CONTROL EN VIVO
            </h3>
            <p className="mt-0.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
              CONMUTACIÓN DIRECTA · LIBRE / EN OPERACIÓN
            </p>
          </div>
          <dl className="flex flex-wrap items-center gap-4 font-mono text-[11px] tracking-[0.1em]">
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
              <dt className="text-zinc-500">OP</dt>
              <dd className="text-zinc-100">{enOperacion}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-zinc-700" />
              <dt className="text-zinc-500">LB</dt>
              <dd className="text-zinc-100">{libres}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-amber-500" />
              <dt className="text-zinc-500">MT</dt>
              <dd className="text-zinc-100">{enMantenimiento}</dd>
            </div>
          </dl>
        </div>

        <RackSimuladores simuladores={simuladores} />
      </div>

      {/* ── Separador sutil ───────────────────────────────────── */}
      <div aria-hidden className="border-t border-zinc-800" />

      {/* ── Historial + alta ──────────────────────────────────── */}
      <div className="space-y-3">
        <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-4 py-3">
          <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.16em] text-zinc-100">
            HISTORIAL DE ACTIVIDADES
          </h3>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
            ÚLTIMAS 50 · ORDENADAS POR FECHA DESCENDENTE
          </p>
        </div>

        <TablaActividades
          actividades={actividades}
          simuladores={simuladores}
        />
      </div>
    </section>
  );
}
