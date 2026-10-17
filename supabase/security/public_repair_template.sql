-- RB.2: reparacion puntual de filas de public desde el archive del runbook §3.1 (ver R4b en docs/RUNBOOK_PRODUCCION_V1.md).
-- Generado por scripts/validatePublicRepairLocal.mjs (repairSql). Correr con psql como postgres:
--   psql -X -v inst=<institution_id> -f public_repair_template.sql $env:PROD_DB_URL
-- Para otras tablas: repetir el patron (temp table + \i + upsert) con su clave primaria y su filtro de institucion.
\set ON_ERROR_STOP 1
begin;
create temp table repair_student_grades (like public.student_grades) on commit drop;
create temp table repair_subject_enrollments (like public.subject_enrollments) on commit drop;
create temp table repair_profiles (like public.profiles) on commit drop;
\i repair_student_grades.sql
\i repair_subject_enrollments.sql
\i repair_profiles.sql
select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum) as cols
from pg_attribute a where a.attrelid = 'public.student_grades'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname <> 'id' \gset
insert into public.student_grades as t select r.* from pg_temp.repair_student_grades r where r.institution_id = :'inst'
on conflict (id) do update set :cols where row(t.*) is distinct from row(excluded.*);
select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum) as cols
from pg_attribute a where a.attrelid = 'public.subject_enrollments'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname <> 'id' \gset
insert into public.subject_enrollments as t select r.* from pg_temp.repair_subject_enrollments r where r.institution_id = :'inst'
on conflict (id) do update set :cols where row(t.*) is distinct from row(excluded.*);
select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum) as cols
from pg_attribute a where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname <> 'user_id' \gset
insert into public.profiles as t select r.* from pg_temp.repair_profiles r where r.user_id in (select m.user_id from public.memberships m where m.institution_id = :'inst')
on conflict (user_id) do update set :cols where row(t.*) is distinct from row(excluded.*);
commit;
