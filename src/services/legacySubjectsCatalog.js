import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { buildSubjects, getPlanCareers } from '../modules/alumnos/services/studentPortalData.js'
import { syncLegacyTableRowsByNaturalKey } from './legacySyncCommon.js'

const TABLE_NAME = 'legacy_subjects_catalog'

function canUseRemoteSync({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

// Mismo dato que ya arma buildSubjects() para el portal alumno (nombre y
// "semester", que es el anio/nivel de la materia dentro de su carrera),
// espejado a una tabla relacional para que el gate de "anio completo" y los
// mensajes de correlativas faltantes puedan mostrar nombres del lado server.
export function buildLegacySubjectsCatalogFromSnapshot({ snapshot, institutionId, workspaceKey = 'main' }) {
  const planCareers = getPlanCareers(snapshot?.planesEstudio)
  const byKey = new Map()

  const careers = planCareers.length > 0 ? planCareers : ['']

  careers.forEach((career) => {
    buildSubjects(snapshot?.planesEstudio, career, planCareers).forEach((subject) => {
      const subjectId = subject.canonical_subject_id || subject.subject_id
      const programId = subject.canonical_program_id || subject.program_id || career || ''
      if (!subjectId) return

      byKey.set(`${programId}::${subjectId}`, {
        institution_id: institutionId,
        workspace_key: workspaceKey,
        subject_id: subjectId,
        program_id: programId,
        year_level: Number.isFinite(subject.semester) ? subject.semester : null,
        name: subject.name || subjectId,
      })
    })
  })

  return Array.from(byKey.values())
}

export async function syncLegacySubjectsCatalog({ institutionId, workspaceKey = 'main', snapshot, useRemote }) {
  if (!canUseRemoteSync({ institutionId, useRemote })) {
    return { skipped: true, synced: 0 }
  }

  const rows = buildLegacySubjectsCatalogFromSnapshot({ snapshot, institutionId, workspaceKey })

  return syncLegacyTableRowsByNaturalKey({
    tableName: TABLE_NAME,
    rows,
    conflictColumns: ['institution_id', 'workspace_key', 'subject_id', 'program_id'],
    institutionId,
    workspaceKey,
  })
}
