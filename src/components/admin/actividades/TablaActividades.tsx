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
  'border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400';
const TD_CLASS =
  'border-b border-zinc-800 px-3 py-2.5 align-top text-sm text-zinc-300';
const BTN_SECUNDARIO =
  'inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] tracking-[0.08em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

/** Color del badge de estado según el ciclo de vida de la actividad. */
function claseBadgeEstado(estado: EstadoActividad): string {
  if (estado === 'en_curso') {
    return 'animate-pulse border-emerald-700 bg-emerald-950 text-emerald-200';
  }
  if (estado === 'finalizada') {
    return 'border-zinc-700 bg-zinc-900 text-zinc-300';
  }
  return 'border-amber-700 bg-amber-950 text-amber-200';
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
    <div className="space-y-3">
      {/* ── Selector de modo (lista / tablet) ─────────────────── */}
      <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 p-1">
        <button
          type="button"
          onClick={() => setModoTablet(false)}
          aria-pressed={!modoTablet}
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-sm px-4 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
            !modoTablet
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <List size={13} strokeWidth={2} />
          LISTA
        </button>
        <button
          type="button"
          onClick={() => setModoTablet(true)}
          aria-pressed={modoTablet}
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-sm px-4 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
            modoTablet
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Monitor size={13} strokeWidth={2} />
          MODO TABLET
        </button>
      </div>

      {modoTablet ? (
        /* ── Vista tablet: sesión en vivo ─────────────────────── */
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setPanelSesionAbierto(true)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-sm border border-red-700 bg-red-950 font-mono text-sm tracking-[0.12em] text-red-100 transition-colors hover:bg-red-900"
          >
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            {actividadEnCurso
              ? '[ CONTINUAR SESIÓN EN VIVO ]'
              : '[ INICIAR SESIÓN EN VIVO ]'}
          </button>

          {actividadEnCurso ? (
            <div className="rounded-sm border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
                <h3 className="font-mono text-[10px] tracking-[0.16em] text-zinc-500">
                  SESIÓN EN CURSO
                </h3>
                <span className="flex items-center gap-1.5 rounded-sm border border-emerald-700 bg-emerald-950 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-emerald-300">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  EN CURSO
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    Entidad
                  </dt>
                  <dd className="mt-1 text-sm text-zinc-100">
                    {actividadEnCurso.entidad_nombre}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    Inicio
                  </dt>
                  <dd className="mt-1 font-mono text-sm tabular-nums text-emerald-300">
                    {actividadEnCurso.hora_inicio ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    Participantes
                  </dt>
                  <dd className="mt-1 font-mono text-sm text-zinc-100">
                    {actividadEnCurso.participantes.length}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    Simuladores
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {actividadEnCurso.simuladores.length === 0 ? (
                      <span className="font-mono text-[11px] text-zinc-600">
                        SIN EQUIPOS
                      </span>
                    ) : (
                      actividadEnCurso.simuladores.map((registro) => (
                        <span
                          key={registro.id}
                          className="inline-flex items-center gap-1 rounded-sm border border-emerald-800 bg-emerald-950 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-emerald-200"
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {nombreSimulador(registro, simuladoresPorId)}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-8 text-center">
              <p className="font-mono text-[11px] tracking-[0.14em] text-zinc-500">
                NO HAY SESIONES EN CURSO
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
      {/* ── Barra de herramientas ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2">
        <p className="font-mono text-[11px] tracking-[0.1em] text-zinc-400">
          HISTORIAL: <span className="text-zinc-100">{actividades.length}</span>{' '}
          · ÚLTIMAS 50
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.refresh()}
            className={BTN_SECUNDARIO}
            title="Actualizar desde la base"
          >
            <RefreshCw size={12} strokeWidth={2} />
            REFRESCAR
          </button>
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-700 bg-emerald-900 px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] text-emerald-50 transition-colors hover:border-emerald-500 hover:bg-emerald-800"
          >
            <ClipboardPlus size={13} strokeWidth={2} />
            [ + NUEVA ACTIVIDAD ]
          </button>
        </div>
      </div>

      {/* ── Data Grid ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/40">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH_CLASS}>
                  Fecha
                </th>
                <th scope="col" className={TH_CLASS}>
                  Entidad / Empresa
                </th>
                <th scope="col" className={TH_CLASS}>
                  Tipo
                </th>
                <th scope="col" className={TH_CLASS}>
                  Simuladores
                </th>
                <th scope="col" className={TH_CLASS}>
                  Personas
                </th>
                <th scope="col" className={TH_CLASS}>
                  Duración
                </th>
                <th scope="col" className={TH_CLASS}>
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {actividades.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className={`${TD_CLASS} font-mono text-[11px] tracking-[0.14em] text-zinc-500`}
                  >
                    SIN ACTIVIDADES REGISTRADAS.
                  </td>
                </tr>
              )}

              {actividades.map((actividad) => (
                <tr
                  key={actividad.id}
                  className={`transition-colors hover:bg-zinc-900 ${
                    actividad.estado === 'en_curso' ? 'bg-emerald-950/20' : ''
                  }`}
                >
                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <p className="font-mono text-[13px] text-zinc-100">
                      {formatearFecha(actividad.fecha_actividad)}
                    </p>
                    {(actividad.hora_inicio || actividad.hora_fin) && (
                      <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-zinc-500">
                        {actividad.hora_inicio ?? '--:--'} → {actividad.hora_fin ?? '--:--'}
                      </p>
                    )}
                  </td>

                  <td className={`${TD_CLASS} min-w-[14rem]`}>
                    <p className="text-zinc-100">{actividad.entidad_nombre}</p>
                    {actividad.contacto_nombre && (
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                        {actividad.contacto_nombre}
                        {actividad.contacto_telefono ? ` · ${actividad.contacto_telefono}` : ''}
                      </p>
                    )}
                  </td>

                  <td className={TD_CLASS}>
                    <span className="inline-flex rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300">
                      {ETIQUETAS_TIPO_ACTIVIDAD[actividad.tipo]}
                    </span>
                  </td>

                  <td className={`${TD_CLASS} min-w-[12rem]`}>
                    {actividad.simuladores.length === 0 ? (
                      <span className="font-mono text-[11px] text-zinc-600">SIN EQUIPOS</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1">
                        {actividad.simuladores.map((registro) => (
                          <li
                            key={registro.id}
                            className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-300"
                            title={
                              registro.minutos_uso
                                ? `${registro.minutos_uso} min de uso`
                                : undefined
                            }
                          >
                            {nombreSimulador(registro, simuladoresPorId)}
                            {registro.minutos_uso ? (
                              <span className="text-zinc-500">
                                · {registro.minutos_uso}m
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>

                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <p className="font-mono text-[13px] text-zinc-100">
                      {resumenGeneros(actividad.participantes)}
                    </p>
                  </td>

                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <p className="font-mono text-[13px] text-zinc-200">
                      {formatearDuracion(actividad.duracion_minutos)}
                    </p>
                  </td>

                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${claseBadgeEstado(
                        actividad.estado
                      )}`}
                    >
                      {actividad.estado === 'en_curso' && (
                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
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
