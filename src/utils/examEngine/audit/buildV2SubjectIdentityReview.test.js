import { describe, expect, it } from 'vitest'
import { buildV2SubjectIdentityReview } from './buildV2SubjectIdentityReview.js'

function requiredSubject(overrides = {}) {
  return {
    subjectKey: 'weak::profesoradodeingles::practicasdiscursivaseninglesiii::3',
    keyType: 'WEAK_KEY',
    carrera: 'Profesorado de Ingles',
    plan_id: '',
    materia_codigo: '',
    materia_nombre: 'PRACTICAS DISCURSIVAS EN INGLES III',
    anio: '3',
    requiresMesa: true,
    presentInLegacy: true,
    presentInExamEngine: true,
    legacyCount: 1,
    examEngineCount: 1,
    riskFlags: ['WEAK_KEY'],
    ...overrides,
  }
}

function equivalenceView(rows = [requiredSubject()]) {
  return {
    requiredSubjectView: rows,
    subjectCallView: rows.flatMap((row) => [
      {
        subjectKey: row.subjectKey,
        llamado: 'Primer llamado',
        callNumber: 'PRIMER_LLAMADO',
      },
      {
        subjectKey: row.subjectKey,
        llamado: 'Segundo llamado',
        callNumber: 'SEGUNDO_LLAMADO',
      },
    ]),
  }
}

describe('buildV2SubjectIdentityReview', () => {
  it('genera una fila por materia requerida', () => {
    const result = buildV2SubjectIdentityReview({
      equivalenceView: equivalenceView([
        requiredSubject(),
        requiredSubject({
          subjectKey: 'weak::profesoradodeingles::literaturaanglofona::4',
          materia_nombre: 'LITERATURA ANGLOFONA',
          anio: '4',
        }),
      ]),
    })

    expect(result.reviewRows).toHaveLength(2)
    expect(result.summary.totalRequiredSubjects).toBe(2)
  })

  it('marca weak key si falta plan_id + materia_codigo', () => {
    const result = buildV2SubjectIdentityReview({
      equivalenceView: equivalenceView(),
    })

    expect(result.reviewRows[0]).toMatchObject({
      riesgo_clave_debil: 'SI',
      requiere_revision: 'SI',
    })
    expect(result.reviewRows[0].motivo_revision).toContain('WEAK_KEY')
  })

  it('sugiere carrera_id', () => {
    const result = buildV2SubjectIdentityReview({
      equivalenceView: equivalenceView(),
    })

    expect(result.reviewRows[0].carrera_id_sugerido).toBe('ING')
  })

  it('no asigna definitivo LAB-2015/LAB-2024 sin dato firme', () => {
    const result = buildV2SubjectIdentityReview({
      equivalenceView: equivalenceView([
        requiredSubject({
          subjectKey: 'weak::tecnicaturasuperiorenlaboratorio::quimicageneral::2',
          carrera: 'Tecnicatura Superior en Laboratorio',
          materia_nombre: 'QUIMICA GENERAL',
          anio: '2',
        }),
      ]),
    })

    expect(result.reviewRows[0]).toMatchObject({
      carrera_id_sugerido: 'LAB',
      plan_id_sugerido: 'LAB-2015|LAB-2024',
      requiere_revision: 'SI',
    })
  })

  it('marca Laboratorio multipan como revision', () => {
    const result = buildV2SubjectIdentityReview({
      equivalenceView: equivalenceView([
        requiredSubject({
          subjectKey: 'weak::tecnicaturasuperiorenlaboratorio::quimicageneral::2',
          carrera: 'Tecnicatura Superior en Laboratorio',
          materia_nombre: 'QUIMICA GENERAL',
          anio: '2',
        }),
      ]),
    })

    expect(result.reviewRows[0]).toMatchObject({
      riesgo_laboratorio_multiplan: 'SI',
    })
    expect(result.reviewRows[0].motivo_revision).toContain('LABORATORIO_MULTIPLAN_REQUIERE_CONFIRMACION')
  })

  it('sugiere materia_codigo no definitivo', () => {
    const result = buildV2SubjectIdentityReview({
      equivalenceView: equivalenceView(),
    })

    expect(result.reviewRows[0].materia_codigo_sugerido).toContain('ING-3-')
    expect(result.reviewRows[0].observaciones_revision).toContain('no es codigo oficial')
  })

  it('marca readyForCompactFinalTableComparison false si hay claves debiles', () => {
    const result = buildV2SubjectIdentityReview({
      equivalenceView: equivalenceView(),
    })

    expect(result.summary.readyForCompactFinalTableComparison).toBe(false)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('no muta inputs', () => {
    const input = equivalenceView()
    const before = JSON.stringify(input)

    buildV2SubjectIdentityReview({ equivalenceView: input })

    expect(JSON.stringify(input)).toBe(before)
  })

  it('no expone nombres de personas en warnings/errors', () => {
    const result = buildV2SubjectIdentityReview({
      snapshot: {
        docentes: [{ docente: 'Nombre Personal Reservado' }],
        alumnos: [{ nombre: 'Alumno Personal Reservado' }],
      },
      equivalenceView: equivalenceView(),
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(serialized).not.toContain('Alumno Personal Reservado')
  })
})
