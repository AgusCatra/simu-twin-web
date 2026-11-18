-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0011: Regla de Horas en Dupla, Práctica Real Tablet (0 Storage) y
-- Decisión Manual del Instructor (T0 / Terreno).
--
-- Idempotente y 100% aditiva. El backend actual también persiste metadata
-- estructurada compatible sobre columnas JSONB existentes para operar con $0
-- Storage desde el primer instante.
-- =============================================================================

ALTER TABLE public.practica_real
  ADD COLUMN IF NOT EXISTS asistencia_terreno TEXT CHECK (
    asistencia_terreno IS NULL OR asistencia_terreno IN ('PRESENTE', 'AUSENTE')
  ),
  ADD COLUMN IF NOT EXISTS horas_practica_terreno NUMERIC(4,1) DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS horas_extra_terreno NUMERIC(4,1) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS requiere_horas_extra BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS horas_extra_sugeridas NUMERIC(4,1) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS decision_instructor_terreno TEXT CHECK (
    decision_instructor_terreno IS NULL OR
    decision_instructor_terreno IN ('APROBADO_EMPRESAS', 'REQUIERE_MAS_HORAS', 'NO_APTO')
  );

ALTER TABLE public.cohorte_inscripciones
  ADD COLUMN IF NOT EXISTS decision_instructor_t0 TEXT CHECK (
    decision_instructor_t0 IS NULL OR
    decision_instructor_t0 IN ('APROBADO_A_CAPACITACION', 'PENDIENTE', 'RECHAZADO')
  ),
  ADD COLUMN IF NOT EXISTS horas_refuerzo_simulador NUMERIC(4,1) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS asistio_teoria BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.practica_real.decision_instructor_terreno IS
  'Veredicto manual del instructor de patio: APROBADO_EMPRESAS, REQUIERE_MAS_HORAS o NO_APTO.';
COMMENT ON COLUMN public.cohorte_inscripciones.decision_instructor_t0 IS
  'Decisión manual del instructor en diagnóstico T0 (El Instructor Manda).';
