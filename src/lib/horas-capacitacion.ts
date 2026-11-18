import type {
  ConfiguracionCursadoCohorte,
  PracticaRealItem,
} from '@/types/empleo';

/**
 * Motor puro de cómputo de Carga Horaria de Capacitación y Horas-Máquina.
 *
 * REGLA ESTRICTA DE NEGOCIO:
 * Nunca utiliza `tiempo_vuelta_seg` / duración del PDF del simulador para
 * computar las horas de formación del alumno ni el odómetro de SIM-01.
 * En régimen de duplas, cada turno de 1 hora acredita 1.0 h completa a CADA
 * alumno presente (piloto + copiloto observador/asistido) y 1.0 h reloj de uso
 * físico al simulador (si al menos 1 alumno de la dupla estuvo PRESENTE).
 */

export interface ParametrosHorasCohorte {
  horas_teoria: number;
  horas_diagnostico_y_final: number;
  horas_por_sesion_simulador: number;
  horas_base_practica_real: number;
}

export const DEFAULTS_HORAS_COHORTE: ParametrosHorasCohorte = {
  horas_teoria: 2.0,
  horas_diagnostico_y_final: 1.0,
  horas_por_sesion_simulador: 1.0,
  horas_base_practica_real: 1.5,
};

function sanitizarHoras(valor: unknown, fallback: number, max = 40): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
    return fallback;
  }
  return Math.round(Math.min(max, valor) * 10) / 10;
}

export function resolverParametrosHoras(
  cfg?: Partial<ConfiguracionCursadoCohorte> | null
): ParametrosHorasCohorte {
  return {
    horas_teoria: sanitizarHoras(
      cfg?.horas_teoria,
      DEFAULTS_HORAS_COHORTE.horas_teoria,
      24
    ),
    horas_diagnostico_y_final: sanitizarHoras(
      cfg?.horas_diagnostico_y_final,
      DEFAULTS_HORAS_COHORTE.horas_diagnostico_y_final,
      12
    ),
    horas_por_sesion_simulador: sanitizarHoras(
      cfg?.horas_por_sesion_simulador,
      DEFAULTS_HORAS_COHORTE.horas_por_sesion_simulador,
      8
    ),
    horas_base_practica_real: sanitizarHoras(
      cfg?.horas_base_practica_real,
      DEFAULTS_HORAS_COHORTE.horas_base_practica_real,
      24
    ),
  };
}

export interface DesgloseCargaHoraria {
  horasTeoria: number;
  horasSesionesDupla: number;
  horasDiagnosticoYFinal: number;
  horasRefuerzoSimulador: number;
  horasSimuladorTotal: number;
  horasTerrenoBase: number;
  horasExtraTerreno: number;
  horasTerrenoTotal: number;
  totalCertificadas: number;
  horasRecomendadasTitan: number | null;
  diferenciaContraTitan: number | null;
  cumpleRecomendacionTitan: boolean | null;
}

export interface CalcularCargaHorariaInput {
  config?: Partial<ConfiguracionCursadoCohorte> | null;
  asistioTeoria: boolean;
  sesionesPresentes: number;
  tieneInstanciaCabina?: boolean;
  horasRefuerzoSimulador?: number | null;
  practicaReal?: Pick<
    PracticaRealItem,
    | 'asistencia_terreno'
    | 'horas_practica_terreno'
    | 'horas_extra_terreno'
    | 'horas_extra_sugeridas'
    | 'resultado'
  > | null;
  horasRecomendadasTitan?: number | null;
}

/**
 * Calcula el desglose oficial de "Carga Horaria Total de Capacitación" del
 * operador para el Legajo 360° (Drawer e Imprimible).
 */
export function calcularCargaHorariaOperador(
  input: CalcularCargaHorariaInput
): DesgloseCargaHoraria {
  const params = resolverParametrosHoras(input.config);
  const redondear = (v: number) => Math.round(v * 10) / 10;

  const horasTeoria = input.asistioTeoria ? params.horas_teoria : 0;
  const sesionesValidas = Math.max(0, Math.trunc(input.sesionesPresentes || 0));
  const horasSesionesDupla = redondear(
    sesionesValidas * params.horas_por_sesion_simulador
  );
  const horasDiagnosticoYFinal =
    input.tieneInstanciaCabina === false
      ? 0
      : params.horas_diagnostico_y_final;
  const horasRefuerzoSimulador = sanitizarHoras(
    input.horasRefuerzoSimulador,
    0,
    40
  );
  const horasSimuladorTotal = redondear(
    horasSesionesDupla + horasDiagnosticoYFinal + horasRefuerzoSimulador
  );

  const prac = input.practicaReal ?? null;
  const asistioTerreno =
    prac !== null && prac.asistencia_terreno !== 'AUSENTE';
  const horasTerrenoBase = asistioTerreno
    ? sanitizarHoras(
        prac?.horas_practica_terreno,
        params.horas_base_practica_real,
        24
      )
    : 0;
  const horasExtraTerreno = asistioTerreno
    ? sanitizarHoras(prac?.horas_extra_terreno, 0, 24)
    : 0;
  const horasTerrenoTotal = redondear(horasTerrenoBase + horasExtraTerreno);

  const totalCertificadas = redondear(
    horasTeoria + horasSimuladorTotal + horasTerrenoTotal
  );

  const rec =
    typeof input.horasRecomendadasTitan === 'number' &&
    Number.isFinite(input.horasRecomendadasTitan) &&
    input.horasRecomendadasTitan >= 0
      ? redondear(input.horasRecomendadasTitan)
      : null;

  const diferenciaContraTitan =
    rec !== null ? redondear(totalCertificadas - rec) : null;

  return {
    horasTeoria,
    horasSesionesDupla,
    horasDiagnosticoYFinal,
    horasRefuerzoSimulador,
    horasSimuladorTotal,
    horasTerrenoBase,
    horasExtraTerreno,
    horasTerrenoTotal,
    totalCertificadas,
    horasRecomendadasTitan: rec,
    diferenciaContraTitan,
    cumpleRecomendacionTitan:
      rec !== null ? totalCertificadas >= rec : null,
  };
}

export interface SesionParaCalculoHoras {
  cohorte_id?: string | null;
  dupla_id?: string | null;
  numero_sesion?: number | null;
  fecha_programada?: string | null;
  fecha_real?: string | null;
  estado_asistencia: string;
}

/**
 * Diferencia Horas-Hombre (capacitación a alumnos) vs Horas-Máquina (odómetro SIM-01):
 * - Horas-Hombre: 1 turno con 2 alumnos PRESENTE = 2.0 hs-hombre.
 * - Horas-Máquina: 1 turno de dupla = 1.0 h reloj si >=1 alumno estuvo PRESENTE.
 */
export function calcularHorasHombreYMaquina(
  sesiones: readonly SesionParaCalculoHoras[],
  horasPorTurno = DEFAULTS_HORAS_COHORTE.horas_por_sesion_simulador
): {
  sesionesPresentes: number;
  turnosMaquinaActivos: number;
  horasHombreSimulador: number;
  horasMaquinaSimulador: number;
} {
  const presentes = sesiones.filter((s) => s.estado_asistencia === 'PRESENTE');
  const turnosUnicos = new Set<string>();

  for (let i = 0; i < presentes.length; i++) {
    const s = presentes[i];
    const fechaRef = (s.fecha_real || s.fecha_programada || 'SIN_FECHA').split('T')[0];
    const claveTurno = s.dupla_id
      ? `${s.cohorte_id ?? 'c'}::${s.dupla_id}::${s.numero_sesion ?? 0}::${fechaRef}`
      : `indiv::${i}::${fechaRef}`;
    turnosUnicos.add(claveTurno);
  }

  const peso = sanitizarHoras(horasPorTurno, 1.0, 8);
  return {
    sesionesPresentes: presentes.length,
    turnosMaquinaActivos: turnosUnicos.size,
    horasHombreSimulador: Math.round(presentes.length * peso * 100) / 100,
    horasMaquinaSimulador: Math.round(turnosUnicos.size * peso * 100) / 100,
  };
}
