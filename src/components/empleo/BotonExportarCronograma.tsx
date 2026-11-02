'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, MessageCircle, Printer } from 'lucide-react';
import { generarTextoWhatsApp } from '@/lib/formato-cronograma';
import type { CohorteActiva, FranjaCabina } from '@/types/empleo';
import type { ProyeccionCronograma } from '@/lib/formato-cronograma';

/**
 * Botonera de exportación del Cronograma Oficial.
 * - COPIAR WHATSAPP: genera el texto con `generarTextoWhatsApp` y lo copia al
 *   portapapeles (con fallback para navegadores sin clipboard API), mostrando
 *   confirmación verde temporal.
 * - IMPRIMIR / PDF: lanza `window.print()`; los estilos @media print de
 *   globals.css ocultan el panel (`.print-ocultar`) y dejan solo la hoja
 *   membretada (`.hoja-cronograma`) que renderiza la página.
 */

interface Props {
  cohorte: CohorteActiva;
  franjas: FranjaCabina[];
  proyeccion: ProyeccionCronograma;
}

type EstadoCopiado = 'idle' | 'copiado' | 'error';

export default function BotonExportarCronograma({
  cohorte,
  franjas,
  proyeccion,
}: Props) {
  const [estado, setEstado] = useState<EstadoCopiado>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const resetearEstado = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setEstado('idle'), 2500);
  }, []);

  async function copiarWhatsApp() {
    const texto = generarTextoWhatsApp(cohorte, franjas, proyeccion);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
      } else {
        // Fallback: textarea temporal + execCommand (contextos no seguros).
        const area = document.createElement('textarea');
        area.value = texto;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-10000px';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (!ok) throw new Error('execCommand falló');
      }
      setEstado('copiado');
    } catch {
      setEstado('error');
    }
    resetearEstado();
  }

  function imprimir() {
    window.print();
  }

  const copiado = estado === 'copiado';
  const error = estado === 'error';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copiarWhatsApp}
        aria-live="polite"
        className={`flex h-9 items-center gap-2 rounded-sm border px-3 font-mono text-[10px] tracking-[0.14em] transition-colors focus-visible:outline-1 focus-visible:outline-white ${
          copiado
            ? 'border-emerald-500 bg-emerald-500 font-semibold text-emerald-950'
            : error
              ? 'border-red-500 bg-red-500/10 text-red-300'
              : 'border-emerald-500/60 text-emerald-400 hover:border-emerald-500 hover:bg-emerald-500/10'
        }`}
      >
        {copiado ? (
          <Check size={13} strokeWidth={2} aria-hidden />
        ) : (
          <MessageCircle size={13} strokeWidth={1.75} aria-hidden />
        )}
        {copiado
          ? '✓ COPIADO AL PORTAPAPELES'
          : error
            ? 'NO SE PUDO COPIAR'
            : 'COPIAR WHATSAPP'}
      </button>

      <button
        type="button"
        onClick={imprimir}
        className="flex h-9 items-center gap-2 rounded-sm border border-zinc-700 px-3 font-mono text-[10px] tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white focus-visible:outline-1 focus-visible:outline-white"
      >
        <Printer size={13} strokeWidth={1.75} aria-hidden />
        IMPRIMIR / PDF
      </button>
    </div>
  );
}
