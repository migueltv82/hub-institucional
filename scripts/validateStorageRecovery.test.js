import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {main,verifyRecoveredBytes} from './validateStorageLocalHarness.mjs';
describe('Storage recovery integrity',()=>{
  const bytes=Buffer.from('synthetic-file-A');
  const expected={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  it('accepts identical recovered contents',()=>expect(()=>verifyRecoveredBytes(Buffer.from(bytes),expected)).not.toThrow());
  it('rejects a truncated backup',()=>expect(()=>verifyRecoveredBytes(bytes.subarray(0,-1),expected)).toThrow('size'));
  it('rejects different object contents even with matching size',()=>expect(()=>verifyRecoveredBytes(Buffer.from('synthetic-file-B'),expected)).toThrow('SHA256'));
  it('rejects invalid recovery mode before creating resources',async()=>{await expect(main({recovery:'yes'})).rejects.toThrow();});
});
