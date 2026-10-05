'use client';

import React from 'react';
import { Monitor, Clock, School, ShieldCheck, Activity } from 'lucide-react';

interface MetricaItem {
  id: string;
  valor: string;
  unidad?: string;
  titulo: string;
  subtitulo: string;
  descripcion: string;
  icono: React.ReactNode;
  badge: string;
  colorAcento: string;
}

const METRICAS: MetricaItem[] = [
  {
    id: 'puestos',
    valor: '7',
    titulo: 'Puestos de Simulación',
    subtitulo: 'Tecnología Etech y SimSpray VR',
    descripcion:
      'Equipos de alta fidelidad física con pantallas envolventes de 135°, volante industrial y cascos VR de última generación.',
    icono: <Monitor className="h-6 w-6 text-emerald-400" />,
    badge: 'Hardware Industrial',
    colorAcento: 'from-emerald-500/20 to-zinc-900',
  },
  {
    id: 'horas',
    valor: '+1.400',
    unidad: 'hs',
    titulo: 'Horas de Práctica',
    subtitulo: 'Capacitación operativa certificada',
    descripcion:
      'Horas acumuladas de maniobra efectiva en retroexcavadoras, grúas, autoelevadores y maquinaria pesada.',
    icono: <Clock className="h-6 w-6 text-teal-400" />,
    badge: 'Horas Certificadas',
    colorAcento: 'from-teal-500/20 to-zinc-900',
  },
  {
    id: 'escuelas',
    valor: '+40',
    titulo: 'Escuelas Técnicas',
    subtitulo: 'Visitas educativas y vocación',
    descripcion:
      'Instituciones educativas de nivel secundario y técnico que experimentan el circuito pedagógico de simulación.',
    icono: <School className="h-6 w-6 text-emerald-400" />,
    badge: 'Articulación Escolar',
    colorAcento: 'from-emerald-500/20 to-zinc-900',
  },
  {
    id: 'seguridad',
    valor: '0',
    titulo: 'Accidentes',
    subtitulo: 'Entrenamiento previo seguro',
    descripcion:
      'Entorno de aprendizaje de riesgo cero: los operarios cometen errores en simulación antes de subir a máquinas reales.',
    icono: <ShieldCheck className="h-6 w-6 text-amber-400" />,
    badge: 'Riesgo Cero',
    colorAcento: 'from-amber-500/20 to-zinc-900',
  },
];

export default function MetricasCentro() {
  return (
    <section
      id="metricas"
      className="relative w-full border-b border-zinc-800 bg-zinc-950 py-20 px-4 sm:px-6 lg:px-8 overflow-hidden"
    >
      {/* Fondo sutil con gradiente institucional esmeralda */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.08),rgba(255,255,255,0))]" />

      <div className="relative mx-auto max-w-7xl">
        {/* Encabezado de Sección */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-mono font-semibold text-emerald-400 mb-3">
            <Activity className="h-3.5 w-3.5" />
            <span>DATOS CLAVE // RENDIMIENTO OPERACIONAL</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Impacto del Centro de Simulación en la Formación Laboral
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed">
            Tecnología inmersiva aplicada a la seguridad de los trabajadores, la reducción de la huella de carbono y la inserción laboral calificada en Venado Tuerto.
          </p>
        </div>

        {/* Grilla de 4 Tarjetas Técnicas */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {METRICAS.map((m) => (
            <div
              key={m.id}
              className="relative flex flex-col justify-between rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 p-6 shadow-xl backdrop-blur transition hover:border-emerald-500/40 hover:shadow-2xl hover:-translate-y-1 duration-200"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 shadow-inner">
                    {m.icono}
                  </div>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400 rounded bg-zinc-800/60 px-2 py-0.5 border border-zinc-700/60">
                    {m.badge}
                  </span>
                </div>

                <div className="flex items-baseline gap-1 mt-2">
                  <span className="font-mono text-4xl sm:text-5xl font-black text-white tracking-tight">
                    {m.valor}
                  </span>
                  {m.unidad && (
                    <span className="font-mono text-sm text-zinc-400 font-bold">
                      {m.unidad}
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-zinc-100 mt-2">
                  {m.titulo}
                </h3>
                <div className="text-xs font-medium text-emerald-400/90 mt-0.5 font-mono">
                  {m.subtitulo}
                </div>
              </div>

              <p className="mt-4 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/80 pt-3">
                {m.descripcion}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
