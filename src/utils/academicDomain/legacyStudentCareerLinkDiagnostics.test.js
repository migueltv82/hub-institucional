import { describe, expect, it } from 'vitest'
import {
  LEGACY_STUDENT_LINK_STATUS,
  diagnoseLegacyStudentCareerLinks,
} from './legacyStudentCareerLinkDiagnostics.js'

const base = {
  profiles: [{ user_id: 'student-1', email: 'student@example.com', account_role: 'alumno' }],
  memberships: [{ institution_id: 'institution-1', user_id: 'student-1' }],
  careers: [{ id: 'career-1', institution_id: 'institution-1', code: 'ING', name: 'Profesorado de Ingles' }],
  studyPlans: [{ id: 'plan-1', institution_id: 'institution-1', career_id: 'career-1', status: 'ACTIVE' }],
}

describe('diagnoseLegacyStudentCareerLinks', () => {
  it('propone ids relacionales sin exponer email ni persistir', () => {
    const result = diagnoseLegacyStudentCareerLinks({
      ...base,
      studentRecords: [{ id: 'record-1', institution_id: 'institution-1', email: 'student@example.com', career: 'Profesorado de Ingles' }],
    })
    expect(result.ready).toEqual({ count: 1, percentage: 100 })
    expect(result.persisted).toBe(false)
    expect(result.rows[0]).toMatchObject({
      status: LEGACY_STUDENT_LINK_STATUS.READY_FOR_RELATIONAL_LINK,
      proposedStudentId: 'student-1',
      proposedCareerId: 'career-1',
      proposedStudyPlanId: 'plan-1',
    })
    expect(result.rows[0]).not.toHaveProperty('email')
  })

  it.each([
    ['MISSING_STUDENT', { profiles: [] }],
    ['MISSING_CAREER', { careers: [] }],
    ['MISSING_STUDY_PLAN', { studyPlans: [] }],
    ['AMBIGUOUS_STUDY_PLAN', { studyPlans: [
      { id: 'plan-1', institution_id: 'institution-1', career_id: 'career-1', status: 'ACTIVE' },
      { id: 'plan-2', institution_id: 'institution-1', career_id: 'career-1', status: 'ACTIVE' },
    ] }],
  ])('clasifica %s', (expected, overrides) => {
    const result = diagnoseLegacyStudentCareerLinks({
      ...base,
      ...overrides,
      studentRecords: [{ id: 'record-1', institution_id: 'institution-1', email: 'student@example.com', career: 'ING' }],
    })
    expect(result.rows[0].status).toBe(expected)
  })

  it('detecta coincidencias duplicadas y calcula porcentajes', () => {
    const result = diagnoseLegacyStudentCareerLinks({
      ...base,
      studentRecords: [
        { id: 'record-1', institution_id: 'institution-1', email: 'student@example.com', career: 'ING' },
        { id: 'record-2', institution_id: 'institution-1', email: 'student@example.com', career: 'ING' },
      ],
    })
    expect(result.byStatus.DUPLICATED_MATCH).toEqual({ count: 2, percentage: 100 })
    expect(result.ambiguous.count).toBe(2)
  })
})

