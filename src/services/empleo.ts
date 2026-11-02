'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { proyectarCohorteDinamica } from '@/lib/calculo-cohorte';
import type {
  ComparativaProgreso,
  ConfiguracionCohorteInput,
  DatosCohorteActiva,
  EjeRadar,
  EstadoInscripcion,
  EtapaEvaluacion,
  EvaluacionReceptividad,
  FichaEvaluacion,
  FranjaCabina,
  MetricasIntento,
  OcupanteFranja,
  PostulanteFila,
  PuntoRadar,
  ResultadoAccion,
  TelemetriaTitan,
  TurnoFranja,
} from '@/types/empleo';

/**
 * Servicio del panel /gestion/cohortes (Gestión de Empleo).
 * Solo exports async: cualquier helper pura vive en src/lib/ (restricción del
 * bundler sobre módulos 'use server'). Todas las acciones exigen sesión y
 * re-leen el objetivo acotado (anti-IDOR): RLS USING(true) no autoriza por fila.
 */

const RUTA_PANEL = '/gestion/cohortes';
const ESTADOS_VALIDOS: readonly EstadoInscripcion[] = [
  'DISPONIBLE',
  'CONFIRMADO',
  'DESCARTADO',
];
const MAX_MOTIVO_BAJA = 500;
const MAX_NOTAS_EMPLEO = 2000;

// Umbrales de receptividad sobre delta_tiempo_seg relativo V1→V2 (%).
const UMBRAL_ASIMILACION_SEG = -10;
const UMBRAL_ANSIEDAD_SEG = 10;
// Techo de la heurística legacy para normalizar serrucho/frenadas a 0-100.
const SERRUCHO_TECHO = 3.2;
const FRENADAS_TECHO = 10;
const NEUTRO_RADAR = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Formas crudas de PostgREST
// ─────────────────────────────────────────────────────────────────────────────

interface FilaCohorte {
  id: string;
  codigo: string;
  nombre: string;
  fecha_teoria: string | null;
  fecha_inicio_sim: string | null;
  fecha_fin_sim: string | null;
  fecha_pase_planta: string | null;
  cant_dias_sim: number | null;
  max_titulares: number | null;
}

interface FilaFranja {
  id: string;
  turno: string;
  horario_label: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_maximo: number | null;
}

interface FilaEvaluacion {
  id: string;
  created_at: string | null;
  dictamen: string | null;
  asistencia_cabina: string | null;
  puntaje_lateralidad: number | null;
  puntaje_tacto_mandos: number | null;
  puntaje_mastil: number | null;
  puntaje_control_receptividad: number | null;
  eje_lateralidad: string | null;
  eje_tacto_mandos: string | null;
  eje_mastil: string | null;
  eje_control_receptividad: string | null;
  tiempo_vuelta_seg: number | null;
  colisiones: number | null;
  score_puntos: number | string | null;
  // Columnas multi-intento (migración 0008)
  etapa: string | null;
  es_mejor_diagnostico: boolean | null;
  archivo_fuente: string | null;
  colisiones_descartadas: number | null;
  delta_tiempo_seg: number | null;
  delta_colisiones: number | null;
  delta_score: number | string | null;
  delta_serrucho: number | string | null;
}

interface FilaInscripcion {
  id: string;
  ranking_orden: number;
  estado: string;
  motivo_baja: string | null;
  obs_empleo: string | null;
  franja_id: string | null;
  postulante_id: string | null;
  // La evaluación se anida bajo postulantes: NO hay FK directa entre
  // cohorte_inscripciones y evaluacion_diagnostico; ambas cuelgan de postulantes.
  postulantes:
    | {
        nombre_completo: string;
        dni: string;
        origen_turno: string;
        evaluacion_diagnostico: FilaEvaluacion[] | null;
      }
    | {
        nombre_completo: string;
        dni: string;
        origen_turno: string;
        evaluacion_diagnostico: FilaEvaluacion[] | null;
      }[]
    | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo crudo → DTO
// ─────────────────────────────────────────────────────────────────────────────

function numeroOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrae el índice de serrucho y los volantazos extremos del texto legacy
 * "serrucho=X; volantazos_extremos=Y" escrito por scripts/sync_supabase.py.
 */
function parsearTelemetriaLateralidad(texto: string | null): {
  indice_serrucho: number | null;
  volantazos_extremos: number | null;
} {
  if (!texto) return { indice_serrucho: null, volantazos_extremos: null };
  const serrucho = texto.match(/serrucho\s*=\s*(-?\d+(?:[.,]\d+)?)/i);
  const volantazos = texto.match(
    /volantazos_extremos\s*=\s*(-?\d+(?:[.,]\d+)?)/i
  );
  return {
    indice_serrucho: serrucho ? Number(serrucho[1].replace(',', '.')) : null,
    volantazos_extremos: volantazos
      ? Number(volantazos[1].replace(',', '.'))
      : null,
  };
}

function mapearEvaluacion(filas: FilaEvaluacion[] | null): FichaEvaluacion | null {
  if (!filas || filas.length === 0) return null;
  // Última evaluación del postulante (la consola táctil inserta una fila nueva).
  const fila = [...filas].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  )[0];
  const telemetriaTexto = parsearTelemetriaLateralidad(fila.eje_lateralidad);
  const telemetria: TelemetriaTitan = {
    score_puntos: numeroOrNull(fila.score_puntos),
    tiempo_vuelta_seg: numeroOrNull(fila.tiempo_vuelta_seg),
    colisiones: numeroOrNull(fila.colisiones),
    indice_serrucho: telemetriaTexto.indice_serrucho,
    volantazos_extremos: telemetriaTexto.volantazos_extremos,
  };
  return {
    dictamen: fila.dictamen,
    asistencia_cabina: fila.asistencia_cabina,
    puntaje_lateralidad: numeroOrNull(fila.puntaje_lateralidad),
    puntaje_tacto_mandos: numeroOrNull(fila.puntaje_tacto_mandos),
    puntaje_mastil: numeroOrNull(fila.puntaje_mastil),
    puntaje_control_receptividad: numeroOrNull(fila.puntaje_control_receptividad),
    eje_lateralidad: fila.eje_lateralidad,
    eje_tacto_mandos: fila.eje_tacto_mandos,
    eje_mastil: fila.eje_mastil,
    eje_control_receptividad: fila.eje_control_receptividad,
    telemetria,
  };
}

function esTurnoFranja(v: string): v is TurnoFranja {
  return v === 'Mañana' || v === 'Tarde';
}

function esEstadoInscripcion(v: string): v is EstadoInscripcion {
  return (ESTADOS_VALIDOS as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura del panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cohorte activa + franjas con sus ocupantes CONFIRMADO + postulantes ordenados
 * por ranking con su última evaluacion_diagnostico. Devuelve null si no hay
 * sesión, cohorte activa o si falla la lectura.
 */
export async function obtenerDatosCohorteActiva(): Promise<DatosCohorteActiva | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: cohorte, error: errCohorte } = await supabase
    .from('cohortes')
    .select(
      'id, codigo, nombre, fecha_teoria, fecha_inicio_sim, fecha_fin_sim, fecha_pase_planta, cant_dias_sim, max_titulares'
    )
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errCohorte) {
    console.error('[obtenerDatosCohorteActiva] Error al buscar cohorte activa:', {
      code: errCohorte.code,
      message: errCohorte.message,
    });
    return null;
  }
  const filaCohorte = cohorte as FilaCohorte | null;
  if (!filaCohorte) return null;

  const { data: franjas, error: errFranjas } = await supabase
    .from('franjas_cabina')
    .select('id, turno, horario_label, hora_inicio, hora_fin, cupo_maximo')
    .eq('cohorte_id', filaCohorte.id)
    .order('hora_inicio', { ascending: true });

  const { data: inscripciones, error: errInscripciones } = await supabase
    .from('cohorte_inscripciones')
    .select(
      `id, ranking_orden, estado, motivo_baja, obs_empleo, franja_id, postulante_id,
       postulantes(nombre_completo, dni, origen_turno,
         evaluacion_diagnostico(id, created_at, dictamen, asistencia_cabina,
           puntaje_lateralidad, puntaje_tacto_mandos, puntaje_mastil,
           puntaje_control_receptividad, eje_lateralidad, eje_tacto_mandos,
           eje_mastil, eje_control_receptividad, tiempo_vuelta_seg, colisiones,
           score_puntos))`
    )
    .eq('cohorte_id', filaCohorte.id)
    .order('ranking_orden', { ascending: true });

  if (errFranjas || errInscripciones) {
    console.error('[obtenerDatosCohorteActiva] Error al cargar franjas/inscripciones:', {
      franjas: errFranjas ? { code: errFranjas.code, message: errFranjas.message } : null,
      inscripciones: errInscripciones
        ? { code: errInscripciones.code, message: errInscripciones.message }
        : null,
    });
    return null;
  }

  const filasInscripcion = (inscripciones ?? []) as unknown as FilaInscripcion[];

  const postulantes: PostulanteFila[] = [];
  const ocupantesPorFranja = new Map<string, OcupanteFranja[]>();
  let totalConfirmados = 0;

  for (const f of filasInscripcion) {
    const rel = Array.isArray(f.postulantes) ? f.postulantes[0] : f.postulantes;
    if (!rel || !f.postulante_id) continue;

    const estado: EstadoInscripcion = esEstadoInscripcion(f.estado)
      ? f.estado
      : 'DISPONIBLE';
    if (estado === 'CONFIRMADO') totalConfirmados += 1;

    if (estado === 'CONFIRMADO' && f.franja_id) {
      const lista = ocupantesPorFranja.get(f.franja_id) ?? [];
      lista.push({
        inscripcion_id: f.id,
        nombre_completo: rel.nombre_completo,
        dni: rel.dni,
        ranking_orden: f.ranking_orden,
      });
      ocupantesPorFranja.set(f.franja_id, lista);
    }

    postulantes.push({
      inscripcion_id: f.id,
      postulante_id: f.postulante_id,
      ranking_orden: f.ranking_orden,
      nombre_completo: rel.nombre_completo,
      dni: rel.dni,
      origen_turno:
        rel.origen_turno === 'TM' || rel.origen_turno === 'TT'
          ? rel.origen_turno
          : 'INDEFINIDO',
      estado,
      motivo_baja: f.motivo_baja,
      obs_empleo: f.obs_empleo,
      franja_id: f.franja_id,
      evaluacion: mapearEvaluacion(rel.evaluacion_diagnostico),
    });
  }

  const franjasDto: FranjaCabina[] = ((franjas ?? []) as unknown as FilaFranja[]).map(
    (fr) => ({
      id: fr.id,
      turno: esTurnoFranja(fr.turno) ? fr.turno : 'Mañana',
      horario_label: fr.horario_label,
      hora_inicio: fr.hora_inicio,
      hora_fin: fr.hora_fin,
      cupo_maximo: numeroOrNull(fr.cupo_maximo) ?? 3,
      ocupantes: ocupantesPorFranja.get(fr.id) ?? [],
    })
  );

  return {
    cohorte: {
      id: filaCohorte.id,
      codigo: filaCohorte.codigo,
      nombre: filaCohorte.nombre,
      fecha_teoria: filaCohorte.fecha_teoria,
      fecha_inicio_sim: filaCohorte.fecha_inicio_sim,
      fecha_fin_sim: filaCohorte.fecha_fin_sim,
      fecha_pase_planta: filaCohorte.fecha_pase_planta,
      cant_dias_sim: numeroOrNull(filaCohorte.cant_dias_sim) ?? 0,
      max_titulares: numeroOrNull(filaCohorte.max_titulares) ?? 0,
    },
    franjas: franjasDto,
    postulantes,
    totalConfirmados,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Acciones de asignación
// ─────────────────────────────────────────────────────────────────────────────

function idsValidos(...ids: (string | null | undefined)[]): boolean {
  return ids.every((id) => typeof id === 'string' && id.trim().length > 0);
}

/**
 * Asigna un postulante a una franja de cabina y lo confirma.
 * Valida cupo de la franja (3 confirmados) antes de escribir; el trigger
 * trg_validar_cupo_franja queda como red ante carreras concurrentes.
 */
export async function asignarPostulanteFranja(
  inscripcion_id: string,
  franja_id: string
): Promise<ResultadoAccion> {
  if (!idsValidos(inscripcion_id, franja_id)) {
    return { ok: false, error: 'Datos inválidos' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id, cohorte_id, estado')
    .eq('id', inscripcion_id.trim())
    .maybeSingle();

  if (errInsc || !insc) {
    console.error('[asignarPostulanteFranja] Error al leer inscripción:', {
      code: errInsc?.code,
      message: errInsc?.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }

  const { data: franja, error: errFranja } = await supabase
    .from('franjas_cabina')
    .select('id, cohorte_id, cupo_maximo')
    .eq('id', franja_id.trim())
    .maybeSingle();

  if (errFranja || !franja) {
    console.error('[asignarPostulanteFranja] Error al leer franja:', {
      code: errFranja?.code,
      message: errFranja?.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }

  // Anti-IDOR: la franja debe pertenecer a la cohorte de la inscripción.
  if (franja.cohorte_id !== insc.cohorte_id) {
    return { ok: false, error: 'La franja no pertenece a la cohorte del postulante' };
  }

  const cupo = numeroOrNull(franja.cupo_maximo) ?? 3;
  const { count, error: errCount } = await supabase
    .from('cohorte_inscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('franja_id', franja.id)
    .eq('estado', 'CONFIRMADO')
    .neq('id', insc.id);

  if (errCount) {
    console.error('[asignarPostulanteFranja] Error al contar ocupantes:', {
      code: errCount.code,
      message: errCount.message,
    });
    return { ok: false, error: 'No se pudo validar el cupo de la franja' };
  }
  if ((count ?? 0) >= cupo) {
    return { ok: false, error: 'FRANJA_COMPLETA: la franja ya tiene 3 confirmados' };
  }

  const { error: errUpdate } = await supabase
    .from('cohorte_inscripciones')
    .update({
      franja_id: franja.id,
      estado: 'CONFIRMADO',
      motivo_baja: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insc.id);

  if (errUpdate) {
    console.error('[asignarPostulanteFranja] Error al asignar:', {
      code: errUpdate.code,
      message: errUpdate.message,
    });
    const mensaje = errUpdate.message.includes('FRANJA_COMPLETA')
      ? 'La franja se completó antes de confirmar al postulante'
      : errUpdate.message.includes('COHORTE_COMPLETA')
        ? 'Se alcanzó el tope de titulares de la cohorte'
        : 'No se pudo asignar el postulante a la franja';
    return { ok: false, error: mensaje };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

/**
 * Baja de un postulante: libera la franja, pasa a DESCARTADO y guarda el motivo.
 * Escribir estado <> 'CONFIRMADO' no dispara los triggers de cupo/tope.
 */
export async function darDeBajaPostulante(
  inscripcion_id: string,
  motivo_baja: string
): Promise<ResultadoAccion> {
  const motivo =
    typeof motivo_baja === 'string' ? motivo_baja.trim().slice(0, MAX_MOTIVO_BAJA) : '';
  if (!idsValidos(inscripcion_id) || motivo.length === 0) {
    return { ok: false, error: 'Datos inválidos: se requiere un motivo de baja' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id')
    .eq('id', inscripcion_id.trim())
    .maybeSingle();

  if (errInsc || !insc) {
    console.error('[darDeBajaPostulante] Error al leer inscripción:', {
      code: errInsc?.code,
      message: errInsc?.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }

  const { error: errUpdate } = await supabase
    .from('cohorte_inscripciones')
    .update({
      franja_id: null,
      estado: 'DESCARTADO',
      motivo_baja: motivo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insc.id);

  if (errUpdate) {
    console.error('[darDeBajaPostulante] Error al dar de baja:', {
      code: errUpdate.code,
      message: errUpdate.message,
    });
    return { ok: false, error: 'No se pudo dar de baja al postulante' };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

/**
 * Persiste las notas sociolaborales del equipo de Empleo sobre la inscripción
 * (columna obs_empleo). Texto vacío => NULL.
 */
export async function guardarNotasEmpleo(
  inscripcion_id: string,
  notas: string
): Promise<ResultadoAccion> {
  if (!idsValidos(inscripcion_id)) {
    return { ok: false, error: 'Datos inválidos' };
  }
  const texto = typeof notas === 'string' ? notas.trim().slice(0, MAX_NOTAS_EMPLEO) : '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const { error } = await supabase
    .from('cohorte_inscripciones')
    .update({
      obs_empleo: texto.length > 0 ? texto : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inscripcion_id.trim());

  if (error) {
    console.error('[guardarNotasEmpleo] Error al guardar notas:', {
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: 'No se pudieron guardar las notas' };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

/**
 * Configuración dinámica de la cohorte: validación estricta del input,
 * proyección del calendario Lun-Jue con el motor puro y persistencia de
 * fechas + cupo en `cohortes`.
 */
export async function actualizarConfiguracionCohorte(
  cohorte_id: string,
  configuracion: ConfiguracionCohorteInput
): Promise<ResultadoAccion> {
  if (!idsValidos(cohorte_id) || !configuracion) {
    return { ok: false, error: 'Datos inválidos' };
  }

  const cupo = configuracion.max_titulares;
  if (!Number.isInteger(cupo) || cupo <= 0 || cupo > 200) {
    return { ok: false, error: 'El cupo debe ser un entero entre 1 y 200' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(configuracion.fecha_teoria ?? '')) {
    return { ok: false, error: 'La fecha de teoría debe tener formato YYYY-MM-DD' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const { data: cohorte, error: errCohorte } = await supabase
    .from('cohortes')
    .select('id')
    .eq('id', cohorte_id.trim())
    .maybeSingle();

  if (errCohorte || !cohorte) {
    console.error('[actualizarConfiguracionCohorte] Error al leer cohorte:', {
      code: errCohorte?.code,
      message: errCohorte?.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }

  let proyeccion;
  try {
    proyeccion = proyectarCohorteDinamica({
      fechaTeoria: configuracion.fecha_teoria,
      cupoTitulares: cupo,
    });
  } catch {
    return { ok: false, error: 'No se pudo proyectar el calendario con esos datos' };
  }

  // Lista blanca de columnas actualizables desde la cabecera de configuración.
  const { error: errUpdate } = await supabase
    .from('cohortes')
    .update({
      fecha_teoria: configuracion.fecha_teoria,
      max_titulares: cupo,
      fecha_inicio_sim: proyeccion.fechaInicioSim,
      fecha_fin_sim: proyeccion.fechaFinSim,
      fecha_pase_planta: proyeccion.fechaPasePlanta,
      cant_dias_sim: proyeccion.cantJornadas,
    })
    .eq('id', cohorte.id);

  if (errUpdate) {
    console.error('[actualizarConfiguracionCohorte] Error al actualizar:', {
      code: errUpdate.code,
      message: errUpdate.message,
    });
    return { ok: false, error: 'No se pudo guardar la configuración de la cohorte' };
  }

  revalidatePath(RUTA_PANEL);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Comparativa de progreso multi-intento (V1 / V2 / FINAL, migración 0008)
// ─────────────────────────────────────────────────────────────────────────

/** Extrae frenadas_panico del texto legacy "frenadas_panico=X; ...". */
function parsearFrenadasLegacy(texto: string | null): number | null {
  if (!texto) return null;
  const m = texto.match(/frenadas_panico\s*=\s*(-?\d+(?:[.,]\d+)?)/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

function normalizarEtapa(v: string | null): EtapaEvaluacion {
  return v === 'DIAG_INTENTO_2' || v === 'FINAL' ? v : 'DIAG_INTENTO_1';
}

function clamp01a100(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function mapearIntento(f: FilaEvaluacion): MetricasIntento {
  const tel = parsearTelemetriaLateralidad(f.eje_lateralidad);
  return {
    evaluacionId: f.id,
    etapa: normalizarEtapa(f.etapa),
    archivoFuente: f.archivo_fuente,
    dictamen: f.dictamen,
    asistenciaCabina: f.asistencia_cabina,
    tiempoVueltaSeg: numeroOrNull(f.tiempo_vuelta_seg),
    colisiones: numeroOrNull(f.colisiones),
    colisionesDescartadas: numeroOrNull(f.colisiones_descartadas),
    scorePuntos: numeroOrNull(f.score_puntos),
    indiceSerrucho: tel.indice_serrucho,
    volantazosExtremos: tel.volantazos_extremos,
    esMejorDiagnostico: f.es_mejor_diagnostico === true,
  };
}

/**
 * Valor 0-100 de un eje del radar para una pasada: prefiere el puntaje entero
 * de consola táctil (0/10/20 ×5); sin él, heurística sobre la telemetría TITAN
 * legacy; sin datos, valor neutro 50.
 */
function valorRadar(
  f: FilaEvaluacion,
  eje: EjeRadar,
  tel: { indice_serrucho: number | null; volantazos_extremos: number | null }
): number {
  switch (eje) {
    case 'Lateralidad': {
      const p = numeroOrNull(f.puntaje_lateralidad);
      if (p !== null) return clamp01a100(p * 5);
      if (tel.indice_serrucho !== null)
        return clamp01a100((1 - tel.indice_serrucho / SERRUCHO_TECHO) * 100);
      return NEUTRO_RADAR;
    }
    case 'Mandos': {
      const p = numeroOrNull(f.puntaje_tacto_mandos);
      if (p !== null) return clamp01a100(p * 5);
      const frenadas = parsearFrenadasLegacy(f.eje_tacto_mandos);
      if (frenadas !== null) return clamp01a100((1 - frenadas / FRENADAS_TECHO) * 100);
      return NEUTRO_RADAR;
    }
    case 'Mástil': {
      const p = numeroOrNull(f.puntaje_mastil);
      if (p !== null) return clamp01a100(p * 5);
      // Sin telemetría numérica de mástil aún: eje_mastil solo lista faltas.
      return NEUTRO_RADAR;
    }
    case 'Control': {
      const p = numeroOrNull(f.puntaje_control_receptividad);
      if (p !== null) return clamp01a100(p * 5);
      return NEUTRO_RADAR;
    }
  }
}

function puntosRadar(diag: FilaEvaluacion, final: FilaEvaluacion | null): PuntoRadar[] {
  const telDiag = parsearTelemetriaLateralidad(diag.eje_lateralidad);
  const telFinal = final ? parsearTelemetriaLateralidad(final.eje_lateralidad) : telDiag;
  const base = final ?? diag;
  const ejes: EjeRadar[] = ['Lateralidad', 'Mandos', 'Mástil', 'Control'];
  return ejes.map((eje) => ({
    eje,
    valorDiagnostico: valorRadar(diag, eje, telDiag),
    valorFinal: valorRadar(base, eje, telFinal),
  }));
}

/**
 * Lectura cualitativa de la receptividad V1→V2 sobre el delta relativo de
 * tiempo: mejora ≥10% = Alta Asimilación; empeora >10% = Ansiedad Operativa;
 * el resto, Estable. Sin V2 no hay datos.
 */
function receptividad(deltaSeg: number | null, base: number | null): EvaluacionReceptividad {
  if (deltaSeg === null || !base || base <= 0) return 'Sin Datos';
  const pct = (deltaSeg / base) * 100;
  if (pct <= UMBRAL_ASIMILACION_SEG) return 'Alta Asimilación';
  if (pct >= UMBRAL_ANSIEDAD_SEG) return 'Ansiedad Operativa';
  return 'Estable';
}

/**
 * Payload de comparativa V1/V2/FINAL de un postulante para Radar y progreso
 * temporal. Solo filas del pipeline TITAN (archivo_fuente <> 'CABINA_TABLET').
 * Devuelve null sin sesión, sin inscripción vigente en la cohorte activa o
 * sin pasada DIAG_INTENTO_1.
 */
export async function obtenerComparativaProgreso(
  postulante_id: string
): Promise<ComparativaProgreso | null> {
  if (!idsValidos(postulante_id)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: cohorte } = await supabase
    .from('cohortes')
    .select('id')
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cohorte) return null;

  // Anti-IDOR: el postulante debe estar inscripto en la cohorte activa.
  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id')
    .eq('cohorte_id', cohorte.id)
    .eq('postulante_id', postulante_id.trim())
    .maybeSingle();
  if (errInsc || !insc) {
    console.error('[obtenerComparativaProgreso] Error al validar inscripción:', {
      code: errInsc?.code,
      message: errInsc?.message,
    });
    return null;
  }

  const { data: filas, error: errEvals } = await supabase
    .from('evaluacion_diagnostico')
    .select(
      `id, created_at, dictamen, asistencia_cabina, puntaje_lateralidad,
       puntaje_tacto_mandos, puntaje_mastil, puntaje_control_receptividad,
       eje_lateralidad, eje_tacto_mandos, eje_mastil, eje_control_receptividad,
       tiempo_vuelta_seg, colisiones, score_puntos, etapa, es_mejor_diagnostico,
       archivo_fuente, colisiones_descartadas, delta_tiempo_seg,
       delta_colisiones, delta_score, delta_serrucho`
    )
    .eq('postulante_id', postulante_id.trim())
    .order('created_at', { ascending: true });

  if (errEvals) {
    console.error('[obtenerComparativaProgreso] Error al leer evaluaciones:', {
      code: errEvals.code,
      message: errEvals.message,
    });
    return null;
  }

  const titan = ((filas ?? []) as unknown as FilaEvaluacion[]).filter(
    (f) => f.archivo_fuente && f.archivo_fuente !== 'CABINA_TABLET'
  );
  const porEtapa = new Map<EtapaEvaluacion, FilaEvaluacion>();
  for (const f of titan) porEtapa.set(normalizarEtapa(f.etapa), f);

  const fV1 = porEtapa.get('DIAG_INTENTO_1');
  if (!fV1) return null;
  const fV2 = porEtapa.get('DIAG_INTENTO_2') ?? null;
  const fFinal = porEtapa.get('FINAL') ?? null;

  const v1 = mapearIntento(fV1);
  const v2 = fV2 ? mapearIntento(fV2) : null;

  const mejorFila =
    [fV1, fV2].find((f) => f?.es_mejor_diagnostico === true) ?? fV2 ?? fV1;
  const mejorDiagnostico = mapearIntento(mejorFila);

  const deltaTiempo = fV2 ? numeroOrNull(fV2.delta_tiempo_seg) : null;
  const deltaScore = fV2 ? numeroOrNull(fV2.delta_score) : null;
  const deltaColisiones = fV2 ? numeroOrNull(fV2.delta_colisiones) : null;

  const payload: ComparativaProgreso = {
    postulanteId: postulante_id.trim(),
    v1,
    v2,
    deltaDiagnostico: {
      mejoraTiempoSeg: deltaTiempo ?? 0,
      reduccionColisiones:
        deltaColisiones !== null ? -deltaColisiones : 0,
      evolucionScore: deltaScore ?? 0,
      evaluacionReceptividad: receptividad(deltaTiempo, v1.tiempoVueltaSeg),
    },
    mejorDiagnostico,
    radarEjes: puntosRadar(mejorFila, fFinal),
  };

  if (fFinal) {
    const final = mapearIntento(fFinal);
    const scoreFinal = numeroOrNull(fFinal.score_puntos);
    const scoreMejor = numeroOrNull(mejorFila.score_puntos);
    payload.pruebaFinal = final;
    payload.deltaFinal = {
      deltaTiempoSeg: numeroOrNull(fFinal.delta_tiempo_seg),
      deltaColisiones: numeroOrNull(fFinal.delta_colisiones),
      deltaScore: numeroOrNull(fFinal.delta_score),
      deltaSerrucho: numeroOrNull(fFinal.delta_serrucho),
      mejoraTotalPorcentaje:
        scoreFinal !== null && scoreMejor
          ? Math.round(((scoreFinal - scoreMejor) / scoreMejor) * 10000) / 100
          : 0,
      aptoParaPlanta: fFinal.dictamen === 'APTO_DIRECTO',
    };
  }

  return payload;
}
