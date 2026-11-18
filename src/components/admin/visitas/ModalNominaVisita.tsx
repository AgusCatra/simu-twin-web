'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bus,
  Download,
  Loader2,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { obtenerAsistentesVisitaAction } from '@/app/admin/visitas-educativas/actions';
import type { AsistenteVisita, VisitaEducativa } from '@/types/visitas';

interface ModalNominaVisitaProps {
  abierto: boolean;
  visita: VisitaEducativa | null;
  institucionNombre: string;
  onCerrar: () => void;
}

function formatearFechaIsoCorto(iso: string | null | undefined): string {
  if (!iso) return '—';
  const limpio = iso.split('T')[0];
  const [anio, mes, dia] = limpio.split('-');
  if (!anio || !mes || !dia) return limpio;
  return `${dia}/${mes}/${anio}`;
}

export default function ModalNominaVisita({
  abierto,
  visita,
  institucionNombre,
  onCerrar,
}: ModalNominaVisitaProps) {
  const [asistentes, setAsistentes] = useState<AsistenteVisita[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const cargarNomina = useCallback(async (visitaId: string) => {
    setCargando(true);
    setError(null);
    const respuesta = await obtenerAsistentesVisitaAction(visitaId);
    if (respuesta.ok) {
      setAsistentes(respuesta.asistentes);
    } else {
      setAsistentes([]);
      setError(respuesta.error);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    if (!abierto || !visita?.id) return;

    let cancelado = false;
    setCargando(true);
    setError(null);
    setAsistentes([]);

    void (async () => {
      const respuesta = await obtenerAsistentesVisitaAction(visita.id);
      if (cancelado) return;
      if (respuesta.ok) {
        setAsistentes(respuesta.asistentes);
      } else {
        setError(respuesta.error);
      }
      setCargando(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [abierto, visita?.id]);

  useEffect(() => {
    if (!abierto) return;
    function manejarEscape(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', manejarEscape);
    return () => document.removeEventListener('keydown', manejarEscape);
  }, [abierto, onCerrar]);

  const resumenRoles = useMemo(() => {
    let alumnos = 0;
    let docentes = 0;
    for (const item of asistentes) {
      if (item.rol === 'Docente') docentes += 1;
      else alumnos += 1;
    }
    return { total: asistentes.length, alumnos, docentes };
  }, [asistentes]);

  async function exportarExcelModal() {
    if (!visita || asistentes.length === 0 || exportando) return;
    setExportando(true);
    try {
      const filas = asistentes.map((asistente) => ({
        'Apellido y Nombre': asistente.apellido_nombre,
        DNI: asistente.dni,
        'Fecha Nac': asistente.fecha_nacimiento ?? '',
        Rol: asistente.rol,
      }));
      const XLSX = await import('xlsx');
      const hoja = XLSX.utils.json_to_sheet(filas);
      hoja['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Nomina');
      XLSX.writeFile(libro, `Nomina_${visita.codigo_reserva}.xlsx`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo generar el archivo Excel de la nómina.'
      );
    } finally {
      setExportando(false);
    }
  }

  if (!abierto || !visita) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-nomina-visita"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={onCerrar}
    >
      <div
        className="my-6 flex w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                <Users size={13} strokeWidth={2} aria-hidden />
                {visita.codigo_reserva}
              </span>
              <span className="text-xs font-medium text-slate-600">
                {formatearFechaIsoCorto(visita.fecha_visita)}
                {visita.turno ? ` · ${visita.turno}` : ''}
              </span>
            </div>
            <h2
              id="titulo-modal-nomina-visita"
              className="mt-1.5 truncate text-lg font-bold text-slate-900"
            >
              {institucionNombre}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar lista de asistentes"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
            <p className="text-xs font-semibold text-slate-500">
              Curso y cantidad
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {visita.anio} · {visita.division?.trim() || 'S/D'} ·{' '}
              <span>{visita.cant_alumnos} alumnos</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              Docente: {visita.nombre_docente} ({visita.cel_docente})
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
            <p className="text-xs font-semibold text-slate-500">
              Estado y colectivo
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              Visita: {visita.estado_visita}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
              <Bus size={13} className="shrink-0 text-blue-600" aria-hidden />
              {visita.requiere_tup
                ? `Colectivo TUP · ${(visita.tup_estado_traslado ?? 'pendiente').replace(/_/g, ' ')}`
                : 'Traslado por cuenta propia'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
            <p className="text-xs font-semibold text-slate-500">
              Lista cargada (seguro)
            </p>
            {cargando ? (
              <p className="mt-1.5 text-xs text-slate-500">Consultando…</p>
            ) : (
              <>
                <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  {resumenRoles.total}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    personas
                  </span>
                </p>
                <p className="text-xs text-slate-600">
                  {resumenRoles.alumnos} alumnos · {resumenRoles.docentes}{' '}
                  docentes
                </p>
              </>
            )}
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          {cargando && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Cargando lista de asistentes…
            </div>
          )}

          {!cargando && error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0 text-rose-600" />
                {error}
              </span>
              <button
                type="button"
                onClick={() => void cargarNomina(visita.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
              >
                <RefreshCw size={12} />
                Reintentar
              </button>
            </div>
          )}

          {!cargando && !error && asistentes.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-slate-700">
                Sin asistentes registrados todavía
              </p>
            </div>
          )}

          {!cargando && !error && asistentes.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">#</th>
                    <th className="px-3.5 py-2.5">Apellido y Nombre</th>
                    <th className="px-3.5 py-2.5">DNI</th>
                    <th className="px-3.5 py-2.5">Fecha Nac.</th>
                    <th className="px-3.5 py-2.5">Rol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asistentes.map((persona, indice) => (
                    <tr
                      key={persona.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-3.5 py-2.5 text-xs font-medium text-slate-500 tabular-nums">
                        {String(indice + 1).padStart(2, '0')}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-900">
                        {persona.apellido_nombre}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-slate-700 tabular-nums">
                        {persona.dni?.trim() || '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-slate-600 tabular-nums">
                        {formatearFechaIsoCorto(persona.fecha_nacimiento)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            persona.rol === 'Docente'
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-slate-100 text-slate-700'
                          }`}
                        >
                          {persona.rol}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <span className="text-xs text-slate-600">
            Contacto: {visita.email_contacto}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void exportarExcelModal()}
              disabled={cargando || asistentes.length === 0 || exportando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={14} strokeWidth={1.75} />
              {exportando ? 'Exportando…' : 'Exportar Excel'}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
