'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Award,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  FileJson,
  FileText,
  Loader2,
  Printer,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  actualizarAsistenciaSesionAction,
  analizarTelemetriaPostulanteAction,
  asignarPostulanteFranja,
  darDeBajaPostulante,
  guardarDecisionInstructorAction,
  guardarEvaluacionFinalEgresoAction,
  guardarNotasEmpleo,
  guardarPracticaRealAction,
  obtenerComparativaProgreso,
  obtenerLegajo360PostulanteAction,
} from '@/services/empleo';
import {
  calcularCargaHorariaOperador,
  resolverParametrosHoras,
} from '@/lib/horas-capacitacion';
import {
  clasificarPerfilOperador,
  MAX_BYTES_REPORTE_JSON,
  parsearReporteSimulador,
  type MetricasSimulador,
  type PerfilOperador,
} from '@/lib/telemetria/parser-simulador';
import {
  MAX_BYTES_REPORTE_PDF,
  parsearPdfSimuladorBrowser,
} from '@/lib/telemetria/parser-pdf-simulador';
import type { InformeEmpleoIA } from '@/lib/ia/generador-informe';
import type { EstadoEgreso, PerfilLaboral } from '@/types/cohorte-v2';
import type {
  CohorteActiva,
  ComparativaProgreso,
  DecisionInstructorT0,
  DecisionInstructorTerreno,
  EstadoAsistenciaUI,
  FranjaCabina,
  Legajo360Postulante,
  MetricasIntento,
  PostulanteFila,
  PuntoRadar,
  ResultadoPracticaReal,
  SesionPracticaItem,
} from '@/types/empleo';
import Sheet from './Sheet';
import RadarCuatroEjes from './RadarCuatroEjes';
import Legajo360Imprimible from './Legajo360Imprimible';

/**
 * Drawer lateral de la ficha técnica 360° del postulante: datos de contacto,
 * nivel de asistencia, 4 ejes técnicos, telemetría Titán + IA, asistencias en
 * simulador, práctica real en terreno (.pdf), egreso y exportación PDF 360°.
 */

interface Props {
  postulante: PostulanteFila | null;
  franjas: FranjaCabina[];
  cohorteId?: string | null;
  cohorte?: CohorteActiva | null;
  enfocarTitan?: boolean;
  enfocarSignal?: number;
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

const BADGE_PERFIL_OPERADOR: Record<
  PerfilOperador,
  { etiqueta: string; clase: string; borde: string }
> = {
  EFICIENTE: {
    etiqueta: 'EFICIENTE',
    clase: 'bg-emerald-500 text-emerald-950',
    borde: 'border-emerald-500/45 bg-emerald-950/25',
  },
  APURADO: {
    etiqueta: 'APURADO',
    clase: 'bg-amber-400 text-amber-950',
    borde: 'border-amber-500/45 bg-amber-950/20',
  },
  INEFICIENTE: {
    etiqueta: 'INEFICIENTE',
    clase: 'bg-cyan-400 text-cyan-950',
    borde: 'border-cyan-500/45 bg-cyan-950/20',
  },
  SIN_NOCION_ESPACIO: {
    etiqueta: 'SIN NOCIÓN DEL ESPACIO',
    clase: 'bg-orange-500 text-orange-950',
    borde: 'border-orange-500/45 bg-orange-950/20',
  },
  NOVATO: {
    etiqueta: 'NOVATO',
    clase: 'bg-red-500 text-red-950',
    borde: 'border-red-500/45 bg-red-950/25',
  },
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

export default function DrawerPostulante({
  postulante,
  franjas,
  cohorteId,
  cohorte = null,
  enfocarTitan = false,
  enfocarSignal = 0,
  onCerrar,
}: Props) {
  const router = useRouter();
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

  // Legajo 360°: Sesiones, Práctica Real en Terreno (.pdf) y Egreso.
  const [legajo360, setLegajo360] = useState<Legajo360Postulante | null>(null);
  const [cargandoLegajo, setCargandoLegajo] = useState(false);
  const [msgLegajo, setMsgLegajo] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null
  );
  const [pracFecha, setPracFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [pracLugar, setPracLugar] = useState('');
  const [pracMaquina, setPracMaquina] = useState('Autoelevador Eléctrico / Combustión');
  const [pracInstructor, setPracInstructor] = useState('');
  const [pracResultado, setPracResultado] = useState<ResultadoPracticaReal>('aprobado');
  const [pracObs, setPracObs] = useState('');
  const [pracAsistencia, setPracAsistencia] = useState<'PRESENTE' | 'AUSENTE'>('PRESENTE');
  const [pracHorasBase, setPracHorasBase] = useState(1.5);
  const [pracHorasExtra, setPracHorasExtra] = useState(0);
  const [pracRequiereExtra, setPracRequiereExtra] = useState(false);
  const [pracHorasSugeridas, setPracHorasSugeridas] = useState(2);
  const [pracLat, setPracLat] = useState<string>('');
  const [pracMan, setPracMan] = useState<string>('');
  const [pracMas, setPracMas] = useState<string>('');
  const [pracCon, setPracCon] = useState<string>('');
  const [pracNivelAsist, setPracNivelAsist] = useState<string>('AUTONOMO');
  const [pracDecision, setPracDecision] =
    useState<DecisionInstructorTerreno>('APROBADO_EMPRESAS');

  const [decisionT0, setDecisionT0] = useState<DecisionInstructorT0>('APROBADO_A_CAPACITACION');
  const [horasRefuerzoSim, setHorasRefuerzoSim] = useState(0);
  const [asistioTeoria, setAsistioTeoria] = useState(true);
  const [obsDecisionT0, setObsDecisionT0] = useState('');
  const [guardandoDecision, startDecisionTransition] = useTransition();

  const [egEstado, setEgEstado] = useState<EstadoEgreso>('INCOMPLETO');
  const [egTerrenoAprobado, setEgTerrenoAprobado] = useState<'pendiente' | 'si' | 'no'>(
    'pendiente'
  );
  const [egPerfil, setEgPerfil] = useState<PerfilLaboral>('ESTANDAR');
  const [egObs, setEgObs] = useState('');
  const [guardandoPrac, startPracTransition] = useTransition();
  const [guardandoEg, startEgTransition] = useTransition();
  const [guardandoAsisId, setGuardandoAsisId] = useState<string | null>(null);

  // Pipeline Titán .json + Motor IA Gemini 2.5 Flash.
  const titanSectionRef = useRef<HTMLElement | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);
  const [arrastrandoJson, setArrastrandoJson] = useState(false);
  const [archivoJsonNombre, setArchivoJsonNombre] = useState<string | null>(null);
  const [metricasJsonLocal, setMetricasJsonLocal] = useState<MetricasSimulador | null>(
    null
  );
  const [errorJson, setErrorJson] = useState<string | null>(null);
  const [procesandoArchivo, setProcesandoArchivo] = useState(false);
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

  // Reinicia el estado efímero de carga PDF/JSON / informe al cambiar de postulante.
  useEffect(() => {
    setArrastrandoJson(false);
    setArchivoJsonNombre(null);
    setMetricasJsonLocal(null);
    setErrorJson(null);
    setProcesandoArchivo(false);
    setInformeLocal(null);
    setAvisoPersistenciaIA(null);
    setErrorIA(null);
    setAnalizandoIA(false);
    if (inputArchivoRef.current) {
      inputArchivoRef.current.value = '';
    }
  }, [postulante?.inscripcion_id]);

  // Desplaza directamente hacia la tarjeta Proyecto Titán cuando se abre desde `🛰️ Titán .JSON`.
  useEffect(() => {
    if (!postulante || !enfocarTitan) return;
    const timer = window.setTimeout(() => {
      titanSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [postulante, enfocarTitan, enfocarSignal]);

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
    obtenerComparativaProgreso(pid, cohorteId)
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
  }, [
    postulante?.postulante_id,
    postulante?.estado,
    cohorteId,
    cohorte?.configuracion_cursado,
  ]);

  // Carga el Legajo 360° (sesiones, práctica real en terreno y egreso).
  useEffect(() => {
    const pid = postulante?.postulante_id;
    const cid = cohorteId ?? '';
    setMsgLegajo(null);
    if (!pid || !cid) {
      setLegajo360(null);
      return;
    }
    let vivo = true;
    setCargandoLegajo(true);
    obtenerLegajo360PostulanteAction(pid, cid)
      .then((res) => {
        if (!vivo) return;
        if (res.ok) {
          setLegajo360(res.data);
          const paramsHoras = resolverParametrosHoras(cohorte?.configuracion_cursado);
          if (res.data.practicaReal) {
            setPracFecha(res.data.practicaReal.fecha_practica);
            setPracLugar(res.data.practicaReal.lugar_predio ?? '');
            setPracMaquina(
              res.data.practicaReal.maquina_utilizada ??
                'Autoelevador Eléctrico / Combustión'
            );
            setPracInstructor(res.data.practicaReal.instructor_patio ?? '');
            setPracResultado(res.data.practicaReal.resultado);
            setPracObs(res.data.practicaReal.observaciones_terreno ?? '');
            setPracAsistencia(
              res.data.practicaReal.asistencia_terreno === 'AUSENTE' ? 'AUSENTE' : 'PRESENTE'
            );
            setPracHorasBase(
              res.data.practicaReal.horas_practica_terreno ?? paramsHoras.horas_base_practica_real
            );
            setPracHorasExtra(res.data.practicaReal.horas_extra_terreno ?? 0);
            setPracRequiereExtra(res.data.practicaReal.requiere_horas_extra === true);
            setPracHorasSugeridas(res.data.practicaReal.horas_extra_sugeridas ?? 2);
            setPracLat(
              res.data.practicaReal.puntaje_lateralidad !== null &&
                res.data.practicaReal.puntaje_lateralidad !== undefined
                ? String(res.data.practicaReal.puntaje_lateralidad)
                : ''
            );
            setPracMan(
              res.data.practicaReal.puntaje_tacto_mandos !== null &&
                res.data.practicaReal.puntaje_tacto_mandos !== undefined
                ? String(res.data.practicaReal.puntaje_tacto_mandos)
                : ''
            );
            setPracMas(
              res.data.practicaReal.puntaje_mastil !== null &&
                res.data.practicaReal.puntaje_mastil !== undefined
                ? String(res.data.practicaReal.puntaje_mastil)
                : ''
            );
            setPracCon(
              res.data.practicaReal.puntaje_control_receptividad !== null &&
                res.data.practicaReal.puntaje_control_receptividad !== undefined
                ? String(res.data.practicaReal.puntaje_control_receptividad)
                : ''
            );
            setPracNivelAsist(res.data.practicaReal.nivel_asistencia ?? 'AUTONOMO');
            setPracDecision(
              res.data.practicaReal.decision_instructor_terreno ??
                (res.data.practicaReal.resultado === 'aprobado'
                  ? 'APROBADO_EMPRESAS'
                  : res.data.practicaReal.resultado === 'requiere_refuerzo'
                    ? 'REQUIERE_MAS_HORAS'
                    : 'NO_APTO')
            );
          } else {
            setPracFecha(new Date().toISOString().split('T')[0]);
            setPracLugar('');
            setPracMaquina('Autoelevador Eléctrico / Combustión');
            setPracInstructor('');
            setPracResultado('aprobado');
            setPracObs('');
            setPracAsistencia('PRESENTE');
            setPracHorasBase(paramsHoras.horas_base_practica_real);
            setPracHorasExtra(0);
            setPracRequiereExtra(false);
            setPracHorasSugeridas(2);
            setPracLat('');
            setPracMan('');
            setPracMas('');
            setPracCon('');
            setPracNivelAsist('AUTONOMO');
            setPracDecision('APROBADO_EMPRESAS');
          }
          if (res.data.decisionInstructor) {
            setDecisionT0(res.data.decisionInstructor.decision_t0 ?? 'APROBADO_A_CAPACITACION');
            setHorasRefuerzoSim(res.data.decisionInstructor.horas_refuerzo_simulador ?? 0);
            setAsistioTeoria(res.data.decisionInstructor.asistio_teoria !== false);
            setObsDecisionT0(res.data.decisionInstructor.observacion_decision_t0 ?? '');
          } else {
            setDecisionT0(
              postulante?.estado === 'DESCARTADO' ? 'RECHAZADO' : 'APROBADO_A_CAPACITACION'
            );
            setHorasRefuerzoSim(0);
            setAsistioTeoria(postulante?.estado !== 'DESCARTADO');
            setObsDecisionT0('');
          }
          if (res.data.egreso) {
            setEgEstado(res.data.egreso.estado_egreso);
            setEgTerrenoAprobado(
              res.data.egreso.paso_a_terreno_aprobado === true
                ? 'si'
                : res.data.egreso.paso_a_terreno_aprobado === false
                  ? 'no'
                  : 'pendiente'
            );
            setEgPerfil(res.data.egreso.recomendacion_laboral);
            setEgObs(res.data.egreso.observaciones_egreso ?? '');
          } else {
            setEgEstado('INCOMPLETO');
            setEgTerrenoAprobado('pendiente');
            setEgPerfil('ESTANDAR');
            setEgObs('');
          }
        } else {
          setLegajo360(null);
        }
      })
      .catch(() => {
        if (vivo) setLegajo360(null);
      })
      .finally(() => {
        if (vivo) setCargandoLegajo(false);
      });
    return () => {
      vivo = false;
    };
  }, [
    postulante?.postulante_id,
    postulante?.estado,
    cohorteId,
    cohorte?.configuracion_cursado,
  ]);

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
  const informeActivo =
    informeLocal ??
    (metricasJsonLocal ? null : (evaluacion?.informe_ia ?? null));

  const clasificacionOperador = metricasActivas
    ? clasificarPerfilOperador(metricasActivas, {
        puntajeLateralidad: evaluacion?.puntaje_lateralidad,
        puntajeTactoMandos: evaluacion?.puntaje_tacto_mandos,
        puntajeMastil: evaluacion?.puntaje_mastil,
        puntajeControlReceptividad: evaluacion?.puntaje_control_receptividad,
        scoreCabina: evaluacion?.score_tablet,
        nivelAsistencia: evaluacion?.nivel_asistencia,
        asistenciaCabinaLegacy: evaluacion?.asistencia_cabina,
        hardFail: evaluacion?.hard_fail === true,
      })
    : null;

  const perfilOperadorActivo: PerfilOperador | null =
    informeActivo?.perfilOperador ??
    clasificacionOperador?.perfilOperador ??
    evaluacion?.perfil_operador ??
    null;
  const horasRecomendadasActivas: number | null =
    informeActivo?.horasRecomendadas ??
    clasificacionOperador?.horasRecomendadas ??
    evaluacion?.horas_recomendadas ??
    null;
  const rangoHorasActivo: string | null =
    informeActivo?.rangoHorasTexto ??
    clasificacionOperador?.rangoHorasTexto ??
    (horasRecomendadasActivas !== null ? `${horasRecomendadasActivas} hs` : null);
  const modulosRecomendadosActivos: string[] =
    informeActivo?.modulosRecomendados ??
    clasificacionOperador?.modulosRecomendados ??
    evaluacion?.modulos_recomendados ??
    [];

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

  async function procesarArchivoTelemetria(archivo: File) {
    if (!postulante || procesandoArchivo) return;
    setErrorJson(null);
    setErrorIA(null);
    setAvisoPersistenciaIA(null);

    const nombre = archivo.name.trim() || 'telemetria';
    const nombreLower = nombre.toLowerCase();
    const esPdf =
      nombreLower.endsWith('.pdf') || archivo.type === 'application/pdf';
    const esJson =
      nombreLower.endsWith('.json') ||
      archivo.type === 'application/json' ||
      archivo.type === 'text/json';

    if (!esPdf && !esJson) {
      setErrorJson(
        'Solo se admiten archivos de telemetría del simulador en formato .pdf o .json.'
      );
      return;
    }
    if (archivo.size === 0) {
      setErrorJson('El archivo seleccionado está vacío.');
      return;
    }
    if (esJson && archivo.size > MAX_BYTES_REPORTE_JSON) {
      setErrorJson('El archivo .json excede el tamaño máximo permitido (2 MB).');
      return;
    }
    if (esPdf && archivo.size > MAX_BYTES_REPORTE_PDF) {
      setErrorJson('El archivo .pdf excede el tamaño máximo permitido (20 MB).');
      return;
    }

    setProcesandoArchivo(true);
    try {
      const metricas = esPdf
        ? await parsearPdfSimuladorBrowser(archivo, {
            nombrePostulante: postulante.nombre_completo,
          })
        : parsearReporteSimulador(await archivo.text(), {
            nombrePostulante: postulante.nombre_completo,
          });
      setArchivoJsonNombre(nombre);
      setMetricasJsonLocal(metricas);
      setInformeLocal(null);
    } catch (err) {
      setErrorJson(
        err instanceof Error
          ? err.message
          : 'No se pudo procesar el reporte de telemetría (.pdf / .json).'
      );
    } finally {
      setProcesandoArchivo(false);
    }
  }

  function manejarSeleccionArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (archivo) {
      void procesarArchivoTelemetria(archivo);
    }
    e.target.value = '';
  }

  function manejarDropJson(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setArrastrandoJson(false);
    const archivo = e.dataTransfer.files?.[0];
    if (archivo) {
      void procesarArchivoTelemetria(archivo);
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
        cohorte_id: cohorteId ?? null,
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
          ? 'Informe IA, perfil de operador y métricas guardados en evaluacion_diagnostico.'
          : 'Informe generado en pantalla (no se pudo persistir en la base de datos).'
      );
      if (res.persistido) {
        router.refresh();
      }
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

  async function recargarLegajo360() {
    if (!postulante || !cohorteId) return;
    const res = await obtenerLegajo360PostulanteAction(
      postulante.postulante_id,
      cohorteId
    );
    if (res.ok) {
      setLegajo360(res.data);
    }
  }

  async function cambiarAsistenciaLegajo(
    sesion: SesionPracticaItem,
    estado: EstadoAsistenciaUI,
    fechaReprog?: string | null
  ) {
    if (!cohorteId) return;
    setMsgLegajo(null);
    setGuardandoAsisId(sesion.id);
    try {
      const res = await actualizarAsistenciaSesionAction({
        sesion_id: sesion.id,
        cohorte_id: cohorteId,
        estado_asistencia: estado,
        fecha_reprogramacion: fechaReprog ?? null,
      });
      if (!res.ok) {
        setMsgLegajo({ tipo: 'error', texto: res.error });
      } else {
        await recargarLegajo360();
        setMsgLegajo({
          tipo: 'ok',
          texto: `Asistencia de Clase #${sesion.numero_sesion} actualizada (${estado}).`,
        });
        router.refresh();
      }
    } finally {
      setGuardandoAsisId(null);
    }
  }

  function guardarDecisionSubmit() {
    if (!postulante || !cohorteId) return;
    setMsgLegajo(null);
    startDecisionTransition(async () => {
      const res = await guardarDecisionInstructorAction({
        cohorte_id: cohorteId,
        postulante_id: postulante.postulante_id,
        inscripcion_id: postulante.inscripcion_id,
        decision_t0: decisionT0,
        observacion_decision_t0: obsDecisionT0,
        horas_refuerzo_simulador: horasRefuerzoSim,
        asistio_teoria: asistioTeoria,
      });
      if (!res.ok) {
        setMsgLegajo({ tipo: 'error', texto: res.error });
        return;
      }
      setLegajo360((prev) =>
        prev
          ? { ...prev, decisionInstructor: res.decisionInstructor }
          : {
              sesiones: [],
              viernesSugeridos: [],
              practicaReal: null,
              egreso: null,
              decisionInstructor: res.decisionInstructor,
            }
      );
      setMsgLegajo({
        tipo: 'ok',
        texto: `Decisión de instructor y carga horaria actualizadas (${decisionT0}).`,
      });
      router.refresh();
    });
  }

  function guardarPracticaRealSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!postulante || !cohorteId) return;
    setMsgLegajo(null);

    const parseEje = (val: string): number | null => {
      if (val === '0' || val === '10' || val === '20') return Number(val);
      return null;
    };

    startPracTransition(async () => {
      const res = await guardarPracticaRealAction({
        cohorte_id: cohorteId,
        postulante_id: postulante.postulante_id,
        fecha_practica: pracFecha,
        lugar_predio: pracLugar,
        maquina_utilizada: pracMaquina,
        instructor_patio: pracInstructor,
        resultado: pracResultado,
        observaciones_terreno: pracObs,
        asistencia_terreno: pracAsistencia,
        horas_practica_terreno: pracHorasBase,
        horas_extra_terreno: pracHorasExtra,
        requiere_horas_extra: pracRequiereExtra,
        horas_extra_sugeridas: pracRequiereExtra ? pracHorasSugeridas : 0,
        puntaje_lateralidad: parseEje(pracLat),
        puntaje_tacto_mandos: parseEje(pracMan),
        puntaje_mastil: parseEje(pracMas),
        puntaje_control_receptividad: parseEje(pracCon),
        nivel_asistencia: pracNivelAsist,
        decision_instructor_terreno: pracDecision,
      });
      if (!res.ok) {
        setMsgLegajo({ tipo: 'error', texto: res.error });
        return;
      }
      setLegajo360((prev) =>
        prev
          ? { ...prev, practicaReal: res.practicaReal }
          : {
              sesiones: [],
              viernesSugeridos: [],
              practicaReal: res.practicaReal,
              egreso: null,
            }
      );
      setMsgLegajo({
        tipo: 'ok',
        texto: 'Evaluación en Terreno guardada correctamente (cero Storage).',
      });
      router.refresh();
    });
  }

  function guardarEgresoClick() {
    if (!postulante || !cohorteId) return;
    setMsgLegajo(null);
    startEgTransition(async () => {
      const res = await guardarEvaluacionFinalEgresoAction({
        cohorte_id: cohorteId,
        postulante_id: postulante.postulante_id,
        estado_egreso: egEstado,
        paso_a_terreno_aprobado:
          egTerrenoAprobado === 'si'
            ? true
            : egTerrenoAprobado === 'no'
              ? false
              : null,
        recomendacion_laboral: egPerfil,
        observaciones_egreso: egObs,
      });
      if (!res.ok) {
        setMsgLegajo({ tipo: 'error', texto: res.error });
        return;
      }
      setLegajo360((prev) =>
        prev
          ? { ...prev, egreso: res.egreso }
          : {
              sesiones: [],
              viernesSugeridos: [],
              practicaReal: null,
              egreso: res.egreso,
            }
      );
      setMsgLegajo({
        tipo: 'ok',
        texto: `Dictamen final de egreso guardado (${res.egreso.estado_egreso}).`,
      });
      router.refresh();
    });
  }

  function imprimirLegajo360() {
    document.body.setAttribute('data-print-mode', 'legajo');
    const limpiar = () => {
      document.body.removeAttribute('data-print-mode');
      window.removeEventListener('afterprint', limpiar);
    };
    window.addEventListener('afterprint', limpiar);
    window.print();
    window.setTimeout(limpiar, 1500);
  }

  const presentesSimulador = (legajo360?.sesiones ?? []).filter(
    (s) => s.estado_asistencia === 'PRESENTE'
  ).length;
  const totalSesionesLegajo = legajo360?.sesiones.length ?? 0;
  const cargaHoraria = calcularCargaHorariaOperador({
    config: cohorte?.configuracion_cursado,
    asistioTeoria,
    sesionesPresentes: presentesSimulador,
    tieneInstanciaCabina: Boolean(evaluacion || metricasActivas),
    horasRefuerzoSimulador: horasRefuerzoSim,
    practicaReal:
      legajo360?.practicaReal ??
      null,
    horasRecomendadasTitan: horasRecomendadasActivas ?? null,
  });

  return (
    <>
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={postulante.nombre_completo}
      subtitulo={`RANKING #${postulante.ranking_orden} · DNI ${postulante.dni} · ${ETIQUETA_TURNO[postulante.origen_turno]}`}
    >
      <div className="space-y-5">
        {/* ── Acción directa: Exportar Legajo 360° (PDF) ───────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-900/70 px-3 py-2">
          <span className="font-mono text-[10px] tracking-[0.12em] text-zinc-400">
            LEGAJO 360° ·{' '}
            {cargandoLegajo
              ? 'SINCRONIZANDO…'
              : totalSesionesLegajo > 0
                ? `${presentesSimulador}/${totalSesionesLegajo} SESIONES`
                : 'SIN DUPLA SYNC'}
          </span>
          <button
            type="button"
            onClick={imprimirLegajo360}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white bg-white px-3 font-mono text-[10px] font-semibold tracking-[0.1em] text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            <Printer size={12} aria-hidden />
            Imprimir / Exportar Legajo 360° (PDF)
          </button>
        </div>

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

        {/* ── PROYECTO TITÁN: Telemetría de Cabina (.pdf / .json) ── */}
        <section
          ref={titanSectionRef}
          aria-label="PROYECTO TITÁN: Telemetría de Cabina (.pdf / .json)"
          className={`space-y-3 rounded-sm border-2 bg-gradient-to-b from-emerald-950/30 via-zinc-950 to-zinc-950 p-3.5 shadow-[0_0_24px_rgba(16,185,129,0.08)] ${
            enfocarTitan
              ? 'border-emerald-400 ring-1 ring-emerald-400/40'
              : 'border-emerald-500/60'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-emerald-300">
                <Sparkles size={14} strokeWidth={2} className="shrink-0 text-emerald-400" aria-hidden />
                <span>PROYECTO TITÁN: Telemetría de Cabina (.pdf / .json)</span>
              </p>
              <p className="mt-0.5 font-mono text-[9.5px] tracking-[0.06em] text-zinc-400">
                Cargá reportes del simulador ETECH para depurar falsos positivos (-2) y emitir dictamen IA.
              </p>
            </div>
            <span
              className={`rounded-sm border px-2 py-0.5 font-mono text-[9px] font-semibold tracking-[0.1em] ${
                analizandoIA || procesandoArchivo
                  ? 'border-amber-500/60 bg-amber-950/40 text-amber-300'
                  : informeActivo
                    ? informeActivo.origen === 'GEMINI_2_5_FLASH'
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-cyan-500/50 bg-cyan-950/40 text-cyan-300'
                    : metricasActivas
                      ? 'border-amber-500/50 bg-amber-950/35 text-amber-300'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-400'
              }`}
            >
              {procesandoArchivo
                ? 'EXTRAYENDO TELEMETRÍA…'
                : analizandoIA
                  ? 'ANALIZANDO…'
                  : informeActivo
                    ? informeActivo.origen === 'GEMINI_2_5_FLASH'
                      ? 'IA · GEMINI 2.5 FLASH'
                      : 'IA · FALLBACK HEURÍSTICO'
                    : metricasActivas
                      ? 'REPORTE CARGADO · SIN INFORME'
                      : 'PENDIENTE (.PDF / .JSON)'}
            </span>
          </div>

          {archivoActivoNombre && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5">
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-mono text-[10px] text-zinc-200">
                {archivoActivoNombre.toLowerCase().endsWith('.pdf') ? (
                  <FileText size={12} strokeWidth={1.75} className="shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <FileJson size={12} strokeWidth={1.75} className="shrink-0 text-emerald-400" aria-hidden />
                )}
                <span className="truncate">{archivoActivoNombre}</span>
              </span>
              <span className="font-mono text-[9px] tracking-[0.1em] text-zinc-500">
                REPORTE ACTIVO
              </span>
            </div>
          )}

          <input
            ref={inputArchivoRef}
            id="subir-telemetria-json"
            type="file"
            accept=".pdf,.json,application/pdf,application/json"
            onChange={manejarSeleccionArchivo}
            className="sr-only"
          />

          <button
            type="button"
            disabled={procesandoArchivo}
            onClick={() => inputArchivoRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrandoJson(true);
            }}
            onDragLeave={() => setArrastrandoJson(false)}
            onDrop={manejarDropJson}
            className={`block w-full cursor-pointer rounded-sm border-2 border-dashed px-3 py-4 text-center transition-colors disabled:cursor-wait disabled:opacity-75 focus-visible:outline-1 focus-visible:outline-white ${
              arrastrandoJson
                ? 'border-emerald-400 bg-emerald-950/40'
                : 'border-emerald-500/45 bg-zinc-900/60 hover:border-emerald-400 hover:bg-zinc-900'
            }`}
          >
            {procesandoArchivo ? (
              <Loader2
                size={20}
                strokeWidth={1.75}
                className="mx-auto animate-spin text-emerald-400"
                aria-hidden
              />
            ) : (
              <Upload
                size={20}
                strokeWidth={1.75}
                className="mx-auto text-emerald-400"
                aria-hidden
              />
            )}
            <span className="mt-2 block font-mono text-[11px] font-semibold tracking-[0.08em] text-zinc-100">
              {procesandoArchivo ? (
                'Digitalizando curvas y eventos del PDF…'
              ) : (
                <>
                  Hacé clic o arrastrá aquí el reporte{' '}
                  <span className="text-emerald-400">.pdf</span> o{' '}
                  <span className="text-emerald-400">.json</span>
                </>
              )}
            </span>
            <span className="mt-1 block font-mono text-[9.5px] tracking-[0.06em] text-zinc-400">
              Ej: <code className="text-emerald-300">21.pdf</code> o{' '}
              <code className="text-emerald-300">Medium Load Operation_*.json</code> · Hasta 20 MB (.pdf) / 2 MB (.json)
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={procesandoArchivo}
              onClick={() => inputArchivoRef.current?.click()}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-sm border border-zinc-600 bg-zinc-900 px-3 font-mono text-[10px] font-semibold tracking-[0.1em] text-zinc-100 transition-colors hover:border-white hover:text-white disabled:cursor-wait disabled:opacity-70 focus-visible:outline-1 focus-visible:outline-white"
            >
              {procesandoArchivo ? (
                <>
                  <Loader2 size={13} strokeWidth={2} className="animate-spin" aria-hidden />
                  PROCESANDO REPORTE…
                </>
              ) : (
                <>
                  <FileText size={13} strokeWidth={1.75} aria-hidden />
                  {metricasActivas ? 'SUBIR NUEVO .PDF / .JSON' : 'SELECCIONAR .PDF / .JSON'}
                </>
              )}
            </button>
            {metricasActivas && (
              <button
                type="button"
                disabled={analizandoIA}
                onClick={() => void ejecutarAnalisisIA()}
                className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-sm border border-emerald-500 bg-emerald-500 px-3 font-mono text-[10px] font-semibold tracking-[0.1em] text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:outline-1 focus-visible:outline-white"
              >
                {analizandoIA ? (
                  <>
                    <Loader2 size={13} strokeWidth={2} className="animate-spin" aria-hidden />
                    ANALIZANDO CON IA…
                  </>
                ) : (
                  <>
                    <Sparkles size={13} strokeWidth={2} aria-hidden />
                    {informeActivo ? 'RECALCULAR INFORME IA' : 'GENERAR INFORME IA'}
                  </>
                )}
              </button>
            )}
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

          {metricasActivas ? (
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
                  etiqueta="TIEMPO"
                  valor={formatoSegundos(metricasActivas.tiempoDuracionSeg)}
                />
                <Metrica
                  etiqueta="COLISIONES"
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
                {(metricasActivas.picosAceleracion !== null ||
                  metricasActivas.porcentajeAceleradorFondo !== null) && (
                  <Metrica
                    etiqueta="ACELERADOR PICOS"
                    valor={
                      metricasActivas.picosAceleracion !== null
                        ? `${metricasActivas.picosAceleracion}${
                            metricasActivas.porcentajeAceleradorFondo !== null
                              ? ` (${metricasActivas.porcentajeAceleradorFondo}%)`
                              : ''
                          }`
                        : formatoNumeroSeguro(
                            metricasActivas.porcentajeAceleradorFondo,
                            '%',
                            1
                          )
                    }
                  />
                )}
                {(metricasActivas.porcentajeCirculacionHorquillaAlta !== null ||
                  metricasActivas.alturaMaximaHorquillaM !== null) && (
                  <Metrica
                    etiqueta="HORQUILLA ALTA"
                    valor={
                      metricasActivas.porcentajeCirculacionHorquillaAlta !== null
                        ? `${metricasActivas.porcentajeCirculacionHorquillaAlta}%`
                        : formatoNumeroSeguro(
                            metricasActivas.alturaMaximaHorquillaM,
                            ' m',
                            2
                          )
                    }
                  />
                )}
                {(metricasActivas.oscilacionesMastil !== null ||
                  metricasActivas.indiceInestabilidadTilt !== null) && (
                  <Metrica
                    etiqueta="OSCIL. MÁSTIL"
                    valor={formatoNumeroSeguro(
                      metricasActivas.oscilacionesMastil,
                      '',
                      0
                    )}
                  />
                )}
              </div>
            </div>
          ) : evaluacion?.telemetria.tiene_datos ? (
            <div className="space-y-2 rounded-sm border border-zinc-800 bg-zinc-900/50 p-2.5">
              <p className="font-mono text-[9.5px] tracking-[0.12em] text-zinc-400">
                RESUMEN HISTÓRICO TITAN SINCRONIZADO (SUBÍ UN .JSON PARA INFORME IA)
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Metrica
                  etiqueta="SCORE"
                  valor={formatoNumeroSeguro(evaluacion.telemetria.score_puntos, ' pts')}
                />
                <Metrica
                  etiqueta="TIEMPO"
                  valor={formatoSegundos(evaluacion.telemetria.tiempo_vuelta_seg)}
                />
                <Metrica
                  etiqueta="COLISIONES"
                  valor={formatoNumeroSeguro(evaluacion.telemetria.colisiones, '', 0)}
                />
                <Metrica
                  etiqueta="SERRUCHO"
                  valor={formatoNumeroSeguro(evaluacion.telemetria.indice_serrucho, '', 3)}
                />
              </div>
            </div>
          ) : null}

          {perfilOperadorActivo && (
            <div
              className={`space-y-2 rounded-sm border p-2.5 ${BADGE_PERFIL_OPERADOR[perfilOperadorActivo].borde}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[9.5px] tracking-[0.12em] text-zinc-300">
                  PERFIL DE OPERADOR &amp; RECETA FORMATIVA
                </span>
                <span
                  className={`rounded-sm px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.1em] ${BADGE_PERFIL_OPERADOR[perfilOperadorActivo].clase}`}
                >
                  {BADGE_PERFIL_OPERADOR[perfilOperadorActivo].etiqueta}
                </span>
              </div>
              {rangoHorasActivo && (
                <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-100">
                  <Clock size={12} strokeWidth={2} className="shrink-0 text-emerald-400" aria-hidden />
                  <span>
                    Carga recomendada: <strong>{rangoHorasActivo}</strong>
                    {horasRecomendadasActivas !== null
                      ? ` (${horasRecomendadasActivas} hs sugeridas)`
                      : ''}
                  </span>
                </p>
              )}
              {modulosRecomendadosActivos.length > 0 && (
                <ul className="space-y-1 border-t border-zinc-800/80 pt-2">
                  {modulosRecomendadosActivos.map((modulo) => (
                    <li
                      key={modulo}
                      className="font-mono text-[9.5px] leading-relaxed text-zinc-300"
                    >
                      • {modulo}
                    </li>
                  ))}
                </ul>
              )}
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

          {/* ── Analítica Predictiva B2B (Cuidado Mecánico, Plasticidad y Percentiles) ── */}
          {postulante.analitica && (postulante.analitica.cuidadoMecanico || postulante.analitica.plasticidad) && (
            <div className="space-y-2 rounded-sm border border-cyan-500/35 bg-cyan-950/15 p-3 font-mono">
              <p className="text-[9.5px] font-semibold tracking-[0.14em] text-cyan-300">
                CIENCIA DE DATOS PREDICTIVA · BENCHMARKING B2B (COSTO $0)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-2">
                  <p className="text-[8.5px] text-zinc-500">CUIDADO MECÁNICO</p>
                  <p className="mt-0.5 text-base font-bold text-white">
                    {postulante.analitica.cuidadoMecanico
                      ? `${postulante.analitica.cuidadoMecanico.indiceCuidadoMecanico}%`
                      : '—'}
                  </p>
                  <p className="text-[9px] text-emerald-300">
                    {postulante.analitica.cuidadoMecanico?.categoria ?? 'SIN DATOS'}
                  </p>
                </div>

                <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-2">
                  <p className="text-[8.5px] text-zinc-500">PLASTICIDAD (V1→V2)</p>
                  <p className="mt-0.5 text-base font-bold text-white">
                    {postulante.analitica.plasticidad
                      ? `${postulante.analitica.plasticidad.indicePlasticidad}/100`
                      : '1 INTENTO'}
                  </p>
                  <p className="truncate text-[8.5px] text-sky-300">
                    {postulante.analitica.plasticidad?.categoria ?? 'PENDIENTE V2/T1'}
                  </p>
                </div>

                <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-2">
                  <p className="text-[8.5px] text-zinc-500">PERCENTILES COHORTE</p>
                  <p className="mt-1 text-[10px] leading-snug text-zinc-200">
                    Score: <strong>P{postulante.analitica.percentilScore ?? '—'}</strong> · Vel:{' '}
                    <strong>P{postulante.analitica.percentilVelocidad ?? '—'}</strong> · Cuid:{' '}
                    <strong>P{postulante.analitica.percentilCuidadoMecanico ?? '—'}</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          {informeActivo ? (
            <div className="space-y-2.5 rounded-sm border border-emerald-500/35 bg-zinc-900/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                <span className="font-mono text-[9.5px] tracking-[0.12em] text-zinc-300">
                  {informeActivo.origen === 'GEMINI_2_5_FLASH'
                    ? 'MOTOR ACTIVO: GEMINI 2.5 FLASH'
                    : 'MOTOR ACTIVO: FALLBACK HEURÍSTICO'}
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

              {informeActivo.evaluacionLongitudinal && (
                <div className="space-y-1.5 border-t border-zinc-800 pt-2.5 font-mono">
                  <p className="text-[9.5px] font-semibold tracking-[0.12em] text-cyan-300">
                    EVALUACIÓN LONGITUDINAL INTEGRADA (4 ETAPAS)
                  </p>
                  <div className="grid gap-1.5 text-[10px] text-zinc-300">
                    <p>
                      <strong className="text-white">Etapa 1 (Diag. T0):</strong>{' '}
                      {informeActivo.evaluacionLongitudinal.etapa1DiagnosticoT0}
                    </p>
                    <p>
                      <strong className="text-white">Etapa 2 (Capacitación):</strong>{' '}
                      {informeActivo.evaluacionLongitudinal.etapa2CapacitacionSimulador}
                    </p>
                    <p>
                      <strong className="text-white">Etapa 3 (Prueba Final T1):</strong>{' '}
                      {informeActivo.evaluacionLongitudinal.etapa3PruebaFinalT1}
                    </p>
                    <p>
                      <strong className="text-white">Etapa 4 (Práctica Terreno):</strong>{' '}
                      {informeActivo.evaluacionLongitudinal.etapa4PracticaTerreno}
                    </p>
                  </div>
                </div>
              )}

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

        {/* ── Legajo 360° · Decisión Instructor T0 y Carga Horaria ── */}
        {cohorteId && (
          <section
            aria-label="Carga Horaria y Decisión Manual del Instructor"
            className="space-y-3 rounded-sm border border-emerald-500/35 bg-zinc-950 p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-emerald-300">
                <Clock size={13} aria-hidden />
                CARGA HORARIA TOTAL DE CAPACITACIÓN (REGLA DUPLA 1.0H C/U)
              </h3>
              <span
                className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                  cargaHoraria.cumpleRecomendacionTitan === true
                    ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-300'
                    : cargaHoraria.cumpleRecomendacionTitan === false
                      ? 'border-amber-500/60 bg-amber-950/40 text-amber-300'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-200'
                }`}
              >
                TOTAL: {cargaHoraria.totalCertificadas} HS
                {cargaHoraria.horasRecomendadasTitan !== null
                  ? ` / REC. TITÁN ${cargaHoraria.horasRecomendadasTitan} HS`
                  : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 font-mono text-[10px]">
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2.5">
                <p className="text-[9px] text-zinc-500">TEORÍA Y SEGURIDAD</p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {cargaHoraria.horasTeoria} hs
                </p>
                <label className="mt-1.5 inline-flex items-center gap-1.5 text-[9.5px] text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asistioTeoria}
                    onChange={(e) => setAsistioTeoria(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  Asistió a jornada teórica
                </label>
              </div>

              <div className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2.5">
                <p className="text-[9px] text-zinc-500">ENTRENAMIENTO SIMULADOR</p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {cargaHoraria.horasSimuladorTotal} hs
                </p>
                <p className="mt-0.5 text-[9px] text-zinc-400">
                  {presentesSimulador} ses. ({cargaHoraria.horasSesionesDupla}h) + Diag/Fin ({cargaHoraria.horasDiagnosticoYFinal}h) + Ref. ({cargaHoraria.horasRefuerzoSimulador}h)
                </p>
              </div>

              <div className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2.5">
                <p className="text-[9px] text-zinc-500">PRÁCTICA REAL TERRENO</p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {cargaHoraria.horasTerrenoTotal} hs
                </p>
                <p className="mt-0.5 text-[9px] text-zinc-400">
                  Base {cargaHoraria.horasTerrenoBase}h + Extra {cargaHoraria.horasExtraTerreno}h
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 border-t border-zinc-800/80 pt-3 sm:grid-cols-3">
              <label className="space-y-1 sm:col-span-2">
                <span className="font-mono text-[9.5px] text-zinc-400">
                  DECISIÓN MANUAL INSTRUCTOR T0 (EL INSTRUCTOR MANDA)
                </span>
                <select
                  value={decisionT0}
                  onChange={(e) => setDecisionT0(e.target.value as DecisionInstructorT0)}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white"
                >
                  <option value="APROBADO_A_CAPACITACION">
                    APRUEBA DIAGNÓSTICO → PASA A CAPACITACIÓN
                  </option>
                  <option value="PENDIENTE">PENDIENTE DE REVISIÓN</option>
                  <option value="RECHAZADO">NO APRUEBA / RECHAZADO EN T0</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-400">
                  REFUERZO SIMULADOR (HS)
                </span>
                <input
                  type="number"
                  min={0}
                  max={40}
                  step={0.5}
                  value={horasRefuerzoSim}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setHorasRefuerzoSim(Math.max(0, v));
                  }}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-white"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-mono text-[9.5px] text-zinc-400">
                  FUNDAMENTO / NOTA DECISIÓN T0
                </span>
                <input
                  type="text"
                  maxLength={1000}
                  value={obsDecisionT0}
                  onChange={(e) => setObsDecisionT0(e.target.value)}
                  placeholder="Ej: Aprobado con énfasis en ángulo de mástil..."
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-white"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  disabled={guardandoDecision}
                  onClick={guardarDecisionSubmit}
                  className="h-9 w-full rounded-sm border border-emerald-500/60 bg-emerald-500/15 px-3 font-mono text-[10px] font-semibold tracking-[0.1em] text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {guardandoDecision ? 'GUARDANDO…' : 'GUARDAR DECISIÓN Y HORAS'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Legajo 360° · Asistencias de Simulador ───────────── */}
        {cohorteId && (
          <section
            aria-label="Asistencias de Simulador"
            className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-950 p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-sky-300">
                <CalendarCheck size={13} aria-hidden />
                ASISTENCIAS DE SIMULADOR
              </h3>
              <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-200">
                {presentesSimulador} / {totalSesionesLegajo} PRESENTES
              </span>
            </div>

            {cargandoLegajo ? (
              <p className="font-mono text-[10px] text-zinc-500">Cargando sesiones…</p>
            ) : (legajo360?.sesiones.length ?? 0) === 0 ? (
              <p className="rounded-sm border border-dashed border-zinc-800 px-3 py-2 font-mono text-[10px] text-zinc-500">
                Este postulante aún no tiene sesiones sincronizadas en `duplas_cabina`. Usá el botón &quot;Sincronizar Duplas y Sesiones&quot; en la grilla principal.
              </p>
            ) : (
              <div className="space-y-2">
                {legajo360?.sesiones.map((ses) => {
                  const viernesSug =
                    legajo360.viernesSugeridos[0] ?? ses.fecha_real ?? ses.fecha_programada;
                  return (
                    <div
                      key={ses.id}
                      className="flex flex-col gap-2 rounded-sm border border-zinc-800 bg-zinc-900/70 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 font-mono text-[10px]">
                        <p className="font-semibold text-zinc-100">
                          Clase #{ses.numero_sesion} · {ses.fecha_programada}{' '}
                          <span className="text-zinc-500">
                            ({ses.rol_inicio === 'PILOTO_INICIAL' ? 'Piloto 1°' : 'Copiloto 1°'})
                          </span>
                        </p>
                        {ses.fecha_real && (
                          <p className="text-[9.5px] text-cyan-300">
                            Reprogramada: {ses.fecha_real}
                            {ses.es_recuperatorio_viernes ? ' · Viernes Buffer' : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label={`Estado sesión ${ses.numero_sesion}`}
                          value={ses.estado_asistencia}
                          disabled={guardandoAsisId === ses.id}
                          onChange={(e) =>
                            void cambiarAsistenciaLegajo(
                              ses,
                              e.target.value as EstadoAsistenciaUI,
                              e.target.value === 'REPROGRAMADA' ? viernesSug : null
                            )
                          }
                          className="h-8 rounded-sm border border-zinc-700 bg-zinc-950 px-2 font-mono text-[10px] text-zinc-100"
                        >
                          <option value="PENDIENTE">PENDIENTE</option>
                          <option value="PRESENTE">PRESENTE</option>
                          <option value="AUSENTE_JUSTIFICADO">AUSENTE JUSTIFICADO</option>
                          <option value="AUSENTE_INJUSTIFICADO">AUSENTE INJUSTIFICADO</option>
                          <option value="REPROGRAMADA">REPROGRAMADA</option>
                        </select>
                        <button
                          type="button"
                          disabled={guardandoAsisId === ses.id}
                          onClick={() =>
                            void cambiarAsistenciaLegajo(ses, 'REPROGRAMADA', viernesSug)
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-sm border border-cyan-500/50 bg-cyan-950/35 px-2 font-mono text-[9.5px] text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                        >
                          <CalendarClock size={11} aria-hidden />
                          Reprog. a Viernes Buffer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Legajo 360° · Práctica Real en Terreno (CERO STORAGE) ── */}
        {cohorteId && (
          <form
            onSubmit={guardarPracticaRealSubmit}
            aria-label="Práctica Real en Terreno"
            className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-950 p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-amber-300">
                <FileText size={13} aria-hidden />
                PRÁCTICA REAL EN TERRENO (PASAJE A PLANTA · SIN STORAGE)
              </h3>
              <span className="rounded-sm border border-emerald-500/40 bg-emerald-950/30 px-2 py-0.5 font-mono text-[9px] text-emerald-300">
                0 BYTES STORAGE · SOLO SQL/PDF LOCAL
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">FECHA PRÁCTICA *</span>
                <input
                  type="date"
                  required
                  value={pracFecha}
                  onChange={(e) => setPracFecha(e.target.value)}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-white [color-scheme:dark]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">ASISTENCIA TERRENO *</span>
                <select
                  value={pracAsistencia}
                  onChange={(e) =>
                    setPracAsistencia(e.target.value as 'PRESENTE' | 'AUSENTE')
                  }
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white"
                >
                  <option value="PRESENTE">PRESENTE</option>
                  <option value="AUSENTE">AUSENTE</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">HORAS PRÁCTICA REAL</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={pracHorasBase}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setPracHorasBase(Math.max(0, v));
                  }}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-white"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-mono text-[9.5px] text-zinc-500">
                  DECISIÓN MANUAL TERRENO (EL INSTRUCTOR MANDA) *
                </span>
                <select
                  value={pracDecision}
                  onChange={(e) => {
                    const dec = e.target.value as DecisionInstructorTerreno;
                    setPracDecision(dec);
                    setPracResultado(
                      dec === 'APROBADO_EMPRESAS'
                        ? 'aprobado'
                        : dec === 'REQUIERE_MAS_HORAS'
                          ? 'requiere_refuerzo'
                          : 'no_apto'
                    );
                  }}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white"
                >
                  <option value="APROBADO_EMPRESAS">
                    APRUEBA PRÁCTICA REAL (APTO PARA EMPRESAS)
                  </option>
                  <option value="REQUIERE_MAS_HORAS">
                    REQUIERE MÁS HORAS DE REFUERZO
                  </option>
                  <option value="NO_APTO">NO APTO EN TERRENO</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">RESULTADO *</span>
                <select
                  value={pracResultado}
                  onChange={(e) => setPracResultado(e.target.value as ResultadoPracticaReal)}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white"
                >
                  <option value="aprobado">APROBADO</option>
                  <option value="requiere_refuerzo">REQUIERE REFUERZO</option>
                  <option value="no_apto">NO APTO</option>
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-mono text-[9.5px] text-zinc-500">LUGAR / PREDIO *</span>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={pracLugar}
                  onChange={(e) => setPracLugar(e.target.value)}
                  placeholder="Ej: Galpón Municipal / Predio Parque Industrial"
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-white"
                />
              </label>

              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">MÁQUINA REAL *</span>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={pracMaquina}
                  onChange={(e) => setPracMaquina(e.target.value)}
                  placeholder="Ej: Toyota 8FGCU25"
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-white"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-mono text-[9.5px] text-zinc-500">INSTRUCTOR DE PATIO</span>
                <input
                  type="text"
                  maxLength={120}
                  value={pracInstructor}
                  onChange={(e) => setPracInstructor(e.target.value)}
                  placeholder="Nombre del instructor responsable en terreno"
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-white"
                />
              </label>

              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">ASISTENCIA EN MÁQUINA</span>
                <select
                  value={pracNivelAsist}
                  onChange={(e) => setPracNivelAsist(e.target.value)}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white"
                >
                  <option value="AUTONOMO">AUTÓNOMO</option>
                  <option value="AYUDA_VERBAL">AYUDA VERBAL</option>
                  <option value="INTERVENCION_CONSTANTE">INT. CONSTANTE</option>
                  <option value="INTERVENCION_CRITICA">INT. CRÍTICA</option>
                </select>
              </label>

              {/* 4 ejes en máquina real (0 / 10 / 20) */}
              <div className="sm:col-span-3 grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-sm border border-zinc-800 bg-zinc-900/50 p-2.5">
                {[
                  { label: 'LATERALIDAD', val: pracLat, setter: setPracLat },
                  { label: 'MANDOS', val: pracMan, setter: setPracMan },
                  { label: 'MÁSTIL', val: pracMas, setter: setPracMas },
                  { label: 'CONTROL', val: pracCon, setter: setPracCon },
                ].map((eje) => (
                  <label key={eje.label} className="space-y-1">
                    <span className="block font-mono text-[9px] text-zinc-400">
                      {eje.label} (PATIO)
                    </span>
                    <select
                      value={eje.val}
                      onChange={(e) => eje.setter(e.target.value)}
                      className="h-8 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-1.5 font-mono text-[11px] text-white"
                    >
                      <option value="">—</option>
                      <option value="0">0 · CRÍTICO</option>
                      <option value="10">10 · REGULAR</option>
                      <option value="20">20 · ÓPTIMO</option>
                    </select>
                  </label>
                ))}
              </div>

              {/* Check ¿Requiere más horas de refuerzo? + Horas extra terreno */}
              <div className="sm:col-span-3 flex flex-wrap items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-900/50 p-2.5 font-mono text-[10px]">
                <label className="inline-flex items-center gap-2 text-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pracRequiereExtra}
                    onChange={(e) => setPracRequiereExtra(e.target.checked)}
                    className="accent-amber-400"
                  />
                  ¿Requiere más horas de refuerzo?
                </label>

                {pracRequiereExtra && (
                  <label className="inline-flex items-center gap-1.5 text-zinc-300">
                    <span>Sugeridas (hs):</span>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={0.5}
                      value={pracHorasSugeridas}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) setPracHorasSugeridas(Math.max(0, v));
                      }}
                      className="h-8 w-16 rounded-sm border border-amber-500/50 bg-zinc-950 px-2 text-xs text-white"
                    />
                  </label>
                )}

                <label className="inline-flex items-center gap-1.5 text-zinc-300">
                  <span>Horas extra cursadas (hs):</span>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={pracHorasExtra}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setPracHorasExtra(Math.max(0, v));
                    }}
                    className="h-8 w-16 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-white"
                  />
                </label>
              </div>

              <label className="space-y-1 sm:col-span-3">
                <span className="font-mono text-[9.5px] text-zinc-500">
                  OBSERVACIONES DE TERRENO
                </span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={pracObs}
                  onChange={(e) => setPracObs(e.target.value)}
                  placeholder="Desempeño con carga real, maniobra en espacio acotado, seguridad..."
                  className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-white"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={guardandoPrac}
              className="h-10 w-full rounded-sm border border-amber-500/60 bg-amber-500/15 px-4 font-mono text-[11px] font-semibold tracking-[0.12em] text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
            >
              {guardandoPrac ? 'GUARDANDO EVALUACIÓN EN TERRENO…' : 'GUARDAR PRÁCTICA REAL (0 BYTES STORAGE)'}
            </button>
          </form>
        )}

        {/* ── Legajo 360° · Evaluación Final y Dictamen de Egreso ── */}
        {cohorteId && (
          <section
            aria-label="Evaluación Final y Egreso"
            className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-950 p-3.5"
          >
            <h3 className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-emerald-300">
              <Award size={13} aria-hidden />
              FICHA FINAL DE EGRESO (COHORTE)
            </h3>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">ESTADO EGRESO</span>
                <select
                  value={egEstado}
                  onChange={(e) => setEgEstado(e.target.value as EstadoEgreso)}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white"
                >
                  <option value="INCOMPLETO">INCOMPLETO</option>
                  <option value="CERTIFICADO">CERTIFICADO</option>
                  <option value="ABANDONO">ABANDONO</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">PASE A TERRENO</span>
                <select
                  value={egTerrenoAprobado}
                  onChange={(e) =>
                    setEgTerrenoAprobado(e.target.value as 'pendiente' | 'si' | 'no')
                  }
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white"
                >
                  <option value="pendiente">PENDIENTE</option>
                  <option value="si">APROBADO</option>
                  <option value="no">NO APROBADO</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-mono text-[9.5px] text-zinc-500">PERFIL LABORAL</span>
                <select
                  value={egPerfil}
                  onChange={(e) => setEgPerfil(e.target.value as PerfilLaboral)}
                  className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white"
                >
                  <option value="DESTACADO">DESTACADO</option>
                  <option value="ESTANDAR">ESTÁNDAR</option>
                  <option value="CON_OBSERVACIONES">CON OBSERVACIONES</option>
                  <option value="NO_RECOMENDADO">NO RECOMENDADO</option>
                </select>
              </label>

              <label className="space-y-1 sm:col-span-3">
                <span className="font-mono text-[9.5px] text-zinc-500">
                  DEVOLUCIÓN FINAL DE EMPLEO / RECOMENDACIÓN
                </span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={egObs}
                  onChange={(e) => setEgObs(e.target.value)}
                  placeholder="Conclusión de cierre para derivación laboral…"
                  className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-white"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={guardandoEg}
                onClick={guardarEgresoClick}
                className="h-10 flex-1 rounded-sm border border-emerald-500 bg-emerald-500 px-4 font-mono text-[11px] font-semibold tracking-[0.12em] text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
              >
                {guardandoEg ? 'GUARDANDO EGRESO…' : 'GUARDAR DICTAMEN DE EGRESO'}
              </button>
              <button
                type="button"
                onClick={imprimirLegajo360}
                className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-white bg-white px-3.5 font-mono text-[10.5px] font-semibold tracking-[0.1em] text-zinc-950 hover:bg-zinc-200"
              >
                <Printer size={13} aria-hidden />
                PDF 360°
              </button>
            </div>
          </section>
        )}

        {msgLegajo && (
          <p
            role={msgLegajo.tipo === 'error' ? 'alert' : 'status'}
            className={`rounded-sm border px-3 py-2 font-mono text-[10.5px] ${
              msgLegajo.tipo === 'ok'
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                : 'border-red-500/40 bg-red-950/30 text-red-300'
            }`}
          >
            {msgLegajo.texto}
          </p>
        )}

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

        {/* ── Asignación legacy y baja ─────────────────────────── */}
        <section aria-label="Asignación y baja" className="space-y-2.5">
          {franjas.length > 0 && (
            <details className="rounded-sm border border-zinc-800 bg-zinc-950 p-2.5">
              <summary className="cursor-pointer font-mono text-[10px] tracking-[0.14em] text-zinc-500 hover:text-zinc-300">
                ASIGNACIÓN LEGACY A FRANJA (TERNAS 3 POR HORA)
              </summary>
              <div className="mt-2 flex gap-2">
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
            </details>
          )}

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
    <Legajo360Imprimible
      postulante={postulante}
      cohorte={cohorte}
      comparativa={comparativa}
      legajo={legajo360}
      metricasOverride={metricasJsonLocal}
      informeOverride={informeLocal}
    />
    </>
  );
}
