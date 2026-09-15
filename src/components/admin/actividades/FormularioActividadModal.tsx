'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { crearActividadAction } from '@/app/admin/registro-actividades/actions';
import {
  ETIQUETAS_ESTADO_ACTIVIDAD,
  ETIQUETAS_GENERO,
  ETIQUETAS_TIPO_ACTIVIDAD,
  type ActividadInput,
  type EstadoActividad,
  type GeneroParticipante,
  type Simulador,
  type TipoActividad,
} from '@/types/actividades';

/**
 * Modal industrial de alta de actividad.
 *
 * - La duración se calcula automáticamente desde hora_inicio/hora_fin cuando
 *   ambos valores son válidos; si no, el operador la carga manualmente.
 * - La grilla de participantes es dinámica: se agregan/eliminan filas sin
 *   recargar. Se valida en cliente antes de invocar la Server Action.
 */

interface FormularioActividadModalProps {
  abierto: boolean;
  simuladores: Simulador[];
  onCerrar: () => void;
  /** Se invoca tras un submit exitoso para que la página revalidada muestre el alta. */
  onRegistrada?: () => void;
}

/** Fila local de participante (índice-estable mientras se edita la grilla). */
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

/** Calcula minutos entre HH:MM; devuelve null si alguno es inválido o negativo. */
function calcularDuracion(inicio: string, fin: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) return null;
  const [hi, mi] = inicio.split(':').map(Number);
  const [hf, mf] = fin.split(':').map(Number);
  const minutosInicio = hi * 60 + mi;
  const minutosFin = hf * 60 + mf;
  const diferencia = minutosFin - minutosInicio;
  return diferencia > 0 ? diferencia : null;
}

const LABEL_CLASS =
  'block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500';
const INPUT_CLASS =
  'w-full rounded-sm border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none';
const SELECT_CLASS = INPUT_CLASS;
const BTN_SECUNDARIO =
  'inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] tracking-[0.08em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';
const PANEL_CLASS = 'rounded-sm border border-zinc-800 bg-zinc-950';
const ERROR_CLASS = 'rounded-sm border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200';

export default function FormularioActividadModal({
  abierto,
  simuladores,
  onCerrar,
  onRegistrada,
}: FormularioActividadModalProps) {
  const [entidadNombre, setEntidadNombre] = useState('');
  const [tipo, setTipo] = useState<TipoActividad>('empresa');
  const [estado, setEstado] = useState<EstadoActividad>('planificada');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [duracionManual, setDuracionManual] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [simuladoresIds, setSimuladoresIds] = useState<string[]>([]);
  const [participantes, setParticipantes] = useState<FilaParticipante[]>(() => [
    filaVacia(0),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const duracionAuto = useMemo(
    () => calcularDuracion(horaInicio, horaFin),
    [horaInicio, horaFin]
  );
  const duracionEfectiva = duracionAuto ?? Number.parseInt(duracionManual, 10);
  const duracionValida =
    Number.isInteger(duracionEfectiva) && duracionEfectiva > 0;

  if (!abierto) return null;

  function alternarSimulador(id: string) {
    setSimuladoresIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function agregarParticipante() {
    setParticipantes((prev) => [...prev, filaVacia(prev.length)]);
  }

  function eliminarParticipante(clave: string) {
    setParticipantes((prev) => prev.filter((p) => p.clave !== clave));
  }

  function actualizarParticipante(
    clave: string,
    cambios: Partial<Omit<FilaParticipante, 'clave'>>
  ) {
    setParticipantes((prev) =>
      prev.map((p) => (p.clave === clave ? { ...p, ...cambios } : p))
    );
  }

  function reiniciarFormulario() {
    setEntidadNombre('');
    setTipo('empresa');
    setEstado('planificada');
    setContactoNombre('');
    setContactoTelefono('');
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setDuracionManual('');
    setObservaciones('');
    setSimuladoresIds([]);
    setParticipantes([filaVacia(0)]);
    setError(null);
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);

    if (!entidadNombre.trim()) {
      setError('Debe indicar el nombre de la entidad o empresa.');
      return;
    }
    if (!fecha) {
      setError('Debe seleccionar la fecha de la actividad.');
      return;
    }
    if (!duracionValida) {
      setError(
        'Debe indicar una duración válida en minutos (o cargar hora de inicio y fin).'
      );
      return;
    }
    const filasValidas = participantes.filter(
      (p) => p.apellido_nombre.trim().length > 0
    );
    if (filasValidas.length === 0) {
      setError('Debe cargar al menos un participante con nombre y apellido.');
      return;
    }

    const payload: ActividadInput = {
      tipo,
      entidad_nombre: entidadNombre.trim(),
      contacto_nombre: contactoNombre.trim(),
      contacto_telefono: contactoTelefono.trim(),
      fecha_actividad: fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      duracion_minutos: duracionEfectiva,
      estado,
      observaciones: observaciones.trim(),
      participantes: filasValidas.map((p) => ({
        apellido_nombre: p.apellido_nombre.trim(),
        dni: p.dni.trim(),
        genero: p.genero,
        puesto: p.puesto.trim(),
      })),
      simuladores_ids: simuladoresIds,
    };

    startTransition(async () => {
      const resultado = await crearActividadAction(payload);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      reiniciarFormulario();
      onRegistrada?.();
      onCerrar();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-actividad"
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
    >
      <form
        onSubmit={enviar}
        className="my-6 w-full max-w-5xl rounded-sm border border-zinc-700 bg-zinc-900"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div>
            <h2
              id="titulo-modal-actividad"
              className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100"
            >
              [ NUEVA ACTIVIDAD ]
            </h2>
            <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
              REGISTRO PRESENCIAL · ENTIDAD, NÓMINA Y SIMULADORES
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

        <div className="space-y-5 px-5 py-4">
          {error && (
            <p role="alert" className={ERROR_CLASS}>
              {error}
            </p>
          )}

          {/* ── Cabecera de la actividad ─────────────────────────── */}
          <section className={PANEL_CLASS}>
            <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
              01 · DATOS DE LA ACTIVIDAD
            </h3>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="entidad_nombre" className={LABEL_CLASS}>
                  Entidad / Empresa *
                </label>
                <input
                  id="entidad_nombre"
                  type="text"
                  value={entidadNombre}
                  onChange={(e) => setEntidadNombre(e.target.value)}
                  required
                  placeholder="Ej: MUNICIPALIDAD DE ROSARIO"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="tipo_actividad" className={LABEL_CLASS}>
                  Tipo *
                </label>
                <select
                  id="tipo_actividad"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoActividad)}
                  className={SELECT_CLASS}
                >
                  {(Object.keys(ETIQUETAS_TIPO_ACTIVIDAD) as TipoActividad[]).map(
                    (clave) => (
                      <option key={clave} value={clave}>
                        {ETIQUETAS_TIPO_ACTIVIDAD[clave]}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="fecha_actividad" className={LABEL_CLASS}>
                  Fecha *
                </label>
                <input
                  id="fecha_actividad"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="hora_inicio" className={LABEL_CLASS}>
                  Hora inicio
                </label>
                <input
                  id="hora_inicio"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="hora_fin" className={LABEL_CLASS}>
                  Hora fin
                </label>
                <input
                  id="hora_fin"
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="duracion_minutos" className={LABEL_CLASS}>
                  Duración (min) *
                </label>
                <input
                  id="duracion_minutos"
                  type="number"
                  min={1}
                  step={1}
                  value={duracionAuto !== null ? duracionAuto : duracionManual}
                  onChange={(e) => setDuracionManual(e.target.value)}
                  disabled={duracionAuto !== null}
                  required
                  className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-400`}
                />
                {duracionAuto !== null && (
                  <p className="mt-1 font-mono text-[10px] tracking-[0.1em] text-emerald-400">
                    AUTO-CALCULADA · {duracionAuto} MIN
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="estado_actividad" className={LABEL_CLASS}>
                  Estado *
                </label>
                <select
                  id="estado_actividad"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as EstadoActividad)}
                  className={SELECT_CLASS}
                >
                  {(Object.keys(ETIQUETAS_ESTADO_ACTIVIDAD) as EstadoActividad[]).map(
                    (clave) => (
                      <option key={clave} value={clave}>
                        {ETIQUETAS_ESTADO_ACTIVIDAD[clave]}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="contacto_nombre" className={LABEL_CLASS}>
                  Contacto
                </label>
                <input
                  id="contacto_nombre"
                  type="text"
                  value={contactoNombre}
                  onChange={(e) => setContactoNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="contacto_telefono" className={LABEL_CLASS}>
                  Teléfono
                </label>
                <input
                  id="contacto_telefono"
                  type="tel"
                  value={contactoTelefono}
                  onChange={(e) => setContactoTelefono(e.target.value)}
                  placeholder="Ej: 341 555 0000"
                  className={INPUT_CLASS}
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label htmlFor="observaciones" className={LABEL_CLASS}>
                  Observaciones
                </label>
                <textarea
                  id="observaciones"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  placeholder="Notas operativas, requisitos, etc."
                  className={`${INPUT_CLASS} resize-y`}
                />
              </div>
            </div>
          </section>

          {/* ── Simuladores involucrados ────────────────────────── */}
          <section className={PANEL_CLASS}>
            <h3 className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-zinc-500">
              02 · SIMULADORES INVOLUCRADOS ({simuladoresIds.length})
            </h3>
            <div className="flex flex-wrap gap-2 p-3">
              {simuladores.length === 0 && (
                <p className="font-mono text-[11px] text-zinc-500">
                  SIN SIMULADORES DISPONIBLES EN LA FLOTA.
                </p>
              )}
              {simuladores.map((sim) => {
                const activo = simuladoresIds.includes(sim.id);
                return (
                  <label
                    key={sim.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-[11px] tracking-[0.08em] transition-colors ${
                      activo
                        ? 'border-emerald-700 bg-emerald-950 text-emerald-100'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={() => alternarSimulador(sim.id)}
                      className="h-3 w-3 shrink-0 cursor-pointer rounded-none border border-zinc-600 bg-zinc-950 accent-emerald-500"
                    />
                    {sim.nombre.toUpperCase()}
                    <span className="text-zinc-600">·</span>
                    <span
                      className={
                        sim.estado === 'en_operacion'
                          ? 'text-emerald-400'
                          : sim.estado === 'mantenimiento'
                            ? 'text-amber-400'
                            : 'text-zinc-500'
                      }
                    >
                      {sim.estado === 'en_operacion'
                        ? 'OP'
                        : sim.estado === 'mantenimiento'
                          ? 'MT'
                          : 'LB'}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* ── Nómina dinámica ─────────────────────────────────── */}
          <section className={PANEL_CLASS}>
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
              <h3 className="font-mono text-[10px] tracking-[0.16em] text-zinc-500">
                03 · NÓMINA DE PARTICIPANTES ({participantes.length})
              </h3>
              <button
                type="button"
                onClick={agregarParticipante}
                className={BTN_SECUNDARIO}
              >
                <Plus size={12} strokeWidth={2.25} />
                [ + AGREGAR PERSONA ]
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-zinc-800 bg-zinc-900 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Apellido y Nombre *
                    </th>
                    <th className="border-b border-zinc-800 bg-zinc-900 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      DNI
                    </th>
                    <th className="border-b border-zinc-800 bg-zinc-900 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Género
                    </th>
                    <th className="border-b border-zinc-800 bg-zinc-900 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Puesto
                    </th>
                    <th
                      aria-label="Acciones"
                      className="w-10 border-b border-zinc-800 bg-zinc-900 px-2 py-1.5"
                    />
                  </tr>
                </thead>
                <tbody>
                  {participantes.map((fila) => (
                    <tr key={fila.clave} className="hover:bg-zinc-900/50">
                      <td className="border-b border-zinc-800 px-2 py-1.5">
                        <input
                          type="text"
                          value={fila.apellido_nombre}
                          onChange={(e) =>
                            actualizarParticipante(fila.clave, {
                              apellido_nombre: e.target.value,
                            })
                          }
                          placeholder="Ej: PEREZ, JUAN"
                          className={INPUT_CLASS}
                        />
                      </td>
                      <td className="border-b border-zinc-800 px-2 py-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={fila.dni}
                          onChange={(e) =>
                            actualizarParticipante(fila.clave, { dni: e.target.value })
                          }
                          placeholder="Opcional"
                          className={INPUT_CLASS}
                        />
                      </td>
                      <td className="border-b border-zinc-800 px-2 py-1.5">
                        <select
                          value={fila.genero}
                          onChange={(e) =>
                            actualizarParticipante(fila.clave, {
                              genero: e.target.value as GeneroParticipante,
                            })
                          }
                          className={SELECT_CLASS}
                        >
                          {(Object.keys(ETIQUETAS_GENERO) as GeneroParticipante[]).map(
                            (clave) => (
                              <option key={clave} value={clave}>
                                {ETIQUETAS_GENERO[clave]}
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td className="border-b border-zinc-800 px-2 py-1.5">
                        <input
                          type="text"
                          value={fila.puesto}
                          onChange={(e) =>
                            actualizarParticipante(fila.clave, { puesto: e.target.value })
                          }
                          placeholder="Operario, Chofer, Estudiante…"
                          className={INPUT_CLASS}
                        />
                      </td>
                      <td className="border-b border-zinc-800 px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => eliminarParticipante(fila.clave)}
                          aria-label="Eliminar participante"
                          title="Eliminar participante"
                          disabled={participantes.length === 1}
                          className="rounded-sm border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-500 transition-colors hover:border-red-900 hover:bg-red-950 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:bg-zinc-950 disabled:hover:text-zinc-500"
                        >
                          <Trash2 size={12} strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950 px-5 py-3">
          <p className="font-mono text-[10px] tracking-[0.14em] text-zinc-600">
            {participantes.filter((p) => p.apellido_nombre.trim().length > 0).length}{' '}
            PERSONAS · {simuladoresIds.length} SIMULADORES
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={pendiente}
              className={BTN_SECUNDARIO}
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={pendiente}
              className="inline-flex items-center gap-2 rounded-sm border border-emerald-700 bg-emerald-900 px-3 py-2 font-mono text-[11px] tracking-[0.1em] text-emerald-50 transition-colors hover:border-emerald-500 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendiente ? 'REGISTRANDO…' : '[ REGISTRAR ACTIVIDAD Y NÓMINA ]'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
