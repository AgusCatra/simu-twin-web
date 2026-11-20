'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Botón de cierre de sesión reutilizable para pantallas públicas (ej.
 * /acceso-pendiente) donde todavía no hay un rol válido para mostrar el
 * badge completo de BadgeRolYSesion.
 */
export default function BotonCerrarSesion() {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);

  async function cerrarSesion() {
    if (cerrando) return;
    setCerrando(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={() => void cerrarSesion()}
      disabled={cerrando}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
    >
      <LogOut size={15} aria-hidden />
      {cerrando ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
