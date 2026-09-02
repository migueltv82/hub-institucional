import { getLatestAcademicStatusForSubject } from './examEligibility.js'

function normalizeStatus(status) {
  return String(status || '').toLowerCase()
}

function getSubjectId(subject) {
  return subject?.canonical_subject_id || subject?.subject_id || subject?.code || subject?.id || subject?.subject?.canonical_subject_id || subject?.subject?.subject_id || subject?.subject?.code || subject?.subject?.id || null
}

function getSubjectProgramId(subject) {
  return subject?.canonical_program_id || subject?.program_id || subject?.carrera || ''
}

function getPrerequisiteSubject(prerequisite, subjects = []) {
  const prerequisiteId =
    prerequisite?.prerequisite_subject_id ||
    prerequisite?.prerequisite_subject?.id ||
    prerequisite?.subject?.id

  return (
    prerequisite?.prerequisite_subject ||
    subjects.find(subject => getSubjectId(subject) === prerequisiteId) ||
    { id: prerequisiteId, name: 'Materia requerida' }
  )
}

function filterPrerequisitesForSubject(prerequisites, targetSubjectId) {
  return prerequisites.filter(prerequisite => {
    const prerequisiteSubjectId =
      prerequisite?.subject_id ||
      prerequisite?.subject?.id ||
      prerequisite?.target_subject_id

    return prerequisiteSubjectId === targetSubjectId
  })
}

// 'regular' (correlativa inmediata, para CURSAR): alcanza con regular o mejor.
// 'approved' (correlativa indirecta al cursar, o cualquiera al RENDIR): necesita aprobada/promocionado.
function statusSatisfiesRequirement(status, requirementType) {
  if (requirementType === 'regular') {
    return ['regular', 'promocionado', 'approved'].includes(status)
  }

  return ['promocionado', 'approved'].includes(status)
}

// Chequeo de correlativas para CURSAR una materia: cada correlativa respeta
// su requirement_type ('regular' si es inmediata, 'approved' si es indirecta
// -- ver buildPrerequisites() en studentPortalData.js, que ya precalcula esa
// clasificacion con prerequisiteGraph.js).
export function getPrerequisiteCheck({
  subjectId,
  subject,
  prerequisites = [],
  grades = [],
  subjects = []
}) {
  const targetSubjectId = subjectId || getSubjectId(subject)
  const subjectPrerequisites = filterPrerequisitesForSubject(prerequisites, targetSubjectId)

  const missing = []
  const met = []

  subjectPrerequisites.forEach(prerequisite => {
    const requiredSubject = getPrerequisiteSubject(prerequisite, subjects)
    const requiredSubjectId = getSubjectId(requiredSubject)
    const requirementType = normalizeStatus(prerequisite.requirement_type || 'approved')
    const status = getLatestAcademicStatusForSubject({
      subjectId: requiredSubjectId,
      programId: getSubjectProgramId(requiredSubject),
      grades,
    })
    const requirementMet = statusSatisfiesRequirement(status, requirementType)

    const result = {
      prerequisite,
      subject: requiredSubject,
      requirementType,
      status,
    }

    if (requirementMet) {
      met.push(result)
    } else {
      missing.push(result)
    }
  })

  return {
    hasPrerequisites: subjectPrerequisites.length > 0,
    prerequisites: subjectPrerequisites,
    met,
    missing,
    canEnroll: missing.length === 0
  }
}

// Chequeo de correlativas para RENDIR el final (inscribirse a una mesa):
// regla distinta a cursar -- TODAS las correlativas (inmediatas e
// indirectas por igual) deben estar aprobadas/promocionado, sin importar
// su requirement_type. Debe reflejar exactamente el chequeo equivalente de
// la RPC upsert_exam_enrollment_from_portal.
export function getFinalExamPrerequisiteCheck({
  subjectId,
  subject,
  prerequisites = [],
  grades = [],
  subjects = []
}) {
  const targetSubjectId = subjectId || getSubjectId(subject)
  const subjectPrerequisites = filterPrerequisitesForSubject(prerequisites, targetSubjectId)

  const missing = []
  const met = []

  subjectPrerequisites.forEach(prerequisite => {
    const requiredSubject = getPrerequisiteSubject(prerequisite, subjects)
    const requiredSubjectId = getSubjectId(requiredSubject)
    const status = getLatestAcademicStatusForSubject({
      subjectId: requiredSubjectId,
      programId: getSubjectProgramId(requiredSubject),
      grades,
    })
    const requirementMet = ['promocionado', 'approved'].includes(status)

    const result = { prerequisite, subject: requiredSubject, status }

    if (requirementMet) {
      met.push(result)
    } else {
      missing.push(result)
    }
  })

  return {
    hasPrerequisites: subjectPrerequisites.length > 0,
    prerequisites: subjectPrerequisites,
    met,
    missing,
    canTakeFinalExam: missing.length === 0
  }
}
