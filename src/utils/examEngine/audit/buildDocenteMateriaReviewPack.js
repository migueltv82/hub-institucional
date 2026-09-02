export const DOCENTE_MATERIA_REVIEW_COLUMNS = [
  'review_id',
  'carrera',
  'anio',
  'materia_codigo',
  'materia_nombre',
  'tipo_revision',
  'motivo_revision',
  'cantidad_docentes_detectados',
  'docentes_detectados',
  'roles_detectados',
  'requiere_mesa',
  'recomendacion',
  'titular_a_confirmar',
  'accion_sugerida',
  'observaciones_revision',
]

const REVIEW_TYPES = new Set([
  'MULTIDOCENTE_NO_PRACTICA',
  'PRACTICA_PROFESIONAL_MULTIDOCENTE',
  'HORARIO_HUERFANO',
  'SIN_TITULAR_VIGENTE',
  'AMBIGUO_REQUIERE_REVISION',
  'OTRO',
])

const REVIEW_TYPE_PRIORITY = [
  'SIN_TITULAR_VIGENTE',
  'AMBIGUO_REQUIERE_REVISION',
  'MULTIDOCENTE_NO_PRACTICA',
  'PRACTICA_PROFESIONAL_MULTIDOCENTE',
  'HORARIO_HUERFANO',
  'OTRO',
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
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

function simpleHash(value) {
  const text = clean(value)
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36).padStart(8, '0').slice(0, 8)
}

function uniqueValues(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function subjectKey(row = {}) {
  return [
    normalizeToken(row.carrera),
    normalizeToken(row.anio),
    normalizeToken(row.materia_codigo),
    normalizeToken(row.materia_nombre),
  ].join('::')
}

function normalizeReviewType(value) {
  const type = clean(value).toUpperCase()
  return REVIEW_TYPES.has(type) ? type : 'OTRO'
}

function rowRequiresReview(row = {}) {
  const requiresReview = clean(row.requiere_revision).toUpperCase()
  const reason = normalizeReviewType(row.motivo_revision)
  return requiresReview === 'SI' || (
    reason !== 'OTRO' &&
    reason !== 'HORARIO_HUERFANO'
  )
}

function pickReviewType(rows = []) {
  const types = new Set(rows.map((row) => normalizeReviewType(row.motivo_revision)))
  return REVIEW_TYPE_PRIORITY.find((type) => types.has(type)) ?? 'OTRO'
}

function recommendationForType(type) {
  const recommendations = {
    MULTIDOCENTE_NO_PRACTICA:
      'Definir un unico TITULAR para la mesa. Los demas docentes deben quedar como CO_DOCENTE/AUXILIAR o no participar como titular.',
    PRACTICA_PROFESIONAL_MULTIDOCENTE:
      'Definir que docente actuara como TITULAR de mesa. Los demas pueden quedar como CO_DOCENTE/AUXILIAR si corresponde.',
    HORARIO_HUERFANO:
      'Revisar si el nombre de materia/carrera coincide con el plan de estudios o si el horario fue cargado con un nombre no normalizado.',
    SIN_TITULAR_VIGENTE:
      'Cargar TITULAR activo o REEMPLAZO activo vigente.',
    AMBIGUO_REQUIERE_REVISION:
      'Resolver la ambiguedad institucional y dejar un unico TITULAR vigente para mesa.',
    OTRO:
      'Revisar manualmente la asignacion docente_materia antes de usarla como fuente institucional.',
  }
  return recommendations[type] ?? recommendations.OTRO
}

function actionForType(type) {
  const actions = {
    MULTIDOCENTE_NO_PRACTICA: 'COMPLETAR_TITULAR_UNICO',
    PRACTICA_PROFESIONAL_MULTIDOCENTE: 'CONFIRMAR_TITULAR_DE_MESA',
    HORARIO_HUERFANO: 'NORMALIZAR_PLAN_HORARIO',
    SIN_TITULAR_VIGENTE: 'CARGAR_TITULAR_O_REEMPLAZO_ACTIVO',
    AMBIGUO_REQUIERE_REVISION: 'RESOLVER_AMBIGUEDAD',
    OTRO: 'REVISAR_MANUALMENTE',
  }
  return actions[type] ?? actions.OTRO
}

function buildReviewId(prefix, ...values) {
  return `${prefix}-${simpleHash(values.join('::'))}`
}

function buildGroupedItem(rows = []) {
  const first = rows[0] ?? {}
  const tipoRevision = pickReviewType(rows)
  const docentes = uniqueValues(rows.map((row) => row.docente))
  const roles = uniqueValues(rows.map((row) => clean(row.rol_en_materia) || 'SIN_ROL'))
  const motivos = uniqueValues(rows.map((row) => clean(row.motivo_revision) || tipoRevision))

  return {
    review_id: buildReviewId(
      'review',
      first.carrera,
      first.anio,
      first.materia_codigo,
      first.materia_nombre,
      tipoRevision,
    ),
    carrera: clean(first.carrera),
    anio: clean(first.anio),
    materia_codigo: clean(first.materia_codigo),
    materia_nombre: clean(first.materia_nombre),
    tipo_revision: tipoRevision,
    motivo_revision: motivos.join(' | '),
    cantidad_docentes_detectados: docentes.length,
    docentes_detectados: docentes.join(' | '),
    roles_detectados: roles.join(' | '),
    requiere_mesa: clean(first.requiere_mesa) || 'SI',
    recomendacion: recommendationForType(tipoRevision),
    titular_a_confirmar: '',
    accion_sugerida: actionForType(tipoRevision),
    observaciones_revision: '',
    sourceRowsCount: rows.length,
    candidateRows: rows,
  }
}

function buildOrphanItem(orphan = {}, index = 0) {
  const tipoRevision = 'HORARIO_HUERFANO'
  const carrera = clean(orphan.carrera)
  const materiaNombre = clean(orphan.materia)

  return {
    review_id: buildReviewId('orphan', orphan.rowNumber ?? index + 1, carrera, materiaNombre),
    carrera,
    anio: '',
    materia_codigo: '',
    materia_nombre: materiaNombre,
    tipo_revision: tipoRevision,
    motivo_revision: 'HORARIO_HUERFANO',
    cantidad_docentes_detectados: clean(orphan.docenteAnonId) ? 1 : 0,
    docentes_detectados: clean(orphan.docenteAnonId),
    roles_detectados: 'SIN_ROL',
    requiere_mesa: '',
    recomendacion: recommendationForType(tipoRevision),
    titular_a_confirmar: '',
    accion_sugerida: actionForType(tipoRevision),
    observaciones_revision: '',
    sourceRowsCount: 1,
    orphanHorario: orphan,
  }
}

function toReviewRow(item = {}) {
  return DOCENTE_MATERIA_REVIEW_COLUMNS.reduce((row, column) => {
    row[column] = item[column] ?? ''
    return row
  }, {})
}

function countByType(items = [], type) {
  return items.filter((item) => item.tipo_revision === type).length
}

function impactMetric(impactReport = {}, field) {
  return impactReport[field] ??
    impactReport.summary?.[field] ??
    impactReport.withDocenteMateria?.[field] ??
    impactReport.interpretation?.beforeAfter?.[field]?.after
}

function buildSummary({ candidateRows, candidateRowsRequiringReview, groupedItems, orphanItems, impactReport }) {
  const allItems = [...groupedItems, ...orphanItems]

  return {
    candidateRows: candidateRows.length,
    candidateRowsRequiringReview: candidateRowsRequiringReview.length,
    uniqueSubjectsRequiringReview: groupedItems.length,
    reviewRowsGenerated: allItems.length,
    multidocenteNoPractica: countByType(allItems, 'MULTIDOCENTE_NO_PRACTICA'),
    practicasProfesionalesMultidocente: countByType(allItems, 'PRACTICA_PROFESIONAL_MULTIDOCENTE'),
    horariosHuerfanos: countByType(allItems, 'HORARIO_HUERFANO'),
    sinTitularVigente: countByType(allItems, 'SIN_TITULAR_VIGENTE'),
    ambiguos: countByType(allItems, 'AMBIGUO_REQUIERE_REVISION'),
    other: countByType(allItems, 'OTRO'),
    impactCompletionRateWithoutDocenteMateria:
      impactReport.withoutDocenteMateria?.completionRate ?? impactMetric(impactReport, 'impactCompletionRateWithoutDocenteMateria') ?? null,
    impactCompletionRateWithDocenteMateria:
      impactReport.withDocenteMateria?.completionRate ?? impactMetric(impactReport, 'impactCompletionRateWithDocenteMateria') ?? null,
    impactTitularesInferidosBefore:
      impactReport.withoutDocenteMateria?.titularesInferidos ??
      impactReport.interpretation?.beforeAfter?.titularesInferidos?.before ??
      null,
    impactTitularesInferidosAfter:
      impactReport.withDocenteMateria?.titularesInferidos ??
      impactReport.interpretation?.beforeAfter?.titularesInferidos?.after ??
      null,
    impactTitularesExplicitosAfter:
      impactReport.withDocenteMateria?.titularesExplicitos ?? null,
  }
}

function buildWarnings({ candidateRows, impactReport }) {
  const warnings = []
  if (!candidateRows.length) {
    warnings.push({
      code: 'SIN_FILAS_CANDIDATAS',
      message: 'No hay filas candidatas para revisar.',
    })
  }
  if (!impactReport || typeof impactReport !== 'object') {
    warnings.push({
      code: 'SIN_REPORTE_IMPACTO',
      message: 'No se recibio reporte de impacto para completar metricas comparativas.',
    })
  }
  return warnings
}

export function buildDocenteMateriaReviewPack({
  candidateRows,
  impactReport,
  orphanHorarios = [],
  options = {},
} = {}) {
  const sourceRows = asArray(candidateRows).map((row) => ({ ...row }))
  const rowsRequiringReview = sourceRows.filter(rowRequiresReview)
  const groups = rowsRequiringReview.reduce((map, row) => {
    const key = subjectKey(row)
    const rows = map.get(key) ?? []
    rows.push(row)
    map.set(key, rows)
    return map
  }, new Map())
  const groupedReviewItems = [...groups.values()]
    .map(buildGroupedItem)
    .sort((left, right) => (
      normalizeText(left.carrera).localeCompare(normalizeText(right.carrera)) ||
      clean(left.anio).localeCompare(clean(right.anio), 'es', { numeric: true }) ||
      normalizeText(left.materia_nombre).localeCompare(normalizeText(right.materia_nombre))
    ))
  const orphanItems = asArray(orphanHorarios).map(buildOrphanItem)
  const allItems = [...groupedReviewItems, ...orphanItems]
  const reviewRows = allItems.map(toReviewRow)
  const summary = buildSummary({
    candidateRows: sourceRows,
    candidateRowsRequiringReview: rowsRequiringReview,
    groupedItems: groupedReviewItems,
    orphanItems,
    impactReport: impactReport ?? {},
  })
  const warnings = buildWarnings({ candidateRows: sourceRows, impactReport })
  const errors = []

  return {
    reviewRows,
    groupedReviewItems: options.includeOrphanItemsInGroupedReviewItems === false
      ? groupedReviewItems
      : allItems,
    summary,
    warnings,
    errors,
  }
}
