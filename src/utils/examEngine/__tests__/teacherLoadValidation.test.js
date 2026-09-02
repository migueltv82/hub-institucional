import { describe, expect, it } from 'vitest'
import {
  buildParticipacionesFromMesas,
  validateCronograma,
} from '../validation/validateCronograma.js'
import { validarLimitesVocaliasPorDocente } from '../validation/validateTeacherLoad.js'

const docenteCincoDias = {
  id: 'doc-1',
  nombre: 'Ana Perez',
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa I',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  // horasCatedra=5 mantiene el mismo limite (floor(5/2)+1=3) que el modo
  // historico por dias usaba con este mismo docente, ahora que la validacion
  // de produccion fuerza TEACHING_HOURS_HALF_PLUS_ONE explicitamente.
  horasCatedra: 5,
}

const configRegularUnLlamado = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 1,
}

const configRegularDosLlamados = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 2,
}

function createMesa({
  id,
  titularId = `titular-${id}`,
  vocal1Id = '',
  vocal2Id = '',
  llamado = 'first',
  tribunalCruzado = '',
} = {}) {
  return {
    id,
    carrera: 'Profesorado de Ingles',
    materia: `MAT-${id}`,
    nombreMateria: `Materia ${id}`,
    titular_id: titularId,
    vocal1: vocal1Id,
    vocal2: vocal2Id,
    tribunalCruzado,
    exam_type: 'regular',
    exam_call: llamado,
  }
}

function createMesasConVocalias(cantidad, llamado = 'first') {
  return Array.from({ length: cantidad }, (_, index) => createMesa({
    id: `${llamado}-${index + 1}`,
    vocal1Id: 'doc-1',
    llamado,
  }))
}

function validarDesdeMesas(mesas, config = configRegularUnLlamado) {
  return validarLimitesVocaliasPorDocente(
    [docenteCincoDias],
    buildParticipacionesFromMesas(mesas),
    config,
  )
}

describe('examEngine validation: limite de vocalias por docente', () => {
  it('docente con 5 dias y 3 vocalias en un llamado no esta excedido', () => {
    const result = validarDesdeMesas(createMesasConVocalias(3))

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenDocentes[0]).toMatchObject({
      docenteId: 'doc-1',
      limiteVocaliasPorLlamado: 3,
      vocaliasPorLlamado: {
        PRIMER_LLAMADO: 3,
      },
      excedido: false,
    })
  })

  it('docente con 5 dias y 4 vocalias en un llamado esta excedido', () => {
    const result = validarDesdeMesas(createMesasConVocalias(4))

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DOCENTE_EXCEDE_LIMITE_VOCALIAS',
        severity: 'critical',
        docenteId: 'doc-1',
        llamado: 'PRIMER_LLAMADO',
        limite: 3,
        vocaliasAsignadas: 4,
      }),
    ])
  })

  it('docente con 2 titularidades y 3 vocalias no esta excedido', () => {
    const mesas = [
      createMesa({ id: 'titular-1', titularId: 'doc-1' }),
      createMesa({ id: 'titular-2', titularId: 'doc-1' }),
      ...createMesasConVocalias(3),
    ]
    const result = validarDesdeMesas(mesas)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenDocentes[0]).toMatchObject({
      titularidadesPorLlamado: {
        PRIMER_LLAMADO: 2,
      },
      vocaliasPorLlamado: {
        PRIMER_LLAMADO: 3,
      },
      excedido: false,
    })
  })

  it('docente con 2 titularidades y 4 vocalias esta excedido', () => {
    const mesas = [
      createMesa({ id: 'titular-1', titularId: 'doc-1' }),
      createMesa({ id: 'titular-2', titularId: 'doc-1' }),
      ...createMesasConVocalias(4),
    ]
    const result = validarDesdeMesas(mesas)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DOCENTE_EXCEDE_LIMITE_VOCALIAS',
        vocaliasAsignadas: 4,
        limite: 3,
      }),
    ])
  })

  it('TRIBUNAL_CRUZADO no cuenta como vocalia comun', () => {
    const mesas = [
      ...createMesasConVocalias(3),
      createMesa({ id: 'cruzado-1', tribunalCruzado: 'doc-1' }),
    ]
    const result = validarDesdeMesas(mesas)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenDocentes[0]).toMatchObject({
      vocaliasPorLlamado: {
        PRIMER_LLAMADO: 3,
      },
      tribunalesCruzadosPorLlamado: {
        PRIMER_LLAMADO: 1,
      },
    })
  })

  it('vocalias de primer y segundo llamado se cuentan por separado', () => {
    const mesas = [
      ...createMesasConVocalias(3, 'first'),
      ...createMesasConVocalias(3, 'second'),
    ]
    const result = validarDesdeMesas(mesas, configRegularDosLlamados)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenDocentes[0]).toMatchObject({
      vocaliasPorLlamado: {
        PRIMER_LLAMADO: 3,
        SEGUNDO_LLAMADO: 3,
      },
      excedido: false,
    })
  })

  it('valida vocalias con limite basado en horas catedra cuando el modo esta declarado', () => {
    const docente = {
      ...docenteCincoDias,
      diasAsistencia: ['lunes'],
      horasCatedra: 6,
      halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
    }
    const result = validarLimitesVocaliasPorDocente(
      [docente],
      buildParticipacionesFromMesas(createMesasConVocalias(4)),
      configRegularUnLlamado,
    )

    expect(result.valid).toBe(true)
    expect(result.resumenDocentes[0]).toMatchObject({
      horasCatedra: 6,
      halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
      limiteVocaliasPorLlamado: 4,
      vocaliasPorLlamado: {
        PRIMER_LLAMADO: 4,
      },
    })
  })

  it('si cantidadLlamados es 1 solo valida el llamado correspondiente', () => {
    const result = validarDesdeMesas(createMesasConVocalias(4, 'second'), configRegularUnLlamado)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenDocentes[0]).toMatchObject({
      vocaliasPorLlamado: {
        PRIMER_LLAMADO: 0,
        SEGUNDO_LLAMADO: 4,
      },
      excedido: false,
    })
  })

  it('si un docente llega exactamente al limite genera warning sin error', () => {
    const result = validarDesdeMesas(createMesasConVocalias(3))

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'DOCENTE_ALCANZA_LIMITE_VOCALIAS',
        severity: 'warning',
        docenteId: 'doc-1',
        llamado: 'PRIMER_LLAMADO',
        limite: 3,
        vocaliasAsignadas: 3,
      }),
    ])
  })

  it('validateCronograma incorpora errores criticos por limite de vocalias', () => {
    const cronograma = createMesasConVocalias(4)
    const docentesTitulares = cronograma.map((mesa) => ({
      id: mesa.titular_id,
      nombre: mesa.titular_id,
      diasAsistencia: [],
    }))
    const result = validateCronograma({
      cronograma,
      docentes: [docenteCincoDias, ...docentesTitulares],
      examPeriodConfig: configRegularUnLlamado,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DOCENTE_EXCEDE_LIMITE_VOCALIAS',
        severity: 'critical',
        docenteId: 'doc-1',
      }),
    ])
    expect(result.resumenDocentes).toEqual([
      expect.objectContaining({
        docenteId: 'doc-1',
        excedido: true,
      }),
      ...docentesTitulares.map((docente) => expect.objectContaining({ docenteId: docente.id })),
    ])
  })
})
