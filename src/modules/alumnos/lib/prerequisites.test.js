import { describe, expect, it } from 'vitest'
import { getPrerequisiteCheck } from './prerequisites.js'

const PROGRAM = 'Profesorado de Ingles'

describe('getPrerequisiteCheck', () => {
  it('resuelve correlativas con canonical_subject_id y programa de la materia requerida', () => {
    const subjects = [
      {
        canonical_subject_id: 'ING01',
        canonical_program_id: PROGRAM,
        code: 'ING01',
        name: 'Lengua Inglesa I',
      },
      {
        canonical_subject_id: 'ING02',
        canonical_program_id: PROGRAM,
        code: 'ING02',
        name: 'Lengua Inglesa II',
      },
    ]

    const result = getPrerequisiteCheck({
      subjectId: 'ING02',
      prerequisites: [{
        subject_id: 'ING02',
        prerequisite_subject_id: 'ING01',
        requirement_type: 'regular',
      }],
      grades: [{
        subject_id: 'ING01',
        program_id: PROGRAM,
        academic_status: 'regular',
        updated_at: '2026-08-01T10:00:00.000Z',
      }],
      subjects,
    })

    expect(result.canEnroll).toBe(true)
    expect(result.missing).toEqual([])
  })
})
