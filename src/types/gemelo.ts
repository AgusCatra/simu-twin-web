import type * as THREE from 'three';

export type SimuladorSlug =
  | 'autoelevador'
  | 'excavadora'
  | 'retroexcavadora'
  | 'grua'
  | 'tractor'
  | 'camion'
  | 'simspray';

export type TipoSimulador = SimuladorSlug;

export type CodigoBahia =
  | 'SIM-01'
  | 'SIM-02'
  | 'SIM-03'
  | 'SIM-04'
  | 'SIM-05'
  | 'SIM-06'
  | 'SIM-07';

export type NumeroPuesto = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type EstadoSimulador = 'libre' | 'en_operacion' | 'mantenimiento';

export const SLUGS_SIMULADORES: readonly SimuladorSlug[] = [
  'autoelevador',
  'excavadora',
  'retroexcavadora',
  'grua',
  'tractor',
  'camion',
  'simspray',
] as const;

export const ESTADOS_SIMULADOR: readonly EstadoSimulador[] = [
  'libre',
  'en_operacion',
  'mantenimiento',
] as const;

export function esSimuladorSlug(valor: unknown): valor is SimuladorSlug {
  return (
    typeof valor === 'string' &&
    (SLUGS_SIMULADORES as readonly string[]).includes(valor)
  );
}

export function esEstadoSimulador(valor: unknown): valor is EstadoSimulador {
  return (
    typeof valor === 'string' &&
    (ESTADOS_SIMULADOR as readonly string[]).includes(valor)
  );
}

/** Fila exacta de la tabla `public.simuladores` en Supabase. */
export type SimuladorRowDB = {
  id: string;
  nombre: string;
  estado: EstadoSimulador;
  horas_uso_totales: number | null;
  ultimo_mantenimiento: string | null;
  actualizado_el: string | null;
  actividad_actual_id: string | null;
};

export interface EspecificacionesHardware {
  pantallas: string;
  mandos: string;
  plataforma: string;
}

export interface MetadataEstacion {
  slug: SimuladorSlug;
  codigoBahia: CodigoBahia;
  numeroPuesto: NumeroPuesto;
  nombreFallback: string;
  especificacionesHardware: EspecificacionesHardware;
  modulosPedagogicos: string[];
  detalles: string;
}

export const METADATA_BAHIAS: Readonly<Record<SimuladorSlug, MetadataEstacion>> = {
  autoelevador: {
    slug: 'autoelevador',
    codigoBahia: 'SIM-01',
    numeroPuesto: 1,
    nombreFallback: 'Simulador Autoelevador',
    especificacionesHardware: {
      pantallas: 'Bi-Pantalla panorámica FHD con simulación dinámica de espejos retrovisores',
      mandos: 'Volante con pomo de maniobra rápida de giro libre y banco cuádruple de palancas hidráulicas',
      plataforma: 'DynamicCockpit 3DOF con vibración háptica de chasis y detección de pérdida de tracción',
    },
    modulosPedagogicos: [
      'Estiba y desestiba de pallets en estanterías a 4 metros de elevación',
      'Maniobras de precisión en reversa con carga sobredimensionada ciega',
      'Circulación y frenado seguro en rampas de carga con pendiente pronunciada',
      'Protocolos de inspección pre-operacional y señalética vial en depósitos',
    ],
    detalles: 'Entrenamiento certificado para logística, centros de distribución y depósitos industriales.',
  },
  excavadora: {
    slug: 'excavadora',
    codigoBahia: 'SIM-02',
    numeroPuesto: 2,
    nombreFallback: 'Simulador Excavadora Hidráulica',
    especificacionesHardware: {
      pantallas: 'Triple pantalla envolvente de 135° con campo visual periférico inmersivo',
      mandos: 'Joysticks dobles proporcionales servo-asistidos y selectores de transmisión electrohidráulica',
      plataforma: 'Base cinemática de balanceo con cálculo dinámico de centro de masa y volcado',
    },
    modulosPedagogicos: [
      'Carga y descarga continua en tolvas y camiones volcadores de gran porte',
      'Nivelación, empuje y perfilado de terreno irregular en canteras',
      'Maniobras de aproximación en espacios confinados y cortes de talud',
      'Protocolos de parada de emergencia y control de estabilidad bajo carga máxima',
    ],
    detalles: 'Puesto de alta demanda para obras viales municipales, movimientos de suelo y canteras.',
  },
  retroexcavadora: {
    slug: 'retroexcavadora',
    codigoBahia: 'SIM-03',
    numeroPuesto: 3,
    nombreFallback: 'Simulador Retroexcavadora',
    especificacionesHardware: {
      pantallas: 'Pantalla frontal ultra-wide con vista simultánea de cazo, balde y zapatas estabilizadoras',
      mandos: 'Puesto reversible con volante delantero y mandos traseros excavadores dobles',
      plataforma: 'Suspensión amortiguada con sensores de esfuerzo de penetración en suelo duro',
    },
    modulosPedagogicos: [
      'Apertura de zanjas de precisión para tendido de cañerías y fibra óptica',
      'Operación y anclaje con zapatas estabilizadoras en pendientes críticas',
      'Coordinación de balde frontal para limpieza, despeje y carga de material',
      'Protocolo de seguridad contra interferencias de servicios públicos enterrados',
    ],
    detalles: 'Equipo versátil para mantenimiento urbano, obra pública, zanjeo y saneamiento.',
  },
  grua: {
    slug: 'grua',
    codigoBahia: 'SIM-04',
    numeroPuesto: 4,
    nombreFallback: 'Simulador Grúa Móvil / Torre',
    especificacionesHardware: {
      pantallas: 'Triple pantalla en ángulo con visualización de pluma, anemómetro e indicador de carga',
      mandos: 'Consola de mando LMI con doble palanca multiaxial y limitador de momento',
      plataforma: 'Simulación de ráfagas de viento cruzado, flexión de pluma y estabilidad de orugas',
    },
    modulosPedagogicos: [
      'Lectura e interpretación de tablas de carga y radios de trabajo en tiempo real',
      'Izaje crítico de estructuras pesadas con control de balanceo de gancho',
      'Emplazamiento, nivelación y despliegue seguro de estabilizadores hidráulicos',
      'Señalización normalizada de rigger y comunicación radial en maniobras ciegas',
    ],
    detalles: 'Simulación de alta complejidad técnica para montajes industriales, pórticos y logística pesada.',
  },
  tractor: {
    slug: 'tractor',
    codigoBahia: 'SIM-05',
    numeroPuesto: 5,
    nombreFallback: 'Simulador Tractor Agrícola',
    especificacionesHardware: {
      pantallas: 'Bi-Pantalla con telemetría de implementos agrícolas y barra de guiado satelital',
      mandos: 'Volante con guiado GPS, palanca CommandPRO y monitor de control de siembra virtual',
      plataforma: 'Cabina climatizada simulada con inclinación por ondulaciones de lote agrícola',
    },
    modulosPedagogicos: [
      'Siembra de precisión con guiado satelital y auto-guía milimétrica',
      'Labor de suelo profundo con rastra de discos y subsolador hidráulico',
      'Maniobras en cabeceras de lote con implemento ancho y control de pisada',
      'Optimización de consumo de combustible, patinamiento y régimen de motor',
    ],
    detalles: 'Eje estratégico para la tecnificación y capacitación del sector agroproductivo regional.',
  },
  camion: {
    slug: 'camion',
    codigoBahia: 'SIM-06',
    numeroPuesto: 6,
    nombreFallback: 'Simulador Camión Pesado',
    especificacionesHardware: {
      pantallas: 'Triple pantalla panorámica envolvente con retrovisores digitales gran angular',
      mandos: 'Volante de gran diámetro con retarder, selector de transmisión sincronizada y pedalera completa',
      plataforma: 'Cabina neumática con sensación real de transferencia de masa, frenado y acople',
    },
    modulosPedagogicos: [
      'Conducción defensiva y económica en rutas, autopistas y accesos urbanos',
      'Dosificación de frenado con retarder y freno motor en pendientes pronunciadas',
      'Maniobras de acople, desenganche y retroceso guiado con semirremolque',
      'Control y reacción del vehículo en calzada húmeda, aquaplaning y niebla densa',
    ],
    detalles: 'Formación profesional para choferes de transporte interurbano, cargas pesadas y sustancias peligrosas.',
  },
  simspray: {
    slug: 'simspray',
    codigoBahia: 'SIM-07',
    numeroPuesto: 7,
    nombreFallback: 'Simulador SimSpray Pintura VR',
    especificacionesHardware: {
      pantallas: 'Tótem instructor táctil + Visor de Realidad Virtual inmersivo de alta definición',
      mandos: 'Pistola aerográfica física profesional con gatillo de doble acción y retroalimentación háptica',
      plataforma: 'Sistema de tracking óptico tridimensional en V para seguimiento milimétrico en tiempo real',
    },
    modulosPedagogicos: [
      'Control de ángulo, distancia de atomización y velocidad constante de pasada',
      'Medición de espesor de capa húmeda/seca en micrones sin desperdicio',
      'Eficiencia de transferencia de pintura y técnicas para evitar chorreaduras',
      'Aplicación en piezas automotrices complejas, perfiles estructurales y tanques',
    ],
    detalles: 'Entrenamiento ecológico sin emisión de VOCs, sin solventes ni desperdicio de pintura real.',
  },
};

export interface ConfiguracionEstacion {
  id: SimuladorSlug;
  codigoBahia: CodigoBahia;
  numeroPuesto: NumeroPuesto;
  nombre: string;
  tipo: SimuladorSlug;
  subtipo?: string;
  pos: [number, number, number];
  rotY: number;
  color: number;
  detalles: string;
}

export type OperarioFase =
  | 'espera'
  | 'caminando'
  | 'sentandose'
  | 'operando'
  | 'levantandose'
  | 'saliendo';

export interface OperarioState {
  id: string;
  estacionId: SimuladorSlug;
  mesh: THREE.Group;
  targetPos: [number, number, number];
  startPos: [number, number, number];
  fase: OperarioFase;
  progreso: number;
  piernaIzq?: THREE.Mesh;
  piernaDer?: THREE.Mesh;
  brazoIzq?: THREE.Mesh;
  brazoDer?: THREE.Mesh;
  visorVR?: THREE.Mesh;
}

export interface InstanciaEstacion3D {
  config: ConfiguracionEstacion;
  group: THREE.Group;
  ledStatus: THREE.Mesh;
  pantallas: THREE.Mesh[];
  asiento: THREE.Object3D;
  operario?: OperarioState;
  baseY: number;
}

export interface SCADANaveStatus {
  totalEstaciones: number;
  activas: number;
  consumoKWh: number;
  temperaturaAmbiente: number;
  tiempoOperacionSeg: number;
}

export interface FichaTecnicaSimulador {
  id: SimuladorSlug;
  codigo: CodigoBahia;
  numeroPuesto: NumeroPuesto;
  nombre: string;
  tipo: SimuladorSlug;
  estado: EstadoSimulador;
  horasUsoTotales: number;
  ultimoMantenimiento: string | null;
  actualizadoEl: string | null;
  actividadActualId: string | null;
  especificacionesHardware: EspecificacionesHardware;
  modulosPedagogicos: string[];
  detalles: string;
  instructor?: string;
  horaInicio?: string;
}

export function parseHorasUso(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return valor;
  }
  if (typeof valor === 'string' && valor.trim().length > 0) {
    const parsed = Number(valor);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function mapearSimuladorDesdeDB(
  fila: SimuladorRowDB & { id: SimuladorSlug }
): FichaTecnicaSimulador {
  const meta = METADATA_BAHIAS[fila.id];
  const estado: EstadoSimulador = esEstadoSimulador(fila.estado)
    ? fila.estado
    : 'libre';

  return {
    id: meta.slug,
    codigo: meta.codigoBahia,
    numeroPuesto: meta.numeroPuesto,
    nombre:
      fila.nombre && fila.nombre.trim().length > 0
        ? fila.nombre
        : meta.nombreFallback,
    tipo: meta.slug,
    estado,
    horasUsoTotales: parseHorasUso(fila.horas_uso_totales) ?? 0,
    ultimoMantenimiento: fila.ultimo_mantenimiento,
    actualizadoEl: fila.actualizado_el,
    actividadActualId: fila.actividad_actual_id,
    especificacionesHardware: meta.especificacionesHardware,
    modulosPedagogicos: meta.modulosPedagogicos,
    detalles: meta.detalles,
  };
}

export interface GemeloGalponCanvasProps {
  simuladores: FichaTecnicaSimulador[];
  estacionSeleccionada: SimuladorSlug | null;
  onToggleEstacion?: (id: SimuladorSlug) => void;
  onSeleccionarEstacion: (id: SimuladorSlug | null) => void;
  camaraSeguimiento?: boolean;
}
