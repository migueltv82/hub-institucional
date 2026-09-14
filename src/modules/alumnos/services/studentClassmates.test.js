import { describe, expect, it } from 'vitest'
import { buildStudentClassmateGroups } from './studentClassmates.js'

const PROGRAM = 'Profesorado de Ingles'
const currentStudent = {
  id: 'student-1',
  profile_id: 'student-1',
  record_id: 'record-1',
  email: 'maria@example.com',
  full_name: 'Maria Gonzalez Lelong',
}
const subjects = [{
  id: 'ING01',
  canonical_subject_id: 'ING01',
  subject_id: 'ING01',
  code: 'ING01',
  name: 'Lengua Inglesa I',
  program_id: PROGRAM,
  canonical_program_id: PROGRAM,
}]

describe('buildStudentClassmateGroups', () => {
  it('agrupa solo companieros activos de las materias que cursa el alumno', () => {
    const groups = buildStudentClassmateGroups({
      currentStudent,
      subjects,
      enrollments: [{
        id: 'current-enrollment',
        student_id: 'student-1',
        subject_id: 'ING01',
        program_id: PROGRAM,
        status: 'active',
      }],
      workspaceSnapshot: {
        enrollments: [
          { student_id: 'student-1', email: 'maria@example.com', full_name: 'Maria Gonzalez Lelong', subject_id: 'ING01', program_id: PROGRAM, status: 'active' },
          { student_id: 'student-2', full_name: 'Ana Perez', subject_id: 'ING01', program_id: PROGRAM, status: 'active' },
          { student_id: 'student-3', full_name: 'Belen Diaz', subject_id: 'ING01', program_id: PROGRAM, status: 'enrolled' },
          { student_id: 'student-4', full_name: 'Carlos Ruiz', subject_id: 'ING01', program_id: PROGRAM, status: 'dropped' },
          { student_id: 'student-5', full_name: 'Dario Paz', subject_id: 'ING02', program_id: PROGRAM, status: 'active' },
        ],
      },
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].subject.name).toBe('Lengua Inglesa I')
    expect(groups[0].classmates.map((student) => student.full_name)).toEqual(['Ana Perez', 'Belen Diaz'])
  })

  it('usa los grupos seguros de la RPC cuando existen', () => {
    const groups = buildStudentClassmateGroups({
      currentStudent,
      subjects,
      enrollments: [{ student_id: 'student-1', subject_id: 'ING01', program_id: PROGRAM, status: 'active' }],
      workspaceSnapshot: {
        courseClassmates: [{
          subject_id: 'ING01',
          program_id: PROGRAM,
          classmates: [
            { id: 'student-2', full_name: 'Ana Perez' },
            { id: 'student-2', full_name: 'Ana Perez' },
          ],
        }],
      },
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].classmates).toEqual([{ id: 'student-2', full_name: 'Ana Perez' }])
  })
})
