import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { obtenerPerfilUsuarioActual, puedeAccederRuta } from '@/lib/auth/permisos';
import { obtenerAlumnosTurno } from '@/services/cabina';
import ConsolaTactil from '@/components/cabina/ConsolaTactil';

/**
 * /cabina/evaluacion — Evaluación en Cabina y Patio (tablet táctil del instructor).
 * Envuelta por src/app/cabina/layout.tsx con Sidebar + Topbar institucionales.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Evaluar en Cabina / Patio · Simu-Twin Venado Tuerto',
  description:
    'Consola táctil de evaluación en vivo en cabina de simulador y práctica en patio.',
};

export default async function CabinaEvaluacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const [alumnos, perfil] = await Promise.all([
    obtenerAlumnosTurno(),
    obtenerPerfilUsuarioActual(),
  ]);
  const rol = perfil?.rol ?? 'instructor';
  if (!puedeAccederRuta(rol, '/cabina/evaluacion')) {
    redirect('/admin');
  }
  const instructorDefault = user.email ?? '';

  return (
    <div className="flex flex-col">
      {alumnos.length === 0 ? (
        <div className="mx-auto my-8 flex w-full max-w-xl flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full bg-amber-500 animate-pulse"
          />
          <h1 className="text-lg font-bold text-slate-900">
            Evaluar en Cabina / Patio
          </h1>
          <p className="max-w-sm text-sm font-medium text-slate-700">
            Sin curso activo o sin alumnos habilitados en este turno.
          </p>
          <p className="max-w-sm text-xs leading-relaxed text-slate-500">
            Verificá en Cursos y Alumnos que exista un curso en estado Activo con alumnos inscriptos y recargá esta pantalla.
          </p>
        </div>
      ) : (
        <ConsolaTactil
          alumnos={alumnos}
          instructorDefault={instructorDefault}
        />
      )}
    </div>
  );
}
