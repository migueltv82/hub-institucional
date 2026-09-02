import { describe, expect, it } from 'vitest'
import { repairIncompleteTribunals } from '../planning/repairTribunals.js'

function mesa(overrides = {}) {
  return {
    id: 'mesa-1',
    candidateId: 'candidate:profesorado de ingles::ing1',
    materiaId: 'ING1',
    materia: 'Lengua Inglesa I',
    carreraId: 'Profesorado de Ingles',
    carrera: 'Profesorado de Ingles',
    anio: 1,
    llamado: 'PRIMER_LLAMADO',
    titularId: 'doc-titular',
    titularNombre: 'Ana Titular',
    estado: 'CON_UN_VOCAL',
    vocal1Id: 'doc-ingles-a',
    vocal2Id: null,
    fecha: null,
    hora: null,
    turno: 'manana',
    noAgrupable: false,
    familiaIdoneidad: 'INGLES',
    correlativasPrevias: [],
    correlativasPosteriores: [],
    riskScore: 20,
    riskLevel: 'LOW',
    warnings: [],
    errors: [],
    metadata: {},
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
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const vocalInglesA = {
  id: 'doc-ingles-a',
  nombre: 'Bruno Ingles',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa II',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const vocalInglesB = {
  id: 'doc-ingles-b',
  nombre: 'Carla Ingles',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Gramatica Inglesa',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const vocalTraductorado = {
  id: 'doc-traductorado',
  nombre: 'Dario Traductorado',
  activo: true,
  carrera: 'Traductorado de Ingles',
  nombreMateria: 'Fonetica Inglesa',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const vocalHistoria = {
  id: 'doc-historia',
  nombre: 'Eva Historia',
  activo: true,
  carrera: 'Profesorado de Historia',
  nombreMateria: 'Historia Antigua',
  diasAsistencia: ['lunes', 'martes', 'miercoles'],
  horasCatedra: 3,
  turnosDisponibles: ['manana'],
}

const vocalInglesTarde = {
  ...vocalInglesB,
  id: 'doc-ingles-tarde',
  nombre: 'Carla Tarde',
  turnosDisponibles: ['tarde'],
}

const titularHistoria = {
  id: 'doc-titular-historia',
  nombre: 'Ana Historia',
  activo: true,
  carrera: 'Profesorado de Historia',
  nombreMateria: 'Historia Antigua',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const vocalHistoriaA = {
  id: 'doc-historia-a',
  nombre: 'Hilda Historia',
  activo: true,
  carrera: 'Profesorado de Historia',
  nombreMateria: 'Historia Medieval',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const vocalIdoneoLimitado = {
  id: 'doc-idoneo-limitado',
  nombre: 'Ivan Idoneo',
  activo: true,
  carrera: 'Tecnicatura Superior',
  nombreMateria: 'Seminario Institucional',
  idoneidadAcademica: true,
  diasAsistencia: ['lunes'],
  horasCatedra: 1,
  turnosDisponibles: ['manana'],
}

const titularDonanteIngles = {
  id: 'doc-titular-donante',
  nombre: 'Dora Donante',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa I',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const vocalDonanteIngles = {
  id: 'doc-donante-ingles',
  nombre: 'Elena Ingles',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa II',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const reemplazoDonanteIngles = {
  id: 'doc-reemplazo-ingles',
  nombre: 'Felipe Ingles',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Gramatica Inglesa',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

describe('examEngine planning: repairIncompleteTribunals', () => {
  it('mesa CON_UN_VOCAL se completa si existe candidato valido', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
    })

    expect(result.mesasReparadas[0]).toMatchObject({
      estado: 'COMPLETA',
      vocal1Id: 'doc-ingles-a',
      vocal2Id: 'doc-ingles-b',
    })
    expect(result.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        mesaId: 'mesa-1',
        beforeStatus: 'CON_UN_VOCAL',
        afterStatus: 'COMPLETA',
        action: 'COMPLETAR_TRIBUNAL',
        success: true,
      }),
    ]))
  })

  it('mesa SIN_TRIBUNAL_CONFORMADO asigna dos vocales si hay candidatos validos', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa({ estado: 'SIN_TRIBUNAL_CONFORMADO', vocal1Id: null })],
      docentes: [titular, vocalInglesA, vocalInglesB],
    })

    expect(result.mesasReparadas[0]).toMatchObject({
      estado: 'COMPLETA',
      vocal1Id: 'doc-ingles-a',
      vocal2Id: 'doc-ingles-b',
    })
    expect(result.summary.mesasReparadas).toBe(2)
  })

  it('mesa sin candidatos validos queda SIN_TRIBUNAL_CONFORMADO', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa({ estado: 'SIN_TRIBUNAL_CONFORMADO', vocal1Id: null })],
      docentes: [titular, vocalHistoria],
    })

    expect(result.mesasReparadas[0]).toMatchObject({
      estado: 'SIN_TRIBUNAL_CONFORMADO',
      vocal1Id: null,
      vocal2Id: null,
    })
    expect(result.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'NO_HAY_CANDIDATOS_VALIDOS', success: false }),
    ]))
  })

  it('no modifica mesa COMPLETA valida', () => {
    const completeMesa = mesa({
      estado: 'COMPLETA',
      vocal1Id: 'doc-ingles-a',
      vocal2Id: 'doc-ingles-b',
    })
    const result = repairIncompleteTribunals({
      mesas: [completeMesa],
      docentes: [titular, vocalInglesA, vocalInglesB],
    })

    expect(result.mesasReparadas[0]).toEqual(completeMesa)
    expect(result.repairs).toEqual([])
  })

  it('no asigna al titular como vocal', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa({ estado: 'SIN_TRIBUNAL_CONFORMADO', vocal1Id: null })],
      docentes: [titular],
    })

    expect(result.mesasReparadas[0]).toMatchObject({
      vocal1Id: null,
      vocal2Id: null,
    })
    expect(result.errors).toEqual([])
  })

  it('no duplica vocales', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
    })

    expect(result.mesasReparadas[0].vocal1Id).not.toBe(result.mesasReparadas[0].vocal2Id)
  })

  it('respeta mitad mas uno', () => {
    const participaciones = [
      { docenteId: 'doc-ingles-b', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-b', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-b', mesaId: 'm3', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = repairIncompleteTribunals({
      mesas: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
      participaciones,
    })

    expect(result.mesasReparadas[0]).toMatchObject({
      estado: 'CON_UN_VOCAL',
      vocal2Id: null,
    })
  })

  it('repara con intercambio global si la mesa donante conserva tribunal completo', () => {
    const mesaObjetivo = mesa({
      id: 'mesa-historia',
      materiaId: 'HIST1',
      materia: 'Historia Antigua',
      carreraId: 'Profesorado de Historia',
      carrera: 'Profesorado de Historia',
      titularId: 'doc-titular-historia',
      estado: 'CON_UN_VOCAL',
      vocal1Id: 'doc-historia-a',
      vocal2Id: null,
    })
    const mesaDonante = mesa({
      id: 'mesa-donante',
      materiaId: 'ING2',
      materia: 'Lengua Inglesa II',
      carreraId: 'Profesorado de Ingles',
      carrera: 'Profesorado de Ingles',
      titularId: 'doc-titular-donante',
      estado: 'COMPLETA',
      vocal1Id: 'doc-idoneo-limitado',
      vocal2Id: 'doc-donante-ingles',
    })

    const result = repairIncompleteTribunals({
      mesas: [mesaDonante, mesaObjetivo],
      docentes: [
        titularHistoria,
        vocalHistoriaA,
        vocalIdoneoLimitado,
        titularDonanteIngles,
        vocalDonanteIngles,
        reemplazoDonanteIngles,
      ],
    })

    expect(result.mesasReparadas.find((current) => current.id === 'mesa-historia')).toMatchObject({
      estado: 'COMPLETA',
      vocal1Id: 'doc-historia-a',
      vocal2Id: 'doc-idoneo-limitado',
    })
    expect(result.mesasReparadas.find((current) => current.id === 'mesa-donante')).toMatchObject({
      estado: 'COMPLETA',
      vocal1Id: 'doc-reemplazo-ingles',
      vocal2Id: 'doc-donante-ingles',
    })
    expect(result.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'REASIGNACION_GLOBAL_COMPLETAR_TRIBUNAL',
        success: true,
        relatedMesaId: 'mesa-donante',
        replacementDocenteId: 'doc-reemplazo-ingles',
      }),
    ]))
    expect(result.summary.reparacionesGlobales).toBe(1)
  })

  it('no rompe una mesa completa si el intercambio global no tiene reemplazo valido', () => {
    const mesaObjetivo = mesa({
      id: 'mesa-historia',
      materiaId: 'HIST1',
      materia: 'Historia Antigua',
      carreraId: 'Profesorado de Historia',
      carrera: 'Profesorado de Historia',
      titularId: 'doc-titular-historia',
      estado: 'CON_UN_VOCAL',
      vocal1Id: 'doc-historia-a',
      vocal2Id: null,
    })
    const mesaDonante = mesa({
      id: 'mesa-donante',
      materiaId: 'ING2',
      materia: 'Lengua Inglesa II',
      carreraId: 'Profesorado de Ingles',
      carrera: 'Profesorado de Ingles',
      titularId: 'doc-titular-donante',
      estado: 'COMPLETA',
      vocal1Id: 'doc-idoneo-limitado',
      vocal2Id: 'doc-donante-ingles',
    })

    const result = repairIncompleteTribunals({
      mesas: [mesaDonante, mesaObjetivo],
      docentes: [
        titularHistoria,
        vocalHistoriaA,
        vocalIdoneoLimitado,
        titularDonanteIngles,
        vocalDonanteIngles,
      ],
    })

    expect(result.mesasReparadas.find((current) => current.id === 'mesa-donante')).toMatchObject({
      estado: 'COMPLETA',
      vocal1Id: 'doc-idoneo-limitado',
      vocal2Id: 'doc-donante-ingles',
    })
    expect(result.mesasReparadas.find((current) => current.id === 'mesa-historia')).toMatchObject({
      estado: 'CON_UN_VOCAL',
      vocal1Id: 'doc-historia-a',
      vocal2Id: null,
    })
    expect(result.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'NO_GLOBAL_SWAP_AVAILABLE',
        success: false,
      }),
    ]))
  })

  it('recalcula candidatos usando participaciones actualizadas de entrada', () => {
    const participaciones = [
      { docenteId: 'doc-ingles-b', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-b', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-b', mesaId: 'm3', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = repairIncompleteTribunals({
      mesas: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB, vocalTraductorado],
      participaciones,
    })

    expect(result.mesasReparadas[0].vocal2Id).toBe('doc-traductorado')
    expect(result.mesasReparadas[0].vocal2Id).not.toBe('doc-ingles-b')
  })

  it('no asigna docente que queda en limite despues de reparar una mesa previa', () => {
    const participaciones = [
      { docenteId: 'doc-ingles-b', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-b', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = repairIncompleteTribunals({
      mesas: [
        mesa({ id: 'mesa-1' }),
        mesa({ id: 'mesa-2', materiaId: 'ING2', materia: 'Lengua Inglesa II' }),
      ],
      docentes: [titular, vocalInglesA, vocalInglesB],
      participaciones,
    })

    expect(result.mesasReparadas[0]).toMatchObject({
      estado: 'COMPLETA',
      vocal2Id: 'doc-ingles-b',
    })
    expect(result.mesasReparadas[1]).toMatchObject({
      estado: 'CON_UN_VOCAL',
      vocal2Id: null,
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DOCENTE_ALCANZA_LIMITE_VOCALIAS_REPAIR',
        docenteId: 'doc-ingles-b',
      }),
      expect.objectContaining({ code: 'REPARACION_QUEDA_CON_UN_VOCAL', mesaId: 'mesa-2' }),
    ]))
  })

  it('prioriza validacion actualizada aunque reciba candidatos preconstruidos desactualizados', () => {
    const participaciones = [
      { docenteId: 'doc-ingles-b', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-b', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-b', mesaId: 'm3', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = repairIncompleteTribunals({
      mesas: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
      participaciones,
      mesasConCandidatos: [{
        mesaId: 'mesa-1',
        candidatosVocales: [{
          docenteId: 'doc-ingles-b',
          nombre: 'Carla Ingles',
          valido: true,
          nivelAfinidad: 'MISMA_CARRERA',
          puntajeAfinidad: 100,
          rechazos: [],
          metadata: {
            limiteVocaliasPorLlamado: 3,
            vocaliasAsignadas: 0,
            disponibilidadDias: 5,
            cargaTotal: 0,
          },
        }],
      }],
    })

    expect(result.mesasReparadas[0]).toMatchObject({
      estado: 'CON_UN_VOCAL',
      vocal2Id: null,
    })
    expect(result.participaciones.filter((participacion) => participacion.docenteId === 'doc-ingles-b')).toHaveLength(3)
  })

  it('respeta afinidad e idoneidad', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa({ estado: 'SIN_TRIBUNAL_CONFORMADO', vocal1Id: null })],
      docentes: [titular, vocalHistoria],
    })

    expect(result.mesasReparadas[0].vocal1Id).toBeNull()
    expect(result.participaciones).toEqual([])
  })

  it('respeta turno si esta definido', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa({ estado: 'SIN_TRIBUNAL_CONFORMADO', vocal1Id: null })],
      docentes: [titular, vocalInglesTarde],
    })

    expect(result.mesasReparadas[0]).toMatchObject({
      estado: 'SIN_TRIBUNAL_CONFORMADO',
      vocal1Id: null,
      vocal2Id: null,
    })
  })

  it('registra repairs con beforeStatus, afterStatus, action y success', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
    })

    expect(result.repairs[0]).toEqual(expect.objectContaining({
      beforeStatus: 'CON_UN_VOCAL',
      afterStatus: 'COMPLETA',
      action: expect.any(String),
      success: true,
    }))
  })

  it('genera warning si queda con un solo vocal', () => {
    const result = repairIncompleteTribunals({
      mesas: [mesa()],
      docentes: [titular, vocalInglesA, vocalHistoria],
    })

    expect(result.mesasReparadas[0].estado).toBe('CON_UN_VOCAL')
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REPARACION_QUEDA_CON_UN_VOCAL' }),
    ]))
  })

  it('no muta los datos originales de entrada', () => {
    const mesas = [mesa()]
    const docentes = [titular, vocalInglesA, vocalTraductorado]
    const participaciones = [
      { docenteId: 'doc-ingles-a', mesaId: 'mesa-1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
    ]
    const snapshotMesas = structuredClone(mesas)
    const snapshotDocentes = structuredClone(docentes)
    const snapshotParticipaciones = structuredClone(participaciones)

    repairIncompleteTribunals({
      mesas,
      docentes,
      participaciones,
    })

    expect(mesas).toEqual(snapshotMesas)
    expect(docentes).toEqual(snapshotDocentes)
    expect(participaciones).toEqual(snapshotParticipaciones)
  })
})
