'use server';

import { createClient } from '@/lib/supabase/server';
import { CUPO_MAXIMO_ALUMNOS } from '@/services/visitasService';
import type { AsistenteInput, SolicitudVisitaInput } from '@/types/visitas';

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

const ERROR_GENERICO =
  'No se pudo registrar la solicitud. Intente nuevamente.';

const ERROR_FECHA_OCUPADA =
  'Esa fecha ya tiene una reserva asignada. Elija otra fecha habilitada.';

const ROLES_PERMITIDOS = ['Alumno', 'Docente'] as const;

/** Expresión regular de la FORMA ISO (YYYY-MM-DD), el formato que exige Postgres. */
const FORMATO_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function generarCodigoReserva(): string {
  const numero = Math.floor(Math.random() * 90000) + 10000;
  return `CS-${numero}`;
}

/** Convierte un string vacío/blanco en null (para columnas date/uuid/texto nullable). */
function normalizarTextoNullable(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').trim();
  return limpio.length > 0 ? limpio : null;
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
 * - Debe quedar al menos una persona válida.
 * - `fecha_nacimiento` es OPCIONAL según el tipo (`AsistenteInput.fecha_nacimiento?: string`):
 *   el string vacío "" que produce el input type="date" se NORMALIZA a null, nunca se envía ""
 *   a la columna `date` de Postgres (causa del error 22007 detectado en el E2E).
 * - Si viene una fecha no vacía, debe ser ISO calendáricamente válida; si no, se rechaza la
 *   solicitud completa ANTES de insertar la visita (evita reservas huérfanas).
 */
function normalizarAsistentes(
  asistentes: AsistenteInput[]
): ResultadoValidacion<AsistenteNormalizado[]> {
  const filasValidas = asistentes.filter(
    (asistente) => (asistente.apellido_nombre ?? '').trim().length > 0
  );

  if (filasValidas.length === 0) {
    return {
      ok: false,
      error:
        'Debe cargar la nómina de alumnos y acompañantes para confirmar la reserva.',
    };
  }

  const normalizados: AsistenteNormalizado[] = [];

  for (const asistente of filasValidas) {
    const fechaCruda = (asistente.fecha_nacimiento ?? '').trim();

    if (fechaCruda.length > 0 && !esFechaIsoValida(fechaCruda)) {
      return {
        ok: false,
        error:
          'Una fecha de nacimiento de la nómina es inválida. Use el selector de fecha o verifique el día y el mes (formato AAAA-MM-DD).',
      };
    }

    const rol: 'Alumno' | 'Docente' = ROLES_PERMITIDOS.includes(asistente.rol)
      ? asistente.rol
      : 'Alumno';

    normalizados.push({
      apellido_nombre: (asistente.apellido_nombre ?? '').trim(),
      dni: (asistente.dni ?? '').trim(),
      fecha_nacimiento: fechaCruda.length > 0 ? fechaCruda : null,
      rol,
    });
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
 * Atomicidad: la nómina y las fechas se validan ANTES del primer INSERT, de modo
 * que nunca se crea una fila en `visitas_educativas` si el payload es inválido
 * (elimina de raíz la reserva huérfana sin necesitar DELETE ni RPC).
 */
export async function crearSolicitudVisitaAction(
  datos: SolicitudVisitaInput
): Promise<ResultadoSolicitud> {
  // Reglas de dominio (mensajes en español seguros para el usuario).
  if (!datos.acepta_imagenes || !datos.acepta_medidas_judiciales) {
    return {
      ok: false,
      error: 'Debe aceptar las condiciones legales y de imagen para continuar',
    };
  }

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

  if (!datos.asistentes || datos.asistentes.length === 0) {
    return {
      ok: false,
      error:
        'Debe cargar la nómina de alumnos y acompañantes para confirmar la reserva.',
    };
  }

  // Validar la fecha de visita ANTES de insertar: no vacía y calendáricamente válida.
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

  // VALIDACIÓN PREVIA AL PRIMER INSERT: sanear toda la nómina antes de tocar la BD.
  // Si algo falla acá, se corta sin haber creado la visita (cero reservas huérfanas).
  const validacionAsistentes = normalizarAsistentes(datos.asistentes);
  if (!validacionAsistentes.ok) {
    return { ok: false, error: validacionAsistentes.error };
  }
  const asistentesSanos = validacionAsistentes.valor;

  // Si seleccionó una escuela de la lista oficial, lleva TUP automáticamente.
  // Si es texto libre ("+ Otra institución"), no lleva transporte municipal.
  // id_escuela es uuid nullable: "" -> null (nunca enviar "" a una columna uuid).
  const idEscuela = normalizarTextoNullable(datos.id_escuela);
  const requiereTup = idEscuela !== null;
  const codigoReserva = generarCodigoReserva();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('visitas_educativas')
    .insert({
      // LISTA BLANCA de columnas permitidas del DTO:
      id_escuela: idEscuela,
      otra_institucion_nombre: normalizarTextoNullable(datos.otra_institucion_nombre),
      fecha_visita: fechaVisita,
      anio: datos.anio,
      division: datos.division,
      cant_alumnos: datos.cant_alumnos,
      nombre_director: datos.nombre_director,
      cel_director: datos.cel_director,
      nombre_docente: datos.nombre_docente,
      cel_docente: datos.cel_docente,
      email_contacto: datos.email_contacto,
      acepta_imagenes: datos.acepta_imagenes,
      acepta_medidas_judiciales: datos.acepta_medidas_judiciales,
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
    })
    .select(
      'id, codigo_reserva, fecha_visita, estado_visita, estado_poliza, requiere_tup'
    )
    .single();

  if (error || !data?.id) {
    registrarErrorBd(
      '[crearSolicitudVisitaAction] Error al insertar la visita:',
      error,
      codigoReserva
    );
    // 23505 = unique_violation. En visitas_educativas existe la restricción
    // idx_visita_unica_fecha sobre fecha_visita: mensaje accionable en vez del genérico.
    if (error?.code === '23505') {
      return { ok: false, error: ERROR_FECHA_OCUPADA };
    }
    return { ok: false, error: ERROR_GENERICO };
  }

  const visita = data as VisitaInsertada;
  const idVisita = visita.id;

  // La nómina ya fue validada/saneada ANTES del insert anterior: fecha_nacimiento
  // llega como ISO válido o null (jamás ""), por lo que este insert no falla por formato.
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
      codigoReserva
    );
    return { ok: false, error: ERROR_GENERICO };
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
