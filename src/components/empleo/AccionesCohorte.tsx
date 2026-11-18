'use client';

import { useState } from 'react';
import { FileUp, FolderPlus, UserPlus } from 'lucide-react';
import ModalNuevaCohorte from './ModalNuevaCohorte';
import ModalNuevoPostulante from './ModalNuevoPostulante';
import ModalLoteTelemetria from './ModalLoteTelemetria';

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
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <FolderPlus size={14} strokeWidth={1.85} aria-hidden />
          Nuevo Curso
        </button>

        {cohorteActivaId && cohorteActivaCodigo && (
          <>
            <button
              type="button"
              onClick={() => setModalLoteAbierto(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 text-xs font-semibold text-blue-700 shadow-2xs transition-colors hover:bg-blue-100"
            >
              <FileUp size={14} strokeWidth={1.85} aria-hidden />
              Subir Reportes del Simulador
            </button>
            <button
              type="button"
              onClick={() => setModalPostulanteAbierto(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-blue-700"
            >
              <UserPlus size={14} strokeWidth={1.85} aria-hidden />
              Agregar Alumno
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
