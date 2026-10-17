import { readFileSync } from 'node:fs';
import { buildLocalRecoveryEnvironment } from './localRecoveryConfiguration.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { authPassword, normalizeAcl, BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase, localEndpoint } from './validateLocalDbAuthRecovery.mjs';
const SOURCE='supabase_db_codex-baseline-local-7725bdda';
const IMAGE='public.ecr.aws/supabase/storage-api:v1.70.7';
const LABEL='hub.storage-local';
export function storageUri(password,host,database) {
  assert.equal(host,SOURCE); disposableDatabase(database);
  return `postgresql://supabase_storage_admin:${encodeURIComponent(password)}@${host}:5432/${database}`;
}
const sha=value=>createHash('sha256').update(value).digest('hex');
export function verifyRecoveredBytes(actual,expected) {
  assert.equal(actual.length,expected.bytes,'Recovered size differs');
  assert.equal(sha(actual),expected.sha256,'Recovered SHA256 differs');
}
export function assertOwnedRollbackTarget(database,owner,marker,run) {
  disposableDatabase(database);
  assert.ok(typeof run==='string' && /^[a-f0-9]{16}$/.test(run),'Invalid run');
  assert.ok(owner==='supabase_admin' && marker===run,'Rollback ownership mismatch');
}
export async function main({ recovery=false, rollback=false, integrated=false, api=false, browser=false, edge=false } = {}) {
  assert.equal(typeof recovery,'boolean');
  assert.equal(typeof rollback,'boolean');
  assert.ok(!rollback || recovery,'Rollback requires recovery');
  assert.equal(typeof integrated,'boolean');
  assert.ok(!integrated || (recovery && !rollback),'Integrated recovery requires recovery without rollback');
  assert.equal(typeof api,'boolean');
  assert.ok(!api || (integrated && recovery && !rollback),'Data API requires integrated recovery without rollback');
  assert.equal(typeof browser,'boolean');assert.ok(!browser || (api && integrated && recovery && !rollback),'Browser requires integrated Data API recovery');
  assert.equal(typeof edge,'boolean');assert.ok(!edge || browser,'Edge requires recovered frontend browser');
  const run=randomBytes(8).toString('hex');
  const db=disposableDatabase(`gotrue_harness_${run}`);
  const container=`${db}_storage`; const volume=`${db}_bytes`;
  let dbIntent=false, containerIntent=false, volumeIntent=false, step='preflight';
  const extraContainers=new Set(), extraVolumes=new Set(), extraDatabases=new Set();
  let edgeDirectory;
  let dbArchive, byteArchive;
  const report={run,image:IMAGE,staging:'NONE',production:'NONE',backupRestore:recovery,rollbackRequested:rollback,integratedRequested:integrated,apiRequested:api,browserRequested:browser,edgeRequested:edge};
  const docker=(args,input,env=process.env)=>{
    try {return execFileSync('docker',args,{input,env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});}
    catch(error) {throw new Error(`Local operation ${step} failed; SQLSTATE=${String(error.stderr??'').match(/\b(?:42501|28P01)\b/)?.[0]??'unavailable'}`);}
  };
  const sql=(query,database=db)=>docker(['exec','-i',SOURCE,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database,'-At'],query).trim();
  const acl=database=>normalizeAcl(sql(`select json_build_object('schema',(select json_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl::text) from pg_namespace where nspname='storage'),'objects',(select json_agg(row_to_json(x) order by relname) from (select relname,pg_get_userbyid(relowner) owner,relacl::text acl,relrowsecurity from pg_class where relnamespace='storage'::regnamespace) x));`,database));
  try {
    const source=JSON.parse(docker(['inspect',SOURCE]))[0];
    assert.equal(source.Config.Image,'public.ecr.aws/supabase/postgres:17.6.1.165');
    assert.equal(source.State.Health.Status,'healthy');
    assert.deepEqual(Object.keys(source.NetworkSettings.Networks),['supabase_network_codex-baseline-local-7725bdda']);
    docker(['image','inspect',IMAGE]);
    const env=Object.fromEntries(source.Config.Env.map(entry=>{const i=entry.indexOf('=');return[entry.slice(0,i),entry.slice(i+1)];}));
    const config=docker(['exec',SOURCE,'cat','/etc/postgresql.schema.sql']);
    const assignment=config.split(/\r?\n/).filter(line=>/^(?:\\set pgpass\b|ALTER USER supabase_storage_admin\b)/i.test(line)).join('\n').replaceAll('supabase_storage_admin','supabase_auth_admin');
    const password=authPassword(assignment,env);
    const authCredential=integrated?authPassword(config,env):null;
    const restAssignment=api?config.split(/\r?\n/).filter(line=>/^(?:\\set pgpass\b|ALTER USER authenticator\b)/i.test(line)).join('\n').replaceAll('authenticator','supabase_auth_admin'):null;
    const restPassword=api?authPassword(restAssignment,env):null;
    const sourceAcl=acl('postgres');
    const sourceHistory=sql("select coalesce(json_agg(to_jsonb(m) order by id),'[]') from storage.migrations m;",'postgres');
    report.sourceMigrations=JSON.parse(sourceHistory).length;
    assert.ok(report.sourceMigrations>0);
    step='schema preparation';
    const schema=docker(['exec',SOURCE,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--no-comments']);
    assert.equal(sql(`select count(*) from pg_database where datname='${db}';`,'postgres'),'0');
    dbIntent=true;
    sql(`create database ${db} template template0; comment on database ${db} is '${run}';`,'postgres');
    sql(schema);
    const migrations=docker(['exec',SOURCE,'pg_dump','-U','supabase_admin','-d','postgres','--data-only','--table=storage.migrations']);
    sql(migrations);
    assert.equal(sql("select coalesce(json_agg(to_jsonb(m) order by id),'[]') from storage.migrations m;"),sourceHistory);
    assert.equal(acl(db),sourceAcl);
    assert.equal(sql('select count(*) from storage.objects;'),'0');
    assert.equal(sql('select count(*) from auth.users;'),'0');
    if(integrated) {
      step='canonical integrated baseline';
      for(const file of BASELINE)sql(readFileSync(resolve('supabase/schema',file),'utf8'));
      const authHistory=docker(['exec',SOURCE,'pg_dump','-U','supabase_admin','-d','postgres','--data-only','--table=auth.schema_migrations']);
      sql(authHistory);assert.equal(sql('select count(*) from auth.schema_migrations;'),'77');
      assert.equal(sql('select count(*) from public.institutions;'),'0');
    }
    step='local role credential';
    report.effectiveRole=docker(['exec','-i',SOURCE,'sh','-c','IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -h 127.0.0.1 -U supabase_storage_admin -d "$1" -At -v ON_ERROR_STOP=1 -c "select current_user;"','sh',db],password+'\n').trim();
    assert.equal(report.effectiveRole,'supabase_storage_admin');
    const secret=randomBytes(48).toString('hex');
    const settings=buildLocalRecoveryEnvironment({kind:'storage',image:IMAGE,host:SOURCE,database:db,password,jwtSecret:secret});
    const service=settings.SERVICE_KEY;
    step='resource creation';
    assert.equal(docker(['volume','ls','--filter',`name=^${volume}$`,'--format','{{.Name}}']).trim(),'');
    volumeIntent=true; docker(['volume','create','--label',`${LABEL}=${run}`,volume]);
    assert.equal(docker(['ps','-a','--filter',`name=^/${container}$`,'--format','{{.Names}}']).trim(),'');
    containerIntent=true;
    docker(['create','--pull=never','--name',container,'--label',`${LABEL}=${run}`,'--network','supabase_network_codex-baseline-local-7725bdda','-p','127.0.0.1::5000','--mount',`type=volume,source=${volume},target=/data`,...Object.keys(settings).flatMap(key=>['-e',key]),IMAGE],undefined,{...process.env,...settings});
    docker(['start',container]);
    let port=JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5000/tcp'][0].HostPort;
    step='Storage health'; let healthy=false;
    for(let i=0;i<40;i++) {
      try {healthy=(await fetch(localEndpoint(port,'/status'),{signal:AbortSignal.timeout(1000),redirect:'error'})).ok;}
      catch {healthy=false;}
      if(healthy)break;
      assert.equal(JSON.parse(docker(['inspect',container]))[0].State.Running,true,'Storage exited');
      await new Promise(done=>setTimeout(done,250));
    }
    assert.ok(healthy,'Storage unavailable');
    for(let i=0;i<5;i++) {assert.equal((await fetch(localEndpoint(port,'/status'),{signal:AbortSignal.timeout(2000),redirect:'error'})).status,200);await new Promise(done=>setTimeout(done,200));}
    const migratedAcl=acl(db);
    const migratedHistory=sql("select coalesce(json_agg(to_jsonb(m) order by id),'[]') from storage.migrations m;");
    report.destinationMigrations=JSON.parse(migratedHistory).length;
    assert.ok(report.destinationMigrations>=report.sourceMigrations);
    for(const original of JSON.parse(sourceHistory)) assert.deepEqual(JSON.parse(migratedHistory).find(row=>row.id===original.id),original,'Original migration altered');
    report.newMigrations=JSON.parse(migratedHistory).filter(row=>!JSON.parse(sourceHistory).some(original=>original.id===row.id)).map(row=>({id:row.id,name:row.name}));
    const originalCatalog=JSON.parse(sourceAcl), migratedCatalog=JSON.parse(migratedAcl);
    assert.deepEqual(migratedCatalog.schema,originalCatalog.schema);
    for(const original of originalCatalog.objects) assert.deepEqual(migratedCatalog.objects.find(row=>row.relname===original.relname),original,'Existing Storage ownership/ACL/RLS changed');
    report.schemaChangedByMigrations=migratedAcl!==sourceAcl;
    const request=async(path,method='GET',body,contentType='application/json')=>{
      const response=await fetch(localEndpoint(port,path),{method,headers:{Authorization:`Bearer ${service}`,'Content-Type':contentType},body,signal:AbortSignal.timeout(5000),redirect:'error'});
      assert.ok(response.ok,`Storage HTTP ${response.status}`); return response;
    };
    const integrationUsers=[],integrationTenants=integrated?[randomUUID(),randomUUID()]:[];
    let sourceAuth;
    const authImage='public.ecr.aws/supabase/gotrue:v2.196.0';
    const startIntegratedAuth=async(database,suffix)=>{
      docker(['image','inspect',authImage]);
      const name=database+'_'+suffix+'_auth';
      assert.equal(docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).trim(),'');
      const authSettings=buildLocalRecoveryEnvironment({kind:'auth',image:authImage,host:SOURCE,database,password:authCredential,jwtSecret:secret});
      extraContainers.add(name);
      docker(['create','--pull=never','--name',name,'--label',LABEL+'='+run,'--network','supabase_network_codex-baseline-local-7725bdda','-p','127.0.0.1::9999',...Object.keys(authSettings).flatMap(key=>['-e',key]),authImage],undefined,{...process.env,...authSettings});
      docker(['start',name]);
      const authPort=JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['9999/tcp'][0].HostPort;
      let healthy=false;
      for(let i=0;i<40;i++){try{healthy=(await fetch(localEndpoint(authPort,'/health'),{signal:AbortSignal.timeout(1000),redirect:'error'})).ok;}catch{healthy=false;}if(healthy)break;assert.equal(JSON.parse(docker(['inspect',name]))[0].State.Running,true);await new Promise(done=>setTimeout(done,250));}
      assert.ok(healthy);
      for(let i=0;i<5;i++){assert.equal((await fetch(localEndpoint(authPort,'/health'),{signal:AbortSignal.timeout(2000),redirect:'error'})).status,200);await new Promise(done=>setTimeout(done,200));}
      return {name,port:authPort};
    };
    const authPost=async(auth,path,body,admin=false)=>{
      const response=await fetch(localEndpoint(auth.port,path),{method:'POST',headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer '+service}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(5000),redirect:'error'});
      assert.ok(response.ok,'Integrated Auth API failed');return response.json();
    };
    if(integrated){
      step='integrated Auth fixtures';sourceAuth=await startIntegratedAuth(db,'source');
      for(let tenant=0;tenant<2;tenant++){
        sql("insert into public.institutions(id,name,slug) values ('"+integrationTenants[tenant]+"','"+(browser?'Synthetic browser tenant '+tenant:'Synthetic integrated tenant')+"','"+run+'-'+tenant+"');");
        for(const role of ['docente','alumno']){
          const email=run+'-'+tenant+'-'+role+'@example.invalid',fixturePassword=randomBytes(24).toString('hex');
          const created=await authPost(sourceAuth,'/admin/users',{email,password:fixturePassword,email_confirm:true},true);
          assert.ok(created.role==='authenticated','Fixture Auth role missing');
          assert.ok(typeof created.id==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(created.id));
          sql("update public.profiles set account_role='"+role+"' where user_id='"+created.id+"'; insert into public.memberships(institution_id,user_id,role) values ('"+integrationTenants[tenant]+"','"+created.id+"','viewer');");
          if(role==='alumno')sql("insert into public.student_records(institution_id,profile_id,full_name,external_code) values ('"+integrationTenants[tenant]+"','"+created.id+"','Synthetic Student','"+run+'-'+tenant+"');");
          if(browser && role==='docente')sql("insert into public.teacher_records(institution_id,profile_id,full_name,external_code) values ('"+integrationTenants[tenant]+"','"+created.id+"','Synthetic Teacher','"+run+'-'+tenant+"');");
          const login=await authPost(sourceAuth,'/token?grant_type=password',{email,password:fixturePassword});assert.equal(login.user.id,created.id);
          integrationUsers.push({id:created.id,email,password:fixturePassword,tenant,role});
        }
      }
      assert.equal(sql('select count(*) from auth.users;'),'4');assert.equal(sql('select count(*) from auth.identities;'),'4');
      report.integratedSourceLogins=4;
    }
    step='bucket and bytes API';
    const bucket=`synthetic-${run}`; const key='synthetic/file.bin';
    await request('/bucket','POST',JSON.stringify({id:bucket,name:bucket,public:false}));
    const bytes=randomBytes(8192);
    await request(`/object/${bucket}/${key}`,'POST',bytes,'application/octet-stream');
    const downloaded=Buffer.from(await(await request(`/object/authenticated/${bucket}/${key}`)).arrayBuffer());
    assert.equal(sha(downloaded),sha(bytes));
    report.bytes=bytes.length; report.bytesSha256=sha(bytes);
    assert.equal(sql(`select count(*) from storage.objects where bucket_id='${bucket}' and name='${key}';`),'1');
    assert.equal(sql(`select public from storage.buckets where id='${bucket}';`),'f');
    if(recovery) {
      step='second synthetic object';
      const secondKey='other-prefix/second.bin', secondBytes=randomBytes(16384);
      await request('/object/'+bucket+'/'+secondKey,'POST',secondBytes,'application/octet-stream');
      const manifests=[{key,bytes:bytes.length,sha256:sha(bytes)},{key:secondKey,bytes:secondBytes.length,sha256:sha(secondBytes)}];
      const target=disposableDatabase('gotrue_harness_'+randomBytes(8).toString('hex'));
      const targetVolume=target+'_bytes', targetContainer=target+'_storage';
      const binary=(args,input)=>{
        try {return execFileSync('docker',args,{input,windowsHide:true,timeout:60000,maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});}
        catch(error) {
          const lines=String(error.stderr??'').split(/\r?\n/).filter(line=>line.startsWith('pg_restore: error:'));
          report.archiveErrorCategories=[...new Set(lines.map(line=>/cannot drop .* depend/.test(line)?'DEPENDENT_OBJECTS':/permission denied/.test(line)?'PERMISSION_DENIED':/does not exist/.test(line)?'MISSING_OBJECT':/already exists/.test(line)?'EXISTING_OBJECT':/syntax error/.test(line)?'SYNTAX_ERROR':'OTHER_RESTORE_ERROR'))];
          report.archiveFailureCode=typeof error.code==='string'?error.code:'PROCESS_EXIT';
          throw new Error('Isolated archive operation failed');
        }
      };
      const helper=(name,mount,entrypoint,args,stdin=false)=>{
        assert.equal(docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).trim(),'');
        extraContainers.add(name);
        docker(['create','--pull=never','--name',name,'--label',LABEL+'='+run,'--network','none',...(stdin?['-i']:[]),'--mount',mount,'--entrypoint',entrypoint,IMAGE,...args]);
      };
      const metadata=(database,full=false)=>{
        const tables=JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname in ("+(full?"'auth','public','storage'":"'storage'")+");",database));
        return Object.fromEntries(tables.map(table=>[table,sql("select coalesce(json_agg(v order by v::text),'[]') from (select to_jsonb(t) v from "+table+" t) x;",database)]));
      };
      const structure=database=>normalizeAcl(sql(`select json_build_object(
        'schemas',(select json_agg(row_to_json(x) order by nspname) from (select nspname,pg_get_userbyid(nspowner) owner,nspacl::text acl from pg_namespace where nspname in ('auth','public','storage')) x),'tables',(select json_agg(row_to_json(x) order by schema,relname) from (select relnamespace::regnamespace::text schema,relname,relkind,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner,relacl::text acl from pg_class where relnamespace in (select oid from pg_namespace where nspname in ('auth','public','storage'))) x),
        'functions',(select json_agg(row_to_json(x) order by name) from (select oid::regprocedure::text name,pg_get_userbyid(proowner) owner,proacl::text acl,prosecdef,proconfig,pg_get_functiondef(oid) definition from pg_proc where pronamespace in (select oid from pg_namespace where nspname in ('auth','public','storage')) and prokind='f') x),
        'policies',(select json_agg(row_to_json(x) order by schemaname,tablename,policyname) from (select * from pg_policies where schemaname in ('auth','public','storage')) x),
        'indexes',(select json_agg(row_to_json(x) order by schemaname,indexname) from (select * from pg_indexes where schemaname in ('auth','public','storage')) x),
        'constraints',(select json_agg(row_to_json(x) order by relation,name) from (select conrelid::regclass::text relation,conname name,convalidated,pg_get_constraintdef(oid) definition from pg_constraint where connamespace in (select oid from pg_namespace where nspname in ('auth','public','storage'))) x),
        'triggers',(select json_agg(row_to_json(x) order by relation,name) from (select tgrelid::regclass::text relation,tgname name,tgenabled,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace in (select oid from pg_namespace where nspname in ('auth','public','storage')) and not tgisinternal) x));`,database));
      step='freeze source'; docker(['stop',container]);
      if(integrated)docker(['stop',sourceAuth.name]);
      const before=metadata(db), beforeStructure=structure(db);
      const integratedBefore=integrated?metadata(db,true):null;
      if(integrated)report.integratedSnapshotSha256=sha(JSON.stringify(integratedBefore));
      assert.equal(JSON.parse(before['storage.objects']).length,2);
      assert.equal(JSON.parse(before['storage.buckets']).length,integrated?2:1);
      report.manifest=manifests;
      step='real metadata and bytes backup'; const backupStart=performance.now();
      dbArchive=binary(['exec',SOURCE,'pg_dump','-U','supabase_admin','-d',db,'-Fc']);
      assert.equal(dbArchive.subarray(0,5).toString(),'PGDMP');
      const backupHelper=db+'_tar_backup';
      helper(backupHelper,'type=volume,source='+volume+',target=/data,readonly','/bin/tar',['-C','/data','-cf','-','.']);
      byteArchive=binary(['start','-a',backupHelper]);
      assert.equal(JSON.parse(docker(['inspect',backupHelper]))[0].State.ExitCode,0);
      assert.ok(byteArchive.length>bytes.length+secondBytes.length);
      report.backupMs=Math.round(performance.now()-backupStart);
      report.dbBackupBytes=dbArchive.length; report.byteBackupBytes=byteArchive.length;
      report.dbBackupSha256=sha(dbArchive);report.byteBackupSha256=sha(byteArchive);
      step='empty recovery target';
      assert.equal(sql("select count(*) from pg_database where datname='"+target+"';",'postgres'),'0');
      extraDatabases.add(target); sql('create database '+target+" template template0; comment on database "+target+" is '"+run+"';",'postgres');
      assert.equal(sql("select count(*) from pg_tables where schemaname in ('auth','public','storage');",target),'0');
      assert.equal(docker(['volume','ls','--filter','name=^'+targetVolume+'$','--format','{{.Name}}']).trim(),'');
      extraVolumes.add(targetVolume);docker(['volume','create','--label',LABEL+'='+run,targetVolume]);
      const emptyHelper=target+'_empty';
      helper(emptyHelper,'type=volume,source='+targetVolume+',target=/data,readonly','/bin/sh',['-c','find /data -mindepth 1 -print -quit']);
      assert.equal(docker(['start','-a',emptyHelper]).trim(),'');
      assert.equal(JSON.parse(docker(['inspect',emptyHelper]))[0].State.ExitCode,0);
      step='metadata-only restore';const restoreStart=performance.now();
      binary(['exec','-i',SOURCE,'pg_restore','-U','supabase_admin','-d',target,'--exit-on-error','--single-transaction'],dbArchive);
      assert.deepEqual(metadata(target),before); assert.equal(structure(target),beforeStructure);assert.equal(acl(target),migratedAcl);
      if(integrated)assert.deepEqual(metadata(target,true),integratedBefore,'Integrated rows changed on restore');
      // Metadata restoration leaves this independent file volume empty.
      const afterDbHelper=target+'_metadata_only';
      helper(afterDbHelper,'type=volume,source='+targetVolume+',target=/data,readonly','/bin/sh',['-c','find /data -mindepth 1 -print -quit']);
      assert.equal(docker(['start','-a',afterDbHelper]).trim(),'');
      assert.equal(JSON.parse(docker(['inspect',afterDbHelper]))[0].State.ExitCode,0);
      report.metadataOnlyLeavesBytesEmpty=true;
      step='real bytes restore';
      const restoreHelper=target+'_tar_restore';
      helper(restoreHelper,'type=volume,source='+targetVolume+',target=/data','/bin/tar',['-C','/data','-xpf','-'],true);
      binary(['start','-ai',restoreHelper],byteArchive);
      assert.equal(JSON.parse(docker(['inspect',restoreHelper]))[0].State.ExitCode,0);
      report.restoreMs=Math.round(performance.now()-restoreStart);
      step='restored Storage API';
      const targetSettings=buildLocalRecoveryEnvironment({kind:'storage',image:IMAGE,host:SOURCE,database:target,password,jwtSecret:secret});
      assert.equal(docker(['ps','-a','--filter','name=^/'+targetContainer+'$','--format','{{.Names}}']).trim(),'');
      extraContainers.add(targetContainer);
      docker(['create','--pull=never','--name',targetContainer,'--label',LABEL+'='+run,'--network','supabase_network_codex-baseline-local-7725bdda','-p','127.0.0.1::5000','--mount','type=volume,source='+targetVolume+',target=/data',...Object.keys(targetSettings).flatMap(name=>['-e',name]),IMAGE],undefined,{...process.env,...targetSettings});
      docker(['start',targetContainer]);
      const targetPort=JSON.parse(docker(['inspect',targetContainer]))[0].NetworkSettings.Ports['5000/tcp'][0].HostPort;
      let targetHealthy=false;
      for(let i=0;i<40;i++) {
        try{targetHealthy=(await fetch(localEndpoint(targetPort,'/status'),{signal:AbortSignal.timeout(1000),redirect:'error'})).ok;}catch{targetHealthy=false;}
        if(targetHealthy)break;assert.equal(JSON.parse(docker(['inspect',targetContainer]))[0].State.Running,true);
        await new Promise(done=>setTimeout(done,250));
      }
      assert.ok(targetHealthy);
      for(let i=0;i<5;i++){assert.equal((await fetch(localEndpoint(targetPort,'/status'),{signal:AbortSignal.timeout(2000),redirect:'error'})).status,200);await new Promise(done=>setTimeout(done,200));}
      report.targetHealthSamples=5;
      for(const item of manifests) {
        const response=await fetch(localEndpoint(targetPort,'/object/authenticated/'+bucket+'/'+item.key),{headers:{Authorization:'Bearer '+service},signal:AbortSignal.timeout(5000),redirect:'error'});
        assert.equal(response.status,200); const restored=Buffer.from(await response.arrayBuffer());
        verifyRecoveredBytes(restored,item);
      }
      assert.deepEqual(metadata(target),before);assert.equal(structure(target),beforeStructure);assert.equal(acl(target),migratedAcl);
      assert.equal(JSON.parse(docker(['inspect',targetContainer]))[0].State.Restarting,false);
      assert.equal(JSON.parse(docker(['inspect',targetContainer]))[0].State.Running,true);
      assert.equal(JSON.parse(docker(['inspect',targetContainer]))[0].RestartCount,0);
      const targetLogs=spawnSync('docker',['logs',targetContainer],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024});
      assert.equal(targetLogs.status,0);assert.ok(!/42501|28P01/.test(targetLogs.stdout+targetLogs.stderr));
      report.metadataEqual=true;report.structureEqual=true;report.restoredDownloads=2;
      report.recoveryToDownloadMs=Math.round(performance.now()-restoreStart);
      report.rpo='0 synthetic objects lost at frozen metadata/bytes snapshot';
      if(integrated){
        step='integrated target Auth and RLS';
        // Compare complete Auth/public/Storage rows before target login changes sessions.
        assert.deepEqual(metadata(target,true),integratedBefore);
        const targetAuth=await startIntegratedAuth(target,'target');
        const restoredTokens=[];
        for(const user of integrationUsers){
          const login=await authPost(targetAuth,'/token?grant_type=password',{email:user.email,password:user.password});
          assert.equal(login.user.id,user.id);assert.equal(sql("select account_role from public.profiles where user_id='"+user.id+"';",target),user.role);
          if(api){assert.ok(typeof login.access_token==='string' && login.access_token.length>0);const claims=JSON.parse(Buffer.from(login.access_token.split('.')[1],'base64url').toString());assert.ok(login.user.role==='authenticated' && claims.role==='authenticated' && claims.sub===user.id,'Restored token role/subject mismatch');restoredTokens.push({user,token:login.access_token});}
          const own=integrationTenants[user.tenant],foreign=integrationTenants[1-user.tenant];
          const claims=JSON.stringify({sub:user.id,role:'authenticated'});
          const checks=sql("begin; set local role authenticated; select set_config('request.jwt.claims','"+claims+"',true); select json_build_object('role',current_user,'uid',auth.uid(),'own',(select count(*) from public.institutions where id='"+own+"'),'foreign',(select count(*) from public.institutions where id='"+foreign+"'),'foreignMemberships',(select count(*) from public.memberships where institution_id='"+foreign+"')); with changed as (update public.institutions set name='Unauthorized' where id='"+foreign+"' returning id) select count(*) from changed; rollback;",target);
          const lines=checks.split(/\r?\n/),visibility=JSON.parse(lines.find(line=>line.startsWith('{"role"')));
          assert.deepEqual(visibility,{role:'authenticated',uid:user.id,own:1,foreign:0,foreignMemberships:0});assert.ok(lines.includes('0'));
        }
        assert.equal(sql('select count(*) from auth.schema_migrations;',target),'77');
        assert.equal(metadata(target,true)['auth.schema_migrations'],integratedBefore['auth.schema_migrations']);
        assert.equal(structure(target),beforeStructure);assert.deepEqual(metadata(target),before);
        assert.equal(JSON.parse(docker(['inspect',targetAuth.name]))[0].State.Running,true);assert.equal(JSON.parse(docker(['inspect',targetAuth.name]))[0].RestartCount,0);
        const authLogs=spawnSync('docker',['logs',targetAuth.name],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024});assert.equal(authLogs.status,0);assert.ok(!/42501|28P01/.test(authLogs.stdout+authLogs.stderr));
        report.integratedRowsEqual=true;report.integratedRestoredLogins=4;report.integratedAuthMigrations=77;report.integratedAuthHealthSamples=5;
        report.integratedIsolation={users:4,ownTenantVisible:true,foreignReadRows:0,foreignMembershipRows:0,foreignUpdateRows:0};report.integratedResult='PASS';

        if(api){
          step='restored Data API';
          const restImage='public.ecr.aws/supabase/postgrest:v16.1',restName=target+'_rest';
          docker(['image','inspect',restImage]);
          assert.equal(docker(['ps','-a','--filter','name=^/'+restName+'$','--format','{{.Names}}']).trim(),'');
          step='Data API credential';
          const restRole=docker(['exec','-i',SOURCE,'sh','-c','IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -h 127.0.0.1 -U authenticator -d "$1" -At -v ON_ERROR_STOP=1 -c "select current_user;"','sh',target],restPassword+'\n').trim();assert.equal(restRole,'authenticator');report.dataApiEffectiveRole=restRole;
          const restEnv=buildLocalRecoveryEnvironment({kind:'rest',image:restImage,host:SOURCE,database:target,password:restPassword,jwtSecret:secret});
          extraContainers.add(restName);
          docker(['create','--pull=never','--name',restName,'--label',LABEL+'='+run,'--network','supabase_network_codex-baseline-local-7725bdda','-p','127.0.0.1::3000',...Object.keys(restEnv).flatMap(key=>['-e',key]),restImage],undefined,{...process.env,...restEnv});
          docker(['start',restName]);
          const restPort=JSON.parse(docker(['inspect',restName]))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort;
          const restRequest=(path,token,method='GET',body)=>fetch(localEndpoint(restPort,path),{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000),redirect:'error'});
          step='Data API readiness';let restReady=false;
          for(let i=0;i<40;i++){try{const response=await restRequest('/institutions?select=id',restoredTokens[0].token);report.dataApiReadinessStatus=response.status;restReady=response.ok;if(!restReady){const error=await response.json();if(typeof error.code==='string'&&/^[A-Z0-9]{5,12}$/.test(error.code))report.dataApiErrorCode=error.code;}}catch{restReady=false;report.dataApiTransportFailure=true;}if(restReady)break;const state=JSON.parse(docker(['inspect',restName]))[0].State;report.dataApiProcessExitCode=state.ExitCode;assert.equal(state.Running,true);await new Promise(done=>setTimeout(done,250));}
          step='Data API readiness';assert.ok(restReady,'Data API not ready');
          const beforeApi=metadata(target,true);
          for(const {user,token} of restoredTokens){
            const own=integrationTenants[user.tenant],foreign=integrationTenants[1-user.tenant];
            for(const [path,count] of [['/institutions?select=id&id=eq.'+own,1],['/institutions?select=id&id=eq.'+foreign,0],['/memberships?select=user_id&institution_id=eq.'+foreign,0]]){
              step='Data API read '+path.split('?')[0]+' expected '+count;
              const response=await restRequest(path,token);report.dataApiLastStatus=response.status;assert.equal(response.status,200,'Data API read rejected');assert.equal((await response.json()).length,count,'Data API isolation failed');
            }
            step='Data API foreign PATCH';
            const changed=await restRequest('/institutions?id=eq.'+foreign,token,'PATCH',{name:'Unauthorized'});
            report.dataApiLastStatus=changed.status;assert.equal(changed.status,200,'Data API foreign PATCH rejected unexpectedly');assert.deepEqual(await changed.json(),[]);
          }
          step='Data API invalid JWT';const invalidJwt=await restRequest('/institutions?select=id','invalid.synthetic.jwt');report.dataApiLastStatus=invalidJwt.status;assert.equal(invalidJwt.status,401);
          step='Data API anonymous';const anon=await restRequest('/institutions?select=id');
          report.dataApiLastStatus=anon.status;assert.ok([200,401,403].includes(anon.status),'Unexpected anonymous response');
          if(anon.status===200)assert.deepEqual(await anon.json(),[]);
          step='Data API health samples';for(let i=0;i<5;i++){const health=await restRequest('/institutions?select=id',restoredTokens[0].token);assert.equal(health.status,200);assert.equal((await health.json()).length,1);}
          step='Data API unchanged rows and catalog';assert.deepEqual(metadata(target,true),beforeApi,'Data API changed restored rows');assert.equal(structure(target),beforeStructure);
          const restState=JSON.parse(docker(['inspect',restName]))[0];assert.equal(restState.State.Running,true);assert.equal(restState.RestartCount,0);
          report.dataApi={result:'PASS',users:4,ownReadRows:1,foreignReadRows:0,foreignMembershipRows:0,foreignPatchRows:0,invalidJwtStatus:401,anonymousRows:0,healthSamples:5,rowsUnchanged:true};
          if(browser){
            const ports={auth:targetAuth.port,rest:restPort,storage:targetPort};let frontendPort,edgeModule;
            if(edge){
              step='restored Edge';edgeModule=await import('./validateRecoveredEdge.mjs');
              frontendPort=await edgeModule.reserveLoopbackPort();edgeDirectory=await edgeModule.bundleEdgeFunction('admin-users');
              const edgeKeys=buildLocalRecoveryEnvironment({kind:'storage',image:IMAGE,host:SOURCE,database:target,password,jwtSecret:secret});
              const recoveredEdge=await edgeModule.startRecoveredEdge({docker,network:'supabase_network_codex-baseline-local-7725bdda',label:LABEL,run,directory:edgeDirectory,target,authName:targetAuth.name,restName,storageName:targetContainer,anonKey:edgeKeys.ANON_KEY,serviceKey:edgeKeys.SERVICE_KEY,origin:localEndpoint(frontendPort,'/').slice(0,-1),register:name=>extraContainers.add(name)});
              ports.functions=recoveredEdge.port;report.edgeRuntimeImage=edgeModule.EDGE_RUNTIME_IMAGE;report.edgeGatewayImage=edgeModule.EDGE_GATEWAY_IMAGE;
            }
            step='recovered frontend browser';const {validateRecoveredFrontend}=await import('./validateRecoveredFrontend.mjs');
            await validateRecoveredFrontend({ports,port:frontendPort,anonKey:settings.ANON_KEY,users:integrationUsers,tenants:integrationTenants,report});
            assert.equal(structure(target),beforeStructure);const afterBrowser=metadata(target,true);for(const [table,rows] of Object.entries(beforeApi)){if(edge&&table==='public.admin_audit_logs')continue;if(table.startsWith('public.')||table.startsWith('storage.')||table==='auth.schema_migrations')assert.equal(afterBrowser[table],rows,'Browser changed protected rows');}
            if(edge){
              const docenteIds=integrationUsers.filter(user=>user.role==='docente').map(user=>user.id);
              const auditRows=()=>JSON.parse(sql("select coalesce(json_agg(json_build_object('actor_user_id',actor_user_id,'action',action,'status',status)),'[]') from public.admin_audit_logs;",target));
              step='Edge browser audit';report.edgeBrowserAudit=edgeModule.assertEdgeAudit(auditRows(),docenteIds);assert.ok(report.edgeBrowserAudit.teacher_subject_rosters>=2,'Edge browser audit missing');
              // El logout del navegador revoca globalmente las sesiones previas: el token de la fase Data API ya no debe servir en Edge.
              step='Edge revoked session';const revoked=restoredTokens.find(entry=>entry.user.role==='docente');
              report.edgeRevokedSessionStatus=(await edgeModule.edgeCall(ports.functions,{token:revoked.token,origin:localEndpoint(frontendPort,'/').slice(0,-1),body:{action:'teacher_subject_rosters',institution_id:integrationTenants[revoked.user.tenant],workspace_key:'main'}})).status;
              assert.equal(report.edgeRevokedSessionStatus,401,'Revoked session accepted by Edge');
              step='Edge fresh sessions';const edgeTokens=[];
              for(const user of integrationUsers){const login=await authPost(targetAuth,'/token?grant_type=password',{email:user.email,password:user.password});assert.equal(login.user.id,user.id);edgeTokens.push({user,token:login.access_token});}
              step='Edge authorization';report.edge=await edgeModule.verifyRecoveredEdge({port:ports.functions,origin:localEndpoint(frontendPort,'/').slice(0,-1),tokens:edgeTokens,tenants:integrationTenants,sql,metadata,target,progress:report});
              step='Edge audit';report.edgeAudit=edgeModule.assertEdgeAudit(auditRows(),docenteIds);assert.equal(report.edgeAudit.teacher_profile_update,1);
              assert.equal(structure(target),beforeStructure);
              for(const name of [target+'_gateway',target+'_edge']){const state=JSON.parse(docker(['inspect',name]))[0];assert.equal(state.State.Running,true);assert.equal(state.RestartCount,0);}
              report.edge.result='PASS';
            }
          }
        }
        report.integratedRecoveryMs=Math.round(performance.now()-restoreStart);
      }
      if(rollback) {
        step='controlled target mutation';
        const targetRequest=async(path,method='GET',body)=>{
          const response=await fetch(localEndpoint(targetPort,path),{method,headers:{Authorization:'Bearer '+service,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(5000),redirect:'error'});
          assert.ok(response.ok,'Target mutation API failed');return response;
        };
        // Delete through API then upload changed bytes, never mutate storage.objects by SQL.
        await targetRequest('/object/'+bucket,'DELETE',JSON.stringify({prefixes:[key]}));
        const changedBytes=randomBytes(bytes.length);
        const changed=await fetch(localEndpoint(targetPort,'/object/'+bucket+'/'+key),{method:'POST',headers:{Authorization:'Bearer '+service,'Content-Type':'application/octet-stream'},body:changedBytes,signal:AbortSignal.timeout(5000),redirect:'error'});
        assert.ok(changed.ok,'Target replacement API failed');
        const changedRead=Buffer.from(await(await targetRequest('/object/authenticated/'+bucket+'/'+key)).arrayBuffer());
        assert.equal(sha(changedRead),sha(changedBytes));assert.notEqual(sha(changedRead),manifests[0].sha256);
        assert.notDeepEqual(metadata(target),before,'Mutation not observed in metadata');
        report.controlledMutationObserved=true;
        step='owned target rollback';
        const ownership=JSON.parse(sql("select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='"+target+"';",'postgres'));
        assertOwnedRollbackTarget(target,ownership.owner,ownership.marker,run);
        assert.equal(JSON.parse(docker(['inspect',targetContainer]))[0].Config.Labels[LABEL],run);
        assert.equal(JSON.parse(docker(['volume','inspect',targetVolume]))[0].Labels[LABEL],run);
        docker(['stop',targetContainer]);
        const rollbackStart=performance.now();
        const currentOwnership=JSON.parse(sql("select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='"+target+"';",'postgres'));
        assertOwnedRollbackTarget(target,currentOwnership.owner,currentOwnership.marker,run);
        // Recreate only the explicitly owned disposable database; shared cluster roles remain intact.
        sql('drop database '+target+' with (force);','postgres');
        sql('create database '+target+" template template0; comment on database "+target+" is '"+run+"';",'postgres');
        assert.equal(sql("select count(*) from pg_tables where schemaname in ('auth','public','storage');",target),'0');
        binary(['exec','-i',SOURCE,'pg_restore','-U','supabase_admin','-d',target,'--exit-on-error','--single-transaction'],dbArchive);
        report.rollbackMethod='recreate owned disposable database and restore frozen snapshot';
        assert.deepEqual(metadata(target),before);assert.equal(structure(target),beforeStructure);assert.equal(acl(target),migratedAcl);
        const rollbackVolume=target+'_rollback_bytes', rollbackContainer=target+'_rollback_storage';
        assert.equal(docker(['volume','ls','--filter','name=^'+rollbackVolume+'$','--format','{{.Name}}']).trim(),'');
        extraVolumes.add(rollbackVolume);docker(['volume','create','--label',LABEL+'='+run,rollbackVolume]);
        const empty=target+'_rollback_empty';
        helper(empty,'type=volume,source='+rollbackVolume+',target=/data,readonly','/bin/sh',['-c','find /data -mindepth 1 -print -quit']);
        assert.equal(docker(['start','-a',empty]).trim(),'');assert.equal(JSON.parse(docker(['inspect',empty]))[0].State.ExitCode,0);
        const restore=target+'_rollback_tar';
        helper(restore,'type=volume,source='+rollbackVolume+',target=/data','/bin/tar',['-C','/data','-xpf','-'],true);
        binary(['start','-ai',restore],byteArchive);assert.equal(JSON.parse(docker(['inspect',restore]))[0].State.ExitCode,0);
        assert.equal(docker(['ps','-a','--filter','name=^/'+rollbackContainer+'$','--format','{{.Names}}']).trim(),'');
        extraContainers.add(rollbackContainer);
        docker(['create','--pull=never','--name',rollbackContainer,'--label',LABEL+'='+run,'--network','supabase_network_codex-baseline-local-7725bdda','-p','127.0.0.1::5000','--mount','type=volume,source='+rollbackVolume+',target=/data',...Object.keys(targetSettings).flatMap(name=>['-e',name]),IMAGE],undefined,{...process.env,...targetSettings});
        docker(['start',rollbackContainer]);
        const rollbackPort=JSON.parse(docker(['inspect',rollbackContainer]))[0].NetworkSettings.Ports['5000/tcp'][0].HostPort;
        let rollbackHealthy=false;
        for(let i=0;i<40;i++) {
          try{rollbackHealthy=(await fetch(localEndpoint(rollbackPort,'/status'),{signal:AbortSignal.timeout(1000),redirect:'error'})).ok;}catch{rollbackHealthy=false;}
          if(rollbackHealthy)break;assert.equal(JSON.parse(docker(['inspect',rollbackContainer]))[0].State.Running,true);await new Promise(done=>setTimeout(done,250));
        }
        assert.ok(rollbackHealthy);
        for(let i=0;i<5;i++){assert.equal((await fetch(localEndpoint(rollbackPort,'/status'),{signal:AbortSignal.timeout(2000),redirect:'error'})).status,200);await new Promise(done=>setTimeout(done,200));}
        for(const item of manifests) {
          const response=await fetch(localEndpoint(rollbackPort,'/object/authenticated/'+bucket+'/'+item.key),{headers:{Authorization:'Bearer '+service},signal:AbortSignal.timeout(5000),redirect:'error'});
          assert.equal(response.status,200);verifyRecoveredBytes(Buffer.from(await response.arrayBuffer()),item);
        }
        assert.deepEqual(metadata(target),before);assert.equal(structure(target),beforeStructure);assert.equal(acl(target),migratedAcl);
        const rollbackState=JSON.parse(docker(['inspect',rollbackContainer]))[0];assert.equal(rollbackState.State.Running,true);assert.equal(rollbackState.RestartCount,0);
        const rollbackLogs=spawnSync('docker',['logs',rollbackContainer],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024});assert.equal(rollbackLogs.status,0);assert.ok(!/42501|28P01/.test(rollbackLogs.stdout+rollbackLogs.stderr));
        report.rollbackMs=Math.round(performance.now()-rollbackStart);report.rollbackHealthSamples=5;report.rollbackDownloads=2;report.rollbackMetadataEqual=true;report.rollbackStructureEqual=true;report.rollbackResult='PASS';
      }
      // Resume source only for the original API cleanup checks.
      step='source API cleanup after restart';
      docker(['start',container]);
      port=JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5000/tcp'][0].HostPort;
      let sourceResumed=false;
      for(let i=0;i<40;i++){let resumed=false;try{resumed=(await fetch(localEndpoint(port,'/status'),{signal:AbortSignal.timeout(1000),redirect:'error'})).ok;}catch{resumed=false;}if(resumed){sourceResumed=true;break;}await new Promise(done=>setTimeout(done,250));}
      assert.ok(sourceResumed,'Source did not resume');
      await request('/object/'+bucket,'DELETE',JSON.stringify({prefixes:[secondKey]}));
    }
    step='API delete';
    await request(`/object/${bucket}`,'DELETE',JSON.stringify({prefixes:[key]}));
    assert.equal(sql('select count(*) from storage.objects;'),'0');
    await request(`/bucket/${bucket}`,'DELETE');
    assert.equal(sql('select count(*) from storage.buckets;'),integrated?'1':'0');
    assert.equal(acl(db),migratedAcl,'CRUD modified grants/owners');
    assert.equal(sql("select coalesce(json_agg(to_jsonb(m) order by id),'[]') from storage.migrations m;"),migratedHistory,'CRUD changed migration history');
    report.migrationHistoryStable=true;
    report.existingAclUnchanged=true;
    assert.equal(acl('postgres'),sourceAcl,'Source Storage ACL changed');
    const state=JSON.parse(docker(['inspect',container]))[0];assert.equal(state.RestartCount,0);assert.equal(state.State.Running,true);
    const logs=spawnSync('docker',['logs',container],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024});
    assert.equal(logs.status,0);assert.ok(!/42501|28P01/.test(logs.stdout+logs.stderr));
    report.healthy=true;report.healthSamples=5;report.uploadDownloadDelete=true;report.crudAclUnchanged=true;report.result='PASS';
  } catch(error) {report.result='BLOQUEADO';report.error=`Failed at ${step}: ${error.name}`;}
  finally {
    step='cleanup'; const errors=[];
    dbArchive?.fill(0);byteArchive?.fill(0);dbArchive=undefined;byteArchive=undefined;
    for(const name of extraContainers)try{if(docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).trim()){assert.equal(JSON.parse(docker(['inspect',name]))[0].Config.Labels[LABEL],run);docker(['rm','-f',name]);}}catch{errors.push('Recovery container cleanup failed');}
    for(const name of extraVolumes)try{if(docker(['volume','ls','--filter','name=^'+name+'$','--format','{{.Name}}']).trim()){assert.equal(JSON.parse(docker(['volume','inspect',name]))[0].Labels[LABEL],run);docker(['volume','rm',name]);}}catch{errors.push('Recovery volume cleanup failed');}
    for(const name of extraDatabases)try{disposableDatabase(name);if(sql("select count(*) from pg_database where datname='"+name+"';",'postgres')==='1'){const owner=JSON.parse(sql("select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='"+name+"';",'postgres'));assert.equal(owner.owner,'supabase_admin');assert.ok(owner.marker===run||owner.marker===null);sql('drop database '+name+' with (force);','postgres');}assert.equal(sql("select count(*) from pg_database where datname='"+name+"';",'postgres'),'0');}catch{errors.push('Recovery database cleanup failed');}
    report.archiveBuffersCleared=true;
    if(containerIntent)try {if(docker(['ps','-a','--filter',`name=^/${container}$`,'--format','{{.Names}}']).trim()){assert.equal(JSON.parse(docker(['inspect',container]))[0].Config.Labels[LABEL],run);docker(['rm','-f',container]);}}catch{errors.push('Container cleanup failed');}
    if(volumeIntent)try {if(docker(['volume','ls','--filter',`name=^${volume}$`,'--format','{{.Name}}']).trim()){assert.equal(JSON.parse(docker(['volume','inspect',volume]))[0].Labels[LABEL],run);docker(['volume','rm',volume]);}}catch{errors.push('Volume cleanup failed');}
    if(dbIntent)try {disposableDatabase(db);if(sql(`select count(*) from pg_database where datname='${db}';`,'postgres')==='1'){const ownership=JSON.parse(sql(`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='${db}';`,'postgres'));assert.equal(ownership.owner,'supabase_admin');assert.ok(ownership.marker===run||ownership.marker===null);sql(`drop database ${db} with (force);`,'postgres');}}catch{errors.push('Database cleanup failed');}
    try {assert.equal(sql(`select count(*) from pg_database where datname='${db}';`,'postgres'),'0');assert.equal(docker(['ps','-a','--filter',`label=${LABEL}=${run}`,'--format','{{.Names}}']).trim(),'');assert.equal(docker(['volume','ls','--filter',`label=${LABEL}=${run}`,'--format','{{.Name}}']).trim(),'');}catch{errors.push('Cleanup verification failed');}
    if(edgeDirectory)try{const {removeOwnedDirectory}=await import('./validateRecoveredEdge.mjs');await removeOwnedDirectory(edgeDirectory);}catch{errors.push('Edge bundle cleanup failed');}
    if(report.browserOwnedResourcesClosed===false)errors.push('Browser runtime cleanup unverified');
    report.cleanup={databases:errors.length?'unverified':0,containers:errors.length?'unverified':0,volumes:errors.length?'unverified':0,temporaryFiles:report.browserOwnedResourcesClosed===false?'unverified':0,errors};if(errors.length)report.result='BLOQUEADO';
  }
  console.log(JSON.stringify(report,null,2));if(report.result!=='PASS')process.exitCode=1;return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
