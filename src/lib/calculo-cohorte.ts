/**
 * Motor de calendario dinámico de cohorte (módulo puro, sin 'use server').
 *
 * Regla operativa del Centro de Simuladores:
 * - Capacidad por día = 7 franjas * 3 puestos = 21 alumnos/día.
 * - Cupo <= 21 titulares: 6 jornadas hábiles de simulador (fijo).
 * - Cupo > 21: jornadas = ceil((cupo * horasRequeridas) / 21).
 * - Días hábiles de simulador: Lunes a Jueves (se saltan Viernes=5,
 *   Sábado=6 y Domingo=0 de forma estricta).
 * - fechaInicioSim: primer día hábil posterior a la fecha de teoría.
 * - fechaPasePlanta: primer día hábil posterior al fin del simulador.
 *
 * Compartido entre el Server Action (persistencia en `cohortes`) y la
 * CabeceraConfiguracion (badge de proyección en vivo antes de guardar).
 */

export const CAPACIDAD_ALUMNOS_DIA = 21; // 7 franjas * 3 puestos
const JORNADAS_MINIMAS = 6;
const DIAS_NO_HABILES: readonly number[] = [0, 5, 6]; // Domingo, Viernes, Sábado

export interface InputProyeccionCohorte {
  /** Fecha de teoría en formato YYYY-MM-DD. */
  fechaTeoria: string;
  cupoTitulares: number;
  /** Horas de simulador requeridas por titular. Default 6. */
  horasRequeridas?: number;
}

export interface ProyeccionCohorte {
  /** YYYY-MM-DD · primer día hábil (Lun-Jue) posterior a la teoría. */
  fechaInicioSim: string;
  /** YYYY-MM-DD[] · todas las jornadas de simulador en orden. */
  jornadasSimulador: string[];
  /** YYYY-MM-DD · última jornada de simulador. */
  fechaFinSim: string;
  /** YYYY-MM-DD · primer día hábil (Lun-Jue) posterior al fin del simulador. */
  fechaPasePlanta: string;
  /** Cantidad de jornadas proyectadas. */
  cantJornadas: number;
}

function esDiaHabilSimulador(fecha: Date): boolean {
  return !DIAS_NO_HABILES.includes(fecha.getDay());
}

/** Corre una copia de la fecha N días hacia adelante. */
function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha.getTime());
  copia.setDate(copia.getDate() + dias);
  return copia;
}

/** Devuelve la primera fecha hábil (Lun-Jue) estrictamente posterior. */
function siguienteDiaHabil(fecha: Date): Date {
  let candidata = sumarDias(fecha, 1);
  while (!esDiaHabilSimulador(candidata)) {
    candidata = sumarDias(candidata, 1);
  }
  return candidata;
}

/** YYYY-MM-DD en hora local (sin corrimientos por timezone al persistir DATE). */
export function aFechaIso(d: Date): string {
  const mes = `${d.getMonth() + 1}`.padStart(2, '0');
  const dia = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function proyectarCohorteDinamica(
  input: InputProyeccionCohorte
): ProyeccionCohorte {
  const horasRequeridas = input.horasRequeridas ?? 6;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaTeoria)) {
    throw new Error('fechaTeoria inválida: se espera YYYY-MM-DD');
  }
  const [anio, mes, dia] = input.fechaTeoria.split('-').map(Number);
  const teoria = new Date(anio, mes - 1, dia);
  if (
    teoria.getFullYear() !== anio ||
    teoria.getMonth() !== mes - 1 ||
    teoria.getDate() !== dia
  ) {
    throw new Error('fechaTeoria inválida: la fecha no existe');
  }
  if (
    !Number.isInteger(input.cupoTitulares) ||
    input.cupoTitulares <= 0 ||
    input.cupoTitulares > 200
  ) {
    throw new Error('cupoTitulares inválido: entero entre 1 y 200');
  }
  if (!(horasRequeridas > 0) || horasRequeridas > 100) {
    throw new Error('horasRequeridas inválido');
  }

  const cantJornadas =
    input.cupoTitulares <= CAPACIDAD_ALUMNOS_DIA
      ? JORNADAS_MINIMAS
      : Math.ceil(
          (input.cupoTitulares * horasRequeridas) / CAPACIDAD_ALUMNOS_DIA
        );

  const fechaInicio = siguienteDiaHabil(teoria);

  const jornadas: Date[] = [fechaInicio];
  while (jornadas.length < cantJornadas) {
    jornadas.push(siguienteDiaHabil(jornadas[jornadas.length - 1]));
  }

  const fechaFin = jornadas[jornadas.length - 1];

  return {
    fechaInicioSim: aFechaIso(fechaInicio),
    jornadasSimulador: jornadas.map(aFechaIso),
    fechaFinSim: aFechaIso(fechaFin),
    fechaPasePlanta: aFechaIso(siguienteDiaHabil(fechaFin)),
    cantJornadas,
  };
}
