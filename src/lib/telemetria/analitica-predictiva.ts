import type { MetricasSimulador, PerfilOperador } from '@/lib/telemetria/parser-simulador';
import { calcularCargaHorariaOperador } from '@/lib/horas-capacitacion';
import type {
  ConfiguracionCursadoCohorte,
  DecisionInstructorCohorteItem,
  EtapaEvaluacion,
  PracticaRealItem,
} from '@/types/empleo';

/**
 * Motor puro de Ciencia de Datos Predictiva y Benchmarking B2B (costo $0).
 *
 * Calcula a partir de las filas reales de `public.evaluacion_diagnostico`,
 * `sesiones_practica`, `practica_real` y `evaluacion_final_egreso`:
 *  1. Índice de Cuidado Mecánico del Activo (0–100%).
 *  2. Índice Predictivo de Plasticidad / Asimilación Temprana (V1->V2 / T0->T1).
 *  3. Percentiles de cohorte (score, velocidad segura, cuidado mecánico).
 *  4. Tablero agregado de Impacto y ROI Industrial B2B.
 */

export type CategoriaCuidadoMecanico =
  | 'EXCELENTE_CUIDADO'
  | 'ESTANDAR_OPERATIVO'
  | 'DESGASTE_MODERADO'
  | 'RIESGO_MECANICO_ALTO';

export type CategoriaPlasticidad =
  | 'ALTA_PLASTICIDAD_AUTONOMIA_RAPIDA'
  | 'ASIMILACION_PROGRESIVA_ESTANDAR'
  | 'CURVA_LENTA_REQUIERE_TUTORIA';

export interface RegistroEvaluacionAnalitica {
  postulanteId: string;
  archivoFuente: string | null;
  etapa: EtapaEvaluacion;
  esMejorDiagnostico: boolean;
  scorePuntos: number | null;
  tiempoVueltaSeg: number | null;
  colisiones: number | null;
  indiceSerrucho: number | null;
  volantazosExtremos: number | null;
  frenadasPanico: number | null;
  porcentajeHorquillaAlta: number | null;
  oscilacionesMastil: number | null;
  saturacionesPalancasCount?: number | null;
  perfilOperador: PerfilOperador | null;
  createdAt: string | null;
  metricas: MetricasSimulador | null;
}

export interface AnaliticaCuidadoMecanico {
  indiceCuidadoMecanico: number;
  categoria: CategoriaCuidadoMecanico;
  penalizacionFrenos: number;
  penalizacionDireccion: number;
  penalizacionHidraulica: number;
  penalizacionColisiones: number;
}

export interface AnaliticaPlasticidad {
  indicePlasticidad: number;
  categoria: CategoriaPlasticidad;
  etapaBase: EtapaEvaluacion;
  etapaComparada: EtapaEvaluacion;
  deltaScorePts: number | null;
  mejoraScorePct: number | null;
  deltaColisiones: number | null;
  deltaTiempoSeg: number | null;
  deltaCuidadoMecanico: number | null;
  mejoraPerfil: boolean;
}

export interface AnaliticaOperadorCohorte {
  postulanteId: string;
  cuidadoMecanico: AnaliticaCuidadoMecanico | null;
  cuidadoInicial: AnaliticaCuidadoMecanico | null;
  plasticidad: AnaliticaPlasticidad | null;
  percentilScore: number | null;
  percentilVelocidad: number | null;
  percentilCuidadoMecanico: number | null;
  perfilInicial: PerfilOperador | null;
  perfilActual: PerfilOperador | null;
  scoreVigente: number | null;
  tiempoVigenteSeg: number | null;
  colisionesVigente: number | null;
}

export interface DistribucionPerfilItem {
  perfil: PerfilOperador;
  etiqueta: string;
  cantidad: number;
  porcentaje: number;
}

export interface EstadisticasMetricaCohorte {
  media: number | null;
  mediana: number | null;
  n: number;
}

export interface ResumenImpactoIndustrialCohorte {
  totalPostulantes: number;
  postulantesConTelemetria: number;
  totalReportesReales: number;
  asimilacion: {
    alumnosMultiIntento: number;
    mejoraPromedioScorePct: number | null;
    mejoraPromedioScorePts: number | null;
    cantidadRedujoColisiones: number;
    pctAlumnosRedujoColisiones: number | null;
    cantidadSinAumentoColisiones: number;
    variacionPromedioTiempoSeg: number | null;
    altaPlasticidadCount: number;
    asimilacionEstandarCount: number;
    curvaLentaCount: number;
  };
  preservacionActivos: {
    promedioCuidadoMecanico: number | null;
    medianaCuidadoMecanico: number | null;
    operadoresOptimos: number;
    porcentajeOptimos: number | null;
    excelenteCount: number;
    estandarCount: number;
    desgasteModeradoCount: number;
    riesgoAltoCount: number;
  };
  perfiles: {
    distribucion: DistribucionPerfilItem[];
    evolucionPositivaCount: number;
  };
  formacion: {
    totalHorasHombre: number;
    totalHorasMaquinaSimulador: number;
    aprobadosEmpresas: number;
  };
  benchmarking: {
    score: EstadisticasMetricaCohorte;
    tiempoSeg: EstadisticasMetricaCohorte;
    cuidadoMecanico: EstadisticasMetricaCohorte;
  };
}

export interface PostulanteFuenteImpacto {
  postulanteId: string;
  estadoInscripcion: string;
  sesionesPresentes: number;
  tieneCabinaTablet: boolean;
  decisionInstructor: DecisionInstructorCohorteItem | null;
  practicaReal: Pick<
    PracticaRealItem,
    | 'asistencia_terreno'
    | 'horas_practica_terreno'
    | 'horas_extra_terreno'
    | 'horas_extra_sugeridas'
    | 'resultado'
    | 'decision_instructor_terreno'
  > | null;
  aprobadoEgresoTerreno: boolean | null;
  horasRecomendadasTitan: number | null;
  evaluacionesTitan: RegistroEvaluacionAnalitica[];
}

const RANK_PERFIL: Record<PerfilOperador, number> = {
  NOVATO: 1,
  SIN_NOCION_ESPACIO: 2,
  INEFICIENTE: 3,
  APURADO: 4,
  EFICIENTE: 5,
};

const ETIQUETAS_PERFIL: Record<PerfilOperador, string> = {
  EFICIENTE: 'Eficiente',
  INEFICIENTE: 'Ineficiente',
  APURADO: 'Apurado',
  SIN_NOCION_ESPACIO: 'Sin noción del espacio',
  NOVATO: 'Novato',
};

const ORDEN_PERFILES: readonly PerfilOperador[] = [
  'EFICIENTE',
  'INEFICIENTE',
  'APURADO',
  'SIN_NOCION_ESPACIO',
  'NOVATO',
];

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function redondear(v: number, dec = 1): number {
  const f = 10 ** dec;
  return Math.round(v * f) / f;
}

function clasificarCategoriaCuidado(indice: number): CategoriaCuidadoMecanico {
  if (indice >= 85) return 'EXCELENTE_CUIDADO';
  if (indice >= 70) return 'ESTANDAR_OPERATIVO';
  if (indice >= 50) return 'DESGASTE_MODERADO';
  return 'RIESGO_MECANICO_ALTO';
}

function clasificarCategoriaPlasticidad(
  indice: number,
  deltaColisiones: number | null,
  mejoraScorePct: number | null
): CategoriaPlasticidad {
  if (
    indice >= 65 ||
    (deltaColisiones !== null &&
      deltaColisiones <= -2 &&
      (mejoraScorePct === null || mejoraScorePct >= 0))
  ) {
    return 'ALTA_PLASTICIDAD_AUTONOMIA_RAPIDA';
  }
  if (indice >= 48) {
    return 'ASIMILACION_PROGRESIVA_ESTANDAR';
  }
  return 'CURVA_LENTA_REQUIERE_TUTORIA';
}

/**
 * Calcula el Índice de Cuidado Mecánico del Activo (0–100%) a partir de
 * las métricas de las 6 curvas + consola de un reporte del simulador.
 */
export function calcularIndiceCuidadoMecanico(input: {
  colisionesReales?: number | null;
  frenadasPanico?: number | null;
  indiceSerrucho?: number | null;
  volantazosExtremos?: number | null;
  porcentajeHorquillaAlta?: number | null;
  oscilacionesMastil?: number | null;
  saturacionesPalancasCount?: number | null;
  infraccionesConduccion?: MetricasSimulador['infraccionesConduccion'] | null;
}): AnaliticaCuidadoMecanico {
  const frenadas = Math.max(0, num(input.frenadasPanico) ?? 0);
  const serrucho = Math.max(0, num(input.indiceSerrucho) ?? 0);
  const volantazos = Math.max(0, num(input.volantazosExtremos) ?? 0);
  const horquillaAltaPct = Math.max(0, num(input.porcentajeHorquillaAlta) ?? 0);
  const oscilacionesTilt = Math.max(0, num(input.oscilacionesMastil) ?? 0);
  const colisiones = Math.max(0, num(input.colisionesReales) ?? 0);

  let saturaciones = num(input.saturacionesPalancasCount) ?? 0;
  if (saturaciones === 0 && Array.isArray(input.infraccionesConduccion)) {
    for (const inf of input.infraccionesConduccion) {
      if (inf.tipo === 'SATURACION_PALANCA') {
        const m = inf.descripcion.match(/total\s*=\s*(\d+)/i);
        saturaciones += m ? Number(m[1]) : 1;
      }
    }
  }

  const penalizacionFrenos = redondear(Math.min(24, frenadas * 3), 1);
  const penSerrucho = Math.min(18, Math.max(0, (serrucho - 0.8) * 6));
  const penVolantazos = Math.min(20, volantazos * 3);
  const penalizacionDireccion = redondear(Math.min(28, penSerrucho + penVolantazos), 1);
  const penSaturacion = Math.min(16, saturaciones * 2);
  const penHorquilla = Math.min(15, (horquillaAltaPct / 100) * 25);
  const penTilt = Math.min(10, oscilacionesTilt * 2);
  const penalizacionHidraulica = redondear(
    Math.min(28, penSaturacion + penHorquilla + penTilt),
    1
  );
  const penalizacionColisiones = redondear(Math.min(36, colisiones * 12), 1);

  const raw =
    100 -
    penalizacionFrenos -
    penalizacionDireccion -
    penalizacionHidraulica -
    penalizacionColisiones;
  const indiceCuidadoMecanico = Math.round(Math.max(0, Math.min(100, raw)));

  return {
    indiceCuidadoMecanico,
    categoria: clasificarCategoriaCuidado(indiceCuidadoMecanico),
    penalizacionFrenos,
    penalizacionDireccion,
    penalizacionHidraulica,
    penalizacionColisiones,
  };
}

export function calcularCuidadoDesdeMetricas(
  m: MetricasSimulador
): AnaliticaCuidadoMecanico {
  return calcularIndiceCuidadoMecanico({
    colisionesReales: m.colisionesReales,
    frenadasPanico: m.frenadasPanico,
    indiceSerrucho: m.indiceSerrucho,
    volantazosExtremos: m.volantazosExtremos,
    porcentajeHorquillaAlta: m.porcentajeCirculacionHorquillaAlta,
    oscilacionesMastil: m.oscilacionesMastil,
    infraccionesConduccion: m.infraccionesConduccion,
  });
}

function cuidarDesdeRegistro(reg: RegistroEvaluacionAnalitica): AnaliticaCuidadoMecanico {
  if (reg.metricas) {
    return calcularCuidadoDesdeMetricas(reg.metricas);
  }
  return calcularIndiceCuidadoMecanico({
    colisionesReales: reg.colisiones,
    frenadasPanico: reg.frenadasPanico,
    indiceSerrucho: reg.indiceSerrucho,
    volantazosExtremos: reg.volantazosExtremos,
    porcentajeHorquillaAlta: reg.porcentajeHorquillaAlta,
    oscilacionesMastil: reg.oscilacionesMastil,
    saturacionesPalancasCount: reg.saturacionesPalancasCount,
  });
}

function timestampOrden(reg: RegistroEvaluacionAnalitica): string {
  const start = reg.metricas?.exerciseStartTime;
  if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start)) {
    return start;
  }
  return reg.createdAt ?? '9999-99-99T99:99:99';
}

function prioridadEtapaNum(e: EtapaEvaluacion): number {
  if (e === 'DIAG_INTENTO_1') return 1;
  if (e === 'DIAG_INTENTO_2') return 2;
  return 3;
}

function ordenarEvaluacionesCronologicamente(
  evals: readonly RegistroEvaluacionAnalitica[]
): RegistroEvaluacionAnalitica[] {
  return [...evals].sort((a, b) => {
    const pe = prioridadEtapaNum(a.etapa) - prioridadEtapaNum(b.etapa);
    if (pe !== 0) return pe;
    const ta = timestampOrden(a);
    const tb = timestampOrden(b);
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.archivoFuente ?? '').localeCompare(b.archivoFuente ?? '');
  });
}

function calcularEstadisticas(valores: readonly number[]): EstadisticasMetricaCohorte {
  if (valores.length === 0) return { media: null, mediana: null, n: 0 };
  const ordenados = [...valores].sort((a, b) => a - b);
  const suma = ordenados.reduce((acc, v) => acc + v, 0);
  const mid = Math.floor(ordenados.length / 2);
  const mediana =
    ordenados.length % 2 === 1
      ? ordenados[mid]
      : (ordenados[mid - 1] + ordenados[mid]) / 2;
  return {
    media: redondear(suma / ordenados.length, 1),
    mediana: redondear(mediana, 1),
    n: ordenados.length,
  };
}

function calcularPercentil(
  valor: number | null,
  poblacion: readonly number[],
  mayorEsMejor: boolean
): number | null {
  if (valor === null || poblacion.length === 0) return null;
  let mejoresOIguales = 0;
  let empates = 0;
  for (const x of poblacion) {
    if (x === valor) empates += 1;
    else if (mayorEsMejor ? x < valor : x > valor) mejoresOIguales += 1;
  }
  const rank = mejoresOIguales + 0.5 * empates;
  return Math.round(Math.max(1, Math.min(99, (rank / poblacion.length) * 100)));
}

/**
 * Calcula la analítica predictiva individual y el tablero B2B agregado
 * de toda la cohorte activa.
 */
export function analizarCohortePredictiva(input: {
  cohorteConfig: ConfiguracionCursadoCohorte;
  postulantes: readonly PostulanteFuenteImpacto[];
  horasMaquinaSimulador: number;
}): {
  porPostulante: Record<string, AnaliticaOperadorCohorte>;
  resumenCohorte: ResumenImpactoIndustrialCohorte;
} {
  const porPostulante: Record<string, AnaliticaOperadorCohorte> = {};

  const poblacionScore: number[] = [];
  const poblacionTiempo: number[] = [];
  const poblacionCuidado: number[] = [];

  const mejorasScorePct: number[] = [];
  const mejorasScorePts: number[] = [];
  const variacionesTiempo: number[] = [];
  let alumnosMultiIntento = 0;
  let cantidadRedujoColisiones = 0;
  let cantidadSinAumentoColisiones = 0;
  let altaPlasticidadCount = 0;
  let asimilacionEstandarCount = 0;
  let curvaLentaCount = 0;

  let evolucionPositivaCount = 0;
  const conteoPerfiles = new Map<PerfilOperador, number>();
  for (const p of ORDEN_PERFILES) conteoPerfiles.set(p, 0);

  let totalReportesReales = 0;
  let postulantesConTelemetria = 0;
  let totalHorasHombre = 0;
  let aprobadosEmpresas = 0;

  const cuidadosVigentes: number[] = [];
  let excelenteCount = 0;
  let estandarCount = 0;
  let desgasteModeradoCount = 0;
  let riesgoAltoCount = 0;

  interface PrepAlumno {
    postulanteId: string;
    scoreVigente: number | null;
    tiempoVigenteSeg: number | null;
    cuidadoVigente: AnaliticaCuidadoMecanico | null;
    cuidadoInicial: AnaliticaCuidadoMecanico | null;
    plasticidad: AnaliticaPlasticidad | null;
    perfilInicial: PerfilOperador | null;
    perfilActual: PerfilOperador | null;
    colisionesVigente: number | null;
  }

  const preps: PrepAlumno[] = [];

  for (const p of input.postulantes) {
    // Volumen total de formación certificada (Horas-Hombre) y aprobados empresas
    const asistioTeoria =
      p.decisionInstructor?.asistio_teoria ??
      (p.estadoInscripcion === 'CONFIRMADO' ||
        p.sesionesPresentes > 0 ||
        Boolean(p.practicaReal));
    const carga = calcularCargaHorariaOperador({
      config: input.cohorteConfig,
      asistioTeoria,
      sesionesPresentes: p.sesionesPresentes,
      tieneInstanciaCabina: p.tieneCabinaTablet || p.evaluacionesTitan.length > 0,
      horasRefuerzoSimulador: p.decisionInstructor?.horas_refuerzo_simulador ?? 0,
      practicaReal: p.practicaReal,
      horasRecomendadasTitan: p.horasRecomendadasTitan,
    });
    totalHorasHombre += carga.totalCertificadas;

    if (
      p.practicaReal?.decision_instructor_terreno === 'APROBADO_EMPRESAS' ||
      p.practicaReal?.resultado === 'aprobado' ||
      p.aprobadoEgresoTerreno === true
    ) {
      aprobadosEmpresas += 1;
    }

    const ordenadas = ordenarEvaluacionesCronologicamente(p.evaluacionesTitan);
    totalReportesReales += ordenadas.length;

    if (ordenadas.length === 0) {
      preps.push({
        postulanteId: p.postulanteId,
        scoreVigente: null,
        tiempoVigenteSeg: null,
        cuidadoVigente: null,
        cuidadoInicial: null,
        plasticidad: null,
        perfilInicial: null,
        perfilActual: null,
        colisionesVigente: null,
      });
      continue;
    }

    postulantesConTelemetria += 1;

    const primera = ordenadas[0];
    const intentosDiag = ordenadas.filter((e) => e.etapa !== 'FINAL');
    const mejoresT0 =
      intentosDiag.find((e) => e.esMejorDiagnostico) ??
      intentosDiag[intentosDiag.length - 1] ??
      primera;
    const finales = ordenadas.filter((e) => e.etapa === 'FINAL');
    const ultima = ordenadas[ordenadas.length - 1];
    const vigente = finales[finales.length - 1] ?? ultima ?? mejoresT0;

    const cuidadoIni = cuidarDesdeRegistro(primera);
    const cuidadoVig = cuidarDesdeRegistro(vigente);

    const scoreVig = num(vigente.scorePuntos);
    const tiempoVig = num(vigente.tiempoVueltaSeg);
    const colVig = num(vigente.colisiones);

    if (scoreVig !== null) poblacionScore.push(scoreVig);
    if (tiempoVig !== null) poblacionTiempo.push(tiempoVig);
    poblacionCuidado.push(cuidadoVig.indiceCuidadoMecanico);
    cuidadosVigentes.push(cuidadoVig.indiceCuidadoMecanico);

    switch (cuidadoVig.categoria) {
      case 'EXCELENTE_CUIDADO':
        excelenteCount += 1;
        break;
      case 'ESTANDAR_OPERATIVO':
        estandarCount += 1;
        break;
      case 'DESGASTE_MODERADO':
        desgasteModeradoCount += 1;
        break;
      case 'RIESGO_MECANICO_ALTO':
        riesgoAltoCount += 1;
        break;
    }

    const perfilInicial = primera.perfilOperador;
    const perfilActual = vigente.perfilOperador;
    if (perfilActual) {
      conteoPerfiles.set(perfilActual, (conteoPerfiles.get(perfilActual) ?? 0) + 1);
    }

    let plasticidad: AnaliticaPlasticidad | null = null;
    if (ordenadas.length >= 2) {
      alumnosMultiIntento += 1;
      const base = finales.length > 0 ? mejoresT0 : primera;
      const comp = ultima;

      const sIni = num(base.scorePuntos);
      const sFin = num(comp.scorePuntos);
      const dIni = num(base.tiempoVueltaSeg);
      const dFin = num(comp.tiempoVueltaSeg);
      const cIni = num(base.colisiones);
      const cFin = num(comp.colisiones);
      const cuidadoBase = cuidarDesdeRegistro(base);
      const cuidadoComp = cuidarDesdeRegistro(comp);

      const deltaScorePts =
        sIni !== null && sFin !== null ? redondear(sFin - sIni, 2) : null;
      const mejoraScorePct =
        sIni !== null && sFin !== null
          ? redondear(((sFin - sIni) / Math.max(Math.abs(sIni), 20)) * 100, 1)
          : null;
      const deltaColisiones =
        cIni !== null && cFin !== null ? Math.trunc(cFin - cIni) : null;
      const deltaTiempoSeg =
        dIni !== null && dFin !== null ? Math.trunc(dFin - dIni) : null;
      const deltaCuidado =
        cuidadoComp.indiceCuidadoMecanico - cuidadoBase.indiceCuidadoMecanico;

      if (mejoraScorePct !== null) mejorasScorePct.push(mejoraScorePct);
      if (deltaScorePts !== null) mejorasScorePts.push(deltaScorePts);
      if (deltaTiempoSeg !== null) variacionesTiempo.push(deltaTiempoSeg);

      if (deltaColisiones !== null) {
        if (deltaColisiones < 0) cantidadRedujoColisiones += 1;
        if (deltaColisiones <= 0) cantidadSinAumentoColisiones += 1;
      }

      const termScore =
        mejoraScorePct !== null
          ? Math.max(-25, Math.min(35, mejoraScorePct * 0.6))
          : 0;
      const termCol =
        deltaColisiones !== null
          ? Math.max(-20, Math.min(25, -deltaColisiones * 8))
          : 0;
      const termTiempo =
        dIni !== null && dFin !== null && dIni > 0
          ? Math.max(-15, Math.min(20, ((dIni - dFin) / dIni) * 35))
          : 0;
      const termCuidado = Math.max(-15, Math.min(20, deltaCuidado * 0.55));

      const indicePlast = Math.round(
        Math.max(0, Math.min(100, 50 + termScore + termCol + termTiempo + termCuidado))
      );
      const catPlast = clasificarCategoriaPlasticidad(
        indicePlast,
        deltaColisiones,
        mejoraScorePct
      );

      switch (catPlast) {
        case 'ALTA_PLASTICIDAD_AUTONOMIA_RAPIDA':
          altaPlasticidadCount += 1;
          break;
        case 'ASIMILACION_PROGRESIVA_ESTANDAR':
          asimilacionEstandarCount += 1;
          break;
        case 'CURVA_LENTA_REQUIERE_TUTORIA':
          curvaLentaCount += 1;
          break;
      }

      const mejoraPerfil = Boolean(
        base.perfilOperador &&
          comp.perfilOperador &&
          RANK_PERFIL[comp.perfilOperador] > RANK_PERFIL[base.perfilOperador]
      );
      if (mejoraPerfil) evolucionPositivaCount += 1;

      plasticidad = {
        indicePlasticidad: indicePlast,
        categoria: catPlast,
        etapaBase: base.etapa,
        etapaComparada: comp.etapa,
        deltaScorePts,
        mejoraScorePct,
        deltaColisiones,
        deltaTiempoSeg,
        deltaCuidadoMecanico: deltaCuidado,
        mejoraPerfil,
      };
    }

    preps.push({
      postulanteId: p.postulanteId,
      scoreVigente: scoreVig,
      tiempoVigenteSeg: tiempoVig,
      cuidadoVigente: cuidadoVig,
      cuidadoInicial: cuidadoIni,
      plasticidad,
      perfilInicial,
      perfilActual,
      colisionesVigente: colVig,
    });
  }

  for (const item of preps) {
    porPostulante[item.postulanteId] = {
      postulanteId: item.postulanteId,
      cuidadoMecanico: item.cuidadoVigente,
      cuidadoInicial: item.cuidadoInicial,
      plasticidad: item.plasticidad,
      percentilScore: calcularPercentil(item.scoreVigente, poblacionScore, true),
      percentilVelocidad: calcularPercentil(
        item.tiempoVigenteSeg,
        poblacionTiempo,
        false
      ),
      percentilCuidadoMecanico: calcularPercentil(
        item.cuidadoVigente?.indiceCuidadoMecanico ?? null,
        poblacionCuidado,
        true
      ),
      perfilInicial: item.perfilInicial,
      perfilActual: item.perfilActual,
      scoreVigente: item.scoreVigente,
      tiempoVigenteSeg: item.tiempoVigenteSeg,
      colisionesVigente: item.colisionesVigente,
    };
  }

  const statsCuidado = calcularEstadisticas(cuidadosVigentes);
  const operadoresOptimos = cuidadosVigentes.filter((v) => v >= 75).length;

  const distribucion: DistribucionPerfilItem[] = ORDEN_PERFILES.map((perfil) => {
    const cantidad = conteoPerfiles.get(perfil) ?? 0;
    return {
      perfil,
      etiqueta: ETIQUETAS_PERFIL[perfil],
      cantidad,
      porcentaje:
        postulantesConTelemetria > 0
          ? redondear((cantidad / postulantesConTelemetria) * 100, 1)
          : 0,
    };
  });

  const avg = (arr: readonly number[], dec = 1): number | null => {
    if (arr.length === 0) return null;
    return redondear(arr.reduce((a, b) => a + b, 0) / arr.length, dec);
  };

  return {
    porPostulante,
    resumenCohorte: {
      totalPostulantes: input.postulantes.length,
      postulantesConTelemetria,
      totalReportesReales,
      asimilacion: {
        alumnosMultiIntento,
        mejoraPromedioScorePct: avg(mejorasScorePct, 1),
        mejoraPromedioScorePts: avg(mejorasScorePts, 2),
        cantidadRedujoColisiones,
        pctAlumnosRedujoColisiones:
          alumnosMultiIntento > 0
            ? redondear((cantidadRedujoColisiones / alumnosMultiIntento) * 100, 1)
            : null,
        cantidadSinAumentoColisiones,
        variacionPromedioTiempoSeg: avg(variacionesTiempo, 0),
        altaPlasticidadCount,
        asimilacionEstandarCount,
        curvaLentaCount,
      },
      preservacionActivos: {
        promedioCuidadoMecanico: statsCuidado.media,
        medianaCuidadoMecanico: statsCuidado.mediana,
        operadoresOptimos,
        porcentajeOptimos:
          cuidadosVigentes.length > 0
            ? redondear((operadoresOptimos / cuidadosVigentes.length) * 100, 1)
            : null,
        excelenteCount,
        estandarCount,
        desgasteModeradoCount,
        riesgoAltoCount,
      },
      perfiles: {
        distribucion,
        evolucionPositivaCount,
      },
      formacion: {
        totalHorasHombre: redondear(totalHorasHombre, 1),
        totalHorasMaquinaSimulador: redondear(input.horasMaquinaSimulador, 1),
        aprobadosEmpresas,
      },
      benchmarking: {
        score: calcularEstadisticas(poblacionScore),
        tiempoSeg: calcularEstadisticas(poblacionTiempo),
        cuidadoMecanico: statsCuidado,
      },
    },
  };
}
