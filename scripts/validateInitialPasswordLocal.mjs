import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { createLocalStack } from './localSupabaseStack.mjs';
import { bundleEdgeFunction, removeOwnedDirectory, edgeEnvironment, edgeCall, EDGE_RUNTIME_IMAGE } from './validateRecoveredEdge.mjs';

// I2d: GoTrue y Edge Runtime reales. Volver a crear accesos no pisa contrasenas ni desbloquea; el alta con DNI
// marca el cambio obligatorio y solo complete_initial_password_change la limpia, verificando la contrasena actual.

const ORIGIN = 'http://127.0.0.1:4173';
const FLAG = 'must_change_password';

export const PASSWORD_CHANGE_REJECTIONS = Object.freeze([
  { name: 'contrasena actual incorrecta', current: 'wrong', next: 'NuevaClave2026', status: 401 },
  { name: 'nueva igual a la actual', current: 'dni', next: 'dni', status: 400 },
  { name: 'nueva corta', current: 'dni', next: 'corta', status: 400 },
  { name: 'nueva contiene el DNI', current: 'dni', next: 'x{dni}x', status: 400 },
]);

export function jwtClaims(token) {
  return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
}

export function auditLeaksPassword(rows, secrets) {
  const text = JSON.stringify(rows);
  return secrets.filter(Boolean).some((secret) => text.includes(secret));
}

export async function main() {
  const report = { staging: 'NONE', production: 'NONE', edgeRuntimeImage: EDGE_RUNTIME_IMAGE };
  let stack, bundle, step = 'local stack';
  try {
    stack = await createLocalStack({ label: 'hub.initial-password', report });
    const { sql, run } = stack;
    step = 'Edge Runtime';
    bundle = await bundleEdgeFunction('admin-users');
    const edgePort = stack.startContainer(`${stack.database}_edge`, EDGE_RUNTIME_IMAGE, edgeEnvironment({ gateway: stack.names.gateway, anonKey: stack.anonKey, serviceKey: stack.serviceKey, origin: ORIGIN }), 9000,
      ['--mount', `type=bind,source=${resolve(bundle, 'admin-users')},target=/home/deno/functions/admin-users,readonly`], ['start', '--main-service', '/home/deno/functions/admin-users', '-p', '9000']);
    await stack.waitFor(async () => (await fetch(localEndpoint(edgePort, '/'), { method: 'OPTIONS', headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(1000), redirect: 'error' })).status === 200, `${stack.database}_edge`);

    step = 'fixtures';
    const institution = randomUUID();
    sql(`insert into public.institutions(id,name,slug) values ('${institution}','Synthetic I2d tenant','${run}-i2d');`);
    const ownerEmail = `${run}-owner@example.invalid`, ownerPassword = randomBytes(24).toString('hex');
    const owner = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { email: ownerEmail, password: ownerPassword, email_confirm: true } });
    assert.equal(owner.status, 200, 'Fixture creation failed');
    sql(`update public.profiles set account_role='admin_instituto' where user_id='${owner.body.id}'; insert into public.memberships(institution_id,user_id,role) values ('${institution}','${owner.body.id}','owner');`);
    const login = async (email, password) => stack.authRequest('/token?grant_type=password', { body: { email, password } });
    const ownerToken = (await login(ownerEmail, ownerPassword)).body.access_token;
    const call = async (token, body) => { const response = await edgeCall(edgePort, { token, origin: ORIGIN, body }); return { status: response.status, body: await response.json().catch(() => null) }; };
    const flagOf = (userId) => sql(`select coalesce(raw_app_meta_data->>'${FLAG}','absent') from auth.users where id='${userId}';`);
    const checks = {};

    step = 'teacher created with DNI and flag';
    const dni = String(40000000 + Number.parseInt(run.slice(0, 6), 16) % 1000000);
    const teacherRow = { nombre: 'Synthetic', apellido: 'Teacher I2d', dni };
    const created = await call(ownerToken, { action: 'bulk_create_teachers', institution_id: institution, teachers: [teacherRow] });
    assert.equal(created.status, 200, 'Owner could not create teacher');
    assert.equal(created.body.results[0].status, 'created');
    const teacherId = created.body.results[0].user_id;
    const teacherEmail = sql(`select email from auth.users where id='${teacherId}';`);
    assert.equal(flagOf(teacherId), 'true', 'New teacher without must_change_password');
    const firstLogin = await login(teacherEmail, dni);
    assert.equal(firstLogin.status, 200, 'Teacher cannot log in with DNI');
    assert.equal(firstLogin.body.user.app_metadata[FLAG], true, 'Flag not visible in the session user');
    assert.equal(jwtClaims(firstLogin.body.access_token).app_metadata[FLAG], true, 'Flag not in the JWT');
    checks.teacherCreated = { flag: true, loginWithDni: 200 };

    step = 'student created with DNI and flag';
    const studentDni = String(30000000 + Number.parseInt(run.slice(6, 12), 16) % 1000000);
    const student = await call(ownerToken, { action: 'bulk_create_students', institution_id: institution, students: [{ email: `${run}-student@example.invalid`, dni: studentDni, nombre: 'Synthetic', apellido: 'Student I2d', carrera: 'Synthetic Career' }] });
    assert.equal(student.status, 200, 'Owner could not create student');
    const studentId = sql(`select id from auth.users where email='${run}-student@example.invalid';`);
    assert.equal(flagOf(studentId), 'true', 'New student without must_change_password');
    checks.studentCreated = { flag: true };

    step = 'rejections keep the flag';
    const teacherToken = firstLogin.body.access_token;
    const unauthenticated = await call(stack.anonKey, { action: 'complete_initial_password_change', current_password: dni, new_password: 'NuevaClave2026' });
    assert.equal(unauthenticated.status, 401, 'Anonymous call accepted');
    checks.rejections = { anonymous: 401 };
    for (const item of PASSWORD_CHANGE_REJECTIONS) {
      const current = item.current === 'dni' ? dni : item.current;
      const next = item.next === 'dni' ? dni : item.next.replace('{dni}', dni);
      const rejected = await call(teacherToken, { action: 'complete_initial_password_change', current_password: current, new_password: next });
      assert.equal(rejected.status, item.status, `${item.name}: ${rejected.status}`);
      assert.equal(flagOf(teacherId), 'true', `${item.name} cleared the flag`);
      assert.equal((await login(teacherEmail, dni)).status, 200, `${item.name} changed the password`);
      checks.rejections[item.name] = rejected.status;
    }

    step = 'password change clears the flag';
    const newPassword = `Nueva-${randomBytes(6).toString('hex')}`;
    const changed = await call(teacherToken, { action: 'complete_initial_password_change', current_password: dni, new_password: newPassword });
    assert.equal(changed.status, 200, `Change failed: ${changed.status}`);
    assert.equal(flagOf(teacherId), 'false', 'Flag not cleared');
    assert.equal((await login(teacherEmail, dni)).status, 400, 'DNI still works');
    const secondLogin = await login(teacherEmail, newPassword);
    assert.equal(secondLogin.status, 200, 'New password does not work');
    assert.equal(secondLogin.body.user.app_metadata[FLAG], false);
    // Cambiar la contrasena por Auth Admin revoca las sesiones abiertas con el DNI: la app vuelve a iniciar sesion.
    const refreshed = await stack.authRequest('/token?grant_type=refresh_token', { body: { refresh_token: firstLogin.body.refresh_token } });
    assert.equal(refreshed.body?.error_code, 'refresh_token_not_found', `DNI session still refreshes: ${refreshed.status}`);
    assert.equal(jwtClaims(secondLogin.body.access_token).app_metadata[FLAG], false, 'New JWT keeps the flag');
    checks.changed = { status: 200, flag: false, dniLogin: 400, newLogin: 200, dniSessionRevoked: true, newJwtFlag: false };

    step = 're-provisioning keeps password and block';
    sql(`update public.profiles set is_blocked=true where user_id='${teacherId}';`);
    const again = await call(ownerToken, { action: 'bulk_create_teachers', institution_id: institution, teachers: [teacherRow] });
    assert.equal(again.status, 200, 'Re-provisioning failed');
    assert.equal(again.body.results[0].status, 'updated');
    assert.equal(sql(`select is_blocked from public.profiles where user_id='${teacherId}';`), 't', 'Re-provisioning unblocked the teacher');
    assert.equal(flagOf(teacherId), 'false', 'Re-provisioning set the flag again');
    assert.equal((await login(teacherEmail, newPassword)).status, 200, 'Re-provisioning overwrote the password');
    assert.equal((await login(teacherEmail, dni)).status, 400, 'Re-provisioning restored the DNI password');
    checks.reprovision = { status: 'updated', blocked: true, passwordKept: true, flag: false };

    step = 'blocked user cannot use the action';
    const blockedToken = (await login(teacherEmail, newPassword)).body.access_token;
    const blocked = await call(blockedToken, { action: 'complete_initial_password_change', current_password: newPassword, new_password: `Otra-${randomBytes(6).toString('hex')}` });
    assert.equal(blocked.status, 403, 'Blocked user changed the password');
    checks.blocked = 403;

    step = 'audit without passwords';
    const audit = JSON.parse(sql("select coalesce(json_agg(json_build_object('actor',actor_user_id,'action',action,'status',status,'metadata',metadata,'error',error_message)),'[]') from public.admin_audit_logs;"));
    assert.ok(audit.some((row) => row.actor === teacherId && row.action === 'complete_initial_password_change' && row.status === 'success'), 'Change not audited');
    // El DNI figura como dato de identidad en el alta (bulk_create_teachers); en el cambio de contrasena, nada.
    assert.equal(auditLeaksPassword(audit, [newPassword]), false, 'Audit stores the new password');
    assert.equal(auditLeaksPassword(audit.filter((row) => row.action === 'complete_initial_password_change'), [newPassword, dni]), false, 'Password change audit stores a password');
    checks.audit = { rows: audit.length, leaks: false };

    report.checks = checks;
    report.result = 'PASS';
  } catch (error) { report.result = 'BLOQUEADO'; report.error = `Failed at ${step}: ${error.message}`; }
  finally {
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (bundle) try { await removeOwnedDirectory(bundle); } catch { report.cleanup = { ...report.cleanup, errors: [...(report.cleanup?.errors ?? []), 'Edge bundle cleanup failed'] }; }
    if (report.cleanup?.errors?.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
