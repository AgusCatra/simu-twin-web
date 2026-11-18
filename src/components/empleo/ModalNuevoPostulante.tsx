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

const LABEL_CLASS = 'block text-xs font-semibold text-slate-700';
const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pendiente) {
          onCerrar();
        }
      }}
    >
      <form
        onSubmit={manejarSubmit}
        className="my-8 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="titulo-modal-nuevo-postulante"
              className="flex items-center gap-2 text-lg font-bold text-slate-900"
            >
              <UserPlus size={18} className="text-blue-600" strokeWidth={1.85} aria-hidden />
              Agregar Alumno
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Inscripción al curso {cohorteCodigo}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            aria-label="Cerrar modal de nuevo alumno"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
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
                Orden de prioridad (#) *
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

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            {duplaSugerida ? (
              <p className="font-medium text-emerald-700">
                Turno sugerido: Dupla #{duplaSugerida.duplaNumero} ·{' '}
                {duplaSugerida.grupo.replace('_', ' ')} ({duplaSugerida.diasLabel}) ·{' '}
                {duplaSugerida.horarioLabel}
              </p>
            ) : (
              <p className="font-medium text-amber-800">
                El puesto #{rankingOrden} quedará como suplente o en lista de espera.
              </p>
            )}
          </div>

          <div>
            <p className={LABEL_CLASS}>Disponibilidad horaria *</p>
            <div
              role="group"
              aria-label="Turno preferente"
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
                    className={`h-10 rounded-lg border px-2 text-xs font-semibold transition-colors ${
                      activo
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
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
              Observaciones (Opcional)
            </label>
            <textarea
              id="np-obs"
              rows={2}
              maxLength={2000}
              value={obsEmpleo}
              onChange={(e) => setObsEmpleo(e.target.value)}
              placeholder="Disponibilidad laboral o notas de seguimiento…"
              className={`mt-1 resize-y ${INPUT_CLASS}`}
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente}
            className="h-10 rounded-lg bg-blue-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pendiente ? 'Inscribiendo…' : 'Inscribir alumno'}
          </button>
        </footer>
      </form>
    </div>
  );
}
