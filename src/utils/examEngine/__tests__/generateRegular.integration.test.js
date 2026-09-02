import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRegularExamPlan } from '../planning/generateRegular.js'

function docente(overrides = {}) {
  return {
    id: 'doc-ing-1',
    nombre: 'Ana Ingles I',
    activo: true,
    carrera: 'Profesorado de Ingles',
    nombreMateria: 'Ingles I',
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
    nombreMateria: 'Ingles I',
    carreraId: 'prof-ingles',
    carrera: 'Profesorado de Ingles',
    anio: 1,
    titular_id: 'doc-ing-1',
    requiereMesa: true,
    ...overrides,
  }
}

function fecha(fechaIso, llamado = 'PRIMER_LLAMADO', turno = 'NOCHE', diaSemana = 'LUNES') {
  return {
    fecha: fechaIso,
    diaSemana,
    llamado,
    turno,
    disponible: true,
  }
}

const configRegularUno = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 1,
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
}

const configRegularDos = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 2,
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
}

const configEspecialUno = {
  tipoPeriodo: 'ESPECIAL',
  cantidadLlamados: 1,
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
}

const titularInglesI = docente()
const titularInglesII = docente({
  id: 'doc-ing-2',
  nombre: 'Beatriz Ingles II',
  nombreMateria: 'Ingles II',
})
const vocalInglesA = docente({
  id: 'doc-vocal-a',
  nombre: 'Carlos Ingles',
  carrera: 'Traductorado de Ingles',
  nombreMateria: 'Lengua Inglesa',
})
const vocalInglesB = docente({
  id: 'doc-vocal-b',
  nombre: 'Diana Ingles',
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Gramatica Inglesa',
})
const vocalInglesC = docente({
  id: 'doc-vocal-c',
  nombre: 'Elena Ingles',
  carrera: 'Traductorado de Ingles',
  nombreMateria: 'Fonetica Inglesa',
})
const vocalInglesD = docente({
  id: 'doc-vocal-d',
  nombre: 'Fabian Ingles',
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Literatura Inglesa',
})
const docenteSinAfinidad = docente({
  id: 'doc-historia',
  nombre: 'Hector Historia',
  carrera: 'Profesorado de Historia',
  nombreMateria: 'Historia Antigua',
})

const docentesBase = [
  titularInglesI,
  titularInglesII,
  vocalInglesA,
  vocalInglesB,
  vocalInglesC,
  vocalInglesD,
  docenteSinAfinidad,
]

const materiasCorrelativas = [
  materia({
    id: 'ING1',
    materia: 'ING1',
    nombreMateria: 'Ingles I',
    anio: 1,
    titular_id: 'doc-ing-1',
  }),
  materia({
    id: 'ING2',
    materia: 'ING2',
    nombreMateria: 'Ingles II',
    anio: 2,
    titular_id: 'doc-ing-2',
  }),
]

const correlatividadesIngles = [
  {
    carrera: 'Profesorado de Ingles',
    carreraId: 'prof-ingles',
    materia: 'ING2',
    nombreMateria: 'Ingles II',
    correlativas: ['ING1'],
  },
]

const creditosTitularesAltos = {
  'doc-ing-1': 50,
  'doc-ing-2': 50,
}

function baseInput(overrides = {}) {
  return {
    docentes: docentesBase,
    materias: materiasCorrelativas,
    correlatividades: correlatividadesIngles,
    config: configRegularUno,
    fechasDisponibles: [
      fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      fecha('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      fecha('2026-08-03', 'SEGUNDO_LLAMADO', 'NOCHE', 'LUNES'),
      fecha('2026-08-04', 'SEGUNDO_LLAMADO', 'NOCHE', 'MARTES'),
      fecha('2026-07-30', 'LLAMADO_ESPECIAL', 'NOCHE', 'JUEVES'),
    ],
    options: {
      creditosIniciales: creditosTitularesAltos,
    },
    ...overrides,
  }
}

function crossTitularCompactInput(compact) {
  return baseInput({
    docentes: docentesBase,
    materias: [
      materia({ id: 'LEN-A', materia: 'LEN-A', nombreMateria: 'Lengua Inglesa', titular_id: 'doc-ing-1' }),
      materia({ id: 'LEN-B', materia: 'LEN-B', nombreMateria: 'Lengua Inglesa', titular_id: 'doc-ing-2' }),
    ],
    correlatividades: [],
    fechasDisponibles: [
      fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      fecha('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
    ],
    options: {
      compact,
      creditosIniciales: creditosTitularesAltos,
    },
  })
}

function unique(values) {
  return [...new Set(values)]
}

function countVocaliasByDocenteAndCall(mesas = []) {
  return mesas.reduce((summary, mesa) => {
    ;[mesa.vocal1Id, mesa.vocal2Id].filter(Boolean).forEach((docenteId) => {
      const key = `${docenteId}:${mesa.llamado}`
      summary[key] = (summary[key] ?? 0) + 1
    })
    return summary
  }, {})
}

describe('examEngine integration: generateRegularExamPlan', () => {
  it('pipeline completo con dos materias correlativas respeta orden Ingles I antes de Ingles II', () => {
    const result = generateRegularExamPlan(baseInput())
    const inglesI = result.plannedMesas.find((mesa) => mesa.materiaId === 'ING1')
    const inglesII = result.plannedMesas.find((mesa) => mesa.materiaId === 'ING2')
    const groupedIngles = result.plannedMesas.find((mesa) => (
      Array.isArray(mesa.materiasAgrupadas) &&
      mesa.materiasAgrupadas.some((subject) => subject.materiaId === 'ING1') &&
      mesa.materiasAgrupadas.some((subject) => subject.materiaId === 'ING2')
    ))

    expect(result.success).toBe(true)
    expect(result.metadata.completedStages).toEqual(expect.arrayContaining([
      'DIAGNOSIS',
      'BUILD_CANDIDATES',
      'ASSIGN_TITULARES',
      'ASSIGN_VOCALES',
      'REPAIR_TRIBUNALS',
      'VALIDATE_TRIBUNALS',
      'COMPACT_MESAS',
      'PLAN_TENTATIVE_DATES',
    ]))
    if (groupedIngles) {
      expect(groupedIngles.llamado).toBe('PRIMER_LLAMADO')
      expect(groupedIngles.materiasAgrupadas).toHaveLength(2)
    } else {
      expect(inglesI).toBeTruthy()
      expect(inglesII).toBeTruthy()
      expect(inglesII.fecha >= inglesI.fecha).toBe(true)
    }
    expect(result.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CORRELATIVIDAD_CONFLICTIVA' }),
    ]))
  })

  it('config regular con 1 llamado genera solo PRIMER_LLAMADO y no exige segundo llamado', () => {
    const result = generateRegularExamPlan(baseInput({
      config: configRegularUno,
    }))

    expect(unique(result.plannedMesas.map((mesa) => mesa.llamado))).toEqual(['PRIMER_LLAMADO'])
    expect(result.candidates).toHaveLength(2)
    expect(result.summary.stageSummaries.tentativeDates.mesasPorLlamado).toEqual({
      PRIMER_LLAMADO: result.plannedMesas.length,
    })
    expect(result.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SUBJECT_WITHOUT_REQUIRED_CALLS' }),
    ]))
  })

  it('config regular con 2 llamados genera PRIMER_LLAMADO y SEGUNDO_LLAMADO', () => {
    const result = generateRegularExamPlan(baseInput({
      materias: [materia()],
      correlatividades: [],
      config: configRegularDos,
      fechasDisponibles: [
        fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        fecha('2026-08-03', 'SEGUNDO_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    }))

    expect(result.success).toBe(true)
    expect(unique(result.plannedMesas.map((mesa) => mesa.llamado)).sort()).toEqual([
      'PRIMER_LLAMADO',
      'SEGUNDO_LLAMADO',
    ])
    expect(result.summary.stageSummaries.tentativeDates.mesasPorLlamado).toEqual({
      PRIMER_LLAMADO: 1,
      SEGUNDO_LLAMADO: 1,
    })
  })

  it('periodo especial trabaja con LLAMADO_ESPECIAL', () => {
    const result = generateRegularExamPlan(baseInput({
      materias: [materia()],
      correlatividades: [],
      config: configEspecialUno,
      fechasDisponibles: [
        fecha('2026-07-30', 'LLAMADO_ESPECIAL', 'NOCHE', 'JUEVES'),
      ],
    }))

    expect(result.success).toBe(true)
    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0]).toMatchObject({
      llamado: 'LLAMADO_ESPECIAL',
      fecha: '2026-07-30',
    })
  })

  it('compacta materias compatibles y respeta Practicas Discursivas III/IV como no agrupables', () => {
    const compactableResult = generateRegularExamPlan(baseInput({
      docentes: [titularInglesI, vocalInglesA, vocalInglesB],
      materias: [
        materia({ id: 'LEN-A', materia: 'LEN-A', nombreMateria: 'Lengua Inglesa', titular_id: 'doc-ing-1' }),
        materia({ id: 'LEN-B', materia: 'LEN-B', nombreMateria: 'Lengua Inglesa', titular_id: 'doc-ing-1' }),
      ],
      correlatividades: [],
      fechasDisponibles: [
        fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
      options: {},
    }))
    const nonGroupableResult = generateRegularExamPlan(baseInput({
      docentes: [titularInglesI, vocalInglesA, vocalInglesB],
      materias: [
        materia({ id: 'PD3', materia: 'PD3', nombreMateria: 'Practicas Discursivas III', titular_id: 'doc-ing-1' }),
        materia({ id: 'PD4', materia: 'PD4', nombreMateria: 'Practicas Discursivas IV', titular_id: 'doc-ing-1' }),
      ],
      correlatividades: [],
      fechasDisponibles: [
        fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        fecha('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
      options: {},
    }))

    expect(compactableResult.metadata.compactaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({ success: true }),
    ]))
    expect(compactableResult.mesasCompactadas).toHaveLength(1)
    expect(compactableResult.plannedMesas).toHaveLength(1)

    expect(nonGroupableResult.metadata.compactaciones).toEqual([])
    expect(nonGroupableResult.metadata.skippedCompactaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'MATERIA_NO_AGRUPABLE' }),
    ]))
    expect(nonGroupableResult.mesasCompactadas).toHaveLength(2)
  })

  it('options.compact = false no ejecuta compactacion y conserva las mesas reparadas', () => {
    const result = generateRegularExamPlan(crossTitularCompactInput(false))

    expect(result.metadata).toMatchObject({
      compactMode: false,
      compactacionEjecutada: false,
    })
    expect(result.metadata.completedStages).not.toContain('COMPACT_MESAS')
    expect(result.metadata.compactaciones).toEqual([])
    expect(result.summary).toMatchObject({
      compactMode: false,
      totalCompactaciones: 0,
      totalMesasAntesCompactacion: 2,
      totalMesasDespuesCompactacion: 2,
    })
    expect(result.mesasCompactadas).toHaveLength(2)
  })

  it('options.compact = "safe" ejecuta compactacion segura y evita tribunal cruzado riesgoso', () => {
    const result = generateRegularExamPlan(crossTitularCompactInput('safe'))

    expect(result.metadata).toMatchObject({
      compactMode: 'safe',
      compactacionEjecutada: true,
    })
    expect(result.metadata.completedStages).toContain('COMPACT_MESAS')
    expect(result.metadata.compactaciones).toEqual([])
    expect(result.metadata.skippedCompactaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'COMPACTACION_NO_SEGURA' }),
    ]))
    expect(result.summary).toMatchObject({
      compactMode: 'safe',
      totalCompactaciones: 0,
      totalMesasAntesCompactacion: 2,
      totalMesasDespuesCompactacion: 2,
    })
  })

  it('options.compact = true ejecuta compactacion completa', () => {
    const result = generateRegularExamPlan(crossTitularCompactInput(true))

    expect(result.metadata).toMatchObject({
      compactMode: true,
      compactacionEjecutada: true,
    })
    expect(result.metadata.compactaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({
        success: true,
        tribunalCruzado: true,
      }),
    ]))
    expect(result.summary).toMatchObject({
      compactMode: true,
      totalCompactaciones: 1,
      totalMesasAntesCompactacion: 2,
      totalMesasDespuesCompactacion: 1,
    })
    expect(result.mesasCompactadas).toHaveLength(1)
  })

  it('sin options.compact usa modo safe por defecto y compact=false deja igual o mas mesas que compact=true', () => {
    const defaultResult = generateRegularExamPlan(crossTitularCompactInput(undefined))
    const noCompactResult = generateRegularExamPlan(crossTitularCompactInput(false))
    const fullCompactResult = generateRegularExamPlan(crossTitularCompactInput(true))

    expect(defaultResult.metadata.compactMode).toBe('safe')
    expect(defaultResult.metadata.compactacionEjecutada).toBe(true)
    expect(noCompactResult.mesasCompactadas.length).toBeGreaterThanOrEqual(fullCompactResult.mesasCompactadas.length)
    expect(noCompactResult.plannedMesas.length).toBeGreaterThanOrEqual(fullCompactResult.plannedMesas.length)
  })

  it('Practicas Discursivas III/IV no se compactan en ningun modo', () => {
    ;[false, 'safe', true].forEach((compact) => {
      const result = generateRegularExamPlan(baseInput({
        docentes: [titularInglesI, vocalInglesA, vocalInglesB],
        materias: [
          materia({ id: 'PD3', materia: 'PD3', nombreMateria: 'Practicas Discursivas III', titular_id: 'doc-ing-1' }),
          materia({ id: 'PD4', materia: 'PD4', nombreMateria: 'Practicas Discursivas IV', titular_id: 'doc-ing-1' }),
        ],
        correlatividades: [],
        fechasDisponibles: [
          fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
          fecha('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
        ],
        options: {
          compact,
        },
      }))

      expect(result.metadata.compactaciones).toEqual([])
      expect(result.mesasCompactadas).toHaveLength(2)
      expect(result.summary.totalCompactaciones).toBe(0)
    })
  })

  it('asigna vocales afines sin usar titular propio, duplicar vocales ni superar mitad mas uno', () => {
    const result = generateRegularExamPlan(baseInput())
    const vocaliasPorDocenteYLlamado = countVocaliasByDocenteAndCall(result.mesasConVocales)

    expect(result.mesasConVocales).toHaveLength(2)
    result.mesasConVocales.forEach((mesa) => {
      expect(mesa.vocal1Id).toBeTruthy()
      expect(mesa.vocal2Id).toBeTruthy()
      expect(mesa.vocal1Id).not.toBe(mesa.titularId)
      expect(mesa.vocal2Id).not.toBe(mesa.titularId)
      expect(mesa.vocal1Id).not.toBe(mesa.vocal2Id)
      expect([mesa.vocal1Id, mesa.vocal2Id]).not.toContain('doc-historia')
    })
    Object.values(vocaliasPorDocenteYLlamado).forEach((cantidad) => {
      expect(cantidad).toBeLessThanOrEqual(3)
    })
  })

  it('usa candidatos vocales preconstruidos en la asignacion sin fallback duplicado', () => {
    const result = generateRegularExamPlan(baseInput())

    expect(result.summary.stageSummaries.vocalCandidates).toMatchObject({
      totalMesas: result.mesasPreliminares.length,
      totalCandidatosValidos: expect.any(Number),
      totalCandidatosRechazados: expect.any(Number),
    })
    expect(result.summary.stageSummaries.vocales).toMatchObject({
      prebuiltCandidatesUsed: result.mesasPreliminares.length,
      fallbackCandidatesBuilt: 0,
    })
    expect(result.metadata.vocalCandidateSummary).toHaveLength(result.mesasPreliminares.length)
    result.mesasConVocales.forEach((mesa) => {
      expect(mesa.metadata).toMatchObject({
        vocalCandidateSource: 'prebuilt',
      })
    })
  })

  it('intenta reparar mesas con un solo vocal y deja warning claro si no puede completar', () => {
    const result = generateRegularExamPlan(baseInput({
      docentes: [titularInglesI, vocalInglesA, docenteSinAfinidad],
      materias: [materia()],
      correlatividades: [],
      fechasDisponibles: [
        fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
      options: {},
    }))

    expect(result.mesasConVocales[0]).toMatchObject({
      estado: 'CON_UN_VOCAL',
      vocal1Id: 'doc-vocal-a',
      vocal2Id: null,
    })
    expect(result.mesasReparadas[0]).toMatchObject({
      estado: 'CON_UN_VOCAL',
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REPARACION_QUEDA_CON_UN_VOCAL' }),
    ]))
    expect(result.plannedMesas[0]).toMatchObject({
      estado: 'FECHA_TENTATIVA_CON_ALERTAS',
    })
  })

  it('planifica fechas tentativas solo con disponibilidad docente y respetando turno', () => {
    const availableResult = generateRegularExamPlan(baseInput({
      materias: [materia()],
      correlatividades: [],
      fechasDisponibles: [
        fecha('2026-07-27', 'PRIMER_LLAMADO', 'TARDE', 'LUNES'),
        fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    }))
    const unavailableResult = generateRegularExamPlan(baseInput({
      docentes: [
        docente({
          id: 'doc-ing-1',
          nombre: 'Ana Ingles I',
          nombreMateria: 'Ingles I',
          diasAsistencia: ['martes'],
        }),
        vocalInglesA,
        vocalInglesB,
      ],
      materias: [materia()],
      correlatividades: [],
      fechasDisponibles: [
        fecha('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
      options: {},
    }))

    expect(availableResult.plannedMesas).toHaveLength(1)
    expect(availableResult.plannedMesas[0]).toMatchObject({
      fecha: '2026-07-27',
      turno: 'NOCHE',
    })
    expect(unavailableResult.success).toBe(false)
    expect(unavailableResult.unassignedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'TITULAR_NO_DISPONIBLE' }),
    ]))
  })

  it('devuelve la estructura final completa del pipeline', () => {
    const result = generateRegularExamPlan(baseInput())

    expect(result).toMatchObject({
      success: expect.any(Boolean),
      diagnosis: expect.any(Object),
      candidates: expect.any(Array),
      mesasPreliminares: expect.any(Array),
      mesasConVocales: expect.any(Array),
      mesasReparadas: expect.any(Array),
      mesasCompactadas: expect.any(Array),
      plannedMesas: expect.any(Array),
      unassignedMesas: expect.any(Array),
      errors: expect.any(Array),
      warnings: expect.any(Array),
      summary: expect.any(Object),
    })
    expect(result.summary).toMatchObject({
      totalDocentes: docentesBase.length,
      totalMaterias: 2,
      totalCandidates: 2,
      totalMesasPreliminares: 2,
    })
  })

  it('no muta el input original y se mantiene aislado del motor viejo y la UI', () => {
    const input = baseInput()
    const snapshot = structuredClone(input)
    const source = readFileSync(join(process.cwd(), 'src/utils/examEngine/planning/generateRegular.js'), 'utf8')

    generateRegularExamPlan(input)

    expect(input).toEqual(snapshot)
    expect(source).not.toContain('cronogramaInteligente')
    expect(source).not.toContain('useCronogramaGeneration')
  })
})
