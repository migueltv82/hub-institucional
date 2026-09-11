-- ============================================================
-- HUB-INSTITUCIONAL - RESUMEN VERIFICACION ETAPA 5
-- Ejecutar en Supabase SQL Editor despues de:
-- supabase/schema/07_academic_operations.sql
--
-- Este archivo no modifica datos permanentes. Usa una tabla temporal y devuelve
-- una sola grilla final con OK / FAIL.
-- ============================================================

drop table if exists pg_temp.stage5_academic_operations_verify_summary;

create temp table pg_temp.stage5_academic_operations_verify_summary (
  sort_order integer primary key,
  check_name text not null,
  status text not null,
  detail text not null
);

do $$
declare
  spec record;
  v_sort_order integer := 10;
  v_missing text;
  v_found integer;
  v_bad_required bigint;
  v_bad_status bigint;
  v_bad_numeric bigint;
  v_duplicate_groups bigint;
  v_duplicate_rows bigint;
begin
  for spec in
    select *
    from (
      values
        ('subject_enrollments', array[
          'id', 'institution_id', 'workspace_key', 'subject_id', 'program_id',
          'student_id', 'student_record_id', 'status', 'enrolled_at', 'dropped_at',
          'deleted_at', 'legacy_snapshot_id', 'lock_version', 'metadata', 'created_at', 'updated_at'
        ]::text[]),
        ('student_grades', array[
          'id', 'institution_id', 'workspace_key', 'student_id', 'student_record_id',
          'subject_enrollment_id', 'exam_enrollment_id', 'subject_id', 'program_id',
          'teacher_id', 'teacher_record_id', 'grade_type', 'grade_value', 'grade_label',
          'grade_scale', 'academic_status', 'observations', 'grading_period',
          'attempt_number', 'legacy_snapshot_id', 'lock_version', 'deleted_at',
          'created_at', 'updated_at'
        ]::text[]),
        ('subject_class_sessions', array[
          'id', 'institution_id', 'workspace_key', 'subject_id', 'program_id',
          'teacher_id', 'session_date', 'topic', 'notes', 'created_at', 'updated_at'
        ]::text[]),
        ('subject_attendance_records', array[
          'id', 'institution_id', 'workspace_key', 'session_id', 'student_id',
          'subject_enrollment_id', 'status', 'observations', 'created_at', 'updated_at'
        ]::text[]),
        ('student_financial_status', array[
          'id', 'institution_id', 'workspace_key', 'student_record_id',
          'adeuda_cuota', 'note', 'updated_at', 'created_at'
        ]::text[])
    ) as specs(target_table, required_columns)
  loop
    select string_agg(required.column_name, ', ' order by required.column_name)
    into v_missing
    from unnest(spec.required_columns) as required(column_name)
    where not exists (
      select 1
      from information_schema.columns columns
      where columns.table_schema = 'public'
        and columns.table_name = spec.target_table
        and columns.column_name = required.column_name
    );

    insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
    values (
      v_sort_order,
      spec.target_table || '_columns',
      case when v_missing is null then 'OK' else 'FAIL' end,
      coalesce('faltan columnas: ' || v_missing, 'columnas esperadas presentes')
    );

    v_sort_order := v_sort_order + 1;
  end loop;

  with expected(expected_table_name, expected_index_name) as (
    values
      ('subject_enrollments', 'subject_enrollments_current_key'),
      ('student_grades', 'student_grades_current_key'),
      ('subject_class_sessions', 'subject_class_sessions_current_key'),
      ('subject_attendance_records', 'subject_attendance_records_current_key'),
      ('student_financial_status', 'student_financial_status_workspace_key')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from pg_indexes indexes
    where indexes.schemaname = 'public'
      and indexes.tablename = expected.expected_table_name
      and indexes.indexname = expected.expected_index_name
  );

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    30,
    'academic_operations_unique_indexes',
    case when v_found = 5 then 'OK' else 'FAIL' end,
    format('found=%s/5 expected unique indexes', v_found)
  );

  select count(distinct triggers.event_object_table)::integer
  into v_found
  from information_schema.triggers triggers
  where triggers.trigger_schema = 'public'
    and triggers.trigger_name = 'touch_academic_operations_updated_at'
    and triggers.event_object_table in (
      'subject_enrollments',
      'student_grades',
      'subject_class_sessions',
      'subject_attendance_records',
      'student_financial_status'
    );

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    40,
    'academic_operations_updated_at_triggers',
    case when v_found = 5 then 'OK' else 'FAIL' end,
    format('found=%s/5 expected touch triggers', v_found)
  );

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
          or student_id is null
          or status is null
          or btrim(status) = ''
          or enrolled_at is null
          or lock_version is null
          or metadata is null
          or created_at is null
          or updated_at is null
      )::bigint,
      count(*) filter (where status not in ('active', 'enrolled', 'dropped', 'pending'))::bigint,
      count(*) filter (where lock_version < 1)::bigint
    from public.subject_enrollments
  $sql$
  into v_bad_required, v_bad_status, v_bad_numeric;

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    50,
    'subject_enrollments_required_fields',
    case when v_bad_required = 0 and v_bad_status = 0 and v_bad_numeric = 0 then 'OK' else 'FAIL' end,
    format('bad_required=%s, bad_status=%s, bad_lock_version=%s', v_bad_required, v_bad_status, v_bad_numeric)
  );

  execute $sql$
    select
      count(*) filter (
        where id is null
          or institution_id is null
          or workspace_key is null
          or btrim(workspace_key) = ''
          or student_id is null
          or subject_id is null
          or btrim(subject_id) = ''
          or program_id is null
          or grade_type is null
          or btrim(grade_type) = ''
          or grade_label is null
          or grade_scale is null
          or btrim(grade_scale) = ''
          or academic_status is null
          or btrim(academic_status) = ''
          or observations is null
          or grading_period is null
          or attempt_number is null
          or lock_version is null
          or created_at is null
          or updated_at is null
      )::bigint,
      count(*) filter (where grade_value is not null and (grade_value < 0 or grade_value > 10))::bigint,
      count(*) filter (where attempt_number < 1 or lock_version < 1)::bigint
    from public.student_grades
  $sql$
  into v_bad_required, v_bad_status, v_bad_numeric;

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    60,
    'student_grades_required_fields',
    case when v_bad_required = 0 and v_bad_status = 0 and v_bad_numeric = 0 then 'OK' else 'FAIL' end,
    format('bad_required=%s, bad_grade_value=%s, bad_attempt_or_lock=%s', v_bad_required, v_bad_status, v_bad_numeric)
  );

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
          or session_date is null
          or topic is null
          or notes is null
          or created_at is null
          or updated_at is null
      )::bigint
    from public.subject_class_sessions
  $sql$
  into v_bad_required;

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    70,
    'subject_class_sessions_required_fields',
    case when v_bad_required = 0 then 'OK' else 'FAIL' end,
    format('bad_required=%s', v_bad_required)
  );

  execute $sql$
    select
      count(*) filter (
        where id is null
          or institution_id is null
          or workspace_key is null
          or btrim(workspace_key) = ''
          or session_id is null
          or student_id is null
          or status is null
          or btrim(status) = ''
          or observations is null
          or created_at is null
          or updated_at is null
      )::bigint,
      count(*) filter (where status not in ('present', 'absent', 'late', 'justified'))::bigint
    from public.subject_attendance_records
  $sql$
  into v_bad_required, v_bad_status;

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    80,
    'subject_attendance_records_required_fields',
    case when v_bad_required = 0 and v_bad_status = 0 then 'OK' else 'FAIL' end,
    format('bad_required=%s, bad_status=%s', v_bad_required, v_bad_status)
  );

  execute $sql$
    select
      count(*) filter (
        where id is null
          or institution_id is null
          or workspace_key is null
          or btrim(workspace_key) = ''
          or student_record_id is null
          or adeuda_cuota is null
          or note is null
          or updated_at is null
          or created_at is null
      )::bigint
    from public.student_financial_status
  $sql$
  into v_bad_required;

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    90,
    'student_financial_status_required_fields',
    case when v_bad_required = 0 then 'OK' else 'FAIL' end,
    format('bad_required=%s', v_bad_required)
  );

  execute $sql$
    select count(*)::bigint, coalesce(sum(row_count - 1), 0)::bigint
    from (
      select count(*)::bigint as row_count
      from public.subject_enrollments
      group by institution_id, workspace_key, subject_id, program_id, student_id
      having count(*) > 1
    ) duplicates
  $sql$
  into v_duplicate_groups, v_duplicate_rows;

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    100,
    'subject_enrollments_duplicates',
    case when v_duplicate_groups = 0 then 'OK' else 'FAIL' end,
    format('duplicate_groups=%s, duplicate_extra_rows=%s', v_duplicate_groups, v_duplicate_rows)
  );

  execute $sql$
    select count(*)::bigint, coalesce(sum(row_count - 1), 0)::bigint
    from (
      select count(*)::bigint as row_count
      from public.student_grades
      where deleted_at is null
      group by institution_id, workspace_key, student_id, subject_id, program_id, grade_type, attempt_number
      having count(*) > 1
    ) duplicates
  $sql$
  into v_duplicate_groups, v_duplicate_rows;

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    110,
    'student_grades_active_duplicates',
    case when v_duplicate_groups = 0 then 'OK' else 'FAIL' end,
    format('duplicate_groups=%s, duplicate_extra_rows=%s', v_duplicate_groups, v_duplicate_rows)
  );

  with expected(expected_function_name) as (
    values
      ('upsert_subject_enrollment_from_portal'),
      ('academic_teacher_create_class_session'),
      ('academic_teacher_upsert_attendance_records'),
      ('academic_teacher_upsert_student_grade')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from information_schema.routines routines
    where routines.specific_schema = 'public'
      and routines.routine_name = expected.expected_function_name
  );

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    120,
    'academic_operations_rpcs_present',
    case when v_found = 4 then 'OK' else 'FAIL' end,
    format('found=%s/4 expected RPCs', v_found)
  );

  with expected(expected_function_name) as (
    values
      ('upsert_subject_enrollment_from_portal'),
      ('academic_teacher_create_class_session'),
      ('academic_teacher_upsert_attendance_records'),
      ('academic_teacher_upsert_student_grade')
  )
  select count(distinct expected.expected_function_name)::integer
  into v_found
  from expected
  where exists (
    select 1
    from information_schema.routine_privileges privileges
    where privileges.specific_schema = 'public'
      and privileges.grantee = 'authenticated'
      and privileges.routine_name = expected.expected_function_name
      and privileges.privilege_type = 'EXECUTE'
  );

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    130,
    'academic_operations_rpcs_authenticated_grants',
    case when v_found = 4 then 'OK' else 'FAIL' end,
    format('found=%s/4 expected EXECUTE grants', v_found)
  );

  with expected(expected_table_name, expected_policy_name) as (
    select expected_tables.target_table, expected_tables.target_table || ' members read'
    from unnest(array[
      'subject_enrollments',
      'student_grades',
      'subject_class_sessions',
      'subject_attendance_records',
      'student_financial_status'
    ]::text[]) as expected_tables(target_table)
    union all
    select expected_tables.target_table, expected_tables.target_table || ' editors insert'
    from unnest(array[
      'subject_enrollments',
      'student_grades',
      'subject_class_sessions',
      'subject_attendance_records',
      'student_financial_status'
    ]::text[]) as expected_tables(target_table)
    union all
    select expected_tables.target_table, expected_tables.target_table || ' editors update'
    from unnest(array[
      'subject_enrollments',
      'student_grades',
      'subject_class_sessions',
      'subject_attendance_records',
      'student_financial_status'
    ]::text[]) as expected_tables(target_table)
    union all
    select expected_tables.target_table, expected_tables.target_table || ' editors delete'
    from unnest(array[
      'subject_enrollments',
      'student_grades',
      'subject_class_sessions',
      'subject_attendance_records',
      'student_financial_status'
    ]::text[]) as expected_tables(target_table)
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from pg_policies policies
    where policies.schemaname = 'public'
      and policies.tablename = expected.expected_table_name
      and policies.policyname = expected.expected_policy_name
  );

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    140,
    'academic_operations_rls_policies',
    case when v_found = 20 then 'OK' else 'FAIL' end,
    format('found=%s/20 expected read/insert/update/delete policies', v_found)
  );

  with expected(expected_table_name, expected_privilege_type) as (
    select expected_tables.target_table, expected_privileges.privilege_type
    from unnest(array[
      'subject_enrollments',
      'student_grades',
      'subject_class_sessions',
      'subject_attendance_records',
      'student_financial_status'
    ]::text[]) as expected_tables(target_table)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]) as expected_privileges(privilege_type)
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

  insert into pg_temp.stage5_academic_operations_verify_summary(sort_order, check_name, status, detail)
  values (
    150,
    'academic_operations_authenticated_grants',
    case when v_found = 20 then 'OK' else 'FAIL' end,
    format('found=%s/20 expected SELECT/INSERT/UPDATE/DELETE grants', v_found)
  );
end $$;

select check_name, status, detail
from pg_temp.stage5_academic_operations_verify_summary
order by sort_order, check_name;
