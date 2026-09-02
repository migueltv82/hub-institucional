import { describe, expect, it } from 'vitest'
import { getAcademicRows } from './StudentDashboardPage.jsx'

const PROGRAM_ID = 'program-1'

function subject(id, name) {
  return {
    id,
    canonical_subject_id: id,
    subject_id: id,
    code: id,
    name,
    canonical_program_id: PROGRAM_ID,
    program_id: PROGRAM_ID,
    semester: 1,
  }
}

function enrollment(subjectId, status, academicStatus) {
  return {
    id: `enrollment-${subjectId}`,
    canonical_subject_id: subjectId,
    subject_id: subjectId,
    program_id: PROGRAM_ID,
    status,
    academic_status: academicStatus,
    enrolled_at: '2026-03-10',
  }
}

describe('StudentDashboardPage certificate rows', () => {
  it('incluye todo el plan sin usar cursando ni fecha de cursada como dato academico', () => {
    const rows = getAcademicRows({
      subjects: [
        subject('CURSANDO-1', 'Practica Docente I'),
        subject('REGULAR-1', 'Didactica General'),
        subject('APROBADA-1', 'Lengua Inglesa I'),
      ],
      enrollments: [
        enrollment('CURSANDO-1', 'active'),
        {
          ...enrollment('REGULAR-1', 'active', 'regular'),
          regularity_date: '2026-07-30',
        },
        enrollment('APROBADA-1', 'completed', 'approved'),
      ],
      grades: [{
        id: 'final-aprobada',
        enrollment_id: 'enrollment-APROBADA-1',
        subject_id: 'APROBADA-1',
        program_id: PROGRAM_ID,
        grade_type: 'final',
        score: 8,
        academic_status: 'approved',
        graded_at: '2026-08-20',
      }],
      programId: PROGRAM_ID,
    })

    expect(rows.map((row) => row.name)).toEqual([
      'Practica Docente I',
      'Didactica General',
      'Lengua Inglesa I',
    ])
    expect(rows.find((row) => row.code === 'CURSANDO-1')).toMatchObject({
      status: 'Pendiente',
      certificateStatus: 'pending',
      regularityDate: '',
      finalDate: '',
    })
    expect(rows.find((row) => row.code === 'REGULAR-1')).toMatchObject({
      status: 'Regular',
      regularityDate: '30/07/26',
      finalDate: '',
    })
    expect(rows.find((row) => row.code === 'APROBADA-1')).toMatchObject({
      status: 'Aprobada',
      score: 8,
      finalDate: '20/08/26',
    })
  })
})
