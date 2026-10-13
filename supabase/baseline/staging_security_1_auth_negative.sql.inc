-- Include, NO ejecutar standalone: solo dentro de staging_security_1.mjs.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('a2000000-0000-4000-8000-000000000099', 'metadata-exploit@fixture.invalid',
  '{}'::jsonb, '{"role":"superadmin","account_role":"superadmin","is_global_admin":true,"nombre":"Security acceptance synthetic"}'::jsonb);
do $$ begin
  if not exists (select 1 from public.profiles
    where user_id = 'a2000000-0000-4000-8000-000000000099'
      and account_role = 'alumno' and is_global_admin = false and is_blocked = false)
  then raise exception 'P1_HANDLE_NEW_USER_METADATA_PRIVILEGE_ESCALATION'; end if;
  if exists (select 1 from public.memberships where user_id = 'a2000000-0000-4000-8000-000000000099')
  then raise exception 'P1_HANDLE_NEW_USER_METADATA_MEMBERSHIP'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000099', true);
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000099","role":"authenticated","user_metadata":{"role":"superadmin","is_global_admin":true}}', true);
do $$ begin
  if public.is_super_admin() then raise exception 'P1_METADATA_SUPERADMIN_HELPER'; end if;
end $$;
reset role;
-- No conservar el sub JSON: las siguientes pruebas usan claim.sub individual.
select set_config('request.jwt.claims', '{}', true);

-- Privilegios academicos y Auth: positivos y negativos conforme schema canonico.
do $$
declare fn record; allowed_authenticated boolean; allowed_anon boolean;
begin
  for fn in select p.oid, p.proname, p.proacl, p.proowner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'handle_new_user', 'foundation_require_super_admin', 'foundation_active_institution_admin_count',
      'teacher_reset_student_subject_academic_records', 'teacher_remove_student_subject_records',
      'is_super_admin', 'is_member_of_institution', 'get_public_app_status', 'list_active_login_institutions',
      'get_academic_transition_config', 'update_membership_role', 'remove_user_membership',
      'set_user_access_status', 'delete_institution_user', 'get_student_portal_workspace_snapshot',
      'academic_resolve_member_profile_by_email', 'academic_create_teacher_subject_leave',
      'academic_update_teacher_assignment_condition', 'academic_can_manage_subject',
      'academic_resolve_subject_enrollment', 'upsert_subject_enrollment_from_portal',
      'academic_teacher_create_class_session', 'academic_teacher_upsert_student_grade',
      'academic_teacher_upsert_attendance_records', 'academic_get_teacher_subject_rosters',
      'academic_get_student_subject_teacher_notices', 'academic_get_student_portal_grades',
      'upsert_exam_enrollment_from_portal'
    )
  loop
    allowed_anon := fn.proname in ('get_public_app_status', 'list_active_login_institutions');
    allowed_authenticated := fn.proname not in (
      'handle_new_user', 'foundation_require_super_admin', 'foundation_active_institution_admin_count',
      'teacher_reset_student_subject_academic_records', 'teacher_remove_student_subject_records');
    if exists (select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner)))
      where grantee = 0 and privilege_type = 'EXECUTE')
      or has_function_privilege('anon', fn.oid, 'EXECUTE') is distinct from allowed_anon
      or has_function_privilege('authenticated', fn.oid, 'EXECUTE') is distinct from allowed_authenticated
    then raise exception 'P1_EXECUTE_GRANTS_CONTRACT: %', fn.proname; end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'upsert_subject_enrollment_from_portal', 'upsert_exam_enrollment_from_portal',
        'academic_teacher_upsert_student_grade', 'academic_teacher_upsert_attendance_records',
        'academic_get_teacher_subject_rosters', 'academic_get_student_subject_teacher_notices',
        'academic_resolve_subject_enrollment', 'academic_get_student_portal_grades')) <> 8
  then raise exception 'HARNESS_RPC_MISSING_OR_OVERLOADED'; end if;
end $$;
