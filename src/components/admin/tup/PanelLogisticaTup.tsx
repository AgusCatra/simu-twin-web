'use client';

import { useMemo, useState } from 'react';
import CardTrasladoTup from '@/components/admin/tup/CardTrasladoTup';
import type { TrasladoTupItem } from '@/types/tup';

/**
 * Panel de Logística TUP (módulo H4).
 *
 * Lista filtrable de traslados municipales activos, pensada para uso táctil
 * en el vehículo. Estética de terminal de despacho: mono uppercase, bordes
 * duros, LEDs de estado, sin sombras ni gradientes.
 */

type FiltroTup = 'hoy' | 'proximos' | 'completados' | 'todos';

const FILTROS: readonly { valor: FiltroTup; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'HOY' },
  { valor: 'proximos', etiqueta: 'PRÓXIMOS' },
  { valor: 'completados', etiqueta: 'COMPLETADOS' },
  { valor: 'todos', etiqueta: 'TODOS' },
];

/**
 * Devuelve la fecha local de hoy en formato ISO corto (YYYY-MM-DD).
 *
 * Se construye a partir de los componentes locales de `Date` (no `toISOString`)
 * para evitar el corrimiento de zona horaria que produciría un día distinto
 * cerca de medianoche en husos negativos.
 */
function obtenerHoyLocal(): string {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function aplicarFiltro(
  traslados: TrasladoTupItem[],
  filtro: FiltroTup,
  hoy: string
): TrasladoTupItem[] {
  switch (filtro) {
    case 'hoy':
      return traslados.filter((t) => t.fecha_visita === hoy);
    case 'proximos':
      return traslados.filter(
        (t) => t.fecha_visita > hoy && t.tup_estado_traslado !== 'completado'
      );
    case 'completados':
      return traslados.filter((t) => t.tup_estado_traslado === 'completado');
    case 'todos':
    default:
      return traslados;
  }
}

interface Props {
  traslados: TrasladoTupItem[];
}

export default function PanelLogisticaTup({ traslados }: Props) {
  const [filtro, setFiltro] = useState<FiltroTup>('hoy');
  const hoy = useMemo(() => obtenerHoyLocal(), []);

  const visibles = useMemo(
    () => aplicarFiltro(traslados, filtro, hoy),
    [traslados, filtro, hoy]
  );

  const conteos = useMemo(() => {
    const pendientesHoy = traslados.filter(
      (t) =>
        t.fecha_visita === hoy &&
        t.tup_estado_traslado !== 'completado' &&
        t.tup_estado_traslado !== 'cancelado'
    ).length;
    const enCamino = traslados.filter((t) => t.tup_estado_traslado === 'en_camino').length;
    const completados = traslados.filter((t) => t.tup_estado_traslado === 'completado').length;
    return { pendientesHoy, enCamino, completados, total: traslados.length };
  }, [traslados, hoy]);

  return (
    <div className="space-y-4">
      {/* ── Contadores operativos (LEDs) ───────────────────────── */}
      <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5">
        <p className="mb-2 font-mono text-[9.5px] tracking-[0.18em] text-zinc-600">
          {'// ESTADO DE OPERACIONES'}
        </p>
        <dl className="grid grid-cols-3 gap-2 font-mono text-[10.5px] tracking-[0.1em]">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-zinc-500" />
            <dt className="text-zinc-500">PEND/HOY</dt>
            <dd className="ml-auto text-zinc-100">{conteos.pendientesHoy}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
            <dt className="text-zinc-500">EN RUTA</dt>
            <dd className="ml-auto text-zinc-100">{conteos.enCamino}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            <dt className="text-zinc-500">LISTOS</dt>
            <dd className="ml-auto text-zinc-100">{conteos.completados}</dd>
          </div>
        </dl>
      </div>

      {/* ── Barra de filtros segmentada ────────────────────────── */}
      <div
        role="tablist"
        aria-label="Filtros de traslados"
        className="grid grid-cols-4 gap-0 overflow-hidden rounded-sm border border-zinc-800"
      >
        {FILTROS.map((opcion, indice) => {
          const activo = filtro === opcion.valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setFiltro(opcion.valor)}
              className={`flex h-11 items-center justify-center font-mono text-[10.5px] font-semibold tracking-[0.12em] transition-colors ${
                indice > 0 ? 'border-l border-zinc-800' : ''
              } ${
                activo
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              }`}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>

      {/* ── Meta del filtro activo ─────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
        <span>
          FILTRO: <span className="text-zinc-200">{filtro.toUpperCase()}</span>
        </span>
        <span>
          {visibles.length}/{conteos.total} REG
        </span>
      </div>

      {/* ── Lista de tarjetas o vacío descriptivo ──────────────── */}
      {visibles.length === 0 ? (
        <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950 px-4 py-8 text-center">
          <p className="font-mono text-[11px] tracking-[0.16em] text-zinc-500">
            ▸ SIN TRASLADOS EN «{filtro.toUpperCase()}»
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            {filtro === 'hoy'
              ? 'No hay visitas con transporte TUP programadas para hoy. Revise el filtro PRÓXIMOS para anticipar la jornada.'
              : filtro === 'proximos'
                ? 'No hay visitas futuras con TUP confirmado. Cuando una escuela oficial reserve, aparecerá aquí.'
                : filtro === 'completados'
                  ? 'Todavía no hay traslados marcados como COMPLETADO. Use el selector de la tarjeta al finalizar el recorrido.'
                  : 'El registro de traslados TUP está vacío.'}
          </p>
        </div>
      ) : (
        <div>
          {visibles.map((traslado) => (
            <CardTrasladoTup key={traslado.id} traslado={traslado} />
          ))}
        </div>
      )}
    </div>
  );
}
