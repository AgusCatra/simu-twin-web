import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { obtenerAlumnosTurno } from '@/services/cabina';
import ConsolaTactil from '@/components/cabina/ConsolaTactil';
import BotonVolver from '@/components/ui/BotonVolver';

/**
 * /cabina/evaluacion — Consola Viva de Cabina (tablet táctil del instructor).
 *
 * Ruta raíz independiente de /admin: hereda solo el root layout, sin Sidebar
 * ni Topbar. Pantalla completa bg-zinc-950 para uso a una mano con pulgar.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Consola de Cabina · Hub Simuladores',
  description:
    'Consola táctil de evaluación en vivo de postulantes en cabina de simulador.',
};

export default async function CabinaEvaluacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const alumnos = await obtenerAlumnosTurno();
  const instructorDefault = user.email ?? '';

  return (
    <main className="flex min-h-dvh flex-col bg-zinc-950 font-mono text-zinc-100">
      <nav
        aria-label="Barra de control táctil superior"
        className="border-b border-zinc-800/80 bg-zinc-950/95 px-4 py-2.5"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2">
          <BotonVolver href="/admin" etiqueta="Volver al Panel" />
          <BotonVolver href="/gestion/cohortes" etiqueta="Cohortes" />
        </div>
      </nav>

      {alumnos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse"
          />
          <h1 className="text-lg font-semibold uppercase tracking-[0.18em] text-zinc-100">
            {'// CONSOLA DE CABINA'}
          </h1>
          <p className="max-w-sm text-xs uppercase leading-relaxed tracking-[0.12em] text-zinc-500">
            Sin cohorte activa o sin postulantes en la franja
          </p>
          <p className="max-w-sm text-[10px] uppercase tracking-[0.1em] text-zinc-600">
            Verifique en Empleo que exista una cohorte en estado ACTIVA con
            inscripciones disponibles, y recargue esta pantalla.
          </p>
        </div>
      ) : (
        <ConsolaTactil
          alumnos={alumnos}
          instructorDefault={instructorDefault}
        />
      )}
    </main>
  );
}
