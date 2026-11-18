-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0010: Unificación Legajo 360°, Práctica Real en Terreno,
-- Asistencias Dinámicas de Simulador y Políticas de Storage.
--
-- 100% aditiva e idempotente (segura para re-ejecución en Supabase Dashboard).
-- =============================================================================

-- =============================================================================
-- 1. EXTENSIÓN DE public.practica_real (vinculación con postulantes + campos de terreno)
-- =============================================================================

ALTER TABLE public.practica_real
  ALTER COLUMN alumno_id DROP NOT NULL,
  ALTER COLUMN instructor_patio DROP NOT NULL;

ALTER TABLE public.practica_real
  ADD COLUMN IF NOT EXISTS postulante_id UUID REFERENCES public.postulantes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cohorte_id UUID REFERENCES public.cohortes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lugar_predio TEXT,
  ADD COLUMN IF NOT EXISTS maquina_utilizada TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_terreno TEXT,
  ADD COLUMN IF NOT EXISTS pdf_reporte_path TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'practica_real'
  ) THEN
    FOR v_conname IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND t.relname = 'practica_real'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%resultado%'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.practica_real DROP CONSTRAINT IF EXISTS %I',
        v_conname
      );
    END LOOP;

    ALTER TABLE public.practica_real
      ADD CONSTRAINT chk_practica_real_resultado
      CHECK (
        resultado IN ('aprobado', 'desaprobado', 'requiere_refuerzo', 'no_apto')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_practica_real_postulante
  ON public.practica_real(postulante_id)
  WHERE postulante_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_practica_real_cohorte_postulante
  ON public.practica_real(cohorte_id, postulante_id)
  WHERE cohorte_id IS NOT NULL AND postulante_id IS NOT NULL;

-- =============================================================================
-- 2. FLEXIBILIZACIÓN DE public.sesiones_practica (sesiones objetivo dinámicas)
-- =============================================================================

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sesiones_practica'
  ) THEN
    FOR v_conname IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND t.relname = 'sesiones_practica'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%numero_sesion%'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.sesiones_practica DROP CONSTRAINT IF EXISTS %I',
        v_conname
      );
    END LOOP;

    ALTER TABLE public.sesiones_practica
      ADD CONSTRAINT chk_sesiones_practica_numero_sesion
      CHECK (numero_sesion BETWEEN 1 AND 24);
  END IF;
END
$$;

-- Ampliar ENUM estado_asistencia_sesion si es posible (sin fallar dentro de DO)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asistencia_sesion') THEN
    BEGIN
      ALTER TYPE public.estado_asistencia_sesion ADD VALUE IF NOT EXISTS 'PENDIENTE';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE public.estado_asistencia_sesion ADD VALUE IF NOT EXISTS 'REPROGRAMADA';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- =============================================================================
-- 3. POLÍTICAS RLS EN STORAGE PARA BUCKET expedientes-practica-real
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'expedientes_practica_real_select_auth'
  ) THEN
    CREATE POLICY expedientes_practica_real_select_auth
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'expedientes-practica-real');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'expedientes_practica_real_insert_auth'
  ) THEN
    CREATE POLICY expedientes_practica_real_insert_auth
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'expedientes-practica-real');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'expedientes_practica_real_update_auth'
  ) THEN
    CREATE POLICY expedientes_practica_real_update_auth
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'expedientes-practica-real')
      WITH CHECK (bucket_id = 'expedientes-practica-real');
  END IF;
END
$$;
