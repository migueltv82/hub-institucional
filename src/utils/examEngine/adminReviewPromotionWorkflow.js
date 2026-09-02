import {
  ADMIN_REVIEW_DRAFT_TYPE,
  EXPERIMENTAL_REVIEW_STATUS,
} from './adminReviewApplyWorkflow.js'
import { ADMIN_REVIEW_DECISION_TYPES } from './adminReviewDecisions.js'
import {
  buildTeacherAffectationLedger,
  getTeacherAvailabilityForExamTable,
  validateTribunalSelectionAgainstHardRules,
} from './adminReviewWorkflow.js'
import { doTimeRangesOverlap } from './rules/timeRanges.js'
import { isTeacherBlockedOnDate } from './teacherBlockedDates.js'

export { doTimeRangesOverlap } from './rules/timeRanges.js'

export const ADMIN_REVIEW_PROMOTION_TYPE = 'ADMIN_REVIEWED_SCHEDULE_PROMOTION'
export const ADMIN_REVIEW_PROMOTION_SOURCE = 'admin_review_workflow'
export const ADMIN_REVIEW_PROMOTION_STATUS = 'PROMOTED_EXPERIMENTAL'
export const ADMIN_REVIEW_PROMOTION_WORKFLOW_VERSION = '1.1.0'
export const ADMIN_REVIEW_INTEGRITY_ALGORITHM = 'sha256'
export const ADMIN_REVIEW_INTEGRITY_STATUS = Object.freeze({
  VERIFIED: 'VERIFIED',
  MISMATCH: 'MISMATCH',
  LEGACY_UNVERIFIED: 'LEGACY_UNVERIFIED',
  VERIFY_ERROR: 'VERIFY_ERROR',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeRole(value) {
  return clean(value).toUpperCase() || 'VOCAL'
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function normalizeStableValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function' || typeof value === 'symbol') return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) throw new Error('CYCLIC_VALUE')

  seen.add(value)
  const normalized = Array.isArray(value)
    ? value.map((entry) => normalizeStableValue(entry, seen))
    : Object.keys(value).sort().reduce((accumulator, key) => {
      accumulator[key] = normalizeStableValue(value[key], seen)
      return accumulator
    }, {})
  seen.delete(value)
  return normalized
}

export function stableSerializeAdminReviewValue(value) {
  return JSON.stringify(normalizeStableValue(value))
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount))
}

export function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''))
  const bitLength = bytes.length * 8
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  const high = Math.floor(bitLength / 0x100000000)
  const low = bitLength >>> 0
  view.setUint32(paddedLength - 8, high)
  view.setUint32(paddedLength - 4, low)

  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4)
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15]
      const previous2 = words[index - 2]
      const sigma0 = rightRotate(previous15, 7) ^ rightRotate(previous15, 18) ^ (previous15 >>> 3)
      const sigma1 = rightRotate(previous2, 17) ^ rightRotate(previous2, 19) ^ (previous2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  return Array.from(hash).map((word) => word.toString(16).padStart(8, '0')).join('')
}

function hashStableValue(value) {
  return sha256Hex(stableSerializeAdminReviewValue(value))
}

function decisionIds(decisions = []) {
  return unique(asArray(decisions).map((decision) => decision?.decisionId))
}

function teacherContextIntegrityMetadata(context = {}) {
  const docentes = asArray(context.docentes).map((docente) => ({
    id: clean(docente?.id),
    horasCatedra: Number(context.cargaHorariaPorDocente?.[docente?.id] ?? docente?.horasCatedra ?? 0),
    limiteAfectacion: Number(context.limiteAfectacionPorDocente?.[docente?.id] ?? docente?.limiteAfectacion ?? 0),
  })).sort((left, right) => left.id.localeCompare(right.id))
  const availability = Object.entries(context.disponibilidadPorDocente ?? {}).map(([docenteId, rows]) => ({
    docenteId,
    rows: asArray(rows).map((row) => ({
      dia: clean(row?.diaNormalizado ?? row?.dia),
      turno: clean(row?.turno).toUpperCase(),
      horaDesde: clean(row?.horaDesde),
      horaHasta: clean(row?.horaHasta),
      disponible: row?.disponible !== false,
    })).sort((left, right) => stableSerializeAdminReviewValue(left).localeCompare(stableSerializeAdminReviewValue(right))),
  })).sort((left, right) => left.docenteId.localeCompare(right.docenteId))
  const workloads = Object.entries(context.materiasPorDocente ?? {}).map(([docenteId, rows]) => ({
    docenteId,
    rows: asArray(rows).map((row) => ({
      carrera: clean(row?.carrera),
      materia: clean(row?.materiaCodigo ?? row?.materia ?? row?.materiaNombre),
      plan: clean(row?.plan),
      rol: clean(row?.rol).toUpperCase(),
      titular: Boolean(row?.titular),
      horasCatedra: Number(row?.horasCatedra ?? 0),
    })).sort((left, right) => stableSerializeAdminReviewValue(left).localeCompare(stableSerializeAdminReviewValue(right))),
  })).sort((left, right) => left.docenteId.localeCompare(right.docenteId))
  const blockedDates = Object.entries(context.blockedDatesByTeacher ?? {}).map(([docenteId, rows]) => ({
    docenteId,
    rows: asArray(rows).map((row) => ({
      id: clean(row?.id),
      date: clean(row?.date),
      startTime: clean(row?.startTime),
      endTime: clean(row?.endTime),
      scope: clean(row?.scope),
      status: clean(row?.status),
    })).sort((left, right) => stableSerializeAdminReviewValue(left).localeCompare(stableSerializeAdminReviewValue(right))),
  })).sort((left, right) => left.docenteId.localeCompare(right.docenteId))

  return {
    source: clean(context.source) || 'missing',
    hasStructuredTeacherSource: Boolean(context.hasStructuredTeacherSource),
    hasLegacyTeacherScheduleSource: Boolean(context.hasLegacyTeacherScheduleSource),
    docentes,
    availability,
    workloads,
    ...(blockedDates.length ? { blockedDates } : {}),
  }
}

export function normalizeAdminReviewActor(actor = null) {
  const userId = clean(actor?.userId) || null
  const email = clean(actor?.email) || null
  const role = clean(actor?.role) || null
  const providedDisplayName = clean(actor?.displayName)
  const available = Boolean(userId || email || providedDisplayName)

  return {
    actor: available
      ? {
        userId,
        displayName: providedDisplayName || email || userId,
        email,
        role,
      }
      : {
        userId: null,
        displayName: 'ADMIN_REVIEW_USER_UNAVAILABLE',
        email: null,
        role: null,
      },
    warning: available ? '' : 'ADMIN_ACTOR_UNAVAILABLE',
  }
}

export function buildAdminReviewPromotionIntegrity({
  draft,
  appliedDecisionIds = [],
  skippedDecisionIds = [],
  teacherExamSourceContext = {},
  generatedAt,
  workflowVersion = ADMIN_REVIEW_PROMOTION_WORKFLOW_VERSION,
} = {}) {
  try {
    const inputs = {
      draftHash: hashStableValue(draft),
      appliedDecisionsHash: hashStableValue(unique(appliedDecisionIds).sort()),
      skippedDecisionsHash: hashStableValue(unique(skippedDecisionIds).sort()),
      teacherContextHash: hashStableValue(teacherContextIntegrityMetadata(teacherExamSourceContext)),
    }
    const hash = hashStableValue({
      draftId: clean(draft?.draftId),
      generatedAt: clean(generatedAt),
      workflowVersion: clean(workflowVersion),
      inputs,
    })

    if (![hash, ...Object.values(inputs)].every((value) => /^[a-f0-9]{64}$/.test(value))) {
      return { ok: false, integrity: null, error: 'INTEGRITY_HASH_GENERATION_FAILED' }
    }

    return {
      ok: true,
      integrity: {
        hash,
        algorithm: ADMIN_REVIEW_INTEGRITY_ALGORITHM,
        workflowVersion: clean(workflowVersion),
        generatedAt: clean(generatedAt),
        inputs,
      },
      error: '',
    }
  } catch {
    return { ok: false, integrity: null, error: 'INTEGRITY_HASH_GENERATION_FAILED' }
  }
}

export function verifyAdminReviewPromotionIntegrity({
  promotion,
  draft,
  teacherExamSourceContext = {},
} = {}) {
  if (!promotion?.integrity) {
    return {
      valid: false,
      error: 'INTEGRITY_MISSING',
      mismatches: ['integrity'],
    }
  }

  const recalculated = buildAdminReviewPromotionIntegrity({
    draft,
    appliedDecisionIds: promotion.appliedDecisionIds,
    skippedDecisionIds: promotion.skippedDecisionIds,
    teacherExamSourceContext,
    generatedAt: promotion.integrity.generatedAt,
    workflowVersion: promotion.integrity.workflowVersion,
  })
  if (!recalculated.ok) {
    return {
      valid: false,
      error: recalculated.error,
      mismatches: ['integrity'],
    }
  }

  const mismatches = []
  if (promotion.integrity.algorithm !== ADMIN_REVIEW_INTEGRITY_ALGORITHM) mismatches.push('algorithm')
  if (promotion.integrity.hash !== recalculated.integrity.hash) mismatches.push('hash')
  Object.keys(recalculated.integrity.inputs).forEach((field) => {
    if (promotion.integrity.inputs?.[field] !== recalculated.integrity.inputs[field]) {
      mismatches.push(`inputs.${field}`)
    }
  })

  return {
    valid: mismatches.length === 0,
    error: mismatches.length ? 'INTEGRITY_MISMATCH' : '',
    mismatches,
  }
}

function buildPromotedSchedule({ draft, promotionId }) {
  return asArray(draft?.schedule).map((mesa) => ({
    ...mesa,
    isOfficial: false,
    isOfficialCandidate: true,
    confirmada: false,
    valid: false,
    adminReviewPromotion: {
      promotionId,
      draftId: draft?.draftId,
      source: ADMIN_REVIEW_PROMOTION_SOURCE,
    },
  }))
}

function buildIntegrityVerification({ promotion, status, mismatchFields = [], warnings = [], verifiedAt }) {
  const previous = promotion?.integrityVerification ?? {}
  const candidateRequested = typeof previous.candidateRequested === 'boolean'
    ? previous.candidateRequested
    : promotion?.isOfficialCandidate === true
  const comparable = {
    status,
    workflowVersion: clean(promotion?.integrity?.workflowVersion) || 'legacy',
    mismatchFields: unique(mismatchFields),
    warnings: unique(warnings),
    candidateRequested,
    eligibleForFutureApproval: status === ADMIN_REVIEW_INTEGRITY_STATUS.VERIFIED && candidateRequested,
  }
  const previousComparable = {
    status: previous.status,
    workflowVersion: previous.workflowVersion,
    mismatchFields: asArray(previous.mismatchFields),
    warnings: asArray(previous.warnings),
    candidateRequested: previous.candidateRequested,
    eligibleForFutureApproval: previous.eligibleForFutureApproval,
  }

  return {
    ...comparable,
    verifiedAt: stableSerializeAdminReviewValue(comparable) === stableSerializeAdminReviewValue(previousComparable)
      && clean(previous.verifiedAt)
      ? previous.verifiedAt
      : verifiedAt,
  }
}

export function verifyAdminReviewPromotionEvent({
  promotion,
  draft,
  teacherExamSourceContext = {},
  now = () => new Date().toISOString(),
} = {}) {
  const verifiedAt = now()
  if (!promotion?.integrity) {
    const integrityVerification = buildIntegrityVerification({
      promotion,
      status: ADMIN_REVIEW_INTEGRITY_STATUS.LEGACY_UNVERIFIED,
      warnings: ['LEGACY_PROMOTION_WITHOUT_INTEGRITY'],
      verifiedAt,
    })
    return {
      ...promotion,
      integrityStatus: integrityVerification.status,
      integrityVerification,
      isOfficialCandidate: false,
    }
  }

  if (!draft || clean(draft.draftId) !== clean(promotion.draftId)) {
    const integrityVerification = buildIntegrityVerification({
      promotion,
      status: ADMIN_REVIEW_INTEGRITY_STATUS.VERIFY_ERROR,
      mismatchFields: ['draft'],
      warnings: ['SOURCE_DRAFT_NOT_FOUND'],
      verifiedAt,
    })
    return {
      ...promotion,
      integrityStatus: integrityVerification.status,
      integrityVerification,
      isOfficialCandidate: false,
    }
  }

  const verification = verifyAdminReviewPromotionIntegrity({
    promotion,
    draft,
    teacherExamSourceContext,
  })
  if (verification.error && verification.error !== 'INTEGRITY_MISMATCH') {
    const integrityVerification = buildIntegrityVerification({
      promotion,
      status: ADMIN_REVIEW_INTEGRITY_STATUS.VERIFY_ERROR,
      mismatchFields: verification.mismatches,
      warnings: [verification.error],
      verifiedAt,
    })
    return {
      ...promotion,
      integrityStatus: integrityVerification.status,
      integrityVerification,
      isOfficialCandidate: false,
    }
  }

  const mismatchFields = [...verification.mismatches]
  const expectedSchedule = buildPromotedSchedule({ draft, promotionId: promotion.promotionId })
  try {
    if (stableSerializeAdminReviewValue(promotion.schedule) !== stableSerializeAdminReviewValue(expectedSchedule)) {
      mismatchFields.push('promotion.schedule')
    }
  } catch {
    const integrityVerification = buildIntegrityVerification({
      promotion,
      status: ADMIN_REVIEW_INTEGRITY_STATUS.VERIFY_ERROR,
      mismatchFields: ['promotion.schedule'],
      warnings: ['PROMOTION_SCHEDULE_VERIFY_ERROR'],
      verifiedAt,
    })
    return {
      ...promotion,
      integrityStatus: integrityVerification.status,
      integrityVerification,
      isOfficialCandidate: false,
    }
  }

  const status = mismatchFields.length
    ? ADMIN_REVIEW_INTEGRITY_STATUS.MISMATCH
    : ADMIN_REVIEW_INTEGRITY_STATUS.VERIFIED
  const integrityVerification = buildIntegrityVerification({
    promotion,
    status,
    mismatchFields,
    warnings: status === ADMIN_REVIEW_INTEGRITY_STATUS.MISMATCH ? ['PROMOTION_INTEGRITY_MISMATCH'] : [],
    verifiedAt,
  })

  return {
    ...promotion,
    integrityStatus: status,
    integrityVerification,
    isOfficialCandidate: integrityVerification.eligibleForFutureApproval,
  }
}

export function verifyAdminReviewPromotionEvents({
  promotions = [],
  drafts = [],
  teacherExamSourceContext = {},
  now,
} = {}) {
  const draftsById = new Map(asArray(drafts).map((draft) => [clean(draft?.draftId), draft]))
  return asArray(promotions).map((promotion) => verifyAdminReviewPromotionEvent({
    promotion,
    draft: draftsById.get(clean(promotion?.draftId)),
    teacherExamSourceContext,
    now,
  }))
}

function expectedAppliedDecision(decision = {}) {
  if (decision.type === ADMIN_REVIEW_DECISION_TYPES.GROUPING) return 'ACCEPTED'
  if (decision.type === ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION) return 'SELECTED'
  return ''
}

function validateDecisionTrace({ draft, adminReviewDecisions }) {
  const hardRuleViolations = []
  const warnings = []
  const currentById = new Map(asArray(adminReviewDecisions).map((decision) => [clean(decision?.decisionId), decision]))
  const basedOnDecisionIds = unique(draft?.basedOn?.decisionIds)
  const basedOnDecisionIdSet = new Set(basedOnDecisionIds)
  const appliedDecisionIds = decisionIds(draft?.appliedDecisions)
  const skippedDecisionIds = decisionIds(draft?.skippedDecisions)
  const appliedDecisionIdSet = new Set(appliedDecisionIds)

  if (!basedOnDecisionIds.length) hardRuleViolations.push('DRAFT_WITHOUT_DECISION_TRACE')
  basedOnDecisionIds.forEach((decisionId) => {
    if (!currentById.has(decisionId)) hardRuleViolations.push(`SOURCE_DECISION_NOT_FOUND:${decisionId}`)
  })
  appliedDecisionIds.forEach((decisionId) => {
    if (!basedOnDecisionIdSet.has(decisionId)) hardRuleViolations.push(`APPLIED_DECISION_OUTSIDE_DRAFT_TRACE:${decisionId}`)
  })
  skippedDecisionIds.forEach((decisionId) => {
    if (!basedOnDecisionIdSet.has(decisionId)) hardRuleViolations.push(`SKIPPED_DECISION_OUTSIDE_DRAFT_TRACE:${decisionId}`)
    if (appliedDecisionIdSet.has(decisionId)) hardRuleViolations.push(`DECISION_APPLIED_AND_SKIPPED:${decisionId}`)
  })

  asArray(draft?.appliedDecisions).forEach((trace) => {
    const decisionId = clean(trace?.decisionId)
    const current = currentById.get(decisionId)
    if (!decisionId || !current) {
      hardRuleViolations.push(`APPLIED_DECISION_NOT_FOUND:${decisionId || 'missing'}`)
      return
    }

    const expected = expectedAppliedDecision(current)
    if (!expected || clean(current.decision).toUpperCase() !== expected) {
      hardRuleViolations.push(`APPLIED_DECISION_NO_LONGER_VALID:${decisionId}`)
    }
    if (asArray(current.hardRuleViolations).length) {
      hardRuleViolations.push(`APPLIED_DECISION_HAS_HARD_RULES:${decisionId}`)
    }
  })

  asArray(draft?.skippedDecisions).forEach((trace) => {
    if (!clean(trace?.decisionId)) warnings.push('SKIPPED_DECISION_WITHOUT_ID')
  })

  return {
    hardRuleViolations,
    warnings,
    basedOnDecisionIds,
    appliedDecisionIds,
    appliedDecisionIdSet,
    skippedDecisionIds,
    currentById,
  }
}

function validateSchedule({ draft, teacherExamSourceContext, decisionValidation }) {
  const schedule = asArray(draft?.schedule)
  const hardRuleViolations = []
  const warnings = []
  const slotsByTeacher = new Map()
  const selections = []
  const usedTribunalDecisionIds = new Set()

  if (!schedule.length) hardRuleViolations.push('DRAFT_SCHEDULE_EMPTY')

  schedule.forEach((mesa, mesaIndex) => {
    const mesaId = clean(mesa?.id) || `index-${mesaIndex}`
    const titularId = clean(mesa?.titularId ?? mesa?.profesorTitularId)
    const vocales = asArray(mesa?.vocales)

    if (!titularId) hardRuleViolations.push(`TITULAR_REQUIRED:${mesaId}`)
    if (vocales.length < 2) hardRuleViolations.push(`TRIBUNAL_INCOMPLETE:${mesaId}`)
    if (mesa?.isOfficial === true || mesa?.confirmada === true || mesa?.valid === true) {
      hardRuleViolations.push(`DRAFT_TABLE_MARKED_AS_OFFICIAL_OR_VALID:${mesaId}`)
    }
    if (!clean(mesa?.fechaIso)) hardRuleViolations.push(`TABLE_DATE_REQUIRED:${mesaId}`)
    if (!doTimeRangesOverlap(mesa?.inicio, mesa?.fin, mesa?.inicio, mesa?.fin)) {
      hardRuleViolations.push(`INVALID_TABLE_TIME_RANGE:${mesaId}`)
    }

    const tribunalTeachers = [
      { docenteId: titularId, role: 'TITULAR' },
      ...vocales.map((vocal) => ({
        docenteId: clean(vocal?.docenteId),
        role: normalizeRole(vocal?.role),
      })),
    ].filter((teacher) => teacher.docenteId)
    const teacherIds = tribunalTeachers.map((teacher) => teacher.docenteId)

    if (new Set(teacherIds).size !== teacherIds.length) {
      hardRuleViolations.push(`DUPLICATED_TEACHER_IN_TRIBUNAL:${mesaId}`)
    }

    tribunalTeachers.forEach(({ docenteId, role }) => {
      const teacherName = role === 'TITULAR'
        ? clean(mesa?.titular ?? mesa?.profesorTitular)
        : clean(vocales.find((vocal) => clean(vocal?.docenteId) === docenteId)?.docente)
      const blockedDate = isTeacherBlockedOnDate({
        blockedDatesByTeacher: teacherExamSourceContext?.blockedDatesByTeacher,
        teacherId: docenteId,
        teacherName,
        date: mesa?.fechaIso,
        startTime: mesa?.inicio,
        endTime: mesa?.fin,
      })
      if (blockedDate.blocked) {
        hardRuleViolations.push(`TEACHER_BLOCKED_DATE:${mesaId}:${docenteId}`)
        hardRuleViolations.push(`${role === 'TITULAR' ? 'TITULAR_BLOCKED_DATE' : 'VOCAL_BLOCKED_DATE'}:${mesaId}:${docenteId}`)
        hardRuleViolations.push(`BLOCKED_DATE_CONFLICT:${mesaId}:${docenteId}`)
      }
      const availability = getTeacherAvailabilityForExamTable({
        teacherExamSourceContext,
        docenteId,
        mesa,
      })
      if (!availability.disponibleEseDia) {
        hardRuleViolations.push(`TEACHER_NOT_AVAILABLE_ON_DATE:${mesaId}:${docenteId}`)
      } else if (!availability.disponibleEnTurno) {
        hardRuleViolations.push(`TEACHER_NOT_AVAILABLE_ON_SHIFT:${mesaId}:${docenteId}`)
      }

      const teacherSlots = slotsByTeacher.get(docenteId) ?? []
      const overlappingSlot = teacherSlots.find((slot) => (
        clean(slot.fechaIso) === clean(mesa.fechaIso)
        && doTimeRangesOverlap(slot.inicio, slot.fin, mesa.inicio, mesa.fin)
      ))
      if (overlappingSlot) hardRuleViolations.push(`TEACHER_SLOT_CONFLICT:${docenteId}`)
      teacherSlots.push({ mesaId, fechaIso: mesa.fechaIso, inicio: mesa.inicio, fin: mesa.fin })
      slotsByTeacher.set(docenteId, teacherSlots)
    })

    vocales.forEach((vocal) => {
      const docenteId = clean(vocal?.docenteId)
      const role = normalizeRole(vocal?.role)
      const decisionId = clean(vocal?.decisionId)
      const currentDecision = decisionValidation.currentById.get(decisionId)
      if (decisionId) usedTribunalDecisionIds.add(decisionId)

      if (!decisionId || !currentDecision) {
        hardRuleViolations.push(`TRIBUNAL_SELECTION_DECISION_NOT_FOUND:${mesaId}:${docenteId || 'missing'}`)
      } else if (!decisionValidation.appliedDecisionIdSet.has(decisionId)) {
        hardRuleViolations.push(`TRIBUNAL_SELECTION_NOT_APPLIED_IN_DRAFT:${decisionId}`)
      } else if (
        currentDecision.type !== ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION
        || clean(currentDecision.decision).toUpperCase() !== 'SELECTED'
        || clean(currentDecision.metadata?.tableId) !== clean(mesa?.id)
        || clean(currentDecision.metadata?.teacherId) !== docenteId
      ) {
        hardRuleViolations.push(`TRIBUNAL_SELECTION_DECISION_MISMATCH:${decisionId}`)
      }

      const validation = validateTribunalSelectionAgainstHardRules({
        teacherExamSourceContext,
        mesa,
        docenteId,
        role,
        selections,
      })
      validation.hardRuleViolations.forEach((violation) => {
        hardRuleViolations.push(`${violation}:${mesaId}:${docenteId || 'missing'}`)
      })
      validation.warnings.forEach((warning) => warnings.push(warning))

      selections.push({
        mesaId,
        docenteId,
        role,
        fechaIso: mesa?.fechaIso,
        inicio: mesa?.inicio,
        fin: mesa?.fin,
        decisionId,
      })
    })
  })

  asArray(draft?.appliedDecisions).forEach((trace) => {
    if (
      trace?.type === ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION
      && !usedTribunalDecisionIds.has(clean(trace?.decisionId))
    ) {
      hardRuleViolations.push(`APPLIED_TRIBUNAL_SELECTION_NOT_IN_SCHEDULE:${clean(trace?.decisionId) || 'missing'}`)
    }
  })

  const ledger = buildTeacherAffectationLedger({ teacherExamSourceContext, selections })
  Object.values(ledger).forEach((entry) => {
    if (entry.afectacionesUsadas > entry.limiteAfectacion) {
      hardRuleViolations.push(`TEACHER_AFFECTATION_LIMIT_EXCEEDED:${entry.docenteId}`)
    }
  })

  return {
    hardRuleViolations,
    warnings,
    selections,
    ledger,
  }
}

export function validateAdminReviewedDraftForPromotion({
  draft,
  adminReviewDecisions = [],
  teacherExamSourceContext = {},
} = {}) {
  const hardRuleViolations = []
  const warnings = []

  if (!clean(draft?.draftId)) hardRuleViolations.push('DRAFT_ID_REQUIRED')
  if (draft?.type !== ADMIN_REVIEW_DRAFT_TYPE) hardRuleViolations.push('INVALID_DRAFT_TYPE')
  if (draft?.isOfficial !== false) hardRuleViolations.push('DRAFT_MUST_BE_NON_OFFICIAL')
  if (!clean(draft?.basedOn?.preScheduleHash)) hardRuleViolations.push('DRAFT_PRE_SCHEDULE_HASH_REQUIRED')
  if (draft?.status !== EXPERIMENTAL_REVIEW_STATUS.REVIEW_READY) {
    hardRuleViolations.push(`DRAFT_STATUS_NOT_PROMOTABLE:${clean(draft?.status) || 'missing'}`)
  }
  asArray(draft?.hardRuleViolations).forEach((violation) => {
    hardRuleViolations.push(`DRAFT_HARD_RULE:${clean(violation) || 'unknown'}`)
  })

  const decisionValidation = validateDecisionTrace({ draft, adminReviewDecisions })
  hardRuleViolations.push(...decisionValidation.hardRuleViolations)
  warnings.push(...decisionValidation.warnings)

  const scheduleValidation = validateSchedule({
    draft,
    teacherExamSourceContext,
    decisionValidation,
  })
  hardRuleViolations.push(...scheduleValidation.hardRuleViolations)
  warnings.push(...scheduleValidation.warnings)

  const expectedDiagnosticCounts = {
    totalSchedule: asArray(draft?.schedule).length,
    appliedDecisions: asArray(draft?.appliedDecisions).length,
    skippedDecisions: asArray(draft?.skippedDecisions).length,
    completeTribunals: asArray(draft?.schedule).filter((mesa) => asArray(mesa?.vocales).length >= 2).length,
  }
  Object.entries(expectedDiagnosticCounts).forEach(([field, expected]) => {
    const stored = draft?.diagnostics?.[field]
    if (stored !== undefined && Number(stored) !== expected) {
      hardRuleViolations.push(`DRAFT_DIAGNOSTIC_MISMATCH:${field}`)
    }
  })

  const safeLedger = Object.values(scheduleValidation.ledger).map((entry) => ({
    docenteId: entry.docenteId,
    limiteAfectacion: entry.limiteAfectacion,
    afectacionesUsadas: entry.afectacionesUsadas,
    afectacionesRestantes: entry.afectacionesRestantes,
  }))

  return {
    valid: hardRuleViolations.length === 0,
    hardRuleViolations: unique(hardRuleViolations),
    warnings: unique(warnings),
    diagnostics: {
      draftId: clean(draft?.draftId),
      scheduleCount: asArray(draft?.schedule).length,
      sourceDecisionCount: decisionValidation.basedOnDecisionIds.length,
      appliedDecisionCount: asArray(draft?.appliedDecisions).length,
      skippedDecisionCount: asArray(draft?.skippedDecisions).length,
      validatedTribunalSelections: scheduleValidation.selections.length,
      completeTribunals: asArray(draft?.schedule).filter((mesa) => asArray(mesa?.vocales).length >= 2).length,
      ledger: safeLedger,
    },
  }
}

export function promoteAdminReviewedDraft({
  draft,
  adminReviewDecisions = [],
  teacherExamSourceContext = {},
  options = {},
} = {}) {
  const validation = validateAdminReviewedDraftForPromotion({
    draft,
    adminReviewDecisions,
    teacherExamSourceContext,
  })

  if (!validation.valid) {
    return {
      promoted: false,
      promotedSchedule: [],
      promotionRecord: null,
      hardRuleViolations: validation.hardRuleViolations,
      warnings: validation.warnings,
      diagnostics: validation.diagnostics,
    }
  }

  const promotedAt = typeof options.now === 'function'
    ? options.now()
    : new Date().toISOString()
  const previousPromotions = asArray(options.existingPromotions)
    .filter((promotion) => clean(promotion?.draftId) === clean(draft.draftId))
  const revisionNumber = Math.max(
    previousPromotions.length,
    ...previousPromotions.map((promotion) => Number(promotion?.revisionNumber ?? 0)),
  ) + 1
  const previousPromotion = previousPromotions.at(-1) ?? null
  const promotionId = `admin-review-promotion-${clean(draft.draftId)}-r${revisionNumber}`
  const promotedSchedule = buildPromotedSchedule({ draft, promotionId })
  const appliedDecisionIds = decisionIds(draft.appliedDecisions)
  const skippedDecisionIds = decisionIds(draft.skippedDecisions)
  const integrityResult = buildAdminReviewPromotionIntegrity({
    draft,
    appliedDecisionIds,
    skippedDecisionIds,
    teacherExamSourceContext,
    generatedAt: promotedAt,
    workflowVersion: options.workflowVersion ?? ADMIN_REVIEW_PROMOTION_WORKFLOW_VERSION,
  })
  if (!integrityResult.ok) {
    return {
      promoted: false,
      promotedSchedule: [],
      promotionRecord: null,
      hardRuleViolations: [integrityResult.error],
      warnings: validation.warnings,
      diagnostics: validation.diagnostics,
    }
  }

  const actorResult = normalizeAdminReviewActor(options.adminActor)
  const promotionWarnings = unique([...validation.warnings, actorResult.warning])
  const promotionRecord = {
    promotionId,
    draftId: draft.draftId,
    revisionNumber,
    previousPromotionId: clean(previousPromotion?.promotionId) || null,
    type: ADMIN_REVIEW_PROMOTION_TYPE,
    status: ADMIN_REVIEW_PROMOTION_STATUS,
    promotedAt,
    source: ADMIN_REVIEW_PROMOTION_SOURCE,
    basedOn: {
      draftId: draft.draftId,
      preScheduleHash: clean(draft.basedOn?.preScheduleHash),
      decisionIds: unique(draft.basedOn?.decisionIds),
      teacherSource: clean(draft.basedOn?.teacherSource) || 'missing',
      workspaceKey: clean(draft.basedOn?.workspaceKey) || clean(options.workspaceKey) || 'main',
    },
    schedule: promotedSchedule,
    appliedDecisionIds,
    skippedDecisionIds,
    integrity: integrityResult.integrity,
    integrityStatus: ADMIN_REVIEW_INTEGRITY_STATUS.VERIFIED,
    integrityVerification: {
      status: ADMIN_REVIEW_INTEGRITY_STATUS.VERIFIED,
      verifiedAt: promotedAt,
      workflowVersion: integrityResult.integrity.workflowVersion,
      mismatchFields: [],
      warnings: [],
      candidateRequested: true,
      eligibleForFutureApproval: true,
    },
    adminActor: actorResult.actor,
    hardRuleViolations: [],
    warnings: promotionWarnings,
    diagnostics: validation.diagnostics,
    isOfficialCandidate: true,
    isOfficial: false,
  }

  return {
    promoted: true,
    promotedSchedule,
    promotionRecord,
    hardRuleViolations: [],
    warnings: promotionWarnings,
    diagnostics: validation.diagnostics,
  }
}

export function upsertAdminReviewedPromotion(promotions = [], promotion = {}) {
  if (!clean(promotion?.promotionId)) return asArray(promotions)
  if (asArray(promotions).some((current) => clean(current?.promotionId) === clean(promotion.promotionId))) {
    return asArray(promotions)
  }
  return [...asArray(promotions), promotion]
}

export const appendAdminReviewedPromotionEvent = upsertAdminReviewedPromotion
