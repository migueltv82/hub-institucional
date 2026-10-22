import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

function fakeSupabase({ invoke = { data: { success: true }, error: null }, signIn = { error: null } } = {}) {
  return {
    functions: { invoke: vi.fn().mockResolvedValue(invoke) },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: 'docente@x.local' } } } }),
      signInWithPassword: vi.fn().mockResolvedValue(signIn),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }
}

async function loadService(supabase = fakeSupabase()) {
  vi.resetModules()
  vi.doMock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase }))
  return { service: await import('./initialPasswordChange.js'), supabase }
}

const form = { currentPassword: '30111222', newPassword: 'NuevaClave2026', confirmPassword: 'NuevaClave2026' }

describe('initialPasswordChange (I2d)', () => {
  it('lee la marca solo de app_metadata y solo si es true', async () => {
    const { service } = await loadService()
    expect(service.requiresInitialPasswordChange({ app_metadata: { must_change_password: true } })).toBe(true)
    expect(service.requiresInitialPasswordChange({ app_metadata: { must_change_password: false } })).toBe(false)
    expect(service.requiresInitialPasswordChange({ user_metadata: { must_change_password: true } })).toBe(false)
    expect(service.requiresInitialPasswordChange(null)).toBe(false)
  })

  it('valida antes de llamar a la Edge', async () => {
    const { service, supabase } = await loadService()
    expect(service.validateInitialPasswordChange({ ...form, currentPassword: '' })).toMatch(/contrasena actual/)
    expect(service.validateInitialPasswordChange({ ...form, newPassword: 'corta', confirmPassword: 'corta' })).toMatch(/8 caracteres/)
    expect(service.validateInitialPasswordChange({ ...form, newPassword: form.currentPassword, confirmPassword: form.currentPassword })).toMatch(/distinta/)
    expect(service.validateInitialPasswordChange({ ...form, confirmPassword: 'otra-cosa-1' })).toMatch(/confirmacion/)
    expect(service.validateInitialPasswordChange(form)).toBe('')
    await expect(service.completeInitialPasswordChange({ ...form, confirmPassword: 'x' })).rejects.toThrow('confirmacion')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('cambia por la Edge y vuelve a entrar con la nueva contrasena', async () => {
    const { service, supabase } = await loadService()
    await expect(service.completeInitialPasswordChange(form)).resolves.toEqual({ success: true })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'complete_initial_password_change', current_password: form.currentPassword, new_password: form.newPassword },
    })
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'docente@x.local', password: form.newPassword })
  })

  it('muestra el error de la Edge y no reintenta el ingreso', async () => {
    const supabase = fakeSupabase({ invoke: { data: null, error: { message: 'Edge error', context: { json: async () => ({ error: 'La contrasena ingresada es incorrecta.' }) } } } })
    const { service } = await loadService(supabase)
    await expect(service.completeInitialPasswordChange(form)).rejects.toThrow('La contrasena ingresada es incorrecta.')
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('si no puede volver a entrar, cierra la sesion vieja y lo explica', async () => {
    const supabase = fakeSupabase({ signIn: { error: { message: 'boom' } } })
    const { service } = await loadService(supabase)
    await expect(service.completeInitialPasswordChange(form)).rejects.toThrow('Volve a iniciar sesion')
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})
