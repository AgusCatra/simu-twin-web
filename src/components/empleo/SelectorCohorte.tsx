'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Loader2 } from 'lucide-react';
import type { CohorteResumen, EstadoCohorte } from '@/types/empleo';

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
  activa: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  finalizada: 'border-slate-200 bg-slate-100 text-slate-700',
  borrador: 'border-amber-200 bg-amber-50 text-amber-800',
};

export default function SelectorCohorte({
  cohortes,
  cohorteSeleccionadaId,
}: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  if (cohortes.length === 0) {
    return (
      <div className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500">
        <Layers size={14} strokeWidth={1.75} aria-hidden />
        <span>Sin cursos registrados</span>
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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-2xs">
      <label
        htmlFor="selector-cohorte-panel"
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"
      >
        {pendiente ? (
          <Loader2
            size={14}
            strokeWidth={2}
            className="animate-spin text-blue-600"
            aria-hidden
          />
        ) : (
          <Layers size={14} strokeWidth={1.75} className="text-slate-500" aria-hidden />
        )}
        Curso:
      </label>

      <select
        id="selector-cohorte-panel"
        aria-label="Seleccionar curso activo o histórico"
        disabled={pendiente}
        value={cohorteActual.id}
        onChange={(e) => manejarCambio(e.target.value)}
        className="min-h-[38px] max-w-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-wait disabled:opacity-60 sm:max-w-sm"
      >
        {cohortes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({ETIQUETA_ESTADO[c.estado]}) · {c.codigo}
          </option>
        ))}
      </select>

      <span
        className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${CLASE_BADGE_ESTADO[cohorteActual.estado]}`}
      >
        {ETIQUETA_ESTADO[cohorteActual.estado]}
      </span>
    </div>
  );
}
