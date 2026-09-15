'use client';

import { useTransition } from 'react';
import { Power, Square } from 'lucide-react';
import { conmutarEstadoSimuladorAction } from '@/app/admin/registro-actividades/actions';
import type { Simulador, EstadoSimulador } from '@/types/actividades';

/**
 * Rack virtual de simuladores estilo SCADA.
 *
 * Recibe la foto inicial desde el Server Component y usa `useTransition`
 * para que el clic en INICIAR/DETENER pinte el cambio de estado de forma
 * optimista (sin bloqueo visual) mientras la Server Action persiste y
 * revalida la ruta.
 */

interface RackSimuladoresProps {
  simuladores: Simulador[];
}

/** Clase del LED indicador según el estado operativo. */
function claseLed(estado: EstadoSimulador): string {
  if (estado === 'en_operacion') {
    return 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)] animate-pulse';
  }
  if (estado === 'mantenimiento') return 'bg-amber-500';
  return 'bg-zinc-700';
}

/** Texto mono del estado en el encabezado de la tarjeta. */
function etiquetaEstado(estado: EstadoSimulador): string {
  if (estado === 'en_operacion') return 'EN OPERACIÓN';
  if (estado === 'mantenimiento') return 'MANTENIMIENTO';
  return 'LIBRE';
}

const TARJETA_BASE =
  'flex flex-col gap-3 rounded-sm border border-zinc-800 bg-zinc-950 p-3 transition-colors';
const TARJETA_OPERATIVA = 'border-emerald-900/70';
const TARJETA_MANTENIMIENTO = 'border-amber-900/70';

export default function RackSimuladores({ simuladores }: RackSimuladoresProps) {
  const [, startTransition] = useTransition();

  function conmutar(simulador: Simulador, destino: 'libre' | 'en_operacion') {
    startTransition(async () => {
      const resultado = await conmutarEstadoSimuladorAction(simulador.id, destino);
      if (!resultado.ok) {
        // La acción ya revalida en el caso exitoso; si falla mostramos el
        // error por consola (el Server Component refrescará con la BD real).
        console.error('[RackSimuladores] Conmutación rechazada:', resultado.error);
      }
    });
  }

  if (simuladores.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950 px-4 py-8 text-center">
        <p className="font-mono text-[11px] tracking-[0.16em] text-zinc-500">
          NO HAY SIMULADORES REGISTRADOS EN LA FLOTA.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {simuladores.map((simulador) => {
        const enOperacion = simulador.estado === 'en_operacion';
        const enMantenimiento = simulador.estado === 'mantenimiento';
        const clasesTarjeta = [
          TARJETA_BASE,
          enOperacion ? TARJETA_OPERATIVA : '',
          enMantenimiento ? TARJETA_MANTENIMIENTO : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <article key={simulador.id} className={clasesTarjeta}>
            <header className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2">
              <div className="min-w-0">
                <h3 className="truncate font-mono text-[13px] font-semibold uppercase tracking-[0.1em] text-zinc-100">
                  {simulador.nombre}
                </h3>
                <p className="mt-0.5 truncate font-mono text-[10px] tracking-[0.14em] text-zinc-500">
                  ID · {simulador.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <span
                aria-hidden
                title={etiquetaEstado(simulador.estado)}
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${claseLed(simulador.estado)}`}
              />
            </header>

            <dl className="space-y-1 font-mono text-xs text-zinc-400">
              <div className="flex items-center justify-between gap-2">
                <dt className="tracking-[0.08em] text-zinc-500">ESTADO</dt>
                <dd
                  className={
                    enOperacion
                      ? 'text-emerald-400'
                      : enMantenimiento
                        ? 'text-amber-400'
                        : 'text-zinc-300'
                  }
                >
                  {etiquetaEstado(simulador.estado)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="tracking-[0.08em] text-zinc-500">HORAS USO</dt>
                <dd className="text-zinc-200">
                  {(simulador.horas_uso_totales ?? 0).toFixed(1)} h
                </dd>
              </div>
            </dl>

            {enMantenimiento ? (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-sm border border-amber-900/60 bg-amber-950/40 px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-amber-200"
              >
                [ FUERA DE SERVICIO ]
              </button>
            ) : enOperacion ? (
              <button
                type="button"
                onClick={() => conmutar(simulador, 'libre')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-red-900 bg-red-950 px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-red-100 transition-colors hover:border-red-700 hover:bg-red-900 hover:text-white focus-visible:outline-1 focus-visible:outline-red-400"
              >
                <Square size={12} strokeWidth={2.25} aria-hidden />
                [ DETENER ]
              </button>
            ) : (
              <button
                type="button"
                onClick={() => conmutar(simulador, 'en_operacion')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-zinc-200 transition-colors hover:border-emerald-700 hover:bg-emerald-950 hover:text-emerald-100 focus-visible:outline-1 focus-visible:outline-emerald-400"
              >
                <Power size={12} strokeWidth={2.25} aria-hidden />
                [ INICIAR SESIÓN ]
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
