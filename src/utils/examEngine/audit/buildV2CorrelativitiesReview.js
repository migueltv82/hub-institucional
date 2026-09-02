const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])
const CAREER_ID_ORDER = ['ING', 'GEO', 'QUI', 'LAB', 'TUR', 'TRA', 'UNKNOWN']

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

const COMBINING_DIACRITICS_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g')

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(COMBINING_DIACRITICS_PATTERN, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeStatus(value) {
  return clean(value).toUpperCase()
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function isConfirmedCode(row = {}) {
  return Boolean(
    clean(row.materia_codigo_final) &&
    CONFIRMED_STATUSES.has(normalizeStatus(row.estado_revision)),
  )
}

function deriveCareerId(legacyCode) {
  const match = clean(legacyCode).match(/^([A-Za-z]+)/)
  const id = match ? match[1].toUpperCase() : ''
  return id || 'UNKNOWN'
}

function groupByField(rows = [], field, fallback = 'UNKNOWN') {
  return rows.reduce((groups, row) => {
    const key = clean(row[field]) || fallback
    const group = groups[key] ?? []
    group.push(row)
    groups[key] = group
    return groups
  }, {})
}

function buildPlanIndex(planesEstudio = []) {
  const index = new Map()
  planesEstudio.forEach((row) => {
    const carrera = clean(row?.carrera)
    const materia = clean(row?.materia)
    if (!carrera || !materia) return
    const key = `${normalizeText(carrera)}::${normalizeToken(materia)}`
    if (!index.has(key)) index.set(key, row)
  })
  return index
}

function buildSubjectCodeReviewIndex(subjectCodeReviewRows = []) {
  const index = new Map()
  subjectCodeReviewRows.forEach((row) => {
    const carrera = clean(row?.carrera)
    const nombre = clean(row?.materia_nombre)
    if (!carrera || !nombre) return
    const key = `${normalizeText(carrera)}::${normalizeText(nombre)}`
    if (!index.has(key)) index.set(key, row)
  })
  return index
}

function resolveSubject({ carrera, code, planIndex, codeReviewIndex }) {
  const normCarrera = normalizeText(carrera)
  const normCode = normalizeToken(code)
  const planRow = normCode ? planIndex.get(`${normCarrera}::${normCode}`) : undefined
  const nombre = clean(planRow?.nombre)
  const foundInPlan = Boolean(planRow)

  const reviewRow = foundInPlan
    ? codeReviewIndex.get(`${normCarrera}::${normalizeText(nombre)}`)
    : undefined

  return {
    materiaCodigoLegacy: clean(code),
    materiaNombre: nombre,
    foundInPlan,
    foundInReview: Boolean(reviewRow),
    planIdFinal: clean(reviewRow?.plan_id_final),
    materiaCodigoBorrador: clean(reviewRow?.materia_codigo_borrador),
    materiaCodigoFinal: clean(reviewRow?.materia_codigo_final),
    estadoRevisionCodigo: reviewRow ? normalizeStatus(reviewRow.estado_revision) : '',
    confirmed: isConfirmedCode(reviewRow ?? {}),
  }
}

function subjectReasons(prefix, subject) {
  const reasons = []
  if (!subject.foundInPlan) {
    reasons.push(`${prefix}_SIN_NOMBRE_EN_PLAN_ESTUDIO`)
    return reasons
  }
  if (!subject.foundInReview) {
    reasons.push(`${prefix}_SIN_REVISION_CODIGO_V2`)
    return reasons
  }
  if (!subject.materiaCodigoFinal) {
    reasons.push(`${prefix}_CODIGO_FINAL_PENDIENTE`)
  } else if (!subject.confirmed) {
    reasons.push(`${prefix}_CODIGO_FINAL_SIN_CONFIRMAR`)
  }
  return reasons
}

function observationFor(posterior, previa, reasons, planMismatch) {
  if (planMismatch) {
    return 'La materia posterior y la previa resolvieron a distinto plan_id_final; verificar si es un problema de datos.'
  }
  if (!posterior.foundInPlan || !previa.foundInPlan) {
    return 'No se encontro el nombre de la materia en planesEstudio para la carrera indicada; revisar coincidencia de nombre de carrera entre correlatividades y planesEstudio.'
  }
  if (!posterior.foundInReview || !previa.foundInReview) {
    return 'La materia todavia no aparece en la revision de codigos v2 (v2-subject-code-review); resolver esa revision primero.'
  }
  if (!posterior.materiaCodigoFinal || !previa.materiaCodigoFinal) {
    return 'Falta confirmar materia_codigo_final en v2-subject-code-review para alguna de las dos materias de este vinculo.'
  }
  if (reasons.length) {
    return 'Revisar el vinculo antes de confirmarlo.'
  }
  return 'Vinculo resuelto con codigos finales confirmados en ambos extremos; solo falta confirmar la correlatividad en si.'
}

function actionFor({ blocked, planMismatch, posterior, previa, confirmed }) {
  if (planMismatch) return 'VERIFICAR_PLAN_DISTINTO_ENTRE_POSTERIOR_Y_PREVIA'
  if (!posterior.foundInPlan || !previa.foundInPlan) return 'VERIFICAR_NOMBRE_MATERIA_EN_PLAN_ESTUDIO'
  if (!posterior.foundInReview || !previa.foundInReview) return 'RESOLVER_V2_SUBJECT_CODE_REVIEW_PRIMERO'
  if (blocked) return 'CONFIRMAR_MATERIA_CODIGO_FINAL_EN_V2_SUBJECT_CODE_REVIEW'
  if (!confirmed) return 'CONFIRMAR_CORRELATIVIDAD'
  return 'VERIFICAR_CORRELATIVIDAD_EXISTENTE'
}

function buildLinkRow({
  reviewId,
  correlatividadRow,
  previaCode,
  planIndex,
  codeReviewIndex,
}) {
  const carrera = clean(correlatividadRow.carrera)
  const posterior = resolveSubject({ carrera, code: correlatividadRow.materia, planIndex, codeReviewIndex })
  const previa = resolveSubject({ carrera, code: previaCode, planIndex, codeReviewIndex })

  const reasons = [
    ...subjectReasons('POSTERIOR', posterior),
    ...subjectReasons('PREVIA', previa),
  ]

  const selfReference = Boolean(
    normalizeToken(correlatividadRow.materia) &&
    normalizeToken(correlatividadRow.materia) === normalizeToken(previaCode),
  )
  if (selfReference) reasons.push('AUTORREFERENCIA_MATERIA_PREVIA_IGUAL_A_POSTERIOR')

  const blocked = !posterior.materiaCodigoFinal || !previa.materiaCodigoFinal
  const planMismatch = Boolean(
    posterior.planIdFinal && previa.planIdFinal && posterior.planIdFinal !== previa.planIdFinal,
  )
  if (planMismatch) reasons.push('RIESGO_PLAN_DISTINTO')

  const estadoRevision = 'PENDIENTE_CONFIRMACION'
  const confirmed = normalizeStatus(estadoRevision) === 'CONFIRMADO'
  const priority = (blocked || planMismatch || selfReference)
    ? 'ALTA'
    : (confirmed ? 'BAJA' : 'MEDIA')

  return {
    review_id: reviewId,
    correlatividad_id: clean(correlatividadRow.id),
    carrera,
    carrera_id_legacy: deriveCareerId(correlatividadRow.materia),
    posterior_materia_nombre: posterior.materiaNombre,
    posterior_materia_codigo_legacy: posterior.materiaCodigoLegacy,
    posterior_plan_id_final: posterior.planIdFinal,
    posterior_materia_codigo_borrador: posterior.materiaCodigoBorrador,
    posterior_materia_codigo_final: posterior.materiaCodigoFinal,
    posterior_estado_revision_codigo: posterior.estadoRevisionCodigo,
    previa_materia_nombre: previa.materiaNombre,
    previa_materia_codigo_legacy: previa.materiaCodigoLegacy,
    previa_plan_id_final: previa.planIdFinal,
    previa_materia_codigo_borrador: previa.materiaCodigoBorrador,
    previa_materia_codigo_final: previa.materiaCodigoFinal,
    previa_estado_revision_codigo: previa.estadoRevisionCodigo,
    estado_revision: estadoRevision,
    bloqueado_por_codigo_pendiente: blocked ? 'SI' : 'NO',
    riesgo_plan_distinto: planMismatch ? 'SI' : 'NO',
    riesgo_autorreferencia: selfReference ? 'SI' : 'NO',
    prioridad_revision: priority,
    motivo_revision: unique(reasons).join('|'),
    accion_requerida: actionFor({ blocked, planMismatch, posterior, previa, confirmed }),
    observaciones_revision: observationFor(posterior, previa, reasons, planMismatch),
  }
}

function buildSummary({ reviewRows }) {
  const totalLinks = reviewRows.length
  const blockedRows = reviewRows.filter((row) => row.bloqueado_por_codigo_pendiente === 'SI')
  const planMismatchRows = reviewRows.filter((row) => row.riesgo_plan_distinto === 'SI')
  const confirmedRows = reviewRows.filter((row) => normalizeStatus(row.estado_revision) === 'CONFIRMADO')
  const highPriorityRows = reviewRows.filter((row) => row.prioridad_revision === 'ALTA')
  const resolvedRows = reviewRows.filter((row) => (
    row.bloqueado_por_codigo_pendiente === 'NO' && row.riesgo_plan_distinto === 'NO'
  ))

  const careerBreakdown = Object.fromEntries(
    Object.entries(groupByField(reviewRows, 'carrera_id_legacy', 'UNKNOWN')).map(([careerId, rows]) => [
      careerId,
      {
        totalLinks: rows.length,
        resolved: rows.filter((row) => (
          row.bloqueado_por_codigo_pendiente === 'NO' && row.riesgo_plan_distinto === 'NO'
        )).length,
        blocked: rows.filter((row) => row.bloqueado_por_codigo_pendiente === 'SI').length,
        planMismatch: rows.filter((row) => row.riesgo_plan_distinto === 'SI').length,
      },
    ]),
  )

  const readyForCorrelativitiesApply = (
    totalLinks > 0 &&
    blockedRows.length === 0 &&
    planMismatchRows.length === 0 &&
    confirmedRows.length === totalLinks
  )

  return {
    totalLinks,
    linksResolved: resolvedRows.length,
    linksBlockedByPendingCode: blockedRows.length,
    linksWithPlanMismatch: planMismatchRows.length,
    linksConfirmed: confirmedRows.length,
    linksPendingConfirmation: totalLinks - confirmedRows.length,
    highPriorityLinks: highPriorityRows.length,
    careerBreakdown,
    readyForCorrelativitiesApply,
    nextAction: readyForCorrelativitiesApply
      ? 'Mergear/aplicar la revision de correlatividades v2.'
      : 'Resolver primero v2-subject-code-review para las materias bloqueadas y luego confirmar institucionalmente cada vinculo.',
  }
}

function buildRecommendations(summary = {}) {
  const recommendations = []
  if (summary.linksBlockedByPendingCode > 0) {
    recommendations.push('Resolver v2-subject-code-review (materia_codigo_final) para las materias que bloquean vinculos de correlatividad.')
  }
  if (summary.linksWithPlanMismatch > 0) {
    recommendations.push('Revisar los vinculos donde la materia posterior y la previa resuelven a distinto plan_id_final; puede ser un problema de datos.')
  }
  if (summary.linksPendingConfirmation > 0) {
    recommendations.push('Confirmar institucionalmente cada vinculo (estado_revision = CONFIRMADO) antes de aplicar la revision.')
  }
  return recommendations.length
    ? recommendations
    : ['Mergear/aplicar la revision de correlatividades v2.']
}

export function buildV2CorrelativitiesReview({
  correlatividades,
  planesEstudio,
  subjectCodeReviewRows,
  options = {},
} = {}) {
  const safeCorrelatividades = cloneJson(asArray(correlatividades))
  const safePlanesEstudio = cloneJson(asArray(planesEstudio))
  const safeSubjectCodeReviewRows = cloneJson(asArray(subjectCodeReviewRows))

  const planIndex = buildPlanIndex(safePlanesEstudio)
  const codeReviewIndex = buildSubjectCodeReviewIndex(safeSubjectCodeReviewRows)

  const warnings = []
  let counter = 0
  const reviewRows = safeCorrelatividades.flatMap((correlatividadRow) => {
    const carrera = clean(correlatividadRow?.carrera)
    const materia = clean(correlatividadRow?.materia)
    if (!carrera || !materia) {
      warnings.push({
        code: 'CORRELATIVIDAD_SIN_CARRERA_O_MATERIA',
        correlatividadId: clean(correlatividadRow?.id),
      })
      return []
    }

    const previas = unique(asArray(correlatividadRow?.correlativas))
    return previas.map((previaCode) => {
      counter += 1
      return buildLinkRow({
        reviewId: `v2_correlativity_${String(counter).padStart(3, '0')}`,
        correlatividadRow,
        previaCode,
        planIndex,
        codeReviewIndex,
      })
    })
  })

  const seenLinkKeys = new Map()
  reviewRows.forEach((row) => {
    const key = [
      normalizeText(row.carrera),
      normalizeToken(row.posterior_materia_codigo_legacy),
      normalizeToken(row.previa_materia_codigo_legacy),
    ].join('::')
    const count = (seenLinkKeys.get(key) ?? 0) + 1
    seenLinkKeys.set(key, count)
  })
  seenLinkKeys.forEach((count, key) => {
    if (count > 1) {
      warnings.push({ code: 'VINCULO_CORRELATIVIDAD_DUPLICADO', key, occurrences: count })
    }
  })

  const summary = buildSummary({ reviewRows })
  const blockedRows = reviewRows.filter((row) => row.bloqueado_por_codigo_pendiente === 'SI')
  const priorityRows = reviewRows.filter((row) => row.prioridad_revision === 'ALTA')

  const groupedByCareer = groupByField(reviewRows, 'carrera_id_legacy', 'UNKNOWN')
  const rowsByCareer = {
    ...Object.fromEntries(CAREER_ID_ORDER.map((careerId) => [careerId, groupedByCareer[careerId] ?? []])),
    ...Object.fromEntries(Object.entries(groupedByCareer).filter(([careerId]) => !CAREER_ID_ORDER.includes(careerId))),
  }

  return {
    reviewRows: options.includeRows === false ? [] : reviewRows,
    rowsByCareer: options.includeRows === false ? {} : rowsByCareer,
    blockedRows: options.includeRows === false ? [] : blockedRows,
    priorityRows: options.includeRows === false ? [] : priorityRows,
    summary,
    recommendations: buildRecommendations(summary),
    warnings,
    errors: [],
  }
}
