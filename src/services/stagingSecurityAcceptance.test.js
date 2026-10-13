import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildStagingSecurityQuery, compileFullMatrix, checkpoint } from '../../supabase/baseline/staging_security_1.mjs';

describe('Staging security acceptance generator', () => {
  it('compiles full matrix with nested focal branches disabled', () => {
    expect(compileFullMatrix('\\if :{?grade_tenant_focal}\nFOCAL\n\\else\nFULL\n\\endif')).toBe('FULL');
    expect(() => compileFullMatrix('\\if unknown')).toThrow();
    expect(() => compileFullMatrix('\\endif')).toThrow();
    expect(() => compileFullMatrix('\\if :{?grade_tenant_focal}')).toThrow();
  });
  it('preserves critical assertions and rollback, without schema/grants/Storage changes', () => {
    const source = readFileSync('supabase/baseline/local_ab_rls_rpc_validation.sql', 'utf8');
    const auth = readFileSync('supabase/baseline/staging_security_1_auth_negative.sql.inc', 'utf8');
    const sql = buildStagingSecurityQuery(source, auth);
    expect(sql).not.toMatch(/^\s*(alter|create|drop|grant|revoke|truncate|commit)\b/im);
    expect(sql).not.toMatch(/^\\/m);
    expect(sql).not.toMatch(/storage\./i);
    expect(sql).toMatch(/rollback;\s*$/);
    expect(sql).toContain('HARNESS_TARGET_NOT_EMPTY');
    expect(sql).not.toMatch(/do \$ begin/);
    expect(sql).toContain('do $$ begin');
    for (const name of ['P1_HANDLE_NEW_USER_METADATA_PRIVILEGE_ESCALATION', 'P1_RPC_IDENTITY_BYPASS', 'P1_GRADE_FOREIGN_ENROLLMENT_ACCEPTED', 'P1_ATTENDANCE_FOREIGN_ENROLLMENT_ACCEPTED', 'P1_BLOCKED_STUDENT_GRADES_RPC_READ', 'P1_ASSIGNMENT_CROSS_TENANT_INSERT']) {
      expect(sql).toContain(name);
    }
    expect(sql).not.toContain("jsonb_build_array('notices_historical_foreign_records_fail_closed')");
  });
  it('rejects unsafe checkpoint identifiers', () => {
    expect(() => checkpoint("name');commit;--")).toThrow();
  });
});
