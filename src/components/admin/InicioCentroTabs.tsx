'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  Box,
  Bus,
  CalendarCheck,
  ClipboardList,
  Cpu,
  Gauge,
  LayoutGrid,
  Package,
  Truck,
  UsersRound,
  UserCog,
} from 'lucide-react';
import type { PerfilUsuario } from '@/lib/auth/matriz-permisos';
import type { EstadoSimulador, FichaTecnicaSimulador } from '@/types/gemelo';
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

interface Props {
  bahiasMostradas: FichaTecnicaSimulador[];
  sinTelemetriaReal: boolean;
  errorSimuladores: boolean;
  errorVisitas: boolean;
  visitasProximas: VisitaAgendaItem[];
  insumosEnAlerta: number;
  esSuperadmin: boolean;
  usuariosRoles: PerfilUsuario[];
  usuarioActualId: string;
}

type TabInicio = 'agenda' | 'galpon3d' | 'usuarios';

function estilosEstadoSimulador(estado: EstadoSimulador): {
  etiqueta: string;
  badgeClass: string;
  dotClass: string;
} {
  if (estado === 'en_operacion') {
    return {
      etiqueta: 'En uso',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
      dotClass: 'bg-amber-500 animate-pulse',
    };
  }
  if (estado === 'mantenimiento') {
    return {
      etiqueta: 'Mantenimiento',
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
      dotClass: 'bg-rose-500',
    };
  }
  return {
    etiqueta: 'Disponible',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
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
  insumosEnAlerta,
  esSuperadmin,
  usuariosRoles,
  usuarioActualId,
}: Props) {
  const [tab, setTab] = useState<TabInicio>('agenda');

  const accesos = [
    {
      href: '/admin/visitas-educativas',
      titulo: 'Escuelas y Visitas',
      subtitulo: 'Agenda de cursos, nóminas y confirmación',
      icono: BookOpen,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      href: '/gestion/cohortes',
      titulo: 'Cursos y Alumnos',
      subtitulo: 'Legajos, turnos en dupla y reportes',
      icono: UsersRound,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      href: '/cabina/evaluacion',
      titulo: 'Evaluar en Cabina / Patio',
      subtitulo: 'Carga en vivo con tablet o celular',
      icono: Gauge,
      color: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      href: '/admin/registro-actividades',
      titulo: 'Bitácora y Simuladores',
      subtitulo: 'Registro diario de uso y puestos activos',
      icono: ClipboardList,
      color: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    {
      href: '/admin/tup',
      titulo: 'Colectivo TUP',
      subtitulo: 'Traslados escolares y horarios',
      icono: Truck,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      href: '/admin/insumos',
      titulo: 'Stock y Refrigerios',
      subtitulo:
        insumosEnAlerta > 0
          ? `${insumosEnAlerta} artículo(s) por debajo del mínimo`
          : 'Existencias e ingresos del pañol',
      icono: Package,
      color:
        insumosEnAlerta > 0
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Barra de Pestañas */}
      <div
        role="tablist"
        aria-label="Secciones de inicio del centro"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'agenda'}
          onClick={() => setTab('agenda')}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === 'agenda'
              ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-2xs'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <LayoutGrid size={16} aria-hidden />
          Accesos Rápidos y Agenda
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

      {/* Contenido Pestaña 1: Accesos Rápidos y Agenda */}
      {tab === 'agenda' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accesos.map((item) => {
              const Icono = item.icono;
              return (
                <Link
                  key={item.href}
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
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            {/* Próximas Escuelas */}
            <section
              aria-label="Próximas visitas escolares"
              className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-6"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                <h2 className="text-base font-bold text-slate-900">
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

            {/* Estado de los Simuladores */}
            <section
              aria-label="Estado de los simuladores"
              className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-6"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Cpu size={17} className="text-blue-600" aria-hidden />
                  Estado de los Simuladores
                </h2>
                <Link
                  href="/admin/registro-actividades"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Ir a Bitácora
                  <ArrowUpRight size={13} aria-hidden />
                </Link>
              </div>

              {errorSimuladores && (
                <p className="px-5 pt-3 text-xs font-medium text-rose-700">
                  No se pudo consultar la flota; se muestra el listado base.
                </p>
              )}

              <ul className="divide-y divide-slate-100">
                {bahiasMostradas.map((sim) => {
                  const st = estilosEstadoSimulador(sim.estado);
                  return (
                    <li
                      key={sim.id}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {sim.codigo} · {sim.nombre}
                        </p>
                        <p className="text-xs text-slate-600 tabular-nums">
                          {sim.horasUsoTotales.toFixed(1)} horas registradas
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
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
                    </li>
                  );
                })}
              </ul>
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
