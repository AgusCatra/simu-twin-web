-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0009: Unificación de Proyecto Titán (6 curvas + arquetipos),
-- Sistema de Roles RBAC y Configuración Dinámica de Cohortes.
--
-- 100% aditiva e idempotente (segura para re-ejecución en Supabase SQL Editor).
-- =============================================================================

-- =============================================================================
-- 1. REGULARIZACIÓN DE public.evaluacion_diagnostico (Sprint 4 + Proyecto Titán)
-- =============================================================================

ALTER TABLE public.evaluacion_diagnostico
  ADD COLUMN IF NOT EXISTS nivel_asistencia TEXT,
  ADD COLUMN IF NOT EXISTS bloque_split TEXT,
  ADD COLUMN IF NOT EXISTS telemetria_archivo_nombre TEXT,
  ADD COLUMN IF NOT EXISTS telemetria_metricas JSONB,
  ADD COLUMN IF NOT EXISTS informe_ia JSONB,
  ADD COLUMN IF NOT EXISTS perfil_operador TEXT,
  ADD COLUMN IF NOT EXISTS horas_recomendadas NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS modulos_recomendados JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_eval_nivel_asistencia;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_eval_nivel_asistencia
  CHECK (
    nivel_asistencia IS NULL OR
    nivel_asistencia IN (
      'AUTONOMO',
      'AYUDA_VERBAL',
      'INTERVENCION_CONSTANTE',
      'INTERVENCION_CRITICA'
    )
  );

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_eval_bloque_split;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_eval_bloque_split
  CHECK (
    bloque_split IS NULL OR
    bloque_split IN ('PILOTO_A', 'COPILOTO_B', 'PILOTO_B', 'COPILOTO_A')
  );

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_eval_perfil_operador;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_eval_perfil_operador
  CHECK (
    perfil_operador IS NULL OR
    perfil_operador IN (
      'NOVATO',
      'SIN_NOCION_ESPACIO',
      'APURADO',
      'INEFICIENTE',
      'EFICIENTE'
    )
  );

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_eval_horas_recomendadas;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_eval_horas_recomendadas
  CHECK (
    horas_recomendadas IS NULL OR
    (horas_recomendadas >= 0 AND horas_recomendadas <= 40)
  );

COMMENT ON COLUMN public.evaluacion_diagnostico.nivel_asistencia IS
  'Nivel granular de asistencia docente registrada en Consola de Cabina.';
COMMENT ON COLUMN public.evaluacion_diagnostico.bloque_split IS
  'Rol y bloque del cronómetro Split 30/30 durante la práctica en dupla.';
COMMENT ON COLUMN public.evaluacion_diagnostico.telemetria_archivo_nombre IS
  'Nombre del último archivo .json de telemetría subido desde Empleo.';
COMMENT ON COLUMN public.evaluacion_diagnostico.telemetria_metricas IS
  'Snapshot JSONB sanitizado de las 6 curvas de telemetría (Proyecto Titán).';
COMMENT ON COLUMN public.evaluacion_diagnostico.informe_ia IS
  'Síntesis de 3 puntos generada por Gemini 2.5 Flash o fallback heurístico.';
COMMENT ON COLUMN public.evaluacion_diagnostico.perfil_operador IS
  'Arquetipo determinista de operador: NOVATO, SIN_NOCION_ESPACIO, APURADO, INEFICIENTE o EFICIENTE.';
COMMENT ON COLUMN public.evaluacion_diagnostico.horas_recomendadas IS
  'Carga horaria sugerida en simulador según el perfil de operador y asistencia en cabina.';
COMMENT ON COLUMN public.evaluacion_diagnostico.modulos_recomendados IS
  'Lista JSONB de módulos pedagógicos recomendados para el plan de práctica.';

CREATE INDEX IF NOT EXISTS idx_eval_perfil_operador
  ON public.evaluacion_diagnostico(perfil_operador)
  WHERE perfil_operador IS NOT NULL;

-- =============================================================================
-- 2. EXPANSIÓN DE ROLES RBAC EN public.perfiles_usuarios
-- =============================================================================

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'perfiles_usuarios'
  ) THEN
    -- Eliminar cualquier constraint CHECK existente sobre la columna rol de forma idempotente
    FOR v_conname IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND t.relname = 'perfiles_usuarios'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%rol%'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.perfiles_usuarios DROP CONSTRAINT IF EXISTS %I',
        v_conname
      );
    END LOOP;

    ALTER TABLE public.perfiles_usuarios
      ADD CONSTRAINT chk_perfiles_usuarios_rol
      CHECK (
        rol IN (
          'superadmin',
          'administracion',
          'empleo',
          'instructor',
          'mesa_instructores',
          'chofer_tup'
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.perfiles_usuarios.rol IS
  'Rol RBAC asignado: superadmin, administracion, empleo, instructor, mesa_instructores o chofer_tup.';

CREATE OR REPLACE FUNCTION public.handle_nuevo_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
  v_nombre TEXT;
BEGIN
  v_rol := COALESCE(new.raw_user_meta_data->>'rol', 'instructor');
  IF v_rol NOT IN (
    'superadmin',
    'administracion',
    'empleo',
    'instructor',
    'mesa_instructores',
    'chofer_tup'
  ) THEN
    v_rol := 'instructor';
  END IF;

  v_nombre := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'nombre_completo'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(new.email, '@', 1)
  );

  INSERT INTO public.perfiles_usuarios (id, email, nombre_completo, rol, activo)
  VALUES (new.id, new.email, v_nombre, v_rol, TRUE)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = NOW();

  RETURN new;
END;
$$;

-- =============================================================================
-- 3. CONFIGURACIÓN DINÁMICA DE CURSADO EN public.cohortes
-- =============================================================================

ALTER TABLE public.cohortes
  ADD COLUMN IF NOT EXISTS configuracion_cursado JSONB
  NOT NULL
  DEFAULT '{"modalidad":"DUPLAS","dias_semana":[1,2,3,4],"franjas":["10:00-11:00","11:00-12:00","16:00-17:00","17:00-18:00"],"sesiones_objetivo":6}'::jsonb;

COMMENT ON COLUMN public.cohortes.configuracion_cursado IS
  'Parámetros dinámicos de cursado de la cohorte: modalidad, días de semana (1=Lun..5=Vie), franjas habilitadas y sesiones objetivo.';
