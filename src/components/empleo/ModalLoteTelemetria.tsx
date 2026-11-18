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
      aria-label="Subir Lote de PDFs Titán"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-sm border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl">
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <div>
            <p className="flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.14em] text-emerald-300">
              <Sparkles size={14} aria-hidden />
              SUBIR LOTE DE PDFs TITÁN (DIAGNÓSTICO / FINALES)
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
              Cohorte {cohorteCodigo} · Procesamiento 100% en navegador · 0 bytes en Storage
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar modal"
            className="rounded-sm border border-zinc-800 p-1.5 text-zinc-400 hover:border-zinc-600 hover:text-white"
          >
            <X size={16} aria-hidden />
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
            className="flex w-full cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed border-emerald-500/45 bg-zinc-900/60 px-4 py-5 text-center transition-colors hover:border-emerald-400 hover:bg-zinc-900 disabled:cursor-wait"
          >
            {procesandoPdfs ? (
              <Loader2 size={22} className="animate-spin text-emerald-400" aria-hidden />
            ) : (
              <FileUp size={22} className="text-emerald-400" aria-hidden />
            )}
            <span className="mt-2 font-mono text-xs font-semibold tracking-[0.08em] text-white">
              {progresoTexto ??
                'Seleccioná múltiples reportes .pdf o .json del simulador ETECH'}
            </span>
            <span className="mt-1 font-mono text-[10px] text-zinc-400">
              Detecta Student Name, fecha ISO (T0 vs FINAL T1), 6 curvas y deltas automáticamente
            </span>
          </button>

          {errorGlobal && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-sm border border-red-500/50 bg-red-950/35 px-3 py-2 font-mono text-xs text-red-300"
            >
              <AlertTriangle size={14} aria-hidden />
              <span>{errorGlobal}</span>
            </div>
          )}

          {resultados && (
            <div
              role="status"
              className="space-y-2 rounded-sm border border-emerald-500/50 bg-emerald-950/25 p-3 font-mono text-[10.5px]"
            >
              <p className="flex items-center gap-1.5 font-semibold text-emerald-300">
                <CheckCircle2 size={14} aria-hidden />
                LOTE PROCESADO: {resultados.filter((r) => r.ok).length} GUARDADOS ·{' '}
                {resultados.filter((r) => !r.ok).length} ERRORES
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto text-[10px] text-zinc-300">
                {resultados.map((r, idx) => (
                  <p key={`${r.archivo_nombre}-${idx}`}>
                    {r.ok ? '✓' : '✕'} <strong>{r.archivo_nombre}</strong> →{' '}
                    {mapaPostulanteNombre.get(r.postulante_id) ?? r.postulante_id} ·{' '}
                    {r.etapa} · {r.perfil_operador}
                    {r.delta_score !== null ? ` · ΔScore ${r.delta_score >= 0 ? '+' : ''}${r.delta_score}` : ''}
                    {r.error ? ` (${r.error})` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto rounded-sm border border-zinc-800">
              <table className="w-full text-left font-mono text-[10.5px]">
                <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-2.5 py-2">ARCHIVO</th>
                    <th className="px-2.5 py-2">ALUMNO PDF / FECHA</th>
                    <th className="px-2.5 py-2">MÉTRICAS</th>
                    <th className="px-2.5 py-2">POSTULANTE COHORTE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {items.map((it) => (
                    <tr key={it.key} className="hover:bg-zinc-900/40">
                      <td className="px-2.5 py-2 font-semibold text-zinc-200">
                        {it.archivoNombre}
                      </td>
                      <td className="px-2.5 py-2 text-zinc-300">
                        {it.errorParseo ? (
                          <span className="text-red-400">{it.errorParseo}</span>
                        ) : (
                          <>
                            <span className="block text-white">
                              {it.metricas?.studentName ?? 'Sin nombre'}
                            </span>
                            <span className="text-[9.5px] text-zinc-500">
                              {it.metricas?.exerciseStartTime ?? 'Sin fecha'}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-zinc-300">
                        {it.metricas ? (
                          <>
                            <span>
                              Score {it.metricas.scorePuntos ?? '—'} · Col{' '}
                              {it.metricas.colisionesReales}
                            </span>
                            <span className="block text-[9.5px] text-emerald-300">
                              {it.perfil ?? '—'}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        {it.metricas ? (
                          <select
                            aria-label={`Emparejar ${it.archivoNombre}`}
                            value={it.postulanteId}
                            onChange={(e) => actualizarMatch(it.key, e.target.value)}
                            className={`h-8 w-full min-w-44 rounded-sm border px-2 font-mono text-[10px] ${
                              it.postulanteId
                                ? 'border-emerald-500/50 bg-zinc-900 text-zinc-100'
                                : 'border-amber-500/60 bg-amber-950/30 text-amber-200'
                            }`}
                          >
                            <option value="">-- Seleccionar postulante --</option>
                            {postulantes.map((p) => (
                              <option key={p.postulante_id} value={p.postulante_id}>
                                {p.nombre_completo} (DNI {p.dni})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-zinc-500">Ignorado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-5 py-3.5">
          <span className="font-mono text-[10px] text-zinc-400">
            {listosParaImportar.length} de {items.length} reportes listos para guardar en Supabase
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="h-9 rounded-sm border border-zinc-700 px-3.5 font-mono text-[10px] tracking-[0.12em] text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              CERRAR
            </button>
            <button
              type="button"
              disabled={listosParaImportar.length === 0 || guardando || procesandoPdfs}
              onClick={importarLote}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-emerald-500 bg-emerald-500 px-4 font-mono text-[10px] font-semibold tracking-[0.12em] text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {guardando ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                  IMPORTANDO LOTE…
                </>
              ) : (
                `IMPORTAR LOTE (${listosParaImportar.length})`
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
