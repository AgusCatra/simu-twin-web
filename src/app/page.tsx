import Navbar from '@/components/landing/Navbar';
import VisorNave3D, { SIMULADORES_DEFAULT } from '@/components/gemelo/VisorNave3D';
import MetricasCentro from '@/components/landing/MetricasCentro';
import SeccionVisitas from '@/components/landing/SeccionVisitas';
import Footer from '@/components/landing/Footer';

export const metadata = {
  title: 'Centro de Simuladores — Municipalidad de Venado Tuerto',
  description:
    'Centro Municipal de Entrenamiento en Maquinarias Pesadas y Simulación 3D. Capacitación para el empleo, seguridad laboral y visitas educativas escolares.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased selection:bg-amber-500/20 selection:text-amber-300">
      {/* 1. Barra de Navegación Institucional */}
      <Navbar />

      {/* 2. Hero SCADA 3D con Gemelo Digital y Drawer de Ficha Técnica */}
      <section
        id="galpon-3d"
        className="relative w-full h-[720px] border-b border-zinc-800 bg-zinc-950"
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
