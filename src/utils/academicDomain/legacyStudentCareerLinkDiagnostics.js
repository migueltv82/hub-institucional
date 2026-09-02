export const LEGACY_STUDENT_LINK_STATUS = Object.freeze({
  READY_FOR_RELATIONAL_LINK: 'READY_FOR_RELATIONAL_LINK',
  AMBIGUOUS_STUDENT: 'AMBIGUOUS_STUDENT',
  AMBIGUOUS_CAREER: 'AMBIGUOUS_CAREER',
  AMBIGUOUS_STUDY_PLAN: 'AMBIGUOUS_STUDY_PLAN',
  MISSING_STUDENT: 'MISSING_STUDENT',
  MISSING_CAREER: 'MISSING_CAREER',
  MISSING_STUDY_PLAN: 'MISSING_STUDY_PLAN',
  DUPLICATED_MATCH: 'DUPLICATED_MATCH',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function percentage(count, total) {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2))
}

export function diagnoseLegacyStudentCareerLinks({
  studentRecords = [],
  profiles = [],
  memberships = [],
  careers = [],
  studyPlans = [],
} = {}) {
  const rows = asArray(studentRecords).map((studentRecord) => {
    const institutionId = clean(studentRecord?.institution_id ?? studentRecord?.institutionId)
    const legacyId = clean(studentRecord?.id ?? studentRecord?.record_id)
    const email = normalize(studentRecord?.email)
    const careerText = normalize(studentRecord?.career ?? studentRecord?.carrera)
    const studentMatches = asArray(profiles).filter((profile) => (
      email && normalize(profile?.email) === email
      && clean(profile?.account_role ?? profile?.accountRole) === 'alumno'
      && asArray(memberships).some((membership) => (
        clean(membership?.institution_id ?? membership?.institutionId) === institutionId
        && clean(membership?.user_id ?? membership?.userId) === clean(profile?.user_id ?? profile?.userId)
      ))
    ))
    const careerMatches = asArray(careers).filter((career) => (
      clean(career?.institution_id ?? career?.institutionId) === institutionId
      && [career?.code, career?.name].some((value) => normalize(value) === careerText)
    ))

    let status = LEGACY_STUDENT_LINK_STATUS.READY_FOR_RELATIONAL_LINK
    if (!legacyId || !email) status = LEGACY_STUDENT_LINK_STATUS.MISSING_STUDENT
    else if (studentMatches.length === 0) status = LEGACY_STUDENT_LINK_STATUS.MISSING_STUDENT
    else if (studentMatches.length > 1) status = LEGACY_STUDENT_LINK_STATUS.AMBIGUOUS_STUDENT
    else if (!careerText || careerMatches.length === 0) status = LEGACY_STUDENT_LINK_STATUS.MISSING_CAREER
    else if (careerMatches.length > 1) status = LEGACY_STUDENT_LINK_STATUS.AMBIGUOUS_CAREER

    const careerId = careerMatches.length === 1 ? clean(careerMatches[0]?.id) : null
    const planMatches = careerId
      ? asArray(studyPlans).filter((plan) => (
          clean(plan?.institution_id ?? plan?.institutionId) === institutionId
          && clean(plan?.career_id ?? plan?.careerId) === careerId
          && ['ACTIVE', 'DRAFT'].includes(clean(plan?.status).toUpperCase())
        ))
      : []
    if (status === LEGACY_STUDENT_LINK_STATUS.READY_FOR_RELATIONAL_LINK && planMatches.length === 0) {
      status = LEGACY_STUDENT_LINK_STATUS.MISSING_STUDY_PLAN
    } else if (status === LEGACY_STUDENT_LINK_STATUS.READY_FOR_RELATIONAL_LINK && planMatches.length > 1) {
      status = LEGACY_STUDENT_LINK_STATUS.AMBIGUOUS_STUDY_PLAN
    }

    return {
      status,
      legacyStudentRecordId: legacyId || null,
      institutionId: institutionId || null,
      proposedStudentId: studentMatches.length === 1 ? clean(studentMatches[0]?.user_id ?? studentMatches[0]?.userId) : null,
      proposedCareerId: careerId,
      proposedStudyPlanId: planMatches.length === 1 ? clean(planMatches[0]?.id) : null,
      matchCounts: {
        students: studentMatches.length,
        careers: careerMatches.length,
        studyPlans: planMatches.length,
      },
    }
  })

  const readyKeys = new Map()
  rows.forEach((row) => {
    if (row.status !== LEGACY_STUDENT_LINK_STATUS.READY_FOR_RELATIONAL_LINK) return
    const key = [row.institutionId, row.proposedStudentId, row.proposedCareerId, row.proposedStudyPlanId].join('::')
    readyKeys.set(key, (readyKeys.get(key) ?? 0) + 1)
  })
  rows.forEach((row) => {
    if (row.status !== LEGACY_STUDENT_LINK_STATUS.READY_FOR_RELATIONAL_LINK) return
    const key = [row.institutionId, row.proposedStudentId, row.proposedCareerId, row.proposedStudyPlanId].join('::')
    if ((readyKeys.get(key) ?? 0) > 1) row.status = LEGACY_STUDENT_LINK_STATUS.DUPLICATED_MATCH
  })

  const total = rows.length
  const byStatus = Object.values(LEGACY_STUDENT_LINK_STATUS).reduce((result, status) => {
    const count = rows.filter((row) => row.status === status).length
    result[status] = { count, percentage: percentage(count, total) }
    return result
  }, {})
  const ready = byStatus.READY_FOR_RELATIONAL_LINK.count
  const ambiguous = rows.filter((row) => row.status.startsWith('AMBIGUOUS_') || row.status === 'DUPLICATED_MATCH').length
  const missing = total - ready - ambiguous

  return {
    total,
    ready: { count: ready, percentage: percentage(ready, total) },
    ambiguous: { count: ambiguous, percentage: percentage(ambiguous, total) },
    missing: { count: missing, percentage: percentage(missing, total) },
    byStatus,
    rows,
    persisted: false,
  }
}

