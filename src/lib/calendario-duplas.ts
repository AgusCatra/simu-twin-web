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

export const FRANJAS_OPERATIVAS: readonly FranjaCursado[] = [
  'M1_10_11',
  'M2_11_12',
  'T1_16_17',
  'T2_17_18',
] as const;

export const TOTAL_SESIONES_CICLO = 6;
export const TOTAL_DUPLAS_POR_GRUPO = 4;
export const TOTAL_SESIONES_MATRIZ = 48; // 8 duplas * 6 clases

export interface ProyeccionCohorteV2Input {
  fechaInicioTeoria: string; // YYYY-MM-DD (fecha del taller introductorio)
  fechaInicioSimulador: string; // YYYY-MM-DD (debe ser un Lunes)
  diasBloqueados?: string[]; // Array de feriados YYYY-MM-DD
  estrategiaFeriados?: 'MOVER_A_VIERNES' | 'CORRER_CALENDARIO'; // default 'MOVER_A_VIERNES'
}

export interface SesionPlanificada {
  numeroSesion: number; // 1 a 6
  grupo: GrupoCursado;
  franja: FranjaCursado;
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
 * para una cohorte V2 bajo el modelo de duplas de 16 alumnos.
 */
export function proyectarCalendarioCohorteV2(
  input: ProyeccionCohorteV2Input
): ProyeccionCohorteV2Resultado {
  const alertas: string[] = [];
  const estrategia = input.estrategiaFeriados ?? 'MOVER_A_VIERNES';
  const diasBloqueadosSet = new Set(input.diasBloqueados ?? []);

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

  // 2. Acumuladores de jornadas efectivas (6 para Grupo A y 6 para Grupo B)
  const jornadasGrupoA: InfoJornadaEfectiva[] = [];
  const jornadasGrupoB: InfoJornadaEfectiva[] = [];
  const mapaViernes = new Map<string, EstadoViernesBuffer>();

  let semana = 0;
  const maxSemanasSeguridad = 20; // Guarda contra bucles infinitos por bloqueos masivos

  while (
    (jornadasGrupoA.length < TOTAL_SESIONES_CICLO ||
      jornadasGrupoB.length < TOTAL_SESIONES_CICLO) &&
    semana < maxSemanasSeguridad
  ) {
    const lunesSemana = sumarDias(lunesInicio, semana * 7);
    const martesSemana = sumarDias(lunesSemana, 1);
    const miercolesSemana = sumarDias(lunesSemana, 2);
    const juevesSemana = sumarDias(lunesSemana, 3);
    const viernesSemana = sumarDias(lunesSemana, 4);

    const fLunes = aFechaIso(lunesSemana);
    const fMartes = aFechaIso(martesSemana);
    const fMiercoles = aFechaIso(miercolesSemana);
    const fJueves = aFechaIso(juevesSemana);
    const fViernes = aFechaIso(viernesSemana);

    const viernesHabilitado = !diasBloqueadosSet.has(fViernes);
    let grupoAsignadoViernes: GrupoCursado | null = null;
    let motivoViernes: string | undefined = undefined;

    // ── GRUPO A: Lunes ────────────────────────────────────────────────────────
    if (jornadasGrupoA.length < TOTAL_SESIONES_CICLO) {
      if (!diasBloqueadosSet.has(fLunes)) {
        jornadasGrupoA.push({
          fecha: fLunes,
          esRecuperatorioViernes: false,
          reprogramada: false,
        });
      } else {
        if (estrategia === 'MOVER_A_VIERNES' && viernesHabilitado && !grupoAsignadoViernes) {
          grupoAsignadoViernes = 'GRUPO_A';
          motivoViernes = `Feriado del Lunes (${fLunes}) absorbido en Viernes Buffer (${fViernes}) para Grupo A`;
          alertas.push(`Semana ${semana + 1}: ${motivoViernes}.`);
        } else {
          alertas.push(
            `Semana ${semana + 1}: Feriado del Lunes (${fLunes}) para Grupo A; diferido a la siguiente jornada hábil del grupo.`
          );
        }
      }
    }

    // ── GRUPO B: Martes ───────────────────────────────────────────────────────
    if (jornadasGrupoB.length < TOTAL_SESIONES_CICLO) {
      if (!diasBloqueadosSet.has(fMartes)) {
        jornadasGrupoB.push({
          fecha: fMartes,
          esRecuperatorioViernes: false,
          reprogramada: false,
        });
      } else {
        if (estrategia === 'MOVER_A_VIERNES' && viernesHabilitado && !grupoAsignadoViernes) {
          grupoAsignadoViernes = 'GRUPO_B';
          motivoViernes = `Feriado del Martes (${fMartes}) absorbido en Viernes Buffer (${fViernes}) para Grupo B`;
          alertas.push(`Semana ${semana + 1}: ${motivoViernes}.`);
        } else {
          alertas.push(
            `Semana ${semana + 1}: Feriado del Martes (${fMartes}) para Grupo B; diferido a la siguiente jornada hábil del grupo.`
          );
        }
      }
    }

    // ── GRUPO A: Miércoles ────────────────────────────────────────────────────
    if (jornadasGrupoA.length < TOTAL_SESIONES_CICLO) {
      if (!diasBloqueadosSet.has(fMiercoles)) {
        jornadasGrupoA.push({
          fecha: fMiercoles,
          esRecuperatorioViernes: false,
          reprogramada: false,
        });
      } else {
        if (estrategia === 'MOVER_A_VIERNES' && viernesHabilitado && !grupoAsignadoViernes) {
          grupoAsignadoViernes = 'GRUPO_A';
          motivoViernes = `Feriado del Miércoles (${fMiercoles}) absorbido en Viernes Buffer (${fViernes}) para Grupo A`;
          alertas.push(`Semana ${semana + 1}: ${motivoViernes}.`);
        } else {
          alertas.push(
            `Semana ${semana + 1}: Feriado del Miércoles (${fMiercoles}) para Grupo A; diferido a la siguiente jornada hábil del grupo.`
          );
        }
      }
    }

    // ── GRUPO B: Jueves ───────────────────────────────────────────────────────
    if (jornadasGrupoB.length < TOTAL_SESIONES_CICLO) {
      if (!diasBloqueadosSet.has(fJueves)) {
        jornadasGrupoB.push({
          fecha: fJueves,
          esRecuperatorioViernes: false,
          reprogramada: false,
        });
      } else {
        if (estrategia === 'MOVER_A_VIERNES' && viernesHabilitado && !grupoAsignadoViernes) {
          grupoAsignadoViernes = 'GRUPO_B';
          motivoViernes = `Feriado del Jueves (${fJueves}) absorbido en Viernes Buffer (${fViernes}) para Grupo B`;
          alertas.push(`Semana ${semana + 1}: ${motivoViernes}.`);
        } else {
          alertas.push(
            `Semana ${semana + 1}: Feriado del Jueves (${fJueves}) para Grupo B; diferido a la siguiente jornada hábil del grupo.`
          );
        }
      }
    }

    // ── VIERNES: Resolución de Buffer o Recuperatorio ─────────────────────────
    if (grupoAsignadoViernes === 'GRUPO_A') {
      jornadasGrupoA.push({
        fecha: fViernes,
        esRecuperatorioViernes: true,
        reprogramada: true,
        motivoReprogramacion: motivoViernes,
      });
      mapaViernes.set(fViernes, {
        fecha: fViernes,
        estado: 'RECUPERATORIO_FERIADO',
        sesionesReubicadas: TOTAL_DUPLAS_POR_GRUPO,
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
        sesionesReubicadas: TOTAL_DUPLAS_POR_GRUPO,
      });
    } else {
      mapaViernes.set(fViernes, {
        fecha: fViernes,
        estado: 'LIBRE',
        sesionesReubicadas: 0,
      });
    }

    semana++;
  }

  // 3. Garantizar que existan al menos los 3 viernes estándar del ciclo
  for (let s = 0; s < 3; s++) {
    const fViernesMin = aFechaIso(sumarDias(lunesInicio, s * 7 + 4));
    if (!mapaViernes.has(fViernesMin)) {
      mapaViernes.set(fViernesMin, {
        fecha: fViernesMin,
        estado: 'LIBRE',
        sesionesReubicadas: 0,
      });
    }
  }

  // Ordenar días de cada grupo cronológicamente
  jornadasGrupoA.sort((a, b) => a.fecha.localeCompare(b.fecha));
  jornadasGrupoB.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const diasEfectivosGrupoA = jornadasGrupoA.map((j) => j.fecha);
  const diasEfectivosGrupoB = jornadasGrupoB.map((j) => j.fecha);

  // 4. Determinación de Fecha de Fin de Simulador y Pase a Terreno
  // El ciclo regular cierra el Viernes de la semana 3 (3 semanas calendario exactas).
  // Si hubo corrimientos de calendario que superaron la semana 3, toma el Viernes
  // de la última semana efectiva de cursado.
  const viernesList = Array.from(mapaViernes.values()).sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );

  const viernesSemana3 = aFechaIso(sumarDias(lunesInicio, 2 * 7 + 4));
  const todasLasFechas = [...diasEfectivosGrupoA, ...diasEfectivosGrupoB].sort();
  const ultimaFechaClase = todasLasFechas[todasLasFechas.length - 1] ?? viernesSemana3;

  // Si la última clase superó el Viernes de semana 3, cerrar en el Viernes de esa semana
  let fechaFinSimulador = viernesSemana3;
  if (ultimaFechaClase > viernesSemana3) {
    const dUltima = parsearFechaUtc(ultimaFechaClase);
    const diasAlViernes = (5 - dUltima.getUTCDay() + 7) % 7;
    fechaFinSimulador = aFechaIso(sumarDias(dUltima, diasAlViernes));
  }

  const fechaPaseTerreno = calcularPrimerDiaHabilPosterior(
    fechaFinSimulador,
    diasBloqueadosSet
  );

  // 5. Construcción de la Matriz de 48 Sesiones Planificadas
  const matrizSesiones: SesionPlanificada[] = [];

  // Sesiones de Grupo A
  jornadasGrupoA.forEach((jornada, idx) => {
    const numeroSesion = idx + 1;
    const d = parsearFechaUtc(jornada.fecha);
    const diaSemana = obtenerNombreDia(d);

    FRANJAS_OPERATIVAS.forEach((franja) => {
      matrizSesiones.push({
        numeroSesion,
        grupo: 'GRUPO_A',
        franja,
        fechaProgramada: jornada.fecha,
        diaSemana,
        esRecuperatorioViernes: jornada.esRecuperatorioViernes,
        reprogramada: jornada.reprogramada,
        motivoReprogramacion: jornada.motivoReprogramacion,
      });
    });
  });

  // Sesiones de Grupo B
  jornadasGrupoB.forEach((jornada, idx) => {
    const numeroSesion = idx + 1;
    const d = parsearFechaUtc(jornada.fecha);
    const diaSemana = obtenerNombreDia(d);

    FRANJAS_OPERATIVAS.forEach((franja) => {
      matrizSesiones.push({
        numeroSesion,
        grupo: 'GRUPO_B',
        franja,
        fechaProgramada: jornada.fecha,
        diaSemana,
        esRecuperatorioViernes: jornada.esRecuperatorioViernes,
        reprogramada: jornada.reprogramada,
        motivoReprogramacion: jornada.motivoReprogramacion,
      });
    });
  });

  // Ordenar cronológicamente la matriz de sesiones
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
