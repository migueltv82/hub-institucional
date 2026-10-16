import {it,expect} from 'vitest';
import {main} from './validateStorageLocalHarness.mjs';
import {frontendProxyTargets,frontendHttpFailure} from './validateRecoveredFrontend.mjs';
it('rejects frontend without integrated Data API before resources',async()=>{await expect(main({browser:true})).rejects.toThrow();await expect(main({browser:true,integrated:true,recovery:true})).rejects.toThrow();await expect(main({browser:'true'})).rejects.toThrow();});
it('rejects remote injection and unknown proxy services',()=>{expect(()=>frontendProxyTargets({auth:'https://example.com',rest:3000,storage:5000})).toThrow();expect(()=>frontendProxyTargets({auth:9999,rest:3000,storage:5000,external:443})).toThrow();});
it('pins proxy targets to loopback and strips only service prefixes',()=>{const p=frontendProxyTargets({auth:9999,rest:3000,storage:5000});expect(p['/auth/v1'].target).toBe('http://127.0.0.1:9999/');expect(p['/rest/v1'].followRedirects).toBe(false);expect(p['/rest/v1'].rewrite('/rest/v1/institutions?select=id')).toBe('/institutions?select=id');});

it('blocks failures on deep hyphenated API and frontend routes',()=>{for(const path of ['/rest/v1/rpc/deep-function/x-y','/storage/v1/object/private/file.bin','/assets/chunk-error.js'])expect(frontendHttpFailure('http://127.0.0.1:4173'+path,500)?.status).toBe(500);expect(frontendHttpFailure('http://127.0.0.1:4173/rest/v1/profiles',200)).toBeNull();});
it('reports HTTP failures without sensitive path or query values',()=>{expect(frontendHttpFailure('http://127.0.0.1:4173/auth/v1/secret-path?token=synthetic-sensitive',401)).toEqual({service:'auth',status:401});});

it('classifies known Edge dependencies without arbitrary URLs',()=>{expect(frontendHttpFailure('http://127.0.0.1:4173/functions/v1/admin-users?secret=hidden',404)).toEqual({service:'functions',status:404,endpoint:'admin-users'});expect(frontendHttpFailure('http://127.0.0.1:4173/functions/v1/private-secret-name?secret=hidden',404)).toEqual({service:'functions',status:404});});
