import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHmac, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { authPassword, authUri, normalizeAcl } from './validateGoTrueLocalHarness.mjs';

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const IMAGE = 'public.ecr.aws/supabase/gotrue:v2.196.0';
const LABEL = 'hub.db-auth-recovery';
const BASELINE = ['01_foundation.sql','02_academic_relational_schema.sql','03_workspace_data.sql','04_teacher_exam_date_exclusions.sql','05_workspace_operational_compat.sql','06_subject_teacher_assignments.sql','07_academic_operations.sql','08_exam_tables.sql','05_student_portal_secure_read.sql'];
const hash = value => createHash('sha256').update(value).digest('hex');
export function disposableDatabase(value) {
  assert.match(value, /^gotrue_harness_[a-f0-9]{16}$/);
  return value;
}
export function localEndpoint(port, path) {
  assert.match(String(port), /^[0-9]{1,5}$/);
  assert.ok(Number(port) > 0 && Number(port) <= 65535);
  assert.ok(path.startsWith('/') && !path.startsWith('//') && !/[\\\r\n]/.test(path));
  return `http://127.0.0.1:${port}${path}`;
}
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";

export async function main() {
  const run = randomBytes(8).toString('hex');
  const dbs = [disposableDatabase(`gotrue_harness_${run}`), disposableDatabase(`gotrue_harness_${randomBytes(8).toString('hex')}`)];
  const databases = new Set();
  const containers = new Set();
  const report = { run, staging:'NONE', production:'NONE', image:IMAGE, sourceImage:'public.ecr.aws/supabase/postgres:17.6.1.165' };
  let step = 'preflight';
  let archive;
  const docker = (args, input, binary = false, env = process.env) => {
    try { return execFileSync('docker', args, { input, encoding:binary ? undefined : 'utf8', env, windowsHide:true, timeout:60000, maxBuffer:64*1024*1024, stdio:['pipe','pipe','pipe'] }); }
    catch (error) { const state = String(error.stderr ?? '').match(/\b(?:42501|28P01|23503|23505)\b/); throw new Error(`Local ${step} failed; SQLSTATE=${state?.[0] ?? 'unavailable'}`); }
  };
  const sql = (db, query) => docker(['exec','-i',SOURCE,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db,'-At'],query).trim();
  const history = db => sql(db,"select coalesce(json_agg(version order by version),'[]') from auth.schema_migrations;");
  const catalog = db => normalizeAcl(sql(db,`select json_build_object(
    'schemas',(select json_agg(row_to_json(x) order by nspname) from (select nspname,pg_get_userbyid(nspowner) owner,nspacl::text acl from pg_namespace where nspname in ('auth','public','storage')) x),
    'relations',(select json_agg(row_to_json(x) order by schema,name) from (select n.nspname schema,c.relname name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,c.relacl::text acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','storage')) x),
    'functions',(select json_agg(row_to_json(x) order by name) from (select p.oid::regprocedure::text name,pg_get_userbyid(proowner) owner,proacl::text acl,prosecdef,proconfig,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('auth','public','storage') and p.prokind='f') x),
    'indexes',(select json_agg(row_to_json(x) order by schemaname,tablename,indexname) from (select * from pg_indexes where schemaname in ('auth','public','storage')) x),
    'policies',(select json_agg(row_to_json(x) order by schemaname,tablename,policyname) from (select * from pg_policies where schemaname in ('auth','public','storage')) x),
    'constraints',(select json_agg(row_to_json(x) order by relation,name) from (select conrelid::regclass::text relation,conname name,convalidated,pg_get_constraintdef(oid) definition from pg_constraint where connamespace in (select oid from pg_namespace where nspname in ('auth','public','storage'))) x),
    'triggers',(select json_agg(row_to_json(x) order by relation,name) from (select tgrelid::regclass::text relation,tgname name,tgenabled,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','storage') and not tgisinternal) x));`));
  const rows = db => {
    const tables = JSON.parse(sql(db,"select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname in ('auth','public','storage');"));
    const snapshots=Object.fromEntries(tables.map(table => {
      const value = sql(db,`select coalesce(json_agg(v order by v::text),'[]') from (select to_jsonb(t) v from ${table} t) x;`);
      return [table,{count:JSON.parse(value).length,sha256:hash(value)}];
    }));
    const sequences=JSON.parse(sql(db,"select coalesce(json_agg(format('%I.%I',sequence_schema,sequence_name) order by sequence_schema,sequence_name),'[]') from information_schema.sequences where sequence_schema in ('auth','public','storage');"));
    for(const sequence of sequences) snapshots[sequence]={sha256:hash(sql(db,`select json_build_object('last_value',last_value,'is_called',is_called) from ${sequence};`))};
    return snapshots;
  };
  let secret;
  let password;
  let network;
  const startAuth = async db => {
    const name = `${db}_recovery_auth`;
    assert.equal(docker(['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}']).trim(),'');
    containers.add(name);
    const env = { GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:9999',GOTRUE_SITE_URL:'http://127.0.0.1:4173',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:authUri(password,SOURCE,db),GOTRUE_JWT_SECRET:secret,GOTRUE_LOG_LEVEL:'error',GOTRUE_MAILER_AUTOCONFIRM:'true' };
    docker(['create','--pull=never','--name',name,'--label',`${LABEL}=${run}`,'--network',network,'-p','127.0.0.1::9999',...Object.keys(env).flatMap(key=>['-e',key]),IMAGE],undefined,false,{...process.env,...env});
    docker(['start',name]);
    const port = JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['9999/tcp'][0].HostPort;
    let healthy = false;
    for (let attempt=0;attempt<40;attempt++) {
      try { healthy = (await fetch(localEndpoint(port,'/health'),{signal:AbortSignal.timeout(1000),redirect:'error'})).status===200; }
      catch { healthy=false; }
      if (healthy) break;
      assert.equal(JSON.parse(docker(['inspect',name]))[0].State.Running,true);
      await new Promise(done=>setTimeout(done,250));
    }
    assert.ok(healthy,'Auth health unavailable');
    for (let i=0;i<5;i++) {
      assert.equal((await fetch(localEndpoint(port,'/health'),{signal:AbortSignal.timeout(2000),redirect:'error'})).status,200);
      await new Promise(done=>setTimeout(done,200));
    }
    return {name,port};
  };
  const request = async (auth,path,body,admin=false) => {
    const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({role:'service_role',exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
    const token=`${header}.${payload}.${createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url')}`;
    const response=await fetch(localEndpoint(auth.port,path),{method:'POST',headers:{'Content-Type':'application/json',...(admin?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(5000),redirect:'error'});
    assert.ok(response.ok,`Local Auth HTTP ${response.status}`);
    return response.json();
  };
  const createDatabase = db => {
    disposableDatabase(db);
    assert.equal(sql('postgres',`select count(*) from pg_database where datname=${quote(db)};`),'0');
    databases.add(db);
    sql('postgres',`create database ${db} template template0; comment on database ${db} is ${quote(run)};`);
  };
  try {
    const source=JSON.parse(docker(['inspect',SOURCE]))[0];
    assert.equal(source.Config.Image,report.sourceImage);
    assert.equal(source.State.Health.Status,'healthy');
    assert.deepEqual(Object.keys(source.NetworkSettings.Networks),['supabase_network_codex-baseline-local-7725bdda']);
    network=Object.keys(source.NetworkSettings.Networks)[0];
    docker(['image','inspect',IMAGE]);
    const env=Object.fromEntries(source.Config.Env.map(entry=>{const i=entry.indexOf('=');return [entry.slice(0,i),entry.slice(i+1)];}));
    password=authPassword(docker(['exec',SOURCE,'cat','/etc/postgresql.schema.sql']),env);
    secret=randomBytes(48).toString('hex');
    const originalHistory=history('postgres');
    assert.equal(JSON.parse(originalHistory).length,77);
    step='source schema preparation';
    const schema=docker(['exec',SOURCE,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--no-comments']);
    const migrations=docker(['exec',SOURCE,'pg_dump','-U','supabase_admin','-d','postgres','--data-only','--table=auth.schema_migrations']);
    createDatabase(dbs[0]);
    sql(dbs[0],schema); sql(dbs[0],migrations);
    for (const file of BASELINE) sql(dbs[0],readFileSync(resolve('supabase/schema',file),'utf8'));
    assert.equal(sql(dbs[0],'select count(*) from auth.users;'),'0');
    assert.equal(sql(dbs[0],'select count(*) from public.institutions;'),'0');
    step='synthetic Auth fixtures';
    const sourceAuth=await startAuth(dbs[0]);
    const tenants=[randomUUID(),randomUUID()];
    const users=[];
    for (let tenant=0;tenant<2;tenant++) {
      sql(dbs[0],`insert into public.institutions(id,name,slug) values (${quote(tenants[tenant])},'Synthetic recovery tenant',${quote(`${run}-${tenant}`)});`);
      for (const role of ['docente','alumno']) {
        const email=`${run}-${tenant}-${role}@example.invalid`;
        const fixturePassword=randomBytes(24).toString('hex');
        const user=await request(sourceAuth,'/admin/users',{email,password:fixturePassword,email_confirm:true},true);
        assert.match(user.id,/^[a-f0-9-]{36}$/);
        sql(dbs[0],`update public.profiles set account_role=${quote(role)} where user_id=${quote(user.id)}; insert into public.memberships(institution_id,user_id,role) values (${quote(tenants[tenant])},${quote(user.id)},'viewer');`);
        if(role==='alumno') sql(dbs[0],`insert into public.student_records(institution_id,profile_id,full_name,external_code) values (${quote(tenants[tenant])},${quote(user.id)},'Synthetic Student',${quote(`${run}-${tenant}`)});`);
        const login=await request(sourceAuth,'/token?grant_type=password',{email,password:fixturePassword});
        assert.equal(login.user.id,user.id);
        users.push({id:user.id,email,password:fixturePassword,tenant,role});
      }
    }
    docker(['stop',sourceAuth.name]);
    step='source snapshot';
    const beforeRows=rows(dbs[0]);
    const beforeCatalog=catalog(dbs[0]);
    assert.equal(beforeRows['auth.users'].count,4);
    assert.equal(beforeRows['auth.identities'].count,4);
    assert.equal(beforeRows['public.profiles'].count,4);
    assert.equal(beforeRows['public.memberships'].count,4);
    assert.equal(beforeRows['public.student_records'].count,2);
    step='real backup';
    const backupStart=performance.now();
    archive=docker(['exec',SOURCE,'pg_dump','-U','supabase_admin','-d',dbs[0],'-Fc'],undefined,true);
    report.backupMs=Math.round(performance.now()-backupStart);
    assert.equal(archive.subarray(0,5).toString(),'PGDMP');
    report.backupBytes=archive.length; report.backupSha256=hash(archive);
    step='empty destination'; createDatabase(dbs[1]);
    assert.equal(sql(dbs[1],"select count(*) from pg_tables where schemaname in ('auth','public','storage');"),'0');
    step='real restore';
    const restoreStart=performance.now();
    docker(['exec','-i',SOURCE,'pg_restore','-U','supabase_admin','-d',dbs[1],'--exit-on-error','--single-transaction'],archive);
    report.restoreMs=Math.round(performance.now()-restoreStart);
    step='restored integrity';
    assert.deepEqual(rows(dbs[1]),beforeRows,'Restored row contents differ');
    assert.equal(catalog(dbs[1]),beforeCatalog,'Restored catalog differs');
    assert.equal(history(dbs[1]),originalHistory);
    report.tables=beforeRows; report.catalogSha256=hash(beforeCatalog);
    report.migrations=77; report.catalogEqual=true; report.allTableRowsEqual=true;
    step='post restore login';
    const destinationAuth=await startAuth(dbs[1]);
    for (const user of users) {
      const login=await request(destinationAuth,'/token?grant_type=password',{email:user.email,password:user.password});
      assert.equal(login.user.id,user.id);
      assert.equal(sql(dbs[1],`select account_role from public.profiles where user_id=${quote(user.id)};`),user.role);
    }
    report.restoredLogins=4;
    step='tenant isolation';
    for (const user of users) {
      const claims=quote(JSON.stringify({sub:user.id,role:'authenticated'}));
      const result=sql(dbs[1],`begin; set local role authenticated; select set_config('request.jwt.claims',${claims},true); select json_build_object('role',current_user,'uid',auth.uid(),'own',(select count(*) from public.institutions where id=${quote(tenants[user.tenant])}),'foreign',(select count(*) from public.institutions where id=${quote(tenants[1-user.tenant])}),'foreignMemberships',(select count(*) from public.memberships where institution_id=${quote(tenants[1-user.tenant])})); with changed as (update public.institutions set name='Unauthorized' where id=${quote(tenants[1-user.tenant])} returning id) select count(*) from changed; rollback;`);
      const lines=result.split(/\r?\n/);
      const visibility=JSON.parse(lines.find(line=>line.startsWith('{"role"')));
      assert.deepEqual(visibility,{role:'authenticated',uid:user.id,own:1,foreign:0,foreignMemberships:0});
      assert.ok(lines.includes('0'),'Foreign write did not produce zero rows');
    }
    report.isolation={users:4,ownTenantRead:true,foreignReadRows:0,foreignMembershipRows:0,foreignUpdateRows:0};
    assert.equal(history('postgres'),originalHistory);
    assert.equal(history(dbs[1]),originalHistory);
    assert.equal(catalog(dbs[1]),beforeCatalog);
    report.catalogEqualAfterLogin=true;
    report.rpo='0 synthetic committed rows lost at frozen snapshot';
    report.recoveryToLoginMs=Math.round(performance.now()-restoreStart);
    report.result='PASS';
  } catch(error) {
    report.result='BLOQUEADO'; report.error=`Failed at ${step}: ${error.name}`;
  } finally {
    step='cleanup'; const errors=[];
    for(const name of containers) {
      try {
        if(docker(['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}']).trim()) {
          assert.equal(JSON.parse(docker(['inspect',name]))[0].Config.Labels[LABEL],run);
          docker(['rm','-f',name]);
        }
      } catch {errors.push('Owned container cleanup failed');}
    }
    for(const db of databases) {
      try {
        disposableDatabase(db);
        const exists=sql('postgres',`select count(*) from pg_database where datname=${quote(db)};`);
        if(exists==='1') {
          const ownership=JSON.parse(sql('postgres',`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname=${quote(db)};`));
          assert.equal(ownership.owner,'supabase_admin');
          assert.ok(ownership.marker===run || ownership.marker===null,'Unexpected resource marker');
          // A null marker is recoverable only for this prechecked, generated creation intent.
          sql('postgres',`drop database ${db} with (force);`);
        }
      } catch {errors.push('Owned database cleanup failed');}
    }
    archive?.fill(0); archive=undefined;
    try {
      assert.equal(sql('postgres',`select count(*) from pg_database where datname in (${dbs.map(quote).join(',')});`),'0');
      assert.equal(docker(['ps','-a','--filter',`label=${LABEL}=${run}`,'--format','{{.Names}}']).trim(),'');
    } catch {errors.push('Cleanup verification failed');}
    report.cleanup={databases:errors.length?'unverified':0,containers:errors.length?'unverified':0,backupFiles:0,archiveBufferCleared:true,errors};
    if(errors.length) report.result='BLOQUEADO';
  }
  console.log(JSON.stringify(report,null,2));
  if(report.result!=='PASS') process.exitCode=1;
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();


