import { EXAM_GENERATION_TYPES } from '../constants.js'
import { TEACHER_ASSIGNMENT_RULE_MODES } from '../rules/calculateTeacherAssignmentLimit.js'

// Input normalization keeps the future engine defensive at its boundary.

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function normalizeGenerationScope(scope = {}) {
  const safeScope = scope && typeof scope === 'object' ? scope : {}
  const requestedRuleMode = String(safeScope.halfPlusOneRuleMode ?? '').trim().toUpperCase()
  const halfPlusOneRuleMode = Object.values(TEACHER_ASSIGNMENT_RULE_MODES).includes(requestedRuleMode)
    ? requestedRuleMode
    : TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE

  return {
    careers: Array.isArray(safeScope.careers) ? safeScope.careers : [],
    year: typeof safeScope.year === 'string' ? safeScope.year : '',
    applyHalfPlusOneRule: safeScope.applyHalfPlusOneRule !== false,
    halfPlusOneRuleMode,
    allowSameDayRelatedSubjects: safeScope.allowSameDayRelatedSubjects ?? true,
    respectCorrelativities: safeScope.respectCorrelativities !== false,
  }
}

export function normalizeEngineInput(input = {}) {
  const safeInput = input && typeof input === 'object' ? input : {}
  const examType = safeInput.examType === EXAM_GENERATION_TYPES.SPECIAL
    ? EXAM_GENERATION_TYPES.SPECIAL
    : EXAM_GENERATION_TYPES.REGULAR

  return {
    alumnos: asArray(safeInput.alumnos),
    correlatividades: asArray(safeInput.correlatividades),
    docentes: asArray(safeInput.docentes),
    examType,
    fechaFin: String(safeInput.fechaFin ?? '').trim(),
    fechaInicio: String(safeInput.fechaInicio ?? '').trim(),
    generationScope: normalizeGenerationScope(safeInput.generationScope),
    horariosDocentes: asArray(safeInput.horariosDocentes),
    planesEstudio: asArray(safeInput.planesEstudio),
    regularCallRanges: safeInput.regularCallRanges ?? null,
    selectedSpecialSubjectKeys: asArray(safeInput.selectedSpecialSubjectKeys),
  }
}
