-- ============================================================
-- HUB SIMULADORES · Migración 0003
-- Módulo LOGÍSTICA TUP (H4): columnas de traslado sobre
-- `public.visitas_educativas`.
--
-- Idempotente: usa ADD COLUMN IF NOT EXISTS y bloques DO con
-- manejo de excepciones para las restricciones, de modo que se
-- pueda re-ejecutar sin errores si ya fue aplicada parcial o
-- totalmente.
--
-- Ejecutar en Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1) Horarios de ida / vuelta (TIME) -----------------------------
alter table public.visitas_educativas
  add column if not exists tup_horario_ida_desde     time;

alter table public.visitas_educativas
  add column if not exists tup_horario_ida_hasta     time;

alter table public.visitas_educativas
  add column if not exists tup_horario_vuelta_desde  time;

alter table public.visitas_educativas
  add column if not exists tup_horario_vuelta_hasta  time;

-- 2) Chofer asignado al traslado ---------------------------------
alter table public.visitas_educativas
  add column if not exists tup_chofer_nombre text;

-- 3) Estado del traslado (dominio cerrado, ver src/types/tup.ts) -
--    Default 'pendiente' para que las visitas existentes con
--    requiere_tup = true aparezcan en el panel sin backfill manual.
alter table public.visitas_educativas
  add column if not exists tup_estado_traslado text
    not null
    default 'pendiente';

-- 4) CHECK sobre tup_estado_traslado ------------------------------
--    ADD CONSTRAINT no soporta IF NOT EXISTS, por eso el DO block:
--    si la constraint ya existe (u otro error), se ignora.
do $$
begin
  alter table public.visitas_educativas
    add constraint chk_tup_estado_traslado
    check (
      tup_estado_traslado in (
        'pendiente',
        'en_camino',
        'en_destino',
        'completado',
        'cancelado'
      )
    );
exception
  when duplicate_object then
    null; -- ya existe, nada que hacer
  when others then
    -- Se ignora cualquier otro error para mantener la migración
    -- re-ejecutable (p. ej. constraint con el mismo nombre pero
    -- definición distinta en un entorno ya migrado a mano).
    null;
end $$;

-- 5) CHECK de coherencia de rangos horarios -----------------------
--    Solo se valida si ambos extremos están presentes; permite
--    cargas parciales desde el formulario.
do $$
begin
  alter table public.visitas_educativas
    add constraint chk_tup_horario_ida_rango
    check (
      tup_horario_ida_desde is null
      or tup_horario_ida_hasta is null
      or tup_horario_ida_desde <= tup_horario_ida_hasta
    );
exception
  when duplicate_object then null;
  when others then null;
end $$;

do $$
begin
  alter table public.visitas_educativas
    add constraint chk_tup_horario_vuelta_rango
    check (
      tup_horario_vuelta_desde is null
      or tup_horario_vuelta_hasta is null
      or tup_horario_vuelta_desde <= tup_horario_vuelta_hasta
    );
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- 6) Índice para el listado del panel /admin/tup -------------------
--    La página filtra por requiere_tup y ordena por fecha_visita y
--    tup_horario_ida_desde; un índice parcial acelera la consulta
--    sin penalizar las visitas que no requieren TUP.
create index if not exists idx_visitas_tup_panel
  on public.visitas_educativas (fecha_visita, tup_horario_ida_desde)
  where requiere_tup = true;

-- ============================================================
-- VERIFICACIÓN (ejecutar a mano en SQL Editor si se desea):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'visitas_educativas'
--      and column_name like 'tup\_%'
--    order by column_name;
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.visitas_educativas'::regclass
--      and conname like 'chk\_tup\_%';
-- ============================================================
