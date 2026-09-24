-- Student portal exam visibility verification.
--
-- Read-only test script for staging or a prepared test institution.
-- Do not run against production unless the referenced users and institution
-- are explicitly prepared for verification.
--
-- Required prepared actors:
-- - :institution_id
-- - :workspace_key
-- - :regular_student_user_id
-- - :non_regular_student_user_id
-- - :other_career_student_user_id
-- - :without_subject_student_user_id
-- - :multi_career_student_user_id
-- - :other_institution_student_user_id
--
-- The script assumes psql variables. Replace :'name' placeholders manually
-- if using the Supabase SQL editor.

begin read only;

select set_config('app.test_institution_id', :'institution_id', true);
select set_config('app.test_workspace_key', :'workspace_key', true);

-- 1. Alumno regular: every returned exam table must have at least one
-- regular subject in one of the student's active careers/plans.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'regular_student_user_id', true);

with response as (
  select payload
  from public.get_student_portal_workspace_snapshot(
    current_setting('app.test_institution_id')::uuid,
    current_setting('app.test_workspace_key')::text
  )
),
visible_exams as (
  select
    row_number() over () as exam_order,
    exam_row,
    regexp_replace(lower(concat_ws(
      ' ',
      exam_row->>'codigo',
      exam_row->>'materia',
      exam_row->>'subject_id',
      exam_row->>'canonical_subject_id',
      exam_row->>'materia_id'
    )), '[^a-z0-9]+', ' ', 'g') as subject_search_text,
    regexp_replace(lower(coalesce(exam_row->>'carrera', '')), '[^a-z0-9]+', '', 'g') as career_key,
    regexp_replace(lower(coalesce(
      exam_row->>'estadoFinal',
      exam_row->>'estado',
      exam_row->>'status',
      exam_row->>'publication_status',
      ''
    )), '[^a-z0-9]+', '', 'g') as status_key,
    regexp_replace(
      regexp_replace(lower(coalesce(exam_row->>'id', '')), '^exam-engine-v21-', ''),
      '-[0-9]{4}-[0-9]{2}-[0-9]{2}$',
      ''
    ) as normalized_exam_table_id
  from response
  cross join lateral jsonb_array_elements(coalesce(payload->'cronograma', '[]'::jsonb)) exam_row
),
visible_exam_subjects as (
  select distinct
    visible_exams.exam_order,
    subject.id as subject_uuid,
    upper(btrim(subject.code)) as subject_code
  from visible_exams
  join public.subjects subject
    on subject.institution_id = current_setting('app.test_institution_id')::uuid
   and (
     visible_exams.exam_row->>'subject_id' = subject.id::text
     or visible_exams.exam_row->>'canonical_subject_id' = subject.id::text
     or visible_exams.exam_row->>'materia_id' = subject.id::text
     or position(
       ' ' || btrim(regexp_replace(lower(subject.code), '[^a-z0-9]+', ' ', 'g')) || ' '
       in ' ' || visible_exams.subject_search_text || ' '
     ) > 0
   )
),
latest_statuses as (
  select distinct on (status_row.student_career_plan_id, status_row.plan_subject_id)
    status_row.*
  from public.profiles profile
  join public.student_records student
    on student.institution_id = current_setting('app.test_institution_id')::uuid
   and (
     student.profile_id = profile.user_id
     or (
       student.profile_id is null
       and nullif(btrim(coalesce(student.email, '')), '') is not null
       and nullif(btrim(coalesce(profile.email, '')), '') is not null
       and lower(btrim(student.email)) = lower(btrim(profile.email))
     )
   )
   and coalesce(nullif(btrim(student.workspace_key), ''), 'main') = current_setting('app.test_workspace_key')
  join public.student_career_plans scp
    on scp.institution_id = student.institution_id
   and scp.student_id = student.id
   and scp.status = 'active'
   and (scp.valid_from is null or scp.valid_from <= current_date)
   and (scp.valid_until is null or scp.valid_until >= current_date)
  join public.student_academic_statuses status_row
    on status_row.institution_id = scp.institution_id
   and status_row.student_career_plan_id = scp.id
  where profile.user_id = :'regular_student_user_id'::uuid
  order by status_row.student_career_plan_id, status_row.plan_subject_id, status_row.recorded_at desc, status_row.id desc
),
regular_subjects as (
  select distinct
    subject.id as subject_uuid,
    upper(btrim(subject.code)) as subject_code,
    scp.career_id,
    career.name as career_name
  from latest_statuses latest
  join public.student_career_plans scp
    on scp.institution_id = latest.institution_id
   and scp.id = latest.student_career_plan_id
  join public.study_plan_subjects sps
    on sps.institution_id = latest.institution_id
   and sps.id = latest.plan_subject_id
   and sps.plan_id = scp.plan_id
  join public.subjects subject
    on subject.institution_id = sps.institution_id
   and subject.id = sps.subject_id
  join public.careers career
    on career.institution_id = scp.institution_id
   and career.id = scp.career_id
  where latest.condition = 'regular'
    and latest.regularity_valid is distinct from false
)
select
  'regular_student_each_exam_has_regular_subject' as test_name,
  case
    when exists (select 1 from visible_exams)
     and not exists (
       select 1
       from visible_exams visible
       where not exists (
         select 1
         from visible_exam_subjects visible_subject
         join regular_subjects regular
           on regular.subject_uuid = visible_subject.subject_uuid
         where visible_subject.exam_order = visible.exam_order
           and (
             (
               visible.career_key in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
               and nullif(btrim(coalesce(visible.exam_row->>'carreraId', '')), '') is null
               and nullif(btrim(coalesce(visible.exam_row->>'career_id', '')), '') is null
               and nullif(btrim(coalesce(visible.exam_row->>'program_id', '')), '') is null
               and nullif(btrim(coalesce(visible.exam_row->>'canonical_program_id', '')), '') is null
             )
             or (
               (
                 visible.career_key not in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
                 or nullif(btrim(coalesce(visible.exam_row->>'carreraId', '')), '') is not null
                 or nullif(btrim(coalesce(visible.exam_row->>'career_id', '')), '') is not null
                 or nullif(btrim(coalesce(visible.exam_row->>'program_id', '')), '') is not null
                 or nullif(btrim(coalesce(visible.exam_row->>'canonical_program_id', '')), '') is not null
               )
               and (
                 visible.career_key in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
                 or visible.career_key = regexp_replace(lower(regular.career_name), '[^a-z0-9]+', '', 'g')
               )
               and not exists (
                 select 1
                 from unnest(array[
                   visible.exam_row->>'carreraId',
                   visible.exam_row->>'career_id',
                   visible.exam_row->>'program_id',
                   visible.exam_row->>'canonical_program_id'
                 ]) as career_value(raw_value)
                 where nullif(btrim(coalesce(career_value.raw_value, '')), '') is not null
                   and btrim(career_value.raw_value) <> regular.career_id::text
                   and regexp_replace(lower(btrim(career_value.raw_value)), '[^a-z0-9]+', '', 'g') <> regexp_replace(lower(regular.career_name), '[^a-z0-9]+', '', 'g')
               )
               and (
                 (
                   visible.career_key not in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
                   and visible.career_key = regexp_replace(lower(regular.career_name), '[^a-z0-9]+', '', 'g')
                 )
                 or exists (
                   select 1
                   from unnest(array[
                     visible.exam_row->>'carreraId',
                     visible.exam_row->>'career_id',
                     visible.exam_row->>'program_id',
                     visible.exam_row->>'canonical_program_id'
                   ]) as career_value(raw_value)
                   where nullif(btrim(coalesce(career_value.raw_value, '')), '') is not null
                     and (
                       btrim(career_value.raw_value) = regular.career_id::text
                       or regexp_replace(lower(btrim(career_value.raw_value)), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(regular.career_name), '[^a-z0-9]+', '', 'g')
                     )
                 )
               )
             )
           )
       )
     )
     and not exists (
       select 1
       from visible_exams visible
       where visible.status_key not in (
         'aprobada',
         'aprobado',
         'confirmed',
         'confirmada',
         'confirmado',
         'final',
         'finalconfirmed',
         'finalconfirmedminimum',
         'finalizada',
         'finalizado',
         'oficial',
         'oficializada',
         'oficializado',
         'published',
         'publishedtostudents',
         'publicada',
         'publicado',
         'tribunalcomplete',
         'tribunalminimum'
       )
       and lower(btrim(coalesce(visible.exam_row->>'confirmada', ''))) not in ('true', '1', 'si', 'sí', 'yes')
       and lower(btrim(coalesce(visible.exam_row->>'confirmed', ''))) not in ('true', '1', 'si', 'sí', 'yes')
     )
     and not exists (
       select 1
       from visible_exams visible
       join public.exam_teacher_assignments assignment
         on assignment.institution_id = current_setting('app.test_institution_id')::uuid
        and assignment.workspace_key = current_setting('app.test_workspace_key')
        and assignment.deleted_at is null
        and assignment.status = 'active'
        and assignment.confirmation_status <> 'confirmed'
        and lower(coalesce(assignment.exam_table_id, '')) = visible.normalized_exam_table_id
     )
    then 'PASS'
    else 'FAIL'
  end as result;

-- 2. Alumno no regular: must receive no exam table.
select set_config('request.jwt.claim.sub', :'non_regular_student_user_id', true);
select
  'non_regular_student_no_exams' as test_name,
  case
    when coalesce(jsonb_array_length(payload->'cronograma'), 0) = 0 then 'PASS'
    else 'FAIL'
  end as result
from public.get_student_portal_workspace_snapshot(
  current_setting('app.test_institution_id')::uuid,
  current_setting('app.test_workspace_key')::text
);

-- 3. Alumno de otra carrera: must not see this career's exam tables.
select set_config('request.jwt.claim.sub', :'other_career_student_user_id', true);
select
  'other_career_student_no_cross_career_exams' as test_name,
  case
    when coalesce(jsonb_array_length(payload->'cronograma'), 0) = 0 then 'PASS'
    else 'FAIL'
  end as result
from public.get_student_portal_workspace_snapshot(
  current_setting('app.test_institution_id')::uuid,
  current_setting('app.test_workspace_key')::text
);

-- 4. Alumno sin materia/estado regular: must receive no exam tables.
select set_config('request.jwt.claim.sub', :'without_subject_student_user_id', true);
select
  'student_without_regular_subject_no_exams' as test_name,
  case
    when coalesce(jsonb_array_length(payload->'cronograma'), 0) = 0 then 'PASS'
    else 'FAIL'
  end as result
from public.get_student_portal_workspace_snapshot(
  current_setting('app.test_institution_id')::uuid,
  current_setting('app.test_workspace_key')::text
);

-- 5. Alumno con varias carreras: every returned exam must match at least one
-- regular subject in a corresponding active career, not merely any subject code.
select set_config('request.jwt.claim.sub', :'multi_career_student_user_id', true);
with response as (
  select payload
  from public.get_student_portal_workspace_snapshot(
    current_setting('app.test_institution_id')::uuid,
    current_setting('app.test_workspace_key')::text
  )
),
visible_exams as (
  select
    row_number() over () as exam_order,
    exam_row,
    regexp_replace(lower(concat_ws(
      ' ',
      exam_row->>'codigo',
      exam_row->>'materia',
      exam_row->>'subject_id',
      exam_row->>'canonical_subject_id',
      exam_row->>'materia_id'
    )), '[^a-z0-9]+', ' ', 'g') as subject_search_text,
    regexp_replace(lower(coalesce(exam_row->>'carrera', '')), '[^a-z0-9]+', '', 'g') as career_key,
    regexp_replace(lower(coalesce(
      exam_row->>'estadoFinal',
      exam_row->>'estado',
      exam_row->>'status',
      exam_row->>'publication_status',
      ''
    )), '[^a-z0-9]+', '', 'g') as status_key,
    regexp_replace(
      regexp_replace(lower(coalesce(exam_row->>'id', '')), '^exam-engine-v21-', ''),
      '-[0-9]{4}-[0-9]{2}-[0-9]{2}$',
      ''
    ) as normalized_exam_table_id
  from response
  cross join lateral jsonb_array_elements(coalesce(payload->'cronograma', '[]'::jsonb)) exam_row
),
visible_exam_subjects as (
  select distinct
    visible_exams.exam_order,
    subject.id as subject_uuid,
    upper(btrim(subject.code)) as subject_code
  from visible_exams
  join public.subjects subject
    on subject.institution_id = current_setting('app.test_institution_id')::uuid
   and (
     visible_exams.exam_row->>'subject_id' = subject.id::text
     or visible_exams.exam_row->>'canonical_subject_id' = subject.id::text
     or visible_exams.exam_row->>'materia_id' = subject.id::text
     or position(
       ' ' || btrim(regexp_replace(lower(subject.code), '[^a-z0-9]+', ' ', 'g')) || ' '
       in ' ' || visible_exams.subject_search_text || ' '
     ) > 0
   )
),
latest_statuses as (
  select distinct on (status_row.student_career_plan_id, status_row.plan_subject_id)
    status_row.*
  from public.profiles profile
  join public.student_records student
    on student.institution_id = current_setting('app.test_institution_id')::uuid
   and (
     student.profile_id = profile.user_id
     or (
       student.profile_id is null
       and nullif(btrim(coalesce(student.email, '')), '') is not null
       and nullif(btrim(coalesce(profile.email, '')), '') is not null
       and lower(btrim(student.email)) = lower(btrim(profile.email))
     )
   )
   and coalesce(nullif(btrim(student.workspace_key), ''), 'main') = current_setting('app.test_workspace_key')
  join public.student_career_plans scp
    on scp.institution_id = student.institution_id
   and scp.student_id = student.id
   and scp.status = 'active'
   and (scp.valid_from is null or scp.valid_from <= current_date)
   and (scp.valid_until is null or scp.valid_until >= current_date)
  join public.student_academic_statuses status_row
    on status_row.institution_id = scp.institution_id
   and status_row.student_career_plan_id = scp.id
  where profile.user_id = :'multi_career_student_user_id'::uuid
  order by status_row.student_career_plan_id, status_row.plan_subject_id, status_row.recorded_at desc, status_row.id desc
),
regular_subjects as (
  select distinct
    subject.id as subject_uuid,
    upper(btrim(subject.code)) as subject_code,
    scp.career_id,
    career.name as career_name
  from latest_statuses latest
  join public.student_career_plans scp
    on scp.institution_id = latest.institution_id
   and scp.id = latest.student_career_plan_id
  join public.study_plan_subjects sps
    on sps.institution_id = latest.institution_id
   and sps.id = latest.plan_subject_id
   and sps.plan_id = scp.plan_id
  join public.subjects subject
    on subject.institution_id = sps.institution_id
   and subject.id = sps.subject_id
  join public.careers career
    on career.institution_id = scp.institution_id
   and career.id = scp.career_id
  where latest.condition = 'regular'
    and latest.regularity_valid is distinct from false
)
select
  'multi_career_student_each_exam_has_own_regular_subject' as test_name,
  case
    when exists (select 1 from visible_exams)
     and not exists (
       select 1
       from visible_exams visible
       where not exists (
         select 1
         from visible_exam_subjects visible_subject
         join regular_subjects regular
           on regular.subject_uuid = visible_subject.subject_uuid
         where visible_subject.exam_order = visible.exam_order
           and (
             (
               visible.career_key in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
               and nullif(btrim(coalesce(visible.exam_row->>'carreraId', '')), '') is null
               and nullif(btrim(coalesce(visible.exam_row->>'career_id', '')), '') is null
               and nullif(btrim(coalesce(visible.exam_row->>'program_id', '')), '') is null
               and nullif(btrim(coalesce(visible.exam_row->>'canonical_program_id', '')), '') is null
             )
             or (
               (
                 visible.career_key not in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
                 or nullif(btrim(coalesce(visible.exam_row->>'carreraId', '')), '') is not null
                 or nullif(btrim(coalesce(visible.exam_row->>'career_id', '')), '') is not null
                 or nullif(btrim(coalesce(visible.exam_row->>'program_id', '')), '') is not null
                 or nullif(btrim(coalesce(visible.exam_row->>'canonical_program_id', '')), '') is not null
               )
               and (
                 visible.career_key in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
                 or visible.career_key = regexp_replace(lower(regular.career_name), '[^a-z0-9]+', '', 'g')
               )
               and not exists (
                 select 1
                 from unnest(array[
                   visible.exam_row->>'carreraId',
                   visible.exam_row->>'career_id',
                   visible.exam_row->>'program_id',
                   visible.exam_row->>'canonical_program_id'
                 ]) as career_value(raw_value)
                 where nullif(btrim(coalesce(career_value.raw_value, '')), '') is not null
                   and btrim(career_value.raw_value) <> regular.career_id::text
                   and regexp_replace(lower(btrim(career_value.raw_value)), '[^a-z0-9]+', '', 'g') <> regexp_replace(lower(regular.career_name), '[^a-z0-9]+', '', 'g')
               )
               and (
                 (
                   visible.career_key not in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
                   and visible.career_key = regexp_replace(lower(regular.career_name), '[^a-z0-9]+', '', 'g')
                 )
                 or exists (
                   select 1
                   from unnest(array[
                     visible.exam_row->>'carreraId',
                     visible.exam_row->>'career_id',
                     visible.exam_row->>'program_id',
                     visible.exam_row->>'canonical_program_id'
                   ]) as career_value(raw_value)
                   where nullif(btrim(coalesce(career_value.raw_value, '')), '') is not null
                     and (
                       btrim(career_value.raw_value) = regular.career_id::text
                       or regexp_replace(lower(btrim(career_value.raw_value)), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(regular.career_name), '[^a-z0-9]+', '', 'g')
                     )
                 )
               )
             )
           )
       )
     )
     and not exists (
       select 1
       from visible_exams visible
       where visible.status_key not in (
         'aprobada',
         'aprobado',
         'confirmed',
         'confirmada',
         'confirmado',
         'final',
         'finalconfirmed',
         'finalconfirmedminimum',
         'finalizada',
         'finalizado',
         'oficial',
         'oficializada',
         'oficializado',
         'published',
         'publishedtostudents',
         'publicada',
         'publicado',
         'tribunalcomplete',
         'tribunalminimum'
       )
       and lower(btrim(coalesce(visible.exam_row->>'confirmada', ''))) not in ('true', '1', 'si', 'sí', 'yes')
       and lower(btrim(coalesce(visible.exam_row->>'confirmed', ''))) not in ('true', '1', 'si', 'sí', 'yes')
     )
     and not exists (
       select 1
       from visible_exams visible
       join public.exam_teacher_assignments assignment
         on assignment.institution_id = current_setting('app.test_institution_id')::uuid
        and assignment.workspace_key = current_setting('app.test_workspace_key')
        and assignment.deleted_at is null
        and assignment.status = 'active'
        and assignment.confirmation_status <> 'confirmed'
        and lower(coalesce(assignment.exam_table_id, '')) = visible.normalized_exam_table_id
     )
    then 'PASS'
    else 'FAIL'
  end as result;

-- 6. Usuario no autenticado: RPC must reject with 28000.
reset role;
select set_config('request.jwt.claim.sub', '', true);
do $test$
begin
  perform *
  from public.get_student_portal_workspace_snapshot(
    current_setting('app.test_institution_id')::uuid,
    current_setting('app.test_workspace_key')::text
  );

  raise exception 'FAIL unauthenticated_user_rejected: RPC allowed an unauthenticated user';
exception
  when others then
    if sqlstate <> '28000' then
      raise;
    end if;

    raise notice 'PASS unauthenticated_user_rejected';
end;
$test$;

-- 7. Alumno de otra institucion: RPC must reject with 42501.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'other_institution_student_user_id', true);
do $test$
begin
  perform *
  from public.get_student_portal_workspace_snapshot(
    current_setting('app.test_institution_id')::uuid,
    current_setting('app.test_workspace_key')::text
  );

  raise exception 'FAIL other_institution_student_rejected: RPC allowed a student from another institution';
exception
  when others then
    if sqlstate <> '42501' then
      raise;
    end if;

    raise notice 'PASS other_institution_student_rejected';
end;
$test$;

rollback;
