import type { Metadata } from 'next';
import { Cpu, Gauge, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { obtenerEstadisticasGlobalesCentro } from '@/services/estadisticas-centro';
import RackSimuladores from '@/components/admin/actividades/RackSimuladores';
import PanelEstadisticasCentro from '@/components/admin/actividades/PanelEstadisticasCentro';
import type { EstadoSimulador, Simulador } from '@/types/actividades';

/**
 * /admin/simuladores — Server Component.
 *
 * Vista técnica dedicada a la flota de los 7 simuladores del Centro:
 * cambio rápido de estado (Libre / En Uso / En Mantenimiento),
 * odómetros de horas reales y estadísticas técnicas generales.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Simuladores y Mantenimiento · Centro de Simuladores',
  description:
    'Monitor de los 7 simuladores, control de estado en 1 clic, mantenimiento técnico y odómetro de horas reales.',
};

interface FilaSimulador {
  id: string;
  nombre: string;
  estado: EstadoSimulador;
  horas_uso_totales: number | null;
  actividad_actual_id: string | null;
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

export default async function SimuladoresMantenimientoPage() {
  const supabase = await createClient();

  const [respuestaSimuladores, estadisticas] = await Promise.all([
    supabase
      .from('simuladores')
      .select('*')
      .order('nombre', { ascending: true })
      .returns<FilaSimulador[]>(),
    obtenerEstadisticasGlobalesCentro(),
  ]);

  if (respuestaSimuladores.error) {
    console.error('[simuladores] Error al cargar simuladores:', {
      code: respuestaSimuladores.error.code,
      message: respuestaSimuladores.error.message,
    });
  }

  const simuladores: Simulador[] = (respuestaSimuladores.data ?? []).map(
    mapearSimulador
  );

  const enOperacion = simuladores.filter((s) => s.estado === 'en_operacion').length;
  const enMantenimiento = simuladores.filter((s) => s.estado === 'mantenimiento').length;
  const libres = simuladores.length - enOperacion - enMantenimiento;
  const horasOdometroFlota = simuladores.reduce(
    (acc, sim) => acc + (sim.horas_uso_totales ?? 0),
    0
  );

  return (
    <section className="space-y-6 bg-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
            <Wrench size={20} className="text-blue-600" aria-hidden />
            Simuladores y Mantenimiento
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Control en vivo de las {simuladores.length || 7} cabinas de simulación, alertas técnicas y odómetro acumulado
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
          <Gauge size={16} className="text-blue-600" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Odómetro acumulado de cabinas:
          </span>
          <span className="text-base font-bold text-slate-900 tabular-nums">
            {horasOdometroFlota.toLocaleString('es-AR', {
              maximumFractionDigits: 1,
            })}{' '}
            hs
          </span>
        </div>
      </header>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Cpu size={17} className="text-blue-600" aria-hidden />
              Estado en Vivo de la Flota ({simuladores.length} simuladores)
            </h2>
            <p className="text-sm text-slate-600">
              Cambiá en 1 clic el estado operativo entre Libre, En Uso o En Mantenimiento / Revisión
            </p>
          </div>
          <dl className="flex flex-wrap items-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <dt className="text-slate-600">Libres:</dt>
              <dd className="font-bold text-slate-900 tabular-nums">{libres}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <dt className="text-slate-600">En uso:</dt>
              <dd className="font-bold text-slate-900 tabular-nums">{enOperacion}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-orange-500" />
              <dt className="text-slate-600">Mantenimiento:</dt>
              <dd className="font-bold text-slate-900 tabular-nums">{enMantenimiento}</dd>
            </div>
          </dl>
        </div>

        <RackSimuladores simuladores={simuladores} />
      </div>

      <PanelEstadisticasCentro estadisticas={estadisticas} />
    </section>
  );
}
