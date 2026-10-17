import { describe, expect, it } from 'vitest';
import { parseTarget, TARGET, verifyOutput } from './validateAcademicStatusDiagnostic.mjs';

const output = () => ['READ_ONLY=on', ...[
  ['a', 'Regular', 7, 3, 2], ['a', 'regular ', 8, 2, 1], ['a', 'Pendiente', 9, 1, 1], ['a', 'cursando', 8, 2, 1],
  ['b', 'Regular', 7, 1, 1], ['b', 'regular ', 8, 3, 2], ['b', 'Pendiente', 9, 2, 2], ['b', 'cursando', 8, 1, 1],
].map(([tenant, ...values]) => [`${tenant}1000000-0000-4000-8000-000000000001`, `Diagnostic ${tenant}`, ...values, '2026-10-16 12:00:00+00'].join('\t'))].join('\n');

describe('academic status diagnostic safety and exact assertions', () => {
  it('requires the single explicit approved local target', () => {
    expect(parseTarget(['--target', TARGET])).toBe(TARGET);
    for (const args of [[], ['--target', 'remote'], ['--target', TARGET, '--extra'], ['--target', 'postgresql://localhost/db']]) expect(() => parseTarget(args)).toThrow();
  });
  it('accepts all eight exact groups while preserving trailing spaces', () => {
    expect(verifyOutput(output()).filter(row => row[2] === 'regular ')).toHaveLength(2);
  });
  it('rejects normalized values, wrong counts, tenant leakage and missing groups', () => {
    for (const bad of [output().replaceAll('regular \t', 'regular\t'), output().replace('\t3\t2\t', '\t4\t2\t'), output().replaceAll('b1000000', 'a1000000'), output().split('\n').slice(0, -1).join('\n')]) expect(() => verifyOutput(bad)).toThrow();
  });
  it('rejects canonical leakage, duplicates and a writable transaction', () => {
    const row = output().split('\n')[1];
    for (const bad of [output() + '\n' + row, output() + '\n' + row.replace('Regular', 'pending'), output().replace('READ_ONLY=on', 'READ_ONLY=off')]) expect(() => verifyOutput(bad)).toThrow();
  });
});
