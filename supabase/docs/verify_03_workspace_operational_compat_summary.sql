-- ============================================================
-- HUB-INSTITUCIONAL - RESUMEN VERIFICACION ETAPA 3
-- Ejecutar en Supabase SQL Editor despues de:
-- supabase/schema/05_workspace_operational_compat.sql
--
-- Este archivo no modifica datos permanentes. Usa una tabla temporal y devuelve
-- una sola grilla final con OK / FAIL / MISSING_COLUMN.
-- ============================================================

drop table if exists pg_temp.stage3_operational_verify_summary;

create temp table pg_temp.stage3_operational_verify_summary (
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
  v_duplicate_groups bigint;
  v_duplicate_rows bigint;
  v_missing_workspace_key bigint;
  v_missing_identity bigint;
  v_missing_display_name bigint;
  v_missing_raw_payload bigint;
  v_missing_updated_at bigint;
  v_invalid_hours bigint;
  v_test_institution_id uuid;
begin
  for spec in
    select *
    from (
      values
        (
          'workspace_source_files',
          array[
            'institution_id',
            'workspace_key',
            'dataset_key',
            'file_name',
            'mime_type',
            'file_extension',
            'file_size',
            'storage_bucket',
            'storage_path',
            'file_base64',
            'updated_at'
          ]::text[]
        ),
        (
          'teacher_availability_records',
          array[
            'id',
            'institution_id',
            'workspace_key',
            'teacher_record_id',
            'teacher_identity',
            'teacher_display_name',
            'teacher_name',
            'teacher_dni',
            'day_of_week',
            'shift',
            'start_time',
            'end_time',
            'is_available',
            'reason',
            'status',
            'valid_from',
            'valid_until',
            'source',
            'raw_payload',
            'created_at',
            'updated_at'
          ]::text[]
        ),
        (
          'teacher_workload_records',
          array[
            'id',
            'institution_id',
            'workspace_key',
            'teacher_record_id',
            'teacher_identity',
            'teacher_display_name',
            'teacher_name',
            'teacher_dni',
            'program_id',
            'career_name',
            'plan_id',
            'subject_id',
            'subject_name',
            'academic_year',
            'role',
            'titularity',
            'teaching_hours',
            'status',
            'valid_from',
            'valid_until',
            'source',
            'raw_payload',
            'created_at',
            'updated_at'
          ]::text[]
        ),
        (
          'legacy_subjects_catalog',
          array[
            'institution_id',
            'workspace_key',
            'subject_id',
            'program_id',
            'year_level',
            'name',
            'updated_at'
          ]::text[]
        ),
        (
          'legacy_subject_prerequisites',
          array[
            'id',
            'institution_id',
            'workspace_key',
            'subject_id',
            'program_id',
            'prerequisite_subject_id',
            'is_immediate',
            'updated_at'
          ]::text[]
        ),
        (
          'legacy_exam_sessions',
          array[
            'institution_id',
            'workspace_key',
            'exam_table_id',
            'subject_id',
            'program_id',
            'exam_date',
            'call_label',
            'updated_at'
          ]::text[]
        )
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

    insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
    values (
      v_sort_order,
      spec.target_table || '_columns',
      case when v_missing is null then 'OK' else 'FAIL' end,
      coalesce('faltan columnas: ' || v_missing, 'columnas esperadas presentes')
    );

    v_sort_order := v_sort_order + 1;
  end loop;
end $$;

do $$
declare
  v_found integer;
  v_duplicate_groups bigint;
  v_duplicate_rows bigint;
  v_missing_workspace_key bigint;
  v_missing_identity bigint;
  v_missing_display_name bigint;
  v_missing_raw_payload bigint;
  v_missing_updated_at bigint;
  v_invalid_hours bigint;
  v_test_institution_id uuid;
begin
  with expected(expected_table_name, expected_constraint_name) as (
    values
      ('workspace_source_files', 'workspace_source_files_pkey'),
      ('teacher_availability_records', 'teacher_availability_records_pkey'),
      ('teacher_availability_records', 'teacher_availability_records_workspace_key'),
      ('teacher_workload_records', 'teacher_workload_records_pkey'),
      ('teacher_workload_records', 'teacher_workload_records_workspace_key'),
      ('legacy_subjects_catalog', 'legacy_subjects_catalog_pkey'),
      ('legacy_subject_prerequisites', 'legacy_subject_prerequisites_pkey'),
      ('legacy_subject_prerequisites', 'legacy_subject_prerequisites_workspace_key'),
      ('legacy_exam_sessions', 'legacy_exam_sessions_pkey')
  )
  select count(*)::integer
  into v_found
  from expected
  where exists (
    select 1
    from pg_constraint constraints
    where constraints.conrelid = to_regclass('public.' || expected.expected_table_name)
      and constraints.conname = expected.expected_constraint_name
  );

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    30,
    'operational_constraints',
    case when v_found = 9 then 'OK' else 'FAIL' end,
    format('found=%s/9 expected primary/unique constraints', v_found)
  );

  select count(distinct triggers.event_object_table)::integer
  into v_found
  from information_schema.triggers triggers
  where triggers.trigger_schema = 'public'
    and triggers.trigger_name = 'touch_workspace_operational_updated_at'
    and triggers.event_object_table in (
      'workspace_source_files',
      'teacher_availability_records',
      'teacher_workload_records',
      'legacy_subjects_catalog',
      'legacy_subject_prerequisites',
      'legacy_exam_sessions'
    );

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    40,
    'operational_updated_at_triggers',
    case when v_found = 6 then 'OK' else 'FAIL' end,
    format('found=%s/6 expected touch triggers', v_found)
  );

  execute $sql$
    select
      count(*) filter (where workspace_key is null or btrim(workspace_key) = '')::bigint,
      count(*) filter (where teacher_identity is null or btrim(teacher_identity) = '')::bigint,
      count(*) filter (where teacher_display_name is null or btrim(teacher_display_name) = '')::bigint,
      count(*) filter (where raw_payload is null)::bigint,
      count(*) filter (where updated_at is null)::bigint
    from public.teacher_availability_records
  $sql$
  into v_missing_workspace_key, v_missing_identity, v_missing_display_name, v_missing_raw_payload, v_missing_updated_at;

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    50,
    'teacher_availability_required_fields',
    case when v_missing_workspace_key + v_missing_identity + v_missing_display_name + v_missing_raw_payload + v_missing_updated_at = 0 then 'OK' else 'FAIL' end,
    format(
      'missing_workspace_key=%s, missing_identity=%s, missing_display_name=%s, missing_raw_payload=%s, missing_updated_at=%s',
      v_missing_workspace_key,
      v_missing_identity,
      v_missing_display_name,
      v_missing_raw_payload,
      v_missing_updated_at
    )
  );

  execute $sql$
    select
      count(*) filter (where workspace_key is null or btrim(workspace_key) = '')::bigint,
      count(*) filter (where teacher_identity is null or btrim(teacher_identity) = '')::bigint,
      count(*) filter (where teacher_display_name is null or btrim(teacher_display_name) = '')::bigint,
      count(*) filter (where raw_payload is null)::bigint,
      count(*) filter (where updated_at is null)::bigint,
      count(*) filter (where teaching_hours is null or teaching_hours <= 0)::bigint
    from public.teacher_workload_records
  $sql$
  into v_missing_workspace_key, v_missing_identity, v_missing_display_name, v_missing_raw_payload, v_missing_updated_at, v_invalid_hours;

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    60,
    'teacher_workload_required_fields',
    case when v_missing_workspace_key + v_missing_identity + v_missing_display_name + v_missing_raw_payload + v_missing_updated_at + v_invalid_hours = 0 then 'OK' else 'FAIL' end,
    format(
      'missing_workspace_key=%s, missing_identity=%s, missing_display_name=%s, missing_raw_payload=%s, missing_updated_at=%s, invalid_hours=%s',
      v_missing_workspace_key,
      v_missing_identity,
      v_missing_display_name,
      v_missing_raw_payload,
      v_missing_updated_at,
      v_invalid_hours
    )
  );

  execute $sql$
    select count(*)::bigint, coalesce(sum(row_count - 1), 0)::bigint
    from (
      select count(*)::bigint as row_count
      from public.teacher_availability_records
      group by institution_id, workspace_key, teacher_identity, day_of_week, shift, start_time, end_time, valid_from, valid_until
      having count(*) > 1
    ) duplicates
  $sql$
  into v_duplicate_groups, v_duplicate_rows;

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    70,
    'teacher_availability_duplicates',
    case when v_duplicate_groups = 0 then 'OK' else 'FAIL' end,
    format('duplicate_groups=%s, duplicate_extra_rows=%s', v_duplicate_groups, v_duplicate_rows)
  );

  execute $sql$
    select count(*)::bigint, coalesce(sum(row_count - 1), 0)::bigint
    from (
      select count(*)::bigint as row_count
      from public.teacher_workload_records
      group by institution_id, workspace_key, teacher_identity, program_id, plan_id, subject_id, valid_from, valid_until
      having count(*) > 1
    ) duplicates
  $sql$
  into v_duplicate_groups, v_duplicate_rows;

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    80,
    'teacher_workload_duplicates',
    case when v_duplicate_groups = 0 then 'OK' else 'FAIL' end,
    format('duplicate_groups=%s, duplicate_extra_rows=%s', v_duplicate_groups, v_duplicate_rows)
  );

  execute $sql$
    select count(*)::bigint, coalesce(sum(row_count - 1), 0)::bigint
    from (
      select count(*)::bigint as row_count
      from public.legacy_subject_prerequisites
      group by institution_id, workspace_key, subject_id, program_id, prerequisite_subject_id
      having count(*) > 1
    ) duplicates
  $sql$
  into v_duplicate_groups, v_duplicate_rows;

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    90,
    'legacy_subject_prerequisites_duplicates',
    case when v_duplicate_groups = 0 then 'OK' else 'FAIL' end,
    format('duplicate_groups=%s, duplicate_extra_rows=%s', v_duplicate_groups, v_duplicate_rows)
  );

  with expected(expected_table_name, expected_policy_name) as (
    select expected_tables.target_table, expected_tables.target_table || ' members read'
    from unnest(array[
      'workspace_source_files',
      'teacher_availability_records',
      'teacher_workload_records',
      'legacy_subjects_catalog',
      'legacy_subject_prerequisites',
      'legacy_exam_sessions'
    ]::text[]) as expected_tables(target_table)
    union all
    select expected_tables.target_table, expected_tables.target_table || ' editors insert'
    from unnest(array[
      'workspace_source_files',
      'teacher_availability_records',
      'teacher_workload_records',
      'legacy_subjects_catalog',
      'legacy_subject_prerequisites',
      'legacy_exam_sessions'
    ]::text[]) as expected_tables(target_table)
    union all
    select expected_tables.target_table, expected_tables.target_table || ' editors update'
    from unnest(array[
      'workspace_source_files',
      'teacher_availability_records',
      'teacher_workload_records',
      'legacy_subjects_catalog',
      'legacy_subject_prerequisites',
      'legacy_exam_sessions'
    ]::text[]) as expected_tables(target_table)
    union all
    select expected_tables.target_table, expected_tables.target_table || ' editors delete'
    from unnest(array[
      'workspace_source_files',
      'teacher_availability_records',
      'teacher_workload_records',
      'legacy_subjects_catalog',
      'legacy_subject_prerequisites',
      'legacy_exam_sessions'
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

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    100,
    'operational_rls_policies',
    case when v_found = 24 then 'OK' else 'FAIL' end,
    format('found=%s/24 expected read/insert/update/delete policies', v_found)
  );

  with expected(expected_table_name, expected_privilege_type) as (
    select expected_tables.target_table, expected_privileges.privilege_type
    from unnest(array[
      'workspace_source_files',
      'teacher_availability_records',
      'teacher_workload_records',
      'legacy_subjects_catalog',
      'legacy_subject_prerequisites',
      'legacy_exam_sessions'
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

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    110,
    'operational_authenticated_grants',
    case when v_found = 24 then 'OK' else 'FAIL' end,
    format('found=%s/24 expected SELECT/INSERT/UPDATE/DELETE grants', v_found)
  );

  select count(*)::integer
  into v_found
  from storage.buckets buckets
  where buckets.id = 'workspace-source-files'
    and buckets.name = 'workspace-source-files'
    and buckets."public" = false;

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    120,
    'workspace_source_files_bucket',
    case when v_found = 1 then 'OK' else 'FAIL' end,
    format('found=%s/1 private bucket workspace-source-files', v_found)
  );

  select count(*)::integer
  into v_found
  from pg_policies policies
  where policies.schemaname = 'storage'
    and policies.tablename = 'objects'
    and policies.policyname in (
      'workspace source files members read objects',
      'workspace source files editors insert objects',
      'workspace source files editors update objects',
      'workspace source files editors delete objects'
    );

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    130,
    'workspace_source_files_storage_policies',
    case when v_found = 4 then 'OK' else 'FAIL' end,
    format('found=%s/4 expected storage.objects policies', v_found)
  );

  if to_regprocedure('public.storage_object_institution_id(text)') is null then
    insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
    values (140, 'storage_object_institution_id_helper', 'FAIL', 'missing public.storage_object_institution_id(text)');
  else
    execute $sql$
      select public.storage_object_institution_id('00000000-0000-0000-0000-000000000000/main/prueba.xlsx')
    $sql$
    into v_test_institution_id;

    insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
    values (
      140,
      'storage_object_institution_id_helper',
      case when v_test_institution_id = '00000000-0000-0000-0000-000000000000'::uuid then 'OK' else 'FAIL' end,
      coalesce(v_test_institution_id::text, 'helper returned null')
    );
  end if;

  select count(*)::integer
  into v_found
  from information_schema.columns columns
  where columns.table_schema = 'public'
    and columns.table_name = 'legacy_exam_sessions'
    and columns.column_name = 'exam_date'
    and columns.data_type = 'text';

  insert into pg_temp.stage3_operational_verify_summary(sort_order, check_name, status, detail)
  values (
    150,
    'legacy_exam_sessions_exam_date_type',
    case when v_found = 1 then 'OK' else 'FAIL' end,
    case when v_found = 1 then 'exam_date=text accepts UI timestamps' else 'exam_date should be text for UI timestamp compatibility' end
  );
end $$;

select check_name, status, detail
from pg_temp.stage3_operational_verify_summary
order by sort_order, check_name;
