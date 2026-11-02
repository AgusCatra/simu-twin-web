import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { obtenerDatosCohorteActiva } from '@/services/empleo';
import CabeceraConfiguracion from '@/components/empleo/CabeceraConfiguracion';
import ParrillaCabina from '@/components/empleo/ParrillaCabina';
import TablaPostulantes from '@/components/empleo/TablaPostulantes';
import BotonExportarCronograma from '@/components/empleo/BotonExportarCronograma';
import {
  formatearFechaLegible,
  generarLeyendaPlanta,
  obtenerBloquesTurno,
} from '@/lib/formato-cronograma';

/**
 * /gestion/cohortes — Panel operativo de Gestión de Empleo (Server Component).
 * Carga la cohorte activa con sus franjas y postulantes ordenados por ranking
 * (incluida la última evaluacion_diagnostico) y ensambla: cabecera de
 * configuración dinámica, parrilla de cabina 4+3 y tabla con drawer de ficha.
 */

export const dynamic = 'force-dynamic';

export default async function GestionCohortesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const datos = await obtenerDatosCohorteActiva();

  // Fuente de verdad del cronograma: proyección de la ETAPA 3 y bloques de
  // turnos/ternas (solo confirmados). Se comparten con la botonera (WhatsApp)
  // y con la hoja membretada imprimible (PDF).
  const proyeccion = datos
    ? { leyendaPlanta: generarLeyendaPlanta(datos.cohorte) }
    : null;
  const bloquesTurno = datos ? obtenerBloquesTurno(datos.franjas) : [];

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
                {'// CUPO DINÁMICO'}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin"
              className="flex h-9 items-center gap-2 rounded-sm border border-zinc-700 px-3 font-mono text-[10px] tracking-[0.14em] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white focus-visible:outline-1 focus-visible:outline-white"
            >
              <ArrowLeft size={13} strokeWidth={1.75} aria-hidden />
              VOLVER AL PANEL
            </Link>
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
            NO HAY NINGUNA COHORTE EN ESTADO &quot;ACTIVA&quot; O NO SE PUDO LEER LA
            BASE. VERIFIQUE EN SUPABASE QUE EXISTA LA COHORTE Y QUE ESTÉN APLICADAS
            LAS MIGRACIONES 0005 Y 0007.
          </p>
        </div>
      ) : (
        <>
          <CabeceraConfiguracion
            cohorteId={datos.cohorte.id}
            fechaTeoriaInicial={datos.cohorte.fecha_teoria ?? ''}
            cupoInicial={datos.cohorte.max_titulares}
            totalConfirmados={datos.totalConfirmados}
            fechaInicioSim={datos.cohorte.fecha_inicio_sim}
            fechaFinSim={datos.cohorte.fecha_fin_sim}
            fechaPasePlanta={datos.cohorte.fecha_pase_planta}
          />

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
              ETAPA 2 · PRÁCTICA EN SIMULADOR (Lunes a Jueves)
            </h2>
            <p className="hc-dato">
              Inicio: {formatearFechaLegible(datos.cohorte.fecha_inicio_sim)}
            </p>
            <p className="hc-dato">
              Finalización: {formatearFechaLegible(datos.cohorte.fecha_fin_sim)}
            </p>
            <p className="hc-dato">
              Régimen: 1 hora diaria fija por terna. Viernes sin actividad.
            </p>
          </section>

          <section className="hc-seccion">
            <h2 className="hc-seccion-titulo">ETAPA 3 · EVALUACIÓN Y PASE A PLANTA</h2>
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
