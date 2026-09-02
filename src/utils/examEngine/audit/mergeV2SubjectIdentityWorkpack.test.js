import { describe, expect, it } from 'vitest'
import { mergeV2SubjectIdentityWorkpack } from './mergeV2SubjectIdentityWorkpack.js'

function originalRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_sugerido: 'ING',
    anio: '3',
    materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    materia_key_actual: 'weak::ingles::practicasdiscursivasiii::3',
    plan_id_sugerido: 'ING-PLAN-ACTUAL',
    materia_codigo_sugerido: 'ING-3-PRACDISCIII',
    riesgo_nombre_duplicado: 'NO',
    motivo_revision: 'WEAK_KEY|MISSING_PLAN_ID|MISSING_MATERIA_CODIGO',
    accion_requerida: 'COMPLETAR_PLAN_ID_Y_MATERIA_CODIGO_OFICIAL',
    observaciones_revision: '',
    ...overrides,
  }
}

function workpackFile(fileName, rows) {
  return { fileName, rows }
}

function editedRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera_id_sugerido: 'ING',
    plan_id_sugerido: 'ING-PLAN-ACTUAL',
    materia_codigo_sugerido: 'ING-3-PRACDISCIII',
    carrera_id_final: 'ING',
    plan_id_final: 'ING-2024',
    materia_codigo_final: 'ING-3-PDIII',
    estado_revision: 'CONFIRMADO',
    observaciones_revision: 'Validado por secretaria academica',
    ...overrides,
  }
}

describe('mergeV2SubjectIdentityWorkpack', () => {
  it('fusiona archivos por carrera', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [
        originalRow({ review_id: 'v2_subject_001', carrera_id_sugerido: 'ING' }),
        originalRow({
          review_id: 'v2_subject_002',
          carrera: 'Profesorado de Geografia',
          carrera_id_sugerido: 'GEO',
        }),
      ],
      workpackFiles: [
        workpackFile('ING_revision.csv', [editedRow({ review_id: 'v2_subject_001' })]),
        workpackFile('GEO_revision.csv', [
          editedRow({
            review_id: 'v2_subject_002',
            carrera_id_final: 'GEO',
            plan_id_final: 'GEO-2024',
            materia_codigo_final: 'GEO-4-DIDGEO',
          }),
        ]),
      ],
    })

    expect(result.mergedRows).toHaveLength(2)
    expect(result.summary.readyForApply).toBe(true)
    expect(result.summary.changedRows).toBe(2)
  })

  it('ignora archivos auxiliares de prioridad y homonimias', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [originalRow()],
      workpackFiles: [
        workpackFile('ING_revision.csv', [editedRow()]),
        workpackFile('01_prioridad_alta.csv', [
          editedRow({
            review_id: 'v2_subject_001',
            plan_id_final: 'NO-DEBE-USARSE',
          }),
        ]),
        workpackFile('02_homonimias.csv', [
          editedRow({
            review_id: 'v2_subject_001',
            plan_id_final: 'TAMPOCO-DEBE-USARSE',
          }),
        ]),
      ],
    })

    expect(result.mergedRows[0].plan_id_final).toBe('ING-2024')
    expect(result.duplicateReviewIds).toHaveLength(0)
    expect(result.skippedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'IGNORED_NON_EDITABLE_FILE' }),
    ]))
  })

  it('detecta review_id duplicado', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [originalRow()],
      workpackFiles: [
        workpackFile('ING_revision.csv', [editedRow()]),
        workpackFile('GEO_revision.csv', [editedRow()]),
      ],
    })

    expect(result.duplicateReviewIds).toEqual([
      expect.objectContaining({ review_id: 'v2_subject_001', count: 2 }),
    ])
    expect(result.summary.readyForApply).toBe(false)
  })

  it('detecta review_id faltante', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [
        originalRow({ review_id: 'v2_subject_001' }),
        originalRow({ review_id: 'v2_subject_002' }),
      ],
      workpackFiles: [
        workpackFile('ING_revision.csv', [editedRow({ review_id: 'v2_subject_001' })]),
      ],
    })

    expect(result.missingReviewIds).toEqual(['v2_subject_002'])
    expect(result.summary.readyForApply).toBe(false)
  })

  it('detecta review_id inesperado', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [originalRow({ review_id: 'v2_subject_001' })],
      workpackFiles: [
        workpackFile('ING_revision.csv', [
          editedRow({ review_id: 'v2_subject_001' }),
          editedRow({ review_id: 'v2_subject_999' }),
        ]),
      ],
    })

    expect(result.unexpectedReviewIds).toEqual(['v2_subject_999'])
    expect(result.summary.readyForApply).toBe(false)
  })

  it('conserva columnas originales', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [
        originalRow({
          review_id: 'v2_subject_001',
          legacyCount: '1',
          presentInLegacy: 'SI',
        }),
      ],
      workpackFiles: [workpackFile('ING_revision.csv', [editedRow()])],
    })

    expect(result.mergedRows[0]).toMatchObject({
      legacyCount: '1',
      presentInLegacy: 'SI',
      materia_key_actual: 'weak::ingles::practicasdiscursivasiii::3',
    })
  })

  it('normaliza alias hacia columnas finales', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [originalRow()],
      workpackFiles: [
        workpackFile('ING_revision.csv', [
          {
            review_id: 'v2_subject_001',
            carrera_id_confirmado: 'ING',
            plan_id_confirmado: 'ING-2024',
            materia_codigo_confirmado: 'ING-3-PDIII',
            revision_status: 'VALIDADO',
          },
        ]),
      ],
    })

    expect(result.mergedRows[0]).toMatchObject({
      carrera_id_final: 'ING',
      plan_id_final: 'ING-2024',
      materia_codigo_final: 'ING-3-PDIII',
      estado_revision: 'VALIDADO',
    })
  })

  it('no promueve sugerencias a oficiales', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [originalRow()],
      workpackFiles: [
        workpackFile('ING_revision.csv', [
          {
            review_id: 'v2_subject_001',
            carrera_id_sugerido: 'ING',
            plan_id_sugerido: 'ING-PLAN-ACTUAL',
            materia_codigo_sugerido: 'ING-3-PRACDISCIII',
          },
        ]),
      ],
    })

    expect(result.mergedRows[0]).toMatchObject({
      carrera_id_final: '',
      plan_id_final: '',
      materia_codigo_final: '',
    })
  })

  it('detecta filas cambiadas', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [originalRow()],
      workpackFiles: [workpackFile('ING_revision.csv', [editedRow()])],
    })

    expect(result.changedRows).toEqual([
      expect.objectContaining({
        review_id: 'v2_subject_001',
        changedFields: expect.arrayContaining([
          'carrera_id_final',
          'plan_id_final',
          'materia_codigo_final',
          'estado_revision',
          'observaciones_revision',
        ]),
        readyForValidation: true,
      }),
    ])
  })

  it('marca readyForApply true si el merge esta completo', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [originalRow()],
      workpackFiles: [workpackFile('ING_revision.csv', [editedRow()])],
    })

    expect(result.summary.readyForApply).toBe(true)
  })

  it('no muta inputs', () => {
    const originalReviewRows = [originalRow()]
    const workpackFiles = [workpackFile('ING_revision.csv', [editedRow()])]
    const before = JSON.stringify({ originalReviewRows, workpackFiles })

    mergeV2SubjectIdentityWorkpack({ originalReviewRows, workpackFiles })

    expect(JSON.stringify({ originalReviewRows, workpackFiles })).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = mergeV2SubjectIdentityWorkpack({
      originalReviewRows: [
        originalRow({
          docente: 'Nombre Personal Reservado',
          alumno: 'Alumno Personal Reservado',
        }),
      ],
      workpackFiles: [workpackFile('ING_revision.csv', [editedRow()])],
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(serialized).not.toContain('Alumno Personal Reservado')
  })
})
