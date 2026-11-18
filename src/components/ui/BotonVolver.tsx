'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Botón táctil reutilizable de retorno para vistas secundarias (altura mínima
 * de 44px para operación cómoda en tablets y teléfonos).
 */

export interface BotonVolverProps {
  href?: string;
  etiqueta?: string;
  className?: string;
}

const CLASES_BASE =
  'inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-500';

export default function BotonVolver({
  href = '/admin',
  etiqueta = 'Volver',
  className,
}: BotonVolverProps) {
  const destino = href || '/admin';
  const clases = className ? `${CLASES_BASE} ${className}` : CLASES_BASE;

  return (
    <Link href={destino} className={clases}>
      <ArrowLeft size={16} strokeWidth={2} aria-hidden className="shrink-0" />
      <span>{etiqueta}</span>
    </Link>
  );
}
