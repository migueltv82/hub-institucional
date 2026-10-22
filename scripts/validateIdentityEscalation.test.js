import {it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {deniedResponse,PRIVILEGED_RPCS,ESCALATION_ACTORS} from './validateIdentityEscalation.mjs';
import {main} from './validateIdentityAuthLocal.mjs';

it('treats only client errors or empty results as denied',()=>{expect(deniedResponse(403,{code:'42501'})).toBe(true);expect(deniedResponse(401,null)).toBe(true);expect(deniedResponse(200,[])).toBe(true);expect(deniedResponse(200,[{user_id:'x'}])).toBe(false);expect(deniedResponse(201,[{user_id:'x'}])).toBe(false);expect(deniedResponse(204,null)).toBe(false);expect(deniedResponse(500,null)).toBe(false);});

it('covers every definer RPC that writes profiles or memberships and is granted to authenticated',()=>{
  const dir='supabase/schema',found=new Set();
  for(const file of readdirSync(dir).filter(name=>name.endsWith('.sql'))){
    const source=readFileSync(join(dir,file),'utf8');
    for(const match of source.matchAll(/create or replace function public\.(\w+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$;/gi)){
      const [,name,head,body]=match;
      if(!/security definer/i.test(head)||!/(update|insert into|delete from)\s+public\.(profiles|memberships)\b/i.test(body))continue;
      if(new RegExp(`grant execute on function public\\.${name}\\s*\\([^)]*\\)\\s*to\\s+[^;]*\\bauthenticated\\b`,'i').test(source))found.add(name);
    }
  }
  expect([...found].sort()).toEqual([...PRIVILEGED_RPCS].sort());
});

it('includes owner, blocked and cross-tenant actors',()=>{expect(ESCALATION_ACTORS.map(actor=>actor.key)).toEqual(['alumno','docente','owner','foreign','blocked']);expect(ESCALATION_ACTORS.find(actor=>actor.key==='owner').membership).toBe('owner');expect(ESCALATION_ACTORS.find(actor=>actor.key==='foreign').tenant).toBe(1);});
it('rejects a non-boolean escalation flag before resources',async()=>{await expect(main({escalation:'true'})).rejects.toThrow();});
