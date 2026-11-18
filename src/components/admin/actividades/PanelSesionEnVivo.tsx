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

const LABEL_CLASS = 'mb-1 block text-xs font-semibold text-slate-700';
const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const PANEL_CLASS = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const ERROR_CLASS =
  'rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800';
const BTN_SECUNDARIO =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]';

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
      <span className="font-mono text-4xl font-bold tabular-nums tracking-wider text-slate-400">
        --:--:--
      </span>
    );
  }

  return (
    <span className="font-mono text-4xl font-bold tabular-nums tracking-wider text-emerald-700">
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[5vh] backdrop-blur-xs">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sesión en vivo"
        className={`${PANEL_CLASS} relative w-full max-w-4xl`}
      >
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar panel de sesión en vivo"
          className="absolute right-3 top-3 z-10 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={18} strokeWidth={2} />
        </button>

        {actividadEnCurso === null ? (
          <div className="space-y-5 p-5">
            <header className="pr-12">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
                Iniciar sesión en vivo
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Seleccioná el tipo de grupo, simuladores y asistentes
              </p>
            </header>

            {error && (
              <p role="alert" className={ERROR_CLASS}>
                {error}
              </p>
            )}

            <section className={PANEL_CLASS}>
              <h3 className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                1. Tipo de actividad
              </h3>
              <div className="flex flex-wrap gap-2 p-4">
                {(Object.keys(ETIQUETAS_TIPO_ACTIVIDAD) as TipoActividad[]).map(
                  (clave) => {
                    const activo = tipo === clave;
                    return (
                      <button
                        key={clave}
                        type="button"
                        onClick={() => setTipo(clave)}
                        aria-pressed={activo}
                        className={`min-h-[44px] rounded-lg border px-4 text-xs font-semibold transition-colors ${
                          activo
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {ETIQUETAS_TIPO_ACTIVIDAD[clave]}
                      </button>
                    );
                  }
                )}
              </div>
            </section>

            <section className={PANEL_CLASS}>
              <h3 className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                2. Datos de la institución
              </h3>
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="vivo-entidad" className={LABEL_CLASS}>
                    Institución / Empresa *
                  </label>
                  <input
                    id="vivo-entidad"
                    type="text"
                    value={entidadNombre}
                    onChange={(e) => setEntidadNombre(e.target.value)}
                    required
                    placeholder="Ej: Municipalidad de Rosario"
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
                    placeholder="Notas adicionales…"
                    className={`${INPUT_CLASS} resize-y`}
                  />
                </div>
              </div>
            </section>

            <section className={PANEL_CLASS}>
              <h3 className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                3. Simuladores libres ({simuladoresIds.length} seleccionados)
              </h3>
              <div className="flex flex-wrap gap-2 p-4">
                {simuladoresLibres.length === 0 && (
                  <p className="text-xs text-slate-500">
                    No hay simuladores disponibles en este momento.
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
                      className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-3.5 text-xs font-semibold transition-colors ${
                        activo
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {sim.nombre}
                    </button>
                  );
                })}
              </div>
            </section>

            <GrillaParticipantes
              titulo="4. Asistentes (opcional)"
              participantes={participantes}
              onAgregar={agregarParticipante}
              onEliminar={eliminarParticipante}
              onActualizar={actualizarParticipante}
            />

            <footer className="pt-1">
              <button
                type="button"
                onClick={iniciarSesion}
                disabled={pendiente}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-bold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                {pendiente ? 'Iniciando…' : 'Iniciar sesión en vivo'}
              </button>
            </footer>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <header className="pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {actividadEnCurso.entidad_nombre}
                </h2>
                <span className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {ETIQUETAS_TIPO_ACTIVIDAD[actividadEnCurso.tipo]}
                </span>
                <span className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  En curso
                </span>
              </div>
            </header>

            {error && (
              <p role="alert" className={ERROR_CLASS}>
                {error}
              </p>
            )}

            <section className={`${PANEL_CLASS} flex flex-col items-center gap-2 bg-slate-50 py-6`}>
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Timer size={14} strokeWidth={2} />
                Tiempo transcurrido
              </span>
              {actividadEnCurso.hora_inicio ? (
                <Cronometro
                  horaInicio={actividadEnCurso.hora_inicio}
                  fechaActividad={actividadEnCurso.fecha_actividad}
                />
              ) : (
                <span className="text-4xl font-bold tabular-nums text-slate-400">
                  --:--:--
                </span>
              )}
              <span className="text-xs font-medium text-slate-500">
                Inicio: {actividadEnCurso.hora_inicio ?? '—'}
              </span>
            </section>

            <section className={PANEL_CLASS}>
              <h3 className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                Simuladores asignados ({actividadEnCurso.simuladores.length})
              </h3>
              <div className="flex flex-wrap gap-2 p-4">
                {actividadEnCurso.simuladores.length === 0 && (
                  <p className="text-xs text-slate-500">
                    Sin simuladores vinculados.
                  </p>
                )}
                {actividadEnCurso.simuladores.map((s) => (
                  <span
                    key={s.id}
                    className="flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700"
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    {s.simulador_nombre ?? 'Simulador'}
                  </span>
                ))}
              </div>
            </section>

            <GrillaParticipantes
              titulo="Lista de participantes"
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
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                <Save size={15} strokeWidth={2} />
                {pendiente ? 'Guardando…' : 'Guardar lista de asistentes'}
              </button>
              <p className="text-center text-xs text-slate-500">
                Último guardado: {ultimaSync ?? '—'}
              </p>
            </div>

            <footer className="pt-1">
              <button
                type="button"
                onClick={() => setMostrarConfirmacion(true)}
                disabled={pendiente}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-bold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Finalizar sesión y liberar simuladores
              </button>
            </footer>
          </div>
        )}

        {mostrarConfirmacion && actividadEnCurso && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="titulo-confirmacion"
              aria-describedby="descripcion-confirmacion"
              className="w-full max-w-md rounded-xl border border-rose-200 bg-white shadow-xl"
            >
              <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
                <AlertTriangle size={20} strokeWidth={2} className="mt-0.5 text-rose-600" />
                <div>
                  <h3
                    id="titulo-confirmacion"
                    className="text-base font-bold text-slate-900"
                  >
                    ¿Finalizar actividad?
                  </h3>
                  <p
                    id="descripcion-confirmacion"
                    className="mt-0.5 text-sm text-slate-600"
                  >
                    Se cerrará la sesión y quedarán libres los simuladores.
                  </p>
                </div>
              </div>

              <dl className="space-y-2 px-5 py-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Duración</dt>
                  <dd className="font-bold tabular-nums text-emerald-700">
                    {duracionTranscurrida ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Participantes</dt>
                  <dd className="font-semibold text-slate-900">
                    {mapearAParticipanteInput().length}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-slate-500">Simuladores</dt>
                  <dd className="text-right font-semibold text-slate-900">
                    {nombresSimuladoresActivos || '—'}
                  </dd>
                </div>
              </dl>

              <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => setMostrarConfirmacion(false)}
                  disabled={pendiente}
                  className={`${BTN_SECUNDARIO} flex-1`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={finalizarSesion}
                  disabled={pendiente}
                  className="min-h-[44px] flex-1 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendiente ? 'Finalizando…' : 'Confirmar cierre'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          {titulo} ({participantes.length})
        </h3>
        <button type="button" onClick={onAgregar} className={BTN_SECUNDARIO}>
          <Plus size={14} strokeWidth={2.25} />
          Agregar persona
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2.5">Apellido y Nombre *</th>
              <th className="px-3 py-2.5">DNI</th>
              <th className="px-3 py-2.5">Género</th>
              <th className="px-3 py-2.5">Puesto</th>
              <th aria-label="Acciones" className="w-12 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {participantes.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-500"
                >
                  Sin participantes cargados.
                </td>
              </tr>
            )}
            {participantes.map((fila) => (
              <tr key={fila.clave} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2">
                  <input
                    type="text"
                    value={fila.apellido_nombre}
                    onChange={(e) =>
                      onActualizar(fila.clave, { apellido_nombre: e.target.value })
                    }
                    placeholder="Ej: Pérez, Juan"
                    className={INPUT_CLASS}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fila.dni}
                    onChange={(e) => onActualizar(fila.clave, { dni: e.target.value })}
                    placeholder="Opcional"
                    className={INPUT_CLASS}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
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
                          className={`min-h-[42px] min-w-[42px] rounded-lg border text-xs font-semibold transition-colors ${
                            activo
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {ETIQUETAS_GENERO_CORTAS[g]}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
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
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => onEliminar(fila.clave)}
                    aria-label="Eliminar participante"
                    title="Eliminar participante"
                    className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 size={15} strokeWidth={2} />
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
