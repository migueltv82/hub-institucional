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
})
