import { describe, it, expect } from 'vitest';
import { authPassword, authUri, normalizeAcl } from './validateGoTrueLocalHarness.mjs';

describe('local GoTrue harness boundaries', () => {
  it('reads the CLI psql variable without executing the shell definition', () => {
    const config = '\\set pgpass `echo "$PGPASSWORD"`\nALTER USER supabase_auth_admin WITH PASSWORD :\'pgpass\';';
    expect(authPassword(config, { POSTGRES_PASSWORD: 'synthetic-local-only' })).toBe('synthetic-local-only');
    expect(() => authPassword(config)).toThrow();
  });
  it('supports a SQL escaped literal', () => {
    expect(authPassword("ALTER USER supabase_auth_admin WITH PASSWORD 'synthetic''value';")).toBe("synthetic'value");
  });
  it('rejects ambiguous and executable credential definitions', () => {
    const assignment = "ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';";
    expect(() => authPassword('\\set pgpass `echo "$(malicious)"`\n' + assignment)).toThrow();
    expect(() => authPassword('\\set pgpass `cat secret`\n' + assignment)).toThrow();
    expect(() => authPassword("ALTER USER supabase_auth_admin WITH PASSWORD 'a';\nALTER USER supabase_auth_admin WITH PASSWORD 'b';")).toThrow();
  });
  it('allows only the local source and generated disposable database', () => {
    const db = 'gotrue_harness_0123456789abcdef';
    expect(authUri('synthetic:@/value', 'supabase_db_codex-baseline-local-7725bdda', db)).toContain('supabase_auth_admin:synthetic%3A%40%2Fvalue@');
    expect(() => authUri('synthetic', 'remote.example', db)).toThrow();
    expect(() => authUri('synthetic', 'supabase_db_codex-baseline-local-7725bdda', 'postgres')).toThrow();
    expect(() => authUri('synthetic', 'supabase_db_codex-baseline-local-7725bdda', db + ';drop database postgres')).toThrow();
  });
  it('ignores grant ordering but detects widened rights and owner changes', () => {
    const a = JSON.stringify({ owner: 'supabase_auth_admin', acl: '{postgres=r/admin,admin=ar/admin}' });
    const reordered = JSON.stringify({ owner: 'supabase_auth_admin', acl: '{admin=ar/admin,postgres=r/admin}' });
    expect(normalizeAcl(a)).toBe(normalizeAcl(reordered));
    expect(normalizeAcl(a)).not.toBe(normalizeAcl(reordered.replace('postgres=r/', 'postgres=ar/')));
    expect(normalizeAcl(a)).not.toBe(normalizeAcl(reordered.replace('supabase_auth_admin', 'postgres')));
  });
});
