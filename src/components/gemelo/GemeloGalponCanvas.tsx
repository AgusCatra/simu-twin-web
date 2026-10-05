'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  ConfiguracionEstacion,
  EstadoSimulador,
  GemeloGalponCanvasProps,
} from '@/types/gemelo';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES DE COTAS Y DIMENSIONES
// ═══════════════════════════════════════════════════════════════════
const COTA = {
  SUELO: 0.0,
  REJILLA: 0.003,
  LINEA: 0.005,
  CHAPA: 0.54,
  ALFOMBRA: 0.543,
  COJIN: 0.85,
  BUTACA_Z: 0.22,
  COL_Z: -0.46,
  PEDAL_Z: -0.15,
  POD_X: 0.36,
  MON_Y: 1.3,
  MON_FZ: -1.45,
  MON_RZ: 1.15,
  MON_LX: 0.98,
  MON_LZ: -1.35,
  MON_ROTY: 0.55,
  DISPLAY_Z: 0.027,
  DELTA: 0.003,
};

// ═══════════════════════════════════════════════════════════════════
// DEFINICIÓN DE LAS 7 ESTACIONES INDUSTRIALES
// ═══════════════════════════════════════════════════════════════════
const ESTACIONES_CONFIG: Array<ConfiguracionEstacion & { pantallas?: string; mandos?: string }> = [
  {
    id: 'autoelevador',
    nombre: 'Autoelevador Industrial',
    tipo: 'autoelevador',
    pos: [6.4, 0, -0.5],
    rotY: 0,
    color: 0x10b981,
    pantallas: 'bi_pantalla',
    mandos: 'volante_industrial',
    detalles: 'Simulador bi-pantalla apaisado paralelo a pared este',
  },
  {
    id: 'pala-frontal',
    nombre: 'Pala Cargadora Frontal / Excavadora Hidráulica',
    tipo: 'pala-frontal',
    pos: [5.5, 0, -4.8],
    rotY: -Math.PI / 4,
    color: 0x00a887,
    pantallas: 'triple',
    mandos: 'joysticks_duales',
    detalles: 'Esquina noreste a 45°, 3 pantallas espaldas a la esquina',
  },
  {
    id: 'retroexcavadora',
    nombre: 'Retroexcavadora / Telehandler',
    tipo: 'retroexcavadora',
    pos: [0.0, 0, -5.4],
    rotY: 0,
    color: 0x10b981,
    pantallas: 'mono',
    mandos: 'volante_industrial',
    detalles: 'Pared norte, monitores hacia la pared, asiento hacia el centro',
  },
  {
    id: 'grua-telescopica',
    nombre: 'Grúa Telescópica / Izaje Industrial',
    tipo: 'grua-telescopica',
    pos: [-5.5, 0, -4.8],
    rotY: Math.PI / 4,
    color: 0x0d9488,
    pantallas: 'triple',
    mandos: 'joysticks_duales',
    detalles: 'Esquina noroeste a 45°, 3 pantallas espaldas a la esquina',
  },
  {
    id: 'tractor',
    nombre: 'Tractor Agrícola / Implementos',
    tipo: 'tractor',
    pos: [-6.4, 0, -0.5],
    rotY: 0,
    color: 0x10b981,
    pantallas: 'bi_pantalla',
    mandos: 'volante_industrial',
    detalles: 'Apaisado paralelo a pared oeste',
  },
  {
    id: 'camion',
    nombre: 'Camión Pesado de Cargas',
    tipo: 'camion',
    pos: [-6.0, 0, 3.8],
    rotY: Math.PI / 2,
    color: 0x047857,
    pantallas: 'triple',
    mandos: 'volante_camion',
    detalles: 'Pared oeste perpendicular con cabina triple',
  },
  {
    id: 'simspray',
    nombre: 'SimSpray VR · Pintura Industrial',
    tipo: 'simspray',
    pos: [-2.5, 0, 4.8],
    rotY: 0,
    color: 0x00a887,
    detalles: 'Tótem interactivo con casco de Realidad Virtual y pistola de pulverizado',
  },
];

interface OperarioAnimado {
  id: number;
  estacionId: string;
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  brazoIzq: { hombro: THREE.Group; codo: THREE.Group };
  brazoDer: { hombro: THREE.Group; codo: THREE.Group };
  piernaIzq: { cadera: THREE.Group; rodilla: THREE.Group };
  piernaDer: { cadera: THREE.Group; rodilla: THREE.Group };
  pistolaMano: THREE.Group;
  visorVR: THREE.Mesh;
  estado: 'inactivo' | 'caminando' | 'subiendo' | 'operando' | 'bajando' | 'saliendo';
  estacion: EstacionInterna | null;
  ruta: THREE.Vector3[];
  idxRuta: number;
  fasePaso: number;
  progresoSubida: number;
  progresoBajada: number;
  posInicioAccion: THREE.Vector3;
  rotInicioAccion: number;
}

interface EstacionInterna {
  config: ConfiguracionEstacion & { pantallas?: string; mandos?: string };
  grupo: THREE.Group;
  DC: THREE.Group | null;
  butaca: THREE.Group | null;
  matPantalla: THREE.MeshStandardMaterial;
  luz: THREE.PointLight;
  volanteObj: THREE.Group | null;
  cascoButaca: THREE.Group | null;
  visorColgado?: THREE.Mesh;
  pistolaColgada?: THREE.Group;
  seed: number;
  enOperacion: boolean;
}

interface ExtendedGemeloProps extends GemeloGalponCanvasProps {
  grillaVisible?: boolean;
  rotarCamara?: boolean;
  resetCamaraTrigger?: number;
  onEstadoOperariosChange?: (activos: number, enCamino: number) => void;
}

export default function GemeloGalponCanvas({
  estados,
  estacionSeleccionada,
  camaraSeguimiento,
  grillaVisible = false,
  rotarCamara = false,
  resetCamaraTrigger = 0,
  onToggleEstacion,
  onSeleccionarEstacion,
  onEstadoOperariosChange,
}: ExtendedGemeloProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef(onToggleEstacion);
  const selectRef = useRef(onSeleccionarEstacion);
  const opChangeRef = useRef(onEstadoOperariosChange);
  const camaraSeguimientoRef = useRef(camaraSeguimiento);
  const rotarCamaraRef = useRef(rotarCamara);
  const estacionSeleccionadaRef = useRef(estacionSeleccionada);

  toggleRef.current = onToggleEstacion;
  selectRef.current = onSeleccionarEstacion;
  opChangeRef.current = onEstadoOperariosChange;
  camaraSeguimientoRef.current = camaraSeguimiento;
  rotarCamaraRef.current = rotarCamara;
  estacionSeleccionadaRef.current = estacionSeleccionada;

  const controlSceneRef = useRef<{
    toggleByIndex: (index: number) => void;
    setGridVisible: (v: boolean) => void;
    setRotar: (v: boolean) => void;
    resetCamera: () => void;
    syncEstados: (estados: Record<string, EstadoSimulador>) => void;
  } | null>(null);

  useEffect(() => {
    if (controlSceneRef.current) {
      controlSceneRef.current.setGridVisible(grillaVisible);
    }
  }, [grillaVisible]);

  useEffect(() => {
    if (controlSceneRef.current) {
      controlSceneRef.current.setRotar(rotarCamara);
    }
  }, [rotarCamara]);

  useEffect(() => {
    if (controlSceneRef.current && resetCamaraTrigger > 0) {
      controlSceneRef.current.resetCamera();
    }
  }, [resetCamaraTrigger]);

  useEffect(() => {
    if (controlSceneRef.current) {
      controlSceneRef.current.syncEstados(estados);
    }
  }, [estados]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ═══════════════════════════════════════════════════════════════════
    // MATERIALES COMPARTIDOS
    // ═══════════════════════════════════════════════════════════════════
    const M = {
      metalClaro: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.75, roughness: 0.35 }),
      metalMedio: new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.7, roughness: 0.4 }),
      metalOscuro: new THREE.MeshStandardMaterial({ color: 0x3c3f45, metalness: 0.6, roughness: 0.5 }),
      negro: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 }),
      asiento: new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.85 }),
      plastico: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6 }),
      goma: new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1.0 }),
      rojo: new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.5 }),
      amarillo: new THREE.MeshStandardMaterial({ color: 0xffc21c, roughness: 0.45 }),
      estop: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }),
      alfombra: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 1.0 }),
      hormigon: new THREE.MeshStandardMaterial({ color: 0x222327, roughness: 0.95 }),
      vial: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.65 }),
      reflectivo: new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.5, roughness: 0.25 }),
      cascoOp: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45 }),
      piel: new THREE.MeshStandardMaterial({ color: 0xb97a56, roughness: 0.8 }),
    };

    // ═══════════════════════════════════════════════════════════════════
    // ESCENA, CÁMARA Y RENDERER
    // ═══════════════════════════════════════════════════════════════════
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111216);
    scene.fog = new THREE.Fog(0x111216, 25, 75);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(13.0, 13.5, 15.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = false;
    controls.update();

    // ═══════════════════════════════════════════════════════════════════
    // ILUMINACIÓN AMBIENTE Y DIRECCIONAL
    // ═══════════════════════════════════════════════════════════════════
    scene.add(new THREE.AmbientLight(0x9aa5b5, 0.5));

    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(10, 14, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    key.shadow.bias = -0.0004;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8899bb, 0.35);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    // ═══════════════════════════════════════════════════════════════════
    // HELPERS GEOMÉTRICOS
    // ═══════════════════════════════════════════════════════════════════
    function mesh(
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      cast = true,
      recv = true
    ) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = recv;
      return m;
    }

    function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
      return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
    }

    function cyl(
      rt: number,
      rb: number,
      h: number,
      mat: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      seg = 24
    ) {
      return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
    }

    function hinge(px: number, py: number, pz: number, rotX: number) {
      const g = new THREE.Group();
      g.position.set(px, py, pz);
      g.rotation.x = rotX;
      return g;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PISO, GRILLA Y LÍNEA AMARILLA CONTINUA
    // ═══════════════════════════════════════════════════════════════════
    const piso = mesh(new THREE.PlaneGeometry(28, 22), M.hormigon, 0, COTA.SUELO, 0, false, true);
    piso.rotation.x = -Math.PI / 2;
    scene.add(piso);

    const grid = new THREE.GridHelper(28, 28, 0x555558, 0x2c2c30);
    grid.position.y = COTA.REJILLA;
    grid.visible = false;
    scene.add(grid);

    function crearTextoPiso(texto: string, x: number, z: number, rotZ: number, w: number, h: number) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(texto, 512, 64);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 4;
      const m = mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({
          map: tex,
          transparent: true,
          opacity: 0.88,
          roughness: 0.8,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
        x,
        COTA.LINEA + 0.001,
        z,
        false,
        true
      );
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rotZ;
      scene.add(m);
    }

    function crearLineaSeguridadUnica() {
      const g = new THREE.Group();
      scene.add(g);
      const esp = 0.14;

      function tramo(x1: number, z1: number, x2: number, z2: number) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        const mx = (x1 + x2) / 2;
        const mz = (z1 + z2) / 2;

        const b = box(esp, 0.005, len, M.vial, mx, COTA.LINEA, mz);
        b.rotation.y = -Math.atan2(dz, dx) + Math.PI / 2;
        g.add(b);

        const cap = cyl(esp / 2, esp / 2, 0.005, M.vial, x1, COTA.LINEA, z1, 16);
        g.add(cap);
        return b;
      }

      const pts: [number, number][] = [
        [4.8, 5.8],
        [4.8, -2.4],
        [3.4, -3.8],
        [-3.4, -3.8],
        [-4.6, -2.4],
        [-4.6, 2.8],
        [-4.6, 5.8],
        [-0.6, 5.8],
      ];

      for (let i = 0; i < pts.length - 1; i++) {
        tramo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      }
      const last = pts[pts.length - 1];
      g.add(cyl(esp / 2, esp / 2, 0.005, M.vial, last[0], COTA.LINEA, last[1], 16));

      crearTextoPiso('LÍNEA DE SEGURIDAD · CIRCULACIÓN RESTRINGIDA A OPERADORES', 0.2, 6.7, 0, 7.8, 0.35);

      const lUmbral = box(1.2, 0.005, esp, M.vial, 6.8, COTA.LINEA, 5.8);
      g.add(lUmbral);
      const jambaI = box(esp, 0.005, 0.6, M.vial, 6.2, COTA.LINEA, 5.8);
      g.add(jambaI);
      const jambaD = box(esp, 0.005, 0.6, M.vial, 7.4, COTA.LINEA, 5.8);
      g.add(jambaD);

      crearTextoPiso('ACCESO EXCLUSIVO OPERARIOS', 6.8, 5.2, 0, 1.8, 0.25);
      return g;
    }

    crearLineaSeguridadUnica();

    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DE SIMULADORES
    // ═══════════════════════════════════════════════════════════════════
    function crearEstacion(cfg: (typeof ESTACIONES_CONFIG)[number], seed: number): EstacionInterna {
      const E = new THREE.Group();
      E.name = 'Estacion_' + cfg.id;
      E.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      E.rotation.y = cfg.rotY;
      scene.add(E);

      const estStatic = new THREE.Group();
      E.add(estStatic);
      const DC = new THREE.Group();
      E.add(DC);

      const matPantalla = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        roughness: 0.25,
        emissive: 0x000000,
        emissiveIntensity: 0.0,
      });

      const luz = new THREE.PointLight(0xfff1d6, 0, 6.0);
      luz.position.set(0.6, 2.3, 0.6);
      estStatic.add(luz);

      function monitor(w: number, h: number) {
        const g = new THREE.Group();
        g.add(box(w, h, 0.045, M.negro));
        const scr = box(w - 0.06, h - 0.06, 0.01, matPantalla);
        scr.position.z = COTA.DISPLAY_Z;
        g.add(scr);
        g.add(box(0.1, 0.015, 0.005, M.metalOscuro, 0, -h / 2 + 0.015, 0.028));
        return g;
      }

      function torreFrontal() {
        const t = new THREE.Group();
        t.position.set(0, 0, COTA.MON_FZ);
        t.add(box(0.5, 0.04, 0.4, M.negro, 0, 0.02, 0));
        t.add(cyl(0.035, 0.035, 0.98, M.negro, 0, 0.53, 0));
        const m = monitor(0.96, 0.56);
        m.position.set(0, COTA.MON_Y, 0);
        m.rotation.x = -0.04;
        t.add(m);
        return t;
      }

      function torreTrasera() {
        const t = new THREE.Group();
        t.position.set(0, 0, COTA.MON_RZ);
        t.rotation.y = Math.PI;
        t.add(box(0.5, 0.04, 0.4, M.negro, 0, 0.02, 0));
        t.add(cyl(0.035, 0.035, 0.98, M.negro, 0, 0.53, 0));
        const m = monitor(0.96, 0.56);
        m.position.set(0, COTA.MON_Y, 0);
        m.rotation.x = -0.04;
        t.add(m);
        return t;
      }

      function pedestalLateral(xL: number, rotY: number) {
        const p = new THREE.Group();
        p.position.set(xL, 0, COTA.MON_LZ);
        p.rotation.y = rotY;
        p.add(box(0.45, 0.04, 0.4, M.negro, 0, 0.02, 0));
        p.add(cyl(0.028, 0.028, 0.98, M.negro, 0, 0.53, 0));
        const m = monitor(0.96, 0.56);
        m.position.set(0, COTA.MON_Y, 0);
        m.rotation.x = -0.04;
        p.add(m);
        return p;
      }

      estStatic.add(torreFrontal());
      if (cfg.pantallas === 'bi_pantalla') {
        estStatic.add(torreTrasera());
      }
      if (cfg.pantallas === 'triple') {
        estStatic.add(pedestalLateral(-COTA.MON_LX, COTA.MON_ROTY));
        estStatic.add(pedestalLateral(COTA.MON_LX, -COTA.MON_ROTY));
      }

      const chasis = new THREE.Group();
      DC.add(chasis);
      chasis.add(box(1.5, 0.38, 1.4, M.metalClaro, 0, 0.31, 0));
      chasis.add(box(1.58, 0.04, 1.48, M.metalMedio, 0, 0.52, 0));
      chasis.add(box(1.42, 0.1, 1.32, M.metalOscuro, 0, 0.07, 0));
      [
        [-0.65, 0.6],
        [0.65, 0.6],
        [-0.65, -0.6],
        [0.65, -0.6],
      ].forEach(([x, z]) => {
        chasis.add(cyl(0.045, 0.045, 0.12, M.metalOscuro, x, 0.06, z));
        chasis.add(cyl(0.06, 0.06, 0.02, M.goma, x, 0.01, z));
      });
      [
        [-0.76, 0.55],
        [0.76, 0.55],
        [-0.76, -0.55],
        [0.76, -0.55],
      ].forEach(([x, z]) => {
        const rueda = cyl(0.07, 0.07, 0.055, M.goma, x, 0.07, z, 20);
        rueda.rotation.z = Math.PI / 2;
        chasis.add(rueda);
        const llanta = cyl(0.036, 0.036, 0.062, M.metalOscuro, x, 0.07, z, 14);
        llanta.rotation.z = Math.PI / 2;
        chasis.add(llanta);
      });
      chasis.add(box(0.42, 0.09, 0.006, M.plastico, 0, 0.32, 0.706));
      DC.add(box(1.3, 0.003, 1.2, M.alfombra, 0, COTA.ALFOMBRA - COTA.DELTA / 2, 0));

      const butaca = new THREE.Group();
      butaca.position.set(0, 0, COTA.BUTACA_Z);
      DC.add(butaca);
      butaca.add(box(0.42, 0.04, 0.42, M.metalOscuro, 0, 0.563, 0));
      for (let i = 0; i < 4; i++) {
        butaca.add(cyl(0.17 - i * 0.012, 0.18 - i * 0.012, 0.04, M.goma, 0, 0.602 + i * 0.038, 0, 20));
      }
      butaca.add(box(0.4, 0.03, 0.45, M.metalOscuro, 0, 0.751, 0));
      butaca.add(box(0.48, 0.084, 0.48, M.asiento, 0, 0.808, 0));

      const bisagraRespaldo = hinge(0, 0.845, 0.24, 0.12);
      butaca.add(bisagraRespaldo);
      bisagraRespaldo.add(box(0.46, 0.62, 0.1, M.asiento, 0, 0.31, 0));
      bisagraRespaldo.add(box(0.4, 0.18, 0.09, M.asiento, 0, 0.7, 0.01));
      const cinturon = box(0.05, 0.64, 0.01, M.negro, -0.1, 0.33, -0.055);
      cinturon.rotation.z = 0.32;
      bisagraRespaldo.add(cinturon);

      const pedalera = new THREE.Group();
      pedalera.position.set(0, 0, COTA.PEDAL_Z);
      DC.add(pedalera);
      const pedalBaseY = COTA.ALFOMBRA + 0.04;
      pedalera.add(box(0.42, 0.04, 0.22, M.metalOscuro, 0, COTA.ALFOMBRA + 0.02, 0));
      [-0.13, 0, 0.13].forEach((x) => {
        const bisagraPedal = hinge(x, pedalBaseY, 0.08, -0.35);
        pedalera.add(bisagraPedal);
        bisagraPedal.add(box(0.07, 0.15, 0.012, M.metalClaro, 0, 0.075, 0));
        pedalera.add(box(0.03, 0.05, 0.02, M.metalOscuro, x, pedalBaseY + 0.02, 0.1));
      });

      let volanteObj: THREE.Group | null = null;
      if (cfg.mandos === 'volante_industrial') {
        const moduloVolante = new THREE.Group();
        moduloVolante.position.set(0, 0, COTA.COL_Z);
        DC.add(moduloVolante);
        const bisagraCol = hinge(0, COTA.CHAPA, 0, 0.24);
        moduloVolante.add(bisagraCol);
        bisagraCol.add(box(0.24, 0.72, 0.16, M.metalMedio, 0, 0.36, 0));
        const consola = box(0.44, 0.08, 0.28, M.plastico, 0, 0.51, -0.02);
        bisagraCol.add(consola);
        consola.add(box(0.4, 0.015, 0.22, M.metalOscuro, 0, 0.0475, 0));
        for (let i = 0; i < 5; i++) {
          consola.add(cyl(0.018, 0.018, 0.025, M.goma, -0.14 + i * 0.07, 0.0675, 0.0, 12));
        }
        consola.add(cyl(0.036, 0.042, 0.018, M.negro, 0.14, 0.064, -0.07, 16));
        consola.add(cyl(0.026, 0.026, 0.028, M.estop, 0.14, 0.087, -0.07, 16));

        volanteObj = new THREE.Group();
        volanteObj.position.set(0, 0.8, 0.28);
        volanteObj.rotation.x = -0.55;
        bisagraCol.add(volanteObj);
        volanteObj.add(mesh(new THREE.TorusGeometry(0.19, 0.022, 12, 40), M.goma));
        volanteObj.add(cyl(0.055, 0.055, 0.04, M.plastico, 0, 0, 0).rotateX(Math.PI / 2));
        for (let k = 0; k < 3; k++) {
          const a = Math.PI + (k * Math.PI * 2) / 3;
          const radio = box(0.028, 0.15, 0.03, M.plastico, Math.sin(a) * 0.12, Math.cos(a) * 0.12, 0);
          radio.rotation.z = -a;
          volanteObj.add(radio);
        }
        const tramoColumna = cyl(0.028, 0.028, 0.22, M.metalMedio, 0, 0, -0.13, 16);
        tramoColumna.rotation.x = Math.PI / 2;
        volanteObj.add(tramoColumna);
        volanteObj.add(mesh(new THREE.SphereGeometry(0.03, 14, 10), M.negro, 0, 0.19, 0));

        const bloque = box(0.16, 0.08, 0.34, M.metalOscuro, 0.34, COTA.ALFOMBRA + 0.04, 0.1);
        DC.add(bloque);
        for (let i = 0; i < 4; i++) {
          const zl = -0.09 + i * 0.06;
          const bisagraPal = hinge(0.34, COTA.ALFOMBRA + 0.08, 0.1 + zl, -0.3 + i * 0.15);
          DC.add(bisagraPal);
          bisagraPal.add(cyl(0.012, 0.012, 0.22, M.metalClaro, 0, 0.11, 0, 12));
          bisagraPal.add(mesh(new THREE.SphereGeometry(0.024, 12, 8), i % 2 ? M.rojo : M.negro, 0, 0.23, 0));
        }
      }

      if (cfg.mandos === 'joysticks_duales') {
        [-COTA.POD_X, COTA.POD_X].forEach((x) => {
          const pod = new THREE.Group();
          pod.position.set(x, 0, COTA.BUTACA_Z);
          DC.add(pod);
          pod.add(box(0.15, 0.34, 0.44, M.metalOscuro, 0, COTA.ALFOMBRA + 0.17, 0));
          pod.add(box(0.17, 0.05, 0.4, M.plastico, 0, COTA.ALFOMBRA + 0.365, 0));
          const rotulaY = COTA.ALFOMBRA + 0.39;
          pod.add(
            mesh(
              new THREE.SphereGeometry(0.05, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
              M.metalMedio,
              0,
              rotulaY,
              0
            )
          );
          const bisagraPalanca = hinge(0, rotulaY, 0, -0.15);
          pod.add(bisagraPalanca);
          bisagraPalanca.add(cyl(0.014, 0.014, 0.18, M.metalClaro, 0, 0.09, 0, 12));
          bisagraPalanca.add(box(0.05, 0.1, 0.04, M.goma, 0, 0.23, 0));
          bisagraPalanca.add(cyl(0.013, 0.013, 0.018, M.rojo, 0, 0.289, 0.004, 12));
        });
      }

      if (cfg.mandos === 'volante_camion') {
        const moduloVolante = new THREE.Group();
        moduloVolante.position.set(0, 0, COTA.COL_Z);
        DC.add(moduloVolante);
        const bisagraCol = hinge(0, COTA.CHAPA, 0, 0.45);
        moduloVolante.add(bisagraCol);
        bisagraCol.add(box(0.24, 0.55, 0.16, M.metalMedio, 0, 0.275, 0));
        const consola = box(0.44, 0.08, 0.28, M.plastico, 0, 0.53, -0.02);
        bisagraCol.add(consola);
        consola.add(box(0.4, 0.015, 0.22, M.metalOscuro, 0, 0.0475, 0));
        for (let i = 0; i < 5; i++) {
          consola.add(cyl(0.018, 0.018, 0.025, M.goma, -0.14 + i * 0.07, 0.0675, 0.0, 12));
        }
        consola.add(cyl(0.036, 0.042, 0.018, M.negro, 0.14, 0.064, -0.07, 16));
        consola.add(cyl(0.026, 0.026, 0.028, M.estop, 0.14, 0.087, -0.07, 16));

        volanteObj = new THREE.Group();
        volanteObj.position.set(0, 0.62, 0.18);
        volanteObj.rotation.x = -0.12;
        bisagraCol.add(volanteObj);
        volanteObj.add(mesh(new THREE.TorusGeometry(0.24, 0.026, 12, 44), M.goma));
        volanteObj.add(cyl(0.06, 0.06, 0.05, M.plastico, 0, 0, 0).rotateX(Math.PI / 2));
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          const radio = box(0.03, 0.2, 0.03, M.plastico, Math.sin(a) * 0.155, Math.cos(a) * 0.155, 0);
          radio.rotation.z = -a;
          volanteObj.add(radio);
        }
        const ejeCamion = cyl(0.03, 0.03, 0.28, M.metalMedio, 0, 0, -0.16, 16);
        ejeCamion.rotation.x = Math.PI / 2;
        volanteObj.add(ejeCamion);
        volanteObj.add(mesh(new THREE.SphereGeometry(0.034, 14, 10), M.negro, 0, 0.24, 0));

        const bisagraCambio = hinge(0.3, COTA.ALFOMBRA, 0.05, 0.1);
        DC.add(bisagraCambio);
        bisagraCambio.add(cyl(0.045, 0.06, 0.1, M.goma, 0, 0.05, 0, 14));
        bisagraCambio.add(cyl(0.02, 0.02, 0.42, M.metalClaro, 0, 0.28, 0, 12));
        bisagraCambio.add(mesh(new THREE.SphereGeometry(0.038, 14, 10), M.negro, 0, 0.5, 0));
      }

      const cascoButaca = new THREE.Group();
      cascoButaca.position.set(0.06, COTA.COJIN, 0.06);
      butaca.add(cascoButaca);
      cascoButaca.add(
        mesh(new THREE.SphereGeometry(0.105, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.cascoOp)
      );
      cascoButaca.add(box(0.16, 0.012, 0.08, M.cascoOp, 0, -0.002, 0.095));

      return {
        config: cfg,
        grupo: E,
        DC,
        butaca,
        matPantalla,
        luz,
        volanteObj,
        cascoButaca,
        seed,
        enOperacion: false,
      };
    }

    function crearSimspray(cfg: (typeof ESTACIONES_CONFIG)[number], seed: number): EstacionInterna {
      const E = new THREE.Group();
      E.name = 'Estacion_' + cfg.id;
      E.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      E.rotation.y = cfg.rotY;
      scene.add(E);

      const matPantalla = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        roughness: 0.25,
        emissive: 0x000000,
        emissiveIntensity: 0.0,
      });

      const luz = new THREE.PointLight(0xfff1d6, 0, 6.0);
      luz.position.set(0, 2.3, -0.3);
      E.add(luz);

      // 1. Chasis / Carro rodante de la unidad SimSpray
      E.add(box(0.68, 0.06, 0.52, M.metalOscuro, 0, 0.03, 0));
      [
        [-0.26, -0.18],
        [0.26, -0.18],
        [-0.26, 0.18],
        [0.26, 0.18],
      ].forEach(([rx, rz]) => {
        const rueda = cyl(0.045, 0.045, 0.035, M.goma, rx, 0.045, rz, 16);
        rueda.rotation.z = Math.PI / 2;
        E.add(rueda);
      });

      // Gabinete vertical principal (debajo de la V de sensores)
      E.add(box(0.52, 1.58, 0.36, M.metalOscuro, 0, 0.85, 0));
      E.add(box(0.54, 0.04, 0.38, M.metalMedio, 0, 1.65, 0));

      // 2. Pantalla táctil del instructor / menú (mira hacia el frente -Z)
      E.add(box(0.44, 0.58, 0.02, M.negro, 0, 1.28, -0.19));
      const tactil = box(0.4, 0.52, 0.015, matPantalla, 0, 1.28, -0.2);
      tactil.rotation.x = 0.1;
      E.add(tactil);

      // 3. DOS BRAZOS EN FORMA DE "V" CON SENSORES DE TRACKING ÓPTICO
      // Salen del simulador hacia arriba abriéndose en V y debajo queda el simulador
      const soporteV = box(0.16, 0.05, 0.16, M.metalMedio, 0, 1.68, 0);
      E.add(soporteV);

      function crearRamaSensor(esIzq: boolean) {
        const s = esIzq ? -1 : 1;
        const rama = new THREE.Group();
        rama.position.set(s * 0.06, 1.7, 0);
        rama.rotation.z = -s * 0.52; // Ángulo de apertura en V (30°)
        rama.rotation.x = -0.16; // Inclinación hacia adelante (-Z) hacia el operario

        // Brazo tubular metálico
        rama.add(cyl(0.015, 0.018, 0.65, M.metalOscuro, 0, 0.325, 0, 16));

        // Cabezal sensor en el extremo
        const cabezal = new THREE.Group();
        cabezal.position.set(0, 0.65, 0);
        cabezal.rotation.z = s * 0.52;
        cabezal.rotation.x = 0.2;
        cabezal.add(box(0.07, 0.08, 0.1, M.negro, 0, 0, 0));
        const lente = cyl(0.024, 0.024, 0.012, M.metalClaro, 0, 0, -0.055, 16);
        lente.rotation.x = Math.PI / 2;
        cabezal.add(lente);
        cabezal.add(mesh(new THREE.SphereGeometry(0.015, 12, 8), M.estop, 0, 0, -0.058));
        rama.add(cabezal);

        return rama;
      }
      E.add(crearRamaSensor(true)); // Rama izquierda de la V
      E.add(crearRamaSensor(false)); // Rama derecha de la V

      // 4. Soporte para visor VR colgado (en el lateral izquierdo)
      E.add(box(0.12, 0.02, 0.04, M.metalMedio, -0.32, 1.15, -0.05));
      const visor = box(0.18, 0.11, 0.09, M.negro, -0.4, 1.08, -0.05);
      visor.rotation.y = -0.2;
      E.add(visor);
      E.add(box(0.19, 0.015, 0.02, M.goma, -0.4, 1.145, -0.05));

      // 5. Pistola aerográfica colgada (en el lateral derecho)
      E.add(box(0.12, 0.02, 0.04, M.metalMedio, 0.32, 1.12, -0.05));
      const pistola = new THREE.Group();
      pistola.position.set(0.4, 1.02, -0.05);
      E.add(pistola);
      pistola.add(box(0.05, 0.14, 0.05, M.metalClaro, 0, 0, 0));
      pistola.add(cyl(0.012, 0.016, 0.08, M.metalMedio, 0, -0.1, 0, 12));
      pistola.add(box(0.02, 0.05, 0.03, M.negro, 0, 0.04, -0.035));
      pistola.add(cyl(0.018, 0.018, 0.05, M.goma, 0, 0.095, 0, 12));

      // Manguera flexible desde el gabinete hasta la pistola
      const puntosManguera = [
        new THREE.Vector3(0.2, 0.08, -0.05),
        new THREE.Vector3(0.36, 0.15, -0.05),
        new THREE.Vector3(0.42, 0.5, -0.05),
        new THREE.Vector3(0.4, 0.92, -0.05),
      ];
      E.add(
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(puntosManguera), 30, 0.014, 10), M.goma)
      );

      return {
        config: cfg,
        grupo: E,
        DC: null,
        butaca: null,
        matPantalla,
        luz,
        volanteObj: null,
        visorColgado: visor,
        pistolaColgada: pistola,
        cascoButaca: null,
        seed,
        enOperacion: false,
      };
    }


    const INSTANCIAS: EstacionInterna[] = ESTACIONES_CONFIG.map((cfg, i) => {
      const seed = i * 1.7;
      return cfg.tipo === 'simspray' ? crearSimspray(cfg, seed) : crearEstacion(cfg, seed);
    });

    // ═══════════════════════════════════════════════════════════════════
    // OPERARIOS MÓVILES INDIVIDUALES
    // ═══════════════════════════════════════════════════════════════════
    function crearOperario(id: number, estacionId: string, colorChaleco = 0xea580c): OperarioAnimado {
      const root = new THREE.Group();
      root.name = 'Operario_' + id;
      root.visible = false;
      scene.add(root);

      root.position.set(6.8, 0, 6.0);
      root.rotation.y = -Math.PI / 2;

      const pelvis = new THREE.Group();
      pelvis.position.y = 0.92;
      root.add(pelvis);

      const matChaleco = new THREE.MeshStandardMaterial({ color: colorChaleco, roughness: 0.7 });
      const torso = new THREE.Group();
      pelvis.add(torso);
      const pecho = box(0.34, 0.44, 0.22, matChaleco, 0, 0.22, 0);
      torso.add(pecho);
      torso.add(box(0.35, 0.035, 0.225, M.reflectivo, 0, 0.14, 0));
      torso.add(box(0.35, 0.035, 0.225, M.reflectivo, 0, 0.28, 0));

      const cuello = cyl(0.05, 0.05, 0.08, M.piel, 0, 0.48, 0);
      torso.add(cuello);
      const cabeza = box(0.16, 0.15, 0.15, M.piel, 0, 0.58, 0);
      torso.add(cabeza);
      const casco = mesh(new THREE.SphereGeometry(0.098, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.cascoOp, 0, 0.65, 0);
      torso.add(casco);
      const visera = box(0.13, 0.012, 0.06, M.cascoOp, 0, 0.62, 0.085);
      torso.add(visera);

      const visorVR = box(0.18, 0.1, 0.09, M.negro, 0, 0.58, 0.09);
      visorVR.visible = false;
      torso.add(visorVR);

      function crearBrazo(esIzq: boolean) {
        const s = esIzq ? -1 : 1;
        const hombro = new THREE.Group();
        hombro.position.set(s * 0.21, 0.38, 0);
        torso.add(hombro);

        const brazoSup = box(0.085, 0.22, 0.085, matChaleco, 0, -0.11, 0);
        hombro.add(brazoSup);

        const codo = new THREE.Group();
        codo.position.set(0, -0.22, 0);
        hombro.add(codo);

        const antebrazo = box(0.075, 0.2, 0.075, M.piel, 0, -0.1, 0);
        codo.add(antebrazo);
        const mano = box(0.065, 0.065, 0.065, M.piel, 0, -0.21, 0);
        codo.add(mano);

        return { hombro, codo };
      }
      const brazoIzq = crearBrazo(true);
      const brazoDer = crearBrazo(false);

      const pistolaMano = new THREE.Group();
      pistolaMano.position.set(0, -0.21, 0.08);
      pistolaMano.add(box(0.04, 0.12, 0.04, M.metalClaro, 0, 0, 0));
      pistolaMano.add(cyl(0.01, 0.014, 0.07, M.metalMedio, 0, -0.08, 0, 10));
      pistolaMano.visible = false;
      brazoDer.codo.add(pistolaMano);

      function crearPierna(esIzq: boolean) {
        const s = esIzq ? -1 : 1;
        const cadera = new THREE.Group();
        cadera.position.set(s * 0.1, 0, 0);
        pelvis.add(cadera);

        const muslo = box(0.12, 0.42, 0.12, M.negro, 0, -0.21, 0);
        cadera.add(muslo);

        const rodilla = new THREE.Group();
        rodilla.position.set(0, -0.42, 0);
        cadera.add(rodilla);

        const pantorrilla = box(0.1, 0.4, 0.1, M.negro, 0, -0.2, 0);
        rodilla.add(pantorrilla);

        const bota = box(0.11, 0.08, 0.22, M.goma, 0, -0.41, 0.05);
        rodilla.add(bota);

        return { cadera, rodilla };
      }
      const piernaIzq = crearPierna(true);
      const piernaDer = crearPierna(false);

      return {
        id,
        estacionId,
        root,
        pelvis,
        torso,
        brazoIzq,
        brazoDer,
        piernaIzq,
        piernaDer,
        pistolaMano,
        visorVR,
        estado: 'inactivo',
        estacion: null,
        ruta: [],
        idxRuta: 0,
        fasePaso: 0,
        progresoSubida: 0,
        progresoBajada: 0,
        posInicioAccion: new THREE.Vector3(),
        rotInicioAccion: 0,
      };
    }

    const OPERARIOS: OperarioAnimado[] = INSTANCIAS.map((inst, i) => {
      return crearOperario(i, inst.config.id);
    });

    function getPuntosEstacion(cfg: (typeof ESTACIONES_CONFIG)[number]) {
      const aMundo = (lx: number, ly: number, lz: number) => {
        const v = new THREE.Vector3(lx, ly, lz);
        v.applyAxisAngle(new THREE.Vector3(0, 1, 0), cfg.rotY);
        v.add(new THREE.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]));
        return v;
      };

      if (cfg.tipo === 'simspray') {
        return {
          acceso: aMundo(0.8, 0, -1.15),
          subida: aMundo(0.4, 0, -1.15),
          plataforma: aMundo(0, 0, -1.15),
          rotFinal: cfg.rotY,
        };
      }

      return {
        acceso: aMundo(-1.2, 0, 0.25),
        subida: aMundo(-0.6, 0, 0.25),
        plataforma: aMundo(0, 0, COTA.BUTACA_Z),
        rotFinal: cfg.rotY + Math.PI,
      };
    }

    function planificarRutaDesdePuerta(destinoAcceso: THREE.Vector3) {
      const wps: THREE.Vector3[] = [];
      wps.push(new THREE.Vector3(6.8, 0, 6.0));
      wps.push(new THREE.Vector3(4.5, 0, 5.2));
      wps.push(new THREE.Vector3(2.0, 0, 4.0));
      if (destinoAcceso.z < 0) {
        wps.push(new THREE.Vector3(0.0, 0, destinoAcceso.z + 1.5));
      }
      wps.push(new THREE.Vector3(destinoAcceso.x, 0, destinoAcceso.z));
      return wps;
    }

    function planificarRutaHaciaPuerta(origen: THREE.Vector3) {
      const wps: THREE.Vector3[] = [];
      wps.push(new THREE.Vector3(origen.x, 0, origen.z));
      wps.push(new THREE.Vector3(2.0, 0, 4.0));
      wps.push(new THREE.Vector3(4.5, 0, 5.2));
      wps.push(new THREE.Vector3(6.8, 0, 6.0));
      return wps;
    }

    function setEstadoInterno(inst: EstacionInterna, enOperacion: boolean) {
      inst.enOperacion = enOperacion;
      if (enOperacion) {
        inst.matPantalla.color.setHex(0x0d3327);
        inst.matPantalla.emissive.setHex(0x10b981);
        inst.matPantalla.emissiveIntensity = 0.85;
        inst.luz.intensity = 0.7;
        if (inst.cascoButaca) inst.cascoButaca.visible = false;
      } else {
        inst.matPantalla.color.setHex(0x0a0a0a);
        inst.matPantalla.emissive.setHex(0x000000);
        inst.matPantalla.emissiveIntensity = 0.0;
        inst.luz.intensity = 0.0;
        if (inst.cascoButaca) inst.cascoButaca.visible = true;
        if (inst.DC) inst.DC.position.y = 0.0;
        if (inst.visorColgado) inst.visorColgado.visible = true;
        if (inst.pistolaColgada) inst.pistolaColgada.visible = true;
      }
    }

    function emitirCambioOperarios() {
      if (opChangeRef.current) {
        const activos = OPERARIOS.filter((o) => o.estado === 'operando').length;
        const enCamino = OPERARIOS.filter(
          (o) => o.estado === 'caminando' || o.estado === 'subiendo'
        ).length;
        opChangeRef.current(activos, enCamino);
      }
    }

    let ultimoOperarioActivo: OperarioAnimado | null = null;

    function actualizarOperarioIndividual(op: OperarioAnimado, dt: number, t: number) {
      if (!op || !op.root.visible) return;

      if (op.estado === 'caminando' || op.estado === 'saliendo') {
        op.root.position.y = 0;
        if (op.idxRuta < op.ruta.length) {
          const targetWP = op.ruta[op.idxRuta];
          const dx = targetWP.x - op.root.position.x;
          const dz = targetWP.z - op.root.position.z;
          const dist = Math.hypot(dx, dz);

          if (dist < 0.25) {
            op.idxRuta++;
          } else {
            const targetAngle = Math.atan2(dx, dz);
            let diff = targetAngle - op.root.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            op.root.rotation.y += diff * Math.min(1, dt * 9);

            const speed = 2.5;
            const stepDist = Math.min(dist, speed * dt);
            op.root.position.x += Math.sin(op.root.rotation.y) * stepDist;
            op.root.position.z += Math.cos(op.root.rotation.y) * stepDist;

            op.fasePaso += dt * 9.5;
            const swing = Math.sin(op.fasePaso);
            op.piernaIzq.cadera.rotation.x = swing * 0.6;
            op.piernaDer.cadera.rotation.x = -swing * 0.6;
            op.piernaIzq.rodilla.rotation.x = Math.max(0, -swing) * 0.7;
            op.piernaDer.rodilla.rotation.x = Math.max(0, swing) * 0.7;

            op.brazoIzq.hombro.rotation.x = -swing * 0.5;
            op.brazoDer.hombro.rotation.x = swing * 0.5;
            op.brazoIzq.codo.rotation.set(-0.25, 0, 0);
            op.brazoDer.codo.rotation.set(-0.25, 0, 0);

            op.pelvis.position.y = 0.92 + Math.abs(Math.sin(op.fasePaso)) * 0.04;
          }
        } else {
          if (op.estado === 'caminando') {
            op.estado = 'subiendo';
            op.progresoSubida = 0.0;
            op.posInicioAccion.copy(op.root.position);
            op.rotInicioAccion = op.root.rotation.y;
          } else {
            op.estado = 'inactivo';
            op.root.visible = false;
            emitirCambioOperarios();
          }
        }
      } else if (op.estado === 'subiendo') {
        op.progresoSubida += dt * 0.95;
        const p = Math.min(1.0, op.progresoSubida);
        if (!op.estacion) return;
        const puntos = getPuntosEstacion(op.estacion.config);

        if (op.estacion.config.tipo === 'simspray') {
          op.root.position.lerpVectors(op.posInicioAccion, puntos.plataforma, p);
          op.root.position.y = 0;
          op.root.rotation.y = THREE.MathUtils.lerp(op.rotInicioAccion, puntos.rotFinal, p);
          op.pelvis.position.y = 0.92;
          op.brazoDer.hombro.rotation.set(-1.4 * p, 0, 0.2 * p);
          op.brazoDer.codo.rotation.set(-0.3 * p, 0, 0);
          op.brazoIzq.hombro.rotation.set(-0.6 * p, 0, -0.3 * p);
          if (p > 0.5) {
            op.pistolaMano.visible = true;
            op.visorVR.visible = true;
            if (op.estacion.visorColgado) op.estacion.visorColgado.visible = false;
            if (op.estacion.pistolaColgada) op.estacion.pistolaColgada.visible = false;
          }
        } else {
          if (p < 0.45) {
            const t1 = p / 0.45;
            op.root.position.lerpVectors(op.posInicioAccion, puntos.subida, t1);
            op.root.position.y = COTA.ALFOMBRA * t1;
            op.pelvis.position.y = 0.92;
            op.piernaIzq.cadera.rotation.x = -0.7 * Math.sin(t1 * Math.PI);
            op.piernaIzq.rodilla.rotation.x = 0.8 * Math.sin(t1 * Math.PI);
            op.piernaDer.cadera.rotation.x = 0;
            op.piernaDer.rodilla.rotation.x = 0;
          } else {
            const t2 = (p - 0.45) / 0.55;
            const ease = t2 * t2 * (3 - 2 * t2);
            op.root.position.lerpVectors(puntos.subida, puntos.plataforma, ease);
            op.root.position.y = COTA.ALFOMBRA;

            let diff = puntos.rotFinal - op.rotInicioAccion;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            op.root.rotation.y = op.rotInicioAccion + diff * ease;

            op.pelvis.position.y = THREE.MathUtils.lerp(0.92, 0.32, ease);
            op.piernaIzq.cadera.rotation.set((-Math.PI / 2 + 0.08) * ease, -0.05 * ease, 0);
            op.piernaDer.cadera.rotation.set((-Math.PI / 2 + 0.08) * ease, 0.05 * ease, 0);
            op.piernaIzq.rodilla.rotation.set((Math.PI / 2 - 0.08) * ease, 0, 0);
            op.piernaDer.rodilla.rotation.set((Math.PI / 2 - 0.08) * ease, 0, 0);

            const cfg = op.estacion.config;
            const angArm = cfg.mandos === 'volante_camion' ? -1.05 : -1.25;
            op.brazoIzq.hombro.rotation.set(angArm * ease, 0.15 * ease, -0.15 * ease);
            op.brazoDer.hombro.rotation.set(angArm * ease, -0.15 * ease, 0.15 * ease);
            op.brazoIzq.codo.rotation.set(-0.35 * ease, 0, 0);
            op.brazoDer.codo.rotation.set(-0.35 * ease, 0, 0);
          }
        }

        if (p >= 1.0) {
          op.estado = 'operando';
          setEstadoInterno(op.estacion, true);
          if (op.estacion.cascoButaca) op.estacion.cascoButaca.visible = false;
          emitirCambioOperarios();
        }
      } else if (op.estado === 'operando') {
        if (op.estacion) {
          const puntos = getPuntosEstacion(op.estacion.config);
          const vib = op.estacion.DC && op.estacion.enOperacion ? op.estacion.DC.position.y : 0;

          if (op.estacion.config.tipo === 'simspray') {
            op.root.position.copy(puntos.plataforma);
            op.root.position.y = 0;
            op.root.rotation.y = puntos.rotFinal;
            op.pelvis.position.y = 0.92;
            const pintando = Math.sin(t * 3.0) * 0.12;
            op.brazoDer.hombro.rotation.y = pintando;
            op.brazoDer.hombro.rotation.x = -1.4 + Math.cos(t * 3.0) * 0.08;
          } else {
            op.root.position.copy(puntos.plataforma);
            op.root.position.y = COTA.ALFOMBRA + vib;
            op.root.rotation.y = puntos.rotFinal;
            op.pelvis.position.y = 0.32;

            const giro = Math.sin(t * 3.5 + op.estacion.seed) * 0.08;
            op.brazoIzq.hombro.rotation.z = -0.15 + giro;
            op.brazoDer.hombro.rotation.z = 0.15 + giro;
            if (op.estacion.volanteObj) {
              op.estacion.volanteObj.rotation.z = -giro * 1.5;
            }
          }
        }
      } else if (op.estado === 'bajando') {
        op.progresoBajada += dt * 1.1;
        const p = Math.min(1.0, op.progresoBajada);
        if (!op.estacion) return;
        const puntos = getPuntosEstacion(op.estacion.config);

        if (op.estacion.config.tipo === 'simspray') {
          op.root.position.lerpVectors(puntos.plataforma, puntos.acceso, p);
          op.root.position.y = 0;
          op.brazoDer.hombro.rotation.set(-1.4 * (1 - p), 0, 0.2 * (1 - p));
          if (p > 0.4) {
            op.pistolaMano.visible = false;
            op.visorVR.visible = false;
            if (op.estacion.visorColgado) op.estacion.visorColgado.visible = true;
            if (op.estacion.pistolaColgada) op.estacion.pistolaColgada.visible = true;
          }
        } else {
          const ease = p * p * (3 - 2 * p);
          op.root.position.lerpVectors(puntos.plataforma, puntos.acceso, ease);
          op.root.position.y = COTA.ALFOMBRA * (1 - ease);
          op.pelvis.position.y = THREE.MathUtils.lerp(0.32, 0.92, ease);

          op.piernaIzq.cadera.rotation.x = (-Math.PI / 2 + 0.08) * (1 - ease);
          op.piernaDer.cadera.rotation.x = (-Math.PI / 2 + 0.08) * (1 - ease);
          op.piernaIzq.rodilla.rotation.x = (Math.PI / 2 - 0.08) * (1 - ease);
          op.piernaDer.rodilla.rotation.x = (Math.PI / 2 - 0.08) * (1 - ease);

          op.brazoIzq.hombro.rotation.set(0.08 * ease, 0, 0.05);
          op.brazoDer.hombro.rotation.set(0.08 * ease, 0, -0.05);
          op.brazoIzq.codo.rotation.set(-0.15, 0, 0);
          op.brazoDer.codo.rotation.set(-0.15, 0, 0);
        }

        if (p >= 1.0) {
          if (op.estacion.cascoButaca) op.estacion.cascoButaca.visible = true;
          op.ruta = planificarRutaHaciaPuerta(puntos.acceso);
          op.idxRuta = 0;
          op.estado = 'saliendo';
          emitirCambioOperarios();
        }
      }
    }

    function toggleSimuladorInterno(instIndex: number) {
      const inst = INSTANCIAS[instIndex];
      const op = OPERARIOS[instIndex];
      ultimoOperarioActivo = op;

      if (inst.enOperacion || op.estado === 'operando' || op.estado === 'subiendo') {
        setEstadoInterno(inst, false);
        op.estado = 'bajando';
        op.progresoBajada = 0;
      } else {
        op.estacion = inst;
        const puntos = getPuntosEstacion(inst.config);
        op.root.visible = true;
        op.root.position.set(6.8, 0, 6.0);
        op.ruta = planificarRutaDesdePuerta(puntos.acceso);
        op.idxRuta = 0;
        op.estado = 'caminando';
      }
      emitirCambioOperarios();
      toggleRef.current?.(inst.config.id);
    }

    function syncEstadosInterno(currentEstados: Record<string, EstadoSimulador>) {
      INSTANCIAS.forEach((inst, idx) => {
        const estadoDeseado = currentEstados[inst.config.id];
        const op = OPERARIOS[idx];
        if (estadoDeseado === 'operando') {
          if (!inst.enOperacion && op.estado !== 'operando' && op.estado !== 'subiendo' && op.estado !== 'caminando') {
            op.estacion = inst;
            const puntos = getPuntosEstacion(inst.config);
            op.root.visible = true;
            op.root.position.set(6.8, 0, 6.0);
            op.ruta = planificarRutaDesdePuerta(puntos.acceso);
            op.idxRuta = 0;
            op.estado = 'caminando';
            ultimoOperarioActivo = op;
          }
        } else {
          if (inst.enOperacion || op.estado === 'operando' || op.estado === 'subiendo') {
            setEstadoInterno(inst, false);
            op.estado = 'bajando';
            op.progresoBajada = 0;
            ultimoOperarioActivo = op;
          }
        }
      });
      emitirCambioOperarios();
    }

    function resetCamera() {
      camera.position.set(13.0, 13.5, 15.0);
      controls.target.set(0, 0.5, 0);
      controls.update();
    }

    controlSceneRef.current = {
      toggleByIndex: toggleSimuladorInterno,
      setGridVisible: (v: boolean) => {
        grid.visible = v;
      },
      setRotar: (v: boolean) => {
        rotarCamaraRef.current = v;
      },
      resetCamera,
      syncEstados: syncEstadosInterno,
    };

    // Anillo visual de selección para la estación activa
    const ringGeo = new THREE.RingGeometry(1.25, 1.34, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = COTA.LINEA + 0.002;
    selectionRing.visible = false;
    scene.add(selectionRing);

    // ═══════════════════════════════════════════════════════════════════
    // RAYCASTING PARA HOVER Y SELECCIÓN DE SOLO LECTURA
    // ═══════════════════════════════════════════════════════════════════
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      let isOverStation = false;
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && obj !== scene) {
          const idx = INSTANCIAS.findIndex((inst) => inst.grupo === obj);
          if (idx !== -1) {
            isOverStation = true;
            break;
          }
          obj = obj.parent;
        }
        if (isOverStation) break;
      }
      renderer.domElement.style.cursor = isOverStation ? 'pointer' : 'default';
    };

    const onPointerDown = (e: PointerEvent) => {
      const startX = e.clientX;
      const startY = e.clientY;

      const onPointerUp = (eUp: PointerEvent) => {
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        if (Math.hypot(eUp.clientX - startX, eUp.clientY - startY) > 6) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((eUp.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((eUp.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(scene.children, true);
        let foundStationId: string | null = null;
        for (const hit of hits) {
          let obj: THREE.Object3D | null = hit.object;
          while (obj && obj !== scene) {
            const idx = INSTANCIAS.findIndex((inst) => inst.grupo === obj);
            if (idx !== -1) {
              foundStationId = INSTANCIAS[idx].config.id;
              break;
            }
            obj = obj.parent;
          }
          if (foundStationId) break;
        }

        // Selección exclusiva de solo lectura (NO cambia estado de la máquina)
        selectRef.current(foundStationId);
      };

      renderer.domElement.addEventListener('pointerup', onPointerUp);
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // ═══════════════════════════════════════════════════════════════════
    // BUCLE DE ANIMACIÓN
    // ═══════════════════════════════════════════════════════════════════
    let animId = 0;
    let ang = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.08);
      const t = clock.getElapsedTime();

      INSTANCIAS.forEach((inst) => {
        if (inst.DC) {
          inst.DC.position.y = inst.enOperacion ? Math.sin(t * 22 + inst.seed) * 0.002 : 0;
        }
      });

      OPERARIOS.forEach((op) => actualizarOperarioIndividual(op, dt, t));

      if (estacionSeleccionadaRef.current) {
        const sel = INSTANCIAS.find((i) => i.config.id === estacionSeleccionadaRef.current);
        if (sel) {
          selectionRing.position.x = sel.config.pos[0];
          selectionRing.position.z = sel.config.pos[2];
          selectionRing.visible = true;
          selectionRing.rotation.z += 0.015;
        } else {
          selectionRing.visible = false;
        }
      } else {
        selectionRing.visible = false;
      }

      if (camaraSeguimientoRef.current && ultimoOperarioActivo && ultimoOperarioActivo.root.visible) {
        controls.target.lerp(
          new THREE.Vector3(
            ultimoOperarioActivo.root.position.x,
            1.1,
            ultimoOperarioActivo.root.position.z
          ),
          0.04
        );
      }

      if (rotarCamaraRef.current) {
        ang += 0.0022;
        camera.position.x = Math.sin(ang) * 15;
        camera.position.z = Math.cos(ang) * 15;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    // ═══════════════════════════════════════════════════════════════════
    // RESIZE OBSERVER
    // ═══════════════════════════════════════════════════════════════════
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // ═══════════════════════════════════════════════════════════════════
    // LIMPIEZA DE MEMORIA (CLEANUP RIGUROSO)
    // ═══════════════════════════════════════════════════════════════════
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);

      controls.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const meshObj = obj as THREE.Mesh;
          if (meshObj.geometry) {
            meshObj.geometry.dispose();
          }
          if (meshObj.material) {
            if (Array.isArray(meshObj.material)) {
              meshObj.material.forEach((mat) => {
                if ('map' in mat && mat.map) (mat.map as THREE.Texture).dispose();
                mat.dispose();
              });
            } else {
              const mat = meshObj.material as THREE.Material & { map?: THREE.Texture };
              if (mat.map) mat.map.dispose();
              mat.dispose();
            }
          }
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-screen overflow-hidden bg-[#111216] select-none"
    />
  );
}
