import type { MetricasSimulador } from '@/lib/telemetria/parser-simulador';
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
  rubrica: EvaluacionRubricaInterna
): InformeEmpleoIA {
  const scoreTxt = m.scorePuntos !== null ? `${m.scorePuntos} pts` : 'no informado';
  const serruchoTxt = m.indiceSerrucho !== null ? `${m.indiceSerrucho}` : 'S/D';
  const volantazosTxt =
    m.volantazosExtremos !== null ? `${m.volantazosExtremos}` : 'S/D';
  const frenadasTxt = m.frenadasPanico !== null ? `${m.frenadasPanico}` : 'S/D';
  const velTxt =
    m.velocidadMaxKmh !== null ? `${m.velocidadMaxKmh} km/h` : 'S/D';

  const punto1 =
    `El postulante ${ctx.nombreCompleto} (DNI ${ctx.dni}) registró un score de simulador de ${scoreTxt} ` +
    `en ${formatoMinutosSeg(m.tiempoDuracionSeg)}, con ${m.colisionesReales} colisión(es) real(es). ` +
    `En micro-telemetría de mandos presentó serrucho=${serruchoTxt}, volantazos extremos=${volantazosTxt}, ` +
    `frenadas de pánico=${frenadasTxt} y velocidad pico de ${velTxt}` +
    (ctx.nivelAsistenciaCabina
      ? `, bajo nivel de asistencia docente "${ctx.nivelAsistenciaCabina}".`
      : '.');

  let punto2: string;
  if (
    rubrica.notasFalsoNegativo.length === 0 &&
    rubrica.notasFalsoPositivo.length === 0
  ) {
    punto2 =
      'Auditoría consistente: no se detectaron colisiones fantasma por artefacto suelo (-2) ni contradicciones entre el puntaje global y la telemetría fina de dirección, frenado o intervención en cabina.';
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

  let punto3: string;
  switch (rubrica.dictamenSugerido) {
    case 'APTO_DIRECTO':
      punto3 =
        'Recomendación Dirección de Empleo: APTO DIRECTO para derivación prioritaria a prácticas en planta y postulación en empresas con autonomía operativa estándar.';
      break;
    case 'APTO_OBSERVACION':
      punto3 =
        'Recomendación Dirección de Empleo: APTO CON OBSERVACIÓN. Habilitado para continuidad del ciclo, priorizando refuerzo en precisión de giro, anticipación de frenado y autonomía gradual antes de pase a terreno.';
      break;
    case 'CONDICIONAL':
      punto3 =
        'Recomendación Dirección de Empleo: CONDICIONAL. Se sugiere asignar bloque adicional de nivelación en simulador (Split 30/30 con feedback dirigido) y reevaluar colisiones reales / estabilidad lateral previo a derivación laboral.';
      break;
    case 'NO_APTO':
      punto3 =
        'Recomendación Dirección de Empleo: NO APTO para máquina real en esta instancia debido a incidencias críticas de seguridad o alta dependencia del instructor. Requiere reinicio formativo o reorientación laboral.';
      break;
  }

  return {
    origen: 'FALLBACK_HEURISTICO',
    modelo: 'heuristica-determinista-titan-v1',
    generadoEn: new Date().toISOString(),
    dictamenSugerido: rubrica.dictamenSugerido,
    banderaFalsoPositivoSuelo: rubrica.banderaFalsoPositivoSuelo,
    banderaFalsoNegativoRiesgoOculto: rubrica.banderaFalsoNegativoRiesgoOculto,
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
  rubrica: EvaluacionRubricaInterna
): string {
  const payloadContexto = {
    postulante: {
      nombre: ctx.nombreCompleto,
      dni: ctx.dni,
      dictamen_cabina: ctx.dictamenCabina ?? null,
      nivel_asistencia_cabina: ctx.nivelAsistenciaCabina ?? null,
      bloque_split: ctx.bloqueSplit ?? null,
      score_cabina_90: ctx.scoreCabina ?? null,
      hard_fail: Boolean(ctx.hardFailCabina),
      motivo_hard_fail: ctx.motivoHardFailCabina ?? null,
      observaciones_cabina: ctx.observacionesCabina ?? [],
    },
    telemetria_titan_sanitizada: {
      archivo_fuente: m.archivoFuente,
      score_puntos: m.scorePuntos,
      duracion_seg: m.tiempoDuracionSeg,
      colisiones_reales: m.colisionesReales,
      colisiones_descartadas_suelo_bug_menos_2: m.colisionesDescartadas,
      indice_serrucho_direccion: m.indiceSerrucho,
      volantazos_extremos: m.volantazosExtremos,
      frenadas_panico: m.frenadasPanico,
      velocidad_max_kmh: m.velocidadMaxKmh,
      hallazgos_mastil: m.hallazgosMastil,
    },
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
    '2) ANTIFALSO NEGATIVO: No te dejes engañar por un score numérico alto (>80) si existen colisiones reales >= 2, índice serrucho >= 1.8, volantazos extremos >= 3, frenadas de pánico >= 2, fallas reiteradas de mástil, hard-fail o nivel de asistencia docente alto/crítico.',
    '3) SALIDA: Generá exactamente 3 puntos claros, concisos, profesionales y accionables en español rioplatense formal para la Dirección de Empleo.',
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
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return generarFallbackHeuristico(metricas, contexto, rubrica);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_GEMINI_MS);

  try {
    const bodyPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: construirPromptGemini(metricas, contexto, rubrica) }],
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
      return generarFallbackHeuristico(metricas, contexto, rubrica);
    }

    const respuestaCruda: unknown = await res.json();
    if (!esObjeto(respuestaCruda) || !Array.isArray(respuestaCruda.candidates)) {
      return generarFallbackHeuristico(metricas, contexto, rubrica);
    }

    const primerCandidato = respuestaCruda.candidates[0];
    if (!esObjeto(primerCandidato) || !esObjeto(primerCandidato.content)) {
      return generarFallbackHeuristico(metricas, contexto, rubrica);
    }

    const parts = primerCandidato.content.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      return generarFallbackHeuristico(metricas, contexto, rubrica);
    }

    const primeraParte = parts[0];
    if (!esObjeto(primeraParte) || typeof primeraParte.text !== 'string') {
      return generarFallbackHeuristico(metricas, contexto, rubrica);
    }

    const jsonEstructurado = extraerJsonDeTexto(primeraParte.text);
    if (!esObjeto(jsonEstructurado)) {
      return generarFallbackHeuristico(metricas, contexto, rubrica);
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
      return generarFallbackHeuristico(metricas, contexto, rubrica);
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
    return generarFallbackHeuristico(metricas, contexto, rubrica);
  } finally {
    clearTimeout(timer);
  }
}
