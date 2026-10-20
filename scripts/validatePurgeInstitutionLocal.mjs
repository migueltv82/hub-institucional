import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalStack } from './localSupabaseStack.mjs';
import { fixtureSql } from './validateExamEligibilityParityLocal.mjs';
import { buildPurgeSql } from './buildPurgeInstitutionSql.mjs';

// I3: ensayo local del SQL de purga de una institucion de prueba, sobre el baseline + gateway de Storage + el
// fixture A/B. Se purga A y se verifica que no quede nada de A, que B quede identica byte a byte y que solo se
// borren los usuarios exclusivos de A.

export const INSTITUTION_A = Object.freeze({ id: 'a1000000-0000-4000-8000-000000000001', name: 'Fixture Institution A' });
export const INSTITUTION_B = 'b1000000-0000-4000-8000-000000000001';
export const SUPERADMIN = 'c9000000-0000-4000-8000-000000000001';
export const SHARED_USER = 'c9000000-0000-4000-8000-000000000002';
export const A_USER_WITH_B_RECORD = 'a2000000-0000-4000-8000-000000000004';

export const EXTRA_FIXTURE_SQL = `insert into auth.users (id, email) values
  ('${SUPERADMIN}', 'superadmin@purge.invalid'), ('${SHARED_USER}', 'shared@purge.invalid');
update public.profiles set is_global_admin = true where user_id = '${SUPERADMIN}';
insert into public.memberships (institution_id, user_id, role) values
  ('${INSTITUTION_A.id}', '${SUPERADMIN}', 'owner'), ('${INSTITUTION_A.id}', '${SHARED_USER}', 'admin'), ('${INSTITUTION_B}', '${SHARED_USER}', 'viewer')
  on conflict do nothing;
insert into public.student_records (institution_id, workspace_key, first_name, last_name, dni, email, career, academic_year, profile_id)
values ('${INSTITUTION_B}', 'main', 'Legajo', 'En B', '99000001', 'legajo-b@purge.invalid', 'Fixture Career B', '1', '${A_USER_WITH_B_RECORD}');
insert into public.workspace_snapshots (institution_id, workspace_key, payload) values ('${INSTITUTION_A.id}', 'main', '{}'::jsonb) on conflict do nothing;
insert into public.source_file_storage_operations (id, resource_id, actor_id, kind, state, storage_path)
select gen_random_uuid(), r.id, 'a2000000-0000-4000-8000-000000000001', 'upload', 'cancelled', r.institution_id || '/x/main/masterWorkbook/' || gen_random_uuid()
from public.source_file_storage_resources r where r.institution_id = '${INSTITUTION_A.id}' and r.dataset_key = 'masterWorkbook';
insert into public.admin_audit_logs (actor_user_id, action, status, target_type, target_id) values ('${SUPERADMIN}', 'create_tenant_with_admin', 'success', 'institution', '${INSTITUTION_A.id}');`;

export const STORAGE_OBJECT_SQL = `insert into storage.objects (bucket_id, name, owner) values ('workspace-source-files', '${INSTITUTION_A.id}/a2000000-0000-4000-8000-000000000001/main/masterWorkbook/0f000000-0000-4000-8000-000000000001', null);`;

const TABLES_SQL = `select string_agg(c.table_name::text, ',' order by c.table_name) from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE' where c.table_schema = 'public' and c.column_name = 'institution_id' and c.table_name <> 'institutions';`;

export function institutionDigestSql(tables, institutionId) {
  return `select md5(string_agg(t, '|' order by t)) from (${tables.map((table) => `select '${table}:' || coalesce((select string_agg(md5(x::text), ',' order by md5(x::text)) from public.${table} x where x.institution_id = '${institutionId}'), '') as t`).join(' union all ')}) d;`;
}

export function institutionCountsSql(tables, institutionId) {
  return `select json_build_object(${tables.map((table) => `'${table}', (select count(*) from public.${table} where institution_id = '${institutionId}')`).join(', ')});`;
}

export async function main() {
  const report = { task: 'I3', staging: 'NONE', production: 'NONE' };
  let stack, step = 'local stack';
  try {
    stack = await createLocalStack({ label: 'hub.purge-institution', report });
    const { sql } = stack;
    const run = (text) => { try { return { output: sql(text) }; } catch (error) { return { error: String(error.message) }; } };
    const runRaw = (text) => {
      // Como en el SQL Editor: rol postgres, todo el script de una vez.
      try { return { output: execFileSync('docker', ['exec', '-i', 'supabase_db_codex-baseline-local-7725bdda', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', stack.database, '-At'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 }).trim() }; }
      catch (error) { return { error: String(error.stderr ?? '').match(/ERROR:[^\n]*/)?.[0] ?? 'psql failed' }; }
    };

    step = 'schema and fixture';
    sql(readFileSync(resolve('supabase/security/source_file_storage_gateway.sql'), 'utf8'));
    sql(readFileSync(resolve('supabase/security/source_file_storage_register_on_institution.sql'), 'utf8'));
    sql(fixtureSql(readFileSync(resolve('supabase/baseline/local_ab_rls_rpc_validation.sql'), 'utf8')));
    sql(EXTRA_FIXTURE_SQL);
    const tables = sql(TABLES_SQL).split(',');
    report.tables = tables.length;
    const countsA = () => JSON.parse(sql(institutionCountsSql(tables, INSTITUTION_A.id)));
    const totalA = () => Object.values(countsA()).reduce((sum, value) => sum + Number(value), 0);
    const digestB = () => sql(institutionDigestSql(tables, INSTITUTION_B));
    const usersOfA = sql(`select string_agg(distinct user_id::text, ',') from public.memberships where institution_id = '${INSTITUTION_A.id}';`).split(',');
    const authUsers = () => sql('select count(*) from auth.users;');
    const beforeA = totalA(), beforeB = digestB(), beforeUsers = authUsers(), beforeAudit = sql('select count(*) from public.admin_audit_logs;');
    assert.ok(beforeA > 0, 'Fixture A is empty');
    report.before = { rowsA: beforeA, authUsers: Number(beforeUsers), usersOfA: usersOfA.length };

    step = 'dry run changes nothing';
    const dry = run(buildPurgeSql({ institution: INSTITUTION_A.name, ejecutar: false }));
    assert.ok(!dry.error, `Dry run failed: ${dry.error}`);
    assert.match(dry.output, /usuarios a borrar \(solo de esta institucion\)\|\d+/);
    assert.equal(totalA(), beforeA, 'Dry run deleted rows');
    assert.equal(authUsers(), beforeUsers, 'Dry run deleted users');
    report.dryRun = dry.output.split('\n').filter((line) => /^(usuarios|archivos|institucion|filas (student_records|exam_|workspace|source))/.test(line));

    step = 'pending storage file aborts without deleting';
    sql(STORAGE_OBJECT_SQL);
    const blocked = runRaw(buildPurgeSql({ institution: INSTITUTION_A.name, ejecutar: true }));
    assert.ok(blocked.error, 'Purge ran with storage files pending');
    assert.equal(totalA(), beforeA, 'Blocked purge deleted rows');
    assert.equal(authUsers(), beforeUsers, 'Blocked purge deleted users');
    report.storageGuard = 'aborted, nothing deleted';
    sql(`begin; set local storage.allow_delete_query = 'true'; delete from storage.objects where bucket_id = 'workspace-source-files' and name like '${INSTITUTION_A.id}/%'; commit;`);

    step = 'purge';
    const purged = runRaw(buildPurgeSql({ institution: INSTITUTION_A.name, ejecutar: true }));
    assert.ok(!purged.error, `Purge failed: ${purged.error}`);
    assert.match(purged.output, /BORRADA: Fixture Institution A/);
    assert.equal(totalA(), 0, `Rows of A remain: ${JSON.stringify(countsA())}`);
    assert.equal(sql(`select count(*) from public.institutions where id = '${INSTITUTION_A.id}';`), '0');
    assert.equal(digestB(), beforeB, 'Institution B changed');
    assert.equal(sql('select count(*) from public.admin_audit_logs;'), beforeAudit, 'Audit logs were deleted');
    const keptUsers = sql(`select string_agg(id::text, ',' order by id) from auth.users where id in ('${SUPERADMIN}', '${SHARED_USER}', '${A_USER_WITH_B_RECORD}');`);
    assert.equal(keptUsers, [A_USER_WITH_B_RECORD, SHARED_USER, SUPERADMIN].sort().join(','), 'A protected user was deleted');
    assert.equal(sql(`select count(*) from public.memberships where user_id = '${SHARED_USER}' and institution_id = '${INSTITUTION_B}';`), '1', 'Shared user lost its B membership');
    const exclusive = usersOfA.filter((id) => ![SUPERADMIN, SHARED_USER, A_USER_WITH_B_RECORD].includes(id));
    assert.equal(sql(`select count(*) from auth.users where id in (${exclusive.map((id) => `'${id}'`).join(',')});`), '0', 'Exclusive users of A remain');
    report.purge = { rowsA: 0, institutionB: 'unchanged', exclusiveUsersDeleted: exclusive.length, protectedUsersKept: 3, auditKept: true, authUsersAfter: Number(authUsers()) };

    step = 'second run finds nothing';
    const again = runRaw(buildPurgeSql({ institution: INSTITUTION_A.name, ejecutar: true }));
    assert.ok(again.error, 'Second purge did not fail');
    assert.equal(digestB(), beforeB);
    report.secondRun = 'PURGE_INSTITUTION_NOT_FOUND';

    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.error = `Failed at ${step}: ${error.message}`; }
  finally { if (stack && !stack.tornDown) report.cleanup = await stack.teardown(); if (report.cleanup?.errors?.length) report.result = 'FAIL'; }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
