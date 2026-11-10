import Image from 'next/image';
import Navbar from '@/components/landing/Navbar';
import VisorNave3D from '@/components/gemelo/VisorNave3D';
import MetricasCentro from '@/components/landing/MetricasCentro';
import CarruselExperiencias from '@/components/landing/CarruselExperiencias';
import SeccionVisitas from '@/components/landing/SeccionVisitas';
import Footer from '@/components/landing/Footer';
import { createClient } from '@/lib/supabase/server';
import {
  esSimuladorSlug,
  mapearSimuladorDesdeDB,
  METADATA_BAHIAS,
  type FichaTecnicaSimulador,
  type SimuladorRowDB,
  type SimuladorSlug,
} from '@/types/gemelo';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Centro de Entrenamiento en Simuladores — Gobierno de Venado Tuerto',
  description:
    'Centro Municipal de Entrenamiento en Simuladores de Venado Tuerto. Formación técnica en maquinaria pesada, transporte de cargas y seguridad operacional.',
};

function construirRespaldoDesdeMetadata(): FichaTecnicaSimulador[] {
  return Object.values(METADATA_BAHIAS)
    .map((meta) => ({
      id: meta.slug,
      codigo: meta.codigoBahia,
      numeroPuesto: meta.numeroPuesto,
      nombre: meta.nombreFallback,
      tipo: meta.slug,
      estado: 'libre' as const,
      horasUsoTotales: 0,
      ultimoMantenimiento: null,
      actualizadoEl: null,
      actividadActualId: null,
      especificacionesHardware: meta.especificacionesHardware,
      modulosPedagogicos: meta.modulosPedagogicos,
      detalles: meta.detalles,
    }))
    .sort((a, b) => a.numeroPuesto - b.numeroPuesto);
}

export default async function Home() {
  const supabase = await createClient();

  const { data: filasRaw, error } = await supabase
    .from('simuladores')
    .select(
      'id, nombre, estado, horas_uso_totales, ultimo_mantenimiento, actualizado_el, actividad_actual_id'
    )
    .order('id', { ascending: true })
    .returns<SimuladorRowDB[]>();

  if (error) {
    console.error('[Home] Error al consultar tabla simuladores:', {
      code: error.code,
      message: error.message,
    });
  }

  const filasValidas = (filasRaw ?? []).filter(
    (fila): fila is SimuladorRowDB & { id: SimuladorSlug } => esSimuladorSlug(fila.id)
  );

  const simuladoresIniciales: FichaTecnicaSimulador[] =
    filasValidas.length > 0
      ? filasValidas
          .map(mapearSimuladorDesdeDB)
          .sort((a, b) => a.numeroPuesto - b.numeroPuesto)
      : construirRespaldoDesdeMetadata();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-[#0091B3]/20 selection:text-[#0091B3]">
      {/* 1. Barra de Navegación Institucional */}
      <Navbar />

      {/* Encabezado Institucional Previo al Visor */}
      <section className="w-full bg-slate-50 pt-10 pb-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#0091B3]/30 bg-[#0091B3]/10 px-3.5 py-1 sm:px-4 sm:py-1.5 text-[11px] sm:text-xs md:text-sm font-semibold text-[#0091B3] mb-3 shadow-xs max-w-full">
            <Image
              src="/images/icono-gobierno-vt.png"
              alt="Gobierno de Venado Tuerto"
              width={18}
              height={18}
              className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-xs object-contain shrink-0"
            />
            <span>
              SISTEMA MUNICIPAL DE SIMULACIÓN
              <span className="hidden sm:inline"> · GOBIERNO DE VENADO TUERTO</span>
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Centro de Entrenamiento en Simuladores
          </h1>
          <p className="mt-2 text-base sm:text-lg text-slate-600 max-w-3xl leading-relaxed">
            Tecnología aplicada a la formación laboral y seguridad en operaciones de maquinaria pesada. Gobierno de Venado Tuerto.
          </p>
        </div>
      </section>

      {/* 2. Bahía Técnica del Visor 3D con Gemelo Digital */}
      <section className="w-full bg-slate-50 pb-12 px-4 sm:px-6 lg:px-8">
        <div
          id="galpon-3d"
          className="relative w-full h-[520px] lg:h-[560px] bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-700 mx-auto max-w-7xl"
        >
          <VisorNave3D simuladoresIniciales={simuladoresIniciales} />
        </div>
      </section>

      {/* 3. Bloque de Métricas e Impacto */}
      <MetricasCentro />

      {/* 4. Carrusel de Experiencias Escolares */}
      <CarruselExperiencias />

      {/* 5. Circuito de Visitas Escolares y Portal de Seguimiento */}
      <SeccionVisitas />

      {/* 6. Pie de Página Institucional */}
      <Footer />
    </main>
  );
}
