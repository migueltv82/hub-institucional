import {describe,it,expect} from 'vitest';
import {main} from './validateStorageLocalHarness.mjs';
describe('integrated recovery boundaries',()=>{
  it('rejects integration without a real recovery before resources',async()=>{await expect(main({integrated:true})).rejects.toThrow('requires recovery');});
  it('keeps integrated recovery separate from rollback',async()=>{await expect(main({recovery:true,integrated:true,rollback:true})).rejects.toThrow('requires recovery');});
  it('rejects an invalid integration mode before resources',async()=>{await expect(main({recovery:true,integrated:'yes'})).rejects.toThrow();});
});
