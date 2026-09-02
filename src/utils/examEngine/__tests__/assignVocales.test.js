import { describe, expect, it } from 'vitest'
import { assignVocalesToMesas } from '../planning/assignVocales.js'

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
    estado: 'PENDIENTE_FECHA',
    vocal1Id: null,
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

// horasCatedra = cantidad de diasAsistencia en cada fixture: preserva el
// mismo limite floor(horas/2)+1 que daba el modo historico por dias, ahora
// que la asignacion de vocales fuerza TEACHING_HOURS_HALF_PLUS_ONE.
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

describe('examEngine planning: assignVocalesToMesas', () => {
  it('mesa con dos candidatos validos queda COMPLETA', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
    })

    expect(result.mesasConVocales).toEqual([
      expect.objectContaining({
        estado: 'COMPLETA',
        vocal1Id: 'doc-ingles-a',
        vocal2Id: 'doc-ingles-b',
      }),
    ])
    expect(result.summary).toMatchObject({
      totalMesas: 1,
      mesasCompletas: 1,
      vocalesAsignados: 2,
      docentesUsadosComoVocal: 2,
    })
  })

  it('mesa con un solo candidato valido queda CON_UN_VOCAL', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalHistoria],
    })

    expect(result.mesasConVocales[0]).toMatchObject({
      estado: 'CON_UN_VOCAL',
      vocal1Id: 'doc-ingles-a',
      vocal2Id: null,
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MESA_CON_UN_VOCAL' }),
    ]))
  })

  it('mesa sin candidatos validos queda SIN_TRIBUNAL_CONFORMADO', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalHistoria],
    })

    expect(result.mesasConVocales[0]).toMatchObject({
      estado: 'SIN_TRIBUNAL_CONFORMADO',
      vocal1Id: null,
      vocal2Id: null,
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MESA_SIN_VOCALES' }),
    ]))
  })

  it('nunca asigna al titular como vocal', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular],
    })

    expect(result.mesasConVocales[0]).toMatchObject({
      vocal1Id: null,
      vocal2Id: null,
    })
    expect(result.errors).toEqual([])
  })

  it('nunca repite vocal1 y vocal2 con el mismo docente', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
    })

    expect(result.mesasConVocales[0].vocal1Id).not.toBe(result.mesasConVocales[0].vocal2Id)
  })

  it('respeta mitad mas uno antes de asignar', () => {
    const participacionesExistentes = [
      { docenteId: 'doc-ingles-a', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-a', mesaId: 'm2', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-a', mesaId: 'm3', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
      participacionesExistentes,
    })

    expect(result.mesasConVocales[0].vocal1Id).toBe('doc-ingles-b')
    expect(result.mesasConVocales[0].vocal2Id).toBe(null)
    expect(result.mesasConVocales[0].vocal1Id).not.toBe('doc-ingles-a')
  })

  it('recalcula cupo luego de asignar vocal1 antes de asignar vocal2', () => {
    const participacionesExistentes = [
      { docenteId: 'doc-ingles-a', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-a', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalTraductorado],
      participacionesExistentes,
    })

    expect(new Set([
      result.mesasConVocales[0].vocal1Id,
      result.mesasConVocales[0].vocal2Id,
    ])).toEqual(new Set(['doc-ingles-a', 'doc-traductorado']))
    expect(result.mesasConVocales[0].estado).toBe('COMPLETA')
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DOCENTE_ALCANZA_LIMITE_VOCALIAS',
        docenteId: 'doc-ingles-a',
      }),
    ]))
  })

  it('prioriza mayor afinidad', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalTraductorado, vocalInglesA],
    })

    expect(result.mesasConVocales[0].vocal1Id).toBe('doc-ingles-a')
  })

  it('prioriza vocales con fecha compatible con el titular dentro del periodo', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa({
        turno: 'NOCHE',
      })],
      docentes: [
        { ...titular, diasAsistencia: ['lunes'], horasCatedra: 1, turnosDisponibles: ['NOCHE'] },
        { ...vocalInglesA, id: 'doc-incompatible', diasAsistencia: ['martes'], horasCatedra: 1, turnosDisponibles: ['NOCHE'] },
        { ...vocalInglesB, id: 'doc-compatible-a', diasAsistencia: ['lunes'], horasCatedra: 1, turnosDisponibles: ['NOCHE'] },
        { ...vocalTraductorado, id: 'doc-compatible-b', diasAsistencia: ['lunes'], horasCatedra: 1, turnosDisponibles: ['NOCHE'] },
      ],
      fechasDisponibles: [
        {
          fecha: '2026-07-27',
          diaSemana: 'LUNES',
          llamado: 'PRIMER_LLAMADO',
          turno: 'NOCHE',
          disponible: true,
        },
      ],
      mesasConCandidatos: [{
        mesaId: 'mesa-1',
        candidatosVocales: [
          {
            docenteId: 'doc-incompatible',
            nombre: 'Incompatible',
            valido: true,
            puntajeAfinidad: 100,
            rechazos: [],
            metadata: { vocaliasAsignadas: 0, cargaTotal: 0, disponibilidadDias: 1 },
          },
          {
            docenteId: 'doc-compatible-a',
            nombre: 'Compatible A',
            valido: true,
            puntajeAfinidad: 90,
            rechazos: [],
            metadata: { vocaliasAsignadas: 0, cargaTotal: 0, disponibilidadDias: 1 },
          },
          {
            docenteId: 'doc-compatible-b',
            nombre: 'Compatible B',
            valido: true,
            puntajeAfinidad: 80,
            rechazos: [],
            metadata: { vocaliasAsignadas: 0, cargaTotal: 0, disponibilidadDias: 1 },
          },
        ],
      }],
    })

    expect(new Set([
      result.mesasConVocales[0].vocal1Id,
      result.mesasConVocales[0].vocal2Id,
    ])).toEqual(new Set(['doc-compatible-a', 'doc-compatible-b']))
  })

  it('en igualdad de afinidad prioriza menor puntaje acumulado', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
      options: {
        creditosIniciales: {
          'doc-ingles-a': 6,
          'doc-ingles-b': 0,
        },
      },
    })

    expect(result.mesasConVocales[0].vocal1Id).toBe('doc-ingles-b')
  })

  it('procesa primero mesas con menos candidatos para reservar docentes escasos', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [
        mesa({ id: 'mesa-facil', materiaId: 'ING2', materia: 'Lengua Inglesa II', riskScore: 5 }),
        mesa({ id: 'mesa-dificil', materiaId: 'ING3', materia: 'Lengua Inglesa III', riskScore: 40 }),
      ],
      docentes: [
        titular,
        { ...vocalInglesA, id: 'doc-escaso', diasAsistencia: ['lunes'], horasCatedra: 1 },
        { ...vocalInglesB, id: 'doc-comun' },
      ],
      mesasConCandidatos: [
        {
          mesaId: 'mesa-facil',
          candidatosVocales: [
            {
              docenteId: 'doc-comun',
              nombre: 'Comun',
              valido: true,
              puntajeAfinidad: 100,
              rechazos: [],
              metadata: { vocaliasAsignadas: 0, cargaTotal: 0, disponibilidadDias: 5 },
            },
            {
              docenteId: 'doc-escaso',
              nombre: 'Escaso',
              valido: true,
              puntajeAfinidad: 100,
              rechazos: [],
              metadata: { vocaliasAsignadas: 0, cargaTotal: 0, disponibilidadDias: 1 },
            },
          ],
        },
        {
          mesaId: 'mesa-dificil',
          candidatosVocales: [
            {
              docenteId: 'doc-escaso',
              nombre: 'Escaso',
              valido: true,
              puntajeAfinidad: 100,
              rechazos: [],
              metadata: { vocaliasAsignadas: 0, cargaTotal: 0, disponibilidadDias: 1 },
            },
          ],
        },
      ],
    })

    expect(result.mesasConVocales[1]).toMatchObject({
      id: 'mesa-dificil',
      vocal1Id: 'doc-escaso',
      estado: 'CON_UN_VOCAL',
    })
    expect(result.mesasConVocales[0]).toMatchObject({
      id: 'mesa-facil',
      vocal1Id: 'doc-comun',
      vocal2Id: null,
      estado: 'CON_UN_VOCAL',
    })
    expect(result.summary.assignmentStrategy).toBe('global-balanced')
  })

  it('usa candidatos preconstruidos si recibe mesasConCandidatos', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
      mesasConCandidatos: [{
        mesaId: 'mesa-1',
        candidatosVocales: [
          {
            docenteId: 'doc-prebuilt-a',
            nombre: 'Prebuilt A',
            valido: true,
            puntajeAfinidad: 100,
            rechazos: [],
            metadata: {
              vocaliasAsignadas: 0,
              cargaTotal: 0,
              disponibilidadDias: 5,
            },
          },
          {
            docenteId: 'doc-prebuilt-b',
            nombre: 'Prebuilt B',
            valido: true,
            puntajeAfinidad: 95,
            rechazos: [],
            metadata: {
              vocaliasAsignadas: 0,
              cargaTotal: 0,
              disponibilidadDias: 5,
            },
          },
        ],
      }],
    })

    expect(result.mesasConVocales[0]).toMatchObject({
      vocal1Id: 'doc-prebuilt-a',
      vocal2Id: 'doc-prebuilt-b',
      estado: 'COMPLETA',
      metadata: expect.objectContaining({
        vocalCandidateSource: 'prebuilt',
      }),
    })
    expect(result.summary).toMatchObject({
      prebuiltCandidatesUsed: 1,
      fallbackCandidatesBuilt: 0,
    })
  })

  it('genera participaciones normalizadas para VOCAL_1 y VOCAL_2', () => {
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
    })

    expect(result.participaciones).toEqual([
      expect.objectContaining({
        docenteId: 'doc-ingles-a',
        mesaId: 'mesa-1',
        materiaId: 'ING1',
        carreraId: 'Profesorado de Ingles',
        rol: 'VOCAL_1',
        llamado: 'PRIMER_LLAMADO',
      }),
      expect.objectContaining({
        docenteId: 'doc-ingles-b',
        mesaId: 'mesa-1',
        materiaId: 'ING1',
        carreraId: 'Profesorado de Ingles',
        rol: 'VOCAL_2',
        llamado: 'PRIMER_LLAMADO',
      }),
    ])
  })

  it('si un docente queda justo en el limite genera warning', () => {
    const participacionesExistentes = [
      { docenteId: 'doc-ingles-a', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles-a', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = assignVocalesToMesas({
      mesasPreliminares: [mesa()],
      docentes: [titular, vocalInglesA, vocalInglesB],
      participacionesExistentes,
    })

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DOCENTE_ALCANZA_LIMITE_VOCALIAS',
        severity: 'warning',
        docenteId: 'doc-ingles-a',
      }),
    ]))
    expect(result.summary.docentesEnLimite).toBeGreaterThanOrEqual(1)
  })

  it('no modifica los datos originales de entrada', () => {
    const mesasPreliminares = [mesa()]
    const docentes = [titular, vocalInglesA, vocalInglesB]
    const snapshotMesas = structuredClone(mesasPreliminares)
    const snapshotDocentes = structuredClone(docentes)

    assignVocalesToMesas({
      mesasPreliminares,
      docentes,
    })

    expect(mesasPreliminares).toEqual(snapshotMesas)
    expect(docentes).toEqual(snapshotDocentes)
  })
})
