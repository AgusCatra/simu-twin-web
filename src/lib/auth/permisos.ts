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

/**
 * Resuelve el perfil y rol RBAC del usuario autenticado en `public.perfiles_usuarios`.
 *
 * FIX SEC-1 / SEC-4: antes, si el usuario no tenía fila (o su rol era
 * inválido), esta función lo PROMOVÍA y PERSISTÍA como 'superadmin' en la
 * base ("Fail-Safe anti-bloqueo"), y además dos emails de Gmail hardcodeados
 * en el código recibían superadmin incondicional. Cualquiera que lograra
 * crear una cuenta (el registro público seguía habilitado) quedaba con
 * acceso total a datos de postulantes, legajos y nóminas de menores.
 *
 * Ahora: sin fila válida en `perfiles_usuarios`, la función devuelve `null`
 * (sin acceso) y NO escribe nada en la base. El acceso se habilita siempre de
 * forma explícita: un superadmin existente le asigna un rol a la cuenta desde
 * el panel de Usuarios y Permisos en /admin (ver cambiarRolUsuarioAction).
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

  if (!fila || !esRolSistemaValido(fila.rol)) {
    // Sin fila, o rol inválido: sin acceso. No se siembra ninguna fila acá;
    // la crea cambiarRolUsuarioAction cuando un superadmin asigna el rol.
    return null;
  }

  const emailUsuario = fila.email?.trim() || user.email?.trim() || 'usuario@local';
  const nombreDefault =
    fila.nombre_completo?.trim() ||
    (typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : '') ||
    emailUsuario.split('@')[0] ||
    'Administrador';

  return {
    id: fila.id,
    email: emailUsuario,
    nombre_completo: nombreDefault,
    rol: fila.rol,
    activo: fila.activo !== false,
    esFallbackFailSafe: false,
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
      // FIX SEC-1: si el rol guardado es inválido, se muestra el rol de menor
      // privilegio (no 'superadmin') para no preseleccionar la opción más
      // peligrosa en el <select> del panel; el badge "Sin asignar"
      // (esFallbackFailSafe) ya le avisa al superadmin que debe elegirlo.
      rol: normalizarRolSistema(f.rol) ?? 'chofer_tup',
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
        // FIX SEC-1/SEC-4: antes se mostraban acá como 'superadmin' (eran
        // justamente las cuentas de Auth sin fila propia, el caso que el
        // registro público abierto podía crear). Mismo criterio que arriba:
        // rol de menor privilegio + badge "Sin asignar".
        porId.set(u.id, {
          id: u.id,
          email,
          nombre_completo: metaNombre || email.split('@')[0] || 'Usuario',
          rol: 'chofer_tup',
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
