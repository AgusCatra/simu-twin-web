/**
 * Parser tipado de reportes JSON del simulador TITAN (ETECH Simulation) y
 * artefactos generados por `scripts/parse_simuladores.py`.
 *
 * Aplica validación estricta en tiempo de ejecución (cero `any`) y reproduce
 * exactamente el filtro antifalsos positivos del `bug -2` (colisiones fantasma
 * contra suelo/malla o rebotes negativos de sensor de mástil).
 */

export const MAX_BYTES_REPORTE_JSON = 2 * 1024 * 1024; // 2 MB

const RE_ARTEFACTO_SUELO =
  /\b(floor|ground|terrain|mesh)\b|fork\s*height\s*\(?\s*(?:mtrs|mts|m)?\s*\)?\s*(?:=|:)?\s*-|\bhorn\s*-(?:contact|touch)\b/i;

const RE_DURACION_HMS = /^(\d{1,2}):(\d{2}):(\d{2})$/;

export interface EventoFaltaSimulador {
  timestamp: string | null;
  descripcion: string;
  tipo: string | null;
}

export interface MetricasSimulador {
  archivoFuente: string | null;
  studentName: string | null;
  studentId: string | null;
  exerciseName: string | null;
  exerciseStartTime: string | null;
  scorePuntos: number | null;
  tiempoDuracionSeg: number | null;
  colisionesReales: number;
  colisionesDescartadas: number;
  colisionesDetalle: EventoFaltaSimulador[];
  descartesDetalle: EventoFaltaSimulador[];
  infraccionesConduccion: EventoFaltaSimulador[];
  indiceSerrucho: number | null;
  volantazosExtremos: number | null;
  velocidadMaxKmh: number | null;
  frenadasPanico: number | null;
  picosAceleracion: number | null;
  porcentajeAceleradorFondo: number | null;
  muestrasHorquillaElevada: number | null;
  porcentajeCirculacionHorquillaAlta: number | null;
  alturaMaximaHorquillaM: number | null;
  oscilacionesMastil: number | null;
  indiceInestabilidadTilt: number | null;
  clasificacionRiesgo: string | null;
  clasificacionAptitud: string | null;
  hallazgosMastil: string[];
  alertaFalsoPositivoSuelo: boolean;
}

export type PerfilOperador =
  | 'EFICIENTE'
  | 'APURADO'
  | 'INEFICIENTE'
  | 'SIN_NOCION_ESPACIO'
  | 'NOVATO';

export interface ContextoCabinaClasificacion {
  puntajeLateralidad?: number | null;
  puntajeTactoMandos?: number | null;
  puntajeMastil?: number | null;
  puntajeControlReceptividad?: number | null;
  scoreCabina?: number | null;
  nivelAsistencia?: string | null;
  asistenciaCabinaLegacy?: string | null;
  hardFail?: boolean;
}

export interface ResultadoClasificacionOperador {
  perfilOperador: PerfilOperador;
  etiquetaPerfil: string;
  horasRecomendadas: number;
  rangoHorasTexto: string;
  modulosRecomendados: string[];
  justificacion: string;
}

export interface OpcionesParseoSimulador {
  nombrePostulante?: string | null;
}

type ObjetoJson = Record<string, unknown>;

function esObjeto(v: unknown): v is ObjetoJson {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function leerString(obj: ObjetoJson | undefined, claves: readonly string[]): string | null {
  if (!obj) return null;
  for (const clave of claves) {
    const val = obj[clave];
    if (typeof val === 'string') {
      const limpio = val.trim();
      if (limpio.length > 0) return limpio;
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      return String(val);
    }
  }
  return null;
}

function leerNumero(obj: ObjetoJson | undefined, claves: readonly string[]): number | null {
  if (!obj) return null;
  for (const clave of claves) {
    const val = obj[clave];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
    if (typeof val === 'string') {
      const normalizado = val.trim().replace(',', '.').replace(/[^\d.-]/g, '');
      if (normalizado.length > 0) {
        const parsed = Number(normalizado);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function leerEnteroNoNegativo(
  obj: ObjetoJson | undefined,
  claves: readonly string[]
): number | null {
  const n = leerNumero(obj, claves);
  if (n === null) return null;
  const entero = Math.round(n);
  return entero >= 0 ? entero : null;
}

export function hmsASegundos(texto: string | null): number | null {
  if (!texto) return null;
  const match = texto.trim().match(RE_DURACION_HMS);
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  const segundos = Number(match[3]);
  if (
    !Number.isFinite(horas) ||
    !Number.isFinite(minutos) ||
    !Number.isFinite(segundos) ||
    minutos >= 60 ||
    segundos >= 60
  ) {
    return null;
  }
  return horas * 3600 + minutos * 60 + segundos;
}

function parsearEventos(valor: unknown): EventoFaltaSimulador[] {
  if (!Array.isArray(valor)) return [];
  const salida: EventoFaltaSimulador[] = [];
  for (const item of valor) {
    if (typeof item === 'string') {
      const limpio = item.trim();
      if (limpio.length > 0) {
        salida.push({ timestamp: null, descripcion: limpio.slice(0, 400), tipo: null });
      }
      continue;
    }
    if (!esObjeto(item)) continue;
    const descripcion = leerString(item, [
      'descripcion',
      'description',
      'detail',
      'detalle',
      'mensaje',
      'message',
      'event',
    ]);
    if (!descripcion) continue;
    salida.push({
      timestamp: leerString(item, ['timestamp', 'sim_time', 'simTime', 'time', 'hora']),
      descripcion: descripcion.slice(0, 400),
      tipo: leerString(item, ['tipo', 'type', 'category', 'motivo_descarte']),
    });
  }
  return salida;
}

function normalizarTokensNombre(texto: string | null | undefined): string[] {
  if (!texto) return [];
  return texto
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && t !== 'del' && t !== 'las' && t !== 'los');
}

function coincideAlumno(
  nombreObjetivo: string | null | undefined,
  candidato: string | null
): boolean {
  const base = normalizarTokensNombre(nombreObjetivo);
  const cand = normalizarTokensNombre(candidato);
  if (base.length === 0 || cand.length === 0) return false;
  let aciertos = 0;
  for (const t of cand) {
    if (base.some((b) => b === t || b.includes(t) || t.includes(b))) {
      aciertos += 1;
    }
  }
  return aciertos >= Math.min(cand.length, base.length) && aciertos > 0;
}

function seleccionarObjetoRaiz(
  raw: unknown,
  nombrePostulante?: string | null
): ObjetoJson {
  if (Array.isArray(raw)) {
    const objetos = raw.filter(esObjeto);
    if (objetos.length === 0) {
      throw new Error(
        'El archivo JSON contiene una lista vacía o sin registros de telemetría válidos.'
      );
    }
    if (nombrePostulante) {
      const coincidencias = objetos.filter((item) =>
        coincideAlumno(
          nombrePostulante,
          leerString(item, ['student_name', 'studentName', 'nombre', 'alumno'])
        )
      );
      if (coincidencias.length > 0) {
        return coincidencias[coincidencias.length - 1];
      }
    }
    return objetos[0];
  }

  if (!esObjeto(raw)) {
    throw new Error('El reporte JSON debe ser un objeto o una lista de sesiones.');
  }

  if (esObjeto(raw.reporte)) return raw.reporte;
  if (esObjeto(raw.session)) return raw.session;
  return raw;
}

export function esArtefactoSueloTitan(descripcion: string): boolean {
  return RE_ARTEFACTO_SUELO.test(descripcion);
}

/** Normaliza nombres exportados con `;` en lugar de `ñ` y colapsa espacios. */
export function normalizarNombreAlumno(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpio = texto.replace(/;/g, 'ñ').replace(/\s+/g, ' ').trim();
  return limpio.length > 0 ? limpio : null;
}

/** Extrae hasta 8 descripciones únicas asociadas a mástil, horquillas, tilt o pallet. */
export function construirHallazgosMastil(
  colisiones: readonly EventoFaltaSimulador[],
  infracciones: readonly EventoFaltaSimulador[]
): string[] {
  return Array.from(
    new Set(
      [...colisiones, ...infracciones]
        .map((f) => f.descripcion)
        .filter((d) => /fork|mastil|mástil|tilt|pallet/i.test(d))
    )
  ).slice(0, 8);
}

/** Clasifica riesgo y aptitud operativa con la misma heurística del pipeline Titán. */
export function clasificarRiesgoYAptitud(
  colisiones: number,
  indiceSerrucho: number | null,
  frenadasPanico: number | null
): { riesgo: string; aptitud: string } {
  const serrucho = indiceSerrucho ?? 99.0;
  const frenadas = frenadasPanico ?? 99;
  if (colisiones <= 1 && serrucho < 1.8 && frenadas <= 1) {
    return { riesgo: 'Mínima (Autónomo)', aptitud: 'Apto Directo' };
  }
  if (colisiones <= 2 && serrucho < 3.2) {
    return { riesgo: 'Media', aptitud: 'Apto / Observación' };
  }
  return { riesgo: 'Alta', aptitud: 'Condicional' };
}

/**
 * Parsea y valida un string JSON exportado por el simulador TITAN / pipeline
 * de telemetría, devolviendo un objeto `MetricasSimulador` fuertemente tipado
 * y sanitizado contra falsos positivos del bug -2 (suelo/malla).
 */
export function parsearReporteSimulador(
  contenido: string,
  opciones?: OpcionesParseoSimulador
): MetricasSimulador {
  if (typeof contenido !== 'string' || contenido.trim().length === 0) {
    throw new Error('El archivo de telemetría está vacío.');
  }

  if (contenido.length > MAX_BYTES_REPORTE_JSON) {
    throw new Error('El archivo de telemetría excede el tamaño máximo permitido (2 MB).');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contenido);
  } catch {
    throw new Error('El contenido no es un JSON válido.');
  }

  const raiz = seleccionarObjetoRaiz(parsed, opciones?.nombrePostulante);

  const subTelemetria = esObjeto(raiz.telemetria)
    ? raiz.telemetria
    : esObjeto(raiz.telemetry)
      ? raiz.telemetry
      : esObjeto(raiz.metricas)
        ? raiz.metricas
        : undefined;

  const subSanitizadas = esObjeto(raiz.metricas_sanitizadas)
    ? raiz.metricas_sanitizadas
    : esObjeto(raiz.sanitized_metrics)
      ? raiz.sanitized_metrics
      : undefined;

  const subClasificacion = esObjeto(raiz.clasificacion)
    ? raiz.clasificacion
    : undefined;

  const archivoFuente = leerString(raiz, [
    'archivo_fuente',
    'archivo',
    'file',
    'filename',
    'source_file',
  ]);
  const studentName = leerString(raiz, [
    'student_name',
    'studentName',
    'nombre_completo',
    'alumno',
  ]);
  const studentId = leerString(raiz, ['student_id', 'studentId', 'dni']);
  const exerciseName = leerString(raiz, ['exercise_name', 'exerciseName', 'ejercicio']);
  const exerciseStartTime = leerString(raiz, [
    'exercise_start_time',
    'timestamp_inicio',
    'start_time',
  ]);

  const scoreBruto =
    leerNumero(subSanitizadas, ['score', 'score_puntos', 'scorePuntos']) ??
    leerNumero(raiz, ['score', 'score_puntos', 'scorePuntos', 'Score']);
  const scorePuntos =
    scoreBruto !== null && scoreBruto >= 0 && scoreBruto <= 200
      ? Math.round(scoreBruto * 100) / 100
      : null;

  const duracionTexto = leerString(raiz, ['exercise_duration', 'duration']);
  const tiempoBruto =
    leerEnteroNoNegativo(subSanitizadas, ['exercise_duration_seg', 'tiempo_vuelta_seg']) ??
    leerEnteroNoNegativo(raiz, [
      'exercise_duration_seg',
      'tiempo_vuelta_seg',
      'duracion_seg',
      'duration_seconds',
    ]) ??
    hmsASegundos(duracionTexto);
  const tiempoDuracionSeg =
    tiempoBruto !== null && tiempoBruto <= 36000 ? tiempoBruto : null;

  // Sanitización defensiva de eventos de colisión + artefactos de suelo (-2)
  const colisionesRaw = parsearEventos(raiz.colisiones ?? raiz.collisions);
  const descartesPrevios = parsearEventos(
    raiz.descartes_sanitizados ?? raiz.discarded_faults
  );
  const infraccionesConduccion = parsearEventos(
    raiz.infracciones_conduccion ?? raiz.driving_faults ?? raiz.faults
  );

  const colisionesRealesDetalle: EventoFaltaSimulador[] = [];
  const descartesNuevos: EventoFaltaSimulador[] = [...descartesPrevios];

  for (const col of colisionesRaw) {
    if (esArtefactoSueloTitan(col.descripcion)) {
      descartesNuevos.push({ ...col, tipo: 'ARTEFACTO_SUELO' });
    } else {
      colisionesRealesDetalle.push(col);
    }
  }

  // También inspecciona infracciones generales por artefactos de suelo si no fueron filtradas
  const infraccionesFiltradas: EventoFaltaSimulador[] = [];
  for (const inf of infraccionesConduccion) {
    if (esArtefactoSueloTitan(inf.descripcion)) {
      descartesNuevos.push({ ...inf, tipo: 'ARTEFACTO_SUELO' });
    } else {
      infraccionesFiltradas.push(inf);
    }
  }

  const colisionesRealesNumero =
    colisionesRealesDetalle.length > 0
      ? colisionesRealesDetalle.length
      : leerEnteroNoNegativo(subSanitizadas, ['n_colisiones_reales', 'colisiones']) ??
        leerEnteroNoNegativo(raiz, ['n_colisiones', 'colisiones']) ??
        0;

  const descartesConteoExplicito =
    leerEnteroNoNegativo(subSanitizadas, ['colisiones_descartadas']) ??
    leerEnteroNoNegativo(raiz, ['colisiones_descartadas']) ??
    0;

  const colisionesDescartadas = Math.max(
    descartesNuevos.length,
    descartesConteoExplicito
  );

  const serruchoRaw =
    leerNumero(subSanitizadas, ['steering_serrucho_index', 'indice_serrucho', 'serrucho']) ??
    leerNumero(subTelemetria, ['steering_serrucho_index', 'indice_serrucho', 'serrucho']) ??
    leerNumero(raiz, ['steering_serrucho_index', 'indice_serrucho', 'serrucho']);
  const indiceSerrucho =
    serruchoRaw !== null && serruchoRaw >= 0 && serruchoRaw <= 100
      ? Math.round(serruchoRaw * 1000) / 1000
      : null;

  const volantazosExtremos =
    leerEnteroNoNegativo(subSanitizadas, [
      'steering_volantazos_extremos',
      'volantazos_extremos',
      'volantazos',
    ]) ??
    leerEnteroNoNegativo(subTelemetria, [
      'steering_volantazos_extremos',
      'volantazos_extremos',
      'volantazos',
    ]) ??
    leerEnteroNoNegativo(raiz, [
      'steering_volantazos_extremos',
      'volantazos_extremos',
      'volantazos',
    ]);

  const velocidadRaw =
    leerNumero(subSanitizadas, ['speed_max_estimada_kmh', 'velocidad_max_kmh', 'speed_max']) ??
    leerNumero(subTelemetria, ['speed_max_estimada_kmh', 'velocidad_max_kmh', 'speed_max']) ??
    leerNumero(raiz, ['speed_max_estimada_kmh', 'velocidad_max_kmh', 'speed_max']);
  const velocidadMaxKmh =
    velocidadRaw !== null && velocidadRaw >= 0 && velocidadRaw <= 100
      ? Math.round(velocidadRaw * 100) / 100
      : null;

  const frenadasPanico =
    leerEnteroNoNegativo(subSanitizadas, ['frenadas_panico_count', 'frenadas_panico', 'frenadas']) ??
    leerEnteroNoNegativo(subTelemetria, ['frenadas_panico_count', 'frenadas_panico', 'frenadas']) ??
    leerEnteroNoNegativo(raiz, ['frenadas_panico_count', 'frenadas_panico', 'frenadas']);

  const leerEnteroMulti = (claves: readonly string[]): number | null =>
    leerEnteroNoNegativo(subSanitizadas, claves) ??
    leerEnteroNoNegativo(subTelemetria, claves) ??
    leerEnteroNoNegativo(raiz, claves);

  const leerNumeroAcotadoMulti = (
    claves: readonly string[],
    min: number,
    max: number,
    decimales: number
  ): number | null => {
    const raw =
      leerNumero(subSanitizadas, claves) ??
      leerNumero(subTelemetria, claves) ??
      leerNumero(raiz, claves);
    if (raw === null || raw < min || raw > max) return null;
    const factor = 10 ** decimales;
    return Math.round(raw * factor) / factor;
  };

  const picosAceleracion = leerEnteroMulti([
    'accel_pad_picos_count',
    'picos_aceleracion',
    'picosAceleracion',
  ]);
  const porcentajeAceleradorFondo = leerNumeroAcotadoMulti(
    ['accel_pad_fondo_pct', 'porcentaje_acelerador_fondo', 'porcentajeAceleradorFondo'],
    0,
    100,
    1
  );
  const muestrasHorquillaElevada = leerEnteroMulti([
    'fork_height_muestras_elevadas',
    'muestras_horquilla_elevada',
    'muestrasHorquillaElevada',
  ]);
  const porcentajeCirculacionHorquillaAlta = leerNumeroAcotadoMulti(
    [
      'fork_height_elevada_pct',
      'porcentaje_circulacion_horquilla_alta',
      'porcentajeCirculacionHorquillaAlta',
    ],
    0,
    100,
    1
  );
  const alturaMaximaHorquillaM = leerNumeroAcotadoMulti(
    ['fork_height_max_m', 'altura_maxima_horquilla_m', 'alturaMaximaHorquillaM'],
    0,
    20,
    2
  );
  const oscilacionesMastil = leerEnteroMulti([
    'tilt_oscilaciones_count',
    'oscilaciones_mastil',
    'oscilacionesMastil',
  ]);
  const indiceInestabilidadTilt = leerNumeroAcotadoMulti(
    ['tilt_inestabilidad_index', 'indice_inestabilidad_tilt', 'indiceInestabilidadTilt'],
    0,
    100,
    3
  );

  const tieneAlgunDato =
    scorePuntos !== null ||
    tiempoDuracionSeg !== null ||
    indiceSerrucho !== null ||
    volantazosExtremos !== null ||
    frenadasPanico !== null ||
    velocidadMaxKmh !== null ||
    picosAceleracion !== null ||
    porcentajeCirculacionHorquillaAlta !== null ||
    oscilacionesMastil !== null ||
    colisionesRaw.length > 0 ||
    colisionesRealesNumero > 0 ||
    infraccionesFiltradas.length > 0 ||
    colisionesDescartadas > 0;

  if (!tieneAlgunDato) {
    throw new Error(
      'El JSON no contiene métricas reconocibles de telemetría del simulador (score, duración, colisiones, serrucho, frenadas o velocidad).'
    );
  }

  const hallazgosMastil = construirHallazgosMastil(
    colisionesRealesDetalle,
    infraccionesFiltradas
  );

  return {
    archivoFuente,
    studentName,
    studentId,
    exerciseName,
    exerciseStartTime,
    scorePuntos,
    tiempoDuracionSeg,
    colisionesReales: colisionesRealesNumero,
    colisionesDescartadas,
    colisionesDetalle: colisionesRealesDetalle,
    descartesDetalle: descartesNuevos,
    infraccionesConduccion: infraccionesFiltradas,
    indiceSerrucho,
    volantazosExtremos,
    velocidadMaxKmh,
    frenadasPanico,
    picosAceleracion,
    porcentajeAceleradorFondo,
    muestrasHorquillaElevada,
    porcentajeCirculacionHorquillaAlta,
    alturaMaximaHorquillaM,
    oscilacionesMastil,
    indiceInestabilidadTilt,
    clasificacionRiesgo: leerString(subClasificacion, ['riesgo', 'risk']),
    clasificacionAptitud: leerString(subClasificacion, ['aptitud', 'verdict']),
    hallazgosMastil,
    alertaFalsoPositivoSuelo: colisionesDescartadas > 0,
  };
}

/**
 * Clasifica de forma determinista el Perfil de Operador (5 arquetipos oficiales)
 * y emite la receta de horas y módulos recomendados cruzando telemetría + tablet.
 */
export function clasificarPerfilOperador(
  telemetria: MetricasSimulador,
  evaluacionCabina?: ContextoCabinaClasificacion | null
): ResultadoClasificacionOperador {
  const nivelRaw =
    evaluacionCabina?.nivelAsistencia ??
    evaluacionCabina?.asistenciaCabinaLegacy ??
    null;
  const nivel = nivelRaw ? nivelRaw.trim().toUpperCase() : null;
  const hardFail = evaluacionCabina?.hardFail === true;
  const scoreCabina = evaluacionCabina?.scoreCabina ?? null;
  const puntajesEjes = [
    evaluacionCabina?.puntajeLateralidad,
    evaluacionCabina?.puntajeTactoMandos,
    evaluacionCabina?.puntajeMastil,
    evaluacionCabina?.puntajeControlReceptividad,
  ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const ejesEnCero = puntajesEjes.filter((v) => v === 0).length;

  const {
    scorePuntos,
    tiempoDuracionSeg,
    colisionesReales,
    indiceSerrucho,
    volantazosExtremos,
    velocidadMaxKmh,
    frenadasPanico,
    picosAceleracion,
    porcentajeAceleradorFondo,
    porcentajeCirculacionHorquillaAlta,
    oscilacionesMastil,
    hallazgosMastil,
  } = telemetria;

  // 1. NOVATO: bajo rendimiento global o intervención crítica / hard-fail
  if (
    hardFail ||
    nivel === 'INTERVENCION_CRITICA' ||
    (scorePuntos !== null && scorePuntos < 55) ||
    (scoreCabina !== null && scoreCabina < 40) ||
    ejesEnCero >= 2
  ) {
    const horas = hardFail || nivel === 'INTERVENCION_CRITICA' ? 10 : 8;
    return {
      perfilOperador: 'NOVATO',
      etiquetaPerfil: 'Novato',
      horasRecomendadas: horas,
      rangoHorasTexto: '8 a 10 hs',
      modulosRecomendados: [
        'Familiarización integral de mandos, pedales y ergonomía de cabina',
        'Circuitos básicos de avance, detención controlada y marcha atrás sin carga',
        'Procedimiento guiado de horquillas e inclinación de mástil paso a paso',
      ],
      justificacion:
        'Baja puntuación global o requerimiento de intervención crítica del instructor en cabina.',
    };
  }

  // 2. SIN_NOCION_ESPACIO: problemas espaciales, radio de giro o errores de mástil/horquillas
  if (
    colisionesReales >= 2 ||
    evaluacionCabina?.puntajeLateralidad === 0 ||
    evaluacionCabina?.puntajeMastil === 0 ||
    hallazgosMastil.length >= 2 ||
    (porcentajeCirculacionHorquillaAlta !== null &&
      porcentajeCirculacionHorquillaAlta >= 25) ||
    (oscilacionesMastil !== null && oscilacionesMastil >= 4)
  ) {
    return {
      perfilOperador: 'SIN_NOCION_ESPACIO',
      etiquetaPerfil: 'Sin noción del espacio',
      horasRecomendadas: 8,
      rangoHorasTexto: '8 hs',
      modulosRecomendados: [
        'Geometría de giro con dirección trasera (barrido de contrapeso)',
        'Circulación y giro en pasillos estrechos con referencias visuales/espejos',
        'Control de cota segura de horquillas e inclinación de mástil con pallet',
      ],
      justificacion:
        'Se detectaron colisiones reiteradas o desvíos críticos de espacio lateral y altura de mástil.',
    };
  }

  // 3. APURADO: tiempo bajo/normal con picos agresivos de velocidad, acelerador, freno o volante
  const tiempoBajoOMedio = tiempoDuracionSeg === null || tiempoDuracionSeg <= 390;
  const senalExceso =
    (velocidadMaxKmh !== null && velocidadMaxKmh >= 11) ||
    (frenadasPanico !== null && frenadasPanico >= 2) ||
    (indiceSerrucho !== null && indiceSerrucho >= 2.0) ||
    (volantazosExtremos !== null && volantazosExtremos >= 3) ||
    (picosAceleracion !== null && picosAceleracion >= 3) ||
    (porcentajeAceleradorFondo !== null && porcentajeAceleradorFondo >= 35) ||
    (colisionesReales === 1 &&
      tiempoDuracionSeg !== null &&
      tiempoDuracionSeg < 330);

  if (tiempoBajoOMedio && senalExceso) {
    return {
      perfilOperador: 'APURADO',
      etiquetaPerfil: 'Apurado',
      horasRecomendadas: 6,
      rangoHorasTexto: '6 hs',
      modulosRecomendados: [
        'Control progresivo de acelerador y velocidad máxima en depósito',
        'Anticipación de frenado y reducción de volantazos en aproximación a racks',
        'Maniobras de estiba cadenciadas con verificación previa de entorno',
      ],
      justificacion:
        'Ritmo acelerado acompañado de picos de velocidad, frenadas bruscas o correcciones de volante.',
    };
  }

  // 4. INEFICIENTE: pocos choques pero tiempos excesivos o alta dependencia verbal/constante
  if (
    (tiempoDuracionSeg !== null && tiempoDuracionSeg > 450) ||
    nivel === 'INTERVENCION_CONSTANTE' ||
    nivel === 'ALTA' ||
    (colisionesReales <= 1 && scorePuntos !== null && scorePuntos < 75)
  ) {
    return {
      perfilOperador: 'INEFICIENTE',
      etiquetaPerfil: 'Ineficiente',
      horasRecomendadas: 7,
      rangoHorasTexto: '6 a 8 hs',
      modulosRecomendados: [
        'Fluidez operativa y encadenamiento continuo de toma, traslado y descarga',
        'Reducción de tiempos muertos con seguridad e independencia de guía verbal',
        'Práctica cronometrada Split 30/30 orientada a ritmo estándar de planta',
      ],
      justificacion:
        'Pocas colisiones graves pero tiempos elevados o dependencia sostenida del instructor.',
    };
  }

  // 5. EFICIENTE: desempeño óptimo y autónomo
  return {
    perfilOperador: 'EFICIENTE',
    etiquetaPerfil: 'Eficiente',
    horasRecomendadas: 4,
    rangoHorasTexto: '4 a 6 hs estándar',
    modulosRecomendados: [
      'Consolidación operativa en estiba multinivel y rampas con carga completa',
      'Evaluación integradora final orientada a pase directo a máquina real',
    ],
    justificacion:
      'Control equilibrado de velocidad, volante, mástil y bajas o nulas colisiones con autonomía en cabina.',
  };
}
