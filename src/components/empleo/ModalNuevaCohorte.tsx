'use client';

import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Layers, Users, X } from 'lucide-react';
import { crearCohorteAction } from '@/services/empleo';
import {
  calcularEstructuraGruposYDuplas,
  obtenerProximoLunesPosterior,
  proyectarCalendarioCohorteV2,
  TOTAL_SESIONES_CICLO,
} from '@/lib/calendario-duplas';
import type { TipoMaquinariaCohorte } from '@/types/empleo';

/**
 * Modal accesible de alta de cohorte en /gestion/cohortes.
 * Calcula y previsualiza automáticamente Grupos A/B, las 8 duplas pedagógicas
 * (1..8) y el calendario V2 con absorción de feriados en Viernes Buffer.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  feriadosMunicipales: string[];
  cohorteActivaCodigo?: string | null;
}

const OPCIONES_CUPO_DUPLAS: readonly number[] = [16, 20, 22, 24];
const OPCIONES_MAQUINARIA: readonly {
  valor: TipoMaquinariaCohorte;
  etiqueta: string;
}[] = [
  { valor: 'AUTOELEVADOR', etiqueta: 'Autoelevador' },
  { valor: 'PALA_FRONTAL', etiqueta: 'Pala Frontal' },
  { valor: 'RETROEXCAVADORA', etiqueta: 'Retroexcavadora' },
];

const LABEL_CLASS =
  'block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500';
const INPUT_CLASS =
  'w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none';

function obtenerFechaSugerida(): string {
  const hoy = new Date();
  hoy.setDate(hoy.getDate() + 1);
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function formatoCortoIso(iso: string): string {
  const [a, m, d] = iso.split('-');
  if (!a || !m || !d) return iso;
  return `${d}/${m}/${a.slice(2)}`;
}

export default function ModalNuevaCohorte({
  abierto,
  onCerrar,
  feriadosMunicipales,
  cohorteActivaCodigo,
}: Props) {
  const router = useRouter();
  const [codigo, setCodigo] = useState('AUTO-2026-C2');
  const [nombre, setNombre] = useState('Autoelevador Nivel Inicial - Cohorte 2');
  const [tipoMaquinaria, setTipoMaquinaria] =
    useState<TipoMaquinariaCohorte>('AUTOELEVADOR');
  const [fechaTeoria, setFechaTeoria] = useState(() => obtenerFechaSugerida());
  const [cupoAlumnos, setCupoAlumnos] = useState(16);
  const [maxTitulares, setMaxTitulares] = useState(16);
  const [activarInmediatamente, setActivarInmediatamente] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    if (!abierto) return;
    function manejarEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendiente) {
        e.preventDefault();
        onCerrar();
      }
    }
    document.addEventListener('keydown', manejarEscape);
    return () => document.removeEventListener('keydown', manejarEscape);
  }, [abierto, pendiente, onCerrar]);

  const estructuraDuplas = useMemo(
    () => calcularEstructuraGruposYDuplas(cupoAlumnos),
    [cupoAlumnos]
  );

  const proyeccion = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTeoria)) return null;
    try {
      const inicioSim = obtenerProximoLunesPosterior(fechaTeoria);
      return proyectarCalendarioCohorteV2({
        fechaInicioTeoria: fechaTeoria,
        fechaInicioSimulador: inicioSim,
        diasBloqueados: feriadosMunicipales,
        estrategiaFeriados: 'MOVER_A_VIERNES',
      });
    } catch {
      return null;
    }
  }, [fechaTeoria, feriadosMunicipales]);

  if (!abierto) return null;

  function actualizarCupo(nuevoCupo: number) {
    const limpio = Math.max(2, Math.min(32, Math.trunc(nuevoCupo)));
    setCupoAlumnos(limpio);
    setMaxTitulares((prev) => (prev === cupoAlumnos ? limpio : prev));
  }

  function manejarSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const codigoNormalizado = codigo.trim().toUpperCase().replace(/\s+/g, '-');
    if (!/^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/.test(codigoNormalizado)) {
      setError(
        'Código inválido: usá entre 3 y 32 letras, números o guiones (ej: AUTO-2026-C2).'
      );
      return;
    }
    if (nombre.trim().length < 3) {
      setError('El nombre de la cohorte debe tener al menos 3 caracteres.');
      return;
    }
    if (!proyeccion) {
      setError('Seleccioná una fecha de capacitación teórica válida.');
      return;
    }

    startTransition(async () => {
      const res = await crearCohorteAction({
        codigo: codigoNormalizado,
        nombre: nombre.trim(),
        tipo_maquinaria: tipoMaquinaria,
        fecha_teoria: fechaTeoria,
        cupo_alumnos: cupoAlumnos,
        max_titulares: maxTitulares,
        activar_inmediatamente: activarInmediatamente,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      onCerrar();
      router.push(`/gestion/cohortes?cohorteId=${encodeURIComponent(res.cohorte_id)}`);
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-nueva-cohorte"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pendiente) {
          onCerrar();
        }
      }}
    >
      <form
        onSubmit={manejarSubmit}
        className="my-6 w-full max-w-3xl rounded-sm border border-zinc-700 bg-zinc-900"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div>
            <h2
              id="titulo-modal-nueva-cohorte"
              className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100"
            >
              [ NUEVA COHORTE · MODELO DUPLAS ]
            </h2>
            <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-zinc-500">
              CÁLCULO AUTOMÁTICO DE GRUPOS A/B, DUPLAS 1..8 Y CRONOGRAMA V2
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            aria-label="Cerrar modal de nueva cohorte"
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <p
              role="alert"
              className="rounded-sm border border-red-900 bg-red-950 px-3 py-2 font-mono text-xs text-red-200"
            >
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="nc-codigo" className={LABEL_CLASS}>
                Código de cohorte *
              </label>
              <input
                id="nc-codigo"
                type="text"
                required
                maxLength={32}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="AUTO-2026-C2"
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </div>

            <div>
              <label htmlFor="nc-maquinaria" className={LABEL_CLASS}>
                Maquinaria *
              </label>
              <select
                id="nc-maquinaria"
                value={tipoMaquinaria}
                onChange={(e) =>
                  setTipoMaquinaria(e.target.value as TipoMaquinariaCohorte)
                }
                className={`mt-1 ${INPUT_CLASS}`}
              >
                {OPCIONES_MAQUINARIA.map((op) => (
                  <option key={op.valor} value={op.valor}>
                    {op.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="nc-nombre" className={LABEL_CLASS}>
                Nombre de la cohorte *
              </label>
              <input
                id="nc-nombre"
                type="text"
                required
                maxLength={120}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Autoelevador Nivel Inicial - Cohorte 2"
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </div>

            <div>
              <label htmlFor="nc-fecha-teoria" className={LABEL_CLASS}>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={12} strokeWidth={1.75} aria-hidden />
                  Fecha de teoría *
                </span>
              </label>
              <input
                id="nc-fecha-teoria"
                type="date"
                required
                value={fechaTeoria}
                onChange={(e) => setFechaTeoria(e.target.value)}
                className={`mt-1 [color-scheme:dark] ${INPUT_CLASS}`}
              />
            </div>

            <div>
              <label htmlFor="nc-max-titulares" className={LABEL_CLASS}>
                Tope titulares en parrilla *
              </label>
              <input
                id="nc-max-titulares"
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                required
                value={maxTitulares}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setMaxTitulares(Math.trunc(v));
                }}
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </div>
          </div>

          {/* ── Selector de cupo con recálculo de Grupos A/B y Duplas 1..8 ── */}
          <section className="rounded-sm border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                <Users size={13} strokeWidth={1.75} aria-hidden />
                Cupo de alumnos para cálculo de Duplas
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {OPCIONES_CUPO_DUPLAS.map((op) => {
                  const activo = cupoAlumnos === op;
                  return (
                    <button
                      key={op}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => actualizarCupo(op)}
                      className={`h-8 rounded-sm border px-2.5 font-mono text-xs transition-colors ${
                        activo
                          ? 'border-white bg-white font-semibold text-zinc-950'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                      }`}
                    >
                      {op}
                    </button>
                  );
                })}
                <input
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={32}
                  aria-label="Cupo manual de alumnos"
                  value={cupoAlumnos}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) actualizarCupo(v);
                  }}
                  className="h-8 w-16 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white outline-none"
                />
              </div>
            </div>

            {/* ── Vista automática Grupos A/B y Duplas 1..8 ───────── */}
            <div className="mt-3 space-y-2.5 border-t border-zinc-800 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tracking-[0.1em]">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Layers size={12} strokeWidth={1.75} aria-hidden />
                  GRUPO A (LUN/MIÉ): {estructuraDuplas.grupoACantidad} ALUMNOS · 4 DUPLAS
                </span>
                <span className="text-cyan-400">
                  GRUPO B (MAR/JUE): {estructuraDuplas.grupoBCantidad} ALUMNOS · 4 DUPLAS
                </span>
                {estructuraDuplas.cuposReserva > 0 && (
                  <span className="text-amber-300">
                    +{estructuraDuplas.cuposReserva} RESERVA / SUPLENTES
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {estructuraDuplas.duplas.map((d) => (
                  <div
                    key={d.duplaNumero}
                    className={`rounded-sm border px-2.5 py-2 font-mono ${
                      d.integrantesPrevistos > 0
                        ? d.grupo === 'GRUPO_A'
                          ? 'border-emerald-500/30 bg-emerald-950/15'
                          : 'border-cyan-500/30 bg-cyan-950/15'
                        : 'border-zinc-800 bg-zinc-900/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[9.5px] font-semibold">
                      <span className="text-white">DUPLA #{d.duplaNumero}</span>
                      <span
                        className={
                          d.grupo === 'GRUPO_A' ? 'text-emerald-400' : 'text-cyan-400'
                        }
                      >
                        {d.grupo === 'GRUPO_A' ? 'A' : 'B'} · {d.diasLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[9px] text-zinc-400">{d.horarioLabel}</p>
                    <p className="mt-0.5 text-[9px] text-zinc-500">
                      Puestos #{d.puestoDesde}–#{d.puestoHasta} ({d.integrantesPrevistos}/2)
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Proyección automática de calendario ─────────────── */}
          {proyeccion && (
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-zinc-300">
              <p className="text-white">
                PROYECCIÓN AUTOMÁTICA ({TOTAL_SESIONES_CICLO} SESIONES / 3 SEMANAS):
              </p>
              <p className="mt-0.5">
                Inicio Simulador: <strong className="text-white">{formatoCortoIso(proyeccion.fechaInicioSimulador)}</strong>{' '}
                · Fin Simulador: <strong className="text-white">{formatoCortoIso(proyeccion.fechaFinSimulador)}</strong>{' '}
                · Pase a Terreno: <strong className="text-emerald-400">{formatoCortoIso(proyeccion.fechaPaseTerreno)}</strong>
              </p>
            </div>
          )}

          {/* ── Opción de activación inmediata ──────────────────── */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2.5">
            <input
              type="checkbox"
              checked={activarInmediatamente}
              onChange={(e) => setActivarInmediatamente(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded-none border border-zinc-600 bg-zinc-950 accent-emerald-500"
            />
            <span className="font-mono text-[10.5px] leading-relaxed text-zinc-300">
              Activar cohorte inmediatamente al crearla.
              {cohorteActivaCodigo ? (
                <span className="block text-[9.5px] text-zinc-500">
                  La cohorte activa actual ({cohorteActivaCodigo}) pasará a estado finalizada.
                </span>
              ) : null}
            </span>
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950 px-5 py-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            className="h-10 rounded-sm border border-zinc-700 bg-zinc-900 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente || !proyeccion}
            className="h-10 rounded-sm border border-white bg-white px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {pendiente ? 'CREANDO COHORTE…' : 'CREAR COHORTE Y FRANJAS'}
          </button>
        </footer>
      </form>
    </div>
  );
}
