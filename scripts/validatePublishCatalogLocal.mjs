import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { main as buildCatalogSql } from './buildAcademicCatalogSql.mjs';
import { buildFixtureWorkbooks } from './validateAcademicCatalogLocal.mjs';
import { buildCatalogFromWorkbook, buildCatalogPayload, sheetRows, studentPlansFromEnrollments } from '../src/utils/academicCatalog.js';
import { parseTemplateV2MasterWorkbook, parseTemplateV2StudentsWorkbook } from '../src/utils/examEngine/templatesV2/importTemplateV2Workbook.js';

// I2c: la RPC academic_admin_publish_catalog deja exactamente el mismo catalogo que el SQL de CAT.1
// (buildAcademicCatalogSql.mjs) con las mismas planillas. Dos bases: A corre el SQL, B la RPC; se comparan
// carreras, planes, materias, materias por plan, correlativas y planes de alumnos. Ademas: permisos,
// idempotencia y abort sin escribir ante un renombre de carrera.

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const INSTITUTION = 'c1000000-0000-4000-8000-000000000001';
const INSTITUTION_NAME = 'Instituto I2c Prueba';
const CAREER_NAME = 'Profesorado de Inglés';
export const USERS = Object.freeze({
  owner: { id: 'c2000000-0000-4000-8000-000000000001', role: 'owner', account: 'admin_instituto' },
  editor: { id: 'c2000000-0000-4000-8000-000000000002', role: 'editor', account: 'admin_instituto' },
  teacher: { id: 'c2000000-0000-4000-8000-000000000003', role: 'viewer', account: 'docente' },
});
const STUDENTS = [['c3000000-0000-4000-8000-000000000001', 'ana@fixture.invalid', '30111222'], ['c3000000-0000-4000-8000-000000000002', 'beto@fixture.invalid', '40222333']];

export const CATALOG_DUMP_SQL = `select json_build_object(
  'careers', (select coalesce(json_agg(json_build_object('code', c.external_code, 'name', c.name, 'duration', c.duration_years, 'status', c.status) order by c.external_code), '[]') from public.careers c where c.institution_id = '${INSTITUTION}'),
  'plans', (select coalesce(json_agg(json_build_object('code', p.external_code, 'career', c.external_code, 'name', p.name, 'year', p.plan_year, 'resolution', p.resolution, 'status', p.status, 'from', p.valid_from, 'until', p.valid_until) order by p.external_code), '[]') from public.study_plans p join public.careers c on c.id = p.career_id where p.institution_id = '${INSTITUTION}'),
  'subjects', (select coalesce(json_agg(json_build_object('code', s.code, 'name', s.name, 'external', s.external_id) order by s.code), '[]') from public.subjects s where s.institution_id = '${INSTITUTION}'),
  'plan_subjects', (select coalesce(json_agg(json_build_object('plan', p.external_code, 'code', s.code, 'year', ps.year_number, 'term', ps.term_number, 'regime', ps.regime, 'exam', ps.exam_required, 'order', ps.print_order, 'from', ps.valid_from, 'until', ps.valid_until) order by p.external_code, s.code), '[]') from public.study_plan_subjects ps join public.study_plans p on p.id = ps.plan_id join public.subjects s on s.id = ps.subject_id where ps.institution_id = '${INSTITUTION}'),
  'prerequisites', (select coalesce(json_agg(json_build_object('target', ts.code, 'required', rs.code, 'condition', pr.required_condition, 'applies', pr.applies_to, 'status', pr.status) order by ts.code, rs.code), '[]') from public.subject_prerequisites pr join public.study_plan_subjects t on t.id = pr.target_plan_subject_id join public.subjects ts on ts.id = t.subject_id join public.study_plan_subjects r on r.id = pr.prerequisite_plan_subject_id join public.subjects rs on rs.id = r.subject_id where pr.institution_id = '${INSTITUTION}'),
  'student_plans', (select coalesce(json_agg(json_build_object('dni', sr.dni, 'plan', p.external_code, 'year', sp.current_year, 'status', sp.status) order by sr.dni), '[]') from public.student_career_plans sp join public.student_records sr on sr.id = sp.student_id join public.study_plans p on p.id = sp.plan_id where sp.institution_id = '${INSTITUTION}'));`;

export function publishSql(actor, payload) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', true);
do $$ begin
  perform set_config('cat.result', public.academic_admin_publish_catalog('${INSTITUTION}', '${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb)::text, true);
exception when others then
  perform set_config('cat.result', json_build_object('error', sqlerrm, 'sqlstate', sqlstate)::text, true);
end $$;
select current_setting('cat.result');
commit;`;
}

export async function main() {
  const run = randomBytes(8).toString('hex');
  const databases = { sql: disposableDatabase(`gotrue_harness_${run}`), rpc: disposableDatabase(`gotrue_harness_${randomBytes(8).toString('hex')}`) };
  const markers = { sql: run, rpc: databases.rpc.slice(-16) };
  const workdir = mkdtempSync(join(tmpdir(), 'i2c-'));
  const report = { task: 'I2c', run, staging: 'NONE', production: 'NONE' };
  let step = 'preflight';
  const created = [];
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}: ${String(error.stderr ?? '').match(/ERROR:[^\n]*/)?.[0] ?? 'sin detalle'}`); }
  };
  const sql = (query, db) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  const last = text => text.split('\n').filter(Boolean).pop();
  try {
    const source = JSON.parse(docker(['inspect', SOURCE]))[0];
    assert.equal(source.State.Health.Status, 'healthy');
    step = 'schema preparation';
    const schema = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
    const migrations = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations']);
    const fixture = [
      `insert into public.institutions (id, slug, name, status) values ('${INSTITUTION}', 'i2c-${run}', '${INSTITUTION_NAME}', 'active');`,
      ...Object.values(USERS).map(user => `insert into auth.users (id, email) values ('${user.id}', '${user.id}@fixture.invalid');
insert into public.profiles (user_id, email, account_role, is_blocked) values ('${user.id}', '${user.id}@fixture.invalid', '${user.account}', false) on conflict (user_id) do update set account_role = excluded.account_role;
insert into public.memberships (institution_id, user_id, role) values ('${INSTITUTION}', '${user.id}', '${user.role}');`),
      ...STUDENTS.map(([id, email, dni]) => `insert into auth.users (id, email) values ('${id}', '${email}');
insert into public.profiles (user_id, email, account_role, is_blocked) values ('${id}', '${email}', 'alumno', false) on conflict (user_id) do update set account_role = 'alumno';
insert into public.memberships (institution_id, user_id, role) values ('${INSTITUTION}', '${id}', 'viewer');
insert into public.student_records (institution_id, workspace_key, first_name, last_name, dni, email, career, academic_year, profile_id) values ('${INSTITUTION}', 'main', 'Alumno', '${dni}', '${dni}', '${email}', '${CAREER_NAME.toUpperCase()}', '1', '${id}');`),
    ].join('\n');
    for (const [kind, database] of Object.entries(databases)) {
      assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
      created.push(kind);
      sql(`create database ${database} template template0; comment on database ${database} is '${markers[kind]}';`, 'postgres');
      sql(schema, database); sql(migrations, database);
      for (const file of BASELINE) sql(readFileSync(resolve('supabase/schema', file), 'utf8'), database);
      sql(fixture, database);
    }

    step = 'catalog from workbooks';
    await buildFixtureWorkbooks(workdir, CAREER_NAME);
    const log = console.log; console.log = () => {};
    try { await buildCatalogSql(['--academica', join(workdir, 'academica.xlsx'), '--alumnos', join(workdir, 'alumnos.xlsx'), '--institucion', INSTITUTION_NAME, '--con-correlativas', '--salida', join(workdir, 'catalogo.sql')]); } finally { console.log = log; }
    const academic = new ExcelJS.Workbook();
    await academic.xlsx.readFile(join(workdir, 'academica.xlsx'));
    const buffer = readFileSync(join(workdir, 'academica.xlsx'));
    const parsed = await parseTemplateV2MasterWorkbook({ name: 'academica.xlsx', arrayBuffer: async () => buffer });
    const students = new ExcelJS.Workbook();
    await students.xlsx.readFile(join(workdir, 'alumnos.xlsx'));
    const catalog = buildCatalogFromWorkbook({ workbook: academic, planesEstudio: parsed.datasets.planesEstudio, studentPlans: sheetRows(students.getWorksheet('alumnos_inscripciones')), withPrerequisites: true });
    assert.deepEqual(catalog.errors, []);
    const payload = buildCatalogPayload(catalog);
    // Camino de la app: el plan de cada alumno sale de las inscripciones que dejo el importador de alumnos.
    const studentsBuffer = readFileSync(join(workdir, 'alumnos.xlsx'));
    const imported = await parseTemplateV2StudentsWorkbook({ name: 'alumnos.xlsx', arrayBuffer: async () => studentsBuffer }, { planesEstudio: parsed.datasets.planesEstudio });
    const appCatalog = buildCatalogFromWorkbook({ workbook: academic, planesEstudio: parsed.datasets.planesEstudio, studentPlans: studentPlansFromEnrollments(imported.datasets.inscripcionesAlumnos), withPrerequisites: true });
    report.appPayloadMatches = JSON.stringify(buildCatalogPayload(appCatalog)) === JSON.stringify(payload);
    assert.ok(report.appPayloadMatches, 'app payload (imported enrollments) differs from script payload');

    step = 'permissions';
    report.editor = JSON.parse(last(sql(publishSql(USERS.editor.id, payload), databases.rpc)));
    report.teacher = JSON.parse(last(sql(publishSql(USERS.teacher.id, payload), databases.rpc)));
    report.afterDenied = JSON.parse(sql(CATALOG_DUMP_SQL, databases.rpc));
    assert.equal(report.editor.sqlstate, '42501');
    assert.equal(report.teacher.sqlstate, '42501');
    assert.deepEqual(report.afterDenied.careers, []);

    step = 'apply sql (A) and rpc (B)';
    sql(readFileSync(join(workdir, 'catalogo.sql'), 'utf8'), databases.sql);
    report.rpcFirst = JSON.parse(last(sql(publishSql(USERS.owner.id, payload), databases.rpc)));
    assert.equal(report.rpcFirst.error, undefined, JSON.stringify(report.rpcFirst));
    const dumpSql = JSON.parse(sql(CATALOG_DUMP_SQL, databases.sql));
    const dumpRpc = JSON.parse(sql(CATALOG_DUMP_SQL, databases.rpc));
    report.sizes = Object.fromEntries(Object.entries(dumpRpc).map(([key, rows]) => [key, rows.length]));
    report.equivalent = JSON.stringify(dumpSql) === JSON.stringify(dumpRpc);
    if (!report.equivalent) report.diff = { sql: dumpSql, rpc: dumpRpc };
    assert.ok(report.equivalent, 'RPC and SQL catalogs differ');
    // Solo Ana queda vinculada (por DNI): la carrera de Beto tiene dos planes activos y el fallback no adivina.
    assert.ok(report.sizes.prerequisites > 0 && report.sizes.student_plans === 1, JSON.stringify(report.sizes));

    step = 'idempotent';
    report.rpcSecond = JSON.parse(last(sql(publishSql(USERS.owner.id, payload), databases.rpc)));
    report.idempotent = JSON.stringify(JSON.parse(sql(CATALOG_DUMP_SQL, databases.rpc))) === JSON.stringify(dumpRpc);
    assert.ok(report.idempotent);

    step = 'rename aborts without writing';
    const renamed = { ...payload, careers: payload.careers.map(career => ({ ...career, name: `${career.name} Renombrada` })), subjects: payload.subjects.concat([{ code: 'NUEVA', name: 'No debe quedar', external_id: null }]) };
    report.rename = JSON.parse(last(sql(publishSql(USERS.owner.id, renamed), databases.rpc)));
    report.renameUnchanged = JSON.stringify(JSON.parse(sql(CATALOG_DUMP_SQL, databases.rpc))) === JSON.stringify(dumpRpc);
    assert.match(report.rename.error ?? '', /CATALOG_CAREER_RENAME/);
    assert.ok(report.renameUnchanged);
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.error = `Failed at ${step}: ${error.message.split('\n')[0]}`; }
  finally {
    const errors = [];
    for (const kind of created) {
      const database = databases[kind];
      try {
        if (sql(`select count(*) from pg_database where datname='${database}';`, 'postgres') === '1') {
          assert.equal(sql(`select shobj_description(oid,'pg_database') from pg_database where datname='${database}';`, 'postgres'), markers[kind]);
          sql(`drop database ${database} with (force);`, 'postgres');
        }
      } catch { errors.push(`Database cleanup failed (${kind})`); }
    }
    try { rmSync(workdir, { recursive: true, force: true }); } catch { errors.push('Temp cleanup failed'); }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, errors };
    if (errors.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
