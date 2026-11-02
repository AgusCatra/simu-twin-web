'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  ClipboardList,
  Cpu,
  ExternalLink,
  Server,
  Truck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export interface RutaAdmin {
  href: string;
  label: string;
  icono: LucideIcon;
}

/**
 * Mapa de navegación único del panel. Se comparte con el Topbar para
 * resolver el breadcrumb de la sección activa sin duplicar definiciones.
 */
export const RUTAS_ADMIN: readonly RutaAdmin[] = [
  { href: '/admin', label: 'Dashboard (En vivo)', icono: Activity },
  { href: '/admin/visitas-educativas', label: 'Visitas Educativas (H4)', icono: BookOpen },
  { href: '/admin/registro-actividades', label: 'Registro de Actividades', icono: ClipboardList },
  { href: '/admin/telemetria', label: 'Telemetría (Titán)', icono: Cpu },
  { href: '/admin/tup', label: 'Logística TUP', icono: Truck },
  { href: '/gestion/cohortes', label: 'Cohortes y Cabina (Empleo)', icono: UsersRound },
];

/** Determina si una ruta del menú corresponde al pathname actual. */
export function esRutaActiva(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Devuelve la definición de la sección activa según el pathname actual. */
export function obtenerRutaActiva(pathname: string): RutaAdmin | undefined {
  return RUTAS_ADMIN.find((ruta) => esRutaActiva(pathname, ruta.href));
}

const ENLACE_BASE =
  'relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors focus-visible:outline-1 focus-visible:outline-white';
const ENLACE_ACTIVO = 'bg-zinc-800 text-white';
const ENLACE_INACTIVO = 'text-zinc-400 hover:bg-zinc-900 hover:text-white';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-4">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-100"
        >
          <Server size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold tracking-[0.18em] text-white">
            HUB SIMULADORES
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.14em] text-zinc-500">
            CENTRO DE SIMULADORES · VT
          </p>
        </div>
      </div>

      <nav aria-label="Secciones del panel" className="flex-1 overflow-y-auto py-3">
        <p className="px-4 pb-2 font-mono text-[10px] tracking-[0.18em] text-zinc-600">
          OPERACIONES
        </p>
        <ul className="space-y-0.5 px-2">
          {RUTAS_ADMIN.map((ruta) => {
            const activa = esRutaActiva(pathname, ruta.href);
            const Icono = ruta.icono;
            return (
              <li key={ruta.href}>
                <Link
                  href={ruta.href}
                  aria-current={activa ? 'page' : undefined}
                  className={`${ENLACE_BASE} ${activa ? ENLACE_ACTIVO : ENLACE_INACTIVO}`}
                >
                  {activa && (
                    <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-white" />
                  )}
                  <Icono size={16} strokeWidth={1.75} className="shrink-0" />
                  <span className="truncate">{ruta.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-zinc-800 px-2 py-3">
        <Link
          href="/visitas"
          className="flex items-center gap-2 rounded-sm px-2 py-2 font-mono text-[11px] tracking-[0.1em] text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
        >
          <ExternalLink size={14} strokeWidth={1.75} />
          PORTAL PÚBLICO DE VISITAS
        </Link>
      </div>
    </aside>
  );
}
