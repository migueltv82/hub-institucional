import { describe, expect, it } from 'vitest'
import {
  buildTemplateTitularSourcesDiagnosis,
  calculateSimilarity,
  normalizeText,
} from './templateTitularSourcesDiagnosis.js'

function plan(overrides = {}) {
  return {
    carrera: 'Profesorado de Ingles',
    materia: 'ING1',
    nombreMateria: 'Ingles I',
    anio: 1,
    ...overrides,
  }
}

function horario(overrides = {}) {
  return {
    carrera: 'Profesorado de Ingles',
    materia: 'ING1',
    nombreMateria: 'Ingles I',
    profesor: 'Nombre Sensible',
    dia: 'lunes',
    inicio: '18:00',
    fin: '20:00',
    ...overrides,
  }
}

function adaptedSubject(overrides = {}) {
  return {
    carrera: 'Profesorado de Ingles',
    materia: 'ING1',
    nombreMateria: 'Ingles I',
    titularId: 'doc-1',
    requiereMesa: true,
    requiereMesaSource: 'horariosDocentes',
    ...overrides,
  }
}

describe('templateTitularSourcesDiagnosis', () => {
  it('normaliza tildes, mayusculas y signos', () => {
    expect(normalizeText('  PRACTICA   Profesionalizante I!!! ')).toBe('practica profesionalizante i')
  })

  it('calcula similitud por tokens', () => {
    expect(calculateSimilarity('Quimica General I', 'Quimica General')).toBeGreaterThan(0.5)
    expect(calculateSimilarity('Matematica', 'Turismo')).toBe(0)
  })

  it('clasifica titular inferido cuando plan y horarios coinciden por carrera y materia', () => {
    const result = buildTemplateTitularSourcesDiagnosis({
      snapshot: {
        planesEstudio: [plan()],
        horariosDocentes: [horario()],
      },
      input: {
        materias: [adaptedSubject()],
      },
    })

    expect(result.summary.materiasConTitularInferido).toBe(1)
    expect(result.motivos.TITULAR_INFERIDO).toBe(1)
  })

  it('marca materia no requerida cuando el adaptador la excluye por falta de horario', () => {
    const result = buildTemplateTitularSourcesDiagnosis({
      snapshot: {
        planesEstudio: [
          plan({
            materia: 'ING2',
            nombreMateria: 'Ingles II',
          }),
        ],
        horariosDocentes: [],
      },
      input: {
        materias: [
          adaptedSubject({
            materia: 'ING2',
            nombreMateria: 'Ingles II',
            titularId: '',
            requiereMesa: false,
            requiereMesaSource: 'sinHorarioDocente',
          }),
        ],
      },
    })

    expect(result.summary.materiasSinHorarioNoRequeridas).toBe(1)
    expect(result.summary.titularesFaltantesReales).toBe(0)
    expect(result.ejemplosSeguros[0]).toMatchObject({
      motivo: 'MATERIA_NO_REQUERIDA',
    })
  })

  it('sugiere posible match por nombre parecido', () => {
    const result = buildTemplateTitularSourcesDiagnosis({
      snapshot: {
        planesEstudio: [plan({ materia: 'QUI1', nombreMateria: 'Quimica General I' })],
        horariosDocentes: [horario({ materia: 'QUIG', nombreMateria: 'Quimica General' })],
      },
      input: {
        materias: [adaptedSubject({ materia: 'QUI1', nombreMateria: 'Quimica General I', titularId: '', requiereMesa: true })],
      },
    })

    expect(result.summary.posiblesErroresEscritura).toBe(1)
    expect(result.ejemplosSeguros[0].posibleCoincidenciaEnHorarios).toMatchObject({
      materia: 'quimica general',
    })
  })

  it('detecta horarios huerfanos y anonimiza docentes', () => {
    const result = buildTemplateTitularSourcesDiagnosis({
      snapshot: {
        planesEstudio: [plan()],
        horariosDocentes: [horario({ materia: 'TUR1', nombreMateria: 'Turismo I', profesor: 'Persona Privada' })],
      },
      input: { materias: [adaptedSubject()] },
    })

    expect(result.summary.horariosHuerfanos).toBe(1)
    expect(result.horariosHuerfanosEjemplos[0].docenteAnonId).toMatch(/^doc-/)
    expect(JSON.stringify(result)).not.toContain('Persona Privada')
  })

  it('distingue practicas profesionales de practicas discursivas', () => {
    const result = buildTemplateTitularSourcesDiagnosis({
      snapshot: {
        planesEstudio: [
          plan({ materia: 'PRA1', nombreMateria: 'Practica Profesional Docente I' }),
          plan({ materia: 'DIS3', nombreMateria: 'Practicas Discursivas en Ingles III' }),
          plan({ materia: 'DIS4', nombreMateria: 'Practicas Discrusivas en Ingles IV' }),
        ],
        horariosDocentes: [
          horario({ materia: 'PRA1', nombreMateria: 'Practica Profesional Docente I', profesor: 'Docente A' }),
          horario({ materia: 'PRA1', nombreMateria: 'Practica Profesional Docente I', profesor: 'Docente B' }),
          horario({ materia: 'DIS3', nombreMateria: 'Practicas Discursivas en Ingles III', profesor: 'Docente C' }),
          horario({ materia: 'DIS3', nombreMateria: 'Practicas Discursivas en Ingles III', profesor: 'Docente D' }),
          horario({ materia: 'DIS4', nombreMateria: 'Practicas Discrusivas en Ingles IV', profesor: 'Docente E' }),
          horario({ materia: 'DIS4', nombreMateria: 'Practicas Discrusivas en Ingles IV', profesor: 'Docente F' }),
        ],
      },
      input: {
        materias: [
          adaptedSubject({ materia: 'PRA1', nombreMateria: 'Practica Profesional Docente I' }),
          adaptedSubject({ materia: 'DIS3', nombreMateria: 'Practicas Discursivas en Ingles III' }),
          adaptedSubject({ materia: 'DIS4', nombreMateria: 'Practicas Discrusivas en Ingles IV' }),
        ],
      },
    })

    expect(result.grupos.practicasProfesionalesConMasDeUnDocente).toBe(1)
    expect(result.grupos.practicasDiscursivasIIIIVDetectadas).toBe(2)
    expect(result.grupos.materiasNoPracticasConMasDeUnDocente).toBe(2)
  })
})
