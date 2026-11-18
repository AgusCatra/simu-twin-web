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
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            {errorLectura}
          </span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100"
          >
            <RefreshCw size={13} />
            Reintentar
          </button>
        </div>
      )}

      {/* Contadores operativos */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Resumen de viajes
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" />
            <dt className="text-xs font-medium text-slate-600">Hoy</dt>
            <dd className="ml-auto font-bold text-slate-900 tabular-nums">{conteos.pendientesHoy}</dd>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-500" />
            <dt className="text-xs font-medium text-amber-800">En viaje</dt>
            <dd className="ml-auto font-bold text-amber-900 tabular-nums">{conteos.enCurso}</dd>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            <dt className="text-xs font-medium text-emerald-800">Listos</dt>
            <dd className="ml-auto font-bold text-emerald-900 tabular-nums">{conteos.finalizados}</dd>
          </div>
        </dl>
      </div>

      {/* Filtros segmentados */}
      <div
        role="tablist"
        aria-label="Filtros de traslados"
        className="grid grid-cols-4 gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        {FILTROS.map((opcion) => {
          const activo = filtro === opcion.valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setFiltro(opcion.valor)}
              className={`flex h-11 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                activo
                  ? 'border border-blue-200 bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>
          Vista: <strong className="text-slate-900">{filtro.toUpperCase()}</strong>
        </span>
        <span className="tabular-nums">
          {visibles.length} de {conteos.total} viajes
        </span>
      </div>

      {traslados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <p className="text-base font-bold text-slate-800">
            Sin traslados programados
          </p>
          <p className="mt-1.5 text-sm text-slate-600">
            No hay visitas escolares confirmadas con colectivo TUP desde hoy ({hoyISO}).
          </p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">
            No hay viajes en la categoría «{filtro.toUpperCase()}»
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {filtro === 'hoy'
              ? 'No hay traslados TUP programados para hoy. Revisá PRÓXIMOS o TODOS.'
              : filtro === 'proximos'
                ? 'No hay traslados futuros pendientes.'
                : 'Todavía no hay viajes marcados como finalizados.'}
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
