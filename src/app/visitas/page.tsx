import type { Metadata } from 'next';
import FormularioVisita from '@/components/visitas/FormularioVisita';

export const metadata: Metadata = {
  title: 'Reserva de Visitas Educativas (H4)',
  description:
    'Formulario público para reservar visitas educativas al Centro Municipal de Simulación.',
};

export default function VisitasPage() {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 dark:bg-neutral-950 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
            Centro Municipal de Simulación - Reserva de Visitas Educativas (H4)
          </h1>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 sm:text-base">
            Complete el formulario para solicitar un turno de visita educativa con su institución.
            Verificaremos la disponibilidad y gestionaremos la póliza de seguro correspondiente.
          </p>
        </header>
        <FormularioVisita />
      </div>
    </main>
  );
}
