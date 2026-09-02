import { buildAdminReviewApprovalEligibility } from '../adminReviewApprovalEligibility.js'
import { buildAdminReviewFinalReadiness } from '../adminReviewFinalReadiness.js'
import { buildAdminReviewOfficializationPlan, fingerprintAdminReviewSchedule } from '../adminReviewOfficializationPlan.js'
import {
  sha256Hex,
  stableSerializeAdminReviewValue,
  verifyAdminReviewPromotionEvents,
} from '../adminReviewPromotionWorkflow.js'
import {
  buildExperimentalReviewedSchedule,
} from '../adminReviewApplyWorkflow.js'
import {
  buildTitularOnlyPreSchedule,
  recommendTribunalTeachers,
  validatePreScheduleHardRules,
} from '../adminReviewWorkflow.js'
import { doTimeRangesOverlap } from '../rules/timeRanges.js'
import { validateNoInvertedCorrelativities } from '../rules/correlativities.js'
import { buildTeacherExamSourceContext } from '../teacherExamSourceContext.js'
import {
  isTeacherBlockedOnDate,
  normalizeTeacherExamIdentity,
  TEACHER_BLOCK_SCOPE,
} from '../teacherBlockedDates.js'

export const EXAM_ENGINE_SHADOW_AUDIT_MODE = 'READ_ONLY_SHADOW_AUDIT'
export const EXPECTED_SUBJECT_UNIVERSE_SOURCE_MISSING = 'EXPECTED_SUBJECT_UNIVERSE_SOURCE_MISSING'

const HARD_RULE_ALIASES = Object.freeze({
  CORRELATIVITY_INVERTED: 'CORRELATIVE_ORDER_CONFLICT',
  DUPLICATED_TEACHER_IN_TRIBUNAL: 'TEACHER_DUPLICATED_IN_TRIBUNAL',
  TEACHER_NOT_AVAILABLE_ON_DATE: 'TEACHER_UNAVAILABLE',
  TEACHER_NOT_AVAILABLE_ON_SHIFT: 'TEACHER_UNAVAILABLE',
  TITULAR_NOT_AVAILABLE: 'TEACHER_UNAVAILABLE',
  TITULAR_REQUIRED: 'NO_TITULAR',
  TRIBUNAL_INCOMPLETE: 'INCOMPLETE_TRIBUNAL',
})

const DEMAND_COLLECTIONS = Object.freeze([
  ['mesasSolicitadas', 'requested_exam_tables'],
  ['requestedExamTables', 'requested_exam_tables'],
  ['examTableRequests', 'exam_table_requests'],
  ['solicitudesMesa', 'requested_exam_tables'],
  ['mesasExamenSolicitadas', 'requested_exam_tables'],
])

const STUDENT_SUBJECT_FIELDS = Object.freeze([
  'materiasHabilitadas',
  'materiasPendientes',
  'materiasAdeudadas',
  'examSubjects',
  'pendingSubjects',
  'subjects',
  'materias',
])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function normalizeToken(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '')
}

function resolveAuditCareerFilter(snapshot = {}, requestedCareer = '') {
  const requested = clean(requestedCareer)
  if (!requested) return ''
  const aliasLookup = snapshot?._auditExport?.careerAliasLookup
  if (!aliasLookup || typeof aliasLookup !== 'object' || Array.isArray(aliasLookup)) return requested
  return clean(aliasLookup[sha256Hex(normalizeToken(requested))]) || requested
}

function isFalseLike(value) {
  return [
    false,
    0,
    '0',
    'false',
    'no',
    'inactivo',
    'inactive',
    'archived',
    'cancelled',
    'canceled',
    'dropped',
    'rejected',
    'baja',
  ]
    .includes(typeof value === 'string' ? value.trim().toLowerCase() : value)
}

function isActiveRecord(row = {}) {
  const status = row.status ?? row.estado ?? row.state
  return status === undefined || status === null || status === '' || !isFalseLike(status)
}

function readCareer(row = {}, fallback = '') {
  if (typeof row === 'string') return clean(fallback)
  const career = row.carrera ?? row.career ?? row.programName ?? row.program_name
  if (career && typeof career === 'object') return clean(career.nombre ?? career.name)
  return clean(career ?? fallback)
}

function readSubjectCode(row = {}) {
  if (typeof row === 'string') return clean(row)
  return clean(
    row.materia ?? row.codigo ?? row.subjectCode ?? row.subject_code
    ?? row.materiaCodigo ?? row.materia_codigo ?? row.code,
  )
}

function readSubjectName(row = {}) {
  if (typeof row === 'string') return clean(row)
  const subject = row.subject ?? row.materiaDetalle
  return clean(
    row.nombreMateria ?? row.materiaNombre ?? row.materia_nombre
    ?? row.subjectName ?? row.subject_name ?? row.nombre ?? row.name
    ?? subject?.nombre ?? subject?.name,
  )
}

function readPlan(row = {}) {
  return clean(row.plan ?? row.planId ?? row.plan_id)
}

function readYear(row = {}) {
  return clean(row.anio ?? row.ano ?? row.year ?? row.curso ?? row.nivel)
}

function readCallNumber(row = {}) {
  const value = row.callNumber ?? row.call_number ?? row.llamado ?? row.numeroLlamado
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function subjectKey(row = {}) {
  const career = normalizeToken(readCareer(row))
  const subject = normalizeToken(readSubjectCode(row) || readSubjectName(row))
  return career && subject ? `${career}::${subject}` : ''
}

function subjectIdentity(row = {}, fallback = {}) {
  const carrera = readCareer(row, fallback.carrera)
  const materia = readSubjectCode(row) || clean(fallback.materia)
  const materiaNombre = readSubjectName(row) || clean(fallback.materiaNombre) || materia
  const normalized = {
    carrera,
    materia,
    materiaNombre,
    plan: readPlan(row) || clean(fallback.plan),
    anio: readYear(row) || clean(fallback.anio),
    callNumber: readCallNumber(row) ?? fallback.callNumber ?? null,
  }
  return {
    ...normalized,
    key: subjectKey(normalized),
  }
}

function planRows(snapshot = {}) {
  const candidates = [snapshot.planesEstudio, snapshot.materias, snapshot.subjects]
  return candidates.find((rows) => Array.isArray(rows) && rows.length) ?? []
}

function requiresExamTable(row = {}) {
  const value = row.requiereMesa ?? row.requiresExamTable ?? row.requires_exam_table ?? row.habilitado
  return value === undefined || value === null || value === '' || !isFalseLike(value)
}

function inCareerScope(row = {}, career = '') {
  return !clean(career) || normalizeToken(readCareer(row)) === normalizeToken(career)
}

function inCallScope(row = {}, callNumber = 1) {
  const rowCall = readCallNumber(row)
  return rowCall === null || rowCall === Number(callNumber)
}

function buildPlanIndexes(rows = []) {
  const byKey = new Map()
  const bySubject = new Map()
  asArray(rows).forEach((row) => {
    const identity = subjectIdentity(row)
    if (!identity.key) return
    byKey.set(identity.key, identity)
    const code = normalizeToken(identity.materia || identity.materiaNombre)
    const matches = bySubject.get(code) ?? []
    matches.push(identity)
    bySubject.set(code, matches)
  })
  return { byKey, bySubject }
}

function enrichFromPlan(identity = {}, indexes = {}) {
  if (identity.key && indexes.byKey.has(identity.key)) {
    return subjectIdentity(identity, indexes.byKey.get(identity.key))
  }
  const token = normalizeToken(identity.materia || identity.materiaNombre)
  const matches = indexes.bySubject.get(token) ?? []
  if (matches.length === 1) return subjectIdentity(identity, matches[0])
  return identity
}

function buildExamTableLookup(snapshot = {}, planIndexes = {}) {
  const rows = [
    ...asArray(snapshot.examTables),
    ...asArray(snapshot.exam_tables),
    ...asArray(snapshot.mesasExamen),
    ...asArray(snapshot.cronograma),
  ]
  return rows.reduce((map, row) => {
    const id = clean(row.id ?? row.exam_table_id ?? row.examTableId ?? row.exam_session_id)
    const identity = enrichFromPlan(subjectIdentity(row), planIndexes)
    if (id && identity.key) map.set(id, identity)
    return map
  }, new Map())
}

function addUniverseSubject(target, identity, source) {
  if (!identity?.key) return false
  const current = target.get(identity.key) ?? { ...identity, sources: [] }
  target.set(identity.key, {
    ...current,
    ...identity,
    sources: [...new Set([...asArray(current.sources), source].filter(Boolean))],
  })
  return true
}

function buildExpectedSubjectUniverse(snapshot = {}, { career = '', callNumber = 1 } = {}) {
  const warnings = []
  const plans = planRows(snapshot).filter((row) => requiresExamTable(row) && inCareerScope(row, career))
  const planIndexes = buildPlanIndexes(plans)
  const examTableLookup = buildExamTableLookup(snapshot, planIndexes)
  const demand = new Map()
  const sources = new Set()
  let unresolvedDemandRows = 0

  DEMAND_COLLECTIONS.forEach(([field, source]) => {
    asArray(snapshot[field]).forEach((row) => {
      if (!isActiveRecord(row) || !inCallScope(row, callNumber)) return
      const identity = enrichFromPlan(subjectIdentity(row), planIndexes)
      if (!inCareerScope(identity, career) || !addUniverseSubject(demand, identity, source)) {
        unresolvedDemandRows += 1
        return
      }
      sources.add(source)
    })
  })

  asArray(snapshot.examEnrollments).forEach((row) => {
    if (!isActiveRecord(row) || !inCallScope(row, callNumber)) return
    const tableId = clean(row.exam_table_id ?? row.examTableId ?? row.exam_session_id ?? row.examSessionId)
    const direct = enrichFromPlan(subjectIdentity(row), planIndexes)
    const identity = direct.key ? direct : examTableLookup.get(tableId)
    if (!identity || !inCareerScope(identity, career) || !addUniverseSubject(demand, identity, 'examEnrollments')) {
      unresolvedDemandRows += 1
      return
    }
    sources.add('examEnrollments')
  })

  const students = [...asArray(snapshot.alumnos), ...asArray(snapshot.students)]
  students.forEach((student) => {
    if (!isActiveRecord(student) || student.habilitadoExamen === false || student.examEligible === false) return
    const studentCareer = readCareer(student)
    if (clean(career) && normalizeToken(studentCareer) !== normalizeToken(career)) return
    STUDENT_SUBJECT_FIELDS.forEach((field) => {
      asArray(student[field]).forEach((subject) => {
        const identity = enrichFromPlan(subjectIdentity(subject, { carrera: studentCareer }), planIndexes)
        if (!inCallScope(subject, callNumber)) return
        if (!addUniverseSubject(demand, identity, 'eligible_students')) {
          unresolvedDemandRows += 1
          return
        }
        sources.add('eligible_students')
      })
    })
  })

  const expected = demand.size ? demand : new Map()
  if (!demand.size && plans.length) {
    plans.forEach((row) => addUniverseSubject(expected, subjectIdentity(row), 'planesEstudio_fallback'))
    sources.add('planesEstudio_fallback')
    warnings.push('EXPECTED_UNIVERSE_USING_PLAN_FALLBACK')
  }

  if (!expected.size) warnings.push(EXPECTED_SUBJECT_UNIVERSE_SOURCE_MISSING)
  if (unresolvedDemandRows) warnings.push(`UNRESOLVED_EXPECTED_SUBJECT_ROWS:${unresolvedDemandRows}`)

  return {
    source: expected.size ? [...sources].sort().join('+') : 'missing',
    sources: [...sources].sort(),
    subjects: [...expected.values()].sort((left, right) => left.key.localeCompare(right.key)),
    warnings,
    diagnostics: {
      planRows: plans.length,
      demandSubjects: demand.size,
      expectedSubjects: expected.size,
      unresolvedDemandRows,
    },
  }
}

function readGenerationConfig(snapshot = {}) {
  const config = snapshot.examGenerationConfig ?? {}
  return {
    regularCallRanges: config.regularCallRanges ?? snapshot.regularCallRanges ?? {},
    generationScope: config.generationScope ?? snapshot.generationScope ?? {},
  }
}

function resolveAuditDateRange(snapshot = {}, callNumber = 1) {
  const { regularCallRanges } = readGenerationConfig(snapshot)
  const callKey = Number(callNumber) === 2 ? 'second' : 'first'
  const range = regularCallRanges?.[callKey] ?? {}
  return {
    callNumber: Number(callNumber) === 2 ? 2 : 1,
    start: clean(range.start ?? range.fechaInicio) || clean(snapshot.fechaInicio),
    end: clean(range.end ?? range.fechaFin) || clean(snapshot.fechaFin),
    source: clean(range.start ?? range.fechaInicio) && clean(range.end ?? range.fechaFin)
      ? `regularCallRanges.${callKey}`
      : 'snapshot.fechaInicio/fechaFin',
  }
}

function mesaSubject(mesa = {}) {
  return subjectIdentity(mesa)
}

function mapByKey(rows = []) {
  return asArray(rows).reduce((map, row) => {
    const identity = row.key ? row : subjectIdentity(row)
    if (identity.key) map.set(identity.key, identity)
    return map
  }, new Map())
}

function assignmentKey(assignment = {}) {
  return subjectKey({
    carrera: assignment.carrera,
    materia: assignment.materia ?? assignment.materiaCodigo,
    materiaNombre: assignment.materiaNombre,
  })
}

function safeSubjectRow(subject = {}) {
  return {
    key: subject.key,
    carrera: subject.carrera,
    materia: subject.materia || subject.materiaNombre,
    materiaNombre: subject.materiaNombre || subject.materia,
    plan: subject.plan,
    anio: subject.anio,
  }
}

function buildSubjectAliases(subjects = []) {
  return new Map(
    [...new Set(asArray(subjects).map((subject) => subject.key).filter(Boolean))]
      .sort()
      .map((key, index) => [key, `MATERIA_${String(index + 1).padStart(3, '0')}`]),
  )
}

function buildCareerAliases(subjects = []) {
  return new Map(
    [...new Set(asArray(subjects).map((subject) => clean(subject.carrera)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
      .map((career, index) => [normalizeToken(career), `CARRERA_${String(index + 1).padStart(3, '0')}`]),
  )
}

function anonymizeSubjectRows(rows = [], subjectAliases, careerAliases) {
  return asArray(rows).map((row) => ({
    ...row,
    key: subjectAliases.get(row.key) ?? 'MATERIA_SIN_IDENTIDAD',
    carrera: careerAliases.get(normalizeToken(row.carrera)) ?? 'CARRERA_SIN_IDENTIDAD',
    materia: subjectAliases.get(row.key) ?? 'MATERIA_SIN_IDENTIDAD',
    materiaNombre: subjectAliases.get(row.key) ?? 'MATERIA_SIN_IDENTIDAD',
    plan: row.plan ? 'PLAN_IDENTIFICADO' : '',
  }))
}

function baseViolationCode(value) {
  const base = clean(value).split(':')[0]
  return HARD_RULE_ALIASES[base] ?? base
}

function countViolations(values = []) {
  return asArray(values).reduce((counts, value) => {
    const code = baseViolationCode(value)
    if (code) counts[code] = Number(counts[code] ?? 0) + 1
    return counts
  }, {})
}

function tribunalTeachers(mesa = {}) {
  return [
    {
      teacherId: clean(mesa.titularId ?? mesa.profesorTitularId),
      teacherName: clean(mesa.titular ?? mesa.profesorTitular),
      role: 'TITULAR',
    },
    ...asArray(mesa.vocales).map((vocal) => ({
      teacherId: clean(vocal.docenteId),
      teacherName: clean(vocal.docente),
      role: 'VOCAL',
    })),
  ].filter((teacher) => teacher.teacherId || teacher.teacherName)
}

function buildScheduleConflictSubjects(schedule = []) {
  const slotsByTeacher = new Map()
  const conflicted = new Set()
  const duplicated = new Set()

  asArray(schedule).forEach((mesa) => {
    const identity = mesaSubject(mesa)
    const teachers = tribunalTeachers(mesa)
    const normalizedIds = teachers.map((teacher) => normalizeTeacherExamIdentity(teacher.teacherId || teacher.teacherName))
    if (new Set(normalizedIds).size !== normalizedIds.length) duplicated.add(identity.key)

    normalizedIds.filter(Boolean).forEach((teacherId) => {
      const slots = slotsByTeacher.get(teacherId) ?? []
      const overlaps = slots.filter((slot) => (
        clean(slot.date) === clean(mesa.fechaIso)
        && doTimeRangesOverlap(slot.startTime, slot.endTime, mesa.inicio, mesa.fin)
      ))
      if (overlaps.length) {
        conflicted.add(identity.key)
        overlaps.forEach((slot) => conflicted.add(slot.subjectKey))
      }
      slots.push({
        subjectKey: identity.key,
        date: mesa.fechaIso,
        startTime: mesa.inicio,
        endTime: mesa.fin,
      })
      slotsByTeacher.set(teacherId, slots)
    })
  })

  return { conflicted, duplicated }
}

function buildBlockedDateImpact({ context, schedule, decisions = [] }) {
  const activeRecords = Object.values(context.blockedDatesByTeacher ?? {}).flatMap(asArray)
  const titularSubjects = new Set()
  const vocalSubjects = new Set()
  let overlappingTimeRanges = 0
  let contiguousTimeRanges = 0

  asArray(schedule).forEach((mesa) => {
    const identity = mesaSubject(mesa)
    tribunalTeachers(mesa).forEach((teacher) => {
      const teacherId = normalizeTeacherExamIdentity(teacher.teacherId || teacher.teacherName)
      const blocked = isTeacherBlockedOnDate({
        blockedDatesByTeacher: context.blockedDatesByTeacher,
        teacherId,
        teacherName: teacher.teacherName,
        date: mesa.fechaIso,
        startTime: mesa.inicio,
        endTime: mesa.fin,
      })
      if (blocked.blocked) {
        if (teacher.role === 'TITULAR') titularSubjects.add(identity.key)
        else vocalSubjects.add(identity.key)
      }

      asArray(context.blockedDatesByTeacher?.[teacherId]).forEach((record) => {
        if (record.date !== clean(mesa.fechaIso) || record.scope !== TEACHER_BLOCK_SCOPE.TIME_RANGE) return
        if (doTimeRangesOverlap(record.startTime, record.endTime, mesa.inicio, mesa.fin)) {
          overlappingTimeRanges += 1
        } else if (record.endTime === clean(mesa.inicio) || clean(mesa.fin) === record.startTime) {
          contiguousTimeRanges += 1
        }
      })
    })
  })

  const scheduleById = new Map(asArray(schedule).map((mesa) => [clean(mesa.id), mesa]))
  asArray(decisions).forEach((decision) => {
    if (decision?.type !== 'TRIBUNAL_SELECTION') return
    if (!['SELECTED', 'BLOCKED_HARD_RULES'].includes(clean(decision.decision).toUpperCase())) return
    const metadata = decision.metadata ?? {}
    const mesa = scheduleById.get(clean(metadata.tableId))
    if (!mesa) return
    const teacherId = normalizeTeacherExamIdentity(metadata.teacherId || metadata.teacherName)
    const blocked = isTeacherBlockedOnDate({
      blockedDatesByTeacher: context.blockedDatesByTeacher,
      teacherId,
      teacherName: metadata.teacherName,
      date: metadata.date || mesa.fechaIso,
      startTime: metadata.startTime || mesa.inicio,
      endTime: metadata.endTime || mesa.fin,
    })
    if (!blocked.blocked) return
    vocalSubjects.add(mesaSubject(mesa).key)
  })

  return {
    active: activeRecords.length,
    fullDay: activeRecords.filter((record) => record.scope === TEACHER_BLOCK_SCOPE.FULL_DAY).length,
    timeRange: activeRecords.filter((record) => record.scope === TEACHER_BLOCK_SCOPE.TIME_RANGE).length,
    titularSubjects: [...titularSubjects],
    vocalSubjects: [...vocalSubjects],
    overlappingTimeRanges,
    contiguousTimeRanges,
  }
}

function recommendationSummary({ preSchedule, context }) {
  const rows = asArray(preSchedule).map((mesa) => {
    const recommendations = recommendTribunalTeachers({
      teacherExamSourceContext: context,
      mesa,
      selections: [],
    })
    return {
      subjectKey: mesaSubject(mesa).key,
      candidates: recommendations.length,
      eligible: recommendations.filter((candidate) => candidate.eligible).length,
      blockedByDate: recommendations.filter((candidate) => candidate.hardRuleViolations.includes('TEACHER_BLOCKED_DATE')).length,
      blockedByAvailability: recommendations.filter((candidate) => candidate.hardRuleViolations.some((code) => code.startsWith('TEACHER_NOT_AVAILABLE'))).length,
      blockedByAffectation: recommendations.filter((candidate) => candidate.hardRuleViolations.includes('TEACHER_AFFECTATION_LIMIT_EXCEEDED')).length,
      blockedByAffinity: recommendations.filter((candidate) => candidate.hardRuleViolations.includes('VOCAL_WITHOUT_MINIMUM_AFFINITY')).length,
    }
  })
  return {
    tablesEvaluated: rows.length,
    tablesWithoutEligibleVocals: rows.filter((row) => row.eligible === 0).length,
    rows,
  }
}

function buildAdministrativeFlow({ snapshot, context, reviewedSchedule }) {
  const drafts = asArray(snapshot.adminReviewDrafts)
  const decisions = asArray(snapshot.adminReviewDecisions)
  const promotions = verifyAdminReviewPromotionEvents({
    promotions: asArray(snapshot.adminReviewPromotions),
    drafts,
    teacherExamSourceContext: context,
    now: () => '',
  })
  const eligibility = buildAdminReviewApprovalEligibility({
    promotions,
    drafts,
    adminReviewDecisions: decisions,
    teacherExamSourceContext: context,
    options: { now: () => '' },
  })
  const readiness = buildAdminReviewFinalReadiness({
    promotions,
    approvalRequests: asArray(snapshot.adminReviewApprovalRequests),
    secondApprovals: asArray(snapshot.adminReviewSecondApprovals),
    drafts,
    adminReviewDecisions: decisions,
    teacherExamSourceContext: context,
    currentActor: null,
    options: { now: () => '' },
  })
  const plan = buildAdminReviewOfficializationPlan({
    finalReadiness: readiness,
    currentOfficialSchedule: asArray(snapshot.cronograma),
    currentActor: null,
    options: { now: () => '' },
  })
  const integrityCounts = promotions.reduce((counts, promotion) => {
    const status = clean(promotion.integrityStatus) || 'VERIFY_ERROR'
    counts[status] = Number(counts[status] ?? 0) + 1
    return counts
  }, {})

  return {
    decisions: decisions.length,
    drafts: drafts.length,
    promotions: promotions.length,
    promotionIntegrity: integrityCounts,
    eligiblePromotions: eligibility.eligiblePromotions.length,
    blockedPromotions: eligibility.blockedPromotions.length,
    supersededPromotions: eligibility.supersededPromotions.length,
    approvalRequests: asArray(snapshot.adminReviewApprovalRequests).length,
    secondApprovals: asArray(snapshot.adminReviewSecondApprovals).length,
    readiness: {
      ready: readiness.ready,
      blockedReasons: asArray(readiness.blockedReasons).map(baseViolationCode),
      hardRuleViolations: asArray(readiness.hardRuleViolations).map(baseViolationCode),
      finalCandidatePresent: Boolean(readiness.finalCandidate),
    },
    officializationPlan: {
      canPrepare: plan.canPrepareOfficialization,
      blockedReasons: asArray(plan.blockedReasons).map(baseViolationCode),
      requiredServerChecks: plan.officializationPlan?.requiredServerChecks ?? [],
      persistencePerformed: false,
    },
    reviewedScheduleStatus: reviewedSchedule.status,
  }
}

function tableRowsForSubjects(keys, allSubjects) {
  const byKey = mapByKey(allSubjects)
  return [...new Set(keys)].map((key) => safeSubjectRow(byKey.get(key) ?? { key, materia: key }))
}

function anonymizeAudit(audit) {
  const allRows = [
    ...audit.expectedUniverse.subjects,
    ...audit.generated.subjects,
    ...Object.values(audit.gaps).flatMap((value) => Array.isArray(value) ? value : []),
  ].filter((row) => row && typeof row === 'object' && row.key)
  const subjectAliases = buildSubjectAliases(allRows)
  const careerAliases = buildCareerAliases(allRows)
  const transform = (rows) => anonymizeSubjectRows(rows, subjectAliases, careerAliases)

  return {
    ...audit,
    scope: {
      ...audit.scope,
      career: audit.scope.career
        ? careerAliases.get(normalizeToken(audit.scope.career)) ?? 'CARRERA_001'
        : '',
    },
    expectedUniverse: { ...audit.expectedUniverse, subjects: transform(audit.expectedUniverse.subjects) },
    generated: { ...audit.generated, subjects: transform(audit.generated.subjects) },
    gaps: Object.fromEntries(Object.entries(audit.gaps).map(([key, value]) => [
      key,
      Array.isArray(value) ? transform(value) : value,
    ])),
    blockedDates: {
      ...audit.blockedDates,
      titularSubjects: transform(audit.blockedDates.titularSubjects),
      vocalSubjects: transform(audit.blockedDates.vocalSubjects),
    },
    recommendations: {
      ...audit.recommendations,
      rows: audit.recommendations.rows.map((row) => ({
        ...row,
        subjectKey: subjectAliases.get(row.subjectKey) ?? 'MATERIA_SIN_IDENTIDAD',
      })),
    },
    warnings: audit.warnings.map(baseViolationCode),
    anonymized: true,
  }
}

function summarizeDataset(snapshot = {}, context = {}) {
  return {
    careers: new Set(planRows(snapshot).map(readCareer).filter(Boolean)).size,
    planSubjects: planRows(snapshot).length,
    teachers: asArray(context.docentes).length,
    workloadRecords: asArray(snapshot.cargaHorariaDocente).length,
    availabilityRecords: asArray(snapshot.disponibilidadDocente).length,
    blockedDateRecords: asArray(snapshot.fechasBloqueadasDocente).length,
    students: asArray(snapshot.alumnos).length + asArray(snapshot.students).length,
    examEnrollments: asArray(snapshot.examEnrollments).length,
    existingDecisions: asArray(snapshot.adminReviewDecisions).length,
  }
}

export function buildExamEngineShadowAudit({
  snapshot,
  options = {},
} = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('SHADOW_AUDIT_SNAPSHOT_REQUIRED')
  }

  const original = clone(snapshot)
  const workingSnapshot = clone(snapshot)
  const snapshotFingerprintBefore = sha256Hex(stableSerializeAdminReviewValue(original))
  const officialFingerprintBefore = fingerprintAdminReviewSchedule(asArray(original.cronograma))
  const callNumber = Number(options.callNumber) === 2 ? 2 : 1
  const careerFilter = resolveAuditCareerFilter(workingSnapshot, options.career)
  const dateRange = resolveAuditDateRange(workingSnapshot, callNumber)
  const expectedUniverse = buildExpectedSubjectUniverse(workingSnapshot, {
    career: careerFilter,
    callNumber,
  })
  const context = buildTeacherExamSourceContext({
    disponibilidadDocente: workingSnapshot.disponibilidadDocente,
    cargaHorariaDocente: workingSnapshot.cargaHorariaDocente,
    fechasBloqueadasDocente: workingSnapshot.fechasBloqueadasDocente,
    horariosDocentes: workingSnapshot.horariosDocentes,
  })
  const preScheduleResult = buildTitularOnlyPreSchedule({
    teacherExamSourceContext: context,
    planesEstudio: planRows(workingSnapshot),
    fechaInicio: dateRange.start,
    fechaFin: dateRange.end,
  })
  const scopedPreSchedule = preScheduleResult.mesas.filter((mesa) => inCareerScope(mesa, careerFilter))
  const preScheduleValidation = validatePreScheduleHardRules({
    preSchedule: scopedPreSchedule,
    correlatividades: workingSnapshot.correlatividades,
  })
  const reviewedSchedule = buildExperimentalReviewedSchedule({
    preSchedule: scopedPreSchedule,
    adminReviewDecisions: workingSnapshot.adminReviewDecisions,
    teacherExamSourceContext: context,
    options: { correlatividades: workingSnapshot.correlatividades },
  })

  const expectedByKey = mapByKey(expectedUniverse.subjects)
  const generatedSubjects = [...mapByKey(scopedPreSchedule.map(mesaSubject)).values()]
  const generatedByKey = mapByKey(generatedSubjects)
  const titularKeys = new Set(Object.values(context.titularidadesPorMateria ?? {})
    .flatMap(asArray)
    .map(assignmentKey)
    .filter(Boolean))
  const missingTitularKeys = [...expectedByKey.keys()].filter((key) => !titularKeys.has(key))
  const missingAvailabilityKeys = [...expectedByKey.keys()].filter((key) => {
    const titularAssignments = asArray(context.titularidadesPorMateria?.[key])
    return titularAssignments.length > 0 && titularAssignments.every((assignment) => (
      asArray(context.disponibilidadPorDocente?.[assignment.docenteId]).length === 0
    ))
  })
  const correlation = validateNoInvertedCorrelativities({
    cronograma: reviewedSchedule.schedule,
    correlatividades: asArray(workingSnapshot.correlatividades),
  })
  const correlationKeys = correlation.errors.map((error) => subjectIdentity(error.row).key).filter(Boolean)
  const scheduleConflicts = buildScheduleConflictSubjects(reviewedSchedule.schedule)
  const recommendations = recommendationSummary({ preSchedule: scopedPreSchedule, context })
  const noEligibleKeys = recommendations.rows.filter((row) => row.eligible === 0).map((row) => row.subjectKey)
  const blockedImpactRaw = buildBlockedDateImpact({
    context,
    schedule: reviewedSchedule.schedule,
    decisions: workingSnapshot.adminReviewDecisions,
  })

  const allSubjectRows = [
    ...expectedUniverse.subjects,
    ...generatedSubjects,
    ...reviewedSchedule.schedule.map(mesaSubject),
  ]
  const gaps = {
    omitted: tableRowsForSubjects([...expectedByKey.keys()].filter((key) => !generatedByKey.has(key)), allSubjectRows),
    generatedUnexpected: tableRowsForSubjects([...generatedByKey.keys()].filter((key) => !expectedByKey.has(key)), allSubjectRows),
    withoutTitular: tableRowsForSubjects(missingTitularKeys, allSubjectRows),
    withoutAvailability: tableRowsForSubjects(missingAvailabilityKeys, allSubjectRows),
    titularBlocked: tableRowsForSubjects(blockedImpactRaw.titularSubjects, allSubjectRows),
    insufficientVocals: reviewedSchedule.schedule
      .filter((mesa) => asArray(mesa.vocales).length < 2)
      .map(mesaSubject)
      .map(safeSubjectRow),
    correlativityConflict: tableRowsForSubjects(correlationKeys, allSubjectRows),
    dateTimeConflict: tableRowsForSubjects([...scheduleConflicts.conflicted], allSubjectRows),
    duplicatedTeacher: tableRowsForSubjects([...scheduleConflicts.duplicated], allSubjectRows),
    noEligibleVocals: tableRowsForSubjects(noEligibleKeys, allSubjectRows),
  }

  const violationInputs = [
    ...preScheduleValidation.hardRuleViolations,
    ...reviewedSchedule.hardRuleViolations,
    ...correlation.errors.map((error) => error.code),
    ...gaps.withoutTitular.map(() => 'NO_TITULAR'),
    ...gaps.noEligibleVocals.map(() => 'NO_ELIGIBLE_VOCALS'),
    ...(expectedUniverse.subjects.length ? [] : [EXPECTED_SUBJECT_UNIVERSE_SOURCE_MISSING]),
  ]
  const hardRuleCounts = countViolations(violationInputs)
  const ensureViolationCount = (code, count) => {
    if (count > 0) hardRuleCounts[code] = Math.max(Number(hardRuleCounts[code] ?? 0), count)
  }
  ensureViolationCount('TITULAR_BLOCKED_DATE', gaps.titularBlocked.length)
  ensureViolationCount('VOCAL_BLOCKED_DATE', blockedImpactRaw.vocalSubjects.length)
  ensureViolationCount(
    'BLOCKED_DATE_CONFLICT',
    new Set([...blockedImpactRaw.titularSubjects, ...blockedImpactRaw.vocalSubjects]).size,
  )
  ensureViolationCount('INCOMPLETE_TRIBUNAL', gaps.insufficientVocals.length)
  ensureViolationCount('TEACHER_DUPLICATED_IN_TRIBUNAL', gaps.duplicatedTeacher.length)
  ensureViolationCount('TEACHER_UNAVAILABLE', gaps.withoutAvailability.length)
  ensureViolationCount('CORRELATIVE_ORDER_CONFLICT', gaps.correlativityConflict.length)
  ensureViolationCount('NO_ELIGIBLE_VOCALS', gaps.noEligibleVocals.length)
  const blockingConditions = [
    !context.hasStructuredTeacherSource && !context.hasLegacyTeacherScheduleSource,
    expectedUniverse.subjects.length === 0,
    gaps.omitted.length > 0,
    gaps.withoutTitular.length > 0,
    gaps.titularBlocked.length > 0,
    gaps.insufficientVocals.length > 0,
    gaps.correlativityConflict.length > 0,
    gaps.dateTimeConflict.length > 0,
    reviewedSchedule.hardRuleViolations.length > 0,
  ]
  const warnings = [
    ...expectedUniverse.warnings,
    ...asArray(context.warnings).map((warning) => warning.code ?? warning),
    ...asArray(preScheduleResult.warnings).map((warning) => warning.code ?? warning),
  ].map(clean).filter(Boolean)

  const snapshotFingerprintAfter = sha256Hex(stableSerializeAdminReviewValue(workingSnapshot))
  const officialFingerprintAfter = fingerprintAdminReviewSchedule(asArray(workingSnapshot.cronograma))
  const baseAudit = {
    schemaVersion: '1.0.0',
    mode: EXAM_ENGINE_SHADOW_AUDIT_MODE,
    generatedAt: typeof options.now === 'function' ? options.now() : new Date().toISOString(),
    anonymized: false,
    scope: {
      career: careerFilter,
      callNumber,
      dateRange,
      strict: options.strict === true,
    },
    dataset: summarizeDataset(workingSnapshot, context),
    teacherSource: {
      source: context.source,
      hasStructuredTeacherSource: context.hasStructuredTeacherSource,
      hasLegacyTeacherScheduleSource: context.hasLegacyTeacherScheduleSource,
      counts: context.diagnostics?.counts ?? {},
    },
    expectedUniverse: {
      source: expectedUniverse.source,
      sources: expectedUniverse.sources,
      subjects: expectedUniverse.subjects.map(safeSubjectRow),
      count: expectedUniverse.subjects.length,
      warnings: expectedUniverse.warnings,
      diagnostics: expectedUniverse.diagnostics,
    },
    generated: {
      subjects: generatedSubjects.map(safeSubjectRow),
      count: generatedSubjects.length,
      tables: scopedPreSchedule.length,
      reviewedTables: reviewedSchedule.schedule.length,
      reviewStatus: reviewedSchedule.status,
    },
    gaps,
    hardRules: {
      total: Object.values(hardRuleCounts).reduce((total, count) => total + count, 0),
      byCode: hardRuleCounts,
      codes: Object.keys(hardRuleCounts).sort(),
    },
    blockedDates: {
      active: blockedImpactRaw.active,
      fullDay: blockedImpactRaw.fullDay,
      timeRange: blockedImpactRaw.timeRange,
      titularSubjects: tableRowsForSubjects(blockedImpactRaw.titularSubjects, allSubjectRows),
      vocalSubjects: tableRowsForSubjects(blockedImpactRaw.vocalSubjects, allSubjectRows),
      overlappingTimeRanges: blockedImpactRaw.overlappingTimeRanges,
      contiguousTimeRanges: blockedImpactRaw.contiguousTimeRanges,
    },
    recommendations,
    administrativeFlow: buildAdministrativeFlow({
      snapshot: workingSnapshot,
      context,
      reviewedSchedule,
    }),
    warnings: [...new Set(warnings)],
    safety: {
      readOnly: true,
      noWriteMode: true,
      supabaseUsed: false,
      persistencePerformed: false,
      decisionsCreated: 0,
      draftsCreated: 0,
      promotionsCreated: 0,
      approvalRequestsCreated: 0,
      secondApprovalsCreated: 0,
      officializationPerformed: false,
      snapshotUnchanged: snapshotFingerprintBefore === snapshotFingerprintAfter,
      officialScheduleUnchanged: officialFingerprintBefore === officialFingerprintAfter,
      snapshotFingerprintBefore,
      snapshotFingerprintAfter,
      officialScheduleFingerprintBefore: officialFingerprintBefore,
      officialScheduleFingerprintAfter: officialFingerprintAfter,
    },
    conclusion: {
      status: blockingConditions.some(Boolean) ? 'BLOCKED' : warnings.length ? 'READY_WITH_WARNINGS' : 'READY',
      blockingConditions: blockingConditions.filter(Boolean).length,
      safeForOfficialUse: false,
      safeForShadowAudit: snapshotFingerprintBefore === snapshotFingerprintAfter
        && officialFingerprintBefore === officialFingerprintAfter,
    },
    diagnostics: {
      expectedSubjects: expectedUniverse.subjects.length,
      generatedSubjects: generatedSubjects.length,
      omittedSubjects: gaps.omitted.length,
      generatedUnexpectedSubjects: gaps.generatedUnexpected.length,
      incompleteTribunals: gaps.insufficientVocals.length,
      rawSnapshotIncluded: false,
      studentNamesIncluded: false,
      emailsIncluded: false,
      persistenceImportsUsed: false,
    },
  }

  return options.anonymize === true ? anonymizeAudit(baseAudit) : baseAudit
}

function markdownEscape(value) {
  return clean(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function renderSubjectTable(rows = []) {
  if (!asArray(rows).length) return 'Sin registros.'
  return [
    '| Carrera | Materia | Nombre | Anio |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| ${markdownEscape(row.carrera)} | ${markdownEscape(row.materia)} | ${markdownEscape(row.materiaNombre)} | ${markdownEscape(row.anio)} |`),
  ].join('\n')
}

function renderCounts(counts = {}) {
  const rows = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  if (!rows.length) return 'Sin violaciones.'
  return [
    '| Codigo | Cantidad |',
    '| --- | ---: |',
    ...rows.map(([code, count]) => `| ${markdownEscape(code)} | ${Number(count)} |`),
  ].join('\n')
}

export function renderExamEngineShadowAuditMarkdown(audit = {}) {
  return `# Shadow audit del motor de examenes

## 1. Resumen ejecutivo

- Estado: **${markdownEscape(audit.conclusion?.status)}**
- Modo: \`${markdownEscape(audit.mode)}\`
- Read-only verificado: ${audit.safety?.snapshotUnchanged && audit.safety?.officialScheduleUnchanged ? 'SI' : 'NO'}
- Uso oficial permitido: **NO**

## 2. Dataset analizado

- Carreras: ${Number(audit.dataset?.careers ?? 0)}
- Materias de plan: ${Number(audit.dataset?.planSubjects ?? 0)}
- Docentes: ${Number(audit.dataset?.teachers ?? 0)}
- Cargas horarias: ${Number(audit.dataset?.workloadRecords ?? 0)}
- Disponibilidades: ${Number(audit.dataset?.availabilityRecords ?? 0)}
- Bloqueos docentes: ${Number(audit.dataset?.blockedDateRecords ?? 0)}
- Alumnos: ${Number(audit.dataset?.students ?? 0)}
- Inscripciones a examen: ${Number(audit.dataset?.examEnrollments ?? 0)}

## 3. Alcance de la prueba

- Carrera: ${markdownEscape(audit.scope?.career) || 'Todas'}
- Llamado: ${Number(audit.scope?.callNumber ?? 1)}
- Rango: ${markdownEscape(audit.scope?.dateRange?.start)} a ${markdownEscape(audit.scope?.dateRange?.end)}
- Fuente docente: ${markdownEscape(audit.teacherSource?.source)}
- Anonimizado: ${audit.anonymized ? 'SI' : 'NO'}

## 4. Universo esperado de materias

Fuente: \`${markdownEscape(audit.expectedUniverse?.source)}\`. Total: ${Number(audit.expectedUniverse?.count ?? 0)}.

${renderSubjectTable(audit.expectedUniverse?.subjects)}

## 5. Mesas generadas

- Materias con mesa: ${Number(audit.generated?.count ?? 0)}
- Mesas precronograma: ${Number(audit.generated?.tables ?? 0)}
- Mesas revisadas: ${Number(audit.generated?.reviewedTables ?? 0)}
- Estado review: ${markdownEscape(audit.generated?.reviewStatus)}

${renderSubjectTable(audit.generated?.subjects)}

## 6. Brechas detectadas

### Materias omitidas

${renderSubjectTable(audit.gaps?.omitted)}

### Materias generadas sin estar esperadas

${renderSubjectTable(audit.gaps?.generatedUnexpected)}

### Materias sin titular

${renderSubjectTable(audit.gaps?.withoutTitular)}

### Materias sin disponibilidad

${renderSubjectTable(audit.gaps?.withoutAvailability)}

### Materias con vocales insuficientes

${renderSubjectTable(audit.gaps?.insufficientVocals)}

### Conflictos de correlatividad o fecha/franja

- Correlatividad: ${Number(audit.gaps?.correlativityConflict?.length ?? 0)}
- Fecha/franja: ${Number(audit.gaps?.dateTimeConflict?.length ?? 0)}
- Docente duplicado: ${Number(audit.gaps?.duplicatedTeacher?.length ?? 0)}

## 7. Reglas duras violadas

${renderCounts(audit.hardRules?.byCode)}

## 8. Impacto de fechas bloqueadas

- Bloqueos activos: ${Number(audit.blockedDates?.active ?? 0)}
- Full day: ${Number(audit.blockedDates?.fullDay ?? 0)}
- Por franja: ${Number(audit.blockedDates?.timeRange ?? 0)}
- Mesas con titular bloqueado: ${Number(audit.blockedDates?.titularSubjects?.length ?? 0)}
- Mesas con vocal bloqueado: ${Number(audit.blockedDates?.vocalSubjects?.length ?? 0)}
- Solapamientos de franja: ${Number(audit.blockedDates?.overlappingTimeRanges ?? 0)}
- Franjas contiguas permitidas: ${Number(audit.blockedDates?.contiguousTimeRanges ?? 0)}

## 9. Recomendaciones de vocales

- Mesas evaluadas: ${Number(audit.recommendations?.tablesEvaluated ?? 0)}
- Mesas sin vocal elegible: ${Number(audit.recommendations?.tablesWithoutEligibleVocals ?? 0)}

## 10. Estado del flujo administrativo experimental

- Decisiones existentes: ${Number(audit.administrativeFlow?.decisions ?? 0)}
- Borradores existentes: ${Number(audit.administrativeFlow?.drafts ?? 0)}
- Promociones existentes: ${Number(audit.administrativeFlow?.promotions ?? 0)}
- Promociones elegibles: ${Number(audit.administrativeFlow?.eligiblePromotions ?? 0)}
- Requests: ${Number(audit.administrativeFlow?.approvalRequests ?? 0)}
- Segundas aprobaciones: ${Number(audit.administrativeFlow?.secondApprovals ?? 0)}
- Readiness final: ${audit.administrativeFlow?.readiness?.ready ? 'READY' : 'BLOCKED'}
- Plan tecnico preparable: ${audit.administrativeFlow?.officializationPlan?.canPrepare ? 'SI' : 'NO'}
- Persistencia ejecutada: NO

## 11. Riesgos para prueba real

${asArray(audit.warnings).length ? asArray(audit.warnings).map((warning) => `- ${markdownEscape(warning)}`).join('\n') : '- Sin warnings adicionales.'}

## 12. Criterios de aceptacion

- Snapshot y cronograma oficial sin cambios.
- Universo esperado disponible y reconciliado.
- Cero materias omitidas.
- Cero reglas duras no explicadas.
- Cero uso de Supabase o servicios de persistencia.

## 13. Criterios de bloqueo

- Universo esperado ausente.
- Materias omitidas o sin titular.
- Titular o vocal bloqueado.
- Tribunal incompleto.
- Conflicto de docente, correlatividad o mitad mas uno.
- Cualquier cambio del snapshot o cronograma oficial.

## 14. Conclusion

Resultado: **${markdownEscape(audit.conclusion?.status)}**. Este reporte es una auditoria en sombra y no constituye un cronograma oficial.
`
}

export function buildSafeExamEngineShadowAuditJson(audit = {}) {
  return clone(audit)
}
