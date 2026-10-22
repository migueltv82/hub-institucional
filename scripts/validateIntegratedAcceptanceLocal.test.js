import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUAL_WRITE_TRANSITION, EXAM_MODES, PB4_FAILURE_TRIGGER_SQL, expectedFailurePhase, isAllowedBrowserRequest, separateFixtureAuth, transitionSql } from './validateIntegratedAcceptanceLocal.mjs';
import { fixtureSql } from './validateExamEligibilityParityLocal.mjs';
import { assertOwnedStackDatabase } from './localSupabaseStack.mjs';

describe('integrated acceptance harness boundaries', () => {
  const origin = 'http://127.0.0.1:4173';
  it('allows only the exact loopback origin, including API and UI assets', () => {
    expect(isAllowedBrowserRequest(`${origin}/rest/v1/institutions`, origin)).toBe(true);
    expect(isAllowedBrowserRequest(`${origin}/src/main.jsx`, origin)).toBe(true);
    for (const url of ['https://example.com', 'http://127.0.0.1:4174/', 'http://localhost:4173/', 'http://127.0.0.1:4173@example.com/', 'file:///etc/passwd', 'not a URL']) expect(isAllowedBrowserRequest(url, origin)).toBe(false);
  });
  it('provisions real Auth identities separately while retaining relational fixture data', () => {
    const source = fixtureSql(readFileSync('supabase/baseline/local_ab_rls_rpc_validation.sql', 'utf8'));
    const fixture = separateFixtureAuth(source);
    expect(fixture.users).toHaveLength(10);
    expect(fixture.users.find(account => account.email === 'admin-a@fixture.invalid').app_metadata.account_role).toBe('admin_instituto');
    expect(fixture.sql).not.toMatch(/insert into auth\.users/);
    expect(fixture.sql).toContain('insert into public.student_grades');
    expect(fixture.sql).toContain('insert into public.exam_table_subjects');
  });
  it('fails closed if the shared Auth fixture changes or cannot be parsed', () => {
    expect(() => separateFixtureAuth('begin; commit;')).toThrow();
    expect(() => separateFixtureAuth("insert into auth.users (id, email, raw_app_meta_data) values ('invalid', 'a', '{}');")).toThrow();
  });
  it('recovers an unmarked partial CREATE only for the exact generated name and standard owner', () => {
    const run = 'abcdef0123456789';
    const owned = { database: `gotrue_harness_${run}`, run, owner: 'supabase_admin', marker: run };
    expect(() => assertOwnedStackDatabase(owned)).not.toThrow();
    expect(() => assertOwnedStackDatabase({ ...owned, marker: null })).not.toThrow();
    for (const change of [{ database: 'postgres' }, { run: 'different' }, { owner: 'postgres' }, { marker: 'another-owner' }, { marker: undefined }]) expect(() => assertOwnedStackDatabase({ ...owned, ...change })).toThrow();
  });
  it('cubre los dos modos de transicion de la mesa y la reinscripcion en dual_write (QA.1 / PB.1)', () => {
    expect(EXAM_MODES).toEqual(['dual_write', 'default', 'dual_write']);
    expect(DUAL_WRITE_TRANSITION).toEqual({ stage: 'dual_write', write_mode: 'dual_write', read_mode: 'snapshot_only', dual_write_enabled: true });
    expect(transitionSql('dual_write')).toContain("'academic_relational_transition'");
    expect(transitionSql('default')).toBe("delete from public.app_settings where key = 'academic_relational_transition';");
    expect(() => transitionSql('relational_primary')).toThrow();
  });
  it('solo tolera errores HTTP en las fases adversariales declaradas', () => {
    expect(expectedFailurePhase('adversarial dual_write: Edge replay')).toBe(true);
    expect(expectedFailurePhase('student exam dual_write: cancel through UI')).toBe(false);
    expect(expectedFailurePhase('admin_instituto/a logout')).toBe(false);
  });

  it('PB.4: induce una falla de la RPC de mesa en dual_write y exige 409 sin drift', () => {
    const harness = readFileSync('scripts/validateIntegratedAcceptanceLocal.mjs', 'utf8');
    expect(PB4_FAILURE_TRIGGER_SQL).toContain('before insert or update on public.exam_enrollments');
    expect(harness).toContain("phase = 'adversarial PB.4: induced exam RPC failure';");
    expect(harness).toContain("assert.deepEqual(report.pb4.afterFailure, { relational: 0, snapshot: 0 }, 'Induced RPC failure left drift');");
    expect(harness).toContain("drop trigger if exists pb4_fail_exam_enrollment on public.exam_enrollments;");
    expect(expectedFailurePhase('adversarial PB.4: induced exam RPC failure')).toBe(true);
  });
});
