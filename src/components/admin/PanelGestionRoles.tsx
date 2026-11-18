'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Shield, UserCog } from 'lucide-react';
import { cambiarRolUsuarioAction } from '@/actions/rbac';
import {
  ETIQUETA_ROL,
  ROLES_SISTEMA,
  type PerfilUsuario,
  type RolSistema,
} from '@/lib/auth/matriz-permisos';

interface Props {
  usuariosIniciales: PerfilUsuario[];
  usuarioActualId: string;
}

export default function PanelGestionRoles({
  usuariosIniciales,
  usuarioActualId,
}: Props) {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>(usuariosIniciales);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null
  );
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function manejarCambioRol(usuario: PerfilUsuario, nuevoRol: RolSistema) {
    if (nuevoRol === usuario.rol) return;
    setFeedback(null);
    setGuardandoId(usuario.id);

    startTransition(async () => {
      const res = await cambiarRolUsuarioAction({
        user_id: usuario.id,
        nuevo_rol: nuevoRol,
        email: usuario.email,
        nombre_completo: usuario.nombre_completo,
      });
      setGuardandoId(null);

      if (!res.ok) {
        setFeedback({ tipo: 'error', texto: res.error });
        return;
      }

      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuario.id
            ? { ...u, rol: nuevoRol, esFallbackFailSafe: false }
            : u
        )
      );
      setFeedback({
        tipo: 'ok',
        texto: `Rol de ${usuario.email} actualizado a ${ETIQUETA_ROL[nuevoRol]}.`,
      });
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Gestión de roles RBAC del sistema"
      className="rounded-sm border border-zinc-800 bg-zinc-950"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100">
            <UserCog size={14} className="text-sky-400" aria-hidden />
            CONTROL DE ROLES Y PERMISOS (RBAC) · SUPERADMIN
          </h2>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-zinc-500">
            PUBLIC.PERFILES_USUARIOS · ASIGNACIÓN INMEDIATA DE ACCESOS POR MÓDULO
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] text-zinc-300">
          <Shield size={11} className="text-emerald-400" aria-hidden />
          {usuarios.length} USUARIOS
        </span>
      </div>

      {feedback && (
        <div
          role={feedback.tipo === 'error' ? 'alert' : 'status'}
          className={`mx-4 mt-3 flex items-center gap-2 rounded-sm border px-3 py-2 font-mono text-[11px] ${
            feedback.tipo === 'ok'
              ? 'border-emerald-700/60 bg-emerald-950/35 text-emerald-200'
              : 'border-rose-800/70 bg-rose-950/40 text-rose-200'
          }`}
        >
          {feedback.tipo === 'ok' && <CheckCircle2 size={13} aria-hidden />}
          <span>{feedback.texto}</span>
        </div>
      )}

      <div className="divide-y divide-zinc-800/80 p-2">
        {usuarios.map((u) => {
          const esPropio = u.id === usuarioActualId;
          const cargando = guardandoId === u.id;

          return (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 px-2 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {u.nombre_completo}{' '}
                  {esPropio && (
                    <span className="ml-1 rounded-sm border border-emerald-500/40 bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                      TÚ
                    </span>
                  )}
                  {u.esFallbackFailSafe && (
                    <span className="ml-1 rounded-sm border border-amber-500/40 bg-amber-950/35 px-1.5 py-0.5 font-mono text-[9px] text-amber-300">
                      FAIL-SAFE
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[11px] text-zinc-400">
                  {u.email}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  aria-label={`Rol de ${u.email}`}
                  value={u.rol}
                  disabled={cargando || esPropio}
                  onChange={(e) =>
                    manejarCambioRol(u, e.target.value as RolSistema)
                  }
                  className="h-9 rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ROLES_SISTEMA.map((r) => (
                    <option key={r} value={r}>
                      {ETIQUETA_ROL[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
