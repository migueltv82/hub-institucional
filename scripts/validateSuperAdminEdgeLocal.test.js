import {it,expect} from 'vitest';
import {SUPERADMIN_ACTORS,studentRow} from './validateSuperAdminEdgeLocal.mjs';
import {roleToken} from './localSupabaseStack.mjs';

it('covers a global admin and owners/viewers of two institutions',()=>{expect(SUPERADMIN_ACTORS.filter(actor=>actor.globalAdmin).map(actor=>actor.key)).toEqual(['superadmin']);expect(SUPERADMIN_ACTORS.filter(actor=>actor.membership==='owner').map(actor=>actor.tenant)).toEqual([0,1]);expect(SUPERADMIN_ACTORS.some(actor=>actor.membership==='viewer')).toBe(true);});
it('builds synthetic student rows on a non-routable domain',()=>{const row=studentRow('0123456789abcdef','own');expect(row.email).toBe('0123456789abcdef-student-own@example.invalid');expect(row.dni).toMatch(/^\d{8}$/);expect(()=>studentRow('nothex','own')).toThrow();expect(()=>studentRow('0123456789abcdef','Bad Label')).toThrow();});
it('shares the ephemeral role token signer with the round trip harness',()=>{expect(JSON.parse(Buffer.from(roleToken('b'.repeat(96),'service_role').split('.')[1],'base64url').toString()).role).toBe('service_role');});
