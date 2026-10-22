-- ============================================================
-- HUB-INSTITUCIONAL - EXAM TABLES CANONICAL SCHEMA
-- Bloque 08: mesas de examen canonicas, materias de mesa,
-- tribunal docente, inscripciones, penalidades por ausencia y
-- eventos append-only.
--
-- Idempotente para bases limpias/canonicas. Si detecta tablas
-- legacy de repairs con columnas incompatibles, se detiene para
-- evitar consolidar exam_table_id textual sin migracion controlada.
--
-- LOCAL ONLY. Implementa public.upsert_exam_enrollment_from_portal
-- como RPC canonica local pendiente de validacion DB.
-- REMOTE MUTATIONS: NONE.
-- ============================================================

-- ============================================================
-- Guardas de compatibilidad legacy
-- ============================================================

do $$
begin
  if to_regclass('public.exam_tables') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'exam_tables'
        and column_name = 'id'
        and udt_name = 'uuid'
    )
  then
    raise exception 'public.exam_tables existe con shape no canonico; requiere migracion controlada antes de aplicar 08_exam_tables.sql';
  end if;

  if to_regclass('public.exam_teacher_assignments') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'exam_teacher_assignments'
        and column_name = 'exam_table_id'
        and udt_name <> 'uuid'
    )
  then
    raise exception 'public.exam_teacher_assignments existe con exam_table_id no uuid; requiere migracion controlada desde repair_06 antes de aplicar 08_exam_tables.sql';
  end if;

  if to_regclass('public.exam_enrollments') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'exam_enrollments'
        and column_name = 'exam_table_id'
        and udt_name <> 'uuid'
    )
  then
    raise exception 'public.exam_enrollments existe con exam_table_id no uuid; requiere migracion controlada desde repair_06 antes de aplicar 08_exam_tables.sql';
  end if;
end $$;

-- ============================================================
-- Constraints auxiliares para FKs compuestas tenant-safe
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.study_plans'::regclass
      and conname = 'study_plans_institution_career_id_key'
  ) then
    alter table public.study_plans
      add constraint study_plans_institution_career_id_key
      unique (institution_id, career_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.study_plan_subjects'::regclass
      and conname = 'study_plan_subjects_institution_plan_id_key'
  ) then
    alter table public.study_plan_subjects
      add constraint study_plan_subjects_institution_plan_id_key
      unique (institution_id, plan_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.student_career_plans'::regclass
      and conname = 'student_career_plans_identity_context_key'
  ) then
    alter table public.student_career_plans
      add constraint student_career_plans_identity_context_key
      unique (institution_id, student_id, career_id, plan_id, id);
  end if;
end $$;

-- ============================================================
-- Tablas canonicas
-- ============================================================

create table if not exists public.exam_tables (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  primary_career_id uuid,
  primary_study_plan_id uuid,
  exam_period_key text not null,
  exam_call_key text not null,
  exam_call_label text not null,
  exam_type text not null default 'regular',
  modality text,
  scheduled_starts_at timestamptz not null,
  scheduled_ends_at timestamptz,
  room text,
  capacity integer,
  enrollment_opens_at timestamptz not null,
  enrollment_closes_at timestamptz not null,
  closed_at timestamptz,
  status text not null default 'draft',
  legacy_exam_table_id text,
  legacy_snapshot_id text,
  source text not null default 'exam_engine_v21',
  metadata jsonb not null default '{}'::jsonb,
  lock_version integer not null default 1,
  created_by uuid references public.profiles(user_id) on delete set null,
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, id),
  foreign key (institution_id, primary_career_id) references public.careers(institution_id, id) on delete restrict,
  foreign key (institution_id, primary_study_plan_id) references public.study_plans(institution_id, id) on delete restrict
);

create table if not exists public.exam_table_subjects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  exam_table_id uuid not null,
  career_id uuid not null,
  study_plan_id uuid,
  study_plan_subject_id uuid not null,
  subject_id uuid not null,
  display_order integer not null default 1,
  is_primary boolean not null default false,
  legacy_subject_id text,
  legacy_program_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, id),
  unique (institution_id, exam_table_id, id),
  unique (institution_id, exam_table_id, study_plan_subject_id),
  foreign key (institution_id, exam_table_id) references public.exam_tables(institution_id, id) on delete cascade,
  foreign key (institution_id, career_id) references public.careers(institution_id, id) on delete restrict,
  foreign key (institution_id, study_plan_id) references public.study_plans(institution_id, id) on delete restrict,
  foreign key (institution_id, career_id, study_plan_id) references public.study_plans(institution_id, career_id, id) on delete restrict,
  foreign key (institution_id, study_plan_subject_id) references public.study_plan_subjects(institution_id, id) on delete restrict,
  foreign key (institution_id, study_plan_id, study_plan_subject_id) references public.study_plan_subjects(institution_id, plan_id, id) on delete restrict,
  foreign key (institution_id, subject_id) references public.subjects(institution_id, id) on delete restrict
);

create table if not exists public.exam_teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  exam_table_id uuid not null,
  exam_table_subject_id uuid,
  teacher_record_id uuid not null,
  teacher_id uuid references public.profiles(user_id) on delete set null,
  role text not null,
  status text not null default 'active',
  confirmation_status text not null default 'pending',
  objection_reason text,
  objection_deadline timestamptz,
  confirmed_at timestamptz,
  objected_at timestamptz,
  reset_at timestamptz,
  created_by uuid references public.profiles(user_id) on delete set null,
  updated_by uuid references public.profiles(user_id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  lock_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, id),
  foreign key (institution_id, exam_table_id) references public.exam_tables(institution_id, id) on delete cascade,
  foreign key (institution_id, exam_table_id, exam_table_subject_id) references public.exam_table_subjects(institution_id, exam_table_id, id) on delete cascade,
  foreign key (institution_id, teacher_record_id) references public.teacher_records(institution_id, id) on delete restrict
);

create table if not exists public.exam_enrollments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  exam_table_id uuid not null,
  exam_table_subject_id uuid not null,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  student_record_id uuid not null,
  student_career_plan_id uuid not null,
  subject_id text not null,
  program_id text not null,
  status text not null default 'registered',
  enrolled_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles(user_id) on delete set null,
  cancelled_by uuid references public.profiles(user_id) on delete set null,
  client_mutation_id text,
  client_request_hash text,
  legacy_snapshot_id text,
  legacy_enrollment_id text,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  lock_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, id),
  foreign key (institution_id, exam_table_id) references public.exam_tables(institution_id, id) on delete restrict,
  foreign key (institution_id, exam_table_id, exam_table_subject_id) references public.exam_table_subjects(institution_id, exam_table_id, id) on delete restrict,
  foreign key (institution_id, student_record_id) references public.student_records(institution_id, id) on delete restrict,
  foreign key (institution_id, student_career_plan_id) references public.student_career_plans(institution_id, id) on delete restrict
);

create table if not exists public.exam_enrollment_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  exam_enrollment_id uuid not null,
  event_type text not null,
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  reason_code text,
  client_mutation_id text,
  request_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (institution_id, exam_enrollment_id) references public.exam_enrollments(institution_id, id) on delete cascade
);

create table if not exists public.exam_table_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  exam_table_id uuid not null,
  event_type text not null,
  actor_user_id uuid references public.profiles(user_id) on delete set null,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (institution_id, exam_table_id) references public.exam_tables(institution_id, id) on delete cascade
);

create table if not exists public.exam_absence_penalties (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  student_record_id uuid not null,
  student_id uuid references public.profiles(user_id) on delete set null,
  student_career_plan_id uuid,
  subject_id text not null,
  program_id text not null default '',
  source_exam_table_id uuid,
  source_exam_table_subject_id uuid,
  source_enrollment_id uuid,
  source_exam_result_id uuid,
  blocked_exam_table_id uuid,
  blocked_exam_table_subject_id uuid,
  blocked_exam_period_key text,
  blocked_exam_call_key text,
  absent_at timestamptz not null,
  penalty_from timestamptz not null,
  penalty_until timestamptz,
  status text not null default 'pending_review',
  scope_type text not null default 'next_exam_call_for_subject',
  reason_code text not null default 'exam_absence',
  source text not null,
  source_event_key text not null,
  absence_semantic_key text not null,
  created_by uuid references public.profiles(user_id) on delete set null,
  fulfilled_at timestamptz,
  fulfilled_by uuid references public.profiles(user_id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles(user_id) on delete set null,
  void_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, id),
  foreign key (institution_id, student_record_id) references public.student_records(institution_id, id) on delete restrict,
  foreign key (institution_id, student_career_plan_id) references public.student_career_plans(institution_id, id) on delete restrict,
  foreign key (institution_id, source_exam_table_id) references public.exam_tables(institution_id, id) on delete restrict,
  foreign key (institution_id, source_exam_table_id, source_exam_table_subject_id) references public.exam_table_subjects(institution_id, exam_table_id, id) on delete restrict,
  foreign key (institution_id, source_enrollment_id) references public.exam_enrollments(institution_id, id) on delete restrict,
  foreign key (institution_id, blocked_exam_table_id) references public.exam_tables(institution_id, id) on delete restrict,
  foreign key (institution_id, blocked_exam_table_id, blocked_exam_table_subject_id) references public.exam_table_subjects(institution_id, exam_table_id, id) on delete restrict
);

-- ============================================================
-- Constraints de dominio
-- ============================================================

alter table public.exam_tables drop constraint if exists exam_tables_workspace_key_check;
alter table public.exam_tables add constraint exam_tables_workspace_key_check check (btrim(workspace_key) <> '');
alter table public.exam_tables drop constraint if exists exam_tables_exam_period_key_check;
alter table public.exam_tables add constraint exam_tables_exam_period_key_check check (btrim(exam_period_key) <> '');
alter table public.exam_tables drop constraint if exists exam_tables_exam_call_key_check;
alter table public.exam_tables add constraint exam_tables_exam_call_key_check check (btrim(exam_call_key) <> '');
alter table public.exam_tables drop constraint if exists exam_tables_exam_call_label_check;
alter table public.exam_tables add constraint exam_tables_exam_call_label_check check (btrim(exam_call_label) <> '');
alter table public.exam_tables drop constraint if exists exam_tables_source_check;
alter table public.exam_tables add constraint exam_tables_source_check check (btrim(source) <> '');
alter table public.exam_tables drop constraint if exists exam_tables_window_check;
alter table public.exam_tables add constraint exam_tables_window_check check (enrollment_opens_at < enrollment_closes_at);
alter table public.exam_tables drop constraint if exists exam_tables_schedule_check;
alter table public.exam_tables add constraint exam_tables_schedule_check check (scheduled_ends_at is null or scheduled_ends_at > scheduled_starts_at);
alter table public.exam_tables drop constraint if exists exam_tables_capacity_check;
alter table public.exam_tables add constraint exam_tables_capacity_check check (capacity is null or capacity > 0);
alter table public.exam_tables drop constraint if exists exam_tables_lock_version_check;
alter table public.exam_tables add constraint exam_tables_lock_version_check check (lock_version >= 1);
alter table public.exam_tables drop constraint if exists exam_tables_status_check;
alter table public.exam_tables add constraint exam_tables_status_check check (status in ('draft', 'teacher_review', 'confirmed', 'open', 'closed', 'cancelled', 'completed'));
alter table public.exam_tables drop constraint if exists exam_tables_exam_type_check;
alter table public.exam_tables add constraint exam_tables_exam_type_check check (exam_type in ('regular', 'special'));

alter table public.exam_table_subjects drop constraint if exists exam_table_subjects_display_order_check;
alter table public.exam_table_subjects add constraint exam_table_subjects_display_order_check check (display_order >= 1);

alter table public.exam_teacher_assignments drop constraint if exists exam_teacher_assignments_workspace_key_check;
alter table public.exam_teacher_assignments add constraint exam_teacher_assignments_workspace_key_check check (btrim(workspace_key) <> '');
alter table public.exam_teacher_assignments drop constraint if exists exam_teacher_assignments_role_check;
alter table public.exam_teacher_assignments add constraint exam_teacher_assignments_role_check check (role in ('TITULAR', 'VOCAL_1', 'VOCAL_2', 'TRIBUNAL_CRUZADO'));
alter table public.exam_teacher_assignments drop constraint if exists exam_teacher_assignments_status_check;
alter table public.exam_teacher_assignments add constraint exam_teacher_assignments_status_check check (status in ('active', 'inactive'));
alter table public.exam_teacher_assignments drop constraint if exists exam_teacher_assignments_confirmation_status_check;
alter table public.exam_teacher_assignments add constraint exam_teacher_assignments_confirmation_status_check check (confirmation_status in ('pending', 'confirmed', 'objected', 'reset'));
alter table public.exam_teacher_assignments drop constraint if exists exam_teacher_assignments_lock_version_check;
alter table public.exam_teacher_assignments add constraint exam_teacher_assignments_lock_version_check check (lock_version >= 1);

alter table public.exam_enrollments drop constraint if exists exam_enrollments_workspace_key_check;
alter table public.exam_enrollments add constraint exam_enrollments_workspace_key_check check (btrim(workspace_key) <> '');
alter table public.exam_enrollments drop constraint if exists exam_enrollments_subject_id_check;
alter table public.exam_enrollments add constraint exam_enrollments_subject_id_check check (btrim(subject_id) <> '');
alter table public.exam_enrollments drop constraint if exists exam_enrollments_program_id_check;
alter table public.exam_enrollments add constraint exam_enrollments_program_id_check check (btrim(program_id) <> '');
alter table public.exam_enrollments drop constraint if exists exam_enrollments_status_check;
alter table public.exam_enrollments add constraint exam_enrollments_status_check check (status in ('registered', 'cancelled'));
alter table public.exam_enrollments drop constraint if exists exam_enrollments_lock_version_check;
alter table public.exam_enrollments add constraint exam_enrollments_lock_version_check check (lock_version >= 1);
alter table public.exam_enrollments drop constraint if exists exam_enrollments_cancelled_at_check;
alter table public.exam_enrollments add constraint exam_enrollments_cancelled_at_check check (status <> 'cancelled' or cancelled_at is not null);

alter table public.exam_enrollment_events drop constraint if exists exam_enrollment_events_event_type_check;
alter table public.exam_enrollment_events add constraint exam_enrollment_events_event_type_check check (event_type in ('registered', 'cancelled', 'reactivated', 'rejected', 'corrected'));

alter table public.exam_table_events drop constraint if exists exam_table_events_event_type_check;
alter table public.exam_table_events add constraint exam_table_events_event_type_check check (event_type in ('created', 'published_for_review', 'teacher_assignment_changed', 'confirmed', 'opened', 'closed', 'cancelled', 'completed', 'corrected'));

alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_workspace_key_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_workspace_key_check check (btrim(workspace_key) <> '');
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_subject_id_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_subject_id_check check (btrim(subject_id) <> '');
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_reason_code_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_reason_code_check check (btrim(reason_code) <> '');
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_source_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_source_check check (btrim(source) <> '');
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_source_event_key_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_source_event_key_check check (btrim(source_event_key) <> '');
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_semantic_key_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_semantic_key_check check (btrim(absence_semantic_key) <> '');
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_status_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_status_check check (status in ('active', 'pending_review', 'fulfilled', 'voided', 'expired'));
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_scope_type_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_scope_type_check check (scope_type in ('next_exam_call_for_subject', 'specific_exam_table_subject'));
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_penalty_window_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_penalty_window_check check (penalty_until is null or penalty_until >= penalty_from);
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_source_subject_pair_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_source_subject_pair_check check (
  (source_exam_table_id is null and source_exam_table_subject_id is null)
  or (source_exam_table_id is not null and source_exam_table_subject_id is not null)
);
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_source_enrollment_context_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_source_enrollment_context_check check (
  source_enrollment_id is null
  or (source_exam_table_id is not null and source_exam_table_subject_id is not null)
);
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_blocked_subject_pair_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_blocked_subject_pair_check check (
  (blocked_exam_table_id is null and blocked_exam_table_subject_id is null)
  or (blocked_exam_table_id is not null and blocked_exam_table_subject_id is not null)
);
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_call_scope_destination_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_call_scope_destination_check check (
  scope_type <> 'next_exam_call_for_subject'
  or (
    blocked_exam_table_id is null
    and blocked_exam_table_subject_id is null
    and (
      status <> 'active'
      or (blocked_exam_period_key is not null and btrim(blocked_exam_period_key) <> ''
        and blocked_exam_call_key is not null and btrim(blocked_exam_call_key) <> '')
    )
  )
);
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_exact_scope_destination_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_exact_scope_destination_check check (
  scope_type <> 'specific_exam_table_subject'
  or (
    blocked_exam_period_key is null
    and blocked_exam_call_key is null
    and (
      status <> 'active'
      or (blocked_exam_table_id is not null and blocked_exam_table_subject_id is not null)
    )
  )
);
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_fulfilled_at_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_fulfilled_at_check check (status <> 'fulfilled' or fulfilled_at is not null);
alter table public.exam_absence_penalties drop constraint if exists exam_absence_penalties_voided_at_check;
alter table public.exam_absence_penalties add constraint exam_absence_penalties_voided_at_check check (status <> 'voided' or (voided_at is not null and void_reason is not null and btrim(void_reason) <> ''));

-- ============================================================
-- Validadores estructurales no expresables como FK simple
-- ============================================================

create or replace function public.validate_exam_table_subject_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.study_plan_subjects plan_subject
    join public.study_plans plan
      on plan.institution_id = plan_subject.institution_id
     and plan.id = plan_subject.plan_id
    where plan_subject.institution_id = new.institution_id
      and plan_subject.id = new.study_plan_subject_id
      and plan_subject.subject_id = new.subject_id
      and plan.career_id = new.career_id
      and (new.study_plan_id is null or plan_subject.plan_id = new.study_plan_id)
  ) then
    raise exception 'exam_table_subjects materia/carrera/plan incompatibles'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.validate_exam_enrollment_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.exam_table_subjects table_subject
    join public.study_plan_subjects plan_subject
      on plan_subject.institution_id = table_subject.institution_id
     and plan_subject.id = table_subject.study_plan_subject_id
    join public.subjects subject
      on subject.institution_id = table_subject.institution_id
     and subject.id = table_subject.subject_id
    join public.careers career
      on career.institution_id = table_subject.institution_id
     and career.id = table_subject.career_id
    join public.student_career_plans student_plan
      on student_plan.institution_id = table_subject.institution_id
     and student_plan.id = new.student_career_plan_id
     and student_plan.student_id = new.student_record_id
     and student_plan.career_id = table_subject.career_id
     and student_plan.plan_id = coalesce(table_subject.study_plan_id, plan_subject.plan_id)
    join public.student_records student_record
      on student_record.institution_id = new.institution_id
     and student_record.id = new.student_record_id
    where table_subject.institution_id = new.institution_id
      and table_subject.exam_table_id = new.exam_table_id
      and table_subject.id = new.exam_table_subject_id
      and subject.code = new.subject_id
      and (career.name = new.program_id or career.external_code = new.program_id)
      and (student_record.profile_id is null or student_record.profile_id = new.student_id)
  ) then
    raise exception 'exam_enrollments alumno/materia/carrera/plan incompatibles'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.validate_exam_absence_penalty_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.student_records student_record
    where student_record.institution_id = new.institution_id
      and student_record.id = new.student_record_id
      and (new.student_id is null or student_record.profile_id is null or student_record.profile_id = new.student_id)
  ) then
    raise exception 'exam_absence_penalties alumno/legajo incompatibles'
      using errcode = '23514';
  end if;

  if new.student_career_plan_id is not null
    and not exists (
      select 1
      from public.student_career_plans student_plan
      where student_plan.institution_id = new.institution_id
        and student_plan.id = new.student_career_plan_id
        and student_plan.student_id = new.student_record_id
    )
  then
    raise exception 'exam_absence_penalties plan de carrera incompatible'
      using errcode = '23514';
  end if;

  if new.source_exam_table_subject_id is not null
    and not exists (
      select 1
      from public.exam_table_subjects table_subject
      join public.subjects subject
        on subject.institution_id = table_subject.institution_id
       and subject.id = table_subject.subject_id
      join public.careers career
        on career.institution_id = table_subject.institution_id
       and career.id = table_subject.career_id
      where table_subject.institution_id = new.institution_id
        and table_subject.exam_table_id = new.source_exam_table_id
        and table_subject.id = new.source_exam_table_subject_id
        and subject.code = new.subject_id
        and (new.program_id = '' or career.name = new.program_id or career.external_code = new.program_id)
    )
  then
    raise exception 'exam_absence_penalties mesa fuente/materia/carrera incompatibles'
      using errcode = '23514';
  end if;

  if new.blocked_exam_table_subject_id is not null
    and not exists (
      select 1
      from public.exam_table_subjects table_subject
      join public.subjects subject
        on subject.institution_id = table_subject.institution_id
       and subject.id = table_subject.subject_id
      join public.careers career
        on career.institution_id = table_subject.institution_id
       and career.id = table_subject.career_id
      where table_subject.institution_id = new.institution_id
        and table_subject.exam_table_id = new.blocked_exam_table_id
        and table_subject.id = new.blocked_exam_table_subject_id
        and subject.code = new.subject_id
        and (new.program_id = '' or career.name = new.program_id or career.external_code = new.program_id)
    )
  then
    raise exception 'exam_absence_penalties mesa bloqueada/materia/carrera incompatibles'
      using errcode = '23514';
  end if;

  if new.source_enrollment_id is not null
    and not exists (
      select 1
      from public.exam_enrollments enrollment
      where enrollment.institution_id = new.institution_id
        and enrollment.id = new.source_enrollment_id
        and enrollment.workspace_key = new.workspace_key
        and enrollment.student_record_id = new.student_record_id
        and enrollment.exam_table_id = new.source_exam_table_id
        and enrollment.exam_table_subject_id = new.source_exam_table_subject_id
        and enrollment.subject_id = new.subject_id
        and enrollment.program_id = new.program_id
    )
  then
    raise exception 'exam_absence_penalties inscripcion fuente incompatible'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Reglas de elegibilidad de un alumno para rendir (regularidad, deuda, sancion por ausencia, correlativas).
-- Unica fuente: la usan la inscripcion del portal (con plazo) y la inscripcion especial del admin (sin plazo).
-- Interna: no se expone a ningun rol de la API.
create or replace function public.exam_enrollment_assert_eligible(
  p_institution_id uuid,
  p_workspace_key text,
  p_student_id uuid,
  p_student_record_id uuid,
  p_subject_id text,
  p_program_id text,
  p_exam_table_subject_id uuid,
  p_study_plan_subject_id uuid,
  p_exam_period_key text,
  p_exam_call_key text,
  p_scheduled_starts_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  latest_academic_status text;
  last_absence_at timestamptz;
  next_period_key text;
  next_call_key text;
begin
  select grade.academic_status
  into latest_academic_status
  from public.student_grades grade
  where grade.institution_id = p_institution_id
    and grade.workspace_key = p_workspace_key
    and grade.deleted_at is null
    and grade.student_record_id = p_student_record_id
    and grade.student_id = p_student_id
    and grade.subject_id = p_subject_id
    and grade.program_id = p_program_id
    and grade.academic_status <> 'pending'
  order by grade.updated_at desc nulls last, grade.created_at desc nulls last
  limit 1;

  if latest_academic_status is distinct from 'regular' then
    raise exception 'EXAM_REGULARITY_REQUIRED';
  end if;

  if exists (
    select 1
    from public.student_financial_status financial_status
    where financial_status.institution_id = p_institution_id
      and financial_status.workspace_key = p_workspace_key
      and financial_status.student_record_id = p_student_record_id
      and financial_status.adeuda_cuota = true
  ) then
    raise exception 'EXAM_FINANCIAL_DEBT_BLOCK';
  end if;

  if exists (
    select 1
    from public.exam_absence_penalties penalty
    where penalty.institution_id = p_institution_id
      and penalty.workspace_key = p_workspace_key
      and penalty.student_record_id = p_student_record_id
      and penalty.subject_id = p_subject_id
      and penalty.program_id = p_program_id
      and penalty.status in ('active', 'pending_review')
      and penalty.absent_at <= p_scheduled_starts_at
      and (
        penalty.status = 'pending_review'
        or (
          penalty.scope_type = 'next_exam_call_for_subject'
          and penalty.blocked_exam_period_key = p_exam_period_key
          and penalty.blocked_exam_call_key = p_exam_call_key
          and p_scheduled_starts_at >= penalty.penalty_from
          and (penalty.penalty_until is null or p_scheduled_starts_at <= penalty.penalty_until)
        )
        or (
          penalty.scope_type = 'specific_exam_table_subject'
          and penalty.blocked_exam_table_subject_id = p_exam_table_subject_id
          and p_scheduled_starts_at >= penalty.penalty_from
          and (penalty.penalty_until is null or p_scheduled_starts_at <= penalty.penalty_until)
        )
        or (
          penalty.status = 'active'
          and (
            penalty.blocked_exam_table_id is null
            or penalty.blocked_exam_table_subject_id is null
            or penalty.blocked_exam_period_key is null
            or penalty.blocked_exam_call_key is null
          )
        )
      )
  ) then
    raise exception 'BLOCKED_BY_ABSENCE_PENALTY';
  end if;

  -- F1b (decision de Miguel, 18/10): ausente en el acta de una materia -> pierde el proximo llamado de esa
  -- materia y carrera. El proximo llamado es el (periodo, llamado) de la primera mesa publicada de la materia
  -- posterior al examen en que falto. Espejo: getAbsencePenaltyForExam en src/modules/alumnos/lib/examEligibility.js.
  select max(absent_table.scheduled_starts_at)
  into last_absence_at
  from public.exam_results exam_result
  join public.exam_tables absent_table
    on absent_table.institution_id = exam_result.institution_id
   and absent_table.id = exam_result.exam_table_id
  where exam_result.institution_id = p_institution_id
    and exam_result.workspace_key = p_workspace_key
    and exam_result.student_record_id = p_student_record_id
    and exam_result.subject_id = p_subject_id
    and exam_result.program_id = p_program_id
    and exam_result.result = 'absent'
    and absent_table.scheduled_starts_at < p_scheduled_starts_at;

  if last_absence_at is not null then
    select next_table.exam_period_key, next_table.exam_call_key
    into next_period_key, next_call_key
    from public.exam_tables next_table
    join public.exam_table_subjects next_subject
      on next_subject.institution_id = next_table.institution_id
     and next_subject.exam_table_id = next_table.id
    join public.subjects subject
      on subject.institution_id = next_subject.institution_id
     and subject.id = next_subject.subject_id
    join public.careers career
      on career.institution_id = next_subject.institution_id
     and career.id = next_subject.career_id
    where next_table.institution_id = p_institution_id
      and next_table.workspace_key = p_workspace_key
      and next_table.status in ('confirmed', 'open', 'closed', 'completed')
      and next_table.scheduled_starts_at > last_absence_at
      and subject.code = p_subject_id
      and (career.name = p_program_id or career.external_code = p_program_id)
    order by next_table.scheduled_starts_at, next_table.id
    limit 1;

    if next_period_key = p_exam_period_key and next_call_key = p_exam_call_key then
      raise exception 'BLOCKED_BY_ABSENCE_PENALTY';
    end if;
  end if;

  if exists (
    select 1
    from public.subject_prerequisites prerequisite
    join public.study_plan_subjects prerequisite_plan_subject
      on prerequisite_plan_subject.institution_id = prerequisite.institution_id
     and prerequisite_plan_subject.id = prerequisite.prerequisite_plan_subject_id
    join public.subjects prerequisite_subject
      on prerequisite_subject.institution_id = prerequisite_plan_subject.institution_id
     and prerequisite_subject.id = prerequisite_plan_subject.subject_id
    join public.study_plans prerequisite_plan
      on prerequisite_plan.institution_id = prerequisite_plan_subject.institution_id
     and prerequisite_plan.id = prerequisite_plan_subject.plan_id
    join public.careers prerequisite_career
      on prerequisite_career.institution_id = prerequisite_plan.institution_id
     and prerequisite_career.id = prerequisite_plan.career_id
    left join lateral (
      select grade.academic_status
      from public.student_grades grade
      where grade.institution_id = p_institution_id
        and grade.workspace_key = p_workspace_key
        and grade.deleted_at is null
        and grade.student_record_id = p_student_record_id
        and grade.student_id = p_student_id
        and grade.subject_id = prerequisite_subject.code
        and (
          grade.program_id = prerequisite_career.name
          or grade.program_id = prerequisite_career.external_code
        )
        and grade.academic_status <> 'pending'
      order by grade.updated_at desc nulls last, grade.created_at desc nulls last
      limit 1
    ) latest_prerequisite_grade on true
    where prerequisite.institution_id = p_institution_id
      and prerequisite.target_plan_subject_id = p_study_plan_subject_id
      and prerequisite.status = 'active'
      and prerequisite.applies_to in ('exam', 'enrollment_and_exam')
      and (
        latest_prerequisite_grade.academic_status is null
        or latest_prerequisite_grade.academic_status not in ('approved', 'promocionado')
      )
  ) then
    raise exception 'EXAM_PREREQUISITES_NOT_MET';
  end if;
end;
$$;

revoke all on function public.exam_enrollment_assert_eligible(uuid, text, uuid, uuid, text, text, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

create or replace function public.upsert_exam_enrollment_from_portal(
  target_institution_id uuid,
  target_workspace_key text,
  actor_user_id uuid,
  target_student_id uuid,
  target_student_record_id uuid default null,
  target_exam_table_id text default null,
  target_subject_id text default null,
  target_program_id text default null,
  target_status text default 'registered',
  target_enrolled_at timestamptz default null,
  target_cancelled_at timestamptz default null,
  target_legacy_snapshot_id text default null,
  target_client_mutation_id text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns public.exam_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  clean_exam_table_key text := btrim(coalesce(target_exam_table_id, ''));
  clean_subject_id text := btrim(coalesce(target_subject_id, ''));
  clean_program_id text := btrim(coalesce(target_program_id, ''));
  clean_status text := lower(btrim(coalesce(target_status, 'registered')));
  clean_client_mutation_id text := nullif(btrim(coalesce(target_client_mutation_id, '')), '');
  mutation_metadata jsonb := coalesce(target_metadata, '{}'::jsonb);
  exam_context record;
  locked_exam_table public.exam_tables%rowtype;
  revalidation_time timestamptz;
  student_record_context record;
  student_plan_context record;
  existing_row public.exam_enrollments%rowtype;
  saved_row public.exam_enrollments%rowtype;
begin
  if target_institution_id is null
    or actor_user_id is null
    or target_student_id is null
    or clean_exam_table_key = ''
    or clean_subject_id = ''
    or clean_program_id = ''
  then
    raise exception 'EXAM_ENROLLMENT_INVALID_INPUT';
  end if;

  if clean_status = 'dropped' then
    clean_status := 'cancelled';
  end if;

  if clean_status not in ('registered', 'cancelled') then
    raise exception 'EXAM_ENROLLMENT_INVALID_STATUS';
  end if;

  if authenticated_user_id is null
    or authenticated_user_id <> actor_user_id
    or actor_user_id <> target_student_id
  then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  if target_student_record_id is null then
    raise exception 'STUDENT_RECORD_REQUIRED';
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
      and profile.account_role in ('alumno', 'student')
      and profile.is_blocked = false
  ) then
    raise exception 'ACADEMIC_COMMAND_FORBIDDEN';
  end if;

  select
    student_record.id,
    student_record.profile_id
  into student_record_context
  from public.student_records student_record
  where student_record.institution_id = target_institution_id
    and student_record.workspace_key = clean_workspace_key
    and student_record.id = target_student_record_id
    and student_record.profile_id = target_student_id;

  if student_record_context.id is null then
    raise exception 'STUDENT_RECORD_NOT_FOUND';
  end if;

  select
    exam_table.id as exam_table_id,
    exam_table.exam_period_key,
    exam_table.exam_call_key,
    exam_table.scheduled_starts_at,
    table_subject.id as exam_table_subject_id,
    table_subject.career_id,
    coalesce(table_subject.study_plan_id, plan_subject.plan_id) as study_plan_id,
    table_subject.study_plan_subject_id,
    subject.code as subject_code,
    career.name as career_name,
    career.external_code as career_external_code
  into exam_context
  from public.exam_tables exam_table
  join public.exam_table_subjects table_subject
    on table_subject.institution_id = exam_table.institution_id
   and table_subject.exam_table_id = exam_table.id
  join public.study_plan_subjects plan_subject
    on plan_subject.institution_id = table_subject.institution_id
   and plan_subject.id = table_subject.study_plan_subject_id
  join public.subjects subject
    on subject.institution_id = table_subject.institution_id
   and subject.id = table_subject.subject_id
  join public.careers career
    on career.institution_id = table_subject.institution_id
   and career.id = table_subject.career_id
  where exam_table.institution_id = target_institution_id
    and exam_table.workspace_key = clean_workspace_key
    and (
      exam_table.id::text = clean_exam_table_key
      or exam_table.legacy_exam_table_id = clean_exam_table_key
      or exam_table.legacy_snapshot_id = clean_exam_table_key
    )
    and exam_table.status in ('confirmed', 'open')
    and exam_table.exam_type <> 'special'
    and coalesce(exam_table.metadata ->> 'inscription_mode', '') <> 'admin_only'
    and subject.code = clean_subject_id
    and (career.name = clean_program_id or career.external_code = clean_program_id)
  order by table_subject.is_primary desc, table_subject.display_order asc, table_subject.created_at asc
  limit 1;

  if exam_context.exam_table_id is null then
    raise exception 'EXAM_TABLE_NOT_AVAILABLE';
  end if;

  if clean_status = 'registered'
    and (
      timezone('utc', now()) < coalesce(target_enrolled_at, timezone('utc', now())) - interval '365 days'
      or timezone('utc', now()) < (select enrollment_opens_at from public.exam_tables where id = exam_context.exam_table_id and institution_id = target_institution_id)
      or timezone('utc', now()) > (select enrollment_closes_at from public.exam_tables where id = exam_context.exam_table_id and institution_id = target_institution_id)
    )
  then
    raise exception 'EXAM_ENROLLMENT_WINDOW_CLOSED';
  end if;

  select
    student_plan.id
  into student_plan_context
  from public.student_career_plans student_plan
  where student_plan.institution_id = target_institution_id
    and student_plan.student_id = target_student_record_id
    and student_plan.career_id = exam_context.career_id
    and student_plan.plan_id = exam_context.study_plan_id
  order by student_plan.created_at desc
  limit 1;

  if student_plan_context.id is null then
    raise exception 'STUDENT_CAREER_PLAN_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_institution_id::text || ':' ||
      clean_workspace_key || ':' ||
      exam_context.exam_table_subject_id::text || ':' ||
      target_student_record_id::text,
      0
    )
  );

  -- Releer despues de cualquier espera y estabilizar estado/ventana hasta commit.
  select *
  into locked_exam_table
  from public.exam_tables exam_table
  where exam_table.id = exam_context.exam_table_id
    and exam_table.institution_id = target_institution_id
    and exam_table.workspace_key = clean_workspace_key
  for share;

  if not found
    or locked_exam_table.status not in ('confirmed', 'open')
    or locked_exam_table.exam_type = 'special'
    or coalesce(locked_exam_table.metadata ->> 'inscription_mode', '') = 'admin_only'
  then
    raise exception 'EXAM_TABLE_NOT_AVAILABLE';
  end if;

  -- now() conserva el inicio de transaccion: no detecta una ventana vencida
  -- durante la espera. Evaluar el reloj real una vez adquirido el lock de fila.
  revalidation_time := pg_catalog.clock_timestamp();
  if clean_status = 'registered'
    and (
      revalidation_time < coalesce(target_enrolled_at, revalidation_time) - interval '365 days'
      or revalidation_time < locked_exam_table.enrollment_opens_at
      or revalidation_time > locked_exam_table.enrollment_closes_at
    )
  then
    raise exception 'EXAM_ENROLLMENT_WINDOW_CLOSED';
  end if;

  if clean_client_mutation_id is not null then
    select *
    into existing_row
    from public.exam_enrollments enrollment
    where enrollment.institution_id = target_institution_id
      and enrollment.student_id = target_student_id
      and enrollment.client_mutation_id = clean_client_mutation_id
    for update;

    if existing_row.id is not null then
      return existing_row;
    end if;
  end if;

  if clean_status = 'registered' then
    perform public.exam_enrollment_assert_eligible(
      target_institution_id,
      clean_workspace_key,
      target_student_id,
      target_student_record_id,
      clean_subject_id,
      clean_program_id,
      exam_context.exam_table_subject_id,
      exam_context.study_plan_subject_id,
      exam_context.exam_period_key,
      exam_context.exam_call_key,
      exam_context.scheduled_starts_at
    );

    insert into public.exam_enrollments (
      institution_id,
      workspace_key,
      exam_table_id,
      exam_table_subject_id,
      student_id,
      student_record_id,
      student_career_plan_id,
      subject_id,
      program_id,
      status,
      enrolled_at,
      cancelled_at,
      created_by,
      cancelled_by,
      client_mutation_id,
      legacy_snapshot_id,
      metadata
    )
    values (
      target_institution_id,
      clean_workspace_key,
      exam_context.exam_table_id,
      exam_context.exam_table_subject_id,
      target_student_id,
      target_student_record_id,
      student_plan_context.id,
      clean_subject_id,
      clean_program_id,
      'registered',
      coalesce(target_enrolled_at, timezone('utc', now())),
      null,
      actor_user_id,
      null,
      clean_client_mutation_id,
      target_legacy_snapshot_id,
      mutation_metadata
    )
    on conflict (institution_id, exam_table_subject_id, student_record_id) where status = 'registered'
    do update
    set
      student_id = excluded.student_id,
      student_career_plan_id = excluded.student_career_plan_id,
      enrolled_at = coalesce(excluded.enrolled_at, public.exam_enrollments.enrolled_at),
      cancelled_at = null,
      cancelled_by = null,
      client_mutation_id = coalesce(excluded.client_mutation_id, public.exam_enrollments.client_mutation_id),
      legacy_snapshot_id = coalesce(excluded.legacy_snapshot_id, public.exam_enrollments.legacy_snapshot_id),
      metadata = coalesce(public.exam_enrollments.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      lock_version = public.exam_enrollments.lock_version + 1,
      updated_at = timezone('utc', now())
    returning * into saved_row;
  else
    select *
    into saved_row
    from public.exam_enrollments enrollment
    where enrollment.institution_id = target_institution_id
      and enrollment.workspace_key = clean_workspace_key
      and enrollment.exam_table_id = exam_context.exam_table_id
      and enrollment.exam_table_subject_id = exam_context.exam_table_subject_id
      and enrollment.student_id = target_student_id
      and enrollment.student_record_id = target_student_record_id
      and enrollment.status = 'registered'
    for update;

    if saved_row.id is null then
      select *
      into saved_row
      from public.exam_enrollments enrollment
      where enrollment.institution_id = target_institution_id
        and enrollment.workspace_key = clean_workspace_key
        and enrollment.exam_table_id = exam_context.exam_table_id
        and enrollment.exam_table_subject_id = exam_context.exam_table_subject_id
        and enrollment.student_id = target_student_id
        and enrollment.student_record_id = target_student_record_id
        and enrollment.status = 'cancelled'
      order by enrollment.updated_at desc
      limit 1;

      if saved_row.id is null then
        raise exception 'EXAM_ENROLLMENT_NOT_FOUND';
      end if;

      return saved_row;
    end if;

    update public.exam_enrollments
    set
      status = 'cancelled',
      cancelled_at = coalesce(target_cancelled_at, timezone('utc', now())),
      cancelled_by = actor_user_id,
      client_mutation_id = coalesce(clean_client_mutation_id, client_mutation_id),
      legacy_snapshot_id = coalesce(target_legacy_snapshot_id, legacy_snapshot_id),
      metadata = coalesce(metadata, '{}'::jsonb) || mutation_metadata,
      lock_version = public.exam_enrollments.lock_version + 1,
      updated_at = timezone('utc', now())
    where id = saved_row.id
      and institution_id = target_institution_id
    returning * into saved_row;
  end if;

  insert into public.exam_enrollment_events (
    institution_id,
    exam_enrollment_id,
    event_type,
    actor_user_id,
    reason_code,
    client_mutation_id,
    request_hash,
    metadata
  )
  values (
    target_institution_id,
    saved_row.id,
    clean_status,
    actor_user_id,
    case when clean_status = 'registered' then 'student_portal_register' else 'student_portal_cancel' end,
    clean_client_mutation_id,
    mutation_metadata ->> 'client_request_hash',
    mutation_metadata
  );

  return saved_row;
end;
$$;

revoke execute on function public.validate_exam_table_subject_integrity() from public, anon, authenticated;
revoke execute on function public.validate_exam_enrollment_integrity() from public, anon, authenticated;
revoke execute on function public.validate_exam_absence_penalty_integrity() from public, anon, authenticated;
revoke execute on function public.upsert_exam_enrollment_from_portal(uuid, text, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_exam_enrollment_from_portal(uuid, text, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;

drop trigger if exists validate_exam_table_subject_integrity on public.exam_table_subjects;
create trigger validate_exam_table_subject_integrity
before insert or update on public.exam_table_subjects
for each row execute function public.validate_exam_table_subject_integrity();

drop trigger if exists validate_exam_enrollment_integrity on public.exam_enrollments;
create trigger validate_exam_enrollment_integrity
before insert or update on public.exam_enrollments
for each row execute function public.validate_exam_enrollment_integrity();

drop trigger if exists validate_exam_absence_penalty_integrity on public.exam_absence_penalties;
create trigger validate_exam_absence_penalty_integrity
before insert or update on public.exam_absence_penalties
for each row execute function public.validate_exam_absence_penalty_integrity();

-- ============================================================
-- Indices
-- ============================================================

create unique index if not exists exam_tables_legacy_exam_table_key
  on public.exam_tables (institution_id, workspace_key, legacy_exam_table_id)
  where legacy_exam_table_id is not null;

create index if not exists idx_exam_tables_workspace_status
  on public.exam_tables (institution_id, workspace_key, status, scheduled_starts_at);

create index if not exists idx_exam_tables_primary_career
  on public.exam_tables (institution_id, primary_career_id)
  where primary_career_id is not null;

create unique index if not exists exam_table_subjects_primary_subject_key
  on public.exam_table_subjects (institution_id, exam_table_id)
  where is_primary = true;

create index if not exists idx_exam_table_subjects_subject
  on public.exam_table_subjects (institution_id, subject_id, career_id);

create index if not exists idx_exam_table_subjects_study_plan_subject
  on public.exam_table_subjects (institution_id, study_plan_subject_id);

create unique index if not exists exam_teacher_assignments_active_table_role_key
  on public.exam_teacher_assignments (institution_id, exam_table_id, role)
  where status = 'active'
    and exam_table_subject_id is null
    and role in ('TITULAR', 'VOCAL_1', 'VOCAL_2');

create unique index if not exists exam_teacher_assignments_active_subject_role_key
  on public.exam_teacher_assignments (institution_id, exam_table_subject_id, role)
  where status = 'active'
    and exam_table_subject_id is not null;

create unique index if not exists exam_teacher_assignments_active_teacher_scope_key
  on public.exam_teacher_assignments (institution_id, exam_table_id, teacher_record_id, coalesce(exam_table_subject_id, exam_table_id))
  where status = 'active';

create index if not exists idx_exam_teacher_assignments_teacher
  on public.exam_teacher_assignments (institution_id, workspace_key, teacher_id, status, created_at desc)
  where teacher_id is not null;

create index if not exists idx_exam_teacher_assignments_table_status
  on public.exam_teacher_assignments (institution_id, exam_table_id, status, confirmation_status);

create unique index if not exists exam_enrollments_registered_identity_key
  on public.exam_enrollments (institution_id, exam_table_subject_id, student_record_id)
  where status = 'registered';

create unique index if not exists exam_enrollments_client_mutation_key
  on public.exam_enrollments (institution_id, student_id, client_mutation_id)
  where client_mutation_id is not null;

create index if not exists idx_exam_enrollments_student
  on public.exam_enrollments (institution_id, workspace_key, student_id, updated_at desc);

create index if not exists idx_exam_enrollments_table_subject
  on public.exam_enrollments (institution_id, exam_table_id, exam_table_subject_id, status);

create index if not exists idx_exam_enrollments_student_record
  on public.exam_enrollments (institution_id, student_record_id, status);

create index if not exists idx_exam_enrollment_events_enrollment
  on public.exam_enrollment_events (institution_id, exam_enrollment_id, created_at);

create index if not exists idx_exam_table_events_table
  on public.exam_table_events (institution_id, exam_table_id, created_at);

create unique index if not exists exam_absence_penalties_source_event_key
  on public.exam_absence_penalties (institution_id, source_event_key);

create unique index if not exists exam_absence_penalties_semantic_key
  on public.exam_absence_penalties (institution_id, absence_semantic_key);

create unique index if not exists exam_absence_penalties_active_call_key
  on public.exam_absence_penalties (institution_id, workspace_key, student_record_id, subject_id, program_id, blocked_exam_period_key, blocked_exam_call_key)
  where status in ('active', 'pending_review')
    and scope_type = 'next_exam_call_for_subject'
    and blocked_exam_period_key is not null
    and blocked_exam_call_key is not null;

create unique index if not exists exam_absence_penalties_active_subject_key
  on public.exam_absence_penalties (institution_id, workspace_key, student_record_id, subject_id, program_id, blocked_exam_table_subject_id)
  where status in ('active', 'pending_review')
    and scope_type = 'specific_exam_table_subject'
    and blocked_exam_table_subject_id is not null;

create index if not exists idx_exam_absence_penalties_eligibility
  on public.exam_absence_penalties (institution_id, workspace_key, student_record_id, subject_id, program_id, status, penalty_from, penalty_until);

create index if not exists idx_exam_absence_penalties_call
  on public.exam_absence_penalties (institution_id, workspace_key, blocked_exam_period_key, blocked_exam_call_key, status)
  where blocked_exam_period_key is not null
    and blocked_exam_call_key is not null;

create index if not exists idx_exam_absence_penalties_table_subject
  on public.exam_absence_penalties (institution_id, blocked_exam_table_id, blocked_exam_table_subject_id, status)
  where blocked_exam_table_subject_id is not null;

create index if not exists idx_exam_absence_penalties_source_enrollment
  on public.exam_absence_penalties (institution_id, source_enrollment_id)
  where source_enrollment_id is not null;

create index if not exists idx_exam_absence_penalties_student_plan
  on public.exam_absence_penalties (institution_id, student_career_plan_id)
  where student_career_plan_id is not null;

create index if not exists idx_exam_absence_penalties_student
  on public.exam_absence_penalties (institution_id, workspace_key, student_id, status)
  where student_id is not null;

-- ============================================================
-- RLS / grants
--
-- Lectura docente propia habilitada; las otras tablas y escrituras
-- permanecen default-deny. Validacion focal: teacher_assignment_select_rls.sql.
-- ============================================================

alter table public.exam_tables enable row level security;
alter table public.exam_table_subjects enable row level security;
alter table public.exam_teacher_assignments enable row level security;
alter table public.exam_enrollments enable row level security;
alter table public.exam_enrollment_events enable row level security;
alter table public.exam_table_events enable row level security;
alter table public.exam_absence_penalties enable row level security;

revoke all on
  public.exam_tables,
  public.exam_table_subjects,
  public.exam_teacher_assignments,
  public.exam_enrollments,
  public.exam_enrollment_events,
  public.exam_table_events,
  public.exam_absence_penalties
from public, anon, authenticated;

grant select on
  public.exam_tables,
  public.exam_table_subjects,
  public.exam_teacher_assignments,
  public.exam_enrollments,
  public.exam_enrollment_events,
  public.exam_table_events
to authenticated;

-- BEGIN teacher assignment SELECT policy
-- Reejecucion idempotente limitada a esta policy. Sin bypass ni writes.
DROP POLICY IF EXISTS "exam_teacher_assignments teacher read own"
ON public.exam_teacher_assignments;

CREATE POLICY "exam_teacher_assignments teacher read own"
ON public.exam_teacher_assignments
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  teacher_id = (SELECT auth.uid())
  AND public.is_member_of_institution(institution_id)
  AND EXISTS (
    SELECT 1
    FROM public.institutions AS institution
    WHERE institution.id = exam_teacher_assignments.institution_id
      AND institution.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM public.teacher_records AS teacher
    JOIN public.profiles AS profile
      ON profile.user_id = teacher.profile_id
    WHERE teacher.id = exam_teacher_assignments.teacher_record_id
      AND teacher.institution_id = exam_teacher_assignments.institution_id
      AND teacher.workspace_key = exam_teacher_assignments.workspace_key
      AND teacher.profile_id = exam_teacher_assignments.teacher_id
      AND profile.user_id = (SELECT auth.uid())
      AND profile.account_role = 'docente'
      AND profile.is_blocked = false
  )
);
-- END teacher assignment SELECT policy

-- ============================================================
-- EX.1: publicar el cronograma final en exam_tables
-- ============================================================
-- "Publicar cronograma" guarda las mesas en workspace_snapshots.cronograma. El portal alumno
-- (05 visible_schedule) y la inscripcion (upsert_exam_enrollment_from_portal) exigen ademas una
-- fila en exam_tables con su exam_table_subjects. Esta RPC las crea o actualiza desde las mesas
-- publicadas. Solo owner/admin/editor de la institucion activa, o superadmin.
-- Clave: el id publicado ("exam-engine-v21-<mesa>-<fecha>", el que manda el alumno). Incluye la fecha:
-- el id del motor se repite entre turnos y sin la fecha un turno nuevo se apropiaria de la mesa (y de
-- los inscriptos) del anterior. legacy_snapshot_id = id tal cual; legacy_exam_table_id = id en minusculas
-- (05 cruza por cualquiera de los dos). Una mesa cerrada o completada no se reabre. Una mesa que ya no
-- esta en el cronograma se cancela, salvo que tenga inscriptos: entonces se conserva y se informa.
create or replace function public.publish_exam_tables_from_schedule(
  target_institution_id uuid,
  target_workspace_key text,
  target_mesas jsonb,
  target_enrollment_opens_at timestamptz default null,
  target_close_hours_before integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  opens_at timestamptz := coalesce(target_enrollment_opens_at, now());
  close_hours integer := greatest(coalesce(target_close_hours_before, 24), 0);
  mesa jsonb;
  published_id text;
  legacy_key text;
  subject_code text;
  career_text text;
  exam_date text;
  start_time text;
  end_time text;
  starts_at timestamptz;
  ends_at timestamptz;
  closes_at timestamptz;
  call_key text;
  career_row record;
  subject_row record;
  table_id uuid;
  table_status text;
  primary_plan_subject record;
  published_ids text[] := array[]::text[];
  created_count integer := 0;
  updated_count integer := 0;
  skipped jsonb := '[]'::jsonb;
  cancelled_count integer := 0;
  kept jsonb := '[]'::jsonb;
  stale record;
  tribunal_dnis jsonb;
  titular_dni text;
  tribunal_names jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;

  if target_institution_id is null
    or not (
      public.is_super_admin()
      or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor'])
    )
    or not exists (select 1 from public.institutions where id = target_institution_id and status = 'active')
  then
    raise exception 'Acceso denegado: solo el personal de gestion de la institucion publica mesas.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(target_mesas, 'null'::jsonb)) <> 'array' then
    raise exception 'EXAM_PUBLISH_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  -- Una publicacion a la vez por workspace.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('exam_publish:' || target_institution_id::text || ':' || clean_workspace_key, 0));

  for mesa in select value from jsonb_array_elements(target_mesas) loop
    published_id := btrim(coalesce(mesa ->> 'id', ''));
    legacy_key := lower(published_id);
    subject_code := btrim(coalesce(mesa ->> 'materia', mesa ->> 'codigo', ''));
    career_text := btrim(coalesce(mesa ->> 'carrera', ''));
    exam_date := btrim(coalesce(mesa ->> 'fechaIso', mesa ->> 'fechaSugerida', ''));
    start_time := coalesce(nullif(btrim(coalesce(mesa ->> 'inicio', '')), ''), '08:00');
    end_time := nullif(btrim(coalesce(mesa ->> 'fin', '')), '');
    -- DNI de titular y vocales: autorizan al tribunal a ver los inscriptos (get_exam_table_roster).
    tribunal_dnis := coalesce((
      select jsonb_agg(distinct dni)
      from (
        select regexp_replace(part, '[^0-9]', '', 'g') as dni
        from regexp_split_to_table(coalesce(mesa ->> 'tribunal_dnis', ''), ',') as part
      ) cleaned
      where dni <> ''
    ), '[]'::jsonb);
    -- Solo el titular ve los inscriptos desde el portal docente; los vocales ven la mesa.
    titular_dni := nullif(regexp_replace(coalesce(mesa ->> 'titular_dni', ''), '[^0-9]', '', 'g'), '');
    tribunal_names := jsonb_strip_nulls(jsonb_build_object(
      'titular', nullif(btrim(coalesce(mesa ->> 'profesorTitular', '')), ''),
      'vocal1', nullif(btrim(coalesce(mesa ->> 'vocal1', '')), ''),
      'vocal2', nullif(btrim(coalesce(mesa ->> 'vocal2', '')), '')
    ));

    if published_id = '' or subject_code = '' or career_text = '' then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', 'Faltan id, materia o carrera.');
      continue;
    end if;
    if legacy_key = any(published_ids) then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', 'La mesa esta repetida en el cronograma.');
      continue;
    end if;
    -- Fecha y hora invalidas (25:00, 30/02) se omiten en lugar de abortar toda la publicacion.
    begin
      if exam_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or start_time !~ '^[0-9]{1,2}:[0-9]{2}$' or (end_time is not null and end_time !~ '^[0-9]{1,2}:[0-9]{2}$') then
        raise exception using errcode = '22007';
      end if;
      starts_at := (exam_date || ' ' || start_time)::timestamp at time zone 'America/Argentina/Buenos_Aires';
      ends_at := case when end_time is null then null else (exam_date || ' ' || end_time)::timestamp at time zone 'America/Argentina/Buenos_Aires' end;
    exception when others then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', 'Fecha u hora invalida.');
      continue;
    end;

    select career.id, career.name into career_row
    from public.careers career
    where career.institution_id = target_institution_id
      and career.status = 'active'
      and (career.name = career_text or career.external_code = career_text)
    order by (career.name = career_text) desc
    limit 1;
    if career_row.id is null then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', format('La carrera %s no esta en el catalogo academico.', career_text));
      continue;
    end if;

    select subject.id, subject.code into subject_row
    from public.subjects subject
    where subject.institution_id = target_institution_id and subject.code = subject_code;
    if subject_row.id is null then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', format('La materia %s no esta en el catalogo academico.', subject_code));
      continue;
    end if;

    -- Plan principal: el activo mas reciente de la carrera que contiene la materia.
    select plan_subject.id as plan_subject_id, plan.id as plan_id into primary_plan_subject
    from public.study_plan_subjects plan_subject
    join public.study_plans plan on plan.institution_id = plan_subject.institution_id and plan.id = plan_subject.plan_id
    where plan_subject.institution_id = target_institution_id
      and plan_subject.subject_id = subject_row.id
      and plan.career_id = career_row.id
    order by (plan.status = 'active') desc, plan.plan_year desc nulls last, plan.created_at desc
    limit 1;
    if primary_plan_subject.plan_subject_id is null then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', format('La materia %s no esta en ningun plan de %s.', subject_code, career_row.name));
      continue;
    end if;

    if ends_at is not null and ends_at <= starts_at then
      ends_at := null;
    end if;
    closes_at := starts_at - make_interval(hours => close_hours);
    if closes_at <= opens_at then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', format('Faltan menos de %s horas para la mesa: no se abre inscripcion.', close_hours));
      -- Sigue en el cronograma: si ya estaba publicada, no se cancela por quedar fuera de la ventana.
      published_ids := published_ids || legacy_key;
      continue;
    end if;

    call_key := coalesce(nullif(btrim(coalesce(mesa ->> 'exam_call', '')), ''), 'first');

    select exam_table.id, exam_table.status into table_id, table_status
    from public.exam_tables exam_table
    where exam_table.institution_id = target_institution_id
      and exam_table.workspace_key = clean_workspace_key
      and exam_table.legacy_exam_table_id = legacy_key
    for update;

    if table_status in ('closed', 'completed') then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', 'La mesa ya fue cerrada: no se reabre.');
      published_ids := published_ids || legacy_key;
      continue;
    end if;

    if table_id is null then
      insert into public.exam_tables (
        institution_id, workspace_key, primary_career_id, primary_study_plan_id, exam_period_key, exam_call_key,
        exam_call_label, exam_type, scheduled_starts_at, scheduled_ends_at, room, enrollment_opens_at,
        enrollment_closes_at, status, legacy_exam_table_id, legacy_snapshot_id, source, metadata, created_by, updated_by
      ) values (
        target_institution_id, clean_workspace_key, career_row.id, primary_plan_subject.plan_id, left(exam_date, 7), call_key,
        coalesce(nullif(btrim(coalesce(mesa ->> 'llamado', '')), ''), 'Primer llamado'),
        case when mesa ->> 'exam_type' = 'special' then 'special' else 'regular' end,
        starts_at, ends_at, nullif(btrim(coalesce(mesa ->> 'aula', '')), ''), opens_at, closes_at, 'open',
        legacy_key, published_id, 'exam_engine_v21',
        jsonb_build_object('inscription_mode', coalesce(nullif(mesa ->> 'inscription_mode', ''), 'student_self_service'), 'published_by', 'publish_exam_tables_from_schedule', 'tribunal_dnis', tribunal_dnis, 'titular_dni', titular_dni, 'tribunal', tribunal_names),
        (select auth.uid()), (select auth.uid())
      )
      returning id into table_id;
      created_count := created_count + 1;
    else
      update public.exam_tables
      set primary_career_id = career_row.id,
          primary_study_plan_id = primary_plan_subject.plan_id,
          exam_period_key = left(exam_date, 7),
          exam_call_key = call_key,
          exam_call_label = coalesce(nullif(btrim(coalesce(mesa ->> 'llamado', '')), ''), exam_call_label),
          scheduled_starts_at = starts_at,
          scheduled_ends_at = ends_at,
          room = nullif(btrim(coalesce(mesa ->> 'aula', '')), ''),
          enrollment_opens_at = least(enrollment_opens_at, opens_at),
          enrollment_closes_at = closes_at,
          status = 'open',
          closed_at = null,
          legacy_snapshot_id = published_id,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('tribunal_dnis', tribunal_dnis, 'titular_dni', titular_dni, 'tribunal', tribunal_names),
          updated_by = (select auth.uid()),
          updated_at = timezone('utc', now()),
          lock_version = lock_version + 1
      where id = table_id and institution_id = target_institution_id;
      updated_count := updated_count + 1;
    end if;

    -- Una fila por plan de la carrera que contiene la materia; la del plan principal es la primaria.
    -- Primero se baja la marca de primaria vieja: el indice admite una sola primaria por mesa.
    update public.exam_table_subjects
    set is_primary = false
    where institution_id = target_institution_id and exam_table_id = table_id and is_primary
      and study_plan_subject_id <> primary_plan_subject.plan_subject_id;
    update public.exam_table_subjects
    set is_primary = true
    where institution_id = target_institution_id and exam_table_id = table_id and not is_primary
      and study_plan_subject_id = primary_plan_subject.plan_subject_id;
    insert into public.exam_table_subjects (institution_id, exam_table_id, career_id, study_plan_id, study_plan_subject_id, subject_id, is_primary, legacy_subject_id, legacy_program_id)
    select target_institution_id, table_id, career_row.id, plan_subject.plan_id, plan_subject.id, subject_row.id,
      plan_subject.id = primary_plan_subject.plan_subject_id, subject_row.code, career_row.name
    from public.study_plan_subjects plan_subject
    join public.study_plans plan on plan.institution_id = plan_subject.institution_id and plan.id = plan_subject.plan_id
    where plan_subject.institution_id = target_institution_id
      and plan_subject.subject_id = subject_row.id
      and plan.career_id = career_row.id
    on conflict (institution_id, exam_table_id, study_plan_subject_id) do nothing;

    published_ids := published_ids || legacy_key;
  end loop;

  -- Mesas del motor que ya no estan publicadas: se cancelan si no tienen inscriptos.
  for stale in
    select exam_table.id, exam_table.legacy_snapshot_id
    from public.exam_tables exam_table
    where exam_table.institution_id = target_institution_id
      and exam_table.workspace_key = clean_workspace_key
      and exam_table.source = 'exam_engine_v21'
      and exam_table.status in ('draft', 'teacher_review', 'confirmed', 'open')
      and not (exam_table.legacy_exam_table_id = any(published_ids))
    for update
  loop
    if exists (
      select 1 from public.exam_enrollments enrollment
      where enrollment.institution_id = target_institution_id and enrollment.exam_table_id = stale.id and enrollment.status = 'registered'
    ) then
      kept := kept || jsonb_build_object('id', stale.legacy_snapshot_id, 'motivo', 'Tiene alumnos inscriptos: no se cancela automaticamente.');
    else
      update public.exam_tables
      set status = 'cancelled', closed_at = timezone('utc', now()), updated_by = (select auth.uid()),
          updated_at = timezone('utc', now()), lock_version = lock_version + 1
      where id = stale.id and institution_id = target_institution_id;
      cancelled_count := cancelled_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'publicadas', created_count + updated_count,
    'nuevas', created_count,
    'actualizadas', updated_count,
    'omitidas', skipped,
    'canceladas', cancelled_count,
    'conservadas_con_inscriptos', kept
  );
end;
$$;

revoke execute on function public.publish_exam_tables_from_schedule(uuid, text, jsonb, timestamptz, integer) from public, anon;
grant execute on function public.publish_exam_tables_from_schedule(uuid, text, jsonb, timestamptz, integer) to authenticated;

-- Inscriptos de una mesa publicada, para el titular (portal docente) y el personal de gestion (actas).
-- Datos personales de alumnos: el docente solo ve la lista si es el titular publicado de la mesa (DNI de su
-- legajo) o el titular asignado a la materia. Los vocales ven la mesa, no la lista.
-- exam_enrollments no tiene policies: se lee solo por aca.
create or replace function public.get_exam_table_roster(
  target_institution_id uuid,
  target_workspace_key text,
  target_exam_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  clean_exam_key text := lower(btrim(coalesce(target_exam_key, '')));
  table_row record;
  is_staff boolean;
  caller_dnis text[];
begin
  if caller_id is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;

  is_staff := public.is_super_admin()
    or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor']);
  if target_institution_id is null or not (is_staff or public.is_member_of_institution(target_institution_id)) then
    raise exception 'Acceso denegado: solo el titular de la mesa puede ver los inscriptos.' using errcode = '42501';
  end if;

  select exam_table.id, exam_table.legacy_snapshot_id, exam_table.status, exam_table.metadata, exam_table.scheduled_starts_at into table_row
  from public.exam_tables exam_table
  where exam_table.institution_id = target_institution_id
    and exam_table.workspace_key = clean_workspace_key
    and exam_table.legacy_exam_table_id = clean_exam_key;

  if not is_staff then
    select coalesce(array_agg(regexp_replace(teacher.dni, '[^0-9]', '', 'g')), array[]::text[]) into caller_dnis
    from public.teacher_records teacher
    where teacher.institution_id = target_institution_id
      and teacher.workspace_key = clean_workspace_key
      and teacher.profile_id = caller_id
      and regexp_replace(coalesce(teacher.dni, ''), '[^0-9]', '', 'g') <> '';

    if table_row.id is null or not (
      coalesce(table_row.metadata ->> 'titular_dni', '') = any(caller_dnis)
      or exists (
        select 1
        from public.exam_table_subjects exam_subject
        join public.subject_teacher_assignments assignment
          on assignment.institution_id = exam_subject.institution_id
         and assignment.subject_id = exam_subject.legacy_subject_id
         and assignment.program_id = exam_subject.legacy_program_id
        where exam_subject.institution_id = target_institution_id
          and exam_subject.exam_table_id = table_row.id
          and assignment.workspace_key = clean_workspace_key
          and assignment.teacher_id = caller_id
          -- Gate Codex P1: el titular (tambien con una licencia futura o ya terminada), dentro de su vigencia.
          and assignment.role in ('titular', 'licencia')
          and public.academic_teacher_assignment_grants_access(assignment)
      )
    ) then
      -- Mismo error si la mesa no existe: no se revela que mesas hay.
      raise exception 'Acceso denegado: solo el titular de la mesa puede ver los inscriptos.' using errcode = '42501';
    end if;
  end if;

  if table_row.id is null then
    raise exception 'EXAM_TABLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'mesa_id', table_row.legacy_snapshot_id,
    'estado', table_row.status,
    -- F1a: estado del acta y si ya se puede cargar (desde el dia del examen, hora argentina).
    'acta_cerrada', table_row.status = 'completed',
    'fecha_examen', table_row.scheduled_starts_at,
    'puede_cargar_notas', table_row.status not in ('completed', 'cancelled')
      and (timezone('America/Argentina/Buenos_Aires', now()))::date >= (timezone('America/Argentina/Buenos_Aires', table_row.scheduled_starts_at))::date,
    'alumnos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'inscripcion_id', enrollment.id,
        'resultado', exam_result.result,
        'escrito', exam_result.written_grade,
        'oral', exam_result.oral_grade,
        'nota', exam_result.final_grade,
        'nombre', coalesce(nullif(btrim(student.full_name), ''), btrim(concat_ws(' ', student.first_name, student.last_name))),
        'apellido', nullif(btrim(coalesce(student.last_name, '')), ''),
        'nombres', nullif(btrim(coalesce(student.first_name, '')), ''),
        'dni', coalesce(nullif(btrim(student.dni), ''), student.national_id),
        'legajo', student.legajo,
        'carrera', enrollment.program_id,
        'materia', enrollment.subject_id,
        'inscripto_el', enrollment.enrolled_at,
        'inscripcion_especial', coalesce((enrollment.metadata ->> 'admin_enrollment')::boolean, false)
      ) order by lower(coalesce(nullif(btrim(student.last_name), ''), student.full_name, '')), lower(coalesce(student.first_name, '')), student.id)
      from public.exam_enrollments enrollment
      join public.student_records student
        on student.institution_id = enrollment.institution_id
       and student.id = enrollment.student_record_id
      left join public.exam_results exam_result
        on exam_result.institution_id = enrollment.institution_id
       and exam_result.exam_enrollment_id = enrollment.id
      where enrollment.institution_id = target_institution_id
        and enrollment.exam_table_id = table_row.id
        and enrollment.status = 'registered'
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_exam_table_roster(uuid, text, text) from public, anon;
grant execute on function public.get_exam_table_roster(uuid, text, text) to authenticated;

-- Panel admin "Mesas y actas": todas las mesas publicadas con carrera, plan, anio, tribunal y cantidad de
-- inscriptos. Solo personal de gestion.
create or replace function public.get_exam_tables_admin_overview(
  target_institution_id uuid,
  target_workspace_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
begin
  if (select auth.uid()) is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;
  if target_institution_id is null or not (
    public.is_super_admin()
    or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'Acceso denegado: solo el personal de gestion ve las mesas y actas.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row_data order by row_data ->> 'carrera', (row_data ->> 'anio')::int nulls last, row_data ->> 'inicio', row_data ->> 'materia')
    from (
      select jsonb_build_object(
        'mesa_id', exam_table.legacy_snapshot_id,
        'estado', exam_table.status,
        'acta_cerrada', exam_table.status = 'completed',
        'tipo', exam_table.exam_type,
        'llamado', exam_table.exam_call_label,
        'inicio', exam_table.scheduled_starts_at,
        'fin', exam_table.scheduled_ends_at,
        'aula', exam_table.room,
        'cierre_inscripcion', exam_table.enrollment_closes_at,
        'carrera', career.name,
        'plan', coalesce(nullif(btrim(plan.name), ''), plan.external_code),
        'plan_anio', plan.plan_year,
        'anio', plan_subject.year_number,
        'materia_codigo', subject.code,
        'materia', subject.name,
        'tribunal', coalesce(exam_table.metadata -> 'tribunal', '{}'::jsonb),
        'inscriptos', (
          select count(*) from public.exam_enrollments enrollment
          where enrollment.institution_id = exam_table.institution_id
            and enrollment.exam_table_id = exam_table.id
            and enrollment.status = 'registered'
        )
      ) as row_data
      from public.exam_tables exam_table
      join public.exam_table_subjects exam_subject
        on exam_subject.institution_id = exam_table.institution_id
       and exam_subject.exam_table_id = exam_table.id
       and exam_subject.is_primary
      join public.careers career on career.institution_id = exam_subject.institution_id and career.id = exam_subject.career_id
      join public.subjects subject on subject.institution_id = exam_subject.institution_id and subject.id = exam_subject.subject_id
      left join public.study_plan_subjects plan_subject
        on plan_subject.institution_id = exam_subject.institution_id and plan_subject.id = exam_subject.study_plan_subject_id
      left join public.study_plans plan
        on plan.institution_id = exam_subject.institution_id and plan.id = coalesce(exam_subject.study_plan_id, plan_subject.plan_id)
      where exam_table.institution_id = target_institution_id
        and exam_table.workspace_key = clean_workspace_key
        and exam_table.status <> 'cancelled'
    ) rows
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_exam_tables_admin_overview(uuid, text) from public, anon;
grant execute on function public.get_exam_tables_admin_overview(uuid, text) to authenticated;

-- Inscripcion especial: el personal de gestion inscribe a un alumno fuera del plazo del portal (hasta el dia
-- de la mesa) o en mesas admin_only. El alumno tiene que cumplir las mismas reglas que en el portal
-- (exam_enrollment_assert_eligible); solo se saltea el plazo. Queda registrado quien y por que.
create or replace function public.admin_enroll_student_in_exam_table(
  target_institution_id uuid,
  target_workspace_key text,
  target_exam_key text,
  target_student_record_id uuid,
  target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  clean_exam_key text := lower(btrim(coalesce(target_exam_key, '')));
  clean_reason text := btrim(coalesce(target_reason, ''));
  table_row public.exam_tables%rowtype;
  student_row record;
  exam_context record;
  saved_row public.exam_enrollments%rowtype;
begin
  if caller_id is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;
  if target_institution_id is null or not (
    public.is_super_admin()
    or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor'])
  ) then
    raise exception 'Acceso denegado: solo el personal de gestion hace inscripciones especiales.' using errcode = '42501';
  end if;
  if length(clean_reason) < 5 then
    raise exception 'EXAM_ADMIN_ENROLLMENT_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into table_row
  from public.exam_tables exam_table
  where exam_table.institution_id = target_institution_id
    and exam_table.workspace_key = clean_workspace_key
    and exam_table.legacy_exam_table_id = clean_exam_key
  for share;
  if table_row.id is null or table_row.status not in ('confirmed', 'open') then
    raise exception 'EXAM_TABLE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  -- Hasta el final del dia de la mesa (hora de Argentina).
  if pg_catalog.clock_timestamp() >= (date_trunc('day', table_row.scheduled_starts_at at time zone 'America/Argentina/Buenos_Aires') + interval '1 day') at time zone 'America/Argentina/Buenos_Aires' then
    raise exception 'EXAM_ADMIN_ENROLLMENT_AFTER_EXAM_DAY' using errcode = '22023';
  end if;

  select student.id, student.profile_id into student_row
  from public.student_records student
  join public.profiles profile on profile.user_id = student.profile_id and profile.is_blocked = false
  where student.institution_id = target_institution_id
    and student.workspace_key = clean_workspace_key
    and student.id = target_student_record_id;
  if student_row.id is null then
    raise exception 'STUDENT_ACCOUNT_REQUIRED' using errcode = 'P0002';
  end if;

  -- La materia de la mesa en el plan del alumno.
  select exam_subject.id as exam_table_subject_id, exam_subject.study_plan_subject_id, subject.code as subject_code,
    career.name as career_name, student_plan.id as student_career_plan_id
  into exam_context
  from public.exam_table_subjects exam_subject
  join public.study_plan_subjects plan_subject
    on plan_subject.institution_id = exam_subject.institution_id and plan_subject.id = exam_subject.study_plan_subject_id
  join public.subjects subject on subject.institution_id = exam_subject.institution_id and subject.id = exam_subject.subject_id
  join public.careers career on career.institution_id = exam_subject.institution_id and career.id = exam_subject.career_id
  join public.student_career_plans student_plan
    on student_plan.institution_id = exam_subject.institution_id
   and student_plan.student_id = student_row.id
   and student_plan.career_id = exam_subject.career_id
   and student_plan.plan_id = coalesce(exam_subject.study_plan_id, plan_subject.plan_id)
  where exam_subject.institution_id = target_institution_id
    and exam_subject.exam_table_id = table_row.id
  order by exam_subject.is_primary desc, student_plan.created_at desc
  limit 1;
  if exam_context.exam_table_subject_id is null then
    raise exception 'STUDENT_CAREER_PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_institution_id::text || ':' || clean_workspace_key || ':' || exam_context.exam_table_subject_id::text || ':' || student_row.id::text, 0));

  perform public.exam_enrollment_assert_eligible(
    target_institution_id,
    clean_workspace_key,
    student_row.profile_id,
    student_row.id,
    exam_context.subject_code,
    exam_context.career_name,
    exam_context.exam_table_subject_id,
    exam_context.study_plan_subject_id,
    table_row.exam_period_key,
    table_row.exam_call_key,
    table_row.scheduled_starts_at
  );

  insert into public.exam_enrollments (
    institution_id, workspace_key, exam_table_id, exam_table_subject_id, student_id, student_record_id,
    student_career_plan_id, subject_id, program_id, status, enrolled_at, created_by, metadata
  ) values (
    target_institution_id, clean_workspace_key, table_row.id, exam_context.exam_table_subject_id, student_row.profile_id, student_row.id,
    exam_context.student_career_plan_id, exam_context.subject_code, exam_context.career_name, 'registered', timezone('utc', now()), caller_id,
    jsonb_build_object('admin_enrollment', true, 'admin_enrollment_reason', clean_reason, 'admin_enrollment_by', caller_id)
  )
  on conflict (institution_id, exam_table_subject_id, student_record_id) where status = 'registered'
  do nothing
  returning * into saved_row;

  if saved_row.id is null then
    raise exception 'EXAM_ENROLLMENT_ALREADY_REGISTERED' using errcode = '23505';
  end if;

  insert into public.exam_enrollment_events (institution_id, exam_enrollment_id, event_type, actor_user_id, reason_code, metadata)
  values (target_institution_id, saved_row.id, 'registered', caller_id, 'admin_special_enrollment', saved_row.metadata);

  return jsonb_build_object('inscripcion_id', saved_row.id, 'estado', saved_row.status, 'materia', saved_row.subject_id, 'carrera', saved_row.program_id);
end;
$$;

revoke execute on function public.admin_enroll_student_in_exam_table(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.admin_enroll_student_in_exam_table(uuid, text, text, uuid, text) to authenticated;

-- ============================================================
-- F1a: acta de examen final. El titular carga escrito, oral, nota final o ausente de cada inscripto y
-- cierra el acta. Decisiones de Miguel (18/10): carga solo el titular (el personal de gestion tambien, y
-- es el unico que corrige un acta cerrada, con motivo); se aprueba con 4 o mas; desaprobar o estar
-- ausente no quita la regularidad (el castigo por ausencia va en F1b).
-- Solo el aprobado pasa a student_grades (grade_type 'final_exam', academic_status 'approved'): asi
-- cuenta para correlativas y cierra la materia. Desaprobado y ausente quedan en exam_results y la
-- ultima condicion del alumno sigue siendo 'regular', que es lo que lee la inscripcion a mesas.
-- ============================================================

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  workspace_key text not null default 'main',
  exam_table_id uuid not null,
  exam_enrollment_id uuid not null,
  student_id uuid not null references public.profiles(user_id) on delete cascade,
  student_record_id uuid not null,
  subject_id text not null,
  program_id text not null,
  written_grade numeric(4,2),
  oral_grade numeric(4,2),
  final_grade numeric(4,2),
  result text not null,
  student_grade_id uuid references public.student_grades(id) on delete set null,
  recorded_by uuid references public.profiles(user_id) on delete set null,
  corrected_by uuid references public.profiles(user_id) on delete set null,
  correction_reason text,
  lock_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, exam_enrollment_id),
  foreign key (institution_id, exam_table_id) references public.exam_tables(institution_id, id) on delete restrict,
  foreign key (institution_id, exam_enrollment_id) references public.exam_enrollments(institution_id, id) on delete restrict,
  foreign key (institution_id, student_record_id) references public.student_records(institution_id, id) on delete restrict,
  check (result in ('approved', 'failed', 'absent')),
  check (written_grade is null or written_grade between 0 and 10),
  check (oral_grade is null or oral_grade between 0 and 10),
  check (final_grade is null or final_grade between 0 and 10),
  check (result <> 'absent' or (written_grade is null and oral_grade is null and final_grade is null)),
  check (result = 'absent' or final_grade is not null),
  check (result <> 'approved' or final_grade >= 4),
  check (result <> 'failed' or final_grade < 4),
  check (lock_version >= 1)
);

create index if not exists idx_exam_results_table
  on public.exam_results (institution_id, exam_table_id);

alter table public.exam_results enable row level security;
revoke all on public.exam_results from public, anon, authenticated;

-- Titular de la mesa: el DNI del titular publicado en la mesa o una titularidad activa de la materia.
-- Misma regla que get_exam_table_roster. Interna: sin EXECUTE para roles de la API.
create or replace function public.exam_table_caller_is_titular(
  p_institution_id uuid,
  p_workspace_key text,
  p_exam_table_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exam_tables exam_table
    join public.teacher_records teacher
      on teacher.institution_id = exam_table.institution_id
     and teacher.workspace_key = p_workspace_key
     and teacher.profile_id = (select auth.uid())
    where exam_table.institution_id = p_institution_id
      and exam_table.id = p_exam_table_id
      and regexp_replace(coalesce(teacher.dni, ''), '[^0-9]', '', 'g') <> ''
      and regexp_replace(coalesce(teacher.dni, ''), '[^0-9]', '', 'g') = coalesce(exam_table.metadata ->> 'titular_dni', '')
  )
  or exists (
    select 1
    from public.exam_table_subjects exam_subject
    join public.subject_teacher_assignments assignment
      on assignment.institution_id = exam_subject.institution_id
     and assignment.subject_id = exam_subject.legacy_subject_id
     and assignment.program_id = exam_subject.legacy_program_id
    where exam_subject.institution_id = p_institution_id
      and exam_subject.exam_table_id = p_exam_table_id
      and assignment.workspace_key = p_workspace_key
      and assignment.teacher_id = (select auth.uid())
      -- Gate Codex P1: el titular (tambien con una licencia futura o ya terminada), dentro de su vigencia.
      and assignment.role in ('titular', 'licencia')
      and public.academic_teacher_assignment_grants_access(assignment)
  );
$$;

revoke all on function public.exam_table_caller_is_titular(uuid, text, uuid) from public, anon, authenticated;

-- Guarda resultados del acta y, si target_close, la cierra. Una fila por inscripto:
-- { inscripcion_id, ausente, escrito, oral, nota }. Sin nota final se toma el promedio de escrito y oral.
-- Filas sin datos se ignoran (todavia no cargadas). Cerrar exige un resultado por cada inscripto.
create or replace function public.exam_save_acta_results(
  target_institution_id uuid,
  target_workspace_key text,
  target_exam_key text,
  target_results jsonb,
  target_close boolean default false,
  target_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  clean_exam_key text := lower(btrim(coalesce(target_exam_key, '')));
  clean_reason text := btrim(coalesce(target_reason, ''));
  is_staff boolean;
  table_row record;
  enrollment_row record;
  item jsonb;
  item_index integer := 0;
  raw_written text;
  raw_oral text;
  raw_final text;
  v_written numeric;
  v_oral numeric;
  v_final numeric;
  v_absent boolean;
  v_result text;
  existing_result public.exam_results%rowtype;
  v_grade_id uuid;
  v_attempt integer;
  saved_count integer := 0;
  pending_count integer;
  is_closed boolean;
begin
  if caller_id is null then
    raise exception 'Acceso denegado: se requiere una sesion autenticada.' using errcode = '28000';
  end if;
  if target_institution_id is null then
    raise exception 'Acceso denegado: solo el titular de la mesa carga el acta.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(target_results, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(target_results, '[]'::jsonb)) > 500 then
    raise exception 'EXAM_ACTA_RESULTS_INVALID' using errcode = '22023';
  end if;

  is_staff := public.is_super_admin()
    or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor']);

  select exam_table.* into table_row
  from public.exam_tables exam_table
  where exam_table.institution_id = target_institution_id
    and exam_table.workspace_key = clean_workspace_key
    and exam_table.legacy_exam_table_id = clean_exam_key
  for update;

  -- Mismo error si la mesa no existe: no se revela que mesas hay.
  if table_row.id is null
    or not (is_staff or (public.is_member_of_institution(target_institution_id)
      and public.exam_table_caller_is_titular(target_institution_id, clean_workspace_key, table_row.id))) then
    raise exception 'Acceso denegado: solo el titular de la mesa carga el acta.' using errcode = '42501';
  end if;
  if table_row.status = 'cancelled' then
    raise exception 'EXAM_TABLE_NOT_AVAILABLE' using errcode = '22023';
  end if;
  -- Se carga desde el dia del examen (hora argentina).
  if (timezone('America/Argentina/Buenos_Aires', now()))::date < (timezone('America/Argentina/Buenos_Aires', table_row.scheduled_starts_at))::date then
    raise exception 'EXAM_NOT_TAKEN_YET' using errcode = '22023';
  end if;

  is_closed := table_row.status = 'completed';
  if is_closed and not is_staff then
    raise exception 'EXAM_ACTA_CLOSED' using errcode = '22023';
  end if;
  if is_closed and length(clean_reason) < 5 then
    raise exception 'EXAM_ACTA_CORRECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(coalesce(target_results, '[]'::jsonb)) loop
    item_index := item_index + 1;
    if jsonb_typeof(item) <> 'object' then
      raise exception 'EXAM_ACTA_RESULTS_INVALID' using errcode = '22023';
    end if;

    select enrollment.* into enrollment_row
    from public.exam_enrollments enrollment
    where enrollment.institution_id = target_institution_id
      and enrollment.exam_table_id = table_row.id
      and enrollment.status = 'registered'
      and enrollment.id::text = btrim(coalesce(item ->> 'inscripcion_id', ''))
    for update;
    if enrollment_row.id is null then
      raise exception 'EXAM_ACTA_ENROLLMENT_NOT_FOUND' using errcode = '22023';
    end if;

    v_absent := coalesce((item ->> 'ausente')::boolean, false);
    raw_written := replace(btrim(coalesce(item ->> 'escrito', '')), ',', '.');
    raw_oral := replace(btrim(coalesce(item ->> 'oral', '')), ',', '.');
    raw_final := replace(btrim(coalesce(item ->> 'nota', '')), ',', '.');
    if (raw_written <> '' and raw_written !~ '^[0-9]{1,2}(\.[0-9]{1,2})?$')
      or (raw_oral <> '' and raw_oral !~ '^[0-9]{1,2}(\.[0-9]{1,2})?$')
      or (raw_final <> '' and raw_final !~ '^[0-9]{1,2}(\.[0-9]{1,2})?$') then
      raise exception 'EXAM_ACTA_GRADE_INVALID' using errcode = '22023';
    end if;
    v_written := nullif(raw_written, '')::numeric;
    v_oral := nullif(raw_oral, '')::numeric;
    v_final := nullif(raw_final, '')::numeric;
    if greatest(coalesce(v_written, 0), coalesce(v_oral, 0), coalesce(v_final, 0)) > 10 then
      raise exception 'EXAM_ACTA_GRADE_INVALID' using errcode = '22023';
    end if;
    if v_absent and (v_written is not null or v_oral is not null or v_final is not null) then
      raise exception 'EXAM_ACTA_ABSENT_WITH_GRADE' using errcode = '22023';
    end if;

    if v_absent then
      v_result := 'absent';
    else
      if v_final is null and (v_written is not null or v_oral is not null) then
        v_final := round((coalesce(v_written, 0) + coalesce(v_oral, 0)) / ((v_written is not null)::int + (v_oral is not null)::int), 2);
      end if;
      if v_final is null then
        -- Fila sin datos: todavia no cargada.
        continue;
      end if;
      v_result := case when v_final >= 4 then 'approved' else 'failed' end;
    end if;

    select * into existing_result
    from public.exam_results result
    where result.institution_id = target_institution_id
      and result.exam_enrollment_id = enrollment_row.id
    for update;

    -- Solo el aprobado vive en student_grades: es lo que leen correlativas y el estado de la materia.
    -- Mismo lock que el docente y la historia importada (AUD.I2a P1).
    perform public.academic_lock_student_subject(target_institution_id, clean_workspace_key, enrollment_row.student_id, enrollment_row.subject_id, enrollment_row.program_id);
    v_grade_id := existing_result.student_grade_id;
    if v_result = 'approved' then
      if v_grade_id is not null and exists (
        select 1 from public.student_grades grade where grade.id = v_grade_id and grade.deleted_at is null
      ) then
        update public.student_grades grade
        set grade_value = v_final,
            grade_label = v_final::text,
            academic_status = 'approved',
            teacher_id = caller_id,
            lock_version = grade.lock_version + 1
        where grade.id = v_grade_id;
      else
        select coalesce(max(grade.attempt_number), 0) + 1 into v_attempt
        from public.student_grades grade
        where grade.institution_id = target_institution_id
          and grade.workspace_key = clean_workspace_key
          and grade.student_id = enrollment_row.student_id
          and grade.subject_id = enrollment_row.subject_id
          and grade.program_id = enrollment_row.program_id
          and grade.grade_type = 'final_exam'
          and grade.deleted_at is null;
        insert into public.student_grades (
          institution_id, workspace_key, student_id, student_record_id, exam_enrollment_id, subject_id, program_id,
          teacher_id, grade_type, attempt_number, grade_value, grade_label, grade_scale, academic_status,
          observations, grading_period
        ) values (
          target_institution_id, clean_workspace_key, enrollment_row.student_id, enrollment_row.student_record_id, enrollment_row.id,
          enrollment_row.subject_id, enrollment_row.program_id, caller_id, 'final_exam', v_attempt, v_final, v_final::text,
          'numeric_0_10', 'approved', coalesce(table_row.exam_call_label, ''),
          to_char(timezone('America/Argentina/Buenos_Aires', table_row.scheduled_starts_at), 'YYYY-MM-DD')
        )
        returning id into v_grade_id;
      end if;
    elsif v_grade_id is not null then
      -- Corregido de aprobado a desaprobado o ausente: la aprobacion deja de valer.
      update public.student_grades grade
      set deleted_at = timezone('utc', now()), lock_version = grade.lock_version + 1
      where grade.id = v_grade_id and grade.deleted_at is null;
      v_grade_id := null;
    end if;

    insert into public.exam_results (
      institution_id, workspace_key, exam_table_id, exam_enrollment_id, student_id, student_record_id, subject_id, program_id,
      written_grade, oral_grade, final_grade, result, student_grade_id, recorded_by, corrected_by, correction_reason
    ) values (
      target_institution_id, clean_workspace_key, table_row.id, enrollment_row.id, enrollment_row.student_id, enrollment_row.student_record_id,
      enrollment_row.subject_id, enrollment_row.program_id, v_written, v_oral, v_final, v_result, v_grade_id, caller_id,
      case when is_closed then caller_id end, case when is_closed then clean_reason end
    )
    on conflict (institution_id, exam_enrollment_id) do update set
      written_grade = excluded.written_grade,
      oral_grade = excluded.oral_grade,
      final_grade = excluded.final_grade,
      result = excluded.result,
      student_grade_id = excluded.student_grade_id,
      recorded_by = case when is_closed then public.exam_results.recorded_by else excluded.recorded_by end,
      corrected_by = excluded.corrected_by,
      correction_reason = excluded.correction_reason,
      lock_version = public.exam_results.lock_version + 1,
      updated_at = timezone('utc', now());
    saved_count := saved_count + 1;
  end loop;

  if is_closed and saved_count > 0 then
    insert into public.exam_table_events (institution_id, exam_table_id, event_type, actor_user_id, reason_code, metadata)
    values (target_institution_id, table_row.id, 'corrected', caller_id, 'acta_correction', jsonb_build_object('reason', clean_reason, 'results', saved_count));
  end if;

  if coalesce(target_close, false) and not is_closed then
    select count(*) into pending_count
    from public.exam_enrollments enrollment
    where enrollment.institution_id = target_institution_id
      and enrollment.exam_table_id = table_row.id
      and enrollment.status = 'registered'
      and not exists (
        select 1 from public.exam_results result
        where result.institution_id = enrollment.institution_id and result.exam_enrollment_id = enrollment.id
      );
    if pending_count > 0 then
      raise exception 'EXAM_ACTA_INCOMPLETE' using errcode = '22023', detail = pending_count::text;
    end if;
    update public.exam_tables exam_table
    set status = 'completed',
        metadata = exam_table.metadata || jsonb_build_object('acta_closed_at', timezone('utc', now()), 'acta_closed_by', caller_id),
        updated_by = caller_id,
        updated_at = timezone('utc', now()),
        lock_version = exam_table.lock_version + 1
    where exam_table.id = table_row.id;
    insert into public.exam_table_events (institution_id, exam_table_id, event_type, actor_user_id, reason_code, metadata)
    values (target_institution_id, table_row.id, 'completed', caller_id, 'acta_closed', jsonb_build_object('results', saved_count));
    is_closed := true;
  end if;

  return jsonb_build_object('guardados', saved_count, 'acta_cerrada', is_closed);
end;
$$;

revoke execute on function public.exam_save_acta_results(uuid, text, text, jsonb, boolean, text) from public, anon;
grant execute on function public.exam_save_acta_results(uuid, text, text, jsonb, boolean, text) to authenticated;

-- F1b: ausentes del propio alumno en actas de examen, para que el portal explique la mesa castigo antes
-- de que intente inscribirse (espejo de exam_enrollment_assert_eligible). Solo filas del que llama.
create or replace function public.get_student_exam_absences(
  target_institution_id uuid,
  target_workspace_key text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', exam_result.id,
    'subject_id', exam_result.subject_id,
    'program_id', exam_result.program_id,
    'student_record_id', exam_result.student_record_id,
    'absent_at', absent_table.scheduled_starts_at,
    'exam_period_key', absent_table.exam_period_key,
    'exam_call_key', absent_table.exam_call_key
  ) order by absent_table.scheduled_starts_at), '[]'::jsonb)
  from public.exam_results exam_result
  join public.exam_tables absent_table
    on absent_table.institution_id = exam_result.institution_id
   and absent_table.id = exam_result.exam_table_id
  where (select auth.uid()) is not null
    and exam_result.institution_id = target_institution_id
    and exam_result.workspace_key = coalesce(nullif(btrim(target_workspace_key), ''), 'main')
    and exam_result.student_id = (select auth.uid())
    and exam_result.result = 'absent'
    and public.is_member_of_institution(target_institution_id);
$$;

revoke execute on function public.get_student_exam_absences(uuid, text) from public, anon;
grant execute on function public.get_student_exam_absences(uuid, text) to authenticated;
