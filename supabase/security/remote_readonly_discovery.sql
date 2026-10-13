-- READ ONLY — SAFE FOR DISCOVERY
-- Etapa 02.5: ejecutar solo contra staging/remoto con acceso autorizado de lectura.
-- El archivo contiene exclusivamente consultas SELECT sobre catalogos y configuracion.
-- No consulta contenido academico, usuarios finales, emails, DNI, notas ni asistencia.

select
  current_database() as database_name,
  current_user as database_user,
  session_user as session_user_name,
  version() as postgres_version;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as return_type,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  pg_get_userbyid(p.proowner) as owner_name,
  p.proconfig as function_config,
  p.proacl as acl,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'auth', 'storage')
  and (
    p.proname in (
      'handle_new_user',
      'is_super_admin',
      'is_member_of_institution',
      'get_public_app_status',
      'list_active_login_institutions',
      'foundation_require_super_admin',
      'foundation_active_institution_admin_count',
      'update_membership_role',
      'remove_user_membership',
      'set_user_access_status',
      'delete_institution_user',
      'sync_teacher_record_ui_compat_fields',
      'sync_student_record_ui_compat_fields',
      'get_student_portal_workspace_snapshot',
      'storage_object_institution_id',
      'touch_workspace_operational_updated_at',
      'touch_subject_teacher_assignments_updated_at',
      'academic_resolve_member_profile_by_email',
      'academic_create_teacher_subject_leave',
      'academic_update_teacher_assignment_condition',
      'touch_academic_operations_updated_at',
      'academic_can_manage_subject',
      'academic_resolve_subject_enrollment',
      'upsert_subject_enrollment_from_portal',
      'academic_teacher_create_class_session',
      'academic_teacher_upsert_student_grade',
      'academic_teacher_upsert_attendance_records',
      'academic_get_teacher_subject_rosters',
      'academic_get_student_subject_teacher_notices',
      'academic_get_student_portal_grades',
      'teacher_reset_student_subject_academic_records',
      'teacher_remove_student_subject_records',
      'academic_admin_reset_exam_process',
      'academic_teacher_confirm_exam_assignment',
      'academic_teacher_object_exam_assignment',
      'academic_reconcile_expired_exam_confirmations',
      'academic_admin_confirm_exam_assignment',
      'academic_admin_create_student_career_enrollment',
      'academic_admin_correct_student_career_enrollment',
      'academic_admin_get_student_career_enrollment_history',
      'academic_admin_get_teacher_profile_link_candidates',
      'academic_admin_invalidate_student_career_enrollment',
      'academic_admin_link_teacher_record_profile',
      'academic_enroll_first_year_student',
      'academic_enroll_student_in_course_offering',
      'academic_get_student_course_enrollment_preview',
      'academic_get_teacher_course_roster_preview',
      'get_academic_transition_config',
      'upsert_exam_enrollment_from_portal'
    )
    or p.prosecdef
  )
order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  r.rolname as grantee,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname in ('public', 'auth', 'storage')
  and r.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
  and (
    p.proname in (
      'handle_new_user',
      'upsert_exam_enrollment_from_portal',
      'academic_admin_create_student_career_enrollment',
      'academic_admin_correct_student_career_enrollment',
      'academic_admin_get_student_career_enrollment_history',
      'academic_admin_get_teacher_profile_link_candidates',
      'academic_admin_invalidate_student_career_enrollment',
      'academic_admin_link_teacher_record_profile',
      'academic_enroll_first_year_student',
      'academic_enroll_student_in_course_offering',
      'academic_get_student_course_enrollment_preview',
      'academic_get_teacher_course_roster_preview',
      'get_academic_transition_config'
    )
    or p.prosecdef
  )
order by n.nspname, p.proname, identity_arguments, r.rolname;

select
  event_object_schema as table_schema,
  event_object_table as table_name,
  trigger_schema,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement,
  action_orientation,
  action_condition
from information_schema.triggers
where event_object_schema in ('auth', 'public')
  and (
    event_object_table = 'users'
    or action_statement ilike '%handle_new_user%'
    or action_statement ilike '%execute function public.%'
  )
order by event_object_schema, event_object_table, trigger_name, event_manipulation;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  c.relacl as acl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname in ('public', 'storage')
order by n.nspname, c.relname;

select
  table_schema,
  table_name,
  privilege_type,
  grantee
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_schema, table_name, grantee, privilege_type;

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'storage'
  and table_name = 'buckets'
order by ordinal_position;

select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
order by id;

select
  'auth_signup_config_local_must_be_checked_in_dashboard' as auth_note;

