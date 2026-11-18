import { redirect } from 'next/navigation';
import { AlertTriangle, CalendarCheck2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { obtenerPerfilUsuarioActual, puedeAccederRuta } from '@/lib/auth/permisos';
import {
  listarCohortesDisponibles,
  obtenerDatosCohorteActiva,
} from '@/services/empleo';
import CabeceraConfiguracion from '@/components/empleo/CabeceraConfiguracion';
import ParrillaCabina from '@/components/empleo/ParrillaCabina';
import BotonExportarCronograma from '@/components/empleo/BotonExportarCronograma';
import AccionesCohorte from '@/components/empleo/AccionesCohorte';
import SelectorCohorte from '@/components/empleo/SelectorCohorte';
import PanelCohortesTabs from '@/components/empleo/PanelCohortesTabs';
import {
  aFechaIso,
  describirEstadoViernesBuffer,
  formatearDiasGrupoCorto,
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

export default async function GestionCohortesPage({
  searchParams,
}: {
  searchParams?: Promise<{ cohorteId?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const paramsResueltos = searchParams ? await searchParams : {};
  const rawCohorteId = paramsResueltos?.cohorteId;
  const cohorteIdSolicitada = Array.isArray(rawCohorteId)
    ? (rawCohorteId[0] ?? null)
    : (rawCohorteId ?? null);

  const [
    perfil,
    cohortesDisponibles,
    datos,
    { data: filasFeriados, error: errFeriados },
  ] = await Promise.all([
    obtenerPerfilUsuarioActual(),
    listarCohortesDisponibles(),
    obtenerDatosCohorteActiva(cohorteIdSolicitada),
    supabase
      .from('feriados_municipales')
      .select('fecha, descripcion')
      .order('fecha', { ascending: true })
      .returns<FilaFeriadoMunicipalRaw[]>(),
  ]);

  const rol = perfil?.rol ?? 'empleo';
  if (!puedeAccederRuta(rol, '/gestion/cohortes')) {
    redirect('/admin');
  }

  const cohorteActivaRealCodigo =
    cohortesDisponibles.find((c) => c.estado === 'activa')?.codigo ?? null;

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
    const {
      fecha_teoria: fechaTeoria,
      fecha_inicio_sim: fechaInicioSim,
      configuracion_cursado: configCursado,
    } = datos.cohorte;
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
          configuracionCursado: configCursado,
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
  const viernesSugeridos = calendarioV2
    ? calendarioV2.viernesEstado.map((v) => v.fecha)
    : [];
  const tieneTernasLegacy = datos
    ? datos.franjas.some((f) => f.ocupantes.length > 0)
    : false;
  const diasGrupoALabel = datos
    ? formatearDiasGrupoCorto(datos.cohorte.configuracion_cursado.dias_grupo_a)
    : 'Lun/Mié';
  const diasGrupoBLabel =
    datos && datos.cohorte.configuracion_cursado.dias_grupo_b.length > 0
      ? formatearDiasGrupoCorto(datos.cohorte.configuracion_cursado.dias_grupo_b)
      : null;

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

  const cronogramaNode = datos ? (
    <section
      aria-label="Cronograma semanal de duplas"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <CalendarCheck2 size={16} strokeWidth={1.85} className="text-blue-600" aria-hidden />
          Cronograma semanal ({semanasCronograma.length || 3} semanas)
          <span className="text-xs font-medium text-slate-500">
            · Grupo A {diasGrupoALabel}
            {diasGrupoBLabel ? ` · Grupo B ${diasGrupoBLabel}` : ' · Sin Grupo B'}
          </span>
        </h2>
        <span
          className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${
            feriadosMunicipales.length > 0
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-slate-200 bg-slate-100 text-slate-600'
          }`}
        >
          {feriadosMunicipales.length === 0
            ? 'Sin feriados cargados'
            : `${feriadosMunicipales.length} feriados cargados (${feriadosMunicipales
                .slice(0, 4)
                .map(formatoFechaCortaUtc)
                .join(', ')}${feriadosMunicipales.length > 4 ? '…' : ''})`}
        </span>
      </div>

      {!calendarioV2 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-slate-800">
            Calendario aún sin proyectar
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Abrí &quot;Configurar Días y Horarios&quot;, elegí una fecha de teoría y guardá para ver las 3 semanas de duplas y los viernes de recupero.
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
                  className={`rounded-xl border bg-slate-50/70 p-3.5 ${
                    esRecuperatorio ? 'border-amber-300' : 'border-slate-200'
                  }`}
                >
                  <header className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <p className="text-sm font-bold text-slate-900">
                      Semana {sem.numero}
                    </p>
                    <span className="text-xs font-medium text-slate-500">
                      Cierre vie {formatoFechaCortaUtc(sem.viernes.fecha)}
                    </span>
                  </header>

                  <div className="mt-3 space-y-2.5 text-xs">
                    <div>
                      <p className="font-semibold text-slate-600">
                        Grupo A · {datos.cohorte.configuracion_cursado.franjas_activas.length} duplas ({diasGrupoALabel})
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {sem.jornadasGrupoA.map((j) => (
                          <span
                            key={j.fecha}
                            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                              j.esRecuperatorioViernes
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-800'
                            }`}
                          >
                            {j.diaSemana.slice(0, 3)} {formatoFechaCortaUtc(j.fecha)}
                            {j.esRecuperatorioViernes ? ' · Recup.' : ''}
                          </span>
                        ))}
                      </div>
                    </div>

                    {diasGrupoBLabel && sem.jornadasGrupoB.length > 0 && (
                      <div>
                        <p className="font-semibold text-slate-600">
                          Grupo B · {datos.cohorte.configuracion_cursado.franjas_activas.length} duplas ({diasGrupoBLabel})
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {sem.jornadasGrupoB.map((j) => (
                            <span
                              key={j.fecha}
                              className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                                j.esRecuperatorioViernes
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-slate-200 bg-white text-slate-800'
                              }`}
                            >
                              {j.diaSemana.slice(0, 3)} {formatoFechaCortaUtc(j.fecha)}
                              {j.esRecuperatorioViernes ? ' · Recup.' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      className={`rounded-lg border px-2.5 py-2 ${
                        esRecuperatorio
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      <p className="text-xs font-semibold">
                        Vie {formatoFechaCortaUtc(sem.viernes.fecha)} ·{' '}
                        {sem.etiquetaViernes}
                      </p>
                      {esRecuperatorio && (
                        <p className="mt-0.5 text-xs text-amber-700">
                          {sem.viernes.sesionesReubicadas} clases reubicadas por feriado
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
              className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900"
            >
              <AlertTriangle
                size={15}
                strokeWidth={1.85}
                className="mt-0.5 shrink-0 text-amber-600"
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
  ) : null;

  const parrillaLegacyNode =
    datos && tieneTernasLegacy ? (
      <details className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900">
          Ver historial de horarios anteriores (modelo anterior de 3 por hora)
        </summary>
        <div className="mt-3">
          <ParrillaCabina franjas={datos.franjas} />
        </div>
      </details>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="print-ocultar space-y-5">
        <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-blue-700">
                Cursos y Alumnos · Simu-Twin Venado Tuerto
              </p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                {datos
                  ? `${datos.cohorte.nombre} (${datos.cohorte.codigo})`
                  : 'Gestión de Cursos y Alumnos'}
              </h1>
              {datos && (
                <p className="mt-0.5 text-sm text-slate-600">
                  Cursado en duplas de a 2 alumnos · Cupo {datos.cohorte.max_titulares} lugares ·{' '}
                  {datos.totalConfirmados} confirmados
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SelectorCohorte
                cohortes={cohortesDisponibles}
                cohorteSeleccionadaId={datos?.cohorte.id ?? null}
              />
              <AccionesCohorte
                cohorteActivaId={datos?.cohorte.id ?? null}
                cohorteActivaCodigo={datos?.cohorte.codigo ?? null}
                cohorteActivaRealCodigo={cohorteActivaRealCodigo}
                siguienteRankingSugerido={siguienteRankingSugerido}
                feriadosMunicipales={feriadosMunicipales}
                postulantes={(datos?.postulantes ?? []).map((p) => ({
                  postulante_id: p.postulante_id,
                  nombre_completo: p.nombre_completo,
                  dni: p.dni,
                }))}
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
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-base font-bold text-slate-900">
              Todavía no hay cursos creados
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              Usá el botón &quot;Nuevo Curso&quot; arriba a la derecha para crear la primera cohorte, definir los días de cursado y cargar los alumnos.
            </p>
          </div>
        ) : (
          <>
            <CabeceraConfiguracion
              key={datos.cohorte.id}
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
              configuracionInicial={datos.cohorte.configuracion_cursado}
            />

            <PanelCohortesTabs
              key={`tabs-${datos.cohorte.id}`}
              cohorteId={datos.cohorte.id}
              cohorteCodigo={datos.cohorte.codigo}
              cohorte={datos.cohorte}
              configuracionCursado={datos.cohorte.configuracion_cursado}
              postulantes={datos.postulantes}
              franjas={datos.franjas}
              duplasPersistidas={datos.duplasPersistidas}
              sesionesPractica={datos.sesionesPractica}
              viernesSugeridos={viernesSugeridos}
              impactoIndustrial={datos.impactoIndustrial}
              cronogramaNode={cronogramaNode}
              parrillaLegacyNode={parrillaLegacyNode}
            />
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
              ETAPA 2 · PRÁCTICA EN SIMULADOR (MODELO DUPLAS ·{' '}
              {datos.cohorte.configuracion_cursado.franjas_activas.length *
                (diasGrupoBLabel ? 4 : 2)}{' '}
              ALUMNOS)
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
              Régimen: {datos.cohorte.configuracion_cursado.franjas_activas.length * (diasGrupoBLabel ? 2 : 1)} duplas (Grupo A: {diasGrupoALabel}
              {diasGrupoBLabel ? ` · Grupo B: ${diasGrupoBLabel}` : ''}),{' '}
              {datos.cohorte.configuracion_cursado.sesiones_objetivo} clases de 1 hora por alumno.
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
