import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Bus, GraduationCap, PackageCheck, School } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { obtenerEstadisticasGlobalesCentro, type EstadisticasGlobalesCentro } from '@/services/estadisticas-centro';
import NavegacionRapidaEscuelas from '@/components/admin/NavegacionRapidaEscuelas';
import TablaVisitasAdmin from '@/components/admin/visitas/TablaVisitasAdmin';
import type { Escuela, VisitaEducativa } from '@/types/visitas';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Escuelas y Visitas · Centro de Simuladores',
  description:
    'Gestión de reservas escolares, seguros, colectivo TUP, nóminas de alumnos y estados.',
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
  let estadisticas: EstadisticasGlobalesCentro | null = null;

  try {
    const [resVisitas, resEscuelas, resStats] = await Promise.all([
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
      obtenerEstadisticasGlobalesCentro(),
    ]);

    estadisticas = resStats;
    if (resVisitas.error || resEscuelas.error) {
      errorInicial = 'No se pudieron cargar las reservas escolares.';
    } else {
      visitasIniciales = resVisitas.data ?? [];
      escuelasIniciales = resEscuelas.data ?? [];
    }
  } catch {
    errorInicial = 'No fue posible establecer conexión con la base de datos.';
  }

  const vh = estadisticas?.visitasHistoricas;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Escuelas y Visitas Educativas
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Agenda escolar, confirmaciones, nómina de estudiantes y controles previos
          </p>
        </div>
        <NavegacionRapidaEscuelas />
      </div>

      {vh && (
        <div
          aria-label="Resumen histórico de visitas escolares"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <School size={14} className="text-blue-600" aria-hidden />
              Escuelas recibidas
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {vh.colegiosRecibidos}{' '}
              <span className="text-sm font-medium text-slate-500">
                / {vh.colegiosTotalesNoCancelados} en agenda
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {vh.visitasRealizadas} visitas finalizadas ({vh.visitasActivas} activas)
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <GraduationCap size={14} className="text-emerald-600" aria-hidden />
              Alumnos recibidos
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {vh.alumnosAsistidosRealizados.toLocaleString('es-AR')}{' '}
              <span className="text-sm font-medium text-slate-500">
                / {vh.alumnosProgramadosActivos.toLocaleString('es-AR')} prog.
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Total según nómina o reserva
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Bus size={14} className="text-amber-600" aria-hidden />
              Traslados TUP realizados
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {vh.trasladosTupCompletados}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Recorridos escolares completados
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <PackageCheck size={14} className="text-blue-600" aria-hidden />
              Refrigerios entregados
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {vh.kitsCompletosEstimados.toLocaleString('es-AR')}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {vh.unidadesStockDescontadas.toLocaleString('es-AR')} unidades egresadas
            </p>
          </div>
        </div>
      )}

      <TablaVisitasAdmin
        visitasIniciales={visitasIniciales}
        escuelasIniciales={escuelasIniciales}
        errorInicial={errorInicial}
      />
    </section>
  );
}
