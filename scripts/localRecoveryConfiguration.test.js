import {describe,it,expect} from 'vitest';
import {buildLocalRecoveryEnvironment,LOCAL_RECOVERY_IMAGES} from './localRecoveryConfiguration.mjs';
const contract={kind:'auth',image:LOCAL_RECOVERY_IMAGES.auth,host:'supabase_db_codex-baseline-local-7725bdda',database:'gotrue_harness_0123456789abcdef',password:'synthetic:@/value',jwtSecret:'a'.repeat(96)};
describe('local recovery configuration fail closed',()=>{
  it('binds Auth to its standard role and loopback settings',()=>{
    const env=buildLocalRecoveryEnvironment(contract);
    expect(env.GOTRUE_DB_DATABASE_URL).toContain('supabase_auth_admin:synthetic%3A%40%2Fvalue@');
    expect(env.GOTRUE_JWT_DEFAULT_GROUP_NAME).toBe('authenticated');
    expect(env.GOTRUE_JWT_AUD).toBe('authenticated');
    expect(env.GOTRUE_SITE_URL).toBe('http://127.0.0.1:4173');
  });
  it('rejects missing credentials before constructing environment',()=>{
    for(const key of ['password','jwtSecret']){const invalid={...contract};delete invalid[key];expect(()=>buildLocalRecoveryEnvironment(invalid)).toThrow();}
  });
  it('rejects remote, shared and injected targets',()=>{
    for(const host of ['remote.example','127.0.0.1@remote.example'])expect(()=>buildLocalRecoveryEnvironment({...contract,host})).toThrow();
    for(const database of ['postgres','gotrue_harness_0123456789abcdef;drop database postgres'])expect(()=>buildLocalRecoveryEnvironment({...contract,database})).toThrow();
  });
  it('rejects an incompatible service version and unsupported overrides',()=>{
    expect(()=>buildLocalRecoveryEnvironment({...contract,image:'public.ecr.aws/supabase/gotrue:latest'})).toThrow();
    expect(()=>buildLocalRecoveryEnvironment({...contract,VITE_SERVICE_ROLE_KEY:'synthetic'})).toThrow();
    expect(()=>buildLocalRecoveryEnvironment({...contract,kind:'edge'})).toThrow();
  });
  it('reconstructs Storage without installing roles and keeps secrets out of VITE',()=>{
    const env=buildLocalRecoveryEnvironment({...contract,kind:'storage',image:LOCAL_RECOVERY_IMAGES.storage});
    expect(env.DATABASE_URL).toContain('supabase_storage_admin:');expect(env.DB_INSTALL_ROLES).toBe('false');
    expect(Object.keys(env).some(key=>key.startsWith('VITE_'))).toBe(false);
    expect(JSON.parse(Buffer.from(env.SERVICE_KEY.split('.')[1],'base64url').toString()).role).toBe('service_role');
    expect(JSON.parse(Buffer.from(env.ANON_KEY.split('.')[1],'base64url').toString()).role).toBe('anon');
  });
});
