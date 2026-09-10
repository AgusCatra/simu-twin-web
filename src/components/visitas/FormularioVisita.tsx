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

const PANEL_CLASS =
  'rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950';
const NOTICE_CLASS =
  'rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900';
const LABEL_CLASS = 'mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300';
const INPUT_CLASS =
  'w-full rounded-sm border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100';
const INPUT_MONO_CLASS = INPUT_CLASS + ' font-mono';
const PRIMARY_BTN_CLASS =
  'rounded-sm bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white';
const SECONDARY_BTN_CLASS =
  'rounded-sm border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-100 dark:hover:text-zinc-100';
const ALERT_CLASS =
  'rounded-sm border border-red-600 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:bg-red-950 dark:text-red-200';
const CHECKBOX_CLASS =
  'mt-0.5 h-4 w-4 shrink-0 rounded-sm border-zinc-300 text-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-600';

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

    if (form.asistentes.filter((a) => a.apellido_nombre.trim().length > 0).length === 0) {
      setError(
        'Debe cargar la nómina de alumnos y acompañantes para confirmar la reserva.'
      );
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
        <div role="status" className={'overflow-hidden ' + PANEL_CLASS}>
          <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-sm bg-zinc-900 text-lg leading-none text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                &#10003;
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Reserva confirmada
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Guarde este comprobante como constancia de su solicitud.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Código de reserva
            </p>
            <div className="mt-2 inline-block rounded-md bg-zinc-900 px-5 py-3 dark:bg-zinc-100">
              <span className="font-mono text-4xl font-bold tracking-widest text-white dark:text-zinc-900">
                {exito.codigo_reserva}
              </span>
            </div>

            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-zinc-500 dark:text-zinc-400">Fecha</dt>
                <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                  {formatearFecha(exito.fecha_visita)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500 dark:text-zinc-400">Curso</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">
                  {exito.anio} — División {exito.division}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500 dark:text-zinc-400">Alumnos</dt>
                <dd className="font-mono text-zinc-900 dark:text-zinc-100">{exito.cant_alumnos}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500 dark:text-zinc-400">Transporte TUP</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">
                  {exito.requiere_tup ? 'Solicitado' : 'No requerido'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500 dark:text-zinc-400">Estado visita</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{exito.estado_visita}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500 dark:text-zinc-400">Póliza</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{exito.estado_poliza}</dd>
              </div>
            </dl>

            <div className={'mt-6 ' + NOTICE_CLASS}>
              <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Pautas importantes para la visita
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                <li>
                  <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                    Calzado cerrado obligatorio
                  </strong>{' '}
                  en el predio industrial (sin ojotas ni crocs).
                </li>
                <li>
                  Mate y celular permitidos para chicos y docentes, manteniendo los{' '}
                  <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                    líquidos alejados de consolas y cabinas
                  </strong>
                  .
                </li>
                <li>
                  El equipo municipal se contactará al WhatsApp del docente ({exito.cel_docente}){' '}
                  <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                    7 días antes
                  </strong>{' '}
                  de la visita para coordinar la nómina final y la logística.
                </li>
                <li>
                  Ante reprogramaciones o consultas: teléfono de contacto{' '}
                  <strong className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {WHATSAPP}
                  </strong>
                  .
                </li>
              </ul>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => window.print()} className={PRIMARY_BTN_CLASS}>
                Imprimir / Descargar comprobante
              </button>
              <button type="button" onClick={reiniciar} className={SECONDARY_BTN_CLASS}>
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
      <header className={PANEL_CLASS + ' p-6'}>
        <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
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
          <p>Los cupos son limitados, se asignan por curso/división según orden de inscripción.</p>
          <p>
            Completá los datos a continuación para reservar la participación de tu institución.
          </p>
        </div>

        <div className={'mt-4 ' + NOTICE_CLASS}>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Antes de completar el formulario
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            <li>
              Se pueden anotar varias divisiones en el mismo formulario (ej: 5to 1ra y 2da), siempre
              que la suma de alumnos no supere los{' '}
              <strong className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">40</strong>{' '}
              en total.
            </li>
            <li>
              Cupo máximo estricto:{' '}
              <strong className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                40 alumnos
              </strong>{' '}
              por jornada (los docentes acompañantes no cuentan en este cupo).
            </li>
            <li>
              ¿Dudas con la fecha o el cupo? Escribinos por WhatsApp antes de enviar:{' '}
              <strong className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {WHATSAPP}
              </strong>
              .
            </li>
          </ul>
        </div>
      </header>

      <form onSubmit={handleSubmit} className={PANEL_CLASS + ' p-6'}>
        {error && (
          <div role="alert" className={'mb-5 ' + ALERT_CLASS}>
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
                  onChange={(event) => actualizar('otra_institucion_nombre', event.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            )}

            {cargando && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Obteniendo instituciones y fechas habilitadas…
              </p>
            )}
            {errorCarga && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs text-red-600 dark:text-red-400">{errorCarga}</p>
                <button
                  type="button"
                  onClick={() => void cargarDatos()}
                  className="text-xs font-medium text-zinc-900 underline hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
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
                      'flex-1 rounded-sm border px-4 py-2 text-sm font-medium transition ' +
                      (activo
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-100')
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
                INPUT_MONO_CLASS +
                (cupoExcedido ? ' border-red-600 focus:border-red-600 focus:ring-red-600' : '')
              }
            />
          </div>

          <div className="sm:col-span-2">
            {cupoExcedido && (
              <div role="alert" className={ALERT_CLASS}>
                El cupo máximo por turno es de {CUPO_MAXIMO} alumnos. Por favor reducí la cantidad o
                dividí el curso en dos fechas. Consultas al {WHATSAPP}.
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="nombre_director"
              className="mb-1 block text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
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

        <div className={'mt-6 space-y-3 ' + NOTICE_CLASS}>
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Conformidad legal (obligatoria)
          </h3>
          <label className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={form.acepta_imagenes}
              onChange={(event) => actualizar('acepta_imagenes', event.target.checked)}
              className={CHECKBOX_CLASS}
            />
            <span>
              Acepto el uso de imágenes y videos institucionales con fines educativos
              (Recomendaciones UNICEF / Art. 53 CCyC / Ley 11.723).
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={form.acepta_medidas_judiciales}
              onChange={(event) => actualizar('acepta_medidas_judiciales', event.target.checked)}
              className={CHECKBOX_CLASS}
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
            className={
              PRIMARY_BTN_CLASS + ' w-full px-6 py-3 font-semibold sm:w-auto'
            }
          >
            {enviando ? 'Verificando disponibilidad y agendando…' : 'Confirmar reserva'}
          </button>
          {enviando && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">No cierre esta ventana.</span>
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
