import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRANSITION_CONFIG,
  overlaySnapshotWithRelationalAcademicData,
} from './academicRelationalData.js'
import { mapWorkspaceSnapshotToStudentStore } from './studentPortalData.js'

describe('academicRelationalData', () => {
  it('usa filas relacionales cuando la lectura hibrida esta activa y mantiene el formato del portal', () => {
    const snapshot = {
      planesEstudio: [{
        carrera: 'Profesorado',
        materia: 'ING1',
        nombre: 'Ingles I',
        anio: 1,
      }],
      enrollments: [{
        id: 'legacy-old',
        profile_id: 'user-1',
        subject_id: 'profesorado:ing1',
        program_id: 'profesorado',
        status: 'dropped',
      }],
      examEnrollments: [],
      grades: [],
    }

    const effectiveSnapshot = overlaySnapshotWithRelationalAcademicData({
      snapshot,
      transitionConfig: {
        ...DEFAULT_TRANSITION_CONFIG,
        stage: 'hybrid_read',
        readMode: 'hybrid_read',
        hybridReadEnabled: true,
      },
      relationalData: {
        enrollments: [{
          id: 'legacy-active',
          relational_id: 'rel-enrollment-1',
          profile_id: 'user-1',
          student_id: 'user-1',
          institution_id: 'inst-1',
          subject_id: 'ING1',
          program_id: 'Profesorado',
          status: 'active',
          enrolled_at: '2026-05-19T12:00:00.000Z',
        }],
        examEnrollments: [{
          id: 'legacy-exam-1',
          relational_id: 'rel-exam-1',
          profile_id: 'user-1',
          student_id: 'user-1',
          institution_id: 'inst-1',
          exam_session_id: 'exam-1',
          exam_table_id: 'exam-1',
          status: 'registered',
        }],
        grades: [{
          id: 'grade-1',
          profile_id: 'user-1',
          student_id: 'user-1',
          institution_id: 'inst-1',
          subject_id: 'ING1',
          enrollment_id: 'legacy-active',
          grade_type: 'final',
          score: 9,
          max_score: 10,
        }],
      },
    })

    const result = mapWorkspaceSnapshotToStudentStore({
      snapshot: effectiveSnapshot,
      rosterRows: [{
        record_id: 'student-record-1',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        carrera: 'Profesorado',
      }],
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana Perez',
      },
      activeInstitution: {
        id: 'inst-1',
        name: 'Instituto',
      },
      academicTransition: effectiveSnapshot.academicRelationalSource,
    })

    expect(result.enrollments).toEqual([
      expect.objectContaining({
        id: 'legacy-active',
        subject_id: 'ING1',
        program_id: 'Profesorado',
        status: 'active',
      }),
    ])
    expect(result.examEnrollments).toEqual([
      expect.objectContaining({
        id: 'legacy-exam-1',
        exam_session_id: 'exam-1',
      }),
    ])
    expect(result.grades).toEqual([
      expect.objectContaining({
        enrollment_id: 'legacy-active',
        score: 9,
      }),
    ])
    expect(result.academicTransition).toEqual(expect.objectContaining({
      stage: 'hybrid_read',
      usedRelational: true,
    }))
  })

  it('mantiene snapshot como fallback si no hay filas relacionales', () => {
    const snapshot = {
      enrollments: [{
        id: 'legacy-enrollment',
        profile_id: 'user-1',
        subject_id: 'profesorado:ing1',
        status: 'active',
      }],
      examEnrollments: [{
        id: 'legacy-exam',
        profile_id: 'user-1',
        exam_session_id: 'exam-1',
        status: 'registered',
      }],
      grades: [{
        id: 'legacy-grade',
        enrollment_id: 'legacy-enrollment',
        grade_type: 'final',
        score: 8,
      }],
    }

    const effectiveSnapshot = overlaySnapshotWithRelationalAcademicData({
      snapshot,
      transitionConfig: {
        ...DEFAULT_TRANSITION_CONFIG,
        stage: 'hybrid_read',
        readMode: 'hybrid_read',
        hybridReadEnabled: true,
        snapshotFallbackEnabled: true,
      },
      relationalData: {
        enrollments: [],
        examEnrollments: [],
        grades: [],
      },
    })

    expect(effectiveSnapshot.enrollments).toEqual(snapshot.enrollments)
    expect(effectiveSnapshot.examEnrollments).toEqual(snapshot.examEnrollments)
    expect(effectiveSnapshot.grades).toEqual(snapshot.grades)
    expect(effectiveSnapshot.academicRelationalSource).toEqual(expect.objectContaining({
      usedRelational: false,
      fallbackEnabled: true,
    }))
  })

  it('usa como autoritativa una lectura relacional vacia de inscripciones', () => {
    const snapshot = {
      enrollments: [{ id: 'legacy-stale', subject_id: 'ING06', status: 'active' }],
      examEnrollments: [],
      grades: [],
    }

    const effectiveSnapshot = overlaySnapshotWithRelationalAcademicData({
      snapshot,
      transitionConfig: DEFAULT_TRANSITION_CONFIG,
      relationalData: {
        enrollments: [],
        enrollmentsLoaded: true,
        examEnrollments: [],
        grades: [],
      },
    })

    expect(effectiveSnapshot.enrollments).toEqual([])
    expect(effectiveSnapshot.academicRelationalSource.enrollmentsLoaded).toBe(true)
  })
})
