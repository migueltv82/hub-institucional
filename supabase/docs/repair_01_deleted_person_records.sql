-- Baja auditada de personas del padron y usuarios administrativos.
-- Aplicar en Supabase SQL Editor despues de actualizar el codigo.

create table if not exists public.deleted_person_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions(id) on delete set null,
  workspace_key text not null default 'main',
  person_type text not null,
  person_id text,
  profile_id uuid references public.profiles(user_id) on delete set null,
  email text,
  dni text,
  display_name text not null default '',
  role text,
  status text,
  deleted_by uuid references public.profiles(user_id) on delete set null default auth.uid(),
  deleted_by_email text,
  deletion_source text not null default 'admin_panel',
  deletion_reason text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  restored_at timestamptz,
  restored_by uuid references public.profiles(user_id) on delete set null,
  restored_by_email text,
  created_at timestamptz not null default timezone('utc', now()),
  check (btrim(workspace_key) <> ''),
  check (person_type in ('student', 'teacher', 'admin', 'staff')),
  check (btrim(deletion_source) <> '')
);

create index if not exists idx_deleted_person_records_workspace_type_created
  on public.deleted_person_records (institution_id, workspace_key, person_type, created_at desc);

create index if not exists idx_deleted_person_records_profile_id
  on public.deleted_person_records (profile_id)
  where profile_id is not null;

create index if not exists idx_deleted_person_records_email
  on public.deleted_person_records (lower(email))
  where email is not null;

alter table public.deleted_person_records
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references public.profiles(user_id) on delete set null,
  add column if not exists restored_by_email text;

alter table public.deleted_person_records enable row level security;

drop policy if exists "deleted person records members read" on public.deleted_person_records;
drop policy if exists "deleted person records editors insert" on public.deleted_person_records;
drop policy if exists "deleted person records editors restore" on public.deleted_person_records;
drop policy if exists "deleted person records super admins manage" on public.deleted_person_records;

create policy "deleted person records members read"
on public.deleted_person_records
for select
to authenticated
using (
  public.is_super_admin()
  or (
    institution_id is not null
    and public.is_member_of_institution(institution_id)
  )
);

create policy "deleted person records editors insert"
on public.deleted_person_records
for insert
to authenticated
with check (
  public.is_super_admin()
  or (
    institution_id is not null
    and public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
  )
);

create policy "deleted person records editors restore"
on public.deleted_person_records
for update
to authenticated
using (
  public.is_super_admin()
  or (
    institution_id is not null
    and public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
  )
)
with check (
  public.is_super_admin()
  or (
    institution_id is not null
    and public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
  )
);

create policy "deleted person records super admins manage"
on public.deleted_person_records
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

grant select, insert, update on public.deleted_person_records to authenticated;

create or replace function public.delete_institution_user(
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid;
  actor_email text;
  target_profile public.profiles%rowtype;
  membership_row record;
  membership_rows jsonb := '[]'::jsonb;
  removed_memberships integer := 0;
begin
  actor_user_id := public.foundation_require_super_admin();

  select *
  into target_profile
  from public.profiles profile
  where profile.user_id = target_user_id
  for update;

  if target_profile.user_id is null then
    raise exception 'PROFILE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if target_profile.is_global_admin = true then
    raise exception 'CANNOT_DELETE_GLOBAL_ADMIN'
      using errcode = '42501';
  end if;

  for membership_row in
    select membership.institution_id, membership.role
    from public.memberships membership
    where membership.user_id = target_user_id
      and membership.role in ('owner', 'admin')
  loop
    if public.foundation_active_institution_admin_count(membership_row.institution_id, target_user_id) = 0 then
      raise exception 'INSTITUTION_REQUIRES_ACTIVE_ADMIN'
        using errcode = '23514';
    end if;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'institution_id', membership.institution_id,
        'role', membership.role,
        'created_at', membership.created_at
      )
      order by membership.created_at
    ),
    '[]'::jsonb
  )
  into membership_rows
  from public.memberships membership
  where membership.user_id = target_user_id;

  select profile.email
  into actor_email
  from public.profiles profile
  where profile.user_id = actor_user_id;

  insert into public.deleted_person_records (
    institution_id,
    workspace_key,
    person_type,
    person_id,
    profile_id,
    email,
    display_name,
    role,
    status,
    deleted_by,
    deleted_by_email,
    deletion_source,
    raw_payload
  )
  values (
    null,
    'main',
    'admin',
    target_user_id::text,
    target_user_id,
    target_profile.email,
    coalesce(target_profile.display_name, target_profile.email, ''),
    target_profile.account_role,
    case when target_profile.is_blocked then 'blocked' else 'active' end,
    actor_user_id,
    actor_email,
    'super_admin_users',
    jsonb_build_object(
      'profile', to_jsonb(target_profile),
      'memberships', membership_rows
    )
  );

  delete from public.memberships
  where user_id = target_user_id;

  get diagnostics removed_memberships = row_count;

  delete from public.profiles
  where user_id = target_user_id;

  insert into public.admin_audit_logs (
    actor_user_id,
    actor_email,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor_user_id,
    actor_email,
    'delete_institution_user',
    'profile',
    target_user_id::text,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'target_email', target_profile.email,
      'removed_memberships', removed_memberships
    )
  );
end;
$$;

revoke execute on function public.delete_institution_user(uuid) from public, anon;
grant execute on function public.delete_institution_user(uuid) to authenticated;

notify pgrst, 'reload schema';
