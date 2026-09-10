-- Auditoria A-J 2026-09-05 - SQL de bajo riesgo.
-- Ejecutar UN BLOQUE POR VEZ y mostrar el resultado antes de seguir.
-- Version para Supabase SQL Editor: usa CREATE INDEX sin CONCURRENTLY porque el editor
-- puede envolver el bloque en una transaccion y Postgres rechaza CREATE INDEX CONCURRENTLY.
-- En tablas grandes de produccion, usar la variante CONCURRENTLY desde psql/CLI con autocommit.
-- No toca permisos de funciones ni cambia acceso logico de RLS.

-- LR-01. FK study_plans(institution_id, coexist_with_plan_id).
-- Rollback: drop index if exists public.idx_study_plans_coexist_with_plan;
create index if not exists idx_study_plans_coexist_with_plan
  on public.study_plans (institution_id, coexist_with_plan_id)
  where coexist_with_plan_id is not null;

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_study_plans_coexist_with_plan';

-- LR-02. FK study_plan_subjects(institution_id, subject_id).
-- Rollback: drop index if exists public.idx_study_plan_subjects_subject;
create index if not exists idx_study_plan_subjects_subject
  on public.study_plan_subjects (institution_id, subject_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_study_plan_subjects_subject';

-- LR-03. FK subject_prerequisites(institution_id, prerequisite_plan_subject_id).
-- Rollback: drop index if exists public.idx_subject_prerequisites_prerequisite;
create index if not exists idx_subject_prerequisites_prerequisite
  on public.subject_prerequisites (institution_id, prerequisite_plan_subject_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_subject_prerequisites_prerequisite';

-- LR-04. FK plan_equivalences(institution_id, target_plan_subject_id).
-- Rollback: drop index if exists public.idx_plan_equivalences_target;
create index if not exists idx_plan_equivalences_target
  on public.plan_equivalences (institution_id, target_plan_subject_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_plan_equivalences_target';

-- LR-05. FK teacher_subject_assignments(institution_id, teacher_id).
-- Rollback: drop index if exists public.idx_teacher_subject_assignments_teacher;
create index if not exists idx_teacher_subject_assignments_teacher
  on public.teacher_subject_assignments (institution_id, teacher_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_teacher_subject_assignments_teacher';

-- LR-06. FK teacher_subject_assignments(institution_id, replaced_teacher_id).
-- Rollback: drop index if exists public.idx_teacher_subject_assignments_replaced_teacher;
create index if not exists idx_teacher_subject_assignments_replaced_teacher
  on public.teacher_subject_assignments (institution_id, replaced_teacher_id)
  where replaced_teacher_id is not null;

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_teacher_subject_assignments_replaced_teacher';

-- LR-07. FK course_schedules(institution_id, teacher_id).
-- Rollback: drop index if exists public.idx_course_schedules_teacher;
create index if not exists idx_course_schedules_teacher
  on public.course_schedules (institution_id, teacher_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_course_schedules_teacher';

-- LR-08. FK student_career_plans(institution_id, career_id).
-- Rollback: drop index if exists public.idx_student_career_plans_career;
create index if not exists idx_student_career_plans_career
  on public.student_career_plans (institution_id, career_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_student_career_plans_career';

-- LR-09. FK student_career_plans(institution_id, plan_id).
-- Rollback: drop index if exists public.idx_student_career_plans_plan;
create index if not exists idx_student_career_plans_plan
  on public.student_career_plans (institution_id, plan_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_student_career_plans_plan';

-- LR-10. FK student_academic_statuses(institution_id, plan_subject_id).
-- Rollback: drop index if exists public.idx_student_academic_statuses_plan_subject;
create index if not exists idx_student_academic_statuses_plan_subject
  on public.student_academic_statuses (institution_id, plan_subject_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_student_academic_statuses_plan_subject';

-- LR-11. FK workspace_snapshots(owner_user_id).
-- Rollback: drop index if exists public.idx_workspace_snapshots_owner_user_id;
create index if not exists idx_workspace_snapshots_owner_user_id
  on public.workspace_snapshots (owner_user_id)
  where owner_user_id is not null;

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_workspace_snapshots_owner_user_id';

-- LR-12. FK teacher_exam_date_exclusions(teacher_id), hasta migrar a FK compuesta.
-- Rollback: drop index if exists public.idx_teacher_exam_date_exclusions_teacher_id;
create index if not exists idx_teacher_exam_date_exclusions_teacher_id
  on public.teacher_exam_date_exclusions (teacher_id);

select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_teacher_exam_date_exclusions_teacher_id';

-- LR-13. search_path seguro + auth.uid() envuelto en is_super_admin().
-- Rollback: recrear la funcion desde supabase/schema/01_foundation.sql.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.is_global_admin = true
      and profile.is_blocked = false
  );
$$;

select oid::regprocedure as function_signature, prosecdef as security_definer, proconfig
from pg_proc
where oid = 'public.is_super_admin()'::regprocedure;

-- LR-14. search_path seguro + auth.uid() envuelto en is_member_of_institution().
-- Rollback: recrear la funcion desde supabase/schema/01_foundation.sql.
create or replace function public.is_member_of_institution(
  target_institution_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.profiles profile on profile.user_id = membership.user_id
    where membership.institution_id = target_institution_id
      and membership.user_id = (select auth.uid())
      and profile.is_blocked = false
      and (
        allowed_roles is null
        or membership.role = any(allowed_roles)
      )
  );
$$;

select oid::regprocedure as function_signature, prosecdef as security_definer, proconfig
from pg_proc
where oid = 'public.is_member_of_institution(uuid,text[])'::regprocedure;

-- LR-15. search_path seguro en get_public_app_status(); no cambia exposicion publica.
-- Rollback: recrear la funcion desde supabase/schema/01_foundation.sql.
create or replace function public.get_public_app_status()
returns table (
  maintenance_enabled boolean,
  maintenance_message text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  setting_row public.app_settings%rowtype;
begin
  select *
  into setting_row
  from public.app_settings
  where key = 'maintenance_mode'
    and is_public = true;

  maintenance_enabled := coalesce((setting_row.value ->> 'enabled')::boolean, false);
  maintenance_message := coalesce(
    nullif(setting_row.value ->> 'message', ''),
    'La plataforma esta en mantenimiento. Intenta nuevamente en unos minutos.'
  );
  updated_at := setting_row.updated_at;
  return next;
end;
$$;

select oid::regprocedure as function_signature, prosecdef as security_definer, proconfig
from pg_proc
where oid = 'public.get_public_app_status()'::regprocedure;

-- LR-16. search_path seguro en list_active_login_institutions(); no cambia exposicion publica.
-- Rollback: recrear la funcion desde supabase/schema/01_foundation.sql.
create or replace function public.list_active_login_institutions()
returns table (
  id uuid,
  name text,
  slug text,
  logo_url text,
  plan_type text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    institutions.id,
    institutions.name,
    institutions.slug,
    institutions.logo_url,
    institutions.plan_type,
    institutions.status,
    institutions.created_at
  from public.institutions
  where institutions.status = 'active'
  order by institutions.name asc;
$$;

select oid::regprocedure as function_signature, prosecdef as security_definer, proconfig
from pg_proc
where oid = 'public.list_active_login_institutions()'::regprocedure;

-- LR-17. search_path seguro en handle_new_user(); no cambia logica ni trigger.
-- Rollback: recrear la funcion desde supabase/schema/01_foundation.sql.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (
    user_id,
    email,
    display_name,
    account_role,
    is_global_admin,
    is_blocked
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'nombre', new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'account_role', 'admin_instituto'),
    coalesce((new.raw_app_meta_data ->> 'is_global_admin')::boolean, false),
    false
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    account_role = case
      when public.profiles.is_global_admin then 'superadmin'
      else coalesce(public.profiles.account_role, excluded.account_role)
    end,
    is_global_admin = public.profiles.is_global_admin or excluded.is_global_admin,
    is_blocked = coalesce(public.profiles.is_blocked, false),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

select oid::regprocedure as function_signature, prosecdef as security_definer, proconfig
from pg_proc
where oid = 'public.handle_new_user()'::regprocedure;

-- LR-18. Optimizacion mecanica de auth.uid() en policy de lectura propia de profiles.
-- No cambia quien puede leer; solo evita llamada por fila.
-- Rollback: recrear la policy con "using (user_id = auth.uid())".
drop policy if exists "profiles can read themselves" on public.profiles;
create policy "profiles can read themselves"
on public.profiles
for select
to authenticated
using (user_id = (select auth.uid()));

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles can read themselves';

-- LR-19. Optimizacion mecanica de auth.uid() en policy de memberships.
-- No cambia quien puede leer; solo evita llamada por fila.
-- Rollback: recrear la policy con "or user_id = auth.uid()".
drop policy if exists "members can read memberships" on public.memberships;
create policy "members can read memberships"
on public.memberships
for select
to authenticated
using (
  public.is_super_admin()
  or user_id = (select auth.uid())
  or public.is_member_of_institution(institution_id, array['owner', 'admin'])
);

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'memberships' and policyname = 'members can read memberships';
