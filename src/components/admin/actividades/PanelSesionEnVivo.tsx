'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { Plus, Trash2, X, Save, Timer, AlertTriangle } from 'lucide-react';
import {
  iniciarSesionEnVivoAction,
  sincronizarParticipantesAction,
  finalizarSesionEnVivoAction,
} from '@/app/admin/registro-actividades/actions';
import {
  ETIQUETAS_GENERO_CORTAS,
  ETIQUETAS_TIPO_ACTIVIDAD,
  type ActividadItem,
  type GeneroParticipante,
  type ParticipanteInput,
  type Simulador,
  type TipoActividad,
} from '@/types/actividades';

/**
 * Panel de SESIÓN EN VIVO para tablet.
 *
 * Gestiona dos fases dentro de un mismo modal industrial:
 *  - Fase A (actividadEnCurso === null): formulario para INICIAR una sesión.
 *  - Fase B (actividadEnCurso !== null): monitoreo, sincronización de nómina
 *    y FINALIZACIÓN de la sesión activa.
 *
 * El <Cronometro> está aislado (React.memo + estado propio) para que su tick
 * de 1 Hz NO re-renderice el árbol del panel.
 */

interface PanelSesionEnVivoProps {
  abierto: boolean;
  simuladores: Simulador[];
  actividadEnCurso: ActividadItem | null;
  onCerrar: () => void;
  onSesionIniciada: () => void;
  onSesionFinalizada: () => void;
}

/** Fila local de participante (clave estable mientras se edita la grilla). */
interface FilaParticipante {
  clave: string;
  apellido_nombre: string;
  dni: string;
  genero: GeneroParticipante;
  puesto: string;
}

/** Fila inicial vacía para arrancar la grilla. */
function filaVacia(indice: number): FilaParticipante {
  return {
    clave: `p-${indice}-${Math.random().toString(36).slice(2, 8)}`,
    apellido_nombre: '',
    dni: '',
    genero: 'no_especifica',
    puesto: '',
  };
}

/** Formatea una duración en ms como HH:MM:SS. */
function formatearDuracion(ms: number): string {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(totalSegundos / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSegundos % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSegundos % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const LABEL_CLASS =
  'block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500';
const INPUT_CLASS =
  'w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none';
const PANEL_CLASS = 'rounded-sm border border-zinc-800 bg-zinc-950';
const ERROR_CLASS =
  'rounded-sm border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200';
const BTN_SECUNDARIO =
  'inline-flex items-center justify-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-3 font-mono text-[11px] tracking-[0.08em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]';

const GENEROS: GeneroParticipante[] = ['hombre', 'mujer', 'otro', 'no_especifica'];

/* ═══════════════════════════════════════════════════════════════════════
 *  CRONÓMETRO — subcomponente AISLADO (memo + estado propio)
 * ═══════════════════════════════════════════════════════════════════════ */

const Cronometro = memo(function Cronometro({
  horaInicio,
  fechaActividad,
}: {
  horaInicio: string;
  fechaActividad: string;
}) {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    const inicioMs = new Date(`${fechaActividad}T${horaInicio}`).getTime();
    if (Number.isNaN(inicioMs)) return;

    function tick() {
      setElapsed(Date.now() - inicioMs);
    }
    tick(); // primer render inmediato
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [horaInicio, fechaActividad]);

  // SSR-safe: muestra guiones hasta el primer tick.
  if (elapsed === null) {
    return (
      <span className="font-mono text-4xl tabular-nums tracking-[0.16em] text-zinc-600">
        --:--:--
      </span>
    );
  }

  return (
    <span className="font-mono text-4xl tabular-nums tracking-[0.16em] text-emerald-400">
      {formatearDuracion(elapsed)}
    </span>
  );
});

/* ═══════════════════════════════════════════════════════════════════════
 *  PANEL PRINCIPAL
 * ═══════════════════════════════════════════════════════════════════════ */

export default function PanelSesionEnVivo({
  abierto,
  simuladores,
  actividadEnCurso,
  onCerrar,
  onSesionIniciada,
  onSesionFinalizada,
}: PanelSesionEnVivoProps) {
  /* ---- Estado del formulario (Fase A) ---- */
  const [tipo, setTipo] = useState<TipoActividad>('empresa');
  const [entidadNombre, setEntidadNombre] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [simuladoresIds, setSimuladoresIds] = useState<string[]>([]);
  const [participantes, setParticipantes] = useState<FilaParticipante[]>(() => [
    filaVacia(0),
  ]);

  /* ---- Estado compartido ---- */
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  const actividadId = actividadEnCurso?.id ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  /* ---- Escape cierra el panel ---- */
  useEffect(() => {
    if (!abierto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrar();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  /* ---- Precarga la nómina cuando cambia la sesión activa ---- */
  useEffect(() => {
    if (!actividadEnCurso) return;
    const filas = actividadEnCurso.participantes;
    setParticipantes(
      filas.length > 0
        ? filas.map((p, i) => ({
            clave: `p-${i}-${Math.random().toString(36).slice(2, 8)}`,
            apellido_nombre: p.apellido_nombre,
            dni: p.dni ?? '',
            genero: p.genero,
            puesto: p.puesto ?? '',
          }))
        : [filaVacia(0)]
    );
    setUltimaSync(null);
    setMostrarConfirmacion(false);
    setError(null);
    // Solo re-cargar cuando cambia la sesión (no en cada refresh del padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actividadId]);

  /* ---- Helpers de participantes ---- */
  const agregarParticipante = useCallback(() => {
    setParticipantes((prev) => [...prev, filaVacia(prev.length)]);
  }, []);

  const eliminarParticipante = useCallback((clave: string) => {
    setParticipantes((prev) => prev.filter((p) => p.clave !== clave));
  }, []);

  const actualizarParticipante = useCallback(
    (clave: string, cambios: Partial<Omit<FilaParticipante, 'clave'>>) => {
      setParticipantes((prev) =>
        prev.map((p) => (p.clave === clave ? { ...p, ...cambios } : p))
      );
    },
    []
  );

  const mapearAParticipanteInput = useCallback((): ParticipanteInput[] => {
    return participantes
      .filter((p) => p.apellido_nombre.trim().length > 0)
      .map((p) => ({
        apellido_nombre: p.apellido_nombre.trim(),
        dni: p.dni.trim(),
        genero: p.genero,
        puesto: p.puesto.trim(),
      }));
  }, [participantes]);

  const alternarSimulador = useCallback((id: string) => {
    setSimuladoresIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  /* ---- Simuladores libres (Fase A) ---- */
  const simuladoresLibres = useMemo(
    () => simuladores.filter((s) => s.estado === 'libre'),
    [simuladores]
  );

  function reiniciarFormulario() {
    setTipo('empresa');
    setEntidadNombre('');
    setContactoNombre('');
    setContactoTelefono('');
    setObservaciones('');
    setSimuladoresIds([]);
    setParticipantes([filaVacia(0)]);
    setError(null);
  }

  /* ---- Fase A: iniciar sesión ---- */
  const iniciarSesion = useCallback(() => {
    setError(null);
    if (!entidadNombre.trim()) {
      setError('Debe indicar el nombre de la entidad o empresa.');
      return;
    }
    if (simuladoresIds.length < 1) {
      setError('Debe seleccionar al menos un simulador para iniciar la sesión.');
      return;
    }

    const payload = {
      tipo,
      entidad_nombre: entidadNombre.trim(),
      contacto_nombre: contactoNombre.trim(),
      contacto_telefono: contactoTelefono.trim(),
      observaciones: observaciones.trim(),
      simuladores_ids: simuladoresIds,
      participantes: participantes
        .filter((p) => p.apellido_nombre.trim().length > 0)
        .map((p) => ({
          apellido_nombre: p.apellido_nombre.trim(),
          dni: p.dni.trim(),
          genero: p.genero,
          puesto: p.puesto.trim(),
        })),
    };

    startTransition(async () => {
      const resultado = await iniciarSesionEnVivoAction(payload);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      reiniciarFormulario();
      onSesionIniciada();
    });
  }, [
    entidadNombre,
    simuladoresIds,
    tipo,
    contactoNombre,
    contactoTelefono,
    observaciones,
    participantes,
    onSesionIniciada,
  ]);

  /* ---- Fase B: sincronizar nómina ---- */
  const sincronizarNomina = useCallback(() => {
    if (!actividadEnCurso) return;
    setError(null);
    startTransition(async () => {
      const resultado = await sincronizarParticipantesAction(
        actividadEnCurso.id,
        mapearAParticipanteInput()
      );
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setUltimaSync(new Date().toTimeString().slice(0, 8));
    });
  }, [actividadEnCurso, mapearAParticipanteInput]);

  /* ---- Fase B: finalizar sesión ---- */
  const finalizarSesion = useCallback(() => {
    if (!actividadEnCurso) return;
    setError(null);
    startTransition(async () => {
      const resultado = await finalizarSesionEnVivoAction({
        actividad_id: actividadEnCurso.id,
        participantes: mapearAParticipanteInput(),
        observaciones: actividadEnCurso.observaciones ?? undefined,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setMostrarConfirmacion(false);
      reiniciarFormulario();
      onSesionFinalizada();
      onCerrar();
    });
  }, [actividadEnCurso, mapearAParticipanteInput, onSesionFinalizada, onCerrar]);

  if (!abierto) return null;

  const nombresSimuladoresActivos = (actividadEnCurso?.simuladores ?? [])
    .map((s) => s.simulador_nombre ?? 'SIMULADOR')
    .join(', ');

  // Duración transcurrida calculada en el instante en que se abre el diálogo.
  let duracionTranscurrida: string | null = null;
  if (actividadEnCurso?.hora_inicio) {
    const inicioMs = new Date(
      `${actividadEnCurso.fecha_actividad}T${actividadEnCurso.hora_inicio}`
    ).getTime();
    if (!Number.isNaN(inicioMs)) {
      duracionTranscurrida = formatearDuracion(Date.now() - inicioMs);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[5vh]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sesión en vivo"
        className={`${PANEL_CLASS} relative w-full max-w-4xl`}
      >
        {/* Botón cerrar */}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar panel de sesión en vivo"
          className="absolute right-3 top-3 z-10 rounded-sm border border-zinc-800 bg-zinc-950 p-2 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
        >
          <X size={16} strokeWidth={2} />
        </button>

        {actividadEnCurso === null ? (
          /* ═══════════ FASE A — INICIAR SESIÓN ═══════════ */
          <div className="space-y-5 p-5">
            <header className="pr-12">
              <h2 className="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                [ INICIAR SESIÓN EN VIVO ]
              </h2>
              <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
                OPERACIÓN EN TIEMPO REAL · ENTIDAD, EQUIPOS Y NÓMINA
              </p>
            </header>

            {error && (
              <p role="alert" className={ERROR_CLASS}>
                {error}
              </p>
            )}

            {/* 01 · Tipo de actividad */}
            <section className={PANEL_CLASS}>
              <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
                01 · TIPO DE ACTIVIDAD
              </h3>
              <div className="flex flex-wrap gap-2 p-3">
                {(Object.keys(ETIQUETAS_TIPO_ACTIVIDAD) as TipoActividad[]).map(
                  (clave) => {
                    const activo = tipo === clave;
                    return (
                      <button
                        key={clave}
                        type="button"
                        onClick={() => setTipo(clave)}
                        aria-pressed={activo}
                        className={`min-h-[44px] rounded-sm border px-4 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                          activo
                            ? 'border-emerald-600 bg-emerald-900 text-emerald-100'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                        }`}
                      >
                        {ETIQUETAS_TIPO_ACTIVIDAD[clave]}
                      </button>
                    );
                  }
                )}
              </div>
            </section>

            {/* 02 · Datos de la entidad */}
            <section className={PANEL_CLASS}>
              <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
                02 · DATOS DE LA ENTIDAD
              </h3>
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="vivo-entidad" className={LABEL_CLASS}>
                    Entidad / Empresa *
                  </label>
                  <input
                    id="vivo-entidad"
                    type="text"
                    value={entidadNombre}
                    onChange={(e) => setEntidadNombre(e.target.value)}
                    required
                    placeholder="Ej: MUNICIPALIDAD DE ROSARIO"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="vivo-contacto" className={LABEL_CLASS}>
                    Contacto
                  </label>
                  <input
                    id="vivo-contacto"
                    type="text"
                    value={contactoNombre}
                    onChange={(e) => setContactoNombre(e.target.value)}
                    placeholder="Nombre y apellido"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="vivo-telefono" className={LABEL_CLASS}>
                    Teléfono
                  </label>
                  <input
                    id="vivo-telefono"
                    type="tel"
                    inputMode="tel"
                    value={contactoTelefono}
                    onChange={(e) => setContactoTelefono(e.target.value)}
                    placeholder="Ej: 341 555 0000"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="vivo-observaciones" className={LABEL_CLASS}>
                    Observaciones
                  </label>
                  <textarea
                    id="vivo-observaciones"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    rows={2}
                    placeholder="Notas operativas, requisitos, etc."
                    className={`${INPUT_CLASS} resize-y`}
                  />
                </div>
              </div>
            </section>

            {/* 03 · Simuladores */}
            <section className={PANEL_CLASS}>
              <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
                03 · SIMULADORES ({simuladoresIds.length})
              </h3>
              <div className="flex flex-wrap gap-2 p-3">
                {simuladoresLibres.length === 0 && (
                  <p className="font-mono text-[11px] text-zinc-500">
                    NO HAY SIMULADORES LIBRES EN LA FLOTA.
                  </p>
                )}
                {simuladoresLibres.map((sim) => {
                  const activo = simuladoresIds.includes(sim.id);
                  return (
                    <button
                      key={sim.id}
                      type="button"
                      onClick={() => alternarSimulador(sim.id)}
                      aria-pressed={activo}
                      className={`flex min-h-[44px] items-center gap-2 rounded-sm border px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                        activo
                          ? 'border-emerald-600 bg-emerald-950 text-emerald-200'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {sim.nombre.toUpperCase()}
                      <span className="text-zinc-600">·</span>
                      <span className={activo ? 'text-emerald-400' : 'text-zinc-500'}>
                        LB
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 04 · Nómina inicial (opcional) */}
            <GrillaParticipantes
              titulo="04 · NÓMINA INICIAL (OPCIONAL)"
              participantes={participantes}
              onAgregar={agregarParticipante}
              onEliminar={eliminarParticipante}
              onActualizar={actualizarParticipante}
            />

            {/* Footer */}
            <footer className="pt-1">
              <button
                type="button"
                onClick={iniciarSesion}
                disabled={pendiente}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-sm border border-red-700 bg-red-950 font-mono text-sm tracking-[0.12em] text-red-100 transition-colors hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                {pendiente ? 'INICIANDO…' : '[ INICIAR SESIÓN EN VIVO ]'}
              </button>
            </footer>
          </div>
        ) : (
          /* ═══════════ FASE B — SESIÓN ACTIVA ═══════════ */
          <div className="space-y-5 p-5">
            <header className="pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100">
                  {actividadEnCurso.entidad_nombre.toUpperCase()}
                </h2>
                <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400">
                  {ETIQUETAS_TIPO_ACTIVIDAD[actividadEnCurso.tipo]}
                </span>
                <span className="flex items-center gap-1.5 rounded-sm border border-emerald-700 bg-emerald-950 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-emerald-300">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  EN CURSO
                </span>
              </div>
            </header>

            {error && (
              <p role="alert" className={ERROR_CLASS}>
                {error}
              </p>
            )}

            {/* Cronómetro */}
            <section className={`${PANEL_CLASS} flex flex-col items-center gap-2 py-6`}>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                <Timer size={12} strokeWidth={2} />
                TIEMPO TRANSCURRIDO
              </span>
              {actividadEnCurso.hora_inicio ? (
                <Cronometro
                  horaInicio={actividadEnCurso.hora_inicio}
                  fechaActividad={actividadEnCurso.fecha_actividad}
                />
              ) : (
                <span className="font-mono text-4xl tabular-nums tracking-[0.16em] text-zinc-600">
                  --:--:--
                </span>
              )}
              <span className="font-mono text-[11px] tracking-[0.12em] text-zinc-500">
                INICIO: {actividadEnCurso.hora_inicio ?? '—'}
              </span>
            </section>

            {/* Simuladores vinculados */}
            <section className={PANEL_CLASS}>
              <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
                SIMULADORES VINCULADOS ({actividadEnCurso.simuladores.length})
              </h3>
              <div className="flex flex-wrap gap-2 p-3">
                {actividadEnCurso.simuladores.length === 0 && (
                  <p className="font-mono text-[11px] text-zinc-500">
                    SIN EQUIPOS VINCULADOS.
                  </p>
                )}
                {actividadEnCurso.simuladores.map((s) => (
                  <span
                    key={s.id}
                    className="flex min-h-[44px] items-center gap-2 rounded-sm border border-emerald-800 bg-emerald-950 px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-emerald-200"
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                    {(s.simulador_nombre ?? 'SIMULADOR').toUpperCase()}
                  </span>
                ))}
              </div>
            </section>

            {/* Nómina editable */}
            <GrillaParticipantes
              titulo="NÓMINA DE PARTICIPANTES (EN VIVO)"
              participantes={participantes}
              onAgregar={agregarParticipante}
              onEliminar={eliminarParticipante}
              onActualizar={actualizarParticipante}
            />

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={sincronizarNomina}
                disabled={pendiente}
                className={`${BTN_SECUNDARIO} w-full border-emerald-700 text-emerald-200 hover:border-emerald-500 hover:text-emerald-50`}
              >
                <Save size={14} strokeWidth={2} />
                {pendiente ? 'SINCRONIZANDO…' : '[ SINCRONIZAR NÓMINA ]'}
              </button>
              <p className="text-center font-mono text-[10px] tracking-[0.12em] text-zinc-500">
                ÚLTIMA SYNC: {ultimaSync ?? '—'}
              </p>
            </div>

            {/* Finalizar */}
            <footer className="pt-1">
              <button
                type="button"
                onClick={() => setMostrarConfirmacion(true)}
                disabled={pendiente}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-sm border border-red-700 bg-red-950 font-mono text-sm tracking-[0.12em] text-red-100 transition-colors hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                [ FINALIZAR ACTIVIDAD Y LIBERAR EQUIPOS ]
              </button>
            </footer>
          </div>
        )}

        {/* ═══════════ Micro-modal de confirmación ═══════════ */}
        {mostrarConfirmacion && actividadEnCurso && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="titulo-confirmacion"
              aria-describedby="descripcion-confirmacion"
              className="w-full max-w-md rounded-sm border border-red-800 bg-zinc-950"
            >
              <div className="flex items-start gap-3 border-b border-zinc-800 px-4 py-3">
                <AlertTriangle size={18} strokeWidth={2} className="mt-0.5 text-red-400" />
                <div>
                  <h3
                    id="titulo-confirmacion"
                    className="font-mono text-sm font-semibold uppercase tracking-[0.12em] text-red-100"
                  >
                    ¿CONFIRMAR FINALIZACIÓN?
                  </h3>
                  <p
                    id="descripcion-confirmacion"
                    className="mt-1 font-mono text-[10px] tracking-[0.1em] text-zinc-500"
                  >
                    SE CERRARÁ LA SESIÓN Y SE LIBERARÁN LOS EQUIPOS.
                  </p>
                </div>
              </div>

              <dl className="space-y-2 px-4 py-3 font-mono text-[11px] tracking-[0.08em]">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">DURACIÓN</dt>
                  <dd className="tabular-nums text-emerald-300">
                    {duracionTranscurrida ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">PARTICIPANTES</dt>
                  <dd className="text-zinc-200">
                    {mapearAParticipanteInput().length}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-zinc-500">LIBERAR</dt>
                  <dd className="text-right text-zinc-200">
                    {nombresSimuladoresActivos || '—'}
                  </dd>
                </div>
              </dl>

              <div className="flex gap-2 border-t border-zinc-800 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setMostrarConfirmacion(false)}
                  disabled={pendiente}
                  className={`${BTN_SECUNDARIO} flex-1`}
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={finalizarSesion}
                  disabled={pendiente}
                  className="flex-1 rounded-sm border border-red-700 bg-red-950 px-3 py-3 font-mono text-[11px] tracking-[0.08em] text-red-100 transition-colors hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
                >
                  {pendiente ? 'FINALIZANDO…' : 'CONFIRMAR'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  GRILLA DE PARTICIPANTES (compartida por ambas fases)
 * ═══════════════════════════════════════════════════════════════════════ */

interface GrillaParticipantesProps {
  titulo: string;
  participantes: FilaParticipante[];
  onAgregar: () => void;
  onEliminar: (clave: string) => void;
  onActualizar: (
    clave: string,
    cambios: Partial<Omit<FilaParticipante, 'clave'>>
  ) => void;
}

function GrillaParticipantes({
  titulo,
  participantes,
  onAgregar,
  onEliminar,
  onActualizar,
}: GrillaParticipantesProps) {
  return (
    <section className={PANEL_CLASS}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <h3 className="font-mono text-[10px] tracking-[0.16em] text-zinc-500">
          {titulo} ({participantes.length})
        </h3>
        <button type="button" onClick={onAgregar} className={BTN_SECUNDARIO}>
          <Plus size={13} strokeWidth={2.25} />
          [ + AGREGAR PERSONA ]
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-zinc-800 bg-zinc-900 px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Apellido y Nombre *
              </th>
              <th className="border-b border-zinc-800 bg-zinc-900 px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                DNI
              </th>
              <th className="border-b border-zinc-800 bg-zinc-900 px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Género
              </th>
              <th className="border-b border-zinc-800 bg-zinc-900 px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Puesto
              </th>
              <th
                aria-label="Acciones"
                className="w-12 border-b border-zinc-800 bg-zinc-900 px-2 py-2"
              />
            </tr>
          </thead>
          <tbody>
            {participantes.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-4 text-center font-mono text-[11px] text-zinc-600"
                >
                  SIN PARTICIPANTES CARGADOS.
                </td>
              </tr>
            )}
            {participantes.map((fila) => (
              <tr key={fila.clave} className="hover:bg-zinc-900/50">
                <td className="border-b border-zinc-800 px-2 py-2">
                  <input
                    type="text"
                    value={fila.apellido_nombre}
                    onChange={(e) =>
                      onActualizar(fila.clave, { apellido_nombre: e.target.value })
                    }
                    placeholder="Ej: PEREZ, JUAN"
                    className={INPUT_CLASS}
                  />
                </td>
                <td className="border-b border-zinc-800 px-2 py-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fila.dni}
                    onChange={(e) => onActualizar(fila.clave, { dni: e.target.value })}
                    placeholder="Opcional"
                    className={INPUT_CLASS}
                  />
                </td>
                <td className="border-b border-zinc-800 px-2 py-2">
                  <div className="flex gap-1">
                    {GENEROS.map((g) => {
                      const activo = fila.genero === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => onActualizar(fila.clave, { genero: g })}
                          aria-pressed={activo}
                          aria-label={`Género ${ETIQUETAS_GENERO_CORTAS[g]}`}
                          className={`min-h-[44px] min-w-[44px] rounded-sm border font-mono text-[11px] tracking-[0.06em] transition-colors ${
                            activo
                              ? 'border-emerald-600 bg-emerald-900 text-emerald-100'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                          }`}
                        >
                          {ETIQUETAS_GENERO_CORTAS[g]}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="border-b border-zinc-800 px-2 py-2">
                  <input
                    type="text"
                    value={fila.puesto}
                    onChange={(e) =>
                      onActualizar(fila.clave, { puesto: e.target.value })
                    }
                    placeholder="Operario, Chofer, Estudiante…"
                    className={INPUT_CLASS}
                  />
                </td>
                <td className="border-b border-zinc-800 px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => onEliminar(fila.clave)}
                    aria-label="Eliminar participante"
                    title="Eliminar participante"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 p-2 text-zinc-500 transition-colors hover:border-red-900 hover:bg-red-950 hover:text-red-200"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
