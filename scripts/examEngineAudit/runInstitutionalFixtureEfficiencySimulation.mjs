import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { legacyWorkspaceSnapshotInstitutional } from '../../src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import { buildExamEngineEfficiencySummary } from '../../src/utils/examEngine/audit/efficiencySummary.js'

const SAFE_SUMMARY_FIELDS = [
  'totalMaterias',
  'totalDocentes',
  'totalFechasDisponibles',
  'phase',
  'status',
  'totalPlanned',
  'totalUnassigned',
  'totalMesas',
  'totalCriticalErrors',
  'totalWarnings',
  'totalPendingManualReview',
  'totalCompactadas',
  'cantidadLlamados',
  'tipoPeriodo',
  'compactMode',
  'mesasCompletas',
  'mesasConUnVocal',
  'mesasSinTribunal',
  'mesasSinFecha',
  'docentesEnLimite',
  'docentesExcedidos',
  'completionRate',
  'conclusion',
  'recommendations',
]

function pickSafeSummary(summary = {}) {
  return SAFE_SUMMARY_FIELDS.reduce((result, field) => {
    result[field] = summary[field]
    return result
  }, {})
}

const snapshot = structuredClone(legacyWorkspaceSnapshotInstitutional)
const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
const contract = buildRegularExamPreviewIntegrationContract(input, {})
const summary = buildExamEngineEfficiencySummary({
  contract,
  input,
  metadata: {
    source: 'institutional-fixture',
    readOnly: true,
  },
})

console.log(JSON.stringify(pickSafeSummary(summary), null, 2))
