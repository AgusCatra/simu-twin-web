/**
 * Matriz pura de autorización RBAC (segura para Middleware, Client Components y Server Components).
 */

export const ROLES_SISTEMA = [
  'superadmin',
  'administracion',
  'empleo',
  'instructor',
  'mesa_instructores',
  'chofer_tup',
] as const;

export type RolSistema = (typeof ROLES_SISTEMA)[number];

export interface PerfilUsuario {
  id: string;
  email: string;
  nombre_completo: string;
  rol: RolSistema;
  activo: boolean;
  esFallbackFailSafe?: boolean;
}

export const ETIQUETA_ROL: Readonly<Record<RolSistema, string>> = {
  superadmin: 'SUPERADMIN',
  administracion: 'ADMINISTRACIÓN',
  empleo: 'EMPLEO',
  instructor: 'INSTRUCTOR',
  mesa_instructores: 'MESA INSTRUCTORES',
  chofer_tup: 'CHOFER TUP',
};

export function esRolSistemaValido(valor: unknown): valor is RolSistema {
  return (
    typeof valor === 'string' &&
    (ROLES_SISTEMA as readonly string[]).includes(valor)
  );
}

/**
 * FIX SEC-1: antes devolvía 'superadmin' por defecto cuando el valor era
 * inválido o faltaba (fail-safe anti-bloqueo). Eso significaba que CUALQUIER
 * usuario autenticado sin fila en `perfiles_usuarios` quedaba con acceso
 * total. Ahora un rol inválido o ausente se trata como "sin rol asignado"
 * (null): sin acceso a ninguna ruta protegida hasta que un superadmin lo
 * asigne explícitamente.
 */
export function normalizarRolSistema(valor: unknown): RolSistema | null {
  return esRolSistemaValido(valor) ? valor : null;
}

export function obtenerRutaInicialPorRol(rol: RolSistema): string {
  switch (rol) {
    case 'superadmin':
    case 'administracion':
      return '/admin';
    case 'empleo':
      return '/gestion/cohortes';
    case 'instructor':
    case 'mesa_instructores':
      return '/cabina/evaluacion';
    case 'chofer_tup':
      return '/admin/tup';
  }
}

function coincidePrefijoRuta(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

export function puedeAccederRuta(rol: RolSistema, pathnameRaw: string): boolean {
  const pathname =
    pathnameRaw.length > 1 ? pathnameRaw.replace(/\/+$/, '') : pathnameRaw;

  if (rol === 'chofer_tup') {
    return coincidePrefijoRuta(pathname, '/admin/tup');
  }

  return (
    coincidePrefijoRuta(pathname, '/admin') ||
    coincidePrefijoRuta(pathname, '/gestion') ||
    coincidePrefijoRuta(pathname, '/cabina')
  );
}
