-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0013: bloquear el auto-escalado de rol en perfiles_usuarios
--
-- Idempotente: seguro para re-ejecución en Supabase Dashboard o CLI.
--
-- NO APLICAR DIRECTO CONTRA PRODUCCIÓN: probar primero en un proyecto de
-- staging (o al menos en local contra un dump reciente) y con backup hecho.
-- Esto es Row Level Security / roles: según las reglas de trabajo del
-- proyecto, no se aplica a producción sin ese paso previo.
--
-- Corrige DOS vías independientes de auto-escalado de privilegios sobre
-- public.perfiles_usuarios, ninguna de las dos relacionada con el fail-safe
-- de la app (ya corregido en el código, migración 'fase1/sacar-superadmin-
-- por-defecto'):
--
-- 1) La política RLS "perfiles_update_self_or_admin" (migraciones 0004 y
--    20261008) es `FOR UPDATE USING (auth.uid() = id)`, sin restricción de
--    columnas y sin WITH CHECK propio. Cualquier usuario autenticado puede
--    hacer, desde el navegador, con la anon key:
--      supabase.from('perfiles_usuarios').update({ rol: 'superadmin' }).eq('id', miId)
--    y pasa, porque la política solo verifica "¿es tu propia fila?", nunca
--    "¿qué estás cambiando?". Lo mismo aplica a la columna `activo`.
--
-- 2) El trigger `trg_usuario_creado` / función `handle_nuevo_usuario()`
--    (migraciones 0004 y 20261008) arma el rol del perfil nuevo leyendo
--    `new.raw_user_meta_data->>'rol'` tal cual viene del signup, y solo lo
--    rechaza si NO es uno de los 6 roles válidos. O sea que 'superadmin' SÍ
--    es aceptado. Mientras el registro público de Supabase Auth siga
--    habilitado, cualquiera puede pedir:
--      POST /auth/v1/signup  { "email": ..., "password": ...,
--                              "data": { "rol": "superadmin" } }
--    (con la anon key pública, sin tocar la app ni el código) y queda con
--    una fila en perfiles_usuarios con rol='superadmin' de entrada. Esto es
--    MÁS directo que el hallazgo 1 original: ni siquiera depende del
--    fail-safe de la app, es una función de la base que confía en un campo
--    que pone quien se registra.
--
-- Mientras no se cierre el registro público (checklist urgente, punto a),
-- esta migración es la mitigación real de (2). Cerrar el registro es
-- igualmente necesario: esta migración no reemplaza ese paso.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) handle_nuevo_usuario(): ya no confía en raw_user_meta_data->>'rol'.
--    Todo perfil nuevo se crea sin rol operativo real ('chofer_tup', el único
--    rol que puedeAccederRuta() restringe de verdad a una sola ruta). Un
--    superadmin existente le asigna el rol real desde /admin (Usuarios y
--    Permisos). CREATE OR REPLACE es idempotente y pisa la versión vigente
--    sin importar en cuál de las dos migraciones previas haya quedado creada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_nuevo_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
BEGIN
  v_nombre := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'nombre_completo'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(new.email, '@', 1)
  );

  -- FIX SEC-5: antes se usaba new.raw_user_meta_data->>'rol' (controlado por
  -- quien se registra) como rol del perfil nuevo. Ahora todo perfil nuevo
  -- nace en 'chofer_tup' (sin acceso real salvo /admin/tup) y un superadmin
  -- lo asciende a mano.
  INSERT INTO public.perfiles_usuarios (id, email, nombre_completo, rol, activo)
  VALUES (new.id, new.email, v_nombre, 'chofer_tup', TRUE)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = NOW();

  RETURN new;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2) Trigger BEFORE UPDATE que impide cambiar `rol` o `activo` salvo que
--    quien hace el UPDATE ya sea superadmin según su propia fila, o que la
--    conexión sea la service role (el backend, vía createAdminClient() en
--    cambiarRolUsuarioAction, que ya bypassea RLS igual). Es defensa en
--    profundidad: no depende de arreglar la política RLS en sí, y protege
--    aunque en el futuro se agregue o modifique alguna policy de UPDATE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proteger_cambio_rol_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol_actor TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
    SELECT rol INTO v_rol_actor
    FROM public.perfiles_usuarios
    WHERE id = auth.uid();

    IF v_rol_actor IS DISTINCT FROM 'superadmin' THEN
      RAISE EXCEPTION
        'Solo un superadmin puede modificar el rol o el estado activo de un usuario.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_cambio_rol_perfil ON public.perfiles_usuarios;

CREATE TRIGGER trg_proteger_cambio_rol_perfil
  BEFORE UPDATE ON public.perfiles_usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_cambio_rol_perfil();
