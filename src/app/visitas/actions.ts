'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { CUPO_MAXIMO_ALUMNOS } from '@/services/visitasService';
import type {
  AnioEscolar,
  AsistenteInput,
  ReservaPublicaDTO,
  ResultadoConsultaReservaPublica,
  SolicitudVisitaInput,
} from '@/types/visitas';

/**
 * Contrato de retorno tipado de la acción (sin `any`).
 * En el caso exitoso devuelve los campos PERSISTIDOS por la base (fuente única
 * de verdad), para que el comprobante no muestre valores hardcodeados en cliente.
 */
export type ResultadoSolicitud =
  | {
      ok: true;
      codigo_reserva: string;
      fecha_visita: string;
      estado_visita: string;
      estado_poliza: string;
      requiere_tup: boolean;
    }
  | { ok: false; error: string };

/** Resultado interno de validación/normalización (sin `any`). */
type ResultadoValidacion<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string };

/** Asistente ya saneado y listo para el insert (fecha_nacimiento nullable). */
interface AsistenteNormalizado {
  apellido_nombre: string;
  dni: string;
  fecha_nacimiento: string | null;
  rol: 'Alumno' | 'Docente';
}

/** Columnas de la visita que la acción devuelve al cliente tras el insert. */
interface VisitaInsertada {
  id: string;
  codigo_reserva: string;
  fecha_visita: string;
  estado_visita: string;
  estado_poliza: string;
  requiere_tup: boolean;
}

interface VisitaInsertPayload {
  id_escuela: string | null;
  otra_institucion_nombre: string | null;
  fecha_visita: string;
  anio: AnioEscolar;
  division: string;
  cant_alumnos: number;
  nombre_director: string;
  cel_director: string;
  nombre_docente: string;
  cel_docente: string;
  email_contacto: string;
  acepta_imagenes: boolean;
  acepta_medidas_judiciales: boolean;
  requiere_tup: boolean;
  codigo_reserva: string;
  estado_visita: 'Confirmada';
  estado_poliza: 'Pendiente';
  check_poliza: false;
  check_tup: false;
  check_facturas: false;
  check_drive_sum: false;
  tup_horario_ida_desde: string;
  tup_horario_ida_hasta: string;
  tup_horario_vuelta_desde: string;
  tup_horario_vuelta_hasta: string;
  tup_estado_traslado?: 'pendiente';
}

const ERROR_GENERICO =
  'No se pudo registrar la solicitud. Intente nuevamente.';

const ERROR_FECHA_OCUPADA =
  'Esa fecha ya tiene una reserva asignada. Elija otra fecha habilitada.';

const ROLES_PERMITIDOS = ['Alumno', 'Docente'] as const;
const ANIOS_PERMITIDOS: readonly AnioEscolar[] = ['5°', '6°'];
const MAX_ASISTENTES_NOMINA = 60;
const MAX_REINTENTOS_CODIGO = 3;

/** Alfabeto alfanumérico sin caracteres ambiguos (0/O/1/I) para códigos VT26-XXXX. */
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Expresión regular de la FORMA ISO (YYYY-MM-DD), el formato que exige Postgres. */
const FORMATO_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * Genera código único en mayúsculas compatible con la regex S1.3
 * (`/^(?=.*[A-Z0-9])[A-Z0-9-]{3,32}$/`), p. ej. `VT26-9K4M`.
 */
function generarCodigoReserva(): string {
  const anioDosDigitos = obtenerFechaHoyArgentinaISO().slice(2, 4);
  let sufijo = '';
  for (let i = 0; i < 4; i += 1) {
    sufijo += ALFABETO_CODIGO[randomInt(0, ALFABETO_CODIGO.length)];
  }
  return `VT${anioDosDigitos}-${sufijo}`;
}

/** Convierte un string vacío/blanco o no-string en null (para columnas nullable). */
function normalizarTextoNullable(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

function normalizarCampoTexto(
  valor: unknown,
  etiqueta: string,
  min: number,
  max: number
): ResultadoValidacion<string> {
  if (typeof valor !== 'string') {
    return { ok: false, error: `Debe completar el campo ${etiqueta}.` };
  }
  const limpio = valor.trim();
  if (limpio.length < min) {
    return { ok: false, error: `El campo ${etiqueta} es obligatorio.` };
  }
  if (limpio.length > max) {
    return {
      ok: false,
      error: `El campo ${etiqueta} supera la longitud máxima (${max} caracteres).`,
    };
  }
  return { ok: true, valor: limpio };
}

/**
 * Valida la FORMA (regex ISO) y la VALIDEZ CALENDÁRICA real de una fecha.
 * El regex por sí solo acepta fechas imposibles como "2026-02-31" o "2026-01-32";
 * por eso se hace round-trip con Date y se verifica que año/mes/día coincidan.
 * Así se evita que Postgres rechace el insert (error 22007) tras crear la visita.
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

/**
 * Log PII-safe: registra solo un subconjunto estable del error de PostgREST
 * (código y mensaje), sin volcar el objeto completo que podría contener datos
 * de menores (DNI, fecha de nacimiento) en los logs del hosting.
 */
function registrarErrorBd(
  contexto: string,
  error: { code?: string; message?: string } | null,
  codigoReserva?: string
): void {
  console.error(contexto, {
    code: error?.code,
    message: error?.message,
    ...(codigoReserva ? { codigo_reserva: codigoReserva } : {}),
  });
}

/**
 * Valida y sanea TODA la nómina ANTES de tocar la base de datos.
 *
 * Reglas:
 * - Se descartan las filas sin apellido/nombre (coherente con el filtro del formulario).
 * - Debe quedar al menos una persona válida y no superar los límites de cupo.
 * - `fecha_nacimiento` es OPCIONAL según el tipo (`AsistenteInput.fecha_nacimiento?: string`):
 *   el string vacío "" que produce el input type="date" se NORMALIZA a null, nunca se envía ""
 *   a la columna `date` de Postgres (causa del error 22007 detectado en el E2E).
 * - Si viene una fecha no vacía, debe ser ISO calendáricamente válida y no futura.
 */
function normalizarAsistentes(
  asistentes: AsistenteInput[],
  hoyISO: string
): ResultadoValidacion<AsistenteNormalizado[]> {
  if (!Array.isArray(asistentes)) {
    return {
      ok: false,
      error:
        'Debe cargar la nómina de alumnos y acompañantes para confirmar la reserva.',
    };
  }

  const filasValidas = asistentes.filter(
    (asistente) =>
      asistente &&
      typeof asistente.apellido_nombre === 'string' &&
      asistente.apellido_nombre.trim().length > 0
  );

  if (filasValidas.length === 0) {
    return {
      ok: false,
      error:
        'Debe cargar la nómina de alumnos y acompañantes para confirmar la reserva.',
    };
  }

  if (filasValidas.length > MAX_ASISTENTES_NOMINA) {
    return {
      ok: false,
      error: `La nómina no puede superar ${MAX_ASISTENTES_NOMINA} personas en total.`,
    };
  }

  const normalizados: AsistenteNormalizado[] = [];
  let cantidadAlumnosEnNomina = 0;

  for (const asistente of filasValidas) {
    const nombre = asistente.apellido_nombre.trim();
    if (nombre.length > 120) {
      return {
        ok: false,
        error:
          'Un nombre de la nómina supera el máximo de 120 caracteres permitido.',
      };
    }

    const dni = typeof asistente.dni === 'string' ? asistente.dni.trim() : '';
    if (dni.length > 24) {
      return {
        ok: false,
        error: 'Un DNI de la nómina supera la longitud máxima permitida.',
      };
    }

    const fechaCruda =
      typeof asistente.fecha_nacimiento === 'string'
        ? asistente.fecha_nacimiento.trim()
        : '';

    if (fechaCruda.length > 0) {
      if (!esFechaIsoValida(fechaCruda) || fechaCruda > hoyISO) {
        return {
          ok: false,
          error:
            'Una fecha de nacimiento de la nómina es inválida. Use el selector de fecha o verifique el día y el mes (formato AAAA-MM-DD).',
        };
      }
    }

    const rol: 'Alumno' | 'Docente' = ROLES_PERMITIDOS.includes(asistente.rol)
      ? asistente.rol
      : 'Alumno';

    if (rol === 'Alumno') {
      cantidadAlumnosEnNomina += 1;
    }

    normalizados.push({
      apellido_nombre: nombre,
      dni,
      fecha_nacimiento: fechaCruda.length > 0 ? fechaCruda : null,
      rol,
    });
  }

  if (cantidadAlumnosEnNomina > CUPO_MAXIMO_ALUMNOS) {
    return {
      ok: false,
      error: `La nómina no puede incluir más de ${CUPO_MAXIMO_ALUMNOS} alumnos por jornada.`,
    };
  }

  return { ok: true, valor: normalizados };
}

/**
 * Registra una solicitud de visita educativa desde el formulario público.
 *
 * Blindaje H4: el objeto de inserción se construye con LISTA BLANCA explícita
 * de columnas (prohibido spread del input crudo). El cliente nunca puede fijar
 * id, created_at, turno ni los campos operativos check_*: la acción los fuerza.
 *
 * Validación de entorno:
 * - Cupo máximo estricto <= 40 alumnos.
 * - Fecha verificada contra `fechas_habilitadas` (habilitada = true y vigente) y
 *   sin reserva activa previa.
 * - Si `requiere_tup` es true (escuela del padrón), inicializa `tup_estado_traslado`
 *   en `'pendiente'` (estado canónico del módulo de choferes `/admin/tup`).
 */
export async function crearSolicitudVisitaAction(
  datos: SolicitudVisitaInput
): Promise<ResultadoSolicitud> {
  if (!datos || typeof datos !== 'object') {
    return { ok: false, error: 'Datos de solicitud inválidos.' };
  }

  // Reglas de dominio (mensajes en español seguros para el usuario).
  if (datos.acepta_imagenes !== true || datos.acepta_medidas_judiciales !== true) {
    return {
      ok: false,
      error: 'Debe aceptar las condiciones legales y de imagen para continuar',
    };
  }

  if (!ANIOS_PERMITIDOS.includes(datos.anio)) {
    return {
      ok: false,
      error: 'Debe seleccionar el año escolar (5° o 6°).',
    };
  }

  const valDivision = normalizarCampoTexto(datos.division, 'División', 1, 60);
  if (!valDivision.ok) return { ok: false, error: valDivision.error };

  // cant_alumnos debe ser un entero mayor a 0 y no superar el cupo máximo.
  if (!Number.isInteger(datos.cant_alumnos) || datos.cant_alumnos <= 0) {
    return {
      ok: false,
      error: 'Debe ingresar una cantidad válida de alumnos (mayor a 0).',
    };
  }

  if (datos.cant_alumnos > CUPO_MAXIMO_ALUMNOS) {
    return {
      ok: false,
      error: `El cupo máximo permitido es de ${CUPO_MAXIMO_ALUMNOS} alumnos`,
    };
  }

  const valNombreDirector = normalizarCampoTexto(
    datos.nombre_director,
    'Nombre del Director/a',
    2,
    120
  );
  if (!valNombreDirector.ok) return { ok: false, error: valNombreDirector.error };

  const valCelDirector = normalizarCampoTexto(
    datos.cel_director,
    'Celular del Director/a',
    6,
    40
  );
  if (!valCelDirector.ok) return { ok: false, error: valCelDirector.error };

  const valNombreDocente = normalizarCampoTexto(
    datos.nombre_docente,
    'Nombre del Docente a cargo',
    2,
    120
  );
  if (!valNombreDocente.ok) return { ok: false, error: valNombreDocente.error };

  const valCelDocente = normalizarCampoTexto(
    datos.cel_docente,
    'Celular del Docente a cargo',
    6,
    40
  );
  if (!valCelDocente.ok) return { ok: false, error: valCelDocente.error };

  const valEmail = normalizarCampoTexto(datos.email_contacto, 'Email de contacto', 5, 160);
  if (!valEmail.ok) return { ok: false, error: valEmail.error };
  if (!FORMATO_EMAIL.test(valEmail.valor)) {
    return {
      ok: false,
      error: 'Debe ingresar un correo electrónico de contacto válido.',
    };
  }

  // Institución: escuela del padrón o texto libre obligatorio.
  const idEscuela = normalizarTextoNullable(datos.id_escuela);
  let otraInstitucionNombre: string | null = null;
  if (idEscuela === null) {
    const valOtra = normalizarCampoTexto(
      datos.otra_institucion_nombre,
      'Nombre de la institución',
      2,
      160
    );
    if (!valOtra.ok) return { ok: false, error: valOtra.error };
    otraInstitucionNombre = valOtra.valor;
  } else if (idEscuela.length > 80) {
    return { ok: false, error: 'Identificador de escuela inválido.' };
  }

  // Validar la fecha de visita ANTES de insertar: no vacía, calendáricamente válida y vigente.
  const fechaVisita = normalizarTextoNullable(datos.fecha_visita);
  if (!fechaVisita) {
    return {
      ok: false,
      error: 'Debe seleccionar una fecha de visita habilitada.',
    };
  }
  if (!esFechaIsoValida(fechaVisita)) {
    return {
      ok: false,
      error: 'La fecha de visita seleccionada no es válida.',
    };
  }

  const hoyISO = obtenerFechaHoyArgentinaISO();
  if (fechaVisita < hoyISO) {
    return {
      ok: false,
      error: 'La fecha seleccionada ya venció. Elija una fecha habilitada vigente.',
    };
  }

  // VALIDACIÓN PREVIA AL PRIMER INSERT: sanear toda la nómina antes de tocar la BD.
  // Si algo falla acá, se corta sin haber creado la visita (cero reservas huérfanas).
  const validacionAsistentes = normalizarAsistentes(datos.asistentes, hoyISO);
  if (!validacionAsistentes.ok) {
    return { ok: false, error: validacionAsistentes.error };
  }
  const asistentesSanos = validacionAsistentes.valor;

  const supabase = await createClient();

  // Consultar en BD: (1) fecha habilitada, (2) conflicto activo, (3) escuela válida si aplica.
  const [resFechaHabilitada, resFechaOcupada, resEscuela] = await Promise.all([
    supabase
      .from('fechas_habilitadas')
      .select('id, fecha, habilitada')
      .eq('fecha', fechaVisita)
      .eq('habilitada', true)
      .maybeSingle(),
    supabase
      .from('visitas_educativas')
      .select('id')
      .eq('fecha_visita', fechaVisita)
      .neq('estado_visita', 'Cancelada')
      .limit(1)
      .returns<Array<{ id: string }>>(),
    idEscuela !== null
      ? supabase.from('escuelas').select('id').eq('id', idEscuela).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (resFechaHabilitada.error) {
    registrarErrorBd(
      '[crearSolicitudVisitaAction] Error al verificar fechas_habilitadas:',
      resFechaHabilitada.error
    );
    return { ok: false, error: ERROR_GENERICO };
  }

  if (!resFechaHabilitada.data) {
    return {
      ok: false,
      error: 'La fecha seleccionada no se encuentra habilitada para reservas.',
    };
  }

  if (resEscuela.error) {
    registrarErrorBd(
      '[crearSolicitudVisitaAction] Error al verificar escuela:',
      resEscuela.error
    );
    return { ok: false, error: ERROR_GENERICO };
  }

  if (idEscuela !== null && !resEscuela.data) {
    return {
      ok: false,
      error: 'La institución escolar seleccionada no es válida.',
    };
  }

  if (!resFechaOcupada.error && (resFechaOcupada.data?.length ?? 0) > 0) {
    return { ok: false, error: ERROR_FECHA_OCUPADA };
  }

  // Si seleccionó una escuela de la lista oficial, lleva TUP automáticamente.
  // Si es texto libre ("+ Otra institución"), no lleva transporte municipal.
  const requiereTup = idEscuela !== null;
  let visita: VisitaInsertada | null = null;
  let codigoReservaFinal = '';

  for (let intento = 0; intento < MAX_REINTENTOS_CODIGO; intento += 1) {
    const codigoReserva = generarCodigoReserva();
    codigoReservaFinal = codigoReserva;

    const payloadInsert: VisitaInsertPayload = {
      id_escuela: idEscuela,
      otra_institucion_nombre: otraInstitucionNombre,
      fecha_visita: fechaVisita,
      anio: datos.anio,
      division: valDivision.valor,
      cant_alumnos: datos.cant_alumnos,
      nombre_director: valNombreDirector.valor,
      cel_director: valCelDirector.valor,
      nombre_docente: valNombreDocente.valor,
      cel_docente: valCelDocente.valor,
      email_contacto: valEmail.valor.toLowerCase(),
      acepta_imagenes: true,
      acepta_medidas_judiciales: true,
      // Campos fijados exclusivamente por el servidor:
      requiere_tup: requiereTup,
      codigo_reserva: codigoReserva,
      estado_visita: 'Confirmada',
      estado_poliza: 'Pendiente',
      check_poliza: false,
      check_tup: false,
      check_facturas: false,
      check_drive_sum: false,
      tup_horario_ida_desde: '08:00',
      tup_horario_ida_hasta: '08:15',
      tup_horario_vuelta_desde: '11:30',
      tup_horario_vuelta_hasta: '11:45',
      ...(requiereTup ? { tup_estado_traslado: 'pendiente' as const } : {}),
    };

    const { data, error } = await supabase
      .from('visitas_educativas')
      .insert(payloadInsert)
      .select(
        'id, codigo_reserva, fecha_visita, estado_visita, estado_poliza, requiere_tup'
      )
      .single<VisitaInsertada>();

    if (!error && data?.id) {
      visita = data;
      break;
    }

    if (
      error?.code === '23505' &&
      error.message?.toLowerCase().includes('codigo_reserva') &&
      intento < MAX_REINTENTOS_CODIGO - 1
    ) {
      continue;
    }

    registrarErrorBd(
      '[crearSolicitudVisitaAction] Error al insertar la visita:',
      error,
      codigoReserva
    );

    if (error?.code === '23505') {
      return { ok: false, error: ERROR_FECHA_OCUPADA };
    }
    return { ok: false, error: ERROR_GENERICO };
  }

  if (!visita?.id) {
    return { ok: false, error: ERROR_GENERICO };
  }

  const idVisita = visita.id;

  // Insertar nómina vinculada por id_visita.
  const { error: errorAsistentes } = await supabase
    .from('visita_asistentes')
    .insert(
      asistentesSanos.map((asistente) => ({
        id_visita: idVisita,
        apellido_nombre: asistente.apellido_nombre,
        dni: asistente.dni,
        fecha_nacimiento: asistente.fecha_nacimiento,
        rol: asistente.rol,
      }))
    );

  if (errorAsistentes) {
    registrarErrorBd(
      '[crearSolicitudVisitaAction] Error al insertar asistentes:',
      errorAsistentes,
      codigoReservaFinal
    );
    // Compensación best-effort si la sesión permite rollback (ej. operador autenticado).
    await supabase.from('visitas_educativas').delete().eq('id', idVisita);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidatePath('/visitas');
  revalidatePath('/admin/visitas-educativas');
  revalidatePath('/admin');
  if (requiereTup) {
    revalidatePath('/admin/tup');
  }

  // Se devuelven los valores PERSISTIDOS por la base (fuente única de verdad).
  return {
    ok: true,
    codigo_reserva: visita.codigo_reserva,
    fecha_visita: visita.fecha_visita,
    estado_visita: visita.estado_visita,
    estado_poliza: visita.estado_poliza,
    requiere_tup: visita.requiere_tup,
  };
}

/** Relación embebida de PostgREST hacia `escuelas(nombre_institucion)`. */
type EscuelaJoinPublica =
  | { nombre_institucion: string | null }
  | Array<{ nombre_institucion: string | null }>
  | null;

/** Proyección de solo lectura estrictamente acotada a columnas no sensibles. */
interface FilaReservaPublicaRaw {
  codigo_reserva: string;
  fecha_visita: string;
  turno: string | null;
  estado_visita: string;
  requiere_tup: boolean | null;
  tup_estado_traslado: string | null;
  otra_institucion_nombre: string | null;
  escuelas: EscuelaJoinPublica;
}

/** Allowlist estricto: impide comodines (`%`, `_`), espacios o caracteres de inyección. */
const FORMATO_CODIGO_RESERVA = /^(?=.*[A-Z0-9])[A-Z0-9-]{3,32}$/;

const SELECT_RESERVA_PUBLICA = `
  codigo_reserva,
  fecha_visita,
  turno,
  estado_visita,
  requiere_tup,
  tup_estado_traslado,
  otra_institucion_nombre,
  escuelas(nombre_institucion)
`;

function resolverInstitucionPublica(fila: FilaReservaPublicaRaw): string {
  const relacion = fila.escuelas;
  if (relacion) {
    const escuela = Array.isArray(relacion) ? relacion[0] : relacion;
    const nombreEscuela = escuela?.nombre_institucion?.trim();
    if (nombreEscuela) return nombreEscuela;
  }

  const nombreOtra = fila.otra_institucion_nombre?.trim();
  if (nombreOtra) return nombreOtra;

  return 'Institución educativa registrada';
}

/**
 * Consulta pública de solo lectura del estado de una reserva escolar por su
 * `codigo_reserva`.
 *
 * Seguridad y sanitización:
 * - Valida y normaliza en servidor (`trim().toUpperCase()`, allowlist sin `%`/`_`).
 * - Selecciona únicamente columnas públicas de seguimiento (sin DNI, docentes,
 *   directores, teléfonos, emails ni nóminas).
 * - Solo incluye `tup_estado_traslado` cuando `requiere_tup` es `true`.
 */
export async function consultarEstadoReservaPublica(
  codigoReserva: string
): Promise<ResultadoConsultaReservaPublica> {
  if (typeof codigoReserva !== 'string') {
    return {
      ok: false,
      motivo: 'validacion',
      error: 'Ingresá un código de reserva válido para realizar la consulta.',
    };
  }

  const codigoNormalizado = codigoReserva.trim().toUpperCase();

  if (codigoNormalizado.length === 0) {
    return {
      ok: false,
      motivo: 'validacion',
      error: 'Ingresá un código de reserva para realizar la consulta.',
    };
  }

  if (!FORMATO_CODIGO_RESERVA.test(codigoNormalizado)) {
    return {
      ok: false,
      motivo: 'validacion',
      error:
        'El formato del código es inválido. Usá solo letras, números y guiones (ej: CS-48291).',
    };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('visitas_educativas')
      .select(SELECT_RESERVA_PUBLICA)
      .ilike('codigo_reserva', codigoNormalizado)
      .limit(1)
      .returns<FilaReservaPublicaRaw[]>();

    if (error) {
      registrarErrorBd(
        '[consultarEstadoReservaPublica] Error al consultar reserva:',
        error,
        codigoNormalizado
      );
      return {
        ok: false,
        motivo: 'error_sistema',
        error:
          'No pudimos consultar la reserva en este momento. Intentá nuevamente en unos instantes.',
      };
    }

    const fila = data?.[0];
    if (!fila) {
      return {
        ok: false,
        motivo: 'no_encontrada',
        error:
          'No encontramos ninguna reserva asociada a ese código. Verificá el identificador asignado a tu institución.',
      };
    }

    const requiereTup = Boolean(fila.requiere_tup);
    const reserva: ReservaPublicaDTO = {
      codigo_reserva: fila.codigo_reserva,
      fecha_visita: fila.fecha_visita,
      turno: fila.turno?.trim() || null,
      estado_visita: fila.estado_visita?.trim() || 'Pendiente',
      institucion_nombre: resolverInstitucionPublica(fila),
      requiere_tup: requiereTup,
      tup_estado_traslado: requiereTup
        ? fila.tup_estado_traslado?.trim() || 'pendiente'
        : null,
    };

    return { ok: true, reserva };
  } catch (err) {
    const errObj =
      err instanceof Error ? { message: err.message } : { message: 'Error desconocido' };
    registrarErrorBd(
      '[consultarEstadoReservaPublica] Excepción inesperada:',
      errObj,
      codigoNormalizado
    );
    return {
      ok: false,
      motivo: 'error_sistema',
      error:
        'Ocurrió un error inesperado al consultar la reserva. Intentá nuevamente.',
    };
  }
}
