'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Loader2 } from 'lucide-react';
import type { CohorteResumen, EstadoCohorte } from '@/types/empleo';

/**
 * Selector desplegable en cabecera para alternar entre la cohorte activa y
 * las cohortes históricas/borradores registradas, navegando mediante
 * `?cohorteId=<id>` para aislar estrictamente sus 16 postulantes y duplas.
 */

interface Props {
  cohortes: CohorteResumen[];
  cohorteSeleccionadaId: string | null;
}

const ETIQUETA_ESTADO: Record<EstadoCohorte, string> = {
  activa: 'Activa',
  finalizada: 'Histórica',
  borrador: 'Borrador',
};

const CLASE_BADGE_ESTADO: Record<EstadoCohorte, string> = {
  activa: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
  finalizada: 'border-zinc-700 bg-zinc-800/80 text-zinc-300',
  borrador: 'border-amber-500/40 bg-amber-950/40 text-amber-300',
};

export default function SelectorCohorte({
  cohortes,
  cohorteSeleccionadaId,
}: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  if (cohortes.length === 0) {
    return (
      <div className="inline-flex min-h-[44px] items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/70 px-3 font-mono text-[11px] text-zinc-500">
        <Layers size={14} strokeWidth={1.75} aria-hidden />
        <span>Cohorte: Sin cohortes registradas</span>
      </div>
    );
  }

  const cohorteActual =
    cohortes.find((c) => c.id === cohorteSeleccionadaId) ?? cohortes[0];

  function manejarCambio(nuevoId: string) {
    if (!nuevoId || nuevoId === cohorteActual.id) return;
    startTransition(() => {
      router.push(`/gestion/cohortes?cohorteId=${encodeURIComponent(nuevoId)}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950/90 px-2.5 py-1.5">
      <label
        htmlFor="selector-cohorte-panel"
        className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-400"
      >
        {pendiente ? (
          <Loader2
            size={13}
            strokeWidth={2}
            className="animate-spin text-emerald-400"
            aria-hidden
          />
        ) : (
          <Layers size={13} strokeWidth={1.75} className="text-zinc-400" aria-hidden />
        )}
        Cohorte:
      </label>

      <select
        id="selector-cohorte-panel"
        aria-label="Seleccionar cohorte activa o histórica"
        disabled={pendiente}
        value={cohorteActual.id}
        onChange={(e) => manejarCambio(e.target.value)}
        className="min-h-[40px] max-w-xs rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 transition-colors hover:border-zinc-500 focus:border-emerald-400 focus:outline-none disabled:cursor-wait disabled:opacity-60 sm:max-w-sm"
      >
        {cohortes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({ETIQUETA_ESTADO[c.estado]}) · {c.codigo}
          </option>
        ))}
      </select>

      <span
        className={`rounded-sm border px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] ${CLASE_BADGE_ESTADO[cohorteActual.estado]}`}
      >
        {ETIQUETA_ESTADO[cohorteActual.estado]}
      </span>
    </div>
  );
}
