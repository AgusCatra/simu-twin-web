'use client';

import {
  Activity,
  Award,
  BarChart3,
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
  EFICIENTE: 'bg-emerald-600',
  INEFICIENTE: 'bg-blue-600',
  APURADO: 'bg-amber-500',
  SIN_NOCION_ESPACIO: 'bg-orange-500',
  NOVATO: 'bg-rose-600',
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
  const { asimilacion, preservacionActivos, perfiles, formacion, benchmarking } =
    impacto;

  return (
    <section
      aria-label="Resultados para Empresas"
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <BarChart3 size={20} className="text-blue-600" strokeWidth={1.85} aria-hidden />
            Resultados para Empresas · Curso {cohorteCodigo}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Indicadores calculados sobre {impacto.totalReportesReales} reportes de Medium Load ({impacto.postulantesConTelemetria} de {impacto.totalPostulantes} alumnos evaluados)
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 1. Velocidad de Aprendizaje */}
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">
            <TrendingUp size={14} aria-hidden />
            Velocidad de Aprendizaje
          </p>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">
              {fmtNum(asimilacion.mejoraPromedioScorePct, '%', true)}
            </span>
            <span className="text-xs font-medium text-slate-600">
              {fmtNum(asimilacion.mejoraPromedioScorePts, ' pts prom.', true)}
            </span>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-2.5 text-xs text-slate-700">
            <p>
              Redujeron colisiones:{' '}
              <strong className="text-emerald-700">
                {fmtNum(asimilacion.pctAlumnosRedujoColisiones, '%')}
              </strong>{' '}
              ({asimilacion.cantidadRedujoColisiones}/{asimilacion.alumnosMultiIntento})
            </p>
            <p>
              Sin sumar choques:{' '}
              <strong className="text-slate-900">
                {asimilacion.cantidadSinAumentoColisiones}/{asimilacion.alumnosMultiIntento}
              </strong>{' '}
              · Tiempo:{' '}
              <strong className="text-blue-700">
                {fmtNum(asimilacion.variacionPromedioTiempoSeg, ' s', true)}
              </strong>
            </p>
            <p className="text-slate-600">
              Rápida: {asimilacion.altaPlasticidadCount} · Estándar:{' '}
              {asimilacion.asimilacionEstandarCount} · Tutoría: {asimilacion.curvaLentaCount}
            </p>
          </div>
        </article>

        {/* 2. Cuidado de la Máquina */}
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <ShieldCheck size={14} aria-hidden />
            Cuidado de la Máquina
          </p>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">
              {fmtNum(preservacionActivos.promedioCuidadoMecanico, '%')}
            </span>
            <span className="text-xs font-semibold text-emerald-700">
              {preservacionActivos.operadoresOptimos} óptimos (≥75%)
            </span>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-2.5 text-xs text-slate-700">
            <p>
              Mediana del curso:{' '}
              <strong className="text-slate-900">
                {fmtNum(preservacionActivos.medianaCuidadoMecanico, '%')}
              </strong>{' '}
              ({fmtNum(preservacionActivos.porcentajeOptimos, '%')} sin desgaste prematuro)
            </p>
            <p className="text-slate-600">
              Excelente: {preservacionActivos.excelenteCount} · Estándar:{' '}
              {preservacionActivos.estandarCount} · Moderado:{' '}
              {preservacionActivos.desgasteModeradoCount} · Riesgo:{' '}
              {preservacionActivos.riesgoAltoCount}
            </p>
          </div>
        </article>

        {/* 3. Promedio del Curso */}
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">
            <Gauge size={14} aria-hidden />
            Promedio del Curso
          </p>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">
              {fmtNum(benchmarking.score.media, ' pts')}
            </span>
            <span className="text-xs font-medium text-slate-600">
              Mediana {fmtNum(benchmarking.score.mediana, ' pts')}
            </span>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-2.5 text-xs text-slate-700">
            <p>
              Tiempo promedio:{' '}
              <strong className="text-slate-900">
                {fmtNum(benchmarking.tiempoSeg.media, ' s')}
              </strong>{' '}
              (Med: {fmtNum(benchmarking.tiempoSeg.mediana, ' s')})
            </p>
            <p className="text-slate-600">
              Calculado sobre {benchmarking.score.n} alumnos en ejercicio estándar
            </p>
          </div>
        </article>

        {/* 4. Horas y Aprobados */}
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
            <Award size={14} aria-hidden />
            Horas y Aprobados
          </p>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">
              {formacion.totalHorasHombre.toLocaleString('es-AR')} h
            </span>
            <span className="text-xs font-medium text-slate-600">horas de alumnos</span>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-2.5 text-xs text-slate-700">
            <p>
              Aprobados para empresas:{' '}
              <strong className="text-emerald-700">
                {formacion.aprobadosEmpresas}
              </strong>{' '}
              operadores
            </p>
            <p className="text-slate-600">
              Uso real de cabina en duplas: {formacion.totalHorasMaquinaSimulador} h
            </p>
          </div>
        </article>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Activity size={16} className="text-emerald-600" aria-hidden />
            Perfiles de Conducción Actuales
          </p>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Mejora de perfil en {perfiles.evolucionPositivaCount} alumnos
          </span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          {perfiles.distribucion.map((item) => (
            <div
              key={item.perfil}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-1 text-xs">
                <span className="truncate font-semibold text-slate-800">
                  {item.etiqueta}
                </span>
                <span className="font-bold text-slate-900 tabular-nums">{item.cantidad}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${COLOR_PERFIL[item.perfil] ?? 'bg-slate-400'}`}
                  style={{ width: `${Math.min(100, Math.max(item.cantidad > 0 ? 6 : 0, item.porcentaje))}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-600">{item.porcentaje}% de evaluados</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
