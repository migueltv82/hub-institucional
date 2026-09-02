import { describe, expect, it } from 'vitest'
import { applyV2HomonymyResolutions } from './applyV2HomonymyResolutions.js'

function baseRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_final: 'ING',
    plan_id_final: 'ING-2026',
    anio: '1',
    materia_nombre: 'Materia Base',
    materia_codigo_sugerido: 'ING-1-MAT',
    materia_codigo_borrador: 'ING-1-MAT',
    materia_codigo_final: '',
    estado_revision: 'PENDIENTE_CODIGO',
    riesgo_nombre_duplicado: 'SI',
    riesgo_codigo_duplicado: 'NO',
    riesgo_homonimia: 'SI',
    prioridad_revision: 'ALTA',
    motivo_revision: 'HOMONIMIA',
    accion_requerida: 'COMPLETAR_Y_CONFIRMAR_MATERIA_CODIGO_FINAL',
    observaciones_revision: 'Pendiente de revision',
    source_file: 'ING_codigos.csv',
    ...overrides,
  }
}

function resolutionRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_final: 'ING',
    plan_id_final: 'ING-2026',
    anio: '1',
    materia_nombre: 'Materia Base',
    materia_codigo_final: 'ING-1-MAT-OF',
    estado_revision: 'CONFIRMADO',
    observaciones_revision: 'Codigo confirmado por revision institucional',
    ...overrides,
  }
}

describe('applyV2HomonymyResolutions', () => {
  it('aplica resolucion confirmada por review_id', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [baseRow()],
      homonymyResolutionRows: [resolutionRow()],
    })

    expect(result.updatedRows[0]).toMatchObject({
      review_id: 'v2_subject_001',
      materia_codigo_final: 'ING-1-MAT-OF',
      estado_revision: 'CONFIRMADO',
      observaciones_revision: 'Codigo confirmado por revision institucional',
    })
    expect(result.summary.appliedResolutions).toBe(1)
  })

  it('no aplica resolucion sin codigo final', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [baseRow()],
      homonymyResolutionRows: [resolutionRow({ materia_codigo_final: '' })],
    })

    expect(result.updatedRows[0].materia_codigo_final).toBe('')
    expect(result.unresolvedRows[0].homonymy_resolution_reason).toContain('FALTA_MATERIA_CODIGO_FINAL')
  })

  it('no aplica resolucion con estado no confirmado', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [baseRow()],
      homonymyResolutionRows: [resolutionRow({ estado_revision: 'PENDIENTE' })],
    })

    expect(result.updatedRows[0].estado_revision).toBe('PENDIENTE_CODIGO')
    expect(result.unresolvedRows[0].homonymy_resolution_reason).toContain('ESTADO_NO_CONFIRMADO')
  })

  it('no aplica placeholder', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [baseRow()],
      homonymyResolutionRows: [resolutionRow({ materia_codigo_final: 'SIN_CODIGO' })],
    })

    expect(result.unresolvedRows[0].homonymy_resolution_reason).toContain('MATERIA_CODIGO_FINAL_PLACEHOLDER')
  })

  it('no aplica alternativas con |', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [baseRow()],
      homonymyResolutionRows: [resolutionRow({ materia_codigo_final: 'ING-1-A|ING-1-B' })],
    })

    expect(result.unresolvedRows[0].homonymy_resolution_reason).toContain('MATERIA_CODIGO_FINAL_CON_ALTERNATIVAS')
  })

  it('preserva filas de bajo riesgo ya confirmadas', () => {
    const confirmedLowRisk = baseRow({
      review_id: 'v2_subject_002',
      materia_codigo_final: 'ING-1-SIMPLE',
      estado_revision: 'CONFIRMADO',
      riesgo_homonimia: 'NO',
      riesgo_nombre_duplicado: 'NO',
      prioridad_revision: 'MEDIA',
      observaciones_revision: 'Codigo simple confirmado institucionalmente para identidad v2.',
    })
    const result = applyV2HomonymyResolutions({
      baseRows: [baseRow(), confirmedLowRisk],
      homonymyResolutionRows: [resolutionRow()],
    })

    expect(result.updatedRows.find((row) => row.review_id === 'v2_subject_002')).toMatchObject({
      materia_codigo_final: 'ING-1-SIMPLE',
      estado_revision: 'CONFIRMADO',
      observaciones_revision: 'Codigo simple confirmado institucionalmente para identidad v2.',
    })
  })

  it('detecta review_id no encontrado', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [baseRow()],
      homonymyResolutionRows: [resolutionRow({ review_id: 'v2_subject_999' })],
    })

    expect(result.unmatchedRows).toEqual([
      expect.objectContaining({
        review_id: 'v2_subject_999',
        homonymy_resolution_reason: 'REVIEW_ID_NO_ENCONTRADO_EN_BASE',
      }),
    ])
    expect(result.summary.readyForValidation).toBe(false)
  })

  it('detecta review_id duplicado en resoluciones', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [baseRow()],
      homonymyResolutionRows: [
        resolutionRow({ materia_codigo_final: 'ING-1-A' }),
        resolutionRow({ materia_codigo_final: 'ING-1-B' }),
      ],
    })

    expect(result.duplicateResolutionRows).toEqual([
      expect.objectContaining({ review_id: 'v2_subject_001', count: 2 }),
    ])
    expect(result.updatedRows[0].materia_codigo_final).toBe('')
    expect(result.summary.readyForValidation).toBe(false)
  })

  it('detecta duplicado final plan_id_final + materia_codigo_final', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [
        baseRow({ review_id: 'v2_subject_001', materia_nombre: 'Materia Uno' }),
        baseRow({
          review_id: 'v2_subject_002',
          materia_nombre: 'Materia Dos',
          materia_codigo_final: 'ING-1-DUP',
          estado_revision: 'CONFIRMADO',
        }),
      ],
      homonymyResolutionRows: [
        resolutionRow({
          review_id: 'v2_subject_001',
          materia_codigo_final: 'ING-1-DUP',
        }),
      ],
    })

    expect(result.summary.duplicateFinalKeys).toBe(1)
    expect(result.rejectedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ rejection_reason: 'DUPLICATE_PLAN_ID_MATERIA_CODIGO_FINAL' }),
    ]))
    expect(result.summary.readyForValidation).toBe(false)
  })

  it('no muta inputs', () => {
    const baseRows = [baseRow()]
    const resolutionRows = [resolutionRow()]
    const before = JSON.stringify({ baseRows, resolutionRows })

    applyV2HomonymyResolutions({ baseRows, homonymyResolutionRows: resolutionRows })

    expect(JSON.stringify({ baseRows, resolutionRows })).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = applyV2HomonymyResolutions({
      baseRows: [
        baseRow({
          docente: 'Nombre Personal Reservado',
          alumno: 'Alumno Personal Reservado',
        }),
      ],
      homonymyResolutionRows: [resolutionRow()],
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(serialized).not.toContain('Alumno Personal Reservado')
  })
})
