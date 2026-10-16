import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { getExamEnrollmentEligibility } from '../src/modules/alumnos/lib/examEligibility.js';

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
// Identidades del fixture A/B: alumno A inscribiendose a la mesa FIX-A-01 de su institucion.
export const STUDENT = Object.freeze({ institution: 'a1000000-0000-4000-8000-000000000001', userId: 'a2000000-0000-4000-8000-000000000003', recordId: 'a8000000-0000-4000-8000-000000000001', examSubject: 'aa000000-0000-4000-8000-000000000001', subjectId: 'FIX-A-01', programId: 'Fixture Career A' });

// Historiales de student_grades, del mas viejo al mas nuevo salvo que se indique `at` (minutos).
export const PARITY_SCENARIOS = Object.freeze([
  { name: 'regular', rows: [{ status: 'regular' }] },
  { name: 'libre', rows: [{ status: 'libre' }] },
  { name: 'sin notas', rows: [] },
  { name: 'regular luego libre', rows: [{ status: 'regular' }, { status: 'libre' }] },
  { name: 'libre luego regular', rows: [{ status: 'libre' }, { status: 'regular' }] },
  { name: 'regular luego approved', rows: [{ status: 'regular' }, { status: 'approved' }] },
  { name: 'regular luego pending', rows: [{ status: 'regular' }, { status: 'pending' }] },
  { name: 'Regular con mayuscula', rows: [{ status: 'Regular' }] },
  { name: 'regular con espacio final', rows: [{ status: 'regular ' }] },
  { name: 'regular luego Pendiente', rows: [{ status: 'regular' }, { status: 'Pendiente' }] },
  { name: 'regular luego cursando', rows: [{ status: 'regular' }, { status: 'cursando' }] },
  { name: 'regular luego pending con nota final 8', rows: [{ status: 'regular' }, { status: 'pending', gradeValue: 8 }] },
  { name: 'regular parcial', rows: [{ status: 'regular', gradeType: 'parcial' }] },
  { name: 'regular en otra carrera', rows: [{ status: 'regular', programId: 'Other Career' }] },
  { name: 'regular con codigo en minuscula', rows: [{ status: 'regular', subjectId: 'fix-a-01' }] },
  { name: 'libre vivo y regular borrado mas nuevo', rows: [{ status: 'libre' }, { status: 'regular', deleted: true }] },
  { name: 'empate updated_at, regular creado despues', rows: [{ status: 'libre', at: 10, createdAt: 1 }, { status: 'regular', at: 10, createdAt: 5 }] },
]);

const quote = value => value === null || value === undefined ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";

export function scenarioInsertSql(scenario) {
  if (scenario.rows.length === 0) return '';
  const base = Date.parse('2026-10-01T00:00:00Z');
  const values = scenario.rows.map((row, index) => {
    const updated = new Date(base + (row.at ?? (index + 1) * 10) * 60000).toISOString();
    const created = new Date(base + (row.createdAt ?? (row.at ?? (index + 1) * 10)) * 60000).toISOString();
    return `(${[STUDENT.institution, 'main', STUDENT.userId, STUDENT.recordId, row.subjectId ?? STUDENT.subjectId, row.programId ?? STUDENT.programId, row.status].map(quote).join(',')},${quote(row.gradeType ?? 'final')},${row.gradeValue ?? 'null'},${index + 1},${quote(created)},${quote(updated)},${row.deleted ? quote(updated) : 'null'})`;
  });
  return `insert into public.student_grades (institution_id, workspace_key, student_id, student_record_id, subject_id, program_id, academic_status, grade_type, grade_value, attempt_number, created_at, updated_at, deleted_at) values ${values.join(',')};`;
}

// JS mas permisivo que el servidor es el bug que CLAUDE.md prohibe; mas estricto es una divergencia de UX.
export function classifyParity(serverAllows, mirrorAllows) {
  if (serverAllows === mirrorAllows) return 'match';
  return mirrorAllows ? 'mirror_more_permissive' : 'mirror_stricter';
}

export function fixtureSql(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf('begin;'), end = lines.findIndex(line => line.startsWith('-- Modo focal'));
  assert.ok(start >= 0 && end > start, 'A/B fixture block not found');
  return ['begin;', ...lines.slice(start + 1, end), 'commit;'].join('\n');
}

export async function main() {
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const report = { run, staging: 'NONE', production: 'NONE', fixture: FIXTURE_FILE };
  let step = 'preflight', created = false;
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; SQLSTATE=${String(error.stderr ?? '').match(/\b(?:42501|23505|23503)\b/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
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
    for (const file of BASELINE) sql(readFileSync(resolve('supabase/schema', file), 'utf8'));
    step = 'A/B fixture';
    sql(fixtureSql(readFileSync(resolve(FIXTURE_FILE), 'utf8')));
    report.scenarios = [];
    for (const scenario of PARITY_SCENARIOS) {
      step = 'scenario ' + scenario.name;
      const output = sql(`begin;
delete from public.exam_enrollments where student_id='${STUDENT.userId}';
delete from public.student_grades where student_id='${STUDENT.userId}';
-- El trigger touch_academic_operations_updated_at pisa updated_at con now(): se omite solo para fijar el historial.
set local session_replication_role = replica;
${scenarioInsertSql(scenario)}
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${STUDENT.userId}', true);
do $$ begin
  perform public.upsert_exam_enrollment_from_portal('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', '${STUDENT.recordId}', '${STUDENT.examSubject}', '${STUDENT.subjectId}', '${STUDENT.programId}');
  perform set_config('parity.outcome', 'registered', true);
exception when others then
  perform set_config('parity.outcome', sqlerrm, true);
end $$;
reset role;
select json_build_object('outcome', current_setting('parity.outcome'), 'grades', (select coalesce(json_agg(to_jsonb(g)), '[]') from public.student_grades g where g.student_id='${STUDENT.userId}' and g.deleted_at is null));
rollback;`);
      const { outcome, grades } = JSON.parse(output.split('\n').find(line => line.startsWith('{')));
      assert.ok(outcome === 'registered' || /^[A-Z_]+$/.test(outcome), 'Unexpected RPC outcome');
      // El portal solo recibe notas vivas (RPC de lectura y fallback filtran deleted_at), igual que aca.
      const mirror = getExamEnrollmentEligibility({ exam: { subject_id: STUDENT.subjectId, program_id: STUDENT.programId }, grades });
      const serverAllows = outcome === 'registered';
      report.scenarios.push({ name: scenario.name, server: outcome, mirrorAllows: mirror.canRegister, mirrorStatus: mirror.academicStatus, parity: classifyParity(serverAllows, mirror.canRegister) });
    }
    report.matches = report.scenarios.filter(item => item.parity === 'match').length;
    report.mirrorMorePermissive = report.scenarios.filter(item => item.parity === 'mirror_more_permissive').map(item => item.name);
    report.mirrorStricter = report.scenarios.filter(item => item.parity === 'mirror_stricter').map(item => item.name);
    step = 'baseline sanity';
    assert.equal(report.scenarios.find(item => item.name === 'regular').server, 'registered', 'Fixture cannot register a regular student');
    assert.notEqual(report.scenarios.find(item => item.name === 'libre').server, 'registered', 'Fixture registers a libre student');
    step = 'parity';
    assert.deepEqual(report.mirrorMorePermissive, [], 'Mirror more permissive than RPC');
    report.result = 'PASS';
  } catch (error) { report.result = report.result === 'PASS' ? 'PASS' : 'FAIL'; report.error = `Failed at ${step}: ${error.name}`; }
  finally {
    const errors = [];
    if (created) try { if (sql(`select count(*) from pg_database where datname='${database}';`, 'postgres') === '1') { const owner = JSON.parse(sql(`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='${database}';`, 'postgres')); assert.equal(owner.owner, 'supabase_admin'); assert.equal(owner.marker, run); sql(`drop database ${database} with (force);`, 'postgres'); } assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0'); } catch { errors.push('Database cleanup failed'); }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, errors };
    if (errors.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
