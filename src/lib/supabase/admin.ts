import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase con `service_role` exclusivamente para operaciones de
 * servidor ya autenticadas y autorizadas (p. ej. subida/firma de PDFs en
 * buckets privados de Storage cuando el rol `authenticated` no tiene política).
 *
 * Nunca importar este módulo desde componentes `'use client'`.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
