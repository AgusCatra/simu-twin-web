import {
  Activity,
  BarChart3,
  Briefcase,
  Clock,
  GraduationCap,
  Users,
} from 'lucide-react';
import type { EstadisticasGlobalesCentro } from '@/services/estadisticas-centro';

interface Props {
  estadisticas: EstadisticasGlobalesCentro;
}

const PANEL_CLASS = 'rounded-sm border border-zinc-800 bg-zinc-950 p-4';

export default function PanelEstadisticasCentro({ estadisticas }: Props) {
  const maxHorasSim = Math.max(
    1,
    ...estadisticas.usoPorSimulador.map((s) => s.horasConsolidadas)
  );
  const maxTipoActividades = Math.max(
    1,
    ...estadisticas.demografia.porTipoActividad.map((t) => t.actividades)
  );

  const totalGenero =
    estadisticas.demografia.porGenero.hombre +
    estadisticas.demografia.porGenero.mujer +
    estadisticas.demografia.porGenero.otro +
    estadisticas.demografia.porGenero.no_especifica;

  const generosLista: Array<{
    clave: string;
    etiqueta: string;
    cantidad: number;
    color: string;
  }> = [
    {
      clave: 'hombre',
      etiqueta: 'Hombres',
      cantidad: estadisticas.demografia.porGenero.hombre,
      color: 'bg-sky-500',
    },
    {
      clave: 'mujer',
      etiqueta: 'Mujeres',
      cantidad: estadisticas.demografia.porGenero.mujer,
      color: 'bg-emerald-500',
    },
    {
      clave: 'otro',
      etiqueta: 'Otro',
      cantidad: estadisticas.demografia.porGenero.otro,
      color: 'bg-amber-400',
    },
    {
      clave: 'no_especifica',
      etiqueta: 'No especifica',
      cantidad: estadisticas.demografia.porGenero.no_especifica,
      color: 'bg-zinc-500',
    },
  ];

  return (
    <section
      aria-label="Estadísticas globales y perfil demográfico"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.16em] text-zinc-100">
            <BarChart3 size={15} className="text-sky-400" aria-hidden />
            ESTADÍSTICAS GLOBALES Y PERFIL DEMOGRÁFICO
          </h3>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
            USO DE LOS 7 SIMULADORES · ALCANCE POR ENTIDAD · DEMOGRAFÍA Y OCUPACIÓN
          </p>
        </div>
        <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-zinc-300">
          {estadisticas.totalActividades} ACTIVIDADES · {estadisticas.totalSesionesRegistradas} SESIONES
        </span>
      </div>

      {/* ── KPIs de alcance consolidado ────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={PANEL_CLASS}>
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
            <Clock size={12} className="text-sky-400" aria-hidden />
            HORAS ACUMULADAS FLOTA
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white">
            {estadisticas.horasTotalesFlota.toLocaleString('es-AR')} h
          </p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">
            Odómetro máquina · Hs-Hombre duplas:{' '}
            {(estadisticas.horasHombreCapacitacion ?? 0).toLocaleString('es-AR')} h
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
            <Users size={12} className="text-emerald-400" aria-hidden />
            ALCANCE TOTAL PERSONAS
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white">
            {estadisticas.alcance.totalPersonas.toLocaleString('es-AR')}
          </p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">
            Act: {estadisticas.alcance.participantesActividades} · Visitas:{' '}
            {estadisticas.alcance.alumnosVisitas + estadisticas.alcance.docentesVisitas}
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
            <Briefcase size={12} className="text-cyan-400" aria-hidden />
            EMPLEO (POSTULANTES)
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white">
            {estadisticas.alcance.postulantesEmpleo.toLocaleString('es-AR')}
          </p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">
            Nómina registrada en cohortes
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
            <GraduationCap size={12} className="text-amber-400" aria-hidden />
            VISITAS ESCOLARES
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-white">
            {estadisticas.visitasHistoricas.colegiosRecibidos} /{' '}
            <span className="text-base text-zinc-400">
              {estadisticas.visitasHistoricas.colegiosTotalesNoCancelados}
            </span>
          </p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">
            Realizadas / activas · {estadisticas.visitasHistoricas.alumnosProgramadosActivos} alumnos
          </p>
        </div>
      </div>

      {/* ── Uso por los 7 simuladores + Desglose por entidad ───── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={PANEL_CLASS}>
          <h4 className="mb-3 flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] text-zinc-200">
            <Activity size={13} className="text-sky-400" aria-hidden />
            USO POR SIMULADOR (7 BAHÍAS)
          </h4>
          <div className="space-y-2.5">
            {estadisticas.usoPorSimulador.map((sim) => {
              const porcentaje =
                sim.horasConsolidadas > 0
                  ? Math.max(4, Math.round((sim.horasConsolidadas / maxHorasSim) * 100))
                  : 0;
              return (
                <div key={sim.id} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px]">
                    <span className="text-zinc-200">
                      <span className="text-zinc-500">{sim.codigoBahia} · </span>
                      {sim.nombre}
                    </span>
                    <span className="text-zinc-300">
                      <strong className="text-white">{sim.horasConsolidadas} h</strong>{' '}
                      <span className="text-zinc-500">
                        ({sim.sesionesActividades + sim.sesionesCohorte} ses.)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-sm bg-zinc-900">
                    <div
                      className="h-full bg-sky-500 transition-all"
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Tipo de actividad + Demografía + Puestos ─────────── */}
        <div className="space-y-4">
          <div className={PANEL_CLASS}>
            <h4 className="mb-3 font-mono text-[11px] font-semibold tracking-[0.14em] text-zinc-200">
              ACTIVIDADES POR TIPO DE ENTIDAD
            </h4>
            <div className="space-y-2">
              {estadisticas.demografia.porTipoActividad.map((item) => {
                const ancho =
                  item.actividades > 0
                    ? Math.max(6, Math.round((item.actividades / maxTipoActividades) * 100))
                    : 0;
                return (
                  <div key={item.tipo} className="space-y-1 font-mono text-[10.5px]">
                    <div className="flex items-center justify-between text-zinc-300">
                      <span>{item.etiqueta}</span>
                      <span>
                        {item.actividades} act. · {item.participantes} pers. · {item.horas} h
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-zinc-900">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${ancho}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={PANEL_CLASS}>
              <h4 className="mb-2.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-zinc-200">
                PERFIL POR GÉNERO ({totalGenero})
              </h4>
              {totalGenero === 0 ? (
                <p className="font-mono text-[10px] text-zinc-500">
                  Sin participantes registrados aún.
                </p>
              ) : (
                <div className="space-y-2">
                  {generosLista.map((g) => {
                    const pct =
                      totalGenero > 0
                        ? Math.round((g.cantidad / totalGenero) * 100)
                        : 0;
                    return (
                      <div key={g.clave} className="space-y-1 font-mono text-[10px]">
                        <div className="flex justify-between text-zinc-300">
                          <span>{g.etiqueta}</span>
                          <span>
                            {g.cantidad} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-sm bg-zinc-900">
                          <div
                            className={`h-full ${g.color}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={PANEL_CLASS}>
              <h4 className="mb-2.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-zinc-200">
                PERFIL OCUPACIONAL / PUESTO
              </h4>
              {estadisticas.demografia.porPuesto.length === 0 ? (
                <p className="font-mono text-[10px] text-zinc-500">
                  Sin puestos declarados en nóminas aún.
                </p>
              ) : (
                <ul className="space-y-1.5 font-mono text-[10px]">
                  {estadisticas.demografia.porPuesto.map((p) => (
                    <li
                      key={p.puesto}
                      className="flex items-center justify-between gap-2 border-b border-zinc-900 pb-1 text-zinc-300"
                    >
                      <span className="truncate">{p.puesto}</span>
                      <span className="shrink-0 font-semibold text-white">
                        {p.cantidad}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
