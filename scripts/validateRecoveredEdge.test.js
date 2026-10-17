import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {main} from './validateStorageLocalHarness.mjs';
import {edgeImportResolver,edgeGatewayConfig,edgeEnvironment,assertEdgeAudit,bundleEdgeFunction,removeOwnedDirectory} from './validateRecoveredEdge.mjs';

const token=role=>['e30',Buffer.from(JSON.stringify({role})).toString('base64url'),'sig'].join('.');
const run='gotrue_harness_0123456789abcdef';

it('rejects Edge without the recovered frontend before resources',async()=>{await expect(main({edge:true})).rejects.toThrow();await expect(main({recovery:true,integrated:true,api:true,edge:true})).rejects.toThrow();await expect(main({recovery:true,integrated:true,api:true,browser:true,edge:'true'})).rejects.toThrow();});

it('pins supabase-js locally and refuses any other remote import',()=>{const resolveImport=edgeImportResolver(name=>'local:'+name);expect(resolveImport('https://esm.sh/@supabase/supabase-js@2')).toBe('local:@supabase/supabase-js');expect(()=>resolveImport('https://esm.sh/other@1')).toThrow();expect(()=>resolveImport('https://deno.land/std/http.ts')).toThrow();expect(resolveImport('./handler.js')).toBeNull();});

it('routes the gateway only to owned recovery containers',()=>{const config=edgeGatewayConfig({auth:run+'_target_auth',rest:run+'_rest',storage:run+'_storage'});expect(config).toContain('location /auth/v1/ { proxy_pass http://'+run+'_target_auth:9999/;');expect(config).toContain('location / { return 404; }');expect(()=>edgeGatewayConfig({auth:'supabase.co',rest:run+'_rest',storage:run+'_storage'})).toThrow();});

it('builds Edge environment from anon/service keys and a loopback origin only',()=>{const env=edgeEnvironment({gateway:run+'_gateway',anonKey:token('anon'),serviceKey:token('service_role'),origin:'http://127.0.0.1:4173'});expect(env.SUPABASE_URL).toBe('http://'+run+'_gateway:8000');expect(env.ADMIN_USERS_ALLOWED_ORIGINS).toBe('http://127.0.0.1:4173');expect(()=>edgeEnvironment({gateway:run+'_gateway',anonKey:token('service_role'),serviceKey:token('service_role'),origin:'http://127.0.0.1:4173'})).toThrow();expect(()=>edgeEnvironment({gateway:run+'_gateway',anonKey:token('anon'),serviceKey:token('anon'),origin:'http://127.0.0.1:4173'})).toThrow();expect(()=>edgeEnvironment({gateway:run+'_gateway',anonKey:token('anon'),serviceKey:token('service_role'),origin:'https://app.example.com'})).toThrow();});

it('accepts only successful audit rows from synthetic teachers on verified actions',()=>{const ids=['t0','t1'];expect(assertEdgeAudit([{actor_user_id:'t0',action:'teacher_subject_rosters',status:'success'},{actor_user_id:'t0',action:'teacher_profile_update',status:'success'}],ids)).toEqual({teacher_subject_rosters:1,teacher_profile_update:1});expect(()=>assertEdgeAudit([{actor_user_id:'s0',action:'teacher_subject_rosters',status:'success'}],ids)).toThrow();expect(()=>assertEdgeAudit([{actor_user_id:'t0',action:'set_user_password',status:'success'}],ids)).toThrow();expect(()=>assertEdgeAudit([{actor_user_id:'t0',action:'teacher_subject_rosters',status:'error'}],ids)).toThrow();});

it('bundles admin-users without remote or Node imports and cleans its owned directory',async()=>{const directory=await bundleEdgeFunction('admin-users');try{const code=readFileSync(directory+'/admin-users/index.js','utf8');expect(code).toContain('Deno.serve');expect(code).not.toMatch(/https:\/\/esm\.sh|from ['"]node:/);}finally{await removeOwnedDirectory(directory);}await expect(bundleEdgeFunction('source-file-storage')).rejects.toThrow();await expect(removeOwnedDirectory('/etc')).rejects.toThrow();},30000);
