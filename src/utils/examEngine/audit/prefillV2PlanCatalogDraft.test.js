import { describe, expect, it } from 'vitest'
import {
  V2_PLAN_CATALOG_DRAFT_OBSERVATION,
  V2_PLAN_CATALOG_DRAFT_STATUS,
  prefillV2PlanCatalogDraft,
} from './prefillV2PlanCatalogDraft.js'

function planRow(overrides = {}) {
  return {
    carrera_id: 'ING',
    carrera_nombre: 'Profesorado de Ingles',
    materias_requeridas: '35',
    plan_id_sugerido: 'ING-PLAN-ACTUAL',
    plan_id_final: '',
    plan_nombre_final: '',
    anio_plan: '',
    resolucion_plan: '',
    estado_revision: 'PENDIENTE',
    observaciones_revision: '',
    ...overrides,
  }
}

describe('prefillV2PlanCatalogDraft', () => {
  it('precarga ING con ING-2026', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [planRow()],
    })

    expect(result.prefilledRows).toEqual([
      expect.objectContaining({
        carrera_id: 'ING',
        plan_id_final: 'ING-2026',
        anio_plan: '2026',
        estado_revision: V2_PLAN_CATALOG_DRAFT_STATUS,
        observaciones_revision: V2_PLAN_CATALOG_DRAFT_OBSERVATION,
      }),
    ])
  })

  it('precarga GEO, QUI, TUR y TRA', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [
        planRow({ carrera_id: 'GEO', materias_requeridas: '7' }),
        planRow({ carrera_id: 'QUI', materias_requeridas: '31' }),
        planRow({ carrera_id: 'TUR', materias_requeridas: '33' }),
        planRow({ carrera_id: 'TRA', materias_requeridas: '28' }),
      ],
    })

    expect(result.prefilledRows.map((row) => row.plan_id_final)).toEqual([
      'GEO-2026',
      'QUI-2026',
      'TUR-2026',
      'TRA-2026',
    ])
  })

  it('no marca CONFIRMADO automaticamente', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [planRow()],
    })

    expect(result.prefilledRows[0].estado_revision).not.toBe('CONFIRMADO')
    expect(result.summary.confirmedRows).toBe(0)
  })

  it('usa PRECONFIRMAR', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [planRow()],
    })

    expect(result.prefilledRows[0].estado_revision).toBe('PRECONFIRMAR')
    expect(result.summary.preconfirmarRows).toBe(1)
  })

  it('no pisa plan_id_final existente si overwrite es false', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [
        planRow({
          plan_id_final: 'ING-2024',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.skippedRows[0]).toMatchObject({
      plan_id_final: 'ING-2024',
      prefill_skip_reason: 'PLAN_ID_FINAL_EXISTENTE',
    })
  })

  it('pisa plan_id_final existente solo con overwrite true', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [
        planRow({
          plan_id_final: 'ING-2024',
        }),
      ],
      options: { overwrite: true },
    })

    expect(result.prefilledRows[0].plan_id_final).toBe('ING-2026')
  })

  it('omite carrera sin materias requeridas', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [
        planRow({
          carrera_id: 'LAB',
          materias_requeridas: '0',
          plan_id_sugerido: 'LAB-PLAN-ACTUAL',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.skippedRows[0].prefill_skip_reason).toBe('SIN_MATERIAS_REQUERIDAS')
    expect(result.summary.careersWithoutSubjects).toBe(1)
  })

  it('marca readyForPlanApply false', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [planRow()],
    })

    expect(result.summary.readyForPlanApply).toBe(false)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('no muta inputs', () => {
    const planRows = [planRow()]
    const before = JSON.stringify(planRows)

    prefillV2PlanCatalogDraft({ planRows })

    expect(JSON.stringify(planRows)).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = prefillV2PlanCatalogDraft({
      planRows: [
        planRow({
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
