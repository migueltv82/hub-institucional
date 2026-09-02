import { parseDocenteMateriaRows } from '../comparison/parseDocenteMateriaRows.js'
import {
  DOCENTE_MATERIA_RESOLUTION_STATUS,
  normalizeDocenteMateriaText,
  resolveDocenteMateriaAssignment,
} from '../comparison/resolveDocenteMateriaAssignment.js'

const REVIEW_TYPES_WITH_TITULAR = new Set([
  'PRACTICA_PROFESIONAL_MULTIDOCENTE',
  'MULTIDOCENTE_NO_PRACTICA',
])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeToken(value) {
  return normalizeDocenteMateriaText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeReviewType(value) {
  return clean(value).toUpperCase() || 'OTRO'
}

function normalizeYesNo(value) {
  return clean(value).toUpperCase()
}

function subjectKey(row = {}) {
  return [
    normalizeToken(row.carrera),
    normalizeToken(row.anio),
    normalizeToken(row.materia_codigo),
    normalizeToken(row.materia_nombre),
  ].join('::')
}

function hasReviewFlag(row = {}) {
  return normalizeYesNo(row.requiere_revision) === 'SI'
}

function isNoMesa(row = {}) {
  const value = normalizeToken(row.requiere_mesa)
  return row.requiere_mesa === false || ['no', 'false', '0'].includes(value)
}

function requiresMesa(row = {}) {
  return !isNoMesa(row)
}

function splitDetectedTeachers(value) {
  return clean(value)
    .split('|')
    .map(clean)
    .filter(Boolean)
}

function uniqueValues(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function appendObservation(previous, addition) {
  const current = clean(previous)
  return current ? `${current} ${addition}` : addition
}

function secondaryRoleFromAction(action) {
  const normalized = normalizeReviewType(action)
  return normalized.includes('AUXILIAR') ? 'AUXILIAR' : 'CO_DOCENTE'
}

function safeReviewItem(row = {}, reason = '') {
  return {
    review_id: clean(row.review_id),
    carrera: clean(row.carrera),
    anio: clean(row.anio),
    materia_codigo: clean(row.materia_codigo),
    materia_nombre: clean(row.materia_nombre),
    tipo_revision: normalizeReviewType(row.tipo_revision),
    reason,
  }
}

function buildCandidateGroups(rows = []) {
  return rows.reduce((groups, row, index) => {
    const key = subjectKey(row)
    const group = groups.get(key) ?? []
    group.push({ row, index })
    groups.set(key, group)
    return groups
  }, new Map())
}

function buildReviewGroups(rows = []) {
  return rows.reduce((groups, row) => {
    const key = subjectKey(row)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
    return groups
  }, new Map())
}

function findMatchingCandidate(candidateItems = [], titularToConfirm = '') {
  const selected = normalizeDocenteMateriaText(titularToConfirm)
  if (!selected) return null

  return candidateItems.find(({ row }) => normalizeDocenteMateriaText(row.docente) === selected) ?? null
}

function reviewMentionsDetectedTeacher(review = {}, titularToConfirm = '') {
  const selected = normalizeDocenteMateriaText(titularToConfirm)
  if (!selected) return false
  return splitDetectedTeachers(review.docentes_detectados)
    .some((teacher) => normalizeDocenteMateriaText(teacher) === selected)
}

function collectReviewRowsRequiringDecision(reviewRows = []) {
  return reviewRows.filter((row) => {
    const type = normalizeReviewType(row.tipo_revision)
    return REVIEW_TYPES_WITH_TITULAR.has(type) || type === 'HORARIO_HUERFANO'
  })
}

function applyTitularReview({
  correctedRows,
  candidateItems,
  review,
  appliedReviewItems,
  pendingReviewItems,
  errors,
  counters,
}) {
  const titularToConfirm = clean(review.titular_a_confirmar)
  const type = normalizeReviewType(review.tipo_revision)

  if (!titularToConfirm) {
    pendingReviewItems.push(safeReviewItem(review, 'FALTA_TITULAR_A_CONFIRMAR'))
    return
  }

  const matchedCandidate = findMatchingCandidate(candidateItems, titularToConfirm)
  if (!matchedCandidate || !reviewMentionsDetectedTeacher(review, titularToConfirm)) {
    errors.push({
      code: 'TITULAR_A_CONFIRMAR_NO_COINCIDE',
      review_id: clean(review.review_id),
      tipo_revision: type,
      message: 'El titular_a_confirmar no coincide con los docentes detectados para la materia.',
    })
    return
  }

  const secondaryRole = secondaryRoleFromAction(review.accion_sugerida)

  candidateItems.forEach(({ row, index }) => {
    const isTitular = index === matchedCandidate.index
    const updated = {
      ...row,
      rol_en_materia: isTitular ? 'TITULAR' : secondaryRole,
      estado_asignacion: 'ACTIVO',
      requiere_revision: 'NO',
      motivo_revision: '',
    }

    if (isTitular) {
      updated.observaciones = appendObservation(
        row.observaciones,
        'Titular confirmado por revision institucional.',
      )
      counters.titularesConfirmados += 1
    } else if (secondaryRole === 'AUXILIAR') {
      counters.auxiliaresAsignados += 1
    } else {
      counters.coDocentesAsignados += 1
    }

    correctedRows[index] = updated
  })

  appliedReviewItems.push(safeReviewItem(review, 'APLICADO'))
}

function buildTeacherNameToId(rows = []) {
  return rows.reduce((lookup, row, index) => {
    const id = clean(row.dni_docente) || `docente-${index + 1}`
    const aliases = uniqueValues([row.dni_docente, row.docente])

    aliases.forEach((alias) => {
      const textKey = normalizeDocenteMateriaText(alias)
      const tokenKey = normalizeToken(alias)
      if (textKey) lookup[textKey] = id
      if (tokenKey) lookup[tokenKey] = id
    })

    return lookup
  }, {})
}

function validateAssignments(parsedRows = []) {
  const teacherNameToId = buildTeacherNameToId(parsedRows)
  const groups = buildCandidateGroups(parsedRows)
  const allowedStatuses = new Set([
    DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_ACTIVO,
    DOCENTE_MATERIA_RESOLUTION_STATUS.REEMPLAZO_ACTIVO,
    DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_INFERIDO,
  ])

  return [...groups.values()].reduce((errors, items) => {
    const rows = items.map((item) => item.row)
    if (!rows.some(requiresMesa)) return errors

    const resolution = resolveDocenteMateriaAssignment({
      plan: rows[0],
      assignments: rows,
      teacherNameToId,
    })

    if (!allowedStatuses.has(resolution.status)) {
      errors.push({
        code: 'SIN_TITULAR_VIGENTE_POST_REVISION',
        carrera: clean(rows[0].carrera),
        anio: clean(rows[0].anio),
        materia_codigo: clean(rows[0].materia_codigo),
        materia_nombre: clean(rows[0].materia_nombre),
        status: resolution.status,
      })
    }

    return errors
  }, [])
}

function buildSummary({
  candidateRows,
  reviewRows,
  correctedRows,
  appliedReviewItems,
  pendingReviewItems,
  errors,
  warnings,
  counters,
  parsed,
  assignmentErrors,
}) {
  const readyForImpactComparison =
    pendingReviewItems.length === 0 &&
    errors.length === 0 &&
    parsed.errors.length === 0 &&
    assignmentErrors.length === 0

  return {
    candidateRows: candidateRows.length,
    reviewRows: reviewRows.length,
    correctedRows: correctedRows.length,
    appliedReviewItems: appliedReviewItems.length,
    pendingReviewItems: pendingReviewItems.length,
    errors: errors.length + parsed.errors.length + assignmentErrors.length,
    warnings: warnings.length + parsed.warnings.length,
    titularesConfirmados: counters.titularesConfirmados,
    coDocentesAsignados: counters.coDocentesAsignados,
    auxiliaresAsignados: counters.auxiliaresAsignados,
    horariosHuerfanosPendientes: pendingReviewItems
      .filter((item) => item.tipo_revision === 'HORARIO_HUERFANO').length,
    parserErrors: parsed.errors.length,
    parserWarnings: parsed.warnings.length,
    assignmentErrors: assignmentErrors.length,
    readyForImpactComparison,
  }
}

export function applyDocenteMateriaReview({
  candidateRows,
  reviewRows,
  options = {},
} = {}) {
  const sourceCandidateRows = asArray(candidateRows).map((row) => ({ ...row }))
  const sourceReviewRows = asArray(reviewRows).map((row) => ({ ...row }))
  const correctedRows = sourceCandidateRows.map((row) => ({ ...row }))
  const candidateGroups = buildCandidateGroups(sourceCandidateRows)
  const reviewGroups = buildReviewGroups(sourceReviewRows)
  const appliedReviewItems = []
  const pendingReviewItems = []
  const warnings = []
  const errors = []
  const counters = {
    titularesConfirmados: 0,
    coDocentesAsignados: 0,
    auxiliaresAsignados: 0,
  }

  collectReviewRowsRequiringDecision(sourceReviewRows).forEach((review) => {
    const type = normalizeReviewType(review.tipo_revision)

    if (type === 'HORARIO_HUERFANO') {
      pendingReviewItems.push(safeReviewItem(review, 'HORARIO_HUERFANO_PENDIENTE_PLANTILLA'))
      if (clean(review.titular_a_confirmar) || clean(review.observaciones_revision)) {
        warnings.push({
          code: 'HORARIO_HUERFANO_NO_APLICADO',
          review_id: clean(review.review_id),
          message: 'Los horarios huerfanos se registran como pendiente externo y no se aplican automaticamente.',
        })
      }
      return
    }

    if (!REVIEW_TYPES_WITH_TITULAR.has(type)) return

    const key = subjectKey(review)
    const candidateItems = candidateGroups.get(key) ?? []

    if (!candidateItems.length) {
      errors.push({
        code: 'REVISION_SIN_FILAS_CANDIDATAS',
        review_id: clean(review.review_id),
        tipo_revision: type,
        message: 'La fila de revision no coincide con materias candidatas.',
      })
      return
    }

    applyTitularReview({
      correctedRows,
      candidateItems,
      review,
      appliedReviewItems,
      pendingReviewItems,
      errors,
      counters,
    })
  })

  sourceCandidateRows.forEach((row) => {
    if (!hasReviewFlag(row)) return
    const reviewsForSubject = reviewGroups.get(subjectKey(row)) ?? []
    const hasRelevantReview = reviewsForSubject.some((review) => (
      REVIEW_TYPES_WITH_TITULAR.has(normalizeReviewType(review.tipo_revision))
    ))

    if (!hasRelevantReview) {
      pendingReviewItems.push({
        carrera: clean(row.carrera),
        anio: clean(row.anio),
        materia_codigo: clean(row.materia_codigo),
        materia_nombre: clean(row.materia_nombre),
        tipo_revision: normalizeReviewType(row.motivo_revision),
        reason: 'SIN_FILA_REVIEW',
      })
    }
  })

  const parsed = parseDocenteMateriaRows(correctedRows, {
    allowEmptyDocenteWhenNoRequiereMesa: true,
    source: options.source ?? 'docente_materia_corrected',
  })
  const assignmentErrors = validateAssignments(parsed.rows)
  const summary = buildSummary({
    candidateRows: sourceCandidateRows,
    reviewRows: sourceReviewRows,
    correctedRows,
    appliedReviewItems,
    pendingReviewItems,
    errors,
    warnings,
    counters,
    parsed,
    assignmentErrors,
  })

  return {
    correctedRows,
    pendingReviewItems,
    appliedReviewItems,
    summary,
    warnings: [
      ...warnings,
      ...parsed.warnings.map((warning) => ({
        code: warning.code,
        rowNumber: warning.rowNumber,
        field: warning.field,
        message: warning.message,
      })),
    ],
    errors: [
      ...errors,
      ...parsed.errors.map((error) => ({
        code: error.code,
        rowNumber: error.rowNumber,
        field: error.field,
        message: error.message,
      })),
      ...assignmentErrors,
    ],
  }
}
