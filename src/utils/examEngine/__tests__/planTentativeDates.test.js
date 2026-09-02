import { describe, expect, it } from 'vitest'
import { planTentativeDates } from '../planning/planTentativeDates.js'

function mesa(overrides = {}) {
  return {
    id: 'mesa-ing-1',
    materiaId: 'ING1',
    materia: 'Ingles I',
    carreraId: 'prof-ingles',
    carrera: 'Profesorado de Ingles',
    anio: 1,
    llamado: 'PRIMER_LLAMADO',
    titularId: 'doc-titular-1',
    titularNombre: 'Ana Titular',
    vocal1Id: 'doc-vocal-1',
    vocal2Id: 'doc-vocal-2',
    estado: 'COMPLETA',
    turno: 'NOCHE',
    riskScore: 10,
    noAgrupable: false,
    warnings: [],
    errors: [],
    metadata: {},
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

function docente(overrides = {}) {
  return {
    id: 'doc-titular-1',
    nombre: 'Ana Titular',
    activo: true,
    carrera: 'Profesorado de Ingles',
    nombreMateria: 'Ingles I',
    diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    turnosDisponibles: ['NOCHE'],
    ...overrides,
  }
}

const titularDisponible = docente()

const titular2 = docente({
  id: 'doc-titular-2',
  nombre: 'Beatriz Titular',
  nombreMateria: 'Ingles II',
})

const vocalDisponible1 = docente({
  id: 'doc-vocal-1',
  nombre: 'Bruno Vocal',
  nombreMateria: 'Lengua Inglesa',
})

const vocalDisponible2 = docente({
  id: 'doc-vocal-2',
  nombre: 'Carla Vocal',
  nombreMateria: 'Gramatica Inglesa',
})

const vocalDisponible3 = docente({
  id: 'doc-vocal-3',
  nombre: 'Dario Vocal',
  nombreMateria: 'Fonetica Inglesa',
})

const vocalDisponible4 = docente({
  id: 'doc-vocal-4',
  nombre: 'Eva Vocal',
  nombreMateria: 'Practicas Discursivas en Ingles',
})

const correlatividades = [
  {
    materiaId: 'ING2',
    materia: 'Ingles II',
    carrera: 'Profesorado de Ingles',
    carreraId: 'prof-ingles',
    correlativas: ['ING1'],
  },
]

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

const configEspecialOneCall = {
  tipoPeriodo: 'ESPECIAL',
  cantidadLlamados: 1,
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
}

describe('examEngine planning: planTentativeDates', () => {
  it('asigna fecha tentativa si titular y vocales estan disponibles', () => {
    const result = planTentativeDates({
      mesas: [mesa()],
      docentes: [titularDisponible, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0]).toMatchObject({
      fecha: '2026-07-27',
      fechaIso: '2026-07-27',
      turno: 'NOCHE',
      estado: 'FECHA_TENTATIVA',
    })
    expect(result.unassignedMesas).toHaveLength(0)
  })

  it('no asigna fecha si titular no esta disponible', () => {
    const result = planTentativeDates({
      mesas: [mesa()],
      docentes: [
        docente({ diasAsistencia: ['martes'] }),
        vocalDisponible1,
        vocalDisponible2,
      ],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(0)
    expect(result.unassignedMesas[0]).toMatchObject({
      reason: 'TITULAR_NO_DISPONIBLE',
      estado: 'SIN_FECHA_TENTATIVA',
    })
  })

  it('no asigna fecha si vocal no esta disponible', () => {
    const result = planTentativeDates({
      mesas: [mesa()],
      docentes: [
        titularDisponible,
        docente({ id: 'doc-vocal-1', nombre: 'Bruno Vocal', nombreMateria: 'Lengua Inglesa', diasAsistencia: ['martes'] }),
        vocalDisponible2,
      ],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(0)
    expect(result.unassignedMesas[0]).toMatchObject({
      reason: 'VOCAL_NO_DISPONIBLE',
    })
  })

  it('respeta turno de la mesa', () => {
    const result = planTentativeDates({
      mesas: [mesa({ turno: 'TARDE' })],
      docentes: [
        docente({ turnosDisponibles: ['TARDE'] }),
        docente({ id: 'doc-vocal-1', nombre: 'Bruno Vocal', nombreMateria: 'Lengua Inglesa', turnosDisponibles: ['TARDE'] }),
        docente({ id: 'doc-vocal-2', nombre: 'Carla Vocal', nombreMateria: 'Gramatica Inglesa', turnosDisponibles: ['TARDE'] }),
      ],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'MANANA', 'LUNES'),
        slot('2026-07-27', 'PRIMER_LLAMADO', 'TARDE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas[0]).toMatchObject({
      fecha: '2026-07-27',
      turno: 'TARDE',
    })
  })

  it('config con 1 llamado planifica solo un llamado', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({ id: 'mesa-1', llamado: 'PRIMER_LLAMADO' }),
        mesa({ id: 'mesa-2', llamado: 'SEGUNDO_LLAMADO', titularId: 'doc-titular-2' }),
      ],
      docentes: [titularDisponible, titular2, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'SEGUNDO_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0].llamado).toBe('PRIMER_LLAMADO')
    expect(result.unassignedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'LLAMADO_NO_REQUERIDO', llamado: 'SEGUNDO_LLAMADO' }),
    ]))
  })

  it('config con 2 llamados planifica ambos llamados', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({ id: 'mesa-1', llamado: 'PRIMER_LLAMADO' }),
        mesa({ id: 'mesa-2', llamado: 'SEGUNDO_LLAMADO', titularId: 'doc-titular-2' }),
      ],
      docentes: [titularDisponible, titular2, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularTwoCalls,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'SEGUNDO_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(2)
    expect(result.summary.mesasPorLlamado).toMatchObject({
      PRIMER_LLAMADO: 1,
      SEGUNDO_LLAMADO: 1,
    })
  })

  it('no exige segundo llamado si config.cantidadLlamados = 1', () => {
    const result = planTentativeDates({
      mesas: [mesa()],
      docentes: [titularDisponible, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.errors).toEqual([])
    expect(result.unassignedMesas).toHaveLength(0)
  })

  it('respeta correlatividad: Ingles I antes que Ingles II', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({ id: 'mesa-ing-1', materiaId: 'ING1', materia: 'Ingles I' }),
        mesa({ id: 'mesa-ing-2', materiaId: 'ING2', materia: 'Ingles II', titularId: 'doc-titular-2' }),
      ],
      docentes: [titularDisponible, titular2, vocalDisponible1, vocalDisponible2],
      correlatividades,
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    const inglesI = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaId === 'ING1')
    const inglesII = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaId === 'ING2')

    expect(inglesI.fecha).toBe('2026-07-27')
    expect(inglesII.fecha).toBe('2026-07-28')
  })

  it('ordena una previa directa antes de su posterior aunque la posterior tenga mayor riesgo', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-base',
          materiaId: 'BASE1',
          materiaCodigo: 'BASE1',
          codigo: 'BASE1',
          materia: 'Materia Base',
          nombreMateria: 'Materia Base',
          titularId: 'doc-base',
          riskScore: 10,
        }),
        mesa({
          id: 'mesa-posterior',
          materiaId: 'POST1',
          materiaCodigo: 'POST1',
          codigo: 'POST1',
          materia: 'Materia Posterior',
          nombreMateria: 'Materia Posterior',
          titularId: 'doc-posterior',
          vocal1Id: 'doc-vocal-3',
          vocal2Id: 'doc-vocal-4',
          riskScore: 90,
        }),
      ],
      docentes: [
        docente({
          id: 'doc-base',
          nombre: 'Titular Base',
          nombreMateria: 'Materia Base',
          diasAsistencia: ['lunes'],
        }),
        docente({
          id: 'doc-posterior',
          nombre: 'Titular Posterior',
          nombreMateria: 'Materia Posterior',
          diasAsistencia: ['martes'],
        }),
        vocalDisponible1,
        vocalDisponible2,
        vocalDisponible3,
        vocalDisponible4,
      ],
      correlatividades: [
        {
          materiaId: 'POST1',
          materia: 'POST1',
          codigo: 'POST1',
          nombreMateria: 'Materia Posterior',
          carrera: 'Profesorado de Ingles',
          carreraId: 'prof-ingles',
          correlativas: ['BASE1'],
        },
      ],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(result.plannedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'mesa-base',
        fecha: '2026-07-27',
      }),
      expect.objectContaining({
        id: 'mesa-posterior',
        fecha: '2026-07-28',
      }),
    ]))
    expect(result.unassignedMesas).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'mesa-posterior',
        reason: 'CORRELATIVIDAD_CONFLICTIVA',
      }),
    ]))
  })

  it('respeta correlatividad cuando la mesa usa materia como nombre visible y codigo explicito aparte', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-preliminar:candidate:profesorado de ingles::ing08:PRIMER_LLAMADO',
          materiaId: '1666690c-f1bf-4089-a9e6-b1a36acb47fb',
          materiaCodigo: 'ING08',
          codigo: 'ING08',
          materia: 'GRAMATICA INGLESA I',
          nombreMateria: 'GRAMATICA INGLESA I',
          titularId: 'doc-ing08',
          riskScore: 90,
        }),
        mesa({
          id: 'mesa-preliminar:candidate:profesorado de ingles::ing19:PRIMER_LLAMADO',
          materiaId: '2b1077e0-3dca-4f0c-ba54-c4c6d9280d6e',
          materiaCodigo: 'ING19',
          codigo: 'ING19',
          materia: 'PRACTICAS DISCURSIVAS EN INGLES II',
          nombreMateria: 'PRACTICAS DISCURSIVAS EN INGLES II',
          titularId: 'doc-ing19',
          vocal1Id: 'doc-vocal-3',
          vocal2Id: 'doc-vocal-4',
          riskScore: 10,
        }),
      ],
      docentes: [
        docente({
          id: 'doc-ing08',
          nombre: 'Titular ING08',
          nombreMateria: 'GRAMATICA INGLESA I',
          diasAsistencia: ['lunes'],
        }),
        docente({
          id: 'doc-ing19',
          nombre: 'Titular ING19',
          nombreMateria: 'PRACTICAS DISCURSIVAS EN INGLES II',
          diasAsistencia: ['martes'],
        }),
        vocalDisponible1,
        vocalDisponible2,
        vocalDisponible3,
        vocalDisponible4,
      ],
      correlatividades: [
        {
          materiaId: 'ING19',
          materia: 'ING19',
          codigo: 'ING19',
          nombreMateria: 'PRACTICAS DISCURSIVAS EN INGLES II',
          carrera: 'PROFESORADO DE INGLES',
          carreraId: 'career-profesorado-de-ingles',
          correlativas: ['ING08'],
        },
      ],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    const ing08 = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaCodigo === 'ING08')
    const ing19 = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaCodigo === 'ING19')

    expect(ing08.fecha).toBe('2026-07-27')
    expect(ing19.fecha).toBe('2026-07-28')
    expect(result.unassignedMesas).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        materiaCodigo: 'ING19',
        reason: 'CORRELATIVIDAD_CONFLICTIVA',
      }),
    ]))
  })

  it('no cruza correlatividades de materias homonimas en carreras distintas', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-preliminar:candidate:profesorado de ingles::ing08:PRIMER_LLAMADO',
          materiaId: 'uuid-ing08',
          materiaCodigo: 'ING08',
          codigo: 'ING08',
          materia: 'GRAMATICA INGLESA I',
          nombreMateria: 'GRAMATICA INGLESA I',
          carrera: 'PROFESORADO DE INGLES',
          carreraId: 'career-profesorado-de-ingles',
          titularId: 'doc-ing08',
          riskScore: 90,
        }),
        mesa({
          id: 'mesa-preliminar:candidate:profesorado de ingles::ing20:PRIMER_LLAMADO',
          materiaId: 'uuid-ing20',
          materiaCodigo: 'ING20',
          codigo: 'ING20',
          materia: 'GRAMATICA INGLESA II',
          nombreMateria: 'GRAMATICA INGLESA II',
          carrera: 'PROFESORADO DE INGLES',
          carreraId: 'career-profesorado-de-ingles',
          titularId: 'doc-ing20',
          vocal1Id: 'doc-vocal-3',
          vocal2Id: 'doc-vocal-4',
          riskScore: 10,
        }),
      ],
      docentes: [
        docente({
          id: 'doc-ing08',
          nombre: 'Titular ING08',
          nombreMateria: 'GRAMATICA INGLESA I',
          diasAsistencia: ['lunes'],
        }),
        docente({
          id: 'doc-ing20',
          nombre: 'Titular ING20',
          nombreMateria: 'GRAMATICA INGLESA II',
          diasAsistencia: ['martes'],
        }),
        vocalDisponible1,
        vocalDisponible2,
        vocalDisponible3,
        vocalDisponible4,
      ],
      correlatividades: [
        {
          materiaId: 'ING20',
          materia: 'ING20',
          codigo: 'ING20',
          nombreMateria: 'GRAMATICA INGLESA II',
          carrera: 'PROFESORADO DE INGLES',
          carreraId: 'career-profesorado-de-ingles',
          correlativas: ['ING08'],
        },
        {
          materiaId: 'TRA12',
          materia: 'TRA12',
          codigo: 'TRA12',
          nombreMateria: 'GRAMATICA INGLESA II',
          carrera: 'TECNICO SUP EN TRADUCTORADO',
          carreraId: 'career-tecnico-sup-en-traductorado',
          correlativas: ['TRA01'],
        },
      ],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    const ing20 = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaCodigo === 'ING20')

    expect(ing20).toMatchObject({
      fecha: '2026-07-28',
      estado: 'FECHA_TENTATIVA',
    })
    expect(result.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CORRELATIVIDAD_CONFLICTIVA',
        posteriorMesaId: 'mesa-preliminar:candidate:profesorado de ingles::ing20:PRIMER_LLAMADO',
      }),
    ]))
  })

  it('permite correlativas el mismo dia con warning', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({ id: 'mesa-ing-1', materiaId: 'ING1', materia: 'Ingles I' }),
        mesa({
          id: 'mesa-ing-2',
          materiaId: 'ING2',
          materia: 'Ingles II',
          titularId: 'doc-titular-2',
          vocal1Id: 'doc-vocal-3',
          vocal2Id: 'doc-vocal-4',
        }),
      ],
      docentes: [titularDisponible, titular2, vocalDisponible1, vocalDisponible2, vocalDisponible3, vocalDisponible4],
      correlatividades,
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    const inglesII = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaId === 'ING2')
    expect(inglesII.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CORRELATIVIDAD_MISMO_DIA' }),
    ]))
  })

  it('no permite posterior antes que previa', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-ing-1',
          materiaId: 'ING1',
          materia: 'Ingles I',
          titularId: 'doc-titular-1',
        }),
        mesa({
          id: 'mesa-ing-2',
          materiaId: 'ING2',
          materia: 'Ingles II',
          turno: 'TARDE',
          titularId: 'doc-titular-2',
          vocal1Id: 'doc-vocal-3',
          vocal2Id: 'doc-vocal-4',
        }),
      ],
      docentes: [
        docente({ id: 'doc-titular-1', nombre: 'Ana Titular', nombreMateria: 'Ingles I', diasAsistencia: ['martes'] }),
        docente({
          id: 'doc-titular-2',
          nombre: 'Beatriz Titular',
          nombreMateria: 'Ingles II',
          diasAsistencia: ['lunes'],
          turnosDisponibles: ['TARDE'],
        }),
        vocalDisponible1,
        vocalDisponible2,
        docente({
          id: 'doc-vocal-3',
          nombre: 'Dario Vocal',
          nombreMateria: 'Fonetica Inglesa',
          diasAsistencia: ['lunes'],
          turnosDisponibles: ['TARDE'],
        }),
        docente({
          id: 'doc-vocal-4',
          nombre: 'Eva Vocal',
          nombreMateria: 'Practicas Discursivas en Ingles',
          diasAsistencia: ['lunes'],
          turnosDisponibles: ['TARDE'],
        }),
      ],
      correlatividades,
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'TARDE', 'LUNES'),
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(result.unassignedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        materiaId: 'ING2',
        reason: 'CORRELATIVIDAD_CONFLICTIVA',
      }),
    ]))
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CORRELATIVIDAD_CONFLICTIVA',
        severity: 'critical',
        posteriorMesaId: 'mesa-ing-2',
      }),
    ]))
  })

  it('clasifica por disponibilidad si un slot posterior ya no falla por correlatividad', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-ing-1',
          materiaId: 'ING1',
          materiaCodigo: 'ING1',
          codigo: 'ING1',
          materia: 'Ingles I',
          titularId: 'doc-ing-1',
          riskScore: 90,
        }),
        mesa({
          id: 'mesa-ing-2',
          materiaId: 'ING2',
          materiaCodigo: 'ING2',
          codigo: 'ING2',
          materia: 'Ingles II',
          titularId: 'doc-ing-2',
          vocal1Id: 'doc-vocal-3',
          vocal2Id: 'doc-vocal-4',
          riskScore: 10,
        }),
      ],
      docentes: [
        docente({
          id: 'doc-ing-1',
          nombre: 'Titular ING1',
          nombreMateria: 'Ingles I',
          diasAsistencia: ['martes'],
        }),
        docente({
          id: 'doc-ing-2',
          nombre: 'Titular ING2',
          nombreMateria: 'Ingles II',
          diasAsistencia: ['lunes'],
        }),
        vocalDisponible1,
        vocalDisponible2,
        vocalDisponible3,
        vocalDisponible4,
      ],
      correlatividades: [
        {
          materiaId: 'ING2',
          materia: 'ING2',
          codigo: 'ING2',
          nombreMateria: 'Ingles II',
          carrera: 'Profesorado de Ingles',
          carreraId: 'prof-ingles',
          correlativas: ['ING1'],
        },
      ],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
        slot('2026-07-29', 'PRIMER_LLAMADO', 'NOCHE', 'MIERCOLES'),
      ],
    })

    expect(result.plannedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'mesa-ing-1',
        fecha: '2026-07-28',
      }),
    ]))
    expect(result.unassignedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'mesa-ing-2',
        reason: 'TITULAR_NO_DISPONIBLE',
      }),
    ]))
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CORRELATIVIDAD_CONFLICTIVA',
        posteriorMesaId: 'mesa-ing-2',
        fecha: '2026-07-27',
      }),
      expect.objectContaining({
        code: 'TITULAR_NO_DISPONIBLE',
        mesaId: 'mesa-ing-2',
        fecha: '2026-07-29',
      }),
    ]))
  })

  it('no planifica una materia posterior si su correlativa previa no tiene mesa', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-ing-2',
          materiaId: 'ING2',
          materia: 'Ingles II',
          titularId: 'doc-titular-2',
        }),
      ],
      docentes: [titular2, vocalDisponible1, vocalDisponible2],
      correlatividades,
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(0)
    expect(result.unassignedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        materiaId: 'ING2',
        reason: 'CORRELATIVIDAD_CONFLICTIVA',
      }),
    ]))
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CORRELATIVIDAD_CONFLICTIVA',
        posteriorMesaId: 'mesa-ing-2',
      }),
    ]))
  })

  it('clasifica como correlatividad cuando la previa queda pendiente', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-ing-1',
          materiaId: 'ING1',
          materia: 'Ingles I',
          titularId: 'doc-titular-1',
        }),
        mesa({
          id: 'mesa-ing-2',
          materiaId: 'ING2',
          materia: 'Ingles II',
          titularId: 'doc-titular-2',
        }),
      ],
      docentes: [
        docente({ id: 'doc-titular-1', nombre: 'Ana Titular', nombreMateria: 'Ingles I', diasAsistencia: ['martes'] }),
        titular2,
        vocalDisponible1,
        vocalDisponible2,
      ],
      correlatividades,
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.unassignedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        materiaId: 'ING1',
        reason: 'TITULAR_NO_DISPONIBLE',
      }),
      expect.objectContaining({
        materiaId: 'ING2',
        reason: 'CORRELATIVIDAD_CONFLICTIVA',
      }),
    ]))
  })

  it('prioriza la materia que es correlativa previa de mas materias (cuello de botella)', () => {
    const fanOutCorrelatividades = [
      {
        materiaId: 'MAT2',
        materia: 'Matematica II',
        carrera: 'Profesorado de Ingles',
        carreraId: 'prof-ingles',
        correlativas: ['MAT1'],
      },
      {
        materiaId: 'QUI1',
        materia: 'Quimica I',
        carrera: 'Profesorado de Ingles',
        carreraId: 'prof-ingles',
        correlativas: ['MAT1'],
      },
      {
        materiaId: 'FIS2',
        materia: 'Fisica II',
        carrera: 'Profesorado de Ingles',
        carreraId: 'prof-ingles',
        correlativas: ['FIS1'],
      },
    ]

    const result = planTentativeDates({
      mesas: [
        // El id alfabetico favorece a FIS1 en el desempate previo; MAT1 debe ganar
        // porque desbloquea dos materias posteriores (MAT2 y QUI1) contra una sola (FIS2).
        mesa({ id: 'mesa-fis1', materiaId: 'FIS1', materia: 'Fisica I', titularId: 'doc-titular-2' }),
        mesa({ id: 'mesa-mat1', materiaId: 'MAT1', materia: 'Matematica I' }),
      ],
      docentes: [titularDisponible, titular2, vocalDisponible1, vocalDisponible2],
      correlatividades: fanOutCorrelatividades,
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    const mat1 = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaId === 'MAT1')
    const fis1 = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaId === 'FIS1')

    expect(mat1.fecha).toBe('2026-07-27')
    expect(fis1.fecha).toBe('2026-07-28')
  })

  it('distribuye mesas sin conflicto docente entre varias fechas en vez de amontonarlas en la primera', () => {
    const docentesIndependientes = ['a', 'b', 'c'].flatMap((suffix) => ([
      docente({ id: `doc-titular-${suffix}`, nombre: `Titular ${suffix}`, nombreMateria: `Materia ${suffix}` }),
      docente({ id: `doc-vocal1-${suffix}`, nombre: `Vocal1 ${suffix}`, nombreMateria: `Materia ${suffix}` }),
      docente({ id: `doc-vocal2-${suffix}`, nombre: `Vocal2 ${suffix}`, nombreMateria: `Materia ${suffix}` }),
    ]))

    const mesasIndependientes = ['a', 'b', 'c'].map((suffix) => mesa({
      id: `mesa-${suffix}`,
      materiaId: `MAT-${suffix}`,
      materia: `Materia ${suffix}`,
      titularId: `doc-titular-${suffix}`,
      vocal1Id: `doc-vocal1-${suffix}`,
      vocal2Id: `doc-vocal2-${suffix}`,
    }))

    const result = planTentativeDates({
      mesas: mesasIndependientes,
      docentes: docentesIndependientes,
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
        slot('2026-07-29', 'PRIMER_LLAMADO', 'NOCHE', 'MIERCOLES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(3)
    const fechasUsadas = result.plannedMesas.map((plannedMesa) => plannedMesa.fecha)
    expect(new Set(fechasUsadas).size).toBe(3)
  })

  it('evita agrupar materias de la misma carrera (aunque cambie el anio) el mismo dia, ya que comparten pool de vocales', () => {
    const docenteIndependiente = (id, nombreMateria) => docente({
      id,
      nombre: id,
      nombreMateria,
    })

    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-x1',
          materiaId: 'X1',
          materia: 'Materia X1',
          carreraId: 'carrera-x',
          carrera: 'Carrera X',
          anio: 1,
          riskScore: 30,
          titularId: 'doc-x1',
          vocal1Id: 'doc-x1-v1',
          vocal2Id: 'doc-x1-v2',
        }),
        mesa({
          id: 'mesa-y1',
          materiaId: 'Y1',
          materia: 'Materia Y1',
          carreraId: 'carrera-y',
          carrera: 'Carrera Y',
          anio: 2,
          riskScore: 20,
          titularId: 'doc-y1',
          vocal1Id: 'doc-y1-v1',
          vocal2Id: 'doc-y1-v2',
        }),
        // Misma carrera que mesa-x1 pero distinto anio y sin ningun docente
        // compartido: como cualquier docente de la carrera puede ser vocal,
        // nada impide que caiga el mismo dia salvo la regla de agrupamiento.
        mesa({
          id: 'mesa-x2',
          materiaId: 'X2',
          materia: 'Materia X2',
          carreraId: 'carrera-x',
          carrera: 'Carrera X',
          anio: 2,
          riskScore: 10,
          titularId: 'doc-x2',
          vocal1Id: 'doc-x2-v1',
          vocal2Id: 'doc-x2-v2',
        }),
      ],
      docentes: [
        docenteIndependiente('doc-x1', 'Materia X1'),
        docenteIndependiente('doc-x1-v1', 'Materia X1'),
        docenteIndependiente('doc-x1-v2', 'Materia X1'),
        docenteIndependiente('doc-y1', 'Materia Y1'),
        docenteIndependiente('doc-y1-v1', 'Materia Y1'),
        docenteIndependiente('doc-y1-v2', 'Materia Y1'),
        docenteIndependiente('doc-x2', 'Materia X2'),
        docenteIndependiente('doc-x2-v1', 'Materia X2'),
        docenteIndependiente('doc-x2-v2', 'Materia X2'),
      ],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    const x1 = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaId === 'X1')
    const y1 = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaId === 'Y1')
    const x2 = result.plannedMesas.find((plannedMesa) => plannedMesa.materiaId === 'X2')

    expect(x1.fecha).toBe('2026-07-27')
    expect(y1.fecha).toBe('2026-07-28')
    // Sin la regla de carrera (aplicada aunque cambie el anio), la carga global
    // quedaria empatada (1 y 1) y x2 caeria en la fecha mas temprana (07-27), junto con x1.
    expect(x2.fecha).toBe('2026-07-28')
    expect(x2.fecha).not.toBe(x1.fecha)
  })

  it('mesa sin fecha valida queda en unassignedMesas', () => {
    const result = planTentativeDates({
      mesas: [mesa()],
      docentes: [titularDisponible, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [],
    })

    expect(result.plannedMesas).toHaveLength(0)
    expect(result.unassignedMesas[0]).toMatchObject({
      reason: 'SIN_FECHA_VALIDA',
    })
  })

  it('prioriza mesas de mayor riesgo', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({ id: 'mesa-baja', riskScore: 10, materiaId: 'BAJA', materia: 'Ingles Bajo' }),
        mesa({ id: 'mesa-alta', riskScore: 90, titularId: 'doc-titular-2', materiaId: 'ALTA', materia: 'Ingles Alto' }),
      ],
      docentes: [titularDisponible, titular2, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(result.plannedMesas.find((plannedMesa) => plannedMesa.id === 'mesa-alta').fecha).toBe('2026-07-27')
    expect(result.plannedMesas.find((plannedMesa) => plannedMesa.id === 'mesa-baja').fecha).toBe('2026-07-28')
  })

  it('no muta datos originales', () => {
    const mesas = [
      mesa({ id: 'mesa-1' }),
      mesa({ id: 'mesa-2', titularId: 'doc-titular-2' }),
    ]
    const docentes = [titularDisponible, titular2, vocalDisponible1, vocalDisponible2]
    const snapshotMesas = structuredClone(mesas)
    const snapshotDocentes = structuredClone(docentes)

    planTentativeDates({
      mesas,
      docentes,
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(mesas).toEqual(snapshotMesas)
    expect(docentes).toEqual(snapshotDocentes)
  })

  it('genera summary correcto', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({ id: 'mesa-1', llamado: 'PRIMER_LLAMADO', materiaId: 'ING1', materia: 'Ingles I', riskScore: 90 }),
        mesa({ id: 'mesa-2', llamado: 'SEGUNDO_LLAMADO', titularId: 'doc-titular-2', materiaId: 'ING2', materia: 'Ingles II', riskScore: 80 }),
        mesa({ id: 'mesa-3', llamado: 'PRIMER_LLAMADO', materiaId: 'ING3', materia: 'Ingles III', riskScore: 5 }),
      ],
      docentes: [titularDisponible, titular2, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularTwoCalls,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'SEGUNDO_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(result.summary).toMatchObject({
      totalMesas: 3,
      mesasConFechaTentativa: 2,
      mesasSinFecha: 1,
      mesasPorLlamado: {
        PRIMER_LLAMADO: 1,
        SEGUNDO_LLAMADO: 1,
      },
      conflictosDisponibilidad: 1,
      conflictosCorrelatividad: 0,
      advertencias: 0,
    })
  })

  it('acepta disponibilidad docente por objeto solo en esa fecha y turno', () => {
    const titularConObjeto = docente({
      diasAsistencia: undefined,
      disponibilidad: {
        fecha: '2026-07-27',
        turno: 'NOCHE',
      },
      turnosDisponibles: undefined,
    })

    const baseInput = {
      mesas: [
        mesa({
          vocal1Id: '',
          vocal2Id: '',
          estado: 'SIN_TRIBUNAL_CONFORMADO',
        }),
      ],
      docentes: [titularConObjeto],
      correlatividades: [],
      config: configRegularOneCall,
    }

    const validResult = planTentativeDates({
      ...baseInput,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })
    const wrongTurnResult = planTentativeDates({
      ...baseInput,
      mesas: [
        mesa({
          vocal1Id: '',
          vocal2Id: '',
          estado: 'SIN_TRIBUNAL_CONFORMADO',
          turno: 'TARDE',
        }),
      ],
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'TARDE', 'LUNES'),
      ],
    })

    expect(validResult.plannedMesas).toHaveLength(1)
    expect(validResult.plannedMesas[0]).toMatchObject({
      fecha: '2026-07-27',
      turno: 'NOCHE',
      estado: 'FECHA_TENTATIVA_CON_ALERTAS',
    })
    expect(wrongTurnResult.plannedMesas).toHaveLength(0)
    expect(wrongTurnResult.unassignedMesas[0]).toMatchObject({
      reason: 'TITULAR_NO_DISPONIBLE',
    })
  })

  it('acepta disponibilidad docente por dia de semana', () => {
    const result = planTentativeDates({
      mesas: [mesa()],
      docentes: [
        docente({ diasAsistencia: ['lunes', 'miercoles'] }),
        docente({ id: 'doc-vocal-1', nombre: 'Bruno Vocal', nombreMateria: 'Lengua Inglesa', diasAsistencia: ['lunes', 'miercoles'] }),
        docente({ id: 'doc-vocal-2', nombre: 'Carla Vocal', nombreMateria: 'Gramatica Inglesa', diasAsistencia: ['lunes', 'miercoles'] }),
      ],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0].fecha).toBe('2026-07-27')
  })

  it('respeta bloqueos docentes aunque la fecha figure disponible', () => {
    const result = planTentativeDates({
      mesas: [mesa()],
      docentes: [
        docente({ bloqueos: ['2026-07-27'] }),
        vocalDisponible1,
        vocalDisponible2,
      ],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(0)
    expect(result.unassignedMesas[0]).toMatchObject({
      reason: 'TITULAR_NO_DISPONIBLE',
    })
  })

  it('mesa sin turno intenta inferir turno desde el titular', () => {
    const result = planTentativeDates({
      mesas: [mesa({ turno: '' })],
      docentes: [
        docente({ turnosDisponibles: ['TARDE'] }),
        docente({ id: 'doc-vocal-1', nombre: 'Bruno Vocal', nombreMateria: 'Lengua Inglesa', turnosDisponibles: ['TARDE'] }),
        docente({ id: 'doc-vocal-2', nombre: 'Carla Vocal', nombreMateria: 'Gramatica Inglesa', turnosDisponibles: ['TARDE'] }),
      ],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-27', 'PRIMER_LLAMADO', 'TARDE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0].turno).toBe('TARDE')
  })

  it('mesa sin turno y titular sin turno se planifica con warning TURNO_NO_DEFINIDO', () => {
    const result = planTentativeDates({
      mesas: [mesa({ turno: '' })],
      docentes: [
        docente({ turnosDisponibles: [] }),
        vocalDisponible1,
        vocalDisponible2,
      ],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TURNO_NO_DEFINIDO' }),
    ]))
    expect(result.plannedMesas[0].warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TURNO_NO_DEFINIDO' }),
    ]))
  })

  it('evita superposicion del mismo docente en dos mesas el mismo dia y turno', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({ id: 'mesa-super-1', materiaId: 'ING1', materia: 'Ingles I', riskScore: 20 }),
        mesa({ id: 'mesa-super-2', materiaId: 'ING3', materia: 'Ingles III', riskScore: 10 }),
      ],
      docentes: [titularDisponible, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.unassignedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'mesa-super-2',
        reason: 'DOCENTE_SUPERPUESTO',
      }),
    ]))
  })

  it('permite el mismo docente el mismo dia en distinto turno con warning', () => {
    const docentesDobleTurno = [
      docente({ turnosDisponibles: ['NOCHE', 'TARDE'] }),
      docente({ id: 'doc-vocal-1', nombre: 'Bruno Vocal', nombreMateria: 'Lengua Inglesa', turnosDisponibles: ['NOCHE', 'TARDE'] }),
      docente({ id: 'doc-vocal-2', nombre: 'Carla Vocal', nombreMateria: 'Gramatica Inglesa', turnosDisponibles: ['NOCHE', 'TARDE'] }),
    ]

    const result = planTentativeDates({
      mesas: [
        mesa({ id: 'mesa-dia-1', materiaId: 'ING1', materia: 'Ingles I', turno: 'NOCHE', riskScore: 20 }),
        mesa({ id: 'mesa-dia-2', materiaId: 'ING3', materia: 'Ingles III', turno: 'TARDE', riskScore: 10 }),
      ],
      docentes: docentesDobleTurno,
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
        slot('2026-07-27', 'PRIMER_LLAMADO', 'TARDE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(2)
    expect(result.unassignedMesas).toHaveLength(0)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DOCENTE_CON_VARIAS_MESAS_MISMO_DIA' }),
    ]))
  })

  it('mesa con tribunal incompleto recibe fecha tentativa con alertas', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          vocal2Id: '',
          estado: 'CON_UN_VOCAL',
        }),
      ],
      docentes: [titularDisponible, vocalDisponible1],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0]).toMatchObject({
      estado: 'FECHA_TENTATIVA_CON_ALERTAS',
      fecha: '2026-07-27',
    })
    expect(result.plannedMesas[0].warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA' }),
    ]))
  })

  it('config ESPECIAL con 1 llamado planifica LLAMADO_ESPECIAL sin exigir llamados regulares', () => {
    const result = planTentativeDates({
      mesas: [
        mesa({
          id: 'mesa-especial',
          llamado: 'LLAMADO_ESPECIAL',
          materiaId: 'ING1',
          materia: 'Ingles I',
        }),
      ],
      docentes: [titularDisponible, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configEspecialOneCall,
      fechasDisponibles: [
        slot('2026-07-27', 'LLAMADO_ESPECIAL', 'NOCHE', 'LUNES'),
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0]).toMatchObject({
      id: 'mesa-especial',
      llamado: 'LLAMADO_ESPECIAL',
      fecha: '2026-07-27',
    })
    expect(result.errors).toEqual([])
  })

  it('no usa fechas disponibles marcadas como disponible false', () => {
    const result = planTentativeDates({
      mesas: [mesa()],
      docentes: [titularDisponible, vocalDisponible1, vocalDisponible2],
      correlatividades: [],
      config: configRegularOneCall,
      fechasDisponibles: [
        { ...slot('2026-07-27', 'PRIMER_LLAMADO', 'NOCHE', 'LUNES'), disponible: false },
        slot('2026-07-28', 'PRIMER_LLAMADO', 'NOCHE', 'MARTES'),
      ],
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0].fecha).toBe('2026-07-28')
  })
})
