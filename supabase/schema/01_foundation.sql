-- ============================================================
-- HUB-INSTITUCIONAL - FOUNDATION SCHEMA
-- Bloque 01: extensiones, identidad (profiles), multi-tenancy
-- (institutions, memberships), auditoria y configuracion.
--
-- Idempotente: se puede volver a correr entero sin romper nada
-- (create table/function if not exists, drop+create de policies).
--
-- Antes de correr el bloque de seed del final, crear el usuario
-- en Supabase Authentication > Users con el email configurado ahi.
--
-- Convencion nueva (ver 00_README.md): cada archivo de
-- supabase/schema/ es autocontenido, sin cadena de parches.
-- ============================================================

-- ============================================================
-- Extensiones
-- ============================================================

create schema if not exists extensions;
create extension if not exists pgcrypto;

-- ============================================================
-- Tablas
-- ============================================================

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  plan_type text not null default 'free',
  status text not null default 'active',
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.institutions
  drop constraint if exists institutions_plan_type_check;

alter table public.institutions
  add constraint institutions_plan_type_check
  check (plan_type in ('free', 'pro', 'business'));

alter table public.institutions
  drop constraint if exists institutions_status_check;

alter table public.institutions
  add constraint institutions_status_check
  check (status in ('active', 'suspended'));

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  account_role text not null default 'admin_instituto',
  is_global_admin boolean not null default false,
  is_blocked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
  drop constraint if exists profiles_account_role_check;

alter table public.profiles
  add constraint profiles_account_role_check
  check (account_role in ('superadmin', 'admin_instituto', 'docente', 'alumno'));

create table if not exists public.memberships (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (institution_id, user_id)
);

alter table public.memberships
  drop constraint if exists memberships_role_check;

alter table public.memberships
  add constraint memberships_role_check
  check (role in ('owner', 'admin', 'editor', 'viewer'));

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  actor_email text,
  action text not null,
  status text not null default 'success',
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_audit_logs
  drop constraint if exists admin_audit_logs_status_check;

alter table public.admin_audit_logs
  add constraint admin_audit_logs_status_check
  check (status in ('success', 'error'));

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- Indices
-- ============================================================

create index if not exists idx_institutions_status_created_at
  on public.institutions (status, created_at desc);

create index if not exists idx_institutions_slug
  on public.institutions (slug);

create index if not exists idx_profiles_email
  on public.profiles (email);

create index if not exists idx_profiles_global_admin
  on public.profiles (is_global_admin)
  where is_global_admin = true;

create index if not exists idx_profiles_blocked
  on public.profiles (is_blocked);

create index if not exists idx_memberships_user_id
  on public.memberships (user_id);

create index if not exists idx_memberships_institution_id_role
  on public.memberships (institution_id, role);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs (created_at desc);

create index if not exists idx_admin_audit_logs_actor_created_at
  on public.admin_audit_logs (actor_user_id, created_at desc);

create index if not exists idx_admin_audit_logs_action_status
  on public.admin_audit_logs (action, status);

-- ============================================================
-- Alta automatica de perfil al crear un usuario de Auth
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- Funciones helper de autorizacion (usadas por RLS)
-- ============================================================

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.user_id = auth.uid()
      and profile.is_global_admin = true
      and profile.is_blocked = false
  );
$$;

create or replace function public.is_member_of_institution(
  target_institution_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.profiles profile on profile.user_id = membership.user_id
    where membership.institution_id = target_institution_id
      and membership.user_id = auth.uid()
      and profile.is_blocked = false
      and (
        allowed_roles is null
        or membership.role = any(allowed_roles)
      )
  );
$$;

revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.is_member_of_institution(uuid, text[]) from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_member_of_institution(uuid, text[]) to authenticated;

-- ============================================================
-- Login publico: institucion activa + estado de mantenimiento
-- ============================================================

create or replace function public.get_public_app_status()
returns table (
  maintenance_enabled boolean,
  maintenance_message text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
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

revoke execute on function public.get_public_app_status() from public;
grant execute on function public.get_public_app_status() to anon, authenticated;

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
set search_path = public
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

grant execute on function public.list_active_login_institutions() to anon, authenticated;

-- ============================================================
-- Administracion base desde la UI de superadmin
-- ============================================================

create or replace function public.foundation_require_super_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null then
    raise exception 'SUPER_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.user_id = actor_user_id
      and profile.is_global_admin = true
      and profile.is_blocked = false
  ) then
    raise exception 'SUPER_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  return actor_user_id;
end;
$$;

create or replace function public.foundation_active_institution_admin_count(
  target_institution_id uuid,
  excluded_user_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.memberships membership
  join public.profiles profile on profile.user_id = membership.user_id
  where membership.institution_id = target_institution_id
    and membership.role in ('owner', 'admin')
    and profile.is_blocked = false
    and (
      excluded_user_id is null
      or membership.user_id <> excluded_user_id
    );
$$;

create or replace function public.update_membership_role(
  target_user_id uuid,
  target_institution_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid;
  actor_email text;
  previous_role text;
  normalized_role text := lower(btrim(coalesce(new_role, '')));
begin
  actor_user_id := public.foundation_require_super_admin();

  if normalized_role not in ('owner', 'admin', 'editor', 'viewer') then
    raise exception 'INVALID_MEMBERSHIP_ROLE'
      using errcode = '22023';
  end if;

  select membership.role
  into previous_role
  from public.memberships membership
  where membership.user_id = target_user_id
    and membership.institution_id = target_institution_id
  for update;

  if previous_role is null then
    raise exception 'MEMBERSHIP_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if previous_role in ('owner', 'admin')
    and normalized_role not in ('owner', 'admin')
    and public.foundation_active_institution_admin_count(target_institution_id, target_user_id) = 0
  then
    raise exception 'INSTITUTION_REQUIRES_ACTIVE_ADMIN'
      using errcode = '23514';
  end if;

  update public.memberships
  set role = normalized_role
  where user_id = target_user_id
    and institution_id = target_institution_id;

  select profile.email
  into actor_email
  from public.profiles profile
  where profile.user_id = actor_user_id;

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
    'update_membership_role',
    'membership',
    target_institution_id::text || ':' || target_user_id::text,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'target_institution_id', target_institution_id,
      'previous_role', previous_role,
      'new_role', normalized_role
    )
  );
end;
$$;

create or replace function public.remove_user_membership(
  target_user_id uuid,
  target_institution_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid;
  actor_email text;
  previous_role text;
begin
  actor_user_id := public.foundation_require_super_admin();

  select membership.role
  into previous_role
  from public.memberships membership
  where membership.user_id = target_user_id
    and membership.institution_id = target_institution_id
  for update;

  if previous_role is null then
    raise exception 'MEMBERSHIP_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if previous_role in ('owner', 'admin')
    and public.foundation_active_institution_admin_count(target_institution_id, target_user_id) = 0
  then
    raise exception 'INSTITUTION_REQUIRES_ACTIVE_ADMIN'
      using errcode = '23514';
  end if;

  delete from public.memberships
  where user_id = target_user_id
    and institution_id = target_institution_id;

  select profile.email
  into actor_email
  from public.profiles profile
  where profile.user_id = actor_user_id;

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
    'remove_user_membership',
    'membership',
    target_institution_id::text || ':' || target_user_id::text,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'target_institution_id', target_institution_id,
      'previous_role', previous_role
    )
  );
end;
$$;

create or replace function public.set_user_access_status(
  target_user_id uuid,
  blocked boolean
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
  next_blocked boolean := coalesce(blocked, false);
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

  if target_profile.is_global_admin = true and next_blocked = true then
    raise exception 'CANNOT_BLOCK_GLOBAL_ADMIN'
      using errcode = '42501';
  end if;

  if next_blocked = true and coalesce(target_profile.is_blocked, false) = false then
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
  end if;

  update public.profiles
  set
    is_blocked = next_blocked,
    updated_at = timezone('utc', now())
  where user_id = target_user_id;

  select profile.email
  into actor_email
  from public.profiles profile
  where profile.user_id = actor_user_id;

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
    'set_user_access_status',
    'profile',
    target_user_id::text,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'previous_blocked', target_profile.is_blocked,
      'blocked', next_blocked
    )
  );
end;
$$;

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

  delete from public.memberships
  where user_id = target_user_id;

  get diagnostics removed_memberships = row_count;

  delete from public.profiles
  where user_id = target_user_id;

  select profile.email
  into actor_email
  from public.profiles profile
  where profile.user_id = actor_user_id;

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

revoke execute on function public.foundation_require_super_admin() from public, anon, authenticated;
revoke execute on function public.foundation_active_institution_admin_count(uuid, uuid) from public, anon, authenticated;

revoke execute on function public.update_membership_role(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_user_membership(uuid, uuid) from public, anon;
revoke execute on function public.set_user_access_status(uuid, boolean) from public, anon;
revoke execute on function public.delete_institution_user(uuid) from public, anon;

grant execute on function public.update_membership_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_user_membership(uuid, uuid) to authenticated;
grant execute on function public.set_user_access_status(uuid, boolean) to authenticated;
grant execute on function public.delete_institution_user(uuid) to authenticated;

-- ============================================================
-- RLS
-- ============================================================

alter table public.institutions enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles can read themselves" on public.profiles;
drop policy if exists "super admins can read profiles" on public.profiles;
drop policy if exists "super admins can update profiles" on public.profiles;
drop policy if exists "super admins can delete profiles" on public.profiles;

create policy "profiles can read themselves"
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "super admins can read profiles"
on public.profiles
for select
to authenticated
using (public.is_super_admin());

create policy "super admins can update profiles"
on public.profiles
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "super admins can delete profiles"
on public.profiles
for delete
to authenticated
using (public.is_super_admin());

drop policy if exists "members can read institutions" on public.institutions;
drop policy if exists "super admins manage institutions" on public.institutions;

create policy "members can read institutions"
on public.institutions
for select
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(id)
);

create policy "super admins manage institutions"
on public.institutions
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "members can read memberships" on public.memberships;
drop policy if exists "super admins manage memberships" on public.memberships;

create policy "members can read memberships"
on public.memberships
for select
to authenticated
using (
  public.is_super_admin()
  or user_id = auth.uid()
  or public.is_member_of_institution(institution_id, array['owner', 'admin'])
);

create policy "super admins manage memberships"
on public.memberships
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "super admins can read admin audit logs" on public.admin_audit_logs;

create policy "super admins can read admin audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.is_super_admin());

drop policy if exists "public can read public app settings" on public.app_settings;
drop policy if exists "super admins manage app settings" on public.app_settings;

create policy "public can read public app settings"
on public.app_settings
for select
to anon, authenticated
using (is_public = true);

create policy "super admins manage app settings"
on public.app_settings
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

grant select on public.app_settings to anon, authenticated;

-- ============================================================
-- Configuracion inicial
-- ============================================================

insert into public.app_settings (key, value, is_public)
values (
  'maintenance_mode',
  jsonb_build_object(
    'enabled', false,
    'message', 'La plataforma esta en mantenimiento. Intenta nuevamente en unos minutos.'
  ),
  true
)
on conflict (key) do update
set
  value = coalesce(public.app_settings.value, excluded.value),
  is_public = true,
  updated_at = public.app_settings.updated_at;

-- ============================================================
-- Seed del primer superadmin
--
-- 1. Crear antes el usuario en Supabase Authentication > Users
--    con este mismo email (password a eleccion).
-- 2. Correr este bloque (o el archivo entero) las veces que haga
--    falta: es idempotente.
-- ============================================================

do $$
declare
  target_email text := 'migueltorresv82@gmail.com';
  target_user_id uuid;
begin
  select id
  into target_user_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise notice 'Seed de superadmin omitido: no existe auth.users para el email configurado %.', target_email;
  else
    insert into public.profiles (
      user_id, email, display_name, account_role, is_global_admin, is_blocked
    )
    values (
      target_user_id, lower(target_email), target_email, 'superadmin', true, false
    )
    on conflict (user_id) do update
    set
      email = excluded.email,
      display_name = excluded.display_name,
      account_role = 'superadmin',
      is_global_admin = true,
      is_blocked = false,
      updated_at = timezone('utc', now());

    update auth.users
    set
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_global_admin": true}'::jsonb,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"account_role": "superadmin"}'::jsonb
    where id = target_user_id;
  end if;
end $$;
