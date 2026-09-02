const FINAL_ALERT_COLUMNS = [
  { key: 'draftMesaId', label: 'ID Mesa' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'carrera', label: 'Carrera' },
  { key: 'materiaMesa', label: 'Materia/Mesa' },
  { key: 'estadoFinal', label: 'Estado final' },
  { key: 'alerta', label: 'Alerta' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'accionSugerida', label: 'Acci\u00f3n sugerida' },
]

const PENDING_FINAL_STATUSES = new Set([
  'FINAL_NEEDS_REVIEW',
  'FINAL_INCOMPLETE',
  'FINAL_BLOCKED_BY_VALIDATION',
])

function clean(value) {
  return String(value ?? '').trim()
}

function getFinalTribunals(input = {}) {
  if (Array.isArray(input)) return input
  if (Array.isArray(input.finalTribunals)) return input.finalTribunals
  return []
}

function getActionSuggestion(alert = {}, mesa = {}) {
  if (alert.code === 'FINAL_TEACHER_EXCEEDS_HALF_PLUS_ONE') return 'Reasignar vocal o aprobar excepcion institucional documentada.'
  if (alert.code === 'FINAL_MAX_DAILY_PARTICIPATIONS_EXCEEDED') return 'Cambiar vocal o redistribuir participaciones del dia.'
  if (alert.code === 'FINAL_TITULAR_REPEATED_AS_VOCAL') return 'Reemplazar el vocal repetido.'
  if (alert.code === 'FINAL_DUPLICATED_VOCALS') return 'Seleccionar dos vocales distintos.'
  if (alert.code === 'FINAL_VOCAL_NOT_FOUND') return 'Corregir el nombre/ID del vocal o cargar el docente.'
  if (alert.code === 'FINAL_TITULAR_NOT_FOUND') return 'Corregir o cargar titular antes de oficializar.'
  if (alert.code === 'FINAL_TRIBUNAL_INCOMPLETE' && mesa.tribunalMinimoAceptado !== true) return 'Completar vocal faltante o aceptar tribunal minimo.'
  if (alert.code === 'FINAL_MANUAL_OVERRIDE_REQUIRES_REVIEW') return 'Revisar el cambio manual y confirmar criterio institucional.'
  return 'Revisar la mesa y corregir antes de export oficial definitivo.'
}

function getMesaAlerts(mesa = {}) {
  const alerts = mesa.alertasFinales ?? mesa.finalValidation?.alerts ?? []
  if (alerts.length) return alerts

  if (PENDING_FINAL_STATUSES.has(mesa.estadoFinal)) {
    return [{
      code: mesa.estadoFinal,
      message: 'La mesa requiere revision antes de oficializar.',
      severity: 'warning',
    }]
  }

  return []
}

export function getFinalTribunalAlertsExportColumns() {
  return FINAL_ALERT_COLUMNS.map((column) => ({ ...column }))
}

export function buildFinalTribunalAlertRows(input = {}) {
  return getFinalTribunals(input)
    .filter((mesa) => PENDING_FINAL_STATUSES.has(mesa.estadoFinal) || getMesaAlerts(mesa).some((alert) => alert.severity !== 'info'))
    .flatMap((mesa) => getMesaAlerts(mesa)
      .filter((alert) => alert.severity !== 'info')
      .map((alert) => ({
        draftMesaId: clean(mesa.draftMesaId ?? mesa.id),
        fecha: clean(mesa.fechaSugerida ?? mesa.fecha),
        carrera: clean(mesa.carrera),
        materiaMesa: clean(mesa.materiaMesa ?? mesa.materia),
        estadoFinal: clean(mesa.estadoFinal),
        alerta: clean(alert.code),
        detalle: clean(alert.message ?? alert.code),
        accionSugerida: getActionSuggestion(alert, mesa),
      })))
}

export function exportFinalTribunalAlerts(input = {}, options = {}) {
  const rows = buildFinalTribunalAlertRows(input)
  const columns = getFinalTribunalAlertsExportColumns()

  return {
    columns,
    rows,
    metadata: {
      totalRows: rows.length,
      generatedAt: clean(options.generatedAt),
      format: 'normalizedRows',
      alertsOnly: true,
    },
  }
}
