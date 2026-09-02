import { describe, expect, it } from 'vitest'
import { auditLegacyCompaction } from './auditLegacyCompaction.js'

function groupedMesa(overrides = {}) {
  return {
    carrera: 'Carrera A',
    anio: '1',
    llamado: 'Primer llamado',
    profesorTitular: 'Docente Personal Reservado',
    vocal1: 'Vocal Personal Uno',
    vocal2: 'Vocal Personal Dos',
    materiasAgrupadas: [
      {
        carrera: 'Carrera A',
        anio: '1',
        plan_id: 'PLAN-A',
        materia_codigo: 'MAT-1',
        nombreMateria: 'Materia Uno',
        profesorTitular: 'Docente Personal Reservado',
      },
      {
        carrera: 'Carrera A',
        anio: '1',
        plan_id: 'PLAN-A',
        materia_codigo: 'MAT-2',
        nombreMateria: 'Materia Dos',
        profesorTitular: 'Docente Personal Reservado',
      },
    ],
    ...overrides,
  }
}

function universeComparison(overrides = {}) {
  return {
    summary: {
      legacyMesas: 1,
      examEngineRawMesas: 2,
    },
    scenarios: {
      examEngine_raw: {
        subjectSets: {
          requiredKeys: [
            'plan:plana::materia:mat1',
            'plan:plana::materia:mat2',
          ],
          notRequiredKeys: [],
          finalOccurrences: {
            'plan:plana::materia:mat1': {
              occurrences: 1,
              calls: ['Primer llamado'],
            },
            'plan:plana::materia:mat2': {
              occurrences: 1,
              calls: ['Primer llamado'],
            },
          },
        },
      },
    },
    ...overrides,
  }
}

describe('auditLegacyCompaction', () => {
  it('detecta grupo compactado', () => {
    const result = auditLegacyCompaction({
      legacyResult: [groupedMesa()],
      universeComparison: universeComparison(),
    })

    expect(result.summary.legacyCompactionCases).toBe(1)
    expect(result.summary.legacyPreCompactionOccurrences).toBe(2)
    expect(result.summary.legacyReductionByCompaction).toBe(1)
    expect(result.compactionCases[0]).toMatchObject({
      legacy_occurrences: 2,
      legacy_final_tables: 1,
    })
  })

  it('clasifica compactacion por misma materia', () => {
    const result = auditLegacyCompaction({
      legacyResult: [
        groupedMesa({
          materiasAgrupadas: [
            {
              carrera: 'Carrera A',
              anio: '1',
              plan_id: 'PLAN-A',
              materia_codigo: 'MAT-1',
              nombreMateria: 'Materia Uno',
            },
            {
              carrera: 'Carrera A',
              anio: '1',
              plan_id: 'PLAN-A',
              materia_codigo: 'MAT-1',
              nombreMateria: 'Materia Uno',
            },
          ],
        }),
      ],
      universeComparison: universeComparison(),
    })

    expect(result.compactionCases[0].classification).toBe('SAME_SUBJECT_MULTIPLE_STUDENTS')
  })

  it('marca riesgo cuando usa clave debil', () => {
    const result = auditLegacyCompaction({
      legacyResult: [
        groupedMesa({
          materiasAgrupadas: [
            { carrera: 'Carrera A', anio: '1', nombreMateria: 'Materia Uno' },
            { carrera: 'Carrera A', anio: '1', nombreMateria: 'Materia Dos' },
          ],
        }),
      ],
      universeComparison: universeComparison(),
    })

    expect(result.compactionCases[0]).toMatchObject({
      weak_key_risk: true,
      safety: 'DO_NOT_REPLICATE_WITHOUT_PLAN_ID',
    })
  })

  it('marca Laboratorio como riesgo si falta plan_id', () => {
    const result = auditLegacyCompaction({
      legacyResult: [
        groupedMesa({
          carrera: 'Tecnicatura Superior en Laboratorio',
          materiasAgrupadas: [
            {
              carrera: 'Tecnicatura Superior en Laboratorio',
              anio: '1',
              nombreMateria: 'Quimica General',
            },
            {
              carrera: 'Tecnicatura Superior en Laboratorio',
              anio: '1',
              nombreMateria: 'Laboratorio I',
            },
          ],
        }),
      ],
      universeComparison: universeComparison(),
    })

    expect(result.compactionCases[0]).toMatchObject({
      laboratorio_multiplan_risk: true,
      safety: 'DO_NOT_REPLICATE_WITHOUT_PLAN_ID',
    })
  })

  it('marca caso seguro si existe clave fuerte', () => {
    const result = auditLegacyCompaction({
      legacyResult: [
        groupedMesa({
          materiasAgrupadas: [
            {
              carrera: 'Carrera A',
              anio: '1',
              plan_id: 'PLAN-A',
              materia_codigo: 'MAT-1',
              nombreMateria: 'Materia Uno',
            },
            {
              carrera: 'Carrera A',
              anio: '1',
              plan_id: 'PLAN-A',
              materia_codigo: 'MAT-1',
              nombreMateria: 'Materia Uno',
            },
          ],
        }),
      ],
      universeComparison: universeComparison(),
    })

    expect(result.compactionCases[0]).toMatchObject({
      weak_key_risk: false,
      safety: 'SAFE_TO_REPLICATE',
    })
  })

  it('genera recomendacion de revision si compacta materias distintas', () => {
    const result = auditLegacyCompaction({
      legacyResult: [groupedMesa()],
      universeComparison: universeComparison(),
    })

    expect(result.compactionCases[0].classification).toBe('SAME_TEACHER_MULTIPLE_SUBJECTS')
    expect(result.compactionCases[0].recommendation).toContain('Revisar institucionalmente')
  })

  it('no muta snapshot original', () => {
    const snapshot = {
      planesEstudio: [
        {
          carrera: 'Carrera A',
          materia: 'MAT-1',
          nombre: 'Materia Uno',
        },
      ],
    }
    const before = JSON.stringify(snapshot)

    auditLegacyCompaction({
      snapshot,
      legacyResult: [groupedMesa()],
      universeComparison: universeComparison(),
    })

    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('no expone nombres completos en warnings/errors', () => {
    const result = auditLegacyCompaction({
      legacyResult: [groupedMesa()],
      universeComparison: universeComparison(),
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
      rootCauseAnalysis: result.rootCauseAnalysis,
    })

    expect(serialized).not.toContain('Docente Personal Reservado')
    expect(serialized).not.toContain('Vocal Personal Uno')
  })

  it('genera summary con safeToReplaceLegacy false si hay compactaciones riesgosas', () => {
    const result = auditLegacyCompaction({
      legacyResult: [
        groupedMesa({
          materiasAgrupadas: [
            { carrera: 'Carrera A', anio: '1', nombreMateria: 'Materia Uno' },
            { carrera: 'Carrera A', anio: '1', nombreMateria: 'Materia Dos' },
          ],
        }),
      ],
      universeComparison: universeComparison(),
    })

    expect(result.summary.safeToReplaceLegacy).toBe(false)
    expect(result.summary.doNotReplicateWithoutPlanId).toBe(1)
  })
})
