-- Ejecutar solo en la instancia descartable codex-baseline-local-7725bdda.
-- psql -X -v ON_ERROR_STOP=1 -f local_ab_rls_rpc_validation.sql
-- Todo el fixture vive en una transaccion y se revierte al cerrar la sesion.
-- Comprobacion de datos locales previos, antes de insertar fixtures.
select count(*) as historical_enrollment_record_scope_mismatches
from public.subject_enrollments enrollment
where enrollment.student_record_id is not null
  and not exists (
    select 1 from public.student_records record
    where record.id = enrollment.student_record_id
      and record.institution_id = enrollment.institution_id
      and record.workspace_key = enrollment.workspace_key
  );
select convalidated as enrollment_record_scope_fk_validated
from pg_constraint
where conrelid = 'public.subject_enrollments'::regclass
  and conname = 'subject_enrollments_student_record_scope_fkey';
select count(*) as historical_teacher_assignment_record_scope_mismatches
from public.subject_teacher_assignments assignment
where assignment.teacher_record_id is not null
  and not exists (
    select 1 from public.teacher_records record
    where record.id = assignment.teacher_record_id
      and record.institution_id = assignment.institution_id
      and record.workspace_key = assignment.workspace_key
  );
begin;

insert into public.institutions (id, name, slug) values
  ('a1000000-0000-4000-8000-000000000001', 'Fixture Institution A', 'fixture-ab-a'),
  ('b1000000-0000-4000-8000-000000000001', 'Fixture Institution B', 'fixture-ab-b');

insert into auth.users (id, email, raw_app_meta_data) values
  ('a2000000-0000-4000-8000-000000000001', 'admin-a@fixture.invalid', '{"account_role":"admin_instituto"}'),
  ('b2000000-0000-4000-8000-000000000001', 'admin-b@fixture.invalid', '{"account_role":"admin_instituto"}'),
  ('a2000000-0000-4000-8000-000000000002', 'teacher-a@fixture.invalid', '{"account_role":"docente"}'),
  ('a2000000-0000-4000-8000-000000000006', 'teacher-a-replacement@fixture.invalid', '{"account_role":"docente"}'),
  ('b2000000-0000-4000-8000-000000000002', 'teacher-b@fixture.invalid', '{"account_role":"docente"}'),
  ('b2000000-0000-4000-8000-000000000006', 'teacher-b-replacement@fixture.invalid', '{"account_role":"docente"}'),
  ('a2000000-0000-4000-8000-000000000003', 'student-a@fixture.invalid', '{"account_role":"alumno"}'),
  ('b2000000-0000-4000-8000-000000000003', 'student-b@fixture.invalid', '{"account_role":"alumno"}'),
  ('a2000000-0000-4000-8000-000000000004', 'blocked@fixture.invalid', '{"account_role":"alumno"}'),
  ('a2000000-0000-4000-8000-000000000005', 'no-membership@fixture.invalid', '{"account_role":"alumno"}');

update public.profiles
set is_blocked = true
where user_id = 'a2000000-0000-4000-8000-000000000004';

insert into public.memberships (institution_id, user_id, role) values
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'owner'),
  ('b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'owner'),
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'viewer'),
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000006', 'viewer'),
  ('b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'viewer'),
  ('b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000006', 'viewer'),
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'viewer'),
  ('b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000003', 'viewer'),
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'viewer');

insert into public.careers (id, institution_id, external_code, name) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'FIX-A', 'Fixture Career A'),
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'FIX-B', 'Fixture Career B');

insert into public.study_plans (id, institution_id, career_id, external_code, name) values
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'PLAN-A', 'Fixture Plan A'),
  ('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'PLAN-B', 'Fixture Plan B');

insert into public.subjects (id, institution_id, code, name) values
  ('a5000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'FIX-A-01', 'Fixture Subject A'),
  ('b5000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'FIX-B-01', 'Fixture Subject B');

insert into public.study_plan_subjects (id, institution_id, plan_id, subject_id) values
  ('a6000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001');

insert into public.teacher_records (id, institution_id, external_code, first_name, last_name, profile_id) values
  ('a7000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'TEACH-A', 'Teacher', 'A', 'a2000000-0000-4000-8000-000000000002'),
  ('a7000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'TEACH-A-REPLACEMENT', 'Teacher', 'A Replacement', 'a2000000-0000-4000-8000-000000000006'),
  ('b7000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'TEACH-B', 'Teacher', 'B', 'b2000000-0000-4000-8000-000000000002'),
  ('b7000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'TEACH-B-REPLACEMENT', 'Teacher', 'B Replacement', 'b2000000-0000-4000-8000-000000000006');

insert into public.student_records (id, institution_id, external_code, first_name, last_name, profile_id, workspace_key, career) values
  ('a8000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'STUD-A', 'Student', 'A', 'a2000000-0000-4000-8000-000000000003', 'main', 'Fixture Career A'),
  ('b8000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'STUD-B', 'Student', 'B', 'b2000000-0000-4000-8000-000000000003', 'main', 'Fixture Career B');

insert into public.student_career_plans (id, institution_id, student_id, career_id, plan_id) values
  ('a9000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001');

insert into public.exam_tables
  (id, institution_id, workspace_key, exam_period_key, exam_call_key, exam_call_label, scheduled_starts_at, enrollment_opens_at, enrollment_closes_at, status)
values
  ('aa000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'main', 'FIX-PERIOD-A', 'FIX-CALL-A', 'Fixture Call A', now() + interval '30 days', now() - interval '1 day', now() + interval '1 day', 'open'),
  ('bb000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'main', 'FIX-PERIOD-B', 'FIX-CALL-B', 'Fixture Call B', now() + interval '30 days', now() - interval '1 day', now() + interval '1 day', 'open');

insert into public.exam_table_subjects
  (id, institution_id, exam_table_id, career_id, study_plan_id, study_plan_subject_id, subject_id)
values
  ('ab000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001'),
  ('bc000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001');

-- Vinculo legacy↔UUID real para probar la ocultación por confirmación pendiente.
update public.exam_tables
set legacy_exam_table_id = 'mesa-legacy-a'
where id = 'aa000000-0000-4000-8000-000000000001';
insert into public.exam_teacher_assignments
  (institution_id, workspace_key, exam_table_id, exam_table_subject_id, teacher_record_id, teacher_id, role, status, confirmation_status)
values
  ('a1000000-0000-4000-8000-000000000001', 'main',
   'aa000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
   'TITULAR', 'active', 'pending');
insert into public.student_academic_statuses
  (institution_id, student_career_plan_id, plan_subject_id, condition, regularity_valid)
values
  ('a1000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'a6000000-0000-4000-8000-000000000001', 'regular', true);
insert into public.workspace_snapshots (institution_id, workspace_key, payload)
values (
  'a1000000-0000-4000-8000-000000000001', 'main',
  '{"cronograma":[{"id":"exam-engine-v21-mesa-legacy-a-2026-10-03","codigo":"FIX-A-01","carrera":"Fixture Career A","estadoFinal":"confirmed"}]}'::jsonb
);

insert into public.student_grades
  (institution_id, workspace_key, student_id, student_record_id, subject_id, program_id, academic_status)
values
  ('a1000000-0000-4000-8000-000000000001', 'main', 'a2000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000001', 'FIX-A-01', 'Fixture Career A', 'regular'),
  ('b1000000-0000-4000-8000-000000000001', 'main', 'b2000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001', 'FIX-B-01', 'Fixture Career B', 'regular');

-- Modo focal: fixtures compartidos sin re-ejecutar la matriz completa.
\if :{?attendance_tenant_focal}
insert into public.subject_enrollments
  (id, institution_id, workspace_key, subject_id, program_id, student_id, student_record_id)
values
  ('ae000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A', 'a2000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001');
insert into public.subject_teacher_assignments
  (institution_id, workspace_key, subject_id, program_id, teacher_id, role)
values
  ('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A', 'a2000000-0000-4000-8000-000000000002', 'titular'),
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000006', 'suplente'),
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-WRONG', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000006', 'titular'),
  ('b1000000-0000-4000-8000-000000000001', 'other', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000006', 'titular'),
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Other Career B', 'b2000000-0000-4000-8000-000000000006', 'titular');
insert into public.subject_class_sessions
  (id, institution_id, workspace_key, subject_id, program_id, teacher_id, session_date)
values
  ('ac000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A', 'a2000000-0000-4000-8000-000000000002', current_date),
  ('bc000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-WRONG', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000006', current_date),
  ('bc000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'other', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000006', current_date),
  ('bc000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Other Career B', 'b2000000-0000-4000-8000-000000000006', current_date);
select set_config('fixture.foreign_enrollment_a', 'ae000000-0000-4000-8000-000000000001', true);
select set_config('fixture.enrollment_b', 'be000000-0000-4000-8000-000000000001', true);
\else
\if :{?grade_tenant_focal}
insert into public.subject_enrollments
  (id, institution_id, workspace_key, subject_id, program_id, student_id, student_record_id)
values
  ('ae000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A', 'a2000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001');
insert into public.subject_teacher_assignments
  (institution_id, workspace_key, subject_id, program_id, teacher_id, role)
values
  ('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A', 'a2000000-0000-4000-8000-000000000002', 'titular'),
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000006', 'suplente'),
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-WRONG', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000006', 'titular'),
  ('b1000000-0000-4000-8000-000000000001', 'other', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000006', 'titular'),
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Other Career B', 'b2000000-0000-4000-8000-000000000006', 'titular');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
declare saved public.student_grades%rowtype;
begin
  select * into saved from public.academic_teacher_upsert_student_grade(
    'a1000000-0000-4000-8000-000000000001', 'main', 'a2000000-0000-4000-8000-000000000003',
    'a8000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001',
    'FIX-A-01', 'Fixture Career A', 'partial', 2, 8, 'regular', null
  );
  if saved.subject_enrollment_id is distinct from 'ae000000-0000-4000-8000-000000000001'::uuid
  then raise exception 'POSITIVE_FAILED: grade A'; end if;
end $$;
\echo PASS grade_teacher_A_valid
\else
\if :{?notices_tenant_focal}
insert into public.subject_enrollments
  (institution_id, workspace_key, subject_id, program_id, student_id, student_record_id)
values
  ('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A', 'a2000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001');
insert into public.subject_teacher_assignments
  (id, institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status)
values
  ('ad000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A', 'a2000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'titular', 'active'),
  ('bd000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b2000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'titular', 'active');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select public.academic_create_teacher_subject_leave(
  'a1000000-0000-4000-8000-000000000001', 'main', array['ad000000-0000-4000-8000-000000000001'::uuid],
  'a2000000-0000-4000-8000-000000000006', 'a7000000-0000-4000-8000-000000000002', current_date, current_date + 7, 'Fixture'
);
\else
\if :{?roster_tenant_focal}
insert into public.subject_teacher_assignments
  (institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status)
values
  ('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A',
   'a2000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'titular', 'active');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
select public.upsert_subject_enrollment_from_portal(
  'a1000000-0000-4000-8000-000000000001', 'main',
  'a2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003',
  'FIX-A-01', 'Fixture Career A', 'a8000000-0000-4000-8000-000000000001'
);
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if not exists (select 1 from public.academic_get_teacher_subject_rosters('a1000000-0000-4000-8000-000000000001', 'main') where "fullName" = 'Student A')
  then raise exception 'POSITIVE_FAILED: legitimate roster A'; end if;
end $$;
\echo PASS focal_student_teacher_A
\else
-- Comprobar que RLS se evalua como authenticated y no como postgres.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
declare
  saved_status text;
begin
  if (select auth.uid()) is distinct from 'a2000000-0000-4000-8000-000000000003'::uuid then
    raise exception 'HARNESS_ERROR: auth.uid no corresponde al estudiante A';
  end if;

  select status into saved_status
  from public.upsert_subject_enrollment_from_portal(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'a2000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000003',
    'FIX-A-01', 'Fixture Career A',
    'a8000000-0000-4000-8000-000000000001'
  );
  if saved_status is distinct from 'active' then
    raise exception 'POSITIVE_FAILED: student A no pudo inscribirse en A';
  end if;
end $$;
\echo PASS positive_subject_enrollment_A

-- Primer negativo critico: un usuario B no debe poder actuar como student A.
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
begin
  if (select auth.uid()) is distinct from 'b2000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'HARNESS_ERROR: auth.uid no corresponde al admin B';
  end if;

  begin
    perform public.upsert_subject_enrollment_from_portal(
      'a1000000-0000-4000-8000-000000000001', 'main',
      'a2000000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000003',
      'FIX-A-01', 'Fixture Career A',
      'a8000000-0000-4000-8000-000000000001'
    );
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then
      return;
    end if;
    raise;
  end;
  raise exception 'P1_RPC_IDENTITY_BYPASS: admin B pudo escribir inscripcion de student A';
end $$;
\echo PASS negative_subject_enrollment_cross_tenant

-- Tambien denegar authenticated sin identidad JWT.
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if (select auth.uid()) is not null then
    raise exception 'HARNESS_ERROR: se esperaba auth.uid nulo';
  end if;

  begin
    perform public.upsert_subject_enrollment_from_portal(
      'a1000000-0000-4000-8000-000000000001', 'main',
      'a2000000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000003',
      'FIX-A-01', 'Fixture Career A',
      'a8000000-0000-4000-8000-000000000001'
    );
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then
      return;
    end if;
    raise;
  end;
  raise exception 'P1_RPC_NULL_IDENTITY_BYPASS: caller sin auth.uid pudo escribir';
end $$;
\echo PASS negative_subject_enrollment_null_auth_uid

-- RLS CRUD: admin B puede gestionar B, pero nunca filas de A.
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
declare
  affected_rows integer;
begin
  if exists (select 1 from public.student_records where id = 'a8000000-0000-4000-8000-000000000001') then
    raise exception 'P1_RLS_SELECT_CROSS_TENANT: admin B leyó student record A';
  end if;
  if not exists (select 1 from public.student_records where id = 'b8000000-0000-4000-8000-000000000001') then
    raise exception 'POSITIVE_FAILED: admin B no lee su propio student record';
  end if;
end $$;
\echo PASS student_records_select_A_B

do $$
begin
  begin
    insert into public.student_records (id, institution_id, external_code, first_name, last_name, workspace_key)
    values ('a8000000-0000-4000-8000-000000000099', 'a1000000-0000-4000-8000-000000000001', 'CROSS-A', 'Cross', 'Tenant', 'main');
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'P1_RLS_INSERT_CROSS_TENANT: admin B insertó student record A';
end $$;
\echo PASS student_records_insert_cross_tenant_denied

do $$
declare
  affected_rows integer;
begin
  update public.student_records set first_name = 'Cross' where id = 'a8000000-0000-4000-8000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'P1_RLS_UPDATE_CROSS_TENANT: admin B actualizó student record A';
  end if;
  delete from public.student_records where id = 'a8000000-0000-4000-8000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'P1_RLS_DELETE_CROSS_TENANT: admin B borró student record A';
  end if;
end $$;
\echo PASS student_records_update_delete_cross_tenant_denied

-- Membership, bloqueo y vínculo de identidad no deben depender solo del rol JWT.
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000004', true);
do $$
begin
  if public.is_member_of_institution('a1000000-0000-4000-8000-000000000001') then
    raise exception 'P1_BLOCKED_MEMBERSHIP: usuario bloqueado conservó acceso A';
  end if;
  if exists (select 1 from public.student_records where institution_id = 'a1000000-0000-4000-8000-000000000001') then
    raise exception 'P1_BLOCKED_SELECT: usuario bloqueado leyó student records A';
  end if;
end $$;
\echo PASS blocked_user_denied

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000005', true);
do $$
begin
  if public.is_member_of_institution('a1000000-0000-4000-8000-000000000001') then
    raise exception 'P1_NO_MEMBERSHIP: usuario sin membership obtuvo acceso A';
  end if;
  if exists (select 1 from public.student_records where institution_id = 'a1000000-0000-4000-8000-000000000001') then
    raise exception 'P1_NO_MEMBERSHIP_SELECT: usuario sin membership leyó student records A';
  end if;
end $$;
\echo PASS no_membership_denied

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if not public.is_member_of_institution('a1000000-0000-4000-8000-000000000001')
    or public.is_member_of_institution('b1000000-0000-4000-8000-000000000001')
  then
    raise exception 'P1_TEACHER_MEMBERSHIP: identidad docente A no respeta tenant';
  end if;
  if public.academic_can_manage_subject('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A') then
    raise exception 'P1_TEACHER_UNASSIGNED: docente A gestionó materia sin asignación';
  end if;
end $$;
\echo PASS teacher_identity_membership_without_assignment

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not public.is_member_of_institution('a1000000-0000-4000-8000-000000000001')
    or public.is_member_of_institution('b1000000-0000-4000-8000-000000000001')
  then
    raise exception 'P1_STUDENT_MEMBERSHIP: identidad alumno A no respeta tenant';
  end if;
  if public.academic_can_manage_subject('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A') then
    raise exception 'P1_STUDENT_MANAGE_SUBJECT: alumno A gestionó materia';
  end if;
end $$;
\echo PASS student_identity_membership_without_management

-- El alumno, el admin del tenant y el docente asignado son callers legítimos.
do $$
begin
  if public.academic_resolve_subject_enrollment(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'a2000000-0000-4000-8000-000000000003', 'FIX-A-01', 'Fixture Career A'
  ) is null then
    raise exception 'POSITIVE_FAILED: student A no resolvió su propia inscripción A';
  end if;
end $$;
\echo PASS subject_enrollment_resolve_student_A

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
do $$
begin
  if public.academic_resolve_subject_enrollment(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'a2000000-0000-4000-8000-000000000003', 'FIX-A-01', 'Fixture Career A'
  ) is null then
    raise exception 'POSITIVE_FAILED: admin A no resolvió inscripción en su tenant';
  end if;
end $$;
\echo PASS subject_enrollment_resolve_admin_A

reset role;
insert into public.subject_teacher_assignments
  (institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status)
values
  ('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A',
   'a2000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'titular', 'active');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if public.academic_resolve_subject_enrollment(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'a2000000-0000-4000-8000-000000000003', 'FIX-A-01', 'Fixture Career A'
  ) is null then
    raise exception 'POSITIVE_FAILED: docente A asignado no resolvió inscripción A';
  end if;
end $$;
\echo PASS subject_enrollment_resolve_assigned_teacher_A

select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if public.academic_resolve_subject_enrollment(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'a2000000-0000-4000-8000-000000000003', 'FIX-A-01', 'Fixture Career A'
  ) is not null then
    raise exception 'P1_RPC_NULL_IDENTITY_READ: caller sin auth.uid obtuvo enrollment ID';
  end if;
end $$;
\echo PASS subject_enrollment_resolve_null_auth_uid_denied

-- El helper SECURITY DEFINER no debe revelar identificadores de inscripciones A a B.
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
begin
  if public.academic_resolve_subject_enrollment(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'a2000000-0000-4000-8000-000000000003', 'FIX-A-01', 'Fixture Career A'
  ) is not null then
    raise exception 'P1_RPC_CROSS_TENANT_READ: admin B obtuvo enrollment ID de student A';
  end if;
end $$;
\echo PASS subject_enrollment_resolve_cross_tenant_denied

-- Mesa: inscripción propia A permitida; identidad ajena y tenant cruzado denegados.
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
declare
  saved_status text;
begin
  select status into saved_status
  from public.upsert_exam_enrollment_from_portal(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'a2000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000003',
    'a8000000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000001',
    'FIX-A-01', 'Fixture Career A'
  );
  if saved_status is distinct from 'registered' then
    raise exception 'POSITIVE_FAILED: student A no pudo inscribirse en mesa A';
  end if;
end $$;
\echo PASS positive_exam_enrollment_A

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.upsert_exam_enrollment_from_portal(
      'a1000000-0000-4000-8000-000000000001', 'main',
      'a2000000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000003',
      'a8000000-0000-4000-8000-000000000001',
      'aa000000-0000-4000-8000-000000000001',
      'FIX-A-01', 'Fixture Career A'
    );
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then return; end if;
    raise;
  end;
  raise exception 'P1_EXAM_IDENTITY_BYPASS: admin B inscribió student A';
end $$;
\echo PASS negative_exam_enrollment_cross_tenant

select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform public.upsert_exam_enrollment_from_portal(
      'a1000000-0000-4000-8000-000000000001', 'main',
      'a2000000-0000-4000-8000-000000000003',
      'a2000000-0000-4000-8000-000000000003',
      'a8000000-0000-4000-8000-000000000001',
      'aa000000-0000-4000-8000-000000000001',
      'FIX-A-01', 'Fixture Career A'
    );
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then return; end if;
    raise;
  end;
  raise exception 'P1_EXAM_NULL_IDENTITY_BYPASS: caller sin auth.uid inscribió student A';
end $$;
\echo PASS negative_exam_enrollment_null_auth_uid

-- Lecturas SECURITY DEFINER: rosters y notas solo para la identidad apropiada.
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.academic_get_teacher_subject_rosters('a1000000-0000-4000-8000-000000000001', 'main')) <> 1 then
    raise exception 'POSITIVE_FAILED: docente A no ve roster A asignado';
  end if;
  if exists (select 1 from public.academic_get_teacher_subject_rosters('b1000000-0000-4000-8000-000000000001', 'main')) then
    raise exception 'P1_RPC_ROSTER_CROSS_TENANT: docente A obtuvo roster B';
  end if;
end $$;
\echo PASS teacher_roster_A_and_cross_tenant_denied

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.academic_get_teacher_subject_rosters('a1000000-0000-4000-8000-000000000001', 'main')) then
    raise exception 'P1_RPC_ROSTER_CROSS_TENANT: docente B obtuvo roster A';
  end if;
end $$;
\echo PASS teacher_roster_B_cannot_read_A

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if (select count(*) from public.academic_get_student_portal_grades('a1000000-0000-4000-8000-000000000001', 'main')) <> 1 then
    raise exception 'POSITIVE_FAILED: alumno A no ve su nota A';
  end if;
  if exists (select 1 from public.academic_get_student_portal_grades('b1000000-0000-4000-8000-000000000001', 'main')) then
    raise exception 'P1_RPC_GRADES_CROSS_TENANT: alumno A obtuvo notas B';
  end if;
end $$;
\echo PASS student_grades_A_and_cross_tenant_denied

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.academic_get_student_portal_grades('a1000000-0000-4000-8000-000000000001', 'main')) then
    raise exception 'P1_RPC_GRADES_CROSS_TENANT: alumno B obtuvo notas A';
  end if;
end $$;
\echo PASS student_grades_B_cannot_read_A

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
begin
  perform public.academic_teacher_create_class_session(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'FIX-A-01', 'Fixture Career A', current_date, 'Fixture A'
  );
end $$;
\echo PASS teacher_create_class_session_A

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.academic_teacher_create_class_session(
      'a1000000-0000-4000-8000-000000000001', 'main',
      'FIX-A-01', 'Fixture Career A', current_date, 'Cross tenant'
    );
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then return; end if;
    raise;
  end;
  raise exception 'P1_RPC_CLASS_CROSS_TENANT: docente B creó clase A';
end $$;
\echo PASS teacher_create_class_session_cross_tenant_denied

-- CRUD de inscripciones: la policy tenant y el default-deny de mesas no deben ceder.
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
declare
  affected_rows integer;
begin
  if exists (select 1 from public.subject_enrollments where institution_id = 'a1000000-0000-4000-8000-000000000001') then
    raise exception 'P1_SUBJECT_ENROLLMENT_SELECT_CROSS_TENANT';
  end if;
  begin
    insert into public.subject_enrollments (institution_id, workspace_key, subject_id, program_id, student_id)
    values ('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A', 'a2000000-0000-4000-8000-000000000003');
    raise exception 'P1_SUBJECT_ENROLLMENT_INSERT_CROSS_TENANT';
  exception when insufficient_privilege then
    null;
  end;
  update public.subject_enrollments set metadata = '{"cross_tenant_fixture":true}'::jsonb
  where institution_id = 'a1000000-0000-4000-8000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then raise exception 'P1_SUBJECT_ENROLLMENT_UPDATE_CROSS_TENANT'; end if;
  delete from public.subject_enrollments where institution_id = 'a1000000-0000-4000-8000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then raise exception 'P1_SUBJECT_ENROLLMENT_DELETE_CROSS_TENANT'; end if;
end $$;
\echo PASS subject_enrollments_crud_cross_tenant_denied

-- Tablas de examen: inscripciones y eventos no son escritura directa de authenticated.
do $$
begin
  if has_table_privilege('authenticated', 'public.exam_enrollments', 'INSERT')
    or has_table_privilege('authenticated', 'public.exam_enrollments', 'UPDATE')
    or has_table_privilege('authenticated', 'public.exam_enrollments', 'DELETE')
    or has_table_privilege('authenticated', 'public.exam_enrollment_events', 'INSERT')
  then
    raise exception 'P1_EXAM_DIRECT_WRITE_GRANT: authenticated puede mutar mesas directamente';
  end if;
  if exists (select 1 from public.exam_enrollments where institution_id = 'a1000000-0000-4000-8000-000000000001') then
    raise exception 'P1_EXAM_ENROLLMENT_SELECT_CROSS_TENANT';
  end if;
end $$;
\echo PASS exam_enrollments_direct_crud_denied

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
begin
  perform public.academic_teacher_upsert_student_grade(
    'a1000000-0000-4000-8000-000000000001', 'main',
    'a2000000-0000-4000-8000-000000000003',
    'a8000000-0000-4000-8000-000000000001', null,
    'FIX-A-01', 'Fixture Career A', 'partial', 1, 8, 'regular', null
  );
end $$;
\echo PASS teacher_upsert_grade_A

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.academic_teacher_upsert_student_grade(
      'a1000000-0000-4000-8000-000000000001', 'main',
      'a2000000-0000-4000-8000-000000000003',
      'a8000000-0000-4000-8000-000000000001', null,
      'FIX-A-01', 'Fixture Career A', 'partial', 1, 8, 'regular', null
    );
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then return; end if;
    raise;
  end;
  raise exception 'P1_RPC_GRADE_CROSS_TENANT: docente B escribió nota A';
end $$;
\echo PASS teacher_upsert_grade_cross_tenant_denied

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
declare
  session_id uuid;
begin
  select id into session_id from public.subject_class_sessions
  where institution_id = 'a1000000-0000-4000-8000-000000000001'
    and subject_id = 'FIX-A-01' and session_date = current_date;
  if session_id is null then raise exception 'HARNESS_ERROR: falta clase fixture A'; end if;
  perform set_config('fixture.session_a', session_id::text, true);
  perform public.academic_teacher_upsert_attendance_records(
    session_id,
    '[{"student_id":"a2000000-0000-4000-8000-000000000003","status":"present"}]'::jsonb
  );
end $$;
\echo PASS teacher_upsert_attendance_A

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$
declare
  session_id uuid;
begin
  select id into session_id from public.subject_class_sessions
  where institution_id = 'a1000000-0000-4000-8000-000000000001'
    and subject_id = 'FIX-A-01' and session_date = current_date;
  if session_id is not null then
    raise exception 'P1_CLASS_SESSION_SELECT_CROSS_TENANT';
  end if;
  -- UUID capturado por el harness: la RPC debe denegar aun con ID conocido.
  session_id := current_setting('fixture.session_a')::uuid;
  begin
    perform public.academic_teacher_upsert_attendance_records(
      session_id,
      '[{"student_id":"a2000000-0000-4000-8000-000000000003","status":"absent"}]'::jsonb
    );
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then return; end if;
    raise;
  end;
  raise exception 'P1_RPC_ATTENDANCE_CROSS_TENANT: docente B escribió asistencia A';
end $$;
\echo PASS class_session_select_and_attendance_cross_tenant_denied

-- Otras RPC SECURITY DEFINER que devuelven IDs o datos de alumno/docente.
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
do $$
begin
  if (select count(*) from public.academic_resolve_member_profile_by_email(
    'a1000000-0000-4000-8000-000000000001', 'main', 'student-a@fixture.invalid', 'alumno'
  )) <> 1 then
    raise exception 'POSITIVE_FAILED: admin A no resuelve perfil alumno A';
  end if;
end $$;
\echo PASS member_profile_resolve_admin_A

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
begin
  if exists (select 1 from public.academic_resolve_member_profile_by_email(
    'a1000000-0000-4000-8000-000000000001', 'main', 'student-a@fixture.invalid', 'alumno'
  )) then
    raise exception 'P1_RPC_PROFILE_CROSS_TENANT: admin B obtuvo perfil alumno A';
  end if;
  if exists (select 1 from public.academic_get_student_subject_teacher_notices(
    'a1000000-0000-4000-8000-000000000001', 'main'
  )) then
    raise exception 'P1_RPC_NOTICES_CROSS_TENANT: admin B obtuvo avisos alumno A';
  end if;
end $$;
\echo PASS profile_and_notices_cross_tenant_denied

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
begin
  perform public.get_student_portal_workspace_snapshot('a1000000-0000-4000-8000-000000000001', 'main');
end $$;
\echo PASS student_portal_snapshot_A

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
declare
  visible_count integer;
begin
  select jsonb_array_length(payload->'cronograma') into visible_count
  from public.get_student_portal_workspace_snapshot('a1000000-0000-4000-8000-000000000001', 'main');
  if visible_count is distinct from 0 then
    raise exception 'P1_PENDING_EXAM_VISIBLE: mesa legacy A pendiente visible (% mesas)', visible_count;
  end if;
end $$;
\echo PASS pending_exam_hidden_from_student_A

reset role;
update public.exam_teacher_assignments
set confirmation_status = 'confirmed'
where institution_id = 'a1000000-0000-4000-8000-000000000001'
  and exam_table_id = 'aa000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
declare
  visible_count integer;
begin
  select jsonb_array_length(payload->'cronograma') into visible_count
  from public.get_student_portal_workspace_snapshot('a1000000-0000-4000-8000-000000000001', 'main');
  if visible_count is distinct from 1 then
    raise exception 'POSITIVE_FAILED: mesa legacy A confirmada no visible (% mesas)', visible_count;
  end if;
end $$;
\echo PASS confirmed_exam_visible_to_student_A

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.get_student_portal_workspace_snapshot('a1000000-0000-4000-8000-000000000001', 'main');
  exception when insufficient_privilege then return;
  end;
  raise exception 'P1_RPC_SNAPSHOT_CROSS_TENANT: student B obtuvo snapshot A';
end $$;
\echo PASS student_portal_snapshot_cross_tenant_denied

-- Sin mapping legacy, una asignación pendiente no puede ampliar visibilidad.
reset role;
update public.exam_tables
set legacy_exam_table_id = null
where id = 'aa000000-0000-4000-8000-000000000001';
update public.exam_teacher_assignments
set confirmation_status = 'pending'
where institution_id = 'a1000000-0000-4000-8000-000000000001'
  and exam_table_id = 'aa000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
declare
  visible_count integer;
begin
  select jsonb_array_length(payload->'cronograma') into visible_count
  from public.get_student_portal_workspace_snapshot('a1000000-0000-4000-8000-000000000001', 'main');
  if visible_count is distinct from 0 then
    raise exception 'P1_UNMAPPED_PENDING_EXAM_VISIBLE: mesa legacy A sin mapping visible (% mesas)', visible_count;
  end if;
end $$;
\echo PASS unmapped_pending_exam_fail_closed

-- ID legacy vacio tampoco es un mapping valido, aunque figure como confirmado.
reset role;
update public.exam_tables
set legacy_exam_table_id = ''
where id = 'aa000000-0000-4000-8000-000000000001';
update public.exam_teacher_assignments
set confirmation_status = 'confirmed'
where institution_id = 'a1000000-0000-4000-8000-000000000001'
  and exam_table_id = 'aa000000-0000-4000-8000-000000000001';
update public.workspace_snapshots
set payload = jsonb_set(payload, '{cronograma,0,id}', '""'::jsonb)
where institution_id = 'a1000000-0000-4000-8000-000000000001'
  and workspace_key = 'main';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
declare
  visible_count integer;
begin
  select jsonb_array_length(payload->'cronograma') into visible_count
  from public.get_student_portal_workspace_snapshot('a1000000-0000-4000-8000-000000000001', 'main');
  if visible_count is distinct from 0 then
    raise exception 'P1_EMPTY_EXAM_MAPPING_VISIBLE: mesa sin ID verificable visible (% mesas)', visible_count;
  end if;
end $$;
\echo PASS empty_exam_mapping_fail_closed

-- RPC docentes restantes: un admin B con UUID conocido no gestiona asignaciones A.
reset role;
select set_config('fixture.subject_assignment_a', id::text, true)
from public.subject_teacher_assignments
where institution_id = 'a1000000-0000-4000-8000-000000000001'
  and teacher_id = 'a2000000-0000-4000-8000-000000000002'
  and subject_id = 'FIX-A-01'
limit 1;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
declare
  assignment_id uuid := current_setting('fixture.subject_assignment_a')::uuid;
  condition_denied boolean := false;
begin
  begin
    perform public.academic_update_teacher_assignment_condition(assignment_id, 'suplente');
  exception when others then
    if sqlerrm = 'No tenes permisos para actualizar la condicion docente.' then
      condition_denied := true;
    else
      raise;
    end if;
  end;
  if not condition_denied then
    raise exception 'P1_ASSIGNMENT_CONDITION_CROSS_TENANT: admin B modificó A';
  end if;
  begin
    perform public.academic_create_teacher_subject_leave(
      'a1000000-0000-4000-8000-000000000001', 'main', array[assignment_id],
      'a2000000-0000-4000-8000-000000000006',
      'a7000000-0000-4000-8000-000000000002', current_date, current_date + 7, 'Fixture'
    );
  exception when others then
    if sqlerrm = 'No tenes permisos para registrar licencias docentes.' then return; end if;
    raise;
  end;
  raise exception 'P1_TEACHER_LEAVE_CROSS_TENANT: admin B registró licencia A';
end $$;
\echo PASS assignment_condition_and_leave_cross_tenant_denied

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
do $$
declare
  assignment_id uuid := current_setting('fixture.subject_assignment_a')::uuid;
begin
  perform public.academic_update_teacher_assignment_condition(assignment_id, 'titular');
  perform public.academic_create_teacher_subject_leave(
    'a1000000-0000-4000-8000-000000000001', 'main', array[assignment_id],
    'a2000000-0000-4000-8000-000000000006',
    'a7000000-0000-4000-8000-000000000002', current_date, current_date + 7, 'Fixture'
  );
end $$;
\echo PASS assignment_condition_and_leave_admin_A

-- Las RPC administrativas de base no aceptan un admin institucional como superadmin global.
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
declare
  denied boolean;
begin
  denied := false;
  begin perform public.update_membership_role('a2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'admin');
  exception when insufficient_privilege then denied := sqlerrm = 'SUPER_ADMIN_REQUIRED'; end;
  if not denied then raise exception 'P1_UPDATE_MEMBERSHIP_ROLE_CROSS_TENANT'; end if;
  denied := false;
  begin perform public.remove_user_membership('a2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001');
  exception when insufficient_privilege then denied := sqlerrm = 'SUPER_ADMIN_REQUIRED'; end;
  if not denied then raise exception 'P1_REMOVE_USER_MEMBERSHIP_CROSS_TENANT'; end if;
  denied := false;
  begin perform public.set_user_access_status('a2000000-0000-4000-8000-000000000003', false);
  exception when insufficient_privilege then denied := sqlerrm = 'SUPER_ADMIN_REQUIRED'; end;
  if not denied then raise exception 'P1_SET_USER_ACCESS_STATUS_CROSS_TENANT'; end if;
  denied := false;
  begin perform public.delete_institution_user('a2000000-0000-4000-8000-000000000003');
  exception when insufficient_privilege then denied := sqlerrm = 'SUPER_ADMIN_REQUIRED'; end;
  if not denied then raise exception 'P1_DELETE_INSTITUTION_USER_CROSS_TENANT'; end if;
end $$;
\echo PASS foundation_admin_rpcs_cross_tenant_denied

-- ConfiguraciÃ³n privada: acceso autenticado, default seguro y rechazo sin identidad.
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
declare config_stage text;
begin
  select stage into config_stage from public.get_academic_transition_config();
  if config_stage is null then raise exception 'ACADEMIC_CONFIG_MISSING'; end if;
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare denied boolean := false;
begin
  begin perform public.get_academic_transition_config();
  exception when insufficient_privilege then denied := sqlerrm = 'AUTH_REQUIRED'; end;
  if not denied then raise exception 'P1_ACADEMIC_CONFIG_NULL_AUTH'; end if;
end $$;
\echo PASS academic_transition_config_auth_guard

-- Funciones internas y de service_role: authenticated/anon no tienen EXECUTE.
reset role;
do $$
begin
  if has_function_privilege('authenticated', 'public.foundation_require_super_admin()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.foundation_active_institution_admin_count(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.teacher_reset_student_subject_academic_records(uuid,text,uuid,uuid,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.teacher_remove_student_subject_records(uuid,text,uuid,uuid,text,text)', 'EXECUTE')
  then raise exception 'P1_INTERNAL_RPC_EXECUTE_GRANTED'; end if;
end $$;
\echo PASS internal_rpc_grants_denied

-- CRUD directo restante: asignaciones docentes A no son accesibles para Admin B.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
declare
  assignment_id uuid := current_setting('fixture.subject_assignment_a')::uuid;
  affected integer;
  denied boolean := false;
begin
  if exists (select 1 from public.subject_teacher_assignments where id = assignment_id) then
    raise exception 'P1_ASSIGNMENT_CROSS_TENANT_SELECT';
  end if;
  update public.subject_teacher_assignments set role = 'suplente' where id = assignment_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'P1_ASSIGNMENT_CROSS_TENANT_UPDATE'; end if;
  delete from public.subject_teacher_assignments where id = assignment_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'P1_ASSIGNMENT_CROSS_TENANT_DELETE'; end if;
  begin
    insert into public.subject_teacher_assignments
      (institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status)
    values
      ('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-02', 'Fixture Career A',
       'a2000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'titular', 'active');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'P1_ASSIGNMENT_CROSS_TENANT_INSERT'; end if;
end $$;
\echo PASS subject_teacher_assignments_crud_cross_tenant_denied

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not exists (select 1 from public.academic_get_student_subject_teacher_notices('a1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'POSITIVE_FAILED: student A no ve aviso docente A'; end if;
end $$;
\echo PASS student_teacher_notices_A

-- RegresiÃ³n adversarial: revocaciÃ³n de acceso con inscripciones residuales.
reset role;
update public.profiles set is_blocked = true
where user_id = 'a2000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (
    select 1 from public.academic_get_student_portal_grades(
      'a1000000-0000-4000-8000-000000000001', 'main'
    )
  ) then raise exception 'P1_BLOCKED_STUDENT_GRADES_RPC_READ: blocked student obtuvo notas'; end if;
  if exists (select 1 from public.academic_get_student_subject_teacher_notices('a1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_BLOCKED_STUDENT_NOTICES_RPC_READ'; end if;
end $$;
\echo PASS blocked_student_reads_denied

reset role;
update public.profiles set is_blocked = false
where user_id = 'a2000000-0000-4000-8000-000000000003';
delete from public.memberships
where user_id = 'a2000000-0000-4000-8000-000000000003'
  and institution_id = 'a1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.academic_get_student_portal_grades('a1000000-0000-4000-8000-000000000001', 'main'))
    or exists (select 1 from public.academic_get_student_subject_teacher_notices('a1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_NO_MEMBERSHIP_STUDENT_RPC_READ'; end if;
end $$;
\echo PASS no_membership_student_reads_denied

reset role;
update public.profiles set is_blocked = true
where user_id = 'a2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.academic_get_teacher_subject_rosters('a1000000-0000-4000-8000-000000000001', 'main'))
    or public.academic_can_manage_subject('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A')
  then raise exception 'P1_BLOCKED_TEACHER_RPC_ACCESS'; end if;
end $$;
\echo PASS blocked_teacher_reads_and_permission_denied

reset role;
update public.profiles set is_blocked = false
where user_id = 'a2000000-0000-4000-8000-000000000002';
delete from public.memberships
where user_id = 'a2000000-0000-4000-8000-000000000002'
  and institution_id = 'a1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.academic_get_teacher_subject_rosters('a1000000-0000-4000-8000-000000000001', 'main'))
    or public.academic_can_manage_subject('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A')
  then raise exception 'P1_NO_MEMBERSHIP_TEACHER_RPC_ACCESS'; end if;
end $$;
\echo PASS no_membership_teacher_reads_and_permission_denied

select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if exists (select 1 from public.academic_get_student_portal_grades('a1000000-0000-4000-8000-000000000001', 'main'))
    or exists (select 1 from public.academic_get_student_subject_teacher_notices('a1000000-0000-4000-8000-000000000001', 'main'))
    or exists (select 1 from public.academic_get_teacher_subject_rosters('a1000000-0000-4000-8000-000000000001', 'main'))
    or public.academic_can_manage_subject('a1000000-0000-4000-8000-000000000001', 'main', 'FIX-A-01', 'Fixture Career A')
  then raise exception 'P1_NULL_AUTH_ANALOGOUS_RPC_ACCESS'; end if;
end $$;
\echo PASS null_auth_analogous_rpcs_denied
\endif

-- Un FK UUID conocido no debe permitir obtener datos de un legajo de otro tenant.
reset role;
insert into public.subject_teacher_assignments
  (institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status)
values
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B',
   'b2000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'titular', 'active');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    insert into public.subject_enrollments
      (institution_id, workspace_key, subject_id, program_id, student_id, student_record_id, status)
    values
      ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B',
       'b2000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000001', 'active');
  exception when foreign_key_violation then
    -- El UUID existe: solo la FK compuesta puede rechazar este vinculo.
    return;
  end;
  raise exception 'P1_CROSS_TENANT_ENROLLMENT_INSERT_ACCEPTED';
end $$;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (
    select 1 from public.academic_get_teacher_subject_rosters('b1000000-0000-4000-8000-000000000001', 'main')
    where "subjectId" = 'FIX-B-ADVERSARIAL' and "fullName" = 'Student A'
  ) then
    raise exception 'P1_ROSTER_CROSS_TENANT_LEGAJO: teacher B obtuvo nombre de legajo A mediante FK en enrollment B';
  end if;
end $$;
\echo PASS roster_cross_tenant_legajo_denied

-- Inscripcion legitima B por la RPC existente y roster del docente asignado.
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
select public.upsert_subject_enrollment_from_portal(
  'b1000000-0000-4000-8000-000000000001', 'main',
  'b2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000003',
  'FIX-B-ADVERSARIAL', 'Fixture Career B', 'b8000000-0000-4000-8000-000000000001'
);
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if not exists (select 1 from public.academic_get_teacher_subject_rosters('b1000000-0000-4000-8000-000000000001', 'main') where "fullName" = 'Student B')
  then raise exception 'POSITIVE_FAILED: legitimate roster B'; end if;
  if exists (select 1 from public.academic_get_teacher_subject_rosters('a1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_ROSTER_CROSS_TENANT'; end if;
end $$;
\echo PASS focal_student_teacher_B_and_cross_tenant

-- La RPC tampoco puede persistir un legajo de otro tenant/workspace.
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.upsert_subject_enrollment_from_portal(
      'b1000000-0000-4000-8000-000000000001', 'main',
      'b2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000003',
      'FIX-B-ADVERSARIAL', 'Fixture Career B', 'a8000000-0000-4000-8000-000000000001'
    );
  exception when foreign_key_violation then return; end;
  raise exception 'P1_RPC_CROSS_TENANT_RECORD_ACCEPTED';
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if exists (select 1 from public.academic_get_teacher_subject_rosters('b1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_NULL_AUTH_ROSTER'; end if;
end $$;
\echo PASS focal_rpc_cross_tenant_record_and_null_auth_denied

-- Lectura fail-closed ante una fila antigua invalida: FK retirada solo
-- dentro de un savepoint local y restaurada mediante rollback.
reset role;
savepoint legacy_invalid_record;
alter table public.subject_enrollments drop constraint subject_enrollments_student_record_scope_fkey;
update public.subject_enrollments set student_record_id = 'a8000000-0000-4000-8000-000000000001'
where institution_id = 'b1000000-0000-4000-8000-000000000001' and subject_id = 'FIX-B-ADVERSARIAL';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.academic_get_teacher_subject_rosters('b1000000-0000-4000-8000-000000000001', 'main') where "subjectId" = 'FIX-B-ADVERSARIAL')
  then raise exception 'P1_LEGACY_INVALID_RECORD_ROSTER_VISIBLE'; end if;
end $$;
rollback to savepoint legacy_invalid_record;
\echo PASS focal_legacy_invalid_record_hidden

-- Tampoco revelar el perfil de respaldo de un student_id ajeno sin legajo.
reset role;
savepoint foreign_student_profile;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
insert into public.subject_enrollments
  (institution_id, workspace_key, subject_id, program_id, student_id, student_record_id, status)
values
  ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B',
   'a2000000-0000-4000-8000-000000000003', null, 'active');
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.academic_get_teacher_subject_rosters('b1000000-0000-4000-8000-000000000001', 'main')
    where "studentId" = 'a2000000-0000-4000-8000-000000000003')
  then raise exception 'P1_ROSTER_CROSS_TENANT_PROFILE_FALLBACK'; end if;
end $$;
rollback to savepoint foreign_student_profile;
\echo PASS focal_foreign_student_profile_hidden

reset role;
do $$
begin
  begin
    update public.subject_enrollments set workspace_key = 'other'
    where institution_id = 'b1000000-0000-4000-8000-000000000001' and subject_id = 'FIX-B-ADVERSARIAL';
  exception when foreign_key_violation then return; end;
  raise exception 'P1_ENROLLMENT_RECORD_WORKSPACE_MISMATCH';
end $$;
delete from public.student_records where id = 'b8000000-0000-4000-8000-000000000001';
do $$
begin
  if not exists (
    select 1 from public.subject_enrollments
    where institution_id = 'b1000000-0000-4000-8000-000000000001'
      and workspace_key = 'main' and subject_id = 'FIX-B-ADVERSARIAL'
      and student_record_id is null
  ) then raise exception 'FK_DELETE_SEMANTICS_REGRESSION'; end if;
end $$;
\echo PASS focal_workspace_guard_and_record_delete_set_null
\endif

-- Caso pendiente: el aviso de licencia no debe resolver un legajo docente ajeno.
reset role;
select set_config('fixture.assignment_b', id::text, true)
from public.subject_teacher_assignments
where institution_id = 'b1000000-0000-4000-8000-000000000001' and subject_id = 'FIX-B-ADVERSARIAL'
  and teacher_id = 'b2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
declare denied boolean := false;
begin
  begin
    update public.subject_teacher_assignments set teacher_record_id = 'a7000000-0000-4000-8000-000000000001'
    where id = current_setting('fixture.assignment_b')::uuid;
  exception when foreign_key_violation then denied := true; end;
  if not denied then raise exception 'P1_TEACHER_RECORD_CROSS_TENANT_UPDATE_ACCEPTED'; end if;
  denied := false;
  begin
    insert into public.subject_teacher_assignments
      (institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id)
    values
      ('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B',
       'b2000000-0000-4000-8000-000000000006', 'a7000000-0000-4000-8000-000000000001');
  exception when foreign_key_violation then denied := true; end;
  if not denied then raise exception 'P1_TEACHER_RECORD_CROSS_TENANT_INSERT_ACCEPTED'; end if;
  denied := false;
  begin
    perform public.academic_create_teacher_subject_leave(
      'b1000000-0000-4000-8000-000000000001', 'main', array[current_setting('fixture.assignment_b')::uuid],
      'b2000000-0000-4000-8000-000000000006', 'a7000000-0000-4000-8000-000000000001', current_date, current_date + 7, 'Fixture'
    );
  exception when foreign_key_violation then denied := true; end;
  if not denied then raise exception 'P1_TEACHER_RECORD_CROSS_TENANT_RPC_ACCEPTED'; end if;
  if not exists (select 1 from public.subject_teacher_assignments where id = current_setting('fixture.assignment_b')::uuid and role = 'titular')
  then raise exception 'RPC_FAILURE_PARTIAL_MUTATION'; end if;
end $$;
\echo PASS notices_cross_tenant_insert_update_rpc_denied
select public.academic_create_teacher_subject_leave(
  'b1000000-0000-4000-8000-000000000001', 'main', array[current_setting('fixture.assignment_b')::uuid],
  'b2000000-0000-4000-8000-000000000006', 'b7000000-0000-4000-8000-000000000002', current_date, current_date + 7, 'Fixture'
);
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not exists (
    select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main')
    where "teacherOnLeave" = 'Teacher B' and "replacementTeacher" = 'Teacher B Replacement'
  ) then raise exception 'POSITIVE_FAILED: notices B legitimate'; end if;
  if exists (
    select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main')
    where "teacherOnLeave" = 'Teacher A'
  ) then
    raise exception 'P1_NOTICES_CROSS_TENANT_TEACHER_RECORD: student B obtuvo nombre de docente A mediante asignacion B';
  end if;
end $$;
\echo PASS notices_cross_tenant_teacher_record_denied

\if :{?notices_tenant_focal}
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not exists (select 1 from public.academic_get_student_subject_teacher_notices('a1000000-0000-4000-8000-000000000001', 'main') where "teacherOnLeave" = 'Teacher A' and "replacementTeacher" = 'Teacher A Replacement')
  then raise exception 'POSITIVE_FAILED: notices A legitimate'; end if;
  if exists (select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_NOTICES_CROSS_TENANT_CALL'; end if;
end $$;
\echo PASS notices_A_legitimate_and_cross_tenant_denied
\endif

reset role;
savepoint blocked_notices;
update public.profiles set is_blocked = true where user_id = 'b2000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_BLOCKED_NOTICES_READ'; end if;
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if exists (select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_NULL_AUTH_NOTICES_READ'; end if;
end $$;
rollback to savepoint blocked_notices;
\echo PASS notices_blocked_and_null_auth_denied

-- Corrupcion historica: retirada temporal de FK solo dentro de savepoints.
reset role;
savepoint historical_invalid_leave;
alter table public.subject_teacher_assignments drop constraint subject_teacher_assignments_teacher_record_scope_fkey;
update public.subject_teacher_assignments set teacher_record_id = 'a7000000-0000-4000-8000-000000000001'
where id = current_setting('fixture.assignment_b')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_HISTORICAL_FOREIGN_LEAVE_RECORD_VISIBLE'; end if;
end $$;
rollback to savepoint historical_invalid_leave;
savepoint historical_invalid_replacement;
alter table public.subject_teacher_assignments drop constraint subject_teacher_assignments_teacher_record_scope_fkey;
update public.subject_teacher_assignments set teacher_record_id = 'a7000000-0000-4000-8000-000000000001'
where institution_id = 'b1000000-0000-4000-8000-000000000001' and teacher_id = 'b2000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not exists (select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main') where "teacherOnLeave" = 'Teacher B' and "replacementTeacher" = 'docente suplente')
  then raise exception 'P1_HISTORICAL_FOREIGN_REPLACEMENT_RECORD_VISIBLE'; end if;
end $$;
rollback to savepoint historical_invalid_replacement;
\echo PASS notices_historical_foreign_records_fail_closed

savepoint foreign_leave_profile;
update public.subject_teacher_assignments set teacher_id = 'a2000000-0000-4000-8000-000000000002', teacher_record_id = null
where id = current_setting('fixture.assignment_b')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main'))
  then raise exception 'P1_FOREIGN_LEAVE_PROFILE_VISIBLE'; end if;
end $$;
rollback to savepoint foreign_leave_profile;
savepoint foreign_replacement_profile;
update public.subject_teacher_assignments set teacher_id = 'a2000000-0000-4000-8000-000000000002', teacher_record_id = null
where institution_id = 'b1000000-0000-4000-8000-000000000001' and teacher_id = 'b2000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not exists (select 1 from public.academic_get_student_subject_teacher_notices('b1000000-0000-4000-8000-000000000001', 'main') where "teacherOnLeave" = 'Teacher B' and "replacementTeacher" = 'docente suplente')
  then raise exception 'P1_FOREIGN_REPLACEMENT_PROFILE_VISIBLE'; end if;
end $$;
rollback to savepoint foreign_replacement_profile;
\echo PASS notices_foreign_profile_fallbacks_hidden

reset role;
do $$
begin
  begin
    update public.subject_teacher_assignments set workspace_key = 'other' where id = current_setting('fixture.assignment_b')::uuid;
  exception when foreign_key_violation then return; end;
  raise exception 'P1_TEACHER_RECORD_WORKSPACE_MISMATCH';
end $$;
delete from public.teacher_records where id = 'b7000000-0000-4000-8000-000000000002';
do $$
begin
  if not exists (select 1 from public.subject_teacher_assignments where institution_id = 'b1000000-0000-4000-8000-000000000001'
    and workspace_key = 'main' and teacher_id = 'b2000000-0000-4000-8000-000000000006' and teacher_record_id is null)
  then raise exception 'TEACHER_RECORD_DELETE_SET_NULL_REGRESSION'; end if;
end $$;
\echo PASS notices_workspace_guard_and_delete_set_null
\endif

-- Caso pendiente: UUID de inscripcion proporcionado no saltea su scope canonico.
reset role;
select set_config('fixture.foreign_enrollment_a', id::text, true)
from public.subject_enrollments
where institution_id = 'a1000000-0000-4000-8000-000000000001'
  and student_id = 'a2000000-0000-4000-8000-000000000003'
  and subject_id = 'FIX-A-01';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000006', true);
do $$
declare
  saved_enrollment_id uuid;
begin
  if not public.academic_can_manage_subject('b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B') then
    raise exception 'HARNESS_ERROR: replacement teacher B not authorized for own subject';
  end if;
  begin
    select subject_enrollment_id into saved_enrollment_id
    from public.academic_teacher_upsert_student_grade(
      'b1000000-0000-4000-8000-000000000001', 'main',
      'b2000000-0000-4000-8000-000000000003', null,
      current_setting('fixture.foreign_enrollment_a')::uuid,
      'FIX-B-ADVERSARIAL', 'Fixture Career B', 'partial', 2, 7, 'regular', null
    );
  exception when foreign_key_violation then return;
    when others then
      if sqlerrm in ('ACADEMIC_COMMAND_FORBIDDEN', 'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND') then return; end if;
      raise;
  end;
  raise exception 'P1_GRADE_FOREIGN_ENROLLMENT_ACCEPTED: la RPC no denego el UUID ajeno (resultado %)', saved_enrollment_id;
end $$;
\echo PASS grade_foreign_enrollment_denied

reset role;
select set_config('fixture.enrollment_b', id::text, true)
from public.subject_enrollments where institution_id = 'b1000000-0000-4000-8000-000000000001'
  and subject_id = 'FIX-B-ADVERSARIAL' and student_id = 'b2000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000006', true);
do $$
declare saved public.student_grades%rowtype; updated public.student_grades%rowtype;
begin
  select * into saved from public.academic_teacher_upsert_student_grade(
    'b1000000-0000-4000-8000-000000000001', 'main', 'b2000000-0000-4000-8000-000000000003', null,
    current_setting('fixture.enrollment_b')::uuid, 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'partial', 2, 7, 'regular', null
  );
  if saved.subject_enrollment_id is distinct from current_setting('fixture.enrollment_b')::uuid
  then raise exception 'POSITIVE_FAILED: grade B'; end if;
  select * into updated from public.academic_teacher_upsert_student_grade(
    'b1000000-0000-4000-8000-000000000001', 'main', 'b2000000-0000-4000-8000-000000000003', null,
    null, 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'partial', 2, 9, 'regular', saved.lock_version
  );
  if updated.id is distinct from saved.id or updated.lock_version <> saved.lock_version + 1
    or updated.subject_enrollment_id is distinct from saved.subject_enrollment_id
  then raise exception 'POSITIVE_FAILED: grade B resolve/update'; end if;
  perform set_config('fixture.grade_b', saved.id::text, true);
end $$;
\echo PASS grade_teacher_B_valid_insert_resolve_update

\if :{?grade_tenant_focal}
do $$
declare bad record; denied boolean; before_version integer;
begin
  select lock_version into before_version from public.student_grades where id = current_setting('fixture.grade_b')::uuid;
  for bad in select * from (values
    ('main', 'a2000000-0000-4000-8000-000000000003'::uuid, 'FIX-B-ADVERSARIAL', 'Fixture Career B', null::uuid),
    ('main', 'b2000000-0000-4000-8000-000000000003'::uuid, 'FIX-B-WRONG', 'Fixture Career B', null::uuid),
    ('other', 'b2000000-0000-4000-8000-000000000003'::uuid, 'FIX-B-ADVERSARIAL', 'Fixture Career B', null::uuid),
    ('main', 'b2000000-0000-4000-8000-000000000003'::uuid, 'FIX-B-ADVERSARIAL', 'Other Career B', null::uuid),
    ('main', 'b2000000-0000-4000-8000-000000000003'::uuid, 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'a8000000-0000-4000-8000-000000000001'::uuid)
  ) as cases(workspace, student, subject, program, student_record)
  loop
    denied := false;
    begin
      perform public.academic_teacher_upsert_student_grade(
        'b1000000-0000-4000-8000-000000000001', bad.workspace, bad.student, bad.student_record,
        current_setting('fixture.enrollment_b')::uuid, bad.subject, bad.program, 'partial', 2, 1, 'regular', null
      );
    exception when others then
      if sqlerrm = 'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND' then denied := true; else raise; end if;
    end;
    if not denied then raise exception 'P1_GRADE_CONTEXT_MISMATCH_ACCEPTED: %', bad; end if;
  end loop;
  if (select lock_version from public.student_grades where id = current_setting('fixture.grade_b')::uuid) is distinct from before_version
  then raise exception 'GRADE_REJECTION_MUTATED_ROW'; end if;
end $$;
\echo PASS grade_student_subject_workspace_program_record_mismatch_denied
\endif

reset role;
savepoint blocked_grade_actor;
update public.profiles set is_blocked = true where user_id = 'b2000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000006', true);
do $$
begin
  begin
    perform public.academic_teacher_upsert_student_grade('b1000000-0000-4000-8000-000000000001', 'main',
      'b2000000-0000-4000-8000-000000000003', null, current_setting('fixture.enrollment_b')::uuid,
      'FIX-B-ADVERSARIAL', 'Fixture Career B', 'partial', 2, 1, 'regular', null);
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then return; end if; raise;
  end;
  raise exception 'P1_BLOCKED_GRADE_ACTOR_ACCEPTED';
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform public.academic_teacher_upsert_student_grade('b1000000-0000-4000-8000-000000000001', 'main',
      'b2000000-0000-4000-8000-000000000003', null, current_setting('fixture.enrollment_b')::uuid,
      'FIX-B-ADVERSARIAL', 'Fixture Career B', 'partial', 2, 1, 'regular', null);
  exception when others then
    if sqlerrm = 'Faltan datos para guardar la nota.' then return; end if; raise;
  end;
  raise exception 'P1_NULL_AUTH_GRADE_ACTOR_ACCEPTED';
end $$;
rollback to savepoint blocked_grade_actor;
\echo PASS grade_blocked_and_null_auth_denied

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
declare denied boolean := false;
begin
  begin
    insert into public.student_grades
      (institution_id, workspace_key, student_id, subject_enrollment_id, subject_id, program_id, grade_type, attempt_number)
    values ('b1000000-0000-4000-8000-000000000001', 'main', 'b2000000-0000-4000-8000-000000000003',
      current_setting('fixture.foreign_enrollment_a')::uuid, 'FIX-B-ADVERSARIAL', 'Fixture Career B', 'partial', 10);
  exception when foreign_key_violation then denied := true; end;
  if not denied then raise exception 'P1_GRADE_DIRECT_FOREIGN_ENROLLMENT_INSERT'; end if;
  denied := false;
  begin
    update public.student_grades set subject_enrollment_id = current_setting('fixture.foreign_enrollment_a')::uuid
    where id = current_setting('fixture.grade_b')::uuid;
  exception when foreign_key_violation then denied := true; end;
  if not denied then raise exception 'P1_GRADE_DIRECT_FOREIGN_ENROLLMENT_UPDATE'; end if;
end $$;
\echo PASS grade_fk_direct_cross_tenant_writes_denied
reset role;
savepoint grade_fk_delete_check;
delete from public.subject_enrollments where id = current_setting('fixture.enrollment_b')::uuid;
do $$
begin
  if not exists (select 1 from public.student_grades where id = current_setting('fixture.grade_b')::uuid
    and institution_id = 'b1000000-0000-4000-8000-000000000001' and workspace_key = 'main' and subject_enrollment_id is null)
  then raise exception 'GRADE_ENROLLMENT_DELETE_SET_NULL_REGRESSION'; end if;
end $$;
rollback to savepoint grade_fk_delete_check;
\echo PASS grade_fk_delete_set_null
\endif

-- Caso pendiente: la RPC de asistencia valida el UUID de inscripcion recibido.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000006', true);
do $$
declare session_b uuid;
begin
  select id into session_b from public.academic_teacher_create_class_session(
    'b1000000-0000-4000-8000-000000000001', 'main', 'FIX-B-ADVERSARIAL', 'Fixture Career B', current_date, 'Attendance FK probe'
  );
  if session_b is null then raise exception 'HARNESS_ERROR: authorized class B not created'; end if;
  perform set_config('fixture.session_b', session_b::text, true);
  begin
    perform public.academic_teacher_upsert_attendance_records(session_b,
      jsonb_build_array(jsonb_build_object(
        'student_id', 'b2000000-0000-4000-8000-000000000003',
        'subject_enrollment_id', current_setting('fixture.foreign_enrollment_a'), 'status', 'present'
      ))
    );
  exception when foreign_key_violation then return;
    when others then
      if sqlerrm in ('ACADEMIC_COMMAND_FORBIDDEN', 'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND') then return; end if;
      raise;
  end;
  raise exception 'P1_ATTENDANCE_FOREIGN_ENROLLMENT_ACCEPTED: teacher B guardo asistencia B vinculada a enrollment A';
end $$;
\echo PASS attendance_foreign_enrollment_denied

do $$
declare saved public.subject_attendance_records%rowtype; updated public.subject_attendance_records%rowtype;
begin
  select * into saved from public.academic_teacher_upsert_attendance_records(current_setting('fixture.session_b')::uuid,
    jsonb_build_array(jsonb_build_object('student_id', 'b2000000-0000-4000-8000-000000000003',
      'subject_enrollment_id', current_setting('fixture.enrollment_b'), 'status', 'present')));
  if saved.subject_enrollment_id is distinct from current_setting('fixture.enrollment_b')::uuid
    or saved.session_id is distinct from current_setting('fixture.session_b')::uuid
  then raise exception 'POSITIVE_FAILED: attendance B'; end if;
  select * into updated from public.academic_teacher_upsert_attendance_records(current_setting('fixture.session_b')::uuid,
    '[{"student_id":"b2000000-0000-4000-8000-000000000003","status":"absent"}]'::jsonb);
  if updated.id is distinct from saved.id or updated.status is distinct from 'absent'
    or updated.subject_enrollment_id is distinct from saved.subject_enrollment_id
  then raise exception 'POSITIVE_FAILED: attendance B resolve/update'; end if;
  perform set_config('fixture.attendance_b', saved.id::text, true);
end $$;
\echo PASS attendance_B_valid_insert_resolve_update

\if :{?attendance_tenant_focal}
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
declare saved public.subject_attendance_records%rowtype;
begin
  select * into saved from public.academic_teacher_upsert_attendance_records('ac000000-0000-4000-8000-000000000001',
    '[{"student_id":"a2000000-0000-4000-8000-000000000003","subject_enrollment_id":"ae000000-0000-4000-8000-000000000001","status":"present"}]'::jsonb);
  if saved.institution_id is distinct from 'a1000000-0000-4000-8000-000000000001'::uuid
    or saved.subject_enrollment_id is distinct from 'ae000000-0000-4000-8000-000000000001'::uuid
  then raise exception 'POSITIVE_FAILED: attendance A'; end if;
end $$;
\echo PASS attendance_A_valid
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000006', true);
do $$
declare bad record; denied boolean;
begin
  for bad in select * from (values
    (current_setting('fixture.session_b')::uuid, 'a2000000-0000-4000-8000-000000000003'::uuid),
    ('bc000000-0000-4000-8000-000000000002'::uuid, 'b2000000-0000-4000-8000-000000000003'::uuid),
    ('bc000000-0000-4000-8000-000000000003'::uuid, 'b2000000-0000-4000-8000-000000000003'::uuid),
    ('bc000000-0000-4000-8000-000000000004'::uuid, 'b2000000-0000-4000-8000-000000000003'::uuid),
    ('ac000000-0000-4000-8000-000000000001'::uuid, 'b2000000-0000-4000-8000-000000000003'::uuid),
    (current_setting('fixture.session_b')::uuid, null::uuid)
  ) as cases(session_id, student_id)
  loop
    denied := false;
    begin
      perform public.academic_teacher_upsert_attendance_records(bad.session_id,
        jsonb_build_array(jsonb_build_object('student_id', bad.student_id,
          'subject_enrollment_id', current_setting('fixture.enrollment_b'), 'status', 'late')));
    exception when others then
      if sqlerrm in ('ACADEMIC_COMMAND_FORBIDDEN', 'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND') then denied := true; else raise; end if;
    end;
    if not denied then raise exception 'P1_ATTENDANCE_CONTEXT_MISMATCH_ACCEPTED: %', bad; end if;
  end loop;
  if (select status from public.subject_attendance_records where id = current_setting('fixture.attendance_b')::uuid) is distinct from 'absent'
  then raise exception 'ATTENDANCE_REJECTION_MUTATED_ROW'; end if;
end $$;
\echo PASS attendance_student_subject_program_workspace_class_missing_data_denied
\endif

do $$
declare denied boolean := false;
begin
  begin
    perform public.academic_teacher_upsert_attendance_records(current_setting('fixture.session_b')::uuid,
      jsonb_build_array(
        jsonb_build_object('student_id', 'b2000000-0000-4000-8000-000000000003', 'subject_enrollment_id', current_setting('fixture.enrollment_b'), 'status', 'late'),
        jsonb_build_object('student_id', 'a2000000-0000-4000-8000-000000000003', 'subject_enrollment_id', current_setting('fixture.foreign_enrollment_a'), 'status', 'late')
      ));
  exception when others then
    if sqlerrm = 'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND' then denied := true; else raise; end if;
  end;
  if not denied then raise exception 'P1_ATTENDANCE_INVALID_BATCH_ACCEPTED'; end if;
  if (select status from public.subject_attendance_records where id = current_setting('fixture.attendance_b')::uuid) is distinct from 'absent'
  then raise exception 'P1_ATTENDANCE_BATCH_PARTIAL_MUTATION'; end if;
end $$;
\echo PASS attendance_batch_atomic_rejection

reset role;
savepoint attendance_blocked_actor;
update public.profiles set is_blocked = true where user_id = 'b2000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000006', true);
do $$
begin
  begin
    perform public.academic_teacher_upsert_attendance_records(current_setting('fixture.session_b')::uuid,
      jsonb_build_array(jsonb_build_object('student_id', 'b2000000-0000-4000-8000-000000000003', 'subject_enrollment_id', current_setting('fixture.enrollment_b'))));
  exception when others then
    if sqlerrm = 'ACADEMIC_COMMAND_FORBIDDEN' then return; end if; raise;
  end;
  raise exception 'P1_BLOCKED_ATTENDANCE_ACTOR';
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform public.academic_teacher_upsert_attendance_records(current_setting('fixture.session_b')::uuid, '[]'::jsonb);
  exception when others then
    if sqlerrm = 'SUBJECT_CLASS_SESSION_NOT_FOUND' then return; end if; raise;
  end;
  raise exception 'P1_NULL_AUTH_ATTENDANCE_ACTOR';
end $$;
rollback to savepoint attendance_blocked_actor;
\echo PASS attendance_blocked_and_null_auth_denied

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    update public.subject_attendance_records set subject_enrollment_id = current_setting('fixture.foreign_enrollment_a')::uuid
    where id = current_setting('fixture.attendance_b')::uuid;
  exception when foreign_key_violation then return; end;
  raise exception 'P1_ATTENDANCE_DIRECT_FOREIGN_ENROLLMENT_ACCEPTED';
end $$;
reset role;
savepoint attendance_delete_semantics;
delete from public.subject_enrollments where id = current_setting('fixture.enrollment_b')::uuid;
do $$
begin
  if not exists (select 1 from public.subject_attendance_records where id = current_setting('fixture.attendance_b')::uuid
    and institution_id = 'b1000000-0000-4000-8000-000000000001' and workspace_key = 'main' and subject_enrollment_id is null)
  then raise exception 'ATTENDANCE_ENROLLMENT_DELETE_SET_NULL_REGRESSION'; end if;
end $$;
delete from public.subject_class_sessions where id = current_setting('fixture.session_b')::uuid;
do $$
begin
  if exists (select 1 from public.subject_attendance_records where id = current_setting('fixture.attendance_b')::uuid)
  then raise exception 'ATTENDANCE_CLASS_DELETE_CASCADE_REGRESSION'; end if;
end $$;
rollback to savepoint attendance_delete_semantics;
\echo PASS attendance_fk_cross_tenant_and_delete_semantics

-- Cierre del inventario: solo en la matriz completa, no en modos focales.
\if :{?attendance_tenant_focal}
\else
\if :{?grade_tenant_focal}
\else
\if :{?notices_tenant_focal}
\else
\if :{?roster_tenant_focal}
\else
reset role;
do $$
declare table_name text; fixture_row jsonb;
begin
  foreach table_name in array array['subject_class_sessions', 'subject_attendance_records', 'student_grades'] loop
    execute format('select to_jsonb(t) from public.%I t where institution_id = $1 limit 1', table_name)
      into fixture_row using 'a1000000-0000-4000-8000-000000000001'::uuid;
    if fixture_row is null then raise exception 'HARNESS_ERROR: missing A row in %', table_name; end if;
    perform set_config('fixture.crud_' || table_name, fixture_row::text, true);
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
do $$
declare table_name text; rows_found bigint; denied boolean; fixture_row jsonb;
begin
  foreach table_name in array array['subject_class_sessions', 'subject_attendance_records', 'student_grades'] loop
    execute format('select count(*) from public.%I where institution_id = $1', table_name)
      into rows_found using 'a1000000-0000-4000-8000-000000000001'::uuid;
    if rows_found <> 0 then raise exception 'P1_REMAINING_SELECT_CROSS_TENANT: %', table_name; end if;
    execute format('update public.%I set workspace_key = workspace_key where institution_id = $1', table_name)
      using 'a1000000-0000-4000-8000-000000000001'::uuid;
    get diagnostics rows_found = row_count;
    if rows_found <> 0 then raise exception 'P1_REMAINING_UPDATE_CROSS_TENANT: %', table_name; end if;
    execute format('delete from public.%I where institution_id = $1', table_name)
      using 'a1000000-0000-4000-8000-000000000001'::uuid;
    get diagnostics rows_found = row_count;
    if rows_found <> 0 then raise exception 'P1_REMAINING_DELETE_CROSS_TENANT: %', table_name; end if;
    fixture_row := jsonb_set(current_setting('fixture.crud_' || table_name)::jsonb, '{id}', to_jsonb(gen_random_uuid()));
    denied := false;
    begin
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', table_name, table_name)
        using fixture_row;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'P1_REMAINING_INSERT_CROSS_TENANT: %', table_name; end if;
  end loop;
  if public.is_super_admin() or public.is_member_of_institution('a1000000-0000-4000-8000-000000000001')
    or not public.is_member_of_institution('b1000000-0000-4000-8000-000000000001')
  then raise exception 'P1_FOUNDATION_HELPER_TENANT_GUARD'; end if;
end $$;
\echo PASS remaining_class_attendance_grade_crud_and_helpers
reset role;
savepoint remaining_superadmin_positive;
update public.profiles set is_global_admin = true where user_id = 'b2000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
begin
  if not public.is_super_admin() then raise exception 'SUPERADMIN_POSITIVE_FAILED'; end if;
end $$;
rollback to savepoint remaining_superadmin_positive;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000004', true);
do $$
begin
  if public.is_super_admin() or public.is_member_of_institution('a1000000-0000-4000-8000-000000000001')
  then raise exception 'P1_BLOCKED_FOUNDATION_HELPER'; end if;
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if public.is_super_admin() or public.is_member_of_institution('a1000000-0000-4000-8000-000000000001')
  then raise exception 'P1_NULL_AUTH_FOUNDATION_HELPER'; end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
    or has_function_privilege('anon', 'public.is_super_admin()', 'EXECUTE')
    or has_function_privilege('anon', 'public.is_member_of_institution(uuid,text[])', 'EXECUTE')
  then raise exception 'P1_INTERNAL_TRIGGER_HELPER_EXECUTE'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare dto jsonb;
begin
  select to_jsonb(s) into dto from public.get_public_app_status() s;
  if dto is null or (select array_agg(key order by key) from jsonb_object_keys(dto) key)
    is distinct from array['maintenance_enabled','maintenance_message','updated_at']::text[]
  then raise exception 'PUBLIC_APP_STATUS_DTO_MISMATCH'; end if;
  if (select count(*) from public.list_active_login_institutions()
    where id in ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001') and status = 'active') <> 2
  then raise exception 'PUBLIC_LOGIN_INSTITUTIONS_MISSING'; end if;
  if exists (select 1 from public.list_active_login_institutions() where status <> 'active')
  then raise exception 'PUBLIC_LOGIN_INACTIVE_VISIBLE'; end if;
end $$;
\echo PASS public_login_contract_and_internal_grants
reset role;
savepoint public_contract_filtering;
update public.institutions set status = 'suspended' where id = 'b1000000-0000-4000-8000-000000000001';
insert into public.app_settings(key, value, is_public) values
  ('maintenance_mode', '{"enabled":true,"message":"PRIVATE_FIXTURE_DO_NOT_EXPOSE"}', false)
on conflict(key) do update set value = excluded.value, is_public = false;
set local role anon;
do $$
begin
  if exists (select 1 from public.list_active_login_institutions() where id = 'b1000000-0000-4000-8000-000000000001')
  then raise exception 'PUBLIC_LOGIN_SUSPENDED_VISIBLE'; end if;
  if exists (select 1 from public.get_public_app_status() where maintenance_enabled or maintenance_message = 'PRIVATE_FIXTURE_DO_NOT_EXPOSE')
  then raise exception 'P1_PUBLIC_STATUS_PRIVATE_SETTING_EXPOSED'; end if;
end $$;
rollback to savepoint public_contract_filtering;
\echo PASS public_login_suspended_and_private_setting_hidden
\endif
\endif
\endif
\endif

rollback;
