'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Quote, School, Calendar, Sparkles } from 'lucide-react';

export interface ExperienciaEscolar {
  id: string;
  escuela: string;
  orientacion: string;
  fecha: string;
  imagenUrl: string;
  testimonio: string;
}

const EXPERIENCIAS_DEMO: ExperienciaEscolar[] = [
  {
    id: 'exp-1',
    escuela: 'E.E.T.P. N° 483 "El Industrial"',
    orientacion: '5° Año · Especialidad Electromecánica',
    fecha: 'Octubre 2026',
    imagenUrl: '/images/experiencias/eetp-483.svg',
    testimonio:
      'Poder subir a la cabina de excavadora y sentir el tacto real de las palancas y la física del suelo nos cambió totalmente la perspectiva de lo que vemos en el taller técnico de la escuela.',
  },
  {
    id: 'exp-2',
    escuela: 'Colegio Superior N° 50 "Gral. San Martín"',
    orientacion: '4° Año · Bachiller Técnico',
    fecha: 'Septiembre 2026',
    imagenUrl: '/images/experiencias/colegio-50.svg',
    testimonio:
      'El taller de coaching y toma de decisiones nos ayudó un montón a pensar qué hacer cuando terminemos la secundaria. Fue una jornada completísima junto al traslado en TUP y el break con mate compartido.',
  },
  {
    id: 'exp-3',
    escuela: 'E.E.S.O. N° 206 "Rosa Turner de Estrugamou"',
    orientacion: '5° Año · Economía y Gestión',
    fecha: 'Septiembre 2026',
    imagenUrl: '/images/experiencias/eeso-206.svg',
    testimonio:
      'Para muchos fue la primera vez conociendo las instalaciones del Parque Industrial. Las dinámicas de gestión de emociones sumadas a la práctica en los simuladores crearon un espacio de aprendizaje y convivencia muy valioso.',
  },
];

export default function CarruselExperiencias({
  experiencias = EXPERIENCIAS_DEMO,
}: {
  experiencias?: ExperienciaEscolar[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!experiencias || experiencias.length === 0) {
    return null;
  }

  const prev = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? experiencias.length - 1 : prevIndex - 1
    );
  };

  const next = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex === experiencias.length - 1 ? 0 : prevIndex + 1
    );
  };

  const actual = experiencias[currentIndex];

  return (
    <section
      id="experiencias"
      className="w-full bg-slate-50 py-16 border-b border-slate-200"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Encabezado */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#0091B3]/30 bg-[#0091B3]/10 px-3.5 py-1 sm:px-4 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-[#0091B3] mb-3 shadow-xs max-w-full">
            <Image
              src="/images/icono-gobierno-vt.png"
              alt="Gobierno de Venado Tuerto"
              width={16}
              height={16}
              className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-xs object-contain shrink-0"
            />
            <span>
              EXPERIENCIAS EN PRIMERA PERSONA<span className="hidden sm:inline"> · GOBIERNO DE VENADO TUERTO</span>
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Las Escuelas en el Centro de Entrenamiento
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
            Estudiantes y docentes compartiendo las jornadas de simulación, dinámicas de coaching y orientación vocacional.
          </p>
        </div>

        {/* Tarjeta de Experiencia con Aspecto 16:9 */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300">
            {/* Fotografía con Aspecto 16:9 */}
            <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
              <Image
                src={actual.imagenUrl}
                alt={actual.escuela}
                fill
                className="object-cover"
                priority
              />
              <div className="absolute top-4 left-4 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-xs font-semibold border border-white/10 shadow-sm">
                  <School className="h-3.5 w-3.5 text-[#6EC1E4]" />
                  {actual.escuela}
                </span>
              </div>
              <div className="absolute bottom-4 right-4 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-slate-200 text-xs font-medium border border-white/10 shadow-sm">
                  <Calendar className="h-3.5 w-3.5 text-[#0091B3]" />
                  {actual.fecha}
                </span>
              </div>
            </div>

            {/* Testimonio en Comillas y Pie */}
            <div className="p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <Quote className="h-8 w-8 text-[#0091B3] shrink-0 opacity-80" />
                <blockquote className="text-slate-700 italic text-sm sm:text-base leading-relaxed">
                  &ldquo;{actual.testimonio}&rdquo;
                </blockquote>
              </div>

              {/* Pie de Tarjeta con Institución y Badge Turquesa */}
              <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">
                    {actual.escuela}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {actual.orientacion}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-[#0091B3]/10 border border-[#0091B3]/20 px-3 py-1 text-xs font-bold text-[#0091B3]">
                  <Sparkles className="h-3.5 w-3.5 text-[#0091B3]" />
                  Jornada de Viernes
                </span>
              </div>
            </div>
          </div>

          {/* Controles: Botones Anterior / Siguiente y Dots */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={prev}
              aria-label="Experiencia anterior"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:border-[#0091B3] hover:text-[#0091B3] shadow-sm transition active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              {experiencias.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Ir a experiencia ${idx + 1}`}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    idx === currentIndex
                      ? 'w-8 bg-[#0091B3]'
                      : 'w-2.5 bg-slate-300 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={next}
              aria-label="Siguiente experiencia"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:border-[#0091B3] hover:text-[#0091B3] shadow-sm transition active:scale-95 cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
