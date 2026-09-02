export const COURSE_OFFERING_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  OPEN_FOR_ENROLLMENT: 'OPEN_FOR_ENROLLMENT',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED_FOR_ENROLLMENT: 'CLOSED_FOR_ENROLLMENT',
  PENDING_COURSE_CLOSURE: 'PENDING_COURSE_CLOSURE',
  COURSE_CLOSED: 'COURSE_CLOSED',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED',
})

export const TEACHING_ASSIGNMENT_ROLE = Object.freeze({
  TITULAR: 'TITULAR',
  CO_TITULAR: 'CO_TITULAR',
  ADJUNTO: 'ADJUNTO',
  AUXILIAR: 'AUXILIAR',
  REEMPLAZANTE: 'REEMPLAZANTE',
})

export const COURSE_ENROLLMENT_TYPE = Object.freeze({
  AUTOMATIC_FIRST_YEAR: 'AUTOMATIC_FIRST_YEAR',
  STUDENT_SELECTED: 'STUDENT_SELECTED',
  ADMINISTRATIVE: 'ADMINISTRATIVE',
  MIGRATED_LEGACY: 'MIGRATED_LEGACY',
})

export const COURSE_ENROLLMENT_STATUS = Object.freeze({
  ENROLLED: 'ENROLLED',
  IN_PROGRESS: 'IN_PROGRESS',
  WITHDRAWN: 'WITHDRAWN',
  COURSE_CLOSED: 'COURSE_CLOSED',
  INVALIDATED: 'INVALIDATED',
})

export const ACADEMIC_RECORD_STATUS = Object.freeze({
  NOT_TAKEN: 'NOT_TAKEN',
  ENROLLED: 'ENROLLED',
  IN_PROGRESS: 'IN_PROGRESS',
  REGULAR: 'REGULAR',
  PROMOTED: 'PROMOTED',
  FREE: 'FREE',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  REGULARITY_EXPIRED: 'REGULARITY_EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
  PENDING_REVIEW: 'PENDING_REVIEW',
})

export const ACADEMIC_DOMAIN_REASON = Object.freeze({
  INVALID_COMMAND: 'INVALID_COMMAND',
  STUDENT_NOT_FOUND: 'STUDENT_NOT_FOUND',
  STUDENT_INACTIVE: 'STUDENT_INACTIVE',
  STUDENT_NOT_FIRST_YEAR_ENTRANT: 'STUDENT_NOT_FIRST_YEAR_ENTRANT',
  CAREER_MISMATCH: 'CAREER_MISMATCH',
  STUDY_PLAN_MISMATCH: 'STUDY_PLAN_MISMATCH',
  OFFERING_NOT_FOUND: 'OFFERING_NOT_FOUND',
  OFFERING_NOT_OPEN: 'OFFERING_NOT_OPEN',
  OFFERING_CANCELLED: 'OFFERING_CANCELLED',
  OFFERING_DUPLICATE: 'OFFERING_DUPLICATE',
  OFFERING_MISSING_STUDY_PLAN_SUBJECT: 'OFFERING_MISSING_STUDY_PLAN_SUBJECT',
  ALREADY_ENROLLED: 'ALREADY_ENROLLED',
  SUBJECT_ALREADY_PASSED: 'SUBJECT_ALREADY_PASSED',
  PREREQUISITES_NOT_MET: 'PREREQUISITES_NOT_MET',
  ADMINISTRATIVE_BLOCK: 'ADMINISTRATIVE_BLOCK',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  COURSE_CLOSURE_NOT_ALLOWED: 'COURSE_CLOSURE_NOT_ALLOWED',
  COURSE_CLOSURE_MISSING_EVIDENCE: 'COURSE_CLOSURE_MISSING_EVIDENCE',
  COURSE_CLOSURE_OVERRIDE_REASON_REQUIRED: 'COURSE_CLOSURE_OVERRIDE_REASON_REQUIRED',
  COURSE_CLOSURE_ALREADY_EXISTS: 'COURSE_CLOSURE_ALREADY_EXISTS',
})

const OFFERING_TRANSITIONS = Object.freeze({
  DRAFT: ['OPEN_FOR_ENROLLMENT', 'CANCELLED'],
  OPEN_FOR_ENROLLMENT: ['IN_PROGRESS', 'CLOSED_FOR_ENROLLMENT', 'CANCELLED'],
  IN_PROGRESS: ['CLOSED_FOR_ENROLLMENT', 'PENDING_COURSE_CLOSURE', 'CANCELLED'],
  CLOSED_FOR_ENROLLMENT: ['IN_PROGRESS', 'PENDING_COURSE_CLOSURE', 'CANCELLED'],
  PENDING_COURSE_CLOSURE: ['COURSE_CLOSED', 'IN_PROGRESS'],
  COURSE_CLOSED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
})

function clean(value) {
  return String(value ?? '').trim()
}

function sameId(left, right) {
  return clean(left) !== '' && clean(left) === clean(right)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function requiredCommandFields(command, fields) {
  return fields.filter((field) => !clean(command?.[field]))
}

export function validateCourseOfferingDefinition(offering, existingOfferings = []) {
  const reasonCodes = []
  if (!clean(offering?.studyPlanSubjectId)) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.OFFERING_MISSING_STUDY_PLAN_SUBJECT)
  }

  const duplicate = existingOfferings.some((candidate) => (
    !sameId(candidate?.id, offering?.id)
    && sameId(candidate?.institutionId, offering?.institutionId)
    && sameId(candidate?.careerId, offering?.careerId)
    && sameId(candidate?.studyPlanId, offering?.studyPlanId)
    && sameId(candidate?.studyPlanSubjectId, offering?.studyPlanSubjectId)
    && sameId(candidate?.academicYearId, offering?.academicYearId)
    && clean(candidate?.academicTermId) === clean(offering?.academicTermId)
    && clean(candidate?.commissionCode).toUpperCase() === clean(offering?.commissionCode).toUpperCase()
    && candidate?.status !== COURSE_OFFERING_STATUS.ARCHIVED
  ))
  if (duplicate) reasonCodes.push(ACADEMIC_DOMAIN_REASON.OFFERING_DUPLICATE)

  return { valid: reasonCodes.length === 0, reasonCodes }
}

export function validateCourseOfferingTransition(currentStatus, nextStatus) {
  const current = clean(currentStatus).toUpperCase()
  const next = clean(nextStatus).toUpperCase()
  const allowedNextStatuses = OFFERING_TRANSITIONS[current] ?? []
  return {
    valid: current === next || allowedNextStatuses.includes(next),
    currentStatus: current,
    nextStatus: next,
    allowedNextStatuses,
  }
}

export function evaluateCourseEnrollmentEligibility({
  student,
  offering,
  existingEnrollment = null,
  passedSubjectIds = [],
  prerequisitesMet = true,
} = {}) {
  const reasonCodes = []
  if (!student) reasonCodes.push(ACADEMIC_DOMAIN_REASON.STUDENT_NOT_FOUND)
  if (student && student.active !== true) reasonCodes.push(ACADEMIC_DOMAIN_REASON.STUDENT_INACTIVE)
  if (!offering) reasonCodes.push(ACADEMIC_DOMAIN_REASON.OFFERING_NOT_FOUND)

  if (offering) {
    if (offering.status === COURSE_OFFERING_STATUS.CANCELLED) {
      reasonCodes.push(ACADEMIC_DOMAIN_REASON.OFFERING_CANCELLED)
    } else if (offering.status !== COURSE_OFFERING_STATUS.OPEN_FOR_ENROLLMENT) {
      reasonCodes.push(ACADEMIC_DOMAIN_REASON.OFFERING_NOT_OPEN)
    }
  }

  if (student && offering && !sameId(student.institutionId, offering.institutionId)) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.CAREER_MISMATCH)
  } else if (student && offering && !sameId(student.careerId, offering.careerId)) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.CAREER_MISMATCH)
  }
  if (student && offering && !sameId(student.studyPlanId, offering.studyPlanId)) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.STUDY_PLAN_MISMATCH)
  }
  if (existingEnrollment) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.ALREADY_ENROLLED)
  }
  if (offering && passedSubjectIds.some((id) => sameId(id, offering.studyPlanSubjectId))) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.SUBJECT_ALREADY_PASSED)
  }
  if (!prerequisitesMet) reasonCodes.push(ACADEMIC_DOMAIN_REASON.PREREQUISITES_NOT_MET)
  if (student?.administrativeBlock === true) reasonCodes.push(ACADEMIC_DOMAIN_REASON.ADMINISTRATIVE_BLOCK)
  if (Number.isFinite(Number(offering?.capacity)) && Number(offering.capacity) > 0
    && Number(offering.enrolledCount ?? 0) >= Number(offering.capacity)) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.CAPACITY_EXCEEDED)
  }

  return { eligible: reasonCodes.length === 0, reasonCodes: unique(reasonCodes) }
}

export function buildFirstYearEnrollmentPlan({ student, offerings = [], existingEnrollments = [], command } = {}) {
  const rejectedOfferings = []
  const globalReasons = []
  if (!student) globalReasons.push(ACADEMIC_DOMAIN_REASON.STUDENT_NOT_FOUND)
  if (student && student.active !== true) globalReasons.push(ACADEMIC_DOMAIN_REASON.STUDENT_INACTIVE)
  if (student && student.isFirstYearEntrant !== true) {
    globalReasons.push(ACADEMIC_DOMAIN_REASON.STUDENT_NOT_FIRST_YEAR_ENTRANT)
  }
  if (student && !sameId(student.careerId, command?.careerId)) {
    globalReasons.push(ACADEMIC_DOMAIN_REASON.CAREER_MISMATCH)
  }
  if (student && !sameId(student.studyPlanId, command?.studyPlanId)) {
    globalReasons.push(ACADEMIC_DOMAIN_REASON.STUDY_PLAN_MISMATCH)
  }

  if (globalReasons.length > 0) {
    return {
      status: 'REJECTED',
      createOfferings: [],
      existingEnrollmentIds: [],
      rejectedOfferings: offerings.map((offering) => ({ offeringId: offering.id, reasonCodes: unique(globalReasons) })),
      reasonCodes: unique(globalReasons),
    }
  }

  const createOfferings = []
  const existingEnrollmentIds = []
  offerings.forEach((offering) => {
    const belongsToCommand = sameId(offering.institutionId, command.institutionId)
      && sameId(offering.careerId, command.careerId)
      && sameId(offering.studyPlanId, command.studyPlanId)
      && sameId(offering.academicYearId, command.academicYearId)
      && Number(offering.subjectYearLevel) === 1
    if (!belongsToCommand) return

    const existing = existingEnrollments.find((enrollment) => sameId(enrollment.courseOfferingId, offering.id))
    if (existing) {
      existingEnrollmentIds.push(existing.id)
      return
    }

    const eligibility = evaluateCourseEnrollmentEligibility({ student, offering })
    if (eligibility.eligible) createOfferings.push(offering)
    else rejectedOfferings.push({ offeringId: offering.id, reasonCodes: eligibility.reasonCodes })
  })

  return {
    status: rejectedOfferings.length > 0 ? 'PARTIAL' : 'READY',
    createOfferings,
    existingEnrollmentIds,
    rejectedOfferings,
    reasonCodes: unique(rejectedOfferings.flatMap((entry) => entry.reasonCodes)),
  }
}

function assertTransactionalAdapter(adapter) {
  if (typeof adapter?.runInTransaction !== 'function') {
    throw new Error('ACADEMIC_TRANSACTION_ADAPTER_REQUIRED')
  }
}

export async function enrollFirstYearStudentAtomically(command, adapter) {
  const missing = requiredCommandFields(command, [
    'institutionId', 'studentId', 'careerId', 'studyPlanId', 'academicYearId', 'actorId',
  ])
  if (missing.length > 0) {
    return { status: 'REJECTED', createdEnrollmentIds: [], existingEnrollmentIds: [], rejectedOfferings: [], reasonCodes: [ACADEMIC_DOMAIN_REASON.INVALID_COMMAND], missingFields: missing, auditEventId: null }
  }
  assertTransactionalAdapter(adapter)

  return adapter.runInTransaction(async (transaction) => {
    const student = await transaction.getStudentForUpdate(command)
    const offerings = await transaction.listFirstYearOfferingsForUpdate(command)
    const existingEnrollments = await transaction.listCourseEnrollmentsForUpdate(command)
    const plan = buildFirstYearEnrollmentPlan({ student, offerings, existingEnrollments, command })
    if (plan.status === 'REJECTED') {
      return { ...plan, createdEnrollmentIds: [], auditEventId: null }
    }

    const createdEnrollmentIds = []
    for (const offering of plan.createOfferings) {
      const enrollment = await transaction.insertCourseEnrollment({
        institutionId: command.institutionId,
        studentId: command.studentId,
        courseOfferingId: offering.id,
        enrollmentType: COURSE_ENROLLMENT_TYPE.AUTOMATIC_FIRST_YEAR,
        status: COURSE_ENROLLMENT_STATUS.ENROLLED,
        createdBy: command.actorId,
      })
      createdEnrollmentIds.push(enrollment.id)
    }
    const auditEvent = await transaction.appendDomainAuditEvent({
      institutionId: command.institutionId,
      aggregateType: 'STUDENT',
      aggregateId: command.studentId,
      eventType: 'FIRST_YEAR_COURSE_ENROLLMENT_COMPLETED',
      actorId: command.actorId,
      payload: {
        academicYearId: command.academicYearId,
        createdEnrollmentIds,
        existingEnrollmentIds: plan.existingEnrollmentIds,
        rejectedOfferings: plan.rejectedOfferings,
      },
    })

    return {
      status: plan.rejectedOfferings.length > 0 ? 'PARTIAL' : 'COMPLETED',
      createdEnrollmentIds,
      existingEnrollmentIds: plan.existingEnrollmentIds,
      rejectedOfferings: plan.rejectedOfferings,
      reasonCodes: plan.reasonCodes,
      auditEventId: auditEvent.id,
    }
  })
}

export async function enrollStudentInCourseOfferingAtomically(command, adapter) {
  const missing = requiredCommandFields(command, ['institutionId', 'studentId', 'courseOfferingId', 'actorId'])
  if (missing.length > 0) {
    return { status: 'REJECTED', enrollmentId: null, reasonCodes: [ACADEMIC_DOMAIN_REASON.INVALID_COMMAND], missingFields: missing, auditEventId: null }
  }
  assertTransactionalAdapter(adapter)

  return adapter.runInTransaction(async (transaction) => {
    const student = await transaction.getStudentForUpdate(command)
    const offering = await transaction.getCourseOfferingForUpdate(command)
    const existingEnrollment = await transaction.getCourseEnrollmentForUpdate(command)
    const passedSubjectIds = await transaction.listPassedStudyPlanSubjectIds(command)
    const prerequisitesMet = await transaction.checkCoursePrerequisites(command)
    const eligibility = evaluateCourseEnrollmentEligibility({ student, offering, existingEnrollment, passedSubjectIds, prerequisitesMet })
    if (!eligibility.eligible) {
      return { status: 'REJECTED', enrollmentId: existingEnrollment?.id ?? null, reasonCodes: eligibility.reasonCodes, auditEventId: null }
    }

    const enrollment = await transaction.insertCourseEnrollment({
      institutionId: command.institutionId,
      studentId: command.studentId,
      courseOfferingId: command.courseOfferingId,
      enrollmentType: COURSE_ENROLLMENT_TYPE.STUDENT_SELECTED,
      status: COURSE_ENROLLMENT_STATUS.ENROLLED,
      createdBy: command.actorId,
    })
    const auditEvent = await transaction.appendDomainAuditEvent({
      institutionId: command.institutionId,
      aggregateType: 'COURSE_ENROLLMENT',
      aggregateId: enrollment.id,
      eventType: 'COURSE_ENROLLMENT_CREATED',
      actorId: command.actorId,
      payload: { courseOfferingId: command.courseOfferingId, enrollmentType: COURSE_ENROLLMENT_TYPE.STUDENT_SELECTED },
    })
    return { status: 'COMPLETED', enrollmentId: enrollment.id, reasonCodes: [], auditEventId: auditEvent.id }
  })
}

export function resolveAcademicRecordStatus({ records = [], examResults = [], courseEnrollments = [] } = {}) {
  const statuses = [...records, ...examResults, ...courseEnrollments]
    .map((entry) => clean(entry?.status).toUpperCase())
    .filter((status) => Object.hasOwn(ACADEMIC_RECORD_STATUS, status))
  if (statuses.length === 0) return ACADEMIC_RECORD_STATUS.NOT_TAKEN

  const terminalStatuses = unique(statuses.filter((status) => [
    ACADEMIC_RECORD_STATUS.PASSED,
    ACADEMIC_RECORD_STATUS.PROMOTED,
    ACADEMIC_RECORD_STATUS.FAILED,
    ACADEMIC_RECORD_STATUS.FREE,
  ].includes(status)))
  const hasPassing = terminalStatuses.some((status) => [ACADEMIC_RECORD_STATUS.PASSED, ACADEMIC_RECORD_STATUS.PROMOTED].includes(status))
  const hasContradiction = hasPassing && terminalStatuses.some((status) => [ACADEMIC_RECORD_STATUS.FAILED, ACADEMIC_RECORD_STATUS.FREE].includes(status))
  if (hasContradiction || statuses.includes(ACADEMIC_RECORD_STATUS.PENDING_REVIEW)) return ACADEMIC_RECORD_STATUS.PENDING_REVIEW
  if (statuses.includes(ACADEMIC_RECORD_STATUS.PASSED)) return ACADEMIC_RECORD_STATUS.PASSED
  if (statuses.includes(ACADEMIC_RECORD_STATUS.PROMOTED)) return ACADEMIC_RECORD_STATUS.PROMOTED

  return statuses.at(-1)
}

export function validateCourseClosureCommand({ offering, actorCanClose, minimumEvidencePresent, existingActiveClosure, calculatedStatus, confirmedStatus, overrideReason } = {}) {
  const reasonCodes = []
  if (![COURSE_OFFERING_STATUS.PENDING_COURSE_CLOSURE, COURSE_OFFERING_STATUS.IN_PROGRESS].includes(offering?.status) || actorCanClose !== true) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.COURSE_CLOSURE_NOT_ALLOWED)
  }
  if (minimumEvidencePresent !== true) reasonCodes.push(ACADEMIC_DOMAIN_REASON.COURSE_CLOSURE_MISSING_EVIDENCE)
  if (existingActiveClosure) reasonCodes.push(ACADEMIC_DOMAIN_REASON.COURSE_CLOSURE_ALREADY_EXISTS)
  if (clean(calculatedStatus) !== clean(confirmedStatus) && !clean(overrideReason)) {
    reasonCodes.push(ACADEMIC_DOMAIN_REASON.COURSE_CLOSURE_OVERRIDE_REASON_REQUIRED)
  }
  return { valid: reasonCodes.length === 0, reasonCodes }
}
