'use client';

import { useState } from 'react';
import { FileUp, FolderPlus, UserPlus } from 'lucide-react';
import ModalNuevaCohorte from './ModalNuevaCohorte';
import ModalNuevoPostulante from './ModalNuevoPostulante';
import ModalLoteTelemetria from './ModalLoteTelemetria';

/**
 * Botonera interactiva en la cabecera de /gestion/cohortes para disparar los
 * modales de alta de nueva cohorte, alta de postulante e importación por lote PDF.
 */

interface PostulanteLoteRef {
  postulante_id: string;
  nombre_completo: string;
  dni: string;
}

interface Props {
  cohorteActivaId: string | null;
  cohorteActivaCodigo: string | null;
  cohorteActivaRealCodigo?: string | null;
  siguienteRankingSugerido: number;
  feriadosMunicipales: string[];
  postulantes?: PostulanteLoteRef[];
}

export default function AccionesCohorte({
  cohorteActivaId,
  cohorteActivaCodigo,
  cohorteActivaRealCodigo,
  siguienteRankingSugerido,
  feriadosMunicipales,
  postulantes = [],
}: Props) {
  const [modalCohorteAbierto, setModalCohorteAbierto] = useState(false);
  const [modalPostulanteAbierto, setModalPostulanteAbierto] = useState(false);
  const [modalLoteAbierto, setModalLoteAbierto] = useState(false);

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
          <>
            <button
              type="button"
              onClick={() => setModalLoteAbierto(true)}
              className="flex h-9 items-center gap-2 rounded-sm border border-emerald-500/50 bg-emerald-950/35 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-950/60 focus-visible:outline-1 focus-visible:outline-white"
            >
              <FileUp size={13} strokeWidth={1.75} aria-hidden />
              SUBIR LOTE PDFs TITÁN
            </button>
            <button
              type="button"
              onClick={() => setModalPostulanteAbierto(true)}
              className="flex h-9 items-center gap-2 rounded-sm border border-emerald-500/70 bg-emerald-500 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-950 transition-colors hover:bg-emerald-400 focus-visible:outline-1 focus-visible:outline-white"
            >
              <UserPlus size={13} strokeWidth={1.75} aria-hidden />
              NUEVO POSTULANTE
            </button>
          </>
        )}
      </div>

      {modalCohorteAbierto && (
        <ModalNuevaCohorte
          abierto={modalCohorteAbierto}
          onCerrar={() => setModalCohorteAbierto(false)}
          feriadosMunicipales={feriadosMunicipales}
          cohorteActivaCodigo={
            cohorteActivaRealCodigo !== undefined
              ? cohorteActivaRealCodigo
              : cohorteActivaCodigo
          }
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

      {modalLoteAbierto && cohorteActivaId && cohorteActivaCodigo && (
        <ModalLoteTelemetria
          abierto={modalLoteAbierto}
          onCerrar={() => setModalLoteAbierto(false)}
          cohorteId={cohorteActivaId}
          cohorteCodigo={cohorteActivaCodigo}
          postulantes={postulantes}
        />
      )}
    </>
  );
}
