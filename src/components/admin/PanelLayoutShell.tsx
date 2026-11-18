import type { ReactNode } from 'react';
import { obtenerPerfilUsuarioActual } from '@/lib/auth/permisos';
import Sidebar from '@/components/admin/Sidebar';
import Topbar from '@/components/admin/Topbar';

export default async function PanelLayoutShell({
  children,
}: {
  children: ReactNode;
}) {
  const perfil = await obtenerPerfilUsuarioActual();
  const rol = perfil?.rol ?? 'superadmin';

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {rol !== 'chofer_tup' && <Sidebar rol={rol} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar rol={rol} usuarioEmail={perfil?.email ?? null} />
        <main className="flex-1 bg-slate-50 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
