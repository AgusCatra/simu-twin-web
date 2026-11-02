'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Sheet lateral derecho accesible (reemplazo sin dependencias del <Sheet> de
 * shadcn/ui: el proyecto no instala radix). role="dialog" aria-modal, cierre
 * con Escape y clic en el backdrop, foco inicial y final dentro del panel, y
 * Tab atrapado en el drawer mientras está abierto.
 * Estética industrial del proyecto: zinc plano, font-mono, rounded-sm.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}

const SELECTORES_ENFOCABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Sheet({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    const previamenteEnfocado = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function manejarKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCerrar();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const enfocables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(SELECTORES_ENFOCABLES)
      ).filter((el) => el.offsetParent !== null);
      if (enfocables.length === 0) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || activo === panelRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener('keydown', manejarKeydown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', manejarKeydown);
      document.body.style.overflow = originalOverflow;
      previamenteEnfocado?.focus?.();
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop: el clic cierra, pero el panel detiene la propagación. */}
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-black/70"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-mono text-xs tracking-[0.18em] text-white uppercase">
              {titulo}
            </h2>
            {subtitulo && (
              <p className="mt-0.5 truncate font-mono text-[10px] tracking-[0.12em] text-zinc-500">
                {subtitulo}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
