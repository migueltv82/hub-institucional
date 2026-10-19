import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

// I2d: las cuentas creadas con el DNI como contrasena llevan app_metadata.must_change_password. La marca
// solo la limpia la Edge admin-users (accion complete_initial_password_change), que verifica la contrasena
// actual y cambia contrasena y marca juntas.

export const MUST_CHANGE_PASSWORD_FLAG = 'must_change_password'

export function requiresInitialPasswordChange(authUser) {
  return authUser?.app_metadata?.[MUST_CHANGE_PASSWORD_FLAG] === true
}

export function validateInitialPasswordChange({ currentPassword = '', newPassword = '', confirmPassword = '' } = {}) {
  if (!currentPassword) return 'Ingresa tu contrasena actual (tu DNI).'
  if (newPassword.length < 8) return 'La nueva contrasena debe tener al menos 8 caracteres.'
  if (newPassword === currentPassword) return 'La nueva contrasena debe ser distinta de la actual.'
  if (newPassword !== confirmPassword) return 'La confirmacion no coincide con la nueva contrasena.'
  return ''
}

async function edgeErrorDetail(error) {
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const body = await error.context.json()
      return body?.error ?? body?.message ?? error.message
    }
  } catch {
    // Supabase JS puede haber consumido el body de error.
  }
  return error?.message ?? ''
}

export async function completeInitialPasswordChange({ currentPassword, newPassword, confirmPassword }) {
  const invalid = validateInitialPasswordChange({ currentPassword, newPassword, confirmPassword })
  if (invalid) throw new Error(invalid)
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado en este entorno.')

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'complete_initial_password_change', current_password: currentPassword, new_password: newPassword },
  })
  if (error) throw new Error(await edgeErrorDetail(error) || 'No se pudo cambiar la contrasena.')
  if (data?.error) throw new Error(data.error)

  // Auth revoca la sesion abierta con el DNI al cambiar la contrasena: se vuelve a entrar con la nueva, y el
  // token nuevo ya trae la marca limpia (onAuthStateChange actualiza la sesion y la app se habilita).
  const { data: sessionData } = await supabase.auth.getSession()
  const email = sessionData?.session?.user?.email
  const { error: signInError } = email
    ? await supabase.auth.signInWithPassword({ email, password: newPassword })
    : { error: new Error('sin email') }
  if (signInError) {
    await supabase.auth.signOut().catch(() => {})
    throw new Error('La contrasena se cambio. Volve a iniciar sesion con la nueva.')
  }
  return { success: true }
}
