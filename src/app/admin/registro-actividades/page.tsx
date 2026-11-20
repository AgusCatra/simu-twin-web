import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
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
 * Vista dedicada al Registro de Actividades e Institucionales:
 * alta rápida (y apertura automática con `?nueva=1`), Monitor de Sesión en Vivo,
 * totalizador de personas/horas e historial completo filtrable por categoría.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Registro de Actividades e Institucionales · Centro de Simuladores',
  description:
    'Registro rápido de visitas institucionales, empresas, demostraciones en vivo y nómina de participantes.',
};

interface FilaSimulador {
  id: string;
  nombre: string;
  estado: EstadoSimulador;
  horas_uso_totales: number | null;
  actividad_actual_id: string | null;
}

interface FilaParticipante {
  id: string;
  actividad_id: string;
  apellido_nombre: string;
  dni: string | null;
  genero: GeneroParticipante;
  puesto: string | null;
}

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

function mapearSimulador(fila: FilaSimulador): Simulador {
  return {
    id: fila.id,
    nombre: fila.nombre,
    estado: fila.estado,
    horas_uso_totales: fila.horas_uso_totales ?? 0,
    actividad_actual_id: fila.actividad_actual_id,
  };
}

function resolverNombreSimulador(
  relacion: FilaActividadSimulador['simuladores']
): string | null {
  if (!relacion) return null;
  if (Array.isArray(relacion)) {
    return relacion[0]?.nombre ?? null;
  }
  return relacion.nombre ?? null;
}

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

  const simuladores: SimuladorActividad[] = (
    fila.actividad_simuladores ?? []
  ).map((s) => ({
    id: s.id,
    actividad_id: s.actividad_id,
    simulador_id: s.simulador_id,
    minutos_uso: s.minutos_uso,
    simulador_nombre: resolverNombreSimulador(s.simuladores),
  }));

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

const SELECT_ACTIVIDADES =
  '*, actividad_participantes(*), actividad_simuladores(*, simuladores(id, nombre))';

interface RegistroActividadesPageProps {
  searchParams?: Promise<{ nueva?: string | string[] | undefined }>;
}

export default async function RegistroActividadesPage({
  searchParams,
}: RegistroActividadesPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const nuevaParam = Array.isArray(params?.nueva)
    ? params?.nueva[0]
    : params?.nueva;
  const abrirModalInicial = nuevaParam === '1';

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
      .limit(500)
      .returns<FilaActividad[]>(),
  ]);

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

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Registro de Actividades e Institucionales
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Visitas institucionales, demostraciones en vivo, empresas y eventos especiales en el Centro
          </p>
        </div>
      </header>

      <TablaActividades
        actividades={actividades}
        simuladores={simuladores}
        abrirModalInicial={abrirModalInicial}
      />
    </section>
  );
}
