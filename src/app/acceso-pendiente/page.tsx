import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BotonCerrarSesion from '@/components/auth/BotonCerrarSesion';

/**
 * Pantalla de destino para una cuenta autenticada que todavía no tiene un rol
 * asignado en `perfiles_usuarios` (FIX SEC-1: reemplaza el fail-safe que
 * promovía a 'superadmin' por defecto). Un superadmin le asigna el rol desde
 * el panel de Usuarios y Permisos en /admin, y recién ahí la cuenta puede
 * entrar a /admin, /cabina o /gestion.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Acceso pendiente · SimuCore Twin',
};

export default async function AccesoPendientePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 font-sans">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">
          Tu cuenta todavía no tiene acceso asignado
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {user.email} ya se registró correctamente en Supabase, pero ningún
          superadmin le asignó todavía un rol dentro del sistema. Pedile a un
          administrador del Centro de Simuladores que te asigne un perfil desde
          el panel de Usuarios y Permisos.
        </p>
        <div className="mt-5 flex justify-center">
          <BotonCerrarSesion />
        </div>
      </div>
    </main>
  );
}
