import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'

const subjectEnrollmentMutations = new Set(['enroll_subject', 'withdraw_subject'])

function shouldRequireRelationalWrite(data, mutationType) {
  const readMode = String(data?.transition?.read_mode || '').trim()

  return (
    subjectEnrollmentMutations.has(mutationType) ||
    readMode === 'hybrid_read' ||
    readMode === 'relational_primary'
  )
}

export async function mutateStudentPortal({
  institutionId,
  mutationType,
  payload = {},
  useRemote,
  workspaceKey = 'main',
}) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    return { source: 'local', data: payload.enrollment ?? payload.exam_enrollment ?? null }
  }

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'student_portal_mutation',
      institution_id: institutionId,
      workspace_key: workspaceKey,
      mutation_type: mutationType,
      ...payload,
    },
  })

  if (error) {
    let detail = error.message

    try {
      if (error.context && typeof error.context.json === 'function') {
        const errorBody = await error.context.json()
        detail = errorBody?.error ?? errorBody?.message ?? detail
      }
    } catch {
      // El body puede haber sido leido por Supabase JS.
    }

    throw new Error(`No se pudo guardar el cambio del alumno. ${detail}`)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  if (shouldRequireRelationalWrite(data, mutationType) && !data?.sources?.relational) {
    const detail = data?.sources?.relational_error || data?.warnings?.[0] || 'La tabla academica relacional no confirmo el alta.'
    throw new Error(`No se pudo confirmar la inscripcion en las tablas academicas. ${detail}`)
  }

  return { ...data, source: 'supabase' }
}
