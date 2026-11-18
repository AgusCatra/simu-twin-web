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
        texto: `Permisos de ${usuario.email} actualizados a ${ETIQUETA_ROL[nuevoRol]}.`,
      });
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Usuarios y permisos"
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <UserCog size={18} className="text-blue-600" aria-hidden />
            Usuarios y Permisos
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Asigná el perfil de acceso de cada integrante del centro.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          <Shield size={13} className="text-emerald-600" aria-hidden />
          {usuarios.length} usuarios
        </span>
      </div>

      {feedback && (
        <div
          role={feedback.tipo === 'error' ? 'alert' : 'status'}
          className={`mx-5 mt-4 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium ${
            feedback.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.tipo === 'ok' && <CheckCircle2 size={16} aria-hidden />}
          <span>{feedback.texto}</span>
        </div>
      )}

      <div className="divide-y divide-slate-100 px-5 py-2">
        {usuarios.map((u) => {
          const esPropio = u.id === usuarioActualId;
          const cargando = guardandoId === u.id;

          return (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {u.nombre_completo}{' '}
                  {esPropio && (
                    <span className="ml-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Tu cuenta
                    </span>
                  )}
                  {u.esFallbackFailSafe && (
                    <span className="ml-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Sin asignar
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-slate-600">{u.email}</p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  aria-label={`Rol de ${u.email}`}
                  value={u.rol}
                  disabled={cargando || esPropio}
                  onChange={(e) =>
                    manejarCambioRol(u, e.target.value as RolSistema)
                  }
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
