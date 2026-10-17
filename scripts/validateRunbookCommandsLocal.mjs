import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalStack, STACK_SOURCE } from './localSupabaseStack.mjs';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';

// RB.1: ejecuta en local, tal cual, los comandos de docs/RUNBOOK_PRODUCCION_V1.md (§3 backup, §3.3/§4 catalogo,
// §9-R4 restore) como el rol `postgres` (el que usa la cadena de conexion de un proyecto Supabase, no superusuario).
// No corta en el primer error: registra que comando del runbook funciona y cual no, para corregir el runbook.

const RUNBOOK = 'docs/RUNBOOK_PRODUCCION_V1.md';
const DUMP = '/tmp/rb1_prod_pre_v1.dump';
// Tablas cuya cantidad de filas se compara entre origen y restore.
export const COUNTED_TABLES = Object.freeze(['auth.users', 'auth.identities', 'public.profiles', 'public.institutions', 'public.memberships', 'public.student_records', 'public.admin_audit_logs', 'storage.buckets', 'storage.objects']);

// Extrae los bloques ```sql de una seccion del runbook, para correr exactamente lo documentado.
export function runbookSqlBlocks(markdown, heading) {
  const start = markdown.indexOf(heading);
  assert.ok(start >= 0, `Seccion no encontrada: ${heading}`);
  const next = markdown.indexOf('\n## ', start + heading.length);
  const section = markdown.slice(start, next < 0 ? undefined : next);
  return [...section.matchAll(/```sql\n([\s\S]*?)```/g)].map(match => match[1]);
}

export function countsSql() {
  return `select json_build_object(${COUNTED_TABLES.map(table => `'${table}',(select count(*) from ${table})`).join(',')});`;
}

const catalogSql = `select json_build_object(
  'functions', (select md5(string_agg(p.proname || ':' || md5(pg_get_functiondef(p.oid)), ',' order by p.proname, md5(pg_get_functiondef(p.oid)))) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'),
  'policies', (select md5(string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || coalesce(qual,'') || ':' || coalesce(with_check,''), ',' order by schemaname, tablename, policyname)) from pg_policies),
  'rls_off', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'password_hashes', (select md5(string_agg(id::text || encrypted_password, ',' order by id)) from auth.users));`;

export async function main() {
  const report = { staging: 'NONE', production: 'NONE', runbook: RUNBOOK, steps: {} };
  let stack, step = 'local stack';
  const extraDatabases = [];
  // Ejecuta y registra; devuelve null si el comando falla (el error queda en el reporte).
  const attempt = (name, fn) => {
    const started = Date.now();
    try { const value = fn(); report.steps[name] = { ok: true, ms: Date.now() - started }; return value === undefined || value === '' ? true : value; }
    catch (error) { report.steps[name] = { ok: false, ms: Date.now() - started, error: String(error.stderr || error.message).split('\n').filter(Boolean).slice(0, 6).join(' | ').slice(0, 900) }; return null; }
  };
  const exec = (args, input) => execFileSync('docker', ['exec', '-i', STACK_SOURCE, ...args], { input, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const psqlAs = (role, db, query) => exec(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', db, '-At'], query).trim();
  try {
    stack = await createLocalStack({ label: 'hub.runbook-commands-local', report });
    const db = stack.database;
    step = 'seed';
    // Usuarios reales via GoTrue Admin API (hash de password, identities) + filas en public y storage.
    const users = [];
    for (const n of [1, 2]) {
      const created = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { email: `rb1-${n}-${stack.run}@fixture.invalid`, password: `Rb1-${stack.run}-${n}!`, email_confirm: true } });
      assert.equal(created.status, 200, 'GoTrue admin create failed');
      users.push(created.body.id);
    }
    stack.sql(`insert into public.institutions(id,name,slug) values ('a1000000-0000-4000-8000-0000000000b1','RB1 A','${stack.run}-a'),('b1000000-0000-4000-8000-0000000000b1','RB1 B','${stack.run}-b');
insert into public.memberships(institution_id,user_id,role) values ('a1000000-0000-4000-8000-0000000000b1','${users[0]}','admin'),('b1000000-0000-4000-8000-0000000000b1','${users[1]}','viewer');
insert into public.student_records(institution_id,external_code,first_name,last_name,profile_id) values ('a1000000-0000-4000-8000-0000000000b1','RB1-S1','Rb','Uno','${users[1]}');
insert into public.admin_audit_logs(actor_user_id,action) values ('${users[0]}','rb1_seed');
insert into storage.objects(bucket_id,name,owner,metadata) values ('workspace-source-files','a1000000-0000-4000-8000-0000000000b1/main/rb1.txt','${users[0]}','{"size":4}');`);
    report.sourceCounts = JSON.parse(stack.sql(countsSql()));
    report.sourceCatalog = JSON.parse(stack.sql(catalogSql));
    const markdown = readFileSync(resolve(RUNBOOK), 'utf8');

    step = 'runbook 3.3 / 4 sql';
    const [catalogSnapshot] = runbookSqlBlocks(markdown, '## 3. T-0');
    const [postSql] = runbookSqlBlocks(markdown, '## 4. Aplicación de SQL');
    attempt('3.3_catalog_snapshot_as_postgres', () => { const out = psqlAs('postgres', db, catalogSnapshot); assert.ok(out.split('\n').length > 10); });
    const post = attempt('4_post_sql_verification_as_postgres', () => psqlAs('postgres', db, postSql).split('\n'));
    if (post) {
      report.postSql = { handle_new_user_ok: post[0], firmas: post[1], tablas_sin_rls: post[2] };
      report.steps['4_post_sql_verification_as_postgres'].expected = post[0] === 't' && post[1] === '1' && post[2].startsWith('0|');
    }

    step = 'runbook 3.1 pg_dump';
    // Mismas banderas que §3.1, como `postgres` y por TCP local (equivalente a la cadena de conexion del proyecto).
    const dumped = attempt('3.1_pg_dump_as_postgres', () => exec(['pg_dump', '--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--schema=auth', '--schema=storage', '--file', DUMP, '-U', 'postgres', '-d', db]));
    if (!dumped) attempt('3.1_pg_dump_as_superuser_control', () => exec(['pg_dump', '--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--schema=auth', '--schema=storage', '--file', DUMP, '-U', 'supabase_admin', '-d', db]));
    const listing = attempt('3.1_pg_restore_list', () => exec(['pg_restore', '--list', DUMP]));
    if (listing) report.archiveEntries = listing.split('\n').filter(line => line && !line.startsWith(';')).length;

    // Destinos de R4: (a) base totalmente vacia; (b) "proyecto nuevo": esquema base de Supabase (auth/storage creados) sin baseline del Hub.
    const baseSchema = exec(['pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
    const baseMigrations = exec(['pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations']);
    const freshProject = target => { psqlAs('supabase_admin', target, baseSchema); psqlAs('supabase_admin', target, baseMigrations); };
    const freshWithBaseline = target => { freshProject(target); for (const file of BASELINE) psqlAs('supabase_admin', target, readFileSync(resolve('supabase/schema', file), 'utf8')); };
    const variants = [
      ['empty', () => {}, ['--single-transaction']],
      ['fresh_project', freshProject, ['--single-transaction']],
      // Proyecto nuevo + baseline (paso 4 del deploy) y luego solo datos: lo que un operador puede hacer como `postgres`.
      ['fresh_baseline_data_only', freshWithBaseline, ['--data-only', '--single-transaction']],
      ['fresh_baseline_data_only_disable_triggers', freshWithBaseline, ['--data-only', '--single-transaction', '--disable-triggers']],
    ];
    for (const [kind, prepare, flags] of variants) {
      step = 'R4 ' + kind;
      const target = `${db}_${kind}`;
      extraDatabases.push(target);
      // Como en un proyecto Supabase: la base destino es propiedad de `postgres`; auth/storage (si existen) de supabase_admin.
      psqlAs('supabase_admin', 'postgres', `create database ${target} owner postgres template template0; comment on database ${target} is '${stack.run}';`);
      prepare(target);
      const restored = attempt(`R4_restore_${kind}`, () => exec(['pg_restore', ...flags, '--no-owner', '--no-privileges', '-U', 'postgres', '-d', target, DUMP]));
      if (restored) {
        const counts = JSON.parse(psqlAs('supabase_admin', target, countsSql()));
        const catalog = JSON.parse(psqlAs('supabase_admin', target, catalogSql));
        report[`restore_${kind}`] = { countsEqual: JSON.stringify(counts) === JSON.stringify(report.sourceCounts), catalogEqual: JSON.stringify(catalog) === JSON.stringify(report.sourceCatalog), counts, catalog };
      }
    }
    report.result = 'COMPLETED';
  } catch (error) { report.result = 'FAIL'; report.error = `Failed at ${step}: ${String(error.message).split('\n')[0]}`; }
  finally {
    const errors = [];
    try { execFileSync('docker', ['exec', STACK_SOURCE, 'rm', '-f', DUMP]); } catch { errors.push('Dump cleanup failed'); }
    for (const target of extraDatabases) {
      try {
        const marker = psqlAs('supabase_admin', 'postgres', `select coalesce(shobj_description(oid,'pg_database'),'') from pg_database where datname='${target}';`);
        if (marker) { assert.equal(marker, stack.run); psqlAs('supabase_admin', 'postgres', `drop database ${target} with (force);`); }
      } catch { errors.push(`Cleanup ${target} failed`); }
    }
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (errors.length) report.cleanupExtra = errors;
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'COMPLETED') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
