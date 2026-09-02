const CALL_ALIASES = new Map([
  ['1', 'PRIMER_LLAMADO'],
  ['first', 'PRIMER_LLAMADO'],
  ['primer', 'PRIMER_LLAMADO'],
  ['primero', 'PRIMER_LLAMADO'],
  ['primer llamado', 'PRIMER_LLAMADO'],
  ['primer_llamado', 'PRIMER_LLAMADO'],
  ['PRIMER_LLAMADO', 'PRIMER_LLAMADO'],
  ['2', 'SEGUNDO_LLAMADO'],
  ['second', 'SEGUNDO_LLAMADO'],
  ['segundo', 'SEGUNDO_LLAMADO'],
  ['segundo llamado', 'SEGUNDO_LLAMADO'],
  ['segundo_llamado', 'SEGUNDO_LLAMADO'],
  ['SEGUNDO_LLAMADO', 'SEGUNDO_LLAMADO'],
  ['special', 'LLAMADO_ESPECIAL'],
  ['especial', 'LLAMADO_ESPECIAL'],
  ['llamado especial', 'LLAMADO_ESPECIAL'],
  ['llamado_especial', 'LLAMADO_ESPECIAL'],
  ['LLAMADO_ESPECIAL', 'LLAMADO_ESPECIAL'],
])

const UNASSIGNED_STATES = new Set([
  'SIN_FECHA',
  'SIN_TRIBUNAL',
  'SIN_TITULAR',
  'CON_UN_VOCAL',
  'REQUIERE_REVISION',
])

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
    .replaceAll(/\s+/g, ' ')
}

function canonicalKey(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '')
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '')
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function normalizeCall(value) {
  const text = clean(value)
  if (!text) return ''
  return CALL_ALIASES.get(text) ?? CALL_ALIASES.get(normalizeText(text)) ?? CALL_ALIASES.get(canonicalKey(text)) ?? text
}

function toIsoDate(value) {
  const text = clean(value)
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const displayMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (displayMatch) {
    const [, day, month, year] = displayMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return text
}

function normalizeTeacherName(value) {
  if (value && typeof value === 'object') {
    return normalizeTeacherName(firstValue(value.nombre, value.name, value.profesor, value.id))
  }
  return normalizeText(value)
}

function displayTeacherName(value) {
  if (value && typeof value === 'object') return clean(firstValue(value.nombre, value.name, value.profesor, value.id))
  return clean(value)
}

function subjectCode(mesa = {}) {
  return clean(firstValue(mesa.materia, mesa.codigo, mesa.code, mesa.materiaId, mesa.nombreMateria))
}

function subjectName(mesa = {}) {
  return clean(firstValue(mesa.nombreMateria, mesa.nombre, mesa.materia, mesa.materiaId))
}

function careerName(mesa = {}) {
  return clean(firstValue(mesa.carrera, mesa.programa, mesa.program, mesa.career))
}

function getLegacyRows(legacyResult) {
  if (Array.isArray(legacyResult)) return legacyResult
  return asArray(legacyResult?.cronograma)
}

function getNewPlannedRows(newPreview = {}) {
  return asArray(newPreview.plannedMesas).length
    ? asArray(newPreview.plannedMesas)
    : asArray(newPreview.uiTables?.planned)
}

function getNewUnassignedRows(newPreview = {}) {
  return asArray(newPreview.unassignedMesas).length
    ? asArray(newPreview.unassignedMesas)
    : asArray(newPreview.uiTables?.unassigned)
}

function getNewRows(newPreview = {}) {
  return [
    ...getNewPlannedRows(newPreview),
    ...getNewUnassignedRows(newPreview),
  ]
}

function legacyVocales(row = {}) {
  return [row.vocal1, row.vocal2].filter((vocal) => clean(vocal) && normalizeText(vocal) !== 'a designar')
}

function newVocales(row = {}) {
  if (Array.isArray(row.vocales)) return row.vocales.map(displayTeacherName).filter(Boolean)
  return [
    firstValue(row.vocal1Nombre, row.vocal1?.nombre, row.vocal1, row.vocal1Id),
    firstValue(row.vocal2Nombre, row.vocal2?.nombre, row.vocal2, row.vocal2Id),
  ]
    .filter((vocal) => clean(vocal) && normalizeText(vocal) !== 'a designar')
}

function normalizeVocalSet(values = []) {
  return [...new Set(values.map(normalizeTeacherName).filter(Boolean))].sort()
}

function hasMissingTribunal(row = {}, source = 'legacy') {
  if (source === 'legacy') {
    const titular = normalizeTeacherName(row.profesorTitular)
    const vocales = normalizeVocalSet(legacyVocales(row))
    return !titular || titular === 'a designar' || vocales.length < 2 || row.pendienteRevision === true
  }

  if (row.reviewRequired === true) return true
  if (UNASSIGNED_STATES.has(clean(row.estado).toUpperCase())) return true
  const titular = normalizeTeacherName(firstValue(row.titularNombre, row.titular?.nombre, row.titularId, row.titular, row.profesorTitular))
  const vocales = normalizeVocalSet(newVocales(row))
  return !titular || vocales.length < 2
}

function normalizeLegacyMesa(row = {}) {
  const called = normalizeCall(firstValue(row.exam_call, row.llamado))
  const normalized = {
    source: 'legacy',
    original: cloneJson(row),
    id: clean(row.id),
    carrera: careerName(row),
    materia: subjectCode(row),
    nombreMateria: subjectName(row),
    llamado: called,
    fecha: toIsoDate(firstValue(row.fechaIso, row.fecha)),
    titular: displayTeacherName(row.profesorTitular),
    titularKey: normalizeTeacherName(row.profesorTitular),
    vocales: legacyVocales(row),
    vocalesKey: normalizeVocalSet(legacyVocales(row)),
    compactada: Boolean(row.compactada || asArray(row.materiasAgrupadas).length > 1),
    materiasAgrupadas: asArray(row.materiasAgrupadas),
    sinTribunal: hasMissingTribunal(row, 'legacy'),
    sinFecha: !toIsoDate(firstValue(row.fechaIso, row.fecha)),
  }

  return {
    ...normalized,
    matchKey: buildMatchKey(normalized),
  }
}

function normalizeNewMesa(row = {}) {
  const titular = firstValue(row.titularNombre, row.titular?.nombre, row.titularId, row.titular, row.profesorTitular)
  const normalized = {
    source: 'new',
    original: cloneJson(row),
    id: clean(row.id),
    carrera: careerName(row),
    materia: subjectCode(row),
    nombreMateria: subjectName(row),
    llamado: normalizeCall(firstValue(row.llamado, row.exam_call)),
    fecha: toIsoDate(firstValue(row.fechaIso, row.fecha, row.displayDate)),
    titular: displayTeacherName(titular),
    titularKey: normalizeTeacherName(titular),
    vocales: newVocales(row),
    vocalesKey: normalizeVocalSet(newVocales(row)),
    compactada: Boolean(row.compactada || asArray(row.materiasAgrupadas).length > 1),
    materiasAgrupadas: asArray(row.materiasAgrupadas),
    sinTribunal: hasMissingTribunal(row, 'new'),
    sinFecha: !toIsoDate(firstValue(row.fecha, row.displayDate)),
  }

  return {
    ...normalized,
    matchKey: buildMatchKey(normalized),
  }
}

function buildMatchKey(mesa = {}) {
  return [
    normalizeText(mesa.carrera),
    normalizeText(mesa.materia || mesa.nombreMateria),
    normalizeCall(mesa.llamado),
  ].join('::')
}

function groupedSubjectKeys(mesa = {}) {
  return asArray(mesa.materiasAgrupadas)
    .map((subject) => buildMatchKey({
      carrera: subject.carrera || mesa.carrera,
      materia: subject.materiaId || subject.materia || subject.codigo || subject.nombreMateria,
      nombreMateria: subject.nombreMateria,
      llamado: mesa.llamado,
    }))
    .filter(Boolean)
}

function buildNewIndex(newMesas = []) {
  return newMesas.reduce((map, mesa) => {
    map.set(mesa.matchKey, mesa)
    groupedSubjectKeys(mesa).forEach((key) => {
      if (!map.has(key)) map.set(key, mesa)
    })
    return map
  }, new Map())
}

function compareArrays(left = [], right = []) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function pushDiff(diffs, type, legacyMesa, newMesa, detail = {}) {
  diffs.push({
    type,
    matchKey: legacyMesa?.matchKey ?? newMesa?.matchKey ?? '',
    legacyMesaId: legacyMesa?.id ?? null,
    newMesaId: newMesa?.id ?? null,
    severity: detail.severity ?? 'warning',
    ...detail,
  })
}

function compareMatchedMesa(legacyMesa, newMesa, diffs) {
  if (legacyMesa.titularKey !== newMesa.titularKey) {
    pushDiff(diffs, 'TITULAR_DISTINTO', legacyMesa, newMesa, {
      legacyValue: legacyMesa.titular,
      newValue: newMesa.titular,
    })
  }

  if (!compareArrays(legacyMesa.vocalesKey, newMesa.vocalesKey)) {
    pushDiff(diffs, 'VOCALES_DISTINTOS', legacyMesa, newMesa, {
      legacyValue: legacyMesa.vocales,
      newValue: newMesa.vocales,
    })
  }

  if (legacyMesa.fecha !== newMesa.fecha) {
    pushDiff(diffs, 'FECHA_DISTINTA', legacyMesa, newMesa, {
      legacyValue: legacyMesa.fecha,
      newValue: newMesa.fecha,
    })
  }

  if (legacyMesa.llamado !== newMesa.llamado) {
    pushDiff(diffs, 'LLAMADO_DISTINTO', legacyMesa, newMesa, {
      legacyValue: legacyMesa.llamado,
      newValue: newMesa.llamado,
    })
  }

  if (legacyMesa.sinTribunal !== newMesa.sinTribunal) {
    pushDiff(diffs, 'TRIBUNAL_DISTINTO', legacyMesa, newMesa, {
      legacyValue: legacyMesa.sinTribunal,
      newValue: newMesa.sinTribunal,
    })
  }

  if (legacyMesa.sinFecha !== newMesa.sinFecha) {
    pushDiff(diffs, 'FECHA_ASIGNACION_DISTINTA', legacyMesa, newMesa, {
      legacyValue: legacyMesa.sinFecha,
      newValue: newMesa.sinFecha,
    })
  }
}

function countIssues(items = []) {
  return asArray(items).reduce((summary, item) => {
    const severity = clean(item.severity || item.severidad || 'warning').toLowerCase()
    return {
      ...summary,
      [severity]: (summary[severity] ?? 0) + 1,
    }
  }, {})
}

function summarizeLegacy(legacyMesas = []) {
  return {
    totalMesas: legacyMesas.length,
    totalSinTribunal: legacyMesas.filter((mesa) => mesa.sinTribunal).length,
    totalSinFecha: legacyMesas.filter((mesa) => mesa.sinFecha).length,
    totalCompactadas: legacyMesas.filter((mesa) => mesa.compactada).length,
    llamados: [...new Set(legacyMesas.map((mesa) => mesa.llamado).filter(Boolean))].sort(),
  }
}

function summarizeNew({ newMesas, newPreview }) {
  const errors = asArray(newPreview?.errors)
  const warnings = asArray(newPreview?.warnings)
  const metadataCompactaciones = asArray(newPreview?.metadata?.compactaciones)

  return {
    totalMesas: newMesas.length,
    totalPlanned: getNewPlannedRows(newPreview).length,
    totalUnassigned: getNewUnassignedRows(newPreview).length,
    totalSinTribunal: newMesas.filter((mesa) => mesa.sinTribunal).length,
    totalSinFecha: newMesas.filter((mesa) => mesa.sinFecha).length,
    totalCompactadas: newMesas.filter((mesa) => mesa.compactada).length,
    totalCompactaciones: metadataCompactaciones.length || newMesas.filter((mesa) => mesa.compactada).length,
    llamados: [...new Set(newMesas.map((mesa) => mesa.llamado).filter(Boolean))].sort(),
    issues: {
      errors: errors.length,
      warnings: warnings.length,
      bySeverity: countIssues([...errors, ...warnings]),
    },
  }
}

function compactationDiffs({ legacyMesas, newMesas, diffs }) {
  const legacyCompactadas = legacyMesas.filter((mesa) => mesa.compactada)
  const newCompactadas = newMesas.filter((mesa) => mesa.compactada)

  if (newCompactadas.length > legacyCompactadas.length) {
    pushDiff(diffs, 'COMPACTACION_NUEVA', null, newCompactadas[0], {
      legacyValue: legacyCompactadas.length,
      newValue: newCompactadas.length,
      severity: 'info',
    })
  }
}

function buildRecommendations(diffs = []) {
  const types = new Set(diffs.map((diff) => diff.type))
  const recommendations = []

  if (types.has('TITULAR_DISTINTO')) recommendations.push('Revisar reglas de asignacion de titulares.')
  if (types.has('VOCALES_DISTINTOS')) recommendations.push('Comparar afinidades e idoneidad usadas para vocalias.')
  if (types.has('FECHA_DISTINTA') || types.has('FECHA_ASIGNACION_DISTINTA')) {
    recommendations.push('Verificar rangos de llamados y disponibilidad de fechas.')
  }
  if (types.has('COMPACTACION_NUEVA')) recommendations.push('Revisar compactaciones del nuevo motor por separado.')
  if (types.has('MESA_LEGACY_SIN_EQUIVALENTE') || types.has('MESA_NUEVA_SIN_EQUIVALENTE')) {
    recommendations.push('Auditar claves de matching por carrera, materia y llamado.')
  }

  return recommendations
}

function technicalWarnings({ legacyResult, newPreview }) {
  const warnings = []
  if (!Array.isArray(legacyResult) && !Array.isArray(legacyResult?.cronograma)) {
    warnings.push({
      code: 'LEGACY_RESULT_NOT_ARRAY',
      severity: 'warning',
      message: 'legacyResult no es un array ni contiene cronograma array.',
    })
  }
  if (!newPreview || typeof newPreview !== 'object') {
    warnings.push({
      code: 'NEW_PREVIEW_NOT_OBJECT',
      severity: 'warning',
      message: 'newPreview no es un objeto valido.',
    })
  }
  return warnings
}

export function buildRegularExamEngineComparison({ legacyResult = [], newPreview = {} } = {}) {
  const legacyMesas = getLegacyRows(legacyResult).map(normalizeLegacyMesa)
  const newMesas = getNewRows(newPreview).map(normalizeNewMesa)
  const newIndex = buildNewIndex(newMesas)
  const matchedNewIds = new Set()
  const diffs = []
  const unmatchedLegacyMesas = []

  legacyMesas.forEach((legacyMesa) => {
    const newMesa = newIndex.get(legacyMesa.matchKey)

    if (!newMesa) {
      unmatchedLegacyMesas.push(legacyMesa)
      pushDiff(diffs, 'MESA_LEGACY_SIN_EQUIVALENTE', legacyMesa, null, { severity: 'critical' })
      return
    }

    matchedNewIds.add(newMesa.id || newMesa.matchKey)
    compareMatchedMesa(legacyMesa, newMesa, diffs)
  })

  const unmatchedNewMesas = newMesas.filter((newMesa) => !matchedNewIds.has(newMesa.id || newMesa.matchKey))
  unmatchedNewMesas.forEach((newMesa) => {
    pushDiff(diffs, 'MESA_NUEVA_SIN_EQUIVALENTE', null, newMesa, { severity: 'critical' })
  })

  compactationDiffs({ legacyMesas, newMesas, diffs })

  return {
    legacySummary: summarizeLegacy(legacyMesas),
    newSummary: summarizeNew({ newMesas, newPreview }),
    diffs,
    unmatchedLegacyMesas,
    unmatchedNewMesas,
    warnings: [
      ...technicalWarnings({ legacyResult, newPreview }),
      ...asArray(newPreview?.warnings).map(cloneJson),
      ...asArray(newPreview?.errors).map(cloneJson),
    ],
    recommendations: buildRecommendations(diffs),
    metadata: {
      generatedAt: null,
      matchStrategy: 'carrera + materia/codigo + llamado',
      matchedMesas: legacyMesas.length - unmatchedLegacyMesas.length,
      totalLegacyMesas: legacyMesas.length,
      totalNewMesas: newMesas.length,
      diffCount: diffs.length,
    },
  }
}
