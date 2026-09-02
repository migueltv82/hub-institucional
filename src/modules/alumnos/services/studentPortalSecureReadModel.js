import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'
import { normalizeWorkspaceSnapshot } from '../../../services/workspaceSnapshot.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeRole(value) {
  return clean(value).toLowerCase()
}

function canUseRemoteSecureRead({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

export function isStudentPortalAccount(user) {
  const roles = [
    user?.accountRole,
    user?.role,
  ].map(normalizeRole)

  return Boolean(user?.isStudent || roles.some((role) => ['alumno', 'student'].includes(role)))
}

export async function fetchStudentPortalSecureWorkspaceSnapshot({
  institutionId,
  workspaceKey = 'main',
  useRemote,
}) {
  if (!canUseRemoteSecureRead({ institutionId, useRemote })) {
    return null
  }

  const { data, error } = await supabase.rpc('get_student_portal_workspace_snapshot', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
  })

  if (error) {
    throw new Error(
      `No se pudo cargar el portal alumno con lectura segura. Ejecuta supabase/setup_multi_tenant/04_student_portal_secure_read.sql y vuelve a intentar. Detalle: ${error.message}`,
    )
  }

  const row = Array.isArray(data) ? data[0] : data

  return {
    snapshot: normalizeWorkspaceSnapshot(row?.payload),
    updatedAt: row?.updated_at ?? null,
    source: 'supabase-secure-student-portal',
  }
}
