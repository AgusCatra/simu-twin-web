import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ETIQUETAS_TIPO_ACTIVIDAD,
  type EstadoActividad,
  type GeneroParticipante,
  type TipoActividad,
} from '@/types/actividades';
import { calcularHorasHombreYMaquina } from '@/lib/horas-capacitacion';
import { METADATA_BAHIAS, SLUGS_SIMULADORES, type SimuladorSlug } from '@/types/gemelo';

export interface UsoSimuladorResumen {
  id: SimuladorSlug;
  codigoBahia: string;
  nombre: string;
  horasOdometro: number;
  horasActividades: number;
  sesionesActividades: number;
  sesionesCohorte: number;
  horasCohorte: number;
  horasHombreCohorte?: number;
  horasConsolidadas: number;
}

export interface ResumenGenero {
  hombre: number;
  mujer: number;
  otro: number;
  no_especifica: number;
}

export interface ResumenPuestoItem {
  puesto: string;
  cantidad: number;
}

export interface ResumenTipoActividadItem {
  tipo: TipoActividad;
  etiqueta: string;
  actividades: number;
  participantes: number;
  horas: number;
}

export interface ResumenVisitasHistoricas {
  visitasRealizadas: number;
  visitasActivas: number;
  colegiosRecibidos: number;
  colegiosTotalesNoCancelados: number;
  alumnosAsistidosRealizados: number;
  alumnosProgramadosActivos: number;
  trasladosTupCompletados: number;
  unidadesStockDescontadas: number;
  kitsCompletosEstimados: number;
}

export interface EstadisticasGlobalesCentro {
  horasTotalesFlota: number;
  horasHombreCapacitacion?: number;
  totalSesionesRegistradas: number;
  totalActividades: number;
  alcance: {
    participantesActividades: number;
    alumnosVisitas: number;
    docentesVisitas: number;
    postulantesEmpleo: number;
    totalPersonas: number;
  };
  usoPorSimulador: UsoSimuladorResumen[];
  demografia: {
    porGenero: ResumenGenero;
    porPuesto: ResumenPuestoItem[];
    porTipoActividad: ResumenTipoActividadItem[];
  };
  visitasHistoricas: ResumenVisitasHistoricas;
}

export interface MetricasLandingCentro {
  puestosActivos: number;
  horasPracticaTotales: number;
  escuelasRecibidas: number;
  personasAlcanzadas: number;
}

interface FilaSimuladorEst {
  id: string;
  nombre: string | null;
  horas_uso_totales: number | null;
}

interface FilaActSimEst {
  simulador_id: string;
  minutos_uso: number | null;
}

interface FilaActividadEst {
  id: string;
  tipo: string;
  estado: string;
  duracion_minutos: number | null;
}

interface FilaParticipanteEst {
  actividad_id: string;
  genero: string;
  puesto: string | null;
}

interface FilaVisitaEst {
  id: string;
  id_escuela: string | null;
  otra_institucion_nombre: string | null;
  cant_alumnos: number | null;
  asistencia_real_alumnos: number | null;
  requiere_tup: boolean | null;
  tup_estado_traslado: string | null;
  estado_visita: string;
}

interface FilaAsistenteEst {
  id_visita: string;
  rol: string | null;
}

interface FilaSesionPracticaEst {
  cohorte_id: string | null;
  dupla_id: string | null;
  numero_sesion: number | null;
  fecha_programada: string | null;
  fecha_real: string | null;
  estado_asistencia: string;
}

interface FilaMovimientoEst {
  visita_id: string | null;
  cantidad: number | null;
}

const TIPOS_ACTIVIDAD_ORDEN: readonly TipoActividad[] = [
  'empresa',
  'institucional',
  'capacitacion',
  'visita_especial',
  'mantenimiento',
  'otro',
];

function numSeguro(val: number | null | undefined): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : 0;
}

function esTipoActividadValido(v: string): v is TipoActividad {
  return (TIPOS_ACTIVIDAD_ORDEN as readonly string[]).includes(v);
}

function esEstadoActividadValido(v: string): v is EstadoActividad {
  return v === 'planificada' || v === 'en_curso' || v === 'finalizada';
}

function normalizarGenero(v: string): GeneroParticipante {
  if (v === 'hombre' || v === 'mujer' || v === 'otro') return v;
  return 'no_especifica';
}

function crearEstadisticasVacias(): EstadisticasGlobalesCentro {
  return {
    horasTotalesFlota: 0,
    totalSesionesRegistradas: 0,
    totalActividades: 0,
    alcance: {
      participantesActividades: 0,
      alumnosVisitas: 0,
      docentesVisitas: 0,
      postulantesEmpleo: 0,
      totalPersonas: 0,
    },
    usoPorSimulador: SLUGS_SIMULADORES.map((slug) => ({
      id: slug,
      codigoBahia: METADATA_BAHIAS[slug].codigoBahia,
      nombre: METADATA_BAHIAS[slug].nombreFallback,
      horasOdometro: 0,
      horasActividades: 0,
      sesionesActividades: 0,
      sesionesCohorte: 0,
      horasCohorte: 0,
      horasConsolidadas: 0,
    })),
    demografia: {
      porGenero: { hombre: 0, mujer: 0, otro: 0, no_especifica: 0 },
      porPuesto: [],
      porTipoActividad: TIPOS_ACTIVIDAD_ORDEN.map((tipo) => ({
        tipo,
        etiqueta: ETIQUETAS_TIPO_ACTIVIDAD[tipo],
        actividades: 0,
        participantes: 0,
        horas: 0,
      })),
    },
    visitasHistoricas: {
      visitasRealizadas: 0,
      visitasActivas: 0,
      colegiosRecibidos: 0,
      colegiosTotalesNoCancelados: 0,
      alumnosAsistidosRealizados: 0,
      alumnosProgramadosActivos: 0,
      trasladosTupCompletados: 0,
      unidadesStockDescontadas: 0,
      kitsCompletosEstimados: 0,
    },
  };
}

/**
 * Agregador consolidado en tiempo real para los paneles administrativos
 * (`/admin/registro-actividades`, `/admin/visitas-educativas`, `/admin`).
 */
export async function obtenerEstadisticasGlobalesCentro(): Promise<EstadisticasGlobalesCentro> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return crearEstadisticasVacias();
  }

  const db = createAdminClient() ?? supabase;

  const [
    resSim,
    resActSim,
    resActs,
    resPart,
    resVisitas,
    resAsistentes,
    resPostulantes,
    resSesiones,
    resMovs,
  ] = await Promise.all([
    db
      .from('simuladores')
      .select('id, nombre, horas_uso_totales')
      .returns<FilaSimuladorEst[]>(),
    db
      .from('actividad_simuladores')
      .select('simulador_id, minutos_uso')
      .returns<FilaActSimEst[]>(),
    db
      .from('actividades')
      .select('id, tipo, estado, duracion_minutos')
      .returns<FilaActividadEst[]>(),
    db
      .from('actividad_participantes')
      .select('actividad_id, genero, puesto')
      .returns<FilaParticipanteEst[]>(),
    db
      .from('visitas_educativas')
      .select(
        'id, id_escuela, otra_institucion_nombre, cant_alumnos, asistencia_real_alumnos, requiere_tup, tup_estado_traslado, estado_visita'
      )
      .returns<FilaVisitaEst[]>(),
    db
      .from('visita_asistentes')
      .select('id_visita, rol')
      .returns<FilaAsistenteEst[]>(),
    db.from('postulantes').select('id', { count: 'exact', head: true }),
    db
      .from('sesiones_practica')
      .select('cohorte_id, dupla_id, numero_sesion, fecha_programada, fecha_real, estado_asistencia')
      .returns<FilaSesionPracticaEst[]>(),
    db
      .from('stock_movimientos')
      .select('visita_id, cantidad')
      .eq('tipo', 'visita_escolar')
      .returns<FilaMovimientoEst[]>(),
  ]);

  const filasSim = resSim.data ?? [];
  const filasActSim = resActSim.data ?? [];
  const filasActs = resActs.data ?? [];
  const filasPart = resPart.data ?? [];
  const filasVisitas = resVisitas.data ?? [];
  const filasAsistentes = resAsistentes.data ?? [];
  const postulantesCount = resPostulantes.count ?? 0;
  const filasSesiones = resSesiones.data ?? [];
  const filasMovs = resMovs.data ?? [];

  // 1. Uso por simulador (los 7 equipos + sesiones de cohorte en autoelevador)
  const simMap = new Map<string, FilaSimuladorEst>();
  for (const s of filasSim) simMap.set(s.id, s);

  const actPorSim = new Map<string, { minutos: number; sesiones: number }>();
  for (const asim of filasActSim) {
    const prev = actPorSim.get(asim.simulador_id) ?? { minutos: 0, sesiones: 0 };
    prev.minutos += Math.max(0, numSeguro(asim.minutos_uso));
    prev.sesiones += 1;
    actPorSim.set(asim.simulador_id, prev);
  }

  const {
    sesionesPresentes,
    turnosMaquinaActivos,
    horasHombreSimulador,
    horasMaquinaSimulador,
  } = calcularHorasHombreYMaquina(filasSesiones);

  const usoPorSimulador: UsoSimuladorResumen[] = SLUGS_SIMULADORES.map((slug) => {
    const meta = METADATA_BAHIAS[slug];
    const row = simMap.get(slug);
    const act = actPorSim.get(slug) ?? { minutos: 0, sesiones: 0 };
    const horasOdometro = Number(numSeguro(row?.horas_uso_totales).toFixed(2));
    const horasActividades = Number((act.minutos / 60).toFixed(2));
    const esAutoelevador = slug === 'autoelevador';
    const sesionesCohorte = esAutoelevador ? turnosMaquinaActivos : 0;
    // Horas-Máquina de SIM-01: 1.0 h reloj por turno de dupla (sin duplicar por 2 alumnos)
    const horasCohorte = esAutoelevador ? horasMaquinaSimulador : 0;
    const horasBase = Math.max(horasOdometro, horasActividades);
    // Evita doble conteo si el odómetro persistido ya fue actualizado por sesiones
    const horasConsolidadas = Number(
      Math.max(horasBase, horasActividades + horasCohorte).toFixed(2)
    );

    return {
      id: slug,
      codigoBahia: meta.codigoBahia,
      nombre: row?.nombre?.trim() || meta.nombreFallback,
      horasOdometro,
      horasActividades,
      sesionesActividades: act.sesiones,
      sesionesCohorte,
      horasCohorte,
      horasHombreCohorte: esAutoelevador ? horasHombreSimulador : 0,
      horasConsolidadas,
    };
  });

  const horasTotalesFlota = Number(
    usoPorSimulador.reduce((acc, s) => acc + s.horasConsolidadas, 0).toFixed(2)
  );
  const totalSesionesRegistradas =
    usoPorSimulador.reduce((acc, s) => acc + s.sesionesActividades, 0) +
    sesionesPresentes;

  // 2. Perfil demográfico, ocupacional y distribución por tipo de actividad
  const porGenero: ResumenGenero = {
    hombre: 0,
    mujer: 0,
    otro: 0,
    no_especifica: 0,
  };
  const puestosConteo = new Map<string, number>();
  const partPorActividad = new Map<string, number>();

  for (const p of filasPart) {
    const g = normalizarGenero(p.genero);
    porGenero[g] += 1;

    const puestoLimpio = (p.puesto ?? '').trim();
    const etiquetaPuesto =
      puestoLimpio.length > 0
        ? puestoLimpio.charAt(0).toUpperCase() + puestoLimpio.slice(1)
        : 'Sin especificar';
    puestosConteo.set(etiquetaPuesto, (puestosConteo.get(etiquetaPuesto) ?? 0) + 1);

    partPorActividad.set(
      p.actividad_id,
      (partPorActividad.get(p.actividad_id) ?? 0) + 1
    );
  }

  const porPuesto: ResumenPuestoItem[] = Array.from(puestosConteo.entries())
    .map(([puesto, cantidad]) => ({ puesto, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 8);

  const tipoMap = new Map<
    TipoActividad,
    { actividades: number; participantes: number; minutos: number }
  >();
  for (const tipo of TIPOS_ACTIVIDAD_ORDEN) {
    tipoMap.set(tipo, { actividades: 0, participantes: 0, minutos: 0 });
  }

  for (const a of filasActs) {
    const tipoValido: TipoActividad = esTipoActividadValido(a.tipo) ? a.tipo : 'otro';
    const estadoValido: EstadoActividad = esEstadoActividadValido(a.estado)
      ? a.estado
      : 'planificada';
    const bucket = tipoMap.get(tipoValido)!;
    bucket.actividades += 1;
    bucket.participantes += partPorActividad.get(a.id) ?? 0;
    if (estadoValido !== 'planificada') {
      bucket.minutos += Math.max(0, numSeguro(a.duracion_minutos));
    }
  }

  const porTipoActividad: ResumenTipoActividadItem[] = TIPOS_ACTIVIDAD_ORDEN.map(
    (tipo) => {
      const b = tipoMap.get(tipo)!;
      return {
        tipo,
        etiqueta: ETIQUETAS_TIPO_ACTIVIDAD[tipo],
        actividades: b.actividades,
        participantes: b.participantes,
        horas: Number((b.minutos / 60).toFixed(1)),
      };
    }
  );

  // 3. Visitas escolares e impacto histórico
  const asistentesPorVisita = new Map<
    string,
    { alumnos: number; docentes: number }
  >();
  for (const a of filasAsistentes) {
    const actual = asistentesPorVisita.get(a.id_visita) ?? {
      alumnos: 0,
      docentes: 0,
    };
    if ((a.rol ?? '').toLowerCase() === 'docente') {
      actual.docentes += 1;
    } else {
      actual.alumnos += 1;
    }
    asistentesPorVisita.set(a.id_visita, actual);
  }

  const escuelasRealizadas = new Set<string>();
  const escuelasNoCanceladas = new Set<string>();
  let visitasRealizadas = 0;
  let visitasActivas = 0;
  let alumnosAsistidosRealizados = 0;
  let alumnosProgramadosActivos = 0;
  let docentesVisitas = 0;
  let trasladosTupCompletados = 0;

  for (const v of filasVisitas) {
    if (v.estado_visita === 'Cancelada') continue;
    visitasActivas += 1;

    const claveInst =
      v.id_escuela?.trim() ||
      v.otra_institucion_nombre?.trim().toLowerCase() ||
      v.id;
    escuelasNoCanceladas.add(claveInst);

    const nomina = asistentesPorVisita.get(v.id);
    const cantAlumnosVisita =
      nomina && nomina.alumnos > 0
        ? nomina.alumnos
        : numSeguro(v.asistencia_real_alumnos) > 0
          ? numSeguro(v.asistencia_real_alumnos)
          : Math.max(0, numSeguro(v.cant_alumnos));

    alumnosProgramadosActivos += cantAlumnosVisita;
    docentesVisitas += nomina?.docentes ?? 0;

    if (v.estado_visita === 'Finalizada') {
      visitasRealizadas += 1;
      escuelasRealizadas.add(claveInst);
      alumnosAsistidosRealizados += cantAlumnosVisita;
    }

    if (
      v.requiere_tup &&
      (v.tup_estado_traslado === 'finalizado' || v.estado_visita === 'Finalizada')
    ) {
      trasladosTupCompletados += 1;
    }
  }

  let unidadesStockDescontadas = 0;
  const maxPorVisita = new Map<string, number>();
  for (const mov of filasMovs) {
    const cant = Math.max(0, numSeguro(mov.cantidad));
    unidadesStockDescontadas += cant;
    if (mov.visita_id) {
      maxPorVisita.set(
        mov.visita_id,
        Math.max(maxPorVisita.get(mov.visita_id) ?? 0, cant)
      );
    }
  }
  const kitsCompletosEstimados = Array.from(maxPorVisita.values()).reduce(
    (acc, n) => acc + n,
    0
  );

  const alumnosVisitas = alumnosProgramadosActivos;
  const participantesActividades = filasPart.length;
  const totalPersonas =
    participantesActividades + alumnosVisitas + docentesVisitas + postulantesCount;

  return {
    horasTotalesFlota,
    horasHombreCapacitacion: horasHombreSimulador,
    totalSesionesRegistradas,
    totalActividades: filasActs.length,
    alcance: {
      participantesActividades,
      alumnosVisitas,
      docentesVisitas,
      postulantesEmpleo: postulantesCount,
      totalPersonas,
    },
    usoPorSimulador,
    demografia: {
      porGenero,
      porPuesto,
      porTipoActividad,
    },
    visitasHistoricas: {
      visitasRealizadas,
      visitasActivas,
      colegiosRecibidos: escuelasRealizadas.size,
      colegiosTotalesNoCancelados: escuelasNoCanceladas.size,
      alumnosAsistidosRealizados,
      alumnosProgramadosActivos,
      trasladosTupCompletados,
      unidadesStockDescontadas,
      kitsCompletosEstimados,
    },
  };
}

/**
 * Métricas agregadas no sensibles para la Landing Pública (`/`).
 * Devuelve únicamente totales numéricos (cero PII).
 */
export async function obtenerMetricasLandingCentro(): Promise<MetricasLandingCentro> {
  try {
    const supabase = await createClient();
    const db = createAdminClient() ?? supabase;

    const [
      resSim,
      resSesiones,
      resVisitas,
      resParticipantes,
      resPostulantes,
    ] = await Promise.all([
      db
        .from('simuladores')
        .select('id, horas_uso_totales')
        .returns<Array<{ id: string; horas_uso_totales: number | null }>>(),
      db
        .from('sesiones_practica')
        .select('cohorte_id, dupla_id, numero_sesion, fecha_programada, fecha_real, estado_asistencia')
        .eq('estado_asistencia', 'PRESENTE')
        .returns<FilaSesionPracticaEst[]>(),
      db
        .from('visitas_educativas')
        .select('id, id_escuela, otra_institucion_nombre, cant_alumnos, estado_visita')
        .neq('estado_visita', 'Cancelada')
        .returns<
          Array<{
            id: string;
            id_escuela: string | null;
            otra_institucion_nombre: string | null;
            cant_alumnos: number | null;
            estado_visita: string;
          }>
        >(),
      db.from('actividad_participantes').select('id', { count: 'exact', head: true }),
      db.from('postulantes').select('id', { count: 'exact', head: true }),
    ]);

    const simuladoresCount = (resSim.data ?? []).filter((s) =>
      (SLUGS_SIMULADORES as readonly string[]).includes(s.id)
    ).length;

    const horasSimuladores = (resSim.data ?? []).reduce(
      (acc, s) => acc + Math.max(0, numSeguro(s.horas_uso_totales)),
      0
    );
    const { horasMaquinaSimulador: horasCohortes } = calcularHorasHombreYMaquina(
      resSesiones.data ?? []
    );

    const escuelasUnicas = new Set<string>();
    let alumnosVisitas = 0;
    for (const v of resVisitas.data ?? []) {
      const clave =
        v.id_escuela?.trim() ||
        v.otra_institucion_nombre?.trim().toLowerCase() ||
        v.id;
      escuelasUnicas.add(clave);
      alumnosVisitas += Math.max(0, numSeguro(v.cant_alumnos));
    }

    const personasAlcanzadas =
      (resParticipantes.count ?? 0) +
      (resPostulantes.count ?? 0) +
      alumnosVisitas;

    return {
      puestosActivos: simuladoresCount > 0 ? simuladoresCount : 7,
      horasPracticaTotales: Math.round(horasSimuladores + horasCohortes),
      escuelasRecibidas: escuelasUnicas.size,
      personasAlcanzadas,
    };
  } catch (err) {
    console.error('[obtenerMetricasLandingCentro] Fallback por error de lectura:', {
      message: err instanceof Error ? err.message : 'Error de red',
    });
    return {
      puestosActivos: 7,
      horasPracticaTotales: 0,
      escuelasRecibidas: 0,
      personasAlcanzadas: 0,
    };
  }
}
