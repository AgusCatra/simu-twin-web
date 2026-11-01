-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0005: Gestión de Empleo · modelo relacional Google Sheets
-- Idempotente: segura para re-ejecución en Supabase Dashboard o CLI.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. TABLAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.postulantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dni TEXT UNIQUE NOT NULL,
  nombre_completo TEXT NOT NULL,
  origen_turno TEXT NOT NULL CHECK (origen_turno IN ('TM', 'TT', 'INDEFINIDO')),
  telefono TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cohortes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  fecha_teoria DATE,
  fecha_inicio_sim DATE,
  cant_dias_sim INT DEFAULT 6,
  max_titulares INT DEFAULT 20,
  estado TEXT DEFAULT 'activa' CHECK (estado IN ('borrador', 'activa', 'finalizada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compatibilidad con la tabla cohortes de la migración 0004, preservando sus datos.
ALTER TABLE public.cohortes ADD COLUMN IF NOT EXISTS fecha_inicio_sim DATE;
ALTER TABLE public.cohortes ADD COLUMN IF NOT EXISTS cant_dias_sim INT DEFAULT 6;
ALTER TABLE public.cohortes ADD COLUMN IF NOT EXISTS max_titulares INT DEFAULT 20;
ALTER TABLE public.cohortes ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activa'
  CHECK (estado IN ('borrador', 'activa', 'finalizada'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cohortes'
      AND column_name = 'fecha_inicio_diagnostico'
  ) THEN
    ALTER TABLE public.cohortes
      ALTER COLUMN fecha_inicio_diagnostico DROP NOT NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.franjas_cabina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohorte_id UUID REFERENCES public.cohortes(id) ON DELETE CASCADE,
  turno TEXT NOT NULL CHECK (turno IN ('Mañana', 'Tarde')),
  horario_label TEXT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  cupo_maximo INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cohorte_inscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohorte_id UUID REFERENCES public.cohortes(id) ON DELETE CASCADE,
  postulante_id UUID REFERENCES public.postulantes(id) ON DELETE CASCADE,
  ranking_orden INT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE'
    CHECK (estado IN ('DISPONIBLE', 'CONFIRMADO', 'DESCARTADO')),
  motivo_baja TEXT,
  obs_empleo TEXT,
  horas_acumuladas INT DEFAULT 0,
  franja_id UUID REFERENCES public.franjas_cabina(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cohorte_id, postulante_id)
);

CREATE TABLE IF NOT EXISTS public.evaluacion_diagnostico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  postulante_id UUID REFERENCES public.postulantes(id) ON DELETE CASCADE,
  asistencia_cabina TEXT NOT NULL CHECK (
    asistencia_cabina IN ('MINIMA_AUTONOMO', 'MEDIA', 'ALTA')
  ),
  dictamen TEXT NOT NULL CHECK (
    dictamen IN ('APTO_DIRECTO', 'APTO_OBSERVACION', 'NO_APTO', 'CONDICIONAL')
  ),
  eje_lateralidad TEXT,
  eje_tacto_mandos TEXT,
  eje_mastil TEXT,
  eje_control_receptividad TEXT,
  tiempo_vuelta_seg INT,
  colisiones INT DEFAULT 0,
  score_puntos NUMERIC(5,2),
  archivo_fuente TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_franjas_cabina_cohorte
  ON public.franjas_cabina(cohorte_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_cohorte_estado
  ON public.cohorte_inscripciones(cohorte_id, estado);
CREATE INDEX IF NOT EXISTS idx_inscripciones_franja_estado
  ON public.cohorte_inscripciones(franja_id, estado);
CREATE INDEX IF NOT EXISTS idx_evaluacion_postulante
  ON public.evaluacion_diagnostico(postulante_id);

-- =============================================================================
-- 2. INTEGRIDAD OPERATIVA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validar_cupo_franja()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_revisar BOOLEAN;
  v_cupo INT;
  v_total INT;
BEGIN
  v_revisar := NEW.estado = 'CONFIRMADO' AND NEW.franja_id IS NOT NULL;

  IF v_revisar AND TG_OP = 'UPDATE' THEN
    v_revisar := NEW.franja_id IS DISTINCT FROM OLD.franja_id
      OR NEW.estado IS DISTINCT FROM OLD.estado;
  END IF;

  IF v_revisar THEN
    -- Serializa asignaciones concurrentes sobre la misma franja.
    SELECT cupo_maximo INTO v_cupo
    FROM public.franjas_cabina
    WHERE id = NEW.franja_id
    FOR UPDATE;

    SELECT COUNT(*) INTO v_total
    FROM public.cohorte_inscripciones
    WHERE franja_id = NEW.franja_id
      AND estado = 'CONFIRMADO'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_total >= COALESCE(v_cupo, 3) THEN
      RAISE EXCEPTION 'FRANJA_COMPLETA';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cupo_franja ON public.cohorte_inscripciones;
CREATE TRIGGER trg_validar_cupo_franja
  BEFORE INSERT OR UPDATE OF franja_id, estado ON public.cohorte_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_cupo_franja();

CREATE OR REPLACE FUNCTION public.validar_tope_titulares()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_revisar BOOLEAN;
  v_max INT;
  v_total INT;
BEGIN
  v_revisar := NEW.estado = 'CONFIRMADO' AND NEW.cohorte_id IS NOT NULL;

  IF v_revisar AND TG_OP = 'UPDATE' THEN
    v_revisar := NEW.cohorte_id IS DISTINCT FROM OLD.cohorte_id
      OR NEW.estado IS DISTINCT FROM OLD.estado;
  END IF;

  IF v_revisar THEN
    -- Serializa confirmaciones concurrentes dentro de la misma cohorte.
    SELECT max_titulares INTO v_max
    FROM public.cohortes
    WHERE id = NEW.cohorte_id
    FOR UPDATE;

    SELECT COUNT(*) INTO v_total
    FROM public.cohorte_inscripciones
    WHERE cohorte_id = NEW.cohorte_id
      AND estado = 'CONFIRMADO'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_total >= COALESCE(v_max, 20) THEN
      RAISE EXCEPTION 'COHORTE_COMPLETA';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_tope_titulares ON public.cohorte_inscripciones;
CREATE TRIGGER trg_validar_tope_titulares
  BEFORE INSERT OR UPDATE OF cohorte_id, estado ON public.cohorte_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_tope_titulares();

-- =============================================================================
-- 3. ROW LEVEL SECURITY Y PRIVILEGIOS
-- =============================================================================

ALTER TABLE public.postulantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franjas_cabina ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohorte_inscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluacion_diagnostico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS postulantes_all ON public.postulantes;
CREATE POLICY postulantes_all ON public.postulantes
  FOR ALL TO authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cohortes_all ON public.cohortes;
CREATE POLICY cohortes_all ON public.cohortes
  FOR ALL TO authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS franjas_cabina_all ON public.franjas_cabina;
CREATE POLICY franjas_cabina_all ON public.franjas_cabina
  FOR ALL TO authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cohorte_inscripciones_all ON public.cohorte_inscripciones;
CREATE POLICY cohorte_inscripciones_all ON public.cohorte_inscripciones
  FOR ALL TO authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS evaluacion_diagnostico_all ON public.evaluacion_diagnostico;
CREATE POLICY evaluacion_diagnostico_all ON public.evaluacion_diagnostico
  FOR ALL TO authenticated, service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.postulantes TO authenticated, service_role;
GRANT ALL ON public.cohortes TO authenticated, service_role;
GRANT ALL ON public.franjas_cabina TO authenticated, service_role;
GRANT ALL ON public.cohorte_inscripciones TO authenticated, service_role;
GRANT ALL ON public.evaluacion_diagnostico TO authenticated, service_role;
