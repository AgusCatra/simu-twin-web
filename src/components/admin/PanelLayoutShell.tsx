import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { obtenerPerfilUsuarioActual } from '@/lib/auth/permisos';
import Sidebar from '@/components/admin/Sidebar';
import Topbar from '@/components/admin/Topbar';

export default async function PanelLayoutShell({
  children,
}: {
  children: ReactNode;
}) {
  const perfil = await obtenerPerfilUsuarioActual();
  // FIX SEC-1: antes, sin perfil (ej. un error transitorio al leer la fila)
  // este shell mostraba el panel entero como si el usuario fuera superadmin.
  // El middleware ya debería haber filtrado esto antes de llegar acá, pero
  // esta es la segunda capa: sin perfil válido, no se renderiza nada del
  // panel.
  if (!perfil) {
    redirect('/acceso-pendiente');
  }
  const rol = perfil.rol;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {rol !== 'chofer_tup' && <Sidebar rol={rol} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar rol={rol} usuarioEmail={perfil.email} />
        <main className="flex-1 bg-slate-50 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
