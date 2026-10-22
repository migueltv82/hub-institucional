import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalStack } from './localSupabaseStack.mjs';
import { fixtureSql } from './validateExamEligibilityParityLocal.mjs';
import { separateFixtureAuth } from './validateIntegratedAcceptanceLocal.mjs';
import { bundleEdgeFunction, removeOwnedDirectory, edgeEnvironment, edgeCall, EDGE_RUNTIME_IMAGE } from './validateRecoveredEdge.mjs';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';

const A = 'a1000000-0000-4000-8000-000000000001';
const B = 'b1000000-0000-4000-8000-000000000001';
const teacher = 'a2000000-0000-4000-8000-000000000002';
const record = 'a7000000-0000-4000-8000-000000000001';
const replacement = 'a2000000-0000-4000-8000-000000000006';
const replacementRecord = 'a7000000-0000-4000-8000-000000000002';
const origin = 'http://127.0.0.1:4173';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;

export async function main() {
  const report = { task: 'GATE.C2 N1/N2', staging: 'NONE', production: 'NONE', checks: [] };
  let stack, bundle, phase = 'local stack';
  try {
    stack = await createLocalStack({ label: 'hub.teacher-roster-access', report });
    phase = 'Edge runtime';
    bundle = await bundleEdgeFunction('admin-users');
    const edgeName = `${stack.database}_edge`;
    const port = stack.startContainer(edgeName, EDGE_RUNTIME_IMAGE,
      edgeEnvironment({ gateway: stack.names.gateway, anonKey: stack.anonKey, serviceKey: stack.serviceKey, origin }), 9000,
      ['--mount', `type=bind,source=${resolve(bundle, 'admin-users')},target=/home/deno/functions/admin-users,readonly`],
      ['start', '--main-service', '/home/deno/functions/admin-users', '-p', '9000']);
    await stack.waitFor(async () => (await fetch(localEndpoint(port, '/'), { method: 'OPTIONS', headers: { Origin: origin }, signal: AbortSignal.timeout(1000) })).status === 200, edgeName);
    phase = 'synthetic actors';
    const fixture = separateFixtureAuth(fixtureSql(readFileSync('supabase/baseline/local_ab_rls_rpc_validation.sql', 'utf8')));
    const tokens = {};
    for (const account of fixture.users) {
      const password = randomBytes(24).toString('hex');
      const created = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { ...account, password, email_confirm: true } });
      assert.equal(created.status, 200, 'Synthetic provisioning failed');
      assert.equal(created.body.id, account.id);
      stack.sql(`update public.profiles set account_role=${quote(account.app_metadata.account_role)} where user_id='${account.id}';`);
      const login = await stack.authRequest('/token?grant_type=password', { body: { email: account.email, password } });
      assert.equal(login.status, 200, 'Synthetic login failed');
      tokens[account.id] = login.body.access_token;
    }
    stack.sql(fixture.sql);
    const assignment = randomUUID();
    stack.sql(`insert into public.subject_enrollments(institution_id,student_id,student_record_id,subject_id,program_id)
      values ('${A}','a2000000-0000-4000-8000-000000000003','a8000000-0000-4000-8000-000000000001','FIX-A-01','Fixture Career A');
      insert into public.subject_teacher_assignments(id,institution_id,teacher_id,teacher_record_id,subject_id,program_id,role)
      values ('${assignment}','${A}','${teacher}','${record}','FIX-A-01','Fixture Career A','titular');
      update public.workspace_snapshots set payload=payload || ${quote(JSON.stringify({ docenteMateria: [{ teacher_id: teacher, subject_id: 'FIX-A-01', program_id: 'Fixture Career A' }] }))}::jsonb where institution_id='${A}';`);
    const call = async (id = teacher, institution = A) => {
      const response = await edgeCall(port, { token: tokens[id], origin, body: { action: 'teacher_subject_rosters', institution_id: institution, workspace_key: 'main' } });
      return { status: response.status, body: await response.json() };
    };
    const cases = [
      ['valid titular', "role='titular'", 1],
      ['future substitute', "role='suplente', starts_on=current_date+3", 0],
      ['expired substitute', "role='suplente', ends_on=current_date-1", 0],
      ['license in progress', "role='licencia', metadata=jsonb_build_object('leave_starts_on',current_date::text,'leave_ends_on',(current_date+3)::text)", 0],
      ['future license', "role='licencia', metadata=jsonb_build_object('leave_starts_on',(current_date+3)::text,'leave_ends_on',(current_date+6)::text)", 1],
      ['expired license', "role='licencia', metadata=jsonb_build_object('leave_starts_on',(current_date-6)::text,'leave_ends_on',(current_date-3)::text)", 1],
      ['malformed license', "role='licencia', metadata='{" + '"leave_starts_on":"garbage"' + "}'::jsonb", 0],
      ['impossible license date', "role='licencia', metadata='{" + '"leave_starts_on":"2026-02-30"' + "}'::jsonb", 0],
      ['inactive assignment', "status='inactive', end_reason='renuncia'", 0],
      ['deleted assignment', "deleted_at=now()", 0],
      ['reassigned teacher', `teacher_id='${replacement}', teacher_record_id='${replacementRecord}'`, 0],
      ['reassigned teacher with stale record', `teacher_id='${replacement}'`, 0],
    ];
    for (const [name, changes, expected] of cases) {
      phase = name;
      stack.sql(`update public.subject_teacher_assignments set teacher_id='${teacher}',teacher_record_id='${record}',role='titular',status='active',deleted_at=null,end_reason=null,starts_on=null,ends_on=null,metadata='{}'::jsonb where id='${assignment}';
        update public.subject_teacher_assignments set ${changes} where id='${assignment}';`);
      const result = await call();
      assert.equal(result.status, 200, `${name}: HTTP`);
      assert.equal(result.body.rosters.length, expected, `${name}: visible roster`);
      report.checks.push({ name, visible: result.body.rosters.length, expected });
    }
    phase = 'cross tenant and role denials';
    assert.equal((await call(teacher, B)).status, 403, 'Cross tenant allowed');
    assert.equal((await call('a2000000-0000-4000-8000-000000000003')).status, 403, 'Student allowed teacher roster');
    report.checks.push({ name: 'cross tenant and student denied', status: 403 });
    report.result = 'PASS';
  } catch (error) {
    report.result = 'FAIL'; report.error = `Failed at ${phase}: ${error.name}: ${error instanceof assert.AssertionError ? error.message : 'local operation failed'}`;
  } finally {
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (bundle) try { await removeOwnedDirectory(bundle); } catch { report.cleanup = { ...report.cleanup, errors: [...(report.cleanup?.errors ?? []), 'Bundle cleanup failed'] }; }
    if (report.cleanup?.errors?.length) report.result = 'FAIL';
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
