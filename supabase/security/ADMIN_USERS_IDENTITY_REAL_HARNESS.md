# Auth/DB local identity validation harness

Extract the JavaScript block into a temporary validate.mjs and run from repository root with node.exe. Requires the existing local baseline PostgreSQL Docker container, cached Docker images listed below, and the local Deno executable used by the previous closure. Creates an isolated schema-only DB; never copies application data. Does not deploy or contact remote Supabase. Docker access is required. Result and temporary files use %TEMP%/hub-admin-identity-real. Tested on 2026-10-06. Password literals are synthetic test credentials only.

```javascript
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

// Local-only integration test. No remote URLs, Supabase CLI, deploy or schema patch.
const root=process.cwd(), dir=join(process.env.TEMP,'hub-admin-identity-real');
const dbContainer='supabase_db_codex-baseline-local-7725bdda';
const dbName='identity_real_'+randomBytes(5).toString('hex');
const authName=dbName+'_auth', restName=dbName+'_rest';
const secret=randomBytes(48).toString('hex');
const api='http://127.0.0.1:54640', edge='http://127.0.0.1:8000';
const report={date:'2026-10-06',remoteMutations:0,dbName,cases:[],cleanup:null};
const expected='D5B6E53D9008BB1018AD92C3038EA92342B2876AF337A6C1DCE0DEB6387D533D';
const source=join(root,'supabase/functions/admin-users/index.ts');
report.artifactSha256=createHash('sha256').update(readFileSync(source)).digest('hex').toUpperCase();
assert.equal(report.artifactSha256,expected,'Artifact differs from audited code');
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:40*1024*1024,stdio:['pipe','pipe','pipe']});
const sql=(text,db=dbName)=>docker(['exec','-i',dbContainer,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db,'-At'],text);
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const jwt=role=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return h+'.'+p+'.'+createHmac('sha256',secret).update(h+'.'+p).digest('base64url')};
const anon=jwt('anon'),service=jwt('service_role');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const envFiles=[]; let proxy,deno,dbCreated=false; const started=[]; const sessions=[]; const ids=[];
function envFile(name,values){const path=join(dir,name);writeFileSync(path,Object.entries(values).map(([k,v])=>k+'='+v).join('\n'));envFiles.push(path);return path;}
async function ready(url){for(let i=0;i<30;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(1500)});if(r.ok)return;}catch{}await wait(500);}throw new Error('Local service not ready: '+url);}
async function call(path,body,token=service,method='POST'){assert.equal(new URL(api).hostname,'127.0.0.1');const r=await fetch(api+path,{method,headers:{apikey:anon,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={message:'Non-JSON local response'};}return {status:r.status,data};}
async function login(email,password){const r=await call('/auth/v1/token?grant_type=password',{email,password},anon);if(r.status===200)sessions.push(r.data.access_token);return r;}
async function create(label,password,role='alumno'){const email=label+'-'+dbName+'@example.invalid';const r=await call('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{account_role:role,full_name:'Synthetic '+label}});assert.equal(r.status,200,'Auth create '+label+' failed: '+(r.data.msg??r.data.message??r.data.error??''));ids.push(r.data.id);return {id:r.data.id,email,password};}
async function edgeCall(token,payload){const r=await fetch(edge,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'http://127.0.0.1:4173'},body:JSON.stringify(payload)});return {status:r.status,data:await r.json()};}
const bulk=(token,tenant,email,dni='99998888')=>edgeCall(token,{action:'bulk_create_students',institution_id:tenant,students:[{email,dni,nombre:'Synthetic',apellido:'Student'}]});
function record(name,detail){report.cases.push({name,result:'PASS',...detail});console.log('PASS '+name);}
function snapshot(id){return sql(`select json_build_object('password',encrypted_password,'metadata',raw_user_meta_data,'profile',(select to_jsonb(p) from public.profiles p where user_id=u.id),'memberships',(select jsonb_agg(to_jsonb(m)) from public.memberships m where user_id=u.id),'records',(select jsonb_agg(to_jsonb(s)) from public.student_records s where profile_id=u.id)) from auth.users u where id=${quote(id)};`).trim();}
try{
  console.log('Preparing isolated local DB '+dbName);
  // Schema-only clone plus migration bookkeeping, never copy user/application rows.
  const schema=docker(['exec',dbContainer,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--no-comments']);
  const migrations=docker(['exec',dbContainer,'pg_dump','-U','postgres','-d','postgres','--data-only','--table=auth.schema_migrations']);
  sql(`create database ${dbName};`,'postgres'); dbCreated=true;
  sql(schema);sql(migrations);
  assert.equal(sql('select count(*) from auth.users;').trim(),'0');
  const dbEnv=JSON.parse(docker(['inspect',dbContainer]))[0].Config.Env;
  const password=dbEnv.find(v=>v.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
  assert.ok(password,'Local Docker DB password unavailable');
  const dbUri='postgres://postgres:'+encodeURIComponent(password)+'@host.docker.internal:54322/'+dbName;
  const authEnv=envFile('auth.env',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:api+'/auth/v1',GOTRUE_SITE_URL:'http://127.0.0.1:4173',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:dbUri+'?options=-csearch_path%3Dauth',GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_RATE_LIMIT_EMAIL_SENT:'1000',GOTRUE_RATE_LIMIT_TOKEN_REFRESH:'1000',GOTRUE_RATE_LIMIT_VERIFY:'1000',GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UP:'1000',GOTRUE_LOG_LEVEL:'error'});
  const restEnv=envFile('rest.env',{PGRST_DB_URI:dbUri,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_PORT:'3000'});
  docker(['run','-d','--name',authName,'-p','127.0.0.1:54641:9999','--env-file',authEnv,'public.ecr.aws/supabase/gotrue:v2.196.0']);started.push(authName);
  docker(['run','-d','--name',restName,'-p','127.0.0.1:54642:3000','--env-file',restEnv,'public.ecr.aws/supabase/postgrest:v16.1']);started.push(restName);
  proxy=createServer((req,res)=>{const auth=req.url.startsWith('/auth/v1/'),rest=req.url.startsWith('/rest/v1/');if(!auth&&!rest){res.writeHead(404);res.end();return;}const upstream=request({hostname:'127.0.0.1',port:auth?54641:54642,path:req.url.slice(auth?8:8)||'/',method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);});
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(54640,'127.0.0.1',resolve);});
  await ready(api+'/auth/v1/health');await ready(api+'/rest/v1/');
  deno=spawn(join(process.env.TEMP,'hub-storage-gateway-closure-tools/node_modules/deno/deno.exe'),['run','--no-lock','--allow-env','--allow-net=127.0.0.1:54640,0.0.0.0:8000','--allow-read',source],{cwd:root,windowsHide:true,env:{...process.env,DENO_DIR:join(process.env.TEMP,'hub-storage-gateway-deno-cache'),SUPABASE_URL:api,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service},stdio:['ignore','pipe','pipe']});
  let denoError='';deno.stderr.on('data',d=>{denoError+=d.toString();});deno.stdout.on('data',()=>{});
  for(let i=0;i<40;i++){try{const r=await fetch(edge);if(r.status===405)break;}catch{}if(deno.exitCode!==null)throw new Error('Deno local startup failed: '+denoError.slice(0,700));if(i===39)throw new Error('Deno HTTP not ready');await wait(250);}
  report.runtime={deno:'2.9.6',auth:'v2.196.0',postgrest:'v16.1',postgres:sql('show server_version;').trim(),actualHttp:true,actualAuth:true,actualDb:true};
  const A=randomUUID(),B=randomUUID();
  sql(`insert into public.institutions(id,name,slug) values (${quote(A)},'Synthetic A',${quote(dbName+'-a')}),(${quote(B)},'Synthetic B',${quote(dbName+'-b')});`);
  const admin=await create('admin','LocalAdmin!92841','admin_instituto');
  const superadmin=await create('super','LocalSuper!92841','superadmin');
  const same=await create('same','OriginalSame!92841'),foreign=await create('foreign','OriginalForeign!92841');
  const unlinked=await create('unlinked','OriginalUnlinked!92841'),ambiguous=await create('ambiguous','OriginalAmbiguous!92841');
  for(const [u,t,r] of [[admin,A,'admin'],[same,A,'viewer'],[foreign,B,'viewer'],[unlinked,A,'viewer'],[ambiguous,A,'viewer']])sql(`insert into public.memberships(institution_id,user_id,role) values (${quote(t)},${quote(u.id)},${quote(r)});`);
  sql(`update public.profiles set is_global_admin=true,account_role='superadmin' where user_id=${quote(superadmin.id)};`);
  for(const [u,t] of [[same,A],[foreign,B],[ambiguous,A]])sql(`insert into public.student_records(institution_id,profile_id,email,full_name) values (${quote(t)},${quote(u.id)},${quote(u.email)},'Synthetic Student');`);
  // Conflicting canonical student email pointing to another valid Auth identity.
  sql(`insert into public.student_records(institution_id,profile_id,email,full_name,career) values (${quote(A)},${quote(unlinked.id)},${quote(ambiguous.email)},'Synthetic Conflict','conflict');`);
  const adminLogin=await login(admin.email,admin.password),superLogin=await login(superadmin.email,superadmin.password);
  assert.equal(adminLogin.status,200);assert.equal(superLogin.status,200);
  const adminToken=adminLogin.data.access_token,superToken=superLogin.data.access_token;
  record('1 tenants A/B and Auth/DB fixtures created',{authUsers:ids.length,tenants:2});
  const beforeForeign=snapshot(foreign.id);
  const rejected=await bulk(adminToken,A,foreign.email);assert.equal(rejected.status,409);assert.equal(snapshot(foreign.id),beforeForeign);
  record('2-3 exclusive B email from admin A denied without Auth/DB mutation',{http:rejected.status});
  assert.equal((await login(foreign.email,foreign.password)).status,200);assert.equal((await login(foreign.email,'99998888')).status,400);
  record('4 B original password login succeeds and attacker password fails',{originalLogin:200,attackerLogin:400});
  for(const variant of [foreign.email.toUpperCase(),'  '+foreign.email.toUpperCase()+'  ']){const r=await bulk(adminToken,A,variant);assert.equal(r.status,409);assert.equal(snapshot(foreign.id),beforeForeign);assert.equal((await login(foreign.email,foreign.password)).status,200);assert.equal((await login(foreign.email,'99998888')).status,400);}
  record('case/whitespace variants denied; password and DB intact',{variants:2,http:409});
  const beforeSame=snapshot(same.id),reuse=await bulk(adminToken,A,same.email);assert.equal(reuse.status,200);assert.equal(reuse.data.results[0].user_id,same.id);assert.equal(reuse.data.created,0);assert.equal(snapshot(same.id),beforeSame);assert.equal((await login(same.email,same.password)).status,200);assert.equal((await login(same.email,'99998888')).status,400);
  record('5 same-tenant reuse same user_id with password/metadata/DB intact',{http:200,sameUserId:true,originalLogin:200,proposedLogin:400});
  const newEmail='new-'+dbName+'@example.invalid',created=await bulk(adminToken,A,newEmail,'99887766');assert.equal(created.status,200);assert.equal(created.data.created,1);const newId=created.data.results[0].user_id;ids.push(newId);assert.equal((await login(newEmail,'99887766')).status,200);assert.equal(sql(`select count(*) from public.memberships m join public.student_records s on s.profile_id=m.user_id and s.institution_id=m.institution_id where m.user_id=${quote(newId)} and m.institution_id=${quote(A)};`).trim(),'1');
  record('6 new email creates Auth user and exact tenant student link',{http:200,login:200});
  for(const u of [unlinked,ambiguous]){const before=snapshot(u.id),r=await bulk(adminToken,A,u.email);assert.equal(r.status,409);assert.equal(snapshot(u.id),before);assert.equal((await login(u.email,u.password)).status,200);assert.equal((await login(u.email,'99998888')).status,400);}
  record('7 unlinked and ambiguous identities denied without mutation',{http:409,identities:2});
  const resetPassword='AuthorizedReset!92841';const reset=await edgeCall(superToken,{action:'set_user_password',institution_id:A,target_user_id:same.id,new_password:resetPassword});assert.equal(reset.status,200);assert.equal((await login(same.email,resetPassword)).status,200);assert.equal((await login(same.email,same.password)).status,400);
  record('8 authorized SuperAdmin scoped same-tenant reset succeeds',{http:200,newLogin:200,oldLogin:400});
  const resetBefore=snapshot(foreign.id);const badReset=await edgeCall(superToken,{action:'set_user_password',institution_id:A,target_user_id:foreign.id,new_password:resetPassword});assert.equal(badReset.status,403);assert.equal(snapshot(foreign.id),resetBefore);assert.equal((await login(foreign.email,foreign.password)).status,200);assert.equal((await login(foreign.email,resetPassword)).status,400);
  record('9 scoped reset cross-tenant denied; B password intact',{http:403,originalLogin:200,proposedLogin:400});
  const institutionalReset=await edgeCall(adminToken,{action:'set_user_password',institution_id:A,target_user_id:same.id,new_password:'UnpermittedReset!92841'});assert.equal(institutionalReset.status,403);
  record('institutional admin dedicated reset denied by existing SuperAdmin contract',{http:403});
  report.result='PASS';
}catch(error){report.result='BLOCKED';report.error=String(error.message).replaceAll(secret,'[REDACTED]').replace(/postgres:\/\/[^\s]+/g,'[LOCAL_DB_URI_REDACTED]');console.error('BLOCKED '+report.error.slice(0,900));for(const name of started){const log=spawnSync('docker',['logs','--tail','5',name],{encoding:'utf8'});const safe=(String(log.stdout??'')+String(log.stderr??'')).replaceAll(secret,'[REDACTED]').replace(/postgres:\/\/[^\s]+/g,'[LOCAL_DB_URI_REDACTED]');console.error(safe);report.infrastructureLogs??={};report.infrastructureLogs[name]=safe;}process.exitCode=1;
}finally{
  if(dbCreated){try{
    for(const token of sessions){const r=await call('/auth/v1/logout?scope=global',undefined,token);assert.ok([204,401,403].includes(r.status),'Local signout failed');}
    // Only the isolated disposable DB contains fixtures; select all IDs to cover partial creation.
    const all=sql('select id from auth.users;').trim().split(/\r?\n/).filter(Boolean);
    for(const id of all){const r=await call('/auth/v1/admin/users/'+id,undefined,service,'DELETE');assert.ok([200,204].includes(r.status),'Local Auth cleanup failed');}
    sql('delete from public.student_records; delete from public.admin_audit_logs; delete from public.institutions; delete from public.profiles;');
    const counts=JSON.parse(sql(`select json_build_object('authUsers',(select count(*) from auth.users),'authIdentities',(select count(*) from auth.identities),'sessions',(select count(*) from auth.sessions),'refreshTokens',(select count(*) from auth.refresh_tokens),'profiles',(select count(*) from public.profiles),'memberships',(select count(*) from public.memberships),'students',(select count(*) from public.student_records),'institutions',(select count(*) from public.institutions),'auditLogs',(select count(*) from public.admin_audit_logs),'storageObjects',(select count(*) from storage.objects));`).trim());
    assert.ok(Object.values(counts).every(c=>c===0),'Cleanup nonzero');report.cleanup=counts;console.log('PASS cleanup Auth/DB fixtures=0');
  }catch(e){report.cleanup={error:e.message};report.result='BLOCKED';process.exitCode=1;}}
  if(deno){deno.kill();await new Promise(resolve=>{if(deno.exitCode!==null)resolve();else{deno.once('exit',resolve);setTimeout(resolve,3000);}});}
  if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
  for(const name of started){try{docker(['rm','-f',name]);}catch{report.result='BLOCKED';report.containerCleanupFailure=true;process.exitCode=1;}}
  if(dbCreated){try{sql(`drop database ${dbName} with (force);`,'postgres');report.databaseRemoved=true;}catch{report.result='BLOCKED';report.databaseRemoved=false;process.exitCode=1;}}
  for(const path of envFiles){try{unlinkSync(path);}catch{report.result='BLOCKED';report.envCleanupFailure=true;process.exitCode=1;}}
  report.artifactUnchanged=createHash('sha256').update(readFileSync(source)).digest('hex').toUpperCase()===expected;
  writeFileSync(join(dir,'result.json'),JSON.stringify(report,null,2));console.log('RESULT '+report.result);
}
process.exit(process.exitCode??0);

```
