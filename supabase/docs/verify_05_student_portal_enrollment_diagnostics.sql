-- Diagnostico post-smoke para inscripcion de materias desde portal alumno.
-- Institucion: 3f9dd1a0-19b8-462f-bdd8-7e849d90ae04, workspace main.
--
-- Interpretacion rapida:
-- - Si recent_dual_write_warnings = 0 y recent_subject_enrollments no sube,
--   probablemente la Edge Function admin-users desplegada no es la version actual.
-- - Si recent_dual_write_warnings > 0, revisar relational_errors para ver la causa real.
-- - Si recent_subject_enrollments > 0, la tabla academica relacional confirmo altas.

with params as (
  select
    '3f9dd1a0-19b8-462f-bdd8-7e849d90ae04'::uuid as institution_id,
    'main'::text as workspace_key,
    now() - interval '2 hours' as since_at
),
enrollments as (
  select count(*)::int as rows_count
  from public.subject_enrollments enrollment
  join params
    on enrollment.institution_id = params.institution_id
   and enrollment.workspace_key = params.workspace_key
  where enrollment.updated_at >= params.since_at
),
warnings as (
  select
    count(*)::int as rows_count,
    string_agg(
      coalesce(log.error_message, log.metadata ->> 'error', '(sin detalle)'),
      E'\n---\n'
      order by log.created_at desc
    ) as details
  from public.admin_audit_logs log
  join params
    on log.target_id = params.institution_id::text
  where log.action = 'student_portal_dual_write_warning'
    and log.created_at >= params.since_at
)
select 'recent_subject_enrollments' as check_name, enrollments.rows_count::text as value
from enrollments
union all
select 'recent_dual_write_warnings' as check_name, warnings.rows_count::text as value
from warnings
union all
select 'relational_errors' as check_name, coalesce(warnings.details, '') as value
from warnings;
