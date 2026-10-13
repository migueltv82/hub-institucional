import { describe, expect, it } from 'vitest'
import {
  getPublicRuntimeEnvironmentIssues,
  validatePublicRuntimeEnvironment,
} from './envGuards.js'

function makeJwt(payload) {
  const base64Url = (value) => Buffer
    .from(JSON.stringify(value))
    .toString('base64url')

  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url(payload)}.firma_de_prueba`
}

describe('envGuards', () => {
  it('acepta una configuracion publica segura', () => {
    expect(getPublicRuntimeEnvironmentIssues({
      PROD: true,
      VITE_DISABLE_AUTH: 'false',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
    })).toEqual([])
  })

  it('rechaza auth desactivada en produccion', () => {
    expect(() => validatePublicRuntimeEnvironment({
      PROD: true,
      VITE_DISABLE_AUTH: 'true',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
    })).toThrow('VITE_DISABLE_AUTH=true')
  })

  it('rechaza service_role expuesta con prefijo VITE', () => {
    expect(() => validatePublicRuntimeEnvironment({
      PROD: true,
      VITE_DISABLE_AUTH: 'false',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
      VITE_SERVICE_ROLE_KEY: 'secret',
    })).toThrow('Variables privadas expuestas')
  })

  it.each([
    'VITE_SERVICE_ROLE',
    'VITE_SERVICE_ROLE_TOKEN',
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
    'VITE_ADMIN_SERVICE_ROLE_KEY',
    'VITE_SUPABASE_SERVICE_ROLE_BACKUP',
  ])('rechaza la variable privada %s sin revelar su valor', (key) => {
    const issues = getPublicRuntimeEnvironmentIssues({
      PROD: true,
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
      [key]: 'valor-privado-de-prueba',
    })
    expect(issues.join(' ')).toContain(key)
    expect(issues.join(' ')).not.toContain('valor-privado-de-prueba')
    expect(() => validatePublicRuntimeEnvironment({
      PROD: true,
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
      [key]: 'valor-privado-de-prueba',
    })).toThrow()
  })

  it('permite demo solo fuera de produccion y rechaza secretos tambien en desarrollo', () => {
    expect(getPublicRuntimeEnvironmentIssues({ PROD: false, VITE_DISABLE_AUTH: 'true' })).toEqual([])
    expect(() => validatePublicRuntimeEnvironment({ PROD: false, VITE_SERVICE_ROLE_KEY: 'secret' })).toThrow()
  })

  it('no considera expuesta una variable privada vacia', () => {
    expect(getPublicRuntimeEnvironmentIssues({
      PROD: true,
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
      VITE_SERVICE_ROLE_KEY: '',
    })).toEqual([])
  })

  it('rechaza produccion sin URL Supabase publica', () => {
    expect(() => validatePublicRuntimeEnvironment({
      PROD: true,
      VITE_DISABLE_AUTH: 'false',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
    })).toThrow('Falta VITE_SUPABASE_URL')
  })

  it('rechaza produccion sin publishable key frontend', () => {
    expect(() => validatePublicRuntimeEnvironment({
      PROD: true,
      VITE_DISABLE_AUTH: 'false',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    })).toThrow('Falta VITE_SUPABASE_PUBLISHABLE_KEY')
  })

  it('rechaza URL Supabase incompatible con produccion', () => {
    expect(() => validatePublicRuntimeEnvironment({
      PROD: true,
      VITE_DISABLE_AUTH: 'false',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
    })).toThrow('VITE_SUPABASE_URL debe ser una URL HTTPS de Supabase')
  })

  it('rechaza valores publicos que parecen service_role aunque el nombre parezca seguro', () => {
    const serviceRoleJwt = makeJwt({ role: 'service_role' })

    const issues = getPublicRuntimeEnvironmentIssues({
      PROD: true,
      VITE_DISABLE_AUTH: 'false',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: serviceRoleJwt,
    })

    expect(issues.join(' ')).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(issues.join(' ')).toContain('service_role')
    expect(issues.join(' ')).not.toContain(serviceRoleJwt)

    let error
    try {
      validatePublicRuntimeEnvironment({
        PROD: true,
        VITE_DISABLE_AUTH: 'false',
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: serviceRoleJwt,
      })
    } catch (caughtError) {
      error = caughtError
    }

    expect(error.message).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(error.message).not.toContain(serviceRoleJwt)
  })

  it('rechaza sb_secret en variables VITE sin revelar el valor', () => {
    const secretValue = ['sb', 'secret', 'valor_privado_de_prueba'].join('_')
    const issues = getPublicRuntimeEnvironmentIssues({
      PROD: true,
      VITE_DISABLE_AUTH: 'false',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
      VITE_INTERNAL_CONFIG: secretValue,
    })

    expect(issues.join(' ')).toContain('VITE_INTERNAL_CONFIG')
    expect(issues.join(' ')).not.toContain(secretValue)
  })

  it('mantiene compatibilidad local con URL local y fallback anon fuera de produccion', () => {
    expect(getPublicRuntimeEnvironmentIssues({
      PROD: false,
      DEV: true,
      VITE_DISABLE_AUTH: 'true',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'anon-local',
    })).toEqual([])
  })
})
