-- ============================================================
-- Repair etapa 5: conexiones relacionales portal alumno/docente
-- Agrega lecturas RPC para roster docente, notas de alumno y avisos de reemplazo/licencia.
-- ============================================================
create or replace function public.academic_get_teacher_subject_rosters(
  p_institution_id uuid,
  p_workspace_key text default 'main'
)
returns table (
  "enrollmentId" uuid,
  "subjectId" text,
  "programId" text,
  "studentId" uuid,
  "studentRecordId" uuid,
  "fullName" text,
  dni text,
  email text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with context as (
    select
      (select auth.uid()) as actor_id,
      coalesce(nullif(btrim(p_workspace_key), ''), 'main') as workspace_key
  ),
  accessible_subjects as (
    select distinct
      assignment.subject_id,
      assignment.program_id
    from public.subject_teacher_assignments assignment
    cross join context
    where assignment.institution_id = p_institution_id
      and assignment.workspace_key = context.workspace_key
      and assignment.teacher_id = context.actor_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and assignment.role in ('titular', 'suplente')
  ),
  active_enrollments as (
    select distinct on (
      enrollment.student_id,
      enrollment.student_record_id,
      enrollment.subject_id,
      enrollment.program_id
    )
      enrollment.*
    from public.subject_enrollments enrollment
    join accessible_subjects subject
      on subject.subject_id = enrollment.subject_id
     and subject.program_id = enrollment.program_id
    cross join context
    where enrollment.institution_id = p_institution_id
      and enrollment.workspace_key = context.workspace_key
      and enrollment.status in ('active', 'enrolled')
      and enrollment.deleted_at is null
    order by
      enrollment.student_id,
      enrollment.student_record_id,
      enrollment.subject_id,
      enrollment.program_id,
      enrollment.updated_at desc nulls last,
      enrollment.created_at desc nulls last
  )
  select
    enrollment.id as "enrollmentId",
    enrollment.subject_id as "subjectId",
    enrollment.program_id as "programId",
    enrollment.student_id as "studentId",
    enrollment.student_record_id as "studentRecordId",
    coalesce(
      nullif(btrim(student_record.full_name), ''),
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(profile.email), ''),
      'Alumno sin nombre registrado'
    ) as "fullName",
    coalesce(nullif(btrim(student_record.dni), ''), nullif(btrim(student_record.national_id), '')) as dni,
    coalesce(nullif(btrim(student_record.email), ''), nullif(btrim(profile.email), '')) as email
  from active_enrollments enrollment
  left join public.student_records student_record
    on student_record.id = enrollment.student_record_id
    or (
      student_record.profile_id is not null
      and student_record.profile_id = enrollment.student_id
      and student_record.institution_id = enrollment.institution_id
      and student_record.workspace_key = enrollment.workspace_key
    )
  left join public.profiles profile
    on profile.user_id = enrollment.student_id
  order by "fullName", "subjectId", "programId";
$$;

create or replace function public.academic_get_student_subject_teacher_notices(
  p_institution_id uuid,
  p_workspace_key text default 'main'
)
returns table (
  "subjectId" text,
  "programId" text,
  "teacherOnLeave" text,
  "replacementTeacher" text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with context as (
    select
      (select auth.uid()) as actor_id,
      coalesce(nullif(btrim(p_workspace_key), ''), 'main') as workspace_key,
      current_date as today
  ),
  active_student_subjects as (
    select distinct
      enrollment.subject_id,
      enrollment.program_id
    from public.subject_enrollments enrollment
    cross join context
    where enrollment.institution_id = p_institution_id
      and enrollment.workspace_key = context.workspace_key
      and enrollment.student_id = context.actor_id
      and enrollment.status in ('active', 'enrolled')
      and enrollment.deleted_at is null
  ),
  active_leaves as (
    select
      leave_assignment.*
    from public.subject_teacher_assignments leave_assignment
    join active_student_subjects subject
      on subject.subject_id = leave_assignment.subject_id
     and subject.program_id = leave_assignment.program_id
    cross join context
    where leave_assignment.institution_id = p_institution_id
      and leave_assignment.workspace_key = context.workspace_key
      and leave_assignment.status = 'active'
      and leave_assignment.deleted_at is null
      and leave_assignment.role = 'licencia'
      and (
        nullif(leave_assignment.metadata ->> 'leave_starts_on', '') is null
        or (leave_assignment.metadata ->> 'leave_starts_on')::date <= context.today
      )
      and (
        nullif(leave_assignment.metadata ->> 'leave_ends_on', '') is null
        or context.today <= (leave_assignment.metadata ->> 'leave_ends_on')::date
      )
  )
  select distinct
    leave_assignment.subject_id as "subjectId",
    leave_assignment.program_id as "programId",
    coalesce(
      nullif(btrim(leave_teacher.full_name), ''),
      nullif(btrim(leave_profile.display_name), ''),
      nullif(btrim(leave_profile.email), ''),
      'docente titular'
    ) as "teacherOnLeave",
    coalesce(
      nullif(btrim(replacement_teacher.full_name), ''),
      nullif(btrim(replacement_profile.display_name), ''),
      nullif(btrim(replacement_profile.email), ''),
      'docente suplente'
    ) as "replacementTeacher"
  from active_leaves leave_assignment
  left join public.subject_teacher_assignments replacement_assignment
    on replacement_assignment.institution_id = leave_assignment.institution_id
   and replacement_assignment.workspace_key = leave_assignment.workspace_key
   and replacement_assignment.subject_id = leave_assignment.subject_id
   and replacement_assignment.program_id = leave_assignment.program_id
   and replacement_assignment.status = 'active'
   and replacement_assignment.deleted_at is null
   and replacement_assignment.role = 'suplente'
   and (
      replacement_assignment.metadata ->> 'leave_parent_assignment_id' = leave_assignment.id::text
      or replacement_assignment.teacher_id::text = leave_assignment.metadata ->> 'replacement_teacher_id'
   )
  left join public.teacher_records leave_teacher
    on leave_teacher.id = leave_assignment.teacher_record_id
    or (
      leave_teacher.profile_id is not null
      and leave_teacher.profile_id = leave_assignment.teacher_id
      and leave_teacher.institution_id = leave_assignment.institution_id
      and leave_teacher.workspace_key = leave_assignment.workspace_key
    )
  left join public.profiles leave_profile
    on leave_profile.user_id = leave_assignment.teacher_id
  left join public.teacher_records replacement_teacher
    on replacement_teacher.id = replacement_assignment.teacher_record_id
    or (
      replacement_teacher.profile_id is not null
      and replacement_teacher.profile_id = replacement_assignment.teacher_id
      and replacement_teacher.institution_id = replacement_assignment.institution_id
      and replacement_teacher.workspace_key = replacement_assignment.workspace_key
    )
  left join public.profiles replacement_profile
    on replacement_profile.user_id = replacement_assignment.teacher_id
  order by "subjectId", "programId";
$$;

create or replace function public.academic_get_student_portal_grades(
  p_institution_id uuid,
  p_workspace_key text default 'main'
)
returns setof public.student_grades
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with context as (
    select
      (select auth.uid()) as actor_id,
      coalesce(nullif(btrim(p_workspace_key), ''), 'main') as workspace_key
  ),
  student_identity as (
    select
      context.actor_id as student_id,
      student_record.id as student_record_id
    from context
    left join public.student_records student_record
      on student_record.institution_id = p_institution_id
     and student_record.workspace_key = context.workspace_key
     and student_record.profile_id = context.actor_id
  ),
  own_enrollments as (
    select enrollment.id
    from public.subject_enrollments enrollment
    cross join context
    where enrollment.institution_id = p_institution_id
      and enrollment.workspace_key = context.workspace_key
      and enrollment.deleted_at is null
      and (
        enrollment.student_id = context.actor_id
        or exists (
          select 1
          from student_identity identity
          where identity.student_record_id is not null
            and identity.student_record_id = enrollment.student_record_id
        )
      )
  )
  select distinct grade.*
  from public.student_grades grade
  cross join context
  where grade.institution_id = p_institution_id
    and grade.workspace_key = context.workspace_key
    and grade.deleted_at is null
    and (
      grade.student_id = context.actor_id
      or grade.subject_enrollment_id in (select id from own_enrollments)
      or exists (
        select 1
        from student_identity identity
        where identity.student_record_id is not null
          and identity.student_record_id = grade.student_record_id
      )
    )
  order by grade.updated_at desc nulls last, grade.created_at desc nulls last;
$$;
revoke execute on function public.academic_get_teacher_subject_rosters(uuid, text) from public, anon;
revoke execute on function public.academic_get_student_subject_teacher_notices(uuid, text) from public, anon;
revoke execute on function public.academic_get_student_portal_grades(uuid, text) from public, anon;
grant execute on function public.academic_get_teacher_subject_rosters(uuid, text) to authenticated;
grant execute on function public.academic_get_student_subject_teacher_notices(uuid, text) to authenticated;
grant execute on function public.academic_get_student_portal_grades(uuid, text) to authenticated;
notify pgrst, 'reload schema';
