import { Sunrise, Sunset } from 'lucide-react';
import type { FranjaCabina } from '@/types/empleo';
import BotonLiberarPuesto from './BotonLiberarPuesto';

/**
 * Parrilla visual de cabina (Server Component): 4 tarjetas Mañana
 * (08:00-12:00) y 3 Tarde (16:00-19:00), cada una con 3 slots de puesto.
 * Badge verde "3/3 · LLENO" cuando la franja está completa; la liberación
 * de un puesto delega en el cliente mínimo BotonLiberarPuesto.
 */

interface Props {
  franjas: FranjaCabina[];
}

function SlotPuesto({
  numero,
  franja,
}: {
  numero: number;
  franja: FranjaCabina;
}) {
  const ocupante = franja.ocupantes[numero - 1];

  if (!ocupante) {
    return (
      <li className="flex h-11 items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border border-slate-400" />
        <span className="min-w-0 truncate text-xs font-medium text-slate-500">
          Puesto {numero} · Libre
        </span>
      </li>
    );
  }

  return (
    <li className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">
        P{numero} · {ocupante.nombre_completo}
      </span>
      <BotonLiberarPuesto
        inscripcionId={ocupante.inscripcion_id}
        nombrePostulante={ocupante.nombre_completo}
      />
    </li>
  );
}

function TarjetaFranja({ franja }: { franja: FranjaCabina }) {
  const llena = franja.ocupantes.length >= franja.cupo_maximo;

  return (
    <article
      aria-label={`Franja ${franja.horario_label}, ${franja.ocupantes.length} de ${franja.cupo_maximo} puestos`}
      className={`rounded-xl border bg-white p-3.5 shadow-sm ${
        llena ? 'border-emerald-300' : 'border-slate-200'
      }`}
    >
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">
          {franja.horario_label}
        </p>
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
            llena
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-100 text-slate-700'
          }`}
        >
          {franja.ocupantes.length}/{franja.cupo_maximo}
          {llena && ' · Completo'}
        </span>
      </header>
      <ul className="space-y-1.5">
        {[1, 2, 3].map((n) => (
          <SlotPuesto key={n} numero={n} franja={franja} />
        ))}
      </ul>
    </article>
  );
}

function GrupoTurno({
  etiqueta,
  Icono,
  rango,
  franjas,
}: {
  etiqueta: string;
  Icono: typeof Sunrise;
  rango: string;
  franjas: FranjaCabina[];
}) {
  return (
    <section aria-label={`${etiqueta} (${rango})`}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
        <Icono size={14} strokeWidth={1.75} aria-hidden />
        {etiqueta} · {rango}
      </p>
      {franjas.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
          Sin franjas cargadas para este turno
        </p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {franjas.map((franja) => (
            <TarjetaFranja key={franja.id} franja={franja} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ParrillaCabina({ franjas }: Props) {
  const manana = franjas.filter((f) => f.turno === 'Mañana');
  const tarde = franjas.filter((f) => f.turno === 'Tarde');

  return (
    <div className="space-y-5">
      <GrupoTurno
        etiqueta="MAÑANA"
        Icono={Sunrise}
        rango="08:00 A 12:00"
        franjas={manana}
      />
      <GrupoTurno
        etiqueta="TARDE"
        Icono={Sunset}
        rango="16:00 A 19:00"
        franjas={tarde}
      />
    </div>
  );
}
