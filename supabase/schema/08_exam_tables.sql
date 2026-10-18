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
  latest_academic_status text;
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
    select grade.academic_status
    into latest_academic_status
    from public.student_grades grade
    where grade.institution_id = target_institution_id
      and grade.workspace_key = clean_workspace_key
      and grade.deleted_at is null
      and grade.student_record_id = target_student_record_id
      and grade.student_id = target_student_id
      and grade.subject_id = clean_subject_id
      and grade.program_id = clean_program_id
      and grade.academic_status <> 'pending'
    order by grade.updated_at desc nulls last, grade.created_at desc nulls last
    limit 1;

    if latest_academic_status is distinct from 'regular' then
      raise exception 'EXAM_REGULARITY_REQUIRED';
    end if;

    if exists (
      select 1
      from public.student_financial_status financial_status
      where financial_status.institution_id = target_institution_id
        and financial_status.workspace_key = clean_workspace_key
        and financial_status.student_record_id = target_student_record_id
        and financial_status.adeuda_cuota = true
    ) then
      raise exception 'EXAM_FINANCIAL_DEBT_BLOCK';
    end if;

    if exists (
      select 1
      from public.exam_absence_penalties penalty
      where penalty.institution_id = target_institution_id
        and penalty.workspace_key = clean_workspace_key
        and penalty.student_record_id = target_student_record_id
        and penalty.subject_id = clean_subject_id
        and penalty.program_id = clean_program_id
        and penalty.status in ('active', 'pending_review')
        and penalty.absent_at <= exam_context.scheduled_starts_at
        and (
          penalty.status = 'pending_review'
          or (
            penalty.scope_type = 'next_exam_call_for_subject'
            and penalty.blocked_exam_period_key = exam_context.exam_period_key
            and penalty.blocked_exam_call_key = exam_context.exam_call_key
            and exam_context.scheduled_starts_at >= penalty.penalty_from
            and (penalty.penalty_until is null or exam_context.scheduled_starts_at <= penalty.penalty_until)
          )
          or (
            penalty.scope_type = 'specific_exam_table_subject'
            and penalty.blocked_exam_table_subject_id = exam_context.exam_table_subject_id
            and exam_context.scheduled_starts_at >= penalty.penalty_from
            and (penalty.penalty_until is null or exam_context.scheduled_starts_at <= penalty.penalty_until)
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
        where grade.institution_id = target_institution_id
          and grade.workspace_key = clean_workspace_key
          and grade.deleted_at is null
          and grade.student_record_id = target_student_record_id
          and grade.student_id = target_student_id
          and grade.subject_id = prerequisite_subject.code
          and (
            grade.program_id = prerequisite_career.name
            or grade.program_id = prerequisite_career.external_code
          )
          and grade.academic_status <> 'pending'
        order by grade.updated_at desc nulls last, grade.created_at desc nulls last
        limit 1
      ) latest_prerequisite_grade on true
      where prerequisite.institution_id = target_institution_id
        and prerequisite.target_plan_subject_id = exam_context.study_plan_subject_id
        and prerequisite.status = 'active'
        and prerequisite.applies_to in ('exam', 'enrollment_and_exam')
        and (
          latest_prerequisite_grade.academic_status is null
          or latest_prerequisite_grade.academic_status not in ('approved', 'promocionado')
        )
    ) then
      raise exception 'EXAM_PREREQUISITES_NOT_MET';
    end if;

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
-- Claves: legacy_snapshot_id = id publicado ("exam-engine-v21-<mesa>-<fecha>", el que manda el alumno);
-- legacy_exam_table_id = id sin prefijo ni fecha (el que cruza 05). Una mesa que ya no esta en el
-- cronograma se cancela, salvo que tenga inscriptos: entonces se conserva y se informa.
create or replace function public.publish_exam_tables_from_schedule(
  target_institution_id uuid,
  target_workspace_key text,
  target_mesas jsonb,
  target_enrollment_opens_at timestamptz default null,
  target_close_hours_before integer default 48
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_workspace_key text := coalesce(nullif(btrim(target_workspace_key), ''), 'main');
  opens_at timestamptz := coalesce(target_enrollment_opens_at, timezone('utc', now()));
  close_hours integer := greatest(coalesce(target_close_hours_before, 48), 0);
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
  primary_plan_subject record;
  published_ids text[] := array[]::text[];
  created_count integer := 0;
  updated_count integer := 0;
  skipped jsonb := '[]'::jsonb;
  cancelled_count integer := 0;
  kept jsonb := '[]'::jsonb;
  stale record;
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
    legacy_key := regexp_replace(regexp_replace(lower(published_id), '^exam-engine-v21-', ''), '-[0-9]{4}-[0-9]{2}-[0-9]{2}$', '');
    subject_code := btrim(coalesce(mesa ->> 'materia', mesa ->> 'codigo', ''));
    career_text := btrim(coalesce(mesa ->> 'carrera', ''));
    exam_date := btrim(coalesce(mesa ->> 'fechaIso', mesa ->> 'fechaSugerida', ''));
    start_time := coalesce(nullif(btrim(coalesce(mesa ->> 'inicio', '')), ''), '08:00');
    end_time := nullif(btrim(coalesce(mesa ->> 'fin', '')), '');

    if published_id = '' or legacy_key = '' or subject_code = '' or career_text = '' then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', 'Faltan id, materia o carrera.');
      continue;
    end if;
    if exam_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or start_time !~ '^[0-9]{1,2}:[0-9]{2}' or (end_time is not null and end_time !~ '^[0-9]{1,2}:[0-9]{2}') then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', 'Fecha u hora invalida.');
      continue;
    end if;

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

    starts_at := (exam_date || ' ' || start_time)::timestamp at time zone 'America/Argentina/Buenos_Aires';
    ends_at := case when end_time is null then null else (exam_date || ' ' || end_time)::timestamp at time zone 'America/Argentina/Buenos_Aires' end;
    if ends_at is not null and ends_at <= starts_at then
      ends_at := null;
    end if;
    closes_at := starts_at - make_interval(hours => close_hours);
    if closes_at <= opens_at then
      closes_at := starts_at;
    end if;
    if closes_at <= opens_at then
      skipped := skipped || jsonb_build_object('id', published_id, 'motivo', 'La mesa ya paso: no se abre inscripcion.');
      continue;
    end if;

    call_key := coalesce(nullif(btrim(coalesce(mesa ->> 'exam_call', '')), ''), 'first');

    select exam_table.id into table_id
    from public.exam_tables exam_table
    where exam_table.institution_id = target_institution_id
      and exam_table.workspace_key = clean_workspace_key
      and exam_table.legacy_exam_table_id = legacy_key
    for update;

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
        jsonb_build_object('inscription_mode', coalesce(nullif(mesa ->> 'inscription_mode', ''), 'student_self_service'), 'published_by', 'publish_exam_tables_from_schedule'),
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
