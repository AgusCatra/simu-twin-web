import type { Metadata } from 'next';
import FormularioLogin from '@/components/auth/FormularioLogin';

export const metadata: Metadata = {
  title: 'Acceso restringido · Hub Simuladores',
  description: 'Acceso al panel de administración del Centro de Simuladores.',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 font-sans text-zinc-100">
      <div className="w-full max-w-md">
        <div className="mb-6 border-b border-zinc-800 pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
            HUB SIMULADORES // CENTRO DE SIMULADORES
          </p>
          <h1 className="mt-2 font-mono text-lg font-semibold uppercase tracking-[0.12em] text-zinc-100">
            ACCESO RESTRINGIDO // PANEL DE ADMINISTRACIÓN
          </h1>
        </div>

        <FormularioLogin />

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-600">
          USO EXCLUSIVO DE PERSONAL AUTORIZADO
        </p>
      </div>
    </main>
  );
}
