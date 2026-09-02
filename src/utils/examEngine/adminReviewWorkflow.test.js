import { describe, expect, it } from 'vitest'
import { buildTeacherExamSourceContext } from './teacherExamSourceContext.js'
import {
  ADMIN_DECISIONS,
  GROUPING_TYPES,
  applyTeacherTribunalSelection,
  buildTeacherAffectationLedger,
  buildTitularOnlyPreSchedule,
  recommendTribunalTeachers,
  suggestExamTableGroupings,
  updateExamTableGroupingDecision,
  validateExamTableGroupingAgainstHardRules,
  validatePreScheduleHardRules,
  validateTribunalSelectionAgainstHardRules,
} from './adminReviewWorkflow.js'

function context(overrides = {}) {
  return buildTeacherExamSourceContext({
    disponibilidadDocente: [
      { docente: 'Ana Titular', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      { docente: 'Ana Titular', dia: 'Miercoles', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      { docente: 'Bruno Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      { docente: 'Carla Sin Turno', dia: 'Lunes', turno: 'TARDE', hora_desde: '14:00', hora_hasta: '16:00' },
      { docente: 'Diego Sin Afinidad', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      { docente: 'Elena Homologa', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      ...(overrides.disponibilidadDocente ?? []),
    ],
    cargaHorariaDocente: [
      { docente: 'Ana Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 8, rol_en_materia: 'TITULAR' },
      { docente: 'Ana Titular', carrera: 'Traductorado Ingles', materia_codigo: 'TRA1', materia_nombre: 'Ingles I', horasCatedra: 2, rol_en_materia: 'TITULAR' },
      { docente: 'Bruno Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING2', materia_nombre: 'Ingles II', horasCatedra: 4, rol_en_materia: 'TITULAR' },
      { docente: 'Carla Sin Turno', carrera: 'Profesorado Ingles', materia_codigo: 'ING3', materia_nombre: 'Ingles III', horasCatedra: 4, rol_en_materia: 'TITULAR' },
      { docente: 'Diego Sin Afinidad', carrera: 'Tecnicatura Turismo', materia_codigo: 'TUR1', materia_nombre: 'Turismo I', horasCatedra: 4, rol_en_materia: 'TITULAR' },
      { docente: 'Elena Homologa', carrera: 'Licenciatura Ingles', materia_codigo: 'LIC1', materia_nombre: 'Ingles I', horasCatedra: 4, rol_en_materia: 'TITULAR' },
      ...(overrides.cargaHorariaDocente ?? []),
    ],
    horariosDocentes: overrides.horariosDocentes ?? [],
    fechasBloqueadasDocente: overrides.fechasBloqueadasDocente ?? [],
  })
}

const planesEstudio = [
  { carrera: 'Profesorado Ingles', materia: 'ING1', nombreMateria: 'Ingles I', anio: 1 },
  { carrera: 'Traductorado Ingles', materia: 'TRA1', nombreMateria: 'Ingles I', anio: 1 },
  { carrera: 'Profesorado Ingles', materia: 'ING2', nombreMateria: 'Ingles II', anio: 2 },
]

describe('adminReviewWorkflow', () => {
  it('genera precronograma solo con titulares y no asigna vocales automaticamente', () => {
    const result = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: context(),
      planesEstudio,
      fechasDisponibles: ['2026-07-13', '2026-07-15'],
      turno: 'NOCHE',
    })

    expect(result.diagnostics).toMatchObject({
      titularesOnly: true,
      autoAssignedVocales: 0,
    })
    expect(result.mesas.find((mesa) => mesa.materia === 'ING1')).toMatchObject({
      carrera: 'Profesorado Ingles',
      materia: 'ING1',
      fechaIso: '2026-07-13',
      titular: 'Ana Titular',
      vocales: [],
      estado: 'TRIBUNAL_INCOMPLETO',
      tribunalStatus: 'PENDIENTE_VOCALES',
    })
  })

  it('sugiere agrupamientos por mismo titular y por mismo titular en distintas carreras sin aceptar automaticamente', () => {
    const pre = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: context(),
      planesEstudio,
      fechasDisponibles: ['2026-07-13'],
      turno: 'NOCHE',
    }).mesas
    const suggestions = suggestExamTableGroupings({ preSchedule: pre })
    const sameTitular = suggestions.find((suggestion) => (
      suggestion.type === GROUPING_TYPES.SAME_TITULAR &&
      suggestion.careers.includes('Profesorado Ingles') &&
      suggestion.careers.includes('Traductorado Ingles')
    ))

    expect(sameTitular).toMatchObject({
      type: 'SAME_TITULAR',
      titular: 'Ana Titular',
      adminDecision: 'PENDING',
      canAccept: true,
    })
    expect(sameTitular.accepted).toBeUndefined()
  })

  it('sugiere agrupamientos por materias correlativas, afines y homologas', () => {
    const pre = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: context(),
      planesEstudio,
      fechasDisponibles: ['2026-07-13'],
      turno: 'NOCHE',
    }).mesas
    const suggestions = suggestExamTableGroupings({
      preSchedule: pre,
      correlatividades: [
        { carrera: 'Profesorado Ingles', materia: 'ING2', correlativas: ['ING1'] },
      ],
    })

    expect(suggestions.map((suggestion) => suggestion.type)).toEqual(expect.arrayContaining([
      GROUPING_TYPES.SAME_TITULAR,
      GROUPING_TYPES.CORRELATIVE_CHAIN,
      GROUPING_TYPES.HOMOLOGOUS_SUBJECT,
    ]))
  })

  it('permite marcar agrupamiento aceptado o rechazado sin mutar reglas', () => {
    const [suggestion] = suggestExamTableGroupings({
      preSchedule: buildTitularOnlyPreSchedule({
        teacherExamSourceContext: context(),
        planesEstudio,
        fechasDisponibles: ['2026-07-13'],
      }).mesas,
    })

    expect(updateExamTableGroupingDecision(suggestion, ADMIN_DECISIONS.ACCEPTED)).toMatchObject({
      adminDecision: 'ACCEPTED',
      accepted: true,
    })
    expect(updateExamTableGroupingDecision(suggestion, ADMIN_DECISIONS.REJECTED)).toMatchObject({
      adminDecision: 'REJECTED',
      rejected: true,
    })
  })

  it('bloquea agrupamiento que viola reglas duras', () => {
    const validation = validateExamTableGroupingAgainstHardRules({
      grouping: {
        level: 'SAME_SLOT_SHARED_TRIBUNAL',
        mesas: [
          { id: 'a', titularId: 'teacher-a', fechaIso: '2026-07-13', inicio: '18:00', fin: '20:00' },
          { id: 'b', titularId: 'teacher-b', fechaIso: '2026-07-14', inicio: '18:00', fin: '20:00' },
        ],
      },
    })

    expect(validation).toMatchObject({
      valid: false,
      canAccept: false,
      hardRuleViolations: expect.arrayContaining(['GROUPING_REQUIRES_SAME_DATE_SLOT']),
    })
  })

  it('recomienda candidatos disponibles y explica descartes por fecha, turno, afinidad y cupo', () => {
    const teacherContext = context()
    const [mesa] = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: teacherContext,
      planesEstudio,
      fechasDisponibles: ['2026-07-13'],
      turno: 'NOCHE',
    }).mesas.filter((item) => item.materia === 'ING1')
    const recommendations = recommendTribunalTeachers({
      teacherExamSourceContext: teacherContext,
      mesa,
      selections: [
        { docenteId: 'teacher-brunovocal', role: 'VOCAL', mesaId: 'x1', fechaIso: '2026-07-10', inicio: '18:00', fin: '20:00' },
        { docenteId: 'teacher-brunovocal', role: 'VOCAL', mesaId: 'x2', fechaIso: '2026-07-11', inicio: '18:00', fin: '20:00' },
        { docenteId: 'teacher-brunovocal', role: 'VOCAL', mesaId: 'x3', fechaIso: '2026-07-12', inicio: '18:00', fin: '20:00' },
      ],
    })

    const bruno = recommendations.find((row) => row.docente.nombre === 'Bruno Vocal')
    const carla = recommendations.find((row) => row.docente.nombre === 'Carla Sin Turno')
    const diego = recommendations.find((row) => row.docente.nombre === 'Diego Sin Afinidad')

    expect(bruno).toMatchObject({
      disponibleEseDia: true,
      disponibleEnTurno: true,
      areaAfin: true,
      afectacionesUsadas: 3,
      afectacionesRestantes: 0,
      eligible: false,
      hardRuleViolations: expect.arrayContaining(['TEACHER_AFFECTATION_LIMIT_EXCEEDED']),
    })
    expect(carla.hardRuleViolations).toEqual(expect.arrayContaining(['TEACHER_NOT_AVAILABLE_ON_SHIFT']))
    expect(diego.hardRuleViolations).toEqual(expect.arrayContaining(['VOCAL_WITHOUT_MINIMUM_AFFINITY']))
    expect(diego.reasons.length).toBeGreaterThan(0)
  })

  it('descuenta afectacion al seleccionar vocal y recalcula cupos restantes', () => {
    const teacherContext = context()
    const [mesa] = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: teacherContext,
      planesEstudio,
      fechasDisponibles: ['2026-07-13'],
      turno: 'NOCHE',
    }).mesas.filter((item) => item.materia === 'ING1')
    const result = applyTeacherTribunalSelection({
      teacherExamSourceContext: teacherContext,
      mesa,
      docenteId: 'teacher-brunovocal',
      role: 'VOCAL',
      selections: [],
    })

    expect(result).toMatchObject({
      ok: true,
      ledger: {
        'teacher-brunovocal': {
          limiteAfectacion: 3,
          afectacionesUsadas: 1,
          afectacionesRestantes: 2,
        },
      },
    })
  })

  it('no descuenta cupo al titular obligatorio', () => {
    const ledger = buildTeacherAffectationLedger({
      teacherExamSourceContext: context(),
      selections: [
        { docenteId: 'teacher-anatitular', role: 'TITULAR', mesaId: 'm1', fechaIso: '2026-07-13' },
      ],
    })

    expect(ledger['teacher-anatitular']).toMatchObject({
      limiteAfectacion: 6,
      afectacionesUsadas: 0,
      afectacionesRestantes: 6,
    })
  })

  it('marca titular bloqueado y excluye vocal bloqueado por dia o franja', () => {
    const teacherContext = context({
      fechasBloqueadasDocente: [
        { docenteNombre: 'Ana Titular', date: '2026-07-13', scope: 'FULL_DAY', status: 'ACTIVE' },
        { docenteNombre: 'Bruno Vocal', date: '2026-07-13', scope: 'TIME_RANGE', startTime: '19:00', endTime: '21:00', status: 'ACTIVE' },
      ],
    })
    const mesa = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: teacherContext,
      planesEstudio,
      fechasDisponibles: ['2026-07-13'],
      turno: 'NOCHE',
    }).mesas.find((item) => item.materia === 'ING1')
    const bruno = recommendTribunalTeachers({ teacherExamSourceContext: teacherContext, mesa })
      .find((candidate) => candidate.docente.nombre === 'Bruno Vocal')

    expect(mesa.hardRuleViolations).toEqual(expect.arrayContaining(['TITULAR_BLOCKED_DATE', 'BLOCKED_DATE_CONFLICT']))
    expect(bruno.eligible).toBe(false)
    expect(bruno.hardRuleViolations).toEqual(expect.arrayContaining(['TEACHER_BLOCKED_DATE', 'VOCAL_BLOCKED_DATE']))
  })

  it('permite vocal cuando su bloqueo parcial termina al comenzar la mesa', () => {
    const teacherContext = context({
      fechasBloqueadasDocente: [{
        docenteNombre: 'Bruno Vocal',
        date: '2026-07-13',
        scope: 'TIME_RANGE',
        startTime: '16:00',
        endTime: '18:00',
      }],
    })
    const mesa = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: teacherContext,
      planesEstudio,
      fechasDisponibles: ['2026-07-13'],
      turno: 'NOCHE',
    }).mesas.find((item) => item.materia === 'ING1')
    const bruno = recommendTribunalTeachers({ teacherExamSourceContext: teacherContext, mesa })
      .find((candidate) => candidate.docente.nombre === 'Bruno Vocal')

    expect(bruno.hardRuleViolations).not.toContain('TEACHER_BLOCKED_DATE')
  })

  it('bloquea seleccion que viola reglas duras', () => {
    const teacherContext = context()
    const [mesa] = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: teacherContext,
      planesEstudio,
      fechasDisponibles: ['2026-07-13'],
      turno: 'NOCHE',
    }).mesas.filter((item) => item.materia === 'ING1')

    expect(validateTribunalSelectionAgainstHardRules({
      teacherExamSourceContext: teacherContext,
      mesa,
      docenteId: 'teacher-diegosinafinidad',
      role: 'VOCAL',
      selections: [],
    })).toMatchObject({
      valid: false,
      hardRuleViolations: expect.arrayContaining(['VOCAL_WITHOUT_MINIMUM_AFFINITY']),
    })
  })

  it('prioriza fuente estructurada sobre legacy y mantiene fallback legacy', () => {
    const structured = context({
      horariosDocentes: [{ profesor: 'Legacy', carrera: 'Profesorado Ingles', materia: 'ING1', dia: 'Martes', inicio: '18:00', fin: '20:00' }],
    })
    const legacy = buildTeacherExamSourceContext({
      disponibilidadDocente: [],
      cargaHorariaDocente: [],
      horariosDocentes: [{ profesor: 'Legacy', carrera: 'Profesorado Ingles', materia: 'ING1', dia: 'Lunes', inicio: '18:00', fin: '20:00' }],
    })

    expect(structured.source).toBe('structured')
    expect(structured.docentes.map((docente) => docente.nombre)).not.toContain('Legacy')
    expect(legacy.source).toBe('legacy')
    expect(legacy.docentes.map((docente) => docente.nombre)).toContain('Legacy')
  })

  it('no confirma tribunal incompleto como valido', () => {
    const pre = buildTitularOnlyPreSchedule({
      teacherExamSourceContext: context(),
      planesEstudio,
      fechasDisponibles: ['2026-07-13'],
      turno: 'NOCHE',
    }).mesas
    const validation = validatePreScheduleHardRules({ preSchedule: pre })

    expect(validation).toMatchObject({
      valid: false,
      confirmable: false,
      hardRuleViolations: expect.arrayContaining([expect.stringMatching(/^TRIBUNAL_INCOMPLETE:/)]),
    })
  })
})
