-- Agrega la lectura segura de companieros por materia al portal alumno.
-- Reemplaza la RPC public.get_student_portal_workspace_snapshot completa.

create or replace function public.get_student_portal_workspace_snapshot(
  target_institution_id uuid,
  target_workspace_key text default 'main'
)
returns table (
  payload jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_profile record;
  student_row record;
  active_plan record;
  career_ids uuid[];
  career_names text[];
begin
  if caller_id is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.'
      using errcode = '28000';
  end if;

  if target_institution_id is null then
    raise exception 'Acceso denegado: falta institution_id.'
      using errcode = '22023';
  end if;

  select profile.user_id, profile.email, profile.account_role, profile.is_global_admin, profile.is_blocked
  into caller_profile
  from public.profiles profile
  where profile.user_id = caller_id;

  if caller_profile.user_id is null or caller_profile.is_blocked then
    raise exception 'Acceso denegado: perfil inexistente o bloqueado.'
      using errcode = '28000';
  end if;

  if caller_profile.is_global_admin or lower(coalesce(caller_profile.account_role, '')) <> 'alumno' then
    raise exception 'Acceso denegado: esta lectura segura es exclusiva para alumnos.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.memberships membership
    join public.institutions institution on institution.id = membership.institution_id
    where membership.institution_id = target_institution_id
      and membership.user_id = caller_id
      and institution.status = 'active'
  ) then
    raise exception 'Acceso denegado: el alumno no pertenece a la institucion activa.'
      using errcode = '42501';
  end if;

  select student.*
  into student_row
  from public.student_records student
  where student.institution_id = target_institution_id
    and lower(btrim(coalesce(student.email, ''))) = lower(btrim(coalesce(caller_profile.email, '')))
  order by student.created_at desc
  limit 1;

  if student_row.id is null then
    raise exception 'Acceso denegado: no se encontro el legajo del alumno.'
      using errcode = '42501';
  end if;

  select scp.*, career.name as career_name
  into active_plan
  from public.student_career_plans scp
  join public.careers career on career.institution_id = scp.institution_id and career.id = scp.career_id
  where scp.institution_id = target_institution_id
    and scp.student_id = student_row.id
    and scp.status = 'active'
  order by scp.created_at desc
  limit 1;

  select
    coalesce(array_agg(distinct scp.career_id), array[]::uuid[]),
    coalesce(array_agg(distinct career.name), array[]::text[])
  into career_ids, career_names
  from public.student_career_plans scp
  join public.careers career on career.institution_id = scp.institution_id and career.id = scp.career_id
  where scp.institution_id = target_institution_id
    and scp.student_id = student_row.id
    and scp.status = 'active';

  if coalesce(array_length(career_ids, 1), 0) = 0 and btrim(coalesce(student_row.career, '')) <> '' then
    select
      coalesce(array_agg(distinct career.id), array[]::uuid[]),
      coalesce(array_agg(distinct career.name), array[]::text[])
    into career_ids, career_names
    from public.careers career
    where career.institution_id = target_institution_id
      and career.status = 'active'
      and (
        lower(btrim(coalesce(career.name, ''))) = lower(btrim(coalesce(student_row.career, '')))
        or lower(btrim(coalesce(career.external_code, ''))) = lower(btrim(coalesce(student_row.career, '')))
      );

    if coalesce(array_length(career_ids, 1), 0) > 0 then
      select
        career_names[1] as career_name,
        case
          when btrim(coalesce(student_row.academic_year, '')) ~ '^[0-9]+$'
            then btrim(student_row.academic_year)::integer
          else null
        end as current_year
      into active_plan;
    end if;
  end if;

  return query
  select jsonb_build_object(
    'horariosDocentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'docenteId', schedule.teacher_id,
        'teacherId', schedule.teacher_id,
        'profesor', btrim(coalesce(teacher.first_name, '') || ' ' || coalesce(teacher.last_name, '')),
        'docente', btrim(coalesce(teacher.first_name, '') || ' ' || coalesce(teacher.last_name, '')),
        'materia', subject.code,
        'codigo', subject.code,
        'materia_id', sps.id,
        'nombreMateria', subject.name,
        'carrera', career.name,
        'carreraId', career.id,
        'dia', case schedule.weekday
          when 1 then 'lunes'
          when 2 then 'martes'
          when 3 then 'miercoles'
          when 4 then 'jueves'
          when 5 then 'viernes'
          when 6 then 'sabado'
          when 7 then 'domingo'
          else ''
        end,
        'inicio', left(schedule.starts_at::text, 5),
        'fin', left(schedule.ends_at::text, 5)
      ))
      from public.course_schedules schedule
      join public.teacher_records teacher on teacher.institution_id = schedule.institution_id and teacher.id = schedule.teacher_id
      join public.study_plan_subjects sps on sps.institution_id = schedule.institution_id and sps.id = schedule.plan_subject_id
      join public.subjects subject on subject.institution_id = sps.institution_id and subject.id = sps.subject_id
      join public.study_plans plan on plan.institution_id = sps.institution_id and plan.id = sps.plan_id
      join public.careers career on career.institution_id = plan.institution_id and career.id = plan.career_id
      where schedule.institution_id = target_institution_id
        and plan.career_id = any(career_ids)
    ), '[]'::jsonb),
    'docentes', '[]'::jsonb,
    'planesEstudio', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sps.id,
        'materia_id', sps.id,
        'materia', subject.code,
        'codigo', subject.code,
        'nombreMateria', subject.name,
        'carreraId', career.id,
        'carrera', career.name,
        'anio', sps.year_number,
        'requiereMesa', sps.exam_required,
        'grupo_afin_mesa', sps.exam_group,
        'codigos_materias_afines', sps.related_subject_codes
      ))
      from public.study_plan_subjects sps
      join public.subjects subject on subject.institution_id = sps.institution_id and subject.id = sps.subject_id
      join public.study_plans plan on plan.institution_id = sps.institution_id and plan.id = sps.plan_id
      join public.careers career on career.institution_id = plan.institution_id and career.id = plan.career_id
      where sps.institution_id = target_institution_id
        and plan.career_id = any(career_ids)
    ), '[]'::jsonb),
    'correlatividades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'carreraId', target_career.id,
        'carrera', target_career.name,
        'materia', target_subject.code,
        'codigo', target_subject.code,
        'nombreMateria', target_subject.name,
        'correlativas', jsonb_build_array(prerequisite_subject.code)
      ))
      from public.subject_prerequisites prerequisite
      join public.study_plan_subjects target_sps on target_sps.institution_id = prerequisite.institution_id and target_sps.id = prerequisite.target_plan_subject_id
      join public.subjects target_subject on target_subject.institution_id = target_sps.institution_id and target_subject.id = target_sps.subject_id
      join public.study_plans target_plan on target_plan.institution_id = target_sps.institution_id and target_plan.id = target_sps.plan_id
      join public.careers target_career on target_career.institution_id = target_plan.institution_id and target_career.id = target_plan.career_id
      join public.study_plan_subjects prerequisite_sps on prerequisite_sps.institution_id = prerequisite.institution_id and prerequisite_sps.id = prerequisite.prerequisite_plan_subject_id
      join public.subjects prerequisite_subject on prerequisite_subject.institution_id = prerequisite_sps.institution_id and prerequisite_subject.id = prerequisite_sps.subject_id
      where prerequisite.institution_id = target_institution_id
        and prerequisite.status = 'active'
        and target_plan.career_id = any(career_ids)
    ), '[]'::jsonb),
    'alumnos', jsonb_build_array(jsonb_build_object(
      'id', student_row.id,
      'nombre', student_row.first_name,
      'apellido', student_row.last_name,
      'full_name', btrim(coalesce(student_row.first_name, '') || ' ' || coalesce(student_row.last_name, '')),
      'dni', student_row.national_id,
      'email', student_row.email,
      'telefono', student_row.phone,
      'estado', student_row.status,
      'carrera', coalesce(active_plan.career_name, ''),
      'anio', active_plan.current_year,
      'materias', jsonb_build_array()
    )),
    'students', jsonb_build_array(jsonb_build_object(
      'id', student_row.id,
      'nombre', student_row.first_name,
      'apellido', student_row.last_name,
      'full_name', btrim(coalesce(student_row.first_name, '') || ' ' || coalesce(student_row.last_name, '')),
      'dni', student_row.national_id,
      'email', student_row.email,
      'telefono', student_row.phone,
      'estado', student_row.status,
      'carrera', coalesce(active_plan.career_name, ''),
      'anio', active_plan.current_year,
      'materias', jsonb_build_array()
    )),
    'estadoAcademico', '[]'::jsonb,
    'academicStatusRows', '[]'::jsonb,
    'enrollments', '[]'::jsonb,
    'courseClassmates', coalesce((
      with current_enrollments as (
        select distinct enrollment.subject_id, enrollment.program_id
        from public.subject_enrollments enrollment
        where enrollment.institution_id = target_institution_id
          and enrollment.workspace_key = target_workspace_key
          and enrollment.student_id = caller_id
          and enrollment.deleted_at is null
          and enrollment.status in ('active', 'enrolled')
      )
      select jsonb_agg(jsonb_build_object(
        'subject_id', current_enrollments.subject_id,
        'program_id', current_enrollments.program_id,
        'classmates', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', classmate_enrollment.student_id,
            'full_name', coalesce(
              nullif(btrim(coalesce(classmate_student.first_name, '') || ' ' || coalesce(classmate_student.last_name, '')), ''),
              nullif(classmate_student.full_name, ''),
              nullif(classmate_profile.display_name, ''),
              'Alumno sin nombre'
            )
          ) order by coalesce(
            nullif(btrim(coalesce(classmate_student.first_name, '') || ' ' || coalesce(classmate_student.last_name, '')), ''),
            nullif(classmate_student.full_name, ''),
            nullif(classmate_profile.display_name, ''),
            'Alumno sin nombre'
          ))
          from public.subject_enrollments classmate_enrollment
          left join public.profiles classmate_profile on classmate_profile.user_id = classmate_enrollment.student_id
          left join public.student_records classmate_student
            on classmate_student.institution_id = classmate_enrollment.institution_id
           and classmate_student.id = classmate_enrollment.student_record_id
          where classmate_enrollment.institution_id = target_institution_id
            and classmate_enrollment.workspace_key = target_workspace_key
            and classmate_enrollment.subject_id = current_enrollments.subject_id
            and classmate_enrollment.program_id = current_enrollments.program_id
            and classmate_enrollment.student_id <> caller_id
            and classmate_enrollment.deleted_at is null
            and classmate_enrollment.status in ('active', 'enrolled')
        ), '[]'::jsonb)
      ) order by current_enrollments.program_id, current_enrollments.subject_id)
      from current_enrollments
    ), '[]'::jsonb),
    'grades', '[]'::jsonb,
    'examEnrollments', '[]'::jsonb,
    'academicStatus', null,
    'uploadedFiles', jsonb_build_object(
      'horarios', null,
      'planes', null,
      'correlatividades', null,
      'alumnos', null,
      'docentes', null
    ),
    'fechaInicio', '',
    'fechaFin', '',
    'cronograma', '[]'::jsonb,
    'requiereRegeneracion', false
  ) as payload,
  now() as updated_at;
end;
$$;

revoke execute on function public.get_student_portal_workspace_snapshot(uuid, text) from public, anon;
grant execute on function public.get_student_portal_workspace_snapshot(uuid, text) to authenticated;

notify pgrst, 'reload schema';
