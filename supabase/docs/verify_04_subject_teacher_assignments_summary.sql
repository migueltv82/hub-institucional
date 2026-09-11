-- ============================================================
-- HUB-INSTITUCIONAL - RESUMEN VERIFICACION ETAPA 4
-- Ejecutar en Supabase SQL Editor despues de:
-- supabase/schema/06_subject_teacher_assignments.sql
--
-- Este archivo no modifica datos permanentes. Usa una tabla temporal y devuelve
-- una sola grilla final con OK / FAIL.
-- ============================================================

drop table if exists pg_temp.stage4_assignments_verify_summary;

create temp table pg_temp.stage4_assignments_verify_summary (
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
  v_bad_required bigint;
  v_bad_role bigint;
  v_bad_status bigint;
begin
  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing
  from unnest(array[
    'id',
    'institution_id',
    'workspace_key',
    'subject_id',
    'program_id',
    'teacher_id',
    'teacher_record_id',
    'source',
    'status',
    'deleted_at',
    'role',
    'metadata',
    'created_at',
    'updated_at'
  ]::text[]) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'subject_teacher_assignments'
      and columns.column_name = required.column_name
  );

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    10,
    'subject_teacher_assignments_columns',
    case when v_missing is null then 'OK' else 'FAIL' end,
    coalesce('faltan columnas: ' || v_missing, 'columnas esperadas presentes')
  );

  with expected(expected_constraint_name) as (
    values
      ('subject_teacher_assignments_pkey'),
      ('subject_teacher_assignments_institution_id_fkey'),
      ('subject_teacher_assignments_teacher_id_fkey'),
      ('subject_teacher_assignments_teacher_record_id_fkey'),
      ('subject_teacher_assignments_workspace_key_check'),
      ('subject_teacher_assignments_subject_id_check'),
      ('subject_teacher_assignments_status_check'),
      ('subject_teacher_assignments_role_check')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from pg_constraint constraints
    where constraints.conrelid = 'public.subject_teacher_assignments'::regclass
      and constraints.conname = expected.expected_constraint_name
  );

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    20,
    'subject_teacher_assignments_constraints',
    case when v_found = 8 then 'OK' else 'FAIL' end,
    format('found=%s/8 expected constraints', v_found)
  );

  with expected(expected_index_name) as (
    values
      ('subject_teacher_assignments_active_key'),
      ('idx_subject_teacher_assignments_workspace'),
      ('idx_subject_teacher_assignments_teacher_active'),
      ('idx_subject_teacher_assignments_subject_active'),
      ('idx_subject_teacher_assignments_teacher_record_id')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from pg_indexes indexes
    where indexes.schemaname = 'public'
      and indexes.tablename = 'subject_teacher_assignments'
      and indexes.indexname = expected.expected_index_name
  );

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    30,
    'subject_teacher_assignments_indexes',
    case when v_found = 5 then 'OK' else 'FAIL' end,
    format('found=%s/5 expected indexes', v_found)
  );

  if to_regclass('public.subject_teacher_assignments') is null then
    insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
    values (40, 'subject_teacher_assignments_required_fields', 'FAIL', 'missing table');
  else
    execute $sql$
      select
        count(*) filter (
          where id is null
            or institution_id is null
            or workspace_key is null
            or btrim(workspace_key) = ''
            or subject_id is null
            or btrim(subject_id) = ''
            or program_id is null
            or teacher_id is null
            or source is null
            or btrim(source) = ''
            or status is null
            or btrim(status) = ''
            or role is null
            or btrim(role) = ''
            or metadata is null
            or created_at is null
            or updated_at is null
        )::bigint,
        count(*) filter (where role not in ('titular', 'suplente', 'licencia'))::bigint,
        count(*) filter (where status not in ('active', 'inactive'))::bigint
      from public.subject_teacher_assignments
    $sql$
    into v_bad_required, v_bad_role, v_bad_status;

    insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
    values (
      40,
      'subject_teacher_assignments_required_fields',
      case when v_bad_required = 0 and v_bad_role = 0 and v_bad_status = 0 then 'OK' else 'FAIL' end,
      format('bad_required=%s, bad_role=%s, bad_status=%s', v_bad_required, v_bad_role, v_bad_status)
    );
  end if;

  execute $sql$
    select count(*)::bigint, coalesce(sum(row_count - 1), 0)::bigint
    from (
      select count(*)::bigint as row_count
      from public.subject_teacher_assignments
      where status = 'active'
        and deleted_at is null
      group by institution_id, workspace_key, subject_id, program_id, teacher_id
      having count(*) > 1
    ) duplicates
  $sql$
  into v_duplicate_groups, v_duplicate_rows;

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    50,
    'subject_teacher_assignments_active_duplicates',
    case when v_duplicate_groups = 0 then 'OK' else 'FAIL' end,
    format('duplicate_groups=%s, duplicate_extra_rows=%s', v_duplicate_groups, v_duplicate_rows)
  );

  with expected(expected_policy_name) as (
    values
      ('subject_teacher_assignments members read'),
      ('subject_teacher_assignments editors insert'),
      ('subject_teacher_assignments editors update'),
      ('subject_teacher_assignments editors delete')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from pg_policies policies
    where policies.schemaname = 'public'
      and policies.tablename = 'subject_teacher_assignments'
      and policies.policyname = expected.expected_policy_name
  );

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    60,
    'subject_teacher_assignments_rls_policies',
    case when v_found = 4 then 'OK' else 'FAIL' end,
    format('found=%s/4 expected read/insert/update/delete policies', v_found)
  );

  with expected(expected_privilege_type) as (
    values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from information_schema.table_privileges privileges
    where privileges.table_schema = 'public'
      and privileges.table_name = 'subject_teacher_assignments'
      and privileges.grantee = 'authenticated'
      and privileges.privilege_type = expected.expected_privilege_type
  );

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    70,
    'subject_teacher_assignments_authenticated_grants',
    case when v_found = 4 then 'OK' else 'FAIL' end,
    format('found=%s/4 expected SELECT/INSERT/UPDATE/DELETE grants', v_found)
  );

  select count(*)::integer
  into v_found
  from information_schema.routines routines
  where routines.specific_schema = 'public'
    and routines.routine_name in (
      'academic_resolve_member_profile_by_email',
      'academic_create_teacher_subject_leave',
      'academic_update_teacher_assignment_condition'
    );

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    80,
    'assignment_rpcs_present',
    case when v_found = 3 then 'OK' else 'FAIL' end,
    format('found=%s/3 expected RPCs', v_found)
  );

  with expected(expected_signature) as (
    values
      ('public.academic_resolve_member_profile_by_email(uuid,text,text,text)'),
      ('public.academic_create_teacher_subject_leave(uuid,text,uuid[],uuid,uuid,date,date,text)'),
      ('public.academic_update_teacher_assignment_condition(uuid,text)')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from information_schema.routine_privileges privileges
    where privileges.specific_schema = 'public'
      and privileges.grantee = 'authenticated'
      and privileges.routine_name = split_part(split_part(expected.expected_signature, '.', 2), '(', 1)
      and privileges.privilege_type = 'EXECUTE'
  );

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    90,
    'assignment_rpcs_authenticated_grants',
    case when v_found = 3 then 'OK' else 'FAIL' end,
    format('found=%s/3 expected EXECUTE grants', v_found)
  );

  select count(distinct triggers.trigger_name)::integer
  into v_found
  from information_schema.triggers triggers
  where triggers.trigger_schema = 'public'
    and triggers.event_object_table = 'subject_teacher_assignments'
    and triggers.trigger_name = 'touch_subject_teacher_assignments_updated_at';

  insert into pg_temp.stage4_assignments_verify_summary(sort_order, check_name, status, detail)
  values (
    100,
    'subject_teacher_assignments_updated_at_trigger',
    case when v_found = 1 then 'OK' else 'FAIL' end,
    format('found=%s/1 expected touch trigger', v_found)
  );
end $$;

select check_name, status, detail
from pg_temp.stage4_assignments_verify_summary
order by sort_order, check_name;
