-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0007: Cupo dinámico de titulares.
-- El tope de CONFIRMADOS por cohorte pasa a leerse SIEMPRE de
-- public.cohortes.max_titulares (configurable desde /gestion/cohortes).
-- Se elimina el fallback hardcodeado COALESCE(v_max, 20) de la función del
-- trigger trg_validar_tope_titulares y el DEFAULT 20 de la columna.
-- Idempotente: segura para re-ejecución en Supabase Dashboard o CLI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La columna ya no arrastra el 20 fijo: DEFAULT 22 (cupo operativo estándar
--    de las cohortes de empleo) y NOT NULL para que ninguna cohorte quede sin
--    tope resoluble. Las filas legadas con NULL (si las hubiera) se fijan a 22.
-- -----------------------------------------------------------------------------
UPDATE public.cohortes SET max_titulares = 22 WHERE max_titulares IS NULL;

ALTER TABLE public.cohortes
  ALTER COLUMN max_titulares SET DEFAULT 22,
  ALTER COLUMN max_titulares SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 1.bis · Columnas de proyección del calendario dinámico (motor
--    src/lib/calculo-cohorte.ts). Aditivo no destructivo sobre la tabla legada.
-- -----------------------------------------------------------------------------
ALTER TABLE public.cohortes ADD COLUMN IF NOT EXISTS fecha_fin_sim DATE;
ALTER TABLE public.cohortes ADD COLUMN IF NOT EXISTS fecha_pase_planta DATE;

-- -----------------------------------------------------------------------------
-- 2. Nueva función del trigger: trg_validar_tope_titulares_fn().
--    - Resuelve max_titulares desde public.cohortes con FOR UPDATE (serializa
--      confirmaciones concurrentes dentro de la misma cohorte).
--    - Sin fila de cohorte o sin max_titulares => RAISE EXCEPTION (nunca un
--      número fijo): no existe ningún 20 hardcodeado en la base.
--    - Si los inscriptos CONFIRMADO alcanzaron el tope => 'COHORTE_COMPLETA'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_validar_tope_titulares_fn()
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
    SELECT max_titulares INTO v_max
    FROM public.cohortes
    WHERE id = NEW.cohorte_id
    FOR UPDATE;

    IF NOT FOUND OR v_max IS NULL THEN
      RAISE EXCEPTION 'COHORTE_SIN_CUPO_CONFIGURADO';
    END IF;

    SELECT COUNT(*) INTO v_total
    FROM public.cohorte_inscripciones
    WHERE cohorte_id = NEW.cohorte_id
      AND estado = 'CONFIRMADO'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_total >= v_max THEN
      RAISE EXCEPTION 'COHORTE_COMPLETA';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Reconexión del trigger a la nueva función y limpieza de la anterior.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_validar_tope_titulares ON public.cohorte_inscripciones;
CREATE TRIGGER trg_validar_tope_titulares
  BEFORE INSERT OR UPDATE OF cohorte_id, estado ON public.cohorte_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validar_tope_titulares_fn();

DROP FUNCTION IF EXISTS public.validar_tope_titulares();
