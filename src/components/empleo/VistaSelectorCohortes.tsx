'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  Clock,
  FolderPlus,
  GraduationCap,
  Layers,
  Users,
} from 'lucide-react';
import type { CohorteResumen } from '@/types/empleo';
import ModalNuevaCohorte from './ModalNuevaCohorte';

interface Props {
  cohortes: CohorteResumen[];
  feriadosMunicipales: string[];
  cohorteActivaRealCodigo: string | null;
  totalPersonasCentro: number;
  personasLaboral: number;
  personasEscuelas: number;
  personasActividades: number;
  horasTotalesFlota: number;
  horasHombreFormacion: number;
  abrirModalInicial?: boolean;
}

const BADGE_ESTADO_COHORTE: Record<
  CohorteResumen['estado'],
  { etiqueta: string; clase: string }
> = {
  activa: {
    etiqueta: 'En Curso (Activa)',
    clase: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  borrador: {
    etiqueta: 'Planificada',
    clase: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  finalizada: {
    etiqueta: 'Finalizada',
    clase: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

const ETIQUETA_MAQUINARIA: Record<string, string> = {
  AUTOELEVADOR: 'Autoelevador',
  PALA_FRONTAL: 'Pala Frontal',
  RETROEXCAVADORA: 'Retroexcavadora',
};

function formatoFechaCorta(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return 'A definir';
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

export default function VistaSelectorCohortes({
  cohortes,
  feriadosMunicipales,
  cohorteActivaRealCodigo,
  totalPersonasCentro,
  personasLaboral,
  personasEscuelas,
  personasActividades,
  horasTotalesFlota,
  horasHombreFormacion,
  abrirModalInicial = false,
}: Props) {
  const [modalAbierto, setModalAbierto] = useState(abrirModalInicial);

  return (
    <div className="space-y-6">
      {/* Gran Totalizador resumido arriba */}
      <section
        aria-label="Resumen del Gran Totalizador del Centro"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-white via-blue-50/40 to-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
            <Users size={15} aria-hidden />
            Total Personas en el Centro
          </p>
          <p className="mt-1.5 text-3xl font-extrabold text-slate-900 tabular-nums">
            {totalPersonasCentro.toLocaleString('es-AR')}{' '}
            <span className="text-sm font-semibold text-slate-500">personas</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Capacitación Laboral ({personasLaboral}) + Visitas Escuelas ({personasEscuelas}) + Actividades ({personasActividades})
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-white via-emerald-50/40 to-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <Clock size={15} aria-hidden />
            Total Horas de Simulación y Formación
          </p>
          <p className="mt-1.5 text-3xl font-extrabold text-slate-900 tabular-nums">
            {horasTotalesFlota.toLocaleString('es-AR')}{' '}
            <span className="text-sm font-semibold text-slate-500">
              hs máquina · +{horasHombreFormacion.toLocaleString('es-AR')} hs-hombre
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Incluye odómetro real de los 7 simuladores y prácticas en curso
          </p>
        </div>
      </section>

      {/* Cabecera de Nivel 1 */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700"
          >
            <GraduationCap size={21} strokeWidth={1.85} />
          </span>
          <div>
            <p className="text-xs font-semibold text-blue-700">
              Nivel 1 · Selector de Cohorte
            </p>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Capacitación Laboral (Cohortes)
            </h1>
            <p className="text-sm text-slate-600">
              Elegí una cohorte para avanzar por los 4 pasos cronológicos (Diagnóstico → Simulador → Final → Patio y Egreso).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <FolderPlus size={16} strokeWidth={2} aria-hidden />
          + Crear Nueva Cohorte
        </button>
      </header>

      {/* Tarjetas de Cohortes + Tarjeta Crear Nueva */}
      <section aria-label="Cohortes disponibles">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cohortes.map((c) => {
            const st = BADGE_ESTADO_COHORTE[c.estado];
            const maq = c.tipo_maquinaria
              ? ETIQUETA_MAQUINARIA[c.tipo_maquinaria] ?? c.tipo_maquinaria
              : 'Autoelevador';
            const inscriptos = c.total_inscriptos ?? 0;

            return (
              <article
                key={c.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                      {c.codigo}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.clase}`}
                    >
                      {st.etiqueta}
                    </span>
                  </div>

                  <h2 className="mt-3 text-lg font-bold text-slate-900">
                    {c.nombre}
                  </h2>

                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                    <div>
                      <p className="text-slate-500">Inscriptos</p>
                      <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                        {inscriptos} alumnos
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Equipamiento</p>
                      <p className="mt-0.5 flex items-center gap-1 font-semibold text-slate-800">
                        <Layers size={13} className="text-blue-600" aria-hidden />
                        {maq}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={13} className="text-slate-400" aria-hidden />
                      Teoría: <strong>{formatoFechaCorta(c.fecha_teoria)}</strong>
                    </span>
                    <span>
                      Sim.: <strong>{formatoFechaCorta(c.fecha_inicio_sim)}</strong>
                    </span>
                  </div>
                </div>

                <Link
                  href={`/gestion/cohortes?cohorteId=${c.id}`}
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <span>Ingresar a esta Cohorte</span>
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </article>
            );
          })}

          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 p-6 text-center transition-colors hover:border-blue-400 hover:bg-blue-50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-xs">
              <FolderPlus size={22} strokeWidth={1.85} aria-hidden />
            </span>
            <div>
              <p className="text-base font-bold text-blue-800">
                + Crear Nueva Cohorte
              </p>
              <p className="mt-1 max-w-xs text-xs text-slate-600">
                Configurá una nueva camada, cupo, días hábiles y horarios de simulador en duplas.
              </p>
            </div>
          </button>
        </div>
      </section>

      {modalAbierto && (
        <ModalNuevaCohorte
          abierto={modalAbierto}
          onCerrar={() => setModalAbierto(false)}
          feriadosMunicipales={feriadosMunicipales}
          cohorteActivaCodigo={cohorteActivaRealCodigo}
        />
      )}
    </div>
  );
}
