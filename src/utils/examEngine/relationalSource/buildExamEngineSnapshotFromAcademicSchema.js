// Orquestador de la Capa 1 nueva: lee el schema relacional (fetchAcademicRelationalTables),
// lo mapea al shape que consume la Capa 2 (mapAcademicRelationalRowsToSnapshot), y arma el
// snapshot final agregando la configuracion del llamado (que no sale de la base, la define
// quien pide el cronograma). No toca disponibilidadDocente/cargaHorariaDocente a proposito
// -- no existen en el schema nuevo, dejarlas ausentes hace que el adaptador use horariosDocentes
// como fuente ("legacy") en vez de un falso "structured" con arrays vacios.

import { fetchAcademicRelationalTables } from './fetchAcademicRelationalTables.js'
import { mapAcademicRelationalRowsToSnapshot } from './mapAcademicRelationalRowsToSnapshot.js'

export async function buildExamEngineSnapshotFromAcademicSchema({
  supabase,
  institutionId,
  fechaInicio,
  fechaFin,
  examType = 'regular',
  generationScope = {},
  regularCallRanges = null,
  selectedSpecialSubjectKeys = [],
} = {}) {
  const tables = await fetchAcademicRelationalTables({ supabase, institutionId })
  const { snapshot, counts } = mapAcademicRelationalRowsToSnapshot(tables)

  return {
    snapshot: {
      ...snapshot,
      fechaInicio,
      fechaFin,
      examType,
      generationScope,
      regularCallRanges,
      selectedSpecialSubjectKeys,
    },
    diagnostics: {
      source: 'academic-relational-schema',
      institutionId,
      counts,
      canRunPreview: counts.teacherRecords > 0 && counts.studyPlanSubjects > 0,
    },
  }
}
