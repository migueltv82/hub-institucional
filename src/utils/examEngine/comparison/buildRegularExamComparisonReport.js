const CRITICAL_DIFF_TYPES = new Set([
  'TITULAR_DISTINTO',
  'FECHA_DISTINTA',
  'LLAMADO_DISTINTO',
  'TRIBUNAL_DISTINTO',
  'FECHA_ASIGNACION_DISTINTA',
  'MESA_LEGACY_SIN_EQUIVALENTE',
  'MESA_NUEVA_SIN_EQUIVALENTE',
])

const SECTION_BY_DIFF_TYPE = {
  TITULAR_DISTINTO: 'diferenciasTitulares',
  VOCALES_DISTINTOS: 'diferenciasVocales',
  FECHA_DISTINTA: 'diferenciasFechas',
  FECHA_ASIGNACION_DISTINTA: 'mesasSinFecha',
  LLAMADO_DISTINTO: 'diferenciasLlamados',
  TRIBUNAL_DISTINTO: 'mesasSinTribunal',
  COMPACTACION_NUEVA: 'compactaciones',
  MESA_LEGACY_SIN_EQUIVALENTE: 'mesasSinEquivalente',
  MESA_NUEVA_SIN_EQUIVALENTE: 'mesasSinEquivalente',
}

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

function createSections() {
  return {
    resumenGeneral: [],
    diferenciasTitulares: [],
    diferenciasVocales: [],
    diferenciasFechas: [],
    diferenciasLlamados: [],
    mesasSinTribunal: [],
    mesasSinFecha: [],
    compactaciones: [],
    mesasSinEquivalente: [],
    recomendaciones: [],
  }
}

function splitMatchKey(matchKey = '') {
  const [carrera = '', materia = '', llamado = ''] = clean(matchKey).split('::')
  return { carrera, materia, llamado }
}

function severityForDiff(diff = {}) {
  const severity = clean(diff.severity).toLowerCase()
  if (severity === 'critical') return 'critical'
  if (CRITICAL_DIFF_TYPES.has(diff.type)) return 'critical'
  if (severity === 'info') return 'info'
  return 'warning'
}

function messageForDiff(diff = {}) {
  const messages = {
    TITULAR_DISTINTO: 'El titular asignado no coincide entre legacy y el preview nuevo.',
    VOCALES_DISTINTOS: 'Los vocales asignados no coinciden entre legacy y el preview nuevo.',
    FECHA_DISTINTA: 'La fecha asignada no coincide entre legacy y el preview nuevo.',
    LLAMADO_DISTINTO: 'El llamado asignado no coincide entre legacy y el preview nuevo.',
    TRIBUNAL_DISTINTO: 'La completitud del tribunal no coincide entre legacy y el preview nuevo.',
    FECHA_ASIGNACION_DISTINTA: 'La disponibilidad de fecha no coincide entre legacy y el preview nuevo.',
    COMPACTACION_NUEVA: 'El preview nuevo compacta mesas que legacy no compactaba.',
    MESA_LEGACY_SIN_EQUIVALENTE: 'Hay una mesa legacy sin equivalente en el preview nuevo.',
    MESA_NUEVA_SIN_EQUIVALENTE: 'Hay una mesa nueva sin equivalente en legacy.',
  }

  return messages[diff.type] ?? 'Se detecto una diferencia entre legacy y el preview nuevo.'
}

function suggestedActionForDiff(diff = {}) {
  const actions = {
    TITULAR_DISTINTO: 'Revisar reglas de asignacion de titulares antes de confiar en el resultado nuevo.',
    VOCALES_DISTINTOS: 'Comparar vocales como conjunto y revisar afinidades docentes.',
    FECHA_DISTINTA: 'Verificar rangos de fechas, llamados y restricciones de correlatividad.',
    LLAMADO_DISTINTO: 'Auditar la clave de matching y la normalizacion de llamados.',
    TRIBUNAL_DISTINTO: 'Revisar mesas con tribunal incompleto antes de cualquier avance.',
    FECHA_ASIGNACION_DISTINTA: 'Revisar mesas sin fecha y disponibilidad por llamado.',
    COMPACTACION_NUEVA: 'Auditar compactaciones por separado porque pueden cambiar la cantidad visible de mesas.',
    MESA_LEGACY_SIN_EQUIVALENTE: 'Confirmar si la mesa debe existir en el nuevo motor o si la clave de matching cambio.',
    MESA_NUEVA_SIN_EQUIVALENTE: 'Confirmar si la mesa nueva es esperada o si el preview esta generando una mesa extra.',
  }

  return actions[diff.type] ?? 'Revisar esta diferencia en auditoria interna.'
}

function mesaFromDiff(diff = {}) {
  const fromKey = splitMatchKey(diff.matchKey)
  return {
    mesaKey: clean(diff.matchKey),
    materia: clean(diff.materia) || fromKey.materia,
    carrera: clean(diff.carrera) || fromKey.carrera,
    llamado: clean(diff.llamado) || fromKey.llamado,
  }
}

function reportItemFromDiff(diff = {}) {
  const mesa = mesaFromDiff(diff)

  return {
    severity: severityForDiff(diff),
    type: clean(diff.type) || 'DIFF',
    ...mesa,
    legacyValue: diff.legacyValue ?? null,
    newValue: diff.newValue ?? null,
    message: messageForDiff(diff),
    suggestedAction: suggestedActionForDiff(diff),
  }
}

function summaryItem({ type, severity = 'info', legacyValue = null, newValue = null, message, suggestedAction }) {
  return {
    severity,
    type,
    mesaKey: 'summary',
    materia: '',
    carrera: '',
    llamado: '',
    legacyValue,
    newValue,
    message,
    suggestedAction,
  }
}

function warningItem(warning = {}) {
  const severity = clean(warning.severity || warning.severidad || 'warning').toLowerCase()

  return {
    severity: severity || 'warning',
    type: clean(warning.code || warning.type || 'WARNING'),
    mesaKey: clean(warning.matchKey),
    materia: clean(warning.materia),
    carrera: clean(warning.carrera),
    llamado: clean(warning.llamado),
    legacyValue: null,
    newValue: null,
    message: clean(warning.message || warning.mensaje || warning.code || 'Advertencia de comparacion.'),
    suggestedAction: clean(warning.suggestedAction || 'Revisar la advertencia antes de avanzar.'),
  }
}

function recommendationItem(recommendation, index) {
  return {
    severity: 'info',
    type: 'RECOMMENDATION',
    mesaKey: `recommendation-${index + 1}`,
    materia: '',
    carrera: '',
    llamado: '',
    legacyValue: null,
    newValue: null,
    message: clean(recommendation),
    suggestedAction: clean(recommendation),
  }
}

function addSummarySections(sections, comparison = {}) {
  const legacySummary = comparison.legacySummary ?? {}
  const newSummary = comparison.newSummary ?? {}
  const legacySinTribunal = legacySummary.totalSinTribunal ?? 0
  const newSinTribunal = newSummary.totalSinTribunal ?? 0
  const legacySinFecha = legacySummary.totalSinFecha ?? 0
  const newSinFecha = newSummary.totalSinFecha ?? 0
  const compactedNewCount = newSummary.totalCompactadas ?? 0

  sections.resumenGeneral.push(summaryItem({
    type: 'RESUMEN_GENERAL',
    legacyValue: cloneJson(legacySummary),
    newValue: cloneJson(newSummary),
    message: 'Resumen comparativo entre legacy y preview nuevo.',
    suggestedAction: 'Usar este resumen como punto de entrada para la auditoria interna.',
  }))

  if (legacySinTribunal > 0 || newSinTribunal > 0) {
    sections.mesasSinTribunal.push(summaryItem({
      type: 'MESAS_SIN_TRIBUNAL',
      severity: 'critical',
      legacyValue: legacySinTribunal,
      newValue: newSinTribunal,
      message: 'Existen mesas sin tribunal completo en al menos una salida.',
      suggestedAction: 'Resolver o justificar mesas sin tribunal antes de cualquier integracion.',
    }))
  }

  if (legacySinFecha > 0 || newSinFecha > 0) {
    sections.mesasSinFecha.push(summaryItem({
      type: 'MESAS_SIN_FECHA',
      severity: 'critical',
      legacyValue: legacySinFecha,
      newValue: newSinFecha,
      message: 'Existen mesas sin fecha en al menos una salida.',
      suggestedAction: 'Revisar disponibilidad de fechas y rangos de llamados.',
    }))
  }

  if (compactedNewCount > 0) {
    sections.compactaciones.push(summaryItem({
      type: 'COMPACTACIONES_NUEVAS',
      severity: 'warning',
      legacyValue: legacySummary.totalCompactadas ?? 0,
      newValue: compactedNewCount,
      message: 'El preview nuevo contiene mesas compactadas.',
      suggestedAction: 'Auditar compactaciones por separado porque modifican la comparacion mesa a mesa.',
    }))
  }
}

function reportStatus({ diffItems, warningItems }) {
  const hasCritical = [...diffItems, ...warningItems].some((item) => item.severity === 'critical')
  if (hasCritical) return 'CRITICAL'

  const hasWarning = [...diffItems, ...warningItems].some((item) => item.severity === 'warning')
  if (hasWarning) return 'WARNING'

  return 'OK'
}

function allSectionItems(sections) {
  return Object.values(sections).flatMap(asArray)
}

export function buildRegularExamComparisonReport(comparison = {}) {
  const safeComparison = comparison && typeof comparison === 'object' ? comparison : {}
  const sections = createSections()

  addSummarySections(sections, safeComparison)

  const diffItems = asArray(safeComparison.diffs).map(reportItemFromDiff)
  diffItems.forEach((item) => {
    const sectionKey = SECTION_BY_DIFF_TYPE[item.type] ?? 'resumenGeneral'
    sections[sectionKey].push(item)
  })

  const warnings = asArray(safeComparison.warnings).map(warningItem)
  const recommendations = asArray(safeComparison.recommendations).map(clean).filter(Boolean)
  sections.recomendaciones.push(...recommendations.map(recommendationItem))

  const sectionItems = allSectionItems(sections)
  const criticalDiffs = sectionItems.filter((item) => item.severity === 'critical')
  const status = reportStatus({ diffItems: sectionItems, warningItems: warnings })

  return {
    status,
    executiveSummary: {
      totalLegacyMesas: safeComparison.legacySummary?.totalMesas ?? safeComparison.metadata?.totalLegacyMesas ?? 0,
      totalNewMesas: safeComparison.newSummary?.totalMesas ?? safeComparison.metadata?.totalNewMesas ?? 0,
      totalDiffs: asArray(safeComparison.diffs).length,
      totalCriticalDiffs: criticalDiffs.length,
      totalWarnings: warnings.length,
      unmatchedLegacyCount: asArray(safeComparison.unmatchedLegacyMesas).length,
      unmatchedNewCount: asArray(safeComparison.unmatchedNewMesas).length,
      compactedNewCount: safeComparison.newSummary?.totalCompactadas ?? 0,
    },
    sections,
    criticalDiffs,
    warnings,
    recommendations,
    metadata: {
      source: 'regularExamComparisonReport',
      generatedAt: null,
      inputMetadata: cloneJson(safeComparison.metadata ?? {}),
      sectionCounts: Object.fromEntries(
        Object.entries(sections).map(([key, value]) => [key, value.length]),
      ),
    },
  }
}
