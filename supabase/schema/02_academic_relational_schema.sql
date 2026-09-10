create table if not exists public.careers (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  external_code text not null,
  name text not null,
  duration_years smallint,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, external_code),
  unique (institution_id, id),
  check (duration_years is null or duration_years between 1 and 12),
  check (status in ('active', 'inactive'))
);

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  career_id uuid not null,
  external_code text not null,
  name text not null,
  plan_year smallint,
  resolution text,
  status text not null default 'active',
  valid_from date,
  valid_until date,
  coexist_with_plan_id uuid,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, external_code),
  unique (institution_id, id),
  foreign key (institution_id, career_id) references public.careers(institution_id, id) on delete restrict,
  foreign key (institution_id, coexist_with_plan_id) references public.study_plans(institution_id, id) on delete restrict,
  check (status in ('active', 'closed', 'draft')),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  external_id text,
  code text not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, code),
  unique (institution_id, id)
);

create table if not exists public.study_plan_subjects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  plan_id uuid not null,
  subject_id uuid not null,
  year_number smallint,
  term_number smallint,
  regime text,
  training_field text,
  format text,
  exam_required boolean not null default false,
  exam_type text,
  exam_group text,
  related_subject_codes text,
  print_order integer,
  valid_from date,
  valid_until date,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, plan_id, subject_id),
  unique (institution_id, id),
  foreign key (institution_id, plan_id) references public.study_plans(institution_id, id) on delete cascade,
  foreign key (institution_id, subject_id) references public.subjects(institution_id, id) on delete restrict,
  check (year_number is null or year_number between 1 and 12),
  check (term_number is null or term_number between 1 and 4),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.study_plan_subjects'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.study_plan_subjects'::regclass and attname = 'institution_id'),
        (select attnum from pg_attribute where attrelid = 'public.study_plan_subjects'::regclass and attname = 'id')
      ]::smallint[]
  ) then
    alter table public.study_plan_subjects
      add constraint study_plan_subjects_institution_id_id_key unique (institution_id, id);
  end if;
end $$;

create table if not exists public.subject_prerequisites (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  target_plan_subject_id uuid not null,
  prerequisite_plan_subject_id uuid not null,
  prerequisite_type text not null default 'subject',
  required_condition text not null,
  logic_group integer not null default 1,
  applies_to text not null default 'enrollment_and_exam',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, target_plan_subject_id, prerequisite_plan_subject_id, prerequisite_type, applies_to),
  foreign key (institution_id, target_plan_subject_id) references public.study_plan_subjects(institution_id, id) on delete cascade,
  foreign key (institution_id, prerequisite_plan_subject_id) references public.study_plan_subjects(institution_id, id) on delete restrict,
  check (target_plan_subject_id <> prerequisite_plan_subject_id),
  check (required_condition in ('enrolled', 'regular', 'approved')),
  check (applies_to in ('enrollment', 'exam', 'enrollment_and_exam')),
  check (status in ('active', 'inactive'))
);

create table if not exists public.plan_equivalences (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  source_plan_subject_id uuid not null,
  target_plan_subject_id uuid not null,
  equivalence_type text not null,
  scope text,
  resolution_required boolean not null default false,
  status text not null default 'active',
  valid_from date,
  valid_until date,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, source_plan_subject_id, target_plan_subject_id),
  foreign key (institution_id, source_plan_subject_id) references public.study_plan_subjects(institution_id, id) on delete restrict,
  foreign key (institution_id, target_plan_subject_id) references public.study_plan_subjects(institution_id, id) on delete restrict,
  check (source_plan_subject_id <> target_plan_subject_id),
  check (status in ('active', 'inactive')),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table if not exists public.teacher_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  external_code text not null,
  first_name text not null,
  last_name text not null,
  national_id text,
  email text,
  phone text,
  status text not null default 'active',
  teaching_hours numeric(6,2),
  specialty text,
  suitability_families text,
  explicit_academic_suitability boolean,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, external_code),
  unique (institution_id, id),
  check (status in ('active', 'inactive')),
  check (teaching_hours is null or teaching_hours >= 0)
);

create table if not exists public.teacher_subject_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  plan_subject_id uuid not null,
  teacher_id uuid not null,
  role text,
  status text not null default 'active',
  valid_from date,
  valid_until date,
  replaced_teacher_id uuid,
  exam_required boolean,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique nulls not distinct (institution_id, plan_subject_id, teacher_id, valid_from),
  foreign key (institution_id, plan_subject_id) references public.study_plan_subjects(institution_id, id) on delete cascade,
  foreign key (institution_id, teacher_id) references public.teacher_records(institution_id, id) on delete restrict,
  foreign key (institution_id, replaced_teacher_id) references public.teacher_records(institution_id, id) on delete restrict,
  check (status in ('active', 'inactive')),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table if not exists public.course_schedules (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  plan_subject_id uuid not null,
  teacher_id uuid not null,
  weekday smallint not null,
  starts_at time not null,
  ends_at time not null,
  modality text,
  campus text,
  commission text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, plan_subject_id, teacher_id, weekday, starts_at, ends_at),
  foreign key (institution_id, plan_subject_id) references public.study_plan_subjects(institution_id, id) on delete cascade,
  foreign key (institution_id, teacher_id) references public.teacher_records(institution_id, id) on delete restrict,
  check (weekday between 1 and 7),
  check (ends_at > starts_at)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.course_schedules'::regclass
      and conname = 'course_schedules_import_key'
  ) then
    alter table public.course_schedules
      add constraint course_schedules_import_key
      unique (institution_id, plan_subject_id, teacher_id, weekday, starts_at, ends_at);
  end if;
end $$;

create table if not exists public.student_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  external_code text not null,
  first_name text not null,
  last_name text not null,
  national_id text,
  email text,
  phone text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, external_code),
  unique (institution_id, id),
  check (status in ('active', 'inactive'))
);

-- ============================================================
-- Compatibilidad de padrones con la UI actual
--
-- La UI guarda/lee padrones normalizados desde `workspace_snapshots`
-- usando columnas legacy-operativas (`workspace_key`, `full_name`,
-- `dni`, `login_email`, etc.). El schema relacional conserva sus
-- columnas canonicas (`external_code`, `national_id`, `email`) y
-- agrega estos campos para no romper los servicios actuales.
-- ============================================================

alter table public.teacher_records
  add column if not exists workspace_key text,
  add column if not exists profile_id uuid,
  add column if not exists login_email text,
  add column if not exists full_name text,
  add column if not exists dni text,
  add column if not exists raw_payload jsonb,
  add column if not exists updated_at timestamptz;

alter table public.student_records
  add column if not exists workspace_key text,
  add column if not exists profile_id uuid,
  add column if not exists full_name text,
  add column if not exists career text,
  add column if not exists academic_year text,
  add column if not exists dni text,
  add column if not exists legajo text,
  add column if not exists raw_payload jsonb,
  add column if not exists updated_at timestamptz;

alter table public.teacher_records
  alter column workspace_key set default 'main',
  alter column external_code set default gen_random_uuid()::text,
  alter column first_name set default '',
  alter column last_name set default '',
  alter column status set default 'active',
  alter column raw_payload set default '{}'::jsonb,
  alter column updated_at set default timezone('utc', now());

alter table public.student_records
  alter column workspace_key set default 'main',
  alter column external_code set default gen_random_uuid()::text,
  alter column first_name set default '',
  alter column last_name set default '',
  alter column career set default '',
  alter column academic_year set default '',
  alter column legajo set default '',
  alter column status set default 'active',
  alter column raw_payload set default '{}'::jsonb,
  alter column updated_at set default timezone('utc', now());

update public.teacher_records
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  full_name = coalesce(
    nullif(btrim(full_name), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))), ''),
    nullif(btrim(email), ''),
    external_code,
    id::text
  ),
  dni = nullif(btrim(coalesce(nullif(btrim(dni), ''), nullif(btrim(national_id), ''), '')), ''),
  national_id = nullif(btrim(coalesce(nullif(btrim(national_id), ''), nullif(btrim(dni), ''), '')), ''),
  login_email = nullif(lower(btrim(coalesce(nullif(btrim(login_email), ''), nullif(btrim(email), ''), ''))), ''),
  email = nullif(lower(btrim(coalesce(nullif(btrim(email), ''), nullif(btrim(login_email), ''), ''))), ''),
  status = coalesce(nullif(btrim(status), ''), 'active'),
  raw_payload = coalesce(raw_payload, '{}'::jsonb),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where
  workspace_key is null
  or btrim(workspace_key) = ''
  or full_name is null
  or btrim(full_name) = ''
  or (dni is null and national_id is not null)
  or (national_id is null and dni is not null)
  or (login_email is null and email is not null)
  or btrim(coalesce(status, '')) = ''
  or raw_payload is null
  or updated_at is null;

update public.student_records
set
  workspace_key = coalesce(nullif(btrim(workspace_key), ''), 'main'),
  full_name = coalesce(
    nullif(btrim(full_name), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))), ''),
    nullif(btrim(email), ''),
    external_code,
    id::text
  ),
  dni = nullif(btrim(coalesce(nullif(btrim(dni), ''), nullif(btrim(national_id), ''), '')), ''),
  national_id = nullif(btrim(coalesce(nullif(btrim(national_id), ''), nullif(btrim(dni), ''), '')), ''),
  email = nullif(lower(btrim(coalesce(nullif(btrim(email), ''), ''))), ''),
  career = btrim(coalesce(career, '')),
  academic_year = btrim(coalesce(academic_year, '')),
  legajo = btrim(coalesce(legajo, '')),
  status = coalesce(nullif(btrim(status), ''), 'active'),
  raw_payload = coalesce(raw_payload, '{}'::jsonb),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where
  workspace_key is null
  or btrim(workspace_key) = ''
  or full_name is null
  or btrim(full_name) = ''
  or (dni is null and national_id is not null)
  or (national_id is null and dni is not null)
  or email <> lower(email)
  or career is null
  or academic_year is null
  or btrim(coalesce(status, '')) = ''
  or raw_payload is null
  or updated_at is null;

alter table public.teacher_records
  alter column workspace_key set not null,
  alter column full_name set not null,
  alter column raw_payload set not null,
  alter column updated_at set not null;

alter table public.student_records
  alter column workspace_key set not null,
  alter column full_name set not null,
  alter column career set not null,
  alter column academic_year set not null,
  alter column legajo set not null,
  alter column raw_payload set not null,
  alter column updated_at set not null;

alter table public.teacher_records
  drop constraint if exists teacher_records_status_check;

alter table public.teacher_records
  add constraint teacher_records_status_check
  check (btrim(status) <> '');

alter table public.student_records
  drop constraint if exists student_records_status_check;

alter table public.student_records
  add constraint student_records_status_check
  check (btrim(status) <> '');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.teacher_records'::regclass
      and conname = 'teacher_records_profile_id_fkey'
  ) then
    alter table public.teacher_records
      add constraint teacher_records_profile_id_fkey
      foreign key (profile_id) references public.profiles(user_id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.student_records'::regclass
      and conname = 'student_records_profile_id_fkey'
  ) then
    alter table public.student_records
      add constraint student_records_profile_id_fkey
      foreign key (profile_id) references public.profiles(user_id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.teacher_records'::regclass
      and conname = 'teacher_records_workspace_dni_key'
  ) then
    alter table public.teacher_records
      add constraint teacher_records_workspace_dni_key
      unique (institution_id, workspace_key, dni);
  end if;

end $$;

create or replace function public.sync_teacher_record_ui_compat_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  computed_full_name text;
begin
  new.workspace_key := coalesce(nullif(btrim(new.workspace_key), ''), 'main');
  new.external_code := coalesce(nullif(btrim(new.external_code), ''), gen_random_uuid()::text);

  computed_full_name := coalesce(
    nullif(btrim(new.full_name), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(new.first_name), ''), nullif(btrim(new.last_name), ''))), '')
  );
  new.full_name := coalesce(
    computed_full_name,
    nullif(btrim(new.login_email), ''),
    nullif(btrim(new.email), ''),
    new.external_code
  );

  if nullif(btrim(new.first_name), '') is null then
    new.first_name := new.full_name;
  end if;

  if new.last_name is null then
    new.last_name := '';
  end if;

  new.dni := nullif(btrim(coalesce(nullif(btrim(new.dni), ''), nullif(btrim(new.national_id), ''), '')), '');
  new.national_id := nullif(btrim(coalesce(nullif(btrim(new.national_id), ''), new.dni, '')), '');
  new.login_email := nullif(lower(btrim(coalesce(nullif(btrim(new.login_email), ''), nullif(btrim(new.email), ''), ''))), '');
  new.email := nullif(lower(btrim(coalesce(nullif(btrim(new.email), ''), new.login_email, ''))), '');
  new.status := coalesce(nullif(btrim(new.status), ''), 'active');
  new.raw_payload := coalesce(new.raw_payload, '{}'::jsonb);
  new.updated_at := timezone('utc', now());

  return new;
end;
$$;

create or replace function public.sync_student_record_ui_compat_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  computed_full_name text;
begin
  new.workspace_key := coalesce(nullif(btrim(new.workspace_key), ''), 'main');
  new.external_code := coalesce(nullif(btrim(new.external_code), ''), gen_random_uuid()::text);

  computed_full_name := coalesce(
    nullif(btrim(new.full_name), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(new.first_name), ''), nullif(btrim(new.last_name), ''))), '')
  );
  new.full_name := coalesce(
    computed_full_name,
    nullif(btrim(new.email), ''),
    new.external_code
  );

  if nullif(btrim(new.first_name), '') is null then
    new.first_name := new.full_name;
  end if;

  if new.last_name is null then
    new.last_name := '';
  end if;

  new.dni := nullif(btrim(coalesce(nullif(btrim(new.dni), ''), nullif(btrim(new.national_id), ''), '')), '');
  new.national_id := nullif(btrim(coalesce(nullif(btrim(new.national_id), ''), new.dni, '')), '');
  new.email := nullif(lower(btrim(coalesce(nullif(btrim(new.email), ''), ''))), '');
  new.career := btrim(coalesce(new.career, ''));
  new.academic_year := btrim(coalesce(new.academic_year, ''));
  new.legajo := btrim(coalesce(new.legajo, ''));
  new.status := coalesce(nullif(btrim(new.status), ''), 'active');
  new.raw_payload := coalesce(new.raw_payload, '{}'::jsonb);
  new.updated_at := timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists sync_teacher_record_ui_compat_fields on public.teacher_records;

create trigger sync_teacher_record_ui_compat_fields
before insert or update on public.teacher_records
for each row execute function public.sync_teacher_record_ui_compat_fields();

drop trigger if exists sync_student_record_ui_compat_fields on public.student_records;

create trigger sync_student_record_ui_compat_fields
before insert or update on public.student_records
for each row execute function public.sync_student_record_ui_compat_fields();

revoke execute on function public.sync_teacher_record_ui_compat_fields() from public, anon, authenticated;
revoke execute on function public.sync_student_record_ui_compat_fields() from public, anon, authenticated;

create table if not exists public.student_career_plans (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
    student_id uuid not null,
    career_id uuid not null,
    plan_id uuid not null,
  cohort text,
  entry_year smallint,
  current_year smallint,
  status text not null default 'active',
  valid_from date,
  valid_until date,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (institution_id, student_id, plan_id),
  unique (institution_id, id),
    foreign key (institution_id, student_id) references public.student_records(institution_id, id) on delete cascade,
    foreign key (institution_id, career_id) references public.careers(institution_id, id) on delete restrict,
    foreign key (institution_id, plan_id) references public.study_plans(institution_id, id) on delete restrict,
  check (status in ('active', 'paused', 'completed', 'withdrawn', 'transferred', 'invalidated')),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table if not exists public.student_academic_statuses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_career_plan_id uuid not null,
  plan_subject_id uuid not null,
  condition text not null,
  regularity_valid boolean,
  regularity_date date,
  approval_date date,
  grade numeric(5,2),
  notes text,
  recorded_at timestamptz not null default timezone('utc', now()),
  foreign key (institution_id, student_career_plan_id) references public.student_career_plans(institution_id, id) on delete cascade,
  foreign key (institution_id, plan_subject_id) references public.study_plan_subjects(institution_id, id) on delete restrict,
  check (condition in ('pending', 'enrolled', 'regular', 'approved', 'failed', 'free', 'promoted')),
  check (grade is null or grade between 0 and 10)
);

update public.student_records
set
  career = coalesce(
    nullif(btrim(career), ''),
    (
      select careers.name
      from public.student_career_plans student_plan
      join public.careers careers on careers.institution_id = student_plan.institution_id
        and careers.id = student_plan.career_id
      where student_plan.institution_id = public.student_records.institution_id
        and student_plan.student_id = public.student_records.id
        and student_plan.status = 'active'
      order by student_plan.created_at desc
      limit 1
    ),
    ''
  ),
  academic_year = coalesce(
    nullif(btrim(academic_year), ''),
    (
      select student_plan.current_year::text
      from public.student_career_plans student_plan
      where student_plan.institution_id = public.student_records.institution_id
        and student_plan.student_id = public.student_records.id
        and student_plan.status = 'active'
      order by student_plan.created_at desc
      limit 1
    ),
    ''
  )
where
  career is null
  or btrim(career) = ''
  or academic_year is null
  or btrim(academic_year) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.student_records'::regclass
      and conname = 'student_records_workspace_email_career_key'
  ) then
    -- Si esta constraint falla por duplicados reales, ejecutar antes:
    -- supabase/docs/repair_02_student_records_duplicate_upsert_keys.sql
    alter table public.student_records
      add constraint student_records_workspace_email_career_key
      unique (institution_id, workspace_key, email, career);
  end if;
end $$;

create index if not exists idx_careers_institution on public.careers (institution_id, name);
create index if not exists idx_plans_career on public.study_plans (institution_id, career_id, status);
create index if not exists idx_study_plans_coexist_with_plan on public.study_plans (institution_id, coexist_with_plan_id) where coexist_with_plan_id is not null;
create index if not exists idx_plan_subjects_plan on public.study_plan_subjects (institution_id, plan_id, print_order);
create index if not exists idx_study_plan_subjects_subject on public.study_plan_subjects (institution_id, subject_id);
create index if not exists idx_prerequisites_target on public.subject_prerequisites (institution_id, target_plan_subject_id);
create index if not exists idx_subject_prerequisites_prerequisite on public.subject_prerequisites (institution_id, prerequisite_plan_subject_id);
create index if not exists idx_equivalences_source on public.plan_equivalences (institution_id, source_plan_subject_id);
create index if not exists idx_plan_equivalences_target on public.plan_equivalences (institution_id, target_plan_subject_id);
create index if not exists idx_teacher_assignments_subject on public.teacher_subject_assignments (institution_id, plan_subject_id, status);
create index if not exists idx_teacher_subject_assignments_teacher on public.teacher_subject_assignments (institution_id, teacher_id);
create index if not exists idx_teacher_subject_assignments_replaced_teacher on public.teacher_subject_assignments (institution_id, replaced_teacher_id) where replaced_teacher_id is not null;
create index if not exists idx_schedules_subject on public.course_schedules (institution_id, plan_subject_id, weekday);
create index if not exists idx_course_schedules_teacher on public.course_schedules (institution_id, teacher_id);
create index if not exists idx_students_institution on public.student_records (institution_id, last_name, first_name);
create index if not exists idx_student_plans_student on public.student_career_plans (institution_id, student_id, status);
create index if not exists idx_student_career_plans_career on public.student_career_plans (institution_id, career_id);
create index if not exists idx_student_career_plans_plan on public.student_career_plans (institution_id, plan_id);
create index if not exists idx_academic_status_student on public.student_academic_statuses (institution_id, student_career_plan_id, plan_subject_id, recorded_at desc);
<<<<<<< HEAD
create index if not exists idx_student_academic_statuses_plan_subject on public.student_academic_statuses (institution_id, plan_subject_id);

grant select on table
  public.careers,
  public.study_plans,
  public.subjects,
  public.study_plan_subjects,
  public.subject_prerequisites,
  public.plan_equivalences,
  public.teacher_records,
  public.teacher_subject_assignments,
  public.course_schedules,
  public.student_records,
  public.student_career_plans,
  public.student_academic_statuses
to authenticated;
=======
create index if not exists idx_teacher_records_workspace_full_name on public.teacher_records (institution_id, workspace_key, full_name);
create index if not exists idx_teacher_records_workspace_login_email on public.teacher_records (institution_id, workspace_key, login_email);
create index if not exists idx_teacher_records_profile_id on public.teacher_records (profile_id) where profile_id is not null;
create index if not exists idx_student_records_workspace_full_name on public.student_records (institution_id, workspace_key, career, full_name);
create index if not exists idx_student_records_workspace_email on public.student_records (institution_id, workspace_key, email);
create index if not exists idx_student_records_profile_id on public.student_records (profile_id) where profile_id is not null;
>>>>>>> 9ff66de244baf6061807125c68219a731cfa7be8

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'careers',
    'study_plans',
    'subjects',
    'study_plan_subjects',
    'subject_prerequisites',
    'plan_equivalences',
    'teacher_records',
    'teacher_subject_assignments',
    'course_schedules',
    'student_records',
    'student_career_plans',
    'student_academic_statuses'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'careers',
    'study_plans',
    'subjects',
    'study_plan_subjects',
    'subject_prerequisites',
    'plan_equivalences',
    'teacher_records',
    'teacher_subject_assignments',
    'course_schedules',
    'student_records',
    'student_career_plans',
    'student_academic_statuses'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || ' members read', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_super_admin() or public.is_member_of_institution(institution_id))', table_name || ' members read', table_name);
  end loop;
end $$;
<<<<<<< HEAD
=======

drop policy if exists "teacher_records editors manage" on public.teacher_records;
drop policy if exists "student_records editors manage" on public.student_records;

create policy "teacher_records editors manage"
on public.teacher_records
for all
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']))
with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));

create policy "student_records editors manage"
on public.student_records
for all
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']))
with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));

grant select, insert, update, delete on public.teacher_records to authenticated;
grant select, insert, update, delete on public.student_records to authenticated;
>>>>>>> 9ff66de244baf6061807125c68219a731cfa7be8
