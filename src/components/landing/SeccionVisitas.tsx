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
      className="relative w-full border-b border-slate-200 bg-slate-50 py-20 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Encabezado General */}
        <div className="mb-14 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-semibold text-emerald-800 mb-3">
            <GraduationCap className="h-3.5 w-3.5 text-emerald-700" />
            <span>PROGRAMA EDUCATIVO MUNICIPAL</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Visitas Escolares y Formación Vocacional
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
            Acercamos a estudiantes secundarios de Venado Tuerto y la región a la tecnología de maquinarias pesadas y logística moderna.
          </p>
        </div>

        {/* Grilla en 2 Columnas */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* Columna 1: Solicitud de Turno Escolar y Circuito de 90 Minutos */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">
                <Clock className="h-4 w-4 text-emerald-700" />
                <span>Circuito Pedagógico Guiado (90 minutos)</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                ¿Cómo es la experiencia para colegios y escuelas técnicas?
              </h3>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
                Cada contingente escolar es recibido por instructores especializados en un recorrido dinámico diseñado para orientar vocaciones y desmitificar el manejo de maquinaria pesada:
              </p>

              {/* Fases del circuito */}
              <div className="mt-6 space-y-3.5">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      Inducción y Seguridad Operacional (15 min)
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Uso de EPP, delimitación de líneas amarillas de seguridad, señalética y prevención de accidentes en obras y depósitos.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      Práctica en Cabinas de Maquinaria Pesada (50 min)
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Rotación guiada por autoelevador, pala cargadora, retroexcavadora y camión con simuladores de inercia y física real.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      Estación SimSpray Realidad Virtual (15 min)
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Práctica con pistola aerográfica física y casco VR, midiendo en tiempo real el espesor y la técnica de pintura.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      Cierre y Orientación Laboral Municipal (10 min)
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Presentación de cursos con salida laboral, articulación con empresas del sector productivo y preguntas abiertas.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Postulación */}
            <div className="mt-8 border-t border-slate-200 pt-6">
              <Link
                href="/visitas"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition active:scale-98"
              >
                <span>Solicitar Turno para Institución Educativa</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="text-[11px] text-slate-500 mt-2">
                Transporte escolar municipal (TUP) gratuito incluido para escuelas de Venado Tuerto.
              </div>
            </div>
          </div>

          {/* Columna 2: Seguimiento de Visita con Código */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">
                <FileCheck className="h-4 w-4 text-emerald-700" />
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
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-sm uppercase tracking-wider"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 p-2 text-white transition"
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
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
                    <span className="font-bold text-emerald-900 text-sm">
                      {resultado.codigo}
                    </span>
                    <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                      VISITA CONFIRMADA
                    </span>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 text-sm">{resultado.colegio}</div>
                    <div className="text-slate-600 text-[11px]">{resultado.curso} · {resultado.cantAlumnos} estudiantes</div>
                  </div>

                  <div className="space-y-1.5 border-t border-emerald-200/60 pt-2 text-slate-700">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                      <span><strong>Fecha:</strong> {resultado.fecha}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                      <span><strong>Horario:</strong> {resultado.horario}</span>
                    </div>
                  </div>

                  {/* Estado de Requisitos */}
                  <div className="grid grid-cols-2 gap-2 border-t border-emerald-200/60 pt-2">
                    <div className="rounded-lg bg-white border border-slate-200 p-2 flex items-center gap-2 shadow-xs">
                      <Bus className="h-4 w-4 text-emerald-700 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-500">COLECTIVO TUP</div>
                        <div className="text-[11px] font-bold text-emerald-700">Asignado</div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white border border-slate-200 p-2 flex items-center gap-2 shadow-xs">
                      <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-500">SEGURO ESCOLAR</div>
                        <div className="text-[11px] font-bold text-emerald-700">Verificado</div>
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
