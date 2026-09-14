import { describe, expect, it } from 'vitest'
import { buildInstitutionCareerBreakdown } from './institutionInsights.js'

describe('institutionInsights', () => {
  it('unifica variantes abreviadas de carreras institucionales en la distribucion', () => {
    const result = buildInstitutionCareerBreakdown({
      students: [
        { career: 'TECNICO SUPERIOR EN TURISMO', email: 'ana@example.com' },
        { career: 'TECNICO SUPERIOR EN TURISMO', email: 'bruno@example.com' },
      ],
      teachers: [
        { raw_payload: { carreras: ['TECNICO SUP EN TURISMO'] }, dni: '1' },
        { raw_payload: { carreras: ['TECNICO SUPER EN TURISMO'] }, dni: '2' },
      ],
    })

    expect(result).toEqual([
      {
        name: 'TECNICO SUPERIOR EN TURISMO',
        student_count: 2,
        teacher_count: 2,
      },
    ])
  })
})
