'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  crearSolicitudVisita,
  obtenerEscuelas,
  obtenerFechasHabilitadas,
} from '@/services/visitasService';
import GridNomina from '@/components/visitas/GridNomina';
import type {
  AnioEscolar,
  AsistenteInput,
  Escuela,
  FechaHabilitada,
  SolicitudVisitaInput,
  VisitaEducativa,
} from '@/types/visitas';

interface FormState {
  id_escuela: string;
  usarOtraInstitucion: boolean;
  otra_institucion_nombre: string;
  fecha_visita: string;
  anio: AnioEscolar | null;
  division: string;
  cant_alumnos: string;
  nombre_director: string;
  cel_director: string;
  nombre_docente: string;
  cel_docente: string;
  email_contacto: string;
  acepta_imagenes: boolean;
  acepta_medidas_judiciales: boolean;
  asistentes: AsistenteInput[];
}

const ANIOS: readonly AnioEscolar[] = ['5°', '6°'];
const CUPO_MAXIMO = 40;
const WHATSAPP = '3462-537643';
const OPCION_OTRA = '__otra__';

const FORM_INICIAL: FormState = {
  id_escuela: '',
  usarOtraInstitucion: false,
  otra_institucion_nombre: '',
  fecha_visita: '',
  anio: null,
  division: '',
  cant_alumnos: '',
  nombre_director: '',
  cel_director: '',
  nombre_docente: '',
  cel_docente: '',
  email_contacto: '',
  acepta_imagenes: false,
  acepta_medidas_judiciales: false,
  asistentes: [],
};

const LABEL_CLASS = 'mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300';
const INPUT_CLASS =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('T')[0].split('-');
  if (!anio || !mes || !dia) return iso;
  return `${dia}/${mes}/${anio}`;
}

export default function FormularioVisita() {
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [fechas, setFechas] = useState<FechaHabilitada[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<VisitaEducativa | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [listaEscuelas, listaFechas] = await Promise.all([
        obtenerEscuelas(),
        obtenerFechasHabilitadas(),
      ]);
      setEscuelas(listaEscuelas);
      setFechas(listaFechas);
    } catch (err) {
      setErrorCarga(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la información necesaria para la reserva.'
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const cantAlumnosNumero = Number(form.cant_alumnos);
  const cupoExcedido =
    form.cant_alumnos.trim().length > 0 && cantAlumnosNumero > CUPO_MAXIMO;

  const puedeEnviar = useMemo(
    () => !enviando && !cargando && !cupoExcedido,
    [enviando, cargando, cupoExcedido]
  );

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

    if (cupoExcedido) {
      setError(
        `El cupo máximo por turno es de ${CUPO_MAXIMO} alumnos. Por favor reducí la cantidad o dividí el curso en dos fechas. Consultas al ${WHATSAPP}.`
      );
      return;
    }

    const anio = form.anio;
    if (!anio) {
      setError('Debe seleccionar el año escolar (5° o 6°).');
      return;
    }

    if (form.usarOtraInstitucion) {
      if (!form.otra_institucion_nombre.trim()) {
        setError('Debe indicar el nombre de la institución.');
        return;
      }
    } else if (!form.id_escuela) {
      setError('Debe seleccionar una escuela.');
      return;
    }

    if (!form.acepta_imagenes || !form.acepta_medidas_judiciales) {
      setError('Debe aceptar las condiciones legales y de imagen para continuar.');
      return;
    }

    setEnviando(true);
    setError(null);
    setExito(null);

    try {
      const idEscuela = form.usarOtraInstitucion ? null : form.id_escuela;
      const payload: SolicitudVisitaInput = {
        id_escuela: idEscuela,
        otra_institucion_nombre: form.usarOtraInstitucion
          ? form.otra_institucion_nombre.trim()
          : null,
        fecha_visita: form.fecha_visita,
        anio,
        division: form.division,
        cant_alumnos: cantAlumnosNumero,
        requiere_tup: !!idEscuela,
        nombre_director: form.nombre_director,
        cel_director: form.cel_director,
        nombre_docente: form.nombre_docente,
        cel_docente: form.cel_docente,
        email_contacto: form.email_contacto,
        acepta_imagenes: form.acepta_imagenes,
        acepta_medidas_judiciales: form.acepta_medidas_judiciales,
        asistentes: form.asistentes.filter((a) => a.apellido_nombre.trim().length > 0),
      };

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

  if (exito) {
    return (
      <div className="w-full">
        <div
          role="status"
          className="overflow-hidden rounded-2xl border border-green-300 bg-white shadow-sm dark:border-green-800 dark:bg-neutral-900"
        >
          <div className="border-b border-green-200 bg-green-50 px-6 py-5 dark:border-green-900 dark:bg-green-950">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-xl leading-none text-white"
              >
                &#10003;
              </span>
              <div>
                <h2 className="text-lg font-semibold text-green-900 dark:text-green-100">
                  ¡Reserva confirmada!
                </h2>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Guarde este comprobante como constancia de su solicitud.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">Código de reserva</p>
            <div className="mt-2 inline-block rounded-xl bg-green-100 px-5 py-3 dark:bg-green-900">
              <span className="text-4xl font-bold tracking-widest text-green-800 dark:text-green-100">
                {exito.codigo_reserva}
              </span>
            </div>

            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-neutral-500 dark:text-neutral-400">Fecha</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">
                  {formatearFecha(exito.fecha_visita)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500 dark:text-neutral-400">Curso</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">
                  {exito.anio} — División {exito.division}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500 dark:text-neutral-400">Alumnos</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">{exito.cant_alumnos}</dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500 dark:text-neutral-400">
                  Transporte TUP
                </dt>
                <dd className="text-neutral-900 dark:text-neutral-100">
                  {exito.requiere_tup ? 'Solicitado' : 'No requerido'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500 dark:text-neutral-400">Estado visita</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">{exito.estado_visita}</dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500 dark:text-neutral-400">Póliza</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">{exito.estado_poliza}</dd>
              </div>
            </dl>

            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Pautas importantes para la visita
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-100">
                <li>
                  <strong className="font-semibold">Calzado cerrado obligatorio</strong> en el predio
                  industrial (sin ojotas ni crocs).
                </li>
                <li>
                  Mate y celular permitidos para chicos y docentes, manteniendo los{' '}
                  <strong className="font-semibold">líquidos alejados de consolas y cabinas</strong>.
                </li>
                <li>
                  El equipo municipal se contactará al WhatsApp del docente (
                  {exito.cel_docente}) <strong className="font-semibold">7 días antes</strong> de la
                  visita para coordinar la nómina final y la logística.
                </li>
                <li>
                  Ante reprogramaciones o consultas: teléfono de contacto{' '}
                  <strong className="font-semibold">{WHATSAPP}</strong>.
                </li>
              </ul>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800"
              >
                Imprimir / Descargar comprobante
              </button>
              <button
                type="button"
                onClick={reiniciar}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-blue-500 hover:text-blue-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              >
                Registrar otra visita
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <header className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
          <p>
            Invitamos a las escuelas secundarias de Venado Tuerto a participar del Programa de
            Visitas Educativas al Centro de Simuladores, una propuesta del Gobierno local junto a
            COPAIN y CRICEX, coordinada por la Dirección de Empleo.
          </p>
          <p>
            Este programa está destinado a estudiantes de 5° y 6° año de nivel secundario y tiene
            como objetivo acercarlos al mundo del trabajo, brindando experiencias concretas de
            formación a través del uso de simuladores, talleres de orientación vocacional y
            actividades de desarrollo personal y socioemocional.
          </p>
          <div className="space-y-1">
            <p>🕗 Duración de la jornada: 3:30 h</p>
            <p>📍 Lugar: Parque Industrial – Centro de Simuladores</p>
            <p>🚌 Transporte: coordinado por el Gobierno local a través del sistema TUP</p>
            <p>📅 Fechas: viernes de abril a noviembre 2026 a coordinar con el equipo</p>
            <p>📞 Consultas: (03462) 15 537643</p>
          </div>
          <p>
            Los cupos son limitados, se asignan por curso/división según orden de inscripción.
          </p>
          <p>
            Completá los datos a continuación para reservar la participación de tu institución.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
          <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            Antes de completar el formulario
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-900 dark:text-blue-100">
            <li>
              Se pueden anotar varias divisiones en el mismo formulario (ej: 5to 1ra y 2da), siempre
              que la suma de alumnos no supere los <strong className="font-semibold">40</strong> en
              total.
            </li>
            <li>
              Cupo máximo estricto: <strong className="font-semibold">40 alumnos</strong> por jornada
              (los docentes acompañantes no cuentan en este cupo).
            </li>
            <li>
              ¿Dudas con la fecha o el cupo? Escribinos por WhatsApp antes de enviar:{' '}
              <strong className="font-semibold">{WHATSAPP}</strong>.
            </li>
          </ul>
        </div>
      </header>

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
              required={!form.usarOtraInstitucion}
              value={form.usarOtraInstitucion ? OPCION_OTRA : form.id_escuela}
              onChange={(event) => {
                const valor = event.target.value;
                if (valor === OPCION_OTRA) {
                  setForm((prev) => ({
                    ...prev,
                    usarOtraInstitucion: true,
                    id_escuela: '',
                  }));
                } else {
                  setForm((prev) => ({
                    ...prev,
                    usarOtraInstitucion: false,
                    id_escuela: valor,
                    otra_institucion_nombre: '',
                  }));
                }
              }}
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
              <option value={OPCION_OTRA}>
                + Otra institución (Terciario, Educación Especial, Secundaria no listada, etc.)
              </option>
            </select>

            {form.usarOtraInstitucion && (
              <div className="mt-3">
                <label htmlFor="otra_institucion" className={LABEL_CLASS}>
                  Nombre de la institución
                </label>
                <input
                  id="otra_institucion"
                  type="text"
                  required
                  placeholder="Ej: Instituto Superior N° 20"
                  value={form.otra_institucion_nombre}
                  onChange={(event) =>
                    actualizar('otra_institucion_nombre', event.target.value)
                  }
                  className={INPUT_CLASS}
                />
              </div>
            )}

            {cargando && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Obteniendo instituciones y fechas habilitadas…
              </p>
            )}
            {errorCarga && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs text-red-600 dark:text-red-400">{errorCarga}</p>
                <button
                  type="button"
                  onClick={() => void cargarDatos()}
                  className="text-xs font-medium text-blue-700 underline hover:text-blue-800 dark:text-blue-400"
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="fecha_visita" className={LABEL_CLASS}>
              Fecha de visita
            </label>
            <select
              id="fecha_visita"
              required
              value={form.fecha_visita}
              onChange={(event) => actualizar('fecha_visita', event.target.value)}
              disabled={cargando || errorCarga !== null}
              className={INPUT_CLASS}
            >
              <option value="" disabled>
                {cargando
                  ? 'Cargando fechas disponibles…'
                  : fechas.length === 0
                    ? 'No hay fechas habilitadas por el momento'
                    : 'Seleccione una fecha habilitada'}
              </option>
              {fechas.map((fecha) => (
                <option key={fecha.id} value={fecha.fecha}>
                  {formatearFecha(fecha.fecha)}
                  {fecha.observaciones ? ` — ${fecha.observaciones}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className={LABEL_CLASS}>Año escolar</span>
            <div className="flex gap-3">
              {ANIOS.map((anio) => {
                const activo = form.anio === anio;
                return (
                  <button
                    key={anio}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => actualizar('anio', anio)}
                    className={
                      'flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ' +
                      (activo
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-neutral-300 bg-white text-neutral-700 hover:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300')
                    }
                  >
                    {anio}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="division" className={LABEL_CLASS}>
              División
            </label>
            <input
              id="division"
              type="text"
              required
              placeholder="Ej: 5to soc 1 o 5to nat 3"
              value={form.division}
              onChange={(event) => actualizar('division', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="cant_alumnos" className={LABEL_CLASS}>
              Cantidad total de alumnos (máx. {CUPO_MAXIMO})
            </label>
            <input
              id="cant_alumnos"
              type="number"
              min={1}
              max={CUPO_MAXIMO}
              required
              value={form.cant_alumnos}
              onChange={(event) => actualizar('cant_alumnos', event.target.value)}
              className={
                INPUT_CLASS + (cupoExcedido ? ' border-red-500 focus:border-red-500 focus:ring-red-500/40' : '')
              }
            />
          </div>

          <div className="sm:col-span-2">
            {cupoExcedido && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              >
                El cupo máximo por turno es de {CUPO_MAXIMO} alumnos. Por favor reducí la cantidad o
                dividí el curso en dos fechas. Consultas al {WHATSAPP}.
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="nombre_director"
              className="mb-1 block text-base font-semibold text-neutral-800 dark:text-neutral-200"
            >
              Responsables de la institución y curso inscripto
            </label>
            <p className="mb-4 text-sm text-slate-400">
              En esta sección requerimos los datos personales del director/a y del docente a cargo,
              con el objetivo de establecer comunicación directa para coordinar detalles sobre la
              visita educativa.
            </p>
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
              Celular del Docente a cargo (WhatsApp)
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
            <label htmlFor="email_contacto" className={LABEL_CLASS}>
              Email de contacto
            </label>
            <input
              id="email_contacto"
              type="email"
              required
              placeholder="institucion@ejemplo.com"
              value={form.email_contacto}
              onChange={(event) => actualizar('email_contacto', event.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="mt-6">
          <GridNomina
            asistentes={form.asistentes}
            onChange={(asistentes) => actualizar('asistentes', asistentes)}
          />
        </div>

        <div className="mt-6 space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Conformidad legal (obligatoria)
          </h3>
          <label className="flex items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={form.acepta_imagenes}
              onChange={(event) => actualizar('acepta_imagenes', event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-700 focus:ring-blue-500 dark:border-neutral-600"
            />
            <span>
              Acepto el uso de imágenes y videos institucionales con fines educativos
              (Recomendaciones UNICEF / Art. 53 CCyC / Ley 11.723).
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={form.acepta_medidas_judiciales}
              onChange={(event) => actualizar('acepta_medidas_judiciales', event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-700 focus:ring-blue-500 dark:border-neutral-600"
            />
            <span>
              La institución se compromete a informar si algún alumno posee medidas judiciales que
              impidan la difusión de su imagen.
            </span>
          </label>
        </div>

        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={!puedeEnviar}
            className="w-full rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {enviando ? 'Verificando disponibilidad y agendando…' : 'Confirmar reserva'}
          </button>
          {enviando && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              No cierre esta ventana.
            </span>
          )}
          {cupoExcedido && !enviando && (
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              Corregí la cantidad de alumnos para poder enviar.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
