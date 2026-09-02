import { useState } from 'react'
import { useRegularExamPreviewEngine } from '../../hooks/useRegularExamPreviewEngine'

const MAX_VISIBLE_ISSUES = 20
const MAX_VISIBLE_TABLE_ROWS = 50

const SUMMARY_ITEMS = [
  ['totalPlanned', 'Mesas planificadas'],
  ['totalUnassigned', 'Mesas pendientes'],
  ['totalCriticalErrors', 'Errores criticos'],
  ['totalWarnings', 'Advertencias'],
  ['totalPendingManualReview', 'Revision manual'],
  ['totalCompactadas', 'Compactaciones'],
  ['cantidadLlamados', 'Cantidad de llamados'],
  ['compactMode', 'Modo compactacion'],
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function hasKeys(value) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Si' : 'No'
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  if (typeof value === 'object') return value.nombre ?? value.label ?? value.id ?? '-'
  return String(value)
}

function displayTeacher(value) {
  return displayValue(value)
}

function displayVocales(value) {
  const vocales = asArray(value).map((vocal) => displayTeacher(vocal)).filter((name) => name !== '-')
  return vocales.length > 0 ? vocales.join(', ') : '-'
}

function getStatusLabel(phase, status) {
  return `${phase ?? 'idle'} / ${status ?? 'IDLE'}`
}

function limitedItems(items = [], expanded = false, limit = MAX_VISIBLE_ISSUES) {
  return expanded ? asArray(items) : asArray(items).slice(0, limit)
}

function LimitNotice({ shown, total, onShowMore, label }) {
  if (total <= shown) return null

  return (
    <p>
      Mostrando {shown} de {total}.{' '}
      <button type="button" onClick={onShowMore}>
        Ver mas {label}
      </button>
    </p>
  )
}

export function RegularExamPreviewScreen({ input = null, initialFilters = {} } = {}) {
  const [expandedSections, setExpandedSections] = useState({})
  const {
    phase,
    status,
    uiDto,
    filteredDto,
    canExportJson,
    errors,
    warnings,
    actions,
  } = useRegularExamPreviewEngine()

  const summary = uiDto?.uiSummary
  const plannedRows = asArray(filteredDto?.uiTables?.planned)
  const unassignedRows = asArray(filteredDto?.uiTables?.unassigned)
  const alerts = asArray(filteredDto?.uiAlerts)
  const visibleErrors = limitedItems(errors, expandedSections.errors)
  const visibleWarnings = limitedItems(warnings, expandedSections.warnings)
  const visiblePlannedRows = limitedItems(plannedRows, expandedSections.plannedRows, MAX_VISIBLE_TABLE_ROWS)
  const visibleUnassignedRows = limitedItems(unassignedRows, expandedSections.unassignedRows, MAX_VISIBLE_TABLE_ROWS)
  const visibleAlerts = limitedItems(alerts, expandedSections.alerts)
  const hasInitialFilters = hasKeys(initialFilters)
  const isLoading = phase === 'loading'
  const hasPreview = phase && phase !== 'idle' && !isLoading
  const expandSection = (section) => setExpandedSections((current) => ({ ...current, [section]: true }))

  return (
    <section className="exam-engine-preview" aria-label="Preview del motor nuevo de examenes">
      <header className="exam-engine-preview__header">
        <p className="exam-engine-preview__eyebrow">Motor nuevo en modo vista previa</p>
        <h1>Preview de Mesas de Exámenes</h1>
        <p>Este preview no reemplaza el cronograma oficial.</p>
        <p aria-label="Estado del preview">Estado: {getStatusLabel(phase, status)}</p>
        {hasInitialFilters ? <p>Filtros iniciales preparados: {Object.keys(initialFilters).length}</p> : null}
      </header>

      <div className="exam-engine-preview__actions" aria-label="Acciones de preview">
        <button type="button" disabled={isLoading} onClick={() => actions.generatePreview(input)}>
          Generar preview
        </button>
        <button type="button" onClick={() => actions.clearFilters()}>
          Limpiar filtros
        </button>
        <button type="button" disabled={!canExportJson} onClick={() => actions.exportJson()}>
          Exportar JSON interno
        </button>
        <button type="button" onClick={() => actions.resetPreview()}>
          Resetear
        </button>
        <button type="button" disabled>
          Guardar cronograma oficial
        </button>
        <button type="button" disabled>
          Publicar cronograma
        </button>
      </div>

      {phase === 'idle' ? <p>Sin preview generado. Use Generar preview para iniciar.</p> : null}
      {isLoading ? <p>Generando preview...</p> : null}

      {asArray(errors).length > 0 ? (
        <section aria-label="Errores del preview">
          <h2>Errores</h2>
          <LimitNotice
            label="errores"
            shown={visibleErrors.length}
            total={asArray(errors).length}
            onShowMore={() => expandSection('errors')}
          />
          <ul>
            {visibleErrors.map((error, index) => (
              <li key={error.code ?? error.message ?? index}>{displayValue(error.message ?? error.code ?? error)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {asArray(warnings).length > 0 ? (
        <section aria-label="Advertencias del preview">
          <h2>Advertencias</h2>
          <LimitNotice
            label="advertencias"
            shown={visibleWarnings.length}
            total={asArray(warnings).length}
            onShowMore={() => expandSection('warnings')}
          />
          <ul>
            {visibleWarnings.map((warning, index) => (
              <li key={warning.code ?? warning.message ?? index}>
                {displayValue(warning.message ?? warning.code ?? warning)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasPreview ? (
        <>
          <section aria-label="Resumen del preview">
            <h2>Resumen</h2>
            {summary ? (
              <dl className="exam-engine-preview__summary">
                {SUMMARY_ITEMS.map(([key, label]) => (
                  <div key={key} className="exam-engine-preview__summary-item">
                    <dt>{label}</dt>
                    <dd>{displayValue(summary[key])}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>No hay resumen disponible.</p>
            )}
          </section>

          <section aria-label="Mesas planificadas">
            <h2>Mesas planificadas</h2>
            <LimitNotice
              label="mesas planificadas"
              shown={visiblePlannedRows.length}
              total={plannedRows.length}
              onShowMore={() => expandSection('plannedRows')}
            />
            {plannedRows.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Alerta</th>
                    <th>Materia</th>
                    <th>Carrera</th>
                    <th>Año</th>
                    <th>Llamado</th>
                    <th>Fecha</th>
                    <th>Turno</th>
                    <th>Estado</th>
                    <th>Titular</th>
                    <th>Vocales</th>
                    <th>Compactada</th>
                    <th>Advertencias</th>
                    <th>Errores</th>
                    <th>Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlannedRows.map((row, index) => (
                    <tr key={row.id ?? `${row.materia}-${index}`}>
                      <td>{displayValue(row.alertLevel)}</td>
                      <td>{displayValue(row.materia)}</td>
                      <td>{displayValue(row.carrera)}</td>
                      <td>{displayValue(row.anio ?? row.año)}</td>
                      <td>{displayValue(row.llamado)}</td>
                      <td>{displayValue(row.displayDate)}</td>
                      <td>{displayValue(row.turno)}</td>
                      <td>{displayValue(row.displayStatus)}</td>
                      <td>{displayTeacher(row.titular)}</td>
                      <td>{displayVocales(row.vocales)}</td>
                      <td>{displayValue(row.compactada)}</td>
                      <td>{displayValue(row.warningsCount)}</td>
                      <td>{displayValue(row.errorsCount)}</td>
                      <td>{displayValue(row.reviewRequired)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Sin mesas planificadas.</p>
            )}
          </section>

          <section aria-label="Mesas pendientes">
            <h2>Pendientes</h2>
            <LimitNotice
              label="mesas pendientes"
              shown={visibleUnassignedRows.length}
              total={unassignedRows.length}
              onShowMore={() => expandSection('unassignedRows')}
            />
            {unassignedRows.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Alerta</th>
                    <th>Materia</th>
                    <th>Carrera</th>
                    <th>Año</th>
                    <th>Llamado</th>
                    <th>Estado</th>
                    <th>Motivo</th>
                    <th>Mensaje</th>
                    <th>Acción sugerida</th>
                    <th>Advertencias</th>
                    <th>Errores</th>
                    <th>Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUnassignedRows.map((row, index) => (
                    <tr key={row.id ?? `${row.materia}-${index}`}>
                      <td>{displayValue(row.alertLevel)}</td>
                      <td>{displayValue(row.materia)}</td>
                      <td>{displayValue(row.carrera)}</td>
                      <td>{displayValue(row.anio ?? row.año)}</td>
                      <td>{displayValue(row.llamado)}</td>
                      <td>{displayValue(row.estado)}</td>
                      <td>{displayValue(row.reason)}</td>
                      <td>{displayValue(row.message)}</td>
                      <td>{displayValue(row.suggestedAction)}</td>
                      <td>{displayValue(row.warningsCount)}</td>
                      <td>{displayValue(row.errorsCount)}</td>
                      <td>{displayValue(row.reviewRequired)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Sin pendientes.</p>
            )}
          </section>

          <section aria-label="Alertas">
            <h2>Alertas</h2>
            <LimitNotice
              label="alertas"
              shown={visibleAlerts.length}
              total={alerts.length}
              onShowMore={() => expandSection('alerts')}
            />
            {alerts.length > 0 ? (
              <ul>
                {visibleAlerts.map((alert, index) => (
                  <li key={alert.id ?? alert.code ?? `${alert.message}-${index}`}>
                    <strong>{displayValue(alert.severity)}</strong>
                    {' - '}
                    {displayValue(alert.message)}
                    {' - '}
                    {displayValue(alert.materia)}
                    {' - '}
                    {displayValue(alert.carrera)}
                    {' - '}
                    {displayValue(alert.llamado)}
                    {' - '}
                    {displayValue(alert.fecha)}
                    {' - '}
                    {displayValue(alert.docenteNombre)}
                    {' - '}
                    {displayValue(alert.suggestedAction)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Sin alertas.</p>
            )}
          </section>
        </>
      ) : null}
    </section>
  )
}

export default RegularExamPreviewScreen
