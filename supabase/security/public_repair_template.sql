-- RB.2b: reparacion puntual de filas de public desde el archive del runbook §3.1 (R4b en docs/RUNBOOK_PRODUCCION_V1.md).
-- Generado por scripts/validatePublicRepairLocal.mjs (repairSql). Tablas en orden de FK; profiles NO (es global).
-- Correr como postgres desde la carpeta de los repair_<t>.sql: psql -X -v inst=<institution_id> -f public_repair_template.sql $env:PROD_DB_URL
-- Otra tabla de institucion: mismo patron (temp table + \ir + upsert) con su PK y su filtro, respetando el orden de FK.
\set ON_ERROR_STOP 1
begin;
create temp table repair_student_records (like public.student_records) on commit drop;
create temp table repair_subject_enrollments (like public.subject_enrollments) on commit drop;
create temp table repair_student_grades (like public.student_grades) on commit drop;
\ir repair_student_records.sql
\ir repair_subject_enrollments.sql
\ir repair_student_grades.sql
select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum) as cols
from pg_attribute a where a.attrelid = 'public.student_records'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname <> 'id' \gset
insert into public.student_records as t select r.* from pg_temp.repair_student_records r where r.institution_id = :'inst'
on conflict (id) do update set :cols where (to_jsonb(t) - 'updated_at') is distinct from (to_jsonb(excluded) - 'updated_at');
select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum) as cols
from pg_attribute a where a.attrelid = 'public.subject_enrollments'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname <> 'id' \gset
insert into public.subject_enrollments as t select r.* from pg_temp.repair_subject_enrollments r where r.institution_id = :'inst'
on conflict (id) do update set :cols where (to_jsonb(t) - 'updated_at') is distinct from (to_jsonb(excluded) - 'updated_at');
select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum) as cols
from pg_attribute a where a.attrelid = 'public.student_grades'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname <> 'id' \gset
insert into public.student_grades as t select r.* from pg_temp.repair_student_grades r where r.institution_id = :'inst'
on conflict (id) do update set :cols where (to_jsonb(t) - 'updated_at') is distinct from (to_jsonb(excluded) - 'updated_at');
commit;
