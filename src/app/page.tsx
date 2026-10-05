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
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* 1. Barra de Navegación Institucional */}
      <Navbar />

      {/* Encabezado Institucional Previo al Visor */}
      <section className="w-full border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Centro de Entrenamiento en Simuladores
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-zinc-400 max-w-3xl leading-relaxed">
            Tecnología aplicada a la formación laboral y seguridad en operaciones de maquinaria pesada. Gobierno de Venado Tuerto.
          </p>
        </div>
      </section>

      {/* 2. Hero SCADA 3D con Gemelo Digital y Drawer de Ficha Técnica */}
      <section
        id="galpon-3d"
        className="relative w-full h-[520px] lg:h-[560px] border-b border-zinc-800 bg-[#111216]"
      >
        <VisorNave3D simuladoresIniciales={SIMULADORES_DEFAULT} />
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
