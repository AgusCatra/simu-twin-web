/**
-- =============================================================================
-- SIMUCORE TWIN · VENADO TUERTO
-- Motor Determinista de Calendario de 3 Semanas y Gestión de Feriados
--
-- Directiva Operativa ODD - Sprint 2:
-- Proyección de calendario para 16 alumnos divididos en 8 duplas pedagógicas.
--
-- Reglas de negocio:
-- 1. Ciclo cerrado: 3 semanas calendario (6 sesiones de 1 hora por alumno).
-- 2. Grupo A (8 alumnos / 4 duplas): Cursa Lunes y Miércoles (4 franjas horarias).
-- 3. Grupo B (8 alumnos / 4 duplas): Cursa Martes y Jueves (4 franjas horarias).
-- 4. Viernes Buffer:
--    - Por defecto: LIBRE (mantenimiento/diagnósticos de 20 min).
--    - Si una clase cae en feriado/asueto (diasBloqueados), el motor la absorbe
--      en el Viernes de la misma semana ('MOVER_A_VIERNES') preservando el egreso
--      a las 3 semanas exactas.
--    - Alternativa 'CORRER_CALENDARIO': extiende la fecha final al siguiente día del grupo.
-- =============================================================================
*/

import type { FranjaCursado, GrupoCursado } from '@/types/cohorte-v2';
import type { ConfiguracionCursadoCohorte } from '@/types/empleo';

export const FRANJAS_OPERATIVAS: readonly FranjaCursado[] = [
  'M1_10_11',
  'M2_11_12',
  'T1_16_17',
  'T2_17_18',
] as const;

export const FRANJAS_ESTANDAR_LABELS: readonly string[] = [
  '10:00-11:00',
  '11:00-12:00',
  '16:00-17:00',
  '17:00-18:00',
] as const;

export const CONFIGURACION_CURSADO_DEFECTO: ConfiguracionCursadoCohorte = {
  modalidad: 'DUPLAS',
  dias_grupo_a: [1, 3],
  dias_grupo_b: [2, 4],
  franjas_activas: [...FRANJAS_ESTANDAR_LABELS],
  sesiones_objetivo: 6,
  horas_teoria: 2.0,
  horas_diagnostico_y_final: 1.0,
  horas_por_sesion_simulador: 1.0,
  horas_base_practica_real: 1.5,
};

export const TOTAL_SESIONES_CICLO = 6;
export const TOTAL_DUPLAS_POR_GRUPO = 4;
export const TOTAL_SESIONES_MATRIZ = 48; // 8 duplas * 6 clases

export interface ProyeccionCohorteV2Input {
  fechaInicioTeoria: string; // YYYY-MM-DD (fecha del taller introductorio)
  fechaInicioSimulador: string; // YYYY-MM-DD (debe ser un Lunes)
  diasBloqueados?: string[]; // Array de feriados YYYY-MM-DD
  estrategiaFeriados?: 'MOVER_A_VIERNES' | 'CORRER_CALENDARIO'; // default 'MOVER_A_VIERNES'
  configuracionCursado?: ConfiguracionCursadoCohorte | null;
}

export interface SesionPlanificada {
  numeroSesion: number; // 1 a sesiones_objetivo
  grupo: GrupoCursado;
  franja: FranjaCursado;
  horarioLabel?: string;
  fechaProgramada: string; // YYYY-MM-DD
  diaSemana: string; // 'Lunes', 'Martes', etc.
  esRecuperatorioViernes: boolean;
  reprogramada: boolean;
  motivoReprogramacion?: string;
}

export interface EstadoViernesBuffer {
  fecha: string; // YYYY-MM-DD
  estado: 'LIBRE' | 'RECUPERATORIO_FERIADO';
  sesionesReubicadas: number; // 0 si libre, 4 si absorbió un grupo completo
}

export interface ProyeccionCohorteV2Resultado {
  fechaInicioSimulador: string;
  fechaFinSimulador: string;
  fechaPaseTerreno: string; // Primer día hábil posterior al fin
  diasEfectivosGrupoA: string[]; // 6 fechas
  diasEfectivosGrupoB: string[]; // 6 fechas
  viernesEstado: EstadoViernesBuffer[];
  matrizSesiones: SesionPlanificada[]; // Las 48 sesiones base (8 duplas * 6 clases)
  alertas: string[]; // Avisos operativos de feriados absorbidos o corrimientos
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers Puros de Fecha (Aislamiento de Timezone UTC)
// ─────────────────────────────────────────────────────────────────────────────

const NOMBRES_DIAS: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

/**
 * Parsea un string YYYY-MM-DD al mediodía UTC para evitar desplazamientos
 * de fecha por diferencias de huso horario local.
 */
export function parsearFechaUtc(iso: string): Date {
  const partes = iso.split('-').map(Number);
  if (partes.length !== 3 || partes.some(Number.isNaN)) {
    throw new Error(`Formato de fecha inválido: "${iso}". Se espera YYYY-MM-DD.`);
  }
  const [anio, mes, dia] = partes;
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0));
  if (
    d.getUTCFullYear() !== anio ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    throw new Error(`Fecha calendárica inexistente: "${iso}".`);
  }
  return d;
}

/** Formatea una fecha UTC al formato canónico YYYY-MM-DD. */
export function aFechaIso(d: Date): string {
  const anio = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Desplaza N días en UTC una fecha dada. */
export function sumarDias(d: Date, dias: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

/** Obtiene el nombre del día en español a partir de una fecha UTC. */
export function obtenerNombreDia(d: Date): string {
  return NOMBRES_DIAS[d.getUTCDay()] ?? 'Desconocido';
}

/**
 * Determina el primer día hábil (Lunes a Viernes no bloqueado) estrictamente
 * posterior a la fecha dada.
 */
export function calcularPrimerDiaHabilPosterior(
  fechaIso: string,
  diasBloqueados: Set<string>
): string {
  let candidata = sumarDias(parsearFechaUtc(fechaIso), 1);
  while (
    candidata.getUTCDay() === 0 || // Domingo
    candidata.getUTCDay() === 6 || // Sábado
    diasBloqueados.has(aFechaIso(candidata))
  ) {
    candidata = sumarDias(candidata, 1);
  }
  return aFechaIso(candidata);
}

/**
 * Calcula el primer Lunes estrictamente posterior a la fecha de teoría para
 * iniciar el ciclo de simulador bajo el modelo de duplas (Lunes–Viernes).
 */
export function obtenerProximoLunesPosterior(fechaTeoriaIso: string): string {
  const fechaTeoria = parsearFechaUtc(fechaTeoriaIso);
  const dia = fechaTeoria.getUTCDay();
  const diasHastaLunes = (8 - dia) % 7 || 7;
  return aFechaIso(sumarDias(fechaTeoria, diasHastaLunes));
}

export const ETIQUETA_VIERNES_BUFFER_LIBRE =
  'Viernes Buffer (Mantenimiento / Recuperatorio libre)';

export const ETIQUETA_VIERNES_RECUPERATORIO =
  'Viernes Recuperatorio (Feriado absorbido)';

/**
 * Devuelve la etiqueta operativa oficial del Viernes según si absorbió o no
 * un feriado de la semana.
 */
export function describirEstadoViernesBuffer(
  estado: EstadoViernesBuffer['estado']
): string {
  return estado === 'RECUPERATORIO_FERIADO'
    ? ETIQUETA_VIERNES_RECUPERATORIO
    : ETIQUETA_VIERNES_BUFFER_LIBRE;
}

const NOMBRES_DIAS_CORTOS: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
};

const LABEL_A_FRANJA_ESTANDAR: Record<string, FranjaCursado> = {
  '10:00-11:00': 'M1_10_11',
  '11:00-12:00': 'M2_11_12',
  '16:00-17:00': 'T1_16_17',
  '17:00-18:00': 'T2_17_18',
};

function limpiarListaDias(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const validos = raw
    .map((n) => (typeof n === 'number' ? Math.trunc(n) : Number.NaN))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  return Array.from(new Set(validos)).sort((a, b) => a - b);
}

function normalizarLabelFranja(label: string): string {
  return label.replace(/\s+/g, '').trim();
}

function sanitizarHoraConfig(val: unknown, fallback: number, max: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
    return fallback;
  }
  return Math.round(Math.min(max, val) * 10) / 10;
}

/**
 * Normaliza la configuración JSONB de `public.cohortes.configuracion_cursado`,
 * admitiendo tanto el formato nuevo (`dias_grupo_a`, `dias_grupo_b`,
 * `franjas_activas`, `sesiones_objetivo`, `horas_*`) como el default legado de migración 0009.
 */
export function normalizarConfiguracionCursado(
  raw: unknown
): ConfiguracionCursadoCohorte {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      modalidad: 'DUPLAS',
      dias_grupo_a: [...CONFIGURACION_CURSADO_DEFECTO.dias_grupo_a],
      dias_grupo_b: [...CONFIGURACION_CURSADO_DEFECTO.dias_grupo_b],
      franjas_activas: [...CONFIGURACION_CURSADO_DEFECTO.franjas_activas],
      sesiones_objetivo: CONFIGURACION_CURSADO_DEFECTO.sesiones_objetivo,
      horas_teoria: 2.0,
      horas_diagnostico_y_final: 1.0,
      horas_por_sesion_simulador: 1.0,
      horas_base_practica_real: 1.5,
    };
  }

  const obj = raw as Record<string, unknown>;
  const diasAInput = limpiarListaDias(obj.dias_grupo_a);
  const diasBInput = limpiarListaDias(obj.dias_grupo_b);
  const diasSemanaLegacy = limpiarListaDias(obj.dias_semana);

  let diasGrupoA: number[];
  let diasGrupoB: number[];

  if (diasAInput !== null || diasBInput !== null) {
    diasGrupoA = diasAInput ?? [];
    diasGrupoB = diasBInput ?? [];
  } else if (diasSemanaLegacy && diasSemanaLegacy.length > 0) {
    const aLegacy = diasSemanaLegacy.filter((d) => d === 1 || d === 3);
    const bLegacy = diasSemanaLegacy.filter((d) => d === 2 || d === 4);
    if (aLegacy.length > 0 || bLegacy.length > 0) {
      diasGrupoA = aLegacy.length > 0 ? aLegacy : diasSemanaLegacy;
      diasGrupoB = aLegacy.length > 0 ? bLegacy : [];
    } else {
      diasGrupoA = diasSemanaLegacy;
      diasGrupoB = [];
    }
  } else {
    diasGrupoA = [...CONFIGURACION_CURSADO_DEFECTO.dias_grupo_a];
    diasGrupoB = [...CONFIGURACION_CURSADO_DEFECTO.dias_grupo_b];
  }

  if (diasGrupoA.length === 0 && diasGrupoB.length === 0) {
    diasGrupoA = [...CONFIGURACION_CURSADO_DEFECTO.dias_grupo_a];
  }

  const rawFranjas = Array.isArray(obj.franjas_activas)
    ? obj.franjas_activas
    : Array.isArray(obj.franjas)
      ? obj.franjas
      : null;

  const franjasLimpias = rawFranjas
    ? Array.from(
        new Set(
          rawFranjas
            .filter((f): f is string => typeof f === 'string')
            .map((f) => normalizarLabelFranja(f))
            .filter((f) => f.length >= 3 && f.length <= 24)
        )
      ).slice(0, 4)
    : [...CONFIGURACION_CURSADO_DEFECTO.franjas_activas];

  const franjasActivas =
    franjasLimpias.length > 0
      ? franjasLimpias
      : [...CONFIGURACION_CURSADO_DEFECTO.franjas_activas];

  const sesionesRaw =
    typeof obj.sesiones_objetivo === 'number' &&
    Number.isFinite(obj.sesiones_objetivo)
      ? Math.trunc(obj.sesiones_objetivo)
      : CONFIGURACION_CURSADO_DEFECTO.sesiones_objetivo;
  const sesionesObjetivo = Math.min(24, Math.max(1, sesionesRaw));

  return {
    modalidad: 'DUPLAS',
    dias_grupo_a: diasGrupoA,
    dias_grupo_b: diasGrupoB,
    franjas_activas: franjasActivas,
    sesiones_objetivo: sesionesObjetivo,
    horas_teoria: sanitizarHoraConfig(obj.horas_teoria, 2.0, 24),
    horas_diagnostico_y_final: sanitizarHoraConfig(
      obj.horas_diagnostico_y_final,
      1.0,
      12
    ),
    horas_por_sesion_simulador: sanitizarHoraConfig(
      obj.horas_por_sesion_simulador,
      1.0,
      8
    ),
    horas_base_practica_real: sanitizarHoraConfig(
      obj.horas_base_practica_real,
      1.5,
      24
    ),
  };
}

export function formatearDiasGrupoCorto(dias: number[]): string {
  if (dias.length === 0) return 'Deshabilitado';
  return dias.map((d) => NOMBRES_DIAS_CORTOS[d] ?? `D${d}`).join(' / ');
}

export function mapearFranjasActivasACodigos(
  franjasActivas: readonly string[]
): Array<{ codigo: FranjaCursado; label: string }> {
  const fuente =
    franjasActivas.length > 0
      ? franjasActivas.slice(0, FRANJAS_OPERATIVAS.length)
      : [...FRANJAS_ESTANDAR_LABELS];

  const usados = new Set<FranjaCursado>();
  const resultado: Array<{ codigo: FranjaCursado; label: string }> = [];

  for (const labelRaw of fuente) {
    const labelNorm = normalizarLabelFranja(labelRaw);
    const estandar = LABEL_A_FRANJA_ESTANDAR[labelNorm];
    if (estandar && !usados.has(estandar)) {
      usados.add(estandar);
      resultado.push({ codigo: estandar, label: labelNorm });
      continue;
    }
    const disponible = FRANJAS_OPERATIVAS.find((f) => !usados.has(f));
    if (disponible) {
      usados.add(disponible);
      resultado.push({ codigo: disponible, label: labelNorm });
    }
  }

  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor Principal de Proyección
// ─────────────────────────────────────────────────────────────────────────────

interface InfoJornadaEfectiva {
  fecha: string;
  esRecuperatorioViernes: boolean;
  reprogramada: boolean;
  motivoReprogramacion?: string;
}

/**
 * Proyecta de manera pura y determinista el calendario oficial de cursado
 * para una cohorte V2 bajo el modelo de duplas (por defecto 16 alumnos en
 * 8 duplas, o los días/franjas/sesiones configurados dinámicamente).
 */
export function proyectarCalendarioCohorteV2(
  input: ProyeccionCohorteV2Input
): ProyeccionCohorteV2Resultado {
  const alertas: string[] = [];
  const estrategia = input.estrategiaFeriados ?? 'MOVER_A_VIERNES';
  const diasBloqueadosSet = new Set(input.diasBloqueados ?? []);
  const config = input.configuracionCursado
    ? normalizarConfiguracionCursado(input.configuracionCursado)
    : CONFIGURACION_CURSADO_DEFECTO;

  const sesionesObjetivo = config.sesiones_objetivo;
  const diasGrupoASet = new Set(config.dias_grupo_a);
  const diasGrupoBSet = new Set(config.dias_grupo_b);
  const targetGrupoA = diasGrupoASet.size > 0 ? sesionesObjetivo : 0;
  const targetGrupoB = diasGrupoBSet.size > 0 ? sesionesObjetivo : 0;
  const franjasMapeadas = mapearFranjasActivasACodigos(config.franjas_activas);

  // 1. Validar y normalizar fecha de inicio (debe ser Lunes)
  const dInicioSolicitada = parsearFechaUtc(input.fechaInicioSimulador);
  let lunesInicio = dInicioSolicitada;

  if (dInicioSolicitada.getUTCDay() !== 1) {
    const diaActual = dInicioSolicitada.getUTCDay();
    const diasAlLunes = (1 - diaActual + 7) % 7;
    lunesInicio = sumarDias(dInicioSolicitada, diasAlLunes === 0 ? 7 : diasAlLunes);
    alertas.push(
      `La fecha de inicio solicitada (${input.fechaInicioSimulador}, ${obtenerNombreDia(
        dInicioSolicitada
      )}) no es Lunes. Se ajustó automáticamente al Lunes siguiente (${aFechaIso(
        lunesInicio
      )}).`
    );
  }

  const fechaInicioNormalizada = aFechaIso(lunesInicio);

  // 2. Acumuladores de jornadas efectivas por grupo
  const jornadasGrupoA: InfoJornadaEfectiva[] = [];
  const jornadasGrupoB: InfoJornadaEfectiva[] = [];
  const mapaViernes = new Map<string, EstadoViernesBuffer>();

  let semana = 0;
  const maxSemanasSeguridad = 30;

  while (
    (jornadasGrupoA.length < targetGrupoA ||
      jornadasGrupoB.length < targetGrupoB) &&
    semana < maxSemanasSeguridad
  ) {
    const lunesSemana = sumarDias(lunesInicio, semana * 7);
    const fViernes = aFechaIso(sumarDias(lunesSemana, 4));
    const viernesOcupadoRegular =
      diasGrupoASet.has(5) || diasGrupoBSet.has(5);
    const viernesDisponibleParaBuffer =
      !diasBloqueadosSet.has(fViernes) && !viernesOcupadoRegular;

    let grupoAsignadoViernes: GrupoCursado | null = null;
    let motivoViernes: string | undefined = undefined;

    for (let diaSemanaNum = 1; diaSemanaNum <= 4; diaSemanaNum += 1) {
      const fechaObj = sumarDias(lunesSemana, diaSemanaNum - 1);
      const fDia = aFechaIso(fechaObj);
      const nombreDia = obtenerNombreDia(fechaObj);

      if (
        diasGrupoASet.has(diaSemanaNum) &&
        jornadasGrupoA.length < targetGrupoA
      ) {
        if (!diasBloqueadosSet.has(fDia)) {
          jornadasGrupoA.push({
            fecha: fDia,
            esRecuperatorioViernes: false,
            reprogramada: false,
          });
        } else if (
          estrategia === 'MOVER_A_VIERNES' &&
          viernesDisponibleParaBuffer &&
          !grupoAsignadoViernes
        ) {
          grupoAsignadoViernes = 'GRUPO_A';
          motivoViernes = `Feriado del ${nombreDia} (${fDia}) absorbido en Viernes Buffer (${fViernes}) para Grupo A`;
          alertas.push(`Semana ${semana + 1}: ${motivoViernes}.`);
        } else {
          alertas.push(
            `Semana ${semana + 1}: Feriado del ${nombreDia} (${fDia}) para Grupo A; diferido a la siguiente jornada hábil del grupo.`
          );
        }
      }

      if (
        diasGrupoBSet.has(diaSemanaNum) &&
        jornadasGrupoB.length < targetGrupoB
      ) {
        if (!diasBloqueadosSet.has(fDia)) {
          jornadasGrupoB.push({
            fecha: fDia,
            esRecuperatorioViernes: false,
            reprogramada: false,
          });
        } else if (
          estrategia === 'MOVER_A_VIERNES' &&
          viernesDisponibleParaBuffer &&
          !grupoAsignadoViernes
        ) {
          grupoAsignadoViernes = 'GRUPO_B';
          motivoViernes = `Feriado del ${nombreDia} (${fDia}) absorbido en Viernes Buffer (${fViernes}) para Grupo B`;
          alertas.push(`Semana ${semana + 1}: ${motivoViernes}.`);
        } else {
          alertas.push(
            `Semana ${semana + 1}: Feriado del ${nombreDia} (${fDia}) para Grupo B; diferido a la siguiente jornada hábil del grupo.`
          );
        }
      }
    }

    // ── VIERNES: Clase regular si fue configurada en el día 5, o Buffer/Recuperatorio ──
    if (viernesOcupadoRegular) {
      if (!diasBloqueadosSet.has(fViernes)) {
        if (diasGrupoASet.has(5) && jornadasGrupoA.length < targetGrupoA) {
          jornadasGrupoA.push({
            fecha: fViernes,
            esRecuperatorioViernes: false,
            reprogramada: false,
          });
        }
        if (diasGrupoBSet.has(5) && jornadasGrupoB.length < targetGrupoB) {
          jornadasGrupoB.push({
            fecha: fViernes,
            esRecuperatorioViernes: false,
            reprogramada: false,
          });
        }
      } else {
        alertas.push(
          `Semana ${semana + 1}: Feriado del Viernes (${fViernes}); diferido a la siguiente jornada hábil.`
        );
      }
      mapaViernes.set(fViernes, {
        fecha: fViernes,
        estado: 'LIBRE',
        sesionesReubicadas: 0,
      });
    } else if (grupoAsignadoViernes === 'GRUPO_A') {
      jornadasGrupoA.push({
        fecha: fViernes,
        esRecuperatorioViernes: true,
        reprogramada: true,
        motivoReprogramacion: motivoViernes,
      });
      mapaViernes.set(fViernes, {
        fecha: fViernes,
        estado: 'RECUPERATORIO_FERIADO',
        sesionesReubicadas: franjasMapeadas.length,
      });
    } else if (grupoAsignadoViernes === 'GRUPO_B') {
      jornadasGrupoB.push({
        fecha: fViernes,
        esRecuperatorioViernes: true,
        reprogramada: true,
        motivoReprogramacion: motivoViernes,
      });
      mapaViernes.set(fViernes, {
        fecha: fViernes,
        estado: 'RECUPERATORIO_FERIADO',
        sesionesReubicadas: franjasMapeadas.length,
      });
    } else {
      mapaViernes.set(fViernes, {
        fecha: fViernes,
        estado: 'LIBRE',
        sesionesReubicadas: 0,
      });
    }

    semana += 1;
  }

  // 3. Garantizar al menos 3 viernes estándar cuando la cohorte usa esquema base (>= 3 semanas)
  if (!input.configuracionCursado) {
    for (let s = 0; s < 3; s += 1) {
      const fViernesMin = aFechaIso(sumarDias(lunesInicio, s * 7 + 4));
      if (!mapaViernes.has(fViernesMin)) {
        mapaViernes.set(fViernesMin, {
          fecha: fViernesMin,
          estado: 'LIBRE',
          sesionesReubicadas: 0,
        });
      }
    }
  }

  // Ordenar días de cada grupo cronológicamente
  jornadasGrupoA.sort((a, b) => a.fecha.localeCompare(b.fecha));
  jornadasGrupoB.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const diasEfectivosGrupoA = jornadasGrupoA.map((j) => j.fecha);
  const diasEfectivosGrupoB = jornadasGrupoB.map((j) => j.fecha);

  // 4. Determinación de Fecha de Fin de Simulador y Pase a Terreno
  const viernesSemana3 = aFechaIso(sumarDias(lunesInicio, 2 * 7 + 4));
  const todasLasFechas = [...diasEfectivosGrupoA, ...diasEfectivosGrupoB].sort();
  const ultimaFechaClase =
    todasLasFechas[todasLasFechas.length - 1] ?? viernesSemana3;

  const dUltima = parsearFechaUtc(ultimaFechaClase);
  const diasAlViernesUltima = (5 - dUltima.getUTCDay() + 7) % 7;
  const viernesUltimaClase = aFechaIso(sumarDias(dUltima, diasAlViernesUltima));

  const fechaFinSimulador = input.configuracionCursado
    ? viernesUltimaClase
    : ultimaFechaClase > viernesSemana3
      ? viernesUltimaClase
      : viernesSemana3;

  const viernesList = Array.from(mapaViernes.values())
    .filter((v) => v.fecha <= fechaFinSimulador)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const fechaPaseTerreno = calcularPrimerDiaHabilPosterior(
    fechaFinSimulador,
    diasBloqueadosSet
  );

  // 5. Construcción de la Matriz de Sesiones Planificadas
  const matrizSesiones: SesionPlanificada[] = [];

  jornadasGrupoA.forEach((jornada, idx) => {
    const numeroSesion = idx + 1;
    const d = parsearFechaUtc(jornada.fecha);
    const diaSemana = obtenerNombreDia(d);

    franjasMapeadas.forEach(({ codigo, label }) => {
      matrizSesiones.push({
        numeroSesion,
        grupo: 'GRUPO_A',
        franja: codigo,
        horarioLabel: label,
        fechaProgramada: jornada.fecha,
        diaSemana,
        esRecuperatorioViernes: jornada.esRecuperatorioViernes,
        reprogramada: jornada.reprogramada,
        motivoReprogramacion: jornada.motivoReprogramacion,
      });
    });
  });

  jornadasGrupoB.forEach((jornada, idx) => {
    const numeroSesion = idx + 1;
    const d = parsearFechaUtc(jornada.fecha);
    const diaSemana = obtenerNombreDia(d);

    franjasMapeadas.forEach(({ codigo, label }) => {
      matrizSesiones.push({
        numeroSesion,
        grupo: 'GRUPO_B',
        franja: codigo,
        horarioLabel: label,
        fechaProgramada: jornada.fecha,
        diaSemana,
        esRecuperatorioViernes: jornada.esRecuperatorioViernes,
        reprogramada: jornada.reprogramada,
        motivoReprogramacion: jornada.motivoReprogramacion,
      });
    });
  });

  matrizSesiones.sort((a, b) => {
    const cmpFecha = a.fechaProgramada.localeCompare(b.fechaProgramada);
    if (cmpFecha !== 0) return cmpFecha;
    return a.franja.localeCompare(b.franja);
  });

  return {
    fechaInicioSimulador: fechaInicioNormalizada,
    fechaFinSimulador,
    fechaPaseTerreno,
    diasEfectivosGrupoA,
    diasEfectivosGrupoB,
    viernesEstado: viernesList,
    matrizSesiones,
    alertas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo Determinista de Grupos A/B y Duplas 1..8 (Modelo 16 Alumnos)
// ─────────────────────────────────────────────────────────────────────────────

export interface DuplaPlanificadaItem {
  duplaNumero: number; // 1..8
  grupo: GrupoCursado; // 'GRUPO_A' (1..4) | 'GRUPO_B' (5..8)
  diasLabel: string; // 'Lun / Mié' | 'Mar / Jue'
  franja: FranjaCursado;
  horarioLabel: string;
  puestoDesde: number;
  puestoHasta: number;
  integrantesPrevistos: number; // 0 | 1 | 2 según cupoAlumnos
}

export interface ResumenGruposYDuplas {
  cupoTotal: number;
  capacidadBaseDuplas: number;
  titularesEnDuplas: number;
  cuposReserva: number;
  totalDuplasActivas: number;
  grupoACantidad: number;
  grupoBCantidad: number;
  duplas: DuplaPlanificadaItem[];
}

/**
 * Calcula de forma determinista la distribución de Grupos A y B y sus duplas
 * respetando la configuración dinámica de días y franjas activas.
 */
export function calcularEstructuraGruposYDuplasDinamica(
  cupoTotalInput: number,
  configRaw?: ConfiguracionCursadoCohorte | null
): ResumenGruposYDuplas {
  const config = configRaw
    ? normalizarConfiguracionCursado(configRaw)
    : CONFIGURACION_CURSADO_DEFECTO;
  const franjasMapeadas = mapearFranjasActivasACodigos(config.franjas_activas);
  const tieneGrupoA = config.dias_grupo_a.length > 0;
  const tieneGrupoB = config.dias_grupo_b.length > 0;
  const gruposActivos: Array<{
    grupo: GrupoCursado;
    diasLabel: string;
  }> = [];

  if (tieneGrupoA) {
    gruposActivos.push({
      grupo: 'GRUPO_A',
      diasLabel: formatearDiasGrupoCorto(config.dias_grupo_a),
    });
  }
  if (tieneGrupoB) {
    gruposActivos.push({
      grupo: 'GRUPO_B',
      diasLabel: formatearDiasGrupoCorto(config.dias_grupo_b),
    });
  }
  if (gruposActivos.length === 0) {
    gruposActivos.push({
      grupo: 'GRUPO_A',
      diasLabel: formatearDiasGrupoCorto(CONFIGURACION_CURSADO_DEFECTO.dias_grupo_a),
    });
  }

  const slotsTotales = gruposActivos.length * franjasMapeadas.length;
  const capacidadBaseDuplas = slotsTotales * 2;
  const cupoTotal =
    Number.isInteger(cupoTotalInput) && cupoTotalInput > 0
      ? Math.min(200, cupoTotalInput)
      : capacidadBaseDuplas;

  const duplas: DuplaPlanificadaItem[] = [];
  let idxGlobal = 0;

  for (const g of gruposActivos) {
    for (const f of franjasMapeadas) {
      const duplaNumero = idxGlobal + 1;
      const puestoDesde = idxGlobal * 2 + 1;
      const puestoHasta = idxGlobal * 2 + 2;
      const integrantesPrevistos = Math.max(
        0,
        Math.min(2, cupoTotal - (puestoDesde - 1))
      );

      duplas.push({
        duplaNumero,
        grupo: g.grupo,
        diasLabel: g.diasLabel,
        franja: f.codigo,
        horarioLabel: f.label,
        puestoDesde,
        puestoHasta,
        integrantesPrevistos,
      });
      idxGlobal += 1;
    }
  }

  const grupoACantidad = duplas
    .filter((d) => d.grupo === 'GRUPO_A')
    .reduce((acc, d) => acc + d.integrantesPrevistos, 0);
  const grupoBCantidad = duplas
    .filter((d) => d.grupo === 'GRUPO_B')
    .reduce((acc, d) => acc + d.integrantesPrevistos, 0);

  return {
    cupoTotal,
    capacidadBaseDuplas,
    titularesEnDuplas: grupoACantidad + grupoBCantidad,
    cuposReserva: Math.max(0, cupoTotal - capacidadBaseDuplas),
    totalDuplasActivas: duplas.filter((d) => d.integrantesPrevistos > 0).length,
    grupoACantidad,
    grupoBCantidad,
    duplas,
  };
}

/**
 * Calcula de forma determinista la distribución de Grupos A (Lun/Mié, Duplas 1..4)
 * y B (Mar/Jue, Duplas 5..8) para un cupo dado bajo el régimen de 8 duplas (16 alumnos).
 */
export function calcularEstructuraGruposYDuplas(
  cupoTotalInput: number
): ResumenGruposYDuplas {
  return calcularEstructuraGruposYDuplasDinamica(cupoTotalInput, null);
}

