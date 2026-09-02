import { describe, expect, it } from 'vitest'
import { buildDocenteMateriaReviewPack } from './buildDocenteMateriaReviewPack.js'

function candidateRows() {
  return [
    {
      carrera: 'Profesorado de Ingles',
      anio: '1',
      materia_codigo: 'MULTI1',
      materia_nombre: 'Lengua Inglesa I',
      docente: 'Docente Reservado Uno',
      rol_en_materia: '',
      requiere_mesa: 'SI',
      requiere_revision: 'SI',
      motivo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    },
    {
      carrera: 'Profesorado de Ingles',
      anio: '1',
      materia_codigo: 'MULTI1',
      materia_nombre: 'Lengua Inglesa I',
      docente: 'Docente Reservado Dos',
      rol_en_materia: '',
      requiere_mesa: 'SI',
      requiere_revision: 'SI',
      motivo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    },
    {
      carrera: 'Profesorado de Ingles',
      anio: '2',
      materia_codigo: 'PRA2',
      materia_nombre: 'Practica Profesional II',
      docente: 'Docente Reservado Tres',
      rol_en_materia: '',
      requiere_mesa: 'SI',
      requiere_revision: 'SI',
      motivo_revision: 'PRACTICA_PROFESIONAL_MULTIDOCENTE',
    },
    {
      carrera: 'Profesorado de Ingles',
      anio: '2',
      materia_codigo: 'PRA2',
      materia_nombre: 'Practica Profesional II',
      docente: 'Docente Reservado Cuatro',
      rol_en_materia: '',
      requiere_mesa: 'SI',
      requiere_revision: 'SI',
      motivo_revision: 'PRACTICA_PROFESIONAL_MULTIDOCENTE',
    },
    {
      carrera: 'Profesorado de Ingles',
      anio: '3',
      materia_codigo: 'OK1',
      materia_nombre: 'Materia con titular',
      docente: 'Docente Reservado Cinco',
      rol_en_materia: 'TITULAR',
      requiere_mesa: 'SI',
      requiere_revision: 'NO',
      motivo_revision: '',
    },
  ]
}

function impactReport() {
  return {
    withoutDocenteMateria: {
      completionRate: 0.5984,
      titularesInferidos: 134,
    },
    withDocenteMateria: {
      completionRate: 0.5738,
      titularesInferidos: 0,
      titularesExplicitos: 128,
    },
  }
}

function orphanHorarios() {
  return [
    {
      rowNumber: 10,
      carrera: 'profesorado de ingles',
      materia: 'ing01',
      docenteAnonId: 'doc-safe1',
      motivo: 'HORARIO_SIN_PLAN',
    },
  ]
}

describe('buildDocenteMateriaReviewPack', () => {
  it('agrupa varias filas de una misma materia en un unico item de revision', () => {
    const result = buildDocenteMateriaReviewPack({
      candidateRows: candidateRows(),
      impactReport: impactReport(),
    })

    expect(result.reviewRows).toHaveLength(2)
    expect(result.reviewRows[0]).toMatchObject({
      materia_codigo: 'MULTI1',
      cantidad_docentes_detectados: 2,
      tipo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    })
    expect(result.reviewRows[0].docentes_detectados).toContain('Docente Reservado Uno')
    expect(result.reviewRows[0].docentes_detectados).toContain('Docente Reservado Dos')
  })

  it('distingue filas de revision de materias unicas', () => {
    const result = buildDocenteMateriaReviewPack({
      candidateRows: candidateRows(),
      impactReport: impactReport(),
    })

    expect(result.summary).toMatchObject({
      candidateRows: 5,
      candidateRowsRequiringReview: 4,
      uniqueSubjectsRequiringReview: 2,
      reviewRowsGenerated: 2,
    })
  })

  it('genera recomendacion para multidocente no practica', () => {
    const result = buildDocenteMateriaReviewPack({
      candidateRows: candidateRows(),
      impactReport: impactReport(),
    })
    const row = result.reviewRows.find((item) => item.tipo_revision === 'MULTIDOCENTE_NO_PRACTICA')

    expect(row.recomendacion).toBe(
      'Definir un unico TITULAR para la mesa. Los demas docentes deben quedar como CO_DOCENTE/AUXILIAR o no participar como titular.',
    )
    expect(row.accion_sugerida).toBe('COMPLETAR_TITULAR_UNICO')
  })

  it('genera recomendacion para practica profesional multidocente', () => {
    const result = buildDocenteMateriaReviewPack({
      candidateRows: candidateRows(),
      impactReport: impactReport(),
    })
    const row = result.reviewRows.find((item) => item.tipo_revision === 'PRACTICA_PROFESIONAL_MULTIDOCENTE')

    expect(row.recomendacion).toBe(
      'Definir que docente actuara como TITULAR de mesa. Los demas pueden quedar como CO_DOCENTE/AUXILIAR si corresponde.',
    )
    expect(row.accion_sugerida).toBe('CONFIRMAR_TITULAR_DE_MESA')
  })

  it('incluye horarios huerfanos', () => {
    const result = buildDocenteMateriaReviewPack({
      candidateRows: candidateRows(),
      impactReport: impactReport(),
      orphanHorarios: orphanHorarios(),
    })

    expect(result.reviewRows).toHaveLength(3)
    expect(result.summary.horariosHuerfanos).toBe(1)
    expect(result.reviewRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tipo_revision: 'HORARIO_HUERFANO',
        docentes_detectados: 'doc-safe1',
      }),
    ]))
  })

  it('no muta candidateRows', () => {
    const rows = candidateRows()
    const before = JSON.stringify(rows)

    buildDocenteMateriaReviewPack({
      candidateRows: rows,
      impactReport: impactReport(),
    })

    expect(JSON.stringify(rows)).toBe(before)
  })

  it('genera summary con metricas del impacto', () => {
    const result = buildDocenteMateriaReviewPack({
      candidateRows: candidateRows(),
      impactReport: impactReport(),
    })

    expect(result.summary).toMatchObject({
      impactCompletionRateWithoutDocenteMateria: 0.5984,
      impactCompletionRateWithDocenteMateria: 0.5738,
      impactTitularesInferidosBefore: 134,
      impactTitularesInferidosAfter: 0,
      impactTitularesExplicitosAfter: 128,
    })
  })

  it('no imprime nombres completos en warnings/errors', () => {
    const result = buildDocenteMateriaReviewPack({
      candidateRows: candidateRows(),
      impactReport: null,
    })
    const diagnosticText = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(diagnosticText).not.toContain('Docente Reservado Uno')
    expect(diagnosticText).not.toContain('Docente Reservado Dos')
    expect(diagnosticText).not.toContain('Docente Reservado Tres')
  })
})
