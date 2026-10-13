import { gatewaySchemaFixture } from './source_file_storage_gateway.fixture.mjs'
// Isolated PostgreSQL verification. PGlite is installed in OS temp, not this repo.
// No connections, Supabase credentials, or remote mutations.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const { PGlite } = createRequire(resolve(process.argv[2], 'package.json'))('@electric-sql/pglite')
const db = new PGlite()
const a = 'a2300000-0000-4000-8000-000000000001', b = 'b2300000-0000-4000-8000-000000000001'
const tenant = 'a1300000-0000-4000-8000-000000000001', foreign = 'b1300000-0000-4000-8000-000000000001'
let passed = 0
async function denied(sql, expectedMessage) {
  await db.exec('begin')
  let rejected = false, message = ''
  try { await db.exec(sql) } catch (error) { rejected = true; message = error.message }
  await db.exec('rollback')
  assert.equal(rejected, true, 'expected authorization/contract rejection')
  if (expectedMessage) assert.equal(message, expectedMessage)
  passed += 1
}
try {
  await db.exec(gatewaySchemaFixture({a,b,tenant,foreign}))
  await db.exec(readFileSync(new URL('./source_file_storage_gateway.sql', import.meta.url), 'utf8'))
  await db.exec(`insert into public.workspace_snapshots(institution_id,workspace_key) values('${tenant}','main'),('${foreign}','main');`)
  const resource = (await db.query(`select id from public.source_file_storage_resources where institution_id='${tenant}' and dataset_key='horarios'`)).rows[0].id
  const foreignResource = (await db.query(`select id from public.source_file_storage_resources where institution_id='${foreign}' and dataset_key='horarios'`)).rows[0].id
  const one = 'a4300000-0000-4000-8000-000000000001', two = 'a4300000-0000-4000-8000-000000000002'
  const prefix = `${tenant}/${a}/main/horarios/`, first = prefix + one, second = prefix + two
  const reserve = (r, actor, op, key) => `select public.source_file_storage_reserve('${r}','${actor}','${op}','${key}','horarios.xlsx','text/csv',5)`
  await db.exec(`set role service_role; ${reserve(resource,a,one,first)}; reset role;`)
  await denied(`set role service_role; ${reserve(resource,a,two,second)}`)
  await denied(`set role service_role; ${reserve(foreignResource,a,two,second)}`)
  await denied(`set role service_role; ${reserve(resource,a,two,prefix+'../docentes/'+two)}`, 'SOURCE_FILE_INVALID_KEY')
  await db.exec(`set role service_role; select public.source_file_storage_cancel('${resource}','${a}','${one}'); ${reserve(resource,a,two,second)}; select public.source_file_storage_commit('${resource}','${a}','${two}'); reset role;`)
  assert.equal((await db.query(`select storage_path from public.workspace_source_files`)).rows[0].storage_path,second); passed += 1
  await denied(`set role service_role; select public.source_file_storage_cancel('${resource}','${a}','${two}')`)
  await db.exec(`insert into storage.objects values('workspace-source-files','${second}')`)
  await denied(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false); insert into storage.objects values('workspace-source-files','${prefix}normalized')`)
  await db.exec(`begin; set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`)
  assert.equal((await db.query(`update storage.objects set name='${first}' returning name`)).rows.length,0)
  assert.equal((await db.query('delete from storage.objects returning name')).rows.length,0)
  assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,1)
  await db.exec('rollback'); passed += 1
  await denied(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false); insert into public.workspace_source_files(institution_id,workspace_key,dataset_key) values('${tenant}','main','docentes')`)
  await denied(`set role authenticated; select public.source_file_storage_begin_delete('${resource}','${a}')`)
  await db.exec(`begin; set role authenticated; select set_config('request.jwt.claim.sub','${b}',false);`)
  assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,0); passed += 1
  await db.exec('rollback')
  const deleted = (await db.query(`select public.source_file_storage_begin_delete('${resource}','${a}') as op`)).rows[0].op
  await db.exec(`select public.source_file_storage_finish_delete('${resource}','${a}','${deleted.id}')`)
  assert.equal((await db.query('select count(*)::int n from public.workspace_source_files')).rows[0].n,0); passed += 1
  const clearOne='a6300000-0000-4000-8000-000000000001', clearTwo='a6300000-0000-4000-8000-000000000002'
  const clearJob=(await db.query(`select public.source_file_storage_begin_clear('${tenant}','main','${a}','${clearOne}') as job`)).rows[0].job
  assert.deepEqual(clearJob.captured_keys,[]); passed+=1
  await db.exec(reserve(resource,a,'a4300000-0000-4000-8000-000000000099',prefix+'a4300000-0000-4000-8000-000000000099'))
  const resumed=(await db.query(`select public.source_file_storage_begin_clear('${tenant}','main','${a}','${clearOne}',true) as job`)).rows[0].job
  assert.equal(resumed.id,clearOne); assert.deepEqual(resumed.captured_keys,[]); passed+=1
  await db.exec(`select public.source_file_storage_finish_clear('${tenant}','main','${a}','${clearOne}')`)
  await denied(`select public.source_file_storage_begin_delete('${resource}','${a}','${clearOne}')`, 'SOURCE_FILE_CLEAR_LEASE_CONFLICT')
  const three = 'a4300000-0000-4000-8000-000000000003'
  await db.exec(`select public.source_file_storage_cancel('${resource}','${a}','a4300000-0000-4000-8000-000000000099')`)
  await db.exec(reserve(resource,a,three,prefix+three))
  await db.exec(`select public.source_file_storage_begin_clear('${tenant}','main','${a}','${clearTwo}')`)
  await denied(`select public.source_file_storage_commit('${resource}','${a}','${three}')`, 'SOURCE_FILE_INVALID_OPERATION')
  await db.exec(`select public.source_file_storage_finish_clear('${tenant}','main','${a}','${clearTwo}')`)
  await db.exec(`insert into public.workspace_source_files(institution_id,workspace_key,dataset_key,storage_bucket,storage_path) values('${tenant}','main','horarios','workspace-source-files','${tenant}/main/horarios/1700000000000-horarios.xlsx');`)
  await denied(`select public.source_file_storage_begin_clear('${tenant}','main','${a}','a6300000-0000-4000-8000-000000000099')`, 'SOURCE_FILE_LEGACY_OR_FOREIGN_WRITE_DENIED')
  assert.equal((await db.query('select count(*)::int n from public.source_file_storage_resources where clearing_actor is not null')).rows[0].n,0); passed += 1
  await db.exec(`update public.source_file_storage_operations set expires_at=now()-interval '1 day' where id='${one}'`)
  const candidates = (await db.query(`select public.source_file_storage_cleanup_candidates('${resource}','${a}') as candidates`)).rows[0].candidates
  assert.equal(candidates.some((row) => row.id===one && row.storage_path===first),true); passed += 1
  await db.exec(`select public.source_file_storage_cleanup_done('${resource}','${a}',array['${one}'::uuid])`)
  assert.equal((await db.query(`select public.source_file_storage_cleanup_candidates('${resource}','${a}') as candidates`)).rows[0].candidates.some((row) => row.id===one),false); passed += 1
  await db.exec(`update public.workspace_source_files set storage_path=null,file_base64='synthetic-base64'`)
  const four='a4300000-0000-4000-8000-000000000004'
  await denied(reserve(resource,a,four,prefix+four))
  await denied(`select public.source_file_storage_begin_delete('${resource}','${a}')`)
  assert.equal((await db.query('select file_base64 from public.workspace_source_files')).rows[0].file_base64,'synthetic-base64'); passed+=1
  await db.exec(`update public.workspace_source_files set storage_path='${second}',storage_bucket='foreign-bucket',file_base64=null`)
  await denied(reserve(resource,a,four,prefix+four))
  await denied(`select public.source_file_storage_begin_delete('${resource}','${a}')`)
  console.log(JSON.stringify({ result: 'LOCAL_POSTGRES_GATEWAY_PASS', cases: passed, remoteMutations: 'NONE' }))
} catch (error) {
  console.error(JSON.stringify({ result: 'LOCAL_POSTGRES_GATEWAY_FAIL', code: error.code, message: error.message }))
  process.exitCode = 1
} finally { await db.close() }
