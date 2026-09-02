import { describe, expect, it } from 'vitest'
import { diagnoseTemplateV2Readiness } from './diagnoseTemplateV2Readiness.js'

function completePlanRow(overrides = {}) {
  return {
    plan_id: 'LAB-2024',
    carrera_id: '2',
    carrera: 'Tecnicatura Superior en Laboratorio',
    materia_id: '101',
    materia_codigo: 'LAB24-QUIM1',
    materia: 'Quimica General',
    anio: '1',
    regimen: 'ANUAL',
    requiere_mesa: 'SI',
    ...overrides,
  }
}

describe('diagnoseTemplateV2Readiness', () => {
  it('detecta falta de plan_id en plan_estudios', () => {
    const snapshot = {
      planesEstudio: [
        completePlanRow({ plan_id: '' }),
      ],
    }

    const result = diagnoseTemplateV2Readiness(snapshot)

    expect(result.templateDiagnostics.planesEstudio.hasPlanId).toBe(false)
    expect(result.missingFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKey: 'planesEstudio',
        field: 'plan_id',
      }),
    ]))
  })

  it('detecta falta de materia_codigo', () => {
    const snapshot = {
      planesEstudio: [
        completePlanRow({ materia_id: '', materia_codigo: '', codigo: '' }),
      ],
    }

    const result = diagnoseTemplateV2Readiness(snapshot)

    expect(result.templateDiagnostics.planesEstudio.hasMateriaCodigo).toBe(false)
    expect(result.missingFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKey: 'planesEstudio',
        field: 'materia_codigo',
      }),
    ]))
  })

  it('detecta riesgo multiplan en Laboratorio', () => {
    const snapshot = {
      planesEstudio: [
        {
          carrera: 'Tecnicatura Superior en Laboratorio',
          materia: 'Quimica General',
          anio: '1',
          requiere_mesa: 'SI',
        },
      ],
    }

    const result = diagnoseTemplateV2Readiness(snapshot)

    expect(result.multiPlanRisks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MULTIPLAN_WITHOUT_PLAN_ID',
        sourceKey: 'planesEstudio',
        suggestedPlanIds: ['LAB-2015', 'LAB-2024'],
      }),
    ]))
  })

  it('detecta clave debil basada solo en materia_nombre', () => {
    const snapshot = {
      planesEstudio: [
        {
          carrera: 'Tecnicatura Superior en Laboratorio',
          materia: 'Quimica General',
          anio: '1',
          requiere_mesa: 'SI',
        },
      ],
    }

    const result = diagnoseTemplateV2Readiness(snapshot)

    expect(result.weakKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MATERIA_NOMBRE_ONLY_OR_PRIMARY',
        weakKey: 'materia_nombre',
      }),
    ]))
  })

  it('genera recomendacion para equivalencias_planes', () => {
    const result = diagnoseTemplateV2Readiness({
      planesEstudio: [completePlanRow()],
    })

    expect(result.recommendations.join(' ')).toContain('equivalencias_planes')
  })

  it('no muta el snapshot original', () => {
    const snapshot = {
      planesEstudio: [completePlanRow()],
      alumnos: [
        {
          alumno_id: 'A1',
          nombre: 'Persona Reservada',
          plan_id: 'LAB-2024',
          materia_codigo: 'LAB24-QUIM1',
          condicion: 'REGULAR',
        },
      ],
    }
    const before = JSON.stringify(snapshot)

    diagnoseTemplateV2Readiness(snapshot)

    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('calcula porcentaje de compatibilidad', () => {
    const result = diagnoseTemplateV2Readiness({
      planesEstudio: [completePlanRow()],
    })

    expect(result.templateDiagnostics.planesEstudio.compatibilityPercent).toBe(100)
    expect(result.summary.overallCompatibilityPercent).toBeGreaterThan(0)
  })

  it('no expone nombres completos de personas en warnings/errors', () => {
    const result = diagnoseTemplateV2Readiness({
      docentes: [
        {
          docente: 'Docente Reservado Uno',
          dni_docente: '123',
        },
      ],
      alumnos: [
        {
          nombre: 'Alumno Reservado Dos',
          dni: '456',
          materia: 'Quimica General',
        },
      ],
    })
    const diagnostics = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(diagnostics).not.toContain('Docente Reservado Uno')
    expect(diagnostics).not.toContain('Alumno Reservado Dos')
  })
})
