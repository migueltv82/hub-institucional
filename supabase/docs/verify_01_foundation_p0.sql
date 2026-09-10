-- ============================================================
-- HUB-INSTITUCIONAL - VERIFICACION FOUNDATION P0
-- Ejecutar en Supabase SQL Editor despues de 01_foundation.sql.
--
-- Este archivo no modifica datos. Solo lista estado de RPCs,
-- grants, perfiles, membresias y auditoria base.
-- ============================================================

-- 1. RPCs P0 esperadas por la UI.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_public_app_status',
    'list_active_login_institutions',
    'update_membership_role',
    'remove_user_membership',
    'set_user_access_status',
    'delete_institution_user'
  )
order by routine_name;

-- 2. Permisos de ejecucion de las RPCs administrativas.
select grantee, routine_name, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'update_membership_role',
    'remove_user_membership',
    'set_user_access_status',
    'delete_institution_user'
  )
order by routine_name, grantee;

-- 3. Perfil superadmin y usuarios recientes.
select user_id, email, account_role, is_global_admin, is_blocked
from public.profiles
order by created_at desc
limit 20;

-- 4. Membresias recientes.
select institution_id, user_id, role
from public.memberships
order by created_at desc
limit 20;

-- 5. Policies RLS de foundation.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'institutions',
    'profiles',
    'memberships',
    'admin_audit_logs',
    'app_settings'
  )
order by tablename, policyname;

-- 6. Auditoria generada por acciones P0 desde la UI.
select action, target_type, target_id, actor_email, created_at
from public.admin_audit_logs
where action in (
  'update_membership_role',
  'remove_user_membership',
  'set_user_access_status',
  'delete_institution_user'
)
order by created_at desc
limit 20;
