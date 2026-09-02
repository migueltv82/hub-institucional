import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

async function fetchOwnProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, account_role, is_blocked')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function signInToInstitution({
  email,
  password,
  institutionId,
}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase no esta configurado. Activa las variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para usar acceso institucional.')
  }

  const cleanEmail = email.trim().toLowerCase()

  if (!institutionId) {
    throw new Error('Selecciona una institucion.')
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  })

  if (authError) throw authError

  try {
    const profile = await fetchOwnProfile(authData.user.id)

    if (profile?.is_blocked) {
      throw new Error('Tu usuario esta bloqueado. Contacta al administrador del sistema.')
    }

    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role, institutions(id, name, slug, status)')
      .eq('institution_id', institutionId)
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (membershipError) throw membershipError

    const institution = membership?.institutions
    if (!institution) {
      throw new Error('No tienes permisos para acceder a la institucion seleccionada.')
    }

    if (institution.status !== 'active') {
      throw new Error('La institucion seleccionada esta suspendida.')
    }

    return {
      user: authData.user,
      institution: {
        id: institution.id,
        name: institution.name,
        slug: institution.slug,
        status: institution.status,
      },
      role: membership.role,
      accountRole: profile?.account_role ?? membership?.role ?? null,
    }
  } catch (error) {
    await supabase.auth.signOut()
    throw error
  }
}

export async function signOutInstitutionSession() {
  if (!isSupabaseConfigured || !supabase) return

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
