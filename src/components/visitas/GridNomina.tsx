'use client';

import { useState, type ChangeEvent } from 'react';
import type { AsistenteInput, RolAsistente } from '@/types/visitas';

interface GridNominaProps {
  asistentes: AsistenteInput[];
  onChange: (asistentes: AsistenteInput[]) => void;
}

const ROLES: readonly RolAsistente[] = ['Alumno', 'Docente'];

const INPUT_CLASS =
  'w-full rounded-sm border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100';
const INPUT_MONO_CLASS = INPUT_CLASS + ' font-mono';

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
    <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Nómina de alumnos y acompañantes
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Carga obligatoria para gestionar la póliza de seguro. Agregá a todos los alumnos y
            docentes que asistirán.
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Personas cargadas:{' '}
            <strong className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              {asistentes.length}
            </strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={agregarFila}
            className="rounded-sm bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            + Agregar persona
          </button>
          <button
            type="button"
            onClick={abrirModal}
            className="rounded-sm border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
          >
            📋 Pegar desde Excel
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-sm border border-zinc-200 border-l-2 border-l-amber-500 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:border-l-amber-500 dark:bg-zinc-900 dark:text-zinc-300">
        <strong className="font-semibold text-zinc-900 dark:text-zinc-100">Aviso:</strong> Si pegás
        los datos desde Excel, verificá que la información tome el formato correcto en las columnas.
        Si hay errores de formato, cargá a las personas de manera manual.
      </div>

      {asistentes.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
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
                      className={INPUT_MONO_CLASS}
                    />
                  </td>
                  <td className="pb-2 pr-2">
                    <input
                      type="date"
                      value={asistente.fecha_nacimiento ?? ''}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        actualizarFila(indice, 'fecha_nacimiento', event.target.value)
                      }
                      className={INPUT_MONO_CLASS}
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
                      className="rounded-sm px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
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
            className="w-full max-w-lg rounded-md border border-zinc-300 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Pegar desde Excel
            </h4>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Copiá las celdas de tu planilla (Apellido y Nombre, DNI, Fecha Nacimiento, Rol) y
              pegalas acá con Ctrl+V. Cada línea se agrega como una fila.
            </p>
            <textarea
              value={textoPegado}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setTextoPegado(event.target.value)}
              rows={8}
              placeholder={'Pérez Juan\t45123456\t2010-05-14\tAlumno'}
              className="mt-3 w-full rounded-sm border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="rounded-sm border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPegado}
                disabled={textoPegado.trim().length === 0}
                className="rounded-sm bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
