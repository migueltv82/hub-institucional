-- Auditoria A-J 2026-09-05 - cambios de RLS/permisos para revision individual.
-- No ejecutar entero. Pegar cada bloque por separado y revisar que acceso rompe o abre.

-- RP-01. Cerrar ejecucion directa de handle_new_user().
-- Acceso actual: por defecto una funcion nueva puede ser ejecutable por PUBLIC si no se revoca.
-- Acceso despues: ningun cliente anon/authenticated puede invocarla como RPC; el trigger auth.users la sigue ejecutando.
-- Rollback:
--   grant execute on function public.handle_new_user() to public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

select p.oid::regprocedure as function_signature, p.proacl
from pg_proc p
where p.oid = 'public.handle_new_user()'::regprocedure;

-- RP-02. Hacer explicita la exposicion publica de list_active_login_institutions().
-- Acceso actual: se concede a anon/authenticated, pero puede conservar EXECUTE implicito via PUBLIC.
-- Acceso despues: siguen pudiendo llamar anon/authenticated; se remueve el grant implicito general.
-- Rollback:
--   grant execute on function public.list_active_login_institutions() to public;
revoke execute on function public.list_active_login_institutions() from public;
grant execute on function public.list_active_login_institutions() to anon, authenticated;

select p.oid::regprocedure as function_signature, p.proacl
from pg_proc p
where p.oid = 'public.list_active_login_institutions()'::regprocedure;

-- RP-03. Grants minimos para lectura academica via Data API.
-- Acceso actual: las policies permiten SELECT a miembros, pero sin GRANT SELECT la API puede fallar.
-- Acceso despues: authenticated puede intentar SELECT; RLS sigue filtrando por membership/superadmin.
-- Riesgo: si alguna policy queda demasiado amplia, este grant la vuelve efectiva via API.
-- Rollback:
--   revoke select on all listed tables from authenticated;
grant select on table
  public.careers,
  public.study_plans,
  public.subjects,
  public.study_plan_subjects,
  public.subject_prerequisites,
  public.plan_equivalences,
  public.teacher_records,
  public.teacher_subject_assignments,
  public.course_schedules,
  public.student_records,
  public.student_career_plans,
  public.student_academic_statuses,
  public.workspace_snapshots,
  public.teacher_exam_date_exclusions
to authenticated;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
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
order by table_name, privilege_type;

-- RP-03B. Corregir privilegios amplios preexistentes en tablas academicas.
-- Hallazgo remoto: authenticated tenia INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
-- sobre tablas academicas. TRUNCATE no pasa por RLS.
-- Acceso despues: authenticated queda solo con SELECT en tablas academicas; workspace_snapshots
-- conserva INSERT/UPDATE para compatibilidad del flujo legacy con RLS.
-- Rollback:
--   no recomendado como rollback general. Si un flujo legitimo falla, restaurar solo el
--   privilegio puntual necesario y su policy RLS correspondiente.
revoke insert, update, delete, truncate, references, trigger on table
  public.careers,
  public.study_plans,
  public.subjects,
  public.study_plan_subjects,
  public.subject_prerequisites,
  public.plan_equivalences,
  public.teacher_records,
  public.teacher_subject_assignments,
  public.course_schedules,
  public.student_records,
  public.student_career_plans,
  public.student_academic_statuses,
  public.workspace_snapshots,
  public.teacher_exam_date_exclusions
from authenticated;

grant select on table
  public.careers,
  public.study_plans,
  public.subjects,
  public.study_plan_subjects,
  public.subject_prerequisites,
  public.plan_equivalences,
  public.teacher_records,
  public.teacher_subject_assignments,
  public.course_schedules,
  public.student_records,
  public.student_career_plans,
  public.student_academic_statuses,
  public.workspace_snapshots,
  public.teacher_exam_date_exclusions
to authenticated;

grant insert, update on public.workspace_snapshots to authenticated;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
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
order by table_name, privilege_type;

-- RP-04. Grants para escritura controlada por RLS en app_settings.
-- Acceso actual: app_settings tiene RLS superadmin manage, pero el SQL fuente solo concede SELECT.
-- Acceso despues: authenticated puede intentar INSERT/UPDATE; RLS solo deja pasar superadmin.
-- Riesgo: abre la superficie de escritura a cualquier authenticated si RLS se cambia mal en el futuro.
-- No se concede DELETE/TRUNCATE/REFERENCES/TRIGGER: la app solo necesita upsert del flag.
-- Rollback:
--   revoke insert, update on public.app_settings from authenticated;
revoke delete, truncate, references, trigger on public.app_settings from authenticated;
grant insert, update on public.app_settings to authenticated;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'app_settings'
  and grantee = 'authenticated'
order by privilege_type;

-- RP-05. Grants para workspace_snapshots si el cliente debe seguir guardando snapshots.
-- Estado remoto verificado: ya satisfecho por RP-03B.
-- Acceso despues: authenticated puede intentar INSERT/UPDATE; RLS limita a owner/admin/editor o superadmin.
-- Riesgo: mantiene el modelo legacy de JSON blob editable por editores de la institucion.
-- Rollback:
--   revoke insert, update on public.workspace_snapshots from authenticated;
-- grant insert, update on public.workspace_snapshots to authenticated;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'workspace_snapshots'
  and grantee = 'authenticated'
order by privilege_type;

-- RP-06. Grants futuros para teacher_exam_date_exclusions si se agrega UI de carga.
-- Acceso actual: policies insert/update/delete existen, pero no hay UI en esta fase.
-- Acceso despues: authenticated puede intentar escribir; RLS limita a owner/admin/editor o superadmin.
-- Riesgo: permite que editores carguen bloqueos docentes; confirmar que ese rol debe poder hacerlo.
-- Estado recomendado hoy: NO APLICAR hasta que exista UI/flujo de carga de bloqueos.
-- Rollback:
--   revoke insert, update, delete on public.teacher_exam_date_exclusions from authenticated;
-- grant insert, update, delete on public.teacher_exam_date_exclusions to authenticated;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'teacher_exam_date_exclusions'
  and grantee = 'authenticated'
order by privilege_type;

-- RP-07. Hardening de handle_new_user() para no confiar en raw_user_meta_data.account_role.
-- No aplicar sin revisar provisioning de admin-users para altas de alumno/docente/admin.
-- Acceso actual: un usuario puede influir account_role inicial mediante user_metadata.
-- Acceso despues: account_role inicial sale de app_metadata.account_role si existe o queda admin_instituto.
-- Riesgo: si alguna alta legitima depende solo de user_metadata.account_role, cambiara el rol inicial.
-- Rollback: recrear public.handle_new_user() desde supabase/schema/01_foundation.sql.
/*
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
    coalesce(new.raw_app_meta_data ->> 'account_role', 'admin_instituto'),
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
*/

-- RP-08. RLS mas estricta para PII academica.
-- No hay SQL automatico: requiere decision de negocio.
-- Confirmar antes:
-- - Alumno: puede leer solo su student_record y sus student_academic_statuses?
-- - Docente: puede leer solo alumnos/materias asignados?
-- - Admin/editor: puede leer y escribir padrones completos?
-- - Superadmin: necesita acceso completo o solo soporte/auditoria?
