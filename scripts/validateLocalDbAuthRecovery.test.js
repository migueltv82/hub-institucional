import { describe, it, expect } from 'vitest';
import { disposableDatabase, localEndpoint } from './validateLocalDbAuthRecovery.mjs';
describe('recovery isolation boundaries', () => {
  it('rejects shared databases and SQL injection before resource operations', () => {
    expect(disposableDatabase('gotrue_harness_0123456789abcdef')).toBe('gotrue_harness_0123456789abcdef');
    for (const value of ['postgres', 'auth', 'gotrue_harness_0123456789abcdef;drop database postgres']) expect(() => disposableDatabase(value)).toThrow();
  });
  it('keeps Auth requests on loopback and rejects malformed ports and paths', () => {
    expect(localEndpoint(1234, '/token?grant_type=password')).toBe('http://127.0.0.1:1234/token?grant_type=password');
    for (const port of ['remote:80',0,65536]) expect(() => localEndpoint(port,'/health')).toThrow();
    for (const path of ['//remote/health','https://remote','/\\remote']) expect(() => localEndpoint(1234,path)).toThrow();
  });
});
