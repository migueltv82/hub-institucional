// Real local PostgreSQL, independent TCP sessions. No Supabase/remote access.
import { gatewaySchemaFixture } from './source_file_storage_gateway.fixture.mjs'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { verifyClearHttpIdempotency } from './source_file_storage_clear.http.mjs'

const require = createRequire(resolve(process.argv[2], 'package.json'))
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href)
const root = mkdtempSync(join(tmpdir(), 'hub-storage-clear-sessions-'))
const socket = createServer()
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise((resolve) => socket.close(resolve))
const cluster = new EmbeddedPostgres({ databaseDir: join(root, 'db'), port, user: 'postgres', password: randomUUID(), persistent: true, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
const a='a2300000-0000-4000-8000-000000000001', b='b2300000-0000-4000-8000-000000000001'
const tenant='a1300000-0000-4000-8000-000000000001', foreign='b1300000-0000-4000-8000-000000000001'
let A, B, started=false, failed=false
const cases=[]
async function denied(session, sql, args, message) {
  await assert.rejects(session.query(sql,args), (error) => error.message===message)
}
try {
  console.log('LOCAL_POSTGRES_INITIALIZING')
  await cluster.initialise(); console.log('LOCAL_POSTGRES_STARTING'); await cluster.start(); started=true
  console.log('LOCAL_POSTGRES_CONNECTING')
  A=cluster.getPgClient(); B=cluster.getPgClient(); await A.connect(); await B.connect()
  console.log('LOCAL_POSTGRES_SCHEMA')
  await A.query(gatewaySchemaFixture({a,b,tenant,foreign}))
  // Representative real FK behavior: cross-workspace SET NULL and unscoped CASCADE.
  await A.query(`create table student_records(id uuid primary key,institution_id uuid,workspace_key text);
    create table student_grades(id uuid primary key,institution_id uuid,workspace_key text,student_record_id uuid references student_records(id) on delete set null);
    create table student_career_plans(id uuid primary key,institution_id uuid,student_id uuid references student_records(id) on delete cascade);
    grant all on workspace_snapshots,student_records,student_grades,student_career_plans,memberships,profiles,institutions,auth.users to service_role;`)
  await A.query(readFileSync(new URL('./source_file_storage_gateway.sql',import.meta.url),'utf8'))
  await A.query(`insert into workspace_snapshots(institution_id,workspace_key,payload) values($1,'main','{"old":true}'),($1,'other','{"keep":true}')`,[tenant])
  await A.query('set role service_role'); await B.query('set role service_role')
  const resource=(await A.query(`select id from source_file_storage_resources where institution_id=$1 and workspace_key='main' and dataset_key='horarios'`,[tenant])).rows[0].id
  const prefix=`${tenant}/${a}/main/horarios/`
  const prepare=async(session,id=randomUUID()) => {
    await session.query('select source_file_storage_reserve($1,$2,$3,$4,$5,$6,$7)',[resource,a,id,prefix+id,'horarios.csv','text/csv',5]); return id
  }
  const finalize=async(session,id) => session.query('select source_file_storage_commit($1,$2,$3)',[resource,a,id])
  const clear=async(session,id=randomUUID(),resume=false) => (await session.query('select source_file_storage_begin_clear($1,$2,$3,$4,$5) job',[tenant,'main',a,id,resume])).rows[0].job
  const finish=async(session,id) => session.query('select source_file_storage_finish_clear($1,$2,$3,$4)',[tenant,'main',a,id])
  const physical=async(session,job) => {
    for (const captured of job.captured_keys) await session.query('delete from storage.objects where bucket_id=$1 and name=$2',['workspace-source-files',captured.storage_path])
    await finish(session,job.id)
  }
  const old=await prepare(A); await finalize(A,old)
  console.log('LOCAL_POSTGRES_INTERLEAVINGS')
  await A.query('insert into storage.objects values($1,$2)',['workspace-source-files',prefix+old])
  const pending=await prepare(A)
  await A.query('begin')
  const job=await clear(A)
  await denied(B,'select source_file_storage_reserve($1,$2,$3,$4,$5,$6,$7)',[resource,a,randomUUID(),prefix+randomUUID(),'h.csv','text/csv',5],'SOURCE_FILE_WORKSPACE_BUSY')
  cases.push('clear vs upload: barrier denies concurrent mutation')
  await denied(B,'select source_file_storage_begin_delete($1,$2)',[resource,a],'SOURCE_FILE_WORKSPACE_BUSY')
  cases.push('clear vs delete/replace: shared barrier')
  await denied(B,'select source_file_storage_begin_clear($1,$2,$3,$4)',[tenant,'main',a,randomUUID()],'SOURCE_FILE_WORKSPACE_BUSY')
  cases.push('two simultaneous clears: one linearizes, other retries')
  await B.query(`update workspace_snapshots set payload='{"newB":true}' where institution_id=$1 and workspace_key='other'`,[tenant])
  cases.push('workspace A does not block B')
  // UPDATE first waits on the existing snapshot tuple; its row trigger obtains
  // the barrier after clear commits. It must survive as a post-T0 mutation.
  const waitingSnapshot=B.query(`update workspace_snapshots set payload='{"waitedAfterT0":true}' where institution_id=$1 and workspace_key='main'`,[tenant])
  await A.query('commit')
  await waitingSnapshot
  assert.deepEqual((await B.query(`select payload from workspace_snapshots where workspace_key='main'`)).rows[0].payload,{waitedAfterT0:true})
  console.log('LOCAL_POSTGRES_CUTOFF_COMMITTED')
  await B.query('insert into storage.objects values($1,$2)',['workspace-source-files',prefix+pending])
  await denied(B,'select source_file_storage_commit($1,$2,$3)',[resource,a,pending],'SOURCE_FILE_INVALID_OPERATION')
  cases.push('pre-clear signed bytes arriving late cannot become live')
  const after=await prepare(B); await finalize(B,after)
  await B.query('insert into storage.objects values($1,$2)',['workspace-source-files',prefix+after])
  await B.query(`update workspace_snapshots set payload='{"postT0":true}' where institution_id=$1 and workspace_key='main'`,[tenant])
  const student=randomUUID(), grade=randomUUID()
  await B.query('insert into student_records values($1,$2,$3)',[student,tenant,'main'])
  await B.query('insert into student_grades values($1,$2,$3,$4)',[grade,tenant,'main',student])
  const resumed=await clear(A,job.id,true)
  assert.deepEqual(resumed.captured_keys,job.captured_keys); assert.equal(resumed.id,job.id)
  assert.ok(job.captured_keys.some((row)=>row.storage_path===prefix+old))
  assert.ok(job.captured_keys.some((row)=>row.storage_path===prefix+pending))
  assert.ok(!job.captured_keys.some((row)=>row.storage_path===prefix+after))
  await physical(A,resumed)
  assert.equal((await B.query('select storage_path from workspace_source_files')).rows[0].storage_path,prefix+after)
  assert.equal((await B.query('select count(*)::int n from storage.objects')).rows[0].n,1)
  assert.deepEqual((await B.query(`select payload from workspace_snapshots where workspace_key='main'`)).rows[0].payload,{postT0:true})
  assert.equal((await B.query('select count(*)::int n from student_grades')).rows[0].n,1)
  await physical(A,await clear(A,job.id))
  assert.equal((await B.query('select count(*)::int n from student_grades')).rows[0].n,1)
  cases.push('delayed cleanup, resume and lost-response retry preserve post-T0 file/snapshot/grade')
  // Old delete completion must not erase a replacement committed after clear.
  const deleting=(await A.query('select source_file_storage_begin_delete($1,$2) op',[resource,a])).rows[0].op
  console.log('LOCAL_POSTGRES_REPLACEMENT')
  const secondJob=await clear(A)
  const replacement=await prepare(B); await finalize(B,replacement)
  await B.query('insert into storage.objects values($1,$2)',['workspace-source-files',prefix+replacement])
  await A.query('select source_file_storage_finish_delete($1,$2,$3)',[resource,a,deleting.id])
  await physical(A,secondJob)
  assert.equal((await B.query('select storage_path from workspace_source_files')).rows[0].storage_path,prefix+replacement)
  cases.push('stale delete completion and clear cleanup preserve replacement')
  const late=await prepare(B)
  // An unscoped cascade is rejected without partial logical deletion.
  const protectedStudent=randomUUID()
  await B.query('insert into student_records values($1,$2,$3)',[protectedStudent,tenant,'main'])
  await B.query('insert into student_career_plans values($1,$2,$3)',[randomUUID(),tenant,protectedStudent])
  const before=(await B.query('select revision from source_file_workspace_revisions where institution_id=$1 and workspace_key=$2',[tenant,'main'])).rows[0].revision
  console.log('LOCAL_POSTGRES_DEPENDENCIES')
  await denied(A,'select source_file_storage_begin_clear($1,$2,$3,$4)',[tenant,'main',a,randomUUID()],'SOURCE_FILE_WORKSPACE_DEPENDENT_DATA')
  assert.equal((await B.query('select state from source_file_storage_operations where id=$1',[late])).rows[0].state,'pending')
  assert.equal((await B.query('select revision from source_file_workspace_revisions where institution_id=$1 and workspace_key=$2',[tenant,'main'])).rows[0].revision,before)
  await B.query('delete from student_career_plans')
  await B.query('insert into student_grades values($1,$2,$3,$4)',[randomUUID(),tenant,'other',protectedStudent])
  await denied(A,'select source_file_storage_begin_clear($1,$2,$3,$4)',[tenant,'main',a,randomUUID()],'SOURCE_FILE_WORKSPACE_DEPENDENT_DATA')
  cases.push('unscoped cascade and cross-workspace SET NULL fail closed, full rollback')
  await B.query(`delete from student_grades where workspace_key='other'`)
  const finalJob=await clear(A); await physical(A,finalJob)
  await B.query('insert into storage.objects values($1,$2)',['workspace-source-files',prefix+late])
  await denied(B,'select source_file_storage_commit($1,$2,$3)',[resource,a,late],'SOURCE_FILE_INVALID_OPERATION')
  // Model expiry after the actual SQL rejected publication, then sweep exact journal keys.
  await B.query(`update source_file_storage_operations set expires_at=now()-interval '1 day'`)
  const candidates=(await B.query('select source_file_storage_cleanup_candidates($1,$2) paths',[resource,a])).rows[0].paths
  for (const row of candidates) await B.query('delete from storage.objects where name=$1',[row.storage_path])
  assert.equal((await B.query('select count(*)::int n from storage.objects')).rows[0].n,0)
  cases.push(...await verifyClearHttpIdempotency({A,B,tenant,actor:a,resource,prefix}))
  await B.query('delete from student_grades; delete from student_career_plans; delete from student_records; delete from workspace_source_files; delete from source_file_storage_operations; delete from source_file_workspace_clears; delete from source_file_storage_resources; delete from workspace_snapshots; delete from source_file_workspace_revisions; delete from memberships; delete from profiles; delete from institutions; delete from auth.users;')
  assert.equal((await B.query('select count(*)::int n from auth.users')).rows[0].n,0)
  cases.push('cleanup: zero objects, users and workspace fixtures')
  console.log(JSON.stringify({result:'LOCAL_REAL_POSTGRES_CONCURRENCY_PASS',sessions:2,cases,remoteMutations:'NONE',cleanup:0}))
} catch(error) {
  console.error(JSON.stringify({result:'LOCAL_REAL_POSTGRES_CONCURRENCY_FAIL',message:error.message,code:error.code}))
  failed=true
} finally {
  if (A) await A.end(); if (B) await B.end()
  if (started) await cluster.stop()
  const within=relative(tmpdir(),root)
  if (isAbsolute(within)||within.startsWith('..')||!within.startsWith('hub-storage-clear-sessions-')) throw new Error('Unsafe temporary cleanup path')
  rmSync(root,{recursive:true,force:true})
}
process.exit(failed ? 1 : 0)
