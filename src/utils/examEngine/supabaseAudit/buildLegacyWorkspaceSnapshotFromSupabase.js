const WORKSPACE_SNAPSHOTS_TABLE = 'workspace_snapshots'

const PAYLOAD_CANDIDATE_KEYS = [
  'payload',
  'data',
  'snapshot',
  'workspace',
  'workspace_payload',
  'state',
]

const TIMESTAMP_CANDIDATE_KEYS = [
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
  'saved_at',
  'savedAt',
  'timestamp',
]

const ID_CANDIDATE_KEYS = [
  'id',
  'snapshot_id',
  'snapshotId',
  'uuid',
  'key',
]

const INSTITUTION_CANDIDATE_KEYS = [
  'institution_id',
  'institutionId',
  'school_id',
  'schoolId',
]

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function normalizeLimit(limit) {
  const numericLimit = Number(limit)
  return Number.isFinite(numericLimit) && numericLimit > 0 ? Math.trunc(numericLimit) : 1
}

function assertSupabaseClient(supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('Se requiere un cliente Supabase inyectado para leer snapshots.')
  }
}

function isMissingColumnError(error, columnName) {
  if (!error || !columnName) return false

  const code = String(error.code ?? '')
  const text = [
    error.message,
    error.details,
    error.hint,
    error.error_description,
    error,
  ].map((value) => String(value ?? '').toLowerCase()).join(' ')
  const normalizedColumn = String(columnName).toLowerCase()

  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (
      text.includes(normalizedColumn) &&
      (
        text.includes('does not exist') ||
        text.includes('not found') ||
        text.includes('could not find') ||
        text.includes('schema cache') ||
        text.includes('column')
      )
    )
  )
}

function hasOwnKey(row, key) {
  return Boolean(row) && Object.prototype.hasOwnProperty.call(row, key)
}

function findCandidateKeys(columns, candidates) {
  return candidates.filter((key) => columns.includes(key))
}

function pickKey(row, preferredKey, candidates) {
  if (preferredKey && hasOwnKey(row, preferredKey)) return preferredKey
  return candidates.find((key) => hasOwnKey(row, key)) ?? null
}

function buildSchemaSummary(row = {}) {
  const columns = row && typeof row === 'object' ? Object.keys(row) : []
  const payloadCandidateKeys = findCandidateKeys(columns, PAYLOAD_CANDIDATE_KEYS)
  const timestampCandidateKeys = findCandidateKeys(columns, TIMESTAMP_CANDIDATE_KEYS)
  const idCandidateKeys = findCandidateKeys(columns, ID_CANDIDATE_KEYS)
  const institutionCandidateKeys = findCandidateKeys(columns, INSTITUTION_CANDIDATE_KEYS)

  return {
    ok: true,
    columns,
    hasPayload: payloadCandidateKeys.length > 0,
    payloadCandidateKeys,
    timestampCandidateKeys,
    idCandidateKeys,
    institutionCandidateKeys,
  }
}

function buildSchemaSummaryFromRows(rows = []) {
  const columnSet = new Set()
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return
    Object.keys(row).forEach((key) => columnSet.add(key))
  })

  const columns = [...columnSet]
  return {
    ok: true,
    columns,
    hasPayload: findCandidateKeys(columns, PAYLOAD_CANDIDATE_KEYS).length > 0,
    payloadCandidateKeys: findCandidateKeys(columns, PAYLOAD_CANDIDATE_KEYS),
    timestampCandidateKeys: findCandidateKeys(columns, TIMESTAMP_CANDIDATE_KEYS),
    idCandidateKeys: findCandidateKeys(columns, ID_CANDIDATE_KEYS),
    institutionCandidateKeys: findCandidateKeys(columns, INSTITUTION_CANDIDATE_KEYS),
  }
}

function createSnapshotReadError(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  return error
}

function buildAvailabilityAction({
  error,
  hasAnyRows,
  payloadCandidateKeys,
  institutionId,
  institutionCandidateKeys,
  filteredProbeRows,
}) {
  if (error) {
    return 'Revisar permisos de lectura sobre workspace_snapshots o la existencia de la tabla.'
  }

  if (!hasAnyRows) {
    return 'workspace_snapshots esta accesible pero no devuelve filas; revisar si existen snapshots guardados.'
  }

  if (!payloadCandidateKeys.length) {
    return 'Hay filas, pero no se detecto columna candidata de payload; revisar el nombre real de la columna snapshot.'
  }

  if (!institutionId) {
    return 'Hay filas y payload candidato; ejecutar la simulacion sin filtro institucional o indicar la clave institucional correcta si hace falta.'
  }

  if (!institutionCandidateKeys.length) {
    return 'Hay filas, pero no se detecto columna institucional; probar sin institutionId o indicar institutionKey manualmente.'
  }

  if (filteredProbeRows === 0) {
    return 'Hay filas, pero ninguna coincide con el institutionId informado; probar sin institutionId o verificar la institucion seleccionada.'
  }

  return 'Hay filas para la institucion y payload candidato; reintentar la simulacion read-only.'
}

async function queryWorkspaceSnapshots({
  supabase,
  institutionId,
  institutionKey,
  limit,
  orderBy,
}) {
  let query = supabase
    .from(WORKSPACE_SNAPSHOTS_TABLE)
    .select('*')

  if (institutionId && institutionKey) {
    query = query.eq(institutionKey, institutionId)
  }

  if (orderBy) {
    query = query.order(orderBy, { ascending: false })
  }

  return query.limit(normalizeLimit(limit))
}

export async function inspectWorkspaceSnapshotsSchema({ supabase, limit = 1 } = {}) {
  assertSupabaseClient(supabase)

  const { data, error } = await supabase
    .from(WORKSPACE_SNAPSHOTS_TABLE)
    .select('*')
    .limit(normalizeLimit(limit))

  if (error) {
    throw new Error(`No se pudo inspeccionar workspace_snapshots: ${error.message ?? error}`)
  }

  const rows = Array.isArray(data) ? data : []
  return buildSchemaSummary(rows[0] ?? {})
}

export async function inspectWorkspaceSnapshotsAvailability({
  supabase,
  institutionId,
} = {}) {
  assertSupabaseClient(supabase)

  const baseResult = await supabase
    .from(WORKSPACE_SNAPSHOTS_TABLE)
    .select('*')
    .limit(5)

  if (baseResult.error) {
    return {
      ok: false,
      tableReachable: false,
      totalProbeRows: 0,
      filteredProbeRows: null,
      columns: [],
      hasAnyRows: false,
      hasRowsForInstitution: false,
      institutionIdUsed: Boolean(institutionId),
      payloadCandidateKeys: [],
      timestampCandidateKeys: [],
      idCandidateKeys: [],
      institutionCandidateKeys: [],
      suggestedNextAction: buildAvailabilityAction({ error: baseResult.error }),
      error: baseResult.error.message ?? String(baseResult.error),
    }
  }

  const rows = Array.isArray(baseResult.data) ? baseResult.data : []
  const schema = buildSchemaSummaryFromRows(rows)
  let filteredProbeRows = null
  let filteredError = null

  if (institutionId && schema.institutionCandidateKeys.length) {
    for (const candidateKey of schema.institutionCandidateKeys) {
      const filteredResult = await supabase
        .from(WORKSPACE_SNAPSHOTS_TABLE)
        .select('*')
        .eq(candidateKey, institutionId)
        .limit(5)

      if (filteredResult.error) {
        filteredError = filteredResult.error
        if (isMissingColumnError(filteredResult.error, candidateKey)) continue
        break
      }

      const filteredRows = Array.isArray(filteredResult.data) ? filteredResult.data : []
      filteredProbeRows = filteredRows.length
      if (filteredProbeRows > 0) break
    }
  }

  const hasAnyRows = rows.length > 0
  const hasRowsForInstitution = institutionId
    ? filteredProbeRows === null
      ? false
      : filteredProbeRows > 0
    : false
  const safeError = filteredError && filteredProbeRows === null
    ? filteredError.message ?? String(filteredError)
    : null

  return {
    ok: !safeError,
    tableReachable: true,
    totalProbeRows: rows.length,
    filteredProbeRows,
    columns: schema.columns,
    hasAnyRows,
    hasRowsForInstitution,
    institutionIdUsed: Boolean(institutionId),
    payloadCandidateKeys: schema.payloadCandidateKeys,
    timestampCandidateKeys: schema.timestampCandidateKeys,
    idCandidateKeys: schema.idCandidateKeys,
    institutionCandidateKeys: schema.institutionCandidateKeys,
    suggestedNextAction: buildAvailabilityAction({
      error: safeError,
      hasAnyRows,
      payloadCandidateKeys: schema.payloadCandidateKeys,
      institutionId,
      institutionCandidateKeys: schema.institutionCandidateKeys,
      filteredProbeRows,
    }),
    error: safeError,
  }
}

export async function buildLegacyWorkspaceSnapshotFromSupabase({
  supabase,
  institutionId,
  limit = 1,
  payloadKey = 'payload',
  idKey,
  institutionKey,
  timestampKey,
  orderBy = null,
} = {}) {
  assertSupabaseClient(supabase)

  const preferredInstitutionKey = institutionKey || (institutionId ? 'institution_id' : null)
  const requestedOrderBy = orderBy || null
  let orderByUsed = requestedOrderBy
  let fallbackWithoutCreatedAt = false
  let institutionFilterUsed = Boolean(institutionId && preferredInstitutionKey)
  let result = await queryWorkspaceSnapshots({
    supabase,
    institutionId,
    institutionKey: preferredInstitutionKey,
    limit,
    orderBy: requestedOrderBy,
  })

  if (
    result.error &&
    requestedOrderBy &&
    isMissingColumnError(result.error, requestedOrderBy)
  ) {
    fallbackWithoutCreatedAt = requestedOrderBy === 'created_at'
    orderByUsed = null
    result = await queryWorkspaceSnapshots({
      supabase,
      institutionId,
      institutionKey: preferredInstitutionKey,
      limit,
      orderBy: null,
    })
  }

  if (
    result.error &&
    preferredInstitutionKey &&
    isMissingColumnError(result.error, preferredInstitutionKey)
  ) {
    institutionFilterUsed = false
    result = await queryWorkspaceSnapshots({
      supabase,
      institutionId: null,
      institutionKey: null,
      limit,
      orderBy: orderByUsed,
    })
  }

  const { data, error } = result

  if (error) {
    throw new Error(`No se pudo leer workspace snapshot desde Supabase: ${error.message ?? error}`)
  }

  const rows = Array.isArray(data) ? data : []
  const row = rows[0]

  if (!row) {
    if (institutionFilterUsed) {
      throw createSnapshotReadError(
        'NO_WORKSPACE_SNAPSHOT_FOR_INSTITUTION',
        'No se encontro workspace snapshot en Supabase para la institucion indicada.',
      )
    }

    throw createSnapshotReadError(
      'NO_WORKSPACE_SNAPSHOT_FOUND',
      'No se encontro workspace snapshot en Supabase para auditar.',
    )
  }

  const schema = buildSchemaSummary(row)
  const resolvedPayloadKey = pickKey(row, payloadKey, PAYLOAD_CANDIDATE_KEYS)

  if (!resolvedPayloadKey) {
    throw new Error(
      [
        'No se encontro columna de payload compatible en workspace_snapshots.',
        `Columnas disponibles: ${schema.columns.join(', ') || '(sin columnas detectables)'}.`,
        `Candidatas esperadas: ${PAYLOAD_CANDIDATE_KEYS.join(', ')}.`,
      ].join(' '),
    )
  }

  const resolvedIdKey = pickKey(row, idKey, ID_CANDIDATE_KEYS)
  const resolvedInstitutionKey = pickKey(row, preferredInstitutionKey, INSTITUTION_CANDIDATE_KEYS)
  const resolvedTimestampKey = pickKey(row, timestampKey, TIMESTAMP_CANDIDATE_KEYS)

  return {
    snapshot: cloneJson(row[resolvedPayloadKey] ?? {}),
    metadata: {
      source: 'supabase',
      table: WORKSPACE_SNAPSHOTS_TABLE,
      snapshotId: resolvedIdKey ? row[resolvedIdKey] ?? null : null,
      institutionId: resolvedInstitutionKey ? row[resolvedInstitutionKey] ?? null : institutionId ?? null,
      createdAt: resolvedTimestampKey ? row[resolvedTimestampKey] ?? null : null,
      readOnly: true,
      orderByUsed,
      fallbackWithoutCreatedAt,
      payloadKeyUsed: resolvedPayloadKey,
      idKeyUsed: resolvedIdKey,
      institutionKeyUsed: resolvedInstitutionKey,
      timestampKeyUsed: resolvedTimestampKey,
      schema,
    },
  }
}

export default buildLegacyWorkspaceSnapshotFromSupabase
