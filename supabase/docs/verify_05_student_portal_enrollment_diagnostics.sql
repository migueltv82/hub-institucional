-- Diagnostico post-smoke para inscripcion de materias desde portal alumno.
-- Institucion: 3f9dd1a0-19b8-462f-bdd8-7e849d90ae04, workspace main.
--
-- Interpretacion rapida:
-- - Si rpc_signature_present = 0, volver a ejecutar supabase/schema/07_academic_operations.sql.
-- - Si transition_config muestra snapshot_only, el codigo local actual igual fuerza
--   escritura relacional para enroll_subject/withdraw_subject; si el remoto no lo hace,
--   falta redeploy de supabase/functions/admin-users/index.ts.
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
),
transition as (
  select coalesce(max(setting.value::text), '{}') as value
  from public.app_settings setting
  where setting.key = 'academic_relational_transition'
),
rpc_signature as (
  select count(*)::int as rows_count
  from pg_proc proc
  join pg_namespace namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'upsert_subject_enrollment_from_portal'
    and pg_get_function_identity_arguments(proc.oid) =
      'target_institution_id uuid, target_workspace_key text, actor_user_id uuid, target_student_id uuid, target_subject_id text, target_program_id text, target_student_record_id uuid, target_status text, target_enrolled_at timestamp with time zone, target_dropped_at timestamp with time zone, target_legacy_snapshot_id text, target_client_mutation_id text, target_metadata jsonb'
)
select 'rpc_signature_present' as check_name, rpc_signature.rows_count::text as value
from rpc_signature
union all
select 'transition_config' as check_name, coalesce(transition.value, '{}') as value
from transition
union all
select 'recent_subject_enrollments' as check_name, enrollments.rows_count::text as value
from enrollments
union all
select 'recent_dual_write_warnings' as check_name, warnings.rows_count::text as value
from warnings
union all
select 'relational_errors' as check_name, coalesce(warnings.details, '') as value
from warnings;
