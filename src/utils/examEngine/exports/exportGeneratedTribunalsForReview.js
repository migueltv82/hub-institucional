const GENERATED_TRIBUNAL_EXPORT_COLUMNS = [
  { key: 'draftMesaId', label: 'ID Mesa' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'carrera', label: 'Carrera' },
  { key: 'anio', label: 'A\u00f1o' },
  { key: 'materiaMesa', label: 'Materia/Mesa' },
  { key: 'titular', label: 'Titular' },
  { key: 'vocal1', label: 'Vocal 1' },
  { key: 'vocal2', label: 'Vocal 2' },
  { key: 'estado', label: 'Estado' },
  { key: 'alertas', label: 'Alertas' },
  { key: 'observaciones', label: 'Observaciones' },
  { key: 'correccionInstitucional', label: 'Correcci\u00f3n institucional' },
]

function clean(value) {
  return String(value ?? '').trim()
}

function getGeneratedTribunals(input = {}) {
  if (Array.isArray(input)) return input
  if (Array.isArray(input.generatedTribunals)) return input.generatedTribunals
  if (Array.isArray(input.tribunales)) return input.tribunales
  return []
}

function formatAlertas(mesa = {}) {
  return (mesa.alertas ?? [])
    .filter((alerta) => alerta?.severity !== 'info')
    .map((alerta) => clean(alerta.message ?? alerta.code ?? alerta))
    .filter(Boolean)
    .join(' ')
}

export function getGeneratedTribunalsReviewExportColumns() {
  return GENERATED_TRIBUNAL_EXPORT_COLUMNS.map((column) => ({ ...column }))
}

export function buildGeneratedTribunalsReviewRows(input = {}) {
  return getGeneratedTribunals(input).map((mesa) => ({
    draftMesaId: clean(mesa.draftMesaId ?? mesa.id ?? mesa.mesaId),
    fecha: clean(mesa.fechaSugerida ?? mesa.fecha),
    carrera: clean(mesa.carrera),
    anio: clean(mesa.anio),
    materiaMesa: clean(mesa.materiaMesa ?? mesa.materia ?? mesa.nombreMateria),
    titular: clean(mesa.titular ?? mesa.titularNombre ?? mesa.profesorTitular),
    vocal1: clean(mesa.vocal1),
    vocal2: clean(mesa.vocal2),
    estado: clean(mesa.estado),
    alertas: formatAlertas(mesa),
    observaciones: clean(mesa.observacionesDocentes ?? mesa.observaciones),
    correccionInstitucional: clean(mesa.correccionInstitucional),
  }))
}

export function exportGeneratedTribunalsForReview(input = {}, options = {}) {
  const rows = buildGeneratedTribunalsReviewRows(input)
  const columns = getGeneratedTribunalsReviewExportColumns()

  return {
    columns,
    rows,
    metadata: {
      totalRows: rows.length,
      generatedAt: clean(options.generatedAt),
      format: 'normalizedRows',
      institutionalReview: true,
    },
  }
}
