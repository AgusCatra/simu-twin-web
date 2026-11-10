import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import FormularioVisita from '@/components/visitas/FormularioVisita';
import type { Escuela, FechaHabilitada } from '@/types/visitas';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reserva de Visitas Educativas (H4)',
  description:
    'Formulario público para reservar visitas educativas al Centro Municipal de Simulación.',
};

function obtenerFechaHoyArgentinaISO(): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const anio = partes.find((p) => p.type === 'year')?.value ?? '2026';
  const mes = partes.find((p) => p.type === 'month')?.value ?? '01';
  const dia = partes.find((p) => p.type === 'day')?.value ?? '01';
  return `${anio}-${mes}-${dia}`;
}

export default async function VisitasPage() {
  let escuelasIniciales: Escuela[] = [];
  let fechasIniciales: FechaHabilitada[] = [];
  let errorCargaInicial: string | null = null;

  try {
    const supabase = await createClient();
    const hoyISO = obtenerFechaHoyArgentinaISO();

    const [resEscuelas, resFechas, resOcupadas] = await Promise.all([
      supabase
        .from('escuelas')
        .select('id, nombre_institucion, nombre_corto, direccion')
        .order('nombre_institucion', { ascending: true })
        .returns<Escuela[]>(),
      supabase
        .from('fechas_habilitadas')
        .select('id, fecha, habilitada, observaciones')
        .eq('habilitada', true)
        .gte('fecha', hoyISO)
        .order('fecha', { ascending: true })
        .returns<FechaHabilitada[]>(),
      supabase
        .from('visitas_educativas')
        .select('fecha_visita')
        .gte('fecha_visita', hoyISO)
        .neq('estado_visita', 'Cancelada')
        .returns<Array<{ fecha_visita: string }>>(),
    ]);

    if (resEscuelas.error || resFechas.error) {
      errorCargaInicial =
        'No se pudo cargar la información necesaria para la reserva. Intente reintentar.';
      console.error('[/visitas] Error SSR al cargar catálogos:', {
        escuelas: resEscuelas.error?.message,
        fechas: resFechas.error?.message,
      });
    } else {
      escuelasIniciales = resEscuelas.data ?? [];
      const fechasOcupadas = new Set(
        resOcupadas.error
          ? []
          : (resOcupadas.data ?? []).map((fila) => fila.fecha_visita)
      );
      fechasIniciales = (resFechas.data ?? []).map((fecha) => ({
        ...fecha,
        ocupada: fechasOcupadas.has(fecha.fecha),
      }));
    }
  } catch (err) {
    errorCargaInicial =
      'No se pudo conectar para obtener escuelas y fechas habilitadas.';
    console.error('[/visitas] Error inesperado SSR:', {
      message: err instanceof Error ? err.message : 'Error desconocido',
    });
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 dark:bg-neutral-950 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
            Centro de simuladores - Reserva de visitas educativas
          </h1>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 sm:text-base">
            Complete el formulario para solicitar un turno de visita educativa con su institución.
            Verificaremos la disponibilidad y gestionaremos la póliza de seguro correspondiente.
          </p>
        </header>
        <FormularioVisita
          escuelasIniciales={escuelasIniciales}
          fechasIniciales={fechasIniciales}
          errorCargaInicial={errorCargaInicial}
        />
      </div>
    </main>
  );
}
