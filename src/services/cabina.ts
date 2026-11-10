'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  ASISTENCIAS_CABINA_VALIDAS,
  BONUS_SEGUNDO_INTENTO_VALIDOS,
  ETAPAS_CABINA_VALIDAS,
  PUNTAJES_EJE_VALIDOS,
  calcularDictamen,
  esBloqueSplitValido,
  esNivelAsistenciaValido,
  mapearNivelAsistenciaACabina,
} from '@/lib/cabina/dictamen';
import type {
  AlumnoTurno,
  AsistenciaCabina,
  BloqueSplit,
  EtapaEvaluacionCabina,
  EvaluacionCabinaInput,
  NivelAsistencia,
  ResultadoGuardar,
} from '@/types/cabina';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MOTIVO_HARD_FAIL = 500;
const MAX_INSTRUCTOR_LEN = 120;
const MAX_OBS_DETALLE = 2000;

const ARCHIVO_FUENTE_POR_ETAPA: Record<EtapaEvaluacionCabina, string> = {
  DIAG_INTENTO_1: 'CABINA_TABLET',
  DIAG_INTENTO_2: 'CABINA_TABLET_DIAG_2',
  FINAL: 'CABINA_TABLET_FINAL',
};

type PostulanteRel = { nombre_completo: string; dni: string };

type FilaInscripcion = {
  id: string;
  estado: string;
  ranking_orden: number;
  postulante_id: string | null;
  postulantes: PostulanteRel | PostulanteRel[] | null;
};

function normalizarTextoNullable(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function resolverAsistenciaCabina(
  nivel: NivelAsistencia | undefined,
  legacy: AsistenciaCabina | undefined
): AsistenciaCabina | null {
  if (nivel && esNivelAsistenciaValido(nivel)) {
    return mapearNivelAsistenciaACabina(nivel);
  }
  if (legacy && ASISTENCIAS_CABINA_VALIDAS.includes(legacy)) {
    return legacy;
  }
  return null;
}

/**
 * Alumnos de la cohorte activa en turno, ordenados por ranking y excluyendo los
 * descartados. Devuelve [] si no hay sesión, cohorte activa o datos.
 */
export async function obtenerAlumnosTurno(): Promise<AlumnoTurno[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: cohorte, error: errCohorte } = await supabase
    .from('cohortes')
    .select('id')
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errCohorte) {
    console.error('[obtenerAlumnosTurno] Error al buscar cohorte activa:', {
      code: errCohorte.code,
      message: errCohorte.message,
    });
    return [];
  }

  const cohorteId = (cohorte as { id: string } | null)?.id;
  if (!cohorteId) return [];

  const { data: filas, error: errFilas } = await supabase
    .from('cohorte_inscripciones')
    .select(
      'id, estado, ranking_orden, postulante_id, postulantes(nombre_completo, dni)'
    )
    .eq('cohorte_id', cohorteId)
    .neq('estado', 'DESCARTADO')
    .order('ranking_orden', { ascending: true });

  if (errFilas) {
    console.error('[obtenerAlumnosTurno] Error al listar inscripciones:', {
      code: errFilas.code,
      message: errFilas.message,
    });
    return [];
  }

  const rows = (filas ?? []) as unknown as FilaInscripcion[];
  const alumnos: AlumnoTurno[] = [];

  for (const f of rows) {
    const rel = Array.isArray(f.postulantes) ? f.postulantes[0] : f.postulantes;
    if (!rel || !f.postulante_id) continue;

    alumnos.push({
      inscripcion_id: f.id,
      postulante_id: f.postulante_id,
      nombre_completo: rel.nombre_completo,
      dni: rel.dni,
      estado: f.estado,
      ranking_orden: f.ranking_orden,
    });
  }

  return alumnos;
}

/**
 * Persiste la evaluación de cabina en la tabla singular `evaluacion_diagnostico`
 * (por etapa DIAG_INTENTO_1 | DIAG_INTENTO_2 | FINAL mediante upsert idempotente
 * sobre `(postulante_id, archivo_fuente)`) incluyendo `nivel_asistencia` y
 * `bloque_split`, y sincroniza la inscripción:
 * NO_APTO o hard-fail -> DESCARTADO; otros dictámenes conservan el estado útil
 * (o restauran DISPONIBLE si estaba descartado) limpiando `motivo_baja`.
 */
export async function registrarEvaluacionCabina(
  datos: EvaluacionCabinaInput
): Promise<ResultadoGuardar> {
  if (!datos || typeof datos !== 'object') {
    return { ok: false, error: 'Datos inválidos.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const postulanteId = normalizarTextoNullable(datos.postulante_id);
  const inscripcionId = normalizarTextoNullable(datos.inscripcion_id);
  if (
    !postulanteId ||
    !inscripcionId ||
    !UUID_RE.test(postulanteId) ||
    !UUID_RE.test(inscripcionId)
  ) {
    return { ok: false, error: 'Identificadores de evaluación inválidos.' };
  }

  const etapa: EtapaEvaluacionCabina = datos.etapa ?? 'DIAG_INTENTO_1';
  if (!ETAPAS_CABINA_VALIDAS.includes(etapa)) {
    return { ok: false, error: 'Etapa de evaluación inválida.' };
  }

  if (typeof datos.hard_fail !== 'boolean') {
    return { ok: false, error: 'Indicador de Hard-Fail inválido.' };
  }

  if (!esNivelAsistenciaValido(datos.nivel_asistencia)) {
    return { ok: false, error: 'Nivel de asistencia inválido.' };
  }

  let bloqueSplit: BloqueSplit | null = null;
  if (datos.bloque_split !== undefined && datos.bloque_split !== null) {
    if (!esBloqueSplitValido(datos.bloque_split)) {
      return { ok: false, error: 'Bloque Split 30/30 inválido.' };
    }
    bloqueSplit = datos.bloque_split;
  }

  const nivelAsistencia: NivelAsistencia = datos.nivel_asistencia;
  const asistencia = resolverAsistenciaCabina(
    nivelAsistencia,
    datos.asistencia_cabina
  );
  const bonus = datos.bonus_segundo_intento;
  const hardFail = datos.hard_fail === true;

  if (
    !PUNTAJES_EJE_VALIDOS.includes(datos.puntaje_lateralidad) ||
    !PUNTAJES_EJE_VALIDOS.includes(datos.puntaje_tacto_mandos) ||
    !PUNTAJES_EJE_VALIDOS.includes(datos.puntaje_mastil) ||
    !PUNTAJES_EJE_VALIDOS.includes(datos.puntaje_control_receptividad) ||
    !BONUS_SEGUNDO_INTENTO_VALIDOS.includes(bonus) ||
    !asistencia
  ) {
    return { ok: false, error: 'Puntajes o nivel de asistencia inválidos.' };
  }

  const motivoHardFail = hardFail
    ? normalizarTextoNullable(datos.motivo_hard_fail)?.slice(
        0,
        MAX_MOTIVO_HARD_FAIL
      ) ?? null
    : null;

  if (hardFail && !motivoHardFail) {
    return {
      ok: false,
      error: 'El motivo es obligatorio cuando se activa Hard-Fail.',
    };
  }

  // Autorización a nivel de fila (anti-IDOR): la inscripción debe existir,
  // pertenecer al postulante declarado y a la cohorte activa.
  const { data: cohorteActiva, error: errCohorteActiva } = await supabase
    .from('cohortes')
    .select('id')
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errCohorteActiva) {
    console.error(
      '[registrarEvaluacionCabina] Error al resolver cohorte activa:',
      { code: errCohorteActiva.code, message: errCohorteActiva.message }
    );
    return { ok: false, error: 'No se pudo verificar la cohorte activa.' };
  }

  const cohorteActivaId = (cohorteActiva as { id: string } | null)?.id;
  if (!cohorteActivaId) {
    return { ok: false, error: 'No hay una cohorte activa configurada.' };
  }

  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id, postulante_id, cohorte_id, estado')
    .eq('id', inscripcionId)
    .eq('postulante_id', postulanteId)
    .eq('cohorte_id', cohorteActivaId)
    .maybeSingle();

  if (errInsc) {
    console.error('[registrarEvaluacionCabina] Error al validar inscripción:', {
      code: errInsc.code,
      message: errInsc.message,
    });
    return { ok: false, error: 'Error al validar la inscripción.' };
  }
  if (!insc) {
    return {
      ok: false,
      error: 'El postulante no pertenece a la cohorte activa.',
    };
  }

  const { score_total, dictamen } = calcularDictamen(
    {
      lateralidad: datos.puntaje_lateralidad,
      tacto_mandos: datos.puntaje_tacto_mandos,
      mastil: datos.puntaje_mastil,
      control_receptividad: datos.puntaje_control_receptividad,
    },
    bonus,
    asistencia,
    hardFail
  );
  // Blindaje explícito: Hard-Fail o intervención crítica extrema guardan trazabilidad clara.
  const dictamenFinal = hardFail ? 'NO_APTO' : dictamen;

  // Cotas en el punto de confianza: tiempo acotado a [0, 36000] s.
  const tiempo =
    typeof datos.tiempo_vuelta_seg === 'number' &&
    Number.isFinite(datos.tiempo_vuelta_seg) &&
    datos.tiempo_vuelta_seg >= 0 &&
    datos.tiempo_vuelta_seg <= 36000
      ? Math.trunc(datos.tiempo_vuelta_seg)
      : null;

  // Observaciones rápidas: únicas, trim, sin vacíos, máx. 20 ítems de 200 chars.
  const obsRapidas = Array.isArray(datos.observaciones_rapidas)
    ? Array.from(
        new Set(
          datos.observaciones_rapidas
            .filter((o): o is string => typeof o === 'string')
            .map((o) => o.trim().slice(0, 200))
            .filter((o) => o.length > 0)
        )
      ).slice(0, 20)
    : null;

  const instructorEvaluador =
    normalizarTextoNullable(datos.instructor_evaluador)?.slice(
      0,
      MAX_INSTRUCTOR_LEN
    ) ??
    normalizarTextoNullable(user.email)?.slice(0, MAX_INSTRUCTOR_LEN) ??
    null;

  const observacionesDetalle =
    normalizarTextoNullable(datos.observaciones_detalle)?.slice(
      0,
      MAX_OBS_DETALLE
    ) ?? null;

  const archivoFuente = ARCHIVO_FUENTE_POR_ETAPA[etapa];

  const { error: errUpsert } = await supabase
    .from('evaluacion_diagnostico')
    .upsert(
      {
        postulante_id: postulanteId,
        etapa,
        es_mejor_diagnostico: false,
        asistencia_cabina: asistencia,
        nivel_asistencia: nivelAsistencia,
        bloque_split: bloqueSplit,
        dictamen: dictamenFinal,
        puntaje_lateralidad: datos.puntaje_lateralidad,
        puntaje_tacto_mandos: datos.puntaje_tacto_mandos,
        puntaje_mastil: datos.puntaje_mastil,
        puntaje_control_receptividad: datos.puntaje_control_receptividad,
        bonus_segundo_intento: bonus,
        score_puntos: score_total,
        tiempo_vuelta_seg: tiempo,
        hard_fail: hardFail,
        motivo_hard_fail: motivoHardFail,
        instructor_evaluador: instructorEvaluador,
        observaciones_rapidas:
          obsRapidas && obsRapidas.length > 0 ? obsRapidas : null,
        observaciones_detalle: observacionesDetalle,
        archivo_fuente: archivoFuente,
      },
      { onConflict: 'postulante_id,archivo_fuente' }
    );

  if (errUpsert) {
    console.error('[registrarEvaluacionCabina] Error al guardar evaluación:', {
      code: errUpsert.code,
      message: errUpsert.message,
    });
    return { ok: false, error: 'No se pudo guardar la evaluación.' };
  }

  const ahoraIso = new Date().toISOString();
  if (dictamenFinal === 'NO_APTO' || hardFail) {
    const motivoBaja =
      hardFail && motivoHardFail
        ? `Hard-fail en cabina (${etapa}): ${motivoHardFail}`.slice(
            0,
            MAX_MOTIVO_HARD_FAIL
          )
        : `No apto en evaluación de cabina (${etapa})`;

    const { error: errUpdate } = await supabase
      .from('cohorte_inscripciones')
      .update({
        estado: 'DESCARTADO',
        motivo_baja: motivoBaja,
        franja_id: null,
        updated_at: ahoraIso,
      })
      .eq('id', inscripcionId)
      .eq('postulante_id', postulanteId);

    if (errUpdate) {
      console.error(
        '[registrarEvaluacionCabina] Evaluación guardada, pero falló el descarte de la inscripción:',
        { code: errUpdate.code, message: errUpdate.message }
      );
    }
  } else {
    const inscActual = insc as { estado: string };
    const patchInscripcion: {
      estado?: 'DISPONIBLE';
      motivo_baja: null;
      updated_at: string;
    } = {
      motivo_baja: null,
      updated_at: ahoraIso,
    };
    if (inscActual.estado === 'DESCARTADO') {
      patchInscripcion.estado = 'DISPONIBLE';
    }

    const { error: errUpdate } = await supabase
      .from('cohorte_inscripciones')
      .update(patchInscripcion)
      .eq('id', inscripcionId)
      .eq('postulante_id', postulanteId);

    if (errUpdate) {
      console.error(
        '[registrarEvaluacionCabina] Evaluación guardada, pero falló la sincronización de inscripción:',
        { code: errUpdate.code, message: errUpdate.message }
      );
    }
  }

  revalidatePath('/cabina/evaluacion');
  revalidatePath('/gestion/cohortes');
  return { ok: true, dictamen: dictamenFinal, score: score_total };
}
