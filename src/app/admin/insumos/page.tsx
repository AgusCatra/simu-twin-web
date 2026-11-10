import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PanelStock from '@/components/admin/stock/PanelStock';
import {
  TIPOS_MOVIMIENTO_STOCK,
  type InsumoStock,
  type MovimientoStockItem,
  type TipoMovimientoStock,
  type VisitaReferenciaStock,
} from '@/types/stock';

/**
 * /admin/insumos — Server Component del módulo Stock / Pañol (Ticket S3.3).
 *
 * Consulta concurrentemente `stock_insumos` (ordenado por `codigo`) y los
 * últimos 20 registros de `stock_movimientos` (ordenados por `fecha` DESC),
 * enriqueciéndolos en servidor con el catálogo del pañol y la referencia de
 * visita educativa vinculada.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stock e Insumos · Hub Simuladores',
  description:
    'Control de existencias de pañol, umbrales de alerta, ingresos de mercadería y auditoría de consumos.',
};

interface FilaInsumoDB {
  id: string;
  codigo: string | null;
  nombre_insumo: string | null;
  cantidad_disponible: number | null;
  cantidad_minima_alerta: number | null;
  updated_at: string | null;
}

type VisitaJoinMovimiento =
  | { codigo_reserva: string | null }
  | Array<{ codigo_reserva: string | null }>
  | null;

interface FilaMovimientoDB {
  id: string;
  insumo_id: string | null;
  tipo: string | null;
  cantidad: number | null;
  visita_id: string | null;
  fecha: string | null;
  visitas_educativas?: VisitaJoinMovimiento;
}

type EscuelaJoinVisita =
  | {
      nombre_institucion?: string | null;
      nombre_corto?: string | null;
    }
  | Array<{
      nombre_institucion?: string | null;
      nombre_corto?: string | null;
    }>
  | null;

interface FilaVisitaReferenciaDB {
  id: string;
  codigo_reserva: string | null;
  fecha_visita: string | null;
  estado_visita: string | null;
  otra_institucion_nombre: string | null;
  escuelas?: EscuelaJoinVisita;
}

function normalizarTipoMovimiento(raw: string | null): TipoMovimientoStock {
  if (
    raw &&
    (TIPOS_MOVIMIENTO_STOCK as readonly string[]).includes(raw.trim())
  ) {
    return raw.trim() as TipoMovimientoStock;
  }
  return 'consumo_interno';
}

function obtenerCodigoReservaJoin(join: VisitaJoinMovimiento | undefined): string | null {
  if (!join) return null;
  const obj = Array.isArray(join) ? join[0] : join;
  return obj?.codigo_reserva?.trim() || null;
}

function resolverNombreInstitucion(fila: FilaVisitaReferenciaDB): string {
  const rel = fila.escuelas;
  if (rel) {
    const escuela = Array.isArray(rel) ? rel[0] : rel;
    const corto = escuela?.nombre_corto?.trim();
    const largo = escuela?.nombre_institucion?.trim();
    if (corto) return corto;
    if (largo) return largo;
  }
  return fila.otra_institucion_nombre?.trim() || 'Institución escolar';
}

export default async function InsumosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  let insumos: InsumoStock[] = [];
  let movimientos: MovimientoStockItem[] = [];
  let visitasRecientes: VisitaReferenciaStock[] = [];
  let errorLectura: string | null = null;

  try {
    const [respInsumos, respMovimientos, respVisitas] = await Promise.all([
      supabase
        .from('stock_insumos')
        .select(
          'id, codigo, nombre_insumo, cantidad_disponible, cantidad_minima_alerta, updated_at'
        )
        .order('codigo', { ascending: true })
        .returns<FilaInsumoDB[]>(),
      supabase
        .from('stock_movimientos')
        .select(
          'id, insumo_id, tipo, cantidad, visita_id, fecha, visitas_educativas(codigo_reserva)'
        )
        .order('fecha', { ascending: false })
        .limit(20)
        .returns<FilaMovimientoDB[]>(),
      supabase
        .from('visitas_educativas')
        .select(
          'id, codigo_reserva, fecha_visita, estado_visita, otra_institucion_nombre, escuelas(nombre_institucion, nombre_corto)'
        )
        .neq('estado_visita', 'Cancelada')
        .order('fecha_visita', { ascending: false })
        .limit(25)
        .returns<FilaVisitaReferenciaDB[]>(),
    ]);

    if (respInsumos.error || respMovimientos.error) {
      errorLectura = 'No se pudo cargar completamente el inventario del pañol.';
      console.error('[/admin/insumos] Error al consultar stock:', {
        insumos: respInsumos.error?.message,
        movimientos: respMovimientos.error?.message,
      });
    }

    insumos = (respInsumos.data ?? []).map((fila) => ({
      id: fila.id,
      codigo: fila.codigo?.trim() || 'SIN-COD',
      nombre_insumo: fila.nombre_insumo?.trim() || 'Insumo sin nombre',
      cantidad_disponible:
        typeof fila.cantidad_disponible === 'number' &&
        Number.isFinite(fila.cantidad_disponible)
          ? fila.cantidad_disponible
          : 0,
      cantidad_minima_alerta:
        typeof fila.cantidad_minima_alerta === 'number' &&
        Number.isFinite(fila.cantidad_minima_alerta)
          ? fila.cantidad_minima_alerta
          : 0,
      updated_at: fila.updated_at ?? undefined,
    }));

    const insumosPorId = new Map<string, InsumoStock>(
      insumos.map((item) => [item.id, item])
    );

    movimientos = (respMovimientos.data ?? [])
      .filter((fila) => Boolean(fila.insumo_id))
      .map((fila) => {
        const insumoId = fila.insumo_id as string;
        const catalogo = insumosPorId.get(insumoId);
        return {
          id: fila.id,
          insumo_id: insumoId,
          tipo: normalizarTipoMovimiento(fila.tipo),
          cantidad:
            typeof fila.cantidad === 'number' && Number.isFinite(fila.cantidad)
              ? fila.cantidad
              : 0,
          visita_id: fila.visita_id ?? null,
          fecha: fila.fecha ?? '',
          insumo_nombre: catalogo?.nombre_insumo ?? 'Insumo sin catálogo',
          codigo_insumo:
            catalogo?.codigo ?? insumoId.slice(0, 8).toUpperCase(),
          visita_codigo_reserva: obtenerCodigoReservaJoin(
            fila.visitas_educativas
          ),
        };
      });

    if (!respVisitas.error) {
      visitasRecientes = (respVisitas.data ?? [])
        .filter((v) => v.estado_visita?.toLowerCase() !== 'cancelada')
        .map((v) => ({
          id: v.id,
          codigo_reserva: v.codigo_reserva?.trim() || 'S/C',
          fecha_visita: (v.fecha_visita ?? '').split('T')[0],
          institucion: resolverNombreInstitucion(v),
        }));
    }
  } catch (err) {
    errorLectura = 'No fue posible establecer conexión con la base de datos.';
    console.error('[/admin/insumos] Error inesperado SSR:', {
      message: err instanceof Error ? err.message : 'Error desconocido',
    });
  }

  return (
    <section className="space-y-5">
      <header className="border-b border-zinc-800 pb-3">
        <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-600">
          /ADMIN/INSUMOS · PAÑOL Y REFRIGERIOS
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">
          Stock e Insumos{' '}
          <span className="font-mono text-zinc-500">
            {'// AUDITORÍA DE PAÑOL'}
          </span>
        </h2>
        <p className="mt-1 font-mono text-[11px] tracking-[0.08em] text-zinc-500">
          CONTROL DE EXISTENCIAS, ALERTAS DE REPOSICIÓN Y TRAZABILIDAD DE CONSUMOS
        </p>
      </header>

      <PanelStock
        insumos={insumos}
        movimientos={movimientos}
        visitasRecientes={visitasRecientes}
        errorLectura={errorLectura}
      />
    </section>
  );
}
