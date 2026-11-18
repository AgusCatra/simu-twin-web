'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  esRolSistemaValido,
  obtenerPerfilUsuarioActual,
  obtenerRutaInicialPorRol,
  type RolSistema,
} from '@/lib/auth/permisos';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resuelve la ruta inicial correspondiente al rol del usuario recién autenticado.
 * Garantiza además el Fail-Safe anti-bloqueo para cuentas sin perfil previo.
 */
export async function resolverDestinoPostLoginAction(): Promise<string> {
  const perfil = await obtenerPerfilUsuarioActual();
  if (!perfil) return '/login';
  return obtenerRutaInicialPorRol(perfil.rol);
}

export interface CambiarRolUsuarioInput {
  user_id: string;
  nuevo_rol: RolSistema;
  email?: string;
  nombre_completo?: string;
}

export async function cambiarRolUsuarioAction(
  input: CambiarRolUsuarioInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input || !UUID_RE.test(input.user_id ?? '')) {
    return { ok: false, error: 'Identificador de usuario inválido.' };
  }
  if (!esRolSistemaValido(input.nuevo_rol)) {
    return { ok: false, error: 'Rol de sistema inválido.' };
  }

  const perfilActual = await obtenerPerfilUsuarioActual();
  if (!perfilActual || perfilActual.rol !== 'superadmin') {
    return {
      ok: false,
      error: 'Solo un usuario con rol SUPERADMIN puede modificar permisos.',
    };
  }

  const targetId = input.user_id.trim();
  if (targetId === perfilActual.id && input.nuevo_rol !== 'superadmin') {
    return {
      ok: false,
      error: 'No podés degradar tu propio rol de SUPERADMIN para evitar bloqueos.',
    };
  }

  const admin = createAdminClient();
  const writer = admin ?? (await createClient());

  const { data: existente } = await writer
    .from('perfiles_usuarios')
    .select('id, email, nombre_completo')
    .eq('id', targetId)
    .maybeSingle<{ id: string; email: string | null; nombre_completo: string | null }>();

  const emailFinal =
    existente?.email?.trim() ||
    input.email?.trim() ||
    `usuario-${targetId.slice(0, 8)}@local`;
  const nombreFinal =
    existente?.nombre_completo?.trim() ||
    input.nombre_completo?.trim() ||
    emailFinal.split('@')[0] ||
    'Usuario';

  const { error } = await writer.from('perfiles_usuarios').upsert(
    {
      id: targetId,
      email: emailFinal,
      nombre_completo: nombreFinal,
      rol: input.nuevo_rol,
      activo: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[cambiarRolUsuarioAction] Error al actualizar rol:', {
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      error: admin
        ? 'No se pudo actualizar el rol del usuario en base de datos.'
        : 'Falta SUPABASE_SERVICE_ROLE_KEY para editar perfiles de otros usuarios.',
    };
  }

  revalidatePath('/admin');
  return { ok: true };
}
