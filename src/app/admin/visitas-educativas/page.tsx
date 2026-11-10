import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TablaVisitasAdmin from '@/components/admin/visitas/TablaVisitasAdmin';
import type { Escuela, VisitaEducativa } from '@/types/visitas';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Visitas Educativas (H4) · Hub Simuladores',
  description:
    'Gestión operativa de las reservas de visitas educativas: seguros, transporte TUP, facturas, Drive, nóminas y estados.',
};

export default async function VisitasEducativasAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  let visitasIniciales: VisitaEducativa[] = [];
  let escuelasIniciales: Escuela[] = [];
  let errorInicial: string | null = null;

  try {
    const [resVisitas, resEscuelas] = await Promise.all([
      supabase
        .from('visitas_educativas')
        .select('*')
        .order('fecha_visita', { ascending: false })
        .returns<VisitaEducativa[]>(),
      supabase
        .from('escuelas')
        .select('id, nombre_institucion, nombre_corto, direccion')
        .order('nombre_institucion', { ascending: true })
        .returns<Escuela[]>(),
    ]);

    if (resVisitas.error || resEscuelas.error) {
      errorInicial = 'No se pudieron cargar las reservas educativas.';
      console.error('[/admin/visitas-educativas] Error SSR al consultar datos:', {
        visitas: resVisitas.error?.message,
        escuelas: resEscuelas.error?.message,
      });
    } else {
      visitasIniciales = resVisitas.data ?? [];
      escuelasIniciales = resEscuelas.data ?? [];
    }
  } catch (err) {
    errorInicial = 'No fue posible establecer conexión con la base de datos.';
    console.error('[/admin/visitas-educativas] Error inesperado SSR:', {
      message: err instanceof Error ? err.message : 'Error desconocido',
    });
  }

  return (
    <section className="space-y-4">
      <div className="border-b border-zinc-800 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
          Gestión de Visitas Educativas (H4)
        </h2>
        <p className="mt-1 font-mono text-[11px] tracking-[0.1em] text-zinc-500">
          /ADMIN/VISITAS-EDUCATIVAS · SEGUIMIENTO OPERATIVO, ESTADOS Y NÓMINAS
        </p>
      </div>

      <TablaVisitasAdmin
        visitasIniciales={visitasIniciales}
        escuelasIniciales={escuelasIniciales}
        errorInicial={errorInicial}
      />
    </section>
  );
}
