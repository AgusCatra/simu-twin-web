'use client';

import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react';
import { UserPlus, X } from 'lucide-react';
import { crearPostulanteAction } from '@/services/empleo';
import { calcularEstructuraGruposYDuplas } from '@/lib/calendario-duplas';

/**
 * Modal accesible de alta e inscripción de postulante en la cohorte activa.
 * Valida DNI numérico, nombre, turno preferente y sugiere automáticamente la
 * dupla A/B correspondiente según el orden de ranking asignado.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  cohorteId: string;
  cohorteCodigo: string;
  siguienteRankingSugerido: number;
}

type OrigenTurno = 'TM' | 'TT' | 'INDEFINIDO';

const OPCIONES_TURNO: readonly { valor: OrigenTurno; etiqueta: string }[] = [
  { valor: 'TM', etiqueta: 'MAÑANA (TM)' },
  { valor: 'TT', etiqueta: 'TARDE (TT)' },
  { valor: 'INDEFINIDO', etiqueta: 'INDISTINTO' },
];

const LABEL_CLASS =
  'block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500';
const INPUT_CLASS =
  'w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none';

export default function ModalNuevoPostulante({
  abierto,
  onCerrar,
  cohorteId,
  cohorteCodigo,
  siguienteRankingSugerido,
}: Props) {
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [dni, setDni] = useState('');
  const [origenTurno, setOrigenTurno] = useState<OrigenTurno>('TM');
  const [telefono, setTelefono] = useState('');
  const [rankingOrden, setRankingOrden] = useState(() =>
    Math.max(1, siguienteRankingSugerido)
  );
  const [obsEmpleo, setObsEmpleo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    if (!abierto) return;
    function manejarEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendiente) {
        e.preventDefault();
        onCerrar();
      }
    }
    document.addEventListener('keydown', manejarEscape);
    return () => document.removeEventListener('keydown', manejarEscape);
  }, [abierto, pendiente, onCerrar]);

  const duplaSugerida = useMemo(() => {
    if (!Number.isInteger(rankingOrden) || rankingOrden < 1 || rankingOrden > 16) {
      return null;
    }
    const { duplas } = calcularEstructuraGruposYDuplas(16);
    return (
      duplas.find(
        (d) => rankingOrden >= d.puestoDesde && rankingOrden <= d.puestoHasta
      ) ?? null
    );
  }, [rankingOrden]);

  if (!abierto) return null;

  function reiniciarYEditarRanking() {
    setNombreCompleto('');
    setDni('');
    setOrigenTurno('TM');
    setTelefono('');
    setRankingOrden(Math.max(1, siguienteRankingSugerido + 1));
    setObsEmpleo('');
    setError(null);
  }

  function manejarSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const nombreLimpio = nombreCompleto.trim().replace(/\s+/g, ' ');
    if (nombreLimpio.length < 3) {
      setError('El nombre completo debe tener al menos 3 caracteres.');
      return;
    }

    const dniDigits = dni.replace(/\D+/g, '');
    if (!/^\d{7,9}$/.test(dniDigits)) {
      setError('Ingresá un DNI válido de 7 a 9 dígitos.');
      return;
    }

    if (!Number.isInteger(rankingOrden) || rankingOrden < 1 || rankingOrden > 999) {
      setError('El orden de ranking debe ser un número entero entre 1 y 999.');
      return;
    }

    const telLimpio = telefono.trim();
    if (telLimpio && !/^[+\d\s()-]{5,30}$/.test(telLimpio)) {
      setError('El teléfono tiene un formato inválido.');
      return;
    }

    startTransition(async () => {
      const res = await crearPostulanteAction({
        cohorte_id: cohorteId,
        nombre_completo: nombreLimpio,
        dni: dniDigits,
        origen_turno: origenTurno,
        telefono: telLimpio || null,
        ranking_orden: rankingOrden,
        obs_empleo: obsEmpleo.trim() || null,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      reiniciarYEditarRanking();
      onCerrar();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-nuevo-postulante"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pendiente) {
          onCerrar();
        }
      }}
    >
      <form
        onSubmit={manejarSubmit}
        className="my-8 w-full max-w-lg rounded-sm border border-zinc-700 bg-zinc-900"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div>
            <h2
              id="titulo-modal-nuevo-postulante"
              className="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100"
            >
              <UserPlus size={15} strokeWidth={1.75} aria-hidden />
              ALTA DE POSTULANTE
            </h2>
            <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-zinc-500">
              INSCRIPCIÓN EN COHORTE {cohorteCodigo}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            aria-label="Cerrar modal de nuevo postulante"
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <p
              role="alert"
              className="rounded-sm border border-red-900 bg-red-950 px-3 py-2 font-mono text-xs text-red-200"
            >
              {error}
            </p>
          )}

          <div>
            <label htmlFor="np-nombre" className={LABEL_CLASS}>
              Apellido y Nombre completo *
            </label>
            <input
              id="np-nombre"
              type="text"
              required
              maxLength={120}
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              placeholder="Ej: Pérez, Juan Manuel"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="np-dni" className={LABEL_CLASS}>
                DNI *
              </label>
              <input
                id="np-dni"
                type="text"
                inputMode="numeric"
                required
                maxLength={12}
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="Ej: 38123456"
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </div>

            <div>
              <label htmlFor="np-ranking" className={LABEL_CLASS}>
                Orden en ranking (#) *
              </label>
              <input
                id="np-ranking"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                required
                value={rankingOrden}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setRankingOrden(Math.trunc(v));
                }}
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </div>
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[10px] tracking-[0.08em]">
            {duplaSugerida ? (
              <p className="text-emerald-400">
                PROYECCIÓN DUPLA: Dupla #{duplaSugerida.duplaNumero} ·{' '}
                {duplaSugerida.grupo.replace('_', ' ')} ({duplaSugerida.diasLabel}) ·{' '}
                {duplaSugerida.horarioLabel}
              </p>
            ) : (
              <p className="text-amber-300">
                PROYECCIÓN DUPLA: Puesto #{rankingOrden} queda en nómina de reserva /
                suplentes (&gt;16 titulares en duplas).
              </p>
            )}
          </div>

          <div>
            <p className={LABEL_CLASS}>Disponibilidad horaria (Turno origen) *</p>
            <div
              role="group"
              aria-label="Turno de origen del postulante"
              className="mt-1 grid grid-cols-3 gap-2"
            >
              {OPCIONES_TURNO.map((t) => {
                const activo = origenTurno === t.valor;
                return (
                  <button
                    key={t.valor}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setOrigenTurno(t.valor)}
                    className={`h-10 rounded-sm border px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                      activo
                        ? 'border-white bg-white text-zinc-950'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    {t.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="np-telefono" className={LABEL_CLASS}>
              Teléfono (Opcional)
            </label>
            <input
              id="np-telefono"
              type="tel"
              maxLength={30}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 3462 55-0000"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>

          <div>
            <label htmlFor="np-obs" className={LABEL_CLASS}>
              Observaciones de Empleo (Opcional)
            </label>
            <textarea
              id="np-obs"
              rows={2}
              maxLength={2000}
              value={obsEmpleo}
              onChange={(e) => setObsEmpleo(e.target.value)}
              placeholder="Disponibilidad laboral, antecedentes o notas de derivación…"
              className={`mt-1 resize-y ${INPUT_CLASS}`}
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950 px-5 py-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            className="h-10 rounded-sm border border-zinc-700 bg-zinc-900 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente}
            className="h-10 rounded-sm border border-emerald-500 bg-emerald-500 px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {pendiente ? 'INSCRIBIENDO…' : 'INSCRIBIR POSTULANTE'}
          </button>
        </footer>
      </form>
    </div>
  );
}
