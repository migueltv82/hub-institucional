const DRAFT_TEACHER_EXPORT_COLUMNS = [
  { key: 'draftMesaId', label: 'ID Mesa' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'carrera', label: 'Carrera' },
  { key: 'anio', label: 'A\u00f1o' },
  { key: 'materiaMesa', label: 'Materia/Mesa' },
  { key: 'titular', label: 'Titular' },
  { key: 'estadoVisible', label: 'Estado' },
  { key: 'observaciones', label: 'Observaciones' },
  { key: 'correccionSugerida', label: 'Correcci\u00f3n sugerida' },
  { key: 'confirmada', label: 'Confirmada' },
  { key: 'excluirMesa', label: 'Excluir mesa' },
  { key: 'nuevoTitularSugerido', label: 'Nuevo titular sugerido' },
  { key: 'nuevaFechaSugerida', label: 'Nueva fecha sugerida' },
  { key: 'observacionesDocentes', label: 'Observaciones docentes' },
]

function clean(value) {
  return String(value ?? '').trim()
}

function getDraftSchedule(input = {}) {
  if (Array.isArray(input)) return input
  if (Array.isArray(input.draftSchedule)) return input.draftSchedule
  if (Array.isArray(input.precronograma)) return input.precronograma
  if (Array.isArray(input.mesas)) return input.mesas
  return []
}

function formatObservaciones(mesa = {}) {
  const explicit = clean(mesa.observaciones)
  if (explicit) return explicit

  return (mesa.alertas ?? [])
    .filter((alerta) => alerta?.severity !== 'info')
    .map((alerta) => clean(alerta.message ?? alerta.code ?? alerta))
    .filter(Boolean)
    .join(' ')
}

function formatDraftStatus(value) {
  const status = clean(value)
  const labels = {
    TEACHER_REVIEW: 'Revision docente',
    READY: 'Lista',
    REVIEWED: 'Revisada',
    READY_FOR_TRIBUNAL: 'Lista para tribunal',
    EXCLUDED_BY_REVIEW: 'Excluida',
    NEEDS_INSTITUTIONAL_REVIEW: 'Revision institucional',
  }

  return labels[status] ?? (status ? status.replaceAll('_', ' ').toLowerCase() : 'Sin estado')
}

export function getDraftScheduleTeacherExportColumns() {
  return DRAFT_TEACHER_EXPORT_COLUMNS.map((column) => ({ ...column }))
}

export function buildDraftScheduleTeacherRows(input = {}) {
  return getDraftSchedule(input).map((mesa) => ({
    draftMesaId: clean(mesa.draftMesaId ?? mesa.id ?? mesa.mesaId),
    fecha: clean(mesa.fechaSugerida ?? mesa.fecha),
    carrera: clean(mesa.carrera),
    anio: clean(mesa.anio),
    materiaMesa: clean(mesa.materiaMesa ?? mesa.materia ?? mesa.nombreMateria),
    titular: clean(mesa.titular ?? mesa.titularNombre ?? mesa.profesorTitular),
    estadoVisible: formatDraftStatus(mesa.estado),
    estado: clean(mesa.estado),
    observaciones: formatObservaciones(mesa),
    correccionSugerida: clean(mesa.correccionSugerida ?? mesa.correccion_sugerida),
    confirmada: clean(mesa.confirmada),
    excluirMesa: clean(mesa.excluirMesa ?? mesa.excluida),
    nuevoTitularSugerido: clean(mesa.nuevoTitularSugerido),
    nuevaFechaSugerida: clean(mesa.nuevaFechaSugerida),
    observacionesDocentes: clean(mesa.observacionesDocentes),
  }))
}

export function exportDraftScheduleForTeachers(input = {}, options = {}) {
  const rows = buildDraftScheduleTeacherRows(input)
  const columns = getDraftScheduleTeacherExportColumns()

  return {
    columns,
    rows,
    metadata: {
      totalRows: rows.length,
      generatedAt: clean(options.generatedAt),
      format: 'normalizedRows',
      teacherReview: true,
    },
  }
}
