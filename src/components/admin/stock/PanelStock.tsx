'use client';

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  History,
  Package,
  PackageMinus,
  PackagePlus,
  RefreshCw,
  X,
} from 'lucide-react';
import { registrarMovimientoStockAction } from '@/app/admin/insumos/actions';
import type {
  InsumoStock,
  MovimientoStockItem,
  TipoMovimientoStock,
  VisitaReferenciaStock,
} from '@/types/stock';

/**
 * Panel operativo de Stock e Insumos (`/admin/insumos`).
 *
 * Estética SCADA / Pañol: paneles dark `bg-zinc-950`, bordes 1px `zinc-800`,
 * indicadores numéricos `tabular-nums`, alertas tempranas por umbral mínimo
 * y modal accesible para registrar ingresos y consumos sin recargar.
 */

type ModoModalStock = 'ingreso' | 'consumo';

interface Props {
  insumos: InsumoStock[];
  movimientos: MovimientoStockItem[];
  visitasRecientes: VisitaReferenciaStock[];
  errorLectura?: string | null;
}

const CANTIDADES_RAPIDAS = [1, 10, 25, 40] as const;
const MAX_CANTIDAD_MOVIMIENTO = 100_000;

function formatearFechaHoraArgentina(iso: string | undefined): string {
  if (!iso) return 'Sin registro';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;

  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

function obtenerEstilosNivel(insumo: InsumoStock): {
  cardClass: string;
  badgeClass: string;
  barClass: string;
  etiqueta: string;
  enAlerta: boolean;
  agotado: boolean;
} {
  if (insumo.cantidad_disponible <= 0) {
    return {
      cardClass: 'border-rose-200 bg-rose-50/40',
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
      barClass: 'bg-rose-500',
      etiqueta: 'SIN STOCK',
      enAlerta: true,
      agotado: true,
    };
  }

  if (insumo.cantidad_disponible <= insumo.cantidad_minima_alerta) {
    return {
      cardClass: 'border-amber-200 bg-amber-50/40',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
      barClass: 'bg-amber-500',
      etiqueta: 'BAJO MÍNIMO',
      enAlerta: true,
      agotado: false,
    };
  }

  return {
    cardClass: 'border-slate-200 bg-white',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    barClass: 'bg-emerald-500',
    etiqueta: 'EN STOCK',
    enAlerta: false,
    agotado: false,
  };
}

function obtenerEstilosTipoMovimiento(tipo: TipoMovimientoStock): {
  etiqueta: string;
  badgeClass: string;
  cantidadClass: string;
  signo: '+' | '-';
} {
  if (tipo === 'ingreso_compra') {
    return {
      etiqueta: 'Ingreso de compra',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      cantidadClass: 'text-emerald-700',
      signo: '+',
    };
  }
  if (tipo === 'visita_escolar') {
    return {
      etiqueta: 'Visita escolar',
      badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
      cantidadClass: 'text-blue-700',
      signo: '-',
    };
  }
  return {
    etiqueta: 'Consumo interno',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    cantidadClass: 'text-amber-800',
    signo: '-',
  };
}

function calcularPorcentajeNivel(insumo: InsumoStock): number {
  const techoReferencia = Math.max(insumo.cantidad_minima_alerta * 4, 100);
  const porcentaje = (insumo.cantidad_disponible / techoReferencia) * 100;
  return Math.max(0, Math.min(100, Math.round(porcentaje)));
}

export default function PanelStock({
  insumos,
  movimientos,
  visitasRecientes,
  errorLectura = null,
}: Props) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoModal, setModoModal] = useState<ModoModalStock>('ingreso');
  const [insumoSeleccionadoId, setInsumoSeleccionadoId] = useState<string>(
    insumos[0]?.id ?? ''
  );
  const [tipoConsumo, setTipoConsumo] = useState<
    'visita_escolar' | 'consumo_interno'
  >('visita_escolar');
  const [cantidadTexto, setCantidadTexto] = useState<string>('10');
  const [visitaId, setVisitaId] = useState<string>('');
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [feedbackExito, setFeedbackExito] = useState<string | null>(null);

  const resumen = useMemo(() => {
    const enAlerta = insumos.filter(
      (i) => i.cantidad_disponible <= i.cantidad_minima_alerta
    );
    const agotados = insumos.filter((i) => i.cantidad_disponible <= 0);
    const unidadesTotales = insumos.reduce(
      (acc, i) => acc + i.cantidad_disponible,
      0
    );
    const ingresosRecientes = movimientos.filter(
      (m) => m.tipo === 'ingreso_compra'
    ).length;
    const consumosRecientes = movimientos.length - ingresosRecientes;

    return {
      enAlerta,
      agotados,
      unidadesTotales,
      ingresosRecientes,
      consumosRecientes,
    };
  }, [insumos, movimientos]);

  const insumoActivo = useMemo(
    () =>
      insumos.find((i) => i.id === insumoSeleccionadoId) ?? insumos[0] ?? null,
    [insumos, insumoSeleccionadoId]
  );

  useEffect(() => {
    if (!modalAbierto) return;
    function manejarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape' && !pendiente) {
        setModalAbierto(false);
      }
    }
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [modalAbierto, pendiente]);

  function abrirModal(modo: ModoModalStock, insumoId?: string) {
    if (insumos.length === 0) return;

    const idObjetivo =
      insumoId ??
      (modo === 'consumo'
        ? (insumos.find((i) => i.cantidad_disponible > 0)?.id ?? insumos[0].id)
        : insumos[0].id);

    setModoModal(modo);
    setInsumoSeleccionadoId(idObjetivo);
    setTipoConsumo('visita_escolar');
    setCantidadTexto(modo === 'ingreso' ? '50' : '20');
    setVisitaId('');
    setErrorModal(null);
    setModalAbierto(true);
  }

  function cerrarModal() {
    if (pendiente) return;
    setModalAbierto(false);
    setErrorModal(null);
  }

  const tipoEfectivo: TipoMovimientoStock =
    modoModal === 'ingreso' ? 'ingreso_compra' : tipoConsumo;

  const cantidadParsed = Number.parseInt(cantidadTexto.trim(), 10);
  const cantidadEsEnteraValida =
    /^\d+$/.test(cantidadTexto.trim()) &&
    Number.isInteger(cantidadParsed) &&
    cantidadParsed > 0 &&
    cantidadParsed <= MAX_CANTIDAD_MOVIMIENTO;

  const saldoInsuficiente =
    modoModal === 'consumo' &&
    insumoActivo !== null &&
    cantidadEsEnteraValida &&
    cantidadParsed > insumoActivo.cantidad_disponible;

  const saldoProyectado =
    insumoActivo !== null && cantidadEsEnteraValida
      ? modoModal === 'ingreso'
        ? insumoActivo.cantidad_disponible + cantidadParsed
        : insumoActivo.cantidad_disponible - cantidadParsed
      : null;

  function manejarSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendiente || !insumoActivo) return;

    if (!cantidadEsEnteraValida) {
      setErrorModal(
        `Ingresá una cantidad entera válida entre 1 y ${MAX_CANTIDAD_MOVIMIENTO}.`
      );
      return;
    }

    if (saldoInsuficiente) {
      setErrorModal(
        `Stock insuficiente de ${insumoActivo.nombre_insumo}. Disponible: ${insumoActivo.cantidad_disponible} u.`
      );
      return;
    }

    setErrorModal(null);
    setFeedbackExito(null);

    iniciarTransicion(async () => {
      const resultado = await registrarMovimientoStockAction({
        insumo_id: insumoActivo.id,
        tipo: tipoEfectivo,
        cantidad: cantidadParsed,
        visita_id:
          tipoEfectivo === 'visita_escolar' && visitaId.trim().length > 0
            ? visitaId.trim()
            : undefined,
      });

      if (!resultado.ok) {
        setErrorModal(resultado.error);
        return;
      }

      const signo = tipoEfectivo === 'ingreso_compra' ? '+' : '-';
      setFeedbackExito(
        `Movimiento registrado (${insumoActivo.codigo} ${signo}${cantidadParsed} u.) · Saldo actual: ${resultado.cantidad_disponible} u.`
      );
      setModalAbierto(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Error de lectura SSR ────────────────────────────────── */}
      {errorLectura && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            {errorLectura}
          </span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100"
          >
            <RefreshCw size={13} />
            Reintentar
          </button>
        </div>
      )}

      {feedbackExito && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            {feedbackExito}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackExito(null)}
            aria-label="Ocultar aviso"
            className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <section aria-label="Resumen de stock">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Unidades totales
              </p>
              <Package size={16} className="text-blue-600" aria-hidden />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {resumen.unidadesTotales}
              </p>
              <span className="text-sm text-slate-500">
                en {insumos.length} artículos
              </span>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Alertas de faltantes
              </p>
              <AlertTriangle
                size={16}
                className={
                  resumen.agotados.length > 0
                    ? 'text-rose-600'
                    : resumen.enAlerta.length > 0
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                }
                aria-hidden
              />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <p
                className={`text-3xl font-bold tabular-nums ${
                  resumen.agotados.length > 0
                    ? 'text-rose-700'
                    : resumen.enAlerta.length > 0
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}
              >
                {resumen.enAlerta.length}
              </p>
              <span className="text-sm text-slate-600">
                {resumen.enAlerta.length === 0
                  ? 'todos sobre mínimo'
                  : resumen.agotados.length > 0
                    ? `${resumen.agotados.length} sin stock`
                    : 'requieren reposición'}
              </span>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Últimos movimientos
              </p>
              <History size={16} className="text-slate-500" aria-hidden />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {movimientos.length}
              </p>
              <span className="text-sm text-slate-600">
                {resumen.ingresosRecientes} ingresos · {resumen.consumosRecientes}{' '}
                egresos
              </span>
            </div>
          </article>
        </div>
      </section>

      {resumen.enAlerta.length > 0 && (
        <div
          role="alert"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
            resumen.agotados.length > 0
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              size={18}
              className={`mt-0.5 shrink-0 ${
                resumen.agotados.length > 0 ? 'text-rose-600' : 'text-amber-600'
              }`}
              aria-hidden
            />
            <div>
              <p className="text-sm font-bold">
                {resumen.agotados.length > 0
                  ? 'Hay insumos sin stock disponible'
                  : 'Insumos por debajo del mínimo'}
              </p>
              <p className="mt-0.5 text-xs">
                {resumen.enAlerta
                  .map(
                    (i) =>
                      `${i.codigo} (${i.cantidad_disponible}/${i.cantidad_minima_alerta} u.)`
                  )
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => abrirModal('ingreso', resumen.enAlerta[0].id)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
          >
            <PackagePlus size={15} />
            Reponer ahora
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Artículos disponibles ({insumos.length})
          </h2>
          <p className="text-sm text-slate-600">
            Refrigerios para escuelas y material de práctica
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw size={14} />
            Actualizar
          </button>

          <button
            type="button"
            onClick={() => abrirModal('ingreso')}
            disabled={insumos.length === 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PackagePlus size={15} />
            Registrar ingreso
          </button>

          <button
            type="button"
            onClick={() => abrirModal('consumo')}
            disabled={
              insumos.length === 0 ||
              insumos.every((i) => i.cantidad_disponible <= 0)
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PackageMinus size={15} />
            Registrar entrega
          </button>
        </div>
      </div>

      {insumos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <Package size={26} className="mx-auto text-slate-400" aria-hidden />
          <p className="mt-2 text-sm font-bold text-slate-700">
            Sin artículos registrados
          </p>
        </div>
      ) : (
        <section aria-label="Tarjetas de existencias por insumo">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {insumos.map((insumo) => {
              const estilos = obtenerEstilosNivel(insumo);
              const porcentaje = calcularPorcentajeNivel(insumo);

              return (
                <article
                  key={insumo.id}
                  className={`flex flex-col justify-between rounded-xl border p-5 shadow-sm transition-colors ${estilos.cardClass}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                        {insumo.codigo}
                      </span>
                      <span
                        className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold ${estilos.badgeClass}`}
                      >
                        {estilos.etiqueta}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-bold leading-snug text-slate-900">
                      {insumo.nombre_insumo}
                    </h3>

                    <div className="mt-4 flex items-baseline justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-slate-500">
                          Disponible
                        </p>
                        <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                          {insumo.cantidad_disponible}
                          <span className="ml-1.5 text-sm font-normal text-slate-500">
                            u.
                          </span>
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs font-medium text-slate-500">
                          Mínimo alerta
                        </p>
                        <p className="text-sm font-semibold text-slate-700 tabular-nums">
                          {insumo.cantidad_minima_alerta} u.
                        </p>
                      </div>
                    </div>

                    <div
                      aria-hidden
                      className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200"
                    >
                      <div
                        className={`h-full transition-all ${estilos.barClass}`}
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>

                    <p className="mt-2.5 text-xs text-slate-500">
                      Actualizado: {formatearFechaHoraArgentina(insumo.updated_at)}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                    <button
                      type="button"
                      onClick={() => abrirModal('ingreso', insumo.id)}
                      className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <ArrowDownToLine size={14} />
                      Ingresar
                    </button>

                    <button
                      type="button"
                      onClick={() => abrirModal('consumo', insumo.id)}
                      disabled={estilos.agotado}
                      className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUpFromLine size={14} />
                      Entregar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section
        aria-label="Historial de últimos movimientos de stock"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <History size={16} className="text-slate-500" aria-hidden />
            <h2 className="text-base font-bold text-slate-900">
              Últimos 20 movimientos
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {movimientos.length} registros
          </span>
        </div>

        {movimientos.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">
              Sin movimientos registrados todavía
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-4 py-3">Fecha y hora</th>
                    <th className="px-4 py-3">Insumo</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Referencia</th>
                    <th className="px-4 py-3 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {movimientos.map((mov) => {
                    const estilosTipo = obtenerEstilosTipoMovimiento(mov.tipo);
                    return (
                      <tr
                        key={mov.id}
                        className="transition-colors hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 tabular-nums">
                          {formatearFechaHoraArgentina(mov.fecha)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                              {mov.codigo_insumo ?? 'ITEM'}
                            </span>
                            <span className="font-medium text-slate-900">
                              {mov.insumo_nombre ?? 'Insumo'}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${estilosTipo.badgeClass}`}
                          >
                            {estilosTipo.etiqueta}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                          {mov.visita_codigo_reserva ? (
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-800">
                              {mov.visita_codigo_reserva}
                            </span>
                          ) : mov.visita_id ? (
                            <span>Visita {mov.visita_id.slice(0, 8)}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right text-sm font-bold tabular-nums ${estilosTipo.cantidadClass}`}
                        >
                          {estilosTipo.signo}
                          {mov.cantidad} u.
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-slate-100 sm:hidden">
              {movimientos.map((mov) => {
                const estilosTipo = obtenerEstilosTipoMovimiento(mov.tipo);
                return (
                  <li key={mov.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${estilosTipo.badgeClass}`}
                      >
                        {estilosTipo.etiqueta}
                      </span>
                      <span
                        className={`text-sm font-bold tabular-nums ${estilosTipo.cantidadClass}`}
                      >
                        {estilosTipo.signo}
                        {mov.cantidad} u.
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      [{mov.codigo_insumo ?? 'ITEM'}] {mov.insumo_nombre ?? 'Insumo'}
                    </p>
                    <p className="text-xs text-slate-600">
                      {formatearFechaHoraArgentina(mov.fecha)}
                      {mov.visita_codigo_reserva
                        ? ` · ${mov.visita_codigo_reserva}`
                        : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {modalAbierto && insumoActivo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-stock-titulo"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarModal();
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2
                  id="modal-stock-titulo"
                  className="text-base font-bold text-slate-900"
                >
                  {modoModal === 'ingreso'
                    ? 'Registrar ingreso de stock'
                    : 'Registrar entrega o consumo'}
                </h2>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                disabled={pendiente}
                aria-label="Cerrar ventana"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={manejarSubmit} className="space-y-4 p-5">
              <div
                role="group"
                aria-label="Operación de stock"
                className="grid grid-cols-2 gap-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setModoModal('ingreso');
                    setErrorModal(null);
                  }}
                  disabled={pendiente}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    modoModal === 'ingreso'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <PackagePlus size={15} />
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModoModal('consumo');
                    setErrorModal(null);
                  }}
                  disabled={pendiente}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    modoModal === 'consumo'
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <PackageMinus size={15} />
                  Entrega
                </button>
              </div>

              <div>
                <label
                  htmlFor="stock-insumo-select"
                  className="mb-1.5 block text-xs font-semibold text-slate-700"
                >
                  Artículo
                </label>
                <select
                  id="stock-insumo-select"
                  value={insumoActivo.id}
                  onChange={(e) => {
                    setInsumoSeleccionadoId(e.target.value);
                    setErrorModal(null);
                  }}
                  disabled={pendiente}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {insumos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.codigo} · {item.nombre_insumo} ({item.cantidad_disponible} disp.)
                    </option>
                  ))}
                </select>
              </div>

              {modoModal === 'consumo' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Motivo
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTipoConsumo('visita_escolar')}
                      disabled={pendiente}
                      className={`h-10 rounded-lg border text-xs font-semibold transition-colors ${
                        tipoConsumo === 'visita_escolar'
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Visita escolar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoConsumo('consumo_interno');
                        setVisitaId('');
                      }}
                      disabled={pendiente}
                      className={`h-10 rounded-lg border text-xs font-semibold transition-colors ${
                        tipoConsumo === 'consumo_interno'
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Consumo interno
                    </button>
                  </div>
                </div>
              )}

              {modoModal === 'consumo' && tipoConsumo === 'visita_escolar' && (
                <div>
                  <label
                    htmlFor="stock-visita-select"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Escuela asociada (opcional)
                  </label>
                  <select
                    id="stock-visita-select"
                    value={visitaId}
                    onChange={(e) => setVisitaId(e.target.value)}
                    disabled={pendiente}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Sin vincular a una visita</option>
                    {visitasRecientes.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.codigo_reserva} · {v.fecha_visita} · {v.institucion}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="stock-cantidad-input"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Cantidad (unidades)
                  </label>
                  <span className="text-xs text-slate-600 tabular-nums">
                    Disponible: {insumoActivo.cantidad_disponible} u.
                  </span>
                </div>
                <input
                  id="stock-cantidad-input"
                  type="number"
                  min={1}
                  max={
                    modoModal === 'consumo'
                      ? Math.max(1, insumoActivo.cantidad_disponible)
                      : MAX_CANTIDAD_MOVIMIENTO
                  }
                  step={1}
                  required
                  value={cantidadTexto}
                  onChange={(e) => {
                    setCantidadTexto(e.target.value);
                    setErrorModal(null);
                  }}
                  disabled={pendiente}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />

                <div className="mt-2 grid grid-cols-4 gap-2">
                  {CANTIDADES_RAPIDAS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={pendiente}
                      onClick={() => {
                        setCantidadTexto(String(n));
                        setErrorModal(null);
                      }}
                      className="h-9 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      {n} u.
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-600">Saldo resultante</span>
                  {saldoProyectado === null ? (
                    <span className="text-slate-400">—</span>
                  ) : saldoInsuficiente ? (
                    <span className="font-bold text-rose-700 tabular-nums">
                      Insuficiente ({saldoProyectado} u.)
                    </span>
                  ) : (
                    <span
                      className={`font-bold tabular-nums ${
                        saldoProyectado <= insumoActivo.cantidad_minima_alerta
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {insumoActivo.cantidad_disponible} → {saldoProyectado} u.
                    </span>
                  )}
                </div>
              </div>

              {errorModal && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
                >
                  <AlertTriangle
                    size={15}
                    className="mt-0.5 shrink-0 text-rose-600"
                  />
                  <span>{errorModal}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={cerrarModal}
                  disabled={pendiente}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    pendiente ||
                    !cantidadEsEnteraValida ||
                    saldoInsuficiente ||
                    (modoModal === 'consumo' &&
                      insumoActivo.cantidad_disponible <= 0)
                  }
                  className={`h-10 rounded-lg px-4 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    modoModal === 'ingreso'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {pendiente
                    ? 'Guardando…'
                    : modoModal === 'ingreso'
                      ? 'Confirmar ingreso'
                      : 'Confirmar entrega'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
