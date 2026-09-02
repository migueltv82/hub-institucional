import { describe, expect, it } from 'vitest'
import {
  V2_SUBJECT_CODE_CONFIRMED_OBSERVATION,
  confirmLowRiskV2SubjectCodes,
} from './confirmLowRiskV2SubjectCodes.js'
import {
  V2_SUBJECT_CODE_DRAFT_OBSERVATION,
  V2_SUBJECT_CODE_DRAFT_STATUS,
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
    materia_codigo_final: 'ING-1-ALG',
    estado_revision: V2_SUBJECT_CODE_DRAFT_STATUS,
    riesgo_nombre_duplicado: 'NO',
    riesgo_codigo_duplicado: 'NO',
    riesgo_homonimia: 'NO',
    prioridad_revision: 'MEDIA',
    motivo_revision: '',
    accion_requerida: 'COMPLETAR_Y_CONFIRMAR_MATERIA_CODIGO_FINAL',
    observaciones_revision: V2_SUBJECT_CODE_DRAFT_OBSERVATION,
    source_file: 'ING_codigos.csv',
    ...overrides,
  }
}

describe('confirmLowRiskV2SubjectCodes', () => {
  it('confirma fila simple con PRECONFIRMAR_CODIGO', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [codeReviewRow()],
      options: { expectedLowRiskRows: 1 },
    })

    expect(result.confirmedRows).toEqual([
      expect.objectContaining({
        estado_revision: 'CONFIRMADO',
        observaciones_revision: V2_SUBJECT_CODE_CONFIRMED_OBSERVATION,
      }),
    ])
    expect(result.pendingRows).toHaveLength(0)
    expect(result.summary.confirmedRows).toBe(1)
  })

  it('no confirma homonimias', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [
        codeReviewRow({
          riesgo_homonimia: 'SI',
          motivo_revision: 'HOMONIMIA',
        }),
      ],
    })

    expect(result.confirmedRows).toHaveLength(0)
    expect(result.highRiskRows[0].motivos_prioridad_alta).toContain('RIESGO_HOMONIMIA')
    expect(result.summary.homonymyRows).toBe(1)
  })

  it('no confirma prioridad alta', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [
        codeReviewRow({
          prioridad_revision: 'ALTA',
        }),
      ],
    })

    expect(result.confirmedRows).toHaveLength(0)
    expect(result.pendingRows[0].low_risk_skip_reason).toContain('PRIORIDAD_ALTA')
  })

  it('no confirma codigo vacio', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_final: '',
        }),
      ],
    })

    expect(result.confirmedRows).toHaveLength(0)
    expect(result.pendingRows[0].low_risk_skip_reason).toContain('FALTA_MATERIA_CODIGO_FINAL')
  })

  it('no confirma placeholder', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_final: 'SIN_CODIGO',
        }),
      ],
    })

    expect(result.confirmedRows).toHaveLength(0)
    expect(result.pendingRows[0].low_risk_skip_reason).toContain('MATERIA_CODIGO_FINAL_PLACEHOLDER')
  })

  it('no confirma alternativas con |', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [
        codeReviewRow({
          materia_codigo_final: 'ING-1-ALG|ING-1-ALG-A',
        }),
      ],
    })

    expect(result.confirmedRows).toHaveLength(0)
    expect(result.pendingRows[0].low_risk_skip_reason).toContain('MATERIA_CODIGO_FINAL_CON_ALTERNATIVAS')
  })

  it('no confirma observaciones que indiquen revision', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [
        codeReviewRow({
          observaciones_revision: 'Revisar con secretaria por duda',
        }),
      ],
    })

    expect(result.confirmedRows).toHaveLength(0)
    expect(result.pendingRows[0].low_risk_skip_reason).toContain('OBSERVACION_REQUIERE_REVISION')
  })

  it('conserva columnas originales', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [
        codeReviewRow({
          columna_extra: 'valor extra',
        }),
      ],
      options: { expectedLowRiskRows: 1 },
    })

    expect(result.confirmedRows[0]).toMatchObject({
      columna_extra: 'valor extra',
      source_file: 'ING_codigos.csv',
    })
  })

  it('no muta inputs', () => {
    const rows = [codeReviewRow()]
    const before = JSON.stringify(rows)

    confirmLowRiskV2SubjectCodes({ codeReviewRows: rows })

    expect(JSON.stringify(rows)).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = confirmLowRiskV2SubjectCodes({
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

  it('summary marca readyForIdentityV2 false si quedan pendientes', () => {
    const result = confirmLowRiskV2SubjectCodes({
      codeReviewRows: [
        codeReviewRow({ review_id: 'v2_subject_001' }),
        codeReviewRow({
          review_id: 'v2_subject_002',
          materia_codigo_final: '',
        }),
      ],
      options: { expectedLowRiskRows: 1 },
    })

    expect(result.summary.confirmedRows).toBe(1)
    expect(result.summary.pendingRows).toBe(1)
    expect(result.summary.readyForIdentityV2).toBe(false)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })
})
