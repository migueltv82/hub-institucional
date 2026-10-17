import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalStack, STACK_SOURCE } from './localSupabaseStack.mjs';

// RB.2: ensaya como `postgres` (sin superusuario ni triggers desactivados) la reparacion puntual de filas de public
// desde el archive del runbook §3.1. Daña filas de una institucion en 3 tablas y las repara desde el archive:
// pg_restore --data-only a tablas temporales + upsert filtrado por institucion. Verifica hashes antes/daño/despues.
// --control carga el archive en las temporales pero omite el upsert: el harness tiene que FALLAR.

const DUMP = '/tmp/rb2_prod_pre_v1.dump';
const INSTITUTION_A = 'a1000000-0000-4000-8000-0000000000c2';
const INSTITUTION_B = 'b1000000-0000-4000-8000-0000000000c2';

// Tablas a reparar: clave primaria y filtro de "solo la institucion afectada" sobre la fila del archive (alias r).
export const REPAIR_TABLES = Object.freeze([
  { table: 'student_grades', key: 'id', filter: `r.institution_id = :'inst'` },
  { table: 'subject_enrollments', key: 'id', filter: `r.institution_id = :'inst'` },
  { table: 'profiles', key: 'user_id', filter: `r.user_id in (select m.user_id from public.memberships m where m.institution_id = :'inst')` },
]);

// Columnas que mantiene un trigger BEFORE INSERT/UPDATE (touch_academic_operations_updated_at): la reparacion
// las reescribe con la hora del repair, asi que no entran en el hash de igualdad.
export const TRIGGER_MAINTAINED = Object.freeze({ student_grades: ['updated_at'], subject_enrollments: ['updated_at'] });

// Igual que el `-replace` de PowerShell del runbook: el COPY del archive pasa a la tabla temporal.
export function retargetCopy(script, table) {
  const pattern = new RegExp(`^COPY public\\.${table} `, 'm');
  assert.ok(pattern.test(script), `El archive no trae datos de public.${table}`);
  return script.replace(pattern, `COPY pg_temp.repair_${table} `);
}

// Script de reparacion que corre el operador con psql como `postgres`, en una sola transaccion.
export function repairSql(copyScripts, { control = false } = {}) {
  const temps = REPAIR_TABLES.map(({ table }) => `create temp table repair_${table} (like public.${table}) on commit drop;`).join('\n');
  const upserts = REPAIR_TABLES.map(({ table, key, filter }) => `select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum) as cols
from pg_attribute a where a.attrelid = 'public.${table}'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname <> '${key}' \\gset
insert into public.${table} as t select r.* from pg_temp.repair_${table} r where ${filter}
on conflict (${key}) do update set :cols where row(t.*) is distinct from row(excluded.*);`).join('\n');
  return `\\set ON_ERROR_STOP 1
begin;
${temps}
${copyScripts.join('\n')}
${control ? '' : upserts}
commit;`;
}

const rowsHash = (table, where, skip = []) => `(select json_build_object('count', count(*), 'md5', md5(coalesce(string_agg((to_jsonb(x)${skip.map(column => ` - '${column}'`).join('')})::text, ',' order by (to_jsonb(x))::text), ''))) from public.${table} x where ${where})`;

export function stateSql() {
  const scope = (inst) => ({
    student_grades: rowsHash('student_grades', `institution_id = '${inst}'`, TRIGGER_MAINTAINED.student_grades),
    subject_enrollments: rowsHash('subject_enrollments', `institution_id = '${inst}'`, TRIGGER_MAINTAINED.subject_enrollments),
    profiles: rowsHash('profiles', `user_id in (select user_id from public.memberships where institution_id = '${inst}')`),
  });
  const object = (entries) => `json_build_object(${Object.entries(entries).map(([key, value]) => `'${key}', ${value}`).join(', ')})`;
  // B se compara completo (con updated_at): no la puede tocar la reparacion.
  const fullB = object({
    student_grades: rowsHash('student_grades', `institution_id = '${INSTITUTION_B}'`),
    subject_enrollments: rowsHash('subject_enrollments', `institution_id = '${INSTITUTION_B}'`),
    profiles: rowsHash('profiles', `user_id in (select user_id from public.memberships where institution_id = '${INSTITUTION_B}')`),
  });
  return `select json_build_object(
  'a', ${object(scope(INSTITUTION_A))},
  'b', ${fullB},
  'auth', json_build_object(
    'users', (select md5(coalesce(string_agg(to_jsonb(u)::text, ',' order by u.id), '')) from auth.users u),
    'identities', (select md5(coalesce(string_agg(to_jsonb(i)::text, ',' order by i.id), '')) from auth.identities i)),
  'rls_on', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity));`;
}

export function evaluate({ before, damaged, after }) {
  const failures = [];
  for (const table of Object.keys(before.a)) {
    if (JSON.stringify(damaged.a[table]) === JSON.stringify(before.a[table])) failures.push(`damage did not change A.${table}`);
    if (JSON.stringify(after.a[table]) !== JSON.stringify(before.a[table])) failures.push(`A.${table} not restored`);
  }
  if (JSON.stringify(after.b) !== JSON.stringify(before.b)) failures.push('institution B changed');
  if (JSON.stringify(after.auth) !== JSON.stringify(before.auth)) failures.push('auth.* changed');
  if (after.rls_on !== before.rls_on) failures.push('RLS state changed');
  return failures;
}

export async function main(argv = process.argv.slice(2)) {
  const control = argv.includes('--control');
  const report = { task: 'RB.2', mode: control ? 'control_no_upsert' : 'repair', staging: 'NONE', production: 'NONE', role: 'postgres', disableTriggers: false };
  let stack, step = 'local stack';
  const exec = (args, input) => execFileSync('docker', ['exec', '-i', STACK_SOURCE, ...args], { input, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const psqlAs = (role, db, query, vars = {}) => exec(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...Object.entries(vars).flatMap(([key, value]) => ['-v', `${key}=${value}`]), '-U', role, '-d', db, '-At'], query).trim();
  try {
    stack = await createLocalStack({ label: 'hub.public-repair-local', report });
    report.run = stack.run;
    const db = stack.database;
    report.postgresRole = JSON.parse(psqlAs('postgres', db, "select json_build_object('rolsuper', rolsuper, 'rolbypassrls', rolbypassrls) from pg_roles where rolname = current_user;"));
    assert.equal(report.postgresRole.rolsuper, false, 'postgres no debe ser superusuario');
    step = 'seed';
    const users = {};
    for (const name of ['adminA', 'studentA1', 'studentA2', 'studentB']) {
      const created = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { email: `rb2-${name.toLowerCase()}-${stack.run}@fixture.invalid`, password: `Rb2-${stack.run}-${name}!`, email_confirm: true } });
      assert.equal(created.status, 200, 'GoTrue admin create failed');
      users[name] = created.body.id;
    }
    const students = [['studentA1', INSTITUTION_A], ['studentA2', INSTITUTION_A], ['studentB', INSTITUTION_B]];
    stack.sql(`insert into public.institutions(id,name,slug) values ('${INSTITUTION_A}','RB2 A','${stack.run}-a'),('${INSTITUTION_B}','RB2 B','${stack.run}-b');
insert into public.memberships(institution_id,user_id,role) values ('${INSTITUTION_A}','${users.adminA}','owner')${students.map(([name, inst]) => `,('${inst}','${users[name]}','viewer')`).join('')};
update public.profiles set account_role = 'alumno', display_name = 'Original ' || user_id where user_id in (${students.map(([name]) => `'${users[name]}'`).join(',')});
${students.map(([name, inst], index) => `insert into public.student_records(id,institution_id,external_code,first_name,last_name,profile_id,workspace_key,career) values ('c${index}000000-0000-4000-8000-0000000000c2','${inst}','RB2-${index}','Rb','Dos','${users[name]}','main','PROFESORADO DE INGLES');`).join('\n')}
${students.flatMap(([name, inst], index) => ['ING01', 'ING02'].map((subject) => `insert into public.subject_enrollments(institution_id,workspace_key,subject_id,program_id,student_id,student_record_id) values ('${inst}','main','${subject}','PROFESORADO DE INGLES','${users[name]}','c${index}000000-0000-4000-8000-0000000000c2');
insert into public.student_grades(institution_id,workspace_key,student_id,student_record_id,subject_id,program_id,academic_status,grade_type,attempt_number,grade_value) values ('${inst}','main','${users[name]}','c${index}000000-0000-4000-8000-0000000000c2','${subject}','PROFESORADO DE INGLES','regular','final',1,${7 + index});`)).join('\n')}`);
    report.before = JSON.parse(stack.sql(stateSql()));

    step = 'archive §3.1';
    exec(['pg_dump', '--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--schema=auth', '--schema=storage', '--file', DUMP, '-U', 'postgres', '-d', db]);

    step = 'damage';
    // Daño acotado a A: dos notas borradas, una cursada dada de baja y un perfil pisado. B queda igual.
    stack.sql(`delete from public.student_grades where id in (select id from public.student_grades where institution_id = '${INSTITUTION_A}' order by id limit 2);
update public.subject_enrollments set status = 'dropped' where id = (select id from public.subject_enrollments where institution_id = '${INSTITUTION_A}' order by id limit 1);
update public.profiles set display_name = 'PISADO' where user_id = '${users.studentA1}';`);
    report.damaged = JSON.parse(stack.sql(stateSql()));

    step = 'repair as postgres';
    // Exactamente lo que hace el operador: pg_restore --data-only por tabla a un script, retarget del COPY, psql -1.
    const copyScripts = REPAIR_TABLES.map(({ table }) => retargetCopy(exec(['pg_restore', '--data-only', '--schema=public', `--table=${table}`, '--file=-', DUMP]), table));
    const started = Date.now();
    psqlAs('postgres', db, repairSql(copyScripts, { control }), { inst: INSTITUTION_A });
    report.repairMs = Date.now() - started;
    report.after = JSON.parse(stack.sql(stateSql()));
    report.failures = evaluate(report);
    assert.deepEqual(report.failures, [], 'Repair verification failed');
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.error = `Failed at ${step}: ${String(error.stderr || error.message).split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 600)}`; }
  finally {
    const errors = [];
    try { execFileSync('docker', ['exec', STACK_SOURCE, 'rm', '-f', DUMP]); } catch { errors.push('Dump cleanup failed'); }
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (errors.length) report.cleanupExtra = errors;
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
