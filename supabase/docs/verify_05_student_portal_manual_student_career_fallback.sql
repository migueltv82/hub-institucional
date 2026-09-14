-- Diagnostico para alumnos manuales que no ven materias en el portal alumno.
-- Cambiar el texto de busqueda si hace falta.

with matched_students as (
  select
    sr.id,
    sr.institution_id,
    sr.profile_id,
    sr.email,
    sr.full_name,
    sr.first_name,
    sr.last_name,
    sr.career,
    sr.academic_year,
    sr.status
  from public.student_records sr
  where lower(coalesce(sr.full_name, '')) like '%maria%gonzalez%lelong%'
     or lower(coalesce(sr.email, '')) like '%maria%'
)
select
  ms.full_name,
  ms.email,
  ms.status,
  ms.career as career_from_student_records,
  ms.academic_year,
  ms.profile_id,
  scp.id as active_career_plan_id,
  career_from_plan.name as career_from_plan,
  scp.current_year as current_year_from_plan,
  fallback_career.id as fallback_career_id,
  fallback_career.name as fallback_career_name,
  count(distinct sps.id) filter (where sps.id is not null) as subjects_available_by_fallback
from matched_students ms
left join public.student_career_plans scp
  on scp.institution_id = ms.institution_id
 and scp.student_id = ms.id
 and scp.status = 'active'
left join public.careers career_from_plan
  on career_from_plan.institution_id = scp.institution_id
 and career_from_plan.id = scp.career_id
left join public.careers fallback_career
  on fallback_career.institution_id = ms.institution_id
 and fallback_career.status = 'active'
 and (
   lower(btrim(coalesce(fallback_career.name, ''))) = lower(btrim(coalesce(ms.career, '')))
   or lower(btrim(coalesce(fallback_career.external_code, ''))) = lower(btrim(coalesce(ms.career, '')))
 )
left join public.study_plans plan
  on plan.institution_id = fallback_career.institution_id
 and plan.career_id = fallback_career.id
left join public.study_plan_subjects sps
  on sps.institution_id = plan.institution_id
 and sps.plan_id = plan.id
group by
  ms.full_name,
  ms.email,
  ms.status,
  ms.career,
  ms.academic_year,
  ms.profile_id,
  scp.id,
  career_from_plan.name,
  scp.current_year,
  fallback_career.id,
  fallback_career.name
order by ms.full_name;
