-- Datos operativos del generador de mesas: snapshot unico por institucion+workspace
-- que usa src/services/workspaceSnapshot.js. Autocontenido e idempotente, mismo
-- criterio que el resto de supabase/schema/: create table/policy if not exists,
-- se puede volver a correr entero sin romper nada.

create table if not exists public.workspace_snapshots (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  owner_user_id uuid references public.profiles(user_id) on delete set null,
  owner_email text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (institution_id, workspace_key)
);

alter table public.workspace_snapshots enable row level security;

drop policy if exists "workspace_snapshots members read" on public.workspace_snapshots;
drop policy if exists "workspace_snapshots editors insert" on public.workspace_snapshots;
drop policy if exists "workspace_snapshots editors update" on public.workspace_snapshots;

create policy "workspace_snapshots members read"
on public.workspace_snapshots
for select
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id));

create policy "workspace_snapshots editors insert"
on public.workspace_snapshots
for insert
to authenticated
with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));

create policy "workspace_snapshots editors update"
on public.workspace_snapshots
for update
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']))
with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));
