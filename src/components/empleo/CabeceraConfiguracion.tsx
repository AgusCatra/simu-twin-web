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
  const [horasTeoria, setHorasTeoria] = useState<number>(cfgBase.horas_teoria ?? 2.0);
  const [horasDiagYFinal, setHorasDiagYFinal] = useState<number>(
    cfgBase.horas_diagnostico_y_final ?? 1.0
  );
  const [horasPorSesion, setHorasPorSesion] = useState<number>(
    cfgBase.horas_por_sesion_simulador ?? 1.0
  );
  const [horasBaseTerreno, setHorasBaseTerreno] = useState<number>(
    cfgBase.horas_base_practica_real ?? 1.5
  );
  const [nuevaFranja, setNuevaFranja] = useState('');
  const [panelAbierto, setPanelAbierto] = useState(false);
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
      horas_teoria: Math.max(0, horasTeoria),
      horas_diagnostico_y_final: Math.max(0, horasDiagYFinal),
      horas_por_sesion_simulador: Math.max(0.5, horasPorSesion),
      horas_base_practica_real: Math.max(0, horasBaseTerreno),
    }),
    [
      diasGrupoA,
      diasGrupoB,
      franjasActivas,
      sesionesObjetivo,
      horasTeoria,
      horasDiagYFinal,
      horasPorSesion,
      horasBaseTerreno,
    ]
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
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPanelAbierto((v) => !v)}
            aria-expanded={panelAbierto}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 shadow-2xs transition-colors hover:bg-slate-100"
          >
            <SlidersHorizontal size={15} className="text-blue-600" aria-hidden />
            Configurar Días y Horarios
          </button>

          <span className="text-xs font-medium text-slate-600">
            Grupo A: <strong className="text-slate-900">{formatearDiasGrupoCorto(configActual.dias_grupo_a)}</strong>
            {configActual.dias_grupo_b.length > 0 && (
              <>
                {' '}· Grupo B: <strong className="text-slate-900">{formatearDiasGrupoCorto(configActual.dias_grupo_b)}</strong>
              </>
            )}{' '}
            · {configActual.franjas_activas.length} franjas · {configActual.sesiones_objetivo} clases
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>
            Confirmados:{' '}
            <strong className={totalConfirmados > cupo ? 'text-rose-700' : 'text-slate-900'}>
              {totalConfirmados}/{cupo}
            </strong>
          </span>
          {proyeccion ? (
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              Simulador: {formatoCorto(proyeccion.fechaInicioSimulador)} al {formatoCorto(proyeccion.fechaFinSimulador)} · Patio: {formatoCorto(proyeccion.fechaPaseTerreno)}
            </span>
          ) : (
            <span className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
              Simulador: {formatoCorto(fechaInicioSim)} al {formatoCorto(fechaFinSim)}
            </span>
          )}
        </div>
      </div>

      {panelAbierto && (
        <div className="mt-4 space-y-5 border-t border-slate-200 pt-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                  <Users size={14} strokeWidth={1.75} aria-hidden />
                  Cupo de alumnos
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
                        className={`h-10 min-w-12 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                          activo
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {opcion}
                      </button>
                    );
                  })}
                  <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
                    <span className="text-xs font-medium text-slate-500">
                      Manual
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
                      aria-label="Cupo manual de alumnos"
                      className="h-full w-16 bg-transparent text-sm font-bold text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <CalendarDays size={14} strokeWidth={1.75} aria-hidden />
                    Fecha de clase teórica
                  </p>
                  <input
                    type="date"
                    value={fechaTeoria}
                    onChange={(e) => setFechaTeoria(e.target.value)}
                    aria-label="Fecha de teoría"
                    className="mt-2 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 lg:text-right">
              <div
                aria-live="polite"
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700"
              >
                {proyeccion ? (
                  <>
                    <p className="font-bold text-slate-900">
                      {plazasDuplasSim} plazas en duplas · {configActual.sesiones_objetivo} clases c/u
                    </p>
                    <p>
                      Inicio: {formatoCorto(proyeccion.fechaInicioSimulador)} · Fin: {formatoCorto(proyeccion.fechaFinSimulador)} · Patio: {formatoCorto(proyeccion.fechaPaseTerreno)}
                    </p>
                    <p className={recuperatoriosCount > 0 ? 'font-semibold text-amber-800' : 'font-semibold text-emerald-700'}>
                      {recuperatoriosCount > 0
                        ? `${recuperatoriosCount} viernes con recuperatorio por feriado`
                        : `${proyeccion.viernesEstado.length} viernes disponibles de respaldo`}
                    </p>
                  </>
                ) : (
                  <p>Seleccioná una fecha de teoría para calcular el calendario.</p>
                )}
              </div>

              <div className="flex items-center gap-3 lg:justify-end">
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={isPending || !proyeccion}
                  className="h-10 rounded-lg bg-blue-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isPending ? 'Guardando…' : 'Guardar configuración'}
                </button>
              </div>

              {mensaje && (
                <p
                  role={mensaje.tipo === 'error' ? 'alert' : 'status'}
                  className={`text-xs font-semibold ${
                    mensaje.tipo === 'ok' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {mensaje.texto}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-3">
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Días Grupo A
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
                        className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                          activo
                            ? 'border-blue-300 bg-blue-600 text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
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
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Días Grupo B (opcional)
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setDiasGrupoB((prev) => (prev.length === 0 ? [2, 4] : []))
                    }
                    className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
                  >
                    {diasGrupoB.length === 0 ? 'Activar Grupo B' : 'Usar solo 1 grupo'}
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
                        className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                          activo
                            ? 'border-emerald-300 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {d.corto}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                <Clock size={13} aria-hidden />
                Horarios activos (1 a 4)
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
                      className={`h-9 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                        activo
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
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
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={agregarFranjaPersonalizada}
                  disabled={franjasActivas.length >= 4 || !nuevaFranja.trim()}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <Plus size={13} aria-hidden />
                  Agregar
                </button>
              </div>
            </div>

            <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Clases por alumno
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
                      className={`h-9 min-w-10 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                        activo
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
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
                  aria-label="Cantidad manual de clases"
                  className="h-9 w-16 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
              <p className="text-xs text-slate-600">
                Estándar: 6 clases (3 semanas).
              </p>
            </div>

            <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 md:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Horas certificadas por alumno (regla de dupla)
                </p>
                <span className="text-xs text-slate-600">
                  Cada clase en dupla suma {horasPorSesion} h a cada alumno presente y 1 h al simulador
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-slate-700">Teoría (hs)</span>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={horasTeoria}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setHorasTeoria(v);
                    }}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-slate-700">Diag. y Final (hs)</span>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    step={0.5}
                    value={horasDiagYFinal}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setHorasDiagYFinal(v);
                    }}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-slate-700">Por clase dupla (hs)</span>
                  <input
                    type="number"
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={horasPorSesion}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setHorasPorSesion(v);
                    }}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-slate-700">Práctica en patio (hs)</span>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={horasBaseTerreno}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setHorasBaseTerreno(v);
                    }}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
