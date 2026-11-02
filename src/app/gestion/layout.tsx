import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gestión de Cohortes · Hub Simuladores',
  description:
    'Panel operativo del equipo de Empleo: configuración de cohorte, ranking de postulantes y parrilla de cabina.',
};

export default function GestionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-zinc-900 font-sans text-zinc-100">
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
