import { describe, expect, it } from 'vitest'
import {
  V2_SUBJECT_CODE_DRAFT_OBSERVATION,
  V2_SUBJECT_CODE_DRAFT_STATUS,
  prefillV2SubjectCodeReviewDraft,
} from './prefillV2SubjectCodeReviewDraft.js'

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
    source_file: 'ING_codigos.csv',
    ...overrides,
  }
}

describe('prefillV2SubjectCodeReviewDraft', () => {
  it('precarga fila simple sin riesgo', () => {
    const result = prefillV2SubjectCodeReviewDraft({
      codeReviewRows: [codeReviewRow()],
    })

    expect(result.prefilledRows).toEqual([
      expect.objectContaining({
        materia_codigo_final: 'ING-1-ALG',
        estado_revision: V2_SUBJECT_CODE_DRAFT_STATUS,
        observaciones_revision: V2_SUBJECT_CODE_DRAFT_OBSERVATION,
      }),
    ])
    expect(result.skippedRows).toHaveLength(0)
    expect(result.summary.prefilledRows).toBe(1)
  })

  it('no marca CONFIRMADO automaticamente', () => {
    const result = prefillV2SubjectCodeReviewDraft({
      codeReviewRows: [codeReviewRow()],
    })

    expect(result.prefilledRows[0].estado_revision).not.toBe('CONFIRMADO')
    expect(result.summary.confirmedRows).toBe(0)
  })

  it('usa PRECONFIRMAR_CODIGO', () => {
    const result = prefillV2SubjectCodeReviewDraft({
      codeReviewRows: [codeReviewRow()],
    })

    expect(result.prefilledRows[0].estado_revision).toBe('PRECONFIRMAR_CODIGO')
    expect(result.summary.preconfirmarRows).toBe(1)
  })

  it('no precarga homonimias', () => {
    const result = prefillV2SubjectCodeReviewDraft({
      codeReviewRows: [
        codeReviewRow({
          riesgo_homonimia: 'SI',
          motivo_revision: 'HOMONIMIA',
          prioridad_revision: 'ALTA',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.highRiskRows).toHaveLength(1)
    expect(result.highRiskRows[0].motivos_prioridad_alta).toContain('RIESGO_HOMONIMIA')
    expect(result.summary.homonymyRows).toBe(1)
  })

  it('no precarga prioridad alta', () => {
    const result = prefillV2SubjectCodeReviewDraft({
      codeReviewRows: [
        codeReviewRow({
          prioridad_revision: 'ALTA',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.skippedRows[0].prefill_skip_reason).toContain('RIESGO_ALTO')
  })

  it('no precarga codigo con placeholder', () => {
    const result = prefillV2SubjectCodeReviewDraft({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_borrador: 'SIN_CODIGO',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.skippedRows[0].prefill_skip_reason).toContain('CODIGO_BORRADOR_PLACEHOLDER')
  })

  it('no precarga codigo con alternativas', () => {
    const result = prefillV2SubjectCodeReviewDraft({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_borrador: 'ING-1-ALG|ING-1-ALG-A',
        }),
      ],
    })

    expect(result.prefilledRows).toHaveLength(0)
    expect(result.skippedRows[0].prefill_skip_reason).toContain('CODIGO_BORRADOR_CON_ALTERNATIVAS')
  })

  it('conserva columnas originales', () => {
    const result = prefillV2SubjectCodeReviewDraft({
      codeReviewRows: [
        codeReviewRow({
          columna_extra: 'valor extra',
        }),
      ],
    })

    expect(result.prefilledRows[0]).toMatchObject({
      columna_extra: 'valor extra',
      source_file: 'ING_codigos.csv',
    })
  })

  it('no muta inputs', () => {
    const rows = [codeReviewRow()]
    const before = JSON.stringify(rows)

    prefillV2SubjectCodeReviewDraft({ codeReviewRows: rows })

    expect(JSON.stringify(rows)).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = prefillV2SubjectCodeReviewDraft({
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
