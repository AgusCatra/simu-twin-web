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
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-xs"
      onClick={onCerrar}
    >
      <div
        className="my-6 flex w-full max-w-4xl flex-col rounded-sm border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Cabecera ── */}
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-100">
                <Users size={12} strokeWidth={2} aria-hidden />
                {visita.codigo_reserva}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">
                {formatearFechaIsoCorto(visita.fecha_visita)}
                {visita.turno ? ` · ${visita.turno}` : ''}
              </span>
            </div>
            <h2
              id="titulo-modal-nomina-visita"
              className="mt-1.5 truncate text-base font-semibold text-zinc-100"
            >
              {institucionNombre}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar detalle de nómina"
            className="rounded-sm border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </header>

        {/* ── Resumen operativo + Métricas de nómina ── */}
        <div className="grid grid-cols-1 gap-3 border-b border-zinc-800 bg-zinc-950/60 px-5 py-3 sm:grid-cols-3">
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              CURSO Y CUPO DECLARADO
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-200">
              {visita.anio} · {visita.division?.trim() || 'S/D'} ·{' '}
              <span className="font-mono">{visita.cant_alumnos} alumnos</span>
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
              Docente: {visita.nombre_docente} ({visita.cel_docente})
            </p>
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              ESTADO Y LOGÍSTICA TUP
            </p>
            <p className="mt-1 font-mono text-xs uppercase text-zinc-200">
              VISITA: {visita.estado_visita}
            </p>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
              <Bus size={12} className="shrink-0 text-zinc-500" aria-hidden />
              {visita.requiere_tup
                ? `TUP ACTIVO · ${(visita.tup_estado_traslado ?? 'pendiente').toUpperCase()}`
                : 'TRASLADO POR CUENTA PROPIA'}
            </p>
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              NÓMINA CARGADA (PÓLIZA)
            </p>
            {cargando ? (
              <p className="mt-1.5 font-mono text-xs text-zinc-400">
                Consultando...
              </p>
            ) : (
              <>
                <p className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">
                  {resumenRoles.total}{' '}
                  <span className="text-xs font-normal text-zinc-400">
                    personas
                  </span>
                </p>
                <p className="font-mono text-[11px] text-zinc-400">
                  {resumenRoles.alumnos} alumnos · {resumenRoles.docentes}{' '}
                  docentes
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Tabla de asistentes ── */}
        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          {cargando && (
            <div className="flex items-center justify-center gap-2 py-10 font-mono text-xs text-zinc-400">
              <Loader2 size={15} className="animate-spin" />
              CARGANDO NÓMINA DE ASISTENTES…
            </div>
          )}

          {!cargando && error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-200"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-red-400" />
                {error}
              </span>
              <button
                type="button"
                onClick={() => void cargarNomina(visita.id)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-200 hover:border-zinc-500"
              >
                <RefreshCw size={12} />
                REINTENTAR
              </button>
            </div>
          )}

          {!cargando && !error && asistentes.length === 0 && (
            <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950 px-4 py-10 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-zinc-400">
                SIN ASISTENTES REGISTRADOS
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Esta reserva no posee filas cargadas en{' '}
                <code className="font-mono text-zinc-300">visita_asistentes</code>.
              </p>
            </div>
          )}

          {!cargando && !error && asistentes.length > 0 && (
            <div className="overflow-x-auto rounded-sm border border-zinc-800 bg-zinc-950">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Apellido y Nombre</th>
                    <th className="px-3 py-2">DNI</th>
                    <th className="px-3 py-2">Fecha Nac.</th>
                    <th className="px-3 py-2">Rol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {asistentes.map((persona, indice) => (
                    <tr
                      key={persona.id}
                      className="transition-colors hover:bg-zinc-900/60"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500 tabular-nums">
                        {String(indice + 1).padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2 font-medium text-zinc-100">
                        {persona.apellido_nombre}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-300 tabular-nums">
                        {persona.dni?.trim() || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-400 tabular-nums">
                        {formatearFechaIsoCorto(persona.fecha_nacimiento)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                            persona.rol === 'Docente'
                              ? 'border-sky-500/40 bg-sky-950/30 text-sky-300'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-300'
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

        {/* ── Footer ── */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-5 py-3">
          <span className="font-mono text-[10px] tracking-[0.12em] text-zinc-500">
            CONTACTO: {visita.email_contacto}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void exportarExcelModal()}
              disabled={cargando || asistentes.length === 0 || exportando}
              className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={13} strokeWidth={1.75} />
              {exportando ? 'EXPORTANDO…' : 'EXPORTAR EXCEL'}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-sm bg-zinc-100 px-3.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-zinc-950 transition-colors hover:bg-white"
            >
              CERRAR
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
