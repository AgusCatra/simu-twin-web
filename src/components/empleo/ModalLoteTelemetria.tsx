'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { importarLoteTelemetriaCohorteAction } from '@/services/empleo';
import {
  clasificarPerfilOperador,
  MAX_BYTES_REPORTE_JSON,
  parsearReporteSimulador,
  type MetricasSimulador,
  type PerfilOperador,
} from '@/lib/telemetria/parser-simulador';
import {
  MAX_BYTES_REPORTE_PDF,
  parsearPdfSimuladorBrowser,
} from '@/lib/telemetria/parser-pdf-simulador';
import {
  calcularCuidadoDesdeMetricas,
  esMediumLoadOperation,
} from '@/lib/telemetria/analitica-predictiva';
import type { ResultadoLoteTelemetriaItem } from '@/types/empleo';

interface PostulanteRef {
  postulante_id: string;
  nombre_completo: string;
  dni: string;
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  cohorteId: string;
  cohorteCodigo: string;
  postulantes: PostulanteRef[];
}

interface ArchivoLoteParseado {
  key: string;
  archivoNombre: string;
  metricas: MetricasSimulador | null;
  perfil: PerfilOperador | null;
  postulanteId: string;
  errorParseo: string | null;
}

function normalizarTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/;/g, 'ñ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !['del', 'las', 'los'].includes(t));
}

function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length < b.length) [a, b] = [b, a];
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const ins = curr[j] + 1;
      const del = prev[j + 1] + 1;
      const sub = prev[j] + (a[i] === b[j] ? 0 : 1);
      curr.push(Math.min(ins, del, sub));
    }
    prev = curr;
  }
  return prev[prev.length - 1];
}

function emparejarPostulante(
  studentName: string | null,
  postulantes: readonly PostulanteRef[]
): string {
  const candTokens = normalizarTokens(studentName);
  if (candTokens.length === 0) return '';

  let mejorId = '';
  let mejorScore = 0;

  for (const p of postulantes) {
    const baseTokens = normalizarTokens(p.nombre_completo);
    if (baseTokens.length === 0) continue;

    let aciertos = 0;
    for (const ct of candTokens) {
      const matchea = baseTokens.some(
        (bt) =>
          bt === ct ||
          (bt.length >= 4 && ct.length >= 4 && distanciaLevenshtein(bt, ct) <= 2)
      );
      if (matchea) aciertos++;
    }

    if (aciertos === candTokens.length) {
      const score = aciertos * 10 - Math.abs(baseTokens.length - candTokens.length);
      if (score > mejorScore) {
        mejorScore = score;
        mejorId = p.postulante_id;
      }
    }
  }

  return mejorId;
}

export default function ModalLoteTelemetria({
  abierto,
  onCerrar,
  cohorteId,
  cohorteCodigo,
  postulantes,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<ArchivoLoteParseado[]>([]);
  const [procesandoPdfs, setProcesandoPdfs] = useState(false);
  const [progresoTexto, setProgresoTexto] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoLoteTelemetriaItem[] | null>(
    null
  );
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [guardando, startGuardarTransition] = useTransition();

  const listosParaImportar = useMemo(
    () =>
      items.filter(
        (it): it is ArchivoLoteParseado & { metricas: MetricasSimulador } =>
          it.metricas !== null && it.postulanteId.length > 0
      ),
    [items]
  );

  if (!abierto) return null;

  async function procesarArchivos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErrorGlobal(null);
    setResultados(null);
    setProcesandoPdfs(true);

    const lista = Array.from(files);
    const acumulados: ArchivoLoteParseado[] = [];

    try {
      for (let i = 0; i < lista.length; i++) {
        const archivo = lista[i];
        const nombre = archivo.name.trim() || `reporte-${i + 1}`;
        setProgresoTexto(`Procesando ${i + 1} / ${lista.length}: ${nombre}…`);

        const lower = nombre.toLowerCase();
        const esPdf =
          lower.endsWith('.pdf') || archivo.type === 'application/pdf';
        const esJson =
          lower.endsWith('.json') ||
          archivo.type === 'application/json' ||
          archivo.type === 'text/json';

        if (!esPdf && !esJson) {
          acumulados.push({
            key: `${nombre}-${i}`,
            archivoNombre: nombre,
            metricas: null,
            perfil: null,
            postulanteId: '',
            errorParseo: 'Formato no admitido (solo .pdf o .json).',
          });
          continue;
        }

        if (
          (esPdf && archivo.size > MAX_BYTES_REPORTE_PDF) ||
          (esJson && archivo.size > MAX_BYTES_REPORTE_JSON)
        ) {
          acumulados.push({
            key: `${nombre}-${i}`,
            archivoNombre: nombre,
            metricas: null,
            perfil: null,
            postulanteId: '',
            errorParseo: 'El archivo excede el límite de tamaño permitido.',
          });
          continue;
        }

        try {
          const metricas = esPdf
            ? await parsearPdfSimuladorBrowser(archivo)
            : parsearReporteSimulador(await archivo.text());
          const perfil = clasificarPerfilOperador(metricas).perfilOperador;
          const postulanteId = emparejarPostulante(
            metricas.studentName,
            postulantes
          );
          acumulados.push({
            key: `${nombre}-${i}`,
            archivoNombre: nombre,
            metricas,
            perfil,
            postulanteId,
            errorParseo: null,
          });
        } catch (err) {
          acumulados.push({
            key: `${nombre}-${i}`,
            archivoNombre: nombre,
            metricas: null,
            perfil: null,
            postulanteId: '',
            errorParseo:
              err instanceof Error ? err.message : 'Error al leer el reporte.',
          });
        }
      }

      setItems(acumulados);
    } finally {
      setProcesandoPdfs(false);
      setProgresoTexto(null);
    }
  }

  function actualizarMatch(key: string, postulanteId: string) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, postulanteId } : it))
    );
  }

  function importarLote() {
    if (listosParaImportar.length === 0 || guardando) return;
    setErrorGlobal(null);
    setResultados(null);

    startGuardarTransition(async () => {
      const payload = listosParaImportar.map((it) => ({
        postulante_id: it.postulanteId,
        archivo_nombre: it.archivoNombre,
        metricas: it.metricas,
      }));

      const todosResultados: ResultadoLoteTelemetriaItem[] = [];
      for (let i = 0; i < payload.length; i += 25) {
        const chunk = payload.slice(i, i + 25);
        const res = await importarLoteTelemetriaCohorteAction(cohorteId, chunk);
        if (!res.ok) {
          setErrorGlobal(res.error);
          return;
        }
        todosResultados.push(...res.detalles);
      }

      setResultados(todosResultados);
      router.refresh();
    });
  }

  const mapaPostulanteNombre = new Map(
    postulantes.map((p) => [p.postulante_id, p.nombre_completo])
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Subir Reportes del Simulador"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Sparkles size={17} className="text-blue-600" aria-hidden />
              Subir Reportes del Simulador
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Curso {cohorteCodigo} · Procesamiento directo en el navegador
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar ventana"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.json,application/pdf,application/json"
            onChange={(e) => {
              void procesarArchivos(e.target.files);
              e.target.value = '';
            }}
            className="sr-only"
          />

          <button
            type="button"
            disabled={procesandoPdfs || guardando}
            onClick={() => inputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 px-4 py-6 text-center transition-colors hover:border-blue-500 hover:bg-blue-50 disabled:cursor-wait"
          >
            {procesandoPdfs ? (
              <Loader2 size={24} className="animate-spin text-blue-600" aria-hidden />
            ) : (
              <FileUp size={24} className="text-blue-600" aria-hidden />
            )}
            <span className="mt-2.5 text-sm font-semibold text-slate-900">
              {progresoTexto ??
                'Seleccioná múltiples reportes .pdf o .json del simulador'}
            </span>
            <span className="mt-1 text-xs text-slate-600">
              Distingue automáticamente “Medium Load Operation” (Diagnóstico / Final) de otras Prácticas Intermedias
            </span>
          </button>

          {errorGlobal && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800"
            >
              <AlertTriangle size={16} aria-hidden />
              <span>{errorGlobal}</span>
            </div>
          )}

          {resultados && (
            <div
              role="status"
              className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs"
            >
              <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                <CheckCircle2 size={16} aria-hidden />
                Reportes guardados: {resultados.filter((r) => r.ok).length} ·{' '}
                Errores: {resultados.filter((r) => !r.ok).length}
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto text-slate-700">
                {resultados.map((r, idx) => (
                  <p key={`${r.archivo_nombre}-${idx}`}>
                    {r.ok ? '✓' : '✕'} <strong>{r.archivo_nombre}</strong> →{' '}
                    {mapaPostulanteNombre.get(r.postulante_id) ?? r.postulante_id} ·{' '}
                    {r.etapa === 'PRACTICA_INTERMEDIA'
                      ? `Práctica Intermedia (${r.exercise_name ?? 'Ejercicio'}${r.indice_cuidado_mecanico !== undefined && r.indice_cuidado_mecanico !== null ? ` · Cuidado ${r.indice_cuidado_mecanico}%` : ''})`
                      : `${r.etapa} · ${r.perfil_operador}`}
                    {r.delta_score !== null ? ` · ΔScore ${r.delta_score >= 0 ? '+' : ''}${r.delta_score}` : ''}
                    {r.error ? ` (${r.error})` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">Archivo</th>
                    <th className="px-3 py-2.5">Alumno / Fecha</th>
                    <th className="px-3 py-2.5">Ejercicio y Métricas</th>
                    <th className="px-3 py-2.5">Alumno del Curso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => {
                    const esMedium = it.metricas
                      ? esMediumLoadOperation(it.metricas.exerciseName)
                      : false;
                    const cuidadoPct = it.metricas
                      ? calcularCuidadoDesdeMetricas(it.metricas).indiceCuidadoMecanico
                      : null;

                    return (
                      <tr key={it.key} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-semibold text-slate-900">
                          {it.archivoNombre}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {it.errorParseo ? (
                            <span className="font-medium text-rose-700">{it.errorParseo}</span>
                          ) : (
                            <>
                              <span className="block font-semibold text-slate-900">
                                {it.metricas?.studentName ?? 'Sin nombre'}
                              </span>
                              <span className="text-xs text-slate-500">
                                {it.metricas?.exerciseStartTime ?? 'Sin fecha'}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {it.metricas ? (
                            <div className="space-y-1">
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                                  esMedium
                                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                                }`}
                              >
                                {esMedium
                                  ? 'Medium Load · Diagnóstico / Final'
                                  : `Práctica Intermedia · ${it.metricas.exerciseName ?? 'Otro'}`}
                              </span>
                              <span className="block text-xs text-slate-700 tabular-nums">
                                Puntaje {it.metricas.scorePuntos ?? '—'} · Colisiones{' '}
                                {it.metricas.colisionesReales}
                                {cuidadoPct !== null ? ` · Cuidado máquina ${cuidadoPct}%` : ''}
                              </span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {it.metricas ? (
                            <select
                              aria-label={`Emparejar ${it.archivoNombre}`}
                              value={it.postulanteId}
                              onChange={(e) => actualizarMatch(it.key, e.target.value)}
                              className={`h-9 w-full min-w-48 rounded-lg border px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                it.postulanteId
                                  ? 'border-emerald-300 bg-emerald-50/50 text-slate-900'
                                  : 'border-amber-300 bg-amber-50 text-amber-900'
                              }`}
                            >
                              <option value="">-- Seleccionar alumno --</option>
                              {postulantes.map((p) => (
                                <option key={p.postulante_id} value={p.postulante_id}>
                                  {p.nombre_completo} (DNI {p.dni})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-400">Ignorado</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <span className="text-xs font-medium text-slate-600">
            {listosParaImportar.length} de {items.length} reportes listos para guardar
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={listosParaImportar.length === 0 || guardando || procesandoPdfs}
              onClick={importarLote}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {guardando ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  Guardando reportes…
                </>
              ) : (
                `Guardar reportes (${listosParaImportar.length})`
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
