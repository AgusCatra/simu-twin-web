'use client';

import { useOptimistic, useState, useTransition, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  MapPin,
  MessageCircle,
  Phone,
  Truck,
  UserCheck,
} from 'lucide-react';
import { actualizarEstadoTrasladoAction } from '@/app/admin/tup/actions';
import type { EstadoTrasladoTup, TrasladoTupItem } from '@/types/tup';

/**
 * Tarjeta de traslado TUP optimizada para pantalla táctil móvil (360–430 px).
 *
 * Estética: terminal de despacho de flota — bordes duros, tipografía mono
 * uppercase con tracking, LEDs de estado y botones táctiles grandes (`h-12`).
 */

const OPCIONES_ESTADO: readonly {
  valor: EstadoTrasladoTup;
  etiqueta: string;
  ledActivo: string;
  ledInactivo: string;
  textoActivo: string;
  fondoActivo: string;
  bordeActivo: string;
}[] = [
  {
    valor: 'pendiente',
    etiqueta: 'PENDIENTE',
    ledActivo: 'bg-slate-600',
    ledInactivo: 'bg-slate-400',
    textoActivo: 'text-slate-900',
    fondoActivo: 'bg-slate-200',
    bordeActivo: 'border-slate-300',
  },
  {
    valor: 'en_camino',
    etiqueta: 'EN CAMINO',
    ledActivo: 'bg-amber-600 animate-pulse',
    ledInactivo: 'bg-slate-400',
    textoActivo: 'text-amber-900',
    fondoActivo: 'bg-amber-100',
    bordeActivo: 'border-amber-300',
  },
  {
    valor: 'en_destino',
    etiqueta: 'EN DESTINO',
    ledActivo: 'bg-blue-600',
    ledInactivo: 'bg-slate-400',
    textoActivo: 'text-blue-900',
    fondoActivo: 'bg-blue-100',
    bordeActivo: 'border-blue-300',
  },
  {
    valor: 'finalizado',
    etiqueta: 'FINALIZADO',
    ledActivo: 'bg-emerald-600',
    ledInactivo: 'bg-slate-400',
    textoActivo: 'text-emerald-900',
    fondoActivo: 'bg-emerald-100',
    bordeActivo: 'border-emerald-300',
  },
];

function normalizarDigitos(raw: string): string {
  return raw.replace(/\D/g, '');
}

function normalizarTelefono(raw?: string | null): string | null {
  if (!raw) return null;
  let digitos = normalizarDigitos(raw);
  if (digitos.length < 7) return null;

  if (!digitos.startsWith('54')) {
    if (digitos.startsWith('0')) digitos = digitos.slice(1);
    digitos = `54${digitos}`;
  }
  return digitos;
}

function normalizarWhatsApp(raw?: string | null): string | null {
  if (!raw) return null;
  let digitos = normalizarDigitos(raw);
  if (digitos.length < 8) return null;

  if (digitos.startsWith('549')) digitos = digitos.slice(3);
  else if (digitos.startsWith('54')) digitos = digitos.slice(2);

  if (digitos.startsWith('0')) digitos = digitos.slice(1);

  const conPrefijo15 = digitos.match(/^(\d{2,4})15(\d{6,8})$/);
  if (conPrefijo15) {
    digitos = `${conPrefijo15[1]}${conPrefijo15[2]}`;
  } else if (digitos.startsWith('15')) {
    digitos = digitos.slice(2);
  }

  return `549${digitos}`;
}

function formatearFechaCorta(iso: string): string {
  if (!iso) return '—';
  const [anio, mes, dia] = iso.split('-');
  if (!anio || !mes || !dia) return iso;
  return `${dia}/${mes}`;
}

function formatearHora(valor: string | null): string {
  if (!valor) return '--:--';
  return valor.slice(0, 5);
}

interface Props {
  traslado: TrasladoTupItem;
  esHoy?: boolean;
}

export default function CardTrasladoTup({ traslado, esHoy = false }: Props) {
  const [estadoOptimista, setEstadoOptimista] = useOptimistic<EstadoTrasladoTup>(
    traslado.tup_estado_traslado
  );
  const [enTransicionEstado, iniciarTransicionEstado] = useTransition();

  const [choferInput, setChoferInput] = useState<string>(
    traslado.tup_chofer_nombre ?? ''
  );
  const [choferPersistido, setChoferPersistido] = useState<string | null>(
    traslado.tup_chofer_nombre
  );
  const [enTransicionChofer, iniciarTransicionChofer] = useTransition();
  const [feedbackChofer, setFeedbackChofer] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const telefonoDocente = normalizarTelefono(traslado.cel_docente);
  const telefonoEscuela = normalizarTelefono(traslado.institucion_telefono);
  const telefonoPrincipal = telefonoDocente ?? telefonoEscuela;
  const etiquetaTelefonoPrincipal = telefonoDocente ? 'LLAMAR DOC.' : 'LLAMAR ESC.';

  const whatsapp = normalizarWhatsApp(traslado.cel_docente);
  const mensajeWhatsapp = `Hola ${
    traslado.nombre_docente?.trim() ? traslado.nombre_docente.trim() : ''
  }, le escribo desde el Centro de Simuladores (TUP) por la visita ${
    traslado.codigo_reserva
  } del ${formatearFechaCorta(traslado.fecha_visita)}.`.replace(/\s+/g, ' ');

  function cambiarEstado(nuevo: EstadoTrasladoTup) {
    if (nuevo === estadoOptimista || enTransicionEstado) return;
    setErrorAccion(null);

    iniciarTransicionEstado(async () => {
      setEstadoOptimista(nuevo);
      const resultado = await actualizarEstadoTrasladoAction({
        visita_id: traslado.id,
        tup_estado_traslado: nuevo,
      });
      if (!resultado.ok) {
        setErrorAccion(resultado.error);
      }
    });
  }

  function guardarChofer(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enTransicionChofer) return;

    const limpio = choferInput.trim();
    const valorNormalizado = limpio.length > 0 ? limpio : null;
    if (valorNormalizado === (choferPersistido ?? null)) return;

    setErrorAccion(null);
    setFeedbackChofer(null);

    iniciarTransicionChofer(async () => {
      const resultado = await actualizarEstadoTrasladoAction({
        visita_id: traslado.id,
        tup_chofer_nombre: valorNormalizado,
      });
      if (!resultado.ok) {
        setErrorAccion(resultado.error);
        return;
      }
      setChoferPersistido(valorNormalizado);
      setChoferInput(valorNormalizado ?? '');
      setFeedbackChofer(valorNormalizado ? 'Chofer guardado' : 'Chofer liberado');
    });
  }

  const ledEstado =
    estadoOptimista === 'en_camino'
      ? 'bg-amber-500 animate-pulse'
      : estadoOptimista === 'en_destino'
        ? 'bg-blue-500'
        : estadoOptimista === 'finalizado'
          ? 'bg-emerald-500'
          : 'bg-slate-400';

  const choferSucio =
    (choferInput.trim() || null) !== (choferPersistido ?? null);

  return (
    <article
      className={`mb-4 rounded-xl border bg-white p-5 shadow-sm transition-colors ${
        esHoy
          ? 'border-amber-300 border-l-4 border-l-amber-500'
          : 'border-slate-200'
      } ${enTransicionEstado ? 'opacity-90' : ''}`}
    >
      <header className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {esHoy && (
              <span className="rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-bold text-amber-900">
                HOY
              </span>
            )}
            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
              {traslado.codigo_reserva || 'S/C'}
            </span>
            <span className="text-xs font-medium text-slate-600">
              {formatearFechaCorta(traslado.fecha_visita)}
              {traslado.turno ? ` · ${traslado.turno}` : ''}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
              {traslado.estado_visita}
            </span>
          </div>

          <p className="mt-2 truncate text-base font-bold leading-tight text-slate-900">
            {traslado.institucion_nombre || 'Institución sin registrar'}
          </p>

          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-600">
            <MapPin size={14} className="shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">
              {traslado.institucion_direccion || 'Dirección a confirmar'}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            aria-hidden
            className={`h-3 w-3 rounded-full ${ledEstado}`}
            title={`Estado: ${estadoOptimista}`}
          />
          <span className="text-xs font-semibold text-slate-600 capitalize">
            {estadoOptimista.replace('_', ' ')}
          </span>
        </div>
      </header>

      <div className="mb-3.5 grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800">
          <Truck size={15} strokeWidth={2} className="shrink-0 text-blue-600" />
          <span>{traslado.cant_alumnos} alumnos + docente</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">Ida</p>
            <p className="text-sm font-bold text-slate-900 tabular-nums">
              {formatearHora(traslado.tup_horario_ida_desde)} →{' '}
              {formatearHora(traslado.tup_horario_ida_hasta)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">Vuelta</p>
            <p className="text-sm font-bold text-slate-900 tabular-nums">
              {formatearHora(traslado.tup_horario_vuelta_desde)} →{' '}
              {formatearHora(traslado.tup_horario_vuelta_hasta)}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={guardarChofer} className="mb-3.5 space-y-1.5">
        <label
          htmlFor={`chofer-${traslado.id}`}
          className="flex items-center justify-between text-xs font-semibold text-slate-700"
        >
          <span className="inline-flex items-center gap-1.5">
            <UserCheck size={14} className="text-slate-500" aria-hidden />
            Chofer asignado
          </span>
          {feedbackChofer && !choferSucio && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Check size={13} />
              {feedbackChofer}
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`chofer-${traslado.id}`}
            type="text"
            maxLength={120}
            value={choferInput}
            onChange={(e) => {
              setChoferInput(e.target.value);
              if (feedbackChofer) setFeedbackChofer(null);
            }}
            placeholder="Ingresá tu nombre o asigná chofer"
            disabled={enTransicionChofer}
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={enTransicionChofer || !choferSucio}
            className="h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enTransicionChofer ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>

      <div className="mb-3.5 grid grid-cols-2 gap-2">
        {telefonoPrincipal ? (
          <a
            href={`tel:+${telefonoPrincipal}`}
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100"
          >
            <Phone size={15} strokeWidth={2} className="text-blue-600" />
            {etiquetaTelefonoPrincipal}
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-400"
          >
            <Phone size={15} strokeWidth={2} />
            Sin teléfono
          </button>
        )}

        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensajeWhatsapp)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <MessageCircle size={15} strokeWidth={2} />
            WhatsApp
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-400"
          >
            <MessageCircle size={15} strokeWidth={2} />
            Sin WhatsApp
          </button>
        )}
      </div>

      {telefonoEscuela && telefonoEscuela !== telefonoDocente && (
        <a
          href={`tel:+${telefonoEscuela}`}
          className="mb-3.5 flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          <Phone size={13} strokeWidth={2} />
          Tel. Escuela: {traslado.institucion_telefono}
        </a>
      )}

      <div
        role="group"
        aria-label="Estado del traslado"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {OPCIONES_ESTADO.map((opcion) => {
          const activo = estadoOptimista === opcion.valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              onClick={() => cambiarEstado(opcion.valor)}
              disabled={enTransicionEstado || activo}
              aria-pressed={activo}
              className={`flex h-12 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                activo
                  ? `${opcion.fondoActivo} ${opcion.textoActivo} ${opcion.bordeActivo}`
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${
                  activo ? opcion.ledActivo : opcion.ledInactivo
                }`}
              />
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>

      {enTransicionEstado && (
        <p className="mt-2 text-xs font-medium text-slate-500">
          Guardando cambio…
        </p>
      )}

      {errorAccion && (
        <p
          role="alert"
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
        >
          <AlertCircle size={14} className="shrink-0 text-rose-600" />
          {errorAccion}
        </p>
      )}
    </article>
  );
}
