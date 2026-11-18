'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardPlus, List, Monitor, RefreshCw } from 'lucide-react';
import FormularioActividadModal from '@/components/admin/actividades/FormularioActividadModal';
import PanelSesionEnVivo from './PanelSesionEnVivo';
import {
  ETIQUETAS_ESTADO_ACTIVIDAD,
  ETIQUETAS_TIPO_ACTIVIDAD,
  type ActividadItem,
  type EstadoActividad,
  type GeneroParticipante,
  type Simulador,
} from '@/types/actividades';

/**
 * Historial de actividades + barra de herramientas con el alta.
 *
 * Se declara cliente porque aloja el estado del modal y dispara
 * `router.refresh()` tras registrar una actividad para que el Server
 * Component de la página vuelva a consultar la base con los datos frescos
 * (rack + historial) sin recargar el documento.
 */

interface TablaActividadesProps {
  actividades: ActividadItem[];
  simuladores: Simulador[];
}

/** Clase de la celda/encabezado (estética SCADA: zinc plano, bordes 1px). */
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
}: TablaActividadesProps) {
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoTablet, setModoTablet] = useState(false);
  const [panelSesionAbierto, setPanelSesionAbierto] = useState(false);

  const simuladoresPorId = useMemo(
    () => new Map(simuladores.map((s) => [s.id, s])),
    [simuladores]
  );

  // Actividad actualmente en curso (a lo sumo una en el modo en vivo).
  const actividadEnCurso = useMemo(
    () => actividades.find((a) => a.estado === 'en_curso') ?? null,
    [actividades]
  );

  // Revalida los datos del servidor tras iniciar/finalizar una sesión en vivo.
  const refrescarDatos = useCallback(() => {
    router.refresh();
  }, [router]);

  function manejarRegistrada() {
    // Fuerza al Server Component de la página a refetchear actividades/rack.
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setModoTablet(false)}
          aria-pressed={!modoTablet}
          className={`flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
            !modoTablet
              ? 'border border-blue-200 bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <List size={15} strokeWidth={2} />
          Lista de actividades
        </button>
        <button
          type="button"
          onClick={() => setModoTablet(true)}
          aria-pressed={modoTablet}
          className={`flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
            modoTablet
              ? 'border border-blue-200 bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Monitor size={15} strokeWidth={2} />
          Modo Tablet (En vivo)
        </button>
      </div>

      {modoTablet ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setPanelSesionAbierto(true)}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-800 shadow-sm transition-colors hover:bg-rose-100"
          >
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            {actividadEnCurso
              ? 'Continuar sesión en vivo'
              : 'Iniciar sesión en vivo'}
          </button>

          {actividadEnCurso ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Sesión en curso
                </h3>
                <span className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  En curso
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold text-slate-500">
                    Institución / Empresa
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-slate-900">
                    {actividadEnCurso.entidad_nombre}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500">
                    Inicio
                  </dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-emerald-700">
                    {actividadEnCurso.hora_inicio ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500">
                    Participantes
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                    {actividadEnCurso.participantes.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500">
                    Simuladores
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {actividadEnCurso.simuladores.length === 0 ? (
                      <span className="text-xs text-slate-500">Sin equipos</span>
                    ) : (
                      actividadEnCurso.simuladores.map((registro) => (
                        <span
                          key={registro.id}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {nombreSimulador(registro, simuladoresPorId)}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-600">
                No hay sesiones activas en este momento
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm font-medium text-slate-600">
              Actividades registradas:{' '}
              <span className="font-bold text-slate-900">{actividades.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.refresh()}
                className={BTN_SECUNDARIO}
              >
                <RefreshCw size={13} strokeWidth={2} />
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => setModalAbierto(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <ClipboardPlus size={14} strokeWidth={2} />
                Nueva actividad
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={TH_CLASS}>Fecha</th>
                    <th scope="col" className={TH_CLASS}>Institución / Empresa</th>
                    <th scope="col" className={TH_CLASS}>Tipo</th>
                    <th scope="col" className={TH_CLASS}>Simuladores</th>
                    <th scope="col" className={TH_CLASS}>Personas</th>
                    <th scope="col" className={TH_CLASS}>Duración</th>
                    <th scope="col" className={TH_CLASS}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {actividades.length === 0 && (
                    <tr>
                      <td colSpan={7} className={`${TD_CLASS} text-sm text-slate-500`}>
                        No hay actividades registradas todavía.
                      </td>
                    </tr>
                  )}

                  {actividades.map((actividad) => (
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
        </>
      )}

      <FormularioActividadModal
        abierto={modalAbierto}
        simuladores={simuladores}
        onCerrar={() => setModalAbierto(false)}
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
