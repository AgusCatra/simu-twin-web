'use client';

import { useState } from 'react';
import { FolderPlus, UserPlus } from 'lucide-react';
import ModalNuevaCohorte from './ModalNuevaCohorte';
import ModalNuevoPostulante from './ModalNuevoPostulante';

/**
 * Botonera interactiva en la cabecera de /gestion/cohortes para disparar los
 * modales de alta de nueva cohorte y alta de postulante.
 */

interface Props {
  cohorteActivaId: string | null;
  cohorteActivaCodigo: string | null;
  siguienteRankingSugerido: number;
  feriadosMunicipales: string[];
}

export default function AccionesCohorte({
  cohorteActivaId,
  cohorteActivaCodigo,
  siguienteRankingSugerido,
  feriadosMunicipales,
}: Props) {
  const [modalCohorteAbierto, setModalCohorteAbierto] = useState(false);
  const [modalPostulanteAbierto, setModalPostulanteAbierto] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setModalCohorteAbierto(true)}
          className="flex h-9 items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-white hover:text-white focus-visible:outline-1 focus-visible:outline-white"
        >
          <FolderPlus size={13} strokeWidth={1.75} aria-hidden />
          NUEVA COHORTE
        </button>

        {cohorteActivaId && cohorteActivaCodigo && (
          <button
            type="button"
            onClick={() => setModalPostulanteAbierto(true)}
            className="flex h-9 items-center gap-2 rounded-sm border border-emerald-500/70 bg-emerald-500 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-950 transition-colors hover:bg-emerald-400 focus-visible:outline-1 focus-visible:outline-white"
          >
            <UserPlus size={13} strokeWidth={1.75} aria-hidden />
            NUEVO POSTULANTE
          </button>
        )}
      </div>

      {modalCohorteAbierto && (
        <ModalNuevaCohorte
          abierto={modalCohorteAbierto}
          onCerrar={() => setModalCohorteAbierto(false)}
          feriadosMunicipales={feriadosMunicipales}
          cohorteActivaCodigo={cohorteActivaCodigo}
        />
      )}

      {modalPostulanteAbierto && cohorteActivaId && cohorteActivaCodigo && (
        <ModalNuevoPostulante
          abierto={modalPostulanteAbierto}
          onCerrar={() => setModalPostulanteAbierto(false)}
          cohorteId={cohorteActivaId}
          cohorteCodigo={cohorteActivaCodigo}
          siguienteRankingSugerido={siguienteRankingSugerido}
        />
      )}
    </>
  );
}
