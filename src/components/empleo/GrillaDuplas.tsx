'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CheckCircle2,
  Edit3,
  FileJson,
  Layers,
  RefreshCw,
  RotateCcw,
  Sparkles,
  User,
} from 'lucide-react';
import {
  actualizarAsistenciaSesionAction,
  sincronizarDuplasYSesionesAction,
} from '@/services/empleo';
import {
  calcularEstructuraGruposYDuplasDinamica,
  formatearDiasGrupoCorto,
  type DuplaPlanificadaItem,
} from '@/lib/calendario-duplas';
import type {
  ConfiguracionCursadoCohorte,
  DuplaPersistidaItem,
  EstadoAsistenciaUI,
  PostulanteFila,
  SesionPracticaItem,
} from '@/types/empleo';

/**
 * Grilla operativa principal de Duplas Pedagógicas:
 * - Renderiza Grupos A/B dinámicos según `configuracion_cursado`.
 * - Carga desde `public.duplas_cabina` (o sugiere por ranking si aún no se sincronizó).
 * - Permite reasignar manualmente postulantes, sincronizar duplas + sesiones en DB
 *   y registrar asistencias / reprogramaciones a Viernes Buffer.
 */

interface Props {
  cohorteId: string;
  configuracionCursado: ConfiguracionCursadoCohorte;
  postulantes: PostulanteFila[];
  duplasPersistidas: DuplaPersistidaItem[];
  sesionesPractica: SesionPracticaItem[];
  viernesSugeridos: string[];
  onAbrirPostulante: (inscripcionId: string, enfocarTitan?: boolean) => void;
}

const CLASE_ESTADO_BADGE: Record<PostulanteFila['estado'], string> = {
  CONFIRMADO: 'bg-emerald-500 text-emerald-950',
  DISPONIBLE: 'bg-zinc-700 text-zinc-200',
  DESCARTADO: 'border border-red-500/40 bg-red-500/15 text-red-400',
};

const CLASE_SESION_CHIP: Record<EstadoAsistenciaUI, string> = {
  PRESENTE: 'border-emerald-500/60 bg-emerald-500/25 text-emerald-200',
  AUSENTE_JUSTIFICADO: 'border-amber-500/60 bg-amber-500/25 text-amber-200',
  AUSENTE_INJUSTIFICADO: 'border-red-500/60 bg-red-500/25 text-red-200',
  REPROGRAMADA: 'border-cyan-500/60 bg-cyan-500/25 text-cyan-200',
  PENDIENTE: 'border-zinc-700 bg-zinc-900 text-zinc-400',
};

const SIGLA_SESION: Record<EstadoAsistenciaUI, string> = {
  PRESENTE: 'P',
  AUSENTE_JUSTIFICADO: 'AJ',
  AUSENTE_INJUSTIFICADO: 'AI',
  REPROGRAMADA: 'R',
  PENDIENTE: '·',
};

function claveSlot(d: Pick<DuplaPlanificadaItem, 'grupo' | 'franja'>): string {
  return `${d.grupo}::${d.franja}`;
}

function construirMapaInicial(
  slots: DuplaPlanificadaItem[],
  duplasPersistidas: DuplaPersistidaItem[],
  activos: PostulanteFila[]
): Record<string, { a1: string; a2: string }> {
  const persistidaPorClave = new Map<string, DuplaPersistidaItem>();
  for (const dp of duplasPersistidas) {
    persistidaPorClave.set(`${dp.grupo}::${dp.franja}`, dp);
  }

  const mapa: Record<string, { a1: string; a2: string }> = {};
  const hayPersistidas = duplasPersistidas.length > 0;

  for (const s of slots) {
    const key = claveSlot(s);
    const guardada = persistidaPorClave.get(key);
    if (guardada) {
      mapa[key] = { a1: guardada.alumno_1_id, a2: guardada.alumno_2_id };
    } else if (!hayPersistidas) {
      const p1 = activos[s.puestoDesde - 1]?.postulante_id ?? '';
      const p2 = activos[s.puestoHasta - 1]?.postulante_id ?? '';
      mapa[key] = { a1: p1, a2: p2 };
    } else {
      mapa[key] = { a1: '', a2: '' };
    }
  }
  return mapa;
}

function TarjetaAlumnoDupla({
  puesto,
  postulante,
  sesiones,
  viernesSugeridos,
  cohorteId,
  onAbrirPostulante,
  onSesionActualizada,
}: {
  puesto: number;
  postulante: PostulanteFila | null;
  sesiones: SesionPracticaItem[];
  viernesSugeridos: string[];
  cohorteId: string;
  onAbrirPostulante: (inscripcionId: string, enfocarTitan?: boolean) => void;
  onSesionActualizada: () => void;
}) {
  const [sesionAbiertaId, setSesionAbiertaId] = useState<string | null>(null);
  const [pendienteAsis, startAsisTransition] = useTransition();

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

  const presentes = sesiones.filter((s) => s.estado_asistencia === 'PRESENTE').length;
  const sesionActiva = sesiones.find((s) => s.id === sesionAbiertaId) ?? null;

  function cambiarAsistencia(
    sesion: SesionPracticaItem,
    estado: EstadoAsistenciaUI,
    fechaReprog?: string
  ) {
    startAsisTransition(async () => {
      const res = await actualizarAsistenciaSesionAction({
        sesion_id: sesion.id,
        cohorte_id: cohorteId,
        estado_asistencia: estado,
        fecha_reprogramacion: fechaReprog ?? null,
      });
      if (res.ok) {
        setSesionAbiertaId(null);
        onSesionActualizada();
      }
    });
  }

  return (
    <div className="space-y-2 rounded-sm border border-zinc-800 bg-zinc-900/75 p-2.5 transition-colors hover:border-zinc-700">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
            {sesiones.length > 0 && (
              <span className="rounded-sm border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[9px] text-zinc-200">
                ASIS {presentes}/{sesiones.length}
              </span>
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

      {/* Pills rápidas de sesiones sincronizadas */}
      {sesiones.length > 0 && (
        <div className="space-y-1.5 border-t border-zinc-800/80 pt-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-mono text-[9px] tracking-[0.1em] text-zinc-500">
              SESIONES:
            </span>
            {sesiones.map((s) => {
              const abierta = sesionAbiertaId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSesionAbiertaId(abierta ? null : s.id)}
                  title={`Sesión ${s.numero_sesion} (${s.fecha_programada}) · ${s.estado_asistencia}`}
                  className={`h-6 min-w-7 rounded-sm border px-1.5 font-mono text-[9.5px] font-semibold transition-colors ${CLASE_SESION_CHIP[s.estado_asistencia]} ${abierta ? 'ring-1 ring-white' : ''}`}
                >
                  C{s.numero_sesion}:{SIGLA_SESION[s.estado_asistencia]}
                </button>
              );
            })}
          </div>

          {sesionActiva && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[9.5px]">
              <span className="text-zinc-400">
                Clase {sesionActiva.numero_sesion} ({sesionActiva.fecha_programada}):
              </span>
              <button
                type="button"
                disabled={pendienteAsis}
                onClick={() => cambiarAsistencia(sesionActiva, 'PRESENTE')}
                className="rounded-sm border border-emerald-500/50 bg-emerald-950/40 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                Presente
              </button>
              <button
                type="button"
                disabled={pendienteAsis}
                onClick={() => cambiarAsistencia(sesionActiva, 'AUSENTE_JUSTIFICADO')}
                className="rounded-sm border border-amber-500/50 bg-amber-950/40 px-2 py-0.5 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
              >
                Justif.
              </button>
              <button
                type="button"
                disabled={pendienteAsis}
                onClick={() => cambiarAsistencia(sesionActiva, 'AUSENTE_INJUSTIFICADO')}
                className="rounded-sm border border-red-500/50 bg-red-950/40 px-2 py-0.5 text-red-300 hover:bg-red-500/20 disabled:opacity-50"
              >
                Injustif.
              </button>
              <button
                type="button"
                disabled={pendienteAsis}
                onClick={() =>
                  cambiarAsistencia(
                    sesionActiva,
                    'REPROGRAMADA',
                    viernesSugeridos[0]
                  )
                }
                className="inline-flex items-center gap-1 rounded-sm border border-cyan-500/50 bg-cyan-950/40 px-2 py-0.5 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                <CalendarClock size={10} aria-hidden />
                Viernes Buffer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GrillaDuplas({
  cohorteId,
  configuracionCursado,
  postulantes,
  duplasPersistidas,
  sesionesPractica,
  viernesSugeridos,
  onAbrirPostulante,
}: Props) {
  const router = useRouter();
  const ordenados = useMemo(
    () => [...postulantes].sort((a, b) => a.ranking_orden - b.ranking_orden),
    [postulantes]
  );
  const activos = useMemo(
    () => ordenados.filter((p) => p.estado !== 'DESCARTADO'),
    [ordenados]
  );
  const descartados = useMemo(
    () => ordenados.filter((p) => p.estado === 'DESCARTADO'),
    [ordenados]
  );

  const gruposActivosCount = configuracionCursado.dias_grupo_b.length > 0 ? 2 : 1;
  const cupoGrilla =
    Math.max(1, configuracionCursado.franjas_activas.length) *
    gruposActivosCount *
    2;

  const estructura = useMemo(
    () => calcularEstructuraGruposYDuplasDinamica(cupoGrilla, configuracionCursado),
    [cupoGrilla, configuracionCursado]
  );

  const [slotsMap, setSlotsMap] = useState<Record<string, { a1: string; a2: string }>>(
    () => construirMapaInicial(estructura.duplas, duplasPersistidas, activos)
  );
  const [modoEdicion, setModoEdicion] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null
  );
  const [pendienteSync, startSyncTransition] = useTransition();

  useEffect(() => {
    setSlotsMap(construirMapaInicial(estructura.duplas, duplasPersistidas, activos));
  }, [estructura.duplas, duplasPersistidas, activos]);

  const porPostulanteId = useMemo(() => {
    const map = new Map<string, PostulanteFila>();
    for (const p of postulantes) map.set(p.postulante_id, p);
    return map;
  }, [postulantes]);

  const sesionesPorAlumno = useMemo(() => {
    const map = new Map<string, SesionPracticaItem[]>();
    for (const s of sesionesPractica) {
      const lista = map.get(s.alumno_id) ?? [];
      lista.push(s);
      map.set(s.alumno_id, lista);
    }
    return map;
  }, [sesionesPractica]);

  const asignadosSet = useMemo(() => {
    const set = new Set<string>();
    for (const val of Object.values(slotsMap)) {
      if (val.a1) set.add(val.a1);
      if (val.a2) set.add(val.a2);
    }
    return set;
  }, [slotsMap]);

  const suplentes = useMemo(
    () => activos.filter((p) => !asignadosSet.has(p.postulante_id)),
    [activos, asignadosSet]
  );

  const duplasGrupoA = estructura.duplas.filter((d) => d.grupo === 'GRUPO_A');
  const duplasGrupoB = estructura.duplas.filter((d) => d.grupo === 'GRUPO_B');

  const totalConTitan = useMemo(
    () =>
      activos.filter(
        (p) =>
          asignadosSet.has(p.postulante_id) &&
          (Boolean(p.evaluacion?.telemetria_metricas) ||
            Boolean(p.evaluacion?.informe_ia) ||
            Boolean(p.evaluacion?.telemetria.tiene_datos))
      ).length,
    [activos, asignadosSet]
  );

  function actualizarPuesto(
    slotKey: string,
    campo: 'a1' | 'a2',
    nuevoPostulanteId: string
  ) {
    setFeedback(null);
    setSlotsMap((prev) => {
      const actual = prev[slotKey] ?? { a1: '', a2: '' };
      return {
        ...prev,
        [slotKey]: {
          ...actual,
          [campo]: nuevoPostulanteId,
        },
      };
    });
  }

  function restaurarPorRanking() {
    setFeedback(null);
    setSlotsMap(construirMapaInicial(estructura.duplas, [], activos));
  }

  function sincronizarConDB() {
    setFeedback(null);
    const usados = new Set<string>();
    const asignacionesValidas: Array<{
      grupo: DuplaPlanificadaItem['grupo'];
      franja: DuplaPlanificadaItem['franja'];
      alumno_1_id: string;
      alumno_2_id: string;
    }> = [];
    let paresIncompletos = 0;

    for (const slot of estructura.duplas) {
      const par = slotsMap[claveSlot(slot)] ?? { a1: '', a2: '' };
      if (!par.a1 && !par.a2) continue;
      if (!par.a1 || !par.a2) {
        paresIncompletos += 1;
        continue;
      }
      if (par.a1 === par.a2) {
        setFeedback({
          tipo: 'error',
          texto: `La Dupla #${slot.duplaNumero} tiene asignado al mismo postulante en ambos puestos.`,
        });
        return;
      }
      if (usados.has(par.a1) || usados.has(par.a2)) {
        setFeedback({
          tipo: 'error',
          texto: 'Un postulante aparece duplicado en más de una dupla. Corregí antes de sincronizar.',
        });
        return;
      }
      usados.add(par.a1);
      usados.add(par.a2);
      asignacionesValidas.push({
        grupo: slot.grupo,
        franja: slot.franja,
        alumno_1_id: par.a1,
        alumno_2_id: par.a2,
      });
    }

    if (asignacionesValidas.length === 0) {
      setFeedback({
        tipo: 'error',
        texto: 'Se necesita al menos una dupla completa (2 postulantes) para sincronizar en DB.',
      });
      return;
    }

    startSyncTransition(async () => {
      const res = await sincronizarDuplasYSesionesAction({
        cohorte_id: cohorteId,
        asignaciones: asignacionesValidas,
      });
      if (!res.ok) {
        setFeedback({ tipo: 'error', texto: res.error });
        return;
      }
      const notaIncompleta =
        paresIncompletos > 0
          ? ` (${paresIncompletos} dupla/s impar omitida/s por falta de compañero)`
          : '';
      const notaAdv = res.advertencia ? ` · ${res.advertencia}` : '';
      setFeedback({
        tipo: 'ok',
        texto: `Sincronizado: ${res.duplasGuardadas} duplas y ${res.sesionesGeneradas} sesiones planificadas${notaIncompleta}${notaAdv}.`,
      });
      setModoEdicion(false);
      router.refresh();
    });
  }

  function renderGrupo(
    titulo: string,
    colorClase: string,
    bordeClase: string,
    duplasLista: DuplaPlanificadaItem[]
  ) {
    return (
      <section aria-label={titulo} className="space-y-2.5">
        <p className={`font-mono text-[10.5px] font-semibold tracking-[0.14em] ${colorClase}`}>
          {titulo}
        </p>
        <div className="space-y-2.5">
          {duplasLista.map((dupla) => {
            const key = claveSlot(dupla);
            const par = slotsMap[key] ?? { a1: '', a2: '' };
            const alumno1 = par.a1 ? (porPostulanteId.get(par.a1) ?? null) : null;
            const alumno2 = par.a2 ? (porPostulanteId.get(par.a2) ?? null) : null;
            const ocupados = (alumno1 ? 1 : 0) + (alumno2 ? 1 : 0);

            return (
              <article
                key={dupla.duplaNumero}
                className={`rounded-sm border ${bordeClase} bg-zinc-950 p-3`}
              >
                <header className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-800 pb-1.5 font-mono text-[10.5px]">
                  <span className="font-semibold tracking-[0.12em] text-white">
                    DUPLA #{dupla.duplaNumero} · {dupla.horarioLabel}
                  </span>
                  <span className={colorClase}>
                    {dupla.grupo === 'GRUPO_A' ? 'A' : 'B'} ({dupla.diasLabel}) · {ocupados}/2
                  </span>
                </header>

                {modoEdicion ? (
                  <div className="space-y-2">
                    {(['a1', 'a2'] as const).map((campo, idxPuesto) => {
                      const valActual = par[campo];
                      const puestoN = idxPuesto === 0 ? dupla.puestoDesde : dupla.puestoHasta;
                      return (
                        <label key={campo} className="block space-y-1">
                          <span className="font-mono text-[9.5px] tracking-[0.1em] text-zinc-500">
                            PUESTO #{puestoN}
                          </span>
                          <select
                            value={valActual}
                            onChange={(e) => actualizarPuesto(key, campo, e.target.value)}
                            className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
                          >
                            <option value="">— VACANTE —</option>
                            {activos.map((p) => (
                              <option key={p.postulante_id} value={p.postulante_id}>
                                #{p.ranking_orden} {p.nombre_completo} (DNI {p.dni})
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <TarjetaAlumnoDupla
                      puesto={dupla.puestoDesde}
                      postulante={alumno1}
                      sesiones={alumno1 ? (sesionesPorAlumno.get(alumno1.postulante_id) ?? []) : []}
                      viernesSugeridos={viernesSugeridos}
                      cohorteId={cohorteId}
                      onAbrirPostulante={onAbrirPostulante}
                      onSesionActualizada={() => router.refresh()}
                    />
                    <TarjetaAlumnoDupla
                      puesto={dupla.puestoHasta}
                      postulante={alumno2}
                      sesiones={alumno2 ? (sesionesPorAlumno.get(alumno2.postulante_id) ?? []) : []}
                      viernesSugeridos={viernesSugeridos}
                      cohorteId={cohorteId}
                      onAbrirPostulante={onAbrirPostulante}
                      onSesionActualizada={() => router.refresh()}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 font-mono text-[10.5px] tracking-[0.08em]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-zinc-200">
            <Layers size={13} strokeWidth={1.75} className="text-emerald-400" aria-hidden />
            TITULARES EN DUPLAS:{' '}
            <strong className="text-white">
              {asignadosSet.size}/{cupoGrilla}
            </strong>
          </span>
          {duplasPersistidas.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-950/30 px-2 py-0.5 text-[9.5px] text-emerald-300">
              <CheckCircle2 size={11} aria-hidden />
              SYNC DB ({duplasPersistidas.length} DUPLAS · {sesionesPractica.length} SESIONES)
            </span>
          ) : (
            <span className="rounded-sm border border-amber-500/40 bg-amber-950/30 px-2 py-0.5 text-[9.5px] text-amber-300">
              BORRADOR POR RANKING · PENDIENTE DE SYNC
            </span>
          )}
          <span className="text-cyan-300">
            CON TITÁN: <strong>{totalConTitan}</strong>
          </span>
          {suplentes.length > 0 && (
            <span className="text-amber-300">
              RESERVA: <strong>{suplentes.length}</strong>
            </span>
          )}
          {descartados.length > 0 && (
            <span className="text-zinc-500">
              BAJAS: <strong>{descartados.length}</strong>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModoEdicion((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-3 font-mono text-[10px] tracking-[0.1em] text-zinc-200 hover:border-zinc-500 hover:text-white"
          >
            <Edit3 size={12} aria-hidden />
            {modoEdicion ? 'VER TARJETAS' : 'REASIGNAR DUPLAS'}
          </button>
          {modoEdicion && (
            <button
              type="button"
              onClick={restaurarPorRanking}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-3 font-mono text-[10px] tracking-[0.1em] text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              <RotateCcw size={12} aria-hidden />
              AUTO POR RANKING
            </button>
          )}
          <button
            type="button"
            disabled={pendienteSync}
            onClick={sincronizarConDB}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-emerald-500 bg-emerald-500 px-3.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            <RefreshCw size={12} className={pendienteSync ? 'animate-spin' : ''} aria-hidden />
            {pendienteSync ? 'SINCRONIZANDO…' : 'SINCRONIZAR DUPLAS Y SESIONES'}
          </button>
        </div>
      </div>

      {feedback && (
        <p
          role={feedback.tipo === 'error' ? 'alert' : 'status'}
          className={`rounded-sm border px-3 py-2 font-mono text-[11px] ${
            feedback.tipo === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
              : 'border-red-500/40 bg-red-950/30 text-red-200'
          }`}
        >
          {feedback.texto}
        </p>
      )}

      <div className={`grid gap-4 ${duplasGrupoB.length > 0 ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {renderGrupo(
          `GRUPO A · DUPLAS 1 A ${duplasGrupoA.length} (${formatearDiasGrupoCorto(configuracionCursado.dias_grupo_a)})`,
          'text-emerald-400',
          'border-emerald-500/25',
          duplasGrupoA
        )}
        {duplasGrupoB.length > 0 &&
          renderGrupo(
            `GRUPO B · DUPLAS ${duplasGrupoA.length + 1} A ${duplasGrupoA.length + duplasGrupoB.length} (${formatearDiasGrupoCorto(configuracionCursado.dias_grupo_b)})`,
            'text-cyan-400',
            'border-cyan-500/25',
            duplasGrupoB
          )}
      </div>

      {/* ── Nómina en reserva ──────────────────────────────────────── */}
      {suplentes.length > 0 && (
        <section
          aria-label="Nómina de reserva o suplentes"
          className="space-y-2 rounded-sm border border-amber-500/30 bg-zinc-950 p-3"
        >
          <p className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-amber-300">
            RESERVA / SUPLENTES ({suplentes.length}) · FUERA DE LAS DUPLAS ACTIVAS
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {suplentes.map((p, idx) => (
              <TarjetaAlumnoDupla
                key={p.inscripcion_id}
                puesto={cupoGrilla + 1 + idx}
                postulante={p}
                sesiones={sesionesPorAlumno.get(p.postulante_id) ?? []}
                viernesSugeridos={viernesSugeridos}
                cohorteId={cohorteId}
                onAbrirPostulante={onAbrirPostulante}
                onSesionActualizada={() => router.refresh()}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
