-- Auditoria A-J 2026-09-05 - diagnostico solamente.
-- No modifica datos ni permisos. Ejecutar antes de cualquier migracion.

-- 1. Tablas publicas, RLS y owner.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- 2. Columnas por tabla auditada.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'institutions',
    'profiles',
    'memberships',
    'admin_audit_logs',
    'app_settings',
    'careers',
    'study_plans',
    'subjects',
    'study_plan_subjects',
    'subject_prerequisites',
    'plan_equivalences',
    'teacher_records',
    'teacher_subject_assignments',
    'course_schedules',
    'student_records',
    'student_career_plans',
    'student_academic_statuses',
    'workspace_snapshots',
    'teacher_exam_date_exclusions'
  )
order by table_name, ordinal_position;

-- 3. Primary keys, unique, checks y foreign keys.
select
  conrelid::regclass as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, contype, conname;

-- 4. Indices existentes.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 5. Policies RLS.
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
where schemaname = 'public'
order by tablename, policyname;

-- 6. Funciones SECURITY DEFINER auditadas.
select
  p.oid::regprocedure as function_signature,
  l.lanname as language,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proconfig as function_config,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname in (
    'get_public_app_status',
    'handle_new_user',
    'list_active_login_institutions',
    'is_member_of_institution',
    'is_super_admin'
  )
order by p.proname, p.oid::regprocedure::text;

-- 7. Grants EXECUTE de funciones auditadas.
select
  p.oid::regprocedure as function_signature,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else acl.grantee::regrole::text
  end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
where n.nspname = 'public'
  and p.proname in (
    'get_public_app_status',
    'handle_new_user',
    'list_active_login_institutions',
    'is_member_of_institution',
    'is_super_admin'
  )
order by function_signature, grantee::text;

-- 8. Triggers que invocan handle_new_user().
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where action_statement ilike '%handle_new_user%'
order by event_object_schema, event_object_table, trigger_name;

-- 9. Duplicados que bloquearian nuevas restricciones.
select institution_id, national_id, count(*) as total
from public.teacher_records
where nullif(trim(national_id), '') is not null
group by institution_id, national_id
having count(*) > 1
order by total desc, institution_id, national_id;

select institution_id, national_id, count(*) as total
from public.student_records
where nullif(trim(national_id), '') is not null
group by institution_id, national_id
having count(*) > 1
order by total desc, institution_id, national_id;

-- 10. Cruces multi-tenant en teacher_exam_date_exclusions.
select
  e.id,
  e.institution_id as exclusion_institution_id,
  e.teacher_id,
  t.institution_id as teacher_institution_id
from public.teacher_exam_date_exclusions e
join public.teacher_records t on t.id = e.teacher_id
where t.institution_id <> e.institution_id
order by e.institution_id, e.teacher_id, e.excluded_date;

-- 11. Datos que bloquearian CHECK constraints nuevas.
select id, institution_id, logic_group
from public.subject_prerequisites
where logic_group < 1;

select id, institution_id, current_year
from public.student_career_plans
where current_year is not null and current_year < 1;

select id, institution_id, entry_year
from public.student_career_plans
where entry_year is not null and (entry_year < 1900 or entry_year > extract(year from current_date)::int + 1);

select id, institution_id, plan_year
from public.study_plans
where plan_year is not null and (plan_year < 1900 or plan_year > extract(year from current_date)::int + 1);

-- 12. App settings publicos expuestos a anon/authenticated.
select key, is_public, jsonb_typeof(value) as value_type, updated_at
from public.app_settings
where is_public = true
order by key;
