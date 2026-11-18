'use client';

import { useCallback, useState } from 'react';
import type {
  CohorteActiva,
  DuplaPersistidaItem,
  FranjaCabina,
  PostulanteFila,
  SesionPracticaItem,
} from '@/types/empleo';
import GrillaDuplas from './GrillaDuplas';
import TablaPostulantes from './TablaPostulantes';
import DrawerPostulante from './DrawerPostulante';

/**
 * Coordinador cliente para la cohorte seleccionada: integra la Grilla de
 * Duplas (dinámica A/B con sync a DB), la tabla completa de ranking y un único
 * DrawerPostulante compartido con enfoque directo a Proyecto Titán (.json) y Legajo 360°.
 */

interface Props {
  cohorte: CohorteActiva;
  postulantes: PostulanteFila[];
  franjas: FranjaCabina[];
  duplasPersistidas: DuplaPersistidaItem[];
  sesionesPractica: SesionPracticaItem[];
  viernesSugeridos: string[];
}

export default function PanelDuplasYPostulantes({
  cohorte,
  postulantes,
  franjas,
  duplasPersistidas,
  sesionesPractica,
  viernesSugeridos,
}: Props) {
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [enfocarTitan, setEnfocarTitan] = useState(false);
  const [enfocarSignal, setEnfocarSignal] = useState(0);

  const seleccionado =
    postulantes.find((p) => p.inscripcion_id === seleccionadoId) ?? null;

  const abrirPostulante = useCallback(
    (inscripcionId: string, conEnfoqueTitan = false) => {
      setSeleccionadoId(inscripcionId);
      setEnfocarTitan(conEnfoqueTitan);
      if (conEnfoqueTitan) {
        setEnfocarSignal((n) => n + 1);
      }
    },
    []
  );

  const cerrarDrawer = useCallback(() => {
    setSeleccionadoId(null);
    setEnfocarTitan(false);
  }, []);

  const totalPlazas =
    cohorte.configuracion_cursado.franjas_activas.length *
    (cohorte.configuracion_cursado.dias_grupo_b.length > 0 ? 4 : 2);

  return (
    <>
      <section aria-label="Grilla de duplas de la cohorte" className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.18em] text-zinc-400">
          GRILLA DE DUPLAS · {totalPlazas} PLAZAS{' '}
          <span className="text-zinc-600">
            {'// ACCESO DIRECTO A FICHA, PROYECTO TITÁN .JSON Y ASISTENCIAS'}
          </span>
        </h2>
        <GrillaDuplas
          cohorteId={cohorte.id}
          configuracionCursado={cohorte.configuracion_cursado}
          postulantes={postulantes}
          duplasPersistidas={duplasPersistidas}
          sesionesPractica={sesionesPractica}
          viernesSugeridos={viernesSugeridos}
          onAbrirPostulante={abrirPostulante}
        />
      </section>

      <section aria-label="Ranking de postulantes" className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.18em] text-zinc-400">
          RANKING COMPLETO DE POSTULANTES{' '}
          <span className="text-zinc-600">
            {'// CLIC EN UNA FILA PARA VER LA FICHA TÉCNICA 360°'}
          </span>
        </h2>
        <TablaPostulantes
          postulantes={postulantes}
          franjas={franjas}
          cohorteId={cohorte.id}
          onAbrirPostulante={abrirPostulante}
        />
      </section>

      <DrawerPostulante
        postulante={seleccionado}
        franjas={franjas}
        cohorteId={cohorte.id}
        cohorte={cohorte}
        enfocarTitan={enfocarTitan}
        enfocarSignal={enfocarSignal}
        onCerrar={cerrarDrawer}
      />
    </>
  );
}
