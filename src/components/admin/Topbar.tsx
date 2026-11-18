'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, ExternalLink, LogOut, ShieldCheck } from 'lucide-react';
import {
  esRutaActiva,
  obtenerRutaActiva,
  obtenerRutasVisiblesPorRol,
} from '@/components/admin/Sidebar';
import { ETIQUETA_ROL, type RolSistema } from '@/lib/auth/matriz-permisos';
import { createClient } from '@/lib/supabase/client';

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Formatea la fecha como "Viernes 11 sept, 12:45" usando locale argentino. */
function formatearReloj(fecha: Date): string {
  const parteFecha = capitalizar(
    new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    }).format(fecha)
  );
  const parteHora = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
  return `${parteFecha}, ${parteHora}`;
}

function RelojEnVivo() {
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    const sincronizar = () => setAhora(new Date());
    sincronizar();
    const intervalo = setInterval(sincronizar, 1000);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <time
      dateTime={ahora ? ahora.toISOString() : undefined}
      className="hidden text-xs font-medium text-slate-600 tabular-nums sm:inline"
    >
      {ahora ? formatearReloj(ahora) : '-- --, --:--'}
    </time>
  );
}

const ENLACE_MOVIL_BASE =
  'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors';
const ENLACE_MOVIL_ACTIVO =
  'border-blue-200 bg-blue-50 text-blue-700 font-semibold';
const ENLACE_MOVIL_INACTIVO =
  'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900';

export default function Topbar({
  rol = 'superadmin',
  usuarioEmail,
}: {
  rol?: RolSistema;
  usuarioEmail?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const seccion = obtenerRutaActiva(pathname)?.label ?? 'Panel de Gestión';
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const rutasVisibles = obtenerRutasVisiblesPorRol(rol);
  const modoLimpioChofer = rol === 'chofer_tup';

  async function cerrarSesion() {
    if (cerrandoSesion) return;
    setCerrandoSesion(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <header className="print-ocultar sticky top-0 z-20 border-b border-slate-200 bg-white shadow-2xs">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <nav aria-label="Ubicación actual" className="min-w-0">
          <ol className="flex items-center gap-2 text-sm text-slate-500">
            <li className="shrink-0 font-medium">
              {modoLimpioChofer ? 'Traslados TUP' : 'Centro de Simuladores'}
            </li>
            <li aria-hidden className="shrink-0 text-slate-400">
              <ChevronRight size={14} strokeWidth={2} />
            </li>
            <li className="truncate font-semibold text-slate-900">{seccion}</li>
          </ol>
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {!modoLimpioChofer && <RelojEnVivo />}
          {!modoLimpioChofer && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <span>Ver Web en Vivo</span>
              <ExternalLink size={13} strokeWidth={2} aria-hidden />
            </Link>
          )}
          <span
            title={usuarioEmail ?? undefined}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
          >
            <ShieldCheck size={13} aria-hidden />
            {ETIQUETA_ROL[rol]}
          </span>
          {!modoLimpioChofer && (
            <span className="hidden items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 sm:flex">
              <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
              En línea
            </span>
          )}
          <button
            type="button"
            onClick={() => void cerrarSesion()}
            disabled={cerrandoSesion}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut size={13} strokeWidth={2} aria-hidden />
            <span className={modoLimpioChofer ? 'inline' : 'hidden sm:inline'}>
              {cerrandoSesion ? 'Cerrando…' : 'Cerrar sesión'}
            </span>
          </button>
        </div>
      </div>

      {!modoLimpioChofer && (
        <nav
          aria-label="Secciones del panel"
          className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50/70 px-3 py-1.5 lg:hidden"
        >
          {rutasVisibles.map((ruta) => {
            const activa = esRutaActiva(pathname, ruta.href);
            const Icono = ruta.icono;
            return (
              <Link
                key={ruta.href}
                href={ruta.href}
                aria-current={activa ? 'page' : undefined}
                className={`${ENLACE_MOVIL_BASE} ${activa ? ENLACE_MOVIL_ACTIVO : ENLACE_MOVIL_INACTIVO}`}
              >
                <Icono size={14} strokeWidth={1.85} />
                <span className="whitespace-nowrap">{ruta.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
