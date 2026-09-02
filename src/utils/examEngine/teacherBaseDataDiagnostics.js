import { buildTeacherExamSourceContext } from './teacherExamSourceContext.js'
import { summarizeStructuredTeacherSource } from './teacherStructuredSource.js'
import { getManualExamExclusion, isManualExamExcludedSubject } from './rules/manualExamExclusions.js'

const ACTIVE_STATUSES = new Set(['', 'ACTIVE', 'ACTIVO'])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeToken(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '')
}

function readCareer(row = {}) {
  const value = row.carrera ?? row.career_name ?? row.careerName ?? row.programa ?? row.program ?? row.career
  return clean(typeof value === 'object' ? value?.nombre ?? value?.name : value)
}

function readSubjectCode(row = {}) {
  return clean(
    row.materia_codigo ?? row.materiaCodigo ?? row.codigo_materia ?? row.codigoMateria
    ?? row.subject_code ?? row.subjectCode ?? row.materia ?? row.codigo ?? row.code,
  )
}

function readSubjectName(row = {}) {
  return clean(
    row.materia_nombre ?? row.materiaNombre ?? row.nombre_materia ?? row.nombreMateria
    ?? row.subject_name ?? row.subjectName ?? row.asignatura ?? row.nombre ?? row.name
    ?? readSubjectCode(row),
  )
}

function readYear(row = {}) {
  return clean(row.anio ?? row.ano ?? row.year ?? row.curso ?? row.nivel)
}

function readStatus(row = {}, fields = ['estado', 'status']) {
  const field = fields.find((candidate) => clean(row[candidate]))
  return clean(field ? row[field] : '').toUpperCase()
}

function isActive(row = {}, fields) {
  return ACTIVE_STATUSES.has(readStatus(row, fields))
}

function planFlagAllowsExamTable(row = {}) {
  const value = row.requiereMesa ?? row.requiresExamTable ?? row.requires_exam_table ?? row.habilitado
  if (value === false || value === 0) return false
  return !['false', 'no', '0', 'inactivo', 'inactive'].includes(clean(value).toLowerCase())
}

function requiresExamTable(row = {}) {
  return planFlagAllowsExamTable(row) && !isManualExamExcludedSubject(row)
}

function subjectAliases(row = {}) {
  return new Set([readSubjectCode(row), readSubjectName(row)].map(normalizeToken).filter(Boolean))
}

function assignmentsMatchPlan(assignment = {}, plan = {}) {
  const assignmentCareer = normalizeToken(readCareer(assignment))
  const planCareer = normalizeToken(readCareer(plan))
  const assignmentCode = normalizeToken(readSubjectCode(assignment))
  const planCode = normalizeToken(readSubjectCode(plan))

  if (assignmentCode && planCode && assignmentCode === planCode) return true
  if (assignmentCareer && planCareer && assignmentCareer !== planCareer) return false

  const assignmentAliases = subjectAliases(assignment)
  return [...subjectAliases(plan)].some((alias) => assignmentAliases.has(alias))
}

function teacherAliases(row = {}) {
  const names = [
    row.docenteId,
    row.docente_id,
    row.teacher_record_id,
    row.teacherRecordId,
    row.teacherId,
    row.teacher_id,
    row.id,
    row.record_id,
    row.dni_docente,
    row.dni,
    row.documento,
    row.docente,
    row.profesor,
    row.teacher_display_name,
    row.teacherDisplayName,
    row.full_name,
    row.nombre,
    [row.first_name, row.last_name].map(clean).filter(Boolean).join(' '),
  ]
  return new Set(names.map(normalizeToken).filter(Boolean))
}

function teacherRowsMatch(left = {}, right = {}) {
  const rightAliases = teacherAliases(right)
  return [...teacherAliases(left)].some((alias) => rightAliases.has(alias))
}

function uniqueTeachers(rows = []) {
  const unique = []
  asArray(rows).forEach((row) => {
    if (!unique.some((current) => teacherRowsMatch(current, row))) unique.push(row)
  })
  return unique
}

function assignmentKey(row = {}) {
  const career = normalizeToken(readCareer(row))
  const subject = normalizeToken(readSubjectCode(row) || readSubjectName(row))
  if (!career || !subject) return ''
  const teacher = [...teacherAliases(row)][0] ?? ''
  return [career, subject, teacher].join('::')
}

function uniqueAssignments(rows = []) {
  const unique = []
  const seen = new Set()
  asArray(rows).forEach((row) => {
    const key = assignmentKey(row)
    if (!key || seen.has(key)) return
    seen.add(key)
    unique.push(row)
  })
  return unique
}

function normalizeDocenteMateriaTitularRows(rows = []) {
  return asArray(rows)
    .filter((row) => isActive(row, ['estado_asignacion', 'estadoAsignacion', 'estado', 'status']))
    .map((row) => ({
      ...row,
      rol_en_materia: 'TITULAR',
      rol: 'TITULAR',
      titularidad: true,
      source: 'docenteMateria',
    }))
}

function safeSubject(plan = {}) {
  return {
    carrera: readCareer(plan),
    materia: readSubjectCode(plan),
    nombre: readSubjectName(plan),
    anio: readYear(plan),
  }
}

function subjectsWithoutAssignments(plans = [], assignments = []) {
  return plans
    .filter((plan) => !assignments.some((assignment) => assignmentsMatchPlan(assignment, plan)))
    .map(safeSubject)
    .sort((left, right) => (
      left.carrera.localeCompare(right.carrera, 'es', { sensitivity: 'base' })
      || left.anio.localeCompare(right.anio, 'es', { numeric: true })
      || left.nombre.localeCompare(right.nombre, 'es', { sensitivity: 'base' })
    ))
}

export function buildTeacherBaseDataDiagnostics({
  teachers = [],
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  docenteMateria = [],
  horariosDocentes = [],
  fechasBloqueadasDocente = [],
  planesEstudio = [],
  career = '',
} = {}) {
  const structured = summarizeStructuredTeacherSource({
    disponibilidadDocente,
    cargaHorariaDocente,
    horariosDocentes,
  })
  const effectiveContext = buildTeacherExamSourceContext({
    disponibilidadDocente,
    cargaHorariaDocente,
    horariosDocentes,
    teacherSource: structured,
  })
  const careerToken = normalizeToken(career)
  const selectedPlans = asArray(planesEstudio).filter((plan) => (
    !careerToken || normalizeToken(readCareer(plan)) === careerToken
  ))
  const manualExamSubjects = selectedPlans
    .filter((plan) => planFlagAllowsExamTable(plan) && isManualExamExcludedSubject(plan))
    .map((plan) => ({
      ...safeSubject(plan),
      reason: getManualExamExclusion(plan)?.reason ?? '',
      message: getManualExamExclusion(plan)?.message ?? '',
    }))
  const scopedPlans = selectedPlans.filter(requiresExamTable)
  const docenteMateriaTitularRows = normalizeDocenteMateriaTitularRows(docenteMateria)
  const effectiveTitularAssignments = uniqueAssignments([
    ...docenteMateriaTitularRows,
    ...Object.values(effectiveContext.titularidadesPorMateria ?? {}).flatMap(asArray),
  ])
  const effectiveAvailabilityRows = Object.values(effectiveContext.disponibilidadPorDocente ?? {}).flatMap(asArray)
  const validAvailability = structured.validAvailabilityRows
  const validWorkload = structured.validWorkloadRows
  const knownTeachers = uniqueTeachers([
    ...asArray(teachers),
    ...effectiveContext.docentes,
    ...validWorkload,
    ...docenteMateriaTitularRows,
  ])
  const teachersWithoutAvailability = knownTeachers.filter((teacher) => (
    !effectiveAvailabilityRows.some((availability) => teacherRowsMatch(teacher, availability))
  ))
  const workloadTeachers = uniqueTeachers(effectiveTitularAssignments)
  const workloadWithoutAvailability = workloadTeachers.filter((workload) => (
    !effectiveAvailabilityRows.some((availability) => teacherRowsMatch(workload, availability))
  ))
  const activeBlockedDates = asArray(fechasBloqueadasDocente).filter((row) => isActive(row, ['estado', 'status']))
  const missingEffectiveTitularSubjects = subjectsWithoutAssignments(scopedPlans, effectiveTitularAssignments)
  const missingStructuredTitularSubjects = subjectsWithoutAssignments(scopedPlans, structured.titularRows)

  return {
    status: structured.hasStructuredTeacherSource
      ? 'STRUCTURED_ACTIVE'
      : structured.hasLegacyTeacherScheduleSource
        ? 'LEGACY_ACTIVE'
        : 'MISSING_TEACHER_SOURCE',
    source: effectiveContext.source,
    hasStructuredTeacherSource: structured.hasStructuredTeacherSource,
    hasLegacyTeacherScheduleSource: structured.hasLegacyTeacherScheduleSource,
    career: clean(career),
    counts: {
      teachers: knownTeachers.length,
      plansInScope: scopedPlans.length,
      scheduleRecords: asArray(horariosDocentes).length,
      docenteMateriaRecords: asArray(docenteMateria).length,
      docenteMateriaTitularRecords: docenteMateriaTitularRows.length,
      effectiveTeachers: knownTeachers.length,
      effectiveAvailabilityRecords: effectiveAvailabilityRows.length,
      effectiveTitularRecords: effectiveTitularAssignments.length,
      workloadRecords: asArray(cargaHorariaDocente).length,
      validWorkloadRecords: validWorkload.length,
      availabilityRecords: asArray(disponibilidadDocente).length,
      validAvailabilityRecords: validAvailability.length,
      titularRecords: structured.titularRows.length,
      manualExamSubjects: manualExamSubjects.length,
      missingEffectiveTitularSubjects: missingEffectiveTitularSubjects.length,
      missingStructuredTitularSubjects: missingStructuredTitularSubjects.length,
      teachersWithoutAvailability: teachersWithoutAvailability.length,
      workloadWithoutAvailability: workloadWithoutAvailability.length,
      blockedDates: activeBlockedDates.length,
    },
    manualExamSubjects,
    missingEffectiveTitularSubjects,
    missingStructuredTitularSubjects,
    warnings: structured.warnings.map((warning) => ({
      code: warning.code,
      source: warning.source,
      count: Number(warning.count ?? 0),
      missing: asArray(warning.missing),
    })),
    diagnostics: {
      effectiveSource: effectiveContext.source,
      structuredSourceReady: structured.hasStructuredTeacherSource,
      legacyFallbackAvailable: structured.hasLegacyTeacherScheduleSource,
      careerScoped: Boolean(clean(career)),
    },
  }
}
