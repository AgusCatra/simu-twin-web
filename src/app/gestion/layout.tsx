import type { Metadata } from 'next';
import PanelLayoutShell from '@/components/admin/PanelLayoutShell';

export const metadata: Metadata = {
  title: 'Cursos y Alumnos · Centro de Simuladores',
  description:
    'Gestión de cursos, alumnos, turnos, reportes del simulador e informes para empresas.',
};

export default async function GestionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PanelLayoutShell>
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </PanelLayoutShell>
  );
}
