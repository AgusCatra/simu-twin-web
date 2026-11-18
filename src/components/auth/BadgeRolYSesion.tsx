'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ETIQUETA_ROL, type RolSistema } from '@/lib/auth/matriz-permisos';

interface Props {
  rol: RolSistema;
  usuarioEmail?: string | null;
}

export default function BadgeRolYSesion({ rol, usuarioEmail }: Props) {
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
    <div className="flex flex-wrap items-center gap-2">
      <span
        title={usuarioEmail ?? undefined}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700"
      >
        <ShieldCheck size={13} aria-hidden />
        {ETIQUETA_ROL[rol]}
      </span>
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        disabled={cerrando}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
      >
        <LogOut size={13} aria-hidden />
        {cerrando ? 'Saliendo…' : 'Salir'}
      </button>
    </div>
  );
}
