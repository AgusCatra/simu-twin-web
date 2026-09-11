import { Activity } from 'lucide-react';

const PANEL_CLASS = 'rounded-sm border border-zinc-800 bg-zinc-950';

export default function AdminDashboardPage() {
  return (
    <section className={PANEL_CLASS}>
      <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-100"
        >
          <Activity size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-white">
            Estado en Vivo
          </h1>
          <p className="truncate font-mono text-[11px] tracking-[0.12em] text-zinc-500">
            /ADMIN · DASHBOARD
          </p>
        </div>
      </div>

      <div className="px-5 py-10">
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          Aquí se conectará el gemelo digital y las estadísticas generales.
        </p>
        <div className="mt-6 rounded-sm border border-dashed border-zinc-800 px-5 py-10 text-center">
          <p className="font-mono text-[11px] tracking-[0.16em] text-zinc-600">
            SIN FUENTES DE DATOS CONECTADAS
          </p>
        </div>
      </div>
    </section>
  );
}
