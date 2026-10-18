import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalStack } from './localSupabaseStack.mjs';
import { fixtureSql } from './validateExamEligibilityParityLocal.mjs';
import { bundleEdgeFunction, removeOwnedDirectory, edgeEnvironment, EDGE_RUNTIME_IMAGE, reserveLoopbackPort } from './validateRecoveredEdge.mjs';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { frontendHttpFailure } from './validateRecoveredFrontend.mjs';

export const APPROVED_IMAGES = Object.freeze({
  'nginx:1.27-alpine': 'nginx@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10',
  'supabase/edge-runtime:v1.77.4': 'supabase/edge-runtime@sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8',
});
export function isAllowedBrowserRequest(url, origin) {
  try { return new URL(url).origin === origin; } catch { return false; }
}
export function separateFixtureAuth(source) {
  const block = source.match(/insert into auth\.users \(id, email, raw_app_meta_data\) values[\s\S]*?;/);
  assert.ok(block, 'Expected shared Auth fixture declaration');
  const users = [...block[0].matchAll(/\('([a-f0-9-]{36})', '([^']+)', '(\{[^']+\})'\)/g)]
    .map(([, id, email, metadata]) => ({ id, email, app_metadata: JSON.parse(metadata) }));
  assert.equal(users.length, 10, 'Shared fixture Auth contract changed');
  return { users, sql: source.replace(block[0], '') };
}
// Modos de transicion del fixture (RUNBOOK §4.1). El principal es dual_write; default = sin fila (snapshot_only).
// El tercer ciclo (dual_write de nuevo) reinscribe sobre la fila del snapshot que ya existe: es el caso de PB.1.
export const EXAM_MODES = Object.freeze(['dual_write', 'default', 'dual_write']);
export const DUAL_WRITE_TRANSITION = Object.freeze({ stage: 'dual_write', write_mode: 'dual_write', read_mode: 'snapshot_only', dual_write_enabled: true });
export function transitionSql(mode) {
  if (mode === 'dual_write') return `insert into public.app_settings(key, value, is_public) values ('academic_relational_transition', '${JSON.stringify(DUAL_WRITE_TRANSITION)}'::jsonb, false) on conflict (key) do update set value = excluded.value;`;
  assert.equal(mode, 'default', `Modo de transicion desconocido: ${mode}`);
  return "delete from public.app_settings where key = 'academic_relational_transition';";
}
// Los negativos adversariales esperan 4xx a proposito: no son fallas del frontend.
export const expectedFailurePhase = phase => phase.startsWith('adversarial ');
const tenant = key => `${key}1000000-0000-4000-8000-000000000001`;
const user = (key, number) => `${key}2000000-0000-4000-8000-00000000000${number}`;
const actors = [
  { role: 'alumno', key: 'a', number: 3, email: 'student-a@fixture.invalid' },
  { role: 'docente', key: 'a', number: 2, email: 'teacher-a@fixture.invalid' },
  { role: 'admin_instituto', key: 'a', number: 1, email: 'admin-a@fixture.invalid' },
  { role: 'alumno', key: 'b', number: 3, email: 'student-b@fixture.invalid' },
];

export async function main() {
  const report = { task: 'QA.1', staging: 'NONE', production: 'NONE', remoteSql: 'NONE', deploy: 'NONE', checks: [], httpFailures: [], pageErrors: [], externalRequests: 0, images: {} };
  let stack, bundle, server, browser, cache, phase = 'stack preflight';
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  try {
    for (const [image, digest] of Object.entries(APPROVED_IMAGES)) {
      const actual = JSON.parse(execFileSync('docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', image], { encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }));
      assert.ok(actual.includes(digest), 'Image digest differs from approved target');
      report.images[image] = digest;
    }
    stack = await createLocalStack({ label: 'hub.integrated-acceptance', report });
    const port = await reserveLoopbackPort();
    const origin = localEndpoint(port, '/').slice(0, -1);
    phase = 'Edge Runtime';
    bundle = await bundleEdgeFunction('admin-users');
    const edgeName = `${stack.database}_edge`;
    const edgePort = stack.startContainer(edgeName, EDGE_RUNTIME_IMAGE, edgeEnvironment({ gateway: stack.names.gateway, anonKey: stack.anonKey, serviceKey: stack.serviceKey, origin }), 9000,
      ['--mount', `type=bind,source=${resolve(bundle, 'admin-users')},target=/home/deno/functions/admin-users,readonly`], ['start', '--main-service', '/home/deno/functions/admin-users', '-p', '9000']);
    await stack.waitFor(async () => (await fetch(localEndpoint(edgePort, '/'), { method: 'OPTIONS', headers: { Origin: origin }, signal: AbortSignal.timeout(1000), redirect: 'error' })).status === 200, edgeName);
    phase = 'synthetic fixture';
    const fixture = separateFixtureAuth(fixtureSql(readFileSync(resolve('supabase/baseline/local_ab_rls_rpc_validation.sql'), 'utf8')));
    for (const account of fixture.users) {
      const password = randomBytes(24).toString('hex');
      const created = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { ...account, password, email_confirm: true } });
      report.lastFixtureAuthStatus = created.status;
      assert.equal(created.status, 200, 'Synthetic account provisioning failed');
      assert.equal(created.body.id, account.id, 'Auth fixture identity changed');
      const actor = actors.find(entry => entry.email === account.email);
      if (actor) actor.password = password;
      // Fixture initialization only; privileged roles are never user_metadata-derived.
      stack.sql(`update public.profiles set account_role=${quote(account.app_metadata.account_role)} where user_id='${account.id}';`);
    }
    stack.sql(fixture.sql);
    // The shared security fixture deliberately hides this exam until its teacher confirms.
    // This positive UI flow needs the same existing confirmation contract satisfied.
    stack.sql(`update public.exam_teacher_assignments set confirmation_status='confirmed' where institution_id='${tenant('a')}';`);
    report.fixtureAccounts = { sharedFixtureUsers: fixture.users.length, browserAccounts: actors.length };
    stack.sql(`insert into public.subject_enrollments(institution_id,student_id,student_record_id,subject_id,program_id) values
      ('${tenant('a')}','${user('a', 3)}','a8000000-0000-4000-8000-000000000001','FIX-A-01','Fixture Career A');
      insert into public.subject_teacher_assignments(institution_id,teacher_id,teacher_record_id,subject_id,program_id,role) values
      ('${tenant('a')}','${user('a', 2)}','a7000000-0000-4000-8000-000000000001','FIX-A-01','Fixture Career A','titular');`);
    const newEmail = `${stack.run}-new@fixture.invalid`;
    const examDate = stack.sql("select to_char(scheduled_starts_at,'YYYY-MM-DD') from public.exam_tables where id='aa000000-0000-4000-8000-000000000001';");
    const payload = {
      alumnos: [{ nombre: 'New', apellido: 'Synthetic', dni: '39000001', email: newEmail, carrera: 'Fixture Career A' }],
      // The shared security snapshot omits the date intentionally; the UI positive
      // needs a published future row mapped to the real relational exam table.
      cronograma: [{ id: 'aa000000-0000-4000-8000-000000000001', codigo: 'FIX-A-01', materia: 'Fixture Subject A', carrera: 'Fixture Career A', estadoFinal: 'confirmed', fecha: examDate, inicio: '09:00' }],
    };
    stack.sql(`update public.workspace_snapshots set payload=payload || ${quote(JSON.stringify(payload))}::jsonb where institution_id='${tenant('a')}';`);
    phase = 'Vite and isolated browser';
    assert.ok(!Object.keys(process.env).some(key => key.startsWith('VITE_')), 'Ambient frontend environment forbidden');
    const { createServer, createLogger } = await import('vite');
    const { default: react } = await import('@vitejs/plugin-react');
    const { default: tailwind } = await import('@tailwindcss/vite');
    const { chromium } = await import('playwright');
    cache = await mkdtemp(resolve(tmpdir(), 'hub-acceptance-browser-'));
    let serverErrors = 0;
    const logger = createLogger('silent');
    logger.error = () => { serverErrors++; };
    server = await createServer({ root: process.cwd(), configFile: false, envDir: false, cacheDir: cache, plugins: [react(), tailwind()], customLogger: logger,
      resolve: { dedupe: ['react', 'react-dom'] },
      define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(origin), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(stack.anonKey), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.anonKey), 'import.meta.env.VITE_DISABLE_AUTH': JSON.stringify('false') },
      server: { host: '127.0.0.1', port, strictPort: true, hmr: false, proxy: Object.fromEntries([
        ['/auth/v1', stack.ports.auth], ['/rest/v1', stack.ports.gateway], ['/functions/v1', edgePort],
      ].map(([prefix, targetPort]) => [prefix, { target: localEndpoint(targetPort, '/'), changeOrigin: true, followRedirects: false, ws: false,
        rewrite: path => prefix === '/rest/v1' ? path : path.slice(prefix.length) || '/' }])) } });
    await server.listen();
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const login = async (page, actor, institution) => {
      await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
      await page.locator('select[name="institutionId"]').selectOption(institution);
      await page.locator('input[name="email"]').fill(actor.email);
      await page.locator('input[name="password"]').fill(actor.password);
      await page.getByRole('button', { name: 'Entrar al workspace institucional', exact: true }).click();
    };
    const withActor = async (actor, action) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
      try {
        await context.route('**/*', async route => {
          if (isAllowedBrowserRequest(route.request().url(), origin)) await route.continue();
          else { report.externalRequests++; await route.abort(); }
        });
        const page = await context.newPage();
        page.on('pageerror', error => report.pageErrors.push({ phase, type: error.name }));
        page.on('response', response => {
          const failure = frontendHttpFailure(response.url(), response.status());
          if (failure) report.httpFailures.push({ phase, ...failure });
        });
        phase = `${actor.role}/${actor.key} foreign institution rejection`;
        await login(page, actor, tenant(actor.key === 'a' ? 'b' : 'a'));
        await page.getByText('No tienes permisos para acceder a la institucion seleccionada.', { exact: true }).waitFor({ timeout: 20000 });
        await page.waitForURL(`${origin}/login`);
        phase = `${actor.role}/${actor.key} own login`;
        await login(page, actor, tenant(actor.key));
        await page.waitForURL(url => url.pathname.startsWith('/app'), { timeout: 30000 });
        // El panel admin rotula el logout "Cambiar sesion"; los portales, "Cerrar sesion".
        const logout = page.getByRole('button', { name: /^(Cerrar sesion|Cambiar sesion)$/ }).first();
        await logout.waitFor({ timeout: 30000 });
        assert.equal(await page.evaluate(() => localStorage.getItem('mesaflow.activeInstitutionId')), tenant(actor.key));
        if (actor.role === 'docente') await page.getByText('Portal docente', { exact: true }).first().waitFor();
        else if (actor.role === 'alumno') await page.locator('.student-portal-signout').waitFor();
        else await page.getByText('Panel admin', { exact: true }).first().waitFor();
        await action(page);
        phase = `${actor.role}/${actor.key} logout`;
        await logout.click();
        await page.waitForURL(`${origin}/login`);
        await page.goto(`${origin}/app`, { waitUntil: 'networkidle' });
        await page.waitForURL(`${origin}/login`);
        report.checks.push({ role: actor.role, institution: actor.key, login: true, correctRole: true, foreignInstitutionRejected: true, logout: true, protectedRouteAfterLogout: true });
      } finally { await context.close(); }
    };
    const isEdgePost = response => new URL(response.url()).pathname === '/functions/v1/admin-users' && response.request().method() === 'POST';
    const examCounts = () => JSON.parse(stack.sql(`select json_build_object(
      'relational', (select count(*) from public.exam_enrollments where student_id='${user('a', 3)}' and status='registered'),
      'snapshot', (select count(*) from public.workspace_snapshots s, jsonb_array_elements(coalesce(s.payload->'examEnrollments','[]'::jsonb)) e where s.institution_id='${tenant('a')}' and e->>'student_id'='${user('a', 3)}' and e->>'status'='registered'));`));
    const gradeFilter = `student_id='${user('a', 3)}' and subject_id='FIX-A-01' and program_id='Fixture Career A' and deleted_at is null`;
    const examScenario = async (page, mode) => {
      const result = { mode };
      stack.sql(transitionSql(mode));
      const originalStatuses = stack.sql(`select json_agg(json_build_array(id, academic_status)) from public.student_grades where ${gradeFilter};`);
      phase = `student exam ${mode}: positive through UI`;
      await page.goto(`${origin}/app/mesas-examen`, { waitUntil: 'networkidle' });
      const [registered] = await Promise.all([page.waitForResponse(isEdgePost), page.getByRole('button', { name: 'Inscribirme', exact: true }).first().click()]);
      assert.equal(registered.status(), 200, 'Exam mutation failed');
      const registeredData = await registered.json();
      result.sources = { snapshot: registeredData.sources?.snapshot === true, relational: registeredData.sources?.relational === true };
      result.writeMode = registeredData.transition?.write_mode ?? 'unclassified';
      result.readMode = registeredData.transition?.read_mode ?? 'unclassified';
      const replayBody = registered.request().postDataJSON();
      await page.getByRole('button', { name: 'Cancelar inscripcion', exact: true }).first().waitFor();
      result.afterRegister = examCounts();
      assert.deepEqual(result.afterRegister, { relational: mode === 'dual_write' ? 1 : 0, snapshot: 1 }, `Registration persistence (${mode})`);
      phase = `student exam ${mode}: cancel through UI`;
      const [cancelled] = await Promise.all([page.waitForResponse(isEdgePost), page.getByRole('button', { name: 'Cancelar inscripcion', exact: true }).first().click()]);
      assert.equal(cancelled.status(), 200, 'Exam cancel failed');
      const cancelledData = await cancelled.json();
      result.cancelSources = { snapshot: cancelledData.sources?.snapshot === true, relational: cancelledData.sources?.relational === true, relationalError: typeof cancelledData.sources?.relational_error === 'string' ? cancelledData.sources.relational_error.slice(0, 200) : null };
      await page.getByRole('button', { name: 'Inscribirme', exact: true }).first().waitFor();
      result.afterCancel = examCounts();
      assert.deepEqual(result.afterCancel, { relational: 0, snapshot: 0 }, `Cancel persistence (${mode}) ${JSON.stringify(result.cancelSources)}`);
      result.positive = true;
      phase = `student exam ${mode}: not regular, UI`;
      stack.sql(`update public.student_grades set academic_status='libre' where ${gradeFilter} and academic_status <> 'pending';`);
      await page.reload({ waitUntil: 'networkidle' });
      // EX.1: el portal ya no lista la mesa a un alumno no regular (misma regla que la RPC). Si la
      // listara, el boton tiene que estar deshabilitado con su motivo. Ningun boton habilitado.
      await page.getByText('Mesas de examen', { exact: true }).first().waitFor();
      await page.waitForLoadState('networkidle');
      const enrollButtons = page.getByRole('button', { name: 'Inscribirme', exact: true });
      const buttonCount = await enrollButtons.count();
      const enabledButtons = [];
      for (let index = 0; index < buttonCount; index += 1) if (await enrollButtons.nth(index).isEnabled()) enabledButtons.push(index);
      result.uiHidden = buttonCount === 0;
      result.uiBlocked = enabledButtons.length === 0 && (result.uiHidden || await page.locator('p.border-amber-200').count() > 0);
      assert.ok(result.uiBlocked, `UI must block a non-regular student (${mode})`);
      // Negativos adversariales desde la pagina: el token se usa dentro del navegador y nunca vuelve al harness.
      phase = `adversarial ${mode}: Edge replay`;
      result.edge = await page.evaluate(async ({ body, anon }) => {
        const key = Object.keys(localStorage).find(name => name.startsWith('institutionalhub.supabase.auth.session'));
        const token = JSON.parse(localStorage.getItem(key) ?? '{}').access_token;
        const response = await fetch('/functions/v1/admin-users', { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: response.status };
      }, { body: replayBody, anon: stack.anonKey });
      assert.equal(result.edge.status, 403, `Edge must reject a non-regular student (${mode})`);
      phase = `adversarial ${mode}: direct RPC`;
      result.rpc = await page.evaluate(async ({ anon, args }) => {
        const key = Object.keys(localStorage).find(name => name.startsWith('institutionalhub.supabase.auth.session'));
        const token = JSON.parse(localStorage.getItem(key) ?? '{}').access_token;
        const response = await fetch('/rest/v1/rpc/upsert_exam_enrollment_from_portal', { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
        const payload = await response.json().catch(() => null);
        return { status: response.status, message: typeof payload?.message === 'string' ? payload.message : null };
      }, { anon: stack.anonKey, args: {
        target_institution_id: tenant('a'), target_workspace_key: 'main', actor_user_id: user('a', 3), target_student_id: user('a', 3),
        target_student_record_id: 'a8000000-0000-4000-8000-000000000001', target_exam_table_id: 'aa000000-0000-4000-8000-000000000001',
        target_subject_id: 'FIX-A-01', target_program_id: 'Fixture Career A',
      } });
      assert.equal(result.rpc.message, 'EXAM_REGULARITY_REQUIRED', `RPC must reject a non-regular student (${mode})`);
      result.afterNegatives = examCounts();
      assert.deepEqual(result.afterNegatives, { relational: 0, snapshot: 0 }, `Negatives must not write (${mode})`);
      result.negatives = true;
      for (const [id, status] of JSON.parse(originalStatuses)) stack.sql(`update public.student_grades set academic_status=${quote(status)} where id='${id}';`);
      return result;
    };
    await withActor(actors[0], async page => {
      phase = 'student subjects';
      await page.goto(`${origin}/app/materias`, { waitUntil: 'networkidle' });
      await page.getByText('FIX-A-01', { exact: false }).first().waitFor();
      // QA.1 (17/10): mesa en los dos modos de transicion, con negativos UI / Edge / RPC por modo.
      report.examModes = [];
      for (const mode of EXAM_MODES) report.examModes.push(await examScenario(page, mode));
      report.examRegistered = report.examModes.every(entry => entry.positive && entry.negatives);
    });
    await withActor(actors[1], async page => {
      phase = 'teacher attendance through UI';
      const subject = '/app/materias/FIX-A-01__Fixture%20Career%20A';
      await page.goto(origin + subject + '?tab=asistencia', { waitUntil: 'networkidle' });
      await page.locator('input[type="date"]').fill('2026-10-16');
      await page.getByRole('button', { name: 'Presente', exact: true }).first().click();
      await page.getByRole('button', { name: 'Guardar asistencia', exact: true }).click();
      await page.getByText('Asistencia guardada.', { exact: true }).waitFor();
      assert.equal(stack.sql(`select count(*) from public.subject_attendance_records a join public.subject_class_sessions s on s.id=a.session_id where a.student_id='${user('a', 3)}' and s.institution_id='${tenant('a')}' and s.subject_id='FIX-A-01' and s.program_id='Fixture Career A' and s.teacher_id='${user('a', 2)}' and s.session_date='2026-10-16' and a.status='present';`), '1');
      phase = 'teacher grade through UI';
      await page.goto(origin + subject + '?tab=notas', { waitUntil: 'networkidle' });
      const edit = page.getByRole('button', { name: 'Editar notas y condición', exact: true });
      if (await edit.count()) await edit.click();
      await page.getByRole('spinbutton', { name: /Parcial 1/ }).first().fill('8');
      await page.getByRole('spinbutton', { name: /Parcial 2/ }).first().fill('6');
      await page.getByRole('button', { name: /Confirmar cambios|Confirmar carga/ }).click();
      await page.getByRole('button', { name: 'Editar notas y condición', exact: true }).waitFor();
      const grades = JSON.parse(stack.sql(`select json_agg(json_build_array(grade_type,attempt_number,grade_value) order by grade_type,attempt_number) from public.student_grades where institution_id='${tenant('a')}' and student_id='${user('a', 3)}' and subject_id='FIX-A-01' and program_id='Fixture Career A' and deleted_at is null;`));
      assert.deepEqual(grades, [['final', 1, 7], ['partial', 1, 8], ['partial', 2, 6]]);
      report.teacherWrites = { attendance: true, grade: true };
    });
    await withActor(actors[0], async page => {
      phase = 'student rereads teacher grade and attendance';
      await page.goto(`${origin}/app/calificaciones`, { waitUntil: 'networkidle' });
      const row = page.getByRole('row').filter({ hasText: 'FIX-A-01' });
      await row.getByText('8 / 6', { exact: true }).waitFor();
      assert.equal((await row.getByRole('cell').nth(2).textContent()).trim(), '7');
      await page.goto(`${origin}/app/materias`, { waitUntil: 'networkidle' });
      const card = page.locator('article.student-subject-card').filter({ hasText: 'FIX-A-01' });
      await card.getByText(/100\s*%/).first().waitFor();
      await card.getByText('1 presentes de 1 clases', { exact: true }).waitFor();
      report.studentReread = true;
      // PB.3: la cursada que lista la lectura segura (id relacional) se puede dar de baja desde la UI.
      phase = 'student withdraws subject through UI';
      await page.goto(`${origin}/app/materias`, { waitUntil: 'networkidle' });
      const subjectCard = page.locator('article.student-subject-card').filter({ hasText: 'FIX-A-01' });
      const [withdrawn] = await Promise.all([page.waitForResponse(isEdgePost), subjectCard.getByRole('button', { name: 'Desistir', exact: true }).click()]);
      report.subjectWithdrawStatus = withdrawn.status();
      assert.equal(withdrawn.status(), 200, 'Subject withdraw failed');
      report.subjectWithdrawRelational = stack.sql(`select status from public.subject_enrollments where institution_id='${tenant('a')}' and student_id='${user('a', 3)}' and subject_id='FIX-A-01';`);
      assert.equal(report.subjectWithdrawRelational, 'dropped', 'Relational enrollment must be dropped');
    });
    await withActor(actors[2], async page => {
      phase = 'admin creates account through Edge and UI';
      await page.getByRole('button', { name: /^Alumnos/ }).first().click();
      await page.getByRole('button', { name: 'Crear accesos', exact: true }).click();
      await page.getByText('Creados:', { exact: false }).first().waitFor();
      assert.equal(stack.sql(`select count(*) from auth.users where email=${quote(newEmail)};`), '1');
      assert.equal(stack.sql("select count(*) from public.admin_audit_logs where action='bulk_create_students' and status='success';"), '1');
      report.adminCreatedThroughEdge = true;
      // "Accesos listos" abre un aviso importante que queda visible hasta que el admin lo cierra (como en la UI real).
      const notice = page.locator('[aria-labelledby="important-notice-title"]');
      await notice.waitFor({ timeout: 15000 });
      while (await notice.count()) await notice.locator('button.btn-primary').click();
      report.adminNoticeClosed = true;
    });
    await withActor(actors[3], async () => {});
    assert.equal(report.externalRequests, 0, 'External requests attempted');
    report.expectedAdversarialFailures = report.httpFailures.filter(failure => expectedFailurePhase(failure.phase)).length;
    assert.deepEqual(report.httpFailures.filter(failure => !expectedFailurePhase(failure.phase)), [], 'Unexpected browser HTTP error');
    assert.deepEqual(report.pageErrors, [], 'Browser exception');
    assert.equal(serverErrors, 0, 'Vite server error');
    report.result = 'PASS';
  } catch (error) {
    report.result = 'FAIL'; report.failedAt = phase; report.errorType = error.name;
    // Solo los mensajes de assert propios: no llevan tokens ni datos de cuentas.
    if (['AssertionError', 'TimeoutError'].includes(error.name)) report.errorMessage = String(error.message).split('\n').slice(0, 16).join(' | ').slice(0, 1200);
  }
  finally {
    const errors = [];
    for (const resource of [browser, server]) if (resource) try { await resource.close(); } catch { errors.push('Browser/server close failed'); }
    if (cache) try {
      assert.equal(dirname(resolve(cache)), resolve(tmpdir())); assert.ok(basename(cache).startsWith('hub-acceptance-browser-'));
      await rm(cache, { recursive: true, force: true });
    } catch { errors.push('Browser cache cleanup failed'); }
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (bundle) try { await removeOwnedDirectory(bundle); } catch { errors.push('Edge bundle cleanup failed'); }
    report.cleanup = { ...report.cleanup, errors: [...(report.cleanup?.errors ?? []), ...errors] };
    if (report.cleanup.errors.length) report.result = 'FAIL';
    for (const actor of actors) delete actor.password;
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
