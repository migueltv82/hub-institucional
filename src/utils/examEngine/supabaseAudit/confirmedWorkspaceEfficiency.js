const WORKSPACE_SNAPSHOTS_TABLE = 'workspace_snapshots'

const PAYLOAD_CANDIDATE_KEYS = [
  'payload',
  'data',
  'snapshot',
  'workspace',
  'workspace_payload',
  'state',
]

const INSTITUTION_CANDIDATE_KEYS = [
  'institution_id',
  'institutionId',
  'school_id',
  'schoolId',
]

const WORKSPACE_CANDIDATE_KEYS = [
  'workspace_key',
  'workspaceKey',
  'workspace',
  'key',
]

const UPDATED_AT_CANDIDATE_KEYS = [
  'updated_at',
  'updatedAt',
  'created_at',
  'createdAt',
  'saved_at',
  'savedAt',
  'timestamp',
]

const SNAPSHOT_ID_CANDIDATE_KEYS = [
  'id',
  'snapshot_id',
  'snapshotId',
  'uuid',
]

const CAUSE_GROUPS = [
  {
    key: 'sinTitular',
    label: 'sin titular',
    patterns: ['TITULAR_REQUIRED', 'MESA_SIN_TITULAR', 'MATERIA_SIN_TITULAR', 'SIN_TITULAR', 'MESA SIN TITULAR', 'MATERIA SIN TITULAR'],
  },
  {
    key: 'titularInexistente',
    label: 'titular inexistente',
    patterns: ['TITULAR_NOT_FOUND', 'TITULAR_INEXISTENTE', 'TITULAR NO ENCONTRADO'],
  },
  {
    key: 'titularSinDisponibilidad',
    label: 'titular sin disponibilidad',
    patterns: ['TITULAR_SIN_DISPONIBILIDAD', 'TITULAR_NO_DISPONIBLE', 'TITULAR_INACTIVE', 'TITULAR_TURNO_NO_COINCIDE'],
  },
  {
    key: 'sinCandidatosVocales',
    label: 'sin candidatos vocales',
    patterns: ['SIN_CANDIDATOS_VOCALES', 'VOCAL_REQUIRED', 'NO_VOCAL_CANDIDATES', 'TRIBUNAL_INCOMPLETO'],
  },
  {
    key: 'vocalesSinAfinidad',
    label: 'vocales sin afinidad',
    patterns: ['VOCAL_SIN_AFINIDAD', 'AFINIDAD', 'AFFINITY'],
  },
  {
    key: 'faltaDeFechas',
    label: 'falta de fechas',
    patterns: ['SIN_FECHA_VALIDA', 'MESA_SIN_FECHA', 'NO_FECHAS', 'MISSING_DATES', 'FECHAS_DISPONIBLES'],
  },
  {
    key: 'fechaNoAsignable',
    label: 'fecha no asignable',
    patterns: ['DOCENTE_SUPERPUESTO', 'NO_DISPONIBLE', 'DISPONIBILIDAD', 'TURNO_NO_DEFINIDO', 'LLAMADO_NO_REQUERIDO'],
  },
  {
    key: 'correlatividadConflictiva',
    label: 'correlatividad conflictiva',
    patterns: ['CORRELATIVIDAD_CONFLICTIVA', 'CORRELATIVIDAD', 'CORRELATIVITY'],
  },
  {
    key: 'adaptador',
    label: 'adaptador',
    patterns: ['ADAPTER', 'ADAPTADOR', 'LEGACY_WORKSPACE', 'SNAPSHOT_ADAPTER'],
  },
  {
    key: 'datosIncompletos',
    label: 'datos incompletos',
    patterns: ['MISSING', 'REQUIRED', 'INVALID', 'SIN_DATO', 'INCOMPLETO'],
  },
  {
    key: 'algoritmo',
    label: 'algoritmo',
    patterns: ['PREVIEW_INTEGRATION_ERROR', 'PIPELINE', 'COMPACTACION', 'REPAIR', 'PLAN_TENTATIVE_DATES'],
  },
]

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function hasOwnKey(row, key) {
  return Boolean(row) && Object.prototype.hasOwnProperty.call(row, key)
}

function findCandidateKey(row, candidates) {
  return candidates.find((key) => hasOwnKey(row, key)) ?? null
}

function collectColumns(rows = []) {
  const columns = new Set()
  asArray(rows).forEach((row) => {
    if (!row || typeof row !== 'object') return
    Object.keys(row).forEach((key) => columns.add(key))
  })
  return [...columns]
}

function countRows(value) {
  return Array.isArray(value) ? value.length : 0
}

function getPayloadCounts(payload = {}) {
  return {
    alumnos: countRows(payload.alumnos),
    docentes: countRows(payload.docentes),
    horariosDocentes: countRows(payload.horariosDocentes),
    planesEstudio: countRows(payload.planesEstudio),
    correlatividades: countRows(payload.correlatividades),
  }
}

function hasUsefulSnapshotPayload(payload = {}) {
  const counts = getPayloadCounts(payload)
  return (
    counts.horariosDocentes > 0 ||
    counts.planesEstudio > 0 ||
    counts.correlatividades > 0 ||
    counts.docentes > 0 ||
    counts.alumnos > 0
  )
}

function isMissingColumnError(error) {
  const code = clean(error?.code)
  const text = [
    error?.message,
    error?.details,
    error?.hint,
    error,
  ].map((value) => clean(value).toLowerCase()).join(' ')

  return (
    code === '42703' ||
    code === 'PGRST204' ||
    text.includes('schema cache') ||
    text.includes('column') ||
    text.includes('could not find')
  )
}

function getSafeSchema(rows = []) {
  const columns = collectColumns(rows)
  return {
    columns,
    payloadCandidateKeys: PAYLOAD_CANDIDATE_KEYS.filter((key) => columns.includes(key)),
    institutionCandidateKeys: INSTITUTION_CANDIDATE_KEYS.filter((key) => columns.includes(key)),
    workspaceCandidateKeys: WORKSPACE_CANDIDATE_KEYS.filter((key) => columns.includes(key)),
    updatedAtCandidateKeys: UPDATED_AT_CANDIDATE_KEYS.filter((key) => columns.includes(key)),
    idCandidateKeys: SNAPSHOT_ID_CANDIDATE_KEYS.filter((key) => columns.includes(key)),
  }
}

function rowMatchesCandidate(row, candidateKeys, expectedValue) {
  if (!clean(expectedValue)) return false
  return candidateKeys.some((key) => hasOwnKey(row, key) && clean(row[key]) === clean(expectedValue))
}

function pickVisibleSnapshotRow(rows = [], {
  institutionId,
  workspaceKey,
  payloadKey = null,
} = {}) {
  const safeRows = asArray(rows)
  const scoredRows = safeRows
    .map((row, index) => {
      const resolvedPayloadKey = payloadKey || findCandidateKey(row, PAYLOAD_CANDIDATE_KEYS)
      const payload = resolvedPayloadKey ? row[resolvedPayloadKey] : null
      const counts = getPayloadCounts(payload)

      return {
        row,
        index,
        payloadKey: resolvedPayloadKey,
        counts,
        useful: hasUsefulSnapshotPayload(payload),
        institutionMatches: rowMatchesCandidate(row, INSTITUTION_CANDIDATE_KEYS, institutionId),
        workspaceMatches: rowMatchesCandidate(row, WORKSPACE_CANDIDATE_KEYS, workspaceKey),
      }
    })
    .filter((entry) => entry.payloadKey && entry.useful)

  scoredRows.sort((left, right) => (
    Number(right.institutionMatches) - Number(left.institutionMatches) ||
    Number(right.workspaceMatches) - Number(left.workspaceMatches) ||
    right.counts.planesEstudio - left.counts.planesEstudio ||
    right.counts.horariosDocentes - left.counts.horariosDocentes ||
    right.counts.correlatividades - left.counts.correlatividades ||
    left.index - right.index
  ))

  return scoredRows[0] ?? null
}

function buildReadDiagnostic({
  rows = [],
  exactRows = [],
  institutionId,
  workspaceKey,
  error = null,
} = {}) {
  const schema = getSafeSchema(rows)
  return {
    table: WORKSPACE_SNAPSHOTS_TABLE,
    columns: schema.columns,
    payloadCandidateKeys: schema.payloadCandidateKeys,
    institutionCandidateKeys: schema.institutionCandidateKeys,
    workspaceCandidateKeys: schema.workspaceCandidateKeys,
    updatedAtCandidateKeys: schema.updatedAtCandidateKeys,
    idCandidateKeys: schema.idCandidateKeys,
    visibleRows: asArray(rows).length,
    exactFilteredRows: asArray(exactRows).length,
    foundInstitutionId: asArray(rows).some((row) => rowMatchesCandidate(row, INSTITUTION_CANDIDATE_KEYS, institutionId)),
    foundWorkspaceKey: asArray(rows).some((row) => rowMatchesCandidate(row, WORKSPACE_CANDIDATE_KEYS, workspaceKey)),
    possibleRlsOrSessionIssue: asArray(rows).length === 0 || Boolean(error),
    errorMessage: error?.message ?? null,
    nextAction: asArray(rows).length === 0
      ? 'Usar un JWT de usuario autenticado no-service-role o revisar RLS de workspace_snapshots para la publishable/anon key.'
      : 'Verificar columnas institution/workspace/payload y reintentar con los nombres detectados.',
  }
}

async function readExactWorkspaceSnapshot({ supabase, institutionId, workspaceKey }) {
  let query = supabase
    .from(WORKSPACE_SNAPSHOTS_TABLE)
    .select('*')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .order('updated_at', { ascending: false })

  let result = await query.limit(1)

  if (result.error && isMissingColumnError(result.error)) {
    result = await supabase
      .from(WORKSPACE_SNAPSHOTS_TABLE)
      .select('*')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .limit(1)
  }

  return result
}

async function readVisibleWorkspaceSnapshotRows({ supabase, limit = 50 }) {
  return supabase
    .from(WORKSPACE_SNAPSHOTS_TABLE)
    .select('*')
    .limit(limit)
}

export async function readConfirmedWorkspaceSnapshot({
  supabase,
  institutionId,
  workspaceKey = 'main',
} = {}) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('Se requiere un cliente Supabase inyectado.')
  }
  if (!clean(institutionId)) {
    throw new Error('institutionId es obligatorio.')
  }
  if (!clean(workspaceKey)) {
    throw new Error('workspaceKey es obligatorio.')
  }

  const exactResult = await readExactWorkspaceSnapshot({ supabase, institutionId, workspaceKey })

  if (exactResult.error && !isMissingColumnError(exactResult.error)) {
    const visibleResult = await readVisibleWorkspaceSnapshotRows({ supabase })
    const diagnostic = buildReadDiagnostic({
      rows: visibleResult.data,
      exactRows: [],
      institutionId,
      workspaceKey,
      error: exactResult.error,
    })

    return {
      ok: false,
      snapshot: null,
      metadata: null,
      diagnostic,
    }
  }

  const exactRows = asArray(exactResult.data)
  const exactPick = pickVisibleSnapshotRow(exactRows, { institutionId, workspaceKey })
  if (exactPick) {
    const row = exactPick.row
    const updatedAtKey = findCandidateKey(row, UPDATED_AT_CANDIDATE_KEYS)
    const idKey = findCandidateKey(row, SNAPSHOT_ID_CANDIDATE_KEYS)

    return {
      ok: true,
      snapshot: cloneJson(row[exactPick.payloadKey]),
      metadata: {
        source: 'supabase',
        table: WORKSPACE_SNAPSHOTS_TABLE,
        institutionId,
        workspaceKey,
        updatedAt: updatedAtKey ? row[updatedAtKey] ?? null : null,
        snapshotId: idKey ? row[idKey] ?? null : null,
        payloadKeyUsed: exactPick.payloadKey,
        readMode: 'exact-filter',
        readOnly: true,
      },
      diagnostic: buildReadDiagnostic({
        rows: exactRows,
        exactRows,
        institutionId,
        workspaceKey,
      }),
    }
  }

  const visibleResult = await readVisibleWorkspaceSnapshotRows({ supabase })
  const visibleRows = asArray(visibleResult.data)
  const fallbackPick = pickVisibleSnapshotRow(visibleRows, { institutionId, workspaceKey })

  if (!visibleResult.error && fallbackPick) {
    const row = fallbackPick.row
    const updatedAtKey = findCandidateKey(row, UPDATED_AT_CANDIDATE_KEYS)
    const idKey = findCandidateKey(row, SNAPSHOT_ID_CANDIDATE_KEYS)

    return {
      ok: true,
      snapshot: cloneJson(row[fallbackPick.payloadKey]),
      metadata: {
        source: 'supabase',
        table: WORKSPACE_SNAPSHOTS_TABLE,
        institutionId: fallbackPick.institutionMatches ? institutionId : null,
        workspaceKey: fallbackPick.workspaceMatches ? workspaceKey : null,
        requestedInstitutionId: institutionId,
        requestedWorkspaceKey: workspaceKey,
        updatedAt: updatedAtKey ? row[updatedAtKey] ?? null : null,
        snapshotId: idKey ? row[idKey] ?? null : null,
        payloadKeyUsed: fallbackPick.payloadKey,
        readMode: 'visible-compatible-fallback',
        readOnly: true,
      },
      diagnostic: buildReadDiagnostic({
        rows: visibleRows,
        exactRows,
        institutionId,
        workspaceKey,
      }),
    }
  }

  return {
    ok: false,
    snapshot: null,
    metadata: null,
    diagnostic: buildReadDiagnostic({
      rows: visibleRows,
      exactRows,
      institutionId,
      workspaceKey,
      error: exactResult.error || visibleResult.error,
    }),
  }
}

function getIssueCode(issue = {}) {
  return clean(issue.code ?? issue.type ?? issue.reason ?? issue.stage ?? issue.message).toUpperCase()
}

function collectIssueEntries(contract = {}) {
  return [
    ...asArray(contract.errors),
    ...asArray(contract.warnings),
    ...asArray(contract.uiDto?.uiAlerts),
    ...asArray(contract.uiDto?.uiPendingReview),
    ...asArray(contract.preview?.errors),
    ...asArray(contract.preview?.warnings),
    ...asArray(contract.preview?.unassignedMesas).flatMap((mesa) => [
      { code: mesa.reason, severity: 'critical' },
      ...asArray(mesa.errors),
      ...asArray(mesa.warnings),
    ]),
  ].filter(Boolean)
}

function incrementCause(target, group, code) {
  const current = target[group.key] ?? {
    label: group.label,
    count: 0,
    topCodes: {},
  }
  current.count += 1
  if (code) {
    current.topCodes[code] = (current.topCodes[code] ?? 0) + 1
  }
  target[group.key] = current
}

export function groupFailureCauses({ contract = {}, input = {} } = {}) {
  const grouped = CAUSE_GROUPS.reduce((result, group) => {
    result[group.key] = {
      label: group.label,
      count: 0,
      topCodes: {},
    }
    return result
  }, {})

  collectIssueEntries(contract).forEach((issue) => {
    const code = getIssueCode(issue)
    const text = [
      code,
      issue.message,
      issue.reason,
      issue.detail,
      issue.stage,
      issue.type,
    ].map((value) => clean(value).toUpperCase()).join(' ')

    CAUSE_GROUPS.forEach((group) => {
      if (group.patterns.some((pattern) => text.includes(pattern))) {
        incrementCause(grouped, group, code)
      }
    })
  })

  if (asArray(input.fechasDisponibles).length === 0) {
    incrementCause(grouped, CAUSE_GROUPS.find((group) => group.key === 'faltaDeFechas'), 'SIN_FECHAS_DISPONIBLES')
  }
  if (asArray(input.materias).length === 0 || asArray(input.docentes).length === 0) {
    incrementCause(grouped, CAUSE_GROUPS.find((group) => group.key === 'datosIncompletos'), 'INPUT_INCOMPLETO')
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([key, value]) => [
      key,
      {
        label: value.label,
        count: value.count,
        topCodes: Object.entries(value.topCodes)
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 5)
          .map(([code, count]) => ({ code, count })),
      },
    ]),
  )
}

export function pickEfficiencyMetrics(summary = {}) {
  return {
    totalMaterias: summary.totalMaterias ?? 0,
    totalDocentes: summary.totalDocentes ?? 0,
    totalFechasDisponibles: summary.totalFechasDisponibles ?? 0,
    phase: summary.phase ?? '',
    status: summary.status ?? '',
    totalPlanned: summary.totalPlanned ?? 0,
    totalUnassigned: summary.totalUnassigned ?? 0,
    totalMesas: summary.totalMesas ?? 0,
    mesasCompletas: summary.mesasCompletas ?? 0,
    mesasConUnVocal: summary.mesasConUnVocal ?? 0,
    mesasSinTribunal: summary.mesasSinTribunal ?? 0,
    mesasSinFecha: summary.mesasSinFecha ?? 0,
    totalCriticalErrors: summary.totalCriticalErrors ?? 0,
    totalWarnings: summary.totalWarnings ?? 0,
    totalPendingManualReview: summary.totalPendingManualReview ?? 0,
    totalCompactadas: summary.totalCompactadas ?? 0,
    docentesEnLimite: summary.docentesEnLimite ?? 0,
    docentesExcedidos: summary.docentesExcedidos ?? 0,
    completionRate: summary.completionRate ?? 0,
    conclusion: summary.conclusion ?? 'NO EFICIENTE',
  }
}

export function chooseFinalRecommendation(metrics = {}) {
  if (
    metrics.conclusion === 'EFICIENTE' &&
    Number(metrics.totalCriticalErrors) === 0 &&
    Number(metrics.totalMesas) > 0
  ) {
    return 'listo para integración interna en modo preview'
  }

  if (
    metrics.conclusion === 'PARCIALMENTE EFICIENTE' ||
    Number(metrics.totalPlanned) > 0 ||
    Number(metrics.totalMesas) > 0
  ) {
    return 'requiere ajustes de datos/adaptador antes de integrar'
  }

  return 'no integrar todavía'
}

export function buildConfirmedWorkspaceEfficiencyReport({
  metadata = {},
  snapshot = {},
  input = {},
  summary = {},
  contract = {},
  durationMs = null,
} = {}) {
  const metrics = pickEfficiencyMetrics(summary)

  return {
    source: {
      table: metadata.table ?? WORKSPACE_SNAPSHOTS_TABLE,
      source: 'Supabase workspace_snapshots',
      institutionId: metadata.institutionId ?? metadata.requestedInstitutionId ?? null,
      workspaceKey: metadata.workspaceKey ?? metadata.requestedWorkspaceKey ?? null,
      updatedAt: metadata.updatedAt ?? metadata.createdAt ?? null,
      readMode: metadata.readMode ?? null,
      counts: getPayloadCounts(snapshot),
    },
    result: {
      general: metrics.conclusion,
      durationMs,
    },
    metrics,
    failureCauses: groupFailureCauses({ contract, input }),
    finalRecommendation: chooseFinalRecommendation(metrics),
  }
}

export function buildSnapshotNotFoundReport({
  diagnostic,
  institutionId,
  workspaceKey,
} = {}) {
  return {
    ok: false,
    source: {
      table: WORKSPACE_SNAPSHOTS_TABLE,
      requestedInstitutionId: institutionId,
      requestedWorkspaceKey: workspaceKey,
    },
    diagnostic: {
      columns: diagnostic?.columns ?? [],
      visibleRows: diagnostic?.visibleRows ?? 0,
      exactFilteredRows: diagnostic?.exactFilteredRows ?? 0,
      foundInstitutionId: diagnostic?.foundInstitutionId ?? false,
      foundWorkspaceKey: diagnostic?.foundWorkspaceKey ?? false,
      payloadCandidateKeys: diagnostic?.payloadCandidateKeys ?? [],
      institutionCandidateKeys: diagnostic?.institutionCandidateKeys ?? [],
      workspaceCandidateKeys: diagnostic?.workspaceCandidateKeys ?? [],
      possibleRlsOrSessionIssue: diagnostic?.possibleRlsOrSessionIssue ?? true,
      errorMessage: diagnostic?.errorMessage ?? null,
      nextAction: diagnostic?.nextAction ?? 'Revisar RLS/sesion y reintentar con JWT de usuario autenticado no-service-role.',
    },
  }
}

export {
  WORKSPACE_SNAPSHOTS_TABLE,
  getPayloadCounts,
}
