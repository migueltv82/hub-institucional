-- Repair 07: estado liviano del motor de mesas v2.1.
-- Motivo: examEngineV21State puede ser grande y no debe viajar dentro de
-- workspace_snapshots.payload en cada autosave/guardado del admin.

create table if not exists public.exam_engine_v21_states (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  owner_user_id uuid references public.profiles(user_id) on delete set null,
  owner_email text,
  state jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (institution_id, workspace_key)
);

create index if not exists idx_exam_engine_v21_states_owner_user_id
  on public.exam_engine_v21_states (owner_user_id)
  where owner_user_id is not null;

alter table public.exam_engine_v21_states enable row level security;

drop policy if exists "exam_engine_v21_states members read" on public.exam_engine_v21_states;
drop policy if exists "exam_engine_v21_states editors insert" on public.exam_engine_v21_states;
drop policy if exists "exam_engine_v21_states editors update" on public.exam_engine_v21_states;

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

grant select, insert, update on public.exam_engine_v21_states to authenticated;

-- Migracion best-effort desde snapshots existentes. Luego la app escribira
-- directamente en exam_engine_v21_states y dejara de incluir este estado en
-- snapshots nuevos.
insert into public.exam_engine_v21_states (
  institution_id,
  workspace_key,
  owner_user_id,
  owner_email,
  state,
  updated_at
)
select
  institution_id,
  workspace_key,
  owner_user_id,
  owner_email,
  payload -> 'examEngineV21State',
  updated_at
from public.workspace_snapshots
where jsonb_typeof(payload -> 'examEngineV21State') = 'object'
on conflict (institution_id, workspace_key) do update
set
  owner_user_id = excluded.owner_user_id,
  owner_email = excluded.owner_email,
  state = excluded.state,
  updated_at = greatest(public.exam_engine_v21_states.updated_at, excluded.updated_at);
