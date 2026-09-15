import { createBrowserClient } from '@supabase/ssr';

/**
 * Lee y valida las variables de entorno públicas de Supabase.
 * Lanza un Error claro en español si faltan (sin non-null assertions silenciosas).
 */
function obtenerVariablesEntorno(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. Verifique el archivo .env.local.'
    );
  }

  return { url, anonKey };
}

let instanciaNavegador: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente Supabase para componentes de navegador ('use client'),
 * basado en @supabase/ssr para compartir la sesión con el middleware.
 */
export function createClient(): ReturnType<typeof createBrowserClient> {
  if (!instanciaNavegador) {
    const { url, anonKey } = obtenerVariablesEntorno();
    instanciaNavegador = createBrowserClient(url, anonKey);
  }

  return instanciaNavegador;
}
