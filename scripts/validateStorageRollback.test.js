import {describe,it,expect} from 'vitest';
import {assertOwnedRollbackTarget,main} from './validateStorageLocalHarness.mjs';
describe('destructive rollback boundaries',()=>{
  const database='gotrue_harness_0123456789abcdef', run='0123456789abcdef';
  it('requires a generated database, matching marker and standard owner',()=>{expect(()=>assertOwnedRollbackTarget(database,'supabase_admin',run,run)).not.toThrow();});
  it('rejects shared databases and SQL injection',()=>{for(const db of ['postgres',database+';drop database postgres'])expect(()=>assertOwnedRollbackTarget(db,'supabase_admin',run,run)).toThrow();});
  it('rejects unmarked, foreign-owned and foreign-run resources',()=>{
    for(const [owner,marker] of [['postgres',run],['supabase_admin',null],['supabase_admin','ffffffffffffffff']])expect(()=>assertOwnedRollbackTarget(database,owner,marker,run)).toThrow();
  });
  it('refuses rollback without recovery before creating any resources',async()=>{await expect(main({rollback:true})).rejects.toThrow('requires recovery');await expect(main({recovery:true,rollback:'yes'})).rejects.toThrow();});
});
