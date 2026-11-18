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
        className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-sky-500/40 bg-sky-950/35 px-2.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-sky-200"
      >
        <ShieldCheck size={12} aria-hidden />
        ROL: {ETIQUETA_ROL[rol]}
      </span>
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        disabled={cerrando}
        className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-3 font-mono text-[10px] tracking-[0.1em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-60"
      >
        <LogOut size={12} aria-hidden />
        {cerrando ? 'SALIENDO…' : 'SALIR'}
      </button>
    </div>
  );
}
