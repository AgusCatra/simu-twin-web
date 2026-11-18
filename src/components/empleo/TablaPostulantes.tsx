'use client';

import { useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import type { EstadoInscripcion, FranjaCabina, PostulanteFila } from '@/types/empleo';
import DrawerPostulante from './DrawerPostulante';

interface Props {
  postulantes: PostulanteFila[];
  franjas: FranjaCabina[];
  cohorteId?: string | null;
  onAbrirPostulante?: (inscripcionId: string, enfocarTitan?: boolean) => void;
}

const BADGE_ESTADO: Record<EstadoInscripcion, { clase: string; etiqueta: string }> = {
  CONFIRMADO: { clase: 'border-emerald-200 bg-emerald-50 text-emerald-700', etiqueta: 'Confirmado' },
  DISPONIBLE: { clase: 'border-slate-200 bg-slate-100 text-slate-700', etiqueta: 'Disponible' },
  DESCARTADO: { clase: 'border-rose-200 bg-rose-50 text-rose-700', etiqueta: 'Baja' },
};

function BadgeEstado({ estado }: { estado: EstadoInscripcion }) {
  const badge = BADGE_ESTADO[estado];
  return (
    <span
      className={`inline-block rounded-md border px-2.5 py-0.5 text-xs font-semibold ${badge.clase}`}
    >
      {badge.etiqueta}
    </span>
  );
}

function ScoreCelda({ postulante }: { postulante: PostulanteFila }) {
  const score = postulante.evaluacion?.telemetria.score_puntos ?? null;
  return (
    <span className="text-sm font-semibold text-slate-900 tabular-nums">
      {score !== null ? `${score} pts` : '—'}
    </span>
  );
}

export default function TablaPostulantes({
  postulantes,
  franjas,
  cohorteId,
  onAbrirPostulante,
}: Props) {
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [enfocarTitanLocal, setEnfocarTitanLocal] = useState(false);
  const [enfocarSignalLocal, setEnfocarSignalLocal] = useState(0);

  const controlExterno = typeof onAbrirPostulante === 'function';

  function abrir(inscripcionId: string, enfocarTitan = false) {
    if (onAbrirPostulante) {
      onAbrirPostulante(inscripcionId, enfocarTitan);
      return;
    }
    setSeleccionadoId(inscripcionId);
    setEnfocarTitanLocal(enfocarTitan);
    if (enfocarTitan) {
      setEnfocarSignalLocal((n) => n + 1);
    }
  }

  const seleccionado = controlExterno
    ? null
    : (postulantes.find((p) => p.inscripcion_id === seleccionadoId) ?? null);

  const etiquetaFranja = (franjaId: string | null): string => {
    if (!franjaId) return '—';
    const franja = franjas.find((f) => f.id === franjaId);
    return franja ? `${franja.turno} ${franja.horario_label}` : '—';
  };

  if (postulantes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-medium text-slate-600">
        No hay alumnos inscriptos en este curso.
      </p>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Listado de alumnos del curso con su estado y horario asignado
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {[
                '#',
                'Alumno',
                'DNI',
                'Turno',
                'Puntaje',
                'Cuidado Máquina',
                'Horario',
                'Estado',
                'Reporte',
                '',
              ].map((encabezado) => (
                <th
                  key={encabezado}
                  scope="col"
                  className="px-3.5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  {encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {postulantes.map((p) => {
              const cuidado = p.analitica?.cuidadoMecanico?.indiceCuidadoMecanico ?? null;
              return (
                <tr
                  key={p.inscripcion_id}
                  onClick={() => abrir(p.inscripcion_id, false)}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === 'Enter' || e.key === ' ')
                    ) {
                      e.preventDefault();
                      abrir(p.inscripcion_id, false);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Ver legajo de ${p.nombre_completo}`}
                  className="cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
                >
                  <td className="px-3.5 py-3 text-xs font-semibold text-slate-500 tabular-nums">
                    {p.ranking_orden}
                  </td>
                  <td className="max-w-56 truncate px-3.5 py-3 text-sm font-semibold text-slate-900">
                    {p.nombre_completo}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-slate-600 tabular-nums">
                    {p.dni}
                  </td>
                  <td className="px-3.5 py-3 text-xs font-medium text-slate-600">
                    {p.origen_turno}
                  </td>
                  <td className="px-3.5 py-3">
                    <ScoreCelda postulante={p} />
                  </td>
                  <td className="px-3.5 py-3 text-xs font-semibold tabular-nums">
                    {cuidado !== null ? (
                      <span
                        className={
                          cuidado >= 70
                            ? 'text-emerald-700'
                            : cuidado >= 50
                              ? 'text-amber-800'
                              : 'text-rose-700'
                        }
                      >
                        {cuidado}%
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-slate-600">
                    {etiquetaFranja(p.franja_id)}
                  </td>
                  <td className="px-3.5 py-3">
                    <BadgeEstado estado={p.estado} />
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrir(p.inscripcion_id, true);
                      }}
                      aria-label={`Subir reporte del simulador de ${p.nombre_completo}`}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      <FileText size={13} aria-hidden />
                      <span>Reportes</span>
                    </button>
                  </td>
                  <td className="px-2.5 py-3 text-slate-400">
                    <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {postulantes.map((p) => (
          <li
            key={p.inscripcion_id}
            className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs"
          >
            <button
              type="button"
              onClick={() => abrir(p.inscripcion_id, false)}
              className="flex w-full items-center gap-3 rounded-lg text-left"
            >
              <span className="w-6 shrink-0 text-xs font-bold text-slate-500">
                #{p.ranking_orden}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">
                  {p.nombre_completo}
                </span>
                <span className="mt-0.5 block text-xs text-slate-600">
                  DNI {p.dni} · {p.origen_turno} · {etiquetaFranja(p.franja_id)}
                </span>
              </span>
              <BadgeEstado estado={p.estado} />
            </button>
            <button
              type="button"
              onClick={() => abrir(p.inscripcion_id, true)}
              className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <FileText size={14} aria-hidden />
              <span>Subir reporte del simulador</span>
            </button>
          </li>
        ))}
      </ul>

      {!controlExterno && (
        <DrawerPostulante
          postulante={seleccionado}
          franjas={franjas}
          cohorteId={cohorteId}
          enfocarTitan={enfocarTitanLocal}
          enfocarSignal={enfocarSignalLocal}
          onCerrar={() => {
            setSeleccionadoId(null);
            setEnfocarTitanLocal(false);
          }}
        />
      )}
    </>
  );
}
