'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  ActualizarEstadoTrasladoInput,
  EstadoTrasladoTup,
} from '@/types/tup';

/**
 * Lista blanca de estados de traslado aceptados por la acción.
 *
 * Blindaje: el payload viene del cliente (panel móvil del chofer). Se valida
 * contra la tupla para impedir que un usuario malicioso grabe un estado
 * fuera del dominio (ej. "borrado") o inyecte SQL a través del string.
 */
const ESTADOS_VALIDOS = [
  'pendiente',
  'en_camino',
  'en_destino',
  'completado',
  'cancelado',
] as const satisfies readonly EstadoTrasladoTup[];

/**
 * Actualiza el estado del traslado TUP (y opcionalmente el chofer asignado)
 * de una visita educativa. Solo puede invocarla un usuario autenticado con
 * política UPDATE sobre `visitas_educativas` (ver migración 0001).
 *
 * Retorna `{ ok, error? }` tipado (sin `any`) para que el cliente muestre el
 * mensaje de dominio en español y pueda revertir la UI optimista si falla.
 */
export async function actualizarEstadoTrasladoAction(
  payload: ActualizarEstadoTrasladoInput
): Promise<{ ok: boolean; error?: string }> {
  if (!payload) return { ok: false, error: 'Payload ausente' };

  const visitaId = typeof payload.visita_id === 'string' ? payload.visita_id.trim() : '';
  if (!visitaId) return { ok: false, error: 'visita_id requerido' };

  const estado = payload.tup_estado_traslado;
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return { ok: false, error: 'Estado de traslado inválido' };
  }

  const supabase = await createClient();

  // Doble control: el middleware ya protege /admin/*, pero la action nunca
  // confía en el routing (podría invocarse directamente vía POST).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  // Lista blanca de columnas actualizables desde el panel móvil.
  const updateData: Record<string, unknown> = {
    tup_estado_traslado: estado,
  };
  if (payload.tup_chofer_nombre !== undefined) {
    const chofer =
      typeof payload.tup_chofer_nombre === 'string'
        ? payload.tup_chofer_nombre.trim()
        : '';
    updateData.tup_chofer_nombre = chofer.length > 0 ? chofer : null;
  }

  const { error } = await supabase
    .from('visitas_educativas')
    .update(updateData)
    .eq('id', visitaId);

  if (error) {
    console.error('[actualizarEstadoTrasladoAction] Error al actualizar:', {
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      error: 'No se pudo actualizar el estado del traslado. Intente nuevamente.',
    };
  }

  revalidatePath('/admin/tup');
  return { ok: true };
}
