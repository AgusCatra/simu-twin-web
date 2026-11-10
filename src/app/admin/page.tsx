import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Bus,
  CalendarCheck,
  ClipboardList,
  Cpu,
  Gauge,
  GraduationCap,
  Package,
  Truck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  esSimuladorSlug,
  mapearSimuladorDesdeDB,
  METADATA_BAHIAS,
  type EstadoSimulador,
  type FichaTecnicaSimulador,
  type SimuladorRowDB,
  type SimuladorSlug,
} from '@/types/gemelo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard Operativo · Hub Simuladores',
  description:
    'Cockpit de control operativo en tiempo real: estado de las 7 bahías de simulación, cohorte activa, agenda de visitas escolares y accesos rápidos.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de proyección cruda (PostgREST) y dominio local
// ─────────────────────────────────────────────────────────────────────────────

interface FilaCohorteRaw {
  id: string;
  codigo?: string | null;
  nombre?: string | null;
  estado?: string | null;
  estado_v2?: string | null;
  fase_actual?: string | null;
  tipo_maquinaria?: string | null;
  cupo_alumnos?: number | null;
  max_titulares?: number | null;
  fecha_teoria?: string | null;
  fecha_inicio_sim?: string | null;
  fecha_inicio_simulador?: string | null;
  fecha_fin_sim?: string | null;
  fecha_pase_planta?: string | null;
  created_at?: string | null;
}

type EscuelaRelacion =
  | {
      nombre_institucion?: string | null;
      nombre_corto?: string | null;
    }
  | {
      nombre_institucion?: string | null;
      nombre_corto?: string | null;
    }[]
  | null;

interface FilaVisitaProximaRaw {
  id: string;
  codigo_reserva?: string | null;
  fecha_visita?: string | null;
  turno?: string | null;
  anio?: string | null;
  division?: string | null;
  cant_alumnos?: number | null;
  requiere_tup?: boolean | null;
  tup_estado_traslado?: string | null;
  estado_visita?: string | null;
  otra_institucion_nombre?: string | null;
  escuelas?: EscuelaRelacion;
}

interface CohorteResumen {
  id: string;
  codigo: string;
  nombre: string;
  faseLabel: string;
  esActiva: boolean;
  cupo: number | null;
  fechaReferencia: string | null;
}

interface VisitaProximaResumen {
  id: string;
  codigoReserva: string;
  fechaVisita: string;
  turno: string;
  institucion: string;
  cursoLabel: string;
  cantAlumnos: number;
  requiereTup: boolean;
  estadoTup: string;
  estadoVisita: string;
}

interface AccesoRapidoItem {
  href: string;
  titulo: string;
  descripcion: string;
  moduloTag: string;
  icono: LucideIcon;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes visuales y mapa de accesos rápidos
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_CLASS = 'rounded-sm border border-zinc-800 bg-zinc-950';

const ACCESOS_RAPIDOS: readonly AccesoRapidoItem[] = [
  {
    href: '/admin/registro-actividades',
    titulo: 'Registro SCADA',
    descripcion: 'Rack en vivo, sesiones y nóminas',
    moduloTag: 'SCADA',
    icono: ClipboardList,
  },
  {
    href: '/admin/visitas-educativas',
    titulo: 'Gestión Visitas',
    descripcion: 'Reservas escolares, pólizas y checks',
    moduloTag: 'VISITAS · H4',
    icono: BookOpen,
  },
  {
    href: '/admin/tup',
    titulo: 'Panel Chofer TUP',
    descripcion: 'Traslados municipales e itinerarios',
    moduloTag: 'TUP',
    icono: Truck,
  },
  {
    href: '/gestion/cohortes',
    titulo: 'Empleo / Cohortes',
    descripcion: 'Franjas de cabina, cupo y ranking',
    moduloTag: 'COHORTES',
    icono: UsersRound,
  },
  {
    href: '/cabina/evaluacion',
    titulo: 'Consola Cabina',
    descripcion: 'Evaluación táctil de instructores',
    moduloTag: 'CABINA',
    icono: Gauge,
  },
  {
    href: '/admin/insumos',
    titulo: 'Stock / Pañol',
    descripcion: 'Existencias de refrigerio, insumos y consumos',
    moduloTag: 'PAÑOL',
    icono: Package,
  },
];

interface FilaInsumoAlertaRaw {
  id: string;
  codigo: string | null;
  cantidad_disponible: number | null;
  cantidad_minima_alerta: number | null;
}

const SELECT_PROXIMAS_VISITAS = `
  id,
  codigo_reserva,
  fecha_visita,
  turno,
  anio,
  division,
  cant_alumnos,
  requiere_tup,
  tup_estado_traslado,
  estado_visita,
  otra_institucion_nombre,
  escuelas(nombre_institucion, nombre_corto)
`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers puros de fecha, normalización y badges
// ─────────────────────────────────────────────────────────────────────────────

function obtenerFechaHoyArgentinaISO(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = partes.find((p) => p.type === 'year')?.value ?? '2026';
  const month = partes.find((p) => p.type === 'month')?.value ?? '01';
  const day = partes.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function formatearFechaCorta(fechaRaw: string | null | undefined): string {
  if (!fechaRaw) return 'Fecha a confirmar';
  const soloFecha = fechaRaw.split('T')[0];
  const segmentos = soloFecha.split('-');
  if (segmentos.length !== 3) return soloFecha;

  const anio = Number(segmentos[0]);
  const mes = Number(segmentos[1]);
  const dia = Number(segmentos[2]);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) {
    return soloFecha;
  }

  const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0));
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(fechaUTC);
}

function seleccionarCohorteActiva(
  filas: FilaCohorteRaw[]
): CohorteResumen | null {
  if (filas.length === 0) return null;

  const esNoFinalizada = (fila: FilaCohorteRaw): boolean => {
    if (fila.estado_v2) {
      const v2 = fila.estado_v2.toUpperCase();
      return v2 !== 'FINALIZADA' && v2 !== 'CANCELADA';
    }
    if (fila.fase_actual) {
      return fila.fase_actual.toLowerCase() !== 'finalizada';
    }
    if (fila.estado) {
      return fila.estado.toLowerCase() !== 'finalizada';
    }
    return false;
  };

  const esPrioritaria = (fila: FilaCohorteRaw): boolean => {
    if (fila.estado_v2) {
      const v2 = fila.estado_v2.toUpperCase();
      return v2 === 'EN_CURSO' || v2 === 'DIAGNOSTICO' || v2 === 'PLANIFICADA';
    }
    if (fila.estado) {
      return fila.estado.toLowerCase() === 'activa';
    }
    if (fila.fase_actual) {
      return fila.fase_actual.toLowerCase() !== 'finalizada';
    }
    return false;
  };

  const elegida =
    filas.find(esPrioritaria) ?? filas.find(esNoFinalizada) ?? filas[0];

  const faseRaw =
    elegida.estado_v2 ?? elegida.fase_actual ?? elegida.estado ?? 'ACTIVA';
  const faseLabel = faseRaw.replace(/_/g, ' ').toUpperCase();

  const cupoRaw = elegida.cupo_alumnos ?? elegida.max_titulares ?? null;
  const cupo =
    typeof cupoRaw === 'number' && Number.isFinite(cupoRaw) ? cupoRaw : null;

  return {
    id: elegida.id,
    codigo: elegida.codigo?.trim() || 'COHORTE',
    nombre: elegida.nombre?.trim() || 'Cohorte Municipal',
    faseLabel,
    esActiva: esNoFinalizada(elegida),
    cupo,
    fechaReferencia:
      elegida.fecha_inicio_sim ??
      elegida.fecha_inicio_simulador ??
      elegida.fecha_teoria ??
      null,
  };
}

function resolverNombreInstitucion(fila: FilaVisitaProximaRaw): string {
  const rel = fila.escuelas;
  if (rel) {
    const escuelaObj = Array.isArray(rel) ? rel[0] : rel;
    const nombreCorto = escuelaObj?.nombre_corto?.trim();
    const nombreLargo = escuelaObj?.nombre_institucion?.trim();
    if (nombreCorto) return nombreCorto;
    if (nombreLargo) return nombreLargo;
  }
  const libre = fila.otra_institucion_nombre?.trim();
  if (libre) return libre;
  return 'Institución sin registrar';
}

function mapearVisitaProxima(
  fila: FilaVisitaProximaRaw
): VisitaProximaResumen {
  const anio = fila.anio?.trim() ?? '';
  const division = fila.division?.trim() ?? '';
  const cursoPartes = [anio, division].filter(Boolean);

  return {
    id: fila.id,
    codigoReserva: fila.codigo_reserva?.trim() || 'SIN-COD',
    fechaVisita: fila.fecha_visita ?? '',
    turno: fila.turno?.trim() || 'Turno a confirmar',
    institucion: resolverNombreInstitucion(fila),
    cursoLabel: cursoPartes.length > 0 ? cursoPartes.join(' · ') : 'Curso N/D',
    cantAlumnos:
      typeof fila.cant_alumnos === 'number' && Number.isFinite(fila.cant_alumnos)
        ? fila.cant_alumnos
        : 0,
    requiereTup: Boolean(fila.requiere_tup),
    estadoTup: (fila.tup_estado_traslado ?? 'pendiente').replace(/_/g, ' '),
    estadoVisita: fila.estado_visita?.trim() || 'Pendiente',
  };
}

function construirBahiasFallback(): FichaTecnicaSimulador[] {
  return Object.values(METADATA_BAHIAS)
    .map((meta) => ({
      id: meta.slug,
      codigo: meta.codigoBahia,
      numeroPuesto: meta.numeroPuesto,
      nombre: meta.nombreFallback,
      tipo: meta.slug,
      estado: 'libre' as const,
      horasUsoTotales: 0,
      ultimoMantenimiento: null,
      actualizadoEl: null,
      actividadActualId: null,
      especificacionesHardware: meta.especificacionesHardware,
      modulosPedagogicos: meta.modulosPedagogicos,
      detalles: meta.detalles,
    }))
    .sort((a, b) => a.numeroPuesto - b.numeroPuesto);
}

function obtenerEstilosEstadoSimulador(estado: EstadoSimulador): {
  etiqueta: string;
  badgeClass: string;
  dotClass: string;
} {
  if (estado === 'en_operacion') {
    return {
      etiqueta: 'EN OPERACIÓN',
      badgeClass: 'border-amber-500/40 bg-amber-950/30 text-amber-300',
      dotClass: 'bg-amber-400 animate-pulse',
    };
  }
  if (estado === 'mantenimiento') {
    return {
      etiqueta: 'MANTENIMIENTO',
      badgeClass: 'border-rose-500/40 bg-rose-950/30 text-rose-300',
      dotClass: 'bg-rose-400',
    };
  }
  return {
    etiqueta: 'LIBRE',
    badgeClass: 'border-emerald-500/35 bg-emerald-950/25 text-emerald-300',
    dotClass: 'bg-emerald-400',
  };
}

function obtenerEstilosEstadoVisita(estado: string): string {
  const norm = estado.toLowerCase();
  if (norm === 'confirmada') {
    return 'border-emerald-500/35 bg-emerald-950/25 text-emerald-300';
  }
  if (norm === 'reprogramada') {
    return 'border-sky-500/35 bg-sky-950/25 text-sky-300';
  }
  if (norm === 'completada' || norm === 'finalizada') {
    return 'border-zinc-700 bg-zinc-900 text-zinc-300';
  }
  return 'border-amber-500/40 bg-amber-950/30 text-amber-300';
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Component principal (/admin)
// ─────────────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const hoyISO = obtenerFechaHoyArgentinaISO();

  let errorGlobal = false;
  let errorSimuladores = false;
  let errorCohortes = false;
  let errorVisitas = false;

  let bahias: FichaTecnicaSimulador[] = [];
  let cohorteActiva: CohorteResumen | null = null;
  let visitasProximas: VisitaProximaResumen[] = [];
  let totalVisitasAgenda = 0;
  let insumosEnAlerta = 0;

  try {
    const supabase = await createClient();

    const [respSimuladores, respCohortes, respVisitas, respStock] =
      await Promise.all([
        supabase
          .from('simuladores')
          .select(
            'id, nombre, estado, horas_uso_totales, ultimo_mantenimiento, actualizado_el, actividad_actual_id'
          )
          .order('id', { ascending: true })
          .returns<SimuladorRowDB[]>(),
        supabase
          .from('cohortes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(25)
          .returns<FilaCohorteRaw[]>(),
        supabase
          .from('visitas_educativas')
          .select(SELECT_PROXIMAS_VISITAS, { count: 'exact' })
          .gte('fecha_visita', hoyISO)
          .neq('estado_visita', 'Cancelada')
          .order('fecha_visita', { ascending: true })
          .limit(5)
          .returns<FilaVisitaProximaRaw[]>(),
        supabase
          .from('stock_insumos')
          .select('id, codigo, cantidad_disponible, cantidad_minima_alerta')
          .returns<FilaInsumoAlertaRaw[]>(),
      ]);

    if (respSimuladores.error) {
      errorSimuladores = true;
      console.error('[/admin] Error al consultar simuladores:', {
        code: respSimuladores.error.code,
        message: respSimuladores.error.message,
      });
    } else {
      const filasValidas = (respSimuladores.data ?? []).filter(
        (fila): fila is SimuladorRowDB & { id: SimuladorSlug } =>
          esSimuladorSlug(fila.id)
      );
      bahias = filasValidas
        .map(mapearSimuladorDesdeDB)
        .sort((a, b) => a.numeroPuesto - b.numeroPuesto);
    }

    if (respCohortes.error) {
      errorCohortes = true;
      console.error('[/admin] Error al consultar cohortes:', {
        code: respCohortes.error.code,
        message: respCohortes.error.message,
      });
    } else {
      cohorteActiva = seleccionarCohorteActiva(respCohortes.data ?? []);
    }

    if (respVisitas.error) {
      errorVisitas = true;
      console.error('[/admin] Error al consultar visitas_educativas:', {
        code: respVisitas.error.code,
        message: respVisitas.error.message,
      });
    } else {
      const filasVisitas = (respVisitas.data ?? []).filter(
        (v) => v.estado_visita?.toLowerCase() !== 'cancelada'
      );
      visitasProximas = filasVisitas.map(mapearVisitaProxima);
      totalVisitasAgenda =
        typeof respVisitas.count === 'number'
          ? respVisitas.count
          : visitasProximas.length;
    }

    if (respStock.error) {
      console.error('[/admin] Error al consultar stock_insumos:', {
        code: respStock.error.code,
        message: respStock.error.message,
      });
    } else {
      insumosEnAlerta = (respStock.data ?? []).filter((item) => {
        const disponible =
          typeof item.cantidad_disponible === 'number' &&
          Number.isFinite(item.cantidad_disponible)
            ? item.cantidad_disponible
            : 0;
        const minimo =
          typeof item.cantidad_minima_alerta === 'number' &&
          Number.isFinite(item.cantidad_minima_alerta)
            ? item.cantidad_minima_alerta
            : 0;
        return disponible <= minimo;
      }).length;
    }
  } catch (err) {
    errorGlobal = true;
    errorSimuladores = true;
    errorCohortes = true;
    errorVisitas = true;
    console.error('[/admin] Error inesperado al inicializar dashboard:', {
      message: err instanceof Error ? err.message : 'Error desconocido',
    });
  }

  // Métricas derivadas de flota de simuladores
  const enOperacion = bahias.filter((b) => b.estado === 'en_operacion').length;
  const libres = bahias.filter((b) => b.estado === 'libre').length;
  const enMantenimiento = bahias.filter(
    (b) => b.estado === 'mantenimiento'
  ).length;
  const horasAcumuladas = bahias.reduce(
    (acc, sim) => acc + sim.horasUsoTotales,
    0
  );

  // Bahías para la grilla (si falla lectura, muestra la estructura de las 7 bahías sin datos de telemetría)
  const bahiasMostradas =
    bahias.length > 0 ? bahias : construirBahiasFallback();
  const sinTelemetriaReal = errorSimuladores || bahias.length === 0;

  // Métricas derivadas de visitas próximas
  const alumnosEsperados = visitasProximas.reduce(
    (acc, v) => acc + v.cantAlumnos,
    0
  );
  const visitasConTupCount = visitasProximas.filter(
    (v) => v.requiereTup
  ).length;

  return (
    <div className="space-y-6">
      {/* ── Cabecera del Cockpit ───────────────────────────────────────── */}
      <header className={`${PANEL_CLASS} px-5 py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-100"
            >
              <Activity size={17} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                Dashboard de Control Operativo
              </h1>
              <p className="truncate font-mono text-[11px] tracking-[0.12em] text-zinc-500">
                /ADMIN · TELEMETRÍA EN VIVO, COHORTES Y AGENDA ESCOLAR
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] text-zinc-300">
              {horasAcumuladas.toFixed(1)} HS ACUMULADAS
            </span>
            <span className="inline-flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] tracking-[0.1em] text-zinc-200">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${
                  sinTelemetriaReal
                    ? 'bg-zinc-600'
                    : enOperacion > 0
                      ? 'bg-amber-400 animate-pulse'
                      : enMantenimiento > 0
                        ? 'bg-rose-400'
                        : 'bg-emerald-400'
                }`}
              />
              {sinTelemetriaReal
                ? 'SIN TELEMETRÍA'
                : enOperacion > 0
                  ? `${enOperacion} BAHÍAS EN OPERACIÓN`
                  : 'FLOTA EN ESPERA'}
            </span>
          </div>
        </div>
      </header>

      {errorGlobal && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-sm border border-rose-900/70 bg-rose-950/40 px-4 py-3 text-sm text-rose-200"
        >
          <AlertTriangle size={16} className="shrink-0 text-rose-400" />
          <span>
            No fue posible establecer conexión con Supabase. Se muestran
            estados defensivos hasta restablecer la comunicación.
          </span>
        </div>
      )}

      {/* ── KPI Cards Superiores ───────────────────────────────────────── */}
      <section aria-label="Indicadores clave de operación">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* KPI 1: Simuladores Operación / Libres */}
          <article className={`${PANEL_CLASS} flex flex-col justify-between p-4`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-500">
                SIMULADORES · OP / LIBRES
              </p>
              <Cpu size={15} className="shrink-0 text-zinc-500" aria-hidden />
            </div>

            {errorSimuladores ? (
              <div className="mt-3">
                <p className="font-mono text-xl font-semibold text-zinc-400">
                  -- / --
                </p>
                <p className="mt-1 font-mono text-[11px] text-rose-400">
                  Error al consultar flota
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <p className="font-mono text-2xl font-semibold tracking-tight text-white tabular-nums">
                    {enOperacion}{' '}
                    <span className="text-zinc-600">/</span>{' '}
                    <span className="text-emerald-400">{libres}</span>
                  </p>
                  <span className="font-mono text-[11px] text-zinc-500">
                    de {bahias.length} bahías
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-zinc-400">
                  {enMantenimiento} mantenimiento · {horasAcumuladas.toFixed(1)}{' '}
                  h totales
                </p>
              </div>
            )}
          </article>

          {/* KPI 2: Cohorte en Curso */}
          <article className={`${PANEL_CLASS} flex flex-col justify-between p-4`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-500">
                COHORTE EN CURSO
              </p>
              <UsersRound
                size={15}
                className="shrink-0 text-zinc-500"
                aria-hidden
              />
            </div>

            {errorCohortes ? (
              <div className="mt-3">
                <p className="font-mono text-lg font-semibold text-zinc-400">
                  SIN LECTURA
                </p>
                <p className="mt-1 font-mono text-[11px] text-rose-400">
                  Error al consultar cohortes
                </p>
              </div>
            ) : cohorteActiva ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-mono text-lg font-semibold tracking-tight text-white">
                    {cohorteActiva.codigo}
                  </p>
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] ${
                      cohorteActiva.esActiva
                        ? 'border-emerald-500/35 bg-emerald-950/30 text-emerald-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    {cohorteActiva.faseLabel}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-zinc-400">
                  {cohorteActiva.nombre}
                  {cohorteActiva.cupo !== null
                    ? ` · Cupo ${cohorteActiva.cupo}`
                    : ''}
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <p className="font-mono text-lg font-semibold text-zinc-300">
                  SIN COHORTE ACTIVA
                </p>
                <p className="mt-1 font-mono text-[11px] text-zinc-500">
                  Sin cohortes registradas en curso
                </p>
              </div>
            )}
          </article>

          {/* KPI 3: Próximas Visitas */}
          <article className={`${PANEL_CLASS} flex flex-col justify-between p-4`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-500">
                PRÓXIMAS VISITAS
              </p>
              <CalendarCheck
                size={15}
                className="shrink-0 text-zinc-500"
                aria-hidden
              />
            </div>

            {errorVisitas ? (
              <div className="mt-3">
                <p className="font-mono text-xl font-semibold text-zinc-400">
                  --
                </p>
                <p className="mt-1 font-mono text-[11px] text-rose-400">
                  Error al consultar agenda
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <p className="font-mono text-2xl font-semibold tracking-tight text-white tabular-nums">
                    {totalVisitasAgenda}
                  </p>
                  <span className="font-mono text-[11px] text-zinc-500">
                    en agenda
                  </span>
                </div>
                <p className="mt-1.5 truncate font-mono text-[11px] text-zinc-400">
                  {visitasProximas.length > 0
                    ? `Próxima: ${formatearFechaCorta(visitasProximas[0].fechaVisita)} · ${visitasConTupCount} TUP`
                    : 'Sin visitas escolares desde hoy'}
                </p>
              </div>
            )}
          </article>

          {/* KPI 4: Alumnos Esperados */}
          <article className={`${PANEL_CLASS} flex flex-col justify-between p-4`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-500">
                ALUMNOS ESPERADOS
              </p>
              <GraduationCap
                size={15}
                className="shrink-0 text-zinc-500"
                aria-hidden
              />
            </div>

            {errorVisitas ? (
              <div className="mt-3">
                <p className="font-mono text-xl font-semibold text-zinc-400">
                  --
                </p>
                <p className="mt-1 font-mono text-[11px] text-rose-400">
                  Sin datos de contingentes
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <p className="font-mono text-2xl font-semibold tracking-tight text-white tabular-nums">
                    {alumnosEsperados}
                  </p>
                  <span className="font-mono text-[11px] text-zinc-500">
                    estudiantes
                  </span>
                </div>
                <p className="mt-1.5 truncate font-mono text-[11px] text-zinc-400">
                  {visitasProximas.length > 0
                    ? `En las próximas ${visitasProximas.length} visitas`
                    : 'Sin contingentes programados'}
                </p>
              </div>
            )}
          </article>
        </div>
      </section>

      {/* ── Grilla de Acceso Rápido a Submódulos ───────────────────────── */}
      <section aria-label="Accesos rápidos a submódulos" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            ACCESO RÁPIDO A SUBMÓDULOS
          </h2>
          <span className="font-mono text-[10px] tracking-[0.12em] text-zinc-600">
            {ACCESOS_RAPIDOS.length} MÓDULOS OPERATIVOS
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {ACCESOS_RAPIDOS.map((item) => {
            const Icono = item.icono;
            const mostrarAlertaStock =
              item.href === '/admin/insumos' && insumosEnAlerta > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col justify-between rounded-sm border border-zinc-800 bg-zinc-950 p-3.5 transition-colors hover:border-zinc-600 hover:bg-zinc-900 focus-visible:outline-1 focus-visible:outline-white"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors group-hover:border-zinc-700 group-hover:text-white">
                    <Icono size={15} strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="flex items-center gap-1.5">
                    {mostrarAlertaStock && (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/50 bg-amber-950/60 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.08em] text-amber-300">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
                        />
                        {insumosEnAlerta} BAJO MÍN.
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-zinc-500 group-hover:text-zinc-300">
                      {item.moduloTag}
                      <ArrowUpRight
                        size={12}
                        strokeWidth={2}
                        className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        aria-hidden
                      />
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-sm font-semibold tracking-tight text-zinc-100 group-hover:text-white">
                    {item.titulo}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-zinc-500 group-hover:text-zinc-400">
                    {item.descripcion}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Paneles Operativos: Monitor de 7 Bahías + Próximas Visitas ─── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Monitor Resumido de las 7 Bahías (SIM-01 a SIM-07) */}
        <section
          aria-label="Monitor de bahías de simulación"
          className={`${PANEL_CLASS} flex flex-col xl:col-span-7`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
            <div>
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100">
                MONITOR DE BAHÍAS · SIM-01 A SIM-07
              </h2>
              <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-zinc-500">
                ESTADO EN VIVO DE LA FLOTA DE SIMULADORES
              </p>
            </div>
            <Link
              href="/admin/registro-actividades"
              className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              IR AL RACK SCADA
              <ArrowUpRight size={12} aria-hidden />
            </Link>
          </div>

          {errorSimuladores && (
            <div
              role="alert"
              className="mx-4 mt-3 flex items-center gap-2 rounded-sm border border-rose-900/60 bg-rose-950/30 px-3 py-2 font-mono text-[11px] text-rose-200"
            >
              <AlertTriangle size={13} className="shrink-0 text-rose-400" />
              <span>
                No se pudo leer la tabla simuladores. Mostrando esquema base
                sin telemetría.
              </span>
            </div>
          )}

          <div className="divide-y divide-zinc-800/80">
            {bahiasMostradas.map((sim) => {
              const estilos = obtenerEstilosEstadoSimulador(sim.estado);
              return (
                <div
                  key={sim.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-900/60"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="shrink-0 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-zinc-200">
                      {sim.codigo}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {sim.nombre}
                      </p>
                      <p className="font-mono text-[10px] tracking-[0.08em] text-zinc-500">
                        PUESTO {String(sim.numeroPuesto).padStart(2, '0')} ·{' '}
                        {sim.horasUsoTotales.toFixed(1)} HS DE USO
                      </p>
                    </div>
                  </div>

                  {sinTelemetriaReal ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-zinc-500">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-zinc-600"
                      />
                      SIN DATOS
                    </span>
                  ) : (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.1em] ${estilos.badgeClass}`}
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${estilos.dotClass}`}
                      />
                      {estilos.etiqueta}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Lista Resumida de Próximas 5 Visitas Escolares */}
        <section
          aria-label="Próximas visitas escolares"
          className={`${PANEL_CLASS} flex flex-col xl:col-span-5`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
            <div>
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100">
                PRÓXIMAS VISITAS ESCOLARES
              </h2>
              <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-zinc-500">
                HASTA 5 RESERVAS DESDE {hoyISO}
              </p>
            </div>
            <Link
              href="/admin/visitas-educativas"
              className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              GESTIONAR VISITAS
              <ArrowUpRight size={12} aria-hidden />
            </Link>
          </div>

          {errorVisitas ? (
            <div className="p-4">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-sm border border-rose-900/60 bg-rose-950/30 px-3 py-3 font-mono text-[11px] text-rose-200"
              >
                <AlertTriangle size={14} className="shrink-0 text-rose-400" />
                <span>No se pudo consultar la agenda de visitas educativas.</span>
              </div>
            </div>
          ) : visitasProximas.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 text-center">
              <CalendarCheck
                size={24}
                strokeWidth={1.5}
                className="mb-2.5 text-zinc-600"
                aria-hidden
              />
              <p className="font-mono text-xs tracking-[0.12em] text-zinc-400">
                SIN VISITAS PRÓXIMAS EN AGENDA
              </p>
              <p className="mt-1 max-w-xs text-xs text-zinc-500">
                No existen reservas educativas activas con fecha igual o
                posterior a hoy.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/80">
              {visitasProximas.map((visita) => (
                <li
                  key={visita.id}
                  className="space-y-2 px-4 py-3 transition-colors hover:bg-zinc-900/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold text-zinc-200">
                      {formatearFechaCorta(visita.fechaVisita).toUpperCase()}
                      <span className="px-1.5 text-zinc-600">·</span>
                      <span className="text-zinc-400">{visita.turno}</span>
                    </p>
                    <span className="font-mono text-[10px] tracking-[0.08em] text-zinc-500">
                      {visita.codigoReserva}
                    </span>
                  </div>

                  <div>
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {visita.institucion}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                      {visita.cursoLabel} · {visita.cantAlumnos} alumnos
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span
                      className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${obtenerEstilosEstadoVisita(
                        visita.estadoVisita
                      )}`}
                    >
                      {visita.estadoVisita}
                    </span>

                    {visita.requiereTup ? (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-sky-500/40 bg-sky-950/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-sky-300">
                        <Bus size={11} strokeWidth={1.75} aria-hidden />
                        TUP · {visita.estadoTup}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                        TRASLADO PROPIO
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
