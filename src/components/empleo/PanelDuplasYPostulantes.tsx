'use client';

import { useCallback, useState } from 'react';
import type { FranjaCabina, PostulanteFila } from '@/types/empleo';
import GrillaDuplas from './GrillaDuplas';
import TablaPostulantes from './TablaPostulantes';
import DrawerPostulante from './DrawerPostulante';

/**
 * Coordinador cliente para la cohorte seleccionada: integra la Grilla de
 * Duplas (16 titulares A/B), la tabla completa de ranking y un único
 * DrawerPostulante compartido con enfoque directo a Proyecto Titán (.json).
 */

interface Props {
  cohorteId: string;
  postulantes: PostulanteFila[];
  franjas: FranjaCabina[];
}

export default function PanelDuplasYPostulantes({
  cohorteId,
  postulantes,
  franjas,
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

  return (
    <>
      <section aria-label="Grilla de duplas de la cohorte" className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.18em] text-zinc-400">
          GRILLA DE DUPLAS · 16 TITULARES{' '}
          <span className="text-zinc-600">
            {'// ACCESO DIRECTO A FICHA Y PROYECTO TITÁN .JSON'}
          </span>
        </h2>
        <GrillaDuplas
          postulantes={postulantes}
          onAbrirPostulante={abrirPostulante}
        />
      </section>

      <section aria-label="Ranking de postulantes" className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.18em] text-zinc-400">
          RANKING COMPLETO DE POSTULANTES{' '}
          <span className="text-zinc-600">
            {'// CLIC EN UNA FILA PARA VER LA FICHA TÉCNICA'}
          </span>
        </h2>
        <TablaPostulantes
          postulantes={postulantes}
          franjas={franjas}
          cohorteId={cohorteId}
          onAbrirPostulante={abrirPostulante}
        />
      </section>

      <DrawerPostulante
        postulante={seleccionado}
        franjas={franjas}
        cohorteId={cohorteId}
        enfocarTitan={enfocarTitan}
        enfocarSignal={enfocarSignal}
        onCerrar={cerrarDrawer}
      />
    </>
  );
}
