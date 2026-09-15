'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, LogOut } from 'lucide-react';
import { RUTAS_ADMIN, esRutaActiva, obtenerRutaActiva } from '@/components/admin/Sidebar';
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
      className="hidden font-mono text-xs tracking-[0.08em] text-zinc-300 sm:inline"
    >
      {ahora ? formatearReloj(ahora) : '-- --, --:--'}
    </time>
  );
}

const ENLACE_MOVIL_BASE =
  'flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1.5 font-mono text-[11px] tracking-[0.06em] transition-colors';
const ENLACE_MOVIL_ACTIVO = 'bg-zinc-800 text-white';
const ENLACE_MOVIL_INACTIVO = 'text-zinc-500 hover:bg-zinc-900 hover:text-white';

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const seccion = obtenerRutaActiva(pathname)?.label ?? 'Panel';
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

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
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <nav aria-label="Ubicación actual" className="min-w-0">
          <ol className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-zinc-500">
            <li className="shrink-0">ADMIN</li>
            <li aria-hidden className="shrink-0">
              <ChevronRight size={12} strokeWidth={2} />
            </li>
            <li className="truncate text-zinc-100">{seccion.toUpperCase()}</li>
          </ol>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <RelojEnVivo />
          <span className="hidden items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-zinc-300 sm:flex">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            SISTEMA OPERATIVO
          </span>
          <button
            type="button"
            onClick={() => void cerrarSesion()}
            disabled={cerrandoSesion}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex shrink-0 items-center gap-1.5 rounded-sm border border-zinc-800 px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 sm:px-2.5"
          >
            <LogOut size={12} strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">
              {cerrandoSesion ? 'CERRANDO…' : 'CERRAR SESIÓN'}
            </span>
          </button>
        </div>
      </div>

      <nav
        aria-label="Secciones del panel"
        className="flex gap-1 overflow-x-auto border-t border-zinc-800 px-2 py-1.5 lg:hidden"
      >
        {RUTAS_ADMIN.map((ruta) => {
          const activa = esRutaActiva(pathname, ruta.href);
          const Icono = ruta.icono;
          return (
            <Link
              key={ruta.href}
              href={ruta.href}
              aria-current={activa ? 'page' : undefined}
              className={`${ENLACE_MOVIL_BASE} ${activa ? ENLACE_MOVIL_ACTIVO : ENLACE_MOVIL_INACTIVO}`}
            >
              <Icono size={13} strokeWidth={1.75} />
              <span className="whitespace-nowrap">{ruta.label.toUpperCase()}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
