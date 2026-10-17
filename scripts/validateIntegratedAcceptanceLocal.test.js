import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAllowedBrowserRequest, separateFixtureAuth } from './validateIntegratedAcceptanceLocal.mjs';
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
});
