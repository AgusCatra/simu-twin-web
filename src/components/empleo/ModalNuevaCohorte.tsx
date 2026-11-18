'use client';

import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Layers, SlidersHorizontal, Users, X } from 'lucide-react';
import { crearCohorteAction } from '@/services/empleo';
import {
  calcularEstructuraGruposYDuplasDinamica,
  CONFIGURACION_CURSADO_DEFECTO,
  formatearDiasGrupoCorto,
  FRANJAS_ESTANDAR_LABELS,
  obtenerProximoLunesPosterior,
  proyectarCalendarioCohorteV2,
} from '@/lib/calendario-duplas';
import type {
  ConfiguracionCursadoCohorte,
  TipoMaquinariaCohorte,
} from '@/types/empleo';

const DIAS_HABILES_NC: readonly { num: number; corto: string }[] = [
  { num: 1, corto: 'LUN' },
  { num: 2, corto: 'MAR' },
  { num: 3, corto: 'MIÉ' },
  { num: 4, corto: 'JUE' },
  { num: 5, corto: 'VIE' },
];

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

const LABEL_CLASS = 'block text-xs font-semibold text-slate-700';
const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

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
  const [diasGrupoA, setDiasGrupoA] = useState<number[]>(CONFIGURACION_CURSADO_DEFECTO.dias_grupo_a);
  const [diasGrupoB, setDiasGrupoB] = useState<number[]>(CONFIGURACION_CURSADO_DEFECTO.dias_grupo_b);
  const [franjasActivas, setFranjasActivas] = useState<string[]>([...FRANJAS_ESTANDAR_LABELS]);
  const [sesionesObjetivo, setSesionesObjetivo] = useState<number>(6);
  const [mostrarCursadoDinamico, setMostrarCursadoDinamico] = useState(false);
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

  const configCursado: ConfiguracionCursadoCohorte = useMemo(
    () => ({
      modalidad: 'DUPLAS',
      dias_grupo_a: diasGrupoA.length > 0 ? diasGrupoA : [1, 3],
      dias_grupo_b: diasGrupoB,
      franjas_activas:
        franjasActivas.length > 0 ? franjasActivas : [...FRANJAS_ESTANDAR_LABELS],
      sesiones_objetivo: Math.min(24, Math.max(2, sesionesObjetivo || 6)),
    }),
    [diasGrupoA, diasGrupoB, franjasActivas, sesionesObjetivo]
  );

  const estructuraDuplas = useMemo(
    () => calcularEstructuraGruposYDuplasDinamica(cupoAlumnos, configCursado),
    [cupoAlumnos, configCursado]
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
        configuracionCursado: configCursado,
      });
    } catch {
      return null;
    }
  }, [fechaTeoria, feriadosMunicipales, configCursado]);

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
        configuracion_cursado: configCursado,
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pendiente) {
          onCerrar();
        }
      }}
    >
      <form
        onSubmit={manejarSubmit}
        className="my-6 w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="titulo-modal-nueva-cohorte"
              className="text-lg font-bold text-slate-900"
            >
              Crear Nuevo Curso
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Armado automático de grupos, duplas y fechas de cursado
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            aria-label="Cerrar modal de nuevo curso"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
            >
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="nc-codigo" className={LABEL_CLASS}>
                Código del curso *
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
                Nombre del curso *
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
                  <CalendarDays size={13} strokeWidth={1.75} aria-hidden />
                  Fecha de clase teórica *
                </span>
              </label>
              <input
                id="nc-fecha-teoria"
                type="date"
                required
                value={fechaTeoria}
                onChange={(e) => setFechaTeoria(e.target.value)}
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </div>

            <div>
              <label htmlFor="nc-max-titulares" className={LABEL_CLASS}>
                Cupo máximo de alumnos *
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

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Users size={14} className="text-blue-600" strokeWidth={1.75} aria-hidden />
                Cantidad para distribución de duplas
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
                      className={`h-8 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                        activo
                          ? 'border-blue-300 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
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
                  className="h-8 w-16 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-3 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setMostrarCursadoDinamico((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
              >
                <SlidersHorizontal size={13} aria-hidden />
                {mostrarCursadoDinamico
                  ? 'Ocultar configuración de días y franjas'
                  : `Personalizar días (${formatearDiasGrupoCorto(configCursado.dias_grupo_a)} / ${configCursado.dias_grupo_b.length > 0 ? formatearDiasGrupoCorto(configCursado.dias_grupo_b) : 'Sin B'}), horarios (${configCursado.franjas_activas.length}) y clases (${configCursado.sesiones_objetivo})`}
              </button>

              {mostrarCursadoDinamico && (
                <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-bold text-emerald-700">
                      Grupo A
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {DIAS_HABILES_NC.map((d) => {
                        const on = diasGrupoA.includes(d.num);
                        return (
                          <button
                            key={`nc-ga-${d.num}`}
                            type="button"
                            onClick={() =>
                              setDiasGrupoA((prev) =>
                                prev.includes(d.num)
                                  ? prev.length > 1
                                    ? prev.filter((x) => x !== d.num)
                                    : prev
                                  : [...prev, d.num].sort((a, b) => a - b)
                              )
                            }
                            className={`h-7 rounded-md border px-2 text-xs font-semibold ${
                              on
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-slate-300 bg-white text-slate-500'
                            }`}
                          >
                            {d.corto}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-blue-700">
                        Grupo B
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setDiasGrupoB((prev) => (prev.length === 0 ? [2, 4] : []))
                        }
                        className="text-xs font-medium text-blue-600 underline"
                      >
                        {diasGrupoB.length === 0 ? 'Activar' : 'Desactivar'}
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {DIAS_HABILES_NC.map((d) => {
                        const on = diasGrupoB.includes(d.num);
                        return (
                          <button
                            key={`nc-gb-${d.num}`}
                            type="button"
                            onClick={() =>
                              setDiasGrupoB((prev) =>
                                prev.includes(d.num)
                                  ? prev.filter((x) => x !== d.num)
                                  : [...prev, d.num].sort((a, b) => a - b)
                              )
                            }
                            className={`h-7 rounded-md border px-2 text-xs font-semibold ${
                              on
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : 'border-slate-300 bg-white text-slate-500'
                            }`}
                          >
                            {d.corto}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-700">
                      Horarios y Clases
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {FRANJAS_ESTANDAR_LABELS.map((fl) => {
                        const on = franjasActivas.includes(fl);
                        return (
                          <button
                            key={fl}
                            type="button"
                            onClick={() =>
                              setFranjasActivas((prev) =>
                                prev.includes(fl)
                                  ? prev.length > 1
                                    ? prev.filter((x) => x !== fl)
                                    : prev
                                  : [...prev, fl]
                              )
                            }
                            className={`h-7 rounded-md border px-2 text-xs font-semibold ${
                              on
                                ? 'border-blue-300 bg-blue-600 text-white'
                                : 'border-slate-300 bg-white text-slate-600'
                            }`}
                          >
                            {fl.split('-')[0]}
                          </button>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <span>Clases:</span>
                      <input
                        type="number"
                        min={2}
                        max={24}
                        value={sesionesObjetivo}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) setSesionesObjetivo(Math.trunc(v));
                        }}
                        className="h-7 w-14 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <Layers size={13} strokeWidth={1.75} aria-hidden />
                  Grupo A ({formatearDiasGrupoCorto(configCursado.dias_grupo_a)}):{' '}
                  {estructuraDuplas.grupoACantidad} alumnos
                </span>
                <span className="text-blue-700">
                  {configCursado.dias_grupo_b.length > 0
                    ? `Grupo B (${formatearDiasGrupoCorto(configCursado.dias_grupo_b)}): ${estructuraDuplas.grupoBCantidad} alumnos`
                    : 'Grupo B desactivado'}
                </span>
                {estructuraDuplas.cuposReserva > 0 && (
                  <span className="text-amber-800">
                    +{estructuraDuplas.cuposReserva} en espera
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {estructuraDuplas.duplas.map((d) => (
                  <div
                    key={d.duplaNumero}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      d.integrantesPrevistos > 0
                        ? d.grupo === 'GRUPO_A'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-blue-200 bg-blue-50'
                        : 'border-slate-200 bg-white opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-bold">
                      <span className="text-slate-900">Dupla #{d.duplaNumero}</span>
                      <span
                        className={
                          d.grupo === 'GRUPO_A' ? 'text-emerald-700' : 'text-blue-700'
                        }
                      >
                        {d.grupo === 'GRUPO_A' ? 'A' : 'B'} · {d.diasLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-700">{d.horarioLabel}</p>
                    <p className="mt-0.5 text-slate-500">
                      Puestos #{d.puestoDesde}–#{d.puestoHasta} ({d.integrantesPrevistos}/2)
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {proyeccion && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
              <p className="font-bold text-slate-900">
                Fechas estimadas ({configCursado.sesiones_objetivo} clases por alumno):
              </p>
              <p className="mt-0.5">
                Inicio Simulador: <strong className="text-slate-900">{formatoCortoIso(proyeccion.fechaInicioSimulador)}</strong>{' '}
                · Fin Simulador: <strong className="text-slate-900">{formatoCortoIso(proyeccion.fechaFinSimulador)}</strong>{' '}
                · Pase a Patio: <strong className="text-emerald-700">{formatoCortoIso(proyeccion.fechaPaseTerreno)}</strong>
              </p>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
            <input
              type="checkbox"
              checked={activarInmediatamente}
              onChange={(e) => setActivarInmediatamente(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <span className="text-xs font-medium leading-relaxed text-slate-800">
              Activar este curso inmediatamente al crearlo.
              {cohorteActivaCodigo ? (
                <span className="block text-slate-500">
                  El curso activo actual ({cohorteActivaCodigo}) pasará a histórico.
                </span>
              ) : null}
            </span>
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente || !proyeccion}
            className="h-10 rounded-lg bg-blue-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pendiente ? 'Creando curso…' : 'Crear curso y turnos'}
          </button>
        </footer>
      </form>
    </div>
  );
}
