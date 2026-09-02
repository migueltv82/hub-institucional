import {
  ADMIN_REVIEW_DECISION_TYPES,
  getSelectedTribunalSelections,
} from './adminReviewDecisions.js'
import {
  ADMIN_DECISIONS,
  PRE_SCHEDULE_STATES,
  buildTeacherAffectationLedger,
  recommendTribunalTeachers,
  suggestExamTableGroupings,
  validateExamTableGroupingAgainstHardRules,
} from './adminReviewWorkflow.js'
import { isTeacherBlockedOnDate } from './teacherBlockedDates.js'

export const EXPERIMENTAL_REVIEW_STATUS = Object.freeze({
  REVIEW_READY: 'REVIEW_READY',
  REVIEW_HAS_WARNINGS: 'REVIEW_HAS_WARNINGS',
  REVIEW_BLOCKED_HARD_RULES: 'REVIEW_BLOCKED_HARD_RULES',
  REVIEW_INCOMPLETE: 'REVIEW_INCOMPLETE',
})

export const ADMIN_REVIEW_DRAFT_TYPE = 'ADMIN_REVIEWED_SCHEDULE_DRAFT'
export const ADMIN_REVIEW_DRAFT_SOURCE = 'admin_review_workflow'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeRole(value) {
  return clean(value).toUpperCase() || 'VOCAL'
}

function cloneMesa(mesa = {}) {
  return {
    ...mesa,
    vocales: asArray(mesa.vocales).map((vocal) => ({ ...vocal })),
    adminReview: {
      ...(mesa.adminReview ?? {}),
      appliedGroupingIds: asArray(mesa.adminReview?.appliedGroupingIds),
      appliedDecisionIds: asArray(mesa.adminReview?.appliedDecisionIds),
    },
  }
}

function decisionTrace(decision = {}, extra = {}) {
  return {
    decisionId: decision.decisionId,
    type: decision.type,
    targetId: decision.targetId,
    decision: decision.decision,
    reason: decision.reason,
    hardRuleViolations: asArray(decision.hardRuleViolations),
    ...extra,
  }
}

function selectedDecisionToSelection(decision = {}) {
  const metadata = decision.metadata ?? {}
  return {
    mesaId: metadata.tableId,
    docenteId: metadata.teacherId,
    docente: metadata.teacherName,
    role: metadata.role,
    fechaIso: metadata.date,
    inicio: metadata.startTime,
    fin: metadata.endTime,
    decisionId: decision.decisionId,
    targetId: decision.targetId,
  }
}

function isConsumingRole(role) {
  const normalized = normalizeRole(role)
  return normalized !== 'TITULAR'
}

function mesaHasTeacher(mesa = {}, teacherId = '') {
  const normalizedTeacherId = clean(teacherId)
  if (!normalizedTeacherId) return false
  if (clean(mesa.titularId) === normalizedTeacherId || clean(mesa.profesorTitularId) === normalizedTeacherId) {
    return true
  }
  return asArray(mesa.vocales).some((vocal) => clean(vocal.docenteId) === normalizedTeacherId)
}

function validateFinalSchedule({ schedule = [], teacherExamSourceContext, selections = [] } = {}) {
  const hardRuleViolations = []
  const warnings = []
  const bySlotTeacher = new Map()

  asArray(schedule).forEach((mesa) => {
    if (!clean(mesa.titularId)) hardRuleViolations.push(`TITULAR_REQUIRED:${mesa.id}`)
    if (asArray(mesa.vocales).length < 2) hardRuleViolations.push(`TRIBUNAL_INCOMPLETE:${mesa.id}`)

    const teachersInMesa = [
      mesa.titularId,
      ...asArray(mesa.vocales).map((vocal) => vocal.docenteId),
    ].map(clean).filter(Boolean)
    const uniqueTeachers = new Set(teachersInMesa)
    if (uniqueTeachers.size !== teachersInMesa.length) {
      hardRuleViolations.push(`DUPLICATED_TEACHER_IN_TRIBUNAL:${mesa.id}`)
    }

    const titularBlock = isTeacherBlockedOnDate({
      blockedDatesByTeacher: teacherExamSourceContext?.blockedDatesByTeacher,
      teacherId: mesa.titularId,
      teacherName: mesa.titular || mesa.profesorTitular,
      date: mesa.fechaIso,
      startTime: mesa.inicio,
      endTime: mesa.fin,
    })
    if (titularBlock.blocked) {
      hardRuleViolations.push(`TITULAR_BLOCKED_DATE:${mesa.id}:${mesa.titularId}`)
      hardRuleViolations.push(`BLOCKED_DATE_CONFLICT:${mesa.id}:${mesa.titularId}`)
    }

    asArray(mesa.vocales).forEach((vocal) => {
      const vocalBlock = isTeacherBlockedOnDate({
        blockedDatesByTeacher: teacherExamSourceContext?.blockedDatesByTeacher,
        teacherId: vocal.docenteId,
        teacherName: vocal.docente,
        date: mesa.fechaIso,
        startTime: mesa.inicio,
        endTime: mesa.fin,
      })
      if (vocalBlock.blocked) {
        hardRuleViolations.push(`VOCAL_BLOCKED_DATE:${mesa.id}:${vocal.docenteId}`)
        hardRuleViolations.push(`BLOCKED_DATE_CONFLICT:${mesa.id}:${vocal.docenteId}`)
      }
      const key = [mesa.fechaIso, mesa.inicio, mesa.fin, vocal.docenteId].map(clean).join('::')
      if (key.replaceAll(':', '')) {
        if (bySlotTeacher.has(key)) hardRuleViolations.push(`TEACHER_SLOT_CONFLICT:${vocal.docenteId}`)
        bySlotTeacher.set(key, mesa.id)
      }
    })
  })

  const ledger = buildTeacherAffectationLedger({ teacherExamSourceContext, selections })
  Object.values(ledger).forEach((entry) => {
    if (entry.afectacionesUsadas > entry.limiteAfectacion) {
      hardRuleViolations.push(`TEACHER_AFFECTATION_LIMIT_EXCEEDED:${entry.docenteId}`)
    }
  })

  return {
    hardRuleViolations: [...new Set(hardRuleViolations)],
    warnings,
    ledger,
  }
}

function getStatus({ hardRuleViolations = [], warnings = [], schedule = [] } = {}) {
  if (hardRuleViolations.some((violation) => clean(violation).startsWith('TRIBUNAL_INCOMPLETE:'))) {
    return EXPERIMENTAL_REVIEW_STATUS.REVIEW_INCOMPLETE
  }
  if (hardRuleViolations.length) return EXPERIMENTAL_REVIEW_STATUS.REVIEW_BLOCKED_HARD_RULES
  if (warnings.length) return EXPERIMENTAL_REVIEW_STATUS.REVIEW_HAS_WARNINGS
  if (asArray(schedule).some((mesa) => asArray(mesa.vocales).length < 2)) {
    return EXPERIMENTAL_REVIEW_STATUS.REVIEW_INCOMPLETE
  }
  return EXPERIMENTAL_REVIEW_STATUS.REVIEW_READY
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function shortHash(value) {
  const input = stableStringify(value)
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function canPrepareExperimentalReviewedDraft(review = {}) {
  return [
    EXPERIMENTAL_REVIEW_STATUS.REVIEW_READY,
    EXPERIMENTAL_REVIEW_STATUS.REVIEW_HAS_WARNINGS,
  ].includes(review.status)
}

export function buildExperimentalReviewedScheduleDraft({
  review,
  preSchedule = [],
  adminReviewDecisions = [],
  teacherExamSourceContext = {},
  workspaceKey = 'main',
  now = () => new Date().toISOString(),
} = {}) {
  if (!canPrepareExperimentalReviewedDraft(review)) {
    return {
      ok: false,
      draft: null,
      error: 'REVIEW_NOT_PREPARABLE',
      hardRuleViolations: asArray(review?.hardRuleViolations),
      status: review?.status ?? EXPERIMENTAL_REVIEW_STATUS.REVIEW_INCOMPLETE,
    }
  }

  const timestamp = now()
  const decisionIds = asArray(adminReviewDecisions)
    .map((decision) => clean(decision?.decisionId))
    .filter(Boolean)
  const preScheduleHash = shortHash(asArray(preSchedule).map((mesa) => ({
    id: mesa.id,
    carrera: mesa.carrera,
    materia: mesa.materia,
    fechaIso: mesa.fechaIso,
    turno: mesa.turno,
    inicio: mesa.inicio,
    fin: mesa.fin,
    titularId: mesa.titularId,
  })))
  const draftId = `admin-review-draft-${preScheduleHash}-${shortHash(decisionIds)}`

  return {
    ok: true,
    draft: {
      draftId,
      type: ADMIN_REVIEW_DRAFT_TYPE,
      status: review.status,
      source: ADMIN_REVIEW_DRAFT_SOURCE,
      createdAt: timestamp,
      updatedAt: timestamp,
      basedOn: {
        preScheduleHash,
        decisionIds,
        teacherSource: teacherExamSourceContext?.source ?? 'missing',
        workspaceKey,
      },
      schedule: asArray(review.schedule).map((mesa) => ({
        ...mesa,
        isOfficial: false,
        confirmada: false,
        valid: false,
      })),
      appliedDecisions: asArray(review.appliedDecisions),
      skippedDecisions: asArray(review.skippedDecisions),
      hardRuleViolations: asArray(review.hardRuleViolations),
      warnings: asArray(review.warnings),
      diagnostics: review.diagnostics ?? {},
      isOfficial: false,
    },
    error: '',
    hardRuleViolations: [],
    status: review.status,
  }
}

export function upsertExperimentalReviewedScheduleDraft(drafts = [], draft = {}) {
  const nextDraft = draft && typeof draft === 'object' ? draft : null
  if (!nextDraft?.draftId) return asArray(drafts)

  const nextDrafts = asArray(drafts).filter((current) => current?.draftId !== nextDraft.draftId)
  return [...nextDrafts, nextDraft]
}

export function buildExperimentalReviewedSchedule({
  preSchedule = [],
  adminReviewDecisions = [],
  teacherExamSourceContext = {},
  options = {},
} = {}) {
  const schedule = asArray(preSchedule).map(cloneMesa)
  const scheduleById = new Map(schedule.map((mesa) => [clean(mesa.id), mesa]))
  const appliedDecisions = []
  const skippedDecisions = []
  const warnings = []
  const acceptedGroupingIds = new Set()
  let selections = []

  const groupingSuggestions = suggestExamTableGroupings({
    preSchedule: schedule,
    correlatividades: options.correlatividades ?? [],
  })
  const groupingById = new Map(groupingSuggestions.map((grouping) => [grouping.groupId, grouping]))

  asArray(adminReviewDecisions)
    .filter((decision) => decision.type === ADMIN_REVIEW_DECISION_TYPES.GROUPING)
    .forEach((decision) => {
      if (decision.decision !== ADMIN_DECISIONS.ACCEPTED) {
        skippedDecisions.push(decisionTrace(decision, { reasonSkipped: 'GROUPING_NOT_ACCEPTED' }))
        return
      }
      if (asArray(decision.hardRuleViolations).length) {
        skippedDecisions.push(decisionTrace(decision, { reasonSkipped: 'GROUPING_HAS_HARD_RULE_VIOLATIONS' }))
        return
      }

      const grouping = groupingById.get(decision.targetId)
      if (!grouping) {
        skippedDecisions.push(decisionTrace(decision, { reasonSkipped: 'GROUPING_NOT_FOUND' }))
        return
      }

      const validation = validateExamTableGroupingAgainstHardRules({
        grouping,
        correlatividades: options.correlatividades ?? [],
      })
      if (!validation.valid) {
        skippedDecisions.push(decisionTrace(decision, {
          reasonSkipped: 'GROUPING_VALIDATION_FAILED',
          hardRuleViolations: validation.hardRuleViolations,
        }))
        return
      }

      acceptedGroupingIds.add(decision.targetId)
      grouping.mesas.forEach((mesa) => {
        const targetMesa = scheduleById.get(clean(mesa.id))
        if (!targetMesa) return
        targetMesa.adminReview.appliedGroupingIds = [
          ...new Set([...targetMesa.adminReview.appliedGroupingIds, decision.targetId]),
        ]
        targetMesa.adminReview.appliedDecisionIds = [
          ...new Set([...targetMesa.adminReview.appliedDecisionIds, decision.decisionId]),
        ]
      })
      appliedDecisions.push(decisionTrace(decision, { appliedAs: 'GROUPING' }))
    })

  asArray(adminReviewDecisions)
    .filter((decision) => decision.type === ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION)
    .forEach((decision) => {
      if (decision.decision === 'REMOVED') {
        skippedDecisions.push(decisionTrace(decision, { reasonSkipped: 'SELECTION_REMOVED' }))
        return
      }
      if (decision.decision !== 'SELECTED') {
        skippedDecisions.push(decisionTrace(decision, { reasonSkipped: 'SELECTION_NOT_SELECTED' }))
        return
      }
      if (asArray(decision.hardRuleViolations).length) {
        skippedDecisions.push(decisionTrace(decision, { reasonSkipped: 'SELECTION_HAS_HARD_RULE_VIOLATIONS' }))
        return
      }

      const selection = selectedDecisionToSelection(decision)
      const mesa = scheduleById.get(clean(selection.mesaId))
      if (!mesa) {
        skippedDecisions.push(decisionTrace(decision, { reasonSkipped: 'TABLE_NOT_FOUND' }))
        return
      }

      const role = normalizeRole(selection.role)
      if (isConsumingRole(role) && mesaHasTeacher(mesa, selection.docenteId)) {
        skippedDecisions.push(decisionTrace(decision, {
          reasonSkipped: 'DUPLICATED_TEACHER_IN_TRIBUNAL',
          hardRuleViolations: [`DUPLICATED_TEACHER_IN_TRIBUNAL:${mesa.id}`],
        }))
        return
      }

      if (isConsumingRole(role)) {
        const [recommendation] = recommendTribunalTeachers({
          teacherExamSourceContext,
          mesa,
          selections,
          acceptedGroupings: [...acceptedGroupingIds],
        }).filter((candidate) => candidate.docente.id === selection.docenteId)

        if (!recommendation || !recommendation.eligible || recommendation.hardRuleViolations.length) {
          skippedDecisions.push(decisionTrace(decision, {
            reasonSkipped: 'SELECTION_VALIDATION_FAILED',
            hardRuleViolations: recommendation?.hardRuleViolations?.length
              ? recommendation.hardRuleViolations
              : ['TEACHER_NOT_ELIGIBLE'],
          }))
          return
        }
      }

      const appliedSelection = {
        mesaId: mesa.id,
        docenteId: selection.docenteId,
        docente: selection.docente,
        role,
        fechaIso: mesa.fechaIso,
        inicio: mesa.inicio,
        fin: mesa.fin,
        decisionId: decision.decisionId,
        targetId: decision.targetId,
      }

      if (isConsumingRole(role)) {
        mesa.vocales.push({
          docenteId: selection.docenteId,
          docente: selection.docente,
          role,
          source: 'admin_review_decision',
          decisionId: decision.decisionId,
        })
      } else {
        warnings.push(`TITULAR_SELECTION_DOES_NOT_CONSUME_AFFECTATION:${mesa.id}:${selection.docenteId}`)
      }
      mesa.adminReview.appliedDecisionIds = [
        ...new Set([...mesa.adminReview.appliedDecisionIds, decision.decisionId]),
      ]
      selections = [...selections, appliedSelection]
      appliedDecisions.push(decisionTrace(decision, { appliedAs: 'TRIBUNAL_SELECTION' }))
    })

  schedule.forEach((mesa) => {
    mesa.experimental = true
    mesa.isOfficial = false
    mesa.tribunalStatus = asArray(mesa.vocales).length >= 2
      ? PRE_SCHEDULE_STATES.PENDIENTE_REVISION_ADMIN
      : PRE_SCHEDULE_STATES.PENDIENTE_VOCALES
    mesa.valid = false
    mesa.confirmada = false
  })

  const finalValidation = validateFinalSchedule({
    schedule,
    teacherExamSourceContext,
    selections,
  })
  const hardRuleViolations = finalValidation.hardRuleViolations
  const allWarnings = [...new Set([...warnings, ...finalValidation.warnings])]
  const status = getStatus({ hardRuleViolations, warnings: allWarnings, schedule })

  return {
    status,
    schedule,
    appliedDecisions,
    skippedDecisions,
    hardRuleViolations,
    warnings: allWarnings,
    diagnostics: {
      totalPreSchedule: asArray(preSchedule).length,
      totalSchedule: schedule.length,
      appliedDecisions: appliedDecisions.length,
      skippedDecisions: skippedDecisions.length,
      acceptedGroupings: acceptedGroupingIds.size,
      selectedTribunalTeachers: getSelectedTribunalSelections(adminReviewDecisions).length,
      appliedTribunalTeachers: selections.length,
      completeTribunals: schedule.filter((mesa) => asArray(mesa.vocales).length >= 2).length,
      incompleteTribunals: schedule.filter((mesa) => asArray(mesa.vocales).length < 2).length,
      ledger: Object.values(finalValidation.ledger).map((entry) => ({
        docenteId: entry.docenteId,
        limiteAfectacion: entry.limiteAfectacion,
        afectacionesUsadas: entry.afectacionesUsadas,
        afectacionesRestantes: entry.afectacionesRestantes,
      })),
    },
  }
}
