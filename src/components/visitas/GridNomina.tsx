'use client';

import { useState, type ChangeEvent } from 'react';
import type { AsistenteInput, RolAsistente } from '@/types/visitas';

interface GridNominaProps {
  asistentes: AsistenteInput[];
  onChange: (asistentes: AsistenteInput[]) => void;
}

const ROLES: readonly RolAsistente[] = ['Alumno', 'Docente'];

const INPUT_CLASS =
  'w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

function crearAsistente(): AsistenteInput {
  return { apellido_nombre: '', dni: '', fecha_nacimiento: '', rol: 'Alumno' };
}

function normalizarRol(valor: string | undefined): RolAsistente {
  const limpio = (valor ?? '').trim().toLowerCase();
  if (limpio.startsWith('doc') || limpio.startsWith('prof') || limpio.startsWith('maest')) {
    return 'Docente';
  }
  return 'Alumno';
}

/**
 * Parsea texto pegado desde Excel: cada línea es una fila y las columnas
 * vienen separadas por tabulaciones (\t).
 * Columnas esperadas: Apellido y Nombre | DNI | Fecha Nacimiento | Rol.
 */
function parsearDesdeExcel(texto: string): AsistenteInput[] {
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .map((linea) => {
      const columnas = linea.split('\t').map((celda) => celda.trim());
      return {
        apellido_nombre: columnas[0] ?? '',
        dni: columnas[1] ?? '',
        fecha_nacimiento: columnas[2] ?? '',
        rol: normalizarRol(columnas[3]),
      };
    })
    .filter((asistente) => asistente.apellido_nombre.length > 0);
}

export default function GridNomina({ asistentes, onChange }: GridNominaProps) {
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [textoPegado, setTextoPegado] = useState<string>('');

  function agregarFila() {
    onChange([...asistentes, crearAsistente()]);
  }

  function eliminarFila(indice: number) {
    onChange(asistentes.filter((_, i) => i !== indice));
  }

  function actualizarFila<K extends keyof AsistenteInput>(
    indice: number,
    campo: K,
    valor: AsistenteInput[K]
  ) {
    onChange(asistentes.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)));
  }

  function abrirModal() {
    setTextoPegado('');
    setModalAbierto(true);
  }

  function confirmarPegado() {
    const nuevas = parsearDesdeExcel(textoPegado);
    if (nuevas.length > 0) {
      onChange([...asistentes, ...nuevas]);
    }
    setModalAbierto(false);
    setTextoPegado('');
  }

  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Nómina de asistentes
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Opcional: podés completarla ahora o enviarla luego. Alumnos cargados:{' '}
            <strong className="font-semibold">{asistentes.length}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={agregarFila}
            className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-800"
          >
            + Agregar persona
          </button>
          <button
            type="button"
            onClick={abrirModal}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 transition hover:border-blue-500 hover:text-blue-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            📋 Pegar desde Excel
          </button>
        </div>
      </div>

      {asistentes.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                <th className="pb-2 pr-2">Apellido y Nombre</th>
                <th className="pb-2 pr-2">DNI</th>
                <th className="pb-2 pr-2">Fecha Nac.</th>
                <th className="pb-2 pr-2">Rol</th>
                <th className="pb-2" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {asistentes.map((asistente, indice) => (
                <tr key={indice} className="align-top">
                  <td className="pb-2 pr-2">
                    <input
                      type="text"
                      value={asistente.apellido_nombre}
                      placeholder="Ej: Pérez Juan"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        actualizarFila(indice, 'apellido_nombre', event.target.value)
                      }
                      className={INPUT_CLASS}
                    />
                  </td>
                  <td className="pb-2 pr-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={asistente.dni}
                      placeholder="DNI"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        actualizarFila(indice, 'dni', event.target.value)
                      }
                      className={INPUT_CLASS}
                    />
                  </td>
                  <td className="pb-2 pr-2">
                    <input
                      type="date"
                      value={asistente.fecha_nacimiento ?? ''}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        actualizarFila(indice, 'fecha_nacimiento', event.target.value)
                      }
                      className={INPUT_CLASS}
                    />
                  </td>
                  <td className="pb-2 pr-2">
                    <select
                      value={asistente.rol}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        actualizarFila(indice, 'rol', event.target.value as RolAsistente)
                      }
                      className={INPUT_CLASS}
                    >
                      {ROLES.map((rol) => (
                        <option key={rol} value={rol}>
                          {rol}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pb-2 text-right">
                    <button
                      type="button"
                      onClick={() => eliminarFila(indice)}
                      aria-label={`Eliminar fila ${indice + 1}`}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAbierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pegar nómina desde Excel"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalAbierto(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Pegar desde Excel
            </h4>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Copiá las celdas de tu planilla (Apellido y Nombre, DNI, Fecha Nacimiento, Rol) y
              pegalas acá con Ctrl+V. Cada línea se agrega como una fila.
            </p>
            <textarea
              value={textoPegado}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setTextoPegado(event.target.value)}
              rows={8}
              placeholder={'Pérez Juan\t45123456\t2010-05-14\tAlumno'}
              className="mt-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPegado}
                disabled={textoPegado.trim().length === 0}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Agregar a la grilla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
