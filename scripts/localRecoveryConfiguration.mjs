import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
export const LOCAL_RECOVERY_IMAGES=Object.freeze({auth:'public.ecr.aws/supabase/gotrue:v2.196.0',storage:'public.ecr.aws/supabase/storage-api:v1.70.7',rest:'public.ecr.aws/supabase/postgrest:v16.1'});
const HOST='supabase_db_codex-baseline-local-7725bdda';
const allowed=new Set(['kind','image','host','database','password','jwtSecret']);
export function buildLocalRecoveryEnvironment(input) {
  assert.ok(input && typeof input==='object' && !Array.isArray(input),'Missing local recovery contract');
  assert.ok(Object.keys(input).every(key=>allowed.has(key)),'Unsupported configuration field');
  const {kind,image,host,database,password,jwtSecret}=input;
  assert.ok(kind==='auth'||kind==='storage'||kind==='rest','Unsupported local service');
  assert.ok(image===LOCAL_RECOVERY_IMAGES[kind],'Incompatible local image');
  assert.ok(host===HOST,'Remote/shared target forbidden');
  assert.ok(typeof database==='string' && /^gotrue_harness_[a-f0-9]{16}$/.test(database),'Invalid disposable database');
  assert.ok(typeof password==='string' && password.length>0 && !/[\r\n\0]/.test(password),'Missing/invalid standard local credential');
  assert.ok(typeof jwtSecret==='string' && /^[a-f0-9]{96}$/.test(jwtSecret),'Missing/invalid ephemeral JWT secret');
  const role=kind==='auth'?'supabase_auth_admin':kind==='rest'?'authenticator':'supabase_storage_admin';
  const uri=`postgresql://${role}:${encodeURIComponent(password)}@${host}:5432/${database}`;
  if(kind==='rest')return {PGRST_DB_URI:uri,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,PGRST_DB_CONFIG:'false',PGRST_SERVER_HOST:'0.0.0.0',PGRST_SERVER_PORT:'3000',PGRST_LOG_LEVEL:'error'};
  if(kind==='auth')return {
    GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:9999',GOTRUE_SITE_URL:'http://127.0.0.1:4173',
    GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:uri+'?options=-csearch_path%3Dauth',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_LOG_LEVEL:'error',
  };
  const token=role=>{
    const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const p=Buffer.from(JSON.stringify({role,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
    return `${h}.${p}.${createHmac('sha256',jwtSecret).update(`${h}.${p}`).digest('base64url')}`;
  };
  return {SERVER_HOST:'0.0.0.0',SERVER_PORT:'5000',AUTH_JWT_SECRET:jwtSecret,AUTH_JWT_ALGORITHM:'HS256',DATABASE_URL:uri,DATABASE_SEARCH_PATH:'storage',
    DB_INSTALL_ROLES:'false',DB_SUPER_USER:'supabase_storage_admin',DB_ALLOW_MIGRATION_REFRESH:'false',STORAGE_BACKEND:'file',STORAGE_FILE_BACKEND_PATH:'/data',
    TENANT_ID:'local-recovery',REGION:'local',GLOBAL_S3_BUCKET:'local',ANON_KEY:token('anon'),SERVICE_KEY:token('service_role'),FILE_SIZE_LIMIT:'1048576',UPLOAD_FILE_SIZE_LIMIT:'1048576',
    IMAGE_TRANSFORMATION_ENABLED:'false',PG_QUEUE_ENABLE:'false',OTEL_METRICS_ENABLED:'false',LOG_LEVEL:'error'};
}
