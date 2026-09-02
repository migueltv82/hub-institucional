import { describe, expect, it } from 'vitest'
import { applyV2SubjectCodeReview } from './applyV2SubjectCodeReview.js'

function codeReviewRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_final: 'ING',
    plan_id_final: 'ING-2026',
    anio: '1',
    materia_nombre: 'Algebra I',
    materia_codigo_sugerido: 'ING-1-ALG',
    materia_codigo_borrador: 'ING-1-ALG',
    materia_codigo_final: '',
    estado_revision: 'PENDIENTE_CODIGO',
    riesgo_nombre_duplicado: 'NO',
    riesgo_codigo_duplicado: 'NO',
    riesgo_homonimia: 'NO',
    prioridad_revision: 'MEDIA',
    motivo_revision: '',
    accion_requerida: 'COMPLETAR_Y_CONFIRMAR_MATERIA_CODIGO_FINAL',
    observaciones_revision: '',
    ...overrides,
  }
}

describe('applyV2SubjectCodeReview', () => {
  it('deja pendiente fila sin codigo final', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_borrador: '',
          materia_codigo_final: '',
        }),
      ],
    })

    expect(result.pendingRows).toHaveLength(1)
    expect(result.pendingRows[0].pendiente_motivo).toContain('FALTA_MATERIA_CODIGO_FINAL')
    expect(result.summary.correctedRows).toBe(0)
  })

  it('deja pendiente fila con codigo borrador pero sin final', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [codeReviewRow()],
    })

    expect(result.pendingRows).toHaveLength(1)
    expect(result.pendingRows[0].pendiente_motivo).toContain('SOLO_MATERIA_CODIGO_BORRADOR')
  })

  it('acepta fila con codigo final y estado CONFIRMADO', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_final: 'ING-1-ALG',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.correctedRows).toEqual([
      expect.objectContaining({
        plan_id_final: 'ING-2026',
        materia_codigo_final: 'ING-1-ALG',
        identity_v2_key: 'ING-2026::ING-1-ALG',
      }),
    ])
    expect(result.pendingRows).toHaveLength(0)
    expect(result.rejectedRows).toHaveLength(0)
  })

  it('acepta estados APROBADO, VALIDADO y OK', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [
        codeReviewRow({
          review_id: 'v2_subject_001',
          materia_nombre: 'Algebra I',
          materia_codigo_final: 'ING-1-ALG',
          estado_revision: 'APROBADO',
        }),
        codeReviewRow({
          review_id: 'v2_subject_002',
          materia_nombre: 'Fisica I',
          materia_codigo_final: 'ING-1-FIS',
          estado_revision: 'VALIDADO',
        }),
        codeReviewRow({
          review_id: 'v2_subject_003',
          materia_nombre: 'Quimica I',
          materia_codigo_final: 'ING-1-QUI',
          estado_revision: 'OK',
        }),
      ],
    })

    expect(result.correctedRows).toHaveLength(3)
    expect(result.summary.readyForIdentityV2).toBe(true)
  })

  it('rechaza duplicado plan_id_final + materia_codigo_final', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [
        codeReviewRow({
          review_id: 'v2_subject_001',
          materia_nombre: 'Algebra I',
          materia_codigo_final: 'ING-1-DUP',
          estado_revision: 'CONFIRMADO',
        }),
        codeReviewRow({
          review_id: 'v2_subject_002',
          materia_nombre: 'Fisica I',
          materia_codigo_final: 'ING-1-DUP',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.rejectedRows).toHaveLength(2)
    expect(result.rejectedRows[0].rechazo_motivo).toContain('DUPLICATE_PLAN_ID_MATERIA_CODIGO_FINAL')
    expect(result.duplicateKeys).toEqual([
      expect.objectContaining({
        type: 'DUPLICATE_PLAN_ID_MATERIA_CODIGO_FINAL',
        affectedRows: 2,
      }),
    ])
  })

  it('detecta placeholder', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_final: 'PENDIENTE',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.rejectedRows).toHaveLength(1)
    expect(result.summary.placeholderRows).toBe(1)
  })

  it('detecta alternativa con |', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_final: 'ING-1-ALG|ING-1-ALG-A',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.rejectedRows).toHaveLength(1)
    expect(result.rejectedRows[0].rechazo_motivo).toContain('MATERIA_CODIGO_FINAL_CON_ALTERNATIVAS')
  })

  it('marca readyForIdentityV2 false si hay pendientes', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [codeReviewRow()],
    })

    expect(result.summary.readyForIdentityV2).toBe(false)
    expect(result.summary.readyForCompactFinalTableComparison).toBe(false)
  })

  it('marca readyForIdentityV2 true si todas las filas estan confirmadas y sin duplicados', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [
        codeReviewRow({
          review_id: 'v2_subject_001',
          materia_codigo_final: 'ING-1-ALG',
          estado_revision: 'CONFIRMADO',
        }),
        codeReviewRow({
          review_id: 'v2_subject_002',
          materia_nombre: 'Fisica I',
          materia_codigo_final: 'ING-1-FIS',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.correctedRows).toHaveLength(2)
    expect(result.summary.readyForIdentityV2).toBe(true)
    expect(result.summary.readyForCompactFinalTableComparison).toBe(true)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('no muta inputs', () => {
    const rows = [codeReviewRow()]
    const before = JSON.stringify(rows)

    applyV2SubjectCodeReview({ codeReviewRows: rows })

    expect(JSON.stringify(rows)).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = applyV2SubjectCodeReview({
      codeReviewRows: [
        codeReviewRow({
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
