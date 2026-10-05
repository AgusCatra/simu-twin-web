'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { EstadoSimulador } from '@/types/gemelo';
import {
  Activity,
  Power,
  RotateCcw,
  Grid,
  Eye,
  ShieldAlert,
  Zap,
  CheckCircle2,
  Clock,
  Radio,
} from 'lucide-react';

const GemeloGalponCanvas = dynamic(
  () => import('./GemeloGalponCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#111216] text-amber-400">
        <div className="relative flex items-center justify-center mb-4">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-amber-400/20 border-t-amber-400" />
          <Radio className="absolute h-6 w-6 animate-pulse text-amber-400" />
        </div>
        <div className="text-sm font-mono tracking-widest uppercase">
          Inicializando Gemelo Digital SCADA...
        </div>
        <div className="text-xs text-neutral-500 mt-1">Cargando geometrías, cinemática y texturas 3D</div>
      </div>
    ),
  }
);

interface EstacionInfo {
  id: string;
  idx: string;
  nombre: string;
  tipo: string;
  color: string;
  potenciaNominalKW: number;
}

const LISTA_SIMULADORES: EstacionInfo[] = [
  { id: 'autoelevador', idx: '01', nombre: 'Autoelevador', tipo: 'Bi-Pantalla', color: '#f59e0b', potenciaNominalKW: 3.2 },
  { id: 'pala-frontal', idx: '02', nombre: 'Pala Frontal', tipo: 'Triple Pantalla 45°', color: '#eab308', potenciaNominalKW: 4.5 },
  { id: 'retroexcavadora', idx: '03', nombre: 'Retroexcavadora', tipo: 'Cabina Industrial', color: '#f97316', potenciaNominalKW: 4.0 },
  { id: 'grua-telescopica', idx: '04', nombre: 'Grúa Telescópica', tipo: 'Triple Pantalla 45°', color: '#06b6d4', potenciaNominalKW: 4.8 },
  { id: 'tractor', idx: '05', nombre: 'Tractor Agrícola', tipo: 'Bi-Pantalla', color: '#84cc16', potenciaNominalKW: 3.5 },
  { id: 'camion', idx: '06', nombre: 'Camión Pesado', tipo: 'Triple Pantalla', color: '#3b82f6', potenciaNominalKW: 5.2 },
  { id: 'simspray', idx: '07', nombre: 'SimSpray Pintura VR', tipo: 'Casco VR + Pistola', color: '#a855f7', potenciaNominalKW: 2.1 },
];

export default function VisorNave3D() {
  const [estados, setEstados] = useState<Record<string, EstadoSimulador>>(() => ({
    autoelevador: 'detenido',
    'pala-frontal': 'detenido',
    retroexcavadora: 'detenido',
    'grua-telescopica': 'detenido',
    tractor: 'detenido',
    camion: 'detenido',
    simspray: 'detenido',
  }));

  const [estacionSeleccionada, setEstacionSeleccionada] = useState<string | null>(null);
  const [camaraSeguimiento, setCamaraSeguimiento] = useState(true);
  const [grillaVisible, setGrillaVisible] = useState(false);
  const [rotarCamara, setRotarCamara] = useState(false);
  const [operariosActivos, setOperariosActivos] = useState(0);
  const [operariosEnCamino, setOperariosEnCamino] = useState(0);
  const [segundosOperacion, setSegundosOperacion] = useState(0);

  // Contador de tiempo de operación
  useEffect(() => {
    const timer = setInterval(() => {
      setSegundosOperacion((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleEstacion = useCallback((id: string) => {
    setEstados((prev) => {
      const nuevo = prev[id] === 'operando' ? 'detenido' : 'operando';
      return { ...prev, [id]: nuevo };
    });
  }, []);

  const encenderTodos = useCallback(() => {
    LISTA_SIMULADORES.forEach((sim, idx) => {
      setTimeout(() => {
        setEstados((prev) => {
          if (prev[sim.id] === 'operando') return prev;
          return { ...prev, [sim.id]: 'operando' };
        });
      }, idx * 280);
    });
  }, []);

  const apagarTodos = useCallback(() => {
    setEstados({
      autoelevador: 'detenido',
      'pala-frontal': 'detenido',
      retroexcavadora: 'detenido',
      'grua-telescopica': 'detenido',
      tractor: 'detenido',
      camion: 'detenido',
      simspray: 'detenido',
    });
  }, []);

  const handleEstadoOperariosChange = useCallback((activos: number, enCamino: number) => {
    setOperariosActivos(activos);
    setOperariosEnCamino(enCamino);
  }, []);

  // Métricas calculadas en tiempo real
  const totalActivos = useMemo(() => {
    return Object.values(estados).filter((e) => e === 'operando').length;
  }, [estados]);

  const consumoTotalKW = useMemo(() => {
    return LISTA_SIMULADORES.reduce((sum, sim) => {
      return sum + (estados[sim.id] === 'operando' ? sim.potenciaNominalKW : 0.15);
    }, 0);
  }, [estados]);

  const formatoTiempo = (seg: number) => {
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#111216]">
      {/* Canvas 3D de Three.js */}
      <GemeloGalponCanvas
        estados={estados}
        estacionSeleccionada={estacionSeleccionada}
        onToggleEstacion={toggleEstacion}
        onSeleccionarEstacion={setEstacionSeleccionada}
        camaraSeguimiento={camaraSeguimiento}
        grillaVisible={grillaVisible}
        rotarCamara={rotarCamara}
        onEstadoOperariosChange={handleEstadoOperariosChange}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          PANEL HUD IZQUIERDO — TERMINAL SCADA INDUSTRIAL
      ═══════════════════════════════════════════════════════════════════ */}
      <aside
        id="scada-control-hud"
        className="absolute top-4 left-4 z-20 w-80 max-w-[calc(100vw-32px)] rounded-xl border border-neutral-700/60 bg-neutral-950/85 p-4 text-neutral-100 shadow-2xl backdrop-blur-md"
      >
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <h1 className="text-xs font-bold tracking-wider text-amber-400 uppercase font-mono">
              Centro de Simuladores SCADA
            </h1>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
            v2.4
          </span>
        </div>

        {/* Botones de control por lote */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={encenderTodos}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-950/30 px-3 py-2 text-[11px] font-bold text-emerald-400 transition hover:bg-emerald-800/30 active:scale-95"
            title="Despacha operarios para activar todos los simuladores"
          >
            <Power className="h-3.5 w-3.5" />
            ENCENDER TODOS
          </button>
          <button
            onClick={apagarTodos}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/30 px-3 py-2 text-[11px] font-bold text-rose-400 transition hover:bg-rose-800/30 active:scale-95"
            title="Desactiva todos los simuladores y hace regresar a los operarios"
          >
            <Power className="h-3.5 w-3.5" />
            APAGAR TODOS
          </button>
        </div>

        {/* Lista de Simuladores */}
        <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {LISTA_SIMULADORES.map((sim) => {
            const estaOperando = estados[sim.id] === 'operando';
            return (
              <button
                key={sim.id}
                onClick={() => {
                  toggleEstacion(sim.id);
                  setEstacionSeleccionada(sim.id);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-left transition text-xs ${
                  estaOperando
                    ? 'border-emerald-500/60 bg-emerald-950/20 text-emerald-300 shadow-sm shadow-emerald-950/50'
                    : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${sim.color}22`, color: sim.color }}
                  >
                    {sim.idx}
                  </span>
                  <div>
                    <div className="font-semibold">{sim.nombre}</div>
                    <div className="text-[10px] text-neutral-500">{sim.tipo}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      estaOperando
                        ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                        : 'bg-neutral-800 text-neutral-500'
                    }`}
                  >
                    {estaOperando ? 'ON' : 'OFF'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tarjeta de Estado del Sistema de Operarios */}
        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/80 p-2.5 text-xs">
          <div className="flex items-center gap-2 font-medium">
            {operariosActivos > 0 || operariosEnCamino > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-400">
                  <strong>{operariosActivos}</strong> en cabina · <strong>{operariosEnCamino}</strong> ingresando
                </span>
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-neutral-500 shrink-0" />
                <span className="text-neutral-400">🚪 Operarios en espera en umbral de acceso</span>
              </>
            )}
          </div>
        </div>

        {/* Toggles de Cámara y Vista */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-neutral-300 border-t border-neutral-800 pt-3">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white transition">
            <input
              type="checkbox"
              checked={camaraSeguimiento}
              onChange={(e) => setCamaraSeguimiento(e.target.checked)}
              className="accent-amber-400 rounded h-3.5 w-3.5"
            />
            <Eye className="h-3.5 w-3.5 text-neutral-400" />
            <span>Seguir operario</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white transition">
            <input
              type="checkbox"
              checked={rotarCamara}
              onChange={(e) => setRotarCamara(e.target.checked)}
              className="accent-amber-400 rounded h-3.5 w-3.5"
            />
            <RotateCcw className="h-3.5 w-3.5 text-neutral-400" />
            <span>Girar vista</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white transition">
            <input
              type="checkbox"
              checked={grillaVisible}
              onChange={(e) => setGrillaVisible(e.target.checked)}
              className="accent-amber-400 rounded h-3.5 w-3.5"
            />
            <Grid className="h-3.5 w-3.5 text-neutral-400" />
            <span>Grilla</span>
          </label>
        </div>

        {/* Ayuda interactiva */}
        <div className="mt-3 text-[11px] text-neutral-400 border-t border-neutral-800/80 pt-2 leading-relaxed">
          💡 <span className="text-neutral-300">Interactividad 3D:</span> Hacé clic en un botón o directamente sobre cualquier simulador en el modelo. El operario entrará por la puerta, cruzará la línea amarilla y se subirá al puesto.
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════
          WIDGET DE TELEMETRÍA SUPERIOR DERECHO
      ═══════════════════════════════════════════════════════════════════ */}
      <header
        id="scada-telemetry-hud"
        className="absolute top-4 right-4 z-20 flex items-center gap-3 rounded-xl border border-neutral-700/60 bg-neutral-950/85 px-4 py-2.5 text-neutral-200 shadow-2xl backdrop-blur-md"
      >
        <div className="flex items-center gap-2 border-r border-neutral-800 pr-3">
          <Activity className="h-4 w-4 text-emerald-400 animate-pulse" />
          <div>
            <div className="text-[10px] text-neutral-500 font-mono">ESTACIONES</div>
            <div className="text-xs font-bold text-emerald-400 font-mono">
              {totalActivos} / {LISTA_SIMULADORES.length} ACTIVAS
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-r border-neutral-800 pr-3">
          <Zap className="h-4 w-4 text-amber-400" />
          <div>
            <div className="text-[10px] text-neutral-500 font-mono">CONSUMO TOTAL</div>
            <div className="text-xs font-bold text-amber-400 font-mono">
              {consumoTotalKW.toFixed(1)} kW
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          <div>
            <div className="text-[10px] text-neutral-500 font-mono">TIEMPO SESIÓN</div>
            <div className="text-xs font-bold text-cyan-400 font-mono">
              {formatoTiempo(segundosOperacion)}
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          BADGE INFERIOR DERECHO — AVISO DE SEGURIDAD VIAL
      ═══════════════════════════════════════════════════════════════════ */}
      <footer
        id="badgeInfo"
        className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-amber-500/80 bg-neutral-950/90 px-3.5 py-2 text-xs font-medium text-amber-400 shadow-2xl backdrop-blur-md pointer-events-none"
      >
        <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
        <span>
          ⚠️ <strong>Línea Amarilla Continua:</strong> Zona de Visitantes (No Pasar) · Simuladores en Sector Operativo
        </span>
      </footer>
    </div>
  );
}
