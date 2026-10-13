// Local disposable DB only. No URLs, credentials, CLI linking or remote calls.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const container = 'supabase_db_codex-baseline-local-7725bdda';
const examRevalidationOnly = process.argv.includes('--exam-revalidation');
const args = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const institution = 'a1000000-0000-4000-8000-000000000001';
const student = 'a2000000-0000-4000-8000-000000000003';
const teacher = 'a2000000-0000-4000-8000-000000000002';
const record = 'a8000000-0000-4000-8000-000000000001';
const enrollment = 'ae000000-0000-4000-8000-000000000001';
const classId = 'ac000000-0000-4000-8000-000000000001';
const tableId = 'aa000000-0000-4000-8000-000000000001';
const tableSubject = 'ab000000-0000-4000-8000-000000000001';
const sqlSync = (sql) => {
  const result = spawnSync('docker', args, { input: sql, encoding: 'utf8', timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(result.stderr || String(result.error));
  return result.stdout.trim();
};
class Session {
  constructor(name) {
    this.name = name;
    this.child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.buffer = '';
    this.errors = '';
    this.child.stdout.on('data', (chunk) => { this.buffer += chunk.toString(); this.finish(); });
    this.child.stderr.on('data', (chunk) => { this.errors += chunk.toString(); });
    this.child.on('error', (error) => this.pending?.reject(error));
    this.child.on('exit', (code) => this.pending?.reject(new Error(`${name} psql exited ${code}: ${this.errors}`)));
  }
  finish() {
    if (!this.pending || !this.buffer.includes(`${this.pending.marker}\n`)) return;
    const pending = this.pending;
    const index = this.buffer.indexOf(`${pending.marker}\n`);
    const output = this.buffer.slice(0, index).trim();
    this.buffer = this.buffer.slice(index + pending.marker.length + 1);
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(output);
  }
  exec(sql) {
    if (this.pending) throw new Error('Harness attempted overlapping commands in one session');
    return new Promise((resolve, reject) => {
      const marker = `DONE_${this.name}_${++sequence}`;
      const timer = setTimeout(() => reject(new Error(`HARNESS_TIMEOUT: ${this.name}`)), 15000);
      this.pending = { marker, resolve, reject, timer };
      this.child.stdin.write(`${sql}\nselect '${marker}';\n`);
    });
  }
  close() { if (this.pending) clearTimeout(this.pending.timer); this.child.stdin.end(); }
}
let sequence = 0;
let fixturesCommitted = false;
let a;
let b;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const auth = (user) => `set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true);`;
const subjectRpc = (status = 'active') => `select id from public.upsert_subject_enrollment_from_portal('${institution}','main','${student}','${student}','FIX-A-01','Fixture Career A','${record}','${status}',null,null,null,'concurrency-subject');`;
const examRpc = (key, status = 'registered') => `select id from public.upsert_exam_enrollment_from_portal('${institution}','main','${student}','${student}','${record}','${tableId}','FIX-A-01','Fixture Career A','${status}',null,null,null,'${key}');`;
const gradeRpc = `select id from public.academic_teacher_upsert_student_grade('${institution}','main','${student}','${record}','${enrollment}','FIX-A-01','Fixture Career A','parcial',1,8,'pending',null);`;
const attendanceRpc = `select id from public.academic_teacher_upsert_attendance_records('${classId}','[{"student_id":"${student}","subject_enrollment_id":"${enrollment}","status":"present"}]');`;
async function blockedByA(pidB, label) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const blocked = await a.exec(`select ${a.pid} = any(pg_blocking_pids(${pidB}));`);
    if (blocked === 't') { console.log(`LOCK_WAIT ${label}: pid ${pidB} blocked by ${a.pid}`); return; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`HARNESS_NO_LOCK_WAIT: ${label}`);
}
async function concurrentUpsert(label, user, rpc, invariant) {
  await a.exec(`begin; ${auth(user)} ${rpc}`);
  const other = b.exec(`begin; ${auth(user)} ${rpc} commit;`).then(
    (output) => ({ output }), (error) => ({ error }));
  // Observe blocking through session A, not an assumed sleep interval.
  await blockedByA(b.pid, label);
  await a.exec('commit;');
  const outcome = await other;
  if (outcome.error) throw outcome.error;
  assert(await a.exec(invariant) === 't', `P1_${label}_DUPLICATE_OR_INVALID_STATE`);
  console.log(`PASS ${label}`);
}
async function overlapping(label, firstSql, secondSql, invariant) {
  await a.exec(`begin; ${firstSql}`);
  const other = b.exec(`begin; ${secondSql} commit;`).then(
    (output) => ({ output }), (error) => ({ error }));
  await blockedByA(b.pid, label);
  await a.exec('commit;');
  const outcome = await other;
  if (outcome.error) throw outcome.error;
  assert(await a.exec(invariant) === 't', `P1_${label}_INVALID_STATE`);
  console.log(`PASS ${label}`);
}
const expectDenied = (rpc, code) => `do $$ begin
  begin ${rpc.replace('select id from', 'perform * from')}
  exception when others then if sqlerrm='${code}' then return; end if; raise; end;
  raise exception 'P1_EXPECTED_CONCURRENT_DENIAL: ${code}'; end $$;`;
try {
  assert(sqlSync(`select count(*) from public.institutions where id in ('${institution}','b1000000-0000-4000-8000-000000000001');`) === '0', 'HARNESS_FIXTURE_NAMESPACE_OCCUPIED');
  assert(sqlSync(`select count(*) from auth.users where id in (${[...sourceUserIds()].map((id) => `'${id}'`).join(',')});`) === '0', 'HARNESS_AUTH_FIXTURE_NAMESPACE_OCCUPIED');
  const source = readFileSync(fileURLToPath(new URL('./local_ab_rls_rpc_validation.sql', import.meta.url)), 'utf8');
  const start = source.indexOf('begin;');
  const end = source.indexOf('-- Modo focal:');
  assert(start >= 0 && end > start, 'HARNESS_FIXTURE_SOURCE_CHANGED');
  const fixtures = source.slice(start, end);
  sqlSync(`${fixtures}
    insert into public.subject_enrollments(id,institution_id,workspace_key,subject_id,program_id,student_id,student_record_id)
    values('${enrollment}','${institution}','main','FIX-A-01','Fixture Career A','${student}','${record}');
    insert into public.subject_teacher_assignments(institution_id,workspace_key,subject_id,program_id,teacher_id,role)
    values('${institution}','main','FIX-A-01','Fixture Career A','${teacher}','titular');
    insert into public.subject_class_sessions(id,institution_id,workspace_key,subject_id,program_id,teacher_id,session_date)
    values('${classId}','${institution}','main','FIX-A-01','Fixture Career A','${teacher}',current_date);
    commit;`);
  fixturesCommitted = true;
  a = new Session('A'); b = new Session('B');
  for (const session of [a, b]) {
    session.pid = Number(await session.exec("set statement_timeout='12s'; set lock_timeout='10s'; select pg_backend_pid();"));
    assert(Number.isInteger(session.pid) && session.pid > 0, 'HARNESS_INVALID_PID');
  }
  assert(a.pid !== b.pid, 'HARNESS_NOT_TWO_SESSIONS');
  console.log(`SESSIONS A=${a.pid} B=${b.pid}`);
  if (!examRevalidationOnly) {
    await concurrentUpsert('subject_double_upsert', student, subjectRpc(),
      `select count(*)=1 from public.subject_enrollments where institution_id='${institution}' and student_id='${student}' and subject_id='FIX-A-01';`);
  }
  await concurrentUpsert('exam_same_idempotency_key', student, examRpc('concurrency-exam'),
    `select (select count(*) from public.exam_enrollments where institution_id='${institution}' and client_mutation_id='concurrency-exam')=1 and (select count(*) from public.exam_enrollment_events where institution_id='${institution}' and client_mutation_id='concurrency-exam')=1;`);
  if (!examRevalidationOnly) {
    await concurrentUpsert('grade_double_upsert', teacher, gradeRpc,
    `select count(*)=1 from public.student_grades where institution_id='${institution}' and grade_type='parcial' and attempt_number=1 and deleted_at is null;`);
  await concurrentUpsert('attendance_double_upsert', teacher, attendanceRpc,
    `select count(*)=1 from public.subject_attendance_records where session_id='${classId}' and student_id='${student}';`);
  }

  await a.exec(`begin; ${auth(student)} ${examRpc('concurrency-before-close-cancel','cancelled')} commit;`);
  assert(await a.exec(`select count(*)=0 from public.exam_enrollments where institution_id='${institution}' and status='registered';`) === 't',
    'HARNESS_EXPECTED_NO_ACTIVE_EXAM_ENROLLMENT');
  const beforeClose = await a.exec(`select jsonb_agg(to_jsonb(e) order by id) from public.exam_enrollments e where institution_id='${institution}';`);
  // True stale-context race: hold the same resource advisory lock, let the RPC
  // validate the open table and wait, then close the table before releasing it.
  await a.exec(`begin; select pg_advisory_xact_lock(hashtextextended('${institution}:main:${tableSubject}:${record}',0));`);
  const racingExam = b.exec(`begin; ${auth(student)} ${expectDenied(examRpc('concurrency-after-close'),'EXAM_TABLE_NOT_AVAILABLE')} commit;`).then(
    (output) => ({ output }), (error) => ({ error }));
  await blockedByA(b.pid, 'exam_validation_vs_close');
  await a.exec(`update public.exam_tables set status='closed' where id='${tableId}'; commit;`);
  const examOutcome = await racingExam;
  if (examOutcome.error) throw examOutcome.error;
  const lateRegistration = await a.exec(`select json_build_object('registered_rows',count(*),'table_status',min(t.status))
    from public.exam_enrollments e join public.exam_tables t on t.id=e.exam_table_id
    where e.institution_id='${institution}' and e.client_mutation_id='concurrency-after-close' and e.status='registered';`);
  console.log(`OBSERVED exam_validation_vs_close ${lateRegistration}`);
  const lateState = JSON.parse(lateRegistration);
  assert(lateState.registered_rows === 0, 'P1_EXAM_REGISTERED_AFTER_CLOSE');
  assert(await a.exec(`select jsonb_agg(to_jsonb(e) order by id) from public.exam_enrollments e where institution_id='${institution}';`) === beforeClose,
    'P1_EXAM_CLOSE_REJECTION_CHANGED_ENROLLMENT');
  assert(await a.exec(`select count(*)=0 from public.exam_enrollment_events where client_mutation_id='concurrency-after-close' and institution_id='${institution}';`) === 't',
    'P1_EXAM_CLOSE_REJECTION_CREATED_EVENT');
  console.log('PASS exam_validation_vs_close_denied_no_mutation');
  await a.exec(`update public.exam_tables set status='open' where id='${tableId}';`);
  await overlapping('exam_still_open_after_advisory_wait',
    `select pg_advisory_xact_lock(hashtextextended('${institution}:main:${tableSubject}:${record}',0));`,
    `${auth(student)} ${examRpc('concurrency-still-open')}`,
    `select count(*)=1 from public.exam_enrollments where institution_id='${institution}' and client_mutation_id='concurrency-still-open' and status='registered';`);
  await overlapping('exam_row_share_lock_blocks_close', `${auth(student)} ${examRpc('concurrency-row-lock')}`,
    `update public.exam_tables set status='closed' where id='${tableId}';`,
    `select status='closed' from public.exam_tables where id='${tableId}';`);
  await a.exec(`update public.exam_tables set status='open' where id='${tableId}';`);
  await overlapping('exam_window_changed_while_waiting',
    `select pg_advisory_xact_lock(hashtextextended('${institution}:main:${tableSubject}:${record}',0));
     update public.exam_tables set enrollment_closes_at=clock_timestamp()-interval '1 second' where id='${tableId}';`,
    `${auth(student)} ${expectDenied(examRpc('concurrency-window-changed'),'EXAM_ENROLLMENT_WINDOW_CLOSED')}`,
    `select count(*)=0 from public.exam_enrollment_events where institution_id='${institution}' and client_mutation_id='concurrency-window-changed';`);
  await a.exec(`update public.exam_tables set enrollment_closes_at=clock_timestamp()+interval '2 seconds' where id='${tableId}';`);
  await a.exec(`begin; select pg_advisory_xact_lock(hashtextextended('${institution}:main:${tableSubject}:${record}',0));`);
  const expiredWindow = b.exec(`begin; ${auth(student)} ${expectDenied(examRpc('concurrency-window-expired'),'EXAM_ENROLLMENT_WINDOW_CLOSED')} commit;`).then(
    (output) => ({ output }), (error) => ({ error }));
  await blockedByA(b.pid,'exam_window_elapsed_while_waiting');
  await a.exec('select pg_sleep(2.1); commit;');
  const expiredOutcome = await expiredWindow;
  if (expiredOutcome.error) throw expiredOutcome.error;
  assert(await a.exec(`select count(*)=0 from public.exam_enrollment_events where institution_id='${institution}' and client_mutation_id='concurrency-window-expired';`) === 't',
    'P1_EXAM_EXPIRED_WINDOW_CREATED_EVENT');
  console.log('PASS exam_window_elapsed_while_waiting_denied');
  await a.exec(`update public.exam_tables set enrollment_closes_at=clock_timestamp()+interval '1 day' where id='${tableId}';`);
  if (!examRevalidationOnly) {
  await overlapping('subject_drop_vs_reactivate', `${auth(student)} ${subjectRpc('dropped')}`,
    `${auth(student)} ${subjectRpc('active')}`,
    `select count(*)=1 and bool_and(status='active' and deleted_at is null and dropped_at is null)
      from public.subject_enrollments where id='${enrollment}';`);
  await overlapping('subject_reactivate_vs_drop', `${auth(student)} ${subjectRpc('active')}`,
    `${auth(student)} ${subjectRpc('dropped')}`,
    `select count(*)=1 and bool_and(status='dropped' and deleted_at is not null and dropped_at is not null)
      from public.subject_enrollments where id='${enrollment}';`);
  await a.exec(`update public.subject_enrollments set status='active',deleted_at=null,dropped_at=null where id='${enrollment}';`);
  await overlapping('exam_cancel_vs_register', `${auth(student)} ${examRpc('concurrency-cancel','cancelled')}`,
    `${auth(student)} ${examRpc('concurrency-reactivate')}`,
    `select (select count(*) from public.exam_enrollments where institution_id='${institution}' and status='registered')=1
      and (select count(*) from public.exam_enrollment_events where institution_id='${institution}' and client_mutation_id in ('concurrency-cancel','concurrency-reactivate'))=2;`);
  const gradeVersion = Number(await a.exec(`select lock_version from public.student_grades where institution_id='${institution}' and grade_type='parcial';`));
  const versionedGrade = gradeRpc.replace("'pending',null)", `'pending',${gradeVersion})`);
  await overlapping('grade_optimistic_conflict', `${auth(teacher)} ${versionedGrade}`,
    `${auth(teacher)} ${expectDenied(versionedGrade,'ACADEMIC_LOCK_VERSION_CONFLICT')}`,
    `select lock_version=${gradeVersion + 1} from public.student_grades where institution_id='${institution}' and grade_type='parcial';`);
  for (const [name, rpc] of [['grade', gradeRpc], ['attendance', attendanceRpc]]) {
    await overlapping(`${name}_enrollment_changed_before_validation`,
      `update public.subject_enrollments set status='dropped',deleted_at=now() where id='${enrollment}';`,
      `${auth(teacher)} ${expectDenied(rpc,'STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND')}`,
      `select status='dropped' from public.subject_enrollments where id='${enrollment}';`);
    await a.exec(`update public.subject_enrollments set status='active',deleted_at=null,dropped_at=null where id='${enrollment}';`);
    await overlapping(`${name}_validation_share_lock_blocks_change`, `${auth(teacher)} ${rpc}`,
      `update public.subject_enrollments set status='dropped',deleted_at=now() where id='${enrollment}';`,
      `select status='dropped' from public.subject_enrollments where id='${enrollment}';`);
    await a.exec(`update public.subject_enrollments set status='active',deleted_at=null,dropped_at=null where id='${enrollment}';`);
  }
  await overlapping('attendance_class_changed_before_validation',
    `update public.subject_class_sessions set subject_id='OTHER' where id='${classId}';`,
    `${auth(teacher)} ${expectDenied(attendanceRpc,'ACADEMIC_COMMAND_FORBIDDEN')}`,
    `select subject_id='OTHER' from public.subject_class_sessions where id='${classId}';`);
  await a.exec(`update public.subject_class_sessions set subject_id='FIX-A-01' where id='${classId}';`);
  await overlapping('attendance_class_share_lock_blocks_change', `${auth(teacher)} ${attendanceRpc}`,
    `update public.subject_class_sessions set subject_id='OTHER' where id='${classId}';`,
    `select subject_id='OTHER' from public.subject_class_sessions where id='${classId}';`);
  }
  console.log(examRevalidationOnly ? 'CONCURRENCY_EXAM_REVALIDATION_PASS' : 'CONCURRENCY_LOCAL_PASS');
} catch (error) {
  console.error(String(error.message));
  process.exitCode = 1;
} finally {
  // Release test locks before cleanup; no broad container reset or schema changes.
  if (a) { a.child.kill(); a.close(); }
  if (b) { b.child.kill(); b.close(); }
  if (fixturesCommitted) {
    try {
      const ids = `'${institution}','b1000000-0000-4000-8000-000000000001'`;
      const tables = ['exam_enrollment_events','exam_table_events','exam_absence_penalties','exam_enrollments',
        'exam_teacher_assignments','exam_table_subjects','exam_tables','subject_attendance_records',
        'subject_class_sessions','student_grades','subject_teacher_assignments','subject_enrollments',
        'student_academic_statuses','student_career_plans','teacher_records','student_records',
        'subject_prerequisites','study_plan_subjects','study_plans','subjects','careers','workspace_snapshots','memberships'];
      const users = [...sourceUserIds()];
      sqlSync(`begin; ${tables.map((table) => `delete from public.${table} where institution_id in (${ids});`).join('\n')}
        delete from public.institutions where id in (${ids}) and slug in ('fixture-ab-a','fixture-ab-b');
        delete from auth.users where id in (${users.map((id) => `'${id}'`).join(',')}) and email like '%@fixture.invalid'; commit;`);
      assert(sqlSync(`select count(*) from public.institutions where id in (${ids});`) === '0', 'HARNESS_CLEANUP_FAILED');
      assert(sqlSync(`select count(*) from auth.users where id in (${users.map((id) => `'${id}'`).join(',')});`) === '0', 'HARNESS_AUTH_CLEANUP_FAILED');
      for (const table of tables) {
        assert(sqlSync(`select count(*) from public.${table} where institution_id in (${ids});`) === '0', `HARNESS_CLEANUP_FAILED: ${table}`);
      }
      console.log('CLEANUP_PASS institutions/auth/fixture_tables=0');
    } catch (error) { console.error(`CLEANUP_FAILED: ${error.message}`); process.exitCode = 1; }
  }
}
function sourceUserIds() {
  return new Set(['a','b'].flatMap((prefix) => (prefix === 'a' ? [1,2,3,4,5,6] : [1,2,3,6])
    .map((number) => `${prefix}2000000-0000-4000-8000-${String(number).padStart(12,'0')}`)));
}
