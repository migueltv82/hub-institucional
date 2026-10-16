import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';

export const TARGET = 'supabase_db_codex-baseline-local-7725bdda';
export const DIAGNOSTIC = 'supabase/security/academic_status_canonical_diagnostic.sql';
const canonical = ['pending', 'regular', 'libre', 'promocionado', 'approved', 'failed', 'absent'];
const institution = tenant => `${tenant}1000000-0000-4000-8000-000000000001`;
const student = (tenant, number) => `${tenant}2000000-0000-4000-8000-00000000000${number}`;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;

export function parseTarget(args) {
  assert.deepEqual(args, ['--target', TARGET], 'Explicit approved local target required');
  return TARGET;
}

// Deliberately unequal tenant counts expose grouping or cross-tenant aggregation mistakes.
export function fixtureSql() {
  const statements = [];
  for (const tenant of ['a', 'b']) {
    statements.push(`insert into public.institutions(id,name,slug) values ('${institution(tenant)}','Diagnostic ${tenant}','diagnostic-${tenant}');`);
    for (const number of [1, 2]) statements.push(`insert into auth.users(id,email,raw_app_meta_data) values ('${student(tenant, number)}','diagnostic-${tenant}${number}@fixture.invalid','{"account_role":"alumno"}');`);
    const statuses = tenant === 'a'
      ? [['Regular', 1], ['Regular', 1], ['Regular', 2], ['regular ', 1], ['regular ', 1], ['Pendiente', 1], ['cursando', 2], ['cursando', 2]]
      : [['Regular', 1], ['regular ', 1], ['regular ', 2], ['regular ', 2], ['Pendiente', 1], ['Pendiente', 2], ['cursando', 1]];
    let attempt = 0;
    for (const [status, number, deleted] of [...statuses, ...canonical.map(status => [status, 1]), ['Regular', 2, true], ['cursando', 1, true]]) {
      statements.push(`insert into public.student_grades(institution_id,student_id,subject_id,academic_status,attempt_number,deleted_at) values ('${institution(tenant)}','${student(tenant, number)}','DIAGNOSTIC',${quote(status)},${++attempt},${deleted ? 'now()' : 'null'});`);
    }
  }
  return `begin;\n${statements.join('\n')}\ncommit;`;
}

export function verifyOutput(output) {
  const lines = output.split(/\r?\n/).filter(Boolean);
  assert.equal(lines.shift(), 'READ_ONLY=on');
  const rows = lines.map(line => {
    const fields = line.split('\t');
    assert.equal(fields.length, 7, 'Unexpected diagnostic projection');
    const [id, name, status, length, count, students, updated] = fields;
    assert.ok(!Number.isNaN(Date.parse(updated)), 'Missing last_updated_at');
    return [id, name, status, Number(length), Number(count), Number(students)];
  });
  const expected = [
    ['a', 'Regular', 7, 3, 2], ['a', 'regular ', 8, 2, 1], ['a', 'Pendiente', 9, 1, 1], ['a', 'cursando', 8, 2, 1],
    ['b', 'Regular', 7, 1, 1], ['b', 'regular ', 8, 3, 2], ['b', 'Pendiente', 9, 2, 2], ['b', 'cursando', 8, 1, 1],
  ].map(([tenant, ...rest]) => [institution(tenant), `Diagnostic ${tenant}`, ...rest]);
  const sort = values => values.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(sort(rows), sort(expected), 'Exact tenant/raw-status counts differ');
  return rows;
}

export async function main(args = process.argv.slice(2)) {
  const target = parseTarget(args); // Reject every other target before calling Docker.
  const run = randomBytes(8).toString('hex');
  const database = `gotrue_harness_${run}`;
  const report = { run, target, database, staging: 'NONE', production: 'NONE', remoteSql: 'NONE' };
  let creationAttempted = false, step = 'preflight', failureCode;
  const docker = (arguments_, input) => {
    try { return execFileSync('docker', arguments_, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) {
      const sqlstate = String(error.stderr ?? '').match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] ?? 'unavailable';
      failureCode = sqlstate;
      throw new Error(`Local operation failed at ${step}; SQLSTATE=${sqlstate}`);
    }
  };
  const sql = (query, db = database) => docker(['exec', '-i', target, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'supabase_admin', '-d', db, '-At', '-F', '\t'], query).trimEnd();
  try {
    const source = JSON.parse(docker(['inspect', target]))[0];
    assert.equal(source.Config.Image, 'public.ecr.aws/supabase/postgres:17.6.1.165');
    assert.equal(source.State.Health.Status, 'healthy');
    const schema = docker(['exec', target, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
    assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
    step = 'create owned disposable database';
    // Separate CREATE and marker: CREATE DATABASE cannot run inside a multi-statement transaction.
    creationAttempted = true;
    sql(`create database ${database} template template0;`, 'postgres');
    sql(`comment on database ${database} is '${run}';`, 'postgres');
    step = 'schema and synthetic fixture';
    step = 'restore schema';
    sql(`begin;\n${schema}\ncommit;`);
    for (const file of BASELINE) {
      step = `baseline ${file}`;
      sql(readFileSync(resolve('supabase/schema', file), 'utf8'));
    }
    step = 'synthetic fixture';
    sql(fixtureSql());
    const snapshotQuery = "select md5(string_agg(to_jsonb(g)::text, '' order by id)) from public.student_grades g;";
    const before = sql(snapshotQuery);
    assert.equal(sql("select count(*) from public.student_grades where deleted_at is null and academic_status in ('pending','regular','libre','promocionado','approved','failed','absent');"), '14');
    assert.equal(sql('select count(*) from public.student_grades where deleted_at is not null;'), '4');
    step = 'existing read-only diagnostic';
    const query = readFileSync(resolve(DIAGNOSTIC), 'utf8');
    report.diagnosticSha256 = createHash('sha256').update(query).digest('hex');
    report.rows = verifyOutput(sql(`begin read only; set local statement_timeout='10s'; select 'READ_ONLY=' || current_setting('transaction_read_only');\n${query}\nrollback;`));
    assert.equal(sql(snapshotQuery), before, 'Diagnostic changed grade rows');
    report.snapshotUnchanged = true;
    report.canonicalExcluded = 14;
    report.deletedExcluded = 4;
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.error = `Failed at ${step}: ${error.name}`; if (failureCode) report.sqlstate = failureCode; }
  finally {
    const errors = [];
    if (creationAttempted) {
      try {
        step = 'cleanup';
        const existing = sql(`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='${database}';`, 'postgres');
        if (existing) {
          const ownership = JSON.parse(existing);
          assert.equal(ownership.owner, 'supabase_admin');
          // Null marker is recoverable only for this random name proven absent before CREATE.
          assert.ok(ownership.marker === run || ownership.marker === null);
          sql(`drop database ${database} with (force);`, 'postgres');
        }
        assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
      } catch { errors.push('Owned database cleanup could not be verified'); }
    }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, containers: 0, temporaryFiles: 0, errors };
    if (errors.length) report.result = 'FAIL';
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
