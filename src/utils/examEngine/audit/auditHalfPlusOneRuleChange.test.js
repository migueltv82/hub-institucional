import { describe, expect, it } from 'vitest'
import { auditHalfPlusOneRuleChange } from './auditHalfPlusOneRuleChange.js'

function buildSnapshot() {
  return {
    docentes: [
      { id: 'doc-sensitive-1', full_name: 'Nombre Personal Uno' },
      { id: 'doc-sensitive-2', full_name: 'Nombre Personal Dos' },
    ],
    horariosDocentes: [
      {
        profesor: 'Nombre Personal Uno',
        carrera: 'Carrera A',
        materia: 'Materia A',
        dia: 'Lunes',
        inicio: '18:20',
        fin: '19:40',
      },
      {
        profesor: 'Nombre Personal Uno',
        carrera: 'Carrera A',
        materia: 'Materia B',
        dia: 'Martes',
        inicio: '19:40',
        fin: '21:10',
      },
      {
        profesor: 'Nombre Personal Dos',
        carrera: 'Carrera A',
        materia: 'Materia C',
        dia: 'Miercoles',
        inicio: 'sin hora',
        fin: '21:10',
      },
    ],
    planesEstudio: [
      { id: 'mat-a', carrera: 'Carrera A', materia: 'Materia A' },
      { id: 'mat-b', carrera: 'Carrera A', materia: 'Materia B' },
      { id: 'mat-c', carrera: 'Carrera A', materia: 'Materia C' },
    ],
    correlatividades: [],
    fechaInicio: '2026-07-27',
    fechaFin: '2026-07-31',
  }
}

describe('auditHalfPlusOneRuleChange', () => {
  it('compara limites por dias y horas catedra', () => {
    const result = auditHalfPlusOneRuleChange({ snapshot: buildSnapshot() })
    const increased = result.teacherComparisons.find((row) => row.capacityChange === 'INCREASED')

    expect(result.summary).toMatchObject({
      totalTeachers: 2,
      increasedCapacityTeachers: 1,
      teachersWithoutTeachingHours: 1,
      ruleScope: 'COMMON_VOCALIAS_PER_CALL',
      attendanceEligibilityMaintained: true,
    })
    expect(increased).toMatchObject({
      attendanceDays: 2,
      teachingHours: 4,
      legacyDaysBasedLimit: 2,
      teachingHoursBasedLimit: 3,
    })
  })

  it('marca la fuente inferida desde horarios', () => {
    const result = auditHalfPlusOneRuleChange({ snapshot: buildSnapshot() })

    expect(result.templateDiagnostics.horariosDocentes).toMatchObject({
      totalRows: 3,
      inferableRows: 2,
      sourceCode: 'TEACHING_HOURS_INFERRED_FROM_SCHEDULE',
    })
  })

  it('mantiene identificadores anonimos y no expone nombres en diagnosticos', () => {
    const result = auditHalfPlusOneRuleChange({ snapshot: buildSnapshot() })
    const serialized = JSON.stringify({
      summary: result.summary,
      teacherComparisons: result.teacherComparisons,
      riskCases: result.riskCases,
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(result.teacherComparisons.every((row) => row.teacherAnonId.startsWith('DOC-'))).toBe(true)
    expect(serialized).not.toContain('Nombre Personal Uno')
    expect(serialized).not.toContain('Nombre Personal Dos')
  })

  it('no muta el snapshot original', () => {
    const snapshot = buildSnapshot()
    const original = structuredClone(snapshot)

    auditHalfPlusOneRuleChange({ snapshot })

    expect(snapshot).toEqual(original)
  })
})
