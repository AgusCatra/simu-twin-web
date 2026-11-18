import type { Metadata } from 'next';
import PanelLayoutShell from '@/components/admin/PanelLayoutShell';

export const metadata: Metadata = {
  title: 'Centro de Simuladores · Venado Tuerto',
  description:
    'Panel administrativo del Centro de Simuladores: escuelas, colectivo TUP, stock, cursos y evaluaciones.',
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <PanelLayoutShell>{children}</PanelLayoutShell>;
}
