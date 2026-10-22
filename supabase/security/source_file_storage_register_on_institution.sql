-- D1 (19/10): los recursos del gateway de Storage se registraban solo al INSERTAR el snapshot del workspace.
-- Una institucion recien creada no tiene snapshot, asi que su primera carga de planillas fallaba con
-- "El recurso de archivo no esta registrado". Ahora tambien se registran al crear la institucion (workspace
-- 'main', el que usa la app) y se completa el backfill de las instituciones existentes.
-- D2 (20/10): el gateway ademas exige que exista el snapshot del workspace (SOURCE_FILE_WORKSPACE_NOT_REGISTERED,
-- 403 "Workspace no autorizado"). Al crear la institucion se crea tambien su snapshot 'main' vacio; su trigger
-- del gateway registra los mismos recursos. Backfill para las instituciones sin snapshot.
-- Requiere supabase/security/source_file_storage_gateway.sql aplicado antes. Idempotente: se puede re-ejecutar.

create or replace function public.register_source_file_storage_resources_for_institution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_snapshots(institution_id, workspace_key)
  values (new.id, 'main')
  on conflict (institution_id, workspace_key) do nothing;
  insert into public.source_file_storage_resources(institution_id, workspace_key, dataset_key)
  select new.id, 'main', dataset
  from unnest(array['masterWorkbook','docentesWorkbook','alumnosWorkbook','horarios','planes','correlatividades','alumnos','docentes','docenteMateria']) dataset
  on conflict (institution_id, workspace_key, dataset_key) do nothing;
  return new;
end $$;
revoke all on function public.register_source_file_storage_resources_for_institution() from public, anon, authenticated;

drop trigger if exists source_file_storage_register_institution on public.institutions;
create trigger source_file_storage_register_institution after insert on public.institutions
for each row execute function public.register_source_file_storage_resources_for_institution();

insert into public.workspace_snapshots(institution_id, workspace_key)
select i.id, 'main'
from public.institutions i
on conflict (institution_id, workspace_key) do nothing;

insert into public.source_file_storage_resources(institution_id, workspace_key, dataset_key)
select i.id, 'main', dataset
from public.institutions i
cross join unnest(array['masterWorkbook','docentesWorkbook','alumnosWorkbook','horarios','planes','correlatividades','alumnos','docentes','docenteMateria']) dataset
on conflict (institution_id, workspace_key, dataset_key) do nothing;

-- Verificacion: cada institucion tiene su snapshot 'main' y sus 9 recursos. Las dos columnas tienen que dar 0.
select
  count(*) filter (where n <> 9) as instituciones_incompletas,
  count(*) filter (where not tiene_snapshot) as instituciones_sin_snapshot
from (
  select i.id, count(r.id) as n,
    exists (select 1 from public.workspace_snapshots s where s.institution_id = i.id and s.workspace_key = 'main') as tiene_snapshot
  from public.institutions i
  left join public.source_file_storage_resources r on r.institution_id = i.id and r.workspace_key = 'main'
  group by i.id
) x;
