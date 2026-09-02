const EDITABLE_WORKPACK_FILES = new Set([
  'ING_revision.csv',
  'GEO_revision.csv',
  'QUI_revision.csv',
  'LAB_revision.csv',
  'TUR_revision.csv',
  'TRA_revision.csv',
  'UNKNOWN_revision.csv',
])

const FINAL_FIELD_ALIASES = Object.freeze({
  carrera_id_final: ['carrera_id_final', 'carrera_id_confirmado'],
  plan_id_final: ['plan_id_final', 'plan_id_confirmado'],
  materia_codigo_final: ['materia_codigo_final', 'materia_codigo_confirmado'],
  estado_revision: ['estado_revision', 'revision_status', 'estado', 'validado'],
  observaciones_revision: ['observaciones_revision'],
})

const FINAL_FIELDS = Object.freeze([
  'carrera_id_final',
  'plan_id_final',
  'materia_codigo_final',
  'estado_revision',
  'observaciones_revision',
])

const REQUIRED_VALIDATION_FIELDS = Object.freeze([
  'carrera_id_final',
  'plan_id_final',
  'materia_codigo_final',
  'estado_revision',
])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeFieldName(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function baseName(value = '') {
  return clean(value).split(/[\\/]/).pop()
}

function normalizeWorkpackFiles(workpackFiles = []) {
  if (Array.isArray(workpackFiles)) {
    return workpackFiles.map((file) => ({
      fileName: clean(file?.fileName ?? file?.name ?? file?.path),
      rows: cloneJson(asArray(file?.rows)),
    }))
  }

  if (workpackFiles && typeof workpackFiles === 'object') {
    return Object.entries(workpackFiles).map(([fileName, rows]) => ({
      fileName,
      rows: cloneJson(asArray(rows)),
    }))
  }

  return []
}

function readAliasedField(row = {}, canonicalField) {
  const aliases = FINAL_FIELD_ALIASES[canonicalField] ?? [canonicalField]

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && clean(row[alias])) {
      return clean(row[alias])
    }
  }

  const wanted = new Set(aliases.map(normalizeFieldName))
  const entry = Object.entries(row).find(([field, value]) => (
    wanted.has(normalizeFieldName(field)) && clean(value)
  ))

  return clean(entry?.[1])
}

function extractEditableFields(row = {}) {
  return FINAL_FIELDS.reduce((fields, field) => {
    fields[field] = readAliasedField(row, field)
    return fields
  }, {})
}

function buildOriginalIndex(rows = []) {
  return asArray(rows).reduce((map, row) => {
    const reviewId = clean(row?.review_id)
    if (reviewId) map.set(reviewId, row)
    return map
  }, new Map())
}

function buildEditableRows(workpackFiles = []) {
  const editableRows = []
  const skippedRows = []

  normalizeWorkpackFiles(workpackFiles).forEach((file) => {
    const fileName = baseName(file.fileName)
    const editable = EDITABLE_WORKPACK_FILES.has(fileName)

    asArray(file.rows).forEach((row, rowIndex) => {
      const reviewId = clean(row?.review_id)

      if (!editable) {
        skippedRows.push({
          fileName,
          rowIndex,
          review_id: reviewId,
          reason: 'IGNORED_NON_EDITABLE_FILE',
        })
        return
      }

      if (!reviewId) {
        skippedRows.push({
          fileName,
          rowIndex,
          review_id: '',
          reason: 'MISSING_REVIEW_ID',
        })
        return
      }

      editableRows.push({
        fileName,
        rowIndex,
        review_id: reviewId,
        row,
      })
    })
  })

  return { editableRows, skippedRows }
}

function groupByReviewId(editableRows = []) {
  return editableRows.reduce((map, item) => {
    const rows = map.get(item.review_id) ?? []
    rows.push(item)
    map.set(item.review_id, rows)
    return map
  }, new Map())
}

function buildDuplicateItems(groupedEditableRows = new Map()) {
  return [...groupedEditableRows.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([reviewId, rows]) => ({
      review_id: reviewId,
      count: rows.length,
      files: [...new Set(rows.map((row) => row.fileName).filter(Boolean))],
    }))
}

function diffMergedRow(original = {}, merged = {}) {
  return FINAL_FIELDS.filter((field) => readAliasedField(original, field) !== clean(merged[field]))
}

function isReadyForValidation(row = {}) {
  return REQUIRED_VALIDATION_FIELDS.every((field) => clean(row[field]))
}

function changedRowItem(merged = {}, changedFields = []) {
  return {
    review_id: clean(merged.review_id),
    carrera: clean(merged.carrera),
    materia_nombre: clean(merged.materia_nombre),
    changedFields,
    readyForValidation: isReadyForValidation(merged),
  }
}

function buildMergedRows({ originalRows, groupedEditableRows }) {
  const changedRows = []
  const unchangedRows = []

  const mergedRows = originalRows.map((original) => {
    const reviewId = clean(original.review_id)
    const editable = groupedEditableRows.get(reviewId)?.[0]?.row
    const editableFields = editable ? extractEditableFields(editable) : {}
    const merged = {
      ...original,
    }

    FINAL_FIELDS.forEach((field) => {
      merged[field] = editable ? editableFields[field] : readAliasedField(original, field)
    })

    const changedFields = diffMergedRow(original, merged)
    const item = changedRowItem(merged, changedFields)

    if (changedFields.length) changedRows.push(item)
    else unchangedRows.push(item)

    return merged
  })

  return {
    mergedRows,
    changedRows,
    unchangedRows,
  }
}

function countRows(rows = [], predicate) {
  return rows.filter(predicate).length
}

function buildSummary({
  originalRows,
  mergedRows,
  editableRows,
  changedRows,
  unchangedRows,
  duplicateReviewIds,
  missingReviewIds,
  unexpectedReviewIds,
}) {
  const readyForApply = (
    originalRows.length === mergedRows.length &&
    duplicateReviewIds.length === 0 &&
    missingReviewIds.length === 0 &&
    unexpectedReviewIds.length === 0
  )

  return {
    totalOriginalRows: originalRows.length,
    totalEditableRows: editableRows.length,
    totalMergedRows: mergedRows.length,
    changedRows: changedRows.length,
    unchangedRows: unchangedRows.length,
    changedFinalFieldRows: countRows(
      changedRows,
      (row) => row.changedFields.some((field) => [
        'carrera_id_final',
        'plan_id_final',
        'materia_codigo_final',
      ].includes(field)),
    ),
    changedStatusRows: countRows(changedRows, (row) => row.changedFields.includes('estado_revision')),
    changedObservationRows: countRows(changedRows, (row) => row.changedFields.includes('observaciones_revision')),
    duplicateReviewIds,
    missingReviewIds,
    unexpectedReviewIds,
    readyForApply,
    safeToReplaceLegacy: false,
    nextAction: readyForApply
      ? 'Ejecutar applyV2SubjectIdentityReview con el consolidado mergeado.'
      : 'Corregir duplicados, faltantes o review_id inesperados en los CSV por carrera antes de aplicar.',
  }
}

export function mergeV2SubjectIdentityWorkpack({
  workpackFiles,
  originalReviewRows,
  options = {},
} = {}) {
  const safeOriginalRows = cloneJson(asArray(originalReviewRows))
  const originalById = buildOriginalIndex(safeOriginalRows)
  const { editableRows, skippedRows } = buildEditableRows(workpackFiles)
  const groupedEditableRows = groupByReviewId(editableRows)
  const duplicateReviewIds = buildDuplicateItems(groupedEditableRows)
  const editableReviewIds = new Set(editableRows.map((row) => row.review_id))
  const originalReviewIds = new Set(safeOriginalRows.map((row) => clean(row.review_id)).filter(Boolean))
  const missingReviewIds = [...originalReviewIds].filter((reviewId) => !editableReviewIds.has(reviewId))
  const unexpectedReviewIds = [...editableReviewIds].filter((reviewId) => !originalById.has(reviewId))
  const { mergedRows, changedRows, unchangedRows } = buildMergedRows({
    originalRows: safeOriginalRows,
    groupedEditableRows,
  })
  const summary = buildSummary({
    originalRows: safeOriginalRows,
    mergedRows,
    editableRows,
    changedRows,
    unchangedRows,
    duplicateReviewIds,
    missingReviewIds,
    unexpectedReviewIds,
  })

  return {
    mergedRows: options.includeRows === false ? [] : mergedRows,
    skippedRows,
    duplicateReviewIds,
    missingReviewIds,
    unexpectedReviewIds,
    changedRows: options.includeRows === false ? [] : changedRows,
    unchangedRows: options.includeRows === false ? [] : unchangedRows,
    summary,
    warnings: [],
    errors: [],
  }
}
