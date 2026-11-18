import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  clasificarRiesgoYAptitud,
  construirHallazgosMastil,
  esArtefactoSueloTitan,
  hmsASegundos,
  normalizarNombreAlumno,
  type EventoFaltaSimulador,
  type MetricasSimulador,
  type OpcionesParseoSimulador,
} from '@/lib/telemetria/parser-simulador';

/** Límite de seguridad para PDFs exportados desde el simulador ETECH (20 MB). */
export const MAX_BYTES_REPORTE_PDF = 20 * 1024 * 1024;

type CanalCurva =
  | 'accel_pad'
  | 'brake'
  | 'fork_height'
  | 'tilt_angle'
  | 'steering'
  | 'speed';

const IDX_ACCEL_PAD = 3;
const IDX_BRAKE = 4;
const IDX_FORK_HEIGHT = 7;
const IDX_TILT_ANGLE = 8;
const IDX_STEERING = 9;
const IDX_SPEED = 10;

const PASO_GRID_CANAL: Record<CanalCurva, number> = {
  accel_pad: 1.0,
  brake: 1.0,
  fork_height: 0.5,
  tilt_angle: 2.0,
  steering: 5.0,
  speed: 0.5,
};

const MESES_INGLES: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const CAMPOS_PORTADA = [
  'Penalties',
  'Task Of Exercise',
  'Score',
  'Student Name',
  'Student Id',
  'Class name',
  'Class Id',
  'Instructor Name',
  'Exercise Name',
  'Equipment Name',
  'Exercise Start Time',
  'Exercise Duration',
] as const;

const TIPOS_LOG_VALIDOS = new Set([
  'PrechecksViolation',
  'Driving',
  'Collision',
  'ExerciseTasks',
  'VehicleParking',
]);

const RE_HORA_HMS = /^\d{2}:\d{2}:\d{2}$/;

interface FragmentoTextoPdf {
  str: string;
  x: number;
  y: number;
}

interface LineaTextoPdf {
  y: number;
  texto: string;
  fragmentos: FragmentoTextoPdf[];
}

interface FilaAssessmentPdf {
  timestamp: string;
  descripcion: string;
  tipo: string;
  marks: number;
}

interface SerieDigitalizada {
  vals: number[];
  vMax: number;
  vMin: number;
}

function esFragmentoTextoPdf(item: unknown): item is { str: string; transform: number[] } {
  if (typeof item !== 'object' || item === null) return false;
  const rec = item as Record<string, unknown>;
  return (
    typeof rec.str === 'string' &&
    Array.isArray(rec.transform) &&
    rec.transform.length >= 6 &&
    typeof rec.transform[4] === 'number' &&
    typeof rec.transform[5] === 'number'
  );
}

async function extraerFragmentosYLineas(page: PDFPageProxy): Promise<{
  fragmentos: FragmentoTextoPdf[];
  lineas: LineaTextoPdf[];
  textoCompleto: string;
}> {
  const tc = await page.getTextContent();
  const fragmentos: FragmentoTextoPdf[] = [];

  for (const item of tc.items) {
    if (!esFragmentoTextoPdf(item)) continue;
    const str = item.str.replace(/\s+/g, ' ').trim();
    if (!str) continue;
    fragmentos.push({
      str,
      x: item.transform[4],
      y: item.transform[5],
    });
  }

  const filas: Array<{ y: number; fragmentos: FragmentoTextoPdf[] }> = [];
  for (const frag of fragmentos) {
    const fila = filas.find((f) => Math.abs(f.y - frag.y) <= 2.5);
    if (fila) {
      fila.fragmentos.push(frag);
    } else {
      filas.push({ y: frag.y, fragmentos: [frag] });
    }
  }

  filas.sort((a, b) => b.y - a.y);

  const lineas: LineaTextoPdf[] = filas.map((f) => {
    const ordenados = [...f.fragmentos].sort((a, b) => a.x - b.x);
    const texto = ordenados
      .map((p) => p.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { y: f.y, texto, fragmentos: ordenados };
  });

  const textoCompleto = lineas.map((l) => l.texto).join('\n');
  return { fragmentos, lineas, textoCompleto };
}

function parseFloatSeguro(cad: string | null | undefined): number | null {
  if (!cad) return null;
  const normalizado = cad.trim().replace(',', '.');
  const match = normalizado.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function convertirFechaEtechIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const limpio = raw.replace(/\s+/g, ' ').trim();
  const m = limpio.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)$/i
  );
  if (!m) {
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(limpio)) {
      return limpio.replace(' ', 'T').slice(0, 19);
    }
    return limpio;
  }

  const dia = Number(m[1]);
  const mes = MESES_INGLES[m[2].toLowerCase()];
  const anio = Number(m[3]);
  let hora = Number(m[4]);
  const min = Number(m[5]);
  const ampm = m[6].toLowerCase();

  if (!mes || dia < 1 || dia > 31 || hora < 1 || hora > 12 || min > 59) {
    return limpio;
  }

  if (ampm === 'pm' && hora !== 12) hora += 12;
  if (ampm === 'am' && hora === 12) hora = 0;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${anio}-${pad(mes)}-${pad(dia)}T${pad(hora)}:${pad(min)}:00`;
}

function parsearPortada(lineas: readonly LineaTextoPdf[]): Record<string, string> {
  const out: Record<string, string> = {};
  const ordenCampos = [...CAMPOS_PORTADA].sort((a, b) => b.length - a.length);

  for (let i = 0; i < lineas.length; i++) {
    const texto = lineas[i].texto;
    for (const campo of ordenCampos) {
      if (campo in out) continue;
      if (texto === campo && i + 1 < lineas.length) {
        out[campo] = lineas[i + 1].texto;
        break;
      }
      if (texto.startsWith(`${campo} `)) {
        const valor = texto.slice(campo.length).trim();
        if (valor.length > 0) {
          out[campo] = valor;
        }
        break;
      }
    }
  }

  return out;
}

function parsearAssessmentLogPagina(
  fragmentos: readonly FragmentoTextoPdf[]
): FilaAssessmentPdf[] {
  interface AnclaFila {
    y: number;
    timestamp: string;
    tipo: string;
    marks: number;
    descMismoRenglon: string[];
  }

  const filasY: Array<{ y: number; fragmentos: FragmentoTextoPdf[] }> = [];
  for (const f of fragmentos) {
    const existente = filasY.find((r) => Math.abs(r.y - f.y) <= 2.5);
    if (existente) existente.fragmentos.push(f);
    else filasY.push({ y: f.y, fragmentos: [f] });
  }
  filasY.sort((a, b) => b.y - a.y);

  const anclas: AnclaFila[] = [];
  const fragmentosTextoLibre: FragmentoTextoPdf[] = [];

  for (const fila of filasY) {
    const frags = [...fila.fragmentos].sort((a, b) => a.x - b.x);
    const join = frags.map((f) => f.str).join(' ');
    const tieneTiempo = frags.find((f) => RE_HORA_HMS.test(f.str));
    const tieneNumeroFila = frags.some((f) => /^\d+$/.test(f.str) && f.x < 100);
    const tipoMatch = frags.find((f) => TIPOS_LOG_VALIDOS.has(f.str));

    if (tieneTiempo && tieneNumeroFila && tipoMatch) {
      let marks = 0;
      const derecha = frags.filter((f) => f.x > tipoMatch.x);
      for (const d of derecha) {
        const parsed = parseFloatSeguro(d.str);
        if (parsed !== null) marks = parsed;
      }
      if (marks === 0) {
        const mFallback = join.match(/([+-]?\d+\.\d{2})\s*$/);
        if (mFallback) marks = Number(mFallback[1]);
      }

      const descMismoRenglon = frags
        .filter(
          (f) =>
            f !== tieneTiempo &&
            f !== tipoMatch &&
            f.x > tieneTiempo.x + 10 &&
            f.x < tipoMatch.x - 5
        )
        .map((f) => f.str);

      anclas.push({
        y: fila.y,
        timestamp: tieneTiempo.str,
        tipo: tipoMatch.str,
        marks,
        descMismoRenglon,
      });
    } else {
      for (const f of frags) {
        if (
          f.x >= 115 &&
          f.x <= 425 &&
          !/^(Assessment Log|Fault Log|S no\.|Sim Time|Description|Type|Marks|Obtain|https:\/\/)/i.test(
            f.str
          ) &&
          !/^\d+\/\d+$/.test(f.str) &&
          !/^\d{1,2}\/\d{1,2}\/\d{2},\s*\d{1,2}:\d{2}/.test(f.str)
        ) {
          fragmentosTextoLibre.push(f);
        }
      }
    }
  }

  if (anclas.length === 0) return [];

  const mapaExtras = new Map<AnclaFila, FragmentoTextoPdf[]>();
  for (const a of anclas) mapaExtras.set(a, []);

  for (const frag of fragmentosTextoLibre) {
    let mejor: AnclaFila | null = null;
    let mejorDist = Number.POSITIVE_INFINITY;
    for (const a of anclas) {
      const dist = Math.abs(frag.y - a.y);
      if (dist < mejorDist && dist <= 18) {
        mejorDist = dist;
        mejor = a;
      }
    }
    if (mejor) {
      mapaExtras.get(mejor)?.push(frag);
    }
  }

  return anclas.map((a) => {
    const extras = (mapaExtras.get(a) ?? []).sort((p, q) =>
      Math.abs(p.y - q.y) > 2 ? q.y - p.y : p.x - q.x
    );
    const partes =
      extras.length > 0
        ? [
            ...extras.filter((e) => e.y > a.y + 2).map((e) => e.str),
            ...a.descMismoRenglon,
            ...extras.filter((e) => e.y <= a.y + 2).map((e) => e.str),
          ]
        : a.descMismoRenglon;

    const descripcion = partes.join(' ').replace(/\s+/g, ' ').trim();
    return {
      timestamp: a.timestamp,
      descripcion: descripcion || a.tipo,
      tipo: a.tipo,
      marks: a.marks,
    };
  });
}

function parsearConsoleEvents(
  lineasPaginas: readonly LineaTextoPdf[][]
): {
  desconexionesCinturonMov: EventoFaltaSimulador[];
  saturacionesPalancas: EventoFaltaSimulador[];
} {
  const regexFila =
    /^(\d{2}:\d{2}:\d{2})\s+(.+?)\s+([+-]?\d+(?:\.\d+)?|ON|OFF|START)$/i;

  let seatbeltVistoOn = false;
  const desconexionesCinturonMov: EventoFaltaSimulador[] = [];
  const saturacionesPalancas: EventoFaltaSimulador[] = [];

  const enSaturacion: Record<string, boolean> = {
    'Fork Up/ Down': false,
    'Fork Tilt': false,
    'Fork Left/ Right': false,
  };

  for (const lineas of lineasPaginas) {
    for (const linea of lineas) {
      const m = linea.texto.match(regexFila);
      if (!m) continue;
      const ts = m[1];
      const evento = m[2].trim();
      const status = m[3].trim();
      const seg = hmsASegundos(ts) ?? 0;

      if (evento === 'Seat Belt') {
        const up = status.toUpperCase();
        if (up === 'ON') {
          seatbeltVistoOn = true;
        } else if (up === 'OFF' && (seatbeltVistoOn || seg >= 30)) {
          desconexionesCinturonMov.push({
            timestamp: ts,
            descripcion: 'Desconexión de cinturón de seguridad en movimiento (Seat Belt OFF)',
            tipo: 'DESCONEXION_CINTURON_MOVIMIENTO',
          });
        }
      } else if (evento in enSaturacion) {
        const val = parseFloatSeguro(status);
        const activo = val !== null && Math.abs(val) >= 9.9;
        if (activo && !enSaturacion[evento]) {
          enSaturacion[evento] = true;
          saturacionesPalancas.push({
            timestamp: ts,
            descripcion: `Saturación de palanca hidráulica (${evento}: ${status})`,
            tipo: 'SATURACION_PALANCA',
          });
        } else if (!activo) {
          enSaturacion[evento] = false;
        }
      }
    }
  }

  return { desconexionesCinturonMov, saturacionesPalancas };
}

function detectarFilasGrid(
  rgba: Uint8ClampedArray,
  ancho: number,
  alto: number
): number[] {
  const crudas: number[] = [];
  const umbralAncho = ancho * 0.55;

  for (let y = 0; y < alto; y++) {
    let grisCount = 0;
    const rowOffset = y * ancho * 4;
    for (let x = 0; x < ancho; x++) {
      const i = rowOffset + x * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      if (
        Math.abs(r - g) < 10 &&
        Math.abs(g - b) < 10 &&
        r > 100 &&
        r < 245
      ) {
        grisCount++;
      }
    }
    if (grisCount > umbralAncho) {
      crudas.push(y);
    }
  }

  const grupos: number[][] = [];
  for (const r of crudas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && r - ultimo[ultimo.length - 1] <= 2) {
      ultimo.push(r);
    } else {
      grupos.push([r]);
    }
  }

  const centros = grupos.map(
    (g) => g.reduce((acc, v) => acc + v, 0) / g.length
  );
  if (centros.length < 2) return centros;

  const gaps: number[] = [];
  for (let i = 1; i < centros.length; i++) {
    gaps.push(centros[i] - centros[i - 1]);
  }
  const gapsOrdenados = [...gaps].sort((a, b) => a - b);
  const paso = gapsOrdenados[Math.floor(gapsOrdenados.length / 2)];
  if (!paso || paso <= 0) return centros;

  const base = centros[0];
  return centros.filter((c) => {
    const ratio = (c - base) / paso;
    return Math.abs(ratio - Math.round(ratio)) < 0.2;
  });
}

function extraerSerieCurva(
  rgba: Uint8ClampedArray,
  ancho: number,
  alto: number,
  yMin: number,
  yMax: number
): number[] {
  const y0 = Math.max(0, Math.floor(yMin));
  const y1 = Math.min(alto - 1, Math.ceil(yMax));
  if (y1 <= y0) return [];

  const ys: number[] = [];
  for (let x = 0; x < ancho; x++) {
    let sumaY = 0;
    let count = 0;
    for (let y = y0; y <= y1; y++) {
      const idx = (y * ancho + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      if (b - g > 25 && r - g > 15) {
        sumaY += y;
        count++;
      }
    }
    if (count > 0) {
      ys.push(sumaY / count);
    }
  }
  return ys;
}

function digitalizarRegionChart(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  canal: CanalCurva
): SerieDigitalizada | null {
  if (boxW <= 10 || boxH <= 10) return null;
  const imgData = ctx.getImageData(boxX, boxY, boxW, boxH);
  const grid = detectarFilasGrid(imgData.data, boxW, boxH);
  if (grid.length < 2) return null;

  const yTop = grid[0];
  const yBot = grid[grid.length - 1];
  const nInt = grid.length - 1;
  const paso = PASO_GRID_CANAL[canal];

  let vMax: number;
  let vMin: number;
  if (canal === 'steering' || canal === 'tilt_angle') {
    vMax = (paso * nInt) / 2.0;
    vMin = (-paso * nInt) / 2.0;
  } else {
    vMax = paso * nInt;
    vMin = 0.0;
  }

  const ys = extraerSerieCurva(imgData.data, boxW, boxH, yTop - 2, yBot + 2);
  if (ys.length === 0) return null;

  const denom = Math.max(yBot - yTop, 1e-9);
  const vals = ys.map((y) => {
    const val = vMax + ((y - yTop) * (vMin - vMax)) / denom;
    return vMin >= 0 ? Math.max(val, 0) : val;
  });

  return { vals, vMax, vMin };
}

function contarRachas(condiciones: readonly boolean[]): number {
  let total = 0;
  let activo = false;
  for (const c of condiciones) {
    if (c && !activo) {
      total++;
      activo = true;
    } else if (!c) {
      activo = false;
    }
  }
  return total;
}

function promedioAbsDiff(vals: readonly number[]): number {
  if (vals.length <= 1) return 0;
  let suma = 0;
  for (let i = 1; i < vals.length; i++) {
    suma += Math.abs(vals[i] - vals[i - 1]);
  }
  return suma / (vals.length - 1);
}

async function extraerCurvasDePaginas(
  doc: PDFDocumentProxy,
  pagsCharts: readonly number[]
): Promise<{
  indiceSerrucho: number | null;
  volantazosExtremos: number | null;
  frenadasPanico: number | null;
  velocidadMaxKmh: number | null;
  picosAceleracion: number | null;
  porcentajeAceleradorFondo: number | null;
  muestrasHorquillaElevada: number | null;
  porcentajeCirculacionHorquillaAlta: number | null;
  alturaMaximaHorquillaM: number | null;
  oscilacionesMastil: number | null;
  indiceInestabilidadTilt: number | null;
}> {
  const objetivos: Array<{ slot: number; canal: CanalCurva }> = [
    { slot: IDX_ACCEL_PAD, canal: 'accel_pad' },
    { slot: IDX_BRAKE, canal: 'brake' },
    { slot: IDX_FORK_HEIGHT, canal: 'fork_height' },
    { slot: IDX_TILT_ANGLE, canal: 'tilt_angle' },
    { slot: IDX_STEERING, canal: 'steering' },
    { slot: IDX_SPEED, canal: 'speed' },
  ];

  // Agrupa por página para renderizar una sola vez cada página necesaria
  const porPagina = new Map<number, Array<{ mitad: 0 | 1; canal: CanalCurva }>>();
  for (const obj of objetivos) {
    const idxPag = Math.floor(obj.slot / 2);
    const mitad: 0 | 1 = obj.slot % 2 === 0 ? 0 : 1;
    const numPag = pagsCharts[idxPag];
    if (numPag === undefined) continue;
    const arr = porPagina.get(numPag) ?? [];
    arr.push({ mitad, canal: obj.canal });
    porPagina.set(numPag, arr);
  }

  const series: Partial<Record<CanalCurva, SerieDigitalizada>> = {};
  const escala = 2.0;

  for (const [numPag, tareas] of porPagina.entries()) {
    const page = await doc.getPage(numPag);
    const viewport = page.getViewport({ scale: escala });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) continue;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    // Caja horizontal estándar de gráficos ETECH (x: 59..554 pt),
    // mitad superior y: 24..291.5 pt, mitad inferior y: 291.5..562 pt
    const boxX = Math.max(0, Math.floor(58 * escala));
    const boxW = Math.min(
      canvas.width - boxX,
      Math.ceil((555 - 58) * escala)
    );

    for (const { mitad, canal } of tareas) {
      const yPtInicio = mitad === 0 ? 24 : 291.5;
      const yPtFin = mitad === 0 ? 291.5 : 562;
      const boxY = Math.max(0, Math.floor(yPtInicio * escala));
      const boxH = Math.min(
        canvas.height - boxY,
        Math.ceil((yPtFin - yPtInicio) * escala)
      );
      const res = digitalizarRegionChart(ctx, boxX, boxY, boxW, boxH, canal);
      if (res) series[canal] = res;
    }

    canvas.width = 0;
    canvas.height = 0;
  }

  let indiceSerrucho: number | null = null;
  let volantazosExtremos: number | null = null;
  if (series.steering) {
    const v = series.steering.vals;
    indiceSerrucho = Math.round(promedioAbsDiff(v) * 1000) / 1000;
    const tope = 14.0 - 0.5;
    volantazosExtremos = contarRachas(v.map((x) => x >= tope || x <= -tope));
  }

  const frenadasPanico = series.brake
    ? contarRachas(series.brake.vals.map((x) => x >= 9.5))
    : null;

  const velocidadMaxKmh = series.speed
    ? Math.round(Math.max(...series.speed.vals) * 100) / 100
    : null;

  let picosAceleracion: number | null = null;
  let porcentajeAceleradorFondo: number | null = null;
  if (series.accel_pad) {
    const { vals, vMax } = series.accel_pad;
    const umbralPico = Math.max(vMax * 0.85, 1e-6);
    const umbralFondo = Math.max(vMax * 0.8, 1e-6);
    picosAceleracion = contarRachas(vals.map((x) => x >= umbralPico));
    const countFondo = vals.filter((x) => x >= umbralFondo).length;
    porcentajeAceleradorFondo =
      Math.round((countFondo / vals.length) * 1000) / 10;
  }

  let muestrasHorquillaElevada: number | null = null;
  let porcentajeCirculacionHorquillaAlta: number | null = null;
  let alturaMaximaHorquillaM: number | null = null;
  if (series.fork_height) {
    const v = series.fork_height.vals;
    const sobreCota = v.filter((x) => x > 0.35).length;
    muestrasHorquillaElevada = sobreCota;
    porcentajeCirculacionHorquillaAlta =
      Math.round((sobreCota / v.length) * 1000) / 10;
    alturaMaximaHorquillaM = Math.round(Math.max(...v) * 100) / 100;
  }

  let oscilacionesMastil: number | null = null;
  let indiceInestabilidadTilt: number | null = null;
  if (series.tilt_angle) {
    const { vals, vMax } = series.tilt_angle;
    indiceInestabilidadTilt = Math.round(promedioAbsDiff(vals) * 1000) / 1000;
    const topeTilt = Math.max(vMax * 0.65, 3.0);
    oscilacionesMastil = contarRachas(vals.map((x) => Math.abs(x) >= topeTilt));
  }

  return {
    indiceSerrucho,
    volantazosExtremos,
    frenadasPanico,
    velocidadMaxKmh,
    picosAceleracion,
    porcentajeAceleradorFondo,
    muestrasHorquillaElevada,
    porcentajeCirculacionHorquillaAlta,
    alturaMaximaHorquillaM,
    oscilacionesMastil,
    indiceInestabilidadTilt,
  };
}

/**
 * Parsea directamente en el navegador un archivo PDF de reporte del simulador
 * ETECH (15–17 páginas), extrayendo portada, Assessment Log depurado del
 * artefacto `-2.00`, Student Console Events y las 6 curvas rasterizadas.
 */
export async function parsearPdfSimuladorBrowser(
  archivo: File,
  opciones?: OpcionesParseoSimulador
): Promise<MetricasSimulador> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error(
      'El análisis de reportes .pdf solo puede ejecutarse en el navegador.'
    );
  }
  if (archivo.size === 0) {
    throw new Error('El archivo .pdf seleccionado está vacío.');
  }
  if (archivo.size > MAX_BYTES_REPORTE_PDF) {
    throw new Error('El archivo .pdf excede el tamaño máximo permitido (20 MB).');
  }

  const buffer = await archivo.arrayBuffer();
  const cabecera = new TextDecoder('ascii').decode(buffer.slice(0, 5));
  if (cabecera !== '%PDF-') {
    throw new Error('El archivo seleccionado no tiene una cabecera %PDF- válida.');
  }

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  try {
    if (doc.numPages < 2) {
      throw new Error(
        'El PDF no contiene la estructura multipágina de un reporte ETECH.'
      );
    }

    const paginaPortada = await doc.getPage(1);
    const { lineas: lineasPortada } = await extraerFragmentosYLineas(paginaPortada);
    const portada = parsearPortada(lineasPortada);

    const studentNamePortada = normalizarNombreAlumno(portada['Student Name']);
    const studentId = portada['Student Id'] ?? null;
    const exerciseName = portada['Exercise Name'] ?? null;
    const exerciseStartTime = convertirFechaEtechIso(
      portada['Exercise Start Time']
    );
    const scoreRaw = parseFloatSeguro(portada['Score']);
    const tiempoDuracionSeg = hmsASegundos(portada['Exercise Duration'] ?? null);

    if (
      !studentNamePortada &&
      scoreRaw === null &&
      tiempoDuracionSeg === null &&
      !exerciseName
    ) {
      throw new Error(
        'No se reconocieron campos de portada ETECH (Student Name, Score, Exercise Duration) en el PDF.'
      );
    }

    const studentName =
      studentNamePortada ?? normalizarNombreAlumno(opciones?.nombrePostulante);

    const pagsLogFragmentos: FragmentoTextoPdf[][] = [];
    const pagsCharts: number[] = [];
    const pagsConsoleLineas: LineaTextoPdf[][] = [];
    let enConsole = false;

    for (let p = 2; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { fragmentos, lineas, textoCompleto } =
        await extraerFragmentosYLineas(page);
      if (textoCompleto.includes('Student Console Events')) {
        enConsole = true;
      }
      if (enConsole) {
        pagsConsoleLineas.push(lineas);
      } else if (
        textoCompleto.includes('Assessment Log') ||
        textoCompleto.includes('Fault Log')
      ) {
        pagsLogFragmentos.push(fragmentos);
      } else {
        pagsCharts.push(p);
      }
    }

    const faltasLog = pagsLogFragmentos.flatMap(parsearAssessmentLogPagina);
    const colisionesDetalle: EventoFaltaSimulador[] = [];
    const descartesDetalle: EventoFaltaSimulador[] = [];
    const infraccionesConduccion: EventoFaltaSimulador[] = [];
    let puntosDescartados = 0;

    for (const fila of faltasLog) {
      if (esArtefactoSueloTitan(fila.descripcion)) {
        descartesDetalle.push({
          timestamp: fila.timestamp,
          descripcion: fila.descripcion,
          tipo: 'ARTEFACTO_SUELO',
        });
        puntosDescartados += Math.abs(fila.marks);
        continue;
      }

      if (fila.tipo === 'Collision') {
        colisionesDetalle.push({
          timestamp: fila.timestamp,
          descripcion: fila.descripcion,
          tipo: 'Collision',
        });
      } else if (fila.tipo === 'Driving' || fila.tipo === 'PrechecksViolation') {
        infraccionesConduccion.push({
          timestamp: fila.timestamp,
          descripcion: fila.descripcion,
          tipo: fila.tipo,
        });
      }
    }

    const { desconexionesCinturonMov, saturacionesPalancas } =
      parsearConsoleEvents(pagsConsoleLineas);
    for (const ev of [...desconexionesCinturonMov, ...saturacionesPalancas]) {
      infraccionesConduccion.push(ev);
    }

    const scorePuntos =
      scoreRaw !== null
        ? Math.round(Math.min(100, scoreRaw + puntosDescartados) * 100) / 100
        : null;

    const curvas = await extraerCurvasDePaginas(doc, pagsCharts);
    const colisionesReales = colisionesDetalle.length;
    const { riesgo, aptitud } = clasificarRiesgoYAptitud(
      colisionesReales,
      curvas.indiceSerrucho,
      curvas.frenadasPanico
    );

    return {
      archivoFuente: archivo.name.trim() || 'reporte-simulador.pdf',
      studentName,
      studentId,
      exerciseName,
      exerciseStartTime,
      scorePuntos,
      tiempoDuracionSeg,
      colisionesReales,
      colisionesDescartadas: descartesDetalle.length,
      colisionesDetalle,
      descartesDetalle,
      infraccionesConduccion,
      indiceSerrucho: curvas.indiceSerrucho,
      volantazosExtremos: curvas.volantazosExtremos,
      velocidadMaxKmh: curvas.velocidadMaxKmh,
      frenadasPanico: curvas.frenadasPanico,
      picosAceleracion: curvas.picosAceleracion,
      porcentajeAceleradorFondo: curvas.porcentajeAceleradorFondo,
      muestrasHorquillaElevada: curvas.muestrasHorquillaElevada,
      porcentajeCirculacionHorquillaAlta:
        curvas.porcentajeCirculacionHorquillaAlta,
      alturaMaximaHorquillaM: curvas.alturaMaximaHorquillaM,
      oscilacionesMastil: curvas.oscilacionesMastil,
      indiceInestabilidadTilt: curvas.indiceInestabilidadTilt,
      clasificacionRiesgo: riesgo,
      clasificacionAptitud: aptitud,
      hallazgosMastil: construirHallazgosMastil(
        colisionesDetalle,
        infraccionesConduccion
      ),
      alertaFalsoPositivoSuelo: descartesDetalle.length > 0,
    };
  } finally {
    await loadingTask.destroy();
  }
}
