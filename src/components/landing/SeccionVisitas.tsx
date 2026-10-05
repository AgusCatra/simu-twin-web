'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  Bus,
  ShieldCheck,
  CalendarCheck,
  Search,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck,
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
    fecha: 'Jueves 15 de Octubre de 2026',
    horario: '09:00 a 10:30 hs (Turno Mañana)',
    estadoSeguro: 'aprobado',
    transporteTUP: 'asignado',
    estadoVisita: 'confirmada',
  },
  'ESC-2026-018': {
    codigo: 'ESC-2026-018',
    colegio: 'Colegio Superior N° 50',
    curso: '4° Año · Bachiller Técnico',
    cantAlumnos: 24,
    fecha: 'Martes 20 de Octubre de 2026',
    horario: '14:00 a 15:30 hs (Turno Tarde)',
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
      className="relative w-full border-b border-zinc-800 bg-zinc-950 py-20 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Encabezado General */}
        <div className="mb-14 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-mono font-semibold text-emerald-400 mb-3">
            <GraduationCap className="h-3.5 w-3.5" />
            <span>PROGRAMA EDUCATIVO MUNICIPAL</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Visitas Escolares y Formación Vocacional
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed">
            Acercamos a estudiantes secundarios de Venado Tuerto y la región a la tecnología de maquinarias pesadas y logística moderna.
          </p>
        </div>

        {/* Grilla en 2 Columnas */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* Columna 1: Solicitud de Turno Escolar y Circuito de 90 Minutos */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur shadow-xl">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider mb-2">
                <Clock className="h-4 w-4" />
                <span>Circuito Pedagógico Guiado (90 minutos)</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                ¿Cómo es la experiencia para colegios y escuelas técnicas?
              </h3>
              <p className="mt-3 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Cada contingente escolar es recibido por instructores especializados en un recorrido dinámico diseñado para orientar vocaciones y desmitificar el manejo de maquinaria pesada:
              </p>

              {/* Fases del circuito */}
              <div className="mt-6 space-y-3.5">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">
                      Inducción y Seguridad Operacional (15 min)
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Uso de EPP, delimitación de líneas amarillas de seguridad, señalética y prevención de accidentes en obras y depósitos.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">
                      Práctica en Cabinas de Maquinaria Pesada (50 min)
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Rotación guiada por autoelevador, pala cargadora, retroexcavadora y camión con simuladores de inercia y física real.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">
                      Estación SimSpray Realidad Virtual (15 min)
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Práctica con pistola aerográfica física y casco VR, midiendo en tiempo real el espesor y la técnica de pintura.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">
                      Cierre y Orientación Laboral Municipal (10 min)
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Presentación de cursos con salida laboral, articulación con empresas del sector productivo y preguntas abiertas.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Postulación */}
            <div className="mt-8 border-t border-zinc-800/80 pt-6">
              <Link
                href="/visitas"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-xs sm:text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 transition active:scale-98"
              >
                <span>Solicitar Turno para Institución Educativa</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="text-[11px] text-zinc-500 mt-2 font-mono">
                Transporte escolar municipal (TUP) gratuito incluido para escuelas de Venado Tuerto.
              </div>
            </div>
          </div>

          {/* Columna 2: Seguimiento de Visita con Código */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 sm:p-8 backdrop-blur shadow-xl">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                <FileCheck className="h-4 w-4" />
                <span>Portal Docente</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Consultar Estado de Turno Escolar
              </h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
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
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-sm font-mono text-white placeholder-zinc-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 shadow-inner uppercase tracking-wider"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 p-2 text-zinc-950 transition"
                    title="Buscar código de visita"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </form>

              {/* Error si no encuentra */}
              {errorBusqueda && haBuscado && (
                <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/20 p-3.5 text-xs text-rose-300 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Código no encontrado.</strong> Verifique el identificador asignado a su institución.
                  </div>
                </div>
              )}

              {/* Resultado de la Búsqueda */}
              {resultado && (
                <div className="mt-5 rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-4 space-y-3 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {resultado.codigo}
                    </span>
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      VISITA CONFIRMADA
                    </span>
                  </div>

                  <div>
                    <div className="font-bold text-zinc-100 text-sm">{resultado.colegio}</div>
                    <div className="text-zinc-400 text-[11px]">{resultado.curso} · {resultado.cantAlumnos} estudiantes</div>
                  </div>

                  <div className="space-y-1.5 border-t border-zinc-800/80 pt-2 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span><strong>Fecha:</strong> {resultado.fecha}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span><strong>Horario:</strong> {resultado.horario}</span>
                    </div>
                  </div>

                  {/* Estado de Requisitos */}
                  <div className="grid grid-cols-2 gap-2 border-t border-zinc-800/80 pt-2">
                    <div className="rounded-lg bg-zinc-900/80 border border-zinc-800 p-2 flex items-center gap-2">
                      <Bus className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-[10px] text-zinc-500 font-mono">COLECTIVO TUP</div>
                        <div className="text-[11px] font-bold text-emerald-400">Asignado</div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-zinc-900/80 border border-zinc-800 p-2 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-[10px] text-zinc-500 font-mono">SEGURO ESCOLAR</div>
                        <div className="text-[11px] font-bold text-emerald-400">Verificado</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-zinc-800/80 pt-4 text-[11px] text-zinc-500 flex items-center justify-between">
              <span>Coordinación Pedagógica Municipal</span>
              <span className="font-mono text-zinc-400">Venado Tuerto</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
