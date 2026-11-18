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

export function normalizarRolSistema(valor: unknown): RolSistema {
  return esRolSistemaValido(valor) ? valor : 'superadmin';
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
