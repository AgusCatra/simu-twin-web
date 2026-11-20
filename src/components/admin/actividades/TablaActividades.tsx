'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  ClipboardPlus,
  Clock,
  Filter,
  Play,
  Radio,
  RefreshCw,
  Users,
} from 'lucide-react';
import FormularioActividadModal from '@/components/admin/actividades/FormularioActividadModal';
import PanelSesionEnVivo from './PanelSesionEnVivo';
import {
  ETIQUETAS_ESTADO_ACTIVIDAD,
  ETIQUETAS_TIPO_ACTIVIDAD,
  type ActividadItem,
  type EstadoActividad,
  type GeneroParticipante,
  type Simulador,
  type TipoActividad,
} from '@/types/actividades';

/**
 * Historial completo de actividades presenciales, Monitor de Sesión en Vivo,
 * filtro por categoría, totalizador de personas/horas y alta rápida modal.
 */

interface TablaActividadesProps {
  actividades: ActividadItem[];
  simuladores: Simulador[];
  abrirModalInicial?: boolean;
}

type FiltroCategoria = 'todos' | TipoActividad;

const CATEGORIAS_FILTRO: readonly { valor: FiltroCategoria; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todas' },
  { valor: 'institucional', etiqueta: ETIQUETAS_TIPO_ACTIVIDAD.institucional },
  { valor: 'empresa', etiqueta: ETIQUETAS_TIPO_ACTIVIDAD.empresa },
  { valor: 'visita_especial', etiqueta: ETIQUETAS_TIPO_ACTIVIDAD.visita_especial },
  { valor: 'capacitacion', etiqueta: ETIQUETAS_TIPO_ACTIVIDAD.capacitacion },
  { valor: 'mantenimiento', etiqueta: ETIQUETAS_TIPO_ACTIVIDAD.mantenimiento },
  { valor: 'otro', etiqueta: ETIQUETAS_TIPO_ACTIVIDAD.otro },
];

const TH_CLASS =
  'border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600';
const TD_CLASS =
  'border-b border-slate-100 px-3.5 py-3 align-top text-sm text-slate-800';
const BTN_SECUNDARIO =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';

function claseBadgeEstado(estado: EstadoActividad): string {
  if (estado === 'en_curso') {
    return 'animate-pulse border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (estado === 'finalizada') {
    return 'border-slate-200 bg-slate-100 text-slate-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

/** Formatea una fecha ISO a AAAA-MM-DD (recorta la parte horaria si viene). */
function formatearFecha(iso: string): string {
  return iso.split('T')[0];
}

/** Formatea minutos como "1 h 30 min" o "45 min". */
function formatearDuracion(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return '—';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

/** Formatea minutos totales acumulados en horas legibles (ej: "12,5 h"). */
function formatearHorasAcumuladas(totalMinutos: number): string {
  if (!Number.isFinite(totalMinutos) || totalMinutos <= 0) return '0 h';
  const horas = totalMinutos / 60;
  return `${horas.toLocaleString('es-AR', {
    minimumFractionDigits: horas % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })} h`;
}

/**
 * Calcula el total y el desglose por género "8 (5M / 3H)".
 * Se muestran solo los géneros con conteo > 0.
 */
function resumenGeneros(participantes: ActividadItem['participantes']): string {
  const total = participantes.length;
  if (total === 0) return '0';

  const conteo: Record<GeneroParticipante, number> = {
    hombre: 0,
    mujer: 0,
    otro: 0,
    no_especifica: 0,
  };
  for (const p of participantes) {
    conteo[p.genero] += 1;
  }

  const partes: string[] = [];
  if (conteo.mujer > 0) partes.push(`${conteo.mujer}M`);
  if (conteo.hombre > 0) partes.push(`${conteo.hombre}H`);
  if (conteo.otro > 0) partes.push(`${conteo.otro}O`);
  if (conteo.no_especifica > 0) partes.push(`${conteo.no_especifica}N/E`);

  return partes.length > 0 ? `${total} (${partes.join(' / ')})` : `${total}`;
}

/** Resuelve el nombre a mostrar en el badge del simulador (join o id corto). */
function nombreSimulador(
  registro: ActividadItem['simuladores'][number],
  simuladoresPorId: Map<string, Simulador>
): string {
  if (registro.simulador_nombre && registro.simulador_nombre.length > 0) {
    return registro.simulador_nombre.toUpperCase();
  }
  const sim = simuladoresPorId.get(registro.simulador_id);
  if (sim) return sim.nombre.toUpperCase();
  return registro.simulador_id.slice(0, 8).toUpperCase();
}

export default function TablaActividades({
  actividades,
  simuladores,
  abrirModalInicial = false,
}: TablaActividadesProps) {
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState<boolean>(
    Boolean(abrirModalInicial)
  );
  const [prevAbrirInicial, setPrevAbrirInicial] = useState<boolean>(
    Boolean(abrirModalInicial)
  );
  const [panelSesionAbierto, setPanelSesionAbierto] = useState(false);
  const [filtroCategoria, setFiltroCategoria] =
    useState<FiltroCategoria>('todos');

  if (Boolean(abrirModalInicial) !== prevAbrirInicial) {
    setPrevAbrirInicial(Boolean(abrirModalInicial));
    if (abrirModalInicial) {
      setModalAbierto(true);
    }
  }

  const simuladoresPorId = useMemo(
    () => new Map(simuladores.map((s) => [s.id, s])),
    [simuladores]
  );

  // Actividad actualmente en curso (cronómetro en vivo).
  const actividadEnCurso = useMemo(
    () => actividades.find((a) => a.estado === 'en_curso') ?? null,
    [actividades]
  );

  // Historial filtrado por categoría seleccionada.
  const actividadesFiltradas = useMemo(() => {
    if (filtroCategoria === 'todos') return actividades;
    return actividades.filter((a) => a.tipo === filtroCategoria);
  }, [actividades, filtroCategoria]);

  // Totales acumulados de las actividades visibles (según filtro aplicado).
  const totalizador = useMemo(() => {
    let personas = 0;
    let minutos = 0;
    for (const act of actividadesFiltradas) {
      personas += act.participantes.length;
      minutos += act.duracion_minutos ?? 0;
    }
    return {
      cantidadActividades: actividadesFiltradas.length,
      personasAtendidas: personas,
      minutosAcumulados: minutos,
    };
  }, [actividadesFiltradas]);

  const refrescarDatos = useCallback(() => {
    router.refresh();
  }, [router]);

  const cerrarModalAlta = useCallback(() => {
    setModalAbierto(false);
    if (abrirModalInicial) {
      router.replace('/admin/registro-actividades', { scroll: false });
    }
  }, [abrirModalInicial, router]);

  function manejarRegistrada() {
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Barra superior de acciones rápidas: Alta rápida + Sesión en Vivo */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-blue-200 bg-white p-5 shadow-sm lg:col-span-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Carga rápida presencial
            </p>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              Registrar Visita Institucional, Empresa o Evento
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Cargá en segundos autoridades, delegaciones empresariales o prácticas especiales con su nómina de asistentes.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 sm:w-auto"
            >
              <ClipboardPlus size={18} strokeWidth={2.2} aria-hidden />
              + Nueva Actividad / Visita Institucional
            </button>
          </div>
        </div>

        {/* Monitor de Sesión en Vivo */}
        <section
          aria-label="Monitor de Sesión en Vivo"
          className={`flex flex-col justify-between gap-3 rounded-xl border p-5 shadow-sm lg:col-span-5 ${
            actividadEnCurso
              ? 'border-emerald-300 bg-emerald-50/40'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                <Radio
                  size={14}
                  className={
                    actividadEnCurso ? 'animate-pulse text-emerald-600' : 'text-rose-600'
                  }
                  aria-hidden
                />
                Monitor de Sesión en Vivo
              </p>
              {actividadEnCurso ? (
                <h2 className="mt-1 text-base font-bold text-slate-900">
                  {actividadEnCurso.entidad_nombre}
                </h2>
              ) : (
                <h2 className="mt-1 text-base font-bold text-slate-900">
                  Cronómetro para demos en curso
                </h2>
              )}
            </div>
            {actividadEnCurso ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
                En vivo
              </span>
            ) : (
              <span className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                En espera
              </span>
            )}
          </div>

          {actividadEnCurso ? (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-white p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Inicio</span>
                <span className="font-bold text-emerald-700 tabular-nums">
                  {actividadEnCurso.hora_inicio ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Asistentes</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {actividadEnCurso.participantes.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {actividadEnCurso.simuladores.map((registro) => (
                  <span
                    key={registro.id}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                  >
                    {nombreSimulador(registro, simuladoresPorId)}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Ideal para visitas protocolares o demostraciones prácticas donde quieras cronometrar el uso en tiempo real y sumar asistentes sobre la marcha.
            </p>
          )}

          <button
            type="button"
            onClick={() => setPanelSesionAbierto(true)}
            className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-sm transition-colors ${
              actividadEnCurso
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            <Play size={15} strokeWidth={2.2} aria-hidden />
            {actividadEnCurso
              ? 'Continuar / Finalizar Sesión en Vivo'
              : 'Iniciar Sesión en Vivo (Cronómetro)'}
          </button>
        </section>
      </div>

      {/* Totalizador de personas atendidas y horas acumuladas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <CalendarClock size={14} className="text-blue-600" aria-hidden />
            Actividades {filtroCategoria === 'todos' ? 'registradas' : 'filtradas'}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {totalizador.cantidadActividades}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {filtroCategoria === 'todos'
              ? 'Todas las categorías'
              : `Categoría: ${ETIQUETAS_TIPO_ACTIVIDAD[filtroCategoria]}`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Users size={14} className="text-emerald-600" aria-hidden />
            Personas atendidas
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {totalizador.personasAtendidas.toLocaleString('es-AR')}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Suma total de participantes en nómina
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Clock size={14} className="text-amber-600" aria-hidden />
            Horas acumuladas
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {formatearHorasAcumuladas(totalizador.minutosAcumulados)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {totalizador.minutosAcumulados.toLocaleString('es-AR')} minutos totales
          </p>
        </div>
      </div>

      {/* Filtro por categoría + refrescar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar actividades por categoría">
          <span className="mr-1 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Filter size={13} aria-hidden />
            Categoría:
          </span>
          {CATEGORIAS_FILTRO.map((cat) => {
            const activo = filtroCategoria === cat.valor;
            return (
              <button
                key={cat.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltroCategoria(cat.valor)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activo
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {cat.etiqueta}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => router.refresh()}
          className={BTN_SECUNDARIO}
        >
          <RefreshCw size={13} strokeWidth={2} />
          Actualizar
        </button>
      </div>

      {/* Historial completo */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH_CLASS}>Fecha</th>
                <th scope="col" className={TH_CLASS}>Institución / Empresa</th>
                <th scope="col" className={TH_CLASS}>Categoría</th>
                <th scope="col" className={TH_CLASS}>Simuladores</th>
                <th scope="col" className={TH_CLASS}>Personas</th>
                <th scope="col" className={TH_CLASS}>Duración</th>
                <th scope="col" className={TH_CLASS}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {actividadesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${TD_CLASS} py-8 text-center text-sm text-slate-500`}>
                    {filtroCategoria === 'todos'
                      ? 'No hay actividades registradas todavía.'
                      : `No hay actividades registradas en la categoría "${ETIQUETAS_TIPO_ACTIVIDAD[filtroCategoria]}".`}
                  </td>
                </tr>
              )}

              {actividadesFiltradas.map((actividad) => (
                <tr
                  key={actividad.id}
                  className={`transition-colors hover:bg-slate-50 ${
                    actividad.estado === 'en_curso' ? 'bg-emerald-50/40' : ''
                  }`}
                >
                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <p className="font-semibold text-slate-900 tabular-nums">
                      {formatearFecha(actividad.fecha_actividad)}
                    </p>
                    {(actividad.hora_inicio || actividad.hora_fin) && (
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        {actividad.hora_inicio ?? '--:--'} → {actividad.hora_fin ?? '--:--'}
                      </p>
                    )}
                  </td>

                  <td className={`${TD_CLASS} min-w-[14rem]`}>
                    <p className="font-semibold text-slate-900">
                      {actividad.entidad_nombre}
                    </p>
                    {actividad.contacto_nombre && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        {actividad.contacto_nombre}
                        {actividad.contacto_telefono
                          ? ` · ${actividad.contacto_telefono}`
                          : ''}
                      </p>
                    )}
                  </td>

                  <td className={TD_CLASS}>
                    <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {ETIQUETAS_TIPO_ACTIVIDAD[actividad.tipo]}
                    </span>
                  </td>

                  <td className={`${TD_CLASS} min-w-[12rem]`}>
                    {actividad.simuladores.length === 0 ? (
                      <span className="text-xs text-slate-500">Sin equipos</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {actividad.simuladores.map((registro) => (
                          <li
                            key={registro.id}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-800"
                          >
                            {nombreSimulador(registro, simuladoresPorId)}
                            {registro.minutos_uso ? (
                              <span className="text-slate-500">
                                · {registro.minutos_uso}m
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>

                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <p className="font-medium text-slate-900 tabular-nums">
                      {resumenGeneros(actividad.participantes)}
                    </p>
                  </td>

                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <p className="font-medium text-slate-800 tabular-nums">
                      {formatearDuracion(actividad.duracion_minutos)}
                    </p>
                  </td>

                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${claseBadgeEstado(
                        actividad.estado
                      )}`}
                    >
                      {actividad.estado === 'en_curso' && (
                        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      )}
                      {ETIQUETAS_ESTADO_ACTIVIDAD[actividad.estado]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FormularioActividadModal
        abierto={modalAbierto}
        simuladores={simuladores}
        onCerrar={cerrarModalAlta}
        onRegistrada={manejarRegistrada}
      />

      <PanelSesionEnVivo
        abierto={panelSesionAbierto}
        simuladores={simuladores}
        actividadEnCurso={actividadEnCurso}
        onCerrar={() => setPanelSesionAbierto(false)}
        onSesionIniciada={refrescarDatos}
        onSesionFinalizada={() => {
          refrescarDatos();
          setPanelSesionAbierto(false);
        }}
      />
    </div>
  );
}
