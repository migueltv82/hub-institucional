import { describe, expect, it, vi } from 'vitest'
import { signInToInstitution } from './auth.js'

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}))

describe('auth service', () => {
  it('falla de forma controlada cuando Supabase no esta configurado', async () => {
    await expect(signInToInstitution({
      email: 'admin@institucion.edu',
      password: 'password-segura',
      institutionId: 'institution-1',
    })).rejects.toThrow('Supabase no esta configurado')
  })
})
