-- =============================================================================
-- CENTRO MUNICIPAL DE ENTRENAMIENTO EN SIMULADORES · VENADO TUERTO
-- Migración 0004: Módulo Admisión, Gestión de Cohortes, Evaluación y Roles RBAC
--
-- Idempotente: seguro para re-ejecución en Supabase Dashboard o CLI.
-- =============================================================================

-- =============================================================================
-- 1. EXTENSIONES
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 2. TABLA DE PERFILES Y ROLES RBAC (Vinculada a auth.users)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.perfiles_usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('superadmin', 'administracion', 'instructor', 'mesa_instructores')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comentarios explicativos
COMMENT ON TABLE public.perfiles_usuarios IS 'Perfiles de usuario y asignación de roles RBAC vinculados a auth.users.';
COMMENT ON COLUMN public.perfiles_usuarios.rol IS 'Rol asignado: superadmin, administracion, instructor o mesa_instructores.';

-- Función disparadora para registrar automáticamente perfiles ante nuevos usuarios en auth.users
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
  -- Extraer rol de raw_user_meta_data si viene provisto; fallback a 'instructor'
  v_rol := COALESCE(new.raw_user_meta_data->>'rol', 'instructor');
  IF v_rol NOT IN ('superadmin', 'administracion', 'instructor', 'mesa_instructores') THEN
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

DROP TRIGGER IF EXISTS trg_usuario_creado ON auth.users;
CREATE TRIGGER trg_usuario_creado
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_nuevo_usuario();

-- =============================================================================
-- 3. CONFIGURACIÓN OPERATIVA DEL CENTRO Y FERIADOS MUNICIPALES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.config_centro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turnos_manana TIME[] NOT NULL DEFAULT ARRAY['09:00:00'::TIME, '10:00:00'::TIME, '11:00:00'::TIME],
  turnos_tarde TIME[] NOT NULL DEFAULT ARRAY['16:00:00'::TIME, '17:00:00'::TIME, '18:00:00'::TIME],
  duracion_turno_minutos INT NOT NULL DEFAULT 60 CHECK (duracion_turno_minutos > 0),
  capacidad_simultanea INT NOT NULL DEFAULT 3 CHECK (capacidad_simultanea > 0),
  bloqueo_viernes_manana BOOLEAN NOT NULL DEFAULT TRUE,
  dias_simulador_requeridos INT NOT NULL DEFAULT 6 CHECK (dias_simulador_requeridos > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inserción de configuración inicial por defecto si la tabla no posee registros
INSERT INTO public.config_centro (
  turnos_manana,
  turnos_tarde,
  duracion_turno_minutos,
  capacidad_simultanea,
  bloqueo_viernes_manana,
  dias_simulador_requeridos
)
SELECT 
  ARRAY['09:00:00'::TIME, '10:00:00'::TIME, '11:00:00'::TIME],
  ARRAY['16:00:00'::TIME, '17:00:00'::TIME, '18:00:00'::TIME],
  60,
  3,
  TRUE,
  6
WHERE NOT EXISTS (SELECT 1 FROM public.config_centro);

CREATE TABLE IF NOT EXISTS public.feriados_municipales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE UNIQUE NOT NULL,
  descripcion TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.feriados_municipales IS 'Feriados y días no laborables municipales que inhabilitan la asignación de turnos.';

-- =============================================================================
-- 4. NÚCLEO DE ALUMNOS (LEGAJO ÚNICO 360°)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.alumnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dni TEXT UNIQUE NOT NULL,
  nombre_completo TEXT NOT NULL,
  telefono TEXT,
  genero TEXT NOT NULL CHECK (genero IN ('M', 'F')),
  estado_general TEXT NOT NULL DEFAULT 'postulante' CHECK (estado_general IN (
    'postulante',
    'en_diagnostico',
    'diagnostico_aprobado',
    'diagnostico_desaprobado',
    'en_teoria',
    'en_simulador',
    'en_practica_real',
    'egresado_certificado',
    'ausente_baja'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.alumnos IS 'Legajo central de postulantes y alumnos del Centro de Simuladores.';
CREATE INDEX IF NOT EXISTS idx_alumnos_dni ON public.alumnos(dni);
CREATE INDEX IF NOT EXISTS idx_alumnos_estado ON public.alumnos(estado_general);

-- =============================================================================
-- 5. COHORTES Y TURNOS DE DIAGNÓSTICO (FASE 0)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cohortes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  fecha_inicio_diagnostico DATE NOT NULL,
  fecha_teoria DATE,
  fecha_inicio_simulador DATE,
  fecha_fin_estimada DATE,
  fase_actual TEXT NOT NULL DEFAULT 'diagnostico' CHECK (fase_actual IN (
    'diagnostico',
    'buffer_revision',
    'teoria',
    'simulador',
    'practica_real',
    'finalizada'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.turnos_diagnostico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohorte_id UUID NOT NULL REFERENCES public.cohortes(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  capacidad_maxima INT NOT NULL DEFAULT 3 CHECK (capacidad_maxima > 0),
  bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_bloqueo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rango_horario_diagnostico CHECK (hora_inicio < hora_fin)
);

CREATE INDEX IF NOT EXISTS idx_turnos_diagnostico_cohorte_fecha ON public.turnos_diagnostico(cohorte_id, fecha);

CREATE TABLE IF NOT EXISTS public.postulantes_diagnostico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  turno_id UUID REFERENCES public.turnos_diagnostico(id) ON DELETE SET NULL,
  asistencia TEXT NOT NULL DEFAULT 'pendiente' CHECK (asistencia IN ('pendiente', 'presente', 'ausente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_alumno_turno UNIQUE (alumno_id, turno_id)
);

CREATE INDEX IF NOT EXISTS idx_postulantes_diagnostico_turno ON public.postulantes_diagnostico(turno_id);

-- Función y Trigger para validar atómicamente el cupo máximo por turno
CREATE OR REPLACE FUNCTION public.validar_cupo_diagnostico()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacidad_maxima INT;
  v_postulantes_actuales INT;
  v_bloqueado BOOLEAN;
BEGIN
  -- Si el turno_id es NULL (postulante en espera), no se valida cupo
  IF NEW.turno_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener estado y capacidad configurada del turno
  SELECT capacidad_maxima, bloqueado
    INTO v_capacidad_maxima, v_bloqueado
    FROM public.turnos_diagnostico
   WHERE id = NEW.turno_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El turno de diagnóstico especificado no existe (ID: %)', NEW.turno_id;
  END IF;

  IF v_bloqueado THEN
    RAISE EXCEPTION 'No se pueden asignar postulantes a un turno bloqueado (ID: %)', NEW.turno_id;
  END IF;

  -- Contar postulantes asignados a este turno (excluyendo la fila actual en caso de UPDATE)
  SELECT COUNT(*)
    INTO v_postulantes_actuales
    FROM public.postulantes_diagnostico
   WHERE turno_id = NEW.turno_id
     AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_postulantes_actuales >= v_capacidad_maxima THEN
    RAISE EXCEPTION 'Capacidad máxima de % postulantes superada para el turno %',
      v_capacidad_maxima, NEW.turno_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cupo_diagnostico ON public.postulantes_diagnostico;
CREATE TRIGGER trg_validar_cupo_diagnostico
  BEFORE INSERT OR UPDATE ON public.postulantes_diagnostico
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_cupo_diagnostico();

-- =============================================================================
-- 6. RÚBRICA DE CABINA (EVALUACIÓN DE DIAGNÓSTICO)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.evaluaciones_diagnostico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  cohorte_id UUID REFERENCES public.cohortes(id) ON DELETE SET NULL,
  instructor_evaluador TEXT NOT NULL,
  fecha_evaluacion DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Criterios de evaluación base (0, 10 o 20 puntos)
  criterio_lateralidad INT NOT NULL CHECK (criterio_lateralidad IN (0, 10, 20)),
  criterio_sensibilidad_mandos INT NOT NULL CHECK (criterio_sensibilidad_mandos IN (0, 10, 20)),
  criterio_procedimiento_mastil INT NOT NULL CHECK (criterio_procedimiento_mastil IN (0, 10, 20)),
  criterio_autonomia INT NOT NULL CHECK (criterio_autonomia IN (0, 10, 20)),
  criterio_control_emocional INT NOT NULL CHECK (criterio_control_emocional IN (0, 10, 20)),

  -- Segunda oportunidad de evaluación
  evolucion_segundo_intento TEXT CHECK (evolucion_segundo_intento IN (
    'mejora_notable', 'mantiene_nivel', 'bloqueo_persiste', 'no_requirio'
  )),
  bonus_segundo_intento INT NOT NULL DEFAULT 0 CHECK (bonus_segundo_intento IN (0, 10)),

  -- Score total calculado automáticamente por Postgres
  score_total INT GENERATED ALWAYS AS (
    criterio_lateralidad +
    criterio_sensibilidad_mandos +
    criterio_procedimiento_mastil +
    criterio_autonomia +
    criterio_control_emocional +
    bonus_segundo_intento
  ) STORED,

  dictamen_preliminar TEXT NOT NULL CHECK (dictamen_preliminar IN ('apto', 'condicional', 'no_apto')),
  hard_fail_disparado BOOLEAN NOT NULL DEFAULT FALSE,

  -- Mesa Técnica de Instructores
  dictamen_definitivo TEXT CHECK (dictamen_definitivo IN ('apto_confirmado', 'no_apto_ratificado')),
  resolucion_mesa_texto TEXT,
  firmado_mesa BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- REGLA DE NEGOCIO ESTRICTA: Si hard_fail_disparado = TRUE, dictamen_preliminar DEBE ser 'no_apto'
  CONSTRAINT chk_hard_fail CHECK (
    (hard_fail_disparado = FALSE) OR
    (hard_fail_disparado = TRUE AND dictamen_preliminar = 'no_apto')
  )
);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_alumno ON public.evaluaciones_diagnostico(alumno_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_cohorte ON public.evaluaciones_diagnostico(cohorte_id);

-- =============================================================================
-- 7. CAPACITACIÓN FORMAL (TERNAS Y 6 SESIONES DE SIMULADOR)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ternas_capacitacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohorte_id UUID NOT NULL REFERENCES public.cohortes(id) ON DELETE CASCADE,
  nombre_terna TEXT NOT NULL,
  hora_fija TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.terna_miembros (
  terna_id UUID NOT NULL REFERENCES public.ternas_capacitacion(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (terna_id, alumno_id)
);

CREATE TABLE IF NOT EXISTS public.sesiones_simulador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terna_id UUID NOT NULL REFERENCES public.ternas_capacitacion(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  numero_sesion INT NOT NULL CHECK (numero_sesion BETWEEN 1 AND 6),
  fecha_programada DATE NOT NULL,
  asistencia TEXT NOT NULL DEFAULT 'pendiente' CHECK (asistencia IN ('pendiente', 'presente', 'ausente')),
  apptitan_session_id UUID,
  score_titan INT,
  cumplida BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un alumno solo puede tener una sesión N y una sesión por fecha
  CONSTRAINT uq_alumno_numero_sesion UNIQUE (alumno_id, numero_sesion),
  CONSTRAINT uq_alumno_fecha_programada UNIQUE (alumno_id, fecha_programada)
);

CREATE INDEX IF NOT EXISTS idx_sesiones_simulador_terna ON public.sesiones_simulador(terna_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_simulador_fecha ON public.sesiones_simulador(fecha_programada);

-- =============================================================================
-- 8. PRÁCTICA EN MÁQUINA REAL (PATIO) Y BUCKET STORAGE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.practica_real (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  instructor_patio TEXT NOT NULL,
  fecha_practica DATE NOT NULL DEFAULT CURRENT_DATE,
  resultado TEXT NOT NULL CHECK (resultado IN ('aprobado', 'desaprobado')),
  storage_pdf_path TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practica_real_alumno ON public.practica_real(alumno_id);

-- Creación/Inicialización idempotente del bucket privado en storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expedientes-practica-real',
  'expedientes-practica-real',
  FALSE,
  10485760, -- 10 MB límite por archivo
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['application/pdf']::text[];

-- =============================================================================
-- 9. SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE public.perfiles_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_centro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriados_municipales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_diagnostico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postulantes_diagnostico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluaciones_diagnostico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ternas_capacitacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terna_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_simulador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practica_real ENABLE ROW LEVEL SECURITY;

-- Políticas para personal autenticado con sesión válida
DO $$
BEGIN
  -- perfiles_usuarios
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'perfiles_usuarios' AND policyname = 'perfiles_select_authenticated') THEN
    CREATE POLICY perfiles_select_authenticated ON public.perfiles_usuarios FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'perfiles_usuarios' AND policyname = 'perfiles_update_self_or_admin') THEN
    CREATE POLICY perfiles_update_self_or_admin ON public.perfiles_usuarios FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;

  -- config_centro
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'config_centro' AND policyname = 'config_select_authenticated') THEN
    CREATE POLICY config_select_authenticated ON public.config_centro FOR SELECT TO authenticated USING (true);
  END IF;

  -- feriados_municipales
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feriados_municipales' AND policyname = 'feriados_select_authenticated') THEN
    CREATE POLICY feriados_select_authenticated ON public.feriados_municipales FOR SELECT TO authenticated USING (true);
  END IF;

  -- alumnos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alumnos' AND policyname = 'alumnos_crud_authenticated') THEN
    CREATE POLICY alumnos_crud_authenticated ON public.alumnos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- cohortes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cohortes' AND policyname = 'cohortes_crud_authenticated') THEN
    CREATE POLICY cohortes_crud_authenticated ON public.cohortes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- turnos_diagnostico
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'turnos_diagnostico' AND policyname = 'turnos_diag_crud_authenticated') THEN
    CREATE POLICY turnos_diag_crud_authenticated ON public.turnos_diagnostico FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- postulantes_diagnostico
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'postulantes_diagnostico' AND policyname = 'postulantes_diag_crud_authenticated') THEN
    CREATE POLICY postulantes_diag_crud_authenticated ON public.postulantes_diagnostico FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- evaluaciones_diagnostico
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluaciones_diagnostico' AND policyname = 'evaluaciones_crud_authenticated') THEN
    CREATE POLICY evaluaciones_crud_authenticated ON public.evaluaciones_diagnostico FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- ternas_capacitacion
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ternas_capacitacion' AND policyname = 'ternas_crud_authenticated') THEN
    CREATE POLICY ternas_crud_authenticated ON public.ternas_capacitacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- terna_miembros
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'terna_miembros' AND policyname = 'terna_miembros_crud_authenticated') THEN
    CREATE POLICY terna_miembros_crud_authenticated ON public.terna_miembros FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- sesiones_simulador
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sesiones_simulador' AND policyname = 'sesiones_crud_authenticated') THEN
    CREATE POLICY sesiones_crud_authenticated ON public.sesiones_simulador FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- practica_real
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practica_real' AND policyname = 'practica_real_crud_authenticated') THEN
    CREATE POLICY practica_real_crud_authenticated ON public.practica_real FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
