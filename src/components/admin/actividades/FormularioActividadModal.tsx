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

const LABEL_CLASS = 'mb-1 block text-xs font-semibold text-slate-700';
const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const SELECT_CLASS = INPUT_CLASS;
const BTN_SECUNDARIO =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';
const PANEL_CLASS = 'rounded-xl border border-slate-200 bg-slate-50/70';
const ERROR_CLASS =
  'rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800';

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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <form
        onSubmit={enviar}
        className="my-6 w-full max-w-5xl rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="titulo-modal-actividad"
              className="text-lg font-bold text-slate-900"
            >
              Nueva Actividad
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Registro de entidad, simuladores utilizados y lista de participantes
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar formulario"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="space-y-5 px-5 py-4">
          {error && (
            <p role="alert" className={ERROR_CLASS}>
              {error}
            </p>
          )}

          <section className={PANEL_CLASS}>
            <h3 className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
              1. Datos de la actividad
            </h3>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="entidad_nombre" className={LABEL_CLASS}>
                  Institución / Empresa *
                </label>
                <input
                  id="entidad_nombre"
                  type="text"
                  value={entidadNombre}
                  onChange={(e) => setEntidadNombre(e.target.value)}
                  required
                  placeholder="Ej: Municipalidad de Rosario"
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
                  className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600`}
                />
                {duracionAuto !== null && (
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    Calculada automáticamente: {duracionAuto} min
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
                  placeholder="Notas adicionales…"
                  className={`${INPUT_CLASS} resize-y`}
                />
              </div>
            </div>
          </section>

          <section className={PANEL_CLASS}>
            <h3 className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
              2. Simuladores utilizados ({simuladoresIds.length})
            </h3>
            <div className="flex flex-wrap gap-2 p-4">
              {simuladores.length === 0 && (
                <p className="text-xs text-slate-500">
                  No hay simuladores disponibles.
                </p>
              )}
              {simuladores.map((sim) => {
                const activo = simuladoresIds.includes(sim.id);
                return (
                  <label
                    key={sim.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      activo
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={() => alternarSimulador(sim.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600"
                    />
                    {sim.nombre}
                    <span className="text-slate-400">·</span>
                    <span
                      className={
                        sim.estado === 'en_operacion'
                          ? 'text-amber-700'
                          : sim.estado === 'mantenimiento'
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                      }
                    >
                      {sim.estado === 'en_operacion'
                        ? 'En uso'
                        : sim.estado === 'mantenimiento'
                          ? 'Mantenimiento'
                          : 'Libre'}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className={PANEL_CLASS}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                3. Lista de participantes ({participantes.length})
              </h3>
              <button
                type="button"
                onClick={agregarParticipante}
                className={BTN_SECUNDARIO}
              >
                <Plus size={13} strokeWidth={2.25} />
                Agregar persona
              </button>
            </div>

            <div className="overflow-x-auto bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-3 py-2.5">Apellido y Nombre *</th>
                    <th className="px-3 py-2.5">DNI</th>
                    <th className="px-3 py-2.5">Género</th>
                    <th className="px-3 py-2.5">Puesto / Ocupación</th>
                    <th aria-label="Acciones" className="w-12 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {participantes.map((fila) => (
                    <tr key={fila.clave} className="hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-3 py-2">
                        <input
                          type="text"
                          value={fila.apellido_nombre}
                          onChange={(e) =>
                            actualizarParticipante(fila.clave, {
                              apellido_nombre: e.target.value,
                            })
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
                          onChange={(e) =>
                            actualizarParticipante(fila.clave, { dni: e.target.value })
                          }
                          placeholder="Opcional"
                          className={INPUT_CLASS}
                        />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
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
                      <td className="border-b border-slate-100 px-3 py-2">
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
                      <td className="border-b border-slate-100 px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => eliminarParticipante(fila.clave)}
                          aria-label="Eliminar participante"
                          title="Eliminar participante"
                          disabled={participantes.length === 1}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
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
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <p className="text-xs font-medium text-slate-600">
            {participantes.filter((p) => p.apellido_nombre.trim().length > 0).length}{' '}
            personas · {simuladoresIds.length} simuladores
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={pendiente}
              className={BTN_SECUNDARIO}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pendiente}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendiente ? 'Guardando…' : 'Registrar actividad'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
