import { describe, expect, it } from 'vitest'
import {
  V2_SUBJECT_IDENTITY_DRAFT_OBSERVATION,
  V2_SUBJECT_IDENTITY_DRAFT_STATUS,
  prefillV2SubjectIdentityWorkpackDraft,
} from './prefillV2SubjectIdentityWorkpackDraft.js'

function workpackRow(overrides = {}) {
  return {
    prioridad: 'MEDIA',
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_sugerido: 'ING',
    carrera_id_final: '',
    anio: '3',
    materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    plan_id_sugerido: 'ING-2024',
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

describe('prefillV2SubjectIdentityWorkpackDraft', () => {
  it('precarga una fila simple sin riesgo', () => {
    const result = prefillV2SubjectIdentityWorkpackDraft({
      workpackRows: [workpackRow()],
    })

    expect(result.prefilledRows).toHaveLength(1)
    expect(result.prefilledRows[0]).toMatchObject({
      carrera_id_final: 'ING',
      plan_id_final: 'ING-2024',
      materia_codigo_final: 'ING-3-PDIII',
      estado_revision: V2_SUBJECT_IDENTITY_DRAFT_STATUS,
      observaciones_revision: V2_SUBJECT_IDENTITY_DRAFT_OBSERVATION,
    })
    expect(result.summary.prefilledRows).toBe(1)
  })

  it('no pone CONFIRMADO automaticamente', () => {
    const result = prefillV2SubjectIdentityWorkpackDraft({
      workpackRows: [workpackRow()],
    })

    expect(result.prefilledRows[0].estado_revision).not.toBe('CONFIRMADO')
  })

  it('usa PRECONFIRMAR', () => {
    const result = prefillV2SubjectIdentityWorkpackDraft({
      workpackRows: [workpackRow()],
    })

    expect(result.prefilledRows[0].estado_revision).toBe('PRECONFIRMAR')
    expect(result.summary.readyForCompactFinalTableComparison).toBe(false)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('no precarga homonimias', () => {
    const result = prefillV2SubjectIdentityWorkpackDraft({
      workpackRows: [
        workpackRow({
          riesgo_nombre_duplicado: 'SI',
          motivo_revision: 'DUPLICATE_SUBJECT_NAME|REQUIERE_CODIGO_OFICIAL',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.skippedRows).toHaveLength(1)
    expect(result.highRiskRows).toEqual([
      expect.objectContaining({
        review_id: 'v2_subject_001',
        motivos_prioridad_alta: expect.stringContaining('RIESGO_HOMONIMIA'),
      }),
    ])
    expect(result.summary.homonymyRows).toBe(1)
  })

  it('no precarga plan con alternativas', () => {
    const result = prefillV2SubjectIdentityWorkpackDraft({
      workpackRows: [
        workpackRow({
          carrera_id_sugerido: 'LAB',
          plan_id_sugerido: 'LAB-2015|LAB-2024',
          materia_codigo_sugerido: 'LAB-2-QUIMGEN',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.highRiskRows[0]).toMatchObject({
      prefill_skip_reason: expect.stringContaining('CONTIENE_ALTERNATIVAS'),
      motivos_prioridad_alta: expect.stringContaining('PLAN_ALTERNATIVO'),
    })
  })

  it('no precarga placeholders', () => {
    const result = prefillV2SubjectIdentityWorkpackDraft({
      workpackRows: [
        workpackRow({
          plan_id_sugerido: 'ING-PLAN-ACTUAL',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.skippedRows[0].prefill_skip_reason).toContain('CONTIENE_PLACEHOLDER')
  })

  it('conserva columnas originales', () => {
    const result = prefillV2SubjectIdentityWorkpackDraft({
      workpackRows: [
        workpackRow({
          columna_institucional: 'valor original',
        }),
      ],
    })

    expect(result.prefilledRows[0]).toMatchObject({
      columna_institucional: 'valor original',
      materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    })
  })

  it('no muta inputs', () => {
    const workpackRows = [workpackRow()]
    const before = JSON.stringify(workpackRows)

    prefillV2SubjectIdentityWorkpackDraft({ workpackRows })

    expect(JSON.stringify(workpackRows)).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = prefillV2SubjectIdentityWorkpackDraft({
      workpackRows: [
        workpackRow({
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
