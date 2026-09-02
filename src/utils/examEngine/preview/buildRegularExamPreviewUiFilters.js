import {
  asArray,
  clean,
  hasUiFecha,
} from './uiDtoShared.js'

function allUiRows(dto = {}) {
  return [
    ...asArray(dto.uiTables?.planned),
    ...asArray(dto.uiTables?.unassigned),
  ]
}

function incrementOption(map, value, label = value) {
  const normalizedValue = value
  if (normalizedValue === undefined || normalizedValue === null || clean(normalizedValue) === '') return
  const key = typeof normalizedValue === 'boolean' ? String(normalizedValue) : clean(normalizedValue)
  if (!map.has(key)) {
    map.set(key, {
      value: normalizedValue,
      label: clean(label) || clean(normalizedValue),
      count: 0,
    })
  }
  map.get(key).count += 1
}

function sortOptions(options = []) {
  return [...options].sort((a, b) => clean(a.label).localeCompare(clean(b.label), 'es', { numeric: true }))
}

function optionList(map) {
  return sortOptions([...map.values()])
}

function booleanOption(counts, value, label) {
  return {
    value,
    label,
    count: counts[value] ?? 0,
  }
}

export function buildRegularExamPreviewUiFilters(dto = {}) {
  const rows = allUiRows(dto)
  const carreras = new Map()
  const llamados = new Map()
  const estados = new Map()
  const alertLevels = new Map()
  const anios = new Map()
  const turnos = new Map()
  const docentes = new Map()
  const compactadaCounts = { true: 0, false: 0 }
  const revisionManualCounts = { true: 0, false: 0 }
  const conFechaCounts = { true: 0, false: 0 }

  rows.forEach((row) => {
    incrementOption(carreras, row.carrera || row.carreraId, row.carrera || row.carreraId)
    incrementOption(llamados, row.llamado, row.llamado)
    incrementOption(estados, row.estado, row.displayStatus || row.estado)
    incrementOption(alertLevels, row.alertLevel, row.alertLevel)
    incrementOption(anios, row.anio, row.anio)
    incrementOption(turnos, row.turno, row.turno)

    const compactada = Boolean(row.compactada)
    compactadaCounts[compactada] += 1

    const reviewRequired = Boolean(row.reviewRequired)
    revisionManualCounts[reviewRequired] += 1

    const conFecha = hasUiFecha(row)
    conFechaCounts[conFecha] += 1

    const titular = row.titular ?? {}
    incrementOption(docentes, titular.id || titular.nombre, titular.nombre || titular.id)
    asArray(row.vocales).forEach((vocal) => {
      incrementOption(docentes, vocal.id || vocal.nombre, vocal.nombre || vocal.id)
    })
  })

  asArray(dto.uiAlerts).forEach((alert) => {
    incrementOption(carreras, alert.carrera, alert.carrera)
    incrementOption(llamados, alert.llamado, alert.llamado)
    incrementOption(alertLevels, clean(alert.severity).toUpperCase(), clean(alert.severity).toUpperCase())
    incrementOption(docentes, alert.docenteId || alert.docenteNombre, alert.docenteNombre || alert.docenteId)
  })

  return {
    carreras: optionList(carreras),
    llamados: optionList(llamados),
    estados: optionList(estados),
    alertLevels: optionList(alertLevels),
    anios: optionList(anios),
    turnos: optionList(turnos),
    docentes: optionList(docentes),
    compactadas: [
      booleanOption(compactadaCounts, true, 'Compactadas'),
      booleanOption(compactadaCounts, false, 'No compactadas'),
    ],
    revisionManual: [
      booleanOption(revisionManualCounts, true, 'Requieren revision'),
      booleanOption(revisionManualCounts, false, 'Sin revision requerida'),
    ],
    conFecha: [
      booleanOption(conFechaCounts, true, 'Con fecha'),
      booleanOption(conFechaCounts, false, 'Sin fecha'),
    ],
  }
}
