'use client';

import { useState, type ReactNode } from 'react';
import { BarChart3, CalendarClock, FileUp, Users } from 'lucide-react';
import type { ResumenImpactoIndustrialCohorte } from '@/lib/telemetria/analitica-predictiva';
import type {
  CohorteActiva,
  ConfiguracionCursadoCohorte,
  DuplaPersistidaItem,
  FranjaCabina,
  PostulanteFila,
  SesionPracticaItem,
} from '@/types/empleo';
import DrawerPostulante from './DrawerPostulante';
import GrillaDuplas from './GrillaDuplas';
import ModalLoteTelemetria from './ModalLoteTelemetria';
import PanelImpactoIndustrialCohorte from './PanelImpactoIndustrialCohorte';
import TablaPostulantes from './TablaPostulantes';

type TabCohorteId = 'alumnos' | 'duplas' | 'empresas';

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

/**
 * Organizador en 3 pestañas operativas de /gestion/cohortes:
 * 1. Alumnos y Legajos (TablaPostulantes + botón prominente Subir Reportes)
 * 2. Turnos y Duplas (Cronograma semanal + GrillaDuplas)
 * 3. Resultados para Empresas (PanelImpactoIndustrialCohorte)
 * Comparte el DrawerPostulante 360° único sin perder selección al cambiar.
 */
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
  const [tab, setTab] = useState<TabCohorteId>('alumnos');
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [enfocarTitan, setEnfocarTitan] = useState(false);
  const [enfocarSignal, setEnfocarSignal] = useState(0);
  const [modalLoteAbierto, setModalLoteAbierto] = useState(false);

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

  const tabs: Array<{
    id: TabCohorteId;
    label: string;
    badge?: string;
    icon: typeof Users;
  }> = [
    {
      id: 'alumnos',
      label: 'Alumnos y Legajos',
      badge: String(postulantes.length),
      icon: Users,
    },
    {
      id: 'duplas',
      label: 'Turnos y Duplas',
      icon: CalendarClock,
    },
    {
      id: 'empresas',
      label: 'Resultados para Empresas',
      icon: BarChart3,
    },
  ];

  const postulantesLoteRef = postulantes.map((p) => ({
    postulante_id: p.postulante_id,
    nombre_completo: p.nombre_completo,
    dni: p.dni,
  }));

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Secciones del curso"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-1.5">
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
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  activo
                    ? 'border border-blue-200 bg-blue-50 text-blue-700'
                    : 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={16} strokeWidth={1.85} aria-hidden />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                      activo
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setModalLoteAbierto(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-blue-700"
        >
          <FileUp size={15} strokeWidth={1.85} aria-hidden />
          Subir Reportes del Simulador
        </button>
      </div>

      {tab === 'alumnos' && (
        <section aria-label="Alumnos y Legajos" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Alumnos y Legajos del Curso {cohorteCodigo}
              </h2>
              <p className="text-xs text-slate-600">
                Hacé clic en cualquier fila para abrir su ficha completa, seguimiento del simulador y práctica en patio.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalLoteAbierto(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <FileUp size={14} strokeWidth={1.85} aria-hidden />
              Subir Reportes del Simulador (PDF / JSON)
            </button>
          </div>

          <TablaPostulantes
            postulantes={postulantes}
            franjas={franjas}
            cohorteId={cohorteId}
            onAbrirPostulante={abrirPostulante}
          />
        </section>
      )}

      {tab === 'duplas' && (
        <section aria-label="Turnos y Duplas" className="space-y-5">
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

          {parrillaLegacyNode}
        </section>
      )}

      {tab === 'empresas' &&
        (impactoIndustrial ? (
          <PanelImpactoIndustrialCohorte
            cohorteCodigo={cohorteCodigo}
            impacto={impactoIndustrial}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-900">
              Aún no hay reportes de evaluación para calcular resultados
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Subí los reportes del simulador desde la pestaña Alumnos y Legajos para generar los indicadores comparativos para empresas.
            </p>
          </div>
        ))}

      <DrawerPostulante
        postulante={postulanteActivo}
        franjas={franjas}
        cohorteId={cohorteId}
        cohorte={cohorte}
        enfocarTitan={enfocarTitan}
        enfocarSignal={enfocarSignal}
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
