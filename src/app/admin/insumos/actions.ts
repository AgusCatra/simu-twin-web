'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  TIPOS_MOVIMIENTO_STOCK,
  type RegistrarMovimientoStockInput,
  type ResultadoRegistrarMovimientoStock,
  type TipoMovimientoStock,
} from '@/types/stock';

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_CANTIDAD_MOVIMIENTO = 100_000;
const MAX_PG_INT32 = 2_147_483_647;
const MAX_INTENTOS_CAS = 3;

interface FilaInsumoLectura {
  id: string;
  codigo: string;
  nombre_insumo: string;
  cantidad_disponible: number;
}

function esTipoMovimientoValido(valor: unknown): valor is TipoMovimientoStock {
  return (
    typeof valor === 'string' &&
    (TIPOS_MOVIMIENTO_STOCK as readonly string[]).includes(valor)
  );
}

function esConsumo(tipo: TipoMovimientoStock): boolean {
  return tipo === 'consumo_interno' || tipo === 'visita_escolar';
}

/**
 * Registra un ingreso o consumo de pañol actualizando `stock_insumos` con guarda
 * de concurrencia (CAS sobre `cantidad_disponible`), validando existencias en
 * servidor antes de descontar y escribiendo el asiento en `stock_movimientos`
 * con rollback compensatorio si falla el insert del historial.
 */
export async function registrarMovimientoStockAction(
  input: RegistrarMovimientoStockInput
): Promise<ResultadoRegistrarMovimientoStock> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Payload de movimiento ausente o inválido.' };
  }

  const insumoId =
    typeof input.insumo_id === 'string' ? input.insumo_id.trim() : '';
  if (!FORMATO_UUID.test(insumoId)) {
    return { ok: false, error: 'El identificador del insumo es inválido.' };
  }

  if (!esTipoMovimientoValido(input.tipo)) {
    return {
      ok: false,
      error:
        'Tipo de movimiento no permitido. Debe ser ingreso_compra, visita_escolar o consumo_interno.',
    };
  }

  if (
    typeof input.cantidad !== 'number' ||
    !Number.isFinite(input.cantidad) ||
    !Number.isInteger(input.cantidad) ||
    input.cantidad <= 0
  ) {
    return {
      ok: false,
      error: 'La cantidad debe ser un número entero positivo mayor a 0.',
    };
  }

  if (input.cantidad > MAX_CANTIDAD_MOVIMIENTO) {
    return {
      ok: false,
      error: `La cantidad por operación no puede superar ${MAX_CANTIDAD_MOVIMIENTO} unidades.`,
    };
  }

  let visitaIdNormalizada: string | null = null;
  if (input.visita_id !== undefined && input.visita_id !== null) {
    if (typeof input.visita_id !== 'string') {
      return { ok: false, error: 'El identificador de visita es inválido.' };
    }
    const limpia = input.visita_id.trim();
    if (limpia.length > 0) {
      if (!FORMATO_UUID.test(limpia)) {
        return { ok: false, error: 'El identificador de visita no es un UUID válido.' };
      }
      if (input.tipo === 'visita_escolar') {
        visitaIdNormalizada = limpia;
      }
    }
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Sesión no autenticada.' };
  }

  if (visitaIdNormalizada) {
    const { data: visita, error: errorVisita } = await supabase
      .from('visitas_educativas')
      .select('id')
      .eq('id', visitaIdNormalizada)
      .maybeSingle<{ id: string }>();

    if (errorVisita) {
      console.error('[registrarMovimientoStockAction] Error al validar visita:', {
        code: errorVisita.code,
        message: errorVisita.message,
      });
      return {
        ok: false,
        error: 'No se pudo verificar la visita educativa asociada.',
      };
    }

    if (!visita?.id) {
      return {
        ok: false,
        error: 'La visita educativa seleccionada no existe.',
      };
    }
  }

  const cantidad = input.cantidad;
  const descontar = esConsumo(input.tipo);

  let saldoAnterior = 0;
  let nuevoSaldo = 0;
  let actualizado = false;

  for (let intento = 0; intento < MAX_INTENTOS_CAS; intento += 1) {
    const { data: insumo, error: errorLectura } = await supabase
      .from('stock_insumos')
      .select('id, codigo, nombre_insumo, cantidad_disponible')
      .eq('id', insumoId)
      .maybeSingle<FilaInsumoLectura>();

    if (errorLectura) {
      console.error('[registrarMovimientoStockAction] Error al leer insumo:', {
        code: errorLectura.code,
        message: errorLectura.message,
      });
      return {
        ok: false,
        error: 'No se pudo consultar el saldo actual del insumo.',
      };
    }

    if (!insumo) {
      return { ok: false, error: 'El insumo seleccionado no existe en pañol.' };
    }

    const disponible =
      typeof insumo.cantidad_disponible === 'number' &&
      Number.isFinite(insumo.cantidad_disponible)
        ? insumo.cantidad_disponible
        : 0;

    if (descontar && disponible < cantidad) {
      return {
        ok: false,
        error: `Stock insuficiente de ${insumo.nombre_insumo} (${insumo.codigo}). Disponible: ${disponible}, solicitado: ${cantidad}.`,
      };
    }

    const calculado = descontar ? disponible - cantidad : disponible + cantidad;
    if (!Number.isSafeInteger(calculado) || calculado > MAX_PG_INT32 || calculado < 0) {
      return {
        ok: false,
        error: 'El saldo resultante excede el rango numérico permitido.',
      };
    }

    const ahoraUpdateIso = new Date().toISOString();
    const { data: filaActualizada, error: errorUpdate } = await supabase
      .from('stock_insumos')
      .update({
        cantidad_disponible: calculado,
        updated_at: ahoraUpdateIso,
      })
      .eq('id', insumoId)
      .eq('cantidad_disponible', disponible)
      .select('id, cantidad_disponible')
      .maybeSingle<{ id: string; cantidad_disponible: number }>();

    if (errorUpdate) {
      console.error('[registrarMovimientoStockAction] Error al actualizar saldo:', {
        code: errorUpdate.code,
        message: errorUpdate.message,
      });
      return {
        ok: false,
        error: 'No se pudo actualizar la existencia en pañol.',
      };
    }

    if (filaActualizada?.id) {
      saldoAnterior = disponible;
      nuevoSaldo = filaActualizada.cantidad_disponible;
      actualizado = true;
      break;
    }
  }

  if (!actualizado) {
    return {
      ok: false,
      error:
        'El saldo del insumo cambió simultáneamente desde otra terminal. Reintentá la operación.',
    };
  }

  const fechaMovimientoIso = new Date().toISOString();
  const { data: movimientoCreado, error: errorMovimiento } = await supabase
    .from('stock_movimientos')
    .insert({
      insumo_id: insumoId,
      tipo: input.tipo,
      cantidad,
      visita_id: visitaIdNormalizada,
      fecha: fechaMovimientoIso,
    })
    .select('id')
    .single<{ id: string }>();

  if (errorMovimiento || !movimientoCreado?.id) {
    console.error('[registrarMovimientoStockAction] Error al registrar movimiento:', {
      code: errorMovimiento?.code,
      message: errorMovimiento?.message,
    });

    // Rollback compensatorio best-effort del saldo modificado previamente.
    const { error: errorRollback } = await supabase
      .from('stock_insumos')
      .update({
        cantidad_disponible: saldoAnterior,
        updated_at: new Date().toISOString(),
      })
      .eq('id', insumoId)
      .eq('cantidad_disponible', nuevoSaldo);

    if (errorRollback) {
      console.error('[registrarMovimientoStockAction] Error en rollback de saldo:', {
        code: errorRollback.code,
        message: errorRollback.message,
      });
    }

    return {
      ok: false,
      error:
        'No se pudo registrar el movimiento en el libro de auditoría. Se revirtió la modificación de stock.',
    };
  }

  revalidatePath('/admin/insumos');
  revalidatePath('/admin');

  return {
    ok: true,
    movimiento_id: movimientoCreado.id,
    insumo_id: insumoId,
    cantidad_disponible: nuevoSaldo,
  };
}
