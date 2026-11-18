'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { calcularCargaHorariaOperador } from '@/lib/horas-capacitacion';
import type { InformeEmpleoIA } from '@/lib/ia/generador-informe';
import type { MetricasSimulador } from '@/lib/telemetria/parser-simulador';
import type {
  CohorteActiva,
  ComparativaProgreso,
  Legajo360Postulante,
  PostulanteFila,
} from '@/types/empleo';

interface Props {
  postulante: PostulanteFila;
  cohorte: CohorteActiva | null;
  comparativa: ComparativaProgreso | null;
  legajo: Legajo360Postulante | null;
  metricasOverride: MetricasSimulador | null;
  informeOverride: InformeEmpleoIA | null;
}

interface FilaCurvaResumen {
  clave: string;
  nombre: string;
  indicador: string;
  detalle: string;
}

function fNum(val: number | null | undefined, sufijo = ''): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
  return `${Math.round(val * 100) / 100}${sufijo}`;
}

function construirResumenCurvas(m: MetricasSimulador): FilaCurvaResumen[] {
  return [
    {
      clave: 'steering',
      nombre: 'Steering',
      indicador: `Serrucho ${fNum(m.indiceSerrucho)}`,
      detalle: `Volantazos extremos: ${fNum(m.volantazosExtremos)}`,
    },
    {
      clave: 'speed',
      nombre: 'Speed in Km/h',
      indicador: `Máx ${fNum(m.velocidadMaxKmh, ' km/h')}`,
      detalle: m.alertaFalsoPositivoSuelo
        ? `Descartes suelo (bug -2): ${m.colisionesDescartadas}`
        : `Colisiones reales: ${m.colisionesReales}`,
    },
    {
      clave: 'brake',
      nombre: 'Brake Pad',
      indicador: `Frenadas pánico: ${fNum(m.frenadasPanico)}`,
      detalle: 'Control longitudinal de frenado',
    },
    {
      clave: 'accel',
      nombre: 'Acceleration Pad',
      indicador: `A fondo: ${fNum(m.porcentajeAceleradorFondo, '%')}`,
      detalle: `Picos aceleración: ${fNum(m.picosAceleracion)}`,
    },
    {
      clave: 'fork',
      nombre: 'Fork Height',
      indicador: `Máx ${fNum(m.alturaMaximaHorquillaM, ' m')}`,
      detalle: `Horquilla alta: ${fNum(m.porcentajeCirculacionHorquillaAlta, '%')} (${fNum(m.muestrasHorquillaElevada)} m.)`,
    },
    {
      clave: 'mast',
      nombre: 'Mast Tilt',
      indicador: `Inestab.: ${fNum(m.indiceInestabilidadTilt)}`,
      detalle: `Oscilaciones mástil: ${fNum(m.oscilacionesMastil)}`,
    },
  ];
}

export default function Legajo360Imprimible({
  postulante,
  cohorte,
  comparativa,
  legajo,
  metricasOverride,
  informeOverride,
}: Props) {
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
  }, []);

  if (!montado) return null;

  const ev = postulante.evaluacion;
  const metricas = metricasOverride ?? ev?.telemetria_metricas ?? null;
  const informe = informeOverride ?? ev?.informe_ia ?? null;
  const perfil =
    ev?.perfil_operador ?? informe?.perfilOperador ?? 'SIN CLASIFICAR';
  const horasRec = ev?.horas_recomendadas ?? informe?.horasRecomendadas ?? null;
  const modulosRec =
    ev?.modulos_recomendados && ev.modulos_recomendados.length > 0
      ? ev.modulos_recomendados
      : (informe?.modulosRecomendados ?? []);

  const sesiones = legajo?.sesiones ?? [];
  const presentes = sesiones.filter(
    (s) => s.estado_asistencia === 'PRESENTE'
  ).length;
  const decInst = legajo?.decisionInstructor ?? null;
  const pracReal = legajo?.practicaReal ?? null;
  const carga = calcularCargaHorariaOperador({
    config: cohorte?.configuracion_cursado,
    asistioTeoria:
      decInst?.asistio_teoria ??
      (postulante.estado === 'CONFIRMADO' || presentes > 0 || Boolean(pracReal)),
    sesionesPresentes: presentes,
    tieneInstanciaCabina: Boolean(ev || metricas),
    horasRefuerzoSimulador: decInst?.horas_refuerzo_simulador ?? 0,
    practicaReal: pracReal,
    horasRecomendadasTitan: horasRec,
  });

  const contenido = (
    <div className="hoja-legajo-360" aria-hidden="true">
      <header className="l360-header">
        <div>
          <p style={{ margin: 0, fontSize: '8pt', fontWeight: 700, letterSpacing: '0.08em' }}>
            MUNICIPALIDAD DE VENADO TUERTO · DIRECCIÓN DE EMPLEO
          </p>
          <h1 style={{ margin: '2px 0', fontSize: '14pt', fontWeight: 700 }}>
            LEGAJO TÉCNICO 360° DEL OPERADOR
          </h1>
          <p style={{ margin: 0, fontSize: '9pt' }}>
            Cohorte: <strong>{cohorte?.nombre ?? 'Activa'}</strong> ({cohorte?.codigo ?? '—'})
            {cohorte?.fecha_teoria ? ` · Teoría: ${cohorte.fecha_teoria}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '8.5pt' }}>
          <p style={{ margin: 0 }}>
            Ranking: <strong>#{postulante.ranking_orden}</strong> · Estado:{' '}
            <strong>{postulante.estado}</strong>
          </p>
          <p style={{ margin: '2px 0 0' }}>
            Emisión: {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>
      </header>

      {/* ── Datos identificatorios ───────────────────────────────── */}
      <section className="l360-box">
        <h2 className="l360-box-title">1. Identificación y Notas de Empleo</h2>
        <div className="l360-grid-2">
          <p style={{ margin: 0 }}>
            <strong>Postulante:</strong> {postulante.nombre_completo}
          </p>
          <p style={{ margin: 0 }}>
            <strong>DNI:</strong> {postulante.dni} · <strong>Turno Origen:</strong>{' '}
            {postulante.origen_turno}
          </p>
        </div>
        {postulante.obs_empleo && (
          <p style={{ margin: '4px 0 0' }}>
            <strong>Observaciones Empleo:</strong> {postulante.obs_empleo}
          </p>
        )}
      </section>

      {/* ── Cabina Tablet + Ejes + Evolución T0 vs T1 ────────────── */}
      <div className="l360-grid-2">
        <section className="l360-box">
          <h2 className="l360-box-title">2. Evaluación de Cabina (Tablet Instructor)</h2>
          <p style={{ margin: '0 0 3px' }}>
            <strong>Dictamen:</strong> {ev?.dictamen ?? '—'} ·{' '}
            <strong>Asistencia:</strong>{' '}
            {ev?.nivel_asistencia ?? ev?.asistencia_cabina ?? '—'}
          </p>
          <p style={{ margin: '0 0 3px' }}>
            <strong>Score Tablet:</strong> {fNum(ev?.score_tablet, ' pts')} ·{' '}
            <strong>Bloque Split:</strong> {ev?.bloque_split ?? '—'}
          </p>
          <p style={{ margin: '0 0 3px' }}>
            <strong>4 Ejes (0–20):</strong> Lat {fNum(ev?.puntaje_lateralidad)} · Mandos{' '}
            {fNum(ev?.puntaje_tacto_mandos)} · Mástil {fNum(ev?.puntaje_mastil)} · Control{' '}
            {fNum(ev?.puntaje_control_receptividad)}
          </p>
          {ev?.hard_fail && (
            <p style={{ margin: '3px 0 0', fontWeight: 700 }}>
              HARD-FAIL CRÍTICO: {ev.motivo_hard_fail ?? 'Registrado en cabina'}
            </p>
          )}
          {ev?.observaciones_detalle && (
            <p style={{ margin: '3px 0 0' }}>
              <strong>Obs. Cabina:</strong> {ev.observaciones_detalle}
            </p>
          )}
        </section>

        <section className="l360-box">
          <h2 className="l360-box-title">3. Evolución T0 vs T1 (Receptividad)</h2>
          {comparativa?.deltaDiagnostico ? (
            <>
              <p style={{ margin: '0 0 3px' }}>
                <strong>Receptividad V1→V2:</strong>{' '}
                {comparativa.deltaDiagnostico.evaluacionReceptividad}
              </p>
              <p style={{ margin: '0 0 3px' }}>
                <strong>Delta Tiempo:</strong>{' '}
                {fNum(comparativa.deltaDiagnostico.deltaTiempoSeg, ' s')} ·{' '}
                <strong>Delta Colisiones:</strong>{' '}
                {fNum(comparativa.deltaDiagnostico.deltaColisiones)} ·{' '}
                <strong>Delta Score:</strong>{' '}
                {fNum(comparativa.deltaDiagnostico.deltaScore, ' pts')}
              </p>
              {comparativa.deltaFinal && (
                <p style={{ margin: '2px 0 0' }}>
                  <strong>Mejora Final:</strong>{' '}
                  {fNum(comparativa.deltaFinal.mejoraTotalPorcentaje, '%')} ·{' '}
                  <strong>Planta:</strong>{' '}
                  {comparativa.deltaFinal.aptoParaPlanta ? 'APTO' : 'EN OBSERVACIÓN'}
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0 }}>Sin comparativa multi-pasada V1/V2 registrada aún.</p>
          )}
        </section>
      </div>

      {/* ── Reportes del Simulador (6 curvas + Perfil + IA) ──────── */}
      <section className="l360-box">
        <h2 className="l360-box-title">
          4. Reportes del Simulador (6 Controles) e Informe de Desempeño
        </h2>
        <p style={{ margin: '0 0 4px' }}>
          <strong>Perfil de Conducción:</strong> {perfil} ·{' '}
          <strong>Horas Recomendadas:</strong> {fNum(horasRec, ' h')} ·{' '}
          <strong>Puntaje Simulador:</strong>{' '}
          {fNum(metricas?.scorePuntos ?? ev?.telemetria.score_puntos, ' pts')} ·{' '}
          <strong>Duración:</strong>{' '}
          {fNum(metricas?.tiempoDuracionSeg ?? ev?.telemetria.tiempo_vuelta_seg, ' s')} ·{' '}
          <strong>Colisiones Reales:</strong>{' '}
          {fNum(metricas?.colisionesReales ?? ev?.telemetria.colisiones)}
        </p>

        {metricas && (
          <table className="l360-table" style={{ marginBottom: '5px' }}>
            <thead>
              <tr>
                <th>Control del Simulador (6 Canales)</th>
                <th>Indicador Principal</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {construirResumenCurvas(metricas).map((c) => (
                <tr key={c.clave}>
                  <td>{c.nombre}</td>
                  <td>{c.indicador}</td>
                  <td>{c.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {modulosRec.length > 0 && (
          <p style={{ margin: '0 0 3px' }}>
            <strong>Módulos Recomendados:</strong> {modulosRec.join(' · ')}
          </p>
        )}

        {informe && (
          <>
            <p style={{ margin: '0 0 2px' }}>
              <strong>Dictamen Sugerido ({informe.origen}):</strong>{' '}
              {informe.dictamenSugerido}
            </p>
            <ul style={{ margin: '2px 0 0', paddingLeft: '16px' }}>
              {informe.puntos.map((p, idx) => (
                <li key={idx}>
                  <strong>{p.titulo}:</strong> {p.detalle}
                </li>
              ))}
            </ul>
          </>
        )}

        {(ev?.practicas_intermedias?.length ?? 0) > 0 && (
          <div style={{ marginTop: '5px', paddingTop: '4px', borderTop: '1px solid #d4d4d8' }}>
            <p style={{ margin: '0 0 2px', fontWeight: 700 }}>
              Prácticas Intermedias en Simulador ({ev?.practicas_intermedias?.length}):
            </p>
            <ul style={{ margin: 0, paddingLeft: '16px' }}>
              {ev?.practicas_intermedias?.map((p) => (
                <li key={p.id}>
                  <strong>{p.exercise_name}</strong> ({p.fecha ? p.fecha.slice(0, 10) : 's/f'}) · Puntaje:{' '}
                  {fNum(p.score_puntos, ' pts')} · Colisiones: {fNum(p.colisiones)} · Cuidado de la Máquina:{' '}
                  {typeof p.indice_cuidado_mecanico === 'number'
                    ? `${p.indice_cuidado_mecanico}%`
                    : '—'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Cuidado de la Máquina y Evolución 4 Etapas ─ */}
      <section className="l360-box">
        <h2 className="l360-box-title">
          4B. Indicadores de Cuidado y Evolución Longitudinal (4 Etapas)
        </h2>
        <p style={{ margin: '0 0 4px' }}>
          <strong>Cuidado de la Máquina:</strong>{' '}
          {postulante.analitica?.cuidadoMecanico
            ? `${postulante.analitica.cuidadoMecanico.indiceCuidadoMecanico}% (${postulante.analitica.cuidadoMecanico.categoria})`
            : '—'}{' '}
          · <strong>Velocidad de Aprendizaje (Diagnóstico → Final):</strong>{' '}
          {postulante.analitica?.plasticidad
            ? `${postulante.analitica.plasticidad.indicePlasticidad}/100 (${postulante.analitica.plasticidad.categoria})`
            : 'Instancia única'}{' '}
          · <strong>Posición en el Curso:</strong> Puntaje P
          {postulante.analitica?.percentilScore ?? '—'} · Aprendizaje P
          {postulante.analitica?.percentilVelocidad ?? '—'} · Cuidado P
          {postulante.analitica?.percentilCuidadoMecanico ?? '—'}
        </p>
        <div style={{ fontSize: '8.2pt', lineHeight: 1.35 }}>
          <p style={{ margin: '0 0 2px' }}>
            <strong>Etapa 1 (Diagnóstico T0 + Tablet):</strong>{' '}
            {informe?.evaluacionLongitudinal?.etapa1DiagnosticoT0 ??
              `Perfil ${perfil}, Score ${fNum(metricas?.scorePuntos ?? ev?.telemetria.score_puntos, ' pts')}, Colisiones ${fNum(metricas?.colisionesReales ?? ev?.telemetria.colisiones)}${decInst?.decision_t0 ? `, Decisión instructor T0: ${decInst.decision_t0}` : ''}.`}
          </p>
          <p style={{ margin: '0 0 2px' }}>
            <strong>Etapa 2 (Capacitación en Simulador):</strong>{' '}
            {informe?.evaluacionLongitudinal?.etapa2CapacitacionSimulador ??
              `${presentes} sesiones en dupla (${carga.horasSimuladorTotal} hs sim.) · Carga certificada acumulada: ${carga.totalCertificadas} hs (Teoría ${carga.horasTeoria}h + Sim. ${carga.horasSimuladorTotal}h + Terreno ${carga.horasTerrenoTotal}h).`}
          </p>
          <p style={{ margin: '0 0 2px' }}>
            <strong>Etapa 3 (Prueba Final T1 y Deltas):</strong>{' '}
            {informe?.evaluacionLongitudinal?.etapa3PruebaFinalT1 ??
              (comparativa?.pruebaFinal
                ? `Score Final ${fNum(comparativa.pruebaFinal.scorePuntos, ' pts')} · ΔScore ${fNum(comparativa.deltaFinal?.deltaScore, ' pts')} · Colisiones ${fNum(comparativa.pruebaFinal.colisiones)}.`
                : 'Pendiente de realización / carga de reporte final T1.')}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Etapa 4 (Práctica Real en Terreno):</strong>{' '}
            {informe?.evaluacionLongitudinal?.etapa4PracticaTerreno ??
              (pracReal
                ? `${pracReal.fecha_practica} · Asistencia ${pracReal.asistencia_terreno ?? 'PRESENTE'} · Resultado ${pracReal.resultado.toUpperCase()} · Decisión: ${pracReal.decision_instructor_terreno ?? '—'}.`
                : 'Pendiente de evaluación en autoelevador físico.')}
          </p>
        </div>
      </section>

      {/* ── Carga Horaria Total de Capacitación ──────────────────── */}
      <section className="l360-box">
        <h2 className="l360-box-title">
          5A. Carga Horaria Total de Capacitación (Regla Duplas 1.0 h c/u)
        </h2>
        <table className="l360-table">
          <thead>
            <tr>
              <th>Instancia Formativa</th>
              <th>Detalle de Acreditación</th>
              <th>Horas Certificadas</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Teoría y Seguridad</td>
              <td>Jornada introductoria obligatoria en aula</td>
              <td>{carga.horasTeoria} hs</td>
            </tr>
            <tr>
              <td>Entrenamiento e Instrucción en Simulador</td>
              <td>
                {presentes} sesiones dupla ({carga.horasSesionesDupla}h) + Diag./Final ({carga.horasDiagnosticoYFinal}h)
                {carga.horasRefuerzoSimulador > 0
                  ? ` + Refuerzo (${carga.horasRefuerzoSimulador}h)`
                  : ''}
              </td>
              <td>{carga.horasSimuladorTotal} hs</td>
            </tr>
            <tr>
              <td>Práctica Real en Terreno</td>
              <td>
                {pracReal
                  ? `Asistencia: ${pracReal.asistencia_terreno ?? 'PRESENTE'} (Base ${carga.horasTerrenoBase}h + Extra ${carga.horasExtraTerreno}h)`
                  : 'Pendiente de registro en patio'}
              </td>
              <td>{carga.horasTerrenoTotal} hs</td>
            </tr>
            <tr>
              <td>
                <strong>TOTAL HORAS DE FORMACIÓN CERTIFICADAS</strong>
              </td>
              <td>
                {carga.horasRecomendadasTitan !== null
                  ? `Comparado contra sugerencia Titán (${carga.horasRecomendadasTitan} hs): ${carga.cumpleRecomendacionTitan ? 'META CUMPLIDA' : `Restan ${Math.abs(carga.diferenciaContraTitan ?? 0)} hs`}`
                  : 'Cómputo integral de instrucción y práctica'}
              </td>
              <td>
                <strong>{carga.totalCertificadas} hs</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ── Asistencias de Simulador ─────────────────────────────── */}
      <section className="l360-box">
        <h2 className="l360-box-title">
          5B. Asistencias de Simulador ({presentes}/{sesiones.length} Presentes)
        </h2>
        {sesiones.length === 0 ? (
          <p style={{ margin: 0 }}>
            Sin sesiones generadas aún en la grilla sincronizada de duplas.
          </p>
        ) : (
          <table className="l360-table">
            <thead>
              <tr>
                <th>Sesión</th>
                <th>Fecha Prog.</th>
                <th>Fecha Real / Recuperatorio</th>
                <th>Rol Inicio</th>
                <th>Estado Asistencia</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {sesiones.map((s) => (
                <tr key={s.id}>
                  <td>Clase #{s.numero_sesion}</td>
                  <td>{s.fecha_programada}</td>
                  <td>
                    {s.fecha_real
                      ? `${s.fecha_real}${s.es_recuperatorio_viernes ? ' (Viernes Buffer)' : ''}`
                      : '—'}
                  </td>
                  <td>{s.rol_inicio === 'PILOTO_INICIAL' ? 'Piloto 1°' : 'Copiloto 1°'}</td>
                  <td>{s.estado_asistencia}</td>
                  <td>{s.observaciones_instructor ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Práctica Real en Terreno + Egreso ────────────────────── */}
      <div className="l360-grid-2">
        <section className="l360-box">
          <h2 className="l360-box-title">6. Práctica Real en Terreno (Patio)</h2>
          {legajo?.practicaReal ? (
            <>
              <p style={{ margin: '0 0 2px' }}>
                <strong>Fecha:</strong> {legajo.practicaReal.fecha_practica} ·{' '}
                <strong>Asistencia:</strong>{' '}
                {legajo.practicaReal.asistencia_terreno ?? 'PRESENTE'} ·{' '}
                <strong>Horas Terreno:</strong>{' '}
                {legajo.practicaReal.horas_practica_terreno ?? 1.5} hs
                {(legajo.practicaReal.horas_extra_terreno ?? 0) > 0
                  ? ` (+${legajo.practicaReal.horas_extra_terreno}h extra)`
                  : ''}
              </p>
              <p style={{ margin: '0 0 2px' }}>
                <strong>Resultado:</strong>{' '}
                {legajo.practicaReal.resultado.toUpperCase()} ·{' '}
                <strong>Decisión Terreno:</strong>{' '}
                {legajo.practicaReal.decision_instructor_terreno ?? '—'}
              </p>
              <p style={{ margin: '0 0 2px' }}>
                <strong>Predio / Lugar:</strong> {legajo.practicaReal.lugar_predio ?? '—'} ·{' '}
                <strong>Máquina:</strong> {legajo.practicaReal.maquina_utilizada ?? '—'}
              </p>
              <p style={{ margin: '0 0 2px' }}>
                <strong>Instructor Patio:</strong>{' '}
                {legajo.practicaReal.instructor_patio ?? '—'} ·{' '}
                <strong>¿Requiere refuerzo?:</strong>{' '}
                {legajo.practicaReal.requiere_horas_extra
                  ? `SÍ (+${legajo.practicaReal.horas_extra_sugeridas ?? 0} hs sugeridas)`
                  : 'NO'}
              </p>
              {(legajo.practicaReal.puntaje_lateralidad !== null ||
                legajo.practicaReal.puntaje_tacto_mandos !== null ||
                legajo.practicaReal.puntaje_mastil !== null ||
                legajo.practicaReal.puntaje_control_receptividad !== null) && (
                <p style={{ margin: '0 0 2px' }}>
                  <strong>4 Ejes Patio (0–20):</strong> Lat{' '}
                  {fNum(legajo.practicaReal.puntaje_lateralidad)} · Mandos{' '}
                  {fNum(legajo.practicaReal.puntaje_tacto_mandos)} · Mástil{' '}
                  {fNum(legajo.practicaReal.puntaje_mastil)} · Control{' '}
                  {fNum(legajo.practicaReal.puntaje_control_receptividad)}
                </p>
              )}
              {legajo.practicaReal.observaciones_terreno && (
                <p style={{ margin: '2px 0 0' }}>
                  <strong>Observaciones:</strong>{' '}
                  {legajo.practicaReal.observaciones_terreno}
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0 }}>Sin práctica en terreno registrada todavía.</p>
          )}
        </section>

        <section className="l360-box">
          <h2 className="l360-box-title">7. Dictamen Final y Egreso</h2>
          {legajo?.egreso ? (
            <>
              <p style={{ margin: '0 0 2px' }}>
                <strong>Estado Egreso:</strong> {legajo.egreso.estado_egreso} ·{' '}
                <strong>Perfil Laboral:</strong> {legajo.egreso.recomendacion_laboral}
              </p>
              <p style={{ margin: '0 0 2px' }}>
                <strong>Paso a Terreno Aprobado:</strong>{' '}
                {legajo.egreso.paso_a_terreno_aprobado === true
                  ? 'SÍ'
                  : legajo.egreso.paso_a_terreno_aprobado === false
                    ? 'NO'
                    : 'PENDIENTE'}{' '}
                · <strong>Horas Sim.:</strong> {legajo.egreso.horas_practica_completadas} h
              </p>
              {legajo.egreso.observaciones_egreso && (
                <p style={{ margin: '2px 0 0' }}>
                  <strong>Devolución Empleo:</strong>{' '}
                  {legajo.egreso.observaciones_egreso}
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0 }}>Evaluación final de egreso pendiente de cierre.</p>
          )}
        </section>
      </div>

      <footer
        style={{
          marginTop: '14px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          fontSize: '8.5pt',
          paddingTop: '12px',
        }}
      >
        <div style={{ borderTop: '1px solid #666', paddingTop: '4px', textAlign: 'center' }}>
          Firma Responsable Centro de Simuladores / Instructor
        </div>
        <div style={{ borderTop: '1px solid #666', paddingTop: '4px', textAlign: 'center' }}>
          Firma Dirección de Empleo · Municipalidad de Venado Tuerto
        </div>
      </footer>
    </div>
  );

  return createPortal(contenido, document.body);
}
