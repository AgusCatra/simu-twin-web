'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { EstadoInscripcion, FranjaCabina, PostulanteFila } from '@/types/empleo';
import DrawerPostulante from './DrawerPostulante';

/**
 * Tabla del ranking de postulantes con badges de estado. Al hacer clic en una
 * fila se abre el DrawerPostulante con la ficha técnica completa. En móvil la
 * misma lista se renderiza como tarjetas apiladas (una sola fuente de datos).
 */

interface Props {
  postulantes: PostulanteFila[];
  franjas: FranjaCabina[];
}

const BADGE_ESTADO: Record<EstadoInscripcion, { clase: string; etiqueta: string }> = {
  CONFIRMADO: { clase: 'bg-emerald-500 text-emerald-950', etiqueta: 'CONFIRMADO' },
  DISPONIBLE: { clase: 'bg-zinc-700 text-zinc-200', etiqueta: 'DISPONIBLE' },
  DESCARTADO: { clase: 'bg-red-500/15 text-red-400 border border-red-500/40', etiqueta: 'DESCARTADO' },
};

function BadgeEstado({ estado }: { estado: EstadoInscripcion }) {
  const badge = BADGE_ESTADO[estado];
  return (
    <span
      className={`inline-block rounded-sm px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.12em] ${badge.clase}`}
    >
      {badge.etiqueta}
    </span>
  );
}

function ScoreCelda({ postulante }: { postulante: PostulanteFila }) {
  const score = postulante.evaluacion?.telemetria.score_puntos ?? null;
  return (
    <span className="font-mono text-[11px] text-zinc-300">
      {score !== null ? `${score} pts` : '—'}
    </span>
  );
}

export default function TablaPostulantes({ postulantes, franjas }: Props) {
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);

  const seleccionado =
    postulantes.find((p) => p.inscripcion_id === seleccionadoId) ?? null;

  const etiquetaFranja = (franjaId: string | null): string => {
    if (!franjaId) return '—';
    const franja = franjas.find((f) => f.id === franjaId);
    return franja ? `${franja.turno} ${franja.horario_label}` : '—';
  };

  if (postulantes.length === 0) {
    return (
      <p className="rounded-sm border border-dashed border-zinc-800 px-3 py-6 text-center font-mono text-[11px] tracking-[0.12em] text-zinc-600">
        SIN POSTULANTES INSCRIPTOS EN ESTA COHORTE
      </p>
    );
  }

  return (
    <>
      {/* ── Vista tabla (md+) ─────────────────────────────────── */}
      <div className="hidden overflow-x-auto rounded-sm border border-zinc-800 md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Ranking de postulantes con estado y franja asignada
          </caption>
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950">
              {['#', 'POSTULANTE', 'DNI', 'TURNO', 'SCORE', 'FRANJA', 'ESTADO', ''].map(
                (encabezado) => (
                  <th
                    key={encabezado}
                    scope="col"
                    className="px-3 py-2 font-mono text-[9.5px] font-normal tracking-[0.16em] text-zinc-500"
                  >
                    {encabezado}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {postulantes.map((p) => (
              <tr
                key={p.inscripcion_id}
                onClick={() => setSeleccionadoId(p.inscripcion_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSeleccionadoId(p.inscripcion_id);
                  }
                }}
                tabIndex={0}
                aria-label={`Ver ficha de ${p.nombre_completo}`}
                className="cursor-pointer border-b border-zinc-900 transition-colors last:border-b-0 hover:bg-zinc-900 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white"
              >
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">
                  {p.ranking_orden}
                </td>
                <td className="max-w-56 truncate px-3 py-2.5 text-sm text-zinc-100">
                  {p.nombre_completo}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-400">
                  {p.dni}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-400">
                  {p.origen_turno}
                </td>
                <td className="px-3 py-2.5">
                  <ScoreCelda postulante={p} />
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-400">
                  {etiquetaFranja(p.franja_id)}
                </td>
                <td className="px-3 py-2.5">
                  <BadgeEstado estado={p.estado} />
                </td>
                <td className="px-2 py-2.5 text-zinc-600">
                  <ChevronRight size={15} strokeWidth={1.75} aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Vista tarjetas (mobile) ───────────────────────────── */}
      <ul className="space-y-1.5 md:hidden">
        {postulantes.map((p) => (
          <li key={p.inscripcion_id}>
            <button
              type="button"
              onClick={() => setSeleccionadoId(p.inscripcion_id)}
              className="flex w-full items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-left transition-colors hover:bg-zinc-900 focus-visible:outline-1 focus-visible:outline-white"
            >
              <span className="w-6 shrink-0 font-mono text-xs text-zinc-500">
                {p.ranking_orden}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-100">
                  {p.nombre_completo}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] tracking-[0.1em] text-zinc-500">
                  DNI {p.dni} · {p.origen_turno} · {etiquetaFranja(p.franja_id)}
                </span>
              </span>
              <BadgeEstado estado={p.estado} />
            </button>
          </li>
        ))}
      </ul>

      <DrawerPostulante
        postulante={seleccionado}
        franjas={franjas}
        onCerrar={() => setSeleccionadoId(null)}
      />
    </>
  );
}
