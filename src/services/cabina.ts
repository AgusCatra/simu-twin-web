'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { calcularDictamen } from '@/lib/cabina/dictamen';
import type {
  AlumnoTurno,
  AsistenciaCabina,
  EvaluacionCabinaInput,
  ResultadoGuardar,
} from '@/types/cabina';

const PUNTAJES_VALIDOS: readonly number[] = [0, 10, 20];
const BONUS_VALIDOS: readonly number[] = [0, 10];
const ASISTENCIAS_VALIDAS: readonly AsistenciaCabina[] = [
  'MINIMA_AUTONOMO',
  'MEDIA',
  'ALTA',
];

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
 * Persiste la evaluación de cabina con lista blanca explícita de columnas (nunca
 * spread del DTO) y aplica el mapeo de estado sobre la inscripción: NO_APTO o
 * hard-fail -> DESCARTADO; APTO_* -> no se toca la inscripción.
 */
export async function registrarEvaluacionCabina(
  datos: EvaluacionCabinaInput
): Promise<ResultadoGuardar> {
  if (!datos) return { ok: false, error: 'Datos inválidos' };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida' };

  const postulanteId = normalizarTextoNullable(datos.postulante_id);
  const inscripcionId = normalizarTextoNullable(datos.inscripcion_id);
  if (!postulanteId || !inscripcionId) {
    return { ok: false, error: 'Datos inválidos' };
  }

  const asistencia = datos.asistencia_cabina;
  const bonus = datos.bonus_segundo_intento;
  const hardFail = datos.hard_fail === true;

  if (
    !PUNTAJES_VALIDOS.includes(datos.puntaje_lateralidad) ||
    !PUNTAJES_VALIDOS.includes(datos.puntaje_tacto_mandos) ||
    !PUNTAJES_VALIDOS.includes(datos.puntaje_mastil) ||
    !PUNTAJES_VALIDOS.includes(datos.puntaje_control_receptividad) ||
    !BONUS_VALIDOS.includes(bonus) ||
    !ASISTENCIAS_VALIDAS.includes(asistencia)
  ) {
    return { ok: false, error: 'Datos inválidos' };
  }

  // FIX B2 · Autorización a nivel de fila (anti-IDOR): la inscripción debe
  // existir, pertenecer al postulante declarado y a la cohorte activa. Con RLS
  // USING(true) cualquier sesión podría escribir una inscripción arbitraria.
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
    return { ok: false, error: 'Datos inválidos' };
  }

  const cohorteActivaId = (cohorteActiva as { id: string } | null)?.id;
  if (!cohorteActivaId) return { ok: false, error: 'Datos inválidos' };

  const { data: insc, error: errInsc } = await supabase
    .from('cohorte_inscripciones')
    .select('id, postulante_id, cohorte_id')
    .eq('id', inscripcionId)
    .eq('postulante_id', postulanteId)
    .eq('cohorte_id', cohorteActivaId)
    .maybeSingle();

  if (errInsc) {
    console.error('[registrarEvaluacionCabina] Error al validar inscripción:', {
      code: errInsc.code,
      message: errInsc.message,
    });
    return { ok: false, error: 'Datos inválidos' };
  }
  if (!insc) return { ok: false, error: 'Datos inválidos' };

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

  // FIX B7 · Cotas en el punto de confianza: tiempo acotado a [0, 36000] s.
  const tiempo =
    typeof datos.tiempo_vuelta_seg === 'number' &&
    Number.isFinite(datos.tiempo_vuelta_seg) &&
    datos.tiempo_vuelta_seg >= 0 &&
    datos.tiempo_vuelta_seg <= 36000
      ? Math.trunc(datos.tiempo_vuelta_seg)
      : null;

  // FIX B7 · Observaciones rápidas: trim, sin vacíos, máx. 20 ítems de 200 chars.
  const obsRapidas = Array.isArray(datos.observaciones_rapidas)
    ? datos.observaciones_rapidas
        .filter((o): o is string => typeof o === 'string')
        .map((o) => o.trim().slice(0, 200))
        .filter((o) => o.length > 0)
        .slice(0, 20)
    : null;

  const { error: errInsert } = await supabase
    .from('evaluacion_diagnostico')
    .insert({
      postulante_id: postulanteId,
      asistencia_cabina: asistencia,
      dictamen,
      puntaje_lateralidad: datos.puntaje_lateralidad,
      puntaje_tacto_mandos: datos.puntaje_tacto_mandos,
      puntaje_mastil: datos.puntaje_mastil,
      puntaje_control_receptividad: datos.puntaje_control_receptividad,
      bonus_segundo_intento: bonus,
      score_puntos: score_total,
      tiempo_vuelta_seg: tiempo,
      hard_fail: hardFail,
      // FIX B1 · El motivo solo persiste si hay hard-fail activo.
      motivo_hard_fail: hardFail
        ? normalizarTextoNullable(datos.motivo_hard_fail)
        : null,
      instructor_evaluador: normalizarTextoNullable(datos.instructor_evaluador),
      observaciones_rapidas: obsRapidas && obsRapidas.length > 0 ? obsRapidas : null,
      observaciones_detalle: normalizarTextoNullable(datos.observaciones_detalle),
      archivo_fuente: 'CABINA_TABLET',
    });

  if (errInsert) {
    console.error('[registrarEvaluacionCabina] Error al guardar evaluación:', {
      code: errInsert.code,
      message: errInsert.message,
    });
    return { ok: false, error: 'No se pudo guardar la evaluación.' };
  }

  if (dictamen === 'NO_APTO' || hardFail) {
    const { error: errUpdate } = await supabase
      .from('cohorte_inscripciones')
      .update({
        estado: 'DESCARTADO',
        motivo_baja: 'No apto en evaluación de cabina',
        franja_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inscripcionId);

    if (errUpdate) {
      console.error(
        '[registrarEvaluacionCabina] Evaluación guardada, pero falló el descarte de la inscripción:',
        { code: errUpdate.code, message: errUpdate.message }
      );
    }
  }

  revalidatePath('/cabina/evaluacion');
  return { ok: true, dictamen, score: score_total };
}
