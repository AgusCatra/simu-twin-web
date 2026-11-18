import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  esRolSistemaValido,
  normalizarRolSistema,
  obtenerRutaInicialPorRol,
  puedeAccederRuta,
  ROLES_SISTEMA,
  ETIQUETA_ROL,
  type PerfilUsuario,
  type RolSistema,
} from './matriz-permisos';

export {
  esRolSistemaValido,
  normalizarRolSistema,
  obtenerRutaInicialPorRol,
  puedeAccederRuta,
  ROLES_SISTEMA,
  ETIQUETA_ROL,
  type PerfilUsuario,
  type RolSistema,
};

interface FilaPerfilDB {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  rol: string | null;
  activo: boolean | null;
}

const EMAILS_SUPERADMIN_PRINCIPAL = new Set([
  'catramado@gmail.com',
  'catramado17@gmail.com',
]);

/**
 * Resuelve el perfil y rol RBAC del usuario autenticado en `public.perfiles_usuarios`.
 *
 * REGLA ANTI-BLOQUEO (Fail-Safe): si el usuario posee sesión válida en Supabase Auth
 * pero aún no tiene fila en `public.perfiles_usuarios`, su rol no es válido, o
 * corresponde al correo administrador principal con un rol degradado, se promueve y
 * persiste como `'superadmin'`.
 */
export async function obtenerPerfilUsuarioActual(): Promise<PerfilUsuario | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const reader = createAdminClient() ?? supabase;
  const { data: fila, error } = await reader
    .from('perfiles_usuarios')
    .select('id, email, nombre_completo, rol, activo')
    .eq('id', user.id)
    .maybeSingle<FilaPerfilDB>();

  if (error) {
    console.error('[obtenerPerfilUsuarioActual] Error al leer perfil:', {
      code: error.code,
      message: error.message,
    });
  }

  const emailUsuario = fila?.email?.trim() || user.email?.trim() || 'usuario@local';
  const esAdminPrincipal = EMAILS_SUPERADMIN_PRINCIPAL.has(
    emailUsuario.toLowerCase()
  );
  const nombreDefault =
    fila?.nombre_completo?.trim() ||
    (typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : '') ||
    emailUsuario.split('@')[0] ||
    'Administrador';

  if (
    fila &&
    esRolSistemaValido(fila.rol) &&
    (!esAdminPrincipal || fila.rol === 'superadmin')
  ) {
    return {
      id: fila.id,
      email: emailUsuario,
      nombre_completo: nombreDefault,
      rol: fila.rol,
      activo: fila.activo !== false,
      esFallbackFailSafe: false,
    };
  }

  // Fail-Safe: sembrar/elevar fila a superadmin si falta o si es cuenta administradora principal.
  const rolFailSafe: RolSistema = esAdminPrincipal
    ? 'superadmin'
    : normalizarRolSistema(fila?.rol);
  try {
    await reader.from('perfiles_usuarios').upsert(
      {
        id: user.id,
        email: emailUsuario,
        nombre_completo: nombreDefault,
        rol: rolFailSafe,
        activo: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (errUpsert) {
    console.error('[obtenerPerfilUsuarioActual] Aviso al sembrar perfil Fail-Safe:', {
      message: errUpsert instanceof Error ? errUpsert.message : 'Error de escritura',
    });
  }

  return {
    id: user.id,
    email: emailUsuario,
    nombre_completo: nombreDefault,
    rol: rolFailSafe,
    activo: true,
    esFallbackFailSafe: true,
  };
}

/**
 * Lista todos los usuarios registrados (combinando `public.perfiles_usuarios` y
 * `auth.users` cuando `SUPABASE_SERVICE_ROLE_KEY` está disponible) para la consola
 * de gestión de roles del Superadmin.
 */
export async function listarUsuariosConRolesParaSuperadmin(): Promise<
  PerfilUsuario[]
> {
  const actual = await obtenerPerfilUsuarioActual();
  if (!actual || actual.rol !== 'superadmin') return [];

  const admin = createAdminClient();
  const reader = admin ?? (await createClient());

  const { data: filas, error } = await reader
    .from('perfiles_usuarios')
    .select('id, email, nombre_completo, rol, activo')
    .order('created_at', { ascending: true })
    .returns<FilaPerfilDB[]>();

  if (error) {
    console.error('[listarUsuariosConRolesParaSuperadmin] Error:', {
      code: error.code,
      message: error.message,
    });
    return [actual];
  }

  const porId = new Map<string, PerfilUsuario>();
  for (const f of filas ?? []) {
    const email = f.email?.trim() || 'sin-email@local';
    porId.set(f.id, {
      id: f.id,
      email,
      nombre_completo: f.nombre_completo?.trim() || email.split('@')[0] || 'Usuario',
      rol: normalizarRolSistema(f.rol),
      activo: f.activo !== false,
      esFallbackFailSafe: !esRolSistemaValido(f.rol),
    });
  }

  if (admin) {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });
    for (const u of authList?.users ?? []) {
      if (!porId.has(u.id)) {
        const email = u.email?.trim() || 'sin-email@local';
        const metaNombre =
          typeof u.user_metadata?.full_name === 'string'
            ? u.user_metadata.full_name.trim()
            : '';
        porId.set(u.id, {
          id: u.id,
          email,
          nombre_completo: metaNombre || email.split('@')[0] || 'Usuario',
          rol: 'superadmin',
          activo: true,
          esFallbackFailSafe: true,
        });
      }
    }
  }

  if (!porId.has(actual.id)) {
    porId.set(actual.id, actual);
  }

  return Array.from(porId.values()).sort((a, b) =>
    a.email.localeCompare(b.email, 'es')
  );
}
