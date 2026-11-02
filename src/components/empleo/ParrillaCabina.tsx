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
      <li className="flex h-11 items-center gap-2 rounded-sm border border-dashed border-zinc-800 px-2.5">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm border border-zinc-700" />
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.12em] text-zinc-600">
          PUESTO {numero} · LIBRE
        </span>
      </li>
    );
  }

  return (
    <li className="flex h-11 items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-2.5">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm bg-emerald-500" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-100">
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
      className={`rounded-sm border bg-zinc-950 p-3 ${
        llena ? 'border-emerald-500/50' : 'border-zinc-800'
      }`}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-xs tracking-[0.12em] text-white">
          {franja.horario_label}
        </p>
        <span
          className={`rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] ${
            llena
              ? 'bg-emerald-500 text-emerald-950'
              : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          {franja.ocupantes.length}/{franja.cupo_maximo}
          {llena && ' · LLENO'}
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
      <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-zinc-500">
        <Icono size={13} strokeWidth={1.75} aria-hidden />
        {etiqueta} · {rango}
      </p>
      {franjas.length === 0 ? (
        <p className="mt-2 rounded-sm border border-dashed border-zinc-800 px-3 py-4 font-mono text-[10px] tracking-[0.12em] text-zinc-600">
          SIN FRANJAS CARGADAS PARA ESTE TURNO
        </p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
