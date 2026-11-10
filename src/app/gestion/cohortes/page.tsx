import { redirect } from 'next/navigation';
import { AlertTriangle, CalendarCheck2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { obtenerDatosCohorteActiva } from '@/services/empleo';
import CabeceraConfiguracion from '@/components/empleo/CabeceraConfiguracion';
import ParrillaCabina from '@/components/empleo/ParrillaCabina';
import TablaPostulantes from '@/components/empleo/TablaPostulantes';
import BotonExportarCronograma from '@/components/empleo/BotonExportarCronograma';
import AccionesCohorte from '@/components/empleo/AccionesCohorte';
import BotonVolver from '@/components/ui/BotonVolver';
import {
  aFechaIso,
  describirEstadoViernesBuffer,
  obtenerProximoLunesPosterior,
  parsearFechaUtc,
  proyectarCalendarioCohorteV2,
  sumarDias,
  type EstadoViernesBuffer,
  type ProyeccionCohorteV2Resultado,
  type SesionPlanificada,
} from '@/lib/calendario-duplas';
import {
  formatearFechaLegible,
  generarLeyendaPlanta,
  obtenerBloquesTurno,
} from '@/lib/formato-cronograma';

/**
 * /gestion/cohortes — Panel operativo de Gestión de Empleo (Server Component).
 * Carga la cohorte activa, los feriados reales de `feriados_municipales`,
 * proyecta exclusivamente con el motor de duplas de 16 alumnos
 * (`@/lib/calendario-duplas`) con absorción en Viernes Buffer y ensambla:
 * cabecera de configuración, cronograma semanal de duplas, parrilla 4+3 y
 * tabla con drawer de ficha.
 */

export const dynamic = 'force-dynamic';

interface FilaFeriadoMunicipalRaw {
  fecha: string | null;
  descripcion: string | null;
}

interface FeriadoMunicipalItem {
  fecha: string;
  descripcion: string | null;
}

interface JornadaGrupoSemana {
  fecha: string;
  diaSemana: string;
  esRecuperatorioViernes: boolean;
}

interface SemanaCronogramaView {
  numero: number;
  viernes: EstadoViernesBuffer;
  etiquetaViernes: string;
  jornadasGrupoA: JornadaGrupoSemana[];
  jornadasGrupoB: JornadaGrupoSemana[];
}

function formatoFechaCortaUtc(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}`;
}

function extraerJornadasGrupoSemana(
  sesionesSemana: SesionPlanificada[],
  grupo: 'GRUPO_A' | 'GRUPO_B'
): JornadaGrupoSemana[] {
  const mapaPorFecha = new Map<string, JornadaGrupoSemana>();
  for (const s of sesionesSemana) {
    if (s.grupo !== grupo) continue;
    if (!mapaPorFecha.has(s.fechaProgramada)) {
      mapaPorFecha.set(s.fechaProgramada, {
        fecha: s.fechaProgramada,
        diaSemana: s.diaSemana,
        esRecuperatorioViernes: s.esRecuperatorioViernes,
      });
    }
  }
  return Array.from(mapaPorFecha.values()).sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );
}

function construirSemanasCronograma(
  cal: ProyeccionCohorteV2Resultado
): SemanaCronogramaView[] {
  return cal.viernesEstado.map((viernes, idx) => {
    const fLunes = aFechaIso(sumarDias(parsearFechaUtc(viernes.fecha), -4));
    const sesionesSemana = cal.matrizSesiones.filter(
      (s) => s.fechaProgramada >= fLunes && s.fechaProgramada <= viernes.fecha
    );

    return {
      numero: idx + 1,
      viernes,
      etiquetaViernes: describirEstadoViernesBuffer(viernes.estado),
      jornadasGrupoA: extraerJornadasGrupoSemana(sesionesSemana, 'GRUPO_A'),
      jornadasGrupoB: extraerJornadasGrupoSemana(sesionesSemana, 'GRUPO_B'),
    };
  });
}

export default async function GestionCohortesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [datos, { data: filasFeriados, error: errFeriados }] = await Promise.all([
    obtenerDatosCohorteActiva(),
    supabase
      .from('feriados_municipales')
      .select('fecha, descripcion')
      .order('fecha', { ascending: true })
      .returns<FilaFeriadoMunicipalRaw[]>(),
  ]);

  if (errFeriados) {
    console.error('[/gestion/cohortes] Error al consultar feriados_municipales:', {
      code: errFeriados.code,
      message: errFeriados.message,
    });
  }

  const feriadosDetalle: FeriadoMunicipalItem[] = (filasFeriados ?? [])
    .map((f) => ({
      fecha: typeof f.fecha === 'string' ? f.fecha.split('T')[0] : '',
      descripcion: f.descripcion ?? null,
    }))
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.fecha));

  const feriadosMunicipales: string[] = Array.from(
    new Set(feriadosDetalle.map((f) => f.fecha))
  ).sort();

  let calendarioV2: ProyeccionCohorteV2Resultado | null = null;
  if (datos) {
    const { fecha_teoria: fechaTeoria, fecha_inicio_sim: fechaInicioSim } =
      datos.cohorte;
    if (fechaInicioSim || fechaTeoria) {
      try {
        const fechaTeoriaResuelta = fechaTeoria ?? fechaInicioSim!;
        const fechaInicioResuelta =
          fechaInicioSim ?? obtenerProximoLunesPosterior(fechaTeoria!);
        calendarioV2 = proyectarCalendarioCohorteV2({
          fechaInicioTeoria: fechaTeoriaResuelta,
          fechaInicioSimulador: fechaInicioResuelta,
          diasBloqueados: feriadosMunicipales,
          estrategiaFeriados: 'MOVER_A_VIERNES',
        });
      } catch (err) {
        console.error(
          '[/gestion/cohortes] Error al proyectar calendario de duplas:',
          {
            message: err instanceof Error ? err.message : 'Error de fechas',
          }
        );
      }
    }
  }

  const semanasCronograma = calendarioV2
    ? construirSemanasCronograma(calendarioV2)
    : [];

  // Fuente de verdad del cronograma: proyección V2 de duplas + bloques de turnos.
  const proyeccion = datos
    ? {
        leyendaPlanta: generarLeyendaPlanta(datos.cohorte, calendarioV2),
        calendarioV2,
      }
    : null;
  const bloquesTurno = datos ? obtenerBloquesTurno(datos.franjas) : [];
  const siguienteRankingSugerido =
    (datos
      ? datos.postulantes.reduce((max, p) => Math.max(max, p.ranking_orden), 0)
      : 0) + 1;

  return (
    <div className="space-y-6">
      <div className="print-ocultar space-y-6">
      {/* ── Cabecera de la página ─────────────────────────────── */}
      <header className="border-b border-zinc-800 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-600">
              /GESTION/COHORTES · GESTIÓN DE EMPLEO
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">
              {datos
                ? `${datos.cohorte.nombre} · ${datos.cohorte.codigo}`
                : 'Gestión de Cohortes y Asignación de Cabina'}{' '}
              <span className="font-mono text-zinc-500">
                {'// MODELO DUPLAS · 16 ALUMNOS'}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BotonVolver href="/admin" etiqueta="Volver al Panel" />
            <AccionesCohorte
              cohorteActivaId={datos?.cohorte.id ?? null}
              cohorteActivaCodigo={datos?.cohorte.codigo ?? null}
              siguienteRankingSugerido={siguienteRankingSugerido}
              feriadosMunicipales={feriadosMunicipales}
            />
            {datos && proyeccion && (
              <BotonExportarCronograma
                cohorte={datos.cohorte}
                franjas={datos.franjas}
                proyeccion={proyeccion}
              />
            )}
          </div>
        </div>
      </header>

      {!datos ? (
        <div className="rounded-sm border border-dashed border-zinc-700 bg-zinc-950 px-4 py-16 text-center">
          <p className="font-mono text-xs tracking-[0.18em] text-zinc-400">
            SIN COHORTE ACTIVA
          </p>
          <p className="mx-auto mt-2 max-w-md font-mono text-[10.5px] leading-relaxed tracking-[0.08em] text-zinc-600">
            NO HAY NINGUNA COHORTE EN ESTADO &quot;ACTIVA&quot;. UTILIZÁ EL BOTÓN
            &quot;NUEVA COHORTE&quot; EN LA CABECERA PARA INICIALIZAR UNA COHORTE
            CON GRUPOS A/B, 8 DUPLAS Y SU PARRILLA DE 7 FRANJAS.
          </p>
        </div>
      ) : (
        <>
          <CabeceraConfiguracion
            cohorteId={datos.cohorte.id}
            fechaTeoriaInicial={datos.cohorte.fecha_teoria ?? ''}
            cupoInicial={datos.cohorte.max_titulares}
            totalConfirmados={datos.totalConfirmados}
            fechaInicioSim={
              calendarioV2?.fechaInicioSimulador ?? datos.cohorte.fecha_inicio_sim
            }
            fechaFinSim={
              calendarioV2?.fechaFinSimulador ?? datos.cohorte.fecha_fin_sim
            }
            fechaPasePlanta={
              calendarioV2?.fechaPaseTerreno ?? datos.cohorte.fecha_pase_planta
            }
            feriadosMunicipales={feriadosMunicipales}
          />

          <section
            aria-label="Cronograma de duplas y Viernes Buffer"
            className="space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-zinc-400">
                <CalendarCheck2 size={14} strokeWidth={1.75} aria-hidden />
                CRONOGRAMA DE DUPLAS (3 SEMANAS){' '}
                <span className="text-zinc-600">
                  {'// GRUPO A LUN-MIÉ · GRUPO B MAR-JUE'}
                </span>
              </h2>
              <span
                className={`rounded-sm border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.1em] ${
                  feriadosMunicipales.length > 0
                    ? 'border-amber-500/40 bg-amber-950/30 text-amber-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                {feriadosMunicipales.length === 0
                  ? '0 FERIADOS MUNICIPALES REGISTRADOS'
                  : `${feriadosMunicipales.length} FERIADOS MUNICIPALES (${feriadosMunicipales
                      .slice(0, 4)
                      .map(formatoFechaCortaUtc)
                      .join(', ')}${feriadosMunicipales.length > 4 ? '…' : ''})`}
              </span>
            </div>

            {!calendarioV2 ? (
              <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-center">
                <p className="font-mono text-xs tracking-[0.14em] text-zinc-400">
                  CALENDARIO DE DUPLAS SIN PROYECTAR
                </p>
                <p className="mt-1.5 font-mono text-[10.5px] tracking-[0.06em] text-zinc-500">
                  Seleccioná una fecha de teoría y aplicá la configuración para
                  proyectar las 3 semanas de duplas y los Viernes Buffer.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-3">
                  {semanasCronograma.map((sem) => {
                    const esRecuperatorio =
                      sem.viernes.estado === 'RECUPERATORIO_FERIADO';
                    return (
                      <article
                        key={sem.viernes.fecha}
                        className={`rounded-sm border bg-zinc-950 p-3.5 ${
                          esRecuperatorio
                            ? 'border-amber-500/45'
                            : 'border-zinc-800'
                        }`}
                      >
                        <header className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                          <p className="font-mono text-xs font-semibold tracking-[0.14em] text-white">
                            SEMANA {sem.numero}
                          </p>
                          <span className="font-mono text-[10px] tracking-[0.08em] text-zinc-500">
                            CIERRE VIE {formatoFechaCortaUtc(sem.viernes.fecha)}
                          </span>
                        </header>

                        <div className="mt-3 space-y-2.5 font-mono text-[11px]">
                          <div>
                            <p className="text-[10px] tracking-[0.12em] text-zinc-500">
                              GRUPO A · 4 DUPLAS (LUN / MIÉ)
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {sem.jornadasGrupoA.map((j) => (
                                <span
                                  key={j.fecha}
                                  className={`rounded-sm border px-2 py-0.5 text-[10.5px] ${
                                    j.esRecuperatorioViernes
                                      ? 'border-amber-500/40 bg-amber-950/35 text-amber-200'
                                      : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                                  }`}
                                >
                                  {j.diaSemana.slice(0, 3).toUpperCase()}{' '}
                                  {formatoFechaCortaUtc(j.fecha)}
                                  {j.esRecuperatorioViernes ? ' · RECUP.' : ''}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] tracking-[0.12em] text-zinc-500">
                              GRUPO B · 4 DUPLAS (MAR / JUE)
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {sem.jornadasGrupoB.map((j) => (
                                <span
                                  key={j.fecha}
                                  className={`rounded-sm border px-2 py-0.5 text-[10.5px] ${
                                    j.esRecuperatorioViernes
                                      ? 'border-amber-500/40 bg-amber-950/35 text-amber-200'
                                      : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                                  }`}
                                >
                                  {j.diaSemana.slice(0, 3).toUpperCase()}{' '}
                                  {formatoFechaCortaUtc(j.fecha)}
                                  {j.esRecuperatorioViernes ? ' · RECUP.' : ''}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div
                            className={`rounded-sm border px-2.5 py-2 ${
                              esRecuperatorio
                                ? 'border-amber-500/40 bg-amber-950/30 text-amber-200'
                                : 'border-emerald-500/25 bg-emerald-950/20 text-emerald-300'
                            }`}
                          >
                            <p className="text-[10px] font-semibold tracking-[0.08em]">
                              VIE {formatoFechaCortaUtc(sem.viernes.fecha)} ·{' '}
                              {sem.etiquetaViernes}
                            </p>
                            {esRecuperatorio && (
                              <p className="mt-0.5 text-[10px] text-amber-300/90">
                                {sem.viernes.sesionesReubicadas} sesiones reubicadas
                              </p>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {calendarioV2.alertas.length > 0 && (
                  <div
                    role="status"
                    className="flex items-start gap-2.5 rounded-sm border border-amber-500/35 bg-amber-950/25 px-3.5 py-2.5 font-mono text-[11px] text-amber-200"
                  >
                    <AlertTriangle
                      size={15}
                      strokeWidth={1.75}
                      className="mt-0.5 shrink-0 text-amber-400"
                      aria-hidden
                    />
                    <ul className="space-y-1">
                      {calendarioV2.alertas.map((alerta, idxAlerta) => (
                        <li key={idxAlerta}>{alerta}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          <section aria-label="Parrilla de cabina" className="space-y-3">
            <h2 className="font-mono text-[11px] tracking-[0.18em] text-zinc-400">
              PARRILLA DE CABINA{' '}
              <span className="text-zinc-600">
                {'// 4 FRANJAS MAÑANA · 3 TARDE · 3 PUESTOS C/U'}
              </span>
            </h2>
            <ParrillaCabina franjas={datos.franjas} />
          </section>

          <section aria-label="Ranking de postulantes" className="space-y-3">
            <h2 className="font-mono text-[11px] tracking-[0.18em] text-zinc-400">
              RANKING DE POSTULANTES{' '}
              <span className="text-zinc-600">
                {'// CLIC EN UNA FILA PARA VER LA FICHA TÉCNICA'}
              </span>
            </h2>
            <TablaPostulantes
              postulantes={datos.postulantes}
              franjas={datos.franjas}
            />
          </section>
        </>
      )}
      </div>

      {/* ── Hoja membretada del Cronograma Oficial (solo impresión) ── */}
      {datos && (
        <div className="hoja-cronograma">
          <header className="hc-membrete">
            <h1 className="hc-titulo">CRONOGRAMA OFICIAL · CURSO DE AUTOELEVADOR</h1>
            <p className="hc-subtitulo">
              Dirección de Empleo — Centro de Simuladores Venado Tuerto
            </p>
            <p className="hc-cohorte">
              {datos.cohorte.nombre} · {datos.cohorte.codigo}
            </p>
          </header>

          <section className="hc-seccion">
            <h2 className="hc-seccion-titulo">ETAPA 1 · CAPACITACIÓN TEÓRICA</h2>
            <p className="hc-dato">
              Fecha: {formatearFechaLegible(datos.cohorte.fecha_teoria)}
            </p>
            <p className="hc-dato">
              Asistencia obligatoria previa al ingreso a cabina.
            </p>
          </section>

          <section className="hc-seccion">
            <h2 className="hc-seccion-titulo">
              ETAPA 2 · PRÁCTICA EN SIMULADOR (MODELO DUPLAS · 16 ALUMNOS)
            </h2>
            <p className="hc-dato">
              Inicio:{' '}
              {formatearFechaLegible(
                calendarioV2?.fechaInicioSimulador ?? datos.cohorte.fecha_inicio_sim
              )}
            </p>
            <p className="hc-dato">
              Finalización:{' '}
              {formatearFechaLegible(
                calendarioV2?.fechaFinSimulador ?? datos.cohorte.fecha_fin_sim
              )}
            </p>
            <p className="hc-dato">
              Régimen: 8 duplas (Grupo A: Lun/Mié · Grupo B: Mar/Jue), 6 clases de
              1 hora por alumno.
            </p>
            {semanasCronograma.length > 0 && (
              <div className="mt-2 space-y-1">
                {semanasCronograma.map((sem) => (
                  <p className="hc-dato" key={sem.viernes.fecha}>
                    Semana {sem.numero} ({formatearFechaLegible(sem.viernes.fecha)}
                    ): {sem.etiquetaViernes}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="hc-seccion">
            <h2 className="hc-seccion-titulo">ETAPA 3 · EVALUACIÓN Y PASE A TERRENO</h2>
            <p className="hc-dato">{proyeccion?.leyendaPlanta ?? ''}</p>
          </section>

          <section className="hc-seccion">
            <h2 className="hc-seccion-titulo">DISTRIBUCIÓN DE TURNOS Y TERNAS</h2>
            {bloquesTurno.length === 0 ? (
              <p className="hc-dato">Aún no hay ternas confirmadas en la cabina.</p>
            ) : (
              bloquesTurno.map((bloque) => (
                <div className="hc-turno" key={bloque.turno}>
                  <h3 className="hc-turno-titulo">{bloque.titulo}</h3>
                  <div className="hc-ternas">
                    {bloque.ternas.map((terna, idxTerna) => (
                      <div className="hc-terna" key={`${bloque.turno}-${idxTerna}`}>
                        <p className="hc-horario">{terna.horario}</p>
                        <ol className="hc-lista">
                          {terna.nombres.map((nombre, idxNombre) => (
                            <li key={`${idxTerna}-${idxNombre}`}>{nombre}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

          <footer className="hc-pie">
            <p>
              Puntualidad estricta. Al superar 10 minutos de demora se pierde la
              práctica de la jornada.
            </p>
          </footer>
        </div>
      )}
    </div>
  );
}
