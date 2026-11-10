import type {
  AsistenciaCabina,
  BloqueSplit,
  DictamenCabina,
  EtapaEvaluacionCabina,
  NivelAsistencia,
  PuntajeEje,
} from '@/types/cabina';

/**
 * Módulo puro isomórfico (sin 'use server' ni dependencias de Node): la regla de
 * dictamen de la consola de cabina es única y la comparten el backend
 * (registrarEvaluacionCabina) y el front (feedback en vivo del instructor).
 */

export const PUNTAJES_EJE_VALIDOS: readonly PuntajeEje[] = [0, 10, 20];
export const BONUS_SEGUNDO_INTENTO_VALIDOS: readonly (0 | 10)[] = [0, 10];
export const ASISTENCIAS_CABINA_VALIDAS: readonly AsistenciaCabina[] = [
  'MINIMA_AUTONOMO',
  'MEDIA',
  'ALTA',
];
export const NIVELES_ASISTENCIA_VALIDOS: readonly NivelAsistencia[] = [
  'AUTONOMO',
  'AYUDA_VERBAL',
  'INTERVENCION_CONSTANTE',
  'INTERVENCION_CRITICA',
];
export const BLOQUES_SPLIT_VALIDOS: readonly BloqueSplit[] = [
  'PILOTO_A',
  'COPILOTO_B',
  'PILOTO_B',
  'COPILOTO_A',
];
export const ETAPAS_CABINA_VALIDAS: readonly EtapaEvaluacionCabina[] = [
  'DIAG_INTENTO_1',
  'DIAG_INTENTO_2',
  'FINAL',
];

export type PuntajesEjes = {
  lateralidad: PuntajeEje;
  tacto_mandos: PuntajeEje;
  mastil: PuntajeEje;
  control_receptividad: PuntajeEje;
};

export function esNivelAsistenciaValido(valor: unknown): valor is NivelAsistencia {
  return (
    typeof valor === 'string' &&
    (NIVELES_ASISTENCIA_VALIDOS as readonly string[]).includes(valor)
  );
}

export function esBloqueSplitValido(valor: unknown): valor is BloqueSplit {
  return (
    typeof valor === 'string' &&
    (BLOQUES_SPLIT_VALIDOS as readonly string[]).includes(valor)
  );
}

/**
 * Mapea los 4 niveles granulares de asistencia docente (`tipo_asistencia_instructor`)
 * hacia la columna histórica `asistencia_cabina` (NOT NULL con CHECK legado).
 */
export function mapearNivelAsistenciaACabina(
  nivel: NivelAsistencia
): AsistenciaCabina {
  switch (nivel) {
    case 'AUTONOMO':
      return 'MINIMA_AUTONOMO';
    case 'AYUDA_VERBAL':
      return 'MEDIA';
    case 'INTERVENCION_CONSTANTE':
    case 'INTERVENCION_CRITICA':
      return 'ALTA';
  }
}

/**
 * score_total = suma de los 4 ejes (0/10/20) + bonus (0/10).
 * 1) hardFail -> NO_APTO; 2) algún eje 0 o score_total<40 -> NO_APTO;
 * 3) score_total>=60 y MINIMA_AUTONOMO -> APTO_DIRECTO;
 * 4) score_total>=60 y asistencia distinta -> APTO_OBSERVACION;
 * 5) score_total>=40 -> CONDICIONAL; 6) resto -> NO_APTO.
 */
export function calcularDictamen(
  puntajes: PuntajesEjes,
  bonus: 0 | 10,
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
