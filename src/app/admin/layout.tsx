import type { Metadata } from 'next';
import { obtenerPerfilUsuarioActual } from '@/lib/auth/permisos';
import Sidebar from '@/components/admin/Sidebar';
import Topbar from '@/components/admin/Topbar';

export const metadata: Metadata = {
  title: 'Hub Simuladores · Administración',
  description:
    'Panel de administración del Centro de Simuladores: visitas educativas, actividades, telemetría y flota.',
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const perfil = await obtenerPerfilUsuarioActual();
  const rol = perfil?.rol ?? 'superadmin';

  return (
    <div className="flex min-h-screen bg-zinc-950 font-sans text-zinc-100">
      {rol !== 'chofer_tup' && <Sidebar rol={rol} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar rol={rol} usuarioEmail={perfil?.email ?? null} />
        <main className="flex-1 bg-zinc-900 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
