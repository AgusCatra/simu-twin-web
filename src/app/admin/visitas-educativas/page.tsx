import type { Metadata } from 'next';
import TablaVisitasAdmin from '@/components/admin/visitas/TablaVisitasAdmin';

export const metadata: Metadata = {
  title: 'Visitas Educativas (H4) · Hub Simuladores',
  description:
    'Gestión operativa de las reservas de visitas educativas: seguros, transporte TUP, facturas, Drive y exportación de nóminas.',
};

export default function VisitasEducativasAdminPage() {
  return (
    <section className="space-y-4">
      <div className="border-b border-zinc-800 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
          Gestión de Visitas Educativas (H4)
        </h2>
        <p className="mt-1 font-mono text-[11px] tracking-[0.1em] text-zinc-500">
          /ADMIN/VISITAS-EDUCATIVAS · RESERVAS CONFIRMADAS
        </p>
      </div>

      <TablaVisitasAdmin />
    </section>
  );
}
