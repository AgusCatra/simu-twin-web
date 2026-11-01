import type { AsistenciaCabina, DictamenCabina } from '@/types/cabina';

/**
 * Módulo puro isomórfico (sin 'use server' ni dependencias de Node): la regla de
 * dictamen de la consola de cabina es única y la comparten el backend
 * (registrarEvaluacionCabina) y el front (feedback en vivo del instructor).
 */

export type PuntajesEjes = {
  lateralidad: number;
  tacto_mandos: number;
  mastil: number;
  control_receptividad: number;
};

/**
 * score_total = suma de los 4 ejes (0/10/20) + bonus (0/10).
 * 1) hardFail -> NO_APTO; 2) algún eje 0 o score_total<40 -> NO_APTO;
 * 3) score_total>=60 y MINIMA_AUTONOMO -> APTO_DIRECTO;
 * 4) score_total>=60 y asistencia distinta -> APTO_OBSERVACION;
 * 5) score_total>=40 -> CONDICIONAL; 6) resto -> NO_APTO.
 */
export function calcularDictamen(
  puntajes: PuntajesEjes,
  bonus: number,
  asistencia: AsistenciaCabina,
  hardFail: boolean
): { score_total: number; dictamen: DictamenCabina } {
  const score_total =
    puntajes.lateralidad +
    puntajes.tacto_mandos +
    puntajes.mastil +
    puntajes.control_receptividad +
    bonus;

  const hayCero =
    puntajes.lateralidad === 0 ||
    puntajes.tacto_mandos === 0 ||
    puntajes.mastil === 0 ||
    puntajes.control_receptividad === 0;

  let dictamen: DictamenCabina;
  if (hardFail) {
    dictamen = 'NO_APTO';
  } else if (hayCero || score_total < 40) {
    dictamen = 'NO_APTO';
  } else if (score_total >= 60 && asistencia === 'MINIMA_AUTONOMO') {
    dictamen = 'APTO_DIRECTO';
  } else if (score_total >= 60) {
    dictamen = 'APTO_OBSERVACION';
  } else if (score_total >= 40) {
    dictamen = 'CONDICIONAL';
  } else {
    dictamen = 'NO_APTO';
  }

  return { score_total, dictamen };
}
