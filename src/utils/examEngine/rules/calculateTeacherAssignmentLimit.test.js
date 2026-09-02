import { describe, expect, it } from 'vitest'
import {
  calculateTeacherAssignmentLimit,
  inferTeachingHoursFromScheduleRow,
  summarizeTeacherScheduleTeachingHours,
  teacherCanBeAssignedOnDate,
  TEACHER_ASSIGNMENT_RULE_MODES,
  TEACHING_HOURS_SOURCES,
} from './calculateTeacherAssignmentLimit.js'

const DAYS_MODE = TEACHER_ASSIGNMENT_RULE_MODES.DAYS_BASED_HALF_PLUS_ONE
const HOURS_MODE = TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE

describe('calculateTeacherAssignmentLimit', () => {
  it('mantiene el calculo historico por dias', () => {
    expect(calculateTeacherAssignmentLimit({
      teacher: { diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] },
      ruleMode: DAYS_MODE,
    })).toMatchObject({
      limit: 3,
      ruleMode: DAYS_MODE,
      baseValue: 5,
    })
  })

  it.each([
    [2, 2],
    [4, 3],
    [6, 4],
    [10, 6],
    [1, 1],
    [3, 2],
    [5, 3],
    [7, 4],
  ])('con %i horas catedra calcula limite %i', (teachingHours, expectedLimit) => {
    expect(calculateTeacherAssignmentLimit({
      teachingHours,
      ruleMode: HOURS_MODE,
    }).limit).toBe(expectedLimit)
  })

  it('rechaza horas catedra negativas como dato invalido, no como cero', () => {
    expect(calculateTeacherAssignmentLimit({
      teachingHours: -3,
      ruleMode: HOURS_MODE,
    })).toMatchObject({
      limit: 0,
      valid: false,
      warningCode: 'MISSING_TEACHING_HOURS_SOURCE',
    })
  })

  it('documenta el default vigente: sin ruleMode explicito, cae al modo historico por dias', () => {
    // El README y docs/teacherAssignmentRulesV2.md marcan TEACHING_HOURS_HALF_PLUS_ONE
    // como la regla institucional vigente y piden no usar dias como fallback
    // silencioso. El default real de esta funcion sigue siendo DAYS_BASED_HALF_PLUS_ONE
    // porque el pipeline de produccion y la suite de tests actual dependen de ese
    // fallback implicito en muchos call sites (buildVocalCandidates, assignVocales,
    // validateTribunals, validateTeacherLoad, entre otros). Cambiar el default rompe
    // 63 tests existentes: requiere una decision institucional explicita y una
    // migracion coordinada de fixtures antes de tocarlo, no un fix aislado.
    expect(calculateTeacherAssignmentLimit({
      teacher: { diasAsistencia: ['lunes', 'martes', 'miercoles'] },
    })).toMatchObject({
      limit: 2,
      ruleMode: DAYS_MODE,
    })
  })

  it('horas faltantes no usan fallback silencioso', () => {
    expect(calculateTeacherAssignmentLimit({
      teacher: { diasAsistencia: ['lunes', 'martes'] },
      ruleMode: HOURS_MODE,
    })).toMatchObject({
      limit: 0,
      valid: false,
      usedFallback: false,
      warningCode: 'MISSING_TEACHING_HOURS_SOURCE',
    })
  })

  it('permite fallback por dias solo cuando se solicita explicitamente', () => {
    expect(calculateTeacherAssignmentLimit({
      teacher: { diasAsistencia: ['lunes', 'martes'] },
      ruleMode: HOURS_MODE,
      fallbackRuleMode: DAYS_MODE,
    })).toMatchObject({
      limit: 2,
      ruleMode: DAYS_MODE,
      requestedRuleMode: HOURS_MODE,
      usedFallback: true,
    })
  })

  it('maneja horas cero y valores no numericos', () => {
    expect(calculateTeacherAssignmentLimit({
      teachingHours: 0,
      ruleMode: HOURS_MODE,
    })).toMatchObject({
      limit: 0,
      warningCode: 'ZERO_TEACHING_HOURS',
    })
    expect(calculateTeacherAssignmentLimit({
      teachingHours: 'sin dato',
      ruleMode: HOURS_MODE,
    })).toMatchObject({
      limit: 0,
      warningCode: 'MISSING_TEACHING_HOURS_SOURCE',
    })
  })

  it('infiere modulos de 40 minutos tolerando recreos dentro del bloque', () => {
    expect(inferTeachingHoursFromScheduleRow({
      inicio: '19:40',
      fin: '21:10',
    })).toMatchObject({
      teachingHours: 2,
      source: TEACHING_HOURS_SOURCES.INFERRED_FROM_SCHEDULE,
      valid: true,
      durationMinutes: 90,
    })
  })

  it('deduplica el mismo bloque de materia, dia y horario', () => {
    const row = {
      carrera: 'Carrera A',
      materia: 'Materia A',
      dia: 'Lunes',
      inicio: '18:20',
      fin: '19:40',
    }
    const result = summarizeTeacherScheduleTeachingHours([row, { ...row }])

    expect(result).toMatchObject({
      teachingHours: 2,
      validBlocks: 1,
      duplicateBlocksIgnored: 1,
    })
  })

  it('mantiene asistencia diaria como condicion obligatoria', () => {
    expect(teacherCanBeAssignedOnDate({
      attendsInstitutionOnDate: false,
      underTeachingHoursBasedLimit: true,
    })).toBe(false)
    expect(teacherCanBeAssignedOnDate({
      attendsInstitutionOnDate: true,
      underTeachingHoursBasedLimit: true,
    })).toBe(true)
  })

  it('no muta el docente recibido', () => {
    const teacher = {
      horasCatedra: 6,
      diasAsistencia: ['lunes'],
    }
    const original = structuredClone(teacher)

    calculateTeacherAssignmentLimit({ teacher, ruleMode: HOURS_MODE })

    expect(teacher).toEqual(original)
  })
})
