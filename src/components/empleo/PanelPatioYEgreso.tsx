'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  FileText,
  Printer,
  Save,
  Search,
  Wrench,
} from 'lucide-react';
import type { ResumenImpactoIndustrialCohorte } from '@/lib/telemetria/analitica-predictiva';
import { guardarPracticaRealAction } from '@/services/empleo';
import type {
  DecisionInstructorTerreno,
  PostulanteFila,
  ResultadoPracticaReal,
} from '@/types/empleo';
import PanelImpactoIndustrialCohorte from './PanelImpactoIndustrialCohorte';

interface Props {
  cohorteId: string;
  cohorteCodigo: string;
  postulantes: PostulanteFila[];
  impactoIndustrial?: ResumenImpactoIndustrialCohorte | null;
  onAbrirPostulante: (inscripcionId: string, enfocarTitan?: boolean) => void;
  onImprimirLegajo: (inscripcionId: string) => void;
}

interface DraftPatio {
  asistencia: 'PRESENTE' | 'AUSENTE';
  horas: number;
  lat: string;
  man: string;
  mas: string;
  con: string;
  requiereExtra: boolean;
  decision: DecisionInstructorTerreno;
}

function decisionInicial(p: PostulanteFila): DecisionInstructorTerreno {
  const dec = p.practica_real?.decision_instructor_terreno;
  if (dec === 'APROBADO_EMPRESAS' || dec === 'REQUIERE_MAS_HORAS' || dec === 'NO_APTO') {
    return dec;
  }
  const res = p.practica_real?.resultado;
  if (res === 'aprobado') return 'APROBADO_EMPRESAS';
  if (res === 'requiere_refuerzo') return 'REQUIERE_MAS_HORAS';
  if (res === 'no_apto') return 'NO_APTO';
  return 'APROBADO_EMPRESAS';
}

function draftInicial(p: PostulanteFila): DraftPatio {
  const pr = p.practica_real;
  return {
    asistencia: pr?.asistencia_terreno === 'AUSENTE' ? 'AUSENTE' : 'PRESENTE',
    horas: pr?.horas_practica_terreno ?? 1.5,
    lat:
      typeof pr?.puntaje_lateralidad === 'number'
        ? String(pr.puntaje_lateralidad)
        : '',
    man:
      typeof pr?.puntaje_tacto_mandos === 'number'
        ? String(pr.puntaje_tacto_mandos)
        : '',
    mas:
      typeof pr?.puntaje_mastil === 'number' ? String(pr.puntaje_mastil) : '',
    con:
      typeof pr?.puntaje_control_receptividad === 'number'
        ? String(pr.puntaje_control_receptividad)
        : '',
    requiereExtra: Boolean(pr?.requiere_horas_extra),
    decision: decisionInicial(p),
  };
}

function mapearResultado(dec: DecisionInstructorTerreno): ResultadoPracticaReal {
  if (dec === 'APROBADO_EMPRESAS') return 'aprobado';
  if (dec === 'REQUIERE_MAS_HORAS') return 'requiere_refuerzo';
  return 'no_apto';
}

export default function PanelPatioYEgreso({
  cohorteId,
  cohorteCodigo,
  postulantes,
  impactoIndustrial,
  onAbrirPostulante,
  onImprimirLegajo,
}: Props) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DraftPatio>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<
    Record<string, { ok: boolean; texto: string }>
  >({});
  const [, startTransition] = useTransition();

  function obtenerDraft(p: PostulanteFila): DraftPatio {
    return drafts[p.postulante_id] ?? draftInicial(p);
  }

  function actualizarDraft(p: PostulanteFila, patch: Partial<DraftPatio>) {
    const base = obtenerDraft(p);
    setDrafts((prev) => ({
      ...prev,
      [p.postulante_id]: { ...base, ...patch },
    }));
  }

  function guardarPatio(p: PostulanteFila) {
    const d = obtenerDraft(p);
    const numOrNull = (s: string): number | null =>
      s === '0' || s === '10' || s === '20' ? Number(s) : null;

    setGuardandoId(p.postulante_id);
    startTransition(async () => {
      try {
        const res = await guardarPracticaRealAction({
          cohorte_id: cohorteId,
          postulante_id: p.postulante_id,
          fecha_practica:
            p.practica_real?.fecha_practica ??
            new Date().toISOString().split('T')[0],
          lugar_predio:
            p.practica_real?.lugar_predio?.trim() ||
            'Predio Municipal Venado Tuerto',
          maquina_utilizada:
            p.practica_real?.maquina_utilizada?.trim() || 'Autoelevador',
          instructor_patio:
            p.practica_real?.instructor_patio?.trim() || 'Instructor del Centro',
          resultado: mapearResultado(d.decision),
          asistencia_terreno: d.asistencia,
          horas_practica_terreno: d.asistencia === 'AUSENTE' ? 0 : d.horas,
          horas_extra_terreno: p.practica_real?.horas_extra_terreno ?? 0,
          requiere_horas_extra: d.requiereExtra,
          horas_extra_sugeridas: d.requiereExtra
            ? Math.max(1, p.practica_real?.horas_extra_sugeridas ?? 2)
            : 0,
          puntaje_lateralidad: numOrNull(d.lat),
          puntaje_tacto_mandos: numOrNull(d.man),
          puntaje_mastil: numOrNull(d.mas),
          puntaje_control_receptividad: numOrNull(d.con),
          nivel_asistencia: p.practica_real?.nivel_asistencia ?? 'AUTONOMO',
          decision_instructor_terreno: d.decision,
          observaciones_terreno: p.practica_real?.observaciones_terreno ?? null,
        });

        setAvisos((prev) => ({
          ...prev,
          [p.postulante_id]: res.ok
            ? { ok: true, texto: 'Práctica en patio guardada.' }
            : { ok: false, texto: res.error ?? 'Error al guardar.' },
        }));

        if (res.ok) {
          router.refresh();
        }
      } finally {
        setGuardandoId(null);
      }
    });
  }

  const activos = postulantes.filter((p) => p.estado !== 'DESCARTADO');
  const q = busqueda.trim().toLowerCase();
  const filtrados = q
    ? activos.filter(
        (p) =>
          p.nombre_completo.toLowerCase().includes(q) ||
          p.dni.toLowerCase().includes(q)
      )
    : activos;

  const conPatio = activos.filter((p) => Boolean(p.practica_real)).length;
  const aprobadosEmpresas = activos.filter(
    (p) =>
      p.practica_real?.decision_instructor_terreno === 'APROBADO_EMPRESAS' ||
      p.practica_real?.resultado === 'aprobado' ||
      p.egreso?.paso_a_terreno_aprobado === true
  ).length;

  return (
    <div className="space-y-6">
      <section
        aria-label="Registro de Práctica Real en Patio y Legajos"
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Wrench size={18} className="text-amber-600" aria-hidden />
              Paso 4 · Práctica Real en Patio y Egreso ({cohorteCodigo})
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Registrá asistencia en patio, horas reales, los 4 puntos de máquina física, necesidad de refuerzo y el dictamen final para empresas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
              {conPatio} / {activos.length} evaluados en patio
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
              {aprobadosEmpresas} aprobados para empresas
            </span>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar alumno por nombre o DNI…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {filtrados.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-600">
            No se encontraron alumnos para mostrar en este paso.
          </p>
        ) : (
          <div className="space-y-3">
            {filtrados.map((p) => {
              const d = obtenerDraft(p);
              const guardando = guardandoId === p.postulante_id;
              const aviso = avisos[p.postulante_id];
              const yaCargado = Boolean(p.practica_real);

              return (
                <article
                  key={p.inscripcion_id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onAbrirPostulante(p.inscripcion_id)}
                        className="text-left text-sm font-bold text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {p.nombre_completo}
                      </button>
                      <span className="text-xs text-slate-500">DNI {p.dni}</span>
                      {yaCargado ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 size={12} aria-hidden />
                          Patio registrado
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                          Pendiente de patio
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAbrirPostulante(p.inscripcion_id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <FileText size={13} aria-hidden />
                        Ver Ficha
                      </button>
                      <button
                        type="button"
                        onClick={() => onImprimirLegajo(p.inscripcion_id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Printer size={13} aria-hidden />
                        Legajo 360° (PDF A4)
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
                    <label className="space-y-1 md:col-span-2">
                      <span className="block text-[11px] font-semibold text-slate-600">
                        Asistencia Patio
                      </span>
                      <select
                        value={d.asistencia}
                        onChange={(e) =>
                          actualizarDraft(p, {
                            asistencia: e.target.value as 'PRESENTE' | 'AUSENTE',
                          })
                        }
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
                      >
                        <option value="PRESENTE">Presente</option>
                        <option value="AUSENTE">Ausente</option>
                      </select>
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <span className="block text-[11px] font-semibold text-slate-600">
                        Horas Reales
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        disabled={d.asistencia === 'AUSENTE'}
                        value={d.asistencia === 'AUSENTE' ? 0 : d.horas}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) {
                            actualizarDraft(p, { horas: Math.max(0, v) });
                          }
                        }}
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 disabled:bg-slate-100"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:col-span-4">
                      {[
                        { label: 'Lat.', val: d.lat, key: 'lat' as const },
                        { label: 'Mand.', val: d.man, key: 'man' as const },
                        { label: 'Mást.', val: d.mas, key: 'mas' as const },
                        { label: 'Ctrl.', val: d.con, key: 'con' as const },
                      ].map((eje) => (
                        <label key={eje.key} className="space-y-1">
                          <span className="block text-[11px] font-semibold text-slate-600">
                            {eje.label}
                          </span>
                          <select
                            value={eje.val}
                            onChange={(e) =>
                              actualizarDraft(p, { [eje.key]: e.target.value })
                            }
                            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-1.5 text-xs text-slate-900"
                          >
                            <option value="">—</option>
                            <option value="0">0</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                          </select>
                        </label>
                      ))}
                    </div>

                    <label className="space-y-1 md:col-span-2">
                      <span className="block text-[11px] font-semibold text-slate-600">
                        Dictamen Final
                      </span>
                      <select
                        value={d.decision}
                        onChange={(e) =>
                          actualizarDraft(p, {
                            decision: e.target.value as DecisionInstructorTerreno,
                          })
                        }
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900"
                      >
                        <option value="APROBADO_EMPRESAS">Aprobado para Empresas</option>
                        <option value="REQUIERE_MAS_HORAS">Requiere Refuerzo</option>
                        <option value="NO_APTO">No Apto</option>
                      </select>
                    </label>

                    <div className="flex items-end md:col-span-2">
                      <button
                        type="button"
                        disabled={guardando}
                        onClick={() => guardarPatio(p)}
                        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Save size={13} aria-hidden />
                        {guardando ? 'Guardando…' : 'Guardar Patio'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-800">
                      <input
                        type="checkbox"
                        checked={d.requiereExtra}
                        onChange={(e) =>
                          actualizarDraft(p, { requiereExtra: e.target.checked })
                        }
                        className="h-4 w-4 accent-amber-600"
                      />
                      ¿Requiere más horas de refuerzo?
                    </label>
                    {aviso && (
                      <span
                        role="status"
                        className={`text-xs font-semibold ${
                          aviso.ok ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {aviso.texto}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {impactoIndustrial ? (
        <PanelImpactoIndustrialCohorte
          cohorteCodigo={cohorteCodigo}
          impacto={impactoIndustrial}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            Aún no hay reportes de evaluación suficientes para mostrar resultados de la cohorte
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Subí los reportes del simulador desde el Paso 1 o Paso 3 para generar los indicadores para empresas.
          </p>
        </div>
      )}
    </div>
  );
}
