-- ============================================================
-- HUB-INSTITUCIONAL - RESUMEN VERIFICACION PADRONES UI COMPAT
-- Ejecutar en Supabase SQL Editor despues de 02_academic_relational_schema.sql.
--
-- Este archivo no modifica datos permanentes. Usa una tabla temporal y devuelve
-- una sola grilla final con OK / FAIL / MISSING_COLUMN.
-- ============================================================

drop table if exists pg_temp.stage2_roster_verify_summary;

create temp table pg_temp.stage2_roster_verify_summary (
  sort_order integer primary key,
  check_name text not null,
  status text not null,
  detail text not null
);

do $$
declare
  v_missing text;
  v_found integer;
  v_duplicate_groups bigint;
  v_duplicate_rows bigint;
  v_missing_workspace_key bigint;
  v_missing_full_name bigint;
  v_missing_raw_payload bigint;
  v_missing_updated_at bigint;
  v_null_career bigint;
  v_null_academic_year bigint;
begin
  with required(column_name) as (
    values
      ('id'),
      ('institution_id'),
      ('workspace_key'),
      ('external_code'),
      ('profile_id'),
      ('email'),
      ('login_email'),
      ('full_name'),
      ('first_name'),
      ('last_name'),
      ('national_id'),
      ('dni'),
      ('phone'),
      ('status'),
      ('raw_payload'),
      ('created_at'),
      ('updated_at')
  )
  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing
  from required
  where not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'teacher_records'
      and columns.column_name = required.column_name
  );

  insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
  values (
    10,
    'teacher_records_columns',
    case when v_missing is null then 'OK' else 'FAIL' end,
    coalesce('faltan columnas: ' || v_missing, 'columnas UI/canonicas presentes')
  );

  with required(column_name) as (
    values
      ('id'),
      ('institution_id'),
      ('workspace_key'),
      ('external_code'),
      ('profile_id'),
      ('email'),
      ('full_name'),
      ('first_name'),
      ('last_name'),
      ('career'),
      ('academic_year'),
      ('national_id'),
      ('dni'),
      ('legajo'),
      ('phone'),
      ('status'),
      ('raw_payload'),
      ('created_at'),
      ('updated_at')
  )
  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing
  from required
  where not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'student_records'
      and columns.column_name = required.column_name
  );

  insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
  values (
    20,
    'student_records_columns',
    case when v_missing is null then 'OK' else 'FAIL' end,
    coalesce('faltan columnas: ' || v_missing, 'columnas UI/canonicas presentes')
  );

  with required(column_name) as (
    values ('workspace_key'), ('full_name'), ('raw_payload'), ('updated_at')
  )
  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing
  from required
  where not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'teacher_records'
      and columns.column_name = required.column_name
  );

  if v_missing is null then
    execute $sql$
      select
        count(*) filter (where workspace_key is null or btrim(workspace_key) = '')::bigint,
        count(*) filter (where full_name is null or btrim(full_name) = '')::bigint,
        count(*) filter (where raw_payload is null)::bigint,
        count(*) filter (where updated_at is null)::bigint
      from public.teacher_records
    $sql$
    into v_missing_workspace_key, v_missing_full_name, v_missing_raw_payload, v_missing_updated_at;

    insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
    values (
      30,
      'teacher_records_required_fields',
      case when v_missing_workspace_key + v_missing_full_name + v_missing_raw_payload + v_missing_updated_at = 0 then 'OK' else 'FAIL' end,
      format(
        'missing_workspace_key=%s, missing_full_name=%s, missing_raw_payload=%s, missing_updated_at=%s',
        v_missing_workspace_key,
        v_missing_full_name,
        v_missing_raw_payload,
        v_missing_updated_at
      )
    );
  else
    insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
    values (30, 'teacher_records_required_fields', 'MISSING_COLUMN', 'faltan columnas: ' || v_missing);
  end if;

  with required(column_name) as (
    values ('workspace_key'), ('full_name'), ('career'), ('academic_year'), ('raw_payload'), ('updated_at')
  )
  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing
  from required
  where not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'student_records'
      and columns.column_name = required.column_name
  );

  if v_missing is null then
    execute $sql$
      select
        count(*) filter (where workspace_key is null or btrim(workspace_key) = '')::bigint,
        count(*) filter (where full_name is null or btrim(full_name) = '')::bigint,
        count(*) filter (where career is null)::bigint,
        count(*) filter (where academic_year is null)::bigint,
        count(*) filter (where raw_payload is null)::bigint,
        count(*) filter (where updated_at is null)::bigint
      from public.student_records
    $sql$
    into v_missing_workspace_key, v_missing_full_name, v_null_career, v_null_academic_year, v_missing_raw_payload, v_missing_updated_at;

    insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
    values (
      40,
      'student_records_required_fields',
      case when v_missing_workspace_key + v_missing_full_name + v_null_career + v_null_academic_year + v_missing_raw_payload + v_missing_updated_at = 0 then 'OK' else 'FAIL' end,
      format(
        'missing_workspace_key=%s, missing_full_name=%s, null_career=%s, null_academic_year=%s, missing_raw_payload=%s, missing_updated_at=%s',
        v_missing_workspace_key,
        v_missing_full_name,
        v_null_career,
        v_null_academic_year,
        v_missing_raw_payload,
        v_missing_updated_at
      )
    );
  else
    insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
    values (40, 'student_records_required_fields', 'MISSING_COLUMN', 'faltan columnas: ' || v_missing);
  end if;

  with required(column_name) as (
    values ('workspace_key'), ('dni')
  )
  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing
  from required
  where not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'teacher_records'
      and columns.column_name = required.column_name
  );

  if v_missing is null then
    execute $sql$
      select count(*)::bigint, coalesce(sum(row_count - 1), 0)::bigint
      from (
        select count(*)::bigint as row_count
        from public.teacher_records
        where dni is not null
        group by institution_id, workspace_key, dni
        having count(*) > 1
      ) duplicates
    $sql$
    into v_duplicate_groups, v_duplicate_rows;

    insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
    values (
      50,
      'teacher_records_workspace_dni_duplicates',
      case when v_duplicate_groups = 0 then 'OK' else 'FAIL' end,
      format('duplicate_groups=%s, duplicate_extra_rows=%s', v_duplicate_groups, v_duplicate_rows)
    );
  else
    insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
    values (50, 'teacher_records_workspace_dni_duplicates', 'MISSING_COLUMN', 'faltan columnas: ' || v_missing);
  end if;

  with required(column_name) as (
    values ('workspace_key'), ('email'), ('career')
  )
  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing
  from required
  where not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'student_records'
      and columns.column_name = required.column_name
  );

  if v_missing is null then
    execute $sql$
      select count(*)::bigint, coalesce(sum(row_count - 1), 0)::bigint
      from (
        select count(*)::bigint as row_count
        from public.student_records
        where email is not null
        group by institution_id, workspace_key, email, career
        having count(*) > 1
      ) duplicates
    $sql$
    into v_duplicate_groups, v_duplicate_rows;

    insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
    values (
      60,
      'student_records_workspace_email_career_duplicates',
      case when v_duplicate_groups = 0 then 'OK' else 'FAIL' end,
      format('duplicate_groups=%s, duplicate_extra_rows=%s', v_duplicate_groups, v_duplicate_rows)
    );
  else
    insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
    values (60, 'student_records_workspace_email_career_duplicates', 'MISSING_COLUMN', 'faltan columnas: ' || v_missing);
  end if;

  select count(*)::integer
  into v_found
  from pg_constraint constraints
  where constraints.conrelid = to_regclass('public.teacher_records')
    and constraints.conname in (
      'teacher_records_workspace_dni_key',
      'teacher_records_profile_id_fkey'
    );

  insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
  values (
    70,
    'teacher_records_constraints',
    case when v_found = 2 then 'OK' else 'FAIL' end,
    format('found=%s/2: teacher_records_workspace_dni_key, teacher_records_profile_id_fkey', v_found)
  );

  select count(*)::integer
  into v_found
  from pg_constraint constraints
  where constraints.conrelid = to_regclass('public.student_records')
    and constraints.conname in (
      'student_records_workspace_email_career_key',
      'student_records_profile_id_fkey'
    );

  insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
  values (
    80,
    'student_records_constraints',
    case when v_found = 2 then 'OK' else 'FAIL' end,
    format('found=%s/2: student_records_workspace_email_career_key, student_records_profile_id_fkey', v_found)
  );

  select count(*)::integer
  into v_found
  from information_schema.triggers triggers
  where triggers.trigger_schema = 'public'
    and (
      (triggers.event_object_table = 'teacher_records' and triggers.trigger_name = 'sync_teacher_record_ui_compat_fields')
      or (triggers.event_object_table = 'student_records' and triggers.trigger_name = 'sync_student_record_ui_compat_fields')
    );

  insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
  values (
    90,
    'roster_sync_triggers',
    case when v_found >= 2 then 'OK' else 'FAIL' end,
    format('found=%s/2 expected sync triggers', least(v_found, 2))
  );

  select count(*)::integer
  into v_found
  from pg_policies policies
  where policies.schemaname = 'public'
    and (
      (policies.tablename = 'teacher_records' and policies.policyname in ('teacher_records members read', 'teacher_records editors manage'))
      or (policies.tablename = 'student_records' and policies.policyname in ('student_records members read', 'student_records editors manage'))
    );

  insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
  values (
    100,
    'roster_rls_policies',
    case when v_found = 4 then 'OK' else 'FAIL' end,
    format('found=%s/4 expected read/manage policies', v_found)
  );

  with expected(expected_table_name, expected_privilege_type) as (
    values
      ('teacher_records', 'SELECT'),
      ('teacher_records', 'INSERT'),
      ('teacher_records', 'UPDATE'),
      ('teacher_records', 'DELETE'),
      ('student_records', 'SELECT'),
      ('student_records', 'INSERT'),
      ('student_records', 'UPDATE'),
      ('student_records', 'DELETE')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from information_schema.table_privileges privileges
    where privileges.table_schema = 'public'
      and privileges.table_name = expected.expected_table_name
      and privileges.grantee = 'authenticated'
      and privileges.privilege_type = expected.expected_privilege_type
  );

  insert into pg_temp.stage2_roster_verify_summary(sort_order, check_name, status, detail)
  values (
    110,
    'roster_authenticated_grants',
    case when v_found = 8 then 'OK' else 'FAIL' end,
    format('found=%s/8 expected SELECT/INSERT/UPDATE/DELETE grants', v_found)
  );
end $$;

select check_name, status, detail
from pg_temp.stage2_roster_verify_summary
order by sort_order;
