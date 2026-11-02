'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  asignarPostulanteFranja,
  darDeBajaPostulante,
  guardarNotasEmpleo,
  obtenerComparativaProgreso,
} from '@/services/empleo';
import type {
  ComparativaProgreso,
  FranjaCabina,
  MetricasIntento,
  PostulanteFila,
} from '@/types/empleo';
import Sheet from './Sheet';
import RadarCuatroEjes from './RadarCuatroEjes';

/**
 * Drawer lateral de la ficha técnica del postulante: datos de contacto,
 * nivel de asistencia, los 4 ejes técnicos (puntaje 0/10/20 de la consola
 * táctil o texto legacy del pipeline PDF), telemetría TITAN y notas
 * sociolaborales del equipo de Empleo. También permite asignar a franja y
 * dar de baja con motivo.
 */

interface Props {
  postulante: PostulanteFila | null;
  franjas: FranjaCabina[];
  onCerrar: () => void;
}

const BADGE_ASISTENCIA: Record<string, { etiqueta: string; clase: string }> = {
  MINIMA_AUTONOMO: {
    etiqueta: 'MÍNIMA · AUTÓNOMO',
    clase: 'bg-emerald-500 text-emerald-950',
  },
  MEDIA: { etiqueta: 'MEDIA · GUÍA VERBAL', clase: 'bg-amber-400 text-amber-950' },
  ALTA: {
    etiqueta: 'ALTA · INTERVENCIÓN',
    clase: 'bg-red-500 text-red-950',
  },
};

const CLASE_PUNTAJE: Record<number, string> = {
  0: 'bg-red-500 text-red-950',
  10: 'bg-amber-400 text-amber-950',
  20: 'bg-emerald-500 text-emerald-950',
};

const BADGE_RECEPTIVIDAD: Record<string, string> = {
  'Alta Asimilación': 'bg-emerald-500 text-emerald-950',
  'Estable': 'bg-amber-400 text-amber-950',
  'Ansiedad Operativa': 'bg-red-500 text-red-950',
  'Sin Datos': 'bg-zinc-700 text-zinc-200',
};

const ETIQUETA_TURNO: Record<PostulanteFila['origen_turno'], string> = {
  TM: 'TURNO MAÑANA',
  TT: 'TURNO TARDE',
  INDEFINIDO: 'INDEFINIDO',
};

const EJES: readonly {
  clavePuntaje: 'puntaje_lateralidad' | 'puntaje_tacto_mandos' | 'puntaje_mastil' | 'puntaje_control_receptividad';
  claveTexto: 'eje_lateralidad' | 'eje_tacto_mandos' | 'eje_mastil' | 'eje_control_receptividad';
  etiqueta: string;
}[] = [
  { clavePuntaje: 'puntaje_lateralidad', claveTexto: 'eje_lateralidad', etiqueta: 'LATERALIDAD' },
  { clavePuntaje: 'puntaje_tacto_mandos', claveTexto: 'eje_tacto_mandos', etiqueta: 'MANDOS' },
  { clavePuntaje: 'puntaje_mastil', claveTexto: 'eje_mastil', etiqueta: 'MÁSTIL' },
  {
    clavePuntaje: 'puntaje_control_receptividad',
    claveTexto: 'eje_control_receptividad',
    etiqueta: 'CONTROL',
  },
];

function formatoSegundos(seg: number | null): string {
  if (seg === null) return '—';
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${`${s}`.padStart(2, '0')} min`;
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2">
      <p className="font-mono text-[9px] tracking-[0.14em] text-zinc-500">{etiqueta}</p>
      <p className="mt-0.5 font-mono text-sm text-white">{valor}</p>
    </div>
  );
}

/** Chip de delta V1→V2: verde si hay mejora, rojo si empeoró, gris si es 0. */
function DeltaChip({
  etiqueta,
  valor,
  unidad,
}: {
  etiqueta: string;
  valor: number;
  unidad?: string;
}) {
  const cero = valor === 0;
  const mejora = valor < 0;
  const clase = cero ? 'text-zinc-400' : mejora ? 'text-emerald-400' : 'text-red-400';
  const signo = valor > 0 ? '+' : '';
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <p className="font-mono text-[8px] tracking-[0.12em] text-zinc-600">{etiqueta}</p>
      <p className={`mt-0.5 font-mono text-xs ${clase}`}>
        {cero ? 'SIN CAMBIO' : `${signo}${valor}${unidad ?? ''}`}
      </p>
    </div>
  );
}

export default function DrawerPostulante({ postulante, franjas, onCerrar }: Props) {
  const [notas, setNotas] = useState('');
  const [franjaSeleccionada, setFranjaSeleccionada] = useState('');
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  // Comparativa multi-intento (V1/V2/FINAL) del pipeline TITAN.
  const [comparativa, setComparativa] = useState<ComparativaProgreso | null>(null);
  const [cargandoComp, setCargandoComp] = useState(false);
  const [vistaActiva, setVistaActiva] = useState<'V1' | 'V2'>('V1');

  // Sincroniza las notas con el postulante abierto (el drawer se reutiliza).
  useEffect(() => {
    setNotas(postulante?.obs_empleo ?? '');
    setFranjaSeleccionada('');
    setMensaje(null);
  }, [postulante?.inscripcion_id, postulante?.obs_empleo]);

  // Carga la comparativa de progreso al abrir la ficha de un postulante.
  useEffect(() => {
    const pid = postulante?.postulante_id;
    setVistaActiva('V1');
    if (!pid) {
      setComparativa(null);
      return;
    }
    let vivo = true;
    setCargandoComp(true);
    obtenerComparativaProgreso(pid)
      .then((r) => {
        if (vivo) setComparativa(r);
      })
      .catch(() => {
        if (vivo) setComparativa(null);
      })
      .finally(() => {
        if (vivo) setCargandoComp(false);
      });
    return () => {
      vivo = false;
    };
  }, [postulante?.postulante_id]);

  if (!postulante) return null;

  const evaluacion = postulante.evaluacion;
  const asistencia = evaluacion?.asistencia_cabina
    ? BADGE_ASISTENCIA[evaluacion.asistencia_cabina]
    : null;

  const franjasLibres = franjas.filter(
    (f) => f.ocupantes.length < f.cupo_maximo && f.id !== postulante.franja_id
  );

  function ejecutar(
    accion: Promise<{ ok: boolean; error?: string }>,
    textoOk: string
  ) {
    setMensaje(null);
    startTransition(async () => {
      const res = await accion;
      setMensaje(
        res.ok
          ? { texto: textoOk, tipo: 'ok' }
          : { texto: (res.error ?? 'ERROR').toUpperCase(), tipo: 'error' }
      );
    });
  }

  function asignar() {
    if (!postulante || !franjaSeleccionada) return;
    ejecutar(
      asignarPostulanteFranja(postulante.inscripcion_id, franjaSeleccionada),
      'POSTULANTE ASIGNADO Y CONFIRMADO'
    );
  }

  function darBaja() {
    if (!postulante) return;
    const motivo = window.prompt(
      'Motivo de baja del postulante (obligatorio):',
      'Baja solicitada por Gestión de Empleo'
    );
    if (motivo === null) return;
    ejecutar(
      darDeBajaPostulante(postulante.inscripcion_id, motivo),
      'POSTULANTE DADO DE BAJA'
    );
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={postulante.nombre_completo}
      subtitulo={`RANKING #${postulante.ranking_orden} · DNI ${postulante.dni} · ${ETIQUETA_TURNO[postulante.origen_turno]}`}
    >
      <div className="space-y-5">
        {/* ── Badges de cabecera ─────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {asistencia ? (
            <span
              className={`rounded-sm px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] ${asistencia.clase}`}
            >
              ASISTENCIA: {asistencia.etiqueta}
            </span>
          ) : (
            <span className="rounded-sm bg-zinc-800 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-zinc-400">
              SIN EVALUACIÓN DE ASISTENCIA
            </span>
          )}
          {evaluacion?.dictamen && (
            <span className="rounded-sm border border-zinc-700 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-zinc-300">
              DICTAMEN: {evaluacion.dictamen.replaceAll('_', ' ')}
            </span>
          )}
        </div>

        {/* ── Los 4 ejes técnicos ────────────────────────────── */}
        <section aria-label="Ejes técnicos">
          <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
            4 EJES TÉCNICOS
          </p>
          <ul className="mt-2 space-y-1.5">
            {EJES.map((eje) => {
              const puntaje = evaluacion?.[eje.clavePuntaje] ?? null;
              const texto = evaluacion?.[eje.claveTexto] ?? null;
              return (
                <li
                  key={eje.etiqueta}
                  className="flex items-start justify-between gap-3 rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] tracking-[0.12em] text-white">
                      {eje.etiqueta}
                    </p>
                    {texto && (
                      <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-zinc-500 break-words">
                        {texto}
                      </p>
                    )}
                  </div>
                  {puntaje !== null ? (
                    <span
                      className={`shrink-0 rounded-sm px-2 py-1 font-mono text-xs font-semibold ${CLASE_PUNTAJE[puntaje] ?? 'bg-zinc-800 text-zinc-300'}`}
                    >
                      {puntaje}/20
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-sm bg-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-500">
                      S/P
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Telemetría TITAN ───────────────────────────────── */}
        <section aria-label="Telemetría TITAN">
          <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
            TELEMETRÍA TITAN
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <Metrica
              etiqueta="SCORE"
              valor={
                evaluacion?.telemetria.score_puntos !== null &&
                evaluacion?.telemetria.score_puntos !== undefined
                  ? `${evaluacion.telemetria.score_puntos} pts`
                  : '—'
              }
            />
            <Metrica
              etiqueta="TIEMPO"
              valor={formatoSegundos(evaluacion?.telemetria.tiempo_vuelta_seg ?? null)}
            />
            <Metrica
              etiqueta="COLISIONES"
              valor={`${evaluacion?.telemetria.colisiones ?? '—'}`}
            />
            <Metrica
              etiqueta="SERRUCHO"
              valor={`${evaluacion?.telemetria.indice_serrucho ?? '—'}`}
            />
            <Metrica
              etiqueta="VOLANTAZOS"
              valor={`${evaluacion?.telemetria.volantazos_extremos ?? '—'}`}
            />
          </div>
        </section>

        {/* ── Progreso multi-intento V1 / V2 (pipeline TITAN) ─── */}
        <section aria-label="Progreso de evaluaciones" className="space-y-3">
          <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
            PROGRESO · V1 / V2
          </p>

          {cargandoComp ? (
            <p className="font-mono text-[10px] tracking-[0.1em] text-zinc-600">
              CARGANDO COMPARATIVA…
            </p>
          ) : !comparativa ? (
            <p className="rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-zinc-500">
              SIN DIAGNÓSTICOS DEL PIPELINE TITAN PARA ESTE POSTULANTE.
            </p>
          ) : (
            <>
              {/* Pestañas V1 / V2 con badge ★ Mejor Diagnóstico */}
              <div className="flex gap-2" role="tablist" aria-label="Vueltas de diagnóstico">
                {(
                  [
                    ['V1', comparativa.v1],
                    ['V2', comparativa.v2],
                  ] as const
                ).map(([clave, m]) => {
                  const activo = vistaActiva === clave && !!m;
                  return (
                    <button
                      key={clave}
                      type="button"
                      role="tab"
                      aria-selected={activo}
                      disabled={!m}
                      onClick={() => setVistaActiva(clave)}
                      className={`h-9 flex-1 rounded-sm border px-2 font-mono text-[10px] tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-700 ${
                        activo
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                      }`}
                    >
                      {clave === 'V1' ? 'VUELTA 1' : 'VUELTA 2'}
                      {m?.esMejorDiagnostico && (
                        <span className="ml-1 text-amber-300">★ MEJOR</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Métricas de la vuelta activa */}
              {(() => {
                const m: MetricasIntento | null =
                  vistaActiva === 'V2' ? comparativa.v2 : comparativa.v1;
                if (!m) return null;
                return (
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <Metrica
                      etiqueta="SCORE"
                      valor={m.scorePuntos != null ? `${m.scorePuntos} pts` : '—'}
                    />
                    <Metrica etiqueta="TIEMPO" valor={formatoSegundos(m.tiempoVueltaSeg)} />
                    <Metrica etiqueta="COLISIONES" valor={`${m.colisiones ?? '—'}`} />
                    <Metrica etiqueta="SERRUCHO" valor={`${m.indiceSerrucho ?? '—'}`} />
                    <Metrica
                      etiqueta="VOLANTAZOS"
                      valor={`${m.volantazosExtremos ?? '—'}`}
                    />
                    <Metrica
                      etiqueta="DESCARTADAS"
                      valor={`${m.colisionesDescartadas ?? 0}`}
                    />
                  </div>
                );
              })()}

              {/* Tarjeta de receptividad V1→V2 */}
              <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[9px] tracking-[0.14em] text-zinc-500">
                    RECEPTIVIDAD V1→V2
                  </p>
                  <span
                    className={`rounded-sm px-2 py-0.5 font-mono text-[9px] font-semibold tracking-[0.1em] ${
                      BADGE_RECEPTIVIDAD[
                        comparativa.deltaDiagnostico.evaluacionReceptividad
                      ] ?? 'bg-zinc-700 text-zinc-200'
                    }`}
                  >
                    {comparativa.deltaDiagnostico.evaluacionReceptividad.toUpperCase()}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <DeltaChip
                    etiqueta="Δ TIEMPO (SEG)"
                    valor={comparativa.deltaDiagnostico.mejoraTiempoSeg}
                  />
                  <DeltaChip
                    etiqueta="Δ COLISIONES"
                    valor={-comparativa.deltaDiagnostico.reduccionColisiones}
                  />
                </div>
              </div>

              {/* Visualizador de ejes (radar) */}
              <RadarCuatroEjes
                ejes={comparativa.radarEjes}
                mostrarFinal={!!comparativa.pruebaFinal}
              />

              {/* Slot de Prueba Final */}
              {comparativa.pruebaFinal ? (
                <div className="rounded-sm border border-cyan-500/40 bg-cyan-500/5 px-3 py-2">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-cyan-300">
                    EVALUACIÓN FINAL · REALIZADA
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <Metrica
                      etiqueta="SCORE FINAL"
                      valor={
                        comparativa.pruebaFinal.scorePuntos != null
                          ? `${comparativa.pruebaFinal.scorePuntos} pts`
                          : '—'
                      }
                    />
                    <Metrica
                      etiqueta="TIEMPO"
                      valor={formatoSegundos(comparativa.pruebaFinal.tiempoVueltaSeg)}
                    />
                    <Metrica
                      etiqueta="COLISIONES"
                      valor={`${comparativa.pruebaFinal.colisiones ?? '—'}`}
                    />
                  </div>
                  {comparativa.deltaFinal && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-sm bg-zinc-800 px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] text-zinc-300">
                        MEJORA TOTAL:{' '}
                        {comparativa.deltaFinal.mejoraTotalPorcentaje > 0 ? '+' : ''}
                        {comparativa.deltaFinal.mejoraTotalPorcentaje}%
                      </span>
                      <span
                        className={`rounded-sm px-2 py-0.5 font-mono text-[9px] font-semibold tracking-[0.1em] ${
                          comparativa.deltaFinal.aptoParaPlanta
                            ? 'bg-emerald-500 text-emerald-950'
                            : 'bg-zinc-700 text-zinc-200'
                        }`}
                      >
                        {comparativa.deltaFinal.aptoParaPlanta
                          ? 'APTO PARA PLANTA'
                          : 'NO HABILITADO A PLANTA'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-sm border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-3">
                  <p className="font-mono text-[10px] leading-relaxed tracking-[0.1em] text-zinc-500">
                    EVALUACIÓN FINAL: PENDIENTE DE REALIZACIÓN AL COMPLETAR LAS 6 HS
                    DE SIMULADOR
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Notas sociolaborales de Empleo ─────────────────── */}
        <section aria-label="Notas sociolaborales">
          <label
            htmlFor="notas-empleo"
            className="font-mono text-[10px] tracking-[0.18em] text-zinc-500"
          >
            NOTAS SOCIOLABORALES (EMPLEO)
          </label>
          <textarea
            id="notas-empleo"
            rows={3}
            maxLength={2000}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observaciones del equipo de Empleo…"
            className="mt-2 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-1 focus-visible:outline-white"
          />
          <button
            type="button"
            disabled={isPending || notas === (postulante.obs_empleo ?? '')}
            onClick={() =>
              ejecutar(
                guardarNotasEmpleo(postulante.inscripcion_id, notas),
                'NOTAS GUARDADAS'
              )
            }
            className="mt-1.5 h-10 rounded-sm border border-zinc-600 px-4 font-mono text-[11px] tracking-[0.14em] text-zinc-200 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600 focus-visible:outline-1 focus-visible:outline-white"
          >
            GUARDAR NOTAS
          </button>
        </section>

        {/* ── Asignación y baja ──────────────────────────────── */}
        <section aria-label="Asignación de cabina" className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
            ASIGNAR A FRANJA (CONFIRMA TITULARIDAD)
          </p>
          <div className="flex gap-2">
            <select
              value={franjaSeleccionada}
              onChange={(e) => setFranjaSeleccionada(e.target.value)}
              aria-label="Franja de cabina disponible"
              disabled={postulante.estado === 'DESCARTADO'}
              className="h-11 min-w-0 flex-1 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white focus-visible:outline-1 focus-visible:outline-white disabled:cursor-not-allowed disabled:text-zinc-600"
            >
              <option value="">
                {franjasLibres.length === 0
                  ? 'SIN FRANJAS LIBRES'
                  : 'ELEGIR FRANJA…'}
              </option>
              {franjasLibres.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.turno.toUpperCase()} · {f.horario_label} ({f.ocupantes.length}/
                  {f.cupo_maximo})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={asignar}
              disabled={isPending || !franjaSeleccionada}
              className="h-11 shrink-0 rounded-sm border border-emerald-500 bg-emerald-500 px-4 font-mono text-xs font-semibold tracking-[0.12em] text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:outline-1 focus-visible:outline-white"
            >
              ASIGNAR
            </button>
          </div>

          {postulante.estado !== 'DESCARTADO' ? (
            <button
              type="button"
              onClick={darBaja}
              disabled={isPending}
              className="h-11 w-full rounded-sm border border-red-500/60 px-4 font-mono text-xs tracking-[0.14em] text-red-400 transition-colors hover:border-red-500 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600 focus-visible:outline-1 focus-visible:outline-white"
            >
              DAR DE BAJA DEL PROGRAMA
            </button>
          ) : (
            <p className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-[10px] leading-relaxed tracking-[0.1em] text-red-400">
              DESCARTADO · {postulante.motivo_baja ?? 'SIN MOTIVO REGISTRADO'}
            </p>
          )}
        </section>

        {mensaje && (
          <p
            role={mensaje.tipo === 'error' ? 'alert' : 'status'}
            className={`font-mono text-[10px] tracking-[0.12em] ${
              mensaje.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {mensaje.texto}
          </p>
        )}
      </div>
    </Sheet>
  );
}
