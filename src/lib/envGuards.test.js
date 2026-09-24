import { describe, expect, it } from 'vitest'
import {
  getPublicRuntimeEnvironmentIssues,
  validatePublicRuntimeEnvironment,
} from './envGuards.js'

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
    })).toThrow('VITE_DISABLE_AUTH=true')
  })

  it('rechaza service_role expuesta con prefijo VITE', () => {
    expect(() => validatePublicRuntimeEnvironment({
      PROD: true,
      VITE_DISABLE_AUTH: 'false',
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
    const issues = getPublicRuntimeEnvironmentIssues({ PROD: true, [key]: 'valor-privado-de-prueba' })
    expect(issues.join(' ')).toContain(key)
    expect(issues.join(' ')).not.toContain('valor-privado-de-prueba')
    expect(() => validatePublicRuntimeEnvironment({ PROD: true, [key]: 'valor-privado-de-prueba' })).toThrow()
  })

  it('permite demo solo fuera de produccion y rechaza secretos tambien en desarrollo', () => {
    expect(getPublicRuntimeEnvironmentIssues({ PROD: false, VITE_DISABLE_AUTH: 'true' })).toEqual([])
    expect(() => validatePublicRuntimeEnvironment({ PROD: false, VITE_SERVICE_ROLE_KEY: 'secret' })).toThrow()
  })

  it('no considera expuesta una variable privada vacia', () => {
    expect(getPublicRuntimeEnvironmentIssues({ PROD: true, VITE_SERVICE_ROLE_KEY: '' })).toEqual([])
  })
})
