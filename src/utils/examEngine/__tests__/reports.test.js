import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRegularExamPlan } from '../planning/generateRegular.js'
import { buildPipelineReport } from '../validation/reports.js'

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
    candidates: [mesa({ id: 'cand-1' })],
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
      totalCompactaciones: 1,
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
      compactaciones: [{
        sourceMesaIds: ['mesa-a', 'mesa-b'],
        targetMesaId: 'mesa-1',
        motivo: 'Compactacion controlada por MISMO_TITULAR.',
        success: true,
      }],
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

describe('examEngine validation: buildPipelineReport', () => {
  it('devuelve OK cuando no hay errores ni pendientes graves', () => {
    const report = buildPipelineReport(reportInput())

    expect(report.status).toBe('OK')
    expect(report.executiveSummary).toMatchObject({
      totalMesasPlanificadas: 1,
      totalMesasSinFecha: 0,
      totalErroresCriticos: 0,
      totalAdvertencias: 0,
    })
  })

  it('devuelve WARNING cuando hay warnings pero plannedMesas utiles', () => {
    const report = buildPipelineReport(reportInput({
      warnings: [{
        code: 'CORRELATIVIDAD_MISMO_DIA',
        message: 'La correlativa queda el mismo dia.',
        severity: 'warning',
        mesaId: 'mesa-1',
      }],
    }))

    expect(report.status).toBe('WARNING')
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CORRELATIVIDAD_MISMO_DIA',
        suggestedAction: 'Revisar correlatividad.',
      }),
    ]))
  })

  it('devuelve CRITICAL cuando hay errores criticos', () => {
    const report = buildPipelineReport(reportInput({
      errors: [{
        code: 'TITULAR_REQUIRED',
        message: 'La mesa debe tener titular asignado.',
        severity: 'critical',
        mesaId: 'mesa-1',
        materia: 'Matematica I',
      }],
    }))

    expect(report.status).toBe('CRITICAL')
    expect(report.criticalErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TITULAR_REQUIRED',
        suggestedAction: 'Revisar titular de la materia.',
      }),
    ]))
  })

  it('resume mesas completas, con un vocal, sin tribunal, con fecha y sin fecha', () => {
    const report = buildPipelineReport(reportInput({
      plannedMesas: [
        mesa({ id: 'completa' }),
        mesa({ id: 'un-vocal', vocal2Id: '', estado: 'FECHA_TENTATIVA_CON_ALERTAS' }),
      ],
      unassignedMesas: [
        mesa({ id: 'sin-tribunal', titularId: '', vocal1Id: '', vocal2Id: '', fecha: '', fechaIso: '', estado: 'SIN_FECHA_TENTATIVA' }),
      ],
    }))

    expect(report.tablesSummary).toMatchObject({
      total: 3,
      completas: 1,
      conUnVocal: 1,
      sinTribunal: 1,
      conFechaTentativa: 2,
      sinFechaTentativa: 1,
    })
  })

  it('agrupa por carrera', () => {
    const report = buildPipelineReport(reportInput({
      plannedMesas: [
        mesa({ id: 'mat-1', carreraId: 'mat', carrera: 'Matematica' }),
        mesa({ id: 'ing-1', carreraId: 'ing', carrera: 'Ingles' }),
      ],
    }))

    expect(report.careersSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ carreraId: 'mat', carrera: 'Matematica', totalMesas: 1 }),
      expect.objectContaining({ carreraId: 'ing', carrera: 'Ingles', totalMesas: 1 }),
    ]))
  })

  it('agrupa por llamado respetando llamados canonicos', () => {
    const report = buildPipelineReport(reportInput({
      plannedMesas: [
        mesa({ id: 'primero', llamado: 'PRIMER_LLAMADO' }),
        mesa({ id: 'segundo', llamado: 'SEGUNDO_LLAMADO' }),
      ],
      unassignedMesas: [
        mesa({ id: 'especial', llamado: 'LLAMADO_ESPECIAL', fecha: '', fechaIso: '' }),
      ],
    }))

    expect(report.callsSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ llamado: 'PRIMER_LLAMADO', totalMesas: 1, conFecha: 1 }),
      expect.objectContaining({ llamado: 'SEGUNDO_LLAMADO', totalMesas: 1, conFecha: 1 }),
      expect.objectContaining({ llamado: 'LLAMADO_ESPECIAL', totalMesas: 1, sinFecha: 1 }),
    ]))
  })

  it('incluye resumen de compactacion y compactaciones omitidas', () => {
    const report = buildPipelineReport(reportInput({
      metadata: {
        compactMode: 'safe',
        compactacionEjecutada: true,
        compactaciones: [{ targetMesaId: 'compact-1', success: true }],
        skippedCompactaciones: [{ mesaIds: ['a', 'b'], reason: 'COMPACTACION_NO_SEGURA', detail: 'Riesgo institucional.' }],
      },
      summary: {
        compactMode: 'safe',
        totalCompactaciones: 1,
        stageSummaries: { tentativeDates: {} },
      },
    }))

    expect(report.compactationSummary).toMatchObject({
      compactMode: 'safe',
      compactacionEjecutada: true,
      totalCompactaciones: 1,
      totalSkipped: 1,
    })
    expect(report.compactationSummary.skipped[0]).toMatchObject({ reason: 'COMPACTACION_NO_SEGURA' })
  })

  it('incluye mesas sin fecha en datePlanningSummary', () => {
    const report = buildPipelineReport(reportInput({
      unassignedMesas: [
        mesa({ id: 'sin-fecha', fecha: '', fechaIso: '', reason: 'SIN_FECHA_VALIDA', detail: 'No hay fechas.' }),
      ],
    }))

    expect(report.datePlanningSummary.mesasSinFecha).toEqual(expect.arrayContaining([
      expect.objectContaining({ mesaId: 'sin-fecha', reason: 'SIN_FECHA_VALIDA' }),
    ]))
  })

  it('incluye pendingManualReview', () => {
    const report = buildPipelineReport(reportInput({
      plannedMesas: [mesa({ id: 'un-vocal', vocal2Id: '' })],
      metadata: {
        skippedCompactaciones: [{ mesaIds: ['a', 'b'], reason: 'COMPACTACION_NO_SEGURA' }],
        candidateExclusions: [{ materia: 'Fisica I', carrera: 'Fisica', reason: 'Sin llamado requerido.' }],
      },
    }))

    expect(report.pendingManualReview).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'MESA_CON_UN_VOCAL' }),
      expect.objectContaining({ type: 'COMPACTACION_OMITIDA' }),
      expect.objectContaining({ type: 'MATERIA_EXCLUIDA' }),
    ]))
  })

  it('genera recomendaciones practicas', () => {
    const report = buildPipelineReport(reportInput({
      errors: [{
        code: 'TITULAR_NO_DISPONIBLE',
        message: 'No disponible.',
        severity: 'critical',
        docenteId: 'doc-titular',
        docenteNombre: 'Ana Titular',
      }],
    }))

    expect(report.recommendations).toEqual(expect.arrayContaining([
      'Cargar disponibilidad del docente Ana Titular.',
    ]))
  })

  it('teachersSummary no duplica titularidades ni vocalias desde etapas intermedias', () => {
    const finalMesa = mesa({
      id: 'mesa-final',
      titularId: 'doc-titular',
      vocal1Id: 'doc-vocal-a',
      vocal2Id: 'doc-vocal-b',
    })
    const report = buildPipelineReport(reportInput({
      mesasPreliminares: [finalMesa],
      mesasConVocales: [finalMesa],
      mesasReparadas: [finalMesa],
      mesasCompactadas: [finalMesa],
      plannedMesas: [finalMesa],
      unassignedMesas: [],
    }))

    expect(report.teachersSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ docenteId: 'doc-titular', titularidades: 1, vocalias: 0 }),
      expect.objectContaining({ docenteId: 'doc-vocal-a', titularidades: 0, vocalias: 1 }),
      expect.objectContaining({ docenteId: 'doc-vocal-b', titularidades: 0, vocalias: 1 }),
    ]))
  })

  it('callsSummary cuenta errores por PRIMER_LLAMADO preservado en issue', () => {
    const report = buildPipelineReport(reportInput({
      errors: [{
        code: 'SIN_FECHA_VALIDA',
        message: 'No hay fecha valida.',
        severity: 'critical',
        mesaId: 'mesa-1',
        llamado: 'PRIMER_LLAMADO',
        reason: 'SIN_FECHA_VALIDA',
      }],
    }))

    expect(report.criticalErrors[0]).toMatchObject({
      llamado: 'PRIMER_LLAMADO',
      reason: 'SIN_FECHA_VALIDA',
    })
    expect(report.callsSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ llamado: 'PRIMER_LLAMADO', errores: 1 }),
    ]))
  })

  it('callsSummary cuenta warnings por SEGUNDO_LLAMADO inferido desde mesaId', () => {
    const report = buildPipelineReport(reportInput({
      plannedMesas: [
        mesa({ id: 'mesa-segundo', llamado: 'SEGUNDO_LLAMADO' }),
      ],
      warnings: [{
        code: 'CORRELATIVIDAD_MISMO_DIA',
        message: 'Correlativa el mismo dia.',
        severity: 'warning',
        mesaId: 'mesa-segundo',
      }],
    }))

    expect(report.callsSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ llamado: 'SEGUNDO_LLAMADO', advertencias: 1 }),
    ]))
  })

  it('issues sin llamado ni mesa inferible quedan como SIN_LLAMADO', () => {
    const report = buildPipelineReport(reportInput({
      warnings: [{
        code: 'PIPELINE_WARNING',
        message: 'Warning general.',
        severity: 'warning',
      }],
    }))

    expect(report.callsSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ llamado: 'SIN_LLAMADO', advertencias: 1 }),
    ]))
  })

  it('generateRegularExamPlan devuelve report', () => {
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

    expect(result.report).toMatchObject({
      title: expect.any(String),
      status: expect.any(String),
      executiveSummary: expect.any(Object),
    })
    expect(result.report.raw).not.toHaveProperty('report')
  })

  it('generateRegularExamPlan devuelve teachersSummary y callsSummary coherentes', () => {
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

    expect(result.report.teachersSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ docenteId: 'doc-titular', titularidades: 1 }),
      expect.objectContaining({ docenteId: 'doc-vocal-a', vocalias: 1 }),
      expect.objectContaining({ docenteId: 'doc-vocal-b', vocalias: 1 }),
    ]))
    expect(result.report.callsSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        llamado: 'PRIMER_LLAMADO',
        totalMesas: result.plannedMesas.length,
        conFecha: result.plannedMesas.length,
      }),
    ]))
  })

  it('no muta el resultado original', () => {
    const input = reportInput()
    const snapshot = structuredClone(input)

    buildPipelineReport(input)

    expect(input).toEqual(snapshot)
  })

  it('no importa cronogramaInteligente.js', () => {
    const source = readFileSync(join(process.cwd(), 'src/utils/examEngine/validation/reports.js'), 'utf8')

    expect(source).not.toContain('cronogramaInteligente')
    expect(source).not.toContain('useCronogramaGeneration')
  })
})
