'use client';

import React, { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { FichaTecnicaSimulador, EstadoSimulador } from '@/types/gemelo';
import {
  X,
  Tv,
  Gamepad2,
  Layers,
  GraduationCap,
  Radio,
  CheckCircle,
  User,
  HelpCircle,
} from 'lucide-react';

const GemeloGalponCanvas = dynamic(
  () => import('./GemeloGalponCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[600px] w-full flex-col items-center justify-center bg-zinc-950 text-emerald-400">
        <div className="relative flex items-center justify-center mb-4">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-emerald-400/20 border-t-emerald-400" />
          <Radio className="absolute h-6 w-6 animate-pulse text-emerald-400" />
        </div>
        <div className="text-sm font-mono tracking-widest uppercase text-zinc-300">
          Cargando Gemelo Digital SCADA...
        </div>
        <div className="text-xs text-zinc-500 mt-1">
          Inicializando maqueta isométrica del galpón y telemetría 3D
        </div>
      </div>
    ),
  }
);

export const SIMULADORES_DEFAULT: FichaTecnicaSimulador[] = [
  {
    id: 'autoelevador',
    codigo: 'SIM-01',
    nombre: 'Autoelevador Industrial',
    tipo: 'autoelevador',
    estado: 'libre',
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
  {
    id: 'pala-frontal',
    codigo: 'SIM-02',
    nombre: 'Pala Cargadora Frontal / Excavadora Hidráulica',
    tipo: 'pala-frontal',
    estado: 'operando',
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
    instructor: 'Instructor en turno: Práctica formativa activa',
  },
  {
    id: 'retroexcavadora',
    codigo: 'SIM-03',
    nombre: 'Retroexcavadora / Telehandler',
    tipo: 'retroexcavadora',
    estado: 'libre',
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
  {
    id: 'grua-telescopica',
    codigo: 'SIM-04',
    nombre: 'Grúa Telescópica / Izaje Industrial',
    tipo: 'grua-telescopica',
    estado: 'libre',
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
  {
    id: 'tractor',
    codigo: 'SIM-05',
    nombre: 'Tractor Agrícola / Implementos',
    tipo: 'tractor',
    estado: 'libre',
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
  {
    id: 'camion',
    codigo: 'SIM-06',
    nombre: 'Camión Pesado de Cargas',
    tipo: 'camion',
    estado: 'operando',
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
    instructor: 'Instructor en turno: Práctica formativa activa',
  },
  {
    id: 'simspray',
    codigo: 'SIM-07',
    nombre: 'SimSpray VR · Pintura Industrial',
    tipo: 'simspray',
    estado: 'libre',
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
];

interface VisorNave3DProps {
  simuladoresIniciales?: FichaTecnicaSimulador[];
}

export default function VisorNave3D({
  simuladoresIniciales = SIMULADORES_DEFAULT,
}: VisorNave3DProps) {
  const [simuladores] = useState<FichaTecnicaSimulador[]>(simuladoresIniciales);
  const [estacionSeleccionadaId, setEstacionSeleccionadaId] = useState<string | null>(null);

  // Mapeo de estados 'operando' vs 'detenido' para Three.js
  const estadosParaCanvas = useMemo(() => {
    const mapa: Record<string, EstadoSimulador> = {};
    simuladores.forEach((s) => {
      mapa[s.id] = s.estado === 'operando' ? 'operando' : 'detenido';
    });
    return mapa;
  }, [simuladores]);

  // Simulador actualmente seleccionado para el Drawer
  const simuladorSeleccionado = useMemo(() => {
    if (!estacionSeleccionadaId) return null;
    return simuladores.find((s) => s.id === estacionSeleccionadaId) || null;
  }, [estacionSeleccionadaId, simuladores]);

  // Conteo de puestos activos
  const puestosActivosCount = useMemo(() => {
    return simuladores.filter((s) => s.estado === 'operando').length;
  }, [simuladores]);

  const handleSeleccionarEstacion = useCallback((id: string | null) => {
    setEstacionSeleccionadaId(id);
  }, []);

  const handleCerrarDrawer = useCallback(() => {
    setEstacionSeleccionadaId(null);
  }, []);

  return (
    <div className="relative w-full h-full min-h-[600px] overflow-hidden bg-[#111216]">
      {/* Canvas 3D de Three.js con Maqueta Isométrica Fija */}
      <GemeloGalponCanvas
        estados={estadosParaCanvas}
        estacionSeleccionada={estacionSeleccionadaId}
        onSeleccionarEstacion={handleSeleccionarEstacion}
        camaraSeguimiento={false}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          HUD SUPERIOR — ESTADO EN VIVO SCADA
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/85 px-4 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
                SISTEMA EN VIVO // GEMELO DIGITAL SCADA
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400">
              <strong className="text-emerald-400 font-semibold">{puestosActivosCount} de {simuladores.length}</strong> puestos en sesión activa de entrenamiento
            </div>
          </div>
        </div>
      </div>

      {/* Ayuda interactiva en esquina inferior izquierda */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none hidden md:flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/75 px-3 py-1.5 text-[11px] font-mono text-zinc-400 backdrop-blur-sm">
        <HelpCircle className="h-3.5 w-3.5 text-emerald-400" />
        <span>Hacé clic sobre cualquier máquina en la maqueta 3D para abrir su Ficha Técnica</span>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DRAWER LATERAL FLOTANTE — FICHA TÉCNICA DE MÁQUINA (SOLO LECTURA)
      ═══════════════════════════════════════════════════════════════════ */}
      {simuladorSeleccionado && (
        <aside
          role="dialog"
          aria-label={`Ficha Técnica ${simuladorSeleccionado.nombre}`}
          className="absolute top-4 right-4 bottom-4 z-30 w-96 max-w-[calc(100vw-32px)] flex flex-col justify-between rounded-2xl border border-zinc-800/90 bg-zinc-950/95 p-5 text-zinc-100 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right-4 duration-200"
        >
          {/* Cabecera del Drawer */}
          <div>
            <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                    {simuladorSeleccionado.codigo}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
                    Puesto Especializado
                  </span>
                </div>
                <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                  {simuladorSeleccionado.nombre}
                </h3>
              </div>

              <button
                onClick={handleCerrarDrawer}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
                title="Cerrar Ficha Técnica"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Badge de Estado Operativo */}
            <div className="mt-3.5">
              {simuladorSeleccionado.estado === 'operando' ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      EN PRÁCTICA FORMATIVA
                    </span>
                  </div>
                  {simuladorSeleccionado.instructor && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300/90 border-t border-emerald-900/40 pt-1.5 font-mono">
                      <User className="h-3 w-3 text-emerald-400 shrink-0" />
                      <span>{simuladorSeleccionado.instructor}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
                  <span className="font-mono text-xs font-medium text-zinc-300">
                    DISPONIBLE EN NAVE
                  </span>
                </div>
              )}
            </div>

            {/* Bloque: Especificaciones de Hardware */}
            <div className="mt-4 space-y-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                Equipamiento de Cabina
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 p-2.5">
                  <Tv className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-zinc-200">Sistema Visual</div>
                    <div className="text-[11px] text-zinc-400 leading-relaxed">
                      {simuladorSeleccionado.especificacionesHardware.pantallas}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 p-2.5">
                  <Gamepad2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-zinc-200">Mandos & Controles</div>
                    <div className="text-[11px] text-zinc-400 leading-relaxed">
                      {simuladorSeleccionado.especificacionesHardware.mandos}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 p-2.5">
                  <Layers className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-zinc-200">Plataforma Háptica</div>
                    <div className="text-[11px] text-zinc-400 leading-relaxed">
                      {simuladorSeleccionado.especificacionesHardware.plataforma}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque: Módulos Pedagógicos */}
            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold mb-2">
                <GraduationCap className="h-3.5 w-3.5" />
                <span>Competencias que Entrena</span>
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {simuladorSeleccionado.modulosPedagogicos.map((modulo, i) => (
                  <li key={i} className="flex items-start gap-2 leading-relaxed">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{modulo}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Botón de Cierre al pie del Drawer */}
          <div className="mt-5 border-t border-zinc-800/80 pt-3">
            <button
              onClick={handleCerrarDrawer}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-emerald-950/30 hover:border-emerald-500/40 hover:text-emerald-300 active:scale-98"
            >
              Cerrar Ficha Técnica
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
