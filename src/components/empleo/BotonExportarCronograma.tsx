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
        className={`flex h-10 items-center gap-2 rounded-lg border px-3.5 text-xs font-semibold transition-colors ${
          copiado
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : error
              ? 'border-rose-300 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        }`}
      >
        {copiado ? (
          <Check size={14} strokeWidth={2} aria-hidden />
        ) : (
          <MessageCircle size={14} strokeWidth={1.85} aria-hidden />
        )}
        {copiado
          ? 'Copiado al portapapeles'
          : error
            ? 'No se pudo copiar'
            : 'Copiar WhatsApp'}
      </button>

      <button
        type="button"
        onClick={imprimir}
        className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Printer size={14} strokeWidth={1.85} aria-hidden />
        Imprimir / PDF
      </button>
    </div>
  );
}
