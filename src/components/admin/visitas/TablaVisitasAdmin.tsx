'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, MessageCircle, Pencil, RefreshCw } from 'lucide-react';
import {
  actualizarCheckOperativo,
  obtenerAsistentesPorVisita,
  obtenerEscuelas,
  obtenerVisitasAdmin,
} from '@/services/visitasService';
import type { CampoCheckOperativo, Escuela, VisitaEducativa } from '@/types/visitas';
import dynamic from 'next/dynamic';

const ModalEditarVisita = dynamic(
  () => import('@/components/admin/visitas/ModalEditarVisita'),
  { ssr: false, loading: () => null }
);

const CHECKS: readonly { campo: CampoCheckOperativo; etiqueta: string }[] = [
  { campo: 'check_poliza', etiqueta: 'SEGURO' },
  { campo: 'check_tup', etiqueta: 'TUP' },
  { campo: 'check_facturas', etiqueta: 'FACTURAS' },
  { campo: 'check_drive_sum', etiqueta: 'DRIVE' },
];

const PANEL_CLASS = 'overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950';
const TH_CLASS =
  'border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-400';
const TD_CLASS = 'border-b border-zinc-800 px-3 py-2.5 align-top text-sm text-zinc-300';
const BTN_CLASS =
  'inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] tracking-[0.06em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';
const CHECK_CLASS =
  'h-3.5 w-3.5 shrink-0 cursor-pointer rounded-none border border-zinc-600 bg-zinc-950 accent-white disabled:cursor-not-allowed disabled:opacity-50';
const ALERTA_CLASS = 'rounded-sm border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200';
const MONO_SECUNDARIO = 'font-mono text-[11px] text-zinc-500';

function mensajeError(err: unknown, alternativo: string): string {
  return err instanceof Error ? err.message : alternativo;
}

/** Devuelve la copia de la visita con un checkbox operativo actualizado. */
function conCheck(
  visita: VisitaEducativa,
  campo: CampoCheckOperativo,
  valor: boolean
): VisitaEducativa {
  return { ...visita, [campo]: valor };
}

/**
 * Normaliza un celular argentino al formato de wa.me: 549 + número sin el 0
 * de larga distancia ni el 15 de prefijo móvil (ej. "(03462) 15 537643").
 */
function normalizarWhatsApp(raw?: string | null): string | null {
  if (!raw) return null;

  let digitos = raw.replace(/\D/g, '');
  if (digitos.length < 8) return null;

  if (digitos.startsWith('549')) digitos = digitos.slice(3);
  else if (digitos.startsWith('54')) digitos = digitos.slice(2);

  if (digitos.startsWith('0')) digitos = digitos.slice(1);

  const conPrefijo15 = digitos.match(/^(\d{2,4})15(\d{6,8})$/);
  if (conPrefijo15) {
    digitos = `${conPrefijo15[1]}${conPrefijo15[2]}`;
  } else if (digitos.startsWith('15')) {
    digitos = digitos.slice(2);
  }

  return `549${digitos}`;
}

export default function TablaVisitasAdmin() {
  const [visitas, setVisitas] = useState<VisitaEducativa[]>([]);
  const [escuelasPorId, setEscuelasPorId] = useState<Map<string, Escuela>>(new Map());
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<Record<string, boolean>>({});
  const [exportandoId, setExportandoId] = useState<string | null>(null);
  const [visitaAEditar, setVisitaAEditar] = useState<VisitaEducativa | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [listaVisitas, listaEscuelas] = await Promise.all([
        obtenerVisitasAdmin(),
        obtenerEscuelas(),
      ]);
      setVisitas(listaVisitas);
      setEscuelasPorId(new Map(listaEscuelas.map((escuela) => [escuela.id, escuela])));
    } catch (err) {
      setError(mensajeError(err, 'No se pudieron cargar las reservas.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** UI optimista: marca el check al instante y revierte si la base lo rechaza. */
  async function alternarCheck(visita: VisitaEducativa, campo: CampoCheckOperativo) {
    const clave = `${visita.id}:${campo}`;
    const anterior = visita[campo] ?? false;
    const nuevo = !anterior;

    setVisitas((prev) =>
      prev.map((item) => (item.id === visita.id ? conCheck(item, campo, nuevo) : item))
    );
    setGuardando((prev) => ({ ...prev, [clave]: true }));
    setError(null);

    try {
      await actualizarCheckOperativo(visita.id, campo, nuevo);
    } catch (err) {
      setVisitas((prev) =>
        prev.map((item) => (item.id === visita.id ? conCheck(item, campo, anterior) : item))
      );
      setError(
        mensajeError(
          err,
          `No se pudo guardar ${campo} de la reserva ${visita.codigo_reserva}.`
        )
      );
    } finally {
      setGuardando((prev) => ({ ...prev, [clave]: false }));
    }
  }

  async function exportarExcel(visita: VisitaEducativa) {
    setExportandoId(visita.id);
    setError(null);

    try {
      const asistentes = await obtenerAsistentesPorVisita(visita.id);
      if (asistentes.length === 0) {
        setError(`La reserva ${visita.codigo_reserva} no tiene nómina cargada.`);
        return;
      }

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
        mensajeError(err, `No se pudo exportar la nómina de ${visita.codigo_reserva}.`)
      );
    } finally {
      setExportandoId(null);
    }
  }

  function nombreInstitucion(visita: VisitaEducativa): string {
    if (visita.id_escuela) {
      const escuela = escuelasPorId.get(visita.id_escuela);
      if (escuela) return escuela.nombre_institucion;
    }
    return visita.otra_institucion_nombre?.trim() || 'Institución sin registrar';
  }

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className={ALERTA_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>{error}</span>
            <button type="button" onClick={() => void cargar()} className={BTN_CLASS}>
              <RefreshCw size={12} strokeWidth={2} />
              REINTENTAR
            </button>
          </div>
        </div>
      )}

      <div className={PANEL_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
          <p className="font-mono text-[11px] tracking-[0.1em] text-zinc-400">
            RESERVAS: <span className="text-zinc-100">{visitas.length}</span>
          </p>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className={BTN_CLASS}
          >
            <RefreshCw size={12} strokeWidth={2} className={cargando ? 'animate-spin' : undefined} />
            ACTUALIZAR
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH_CLASS}>
                  Código &amp; Fecha
                </th>
                <th scope="col" className={TH_CLASS}>
                  Institución
                </th>
                <th scope="col" className={TH_CLASS}>
                  Contacto
                </th>
                <th scope="col" className={TH_CLASS}>
                  Tareas Operativas
                </th>
                <th scope="col" className={TH_CLASS}>
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {cargando && visitas.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${TD_CLASS} font-mono text-[11px] text-zinc-500`}>
                    CARGANDO RESERVAS…
                  </td>
                </tr>
              )}

              {!cargando && visitas.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${TD_CLASS} font-mono text-[11px] text-zinc-500`}>
                    NO HAY RESERVAS REGISTRADAS.
                  </td>
                </tr>
              )}

              {visitas.map((visita) => {
                const whatsapp = normalizarWhatsApp(visita.cel_docente);
                const exportando = exportandoId === visita.id;

                return (
                  <tr key={visita.id} className="transition-colors hover:bg-zinc-900">
                    <td className={`${TD_CLASS} whitespace-nowrap`}>
                      <p className="font-mono text-[13px] text-zinc-100">
                        {visita.codigo_reserva}
                        <span className="px-1.5 text-zinc-600">|</span>
                        {visita.fecha_visita.split('T')[0]}
                      </p>
                      <p className={`mt-0.5 ${MONO_SECUNDARIO}`}>
                        {visita.estado_visita.toUpperCase()}
                      </p>
                    </td>

                    <td className={`${TD_CLASS} min-w-[14rem]`}>
                      <p className="text-zinc-100">{nombreInstitucion(visita)}</p>
                      <p className={`mt-0.5 ${MONO_SECUNDARIO}`}>
                        {visita.anio} · {visita.division?.trim() || 'S/D'} ·{' '}
                        {visita.cant_alumnos} ALUMNOS
                        {visita.requiere_tup ? ' · TUP' : ''}
                      </p>
                    </td>

                    <td className={`${TD_CLASS} min-w-[12rem]`}>
                      <p className="text-zinc-100">{visita.nombre_docente}</p>
                      <p className={`mt-0.5 ${MONO_SECUNDARIO}`}>{visita.cel_docente}</p>
                      {whatsapp ? (
                        <a
                          href={`https://wa.me/${whatsapp}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${BTN_CLASS} mt-1.5`}
                        >
                          <MessageCircle size={13} strokeWidth={1.75} />
                          WHATSAPP DOCENTE
                        </a>
                      ) : (
                        <p className={`mt-1.5 ${MONO_SECUNDARIO}`}>CELULAR NO VÁLIDO</p>
                      )}
                    </td>

                    <td className={TD_CLASS}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {CHECKS.map(({ campo, etiqueta }) => {
                          const clave = `${visita.id}:${campo}`;
                          return (
                            <label
                              key={campo}
                              className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-zinc-400"
                            >
                              <input
                                type="checkbox"
                                checked={visita[campo] ?? false}
                                disabled={guardando[clave] === true}
                                onChange={() => void alternarCheck(visita, campo)}
                                className={CHECK_CLASS}
                              />
                              {etiqueta}
                            </label>
                          );
                        })}
                      </div>
                    </td>

                    <td className={`${TD_CLASS} whitespace-nowrap`}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setVisitaAEditar(visita)}
                          className={BTN_CLASS}
                          title="Editar reserva"
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                          EDITAR
                        </button>
                        <button
                          type="button"
                          onClick={() => void exportarExcel(visita)}
                          disabled={exportando}
                          className={BTN_CLASS}
                        >
                          <Download size={13} strokeWidth={1.75} />
                          {exportando ? 'EXPORTANDO…' : 'EXCEL SEGURO'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ModalEditarVisita
        abierto={visitaAEditar !== null}
        visita={visitaAEditar}
        onCerrar={() => setVisitaAEditar(null)}
        onGuardado={() => void cargar()}
      />
    </div>
  );
}
