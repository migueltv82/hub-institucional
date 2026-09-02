import { describe, expect, it } from 'vitest'
import { planDatesAndVocales } from '../planDatesAndVocales.js'

const config = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 1,
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
}

function mesa(overrides = {}) {
  return {
    id: 'mesa-1',
    materiaId: 'MAT-1',
    materiaCodigo: 'MAT-1',
    codigo: 'MAT-1',
    materia: 'Materia Uno',
    carreraId: 'career-1',
    carrera: 'Carrera Uno',
    anio: 1,
    llamado: 'PRIMER_LLAMADO',
    titularId: 'titular-1',
    turno: 'NOCHE',
    warnings: [],
    errors: [],
    metadata: {},
    ...overrides,
  }
}

function docente(id, diasAsistencia = ['lunes'], overrides = {}) {
  return {
    id,
    nombre: id,
    activo: true,
    diasAsistencia,
    turnosDisponibles: ['NOCHE'],
    horasCatedra: 8,
    halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
    ...overrides,
  }
}

function slot(fecha, diaSemana) {
  return {
    fecha,
    diaSemana,
    llamado: 'PRIMER_LLAMADO',
    turno: 'NOCHE',
    disponible: true,
  }
}

function candidate(docenteId, score = 100) {
  return {
    docenteId,
    valido: true,
    puntajeAfinidad: score,
    rechazos: [],
    metadata: { vocaliasAsignadas: 0, disponibilidadDias: 1 },
  }
}

function candidateRow(mesaId, vocalIds = []) {
  return {
    mesaId,
    candidatosVocales: vocalIds.map((id, index) => candidate(id, 100 - index)),
  }
}

describe('planDatesAndVocales', () => {
  it('resuelve fecha y tribunal completo con vocales disponibles en ese slot', () => {
    const result = planDatesAndVocales({
      mesas: [mesa()],
      mesasConCandidatos: [candidateRow('mesa-1', ['vocal-1', 'vocal-2'])],
      docentes: [docente('titular-1'), docente('vocal-1'), docente('vocal-2')],
      correlatividades: [],
      fechasDisponibles: [slot('2026-07-27', 'LUNES')],
      config,
    })

    expect(result.plannedMesas).toHaveLength(1)
    expect(result.plannedMesas[0]).toMatchObject({
      fecha: '2026-07-27',
      turno: 'NOCHE',
      vocal1Id: 'vocal-1',
      vocal2Id: 'vocal-2',
      estado: 'FECHA_TENTATIVA',
      metadata: {
        dateAwareVocalSelection: true,
        requiresManualReview: false,
      },
    })
    expect(result.unassignedMesas).toHaveLength(0)
  })

  it('planifica la mesa y marca revision cuando el tribunal queda incompleto', () => {
    const result = planDatesAndVocales({
      mesas: [mesa()],
      mesasConCandidatos: [candidateRow('mesa-1', ['vocal-1'])],
      docentes: [docente('titular-1'), docente('vocal-1')],
      correlatividades: [],
      fechasDisponibles: [slot('2026-07-27', 'LUNES')],
      config,
    })

    expect(result.plannedMesas[0]).toMatchObject({
      fecha: '2026-07-27',
      vocal1Id: 'vocal-1',
      vocal2Id: '',
      estado: 'FECHA_TENTATIVA_CON_ALERTAS',
      metadata: { requiresManualReview: true },
    })
    expect(result.plannedMesas[0].warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA' }),
    ]))
    expect(result.unassignedMesas).toHaveLength(0)
  })

  it('deja sin fecha y conserva la prioridad de motivo cuando el titular no esta disponible', () => {
    const result = planDatesAndVocales({
      mesas: [mesa()],
      mesasConCandidatos: [candidateRow('mesa-1', ['vocal-1', 'vocal-2'])],
      docentes: [
        docente('titular-1', ['martes']),
        docente('vocal-1'),
        docente('vocal-2'),
      ],
      correlatividades: [],
      fechasDisponibles: [slot('2026-07-27', 'LUNES')],
      config,
    })

    expect(result.plannedMesas).toHaveLength(0)
    expect(result.unassignedMesas[0]).toMatchObject({
      estado: 'SIN_FECHA_TENTATIVA',
      reason: 'TITULAR_NO_DISPONIBLE',
    })
  })

  it('preserva codigo y scope de carrera para ING19/ING20 sin cruzar homonimos', () => {
    const mesas = [
      mesa({
        id: 'mesa-ing08',
        materiaId: 'uuid-ing08',
        materiaCodigo: 'ING08',
        codigo: 'ING08',
        materia: 'GRAMATICA INGLESA I',
        nombreMateria: 'GRAMATICA INGLESA I',
        carreraId: 'career-profesorado-de-ingles',
        carrera: 'PROFESORADO DE INGLES',
        titularId: 'titular-ing08',
        riskScore: 90,
      }),
      mesa({
        id: 'mesa-ing19',
        materiaId: 'uuid-ing19',
        materiaCodigo: 'ING19',
        codigo: 'ING19',
        materia: 'PRACTICAS DISCURSIVAS EN INGLES II',
        nombreMateria: 'PRACTICAS DISCURSIVAS EN INGLES II',
        carreraId: 'career-profesorado-de-ingles',
        carrera: 'PROFESORADO DE INGLES',
        titularId: 'titular-ing19',
        riskScore: 20,
      }),
      mesa({
        id: 'mesa-ing20',
        materiaId: 'uuid-ing20',
        materiaCodigo: 'ING20',
        codigo: 'ING20',
        materia: 'GRAMATICA INGLESA II',
        nombreMateria: 'GRAMATICA INGLESA II',
        carreraId: 'career-profesorado-de-ingles',
        carrera: 'PROFESORADO DE INGLES',
        titularId: 'titular-ing20',
        riskScore: 10,
      }),
    ]
    const result = planDatesAndVocales({
      mesas,
      mesasConCandidatos: mesas.map((row) => candidateRow(row.id, [`${row.id}-v1`, `${row.id}-v2`])),
      docentes: [
        docente('titular-ing08', ['lunes']),
        docente('titular-ing19', ['martes']),
        docente('titular-ing20', ['miercoles']),
        ...mesas.flatMap((row) => [
          docente(`${row.id}-v1`, ['lunes', 'martes', 'miercoles']),
          docente(`${row.id}-v2`, ['lunes', 'martes', 'miercoles']),
        ]),
      ],
      correlatividades: [
        {
          materiaId: 'ING19',
          codigo: 'ING19',
          nombreMateria: 'PRACTICAS DISCURSIVAS EN INGLES II',
          carreraId: 'career-profesorado-de-ingles',
          carrera: 'PROFESORADO DE INGLES',
          correlativas: ['ING08'],
        },
        {
          materiaId: 'ING20',
          codigo: 'ING20',
          nombreMateria: 'GRAMATICA INGLESA II',
          carreraId: 'career-profesorado-de-ingles',
          carrera: 'PROFESORADO DE INGLES',
          correlativas: ['ING08'],
        },
        {
          materiaId: 'TRA12',
          codigo: 'TRA12',
          nombreMateria: 'GRAMATICA INGLESA II',
          carreraId: 'career-traductorado',
          carrera: 'TECNICO SUP EN TRADUCTORADO',
          correlativas: ['TRA01'],
        },
      ],
      fechasDisponibles: [
        slot('2026-07-27', 'LUNES'),
        slot('2026-07-28', 'MARTES'),
        slot('2026-07-29', 'MIERCOLES'),
      ],
      config,
    })

    expect(result.plannedMesas.map((row) => [row.materiaCodigo, row.fecha])).toEqual([
      ['ING08', '2026-07-27'],
      ['ING19', '2026-07-28'],
      ['ING20', '2026-07-29'],
    ])
    expect(result.unassignedMesas).toHaveLength(0)
    expect(result.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CORRELATIVIDAD_CONFLICTIVA' }),
    ]))
  })
})
