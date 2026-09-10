import { describe, expect, it } from 'vitest'
import {
  DOCENTE_MATERIA_RESOLUTION_STATUS,
  isProfessionalPracticeSubject,
  resolveDocenteMateriaAssignment,
} from './resolveDocenteMateriaAssignment.js'

const referenceDate = '2026-07-27'

function resolve({ plan, assignments, teacherNameToId = {} }) {
  return resolveDocenteMateriaAssignment({
    plan,
    assignments,
    teacherNameToId,
    referenceDate,
  })
}

function plan(overrides = {}) {
  return {
    carrera: 'Profesorado de Ingles',
    materia_codigo: 'ING1',
    materia_nombre: 'Lengua Inglesa I',
    ...overrides,
  }
}

function assignment(overrides = {}) {
  return {
    carrera: 'Profesorado de Ingles',
    materia_codigo: 'ING1',
    materia_nombre: 'Lengua Inglesa I',
    docente: 'Docente Titular',
    rol_en_materia: 'TITULAR',
    estado_asignacion: 'ACTIVO',
    vigencia_desde: '2026-01-01',
    vigencia_hasta: '2026-12-31',
    ...overrides,
  }
}

describe('resolveDocenteMateriaAssignment', () => {
  it('selecciona titular activo vigente', () => {
    const result = resolve({
      plan: plan(),
      assignments: [assignment()],
      teacherNameToId: {
        'docente titular': 'doc-titular',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_ACTIVO,
      titularId: 'doc-titular',
      source: 'docente_materia',
    })
  })

  it('prioriza materia_id aunque el nombre de la carrera varie entre hojas', () => {
    const result = resolve({
      plan: plan({
        materia_id: '105',
        carrera: 'TECNICO SUPERIOR EN LABORATORIO - PLAN 2024',
      }),
      assignments: [assignment({
        materia_id: 105,
        carrera: 'TECNICATURA SUPERIOR EN LABORATORIO',
      })],
      teacherNameToId: {
        'docente titular': 'doc-titular',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_ACTIVO,
      titularId: 'doc-titular',
      matchedAssignmentsCount: 1,
    })
  })

  it('no confunde bloques repetidos de carga horaria con titulares diferentes', () => {
    const result = resolve({
      plan: plan(),
      assignments: [
        assignment({ dia: 'LUNES', hora_desde: '18:00', hora_hasta: '19:20' }),
        assignment({ dia: 'MIERCOLES', hora_desde: '18:00', hora_hasta: '19:20' }),
      ],
      teacherNameToId: {
        'docente titular': 'doc-titular',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_ACTIVO,
      titularId: 'doc-titular',
      matchedAssignmentsCount: 2,
    })
  })

  it('reconoce TITULAR_Y_VOCAL_AFIN e ignora los vocales al resolver titular', () => {
    const result = resolve({
      plan: plan(),
      assignments: [
        assignment({ docente: 'Docente Titular', rol_en_materia: 'TITULAR_Y_VOCAL_AFIN' }),
        assignment({ docente: 'Vocal Uno', rol_en_materia: 'VOCAL_AFIN' }),
        assignment({ docente: 'Vocal Dos', rol_en_materia: 'VOCAL_AFIN' }),
      ],
      teacherNameToId: {
        'docente titular': 'doc-titular',
        'vocal uno': 'doc-vocal-1',
        'vocal dos': 'doc-vocal-2',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_ACTIVO,
      titularId: 'doc-titular',
      matchedAssignmentsCount: 3,
    })
  })

  it('no infiere un vocal afin como titular cuando falta una titularidad', () => {
    const result = resolve({
      plan: plan(),
      assignments: [assignment({ docente: 'Vocal Uno', rol_en_materia: 'VOCAL_AFIN' })],
      teacherNameToId: { 'vocal uno': 'doc-vocal-1' },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_TITULAR_VIGENTE,
      titularId: '',
    })
  })

  it('selecciona reemplazo activo cuando el titular esta con licencia', () => {
    const result = resolve({
      plan: plan(),
      assignments: [
        assignment({
          docente: 'Docente Licencia',
          estado_asignacion: 'LICENCIA',
        }),
        assignment({
          docente: 'Docente Reemplazo',
          rol_en_materia: 'REEMPLAZO',
          estado_asignacion: 'ACTIVO',
        }),
      ],
      teacherNameToId: {
        'docente licencia': 'doc-licencia',
        'docente reemplazo': 'doc-reemplazo',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.REEMPLAZO_ACTIVO,
      titularId: 'doc-reemplazo',
      match: 'reemplazo_activo',
    })
  })

  it('infiere titular cuando hay un solo docente activo sin rol explicito', () => {
    const result = resolve({
      plan: plan(),
      assignments: [
        assignment({
          docente: 'Docente Unico',
          rol_en_materia: '',
        }),
      ],
      teacherNameToId: {
        'docente unico': 'doc-unico',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_INFERIDO,
      titularId: 'doc-unico',
      source: 'inferido_unico_docente',
    })
  })

  it('no infiere titular desde una fila marcada como generada por horarios', () => {
    const result = resolve({
      plan: plan({ materia_codigo: 'ING32', materia_nombre: 'Educacion Sexual Integral' }),
      assignments: [
        assignment({
          materia_codigo: 'ING32',
          materia_nombre: 'Educacion Sexual Integral',
          docente: 'Barrionuevo Myriam',
          rol_en_materia: 'TITULAR',
          observaciones: 'Titular inferido por unico docente en horarios.',
        }),
      ],
      teacherNameToId: {
        'barrionuevo myriam': 'doc-barrionuevo',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_TITULAR_VIGENTE,
      titularId: '',
      source: 'requiere_revision',
      matchedAssignmentsCount: 1,
    })
  })

  it('marca materia no practica con dos docentes sin rol como ambigua', () => {
    const result = resolve({
      plan: plan({ materia_codigo: 'ING2', materia_nombre: 'Lengua Inglesa II' }),
      assignments: [
        assignment({ materia_codigo: 'ING2', materia_nombre: 'Lengua Inglesa II', docente: 'Docente A', rol_en_materia: '' }),
        assignment({ materia_codigo: 'ING2', materia_nombre: 'Lengua Inglesa II', docente: 'Docente B', rol_en_materia: '' }),
      ],
      teacherNameToId: {
        'docente a': 'doc-a',
        'docente b': 'doc-b',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.AMBIGUO_REQUIERE_REVISION,
      titularId: '',
      source: 'requiere_revision',
    })
  })

  it('permite practica profesional multidocente cuando existe titular explicito', () => {
    const practicePlan = plan({
      materia_codigo: 'PRA1',
      materia_nombre: 'Practica Profesional I',
    })
    const result = resolve({
      plan: practicePlan,
      assignments: [
        assignment({ materia_codigo: 'PRA1', materia_nombre: 'Practica Profesional I', docente: 'Docente Titular' }),
        assignment({
          materia_codigo: 'PRA1',
          materia_nombre: 'Practica Profesional I',
          docente: 'Docente Co',
          rol_en_materia: 'CO_DOCENTE',
        }),
      ],
      teacherNameToId: {
        'docente titular': 'doc-titular',
        'docente co': 'doc-co',
      },
    })

    expect(isProfessionalPracticeSubject(practicePlan)).toBe(true)
    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_ACTIVO,
      titularId: 'doc-titular',
    })
  })

  it('infiere titular en practica profesional multidocente aunque no haya rol explicito', () => {
    const practicePlan = plan({
      materia_codigo: 'PRA1',
      materia_nombre: 'Practica Profesional I',
    })
    const result = resolve({
      plan: practicePlan,
      assignments: [
        assignment({ materia_codigo: 'PRA1', materia_nombre: 'Practica Profesional I', docente: 'Docente A', rol_en_materia: '' }),
        assignment({ materia_codigo: 'PRA1', materia_nombre: 'Practica Profesional I', docente: 'Docente B', rol_en_materia: '' }),
      ],
      teacherNameToId: {
        'docente a': 'doc-a',
        'docente b': 'doc-b',
      },
    })

    expect(isProfessionalPracticeSubject(practicePlan)).toBe(true)
    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_INFERIDO,
      titularId: 'doc-a',
      source: 'inferido_practica_profesional_cotitular',
      match: 'practica_profesional_multidocente',
    })
  })

  it('no trata practicas discursivas iii/iv como practica profesional multidocente', () => {
    const discursivePlan = plan({
      materia_codigo: 'DIS3',
      materia_nombre: 'Practicas Discursivas en Ingles III',
    })
    const result = resolve({
      plan: discursivePlan,
      assignments: [
        assignment({ materia_codigo: 'DIS3', materia_nombre: 'Practicas Discursivas en Ingles III', docente: 'Docente A', rol_en_materia: '' }),
        assignment({ materia_codigo: 'DIS3', materia_nombre: 'Practicas Discursivas en Ingles III', docente: 'Docente B', rol_en_materia: '' }),
      ],
      teacherNameToId: {
        'docente a': 'doc-a',
        'docente b': 'doc-b',
      },
    })

    expect(isProfessionalPracticeSubject(discursivePlan)).toBe(false)
    expect(result.status).toBe(DOCENTE_MATERIA_RESOLUTION_STATUS.AMBIGUO_REQUIERE_REVISION)
  })

  it('devuelve sin titular vigente si no hay titular ni reemplazo activo vigente', () => {
    const result = resolve({
      plan: plan(),
      assignments: [
        assignment({
          docente: 'Docente Licencia',
          estado_asignacion: 'LICENCIA',
        }),
      ],
      teacherNameToId: {
        'docente licencia': 'doc-licencia',
      },
    })

    expect(result).toMatchObject({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_TITULAR_VIGENTE,
      titularId: '',
    })
  })
})
