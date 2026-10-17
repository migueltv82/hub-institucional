import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { createLocalStack, roleToken } from './localSupabaseStack.mjs';

export { roleToken };

// Entorno del validador real: solo loopback, claves efimeras y sin heredar VITE_/SUPABASE_ del proceso.
export function roundTripEnvironment({ baseEnv, gatewayPort, anonKey, serviceKey, institutionId }) {
  const inherited = Object.fromEntries(Object.entries(baseEnv).filter(([key]) => !/^(VITE_|SUPABASE_)/.test(key)));
  assert.match(String(gatewayPort), /^[0-9]{1,5}$/);
  assert.match(institutionId, /^[0-9a-f-]{36}$/);
  return { ...inherited, VITE_SUPABASE_URL: localEndpoint(gatewayPort, '/').slice(0, -1), VITE_SUPABASE_PUBLISHABLE_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_TEST_INSTITUTION_ID: institutionId, SUPABASE_TEST_WORKSPACE_KEY: 'main' };
}

export function lastJsonDocument(output) {
  const start = output.lastIndexOf('\n{');
  return JSON.parse(output.slice(start >= 0 ? start + 1 : output.indexOf('{')));
}

export async function main() {
  const report = { staging: 'NONE', production: 'NONE', validator: 'scripts/validateStudentTeacherRoundTrip.mjs' };
  let stack, step = 'local stack';
  try {
    stack = await createLocalStack({ label: 'hub.round-trip-local', report });
    const institutionId = randomUUID();
    stack.sql(`insert into public.institutions(id,name,slug) values ('${institutionId}','Synthetic round trip institution','${stack.run}-round-trip');`);
    step = 'round trip validator';
    const child = spawn(process.execPath, ['scripts/validateStudentTeacherRoundTrip.mjs'], { env: roundTripEnvironment({ baseEnv: process.env, gatewayPort: stack.ports.gateway, anonKey: stack.anonKey, serviceKey: stack.serviceKey, institutionId }), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const exitCode = await new Promise(done => child.on('close', done));
    report.validatorExitCode = exitCode;
    report.validator = { ...lastJsonDocument(stdout), stderrLines: stderr.split('\n').filter(Boolean).length };
    assert.equal(exitCode, 0, 'Round trip validator failed');
    step = 'post-run residue';
    report.residue = JSON.parse(stack.sql(`select json_build_object('studentRecords',(select count(*) from public.student_records),'teacherRecords',(select count(*) from public.teacher_records),'enrollments',(select count(*) from public.subject_enrollments),'grades',(select count(*) from public.student_grades),'sessions',(select count(*) from public.subject_class_sessions),'attendance',(select count(*) from public.subject_attendance_records),'memberships',(select count(*) from public.memberships));`));
    report.result = 'PASS';
  } catch (error) { report.result = 'BLOQUEADO'; report.error = `Failed at ${step}: ${error.name}`; }
  finally {
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (report.cleanup?.errors?.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
