import { useMemo, useState } from 'react'
import { buildRegularExamPreviewIntegrationContract } from '../../utils/examEngine/preview'
import {
  buildRegularExamComparisonAuditSummary,
  buildRegularExamComparisonReport,
  buildRegularExamEngineComparison,
  buildRegularExamInputFromWorkspaceSnapshot,
  exportRegularExamComparisonAuditSummary,
} from '../../utils/examEngine/comparison/index.js'
import { legacyWorkspaceSnapshot } from '../../utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshot.fixture.js'
import { legacyWorkspaceSnapshotStress } from '../../utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotStress.fixture.js'
import { legacyWorkspaceSnapshotInstitutional } from '../../utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js'
import { legacyCronogramaResult } from '../../utils/examEngine/comparison/__fixtures__/legacyCronogramaResult.fixture.js'
import { legacyCronogramaStressResult } from '../../utils/examEngine/comparison/__fixtures__/legacyCronogramaStressResult.fixture.js'
import { legacyCronogramaInstitutionalResult } from '../../utils/examEngine/comparison/__fixtures__/legacyCronogramaInstitutionalResult.fixture.js'

const AUDIT_FIXTURES = {
  normal: {
    label: 'normal',
    snapshot: legacyWorkspaceSnapshot,
    legacyResult: legacyCronogramaResult,
    periodLabel: 'Fixture normal',
  },
  stress: {
    label: 'stress',
    snapshot: legacyWorkspaceSnapshotStress,
    legacyResult: legacyCronogramaStressResult,
    periodLabel: 'Fixture stress',
  },
  institucional: {
    label: 'institucional',
    snapshot: legacyWorkspaceSnapshotInstitutional,
    legacyResult: legacyCronogramaInstitutionalResult,
    periodLabel: 'Fixture institucional',
  },
}

const INITIAL_STATE = {
  phase: 'idle',
  mode: null,
  error: null,
  comparison: null,
  report: null,
  summary: null,
  exported: null,
}

function cloneValue(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function normalizePhase(status) {
  const normalizedStatus = String(status ?? '').toUpperCase()
  if (normalizedStatus === 'OK') return 'ok'
  if (normalizedStatus === 'WARNING') return 'warning'
  if (normalizedStatus === 'CRITICAL') return 'critical'
  return 'error'
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Si' : 'No'
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  if (typeof value === 'object') return value.nombre ?? value.message ?? value.type ?? value.id ?? '-'
  return String(value)
}

function itemKey(item, index) {
  const baseKey = item?.mesaKey ?? item?.id ?? item?.type ?? item?.code ?? item?.message ?? 'item'
  return `${baseKey}-${index}`
}

function buildAudit(mode) {
  const fixture = AUDIT_FIXTURES[mode]
  if (!fixture) throw new Error(`Modo de auditoria desconocido: ${mode}`)

  const snapshot = cloneValue(fixture.snapshot)
  const legacyResult = cloneValue(fixture.legacyResult)
  const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
  const contract = buildRegularExamPreviewIntegrationContract(input, {})
  const comparison = buildRegularExamEngineComparison({
    legacyResult,
    newPreview: contract.preview,
  })
  const report = buildRegularExamComparisonReport(comparison)
  const summary = buildRegularExamComparisonAuditSummary(report)
  const exported = exportRegularExamComparisonAuditSummary(summary, {
    institutionName: 'Auditoria interna examEngine',
    periodLabel: fixture.periodLabel,
  })

  return {
    mode,
    comparison,
    report,
    summary,
    exported,
    previewContract: contract,
  }
}

function MetricList({ metrics = {} }) {
  const entries = [
    ['totalLegacyMesas', 'Mesas legacy'],
    ['totalNewMesas', 'Mesas nuevo'],
    ['totalDiffs', 'Diferencias'],
    ['totalCriticalDiffs', 'Diferencias criticas'],
    ['unmatchedLegacyCount', 'Legacy sin equivalente'],
    ['unmatchedNewCount', 'Nuevas sin equivalente'],
    ['compactedNewCount', 'Compactaciones nuevas'],
  ]

  return (
    <dl className="exam-engine-comparison-audit__metrics">
      {entries.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{displayValue(metrics[key])}</dd>
        </div>
      ))}
    </dl>
  )
}

function FindingList({ title, items = [], emptyText }) {
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      {asArray(items).length > 0 ? (
        <ul>
          {asArray(items).map((item, index) => (
            <li key={itemKey(item, index)}>
              <strong>{displayValue(item.severity ?? item.type ?? item.code)}</strong>
              {' - '}
              {displayValue(item.message ?? item.suggestedAction ?? item.materia ?? item.mesaKey)}
              {item.suggestedAction ? ` - ${displayValue(item.suggestedAction)}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  )
}

function UnmatchedList({ title, items = [] }) {
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      {asArray(items).length > 0 ? (
        <ul>
          {asArray(items).map((mesa, index) => (
            <li key={itemKey(mesa, index)}>
              {displayValue(mesa.carrera)}
              {' - '}
              {displayValue(mesa.materia ?? mesa.nombreMateria)}
              {' - '}
              {displayValue(mesa.llamado)}
            </li>
          ))}
        </ul>
      ) : (
        <p>Sin mesas sin equivalente.</p>
      )}
    </section>
  )
}

export function RegularExamComparisonAudit() {
  const [state, setState] = useState(INITIAL_STATE)

  const exportText = useMemo(() => (
    state.exported ? JSON.stringify(state.exported, null, 2) : ''
  ), [state.exported])

  const generateAudit = (mode) => {
    setState((current) => ({
      ...current,
      phase: 'running',
      mode,
      error: null,
    }))

    try {
      const audit = buildAudit(mode)
      setState({
        phase: normalizePhase(audit.summary.status),
        mode,
        error: null,
        comparison: audit.comparison,
        report: audit.report,
        summary: audit.summary,
        exported: audit.exported,
      })
      return audit
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo generar la auditoria.'
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        mode,
        error: message,
      })
      return null
    }
  }

  const clearAudit = () => {
    setState(INITIAL_STATE)
  }

  const statusLabel = state.summary?.status ?? state.phase.toUpperCase()

  return (
    <section className="exam-engine-comparison-audit" aria-label="Auditoria comparativa examEngine">
      <header className="exam-engine-comparison-audit__header">
        <p className="exam-engine-comparison-audit__eyebrow">Legacy fixture vs preview nuevo</p>
        <h1>Auditoría comparativa examEngine</h1>
        <p>Auditoría interna. No reemplaza el generador oficial.</p>
        <p>No guarda, no publica y no modifica cronogramas reales.</p>
        <p aria-label="Estado de auditoria">Estado: {statusLabel}</p>
        <p aria-label="Modo activo de auditoria">Modo activo: {displayValue(state.mode)}</p>
      </header>

      <div className="exam-engine-comparison-audit__actions" aria-label="Acciones de auditoria">
        <button type="button" onClick={() => generateAudit('normal')}>
          Generar auditoría normal
        </button>
        <button type="button" onClick={() => generateAudit('stress')}>
          Generar auditoría stress
        </button>
        <button type="button" onClick={() => generateAudit('institucional')}>
          Generar auditoría institucional
        </button>
        <button type="button" onClick={clearAudit}>
          Limpiar resultado
        </button>
      </div>

      {state.phase === 'idle' ? <p>Sin auditoría generada.</p> : null}
      {state.phase === 'running' ? <p>Generando auditoría interna...</p> : null}
      {state.phase === 'error' ? (
        <section aria-label="Error de auditoria">
          <h2>Error</h2>
          <p>{displayValue(state.error)}</p>
        </section>
      ) : null}

      {state.summary ? (
        <>
          <section aria-label="Resumen de auditoria">
            <h2>Resumen</h2>
            <p>{state.summary.title}</p>
            <p>{state.summary.summaryText}</p>
          </section>

          <section aria-label="Metricas de auditoria">
            <h2>Métricas</h2>
            <MetricList metrics={state.summary.metrics} />
          </section>

          <FindingList
            title="Hallazgos"
            items={state.summary.keyFindings}
            emptyText="Sin hallazgos relevantes."
          />
          <FindingList
            title="Críticos"
            items={state.summary.criticalItems}
            emptyText="Sin críticos."
          />
          <FindingList
            title="Warnings"
            items={state.summary.warnings}
            emptyText="Sin warnings."
          />
          <FindingList
            title="Recomendaciones"
            items={asArray(state.summary.recommendedActions).map((action) => ({
              type: 'RECOMMENDATION',
              message: action,
            }))}
            emptyText="Sin recomendaciones."
          />

          <UnmatchedList
            title="Mesas legacy sin equivalente"
            items={state.comparison?.unmatchedLegacyMesas}
          />
          <UnmatchedList
            title="Mesas nuevas sin equivalente"
            items={state.comparison?.unmatchedNewMesas}
          />

          <section aria-label="Export interno serializable">
            <h2>Export interno</h2>
            <details>
              <summary>Ver export interno</summary>
              <pre>{exportText}</pre>
            </details>
          </section>
        </>
      ) : null}
    </section>
  )
}

export default RegularExamComparisonAudit
