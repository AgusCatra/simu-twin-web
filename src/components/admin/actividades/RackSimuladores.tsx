'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { conmutarEstadoSimuladorAction } from '@/app/admin/registro-actividades/actions';
import type {
  Simulador,
  EstadoSimulador,
  EstadoSimuladorConmutable,
} from '@/types/actividades';

interface RackSimuladoresProps {
  simuladores: Simulador[];
}

function claseLed(estado: EstadoSimulador): string {
  if (estado === 'en_operacion') return 'bg-blue-500 animate-pulse';
  if (estado === 'mantenimiento') return 'bg-orange-500';
  return 'bg-emerald-500';
}

function etiquetaEstado(estado: EstadoSimulador): string {
  if (estado === 'en_operacion') return 'En Uso / Capacitación';
  if (estado === 'mantenimiento') return 'En Mantenimiento';
  return 'Libre';
}

export default function RackSimuladores({ simuladores }: RackSimuladoresProps) {
  const router = useRouter();
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function conmutar(simulador: Simulador, destino: EstadoSimuladorConmutable) {
    if (simulador.estado === destino) return;
    setPendienteId(simulador.id);
    startTransition(async () => {
      try {
        const resultado = await conmutarEstadoSimuladorAction(simulador.id, destino);
        if (!resultado.ok) {
          console.error('[RackSimuladores] Conmutación rechazada:', resultado.error);
        } else {
          router.refresh();
        }
      } finally {
        setPendienteId(null);
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
        const ocupado = pendienteId === simulador.id;
        const borde = enOperacion
          ? 'border-blue-300 bg-blue-50/30'
          : enMantenimiento
            ? 'border-orange-300 bg-orange-50/50'
            : 'border-slate-200 bg-white';

        const opciones: Array<{
          valor: EstadoSimuladorConmutable;
          label: string;
          activo: string;
        }> = [
          {
            valor: 'libre',
            label: 'Libre',
            activo: 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold',
          },
          {
            valor: 'en_operacion',
            label: 'En Uso',
            activo: 'border-blue-300 bg-blue-50 text-blue-800 font-bold',
          },
          {
            valor: 'mantenimiento',
            label: 'Mantenimiento',
            activo: 'border-orange-300 bg-orange-100 text-orange-900 font-bold',
          },
        ];

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
                  Puesto {simulador.id}
                </p>
              </div>
              <span
                aria-hidden
                title={etiquetaEstado(simulador.estado)}
                className={`mt-1 h-3 w-3 shrink-0 rounded-full ${claseLed(simulador.estado)}`}
              />
            </header>

            {enMantenimiento && (
              <div className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800">
                <AlertTriangle size={13} className="shrink-0 text-orange-600" aria-hidden />
                <span>Equipo en revisión / fuera de servicio</span>
              </div>
            )}

            <dl className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="font-medium text-slate-500">Estado</dt>
                <dd
                  className={`font-semibold ${
                    enOperacion
                      ? 'text-blue-700'
                      : enMantenimiento
                        ? 'text-orange-800'
                        : 'text-emerald-700'
                  }`}
                >
                  {etiquetaEstado(simulador.estado)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="font-medium text-slate-500">Odómetro acumulado</dt>
                <dd className="font-bold text-slate-900 tabular-nums">
                  {(simulador.horas_uso_totales ?? 0).toFixed(1)} h
                </dd>
              </div>
            </dl>

            <div
              role="group"
              aria-label={`Cambiar estado de ${simulador.nombre}`}
              className="grid grid-cols-3 gap-1.5 pt-1"
            >
              {opciones.map((op) => {
                const activo = simulador.estado === op.valor;
                return (
                  <button
                    key={op.valor}
                    type="button"
                    disabled={ocupado}
                    aria-pressed={activo}
                    onClick={() => conmutar(simulador, op.valor)}
                    className={`rounded-lg border px-1.5 py-2 text-[11px] leading-tight transition-colors disabled:opacity-50 ${
                      activo
                        ? op.activo
                        : 'border-slate-200 bg-white font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {op.label}
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
