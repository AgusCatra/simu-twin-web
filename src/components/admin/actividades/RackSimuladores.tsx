'use client';

import { useTransition } from 'react';
import { Power, Square } from 'lucide-react';
import { conmutarEstadoSimuladorAction } from '@/app/admin/registro-actividades/actions';
import type { Simulador, EstadoSimulador } from '@/types/actividades';

interface RackSimuladoresProps {
  simuladores: Simulador[];
}

function claseLed(estado: EstadoSimulador): string {
  if (estado === 'en_operacion') return 'bg-amber-500 animate-pulse';
  if (estado === 'mantenimiento') return 'bg-rose-500';
  return 'bg-emerald-500';
}

function etiquetaEstado(estado: EstadoSimulador): string {
  if (estado === 'en_operacion') return 'En uso';
  if (estado === 'mantenimiento') return 'Mantenimiento';
  return 'Disponible';
}

export default function RackSimuladores({ simuladores }: RackSimuladoresProps) {
  const [, startTransition] = useTransition();

  function conmutar(simulador: Simulador, destino: 'libre' | 'en_operacion') {
    startTransition(async () => {
      const resultado = await conmutarEstadoSimuladorAction(simulador.id, destino);
      if (!resultado.ok) {
        console.error('[RackSimuladores] Conmutación rechazada:', resultado.error);
      }
    });
  }

  if (simuladores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-600">
          No hay simuladores registrados todavía.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {simuladores.map((simulador) => {
        const enOperacion = simulador.estado === 'en_operacion';
        const enMantenimiento = simulador.estado === 'mantenimiento';
        const borde = enOperacion
          ? 'border-amber-300 bg-amber-50/30'
          : enMantenimiento
            ? 'border-rose-200 bg-rose-50/30'
            : 'border-slate-200 bg-white';

        return (
          <article
            key={simulador.id}
            className={`flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-colors ${borde}`}
          >
            <header className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-slate-900">
                  {simulador.nombre}
                </h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  Puesto {simulador.id.slice(0, 8)}
                </p>
              </div>
              <span
                aria-hidden
                title={etiquetaEstado(simulador.estado)}
                className={`mt-1 h-3 w-3 shrink-0 rounded-full ${claseLed(simulador.estado)}`}
              />
            </header>

            <dl className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="font-medium text-slate-500">Estado</dt>
                <dd
                  className={`font-semibold ${
                    enOperacion
                      ? 'text-amber-800'
                      : enMantenimiento
                        ? 'text-rose-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {etiquetaEstado(simulador.estado)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="font-medium text-slate-500">Horas acumuladas</dt>
                <dd className="font-bold text-slate-900 tabular-nums">
                  {(simulador.horas_uso_totales ?? 0).toFixed(1)} h
                </dd>
              </div>
            </dl>

            {enMantenimiento ? (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
              >
                Fuera de servicio
              </button>
            ) : enOperacion ? (
              <button
                type="button"
                onClick={() => conmutar(simulador, 'libre')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
              >
                <Square size={13} strokeWidth={2.25} aria-hidden />
                Finalizar uso
              </button>
            ) : (
              <button
                type="button"
                onClick={() => conmutar(simulador, 'en_operacion')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <Power size={13} strokeWidth={2.25} aria-hidden />
                Iniciar uso
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
