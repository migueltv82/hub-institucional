export const V2_PLAN_CATALOG_DRAFT_STATUS = 'PRECONFIRMAR'
export const V2_PLAN_CATALOG_DRAFT_OBSERVATION = (
  'Precarga asistida: revisar y confirmar institucionalmente.'
)

const DRAFT_PLAN_IDS_BY_CAREER = Object.freeze({
  ING: 'ING-2026',
  GEO: 'GEO-2026',
  QUI: 'QUI-2026',
  TUR: 'TUR-2026',
  TRA: 'TRA-2026',
})

const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])

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

function normalizeCareerId(value) {
  return clean(value).toUpperCase()
}

function normalizeStatus(value) {
  return clean(value).toUpperCase()
}

function requiredSubjects(row = {}) {
  return Number(row.materias_requeridas ?? row.requiredSubjects ?? 0) || 0
}

function isConfirmedStatus(value) {
  return CONFIRMED_STATUSES.has(normalizeStatus(value))
}

function hasExistingFinalPlan(row = {}) {
  return Boolean(clean(row.plan_id_final))
}

function draftPlanIdFor(row = {}) {
  return DRAFT_PLAN_IDS_BY_CAREER[normalizeCareerId(row.carrera_id)] ?? ''
}

function buildPrefilledRow(row = {}, draftPlanId) {
  return {
    ...row,
    plan_id_final: draftPlanId,
    anio_plan: clean(row.anio_plan) || '2026',
    estado_revision: V2_PLAN_CATALOG_DRAFT_STATUS,
    observaciones_revision: V2_PLAN_CATALOG_DRAFT_OBSERVATION,
  }
}

function buildSkippedRow(row = {}, reason) {
  return {
    ...row,
    prefill_skip_reason: reason,
  }
}

function buildSummary({ sourceRows, prefilledRows, skippedRows }) {
  const rowsWithSubjects = sourceRows.filter((row) => requiredSubjects(row) > 0)
  const rowsWithoutSubjects = sourceRows.filter((row) => requiredSubjects(row) <= 0)
  const outputRows = [...prefilledRows, ...skippedRows]

  return {
    totalRows: sourceRows.length,
    prefilledRows: prefilledRows.length,
    skippedRows: skippedRows.length,
    careersWithSubjects: rowsWithSubjects.length,
    careersWithoutSubjects: rowsWithoutSubjects.length,
    preconfirmarRows: outputRows.filter((row) => normalizeStatus(row.estado_revision) === V2_PLAN_CATALOG_DRAFT_STATUS).length,
    confirmedRows: outputRows.filter((row) => isConfirmedStatus(row.estado_revision)).length,
    readyForPlanApply: false,
    safeToReplaceLegacy: false,
    nextAction: (
      'Revisar manualmente los plan_id_final precargados, cambiar PRECONFIRMAR a CONFIRMADO solo tras validacion institucional y luego aplicar el catalogo al workpack.'
    ),
  }
}

export function prefillV2PlanCatalogDraft({
  planRows,
  options = {},
} = {}) {
  const safeRows = cloneJson(asArray(planRows))
  const overwrite = options.overwrite === true
  const prefilledRows = []
  const skippedRows = []

  safeRows.forEach((row) => {
    const subjects = requiredSubjects(row)
    const draftPlanId = draftPlanIdFor(row)

    if (subjects <= 0) {
      skippedRows.push(buildSkippedRow(row, 'SIN_MATERIAS_REQUERIDAS'))
      return
    }
    if (!draftPlanId) {
      skippedRows.push(buildSkippedRow(row, 'SIN_PLAN_DRAFT_PARA_CARRERA'))
      return
    }
    if (hasExistingFinalPlan(row) && !overwrite) {
      skippedRows.push(buildSkippedRow(row, 'PLAN_ID_FINAL_EXISTENTE'))
      return
    }

    prefilledRows.push(buildPrefilledRow(row, draftPlanId))
  })

  const summary = buildSummary({
    sourceRows: safeRows,
    prefilledRows,
    skippedRows,
  })

  return {
    prefilledRows: options.includeRows === false ? [] : prefilledRows,
    skippedRows: options.includeRows === false ? [] : skippedRows,
    summary,
    warnings: [],
    errors: [],
  }
}
