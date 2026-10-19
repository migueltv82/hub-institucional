-- D1 (19/10): los recursos del gateway de Storage se registraban solo al INSERTAR el snapshot del workspace.
-- Una institucion recien creada no tiene snapshot, asi que su primera carga de planillas fallaba con
-- "El recurso de archivo no esta registrado". Ahora tambien se registran al crear la institucion (workspace
-- 'main', el que usa la app) y se completa el backfill de las instituciones existentes.
-- Requiere supabase/security/source_file_storage_gateway.sql aplicado antes. Idempotente: se puede re-ejecutar.

create or replace function public.register_source_file_storage_resources_for_institution() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
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

insert into public.source_file_storage_resources(institution_id, workspace_key, dataset_key)
select i.id, 'main', dataset
from public.institutions i
cross join unnest(array['masterWorkbook','docentesWorkbook','alumnosWorkbook','horarios','planes','correlatividades','alumnos','docentes','docenteMateria']) dataset
on conflict (institution_id, workspace_key, dataset_key) do nothing;

-- Verificacion: cada institucion tiene sus 9 recursos del workspace 'main'.
select count(*) filter (where n <> 9) as instituciones_incompletas
from (
  select i.id, count(r.id) as n
  from public.institutions i
  left join public.source_file_storage_resources r on r.institution_id = i.id and r.workspace_key = 'main'
  group by i.id
) x;
