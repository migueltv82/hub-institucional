function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function hasDate(row = {}) {
  return Boolean(clean(row.fecha ?? row.fechaIso ?? row.displayDate))
}

function countVocales(row = {}) {
  if (Array.isArray(row.vocales)) return row.vocales.length
  return [
    row.vocal1Id,
    row.vocal2Id,
    row.vocal1,
    row.vocal2,
    row.vocal1Nombre,
    row.vocal2Nombre,
  ].filter(clean).length
}

function hasTitular(row = {}) {
  if (row.titular && typeof row.titular === 'object') {
    return Boolean(clean(row.titular.id ?? row.titular.nombre))
  }

  return Boolean(clean(row.titularId ?? row.titular_id ?? row.titularNombre ?? row.profesorTitular))
}

function isTribunalComplete(row = {}) {
  return hasTitular(row) && countVocales(row) >= 2
}

function getUiSummary(contract = {}) {
  return contract?.uiDto?.uiSummary ?? contract?.metadata?.uiSummary ?? {}
}

function getPlannedRows(contract = {}) {
  return asArray(contract?.filteredDto?.uiTables?.planned).length
    ? asArray(contract.filteredDto.uiTables.planned)
    : (
        asArray(contract?.uiDto?.uiTables?.planned).length
          ? asArray(contract.uiDto.uiTables.planned)
          : asArray(contract?.preview?.plannedMesas)
      )
}

function getUnassignedRows(contract = {}) {
  return asArray(contract?.filteredDto?.uiTables?.unassigned).length
    ? asArray(contract.filteredDto.uiTables.unassigned)
    : (
        asArray(contract?.uiDto?.uiTables?.unassigned).length
          ? asArray(contract.uiDto.uiTables.unassigned)
          : asArray(contract?.preview?.unassignedMesas)
      )
}

function countTeacherLimitRows(rows = [], field) {
  return asArray(rows).filter((row) => row?.[field] === true).length
}

function problemScore(row = {}) {
  return (
    numberOrZero(row.errores ?? row.errors ?? row.totalCriticalErrors) * 3 +
    numberOrZero(row.advertencias ?? row.warnings ?? row.totalWarnings) +
    numberOrZero(row.sinFecha ?? row.totalUnassigned) * 2 +
    numberOrZero(row.pendientesRevision ?? row.pendingManualReview)
  )
}

function topProblemGroups(rows = [], labelKeys = []) {
  return asArray(rows)
    .map((row) => {
      const label = labelKeys.map((key) => clean(row?.[key])).find(Boolean) || 'SIN_DATO'
      return {
        label,
        totalMesas: numberOrZero(row.totalMesas),
        problemas: problemScore(row),
        errores: numberOrZero(row.errores ?? row.errors ?? row.totalCriticalErrors),
        advertencias: numberOrZero(row.advertencias ?? row.warnings ?? row.totalWarnings),
        sinFecha: numberOrZero(row.sinFecha ?? row.totalUnassigned),
      }
    })
    .filter((row) => row.problemas > 0)
    .sort((left, right) => right.problemas - left.problemas || right.errores - left.errores)
    .slice(0, 5)
}

function getProblemAlertCodes(contract = {}) {
  return asArray(contract?.uiDto?.uiAlerts)
    .concat(asArray(contract?.filteredDto?.uiAlerts))
    .concat(asArray(contract?.errors))
    .concat(asArray(contract?.warnings))
    .map((alert) => clean(alert.code ?? alert.type ?? alert.message).toUpperCase())
}

function buildRecommendations(summary, contract = {}) {
  const codes = getProblemAlertCodes(contract)
  const recommendations = new Set()
  const add = (value) => recommendations.add(value)

  if (summary.mesasSinTribunal > 0 || codes.some((code) => code.includes('TITULAR'))) {
    add('Cargar titulares faltantes.')
  }
  if (codes.some((code) => code.includes('DISPONIBILIDAD') || code.includes('DISPONIBLE'))) {
    add('Cargar disponibilidad docente.')
  }
  if (codes.some((code) => code.includes('CORRELATIVIDAD'))) {
    add('Revisar correlatividades.')
  }
  if (summary.mesasSinFecha > 0 || codes.some((code) => code.includes('FECHA'))) {
    add('Agregar fechas disponibles.')
  }
  if (codes.some((code) => code.includes('AFINIDAD') || code.includes('VOCAL'))) {
    add('Revisar vocales sin afinidad.')
  }
  if (summary.totalCompactadas > 0 || clean(summary.compactMode)) {
    add('Revisar compactaciones.')
  }
  if (summary.docentesExcedidos > 0 || codes.some((code) => code.includes('EXCEDE_LIMITE'))) {
    add('Revisar docentes excedidos.')
  }

  if (recommendations.size === 0) {
    add('Revisar una muestra institucional antes de considerar cualquier avance.')
  }

  return [...recommendations]
}

function classifyEfficiency({
  totalMesas,
  mesasResueltas,
  totalCriticalErrors,
  mesasSinTribunal,
}) {
  const completionRate = totalMesas > 0 ? mesasResueltas / totalMesas : 0
  const manyCriticalErrors = totalCriticalErrors >= Math.max(3, Math.ceil(totalMesas * 0.2))

  if (totalMesas === 0) {
    return {
      conclusion: 'NO EFICIENTE',
      completionRate,
      reasons: ['No se generaron mesas para evaluar eficiencia.'],
    }
  }

  if (completionRate >= 0.85 && totalCriticalErrors === 0 && mesasSinTribunal === 0) {
    return {
      conclusion: 'EFICIENTE',
      completionRate,
      reasons: ['Genera al menos 85% de mesas completas o con fecha sin errores criticos graves.'],
    }
  }

  if (completionRate >= 0.6 && !manyCriticalErrors) {
    return {
      conclusion: 'PARCIALMENTE EFICIENTE',
      completionRate,
      reasons: ['Genera entre 60% y 84% de mesas completas o con fecha, o requiere revision por incidencias.'],
    }
  }

  return {
    conclusion: 'NO EFICIENTE',
    completionRate,
    reasons: ['Genera menos del 60% de mesas completas o con fecha, o acumula muchos errores criticos.'],
  }
}

export function buildExamEngineEfficiencySummary({
  contract = {},
  input = {},
  metadata = {},
  durationMs = null,
} = {}) {
  const uiSummary = getUiSummary(contract)
  const plannedRows = getPlannedRows(contract)
  const unassignedRows = getUnassignedRows(contract)
  const allRows = [...plannedRows, ...unassignedRows]
  const totalPlanned = numberOrZero(uiSummary.totalPlanned ?? plannedRows.length)
  const totalUnassigned = numberOrZero(uiSummary.totalUnassigned ?? unassignedRows.length)
  const totalMesas = numberOrZero(uiSummary.totalMesas ?? totalPlanned + totalUnassigned)
  const mesasCompletas = allRows.filter(isTribunalComplete).length
  const mesasConFecha = allRows.filter(hasDate).length
  const mesasResueltas = allRows.filter((row) => isTribunalComplete(row) || hasDate(row)).length
  const baseSummary = {
    snapshotId: metadata?.snapshotId ?? null,
    createdAt: metadata?.createdAt ?? null,
    institutionId: metadata?.institutionId ?? null,
    phase: clean(contract.phase),
    status: clean(contract.status),
    totalMaterias: asArray(input.materias).length,
    totalDocentes: asArray(input.docentes).length,
    totalFechasDisponibles: asArray(input.fechasDisponibles).length,
    totalPlanned,
    totalUnassigned,
    totalMesas,
    totalCriticalErrors: numberOrZero(uiSummary.totalCriticalErrors ?? contract.errors?.length),
    totalWarnings: numberOrZero(uiSummary.totalWarnings ?? contract.warnings?.length),
    totalPendingManualReview: numberOrZero(uiSummary.totalPendingManualReview ?? contract.uiDto?.uiPendingReview?.length),
    totalCompactadas: numberOrZero(uiSummary.totalCompactadas),
    cantidadLlamados: uiSummary.cantidadLlamados ?? input.config?.cantidadLlamados ?? null,
    tipoPeriodo: clean(uiSummary.tipoPeriodo ?? input.config?.tipoPeriodo),
    compactMode: uiSummary.compactMode ?? input.options?.compact ?? null,
    mesasCompletas,
    mesasConUnVocal: allRows.filter((row) => hasTitular(row) && countVocales(row) === 1).length,
    mesasSinTribunal: allRows.filter((row) => !hasTitular(row) || countVocales(row) === 0).length,
    mesasSinFecha: allRows.filter((row) => !hasDate(row)).length,
    docentesEnLimite: countTeacherLimitRows(contract.uiDto?.uiTeacherSummary, 'enLimite'),
    docentesExcedidos: countTeacherLimitRows(contract.uiDto?.uiTeacherSummary, 'excedido'),
    carrerasConMasProblemas: topProblemGroups(contract.uiDto?.uiCareerSummary, ['carrera', 'nombre', 'label']),
    llamadosConMasProblemas: topProblemGroups(contract.uiDto?.uiCallSummary, ['llamado', 'nombre', 'label']),
    readOnly: metadata?.readOnly === true,
    ...(durationMs === null ? {} : { durationMs: Math.round(numberOrZero(durationMs)) }),
  }
  const classification = classifyEfficiency({
    totalMesas,
    mesasResueltas: Math.max(mesasResueltas, mesasConFecha),
    totalCriticalErrors: baseSummary.totalCriticalErrors,
    mesasSinTribunal: baseSummary.mesasSinTribunal,
  })

  const summary = {
    ...baseSummary,
    completionRate: Number(classification.completionRate.toFixed(4)),
    conclusion: classification.conclusion,
    conclusionReasons: classification.reasons,
  }

  return {
    ...summary,
    recommendations: buildRecommendations(summary, contract),
  }
}
