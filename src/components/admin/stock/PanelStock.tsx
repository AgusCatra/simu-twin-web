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
      cardClass: 'border-rose-500/70 bg-rose-950/15',
      badgeClass: 'border-rose-500/50 bg-rose-950/60 text-rose-300',
      barClass: 'bg-rose-500',
      etiqueta: 'SIN STOCK',
      enAlerta: true,
      agotado: true,
    };
  }

  if (insumo.cantidad_disponible <= insumo.cantidad_minima_alerta) {
    return {
      cardClass: 'border-amber-500/70 bg-amber-950/15',
      badgeClass: 'border-amber-500/50 bg-amber-950/60 text-amber-300',
      barClass: 'bg-amber-400',
      etiqueta: 'BAJO MÍNIMO',
      enAlerta: true,
      agotado: false,
    };
  }

  return {
    cardClass: 'border-zinc-800 bg-zinc-950',
    badgeClass: 'border-emerald-500/40 bg-emerald-950/35 text-emerald-300',
    barClass: 'bg-emerald-400',
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
      etiqueta: 'INGRESO COMPRA',
      badgeClass: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300',
      cantidadClass: 'text-emerald-300',
      signo: '+',
    };
  }
  if (tipo === 'visita_escolar') {
    return {
      etiqueta: 'VISITA ESCOLAR',
      badgeClass: 'border-sky-500/40 bg-sky-950/40 text-sky-300',
      cantidadClass: 'text-sky-300',
      signo: '-',
    };
  }
  return {
    etiqueta: 'CONSUMO INTERNO',
    badgeClass: 'border-amber-500/40 bg-amber-950/40 text-amber-300',
    cantidadClass: 'text-amber-300',
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
          className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-200"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-rose-400" />
            {errorLectura}
          </span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-rose-800 bg-zinc-950 px-3 font-mono text-[11px] tracking-[0.1em] text-zinc-100 hover:border-rose-600"
          >
            <RefreshCw size={12} />
            REINTENTAR
          </button>
        </div>
      )}

      {/* ── Feedback de último movimiento exitoso ──────────────── */}
      {feedbackExito && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-sm border border-emerald-700/70 bg-emerald-950/35 px-4 py-2.5 text-sm text-emerald-200"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
            {feedbackExito}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackExito(null)}
            aria-label="Ocultar aviso"
            className="rounded-sm p-1 text-emerald-300/80 hover:bg-emerald-900/40 hover:text-emerald-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── KPIs de estado del pañol ───────────────────────────── */}
      <section aria-label="Resumen de stock del pañol">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-500">
                EXISTENCIAS EN PAÑOL
              </p>
              <Package size={15} className="text-zinc-500" aria-hidden />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <p className="font-mono text-2xl font-semibold text-white tabular-nums">
                {resumen.unidadesTotales}
              </p>
              <span className="font-mono text-[11px] text-zinc-500">
                unidades en {insumos.length} rubros
              </span>
            </div>
          </article>

          <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-500">
                UMBRAL DE ALERTA
              </p>
              <AlertTriangle
                size={15}
                className={
                  resumen.agotados.length > 0
                    ? 'text-rose-400'
                    : resumen.enAlerta.length > 0
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }
                aria-hidden
              />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <p
                className={`font-mono text-2xl font-semibold tabular-nums ${
                  resumen.agotados.length > 0
                    ? 'text-rose-400'
                    : resumen.enAlerta.length > 0
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                }`}
              >
                {resumen.enAlerta.length}
              </p>
              <span className="font-mono text-[11px] text-zinc-400">
                {resumen.enAlerta.length === 0
                  ? 'todos los insumos sobre mínimo'
                  : resumen.agotados.length > 0
                    ? `${resumen.agotados.length} agotado(s)`
                    : 'requieren reposición'}
              </span>
            </div>
          </article>

          <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-500">
                AUDITORÍA RECIENTE
              </p>
              <History size={15} className="text-zinc-500" aria-hidden />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <p className="font-mono text-2xl font-semibold text-white tabular-nums">
                {movimientos.length}
              </p>
              <span className="font-mono text-[11px] text-zinc-400">
                {resumen.ingresosRecientes} ing. · {resumen.consumosRecientes}{' '}
                cons.
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* ── Banner de alerta por umbral mínimo ─────────────────── */}
      {resumen.enAlerta.length > 0 && (
        <div
          role="alert"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-sm border px-4 py-3 ${
            resumen.agotados.length > 0
              ? 'border-rose-700/80 bg-rose-950/35 text-rose-100'
              : 'border-amber-700/80 bg-amber-950/30 text-amber-100'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              size={16}
              className={`mt-0.5 shrink-0 ${
                resumen.agotados.length > 0 ? 'text-rose-400' : 'text-amber-400'
              }`}
              aria-hidden
            />
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.1em]">
                {resumen.agotados.length > 0
                  ? 'Alerta crítica: insumo sin stock en pañol'
                  : 'Alerta de reposición: existencias por debajo o iguales al mínimo'}
              </p>
              <p className="mt-0.5 text-xs text-zinc-300">
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
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-amber-500/60 bg-zinc-950 px-3 font-mono text-[11px] font-semibold tracking-[0.08em] text-amber-200 transition-colors hover:bg-amber-950/60"
          >
            <PackagePlus size={14} />
            REPONER AHORA
          </button>
        </div>
      )}

      {/* ── Barra de acciones rápidas ──────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200">
            CATÁLOGO DE INSUMOS ({insumos.length})
          </h3>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-zinc-500">
            REFRIGERIO DE VISITAS ESCOLARES Y MATERIAL DIDÁCTICO
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-950 px-3 font-mono text-[11px] tracking-[0.08em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <RefreshCw size={13} />
            ACTUALIZAR
          </button>

          <button
            type="button"
            onClick={() => abrirModal('ingreso')}
            disabled={insumos.length === 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-emerald-700 bg-emerald-950/60 px-3.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-emerald-200 transition-colors hover:border-emerald-500 hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PackagePlus size={14} />
            INGRESO DE MERCADERÍA
          </button>

          <button
            type="button"
            onClick={() => abrirModal('consumo')}
            disabled={
              insumos.length === 0 ||
              insumos.every((i) => i.cantidad_disponible <= 0)
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-amber-700 bg-amber-950/60 px-3.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-amber-200 transition-colors hover:border-amber-500 hover:bg-amber-900/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PackageMinus size={14} />
            REGISTRAR CONSUMO
          </button>
        </div>
      </div>

      {/* ── Tarjetas de Insumos ────────────────────────────────── */}
      {insumos.length === 0 ? (
        <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950 px-5 py-10 text-center">
          <Package size={24} className="mx-auto text-zinc-600" aria-hidden />
          <p className="mt-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
            Sin insumos registrados en pañol
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            No se encontraron artículos en la tabla{' '}
            <code className="font-mono text-zinc-300">stock_insumos</code>.
          </p>
        </div>
      ) : (
        <section aria-label="Tarjetas de existencias por insumo">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insumos.map((insumo) => {
              const estilos = obtenerEstilosNivel(insumo);
              const porcentaje = calcularPorcentajeNivel(insumo);

              return (
                <article
                  key={insumo.id}
                  className={`flex flex-col justify-between rounded-sm border p-4 transition-colors ${estilos.cardClass}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.1em] text-zinc-100">
                        {insumo.codigo}
                      </span>
                      <span
                        className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] ${estilos.badgeClass}`}
                      >
                        {estilos.etiqueta}
                      </span>
                    </div>

                    <h4 className="mt-3 text-base font-semibold leading-snug text-zinc-100">
                      {insumo.nombre_insumo}
                    </h4>

                    <div className="mt-4 flex items-baseline justify-between gap-2">
                      <div>
                        <p className="font-mono text-[10px] tracking-[0.14em] text-zinc-500">
                          DISPONIBLE
                        </p>
                        <p className="font-mono text-3xl font-bold tracking-tight text-white tabular-nums">
                          {insumo.cantidad_disponible}
                          <span className="ml-1.5 text-xs font-normal text-zinc-400">
                            u.
                          </span>
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-mono text-[10px] tracking-[0.14em] text-zinc-500">
                          MÍN. ALERTA
                        </p>
                        <p className="font-mono text-sm font-semibold text-zinc-300 tabular-nums">
                          {insumo.cantidad_minima_alerta} u.
                        </p>
                      </div>
                    </div>

                    {/* Barra visual de nivel */}
                    <div
                      aria-hidden
                      className="mt-3 h-1.5 w-full overflow-hidden rounded-sm bg-zinc-800"
                    >
                      <div
                        className={`h-full transition-all ${estilos.barClass}`}
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>

                    <p className="mt-2 font-mono text-[10px] tracking-[0.06em] text-zinc-500">
                      ACT.: {formatearFechaHoraArgentina(insumo.updated_at)}
                    </p>
                  </div>

                  {/* Controles directos */}
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800/80 pt-3">
                    <button
                      type="button"
                      onClick={() => abrirModal('ingreso', insumo.id)}
                      className="flex h-11 items-center justify-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 font-mono text-[11px] font-semibold tracking-[0.08em] text-emerald-300 transition-colors hover:border-emerald-600 hover:bg-emerald-950/40"
                    >
                      <ArrowDownToLine size={14} />
                      INGRESAR
                    </button>

                    <button
                      type="button"
                      onClick={() => abrirModal('consumo', insumo.id)}
                      disabled={estilos.agotado}
                      className="flex h-11 items-center justify-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 font-mono text-[11px] font-semibold tracking-[0.08em] text-amber-300 transition-colors hover:border-amber-600 hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUpFromLine size={14} />
                      CONSUMO
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Tabla de Auditoría de Últimos 20 Movimientos ───────── */}
      <section
        aria-label="Historial de últimos movimientos de stock"
        className="rounded-sm border border-zinc-800 bg-zinc-950"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <History size={15} className="text-zinc-400" aria-hidden />
            <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100">
              AUDITORÍA DE MOVIMIENTOS · ÚLTIMOS 20
            </h3>
          </div>
          <span className="font-mono text-[10px] tracking-[0.12em] text-zinc-500">
            {movimientos.length} REGISTROS
          </span>
        </div>

        {movimientos.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-zinc-400">
              Sin movimientos registrados en auditoría
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Cada ingreso de mercadería o consumo registrado aparecerá aquí con
              fecha, tipo y saldo aplicado.
            </p>
          </div>
        ) : (
          <>
            {/* Vista desktop / tablet */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">Fecha y hora</th>
                    <th className="px-4 py-2.5 font-medium">Insumo</th>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Referencia</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-sm">
                  {movimientos.map((mov) => {
                    const estilosTipo = obtenerEstilosTipoMovimiento(mov.tipo);
                    return (
                      <tr
                        key={mov.id}
                        className="transition-colors hover:bg-zinc-900/50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-400 tabular-nums">
                          {formatearFechaHoraArgentina(mov.fecha)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-zinc-200">
                              {mov.codigo_insumo ?? 'ITEM'}
                            </span>
                            <span className="text-zinc-100">
                              {mov.insumo_nombre ?? 'Insumo sin catálogo'}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] ${estilosTipo.badgeClass}`}
                          >
                            {estilosTipo.etiqueta}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-400">
                          {mov.visita_codigo_reserva ? (
                            <span className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                              {mov.visita_codigo_reserva}
                            </span>
                          ) : mov.visita_id ? (
                            <span>Visita {mov.visita_id.slice(0, 8)}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-bold tabular-nums ${estilosTipo.cantidadClass}`}
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

            {/* Vista móvil apilada */}
            <ul className="divide-y divide-zinc-800/80 sm:hidden">
              {movimientos.map((mov) => {
                const estilosTipo = obtenerEstilosTipoMovimiento(mov.tipo);
                return (
                  <li key={mov.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] ${estilosTipo.badgeClass}`}
                      >
                        {estilosTipo.etiqueta}
                      </span>
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${estilosTipo.cantidadClass}`}
                      >
                        {estilosTipo.signo}
                        {mov.cantidad} u.
                      </span>
                    </div>
                    <p className="text-sm font-medium text-zinc-100">
                      <span className="mr-1.5 font-mono text-xs text-zinc-400">
                        [{mov.codigo_insumo ?? 'ITEM'}]
                      </span>
                      {mov.insumo_nombre ?? 'Insumo sin catálogo'}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-500">
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

      {/* ── Modal accesible de Movimiento (Ingreso / Consumo) ───── */}
      {modalAbierto && insumoActivo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-stock-titulo"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarModal();
          }}
        >
          <div className="w-full max-w-md rounded-sm border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  PAÑOL ·{' '}
                  {modoModal === 'ingreso'
                    ? 'INGRESO DE MERCADERÍA'
                    : 'REGISTRAR CONSUMO'}
                </p>
                <h2
                  id="modal-stock-titulo"
                  className="mt-0.5 text-base font-semibold text-white"
                >
                  {modoModal === 'ingreso'
                    ? 'Ingreso de mercadería'
                    : 'Registrar consumo de stock'}
                </h2>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                disabled={pendiente}
                aria-label="Cerrar modal"
                className="rounded-sm border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:border-zinc-600 hover:text-white disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={manejarSubmit} className="space-y-4 p-4">
              {/* Conmutador Ingreso vs Consumo */}
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
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-sm border font-mono text-[11px] font-semibold tracking-[0.08em] transition-colors ${
                    modoModal === 'ingreso'
                      ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <PackagePlus size={14} />
                  INGRESO
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModoModal('consumo');
                    setErrorModal(null);
                  }}
                  disabled={pendiente}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-sm border font-mono text-[11px] font-semibold tracking-[0.08em] transition-colors ${
                    modoModal === 'consumo'
                      ? 'border-amber-500 bg-amber-950/60 text-amber-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <PackageMinus size={14} />
                  CONSUMO
                </button>
              </div>

              {/* Selector de insumo */}
              <div>
                <label
                  htmlFor="stock-insumo-select"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400"
                >
                  Insumo del pañol
                </label>
                <select
                  id="stock-insumo-select"
                  value={insumoActivo.id}
                  onChange={(e) => {
                    setInsumoSeleccionadoId(e.target.value);
                    setErrorModal(null);
                  }}
                  disabled={pendiente}
                  className="h-11 w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                >
                  {insumos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.codigo} · {item.nombre_insumo} (
                      {item.cantidad_disponible} disp.)
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo de consumo (solo cuando es consumo) */}
              {modoModal === 'consumo' && (
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                    Motivo del egreso
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTipoConsumo('visita_escolar')}
                      disabled={pendiente}
                      className={`h-10 rounded-sm border font-mono text-[10.5px] font-semibold tracking-[0.08em] transition-colors ${
                        tipoConsumo === 'visita_escolar'
                          ? 'border-sky-500 bg-sky-950/50 text-sky-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      VISITA ESCOLAR
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoConsumo('consumo_interno');
                        setVisitaId('');
                      }}
                      disabled={pendiente}
                      className={`h-10 rounded-sm border font-mono text-[10.5px] font-semibold tracking-[0.08em] transition-colors ${
                        tipoConsumo === 'consumo_interno'
                          ? 'border-amber-500 bg-amber-950/50 text-amber-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      CONSUMO INTERNO
                    </button>
                  </div>
                </div>
              )}

              {/* Vinculación opcional a visita escolar */}
              {modoModal === 'consumo' && tipoConsumo === 'visita_escolar' && (
                <div>
                  <label
                    htmlFor="stock-visita-select"
                    className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400"
                  >
                    Visita educativa asociada (opcional)
                  </label>
                  <select
                    id="stock-visita-select"
                    value={visitaId}
                    onChange={(e) => setVisitaId(e.target.value)}
                    disabled={pendiente}
                    className="h-11 w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="">Sin vincular a una visita específica</option>
                    {visitasRecientes.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.codigo_reserva} · {v.fecha_visita} · {v.institucion}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cantidad */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="stock-cantidad-input"
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400"
                  >
                    Cantidad (unidades)
                  </label>
                  <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
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
                  className="h-11 w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 font-mono text-base font-semibold text-white tabular-nums focus:border-zinc-500 focus:outline-none"
                />

                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {CANTIDADES_RAPIDAS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={pendiente}
                      onClick={() => {
                        setCantidadTexto(String(n));
                        setErrorModal(null);
                      }}
                      className="h-8 rounded-sm border border-zinc-800 bg-zinc-900 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                    >
                      {n} u.
                    </button>
                  ))}
                </div>
              </div>

              {/* Previsualización de saldo */}
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">SALDO RESULTANTE</span>
                  {saldoProyectado === null ? (
                    <span className="text-zinc-500">—</span>
                  ) : saldoInsuficiente ? (
                    <span className="font-semibold text-rose-400 tabular-nums">
                      INSUFICIENTE ({saldoProyectado} u.)
                    </span>
                  ) : (
                    <span
                      className={`font-semibold tabular-nums ${
                        saldoProyectado <= insumoActivo.cantidad_minima_alerta
                          ? 'text-amber-300'
                          : 'text-emerald-300'
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
                  className="flex items-start gap-2 rounded-sm border border-rose-900 bg-rose-950/50 px-3 py-2 text-xs text-rose-200"
                >
                  <AlertTriangle
                    size={14}
                    className="mt-0.5 shrink-0 text-rose-400"
                  />
                  <span>{errorModal}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={cerrarModal}
                  disabled={pendiente}
                  className="h-10 rounded-sm border border-zinc-800 bg-zinc-900 px-3.5 font-mono text-[11px] tracking-[0.08em] text-zinc-300 hover:border-zinc-600 hover:text-white disabled:opacity-50"
                >
                  CANCELAR
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
                  className={`h-10 rounded-sm border px-4 font-mono text-[11px] font-semibold tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    modoModal === 'ingreso'
                      ? 'border-emerald-600 bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
                      : 'border-amber-500 bg-amber-400 text-zinc-950 hover:bg-amber-300'
                  }`}
                >
                  {pendiente
                    ? 'GUARDANDO…'
                    : modoModal === 'ingreso'
                      ? 'CONFIRMAR INGRESO'
                      : 'CONFIRMAR CONSUMO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
