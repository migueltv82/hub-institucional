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

-- 03.5c: academic_status solo admite el conjunto canonico, el mismo que normaliza
-- academic_teacher_upsert_student_grade (03.5b) y que leen el RPC de mesas y el portal.
-- Se agrega NOT VALID y se valida aparte; si hay filas no canonicas aborta sin tocar datos.
do $$
declare
  noncanonical_count bigint;
begin
  -- Un CHECK con el mismo nombre y otra definicion no se da por bueno.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_grades'::regclass
      and conname = 'student_grades_academic_status_check'
      and pg_get_constraintdef(oid) <> 'CHECK ((academic_status = ANY (ARRAY[''pending''::text, ''regular''::text, ''libre''::text, ''promocionado''::text, ''approved''::text, ''failed''::text, ''absent''::text])))'
  ) then
    raise exception 'ACADEMIC_STATUS_CHECK_MISMATCH: student_grades_academic_status_check existe con otra definicion. Revisarla antes de aplicar 03.5c.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_grades'::regclass
      and conname = 'student_grades_academic_status_check'
  ) then
    alter table public.student_grades
      add constraint student_grades_academic_status_check
      check (academic_status in ('pending', 'regular', 'libre', 'promocionado', 'approved', 'failed', 'absent'))
      not valid;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_grades'::regclass
      and conname = 'student_grades_academic_status_check'
      and not convalidated
  ) then
    select count(*) into noncanonical_count
    from public.student_grades
    where academic_status not in ('pending', 'regular', 'libre', 'promocionado', 'approved', 'failed', 'absent');
    if noncanonical_count > 0 then
      raise exception 'ACADEMIC_STATUS_NONCANONICAL_ROWS: % filas de student_grades tienen academic_status fuera del conjunto canonico. Corregirlas antes de aplicar 03.5c (diagnostico: supabase/security/academic_status_canonical_diagnostic.sql).', noncanonical_count
        using errcode = '23514';
    end if;
    alter table public.student_grades validate constraint student_grades_academic_status_check;
  end if;
end $$;

-- El legajo de una inscripcion pertenece al mismo tenant y workspace.
create unique index if not exists student_records_tenant_workspace_id_key
  on public.student_records (institution_id, workspace_key, id);
create unique index if not exists subject_enrollments_tenant_workspace_id_key
  on public.subject_enrollments (institution_id, workspace_key, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_enrollments'::regclass and conname = 'subject_enrollments_student_record_scope_fkey') then
    alter table public.subject_enrollments
      add constraint subject_enrollments_student_record_scope_fkey
      foreign key (institution_id, workspace_key, student_record_id)
      references public.student_records (institution_id, workspace_key, id)
      on delete set null (student_record_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_enrollments'::regclass and conname = 'subject_enrollments_student_id_fkey') then
    alter table public.subject_enrollments add constraint subject_enrollments_student_id_fkey foreign key (student_id) references public.profiles(user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_enrollments'::regclass and conname = 'subject_enrollments_student_record_id_fkey') then
    alter table public.subject_enrollments add constraint subject_enrollments_student_record_id_fkey foreign key (student_record_id) references public.student_records(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.student_grades'::regclass and conname = 'student_grades_subject_enrollment_id_fkey') then
    alter table public.student_grades add constraint student_grades_subject_enrollment_id_fkey foreign key (subject_enrollment_id) references public.subject_enrollments(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.student_grades'::regclass and conname = 'student_grades_subject_enrollment_scope_fkey') then
    alter table public.student_grades
      add constraint student_grades_subject_enrollment_scope_fkey
      foreign key (institution_id, workspace_key, subject_enrollment_id)
      references public.subject_enrollments (institution_id, workspace_key, id)
      on delete set null (subject_enrollment_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_attendance_records'::regclass and conname = 'subject_attendance_records_session_id_fkey') then
    alter table public.subject_attendance_records add constraint subject_attendance_records_session_id_fkey foreign key (session_id) references public.subject_class_sessions(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.subject_attendance_records'::regclass and conname = 'subject_attendance_records_enrollment_scope_fkey') then
    alter table public.subject_attendance_records
      add constraint subject_attendance_records_enrollment_scope_fkey
      foreign key (institution_id, workspace_key, subject_enrollment_id)
      references public.subject_enrollments (institution_id, workspace_key, id)
      on delete set null (subject_enrollment_id);
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
  -- AUD.I2a P1: reloj real, no el inicio de la transaccion. Una escritura que espero un lock queda
  -- despues de la que lo tenia, y "la ultima condicion" (mesas, correlativas) respeta ese orden.
  new.updated_at := timezone('utc', clock_timestamp());
  return new;
end;
$$;

revoke execute on function public.touch_academic_operations_updated_at() from public, anon, authenticated;

-- AUD.I2a P1: serializa toda escritura de notas sobre la misma identidad academica (alumno, materia,
-- carrera): docente, historia importada y acta de examen. Lock de transaccion, se libera al terminar.
-- Interna: sin EXECUTE para roles de la API.
create or replace function public.academic_lock_student_subject(
  p_institution_id uuid,
  p_workspace_key text,
  p_student_id uuid,
  p_subject_id text,
  p_program_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    hashtextextended(concat_ws('|', 'student_subject', p_institution_id::text, p_workspace_key, p_student_id::text, p_subject_id, p_program_id), 0)
  );
$$;

revoke all on function public.academic_lock_student_subject(uuid, text, uuid, text, text) from public, anon, authenticated;

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
        and public.is_member_of_institution(p_institution_id)
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
    and (select auth.uid()) is not null
    and public.is_member_of_institution(p_institution_id)
    and (
      enrollment.student_id = (select auth.uid())
      or public.academic_can_manage_subject(
        p_institution_id,
        coalesce(nullif(btrim(p_workspace_key), ''), 'main'),
        p_subject_id,
        coalesce(p_program_id, '')
      )
    )
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
  authenticated_user_id uuid := (select auth.uid());
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  clean_program_id text := coalesce(target_program_id, '');
  clean_status text := lower(btrim(coalesce(target_status, 'active')));
  saved_row public.subject_enrollments%rowtype;
begin
  if target_institution_id is null or actor_user_id is null or target_student_id is null or btrim(coalesce(target_subject_id, '')) = '' then
    raise exception 'Faltan datos para inscribir al alumno.';
  end if;

  if authenticated_user_id is null
    or authenticated_user_id <> actor_user_id
    or actor_user_id <> target_student_id
  then
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
    -- 06.3: una institucion suspendida no acepta autogestion del alumno.
    join public.institutions institution
      on institution.id = membership.institution_id
     and institution.status = 'active'
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
  raw_academic_status text := lower(btrim(coalesce(p_academic_status, '')));
  clean_academic_status text;
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

  -- La mesa (upsert_exam_enrollment_from_portal) y las correlativas comparan
  -- academic_status exacto: aca se guarda solo el conjunto canonico.
  clean_academic_status := case
    when raw_academic_status = '' then 'pending'
    when raw_academic_status in ('pending', 'regular', 'libre', 'promocionado', 'approved', 'failed', 'absent') then raw_academic_status
    when raw_academic_status = 'pendiente' then 'pending'
    when raw_academic_status in ('aprobado', 'aprobada') then 'approved'
    when raw_academic_status in ('desaprobado', 'desaprobada', 'reprobado', 'reprobada') then 'failed'
    when raw_academic_status in ('promocionada', 'promocion', 'promoción') then 'promocionado'
    when raw_academic_status = 'ausente' then 'absent'
    else null
  end;

  if clean_academic_status is null then
    raise exception 'ACADEMIC_STATUS_INVALID' using errcode = '22023';
  end if;

  if not public.academic_can_manage_subject(p_institution_id, clean_workspace_key, btrim(p_subject_id), clean_program_id) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  resolved_enrollment_id := coalesce(
    p_subject_enrollment_id,
    public.academic_resolve_subject_enrollment(p_institution_id, clean_workspace_key, p_student_id, btrim(p_subject_id), clean_program_id)
  );

  -- Un UUID recibido no evita la validacion canonica de la inscripcion.
  -- El bloqueo compartido estabiliza su contexto hasta finalizar la escritura.
  select enrollment.id
  into resolved_enrollment_id
  from public.subject_enrollments enrollment
  where enrollment.id = resolved_enrollment_id
    and enrollment.institution_id = p_institution_id
    and enrollment.workspace_key = clean_workspace_key
    and enrollment.student_id = p_student_id
    and enrollment.subject_id = btrim(p_subject_id)
    and enrollment.program_id = clean_program_id
    and enrollment.status in ('active', 'enrolled')
    and enrollment.deleted_at is null
    and (
      p_student_record_id is null
      or enrollment.student_record_id = p_student_record_id
    )
  for share;

  if resolved_enrollment_id is null then
    raise exception 'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND';
  end if;

  perform public.academic_lock_student_subject(p_institution_id, clean_workspace_key, p_student_id, btrim(p_subject_id), clean_program_id);

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
    clean_academic_status
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
  where session.id = p_session_id
  for share;

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

    -- El UUID recibido debe resolver en el contexto exacto de la clase.
    select enrollment.id
    into record_subject_enrollment_id
    from public.subject_enrollments enrollment
    where enrollment.id = record_subject_enrollment_id
      and enrollment.institution_id = session_row.institution_id
      and enrollment.workspace_key = session_row.workspace_key
      and enrollment.student_id = record_student_id
      and enrollment.subject_id = session_row.subject_id
      and enrollment.program_id = session_row.program_id
      and enrollment.status in ('active', 'enrolled')
      and enrollment.deleted_at is null
    for share;

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

create or replace function public.academic_get_teacher_subject_rosters(
  p_institution_id uuid,
  p_workspace_key text default 'main'
)
returns table (
  "enrollmentId" uuid,
  "subjectId" text,
  "programId" text,
  "studentId" uuid,
  "studentRecordId" uuid,
  "fullName" text,
  dni text,
  email text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with context as (
    select
      (select auth.uid()) as actor_id,
      coalesce(nullif(btrim(p_workspace_key), ''), 'main') as workspace_key
  ),
  accessible_subjects as (
    select distinct
      assignment.subject_id,
      assignment.program_id
    from public.subject_teacher_assignments assignment
    cross join context
    where assignment.institution_id = p_institution_id
      and context.actor_id is not null
      and public.is_member_of_institution(p_institution_id)
      and assignment.workspace_key = context.workspace_key
      and assignment.teacher_id = context.actor_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and assignment.role in ('titular', 'suplente')
  ),
  active_enrollments as (
    select distinct on (
      enrollment.student_id,
      enrollment.student_record_id,
      enrollment.subject_id,
      enrollment.program_id
    )
      enrollment.*
    from public.subject_enrollments enrollment
    join accessible_subjects subject
      on subject.subject_id = enrollment.subject_id
     and subject.program_id = enrollment.program_id
    cross join context
    where enrollment.institution_id = p_institution_id
      and enrollment.workspace_key = context.workspace_key
      and enrollment.status in ('active', 'enrolled')
      and enrollment.deleted_at is null
      and exists (
        select 1 from public.memberships student_membership
        where student_membership.institution_id = enrollment.institution_id
          and student_membership.user_id = enrollment.student_id
      )
      and (
        enrollment.student_record_id is null
        or exists (
          select 1 from public.student_records linked_record
          where linked_record.id = enrollment.student_record_id
            and linked_record.institution_id = enrollment.institution_id
            and linked_record.workspace_key = enrollment.workspace_key
        )
      )
    order by
      enrollment.student_id,
      enrollment.student_record_id,
      enrollment.subject_id,
      enrollment.program_id,
      enrollment.updated_at desc nulls last,
      enrollment.created_at desc nulls last
  )
  select
    enrollment.id as "enrollmentId",
    enrollment.subject_id as "subjectId",
    enrollment.program_id as "programId",
    enrollment.student_id as "studentId",
    enrollment.student_record_id as "studentRecordId",
    coalesce(
      nullif(btrim(student_record.full_name), ''),
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(profile.email), ''),
      'Alumno sin nombre registrado'
    ) as "fullName",
    coalesce(nullif(btrim(student_record.dni), ''), nullif(btrim(student_record.national_id), '')) as dni,
    coalesce(nullif(btrim(student_record.email), ''), nullif(btrim(profile.email), '')) as email
  from active_enrollments enrollment
  left join public.student_records student_record
    on student_record.institution_id = enrollment.institution_id
    and student_record.workspace_key = enrollment.workspace_key
    and (
      student_record.id = enrollment.student_record_id
      or (
        student_record.profile_id is not null
        and student_record.profile_id = enrollment.student_id
      )
    )
  left join public.profiles profile
    on profile.user_id = enrollment.student_id
  order by "fullName", "subjectId", "programId";
$$;

create or replace function public.academic_get_student_subject_teacher_notices(
  p_institution_id uuid,
  p_workspace_key text default 'main'
)
returns table (
  "subjectId" text,
  "programId" text,
  "teacherOnLeave" text,
  "replacementTeacher" text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with context as (
    select
      (select auth.uid()) as actor_id,
      coalesce(nullif(btrim(p_workspace_key), ''), 'main') as workspace_key,
      current_date as today
  ),
  active_student_subjects as (
    select distinct
      enrollment.subject_id,
      enrollment.program_id
    from public.subject_enrollments enrollment
    cross join context
    where enrollment.institution_id = p_institution_id
      and context.actor_id is not null
      and public.is_member_of_institution(p_institution_id)
      and enrollment.workspace_key = context.workspace_key
      and enrollment.student_id = context.actor_id
      and enrollment.status in ('active', 'enrolled')
      and enrollment.deleted_at is null
  ),
  active_leaves as (
    select
      leave_assignment.*
    from public.subject_teacher_assignments leave_assignment
    join active_student_subjects subject
      on subject.subject_id = leave_assignment.subject_id
     and subject.program_id = leave_assignment.program_id
    cross join context
    where leave_assignment.institution_id = p_institution_id
      and leave_assignment.workspace_key = context.workspace_key
      and leave_assignment.status = 'active'
      and leave_assignment.deleted_at is null
      and leave_assignment.role = 'licencia'
      and exists (
        select 1 from public.memberships teacher_membership
        where teacher_membership.institution_id = leave_assignment.institution_id
          and teacher_membership.user_id = leave_assignment.teacher_id
      )
      and (
        leave_assignment.teacher_record_id is null
        or exists (
          select 1 from public.teacher_records linked_record
          where linked_record.id = leave_assignment.teacher_record_id
            and linked_record.institution_id = leave_assignment.institution_id
            and linked_record.workspace_key = leave_assignment.workspace_key
        )
      )
      and (
        nullif(leave_assignment.metadata ->> 'leave_starts_on', '') is null
        or (leave_assignment.metadata ->> 'leave_starts_on')::date <= context.today
      )
      and (
        nullif(leave_assignment.metadata ->> 'leave_ends_on', '') is null
        or context.today <= (leave_assignment.metadata ->> 'leave_ends_on')::date
      )
  )
  select distinct
    leave_assignment.subject_id as "subjectId",
    leave_assignment.program_id as "programId",
    coalesce(
      nullif(btrim(leave_teacher.full_name), ''),
      nullif(btrim(leave_profile.display_name), ''),
      nullif(btrim(leave_profile.email), ''),
      'docente titular'
    ) as "teacherOnLeave",
    coalesce(
      nullif(btrim(replacement_teacher.full_name), ''),
      nullif(btrim(replacement_profile.display_name), ''),
      nullif(btrim(replacement_profile.email), ''),
      'docente suplente'
    ) as "replacementTeacher"
  from active_leaves leave_assignment
  left join public.subject_teacher_assignments replacement_assignment
    on replacement_assignment.institution_id = leave_assignment.institution_id
   and replacement_assignment.workspace_key = leave_assignment.workspace_key
   and replacement_assignment.subject_id = leave_assignment.subject_id
   and replacement_assignment.program_id = leave_assignment.program_id
   and replacement_assignment.status = 'active'
   and replacement_assignment.deleted_at is null
   and replacement_assignment.role = 'suplente'
   and exists (
     select 1 from public.memberships teacher_membership
     where teacher_membership.institution_id = replacement_assignment.institution_id
       and teacher_membership.user_id = replacement_assignment.teacher_id
   )
   and (
     replacement_assignment.teacher_record_id is null
     or exists (
       select 1 from public.teacher_records linked_record
       where linked_record.id = replacement_assignment.teacher_record_id
         and linked_record.institution_id = replacement_assignment.institution_id
         and linked_record.workspace_key = replacement_assignment.workspace_key
     )
   )
   and (
      replacement_assignment.metadata ->> 'leave_parent_assignment_id' = leave_assignment.id::text
      or replacement_assignment.teacher_id::text = leave_assignment.metadata ->> 'replacement_teacher_id'
   )
  left join public.teacher_records leave_teacher
    on leave_teacher.institution_id = leave_assignment.institution_id
    and leave_teacher.workspace_key = leave_assignment.workspace_key
    and (
      leave_teacher.id = leave_assignment.teacher_record_id
      or (
        leave_teacher.profile_id is not null
        and leave_teacher.profile_id = leave_assignment.teacher_id
      )
    )
  left join public.profiles leave_profile
    on leave_profile.user_id = leave_assignment.teacher_id
  left join public.teacher_records replacement_teacher
    on replacement_teacher.institution_id = replacement_assignment.institution_id
    and replacement_teacher.workspace_key = replacement_assignment.workspace_key
    and (
      replacement_teacher.id = replacement_assignment.teacher_record_id
      or (
        replacement_teacher.profile_id is not null
        and replacement_teacher.profile_id = replacement_assignment.teacher_id
      )
    )
  left join public.profiles replacement_profile
    on replacement_profile.user_id = replacement_assignment.teacher_id
  order by "subjectId", "programId";
$$;

create or replace function public.academic_get_student_portal_grades(
  p_institution_id uuid,
  p_workspace_key text default 'main'
)
returns setof public.student_grades
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with context as (
    select
      (select auth.uid()) as actor_id,
      coalesce(nullif(btrim(p_workspace_key), ''), 'main') as workspace_key
  ),
  student_identity as (
    select
      context.actor_id as student_id,
      student_record.id as student_record_id
    from context
    left join public.student_records student_record
      on student_record.institution_id = p_institution_id
     and student_record.workspace_key = context.workspace_key
     and student_record.profile_id = context.actor_id
  ),
  own_enrollments as (
    select enrollment.id
    from public.subject_enrollments enrollment
    cross join context
    where enrollment.institution_id = p_institution_id
      and enrollment.workspace_key = context.workspace_key
      and enrollment.deleted_at is null
      and (
        enrollment.student_id = context.actor_id
        or exists (
          select 1
          from student_identity identity
          where identity.student_record_id is not null
            and identity.student_record_id = enrollment.student_record_id
        )
      )
  )
  select distinct grade.*
  from public.student_grades grade
  cross join context
  where grade.institution_id = p_institution_id
    and context.actor_id is not null
    and public.is_member_of_institution(p_institution_id)
    and grade.workspace_key = context.workspace_key
    and grade.deleted_at is null
    and (
      grade.student_id = context.actor_id
      or grade.subject_enrollment_id in (select id from own_enrollments)
      or exists (
        select 1
        from student_identity identity
        where identity.student_record_id is not null
          and identity.student_record_id = grade.student_record_id
      )
    )
  order by grade.updated_at desc nulls last, grade.created_at desc nulls last;
$$;

create or replace function public.teacher_reset_student_subject_academic_records(
  p_institution_id uuid,
  p_workspace_key text,
  p_actor_id uuid,
  p_student_id uuid,
  p_subject_id text,
  p_program_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  clean_subject_id text := btrim(coalesce(p_subject_id, ''));
  clean_program_id text := coalesce(p_program_id, '');
  normalized_subject_id text := regexp_replace(lower(clean_subject_id), '[^a-z0-9]+', '', 'g');
  normalized_program_id text := regexp_replace(lower(clean_program_id), '[^a-z0-9]+', '', 'g');
  deleted_attendance_count integer := 0;
  deleted_grade_count integer := 0;
begin
  if p_institution_id is null or p_actor_id is null or p_student_id is null or clean_subject_id = '' then
    raise exception 'Faltan datos para reiniciar los registros academicos del alumno.';
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.institution_id = p_institution_id
      and membership.user_id = p_actor_id
      and membership.role in ('owner', 'admin', 'editor')
  ) and not exists (
    select 1
    from public.subject_teacher_assignments assignment
    where assignment.institution_id = p_institution_id
      and assignment.workspace_key = clean_workspace_key
      and assignment.teacher_id = p_actor_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and assignment.role in ('titular', 'suplente', 'licencia')
      and regexp_replace(lower(coalesce(assignment.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
      and (
        clean_program_id = ''
        or assignment.program_id = clean_program_id
        or regexp_replace(lower(coalesce(assignment.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
      )
  ) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  delete from public.subject_attendance_records attendance
  using public.subject_class_sessions session
  where attendance.session_id = session.id
    and attendance.institution_id = p_institution_id
    and attendance.workspace_key = clean_workspace_key
    and attendance.student_id = p_student_id
    and session.institution_id = p_institution_id
    and session.workspace_key = clean_workspace_key
    and regexp_replace(lower(coalesce(session.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or session.program_id = clean_program_id
      or regexp_replace(lower(coalesce(session.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics deleted_attendance_count = row_count;

  update public.student_grades grade
  set
    deleted_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    lock_version = coalesce(grade.lock_version, 0) + 1
  where grade.institution_id = p_institution_id
    and grade.workspace_key = clean_workspace_key
    and grade.student_id = p_student_id
    and grade.deleted_at is null
    and regexp_replace(lower(coalesce(grade.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or grade.program_id = clean_program_id
      or regexp_replace(lower(coalesce(grade.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics deleted_grade_count = row_count;

  return jsonb_build_object(
    'success', true,
    'action', 'teacher_reset_student_subject_academic_records',
    'student_id', p_student_id,
    'subject_id', clean_subject_id,
    'program_id', clean_program_id,
    'reset_counts', jsonb_build_object(
      'attendance_records', deleted_attendance_count,
      'student_grades', deleted_grade_count
    )
  );
end;
$$;

create or replace function public.teacher_remove_student_subject_records(
  p_institution_id uuid,
  p_workspace_key text,
  p_actor_id uuid,
  p_student_id uuid,
  p_subject_id text,
  p_program_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  clean_subject_id text := btrim(coalesce(p_subject_id, ''));
  clean_program_id text := coalesce(p_program_id, '');
  normalized_subject_id text := regexp_replace(lower(clean_subject_id), '[^a-z0-9]+', '', 'g');
  normalized_program_id text := regexp_replace(lower(clean_program_id), '[^a-z0-9]+', '', 'g');
  deleted_attendance_count integer := 0;
  deleted_grade_count integer := 0;
  removed_enrollment_count integer := 0;
begin
  if p_institution_id is null or p_actor_id is null or p_student_id is null or clean_subject_id = '' then
    raise exception 'Faltan datos para eliminar al alumno de la materia.';
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.institution_id = p_institution_id
      and membership.user_id = p_actor_id
      and membership.role in ('owner', 'admin', 'editor')
  ) and not exists (
    select 1
    from public.subject_teacher_assignments assignment
    where assignment.institution_id = p_institution_id
      and assignment.workspace_key = clean_workspace_key
      and assignment.teacher_id = p_actor_id
      and assignment.status = 'active'
      and assignment.deleted_at is null
      and assignment.role in ('titular', 'suplente', 'licencia')
      and regexp_replace(lower(coalesce(assignment.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
      and (
        clean_program_id = ''
        or assignment.program_id = clean_program_id
        or regexp_replace(lower(coalesce(assignment.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
      )
  ) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  delete from public.subject_attendance_records attendance
  using public.subject_class_sessions session
  where attendance.session_id = session.id
    and attendance.institution_id = p_institution_id
    and attendance.workspace_key = clean_workspace_key
    and attendance.student_id = p_student_id
    and session.institution_id = p_institution_id
    and session.workspace_key = clean_workspace_key
    and regexp_replace(lower(coalesce(session.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or session.program_id = clean_program_id
      or regexp_replace(lower(coalesce(session.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics deleted_attendance_count = row_count;

  update public.student_grades grade
  set
    deleted_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    lock_version = coalesce(grade.lock_version, 0) + 1
  where grade.institution_id = p_institution_id
    and grade.workspace_key = clean_workspace_key
    and grade.student_id = p_student_id
    and grade.deleted_at is null
    and regexp_replace(lower(coalesce(grade.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or grade.program_id = clean_program_id
      or regexp_replace(lower(coalesce(grade.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics deleted_grade_count = row_count;

  update public.subject_enrollments enrollment
  set
    status = 'dropped',
    dropped_at = timezone('utc', now()),
    deleted_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    lock_version = coalesce(enrollment.lock_version, 0) + 1
  where enrollment.institution_id = p_institution_id
    and enrollment.workspace_key = clean_workspace_key
    and enrollment.student_id = p_student_id
    and enrollment.deleted_at is null
    and regexp_replace(lower(coalesce(enrollment.subject_id, '')), '[^a-z0-9]+', '', 'g') = normalized_subject_id
    and (
      clean_program_id = ''
      or enrollment.program_id = clean_program_id
      or regexp_replace(lower(coalesce(enrollment.program_id, '')), '[^a-z0-9]+', '', 'g') = normalized_program_id
    );
  get diagnostics removed_enrollment_count = row_count;

  return jsonb_build_object(
    'success', true,
    'action', 'teacher_remove_student_subject_records',
    'student_id', p_student_id,
    'subject_id', clean_subject_id,
    'program_id', clean_program_id,
    'removed_counts', jsonb_build_object(
      'subject_enrollments', removed_enrollment_count,
      'student_grades', deleted_grade_count,
      'attendance_records', deleted_attendance_count
    )
  );
end;
$$;

-- Resolucion compartida por las cargas masivas (I2a historia, I2b cursadas). Internas: sin EXECUTE para
-- roles de la API; las llaman RPC security definer que ya validaron que quien llama es personal de gestion.
-- Carrera por nombre o codigo externo dentro de la institucion; materia por codigo dentro de un plan de esa
-- carrera. Devuelve el nombre canonico de la carrera y el codigo canonico de la materia.
create or replace function public.academic_resolve_catalog_subject(
  p_institution_id uuid,
  p_career text,
  p_subject text
)
returns table (outcome text, career_name text, subject_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_matches integer;
  v_career_id uuid;
  v_career_name text;
  v_subject_code text;
begin
  select count(*), min(career.id::text)::uuid, min(career.name)
  into v_matches, v_career_id, v_career_name
  from public.careers career
  where career.institution_id = p_institution_id
    and (lower(btrim(career.name)) = lower(btrim(coalesce(p_career, '')))
      or lower(btrim(coalesce(career.external_code, ''))) = lower(btrim(coalesce(p_career, ''))));
  if v_matches <> 1 then
    return query select case when v_matches = 0 then 'CARRERA_NO_ENCONTRADA' else 'CARRERA_AMBIGUA' end, null::text, null::text;
    return;
  end if;

  select min(subject.code)
  into v_subject_code
  from public.subjects subject
  join public.study_plan_subjects plan_subject
    on plan_subject.institution_id = subject.institution_id and plan_subject.subject_id = subject.id
  join public.study_plans plan
    on plan.institution_id = plan_subject.institution_id and plan.id = plan_subject.plan_id
  where subject.institution_id = p_institution_id
    and plan.career_id = v_career_id
    and lower(btrim(subject.code)) = lower(btrim(coalesce(p_subject, '')));
  if v_subject_code is null then
    return query select 'MATERIA_NO_ESTA_EN_EL_PLAN'::text, v_career_name, null::text;
    return;
  end if;

  return query select 'ok'::text, v_career_name, v_subject_code;
end;
$$;

revoke all on function public.academic_resolve_catalog_subject(uuid, text, text) from public, anon, authenticated;

-- Legajo por DNI (solo digitos) dentro del workspace: el de esa carrera; si no hay, uno sin carrera cargada.
-- Un legajo de otra carrera no se reutiliza (AUD.I2a P2). Exige cuenta (profile_id).
create or replace function public.academic_resolve_student_record_by_dni(
  p_institution_id uuid,
  p_workspace_key text,
  p_dni text,
  p_career_name text
)
returns table (outcome text, record_id uuid, profile_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dni text := regexp_replace(coalesce(p_dni, ''), '[^0-9]', '', 'g');
  v_matches integer;
  v_record_id uuid;
  v_profile_id uuid;
begin
  select count(*), min(sr.id::text)::uuid, min(sr.profile_id::text)::uuid
  into v_matches, v_record_id, v_profile_id
  from public.student_records sr
  where sr.institution_id = p_institution_id
    and sr.workspace_key = p_workspace_key
    and regexp_replace(coalesce(nullif(sr.dni, ''), sr.national_id, ''), '[^0-9]', '', 'g') = v_dni
    and lower(btrim(coalesce(sr.career, ''))) = lower(btrim(coalesce(p_career_name, '')));
  if v_matches = 0 then
    select count(*), min(sr.id::text)::uuid, min(sr.profile_id::text)::uuid
    into v_matches, v_record_id, v_profile_id
    from public.student_records sr
    where sr.institution_id = p_institution_id
      and sr.workspace_key = p_workspace_key
      and regexp_replace(coalesce(nullif(sr.dni, ''), sr.national_id, ''), '[^0-9]', '', 'g') = v_dni
      and btrim(coalesce(sr.career, '')) = '';
    if v_matches = 0 and exists (
      select 1
      from public.student_records sr
      where sr.institution_id = p_institution_id
        and sr.workspace_key = p_workspace_key
        and regexp_replace(coalesce(nullif(sr.dni, ''), sr.national_id, ''), '[^0-9]', '', 'g') = v_dni
    ) then
      return query select 'ALUMNO_DE_OTRA_CARRERA'::text, null::uuid, null::uuid;
      return;
    end if;
  end if;
  if v_matches <> 1 then
    return query select case when v_matches = 0 then 'ALUMNO_NO_ENCONTRADO' else 'ALUMNO_AMBIGUO' end, null::uuid, null::uuid;
    return;
  end if;
  if v_profile_id is null then
    return query select 'ALUMNO_SIN_CUENTA'::text, v_record_id, null::uuid;
    return;
  end if;
  return query select 'ok'::text, v_record_id, v_profile_id;
end;
$$;

revoke all on function public.academic_resolve_student_record_by_dni(uuid, text, text, text) from public, anon, authenticated;

-- I2a: historia academica previa (aprobadas, regulares, libres, promocionadas, desaprobadas) cargada por el
-- personal de gestion desde una planilla. La inscripcion a mesas, las correlativas y el portal leen
-- student_grades: cada fila va en canonico (subject_id = subjects.code, program_id = careers.name), con el
-- student_record_id del legajo, grade_type 'historia' e intento 1, una fila por materia.
-- Nunca pisa la operacion real: si la materia ya tiene una nota viva no pending de otro tipo, la fila se omite.
-- Errores por fila no cortan el lote: se devuelven en el reporte.
create or replace function public.academic_admin_import_student_history(
  p_institution_id uuid,
  p_workspace_key text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  item jsonb;
  item_index integer := 0;
  row_label text;
  raw_dni text;
  raw_career text;
  raw_subject text;
  raw_status text;
  raw_grade text;
  raw_date text;
  v_notes text;
  clean_status text;
  clean_grade numeric;
  clean_date date;
  v_outcome text;
  v_career_name text;
  v_subject_code text;
  v_record_id uuid;
  v_record_profile_id uuid;
  inserted boolean;
  imported_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  rejected_count integer := 0;
  issues jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;
  if p_institution_id is null or not (
    public.is_super_admin()
    or public.is_member_of_institution(p_institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'Acceso denegado: solo el personal de gestion importa historia academica.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'STUDENT_HISTORY_ROWS_INVALID' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'STUDENT_HISTORY_TOO_MANY_ROWS' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    item_index := item_index + 1;
    row_label := coalesce(nullif(btrim(item->>'fila'), ''), item_index::text);
    raw_dni := regexp_replace(coalesce(item->>'dni', ''), '[^0-9]', '', 'g');
    raw_career := btrim(coalesce(item->>'carrera', ''));
    raw_subject := btrim(coalesce(item->>'materia', ''));
    raw_status := lower(btrim(coalesce(item->>'condicion', '')));
    raw_grade := replace(btrim(coalesce(item->>'nota', '')), ',', '.');
    raw_date := btrim(coalesce(item->>'fecha', ''));
    v_notes := btrim(concat_ws(' ',
      case when btrim(coalesce(item->>'libro', '')) <> '' then 'Libro ' || btrim(item->>'libro') end,
      case when btrim(coalesce(item->>'folio', '')) <> '' then 'Folio ' || btrim(item->>'folio') end
    ));

    -- Validaciones de formato. Cada rechazo deja fila, motivo y los datos que la identifican.
    clean_status := case
      when raw_status in ('regular', 'libre', 'promocionado', 'approved', 'failed') then raw_status
      when raw_status in ('aprobado', 'aprobada') then 'approved'
      when raw_status in ('desaprobado', 'desaprobada', 'reprobado', 'reprobada') then 'failed'
      when raw_status in ('promocionada', 'promocion', 'promoción') then 'promocionado'
      else null
    end;
    clean_grade := null;
    clean_date := null;

    if raw_dni = '' or raw_career = '' or raw_subject = '' then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', 'FALTAN_DATOS', 'dni', raw_dni, 'materia', raw_subject));
      rejected_count := rejected_count + 1;
      continue;
    end if;
    if clean_status is null then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', 'CONDICION_INVALIDA', 'dni', raw_dni, 'materia', raw_subject));
      rejected_count := rejected_count + 1;
      continue;
    end if;
    if raw_grade <> '' then
      if raw_grade !~ '^[0-9]{1,2}(\.[0-9]{1,2})?$' or raw_grade::numeric > 10 then
        issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', 'NOTA_INVALIDA', 'dni', raw_dni, 'materia', raw_subject));
        rejected_count := rejected_count + 1;
        continue;
      end if;
      clean_grade := raw_grade::numeric;
    end if;
    if raw_date <> '' then
      begin
        clean_date := case
          when raw_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then to_date(raw_date, 'YYYY-MM-DD')
          when raw_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then to_date(raw_date, 'DD/MM/YYYY')
          else null
        end;
      exception when others then
        clean_date := null;
      end;
      if clean_date is null or clean_date > current_date then
        issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', 'FECHA_INVALIDA', 'dni', raw_dni, 'materia', raw_subject));
        rejected_count := rejected_count + 1;
        continue;
      end if;
    end if;

    -- Carrera y materia del plan dentro de la institucion; legajo por DNI de esa carrera (helpers compartidos con I2b).
    select resolved.outcome, resolved.career_name, resolved.subject_code
    into v_outcome, v_career_name, v_subject_code
    from public.academic_resolve_catalog_subject(p_institution_id, raw_career, raw_subject) resolved;
    if v_outcome <> 'ok' then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', v_outcome, 'dni', raw_dni, 'materia', raw_subject));
      rejected_count := rejected_count + 1;
      continue;
    end if;

    select resolved.outcome, resolved.record_id, resolved.profile_id
    into v_outcome, v_record_id, v_record_profile_id
    from public.academic_resolve_student_record_by_dni(p_institution_id, clean_workspace_key, raw_dni, v_career_name) resolved;
    if v_outcome <> 'ok' then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', v_outcome, 'dni', raw_dni, 'materia', raw_subject));
      rejected_count := rejected_count + 1;
      continue;
    end if;

    -- La historia nunca le gana a una nota cargada por un docente en el sistema. El chequeo y la escritura
    -- van bajo el mismo lock que usa el docente: una carga concurrente espera o hace omitir la fila.
    perform public.academic_lock_student_subject(p_institution_id, clean_workspace_key, v_record_profile_id, v_subject_code, v_career_name);
    if exists (
      select 1
      from public.student_grades grade
      where grade.institution_id = p_institution_id
        and grade.workspace_key = clean_workspace_key
        and grade.student_id = v_record_profile_id
        and grade.subject_id = v_subject_code
        and grade.program_id = v_career_name
        and grade.deleted_at is null
        and grade.grade_type <> 'historia'
        and grade.academic_status <> 'pending'
    ) then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'omitida', 'motivo', 'YA_TIENE_NOTAS_DEL_SISTEMA', 'dni', raw_dni, 'materia', v_subject_code));
      skipped_count := skipped_count + 1;
      continue;
    end if;

    insert into public.student_grades (
      institution_id, workspace_key, student_id, student_record_id, subject_id, program_id,
      grade_type, attempt_number, grade_value, grade_label, grade_scale, academic_status,
      observations, grading_period
    )
    values (
      p_institution_id, clean_workspace_key, v_record_profile_id, v_record_id, v_subject_code, v_career_name,
      'historia', 1, clean_grade, coalesce(clean_grade::text, ''), 'numeric_0_10', clean_status,
      v_notes, coalesce(to_char(clean_date, 'YYYY-MM-DD'), '')
    )
    on conflict (institution_id, workspace_key, student_id, subject_id, program_id, grade_type, attempt_number)
      where deleted_at is null
    do update set
      student_record_id = excluded.student_record_id,
      grade_value = excluded.grade_value,
      grade_label = excluded.grade_label,
      academic_status = excluded.academic_status,
      observations = excluded.observations,
      grading_period = excluded.grading_period,
      lock_version = public.student_grades.lock_version + 1
    returning (xmax = 0) into inserted;

    if inserted then
      imported_count := imported_count + 1;
    else
      updated_count := updated_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'procesadas', item_index,
    'importadas', imported_count,
    'actualizadas', updated_count,
    'omitidas', skipped_count,
    'rechazadas', rejected_count,
    'problemas', issues
  );
end;
$$;

-- I2b: titularidades desde la hoja docente_materia. Docente por DNI (teacher_records, unico por workspace)
-- con cuenta; carrera y materia del plan. Rol: titular (por defecto), suplente o licencia. Crea la asignacion
-- activa o actualiza su rol; nunca borra asignaciones que no vinieron en la planilla.
create or replace function public.academic_admin_bulk_assign_teachers(
  p_institution_id uuid,
  p_workspace_key text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  item jsonb;
  item_index integer := 0;
  row_label text;
  raw_dni text;
  raw_role text;
  clean_role text;
  v_outcome text;
  v_career_name text;
  v_subject_code text;
  v_teacher_record_id uuid;
  v_teacher_profile_id uuid;
  v_teacher_matches integer;
  v_existing_role text;
  created_count integer := 0;
  updated_count integer := 0;
  unchanged_count integer := 0;
  rejected_count integer := 0;
  issues jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;
  if p_institution_id is null or not (
    public.is_super_admin()
    or public.is_member_of_institution(p_institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'Acceso denegado: solo el personal de gestion asigna docentes.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'ROSTER_ROWS_INVALID' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    item_index := item_index + 1;
    row_label := coalesce(nullif(btrim(item ->> 'fila'), ''), item_index::text);
    raw_dni := regexp_replace(coalesce(item ->> 'dni', ''), '[^0-9]', '', 'g');
    raw_role := lower(btrim(coalesce(item ->> 'rol', '')));
    clean_role := case
      when raw_role in ('', 'titular') then 'titular'
      when raw_role in ('suplente', 'reemplazo') then 'suplente'
      when raw_role = 'licencia' then 'licencia'
      else null
    end;
    if raw_dni = '' or btrim(coalesce(item ->> 'carrera', '')) = '' or btrim(coalesce(item ->> 'materia', '')) = '' then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', 'FALTAN_DATOS', 'dni', raw_dni, 'materia', item ->> 'materia'));
      rejected_count := rejected_count + 1;
      continue;
    end if;
    if clean_role is null then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', 'ROL_INVALIDO', 'dni', raw_dni, 'materia', item ->> 'materia'));
      rejected_count := rejected_count + 1;
      continue;
    end if;

    select resolved.outcome, resolved.career_name, resolved.subject_code
    into v_outcome, v_career_name, v_subject_code
    from public.academic_resolve_catalog_subject(p_institution_id, item ->> 'carrera', item ->> 'materia') resolved;
    if v_outcome <> 'ok' then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', v_outcome, 'dni', raw_dni, 'materia', item ->> 'materia'));
      rejected_count := rejected_count + 1;
      continue;
    end if;

    select count(*), min(teacher.id::text)::uuid, min(teacher.profile_id::text)::uuid
    into v_teacher_matches, v_teacher_record_id, v_teacher_profile_id
    from public.teacher_records teacher
    where teacher.institution_id = p_institution_id
      and teacher.workspace_key = clean_workspace_key
      and regexp_replace(coalesce(teacher.dni, ''), '[^0-9]', '', 'g') = raw_dni;
    if v_teacher_matches <> 1 or v_teacher_profile_id is null then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada',
        'motivo', case when v_teacher_matches = 0 then 'DOCENTE_NO_ENCONTRADO' when v_teacher_matches > 1 then 'DOCENTE_AMBIGUO' else 'DOCENTE_SIN_CUENTA' end,
        'dni', raw_dni, 'materia', v_subject_code));
      rejected_count := rejected_count + 1;
      continue;
    end if;

    select assignment.role
    into v_existing_role
    from public.subject_teacher_assignments assignment
    where assignment.institution_id = p_institution_id
      and assignment.workspace_key = clean_workspace_key
      and assignment.subject_id = v_subject_code
      and assignment.program_id = v_career_name
      and assignment.teacher_id = v_teacher_profile_id
      and assignment.deleted_at is null
      and assignment.status = 'active'
    for update;

    if not found then
      insert into public.subject_teacher_assignments (
        institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, source, status, role, metadata
      ) values (
        p_institution_id, clean_workspace_key, v_subject_code, v_career_name, v_teacher_profile_id, v_teacher_record_id,
        'planilla', 'active', clean_role, jsonb_build_object('imported_by', (select auth.uid()))
      );
      created_count := created_count + 1;
    elsif v_existing_role is distinct from clean_role then
      update public.subject_teacher_assignments assignment
      set role = clean_role, teacher_record_id = coalesce(assignment.teacher_record_id, v_teacher_record_id)
      where assignment.institution_id = p_institution_id
        and assignment.workspace_key = clean_workspace_key
        and assignment.subject_id = v_subject_code
        and assignment.program_id = v_career_name
        and assignment.teacher_id = v_teacher_profile_id
        and assignment.deleted_at is null
        and assignment.status = 'active';
      updated_count := updated_count + 1;
    else
      unchanged_count := unchanged_count + 1;
    end if;
  end loop;

  return jsonb_build_object('procesadas', item_index, 'creadas', created_count, 'actualizadas', updated_count,
    'sin_cambios', unchanged_count, 'omitidas', 0, 'rechazadas', rejected_count, 'problemas', issues);
end;
$$;

-- I2b: cursadas (subject_enrollments) desde alumnos_inscripciones. Alumno por DNI y carrera (mismo helper que
-- la historia), con cuenta; materia del plan. Crea la cursada activa; si ya estaba activa no cambia nada.
-- Una cursada dada de baja o borrada no se reactiva desde la planilla: se informa para que lo decida gestion.
create or replace function public.academic_admin_bulk_enroll_students(
  p_institution_id uuid,
  p_workspace_key text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(p_workspace_key), ''), 'main');
  item jsonb;
  item_index integer := 0;
  row_label text;
  raw_dni text;
  v_outcome text;
  v_career_name text;
  v_subject_code text;
  v_record_id uuid;
  v_profile_id uuid;
  existing_row record;
  created_count integer := 0;
  unchanged_count integer := 0;
  skipped_count integer := 0;
  rejected_count integer := 0;
  issues jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;
  if p_institution_id is null or not (
    public.is_super_admin()
    or public.is_member_of_institution(p_institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'Acceso denegado: solo el personal de gestion inscribe cursadas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'ROSTER_ROWS_INVALID' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    item_index := item_index + 1;
    row_label := coalesce(nullif(btrim(item ->> 'fila'), ''), item_index::text);
    raw_dni := regexp_replace(coalesce(item ->> 'dni', ''), '[^0-9]', '', 'g');
    if raw_dni = '' or btrim(coalesce(item ->> 'carrera', '')) = '' or btrim(coalesce(item ->> 'materia', '')) = '' then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', 'FALTAN_DATOS', 'dni', raw_dni, 'materia', item ->> 'materia'));
      rejected_count := rejected_count + 1;
      continue;
    end if;

    select resolved.outcome, resolved.career_name, resolved.subject_code
    into v_outcome, v_career_name, v_subject_code
    from public.academic_resolve_catalog_subject(p_institution_id, item ->> 'carrera', item ->> 'materia') resolved;
    if v_outcome = 'ok' then
      select resolved.outcome, resolved.record_id, resolved.profile_id
      into v_outcome, v_record_id, v_profile_id
      from public.academic_resolve_student_record_by_dni(p_institution_id, clean_workspace_key, raw_dni, v_career_name) resolved;
    end if;
    if v_outcome <> 'ok' then
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'rechazada', 'motivo', v_outcome, 'dni', raw_dni, 'materia', coalesce(v_subject_code, item ->> 'materia')));
      rejected_count := rejected_count + 1;
      continue;
    end if;

    select enrollment.id, enrollment.status, enrollment.deleted_at
    into existing_row
    from public.subject_enrollments enrollment
    where enrollment.institution_id = p_institution_id
      and enrollment.workspace_key = clean_workspace_key
      and enrollment.subject_id = v_subject_code
      and enrollment.program_id = v_career_name
      and enrollment.student_id = v_profile_id
    for update;

    if existing_row.id is null then
      insert into public.subject_enrollments (
        institution_id, workspace_key, subject_id, program_id, student_id, student_record_id, status, metadata
      ) values (
        p_institution_id, clean_workspace_key, v_subject_code, v_career_name, v_profile_id, v_record_id, 'active',
        jsonb_build_object('source', 'planilla', 'imported_by', (select auth.uid()))
      );
      created_count := created_count + 1;
    elsif existing_row.deleted_at is null and existing_row.status in ('active', 'enrolled') then
      unchanged_count := unchanged_count + 1;
    else
      issues := issues || jsonb_build_array(jsonb_build_object('fila', row_label, 'estado', 'omitida', 'motivo', 'CURSADA_DADA_DE_BAJA', 'dni', raw_dni, 'materia', v_subject_code));
      skipped_count := skipped_count + 1;
    end if;
  end loop;

  return jsonb_build_object('procesadas', item_index, 'creadas', created_count, 'actualizadas', 0,
    'sin_cambios', unchanged_count, 'omitidas', skipped_count, 'rechazadas', rejected_count, 'problemas', issues);
end;
$$;

revoke execute on function public.academic_can_manage_subject(uuid, text, text, text) from public, anon;
revoke execute on function public.academic_resolve_subject_enrollment(uuid, text, uuid, text, text) from public, anon;
revoke execute on function public.upsert_subject_enrollment_from_portal(uuid, text, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
revoke execute on function public.academic_teacher_create_class_session(uuid, text, text, text, date, text) from public, anon;
revoke execute on function public.academic_teacher_upsert_student_grade(uuid, text, uuid, uuid, uuid, text, text, text, integer, numeric, text, integer) from public, anon;
revoke execute on function public.academic_teacher_upsert_attendance_records(uuid, jsonb) from public, anon;
revoke execute on function public.academic_get_teacher_subject_rosters(uuid, text) from public, anon;
revoke execute on function public.academic_get_student_subject_teacher_notices(uuid, text) from public, anon;
revoke execute on function public.academic_get_student_portal_grades(uuid, text) from public, anon;
revoke execute on function public.academic_admin_import_student_history(uuid, text, jsonb) from public, anon;
revoke execute on function public.academic_admin_bulk_assign_teachers(uuid, text, jsonb) from public, anon;
revoke execute on function public.academic_admin_bulk_enroll_students(uuid, text, jsonb) from public, anon;
revoke execute on function public.teacher_reset_student_subject_academic_records(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.teacher_remove_student_subject_records(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.academic_can_manage_subject(uuid, text, text, text) to authenticated;
grant execute on function public.academic_resolve_subject_enrollment(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.upsert_subject_enrollment_from_portal(uuid, text, uuid, uuid, text, text, uuid, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.academic_teacher_create_class_session(uuid, text, text, text, date, text) to authenticated;
grant execute on function public.academic_teacher_upsert_student_grade(uuid, text, uuid, uuid, uuid, text, text, text, integer, numeric, text, integer) to authenticated;
grant execute on function public.academic_teacher_upsert_attendance_records(uuid, jsonb) to authenticated;
grant execute on function public.academic_get_teacher_subject_rosters(uuid, text) to authenticated;
grant execute on function public.academic_get_student_subject_teacher_notices(uuid, text) to authenticated;
grant execute on function public.academic_get_student_portal_grades(uuid, text) to authenticated;
grant execute on function public.academic_admin_import_student_history(uuid, text, jsonb) to authenticated;
grant execute on function public.academic_admin_bulk_assign_teachers(uuid, text, jsonb) to authenticated;
grant execute on function public.academic_admin_bulk_enroll_students(uuid, text, jsonb) to authenticated;
grant execute on function public.teacher_reset_student_subject_academic_records(uuid, text, uuid, uuid, text, text) to service_role;
grant execute on function public.teacher_remove_student_subject_records(uuid, text, uuid, uuid, text, text) to service_role;

do $$
declare
  target_table text;
  own_rows text;
begin
  foreach target_table in array array[
    'subject_enrollments',
    'student_grades',
    'subject_class_sessions',
    'subject_attendance_records',
    'student_financial_status'
  ]
  loop
    -- SEC.3: el personal de la institucion lee todo; un alumno solo lo propio.
    own_rows := case target_table
      when 'student_financial_status' then 'public.current_user_owns_student_record(student_record_id)'
      when 'subject_class_sessions' then 'exists (select 1 from public.subject_enrollments enrollment where enrollment.institution_id = subject_class_sessions.institution_id and enrollment.workspace_key = subject_class_sessions.workspace_key and enrollment.subject_id = subject_class_sessions.subject_id and enrollment.program_id = subject_class_sessions.program_id and enrollment.student_id = (select auth.uid()) and enrollment.deleted_at is null and enrollment.status in (''active'', ''enrolled'')) or exists (select 1 from public.subject_attendance_records attendance where attendance.session_id = subject_class_sessions.id and attendance.student_id = (select auth.uid()))'
      else 'student_id = (select auth.uid())'
    end;
    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' members read', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors insert', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors update', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || ' editors delete', target_table);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_super_admin() or public.is_staff_of_institution(institution_id) or (public.is_member_of_institution(institution_id) and (%s)))',
      target_table || ' members read',
      target_table,
      own_rows
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
