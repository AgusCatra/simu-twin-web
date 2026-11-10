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
    ledActivo: 'bg-zinc-900',
    ledInactivo: 'bg-zinc-600',
    textoActivo: 'text-zinc-950',
    fondoActivo: 'bg-zinc-200',
    bordeActivo: 'border-zinc-200',
  },
  {
    valor: 'en_camino',
    etiqueta: 'EN CAMINO',
    ledActivo: 'bg-amber-950 animate-pulse',
    ledInactivo: 'bg-zinc-600',
    textoActivo: 'text-amber-950',
    fondoActivo: 'bg-amber-400',
    bordeActivo: 'border-amber-400',
  },
  {
    valor: 'en_destino',
    etiqueta: 'EN DESTINO',
    ledActivo: 'bg-sky-950',
    ledInactivo: 'bg-zinc-600',
    textoActivo: 'text-sky-950',
    fondoActivo: 'bg-sky-400',
    bordeActivo: 'border-sky-400',
  },
  {
    valor: 'finalizado',
    etiqueta: 'FINALIZADO',
    ledActivo: 'bg-emerald-950',
    ledInactivo: 'bg-zinc-600',
    textoActivo: 'text-emerald-950',
    fondoActivo: 'bg-emerald-400',
    bordeActivo: 'border-emerald-400',
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
      ? 'bg-amber-400 animate-pulse'
      : estadoOptimista === 'en_destino'
        ? 'bg-sky-400'
        : estadoOptimista === 'finalizado'
          ? 'bg-emerald-400'
          : 'bg-zinc-500';

  const choferSucio =
    (choferInput.trim() || null) !== (choferPersistido ?? null);

  return (
    <article
      className={`mb-3.5 rounded-sm border bg-zinc-950 p-4 transition-colors ${
        esHoy
          ? 'border-amber-500/75 border-l-4 border-l-amber-400'
          : 'border-zinc-800'
      } ${enTransicionEstado ? 'opacity-90' : ''}`}
    >
      {/* ── Header: código + fecha + destaque HOY + LED de estado ── */}
      <header className="mb-3 flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {esHoy && (
              <span className="rounded-sm bg-amber-400 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] text-zinc-950">
                HOY
              </span>
            )}
            <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-zinc-100">
              {traslado.codigo_reserva || 'S/C'}
            </span>
            <span className="font-mono text-[11px] tracking-[0.1em] text-zinc-400">
              {formatearFechaCorta(traslado.fecha_visita)}
              {traslado.turno ? ` · ${traslado.turno.toUpperCase()}` : ''}
            </span>
            <span className="rounded-sm border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-400">
              {traslado.estado_visita}
            </span>
          </div>

          <p className="mt-2 truncate text-[15px] font-bold leading-tight text-zinc-50">
            {traslado.institucion_nombre || 'Institución sin registrar'}
          </p>

          <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-[11px] tracking-[0.04em] text-zinc-400">
            <MapPin size={12} className="shrink-0 text-zinc-500" aria-hidden />
            <span className="truncate">
              {traslado.institucion_direccion || 'Dirección a confirmar'}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full ${ledEstado}`}
            title={`Estado: ${estadoOptimista}`}
          />
          <span className="font-mono text-[9px] tracking-[0.14em] text-zinc-400">
            {estadoOptimista.replace('_', ' ').toUpperCase()}
          </span>
        </div>
      </header>

      {/* ── Métricas: pasajeros + horarios ─────────────────────── */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-[11px] tracking-[0.1em] text-zinc-200">
          <Truck size={13} strokeWidth={2} className="shrink-0 text-zinc-400" />
          <span>[ {traslado.cant_alumnos} PASAJ. + DOC ]</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1.5">
            <p className="font-mono text-[9px] tracking-[0.16em] text-zinc-500">IDA</p>
            <p className="font-mono text-[13px] font-semibold tracking-[0.06em] text-zinc-100">
              {formatearHora(traslado.tup_horario_ida_desde)}
              <span className="mx-1 text-zinc-600">→</span>
              {formatearHora(traslado.tup_horario_ida_hasta)}
            </p>
          </div>
          <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1.5">
            <p className="font-mono text-[9px] tracking-[0.16em] text-zinc-500">VUELTA</p>
            <p className="font-mono text-[13px] font-semibold tracking-[0.06em] text-zinc-100">
              {formatearHora(traslado.tup_horario_vuelta_desde)}
              <span className="mx-1 text-zinc-600">→</span>
              {formatearHora(traslado.tup_horario_vuelta_hasta)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Edición rápida de chofer asignado ──────────────────── */}
      <form onSubmit={guardarChofer} className="mb-3 space-y-1.5">
        <label
          htmlFor={`chofer-${traslado.id}`}
          className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400"
        >
          <span className="inline-flex items-center gap-1.5">
            <UserCheck size={12} className="text-zinc-500" aria-hidden />
            CHOFER ASIGNADO
          </span>
          {feedbackChofer && !choferSucio && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Check size={11} />
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
            className="h-11 min-w-0 flex-1 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={enTransicionChofer || !choferSucio}
            className="h-11 shrink-0 rounded-sm border border-zinc-700 bg-zinc-900 px-3 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enTransicionChofer ? 'GUARDANDO…' : 'GUARDAR'}
          </button>
        </div>
      </form>

      {/* ── Botones de contacto directo (área táctil ≥ 44px) ───── */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        {telefonoPrincipal ? (
          <a
            href={`tel:+${telefonoPrincipal}`}
            className="flex h-12 items-center justify-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-zinc-100 transition-colors active:bg-zinc-800 hover:border-zinc-500"
          >
            <Phone size={14} strokeWidth={2} />
            {etiquetaTelefonoPrincipal}
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-12 items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 font-mono text-[11px] tracking-[0.12em] text-zinc-600"
          >
            <Phone size={14} strokeWidth={2} />
            SIN TEL.
          </button>
        )}

        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensajeWhatsapp)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-sm border border-emerald-800 bg-emerald-950 px-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-emerald-200 transition-colors active:bg-emerald-900 hover:border-emerald-600"
          >
            <MessageCircle size={14} strokeWidth={2} />
            WHATSAPP
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-12 items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 font-mono text-[11px] tracking-[0.12em] text-zinc-600"
          >
            <MessageCircle size={14} strokeWidth={2} />
            SIN WHATSAPP
          </button>
        )}
      </div>

      {telefonoEscuela && telefonoEscuela !== telefonoDocente && (
        <a
          href={`tel:+${telefonoEscuela}`}
          className="mb-3 flex h-10 items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/70 font-mono text-[10.5px] tracking-[0.1em] text-zinc-300 hover:border-zinc-600 hover:text-white"
        >
          <Phone size={12} strokeWidth={2} />
          TEL. ESCUELA: {traslado.institucion_telefono}
        </a>
      )}

      {/* ── Selector segmentado de estado (touch, 48px, 4 estados) ─ */}
      <div
        role="group"
        aria-label="Estado del traslado"
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
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
              className={`flex h-12 items-center justify-center gap-1.5 rounded-sm border font-mono text-[10.5px] font-semibold tracking-[0.08em] transition-colors disabled:cursor-not-allowed ${
                activo
                  ? `${opcion.fondoActivo} ${opcion.textoActivo} ${opcion.bordeActivo}`
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100'
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  activo ? opcion.ledActivo : opcion.ledInactivo
                }`}
              />
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>

      {enTransicionEstado && (
        <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-zinc-400">
          ▸ SINCRONIZANDO ESTADO…
        </p>
      )}

      {errorAccion && (
        <p
          role="alert"
          className="mt-2 flex items-center gap-1.5 rounded-sm border border-rose-900 bg-rose-950/50 px-2.5 py-1.5 font-mono text-[11px] text-rose-200"
        >
          <AlertCircle size={13} className="shrink-0 text-rose-400" />
          {errorAccion}
        </p>
      )}
    </article>
  );
}
