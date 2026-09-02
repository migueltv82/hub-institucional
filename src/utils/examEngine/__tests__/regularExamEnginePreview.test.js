import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularExamEnginePreview } from '../preview/buildRegularExamEnginePreview.js'
import { buildRegularExamPreviewUiDto } from '../preview/buildRegularExamPreviewUiDto.js'

function docente(overrides = {}) {
  return {
    id: 'doc-titular',
    nombre: 'Ana Titular',
    activo: true,
    carrera: 'Profesorado de Ingles',
    nombreMateria: 'Lengua Inglesa I',
    diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    horasCatedra: 5,
    turnosDisponibles: ['NOCHE'],
    ...overrides,
  }
}

function materia(overrides = {}) {
  return {
    id: 'ING1',
    materia: 'ING1',
    nombreMateria: 'Lengua Inglesa I',
    carreraId: 'prof-ingles',
    carrera: 'Profesorado de Ingles',
    anio: 1,
    titular_id: 'doc-titular',
    requiereMesa: true,
    ...overrides,
  }
}

function slot(fecha, llamado = 'PRIMER_LLAMADO') {
  return {
    fecha,
    diaSemana: 'LUNES',
    llamado,
    turno: 'NOCHE',
    disponible: true,
  }
}

function validInput(overrides = {}) {
  return {
    docentes: [
      docente(),
      docente({ id: 'doc-vocal-a', nombre: 'Bruno Vocal', nombreMateria: 'Lengua Inglesa II' }),
      docente({ id: 'doc-vocal-b', nombre: 'Carla Vocal', nombreMateria: 'Gramatica Inglesa' }),
    ],
    materias: [materia()],
    correlatividades: [],
    config: {
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    },
    fechasDisponibles: [slot('2026-07-27')],
    options: {},
    ...overrides,
  }
}

describe('examEngine preview: buildRegularExamEnginePreview', () => {
  it('devuelve DTO seguro con datos esperados', () => {
    const preview = buildRegularExamEnginePreview(validInput())

    expect(Object.keys(preview).sort()).toEqual([
      'errors',
      'exportValidation',
      'exportedReport',
      'metadata',
      'plannedMesas',
      'report',
      'status',
      'success',
      'summary',
      'unassignedMesas',
      'warnings',
    ].sort())
    expect(preview).toMatchObject({
      success: true,
      status: expect.any(String),
      summary: expect.any(Object),
      metadata: expect.objectContaining({
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 1,
      }),
    })
    expect(preview).not.toHaveProperty('diagnosis')
    expect(preview).not.toHaveProperty('candidates')
    expect(preview).not.toHaveProperty('mesasPreliminares')
    expect(preview).not.toHaveProperty('mesasConVocales')
    expect(preview).not.toHaveProperty('mesasReparadas')
    expect(preview).not.toHaveProperty('mesasCompactadas')
  })

  it('incluye plannedMesas y unassignedMesas', () => {
    const preview = buildRegularExamEnginePreview(validInput())

    expect(preview.plannedMesas).toHaveLength(1)
    expect(preview.unassignedMesas).toEqual([])
  })

  it('construye y valida el DTO dateAware usando el mismo contrato final', () => {
    const preview = buildRegularExamEnginePreview(validInput({
      options: { vocalPlanningMode: 'dateAware' },
    }))

    expect(preview.success).toBe(true)
    expect(preview.metadata.vocalPlanningMode).toBe('dateAware')
    expect(preview.plannedMesas).toHaveLength(1)
    expect(preview.unassignedMesas).toEqual([])
    expect(preview.plannedMesas[0]).toMatchObject({
      fecha: '2026-07-27',
      metadata: expect.objectContaining({
        dateAwareVocalSelection: true,
      }),
    })
    expect(preview.report).toMatchObject({
      executiveSummary: expect.any(Object),
      datePlanningSummary: expect.objectContaining({
        totalFechasTentativas: 1,
        totalSinFecha: 0,
      }),
    })
    expect(preview.exportValidation).toEqual(expect.objectContaining({
      valid: true,
      errors: [],
    }))
    const uiDto = buildRegularExamPreviewUiDto(preview)
    expect(uiDto.uiSummary).toMatchObject({
      totalPlanned: 1,
      totalUnassigned: 0,
    })
    expect(uiDto.uiTables.planned[0]).toMatchObject({
      fecha: '2026-07-27',
      titular: expect.objectContaining({ id: 'doc-titular' }),
      vocales: expect.arrayContaining([
        expect.objectContaining({ id: 'doc-vocal-a' }),
        expect.objectContaining({ id: 'doc-vocal-b' }),
      ]),
    })
  })

  it('incluye report', () => {
    const preview = buildRegularExamEnginePreview(validInput())

    expect(preview.report).toMatchObject({
      title: expect.any(String),
      status: expect.any(String),
      executiveSummary: expect.any(Object),
    })
  })

  it('incluye exportedReport validado', () => {
    const preview = buildRegularExamEnginePreview(validInput())

    expect(preview.exportedReport).toMatchObject({
      metadata: expect.any(Object),
      executiveSummary: expect.any(Object),
    })
    expect(preview.exportValidation).toMatchObject({
      valid: true,
      errors: [],
    })
  })

  it('exportValidation.valid es true con datos correctos', () => {
    const preview = buildRegularExamEnginePreview(validInput())

    expect(preview.exportValidation.valid).toBe(true)
  })

  it('no incluye raw por defecto', () => {
    const preview = buildRegularExamEnginePreview(validInput())

    expect(preview.exportedReport).not.toHaveProperty('raw')
  })

  it('no muta input', () => {
    const input = validInput()
    const snapshot = structuredClone(input)

    buildRegularExamEnginePreview(input)

    expect(input).toEqual(snapshot)
  })

  it('no importa cronogramaInteligente.js', () => {
    const source = readFileSync(join(process.cwd(), 'src/utils/examEngine/preview/buildRegularExamEnginePreview.js'), 'utf8')

    expect(source).not.toContain('cronogramaInteligente')
  })

  it('no importa useCronogramaGeneration.js', () => {
    const source = readFileSync(join(process.cwd(), 'src/utils/examEngine/preview/buildRegularExamEnginePreview.js'), 'utf8')

    expect(source).not.toContain('useCronogramaGeneration')
  })

  it('funciona con config regular de 1 llamado', () => {
    const preview = buildRegularExamEnginePreview(validInput({
      config: {
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 1,
        fechaInicio: '2026-07-27',
        fechaFin: '2026-08-07',
      },
    }))

    expect(preview.success).toBe(true)
    expect(preview.plannedMesas.map((mesa) => mesa.llamado)).toEqual(['PRIMER_LLAMADO'])
    expect(preview.summary.stageSummaries.tentativeDates.mesasPorLlamado).toEqual({
      PRIMER_LLAMADO: 1,
    })
  })
})
