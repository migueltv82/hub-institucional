import { describe, expect, it } from 'vitest'
import {
  V2_PLAN_CATALOG_APPLIED_OBSERVATION,
  applyV2PlanCatalogToSubjectWorkpack,
} from './applyV2PlanCatalogToSubjectWorkpack.js'

function subjectRow(overrides = {}) {
  return {
    prioridad: 'MEDIA',
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_sugerido: 'ING',
    carrera_id_final: '',
    anio: '3',
    materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    plan_id_sugerido: 'ING-PLAN-ACTUAL',
    plan_id_final: '',
    materia_codigo_sugerido: 'ING-3-PDIII',
    materia_codigo_final: '',
    estado_revision: '',
    riesgo_nombre_duplicado: 'NO',
    motivo_revision: 'WEAK_KEY|REQUIERE_CODIGO_OFICIAL',
    accion_requerida: 'COMPLETAR_PLAN_ID_Y_MATERIA_CODIGO_OFICIAL',
    observaciones_revision: '',
    ...overrides,
  }
}

function planRow(overrides = {}) {
  return {
    carrera_id: 'ING',
    carrera_nombre: 'Profesorado de Ingles',
    materias_requeridas: '35',
    plan_id_sugerido: 'ING-PLAN-ACTUAL',
    plan_id_final: 'ING-2026',
    plan_nombre_final: 'Plan 2026',
    anio_plan: '2026',
    resolucion_plan: '',
    estado_revision: 'CONFIRMADO',
    observaciones_revision: '',
    ...overrides,
  }
}

describe('applyV2PlanCatalogToSubjectWorkpack', () => {
  it('aplica plan confirmado a materias de esa carrera', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [subjectRow()],
      planCatalogRows: [planRow()],
    })

    expect(result.updatedRows).toEqual([
      expect.objectContaining({
        plan_id_final: 'ING-2026',
        estado_revision: 'PRECONFIRMAR_PLAN',
        observaciones_revision: V2_PLAN_CATALOG_APPLIED_OBSERVATION,
      }),
    ])
    expect(result.summary.updatedRows).toBe(1)
  })

  it('acepta estados APROBADO, VALIDADO y OK como confirmados', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [
        subjectRow({ review_id: 'v2_subject_001', carrera_id_sugerido: 'GEO' }),
        subjectRow({ review_id: 'v2_subject_002', carrera_id_sugerido: 'QUI' }),
        subjectRow({ review_id: 'v2_subject_003', carrera_id_sugerido: 'TUR' }),
      ],
      planCatalogRows: [
        planRow({ carrera_id: 'GEO', plan_id_final: 'GEO-2026', estado_revision: 'APROBADO' }),
        planRow({ carrera_id: 'QUI', plan_id_final: 'QUI-2026', estado_revision: 'VALIDADO' }),
        planRow({ carrera_id: 'TUR', plan_id_final: 'TUR-2026', estado_revision: 'OK' }),
      ],
    })

    expect(result.updatedRows.map((row) => row.plan_id_final)).toEqual([
      'GEO-2026',
      'QUI-2026',
      'TUR-2026',
    ])
  })

  it('no aplica plan pendiente', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [subjectRow()],
      planCatalogRows: [planRow({ estado_revision: 'PENDIENTE' })],
    })

    expect(result.updatedRows).toHaveLength(0)
    expect(result.pendingRows[0].plan_apply_pending_reason).toBe('PLAN_NO_CONFIRMADO_O_INVALIDO')
  })

  it('no aplica catalogo PRECONFIRMAR', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [subjectRow()],
      planCatalogRows: [planRow({ estado_revision: 'PRECONFIRMAR' })],
    })

    expect(result.updatedRows).toHaveLength(0)
    expect(result.pendingRows[0].plan_apply_pending_reason).toBe('PLAN_NO_CONFIRMADO_O_INVALIDO')
  })

  it('no aplica placeholder PLAN-ACTUAL', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [subjectRow()],
      planCatalogRows: [planRow({ plan_id_final: 'ING-PLAN-ACTUAL' })],
    })

    expect(result.updatedRows).toHaveLength(0)
    expect(result.pendingRows[0].plan_apply_pending_reason).toBe('PLAN_NO_CONFIRMADO_O_INVALIDO')
  })

  it('no aplica plan con alternativas', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [subjectRow()],
      planCatalogRows: [planRow({ plan_id_final: 'ING-2026|ING-2027' })],
    })

    expect(result.updatedRows).toHaveLength(0)
    expect(result.pendingRows[0].plan_apply_pending_reason).toBe('PLAN_NO_CONFIRMADO_O_INVALIDO')
  })

  it('no cambia materia_codigo_final', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [
        subjectRow({
          materia_codigo_final: '',
        }),
      ],
      planCatalogRows: [planRow()],
    })

    expect(result.updatedRows[0].materia_codigo_final).toBe('')
  })

  it('no confirma automaticamente la materia', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [subjectRow()],
      planCatalogRows: [planRow()],
    })

    expect(result.updatedRows[0].estado_revision).not.toBe('CONFIRMADO')
    expect(result.updatedRows[0].estado_revision).toBe('PRECONFIRMAR_PLAN')
  })

  it('no pisa plan_id_final existente por defecto', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [
        subjectRow({
          plan_id_final: 'ING-2024',
        }),
      ],
      planCatalogRows: [planRow({ plan_id_final: 'ING-2026' })],
    })

    expect(result.updatedRows).toHaveLength(0)
    expect(result.unchangedRows[0]).toMatchObject({
      plan_id_final: 'ING-2024',
      plan_apply_skip_reason: 'PLAN_ID_FINAL_EXISTENTE',
    })
  })

  it('pisa plan_id_final existente solo con overwrite true', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [
        subjectRow({
          plan_id_final: 'ING-2024',
        }),
      ],
      planCatalogRows: [planRow({ plan_id_final: 'ING-2026' })],
      options: { overwrite: true },
    })

    expect(result.updatedRows[0].plan_id_final).toBe('ING-2026')
  })

  it('no muta inputs', () => {
    const subjectRows = [subjectRow()]
    const planCatalogRows = [planRow()]
    const before = JSON.stringify({ subjectRows, planCatalogRows })

    applyV2PlanCatalogToSubjectWorkpack({ subjectRows, planCatalogRows })

    expect(JSON.stringify({ subjectRows, planCatalogRows })).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: [
        subjectRow({
          docente: 'Nombre Personal Reservado',
          alumno: 'Alumno Personal Reservado',
        }),
      ],
      planCatalogRows: [planRow()],
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(serialized).not.toContain('Alumno Personal Reservado')
  })
})
