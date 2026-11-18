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
  CONFIRMADO: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  DISPONIBLE: 'border border-slate-200 bg-slate-100 text-slate-700',
  DESCARTADO: 'border border-rose-200 bg-rose-50 text-rose-700',
};

const CLASE_SESION_CHIP: Record<EstadoAsistenciaUI, string> = {
  PRESENTE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  AUSENTE_JUSTIFICADO: 'border-amber-200 bg-amber-50 text-amber-800',
  AUSENTE_INJUSTIFICADO: 'border-rose-200 bg-rose-50 text-rose-700',
  REPROGRAMADA: 'border-blue-200 bg-blue-50 text-blue-700',
  PENDIENTE: 'border-slate-200 bg-slate-50 text-slate-500',
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
      <div className="flex min-h-[76px] items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <User size={14} strokeWidth={1.75} aria-hidden />
          <span>Puesto #{puesto} · Libre</span>
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
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:border-slate-300">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => onAbrirPostulante(postulante.inscripcion_id, false)}
          aria-label={`Ver legajo de ${postulante.nombre_completo}`}
          className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-700">
              #{postulante.ranking_orden}
            </span>
            <span className="truncate text-sm font-bold text-slate-900">
              {postulante.nombre_completo}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${CLASE_ESTADO_BADGE[postulante.estado]}`}
            >
              {postulante.estado}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
            <span>DNI {postulante.dni}</span>
            <span>· {postulante.origen_turno}</span>
            {scoreMostrable !== null && (
              <span className="font-semibold text-slate-900">· {scoreMostrable} pts</span>
            )}
            {sesiones.length > 0 && (
              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                Asist. {presentes}/{sesiones.length}
              </span>
            )}
            {evalData?.hard_fail && (
              <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                Falta grave
              </span>
            )}
            {tieneIA ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                <Sparkles size={11} strokeWidth={2} aria-hidden />
                Informe listo
              </span>
            ) : tieneJson || tieneTitanLegacy ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                <FileJson size={11} strokeWidth={2} aria-hidden />
                Reporte cargado
              </span>
            ) : null}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onAbrirPostulante(postulante.inscripcion_id, true)}
          aria-label={`Ver reportes del simulador de ${postulante.nombre_completo}`}
          className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <span>Reportes</span>
        </button>
      </div>

      {sesiones.length > 0 && (
        <div className="space-y-2 border-t border-slate-200 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-slate-500">
              Clases:
            </span>
            {sesiones.map((s) => {
              const abierta = sesionAbiertaId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSesionAbiertaId(abierta ? null : s.id)}
                  title={`Clase ${s.numero_sesion} (${s.fecha_programada}) · ${s.estado_asistencia}`}
                  className={`h-7 min-w-8 rounded-md border px-2 text-xs font-semibold transition-colors ${CLASE_SESION_CHIP[s.estado_asistencia]} ${abierta ? 'ring-2 ring-blue-500' : ''}`}
                >
                  C{s.numero_sesion}:{SIGLA_SESION[s.estado_asistencia]}
                </button>
              );
            })}
          </div>

          {sesionActiva && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 text-xs">
              <span className="font-medium text-slate-700">
                Clase {sesionActiva.numero_sesion} ({sesionActiva.fecha_programada}):
              </span>
              <button
                type="button"
                disabled={pendienteAsis}
                onClick={() => cambiarAsistencia(sesionActiva, 'PRESENTE')}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                Presente
              </button>
              <button
                type="button"
                disabled={pendienteAsis}
                onClick={() => cambiarAsistencia(sesionActiva, 'AUSENTE_JUSTIFICADO')}
                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                Justificada
              </button>
              <button
                type="button"
                disabled={pendienteAsis}
                onClick={() => cambiarAsistencia(sesionActiva, 'AUSENTE_INJUSTIFICADO')}
                className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                Injustificada
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
                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <CalendarClock size={12} aria-hidden />
                Recuperar Viernes
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
      <section aria-label={titulo} className="space-y-3">
        <p className={`text-xs font-bold uppercase tracking-wider ${colorClase}`}>
          {titulo}
        </p>
        <div className="space-y-3">
          {duplasLista.map((dupla) => {
            const key = claveSlot(dupla);
            const par = slotsMap[key] ?? { a1: '', a2: '' };
            const alumno1 = par.a1 ? (porPostulanteId.get(par.a1) ?? null) : null;
            const alumno2 = par.a2 ? (porPostulanteId.get(par.a2) ?? null) : null;
            const ocupados = (alumno1 ? 1 : 0) + (alumno2 ? 1 : 0);

            return (
              <article
                key={dupla.duplaNumero}
                className={`rounded-xl border ${bordeClase} bg-white p-4 shadow-sm`}
              >
                <header className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                  <span className="font-bold text-slate-900">
                    Dupla #{dupla.duplaNumero} · {dupla.horarioLabel}
                  </span>
                  <span className={`font-semibold ${colorClase}`}>
                    {dupla.grupo === 'GRUPO_A' ? 'Grupo A' : 'Grupo B'} ({dupla.diasLabel}) · {ocupados}/2
                  </span>
                </header>

                {modoEdicion ? (
                  <div className="space-y-2.5">
                    {(['a1', 'a2'] as const).map((campo, idxPuesto) => {
                      const valActual = par[campo];
                      const puestoN = idxPuesto === 0 ? dupla.puestoDesde : dupla.puestoHasta;
                      return (
                        <label key={campo} className="block space-y-1">
                          <span className="text-xs font-semibold text-slate-600">
                            Puesto #{puestoN}
                          </span>
                          <select
                            value={valActual}
                            onChange={(e) => actualizarPuesto(key, campo, e.target.value)}
                            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="">— Vacante —</option>
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
                  <div className="space-y-2.5">
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <Layers size={14} strokeWidth={1.75} className="text-blue-600" aria-hidden />
            Titulares en duplas:{' '}
            <strong className="text-slate-900">
              {asignadosSet.size}/{cupoGrilla}
            </strong>
          </span>
          {duplasPersistidas.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={12} aria-hidden />
              Guardado ({duplasPersistidas.length} duplas · {sesionesPractica.length} clases)
            </span>
          ) : (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Borrador sugerido · Falta guardar
            </span>
          )}
          <span className="font-semibold text-blue-700">
            Con reporte: <strong>{totalConTitan}</strong>
          </span>
          {suplentes.length > 0 && (
            <span className="font-semibold text-amber-800">
              En espera: <strong>{suplentes.length}</strong>
            </span>
          )}
          {descartados.length > 0 && (
            <span className="text-slate-500">
              Bajas: <strong>{descartados.length}</strong>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModoEdicion((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Edit3 size={13} aria-hidden />
            {modoEdicion ? 'Ver tarjetas' : 'Reasignar duplas'}
          </button>
          {modoEdicion && (
            <button
              type="button"
              onClick={restaurarPorRanking}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw size={13} aria-hidden />
              Auto por orden
            </button>
          )}
          <button
            type="button"
            disabled={pendienteSync}
            onClick={sincronizarConDB}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={13} className={pendienteSync ? 'animate-spin' : ''} aria-hidden />
            {pendienteSync ? 'Guardando…' : 'Guardar duplas y clases'}
          </button>
        </div>
      </div>

      {feedback && (
        <p
          role={feedback.tipo === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            feedback.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.texto}
        </p>
      )}

      <div className={`grid gap-5 ${duplasGrupoB.length > 0 ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {renderGrupo(
          `Grupo A · Duplas 1 a ${duplasGrupoA.length} (${formatearDiasGrupoCorto(configuracionCursado.dias_grupo_a)})`,
          'text-emerald-700',
          'border-slate-200',
          duplasGrupoA
        )}
        {duplasGrupoB.length > 0 &&
          renderGrupo(
            `Grupo B · Duplas ${duplasGrupoA.length + 1} a ${duplasGrupoA.length + duplasGrupoB.length} (${formatearDiasGrupoCorto(configuracionCursado.dias_grupo_b)})`,
            'text-blue-700',
            'border-slate-200',
            duplasGrupoB
          )}
      </div>

      {suplentes.length > 0 && (
        <section
          aria-label="Alumnos en lista de espera"
          className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Lista de espera / Suplentes ({suplentes.length})
          </p>
          <div className="grid gap-3 md:grid-cols-2">
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
