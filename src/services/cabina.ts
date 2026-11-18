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
  CohorteCabinaOpcion,
  DatosConsolaCabina,
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

const IDS_SIMULADOR_AUTOELEVADOR = ['autoelevador', 'SIM-01'] as const;

type ClienteSupabaseServidor = Awaited<ReturnType<typeof createClient>>;

async function sincronizarSimuladorAutoelevador(
  supabase: ClienteSupabaseServidor,
  enOperacion: boolean
): Promise<boolean> {
  const { data: filasRaw, error: errSelect } = await supabase
    .from('simuladores')
    .select('id, estado')
    .in('id', [...IDS_SIMULADOR_AUTOELEVADOR])
    .returns<Array<{ id: string; estado: string | null }>>();

  if (errSelect) {
    console.error('[cabina] Error al leer simulador de autoelevador:', {
      code: errSelect.code,
      message: errSelect.message,
    });
    return false;
  }

  const filas = filasRaw ?? [];
  if (filas.length === 0) return false;

  const ahoraIso = new Date().toISOString();
  let actualizadoAlguno = false;
  for (const fila of filas) {
    if (fila.estado === 'mantenimiento') continue;

    const patch: {
      estado: 'en_operacion' | 'libre';
      actualizado_el: string;
      actividad_actual_id?: null;
    } = enOperacion
      ? {
          estado: 'en_operacion',
          actualizado_el: ahoraIso,
        }
      : {
          estado: 'libre',
          actividad_actual_id: null,
          actualizado_el: ahoraIso,
        };

    const { error: errUpdate } = await supabase
      .from('simuladores')
      .update(patch)
      .eq('id', fila.id);

    if (errUpdate) {
      console.error('[cabina] Error al actualizar estado SIM-01:', {
        id: fila.id,
        code: errUpdate.code,
        message: errUpdate.message,
      });
    } else {
      actualizadoAlguno = true;
    }
  }

  return actualizadoAlguno;
}

/**
 * Conmuta en tiempo real el estado de SIM-01 (`autoelevador`) en `public.simuladores`
 * desde la Consola Viva de Cabina para reflejar su operación en el Gemelo Digital 3D.
 */
export async function conmutarSimuladorAutoelevadorCabina(
  enOperacion: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (typeof enOperacion !== 'boolean') {
    return { ok: false, error: 'Estado de simulador inválido.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión no válida.' };

  const ok = await sincronizarSimuladorAutoelevador(supabase, enOperacion);
  if (!ok) {
    return {
      ok: false,
      error: 'No se pudo actualizar SIM-01 (verificá que no esté en mantenimiento).',
    };
  }

  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/registro-actividades');
  return { ok: true };
}

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
      cohorte_id: cohorteId,
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

const FRANJA_HORARIO_CORTO: Record<string, string> = {
  M1_10_11: '10:00–11:00',
  M2_11_12: '11:00–12:00',
  T1_16_17: '16:00–17:00',
  T2_17_18: '17:00–18:00',
};

/**
 * Carga cohortes disponibles, sus alumnos no descartados y duplas activas
 * para el flujo progresivo de 3 toques de /cabina/evaluacion (Modo Tablet).
 */
export async function obtenerDatosConsolaCabina(): Promise<DatosConsolaCabina> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { cohortes: [], alumnosPorCohorte: {} };
  }

  const [
    { data: filasCohortes, error: errCohortes },
    { data: filasInscripciones, error: errInsc },
    { data: filasDuplas },
  ] = await Promise.all([
    supabase
      .from('cohortes')
      .select('id, codigo, nombre, estado, created_at')
      .order('created_at', { ascending: false })
      .returns<
        Array<{
          id: string;
          codigo: string;
          nombre: string;
          estado: string | null;
          created_at: string | null;
        }>
      >(),
    supabase
      .from('cohorte_inscripciones')
      .select(
        'id, cohorte_id, estado, ranking_orden, postulante_id, postulantes(nombre_completo, dni)'
      )
      .neq('estado', 'DESCARTADO')
      .order('ranking_orden', { ascending: true }),
    supabase
      .from('duplas_cabina')
      .select('cohorte_id, grupo, franja, alumno_1_id, alumno_2_id, activo')
      .eq('activo', true)
      .returns<
        Array<{
          cohorte_id: string;
          grupo: string;
          franja: string;
          alumno_1_id: string;
          alumno_2_id: string;
          activo: boolean | null;
        }>
      >(),
  ]);

  if (errCohortes || errInsc) {
    console.error('[obtenerDatosConsolaCabina] Error de lectura:', {
      errCohortes: errCohortes?.message ?? null,
      errInsc: errInsc?.message ?? null,
    });
    return { cohortes: [], alumnosPorCohorte: {} };
  }

  type FilaInscMulti = FilaInscripcion & { cohorte_id: string };
  const inscRows = (filasInscripciones ?? []) as unknown as FilaInscMulti[];

  const nombrePorPostulante = new Map<string, string>();
  const alumnosPorCohorte: Record<string, AlumnoTurno[]> = {};

  for (const f of inscRows) {
    const rel = Array.isArray(f.postulantes) ? f.postulantes[0] : f.postulantes;
    if (!rel || !f.postulante_id || !f.cohorte_id) continue;
    nombrePorPostulante.set(f.postulante_id, rel.nombre_completo);
    if (!alumnosPorCohorte[f.cohorte_id]) {
      alumnosPorCohorte[f.cohorte_id] = [];
    }
    alumnosPorCohorte[f.cohorte_id].push({
      cohorte_id: f.cohorte_id,
      inscripcion_id: f.id,
      postulante_id: f.postulante_id,
      nombre_completo: rel.nombre_completo,
      dni: rel.dni,
      estado: f.estado,
      ranking_orden: f.ranking_orden,
    });
  }

  const duplaMeta = new Map<
    string,
    { dupla_label: string; companero_nombre: string | null }
  >();
  for (const d of filasDuplas ?? []) {
    const gLabel = d.grupo === 'GRUPO_B' ? 'Grupo B' : 'Grupo A';
    const hLabel = FRANJA_HORARIO_CORTO[d.franja] ?? d.franja;
    const etiqueta = `${gLabel} · ${hLabel}`;
    duplaMeta.set(`${d.cohorte_id}::${d.alumno_1_id}`, {
      dupla_label: etiqueta,
      companero_nombre: nombrePorPostulante.get(d.alumno_2_id) ?? null,
    });
    duplaMeta.set(`${d.cohorte_id}::${d.alumno_2_id}`, {
      dupla_label: etiqueta,
      companero_nombre: nombrePorPostulante.get(d.alumno_1_id) ?? null,
    });
  }

  for (const [cid, lista] of Object.entries(alumnosPorCohorte)) {
    for (const a of lista) {
      const meta = duplaMeta.get(`${cid}::${a.postulante_id}`);
      if (meta) {
        a.dupla_label = meta.dupla_label;
        a.companero_nombre = meta.companero_nombre;
      }
    }
  }

  const pesoEstado = (e: string | null): number => {
    if (e === 'activa') return 0;
    if (e === 'borrador') return 1;
    return 2;
  };

  const cohortes: CohorteCabinaOpcion[] = [...(filasCohortes ?? [])]
    .sort((a, b) => pesoEstado(a.estado) - pesoEstado(b.estado))
    .map((c) => ({
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      estado: c.estado ?? 'activa',
      total_alumnos: (alumnosPorCohorte[c.id] ?? []).length,
    }));

  return { cohortes, alumnosPorCohorte };
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
  const decisionManual = datos.decision_manual_t0 ?? null;
  const descartePorDecision =
    decisionManual === 'RECHAZADO' ||
    (decisionManual === null && (dictamenFinal === 'NO_APTO' || hardFail));

  if (descartePorDecision) {
    const motivoBaja =
      decisionManual === 'RECHAZADO'
        ? `Rechazado por decisión manual del instructor (${etapa})`
        : hardFail && motivoHardFail
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

  if (decisionManual) {
    await supabase.from('evaluacion_diagnostico').upsert(
      {
        postulante_id: postulanteId,
        etapa: 'DIAG_INTENTO_1',
        es_mejor_diagnostico: false,
        archivo_fuente: 'DECISION_INSTRUCTOR_COHORTE',
        asistencia_cabina: asistencia,
        dictamen:
          decisionManual === 'RECHAZADO'
            ? 'NO_APTO'
            : decisionManual === 'PENDIENTE'
              ? 'CONDICIONAL'
              : 'APTO_DIRECTO',
        instructor_evaluador: instructorEvaluador,
        observaciones_detalle: observacionesDetalle,
        telemetria_metricas: {
          tipo: 'DECISION_INSTRUCTOR',
          cohorte_id: cohorteActivaId,
          decision_t0: decisionManual,
          observacion_decision_t0: observacionesDetalle,
          horas_refuerzo_simulador: 0,
          asistio_teoria: true,
        },
      },
      { onConflict: 'postulante_id,archivo_fuente' }
    );
  }

  // Refleja la práctica activa de autoelevador en SIM-01 (sin sumar tiempo de vuelta al odómetro).
  await sincronizarSimuladorAutoelevador(supabase, true);

  revalidatePath('/cabina/evaluacion');
  revalidatePath('/gestion/cohortes');
  revalidatePath('/admin');
  revalidatePath('/admin/registro-actividades');
  revalidatePath('/');
  return { ok: true, dictamen: dictamenFinal, score: score_total };
}
