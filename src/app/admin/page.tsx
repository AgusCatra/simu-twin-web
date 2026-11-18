import type { Metadata } from 'next';
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  Cpu,
  Package,
  UsersRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  listarUsuariosConRolesParaSuperadmin,
  obtenerPerfilUsuarioActual,
  type PerfilUsuario,
} from '@/lib/auth/permisos';
import InicioCentroTabs, {
  type VisitaAgendaItem,
} from '@/components/admin/InicioCentroTabs';
import {
  esSimuladorSlug,
  mapearSimuladorDesdeDB,
  METADATA_BAHIAS,
  type FichaTecnicaSimulador,
  type SimuladorRowDB,
  type SimuladorSlug,
} from '@/types/gemelo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inicio del Centro · Centro de Simuladores',
  description:
    'Panel general de operación del Centro de Simuladores: estado de simuladores, alumnos en curso, próximas escuelas y alertas de stock.',
};

interface FilaCohorteRaw {
  id: string;
  codigo?: string | null;
  nombre?: string | null;
  estado?: string | null;
  estado_v2?: string | null;
  fase_actual?: string | null;
  cupo_alumnos?: number | null;
  max_titulares?: number | null;
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
}

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

function seleccionarCohorteActiva(filas: FilaCohorteRaw[]): CohorteResumen | null {
  if (filas.length === 0) return null;

  const esNoFinalizada = (fila: FilaCohorteRaw): boolean => {
    if (fila.estado_v2) {
      const v2 = fila.estado_v2.toUpperCase();
      return v2 !== 'FINALIZADA' && v2 !== 'CANCELADA';
    }
    if (fila.fase_actual) return fila.fase_actual.toLowerCase() !== 'finalizada';
    if (fila.estado) return fila.estado.toLowerCase() !== 'finalizada';
    return false;
  };

  const esPrioritaria = (fila: FilaCohorteRaw): boolean => {
    if (fila.estado_v2) {
      const v2 = fila.estado_v2.toUpperCase();
      return v2 === 'EN_CURSO' || v2 === 'DIAGNOSTICO' || v2 === 'PLANIFICADA';
    }
    if (fila.estado) return fila.estado.toLowerCase() === 'activa';
    if (fila.fase_actual) return fila.fase_actual.toLowerCase() !== 'finalizada';
    return false;
  };

  const elegida = filas.find(esPrioritaria) ?? filas.find(esNoFinalizada) ?? filas[0];
  const faseRaw =
    elegida.estado_v2 ?? elegida.fase_actual ?? elegida.estado ?? 'ACTIVA';
  const cupoRaw = elegida.cupo_alumnos ?? elegida.max_titulares ?? null;

  return {
    id: elegida.id,
    codigo: elegida.codigo?.trim() || 'Curso activo',
    nombre: elegida.nombre?.trim() || 'Curso de Autoelevador',
    faseLabel: faseRaw.replace(/_/g, ' '),
    esActiva: esNoFinalizada(elegida),
    cupo: typeof cupoRaw === 'number' && Number.isFinite(cupoRaw) ? cupoRaw : null,
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
  return fila.otra_institucion_nombre?.trim() || 'Institución sin registrar';
}

function mapearVisitaProxima(fila: FilaVisitaProximaRaw): VisitaAgendaItem {
  const anio = fila.anio?.trim() ?? '';
  const division = fila.division?.trim() ?? '';
  const cursoPartes = [anio, division].filter(Boolean);

  return {
    id: fila.id,
    codigoReserva: fila.codigo_reserva?.trim() || 'SIN-COD',
    fechaVisitaCorta: formatearFechaCorta(fila.fecha_visita),
    turno: fila.turno?.trim() || 'Turno a confirmar',
    institucion: resolverNombreInstitucion(fila),
    cursoLabel: cursoPartes.length > 0 ? cursoPartes.join(' · ') : 'Curso',
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

export default async function AdminDashboardPage() {
  const hoyISO = obtenerFechaHoyArgentinaISO();

  let errorGlobal = false;
  let errorSimuladores = false;
  let errorCohortes = false;
  let errorVisitas = false;

  let bahias: FichaTecnicaSimulador[] = [];
  let cohorteActiva: CohorteResumen | null = null;
  let alumnosEnCurso = 0;
  let visitasProximas: VisitaAgendaItem[] = [];
  let totalVisitasAgenda = 0;
  let insumosEnAlerta = 0;
  let perfilActual: PerfilUsuario | null = null;
  let usuariosRoles: PerfilUsuario[] = [];

  try {
    const supabase = await createClient();

    const [
      respSimuladores,
      respCohortes,
      respVisitas,
      respStock,
      perfilRes,
      rolesRes,
    ] = await Promise.all([
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
      obtenerPerfilUsuarioActual(),
      listarUsuariosConRolesParaSuperadmin(),
    ]);
    perfilActual = perfilRes;
    usuariosRoles = rolesRes;

    if (respSimuladores.error) {
      errorSimuladores = true;
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
    } else {
      cohorteActiva = seleccionarCohorteActiva(respCohortes.data ?? []);
      if (cohorteActiva) {
        const { count: cntAlumnos } = await supabase
          .from('cohorte_inscripciones')
          .select('id', { count: 'exact', head: true })
          .eq('cohorte_id', cohorteActiva.id);
        alumnosEnCurso = typeof cntAlumnos === 'number' ? cntAlumnos : 0;
      }
    }

    if (respVisitas.error) {
      errorVisitas = true;
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

    if (!respStock.error) {
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
  } catch {
    errorGlobal = true;
    errorSimuladores = true;
    errorCohortes = true;
    errorVisitas = true;
  }

  const enOperacion = bahias.filter((b) => b.estado === 'en_operacion').length;
  const libres = bahias.filter((b) => b.estado === 'libre').length;
  const bahiasMostradas =
    bahias.length > 0 ? bahias : construirBahiasFallback();
  const sinTelemetriaReal = errorSimuladores || bahias.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700"
          >
            <Activity size={20} strokeWidth={1.85} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Inicio del Centro
            </h1>
            <p className="text-sm text-slate-600">
              Resumen diario de simuladores, cursos y escuelas
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            sinTelemetriaReal
              ? 'border-slate-200 bg-slate-100 text-slate-600'
              : enOperacion > 0
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              sinTelemetriaReal
                ? 'bg-slate-400'
                : enOperacion > 0
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-emerald-500'
            }`}
          />
          {sinTelemetriaReal
            ? 'Sin conexión con puestos'
            : enOperacion > 0
              ? `${enOperacion} simuladores activos`
              : 'Todos los simuladores disponibles'}
        </span>
      </header>

      {errorGlobal && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          <AlertTriangle size={18} className="shrink-0 text-rose-600" />
          <span>
            No fue posible establecer conexión con la base de datos en este momento.
          </span>
        </div>
      )}

      {/* 4 Tarjetas KPI Blancas Limpias */}
      <section aria-label="Indicadores principales">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* 1. Simuladores Activos */}
          <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600">
                Simuladores Activos
              </p>
              <Cpu size={18} className="text-blue-600" aria-hidden />
            </div>
            <div className="mt-3">
              <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {errorSimuladores ? '—' : enOperacion}{' '}
                <span className="text-base font-medium text-slate-500">
                  / {bahiasMostradas.length} en uso
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {errorSimuladores
                  ? 'Error de lectura'
                  : `${libres} disponibles para prácticas`}
              </p>
            </div>
          </article>

          {/* 2. Alumnos en Curso */}
          <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600">
                Alumnos en Curso
              </p>
              <UsersRound size={18} className="text-emerald-600" aria-hidden />
            </div>
            <div className="mt-3">
              {errorCohortes ? (
                <p className="text-sm font-semibold text-rose-700">
                  Error al consultar cursos
                </p>
              ) : cohorteActiva ? (
                <>
                  <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {alumnosEnCurso}{' '}
                    <span className="text-base font-medium text-slate-500">
                      inscriptos
                    </span>
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-600">
                    {cohorteActiva.codigo} · {cohorteActiva.nombre}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl font-bold text-slate-900">Sin curso activo</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Podés crear un curso en Cursos y Alumnos
                  </p>
                </>
              )}
            </div>
          </article>

          {/* 3. Próximas Escuelas */}
          <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600">
                Próximas Escuelas
              </p>
              <CalendarCheck size={18} className="text-blue-600" aria-hidden />
            </div>
            <div className="mt-3">
              <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {errorVisitas ? '—' : totalVisitasAgenda}{' '}
                <span className="text-base font-medium text-slate-500">
                  visitas
                </span>
              </p>
              <p className="mt-1 truncate text-xs text-slate-600">
                {visitasProximas.length > 0
                  ? `Siguiente: ${visitasProximas[0].institucion} (${visitasProximas[0].fechaVisitaCorta})`
                  : 'Sin visitas pendientes desde hoy'}
              </p>
            </div>
          </article>

          {/* 4. Alertas de Stock */}
          <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600">
                Alertas de Stock
              </p>
              <Package
                size={18}
                className={
                  insumosEnAlerta > 0 ? 'text-rose-600' : 'text-emerald-600'
                }
                aria-hidden
              />
            </div>
            <div className="mt-3">
              <p
                className={`text-3xl font-bold tracking-tight tabular-nums ${
                  insumosEnAlerta > 0 ? 'text-rose-700' : 'text-slate-900'
                }`}
              >
                {insumosEnAlerta}{' '}
                <span className="text-base font-medium text-slate-500">
                  {insumosEnAlerta === 1 ? 'insumo' : 'insumos'}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {insumosEnAlerta > 0
                  ? 'Con stock por debajo del mínimo'
                  : 'Todo el stock en nivel normal'}
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* 3 Pestañas del Inicio */}
      <InicioCentroTabs
        bahiasMostradas={bahiasMostradas}
        sinTelemetriaReal={sinTelemetriaReal}
        errorSimuladores={errorSimuladores}
        errorVisitas={errorVisitas}
        visitasProximas={visitasProximas}
        insumosEnAlerta={insumosEnAlerta}
        esSuperadmin={perfilActual?.rol === 'superadmin'}
        usuariosRoles={usuariosRoles}
        usuarioActualId={perfilActual?.id ?? ''}
      />
    </div>
  );
}
