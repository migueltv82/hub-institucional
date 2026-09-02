export const V2_SUBJECT_IDENTITY_WORKPACK_CAREERS = Object.freeze([
  'ING',
  'GEO',
  'QUI',
  'LAB',
  'TUR',
  'TRA',
  'UNKNOWN',
])

export const V2_SUBJECT_IDENTITY_WORKPACK_COLUMNS = Object.freeze([
  'prioridad',
  'review_id',
  'carrera',
  'carrera_id_sugerido',
  'carrera_id_final',
  'anio',
  'materia_nombre',
  'plan_id_sugerido',
  'plan_id_final',
  'materia_codigo_sugerido',
  'materia_codigo_final',
  'estado_revision',
  'riesgo_nombre_duplicado',
  'motivo_revision',
  'accion_requerida',
  'observaciones_revision',
])

const CONFIRMATION_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])
const CAREER_ID_RULES = Object.freeze([
  { id: 'ING', tokens: ['profesorado', 'ingles'] },
  { id: 'GEO', tokens: ['profesorado', 'geografia'] },
  { id: 'QUI', tokens: ['profesorado', 'quimica'] },
  { id: 'LAB', tokens: ['laboratorio'] },
  { id: 'TUR', tokens: ['turismo'] },
  { id: 'TRA', tokens: ['traduccion'] },
  { id: 'TRA', tokens: ['traductorado'] },
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

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function isYes(value) {
  const token = normalizeToken(value)
  return token === 'si' || token === 'true' || token === '1'
}

function normalizeStatus(value) {
  return clean(value).toUpperCase()
}

function inferCareerId(carrera = '') {
  const normalized = normalizeText(carrera)
  const rule = CAREER_ID_RULES.find((candidate) => (
    candidate.tokens.every((token) => normalized.includes(token))
  ))
  return rule?.id ?? ''
}

function readFinalField(row = {}, key) {
  return clean(row[key])
}

function hasAlternative(value) {
  return clean(value).includes('|')
}

function buildReviewIndex(reviewRows = []) {
  return asArray(reviewRows).reduce((map, row) => {
    const reviewId = clean(row?.review_id)
    if (reviewId) map.set(reviewId, row)
    return map
  }, new Map())
}

function mergeRows(pendingRows = [], reviewRows = []) {
  const reviewById = buildReviewIndex(reviewRows)

  return asArray(pendingRows).map((pendingRow) => {
    const reviewId = clean(pendingRow?.review_id)
    return {
      ...(reviewById.get(reviewId) ?? {}),
      ...pendingRow,
    }
  })
}

function isHomonymyRisk(row = {}) {
  return (
    isYes(row.riesgo_nombre_duplicado) ||
    clean(row.motivo_revision).includes('DUPLICATE_SUBJECT_NAME') ||
    clean(row.pendiente_motivo).includes('HOMONIMIA_REQUIERE_REVISION')
  )
}

function classifyPriority({ row, careerId, homonymyRisk }) {
  if (homonymyRisk) return 'ALTA'
  if (!careerId) return 'ALTA'
  if (hasAlternative(row.plan_id_sugerido)) return 'ALTA'

  const status = normalizeStatus(row.estado_revision)
  const hasAllFinalValues = Boolean(
    readFinalField(row, 'carrera_id_final') &&
    readFinalField(row, 'plan_id_final') &&
    readFinalField(row, 'materia_codigo_final'),
  )

  if (!hasAllFinalValues) return 'MEDIA'
  if (!CONFIRMATION_STATUSES.has(status)) return 'BAJA'
  return 'BAJA'
}

function buildWorkpackRow(row = {}) {
  const suggestedCareerId = clean(row.carrera_id_sugerido) || inferCareerId(row.carrera)
  const careerId = V2_SUBJECT_IDENTITY_WORKPACK_CAREERS.includes(suggestedCareerId)
    ? suggestedCareerId
    : 'UNKNOWN'
  const homonymyRisk = isHomonymyRisk(row)
  const priority = classifyPriority({
    row,
    careerId: careerId === 'UNKNOWN' ? '' : careerId,
    homonymyRisk,
  })
  const motivoRevision = clean(row.motivo_revision) || clean(row.pendiente_motivo)

  return {
    prioridad: priority,
    review_id: clean(row.review_id),
    carrera: clean(row.carrera),
    carrera_id_sugerido: careerId === 'UNKNOWN' ? '' : careerId,
    carrera_id_final: readFinalField(row, 'carrera_id_final'),
    anio: clean(row.anio),
    materia_nombre: clean(row.materia_nombre),
    plan_id_sugerido: clean(row.plan_id_sugerido),
    plan_id_final: readFinalField(row, 'plan_id_final'),
    materia_codigo_sugerido: clean(row.materia_codigo_sugerido),
    materia_codigo_final: readFinalField(row, 'materia_codigo_final'),
    estado_revision: normalizeStatus(row.estado_revision),
    riesgo_nombre_duplicado: homonymyRisk ? 'SI' : clean(row.riesgo_nombre_duplicado) || 'NO',
    motivo_revision: motivoRevision,
    accion_requerida: clean(row.accion_requerida) || 'COMPLETAR_IDENTIDAD_V2_OFICIAL',
    observaciones_revision: clean(row.observaciones_revision),
  }
}

function emptyRowsByCareer() {
  return V2_SUBJECT_IDENTITY_WORKPACK_CAREERS.reduce((groups, careerId) => {
    groups[careerId] = []
    return groups
  }, {})
}

function countByCareer(rowsByCareer = {}) {
  return V2_SUBJECT_IDENTITY_WORKPACK_CAREERS.reduce((counts, careerId) => {
    counts[careerId] = asArray(rowsByCareer[careerId]).length
    return counts
  }, {})
}

function buildSummary({ rowsByCareer, rows, priorityRows, homonymyRows, summary }) {
  const totalRows = rows.length
  const summarySource = summary?.summary && typeof summary.summary === 'object'
    ? summary.summary
    : summary

  return {
    totalRows,
    sourcePendingRows: Number(summarySource?.pendingRows ?? totalRows) || totalRows,
    rowsByCareer: countByCareer(rowsByCareer),
    highPriorityRows: priorityRows.length,
    homonymyRows: homonymyRows.length,
    unknownCareerRows: asArray(rowsByCareer.UNKNOWN).length,
    readyForInstitutionalEditing: totalRows > 0,
    readyForCompactFinalTableComparison: summarySource?.readyForCompactFinalTableComparison === true,
    safeToReplaceLegacy: false,
    nextAction: totalRows > 0
      ? 'Completar campos finales oficiales y volver a ejecutar applyV2SubjectIdentityReview.mjs.'
      : 'No hay pendientes para organizar en el paquete institucional.',
  }
}

function buildInstructions() {
  return [
    '# Paquete de carga institucional - identidad v2 de materias',
    '',
    'Este paquete organiza las materias pendientes para completar la identidad v2 requerida por el examEngine.',
    '',
    '## Columnas finales a completar',
    '',
    '- `carrera_id_final`: identificador oficial corto de la carrera. Ejemplos esperados: `ING`, `GEO`, `QUI`, `LAB`, `TUR`, `TRA`.',
    '- `plan_id_final`: identificador oficial del plan de estudios. Debe distinguir planes que conviven, por ejemplo `LAB-2015` y `LAB-2024`.',
    '- `materia_codigo_final`: codigo oficial y estable de la materia dentro del plan.',
    '- `estado_revision`: estado de la revision institucional de esa fila.',
    '',
    '## Estados validos',
    '',
    'Usar solo uno de estos valores en `estado_revision`:',
    '',
    '- `CONFIRMADO`',
    '- `APROBADO`',
    '- `VALIDADO`',
    '- `OK`',
    '- `PENDIENTE`',
    '- `RECHAZADO`',
    '',
    '## Advertencias importantes',
    '',
    '- Las columnas `*_sugerido` son orientativas y no son oficiales.',
    '- No copiar automaticamente sugerencias a las columnas finales sin revision institucional.',
    '- No usar `PLAN-ACTUAL`, `SUGERIDO`, `PENDIENTE`, `REVISAR` como valores finales.',
    '- No dejar alternativas con `|` en campos finales. Elegir un valor oficial unico.',
    '- Priorizar `01_prioridad_alta.csv` y `02_homonimias.csv` antes de completar el resto.',
    '',
    '## Luego de completar',
    '',
    '1. Guardar los cambios en `local-audit/v2_subject_identity_review.csv` o trasladar los valores finales a ese archivo.',
    '2. Ejecutar `node scripts/examEngineAudit/applyV2SubjectIdentityReview.mjs`.',
    '3. Revisar `local-audit/v2_subject_identity.validation.summary.json`.',
    '4. No usar estos archivos para reemplazar la generacion oficial sin una comparacion posterior.',
    '',
  ].join('\n')
}

export function buildV2SubjectIdentityWorkpack({
  pendingRows,
  reviewRows,
  summary,
  options = {},
} = {}) {
  const safePendingRows = cloneJson(asArray(pendingRows))
  const safeReviewRows = cloneJson(asArray(reviewRows))
  const safeSummary = summary && typeof summary === 'object' ? cloneJson(summary) : {}
  const mergedRows = mergeRows(safePendingRows, safeReviewRows)
  const rows = mergedRows.map(buildWorkpackRow)
  const rowsByCareer = rows.reduce((groups, row) => {
    const careerId = row.carrera_id_sugerido || 'UNKNOWN'
    groups[careerId].push(row)
    return groups
  }, emptyRowsByCareer())
  const priorityRows = rows.filter((row) => row.prioridad === 'ALTA')
  const homonymyRows = rows.filter((row) => row.riesgo_nombre_duplicado === 'SI')
  const workpackSummary = buildSummary({
    rowsByCareer,
    rows,
    priorityRows,
    homonymyRows,
    summary: safeSummary,
  })

  return {
    rowsByCareer: options.includeRows === false ? emptyRowsByCareer() : rowsByCareer,
    priorityRows: options.includeRows === false ? [] : priorityRows,
    homonymyRows: options.includeRows === false ? [] : homonymyRows,
    workpackSummary,
    instructions: buildInstructions(),
    warnings: [],
    errors: [],
  }
}
