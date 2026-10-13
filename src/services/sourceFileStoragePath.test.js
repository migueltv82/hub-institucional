import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SOURCE_FILES_BUCKET,
  assertSourceFileStoragePath,
  buildSourceFileStoragePath,
  sourceFileStoragePrefix,
} from './sourceFileStoragePath.js'

const context = {
  institutionId: 'a1200000-0000-4000-8000-000000000001',
  userId: 'a2200000-0000-4000-8000-000000000001',
  workspaceKey: 'main', datasetKey: 'horarios',
}
const objectId = 'a3200000-0000-4000-8000-000000000001'
const legitimate = `${sourceFileStoragePrefix(context)}${objectId}`
const attacks = ['../', 'a/../', '..%2F', '%2e%2e', '%2E%2E', '%2e%2E%2f', '..%2f', '..\\', 'a\\..\\', '%5c', '%5C', '%252e%252e', '.', '..', '', 'a//b', '%', '%00', '\uff0e\uff0e', 'a/./b', 'main\n', 'main ']

describe('canonical source file keys', () => {
  it('builds a unique key from the exact tenant/user/resource prefix', () => {
    const key = buildSourceFileStoragePath(context)
    expect(key.startsWith(sourceFileStoragePrefix(context))).toBe(true)
    expect(key).not.toBe(buildSourceFileStoragePath(context))
    expect(assertSourceFileStoragePath({ ...context, storagePath: key, storageBucket: SOURCE_FILES_BUCKET })).toBe(key)
  })

  it.each(attacks)('rejects relative or encoded segment %j in every caller-controlled ID', (attack) => {
    for (const field of ['institutionId', 'userId', 'workspaceKey', 'datasetKey']) {
      expect(() => buildSourceFileStoragePath({ ...context, [field]: attack })).toThrow('no autorizada')
    }
    expect(() => assertSourceFileStoragePath({ ...context, storageBucket: SOURCE_FILES_BUCKET, storagePath: sourceFileStoragePrefix(context) + attack })).toThrow('no autorizada')
  })

  it('rejects foreign tenant, user, workspace, resource and bucket without prefix collisions', () => {
    for (const overrides of [
      { institutionId: 'b1200000-0000-4000-8000-000000000001' },
      { userId: 'b2200000-0000-4000-8000-000000000001' },
      { workspaceKey: 'main-other' }, { datasetKey: 'horarios-other' },
      { storageBucket: 'another-bucket' },
    ]) {
      expect(() => assertSourceFileStoragePath({ ...context, storageBucket: SOURCE_FILES_BUCKET, storagePath: legitimate, ...overrides })).toThrow('no autorizada')
    }
  })

  it('rejects a trailing newline after an otherwise valid object UUID', () => {
    expect(() => assertSourceFileStoragePath({
      ...context, storageBucket: SOURCE_FILES_BUCKET, storagePath: legitimate + '\n',
    })).toThrow('no autorizada')
  })

  it('the SQL destination grammar rejects the original exploit and encoded/relative names', () => {
    const sql = readFileSync(resolve('supabase/security/storage_source_files_canonical_paths.sql'), 'utf8')
    const patterns = [...sql.matchAll(/name ~ '([^']+)'/g)].map((match) => new RegExp(match[1]))
    expect(patterns).toHaveLength(2)
    for (const pattern of patterns) {
      expect(pattern.test(legitimate)).toBe(true)
      expect(pattern.test(`${context.institutionId}/traversal.csv`)).toBe(false)
      expect(pattern.test(`${context.institutionId}/security2/../traversal.csv`)).toBe(false)
      for (const attack of attacks) expect(pattern.test(sourceFileStoragePrefix(context) + attack)).toBe(false)
    }
    expect(sql).toContain('as restrictive for all to authenticated')
    expect(sql.match(/split_part\(name, '\/', 2\) = \(select auth.uid\(\)\)::text/g)).toHaveLength(2)
  })
})
