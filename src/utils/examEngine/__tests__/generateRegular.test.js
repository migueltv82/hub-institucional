import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRegularExamPlan } from '../planning/generateRegular.js'

function docente(overrides = {}) {
  return {
    id: 'doc-titular',
    nombre: 'Ana Titular',
    activo: true,
    carrera: 'Profesorado de Ingles',
    nombreMateria: 'Lengua Inglesa I',
    diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    // horasCatedra=5 preserva el mismo limite (floor(5/2)+1=3) que daba el
    // modo historico por dias, ahora que la validacion de produccion fuerza
    // TEACHING_HOURS_HALF_PLUS_ONE explicitamente.
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

function slot(fecha, llamado = 'PRIMER_LLAMADO', turno = 'NOCHE', diaSemana = 'LUNES') {
  return {
    fecha,
    diaSemana,
    llamado,
    turno,
    disponible: true,
  }
}

const titular = docente()
const vocalA = docente({
  id: 'doc-vocal-a',
  nombre: 'Bruno Vocal',
  nombreMateria: 'Lengua Inglesa II',
})
const vocalB = docente({
  id: 'doc-vocal-b',
  nombre: 'Carla Vocal',
  nombreMateria: 'Gramatica Inglesa',
})

const configRegularOneCall = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 1,
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
}

const configRegularTwoCalls = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 2,
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
}

const configSpecialOneCall = {
  tipoPeriodo: 'ESPECIAL',
  cantidadLlamados: 1,
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
}

function validInput(overrides = {}) {
  return {
    docentes: [titular, vocalA, vocalB],
    materias: [materia()],
    correlatividades: [],
    config: configRegularOneCall,
    fechasDisponibles: [
      slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      slot('2026-07-28', 'SEGUNDO_LLAMADO', 'NOCHE', 'MARTES'),
      slot('2026-07-27', 'LLAMADO_ESPECIAL', 'NOCHE', 'LUNES'),
    ],
    options: {},
    ...overrides,
  }
}

function comparablePlanOutput(result = {}) {
  return {
    plannedMesas: result.plannedMesas,
    unassignedMesas: result.unassignedMesas,
    summary: result.summary,
  }
}

describe('examEngine planning: generateRegularExamPlan', () => {
  it('si el diagnostico falla no avanza sin force', () => {
    const result = generateRegularExamPlan(validInput({
      materias: [materia({ titular_id: '' })],
    }))

    expect(result.success).toBe(false)
    expect(result.metadata.stopped).toBe(true)
    expect(result.metadata.stoppedReason).toBe('DIAGNOSIS_FAILED')
    expect(result.metadata.completedStages).toEqual(['DIAGNOSIS'])
    expect(result.candidates).toEqual([])
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MATERIA_SIN_TITULAR' }),
    ]))
  })

  it('si options.force = true avanza con warnings', () => {
    const result = generateRegularExamPlan(validInput({
      docentes: [titular],
      options: { force: true },
    }))

    expect(result.success).toBe(false)
    expect(result.metadata.stopped).toBe(false)
    expect(result.metadata.forced).toBe(true)
    expect(result.metadata.completedStages).toEqual(expect.arrayContaining([
      'DIAGNOSIS',
      'BUILD_CANDIDATES',
      'PLAN_TENTATIVE_DATES',
    ]))
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'GENERATION_FORCED_WITH_DIAGNOSTIC_ERRORS' }),
    ]))
  })

  it('con datos minimos validos devuelve plannedMesas', () => {
    const result = generateRegularExamPlan(validInput())

    expect(result.success).toBe(true)
    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0]).toMatchObject({
      materiaId: 'ING1',
      llamado: 'PRIMER_LLAMADO',
      fecha: '2026-07-27',
      estado: 'FECHA_TENTATIVA',
    })
    expect(result.unassignedMesas).toEqual([])
  })

  it('usa vocalPlanningMode current por defecto sin cambiar la salida del pipeline', () => {
    const defaultResult = generateRegularExamPlan(validInput())
    const currentResult = generateRegularExamPlan(validInput({
      options: {
        vocalPlanningMode: 'current',
      },
    }))

    expect(defaultResult.metadata.vocalPlanningMode).toBe('current')
    expect(currentResult.metadata.vocalPlanningMode).toBe('current')
    expect(comparablePlanOutput(currentResult)).toEqual(comparablePlanOutput(defaultResult))
  })

  it('mantiene current identico al default y ejecuta el pipeline dateAware con el contrato esperado', () => {
    const defaultResult = generateRegularExamPlan(validInput())
    const currentResult = generateRegularExamPlan(validInput({
      options: {
        vocalPlanningMode: 'current',
      },
    }))
    const dateAwareResult = generateRegularExamPlan(validInput({
      options: {
        vocalPlanningMode: 'dateAware',
      },
    }))

    expect(currentResult).toEqual({
      ...defaultResult,
      report: {
        ...defaultResult.report,
        generatedAt: currentResult.report.generatedAt,
      },
    })
    expect(currentResult.metadata.completedStages).toContain('ASSIGN_VOCALES')
    expect(currentResult.metadata.completedStages).toContain('PLAN_TENTATIVE_DATES')
    expect(currentResult.metadata.completedStages).not.toContain('PLAN_DATES_AND_VOCALES')
    expect(currentResult.summary.stageSummaries.compaction).not.toHaveProperty('requireSameDateAndTurno')
    expect(currentResult.metadata).not.toHaveProperty('dateAwareCompatibility')
    expect(dateAwareResult.metadata.vocalPlanningMode).toBe('dateAware')
    expect(dateAwareResult.metadata.completedStages).toContain('PLAN_DATES_AND_VOCALES')
    expect(dateAwareResult.metadata.completedStages).not.toContain('ASSIGN_VOCALES')
    expect(dateAwareResult.metadata.completedStages).not.toContain('PLAN_TENTATIVE_DATES')
    expect(dateAwareResult.summary.stageSummaries.compaction.requireSameDateAndTurno).toBe(true)
    expect(dateAwareResult.metadata.dateAwareCompatibility.repairStrategy).toBe('repairIncompleteTribunalVocals')
    expect(dateAwareResult.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ENGINE_STAGE_ERROR' }),
    ]))
    expect(dateAwareResult.errors).toEqual([])
    expect(dateAwareResult.success).toBe(true)
    expect(dateAwareResult.plannedMesas).toEqual(expect.any(Array))
    expect(dateAwareResult.unassignedMesas).toEqual(expect.any(Array))
    expect(dateAwareResult.plannedMesas).toHaveLength(1)
    expect(dateAwareResult.unassignedMesas).toHaveLength(0)
    expect(dateAwareResult.plannedMesas[0]).toMatchObject({
      materiaId: 'ING1',
      fecha: '2026-07-27',
      turno: 'NOCHE',
    })
  })

  it('respeta config con 1 llamado', () => {
    const result = generateRegularExamPlan(validInput({
      config: configRegularOneCall,
    }))

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas.map((mesa) => mesa.llamado)).toEqual(['PRIMER_LLAMADO'])
    expect(result.summary.stageSummaries.tentativeDates.mesasPorLlamado).toEqual({
      PRIMER_LLAMADO: 1,
    })
  })

  it('respeta config con 2 llamados', () => {
    const result = generateRegularExamPlan(validInput({
      config: configRegularTwoCalls,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'SEGUNDO_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    }))

    expect(result.success).toBe(true)
    expect(result.plannedMesas).toHaveLength(2)
    expect(result.summary.stageSummaries.tentativeDates.mesasPorLlamado).toEqual({
      PRIMER_LLAMADO: 1,
      SEGUNDO_LLAMADO: 1,
    })
  })

  it('respeta periodo especial con LLAMADO_ESPECIAL', () => {
    const result = generateRegularExamPlan(validInput({
      config: configSpecialOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'LLAMADO_ESPECIAL', 'NOCHE', 'LUNES'),
      ],
    }))

    expect(result.success).toBe(true)
    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0]).toMatchObject({
      llamado: 'LLAMADO_ESPECIAL',
      fecha: '2026-07-27',
    })
  })

  it('propaga errors y warnings de etapas internas', () => {
    const result = generateRegularExamPlan(validInput({
      fechasDisponibles: [],
    }))

    expect(result.success).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SIN_FECHA_VALIDA',
        stage: 'PLAN_TENTATIVE_DATES',
      }),
    ]))
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TURNO_NO_DEFINIDO',
        stage: 'ASSIGN_TITULARES',
      }),
    ]))
  })

  it('devuelve summary consolidado', () => {
    const result = generateRegularExamPlan(validInput())

    expect(result.summary).toMatchObject({
      totalDocentes: 3,
      totalMaterias: 1,
      totalCandidates: 1,
      totalMesasPreliminares: 1,
      totalMesasConVocales: 1,
      totalMesasReparadas: 1,
      totalMesasCompactadas: 1,
      totalPlannedMesas: 1,
      totalUnassignedMesas: 0,
    })
    expect(result.summary.stageSummaries).toHaveProperty('candidates')
    expect(result.summary.stageSummaries).toHaveProperty('tentativeDates')
  })

  it('no muta datos originales', () => {
    const input = validInput()
    const snapshot = structuredClone(input)

    generateRegularExamPlan(input)

    expect(input).toEqual(snapshot)
  })

  it('no toca ni importa cronogramaInteligente.js', () => {
    const source = readFileSync(join(process.cwd(), 'src/utils/examEngine/planning/generateRegular.js'), 'utf8')

    expect(source).not.toContain('cronogramaInteligente')
    expect(source).not.toContain('useCronogramaGeneration')
  })
})
