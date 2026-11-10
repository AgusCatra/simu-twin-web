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
    <div className="flex h-full min-h-[480px] w-full flex-col items-center justify-center bg-zinc-950 text-emerald-400">
      <div className="relative flex items-center justify-center mb-4">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-emerald-400/20 border-t-emerald-400" />
        <Radio className="absolute h-6 w-6 animate-pulse text-emerald-400" />
      </div>
      <div className="text-sm font-mono tracking-widest uppercase text-zinc-300">
        Cargando Gemelo Digital SCADA...
      </div>
      <div className="text-xs text-zinc-500 mt-1">
        Inicializando maqueta isométrica del galpón y telemetría 3D
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

  // Sincronización ante eventuales revalidaciones desde el Server Component
  useEffect(() => {
    setSimuladores(simuladoresIniciales);
  }, [simuladoresIniciales]);

  // Suscripción en tiempo real a eventos UPDATE de `public.simuladores`
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

  // Simulador actualmente seleccionado para el Drawer (datos reales en vivo)
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
      ? `Operación activa · ${puestosActivosCount} de ${simuladores.length} puestos en sesión`
      : puestosMantenimientoCount > 0
        ? `Flota en espera · ${puestosMantenimientoCount} en mantenimiento`
        : `Flota disponible · ${simuladores.length} de ${simuladores.length} puestos libres`;

  return (
    <div className="relative w-full h-full min-h-[480px] overflow-hidden bg-[#111216]">
      {/* Canvas 3D de Three.js conectado a estado real */}
      <GemeloGalponCanvas
        simuladores={simuladores}
        estacionSeleccionada={estacionSeleccionadaId}
        onSeleccionarEstacion={handleSeleccionarEstacion}
        camaraSeguimiento={false}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          HUD SUPERIOR — ESTADO EN VIVO SCADA
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/85 px-4 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex h-2.5 w-2.5 items-center justify-center">
            <span className={`h-2.5 w-2.5 rounded-full ${indicadorColorClass}`} />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200">
              Centro de Monitoreo · Gemelo Digital
            </div>
            <div className="text-[11px] text-zinc-400">{textoEstadoNave}</div>
          </div>
        </div>
      </div>

      {/* Ayuda interactiva en esquina inferior izquierda */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none hidden md:flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/75 px-3 py-1.5 text-[11px] text-zinc-400 backdrop-blur-sm">
        <HelpCircle className="h-3.5 w-3.5 text-emerald-400" />
        <span>
          Hacé clic sobre cualquier máquina en la maqueta 3D para abrir su Ficha Técnica
        </span>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DRAWER LATERAL FLOTANTE — FICHA TÉCNICA DE MÁQUINA (DATOS REALES)
      ═══════════════════════════════════════════════════════════════════ */}
      {simuladorSeleccionado && (
        <aside
          role="dialog"
          aria-label={`Ficha Técnica ${simuladorSeleccionado.nombre}`}
          className="absolute inset-x-3 top-3 sm:inset-x-auto sm:top-4 sm:right-4 z-30 w-auto sm:w-full sm:max-w-md max-h-[calc(100%-1.5rem)] sm:max-h-[calc(100%-2rem)] overflow-y-auto flex flex-col justify-between rounded-2xl border border-zinc-800/90 bg-zinc-950/95 p-4 sm:p-6 text-zinc-100 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right-4 duration-200 space-y-4"
        >
          {/* Cabecera del Drawer */}
          <div>
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 pb-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="rounded bg-[#0091B3]/10 border border-[#0091B3]/30 px-2 py-0.5 font-mono text-[10px] font-bold text-[#6EC1E4]">
                    {simuladorSeleccionado.codigo}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
                    Puesto {simuladorSeleccionado.numeroPuesto} · Bahía Técnica
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug break-words">
                  {simuladorSeleccionado.nombre}
                </h3>
              </div>

              <button
                onClick={handleCerrarDrawer}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition shrink-0 cursor-pointer"
                title="Cerrar Ficha Técnica"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Badge de Estado Operativo Real */}
            <div className="mt-3.5 space-y-2.5">
              {simuladorSeleccionado.estado === 'en_operacion' ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                    </span>
                    <span className="text-xs font-bold text-amber-400 break-words">
                      EN OPERACIÓN FORMATIVA
                    </span>
                  </div>
                  {simuladorSeleccionado.instructor && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-200/90 border-t border-amber-900/40 pt-1.5 break-words">
                      <User className="h-3 w-3 text-amber-400 shrink-0" />
                      <span className="break-words">
                        {simuladorSeleccionado.instructor}
                      </span>
                    </div>
                  )}
                </div>
              ) : simuladorSeleccionado.estado === 'mantenimiento' ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/25 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    <span className="text-xs font-bold text-rose-400 break-words">
                      EN MANTENIMIENTO TÉCNICO
                    </span>
                  </div>
                  {simuladorSeleccionado.ultimoMantenimiento && (
                    <div className="mt-1.5 text-[11px] text-rose-200/80 border-t border-rose-900/40 pt-1.5">
                      Registro:{' '}
                      {formatearFechaHora(simuladorSeleccionado.ultimoMantenimiento) ??
                        simuladorSeleccionado.ultimoMantenimiento}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-400 break-words">
                    DISPONIBLE EN NAVE
                  </span>
                </div>
              )}

              {/* Lectura de telemetría DB */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#6EC1E4]" />
                  <span>Horas acumuladas</span>
                </span>
                <span className="font-mono font-semibold text-zinc-200">
                  {simuladorSeleccionado.horasUsoTotales.toFixed(1)} hs
                </span>
              </div>
            </div>

            {/* Bloque: Especificaciones de Hardware */}
            <div className="mt-4 space-y-2.5">
              <div className="text-xs uppercase tracking-wider text-zinc-300 font-semibold">
                Equipamiento de Cabina
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <div className="flex items-start gap-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 p-3.5">
                  <Tv className="h-4 w-4 text-[#0091B3] mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-zinc-200 text-xs break-words">
                      Sistema Visual
                    </div>
                    <div className="text-xs text-zinc-400 leading-relaxed break-words mt-0.5">
                      {simuladorSeleccionado.especificacionesHardware.pantallas}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 p-3.5">
                  <Gamepad2 className="h-4 w-4 text-[#0091B3] mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-zinc-200 text-xs break-words">
                      Mandos & Controles
                    </div>
                    <div className="text-xs text-zinc-400 leading-relaxed break-words mt-0.5">
                      {simuladorSeleccionado.especificacionesHardware.mandos}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 p-3.5">
                  <Layers className="h-4 w-4 text-[#0091B3] mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-zinc-200 text-xs break-words">
                      Plataforma Háptica
                    </div>
                    <div className="text-xs text-zinc-400 leading-relaxed break-words mt-0.5">
                      {simuladorSeleccionado.especificacionesHardware.plataforma}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque: Módulos Pedagógicos */}
            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-300 font-semibold mb-2">
                <GraduationCap className="h-3.5 w-3.5 text-[#0091B3]" />
                <span>Competencias que Entrena</span>
              </div>
              <ul className="space-y-2 text-xs text-zinc-300">
                {simuladorSeleccionado.modulosPedagogicos.map((modulo, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 leading-relaxed break-words"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-[#0091B3] shrink-0 mt-0.5" />
                    <span className="break-words">{modulo}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Botón de Cierre al pie del Drawer */}
          <div className="mt-5 border-t border-zinc-800/80 pt-3">
            <button
              onClick={handleCerrarDrawer}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:border-[#0091B3]/50 hover:text-white active:scale-98 cursor-pointer"
            >
              Cerrar Ficha Técnica
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
