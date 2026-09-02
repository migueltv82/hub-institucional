import { describe, expect, it } from 'vitest'
import { buildV2SubjectCodeReview } from './buildV2SubjectCodeReview.js'

function subjectRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_sugerido: 'ING',
    carrera_id_final: 'ING',
    plan_id_final: 'ING-2026',
    anio: '1',
    materia_nombre: 'Algebra I',
    materia_codigo_sugerido: 'ING-1-ALG',
    materia_codigo_final: '',
    estado_revision: 'PRECONFIRMAR_PLAN',
    riesgo_nombre_duplicado: 'NO',
    motivo_revision: '',
    accion_requerida: '',
    observaciones_revision: '',
    ...overrides,
  }
}

describe('buildV2SubjectCodeReview', () => {
  it('genera una fila por materia y conserva plan_id_final', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [
        subjectRow({ review_id: 'v2_subject_001' }),
        subjectRow({ review_id: 'v2_subject_002', materia_nombre: 'Fisica I', materia_codigo_sugerido: 'ING-1-FIS' }),
      ],
    })

    expect(result.reviewRows).toHaveLength(2)
    expect(result.reviewRows[0]).toMatchObject({
      plan_id_final: 'ING-2026',
    })
    expect(result.rowsByPlan['ING-2026']).toHaveLength(2)
  })

  it('copia el codigo sugerido a borrador, no a final', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [subjectRow()],
    })

    expect(result.reviewRows[0]).toMatchObject({
      materia_codigo_sugerido: 'ING-1-ALG',
      materia_codigo_borrador: 'ING-1-ALG',
      materia_codigo_final: '',
    })
  })

  it('no confirma automaticamente', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [subjectRow()],
    })

    expect(result.reviewRows[0]).toMatchObject({
      estado_revision: 'PENDIENTE_CODIGO',
      accion_requerida: 'COMPLETAR_Y_CONFIRMAR_MATERIA_CODIGO_FINAL',
    })
  })

  it('marca prioridad alta por homonimia', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [
        subjectRow({
          riesgo_nombre_duplicado: 'SI',
          motivo_revision: 'DUPLICATE_SUBJECT_NAME',
        }),
      ],
    })

    expect(result.reviewRows[0]).toMatchObject({
      riesgo_homonimia: 'SI',
      prioridad_revision: 'ALTA',
    })
    expect(result.summary.homonymyRows).toBe(1)
  })

  it('marca prioridad alta si falta codigo sugerido', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [
        subjectRow({
          materia_codigo_sugerido: '',
        }),
      ],
    })

    expect(result.reviewRows[0]).toMatchObject({
      materia_codigo_borrador: '',
      prioridad_revision: 'ALTA',
    })
    expect(result.reviewRows[0].motivo_revision).toContain('FALTA_MATERIA_CODIGO_SUGERIDO')
  })

  it('detecta duplicado de codigo borrador dentro del mismo plan', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [
        subjectRow({ review_id: 'v2_subject_001', materia_nombre: 'Algebra I', materia_codigo_sugerido: 'ING-1-DUP' }),
        subjectRow({ review_id: 'v2_subject_002', materia_nombre: 'Fisica I', materia_codigo_sugerido: 'ING-1-DUP' }),
      ],
    })

    expect(result.summary.duplicateDraftCodeRisks).toBe(2)
    expect(result.duplicateRiskRows).toHaveLength(2)
    expect(result.reviewRows.every((row) => row.riesgo_codigo_duplicado === 'SI')).toBe(true)
  })

  it('detecta duplicado de nombre dentro del mismo plan', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [
        subjectRow({ review_id: 'v2_subject_001', materia_codigo_sugerido: 'ING-1-ALG-A' }),
        subjectRow({ review_id: 'v2_subject_002', materia_codigo_sugerido: 'ING-1-ALG-B', materia_nombre: 'Algebra I' }),
      ],
    })

    expect(result.duplicateRiskRows).toHaveLength(2)
    expect(result.reviewRows[0].motivo_revision).toContain('NOMBRE_DUPLICADO_EN_PLAN')
    expect(result.reviewRows[1].prioridad_revision).toBe('ALTA')
  })

  it('marca readyForCodeApply false si faltan codigos finales', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [subjectRow()],
    })

    expect(result.summary.subjectsMissingFinalCode).toBe(1)
    expect(result.summary.readyForCodeApply).toBe(false)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('no muta inputs', () => {
    const rows = [subjectRow()]
    const before = JSON.stringify(rows)

    buildV2SubjectCodeReview({ subjectRows: rows })

    expect(JSON.stringify(rows)).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = buildV2SubjectCodeReview({
      subjectRows: [
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
