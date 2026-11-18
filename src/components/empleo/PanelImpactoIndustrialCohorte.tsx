'use client';

import { useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Gauge,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { ResumenImpactoIndustrialCohorte } from '@/lib/telemetria/analitica-predictiva';

interface Props {
  cohorteCodigo: string;
  impacto: ResumenImpactoIndustrialCohorte;
}

const COLOR_PERFIL: Record<string, string> = {
  EFICIENTE: 'bg-emerald-500',
  INEFICIENTE: 'bg-cyan-400',
  APURADO: 'bg-amber-400',
  SIN_NOCION_ESPACIO: 'bg-orange-400',
  NOVATO: 'bg-red-500',
};

function fmtNum(val: number | null | undefined, sufijo = '', conSigno = false): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
  const redondeado = Math.round(val * 10) / 10;
  const pref = conSigno && redondeado > 0 ? '+' : '';
  return `${pref}${redondeado}${sufijo}`;
}

export default function PanelImpactoIndustrialCohorte({
  cohorteCodigo,
  impacto,
}: Props) {
  const [abierto, setAbierto] = useState(true);

  const { asimilacion, preservacionActivos, perfiles, formacion, benchmarking } =
    impacto;

  return (
    <section
      aria-label="Tablero B2B de Impacto y ROI Industrial"
      className="rounded-sm border border-emerald-500/35 bg-gradient-to-b from-emerald-950/15 via-zinc-950 to-zinc-950 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.16em] text-emerald-300">
            <BarChart3 size={14} strokeWidth={1.8} aria-hidden />
            IMPACTO Y ROI INDUSTRIAL B2B · COHORTE {cohorteCodigo}
          </p>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-zinc-400">
            Ciencia de datos predictiva sobre {impacto.totalReportesReales} reportes Titán ({impacto.postulantesConTelemetria}/{impacto.totalPostulantes} postulantes evaluados)
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-3 font-mono text-[10px] tracking-[0.12em] text-zinc-200 hover:border-zinc-500 hover:text-white"
        >
          {abierto ? (
            <>
              <ChevronUp size={13} aria-hidden />
              CONTRAER ROI B2B
            </>
          ) : (
            <>
              <ChevronDown size={13} aria-hidden />
              EXPANDIR ROI B2B
            </>
          )}
        </button>
      </div>

      {abierto && (
        <div className="mt-4 space-y-4">
          {/* 4 KPIs ejecutivos */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {/* 1. Tasa de Asimilación */}
            <article className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-3.5 font-mono">
              <p className="flex items-center gap-1.5 text-[9.5px] tracking-[0.14em] text-sky-300">
                <TrendingUp size={12} aria-hidden />
                ASIMILACIÓN TEMPRANA (V1→V2)
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold text-white">
                  {fmtNum(asimilacion.mejoraPromedioScorePct, '%', true)}
                </span>
                <span className="text-[10px] text-zinc-400">
                  {fmtNum(asimilacion.mejoraPromedioScorePts, ' pts prom.', true)}
                </span>
              </div>
              <div className="mt-2 space-y-1 border-t border-zinc-800/80 pt-2 text-[10px] text-zinc-300">
                <p>
                  Redujeron colisiones:{' '}
                  <strong className="text-emerald-300">
                    {fmtNum(asimilacion.pctAlumnosRedujoColisiones, '%')}
                  </strong>{' '}
                  ({asimilacion.cantidadRedujoColisiones}/{asimilacion.alumnosMultiIntento})
                </p>
                <p>
                  Sin empeorar choques:{' '}
                  <strong className="text-zinc-100">
                    {asimilacion.cantidadSinAumentoColisiones}/{asimilacion.alumnosMultiIntento}
                  </strong>{' '}
                  · ΔTiempo:{' '}
                  <strong className="text-cyan-300">
                    {fmtNum(asimilacion.variacionPromedioTiempoSeg, ' s', true)}
                  </strong>
                </p>
                <p className="text-[9.5px] text-zinc-400">
                  Alta plasticidad: {asimilacion.altaPlasticidadCount} · Estándar:{' '}
                  {asimilacion.asimilacionEstandarCount} · Lenta: {asimilacion.curvaLentaCount}
                </p>
              </div>
            </article>

            {/* 2. Preservación de Activos */}
            <article className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-3.5 font-mono">
              <p className="flex items-center gap-1.5 text-[9.5px] tracking-[0.14em] text-emerald-300">
                <ShieldCheck size={12} aria-hidden />
                PRESERVACIÓN DE ACTIVOS
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold text-white">
                  {fmtNum(preservacionActivos.promedioCuidadoMecanico, '%')}
                </span>
                <span className="text-[10px] text-emerald-300">
                  {preservacionActivos.operadoresOptimos} óptimos (≥75%)
                </span>
              </div>
              <div className="mt-2 space-y-1 border-t border-zinc-800/80 pt-2 text-[10px] text-zinc-300">
                <p>
                  Mediana cohorte:{' '}
                  <strong className="text-white">
                    {fmtNum(preservacionActivos.medianaCuidadoMecanico, '%')}
                  </strong>{' '}
                  ({fmtNum(preservacionActivos.porcentajeOptimos, '%')} sin riesgo prematuro)
                </p>
                <p className="text-[9.5px] text-zinc-400">
                  Excelente: {preservacionActivos.excelenteCount} · Estándar:{' '}
                  {preservacionActivos.estandarCount} · Moderado:{' '}
                  {preservacionActivos.desgasteModeradoCount} · Riesgo:{' '}
                  {preservacionActivos.riesgoAltoCount}
                </p>
              </div>
            </article>

            {/* 3. Benchmarking Cohorte */}
            <article className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-3.5 font-mono">
              <p className="flex items-center gap-1.5 text-[9.5px] tracking-[0.14em] text-cyan-300">
                <Gauge size={12} aria-hidden />
                BENCHMARKING ESTADÍSTICO
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold text-white">
                  {fmtNum(benchmarking.score.media, ' pts')}
                </span>
                <span className="text-[10px] text-zinc-400">
                  Mediana {fmtNum(benchmarking.score.mediana, ' pts')}
                </span>
              </div>
              <div className="mt-2 space-y-1 border-t border-zinc-800/80 pt-2 text-[10px] text-zinc-300">
                <p>
                  Tiempo ciclo media:{' '}
                  <strong className="text-white">
                    {fmtNum(benchmarking.tiempoSeg.media, ' s')}
                  </strong>{' '}
                  (Med: {fmtNum(benchmarking.tiempoSeg.mediana, ' s')})
                </p>
                <p className="text-[9.5px] text-zinc-400">
                  Base cálculo: {benchmarking.score.n} operadores con telemetría depurada (-2 filtrado)
                </p>
              </div>
            </article>

            {/* 4. Volumen Total de Formación */}
            <article className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-3.5 font-mono">
              <p className="flex items-center gap-1.5 text-[9.5px] tracking-[0.14em] text-amber-300">
                <Award size={12} aria-hidden />
                VOLUMEN DE FORMACIÓN Y EGRESO
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold text-white">
                  {formacion.totalHorasHombre.toLocaleString('es-AR')} h
                </span>
                <span className="text-[10px] text-zinc-400">horas-hombre</span>
              </div>
              <div className="mt-2 space-y-1 border-t border-zinc-800/80 pt-2 text-[10px] text-zinc-300">
                <p>
                  Aprobados p/ Empresas:{' '}
                  <strong className="text-emerald-300">
                    {formacion.aprobadosEmpresas}
                  </strong>{' '}
                  operadores
                </p>
                <p className="text-[9.5px] text-zinc-400">
                  Odómetro máquina SIM-01 (duplas): {formacion.totalHorasMaquinaSimulador} h reloj
                </p>
              </div>
            </article>
          </div>

          {/* Radiografía de los 5 Perfiles Titán */}
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.15em] text-zinc-300">
                <Activity size={13} className="text-emerald-400" aria-hidden />
                RADIOGRAFÍA DE PERFILES TITÁN (ESTADO VIGENTE)
              </p>
              <span className="rounded-sm border border-emerald-500/40 bg-emerald-950/35 px-2 py-0.5 text-[10px] text-emerald-300">
                EVOLUCIÓN POSITIVA DE PERFIL (V1→V2/T1): {perfiles.evolucionPositivaCount} OPERADORES
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              {perfiles.distribucion.map((item) => (
                <div
                  key={item.perfil}
                  className="rounded-sm border border-zinc-800 bg-zinc-950 p-2.5 font-mono"
                >
                  <div className="flex items-center justify-between gap-1 text-[9.5px] text-zinc-400">
                    <span className="truncate font-semibold text-zinc-200">
                      {item.etiqueta.toUpperCase()}
                    </span>
                    <span className="text-white">{item.cantidad}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full ${COLOR_PERFIL[item.perfil] ?? 'bg-zinc-400'}`}
                      style={{ width: `${Math.min(100, Math.max(item.cantidad > 0 ? 6 : 0, item.porcentaje))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[9px] text-zinc-500">{item.porcentaje}% de evaluados</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
