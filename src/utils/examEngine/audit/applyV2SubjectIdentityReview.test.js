import { describe, expect, it } from 'vitest'
import { applyV2SubjectIdentityReview } from './applyV2SubjectIdentityReview.js'

function reviewRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_sugerido: 'ING',
    anio: '3',
    materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    materia_key_actual: 'weak::profesoradodeingles::practicasdiscursivaseninglesiii::3',
    plan_id_sugerido: 'ING-PLAN-ACTUAL',
    materia_codigo_sugerido: 'ING-3-PRACDISCIII',
    requiere_mesa: 'SI',
    riesgo_nombre_duplicado: 'NO',
    keyType: 'WEAK_KEY',
    observaciones_revision: '',
    ...overrides,
  }
}

describe('applyV2SubjectIdentityReview', () => {
  it('deja pendiente una fila sin estado_revision', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [reviewRow()],
    })

    expect(result.pendingRows).toHaveLength(1)
    expect(result.pendingRows[0].pendiente_motivo).toContain('FALTA_ESTADO_REVISION')
  })

  it('deja pendiente una fila con valores sugeridos pero no confirmados', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [
        reviewRow({
          estado_revision: 'PENDIENTE',
        }),
      ],
    })

    expect(result.correctedRows).toHaveLength(0)
    expect(result.pendingRows[0].pendiente_motivo).toContain('ESTADO_NO_CONFIRMADO')
  })

  it('acepta una fila con campos finales y estado CONFIRMADO', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [
        reviewRow({
          carrera_id_final: 'ING',
          plan_id_final: 'ING-2024',
          materia_codigo_final: 'ING-3-PDIII',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.correctedRows).toEqual([
      expect.objectContaining({
        carrera_id: 'ING',
        plan_id: 'ING-2024',
        materia_codigo: 'ING-3-PDIII',
      }),
    ])
    expect(result.pendingRows).toHaveLength(0)
  })

  it('acepta alias plan_id_confirmado y materia_codigo_confirmado', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [
        reviewRow({
          carrera_id_confirmado: 'ING',
          plan_id_confirmado: 'ING-2024',
          materia_codigo_confirmado: 'ING-3-PDIII',
          revision_status: 'VALIDADO',
        }),
      ],
    })

    expect(result.correctedRows[0]).toMatchObject({
      plan_id: 'ING-2024',
      materia_codigo: 'ING-3-PDIII',
      estado_revision: 'VALIDADO',
    })
  })

  it('rechaza duplicado plan_id + materia_codigo', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [
        reviewRow({
          review_id: 'v2_subject_001',
          materia_nombre: 'Materia Uno',
          carrera_id_final: 'ING',
          plan_id_final: 'ING-2024',
          materia_codigo_final: 'ING-1-MAT',
          estado_revision: 'CONFIRMADO',
        }),
        reviewRow({
          review_id: 'v2_subject_002',
          materia_nombre: 'Materia Dos',
          carrera_id_final: 'ING',
          plan_id_final: 'ING-2024',
          materia_codigo_final: 'ING-1-MAT',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.duplicateKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'DUPLICATE_PLAN_MATERIA_CODIGO' }),
    ]))
    expect(result.rejectedRows).toHaveLength(2)
  })

  it('detecta placeholder PLAN-ACTUAL', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [
        reviewRow({
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.pendingRows[0].pendiente_motivo).toContain('CONTIENE_PLACEHOLDER')
    expect(result.summary.placeholderRows).toBe(1)
  })

  it('detecta alternativa LAB-2015|LAB-2024', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [
        reviewRow({
          carrera: 'Tecnicatura Superior en Laboratorio',
          carrera_id_sugerido: 'LAB',
          plan_id_sugerido: 'LAB-2015|LAB-2024',
          materia_codigo_sugerido: 'LAB-2015-2-QUIMGEN|LAB-2024-2-QUIMGEN',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.pendingRows[0].pendiente_motivo).toContain('CONTIENE_ALTERNATIVAS')
  })

  it('marca readyForCompactFinalTableComparison false si hay pendientes', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [reviewRow()],
    })

    expect(result.summary.readyForCompactFinalTableComparison).toBe(false)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('marca readyForCompactFinalTableComparison true si todas las filas estan confirmadas y sin duplicados', () => {
    const result = applyV2SubjectIdentityReview({
      reviewRows: [
        reviewRow({
          carrera_id_final: 'ING',
          plan_id_final: 'ING-2024',
          materia_codigo_final: 'ING-3-PDIII',
          estado_revision: 'CONFIRMADO',
        }),
      ],
    })

    expect(result.summary.readyForCompactFinalTableComparison).toBe(true)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('no muta inputs', () => {
    const rows = [
      reviewRow({
        carrera_id_final: 'ING',
        plan_id_final: 'ING-2024',
        materia_codigo_final: 'ING-3-PDIII',
        estado_revision: 'CONFIRMADO',
      }),
    ]
    const before = JSON.stringify(rows)

    applyV2SubjectIdentityReview({ reviewRows: rows })

    expect(JSON.stringify(rows)).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = applyV2SubjectIdentityReview({
      snapshot: {
        docentes: [{ docente: 'Nombre Personal Reservado' }],
        alumnos: [{ nombre: 'Alumno Personal Reservado' }],
      },
      reviewRows: [reviewRow()],
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(serialized).not.toContain('Alumno Personal Reservado')
  })
})
