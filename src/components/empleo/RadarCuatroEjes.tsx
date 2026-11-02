'use client';

import type { EjeRadar, PuntoRadar } from '@/types/empleo';

/**
 * Radar/spider chart de 4 ejes en SVG nativo puro (sin librerías externas),
 * sobre la estética industrial del proyecto (zinc plano, font-mono).
 *
 * Ejes a 90°: Lateralidad (arriba), Mandos (derecha), Mástil (abajo),
 * Control (izquierda). Valores 0-100. Grillas concéntricas al 25/50/75/100%.
 * Polígono esmeralda = línea base (mejor diagnóstico); si `mostrarFinal`,
 * superpone un polígono cian con la evolución de la Prueba Final.
 */

interface Props {
  ejes: PuntoRadar[];
  /** Superponer el polígono de Prueba Final (cian). Solo si existe FINAL. */
  mostrarFinal?: boolean;
}

const ORDEN: readonly EjeRadar[] = ['Lateralidad', 'Mandos', 'Mástil', 'Control'];

// Grados: -90 arriba, 0 derecha, 90 abajo, 180 izquierda.
const ANGULO: Record<EjeRadar, number> = {
  Lateralidad: -90,
  Mandos: 0,
  'Mástil': 90,
  Control: 180,
};

const ETIQUETA: Record<EjeRadar, string> = {
  Lateralidad: 'LATERALIDAD',
  Mandos: 'MANDOS',
  'Mástil': 'MÁSTIL',
  Control: 'CONTROL',
};

// Anclaje del texto según el lado del eje.
const ANCLA: Record<EjeRadar, 'middle' | 'start' | 'end'> = {
  Lateralidad: 'middle',
  Mandos: 'start',
  'Mástil': 'middle',
  Control: 'end',
};

const CX = 100;
const CY = 100;
const R = 62;
const NIVELES = [25, 50, 75, 100] as const;

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function clamp(v: number | null | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(100, n));
}

/** Points string del polígono para un mapa eje→valor(0-100). */
function polygonPoints(valores: Record<EjeRadar, number>): string {
  return ORDEN.map((e) => {
    const [x, y] = polar((clamp(valores[e]) / 100) * R, ANGULO[e]);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function ringPoints(nivel: number): string {
  return ORDEN.map((e) => {
    const [x, y] = polar((nivel / 100) * R, ANGULO[e]);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export default function RadarCuatroEjes({ ejes, mostrarFinal = false }: Props) {
  const diag: Record<EjeRadar, number> = {
    Lateralidad: 0,
    Mandos: 0,
    'Mástil': 0,
    Control: 0,
  };
  const fin: Record<EjeRadar, number> = { ...diag };
  for (const p of ejes) {
    diag[p.eje] = p.valorDiagnostico;
    fin[p.eje] = p.valorFinal;
  }

  const resumen = ORDEN.map((e) => `${ETIQUETA[e]} ${Math.round(clamp(diag[e]))}`).join(', ');

  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox="-26 0 252 200"
        role="img"
        aria-label={`Radar de 4 ejes. Diagnóstico: ${resumen}.`}
        className="h-auto w-full max-w-[240px]"
      >
        {/* Grillas concéntricas de referencia */}
        {NIVELES.map((nivel) => (
          <polygon
            key={nivel}
            points={ringPoints(nivel)}
            className="fill-none stroke-zinc-800"
            strokeWidth={nivel === 100 ? 1 : 0.6}
          />
        ))}

        {/* Radios / spokes de cada eje */}
        {ORDEN.map((e) => {
          const [x, y] = polar(R, ANGULO[e]);
          return (
            <line
              key={`spoke-${e}`}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              className="stroke-zinc-700"
              strokeWidth={0.6}
            />
          );
        })}

        {/* Polígono Prueba Final (cian) — debajo del diagnóstico para contraste */}
        {mostrarFinal && (
          <polygon
            points={polygonPoints(fin)}
            className="fill-cyan-400/15 stroke-cyan-300"
            strokeWidth={1.25}
            strokeDasharray="3 2"
          />
        )}

        {/* Polígono línea base / mejor diagnóstico (esmeralda) */}
        <polygon
          points={polygonPoints(diag)}
          className="fill-emerald-500/20 stroke-emerald-400"
          strokeWidth={1.5}
        />

        {/* Vértices del diagnóstico */}
        {ORDEN.map((e) => {
          const [x, y] = polar((clamp(diag[e]) / 100) * R, ANGULO[e]);
          return (
            <circle
              key={`v-${e}`}
              cx={x}
              cy={y}
              r={2}
              className="fill-emerald-400"
            />
          );
        })}

        {/* Etiquetas de eje */}
        {ORDEN.map((e) => {
          const [x, y] = polar(R + 15, ANGULO[e]);
          return (
            <text
              key={`lbl-${e}`}
              x={x}
              y={y}
              textAnchor={ANCLA[e]}
              dominantBaseline="middle"
              className="fill-zinc-500 font-mono"
              style={{ fontSize: 7, letterSpacing: '0.08em' }}
            >
              {ETIQUETA[e]}
            </text>
          );
        })}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.1em] text-zinc-500">
          <span className="h-2 w-2 rounded-sm bg-emerald-400/80" aria-hidden />
          DIAGNÓSTICO
        </span>
        {mostrarFinal && (
          <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.1em] text-zinc-500">
            <span className="h-2 w-2 rounded-sm bg-cyan-300/80" aria-hidden />
            PRUEBA FINAL
          </span>
        )}
      </figcaption>
    </figure>
  );
}
