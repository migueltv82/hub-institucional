-- Diagnostico de SOLO LECTURA (20/10, punto 1 de Miguel): filas que nombran una materia por texto
-- (subject_id = codigo, program_id = nombre de carrera) que no existe en el catalogo de su institucion.
-- Es el paso previo a agregar una referencia validada a study_plan_subjects: primero saber cuantas filas
-- no resolverian. No escribe nada. Correr en el SQL Editor y leer la tabla que devuelve.
--
-- motivo:
--   CARRERA_NO_ENCONTRADA      program_id no coincide con ninguna carrera (nombre o codigo externo)
--   CARRERA_AMBIGUA            coincide con mas de una carrera
--   MATERIA_NO_ESTA_EN_EL_PLAN la carrera existe pero ningun plan suyo tiene ese codigo de materia
-- Mismo criterio que academic_resolve_catalog_subject (07), que usan las cargas masivas.
with refs as (
  select 'subject_enrollments' as tabla, institution_id, subject_id, program_id from public.subject_enrollments where deleted_at is null
  union all
  select 'student_grades', institution_id, subject_id, program_id from public.student_grades where deleted_at is null
  union all
  select 'subject_class_sessions', institution_id, subject_id, program_id from public.subject_class_sessions
  union all
  select 'subject_teacher_assignments', institution_id, subject_id, program_id from public.subject_teacher_assignments where deleted_at is null
  union all
  select 'exam_enrollments', institution_id, subject_id, program_id from public.exam_enrollments where deleted_at is null
),
distinct_refs as (
  select tabla, institution_id, subject_id, program_id, count(*) as filas
  from refs
  group by tabla, institution_id, subject_id, program_id
),
resolved as (
  select
    r.*,
    (select count(*) from public.careers c
      where c.institution_id = r.institution_id
        and (lower(btrim(c.name)) = lower(btrim(coalesce(r.program_id, '')))
          or lower(btrim(coalesce(c.external_code, ''))) = lower(btrim(coalesce(r.program_id, ''))))) as carreras,
    exists (
      select 1
      from public.careers c
      join public.study_plans p on p.institution_id = c.institution_id and p.career_id = c.id
      join public.study_plan_subjects ps on ps.institution_id = p.institution_id and ps.plan_id = p.id
      join public.subjects s on s.institution_id = ps.institution_id and s.id = ps.subject_id
      where c.institution_id = r.institution_id
        and (lower(btrim(c.name)) = lower(btrim(coalesce(r.program_id, '')))
          or lower(btrim(coalesce(c.external_code, ''))) = lower(btrim(coalesce(r.program_id, ''))))
        and lower(btrim(s.code)) = lower(btrim(coalesce(r.subject_id, '')))
    ) as en_plan
  from distinct_refs r
)
select
  tabla,
  institution_id,
  program_id,
  subject_id,
  filas,
  case
    when carreras = 0 then 'CARRERA_NO_ENCONTRADA'
    when carreras > 1 then 'CARRERA_AMBIGUA'
    else 'MATERIA_NO_ESTA_EN_EL_PLAN'
  end as motivo
from resolved
where carreras <> 1 or not en_plan
order by institution_id, tabla, program_id, subject_id;
-- Resultado esperado hoy: idealmente cero filas. Cada fila que aparezca es una referencia a resolver
-- (corregir el texto o cargar la materia en el plan) antes de exigir la referencia validada.
