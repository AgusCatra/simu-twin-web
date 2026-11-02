-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0008: Evaluación multi-intento (V1 / V2 / Prueba Final) sobre la
-- tabla activa public.evaluacion_diagnostico (singular, 0005 + 0006).
--
-- Aditiva e idempotente: no modifica dictamen, asistencia_cabina, puntaje_*
-- ni columnas legacy eje_*. Habilita el flujo de doble pasada del pipeline
-- TITAN (scripts/parse_simuladores.py + scripts/sync_supabase.py):
--   etapa                 : DIAG_INTENTO_1 | DIAG_INTENTO_2 | FINAL
--   es_mejor_diagnostico  : marca el Mejor Diagnóstico entre V1 y V2
--   colisiones_descartadas: auditoría de la sanitización (bug -2 / suelo fantasma)
--   delta_*               : V2-V1 (INTENTO_2) y FINAL-MejorDiagnóstico (FINAL)
-- =============================================================================

-- =============================================================================
-- 1. NUEVAS COLUMNAS
-- =============================================================================

ALTER TABLE public.evaluacion_diagnostico
  ADD COLUMN IF NOT EXISTS etapa VARCHAR(20) DEFAULT 'DIAG_INTENTO_1',
  ADD COLUMN IF NOT EXISTS es_mejor_diagnostico BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS colisiones_descartadas INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_tiempo_seg INT NULL,
  ADD COLUMN IF NOT EXISTS delta_colisiones INT NULL,
  ADD COLUMN IF NOT EXISTS delta_score NUMERIC(5,2) NULL,
  ADD COLUMN IF NOT EXISTS delta_serrucho NUMERIC(6,3) NULL;

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_evaluacion_etapa;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_evaluacion_etapa
  CHECK (etapa IN ('DIAG_INTENTO_1', 'DIAG_INTENTO_2', 'FINAL'));

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_colisiones_descartadas;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_colisiones_descartadas
  CHECK (colisiones_descartadas >= 0);

COMMENT ON COLUMN public.evaluacion_diagnostico.etapa IS
  'Etapa del flujo: DIAG_INTENTO_1 (V1), DIAG_INTENTO_2 (V2) o FINAL (prueba final).';
COMMENT ON COLUMN public.evaluacion_diagnostico.es_mejor_diagnostico IS
  'TRUE en el mejor diagnóstico entre V1 y V2 (menor colisiones, luego menor serrucho, luego menor duración).';
COMMENT ON COLUMN public.evaluacion_diagnostico.colisiones_descartadas IS
  'Colisiones fantasma (suelo/malla, bug -2) descartadas por la sanitización del parser TITAN.';
COMMENT ON COLUMN public.evaluacion_diagnostico.delta_tiempo_seg IS
  'Duración de esta pasada menos la de su referencia (V1 para INTENTO_2; mejor diagnóstico para FINAL).';
COMMENT ON COLUMN public.evaluacion_diagnostico.delta_colisiones IS
  'Colisiones reales de esta pasada menos las de su referencia.';
COMMENT ON COLUMN public.evaluacion_diagnostico.delta_score IS
  'Score del simulador de esta pasada menos el de su referencia.';
COMMENT ON COLUMN public.evaluacion_diagnostico.delta_serrucho IS
  'Índice de serrucho de volante de esta pasada menos el de su referencia.';

-- =============================================================================
-- 2. BACKFILL DE FILAS EXISTENTES (una sola evaluación TITAN por postulante)
-- =============================================================================

-- Las filas ya cargadas por el sync previo corresponden a la primera pasada.
UPDATE public.evaluacion_diagnostico
   SET etapa = 'DIAG_INTENTO_1'
 WHERE archivo_fuente IS NOT NULL;

-- Con datos legacy solo existe V1: el mejor diagnóstico es la fila más
-- reciente del pipeline por postulante. No toca filas escritas por la consola
-- táctil (archivo_fuente = 'CABINA_TABLET' queda excluido del índice parcial).
WITH mejor AS (
  SELECT DISTINCT ON (postulante_id) id
    FROM public.evaluacion_diagnostico
   WHERE archivo_fuente IS NOT NULL
     AND archivo_fuente <> 'CABINA_TABLET'
   ORDER BY postulante_id, created_at DESC NULLS LAST, id DESC
)
UPDATE public.evaluacion_diagnostico e
   SET es_mejor_diagnostico = TRUE
  FROM mejor m
 WHERE e.id = m.id
   AND e.es_mejor_diagnostico IS DISTINCT FROM TRUE;

-- =============================================================================
-- 3. INTEGRIDAD: CLAVE NATURAL DE IDEMPOTENCIA DEL SYNC
-- =============================================================================

-- Deduplicación defensiva previa: la consola táctil y syncs antiguos podían
-- dejar varias filas por (postulante_id, archivo_fuente); sin este paso el
-- CREATE UNIQUE INDEX falla con 23505. Se conserva la fila más reciente.
DELETE FROM public.evaluacion_diagnostico e
 USING public.evaluacion_diagnostico o
 WHERE e.postulante_id = o.postulante_id
   AND e.archivo_fuente IS NOT NULL
   AND e.archivo_fuente = o.archivo_fuente
   AND (COALESCE(e.created_at, '-infinity'::timestamptz), e.id)
     < (COALESCE(o.created_at, '-infinity'::timestamptz), o.id);

-- Clave natural de idempotencia del pipeline: un postulante puede tener un
-- registro por archivo fuente procesado (V1, V2 y FINAL). Las filas sin
-- archivo_fuente quedan fuera del índice (NULL no colisiona en UNIQUE).
CREATE UNIQUE INDEX IF NOT EXISTS uq_postulante_archivo
  ON public.evaluacion_diagnostico (postulante_id, archivo_fuente);

-- Un único "mejor diagnóstico" vigente por postulante entre las filas TITAN.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mejor_diagnostico_por_postulante
  ON public.evaluacion_diagnostico (postulante_id)
  WHERE es_mejor_diagnostico
    AND archivo_fuente IS NOT NULL
    AND archivo_fuente <> 'CABINA_TABLET';

-- =============================================================================
-- 4. RLS
-- =============================================================================
-- La tabla ya tiene RLS habilitada y políticas FOR ALL TO authenticated /
-- service_role desde 0005; las columnas nuevas quedan cubiertas sin cambios.
ALTER TABLE public.evaluacion_diagnostico ENABLE ROW LEVEL SECURITY;
