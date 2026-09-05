-- Bloqueos puntuales de docente para el motor de mesas: fechas especificas en
-- que un docente no puede tomar examen aunque sea su dia habitual de clase
-- (licencia, ausencia puntual). El resto de la disponibilidad ("diasAsistencia")
-- se infiere de course_schedules -- ver src/utils/examEngine/relationalSource/.
-- Autocontenido e idempotente, mismo criterio que el resto de supabase/schema/.

create table if not exists public.teacher_exam_date_exclusions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  teacher_id uuid not null references public.teacher_records(id) on delete cascade,
  excluded_date date not null,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  unique nulls not distinct (institution_id, teacher_id, excluded_date)
);

alter table public.teacher_exam_date_exclusions enable row level security;

drop policy if exists "teacher_exam_date_exclusions members read" on public.teacher_exam_date_exclusions;
drop policy if exists "teacher_exam_date_exclusions editors insert" on public.teacher_exam_date_exclusions;
drop policy if exists "teacher_exam_date_exclusions editors update" on public.teacher_exam_date_exclusions;
drop policy if exists "teacher_exam_date_exclusions editors delete" on public.teacher_exam_date_exclusions;

create policy "teacher_exam_date_exclusions members read"
on public.teacher_exam_date_exclusions
for select
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id));

create policy "teacher_exam_date_exclusions editors insert"
on public.teacher_exam_date_exclusions
for insert
to authenticated
with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));

create policy "teacher_exam_date_exclusions editors update"
on public.teacher_exam_date_exclusions
for update
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']))
with check (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));

create policy "teacher_exam_date_exclusions editors delete"
on public.teacher_exam_date_exclusions
for delete
to authenticated
using (public.is_super_admin() or public.is_member_of_institution(institution_id, array['owner', 'admin', 'editor']));
