import Navbar from '@/components/landing/Navbar';
import VisorNave3D, { SIMULADORES_DEFAULT } from '@/components/gemelo/VisorNave3D';
import MetricasCentro from '@/components/landing/MetricasCentro';
import SeccionVisitas from '@/components/landing/SeccionVisitas';
import Footer from '@/components/landing/Footer';

export const metadata = {
  title: 'Centro de Entrenamiento en Simuladores — Gobierno de Venado Tuerto',
  description:
    'Centro Municipal de Entrenamiento en Simuladores de Venado Tuerto. Formación técnica en maquinaria pesada, transporte de cargas y seguridad operacional.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-emerald-500/20 selection:text-emerald-800">
      {/* 1. Barra de Navegación Institucional */}
      <Navbar />

      {/* Encabezado Institucional Previo al Visor */}
      <section className="w-full bg-slate-50 pt-10 pb-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-semibold text-emerald-800 mb-3">
            <span>SISTEMA MUNICIPAL DE SIMULACIÓN</span>
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
          <VisorNave3D simuladoresIniciales={SIMULADORES_DEFAULT} />
        </div>
      </section>

      {/* 3. Bloque de Métricas e Impacto */}
      <MetricasCentro />

      {/* 4. Circuito de Visitas Escolares y Portal de Seguimiento */}
      <SeccionVisitas />

      {/* 5. Pie de Página Institucional */}
      <Footer />
    </main>
  );
}
