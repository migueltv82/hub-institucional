import { describe, expect, it } from 'vitest'
import {
  buildTitularIntegrityDiagnosis,
  isProfessionalPracticeSubject,
} from './titularIntegrityDiagnosis.js'

function docente(id, nombre, overrides = {}) {
  return {
    id,
    nombre,
    full_name: nombre,
    activo: true,
    ...overrides,
  }
}

function materia(overrides = {}) {
  return {
    id: 'MAT1',
    materia: 'MAT1',
    nombreMateria: 'Matematica I',
    carrera: 'Profesorado de Matematica',
    carreraId: 'prof-mat',
    titularId: 'doc-1',
    requiereMesa: true,
    ...overrides,
  }
}

function horario({ profesor = 'Persona Uno', materiaNombre = 'Matematica I', carrera = 'Profesorado de Matematica' } = {}) {
  return {
    profesor,
    nombreMateria: materiaNombre,
    materia: materiaNombre,
    carrera,
    dia: 'lunes',
    inicio: '18:00',
    fin: '20:00',
  }
}

function contractMesa(overrides = {}) {
  return {
    preview: {
      plannedMesas: [{
        id: 'mesa-1',
        materiaId: 'MAT1',
        materia: 'Matematica I',
        carrera: 'Profesorado de Matematica',
        carreraId: 'prof-mat',
        titularId: 'doc-1',
        vocal1Id: 'doc-2',
        vocal2Id: 'doc-3',
        estado: 'COMPLETA',
        ...overrides,
      }],
      unassignedMesas: [],
    },
  }
}

describe('examEngine audit: titularIntegrityDiagnosis', () => {
  it('reconoce practicas profesionales pero excluye Practicas Discursivas III y IV', () => {
    expect(isProfessionalPracticeSubject({ nombreMateria: 'Practica Profesional Docente III' })).toBe(true)
    expect(isProfessionalPracticeSubject({ nombreMateria: 'Residencia Pedagogica' })).toBe(true)
    expect(isProfessionalPracticeSubject({ nombreMateria: 'Practicas Discursivas III' })).toBe(false)
    expect(isProfessionalPracticeSubject({ nombreMateria: 'Practicas Discursivas IV' })).toBe(false)
  })

  it('marca titularidad OK cuando la mesa usa como titular al unico docente asignado', () => {
    const result = buildTitularIntegrityDiagnosis({
      snapshot: {
        horariosDocentes: [horario()],
      },
      input: {
        docentes: [
          docente('doc-1', 'Persona Uno'),
          docente('doc-2', 'Persona Dos'),
          docente('doc-3', 'Persona Tres'),
        ],
        materias: [materia()],
      },
      contract: contractMesa(),
    })

    expect(result.resumen).toMatchObject({
      materiasConUnSoloDocenteAsignado: 1,
      mesasConTitular: 1,
      mesasSinTitular: 0,
      mesasConTitularDerivadoDesdeUnicoDocente: 1,
      mesasConTitularDerivadoDesdeHorarioDocente: 1,
      mesasConTitularInvalido: 0,
    })
    expect(result.resultadoFinal).toBe('TITULARIDAD_OK')
    expect(JSON.stringify(result)).not.toContain('Persona Uno')
  })

  it('distingue materias no practicas con multiples docentes de practicas profesionales', () => {
    const result = buildTitularIntegrityDiagnosis({
      snapshot: {
        horariosDocentes: [
          horario({ profesor: 'Persona Uno', materiaNombre: 'Historia Argentina', carrera: 'Profesorado de Historia' }),
          horario({ profesor: 'Persona Dos', materiaNombre: 'Historia Argentina', carrera: 'Profesorado de Historia' }),
          horario({ profesor: 'Persona Tres', materiaNombre: 'Residencia', carrera: 'Profesorado de Historia' }),
          horario({ profesor: 'Persona Cuatro', materiaNombre: 'Residencia', carrera: 'Profesorado de Historia' }),
        ],
      },
      input: {
        docentes: [
          docente('doc-1', 'Persona Uno'),
          docente('doc-2', 'Persona Dos'),
          docente('doc-3', 'Persona Tres'),
          docente('doc-4', 'Persona Cuatro'),
        ],
        materias: [
          materia({
            id: 'HIST',
            materia: 'HIST',
            nombreMateria: 'Historia Argentina',
            carrera: 'Profesorado de Historia',
            carreraId: 'prof-hist',
            titularId: 'doc-1',
          }),
          materia({
            id: 'RES',
            materia: 'RES',
            nombreMateria: 'Residencia',
            carrera: 'Profesorado de Historia',
            carreraId: 'prof-hist',
            titularId: 'doc-3',
          }),
        ],
      },
      contract: { preview: { plannedMesas: [], unassignedMesas: [] } },
    })

    expect(result.validacionInstitucional.materiasNoPracticasConMasDeUnDocente.total).toBe(1)
    expect(result.validacionInstitucional.practicasProfesionalesConMasDeUnDocente.total).toBe(1)
    expect(result.resultadoFinal).toBe('TITULARIDAD_CON_OBSERVACIONES')
  })

  it('marca titularidad critica si una mesa no tiene titular o el titular no existe', () => {
    const result = buildTitularIntegrityDiagnosis({
      snapshot: {
        horariosDocentes: [horario()],
      },
      input: {
        docentes: [docente('doc-1', 'Persona Uno')],
        materias: [materia()],
      },
      contract: {
        preview: {
          plannedMesas: [
            contractMesa({ titularId: '' }).preview.plannedMesas[0],
            contractMesa({ id: 'mesa-2', titularId: 'doc-inexistente' }).preview.plannedMesas[0],
          ],
          unassignedMesas: [],
        },
      },
    })

    expect(result.resumen.mesasSinTitular).toBe(1)
    expect(result.validacionInstitucional.mesasTitularNoExisteEnDocentesAdaptados.total).toBe(1)
    expect(result.resultadoFinal).toBe('TITULARIDAD_CRITICA')
  })

  it('detecta cuando el titular figura tambien como vocal', () => {
    const result = buildTitularIntegrityDiagnosis({
      snapshot: {
        horariosDocentes: [horario()],
      },
      input: {
        docentes: [
          docente('doc-1', 'Persona Uno'),
          docente('doc-2', 'Persona Dos'),
        ],
        materias: [materia()],
      },
      contract: contractMesa({ vocal1Id: 'doc-1', vocal2Id: 'doc-2' }),
    })

    expect(result.validacionInstitucional.mesasTitularComoVocal.total).toBe(1)
    expect(result.resumen.mesasConTitularInvalido).toBe(1)
    expect(result.resultadoFinal).toBe('TITULARIDAD_CRITICA')
  })
})
