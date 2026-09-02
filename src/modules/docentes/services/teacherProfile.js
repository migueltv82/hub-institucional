import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'

function clean(value) {
  return String(value ?? '').trim()
}

export function normalizeTeacherProfile(profile = {}) {
  return {
    email: clean(profile.email).toLowerCase(),
    telefono: clean(profile.telefono),
  }
}

export function validateTeacherProfile(profile = {}) {
  const normalized = normalizeTeacherProfile(profile)

  if (!/^\S+@\S+\.\S+$/.test(normalized.email)) {
    throw new Error('Ingresa un email valido.')
  }

  if (normalized.telefono.length > 40) {
    throw new Error('El telefono no puede superar los 40 caracteres.')
  }

  return normalized
}

export async function updateTeacherProfile({ institutionId, profile, useRemote, workspaceKey = 'main' }) {
  const normalized = validateTeacherProfile(profile)

  if (!institutionId) throw new Error('No hay una institucion activa para guardar el perfil.')
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    return { source: 'local', data: normalized }
  }

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'teacher_profile_update',
      institution_id: institutionId,
      workspace_key: workspaceKey,
      profile: normalized,
    },
  })

  if (error) {
    let detail = error.message
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json()
        detail = body?.error ?? body?.message ?? detail
      }
    } catch {
      // Supabase JS puede haber consumido el body de error.
    }
    throw new Error(`No se pudo actualizar tu informacion. ${detail}`)
  }

  if (data?.error) throw new Error(data.error)
  return { ...data, source: 'supabase' }
}
