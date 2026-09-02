import {
  asArray,
  clean,
  cloneJson,
  hasOwn,
  hasUiFecha,
} from './uiDtoShared.js'

function normalizeFilterValues(value) {
  return new Set(asArray(value).map((entry) => {
    if (entry && typeof entry === 'object' && hasOwn(entry, 'value')) return String(entry.value)
    return String(entry)
  }))
}

function matchesFilter(value, selectedValues) {
  if (!selectedValues.size) return true
  return selectedValues.has(String(value))
}

function normalizeSearch(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function includesSearch(values = [], search = '') {
  const normalizedSearch = normalizeSearch(search)
  if (!normalizedSearch) return true
  return values.some((value) => normalizeSearch(value).includes(normalizedSearch))
}

function rowDocenteValues(row = {}) {
  return [
    row.titular?.id,
    row.titular?.nombre,
    ...asArray(row.vocales).flatMap((vocal) => [vocal.id, vocal.nombre]),
  ].filter((value) => clean(value))
}

function rowMatchesFilters(row = {}, filters = {}) {
  const docentes = rowDocenteValues(row)

  return (
    matchesFilter(row.carrera, filters.carreras) &&
    matchesFilter(row.llamado, filters.llamados) &&
    matchesFilter(row.estado, filters.estados) &&
    matchesFilter(row.alertLevel, filters.alertLevels) &&
    matchesFilter(row.anio, filters.anios) &&
    matchesFilter(row.turno, filters.turnos) &&
    (!filters.docentes.size || docentes.some((docente) => matchesFilter(docente, filters.docentes))) &&
    matchesFilter(Boolean(row.compactada), filters.compactadas) &&
    matchesFilter(Boolean(row.reviewRequired), filters.revisionManual) &&
    matchesFilter(hasUiFecha(row), filters.conFecha) &&
    includesSearch([
      row.materiaId,
      row.materia,
      row.carreraId,
      row.carrera,
      row.titular?.nombre,
      ...asArray(row.vocales).map((vocal) => vocal.nombre),
      row.reason,
      row.message,
      row.suggestedAction,
    ], filters.search)
  )
}

function alertMatchesFilters(alert = {}, filters = {}) {
  const alertLevel = clean(alert.alertLevel || alert.severity).toUpperCase()
  const docentes = [alert.docenteId, alert.docenteNombre].filter((value) => clean(value))

  return (
    matchesFilter(alert.carrera, filters.carreras) &&
    matchesFilter(alert.llamado, filters.llamados) &&
    matchesFilter(alertLevel, filters.alertLevels) &&
    (!filters.docentes.size || docentes.some((docente) => matchesFilter(docente, filters.docentes))) &&
    includesSearch([
      alert.message,
      alert.materia,
      alert.carrera,
      alert.docenteNombre,
      alert.suggestedAction,
      alert.code,
    ], filters.search)
  )
}

function normalizeFiltersState(filtersState = {}) {
  return {
    carreras: normalizeFilterValues(filtersState.carreras),
    llamados: normalizeFilterValues(filtersState.llamados),
    estados: normalizeFilterValues(filtersState.estados),
    alertLevels: normalizeFilterValues(filtersState.alertLevels),
    anios: normalizeFilterValues(filtersState.anios),
    turnos: normalizeFilterValues(filtersState.turnos),
    docentes: normalizeFilterValues(filtersState.docentes),
    compactadas: normalizeFilterValues(filtersState.compactadas),
    revisionManual: normalizeFilterValues(filtersState.revisionManual),
    conFecha: normalizeFilterValues(filtersState.conFecha),
    search: clean(filtersState.search),
  }
}

export function applyRegularExamPreviewUiFilters(dto = {}, filtersState = {}) {
  const filters = normalizeFiltersState(filtersState)
  const planned = asArray(dto.uiTables?.planned)
    .filter((row) => rowMatchesFilters(row, filters))
    .map((row) => cloneJson(row))
  const unassigned = asArray(dto.uiTables?.unassigned)
    .filter((row) => rowMatchesFilters(row, filters))
    .map((row) => cloneJson(row))
  const uiAlerts = asArray(dto.uiAlerts)
    .filter((alert) => alertMatchesFilters(alert, filters))
    .map((alert) => cloneJson(alert))

  return {
    ...cloneJson(dto),
    uiTables: {
      planned,
      unassigned,
    },
    uiAlerts,
    filteredSummary: {
      plannedVisible: planned.length,
      unassignedVisible: unassigned.length,
      alertsVisible: uiAlerts.length,
      totalVisible: planned.length + unassigned.length,
    },
  }
}

