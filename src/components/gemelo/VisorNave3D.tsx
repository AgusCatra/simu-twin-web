'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  esEstadoSimulador,
  esSimuladorSlug,
  parseHorasUso,
  type FichaTecnicaSimulador,
  type SimuladorRowDB,
  type SimuladorSlug,
} from '@/types/gemelo';
import {
  X,
  Tv,
  Gamepad2,
  Layers,
  GraduationCap,
  Radio,
  CheckCircle,
  User,
  HelpCircle,
  Clock,
  Wrench,
} from 'lucide-react';

const GemeloGalponCanvas = dynamic(() => import('./GemeloGalponCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[480px] w-full flex-col items-center justify-center bg-slate-900 text-emerald-400">
      <div className="relative mb-4 flex items-center justify-center">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-emerald-400/20 border-t-emerald-400" />
        <Radio className="absolute h-5 w-5 animate-pulse text-emerald-400" />
      </div>
      <div className="text-sm font-semibold text-white">
        Cargando vista 3D del galpón…
      </div>
      <div className="mt-1 text-xs text-slate-400">
        Inicializando los 7 puestos de simulación
      </div>
    </div>
  ),
});

interface VisorNave3DProps {
  simuladoresIniciales: FichaTecnicaSimulador[];
}

function formatearFechaHora(iso: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function VisorNave3D({ simuladoresIniciales }: VisorNave3DProps) {
  const [simuladores, setSimuladores] =
    useState<FichaTecnicaSimulador[]>(simuladoresIniciales);
  const [estacionSeleccionadaId, setEstacionSeleccionadaId] =
    useState<SimuladorSlug | null>(null);

  useEffect(() => {
    setSimuladores(simuladoresIniciales);
  }, [simuladoresIniciales]);

  useEffect(() => {
    const supabase = createClient();

    const canal = supabase
      .channel('simuladores-realtime-visor')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'simuladores',
        },
        (payload: RealtimePostgresUpdatePayload<SimuladorRowDB>) => {
          const nuevo = payload.new as Partial<SimuladorRowDB> | null;
          if (!nuevo || typeof nuevo.id !== 'string' || !esSimuladorSlug(nuevo.id)) {
            return;
          }

          const idActualizado: SimuladorSlug = nuevo.id;
          setSimuladores((prev) =>
            prev.map((sim) => {
              if (sim.id !== idActualizado) return sim;

              return {
                ...sim,
                nombre:
                  typeof nuevo.nombre === 'string' && nuevo.nombre.trim().length > 0
                    ? nuevo.nombre
                    : sim.nombre,
                estado: esEstadoSimulador(nuevo.estado)
                  ? nuevo.estado
                  : sim.estado,
                horasUsoTotales:
                  parseHorasUso(nuevo.horas_uso_totales) ?? sim.horasUsoTotales,
                ultimoMantenimiento:
                  nuevo.ultimo_mantenimiento !== undefined
                    ? nuevo.ultimo_mantenimiento
                    : sim.ultimoMantenimiento,
                actualizadoEl:
                  nuevo.actualizado_el !== undefined
                    ? nuevo.actualizado_el
                    : sim.actualizadoEl,
                actividadActualId:
                  nuevo.actividad_actual_id !== undefined
                    ? nuevo.actividad_actual_id
                    : sim.actividadActualId,
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, []);

  const simuladorSeleccionado = useMemo(() => {
    if (!estacionSeleccionadaId) return null;
    return simuladores.find((s) => s.id === estacionSeleccionadaId) ?? null;
  }, [estacionSeleccionadaId, simuladores]);

  const { puestosActivosCount, puestosMantenimientoCount } = useMemo(() => {
    let activos = 0;
    let mantenimiento = 0;
    for (const s of simuladores) {
      if (s.estado === 'en_operacion') activos += 1;
      else if (s.estado === 'mantenimiento') mantenimiento += 1;
    }
    return {
      puestosActivosCount: activos,
      puestosMantenimientoCount: mantenimiento,
    };
  }, [simuladores]);

  const handleSeleccionarEstacion = useCallback((id: SimuladorSlug | null) => {
    setEstacionSeleccionadaId(id);
  }, []);

  const handleCerrarDrawer = useCallback(() => {
    setEstacionSeleccionadaId(null);
  }, []);

  const indicadorColorClass =
    puestosActivosCount > 0
      ? 'bg-amber-500 animate-pulse'
      : puestosMantenimientoCount > 0
        ? 'bg-rose-500'
        : 'bg-emerald-500';

  const textoEstadoNave =
    puestosActivosCount > 0
      ? `En uso: ${puestosActivosCount} de ${simuladores.length} simuladores`
      : puestosMantenimientoCount > 0
        ? `Flota en espera · ${puestosMantenimientoCount} en mantenimiento`
        : `Todos disponibles · ${simuladores.length} simuladores libres`;

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden rounded-lg bg-[#111216]">
      {/* Canvas 3D de Three.js conserva su iluminación real */}
      <GemeloGalponCanvas
        simuladores={simuladores}
        estacionSeleccionada={estacionSeleccionadaId}
        onSeleccionarEstacion={handleSeleccionarEstacion}
        camaraSeguimiento={false}
      />

      {/* Controles claros en overlay */}
      <div className="pointer-events-auto absolute top-4 left-4 z-20">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-md backdrop-blur-sm">
          <div className="flex h-2.5 w-2.5 items-center justify-center">
            <span className={`h-2.5 w-2.5 rounded-full ${indicadorColorClass}`} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">
              Galpón 3D en Vivo
            </div>
            <div className="text-xs text-slate-600">{textoEstadoNave}</div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm md:flex">
        <HelpCircle className="h-4 w-4 text-blue-600" />
        <span>
          Hacé clic en cualquier máquina para ver su ficha técnica
        </span>
      </div>

      {simuladorSeleccionado && (
        <aside
          role="dialog"
          aria-label={`Ficha Técnica ${simuladorSeleccionado.nombre}`}
          className="animate-in slide-in-from-right-4 duration-200 absolute inset-x-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-auto flex-col justify-between space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl sm:inset-x-auto sm:top-4 sm:right-4 sm:max-h-[calc(100%-2rem)] sm:w-full sm:max-w-md"
        >
          <div>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3.5">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                    {simuladorSeleccionado.codigo}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    Puesto {simuladorSeleccionado.numeroPuesto}
                  </span>
                </div>
                <h3 className="break-words text-base font-bold leading-snug text-slate-900 sm:text-lg">
                  {simuladorSeleccionado.nombre}
                </h3>
              </div>

              <button
                onClick={handleCerrarDrawer}
                className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                title="Cerrar ficha"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3.5 space-y-2.5">
              {simuladorSeleccionado.estado === 'en_operacion' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                    </span>
                    <span className="text-xs font-bold text-amber-800">
                      EN USO ACTUALMENTE
                    </span>
                  </div>
                  {simuladorSeleccionado.instructor && (
                    <div className="mt-2 flex items-center gap-1.5 border-t border-amber-200 pt-1.5 text-xs text-amber-900">
                      <User className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                      <span>{simuladorSeleccionado.instructor}</span>
                    </div>
                  )}
                </div>
              ) : simuladorSeleccionado.estado === 'mantenimiento' ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Wrench className="h-4 w-4 text-rose-700 shrink-0" />
                    <span className="text-xs font-bold text-rose-800">
                      EN MANTENIMIENTO
                    </span>
                  </div>
                  {simuladorSeleccionado.ultimoMantenimiento && (
                    <div className="mt-1.5 border-t border-rose-200 pt-1.5 text-xs text-rose-700">
                      Registro:{' '}
                      {formatearFechaHora(simuladorSeleccionado.ultimoMantenimiento) ??
                        simuladorSeleccionado.ultimoMantenimiento}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-emerald-700">
                    LIBRE Y DISPONIBLE
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span>Horas de uso acumuladas</span>
                </span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {simuladorSeleccionado.horasUsoTotales.toFixed(1)} hs
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Equipamiento de Cabina
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <Tv className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900">
                      Sistema Visual
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {simuladorSeleccionado.especificacionesHardware.pantallas}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <Gamepad2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900">
                      Mandos y Controles
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {simuladorSeleccionado.especificacionesHardware.mandos}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <Layers className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900">
                      Plataforma
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {simuladorSeleccionado.especificacionesHardware.plataforma}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                <GraduationCap className="h-4 w-4 text-blue-600" />
                <span>Competencias que Entrena</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {simuladorSeleccionado.modulosPedagogicos.map((modulo, i) => (
                  <li key={i} className="flex items-start gap-2 leading-relaxed">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{modulo}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <button
              onClick={handleCerrarDrawer}
              className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Cerrar ficha
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
