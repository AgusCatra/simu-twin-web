'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Box,
  Bus,
  CalendarCheck,
  Cpu,
  FolderPlus,
  Gauge,
  LayoutGrid,
  UserCog,
  UsersRound,
  Wrench,
} from 'lucide-react';
import type { PerfilUsuario } from '@/lib/auth/matriz-permisos';
import type { EstadoSimulador, FichaTecnicaSimulador } from '@/types/gemelo';
import type { EstadoSimuladorConmutable } from '@/types/actividades';
import { conmutarEstadoSimuladorAction } from '@/app/admin/registro-actividades/actions';
import VisorNave3D from '@/components/gemelo/VisorNave3D';
import PanelGestionRoles from '@/components/admin/PanelGestionRoles';

export interface VisitaAgendaItem {
  id: string;
  codigoReserva: string;
  fechaVisitaCorta: string;
  turno: string;
  institucion: string;
  cursoLabel: string;
  cantAlumnos: number;
  requiereTup: boolean;
  estadoTup: string;
  estadoVisita: string;
}

export interface CohorteRapidaInfo {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  bahiasMostradas: FichaTecnicaSimulador[];
  sinTelemetriaReal: boolean;
  errorSimuladores: boolean;
  errorVisitas: boolean;
  visitasProximas: VisitaAgendaItem[];
  cohorteActiva: CohorteRapidaInfo | null;
  esSuperadmin: boolean;
  usuariosRoles: PerfilUsuario[];
  usuarioActualId: string;
}

type TabInicio = 'monitor' | 'galpon3d' | 'usuarios';

function estilosEstadoSimulador(estado: EstadoSimulador): {
  etiqueta: string;
  badgeClass: string;
  dotClass: string;
  cardClass: string;
} {
  if (estado === 'en_operacion') {
    return {
      etiqueta: 'En Uso / Capacitación',
      badgeClass: 'border-blue-200 bg-blue-50 text-blue-800',
      dotClass: 'bg-blue-500 animate-pulse',
      cardClass: 'border-blue-200 bg-blue-50/30',
    };
  }
  if (estado === 'mantenimiento') {
    return {
      etiqueta: 'En Mantenimiento',
      badgeClass: 'border-orange-300 bg-orange-50 text-orange-800',
      dotClass: 'bg-orange-500',
      cardClass: 'border-orange-300 bg-orange-50/40',
    };
  }
  return {
    etiqueta: 'Libre',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
    cardClass: 'border-slate-200 bg-white',
  };
}

function estilosEstadoVisita(estado: string): string {
  const norm = estado.toLowerCase();
  if (norm === 'confirmada') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (norm === 'reprogramada') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }
  if (norm === 'completada' || norm === 'finalizada' || norm === 'realizada') {
    return 'border-slate-200 bg-slate-100 text-slate-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

export default function InicioCentroTabs({
  bahiasMostradas,
  sinTelemetriaReal,
  errorSimuladores,
  errorVisitas,
  visitasProximas,
  cohorteActiva,
  esSuperadmin,
  usuariosRoles,
  usuarioActualId,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabInicio>('monitor');
  const [estadosOptimistas, setEstadosOptimistas] = useState<
    Record<string, EstadoSimulador>
  >({});
  const [simCambiandoId, setSimCambiandoId] = useState<string | null>(null);
  const [errorCambioEstado, setErrorCambioEstado] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function resolverEstado(sim: FichaTecnicaSimulador): EstadoSimulador {
    return estadosOptimistas[sim.id] ?? sim.estado;
  }

  function cambiarEstadoSimulador(
    sim: FichaTecnicaSimulador,
    destino: EstadoSimuladorConmutable
  ) {
    if (resolverEstado(sim) === destino) return;
    setErrorCambioEstado(null);
    setSimCambiandoId(sim.id);
    setEstadosOptimistas((prev) => ({ ...prev, [sim.id]: destino }));

    startTransition(async () => {
      try {
        const res = await conmutarEstadoSimuladorAction(sim.id, destino);
        if (!res.ok) {
          setEstadosOptimistas((prev) => {
            const copia = { ...prev };
            delete copia[sim.id];
            return copia;
          });
          setErrorCambioEstado(res.error ?? 'No se pudo actualizar el estado.');
          return;
        }
        router.refresh();
      } finally {
        setSimCambiandoId(null);
      }
    });
  }

  const equiposEnMantenimiento = bahiasMostradas.filter(
    (s) => resolverEstado(s) === 'mantenimiento'
  );

  const accionesHoy = [
    {
      href: cohorteActiva
        ? `/gestion/cohortes?cohorteId=${cohorteActiva.id}`
        : '/gestion/cohortes',
      titulo: 'Ir a Cohorte en Curso',
      subtitulo: cohorteActiva
        ? `${cohorteActiva.codigo} · ${cohorteActiva.nombre}`
        : 'Elegir cohorte activa de capacitación',
      icono: UsersRound,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      href: '/gestion/cohortes?nueva=1',
      titulo: 'Crear Nueva Cohorte',
      subtitulo: 'Dar de alta un nuevo curso y proyectar duplas',
      icono: FolderPlus,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      href: '/admin/visitas-educativas',
      titulo: 'Ver Solicitudes de Escuelas',
      subtitulo: 'Visitas, traslados TUP y stock de merienda',
      icono: BookOpen,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      href: '/cabina/evaluacion',
      titulo: 'Evaluar en Tablet',
      subtitulo: 'Cabina de simulador o práctica real en patio',
      icono: Gauge,
      color: 'bg-amber-50 text-amber-800 border-amber-200',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Barra de Pestañas */}
      <div
        role="tablist"
        aria-label="Secciones del Panel en Vivo"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'monitor'}
          onClick={() => setTab('monitor')}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === 'monitor'
              ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-2xs'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <LayoutGrid size={16} aria-hidden />
          Monitor en Vivo y Mantenimiento
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === 'galpon3d'}
          onClick={() => setTab('galpon3d')}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === 'galpon3d'
              ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-2xs'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Box size={16} aria-hidden />
          Galpón 3D en Vivo
        </button>

        {esSuperadmin && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'usuarios'}
            onClick={() => setTab('usuarios')}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === 'usuarios'
                ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-2xs'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <UserCog size={16} aria-hidden />
            Usuarios y Permisos
          </button>
        )}
      </div>

      {/* Contenido Pestaña 1: Monitor de los 7 Simuladores + Acciones de Hoy + Escuelas */}
      {tab === 'monitor' && (
        <div className="space-y-6">
          {/* Alerta global si algún simulador está en mantenimiento */}
          {equiposEnMantenimiento.length > 0 && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <Wrench size={18} className="shrink-0 text-orange-600" aria-hidden />
                <span>
                  <strong>Atención mantenimiento:</strong>{' '}
                  {equiposEnMantenimiento.map((s) => s.nombre).join(', ')} en revisión técnica.
                </span>
              </div>
              <span className="rounded-md border border-orange-200 bg-white px-2.5 py-0.5 text-xs font-bold text-orange-800">
                {equiposEnMantenimiento.length} en revisión
              </span>
            </div>
          )}

          {errorCambioEstado && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700"
            >
              {errorCambioEstado}
            </p>
          )}

          {/* Bloque Central: Monitor en Vivo de los 7 Simuladores y Mantenimiento */}
          <section
            aria-label="Monitor en Vivo de los 7 Simuladores y Mantenimiento"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Cpu size={18} className="text-blue-600" aria-hidden />
                  Monitor en Vivo de los 7 Simuladores y Mantenimiento
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Cambiá el estado en 1 clic entre Libre, En Uso o Mantenimiento y controlá las horas acumuladas de cada estación.
                </p>
              </div>
              <Link
                href="/admin/registro-actividades"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Abrir Bitácora Completa
                <ArrowUpRight size={13} aria-hidden />
              </Link>
            </div>

            {errorSimuladores && (
              <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                No se pudo leer la flota desde Supabase; se muestra la configuración base.
              </p>
            )}

            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {bahiasMostradas.map((sim) => {
                const estadoActual = resolverEstado(sim);
                const st = estilosEstadoSimulador(estadoActual);
                const enMantenimiento = estadoActual === 'mantenimiento';
                const cambiando = simCambiandoId === sim.id;

                return (
                  <article
                    key={sim.id}
                    className={`flex flex-col justify-between gap-3 rounded-xl border p-4 transition-colors ${st.cardClass}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-500">
                            {sim.codigo}
                          </p>
                          <h3 className="truncate text-sm font-bold text-slate-900">
                            {sim.nombre}
                          </h3>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            sinTelemetriaReal
                              ? 'border-slate-200 bg-slate-100 text-slate-600'
                              : st.badgeClass
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`h-2 w-2 rounded-full ${
                              sinTelemetriaReal ? 'bg-slate-400' : st.dotClass
                            }`}
                          />
                          {sinTelemetriaReal ? 'Sin datos' : st.etiqueta}
                        </span>
                      </div>

                      <div className="mt-3 flex items-baseline justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-2">
                        <span className="text-xs font-medium text-slate-500">
                          Odómetro real
                        </span>
                        <span className="text-base font-bold text-slate-900 tabular-nums">
                          {sim.horasUsoTotales.toFixed(1)} hs
                        </span>
                      </div>

                      {enMantenimiento && (
                        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-100/70 px-2.5 py-1.5 text-xs font-semibold text-orange-900">
                          <AlertTriangle size={13} className="shrink-0 text-orange-600" aria-hidden />
                          Equipo en revisión técnica
                        </p>
                      )}
                    </div>

                    <div
                      role="group"
                      aria-label={`Cambiar estado de ${sim.nombre}`}
                      className="grid grid-cols-3 gap-1.5"
                    >
                      <button
                        type="button"
                        disabled={cambiando}
                        aria-pressed={estadoActual === 'libre'}
                        onClick={() => cambiarEstadoSimulador(sim, 'libre')}
                        className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                          estadoActual === 'libre'
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        🟢 Libre
                      </button>
                      <button
                        type="button"
                        disabled={cambiando}
                        aria-pressed={estadoActual === 'en_operacion'}
                        onClick={() => cambiarEstadoSimulador(sim, 'en_operacion')}
                        className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                          estadoActual === 'en_operacion'
                            ? 'border-blue-300 bg-blue-100 text-blue-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        🔵 En Uso
                      </button>
                      <button
                        type="button"
                        disabled={cambiando}
                        aria-pressed={estadoActual === 'mantenimiento'}
                        onClick={() => cambiarEstadoSimulador(sim, 'mantenimiento')}
                        className={`rounded-lg border px-1.5 py-2 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                          estadoActual === 'mantenimiento'
                            ? 'border-orange-300 bg-orange-200 text-orange-950'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        🟠 Manten.
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Bloque Inferior: Acciones Rápidas de Hoy + Agenda de Escuelas */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <section
              aria-label="Acciones rápidas de hoy"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-7"
            >
              {accionesHoy.map((item) => {
                const Icono = item.icono;
                return (
                  <Link
                    key={item.titulo}
                    href={item.href}
                    className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-lg border ${item.color}`}
                      >
                        <Icono size={20} strokeWidth={1.85} aria-hidden />
                      </span>
                      <ArrowUpRight
                        size={18}
                        className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-blue-600"
                        aria-hidden
                      />
                    </div>
                    <div className="mt-4">
                      <p className="text-base font-bold text-slate-900 group-hover:text-blue-700">
                        {item.titulo}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.subtitulo}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </section>

            {/* Próximas Escuelas */}
            <section
              aria-label="Próximas visitas escolares"
              className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-5"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Activity size={17} className="text-blue-600" aria-hidden />
                  Próximas Escuelas
                </h2>
                <Link
                  href="/admin/visitas-educativas"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Ver agenda
                  <ArrowUpRight size={13} aria-hidden />
                </Link>
              </div>

              {errorVisitas ? (
                <p className="p-5 text-sm text-rose-700">
                  No se pudo consultar la agenda de escuelas.
                </p>
              ) : visitasProximas.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
                  <CalendarCheck
                    size={26}
                    className="mb-2 text-slate-400"
                    aria-hidden
                  />
                  <p className="text-sm font-semibold text-slate-700">
                    Sin visitas programadas desde hoy
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Cuando una escuela envíe su reserva aparecerá aquí.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visitasProximas.map((v) => (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {v.institucion}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {v.fechaVisitaCorta} · {v.turno} · {v.cursoLabel} ·{' '}
                          {v.cantAlumnos} alumnos
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${estilosEstadoVisita(
                            v.estadoVisita
                          )}`}
                        >
                          {v.estadoVisita}
                        </span>
                        {v.requiereTup && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            <Bus size={12} aria-hidden />
                            TUP
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Contenido Pestaña 2: Galpón 3D en Vivo */}
      {tab === 'galpon3d' && (
        <section
          aria-label="Galpón 3D en Vivo"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Galpón 3D en Vivo
              </h2>
              <p className="text-sm text-slate-600">
                Seleccioná cualquier simulador en el plano para ver su estado y horas acumuladas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/registro-actividades"
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                Abrir Bitácora
                <ArrowUpRight size={13} aria-hidden />
              </Link>
              <Link
                href="/cabina/evaluacion"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Evaluar en Cabina
                <ArrowUpRight size={13} aria-hidden />
              </Link>
            </div>
          </div>
          <div className="h-[500px] w-full overflow-hidden rounded-lg border border-slate-200">
            <VisorNave3D simuladoresIniciales={bahiasMostradas} />
          </div>
        </section>
      )}

      {/* Contenido Pestaña 3: Usuarios y Permisos */}
      {tab === 'usuarios' && esSuperadmin && (
        <PanelGestionRoles
          usuariosIniciales={usuariosRoles}
          usuarioActualId={usuarioActualId}
        />
      )}
    </div>
  );
}
