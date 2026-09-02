import { describe, expect, it } from 'vitest'
import { compactCompatibleMesas } from '../planning/compactMesas.js'
import { contarVocaliasPorDocente } from '../rules/halfPlusOne.js'
import { buildParticipacionesFromMesas } from '../validation/validateTribunals.js'

function mesa(overrides = {}) {
  return {
    id: 'mesa-1',
    materiaId: 'ING1',
    materia: 'Lengua Inglesa I',
    carreraId: 'prof-ingles',
    carrera: 'Profesorado de Ingles',
    anio: 1,
    llamado: 'PRIMER_LLAMADO',
    titularId: 'doc-titular-a',
    titularNombre: 'Ana Titular',
    vocal1Id: 'doc-vocal-a',
    vocal2Id: 'doc-vocal-b',
    estado: 'COMPLETA',
    turno: 'manana',
    warnings: [],
    errors: [],
    metadata: {},
    ...overrides,
  }
}

// horasCatedra = cantidad de diasAsistencia en cada fixture: preserva el
// mismo limite floor(horas/2)+1 que daba el modo historico por dias, ahora
// que validateTribunals (usado dentro de compactCompatibleMesas para
// revalidar cada fusion) fuerza TEACHING_HOURS_HALF_PLUS_ONE.
const titularA = {
  id: 'doc-titular-a',
  nombre: 'Ana Titular',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa I',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
}

const titularB = {
  id: 'doc-titular-b',
  nombre: 'Beatriz Titular',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Gramatica Inglesa',
  diasAsistencia: [],
}

const vocalA = {
  id: 'doc-vocal-a',
  nombre: 'Carla Vocal',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa II',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
}

const vocalB = {
  id: 'doc-vocal-b',
  nombre: 'Dario Vocal',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Gramatica Inglesa',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
}

const docentesBase = [titularA, titularB, vocalA, vocalB]

const config = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 1,
}

describe('examEngine planning: compactCompatibleMesas', () => {
  it('compacta materias de carreras distintas con grupo institucional explicito', () => {
    const affinityGroup = 'QUIMICA-GENERAL-INORGANICA'
    const docentes = docentesBase.map((docente) => ({ ...docente, gruposAfinidad: [affinityGroup] }))
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ grupo_afin_mesa: affinityGroup, materiaId: 'QUI05', materia: 'Quimica General', carreraId: 'quimica', carrera: 'Profesorado de Quimica' }),
        mesa({ id: 'mesa-2', grupo_afin_mesa: affinityGroup, materiaId: 'LAB05', materia: 'Quimica General e Inorganica', carreraId: 'laboratorio', carrera: 'Tecnico Superior en Laboratorio', titularId: 'doc-titular-b' }),
      ],
      docentes,
      config,
    })

    expect(result.skipped).toEqual([])
    expect(result.mesasCompactadas).toHaveLength(1)
    expect(result.compactaciones[0]).toMatchObject({ tipoCompactacion: 'FAMILIA_IDONEIDAD', success: true })
  })

  it('compacta dos mesas del mismo titular', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', materiaId: 'ING1', materia: 'Lengua Inglesa I' }),
        mesa({ id: 'mesa-2', materiaId: 'ING2', materia: 'Lengua Inglesa II' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.mesasCompactadas).toHaveLength(1)
    expect(result.compactaciones).toEqual([
      expect.objectContaining({
        sourceMesaIds: ['mesa-1', 'mesa-2'],
        tipoCompactacion: 'MISMO_TITULAR',
        success: true,
      }),
    ])
    expect(result.mesasCompactadas[0].materiasAgrupadas).toHaveLength(2)
  })

  it('con requireSameDateAndTurno solo compacta fecha y turno exactos', () => {
    const sameSlot = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', fecha: '2026-07-27', fechaIso: '2026-07-27', turno: 'NOCHE' }),
        mesa({ id: 'mesa-2', materiaId: 'ING2', materia: 'Lengua Inglesa II', fecha: '2026-07-27', fechaIso: '2026-07-27', turno: 'NOCHE' }),
      ],
      docentes: docentesBase,
      config,
      options: { requireSameDateAndTurno: true },
    })
    const differentDate = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', fecha: '2026-07-27', turno: 'NOCHE' }),
        mesa({ id: 'mesa-2', materiaId: 'ING2', materia: 'Lengua Inglesa II', fecha: '2026-07-28', turno: 'NOCHE' }),
      ],
      docentes: docentesBase,
      config,
      options: { requireSameDateAndTurno: true },
    })
    const differentTurno = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', fecha: '2026-07-27', turno: 'NOCHE' }),
        mesa({ id: 'mesa-2', materiaId: 'ING2', materia: 'Lengua Inglesa II', fecha: '2026-07-27', turno: 'TARDE' }),
      ],
      docentes: docentesBase,
      config,
      options: { requireSameDateAndTurno: true },
    })

    expect(sameSlot.compactaciones).toHaveLength(1)
    expect(sameSlot.summary.requireSameDateAndTurno).toBe(true)
    ;[differentDate, differentTurno].forEach((result) => {
      expect(result.compactaciones).toEqual([])
      expect(result.mesasCompactadas).toHaveLength(2)
      expect(result.skipped).toEqual(expect.arrayContaining([
        expect.objectContaining({ reason: 'DISTINTA_FECHA_O_TURNO' }),
      ]))
    })
  })

  it('permite hasta tres materias y rechaza una cuarta', () => {
    const threeSubjects = compactCompatibleMesas({
      mesas: [
        mesa({
          id: 'mesa-1',
          materiasAgrupadas: [
            { materiaId: 'ING1', materia: 'Lengua Inglesa I', carrera: 'Profesorado de Ingles', carreraId: 'prof-ingles' },
            { materiaId: 'ING2', materia: 'Lengua Inglesa II', carrera: 'Profesorado de Ingles', carreraId: 'prof-ingles' },
          ],
        }),
        mesa({ id: 'mesa-2', materiaId: 'ING3', materia: 'Lengua Inglesa III' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(threeSubjects.compactaciones).toHaveLength(1)
    expect(threeSubjects.mesasCompactadas[0].materiasAgrupadas).toHaveLength(3)

    const result = compactCompatibleMesas({
      mesas: [
        mesa({
          id: 'mesa-1',
          materiasAgrupadas: [
            { materiaId: 'ING1', materia: 'Lengua Inglesa I', carrera: 'Profesorado de Ingles', carreraId: 'prof-ingles' },
            { materiaId: 'ING2', materia: 'Lengua Inglesa II', carrera: 'Profesorado de Ingles', carreraId: 'prof-ingles' },
            { materiaId: 'ING3', materia: 'Lengua Inglesa III', carrera: 'Profesorado de Ingles', carreraId: 'prof-ingles' },
          ],
        }),
        mesa({ id: 'mesa-2', materiaId: 'ING4', materia: 'Lengua Inglesa IV' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.compactaciones).toEqual([])
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'MAXIMO_TRES_MATERIAS' }),
    ]))
  })

  it('no compacta Practicas Discursivas III', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', materiaId: 'PD3', materia: 'Practicas Discursivas III' }),
        mesa({ id: 'mesa-2', materiaId: 'ING3', materia: 'Lengua Inglesa III' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.compactaciones).toEqual([])
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'MATERIA_NO_AGRUPABLE' }),
    ]))
  })

  it('no compacta Practicas Discursivas IV', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', materiaId: 'PD4', materia: 'Practicas Discursivas IV' }),
        mesa({ id: 'mesa-2', materiaId: 'ING4', materia: 'Lengua Inglesa IV' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.compactaciones).toEqual([])
    expect(result.summary.materiasNoAgrupablesRespetadas).toBe(1)
  })

  it('no compacta mesas de distinto llamado', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', llamado: 'PRIMER_LLAMADO' }),
        mesa({ id: 'mesa-2', llamado: 'SEGUNDO_LLAMADO' }),
      ],
      docentes: docentesBase,
      config: { tipoPeriodo: 'REGULAR', cantidadLlamados: 2 },
    })

    expect(result.compactaciones).toEqual([])
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'DISTINTO_LLAMADO' }),
    ]))
  })

  it('compacta materias homonimas compatibles', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', materiaId: 'ING-A', materia: 'Lengua Inglesa', titularId: 'doc-titular-a' }),
        mesa({ id: 'mesa-2', materiaId: 'ING-B', materia: 'Lengua Inglesa', titularId: 'doc-titular-b' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.compactaciones[0]).toEqual(expect.objectContaining({
      tipoCompactacion: 'MATERIA_HOMONIMA',
      success: true,
    }))
  })

  it('compacta Ingles de carreras no ingles sin importar anio ni carrera', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({
          id: 'mesa-tur-ing',
          materiaId: 'TUR-ING-1',
          materia: 'Ingles I',
          carreraId: 'turismo',
          carrera: 'Tecnicatura Superior en Turismo',
          anio: 1,
          titularId: 'doc-titular-a',
        }),
        mesa({
          id: 'mesa-lab-ing',
          materiaId: 'LAB-ING-3',
          materia: 'Ingles Tecnico III',
          carreraId: 'laboratorio',
          carrera: 'Tecnico Superior en Laboratorio',
          anio: 3,
          titularId: 'doc-titular-b',
        }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.skipped).toEqual([])
    expect(result.compactaciones[0]).toEqual(expect.objectContaining({
      tipoCompactacion: 'INGLES_INSTITUCIONAL',
      success: true,
    }))
  })

  it('compacta Ingles de servicio con cualquier materia de primer anio de Profesorado o Traductorado de Ingles', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({
          id: 'mesa-tur-ing',
          materiaId: 'TUR-ING-1',
          materia: 'Ingles',
          carreraId: 'turismo',
          carrera: 'Tecnicatura Superior en Turismo',
          anio: 2,
          titularId: 'doc-titular-a',
        }),
        mesa({
          id: 'mesa-prof-educ',
          materiaId: 'ING-PED-1',
          materia: 'Pedagogia',
          carreraId: 'prof-ingles',
          carrera: 'Profesorado de Ingles',
          anio: 1,
          titularId: 'doc-titular-b',
        }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.skipped).toEqual([])
    expect(result.compactaciones[0]).toEqual(expect.objectContaining({
      tipoCompactacion: 'INGLES_INSTITUCIONAL',
      success: true,
    }))
  })

  it('compacta Ingles de servicio con una materia de la misma titular en Profesorado o Traductorado', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({
          id: 'mesa-tur-ing',
          materiaId: 'TUR-ING-1',
          materia: 'Ingles',
          carreraId: 'turismo',
          carrera: 'Tecnicatura Superior en Turismo',
          anio: 1,
          titularId: 'doc-titular-a',
        }),
        mesa({
          id: 'mesa-trad-texto',
          materiaId: 'TRA-TEX-3',
          materia: 'Interpretacion de Texto',
          carreraId: 'traductorado',
          carrera: 'Traductorado de Ingles',
          anio: 3,
          titularId: 'doc-titular-a',
        }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.skipped).toEqual([])
    expect(result.compactaciones[0]).toEqual(expect.objectContaining({
      tipoCompactacion: 'MISMO_TITULAR',
      success: true,
    }))
  })

  it('no compacta Ingles de servicio con materias no habilitadas de Profesorado o Traductorado', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({
          id: 'mesa-tur-ing',
          materiaId: 'TUR-ING-1',
          materia: 'Ingles',
          carreraId: 'turismo',
          carrera: 'Tecnicatura Superior en Turismo',
          anio: 1,
          titularId: 'doc-titular-a',
        }),
        mesa({
          id: 'mesa-prof-gra-2',
          materiaId: 'ING-GRA-2',
          materia: 'Gramatica Inglesa II',
          carreraId: 'prof-ingles',
          carrera: 'Profesorado de Ingles',
          anio: 2,
          titularId: 'doc-titular-b',
        }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.compactaciones).toEqual([])
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'SIN_AFINIDAD' }),
    ]))
  })

  it('compacta materias con titulares distintos registrando tribunal cruzado', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', materiaId: 'ING1', materia: 'Lengua Inglesa I', titularId: 'doc-titular-a' }),
        mesa({ id: 'mesa-2', materiaId: 'GRA1', materia: 'Gramatica Inglesa I', titularId: 'doc-titular-b' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.compactaciones[0]).toEqual(expect.objectContaining({
      tribunalCruzado: true,
      titularesInvolucrados: ['doc-titular-a', 'doc-titular-b'],
    }))
    expect(result.mesasCompactadas[0]).toMatchObject({
      tribunalCruzado: true,
      tribunalesCruzados: [expect.objectContaining({ docenteId: 'doc-titular-b' })],
    })
  })

  it('no cuenta tribunal cruzado como vocalia comun', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', titularId: 'doc-titular-a' }),
        mesa({ id: 'mesa-2', titularId: 'doc-titular-b', materiaId: 'GRA1', materia: 'Gramatica Inglesa I' }),
      ],
      docentes: docentesBase,
      config,
    })
    const participaciones = buildParticipacionesFromMesas(result.mesasCompactadas)

    expect(participaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({ docenteId: 'doc-titular-b', rol: 'TRIBUNAL_CRUZADO' }),
    ]))
    expect(contarVocaliasPorDocente(participaciones, 'doc-titular-b', 'PRIMER_LLAMADO')).toBe(0)
  })

  it('no compacta si rompe afinidad', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', materiaId: 'ING1', materia: 'Lengua Inglesa I' }),
        mesa({
          id: 'mesa-2',
          materiaId: 'HIS1',
          materia: 'Historia Antigua',
          carreraId: 'prof-historia',
          carrera: 'Profesorado de Historia',
        }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.compactaciones).toEqual([])
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'SIN_AFINIDAD' }),
    ]))
  })

  it('no compacta practicas tecnicas de distintas tecnicaturas', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({
          id: 'mesa-1',
          materiaId: 'PPS',
          materia: 'Practica Profesionalizante I',
          carreraId: 'tec-software',
          carrera: 'Tecnicatura en Software',
        }),
        mesa({
          id: 'mesa-2',
          materiaId: 'PPE',
          materia: 'Practica Profesionalizante I',
          carreraId: 'tec-enfermeria',
          carrera: 'Tecnicatura en Enfermeria',
        }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'PRACTICA_TECNICA_INCOMPATIBLE' }),
    ]))
  })

  it('no compacta practica tecnica con practica pedagogica', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({
          id: 'mesa-1',
          materiaId: 'PPS',
          materia: 'Practica Profesionalizante I',
          carreraId: 'tec-software',
          carrera: 'Tecnicatura en Software',
        }),
        mesa({
          id: 'mesa-2',
          materiaId: 'PPD',
          materia: 'Practica Profesional Docente',
          carreraId: 'prof-ingles',
          carrera: 'Profesorado de Ingles',
        }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'PRACTICA_TECNICA_INCOMPATIBLE' }),
    ]))
  })

  it('no compacta si genera titular como vocal de su propia mesa', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', titularId: 'doc-titular-a' }),
        mesa({
          id: 'mesa-2',
          titularId: 'doc-titular-b',
          materiaId: 'GRA1',
          materia: 'Gramatica Inglesa I',
          vocal1Id: 'doc-titular-a',
          vocal2Id: 'doc-vocal-b',
        }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.compactaciones).toEqual([])
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'TITULAR_DUPLICADO_COMO_VOCAL' }),
    ]))
  })

  it('registra compactaciones exitosas', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1' }),
        mesa({ id: 'mesa-2', materiaId: 'ING2', materia: 'Lengua Inglesa II' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.summary).toMatchObject({
      totalMesasIniciales: 2,
      totalMesasFinales: 1,
      totalCompactaciones: 1,
    })
    expect(result.compactaciones[0]).toEqual(expect.objectContaining({
      targetMesaId: expect.stringContaining('compact:'),
      success: true,
    }))
  })

  it('registra skipped con motivo claro', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', materia: 'Practicas Discursivas III' }),
        mesa({ id: 'mesa-2', materia: 'Lengua Inglesa III' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.skipped[0]).toEqual(expect.objectContaining({
      mesaIds: ['mesa-1', 'mesa-2'],
      reason: 'MATERIA_NO_AGRUPABLE',
      severity: 'warning',
      detail: expect.any(String),
    }))
  })

  it('conserva los vocales de la mesa que si los tiene cargados al compactar con una mesa sin vocales', () => {
    const result = compactCompatibleMesas({
      mesas: [
        mesa({ id: 'mesa-1', vocal1Id: undefined, vocal2Id: undefined }),
        mesa({ id: 'mesa-2', materiaId: 'ING2', materia: 'Lengua Inglesa II', vocal1Id: 'doc-vocal-a', vocal2Id: 'doc-vocal-b' }),
      ],
      docentes: docentesBase,
      config,
    })

    expect(result.mesasCompactadas).toHaveLength(1)
    expect(result.mesasCompactadas[0]).toMatchObject({
      vocal1Id: 'doc-vocal-a',
      vocal2Id: 'doc-vocal-b',
    })
  })

  it('no muta los datos originales', () => {
    const mesas = [
      mesa({ id: 'mesa-1' }),
      mesa({ id: 'mesa-2', materiaId: 'ING2', materia: 'Lengua Inglesa II' }),
    ]
    const docentes = docentesBase.map((docente) => ({ ...docente }))
    const snapshotMesas = structuredClone(mesas)
    const snapshotDocentes = structuredClone(docentes)

    compactCompatibleMesas({
      mesas,
      docentes,
      config,
    })

    expect(mesas).toEqual(snapshotMesas)
    expect(docentes).toEqual(snapshotDocentes)
  })
})
