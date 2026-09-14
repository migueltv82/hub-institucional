-- ============================================================
-- Repair etapa 5: RPCs docentes para baja/reinicio de alumno
-- Aplicar en SQL Editor del proyecto remoto si admin-users devuelve:
-- Could not find the function public.teacher_remove_student_subject_records(...)
-- ============================================================
create or replace function public.teacher_reset_student_subject_academic_records(
  p_institution_id uuid,
  p_workspace_key text,
  p_actor_id uuid,
  p_student_id uuid,
  p_subject_id text,
  p_program_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  clean_subject_id text := btrim(coalesce(p_subject_id, ''));
  clean_program_id text := coalesce(p_program_id, '');
  normalized_subject_id text := regexp_replace(lower(clean_subject_id), '[^a-z0-9]+', '', 'g');
  normalized_program_id text := regexp_replace(lower(clean_program_id), '[^a-z0-9]+', '', 'g');
  deleted_attendance_count integer := 0;
  deleted_grade_count integer := 0;
begin
  if p_institution_id is null or p_actor_id is null or p_student_id is null or clean_subject_id = '' then
    raise exception 'Faltan datos para reiniciar los registros academicos del alumno.';
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.institution_id = p_institution_id
      and membership.user_id = p_actor_id
      and membership.role in ('owner', 'admin', 'editor')
  ) and not exists (
    select 1
    from public.subject_teacher_assignments assignment
    where assignment.institution_id = p_institution_id
      and assignment.workspace_key = clean_workspace_key
      and assignment.teacher_id = p_actor_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and assignment.role in ('titular', 'suplente', 'licencia')
      and regexp_replace(lower(coalesce(assignment.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
      and (
        clean_program_id = ''
        or assignment.program_id = clean_program_id
        or regexp_replace(lower(coalesce(assignment.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
      )
  ) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  delete from public.subject_attendance_records attendance
  using public.subject_class_sessions session
  where attendance.session_id = session.id
    and attendance.institution_id = p_institution_id
    and attendance.workspace_key = clean_workspace_key
    and attendance.student_id = p_student_id
    and session.institution_id = p_institution_id
    and session.workspace_key = clean_workspace_key
    and regexp_replace(lower(coalesce(session.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or session.program_id = clean_program_id
      or regexp_replace(lower(coalesce(session.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics deleted_attendance_count = row_count;

  update public.student_grades grade
  set
    deleted_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    lock_version = coalesce(grade.lock_version, 0) + 1
  where grade.institution_id = p_institution_id
    and grade.workspace_key = clean_workspace_key
    and grade.student_id = p_student_id
    and grade.deleted_at is null
    and regexp_replace(lower(coalesce(grade.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or grade.program_id = clean_program_id
      or regexp_replace(lower(coalesce(grade.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics deleted_grade_count = row_count;

  return jsonb_build_object(
    'success', true,
    'action', 'teacher_reset_student_subject_academic_records',
    'student_id', p_student_id,
    'subject_id', clean_subject_id,
    'program_id', clean_program_id,
    'reset_counts', jsonb_build_object(
      'attendance_records', deleted_attendance_count,
      'student_grades', deleted_grade_count
    )
  );
end;
$$;

create or replace function public.teacher_remove_student_subject_records(
  p_institution_id uuid,
  p_workspace_key text,
  p_actor_id uuid,
  p_student_id uuid,
  p_subject_id text,
  p_program_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  clean_subject_id text := btrim(coalesce(p_subject_id, ''));
  clean_program_id text := coalesce(p_program_id, '');
  normalized_subject_id text := regexp_replace(lower(clean_subject_id), '[^a-z0-9]+', '', 'g');
  normalized_program_id text := regexp_replace(lower(clean_program_id), '[^a-z0-9]+', '', 'g');
  deleted_attendance_count integer := 0;
  deleted_grade_count integer := 0;
  removed_enrollment_count integer := 0;
begin
  if p_institution_id is null or p_actor_id is null or p_student_id is null or clean_subject_id = '' then
    raise exception 'Faltan datos para eliminar al alumno de la materia.';
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.institution_id = p_institution_id
      and membership.user_id = p_actor_id
      and membership.role in ('owner', 'admin', 'editor')
  ) and not exists (
    select 1
    from public.subject_teacher_assignments assignment
    where assignment.institution_id = p_institution_id
      and assignment.workspace_key = clean_workspace_key
      and assignment.teacher_id = p_actor_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and assignment.role in ('titular', 'suplente', 'licencia')
      and regexp_replace(lower(coalesce(assignment.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
      and (
        clean_program_id = ''
        or assignment.program_id = clean_program_id
        or regexp_replace(lower(coalesce(assignment.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
      )
  ) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  delete from public.subject_attendance_records attendance
  using public.subject_class_sessions session
  where attendance.session_id = session.id
    and attendance.institution_id = p_institution_id
    and attendance.workspace_key = clean_workspace_key
    and attendance.student_id = p_student_id
    and session.institution_id = p_institution_id
    and session.workspace_key = clean_workspace_key
    and regexp_replace(lower(coalesce(session.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or session.program_id = clean_program_id
      or regexp_replace(lower(coalesce(session.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics deleted_attendance_count = row_count;

  update public.student_grades grade
  set
    deleted_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    lock_version = coalesce(grade.lock_version, 0) + 1
  where grade.institution_id = p_institution_id
    and grade.workspace_key = clean_workspace_key
    and grade.student_id = p_student_id
    and grade.deleted_at is null
    and regexp_replace(lower(coalesce(grade.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or grade.program_id = clean_program_id
      or regexp_replace(lower(coalesce(grade.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics deleted_grade_count = row_count;

  update public.subject_enrollments enrollment
  set
    status = 'dropped',
    dropped_at = timezone('utc', now()),
    deleted_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    lock_version = coalesce(enrollment.lock_version, 0) + 1
  where enrollment.institution_id = p_institution_id
    and enrollment.workspace_key = clean_workspace_key
    and enrollment.student_id = p_student_id
    and enrollment.deleted_at is null
    and regexp_replace(lower(coalesce(enrollment.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or enrollment.program_id = clean_program_id
      or regexp_replace(lower(coalesce(enrollment.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics removed_enrollment_count = row_count;

  return jsonb_build_object(
    'success', true,
    'action', 'teacher_remove_student_subject_records',
    'student_id', p_student_id,
    'subject_id', clean_subject_id,
    'program_id', clean_program_id,
    'removed_counts', jsonb_build_object(
      'subject_enrollments', removed_enrollment_count,
      'student_grades', deleted_grade_count,
      'attendance_records', deleted_attendance_count
    )
  );
end;
$$;

revoke execute on function public.academic_can_manage_subject(uuid, text, text, text) from public, anon;
revoke execute on function public.academic_resolve_subject_enrollment(uuid, text, uuid, text, text) from public, anon;
revoke execute on function public.upsert_subject_enrollment_from_portal(uuid, text, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
revoke execute on function public.academic_teacher_create_class_session(uuid, text, text, text, date, text) from public, anon;
revoke execute on function public.academic_teacher_upsert_student_grade(uuid, text, uuid, uuid, uuid, text, text, text, integer, numeric, text, integer) from public, anon;
revoke execute on function public.academic_teacher_upsert_attendance_records(uuid, jsonb) from public, anon;
revoke execute on function public.teacher_reset_student_subject_academic_records(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.teacher_remove_student_subject_records(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.academic_can_manage_subject(uuid, text, text, text) to authenticated;
grant execute on function public.academic_resolve_subject_enrollment(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.upsert_subject_enrollment_from_portal(uuid, text, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.academic_teacher_create_class_session(uuid, text, text, text, date, text) to authenticated;
grant execute on function public.academic_teacher_upsert_student_grade(uuid, text, uuid, uuid, uuid, text, text, text, integer, numeric, text, integer) to authenticated;
grant execute on function public.academic_teacher_upsert_attendance_records(uuid, jsonb) to authenticated;
grant execute on function public.teacher_reset_student_subject_academic_records(uuid, text, uuid, uuid, text, text) to service_role;
grant execute on function public.teacher_remove_student_subject_records(uuid, text, uuid, uuid, text, text) to service_role;
notify pgrst, 'reload schema';
