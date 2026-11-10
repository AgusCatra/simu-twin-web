'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Bus,
  Building2,
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
  Loader2,
  XCircle,
} from 'lucide-react';
import { consultarEstadoReservaPublica } from '@/app/visitas/actions';
import type { ReservaPublicaDTO } from '@/types/visitas';

type MotivoErrorConsulta = 'validacion' | 'no_encontrada' | 'error_sistema';

function formatearFechaPublica(fechaIso: string): string {
  const soloFecha = fechaIso.split('T')[0];
  const partes = soloFecha.split('-');
  if (partes.length !== 3) return soloFecha;

  const anio = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) {
    return soloFecha;
  }

  const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0));
  const formateada = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(fechaUTC);

  return formateada.charAt(0).toUpperCase() + formateada.slice(1);
}

function obtenerBadgeEstadoVisita(estadoRaw: string): {
  etiqueta: string;
  badgeClass: string;
  tipoIcono: 'confirmada' | 'reprogramada' | 'cancelada' | 'pendiente';
} {
  const norm = estadoRaw.trim().toLowerCase();

  if (norm === 'confirmada') {
    return {
      etiqueta: 'VISITA CONFIRMADA',
      badgeClass: 'bg-[#0091B3]/10 border-[#0091B3]/30 text-[#0091B3]',
      tipoIcono: 'confirmada',
    };
  }
  if (norm === 'completada' || norm === 'finalizada') {
    return {
      etiqueta: norm === 'finalizada' ? 'VISITA FINALIZADA' : 'VISITA COMPLETADA',
      badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      tipoIcono: 'confirmada',
    };
  }
  if (norm === 'reprogramada') {
    return {
      etiqueta: 'REPROGRAMADA',
      badgeClass: 'bg-sky-50 border-sky-200 text-sky-700',
      tipoIcono: 'reprogramada',
    };
  }
  if (norm === 'cancelada') {
    return {
      etiqueta: 'CANCELADA',
      badgeClass: 'bg-rose-50 border-rose-200 text-rose-700',
      tipoIcono: 'cancelada',
    };
  }

  return {
    etiqueta: estadoRaw.trim().toUpperCase() || 'PENDIENTE',
    badgeClass: 'bg-amber-50 border-amber-200 text-amber-800',
    tipoIcono: 'pendiente',
  };
}

function obtenerInfoEstadoTup(estadoRaw: string | null): {
  etiqueta: string;
  badgeClass: string;
} {
  const norm = (estadoRaw ?? 'pendiente').trim().toLowerCase().replace(/\s+/g, '_');

  switch (norm) {
    case 'programado':
      return {
        etiqueta: 'Programado (Salida 08:15 hs)',
        badgeClass: 'bg-[#0091B3]/10 text-[#0091B3] border-[#0091B3]/25',
      };
    case 'en_camino':
      return {
        etiqueta: 'En camino hacia la institución',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'en_destino':
      return {
        etiqueta: 'En destino',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    case 'completado':
    case 'finalizado':
      return {
        etiqueta: norm === 'finalizado' ? 'Traslado finalizado' : 'Traslado completado',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'cancelado':
      return {
        etiqueta: 'Traslado cancelado',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    case 'pendiente':
      return {
        etiqueta: 'Pendiente de asignación',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      };
    default: {
      const legible = (estadoRaw ?? 'Pendiente').trim().replace(/_/g, ' ');
      return {
        etiqueta: legible.charAt(0).toUpperCase() + legible.slice(1),
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      };
    }
  }
}

export default function SeccionVisitas() {
  const [codigoInput, setCodigoInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<ReservaPublicaDTO | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [motivoError, setMotivoError] = useState<MotivoErrorConsulta | null>(null);

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cargando) return;

    const codigoLimpio = codigoInput.trim().toUpperCase();
    if (!codigoLimpio) {
      setResultado(null);
      setMotivoError('validacion');
      setErrorMensaje('Ingresá tu código de reserva para realizar la consulta.');
      return;
    }

    setCargando(true);
    setErrorMensaje(null);
    setMotivoError(null);
    setResultado(null);

    try {
      const respuesta = await consultarEstadoReservaPublica(codigoLimpio);
      if (respuesta.ok) {
        setResultado(respuesta.reserva);
      } else {
        setMotivoError(respuesta.motivo);
        setErrorMensaje(respuesta.error);
      }
    } catch {
      setMotivoError('error_sistema');
      setErrorMensaje(
        'No se pudo conectar con el servidor para verificar el código. Intentá nuevamente.'
      );
    } finally {
      setCargando(false);
    }
  };

  const badgeVisita = resultado
    ? obtenerBadgeEstadoVisita(resultado.estado_visita)
    : null;
  const infoTup =
    resultado && resultado.requiere_tup
      ? obtenerInfoEstadoTup(resultado.tup_estado_traslado)
      : null;

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
                Ingresá el código alfanumérico provisto al postular tu escuela para chequear la fecha, el turno, el estado de la reserva y el traslado TUP:
              </p>

              {/* Formulario de Consulta */}
              <form onSubmit={handleBuscar} className="mt-5 space-y-3" aria-busy={cargando}>
                <div className="relative">
                  <input
                    type="text"
                    value={codigoInput}
                    disabled={cargando}
                    maxLength={32}
                    aria-label="Código de reserva escolar"
                    onChange={(e) => {
                      setCodigoInput(e.target.value);
                      if (errorMensaje) {
                        setErrorMensaje(null);
                        setMotivoError(null);
                      }
                    }}
                    placeholder="Ej: CS-48291"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 pl-4 pr-12 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0091B3] focus:outline-none focus:ring-1 focus:ring-[#0091B3] shadow-sm uppercase tracking-wider disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={cargando}
                    className="absolute right-2 top-2 rounded-lg bg-[#0091B3] hover:bg-[#007b99] p-2 text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Buscar código de visita"
                    aria-label={cargando ? 'Consultando reserva' : 'Buscar código de visita'}
                  >
                    {cargando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </form>

              {/* Estado: Cargando */}
              {cargando && (
                <div className="mt-4 rounded-xl border border-[#0091B3]/25 bg-[#0091B3]/5 p-3.5 text-xs text-[#007b99] flex items-center gap-2.5">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Consultando estado de la reserva en tiempo real...</span>
                </div>
              )}

              {/* Estado: Error / Reserva no encontrada */}
              {!cargando && errorMensaje && (
                <div
                  role="alert"
                  className={`mt-4 rounded-xl border p-3.5 text-xs flex items-start gap-2.5 ${
                    motivoError === 'validacion'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  <AlertCircle
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      motivoError === 'validacion' ? 'text-amber-600' : 'text-rose-600'
                    }`}
                  />
                  <div>
                    <strong className="block mb-0.5">
                      {motivoError === 'no_encontrada'
                        ? 'Código no encontrado'
                        : motivoError === 'validacion'
                          ? 'Verificá el código ingresado'
                          : 'Error al consultar'}
                    </strong>
                    <span>{errorMensaje}</span>
                  </div>
                </div>
              )}

              {/* Estado: Resultado Exitoso (solo campos públicos sanitizados) */}
              {!cargando && resultado && badgeVisita && (
                <div className="mt-5 rounded-xl border border-[#0091B3]/30 bg-[#0091B3]/5 p-4 space-y-3 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between gap-2 border-b border-[#0091B3]/20 pb-2.5 flex-wrap">
                    <span className="font-mono font-bold text-[#0091B3] text-sm tracking-wide">
                      {resultado.codigo_reserva}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold flex items-center gap-1 ${badgeVisita.badgeClass}`}
                    >
                      {badgeVisita.tipoIcono === 'confirmada' && (
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                      )}
                      {badgeVisita.tipoIcono === 'reprogramada' && (
                        <CalendarCheck className="h-3 w-3 shrink-0" />
                      )}
                      {badgeVisita.tipoIcono === 'cancelada' && (
                        <XCircle className="h-3 w-3 shrink-0" />
                      )}
                      {badgeVisita.tipoIcono === 'pendiente' && (
                        <Clock className="h-3 w-3 shrink-0" />
                      )}
                      <span>{badgeVisita.etiqueta}</span>
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-[#0091B3] shrink-0 mt-0.5" />
                    <div className="font-bold text-slate-900 text-sm leading-snug">
                      {resultado.institucion_nombre}
                    </div>
                  </div>

                  <div className="space-y-1.5 border-t border-[#0091B3]/20 pt-2.5 text-slate-700">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-3.5 w-3.5 text-[#0091B3] shrink-0" />
                      <span>
                        <strong>Fecha:</strong> {formatearFechaPublica(resultado.fecha_visita)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-[#0091B3] shrink-0" />
                      <span>
                        <strong>Turno:</strong>{' '}
                        {resultado.turno ?? 'Jornada Escolar (08:15 a 12:00 hs)'}
                      </span>
                    </div>
                  </div>

                  {/* Estado de Traslado TUP */}
                  <div className="border-t border-[#0091B3]/20 pt-2.5">
                    {resultado.requiere_tup && infoTup ? (
                      <div className="rounded-lg bg-white border border-slate-200 p-2.5 flex items-center justify-between gap-2 shadow-xs flex-wrap">
                        <div className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-[#0091B3] shrink-0" />
                          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                            Traslado TUP
                          </span>
                        </div>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${infoTup.badgeClass}`}
                        >
                          {infoTup.etiqueta}
                        </span>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-white border border-slate-200 p-2.5 flex items-center gap-2 shadow-xs text-slate-600">
                        <Bus className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-[11px]">
                          <strong>Traslado TUP:</strong> No requerido (asiste por cuenta propia)
                        </span>
                      </div>
                    )}
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
