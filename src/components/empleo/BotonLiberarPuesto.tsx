'use client';

import { useState, useTransition } from 'react';
import { XCircle } from 'lucide-react';
import { darDeBajaPostulante } from '@/services/empleo';

/**
 * Botón de liberación de un puesto de cabina: pide motivo y ejecuta la baja
 * (franja_id=NULL, estado=DESCARTADO) vía Server Action. Cliente mínimo para
 * que la ParrillaCabina pueda seguir siendo Server Component.
 */
export default function BotonLiberarPuesto({
  inscripcionId,
  nombrePostulante,
}: {
  inscripcionId: string;
  nombrePostulante: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function liberar() {
    const motivo = window.prompt(
      `Motivo de baja de ${nombrePostulante} (obligatorio):`,
      'Liberado desde la parrilla de cabina'
    );
    if (motivo === null) return;
    setError(null);
    startTransition(async () => {
      const res = await darDeBajaPostulante(inscripcionId, motivo);
      if (!res.ok) setError(res.error ?? 'No se pudo liberar el puesto');
    });
  }

  return (
    <span className="flex items-center gap-1">
      {error && (
        <span role="alert" className="text-xs font-medium text-rose-700">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={liberar}
        disabled={isPending}
        aria-label={`Liberar puesto de ${nombrePostulante}`}
        title="Liberar puesto (dar de baja)"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed"
      >
        <XCircle size={15} strokeWidth={1.75} />
      </button>
    </span>
  );
}
