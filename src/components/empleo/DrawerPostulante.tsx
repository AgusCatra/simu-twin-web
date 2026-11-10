'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  FileJson,
  Loader2,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  analizarTelemetriaPostulanteAction,
  asignarPostulanteFranja,
  darDeBajaPostulante,
  guardarNotasEmpleo,
  obtenerComparativaProgreso,
} from '@/services/empleo';
import {
  MAX_BYTES_REPORTE_JSON,
  parsearReporteSimulador,
  type MetricasSimulador,
} from '@/lib/telemetria/parser-simulador';
import type { InformeEmpleoIA } from '@/lib/ia/generador-informe';
import type {
  ComparativaProgreso,
  FranjaCabina,
  MetricasIntento,
  PostulanteFila,
  PuntoRadar,
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

const BADGE_NIVEL_ASISTENCIA: Record<string, { etiqueta: string; clase: string }> = {
  AUTONOMO: {
    etiqueta: 'AUTÓNOMO',
    clase: 'bg-emerald-500 text-emerald-950',
  },
  AYUDA_VERBAL: {
    etiqueta: 'AYUDA VERBAL',
    clase: 'bg-amber-400 text-amber-950',
  },
  INTERVENCION_CONSTANTE: {
    etiqueta: 'INTERVENCIÓN CONSTANTE',
    clase: 'bg-orange-500 text-orange-950',
  },
  INTERVENCION_CRITICA: {
    etiqueta: 'INTERVENCIÓN CRÍTICA',
    clase: 'bg-red-500 text-red-950',
  },
};

const ETIQUETA_BLOQUE_SPLIT: Record<string, string> = {
  PILOTO_A: 'BLOQUE 1 · PILOTO A',
  COPILOTO_B: 'BLOQUE 1 · COPILOTO B',
  PILOTO_B: 'BLOQUE 2 · PILOTO B',
  COPILOTO_A: 'BLOQUE 2 · COPILOTO A',
};

const BADGE_DICTAMEN_IA: Record<
  InformeEmpleoIA['dictamenSugerido'],
  { etiqueta: string; clase: string }
> = {
  APTO_DIRECTO: {
    etiqueta: 'APTO DIRECTO',
    clase: 'bg-emerald-500 text-emerald-950',
  },
  APTO_OBSERVACION: {
    etiqueta: 'APTO C/ OBSERVACIÓN',
    clase: 'bg-cyan-400 text-cyan-950',
  },
  CONDICIONAL: {
    etiqueta: 'CONDICIONAL',
    clase: 'bg-amber-400 text-amber-950',
  },
  NO_APTO: {
    etiqueta: 'NO APTO',
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

function formatoSegundos(seg: number | null | undefined): string {
  if (typeof seg !== 'number' || !Number.isFinite(seg) || seg < 0) return '—';
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${`${s}`.padStart(2, '0')} min`;
}

function formatoNumeroSeguro(
  val: number | null | undefined,
  sufijo = '',
  decimalesMax = 2
): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
  const factor = 10 ** decimalesMax;
  const redondeado = Number.isInteger(val)
    ? val
    : Math.round(val * factor) / factor;
  return `${redondeado}${sufijo}`;
}

function construirRadarDesdeTablet(
  evaluacion: PostulanteFila['evaluacion']
): PuntoRadar[] | null {
  if (!evaluacion || !evaluacion.tiene_evaluacion_tablet) return null;
  const aEscala = (v: number | null): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return Math.min(100, Math.max(0, Math.round(v * 5)));
  };
  const lat = aEscala(evaluacion.puntaje_lateralidad);
  const man = aEscala(evaluacion.puntaje_tacto_mandos);
  const mas = aEscala(evaluacion.puntaje_mastil);
  const con = aEscala(evaluacion.puntaje_control_receptividad);
  return [
    { eje: 'Lateralidad', valorDiagnostico: lat, valorFinal: lat },
    { eje: 'Mandos', valorDiagnostico: man, valorFinal: man },
    { eje: 'Mástil', valorDiagnostico: mas, valorFinal: mas },
    { eje: 'Control', valorDiagnostico: con, valorFinal: con },
  ];
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2">
      <p className="font-mono text-[9px] tracking-[0.14em] text-zinc-500">{etiqueta}</p>
      <p className="mt-0.5 font-mono text-sm text-white">{valor}</p>
    </div>
  );
}

/**
 * Chip de delta entre intentos: protege null / undefined / NaN mostrando '—',
 * distingue 0 como 'SIN CAMBIO' y colorea según el sentido de mejora.
 */
function DeltaChip({
  etiqueta,
  valor,
  unidad = '',
  sentido = 'menor_mejor',
}: {
  etiqueta: string;
  valor: number | null | undefined;
  unidad?: string;
  sentido?: 'menor_mejor' | 'mayor_mejor';
}) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return (
      <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1.5">
        <p className="font-mono text-[8px] tracking-[0.12em] text-zinc-600">{etiqueta}</p>
        <p className="mt-0.5 font-mono text-xs text-zinc-500">—</p>
      </div>
    );
  }

  const limpio = Number.isInteger(valor) ? valor : Math.round(valor * 100) / 100;
  const cero = limpio === 0;
  const mejora = sentido === 'menor_mejor' ? limpio < 0 : limpio > 0;
  const clase = cero ? 'text-zinc-400' : mejora ? 'text-emerald-400' : 'text-red-400';
  const signo = limpio > 0 ? '+' : '';

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <p className="font-mono text-[8px] tracking-[0.12em] text-zinc-600">{etiqueta}</p>
      <p className={`mt-0.5 font-mono text-xs ${clase}`}>
        {cero ? `0${unidad} (SIN CAMBIO)` : `${signo}${limpio}${unidad}`}
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

  // Pipeline Titán .json + Motor IA Gemini 2.5 Flash.
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);
  const [arrastrandoJson, setArrastrandoJson] = useState(false);
  const [archivoJsonNombre, setArchivoJsonNombre] = useState<string | null>(null);
  const [metricasJsonLocal, setMetricasJsonLocal] = useState<MetricasSimulador | null>(
    null
  );
  const [errorJson, setErrorJson] = useState<string | null>(null);
  const [informeLocal, setInformeLocal] = useState<InformeEmpleoIA | null>(null);
  const [avisoPersistenciaIA, setAvisoPersistenciaIA] = useState<string | null>(null);
  const [analizandoIA, setAnalizandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);

  // Sincroniza las notas con el postulante abierto (el drawer se reutiliza).
  useEffect(() => {
    setNotas(postulante?.obs_empleo ?? '');
    setFranjaSeleccionada('');
    setMensaje(null);
  }, [postulante?.inscripcion_id, postulante?.obs_empleo]);

  // Reinicia el estado efímero de carga JSON / informe al cambiar de postulante.
  useEffect(() => {
    setArrastrandoJson(false);
    setArchivoJsonNombre(null);
    setMetricasJsonLocal(null);
    setErrorJson(null);
    setInformeLocal(null);
    setAvisoPersistenciaIA(null);
    setErrorIA(null);
    setAnalizandoIA(false);
    if (inputArchivoRef.current) {
      inputArchivoRef.current.value = '';
    }
  }, [postulante?.inscripcion_id]);

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
  const nivelAsistenciaBadge = evaluacion?.nivel_asistencia
    ? BADGE_NIVEL_ASISTENCIA[evaluacion.nivel_asistencia]
    : null;
  const asistencia =
    nivelAsistenciaBadge ??
    (evaluacion?.asistencia_cabina
      ? BADGE_ASISTENCIA[evaluacion.asistencia_cabina]
      : null);
  const bloqueSplitEtiqueta = evaluacion?.bloque_split
    ? ETIQUETA_BLOQUE_SPLIT[evaluacion.bloque_split] ?? evaluacion.bloque_split
    : null;

  const metricasActivas =
    metricasJsonLocal ?? evaluacion?.telemetria_metricas ?? null;
  const archivoActivoNombre = metricasJsonLocal
    ? archivoJsonNombre
    : (evaluacion?.telemetria_archivo_nombre ?? null);
  const informeActivo = metricasJsonLocal
    ? informeLocal
    : (evaluacion?.informe_ia ?? null);

  const ejesRadar: PuntoRadar[] | null =
    comparativa && comparativa.radarEjes.length > 0
      ? comparativa.radarEjes
      : construirRadarDesdeTablet(evaluacion);

  const tieneTelemetriaTitan = Boolean(
    comparativa?.tieneTelemetriaTitan || evaluacion?.telemetria.tiene_datos
  );

  const intentoActivo: MetricasIntento | null = comparativa
    ? vistaActiva === 'V2'
      ? comparativa.v2 ?? comparativa.v1
      : comparativa.v1 ?? comparativa.pruebaFinal ?? null
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

  async function procesarArchivoJson(archivo: File) {
    if (!postulante) return;
    setErrorJson(null);
    setErrorIA(null);
    setAvisoPersistenciaIA(null);

    const nombre = archivo.name.trim() || 'telemetria.json';
    const esJson =
      nombre.toLowerCase().endsWith('.json') ||
      archivo.type === 'application/json' ||
      archivo.type === 'text/json';
    if (!esJson) {
      setErrorJson('Solo se admiten archivos de telemetría en formato .json.');
      return;
    }
    if (archivo.size === 0) {
      setErrorJson('El archivo .json seleccionado está vacío.');
      return;
    }
    if (archivo.size > MAX_BYTES_REPORTE_JSON) {
      setErrorJson('El archivo excede el tamaño máximo permitido (2 MB).');
      return;
    }

    try {
      const contenido = await archivo.text();
      const metricas = parsearReporteSimulador(contenido, {
        nombrePostulante: postulante.nombre_completo,
      });
      setArchivoJsonNombre(nombre);
      setMetricasJsonLocal(metricas);
      setInformeLocal(null);
    } catch (err) {
      setErrorJson(
        err instanceof Error
          ? err.message
          : 'No se pudo procesar el reporte .json de telemetría.'
      );
    }
  }

  function manejarSeleccionArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (archivo) {
      void procesarArchivoJson(archivo);
    }
    e.target.value = '';
  }

  function manejarDropJson(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrandoJson(false);
    const archivo = e.dataTransfer.files?.[0];
    if (archivo) {
      void procesarArchivoJson(archivo);
    }
  }

  async function ejecutarAnalisisIA() {
    if (!postulante || !metricasActivas || analizandoIA) return;
    setAnalizandoIA(true);
    setErrorIA(null);
    setAvisoPersistenciaIA(null);
    try {
      const res = await analizarTelemetriaPostulanteAction({
        postulante_id: postulante.postulante_id,
        archivo_nombre: archivoActivoNombre ?? 'telemetria.json',
        metricas: metricasActivas,
      });
      if (!res.ok) {
        setErrorIA(res.error);
        return;
      }
      setInformeLocal(res.informe);
      setAvisoPersistenciaIA(
        res.persistido
          ? 'Informe IA y métricas guardados en evaluacion_diagnostico.'
          : 'Informe generado en pantalla (se guardará en DB cuando exista una fila de evaluación de cabina/diagnóstico).'
      );
    } catch {
      setErrorIA('Error de red o tiempo de espera agotado al ejecutar el análisis IA.');
    } finally {
      setAnalizandoIA(false);
    }
  }

  function volcarRecomendacionANotas() {
    if (!informeActivo) return;
    const lineaRecomendacion = `[IA ${informeActivo.dictamenSugerido}] ${informeActivo.puntos[2].detalle}`;
    setNotas((prev) => {
      const limpio = prev.trim();
      if (limpio.includes(lineaRecomendacion)) return prev;
      const combinado = limpio
        ? `${limpio}\n\n${lineaRecomendacion}`
        : lineaRecomendacion;
      return combinado.slice(0, 2000);
    });
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
          {bloqueSplitEtiqueta && (
            <span className="rounded-sm border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-cyan-300">
              {bloqueSplitEtiqueta}
            </span>
          )}
          {evaluacion?.dictamen && (
            <span className="rounded-sm border border-zinc-700 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-zinc-300">
              DICTAMEN: {evaluacion.dictamen.replaceAll('_', ' ')}
            </span>
          )}
          {evaluacion?.tiene_evaluacion_tablet && evaluacion.score_tablet !== null && (
            <span className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-emerald-300">
              CABINA ({evaluacion.etapa_tablet ?? 'DIAG_INTENTO_1'}):{' '}
              {formatoNumeroSeguro(evaluacion.score_tablet, '/90 pts', 0)}
            </span>
          )}
        </div>

        {evaluacion?.hard_fail && (
          <div
            role="alert"
            className="rounded-sm border border-red-500/60 bg-red-950/40 px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-red-300"
          >
            <p className="font-bold text-red-400">HARD-FAIL REGISTRADO EN CABINA</p>
            {evaluacion.motivo_hard_fail && (
              <p className="mt-0.5 text-red-200">{evaluacion.motivo_hard_fail}</p>
            )}
          </div>
        )}

        {/* ── 4 Ejes Pedagógicos + Radar ─────────────────────── */}
        <section aria-label="Ejes pedagógicos y radar" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
              4 EJES PEDAGÓGICOS Y RADAR
            </p>
            {evaluacion?.tiene_evaluacion_tablet && (
              <span className="font-mono text-[9px] tracking-[0.12em] text-emerald-400">
                CABINA TABLET ACTIVA
              </span>
            )}
          </div>

          {ejesRadar ? (
            <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 px-3 py-3">
              <RadarCuatroEjes
                ejes={ejesRadar}
                mostrarFinal={comparativa?.tieneComparativaFinalRadar ?? false}
              />
            </div>
          ) : !cargandoComp ? (
            <p className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950 px-3 py-2.5 font-mono text-[10px] tracking-[0.08em] text-zinc-500">
              Sin evaluación de cabina ni datos suficientes para proyectar el radar.
            </p>
          ) : null}

          <ul className="space-y-1.5">
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

          {(evaluacion?.instructor_evaluador ||
            (evaluacion?.observaciones_rapidas &&
              evaluacion.observaciones_rapidas.length > 0) ||
            evaluacion?.observaciones_detalle) && (
            <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[10px] text-zinc-300">
              {evaluacion.instructor_evaluador && (
                <p className="text-[9px] tracking-[0.12em] text-zinc-500">
                  INSTRUCTOR: {evaluacion.instructor_evaluador}
                </p>
              )}
              {evaluacion.observaciones_rapidas &&
                evaluacion.observaciones_rapidas.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {evaluacion.observaciones_rapidas.map((obs) => (
                      <span
                        key={obs}
                        className="rounded-sm border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[9px] text-zinc-300"
                      >
                        {obs}
                      </span>
                    ))}
                  </div>
                )}
              {evaluacion.observaciones_detalle && (
                <p className="mt-1.5 leading-relaxed text-zinc-400">
                  {evaluacion.observaciones_detalle}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Tarjeta de Telemetría Física TITAN ─────────────── */}
        <section aria-label="Telemetría Física TITAN" className="space-y-3">
          <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
            TELEMETRÍA FÍSICA TITAN · V1 / V2
          </p>

          {cargandoComp && !evaluacion?.telemetria.tiene_datos ? (
            <p className="font-mono text-[10px] tracking-[0.1em] text-zinc-600">
              CARGANDO TELEMETRÍA TITAN…
            </p>
          ) : !tieneTelemetriaTitan ? (
            <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-900/40 px-3 py-3">
              <p className="font-mono text-[11px] font-semibold tracking-[0.08em] text-zinc-300">
                Sin telemetría de simulador procesada
              </p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed tracking-[0.06em] text-zinc-500">
                Aún no ingresaron reportes PDF de TITAN para este postulante. El
                radar pedagógico de cabina permanece operativo de forma independiente.
              </p>
            </div>
          ) : (
            <>
              {/* Pestañas V1 / V2 con badge ★ Mejor Diagnóstico */}
              {comparativa && (comparativa.v1 || comparativa.v2) && (
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
              )}

              {/* Métricas físicas TITAN */}
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <Metrica
                  etiqueta="SCORE TITAN"
                  valor={formatoNumeroSeguro(
                    intentoActivo?.scorePuntos ??
                      evaluacion?.telemetria.score_puntos ??
                      null,
                    ' pts'
                  )}
                />
                <Metrica
                  etiqueta="TIEMPO VUELTA"
                  valor={formatoSegundos(
                    intentoActivo?.tiempoVueltaSeg ??
                      evaluacion?.telemetria.tiempo_vuelta_seg ??
                      null
                  )}
                />
                <Metrica
                  etiqueta="COLISIONES REALES"
                  valor={formatoNumeroSeguro(
                    intentoActivo?.colisiones ??
                      evaluacion?.telemetria.colisiones ??
                      null,
                    '',
                    0
                  )}
                />
                <Metrica
                  etiqueta="DESCARTADAS (PISO)"
                  valor={formatoNumeroSeguro(
                    intentoActivo?.colisionesDescartadas ??
                      evaluacion?.telemetria.colisiones_descartadas ??
                      null,
                    '',
                    0
                  )}
                />
                <Metrica
                  etiqueta="SERRUCHO"
                  valor={formatoNumeroSeguro(
                    intentoActivo?.indiceSerrucho ??
                      evaluacion?.telemetria.indice_serrucho ??
                      null,
                    '',
                    3
                  )}
                />
                <Metrica
                  etiqueta="VOLANTAZOS"
                  valor={formatoNumeroSeguro(
                    intentoActivo?.volantazosExtremos ??
                      evaluacion?.telemetria.volantazos_extremos ??
                      null,
                    '',
                    0
                  )}
                />
              </div>

              {/* Deltas de mejora V1 → V2 */}
              {comparativa?.deltaDiagnostico && (
                <div className="rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[9px] tracking-[0.14em] text-zinc-500">
                      DELTAS DE MEJORA · V1 → V2
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
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <DeltaChip
                      etiqueta="Δ SCORE"
                      valor={comparativa.deltaDiagnostico.deltaScore}
                      unidad=" pts"
                      sentido="mayor_mejor"
                    />
                    <DeltaChip
                      etiqueta="Δ TIEMPO"
                      valor={comparativa.deltaDiagnostico.deltaTiempoSeg}
                      unidad=" s"
                      sentido="menor_mejor"
                    />
                    <DeltaChip
                      etiqueta="Δ COLISIONES"
                      valor={comparativa.deltaDiagnostico.deltaColisiones}
                      sentido="menor_mejor"
                    />
                  </div>
                </div>
              )}

              {/* Slot de Prueba Final TITAN */}
              {comparativa?.pruebaFinal ? (
                <div className="rounded-sm border border-cyan-500/40 bg-cyan-500/5 px-3 py-2">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-cyan-300">
                    EVALUACIÓN FINAL TITAN · REALIZADA
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    <Metrica
                      etiqueta="SCORE FINAL"
                      valor={formatoNumeroSeguro(
                        comparativa.pruebaFinal.scorePuntos,
                        ' pts'
                      )}
                    />
                    <Metrica
                      etiqueta="TIEMPO"
                      valor={formatoSegundos(comparativa.pruebaFinal.tiempoVueltaSeg)}
                    />
                    <Metrica
                      etiqueta="COLISIONES"
                      valor={formatoNumeroSeguro(
                        comparativa.pruebaFinal.colisiones,
                        '',
                        0
                      )}
                    />
                    <Metrica
                      etiqueta="DESCARTADAS"
                      valor={formatoNumeroSeguro(
                        comparativa.pruebaFinal.colisionesDescartadas,
                        '',
                        0
                      )}
                    />
                  </div>
                  {comparativa.deltaFinal && (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        <DeltaChip
                          etiqueta="Δ SCORE FINAL"
                          valor={comparativa.deltaFinal.deltaScore}
                          unidad=" pts"
                          sentido="mayor_mejor"
                        />
                        <DeltaChip
                          etiqueta="Δ TIEMPO FINAL"
                          valor={comparativa.deltaFinal.deltaTiempoSeg}
                          unidad=" s"
                          sentido="menor_mejor"
                        />
                        <DeltaChip
                          etiqueta="Δ COLIS. FINAL"
                          valor={comparativa.deltaFinal.deltaColisiones}
                          sentido="menor_mejor"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-sm bg-zinc-800 px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] text-zinc-300">
                          MEJORA TOTAL:{' '}
                          {Number.isFinite(comparativa.deltaFinal.mejoraTotalPorcentaje)
                            ? `${
                                comparativa.deltaFinal.mejoraTotalPorcentaje > 0 ? '+' : ''
                              }${comparativa.deltaFinal.mejoraTotalPorcentaje}%`
                            : '—'}
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
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-sm border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-3">
                  <p className="font-mono text-[10px] leading-relaxed tracking-[0.1em] text-zinc-500">
                    EVALUACIÓN FINAL TITAN: PENDIENTE DE REALIZACIÓN AL COMPLETAR LAS 6
                    HS DE SIMULADOR
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Pipeline Titán .json + Motor IA Gemini 2.5 Flash ─ */}
        <section
          aria-label="Pipeline Titán e Informe IA para Empleo"
          className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-950/90 p-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-zinc-400">
              <Sparkles size={13} strokeWidth={1.75} className="text-emerald-400" aria-hidden />
              PIPELINE TITÁN · REPORTE .JSON &amp; IA EMPLEO
            </p>
            {archivoActivoNombre && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[9px] text-zinc-300">
                <FileJson size={11} strokeWidth={1.75} aria-hidden />
                {archivoActivoNombre}
              </span>
            )}
          </div>

          <input
            ref={inputArchivoRef}
            id="subir-telemetria-json"
            type="file"
            accept=".json,application/json"
            onChange={manejarSeleccionArchivo}
            className="sr-only"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrandoJson(true);
            }}
            onDragLeave={() => setArrastrandoJson(false)}
            onDrop={manejarDropJson}
            className={`rounded-sm border border-dashed px-3 py-3.5 text-center transition-colors ${
              arrastrandoJson
                ? 'border-emerald-400 bg-emerald-950/25'
                : 'border-zinc-700 bg-zinc-900/50'
            }`}
          >
            <Upload
              size={18}
              strokeWidth={1.75}
              className="mx-auto text-zinc-400"
              aria-hidden
            />
            <p className="mt-1.5 font-mono text-[10.5px] tracking-[0.08em] text-zinc-300">
              Arrastrá el reporte <span className="text-emerald-400">.json</span> del simulador aquí
            </p>
            <p className="mt-0.5 font-mono text-[9.5px] tracking-[0.06em] text-zinc-500">
              Depuración automática del bug suelo (-2), métricas de volante/frenos e informe Gemini 2.5 Flash.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => inputArchivoRef.current?.click()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-sm border border-zinc-600 bg-zinc-900 px-3 font-mono text-[10px] font-semibold tracking-[0.12em] text-zinc-100 transition-colors hover:border-white hover:text-white focus-visible:outline-1 focus-visible:outline-white"
              >
                <FileJson size={13} strokeWidth={1.75} aria-hidden />
                {metricasActivas ? 'REEMPLAZAR ARCHIVO .JSON' : 'SELECCIONAR ARCHIVO .JSON'}
              </button>
              {metricasActivas && (
                <button
                  type="button"
                  disabled={analizandoIA}
                  onClick={() => void ejecutarAnalisisIA()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-sm border border-emerald-500 bg-emerald-500 px-3 font-mono text-[10px] font-semibold tracking-[0.12em] text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:outline-1 focus-visible:outline-white"
                >
                  {analizandoIA ? (
                    <>
                      <Loader2 size={13} strokeWidth={2} className="animate-spin" aria-hidden />
                      ANALIZANDO CON IA…
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} strokeWidth={2} aria-hidden />
                      GENERAR INFORME IA
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {errorJson && (
            <p
              role="alert"
              className="rounded-sm border border-red-500/50 bg-red-950/35 px-2.5 py-2 font-mono text-[10px] text-red-300"
            >
              {errorJson}
            </p>
          )}

          {errorIA && (
            <p
              role="alert"
              className="rounded-sm border border-red-500/50 bg-red-950/35 px-2.5 py-2 font-mono text-[10px] text-red-300"
            >
              {errorIA}
            </p>
          )}

          {metricasActivas && (
            <div className="space-y-2 rounded-sm border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[9.5px] tracking-[0.12em] text-zinc-400">
                  MÉTRICAS PARSEADAS{metricasActivas.exerciseName ? ` · ${metricasActivas.exerciseName}` : ''}
                </p>
                {metricasActivas.alertaFalsoPositivoSuelo && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/50 bg-amber-950/40 px-2 py-0.5 font-mono text-[9px] font-semibold text-amber-300">
                    <CheckCircle2 size={11} strokeWidth={2} aria-hidden />
                    {metricasActivas.colisionesDescartadas} ARTEFACTO(S) SUELO -2 DEPURADOS
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Metrica
                  etiqueta="SCORE"
                  valor={formatoNumeroSeguro(metricasActivas.scorePuntos, ' pts')}
                />
                <Metrica
                  etiqueta="DURACIÓN"
                  valor={formatoSegundos(metricasActivas.tiempoDuracionSeg)}
                />
                <Metrica
                  etiqueta="COLIS. REALES"
                  valor={String(metricasActivas.colisionesReales)}
                />
                <Metrica
                  etiqueta="SERRUCHO"
                  valor={formatoNumeroSeguro(metricasActivas.indiceSerrucho, '', 3)}
                />
                <Metrica
                  etiqueta="VOLANTAZOS"
                  valor={formatoNumeroSeguro(metricasActivas.volantazosExtremos, '', 0)}
                />
                <Metrica
                  etiqueta="FRENADAS PÁNICO"
                  valor={formatoNumeroSeguro(metricasActivas.frenadasPanico, '', 0)}
                />
                <Metrica
                  etiqueta="VEL. MÁXIMA"
                  valor={formatoNumeroSeguro(metricasActivas.velocidadMaxKmh, ' km/h', 1)}
                />
                <Metrica
                  etiqueta="DESCARTADAS -2"
                  valor={String(metricasActivas.colisionesDescartadas)}
                />
              </div>
            </div>
          )}

          {avisoPersistenciaIA && (
            <p
              role="status"
              className="rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-[9.5px] text-zinc-400"
            >
              {avisoPersistenciaIA}
            </p>
          )}

          {informeActivo ? (
            <div className="space-y-2.5 rounded-sm border border-emerald-500/35 bg-zinc-900/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                <span className="font-mono text-[9.5px] tracking-[0.12em] text-zinc-400">
                  {informeActivo.origen === 'GEMINI_2_5_FLASH'
                    ? 'MOTOR: GEMINI 2.5 FLASH'
                    : 'MOTOR: FALLBACK HEURÍSTICO'}
                </span>
                <span
                  className={`rounded-sm px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.1em] ${
                    BADGE_DICTAMEN_IA[informeActivo.dictamenSugerido].clase
                  }`}
                >
                  {BADGE_DICTAMEN_IA[informeActivo.dictamenSugerido].etiqueta}
                </span>
              </div>

              {(informeActivo.banderaFalsoPositivoSuelo ||
                informeActivo.banderaFalsoNegativoRiesgoOculto) && (
                <div className="flex flex-wrap gap-1.5">
                  {informeActivo.banderaFalsoPositivoSuelo && (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-950/35 px-2 py-0.5 font-mono text-[9px] text-emerald-300">
                      <CheckCircle2 size={11} strokeWidth={2} aria-hidden />
                      ANTIFALSO POSITIVO · SUELO -2 IGNORADO
                    </span>
                  )}
                  {informeActivo.banderaFalsoNegativoRiesgoOculto && (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/50 bg-amber-950/40 px-2 py-0.5 font-mono text-[9px] text-amber-300">
                      <ShieldAlert size={11} strokeWidth={2} aria-hidden />
                      ALERTA ANTIFALSO NEGATIVO · RIESGO EN TELEMETRÍA
                    </span>
                  )}
                </div>
              )}

              <ol className="space-y-2">
                {informeActivo.puntos.map((punto) => (
                  <li
                    key={punto.titulo}
                    className="rounded-sm border border-zinc-800 bg-zinc-950 px-2.5 py-2"
                  >
                    <p className="font-mono text-[9.5px] font-semibold tracking-[0.12em] text-emerald-300">
                      {punto.titulo}
                    </p>
                    <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-zinc-200">
                      {punto.detalle}
                    </p>
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="font-mono text-[9px] text-zinc-500">
                  {informeActivo.modelo} ·{' '}
                  {Number.isFinite(Date.parse(informeActivo.generadoEn))
                    ? new Date(informeActivo.generadoEn).toLocaleString('es-AR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : informeActivo.generadoEn}
                </span>
                <button
                  type="button"
                  onClick={volcarRecomendacionANotas}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-zinc-700 px-2.5 font-mono text-[9.5px] tracking-[0.1em] text-zinc-300 transition-colors hover:border-white hover:text-white focus-visible:outline-1 focus-visible:outline-white"
                >
                  <ClipboardCopy size={11} strokeWidth={1.75} aria-hidden />
                  COPIAR PUNTO 3 A NOTAS
                </button>
              </div>
            </div>
          ) : metricasActivas ? (
            <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-[10px] text-amber-300">
              <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0" aria-hidden />
              <span>
                Reporte cargado. Pulsá &quot;GENERAR INFORME IA&quot; para emitir la síntesis de 3 puntos.
              </span>
            </div>
          ) : null}
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
