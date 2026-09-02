import { describe, expect, it } from 'vitest'
import { buildV2PlanCatalogReview } from './buildV2PlanCatalogReview.js'

function subjectRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_sugerido: 'ING',
    materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    plan_id_sugerido: 'ING-PLAN-ACTUAL',
    materia_codigo_sugerido: 'ING-3-PDIII',
    riesgo_nombre_duplicado: 'NO',
    ...overrides,
  }
}

function workpackSummary(overrides = {}) {
  return {
    rowsByCareer: {
      ING: 2,
      GEO: 1,
      LAB: 0,
    },
    ...overrides,
  }
}

describe('buildV2PlanCatalogReview', () => {
  it('genera una fila por carrera con materias requeridas', () => {
    const result = buildV2PlanCatalogReview({
      workpackSummary: workpackSummary(),
      subjectIdentityRows: [
        subjectRow({ review_id: 'v2_subject_001', carrera_id_sugerido: 'ING' }),
        subjectRow({ review_id: 'v2_subject_002', carrera_id_sugerido: 'ING' }),
        subjectRow({
          review_id: 'v2_subject_003',
          carrera: 'Profesorado de Geografia',
          carrera_id_sugerido: 'GEO',
          plan_id_sugerido: 'GEO-PLAN-ACTUAL',
        }),
      ],
    })

    expect(result.planRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        carrera_id: 'ING',
        materias_requeridas: 2,
        plan_id_sugerido: 'ING-PLAN-ACTUAL',
      }),
      expect.objectContaining({
        carrera_id: 'GEO',
        materias_requeridas: 1,
      }),
      expect.objectContaining({
        carrera_id: 'LAB',
        materias_requeridas: 0,
      }),
    ]))
    expect(result.summary.totalRequiredSubjects).toBe(3)
  })

  it('no pone plan_id_final automaticamente', () => {
    const result = buildV2PlanCatalogReview({
      workpackSummary: workpackSummary(),
      subjectIdentityRows: [subjectRow()],
    })

    expect(result.planRows[0]).toMatchObject({
      plan_id_final: '',
      estado_revision: 'PENDIENTE',
    })
  })

  it('marca readyForPlanApply false si hay planes pendientes', () => {
    const result = buildV2PlanCatalogReview({
      workpackSummary: workpackSummary(),
      subjectIdentityRows: [subjectRow()],
    })

    expect(result.summary.pendingPlans).toBe(2)
    expect(result.summary.readyForPlanApply).toBe(false)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('acepta subjectIdentityRows envuelto en reviewRows', () => {
    const result = buildV2PlanCatalogReview({
      workpackSummary: { workpackSummary: workpackSummary() },
      subjectIdentityRows: {
        reviewRows: [
          subjectRow({
            carrera: 'Profesorado de Quimica',
            carrera_id_sugerido: 'QUI',
            plan_id_sugerido: 'QUI-PLAN-ACTUAL',
          }),
        ],
      },
    })

    expect(result.planRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        carrera_id: 'QUI',
        carrera_nombre: 'Profesorado de Quimica',
        materias_requeridas: 1,
      }),
    ]))
  })

  it('no muta inputs', () => {
    const summary = workpackSummary()
    const rows = [subjectRow()]
    const before = JSON.stringify({ summary, rows })

    buildV2PlanCatalogReview({
      workpackSummary: summary,
      subjectIdentityRows: rows,
    })

    expect(JSON.stringify({ summary, rows })).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = buildV2PlanCatalogReview({
      workpackSummary: workpackSummary(),
      subjectIdentityRows: [
        subjectRow({
          docente: 'Nombre Personal Reservado',
          alumno: 'Alumno Personal Reservado',
        }),
      ],
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(serialized).not.toContain('Alumno Personal Reservado')
  })
})
