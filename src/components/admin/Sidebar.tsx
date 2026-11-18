'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  ClipboardList,
  ExternalLink,
  Gauge,
  Package,
  Building2,
  ShieldCheck,
  Truck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  ETIQUETA_ROL,
  puedeAccederRuta,
  type RolSistema,
} from '@/lib/auth/matriz-permisos';

export interface RutaAdmin {
  href: string;
  label: string;
  icono: LucideIcon;
}

/**
 * Mapa de navegación único del panel interno. Se comparte con el Topbar y se
 * filtra automáticamente según el rol activo en sesión.
 */
export const RUTAS_ADMIN: readonly RutaAdmin[] = [
  { href: '/admin', label: 'Inicio del Centro', icono: Activity },
  { href: '/gestion/cohortes', label: 'Cursos y Alumnos', icono: UsersRound },
  { href: '/cabina/evaluacion', label: 'Evaluar en Cabina / Patio', icono: Gauge },
  { href: '/admin/visitas-educativas', label: 'Escuelas y Visitas', icono: BookOpen },
  { href: '/admin/tup', label: 'Colectivo TUP', icono: Truck },
  { href: '/admin/insumos', label: 'Stock y Refrigerios', icono: Package },
  { href: '/admin/registro-actividades', label: 'Bitácora y Simuladores', icono: ClipboardList },
];

export function obtenerRutasVisiblesPorRol(rol: RolSistema): RutaAdmin[] {
  return RUTAS_ADMIN.filter((ruta) => puedeAccederRuta(rol, ruta.href));
}

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
  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-blue-500';
const ENLACE_ACTIVO =
  'border-blue-200 bg-blue-50 text-blue-700 font-semibold shadow-2xs';
const ENLACE_INACTIVO =
  'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium';

export default function Sidebar({ rol = 'superadmin' }: { rol?: RolSistema }) {
  const pathname = usePathname();
  if (rol === 'chofer_tup') return null;

  const rutasVisibles = obtenerRutasVisiblesPorRol(rol);

  return (
    <aside className="print-ocultar hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700"
        >
          <Building2 size={20} strokeWidth={1.85} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-slate-900">
            Centro de Simuladores
          </p>
          <p className="truncate text-xs text-slate-500">
            Venado Tuerto
          </p>
        </div>
      </div>

      <div className="border-b border-slate-100 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          <ShieldCheck size={13} aria-hidden />
          {ETIQUETA_ROL[rol]}
        </span>
      </div>

      <nav aria-label="Secciones del panel" className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Menú principal
        </p>
        <ul className="space-y-1">
          {rutasVisibles.map((ruta) => {
            const activa = esRutaActiva(pathname, ruta.href);
            const Icono = ruta.icono;
            return (
              <li key={ruta.href}>
                <Link
                  href={ruta.href}
                  aria-current={activa ? 'page' : undefined}
                  className={`${ENLACE_BASE} ${activa ? ENLACE_ACTIVO : ENLACE_INACTIVO}`}
                >
                  <Icono
                    size={17}
                    strokeWidth={activa ? 2.1 : 1.75}
                    className={`shrink-0 ${activa ? 'text-blue-700' : 'text-slate-500'}`}
                  />
                  <span className="truncate">{ruta.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-200 p-3">
        <Link
          href="/visitas"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ExternalLink size={14} strokeWidth={1.85} />
          Portal público de visitas
        </Link>
      </div>
    </aside>
  );
}
