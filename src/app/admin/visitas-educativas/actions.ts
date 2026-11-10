'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  CAMPOS_CHECK_OPERATIVO,
  ESTADOS_VISITA,
  type AsistenteVisita,
  type CampoCheckOperativo,
  type EditarVisitaInput,
  type Escuela,
  type EstadoVisita,
  type FechaDisponibleItem,
  type ResultadoAlternarCheck,
  type ResultadoAsistentesVisita,
  type ResultadoCambiarEstadoVisita,
  type ResultadoEdicionVisita,
  type ResultadoVisitasAdmin,
  type VisitaEducativa,
} from '@/types/visitas';

/** Rutas que se revalidan tras mutaciones del panel de visitas. */
const RUTA_VISITAS_ADMIN = '/admin/visitas-educativas';
const RUTA_ADMIN_HOME = '/admin';
const RUTA_ADMIN_TUP = '/admin/tup';

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
const ERROR_NO_AUTENTICADO = 'Sesión expirada o no autenticada.';

/** Expresión regular de la FORMA ISO (YYYY-MM-DD), el formato que exige Postgres. */
const FORMATO_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Formato HH:MM u HH:MM:SS aceptado por columnas `time`. */
const FORMATO_HORA = /^\d{2}:\d{2}(:\d{2})?$/;

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ═══════════════════════════════════════════════════════════════════════
 *  HELPERS LOCALES (PII-safe, sin any)
 * ═══════════════════════════════════════════════════════════════════════ */

function obtenerFechaHoyArgentinaISO(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const anio = partes.find((p) => p.type === 'year')?.value ?? '2026';
  const mes = partes.find((p) => p.type === 'month')?.value ?? '01';
  const dia = partes.find((p) => p.type === 'day')?.value ?? '01';
  return `${anio}-${mes}-${dia}`;
}

function esUuidValido(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}

/** Convierte un valor vacío/blanco o no-string en null (columnas nullable). */
function normalizarTextoNullable(valor: unknown, maxLen = 250): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (limpio.length === 0) return null;
  return limpio.slice(0, maxLen);
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
  if (typeof error === 'object' && error !== null) {
    const registro = error as { code?: unknown; message?: unknown };
    console.error(contexto, {
      code: typeof registro.code === 'string' ? registro.code : undefined,
      message:
        typeof registro.message === 'string' ? registro.message : undefined,
    });
    return;
  }
  console.error(contexto, { message: String(error) });
}

function revalidarRutasVisitas(): void {
  revalidatePath(RUTA_VISITAS_ADMIN);
  revalidatePath(RUTA_ADMIN_HOME);
  revalidatePath(RUTA_ADMIN_TUP);
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ACTION 0 — Listado administrativo autenticado
 * ═══════════════════════════════════════════════════════════════════════ */

export async function obtenerVisitasAdminAction(): Promise<ResultadoVisitasAdmin> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_NO_AUTENTICADO };
  }

  const [resVisitas, resEscuelas] = await Promise.all([
    supabase
      .from('visitas_educativas')
      .select('*')
      .order('fecha_visita', { ascending: false })
      .returns<VisitaEducativa[]>(),
    supabase
      .from('escuelas')
      .select('id, nombre_institucion, nombre_corto, direccion')
      .order('nombre_institucion', { ascending: true })
      .returns<Escuela[]>(),
  ]);

  if (resVisitas.error || resEscuelas.error) {
    registrarErrorBd(
      '[obtenerVisitasAdminAction] Error al listar visitas:',
      resVisitas.error ?? resEscuelas.error
    );
    return { ok: false, error: 'No se pudieron cargar las reservas.' };
  }

  return {
    ok: true,
    visitas: resVisitas.data ?? [],
    escuelas: resEscuelas.data ?? [],
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ACTION 1 — Conmutación en caliente de checks operativos
 * ═══════════════════════════════════════════════════════════════════════ */

export async function alternarCheckOperativoAction(
  visitaId: string,
  campo: CampoCheckOperativo,
  valor: boolean
): Promise<ResultadoAlternarCheck> {
  const id = typeof visitaId === 'string' ? visitaId.trim() : '';
  if (!esUuidValido(id)) {
    return { ok: false, error: 'Identificador de visita inválido.' };
  }

  if (!CAMPOS_CHECK_OPERATIVO.includes(campo)) {
    return { ok: false, error: 'Campo de check operativo no permitido.' };
  }

  if (typeof valor !== 'boolean') {
    return { ok: false, error: 'Valor booleano requerido.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_NO_AUTENTICADO };
  }

  const actualizacion: Partial<Record<CampoCheckOperativo, boolean>> =
    campo === 'check_poliza'
      ? { check_poliza: valor }
      : campo === 'check_tup'
        ? { check_tup: valor }
        : campo === 'check_facturas'
          ? { check_facturas: valor }
          : { check_drive_sum: valor };

  const { data, error } = await supabase
    .from('visitas_educativas')
    .update(actualizacion)
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error || !data?.id) {
    registrarErrorBd(
      '[alternarCheckOperativoAction] Error al actualizar check:',
      error
    );
    return {
      ok: false,
      error: 'No se pudo guardar el estado operativo de la reserva.',
    };
  }

  revalidarRutasVisitas();
  return { ok: true, campo, valor };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ACTION 2 — Cambio rápido de estado de visita
 * ═══════════════════════════════════════════════════════════════════════ */

export async function cambiarEstadoVisitaAction(
  visitaId: string,
  nuevoEstado: EstadoVisita
): Promise<ResultadoCambiarEstadoVisita> {
  const id = typeof visitaId === 'string' ? visitaId.trim() : '';
  if (!esUuidValido(id)) {
    return { ok: false, error: 'Identificador de visita inválido.' };
  }

  if (!ESTADOS_VISITA.includes(nuevoEstado)) {
    return { ok: false, error: 'Estado de visita no permitido.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_NO_AUTENTICADO };
  }

  const { data: actual, error: errorLectura } = await supabase
    .from('visitas_educativas')
    .select('fecha_visita, estado_visita')
    .eq('id', id)
    .maybeSingle<VisitaActualLectura>();

  if (errorLectura || !actual) {
    registrarErrorBd(
      '[cambiarEstadoVisitaAction] Error al leer reserva actual:',
      errorLectura
    );
    return { ok: false, error: 'No se encontró la reserva solicitada.' };
  }

  if (actual.estado_visita === 'Cancelada' && nuevoEstado !== 'Cancelada') {
    const { data: colision } = await supabase
      .from('visitas_educativas')
      .select('id')
      .eq('fecha_visita', actual.fecha_visita)
      .neq('id', id)
      .neq('estado_visita', 'Cancelada')
      .maybeSingle<{ id: string }>();

    if (colision) {
      return { ok: false, error: ERROR_FECHA_OCUPADA };
    }
  }

  const { error: errorUpdate } = await supabase
    .from('visitas_educativas')
    .update({ estado_visita: nuevoEstado })
    .eq('id', id);

  if (errorUpdate) {
    if (errorUpdate.code === '23505') {
      return { ok: false, error: ERROR_FECHA_OCUPADA };
    }
    registrarErrorBd(
      '[cambiarEstadoVisitaAction] Error al cambiar estado:',
      errorUpdate
    );
    return {
      ok: false,
      error: 'No se pudo actualizar el estado de la reserva.',
    };
  }

  revalidarRutasVisitas();
  return { ok: true, estado_visita: nuevoEstado };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ACTION 3 — Nómina de asistentes de una visita (admin autenticado)
 * ═══════════════════════════════════════════════════════════════════════ */

export async function obtenerAsistentesVisitaAction(
  visitaId: string
): Promise<ResultadoAsistentesVisita> {
  const id = typeof visitaId === 'string' ? visitaId.trim() : '';
  if (!esUuidValido(id)) {
    return { ok: false, error: 'Identificador de visita inválido.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_NO_AUTENTICADO };
  }

  const { data, error } = await supabase
    .from('visita_asistentes')
    .select('id, id_visita, apellido_nombre, dni, fecha_nacimiento, rol')
    .eq('id_visita', id)
    .order('apellido_nombre', { ascending: true })
    .returns<AsistenteVisita[]>();

  if (error) {
    registrarErrorBd(
      '[obtenerAsistentesVisitaAction] Error al consultar nómina:',
      error
    );
    return {
      ok: false,
      error: 'No se pudo obtener la nómina de asistentes de la visita.',
    };
  }

  return { ok: true, asistentes: data ?? [] };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ACTION 4 — Fechas disponibles para el selector de edición
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_NO_AUTENTICADO };
  }

  if (idVisitaActual && !esUuidValido(idVisitaActual.trim())) {
    return { ok: false, error: 'Identificador de visita inválido.' };
  }

  const hoy = obtenerFechaHoyArgentinaISO();

  const [resultadoHabilitadas, resultadoOcupadas] = await Promise.all([
    supabase
      .from('fechas_habilitadas')
      .select('id, fecha, habilitada, observaciones')
      .eq('habilitada', true)
      .gte('fecha', hoy)
      .order('fecha', { ascending: true })
      .returns<FilaFechaHabilitada[]>(),
    supabase
      .from('visitas_educativas')
      .select('fecha_visita, codigo_reserva, id')
      .neq('estado_visita', 'Cancelada')
      .returns<FilaVisitaOcupada[]>(),
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

  const filasHabilitadas = resultadoHabilitadas.data ?? [];
  const filasOcupadas = resultadoOcupadas.data ?? [];

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
    const ocupada = Boolean(ocupante) && ocupante?.id !== idVisitaActual;
    return {
      id: fila.id,
      fecha: fila.fecha,
      habilitada: fila.habilitada,
      observaciones: fila.observaciones,
      ocupada,
      ocupada_por_codigo: ocupada ? (ocupante?.codigo ?? null) : null,
    };
  });

  return { ok: true, fechas };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ACTION 5 — Actualización de una visita educativa (edición admin)
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
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload inválido.' };
  }

  /* ---- 1) Validaciones pre-UPDATE ---- */
  const idVisita = normalizarTextoNullable(payload.id, 64);
  if (!idVisita || !esUuidValido(idVisita)) {
    return { ok: false, error: 'Identificador de reserva inválido.' };
  }

  const fechaVisita = normalizarTextoNullable(payload.fecha_visita, 20);
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
      error: `Debe ingresar una cantidad válida de alumnos (entre 1 y ${CUPO_MAXIMO_EDICION}).`,
    };
  }

  if (!ESTADOS_VISITA.includes(payload.estado_visita)) {
    return { ok: false, error: 'Estado de visita no permitido.' };
  }

  const emailContacto = normalizarTextoNullable(payload.email_contacto, 160);
  if (emailContacto !== null && !FORMATO_EMAIL.test(emailContacto)) {
    return { ok: false, error: 'El email de contacto no es válido.' };
  }

  if (payload.requiere_tup === true) {
    const horarios: Array<string | null> = [
      normalizarTextoNullable(payload.tup_horario_ida_desde, 10),
      normalizarTextoNullable(payload.tup_horario_ida_hasta, 10),
      normalizarTextoNullable(payload.tup_horario_vuelta_desde, 10),
      normalizarTextoNullable(payload.tup_horario_vuelta_hasta, 10),
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: ERROR_NO_AUTENTICADO };
  }

  /* ---- 2) Obtener visita actual ---- */
  const { data: visitaActual, error: errorLectura } = await supabase
    .from('visitas_educativas')
    .select('fecha_visita, estado_visita')
    .eq('id', idVisita)
    .single<VisitaActualLectura>();

  if (errorLectura || !visitaActual) {
    registrarErrorBd(
      '[actualizarVisitaEducativaAction] Error al leer la visita:',
      errorLectura
    );
    return { ok: false, error: ERROR_GENERICO };
  }

  /* ---- 3) Guarda de concurrencia (solo si cambió la fecha o se reactiva) ---- */
  const cambioFecha = fechaVisita !== visitaActual.fecha_visita;
  const reactivaVisita =
    visitaActual.estado_visita === 'Cancelada' &&
    payload.estado_visita !== 'Cancelada';

  if (cambioFecha || reactivaVisita) {
    const { data: colision } = await supabase
      .from('visitas_educativas')
      .select('id')
      .eq('fecha_visita', fechaVisita)
      .neq('id', idVisita)
      .neq('estado_visita', 'Cancelada')
      .maybeSingle<{ id: string }>();

    if (colision) {
      return { ok: false, error: ERROR_FECHA_OCUPADA };
    }
  }

  /* ---- 4) Determinar estado final ---- */
  let estadoFinal: EstadoVisita = payload.estado_visita;
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
      turno: normalizarTextoNullable(payload.turno, 20),
      division: normalizarTextoNullable(payload.division, 60),
      cant_alumnos: payload.cant_alumnos,
      nombre_director: normalizarTextoNullable(payload.nombre_director, 120),
      cel_director: normalizarTextoNullable(payload.cel_director, 40),
      nombre_docente: normalizarTextoNullable(payload.nombre_docente, 120),
      cel_docente: normalizarTextoNullable(payload.cel_docente, 40),
      email_contacto: emailContacto?.toLowerCase() ?? null,
      requiere_tup: payload.requiere_tup,
      tup_horario_ida_desde: normalizarTextoNullable(
        payload.tup_horario_ida_desde,
        10
      ),
      tup_horario_ida_hasta: normalizarTextoNullable(
        payload.tup_horario_ida_hasta,
        10
      ),
      tup_horario_vuelta_desde: normalizarTextoNullable(
        payload.tup_horario_vuelta_desde,
        10
      ),
      tup_horario_vuelta_hasta: normalizarTextoNullable(
        payload.tup_horario_vuelta_hasta,
        10
      ),
      tup_chofer_nombre: normalizarTextoNullable(payload.tup_chofer_nombre, 120),
      estado_visita: estadoFinal,
      observaciones_docente: normalizarTextoNullable(
        payload.observaciones_docente,
        600
      ),
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
  revalidarRutasVisitas();
  return { ok: true };
}
