'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Download,
  MessageCircle,
  Pencil,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  alternarCheckOperativoAction,
  cambiarEstadoVisitaAction,
  obtenerAsistentesVisitaAction,
  obtenerVisitasAdminAction,
} from '@/app/admin/visitas-educativas/actions';
import {
  ESTADOS_VISITA,
  type CampoCheckOperativo,
  type Escuela,
  type EstadoVisita,
  type VisitaEducativa,
} from '@/types/visitas';

const ModalEditarVisita = dynamic(
  () => import('@/components/admin/visitas/ModalEditarVisita'),
  { ssr: false, loading: () => null }
);

const ModalNominaVisita = dynamic(
  () => import('@/components/admin/visitas/ModalNominaVisita'),
  { ssr: false, loading: () => null }
);

interface TablaVisitasAdminProps {
  visitasIniciales: VisitaEducativa[];
  escuelasIniciales: Escuela[];
  errorInicial?: string | null;
}

type FiltroEstado = 'TODOS' | EstadoVisita;

const CHECKS: readonly { campo: CampoCheckOperativo; etiqueta: string }[] = [
  { campo: 'check_poliza', etiqueta: 'SEGURO' },
  { campo: 'check_tup', etiqueta: 'TUP' },
  { campo: 'check_facturas', etiqueta: 'FACTURAS' },
  { campo: 'check_drive_sum', etiqueta: 'DRIVE' },
];

const PANEL_CLASS = 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm';
const TH_CLASS =
  'border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600';
const TD_CLASS = 'border-b border-slate-100 px-3.5 py-3 align-top text-sm text-slate-800';
const BTN_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';
const ALERTA_CLASS =
  'rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800';
const MONO_SECUNDARIO = 'text-xs text-slate-600';

function esEstadoVisita(valor: string): valor is EstadoVisita {
  return (ESTADOS_VISITA as readonly string[]).includes(valor);
}

/** Normaliza texto para búsqueda tolerante a tildes y mayúsculas. */
function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Devuelve estilos del selector inline según el estado actual de la visita. */
function obtenerClaseEstadoSelect(estado: string): string {
  const norm = estado.trim().toLowerCase();
  if (norm === 'confirmada') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (norm === 'reprogramada') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }
  if (norm === 'finalizada' || norm === 'realizada') {
    return 'border-slate-300 bg-slate-100 text-slate-800';
  }
  if (norm === 'cancelada') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
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

export default function TablaVisitasAdmin({
  visitasIniciales,
  escuelasIniciales,
  errorInicial = null,
}: TablaVisitasAdminProps) {
  const router = useRouter();
  const [visitas, setVisitas] = useState<VisitaEducativa[]>(visitasIniciales);
  const [escuelas, setEscuelas] = useState<Escuela[]>(escuelasIniciales);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(errorInicial);
  const [feedbackStock, setFeedbackStock] = useState<string | null>(null);
  const [guardandoChecks, setGuardandoChecks] = useState<Record<string, boolean>>({});
  const [guardandoEstado, setGuardandoEstado] = useState<Record<string, boolean>>({});
  const [exportandoId, setExportandoId] = useState<string | null>(null);
  const [visitaAEditar, setVisitaAEditar] = useState<VisitaEducativa | null>(null);
  const [visitaNomina, setVisitaNomina] = useState<VisitaEducativa | null>(null);

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');
  const [busqueda, setBusqueda] = useState<string>('');

  const escuelasPorId = useMemo(
    () => new Map(escuelas.map((escuela) => [escuela.id, escuela])),
    [escuelas]
  );

  const nombreInstitucion = useCallback(
    (visita: VisitaEducativa): string => {
      if (visita.id_escuela) {
        const escuela = escuelasPorId.get(visita.id_escuela);
        if (escuela) return escuela.nombre_institucion;
      }
      return visita.otra_institucion_nombre?.trim() || 'Institución sin registrar';
    },
    [escuelasPorId]
  );

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const resultado = await obtenerVisitasAdminAction();
    if (resultado.ok) {
      setVisitas(resultado.visitas);
      setEscuelas(resultado.escuelas);
      router.refresh();
    } else {
      setError(resultado.error);
    }
    setCargando(false);
  }, [router]);

  const conteosPorEstado = useMemo(() => {
    const mapa: Record<EstadoVisita, number> = {
      Confirmada: 0,
      Reprogramada: 0,
      Finalizada: 0,
      Cancelada: 0,
    };
    for (const item of visitas) {
      if (esEstadoVisita(item.estado_visita)) {
        mapa[item.estado_visita] += 1;
      }
    }
    return mapa;
  }, [visitas]);

  const visitasFiltradas = useMemo(() => {
    const termino = normalizarBusqueda(busqueda);

    return visitas.filter((visita) => {
      if (filtroEstado !== 'TODOS' && visita.estado_visita !== filtroEstado) {
        return false;
      }
      if (termino.length === 0) return true;

      const codigo = normalizarBusqueda(visita.codigo_reserva ?? '');
      const escuela = visita.id_escuela ? escuelasPorId.get(visita.id_escuela) : undefined;
      const institucion = normalizarBusqueda(
        [
          escuela?.nombre_institucion ?? '',
          escuela?.nombre_corto ?? '',
          visita.otra_institucion_nombre ?? '',
          visita.nombre_docente ?? '',
        ].join(' ')
      );

      return codigo.includes(termino) || institucion.includes(termino);
    });
  }, [visitas, filtroEstado, busqueda, escuelasPorId]);

  /** UI optimista para los 4 switches operativos vía Server Action autenticada. */
  async function alternarCheck(visita: VisitaEducativa, campo: CampoCheckOperativo) {
    const clave = `${visita.id}:${campo}`;
    if (guardandoChecks[clave]) return;

    const anterior = visita[campo] ?? false;
    const nuevo = !anterior;

    setVisitas((prev) =>
      prev.map((item) => (item.id === visita.id ? conCheck(item, campo, nuevo) : item))
    );
    setGuardandoChecks((prev) => ({ ...prev, [clave]: true }));
    setError(null);

    const resultado = await alternarCheckOperativoAction(visita.id, campo, nuevo);

    if (!resultado.ok) {
      setVisitas((prev) =>
        prev.map((item) =>
          item.id === visita.id ? conCheck(item, campo, anterior) : item
        )
      );
      setError(resultado.error);
    }

    setGuardandoChecks((prev) => ({ ...prev, [clave]: false }));
  }

  /** Cambio rápido de estado con revalidación de ruta y rollback si falla. */
  async function cambiarEstadoRapido(
    visita: VisitaEducativa,
    nuevoEstado: EstadoVisita
  ) {
    if (nuevoEstado === visita.estado_visita || guardandoEstado[visita.id]) return;

    const estadoAnterior = visita.estado_visita;
    setVisitas((prev) =>
      prev.map((item) =>
        item.id === visita.id ? { ...item, estado_visita: nuevoEstado } : item
      )
    );
    setGuardandoEstado((prev) => ({ ...prev, [visita.id]: true }));
    setError(null);
    setFeedbackStock(null);

    const resultado = await cambiarEstadoVisitaAction(visita.id, nuevoEstado);

    if (!resultado.ok) {
      setVisitas((prev) =>
        prev.map((item) =>
          item.id === visita.id
            ? { ...item, estado_visita: estadoAnterior }
            : item
        )
      );
      setError(resultado.error);
    } else if (resultado.resumen_stock) {
      const rs = resultado.resumen_stock;
      if (rs.omitido_idempotencia) {
        setFeedbackStock(
          `Visita ${visita.codigo_reserva} marcada como Finalizada · El descuento de pañol ya había sido registrado previamente.`
        );
      } else if (rs.ejecutado) {
        const resumenItems = rs.items
          .map((it) => `${it.codigo} -${it.descontado} (quedan ${it.saldo_restante})`)
          .join(' · ');
        setFeedbackStock(
          `${rs.detalle ?? 'Stock descontado'}: ${resumenItems}${rs.advertencia ? ` · Aviso: ${rs.advertencia}` : ''}`
        );
      } else if (rs.advertencia) {
        setFeedbackStock(
          `Visita ${visita.codigo_reserva} Finalizada · Pañol: ${rs.advertencia}`
        );
      }
      router.refresh();
    }

    setGuardandoEstado((prev) => ({ ...prev, [visita.id]: false }));
  }

  async function exportarExcel(visita: VisitaEducativa) {
    setExportandoId(visita.id);
    setError(null);

    try {
      const resultado = await obtenerAsistentesVisitaAction(visita.id);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }

      if (resultado.asistentes.length === 0) {
        setError(`La reserva ${visita.codigo_reserva} no tiene nómina cargada.`);
        return;
      }

      const filas = resultado.asistentes.map((asistente) => ({
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
          : `No se pudo exportar la nómina de ${visita.codigo_reserva}.`
      );
    } finally {
      setExportandoId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className={ALERTA_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void recargar()}
              className={BTN_CLASS}
            >
              <RefreshCw size={12} strokeWidth={2} />
              REINTENTAR
            </button>
          </div>
        </div>
      )}

      {feedbackStock && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800"
        >
          <span>{feedbackStock}</span>
          <button
            type="button"
            onClick={() => setFeedbackStock(null)}
            aria-label="Cerrar aviso de stock"
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className={PANEL_CLASS}>
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-600">
              Reservas visibles:{' '}
              <span className="font-bold text-slate-900 tabular-nums">
                {visitasFiltradas.length}
              </span>{' '}
              <span className="text-slate-500">de {visitas.length} totales</span>
            </p>
            <button
              type="button"
              onClick={() => void recargar()}
              disabled={cargando}
              className={BTN_CLASS}
            >
              <RefreshCw
                size={13}
                strokeWidth={2}
                className={cargando ? 'animate-spin' : undefined}
              />
              Actualizar
            </button>
          </div>

          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div
              role="group"
              aria-label="Filtrar visitas por estado"
              className="flex flex-wrap items-center gap-1.5"
            >
              <button
                type="button"
                onClick={() => setFiltroEstado('TODOS')}
                aria-pressed={filtroEstado === 'TODOS'}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filtroEstado === 'TODOS'
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                Todos ({visitas.length})
              </button>

              {ESTADOS_VISITA.map((estado) => {
                const activo = filtroEstado === estado;
                return (
                  <button
                    key={estado}
                    type="button"
                    onClick={() => setFiltroEstado(estado)}
                    aria-pressed={activo}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activo
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {estado} ({conteosPorEstado[estado]})
                  </button>
                );
              })}
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search
                size={14}
                strokeWidth={2}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar código o escuela…"
                aria-label="Buscar por código de reserva o institución"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {busqueda.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH_CLASS}>
                  Código, Fecha y Estado
                </th>
                <th scope="col" className={TH_CLASS}>
                  Escuela
                </th>
                <th scope="col" className={TH_CLASS}>
                  Contacto
                </th>
                <th scope="col" className={TH_CLASS}>
                  Requisitos
                </th>
                <th scope="col" className={TH_CLASS}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {cargando && visitas.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${TD_CLASS} text-sm text-slate-500`}>
                    Cargando reservas…
                  </td>
                </tr>
              )}

              {!cargando && visitasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${TD_CLASS} text-sm text-slate-500`}>
                    {visitas.length === 0
                      ? 'No hay reservas registradas.'
                      : 'No hay reservas que coincidan con la búsqueda.'}
                  </td>
                </tr>
              )}

              {visitasFiltradas.map((visita) => {
                const whatsapp = normalizarWhatsApp(visita.cel_docente);
                const exportando = exportandoId === visita.id;
                const bloqueadoEstado = guardandoEstado[visita.id] === true;
                const institucion = nombreInstitucion(visita);
                const estadoActualValido = esEstadoVisita(visita.estado_visita);

                return (
                  <tr key={visita.id} className="transition-colors hover:bg-slate-50">
                    <td className={`${TD_CLASS} whitespace-nowrap`}>
                      <p className="font-semibold text-slate-900 tabular-nums">
                        {visita.codigo_reserva}
                        <span className="px-1.5 text-slate-300">|</span>
                        {visita.fecha_visita.split('T')[0]}
                      </p>
                      <div className="mt-1.5">
                        <label
                          htmlFor={`estado-${visita.id}`}
                          className="sr-only"
                        >
                          Cambiar estado de la reserva {visita.codigo_reserva}
                        </label>
                        <select
                          id={`estado-${visita.id}`}
                          value={visita.estado_visita}
                          disabled={bloqueadoEstado}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (esEstadoVisita(val)) {
                              void cambiarEstadoRapido(visita, val);
                            }
                          }}
                          className={`rounded-md border px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 ${obtenerClaseEstadoSelect(
                            visita.estado_visita
                          )}`}
                        >
                          {!estadoActualValido && (
                            <option value={visita.estado_visita}>
                              {visita.estado_visita}
                            </option>
                          )}
                          {ESTADOS_VISITA.map((estado) => (
                            <option
                              key={estado}
                              value={estado}
                              className="bg-white text-slate-900"
                            >
                              {estado}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    <td className={`${TD_CLASS} min-w-[14rem]`}>
                      <p className="font-semibold text-slate-900">{institucion}</p>
                      <p className={`mt-0.5 ${MONO_SECUNDARIO}`}>
                        {visita.anio} · {visita.division?.trim() || 'S/D'} ·{' '}
                        {visita.cant_alumnos} alumnos
                      </p>
                      <p className="mt-1 text-xs font-medium">
                        {visita.requiere_tup ? (
                          <span className="text-blue-700">
                            Colectivo TUP · {(visita.tup_estado_traslado ?? 'pendiente').replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-slate-500">Traslado propio</span>
                        )}
                      </p>
                    </td>

                    <td className={`${TD_CLASS} min-w-[12rem]`}>
                      <p className="font-medium text-slate-900">{visita.nombre_docente}</p>
                      <p className={`mt-0.5 ${MONO_SECUNDARIO}`}>{visita.cel_docente}</p>
                      {whatsapp ? (
                        <a
                          href={`https://wa.me/${whatsapp}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${BTN_CLASS} mt-1.5`}
                        >
                          <MessageCircle size={13} strokeWidth={1.75} className="text-emerald-600" />
                          WhatsApp
                        </a>
                      ) : (
                        <p className={`mt-1.5 ${MONO_SECUNDARIO}`}>Celular no válido</p>
                      )}
                    </td>

                    <td className={TD_CLASS}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {CHECKS.map(({ campo, etiqueta }) => {
                          const clave = `${visita.id}:${campo}`;
                          const activo = Boolean(visita[campo]);
                          const ocupado = guardandoChecks[clave] === true;
                          return (
                            <button
                              key={campo}
                              type="button"
                              role="switch"
                              aria-checked={activo}
                              aria-label={`${etiqueta} para ${visita.codigo_reserva}`}
                              disabled={ocupado}
                              onClick={() => void alternarCheck(visita, campo)}
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                activo
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`h-2 w-2 rounded-full ${
                                  activo ? 'bg-emerald-500' : 'bg-slate-300'
                                }`}
                              />
                              {etiqueta}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    <td className={`${TD_CLASS} whitespace-nowrap`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setVisitaNomina(visita)}
                          className={BTN_CLASS}
                          title="Ver lista de asistentes"
                        >
                          <Users size={13} strokeWidth={1.75} />
                          Lista
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisitaAEditar(visita)}
                          className={BTN_CLASS}
                          title="Editar reserva"
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void exportarExcel(visita)}
                          disabled={exportando}
                          className={BTN_CLASS}
                          title="Descargar Excel para seguro"
                        >
                          <Download size={13} strokeWidth={1.75} />
                          {exportando ? 'Exportando…' : 'Excel'}
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
        onGuardado={() => void recargar()}
      />

      <ModalNominaVisita
        abierto={visitaNomina !== null}
        visita={visitaNomina}
        institucionNombre={visitaNomina ? nombreInstitucion(visitaNomina) : ''}
        onCerrar={() => setVisitaNomina(null)}
      />
    </div>
  );
}
