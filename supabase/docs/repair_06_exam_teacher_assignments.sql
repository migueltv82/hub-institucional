-- ============================================================
-- HUB-INSTITUCIONAL - ETAPA 6 / MESAS DOCENTES
--
-- Ejecutar en Supabase SQL Editor cuando el frontend informe:
-- "Could not find the table 'public.exam_teacher_assignments'".
--
-- Crea la tabla usada para publicar el precronograma a docentes,
-- las RPCs para confirmar/objetar desde el portal docente, el bypass
-- administrativo puntual y la tabla basica de inscripciones a mesas que
-- usa el reset del proceso.
-- Es idempotente.
-- ============================================================

create or replace function public.touch_workspace_operational_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke execute on function public.touch_workspace_operational_updated_at() from public, anon, authenticated;

create table if not exists public.exam_teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  exam_table_id text not null,
  teacher_id uuid not null references public.profiles(user_id) on delete cascade,
  source text not null default 'precronograma_publish',
  status text not null default 'active',
  role text not null,
  confirmation_status text not null default 'pending',
  teacher_notes text not null default '',
  confirmed_at timestamptz,
  objection_deadline timestamptz,
  requested_exam_table_id text,
  requested_role text,
  requested_date text,
  reassignment_status text not null default 'none',
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(user_id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (btrim(workspace_key) <> ''),
  check (btrim(exam_table_id) <> ''),
  check (status in ('active', 'inactive')),
  check (role in ('TITULAR', 'VOCAL_1', 'VOCAL_2')),
  check (confirmation_status in ('pending', 'confirmed', 'objected', 'reset')),
  check (reassignment_status in ('none', 'requested', 'approved', 'rejected'))
);

alter table public.exam_teacher_assignments
  add column if not exists source text default 'precronograma_publish',
  add column if not exists status text default 'active',
  add column if not exists confirmation_status text default 'pending',
  add column if not exists teacher_notes text default '',
  add column if not exists confirmed_at timestamptz,
  add column if not exists objection_deadline timestamptz,
  add column if not exists requested_exam_table_id text,
  add column if not exists requested_role text,
  add column if not exists requested_date text,
  add column if not exists reassignment_status text default 'none',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(user_id) on delete set null,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

update public.exam_teacher_assignments
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  source = coalesce(nullif(btrim(source), ''), 'precronograma_publish'),
  status = coalesce(nullif(btrim(status), ''), 'active'),
  confirmation_status = coalesce(nullif(btrim(confirmation_status), ''), 'pending'),
  teacher_notes = coalesce(teacher_notes, ''),
  reassignment_status = coalesce(nullif(btrim(reassignment_status), ''), 'none'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()));

alter table public.exam_teacher_assignments
  alter column id set default gen_random_uuid(),
  alter column workspace_key set default 'main',
  alter column source set default 'precronograma_publish',
  alter column status set default 'active',
  alter column confirmation_status set default 'pending',
  alter column teacher_notes set default '',
  alter column reassignment_status set default 'none',
  alter column metadata set default '{}'::jsonb,
  alter column created_at set default timezone('utc', now()),
  alter column updated_at set default timezone('utc', now());

create unique index if not exists exam_teacher_assignments_current_key
  on public.exam_teacher_assignments (institution_id, workspace_key, exam_table_id, teacher_id);

create index if not exists idx_exam_teacher_assignments_teacher
  on public.exam_teacher_assignments (institution_id, workspace_key, teacher_id, status, created_at desc);

create index if not exists idx_exam_teacher_assignments_exam_table
  on public.exam_teacher_assignments (institution_id, workspace_key, exam_table_id, status);

create index if not exists idx_exam_teacher_assignments_pending_deadline
  on public.exam_teacher_assignments (institution_id, workspace_key, objection_deadline)
  where status = 'active' and confirmation_status = 'pending';

drop trigger if exists exam_teacher_assignments_touch_updated_at on public.exam_teacher_assignments;
create trigger exam_teacher_assignments_touch_updated_at
before update on public.exam_teacher_assignments
for each row execute function public.touch_workspace_operational_updated_at();

create table if not exists public.exam_enrollments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  student_record_id uuid references public.student_records(id) on delete set null,
  exam_table_id text not null,
  subject_id text not null default '',
  program_id text not null default '',
  status text not null default 'active',
  enrolled_at timestamptz not null default timezone('utc', now()),
  cancelled_at timestamptz,
  deleted_at timestamptz,
  legacy_snapshot_id text,
  lock_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (btrim(workspace_key) <> ''),
  check (btrim(exam_table_id) <> ''),
  check (status in ('active', 'enrolled', 'cancelled', 'pending')),
  check (lock_version >= 1)
);

create unique index if not exists exam_enrollments_current_key
  on public.exam_enrollments (institution_id, workspace_key, exam_table_id, student_id)
  where deleted_at is null;

drop trigger if exists exam_enrollments_touch_updated_at on public.exam_enrollments;
create trigger exam_enrollments_touch_updated_at
before update on public.exam_enrollments
for each row execute function public.touch_workspace_operational_updated_at();

alter table public.exam_teacher_assignments enable row level security;
alter table public.exam_enrollments enable row level security;

drop policy if exists "exam_teacher_assignments members read" on public.exam_teacher_assignments;
drop policy if exists "exam_teacher_assignments admins insert" on public.exam_teacher_assignments;
drop policy if exists "exam_teacher_assignments admins update" on public.exam_teacher_assignments;
drop policy if exists "exam_teacher_assignments admins delete" on public.exam_teacher_assignments;
drop policy if exists "exam_teacher_assignments teacher read own" on public.exam_teacher_assignments;

create policy "exam_teacher_assignments members read"
on public.exam_teacher_assignments
for select
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id)
  or teacher_id = (select auth.uid())
);

create policy "exam_teacher_assignments admins insert"
on public.exam_teacher_assignments
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
);

create policy "exam_teacher_assignments admins update"
on public.exam_teacher_assignments
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
)
with check (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
);

create policy "exam_teacher_assignments admins delete"
on public.exam_teacher_assignments
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
);

drop policy if exists "exam_enrollments members read" on public.exam_enrollments;
drop policy if exists "exam_enrollments admins insert" on public.exam_enrollments;
drop policy if exists "exam_enrollments admins update" on public.exam_enrollments;
drop policy if exists "exam_enrollments admins delete" on public.exam_enrollments;

create policy "exam_enrollments members read"
on public.exam_enrollments
for select
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id)
  or student_id = (select auth.uid())
);

create policy "exam_enrollments admins insert"
on public.exam_enrollments
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
);

create policy "exam_enrollments admins update"
on public.exam_enrollments
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
)
with check (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
);

create policy "exam_enrollments admins delete"
on public.exam_enrollments
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
);

grant select, insert, update, delete on public.exam_teacher_assignments to authenticated;
grant select, insert, update, delete on public.exam_enrollments to authenticated;

create or replace function public.academic_teacher_confirm_exam_assignment(
  target_institution_id uuid,
  target_workspace_key text default 'main',
  target_exam_table_id text default '',
  target_confirmation_status text default 'confirmed',
  target_teacher_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  normalized_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  normalized_status text := lower(btrim(coalesce(target_confirmation_status, '')));
  updated_assignment public.exam_teacher_assignments%rowtype;
begin
  if actor_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if target_institution_id is null or nullif(btrim(target_exam_table_id), '') is null then
    raise exception 'Falta la mesa a confirmar';
  end if;

  if normalized_status not in ('confirmed', 'objected') then
    raise exception 'Estado de confirmacion invalido';
  end if;

  update public.exam_teacher_assignments
  set
    confirmation_status = normalized_status,
    teacher_notes = coalesce(target_teacher_notes, ''),
    confirmed_at = case when normalized_status = 'confirmed' then timezone('utc', now()) else null end,
    reassignment_status = case when normalized_status = 'confirmed' then 'none' else reassignment_status end,
    requested_exam_table_id = case when normalized_status = 'confirmed' then null else requested_exam_table_id end,
    requested_role = case when normalized_status = 'confirmed' then null else requested_role end,
    requested_date = case when normalized_status = 'confirmed' then null else requested_date end,
    updated_at = timezone('utc', now())
  where institution_id = target_institution_id
    and workspace_key = normalized_workspace_key
    and exam_table_id = target_exam_table_id
    and teacher_id = actor_user_id
    and status = 'active'
  returning *
  into updated_assignment;

  if updated_assignment.id is null then
    raise exception 'No se encontro una mesa asignada a este docente para confirmar.';
  end if;

  return jsonb_build_object(
    'id', updated_assignment.id,
    'exam_table_id', updated_assignment.exam_table_id,
    'role', updated_assignment.role,
    'confirmation_status', updated_assignment.confirmation_status,
    'teacher_notes', updated_assignment.teacher_notes,
    'confirmed_at', updated_assignment.confirmed_at,
    'reassignment_status', updated_assignment.reassignment_status
  );
end;
$$;

create or replace function public.academic_teacher_object_exam_assignment(
  target_institution_id uuid,
  target_workspace_key text default 'main',
  target_exam_table_id text default '',
  target_teacher_notes text default '',
  target_requested_exam_table_id text default '',
  target_requested_role text default '',
  target_requested_date text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  normalized_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  updated_assignment public.exam_teacher_assignments%rowtype;
begin
  if actor_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if target_institution_id is null or nullif(btrim(target_exam_table_id), '') is null then
    raise exception 'Falta la mesa a objetar';
  end if;

  update public.exam_teacher_assignments
  set
    confirmation_status = 'objected',
    teacher_notes = coalesce(target_teacher_notes, ''),
    confirmed_at = null,
    requested_exam_table_id = nullif(btrim(coalesce(target_requested_exam_table_id, '')), ''),
    requested_role = nullif(btrim(coalesce(target_requested_role, '')), ''),
    requested_date = nullif(btrim(coalesce(target_requested_date, '')), ''),
    reassignment_status = case
      when nullif(btrim(coalesce(target_requested_exam_table_id, '')), '') is null then 'none'
      else 'requested'
    end,
    updated_at = timezone('utc', now())
  where institution_id = target_institution_id
    and workspace_key = normalized_workspace_key
    and exam_table_id = target_exam_table_id
    and teacher_id = actor_user_id
    and status = 'active'
  returning *
  into updated_assignment;

  if updated_assignment.id is null then
    raise exception 'No se encontro una mesa asignada a este docente para confirmar.';
  end if;

  return jsonb_build_object(
    'id', updated_assignment.id,
    'exam_table_id', updated_assignment.exam_table_id,
    'role', updated_assignment.role,
    'confirmation_status', updated_assignment.confirmation_status,
    'teacher_notes', updated_assignment.teacher_notes,
    'requested_exam_table_id', updated_assignment.requested_exam_table_id,
    'requested_role', updated_assignment.requested_role,
    'requested_date', updated_assignment.requested_date,
    'reassignment_status', updated_assignment.reassignment_status
  );
end;
$$;

create or replace function public.academic_reconcile_expired_exam_confirmations(
  target_institution_id uuid,
  target_workspace_key text default 'main',
  target_exam_table_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  normalized_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  normalized_exam_table_id text := nullif(btrim(coalesce(target_exam_table_id, '')), '');
  actor_is_admin boolean;
  updated_count integer := 0;
begin
  if actor_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if target_institution_id is null then
    raise exception 'Falta la institucion activa';
  end if;

  actor_is_admin := public.is_super_admin()
    or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor']);

  if not actor_is_admin and not exists (
    select 1
    from public.exam_teacher_assignments eta
    where eta.institution_id = target_institution_id
      and eta.workspace_key = normalized_workspace_key
      and eta.teacher_id = actor_user_id
      and eta.status = 'active'
      and (normalized_exam_table_id is null or eta.exam_table_id = normalized_exam_table_id)
  ) then
    raise exception 'ACADEMIC_EXAM_RECONCILE_FORBIDDEN' using errcode = '42501';
  end if;

  update public.exam_teacher_assignments eta
  set
    confirmation_status = 'confirmed',
    confirmed_at = timezone('utc', now()),
    teacher_notes = case
      when nullif(btrim(eta.teacher_notes), '') is null then 'Confirmada automaticamente por vencimiento del plazo.'
      else eta.teacher_notes
    end,
    updated_at = timezone('utc', now())
  where eta.institution_id = target_institution_id
    and eta.workspace_key = normalized_workspace_key
    and eta.status = 'active'
    and eta.confirmation_status = 'pending'
    and eta.objection_deadline is not null
    and eta.objection_deadline <= timezone('utc', now())
    and (normalized_exam_table_id is null or eta.exam_table_id = normalized_exam_table_id)
    and (actor_is_admin or eta.teacher_id = actor_user_id);

  get diagnostics updated_count = row_count;

  return jsonb_build_object(
    'updated', updated_count,
    'workspace_key', normalized_workspace_key,
    'exam_table_id', normalized_exam_table_id
  );
end;
$$;

create or replace function public.academic_admin_confirm_exam_assignment(
  target_institution_id uuid,
  target_workspace_key text default 'main',
  target_exam_table_id text default '',
  target_teacher_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  normalized_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  updated_count integer := 0;
begin
  if actor_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if target_institution_id is null
    or nullif(btrim(target_exam_table_id), '') is null
    or target_teacher_id is null then
    raise exception 'Falta la mesa o el docente a confirmar';
  end if;

  if not (
    public.is_super_admin()
    or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'ACADEMIC_ADMIN_CONFIRM_FORBIDDEN' using errcode = '42501';
  end if;

  update public.exam_teacher_assignments
  set
    confirmation_status = 'confirmed',
    confirmed_at = timezone('utc', now()),
    reassignment_status = 'none',
    requested_exam_table_id = null,
    requested_role = null,
    requested_date = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'admin_confirmed_by', actor_user_id,
      'admin_confirmed_at', timezone('utc', now())
    ),
    updated_at = timezone('utc', now())
  where institution_id = target_institution_id
    and workspace_key = normalized_workspace_key
    and exam_table_id = target_exam_table_id
    and teacher_id = target_teacher_id
    and status = 'active';

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'No se encontro una asignacion docente activa para confirmar.';
  end if;

  return jsonb_build_object(
    'updated', updated_count,
    'exam_table_id', target_exam_table_id,
    'teacher_id', target_teacher_id
  );
end;
$$;

revoke execute on function public.academic_teacher_confirm_exam_assignment(uuid, text, text, text, text) from public, anon;
revoke execute on function public.academic_teacher_object_exam_assignment(uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.academic_reconcile_expired_exam_confirmations(uuid, text, text) from public, anon;
revoke execute on function public.academic_admin_confirm_exam_assignment(uuid, text, text, uuid) from public, anon;
grant execute on function public.academic_teacher_confirm_exam_assignment(uuid, text, text, text, text) to authenticated;
grant execute on function public.academic_teacher_object_exam_assignment(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.academic_reconcile_expired_exam_confirmations(uuid, text, text) to authenticated;
grant execute on function public.academic_admin_confirm_exam_assignment(uuid, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
