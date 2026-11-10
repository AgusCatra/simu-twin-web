'use client';

import { FileJson, Layers, Sparkles, User } from 'lucide-react';
import { calcularEstructuraGruposYDuplas } from '@/lib/calendario-duplas';
import type { PostulanteFila } from '@/types/empleo';

/**
 * Grilla operativa de las 8 Duplas Pedagógicas (16 alumnos titulares) de la
 * cohorte seleccionada:
 * - Grupo A (Duplas 1..4 · Lunes y Miércoles)
 * - Grupo B (Duplas 5..8 · Martes y Jueves)
 *
 * Cada tarjeta de alumno expone un acceso rápido al Drawer general y el botón
 * táctil directo `🛰️ Titán .JSON` para abrir el legajo enfocado en telemetría.
 */

interface Props {
  postulantes: PostulanteFila[];
  onAbrirPostulante: (inscripcionId: string, enfocarTitan?: boolean) => void;
}

const CLASE_ESTADO_BADGE: Record<PostulanteFila['estado'], string> = {
  CONFIRMADO: 'bg-emerald-500 text-emerald-950',
  DISPONIBLE: 'bg-zinc-700 text-zinc-200',
  DESCARTADO: 'border border-red-500/40 bg-red-500/15 text-red-400',
};

function TarjetaAlumnoDupla({
  puesto,
  postulante,
  onAbrirPostulante,
}: {
  puesto: number;
  postulante: PostulanteFila | null;
  onAbrirPostulante: (inscripcionId: string, enfocarTitan?: boolean) => void;
}) {
  if (!postulante) {
    return (
      <div className="flex min-h-[76px] items-center justify-between rounded-sm border border-dashed border-zinc-800 bg-zinc-950/60 px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-zinc-600">
          <User size={13} strokeWidth={1.75} aria-hidden />
          <span>PUESTO #{puesto} · VACANTE</span>
        </div>
      </div>
    );
  }

  const evalData = postulante.evaluacion;
  const tieneIA = Boolean(evalData?.informe_ia);
  const tieneJson = Boolean(evalData?.telemetria_metricas);
  const tieneTitanLegacy = Boolean(evalData?.telemetria.tiene_datos);
  const scoreMostrable =
    evalData?.telemetria_metricas?.scorePuntos ??
    evalData?.telemetria.score_puntos ??
    null;

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-zinc-800 bg-zinc-900/75 p-2.5 transition-colors hover:border-zinc-700 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={() => onAbrirPostulante(postulante.inscripcion_id, false)}
        aria-label={`Ver ficha técnica completa de ${postulante.nombre_completo}`}
        className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-1 focus-visible:outline-white"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-zinc-300">
            #{postulante.ranking_orden}
          </span>
          <span className="truncate text-sm font-medium text-zinc-100">
            {postulante.nombre_completo}
          </span>
          <span
            className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.1em] ${CLASE_ESTADO_BADGE[postulante.estado]}`}
          >
            {postulante.estado}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] tracking-[0.08em] text-zinc-400">
          <span>DNI {postulante.dni}</span>
          <span>· {postulante.origen_turno}</span>
          {scoreMostrable !== null && (
            <span className="text-zinc-200">· {scoreMostrable} pts</span>
          )}
          {evalData?.hard_fail && (
            <span className="rounded-sm border border-red-500/50 bg-red-950/40 px-1.5 py-0.5 text-[9px] font-semibold text-red-300">
              HARD-FAIL
            </span>
          )}
          {tieneIA ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-950/35 px-1.5 py-0.5 text-[9px] text-emerald-300">
              <Sparkles size={10} strokeWidth={2} aria-hidden />
              IA LISTO
            </span>
          ) : tieneJson || tieneTitanLegacy ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-cyan-500/40 bg-cyan-950/35 px-1.5 py-0.5 text-[9px] text-cyan-300">
              <FileJson size={10} strokeWidth={2} aria-hidden />
              TITÁN CARGADO
            </span>
          ) : null}
        </div>
      </button>

      <button
        type="button"
        onClick={() => onAbrirPostulante(postulante.inscripcion_id, true)}
        aria-label={`Abrir telemetría Proyecto Titán .json de ${postulante.nombre_completo}`}
        className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-sm border border-emerald-500/60 bg-emerald-950/50 px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-200 focus-visible:outline-1 focus-visible:outline-white"
      >
        <span aria-hidden>🛰️</span>
        <span>Titán .JSON</span>
      </button>
    </div>
  );
}

export default function GrillaDuplas({ postulantes, onAbrirPostulante }: Props) {
  const ordenados = [...postulantes].sort(
    (a, b) => a.ranking_orden - b.ranking_orden
  );
  const activos = ordenados.filter((p) => p.estado !== 'DESCARTADO');
  const titulares = activos.slice(0, 16);
  const suplentes = activos.slice(16);
  const descartados = ordenados.filter((p) => p.estado === 'DESCARTADO');

  const estructura = calcularEstructuraGruposYDuplas(16);
  const duplasGrupoA = estructura.duplas.filter((d) => d.grupo === 'GRUPO_A');
  const duplasGrupoB = estructura.duplas.filter((d) => d.grupo === 'GRUPO_B');

  const totalConTitan = titulares.filter(
    (p) =>
      Boolean(p.evaluacion?.telemetria_metricas) ||
      Boolean(p.evaluacion?.informe_ia) ||
      Boolean(p.evaluacion?.telemetria.tiene_datos)
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 font-mono text-[10.5px] tracking-[0.08em]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-zinc-200">
            <Layers size={13} strokeWidth={1.75} className="text-emerald-400" aria-hidden />
            TITULARES EN DUPLAS:{' '}
            <strong className="text-white">{titulares.length}/16</strong>
          </span>
          <span className="text-cyan-300">
            CON TELEMETRÍA TITÁN: <strong>{totalConTitan}</strong>
          </span>
          {suplentes.length > 0 && (
            <span className="text-amber-300">
              RESERVA / SUPLENTES: <strong>{suplentes.length}</strong>
            </span>
          )}
          {descartados.length > 0 && (
            <span className="text-zinc-500">
              BAJAS / DESCARTADOS: <strong>{descartados.length}</strong>
            </span>
          )}
        </div>
        <span className="text-[9.5px] text-zinc-500">
          CLIC EN 🛰️ TITÁN .JSON PARA CARGAR TELEMETRÍA E IA
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── GRUPO A: Duplas 1..4 (Lunes / Miércoles) ────────────── */}
        <section
          aria-label="Grupo A: Duplas 1 a 4 (Lunes y Miércoles)"
          className="space-y-2.5"
        >
          <p className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-emerald-400">
            GRUPO A · DUPLAS 1 A 4 (LUNES / MIÉRCOLES)
          </p>
          <div className="space-y-2.5">
            {duplasGrupoA.map((dupla) => {
              const alumno1 = titulares[dupla.puestoDesde - 1] ?? null;
              const alumno2 = titulares[dupla.puestoHasta - 1] ?? null;
              const ocupados = (alumno1 ? 1 : 0) + (alumno2 ? 1 : 0);
              return (
                <article
                  key={dupla.duplaNumero}
                  className="rounded-sm border border-emerald-500/25 bg-zinc-950 p-3"
                >
                  <header className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-800 pb-1.5 font-mono text-[10.5px]">
                    <span className="font-semibold tracking-[0.12em] text-white">
                      DUPLA #{dupla.duplaNumero} · {dupla.horarioLabel}
                    </span>
                    <span className="text-emerald-400">
                      A ({dupla.diasLabel}) · {ocupados}/2
                    </span>
                  </header>
                  <div className="space-y-2">
                    <TarjetaAlumnoDupla
                      puesto={dupla.puestoDesde}
                      postulante={alumno1}
                      onAbrirPostulante={onAbrirPostulante}
                    />
                    <TarjetaAlumnoDupla
                      puesto={dupla.puestoHasta}
                      postulante={alumno2}
                      onAbrirPostulante={onAbrirPostulante}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ── GRUPO B: Duplas 5..8 (Martes / Jueves) ──────────────── */}
        <section
          aria-label="Grupo B: Duplas 5 a 8 (Martes y Jueves)"
          className="space-y-2.5"
        >
          <p className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-cyan-400">
            GRUPO B · DUPLAS 5 A 8 (MARTES / JUEVES)
          </p>
          <div className="space-y-2.5">
            {duplasGrupoB.map((dupla) => {
              const alumno1 = titulares[dupla.puestoDesde - 1] ?? null;
              const alumno2 = titulares[dupla.puestoHasta - 1] ?? null;
              const ocupados = (alumno1 ? 1 : 0) + (alumno2 ? 1 : 0);
              return (
                <article
                  key={dupla.duplaNumero}
                  className="rounded-sm border border-cyan-500/25 bg-zinc-950 p-3"
                >
                  <header className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-800 pb-1.5 font-mono text-[10.5px]">
                    <span className="font-semibold tracking-[0.12em] text-white">
                      DUPLA #{dupla.duplaNumero} · {dupla.horarioLabel}
                    </span>
                    <span className="text-cyan-400">
                      B ({dupla.diasLabel}) · {ocupados}/2
                    </span>
                  </header>
                  <div className="space-y-2">
                    <TarjetaAlumnoDupla
                      puesto={dupla.puestoDesde}
                      postulante={alumno1}
                      onAbrirPostulante={onAbrirPostulante}
                    />
                    <TarjetaAlumnoDupla
                      puesto={dupla.puestoHasta}
                      postulante={alumno2}
                      onAbrirPostulante={onAbrirPostulante}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Nómina en reserva (>16 titulares) ─────────────────────── */}
      {suplentes.length > 0 && (
        <section
          aria-label="Nómina de reserva o suplentes"
          className="space-y-2 rounded-sm border border-amber-500/30 bg-zinc-950 p-3"
        >
          <p className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-amber-300">
            RESERVA / SUPLENTES ({suplentes.length}) · FUERA DE LAS 8 DUPLAS BASE
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {suplentes.map((p, idx) => (
              <TarjetaAlumnoDupla
                key={p.inscripcion_id}
                puesto={17 + idx}
                postulante={p}
                onAbrirPostulante={onAbrirPostulante}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
