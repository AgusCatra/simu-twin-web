-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0012: Discriminación de ejercicios intermedios del simulador
-- ('PRACTICA_INTERMEDIA') respecto de "Medium Load Operation" (T0 / FINAL T1).
--
-- Aditiva e idempotente.
-- =============================================================================

ALTER TABLE public.evaluacion_diagnostico
  ALTER COLUMN etapa TYPE VARCHAR(32);

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_evaluacion_etapa;

ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_evaluacion_etapa
  CHECK (
    etapa IN (
      'DIAG_INTENTO_1',
      'DIAG_INTENTO_2',
      'FINAL',
      'PRACTICA_INTERMEDIA'
    )
  );

COMMENT ON COLUMN public.evaluacion_diagnostico.etapa IS
  'Etapa del flujo: DIAG_INTENTO_1 (V1 T0), DIAG_INTENTO_2 (V2 T0), FINAL (Medium Load Operation T1) o PRACTICA_INTERMEDIA (otros ejercicios del simulador excluidos de deltas T0->T1 y percentiles).';
