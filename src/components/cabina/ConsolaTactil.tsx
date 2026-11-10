'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Volume2, VolumeX, ArrowLeftRight } from 'lucide-react';
import { registrarEvaluacionCabina } from '@/services/cabina';
import {
  calcularDictamen,
  mapearNivelAsistenciaACabina,
} from '@/lib/cabina/dictamen';
import type {
  AlumnoTurno,
  BloqueSplit,
  DictamenCabina,
  EtapaEvaluacionCabina,
  EvaluacionCabinaInput,
  NivelAsistencia,
  PuntajeEje,
} from '@/types/cabina';

/**
 * Consola Viva de Cabina — interfaz táctil fullscreen para el instructor.
 *
 * Incluye selector granular de `nivel_asistencia` (min-h-[48px]) y cronómetro
 * Split 30/30 (1800 s por mitad) con switch visual de Piloto/Copiloto y alerta
 * sonora vía Web Audio API al alcanzar el minuto 30.
 */

interface Props {
  alumnos: AlumnoTurno[];
  instructorDefault?: string;
}

type ClavePuntaje =
  | 'puntaje_lateralidad'
  | 'puntaje_tacto_mandos'
  | 'puntaje_mastil'
  | 'puntaje_control_receptividad';

type PuntajesEstado = Record<ClavePuntaje, PuntajeEje | undefined>;

const SEGUNDOS_MITAD_SPLIT = 1800; // 30 minutos por bloque
const SEGUNDOS_SESION_TOTAL = 3600; // 60 minutos sesión completa en dupla

const ETAPAS: readonly {
  valor: EtapaEvaluacionCabina;
  codigo: string;
  subtitulo: string;
}[] = [
  { valor: 'DIAG_INTENTO_1', codigo: 'V1 · DIAG 1', subtitulo: 'PRIMERA PASADA' },
  { valor: 'DIAG_INTENTO_2', codigo: 'V2 · DIAG 2', subtitulo: 'SEGUNDA PASADA' },
  { valor: 'FINAL', codigo: 'FINAL · EGRESO', subtitulo: 'PRUEBA FINAL' },
];

const OBSERVACIONES_RAPIDAS_PRESETS: readonly string[] = [
  'Sin espejo lateral',
  'Sobregiro brusco',
  'Mástil fuera de cota',
  'Duda en retroceso',
  'Buena lectura espacial',
  'Asimiló corrección',
];

const EJES: readonly {
  clave: ClavePuntaje;
  etiqueta: string;
  opciones: readonly { valor: PuntajeEje; texto: string }[];
}[] = [
  {
    clave: 'puntaje_lateralidad',
    etiqueta: 'LATERALIDAD Y ESPACIO',
    opciones: [
      { valor: 0, texto: 'MAL' },
      { valor: 10, texto: 'REGULAR' },
      { valor: 20, texto: 'ÓPTIMO' },
    ],
  },
  {
    clave: 'puntaje_tacto_mandos',
    etiqueta: 'TACTO Y MANDOS',
    opciones: [
      { valor: 0, texto: 'BRUSCO' },
      { valor: 10, texto: 'ACEPTABLE' },
      { valor: 20, texto: 'SUAVE' },
    ],
  },
  {
    clave: 'puntaje_mastil',
    etiqueta: 'PROCEDIMIENTO DE MÁSTIL',
    opciones: [
      { valor: 0, texto: 'ALTO' },
      { valor: 10, texto: 'CORRIGIÓ' },
      { valor: 20, texto: 'COTA 15-20CM' },
    ],
  },
  {
    clave: 'puntaje_control_receptividad',
    etiqueta: 'CONTROL EMOCIONAL',
    opciones: [
      { valor: 0, texto: 'NERVIOS' },
      { valor: 10, texto: 'CONTROLADO' },
      { valor: 20, texto: 'SERENO' },
    ],
  },
];

const NIVELES_ASISTENCIA: readonly {
  valor: NivelAsistencia;
  etiqueta: string;
  detalle: string;
  activoClase: string;
}[] = [
  {
    valor: 'AUTONOMO',
    etiqueta: 'AUTÓNOMO',
    detalle: 'SIN INTERVENCIÓN',
    activoClase: 'bg-emerald-500 text-emerald-950 border-emerald-500',
  },
  {
    valor: 'AYUDA_VERBAL',
    etiqueta: 'AYUDA VERBAL',
    detalle: 'GUÍA PUNTUAL',
    activoClase: 'bg-amber-400 text-amber-950 border-amber-400',
  },
  {
    valor: 'INTERVENCION_CONSTANTE',
    etiqueta: 'INT. CONSTANTE',
    detalle: 'CORRECCIÓN CONTINUA',
    activoClase: 'bg-orange-500 text-orange-950 border-orange-500',
  },
  {
    valor: 'INTERVENCION_CRITICA',
    etiqueta: 'INT. CRÍTICA',
    detalle: 'INTERVENCIÓN MANDOS',
    activoClase: 'bg-red-500 text-red-950 border-red-500',
  },
];

const BLOQUES_SPLIT: readonly {
  valor: BloqueSplit;
  rolCorto: string;
  mitad: string;
  detalle: string;
}[] = [
  {
    valor: 'PILOTO_A',
    rolCorto: 'PILOTO A',
    mitad: '0–30 MIN',
    detalle: 'OPERA CABINA · 1° BLOQUE',
  },
  {
    valor: 'COPILOTO_B',
    rolCorto: 'COPILOTO B',
    mitad: '0–30 MIN',
    detalle: 'OBSERVA Y ASISTE · 1° BLOQUE',
  },
  {
    valor: 'PILOTO_B',
    rolCorto: 'PILOTO B',
    mitad: '30–60 MIN',
    detalle: 'OPERA CABINA · 2° BLOQUE',
  },
  {
    valor: 'COPILOTO_A',
    rolCorto: 'COPILOTO A',
    mitad: '30–60 MIN',
    detalle: 'OBSERVA Y ASISTE · 2° BLOQUE',
  },
];

const COLOR_PUNTAJE_ACTIVO: Record<PuntajeEje, string> = {
  0: 'bg-red-500 border-red-500 text-red-950',
  10: 'bg-amber-400 border-amber-400 text-amber-950',
  20: 'bg-emerald-500 border-emerald-500 text-emerald-950',
};

const BADGE_DICTAMEN: Record<DictamenCabina, { fondo: string; texto: string }> = {
  APTO_DIRECTO: { fondo: 'bg-emerald-500', texto: 'text-emerald-950' },
  APTO_OBSERVACION: { fondo: 'bg-emerald-500', texto: 'text-emerald-950' },
  CONDICIONAL: { fondo: 'bg-amber-400', texto: 'text-amber-950' },
  NO_APTO: { fondo: 'bg-red-500', texto: 'text-red-950' },
};

function formatearReloj(totalSeg: number): string {
  const m = Math.floor(totalSeg / 60);
  const s = totalSeg % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function alternarBloqueSplit(actual: BloqueSplit): BloqueSplit {
  switch (actual) {
    case 'PILOTO_A':
      return 'PILOTO_B';
    case 'COPILOTO_B':
      return 'COPILOTO_A';
    case 'PILOTO_B':
      return 'PILOTO_A';
    case 'COPILOTO_A':
      return 'COPILOTO_B';
  }
}

/**
 * Emite una secuencia audible de 3 pulsos mediante Web Audio API para avisar
 * el intercambio de Piloto/Copiloto al cumplir 30 minutos de sesión.
 */
function reproducirAlarmaIntercambio(ctxExistente: AudioContext | null): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) {
    return null;
  }

  try {
    const ctx =
      ctxExistente && ctxExistente.state !== 'closed'
        ? ctxExistente
        : new window.AudioContext();

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const ahora = ctx.currentTime;
    const tonos: readonly { offset: number; freq: number; duracion: number }[] = [
      { offset: 0, freq: 880, duracion: 0.16 },
      { offset: 0.24, freq: 880, duracion: 0.16 },
      { offset: 0.48, freq: 1174.66, duracion: 0.34 },
    ];

    for (const tono of tonos) {
      const osc = ctx.createOscillator();
      const ganancia = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(tono.freq, ahora + tono.offset);

      ganancia.gain.setValueAtTime(0.0001, ahora + tono.offset);
      ganancia.gain.exponentialRampToValueAtTime(0.22, ahora + tono.offset + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(
        0.0001,
        ahora + tono.offset + tono.duracion
      );

      osc.connect(ganancia);
      ganancia.connect(ctx.destination);
      osc.start(ahora + tono.offset);
      osc.stop(ahora + tono.offset + tono.duracion + 0.02);
    }

    return ctx;
  } catch {
    return ctxExistente;
  }
}

export default function ConsolaTactil({
  alumnos,
  instructorDefault = '',
}: Props) {
  const [idSeleccionado, setIdSeleccionado] = useState<string | null>(
    () => alumnos[0]?.inscripcion_id ?? null
  );
  const [evaluados, setEvaluados] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [etapa, setEtapa] = useState<EtapaEvaluacionCabina>('DIAG_INTENTO_1');

  // Selección por id (no por índice). Tras revalidatePath la lista se
  // acorta al remover descartados; si el id ya no existe, sincroniza al primero.
  const idx = alumnos.findIndex((a) => a.inscripcion_id === idSeleccionado);
  const idxSeguro = idx >= 0 ? idx : 0;
  const alumno = alumnos.length > 0 ? alumnos[idxSeguro] : undefined;

  const [puntajes, setPuntajes] = useState<PuntajesEstado>({
    puntaje_lateralidad: undefined,
    puntaje_tacto_mandos: undefined,
    puntaje_mastil: undefined,
    puntaje_control_receptividad: undefined,
  });
  const [bonus, setBonus] = useState<0 | 10>(0);
  const [nivelAsistencia, setNivelAsistencia] = useState<NivelAsistencia | null>(
    null
  );
  const [bloqueSplit, setBloqueSplit] = useState<BloqueSplit>('PILOTO_A');
  const [hardFail, setHardFail] = useState(false);
  const [motivoHardFail, setMotivoHardFail] = useState('');
  const [instructor, setInstructor] = useState(instructorDefault);
  const [observacionesRapidas, setObservacionesRapidas] = useState<string[]>([]);
  const [observacionesDetalle, setObservacionesDetalle] = useState('');

  const [segundos, setSegundos] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const [intercambioConfirmado, setIntercambioConfirmado] = useState(false);
  const [audioSilenciado, setAudioSilenciado] = useState(false);

  const [feedback, setFeedback] = useState<{ ok: boolean; texto: string } | null>(
    null
  );
  const motivoHardFailRef = useRef<HTMLTextAreaElement | null>(null);
  const timerFeedback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmaDisparadaRef = useRef(false);
  const [enTransicion, iniciarTransicion] = useTransition();
  // Bloqueo síncrono contra doble submit por dos toques rápidos.
  const lock = useRef(false);

  useEffect(() => {
    if (alumnos.length === 0) {
      setIdSeleccionado((id) => (id === null ? id : null));
      return;
    }
    setIdSeleccionado((id) =>
      id !== null && alumnos.some((a) => a.inscripcion_id === id)
        ? id
        : alumnos[0].inscripcion_id
    );
  }, [alumnos]);

  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [corriendo]);

  // Dispara una única vez el aviso sonoro Web Audio al alcanzar minuto 30 (1800s).
  useEffect(() => {
    if (segundos >= SEGUNDOS_MITAD_SPLIT && !alarmaDisparadaRef.current) {
      alarmaDisparadaRef.current = true;
      if (!audioSilenciado) {
        audioCtxRef.current = reproducirAlarmaIntercambio(audioCtxRef.current);
      }
    }
  }, [segundos, audioSilenciado]);

  useEffect(() => {
    return () => {
      if (timerFeedback.current) clearTimeout(timerFeedback.current);
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== 'closed') {
        void ctx.close().catch(() => undefined);
      }
    };
  }, []);

  const asistenciaCabinaDerivada = nivelAsistencia
    ? mapearNivelAsistenciaACabina(nivelAsistencia)
    : null;

  // Preview en vivo: usa exactamente el módulo puro `calcularDictamen`.
  const ejesCompletos = EJES.every(
    (e) => puntajes[e.clave] !== undefined && puntajes[e.clave] !== null
  );
  const preview = useMemo(() => {
    if (hardFail) {
      const r = calcularDictamen(
        {
          lateralidad: puntajes.puntaje_lateralidad ?? 0,
          tacto_mandos: puntajes.puntaje_tacto_mandos ?? 0,
          mastil: puntajes.puntaje_mastil ?? 0,
          control_receptividad: puntajes.puntaje_control_receptividad ?? 0,
        },
        bonus,
        asistenciaCabinaDerivada ?? 'ALTA',
        true
      );
      return {
        score_total: ejesCompletos ? (r.score_total as number) : null,
        dictamen: r.dictamen,
      };
    }
    if (!ejesCompletos || !asistenciaCabinaDerivada) {
      return { score_total: null, dictamen: null };
    }
    const r = calcularDictamen(
      {
        lateralidad: puntajes.puntaje_lateralidad!,
        tacto_mandos: puntajes.puntaje_tacto_mandos!,
        mastil: puntajes.puntaje_mastil!,
        control_receptividad: puntajes.puntaje_control_receptividad!,
      },
      bonus,
      asistenciaCabinaDerivada,
      false
    );
    return { score_total: r.score_total as number | null, dictamen: r.dictamen };
  }, [ejesCompletos, puntajes, bonus, asistenciaCabinaDerivada, hardFail]);

  function asegurarAudioActivo() {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new window.AudioContext();
      }
      if (audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume();
      }
    } catch {
      // Ignorar restricciones de navegador sin bloquear la consola
    }
  }

  function resetPantalla() {
    setPuntajes({
      puntaje_lateralidad: undefined,
      puntaje_tacto_mandos: undefined,
      puntaje_mastil: undefined,
      puntaje_control_receptividad: undefined,
    });
    setBonus(0);
    setNivelAsistencia(null);
    setHardFail(false);
    setMotivoHardFail('');
    setObservacionesRapidas([]);
    setObservacionesDetalle('');
    setSegundos(0);
    setCorriendo(false);
    setIntercambioConfirmado(false);
    alarmaDisparadaRef.current = false;
  }

  function toggleObservacionRapida(texto: string) {
    setObservacionesRapidas((prev) =>
      prev.includes(texto) ? prev.filter((item) => item !== texto) : [...prev, texto]
    );
  }

  function confirmarIntercambioSplit() {
    setBloqueSplit((actual) => alternarBloqueSplit(actual));
    setIntercambioConfirmado(true);
  }

  /** Siguiente postulante sin evaluar (búsqueda lineal con wrap). */
  function siguienteSinEvaluar(
    lista: AlumnoTurno[],
    yaEvaluados: ReadonlySet<string>,
    desdeIdx: number
  ): string | null {
    for (let k = 1; k <= lista.length; k++) {
      const cand = lista[(desdeIdx + k) % lista.length];
      if (!yaEvaluados.has(cand.inscripcion_id)) return cand.inscripcion_id;
    }
    return null;
  }

  function guardar() {
    if (enTransicion || lock.current) return;

    if (!alumno) {
      setFeedback({ ok: false, texto: 'SIN POSTULANTE PENDIENTE PARA EVALUAR' });
      return;
    }

    // Bloqueo síncrono antes de validar o lanzar la transición asíncrona.
    lock.current = true;

    const motivoLimpio = motivoHardFail.trim();
    if (hardFail && motivoLimpio.length === 0) {
      lock.current = false;
      setFeedback({
        ok: false,
        texto: 'DEBE INDICAR EL MOTIVO OBLIGATORIO DEL HARD-FAIL',
      });
      motivoHardFailRef.current?.focus();
      return;
    }

    const faltanEjes = EJES.some((e) => puntajes[e.clave] === undefined);
    if (!hardFail && faltanEjes) {
      lock.current = false;
      setFeedback({ ok: false, texto: 'FALTAN PUNTAJES DE EJES POR MARCAR' });
      return;
    }
    if (!hardFail && !nivelAsistencia) {
      lock.current = false;
      setFeedback({ ok: false, texto: 'SELECCIONE EL NIVEL DE ASISTENCIA' });
      return;
    }

    const nivelFinal: NivelAsistencia = nivelAsistencia ?? 'INTERVENCION_CRITICA';

    const datos: EvaluacionCabinaInput = {
      postulante_id: alumno.postulante_id,
      inscripcion_id: alumno.inscripcion_id,
      etapa,
      puntaje_lateralidad: puntajes.puntaje_lateralidad ?? 0,
      puntaje_tacto_mandos: puntajes.puntaje_tacto_mandos ?? 0,
      puntaje_mastil: puntajes.puntaje_mastil ?? 0,
      puntaje_control_receptividad: puntajes.puntaje_control_receptividad ?? 0,
      bonus_segundo_intento: bonus,
      nivel_asistencia: nivelFinal,
      asistencia_cabina: mapearNivelAsistenciaACabina(nivelFinal),
      bloque_split: bloqueSplit,
      hard_fail: hardFail,
      motivo_hard_fail: hardFail ? motivoLimpio : null,
      tiempo_vuelta_seg: segundos > 0 ? segundos : null,
      instructor_evaluador: instructor.trim() || null,
      observaciones_rapidas:
        observacionesRapidas.length > 0 ? observacionesRapidas : null,
      observaciones_detalle: observacionesDetalle.trim() || null,
    };

    const idGuardado = alumno.inscripcion_id;
    const idxGuardado = idxSeguro;

    iniciarTransicion(async () => {
      try {
        const resultado = await registrarEvaluacionCabina(datos);
        if (resultado.ok) {
          setFeedback({
            ok: true,
            texto: `GUARDADO (${etapa} · ${bloqueSplit}) · ${resultado.dictamen ?? 'OK'} · ${resultado.score ?? 0} PTS`,
          });
          resetPantalla();
          const nuevosEvaluados = new Set(evaluados).add(idGuardado);
          setEvaluados(nuevosEvaluados);
          setIdSeleccionado(siguienteSinEvaluar(alumnos, nuevosEvaluados, idxGuardado));
        } else {
          setFeedback({ ok: false, texto: resultado.error ?? 'ERROR AL GUARDAR' });
        }
        if (timerFeedback.current) clearTimeout(timerFeedback.current);
        timerFeedback.current = setTimeout(() => setFeedback(null), 4000);
      } finally {
        lock.current = false;
      }
    });
  }

  const badge = preview.dictamen ? BADGE_DICTAMEN[preview.dictamen] : null;
  const etapaActual = ETAPAS.find((item) => item.valor === etapa) ?? ETAPAS[0];
  const pendientes = alumnos.filter((a) => !evaluados.has(a.inscripcion_id)).length;
  const jornadaFinalizada =
    alumnos.length === 0 || alumnos.every((a) => evaluados.has(a.inscripcion_id));

  const alertaIntercambioActiva =
    segundos >= SEGUNDOS_MITAD_SPLIT && !intercambioConfirmado;
  const restanteSplitSeg = Math.max(0, SEGUNDOS_MITAD_SPLIT - segundos);
  const progresoSplitPct = Math.min(
    100,
    Math.round((segundos / SEGUNDOS_SESION_TOTAL) * 100)
  );
  const segundoBloqueActivo =
    bloqueSplit === 'PILOTO_B' || bloqueSplit === 'COPILOTO_A';

  const feedbackBanner = feedback ? (
    <p
      role="status"
      className={`mb-2 w-full rounded-sm border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] ${
        feedback.ok
          ? 'border-emerald-700 bg-emerald-950 text-emerald-300'
          : 'border-red-700 bg-red-950 text-red-300'
      }`}
    >
      {feedback.ok ? '▸ ' : '✕ '}
      {feedback.texto}
    </p>
  ) : null;

  // Pantalla de cierre cuando no queda ningún postulante pendiente en sesión.
  if (jornadaFinalizada) {
    return (
      <div className="mx-auto flex flex-1 w-full max-w-3xl flex-col items-center justify-center gap-5 px-6 text-center">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full bg-emerald-400"
        />
        {feedbackBanner ? <div className="w-full max-w-sm">{feedbackBanner}</div> : null}
        <h2 className="text-base font-bold uppercase tracking-[0.18em] text-zinc-100">
          SIN POSTULANTES PENDIENTES · JORNADA FINALIZADA
        </h2>
        <p className="max-w-sm text-[10.5px] uppercase leading-relaxed tracking-[0.12em] text-zinc-500">
          Se evaluaron {evaluados.size} puestos en etapa {etapaActual.codigo}.
          Recargue la pantalla para reflejar los últimos cambios del servidor.
        </p>
        <button
          type="button"
          onClick={() => {
            setEvaluados(new Set<string>());
            setIdSeleccionado(alumnos[0]?.inscripcion_id ?? null);
            resetPantalla();
          }}
          className="flex h-16 w-full max-w-sm items-center justify-center rounded-sm border border-zinc-100 bg-zinc-100 text-sm font-bold uppercase tracking-[0.18em] text-zinc-950 transition-colors active:bg-zinc-300"
        >
          REINICIAR SESIÓN
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-1 w-full max-w-3xl flex-col">
      {/* ── Cabecera ─────────────────────────────────────────────── */}
      <header className="border-b border-zinc-800 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-100">
            {'// CONSOLA VIVA DE CABINA'}
          </h1>
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          ETAPA {etapaActual.codigo} · COHORTE ACTIVA · {pendientes} PENDIENTES DE{' '}
          {alumnos.length}
        </p>
      </header>

      {/* ── Selector de etapa de evaluación ──────────────────────── */}
      <section className="border-b border-zinc-800 px-4 py-3">
        <p className="mb-2 text-[9px] uppercase tracking-[0.16em] text-zinc-500">
          ETAPA DE EVALUACIÓN EN CABINA
        </p>
        <div role="group" aria-label="Etapa de evaluación" className="grid grid-cols-3 gap-2">
          {ETAPAS.map((item) => {
            const activa = etapa === item.valor;
            return (
              <button
                key={item.valor}
                type="button"
                aria-pressed={activa}
                onClick={() => setEtapa(item.valor)}
                className={`flex min-h-[48px] flex-col items-center justify-center rounded-sm border px-2 py-1.5 text-center transition-colors ${
                  activa
                    ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 active:bg-zinc-800'
                }`}
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]">
                  {item.codigo}
                </span>
                <span
                  className={`text-[8.5px] uppercase tracking-[0.08em] ${
                    activa ? 'text-zinc-700' : 'text-zinc-500'
                  }`}
                >
                  {item.subtitulo}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Selector de alumnos (chips con scroll horizontal) ────── */}
      <nav
        aria-label="Postulantes en turno"
        className="flex gap-2 overflow-x-auto border-b border-zinc-800 px-4 py-3"
      >
        {alumnos.map((a) => {
          const activo = a.inscripcion_id === idSeleccionado;
          const yaEvaluado = evaluados.has(a.inscripcion_id);
          return (
            <button
              key={a.inscripcion_id}
              type="button"
              onClick={() => setIdSeleccionado(a.inscripcion_id)}
              aria-pressed={activo}
              className={`flex min-h-[48px] h-14 shrink-0 flex-col items-start justify-center rounded-sm border px-4 transition-colors ${
                activo
                  ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 active:bg-zinc-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {yaEvaluado ? (
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-full ${
                      activo ? 'bg-emerald-600' : 'bg-emerald-400'
                    }`}
                    title="Evaluado en esta sesión"
                  />
                ) : null}
                <span className="max-w-44 truncate text-xs font-bold uppercase tracking-[0.08em]">
                  {a.nombre_completo}
                </span>
              </span>
              <span
                className={`text-[10px] tracking-[0.12em] ${
                  activo ? 'text-zinc-600' : 'text-zinc-500'
                }`}
              >
                DNI {a.dni}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── Cronómetro Split 30/30 + Switch Piloto / Copiloto ────── */}
      <section
        aria-label="Cronómetro Split 30/30 y rol en dupla"
        className="space-y-3 border-b border-zinc-800 px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              SPLIT 30/30 · BLOQUE EN DUPLA
            </span>
            <span
              className={`rounded-sm border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] ${
                segundoBloqueActivo
                  ? 'border-cyan-500/50 bg-cyan-950/50 text-cyan-300'
                  : 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300'
              }`}
            >
              {segundoBloqueActivo ? '2° BLOQUE (30–60M)' : '1° BLOQUE (0–30M)'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              asegurarAudioActivo();
              setAudioSilenciado((sil) => !sil);
            }}
            aria-pressed={!audioSilenciado}
            className="flex min-h-[48px] items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-300 transition-colors active:bg-zinc-800"
          >
            {audioSilenciado ? (
              <>
                <VolumeX size={14} strokeWidth={1.75} aria-hidden />
                ALARMA SILENCIADA
              </>
            ) : (
              <>
                <Volume2 size={14} strokeWidth={1.75} aria-hidden />
                ALARMA 30M ACTIVA
              </>
            )}
          </button>
        </div>

        {/* Reloj + Botones de control */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-44 flex-col rounded-sm border border-zinc-800 bg-zinc-900 px-4 py-2">
            <span className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
              {segundos < SEGUNDOS_MITAD_SPLIT
                ? `INTERCAMBIO EN ${formatearReloj(restanteSplitSeg)}`
                : 'MITAD 30:00 COMPLETADA'}
            </span>
            <span className="text-3xl font-bold tabular-nums tracking-[0.06em] text-zinc-50">
              {formatearReloj(segundos)}
              <span className="ml-1.5 text-xs font-normal text-zinc-500">
                / 60:00
              </span>
            </span>
          </div>

          <div className="grid flex-1 grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                asegurarAudioActivo();
                setCorriendo(true);
              }}
              disabled={corriendo}
              className="flex min-h-[48px] items-center justify-center rounded-sm border border-emerald-700 bg-emerald-950 text-[11px] font-bold tracking-[0.12em] text-emerald-300 transition-colors active:bg-emerald-900 disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
            >
              {corriendo ? 'EN MARCHA' : 'INICIAR'}
            </button>
            <button
              type="button"
              onClick={() => setCorriendo(false)}
              disabled={!corriendo}
              className="flex min-h-[48px] items-center justify-center rounded-sm border border-amber-700 bg-amber-950 text-[11px] font-bold tracking-[0.12em] text-amber-300 transition-colors active:bg-amber-900 disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
            >
              PAUSA
            </button>
            <button
              type="button"
              onClick={() => {
                setCorriendo(false);
                setSegundos(0);
                setIntercambioConfirmado(false);
                alarmaDisparadaRef.current = false;
              }}
              className="flex min-h-[48px] items-center justify-center rounded-sm border border-zinc-700 bg-zinc-900 text-[11px] font-bold tracking-[0.12em] text-zinc-200 transition-colors active:bg-zinc-800"
            >
              RESET
            </button>
          </div>
        </div>

        {/* Barra de progreso Split 30/30 con marcador medio */}
        <div className="space-y-1">
          <div className="relative h-2.5 w-full overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900">
            <div
              className={`h-full transition-all duration-300 ${
                segundos >= SEGUNDOS_MITAD_SPLIT ? 'bg-amber-400' : 'bg-emerald-500'
              }`}
              style={{ width: `${progresoSplitPct}%` }}
            />
            <span
              aria-hidden
              title="Marca minuto 30:00 (Intercambio)"
              className="absolute inset-y-0 left-1/2 w-0.5 bg-zinc-100/80"
            />
          </div>
          <div className="flex justify-between text-[8.5px] uppercase tracking-[0.12em] text-zinc-500">
            <span>00:00 INICIO</span>
            <span className="text-amber-300">30:00 INTERCAMBIO</span>
            <span>60:00 FIN</span>
          </div>
        </div>

        {/* Alarma visual al alcanzar minuto 30 */}
        {alertaIntercambioActiva && (
          <div
            role="status"
            aria-live="assertive"
            className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-amber-400 bg-amber-950/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300">
                MINUTO 30 ALCANZADO · INTERCAMBIAR PILOTO / COPILOTO
              </p>
              <p className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-amber-200/80">
                Rotar puesto en cabina entre integrante A y B para el segundo bloque.
              </p>
            </div>
            <button
              type="button"
              onClick={confirmarIntercambioSplit}
              className="flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-sm border border-amber-400 bg-amber-400 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-950 transition-colors active:bg-amber-300"
            >
              <ArrowLeftRight size={14} strokeWidth={2} aria-hidden />
              INTERCAMBIAR BLOQUE
            </button>
          </div>
        )}

        {/* Switch táctil Piloto / Copiloto (BloqueSplit) */}
        <div
          role="group"
          aria-label="Selector de rol en bloque Split 30/30"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {BLOQUES_SPLIT.map((b) => {
            const activo = bloqueSplit === b.valor;
            return (
              <button
                key={b.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => {
                  setBloqueSplit(b.valor);
                  if (b.valor === 'PILOTO_B' || b.valor === 'COPILOTO_A') {
                    setIntercambioConfirmado(true);
                  }
                }}
                className={`flex min-h-[48px] flex-col items-center justify-center rounded-sm border px-2 py-1.5 text-center transition-colors ${
                  activo
                    ? 'border-cyan-400 bg-cyan-500 text-cyan-950'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 active:bg-zinc-800'
                }`}
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.08em]">
                  {b.rolCorto}
                </span>
                <span
                  className={`mt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.06em] ${
                    activo ? 'text-cyan-950/80' : 'text-zinc-500'
                  }`}
                >
                  {b.mitad}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Los 4 ejes: pastillas gigantes [0][10][20] ───────────── */}
      <section className="flex flex-col gap-3 px-4 py-4">
        <h2 className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          EJES DE EVALUACIÓN
        </h2>
        {EJES.map((eje) => (
          <div
            key={eje.clave}
            className="rounded-sm border border-zinc-800 bg-zinc-900 p-3"
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
              {eje.etiqueta}
            </p>
            <div role="group" aria-label={eje.etiqueta} className="grid grid-cols-3 gap-2">
              {eje.opciones.map((op) => {
                const seleccionado = puntajes[eje.clave] === op.valor;
                return (
                  <button
                    key={op.valor}
                    type="button"
                    aria-pressed={seleccionado}
                    onClick={() =>
                      setPuntajes((p) => ({ ...p, [eje.clave]: op.valor }))
                    }
                    className={`flex min-h-[48px] h-14 flex-col items-center justify-center rounded-sm border text-center transition-colors ${
                      seleccionado
                        ? COLOR_PUNTAJE_ACTIVO[op.valor]
                        : 'border-zinc-700 bg-zinc-950 text-zinc-300 active:bg-zinc-800'
                    }`}
                  >
                    <span className="text-base font-bold tabular-nums leading-none">
                      {op.valor}
                    </span>
                    <span className="mt-1 px-1 text-[9.5px] font-semibold uppercase leading-tight tracking-[0.08em]">
                      {op.texto}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ── Bonus segundo intento ────────────────────────────────── */}
      <section className="px-4 pb-4">
        <button
          type="button"
          role="switch"
          aria-checked={bonus === 10}
          onClick={() => setBonus((b) => (b === 10 ? 0 : 10))}
          className={`flex min-h-[48px] h-14 w-full items-center justify-between rounded-sm border px-4 transition-colors ${
            bonus === 10
              ? 'border-emerald-500 bg-emerald-950'
              : 'border-zinc-800 bg-zinc-900 active:bg-zinc-800'
          }`}
        >
          <span
            className={`text-[11px] font-bold uppercase tracking-[0.12em] ${
              bonus === 10 ? 'text-emerald-300' : 'text-zinc-400'
            }`}
          >
            +10 PTS: MEJORÓ EN 2DO INTENTO
          </span>
          <span
            aria-hidden
            className={`flex h-7 w-12 items-center rounded-sm border p-0.5 transition-colors ${
              bonus === 10 ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600 bg-zinc-950'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-sm transition-transform ${
                bonus === 10 ? 'translate-x-5 bg-emerald-950' : 'translate-x-0 bg-zinc-600'
              }`}
            />
          </span>
        </button>
      </section>

      {/* ── Selector de nivel de asistencia del instructor ───────── */}
      <section className="px-4 pb-4">
        <h2 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          NIVEL DE ASISTENCIA DEL INSTRUCTOR
        </h2>
        <div
          role="group"
          aria-label="Nivel de asistencia del instructor"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {NIVELES_ASISTENCIA.map((nivel) => {
            const activa = nivelAsistencia === nivel.valor;
            return (
              <button
                key={nivel.valor}
                type="button"
                aria-pressed={activa}
                onClick={() => setNivelAsistencia(nivel.valor)}
                className={`flex min-h-[48px] h-16 flex-col items-center justify-center rounded-sm border px-2 py-1.5 text-center transition-colors ${
                  activa
                    ? nivel.activoClase
                    : 'border-zinc-700 bg-zinc-950 text-zinc-300 active:bg-zinc-800'
                }`}
              >
                <span className="text-[11px] font-bold uppercase leading-tight tracking-[0.08em]">
                  {nivel.etiqueta}
                </span>
                <span className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.06em] opacity-80">
                  {nivel.detalle}
                </span>
              </button>
            );
          })}
        </div>
        {nivelAsistencia === 'INTERVENCION_CRITICA' && !hardFail && (
          <p className="mt-2 rounded-sm border border-amber-500/40 bg-amber-950/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-amber-300">
            ATENCIÓN: Con intervención crítica sobre mandos evalúe activar Hard-Fail si existió riesgo de seguridad.
          </p>
        )}
      </section>

      {/* ── Tarjeta hard-fail ────────────────────────────────────── */}
      <section className="px-4 pb-4">
        <div
          className={`rounded-sm border p-3 ${
            hardFail ? 'border-red-500 bg-red-950/40' : 'border-red-500/60 bg-zinc-900'
          }`}
        >
          <button
            type="button"
            role="switch"
            aria-checked={hardFail}
            onClick={() =>
              setHardFail((h) => {
                if (h) setMotivoHardFail('');
                return !h;
              })
            }
            className="flex min-h-[48px] h-14 w-full items-center justify-between"
          >
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${
                  hardFail ? 'bg-red-500 animate-pulse' : 'bg-zinc-700'
                }`}
              />
              <span
                className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
                  hardFail ? 'text-red-400' : 'text-zinc-400'
                }`}
              >
                HARD-FAIL · FALTA CRÍTICA
              </span>
            </span>
            <span
              aria-hidden
              className={`flex h-7 w-12 items-center rounded-sm border p-0.5 transition-colors ${
                hardFail ? 'border-red-500 bg-red-500' : 'border-zinc-600 bg-zinc-950'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-sm transition-transform ${
                  hardFail ? 'translate-x-5 bg-red-950' : 'translate-x-0 bg-zinc-600'
                }`}
              />
            </span>
          </button>
          {hardFail ? (
            <label className="mt-2 block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.16em] text-red-400">
                MOTIVO OBLIGATORIO * (FUERZA NO APTO)
              </span>
              <textarea
                ref={motivoHardFailRef}
                required
                aria-required="true"
                aria-invalid={motivoHardFail.trim().length === 0}
                maxLength={500}
                value={motivoHardFail}
                onChange={(ev) => setMotivoHardFail(ev.target.value)}
                rows={2}
                placeholder="Describa la falta crítica (obligatorio para guardar)…"
                className={`w-full resize-none rounded-sm border bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none ${
                  motivoHardFail.trim().length === 0
                    ? 'border-red-500 focus:border-red-400'
                    : 'border-red-500/50 focus:border-red-500'
                }`}
              />
            </label>
          ) : null}
        </div>
      </section>

      {/* ── Observaciones e Instructor ───────────────────────────── */}
      <section className="px-4 pb-4">
        <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            OBSERVACIONES RÁPIDAS DEL INSTRUCTOR
          </p>
          <div className="flex flex-wrap gap-2">
            {OBSERVACIONES_RAPIDAS_PRESETS.map((chip) => {
              const marcado = observacionesRapidas.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => toggleObservacionRapida(chip)}
                  className={`min-h-[48px] rounded-sm border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
                    marcado
                      ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-300 active:bg-zinc-800'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                INSTRUCTOR EVALUADOR
              </span>
              <input
                type="text"
                maxLength={120}
                value={instructor}
                onChange={(ev) => setInstructor(ev.target.value)}
                placeholder="Nombre o usuario del instructor"
                className="min-h-[48px] w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                NOTAS DE DESEMPEÑO (OPCIONAL)
              </span>
              <input
                type="text"
                maxLength={2000}
                value={observacionesDetalle}
                onChange={(ev) => setObservacionesDetalle(ev.target.value)}
                placeholder="Detalle técnico breve para legajo…"
                className="min-h-[48px] w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-400 focus:outline-none"
              />
            </label>
          </div>
        </div>
      </section>

      {/* ── Panel en vivo: score + dictamen ──────────────────────── */}
      <section className="px-4 pb-4">
        <div className="flex items-center justify-between gap-3 rounded-sm border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
              SCORE EN VIVO
            </span>
            <span className="text-4xl font-bold tabular-nums leading-none tracking-[0.04em] text-zinc-50">
              {preview.score_total !== null ? (
                <>
                  {preview.score_total}
                  <span className="text-lg text-zinc-600">/90</span>
                </>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
              DICTAMEN · {etapaActual.codigo}
            </span>
            {badge && preview.dictamen ? (
              <span
                className={`rounded-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] ${badge.fondo} ${badge.texto}`}
              >
                {preview.dictamen.replace('_', ' ')}
              </span>
            ) : (
              <span className="rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                PENDIENTE
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Feedback + botón final ───────────────────────────────── */}
      <footer className="mt-auto border-t border-zinc-800 px-4 pb-5 pt-3">
        {feedbackBanner}
        <button
          type="button"
          onClick={guardar}
          disabled={enTransicion}
          className="flex min-h-[48px] h-16 w-full items-center justify-center gap-2 rounded-sm border border-zinc-100 bg-zinc-100 text-sm font-bold uppercase tracking-[0.18em] text-zinc-950 transition-colors active:bg-zinc-300 disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {enTransicion ? (
            <>
              <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-500" />
              GUARDANDO…
            </>
          ) : (
            'GUARDAR Y SIGUIENTE'
          )}
        </button>
      </footer>
    </div>
  );
}
