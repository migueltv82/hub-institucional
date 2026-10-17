import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { STUDENT, fixtureSql } from './validateExamEligibilityParityLocal.mjs';

// 06.3: suspender una institucion debe cortar en el servidor el acceso de sus miembros (RLS + RPC),
// sin tocar la institucion B ni al superadmin. Uso: node scripts/validateInstitutionSuspensionLocal.mjs [--control]
// --control carga el baseline sin los bloques 06.3: el harness tiene que FALLAR.

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
const INSTITUTION_A = 'a1000000-0000-4000-8000-000000000001';
const INSTITUTION_B = 'b1000000-0000-4000-8000-000000000001';
const ENROLLMENT_ID = 'ae000000-0000-4000-8000-000000000001';
export const SUPER_ADMIN_ID = 'c2000000-0000-4000-8000-000000000001';

export const ACTORS = Object.freeze({
  adminA: { id: 'a2000000-0000-4000-8000-000000000001', institution: INSTITUTION_A, write: 'snapshot' },
  teacherA: { id: 'a2000000-0000-4000-8000-000000000002', institution: INSTITUTION_A, write: 'grade' },
  studentA: { id: STUDENT.userId, institution: INSTITUTION_A, write: 'exam' },
  studentCursadaA: { id: STUDENT.userId, institution: INSTITUTION_A, write: 'subject' },
  adminB: { id: 'b2000000-0000-4000-8000-000000000001', institution: INSTITUTION_B, write: 'snapshot' },
});

// Tablas de datos de la institucion. La propia fila de memberships no cuenta: el miembro la ve por user_id = auth.uid().
export const TABLES = Object.freeze(['institutions', 'careers', 'subjects', 'student_records', 'teacher_records', 'subject_enrollments', 'student_grades', 'exam_tables', 'workspace_snapshots']);

// Control negativo: quita del baseline exactamente los bloques marcados "06.3" (helper RLS + las dos RPC del alumno).
export const SUSPENSION_BLOCKS = Object.freeze({
  '01_foundation.sql': [
    "    -- 06.3: suspender la institucion corta RLS y RPCs de sus miembros; is_super_admin no depende de esto.\n    join public.institutions institution on institution.id = membership.institution_id\n",
    "      and institution.status = 'active'\n",
  ],
  '07_academic_operations.sql': ["    -- 06.3: una institucion suspendida no acepta autogestion del alumno.\n    join public.institutions institution\n      on institution.id = membership.institution_id\n     and institution.status = 'active'\n"],
  '08_exam_tables.sql': ["    -- 06.3: una institucion suspendida no acepta autogestion del alumno.\n    join public.institutions institution\n      on institution.id = membership.institution_id\n     and institution.status = 'active'\n"],
});

export function stripSuspension(file, source) {
  let result = source.replace(/\r\n/g, '\n');
  for (const block of SUSPENSION_BLOCKS[file] ?? []) {
    assert.equal(result.split(block).length - 1, 1, `Bloque 06.3 no encontrado una sola vez en ${file}`);
    result = result.replace(block, '');
  }
  return result;
}

const asUser = (userId, body) => `set local role authenticated;
select set_config('request.jwt.claim.sub', '${userId}', true);
${body}
reset role;`;

function writeSql(kind, institution) {
  // workspace_snapshots: escritura de admin que la app hace por RLS (policy editors insert).
  if (kind === 'snapshot') return `insert into public.workspace_snapshots (institution_id, workspace_key, payload) values ('${institution}', 'suspension-probe', '{}'::jsonb);`;
  if (kind === 'grade') return `perform public.academic_teacher_upsert_student_grade('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', '${ENROLLMENT_ID}', '${STUDENT.subjectId}', '${STUDENT.programId}', 'final', 1, 8, 'regular', null);`;
  if (kind === 'subject') return `perform public.upsert_subject_enrollment_from_portal('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', '${STUDENT.subjectId}', '${STUDENT.programId}', '${STUDENT.recordId}');`;
  return `perform public.upsert_exam_enrollment_from_portal('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', '${STUDENT.recordId}', '${STUDENT.examSubject}', '${STUDENT.subjectId}', '${STUDENT.programId}');`;
}

// Lecturas y una escritura por actor, dentro de una transaccion que siempre termina en rollback.
export function probeSql(actor) {
  const counts = TABLES.map(table => `'${table}', (select count(*) from public.${table} where ${table === 'institutions' ? 'id' : 'institution_id'} = '${actor.institution}')`).join(', ');
  // La mesa exige condicion regular cargada por el docente: se siembra como dueño antes de cambiar de rol.
  const seed = actor.write === 'exam' ? `delete from public.student_grades where student_id = '${STUDENT.userId}';
insert into public.student_grades (institution_id, workspace_key, student_id, student_record_id, subject_id, program_id, academic_status, grade_type, attempt_number) values ('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', '${STUDENT.subjectId}', '${STUDENT.programId}', 'regular', 'final', 1);` : '';
  return `begin;
${seed}
${asUser(actor.id, `select set_config('probe.reads', json_build_object(${counts})::text, true);
do $$ begin
  ${writeSql(actor.write, actor.institution)}
  perform set_config('probe.write', 'saved', true);
exception when others then
  perform set_config('probe.write', sqlerrm || '|' || sqlstate, true);
end $$;`)}
select json_build_object('reads', current_setting('probe.reads')::json, 'write', current_setting('probe.write'));
rollback;`;
}

// El superadmin cambia el estado por la misma policy que usa la app (update directo a institutions).
export function setStatusSql(status) {
  return `begin;
${asUser(SUPER_ADMIN_ID, `do $$ declare updated text; begin
  update public.institutions set status = '${status}' where id = '${INSTITUTION_A}' returning status into updated;
  perform set_config('probe.updated', coalesce(updated, ''), true);
end $$;
select set_config('probe.seen', (select coalesce(string_agg(status, ','), '') from public.institutions where id = '${INSTITUTION_A}'), true);`)}
select json_build_object('updated', current_setting('probe.updated'), 'seen', current_setting('probe.seen'));
commit;`;
}

const totalReads = reads => Object.values(reads).reduce((sum, value) => sum + Number(value), 0);

// Compara cada fase con lo esperado. Devuelve la lista de fallas (vacia = PASS).
export function evaluatePhase(phase, results) {
  const failures = [];
  for (const [name, actor] of Object.entries(ACTORS)) {
    const result = results[name];
    const cut = phase === 'suspended' && actor.institution === INSTITUTION_A;
    if (cut) {
      const leaked = Object.entries(result.reads).filter(([, value]) => Number(value) > 0).map(([table]) => table);
      if (leaked.length) failures.push(`${phase} ${name}: lee ${leaked.join(',')}`);
      if (result.write === 'saved') failures.push(`${phase} ${name}: escritura aceptada`);
    } else {
      if (totalReads(result.reads) === 0) failures.push(`${phase} ${name}: sin lecturas`);
      if (result.write !== 'saved') failures.push(`${phase} ${name}: escritura rechazada (${result.write})`);
    }
  }
  return failures;
}

export async function main(argv = process.argv.slice(2)) {
  const control = argv.includes('--control');
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const report = { run, mode: control ? 'control_legacy_function' : 'release_v1', staging: 'NONE', production: 'NONE', fixture: FIXTURE_FILE };
  let step = 'preflight', created = false;
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; SQLSTATE=${String(error.stderr ?? '').match(/\b(?:42501|23505|23503)\b/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  const json = query => JSON.parse(sql(query).split('\n').filter(line => line.startsWith('{')).pop());
  try {
    const source = JSON.parse(docker(['inspect', SOURCE]))[0];
    assert.equal(source.Config.Image, 'public.ecr.aws/supabase/postgres:17.6.1.165');
    assert.equal(source.State.Health.Status, 'healthy');
    step = 'schema preparation';
    const schema = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
    const migrations = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations']);
    assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
    created = true;
    sql(`create database ${database} template template0; comment on database ${database} is '${run}';`, 'postgres');
    sql(schema); sql(migrations);
    for (const file of BASELINE) {
      const source = readFileSync(resolve('supabase/schema', file), 'utf8');
      sql(control ? stripSuspension(file, source) : source);
    }
    step = 'A/B fixture';
    sql(fixtureSql(readFileSync(resolve(FIXTURE_FILE), 'utf8')));
    sql(`insert into public.subject_enrollments (id, institution_id, workspace_key, subject_id, program_id, student_id, student_record_id)
values ('${ENROLLMENT_ID}', '${STUDENT.institution}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${STUDENT.userId}', '${STUDENT.recordId}');
insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, role)
values ('${STUDENT.institution}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${ACTORS.teacherA.id}', 'titular');
insert into auth.users (id, email, raw_app_meta_data) values ('${SUPER_ADMIN_ID}', 'superadmin@fixture.invalid', '{"is_global_admin":true}');`);
    step = 'function contract';
    report.function = JSON.parse(sql(`select json_build_object('secdef', p.prosecdef, 'config', p.proconfig, 'anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute'), 'checks_status', pg_get_functiondef(p.oid) like '%institution.status = ''active''%') from pg_proc p where p.oid = 'public.is_member_of_institution(uuid,text[])'::regprocedure;`));
    assert.equal(report.function.secdef, true);
    assert.equal(report.function.anon, false);
    assert.equal(report.function.authenticated, true);
    const probeAll = () => Object.fromEntries(Object.entries(ACTORS).map(([name, actor]) => [name, json(probeSql(actor))]));
    report.phases = {};
    for (const [phase, status] of [['active', null], ['suspended', 'suspended'], ['reactivated', 'active']]) {
      step = 'phase ' + phase;
      const transition = status ? json(setStatusSql(status)) : null;
      const results = probeAll();
      const failures = evaluatePhase(phase === 'reactivated' ? 'active' : phase, results);
      if (transition && (transition.updated !== status || transition.seen !== status)) failures.push(`${phase}: superadmin no pudo fijar ${status} (${JSON.stringify(transition)})`);
      report.phases[phase] = { superAdmin: transition, results, failures };
    }
    report.failed = Object.values(report.phases).flatMap(phase => phase.failures);
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'Suspension scenarios failed');
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.error = `Failed at ${step}: ${error.message.split('\n')[0]}`; }
  finally {
    const errors = [];
    if (created) try { if (sql(`select count(*) from pg_database where datname='${database}';`, 'postgres') === '1') { const owner = JSON.parse(sql(`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='${database}';`, 'postgres')); assert.equal(owner.owner, 'supabase_admin'); assert.equal(owner.marker, run); sql(`drop database ${database} with (force);`, 'postgres'); } assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0'); } catch { errors.push('Database cleanup failed'); }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, errors };
    if (errors.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
