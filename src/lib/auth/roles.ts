/**
 * Punto de entrada unificado de roles y permisos para módulos del servidor.
 * Re-exporta los contratos puros de `matriz-permisos.ts` y los helpers de
 * resolución en Supabase de `permisos.ts`.
 */

import type { RolSistema } from './matriz-permisos';

export {
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
  obtenerPerfilUsuarioActual,
  listarUsuariosConRolesParaSuperadmin,
} from './permisos';

export function esRolOperativoCompleto(rol: RolSistema): boolean {
  return rol !== 'chofer_tup';
}
