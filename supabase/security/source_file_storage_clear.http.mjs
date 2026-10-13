// Focused real HTTP + real PostgreSQL verification. Auth identity and Storage
// fault injection are local adapters, not evidence of real GoTrue/Storage/Deno.
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { createSourceFileStorageHandler } from '../functions/source-file-storage/handler.js'

export async function verifyClearHttpIdempotency({ A, B, tenant, actor, resource, prefix }) {
  let fault=null, turn=0, removeCalls=0
  const results=[]
  const clearBody=(operationId,workspace='main') => ({ action:'begin_clear',institution_id:tenant,workspace_key:workspace,operation_id:operationId })
  const adapter=(session) => ({
    from(table) {
      assert.ok(['profiles','memberships','institutions'].includes(table))
      const filters=[]
      const q={select:()=>q,eq:(field,value)=>{ assert.ok(['user_id','institution_id','id'].includes(field)); filters.push([field,value]); return q },
        async maybeSingle() {
          const result=await session.query(`select * from ${table} where ${filters.map(([field],i)=>`${field}=$${i+1}`).join(' and ')}`,filters.map(([,value])=>value))
          return {data:result.rows[0]||null,error:null}
        }}
      return q
    },
    async rpc(name,args) {
      try {
        if(name==='source_file_storage_begin_clear') return {data:(await session.query('select source_file_storage_begin_clear($1,$2,$3,$4,$5) job',[args.p_institution_id,args.p_workspace_key,args.p_actor_id,args.p_clear_id,args.p_resume])).rows[0].job,error:null}
        assert.equal(name,'source_file_storage_finish_clear')
        await session.query('select source_file_storage_finish_clear($1,$2,$3,$4)',[args.p_institution_id,args.p_workspace_key,args.p_actor_id,args.p_clear_id])
        return {data:null,error:null}
      } catch(error) { return {data:null,error} }
    },
    storage:{from:()=>({async remove(paths){
      removeCalls+=1
      if(fault==='before') return {error:new Error('injected failure before cleanup')}
      for(let i=0;i<paths.length;i++) {
        await session.query('delete from storage.objects where bucket_id=$1 and name=$2',['workspace-source-files',paths[i]])
        if(fault==='partial'&&i===0) return {error:new Error('injected partial cleanup')}
      }
      return {data:paths,error:null}
    }})},
  })
  const handler=createSourceFileStorageHandler({
    createClient:(_url,token)=>token==='synthetic-service-only' ? adapter(turn++%2 ? B : A) : {auth:{getUser:async()=>({data:{user:{id:actor}},error:null})}},
    env:(name)=>({SUPABASE_URL:'http://127.0.0.1',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-only'})[name],log:()=>{},
  })
  const server=createServer(async(req,res)=>{
    try {
      const parts=[];for await(const part of req) parts.push(part)
      const response=await handler(new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,body:Buffer.concat(parts)}))
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
    } catch(error) {res.writeHead(500);res.end(JSON.stringify({error:error.message}))}
  })
  await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve))
  const url=`http://127.0.0.1:${server.address().port}/functions/v1/source-file-storage`
  const request=async(body)=>{
    const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer synthetic-test-authorization-token','Content-Type':'application/json'},body:JSON.stringify(body)})
    return {status:response.status,body:await response.json()}
  }
  const createFile=async()=>{
    const id=randomUUID()
    await B.query('select source_file_storage_reserve($1,$2,$3,$4,$5,$6,$7)',[resource,actor,id,prefix+id,'h.csv','text/csv',5])
    await B.query('select source_file_storage_commit($1,$2,$3)',[resource,actor,id])
    await B.query('insert into storage.objects values($1,$2)',['workspace-source-files',prefix+id])
    return prefix+id
  }
  try {
    const original=await createFile(), op=randomUUID()
    fault='before'
    assert.equal((await request(clearBody(op))).status,503)
    const fixed=(await B.query('select * from source_file_workspace_clears where institution_id=$1 and workspace_key=$2 and id=$3',[tenant,'main',op])).rows[0]
    assert.ok(fixed.captured_keys.some((row)=>row.storage_path===original))
    const newer=await createFile()
    await B.query(`update workspace_snapshots set payload='{"createdAfterT0":true}' where institution_id=$1 and workspace_key='main'`,[tenant])
    fault=null
    const replies=await Promise.all([request(clearBody(op)),request(clearBody(op))])
    assert.ok(replies.every((reply)=>reply.status===200))
    assert.deepEqual(replies[0].body,replies[1].body)
    assert.equal(replies[0].body.clear_id,op)
    assert.equal(Number(replies[0].body.cutoff_revision),Number(fixed.cutoff_revision))
    assert.deepEqual((await B.query(`select payload from workspace_snapshots where institution_id=$1 and workspace_key='main'`,[tenant])).rows[0].payload,{createdAfterT0:true})
    assert.equal((await B.query('select storage_path from workspace_source_files')).rows[0].storage_path,newer)
    assert.equal((await B.query('select count(*)::int n from storage.objects where name=$1',[newer])).rows[0].n,1)
    const beforeTerminal=removeCalls
    assert.deepEqual((await request(clearBody(op))).body,replies[0].body)
    assert.equal(removeCalls,beforeTerminal)
    results.push('commit then cleanup failure, post-T0 snapshot/file survive two concurrent HTTP retries and terminal replay')
    // Two old targets: one live manifest plus a signed upload not yet finalized.
    const pending=randomUUID()
    await B.query('select source_file_storage_reserve($1,$2,$3,$4,$5,$6,$7)',[resource,actor,pending,prefix+pending,'h.csv','text/csv',5])
    await B.query('insert into storage.objects values($1,$2)',['workspace-source-files',prefix+pending])
    const partialOp=randomUUID()
    fault='partial'
    assert.equal((await request(clearBody(partialOp))).status,503)
    const afterPartial=await createFile()
    fault=null
    assert.equal((await request(clearBody(partialOp))).status,200)
    assert.equal((await B.query('select storage_path from workspace_source_files')).rows[0].storage_path,afterPartial)
    assert.equal((await B.query('select count(*)::int n from storage.objects where name=any($1::text[])',[[newer,prefix+pending]])).rows[0].n,0)
    results.push('partial cleanup retry uses original targets and preserves later replacement')
    // Same operation identifier is scoped by workspace, not globally recaptured.
    const other=await request(clearBody(op,'other'))
    assert.equal(other.status,200)
    assert.equal((await B.query('select storage_path from workspace_source_files')).rows[0].storage_path,afterPartial)
    assert.equal((await B.query('select count(*)::int n from source_file_workspace_clears where id=$1',[op])).rows[0].n,2)
    results.push('workspace A/B isolated with same operation ID')
    const explicitNew=await request(clearBody(randomUUID()))
    assert.equal(explicitNew.status,200)
    assert.notEqual(explicitNew.body.clear_id,partialOp)
    assert.equal((await B.query('select count(*)::int n from workspace_source_files')).rows[0].n,0)
    assert.equal((await B.query('select count(*)::int n from storage.objects')).rows[0].n,0)
    results.push('explicit new clear captures newer resources, cleanup objects=0')
    assert.equal((await request({action:'begin_clear',institution_id:tenant,workspace_key:'main'})).status,400)
    return results
  } finally {await new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))}
}
