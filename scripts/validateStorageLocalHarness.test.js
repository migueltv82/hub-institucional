import { describe,it,expect } from 'vitest';
import { storageUri } from './validateStorageLocalHarness.mjs';
describe('local Storage credential boundaries',()=>{
  it('uses only the standard Storage role and safely encodes credentials',()=>{
    expect(storageUri('synthetic:@/value','supabase_db_codex-baseline-local-7725bdda','gotrue_harness_0123456789abcdef')).toContain('supabase_storage_admin:synthetic%3A%40%2Fvalue@');
  });
  it('rejects remote hosts, shared databases and SQL injection',()=>{
    expect(()=>storageUri('synthetic','remote.example','gotrue_harness_0123456789abcdef')).toThrow();
    for(const db of ['postgres','gotrue_harness_0123456789abcdef;drop database postgres'])expect(()=>storageUri('synthetic','supabase_db_codex-baseline-local-7725bdda',db)).toThrow();
  });
});
