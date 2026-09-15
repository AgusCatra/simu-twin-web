'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  ActividadInput,
  EstadoActividad,
  EstadoSimuladorConmutable,
  FinalizarSesionInput,
  GeneroParticipante,
  IniciarSesionInput,
  ParticipanteInput,
  ResultadoAccion,
  TipoActividad,
} from '@/types/actividades';

/** Ruta que se revalida tras cada mutación del módulo. */
const RUTA_REGISTRO_ACTIVIDADES = '/admin/registro-actividades';

/** Formato ISO de fecha (YYYY-MM-DD), el que exige Postgres en columnas `date`. */
const FORMATO_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Formato HH o HH:MM o HH:MM:SS aceptado por columnas `time`. */
const FORMATO_HORA = /^\d{2}:\d{2}(:\d{2})?$/;

const TIPOS_ACTIVIDAD_PERMITIDOS: readonly TipoActividad[] = [
  'empresa',
  'institucional',
  'capacitacion',
  'visita_especial',
  'mantenimiento',
  'otro',
];

const ESTADOS_ACTIVIDAD_PERMITIDOS: readonly EstadoActividad[] = [
  'planificada',
  'en_curso',
  'finalizada',
];

const GENEROS_PERMITIDOS: readonly GeneroParticipante[] = [
  'hombre',
  'mujer',
  'otro',
  'no_especifica',
];

/** Convierte "" / undefined en null para columnas date/time/uuid/texto nullable. */
function normalizarTextoNullable(
  valor: string | null | undefined
): string | null {
  const limpio = (valor ?? '').trim();
  return limpio.length > 0 ? limpio : null;
}

/** Valida la FORMA ISO de la fecha (rechaza valores imposibles como 2026-02-31). */
function esFechaIsoValida(valor: string): boolean {
  if (!FORMATO_FECHA_ISO.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return (
    fecha.getFullYear() === anio &&
    fecha.getMonth() === mes - 1 &&
    fecha.getDate() === dia
  );
}

/** Log PII-safe del error de PostgREST (solo código y mensaje). */
function registrarErrorBd(
  contexto: string,
  error: { code?: string; message?: string } | null
): void {
  console.error(contexto, {
    code: error?.code,
    message: error?.message,
  });
}

/**
 * Conmuta el estado operativo de un simulador desde el Rack en vivo.
 *
 * Blindaje: solo se aceptan los dos valores conmutables por el operador
 * (`libre` / `en_operacion`); `mantenimiento` se gestiona por otra vía.
 * Al liberar el equipo se limpia `actividad_actual_id` para no dejar
 * referencias colgando a una actividad ya cerrada.
 */
export async function conmutarEstadoSimuladorAction(
  simuladorId: string,
  nuevoEstado: EstadoSimuladorConmutable
): Promise<ResultadoAccion> {
  const id = normalizarTextoNullable(simuladorId);
  if (!id) {
    return { ok: false, error: 'Identificador de simulador inválido.' };
  }

  if (nuevoEstado !== 'libre' && nuevoEstado !== 'en_operacion') {
    return {
      ok: false,
      error: 'Estado destino no permitido para la conmutación del rack.',
    };
  }

  const supabase = await createClient();
  const ahoraIso = new Date().toISOString();

  // Payload explícito: al liberar el equipo se limpia `actividad_actual_id`
  // (nunca se deja colgando una referencia a una actividad ya cerrada).
  const payloadUpdate =
    nuevoEstado === 'libre'
      ? {
          estado: nuevoEstado,
          actividad_actual_id: null,
          actualizado_el: ahoraIso,
        }
      : {
          estado: nuevoEstado,
          actualizado_el: ahoraIso,
        };

  const { error } = await supabase
    .from('simuladores')
    .update(payloadUpdate)
    .eq('id', id);

  if (error) {
    registrarErrorBd('[conmutarEstadoSimuladorAction] Error al actualizar:', error);
    return {
      ok: false,
      error: 'No se pudo actualizar el estado del simulador.',
    };
  }

  revalidatePath(RUTA_REGISTRO_ACTIVIDADES);
  return { ok: true };
}

/** Participante saneado y listo para el insert (campos opcionales -> null). */
interface ParticipanteNormalizado {
  apellido_nombre: string;
  dni: string | null;
  genero: GeneroParticipante;
  puesto: string | null;
}

/** Sanea la nómina ANTES del primer INSERT: nunca se crea actividad huérfana. */
function normalizarParticipantes(
  participantes: ParticipanteInput[]
): { ok: true; valor: ParticipanteNormalizado[] } | { ok: false; error: string } {
  const filasValidas = participantes.filter(
    (p) => (p.apellido_nombre ?? '').trim().length > 0
  );

  if (filasValidas.length === 0) {
    return {
      ok: false,
      error: 'Debe cargar al menos un participante con nombre y apellido.',
    };
  }

  const normalizados: ParticipanteNormalizado[] = filasValidas.map((p) => ({
    apellido_nombre: p.apellido_nombre.trim(),
    dni: normalizarTextoNullable(p.dni),
    genero: GENEROS_PERMITIDOS.includes(p.genero) ? p.genero : 'no_especifica',
    puesto: normalizarTextoNullable(p.puesto),
  }));

  return { ok: true, valor: normalizados };
}

/**
 * Registra una actividad presencial con su nómina y los simuladores involucrados.
 *
 * Orden de persistencia (evita huérfanos):
 * 1) validación completa del DTO y la nómina;
 * 2) INSERT en `actividades` con lista blanca;
 * 3) INSERT por lotes en `actividad_participantes` y `actividad_simuladores`;
 * 4) si `estado === 'en_curso'`, los simuladores quedan `en_operacion`
 *    apuntando a `actividad_actual_id = <id de la actividad recién creada>`.
 *
 * Blindaje: la lista blanca prohíbe el spread del DTO — el cliente nunca puede
 * fijar `id`, `created_at`, `actualizado_el` ni `actividad_actual_id` en la
 * cabecera de la actividad.
 */
export async function crearActividadAction(
  payload: ActividadInput
): Promise<ResultadoAccion> {
  const entidad = normalizarTextoNullable(payload.entidad_nombre);
  if (!entidad) {
    return { ok: false, error: 'Debe indicar el nombre de la entidad o empresa.' };
  }

  if (!payload.participantes || payload.participantes.length === 0) {
    return {
      ok: false,
      error: 'Debe cargar al menos un participante en la nómina.',
    };
  }

  if (!TIPOS_ACTIVIDAD_PERMITIDOS.includes(payload.tipo)) {
    return { ok: false, error: 'Tipo de actividad no permitido.' };
  }

  if (!ESTADOS_ACTIVIDAD_PERMITIDOS.includes(payload.estado)) {
    return { ok: false, error: 'Estado de actividad no permitido.' };
  }

  const fecha = normalizarTextoNullable(payload.fecha_actividad);
  if (!fecha || !esFechaIsoValida(fecha)) {
    return { ok: false, error: 'La fecha de la actividad es inválida.' };
  }

  if (
    !Number.isInteger(payload.duracion_minutos) ||
    payload.duracion_minutos <= 0
  ) {
    return {
      ok: false,
      error: 'La duración debe ser un número entero de minutos mayor a 0.',
    };
  }

  const horaInicio = normalizarTextoNullable(payload.hora_inicio);
  if (horaInicio && !FORMATO_HORA.test(horaInicio)) {
    return { ok: false, error: 'La hora de inicio tiene un formato inválido.' };
  }
  const horaFin = normalizarTextoNullable(payload.hora_fin);
  if (horaFin && !FORMATO_HORA.test(horaFin)) {
    return { ok: false, error: 'La hora de fin tiene un formato inválido.' };
  }

  const validacionParticipantes = normalizarParticipantes(payload.participantes);
  if (!validacionParticipantes.ok) {
    return { ok: false, error: validacionParticipantes.error };
  }
  const participantesSanos = validacionParticipantes.valor;

  const idsSimuladores = Array.from(
    new Set(
      (payload.simuladores_ids ?? [])
        .map((id) => normalizarTextoNullable(id))
        .filter((id): id is string => id !== null)
    )
  );

  const supabase = await createClient();

  const { data: filaActividad, error: errorActividad } = await supabase
    .from('actividades')
    .insert({
      // LISTA BLANCA de columnas persistibles desde el cliente:
      tipo: payload.tipo,
      entidad_nombre: entidad,
      contacto_nombre: normalizarTextoNullable(payload.contacto_nombre),
      contacto_telefono: normalizarTextoNullable(payload.contacto_telefono),
      fecha_actividad: fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      duracion_minutos: payload.duracion_minutos,
      estado: payload.estado,
      observaciones: normalizarTextoNullable(payload.observaciones),
    })
    .select('id')
    .single<{ id: string }>();

  if (errorActividad || !filaActividad?.id) {
    registrarErrorBd('[crearActividadAction] Error al insertar actividad:', errorActividad);
    return {
      ok: false,
      error: 'No se pudo registrar la actividad. Intente nuevamente.',
    };
  }

  const actividadId = filaActividad.id;

  const { error: errorParticipantes } = await supabase
    .from('actividad_participantes')
    .insert(
      participantesSanos.map((p) => ({
        actividad_id: actividadId,
        apellido_nombre: p.apellido_nombre,
        dni: p.dni,
        genero: p.genero,
        puesto: p.puesto,
      }))
    );

  if (errorParticipantes) {
    registrarErrorBd(
      '[crearActividadAction] Error al insertar participantes:',
      errorParticipantes
    );
    return {
      ok: false,
      error: 'Se registró la actividad pero falló la nómina de participantes.',
    };
  }

  if (idsSimuladores.length > 0) {
    const { error: errorSimuladores } = await supabase
      .from('actividad_simuladores')
      .insert(
        idsSimuladores.map((simuladorId) => ({
          actividad_id: actividadId,
          simulador_id: simuladorId,
          minutos_uso: payload.duracion_minutos,
        }))
      );

    if (errorSimuladores) {
      registrarErrorBd(
        '[crearActividadAction] Error al vincular simuladores:',
        errorSimuladores
      );
      return {
        ok: false,
        error: 'Se registró la actividad pero falló la vinculación de simuladores.',
      };
    }

    if (payload.estado === 'en_curso') {
      const { error: errorRack } = await supabase
        .from('simuladores')
        .update({
          estado: 'en_operacion',
          actividad_actual_id: actividadId,
          actualizado_el: new Date().toISOString(),
        })
        // FIX 6: no pisar un simulador ya asignado a una sesión en vivo.
        .is('actividad_actual_id', null)
        .in('id', idsSimuladores);

      if (errorRack) {
        registrarErrorBd(
          '[crearActividadAction] Error al marcar simuladores en operación:',
          errorRack
        );
        // No aborta la creación: la actividad ya quedó persistida con su nómina.
      }
    }
  }

  revalidatePath(RUTA_REGISTRO_ACTIVIDADES);
  return { ok: true, id: actividadId };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  SESIÓN EN VIVO — iniciar / sincronizar nómina / finalizar
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Inicia una sesión en vivo: crea la actividad en estado `en_curso`,
 * vincula simuladores (previa guarda de concurrencia) y carga la nómina
 * inicial si el operador la provee.
 *
 * Orden de operaciones:
 * 1) Validación del DTO y deduplicación de IDs de simuladores.
 * 2) Guarda de concurrencia: verifica que TODOS los simuladores estén libres.
 * 3) INSERT en `actividades` con lista blanca (hora_inicio = now, duracion = 0).
 * 4) INSERT opcional en `actividad_participantes` (si la nómina inicial no está vacía).
 * 5) INSERT en `actividad_simuladores` con minutos_uso = 0.
 * 6) UPDATE en `simuladores`: estado → en_operacion, actividad_actual_id → nueva
 *    actividad, con guarda TOCTOU (`.is('actividad_actual_id', null)` + `.select('id')`)
 *    que verifica que se reclamaron TODOS los equipos solicitados.
 * 7) revalidatePath.
 *
 * Rollback: si los pasos 5 o 6 fallan, o si algún simulador fue reclamado por
 * otra sesión entre la guarda de concurrencia y el UPDATE (TOCTOU), se liberan
 * los equipos ya asignados y se elimina la actividad con sus vínculos y nómina.
 */
export async function iniciarSesionEnVivoAction(
  payload: IniciarSesionInput
): Promise<ResultadoAccion> {
  /* ---- 1) Validación ---- */
  const entidad = normalizarTextoNullable(payload.entidad_nombre);
  if (!entidad) {
    return { ok: false, error: 'Debe indicar el nombre de la entidad o empresa.' };
  }

  if (!TIPOS_ACTIVIDAD_PERMITIDOS.includes(payload.tipo)) {
    return { ok: false, error: 'Tipo de actividad no permitido.' };
  }

  const idsSimuladores = Array.from(
    new Set(
      (payload.simuladores_ids ?? [])
        .map((id) => normalizarTextoNullable(id))
        .filter((id): id is string => id !== null)
    )
  );

  if (idsSimuladores.length < 1) {
    return {
      ok: false,
      error: 'Debe seleccionar al menos un simulador para iniciar la sesión.',
    };
  }

  const supabase = await createClient();
  const ahora = new Date();

  /* ---- 2) Guarda de concurrencia ---- */
  const { data: filasRaw, error: errorGuard } = await supabase
    .from('simuladores')
    .select('estado, actividad_actual_id')
    .in('id', idsSimuladores);

  if (errorGuard) {
    registrarErrorBd(
      '[iniciarSesionEnVivoAction] Error en guarda de concurrencia:',
      errorGuard
    );
    return {
      ok: false,
      error: 'No se pudo verificar la disponibilidad de los simuladores.',
    };
  }

  const filas: Array<{ estado: string; actividad_actual_id: string | null }> =
    filasRaw ?? [];

  const todosLibres =
    filas.length === idsSimuladores.length &&
    filas.every((f) => f.estado === 'libre' && f.actividad_actual_id === null);

  if (!todosLibres) {
    return {
      ok: false,
      error:
        'Uno o más simuladores no están disponibles (ocupados o en mantenimiento).',
    };
  }

  /* ---- 3) INSERT actividad (lista blanca) ---- */
  const { data: filaActividad, error: errorActividad } = await supabase
    .from('actividades')
    .insert({
      tipo: payload.tipo,
      entidad_nombre: entidad,
      contacto_nombre: normalizarTextoNullable(payload.contacto_nombre),
      contacto_telefono: normalizarTextoNullable(payload.contacto_telefono),
      fecha_actividad: ahora.toISOString().slice(0, 10),
      // FIX 3: hora derivada de UTC para ser consistente con fecha_actividad.
      hora_inicio: ahora.toISOString().slice(11, 19),
      hora_fin: null,
      duracion_minutos: 0,
      estado: 'en_curso',
      observaciones: normalizarTextoNullable(payload.observaciones),
    })
    .select('id')
    .single<{ id: string }>();

  if (errorActividad || !filaActividad?.id) {
    registrarErrorBd(
      '[iniciarSesionEnVivoAction] Error al crear actividad:',
      errorActividad
    );
    return { ok: false, error: 'No se pudo iniciar la sesión en vivo.' };
  }

  const actividadId = filaActividad.id;

  /* ---- 4) INSERT participantes iniciales (opcional) ---- */
  if (payload.participantes && payload.participantes.length > 0) {
    const filasValidas = payload.participantes.filter(
      (p) => (p.apellido_nombre ?? '').trim().length > 0
    );

    if (filasValidas.length > 0) {
      const normalizados = filasValidas.map((p) => ({
        actividad_id: actividadId,
        apellido_nombre: p.apellido_nombre.trim(),
        dni: normalizarTextoNullable(p.dni),
        genero: GENEROS_PERMITIDOS.includes(p.genero)
          ? p.genero
          : ('no_especifica' as GeneroParticipante),
        puesto: normalizarTextoNullable(p.puesto),
      }));

      const { error: errorParticipantes } = await supabase
        .from('actividad_participantes')
        .insert(normalizados);

      if (errorParticipantes) {
        registrarErrorBd(
          '[iniciarSesionEnVivoAction] Error al insertar participantes iniciales:',
          errorParticipantes
        );
        // No aborta: la sesión ya está creada, la nómina se puede sincronizar después.
      }
    }
  }

  /* ---- 5) INSERT actividad_simuladores (minutos_uso = 0) ---- */
  const { error: errorVinculo } = await supabase
    .from('actividad_simuladores')
    .insert(
      idsSimuladores.map((simuladorId) => ({
        actividad_id: actividadId,
        simulador_id: simuladorId,
        minutos_uso: 0,
      }))
    );

  if (errorVinculo) {
    registrarErrorBd(
      '[iniciarSesionEnVivoAction] Error al vincular simuladores:',
      errorVinculo
    );
    // Rollback best-effort
    await supabase
      .from('actividad_participantes')
      .delete()
      .eq('actividad_id', actividadId);
    await supabase.from('actividades').delete().eq('id', actividadId);
    return {
      ok: false,
      error: 'No se pudo vincular los simuladores a la sesión.',
    };
  }

  /* ---- 6) UPDATE simuladores → en_operacion (guarda TOCTOU) ---- */
  // FIX 1: se pide `.select('id')` para saber cuántos equipos se reclamaron
  // realmente. La guarda previa (paso 2) y este UPDATE no son atómicos: si otra
  // sesión reclamó un simulador en el medio, `filasActualizadas` será menor que
  // `idsSimuladores` y hay que revertir TODO para no dejar referencias parciales.
  const { data: filasActualizadas, error: errorRack } = await supabase
    .from('simuladores')
    .update({
      estado: 'en_operacion',
      actividad_actual_id: actividadId,
      actualizado_el: ahora.toISOString(),
    })
    .in('id', idsSimuladores)
    .is('actividad_actual_id', null)
    .select('id');

  const totalReclamadas = filasActualizadas?.length ?? 0;
  const reclamadasParcial =
    Boolean(errorRack) || totalReclamadas !== idsSimuladores.length;

  if (reclamadasParcial) {
    if (errorRack) {
      registrarErrorBd(
        '[iniciarSesionEnVivoAction] Error al marcar simuladores en operación:',
        errorRack
      );
    }
    // Rollback completo: liberar SOLO los simuladores que esta acción llegó a
    // reclamar y eliminar la actividad con sus vínculos y nómina.
    await supabase
      .from('simuladores')
      .update({
        estado: 'libre',
        actividad_actual_id: null,
        actualizado_el: new Date().toISOString(),
      })
      .eq('actividad_actual_id', actividadId);
    await supabase
      .from('actividad_simuladores')
      .delete()
      .eq('actividad_id', actividadId);
    await supabase
      .from('actividad_participantes')
      .delete()
      .eq('actividad_id', actividadId);
    await supabase.from('actividades').delete().eq('id', actividadId);
    return {
      ok: false,
      error:
        'Uno o más simuladores fueron reclamados por otra sesión. Intente nuevamente.',
    };
  }

  /* ---- 7) Revalidar ---- */
  revalidatePath(RUTA_REGISTRO_ACTIVIDADES);
  return { ok: true, id: actividadId };
}

/**
 * Sincroniza la nómina de participantes de una sesión en curso.
 * Reemplaza TODA la nómina existente (DELETE + INSERT batch).
 * Se permite lista vacía (significa «limpiar la nómina»).
 *
 * Orden de operaciones:
 * 1) Validar actividadId no vacío.
 * 2) Verificar que la actividad existe y está en_curso.
 * 3) Filtrar participantes válidos (apellido_nombre no vacío).
 * 4) Respaldo (SELECT) de la nómina anterior y DELETE de la misma.
 * 5) INSERT batch de la nómina nueva (si no está vacía); si falla se restaura
 *    el respaldo para no dejar la actividad sin nómina.
 * 6) revalidatePath.
 */
export async function sincronizarParticipantesAction(
  actividadId: string,
  participantes: ParticipanteInput[]
): Promise<ResultadoAccion> {
  const id = normalizarTextoNullable(actividadId);
  if (!id) {
    return { ok: false, error: 'Identificador de actividad inválido.' };
  }

  const supabase = await createClient();

  /* ---- 2) Verificar actividad en curso ---- */
  const { data: actividad, error: errorBusqueda } = await supabase
    .from('actividades')
    .select('id')
    .eq('id', id)
    .eq('estado', 'en_curso')
    .maybeSingle<{ id: string }>();

  if (errorBusqueda) {
    registrarErrorBd(
      '[sincronizarParticipantesAction] Error al buscar actividad:',
      errorBusqueda
    );
    return {
      ok: false,
      error: 'No se pudo verificar el estado de la actividad.',
    };
  }

  if (!actividad) {
    return {
      ok: false,
      error:
        'Solo se puede sincronizar la nómina de una actividad en curso.',
    };
  }

  /* ---- 3) Filtrar participantes válidos ---- */
  const filasValidas = (participantes ?? []).filter(
    (p) => (p.apellido_nombre ?? '').trim().length > 0
  );

  /* ---- 4) Respaldo + DELETE nómina anterior ---- */
  // FIX 4: se respalda la nómina actual antes de borrarla para poder
  // restaurarla si el INSERT de la nueva falla (evita dejar la sesión sin nómina).
  const { data: nominaAnterior } = await supabase
    .from('actividad_participantes')
    .select('*')
    .eq('actividad_id', id);

  const { error: errorDelete } = await supabase
    .from('actividad_participantes')
    .delete()
    .eq('actividad_id', id);

  if (errorDelete) {
    registrarErrorBd(
      '[sincronizarParticipantesAction] Error al eliminar nómina anterior:',
      errorDelete
    );
    return { ok: false, error: 'No se pudo limpiar la nómina anterior.' };
  }

  /* ---- 5) INSERT batch si hay participantes válidos ---- */
  if (filasValidas.length > 0) {
    const normalizados = filasValidas.map((p) => ({
      actividad_id: id,
      apellido_nombre: p.apellido_nombre.trim(),
      dni: normalizarTextoNullable(p.dni),
      genero: GENEROS_PERMITIDOS.includes(p.genero)
        ? p.genero
        : ('no_especifica' as GeneroParticipante),
      puesto: normalizarTextoNullable(p.puesto),
    }));

    const { error: errorInsert } = await supabase
      .from('actividad_participantes')
      .insert(normalizados);

    if (errorInsert) {
      registrarErrorBd(
        '[sincronizarParticipantesAction] Error al insertar nueva nómina:',
        errorInsert
      );
      // FIX 4: Rollback — restaurar la nómina anterior respaldada.
      if (nominaAnterior && nominaAnterior.length > 0) {
        await supabase.from('actividad_participantes').insert(
          nominaAnterior.map(({ id: _id, ...resto }) => resto)
        );
      }
      return {
        ok: false,
        error:
          'No se pudo guardar la nómina actualizada. Se restauró la anterior.',
      };
    }
  }

  /* ---- 6) Revalidar ---- */
  revalidatePath(RUTA_REGISTRO_ACTIVIDADES);
  return { ok: true };
}

/**
 * Finaliza una sesión en vivo: calcula la duración real, sincroniza la nómina
 * final, cierra la actividad, actualiza minutos de uso en simuladores y libera
 * los equipos del rack.
 *
 * Orden de operaciones:
 * 1) Validar actividad_id no vacío.
 * 2) Verificar que la actividad existe y está en_curso.
 * 3) Calcular duración en minutos desde hora_inicio (o created_at como fallback).
 * 4) Sincronizar nómina final (DELETE + INSERT) ANTES de cerrar: si falla, la
 *    actividad sigue en_curso y el operador puede reintentar.
 * 5) UPDATE actividad: hora_fin, duracion_minutos, estado = finalizada, observaciones.
 * 6) Obtener IDs de simuladores vinculados.
 * 7) UPDATE actividad_simuladores con minutos_uso calculados.
 * 8) UPDATE simuladores → estado libre, actividad_actual_id = null.
 * 9) revalidatePath.
 */
export async function finalizarSesionEnVivoAction(
  payload: FinalizarSesionInput
): Promise<ResultadoAccion> {
  /* ---- 1) Validar ---- */
  const actividadId = normalizarTextoNullable(payload.actividad_id);
  if (!actividadId) {
    return { ok: false, error: 'Identificador de actividad inválido.' };
  }

  const supabase = await createClient();

  /* ---- 2) Verificar actividad en curso ---- */
  const { data: actividad, error: errorBusqueda } = await supabase
    .from('actividades')
    .select('id, hora_inicio, fecha_actividad, created_at')
    .eq('id', actividadId)
    .eq('estado', 'en_curso')
    .maybeSingle<{
      id: string;
      hora_inicio: string | null;
      fecha_actividad: string;
      created_at: string | null;
    }>();

  if (errorBusqueda) {
    registrarErrorBd(
      '[finalizarSesionEnVivoAction] Error al buscar actividad:',
      errorBusqueda
    );
    return {
      ok: false,
      error: 'No se pudo verificar el estado de la sesión.',
    };
  }

  if (!actividad) {
    return {
      ok: false,
      error: 'La sesión no está en curso o ya fue finalizada.',
    };
  }

  /* ---- 3) Calcular duración ---- */
  const ahora = new Date();

  // FIX 2: guarda defensiva contra NaN — `created_at` puede venir null y el
  // fallback anterior con `!` producía NaN silencioso en la duración.
  const inicioMs = actividad.hora_inicio
    ? new Date(
        `${actividad.fecha_actividad}T${actividad.hora_inicio}`
      ).getTime()
    : actividad.created_at
      ? new Date(actividad.created_at).getTime()
      : NaN;

  if (Number.isNaN(inicioMs)) {
    return {
      ok: false,
      error: 'No se pudo determinar la hora de inicio de la sesión.',
    };
  }

  const minutos = Math.max(
    1,
    Math.round((ahora.getTime() - inicioMs) / 60000)
  );
  // FIX 3: hora derivada de UTC para ser consistente con el resto del módulo.
  const horaFinStr = ahora.toISOString().slice(11, 19);

  /* ---- 4) Sincronizar nómina final (ANTES de cerrar la actividad) ---- */
  // FIX 5: se sincroniza la nómina antes de marcar `finalizada`. Si el DELETE o
  // el INSERT fallan, la actividad permanece `en_curso` y el operador puede
  // reintentar sin perder la sesión.
  const validacionParticipantes = normalizarParticipantes(
    payload.participantes
  );

  if (!validacionParticipantes.ok) {
    console.warn(
      '[finalizarSesionEnVivoAction] Nómina final inválida — se finaliza sin actualizar participantes:',
      validacionParticipantes.error
    );
  } else {
    const { error: errorDelete } = await supabase
      .from('actividad_participantes')
      .delete()
      .eq('actividad_id', actividadId);

    if (errorDelete) {
      registrarErrorBd(
        '[finalizarSesionEnVivoAction] Error al limpiar nómina:',
        errorDelete
      );
      return {
        ok: false,
        error:
          'No se pudo sincronizar la nómina final. La sesión sigue en curso.',
      };
    }

    const { error: errorInsert } = await supabase
      .from('actividad_participantes')
      .insert(
        validacionParticipantes.valor.map((p) => ({
          actividad_id: actividadId,
          apellido_nombre: p.apellido_nombre,
          dni: p.dni,
          genero: p.genero,
          puesto: p.puesto,
        }))
      );

    if (errorInsert) {
      registrarErrorBd(
        '[finalizarSesionEnVivoAction] Error al insertar nómina final:',
        errorInsert
      );
      return {
        ok: false,
        error: 'No se pudo guardar la nómina final. La sesión sigue en curso.',
      };
    }
  }

  /* ---- 5) UPDATE actividad → finalizada ---- */
  const { error: errorUpdate } = await supabase
    .from('actividades')
    .update({
      hora_fin: horaFinStr,
      duracion_minutos: minutos,
      estado: 'finalizada',
      observaciones: normalizarTextoNullable(payload.observaciones),
    })
    .eq('id', actividadId);

  if (errorUpdate) {
    registrarErrorBd(
      '[finalizarSesionEnVivoAction] Error al finalizar actividad:',
      errorUpdate
    );
    return { ok: false, error: 'No se pudo finalizar la sesión.' };
  }

  /* ---- 6) Obtener simuladores vinculados ---- */
  const { data: vinculosRaw, error: errorVinculos } = await supabase
    .from('actividad_simuladores')
    .select('simulador_id')
    .eq('actividad_id', actividadId);

  if (errorVinculos) {
    registrarErrorBd(
      '[finalizarSesionEnVivoAction] Error al obtener vínculos:',
      errorVinculos
    );
  }

  const vinculos: Array<{ simulador_id: string }> = vinculosRaw ?? [];
  const simuladorIds = vinculos.map((v) => v.simulador_id);

  /* ---- 7) UPDATE minutos de uso ---- */
  const { error: errorMinutos } = await supabase
    .from('actividad_simuladores')
    .update({ minutos_uso: minutos })
    .eq('actividad_id', actividadId);

  if (errorMinutos) {
    registrarErrorBd(
      '[finalizarSesionEnVivoAction] Error al actualizar minutos de uso:',
      errorMinutos
    );
  }

  /* ---- 8) Liberar simuladores del rack ---- */
  if (simuladorIds.length > 0) {
    const { error: errorLiberar } = await supabase
      .from('simuladores')
      .update({
        estado: 'libre',
        actividad_actual_id: null,
        actualizado_el: ahora.toISOString(),
      })
      .in('id', simuladorIds);

    if (errorLiberar) {
      registrarErrorBd(
        '[finalizarSesionEnVivoAction] Error al liberar simuladores:',
        errorLiberar
      );
    }
  }

  /* ---- 9) Revalidar ---- */
  revalidatePath(RUTA_REGISTRO_ACTIVIDADES);
  return { ok: true, id: actividadId };
}
