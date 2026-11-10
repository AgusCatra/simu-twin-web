'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Botón táctil reutilizable de retorno para vistas secundarias (altura mínima
 * de 44px para operación cómoda en tablets y teléfonos).
 */

export interface BotonVolverProps {
  href?: string; // Ruta de retorno por defecto (default: '/admin')
  etiqueta?: string; // Texto a mostrar (default: 'Volver')
  className?: string;
}

const CLASES_BASE =
  'inline-flex min-h-[44px] items-center gap-2 px-3.5 py-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-sm font-medium border border-zinc-700/60 transition-colors shadow-sm focus-visible:outline-1 focus-visible:outline-white';

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
