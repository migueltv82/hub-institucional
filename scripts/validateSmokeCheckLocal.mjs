import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { createLocalStack } from './localSupabaseStack.mjs';
import { reserveLoopbackPort } from './validateRecoveredEdge.mjs';
import { runSmoke, parseArgs } from './smokeCheck.mjs';

// Corre scripts/smokeCheck.mjs contra el stack local descartable (Auth + PostgREST detras del gateway)
// y contra `vite preview` de dist/. Storage y Edge no forman parte de ese stack: quedan SKIPPED explicitos.
export async function main() {
  const report = { staging: 'NONE', production: 'NONE' };
  let stack, preview, step = 'local stack';
  try {
    stack = await createLocalStack({ label: 'hub.smoke-check-local', report });
    step = 'seed sensitive rows';
    // Filas reales en tablas sensibles: el check de anon solo vale si hay algo que no deberia ver.
    const institutionId = randomUUID(), userId = randomUUID();
    stack.sql(`insert into public.institutions(id,name,slug) values ('${institutionId}','Smoke institution','${stack.run}-smoke');
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('${userId}','smoke-${stack.run}@fixture.invalid','authenticated','authenticated','{}','{}',now(),now());
insert into public.memberships(institution_id,user_id,role) values ('${institutionId}','${userId}','viewer');
insert into public.student_records(institution_id,external_code,first_name,last_name,profile_id) values ('${institutionId}','SMOKE-1','Smoke','Student','${userId}');
insert into public.admin_audit_logs(actor_user_id,action) values ('${userId}','smoke_seed');`);
    report.seeded = JSON.parse(stack.sql(`select json_build_object('profiles',(select count(*) from public.profiles),'memberships',(select count(*) from public.memberships),'student_records',(select count(*) from public.student_records),'admin_audit_logs',(select count(*) from public.admin_audit_logs));`));
    assert.ok(Object.values(report.seeded).every(count => count > 0), 'Seed incompleto');
    step = 'frontend preview';
    const port = await reserveLoopbackPort();
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', windowsHide: true });
    const frontendUrl = localEndpoint(port, '/').slice(0, -1);
    for (let i = 0; i < 80; i++) { try { if ((await fetch(frontendUrl, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* reintento */ } await new Promise(done => setTimeout(done, 250)); }
    step = 'smoke';
    const supabaseUrl = localEndpoint(stack.ports.gateway, '/').slice(0, -1);
    report.smoke = await runSmoke(parseArgs(['--supabase-url', supabaseUrl, '--anon-key', stack.anonKey, '--frontend-url', frontendUrl, '--skip', 'storage,edge']));
    assert.equal(report.smoke.result, 'PASS', 'Smoke FAIL contra stack local');
    step = 'service role refused';
    assert.throws(() => parseArgs(['--supabase-url', supabaseUrl, '--anon-key', stack.serviceKey]), /service_role/);
    report.serviceRoleRefused = true;
    step = 'negative control';
    // Control: con el gateway apagado, el smoke tiene que fallar (no puede dar PASS por defecto).
    stack.docker(['stop', stack.names.gateway]);
    const down = await runSmoke(parseArgs(['--supabase-url', supabaseUrl, '--anon-key', stack.anonKey, '--skip', 'storage,edge']));
    report.gatewayDown = { result: down.result, failed: down.failed };
    assert.equal(down.result, 'FAIL');
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.error = `Failed at ${step}: ${error.message.split('\n')[0]}`; }
  finally {
    if (preview) preview.kill();
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (report.cleanup?.errors?.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
