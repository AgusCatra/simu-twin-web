import {
  clasificarPerfilOperador,
  type MetricasSimulador,
  type PerfilOperador,
  type ResultadoClasificacionOperador,
} from '@/lib/telemetria/parser-simulador';
import type { BloqueSplit, NivelAsistencia } from '@/types/cabina';

/**
 * Motor de generación de informes para Dirección de Empleo (Pipeline TITAN + Cabina).
 *
 * - Usa Gemini 2.5 Flash mediante fetch nativo al endpoint generativelanguage.
 * - Aplica la rúbrica antifalsos positivos (descarte bug suelo -2 / conducción
 *   metódica vs lentitud) y antifalsos negativos (auditoría de score inflado vs
 *   colisiones reales, serrucho, volantazos, frenadas de pánico e intervención
 *   docente en cabina).
 * - Si falta `GEMINI_API_KEY`, excede el timeout (8.5 s) o devuelve respuesta
 *   inválida, ejecuta el fallback heurístico determinista sin bloquear al operador.
 */

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_MODEL = 'gemini-2.5-flash';
const TIMEOUT_GEMINI_MS = 8500;

export type DictamenInformeIA =
  | 'APTO_DIRECTO'
  | 'APTO_OBSERVACION'
  | 'CONDICIONAL'
  | 'NO_APTO';

export interface ContextoPostulanteIA {
  nombreCompleto: string;
  dni: string;
  dictamenCabina?: string | null;
  nivelAsistenciaCabina?: NivelAsistencia | string | null;
  asistenciaCabinaLegacy?: string | null;
  bloqueSplit?: BloqueSplit | string | null;
  scoreCabina?: number | null;
  puntajeLateralidad?: number | null;
  puntajeTactoMandos?: number | null;
  puntajeMastil?: number | null;
  puntajeControlReceptividad?: number | null;
  hardFailCabina?: boolean;
  motivoHardFailCabina?: string | null;
  observacionesCabina?: string[] | null;
  notasEmpleo?: string | null;
}

export interface PuntoInformeEmpleo {
  titulo: string;
  detalle: string;
}

export interface InformeEmpleoIA {
  origen: 'GEMINI_2_5_FLASH' | 'FALLBACK_HEURISTICO';
  modelo: string;
  generadoEn: string;
  dictamenSugerido: DictamenInformeIA;
  banderaFalsoPositivoSuelo: boolean;
  banderaFalsoNegativoRiesgoOculto: boolean;
  perfilOperador?: PerfilOperador;
  etiquetaPerfilOperador?: string;
  horasRecomendadas?: number;
  rangoHorasTexto?: string;
  modulosRecomendados?: string[];
  puntos: [PuntoInformeEmpleo, PuntoInformeEmpleo, PuntoInformeEmpleo];
}

interface EvaluacionRubricaInterna {
  dictamenSugerido: DictamenInformeIA;
  banderaFalsoPositivoSuelo: boolean;
  banderaFalsoNegativoRiesgoOculto: boolean;
  falsoPositivoRitmoMetodico: boolean;
  notasFalsoNegativo: string[];
  notasFalsoPositivo: string[];
}

const DICTAMENES_IA_VALIDOS: readonly DictamenInformeIA[] = [
  'APTO_DIRECTO',
  'APTO_OBSERVACION',
  'CONDICIONAL',
  'NO_APTO',
];

function esDictamenIAValido(v: unknown): v is DictamenInformeIA {
  return (
    typeof v === 'string' &&
    (DICTAMENES_IA_VALIDOS as readonly string[]).includes(v)
  );
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function formatoMinutosSeg(seg: number | null): string {
  if (seg === null || !Number.isFinite(seg)) return 'sin registro';
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}m ${String(s).padStart(2, '0')}s (${seg} s)`;
}

function evaluarRubricaAntiFalsos(
  m: MetricasSimulador,
  ctx: ContextoPostulanteIA
): EvaluacionRubricaInterna {
  const notasFalsoPositivo: string[] = [];
  const notasFalsoNegativo: string[] = [];

  const serrucho = m.indiceSerrucho;
  const frenadas = m.frenadasPanico;
  const volantazos = m.volantazosExtremos;
  const colReales = m.colisionesReales;
  const colDescartadas = m.colisionesDescartadas;
  const duracion = m.tiempoDuracionSeg;
  const score = m.scorePuntos;

  const banderaFalsoPositivoSuelo =
    colDescartadas > 0 || m.alertaFalsoPositivoSuelo;
  if (banderaFalsoPositivoSuelo) {
    notasFalsoPositivo.push(
      `Se depuraron ${colDescartadas} contacto(s) fantasma contra malla/suelo (bug -2 del sensor de mástil) que no corresponden a error del alumno.`
    );
  }

  const falsoPositivoRitmoMetodico =
    duracion !== null &&
    duracion >= 420 &&
    colReales === 0 &&
    (serrucho === null || serrucho < 1.8) &&
    (frenadas === null || frenadas <= 1);
  if (falsoPositivoRitmoMetodico) {
    notasFalsoPositivo.push(
      `Duración extensa (${formatoMinutosSeg(duracion)}) acompañada de 0 colisiones reales y volante estable: refleja operación cautelosa/metódica y no incapacidad técnica.`
    );
  }

  const nivelCabina = ctx.nivelAsistenciaCabina ?? ctx.asistenciaCabinaLegacy ?? null;
  const intervencionAltaCabina =
    nivelCabina === 'INTERVENCION_CONSTANTE' ||
    nivelCabina === 'INTERVENCION_CRITICA' ||
    nivelCabina === 'ALTA';

  if (colReales >= 2) {
    notasFalsoNegativo.push(
      `${colReales} colisiones reales verificadas contra estanterías/obstáculos.`
    );
  }
  if (serrucho !== null && serrucho >= 1.8) {
    notasFalsoNegativo.push(
      `Índice de serrucho en volante elevado (${serrucho}), señal de sobre-corrección lateral.`
    );
  }
  if (volantazos !== null && volantazos >= 3) {
    notasFalsoNegativo.push(
      `${volantazos} volantazos extremos registrados contra topes mecánicos.`
    );
  }
  if (frenadas !== null && frenadas >= 2) {
    notasFalsoNegativo.push(
      `${frenadas} frenadas de pánico detectadas por falta de anticipación.`
    );
  }
  if (m.hallazgosMastil.length >= 2) {
    notasFalsoNegativo.push(
      `${m.hallazgosMastil.length} alertas reales vinculadas al procedimiento de mástil/horquillas.`
    );
  }
  if (ctx.hardFailCabina || intervencionAltaCabina) {
    notasFalsoNegativo.push(
      ctx.hardFailCabina
        ? `Hard-Fail activo en consola de cabina${ctx.motivoHardFailCabina ? `: ${ctx.motivoHardFailCabina}` : '.'}`
        : `Asistencia docente alta (${nivelCabina}) requerida durante la práctica en cabina.`
    );
  }

  const scoreAltoEnPapel = score !== null && score >= 80;
  const banderaFalsoNegativoRiesgoOculto =
    scoreAltoEnPapel && notasFalsoNegativo.length > 0;

  let dictamenSugerido: DictamenInformeIA;
  if (
    ctx.hardFailCabina ||
    colReales >= 4 ||
    (score !== null && score < 50) ||
    nivelCabina === 'INTERVENCION_CRITICA'
  ) {
    dictamenSugerido = 'NO_APTO';
  } else if (
    colReales >= 2 ||
    (serrucho !== null && serrucho >= 3.2) ||
    (frenadas !== null && frenadas >= 3) ||
    (volantazos !== null && volantazos >= 5)
  ) {
    dictamenSugerido = 'CONDICIONAL';
  } else if (
    colReales === 1 ||
    (serrucho !== null && serrucho >= 1.8) ||
    (frenadas !== null && frenadas >= 1) ||
    (volantazos !== null && volantazos >= 2) ||
    nivelCabina === 'AYUDA_VERBAL' ||
    nivelCabina === 'INTERVENCION_CONSTANTE' ||
    nivelCabina === 'MEDIA' ||
    nivelCabina === 'ALTA'
  ) {
    dictamenSugerido = 'APTO_OBSERVACION';
  } else {
    dictamenSugerido = 'APTO_DIRECTO';
  }

  return {
    dictamenSugerido,
    banderaFalsoPositivoSuelo,
    banderaFalsoNegativoRiesgoOculto,
    falsoPositivoRitmoMetodico,
    notasFalsoNegativo,
    notasFalsoPositivo,
  };
}

function generarFallbackHeuristico(
  m: MetricasSimulador,
  ctx: ContextoPostulanteIA,
  rubrica: EvaluacionRubricaInterna,
  clasificacion: ResultadoClasificacionOperador
): InformeEmpleoIA {
  const scoreTxt = m.scorePuntos !== null ? `${m.scorePuntos} pts` : 'no informado';
  const serruchoTxt = m.indiceSerrucho !== null ? `${m.indiceSerrucho}` : 'S/D';
  const volantazosTxt =
    m.volantazosExtremos !== null ? `${m.volantazosExtremos}` : 'S/D';
  const frenadasTxt = m.frenadasPanico !== null ? `${m.frenadasPanico}` : 'S/D';
  const velTxt =
    m.velocidadMaxKmh !== null ? `${m.velocidadMaxKmh} km/h` : 'S/D';
  const horquillaTxt =
    m.porcentajeCirculacionHorquillaAlta !== null
      ? `${m.porcentajeCirculacionHorquillaAlta}%`
      : 'S/D';
  const accelFondoTxt =
    m.porcentajeAceleradorFondo !== null ? `${m.porcentajeAceleradorFondo}%` : 'S/D';

  const punto1 =
    `El postulante ${ctx.nombreCompleto} (DNI ${ctx.dni}) clasificó como perfil "${clasificacion.etiquetaPerfil}" ` +
    `con score de simulador de ${scoreTxt} en ${formatoMinutosSeg(m.tiempoDuracionSeg)} y ${m.colisionesReales} colisión(es) real(es). ` +
    `En telemetría de las 6 curvas registró serrucho=${serruchoTxt}, volantazos=${volantazosTxt}, ` +
    `frenadas de pánico=${frenadasTxt}, velocidad pico=${velTxt}, acelerador a fondo=${accelFondoTxt} y circulación con horquilla alta=${horquillaTxt}` +
    (ctx.nivelAsistenciaCabina
      ? `, bajo nivel de asistencia docente "${ctx.nivelAsistenciaCabina}".`
      : '.');

  let punto2: string;
  if (
    rubrica.notasFalsoNegativo.length === 0 &&
    rubrica.notasFalsoPositivo.length === 0
  ) {
    punto2 =
      'Auditoría consistente: no se detectaron colisiones fantasma por artefacto suelo (-2) ni contradicciones entre el puntaje global y la telemetría fina de dirección, frenado, mástil o intervención en cabina.';
  } else {
    const bloques: string[] = [];
    if (rubrica.notasFalsoPositivo.length > 0) {
      bloques.push(
        `Antifalso Positivo: ${rubrica.notasFalsoPositivo.join(' ')}`
      );
    }
    if (rubrica.notasFalsoNegativo.length > 0) {
      bloques.push(
        `${
          rubrica.banderaFalsoNegativoRiesgoOculto
            ? 'ALERTA Antifalso Negativo (score numérico alto oculta riesgos reales): '
            : 'Riesgos técnicos detectados: '
        }${rubrica.notasFalsoNegativo.join(' ')}`
      );
    }
    punto2 = bloques.join(' ');
  }

  let baseDictamenTxt: string;
  switch (rubrica.dictamenSugerido) {
    case 'APTO_DIRECTO':
      baseDictamenTxt =
        'APTO DIRECTO para derivación prioritaria a prácticas en planta con autonomía operativa estándar.';
      break;
    case 'APTO_OBSERVACION':
      baseDictamenTxt =
        'APTO CON OBSERVACIÓN para continuidad del ciclo, priorizando consolidar precisión antes del pase a terreno.';
      break;
    case 'CONDICIONAL':
      baseDictamenTxt =
        'CONDICIONAL con asignación de bloque de nivelación Split 30/30 y reevaluación previa a derivación laboral.';
      break;
    case 'NO_APTO':
      baseDictamenTxt =
        'NO APTO para máquina real en esta instancia por incidencias críticas de seguridad o alta dependencia del instructor.';
      break;
  }

  const punto3 =
    `Perfil ${clasificacion.etiquetaPerfil.toUpperCase()} · Carga sugerida: ${clasificacion.rangoHorasTexto} (${clasificacion.horasRecomendadas} hs). ` +
    `Dictamen Empleo: ${baseDictamenTxt} Módulos recomendados: ${clasificacion.modulosRecomendados.join('; ')}.`;

  return {
    origen: 'FALLBACK_HEURISTICO',
    modelo: 'heuristica-determinista-titan-v2',
    generadoEn: new Date().toISOString(),
    dictamenSugerido: rubrica.dictamenSugerido,
    banderaFalsoPositivoSuelo: rubrica.banderaFalsoPositivoSuelo,
    banderaFalsoNegativoRiesgoOculto: rubrica.banderaFalsoNegativoRiesgoOculto,
    perfilOperador: clasificacion.perfilOperador,
    etiquetaPerfilOperador: clasificacion.etiquetaPerfil,
    horasRecomendadas: clasificacion.horasRecomendadas,
    rangoHorasTexto: clasificacion.rangoHorasTexto,
    modulosRecomendados: clasificacion.modulosRecomendados,
    puntos: [
      { titulo: '01 · SÍNTESIS TÉCNICA Y TELEMETRÍA', detalle: punto1 },
      {
        titulo: '02 · AUDITORÍA ANTIFALSOS POSITIVOS / NEGATIVOS',
        detalle: punto2,
      },
      {
        titulo: '03 · RECOMENDACIÓN PARA DIRECCIÓN DE EMPLEO',
        detalle: punto3,
      },
    ],
  };
}

function construirPromptGemini(
  m: MetricasSimulador,
  ctx: ContextoPostulanteIA,
  rubrica: EvaluacionRubricaInterna,
  clasificacion: ResultadoClasificacionOperador
): string {
  const payloadContexto = {
    postulante: {
      nombre: ctx.nombreCompleto,
      dni: ctx.dni,
      dictamen_cabina: ctx.dictamenCabina ?? null,
      nivel_asistencia_cabina: ctx.nivelAsistenciaCabina ?? null,
      bloque_split: ctx.bloqueSplit ?? null,
      score_cabina_90: ctx.scoreCabina ?? null,
      puntajes_ejes_0_a_20: {
        lateralidad: ctx.puntajeLateralidad ?? null,
        tacto_mandos: ctx.puntajeTactoMandos ?? null,
        mastil: ctx.puntajeMastil ?? null,
        control_receptividad: ctx.puntajeControlReceptividad ?? null,
      },
      hard_fail: Boolean(ctx.hardFailCabina),
      motivo_hard_fail: ctx.motivoHardFailCabina ?? null,
      observaciones_cabina: ctx.observacionesCabina ?? [],
    },
    telemetria_titan_6_curvas: {
      archivo_fuente: m.archivoFuente,
      score_puntos: m.scorePuntos,
      duracion_seg: m.tiempoDuracionSeg,
      colisiones_reales: m.colisionesReales,
      colisiones_descartadas_suelo_bug_menos_2: m.colisionesDescartadas,
      indice_serrucho_direccion: m.indiceSerrucho,
      volantazos_extremos: m.volantazosExtremos,
      frenadas_panico: m.frenadasPanico,
      velocidad_max_kmh: m.velocidadMaxKmh,
      picos_aceleracion: m.picosAceleracion,
      porcentaje_acelerador_fondo: m.porcentajeAceleradorFondo,
      muestras_horquilla_elevada: m.muestrasHorquillaElevada,
      porcentaje_horquilla_alta: m.porcentajeCirculacionHorquillaAlta,
      altura_max_horquilla_m: m.alturaMaximaHorquillaM,
      oscilaciones_mastil_tilt: m.oscilacionesMastil,
      inestabilidad_tilt_index: m.indiceInestabilidadTilt,
      hallazgos_mastil: m.hallazgosMastil,
    },
    perfil_operador_clasificado: clasificacion,
    preanalisis_rubrica: {
      bandera_falso_positivo_suelo: rubrica.banderaFalsoPositivoSuelo,
      bandera_falso_negativo_riesgo_oculto:
        rubrica.banderaFalsoNegativoRiesgoOculto,
      dictamen_base_sugerido: rubrica.dictamenSugerido,
    },
  };

  return [
    'Actuás como Auditor Técnico Senior del Centro Municipal de Entrenamiento en Simuladores de Autoelevadores (Venado Tuerto) asistiendo a la Dirección de Empleo.',
    'Analizá los datos estructurados del postulante aplicando ESTRICTAMENTE la Rúbrica Antifalsos Positivos y Antifalsos Negativos:',
    '1) ANTIFALSO POSITIVO: Jamás castigues al postulante por colisiones fantasma contra suelo/malla ("bug -2" ya depuradas en colisiones_descartadas). Si la duración es lenta pero con 0 colisiones reales y serrucho < 1.8, destacalo como precaución metódica.',
    '2) ANTIFALSO NEGATIVO: No te dejes engañar por un score numérico alto (>80) si existen colisiones reales >= 2, índice serrucho >= 1.8, volantazos extremos >= 3, frenadas de pánico >= 2, circulación elevada con horquillas altas, fallas reiteradas de mástil, hard-fail o nivel de asistencia docente alto/crítico.',
    '3) SALIDA: Generá exactamente 3 puntos claros, concisos, profesionales y accionables en español rioplatense formal para la Dirección de Empleo, integrando explícitamente el perfil de operador clasificado, la carga horaria recomendada y los módulos de práctica.',
    `Datos del caso: ${JSON.stringify(payloadContexto)}`,
  ].join('\n');
}

function extraerJsonDeTexto(texto: string): unknown {
  const limpio = texto.trim();
  const bloque = limpio.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidato = bloque ? bloque[1].trim() : limpio;
  return JSON.parse(candidato);
}

/**
 * Genera el informe de 3 puntos para la Dirección de Empleo utilizando
 * Gemini 2.5 Flash vía `fetch` nativo, o el motor heurístico determinista si
 * falta `GEMINI_API_KEY` o la API externa falla/expira.
 */
export async function generarInformeEmpleoIA(
  metricas: MetricasSimulador,
  contexto: ContextoPostulanteIA
): Promise<InformeEmpleoIA> {
  const rubrica = evaluarRubricaAntiFalsos(metricas, contexto);
  const clasificacion = clasificarPerfilOperador(metricas, {
    puntajeLateralidad: contexto.puntajeLateralidad,
    puntajeTactoMandos: contexto.puntajeTactoMandos,
    puntajeMastil: contexto.puntajeMastil,
    puntajeControlReceptividad: contexto.puntajeControlReceptividad,
    scoreCabina: contexto.scoreCabina,
    nivelAsistencia: contexto.nivelAsistenciaCabina,
    asistenciaCabinaLegacy: contexto.asistenciaCabinaLegacy,
    hardFail: contexto.hardFailCabina,
  });
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_GEMINI_MS);

  try {
    const bodyPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: construirPromptGemini(
                metricas,
                contexto,
                rubrica,
                clasificacion
              ),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            punto_1_desempeno_tecnico: { type: 'STRING' },
            punto_2_auditoria_riesgos: { type: 'STRING' },
            punto_3_recomendacion_empleo: { type: 'STRING' },
            dictamen_sugerido: { type: 'STRING' },
          },
          required: [
            'punto_1_desempeno_tecnico',
            'punto_2_auditoria_riesgos',
            'punto_3_recomendacion_empleo',
            'dictamen_sugerido',
          ],
        },
      },
    };

    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      console.warn('[generador-informe] Gemini HTTP no satisfactorio:', res.status);
      return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
    }

    const respuestaCruda: unknown = await res.json();
    if (!esObjeto(respuestaCruda) || !Array.isArray(respuestaCruda.candidates)) {
      return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
    }

    const primerCandidato = respuestaCruda.candidates[0];
    if (!esObjeto(primerCandidato) || !esObjeto(primerCandidato.content)) {
      return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
    }

    const parts = primerCandidato.content.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
    }

    const primeraParte = parts[0];
    if (!esObjeto(primeraParte) || typeof primeraParte.text !== 'string') {
      return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
    }

    const jsonEstructurado = extraerJsonDeTexto(primeraParte.text);
    if (!esObjeto(jsonEstructurado)) {
      return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
    }

    const p1 = jsonEstructurado.punto_1_desempeno_tecnico;
    const p2 = jsonEstructurado.punto_2_auditoria_riesgos;
    const p3 = jsonEstructurado.punto_3_recomendacion_empleo;
    const dictamenIA = jsonEstructurado.dictamen_sugerido;

    if (
      typeof p1 !== 'string' ||
      p1.trim().length < 10 ||
      typeof p2 !== 'string' ||
      p2.trim().length < 10 ||
      typeof p3 !== 'string' ||
      p3.trim().length < 10
    ) {
      return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
    }

    // Blindaje: un Hard-Fail de cabina jamás puede ser suavizado por el LLM.
    const dictamenFinal = contexto.hardFailCabina
      ? 'NO_APTO'
      : esDictamenIAValido(dictamenIA)
        ? dictamenIA
        : rubrica.dictamenSugerido;

    return {
      origen: 'GEMINI_2_5_FLASH',
      modelo: GEMINI_MODEL,
      generadoEn: new Date().toISOString(),
      dictamenSugerido: dictamenFinal,
      banderaFalsoPositivoSuelo: rubrica.banderaFalsoPositivoSuelo,
      banderaFalsoNegativoRiesgoOculto: rubrica.banderaFalsoNegativoRiesgoOculto,
      perfilOperador: clasificacion.perfilOperador,
      etiquetaPerfilOperador: clasificacion.etiquetaPerfil,
      horasRecomendadas: clasificacion.horasRecomendadas,
      rangoHorasTexto: clasificacion.rangoHorasTexto,
      modulosRecomendados: clasificacion.modulosRecomendados,
      puntos: [
        {
          titulo: '01 · SÍNTESIS TÉCNICA Y TELEMETRÍA',
          detalle: p1.trim().slice(0, 1000),
        },
        {
          titulo: '02 · AUDITORÍA ANTIFALSOS POSITIVOS / NEGATIVOS',
          detalle: p2.trim().slice(0, 1000),
        },
        {
          titulo: '03 · RECOMENDACIÓN PARA DIRECCIÓN DE EMPLEO',
          detalle: p3.trim().slice(0, 1000),
        },
      ],
    };
  } catch (err) {
    console.warn('[generador-informe] Fallback heurístico por error/timeout:', {
      tipo: err instanceof Error ? err.name : 'desconocido',
    });
    return generarFallbackHeuristico(metricas, contexto, rubrica, clasificacion);
  } finally {
    clearTimeout(timer);
  }
}
