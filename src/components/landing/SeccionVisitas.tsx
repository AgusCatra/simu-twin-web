'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Bus,
  ShieldCheck,
  CalendarCheck,
  Search,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Monitor,
  Compass,
  HeartHandshake,
  Coffee,
} from 'lucide-react';

interface VisitaResultado {
  codigo: string;
  colegio: string;
  curso: string;
  cantAlumnos: number;
  fecha: string;
  horario: string;
  estadoSeguro: 'aprobado' | 'pendiente';
  transporteTUP: 'asignado' | 'pendiente';
  estadoVisita: 'confirmada' | 'en_revision';
}

const VISITAS_DEMO: Record<string, VisitaResultado> = {
  'ESC-2026-042': {
    codigo: 'ESC-2026-042',
    colegio: 'E.E.T.P. N° 483 "El Industrial"',
    curso: '5° Año · Especialidad Electromecánica',
    cantAlumnos: 28,
    fecha: 'Viernes 16 de Octubre de 2026',
    horario: '08:15 a 12:00 hs (Jornada Viernes)',
    estadoSeguro: 'aprobado',
    transporteTUP: 'asignado',
    estadoVisita: 'confirmada',
  },
  'ESC-2026-018': {
    codigo: 'ESC-2026-018',
    colegio: 'Colegio Superior N° 50',
    curso: '4° Año · Bachiller Técnico',
    cantAlumnos: 24,
    fecha: 'Viernes 23 de Octubre de 2026',
    horario: '08:15 a 12:00 hs (Jornada Viernes)',
    estadoSeguro: 'aprobado',
    transporteTUP: 'asignado',
    estadoVisita: 'confirmada',
  },
};

export default function SeccionVisitas() {
  const [codigoInput, setCodigoInput] = useState('');
  const [resultado, setResultado] = useState<VisitaResultado | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState(false);
  const [haBuscado, setHaBuscado] = useState(false);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    const codigoLimpio = codigoInput.trim().toUpperCase();
    setHaBuscado(true);

    if (VISITAS_DEMO[codigoLimpio]) {
      setResultado(VISITAS_DEMO[codigoLimpio]);
      setErrorBusqueda(false);
    } else {
      setResultado(null);
      setErrorBusqueda(true);
    }
  };

  return (
    <section
      id="visitas"
      className="relative w-full border-b border-slate-200 bg-slate-50 py-20 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Encabezado General */}
        <div className="mb-14 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#0091B3]/30 bg-[#0091B3]/10 px-3.5 py-1 sm:px-4 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-[#0091B3] mb-3 shadow-xs max-w-full">
            <Image
              src="/images/icono-gobierno-vt.png"
              alt="Gobierno de Venado Tuerto"
              width={16}
              height={16}
              className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-xs object-contain shrink-0"
            />
            <span>
              PROGRAMA EDUCATIVO MUNICIPAL<span className="hidden sm:inline"> · GOBIERNO DE VENADO TUERTO</span>
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Jornadas Escolares en el Centro de Simuladores
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
            Propuesta pedagógica, tecnológica y vocacional para contingentes de escuelas secundarias en articulación con el Parque Industrial.
          </p>
        </div>

        {/* Grilla en 2 Columnas */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* Columna 1: Tarjeta de Dinámica de la Jornada */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#0091B3]/10 border border-[#0091B3]/20 px-2.5 py-1 text-xs font-bold text-[#0091B3]">
                  <Clock className="h-3.5 w-3.5 text-[#0091B3]" />
                  Viernes de 08:15 a 12:00 hs
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  Parque Industrial La Victoria
                </span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                Dinámica de la Jornada Escolar
              </h3>

              {/* Traslado TUP */}
              <div className="mt-4 rounded-xl border border-[#3C8AC6]/30 bg-[#3C8AC6]/10 p-4 text-xs text-slate-800 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[#3C8AC6] text-white shrink-0 mt-0.5">
                  <Bus className="h-4 w-4" />
                </div>
                <div>
                  <strong className="text-slate-900 block mb-0.5">Coordinación de traslado en TUP (Transporte Urbano de Pasajeros):</strong>
                  salida 08:15 hs desde el punto acordado con la institución escolar hacia las instalaciones del Centro en el Parque Industrial.
                </div>
              </div>

              {/* Los 3 Bloques / Talleres */}
              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0091B3] text-white text-xs font-bold shrink-0 mt-0.5 shadow-xs">
                    <Monitor className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Bloque 1: Práctica Inmersiva en Cabinas de Simulación
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Primer contacto operativo en cabinas de simulación industrial, explorando mandos, nociones de maniobra y seguridad operacional.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0091B3] text-white text-xs font-bold shrink-0 mt-0.5 shadow-xs">
                    <Compass className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Bloque 2 (Intro Coaching): Taller &apos;Planificá tu Futuro y Toma de Decisiones&apos;
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Espacio guiado para reflexionar sobre proyectos vocacionales, transición al mundo laboral y toma de decisiones.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0091B3] text-white text-xs font-bold shrink-0 mt-0.5 shadow-xs">
                    <HeartHandshake className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Bloque 3 (Intro Coaching): Taller de Gestión Emocional
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Herramientas de autogestión, manejo de emociones y trabajo en equipo aplicadas a situaciones de estudio y trabajo.
                    </p>
                  </div>
                </div>

                {/* Espacio de Break y Convivencia */}
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl border border-amber-200/60 bg-amber-50/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white text-xs font-bold shrink-0 mt-0.5 shadow-xs">
                    <Coffee className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-950">
                      Espacio de Break y Convivencia
                    </h4>
                    <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                      Refrigerio compartido: se brinda jugo y colación/alfajor para estudiantes y docentes, con espacio disponible para compartir mate durante el receso.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Postulación */}
            <div className="mt-8 border-t border-slate-200 pt-6">
              <Link
                href="/visitas"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0091B3] hover:bg-[#007b99] text-white font-semibold py-3 px-6 transition-colors shadow-sm text-sm"
              >
                <span>Solicitar Turno para Escuelas (Viernes)</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="text-[11px] text-slate-500 mt-2">
                Coordinación pedagógica municipal articulada con la Secretaría de Desarrollo Productivo.
              </div>
            </div>
          </div>

          {/* Columna 2: Portal Docente (Buscador por código) */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0091B3] uppercase tracking-wider mb-2">
                <FileCheck className="h-4 w-4 text-[#0091B3]" />
                <span>Portal Docente</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                Consultar Estado de Turno Escolar
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Ingresá el código alfanumérico provisto al postular tu escuela para chequear la fecha confirmada, seguro y transporte TUP:
              </p>

              {/* Formulario de Consulta */}
              <form onSubmit={handleBuscar} className="mt-5 space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={codigoInput}
                    onChange={(e) => {
                      setCodigoInput(e.target.value);
                      setErrorBusqueda(false);
                    }}
                    placeholder="Ej: ESC-2026-042"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0091B3] focus:outline-none focus:ring-1 focus:ring-[#0091B3] shadow-sm uppercase tracking-wider"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-2 rounded-lg bg-[#0091B3] hover:bg-[#007b99] p-2 text-white transition"
                    title="Buscar código de visita"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </form>

              {/* Error si no encuentra */}
              {errorBusqueda && haBuscado && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Código no encontrado.</strong> Verifique el identificador asignado a su institución.
                  </div>
                </div>
              )}

              {/* Resultado de la Búsqueda */}
              {resultado && (
                <div className="mt-5 rounded-xl border border-[#0091B3]/30 bg-[#0091B3]/5 p-4 space-y-3 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-[#0091B3]/20 pb-2.5">
                    <span className="font-bold text-[#0091B3] text-sm">
                      {resultado.codigo}
                    </span>
                    <span className="rounded-full bg-[#0091B3]/10 border border-[#0091B3]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#0091B3] flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-[#0091B3]" />
                      VISITA CONFIRMADA
                    </span>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 text-sm">{resultado.colegio}</div>
                    <div className="text-slate-600 text-[11px]">{resultado.curso} · {resultado.cantAlumnos} estudiantes</div>
                  </div>

                  <div className="space-y-1.5 border-t border-[#0091B3]/20 pt-2 text-slate-700">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-3.5 w-3.5 text-[#0091B3] shrink-0" />
                      <span><strong>Fecha:</strong> {resultado.fecha}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-[#0091B3] shrink-0" />
                      <span><strong>Horario:</strong> {resultado.horario}</span>
                    </div>
                  </div>

                  {/* Estado de Requisitos */}
                  <div className="grid grid-cols-2 gap-2 border-t border-[#0091B3]/20 pt-2">
                    <div className="rounded-lg bg-white border border-slate-200 p-2 flex items-center gap-2 shadow-xs">
                      <Bus className="h-4 w-4 text-[#0091B3] shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-500">COLECTIVO TUP</div>
                        <div className="text-[11px] font-bold text-slate-800">Asignado (Salida 08:15 hs)</div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white border border-slate-200 p-2 flex items-center gap-2 shadow-xs">
                      <ShieldCheck className="h-4 w-4 text-[#0091B3] shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-500">SEGURO ESCOLAR</div>
                        <div className="text-[11px] font-bold text-[#0091B3]">Verificado</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Coordinación Pedagógica Municipal</span>
              <span className="font-semibold text-slate-700">Venado Tuerto</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
