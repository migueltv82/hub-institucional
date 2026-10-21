-- ============================================================
-- HUB-INSTITUCIONAL - ASIGNACIONES DOCENTE-MATERIA
-- Bloque 06: compatibilidad UI para titularidades, suplencias y
-- licencias por materia.
--
-- Idempotente: se puede volver a correr entero sin romper nada
-- (create table if not exists, alter add column if not exists,
-- create or replace function, drop+create de policies).
-- ============================================================

create table if not exists public.subject_teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  subject_id text not null,
  program_id text not null default '',
  teacher_id uuid not null references public.profiles(user_id) on delete cascade,
  teacher_record_id uuid references public.teacher_records(id) on delete set null,
  source text not null default 'manual',
  status text not null default 'active',
  deleted_at timestamptz,
  role text not null default 'titular',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.subject_teacher_assignments
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists institution_id uuid,
  add column if not exists workspace_key text default 'main',
  add column if not exists subject_id text,
  add column if not exists program_id text default '',
  add column if not exists teacher_id uuid,
  add column if not exists teacher_record_id uuid,
  add column if not exists source text default 'manual',
  add column if not exists status text default 'active',
  add column if not exists deleted_at timestamptz,
  add column if not exists role text default 'titular',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

update public.subject_teacher_assignments
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  program_id = coalesce(program_id, ''),
  source = coalesce(nullif(btrim(source), ''), 'manual'),
  status = coalesce(nullif(btrim(status), ''), 'active'),
  role = coalesce(nullif(btrim(role), ''), 'titular'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where workspace_key is null
  or btrim(workspace_key) = ''
  or program_id is null
  or source is null
  or btrim(source) = ''
  or status is null
  or btrim(status) = ''
  or role is null
  or btrim(role) = ''
  or metadata is null
  or created_at is null
  or updated_at is null;

alter table public.subject_teacher_assignments
  alter column id set default gen_random_uuid(),
  alter column workspace_key set default 'main',
  alter column program_id set default '',
  alter column source set default 'manual',
  alter column status set default 'active',
  alter column role set default 'titular',
  alter column metadata set default '{}'::jsonb,
  alter column created_at set default timezone('utc', now()),
  alter column updated_at set default timezone('utc', now());

do $$
begin
  if not exists (select 1 from public.subject_teacher_assignments where id is null) then
    alter table public.subject_teacher_assignments alter column id set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where institution_id is null) then
    alter table public.subject_teacher_assignments alter column institution_id set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where workspace_key is null or btrim(workspace_key) = '') then
    alter table public.subject_teacher_assignments alter column workspace_key set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where subject_id is null or btrim(subject_id) = '') then
    alter table public.subject_teacher_assignments alter column subject_id set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where program_id is null) then
    alter table public.subject_teacher_assignments alter column program_id set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where teacher_id is null) then
    alter table public.subject_teacher_assignments alter column teacher_id set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where source is null or btrim(source) = '') then
    alter table public.subject_teacher_assignments alter column source set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where status is null or btrim(status) = '') then
    alter table public.subject_teacher_assignments alter column status set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where role is null or btrim(role) = '') then
    alter table public.subject_teacher_assignments alter column role set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where metadata is null) then
    alter table public.subject_teacher_assignments alter column metadata set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where created_at is null) then
    alter table public.subject_teacher_assignments alter column created_at set not null;
  end if;

  if not exists (select 1 from public.subject_teacher_assignments where updated_at is null) then
    alter table public.subject_teacher_assignments alter column updated_at set not null;
  end if;
end $$;

-- La asignacion conserva el legajo dentro de su tenant y workspace.
create unique index if not exists teacher_records_tenant_workspace_id_key
  on public.teacher_records (institution_id, workspace_key, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_teacher_assignments'::regclass and conname = 'subject_teacher_assignments_teacher_record_scope_fkey') then
    alter table public.subject_teacher_assignments
      add constraint subject_teacher_assignments_teacher_record_scope_fkey
      foreign key (institution_id, workspace_key, teacher_record_id)
      references public.teacher_records (institution_id, workspace_key, id)
      on delete set null (teacher_record_id);
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subject_teacher_assignments'::regclass
      and conname = 'subject_teacher_assignments_pkey'
  ) then
    alter table public.subject_teacher_assignments
      add constraint subject_teacher_assignments_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subject_teacher_assignments'::regclass
      and conname = 'subject_teacher_assignments_institution_id_fkey'
  ) then
    alter table public.subject_teacher_assignments
      add constraint subject_teacher_assignments_institution_id_fkey
      foreign key (institution_id) references public.institutions(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subject_teacher_assignments'::regclass
      and conname = 'subject_teacher_assignments_teacher_id_fkey'
  ) then
    alter table public.subject_teacher_assignments
      add constraint subject_teacher_assignments_teacher_id_fkey
      foreign key (teacher_id) references public.profiles(user_id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subject_teacher_assignments'::regclass
      and conname = 'subject_teacher_assignments_teacher_record_id_fkey'
  ) then
    alter table public.subject_teacher_assignments
      add constraint subject_teacher_assignments_teacher_record_id_fkey
      foreign key (teacher_record_id) references public.teacher_records(id) on delete set null;
  end if;
end $$;

alter table public.subject_teacher_assignments
  drop constraint if exists subject_teacher_assignments_workspace_key_check;

alter table public.subject_teacher_assignments
  add constraint subject_teacher_assignments_workspace_key_check
  check (btrim(workspace_key) <> '');

alter table public.subject_teacher_assignments
  drop constraint if exists subject_teacher_assignments_subject_id_check;

alter table public.subject_teacher_assignments
  add constraint subject_teacher_assignments_subject_id_check
  check (btrim(subject_id) <> '');

alter table public.subject_teacher_assignments
  drop constraint if exists subject_teacher_assignments_status_check;

alter table public.subject_teacher_assignments
  add constraint subject_teacher_assignments_status_check
  check (status in ('active', 'inactive'));

alter table public.subject_teacher_assignments
  drop constraint if exists subject_teacher_assignments_role_check;

alter table public.subject_teacher_assignments
  add constraint subject_teacher_assignments_role_check
  check (role in ('titular', 'suplente', 'licencia'));

create unique index if not exists subject_teacher_assignments_active_key
  on public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id)
  where deleted_at is null and status = 'active';

create index if not exists idx_subject_teacher_assignments_workspace
  on public.subject_teacher_assignments (institution_id, workspace_key, status, created_at desc);

create index if not exists idx_subject_teacher_assignments_teacher_active
  on public.subject_teacher_assignments (institution_id, workspace_key, teacher_id)
  where deleted_at is null and status = 'active';

create index if not exists idx_subject_teacher_assignments_subject_active
  on public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id)
  where deleted_at is null and status = 'active';

create index if not exists idx_subject_teacher_assignments_teacher_record_id
  on public.subject_teacher_assignments (teacher_record_id)
  where teacher_record_id is not null;

create or replace function public.touch_subject_teacher_assignments_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke execute on function public.touch_subject_teacher_assignments_updated_at() from public, anon, authenticated;

drop trigger if exists touch_subject_teacher_assignments_updated_at on public.subject_teacher_assignments;

create trigger touch_subject_teacher_assignments_updated_at
before insert or update on public.subject_teacher_assignments
for each row execute function public.touch_subject_teacher_assignments_updated_at();

-- Punto 3 (21/10): modelo de asignacion docente. Esta tabla es la UNICA fuente de verdad de quien da cada
-- materia: la leen el RLS, los portales, el libro docente y las mesas. teacher_subject_assignments (02) queda
-- como legado del import relacional y no decide permisos.
--   role             funcion en la materia: titular | suplente | licencia (licencia sigue siendo un rol por
--                    compatibilidad con las lecturas existentes; separarla en un estado es la fase B).
--   status           active | inactive. Una asignacion terminada queda inactive, nunca se borra.
--   end_reason       por que termino: renuncia, baja, jubilacion, reemplazado, fin_suplencia, error_de_carga, otro.
--   starts_on/ends_on  vigencia. Para una suplencia: el periodo de la licencia que cubre. Para una asignacion
--                    terminada, ends_on es la fecha efectiva de fin.
--   replaces_assignment_id  a quien reemplaza, con FK: misma institucion, workspace, materia y carrera.
alter table public.subject_teacher_assignments
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists end_reason text,
  add column if not exists replaces_assignment_id uuid;

create unique index if not exists subject_teacher_assignments_scope_id_key
  on public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_teacher_assignments'::regclass and conname = 'subject_teacher_assignments_replaces_scope_fkey') then
    alter table public.subject_teacher_assignments
      add constraint subject_teacher_assignments_replaces_scope_fkey
      foreign key (institution_id, workspace_key, subject_id, program_id, replaces_assignment_id)
      references public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, id)
      on delete set null (replaces_assignment_id);
  end if;
end $$;

-- Suplencias creadas antes de esta columna: el vinculo vivia en metadata. Solo se copia si apunta a una
-- asignacion de la misma materia (la FK lo exige).
update public.subject_teacher_assignments replacement
set replaces_assignment_id = parent.id,
  starts_on = coalesce(replacement.starts_on, case when replacement.metadata ->> 'starts_on' ~ '^\d{4}-\d{2}-\d{2}$' then (replacement.metadata ->> 'starts_on')::date end),
  ends_on = coalesce(replacement.ends_on, case
    when replacement.metadata ->> 'ends_on' ~ '^\d{4}-\d{2}-\d{2}$'
      and (replacement.metadata ->> 'ends_on')::date >= coalesce(replacement.starts_on, case when replacement.metadata ->> 'starts_on' ~ '^\d{4}-\d{2}-\d{2}$' then (replacement.metadata ->> 'starts_on')::date end, '-infinity'::date)
    then (replacement.metadata ->> 'ends_on')::date end)
from public.subject_teacher_assignments parent
where replacement.replaces_assignment_id is null
  and replacement.metadata ->> 'leave_parent_assignment_id' ~ '^[0-9a-fA-F-]{36}$'
  and parent.id = (replacement.metadata ->> 'leave_parent_assignment_id')::uuid
  and parent.id <> replacement.id
  and parent.institution_id = replacement.institution_id
  and parent.workspace_key = replacement.workspace_key
  and parent.subject_id = replacement.subject_id
  and parent.program_id = replacement.program_id;

-- Asignaciones ya dadas de baja antes de esta columna: el motivo no se conoce.
update public.subject_teacher_assignments
set end_reason = 'otro'
where status = 'inactive' and end_reason is null;

alter table public.subject_teacher_assignments
  drop constraint if exists subject_teacher_assignments_end_reason_check;
alter table public.subject_teacher_assignments
  add constraint subject_teacher_assignments_end_reason_check
  check (
    (status = 'active' and end_reason is null)
    -- "is not null" explicito: un CHECK que evalua a NULL pasa, y "null in (...)" es NULL.
    or (status = 'inactive' and end_reason is not null and end_reason in ('renuncia', 'baja', 'jubilacion', 'reemplazado', 'fin_suplencia', 'error_de_carga', 'otro'))
  );

alter table public.subject_teacher_assignments
  drop constraint if exists subject_teacher_assignments_dates_check;
alter table public.subject_teacher_assignments
  add constraint subject_teacher_assignments_dates_check
  check (ends_on is null or starts_on is null or ends_on >= starts_on);

alter table public.subject_teacher_assignments
  drop constraint if exists subject_teacher_assignments_replaces_self_check;
alter table public.subject_teacher_assignments
  add constraint subject_teacher_assignments_replaces_self_check
  check (replaces_assignment_id is null or replaces_assignment_id <> id);

create index if not exists idx_subject_teacher_assignments_replaces
  on public.subject_teacher_assignments (replaces_assignment_id)
  where replaces_assignment_id is not null;

comment on table public.teacher_subject_assignments is
  'LEGADO (import relacional). La fuente de verdad de las asignaciones docentes es subject_teacher_assignments.';

create or replace function public.academic_resolve_member_profile_by_email(
  target_institution_id uuid,
  target_workspace_key text,
  target_email text,
  target_account_role text default null
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  account_role text,
  is_blocked boolean,
  membership_role text,
  teacher_record_id uuid,
  student_record_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    profile.user_id,
    profile.email,
    profile.display_name,
    profile.account_role,
    profile.is_blocked,
    membership.role as membership_role,
    teacher_record.id as teacher_record_id,
    student_record.id as student_record_id
  from public.profiles profile
  join public.memberships membership
    on membership.user_id = profile.user_id
   and membership.institution_id = target_institution_id
  left join public.teacher_records teacher_record
    on teacher_record.institution_id = target_institution_id
   and teacher_record.workspace_key = coalesce(nullif(btrim(target_workspace_key), ''), 'main')
   and (
     teacher_record.profile_id = profile.user_id
     or lower(coalesce(teacher_record.login_email, teacher_record.email, '')) = lower(btrim(target_email))
   )
  left join public.student_records student_record
    on student_record.institution_id = target_institution_id
   and student_record.workspace_key = coalesce(nullif(btrim(target_workspace_key), ''), 'main')
   and (
     student_record.profile_id = profile.user_id
     or lower(coalesce(student_record.email, '')) = lower(btrim(target_email))
   )
  where lower(coalesce(profile.email, '')) = lower(btrim(target_email))
    and profile.is_blocked = false
    and (
      target_account_role is null
      or profile.account_role = target_account_role
    )
    -- SEC.2: solo el panel admin resuelve perfiles por email; un alumno o docente (viewer) no enumera miembros.
    and (
      public.is_super_admin()
      or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor'])
    )
  order by
    case
      when target_account_role is not null and profile.account_role = target_account_role then 0
      else 1
    end,
    profile.created_at desc
  limit 1;
$$;

create or replace function public.academic_create_teacher_subject_leave(
  p_institution_id uuid,
  p_workspace_key text,
  p_assignment_ids uuid[],
  p_replacement_teacher_id uuid,
  p_replacement_teacher_record_id uuid default null,
  p_starts_on date default null,
  p_ends_on date default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  clean_notes text := btrim(coalesce(p_notes, ''));
  leave_id uuid := gen_random_uuid();
  target_assignment public.subject_teacher_assignments%rowtype;
  affected_subjects integer := 0;
  replacement_name text;
  on_leave_name text;
begin
  if p_institution_id is null
    or p_assignment_ids is null
    or cardinality(p_assignment_ids) = 0
    or p_replacement_teacher_id is null
    or p_starts_on is null then
    raise exception 'Faltan datos para registrar la licencia.';
  end if;

  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'La licencia no puede terminar antes de empezar.' using errcode = '22023';
  end if;

  if not (public.is_super_admin() or public.is_member_of_institution(p_institution_id, array['owner', 'admin', 'editor'])) then
    raise exception 'No tenes permisos para registrar licencias docentes.';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.memberships membership
      on membership.user_id = profile.user_id
     and membership.institution_id = p_institution_id
    where profile.user_id = p_replacement_teacher_id
      and profile.account_role = 'docente'
      and profile.is_blocked = false
  ) then
    raise exception 'El docente reemplazante no existe o no tiene acceso activo a esta institucion.';
  end if;

  select coalesce(nullif(btrim(teacher.full_name), ''), nullif(btrim(profile.display_name), ''), profile.email)
  into replacement_name
  from public.profiles profile
  left join public.teacher_records teacher
    on teacher.institution_id = p_institution_id
   and teacher.workspace_key = clean_workspace_key
   and teacher.profile_id = profile.user_id
  where profile.user_id = p_replacement_teacher_id
  limit 1;

  for target_assignment in
    select *
    from public.subject_teacher_assignments assignment
    where assignment.id = any(p_assignment_ids)
      and assignment.institution_id = p_institution_id
      and assignment.workspace_key = clean_workspace_key
      and assignment.status = 'active'
      and assignment.deleted_at is null
    for update
  loop
    if target_assignment.teacher_id = p_replacement_teacher_id then
      raise exception 'El docente no puede reemplazarse a si mismo.' using errcode = '22023';
    end if;

    select coalesce(nullif(btrim(teacher.full_name), ''), nullif(btrim(profile.display_name), ''), profile.email)
    into on_leave_name
    from public.profiles profile
    left join public.teacher_records teacher
      on teacher.institution_id = target_assignment.institution_id
     and teacher.workspace_key = target_assignment.workspace_key
     and teacher.profile_id = profile.user_id
    where profile.user_id = target_assignment.teacher_id
    limit 1;

    update public.subject_teacher_assignments
    set
      role = 'licencia',
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'leave_id', leave_id,
          'leave_starts_on', p_starts_on,
          'leave_ends_on', p_ends_on,
          'leave_notes', clean_notes,
          'replacement_teacher_id', p_replacement_teacher_id,
          'replacement_teacher_record_id', p_replacement_teacher_record_id,
          'replacement_teacher_name', replacement_name
        )
    where id = target_assignment.id;

    insert into public.subject_teacher_assignments (
      institution_id,
      workspace_key,
      subject_id,
      program_id,
      teacher_id,
      teacher_record_id,
      source,
      status,
      deleted_at,
      role,
      replaces_assignment_id,
      starts_on,
      ends_on,
      metadata
    )
    values (
      target_assignment.institution_id,
      target_assignment.workspace_key,
      target_assignment.subject_id,
      target_assignment.program_id,
      p_replacement_teacher_id,
      p_replacement_teacher_record_id,
      'leave',
      'active',
      null,
      'suplente',
      target_assignment.id,
      p_starts_on,
      p_ends_on,
      jsonb_build_object(
        'leave_id', leave_id,
        'leave_parent_assignment_id', target_assignment.id,
        'replaced_assignment_id', target_assignment.id,
        'replaced_teacher_id', target_assignment.teacher_id,
        'starts_on', p_starts_on,
        'ends_on', p_ends_on,
        'notes', clean_notes,
        'teacher_on_leave_name', on_leave_name,
        'leave_ends_on', p_ends_on
      )
    )
    on conflict (institution_id, workspace_key, subject_id, program_id, teacher_id)
      where deleted_at is null and status = 'active'
    do update
    set
      teacher_record_id = excluded.teacher_record_id,
      source = 'leave',
      role = 'suplente',
      replaces_assignment_id = excluded.replaces_assignment_id,
      starts_on = excluded.starts_on,
      ends_on = excluded.ends_on,
      metadata = coalesce(public.subject_teacher_assignments.metadata, '{}'::jsonb) || excluded.metadata,
      deleted_at = null,
      status = 'active';

    affected_subjects := affected_subjects + 1;
  end loop;

  if affected_subjects = 0 then
    raise exception 'No se encontraron asignaciones activas para registrar la licencia.';
  end if;

  return jsonb_build_object(
    'leaveId', leave_id,
    'affectedSubjects', affected_subjects,
    'replacementTeacherId', p_replacement_teacher_id
  );
end;
$$;

create or replace function public.academic_update_teacher_assignment_condition(
  p_assignment_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_role text := lower(btrim(coalesce(p_role, '')));
  target_assignment public.subject_teacher_assignments%rowtype;
  closed_replacements integer := 0;
begin
  if p_assignment_id is null or clean_role not in ('titular', 'suplente') then
    raise exception 'Selecciona una asignacion y una condicion valida.';
  end if;

  select *
  into target_assignment
  from public.subject_teacher_assignments assignment
  where assignment.id = p_assignment_id
  for update;

  if target_assignment.id is null then
    raise exception 'No se encontro la asignacion docente.';
  end if;

  if not (
    public.is_super_admin()
    or public.is_member_of_institution(target_assignment.institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'No tenes permisos para actualizar la condicion docente.';
  end if;

  -- Una asignacion terminada (renuncia, baja...) no se revive cambiandole la condicion: se asigna de nuevo.
  if target_assignment.status <> 'active' or target_assignment.deleted_at is not null then
    raise exception 'La asignacion ya termino. Para que vuelva a dar la materia, asignala de nuevo.' using errcode = '22023';
  end if;

  update public.subject_teacher_assignments
  set
    status = 'inactive',
    deleted_at = coalesce(deleted_at, timezone('utc', now())),
    end_reason = 'fin_suplencia',
    -- Una suplencia que todavia no habia empezado termina el dia en que iba a empezar (ends_on >= starts_on).
    ends_on = case when starts_on > current_date then starts_on else least(coalesce(ends_on, current_date), current_date) end
  where institution_id = target_assignment.institution_id
    and workspace_key = target_assignment.workspace_key
    and status = 'active'
    and deleted_at is null
    and (
      replaces_assignment_id = target_assignment.id
      or (metadata ->> 'leave_parent_assignment_id') = target_assignment.id::text
    );

  get diagnostics closed_replacements = row_count;

  update public.subject_teacher_assignments
  set
    role = clean_role,
    status = 'active',
    deleted_at = null,
    end_reason = null,
    ends_on = null,
    metadata = coalesce(metadata, '{}'::jsonb) - 'leave_id' - 'leave_starts_on' - 'leave_ends_on' - 'leave_notes' - 'replacement_teacher_id' - 'replacement_teacher_record_id'
  where id = target_assignment.id;

  return jsonb_build_object(
    'id', target_assignment.id,
    'role', clean_role,
    'closedReplacements', closed_replacements
  );
end;
$$;

-- Punto 3 (21/10): fin de una asignacion con motivo y fecha efectiva. Reemplaza la baja directa por update desde
-- el panel, que no dejaba registro de por que termino. Nunca borra: queda inactive con end_reason y ends_on.
-- Si el docente que se va estaba de licencia, sus suplentes siguen dando la materia; se informa cuantos quedan.
create or replace function public.academic_end_teacher_assignment(
  p_assignment_id uuid,
  p_reason text,
  p_ends_on date default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_reason text := lower(btrim(coalesce(p_reason, '')));
  clean_notes text := left(btrim(coalesce(p_notes, '')), 500);
  effective_end date := coalesce(p_ends_on, current_date);
  target_assignment public.subject_teacher_assignments%rowtype;
  remaining_replacements integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;

  if p_assignment_id is null or clean_reason not in ('renuncia', 'baja', 'jubilacion', 'reemplazado', 'fin_suplencia', 'error_de_carga', 'otro') then
    raise exception 'Elegi la asignacion y el motivo del fin.' using errcode = '22023';
  end if;

  if effective_end > current_date then
    raise exception 'La fecha de fin no puede ser futura: la baja se registra cuando ocurre.' using errcode = '22023';
  end if;

  select *
  into target_assignment
  from public.subject_teacher_assignments assignment
  where assignment.id = p_assignment_id
  for update;

  if target_assignment.id is null or not (
    public.is_super_admin()
    or public.is_member_of_institution(target_assignment.institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'Acceso denegado: solo el personal de gestion termina asignaciones docentes.' using errcode = '42501';
  end if;

  if target_assignment.status <> 'active' or target_assignment.deleted_at is not null then
    raise exception 'La asignacion ya estaba terminada.' using errcode = '22023';
  end if;

  if target_assignment.starts_on is not null and effective_end < target_assignment.starts_on then
    raise exception 'La fecha de fin es anterior al inicio de la asignacion.' using errcode = '22023';
  end if;

  update public.subject_teacher_assignments
  set
    status = 'inactive',
    deleted_at = timezone('utc', now()),
    end_reason = clean_reason,
    ends_on = effective_end,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('ended_by', (select auth.uid()), 'end_notes', clean_notes)
  where id = target_assignment.id;

  select count(*)
  into remaining_replacements
  from public.subject_teacher_assignments replacement
  where replacement.replaces_assignment_id = target_assignment.id
    and replacement.status = 'active'
    and replacement.deleted_at is null;

  return jsonb_build_object(
    'id', target_assignment.id,
    'endReason', clean_reason,
    'endsOn', effective_end,
    'remainingReplacements', remaining_replacements
  );
end;
$$;

revoke execute on function public.academic_resolve_member_profile_by_email(uuid, text, text, text) from public, anon;
revoke execute on function public.academic_create_teacher_subject_leave(uuid, text, uuid[], uuid, uuid, date, date, text) from public, anon;
revoke execute on function public.academic_update_teacher_assignment_condition(uuid, text) from public, anon;
revoke execute on function public.academic_end_teacher_assignment(uuid, text, date, text) from public, anon;

grant execute on function public.academic_resolve_member_profile_by_email(uuid, text, text, text) to authenticated;
grant execute on function public.academic_create_teacher_subject_leave(uuid, text, uuid[], uuid, uuid, date, date, text) to authenticated;
grant execute on function public.academic_update_teacher_assignment_condition(uuid, text) to authenticated;
grant execute on function public.academic_end_teacher_assignment(uuid, text, date, text) to authenticated;

alter table public.subject_teacher_assignments enable row level security;

drop policy if exists "subject_teacher_assignments members read" on public.subject_teacher_assignments;
drop policy if exists "subject_teacher_assignments editors insert" on public.subject_teacher_assignments;
drop policy if exists "subject_teacher_assignments editors update" on public.subject_teacher_assignments;
drop policy if exists "subject_teacher_assignments editors delete" on public.subject_teacher_assignments;

create policy "subject_teacher_assignments members read"
on public.subject_teacher_assignments
for select
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id)
);

create policy "subject_teacher_assignments editors insert"
on public.subject_teacher_assignments
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
);

create policy "subject_teacher_assignments editors update"
on public.subject_teacher_assignments
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

create policy "subject_teacher_assignments editors delete"
on public.subject_teacher_assignments
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor'])
);

grant select, insert, update, delete on public.subject_teacher_assignments to authenticated;
