'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import CardTrasladoTup from '@/components/admin/tup/CardTrasladoTup';
import type { TrasladoTupItem } from '@/types/tup';

/**
 * Panel de Logística TUP (módulo H4).
 *
 * Lista filtrable de traslados municipales activos, pensada para uso táctil
 * en smartphone. Estética de terminal de despacho: mono uppercase, bordes duros,
 * LEDs de estado y destaque visual para traslados del día actual.
 */

type FiltroTup = 'hoy' | 'proximos' | 'finalizados' | 'todos';

const FILTROS: readonly { valor: FiltroTup; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'HOY' },
  { valor: 'proximos', etiqueta: 'PRÓXIMOS' },
  { valor: 'finalizados', etiqueta: 'FINALIZADOS' },
  { valor: 'todos', etiqueta: 'TODOS' },
];

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
        (t) => t.fecha_visita > hoy && t.tup_estado_traslado !== 'finalizado'
      );
    case 'finalizados':
      return traslados.filter((t) => t.tup_estado_traslado === 'finalizado');
    case 'todos':
    default:
      return traslados;
  }
}

interface Props {
  traslados: TrasladoTupItem[];
  hoyISO: string;
  errorLectura?: string | null;
}

export default function PanelLogisticaTup({
  traslados,
  hoyISO,
  errorLectura = null,
}: Props) {
  const router = useRouter();
  const tieneViajesHoy = traslados.some((t) => t.fecha_visita === hoyISO);
  const [filtro, setFiltro] = useState<FiltroTup>(
    tieneViajesHoy ? 'hoy' : 'todos'
  );

  const visibles = useMemo(
    () => aplicarFiltro(traslados, filtro, hoyISO),
    [traslados, filtro, hoyISO]
  );

  const conteos = useMemo(() => {
    const pendientesHoy = traslados.filter(
      (t) => t.fecha_visita === hoyISO && t.tup_estado_traslado !== 'finalizado'
    ).length;
    const enCurso = traslados.filter(
      (t) =>
        t.tup_estado_traslado === 'en_camino' ||
        t.tup_estado_traslado === 'en_destino'
    ).length;
    const finalizados = traslados.filter(
      (t) => t.tup_estado_traslado === 'finalizado'
    ).length;
    return { pendientesHoy, enCurso, finalizados, total: traslados.length };
  }, [traslados, hoyISO]);

  return (
    <div className="space-y-4">
      {errorLectura && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-sm border border-rose-900 bg-rose-950/40 px-3 py-2.5 text-xs text-rose-200"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0 text-rose-400" />
            {errorLectura}
          </span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-rose-800 bg-zinc-950 px-2.5 font-mono text-[10px] tracking-[0.1em] text-zinc-200"
          >
            <RefreshCw size={12} />
            REINTENTAR
          </button>
        </div>
      )}

      {/* ── Contadores operativos (LEDs) ───────────────────────── */}
      <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-mono text-[9.5px] tracking-[0.18em] text-zinc-600">
            {'// ESTADO DE OPERACIONES'}
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-zinc-400 hover:text-zinc-100"
          >
            <RefreshCw size={11} />
            ACTUALIZAR
          </button>
        </div>
        <dl className="grid grid-cols-3 gap-2 font-mono text-[10.5px] tracking-[0.1em]">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-zinc-400" />
            <dt className="text-zinc-500">PEND/HOY</dt>
            <dd className="ml-auto text-zinc-100">{conteos.pendientesHoy}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
            <dt className="text-zinc-500">EN CURSO</dt>
            <dd className="ml-auto text-zinc-100">{conteos.enCurso}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            <dt className="text-zinc-500">FINALIZ.</dt>
            <dd className="ml-auto text-zinc-100">{conteos.finalizados}</dd>
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
              className={`flex h-11 items-center justify-center font-mono text-[10px] font-semibold tracking-[0.1em] transition-colors ${
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
      {traslados.length === 0 ? (
        <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950 px-4 py-10 text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
            Sin traslados TUP programados
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
            No existen visitas educativas confirmadas o reprogramadas con servicio de
            transporte municipal desde hoy ({hoyISO}).
          </p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950 px-4 py-8 text-center">
          <p className="font-mono text-[11px] tracking-[0.16em] text-zinc-500">
            ▸ SIN TRASLADOS EN «{filtro.toUpperCase()}»
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            {filtro === 'hoy'
              ? 'No hay visitas con transporte TUP programadas para hoy. Revise PRÓXIMOS o TODOS para ver la agenda.'
              : filtro === 'proximos'
                ? 'No hay traslados futuros pendientes en la agenda.'
                : 'Todavía no hay traslados marcados como FINALIZADO.'}
          </p>
        </div>
      ) : (
        <div>
          {visibles.map((traslado) => (
            <CardTrasladoTup
              key={traslado.id}
              traslado={traslado}
              esHoy={traslado.fecha_visita === hoyISO}
            />
          ))}
        </div>
      )}
    </div>
  );
}
