const FINAL_OFFICIAL_COLUMNS = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'carrera', label: 'Carrera' },
  { key: 'anio', label: 'A\u00f1o' },
  { key: 'materiaMesa', label: 'Materia/Mesa' },
  { key: 'titular', label: 'Titular' },
  { key: 'vocal1', label: 'Vocal 1' },
  { key: 'vocal2', label: 'Vocal 2' },
  { key: 'estadoFinal', label: 'Estado final' },
  { key: 'alertas', label: 'Alertas' },
  { key: 'observacionesFinales', label: 'Observaciones finales' },
]

function clean(value) {
  return String(value ?? '').trim()
}

function getFinalTribunals(input = {}) {
  if (Array.isArray(input)) return input
  if (Array.isArray(input.finalTribunals)) return input.finalTribunals
  return []
}

function formatAlertas(mesa = {}) {
  return (mesa.alertasFinales ?? mesa.finalValidation?.alerts ?? [])
    .filter((alerta) => alerta?.severity !== 'info')
    .map((alerta) => clean(alerta.message ?? alerta.code ?? alerta))
    .filter(Boolean)
    .join(' ')
}

export function getFinalTribunalsOfficialExportColumns() {
  return FINAL_OFFICIAL_COLUMNS.map((column) => ({ ...column }))
}

export function buildFinalTribunalsOfficialRows(input = {}) {
  return getFinalTribunals(input).map((mesa) => ({
    fecha: clean(mesa.fechaSugerida ?? mesa.fecha),
    carrera: clean(mesa.carrera),
    anio: clean(mesa.anio),
    materiaMesa: clean(mesa.materiaMesa ?? mesa.materia),
    titular: clean(mesa.titular),
    vocal1: clean(mesa.vocal1),
    vocal2: clean(mesa.vocal2),
    estadoFinal: clean(mesa.estadoFinal),
    alertas: formatAlertas(mesa),
    observacionesFinales: clean(mesa.observacionesFinales ?? mesa.observaciones),
  }))
}

export function exportFinalTribunalsOfficial(input = {}, options = {}) {
  const rows = buildFinalTribunalsOfficialRows(input)
  const columns = getFinalTribunalsOfficialExportColumns()

  return {
    columns,
    rows,
    metadata: {
      totalRows: rows.length,
      generatedAt: clean(options.generatedAt),
      format: 'normalizedRows',
      official: true,
    },
  }
}
