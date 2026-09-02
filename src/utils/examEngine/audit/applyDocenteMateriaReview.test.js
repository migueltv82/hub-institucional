import { describe, expect, it } from 'vitest'
import { applyDocenteMateriaReview } from './applyDocenteMateriaReview.js'

function candidateRows() {
  return [
    {
      carrera: 'Profesorado de Ingles',
      anio: '2',
      materia_codigo: 'PRA2',
      materia_nombre: 'Practica Profesional II',
      docente: 'Docente Reservado Uno',
      dni_docente: '100',
      rol_en_materia: '',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
      observaciones: 'Practica profesional multidocente: definir titular para mesa.',
      origen: 'HORARIOS_DOCENTES',
      nivel_confianza: 'MEDIA',
      requiere_revision: 'SI',
      motivo_revision: 'PRACTICA_PROFESIONAL_MULTIDOCENTE',
    },
    {
      carrera: 'Profesorado de Ingles',
      anio: '2',
      materia_codigo: 'PRA2',
      materia_nombre: 'Practica Profesional II',
      docente: 'Docente Reservado Dos',
      dni_docente: '200',
      rol_en_materia: '',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
      observaciones: 'Practica profesional multidocente: definir titular para mesa.',
      origen: 'HORARIOS_DOCENTES',
      nivel_confianza: 'MEDIA',
      requiere_revision: 'SI',
      motivo_revision: 'PRACTICA_PROFESIONAL_MULTIDOCENTE',
    },
    {
      carrera: 'Profesorado de Ingles',
      anio: '3',
      materia_codigo: 'OK1',
      materia_nombre: 'Materia con titular',
      docente: 'Docente Reservado Tres',
      dni_docente: '300',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
      observaciones: 'Titular inferido por unico docente en horarios.',
      origen: 'HORARIOS_DOCENTES',
      nivel_confianza: 'ALTA',
      requiere_revision: 'NO',
      motivo_revision: '',
    },
    {
      carrera: 'Profesorado de Ingles',
      anio: '4',
      materia_codigo: 'SIN1',
      materia_nombre: 'Materia sin horario',
      docente: '',
      dni_docente: '',
      rol_en_materia: '',
      estado_asignacion: '',
      requiere_mesa: 'NO',
      observaciones: 'Materia del plan sin horario asociado; no requerida para mesa.',
      origen: 'PLAN_ESTUDIO',
      nivel_confianza: 'ALTA',
      requiere_revision: 'NO',
      motivo_revision: 'SIN_HORARIO_NO_REQUERIDA',
    },
  ]
}

function practiceReview(overrides = {}) {
  return {
    review_id: 'review-practice',
    carrera: 'Profesorado de Ingles',
    anio: '2',
    materia_codigo: 'PRA2',
    materia_nombre: 'Practica Profesional II',
    tipo_revision: 'PRACTICA_PROFESIONAL_MULTIDOCENTE',
    motivo_revision: 'PRACTICA_PROFESIONAL_MULTIDOCENTE',
    cantidad_docentes_detectados: 2,
    docentes_detectados: 'Docente Reservado Uno | Docente Reservado Dos',
    roles_detectados: 'SIN_ROL',
    requiere_mesa: 'SI',
    recomendacion: '',
    titular_a_confirmar: 'Docente Reservado Uno',
    accion_sugerida: '',
    observaciones_revision: '',
    ...overrides,
  }
}

function nonPracticeRows() {
  return [
    {
      carrera: 'Tecnicatura Superior',
      anio: '1',
      materia_codigo: 'MAT1',
      materia_nombre: 'Matematica',
      docente: 'Docente Reservado Cuatro',
      dni_docente: '400',
      rol_en_materia: '',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
      observaciones: 'Requiere definir titular institucional.',
      requiere_revision: 'SI',
      motivo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    },
    {
      carrera: 'Tecnicatura Superior',
      anio: '1',
      materia_codigo: 'MAT1',
      materia_nombre: 'Matematica',
      docente: 'Docente Reservado Cinco',
      dni_docente: '500',
      rol_en_materia: '',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
      observaciones: 'Requiere definir titular institucional.',
      requiere_revision: 'SI',
      motivo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    },
  ]
}

function nonPracticeReview() {
  return {
    review_id: 'review-non-practice',
    carrera: 'Tecnicatura Superior',
    anio: '1',
    materia_codigo: 'MAT1',
    materia_nombre: 'Matematica',
    tipo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    motivo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    docentes_detectados: 'Docente Reservado Cuatro | Docente Reservado Cinco',
    titular_a_confirmar: 'Docente Reservado Cinco',
    accion_sugerida: '',
  }
}

describe('applyDocenteMateriaReview', () => {
  it('aplica titular confirmado en practica profesional multidocente', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [practiceReview()],
    })

    expect(result.correctedRows[0]).toMatchObject({
      docente: 'Docente Reservado Uno',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      requiere_revision: 'NO',
      motivo_revision: '',
    })
    expect(result.summary.titularesConfirmados).toBe(1)
    expect(result.summary.appliedReviewItems).toBe(1)
  })

  it('deja los demas docentes como CO_DOCENTE si no hay accion sugerida', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [practiceReview()],
    })

    expect(result.correctedRows[1]).toMatchObject({
      docente: 'Docente Reservado Dos',
      rol_en_materia: 'CO_DOCENTE',
      requiere_revision: 'NO',
    })
    expect(result.summary.coDocentesAsignados).toBe(1)
  })

  it('detecta revision pendiente si falta titular_a_confirmar', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [practiceReview({ titular_a_confirmar: '' })],
    })

    expect(result.summary.pendingReviewItems).toBe(1)
    expect(result.summary.readyForImpactComparison).toBe(false)
    expect(result.pendingReviewItems[0]).toMatchObject({
      tipo_revision: 'PRACTICA_PROFESIONAL_MULTIDOCENTE',
      reason: 'FALTA_TITULAR_A_CONFIRMAR',
    })
  })

  it('detecta error si titular_a_confirmar no coincide con docentes detectados', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [practiceReview({ titular_a_confirmar: 'Docente Inexistente' })],
    })

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TITULAR_A_CONFIRMAR_NO_COINCIDE' }),
    ]))
    expect(result.summary.readyForImpactComparison).toBe(false)
  })

  it('soporta MULTIDOCENTE_NO_PRACTICA', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: nonPracticeRows(),
      reviewRows: [nonPracticeReview()],
    })

    expect(result.correctedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        docente: 'Docente Reservado Cinco',
        rol_en_materia: 'TITULAR',
        requiere_revision: 'NO',
      }),
      expect.objectContaining({
        docente: 'Docente Reservado Cuatro',
        rol_en_materia: 'CO_DOCENTE',
        requiere_revision: 'NO',
      }),
    ]))
    expect(result.summary.readyForImpactComparison).toBe(true)
  })

  it('no modifica filas que no requieren revision', () => {
    const rows = candidateRows()
    const result = applyDocenteMateriaReview({
      candidateRows: rows,
      reviewRows: [practiceReview()],
    })

    expect(result.correctedRows[2]).toEqual(rows[2])
  })

  it('conserva materias sin horario como requiere_mesa NO', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [practiceReview()],
    })

    expect(result.correctedRows[3]).toMatchObject({
      materia_codigo: 'SIN1',
      requiere_mesa: 'NO',
      docente: '',
    })
  })

  it('no aplica automaticamente horarios huerfanos', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [
        practiceReview(),
        {
          review_id: 'orphan-1',
          carrera: 'profesorado de ingles',
          materia_nombre: 'horario huerfano',
          tipo_revision: 'HORARIO_HUERFANO',
          docentes_detectados: 'doc-safe',
        },
      ],
    })

    expect(result.summary.horariosHuerfanosPendientes).toBe(1)
    expect(result.summary.readyForImpactComparison).toBe(false)
  })

  it('genera readyForImpactComparison false si hay pendientes', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [practiceReview({ titular_a_confirmar: '' })],
    })

    expect(result.summary.readyForImpactComparison).toBe(false)
  })

  it('genera readyForImpactComparison true si todo esta resuelto', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [practiceReview()],
    })

    expect(result.summary.readyForImpactComparison).toBe(true)
    expect(result.summary.assignmentErrors).toBe(0)
  })

  it('no muta candidateRows ni reviewRows', () => {
    const rows = candidateRows()
    const reviews = [practiceReview()]
    const beforeRows = JSON.stringify(rows)
    const beforeReviews = JSON.stringify(reviews)

    applyDocenteMateriaReview({
      candidateRows: rows,
      reviewRows: reviews,
    })

    expect(JSON.stringify(rows)).toBe(beforeRows)
    expect(JSON.stringify(reviews)).toBe(beforeReviews)
  })

  it('no expone nombres completos en errores/warnings', () => {
    const result = applyDocenteMateriaReview({
      candidateRows: candidateRows(),
      reviewRows: [practiceReview({ titular_a_confirmar: 'Docente Inexistente' })],
    })
    const diagnosticText = JSON.stringify({
      errors: result.errors,
      warnings: result.warnings,
      pendingReviewItems: result.pendingReviewItems,
      appliedReviewItems: result.appliedReviewItems,
    })

    expect(diagnosticText).not.toContain('Docente Reservado Uno')
    expect(diagnosticText).not.toContain('Docente Reservado Dos')
    expect(diagnosticText).not.toContain('Docente Inexistente')
  })
})
