'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  ESTADOS_TRASLADO_TUP,
  type ActualizarEstadoTrasladoInput,
  type EstadoTrasladoTup,
  type ResultadoActualizarTrasladoTup,
} from '@/types/tup';

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_LONGITUD_CHOFER = 120;

interface ActualizacionTupPayload {
  tup_estado_traslado?: EstadoTrasladoTup;
  tup_chofer_nombre?: string | null;
}

function esEstadoTrasladoValido(valor: unknown): valor is EstadoTrasladoTup {
  return (
    typeof valor === 'string' &&
    (ESTADOS_TRASLADO_TUP as readonly string[]).includes(valor)
  );
}

/**
 * Actualiza el estado del traslado TUP y/o el chofer asignado de una visita
 * educativa. Solo puede invocarla un usuario autenticado con política UPDATE
 * sobre `visitas_educativas` (ver migración 0001).
 */
export async function actualizarEstadoTrasladoAction(
  payload: ActualizarEstadoTrasladoInput
): Promise<ResultadoActualizarTrasladoTup> {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload ausente' };
  }

  const visitaId =
    typeof payload.visita_id === 'string' ? payload.visita_id.trim() : '';
  if (!FORMATO_UUID.test(visitaId)) {
    return { ok: false, error: 'Identificador de visita inválido.' };
  }

  const updateData: ActualizacionTupPayload = {};

  if (payload.tup_estado_traslado !== undefined) {
    if (!esEstadoTrasladoValido(payload.tup_estado_traslado)) {
      return { ok: false, error: 'Estado de traslado TUP inválido.' };
    }
    updateData.tup_estado_traslado = payload.tup_estado_traslado;
  }

  if (payload.tup_chofer_nombre !== undefined) {
    if (
      payload.tup_chofer_nombre !== null &&
      typeof payload.tup_chofer_nombre !== 'string'
    ) {
      return { ok: false, error: 'Nombre de chofer inválido.' };
    }
    const choferLimpio = (payload.tup_chofer_nombre ?? '').trim();
    if (choferLimpio.length > MAX_LONGITUD_CHOFER) {
      return {
        ok: false,
        error: `El nombre del chofer no puede superar ${MAX_LONGITUD_CHOFER} caracteres.`,
      };
    }
    updateData.tup_chofer_nombre = choferLimpio.length > 0 ? choferLimpio : null;
  }

  if (
    updateData.tup_estado_traslado === undefined &&
    updateData.tup_chofer_nombre === undefined
  ) {
    return {
      ok: false,
      error: 'Debe indicar al menos el estado del traslado o el chofer asignado.',
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Sesión no autenticada.' };
  }

  const { data, error } = await supabase
    .from('visitas_educativas')
    .update(updateData)
    .eq('id', visitaId)
    .eq('requiere_tup', true)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error || !data?.id) {
    console.error('[actualizarEstadoTrasladoAction] Error al actualizar:', {
      code: error?.code,
      message: error?.message,
    });
    return {
      ok: false,
      error: 'No se pudo actualizar el traslado TUP. Intente nuevamente.',
    };
  }

  revalidatePath('/admin/tup');
  revalidatePath('/admin/visitas-educativas');
  revalidatePath('/admin');
  revalidatePath('/visitas');

  return {
    ok: true,
    ...(updateData.tup_estado_traslado !== undefined
      ? { tup_estado_traslado: updateData.tup_estado_traslado }
      : {}),
    ...(updateData.tup_chofer_nombre !== undefined
      ? { tup_chofer_nombre: updateData.tup_chofer_nombre }
      : {}),
  };
}
