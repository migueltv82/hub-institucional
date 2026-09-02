import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import {
  buildPrerequisites,
  buildSubjects,
  getPlanCareers,
} from '../modules/alumnos/services/studentPortalData.js'
import { syncLegacyTableRows } from './legacySyncCommon.js'

const TABLE_NAME = 'legacy_subject_prerequisites'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function canUseRemoteSync({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

function prerequisiteKey(row) {
  return `${row.program_id}::${row.subject_id}::${row.prerequisite_subject_id}`
}

// Reusa exactamente la misma resolucion de ids canonicos y la misma
// clasificacion inmediata/indirecta que ya usa el portal alumno
// (buildSubjects/buildPrerequisites), iterando todas las carreras del plan
// de estudios, para garantizar que lo que queda en la tabla relacional
// coincide 1:1 con lo que el cliente calcula en memoria -- incluidas las
// correlativas indirectas que buildPrerequisites deriva solo, sin que hagan
// falta filas explicitas para ellas en el Excel.
export function buildLegacySubjectPrerequisitesFromSnapshot({ snapshot, institutionId, workspaceKey = 'main' }) {
  const planCareers = getPlanCareers(snapshot?.planesEstudio)
  const byKey = new Map()

  const careers = planCareers.length > 0 ? planCareers : ['']

  careers.forEach((career) => {
    const subjects = buildSubjects(snapshot?.planesEstudio, career, planCareers)
    const prerequisites = buildPrerequisites(snapshot?.correlatividades, subjects, career, planCareers)

    prerequisites.forEach((prerequisite) => {
      const subject = subjects.find((item) => item.canonical_subject_id === prerequisite.subject_id)
        ?? subjects.find((item) => item.subject_id === prerequisite.subject_id)
      const programId = subject?.canonical_program_id || subject?.program_id || career || ''

      const row = {
        institution_id: institutionId,
        workspace_key: workspaceKey,
        subject_id: prerequisite.subject_id,
        program_id: programId,
        prerequisite_subject_id: prerequisite.prerequisite_subject_id,
        is_immediate: prerequisite.requirement_type === 'regular',
      }

      byKey.set(prerequisiteKey(row), row)
    })
  })

  return Array.from(byKey.values())
}

export async function syncLegacySubjectPrerequisites({ institutionId, workspaceKey = 'main', snapshot, useRemote }) {
  if (!canUseRemoteSync({ institutionId, useRemote })) {
    return { skipped: true, synced: 0, deleted: 0 }
  }

  const rows = buildLegacySubjectPrerequisitesFromSnapshot({ snapshot, institutionId, workspaceKey })

  return syncLegacyTableRows({
    tableName: TABLE_NAME,
    rows,
    selectFields: 'id, subject_id, program_id, prerequisite_subject_id',
    conflictColumns: ['institution_id', 'workspace_key', 'subject_id', 'program_id', 'prerequisite_subject_id'],
    keyForRow: (row) => `${row.subject_id}::${row.program_id}::${row.prerequisite_subject_id}`,
    institutionId,
    workspaceKey,
    deleteMissing: true,
  })
}

export async function fetchLegacySubjectPrerequisites({ institutionId, workspaceKey = 'main', useRemote }) {
  if (!canUseRemoteSync({ institutionId, useRemote })) return []

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('subject_id, program_id, prerequisite_subject_id, is_immediate')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (error) throw error

  return asArray(data)
}
