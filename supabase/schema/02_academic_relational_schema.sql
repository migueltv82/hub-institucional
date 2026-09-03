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
  unique (institution_id, plan_subject_id, teacher_id, valid_from),
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

create index if not exists idx_careers_institution on public.careers (institution_id, name);
create index if not exists idx_plans_career on public.study_plans (institution_id, career_id, status);
create index if not exists idx_plan_subjects_plan on public.study_plan_subjects (institution_id, plan_id, print_order);
create index if not exists idx_prerequisites_target on public.subject_prerequisites (institution_id, target_plan_subject_id);
create index if not exists idx_equivalences_source on public.plan_equivalences (institution_id, source_plan_subject_id);
create index if not exists idx_teacher_assignments_subject on public.teacher_subject_assignments (institution_id, plan_subject_id, status);
create index if not exists idx_schedules_subject on public.course_schedules (institution_id, plan_subject_id, weekday);
create index if not exists idx_students_institution on public.student_records (institution_id, last_name, first_name);
create index if not exists idx_student_plans_student on public.student_career_plans (institution_id, student_id, status);
create index if not exists idx_academic_status_student on public.student_academic_statuses (institution_id, student_career_plan_id, plan_subject_id, recorded_at desc);

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