-- Datos operativos compatibles con la UI actual:
-- - archivos fuente del workspace + bucket privado de Storage
-- - disponibilidad y carga docente derivadas del workspace
-- - tablas legacy de catalogo/correlatividades/llamados usadas por el autosave
--
-- Autocontenido e idempotente, mismo criterio que el resto de supabase/schema/.

create or replace function public.storage_object_institution_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  institution_segment text;
begin
  institution_segment := split_part(coalesce(object_name, ''), '/', 1);

  if institution_segment = '' then
    return null;
  end if;

  return institution_segment::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke execute on function public.storage_object_institution_id(text) from public, anon;
grant execute on function public.storage_object_institution_id(text) to authenticated;

insert into storage.buckets (id, name, "public")
values ('workspace-source-files', 'workspace-source-files', false)
on conflict (id) do update
set name = excluded.name,
    "public" = false;

create table if not exists public.workspace_source_files (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  dataset_key text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_extension text not null default '',
  file_size bigint,
  storage_bucket text not null default 'workspace-source-files',
  storage_path text,
  file_base64 text,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (institution_id, workspace_key, dataset_key),
  check (btrim(workspace_key) <> ''),
  check (btrim(dataset_key) <> ''),
  check (file_size is null or file_size >= 0),
  check (storage_path is null or split_part(storage_path, '/', 1) = institution_id::text)
);

create table if not exists public.teacher_availability_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  teacher_record_id text,
  teacher_identity text not null,
  teacher_display_name text not null,
  teacher_name text not null default '',
  teacher_dni text,
  day_of_week text not null,
  shift text not null default '',
  start_time text not null,
  end_time text not null,
  is_available boolean not null default true,
  reason text not null default '',
  status text not null default 'ACTIVE',
  valid_from text not null default '',
  valid_until text not null default '',
  source text not null default 'workspace_snapshot',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint teacher_availability_records_workspace_key
    unique (institution_id, workspace_key, teacher_identity, day_of_week, shift, start_time, end_time, valid_from, valid_until),
  check (btrim(workspace_key) <> ''),
  check (btrim(teacher_identity) <> ''),
  check (btrim(teacher_display_name) <> ''),
  check (btrim(day_of_week) <> ''),
  check (btrim(start_time) <> ''),
  check (btrim(end_time) <> ''),
  check (btrim(status) <> '')
);

create table if not exists public.teacher_workload_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  teacher_record_id text,
  teacher_identity text not null,
  teacher_display_name text not null,
  teacher_name text not null default '',
  teacher_dni text,
  program_id text not null,
  career_name text not null,
  plan_id text not null default '',
  subject_id text not null,
  subject_name text not null,
  academic_year text not null default '',
  role text not null default '',
  titularity text not null default '',
  teaching_hours numeric(8,2) not null,
  status text not null default 'ACTIVE',
  valid_from text not null default '',
  valid_until text not null default '',
  source text not null default 'workspace_snapshot',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint teacher_workload_records_workspace_key
    unique (institution_id, workspace_key, teacher_identity, program_id, plan_id, subject_id, valid_from, valid_until),
  check (btrim(workspace_key) <> ''),
  check (btrim(teacher_identity) <> ''),
  check (btrim(teacher_display_name) <> ''),
  check (btrim(program_id) <> ''),
  check (btrim(career_name) <> ''),
  check (btrim(subject_id) <> ''),
  check (btrim(subject_name) <> ''),
  check (teaching_hours > 0),
  check (btrim(status) <> '')
);

create table if not exists public.legacy_subjects_catalog (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  subject_id text not null,
  program_id text not null default '',
  year_level integer,
  name text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (institution_id, workspace_key, subject_id, program_id),
  check (btrim(workspace_key) <> ''),
  check (btrim(subject_id) <> ''),
  check (year_level is null or year_level between 1 and 20)
);

create table if not exists public.legacy_subject_prerequisites (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  subject_id text not null,
  program_id text not null default '',
  prerequisite_subject_id text not null,
  is_immediate boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint legacy_subject_prerequisites_workspace_key
    unique (institution_id, workspace_key, subject_id, program_id, prerequisite_subject_id),
  check (btrim(workspace_key) <> ''),
  check (btrim(subject_id) <> ''),
  check (btrim(prerequisite_subject_id) <> ''),
  check (subject_id <> prerequisite_subject_id)
);

create table if not exists public.legacy_exam_sessions (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  exam_table_id text not null,
  subject_id text not null default '',
  program_id text not null default '',
  exam_date text,
  call_label text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (institution_id, workspace_key, exam_table_id),
  check (btrim(workspace_key) <> ''),
  check (btrim(exam_table_id) <> '')
);

alter table public.legacy_exam_sessions
  alter column exam_date type text using exam_date::text;

create or replace function public.touch_workspace_operational_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke execute on function public.touch_workspace_operational_updated_at() from public, anon, authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'workspace_source_files',
    'teacher_availability_records',
    'teacher_workload_records',
    'legacy_subjects_catalog',
    'legacy_subject_prerequisites',
    'legacy_exam_sessions'
  ]
  loop
    execute format('drop trigger if exists touch_workspace_operational_updated_at on public.%I', target_table);
    execute format(
      'create trigger touch_workspace_operational_updated_at before insert or update on public.%I for each row execute function public.touch_workspace_operational_updated_at()',
      target_table
    );
  end loop;
end $$;

create index if not exists idx_workspace_source_files_workspace on public.workspace_source_files (institution_id, workspace_key, updated_at);
create index if not exists idx_teacher_availability_records_workspace on public.teacher_availability_records (institution_id, workspace_key, teacher_identity);
create index if not exists idx_teacher_availability_records_teacher_record_id on public.teacher_availability_records (teacher_record_id) where teacher_record_id is not null;
create index if not exists idx_teacher_workload_records_workspace on public.teacher_workload_records (institution_id, workspace_key, teacher_identity);
create index if not exists idx_teacher_workload_records_subject on public.teacher_workload_records (institution_id, workspace_key, program_id, subject_id);
create index if not exists idx_teacher_workload_records_teacher_record_id on public.teacher_workload_records (teacher_record_id) where teacher_record_id is not null;
create index if not exists idx_legacy_subject_prerequisites_workspace on public.legacy_subject_prerequisites (institution_id, workspace_key, subject_id, program_id);
create index if not exists idx_legacy_exam_sessions_workspace_subject on public.legacy_exam_sessions (institution_id, workspace_key, subject_id, program_id);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'workspace_source_files',
    'teacher_availability_records',
    'teacher_workload_records',
    'legacy_subjects_catalog',
    'legacy_subject_prerequisites',
    'legacy_exam_sessions'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);

    execute format('drop policy if exists %I on public.%I', target_table || ' members read', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors insert', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors update', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors delete', target_table);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_super_admin() or public.is_member_of_institution(institution_id))',
      target_table || ' members read',
      target_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array[''owner'', ''admin'', ''editor'']))',
      target_table || ' editors insert',
      target_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_super_admin() or public.is_member_of_institution(institution_id, array[''owner'', ''admin'', ''editor''])) with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array[''owner'', ''admin'', ''editor'']))',
      target_table || ' editors update',
      target_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_super_admin() or public.is_member_of_institution(institution_id, array[''owner'', ''admin'', ''editor'']))',
      target_table || ' editors delete',
      target_table
    );
  end loop;
end $$;

grant select, insert, update, delete on
  public.workspace_source_files,
  public.teacher_availability_records,
  public.teacher_workload_records,
  public.legacy_subjects_catalog,
  public.legacy_subject_prerequisites,
  public.legacy_exam_sessions
to authenticated;

drop policy if exists "workspace source files members read objects" on storage.objects;
drop policy if exists "workspace source files editors insert objects" on storage.objects;
drop policy if exists "workspace source files editors update objects" on storage.objects;
drop policy if exists "workspace source files editors delete objects" on storage.objects;

create policy "workspace source files members read objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'workspace-source-files'
  and (
    public.is_super_admin()
    or public.is_member_of_institution(public.storage_object_institution_id(name))
  )
);

create policy "workspace source files editors insert objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'workspace-source-files'
  and (
    public.is_super_admin()
    or public.is_member_of_institution(public.storage_object_institution_id(name), array['owner', 'admin', 'editor'])
  )
);

create policy "workspace source files editors update objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'workspace-source-files'
  and (
    public.is_super_admin()
    or public.is_member_of_institution(public.storage_object_institution_id(name), array['owner', 'admin', 'editor'])
  )
)
with check (
  bucket_id = 'workspace-source-files'
  and (
    public.is_super_admin()
    or public.is_member_of_institution(public.storage_object_institution_id(name), array['owner', 'admin', 'editor'])
  )
);

create policy "workspace source files editors delete objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'workspace-source-files'
  and (
    public.is_super_admin()
    or public.is_member_of_institution(public.storage_object_institution_id(name), array['owner', 'admin', 'editor'])
  )
);
