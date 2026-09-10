-- ============================================================
-- HUB-INSTITUCIONAL - REPARACION DUPLICADOS student_records
-- Ejecutar en Supabase SQL Editor solo si 02_academic_relational_schema.sql
-- falla creando `student_records_workspace_email_career_key`.
--
-- Objetivo:
-- - conservar una fila canonica por institution_id + workspace_key + email + career
-- - relinkear student_career_plans y tablas operativas conocidas si existen
-- - guardar un rastro de las filas fusionadas dentro de raw_payload
-- - eliminar solo las filas duplicadas que bloquean el upsert de la UI
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.student_records') is null then
    raise exception 'No existe public.student_records. Ejecuta primero el schema relacional base de la etapa 2.';
  end if;
end $$;

alter table public.student_records
  add column if not exists workspace_key text,
  add column if not exists profile_id uuid,
  add column if not exists full_name text,
  add column if not exists career text,
  add column if not exists academic_year text,
  add column if not exists dni text,
  add column if not exists legajo text,
  add column if not exists raw_payload jsonb,
  add column if not exists updated_at timestamptz;

alter table public.student_records
  alter column workspace_key set default 'main',
  alter column career set default '',
  alter column academic_year set default '',
  alter column legajo set default '',
  alter column status set default 'active',
  alter column raw_payload set default '{}'::jsonb,
  alter column updated_at set default timezone('utc', now());

update public.student_records
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  full_name = coalesce(
    nullif(btrim(full_name), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))), ''),
    nullif(btrim(email), ''),
    external_code,
    id::text
  ),
  dni = nullif(btrim(coalesce(nullif(btrim(dni), ''), nullif(btrim(national_id), ''), '')), ''),
  national_id = nullif(btrim(coalesce(nullif(btrim(national_id), ''), nullif(btrim(dni), ''), '')), ''),
  email = nullif(lower(btrim(coalesce(nullif(btrim(email), ''), ''))), ''),
  career = btrim(coalesce(career, '')),
  academic_year = btrim(coalesce(academic_year, '')),
  legajo = btrim(coalesce(legajo, '')),
  status = coalesce(nullif(btrim(status), ''), 'active'),
  raw_payload = coalesce(raw_payload, '{}'::jsonb),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where
  workspace_key is null
  or btrim(workspace_key) = ''
  or full_name is null
  or btrim(full_name) = ''
  or (dni is null and national_id is not null)
  or (national_id is null and dni is not null)
  or email <> lower(email)
  or career is null
  or academic_year is null
  or legajo is null
  or btrim(coalesce(status, '')) = ''
  or raw_payload is null
  or updated_at is null;

alter table public.student_records
  alter column workspace_key set not null,
  alter column full_name set not null,
  alter column career set not null,
  alter column academic_year set not null,
  alter column legajo set not null,
  alter column raw_payload set not null,
  alter column updated_at set not null;

do $$
declare
  missing_columns text;
begin
  select string_agg(required_columns.column_name, ', ' order by required_columns.column_name)
  into missing_columns
  from (
    values
      ('academic_year'),
      ('career'),
      ('created_at'),
      ('dni'),
      ('email'),
      ('external_code'),
      ('first_name'),
      ('full_name'),
      ('id'),
      ('institution_id'),
      ('last_name'),
      ('legajo'),
      ('national_id'),
      ('phone'),
      ('profile_id'),
      ('raw_payload'),
      ('status'),
      ('updated_at'),
      ('workspace_key')
  ) as required_columns(column_name)
  where not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_records'
      and column_name = required_columns.column_name
  );

  if missing_columns is not null then
    raise exception 'Faltan columnas en public.student_records: %. Ejecuta primero 02_academic_relational_schema.sql hasta el bloque de compatibilidad de padrones.', missing_columns;
  end if;
end $$;

lock table public.student_records in share row exclusive mode;

drop table if exists pg_temp.student_record_dedup_summary;
create temp table pg_temp.student_record_dedup_summary (
  step text primary key,
  affected_rows bigint not null
);

drop table if exists pg_temp.student_record_dedup_map;
create temp table pg_temp.student_record_dedup_map as
with ranked_records as (
  select
    student_records.id,
    student_records.institution_id,
    student_records.workspace_key,
    student_records.email,
    student_records.career,
    first_value(student_records.id) over (
      partition by student_records.institution_id, student_records.workspace_key, student_records.email, student_records.career
      order by
        (student_records.profile_id is not null) desc,
        (nullif(btrim(coalesce(student_records.legajo, '')), '') is not null) desc,
        (nullif(btrim(coalesce(student_records.dni, '')), '') is not null) desc,
        (nullif(btrim(coalesce(student_records.full_name, '')), '') is not null) desc,
        coalesce(student_records.updated_at, student_records.created_at, 'epoch'::timestamptz) desc,
        student_records.id
    ) as keep_id,
    row_number() over (
      partition by student_records.institution_id, student_records.workspace_key, student_records.email, student_records.career
      order by
        (student_records.profile_id is not null) desc,
        (nullif(btrim(coalesce(student_records.legajo, '')), '') is not null) desc,
        (nullif(btrim(coalesce(student_records.dni, '')), '') is not null) desc,
        (nullif(btrim(coalesce(student_records.full_name, '')), '') is not null) desc,
        coalesce(student_records.updated_at, student_records.created_at, 'epoch'::timestamptz) desc,
        student_records.id
    ) as record_rank
  from public.student_records
  where student_records.email is not null
)
select
  institution_id,
  workspace_key,
  email,
  career,
  keep_id,
  id as duplicate_id
from ranked_records
where record_rank > 1;

insert into pg_temp.student_record_dedup_summary(step, affected_rows)
select 'duplicate_student_records_found', count(*)::bigint
from pg_temp.student_record_dedup_map;

drop table if exists pg_temp.student_record_dedup_members;
create temp table pg_temp.student_record_dedup_members as
select distinct institution_id, keep_id, keep_id as student_id
from pg_temp.student_record_dedup_map
union
select distinct institution_id, keep_id, duplicate_id as student_id
from pg_temp.student_record_dedup_map;

with duplicate_payloads as (
  select
    dedup_map.institution_id,
    dedup_map.keep_id,
    array_agg(dedup_map.duplicate_id order by duplicate_records.id) as duplicate_ids,
    jsonb_agg(
      jsonb_build_object(
        'id', duplicate_records.id,
        'external_code', duplicate_records.external_code,
        'profile_id', duplicate_records.profile_id,
        'email', duplicate_records.email,
        'full_name', duplicate_records.full_name,
        'first_name', duplicate_records.first_name,
        'last_name', duplicate_records.last_name,
        'career', duplicate_records.career,
        'academic_year', duplicate_records.academic_year,
        'dni', duplicate_records.dni,
        'national_id', duplicate_records.national_id,
        'legajo', duplicate_records.legajo,
        'phone', duplicate_records.phone,
        'status', duplicate_records.status,
        'raw_payload', duplicate_records.raw_payload,
        'created_at', duplicate_records.created_at,
        'updated_at', duplicate_records.updated_at
      )
      order by duplicate_records.id
    ) as duplicate_records,
    (array_agg(duplicate_records.profile_id order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where duplicate_records.profile_id is not null))[1] as profile_id,
    (array_agg(nullif(btrim(duplicate_records.full_name), '') order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where nullif(btrim(duplicate_records.full_name), '') is not null))[1] as full_name,
    (array_agg(nullif(btrim(duplicate_records.first_name), '') order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where nullif(btrim(duplicate_records.first_name), '') is not null))[1] as first_name,
    (array_agg(nullif(btrim(duplicate_records.last_name), '') order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where nullif(btrim(duplicate_records.last_name), '') is not null))[1] as last_name,
    (array_agg(nullif(btrim(duplicate_records.dni), '') order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where nullif(btrim(duplicate_records.dni), '') is not null))[1] as dni,
    (array_agg(nullif(btrim(duplicate_records.national_id), '') order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where nullif(btrim(duplicate_records.national_id), '') is not null))[1] as national_id,
    (array_agg(nullif(btrim(duplicate_records.legajo), '') order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where nullif(btrim(duplicate_records.legajo), '') is not null))[1] as legajo,
    (array_agg(nullif(btrim(duplicate_records.phone), '') order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where nullif(btrim(duplicate_records.phone), '') is not null))[1] as phone,
    (array_agg(nullif(btrim(duplicate_records.status), '') order by coalesce(duplicate_records.updated_at, duplicate_records.created_at, 'epoch'::timestamptz) desc)
      filter (where nullif(btrim(duplicate_records.status), '') is not null))[1] as status
  from pg_temp.student_record_dedup_map dedup_map
  join public.student_records duplicate_records
    on duplicate_records.institution_id = dedup_map.institution_id
   and duplicate_records.id = dedup_map.duplicate_id
  group by dedup_map.institution_id, dedup_map.keep_id
),
updated_records as (
  update public.student_records keep_records
  set
    profile_id = coalesce(keep_records.profile_id, duplicate_payloads.profile_id),
    full_name = coalesce(nullif(btrim(keep_records.full_name), ''), duplicate_payloads.full_name, nullif(btrim(keep_records.email), ''), keep_records.external_code, keep_records.id::text),
    first_name = coalesce(nullif(btrim(keep_records.first_name), ''), duplicate_payloads.first_name, nullif(btrim(keep_records.full_name), ''), duplicate_payloads.full_name, nullif(btrim(keep_records.email), ''), ''),
    last_name = coalesce(nullif(btrim(keep_records.last_name), ''), duplicate_payloads.last_name, ''),
    dni = coalesce(nullif(btrim(keep_records.dni), ''), duplicate_payloads.dni, duplicate_payloads.national_id),
    national_id = coalesce(nullif(btrim(keep_records.national_id), ''), duplicate_payloads.national_id, duplicate_payloads.dni),
    legajo = coalesce(nullif(btrim(keep_records.legajo), ''), duplicate_payloads.legajo, ''),
    phone = coalesce(nullif(btrim(keep_records.phone), ''), duplicate_payloads.phone),
    status = coalesce(nullif(btrim(keep_records.status), ''), duplicate_payloads.status, 'active'),
    raw_payload = coalesce(keep_records.raw_payload, '{}'::jsonb)
      || jsonb_build_object(
        '_deduped_student_record_ids',
        coalesce(keep_records.raw_payload -> '_deduped_student_record_ids', '[]'::jsonb) || to_jsonb(duplicate_payloads.duplicate_ids),
        '_deduped_student_records',
        coalesce(keep_records.raw_payload -> '_deduped_student_records', '[]'::jsonb) || duplicate_payloads.duplicate_records,
        '_deduped_at',
        timezone('utc', now())
      ),
    updated_at = timezone('utc', now())
  from duplicate_payloads
  where keep_records.institution_id = duplicate_payloads.institution_id
    and keep_records.id = duplicate_payloads.keep_id
  returning 1
)
insert into pg_temp.student_record_dedup_summary(step, affected_rows)
select 'canonical_student_records_updated', count(*)::bigint
from updated_records;

drop table if exists pg_temp.student_career_plan_dedup_map;
create temp table pg_temp.student_career_plan_dedup_map (
  institution_id uuid not null,
  keep_id uuid not null,
  duplicate_plan_id uuid not null,
  keep_plan_id uuid not null
);

do $$
begin
  if to_regclass('public.student_career_plans') is not null then
    execute $sql$
      insert into pg_temp.student_career_plan_dedup_map(institution_id, keep_id, duplicate_plan_id, keep_plan_id)
      with ranked_plans as (
        select
          plans.institution_id,
          members.keep_id,
          plans.id,
          first_value(plans.id) over (
            partition by plans.institution_id, members.keep_id, plans.plan_id
            order by
              (plans.student_id = members.keep_id) desc,
              (plans.status = 'active') desc,
              coalesce(plans.created_at, 'epoch'::timestamptz) desc,
              plans.id
          ) as keep_plan_id
        from public.student_career_plans plans
        join pg_temp.student_record_dedup_members members
          on members.institution_id = plans.institution_id
         and members.student_id = plans.student_id
      )
      select distinct
        institution_id,
        keep_id,
        id as duplicate_plan_id,
        keep_plan_id
      from ranked_plans
      where id <> keep_plan_id
    $sql$;
  end if;
end $$;

insert into pg_temp.student_record_dedup_summary(step, affected_rows)
select 'duplicate_student_career_plans_found', count(*)::bigint
from pg_temp.student_career_plan_dedup_map;

do $$
declare
  affected_rows bigint := 0;
begin
  if to_regclass('public.student_academic_statuses') is not null then
    execute $sql$
      update public.student_academic_statuses statuses
      set student_career_plan_id = plan_map.keep_plan_id
      from pg_temp.student_career_plan_dedup_map plan_map
      where statuses.institution_id = plan_map.institution_id
        and statuses.student_career_plan_id = plan_map.duplicate_plan_id
    $sql$;
    get diagnostics affected_rows = row_count;
  end if;

  insert into pg_temp.student_record_dedup_summary(step, affected_rows)
  values ('student_academic_statuses_relinked', affected_rows)
  on conflict (step) do update
  set affected_rows = excluded.affected_rows;
end $$;

do $$
declare
  affected_rows bigint := 0;
begin
  if to_regclass('public.student_career_plans') is not null then
    execute $sql$
      delete from public.student_career_plans plans
      using pg_temp.student_career_plan_dedup_map plan_map
      where plans.institution_id = plan_map.institution_id
        and plans.id = plan_map.duplicate_plan_id
    $sql$;
    get diagnostics affected_rows = row_count;
  end if;

  insert into pg_temp.student_record_dedup_summary(step, affected_rows)
  values ('duplicate_student_career_plans_deleted', affected_rows)
  on conflict (step) do update
  set affected_rows = excluded.affected_rows;
end $$;

do $$
declare
  affected_rows bigint := 0;
begin
  if to_regclass('public.student_career_plans') is not null then
    execute $sql$
      update public.student_career_plans plans
      set student_id = record_map.keep_id
      from pg_temp.student_record_dedup_map record_map
      where plans.institution_id = record_map.institution_id
        and plans.student_id = record_map.duplicate_id
    $sql$;
    get diagnostics affected_rows = row_count;
  end if;

  insert into pg_temp.student_record_dedup_summary(step, affected_rows)
  values ('student_career_plans_relinked', affected_rows)
  on conflict (step) do update
  set affected_rows = excluded.affected_rows;
end $$;

do $$
declare
  target_table text;
  affected_rows bigint;
begin
  foreach target_table in array array[
    'subject_enrollments',
    'exam_enrollments',
    'student_grades',
    'student_financial_status'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = 'institution_id'
      )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = 'student_record_id'
      )
    then
      execute format(
        'update public.%I target
         set student_record_id = dedup_map.keep_id
         from pg_temp.student_record_dedup_map dedup_map
         where target.institution_id = dedup_map.institution_id
           and target.student_record_id = dedup_map.duplicate_id',
        target_table
      );
      get diagnostics affected_rows = row_count;

      insert into pg_temp.student_record_dedup_summary(step, affected_rows)
      values (target_table || '_student_record_id_relinked', affected_rows)
      on conflict (step) do update
      set affected_rows = excluded.affected_rows;
    end if;
  end loop;
end $$;

with deleted_records as (
  delete from public.student_records records
  using pg_temp.student_record_dedup_map dedup_map
  where records.institution_id = dedup_map.institution_id
    and records.id = dedup_map.duplicate_id
  returning 1
)
insert into pg_temp.student_record_dedup_summary(step, affected_rows)
select 'duplicate_student_records_deleted', count(*)::bigint
from deleted_records;

do $$
begin
  if exists (
    select 1
    from public.student_records
    where email is not null
    group by institution_id, workspace_key, email, career
    having count(*) > 1
  ) then
    raise exception 'Todavia quedan duplicados en student_records para institution_id + workspace_key + email + career. No se aplico la reparacion.';
  end if;
end $$;

commit;

select step, affected_rows
from pg_temp.student_record_dedup_summary
order by step;
