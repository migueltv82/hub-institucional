import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  assertNoWriteOperations,
  buildSafePreviewSummary,
  detectServiceRoleKey,
  validateSupabaseReadOnlyEnv,
} from './supabaseAuditSafety.js'

function readSafetySource() {
  return readFileSync(
    join(process.cwd(), 'src/utils/examEngine/supabaseAudit/supabaseAuditSafety.js'),
    'utf8',
  )
}

function makeJwt(payload) {
  const encode = (value) => Buffer
    .from(JSON.stringify(value), 'utf8')
    .toString('base64url')

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('supabaseAuditSafety', () => {
  it('valida env con publishable key', () => {
    const result = validateSupabaseReadOnlyEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    })

    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: [],
      config: {
        url: 'https://example.supabase.co',
        keyType: 'publishable',
        hasKey: true,
      },
    })
  })

  it('valida env con anon key', () => {
    const result = validateSupabaseReadOnlyEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-test',
    })

    expect(result.valid).toBe(true)
    expect(result.config).toMatchObject({
      keyType: 'anon',
      hasKey: true,
    })
  })

  it('invalida env sin URL', () => {
    const result = validateSupabaseReadOnlyEnv({
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Falta VITE_SUPABASE_URL.')
  })

  it('invalida env sin key', () => {
    const result = validateSupabaseReadOnlyEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    })

    expect(result.valid).toBe(false)
    expect(result.config).toMatchObject({
      keyType: 'unknown',
      hasKey: false,
    })
    expect(result.errors).toContain('Falta VITE_SUPABASE_PUBLISHABLE_KEY o VITE_SUPABASE_ANON_KEY.')
  })

  it('detecta service_role textual', () => {
    expect(detectServiceRoleKey('service_role')).toBe(true)
    expect(detectServiceRoleKey('prefix service_role suffix')).toBe(true)
  })

  it('detecta service-role textual', () => {
    expect(detectServiceRoleKey('service-role')).toBe(true)
    expect(detectServiceRoleKey('service role')).toBe(true)
  })

  it('detecta JWT con role service_role', () => {
    expect(detectServiceRoleKey(makeJwt({ role: 'service_role' }))).toBe(true)
  })

  it('no rompe con JWT invalido', () => {
    expect(detectServiceRoleKey('header.invalid-payload.signature')).toBe(false)
  })

  it('invalida env si detecta service_role', () => {
    const result = validateSupabaseReadOnlyEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: makeJwt({ role: 'service_role' }),
    })

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('service_role')
  })

  it('buildSafePreviewSummary no incluye payload ni raw', () => {
    const summary = buildSafePreviewSummary({
      phase: 'warning',
      status: 'WARNING',
      uiDto: {
        uiSummary: {
          totalPlanned: 2,
          totalUnassigned: 1,
          totalWarnings: 3,
          totalCriticalErrors: 1,
          exportValid: true,
        },
        payload: { secret: true },
        raw: { hidden: true },
      },
      preview: {
        docentes: [{ nombre: 'Docente Real' }],
        alumnos: [{ email: 'alumno@example.com' }],
      },
    }, {
      snapshotId: 'snapshot-1',
      createdAt: '2026-06-05T12:00:00.000Z',
      institutionId: 'institution-1',
      readOnly: true,
      raw: { hidden: true },
    })

    expect(summary).not.toHaveProperty('payload')
    expect(summary).not.toHaveProperty('raw')
    expect(summary).not.toHaveProperty('docentes')
    expect(summary).not.toHaveProperty('alumnos')
    expect(JSON.stringify(summary)).not.toContain('Docente Real')
    expect(JSON.stringify(summary)).not.toContain('alumno@example.com')
  })

  it('buildSafePreviewSummary devuelve metricas esperadas', () => {
    const summary = buildSafePreviewSummary({
      phase: 'critical',
      status: 'CRITICAL',
      canExportJson: false,
      uiDto: {
        uiSummary: {
          totalPlanned: 4,
          totalUnassigned: 2,
          totalWarnings: 5,
          totalCriticalErrors: 3,
        },
      },
    }, {
      snapshotId: 'snapshot-2',
      createdAt: '2026-06-05T12:00:00.000Z',
      institutionId: 'institution-2',
      readOnly: true,
    })

    expect(summary).toEqual({
      snapshotId: 'snapshot-2',
      createdAt: '2026-06-05T12:00:00.000Z',
      institutionId: 'institution-2',
      phase: 'critical',
      status: 'CRITICAL',
      totalPlanned: 4,
      totalUnassigned: 2,
      totalWarnings: 5,
      totalCriticalErrors: 3,
      exportValid: false,
      readOnly: true,
    })
  })

  it('assertNoWriteOperations pasa si no hubo escrituras', () => {
    const fakeSupabase = {
      builder: {
        insert: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        rpc: vi.fn(),
      },
    }

    expect(assertNoWriteOperations(fakeSupabase)).toEqual({
      valid: true,
      errors: [],
    })
  })

  it('assertNoWriteOperations falla si insert/upsert/update/delete/rpc fueron llamados', () => {
    const fakeSupabase = {
      builder: {
        insert: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        rpc: vi.fn(),
      },
    }

    fakeSupabase.builder.insert()
    fakeSupabase.builder.upsert()
    fakeSupabase.builder.update()
    fakeSupabase.builder.delete()
    fakeSupabase.builder.rpc()

    const result = assertNoWriteOperations(fakeSupabase)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(5)
    expect(result.errors.join(' ')).toContain('insert')
    expect(result.errors.join(' ')).toContain('upsert')
    expect(result.errors.join(' ')).toContain('update')
    expect(result.errors.join(' ')).toContain('delete')
    expect(result.errors.join(' ')).toContain('rpc')
  })

  it('no importa supabaseClient real', () => {
    const source = readSafetySource()
    const realClient = ['supabase', 'Client'].join('')

    expect(source).not.toContain(realClient)
    expect(source).not.toContain('../lib/supabase')
    expect(source).not.toContain('../../../lib/supabase')
  })

  it('no toca motor viejo ni UI ni legacyAdapter', () => {
    const source = readSafetySource()
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')
    const routerPackage = ['react', '-router-dom'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(adapter)
    expect(source).not.toContain(routerPackage)
    expect(source).not.toContain('components/')
  })
})
