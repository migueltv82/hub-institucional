import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function canUseRemoteTeacherSubjects({ institutionId }) {
  return Boolean(institutionId && isSupabaseConfigured && supabase)
}

function isMissingDeletedAtColumn(error) {
  const message = clean(error?.message).toLowerCase()
  return (
    error?.code === '42703' ||
    (
      message.includes('deleted_at') &&
      (
        message.includes('does not exist') ||
        message.includes('no existe') ||
        message.includes('has no field')
      )
    )
  )
}

export function buildSubjectKey(subjectId, programId) {
  return `${clean(subjectId)}::${clean(programId)}`
}

export function buildSubjectDisplayIndex(planesEstudio = []) {
  const index = new Map()

  asArray(planesEstudio).forEach((plan) => {
    const subjectId = clean(plan?.materia || plan?.codigo)
    const programId = clean(plan?.carrera)
    if (!subjectId || !programId) return

    const key = buildSubjectKey(subjectId, programId)
    if (index.has(key)) return

    index.set(key, {
      nombre: clean(plan?.nombreMateria || plan?.nombre) || subjectId,
      carrera: programId,
      anio: clean(plan?.anio || plan?.ano || plan?.year || plan?.curso),
    })
  })

  return index
}

export async function fetchTeacherSubjects({ institutionId, workspaceKey = 'main', teacherUserId }) {
  if (!canUseRemoteTeacherSubjects({ institutionId }) || !clean(teacherUserId)) return []

  function buildQuery({ withDeletedAtFilter = true } = {}) {
    let query = supabase
      .from('subject_teacher_assignments')
      .select('id, institution_id, workspace_key, subject_id, program_id, teacher_id, status, role, source, metadata, created_at, updated_at')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .eq('teacher_id', teacherUserId)
      .eq('status', 'active')

    if (withDeletedAtFilter) query = query.is('deleted_at', null)
    return query
  }

  let { data, error } = await buildQuery()

  if (isMissingDeletedAtColumn(error)) {
    ;({ data, error } = await buildQuery({ withDeletedAtFilter: false }))
  }

  if (error) {
    console.warn('No se pudieron leer las materias asignadas al docente.', error)
    return []
  }

  return asArray(data)
}
