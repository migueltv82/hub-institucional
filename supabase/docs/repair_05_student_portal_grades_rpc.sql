-- ============================================================
-- Repair etapa 5: notas visibles en portal alumno
-- Aplica solo la RPC academic_get_student_portal_grades.
-- ============================================================
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
revoke execute on function public.academic_get_student_portal_grades(uuid, text) from public, anon;
grant execute on function public.academic_get_student_portal_grades(uuid, text) to authenticated;
notify pgrst, 'reload schema';
