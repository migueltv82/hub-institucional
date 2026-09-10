-- Auditoria A-J 2026-09-05 - constraints/integridad que requieren revision de datos.
-- Ejecutar primero 2026-09-05_security_diagnostics.sql.
-- No aplicar bloques con resultados invalidos/duplicados sin resolver manualmente.

-- MR-01. Enforzar institution_id en teacher_exam_date_exclusions -> teacher_records.
-- Diagnostico previo obligatorio:
--   select e.id, e.institution_id, e.teacher_id, t.institution_id
--   from public.teacher_exam_date_exclusions e
--   join public.teacher_records t on t.id = e.teacher_id
--   where t.institution_id <> e.institution_id;
-- Rollback:
--   alter table public.teacher_exam_date_exclusions drop constraint if exists teacher_exam_date_exclusions_institution_teacher_fk;
/*
alter table public.teacher_exam_date_exclusions
  add constraint teacher_exam_date_exclusions_institution_teacher_fk
  foreign key (institution_id, teacher_id)
  references public.teacher_records(institution_id, id)
  on delete cascade;
*/

-- MR-02. logic_group >= 1.
-- Rollback:
--   alter table public.subject_prerequisites drop constraint if exists subject_prerequisites_logic_group_check;
/*
alter table public.subject_prerequisites
  add constraint subject_prerequisites_logic_group_check
  check (logic_group >= 1);
*/

-- MR-03. current_year >= 1.
-- Rollback:
--   alter table public.student_career_plans drop constraint if exists student_career_plans_current_year_check;
/*
alter table public.student_career_plans
  add constraint student_career_plans_current_year_check
  check (current_year is null or current_year >= 1);
*/

-- MR-04. entry_year en rango operativo.
-- Confirmar rango institucional antes de aplicar.
-- Rollback:
--   alter table public.student_career_plans drop constraint if exists student_career_plans_entry_year_check;
/*
alter table public.student_career_plans
  add constraint student_career_plans_entry_year_check
  check (entry_year is null or entry_year between 1900 and 2100);
*/

-- MR-05. plan_year en rango operativo.
-- Confirmar rango institucional antes de aplicar.
-- Rollback:
--   alter table public.study_plans drop constraint if exists study_plans_plan_year_check;
/*
alter table public.study_plans
  add constraint study_plans_plan_year_check
  check (plan_year is null or plan_year between 1900 and 2100);
*/

-- MR-06. Unicidad de DNI por institucion en alumnos.
-- No aplicar si existen DNIs duplicados reales, DNIs provisorios o valores vacios normalizados distinto.
-- Rollback:
--   drop index concurrently if exists public.student_records_unique_national_id_per_institution;
/*
create unique index concurrently if not exists student_records_unique_national_id_per_institution
  on public.student_records (institution_id, national_id)
  where nullif(trim(national_id), '') is not null;
*/

-- MR-07. Unicidad de DNI por institucion en docentes.
-- No aplicar si hay docentes duplicados historicos pendientes de fusion.
-- Rollback:
--   drop index concurrently if exists public.teacher_records_unique_national_id_per_institution;
/*
create unique index concurrently if not exists teacher_records_unique_national_id_per_institution
  on public.teacher_records (institution_id, national_id)
  where nullif(trim(national_id), '') is not null;
*/
