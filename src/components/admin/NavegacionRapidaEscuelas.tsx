'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Package, Truck } from 'lucide-react';

const PESTAÑAS_OPERATIVAS = [
  { href: '/admin/visitas-educativas', label: 'Escuelas', icono: BookOpen },
  { href: '/admin/tup', label: 'Colectivo TUP', icono: Truck },
  { href: '/admin/insumos', label: 'Stock de Merienda', icono: Package },
] as const;

/**
 * Barra rápida de 1 clic para alternar entre Escuelas, Colectivo TUP y Stock.
 * Si el rol es chofer_tup (acceso exclusivo a TUP), no muestra las otras rutas.
 */
export default function NavegacionRapidaEscuelas({
  soloTup = false,
}: {
  soloTup?: boolean;
}) {
  const pathname = usePathname();
  if (soloTup) return null;

  return (
    <nav
      aria-label="Navegación rápida Escuelas, TUP y Stock"
      className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs"
    >
      {PESTAÑAS_OPERATIVAS.map((tab) => {
        const activa =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icono = tab.icono;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={activa ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
              activa
                ? 'border border-blue-200 bg-blue-50 text-blue-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icono size={16} aria-hidden />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
