-- ============================================================
-- HUB-INSTITUCIONAL - VERIFICACION PADRONES UI COMPAT
-- Ejecutar en Supabase SQL Editor despues de 02_academic_relational_schema.sql.
--
-- Este archivo no modifica datos. Solo lista columnas, constraints,
-- triggers, grants, policies y posibles duplicados de padrones.
-- ============================================================

-- 1. Columnas que la UI espera en student_records y teacher_records.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('student_records', 'teacher_records')
  and column_name in (
    'id',
    'institution_id',
    'workspace_key',
    'external_code',
    'profile_id',
    'email',
    'login_email',
    'full_name',
    'first_name',
    'last_name',
    'career',
    'academic_year',
    'national_id',
    'dni',
    'legajo',
    'phone',
    'status',
    'raw_payload',
    'created_at',
    'updated_at'
  )
order by table_name, column_name;

-- 2. Constraints clave para upsert y link con profiles.
select
  conrelid::regclass::text as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.student_records'::regclass, 'public.teacher_records'::regclass)
  and conname in (
    'teacher_records_workspace_dni_key',
    'student_records_workspace_email_career_key',
    'teacher_records_profile_id_fkey',
    'student_records_profile_id_fkey',
    'teacher_records_status_check',
    'student_records_status_check'
  )
order by table_name, conname;

-- 3. Triggers que sincronizan campos canonicos y campos UI.
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('student_records', 'teacher_records')
  and trigger_name in (
    'sync_teacher_record_ui_compat_fields',
    'sync_student_record_ui_compat_fields'
  )
order by event_object_table, trigger_name, event_manipulation;

-- 4. Policies RLS de padrones.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('student_records', 'teacher_records')
order by tablename, policyname;

-- 5. Grants de tabla para authenticated. RLS sigue siendo la barrera real.
select grantee, table_name, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in ('student_records', 'teacher_records')
  and grantee = 'authenticated'
order by table_name, privilege_type;

-- 6. Duplicados que romperian los upserts de la UI.
-- Si aparecen filas con row_count > 1, ejecutar:
-- supabase/docs/repair_02_student_records_duplicate_upsert_keys.sql
-- Si falta alguna columna, devuelve MISSING_COLUMN en vez de cortar la corrida.
create or replace function pg_temp.verify_teacher_records_workspace_dni_duplicates()
returns table (
  check_name text,
  institution_id uuid,
  workspace_key text,
  identity_value text,
  row_count bigint
)
language plpgsql
as $$
begin
  if not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'teacher_records'
      and columns.column_name in ('workspace_key', 'dni')
    group by columns.table_name
    having count(*) = 2
  ) then
    return query select
      'teacher_records_workspace_dni_duplicates'::text,
      null::uuid,
      null::text,
      'MISSING_COLUMN'::text,
      0::bigint;
    return;
  end if;

  return query execute $sql$
    select
      'teacher_records_workspace_dni_duplicates'::text as check_name,
      institution_id,
      workspace_key,
      dni as identity_value,
      count(*)::bigint as row_count
    from public.teacher_records
    where dni is not null
    group by institution_id, workspace_key, dni
    having count(*) > 1
    order by row_count desc
  $sql$;
end;
$$;

select * from pg_temp.verify_teacher_records_workspace_dni_duplicates();

create or replace function pg_temp.verify_student_records_workspace_email_career_duplicates()
returns table (
  check_name text,
  institution_id uuid,
  workspace_key text,
  identity_value text,
  row_count bigint
)
language plpgsql
as $$
begin
  if not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'student_records'
      and columns.column_name in ('workspace_key', 'email', 'career')
    group by columns.table_name
    having count(*) = 3
  ) then
    return query select
      'student_records_workspace_email_career_duplicates'::text,
      null::uuid,
      null::text,
      'MISSING_COLUMN'::text,
      0::bigint;
    return;
  end if;

  return query execute $sql$
    select
      'student_records_workspace_email_career_duplicates'::text as check_name,
      institution_id,
      workspace_key,
      email || ' :: ' || career as identity_value,
      count(*)::bigint as row_count
    from public.student_records
    where email is not null
    group by institution_id, workspace_key, email, career
    having count(*) > 1
    order by row_count desc
  $sql$;
end;
$$;

select * from pg_temp.verify_student_records_workspace_email_career_duplicates();

-- 7. Conteo de filas sin campos operativos basicos.
create or replace function pg_temp.verify_teacher_records_required_ui_fields()
returns table (
  table_name text,
  missing_workspace_key bigint,
  missing_full_name bigint,
  missing_raw_payload bigint,
  missing_updated_at bigint,
  check_status text
)
language plpgsql
as $$
begin
  if not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'teacher_records'
      and columns.column_name in ('workspace_key', 'full_name', 'raw_payload', 'updated_at')
    group by columns.table_name
    having count(*) = 4
  ) then
    return query select
      'teacher_records'::text,
      null::bigint,
      null::bigint,
      null::bigint,
      null::bigint,
      'MISSING_COLUMN'::text;
    return;
  end if;

  return query execute $sql$
    select
      'teacher_records'::text as table_name,
      count(*) filter (where workspace_key is null or btrim(workspace_key) = '')::bigint as missing_workspace_key,
      count(*) filter (where full_name is null or btrim(full_name) = '')::bigint as missing_full_name,
      count(*) filter (where raw_payload is null)::bigint as missing_raw_payload,
      count(*) filter (where updated_at is null)::bigint as missing_updated_at,
      'OK'::text as check_status
    from public.teacher_records
  $sql$;
end;
$$;

select * from pg_temp.verify_teacher_records_required_ui_fields();

create or replace function pg_temp.verify_student_records_required_ui_fields()
returns table (
  table_name text,
  missing_workspace_key bigint,
  missing_full_name bigint,
  null_career bigint,
  null_academic_year bigint,
  missing_raw_payload bigint,
  missing_updated_at bigint,
  check_status text
)
language plpgsql
as $$
begin
  if not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'student_records'
      and columns.column_name in ('workspace_key', 'full_name', 'career', 'academic_year', 'raw_payload', 'updated_at')
    group by columns.table_name
    having count(*) = 6
  ) then
    return query select
      'student_records'::text,
      null::bigint,
      null::bigint,
      null::bigint,
      null::bigint,
      null::bigint,
      null::bigint,
      'MISSING_COLUMN'::text;
    return;
  end if;

  return query execute $sql$
    select
      'student_records'::text as table_name,
      count(*) filter (where workspace_key is null or btrim(workspace_key) = '')::bigint as missing_workspace_key,
      count(*) filter (where full_name is null or btrim(full_name) = '')::bigint as missing_full_name,
      count(*) filter (where career is null)::bigint as null_career,
      count(*) filter (where academic_year is null)::bigint as null_academic_year,
      count(*) filter (where raw_payload is null)::bigint as missing_raw_payload,
      count(*) filter (where updated_at is null)::bigint as missing_updated_at,
      'OK'::text as check_status
    from public.student_records
  $sql$;
end;
$$;

select * from pg_temp.verify_student_records_required_ui_fields();
