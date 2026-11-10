'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { registrarEvaluacionCabina } from '@/services/cabina';
import { calcularDictamen } from '@/lib/cabina/dictamen';
import type {
  AlumnoTurno,
  AsistenciaCabina,
  DictamenCabina,
  EtapaEvaluacionCabina,
  EvaluacionCabinaInput,
  PuntajeEje,
} from '@/types/cabina';

/**
 * Consola Viva de Cabina — interfaz táctil fullscreen para el instructor.
 *
 * Estética industrial del proyecto: zinc plano, font-mono, uppercase con
 * tracking, rounded-sm, LEDs, sin sombras ni gradientes. Pastillas de ejes
 * min h-14 (56px) y botón final h-16 (64px): usable a una mano con pulgar.
 * El dictamen en vivo usa `calcularDictamen` del módulo puro compartido
 * (@/lib/cabina/dictamen), la misma regla que aplica el backend al guardar.
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

const ASISTENCIAS: readonly {
  valor: AsistenciaCabina;
  etiqueta: string;
  detalle: string;
  activoFondo: string;
  activoTexto: string;
  activoBorde: string;
}[] = [
  {
    valor: 'MINIMA_AUTONOMO',
    etiqueta: 'MÍNIMA',
    detalle: 'AUTÓNOMO',
    activoFondo: 'bg-emerald-500',
    activoTexto: 'text-emerald-950',
    activoBorde: 'border-emerald-500',
  },
  {
    valor: 'MEDIA',
    etiqueta: 'MEDIA',
    detalle: 'GUÍA VERBAL',
    activoFondo: 'bg-amber-400',
    activoTexto: 'text-amber-950',
    activoBorde: 'border-amber-400',
  },
  {
    valor: 'ALTA',
    etiqueta: 'ALTA',
    detalle: 'INTERVENCIÓN CONTINUA',
    activoFondo: 'bg-red-500',
    activoTexto: 'text-red-950',
    activoBorde: 'border-red-500',
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
  const [asistencia, setAsistencia] = useState<AsistenciaCabina | null>(null);
  const [hardFail, setHardFail] = useState(false);
  const [motivoHardFail, setMotivoHardFail] = useState('');
  const [instructor, setInstructor] = useState(instructorDefault);
  const [observacionesRapidas, setObservacionesRapidas] = useState<string[]>([]);
  const [observacionesDetalle, setObservacionesDetalle] = useState('');

  const [segundos, setSegundos] = useState(0);
  const [corriendo, setCorriendo] = useState(false);

  const [feedback, setFeedback] = useState<{ ok: boolean; texto: string } | null>(
    null
  );
  const motivoHardFailRef = useRef<HTMLTextAreaElement | null>(null);
  const timerFeedback = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    return () => {
      if (timerFeedback.current) clearTimeout(timerFeedback.current);
    };
  }, []);

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
        asistencia ?? 'ALTA',
        true
      );
      return {
        score_total: ejesCompletos ? (r.score_total as number) : null,
        dictamen: r.dictamen,
      };
    }
    if (!ejesCompletos || !asistencia) {
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
      asistencia,
      false
    );
    return { score_total: r.score_total as number | null, dictamen: r.dictamen };
  }, [ejesCompletos, puntajes, bonus, asistencia, hardFail]);

  function resetPantalla() {
    setPuntajes({
      puntaje_lateralidad: undefined,
      puntaje_tacto_mandos: undefined,
      puntaje_mastil: undefined,
      puntaje_control_receptividad: undefined,
    });
    setBonus(0);
    setAsistencia(null);
    setHardFail(false);
    setMotivoHardFail('');
    setObservacionesRapidas([]);
    setObservacionesDetalle('');
    setSegundos(0);
    setCorriendo(false);
  }

  function toggleObservacionRapida(texto: string) {
    setObservacionesRapidas((prev) =>
      prev.includes(texto) ? prev.filter((item) => item !== texto) : [...prev, texto]
    );
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
    if (!hardFail && !asistencia) {
      lock.current = false;
      setFeedback({ ok: false, texto: 'SELECCIONE EL NIVEL DE ASISTENCIA' });
      return;
    }

    const datos: EvaluacionCabinaInput = {
      postulante_id: alumno.postulante_id,
      inscripcion_id: alumno.inscripcion_id,
      etapa,
      puntaje_lateralidad: puntajes.puntaje_lateralidad ?? 0,
      puntaje_tacto_mandos: puntajes.puntaje_tacto_mandos ?? 0,
      puntaje_mastil: puntajes.puntaje_mastil ?? 0,
      puntaje_control_receptividad: puntajes.puntaje_control_receptividad ?? 0,
      bonus_segundo_intento: bonus,
      asistencia_cabina: asistencia ?? 'ALTA',
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
            texto: `GUARDADO (${etapa}) · ${resultado.dictamen ?? 'OK'} · ${resultado.score ?? 0} PTS`,
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
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-5 px-6 text-center">
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
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
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
                className={`flex h-12 flex-col items-center justify-center rounded-sm border px-2 text-center transition-colors ${
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
              className={`flex h-14 shrink-0 flex-col items-start justify-center rounded-sm border px-4 transition-colors ${
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

      {/* ── Cronómetro táctil ────────────────────────────────────── */}
      <section className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="flex min-w-32 flex-col rounded-sm border border-zinc-800 bg-zinc-900 px-4 py-2">
          <span className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
            TIEMPO DE VUELTA
          </span>
          <span className="text-3xl font-bold tabular-nums tracking-[0.06em] text-zinc-50">
            {formatearReloj(segundos)}
          </span>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setCorriendo(true)}
            disabled={corriendo}
            className="flex h-12 items-center justify-center rounded-sm border border-emerald-700 bg-emerald-950 text-[11px] font-bold tracking-[0.12em] text-emerald-300 transition-colors active:bg-emerald-900 disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
          >
            {corriendo ? 'EN MARCHA' : 'INICIAR'}
          </button>
          <button
            type="button"
            onClick={() => setCorriendo(false)}
            disabled={!corriendo}
            className="flex h-12 items-center justify-center rounded-sm border border-amber-700 bg-amber-950 text-[11px] font-bold tracking-[0.12em] text-amber-300 transition-colors active:bg-amber-900 disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
          >
            PAUSA
          </button>
          <button
            type="button"
            onClick={() => {
              setCorriendo(false);
              setSegundos(0);
            }}
            className="flex h-12 items-center justify-center rounded-sm border border-zinc-700 bg-zinc-900 text-[11px] font-bold tracking-[0.12em] text-zinc-200 transition-colors active:bg-zinc-800"
          >
            RESET
          </button>
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
                    className={`flex h-14 flex-col items-center justify-center rounded-sm border text-center transition-colors ${
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
          className={`flex h-14 w-full items-center justify-between rounded-sm border px-4 transition-colors ${
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

      {/* ── Asistencia recibida ──────────────────────────────────── */}
      <section className="px-4 pb-4">
        <h2 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          ASISTENCIA RECIBIDA
        </h2>
        <div role="group" aria-label="Asistencia recibida" className="grid grid-cols-3 gap-2">
          {ASISTENCIAS.map((a) => {
            const activa = asistencia === a.valor;
            return (
              <button
                key={a.valor}
                type="button"
                aria-pressed={activa}
                onClick={() => setAsistencia(a.valor)}
                className={`flex h-16 flex-col items-center justify-center rounded-sm border px-2 text-center transition-colors ${
                  activa
                    ? `${a.activoFondo} ${a.activoTexto} ${a.activoBorde}`
                    : 'border-zinc-700 bg-zinc-950 text-zinc-300 active:bg-zinc-800'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-[0.1em]">
                  {a.etiqueta}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] opacity-80">
                  {a.detalle}
                </span>
              </button>
            );
          })}
        </div>
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
            className="flex h-14 w-full items-center justify-between"
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
                  className={`min-h-10 rounded-sm border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
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
                className="h-11 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-400 focus:outline-none"
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
                className="h-11 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-400 focus:outline-none"
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
          className="flex h-16 w-full items-center justify-center gap-2 rounded-sm border border-zinc-100 bg-zinc-100 text-sm font-bold uppercase tracking-[0.18em] text-zinc-950 transition-colors active:bg-zinc-300 disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
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
