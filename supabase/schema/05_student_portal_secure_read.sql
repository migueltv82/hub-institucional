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
  student_record_ids uuid[];
  career_ids uuid[];
  career_names text[];
  normalized_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
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
    and coalesce(nullif(btrim(student.workspace_key), ''), 'main') = normalized_workspace_key
    and (
      student.profile_id = caller_id
      or (
        student.profile_id is null
        and nullif(btrim(coalesce(student.email, '')), '') is not null
        and nullif(btrim(coalesce(caller_profile.email, '')), '') is not null
        and lower(btrim(student.email)) = lower(btrim(caller_profile.email))
      )
    )
  order by
    case when student.profile_id = caller_id then 0 else 1 end,
    student.created_at desc
  limit 1;

  if student_row.id is null then
    raise exception 'Acceso denegado: no se encontro el legajo del alumno.'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct student.id), array[]::uuid[])
  into student_record_ids
  from public.student_records student
  where student.institution_id = target_institution_id
    and coalesce(nullif(btrim(student.workspace_key), ''), 'main') = normalized_workspace_key
    and (
      student.profile_id = caller_id
      or (
        student.profile_id is null
        and nullif(btrim(coalesce(student.email, '')), '') is not null
        and nullif(btrim(coalesce(caller_profile.email, '')), '') is not null
        and lower(btrim(student.email)) = lower(btrim(caller_profile.email))
      )
    );

  select scp.*, career.name as career_name
  into active_plan
  from public.student_career_plans scp
  join public.careers career on career.institution_id = scp.institution_id and career.id = scp.career_id
  where scp.institution_id = target_institution_id
    and scp.student_id = any(student_record_ids)
    and scp.status = 'active'
    and (scp.valid_from is null or scp.valid_from <= current_date)
    and (scp.valid_until is null or scp.valid_until >= current_date)
  order by scp.created_at desc
  limit 1;

  select
    coalesce(array_agg(distinct scp.career_id), array[]::uuid[]),
    coalesce(array_agg(distinct career.name), array[]::text[])
  into career_ids, career_names
  from public.student_career_plans scp
  join public.careers career on career.institution_id = scp.institution_id and career.id = scp.career_id
  where scp.institution_id = target_institution_id
    and scp.student_id = any(student_record_ids)
    and scp.status = 'active'
    and (scp.valid_from is null or scp.valid_from <= current_date)
    and (scp.valid_until is null or scp.valid_until >= current_date);

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
  with latest_academic_statuses as (
    select distinct on (status_row.student_career_plan_id, status_row.plan_subject_id)
      status_row.*
    from public.student_academic_statuses status_row
    join public.student_career_plans scp
      on scp.institution_id = status_row.institution_id
     and scp.id = status_row.student_career_plan_id
    where status_row.institution_id = target_institution_id
      and scp.student_id = any(student_record_ids)
      and scp.status = 'active'
      and (scp.valid_from is null or scp.valid_from <= current_date)
      and (scp.valid_until is null or scp.valid_until >= current_date)
    order by status_row.student_career_plan_id, status_row.plan_subject_id, status_row.recorded_at desc, status_row.id desc
  ),
  eligible_regular_subjects as (
    select
      latest.id as academic_status_id,
      scp.student_id as student_record_id,
      latest.student_career_plan_id,
      latest.plan_subject_id,
      latest.condition,
      latest.regularity_valid,
      latest.regularity_date,
      latest.approval_date,
      latest.grade,
      latest.notes,
      latest.recorded_at,
      scp.career_id,
      scp.plan_id,
      career.name as career_name,
      subject.id as subject_uuid,
      upper(btrim(subject.code)) as subject_code,
      subject.code as subject_code_display,
      subject.name as subject_name
    from latest_academic_statuses latest
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
      and scp.career_id = any(career_ids)
  ),
  workspace_snapshot as (
    select snapshot.payload, snapshot.updated_at
    from public.workspace_snapshots snapshot
    where snapshot.institution_id = target_institution_id
      and snapshot.workspace_key = normalized_workspace_key
    order by snapshot.updated_at desc
    limit 1
  ),
  schedule_rows as (
    select
      row_number() over () as schedule_order,
      mesa,
      regexp_replace(lower(concat_ws(
        ' ',
        mesa->>'codigo',
        mesa->>'materia',
        mesa->>'subject_id',
        mesa->>'canonical_subject_id',
        mesa->>'materia_id'
      )), '[^a-z0-9]+', ' ', 'g') as mesa_subject_search_text,
      regexp_replace(lower(coalesce(mesa->>'carrera', '')), '[^a-z0-9]+', '', 'g') as mesa_career_key
    from workspace_snapshot snapshot
    cross join lateral jsonb_array_elements(coalesce(snapshot.payload->'cronograma', '[]'::jsonb)) as mesa
  ),
  schedule_subject_codes as (
    select distinct
      schedule_rows.schedule_order,
      subject.id as subject_uuid,
      upper(btrim(subject.code)) as subject_code
    from schedule_rows
    join public.subjects subject
      on subject.institution_id = target_institution_id
     and (
       schedule_rows.mesa->>'subject_id' = subject.id::text
       or schedule_rows.mesa->>'canonical_subject_id' = subject.id::text
       or schedule_rows.mesa->>'materia_id' = subject.id::text
       or position(
         ' ' || btrim(regexp_replace(lower(subject.code), '[^a-z0-9]+', ' ', 'g')) || ' '
         in ' ' || schedule_rows.mesa_subject_search_text || ' '
       ) > 0
     )
  ),
  schedule_subject_matches as (
    select distinct
      schedule_subject_codes.schedule_order,
      schedule_subject_codes.subject_uuid,
      schedule_subject_codes.subject_code
    from schedule_subject_codes
    join schedule_rows
      on schedule_rows.schedule_order = schedule_subject_codes.schedule_order
    join eligible_regular_subjects eligible
      on eligible.subject_uuid = schedule_subject_codes.subject_uuid
    where (
        schedule_rows.mesa_career_key in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
        and nullif(btrim(coalesce(schedule_rows.mesa->>'carreraId', '')), '') is null
        and nullif(btrim(coalesce(schedule_rows.mesa->>'career_id', '')), '') is null
        and nullif(btrim(coalesce(schedule_rows.mesa->>'program_id', '')), '') is null
        and nullif(btrim(coalesce(schedule_rows.mesa->>'canonical_program_id', '')), '') is null
      )
      or (
        (
          schedule_rows.mesa_career_key not in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
          or nullif(btrim(coalesce(schedule_rows.mesa->>'carreraId', '')), '') is not null
          or nullif(btrim(coalesce(schedule_rows.mesa->>'career_id', '')), '') is not null
          or nullif(btrim(coalesce(schedule_rows.mesa->>'program_id', '')), '') is not null
          or nullif(btrim(coalesce(schedule_rows.mesa->>'canonical_program_id', '')), '') is not null
        )
        and (
          schedule_rows.mesa_career_key in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
          or schedule_rows.mesa_career_key = regexp_replace(lower(eligible.career_name), '[^a-z0-9]+', '', 'g')
        )
        and not exists (
          select 1
          from unnest(array[
            schedule_rows.mesa->>'carreraId',
            schedule_rows.mesa->>'career_id',
            schedule_rows.mesa->>'program_id',
            schedule_rows.mesa->>'canonical_program_id'
          ]) as career_value(raw_value)
          where nullif(btrim(coalesce(career_value.raw_value, '')), '') is not null
            and btrim(career_value.raw_value) <> eligible.career_id::text
            and regexp_replace(lower(btrim(career_value.raw_value)), '[^a-z0-9]+', '', 'g') <> regexp_replace(lower(eligible.career_name), '[^a-z0-9]+', '', 'g')
        )
        and (
          (
            schedule_rows.mesa_career_key not in ('', 'career', 'carrera', 'carrerageneral', 'general', 'program', 'programa')
            and schedule_rows.mesa_career_key = regexp_replace(lower(eligible.career_name), '[^a-z0-9]+', '', 'g')
          )
          or exists (
            select 1
            from unnest(array[
              schedule_rows.mesa->>'carreraId',
              schedule_rows.mesa->>'career_id',
              schedule_rows.mesa->>'program_id',
              schedule_rows.mesa->>'canonical_program_id'
            ]) as career_value(raw_value)
            where nullif(btrim(coalesce(career_value.raw_value, '')), '') is not null
              and (
                btrim(career_value.raw_value) = eligible.career_id::text
                or regexp_replace(lower(btrim(career_value.raw_value)), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(eligible.career_name), '[^a-z0-9]+', '', 'g')
              )
          )
        )
      )
  ),
  visible_schedule as (
    select
      schedule_rows.schedule_order,
      schedule_rows.mesa ||
        jsonb_build_object(
          'serverVisibility', jsonb_build_object(
            'filteredBy', 'get_student_portal_workspace_snapshot',
            'matchedRegularSubjectCodes', coalesce((
              select jsonb_agg(distinct schedule_subject_matches.subject_code order by schedule_subject_matches.subject_code)
              from schedule_subject_matches
              where schedule_subject_matches.schedule_order = schedule_rows.schedule_order
            ), '[]'::jsonb)
          )
        ) as mesa
    from schedule_rows
    where (
        regexp_replace(lower(coalesce(
          schedule_rows.mesa->>'estadoFinal',
          schedule_rows.mesa->>'estado',
          schedule_rows.mesa->>'status',
          schedule_rows.mesa->>'publication_status',
          ''
        )), '[^a-z0-9]+', '', 'g') in (
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
        or lower(btrim(coalesce(schedule_rows.mesa->>'confirmada', ''))) in ('true', '1', 'si', 'sí', 'yes')
        or lower(btrim(coalesce(schedule_rows.mesa->>'confirmed', ''))) in ('true', '1', 'si', 'sí', 'yes')
      )
      and exists (
        select 1
        from schedule_subject_matches
        where schedule_subject_matches.schedule_order = schedule_rows.schedule_order
      )
      and not exists (
        select 1
        from public.exam_teacher_assignments assignment
        where assignment.institution_id = target_institution_id
          and assignment.workspace_key = normalized_workspace_key
          and assignment.deleted_at is null
          and assignment.status = 'active'
          and assignment.confirmation_status <> 'confirmed'
          and lower(coalesce(assignment.exam_table_id, '')) = regexp_replace(
            regexp_replace(lower(coalesce(schedule_rows.mesa->>'id', '')), '^exam-engine-v21-', ''),
            '-[0-9]{4}-[0-9]{2}-[0-9]{2}$',
            ''
          )
      )
  )
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
      'record_id', student_row.id,
      'profile_id', caller_id,
      'student_id', caller_id,
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
      'record_id', student_row.id,
      'profile_id', caller_id,
      'student_id', caller_id,
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
    'estadoAcademico', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', eligible.academic_status_id,
        'profile_id', caller_id,
        'student_id', caller_id,
        'student_record_id', eligible.student_record_id,
        'student_career_plan_id', eligible.student_career_plan_id,
        'plan_subject_id', eligible.plan_subject_id,
        'career_id', eligible.career_id,
        'carreraId', eligible.career_id,
        'program_id', eligible.career_name,
        'canonical_program_id', eligible.career_name,
        'carrera', eligible.career_name,
        'subject_id', eligible.subject_code_display,
        'canonical_subject_id', eligible.subject_code_display,
        'materia', eligible.subject_code_display,
        'codigo', eligible.subject_code_display,
        'nombreMateria', eligible.subject_name,
        'academic_status', eligible.condition,
        'condition', eligible.condition,
        'condicion', eligible.condition,
        'estado', eligible.condition,
        'status', eligible.condition,
        'regularity_valid', eligible.regularity_valid,
        'regularity_date', eligible.regularity_date,
        'final_date', eligible.approval_date,
        'grade_value', eligible.grade,
        'recorded_at', eligible.recorded_at
      ) order by eligible.career_name, eligible.subject_code)
      from eligible_regular_subjects eligible
    ), '[]'::jsonb),
    'academicStatusRows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', eligible.academic_status_id,
        'profile_id', caller_id,
        'student_id', caller_id,
        'student_record_id', eligible.student_record_id,
        'student_career_plan_id', eligible.student_career_plan_id,
        'plan_subject_id', eligible.plan_subject_id,
        'career_id', eligible.career_id,
        'carreraId', eligible.career_id,
        'program_id', eligible.career_name,
        'canonical_program_id', eligible.career_name,
        'carrera', eligible.career_name,
        'subject_id', eligible.subject_code_display,
        'canonical_subject_id', eligible.subject_code_display,
        'materia', eligible.subject_code_display,
        'codigo', eligible.subject_code_display,
        'nombreMateria', eligible.subject_name,
        'academic_status', eligible.condition,
        'condition', eligible.condition,
        'condicion', eligible.condition,
        'estado', eligible.condition,
        'status', eligible.condition,
        'regularity_valid', eligible.regularity_valid,
        'regularity_date', eligible.regularity_date,
        'final_date', eligible.approval_date,
        'grade_value', eligible.grade,
        'recorded_at', eligible.recorded_at
      ) order by eligible.career_name, eligible.subject_code)
      from eligible_regular_subjects eligible
    ), '[]'::jsonb),
    'enrollments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', enrollment.id,
        'profile_id', caller_id,
        'student_id', caller_id,
        'student_record_id', enrollment.student_record_id,
        'institution_id', enrollment.institution_id,
        'program_id', enrollment.program_id,
        'canonical_program_id', enrollment.program_id,
        'subject_id', enrollment.subject_id,
        'canonical_subject_id', enrollment.subject_id,
        'status', enrollment.status,
        'enrolled_at', enrollment.enrolled_at
      ) order by enrollment.program_id, enrollment.subject_id)
      from public.subject_enrollments enrollment
      where enrollment.institution_id = target_institution_id
        and enrollment.workspace_key = normalized_workspace_key
        and enrollment.student_id = caller_id
        and enrollment.deleted_at is null
        and enrollment.status in ('active', 'enrolled')
    ), '[]'::jsonb),
    'courseClassmates', coalesce((
      with current_enrollments as (
        select distinct enrollment.subject_id, enrollment.program_id
        from public.subject_enrollments enrollment
        where enrollment.institution_id = target_institution_id
          and enrollment.workspace_key = normalized_workspace_key
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
            and classmate_enrollment.workspace_key = normalized_workspace_key
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
    'examEnrollments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', exam_enrollment.id,
        'profile_id', caller_id,
        'student_id', caller_id,
        'student_record_id', exam_enrollment.student_record_id,
        'institution_id', exam_enrollment.institution_id,
        'exam_table_id', exam_enrollment.exam_table_id,
        'subject_id', exam_enrollment.subject_id,
        'program_id', exam_enrollment.program_id,
        'status', exam_enrollment.status,
        'enrolled_at', exam_enrollment.enrolled_at
      ) order by exam_enrollment.enrolled_at desc)
      from public.exam_enrollments exam_enrollment
      where exam_enrollment.institution_id = target_institution_id
        and exam_enrollment.workspace_key = normalized_workspace_key
        and exam_enrollment.student_id = caller_id
        and exam_enrollment.deleted_at is null
        and exam_enrollment.status in ('active', 'enrolled')
    ), '[]'::jsonb),
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
    'cronograma', coalesce((
      select jsonb_agg(visible_schedule.mesa order by visible_schedule.schedule_order)
      from visible_schedule
    ), '[]'::jsonb),
    'requiereRegeneracion', false
  ) as payload,
  coalesce((select workspace_snapshot.updated_at from workspace_snapshot), now()) as updated_at;
end;
$$;

revoke execute on function public.get_student_portal_workspace_snapshot(uuid, text) from public, anon;
grant execute on function public.get_student_portal_workspace_snapshot(uuid, text) to authenticated;

notify pgrst, 'reload schema';
