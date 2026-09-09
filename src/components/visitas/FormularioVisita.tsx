'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { crearSolicitudVisita, obtenerEscuelas } from '@/services/visitasService';
import type {
  Escuela,
  SolicitudVisitaInput,
  TurnoVisita,
  VisitaEducativa,
} from '@/types/visitas';

interface FormState {
  id_escuela: string;
  fecha_visita: string;
  turno: TurnoVisita | null;
  division: string;
  cant_alumnos: string;
  nombre_director: string;
  cel_director: string;
  nombre_docente: string;
  cel_docente: string;
  drive_nomina_url: string;
}

const TURNOS: readonly TurnoVisita[] = ['Mañana', 'Tarde'];

const FORM_INICIAL: FormState = {
  id_escuela: '',
  fecha_visita: '',
  turno: null,
  division: '',
  cant_alumnos: '',
  nombre_director: '',
  cel_director: '',
  nombre_docente: '',
  cel_docente: '',
  drive_nomina_url: '',
};

const LABEL_CLASS = 'mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300';
const INPUT_CLASS =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

export default function FormularioVisita() {
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<VisitaEducativa | null>(null);

  const cargarEscuelas = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const lista = await obtenerEscuelas();
      setEscuelas(lista);
    } catch (err) {
      setErrorCarga(
        err instanceof Error ? err.message : 'No se pudo cargar el listado de escuelas.'
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarEscuelas();
  }, [cargarEscuelas]);

  function actualizar<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function reiniciar() {
    setForm(FORM_INICIAL);
    setExito(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const turno = form.turno;
    if (!turno) {
      setError('Debe seleccionar un turno (Mañana o Tarde).');
      return;
    }

    setEnviando(true);
    setError(null);
    setExito(null);

    try {
      const payload: SolicitudVisitaInput = {
        id_escuela: form.id_escuela,
        fecha_visita: form.fecha_visita,
        turno,
        division: form.division,
        cant_alumnos: Number(form.cant_alumnos),
        nombre_director: form.nombre_director,
        cel_director: form.cel_director,
        nombre_docente: form.nombre_docente,
        cel_docente: form.cel_docente,
      };

      const nomina = form.drive_nomina_url.trim();
      if (nomina) {
        payload.drive_nomina_url = nomina;
      }

      const registro = await crearSolicitudVisita(payload);
      setExito(registro);
      setForm(FORM_INICIAL);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Ocurrió un error inesperado. Intente nuevamente.'
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="w-full">
      {exito && (
        <div
          role="status"
          className="mb-6 rounded-xl border border-green-300 bg-green-50 p-5 dark:border-green-800 dark:bg-green-950"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-2xl leading-none text-green-600">
              &#10003;
            </span>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-green-900 dark:text-green-100">
                ¡Visita confirmada!
              </h2>
              <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                La reserva quedó registrada con estado{' '}
                <strong className="font-semibold">{exito.estado_visita}</strong> para el turno{' '}
                {exito.turno} del {exito.fecha_visita}.
              </p>
              <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                Póliza de seguro: <strong className="font-semibold">{exito.estado_poliza}</strong>.
                Se gestionará a la brevedad.
              </p>
              <button
                type="button"
                onClick={reiniciar}
                className="mt-4 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800"
              >
                Registrar otra visita
              </button>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="escuela" className={LABEL_CLASS}>
              Escuela
            </label>
            <select
              id="escuela"
              required
              value={form.id_escuela}
              onChange={(event) => actualizar('id_escuela', event.target.value)}
              disabled={cargando || errorCarga !== null}
              className={INPUT_CLASS}
            >
              <option value="" disabled>
                {cargando ? 'Cargando escuelas…' : 'Seleccione una institución'}
              </option>
              {escuelas.map((escuela) => (
                <option key={escuela.id} value={escuela.id}>
                  {escuela.nombre_institucion}
                </option>
              ))}
            </select>
            {cargando && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Obteniendo el listado de instituciones…
              </p>
            )}
            {errorCarga && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs text-red-600 dark:text-red-400">{errorCarga}</p>
                <button
                  type="button"
                  onClick={() => void cargarEscuelas()}
                  className="text-xs font-medium text-blue-700 underline hover:text-blue-800 dark:text-blue-400"
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="fecha_visita" className={LABEL_CLASS}>
              Fecha de visita
            </label>
            <input
              id="fecha_visita"
              type="date"
              required
              value={form.fecha_visita}
              onChange={(event) => actualizar('fecha_visita', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <span className={LABEL_CLASS}>Turno</span>
            <div className="flex gap-3">
              {TURNOS.map((turno) => {
                const activo = form.turno === turno;
                return (
                  <button
                    key={turno}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => actualizar('turno', turno)}
                    className={
                      'flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ' +
                      (activo
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-neutral-300 bg-white text-neutral-700 hover:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300')
                    }
                  >
                    {turno}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="division" className={LABEL_CLASS}>
              División / Año
            </label>
            <input
              id="division"
              type="text"
              required
              placeholder="Ej: 5to 2da"
              value={form.division}
              onChange={(event) => actualizar('division', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="cant_alumnos" className={LABEL_CLASS}>
              Cantidad estimada de alumnos
            </label>
            <input
              id="cant_alumnos"
              type="number"
              min={1}
              max={45}
              required
              value={form.cant_alumnos}
              onChange={(event) => actualizar('cant_alumnos', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="nombre_director" className={LABEL_CLASS}>
              Nombre del Director/a
            </label>
            <input
              id="nombre_director"
              type="text"
              required
              value={form.nombre_director}
              onChange={(event) => actualizar('nombre_director', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="cel_director" className={LABEL_CLASS}>
              Celular del Director/a
            </label>
            <input
              id="cel_director"
              type="tel"
              required
              value={form.cel_director}
              onChange={(event) => actualizar('cel_director', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="nombre_docente" className={LABEL_CLASS}>
              Nombre del Docente a cargo
            </label>
            <input
              id="nombre_docente"
              type="text"
              required
              value={form.nombre_docente}
              onChange={(event) => actualizar('nombre_docente', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="cel_docente" className={LABEL_CLASS}>
              Celular del Docente a cargo
            </label>
            <input
              id="cel_docente"
              type="tel"
              required
              value={form.cel_docente}
              onChange={(event) => actualizar('cel_docente', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="drive_nomina_url" className={LABEL_CLASS}>
              Enlace a Nómina en Google Drive{' '}
              <span className="font-normal text-neutral-400">(opcional)</span>
            </label>
            <input
              id="drive_nomina_url"
              type="url"
              placeholder="https://drive.google.com/..."
              value={form.drive_nomina_url}
              onChange={(event) => actualizar('drive_nomina_url', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={enviando || cargando}
            className="w-full rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {enviando ? 'Verificando disponibilidad y agendando…' : 'Confirmar reserva'}
          </button>
          {enviando && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              No cierre esta ventana.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
