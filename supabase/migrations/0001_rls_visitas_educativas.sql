-- ============================================================
-- HUB SIMULADORES · Migración 0001
-- Row Level Security para el módulo de Visitas Educativas (H4)
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Habilitar RLS ------------------------------------------------
alter table public.visitas_educativas enable row level security;
alter table public.visita_asistentes   enable row level security;

-- Catálogos de solo lectura para el formulario público:
alter table public.escuelas           enable row level security;
alter table public.fechas_habilitadas enable row level security;

-- SELECT público sobre catálogos (los necesita el formulario público
-- sin sesión). No se crea ninguna política de escritura => anon no
-- puede modificarlos. La administración de estas tablas queda fuera
-- de este bloque (pendiente de fase de roles).
create policy "escuelas_select_publico"
  on public.escuelas for select
  to anon, authenticated
  using (true);

create policy "fechas_habilitadas_select_publico"
  on public.fechas_habilitadas for select
  to anon, authenticated
  using (habilitada = true);

-- 2) visita_asistentes: nóminas con datos personales (DNI, menores) --
-- Denegación total a anon: RLS sin políticas = acceso cero.
-- Solo el rol autenticado (panel admin) puede leer.
create policy "asistentes_select_authenticated"
  on public.visita_asistentes for select
  to authenticated
  using (true);

-- La inserción de la nómina la realiza la Server Action bajo la sesión anon
-- del visitante público (formulario /visitas), por lo que se habilita INSERT
-- para anon+authenticated. La Action fija las columnas permitidas con lista
-- blanca y normaliza fecha_nacimiento ("" -> null), así que nunca escribe
-- datos fuera del DTO.
create policy "asistentes_insert_publico"
  on public.visita_asistentes for insert
  to anon, authenticated
  with check (true);

-- 3) visitas_educativas -------------------------------------------
-- INSERT público: el formulario público crea solicitudes (la Server
-- Action fija check_*=false y los estados por diseño).
create policy "visitas_insert_publico"
  on public.visitas_educativas for insert
  to anon, authenticated
  with check (true);

-- SELECT/UPDATE/DELETE solo para authenticated.
-- Esto NIEGA por diseño el UPDATE de check_* al rol anon: el público
-- jamás puede marcar póliza/TUP/facturas/Drive ni alterar estados.
create policy "visitas_select_authenticated"
  on public.visitas_educativas for select
  to authenticated
  using (true);

create policy "visitas_update_authenticated"
  on public.visitas_educativas for update
  to authenticated
  using (true)
  with check (true);

create policy "visitas_delete_authenticated"
  on public.visitas_educativas for delete
  to authenticated
  using (true);

-- La denegación fina de UPDATE sobre campos operativos queda cubierta
-- en dos capas: (a) anon no tiene política de UPDATE, y (b) la Server
-- Action del lado servidor construye el INSERT con lista blanca y
-- fuerza check_poliza/check_tup/check_facturas/check_drive_sum = false.

-- 3b) OPCIONAL-RECOMENDADO · Defensa en profundidad (3ª capa):
-- trigger que fuerza los checks operativos a false en inserciones/
-- actualizaciones no autenticadas, por si alguien escribiera con la
-- anon key salteándose la aplicación.
create or replace function public.forzar_checks_no_autenticados()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    new.check_poliza    := false;
    new.check_tup       := false;
    new.check_facturas  := false;
    new.check_drive_sum := false;
  end if;
  return new;
end;
$$;

create trigger trg_forzar_checks_no_autenticados
  before insert or update on public.visitas_educativas
  for each row
  execute function public.forzar_checks_no_autenticados();

-- ============================================================
-- VERIFICACIÓN: listar las políticas creadas y sus roles.
--   select polname, polroles from pg_policy;
-- ============================================================
