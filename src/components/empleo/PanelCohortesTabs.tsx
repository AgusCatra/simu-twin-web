'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  FileText,
  FileUp,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { ResumenImpactoIndustrialCohorte } from '@/lib/telemetria/analitica-predictiva';
import { guardarDecisionInstructorAction } from '@/services/empleo';
import type {
  CohorteActiva,
  ConfiguracionCursadoCohorte,
  DecisionInstructorT0,
  DuplaPersistidaItem,
  FranjaCabina,
  PostulanteFila,
  ResumenPasadaSimulador,
  SesionPracticaItem,
} from '@/types/empleo';
import DrawerPostulante from './DrawerPostulante';
import GrillaDuplas from './GrillaDuplas';
import ModalLoteTelemetria from './ModalLoteTelemetria';
import PanelPatioYEgreso from './PanelPatioYEgreso';

type TabPasoId = 'paso1' | 'paso2' | 'paso3' | 'paso4';

interface Props {
  cohorteId: string;
  cohorteCodigo: string;
  cohorte: CohorteActiva;
  configuracionCursado: ConfiguracionCursadoCohorte;
  postulantes: PostulanteFila[];
  franjas: FranjaCabina[];
  duplasPersistidas: DuplaPersistidaItem[];
  sesionesPractica: SesionPracticaItem[];
  viernesSugeridos: string[];
  impactoIndustrial?: ResumenImpactoIndustrialCohorte | null;
  cronogramaNode?: ReactNode;
  parrillaLegacyNode?: ReactNode;
}

const ETIQUETA_PERFIL: Record<string, string> = {
  EFICIENTE: 'Eficiente',
  APURADO: 'Apurado',
  INEFICIENTE: 'Ineficiente',
  SIN_NOCION_ESPACIO: 'Sin noción espacio',
  NOVATO: 'Novato',
};

const CLASE_PERFIL: Record<string, string> = {
  EFICIENTE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  APURADO: 'border-amber-200 bg-amber-50 text-amber-800',
  INEFICIENTE: 'border-blue-200 bg-blue-50 text-blue-700',
  SIN_NOCION_ESPACIO: 'border-orange-200 bg-orange-50 text-orange-800',
  NOVATO: 'border-rose-200 bg-rose-50 text-rose-700',
};

function fmtSeg(seg: number | null | undefined): string {
  if (typeof seg !== 'number' || !Number.isFinite(seg) || seg < 0) return '—';
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function CeldaPasada({
  pasada,
  etiquetaVacia = 'Sin reporte',
}: {
  pasada?: ResumenPasadaSimulador | null;
  etiquetaVacia?: string;
}) {
  if (!pasada || pasada.score_puntos === null) {
    return <span className="text-xs text-slate-400">{etiquetaVacia}</span>;
  }
  return (
    <div className="space-y-0.5 text-xs">
      <p className="font-bold text-slate-900 tabular-nums">
        {pasada.score_puntos} pts
      </p>
      <p className="text-[11px] text-slate-600 tabular-nums">
        {fmtSeg(pasada.tiempo_seg)} · {pasada.colisiones ?? 0} choques
      </p>
    </div>
  );
}

function seleccionarMejorT0(p: PostulanteFila): ResumenPasadaSimulador | null {
  const v1 = p.v1_diagnostico ?? null;
  const v2 = p.v2_diagnostico ?? null;
  if (v1 && v2) {
    const s1 = v1.score_puntos ?? -Infinity;
    const s2 = v2.score_puntos ?? -Infinity;
    return s2 >= s1 ? v2 : v1;
  }
  if (v2) return v2;
  if (v1) return v1;
  if (p.evaluacion?.telemetria.tiene_datos) {
    return {
      score_puntos: p.evaluacion.telemetria.score_puntos,
      tiempo_seg: p.evaluacion.telemetria.tiempo_vuelta_seg,
      colisiones: p.evaluacion.telemetria.colisiones,
      cuidado_mecanico:
        p.analitica?.cuidadoInicial?.indiceCuidadoMecanico ??
        p.analitica?.cuidadoMecanico?.indiceCuidadoMecanico ??
        null,
    };
  }
  return null;
}

function formatearDelta(
  valor: number | null,
  sufijo: string,
  mayorEsMejor: boolean
): { texto: string; clase: string } {
  if (valor === null || !Number.isFinite(valor)) {
    return { texto: '—', clase: 'text-slate-400' };
  }
  const red = Number.isInteger(valor) ? valor : Math.round(valor * 10) / 10;
  if (red === 0) {
    return { texto: `0${sufijo}`, clase: 'text-slate-600' };
  }
  const mejora = mayorEsMejor ? red > 0 : red < 0;
  const signo = red > 0 ? '+' : '';
  return {
    texto: `${signo}${red}${sufijo}`,
    clase: mejora ? 'font-bold text-emerald-700' : 'font-bold text-rose-700',
  };
}

export default function PanelCohortesTabs({
  cohorteId,
  cohorteCodigo,
  cohorte,
  configuracionCursado,
  postulantes,
  franjas,
  duplasPersistidas,
  sesionesPractica,
  viernesSugeridos,
  impactoIndustrial,
  cronogramaNode,
  parrillaLegacyNode,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabPasoId>('paso1');
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [enfocarTitan, setEnfocarTitan] = useState(false);
  const [enfocarSignal, setEnfocarSignal] = useState(0);
  const [imprimirSignal, setImprimirSignal] = useState(0);
  const [modalLoteAbierto, setModalLoteAbierto] = useState(false);

  // Filtro y decisión directa en Paso 1
  const [busquedaPaso1, setBusquedaPaso1] = useState('');
  const [filtroDecision, setFiltroDecision] = useState<
    'TODOS' | 'APROBADO_A_CAPACITACION' | 'PENDIENTE' | 'RECHAZADO'
  >('TODOS');
  const [decisionesLocales, setDecisionesLocales] = useState<
    Record<string, DecisionInstructorT0>
  >({});
  const [guardandoDecisionId, setGuardandoDecisionId] = useState<string | null>(
    null
  );
  const [errorPaso1, setErrorPaso1] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const postulanteActivo =
    seleccionadoId !== null
      ? postulantes.find((p) => p.inscripcion_id === seleccionadoId) ?? null
      : null;

  function abrirPostulante(inscripcionId: string, conFocoTitan = false) {
    setSeleccionadoId(inscripcionId);
    setEnfocarTitan(conFocoTitan);
    if (conFocoTitan) {
      setEnfocarSignal((prev) => prev + 1);
    }
  }

  function imprimirLegajoDesdePaso4(inscripcionId: string) {
    setSeleccionadoId(inscripcionId);
    setEnfocarTitan(false);
    setImprimirSignal((prev) => prev + 1);
  }

  function resolverDecisionT0(p: PostulanteFila): DecisionInstructorT0 {
    if (decisionesLocales[p.postulante_id]) {
      return decisionesLocales[p.postulante_id];
    }
    const dec = p.decision_instructor?.decision_t0;
    if (
      dec === 'APROBADO_A_CAPACITACION' ||
      dec === 'PENDIENTE' ||
      dec === 'RECHAZADO'
    ) {
      return dec;
    }
    return p.estado === 'CONFIRMADO'
      ? 'APROBADO_A_CAPACITACION'
      : p.estado === 'DESCARTADO'
        ? 'RECHAZADO'
        : 'PENDIENTE';
  }

  function cambiarDecisionT0(
    p: PostulanteFila,
    nuevaDecision: DecisionInstructorT0
  ) {
    setErrorPaso1(null);
    setGuardandoDecisionId(p.postulante_id);
    setDecisionesLocales((prev) => ({
      ...prev,
      [p.postulante_id]: nuevaDecision,
    }));

    startTransition(async () => {
      try {
        const res = await guardarDecisionInstructorAction({
          cohorte_id: cohorteId,
          postulante_id: p.postulante_id,
          inscripcion_id: p.inscripcion_id,
          decision_t0: nuevaDecision,
        });
        if (!res.ok) {
          setErrorPaso1(res.error ?? 'No se pudo guardar la decisión.');
        } else {
          router.refresh();
        }
      } finally {
        setGuardandoDecisionId(null);
      }
    });
  }

  const practicasIntermediasCohorte = useMemo(() => {
    const lista: Array<{
      id: string;
      inscripcionId: string;
      nombreAlumno: string;
      dni: string;
      exerciseName: string;
      fecha: string;
      scorePuntos: number | null;
      colisiones: number | null;
      cuidadoMecanico: number | null;
    }> = [];

    for (const p of postulantes) {
      const items = p.evaluacion?.practicas_intermedias ?? [];
      for (const it of items) {
        lista.push({
          id: it.id,
          inscripcionId: p.inscripcion_id,
          nombreAlumno: p.nombre_completo,
          dni: p.dni,
          exerciseName: it.exercise_name,
          fecha: it.fecha ? it.fecha.slice(0, 10) : 'Fecha s/d',
          scorePuntos: it.score_puntos,
          colisiones: it.colisiones,
          cuidadoMecanico: it.indice_cuidado_mecanico,
        });
      }
    }
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [postulantes]);

  const aprobadosPaso1 = postulantes.filter(
    (p) => resolverDecisionT0(p) === 'APROBADO_A_CAPACITACION'
  ).length;
  const conFinalPaso3 = postulantes.filter(
    (p) => Boolean(p.prueba_final)
  ).length;

  const qPaso1 = busquedaPaso1.trim().toLowerCase();
  const postulantesPaso1 = postulantes.filter((p) => {
    if (qPaso1) {
      const coincide =
        p.nombre_completo.toLowerCase().includes(qPaso1) ||
        p.dni.toLowerCase().includes(qPaso1);
      if (!coincide) return false;
    }
    if (filtroDecision !== 'TODOS') {
      return resolverDecisionT0(p) === filtroDecision;
    }
    return true;
  });

  const postulantesLoteRef = postulantes.map((p) => ({
    postulante_id: p.postulante_id,
    nombre_completo: p.nombre_completo,
    dni: p.dni,
  }));

  const tabs: Array<{
    id: TabPasoId;
    label: string;
    badge?: string;
    icon: typeof ClipboardCheck;
  }> = [
    {
      id: 'paso1',
      label: '1. Prueba de Diagnóstico',
      badge: String(postulantes.length),
      icon: ClipboardCheck,
    },
    {
      id: 'paso2',
      label: '2. Capacitación en Simulador (Duplas y Asistencia)',
      badge: aprobadosPaso1 > 0 ? String(aprobadosPaso1) : undefined,
      icon: CalendarClock,
    },
    {
      id: 'paso3',
      label: '3. Prueba Final y Comparación',
      badge: conFinalPaso3 > 0 ? String(conFinalPaso3) : undefined,
      icon: TrendingUp,
    },
    {
      id: 'paso4',
      label: '4. Práctica Real en Patio y Egreso',
      icon: Award,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Navegación de 4 Pasos Cronológicos */}
      <div
        role="tablist"
        aria-label="Etapas cronológicas de la cohorte"
        className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 xl:grid-cols-4"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const activo = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setTab(item.id)}
              className={`inline-flex min-h-[44px] items-center justify-between gap-2 rounded-lg border px-3.5 py-2 text-left text-xs font-semibold transition-colors sm:text-sm ${
                activo
                  ? 'border-blue-200 bg-blue-50 text-blue-800 shadow-2xs'
                  : 'border-transparent bg-slate-50/70 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon
                  size={16}
                  strokeWidth={1.9}
                  className={activo ? 'shrink-0 text-blue-700' : 'shrink-0 text-slate-500'}
                  aria-hidden
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                    activo
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* PASO 1: 1. Prueba de Diagnóstico */}
      {tab === 'paso1' && (
        <section
          aria-label="Paso 1: Prueba de Diagnóstico"
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Paso 1 · Prueba de Diagnóstico ({cohorteCodigo})
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Subí los reportes del simulador (1.ª y 2.ª pasada), revisá la nota de Tablet y definí qué alumnos pasan a la Capacitación en Simulador.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalLoteAbierto(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700"
            >
              <FileUp size={15} strokeWidth={1.9} aria-hidden />
              Subir Reportes del Simulador (.PDF / .JSON)
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] flex-1 max-w-sm">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={busquedaPaso1}
                onChange={(e) => setBusquedaPaso1(e.target.value)}
                placeholder="Buscar alumno o DNI…"
                className="h-9 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['TODOS', `Todos (${postulantes.length})`],
                  ['APROBADO_A_CAPACITACION', `Aprobados (${aprobadosPaso1})`],
                  ['PENDIENTE', 'Pendientes'],
                  ['RECHAZADO', 'No Aprueba'],
                ] as const
              ).map(([clave, texto]) => (
                <button
                  key={clave}
                  type="button"
                  onClick={() => setFiltroDecision(clave)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filtroDecision === clave
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
          </div>

          {errorPaso1 && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
            >
              {errorPaso1}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3.5 py-3">Postulante</th>
                  <th className="px-3.5 py-3">1.ª Pasada (V1)</th>
                  <th className="px-3.5 py-3">2.ª Pasada (V2)</th>
                  <th className="px-3.5 py-3">Perfil &amp; Cuidado</th>
                  <th className="px-3.5 py-3">Tablet (4 Ejes)</th>
                  <th className="px-3.5 py-3">Decisión Instructor</th>
                  <th className="px-3.5 py-3 text-right">Ficha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {postulantesPaso1.map((p) => {
                  const decisionActual = resolverDecisionT0(p);
                  const guardando = guardandoDecisionId === p.postulante_id;
                  const perfil = p.evaluacion?.perfil_operador ?? p.analitica?.perfilInicial ?? null;
                  const cuidadoPct =
                    p.analitica?.cuidadoInicial?.indiceCuidadoMecanico ??
                    p.analitica?.cuidadoMecanico?.indiceCuidadoMecanico ??
                    null;

                  return (
                    <tr key={p.inscripcion_id} className="hover:bg-slate-50/80">
                      <td className="px-3.5 py-3">
                        <button
                          type="button"
                          onClick={() => abrirPostulante(p.inscripcion_id)}
                          className="text-left font-bold text-slate-900 hover:text-blue-700 hover:underline"
                        >
                          {p.nombre_completo}
                        </button>
                        <p className="text-[11px] text-slate-500">
                          #{p.ranking_orden} · DNI {p.dni}
                        </p>
                      </td>
                      <td className="px-3.5 py-3">
                        <CeldaPasada pasada={p.v1_diagnostico} />
                      </td>
                      <td className="px-3.5 py-3">
                        <CeldaPasada pasada={p.v2_diagnostico} etiquetaVacia="Sin 2.ª pasada" />
                      </td>
                      <td className="px-3.5 py-3">
                        {perfil ? (
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                              CLASE_PERFIL[perfil] ?? 'border-slate-200 bg-slate-100 text-slate-700'
                            }`}
                          >
                            {ETIQUETA_PERFIL[perfil] ?? perfil}
                          </span>
                        ) : (
                          <span className="text-slate-400">Sin perfil</span>
                        )}
                        <p className="mt-1 text-[11px] text-slate-600 tabular-nums">
                          Cuidado:{' '}
                          <strong>
                            {typeof cuidadoPct === 'number' ? `${cuidadoPct}%` : '—'}
                          </strong>
                        </p>
                      </td>
                      <td className="px-3.5 py-3">
                        {p.evaluacion?.tiene_evaluacion_tablet ? (
                          <div>
                            <p className="font-bold text-emerald-700 tabular-nums">
                              {p.evaluacion.score_tablet ?? '—'}/90 pts
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {(p.evaluacion.dictamen ?? 'Evaluado').replaceAll('_', ' ')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">Sin Tablet</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3">
                        <select
                          aria-label={`Decisión para ${p.nombre_completo}`}
                          disabled={guardando}
                          value={decisionActual}
                          onChange={(e) =>
                            cambiarDecisionT0(
                              p,
                              e.target.value as DecisionInstructorT0
                            )
                          }
                          className={`h-9 rounded-lg border px-2.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                            decisionActual === 'APROBADO_A_CAPACITACION'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : decisionActual === 'RECHAZADO'
                                ? 'border-rose-300 bg-rose-50 text-rose-800'
                                : 'border-amber-300 bg-amber-50 text-amber-900'
                          }`}
                        >
                          <option value="APROBADO_A_CAPACITACION">
                            Aprobado (Pasa a Capacitación)
                          </option>
                          <option value="PENDIENTE">Pendiente</option>
                          <option value="RECHAZADO">No Aprueba</option>
                        </select>
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => abrirPostulante(p.inscripcion_id)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <FileText size={12} aria-hidden />
                          Abrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PASO 2: 2. Capacitación en Simulador (Duplas y Asistencia) */}
      {tab === 'paso2' && (
        <section
          aria-label="Paso 2: Capacitación en Simulador"
          className="space-y-5"
        >
          {cronogramaNode}

          <GrillaDuplas
            cohorteId={cohorteId}
            configuracionCursado={configuracionCursado}
            postulantes={postulantes}
            duplasPersistidas={duplasPersistidas}
            sesionesPractica={sesionesPractica}
            viernesSugeridos={viernesSugeridos}
            onAbrirPostulante={abrirPostulante}
          />

          {/* Ejercicios Intermedios (PRACTICA_INTERMEDIA) */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Sparkles size={16} className="text-blue-600" aria-hidden />
                  Ejercicios Intermedios en Simulador ({practicasIntermediasCohorte.length})
                </h3>
                <p className="text-xs text-slate-600">
                  Prácticas distintas a Medium Load Operation registradas durante el cursado (no alteran el promedio Diagnóstico → Final).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalLoteAbierto(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                <FileUp size={13} aria-hidden />
                Subir Prácticas Intermedias
              </button>
            </div>

            {practicasIntermediasCohorte.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-center text-xs text-slate-500">
                Aún no hay ejercicios intermedios subidos en esta cohorte.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                    <tr>
                      <th className="px-3.5 py-2.5">Alumno</th>
                      <th className="px-3.5 py-2.5">Ejercicio</th>
                      <th className="px-3.5 py-2.5">Fecha</th>
                      <th className="px-3.5 py-2.5">Puntaje</th>
                      <th className="px-3.5 py-2.5">Colisiones</th>
                      <th className="px-3.5 py-2.5">Cuidado Máquina</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {practicasIntermediasCohorte.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-3.5 py-2.5">
                          <button
                            type="button"
                            onClick={() => abrirPostulante(item.inscripcionId)}
                            className="font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                          >
                            {item.nombreAlumno}
                          </button>
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-blue-700">
                          {item.exerciseName}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600">{item.fecha}</td>
                        <td className="px-3.5 py-2.5 font-bold text-slate-900 tabular-nums">
                          {item.scorePuntos !== null ? `${item.scorePuntos} pts` : '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-700 tabular-nums">
                          {item.colisiones ?? 0}
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold text-slate-800 tabular-nums">
                          {typeof item.cuidadoMecanico === 'number'
                            ? `${item.cuidadoMecanico}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {parrillaLegacyNode}
        </section>
      )}

      {/* PASO 3: 3. Prueba Final y Comparación (Evolución) */}
      {tab === 'paso3' && (
        <section
          aria-label="Paso 3: Prueba Final y Comparación"
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <BarChart3 size={18} className="text-blue-600" aria-hidden />
                Paso 3 · Prueba Final y Comparación ({cohorteCodigo})
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Comparativa lado a lado entre Diagnóstico Inicial (Mejor T0) y Prueba Final (Medium Load Operation): diferencia de puntaje, tiempo, choques, cuidado de máquina y Tablet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalLoteAbierto(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700"
            >
              <FileUp size={15} strokeWidth={1.9} aria-hidden />
              Cargar PDFs Finales (.PDF / .JSON)
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3.5 py-3">Alumno</th>
                  <th className="px-3.5 py-3">Diagnóstico Inicial (T0)</th>
                  <th className="px-3.5 py-3">Prueba Final (T1)</th>
                  <th className="px-3.5 py-3">Dif. Puntaje / Tiempo</th>
                  <th className="px-3.5 py-3">Dif. Choques</th>
                  <th className="px-3.5 py-3">Cuidado &amp; Aprendizaje</th>
                  <th className="px-3.5 py-3">Tablet</th>
                  <th className="px-3.5 py-3 text-right">Cargar PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {postulantes
                  .filter((p) => p.estado !== 'DESCARTADO')
                  .map((p) => {
                    const inicial = seleccionarMejorT0(p);
                    const finalT1 = p.prueba_final ?? null;

                    const dScore =
                      inicial?.score_puntos !== null &&
                      inicial?.score_puntos !== undefined &&
                      finalT1?.score_puntos !== null &&
                      finalT1?.score_puntos !== undefined
                        ? formatearDelta(
                            finalT1.score_puntos - inicial.score_puntos,
                            ' pts',
                            true
                          )
                        : formatearDelta(null, ' pts', true);

                    const dTiempo =
                      inicial?.tiempo_seg !== null &&
                      inicial?.tiempo_seg !== undefined &&
                      finalT1?.tiempo_seg !== null &&
                      finalT1?.tiempo_seg !== undefined
                        ? formatearDelta(
                            finalT1.tiempo_seg - inicial.tiempo_seg,
                            ' s',
                            false
                          )
                        : formatearDelta(null, ' s', false);

                    const dColis =
                      inicial?.colisiones !== null &&
                      inicial?.colisiones !== undefined &&
                      finalT1?.colisiones !== null &&
                      finalT1?.colisiones !== undefined
                        ? formatearDelta(
                            finalT1.colisiones - inicial.colisiones,
                            '',
                            false
                          )
                        : formatearDelta(null, '', false);

                    return (
                      <tr key={p.inscripcion_id} className="hover:bg-slate-50/80">
                        <td className="px-3.5 py-3">
                          <button
                            type="button"
                            onClick={() => abrirPostulante(p.inscripcion_id)}
                            className="text-left font-bold text-slate-900 hover:text-blue-700 hover:underline"
                          >
                            {p.nombre_completo}
                          </button>
                          <p className="text-[11px] text-slate-500">DNI {p.dni}</p>
                        </td>
                        <td className="px-3.5 py-3">
                          <CeldaPasada pasada={inicial} etiquetaVacia="Sin T0" />
                        </td>
                        <td className="px-3.5 py-3">
                          <CeldaPasada pasada={finalT1} etiquetaVacia="Pendiente Final" />
                        </td>
                        <td className="px-3.5 py-3 tabular-nums">
                          <p className={dScore.clase}>{dScore.texto}</p>
                          <p className={`text-[11px] ${dTiempo.clase}`}>{dTiempo.texto}</p>
                        </td>
                        <td className="px-3.5 py-3 tabular-nums">
                          <span className={dColis.clase}>{dColis.texto}</span>
                        </td>
                        <td className="px-3.5 py-3">
                          <p className="font-semibold text-slate-800 tabular-nums">
                            Cuidado:{' '}
                            {p.analitica?.cuidadoMecanico
                              ? `${p.analitica.cuidadoMecanico.indiceCuidadoMecanico}%`
                              : '—'}
                          </p>
                          <p className="text-[11px] text-blue-700">
                            {p.analitica?.plasticidad
                              ? `Aprend.: ${p.analitica.plasticidad.indicePlasticidad}/100`
                              : 'Instancia única'}
                          </p>
                        </td>
                        <td className="px-3.5 py-3 tabular-nums">
                          {p.evaluacion?.tiene_evaluacion_tablet ? (
                            <span className="font-semibold text-emerald-700">
                              {p.evaluacion.score_tablet ?? '—'}/90
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => abrirPostulante(p.inscripcion_id, true)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <FileUp size={12} aria-hidden />
                            Subir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PASO 4: 4. Práctica Real en Patio y Egreso (Empresas) */}
      {tab === 'paso4' && (
        <PanelPatioYEgreso
          cohorteId={cohorteId}
          cohorteCodigo={cohorteCodigo}
          postulantes={postulantes}
          impactoIndustrial={impactoIndustrial}
          onAbrirPostulante={abrirPostulante}
          onImprimirLegajo={imprimirLegajoDesdePaso4}
        />
      )}

      <DrawerPostulante
        postulante={postulanteActivo}
        franjas={franjas}
        cohorteId={cohorteId}
        cohorte={cohorte}
        enfocarTitan={enfocarTitan}
        enfocarSignal={enfocarSignal}
        imprimirSignal={imprimirSignal}
        onCerrar={() => setSeleccionadoId(null)}
      />

      {modalLoteAbierto && (
        <ModalLoteTelemetria
          abierto={modalLoteAbierto}
          onCerrar={() => setModalLoteAbierto(false)}
          cohorteId={cohorteId}
          cohorteCodigo={cohorteCodigo}
          postulantes={postulantesLoteRef}
        />
      )}
    </div>
  );
}
