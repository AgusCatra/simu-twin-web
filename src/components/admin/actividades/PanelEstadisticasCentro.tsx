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

const PANEL_CLASS = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

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
      color: 'bg-blue-600',
    },
    {
      clave: 'mujer',
      etiqueta: 'Mujeres',
      cantidad: estadisticas.demografia.porGenero.mujer,
      color: 'bg-emerald-600',
    },
    {
      clave: 'otro',
      etiqueta: 'Otro',
      cantidad: estadisticas.demografia.porGenero.otro,
      color: 'bg-amber-500',
    },
    {
      clave: 'no_especifica',
      etiqueta: 'No especifica',
      cantidad: estadisticas.demografia.porGenero.no_especifica,
      color: 'bg-slate-400',
    },
  ];

  return (
    <section
      aria-label="Estadísticas globales y perfil demográfico"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <BarChart3 size={18} className="text-blue-600" aria-hidden />
            Estadísticas Generales del Centro
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Uso acumulado de simuladores, visitantes y perfil de participantes
          </p>
        </div>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {estadisticas.totalActividades} actividades · {estadisticas.totalSesionesRegistradas} sesiones
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={PANEL_CLASS}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Clock size={14} className="text-blue-600" aria-hidden />
            Horas de simuladores
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {estadisticas.horasTotalesFlota.toLocaleString('es-AR')} h
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Horas de alumnos:{' '}
            {(estadisticas.horasHombreCapacitacion ?? 0).toLocaleString('es-AR')} h
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Users size={14} className="text-emerald-600" aria-hidden />
            Total de personas
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {estadisticas.alcance.totalPersonas.toLocaleString('es-AR')}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Actividades: {estadisticas.alcance.participantesActividades} · Escuelas:{' '}
            {estadisticas.alcance.alumnosVisitas + estadisticas.alcance.docentesVisitas}
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Briefcase size={14} className="text-blue-600" aria-hidden />
            Alumnos de cursos
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {estadisticas.alcance.postulantesEmpleo.toLocaleString('es-AR')}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Inscriptos en cursos laborales
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <GraduationCap size={14} className="text-amber-600" aria-hidden />
            Visitas escolares
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {estadisticas.visitasHistoricas.colegiosRecibidos} /{' '}
            <span className="text-base font-medium text-slate-500">
              {estadisticas.visitasHistoricas.colegiosTotalesNoCancelados}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Realizadas / agendadas ({estadisticas.visitasHistoricas.alumnosProgramadosActivos} alumnos)
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={PANEL_CLASS}>
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Activity size={16} className="text-blue-600" aria-hidden />
            Uso por Simulador (7 puestos)
          </h4>
          <div className="space-y-3">
            {estadisticas.usoPorSimulador.map((sim) => {
              const porcentaje =
                sim.horasConsolidadas > 0
                  ? Math.max(4, Math.round((sim.horasConsolidadas / maxHorasSim) * 100))
                  : 0;
              return (
                <div key={sim.id} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800">
                      <span className="text-slate-500">{sim.codigoBahia} · </span>
                      {sim.nombre}
                    </span>
                    <span className="text-slate-600 tabular-nums">
                      <strong className="text-slate-900">{sim.horasConsolidadas} h</strong>{' '}
                      ({sim.sesionesActividades + sim.sesionesCohorte} sesiones)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className={PANEL_CLASS}>
            <h4 className="mb-3 text-sm font-bold text-slate-900">
              Actividades por Tipo de Institución
            </h4>
            <div className="space-y-2.5">
              {estadisticas.demografia.porTipoActividad.map((item) => {
                const ancho =
                  item.actividades > 0
                    ? Math.max(6, Math.round((item.actividades / maxTipoActividades) * 100))
                    : 0;
                return (
                  <div key={item.tipo} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-700">
                      <span className="font-medium">{item.etiqueta}</span>
                      <span className="tabular-nums">
                        {item.actividades} act. · {item.participantes} pers. · {item.horas} h
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-600"
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
              <h4 className="mb-3 text-sm font-bold text-slate-900">
                Por Género ({totalGenero})
              </h4>
              {totalGenero === 0 ? (
                <p className="text-xs text-slate-500">
                  Sin participantes registrados aún.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {generosLista.map((g) => {
                    const pct =
                      totalGenero > 0
                        ? Math.round((g.cantidad / totalGenero) * 100)
                        : 0;
                    return (
                      <div key={g.clave} className="space-y-1 text-xs">
                        <div className="flex justify-between text-slate-700">
                          <span>{g.etiqueta}</span>
                          <span className="font-semibold tabular-nums">
                            {g.cantidad} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${g.color}`}
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
              <h4 className="mb-3 text-sm font-bold text-slate-900">
                Puesto u Ocupación
              </h4>
              {estadisticas.demografia.porPuesto.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Sin puestos declarados aún.
                </p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {estadisticas.demografia.porPuesto.map((p) => (
                    <li
                      key={p.puesto}
                      className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 text-slate-700"
                    >
                      <span className="truncate">{p.puesto}</span>
                      <span className="shrink-0 font-bold text-slate-900 tabular-nums">
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
