-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0008: Modelo Relacional de Duplas Pedagógicas y Ciclo de 16 Alumnos
--
-- Directiva ODD Sprint 1:
-- - Capacidad: 16 alumnos divididos en duplas fijas (2 alumnos por turno de 1h)
-- - Ventana operativa fija: 4 horas netas diarias (10:00-12:00 y 16:00-18:00)
-- - Franjas: M1 (10-11), M2 (11-12), T1 (16-17), T2 (17-18)
-- - Distribución:
--     * Grupo A (8 alumnos / 4 duplas): Lunes y Miércoles
--     * Grupo B (8 alumnos / 4 duplas): Martes y Jueves
--     * Viernes: Buffer operativo (mantenimiento, recuperatorios y diagnósticos)
-- - Ciclo pedagógico: 6 clases de 1 hora (30m piloto + 30m copiloto) = 3 semanas
--
-- Enfoque 100% aditivo y no destructivo: IF NOT EXISTS, DO $$ ... $$ para ENUMs.
-- =============================================================================

-- =============================================================================
-- 1. ENUMS OPERATIVOS (Idempotentes)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_cohorte_v2') THEN
    CREATE TYPE public.estado_cohorte_v2 AS ENUM (
      'PLANIFICADA',
      'DIAGNOSTICO',
      'EN_CURSO',
      'FINALIZADA',
      'CANCELADA'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grupo_cursado_enum') THEN
    CREATE TYPE public.grupo_cursado_enum AS ENUM (
      'GRUPO_A',
      'GRUPO_B'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'franja_cursado_enum') THEN
    CREATE TYPE public.franja_cursado_enum AS ENUM (
      'M1_10_11',
      'M2_11_12',
      'T1_16_17',
      'T2_17_18'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asistencia_sesion') THEN
    CREATE TYPE public.estado_asistencia_sesion AS ENUM (
      'PROGRAMADA',
      'PRESENTE',
      'AUSENTE_JUSTIFICADO',
      'AUSENTE_INJUSTIFICADO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_sesion_enum') THEN
    CREATE TYPE public.rol_sesion_enum AS ENUM (
      'PILOTO_INICIAL',
      'COPILOTO_INICIAL'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_egreso_enum') THEN
    CREATE TYPE public.estado_egreso_enum AS ENUM (
      'CERTIFICADO',
      'INCOMPLETO',
      'ABANDONO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'perfil_laboral_enum') THEN
    CREATE TYPE public.perfil_laboral_enum AS ENUM (
      'DESTACADO',
      'ESTANDAR',
      'CON_OBSERVACIONES',
      'NO_RECOMENDADO'
    );
  END IF;
END
$$;

-- =============================================================================
-- 2. ACTUALIZACIÓN SOBRE public.cohortes
-- =============================================================================

ALTER TABLE public.cohortes
  ADD COLUMN IF NOT EXISTS tipo_maquinaria TEXT NOT NULL DEFAULT 'AUTOELEVADOR',
  ADD COLUMN IF NOT EXISTS estado_v2 public.estado_cohorte_v2 NOT NULL DEFAULT 'PLANIFICADA',
  ADD COLUMN IF NOT EXISTS cupo_alumnos INT NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS duracion_semanas INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS total_sesiones_requeridas INT NOT NULL DEFAULT 6;

COMMENT ON COLUMN public.cohortes.tipo_maquinaria IS 'Tipo de maquinaria asignada a la cohorte (ej. AUTOELEVADOR, PALA_FRONTAL, RETROEXCAVADORA).';
COMMENT ON COLUMN public.cohortes.estado_v2 IS 'Ciclo de vida v2 de la cohorte: PLANIFICADA, DIAGNOSTICO, EN_CURSO, FINALIZADA o CANCELADA.';
COMMENT ON COLUMN public.cohortes.cupo_alumnos IS 'Cupo estándar operativo de alumnos (16 alumnos distribuidos en 8 duplas).';
COMMENT ON COLUMN public.cohortes.duracion_semanas IS 'Duración total del ciclo formativo en semanas calendario (3 semanas).';
COMMENT ON COLUMN public.cohortes.total_sesiones_requeridas IS 'Total de clases prácticas de simulador requeridas por alumno (6 sesiones de 1h).';

-- =============================================================================
-- 3. TABLA public.duplas_cabina (Asignación pedagógica de 2 alumnos por franja)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.duplas_cabina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohorte_id UUID NOT NULL REFERENCES public.cohortes(id) ON DELETE CASCADE,
  grupo public.grupo_cursado_enum NOT NULL,
  franja public.franja_cursado_enum NOT NULL,
  alumno_1_id UUID NOT NULL REFERENCES public.postulantes(id),
  alumno_2_id UUID NOT NULL REFERENCES public.postulantes(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_alumnos_distintos CHECK (alumno_1_id <> alumno_2_id),
  CONSTRAINT uq_dupla_cohorte_grupo_franja UNIQUE (cohorte_id, grupo, franja),
  CONSTRAINT uq_dupla_cohorte_alumno_1 UNIQUE (cohorte_id, alumno_1_id),
  CONSTRAINT uq_dupla_cohorte_alumno_2 UNIQUE (cohorte_id, alumno_2_id)
);

COMMENT ON TABLE public.duplas_cabina IS 'Duplas fijas pedagógicas asignadas a una franja horaria y grupo de cursado en una cohorte.';
COMMENT ON COLUMN public.duplas_cabina.grupo IS 'Grupo de cursado: GRUPO_A (Lunes y Miércoles) o GRUPO_B (Martes y Jueves).';
COMMENT ON COLUMN public.duplas_cabina.franja IS 'Franja horaria: M1_10_11 (10-11h), M2_11_12 (11-12h), T1_16_17 (16-17h), T2_17_18 (17-18h).';
COMMENT ON COLUMN public.duplas_cabina.alumno_1_id IS 'Primer alumno integrante de la dupla.';
COMMENT ON COLUMN public.duplas_cabina.alumno_2_id IS 'Segundo alumno integrante de la dupla.';

-- Índices para optimizar búsquedas operativas
CREATE INDEX IF NOT EXISTS idx_duplas_cohorte_grupo ON public.duplas_cabina(cohorte_id, grupo);
CREATE INDEX IF NOT EXISTS idx_duplas_alumno_1 ON public.duplas_cabina(alumno_1_id);
CREATE INDEX IF NOT EXISTS idx_duplas_alumno_2 ON public.duplas_cabina(alumno_2_id);

-- Función y trigger de guarda para asegurar que un alumno no esté en dos duplas cruzadas (alumno_1 vs alumno_2)
CREATE OR REPLACE FUNCTION public.fn_validar_alumno_dupla_cruzada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validar que alumno_1 no figure como alumno_2 en otra dupla de la misma cohorte
  IF EXISTS (
    SELECT 1 FROM public.duplas_cabina
    WHERE cohorte_id = NEW.cohorte_id
      AND id <> NEW.id
      AND alumno_2_id = NEW.alumno_1_id
  ) THEN
    RAISE EXCEPTION 'El alumno 1 (ID: %) ya está asignado como alumno 2 en otra dupla de esta cohorte.', NEW.alumno_1_id;
  END IF;

  -- Validar que alumno_2 no figure como alumno_1 en otra dupla de la misma cohorte
  IF EXISTS (
    SELECT 1 FROM public.duplas_cabina
    WHERE cohorte_id = NEW.cohorte_id
      AND id <> NEW.id
      AND alumno_1_id = NEW.alumno_2_id
  ) THEN
    RAISE EXCEPTION 'El alumno 2 (ID: %) ya está asignado como alumno 1 en otra dupla de esta cohorte.', NEW.alumno_2_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_alumno_dupla_cruzada ON public.duplas_cabina;
CREATE TRIGGER trg_validar_alumno_dupla_cruzada
  BEFORE INSERT OR UPDATE ON public.duplas_cabina
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_alumno_dupla_cruzada();

-- =============================================================================
-- 4. TABLA public.sesiones_practica (Tracking sesión a sesión, clases 1 a 6)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sesiones_practica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohorte_id UUID NOT NULL REFERENCES public.cohortes(id) ON DELETE CASCADE,
  dupla_id UUID NOT NULL REFERENCES public.duplas_cabina(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.postulantes(id),
  numero_sesion INT NOT NULL CHECK (numero_sesion BETWEEN 1 AND 6),
  fecha_programada DATE NOT NULL,
  fecha_real DATE,
  es_recuperatorio_viernes BOOLEAN NOT NULL DEFAULT FALSE,
  estado_asistencia public.estado_asistencia_sesion NOT NULL DEFAULT 'PROGRAMADA',
  rol_inicio public.rol_sesion_enum NOT NULL DEFAULT 'PILOTO_INICIAL',
  minutos_operacion INT NOT NULL DEFAULT 30 CHECK (minutos_operacion >= 0),
  minutos_observacion INT NOT NULL DEFAULT 30 CHECK (minutos_observacion >= 0),
  evaluacion_id UUID REFERENCES public.evaluacion_diagnostico(id),
  observaciones_instructor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sesion_cohorte_alumno_numero UNIQUE (cohorte_id, alumno_id, numero_sesion)
);

COMMENT ON TABLE public.sesiones_practica IS 'Seguimiento individual de cada una de las 6 sesiones prácticas de 1 hora por alumno.';
COMMENT ON COLUMN public.sesiones_practica.numero_sesion IS 'Número correlativo de clase (1 a 6) en el ciclo formativo de 3 semanas.';
COMMENT ON COLUMN public.sesiones_practica.fecha_programada IS 'Fecha planificada en el calendario institucional.';
COMMENT ON COLUMN public.sesiones_practica.fecha_real IS 'Fecha efectiva en que se completó la sesión (si fue reprogramada o recuperada).';
COMMENT ON COLUMN public.sesiones_practica.es_recuperatorio_viernes IS 'Indica si la sesión se llevó a cabo durante el buffer operativo de los viernes.';
COMMENT ON COLUMN public.sesiones_practica.rol_inicio IS 'Rol con el que inició la sesión: PILOTO_INICIAL (30 min piloto primero) o COPILOTO_INICIAL.';
COMMENT ON COLUMN public.sesiones_practica.minutos_operacion IS 'Minutos netos a los mandos del simulador (típicamente 30 minutos).';
COMMENT ON COLUMN public.sesiones_practica.minutos_observacion IS 'Minutos de observación activa y asistencia pedagógica de su compañero de dupla.';

CREATE INDEX IF NOT EXISTS idx_sesiones_cohorte_alumno ON public.sesiones_practica(cohorte_id, alumno_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_dupla_id ON public.sesiones_practica(dupla_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_fecha_programada ON public.sesiones_practica(fecha_programada);

-- =============================================================================
-- 5. TABLA public.evaluacion_final_egreso (Dictamen final y perfil sociolaboral)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.evaluacion_final_egreso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohorte_id UUID NOT NULL REFERENCES public.cohortes(id) ON DELETE CASCADE,
  postulante_id UUID NOT NULL REFERENCES public.postulantes(id),
  horas_practica_completadas NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (horas_practica_completadas >= 0.0),
  sesiones_asistidas INT NOT NULL DEFAULT 0 CHECK (sesiones_asistidas >= 0),
  estado_egreso public.estado_egreso_enum NOT NULL DEFAULT 'INCOMPLETO',
  perfil_laboral public.perfil_laboral_enum NOT NULL DEFAULT 'ESTANDAR',
  devolucion_empleo TEXT,
  aprobado_practica_terreno BOOLEAN DEFAULT NULL,
  fecha_evaluacion DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_egreso_cohorte_postulante UNIQUE (cohorte_id, postulante_id)
);

COMMENT ON TABLE public.evaluacion_final_egreso IS 'Evaluación final de egreso, acreditación de horas y reporte de perfil sociolaboral para inserción en empresas.';
COMMENT ON COLUMN public.evaluacion_final_egreso.horas_practica_completadas IS 'Horas totales acumuladas de práctica en simulador.';
COMMENT ON COLUMN public.evaluacion_final_egreso.sesiones_asistidas IS 'Cantidad de sesiones completadas efectivamente (máximo 6 requeridas).';
COMMENT ON COLUMN public.evaluacion_final_egreso.estado_egreso IS 'Estado de culminación: CERTIFICADO, INCOMPLETO o ABANDONO.';
COMMENT ON COLUMN public.evaluacion_final_egreso.perfil_laboral IS 'Dictamen sociolaboral: DESTACADO, ESTANDAR, CON_OBSERVACIONES o NO_RECOMENDADO.';
COMMENT ON COLUMN public.evaluacion_final_egreso.devolucion_empleo IS 'Informe cualitativo estructurado para presentación a empresas demandantes.';
COMMENT ON COLUMN public.evaluacion_final_egreso.aprobado_practica_terreno IS 'Evaluación complementaria opcional en máquina real fuera de cabina.';

CREATE INDEX IF NOT EXISTS idx_egreso_postulante ON public.evaluacion_final_egreso(postulante_id);
CREATE INDEX IF NOT EXISTS idx_egreso_cohorte ON public.evaluacion_final_egreso(cohorte_id);

-- =============================================================================
-- 6. SEGURIDAD Y ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE public.duplas_cabina ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_practica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluacion_final_egreso ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso para duplas_cabina
DROP POLICY IF EXISTS duplas_cabina_crud_authenticated ON public.duplas_cabina;
CREATE POLICY duplas_cabina_crud_authenticated ON public.duplas_cabina
  FOR ALL TO authenticated, service_role
  USING (true) WITH CHECK (true);

-- Políticas de acceso para sesiones_practica
DROP POLICY IF EXISTS sesiones_practica_crud_authenticated ON public.sesiones_practica;
CREATE POLICY sesiones_practica_crud_authenticated ON public.sesiones_practica
  FOR ALL TO authenticated, service_role
  USING (true) WITH CHECK (true);

-- Políticas de acceso para evaluacion_final_egreso
DROP POLICY IF EXISTS evaluacion_final_egreso_crud_authenticated ON public.evaluacion_final_egreso;
CREATE POLICY evaluacion_final_egreso_crud_authenticated ON public.evaluacion_final_egreso
  FOR ALL TO authenticated, service_role
  USING (true) WITH CHECK (true);

-- Concesión de privilegios a roles autorizados (anon queda bloqueado por defecto)
GRANT ALL ON public.duplas_cabina TO authenticated, service_role;
GRANT ALL ON public.sesiones_practica TO authenticated, service_role;
GRANT ALL ON public.evaluacion_final_egreso TO authenticated, service_role;
