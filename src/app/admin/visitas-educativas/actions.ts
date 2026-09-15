'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  FechaDisponibleItem,
  EditarVisitaInput,
  ResultadoEdicionVisita,
} from '@/types/visitas';

/** Ruta que se revalida tras cada mutación del módulo de edición de visitas. */
const RUTA_VISITAS_ADMIN = '/admin/visitas-educativas';

/**
 * Cupo máximo permitido en la EDICIÓN (45). Se declara local a propósito: la
 * edición admite un margen distinto al del formulario público (40), por lo que
 * no se reutiliza `CUPO_MAXIMO_ALUMNOS` de visitasService.
 */
const CUPO_MAXIMO_EDICION = 45;

/** Mensaje accionable cuando la fecha destino ya está ocupada (UNIQUE fecha_visita). */
const ERROR_FECHA_OCUPADA =
  'La fecha seleccionada ya se encuentra ocupada por otra institución.';

/** Mensaje genérico de fallo del UPDATE (no expone detalles internos). */
const ERROR_GENERICO = 'No se pudo actualizar la reserva. Intente nuevamente.';

/** Estados de visita aceptados en la edición. */
const ESTADOS_VALIDOS: readonly string[] = [
  'Confirmada',
  'Reprogramada',
  'Cancelada',
  'Completada',
  'Pendiente',
];

/** Expresión regular de la FORMA ISO (YYYY-MM-DD), el formato que exige Postgres. */
const FORMATO_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Formato HH:MM u HH:MM:SS aceptado por columnas `time`. */
const FORMATO_HORA = /^\d{2}:\d{2}(:\d{2})?$/;

/* ═══════════════════════════════════════════════════════════════════════
 *  HELPERS LOCALES (re-declarados a propósito: archivo auto-contenido)
 * ═══════════════════════════════════════════════════════════════════════ */

/** Convierte un valor vacío/blanco o no-string en null (columnas nullable). */
function normalizarTextoNullable(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

/**
 * Valida la FORMA (regex ISO) y la VALIDEZ CALENDÁRICA real de una fecha.
 * El regex por sí solo acepta fechas imposibles como "2026-02-31"; por eso se
 * hace round-trip con Date y se verifica que año/mes/día coincidan.
 */
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

/** Valida el formato HH:MM u HH:MM:SS de una hora. */
function esHoraValida(valor: string): boolean {
  return FORMATO_HORA.test(valor);
}

/**
 * Log PII-safe: registra solo un subconjunto estable del error de PostgREST
 * (código y mensaje), sin volcar la fila completa que podría contener datos de
 * menores (DNI, fecha de nacimiento) en los logs del hosting.
 */
function registrarErrorBd(contexto: string, error: unknown): void {
  const err = error as { code?: string; message?: string } | null | undefined;
  console.error(contexto, {
    code: err?.code,
    message: err?.message,
  });
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ACTION 1 — Fechas disponibles para el selector de edición
 * ═══════════════════════════════════════════════════════════════════════ */

/** Fila cruda de `fechas_habilitadas` devuelta por el SELECT. */
interface FilaFechaHabilitada {
  id: string;
  fecha: string;
  habilitada: boolean;
  observaciones: string | null;
}

/** Fila cruda de `visitas_educativas` usada para detectar fechas ocupadas. */
interface FilaVisitaOcupada {
  id: string;
  fecha_visita: string;
  codigo_reserva: string;
}

/**
 * Lista las fechas habilitadas (hoy en adelante) marcando cuáles están ocupadas
 * por una reserva activa. La fecha que ya pertenece a la visita en edición
 * (`idVisitaActual`) NO se considera ocupada, para permitir conservarla.
 */
export async function obtenerFechasDisponiblesAction(
  idVisitaActual?: string
): Promise<
  | { ok: true; fechas: FechaDisponibleItem[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const [resultadoHabilitadas, resultadoOcupadas] = await Promise.all([
    supabase
      .from('fechas_habilitadas')
      .select('id, fecha, habilitada, observaciones')
      .eq('habilitada', true)
      .gte('fecha', hoy)
      .order('fecha', { ascending: true }),
    supabase
      .from('visitas_educativas')
      .select('fecha_visita, codigo_reserva, id')
      .neq('estado_visita', 'Cancelada'),
  ]);

  if (resultadoHabilitadas.error || resultadoOcupadas.error) {
    registrarErrorBd(
      '[obtenerFechasDisponiblesAction] Error al obtener fechas:',
      resultadoHabilitadas.error ?? resultadoOcupadas.error
    );
    return {
      ok: false,
      error: 'No se pudieron obtener las fechas disponibles.',
    };
  }

  const filasHabilitadas: FilaFechaHabilitada[] =
    (resultadoHabilitadas.data as FilaFechaHabilitada[] | null) ?? [];
  const filasOcupadas: FilaVisitaOcupada[] =
    (resultadoOcupadas.data as FilaVisitaOcupada[] | null) ?? [];

  const mapOcupadas = new Map<string, { codigo: string; id: string }>();
  for (const fila of filasOcupadas) {
    if (typeof fila?.fecha_visita === 'string') {
      mapOcupadas.set(fila.fecha_visita, {
        codigo: fila.codigo_reserva,
        id: fila.id,
      });
    }
  }

  const fechas: FechaDisponibleItem[] = filasHabilitadas.map((fila) => {
    const ocupante = mapOcupadas.get(fila.fecha);
    const ocupada = Boolean(ocupante) && ocupante!.id !== idVisitaActual;
    return {
      id: fila.id,
      fecha: fila.fecha,
      habilitada: fila.habilitada,
      observaciones: fila.observaciones,
      ocupada,
      ocupada_por_codigo: ocupada ? ocupante!.codigo : null,
    };
  });

  return { ok: true, fechas };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ACTION 2 — Actualización de una visita educativa (edición admin)
 * ═══════════════════════════════════════════════════════════════════════ */

/** Fila mínima leída para la guarda de concurrencia y el estado actual. */
interface VisitaActualLectura {
  fecha_visita: string;
  estado_visita: string;
}

/**
 * Actualiza una reserva existente desde el panel de administración.
 *
 * Blindaje: el UPDATE se construye con LISTA BLANCA explícita de columnas
 * (prohibido spread del payload). Nunca se tocan check_*, codigo_reserva, id,
 * created_at, id_escuela ni las conformidades legales: son campos que el cliente
 * de edición no puede fijar.
 *
 * Concurrencia: la tabla tiene UNIQUE sobre fecha_visita, por lo que se hace una
 * guarda previa (colisión con otra reserva activa) más defensa en profundidad
 * ante el error 23505 del UPDATE.
 */
export async function actualizarVisitaEducativaAction(
  payload: EditarVisitaInput
): Promise<ResultadoEdicionVisita> {
  /* ---- 1) Validaciones pre-UPDATE ---- */
  const idVisita = normalizarTextoNullable(payload.id);
  if (!idVisita) {
    return { ok: false, error: 'Identificador de reserva inválido.' };
  }

  const fechaVisita = normalizarTextoNullable(payload.fecha_visita);
  if (!fechaVisita || !esFechaIsoValida(fechaVisita)) {
    return { ok: false, error: 'La fecha de visita seleccionada no es válida.' };
  }

  if (
    !Number.isInteger(payload.cant_alumnos) ||
    payload.cant_alumnos <= 0 ||
    payload.cant_alumnos > CUPO_MAXIMO_EDICION
  ) {
    return {
      ok: false,
      error: `Debe ingresar un cantidad válida de alumnos (entre 1 y ${CUPO_MAXIMO_EDICION}).`,
    };
  }

  if (!ESTADOS_VALIDOS.includes(payload.estado_visita)) {
    return { ok: false, error: 'Estado de visita no permitido.' };
  }

  if (payload.requiere_tup === true) {
    const horarios: Array<string | null> = [
      normalizarTextoNullable(payload.tup_horario_ida_desde),
      normalizarTextoNullable(payload.tup_horario_ida_hasta),
      normalizarTextoNullable(payload.tup_horario_vuelta_desde),
      normalizarTextoNullable(payload.tup_horario_vuelta_hasta),
    ];
    const horarioInvalido = horarios.some(
      (h) => h !== null && !esHoraValida(h)
    );
    if (horarioInvalido) {
      return {
        ok: false,
        error: 'Uno o más horarios del transporte (TUP) tienen un formato inválido.',
      };
    }
  }

  const supabase = await createClient();

  /* ---- 2) Obtener visita actual ---- */
  const { data: visitaActualData, error: errorLectura } = await supabase
    .from('visitas_educativas')
    .select('fecha_visita, estado_visita')
    .eq('id', idVisita)
    .single();

  if (errorLectura || !visitaActualData) {
    registrarErrorBd(
      '[actualizarVisitaEducativaAction] Error al leer la visita:',
      errorLectura
    );
    return { ok: false, error: ERROR_GENERICO };
  }

  const visitaActual = visitaActualData as VisitaActualLectura;

  /* ---- 3) Guarda de concurrencia (solo si cambió la fecha) ---- */
  const cambioFecha = fechaVisita !== visitaActual.fecha_visita;
  if (cambioFecha) {
    const { data: colision } = await supabase
      .from('visitas_educativas')
      .select('id')
      .eq('fecha_visita', fechaVisita)
      .neq('id', idVisita)
      .neq('estado_visita', 'Cancelada')
      .maybeSingle();

    if (colision) {
      return { ok: false, error: ERROR_FECHA_OCUPADA };
    }
  }

  /* ---- 4) Determinar estado final ---- */
  let estadoFinal = payload.estado_visita;
  if (
    cambioFecha &&
    visitaActual.estado_visita === 'Confirmada' &&
    payload.estado_visita === 'Confirmada'
  ) {
    estadoFinal = 'Reprogramada';
  }

  /* ---- 5) UPDATE con lista blanca explícita (nunca spread del payload) ---- */
  const { error: errorUpdate } = await supabase
    .from('visitas_educativas')
    .update({
      fecha_visita: fechaVisita,
      turno: normalizarTextoNullable(payload.turno),
      division: normalizarTextoNullable(payload.division),
      cant_alumnos: payload.cant_alumnos,
      nombre_director: normalizarTextoNullable(payload.nombre_director),
      cel_director: normalizarTextoNullable(payload.cel_director),
      nombre_docente: normalizarTextoNullable(payload.nombre_docente),
      cel_docente: normalizarTextoNullable(payload.cel_docente),
      email_contacto: normalizarTextoNullable(payload.email_contacto),
      requiere_tup: payload.requiere_tup,
      tup_horario_ida_desde: normalizarTextoNullable(payload.tup_horario_ida_desde),
      tup_horario_ida_hasta: normalizarTextoNullable(payload.tup_horario_ida_hasta),
      tup_horario_vuelta_desde: normalizarTextoNullable(payload.tup_horario_vuelta_desde),
      tup_horario_vuelta_hasta: normalizarTextoNullable(payload.tup_horario_vuelta_hasta),
      tup_chofer_nombre: normalizarTextoNullable(payload.tup_chofer_nombre),
      estado_visita: estadoFinal,
      observaciones_docente: normalizarTextoNullable(payload.observaciones_docente),
    })
    .eq('id', idVisita);

  /* ---- 6) Manejo de errores del UPDATE ---- */
  if (errorUpdate) {
    // Defensa en profundidad ante el UNIQUE sobre fecha_visita (23505).
    if (errorUpdate.code === '23505') {
      return { ok: false, error: ERROR_FECHA_OCUPADA };
    }
    registrarErrorBd(
      '[actualizarVisitaEducativaAction] Error al actualizar la visita:',
      errorUpdate
    );
    return { ok: false, error: ERROR_GENERICO };
  }

  /* ---- 7) Éxito ---- */
  revalidatePath(RUTA_VISITAS_ADMIN);
  return { ok: true };
}
