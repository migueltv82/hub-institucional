import { describe, expect, it } from 'vitest'
import { buildV2SubjectIdentityWorkpack } from './buildV2SubjectIdentityWorkpack.js'

function pendingRow(overrides = {}) {
  return {
    review_id: 'v2_subject_001',
    carrera: 'Profesorado de Ingles',
    carrera_id_sugerido: 'ING',
    anio: '3',
    materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    plan_id_sugerido: 'ING-PLAN-ACTUAL',
    materia_codigo_sugerido: 'ING-3-PRACDISCIII',
    estado_revision: '',
    riesgo_nombre_duplicado: 'NO',
    motivo_revision: 'WEAK_KEY|MISSING_PLAN_ID|MISSING_MATERIA_CODIGO',
    accion_requerida: 'COMPLETAR_PLAN_ID_Y_MATERIA_CODIGO_OFICIAL',
    observaciones_revision: 'Codigo sugerido para revision; no es codigo oficial confirmado.',
    pendiente_motivo: 'FALTA_ESTADO_REVISION|ESTADO_NO_CONFIRMADO',
    ...overrides,
  }
}

describe('buildV2SubjectIdentityWorkpack', () => {
  it('agrupa por carrera sugerida', () => {
    const result = buildV2SubjectIdentityWorkpack({
      pendingRows: [
        pendingRow({ review_id: 'v2_subject_001', carrera_id_sugerido: 'ING' }),
        pendingRow({
          review_id: 'v2_subject_002',
          carrera: 'Profesorado de Geografia',
          carrera_id_sugerido: 'GEO',
        }),
      ],
    })

    expect(result.rowsByCareer.ING).toHaveLength(1)
    expect(result.rowsByCareer.GEO).toHaveLength(1)
    expect(result.workpackSummary.rowsByCareer.ING).toBe(1)
    expect(result.workpackSummary.rowsByCareer.GEO).toBe(1)
  })

  it('separa homonimias', () => {
    const result = buildV2SubjectIdentityWorkpack({
      pendingRows: [
        pendingRow({ review_id: 'v2_subject_001', riesgo_nombre_duplicado: 'SI' }),
        pendingRow({ review_id: 'v2_subject_002', riesgo_nombre_duplicado: 'NO' }),
      ],
    })

    expect(result.homonymyRows).toHaveLength(1)
    expect(result.homonymyRows[0].review_id).toBe('v2_subject_001')
  })

  it('marca prioridad alta por homonimia', () => {
    const result = buildV2SubjectIdentityWorkpack({
      pendingRows: [
        pendingRow({
          riesgo_nombre_duplicado: 'SI',
          pendiente_motivo: 'HOMONIMIA_REQUIERE_REVISION',
        }),
      ],
    })

    expect(result.priorityRows[0]).toMatchObject({
      prioridad: 'ALTA',
      riesgo_nombre_duplicado: 'SI',
    })
  })

  it('marca prioridad alta si falta carrera inferible', () => {
    const result = buildV2SubjectIdentityWorkpack({
      pendingRows: [
        pendingRow({
          carrera: 'Carrera sin patron',
          carrera_id_sugerido: '',
        }),
      ],
    })

    expect(result.rowsByCareer.UNKNOWN).toHaveLength(1)
    expect(result.priorityRows[0].prioridad).toBe('ALTA')
    expect(result.workpackSummary.unknownCareerRows).toBe(1)
  })

  it('mantiene columnas finales vacias', () => {
    const result = buildV2SubjectIdentityWorkpack({
      pendingRows: [pendingRow()],
    })

    expect(result.rowsByCareer.ING[0]).toMatchObject({
      carrera_id_final: '',
      plan_id_final: '',
      materia_codigo_final: '',
    })
  })

  it('no promueve sugerencias a oficiales', () => {
    const result = buildV2SubjectIdentityWorkpack({
      pendingRows: [
        pendingRow({
          carrera_id_sugerido: 'ING',
          plan_id_sugerido: 'ING-PLAN-ACTUAL',
          materia_codigo_sugerido: 'ING-3-PRACDISCIII',
        }),
      ],
    })

    const row = result.rowsByCareer.ING[0]
    expect(row.carrera_id_final).toBe('')
    expect(row.plan_id_final).toBe('')
    expect(row.materia_codigo_final).toBe('')
  })

  it('genera instrucciones de carga', () => {
    const result = buildV2SubjectIdentityWorkpack({
      pendingRows: [pendingRow()],
    })

    expect(result.instructions).toContain('carrera_id_final')
    expect(result.instructions).toContain('plan_id_final')
    expect(result.instructions).toContain('materia_codigo_final')
    expect(result.instructions).toContain('applyV2SubjectIdentityReview.mjs')
  })

  it('fusiona datos desde reviewRows sin pisar pendientes', () => {
    const result = buildV2SubjectIdentityWorkpack({
      reviewRows: [
        pendingRow({
          review_id: 'v2_subject_001',
          carrera_id_sugerido: 'ING',
          riesgo_nombre_duplicado: 'SI',
        }),
      ],
      pendingRows: [
        {
          review_id: 'v2_subject_001',
          carrera: 'Profesorado de Ingles',
          materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
          riesgo_nombre_duplicado: 'NO',
        },
      ],
    })

    expect(result.rowsByCareer.ING[0]).toMatchObject({
      riesgo_nombre_duplicado: 'NO',
      materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    })
  })

  it('no muta inputs', () => {
    const pendingRows = [pendingRow()]
    const reviewRows = [pendingRow({ review_id: 'v2_subject_002', carrera_id_sugerido: 'GEO' })]
    const before = JSON.stringify({ pendingRows, reviewRows })

    buildV2SubjectIdentityWorkpack({ pendingRows, reviewRows })

    expect(JSON.stringify({ pendingRows, reviewRows })).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = buildV2SubjectIdentityWorkpack({
      pendingRows: [pendingRow()],
      summary: {
        docentes: [{ docente: 'Nombre Personal Reservado' }],
        alumnos: [{ nombre: 'Alumno Personal Reservado' }],
      },
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(serialized).not.toContain('Alumno Personal Reservado')
  })
})
