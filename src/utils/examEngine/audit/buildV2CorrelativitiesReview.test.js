import { describe, expect, it } from 'vitest'
import { buildV2CorrelativitiesReview } from './buildV2CorrelativitiesReview.js'

function correlatividadRow(overrides = {}) {
  return {
    id: 'corr-001',
    nombre: 'DIDACTICA DEL INGLES I',
    carrera: 'PROFESORADO DE INGLES',
    materia: 'ING13',
    correlativas: ['ING01'],
    ...overrides,
  }
}

function planRow(overrides = {}) {
  return {
    carrera: 'PROFESORADO DE INGLES',
    anio: 1,
    materia: 'ING01',
    nombre: 'PROBLEMATICA DE LA EDUCACION',
    ...overrides,
  }
}

function codeReviewRow(overrides = {}) {
  return {
    carrera: 'Profesorado de Ingles',
    materia_nombre: 'PROBLEMATICA DE LA EDUCACION',
    plan_id_final: 'ING-2026',
    materia_codigo_final: 'ING-1-PROB',
    materia_codigo_borrador: 'ING-1-PROB',
    estado_revision: 'CONFIRMADO',
    ...overrides,
  }
}

const POSTERIOR_PLAN_ROW = {
  carrera: 'PROFESORADO DE INGLES',
  anio: 2,
  materia: 'ING13',
  nombre: 'DIDACTICA DEL INGLES I',
}

const POSTERIOR_CODE_REVIEW_ROW = {
  carrera: 'Profesorado de Ingles',
  materia_nombre: 'DIDACTICA DEL INGLES I',
  plan_id_final: 'ING-2026',
  materia_codigo_final: 'ING-2-DIDAINGLI',
  materia_codigo_borrador: 'ING-2-DIDAINGLI',
  estado_revision: 'CONFIRMADO',
}

describe('buildV2CorrelativitiesReview', () => {
  it('genera una fila por vinculo posterior/previa resuelta con ambos codigos finales confirmados', () => {
    const result = buildV2CorrelativitiesReview({
      correlatividades: [correlatividadRow()],
      planesEstudio: [POSTERIOR_PLAN_ROW, planRow()],
      subjectCodeReviewRows: [POSTERIOR_CODE_REVIEW_ROW, codeReviewRow()],
    })

    expect(result.reviewRows).toHaveLength(1)
    expect(result.reviewRows[0]).toMatchObject({
      carrera: 'PROFESORADO DE INGLES',
      posterior_materia_nombre: 'DIDACTICA DEL INGLES I',
      posterior_materia_codigo_final: 'ING-2-DIDAINGLI',
      previa_materia_nombre: 'PROBLEMATICA DE LA EDUCACION',
      previa_materia_codigo_final: 'ING-1-PROB',
      bloqueado_por_codigo_pendiente: 'NO',
      riesgo_plan_distinto: 'NO',
    })
    expect(result.summary.linksResolved).toBe(1)
    expect(result.summary.linksBlockedByPendingCode).toBe(0)
    expect(result.blockedRows).toHaveLength(0)
  })

  it('bloquea el vinculo si la previa todavia no tiene materia_codigo_final', () => {
    const result = buildV2CorrelativitiesReview({
      correlatividades: [correlatividadRow()],
      planesEstudio: [POSTERIOR_PLAN_ROW, planRow()],
      subjectCodeReviewRows: [
        POSTERIOR_CODE_REVIEW_ROW,
        codeReviewRow({ materia_codigo_final: '', materia_codigo_borrador: 'ING-1-PROB', estado_revision: 'PENDIENTE_CODIGO' }),
      ],
    })

    expect(result.reviewRows[0]).toMatchObject({
      bloqueado_por_codigo_pendiente: 'SI',
      prioridad_revision: 'ALTA',
    })
    expect(result.reviewRows[0].motivo_revision).toContain('PREVIA_CODIGO_FINAL_PENDIENTE')
    expect(result.blockedRows).toHaveLength(1)
    expect(result.summary.linksBlockedByPendingCode).toBe(1)
    expect(result.summary.readyForCorrelativitiesApply).toBe(false)
  })

  it('marca riesgo_plan_distinto si posterior y previa resuelven a distinto plan_id_final', () => {
    const result = buildV2CorrelativitiesReview({
      correlatividades: [correlatividadRow()],
      planesEstudio: [POSTERIOR_PLAN_ROW, planRow()],
      subjectCodeReviewRows: [
        POSTERIOR_CODE_REVIEW_ROW,
        codeReviewRow({ plan_id_final: 'ING-2020-OLD' }),
      ],
    })

    expect(result.reviewRows[0]).toMatchObject({
      riesgo_plan_distinto: 'SI',
      prioridad_revision: 'ALTA',
    })
    expect(result.reviewRows[0].motivo_revision).toContain('RIESGO_PLAN_DISTINTO')
    expect(result.summary.linksWithPlanMismatch).toBe(1)
  })

  it('empareja carrera ignorando tildes y mayusculas/minusculas', () => {
    const result = buildV2CorrelativitiesReview({
      correlatividades: [correlatividadRow({ carrera: 'Profesorado de Inglés' })],
      planesEstudio: [
        { ...POSTERIOR_PLAN_ROW, carrera: 'PROFESORADO DE INGLES' },
        { ...planRow(), carrera: 'PROFESORADO DE INGLES' },
      ],
      subjectCodeReviewRows: [POSTERIOR_CODE_REVIEW_ROW, codeReviewRow()],
    })

    expect(result.reviewRows).toHaveLength(1)
    expect(result.reviewRows[0].posterior_materia_codigo_final).toBe('ING-2-DIDAINGLI')
    expect(result.reviewRows[0].previa_materia_codigo_final).toBe('ING-1-PROB')
    expect(result.reviewRows[0].bloqueado_por_codigo_pendiente).toBe('NO')
  })

  it('bloquea y explica cuando la carrera no aparece en planesEstudio (ej. carreras con nombre distinto)', () => {
    const result = buildV2CorrelativitiesReview({
      correlatividades: [
        correlatividadRow({
          carrera: 'TECNICO EN LABORATORIO (PLAN 2015)',
          materia: 'LAB05',
          correlativas: ['LAB01'],
        }),
      ],
      planesEstudio: [POSTERIOR_PLAN_ROW, planRow()],
      subjectCodeReviewRows: [POSTERIOR_CODE_REVIEW_ROW, codeReviewRow()],
    })

    expect(result.reviewRows[0]).toMatchObject({
      bloqueado_por_codigo_pendiente: 'SI',
      prioridad_revision: 'ALTA',
    })
    expect(result.reviewRows[0].motivo_revision).toContain('POSTERIOR_SIN_NOMBRE_EN_PLAN_ESTUDIO')
    expect(result.reviewRows[0].motivo_revision).toContain('PREVIA_SIN_NOMBRE_EN_PLAN_ESTUDIO')
  })

  it('agrupa por carrera_id_legacy derivado del codigo legado de la materia posterior', () => {
    const result = buildV2CorrelativitiesReview({
      correlatividades: [correlatividadRow()],
      planesEstudio: [POSTERIOR_PLAN_ROW, planRow()],
      subjectCodeReviewRows: [POSTERIOR_CODE_REVIEW_ROW, codeReviewRow()],
    })

    expect(result.rowsByCareer.ING).toHaveLength(1)
    expect(result.rowsByCareer.GEO).toHaveLength(0)
  })

  it('no confirma automaticamente ningun vinculo', () => {
    const result = buildV2CorrelativitiesReview({
      correlatividades: [correlatividadRow()],
      planesEstudio: [POSTERIOR_PLAN_ROW, planRow()],
      subjectCodeReviewRows: [POSTERIOR_CODE_REVIEW_ROW, codeReviewRow()],
    })

    expect(result.reviewRows[0].estado_revision).toBe('PENDIENTE_CONFIRMACION')
    expect(result.summary.linksConfirmed).toBe(0)
    expect(result.summary.readyForCorrelativitiesApply).toBe(false)
  })

  it('no muta los inputs', () => {
    const correlatividades = [correlatividadRow()]
    const planesEstudio = [POSTERIOR_PLAN_ROW, planRow()]
    const subjectCodeReviewRows = [POSTERIOR_CODE_REVIEW_ROW, codeReviewRow()]
    const before = JSON.stringify({ correlatividades, planesEstudio, subjectCodeReviewRows })

    buildV2CorrelativitiesReview({ correlatividades, planesEstudio, subjectCodeReviewRows })

    expect(JSON.stringify({ correlatividades, planesEstudio, subjectCodeReviewRows })).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = buildV2CorrelativitiesReview({
      correlatividades: [
        correlatividadRow({ docente: 'Nombre Personal Reservado' }),
        correlatividadRow({ carrera: '', materia: '', id: 'corr-sin-datos' }),
      ],
      planesEstudio: [POSTERIOR_PLAN_ROW, planRow()],
      subjectCodeReviewRows: [POSTERIOR_CODE_REVIEW_ROW, codeReviewRow()],
    })
    const serialized = JSON.stringify({ warnings: result.warnings, errors: result.errors })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(result.warnings.some((warning) => warning.code === 'CORRELATIVIDAD_SIN_CARRERA_O_MATERIA')).toBe(true)
  })
})
