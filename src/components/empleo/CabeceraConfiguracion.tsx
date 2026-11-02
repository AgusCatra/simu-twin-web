'use client';

import { useMemo, useState, useTransition } from 'react';
import { CalendarDays, Users } from 'lucide-react';
import { actualizarConfiguracionCohorte } from '@/services/empleo';
import { proyectarCohorteDinamica } from '@/lib/calculo-cohorte';

/**
 * Cabecera de configuración dinámica de la cohorte: cupo táctil (chips
 * 10/20/22/30 + input manual), fecha de teoría y badge de proyección en vivo
 * calculada con el motor puro compartido con el backend. "APLICAR" persiste
 * vía Server Action (la misma proyección se recalcula y guarda en `cohortes`).
 */

interface Props {
  cohorteId: string;
  fechaTeoriaInicial: string;
  cupoInicial: number;
  totalConfirmados: number;
  fechaInicioSim: string | null;
  fechaFinSim: string | null;
  fechaPasePlanta: string | null;
}

const OPCIONES_CUPO: readonly number[] = [10, 20, 22, 30];

/** YYYY-MM-DD -> DD/MM (sin Date: evita corrimientos por timezone). */
function formatoCorto(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio.slice(2)}`;
}

export default function CabeceraConfiguracion({
  cohorteId,
  fechaTeoriaInicial,
  cupoInicial,
  totalConfirmados,
  fechaInicioSim,
  fechaFinSim,
  fechaPasePlanta,
}: Props) {
  const [cupo, setCupo] = useState(cupoInicial > 0 ? cupoInicial : 22);
  const [fechaTeoria, setFechaTeoria] = useState(fechaTeoriaInicial ?? '');
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  const proyeccion = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTeoria)) return null;
    try {
      return proyectarCohorteDinamica({ fechaTeoria, cupoTitulares: cupo });
    } catch {
      return null;
    }
  }, [fechaTeoria, cupo]);

  function aplicar() {
    setMensaje(null);
    startTransition(async () => {
      const res = await actualizarConfiguracionCohorte(cohorteId, {
        fecha_teoria: fechaTeoria,
        max_titulares: cupo,
      });
      setMensaje(
        res.ok
          ? { texto: 'CONFIGURACIÓN GUARDADA · CALENDARIO PROYECTADO', tipo: 'ok' }
          : { texto: res.error.toUpperCase(), tipo: 'error' }
      );
    });
  }

  return (
    <section
      aria-label="Configuración de la cohorte"
      className="rounded-sm border border-zinc-800 bg-zinc-950 p-4"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-4">
          {/* ── Cupo de titulares ─────────────────────────────── */}
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-zinc-500">
              <Users size={13} strokeWidth={1.75} aria-hidden />
              CUPO DE TITULARES
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {OPCIONES_CUPO.map((opcion) => {
                const activo = cupo === opcion;
                return (
                  <button
                    key={opcion}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setCupo(opcion)}
                    className={`h-11 min-w-14 rounded-sm border px-3 font-mono text-sm transition-colors focus-visible:outline-1 focus-visible:outline-white ${
                      activo
                        ? 'border-white bg-white font-semibold text-zinc-950'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white'
                    }`}
                  >
                    {opcion}
                  </button>
                );
              })}
              <label className="flex h-11 items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-3">
                <span className="font-mono text-[10px] tracking-[0.12em] text-zinc-500">
                  MANUAL
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  value={cupo}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setCupo(Math.trunc(v));
                  }}
                  aria-label="Cupo manual de titulares"
                  className="h-full w-16 bg-transparent font-mono text-sm text-white outline-none"
                />
              </label>
            </div>
          </div>

          {/* ── Fecha de teoría ───────────────────────────────── */}
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-zinc-500">
              <CalendarDays size={13} strokeWidth={1.75} aria-hidden />
              FECHA DE TEORÍA
            </p>
            <input
              type="date"
              value={fechaTeoria}
              onChange={(e) => setFechaTeoria(e.target.value)}
              aria-label="Fecha de teoría"
              className="mt-2 h-11 rounded-sm border border-zinc-700 bg-zinc-900 px-3 font-mono text-sm text-white [color-scheme:dark] focus-visible:outline-1 focus-visible:outline-white"
            />
          </div>
        </div>

        {/* ── Badge resumen de proyección ─────────────────────── */}
        <div className="space-y-3 lg:text-right">
          <div
            aria-live="polite"
            className="rounded-sm border border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-[11px] leading-relaxed tracking-[0.08em] text-zinc-300"
          >
            {proyeccion ? (
              <>
                <p className="text-white">
                  {proyeccion.cantJornadas} JORNADAS DE SIMULADOR
                </p>
                <p>
                  INICIO SIM: {formatoCorto(proyeccion.fechaInicioSim)} · FIN:{' '}
                  {formatoCorto(proyeccion.fechaFinSim)}
                </p>
                <p>
                  PASE A PLANTA: {formatoCorto(proyeccion.fechaPasePlanta)}
                </p>
              </>
            ) : (
              <>
                <p className="text-white">CALENDARIO PERSISTIDO</p>
                <p>
                  INICIO SIM: {formatoCorto(fechaInicioSim)} · FIN:{' '}
                  {formatoCorto(fechaFinSim)}
                </p>
                <p>PASE A PLANTA: {formatoCorto(fechaPasePlanta)}</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 lg:justify-end">
            <p className="font-mono text-[10px] tracking-[0.12em] text-zinc-500">
              CONFIRMADOS HOY:{' '}
              <span
                className={
                  totalConfirmados > cupo ? 'font-semibold text-red-400' : 'text-white'
                }
              >
                {totalConfirmados}/{cupo}
              </span>
            </p>
            <button
              type="button"
              onClick={aplicar}
              disabled={isPending || !proyeccion}
              className="h-11 rounded-sm border border-white bg-white px-5 font-mono text-xs font-semibold tracking-[0.14em] text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:outline-1 focus-visible:outline-white"
            >
              {isPending ? 'GUARDANDO…' : 'APLICAR CONFIGURACIÓN'}
            </button>
          </div>

          {mensaje && (
            <p
              role={mensaje.tipo === 'error' ? 'alert' : 'status'}
              className={`font-mono text-[10px] tracking-[0.12em] ${
                mensaje.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {mensaje.texto}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
