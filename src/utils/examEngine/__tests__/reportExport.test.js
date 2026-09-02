import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRegularExamPlan } from '../planning/generateRegular.js'
import { buildPipelineReport } from '../validation/reports.js'
import {
  exportPipelineReportToJson,
  validatePipelineReportExport,
} from '../validation/exportReport.js'

function mesa(overrides = {}) {
  return {
    id: 'mesa-1',
    materiaId: 'MAT1',
    materia: 'Matematica I',
    carreraId: 'prof-mat',
    carrera: 'Profesorado de Matematica',
    llamado: 'PRIMER_LLAMADO',
    titularId: 'doc-titular',
    vocal1Id: 'doc-vocal-a',
    vocal2Id: 'doc-vocal-b',
    fecha: '2026-07-27',
    fechaIso: '2026-07-27',
    estado: 'FECHA_TENTATIVA',
    warnings: [],
    errors: [],
    ...overrides,
  }
}

function reportInput(overrides = {}) {
  return {
    diagnosis: { canGenerate: true },
    candidates: [mesa({ id: 'candidate-1' })],
    mesasPreliminares: [mesa()],
    mesasConVocales: [mesa()],
    mesasReparadas: [mesa()],
    mesasCompactadas: [mesa()],
    plannedMesas: [mesa()],
    unassignedMesas: [],
    errors: [],
    warnings: [],
    summary: {
      totalPlannedMesas: 1,
      totalUnassignedMesas: 0,
      compactMode: 'safe',
      totalCompactaciones: 0,
      stageSummaries: {
        tentativeDates: {
          mesasConFechaTentativa: 1,
          mesasSinFecha: 0,
          conflictosDisponibilidad: 0,
          conflictosCorrelatividad: 0,
        },
      },
    },
    metadata: {
      compactMode: 'safe',
      compactacionEjecutada: true,
      compactaciones: [],
      skippedCompactaciones: [],
      candidateExclusions: [],
    },
    ...overrides,
  }
}

function docente(overrides = {}) {
  return {
    id: 'doc-titular',
    nombre: 'Ana Titular',
    activo: true,
    carrera: 'Profesorado de Ingles',
    nombreMateria: 'Lengua Inglesa I',
    diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
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

describe('examEngine validation: exportPipelineReportToJson', () => {
  it('exporta JSON serializable y limpia valores no serializables', () => {
    const report = buildPipelineReport(reportInput())
    report.warnings.push({
      code: 'NON_SERIALIZABLE_WARNING',
      message: 'Warning con campos no serializables.',
      fn: () => 'no exportar',
      omitted: undefined,
    })
    report.raw.self = report.raw

    const exported = exportPipelineReportToJson(report)

    expect(() => JSON.stringify(exported)).not.toThrow()
    expect(exported.warnings[0]).not.toHaveProperty('fn')
    expect(exported.warnings[0]).not.toHaveProperty('omitted')
    expect(exported).not.toHaveProperty('raw')
    expect(validatePipelineReportExport(exported).valid).toBe(true)
  })

  it('no incluye raw por defecto', () => {
    const report = buildPipelineReport(reportInput())
    const exported = exportPipelineReportToJson(report)

    expect(exported).not.toHaveProperty('raw')
    expect(validatePipelineReportExport(exported).valid).toBe(true)
  })

  it('incluye raw si includeRaw=true de forma defensiva', () => {
    const report = buildPipelineReport(reportInput())
    report.raw.createdAt = new Date('2026-07-27T00:00:00.000Z')
    report.raw.unserializable = () => 'no exportar'

    const exported = exportPipelineReportToJson(report, { includeRaw: true })

    expect(exported.raw).toBeTruthy()
    expect(exported.raw.createdAt).toBe('2026-07-27T00:00:00.000Z')
    expect(exported.raw).not.toHaveProperty('unserializable')
    expect(validatePipelineReportExport(exported).valid).toBe(true)
  })

  it('incluye institutionName y periodLabel si se pasan', () => {
    const report = buildPipelineReport(reportInput())
    const exported = exportPipelineReportToJson(report, {
      institutionName: 'Instituto Superior',
      periodLabel: 'Julio 2026',
    })

    expect(exported.metadata).toMatchObject({
      institutionName: 'Instituto Superior',
      periodLabel: 'Julio 2026',
    })
  })

  it('no muta el report original', () => {
    const report = buildPipelineReport(reportInput())
    const snapshot = structuredClone(report)

    exportPipelineReportToJson(report, { includeRaw: true })

    expect(report).toEqual(snapshot)
  })

  it('funciona con report de generateRegularExamPlan', () => {
    const result = generateRegularExamPlan({
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
    })

    const exported = exportPipelineReportToJson(result.report, {
      institutionName: 'Instituto Superior',
      periodLabel: 'Regular 2026',
    })

    expect(exported).toMatchObject({
      metadata: expect.objectContaining({
        exportVersion: expect.any(String),
        title: expect.any(String),
        status: expect.any(String),
        institutionName: 'Instituto Superior',
        periodLabel: 'Regular 2026',
      }),
      executiveSummary: expect.any(Object),
      teachersSummary: expect.any(Array),
      callsSummary: expect.any(Array),
    })
    expect(() => JSON.stringify(exported)).not.toThrow()
    expect(validatePipelineReportExport(exported).valid).toBe(true)
  })

  it('export valido pasa validacion', () => {
    const report = buildPipelineReport(reportInput())
    const exported = exportPipelineReportToJson(report)
    const validation = validatePipelineReportExport(exported)

    expect(validation).toMatchObject({
      valid: true,
      errors: [],
    })
  })

  it('export sin metadata falla', () => {
    const report = buildPipelineReport(reportInput())
    const exported = exportPipelineReportToJson(report)

    delete exported.metadata

    const validation = validatePipelineReportExport(exported)

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_METADATA' }),
    ]))
  })

  it('export sin executiveSummary falla', () => {
    const report = buildPipelineReport(reportInput())
    const exported = exportPipelineReportToJson(report)

    delete exported.executiveSummary

    const validation = validatePipelineReportExport(exported)

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_EXECUTIVE_SUMMARY' }),
    ]))
  })

  it('export con funcion falla', () => {
    const report = buildPipelineReport(reportInput())
    const exported = exportPipelineReportToJson(report)
    exported.metadata.fn = () => 'no valido'

    const validation = validatePipelineReportExport(exported)

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FUNCTION_VALUE' }),
    ]))
  })

  it('export con undefined falla', () => {
    const report = buildPipelineReport(reportInput())
    const exported = exportPipelineReportToJson(report)
    exported.metadata.omitted = undefined

    const validation = validatePipelineReportExport(exported)

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNDEFINED_VALUE' }),
    ]))
  })

  it('export con referencia circular sin sanear falla', () => {
    const report = buildPipelineReport(reportInput())
    const exported = exportPipelineReportToJson(report)
    exported.metadata.self = exported.metadata

    const validation = validatePipelineReportExport(exported)

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CIRCULAR_REFERENCE' }),
    ]))
  })

  it('funciona con export real generado desde generateRegularExamPlan', () => {
    const result = generateRegularExamPlan({
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
    })
    const exported = exportPipelineReportToJson(result.report, { includeRaw: true })

    expect(validatePipelineReportExport(exported)).toMatchObject({
      valid: true,
      errors: [],
    })
  })

  it('no importa motor viejo ni UI', () => {
    const source = readFileSync(join(process.cwd(), 'src/utils/examEngine/validation/exportReport.js'), 'utf8')

    expect(source).not.toContain('cronogramaInteligente')
    expect(source).not.toContain('useCronogramaGeneration')
    expect(source).not.toContain('components')
    expect(source).not.toContain('hooks')
  })
})
