/**
 * Contratos TypeScript estrictos del módulo Stock / Pañol (`/admin/insumos`).
 *
 * Respeta el CHECK `stock_movimientos_tipo_check` de PostgreSQL:
 * solo `'visita_escolar' | 'consumo_interno' | 'ingreso_compra'`.
 */

export const TIPOS_MOVIMIENTO_STOCK = [
  'visita_escolar',
  'consumo_interno',
  'ingreso_compra',
] as const;

export type TipoMovimientoStock = (typeof TIPOS_MOVIMIENTO_STOCK)[number];

export interface InsumoStock {
  id: string;
  codigo: string;
  nombre_insumo: string;
  cantidad_disponible: number;
  cantidad_minima_alerta: number;
  updated_at?: string;
}

export interface MovimientoStockItem {
  id: string;
  insumo_id: string;
  tipo: TipoMovimientoStock;
  cantidad: number;
  visita_id?: string | null;
  fecha: string;
  insumo_nombre?: string;
  codigo_insumo?: string;
  visita_codigo_reserva?: string | null;
}

export interface VisitaReferenciaStock {
  id: string;
  codigo_reserva: string;
  fecha_visita: string;
  institucion: string;
}

export interface RegistrarMovimientoStockInput {
  insumo_id: string;
  tipo: TipoMovimientoStock;
  cantidad: number;
  visita_id?: string | null;
}

export type ResultadoRegistrarMovimientoStock =
  | {
      ok: true;
      movimiento_id: string;
      insumo_id: string;
      cantidad_disponible: number;
    }
  | { ok: false; error: string };
