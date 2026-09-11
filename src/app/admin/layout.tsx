import type { Metadata } from 'next';
import Sidebar from '@/components/admin/Sidebar';
import Topbar from '@/components/admin/Topbar';

export const metadata: Metadata = {
  title: 'Hub Simuladores · Administración',
  description:
    'Panel de administración del Centro de Simuladores: visitas educativas, actividades, telemetría y flota.',
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 bg-zinc-900 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
