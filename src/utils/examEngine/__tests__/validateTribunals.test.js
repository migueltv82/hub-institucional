import { describe, expect, it } from 'vitest'
import { validateTribunals } from '../validation/validateTribunals.js'

function mesa(overrides = {}) {
  return {
    id: 'mesa-1',
    materiaId: 'ING1',
    materia: 'Lengua Inglesa I',
    carreraId: 'Profesorado de Ingles',
    carrera: 'Profesorado de Ingles',
    llamado: 'PRIMER_LLAMADO',
    titularId: 'doc-titular',
    vocal1Id: 'doc-ingles-a',
    vocal2Id: 'doc-ingles-b',
    estado: 'COMPLETA',
    turno: 'manana',
    fecha: null,
    warnings: [],
    errors: [],
    ...overrides,
  }
}

const titular = {
  id: 'doc-titular',
  nombre: 'Ana Titular',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa I',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  // horasCatedra=5 preserva el mismo limite (floor(5/2)+1=3) que daba el
  // modo historico por dias, ahora que validateTribunals fuerza
  // TEACHING_HOURS_HALF_PLUS_ONE explicitamente.
  horasCatedra: 5,
}

const vocalInglesA = {
  id: 'doc-ingles-a',
  nombre: 'Bruno Ingles',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa II',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  // horasCatedra=5 preserva el mismo limite (floor(5/2)+1=3) que daba el
  // modo historico por dias, ahora que validateTribunals fuerza
  // TEACHING_HOURS_HALF_PLUS_ONE explicitamente.
  horasCatedra: 5,
}

const vocalInglesB = {
  id: 'doc-ingles-b',
  nombre: 'Carla Ingles',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Gramatica Inglesa',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  // horasCatedra=5 preserva el mismo limite (floor(5/2)+1=3) que daba el
  // modo historico por dias, ahora que validateTribunals fuerza
  // TEACHING_HOURS_HALF_PLUS_ONE explicitamente.
  horasCatedra: 5,
}

const vocalHistoria = {
  id: 'doc-historia',
  nombre: 'Eva Historia',
  activo: true,
  carrera: 'Profesorado de Historia',
  nombreMateria: 'Historia Antigua',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  // horasCatedra=5 preserva el mismo limite (floor(5/2)+1=3) que daba el
  // modo historico por dias, ahora que validateTribunals fuerza
  // TEACHING_HOURS_HALF_PLUS_ONE explicitamente.
  horasCatedra: 5,
}

const docentesBase = [titular, vocalInglesA, vocalInglesB]

describe('examEngine validation: validateTribunals', () => {
  it('mesa completa valida pasa', () => {
    const result = validateTribunals({
      mesas: [mesa()],
      docentes: docentesBase,
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.summary).toMatchObject({
      totalMesas: 1,
      mesasCompletas: 1,
      erroresCriticos: 0,
    })
    expect(result.tribunalSummary[0]).toMatchObject({
      mesaId: 'mesa-1',
      expectedStatus: 'COMPLETA',
      complete: true,
    })
  })

  it('mesa sin titular devuelve error critico', () => {
    const result = validateTribunals({
      mesas: [mesa({
        titularId: '',
        vocal1Id: null,
        vocal2Id: null,
        estado: 'SIN_TRIBUNAL_CONFORMADO',
      })],
      docentes: docentesBase,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TITULAR_REQUIRED', severity: 'critical' }),
    ]))
  })

  it('titular usado como vocal devuelve error critico', () => {
    const result = validateTribunals({
      mesas: [mesa({ vocal1Id: 'doc-titular' })],
      docentes: docentesBase,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TITULAR_AS_VOCAL', severity: 'critical' }),
    ]))
  })

  it('vocal1 y vocal2 iguales devuelve error critico', () => {
    const result = validateTribunals({
      mesas: [mesa({ vocal2Id: 'doc-ingles-a' })],
      docentes: docentesBase,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATED_VOCALES', severity: 'critical' }),
    ]))
  })

  it('vocal inexistente devuelve error critico', () => {
    const result = validateTribunals({
      mesas: [mesa({ vocal2Id: 'doc-fantasma' })],
      docentes: docentesBase,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VOCAL_NOT_FOUND', docenteId: 'doc-fantasma' }),
    ]))
  })

  it('vocal inactivo devuelve error critico', () => {
    const inactiveVocal = {
      ...vocalInglesB,
      activo: false,
    }
    const result = validateTribunals({
      mesas: [mesa()],
      docentes: [titular, vocalInglesA, inactiveVocal],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VOCAL_INACTIVE', docenteId: 'doc-ingles-b' }),
    ]))
  })

  it('vocal sin afinidad devuelve error critico', () => {
    const result = validateTribunals({
      mesas: [mesa({ vocal2Id: 'doc-historia' })],
      docentes: [titular, vocalInglesA, vocalHistoria],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VOCAL_SIN_AFINIDAD', docenteId: 'doc-historia' }),
    ]))
  })

  it('vocal excedido por mitad mas uno devuelve error critico', () => {
    const vocalConLimiteDos = {
      ...vocalInglesA,
      diasAsistencia: ['lunes', 'martes', 'miercoles'],
      horasCatedra: 3,
    }
    const result = validateTribunals({
      mesas: [
        mesa({ id: 'mesa-1', vocal1Id: 'doc-ingles-a' }),
        mesa({ id: 'mesa-2', vocal1Id: 'doc-ingles-a' }),
        mesa({ id: 'mesa-3', vocal1Id: 'doc-ingles-a' }),
      ],
      docentes: [titular, vocalConLimiteDos, vocalInglesB],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DOCENTE_EXCEDE_LIMITE_VOCALIAS',
        docenteId: 'doc-ingles-a',
        limite: 2,
        vocaliasAsignadas: 3,
      }),
    ]))
  })

  it('mesa COMPLETA sin vocal2 devuelve error de estado incoherente', () => {
    const result = validateTribunals({
      mesas: [mesa({ vocal2Id: null, estado: 'COMPLETA' })],
      docentes: docentesBase,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ESTADO_COMPLETA_SIN_TRIBUNAL_COMPLETO' }),
    ]))
  })

  it('mesa CON_UN_VOCAL valida pasa con warning', () => {
    const result = validateTribunals({
      mesas: [mesa({ vocal2Id: null, estado: 'CON_UN_VOCAL' })],
      docentes: docentesBase,
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MESA_INCOMPLETA_SIN_ALERTA' }),
    ]))
    expect(result.summary.mesasConUnVocal).toBe(1)
  })

  it('mesa SIN_TRIBUNAL_CONFORMADO valida pasa con warning', () => {
    const result = validateTribunals({
      mesas: [mesa({
        vocal1Id: null,
        vocal2Id: null,
        estado: 'SIN_TRIBUNAL_CONFORMADO',
      })],
      docentes: docentesBase,
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MESA_INCOMPLETA_SIN_ALERTA' }),
    ]))
    expect(result.summary.mesasSinTribunal).toBe(1)
  })

  it('TRIBUNAL_CRUZADO no cuenta como vocalia comun', () => {
    const result = validateTribunals({
      mesas: [mesa({
        tribunalCruzado: 'doc-cruzado',
      })],
      docentes: [
        ...docentesBase,
        {
          id: 'doc-cruzado',
          nombre: 'Docente Cruzado',
          activo: true,
          carrera: 'Profesorado de Historia',
          nombreMateria: 'Historia Antigua',
          diasAsistencia: [],
        },
      ],
    })

    expect(result.valid).toBe(true)
    expect(result.participaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({ docenteId: 'doc-cruzado', rol: 'TRIBUNAL_CRUZADO' }),
    ]))
    expect(result.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ docenteId: 'doc-cruzado', code: 'DOCENTE_EXCEDE_LIMITE_VOCALIAS' }),
    ]))
  })

  it('participaciones duplicadas generan warning controlado', () => {
    const participacion = {
      docenteId: 'doc-ingles-a',
      mesaId: 'mesa-1',
      materiaId: 'ING1',
      carreraId: 'Profesorado de Ingles',
      rol: 'VOCAL_1',
      llamado: 'PRIMER_LLAMADO',
    }
    const result = validateTribunals({
      mesas: [mesa()],
      docentes: docentesBase,
      participaciones: [participacion, { ...participacion }],
    })

    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PARTICIPACION_DUPLICADA' }),
    ]))
  })

  it('no muta los datos originales', () => {
    const mesas = [mesa()]
    const docentes = docentesBase.map((docente) => ({ ...docente }))
    const participaciones = [{
      docenteId: 'doc-ingles-a',
      mesaId: 'mesa-1',
      materiaId: 'ING1',
      rol: 'VOCAL_1',
      llamado: 'PRIMER_LLAMADO',
    }]
    const snapshotMesas = structuredClone(mesas)
    const snapshotDocentes = structuredClone(docentes)
    const snapshotParticipaciones = structuredClone(participaciones)

    validateTribunals({
      mesas,
      docentes,
      participaciones,
    })

    expect(mesas).toEqual(snapshotMesas)
    expect(docentes).toEqual(snapshotDocentes)
    expect(participaciones).toEqual(snapshotParticipaciones)
  })
})
