'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Volume2, VolumeX, ArrowLeftRight } from 'lucide-react';
import {
  conmutarSimuladorAutoelevadorCabina,
  registrarEvaluacionCabina,
} from '@/services/cabina';
import { guardarPracticaRealAction } from '@/services/empleo';
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
  ModoConsolaTactil,
  NivelAsistencia,
  PuntajeEje,
} from '@/types/cabina';
import type { DecisionInstructorTerreno } from '@/types/empleo';

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
  valor: ModoConsolaTactil;
  codigo: string;
  subtitulo: string;
}[] = [
  { valor: 'DIAG_INTENTO_1', codigo: 'V1 · DIAG 1', subtitulo: 'PRIMERA PASADA' },
  { valor: 'DIAG_INTENTO_2', codigo: 'V2 · DIAG 2', subtitulo: 'SEGUNDA PASADA' },
  { valor: 'FINAL', codigo: 'FINAL · EGRESO', subtitulo: 'PRUEBA FINAL' },
  { valor: 'PRACTICA_REAL', codigo: 'PATIO · TERRENO', subtitulo: 'MÁQUINA REAL' },
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
    detalle: 'Sin intervención',
    activoClase: 'bg-emerald-600 text-white border-emerald-700',
  },
  {
    valor: 'AYUDA_VERBAL',
    etiqueta: 'AYUDA VERBAL',
    detalle: 'Guía puntual',
    activoClase: 'bg-amber-400 text-amber-950 border-amber-500',
  },
  {
    valor: 'INTERVENCION_CONSTANTE',
    etiqueta: 'INT. CONSTANTE',
    detalle: 'Corrección continua',
    activoClase: 'bg-orange-500 text-white border-orange-600',
  },
  {
    valor: 'INTERVENCION_CRITICA',
    etiqueta: 'INT. CRÍTICA',
    detalle: 'Intervención mandos',
    activoClase: 'bg-rose-600 text-white border-rose-700',
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
    detalle: 'Opera cabina · 1° bloque',
  },
  {
    valor: 'COPILOTO_B',
    rolCorto: 'COPILOTO B',
    mitad: '0–30 MIN',
    detalle: 'Observa y asiste · 1° bloque',
  },
  {
    valor: 'PILOTO_B',
    rolCorto: 'PILOTO B',
    mitad: '30–60 MIN',
    detalle: 'Opera cabina · 2° bloque',
  },
  {
    valor: 'COPILOTO_A',
    rolCorto: 'COPILOTO A',
    mitad: '30–60 MIN',
    detalle: 'Observa y asiste · 2° bloque',
  },
];

const COLOR_PUNTAJE_ACTIVO: Record<PuntajeEje, string> = {
  0: 'bg-rose-600 border-rose-700 text-white',
  10: 'bg-amber-400 border-amber-500 text-amber-950',
  20: 'bg-emerald-600 border-emerald-700 text-white',
};

const BADGE_DICTAMEN: Record<DictamenCabina, { fondo: string; texto: string }> = {
  APTO_DIRECTO: { fondo: 'bg-emerald-600', texto: 'text-white' },
  APTO_OBSERVACION: { fondo: 'bg-emerald-600', texto: 'text-white' },
  CONDICIONAL: { fondo: 'bg-amber-400', texto: 'text-amber-950' },
  NO_APTO: { fondo: 'bg-rose-600', texto: 'text-white' },
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
  const [etapa, setEtapa] = useState<ModoConsolaTactil>('DIAG_INTENTO_1');

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

  // Campos Tablet en Patio (PRACTICA_REAL · 0 Storage) + Decisión Manual
  const [asistenciaTerreno, setAsistenciaTerreno] = useState<'PRESENTE' | 'AUSENTE'>('PRESENTE');
  const [horasTerreno, setHorasTerreno] = useState(1.5);
  const [lugarTerreno, setLugarTerreno] = useState('Predio Municipal / Patio');
  const [maquinaTerreno, setMaquinaTerreno] = useState('Autoelevador Real');
  const [requiereHorasExtra, setRequiereHorasExtra] = useState(false);
  const [horasExtraSugeridas, setHorasExtraSugeridas] = useState(2);
  const [decisionTerreno, setDecisionTerreno] =
    useState<DecisionInstructorTerreno>('APROBADO_EMPRESAS');
  const [decisionManualT0, setDecisionManualT0] = useState<
    'AUTO' | 'APROBADO_A_CAPACITACION' | 'RECHAZADO'
  >('AUTO');

  const [segundos, setSegundos] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const [intercambioConfirmado, setIntercambioConfirmado] = useState(false);
  const [audioSilenciado, setAudioSilenciado] = useState(false);
  const [simuladorEnLinea, setSimuladorEnLinea] = useState(false);

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
    setAsistenciaTerreno('PRESENTE');
    setHorasTerreno(1.5);
    setRequiereHorasExtra(false);
    setHorasExtraSugeridas(2);
    setDecisionTerreno('APROBADO_EMPRESAS');
    setDecisionManualT0('AUTO');
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

    // Modo Tablet en Patio (Práctica Real · Cero Storage)
    if (etapa === 'PRACTICA_REAL') {
      const nivelFinal: NivelAsistencia = nivelAsistencia ?? 'AUTONOMO';
      const idGuardado = alumno.inscripcion_id;
      const idxGuardado = idxSeguro;
      const notasJuntas = [
        ...observacionesRapidas,
        observacionesDetalle.trim(),
      ]
        .filter(Boolean)
        .join(' · ');

      const resultadoTerreno =
        hardFail || decisionTerreno === 'NO_APTO'
          ? 'no_apto'
          : decisionTerreno === 'REQUIERE_MAS_HORAS' || requiereHorasExtra
            ? 'requiere_refuerzo'
            : 'aprobado';

      iniciarTransicion(async () => {
        try {
          const resTerreno = await guardarPracticaRealAction({
            cohorte_id: alumno.cohorte_id,
            postulante_id: alumno.postulante_id,
            fecha_practica: new Date().toISOString().split('T')[0],
            lugar_predio: lugarTerreno.trim() || 'Predio Municipal / Patio',
            maquina_utilizada: maquinaTerreno.trim() || 'Autoelevador Real',
            instructor_patio: instructor.trim() || 'Equipo de Instructores',
            resultado: resultadoTerreno,
            observaciones_terreno: notasJuntas || null,
            asistencia_terreno: asistenciaTerreno,
            horas_practica_terreno: asistenciaTerreno === 'PRESENTE' ? horasTerreno : 0,
            horas_extra_terreno: 0,
            requiere_horas_extra: requiereHorasExtra,
            horas_extra_sugeridas: requiereHorasExtra ? horasExtraSugeridas : 0,
            puntaje_lateralidad: puntajes.puntaje_lateralidad ?? null,
            puntaje_tacto_mandos: puntajes.puntaje_tacto_mandos ?? null,
            puntaje_mastil: puntajes.puntaje_mastil ?? null,
            puntaje_control_receptividad:
              puntajes.puntaje_control_receptividad ?? null,
            nivel_asistencia: nivelFinal,
            decision_instructor_terreno: hardFail ? 'NO_APTO' : decisionTerreno,
          });

          if (resTerreno.ok) {
            setFeedback({
              ok: true,
              texto: `PATIO GUARDADO (${asistenciaTerreno} · ${decisionTerreno}) · 0 STORAGE`,
            });
            resetPantalla();
            const nuevosEvaluados = new Set(evaluados).add(idGuardado);
            const siguiente = siguienteSinEvaluar(alumnos, nuevosEvaluados, idxGuardado);
            setEvaluados(nuevosEvaluados);
            setIdSeleccionado(siguiente);
          } else {
            setFeedback({ ok: false, texto: resTerreno.error });
          }
          if (timerFeedback.current) clearTimeout(timerFeedback.current);
          timerFeedback.current = setTimeout(() => setFeedback(null), 4000);
        } finally {
          lock.current = false;
        }
      });
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
      etapa: etapa as EtapaEvaluacionCabina,
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
      decision_manual_t0: decisionManualT0 === 'AUTO' ? null : decisionManualT0,
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
          const siguiente = siguienteSinEvaluar(alumnos, nuevosEvaluados, idxGuardado);
          setEvaluados(nuevosEvaluados);
          setIdSeleccionado(siguiente);
          if (!siguiente) {
            setSimuladorEnLinea(false);
            void conmutarSimuladorAutoelevadorCabina(false);
          } else {
            setSimuladorEnLinea(true);
          }
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
      className={`mb-2 w-full rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${
        feedback.ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >
      {feedback.ok ? '✓ ' : '✕ '}
      {feedback.texto}
    </p>
  ) : null;

  // Pantalla de cierre cuando no queda ningún postulante pendiente en sesión.
  if (jornadaFinalizada) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-5 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <span
          aria-hidden
          className="h-3 w-3 rounded-full bg-emerald-500"
        />
        {feedbackBanner ? <div className="w-full max-w-sm">{feedbackBanner}</div> : null}
        <h2 className="text-lg font-bold text-slate-900">
          Sin alumnos pendientes · Jornada finalizada
        </h2>
        <p className="max-w-sm text-sm leading-relaxed text-slate-600">
          Se evaluaron {evaluados.size} alumnos en etapa {etapaActual.codigo}.
          Recargá la pantalla para ver los últimos cambios guardados.
        </p>
        <button
          type="button"
          onClick={() => {
            setEvaluados(new Set<string>());
            setIdSeleccionado(alumnos[0]?.inscripcion_id ?? null);
            resetPantalla();
          }}
          className="flex h-14 w-full max-w-sm items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
        >
          Reiniciar sesión de evaluación
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-4">
      {/* ── Cabecera ─────────────────────────────────────────────── */}
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Evaluar en Cabina / Patio
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-600">
              Etapa {etapaActual.codigo} · Curso activo · {pendientes} pendientes de{' '}
              {alumnos.length}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const siguienteEstado = !simuladorEnLinea;
              setSimuladorEnLinea(siguienteEstado);
              void conmutarSimuladorAutoelevadorCabina(siguienteEstado);
            }}
            aria-pressed={simuladorEnLinea}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3.5 py-1.5 text-xs font-bold transition-colors ${
              simuladorEnLinea
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-emerald-300 bg-emerald-50 text-emerald-800'
            }`}
          >
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${
                simuladorEnLinea ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            {simuladorEnLinea ? 'Simulador Autoelevador en uso (3D)' : 'Simulador libre (3D)'}
          </button>
        </div>
      </header>

      {/* ── Selector de etapa de evaluación ──────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          Etapa de evaluación
        </p>
        <div role="group" aria-label="Etapa de evaluación" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ETAPAS.map((item) => {
            const activa = etapa === item.valor;
            return (
              <button
                key={item.valor}
                type="button"
                aria-pressed={activa}
                onClick={() => setEtapa(item.valor)}
                className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-colors ${
                  activa
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-bold">
                  {item.codigo}
                </span>
                <span
                  className={`text-[11px] ${
                    activa ? 'text-blue-100' : 'text-slate-500'
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
        aria-label="Alumnos en turno"
        className="flex gap-2.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
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
              className={`flex min-h-[52px] shrink-0 flex-col items-start justify-center rounded-xl border px-4 py-2 transition-colors ${
                activo
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {yaEvaluado ? (
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-full ${
                      activo ? 'bg-emerald-300' : 'bg-emerald-500'
                    }`}
                    title="Evaluado en esta sesión"
                  />
                ) : null}
                <span className="max-w-44 truncate text-xs font-bold">
                  {a.nombre_completo}
                </span>
              </span>
              <span
                className={`text-[11px] ${
                  activo ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                DNI {a.dni}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── Cronómetro Split 30/30 OR Panel Práctica Real en Patio ─ */}
      {etapa === 'PRACTICA_REAL' ? (
        <section
          aria-label="Tablet en Patio — Práctica Real"
          className="space-y-3 rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Evaluación en Patio · Máquina Real
            </span>
            <div className="flex gap-2">
              {(['PRESENTE', 'AUSENTE'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  aria-pressed={asistenciaTerreno === st}
                  onClick={() => setAsistenciaTerreno(st)}
                  className={`min-h-[42px] rounded-lg border px-4 text-xs font-bold transition-colors ${
                    asistenciaTerreno === st
                      ? st === 'PRESENTE'
                        ? 'border-emerald-700 bg-emerald-600 text-white'
                        : 'border-rose-700 bg-rose-600 text-white'
                      : 'border-slate-300 bg-slate-50 text-slate-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                Predio / Lugar
              </span>
              <input
                type="text"
                maxLength={150}
                value={lugarTerreno}
                onChange={(e) => setLugarTerreno(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                Máquina real
              </span>
              <input
                type="text"
                maxLength={120}
                value={maquinaTerreno}
                onChange={(e) => setMaquinaTerreno(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                Horas en patio (hs)
              </span>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={asistenciaTerreno === 'AUSENTE' ? 0 : horasTerreno}
                disabled={asistenciaTerreno === 'AUSENTE'}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setHorasTerreno(Math.max(0, v));
                }}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:opacity-60"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-xs font-semibold text-amber-800">
              <input
                type="checkbox"
                checked={requiereHorasExtra}
                onChange={(e) => setRequiereHorasExtra(e.target.checked)}
                className="h-4 w-4 accent-amber-600"
              />
              ¿Requiere más horas de refuerzo?
            </label>
            {requiereHorasExtra && (
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span>Horas extra sugeridas:</span>
                <input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={horasExtraSugeridas}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setHorasExtraSugeridas(Math.max(0.5, v));
                  }}
                  className="h-9 w-20 rounded-lg border border-amber-300 bg-white px-2 text-sm text-slate-900"
                />
              </label>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-slate-800">
              Decisión del instructor en patio
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    valor: 'APROBADO_EMPRESAS',
                    etiqueta: 'Aprueba · Apto empresas',
                    activo: 'border-emerald-700 bg-emerald-600 text-white',
                  },
                  {
                    valor: 'REQUIERE_MAS_HORAS',
                    etiqueta: 'Requiere más horas',
                    activo: 'border-amber-500 bg-amber-400 text-amber-950',
                  },
                  {
                    valor: 'NO_APTO',
                    etiqueta: 'No apto en patio',
                    activo: 'border-rose-700 bg-rose-600 text-white',
                  },
                ] as const
              ).map((op) => (
                <button
                  key={op.valor}
                  type="button"
                  aria-pressed={decisionTerreno === op.valor}
                  onClick={() => setDecisionTerreno(op.valor)}
                  className={`min-h-[48px] rounded-xl border px-3 text-xs font-bold transition-colors ${
                    decisionTerreno === op.valor
                      ? op.activo
                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {op.etiqueta}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
      <section
        aria-label="Cronómetro Split 30/30 y rol en dupla"
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Reloj de dupla (30 + 30 min)
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                segundoBloqueActivo
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {segundoBloqueActivo ? '2° Bloque (30–60m)' : '1° Bloque (0–30m)'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              asegurarAudioActivo();
              setAudioSilenciado((sil) => !sil);
            }}
            aria-pressed={!audioSilenciado}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            {audioSilenciado ? (
              <>
                <VolumeX size={15} strokeWidth={1.85} aria-hidden />
                Alarma silenciada
              </>
            ) : (
              <>
                <Volume2 size={15} strokeWidth={1.85} aria-hidden />
                Alarma 30m activa
              </>
            )}
          </button>
        </div>

        {/* Reloj + Botones de control */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-44 flex-col rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="text-[11px] font-semibold text-slate-500">
              {segundos < SEGUNDOS_MITAD_SPLIT
                ? `Intercambio en ${formatearReloj(restanteSplitSeg)}`
                : 'Mitad 30:00 completada'}
            </span>
            <span className="text-3xl font-bold tabular-nums text-slate-900">
              {formatearReloj(segundos)}
              <span className="ml-1.5 text-xs font-medium text-slate-500">
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
                setSimuladorEnLinea(true);
                void conmutarSimuladorAutoelevadorCabina(true);
              }}
              disabled={corriendo}
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-emerald-700 bg-emerald-600 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {corriendo ? 'En marcha' : 'Iniciar'}
            </button>
            <button
              type="button"
              onClick={() => setCorriendo(false)}
              disabled={!corriendo}
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-amber-400 bg-amber-50 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              Pausa
            </button>
            <button
              type="button"
              onClick={() => {
                setCorriendo(false);
                setSegundos(0);
                setIntercambioConfirmado(false);
                alarmaDisparadaRef.current = false;
                setSimuladorEnLinea(false);
                void conmutarSimuladorAutoelevadorCabina(false);
              }}
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Reiniciar
            </button>
          </div>
        </div>

        {/* Barra de progreso Split 30/30 con marcador medio */}
        <div className="space-y-1">
          <div className="relative h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            <div
              className={`h-full transition-all duration-300 ${
                segundos >= SEGUNDOS_MITAD_SPLIT ? 'bg-amber-500' : 'bg-emerald-600'
              }`}
              style={{ width: `${progresoSplitPct}%` }}
            />
            <span
              aria-hidden
              title="Marca minuto 30:00 (Intercambio)"
              className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-700"
            />
          </div>
          <div className="flex justify-between text-[11px] font-medium text-slate-500">
            <span>00:00 Inicio</span>
            <span className="font-semibold text-amber-700">30:00 Cambio</span>
            <span>60:00 Fin</span>
          </div>
        </div>

        {/* Alarma visual al alcanzar minuto 30 */}
        {alertaIntercambioActiva && (
          <div
            role="status"
            aria-live="assertive"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-900">
                Minuto 30 alcanzado · Intercambiar Piloto / Copiloto
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Rotar puesto en cabina entre integrante A y B para el segundo bloque.
              </p>
            </div>
            <button
              type="button"
              onClick={confirmarIntercambioSplit}
              className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 text-xs font-bold text-amber-950 transition-colors hover:bg-amber-300"
            >
              <ArrowLeftRight size={15} strokeWidth={2} aria-hidden />
              Intercambiar bloque
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
                className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-colors ${
                  activo
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-bold">
                  {b.rolCorto}
                </span>
                <span
                  className={`mt-0.5 text-[11px] font-medium ${
                    activo ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {b.mitad}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      )}

      {/* ── Los 4 ejes: pastillas gigantes [0][10][20] ───────────── */}
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Ejes de evaluación
        </h2>
        {EJES.map((eje) => (
          <div
            key={eje.clave}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <p className="mb-2 text-xs font-bold text-slate-800">
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
                    className={`flex min-h-[54px] flex-col items-center justify-center rounded-xl border text-center transition-colors ${
                      seleccionado
                        ? COLOR_PUNTAJE_ACTIVO[op.valor]
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base font-bold tabular-nums leading-none">
                      {op.valor}
                    </span>
                    <span className="mt-1 px-1 text-[11px] font-semibold leading-tight">
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
      <section>
        <button
          type="button"
          role="switch"
          aria-checked={bonus === 10}
          onClick={() => setBonus((b) => (b === 10 ? 0 : 10))}
          className={`flex min-h-[56px] w-full items-center justify-between rounded-xl border px-4 shadow-sm transition-colors ${
            bonus === 10
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <span
            className={`text-xs font-bold ${
              bonus === 10 ? 'text-emerald-800' : 'text-slate-700'
            }`}
          >
            +10 pts: Mejoró en 2do intento
          </span>
          <span
            aria-hidden
            className={`flex h-7 w-12 items-center rounded-full border p-0.5 transition-colors ${
              bonus === 10 ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-slate-200'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                bonus === 10 ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </section>

      {/* ── Selector de nivel de asistencia del instructor ───────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          Nivel de asistencia del instructor
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
                className={`flex min-h-[58px] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition-colors ${
                  activa
                    ? nivel.activoClase
                    : 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-bold leading-tight">
                  {nivel.etiqueta}
                </span>
                <span className="mt-0.5 text-[11px] font-medium opacity-85">
                  {nivel.detalle}
                </span>
              </button>
            );
          })}
        </div>
        {nivelAsistencia === 'INTERVENCION_CRITICA' && !hardFail && (
          <p className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Atención: con intervención crítica sobre mandos evaluá activar Falta crítica si existió riesgo de seguridad.
          </p>
        )}
      </section>

      {/* ── Tarjeta hard-fail ────────────────────────────────────── */}
      <section>
        <div
          className={`rounded-xl border p-4 shadow-sm ${
            hardFail ? 'border-rose-300 bg-rose-50' : 'border-rose-200 bg-white'
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
            className="flex min-h-[48px] w-full items-center justify-between"
          >
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${
                  hardFail ? 'bg-rose-600 animate-pulse' : 'bg-slate-300'
                }`}
              />
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  hardFail ? 'text-rose-700' : 'text-slate-700'
                }`}
              >
                Falta crítica (Desaprueba directo)
              </span>
            </span>
            <span
              aria-hidden
              className={`flex h-7 w-12 items-center rounded-full border p-0.5 transition-colors ${
                hardFail ? 'border-rose-600 bg-rose-600' : 'border-slate-300 bg-slate-200'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                  hardFail ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
          {hardFail ? (
            <label className="mt-2.5 block">
              <span className="mb-1 block text-xs font-bold text-rose-700">
                Motivo obligatorio * (fuerza No Apto)
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
                placeholder="Describí la falta crítica (obligatorio para guardar)…"
                className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                  motivoHardFail.trim().length === 0
                    ? 'border-rose-500'
                    : 'border-rose-300'
                }`}
              />
            </label>
          ) : null}
        </div>
      </section>

      {/* ── Observaciones e Instructor ───────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          Observaciones rápidas del instructor
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
                className={`min-h-[44px] rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  marcado
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              Instructor evaluador
            </span>
            <input
              type="text"
              maxLength={120}
              value={instructor}
              onChange={(ev) => setInstructor(ev.target.value)}
              placeholder="Nombre o usuario del instructor"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              Notas de desempeño (opcional)
            </span>
            <input
              type="text"
              maxLength={2000}
              value={observacionesDetalle}
              onChange={(ev) => setObservacionesDetalle(ev.target.value)}
              placeholder="Detalle breve para la ficha del alumno…"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
            />
          </label>
        </div>
      </section>

      {/* ── Decisión manual del instructor T0 ───────────────────── */}
      {etapa !== 'PRACTICA_REAL' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-700">
            Decisión del instructor en diagnóstico
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                {
                  valor: 'AUTO',
                  etiqueta: 'Según resultado automático',
                  activo: 'border-blue-600 bg-blue-600 text-white',
                },
                {
                  valor: 'APROBADO_A_CAPACITACION',
                  etiqueta: 'Aprueba → Pasa a curso',
                  activo: 'border-emerald-700 bg-emerald-600 text-white',
                },
                {
                  valor: 'RECHAZADO',
                  etiqueta: 'No aprueba',
                  activo: 'border-rose-700 bg-rose-600 text-white',
                },
              ] as const
            ).map((op) => (
              <button
                key={op.valor}
                type="button"
                aria-pressed={decisionManualT0 === op.valor}
                onClick={() => setDecisionManualT0(op.valor)}
                className={`min-h-[48px] rounded-xl border px-3 text-xs font-bold transition-colors ${
                  decisionManualT0 === op.valor
                    ? op.activo
                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {op.etiqueta}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Panel en vivo: score + dictamen ──────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Puntaje en vivo
            </span>
            <span className="text-4xl font-bold tabular-nums leading-none text-slate-900">
              {preview.score_total !== null ? (
                <>
                  {preview.score_total}
                  <span className="text-lg font-medium text-slate-400">/90</span>
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Resultado · {etapaActual.codigo}
            </span>
            {badge && preview.dictamen ? (
              <span
                className={`rounded-lg px-3.5 py-2 text-xs font-bold ${badge.fondo} ${badge.texto}`}
              >
                {preview.dictamen.replaceAll('_', ' ')}
              </span>
            ) : (
              <span className="rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-500">
                Pendiente
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Feedback + botón final ───────────────────────────────── */}
      <footer className="pb-6 pt-1">
        {feedbackBanner}
        <button
          type="button"
          onClick={guardar}
          disabled={enTransicion}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {enTransicion ? (
            <>
              <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              Guardando evaluación…
            </>
          ) : (
            'Guardar evaluación y pasar al siguiente'
          )}
        </button>
      </footer>
    </div>
  );
}
