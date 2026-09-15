'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  obtenerFechasDisponiblesAction,
  actualizarVisitaEducativaAction,
} from '@/app/admin/visitas-educativas/actions';
import type {
  VisitaEducativa,
  FechaDisponibleItem,
  EditarVisitaInput,
} from '@/types/visitas';

/* ═══════════════════════════════════════════════════════════════════════
 *  TOKENS DE ESTILO (mismos valores que FormularioActividadModal)
 * ═══════════════════════════════════════════════════════════════════════ */

const LABEL_CLASS =
  'block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500';
const INPUT_CLASS =
  'w-full rounded-sm border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none';
const SELECT_CLASS = INPUT_CLASS;
const BTN_SECUNDARIO =
  'inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] tracking-[0.08em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';
const PANEL_CLASS = 'rounded-sm border border-zinc-800 bg-zinc-950';
const ERROR_CLASS =
  'rounded-sm border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200';

/* ═══════════════════════════════════════════════════════════════════════
 *  TIPOS LOCALES
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Extensión local de VisitaEducativa con los campos adicionales confirmados
 * en la base de datos que no figuran en el tipo público.
 */
interface VisitaEducativaExtendida extends VisitaEducativa {
  tup_chofer_nombre?: string | null;
  observaciones_docente?: string | null;
}

/** Estados permitidos en el selector de edición. */
const ESTADOS_VISITA: EditarVisitaInput['estado_visita'][] = [
  'Confirmada',
  'Reprogramada',
  'Cancelada',
  'Completada',
  'Pendiente',
];

interface ModalEditarVisitaProps {
  abierto: boolean;
  visita: VisitaEducativa | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

export default function ModalEditarVisita({
  abierto,
  visita,
  onCerrar,
  onGuardado,
}: ModalEditarVisitaProps) {
  /* ── Estado del formulario ── */
  const [fechaVisita, setFechaVisita] = useState('');
  const [turno, setTurno] = useState<'Mañana' | 'Tarde' | ''>('');
  const [division, setDivision] = useState('');
  const [cantAlumnos, setCantAlumnos] = useState('');
  const [nombreDirector, setNombreDirector] = useState('');
  const [celDirector, setCelDirector] = useState('');
  const [nombreDocente, setNombreDocente] = useState('');
  const [celDocente, setCelDocente] = useState('');
  const [emailContacto, setEmailContacto] = useState('');
  const [requiereTup, setRequiereTup] = useState(false);
  const [tupIdaDesde, setTupIdaDesde] = useState('');
  const [tupIdaHasta, setTupIdaHasta] = useState('');
  const [tupVueltaDesde, setTupVueltaDesde] = useState('');
  const [tupVueltaHasta, setTupVueltaHasta] = useState('');
  const [tupChoferNombre, setTupChoferNombre] = useState('');
  const [estadoVisita, setEstadoVisita] =
    useState<EditarVisitaInput['estado_visita']>('Confirmada');
  const [observacionesDocente, setObservacionesDocente] = useState('');

  /* ── Estado de carga/fechas ── */
  const [fechasDisponibles, setFechasDisponibles] = useState<FechaDisponibleItem[]>([]);
  const [cargandoFechas, setCargandoFechas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  /* ── Extender visita para campos extra de DB ── */
  const visitaExtendida = visita as VisitaEducativaExtendida | null;

  /* ═══════════════════════════════════════════════════════════════════════
   *  EFECTOS
   * ═══════════════════════════════════════════════════════════════════════ */

  /** Sincronizar estados del formulario desde la visita seleccionada. */
  useEffect(() => {
    if (!abierto || !visitaExtendida) return;

    setFechaVisita(visitaExtendida.fecha_visita ?? '');
    setTurno(
      visitaExtendida.turno === 'Mañana' || visitaExtendida.turno === 'Tarde'
        ? visitaExtendida.turno
        : ''
    );
    setDivision(visitaExtendida.division ?? '');
    setCantAlumnos(String(visitaExtendida.cant_alumnos ?? ''));
    setNombreDirector(visitaExtendida.nombre_director ?? '');
    setCelDirector(visitaExtendida.cel_director ?? '');
    setNombreDocente(visitaExtendida.nombre_docente ?? '');
    setCelDocente(visitaExtendida.cel_docente ?? '');
    setEmailContacto(visitaExtendida.email_contacto ?? '');
    setRequiereTup(visitaExtendida.requiere_tup ?? false);
    setTupIdaDesde(visitaExtendida.tup_horario_ida_desde ?? '');
    setTupIdaHasta(visitaExtendida.tup_horario_ida_hasta ?? '');
    setTupVueltaDesde(visitaExtendida.tup_horario_vuelta_desde ?? '');
    setTupVueltaHasta(visitaExtendida.tup_horario_vuelta_hasta ?? '');
    setTupChoferNombre(visitaExtendida.tup_chofer_nombre ?? '');
    setObservacionesDocente(visitaExtendida.observaciones_docente ?? '');
    setError(null);

    const estado = visitaExtendida.estado_visita;
    setEstadoVisita(
      ESTADOS_VISITA.includes(estado as EditarVisitaInput['estado_visita'])
        ? (estado as EditarVisitaInput['estado_visita'])
        : 'Confirmada'
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visita?.id]);

  /** Cargar fechas disponibles desde la Server Action. */
  useEffect(() => {
    if (!abierto || !visita) return;

    let cancelado = false;
    setCargandoFechas(true);

    (async () => {
      const resultado = await obtenerFechasDisponiblesAction(visita.id);
      if (cancelado) return;
      if (resultado.ok) {
        setFechasDisponibles(resultado.fechas);
      }
      setCargandoFechas(false);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, visita?.id]);

  /** Cerrar con tecla Escape. */
  useEffect(() => {
    if (!abierto) return;

    function manejarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }

    document.addEventListener('keydown', manejarTecla);
    return () => document.removeEventListener('keydown', manejarTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  /* ═══════════════════════════════════════════════════════════════════════
   *  GUARD TEMPRANO
   * ═══════════════════════════════════════════════════════════════════════ */

  if (!abierto || !visita) return null;

  /* ═══════════════════════════════════════════════════════════════════════
   *  SUBMIT
   * ═══════════════════════════════════════════════════════════════════════ */

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);

    if (!visita) return;

    const alumnos = Number.parseInt(cantAlumnos, 10);
    if (!Number.isInteger(alumnos) || alumnos <= 0 || alumnos > 45) {
      setError('La cantidad de alumnos debe estar entre 1 y 45.');
      return;
    }

    if (!fechaVisita) {
      setError('Debe seleccionar una fecha para la visita.');
      return;
    }

    const payload: EditarVisitaInput = {
      id: visita.id,
      fecha_visita: fechaVisita,
      turno: turno === '' ? null : turno,
      division: division.trim() || null,
      cant_alumnos: alumnos,
      nombre_director: nombreDirector.trim() || null,
      cel_director: celDirector.trim() || null,
      nombre_docente: nombreDocente.trim() || null,
      cel_docente: celDocente.trim() || null,
      email_contacto: emailContacto.trim() || null,
      requiere_tup: requiereTup,
      tup_horario_ida_desde: requiereTup ? tupIdaDesde || null : null,
      tup_horario_ida_hasta: requiereTup ? tupIdaHasta || null : null,
      tup_horario_vuelta_desde: requiereTup ? tupVueltaDesde || null : null,
      tup_horario_vuelta_hasta: requiereTup ? tupVueltaHasta || null : null,
      tup_chofer_nombre: requiereTup ? tupChoferNombre.trim() || null : null,
      estado_visita: estadoVisita,
      observaciones_docente: observacionesDocente.trim() || null,
    };

    startTransition(async () => {
      const resultado = await actualizarVisitaEducativaAction(payload);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      onGuardado();
      onCerrar();
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  HELPERS DE RENDER
   * ═══════════════════════════════════════════════════════════════════════ */

  const fechaCambioReprogramacion =
    fechaVisita !== '' && visita.fecha_visita !== fechaVisita;

  /** Formatea fecha ISO (YYYY-MM-DD) a DD/MM/YYYY legible. */
  function formatearFecha(iso: string): string {
    const [anio, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  RENDER
   * ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-editar-visita"
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
    >
      <form
        onSubmit={enviar}
        className="my-6 w-full max-w-4xl rounded-sm border border-zinc-700 bg-zinc-900"
      >
        {/* ── CABECERA ── */}
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div>
            <h2
              id="titulo-modal-editar-visita"
              className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100"
            >
              [ MODIFICAR RESERVA // {visita.codigo_reserva} ]
            </h2>
            <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
              ESTADO ACTUAL:{' '}
              <span className="text-zinc-300">
                {visita.estado_visita.toUpperCase()}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar formulario"
            className="rounded-sm border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        {/* ── CUERPO ── */}
        <div className="space-y-5 px-5 py-4">
          {error && (
            <p role="alert" className={ERROR_CLASS}>
              {error}
            </p>
          )}

          {fechaCambioReprogramacion && (
            <p className="rounded-sm border border-amber-900 bg-amber-950 px-3 py-2 text-sm text-amber-200">
              ⚠ REPROGRAMACIÓN: la fecha cambiará de{' '}
              {formatearFecha(visita.fecha_visita)} a{' '}
              {formatearFecha(fechaVisita)}
            </p>
          )}

          {/* ── SECCIÓN 01 · AGENDA Y TURNO ── */}
          <section className={PANEL_CLASS}>
            <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
              01 · AGENDA Y TURNO
            </h3>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label htmlFor="editar_fecha_visita" className={LABEL_CLASS}>
                  Fecha de visita *
                </label>
                <select
                  id="editar_fecha_visita"
                  value={fechaVisita}
                  onChange={(e) => setFechaVisita(e.target.value)}
                  disabled={cargandoFechas}
                  required
                  className={SELECT_CLASS}
                >
                  {cargandoFechas && (
                    <option value="">Cargando fechas...</option>
                  )}
                  {!cargandoFechas && (
                    <>
                      {/* Opción de la fecha actual siempre presente */}
                      {!fechasDisponibles.some((f) => f.fecha === visita.fecha_visita) && (
                        <option value={visita.fecha_visita}>
                          {formatearFecha(visita.fecha_visita)} (actual)
                        </option>
                      )}
                      {fechasDisponibles.map((item) => (
                        <option
                          key={item.id}
                          value={item.fecha}
                          disabled={item.ocupada}
                        >
                          {formatearFecha(item.fecha)}
                          {item.fecha === visita.fecha_visita ? ' (actual)' : ''}
                          {item.ocupada
                            ? ` — OCUPADA (${item.ocupada_por_codigo ?? 'N/A'})`
                            : ''}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="editar_turno" className={LABEL_CLASS}>
                  Turno
                </label>
                <select
                  id="editar_turno"
                  value={turno}
                  onChange={(e) =>
                    setTurno(e.target.value as 'Mañana' | 'Tarde' | '')
                  }
                  className={SELECT_CLASS}
                >
                  <option value="">— Sin especificar —</option>
                  <option value="Mañana">Mañana</option>
                  <option value="Tarde">Tarde</option>
                </select>
              </div>

              <div>
                <label htmlFor="editar_cant_alumnos" className={LABEL_CLASS}>
                  Cantidad de alumnos *
                </label>
                <input
                  id="editar_cant_alumnos"
                  type="number"
                  min={1}
                  max={45}
                  value={cantAlumnos}
                  onChange={(e) => setCantAlumnos(e.target.value)}
                  required
                  className={INPUT_CLASS}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="editar_division" className={LABEL_CLASS}>
                  División
                </label>
                <input
                  id="editar_division"
                  type="text"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  placeholder="Ej: 5to soc 1"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </section>

          {/* ── SECCIÓN 02 · CONTACTOS INSTITUCIONALES ── */}
          <section className={PANEL_CLASS}>
            <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
              02 · CONTACTOS INSTITUCIONALES
            </h3>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="editar_nombre_director" className={LABEL_CLASS}>
                  Nombre del director/a
                </label>
                <input
                  id="editar_nombre_director"
                  type="text"
                  value={nombreDirector}
                  onChange={(e) => setNombreDirector(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="editar_cel_director" className={LABEL_CLASS}>
                  Celular del director/a
                </label>
                <input
                  id="editar_cel_director"
                  type="tel"
                  value={celDirector}
                  onChange={(e) => setCelDirector(e.target.value)}
                  placeholder="Ej: 3462 55 0000"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="editar_email_contacto" className={LABEL_CLASS}>
                  Email de contacto
                </label>
                <input
                  id="editar_email_contacto"
                  type="email"
                  value={emailContacto}
                  onChange={(e) => setEmailContacto(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="editar_nombre_docente" className={LABEL_CLASS}>
                  Nombre del docente
                </label>
                <input
                  id="editar_nombre_docente"
                  type="text"
                  value={nombreDocente}
                  onChange={(e) => setNombreDocente(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="editar_cel_docente" className={LABEL_CLASS}>
                  Celular del docente
                </label>
                <input
                  id="editar_cel_docente"
                  type="tel"
                  value={celDocente}
                  onChange={(e) => setCelDocente(e.target.value)}
                  placeholder="Ej: 3462 55 0000"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </section>

          {/* ── SECCIÓN 03 · LOGÍSTICA TUP ── */}
          <section className={PANEL_CLASS}>
            <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
              03 · LOGÍSTICA TUP (TRANSPORTE)
            </h3>
            <div className="space-y-3 p-3">
              <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-zinc-300">
                <input
                  type="checkbox"
                  checked={requiereTup}
                  onChange={(e) => setRequiereTup(e.target.checked)}
                  className="h-3 w-3 shrink-0 cursor-pointer rounded-none border border-zinc-600 bg-zinc-950 accent-emerald-500"
                />
                REQUIERE TRANSPORTE TUP
              </label>

              {requiereTup && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label htmlFor="editar_tup_ida_desde" className={LABEL_CLASS}>
                      Ida desde (hora)
                    </label>
                    <input
                      id="editar_tup_ida_desde"
                      type="time"
                      value={tupIdaDesde}
                      onChange={(e) => setTupIdaDesde(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>

                  <div>
                    <label htmlFor="editar_tup_ida_hasta" className={LABEL_CLASS}>
                      Ida hasta (hora)
                    </label>
                    <input
                      id="editar_tup_ida_hasta"
                      type="time"
                      value={tupIdaHasta}
                      onChange={(e) => setTupIdaHasta(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>

                  <div>
                    <label htmlFor="editar_tup_vuelta_desde" className={LABEL_CLASS}>
                      Vuelta desde (hora)
                    </label>
                    <input
                      id="editar_tup_vuelta_desde"
                      type="time"
                      value={tupVueltaDesde}
                      onChange={(e) => setTupVueltaDesde(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>

                  <div>
                    <label htmlFor="editar_tup_vuelta_hasta" className={LABEL_CLASS}>
                      Vuelta hasta (hora)
                    </label>
                    <input
                      id="editar_tup_vuelta_hasta"
                      type="time"
                      value={tupVueltaHasta}
                      onChange={(e) => setTupVueltaHasta(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="editar_tup_chofer" className={LABEL_CLASS}>
                      Chofer asignado
                    </label>
                    <input
                      id="editar_tup_chofer"
                      type="text"
                      value={tupChoferNombre}
                      onChange={(e) => setTupChoferNombre(e.target.value)}
                      placeholder="Nombre del chofer"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── SECCIÓN 04 · ESTADO Y NOTAS ── */}
          <section className={PANEL_CLASS}>
            <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
              04 · ESTADO Y NOTAS
            </h3>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
              <div>
                <label htmlFor="editar_estado_visita" className={LABEL_CLASS}>
                  Estado de la reserva *
                </label>
                <select
                  id="editar_estado_visita"
                  value={estadoVisita}
                  onChange={(e) =>
                    setEstadoVisita(
                      e.target.value as EditarVisitaInput['estado_visita']
                    )
                  }
                  className={SELECT_CLASS}
                >
                  {ESTADOS_VISITA.map((estado) => (
                    <option key={estado} value={estado}>
                      {estado}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="editar_observaciones" className={LABEL_CLASS}>
                  Observaciones del docente
                </label>
                <textarea
                  id="editar_observaciones"
                  value={observacionesDocente}
                  onChange={(e) => setObservacionesDocente(e.target.value)}
                  rows={3}
                  placeholder="Notas adicionales, requerimientos especiales…"
                  className={`${INPUT_CLASS} resize-y`}
                />
              </div>
            </div>
          </section>
        </div>

        {/* ── FOOTER ── */}
        <footer className="flex items-center justify-end gap-3 border-t border-zinc-800 px-5 py-3">
          <button
            type="button"
            onClick={onCerrar}
            className={BTN_SECUNDARIO}
            disabled={pendiente}
          >
            CANCELAR
          </button>
          <button
            type="submit"
            disabled={pendiente || cargandoFechas}
            className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-700 px-4 py-1.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendiente ? <Loader2 size={13} className="animate-spin" /> : null}
            {pendiente ? 'GUARDANDO…' : 'GUARDAR CAMBIOS'}
          </button>
        </footer>
      </form>
    </div>
  );
}
