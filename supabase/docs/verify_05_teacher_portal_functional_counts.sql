-- Diagnostico funcional de etapa 5 para portal docente.
-- Institucion: 3f9dd1a0-19b8-462f-bdd8-7e849d90ae04, workspace main.
--
-- Ejecutar despues de probar desde portal docente:
-- 1. Crear/guardar asistencia de una clase.
-- 2. Confirmar al menos una nota.
--
-- Interpretacion rapida:
-- - subject_class_sessions > 0 confirma que se creo/actualizo una clase.
-- - subject_attendance_records > 0 confirma que se guardo asistencia.
-- - student_grades > 0 confirma que se guardo una nota.
-- - Si alguna fila queda en 0 despues del smoke, revisar el mensaje de UI y consola.

with params as (
  select
    '3f9dd1a0-19b8-462f-bdd8-7e849d90ae04'::uuid as institution_id,
    'main'::text as workspace_key,
    now() - interval '2 hours' as since_at
),
class_sessions as (
  select count(*)::int as rows_count
  from public.subject_class_sessions session
  join params
    on session.institution_id = params.institution_id
   and session.workspace_key = params.workspace_key
  where session.updated_at >= params.since_at
),
attendance_records as (
  select count(*)::int as rows_count
  from public.subject_attendance_records attendance
  join params
    on attendance.institution_id = params.institution_id
   and attendance.workspace_key = params.workspace_key
  where attendance.updated_at >= params.since_at
),
grade_records as (
  select count(*)::int as rows_count
  from public.student_grades grade
  join params
    on grade.institution_id = params.institution_id
   and grade.workspace_key = params.workspace_key
  where grade.updated_at >= params.since_at
    and grade.deleted_at is null
),
subject_enrollments as (
  select count(*)::int as rows_count
  from public.subject_enrollments enrollment
  join params
    on enrollment.institution_id = params.institution_id
   and enrollment.workspace_key = params.workspace_key
  where enrollment.status in ('active', 'enrolled')
    and enrollment.deleted_at is null
),
teacher_assignments as (
  select count(*)::int as rows_count
  from public.subject_teacher_assignments assignment
  join params
    on assignment.institution_id = params.institution_id
   and assignment.workspace_key = params.workspace_key
  where assignment.status = 'active'
    and assignment.deleted_at is null
)
select 'active_subject_enrollments' as check_name, subject_enrollments.rows_count::text as value
from subject_enrollments
union all
select 'active_subject_teacher_assignments' as check_name, teacher_assignments.rows_count::text as value
from teacher_assignments
union all
select 'recent_subject_class_sessions' as check_name, class_sessions.rows_count::text as value
from class_sessions
union all
select 'recent_subject_attendance_records' as check_name, attendance_records.rows_count::text as value
from attendance_records
union all
select 'recent_student_grades' as check_name, grade_records.rows_count::text as value
from grade_records;
