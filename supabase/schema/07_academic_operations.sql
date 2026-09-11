-- ============================================================
-- HUB-INSTITUCIONAL - OPERACION ACADEMICA
-- Bloque 07: inscripciones a materias, libro docente
-- (clases/asistencia/notas) y deuda administrativa.
--
-- Idempotente: se puede volver a correr entero sin romper nada
-- (create table if not exists, alter add column if not exists,
-- create or replace function, drop+create de policies).
-- ============================================================

create table if not exists public.subject_enrollments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  subject_id text not null,
  program_id text not null default '',
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  student_record_id uuid references public.student_records(id) on delete set null,
  status text not null default 'active',
  enrolled_at timestamptz not null default timezone('utc', now()),
  dropped_at timestamptz,
  deleted_at timestamptz,
  legacy_snapshot_id text,
  lock_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.student_grades (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  student_record_id uuid references public.student_records(id) on delete set null,
  subject_enrollment_id uuid references public.subject_enrollments(id) on delete set null,
  exam_enrollment_id uuid,
  subject_id text not null,
  program_id text not null default '',
  teacher_id uuid references public.profiles(user_id) on delete set null,
  teacher_record_id uuid references public.teacher_records(id) on delete set null,
  grade_type text not null default 'final',
  grade_value numeric(5,2),
  grade_label text not null default '',
  grade_scale text not null default 'numeric_0_10',
  academic_status text not null default 'pending',
  observations text not null default '',
  grading_period text not null default '',
  attempt_number integer not null default 1,
  legacy_snapshot_id text,
  lock_version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subject_class_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  subject_id text not null,
  program_id text not null default '',
  teacher_id uuid not null references public.profiles(user_id) on delete cascade,
  session_date date not null,
  topic text not null default '',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subject_attendance_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  session_id uuid not null references public.subject_class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  subject_enrollment_id uuid references public.subject_enrollments(id) on delete set null,
  status text not null default 'present',
  observations text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.student_financial_status (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  student_record_id uuid not null references public.student_records(id) on delete cascade,
  adeuda_cuota boolean not null default false,
  note text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.subject_enrollments
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists institution_id uuid,
  add column if not exists workspace_key text default 'main',
  add column if not exists subject_id text,
  add column if not exists program_id text default '',
  add column if not exists student_id uuid,
  add column if not exists student_record_id uuid,
  add column if not exists status text default 'active',
  add column if not exists enrolled_at timestamptz default timezone('utc', now()),
  add column if not exists dropped_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists legacy_snapshot_id text,
  add column if not exists lock_version integer default 1,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.student_grades
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists institution_id uuid,
  add column if not exists workspace_key text default 'main',
  add column if not exists student_id uuid,
  add column if not exists student_record_id uuid,
  add column if not exists subject_enrollment_id uuid,
  add column if not exists exam_enrollment_id uuid,
  add column if not exists subject_id text,
  add column if not exists program_id text default '',
  add column if not exists teacher_id uuid,
  add column if not exists teacher_record_id uuid,
  add column if not exists grade_type text default 'final',
  add column if not exists grade_value numeric(5,2),
  add column if not exists grade_label text default '',
  add column if not exists grade_scale text default 'numeric_0_10',
  add column if not exists academic_status text default 'pending',
  add column if not exists observations text default '',
  add column if not exists grading_period text default '',
  add column if not exists attempt_number integer default 1,
  add column if not exists legacy_snapshot_id text,
  add column if not exists lock_version integer default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.subject_class_sessions
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists institution_id uuid,
  add column if not exists workspace_key text default 'main',
  add column if not exists subject_id text,
  add column if not exists program_id text default '',
  add column if not exists teacher_id uuid,
  add column if not exists session_date date,
  add column if not exists topic text default '',
  add column if not exists notes text default '',
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.subject_attendance_records
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists institution_id uuid,
  add column if not exists workspace_key text default 'main',
  add column if not exists session_id uuid,
  add column if not exists student_id uuid,
  add column if not exists subject_enrollment_id uuid,
  add column if not exists status text default 'present',
  add column if not exists observations text default '',
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.student_financial_status
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists institution_id uuid,
  add column if not exists workspace_key text default 'main',
  add column if not exists student_record_id uuid,
  add column if not exists adeuda_cuota boolean default false,
  add column if not exists note text default '',
  add column if not exists updated_at timestamptz default timezone('utc', now()),
  add column if not exists created_at timestamptz default timezone('utc', now());

update public.subject_enrollments
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  program_id = coalesce(program_id, ''),
  status = coalesce(nullif(btrim(status), ''), 'active'),
  enrolled_at = coalesce(enrolled_at, created_at, timezone('utc', now())),
  lock_version = greatest(coalesce(lock_version, 1), 1),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()));

update public.student_grades
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  program_id = coalesce(program_id, ''),
  grade_type = coalesce(nullif(btrim(grade_type), ''), 'final'),
  grade_label = coalesce(grade_label, ''),
  grade_scale = coalesce(nullif(btrim(grade_scale), ''), 'numeric_0_10'),
  academic_status = coalesce(nullif(btrim(academic_status), ''), 'pending'),
  observations = coalesce(observations, ''),
  grading_period = coalesce(grading_period, ''),
  attempt_number = greatest(coalesce(attempt_number, 1), 1),
  lock_version = greatest(coalesce(lock_version, 1), 1),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()));

update public.subject_class_sessions
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  program_id = coalesce(program_id, ''),
  topic = coalesce(topic, ''),
  notes = coalesce(notes, ''),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()));

update public.subject_attendance_records
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  status = coalesce(nullif(btrim(status), ''), 'present'),
  observations = coalesce(observations, ''),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()));

update public.student_financial_status
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  adeuda_cuota = coalesce(adeuda_cuota, false),
  note = coalesce(note, ''),
  created_at = coalesce(created_at, updated_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()));

alter table public.subject_enrollments
  alter column id set default gen_random_uuid(),
  alter column workspace_key set default 'main',
  alter column program_id set default '',
  alter column status set default 'active',
  alter column enrolled_at set default timezone('utc', now()),
  alter column lock_version set default 1,
  alter column metadata set default '{}'::jsonb,
  alter column created_at set default timezone('utc', now()),
  alter column updated_at set default timezone('utc', now());

alter table public.student_grades
  alter column id set default gen_random_uuid(),
  alter column workspace_key set default 'main',
  alter column program_id set default '',
  alter column grade_type set default 'final',
  alter column grade_label set default '',
  alter column grade_scale set default 'numeric_0_10',
  alter column academic_status set default 'pending',
  alter column observations set default '',
  alter column grading_period set default '',
  alter column attempt_number set default 1,
  alter column lock_version set default 1,
  alter column created_at set default timezone('utc', now()),
  alter column updated_at set default timezone('utc', now());

alter table public.subject_class_sessions
  alter column id set default gen_random_uuid(),
  alter column workspace_key set default 'main',
  alter column program_id set default '',
  alter column topic set default '',
  alter column notes set default '',
  alter column created_at set default timezone('utc', now()),
  alter column updated_at set default timezone('utc', now());

alter table public.subject_attendance_records
  alter column id set default gen_random_uuid(),
  alter column workspace_key set default 'main',
  alter column status set default 'present',
  alter column observations set default '',
  alter column created_at set default timezone('utc', now()),
  alter column updated_at set default timezone('utc', now());

alter table public.student_financial_status
  alter column id set default gen_random_uuid(),
  alter column workspace_key set default 'main',
  alter column adeuda_cuota set default false,
  alter column note set default '',
  alter column updated_at set default timezone('utc', now()),
  alter column created_at set default timezone('utc', now());

do $$
declare
  target_table text;
  target_column text;
begin
  foreach target_table in array array[
    'subject_enrollments',
    'student_grades',
    'subject_class_sessions',
    'subject_attendance_records',
    'student_financial_status'
  ]
  loop
    foreach target_column in array array['id', 'institution_id', 'workspace_key', 'created_at', 'updated_at']
    loop
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = target_column
      ) then
        execute format(
          'do $inner$ begin if not exists (select 1 from public.%I where %I is null) then alter table public.%I alter column %I set not null; end if; end $inner$',
          target_table,
          target_column,
          target_table,
          target_column
        );
      end if;
    end loop;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from public.subject_enrollments where subject_id is null or btrim(subject_id) = '') then
    alter table public.subject_enrollments alter column subject_id set not null;
  end if;
  if not exists (select 1 from public.subject_enrollments where program_id is null) then
    alter table public.subject_enrollments alter column program_id set not null;
  end if;
  if not exists (select 1 from public.subject_enrollments where student_id is null) then
    alter table public.subject_enrollments alter column student_id set not null;
  end if;
  if not exists (select 1 from public.subject_enrollments where status is null or btrim(status) = '') then
    alter table public.subject_enrollments alter column status set not null;
  end if;
  if not exists (select 1 from public.subject_enrollments where enrolled_at is null) then
    alter table public.subject_enrollments alter column enrolled_at set not null;
  end if;
  if not exists (select 1 from public.subject_enrollments where lock_version is null) then
    alter table public.subject_enrollments alter column lock_version set not null;
  end if;
  if not exists (select 1 from public.subject_enrollments where metadata is null) then
    alter table public.subject_enrollments alter column metadata set not null;
  end if;

  if not exists (select 1 from public.student_grades where student_id is null) then
    alter table public.student_grades alter column student_id set not null;
  end if;
  if not exists (select 1 from public.student_grades where subject_id is null or btrim(subject_id) = '') then
    alter table public.student_grades alter column subject_id set not null;
  end if;
  if not exists (select 1 from public.student_grades where program_id is null) then
    alter table public.student_grades alter column program_id set not null;
  end if;
  if not exists (select 1 from public.student_grades where grade_type is null or btrim(grade_type) = '') then
    alter table public.student_grades alter column grade_type set not null;
  end if;
  if not exists (select 1 from public.student_grades where grade_label is null) then
    alter table public.student_grades alter column grade_label set not null;
  end if;
  if not exists (select 1 from public.student_grades where grade_scale is null or btrim(grade_scale) = '') then
    alter table public.student_grades alter column grade_scale set not null;
  end if;
  if not exists (select 1 from public.student_grades where academic_status is null or btrim(academic_status) = '') then
    alter table public.student_grades alter column academic_status set not null;
  end if;
  if not exists (select 1 from public.student_grades where observations is null) then
    alter table public.student_grades alter column observations set not null;
  end if;
  if not exists (select 1 from public.student_grades where grading_period is null) then
    alter table public.student_grades alter column grading_period set not null;
  end if;
  if not exists (select 1 from public.student_grades where attempt_number is null) then
    alter table public.student_grades alter column attempt_number set not null;
  end if;
  if not exists (select 1 from public.student_grades where lock_version is null) then
    alter table public.student_grades alter column lock_version set not null;
  end if;

  if not exists (select 1 from public.subject_class_sessions where subject_id is null or btrim(subject_id) = '') then
    alter table public.subject_class_sessions alter column subject_id set not null;
  end if;
  if not exists (select 1 from public.subject_class_sessions where program_id is null) then
    alter table public.subject_class_sessions alter column program_id set not null;
  end if;
  if not exists (select 1 from public.subject_class_sessions where teacher_id is null) then
    alter table public.subject_class_sessions alter column teacher_id set not null;
  end if;
  if not exists (select 1 from public.subject_class_sessions where session_date is null) then
    alter table public.subject_class_sessions alter column session_date set not null;
  end if;
  if not exists (select 1 from public.subject_class_sessions where topic is null) then
    alter table public.subject_class_sessions alter column topic set not null;
  end if;
  if not exists (select 1 from public.subject_class_sessions where notes is null) then
    alter table public.subject_class_sessions alter column notes set not null;
  end if;

  if not exists (select 1 from public.subject_attendance_records where session_id is null) then
    alter table public.subject_attendance_records alter column session_id set not null;
  end if;
  if not exists (select 1 from public.subject_attendance_records where student_id is null) then
    alter table public.subject_attendance_records alter column student_id set not null;
  end if;
  if not exists (select 1 from public.subject_attendance_records where status is null or btrim(status) = '') then
    alter table public.subject_attendance_records alter column status set not null;
  end if;
  if not exists (select 1 from public.subject_attendance_records where observations is null) then
    alter table public.subject_attendance_records alter column observations set not null;
  end if;

  if not exists (select 1 from public.student_financial_status where student_record_id is null) then
    alter table public.student_financial_status alter column student_record_id set not null;
  end if;
  if not exists (select 1 from public.student_financial_status where adeuda_cuota is null) then
    alter table public.student_financial_status alter column adeuda_cuota set not null;
  end if;
  if not exists (select 1 from public.student_financial_status where note is null) then
    alter table public.student_financial_status alter column note set not null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_enrollments'::regclass and conname = 'subject_enrollments_student_id_fkey') then
    alter table public.subject_enrollments add constraint subject_enrollments_student_id_fkey foreign key (student_id) references public.profiles(user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_enrollments'::regclass and conname = 'subject_enrollments_student_record_id_fkey') then
    alter table public.subject_enrollments add constraint subject_enrollments_student_record_id_fkey foreign key (student_record_id) references public.student_records(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.student_grades'::regclass and conname = 'student_grades_subject_enrollment_id_fkey') then
    alter table public.student_grades add constraint student_grades_subject_enrollment_id_fkey foreign key (subject_enrollment_id) references public.subject_enrollments(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_attendance_records'::regclass and conname = 'subject_attendance_records_session_id_fkey') then
    alter table public.subject_attendance_records add constraint subject_attendance_records_session_id_fkey foreign key (session_id) references public.subject_class_sessions(id) on delete cascade;
  end if;
end $$;

alter table public.subject_enrollments drop constraint if exists subject_enrollments_workspace_key_check;
alter table public.subject_enrollments add constraint subject_enrollments_workspace_key_check check (btrim(workspace_key) <> '');
alter table public.subject_enrollments drop constraint if exists subject_enrollments_subject_id_check;
alter table public.subject_enrollments add constraint subject_enrollments_subject_id_check check (btrim(subject_id) <> '');
alter table public.subject_enrollments drop constraint if exists subject_enrollments_status_check;
alter table public.subject_enrollments add constraint subject_enrollments_status_check check (status in ('active', 'enrolled', 'dropped', 'pending'));
alter table public.subject_enrollments drop constraint if exists subject_enrollments_lock_version_check;
alter table public.subject_enrollments add constraint subject_enrollments_lock_version_check check (lock_version >= 1);

alter table public.student_grades drop constraint if exists student_grades_subject_id_check;
alter table public.student_grades add constraint student_grades_subject_id_check check (btrim(subject_id) <> '');
alter table public.student_grades drop constraint if exists student_grades_grade_value_check;
alter table public.student_grades add constraint student_grades_grade_value_check check (grade_value is null or (grade_value >= 0 and grade_value <= 10));
alter table public.student_grades drop constraint if exists student_grades_attempt_number_check;
alter table public.student_grades add constraint student_grades_attempt_number_check check (attempt_number >= 1);
alter table public.student_grades drop constraint if exists student_grades_lock_version_check;
alter table public.student_grades add constraint student_grades_lock_version_check check (lock_version >= 1);

alter table public.subject_class_sessions drop constraint if exists subject_class_sessions_subject_id_check;
alter table public.subject_class_sessions add constraint subject_class_sessions_subject_id_check check (btrim(subject_id) <> '');

alter table public.subject_attendance_records drop constraint if exists subject_attendance_records_status_check;
alter table public.subject_attendance_records add constraint subject_attendance_records_status_check check (status in ('present', 'absent', 'late', 'justified'));

create unique index if not exists subject_enrollments_current_key
  on public.subject_enrollments (institution_id, workspace_key, subject_id, program_id, student_id);

create unique index if not exists student_grades_current_key
  on public.student_grades (institution_id, workspace_key, student_id, subject_id, program_id, grade_type, attempt_number)
  where deleted_at is null;

create unique index if not exists subject_class_sessions_current_key
  on public.subject_class_sessions (institution_id, workspace_key, subject_id, program_id, teacher_id, session_date);

create unique index if not exists subject_attendance_records_current_key
  on public.subject_attendance_records (session_id, student_id);

create unique index if not exists student_financial_status_workspace_key
  on public.student_financial_status (institution_id, workspace_key, student_record_id);

create index if not exists idx_subject_enrollments_student
  on public.subject_enrollments (institution_id, workspace_key, student_id);

create index if not exists idx_subject_enrollments_subject
  on public.subject_enrollments (institution_id, workspace_key, subject_id, program_id);

create index if not exists idx_student_grades_student
  on public.student_grades (institution_id, workspace_key, student_id, updated_at desc);

create index if not exists idx_student_grades_subject
  on public.student_grades (institution_id, workspace_key, subject_id, program_id);

create index if not exists idx_subject_class_sessions_subject
  on public.subject_class_sessions (institution_id, workspace_key, subject_id, program_id, session_date desc);

create index if not exists idx_subject_attendance_records_student
  on public.subject_attendance_records (institution_id, workspace_key, student_id);

create or replace function public.touch_academic_operations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke execute on function public.touch_academic_operations_updated_at() from public, anon, authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'subject_enrollments',
    'student_grades',
    'subject_class_sessions',
    'subject_attendance_records',
    'student_financial_status'
  ]
  loop
    execute format('drop trigger if exists touch_academic_operations_updated_at on public.%I', target_table);
    execute format(
      'create trigger touch_academic_operations_updated_at before insert or update on public.%I for each row execute function public.touch_academic_operations_updated_at()',
      target_table
    );
  end loop;
end $$;

create or replace function public.academic_can_manage_subject(
  p_institution_id uuid,
  p_workspace_key text,
  p_subject_id text,
  p_program_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_super_admin()
    or public.is_member_of_institution(p_institution_id, array['owner', 'admin', 'editor'])
    or exists (
      select 1
      from public.subject_teacher_assignments assignment
      where assignment.institution_id = p_institution_id
        and assignment.workspace_key = coalesce(nullif(btrim(p_workspace_key), ''), 'main')
        and assignment.subject_id = p_subject_id
        and assignment.program_id = coalesce(p_program_id, '')
        and assignment.teacher_id = (select auth.uid())
        and assignment.status = 'active'
        and assignment.deleted_at is null
        and assignment.role in ('titular', 'suplente')
    );
$$;

create or replace function public.academic_resolve_subject_enrollment(
  p_institution_id uuid,
  p_workspace_key text,
  p_student_id uuid,
  p_subject_id text,
  p_program_id text
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select enrollment.id
  from public.subject_enrollments enrollment
  where enrollment.institution_id = p_institution_id
    and enrollment.workspace_key = coalesce(nullif(btrim(p_workspace_key), ''), 'main')
    and enrollment.student_id = p_student_id
    and enrollment.subject_id = p_subject_id
    and enrollment.program_id = coalesce(p_program_id, '')
    and enrollment.status in ('active', 'enrolled')
    and enrollment.deleted_at is null
  order by enrollment.updated_at desc
  limit 1;
$$;

create or replace function public.upsert_subject_enrollment_from_portal(
  target_institution_id uuid,
  target_workspace_key text,
  actor_user_id uuid,
  target_student_id uuid,
  target_subject_id text,
  target_program_id text,
  target_student_record_id uuid default null,
  target_status text default 'active',
  target_enrolled_at timestamptz default null,
  target_dropped_at timestamptz default null,
  target_legacy_snapshot_id text default null,
  target_client_mutation_id text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns public.subject_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  clean_program_id text := coalesce(target_program_id, '');
  clean_status text := lower(btrim(coalesce(target_status, 'active')));
  saved_row public.subject_enrollments%rowtype;
begin
  if target_institution_id is null or actor_user_id is null or target_student_id is null or btrim(coalesce(target_subject_id, '')) = '' then
    raise exception 'Faltan datos para inscribir al alumno.';
  end if;

  if actor_user_id <> target_student_id then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  if clean_status not in ('active', 'enrolled', 'dropped', 'pending') then
    raise exception 'Estado de inscripcion invalido.';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.memberships membership
      on membership.user_id = profile.user_id
     and membership.institution_id = target_institution_id
    where profile.user_id = target_student_id
      and profile.account_role = 'alumno'
      and profile.is_blocked = false
  ) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  insert into public.subject_enrollments (
    institution_id,
    workspace_key,
    subject_id,
    program_id,
    student_id,
    student_record_id,
    status,
    enrolled_at,
    dropped_at,
    deleted_at,
    legacy_snapshot_id,
    metadata
  )
  values (
    target_institution_id,
    clean_workspace_key,
    btrim(target_subject_id),
    clean_program_id,
    target_student_id,
    target_student_record_id,
    clean_status,
    coalesce(target_enrolled_at, timezone('utc', now())),
    case when clean_status = 'dropped' then coalesce(target_dropped_at, timezone('utc', now())) else null end,
    case when clean_status = 'dropped' then coalesce(target_dropped_at, timezone('utc', now())) else null end,
    target_legacy_snapshot_id,
    coalesce(target_metadata, '{}'::jsonb) || jsonb_build_object('client_mutation_id', target_client_mutation_id)
  )
  on conflict (institution_id, workspace_key, subject_id, program_id, student_id)
  do update
  set
    student_record_id = coalesce(excluded.student_record_id, public.subject_enrollments.student_record_id),
    status = excluded.status,
    enrolled_at = case when excluded.status in ('active', 'enrolled') then coalesce(excluded.enrolled_at, public.subject_enrollments.enrolled_at) else public.subject_enrollments.enrolled_at end,
    dropped_at = excluded.dropped_at,
    deleted_at = excluded.deleted_at,
    legacy_snapshot_id = coalesce(excluded.legacy_snapshot_id, public.subject_enrollments.legacy_snapshot_id),
    lock_version = public.subject_enrollments.lock_version + 1,
    metadata = coalesce(public.subject_enrollments.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb)
  returning * into saved_row;

  return saved_row;
end;
$$;

create or replace function public.academic_teacher_create_class_session(
  p_institution_id uuid,
  p_workspace_key text,
  p_subject_id text,
  p_program_id text,
  p_session_date date,
  p_topic text default ''
)
returns public.subject_class_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  clean_program_id text := coalesce(p_program_id, '');
  actor_id uuid := (select auth.uid());
  saved_row public.subject_class_sessions%rowtype;
begin
  if p_institution_id is null or actor_id is null or btrim(coalesce(p_subject_id, '')) = '' or p_session_date is null then
    raise exception 'Faltan datos para crear la clase.';
  end if;

  if not public.academic_can_manage_subject(p_institution_id, clean_workspace_key, btrim(p_subject_id), clean_program_id) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  insert into public.subject_class_sessions (
    institution_id,
    workspace_key,
    subject_id,
    program_id,
    teacher_id,
    session_date,
    topic
  )
  values (
    p_institution_id,
    clean_workspace_key,
    btrim(p_subject_id),
    clean_program_id,
    actor_id,
    p_session_date,
    coalesce(p_topic, '')
  )
  on conflict (institution_id, workspace_key, subject_id, program_id, teacher_id, session_date)
  do update
  set topic = excluded.topic
  returning * into saved_row;

  return saved_row;
end;
$$;

create or replace function public.academic_teacher_upsert_student_grade(
  p_institution_id uuid,
  p_workspace_key text,
  p_student_id uuid,
  p_student_record_id uuid,
  p_subject_enrollment_id uuid,
  p_subject_id text,
  p_program_id text,
  p_grade_type text,
  p_attempt_number integer default 1,
  p_grade_value numeric default null,
  p_academic_status text default null,
  p_expected_lock_version integer default null
)
returns public.student_grades
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  clean_program_id text := coalesce(p_program_id, '');
  clean_grade_type text := coalesce(nullif(btrim(p_grade_type), ''), 'final');
  clean_attempt_number integer := greatest(coalesce(p_attempt_number, 1), 1);
  actor_id uuid := (select auth.uid());
  resolved_enrollment_id uuid;
  existing_row public.student_grades%rowtype;
  saved_row public.student_grades%rowtype;
begin
  if p_institution_id is null or actor_id is null or p_student_id is null or btrim(coalesce(p_subject_id, '')) = '' then
    raise exception 'Faltan datos para guardar la nota.';
  end if;

  if p_grade_value is not null and (p_grade_value < 0 or p_grade_value > 10) then
    raise exception 'GRADE_VALUE_OUT_OF_RANGE';
  end if;

  if not public.academic_can_manage_subject(p_institution_id, clean_workspace_key, btrim(p_subject_id), clean_program_id) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  resolved_enrollment_id := coalesce(
    p_subject_enrollment_id,
    public.academic_resolve_subject_enrollment(p_institution_id, clean_workspace_key, p_student_id, btrim(p_subject_id), clean_program_id)
  );

  if resolved_enrollment_id is null then
    raise exception 'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND';
  end if;

  select *
  into existing_row
  from public.student_grades grade
  where grade.institution_id = p_institution_id
    and grade.workspace_key = clean_workspace_key
    and grade.student_id = p_student_id
    and grade.subject_id = btrim(p_subject_id)
    and grade.program_id = clean_program_id
    and grade.grade_type = clean_grade_type
    and grade.attempt_number = clean_attempt_number
    and grade.deleted_at is null
  for update;

  if existing_row.id is not null and p_expected_lock_version is not null and existing_row.lock_version <> p_expected_lock_version then
    raise exception 'ACADEMIC_LOCK_VERSION_CONFLICT';
  end if;

  insert into public.student_grades (
    institution_id,
    workspace_key,
    student_id,
    student_record_id,
    subject_enrollment_id,
    subject_id,
    program_id,
    teacher_id,
    grade_type,
    attempt_number,
    grade_value,
    grade_scale,
    academic_status
  )
  values (
    p_institution_id,
    clean_workspace_key,
    p_student_id,
    p_student_record_id,
    resolved_enrollment_id,
    btrim(p_subject_id),
    clean_program_id,
    actor_id,
    clean_grade_type,
    clean_attempt_number,
    p_grade_value,
    'numeric_0_10',
    coalesce(nullif(btrim(p_academic_status), ''), 'pending')
  )
  on conflict (institution_id, workspace_key, student_id, subject_id, program_id, grade_type, attempt_number)
    where deleted_at is null
  do update
  set
    student_record_id = coalesce(excluded.student_record_id, public.student_grades.student_record_id),
    subject_enrollment_id = excluded.subject_enrollment_id,
    teacher_id = excluded.teacher_id,
    grade_value = excluded.grade_value,
    academic_status = excluded.academic_status,
    lock_version = public.student_grades.lock_version + 1
  returning * into saved_row;

  return saved_row;
end;
$$;

create or replace function public.academic_teacher_upsert_attendance_records(
  p_session_id uuid,
  p_records jsonb
)
returns setof public.subject_attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.subject_class_sessions%rowtype;
  record_item jsonb;
  record_student_id uuid;
  record_subject_enrollment_id uuid;
  record_status text;
  saved_row public.subject_attendance_records%rowtype;
begin
  if actor_id is null or p_session_id is null then
    raise exception 'SUBJECT_CLASS_SESSION_NOT_FOUND';
  end if;

  select *
  into session_row
  from public.subject_class_sessions session
  where session.id = p_session_id;

  if session_row.id is null then
    raise exception 'SUBJECT_CLASS_SESSION_NOT_FOUND';
  end if;

  if not public.academic_can_manage_subject(session_row.institution_id, session_row.workspace_key, session_row.subject_id, session_row.program_id) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  for record_item in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb))
  loop
    record_student_id := nullif(record_item ->> 'student_id', '')::uuid;
    record_status := lower(coalesce(nullif(btrim(record_item ->> 'status'), ''), 'present'));

    if record_status not in ('present', 'absent', 'late', 'justified') then
      record_status := 'present';
    end if;

    record_subject_enrollment_id := nullif(record_item ->> 'subject_enrollment_id', '')::uuid;
    record_subject_enrollment_id := coalesce(
      record_subject_enrollment_id,
      public.academic_resolve_subject_enrollment(
        session_row.institution_id,
        session_row.workspace_key,
        record_student_id,
        session_row.subject_id,
        session_row.program_id
      )
    );

    if record_subject_enrollment_id is null then
      raise exception 'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND';
    end if;

    insert into public.subject_attendance_records (
      institution_id,
      workspace_key,
      session_id,
      student_id,
      subject_enrollment_id,
      status,
      observations
    )
    values (
      session_row.institution_id,
      session_row.workspace_key,
      session_row.id,
      record_student_id,
      record_subject_enrollment_id,
      record_status,
      coalesce(record_item ->> 'observations', '')
    )
    on conflict (session_id, student_id)
    do update
    set
      subject_enrollment_id = excluded.subject_enrollment_id,
      status = excluded.status,
      observations = excluded.observations
    returning * into saved_row;

    return next saved_row;
  end loop;
end;
$$;

revoke execute on function public.academic_can_manage_subject(uuid, text, text, text) from public, anon;
revoke execute on function public.academic_resolve_subject_enrollment(uuid, text, uuid, text, text) from public, anon;
revoke execute on function public.upsert_subject_enrollment_from_portal(uuid, text, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
revoke execute on function public.academic_teacher_create_class_session(uuid, text, text, text, date, text) from public, anon;
revoke execute on function public.academic_teacher_upsert_student_grade(uuid, text, uuid, uuid, uuid, text, text, text, integer, numeric, text, integer) from public, anon;
revoke execute on function public.academic_teacher_upsert_attendance_records(uuid, jsonb) from public, anon;

grant execute on function public.academic_can_manage_subject(uuid, text, text, text) to authenticated;
grant execute on function public.academic_resolve_subject_enrollment(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.upsert_subject_enrollment_from_portal(uuid, text, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.academic_teacher_create_class_session(uuid, text, text, text, date, text) to authenticated;
grant execute on function public.academic_teacher_upsert_student_grade(uuid, text, uuid, uuid, uuid, text, text, text, integer, numeric, text, integer) to authenticated;
grant execute on function public.academic_teacher_upsert_attendance_records(uuid, jsonb) to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'subject_enrollments',
    'student_grades',
    'subject_class_sessions',
    'subject_attendance_records',
    'student_financial_status'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' members read', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors insert', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors update', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors delete', target_table);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_super_admin() or public.is_member_of_institution(institution_id))',
      target_table || ' members read',
      target_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array[''owner'', ''admin'', ''editor'']))',
      target_table || ' editors insert',
      target_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_super_admin() or public.is_member_of_institution(institution_id, array[''owner'', ''admin'', ''editor''])) with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array[''owner'', ''admin'', ''editor'']))',
      target_table || ' editors update',
      target_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_super_admin() or public.is_member_of_institution(institution_id, array[''owner'', ''admin'', ''editor'']))',
      target_table || ' editors delete',
      target_table
    );
  end loop;
end $$;

grant select, insert, update, delete on
  public.subject_enrollments,
  public.student_grades,
  public.subject_class_sessions,
  public.subject_attendance_records,
  public.student_financial_status
to authenticated;
