import assert from 'node:assert/strict';
import {createServer as netServer} from 'node:net';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {localEndpoint} from './validateLocalDbAuthRecovery.mjs';

export const EDGE_RUNTIME_IMAGE='supabase/edge-runtime:v1.77.4';
export const EDGE_GATEWAY_IMAGE='nginx:1.27-alpine';
const SUPABASE_JS_REMOTE='https://esm.sh/@supabase/supabase-js@2';

// La funcion importa supabase-js desde esm.sh en tiempo de ejecucion. El ensayo no descarga codigo remoto:
// se empaqueta con la version exacta instalada en el repo y cualquier otra importacion remota aborta.
export function edgeImportResolver(resolveLocal){
  return id=>{
    if(id===SUPABASE_JS_REMOTE)return resolveLocal('@supabase/supabase-js');
    if(/^[a-z][a-z0-9+.-]*:\/\//i.test(id))throw new Error('Unexpected remote import in Edge Function');
    return null;
  };
}

export async function bundleEdgeFunction(name){
  assert.ok(['admin-users'].includes(name),'Unsupported Edge Function');
  const {rolldown}=await import('rolldown');
  const directory=await mkdtemp(resolve(tmpdir(),'hub-recovery-edge-'));
  try{
    const resolver=edgeImportResolver(()=>null);
    const bundle=await rolldown({input:resolve('supabase/functions',name,'index.ts'),platform:'browser',logLevel:'silent',
      plugins:[{name:'pin-remote-imports',async resolveId(id,importer){const local=resolver(id);if(id!==SUPABASE_JS_REMOTE)return local;const resolved=await this.resolve('@supabase/supabase-js',importer,{skipSelf:true});assert.ok(resolved?.id,'Local supabase-js unavailable');return resolved;}}]});
    try{await bundle.write({file:resolve(directory,name,'index.js'),format:'esm'});}finally{await bundle.close();}
    return directory;
  }catch(error){await removeOwnedDirectory(directory);throw error;}
}

export async function removeOwnedDirectory(directory){
  if(!directory)return;
  assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('hub-recovery-edge-'));
  await rm(directory,{recursive:true,force:true});
}

// Gateway minimo equivalente a Kong: una sola URL con /auth/v1, /rest/v1 y /storage/v1 para que la funcion
// llame a los servicios restaurados por la red interna de Docker.
export function edgeGatewayConfig({auth,rest,storage}){
  for(const host of [auth,rest,...(storage===undefined?[]:[storage])])assert.match(host,/^gotrue_harness_[a-f0-9]{16}_[a-z_]+$/);
  const route=(prefix,target)=>`    location ${prefix}/ { proxy_pass http://${target}/; proxy_set_header Host $host; proxy_redirect off; }`;
  return ['events {}','http {','  client_max_body_size 1m;','  server {','    listen 8000;',
    route('/auth/v1',auth+':9999'),route('/rest/v1',rest+':3000'),...(storage===undefined?[]:[route('/storage/v1',storage+':5000')]),
    '    location / { return 404; }','  }','}',''].join('\n');
}

export function edgeEnvironment({gateway,anonKey,serviceKey,origin}){
  assert.match(gateway,/^gotrue_harness_[a-f0-9]{16}_gateway$/);
  for(const key of [anonKey,serviceKey])assert.match(key,/^[\w-]+\.[\w-]+\.[\w-]+$/);
  const role=key=>JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;
  assert.equal(role(anonKey),'anon');assert.equal(role(serviceKey),'service_role');
  assert.match(origin,/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/);
  return {SUPABASE_URL:`http://${gateway}:8000`,SUPABASE_ANON_KEY:anonKey,SUPABASE_SERVICE_ROLE_KEY:serviceKey,ADMIN_USERS_ALLOWED_ORIGINS:origin};
}

export async function writeGatewayConfig(directory,config){
  const file=resolve(directory,'nginx.conf');await writeFile(file,config,{mode:0o644});return file;
}

export function edgeCall(port,{token,origin,body}){
  return fetch(localEndpoint(port,'/'),{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
}

export async function reserveLoopbackPort(){
  const reservation=netServer();
  return new Promise((done,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',()=>{const value=reservation.address().port;reservation.close(error=>error?reject(error):done(value));});});
}

// Arranca gateway + Edge Runtime sobre la red del destino restaurado. `register` anota cada contenedor para el cleanup del harness.
export async function startRecoveredEdge({docker,network,label,run,directory,target,authName,restName,storageName,anonKey,serviceKey,origin,register}){
  assert.match(target,/^gotrue_harness_[a-f0-9]{16}$/);
  for(const image of [EDGE_RUNTIME_IMAGE,EDGE_GATEWAY_IMAGE])docker(['image','inspect',image]);
  const gateway=target+'_gateway',edge=target+'_edge';
  for(const name of [gateway,edge])assert.equal(docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).trim(),'');
  const config=await writeGatewayConfig(directory,edgeGatewayConfig({auth:authName,rest:restName,storage:storageName}));
  register(gateway);
  docker(['create','--pull=never','--name',gateway,'--label',label+'='+run,'--network',network,'--mount','type=bind,source='+config+',target=/etc/nginx/nginx.conf,readonly',EDGE_GATEWAY_IMAGE]);
  docker(['start',gateway]);
  const env=edgeEnvironment({gateway,anonKey,serviceKey,origin});
  register(edge);
  docker(['create','--pull=never','--name',edge,'--label',label+'='+run,'--network',network,'-p','127.0.0.1::9000','--mount','type=bind,source='+resolve(directory,'admin-users')+',target=/home/deno/functions/admin-users,readonly',...Object.keys(env).flatMap(key=>['-e',key]),EDGE_RUNTIME_IMAGE,'start','--main-service','/home/deno/functions/admin-users','-p','9000'],undefined,{...process.env,...env});
  docker(['start',edge]);
  const port=JSON.parse(docker(['inspect',edge]))[0].NetworkSettings.Ports['9000/tcp'][0].HostPort;
  let ready=false;
  for(let i=0;i<120;i++){
    try{ready=(await fetch(localEndpoint(port,'/'),{method:'OPTIONS',headers:{Origin:origin},signal:AbortSignal.timeout(1000),redirect:'error'})).status===200;}catch{ready=false;}
    if(ready)break;
    for(const name of [gateway,edge])assert.equal(JSON.parse(docker(['inspect',name]))[0].State.Running,true,'Edge stack exited');
    await new Promise(done=>setTimeout(done,250));
  }
  assert.ok(ready,'Edge Runtime unavailable');
  return {gateway,edge,port};
}

const EDGE_WRITABLE_TABLES=new Set(['public.admin_audit_logs','public.teacher_records','public.profiles','auth.users','auth.identities','auth.audit_log_entries']);

// Controles de autorizacion de admin-users con tokens reales restaurados. Devuelve el resumen para el reporte.
export async function verifyRecoveredEdge({port,origin,tokens,tenants,sql,metadata,target,progress={}}){
  assert.equal(tokens.length,4);assert.equal(tenants.length,2);
  const call=async(token,body,headers={})=>{progress.edgeCheck=(body.action??'none')+(headers.origin?' foreign-origin':'');const response=await edgeCall(port,{token,origin:headers.origin??origin,body});progress.edgeLastStatus=response.status;return {status:response.status,body:await response.json().catch(()=>null)};};
  const rosters=institution=>({action:'teacher_subject_rosters',institution_id:institution,workspace_key:'main'});
  const docentes=tokens.filter(entry=>entry.user.role==='docente'),alumnos=tokens.filter(entry=>entry.user.role==='alumno');
  assert.equal(docentes.length,2);assert.equal(alumnos.length,2);
  const result={ownRosters:0,foreignRostersDenied:0,studentRostersDenied:0,foreignProfileUpdateDenied:0};
  for(const {user,token} of docentes){
    const own=tenants[user.tenant],foreign=tenants[1-user.tenant];
    const ownResponse=await call(token,rosters(own));assert.equal(ownResponse.status,200,'Own rosters rejected');assert.ok(ownResponse.body&&typeof ownResponse.body==='object');result.ownRosters++;
    assert.equal((await call(token,rosters(foreign))).status,403,'Foreign rosters allowed');result.foreignRostersDenied++;
    assert.equal((await call(token,{action:'teacher_profile_update',institution_id:foreign,workspace_key:'main',profile:{email:user.email,telefono:'1100000000'}})).status,403,'Foreign profile update allowed');result.foreignProfileUpdateDenied++;
  }
  for(const {user,token} of alumnos){assert.equal((await call(token,rosters(tenants[user.tenant]))).status,403,'Student reached teacher action');result.studentRostersDenied++;}
  result.invalidJwtStatus=(await call('invalid.synthetic.jwt',rosters(tenants[0]))).status;assert.equal(result.invalidJwtStatus,401);
  result.missingAuthorizationStatus=(await call(null,rosters(tenants[0]))).status;assert.equal(result.missingAuthorizationStatus,401);
  result.foreignOriginStatus=(await call(docentes[0].token,rosters(tenants[docentes[0].user.tenant]),{origin:'http://foreign-origin.invalid'})).status;assert.equal(result.foreignOriginStatus,403);
  // Unica mutacion permitida: el docente del tenant 0 actualiza su propio telefono, sin cambiar email.
  const writer=docentes.find(entry=>entry.user.tenant===0),phone='1100000000';
  const teacherRows=tenant=>sql("select coalesce(json_agg(json_build_object('profile_id',profile_id,'phone',phone) order by profile_id),'[]') from public.teacher_records where institution_id='"+tenants[tenant]+"';",target);
  const foreignBefore=teacherRows(1),before=metadata(target,true);
  const update=await call(writer.token,{action:'teacher_profile_update',institution_id:tenants[0],workspace_key:'main',profile:{email:writer.user.email,telefono:phone}});
  assert.equal(update.status,200,'Own profile update rejected');assert.equal(update.body?.success,true);
  assert.deepEqual(JSON.parse(teacherRows(0)),[{profile_id:writer.user.id,phone}],'Own teacher record not updated');
  assert.equal(teacherRows(1),foreignBefore,'Foreign tenant teacher record changed');
  const after=metadata(target,true);
  result.changedTables=Object.keys(after).filter(table=>after[table]!==before[table]).sort();
  for(const table of result.changedTables)assert.ok(EDGE_WRITABLE_TABLES.has(table),'Unexpected table changed by Edge');
  result.allowedMutation='teacher_profile_update own phone';
  return result;
}

// Toda fila de auditoria debe venir de un docente sintetico y de una accion verificada.
export function assertEdgeAudit(rows,docenteIds){
  const allowed=new Set(['teacher_subject_rosters','teacher_profile_update']);
  for(const row of rows){assert.ok(docenteIds.includes(row.actor_user_id),'Unexpected audit actor');assert.ok(allowed.has(row.action),'Unexpected audit action');assert.equal(row.status,'success','Unexpected audit status');}
  return rows.reduce((summary,row)=>({...summary,[row.action]:(summary[row.action]??0)+1}),{});
}
