import type { Metadata } from 'next';
import PanelLayoutShell from '@/components/admin/PanelLayoutShell';

export const metadata: Metadata = {
  title: 'Evaluar en Cabina / Patio · Centro de Simuladores',
  description:
    'Consola táctil para evaluación en simulador y práctica real en patio.',
};

export default async function CabinaLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <PanelLayoutShell>{children}</PanelLayoutShell>;
}
