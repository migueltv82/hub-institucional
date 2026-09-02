import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildRegularPreviewInstitutionalFixture,
  regularPreviewInstitutionalCareers,
} from '../__fixtures__/regularPreviewInstitutionalFixture.js'
import { buildRegularExamEnginePreview } from '../preview/buildRegularExamEnginePreview.js'
import { getNivelAfinidadDocenteMesa } from '../rules/affinities.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'

function allPreviewMesas(preview) {
  return [...preview.plannedMesas, ...preview.unassignedMesas]
}

function getMesaSubjects(mesa = {}) {
  if (Array.isArray(mesa.materiasAgrupadas) && mesa.materiasAgrupadas.length) {
    return mesa.materiasAgrupadas.map((subject) => ({
      ...subject,
      llamado: subject.llamado ?? mesa.llamado,
    }))
  }

  return [{
    materiaId: mesa.materiaId,
    materia: mesa.materia,
    nombreMateria: mesa.materia,
    carreraId: mesa.carreraId,
    carrera: mesa.carrera,
    anio: mesa.anio,
    llamado: mesa.llamado,
  }]
}

function buildDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    map.set(docente.id, docente)
    return map
  }, new Map())
}

function buildParticipacionesFromPreview(preview) {
  return allPreviewMesas(preview).flatMap((mesa) => [
    { docenteId: mesa.vocal1Id, mesaId: mesa.id, rol: 'VOCAL_1', llamado: mesa.llamado },
    { docenteId: mesa.vocal2Id, mesaId: mesa.id, rol: 'VOCAL_2', llamado: mesa.llamado },
  ].filter((participacion) => participacion.docenteId))
}

function hasSubject(mesa = {}, subjectId = '') {
  return getMesaSubjects(mesa).some((subject) => subject.materiaId === subjectId || subject.materia === subjectId)
}

describe('examEngine preview: institutional fixture', () => {
  it('buildRegularExamEnginePreview devuelve DTO seguro con fixture institucional', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())

    expect(preview).toMatchObject({
      success: expect.any(Boolean),
      status: expect.any(String),
      plannedMesas: expect.any(Array),
      unassignedMesas: expect.any(Array),
      summary: expect.any(Object),
      report: expect.any(Object),
      exportedReport: expect.any(Object),
      exportValidation: expect.any(Object),
      errors: expect.any(Array),
      warnings: expect.any(Array),
      metadata: expect.any(Object),
    })
    expect(preview).not.toHaveProperty('candidates')
    expect(preview).not.toHaveProperty('mesasPreliminares')
    expect(preview).not.toHaveProperty('mesasConVocales')
  })

  it('exportValidation.valid es true y hay plannedMesas con reporte', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())

    expect(preview.exportValidation).toMatchObject({ valid: true, errors: [] })
    expect(preview.plannedMesas.length).toBeGreaterThan(0)
    expect(preview.report).toMatchObject({
      title: expect.any(String),
      executiveSummary: expect.any(Object),
    })
  })

  it('el fixture cubre varias carreras, materias y docentes', () => {
    const fixture = buildRegularPreviewInstitutionalFixture()
    const carreras = new Set(fixture.materias.map((materia) => materia.carrera))
    const anios = new Set(fixture.materias.map((materia) => materia.anio))

    expect(fixture.docentes.length).toBeGreaterThanOrEqual(15)
    expect(fixture.materias.length).toBeGreaterThanOrEqual(16)
    expect(carreras.size).toBe(regularPreviewInstitutionalCareers.length)
    expect(anios).toEqual(new Set([1, 2, 3, 4]))
  })

  it('respeta 1 llamado cuando config.cantidadLlamados = 1', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture({ cantidadLlamados: 1 }))
    const llamados = new Set(allPreviewMesas(preview).map((mesa) => mesa.llamado).filter(Boolean))

    expect(llamados).toEqual(new Set(['PRIMER_LLAMADO']))
    expect(preview.summary.stageSummaries.tentativeDates.mesasPorLlamado).not.toHaveProperty('SEGUNDO_LLAMADO')
  })

  it('respeta 2 llamados cuando config.cantidadLlamados = 2', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture({ cantidadLlamados: 2 }))
    const llamados = new Set(preview.plannedMesas.map((mesa) => mesa.llamado).filter(Boolean))

    expect(llamados.has('PRIMER_LLAMADO')).toBe(true)
    expect(llamados.has('SEGUNDO_LLAMADO')).toBe(true)
  })

  it('no compacta Practicas Discursivas III/IV', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const mesasPD = allPreviewMesas(preview).filter((mesa) => hasSubject(mesa, 'PD3') || hasSubject(mesa, 'PD4'))

    expect(mesasPD.length).toBeGreaterThan(0)
    mesasPD.forEach((mesa) => {
      expect(mesa.compactada).not.toBe(true)
      expect((mesa.materiasAgrupadas ?? []).length).toBeLessThanOrEqual(1)
    })
  })

  it('no usa titular como vocal ni duplica vocal1/vocal2', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())

    allPreviewMesas(preview).forEach((mesa) => {
      const vocales = [mesa.vocal1Id, mesa.vocal2Id].filter(Boolean)
      expect(vocales).not.toContain(mesa.titularId)
      if (vocales.length === 2) expect(mesa.vocal1Id).not.toBe(mesa.vocal2Id)
    })
  })

  it('respeta mitad mas uno', () => {
    const fixture = buildRegularPreviewInstitutionalFixture()
    const preview = buildRegularExamEnginePreview(fixture)
    const participaciones = buildParticipacionesFromPreview(preview)

    fixture.docentes.forEach((docente) => {
      const limite = calcularLimiteVocaliasPorLlamado(docente)
      ;['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'].forEach((llamado) => {
        expect(contarVocaliasPorDocente(participaciones, docente.id, llamado)).toBeLessThanOrEqual(limite)
      })
    })
  })

  it('respeta afinidad de vocales', () => {
    const fixture = buildRegularPreviewInstitutionalFixture()
    const preview = buildRegularExamEnginePreview(fixture)
    const docentes = buildDocenteMap(fixture.docentes)

    allPreviewMesas(preview).forEach((mesa) => {
      ;[mesa.vocal1Id, mesa.vocal2Id].filter(Boolean).forEach((docenteId) => {
        const docente = docentes.get(docenteId)
        expect(docente).toBeTruthy()
        getMesaSubjects(mesa).forEach((subject) => {
          expect(getNivelAfinidadDocenteMesa(docente, subject).afinidadValida).toBe(true)
        })
      })
    })
  })

  it('incluye warnings o pendingManualReview cuando corresponde', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())

    expect(
      preview.warnings.length +
      preview.report.warnings.length +
      preview.report.pendingManualReview.length,
    ).toBeGreaterThan(0)
  })

  it('no muta el fixture', () => {
    const fixture = buildRegularPreviewInstitutionalFixture()
    const snapshot = structuredClone(fixture)

    buildRegularExamEnginePreview(fixture)

    expect(fixture).toEqual(snapshot)
  })

  it('no importa motor viejo ni UI', () => {
    const fixtureSource = readFileSync(join(process.cwd(), 'src/utils/examEngine/__fixtures__/regularPreviewInstitutionalFixture.js'), 'utf8')
    const testSource = readFileSync(join(process.cwd(), 'src/utils/examEngine/__tests__/regularPreviewInstitutionalFixture.test.js'), 'utf8')
    const combined = `${fixtureSource}\n${testSource}`
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const legacy = ['legacy', 'Adapter'].join('')
    const uiComponents = ['compo', 'nents'].join('')
    const uiHooks = ['ho', 'oks'].join('')

    expect(combined).not.toContain(oldEngine)
    expect(combined).not.toContain(oldHook)
    expect(combined).not.toContain(legacy)
    expect(combined).not.toContain(uiComponents)
    expect(combined).not.toContain(uiHooks)
  })
})
