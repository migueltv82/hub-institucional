import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { buildSubjects, buildExams, getPlanCareers } from '../modules/alumnos/services/studentPortalData.js'
import { syncLegacyTableRowsByNaturalKey } from './legacySyncCommon.js'

const TABLE_NAME = 'legacy_exam_sessions'

function canUseRemoteSync({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

// Mismo dato que ya arma buildExams() para el portal alumno (fecha y
// llamado por mesa), espejado a una tabla relacional para que la RPC de
// mesas pueda resolver server-side "cuando es esta mesa" al chequear la
// penalidad de ausencia/mesa castigo.
export function buildLegacyExamSessionsFromSnapshot({ snapshot, institutionId, workspaceKey = 'main' }) {
  const planCareers = getPlanCareers(snapshot?.planesEstudio)
  const byId = new Map()

  const careers = planCareers.length > 0 ? planCareers : ['']

  careers.forEach((career) => {
    const subjects = buildSubjects(snapshot?.planesEstudio, career, planCareers)
    buildExams(snapshot?.cronograma, subjects, career, institutionId, planCareers).forEach((exam) => {
      if (!exam.id || byId.has(exam.id)) return

      byId.set(exam.id, {
        institution_id: institutionId,
        workspace_key: workspaceKey,
        exam_table_id: exam.id,
        subject_id: exam.subject_id || '',
        program_id: exam.program_id || '',
        exam_date: exam.exam_date || null,
        call_label: exam.call_label || '',
      })
    })
  })

  return Array.from(byId.values())
}

export async function syncLegacyExamSessions({ institutionId, workspaceKey = 'main', snapshot, useRemote }) {
  if (!canUseRemoteSync({ institutionId, useRemote })) {
    return { skipped: true, synced: 0 }
  }

  const rows = buildLegacyExamSessionsFromSnapshot({ snapshot, institutionId, workspaceKey })

  return syncLegacyTableRowsByNaturalKey({
    tableName: TABLE_NAME,
    rows,
    conflictColumns: ['institution_id', 'workspace_key', 'exam_table_id'],
    institutionId,
    workspaceKey,
  })
}
