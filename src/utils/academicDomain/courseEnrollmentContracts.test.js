import { describe, expect, it } from 'vitest'
import {
  ACADEMIC_DOMAIN_REASON,
  ACADEMIC_RECORD_STATUS,
  COURSE_OFFERING_STATUS,
  buildFirstYearEnrollmentPlan,
  enrollFirstYearStudentAtomically,
  enrollStudentInCourseOfferingAtomically,
  evaluateCourseEnrollmentEligibility,
  resolveAcademicRecordStatus,
  validateCourseClosureCommand,
  validateCourseOfferingDefinition,
  validateCourseOfferingTransition,
} from './courseEnrollmentContracts.js'

const command = {
  institutionId: 'institution-1',
  studentId: 'student-1',
  careerId: 'career-1',
  studyPlanId: 'plan-1',
  academicYearId: 'year-2026',
  actorId: 'actor-1',
}

const student = {
  id: 'student-1',
  institutionId: 'institution-1',
  careerId: 'career-1',
  studyPlanId: 'plan-1',
  active: true,
  isFirstYearEntrant: true,
}

function offering(overrides = {}) {
  return {
    id: 'offering-1',
    institutionId: 'institution-1',
    careerId: 'career-1',
    studyPlanId: 'plan-1',
    studyPlanSubjectId: 'subject-1',
    academicYearId: 'year-2026',
    academicTermId: 'term-1',
    subjectYearLevel: 1,
    commissionCode: 'A',
    status: COURSE_OFFERING_STATUS.OPEN_FOR_ENROLLMENT,
    ...overrides,
  }
}

function transactionalAdapter(overrides = {}) {
  const state = { enrollments: [], auditEvents: [] }
  const transaction = {
    getStudentForUpdate: async () => student,
    listFirstYearOfferingsForUpdate: async () => [offering(), offering({ id: 'offering-2', studyPlanSubjectId: 'subject-2' })],
    listCourseEnrollmentsForUpdate: async () => state.enrollments,
    getCourseOfferingForUpdate: async () => offering(),
    getCourseEnrollmentForUpdate: async () => null,
    listPassedStudyPlanSubjectIds: async () => [],
    checkCoursePrerequisites: async () => true,
    insertCourseEnrollment: async (input) => {
      const row = { id: `enrollment-${state.enrollments.length + 1}`, ...input }
      state.enrollments.push(row)
      return row
    },
    appendDomainAuditEvent: async (input) => {
      const row = { id: `audit-${state.auditEvents.length + 1}`, ...input }
      state.auditEvents.push(row)
      return row
    },
    ...overrides,
  }
  return {
    state,
    runInTransaction: async (work) => {
      const before = structuredClone(state)
      try {
        return await work(transaction)
      } catch (error) {
        state.enrollments = before.enrollments
        state.auditEvents = before.auditEvents
        throw error
      }
    },
  }
}

describe('course offering domain', () => {
  it('no permite abrir una oferta sin materia del plan', () => {
    expect(validateCourseOfferingDefinition(offering({ studyPlanSubjectId: '' }))).toEqual({
      valid: false,
      reasonCodes: [ACADEMIC_DOMAIN_REASON.OFFERING_MISSING_STUDY_PLAN_SUBJECT],
    })
  })

  it('detecta la misma oferta para plan, ciclo, termino y comision', () => {
    const current = offering()
    expect(validateCourseOfferingDefinition(current, [offering({ id: 'other' })]).reasonCodes)
      .toContain(ACADEMIC_DOMAIN_REASON.OFFERING_DUPLICATE)
  })

  it('solo permite transiciones explicitas', () => {
    expect(validateCourseOfferingTransition('DRAFT', 'OPEN_FOR_ENROLLMENT').valid).toBe(true)
    expect(validateCourseOfferingTransition('DRAFT', 'COURSE_CLOSED').valid).toBe(false)
  })

  it('rechaza inscripcion en oferta cancelada', () => {
    const result = evaluateCourseEnrollmentEligibility({ student, offering: offering({ status: 'CANCELLED' }) })
    expect(result.eligible).toBe(false)
    expect(result.reasonCodes).toContain(ACADEMIC_DOMAIN_REASON.OFFERING_CANCELLED)
  })
})

describe('first year enrollment contract', () => {
  it('crea todas las inscripciones de primer anio', async () => {
    const adapter = transactionalAdapter()
    const result = await enrollFirstYearStudentAtomically(command, adapter)
    expect(result.status).toBe('COMPLETED')
    expect(result.createdEnrollmentIds).toHaveLength(2)
    expect(adapter.state.auditEvents).toHaveLength(1)
  })

  it('es idempotente y no duplica al ejecutarse dos veces', async () => {
    const adapter = transactionalAdapter()
    await enrollFirstYearStudentAtomically(command, adapter)
    const second = await enrollFirstYearStudentAtomically(command, adapter)
    expect(second.createdEnrollmentIds).toEqual([])
    expect(second.existingEnrollmentIds).toHaveLength(2)
    expect(adapter.state.enrollments).toHaveLength(2)
  })

  it('no incluye ofertas de otro plan', () => {
    const plan = buildFirstYearEnrollmentPlan({
      student,
      command,
      offerings: [offering(), offering({ id: 'other-plan', studyPlanId: 'plan-2' })],
    })
    expect(plan.createOfferings.map((entry) => entry.id)).toEqual(['offering-1'])
  })

  it('no inscribe a un alumno que no es ingresante', () => {
    const plan = buildFirstYearEnrollmentPlan({
      student: { ...student, isFirstYearEntrant: false },
      command,
      offerings: [offering()],
    })
    expect(plan.status).toBe('REJECTED')
    expect(plan.reasonCodes).toContain(ACADEMIC_DOMAIN_REASON.STUDENT_NOT_FIRST_YEAR_ENTRANT)
  })

  it('revierte toda la transaccion si una insercion falla', async () => {
    let inserts = 0
    const adapter = transactionalAdapter({
      insertCourseEnrollment: async (input) => {
        inserts += 1
        if (inserts === 2) throw new Error('SIMULATED_WRITE_FAILURE')
        const row = { id: 'temporary-enrollment', ...input }
        adapter.state.enrollments.push(row)
        return row
      },
    })
    await expect(enrollFirstYearStudentAtomically(command, adapter)).rejects.toThrow('SIMULATED_WRITE_FAILURE')
    expect(adapter.state.enrollments).toEqual([])
    expect(adapter.state.auditEvents).toEqual([])
  })
})

describe('manual enrollment contract', () => {
  it('permite una oferta valida', async () => {
    const adapter = transactionalAdapter()
    const result = await enrollStudentInCourseOfferingAtomically({ ...command, courseOfferingId: 'offering-1' }, adapter)
    expect(result.status).toBe('COMPLETED')
    expect(result.enrollmentId).toBe('enrollment-1')
  })

  it.each([
    ['materia aprobada', { listPassedStudyPlanSubjectIds: async () => ['subject-1'] }, ACADEMIC_DOMAIN_REASON.SUBJECT_ALREADY_PASSED],
    ['otra carrera', { getCourseOfferingForUpdate: async () => offering({ careerId: 'career-2' }) }, ACADEMIC_DOMAIN_REASON.CAREER_MISMATCH],
    ['duplicado', { getCourseEnrollmentForUpdate: async () => ({ id: 'existing-1', status: 'ENROLLED' }) }, ACADEMIC_DOMAIN_REASON.ALREADY_ENROLLED],
    ['oferta cerrada', { getCourseOfferingForUpdate: async () => offering({ status: 'CLOSED_FOR_ENROLLMENT' }) }, ACADEMIC_DOMAIN_REASON.OFFERING_NOT_OPEN],
    ['correlatividad incumplida', { checkCoursePrerequisites: async () => false }, ACADEMIC_DOMAIN_REASON.PREREQUISITES_NOT_MET],
  ])('rechaza %s', async (_label, overrides, expectedReason) => {
    const result = await enrollStudentInCourseOfferingAtomically(
      { ...command, courseOfferingId: 'offering-1' },
      transactionalAdapter(overrides),
    )
    expect(result.status).toBe('REJECTED')
    expect(result.reasonCodes).toContain(expectedReason)
  })
})

describe('academic history contract', () => {
  it('sin registros devuelve NOT_TAKEN y nunca REGULAR', () => {
    expect(resolveAcademicRecordStatus()).toBe(ACADEMIC_RECORD_STATUS.NOT_TAKEN)
  })

  it('materia aprobada devuelve PASSED', () => {
    expect(resolveAcademicRecordStatus({ examResults: [{ status: 'PASSED' }] })).toBe(ACADEMIC_RECORD_STATUS.PASSED)
  })

  it('datos contradictorios devuelven PENDING_REVIEW', () => {
    expect(resolveAcademicRecordStatus({ records: [{ status: 'PASSED' }, { status: 'FAILED' }] }))
      .toBe(ACADEMIC_RECORD_STATUS.PENDING_REVIEW)
  })
})

describe('future course closure contract', () => {
  it('acepta cierre con evidencia, actor autorizado y estado compatible', () => {
    expect(validateCourseClosureCommand({
      offering: { status: 'PENDING_COURSE_CLOSURE' },
      actorCanClose: true,
      minimumEvidencePresent: true,
      existingActiveClosure: false,
      calculatedStatus: 'REGULAR',
      confirmedStatus: 'REGULAR',
    }).valid).toBe(true)
  })

  it('requiere motivo para override y bloquea un cierre activo previo', () => {
    const result = validateCourseClosureCommand({
      offering: { status: 'PENDING_COURSE_CLOSURE' },
      actorCanClose: true,
      minimumEvidencePresent: true,
      existingActiveClosure: true,
      calculatedStatus: 'REGULAR',
      confirmedStatus: 'FREE',
      overrideReason: '',
    })
    expect(result.valid).toBe(false)
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      ACADEMIC_DOMAIN_REASON.COURSE_CLOSURE_ALREADY_EXISTS,
      ACADEMIC_DOMAIN_REASON.COURSE_CLOSURE_OVERRIDE_REASON_REQUIRED,
    ]))
  })
})
