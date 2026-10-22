import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalStack, STACK_SOURCE } from './localSupabaseStack.mjs';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';

// KIT.1: compara el snapshot read-only de un ambiente remoto (supabase/security/remote_drift_snapshot.sql, pegado por
// Miguel) contra el mismo snapshot tomado de una base descartable con el baseline de release/v1.
// Uso: node scripts/compareDriftSnapshot.mjs --remote <snapshot.json> --label staging|production

const SNAPSHOT_SQL = 'supabase/security/remote_drift_snapshot.sql';

// Acepta el JSON tal cual sale del SQL Editor: objeto suelto, {snapshot: …}, o una fila/array con la columna `snapshot`.
export function parseRemoteSnapshot(text) {
  let value = JSON.parse(text.trim());
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value.snapshot === 'string') value = JSON.parse(value.snapshot);
  else if (value && value.snapshot) value = value.snapshot;
  assert.equal(value?.kind, 'hub_drift_snapshot_v1', 'No es un snapshot hub_drift_snapshot_v1');
  return value;
}

const byKey = (items, key) => new Map(items.map(item => [key(item), item]));
const funcName = sig => sig.replace(/^public\./, '').replace(/\(.*$/, '');

// Diferencias objeto por objeto. `expected` es release/v1; `actual` es el ambiente remoto.
export function diffSnapshots(expected, actual) {
  const diffs = [];
  const compare = (kind, keyFn, fields, expectedItems, actualItems) => {
    const want = byKey(expectedItems, keyFn), have = byKey(actualItems, keyFn);
    for (const [key, item] of want) {
      const remote = have.get(key);
      if (!remote) { diffs.push({ kind, key, change: 'missing' }); continue; }
      const changed = fields.filter(field => JSON.stringify(item[field]) !== JSON.stringify(remote[field]));
      if (changed.length) diffs.push({ kind, key, change: 'different', fields: changed });
    }
    for (const key of have.keys()) if (!want.has(key)) diffs.push({ kind, key, change: 'extra' });
  };
  compare('function', item => item.sig, ['body_md5', 'secdef', 'config', 'anon_exec', 'auth_exec'], expected.functions, actual.functions);
  compare('policy', item => `${item.table}.${item.name}`, ['cmd', 'roles', 'expr_md5'], expected.policies, actual.policies);
  compare('table', item => item.table, ['rls', 'columns_md5', 'constraints_md5', 'anon_select', 'auth_select'], expected.tables, actual.tables);
  compare('trigger', item => `${item.table}.${item.name}`, ['def_md5'], expected.triggers, actual.triggers);
  compare('bucket', item => item.id, ['public'], expected.storage_buckets, actual.storage_buckets);
  return diffs;
}

// Para cada diferencia "missing"/"different", el archivo canonico que la define. Las "extra" no se resuelven aplicando SQL.
export function filesToApply(diffs, schemaFiles) {
  const locate = diff => {
    const name = diff.kind === 'function' ? funcName(diff.key)
      : diff.kind === 'table' ? diff.key.replace(/^public\./, '')
      : diff.kind === 'policy' ? diff.key.split('.').slice(2).join('.')
      : diff.kind === 'trigger' ? diff.key.split('.').pop()
      : diff.key;
    const patterns = {
      function: new RegExp(`function\\s+public\\.${name}\\s*\\(`, 'i'),
      table: new RegExp(`table\\s+(if\\s+not\\s+exists\\s+)?public\\.${name}\\b`, 'i'),
      policy: new RegExp(`create\\s+policy\\s+"?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?`, 'i'),
      trigger: new RegExp(`create\\s+trigger\\s+${name}\\b`, 'i'),
      bucket: new RegExp(`'${name}'`),
    }[diff.kind];
    const found = Object.entries(schemaFiles).filter(([, sql]) => patterns.test(sql)).map(([file]) => file);
    // Policies creadas con format() en un loop: el nombre no aparece literal; se aplica el archivo que define la tabla.
    if (!found.length && diff.kind === 'policy') return locate({ kind: 'table', key: diff.key.split('.').slice(0, 2).join('.') });
    return found;
  };
  const files = new Map();
  const unresolved = [];
  for (const diff of diffs.filter(item => item.change !== 'extra')) {
    const found = locate(diff);
    if (!found.length) unresolved.push(diff);
    for (const file of found) files.set(file, [...(files.get(file) ?? []), `${diff.kind} ${diff.key} (${diff.change})`]);
  }
  const ordered = BASELINE.filter(file => files.has(file)).map(file => ({ file, reasons: files.get(file) }));
  return { ordered, unresolved };
}

export async function localSnapshot() {
  const report = {};
  const stack = await createLocalStack({ label: 'hub.drift-compare', report });
  try {
    return JSON.parse(execFileSync('docker', ['exec', '-i', STACK_SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', stack.database, '-At'], { input: readFileSync(resolve(SNAPSHOT_SQL), 'utf8'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim());
  } finally {
    const cleanup = await stack.teardown();
    assert.deepEqual(cleanup.errors, [], 'Cleanup local fallido');
  }
}

export async function main(argv = process.argv.slice(2)) {
  const arg = flag => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
  const remotePath = arg('--remote'), label = arg('--label') ?? 'remote';
  assert.ok(remotePath, 'Falta --remote <snapshot.json>');
  const remote = parseRemoteSnapshot(readFileSync(remotePath, 'utf8'));
  const expected = await localSnapshot();
  const diffs = diffSnapshots(expected, remote);
  const schemaFiles = Object.fromEntries(readdirSync('supabase/schema').filter(file => BASELINE.includes(file)).map(file => [file, readFileSync(resolve('supabase/schema', file), 'utf8')]));
  const plan = filesToApply(diffs, schemaFiles);
  const report = {
    label, staging: label === 'staging' ? 'READ-ONLY SNAPSHOT' : 'NONE', production: label === 'production' ? 'READ-ONLY SNAPSHOT' : 'NONE',
    remoteCapturedAt: remote.captured_at, remoteServerVersion: remote.server_version,
    transition: remote.transition, counts: remote.counts, profilesByRole: remote.profiles_by_role,
    totals: { functions: [expected.functions.length, remote.functions.length], policies: [expected.policies.length, remote.policies.length], tables: [expected.tables.length, remote.tables.length] },
    driftCount: diffs.length,
    summary: diffs.reduce((acc, diff) => ({ ...acc, [`${diff.kind}:${diff.change}`]: (acc[`${diff.kind}:${diff.change}`] ?? 0) + 1 }), {}),
    filesToApply: plan.ordered, unresolved: plan.unresolved, extras: diffs.filter(diff => diff.change === 'extra'), diffs,
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
