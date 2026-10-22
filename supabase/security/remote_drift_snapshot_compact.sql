-- Variante compacta de remote_drift_snapshot.sql: una linea 'tipo|objeto|hash8' por objeto (para comparar sin transcribir 36 KB).
with s as (select json_build_object(
  'kind', 'hub_drift_snapshot_v1',
  'captured_at', now(),
  'server_version', current_setting('server_version'),
  'functions', (
    select coalesce(json_agg(json_build_object(
      'sig', p.oid::regprocedure::text,
      'body_md5', md5(replace(pg_get_functiondef(p.oid), chr(13), '')),  -- sin CR: el SQL Editor de Windows guarda CRLF
      'secdef', p.prosecdef,
      'config', coalesce(array_to_string(p.proconfig, ','), ''),
      'anon_exec', has_function_privilege('anon', p.oid, 'execute'),
      'auth_exec', has_function_privilege('authenticated', p.oid, 'execute')
    ) order by p.oid::regprocedure::text), '[]'::json)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  ),
  'policies', (
    select coalesce(json_agg(json_build_object(
      'table', schemaname || '.' || tablename,
      'name', policyname,
      'cmd', cmd,
      'roles', array_to_string(roles, ','),
      'expr_md5', md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
    ) order by schemaname, tablename, policyname), '[]'::json)
    from pg_policies where schemaname in ('public', 'storage')
  ),
  'tables', (
    select coalesce(json_agg(json_build_object(
      'table', 'public.' || c.relname,
      'rls', c.relrowsecurity,
      'columns_md5', (select md5(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attname))
                      from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
      'constraints_md5', (select md5(coalesce(string_agg(co.conname || ':' || pg_get_constraintdef(co.oid), ',' order by co.conname), ''))
                          from pg_constraint co where co.conrelid = c.oid),
      'anon_select', has_table_privilege('anon', c.oid, 'select'),
      'auth_select', has_table_privilege('authenticated', c.oid, 'select')
    ) order by c.relname), '[]'::json)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  'triggers', (
    select coalesce(json_agg(json_build_object(
      'table', t.tgrelid::regclass::text,
      'name', t.tgname,
      'def_md5', md5(pg_get_triggerdef(t.oid))
    ) order by t.tgrelid::regclass::text, t.tgname), '[]'::json)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
  ),
  'storage_buckets', (
    select coalesce(json_agg(json_build_object('id', id, 'public', public) order by id), '[]'::json) from storage.buckets
  ),
  'transition', case when to_regclass('public.app_settings') is null then '"app_settings_missing"'::json else coalesce(
    ((xpath('/row/v/text()', query_to_xml('select (select value::text from public.app_settings where key = ''academic_relational_transition'') as v', true, true, '')))[1]::text)::json,
    '"default_snapshot_only"'::json) end,
  'counts', (
    select json_object_agg(t, case when to_regclass(t) is null then null else
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', t), false, true, '')))[1]::text::bigint end)
    from unnest(array[
      'auth.users', 'public.profiles', 'public.institutions', 'public.memberships', 'public.student_records',
      'public.teacher_records', 'public.subject_enrollments', 'public.student_grades', 'public.exam_tables',
      'public.exam_enrollments', 'public.workspace_snapshots', 'storage.objects'
    ]) as t
  ),
  'profiles_by_role', case when to_regclass('public.profiles') is null then null else
    ((xpath('/row/v/text()', query_to_xml('select (select json_object_agg(account_role, total)::text from (select account_role, count(*) as total from public.profiles group by account_role) r) as v', true, true, '')))[1]::text)::json end
)::jsonb as j),
l as (
  select 'f|' || (x->>'sig') || '|' || left(md5(concat_ws('|', x->>'body_md5', x->>'secdef', x->>'config', x->>'anon_exec', x->>'auth_exec')), 8) as line from s, jsonb_array_elements(j->'functions') x
  union all select 'p|' || (x->>'table') || '.' || (x->>'name') || '|' || left(md5(concat_ws('|', x->>'cmd', x->>'roles', x->>'expr_md5')), 8) from s, jsonb_array_elements(j->'policies') x
  union all select 't|' || (x->>'table') || '|' || left(md5(concat_ws('|', x->>'rls', x->>'columns_md5', x->>'constraints_md5', x->>'anon_select', x->>'auth_select')), 8) from s, jsonb_array_elements(j->'tables') x
  union all select 'g|' || (x->>'table') || '.' || (x->>'name') || '|' || left(md5(x->>'def_md5'), 8) from s, jsonb_array_elements(j->'triggers') x
  union all select 'b|' || (x->>'id') || '|' || left(md5(x->>'public'), 8) from s, jsonb_array_elements(j->'storage_buckets') x
)
select (select j->'transition' from s) as transition, (select j->'counts' from s) as counts, (select j->'profiles_by_role' from s) as profiles_by_role, (select string_agg(line, E'\n' order by line collate "C") from l) as compact;
