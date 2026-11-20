'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowLeftRight,
  Award,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  PlusCircle,
  Search,
  Users,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
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
  CohorteCabinaOpcion,
  DictamenCabina,
  EtapaEvaluacionCabina,
  EvaluacionCabinaInput,
  ModoConsolaTactil,
  NivelAsistencia,
  PuntajeEje,
} from '@/types/cabina';
import type { DecisionInstructorTerreno } from '@/types/empleo';

/**
 * Consola Viva de Cabina — Modo Tablet limpio en 3 Toques:
 * 1. Elegir Cohorte -> 2. Elegir Instancia -> 3. Elegir Persona / Dupla -> Consola Táctil.
 */

interface Props {
  cohortes: CohorteCabinaOpcion[];
  alumnosPorCohorte: Record<string, AlumnoTurno[]>;
  instructorDefault?: string;
}

type PasoTablet = 'cohorte' | 'instancia' | 'persona' | 'consola';
type InstanciaTablet = 'DIAGNOSTICO' | 'FINAL' | 'PRACTICA_REAL';

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
  cohortes,
  alumnosPorCohorte,
  instructorDefault = '',
}: Props) {
  const [paso, setPaso] = useState<PasoTablet>('cohorte');
  const [cohorteIdSeleccionada, setCohorteIdSeleccionada] = useState<string | null>(
    null
  );
  const [instanciaSeleccionada, setInstanciaSeleccionada] =
    useState<InstanciaTablet>('DIAGNOSTICO');
  const [busquedaAlumno, setBusquedaAlumno] = useState('');

  const cohorteActual = cohortes.find((c) => c.id === cohorteIdSeleccionada) ?? null;
  const alumnos = useMemo(
    () =>
      cohorteIdSeleccionada
        ? (alumnosPorCohorte[cohorteIdSeleccionada] ?? [])
        : [],
    [cohorteIdSeleccionada, alumnosPorCohorte]
  );

  const [idSeleccionado, setIdSeleccionado] = useState<string | null>(null);
  const [evaluados, setEvaluados] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [etapa, setEtapa] = useState<ModoConsolaTactil>('DIAG_INTENTO_1');

  const idx = alumnos.findIndex((a) => a.inscripcion_id === idSeleccionado);
  const alumno =
    idSeleccionado && idx >= 0 && alumnos.length > 0 ? alumnos[idx] : undefined;

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

  function guardar() {
    if (enTransicion || lock.current) return;

    if (!alumno) {
      setFeedback({ ok: false, texto: 'Seleccioná una persona para evaluar.' });
      return;
    }

    // Bloqueo síncrono antes de validar o lanzar la transición asíncrona.
    lock.current = true;

    const motivoLimpio = motivoHardFail.trim();
    if (hardFail && motivoLimpio.length === 0) {
      lock.current = false;
      setFeedback({
        ok: false,
        texto: 'Indicá el motivo obligatorio de la falta crítica.',
      });
      motivoHardFailRef.current?.focus();
      return;
    }

    // Modo Tablet en Patio (Práctica Real · Cero Storage)
    if (etapa === 'PRACTICA_REAL') {
      const nivelFinal: NivelAsistencia = nivelAsistencia ?? 'AUTONOMO';
      const idGuardado = alumno.inscripcion_id;
      const nombreGuardado = alumno.nombre_completo;
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
              texto: `${nombreGuardado}: Práctica en patio guardada (${asistenciaTerreno} · ${decisionTerreno}).`,
            });
            resetPantalla();
            setEvaluados((prev) => new Set(prev).add(idGuardado));
            setIdSeleccionado(null);
            setPaso('persona');
          } else {
            setFeedback({ ok: false, texto: resTerreno.error });
          }
          if (timerFeedback.current) clearTimeout(timerFeedback.current);
          timerFeedback.current = setTimeout(() => setFeedback(null), 5000);
        } finally {
          lock.current = false;
        }
      });
      return;
    }

    const faltanEjes = EJES.some((e) => puntajes[e.clave] === undefined);
    if (!hardFail && faltanEjes) {
      lock.current = false;
      setFeedback({ ok: false, texto: 'Faltan puntajes de ejes por marcar.' });
      return;
    }
    if (!hardFail && !nivelAsistencia) {
      lock.current = false;
      setFeedback({ ok: false, texto: 'Seleccioná el nivel de asistencia.' });
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
    const nombreGuardado = alumno.nombre_completo;

    iniciarTransicion(async () => {
      try {
        const resultado = await registrarEvaluacionCabina(datos);
        if (resultado.ok) {
          setFeedback({
            ok: true,
            texto: `${nombreGuardado} guardado (${etapa} · ${resultado.dictamen ?? 'OK'} · ${resultado.score ?? 0} pts).`,
          });
          resetPantalla();
          setEvaluados((prev) => new Set(prev).add(idGuardado));
          setIdSeleccionado(null);
          setSimuladorEnLinea(false);
          void conmutarSimuladorAutoelevadorCabina(false);
          setPaso('persona');
        } else {
          setFeedback({ ok: false, texto: resultado.error ?? 'Error al guardar.' });
        }
        if (timerFeedback.current) clearTimeout(timerFeedback.current);
        timerFeedback.current = setTimeout(() => setFeedback(null), 5000);
      } finally {
        lock.current = false;
      }
    });
  }

  const badge = preview.dictamen ? BADGE_DICTAMEN[preview.dictamen] : null;
  const etapaActual = ETAPAS.find((item) => item.valor === etapa) ?? ETAPAS[0];

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

  const alumnosFiltrados = useMemo(() => {
    const q = busquedaAlumno.trim().toLowerCase();
    if (!q) return alumnos;
    return alumnos.filter(
      (a) =>
        a.nombre_completo.toLowerCase().includes(q) ||
        a.dni.toLowerCase().includes(q) ||
        (a.dupla_label ?? '').toLowerCase().includes(q) ||
        (a.companero_nombre ?? '').toLowerCase().includes(q)
    );
  }, [alumnos, busquedaAlumno]);

  // ── TOQUE 1: Elegir Cohorte ──────────────────────────────────────────────
  if (paso === 'cohorte' || !cohorteActual) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-5">
        <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Modo Tablet · Paso 1 de 3
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            Elegí la Cohorte para evaluar
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Tocá una cohorte para seleccionar luego si vas a evaluar Diagnóstico, Prueba Final o Práctica en Patio.
          </p>
        </header>

        <Link
          href="/admin/registro-actividades?nueva=1"
          className="flex items-center justify-between gap-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-4 text-left shadow-sm transition-all hover:border-emerald-500 hover:bg-emerald-50 active:scale-[0.99]"
        >
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700">
              <Building2 size={22} strokeWidth={2} aria-hidden />
            </span>
            <div>
              <p className="text-base font-bold text-slate-900">
                + Visita Institucional / Demo en Vivo
              </p>
              <p className="mt-0.5 text-xs text-slate-700">
                Cargá en 10 segundos a cualquier autoridad, delegación o empresa fuera de cohorte.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs">
            <PlusCircle size={15} aria-hidden />
            Cargar ahora
          </span>
        </Link>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cohortes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCohorteIdSeleccionada(c.id);
                setIdSeleccionado(null);
                setBusquedaAlumno('');
                setPaso('instancia');
              }}
              className="flex min-h-[136px] flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50/40 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {c.codigo}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    c.estado === 'activa'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
                  }`}
                >
                  {c.estado === 'activa' ? 'En Curso' : c.estado}
                </span>
              </div>

              <div className="mt-3">
                <p className="text-base font-bold text-slate-900">{c.nombre}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                  <Users size={14} aria-hidden />
                  {c.total_alumnos} alumnos habilitados
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── TOQUE 2: Elegir Instancia ────────────────────────────────────────────
  if (paso === 'instancia') {
    const opcionesInstancia: Array<{
      id: InstanciaTablet;
      etapaDefault: ModoConsolaTactil;
      titulo: string;
      subtitulo: string;
      icono: typeof ClipboardCheck;
      borde: string;
      badge: string;
    }> = [
      {
        id: 'DIAGNOSTICO',
        etapaDefault: 'DIAG_INTENTO_1',
        titulo: '1. Prueba de Diagnóstico',
        subtitulo: 'Primera o segunda pasada de evaluación inicial en simulador (V1 / V2).',
        icono: ClipboardCheck,
        borde: 'border-blue-200 hover:border-blue-500 hover:bg-blue-50/50',
        badge: 'Cabina Simulador',
      },
      {
        id: 'FINAL',
        etapaDefault: 'FINAL',
        titulo: '2. Prueba Final de Simulador',
        subtitulo: 'Evaluación final de egreso en simulador al terminar las horas de cursado.',
        icono: Award,
        borde: 'border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/50',
        badge: 'Cierre Simulador',
      },
      {
        id: 'PRACTICA_REAL',
        etapaDefault: 'PRACTICA_REAL',
        titulo: '3. Práctica Real en Patio (Máquina Física)',
        subtitulo: 'Evaluación directa sobre autoelevador real en predio con dictamen final.',
        icono: Wrench,
        borde: 'border-amber-200 hover:border-amber-500 hover:bg-amber-50/50',
        badge: 'Patio / Terreno',
      },
    ];

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-5">
        <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setPaso('cohorte')}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft size={14} aria-hidden />
            Cambiar Cohorte ({cohorteActual.codigo})
          </button>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Modo Tablet · Paso 2 de 3
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            ¿Qué instancia vas a evaluar?
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Cohorte: <strong>{cohorteActual.nombre}</strong>
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4">
          {opcionesInstancia.map((op) => {
            const Icon = op.icono;
            return (
              <button
                key={op.id}
                type="button"
                onClick={() => {
                  setInstanciaSeleccionada(op.id);
                  setEtapa(op.etapaDefault);
                  setPaso('persona');
                }}
                className={`flex min-h-[112px] items-center gap-4 rounded-2xl border-2 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.99] ${op.borde}`}
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
                  <Icon size={26} strokeWidth={1.85} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                    {op.badge}
                  </span>
                  <p className="mt-1.5 text-lg font-bold text-slate-900">
                    {op.titulo}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{op.subtitulo}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── TOQUE 3: Elegir Persona o Dupla ──────────────────────────────────────
  if (paso === 'persona' || !alumno) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-4">
        <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPaso('cohorte')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft size={14} aria-hidden />
              Cohorte: {cohorteActual.codigo}
            </button>
            <button
              type="button"
              onClick={() => setPaso('instancia')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <ArrowLeft size={14} aria-hidden />
              Instancia: {etapaActual.codigo}
            </button>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Modo Tablet · Paso 3 de 3
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            Tocá a la persona o dupla a evaluar
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {alumnos.length} alumnos en {cohorteActual.nombre} · {evaluados.size} evaluados en esta sesión
          </p>
        </header>

        {feedbackBanner}

        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={busquedaAlumno}
            onChange={(e) => setBusquedaAlumno(e.target.value)}
            placeholder="Buscar alumno por nombre, DNI o grupo de dupla…"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pr-4 pl-11 text-sm text-slate-900 shadow-xs placeholder:text-slate-400"
          />
        </div>

        {alumnosFiltrados.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-slate-700">
              No hay alumnos que coincidan con la búsqueda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {alumnosFiltrados.map((a) => {
              const yaEvaluado = evaluados.has(a.inscripcion_id);
              return (
                <button
                  key={a.inscripcion_id}
                  type="button"
                  onClick={() => {
                    setIdSeleccionado(a.inscripcion_id);
                    resetPantalla();
                    setPaso('consola');
                  }}
                  className={`flex min-h-[88px] flex-col justify-between rounded-xl border-2 p-4 text-left shadow-xs transition-all active:scale-[0.99] ${
                    yaEvaluado
                      ? 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-400'
                      : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-slate-900">
                        {a.nombre_completo}
                      </p>
                      <p className="text-xs text-slate-600">
                        #{a.ranking_orden} · DNI {a.dni}
                      </p>
                    </div>
                    {yaEvaluado && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        <CheckCircle2 size={12} aria-hidden />
                        Evaluado
                      </span>
                    )}
                  </div>

                  {a.dupla_label && (
                    <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                      {a.dupla_label}
                      {a.companero_nombre ? ` · Dupla con ${a.companero_nombre}` : ''}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const companeroAlumno = alumno.companero_nombre
    ? alumnos.find((a) => a.nombre_completo === alumno.companero_nombre) ?? null
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-4">
      {/* ── Cabecera de Evaluación Activa ────────────────────────── */}
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setCorriendo(false);
              setPaso('persona');
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft size={14} aria-hidden />
            Elegir otra persona / dupla
          </button>

          {etapa !== 'PRACTICA_REAL' && (
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
                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
              }`}
            >
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${
                  simuladorEnLinea ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'
                }`}
              />
              {simuladorEnLinea ? 'SIM-01 En Uso (3D)' : 'SIM-01 Libre (3D)'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div>
            <p className="text-xs font-semibold text-blue-700">
              {cohorteActual.codigo} · {etapaActual.codigo}
            </p>
            <h1 className="text-xl font-bold text-slate-900">
              {alumno.nombre_completo}
            </h1>
            <p className="text-xs text-slate-600">
              DNI {alumno.dni}
              {alumno.dupla_label ? ` · ${alumno.dupla_label}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {instanciaSeleccionada === 'DIAGNOSTICO' && (
              <div
                role="group"
                aria-label="Pasada de diagnóstico"
                className="flex rounded-lg border border-slate-200 bg-slate-50 p-1"
              >
                {(
                  [
                    ['DIAG_INTENTO_1', 'Diag 1 (V1)'],
                    ['DIAG_INTENTO_2', 'Diag 2 (V2)'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setEtapa(val)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                      etapa === val
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}

            {companeroAlumno && (
              <button
                type="button"
                onClick={() => {
                  setIdSeleccionado(companeroAlumno.inscripcion_id);
                  resetPantalla();
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                <ArrowLeftRight size={13} aria-hidden />
                Compañero: {companeroAlumno.nombre_completo.split(' ')[0]}
              </button>
            )}
          </div>
        </div>
      </header>

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
