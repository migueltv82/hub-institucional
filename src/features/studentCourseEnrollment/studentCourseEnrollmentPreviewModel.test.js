import { describe, expect, it } from 'vitest'
import {
  buildStudentCourseEnrollmentPreviewModel,
  getEnrollmentRejectionMessage,
  getOfferingDetails,
} from './studentCourseEnrollmentPreviewModel.js'

function raw(overrides = {}) {
  return {
    source: 'local_student_course_enrollment_preview',
    actorMode: 'student',
    institution: { id: 'inst-1', name: 'Instituto' },
    selectedRelationId: 'relation-1',
    relations: [{
      id: 'relation-1',
      institution_id: 'inst-1',
      student_id: 'student-1',
      career_id: 'career-1',
      career_name: 'Carrera A',
      study_plan_id: 'plan-1',
      study_plan_name: 'Plan A',
      status: 'ACTIVE',
      is_first_year_entrant: true,
    }],
    careers: [{ id: 'career-1', institution_id: 'inst-1', name: 'Carrera A', status: 'ACTIVE' }],
    studyPlans: [{ id: 'plan-1', institution_id: 'inst-1', career_id: 'career-1', name: 'Plan A', status: 'ACTIVE' }],
    offerings: [
      { id: 'off-1', institution_id: 'inst-1', career_id: 'career-1', study_plan_id: 'plan-1', study_plan_subject_id: 'subject-1', subject_name: 'Materia A', year_level: 1, status: 'OPEN_FOR_ENROLLMENT' },
      { id: 'off-other', institution_id: 'inst-1', career_id: 'career-2', study_plan_id: 'plan-2', subject_name: 'Otra carrera', status: 'OPEN_FOR_ENROLLMENT' },
    ],
    schedules: [{ id: 'schedule-1', course_offering_id: 'off-1' }],
    teachingAssignments: [{ id: 'teacher-1', course_offering_id: 'off-1' }],
    prerequisites: [{ id: 'prereq-1', subject_id: 'subject-1' }],
    enrollments: [{ id: 'enrollment-1', student_id: 'student-1', course_offering_id: 'off-1' }],
    commandRequests: [{ result_payload: { status: 'ALREADY_EXISTED', rejections: [{ code: 'PREREQUISITES_NOT_MET' }] } }],
    auditEvents: [],
    metrics: { relations: 1 },
    ...overrides,
  }
}

describe('student course enrollment preview model', () => {
  it('muestra solo ofertas de la institucion, carrera y plan del vinculo', () => {
    const model = buildStudentCourseEnrollmentPreviewModel(raw())
    expect(model.offerings.map((item) => item.id)).toEqual(['off-1'])
    expect(getOfferingDetails(model, 'off-1')).toEqual(expect.objectContaining({
      enrollment: expect.objectContaining({ id: 'enrollment-1' }),
      schedules: [expect.objectContaining({ id: 'schedule-1' })],
      teachers: [expect.objectContaining({ id: 'teacher-1' })],
      prerequisites: [expect.objectContaining({ id: 'prereq-1' })],
    }))
  })

  it('traduce rechazos y contabiliza duplicados evitados', () => {
    expect(getEnrollmentRejectionMessage('PREREQUISITES_NOT_MET')).toEqual(expect.objectContaining({
      code: 'PREREQUISITES_NOT_MET',
      message: expect.stringContaining('correlatividad'),
    }))
    const model = buildStudentCourseEnrollmentPreviewModel(raw())
    expect(model.rejectionCounts.PREREQUISITES_NOT_MET).toBe(1)
    expect(model.metrics.duplicateRequestsAvoided).toBe(1)
  })

  it('conserva ambiguedades legacy y no crea relaciones', () => {
    const model = buildStudentCourseEnrollmentPreviewModel(raw({ relations: [], selectedRelationId: null, offerings: [], enrollments: [] }), {
      legacyInputs: {
        studentRecords: [{ id: 'legacy-1', institution_id: 'inst-1', email: 'student@example.test', career: 'Carrera A' }],
        profiles: [
          { user_id: 'student-1', email: 'student@example.test', account_role: 'alumno' },
          { user_id: 'student-2', email: 'student@example.test', account_role: 'alumno' },
        ],
        memberships: [
          { institution_id: 'inst-1', user_id: 'student-1' },
          { institution_id: 'inst-1', user_id: 'student-2' },
        ],
      },
    })
    expect(model.diagnostics.status).toBe('AMBIGUOUS')
    expect(model.legacyDiagnostic.rows[0].status).toBe('AMBIGUOUS_STUDENT')
    expect(model.diagnostics.relationalLinkCommandAvailable).toBe(true)
    expect(model.diagnostics.automaticLegacyLinkAllowed).toBe(false)
  })
})
