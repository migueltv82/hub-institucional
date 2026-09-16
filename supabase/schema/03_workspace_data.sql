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

create table if not exists public.exam_engine_v21_states (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  owner_user_id uuid references public.profiles(user_id) on delete set null,
  owner_email text,
  state jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (institution_id, workspace_key)
);

create index if not exists idx_workspace_snapshots_owner_user_id
  on public.workspace_snapshots (owner_user_id)
  where owner_user_id is not null;

create index if not exists idx_exam_engine_v21_states_owner_user_id
  on public.exam_engine_v21_states (owner_user_id)
  where owner_user_id is not null;

alter table public.workspace_snapshots enable row level security;
alter table public.exam_engine_v21_states enable row level security;

drop policy if exists "workspace_snapshots members read" on public.workspace_snapshots;
drop policy if exists "workspace_snapshots editors insert" on public.workspace_snapshots;
drop policy if exists "workspace_snapshots editors update" on public.workspace_snapshots;
drop policy if exists "exam_engine_v21_states members read" on public.exam_engine_v21_states;
drop policy if exists "exam_engine_v21_states editors insert" on public.exam_engine_v21_states;
drop policy if exists "exam_engine_v21_states editors update" on public.exam_engine_v21_states;

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

create policy "exam_engine_v21_states members read"
on public.exam_engine_v21_states
for select
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id));

create policy "exam_engine_v21_states editors insert"
on public.exam_engine_v21_states
for insert
to authenticated
with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));

create policy "exam_engine_v21_states editors update"
on public.exam_engine_v21_states
for update
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']))
with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));

grant select, insert, update on public.workspace_snapshots to authenticated;
grant select, insert, update on public.exam_engine_v21_states to authenticated;
