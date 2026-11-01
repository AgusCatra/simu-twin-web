-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0006: Extensión de evaluacion_diagnostico para la Consola Viva de
-- Cabina (tablet). Agrega hard-fail, bonus de segundo intento, puntajes enteros
-- por eje, instructor y observaciones. Idempotente (ADD COLUMN IF NOT EXISTS).
-- No modifica dictamen, asistencia_cabina ni columnas preexistentes.
-- =============================================================================

ALTER TABLE public.evaluacion_diagnostico
  ADD COLUMN IF NOT EXISTS hard_fail BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_hard_fail TEXT,
  ADD COLUMN IF NOT EXISTS bonus_segundo_intento INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS puntaje_lateralidad INTEGER,
  ADD COLUMN IF NOT EXISTS puntaje_tacto_mandos INTEGER,
  ADD COLUMN IF NOT EXISTS puntaje_mastil INTEGER,
  ADD COLUMN IF NOT EXISTS puntaje_control_receptividad INTEGER,
  ADD COLUMN IF NOT EXISTS instructor_evaluador TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_rapidas TEXT[],
  ADD COLUMN IF NOT EXISTS observaciones_detalle TEXT;

-- Bonus de segundo intento: solo 0 (no mejoró) o 10 (mejoró).
ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_bonus_segundo_intento;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_bonus_segundo_intento
  CHECK (bonus_segundo_intento IN (0, 10));

-- Puntajes por eje: NULL (sin evaluar) o escala discreta 0/10/20.
ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_puntaje_lateralidad;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_puntaje_lateralidad
  CHECK (puntaje_lateralidad IS NULL OR puntaje_lateralidad IN (0, 10, 20));

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_puntaje_tacto_mandos;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_puntaje_tacto_mandos
  CHECK (puntaje_tacto_mandos IS NULL OR puntaje_tacto_mandos IN (0, 10, 20));

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_puntaje_mastil;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_puntaje_mastil
  CHECK (puntaje_mastil IS NULL OR puntaje_mastil IN (0, 10, 20));

ALTER TABLE public.evaluacion_diagnostico
  DROP CONSTRAINT IF EXISTS chk_puntaje_control_receptividad;
ALTER TABLE public.evaluacion_diagnostico
  ADD CONSTRAINT chk_puntaje_control_receptividad
  CHECK (puntaje_control_receptividad IS NULL OR puntaje_control_receptividad IN (0, 10, 20));
