import {it,expect} from 'vitest';
import {main} from './validateStorageLocalHarness.mjs';
import {buildLocalRecoveryEnvironment,LOCAL_RECOVERY_IMAGES} from './localRecoveryConfiguration.mjs';
it('rejects Data API without integrated recovery before resources',async()=>{await expect(main({api:true})).rejects.toThrow();await expect(main({api:true,recovery:true})).rejects.toThrow();await expect(main({api:'true'})).rejects.toThrow();});
it('pins Data API to authenticator and explicit local configuration',()=>{const e=buildLocalRecoveryEnvironment({kind:'rest',image:LOCAL_RECOVERY_IMAGES.rest,host:'supabase_db_codex-baseline-local-7725bdda',database:'gotrue_harness_0123456789abcdef',password:'synthetic:@/',jwtSecret:'a'.repeat(96)});expect(e.PGRST_DB_URI).toContain('authenticator:synthetic%3A%40%2F@');expect(e.PGRST_DB_CONFIG).toBe('false');expect(e.PGRST_DB_SCHEMAS).toBe('public');expect(Object.keys(e).some(k=>k.startsWith('VITE_'))).toBe(false);});
