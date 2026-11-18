import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Bus, GraduationCap, PackageCheck, School } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  obtenerEstadisticasGlobalesCentro,
  type EstadisticasGlobalesCentro,
} from '@/services/estadisticas-centro';
import TablaVisitasAdmin from '@/components/admin/visitas/TablaVisitasAdmin';
import BotonVolver from '@/components/ui/BotonVolver';
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

  const vh = estadisticas?.visitasHistoricas;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
            Gestión de Visitas Educativas (H4)
          </h2>
          <p className="mt-1 font-mono text-[11px] tracking-[0.1em] text-zinc-500">
            /ADMIN/VISITAS-EDUCATIVAS · SEGUIMIENTO OPERATIVO, ESTADOS Y NÓMINAS
          </p>
        </div>
        <BotonVolver href="/admin" etiqueta="Volver al Panel" />
      </div>

      {/* ── Resumen histórico real de Visitas, TUP y Stock ─────── */}
      {vh && (
        <div
          aria-label="Resumen histórico de visitas escolares"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
              <School size={12} className="text-sky-400" aria-hidden />
              COLEGIOS RECIBIDOS
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white">
              {vh.colegiosRecibidos}{' '}
              <span className="text-xs font-normal text-zinc-500">
                / {vh.colegiosTotalesNoCancelados} en agenda
              </span>
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              {vh.visitasRealizadas} visitas finalizadas ({vh.visitasActivas} no canceladas)
            </p>
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
              <GraduationCap size={12} className="text-emerald-400" aria-hidden />
              ALUMNOS ASISTIDOS
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white">
              {vh.alumnosAsistidosRealizados.toLocaleString('es-AR')}{' '}
              <span className="text-xs font-normal text-zinc-500">
                / {vh.alumnosProgramadosActivos.toLocaleString('es-AR')} prog.
              </span>
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              Según nómina o cupo confirmado
            </p>
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
              <Bus size={12} className="text-amber-400" aria-hidden />
              TRASLADOS TUP COMPLETADOS
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white">
              {vh.trasladosTupCompletados}
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              Servicios escolares con TUP finalizado
            </p>
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
              <PackageCheck size={12} className="text-cyan-400" aria-hidden />
              KITS ENTREGADOS (PAÑOL)
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-white">
              {vh.kitsCompletosEstimados.toLocaleString('es-AR')}
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              {vh.unidadesStockDescontadas.toLocaleString('es-AR')} unidades egresadas totales
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
