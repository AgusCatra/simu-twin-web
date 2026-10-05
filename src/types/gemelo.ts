import type * as THREE from 'three';

export type TipoSimulador =
  | 'autoelevador'
  | 'pala-frontal'
  | 'retroexcavadora'
  | 'grua-telescopica'
  | 'tractor'
  | 'camion'
  | 'simspray';

export type EstadoSimulador = 'detenido' | 'operando';

export interface ConfiguracionEstacion {
  id: string;
  nombre: string;
  tipo: TipoSimulador;
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
  | 'retornando';

export interface OperarioState {
  id: string;
  estacionId: string;
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

export type EstadoPuesto = 'operando' | 'libre';

export interface FichaTecnicaSimulador {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoSimulador;
  estado: EstadoPuesto;
  especificacionesHardware: {
    pantallas: string;
    mandos: string;
    plataforma: string;
  };
  modulosPedagogicos: string[];
  detalles: string;
  instructor?: string;
  horaInicio?: string;
}

export interface GemeloGalponCanvasProps {
  estados: Record<string, EstadoSimulador>;
  estacionSeleccionada: string | null;
  onToggleEstacion?: (id: string) => void;
  onSeleccionarEstacion: (id: string | null) => void;
  camaraSeguimiento?: boolean;
}
