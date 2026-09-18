'use client';

import { useOptimistic, useTransition } from 'react';
import { MessageCircle, Phone, Truck } from 'lucide-react';
import { actualizarEstadoTrasladoAction } from '@/app/admin/tup/actions';
import type { EstadoTrasladoTup, TrasladoTupItem } from '@/types/tup';

/**
 * Tarjeta de traslado TUP optimizada para pantalla táctil (360–430 px).
 *
 * Estética: terminal de despacho de flota — bordes duros, tipografía mono
 * uppercase con tracking, LEDs de estado, sin sombras ni gradientes.
 * Los botones respetan área táctil mínima de 44 px (`h-11`).
 */

type EstadoSelector = Extract<EstadoTrasladoTup, 'pendiente' | 'en_camino' | 'completado'>;

const OPCIONES_ESTADO: readonly {
  valor: EstadoSelector;
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
    ledActivo: 'bg-zinc-300',
    ledInactivo: 'bg-zinc-700',
    textoActivo: 'text-zinc-950',
    fondoActivo: 'bg-zinc-200',
    bordeActivo: 'border-zinc-200',
  },
  {
    valor: 'en_camino',
    etiqueta: 'EN CAMINO',
    ledActivo: 'bg-amber-400 animate-pulse',
    ledInactivo: 'bg-zinc-700',
    textoActivo: 'text-amber-950',
    fondoActivo: 'bg-amber-400',
    bordeActivo: 'border-amber-400',
  },
  {
    valor: 'completado',
    etiqueta: 'COMPLETADO',
    ledActivo: 'bg-emerald-400',
    ledInactivo: 'bg-zinc-700',
    textoActivo: 'text-emerald-950',
    fondoActivo: 'bg-emerald-400',
    bordeActivo: 'border-emerald-400',
  },
];

/**
 * Normaliza un celular argentino al formato internacional para wa.me / tel:.
 * - Quita todo lo que no sea dígito.
 * - Si no arranca con 54, le agrega el prefijo país.
 * - Para WhatsApp convierte el prefijo 54 a 549 (móvil) y elimina el 15.
 */
function normalizarDigitos(raw: string): string {
  return raw.replace(/\D/g, '');
}

function normalizarTelefono(raw?: string | null): string | null {
  if (!raw) return null;
  let digitos = normalizarDigitos(raw);
  if (digitos.length < 8) return null;

  if (!digitos.startsWith('54')) {
    // Número local sin prefijo país: quitamos el 0 de larga distancia si existe.
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

/** Convierte "YYYY-MM-DD" a "DD/MM" para el chip compacto del header. */
function formatearFechaCorta(iso: string): string {
  if (!iso) return '—';
  const [anio, mes, dia] = iso.split('-');
  if (!anio || !mes || !dia) return iso;
  return `${dia}/${mes}`;
}

/** Recorta "HH:MM:SS" a "HH:MM" (PostgREST devuelve TIME con segundos). */
function formatearHora(valor: string | null): string {
  if (!valor) return '--:--';
  return valor.slice(0, 5);
}

interface Props {
  traslado: TrasladoTupItem;
}

export default function CardTrasladoTup({ traslado }: Props) {
  const [estadoOptimista, setEstadoOptimista] = useOptimistic<EstadoTrasladoTup>(
    traslado.tup_estado_traslado
  );
  const [enTransicion, iniciarTransicion] = useTransition();

  const telefono = normalizarTelefono(traslado.cel_docente);
  const whatsapp = normalizarWhatsApp(traslado.cel_docente);
  const mensajeWhatsapp = `Hola ${
    traslado.nombre_docente?.trim() ? traslado.nombre_docente.trim() : ''
  }, le escribo desde el Centro de Simuladores (TUP) por la visita ${
    traslado.codigo_reserva
  } del ${formatearFechaCorta(traslado.fecha_visita)}.`.replace(/\s+/g, ' ');

  function cambiarEstado(nuevo: EstadoSelector) {
    if (nuevo === estadoOptimista || enTransicion) return;

    iniciarTransicion(async () => {
      setEstadoOptimista(nuevo);
      const resultado = await actualizarEstadoTrasladoAction({
        visita_id: traslado.id,
        tup_estado_traslado: nuevo,
      });
      if (!resultado.ok) {
        // La UI optimista se revierte automáticamente al salir de la transición
        // porque el valor base (prop) no cambió. Solo logueamos el motivo.
        console.warn('[CardTrasladoTup] No se pudo actualizar el estado:', resultado.error);
      }
    });
  }

  // LED superior derecho según el estado actual (optimista).
  const ledEstado =
    estadoOptimista === 'en_camino'
      ? 'bg-amber-400 animate-pulse'
      : estadoOptimista === 'completado'
        ? 'bg-emerald-400'
        : estadoOptimista === 'en_destino'
          ? 'bg-sky-400'
          : estadoOptimista === 'cancelado'
            ? 'bg-red-500'
            : 'bg-zinc-600';

  return (
    <article
      className={`mb-3 rounded-sm border bg-zinc-950 p-4 transition-colors ${
        enTransicion ? 'border-zinc-600 opacity-80' : 'border-zinc-800'
      }`}
    >
      {/* ── Header: código + fecha + LED de estado ─────────────── */}
      <header className="mb-3 flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-zinc-100">
              {traslado.codigo_reserva || 'S/C'}
            </span>
            <span className="font-mono text-[11px] tracking-[0.1em] text-zinc-400">
              {formatearFechaCorta(traslado.fecha_visita)}
              {traslado.turno ? ` · ${traslado.turno.toUpperCase()}` : ''}
            </span>
          </div>
          <p className="mt-2 truncate text-[15px] font-bold leading-tight text-zinc-50">
            {traslado.institucion_nombre || 'Institución sin registrar'}
          </p>
          {traslado.institucion_direccion ? (
            <p className="mt-0.5 truncate font-mono text-[10.5px] tracking-[0.06em] text-zinc-500">
              {traslado.institucion_direccion}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full ${ledEstado}`}
            title={`Estado: ${estadoOptimista}`}
          />
          <span className="font-mono text-[9px] tracking-[0.14em] text-zinc-600">
            {estadoOptimista.replace('_', ' ').toUpperCase()}
          </span>
        </div>
      </header>

      {/* ── Métricas: cupo + horarios ──────────────────────────── */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-[11px] tracking-[0.1em] text-zinc-200">
          <Truck size={12} strokeWidth={2} className="shrink-0 text-zinc-500" />
          <span>[ {traslado.cant_alumnos} ALUM + DOC ]</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1.5">
            <p className="font-mono text-[9px] tracking-[0.16em] text-zinc-500">IDA</p>
            <p className="font-mono text-[13px] font-semibold tracking-[0.06em] text-zinc-100">
              {formatearHora(traslado.tup_horario_ida_desde)}
              <span className="mx-1 text-zinc-600">→</span>
              {formatearHora(traslado.tup_horario_ida_hasta)}
            </p>
          </div>
          <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1.5">
            <p className="font-mono text-[9px] tracking-[0.16em] text-zinc-500">VUELTA</p>
            <p className="font-mono text-[13px] font-semibold tracking-[0.06em] text-zinc-100">
              {formatearHora(traslado.tup_horario_vuelta_desde)}
              <span className="mx-1 text-zinc-600">→</span>
              {formatearHora(traslado.tup_horario_vuelta_hasta)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Chofer asignado (si existe) ────────────────────────── */}
      {traslado.tup_chofer_nombre ? (
        <p className="mb-3 font-mono text-[10.5px] tracking-[0.1em] text-zinc-500">
          CHOFER: <span className="text-zinc-300">{traslado.tup_chofer_nombre}</span>
        </p>
      ) : null}

      {/* ── Botones de contacto (área táctil ≥ 44px) ───────────── */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        {telefono ? (
          <a
            href={`tel:+${telefono}`}
            className="flex h-11 items-center justify-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 font-mono text-[11px] font-semibold tracking-[0.14em] text-zinc-100 transition-colors active:bg-zinc-800 hover:border-zinc-500"
          >
            <Phone size={14} strokeWidth={2} />
            LLAMAR
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-11 items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 font-mono text-[11px] tracking-[0.14em] text-zinc-600"
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
            className="flex h-11 items-center justify-center gap-2 rounded-sm border border-emerald-800 bg-emerald-950 font-mono text-[11px] font-semibold tracking-[0.14em] text-emerald-200 transition-colors active:bg-emerald-900 hover:border-emerald-600"
          >
            <MessageCircle size={14} strokeWidth={2} />
            WHATSAPP
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-11 items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 font-mono text-[11px] tracking-[0.14em] text-zinc-600"
          >
            <MessageCircle size={14} strokeWidth={2} />
            SIN WHATSAPP
          </button>
        )}
      </div>

      {/* ── Selector segmentado de estado (touch, 44px) ────────── */}
      <div
        role="group"
        aria-label="Estado del traslado"
        className="grid grid-cols-3 gap-0 overflow-hidden rounded-sm border border-zinc-800"
      >
        {OPCIONES_ESTADO.map((opcion, indice) => {
          const activo = estadoOptimista === opcion.valor;
          const clasesBase =
            'flex h-11 items-center justify-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-[0.1em] transition-colors disabled:cursor-not-allowed';
          const clases = activo
            ? `${clasesBase} ${opcion.fondoActivo} ${opcion.textoActivo}`
            : `${clasesBase} bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100`;
          return (
            <button
              key={opcion.valor}
              type="button"
              onClick={() => cambiarEstado(opcion.valor)}
              disabled={enTransicion || activo}
              aria-pressed={activo}
              className={`${clases} ${
                indice > 0 ? 'border-l border-zinc-800' : ''
              } ${activo ? opcion.bordeActivo : ''}`}
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

      {enTransicion ? (
        <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-zinc-500">
          ▸ SINCRONIZANDO…
        </p>
      ) : null}
    </article>
  );
}
