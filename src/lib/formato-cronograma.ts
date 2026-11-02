/**
 * Generador del Cronograma Oficial de la cohorte activa (módulo puro, sin
 * 'use server'). Alimenta dos salidas con la MISMA fuente de verdad:
 * - `generarTextoWhatsApp`: texto monoespaciado con emojis y *negritas* de
 *   WhatsApp para copiar al grupo del curso.
 * - `obtenerBloquesTurno` / `formatearFechaLegible`: estructura reutilizada por
 *   la hoja membretada imprimible (PDF) de la página.
 *
 * Solo lista postulantes CONFIRMADOS: la página/service ya vuelca en
 * `franja.ocupantes` únicamente las inscripciones en estado CONFIRMADO con
 * franja asignada (ver src/services/empleo.ts), por lo que filtrar por
 * ocupantes cumple el criterio de aceptación sin re-validar el estado acá.
 */

import type { CohorteActiva, FranjaCabina, TurnoFranja } from '@/types/empleo';

/** Tercer parámetro de `generarTextoWhatsApp`: datos ya proyectados del calendario. */
export interface ProyeccionCronograma {
  /** Texto de la ETAPA 3 (sin el prefijo de viñeta). */
  leyendaPlanta: string;
}

export interface TernaCronograma {
  /** Etiqueta horaria legible, ej. "08:00 a 09:00". */
  horario: string;
  /** Nombres de los confirmados en la franja, ordenados por ranking. */
  nombres: string[];
}

export interface BloqueTurnoCronograma {
  turno: TurnoFranja;
  /** Título en mayúsculas, ej. "TURNO MAÑANA". */
  titulo: string;
  ternas: TernaCronograma[];
}

const DIAS_SEMANA: readonly string[] = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

const MESES: readonly string[] = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const ORDEN_TURNOS: readonly TurnoFranja[] = ['Mañana', 'Tarde'];

/**
 * YYYY-MM-DD -> "lunes 3 de noviembre de 2026". Se construye desde las partes
 * (no desde un string ISO con timezone) para evitar corrimientos de un día.
 * Devuelve "A confirmar" si la fecha falta o tiene formato inválido.
 */
export function formatearFechaLegible(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'A confirmar';
  const [anio, mes, dia] = iso.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return 'A confirmar';
  }
  return `${DIAS_SEMANA[fecha.getDay()]} ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** "08:00:00" -> "08:00". Fallback al horario_label si vienen mal las horas. */
function recortarHora(hora: string | null | undefined): string {
  if (typeof hora === 'string' && hora.length >= 5) return hora.slice(0, 5);
  return '';
}

/** Etiqueta "08:00 a 09:00" a partir de hora_inicio/hora_fin de la franja. */
export function formatearHorarioFranja(franja: FranjaCabina): string {
  const inicio = recortarHora(franja.hora_inicio);
  const fin = recortarHora(franja.hora_fin);
  if (inicio && fin) return `${inicio} a ${fin}`;
  return franja.horario_label;
}

/**
 * Leyenda de la ETAPA 3 (evaluación y pase a planta) derivada de la cohorte.
 * Se calcula en la página y se pasa como `proyeccion.leyendaPlanta`.
 */
export function generarLeyendaPlanta(cohorte: CohorteActiva): string {
  const fecha = formatearFechaLegible(cohorte.fecha_pase_planta);
  return `Evaluación final y pase a planta: ${fecha}.`;
}

/**
 * Agrupa las franjas que tienen confirmados por turno (Mañana primero, luego
 * Tarde), ordenadas por hora de inicio y con los nombres por ranking. Excluye
 * turnos sin ternas para no imprimir encabezados vacíos.
 */
export function obtenerBloquesTurno(
  franjas: FranjaCabina[]
): BloqueTurnoCronograma[] {
  const conAlumnos = franjas.filter((f) => f.ocupantes.length > 0);

  return ORDEN_TURNOS.map((turno) => ({
    turno,
    titulo: turno === 'Mañana' ? 'TURNO MAÑANA' : 'TURNO TARDE',
    ternas: conAlumnos
      .filter((f) => f.turno === turno)
      .sort((a, b) => recortarHora(a.hora_inicio).localeCompare(recortarHora(b.hora_inicio)))
      .map((f) => ({
        horario: formatearHorarioFranja(f),
        nombres: [...f.ocupantes]
          .sort((a, b) => a.ranking_orden - b.ranking_orden)
          .map((o) => o.nombre_completo),
      })),
  })).filter((bloque) => bloque.ternas.length > 0);
}

/**
 * Arma el mensaje de WhatsApp con la estructura exacta acordada: etapas,
 * régimen, distribución de turnos/ternas y aviso de puntualidad. Las negritas
 * usan el asterisco simple de WhatsApp (*texto*).
 */
export function generarTextoWhatsApp(
  cohorte: CohorteActiva,
  franjasConAlumnos: FranjaCabina[],
  proyeccion: ProyeccionCronograma
): string {
  const lineas: string[] = [];

  lineas.push('📋 *CRONOGRAMA OFICIAL: CURSO DE AUTOELEVADOR*');
  lineas.push(
    '🏛️ *Dirección de Empleo - Centro de Simuladores Venado Tuerto*'
  );
  lineas.push('');

  lineas.push('🗓️ *ETAPA 1: CAPACITACIÓN TEÓRICA*');
  lineas.push(`• Fecha: ${formatearFechaLegible(cohorte.fecha_teoria)}`);
  lineas.push('• Asistencia obligatoria previa al ingreso a cabina.');
  lineas.push('');

  lineas.push('🚜 *ETAPA 2: PRÁCTICA EN SIMULADOR (Lunes a Jueves)*');
  lineas.push(`• Inicio: ${formatearFechaLegible(cohorte.fecha_inicio_sim)}`);
  lineas.push(`• Finalización: ${formatearFechaLegible(cohorte.fecha_fin_sim)}`);
  lineas.push(
    '• Régimen: 1 hora diaria fija por terna. Viernes sin actividad.'
  );
  lineas.push('');

  lineas.push('🏭 *ETAPA 3: EVALUACIÓN Y PASE A PLANTA*');
  lineas.push(`• ${proyeccion.leyendaPlanta}`);
  lineas.push('');

  lineas.push('👥 *DISTRIBUCIÓN DE TURNOS Y TERNAS:*');
  lineas.push('');

  const bloques = obtenerBloquesTurno(franjasConAlumnos);
  if (bloques.length === 0) {
    lineas.push('_Aún no hay ternas confirmadas en la cabina._');
    lineas.push('');
  } else {
    for (const bloque of bloques) {
      lineas.push(`*${bloque.titulo}:*`);
      for (const terna of bloque.ternas) {
        lineas.push(`⏰ *${terna.horario}:*`);
        terna.nombres.forEach((nombre, indice) => {
          lineas.push(`${indice + 1}. ${nombre}`);
        });
      }
      lineas.push('');
    }
  }

  lineas.push(
    '⚠️ *Puntualidad estricta. Al superar 10 minutos de demora se pierde la práctica de la jornada.*'
  );

  return lineas.join('\n');
}
