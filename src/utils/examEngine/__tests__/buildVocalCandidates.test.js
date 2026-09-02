import { describe, expect, it } from 'vitest'
import { buildVocalCandidatesForMesas } from '../planning/buildVocalCandidates.js'

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
// que buildVocalCandidatesForMesas fuerza TEACHING_HOURS_HALF_PLUS_ONE.
const docenteTitular = {
  id: 'doc-titular',
  nombre: 'Ana Titular',
  activo: true,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Lengua Inglesa I',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const docenteIngles = {
  id: 'doc-ingles',
  nombre: 'Bruno Ingles',
  activo: true,
  carrera: 'Traductorado de Ingles',
  nombreMateria: 'Gramatica Inglesa',
  diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  horasCatedra: 5,
  turnosDisponibles: ['manana'],
}

const docenteHistoria = {
  id: 'doc-historia',
  nombre: 'Carla Historia',
  activo: true,
  carrera: 'Profesorado de Historia',
  nombreMateria: 'Historia Antigua',
  diasAsistencia: ['lunes', 'martes', 'miercoles'],
  horasCatedra: 3,
  turnosDisponibles: ['manana'],
}

const docenteInactivo = {
  id: 'doc-inactivo',
  nombre: 'Dario Inactivo',
  activo: false,
  carrera: 'Profesorado de Ingles',
  nombreMateria: 'Fonetica Inglesa',
  diasAsistencia: ['lunes', 'martes', 'miercoles'],
  horasCatedra: 3,
  turnosDisponibles: ['manana'],
}

function findCandidate(result, docenteId, mesaId = 'mesa-1') {
  return result.mesasConCandidatos
    .find((entry) => entry.mesaId === mesaId)
    ?.candidatosVocales.find((candidate) => candidate.docenteId === docenteId)
}

describe('examEngine planning: buildVocalCandidatesForMesas', () => {
  it('docente afin aparece como candidato valido', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa()],
      docentes: [docenteTitular, docenteIngles],
    })

    expect(findCandidate(result, 'doc-ingles')).toMatchObject({
      docenteId: 'doc-ingles',
      valido: true,
      nivelAfinidad: 'FAMILIA_INGLES',
      rechazos: [],
    })
  })

  it('docente sin afinidad aparece rechazado', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa()],
      docentes: [docenteHistoria],
    })

    expect(findCandidate(result, 'doc-historia')).toMatchObject({
      valido: false,
      rechazos: expect.arrayContaining(['SIN_AFINIDAD']),
    })
  })

  it('titular de la mesa aparece rechazado como vocal', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa()],
      docentes: [docenteTitular],
    })

    expect(findCandidate(result, 'doc-titular')).toMatchObject({
      valido: false,
      rechazos: expect.arrayContaining(['ES_TITULAR_DE_LA_MESA']),
    })
  })

  it('docente inactivo aparece rechazado', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa()],
      docentes: [docenteInactivo],
    })

    expect(findCandidate(result, 'doc-inactivo')).toMatchObject({
      valido: false,
      rechazos: expect.arrayContaining(['DOCENTE_INACTIVO']),
    })
  })

  it('docente que supera mitad mas uno aparece rechazado', () => {
    const participacionesExistentes = [
      { docenteId: 'doc-ingles', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles', mesaId: 'm2', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-ingles', mesaId: 'm3', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa()],
      docentes: [docenteIngles],
      participacionesExistentes,
    })

    expect(findCandidate(result, 'doc-ingles')).toMatchObject({
      valido: false,
      rechazos: expect.arrayContaining(['SUPERA_LIMITE_VOCALIAS']),
    })
  })

  it('usa horas catedra como base cuando el docente declara el modo vigente', () => {
    const docenteConHoras = {
      ...docenteIngles,
      diasAsistencia: ['lunes'],
      horasCatedra: 6,
      halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
    }
    const participacionesExistentes = Array.from({ length: 3 }, (_, index) => ({
      docenteId: 'doc-ingles',
      mesaId: `m${index + 1}`,
      rol: 'VOCAL_1',
      llamado: 'PRIMER_LLAMADO',
    }))
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa()],
      docentes: [docenteConHoras],
      participacionesExistentes,
    })

    expect(findCandidate(result, 'doc-ingles')).toMatchObject({
      valido: true,
      metadata: {
        limiteVocaliasPorLlamado: 4,
        halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
        teachingHours: 6,
      },
    })
  })

  it('no habilita un dia sin asistencia aunque exista cupo por horas catedra', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa({ fecha: '2026-07-28' })],
      docentes: [{
        ...docenteIngles,
        dia: 'lunes',
        diasAsistencia: ['lunes'],
        horasCatedra: 10,
        halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
      }],
    })

    expect(findCandidate(result, 'doc-ingles')).toMatchObject({
      valido: false,
      rechazos: expect.arrayContaining(['SIN_DISPONIBILIDAD']),
      metadata: {
        teacherAssignableOnDate: false,
      },
    })
  })

  it('docente con turno incompatible aparece rechazado', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa({ turno: 'tarde' })],
      docentes: [docenteIngles],
    })

    expect(findCandidate(result, 'doc-ingles')).toMatchObject({
      valido: false,
      rechazos: expect.arrayContaining(['TURNO_INCOMPATIBLE']),
    })
  })

  it('si la mesa no tiene fecha no bloquea por dia especifico', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa({ fecha: null })],
      docentes: [docenteIngles],
    })

    expect(findCandidate(result, 'doc-ingles')).toMatchObject({
      valido: true,
      warnings: expect.arrayContaining(['La disponibilidad por dia se validara cuando la mesa tenga fecha.']),
    })
  })

  it('Ingles transversal genera candidato valido', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa({
        carrera: 'Profesorado de Frances',
        materiaId: 'ING-OPT',
        materia: 'Practicas Discursivas en Ingles',
      })],
      docentes: [docenteIngles],
    })

    expect(findCandidate(result, 'doc-ingles')).toMatchObject({
      valido: true,
      nivelAfinidad: 'FAMILIA_INGLES',
    })
  })

  it('Informatica/TIC genera candidato valido sin falsos positivos', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa({
        id: 'mesa-tic',
        carrera: 'Tecnicatura en Software',
        carreraId: 'Tecnicatura en Software',
        materiaId: 'PRG1',
        materia: 'Programacion I',
        familiaIdoneidad: 'INFORMATICA_TIC',
      })],
      docentes: [
        {
          id: 'doc-tic',
          nombre: 'Eva TIC',
          activo: true,
          carrera: 'Profesorado de Informatica',
          nombreMateria: 'Tecnologia de la Informacion',
          diasAsistencia: ['lunes', 'martes', 'miercoles'],
          horasCatedra: 3,
          turnosDisponibles: ['manana'],
        },
        {
          id: 'doc-didactica',
          nombre: 'Fede Didactica',
          activo: true,
          carrera: 'Profesorado de Lengua',
          nombreMateria: 'Didactica General',
          diasAsistencia: ['lunes', 'martes', 'miercoles'],
          horasCatedra: 3,
          turnosDisponibles: ['manana'],
        },
      ],
    })

    expect(findCandidate(result, 'doc-tic', 'mesa-tic')).toMatchObject({
      valido: true,
      nivelAfinidad: 'FAMILIA_INFORMATICA_TIC',
    })
    expect(findCandidate(result, 'doc-didactica', 'mesa-tic')).toMatchObject({
      valido: false,
      rechazos: expect.arrayContaining(['SIN_AFINIDAD']),
    })
  })

  it('rechaza Quimica de otra carrera para una mesa de Traductorado', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa({
        id: 'mesa-trad',
        carrera: 'Traductorado de Ingles',
        carreraId: 'Traductorado de Ingles',
        materiaId: 'QUI1',
        materia: 'Quimica aplicada a la traduccion',
      })],
      docentes: [{
        id: 'doc-quimica',
        nombre: 'Docente Quimica',
        activo: true,
        carrera: 'Profesorado de Quimica',
        nombreMateria: 'Quimica aplicada a la traduccion',
        diasAsistencia: ['lunes', 'martes', 'miercoles'],
        horasCatedra: 3,
        turnosDisponibles: ['manana'],
      }],
      requireCareerCompatibility: true,
    })

    expect(findCandidate(result, 'doc-quimica', 'mesa-trad')).toMatchObject({
      valido: false,
      nivelAfinidad: 'CARRERA_INCOMPATIBLE',
      rechazos: expect.arrayContaining(['CARRERA_INCOMPATIBLE']),
    })
  })

  it('practica tecnica solo acepta docente de la misma carrera tecnica', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa({
        id: 'mesa-practica-tecnica',
        carrera: 'Tecnicatura Superior en Turismo',
        carreraId: 'Tecnicatura Superior en Turismo',
        materiaId: 'PPT2',
        materia: 'Practica Profesional II',
        familiaIdoneidad: 'PRACTICA_TECNICA',
      })],
      docentes: [
        {
          id: 'doc-turismo',
          nombre: 'Gala Turismo',
          activo: true,
          carrera: 'Tecnicatura Superior en Turismo',
          nombreMateria: 'Practica Profesional I',
          diasAsistencia: ['lunes', 'martes', 'miercoles'],
          horasCatedra: 3,
          turnosDisponibles: ['manana'],
        },
        {
          id: 'doc-lab',
          nombre: 'Hugo Laboratorio',
          activo: true,
          carrera: 'Tecnicatura Superior en Laboratorio',
          nombreMateria: 'Practica Profesional I',
          diasAsistencia: ['lunes', 'martes', 'miercoles'],
          horasCatedra: 3,
          turnosDisponibles: ['manana'],
        },
      ],
    })

    expect(findCandidate(result, 'doc-turismo', 'mesa-practica-tecnica')).toMatchObject({
      valido: true,
      nivelAfinidad: 'PRACTICA_TECNICA_MISMA_CARRERA',
    })
    expect(findCandidate(result, 'doc-lab', 'mesa-practica-tecnica')).toMatchObject({
      valido: false,
      rechazos: expect.arrayContaining(['SIN_AFINIDAD']),
    })
  })

  it('mesa sin candidatos validos genera warning', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [mesa()],
      docentes: [docenteTitular, docenteHistoria, docenteInactivo],
    })

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'MESA_SIN_CANDIDATOS_VOCALES',
        severity: 'warning',
        mesaId: 'mesa-1',
      }),
    ])
  })

  it('summary contabiliza mesas con y sin candidatos', () => {
    const result = buildVocalCandidatesForMesas({
      mesasPreliminares: [
        mesa({ id: 'mesa-con-candidatos' }),
        mesa({
          id: 'mesa-sin-candidatos',
          titularId: 'doc-titular-2',
          carrera: 'Tecnicatura en Software',
          carreraId: 'Tecnicatura en Software',
          materiaId: 'PRG1',
          materia: 'Programacion I',
        }),
      ],
      docentes: [
        docenteIngles,
        {
          ...docenteHistoria,
          id: 'doc-titular-2',
          nombre: 'Titular 2',
        },
      ],
    })

    expect(result.summary).toMatchObject({
      totalMesas: 2,
      mesasSinCandidatos: 1,
      mesasConUnCandidato: 1,
      mesasConDosOMasCandidatos: 0,
      totalCandidatosValidos: 1,
    })
    expect(result.summary.totalCandidatosRechazados).toBeGreaterThan(0)
  })
})
