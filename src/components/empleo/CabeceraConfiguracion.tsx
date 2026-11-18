'use client';

import { useMemo, useState, useTransition } from 'react';
import { CalendarDays, Clock, Plus, SlidersHorizontal, Users } from 'lucide-react';
import { actualizarConfiguracionCohorte } from '@/services/empleo';
import {
  CONFIGURACION_CURSADO_DEFECTO,
  formatearDiasGrupoCorto,
  FRANJAS_ESTANDAR_LABELS,
  normalizarConfiguracionCursado,
  obtenerProximoLunesPosterior,
  proyectarCalendarioCohorteV2,
} from '@/lib/calendario-duplas';
import type { ConfiguracionCursadoCohorte } from '@/types/empleo';

/**
 * Cabecera de configuración dinámica de la cohorte bajo el modelo de duplas:
 * cupo, fecha de teoría, días hábiles por Grupo A/B (con opción Grupo único),
 * franjas horarias configurables y cantidad de sesiones objetivo.
 */

interface Props {
  cohorteId: string;
  fechaTeoriaInicial: string;
  cupoInicial: number;
  totalConfirmados: number;
  fechaInicioSim: string | null;
  fechaFinSim: string | null;
  fechaPasePlanta: string | null;
  feriadosMunicipales: string[];
  configuracionInicial?: ConfiguracionCursadoCohorte;
}

const OPCIONES_CUPO: readonly number[] = [8, 12, 16, 20, 22];
const OPCIONES_SESIONES: readonly number[] = [4, 6, 8, 12];
const DIAS_HABILES: readonly { num: number; corto: string }[] = [
  { num: 1, corto: 'LUN' },
  { num: 2, corto: 'MAR' },
  { num: 3, corto: 'MIÉ' },
  { num: 4, corto: 'JUE' },
  { num: 5, corto: 'VIE' },
];

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
  feriadosMunicipales,
  configuracionInicial,
}: Props) {
  const cfgBase = useMemo(
    () => normalizarConfiguracionCursado(configuracionInicial ?? CONFIGURACION_CURSADO_DEFECTO),
    [configuracionInicial]
  );

  const [cupo, setCupo] = useState(cupoInicial > 0 ? cupoInicial : 16);
  const [fechaTeoria, setFechaTeoria] = useState(fechaTeoriaInicial ?? '');
  const [diasGrupoA, setDiasGrupoA] = useState<number[]>(cfgBase.dias_grupo_a);
  const [diasGrupoB, setDiasGrupoB] = useState<number[]>(cfgBase.dias_grupo_b);
  const [franjasActivas, setFranjasActivas] = useState<string[]>(cfgBase.franjas_activas);
  const [sesionesObjetivo, setSesionesObjetivo] = useState<number>(cfgBase.sesiones_objetivo);
  const [nuevaFranja, setNuevaFranja] = useState('');
  const [abiertoAvanzado, setAbiertoAvanzado] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  const configActual: ConfiguracionCursadoCohorte = useMemo(
    () => ({
      modalidad: 'DUPLAS',
      dias_grupo_a: diasGrupoA.length > 0 ? diasGrupoA : [1, 3],
      dias_grupo_b: diasGrupoB,
      franjas_activas:
        franjasActivas.length > 0 ? franjasActivas : [...FRANJAS_ESTANDAR_LABELS],
      sesiones_objetivo: Math.min(24, Math.max(2, sesionesObjetivo || 6)),
    }),
    [diasGrupoA, diasGrupoB, franjasActivas, sesionesObjetivo]
  );

  const gruposActivosCount = diasGrupoB.length > 0 ? 2 : 1;
  const plazasDuplasSim = configActual.franjas_activas.length * gruposActivosCount * 2;

  const proyeccion = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTeoria)) return null;
    try {
      const fechaInicioSimulador = obtenerProximoLunesPosterior(fechaTeoria);
      return proyectarCalendarioCohorteV2({
        fechaInicioTeoria: fechaTeoria,
        fechaInicioSimulador,
        diasBloqueados: feriadosMunicipales,
        estrategiaFeriados: 'MOVER_A_VIERNES',
        configuracionCursado: configActual,
      });
    } catch {
      return null;
    }
  }, [fechaTeoria, feriadosMunicipales, configActual]);

  const recuperatoriosCount = useMemo(
    () =>
      proyeccion
        ? proyeccion.viernesEstado.filter(
            (v) => v.estado === 'RECUPERATORIO_FERIADO'
          ).length
        : 0,
    [proyeccion]
  );

  function toggleDiaGrupo(grupo: 'A' | 'B', diaNum: number) {
    if (grupo === 'A') {
      setDiasGrupoA((prev) => {
        if (prev.includes(diaNum)) {
          return prev.length > 1 ? prev.filter((d) => d !== diaNum) : prev;
        }
        return [...prev, diaNum].sort((a, b) => a - b);
      });
    } else {
      setDiasGrupoB((prev) =>
        prev.includes(diaNum)
          ? prev.filter((d) => d !== diaNum)
          : [...prev, diaNum].sort((a, b) => a - b)
      );
    }
  }

  function toggleFranja(label: string) {
    setFranjasActivas((prev) => {
      if (prev.includes(label)) {
        return prev.length > 1 ? prev.filter((f) => f !== label) : prev;
      }
      if (prev.length >= 4) return prev;
      return [...prev, label];
    });
  }

  function agregarFranjaPersonalizada() {
    const limpia = nuevaFranja.trim().slice(0, 20);
    if (!limpia || franjasActivas.length >= 4) return;
    if (!franjasActivas.includes(limpia)) {
      setFranjasActivas((prev) => [...prev, limpia]);
    }
    setNuevaFranja('');
  }

  function aplicar() {
    setMensaje(null);
    startTransition(async () => {
      const res = await actualizarConfiguracionCohorte(cohorteId, {
        fecha_teoria: fechaTeoria,
        max_titulares: cupo,
        configuracion_cursado: configActual,
      });
      setMensaje(
        res.ok
          ? { texto: 'CONFIGURACIÓN GUARDADA · CALENDARIO PROYECTADO', tipo: 'ok' }
          : { texto: res.error.toUpperCase(), tipo: 'error' }
      );
    });
  }

  const franjasCatalogo = useMemo(() => {
    const set = new Set<string>([...FRANJAS_ESTANDAR_LABELS, ...franjasActivas]);
    return Array.from(set);
  }, [franjasActivas]);

  return (
    <section
      aria-label="Configuración de la cohorte"
      className="rounded-sm border border-zinc-800 bg-zinc-950 p-4 space-y-4"
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
                    className={`h-11 min-w-12 rounded-sm border px-3 font-mono text-sm transition-colors focus-visible:outline-1 focus-visible:outline-white ${
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

          {/* ── Fecha de teoría + botón esquema dinámico ────────── */}
          <div className="flex flex-wrap items-end gap-4">
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

            <button
              type="button"
              onClick={() => setAbiertoAvanzado((prev) => !prev)}
              aria-expanded={abiertoAvanzado}
              className="inline-flex h-11 items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-3.5 font-mono text-[11px] tracking-[0.12em] text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
            >
              <SlidersHorizontal size={14} aria-hidden />
              {abiertoAvanzado
                ? 'OCULTAR DÍAS Y FRANJAS'
                : 'DÍAS, FRANJAS Y SESIONES'}
            </button>
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
                  MOTOR DUPLAS · {plazasDuplasSim} PLAZAS ({configActual.sesiones_objetivo} SESIONES C/U)
                </p>
                <p className="text-[10px] text-zinc-400">
                  A: {formatearDiasGrupoCorto(configActual.dias_grupo_a)} ·{' '}
                  {configActual.dias_grupo_b.length > 0
                    ? `B: ${formatearDiasGrupoCorto(configActual.dias_grupo_b)}`
                    : 'SIN GRUPO B'}{' '}
                  · {configActual.franjas_activas.length} FRANJAS
                </p>
                <p>
                  INICIO SIM: {formatoCorto(proyeccion.fechaInicioSimulador)} · FIN:{' '}
                  {formatoCorto(proyeccion.fechaFinSimulador)}
                </p>
                <p>
                  PASE A TERRENO: {formatoCorto(proyeccion.fechaPaseTerreno)}
                </p>
                <p
                  className={
                    recuperatoriosCount > 0 ? 'text-amber-300' : 'text-emerald-400'
                  }
                >
                  {recuperatoriosCount > 0
                    ? `${recuperatoriosCount} VIERNES RECUPERATORIO (FERIADO ABSORBIDO)`
                    : `${proyeccion.viernesEstado.length} VIERNES BUFFER LIBRES`}
                </p>
              </>
            ) : (
              <>
                <p className="text-white">CALENDARIO PERSISTIDO</p>
                <p>
                  INICIO SIM: {formatoCorto(fechaInicioSim)} · FIN:{' '}
                  {formatoCorto(fechaFinSim)}
                </p>
                <p>PASE A TERRENO: {formatoCorto(fechaPasePlanta)}</p>
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

      {/* ── Configurador dinámico de días, franjas y sesiones ──────── */}
      {abiertoAvanzado && (
        <div className="grid gap-4 border-t border-zinc-800 pt-4 md:grid-cols-3">
          {/* Días Grupo A y Grupo B */}
          <div className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-900/50 p-3">
            <div>
              <p className="font-mono text-[10px] tracking-[0.16em] text-sky-300">
                DÍAS GRUPO A (OBLIGATORIO)
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DIAS_HABILES.map((d) => {
                  const activo = diasGrupoA.includes(d.num);
                  return (
                    <button
                      key={`ga-${d.num}`}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => toggleDiaGrupo('A', d.num)}
                      className={`h-9 rounded-sm border px-2.5 font-mono text-[11px] transition-colors ${
                        activo
                          ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                          : 'border-zinc-700 bg-zinc-950 text-zinc-500 hover:text-zinc-200'
                      }`}
                    >
                      {d.corto}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] tracking-[0.16em] text-emerald-300">
                  DÍAS GRUPO B (OPCIONAL)
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDiasGrupoB((prev) => (prev.length === 0 ? [2, 4] : []))
                  }
                  className="font-mono text-[10px] text-zinc-400 underline hover:text-white"
                >
                  {diasGrupoB.length === 0 ? 'Activar Grupo B' : 'Solo 1 grupo'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DIAS_HABILES.map((d) => {
                  const activo = diasGrupoB.includes(d.num);
                  return (
                    <button
                      key={`gb-${d.num}`}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => toggleDiaGrupo('B', d.num)}
                      className={`h-9 rounded-sm border px-2.5 font-mono text-[11px] transition-colors ${
                        activo
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                          : 'border-zinc-700 bg-zinc-950 text-zinc-500 hover:text-zinc-200'
                      }`}
                    >
                      {d.corto}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Franjas activas */}
          <div className="space-y-2 rounded-sm border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-zinc-400">
              <Clock size={12} aria-hidden />
              FRANJAS ACTIVAS (1–4)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {franjasCatalogo.map((label) => {
                const activo = franjasActivas.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => toggleFranja(label)}
                    className={`h-9 rounded-sm border px-2.5 font-mono text-[11px] transition-colors ${
                      activo
                        ? 'border-white bg-white font-semibold text-zinc-950'
                        : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={nuevaFranja}
                onChange={(e) => setNuevaFranja(e.target.value)}
                placeholder="Ej: 18:00-19:00"
                maxLength={20}
                className="h-9 min-w-0 flex-1 rounded-sm border border-zinc-700 bg-zinc-950 px-2.5 font-mono text-[11px] text-white outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={agregarFranjaPersonalizada}
                disabled={franjasActivas.length >= 4 || !nuevaFranja.trim()}
                className="inline-flex h-9 items-center gap-1 rounded-sm border border-zinc-700 bg-zinc-800 px-2.5 font-mono text-[10px] text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
              >
                <Plus size={12} aria-hidden />
                AGREGAR
              </button>
            </div>
          </div>

          {/* Sesiones objetivo */}
          <div className="space-y-2 rounded-sm border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="font-mono text-[10px] tracking-[0.16em] text-zinc-400">
              SESIONES OBJETIVO POR ALUMNO
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {OPCIONES_SESIONES.map((n) => {
                const activo = sesionesObjetivo === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setSesionesObjetivo(n)}
                    className={`h-9 min-w-10 rounded-sm border px-2.5 font-mono text-xs transition-colors ${
                      activo
                        ? 'border-white bg-white font-semibold text-zinc-950'
                        : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
              <input
                type="number"
                min={2}
                max={24}
                value={sesionesObjetivo}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setSesionesObjetivo(Math.trunc(v));
                }}
                aria-label="Sesiones objetivo manuales"
                className="h-9 w-16 rounded-sm border border-zinc-700 bg-zinc-950 px-2 font-mono text-xs text-white outline-none focus:border-zinc-500"
              />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              Estándar 6 sesiones = 3 semanas (2 clases semanales por grupo).
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
