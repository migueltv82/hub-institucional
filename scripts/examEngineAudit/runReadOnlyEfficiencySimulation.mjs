import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import {
  buildLegacyWorkspaceSnapshotFromSupabase,
  inspectWorkspaceSnapshotsAvailability,
  inspectWorkspaceSnapshotsSchema,
} from '../../src/utils/examEngine/supabaseAudit/buildLegacyWorkspaceSnapshotFromSupabase.js'
import { buildExamEngineEfficiencySummary } from '../../src/utils/examEngine/supabaseAudit/efficiencySummary.js'
import { validateSupabaseReadOnlyEnv } from '../../src/utils/examEngine/supabaseAudit/supabaseAuditSafety.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const ENV_FILES = ['.env.local', '.env']

function fail(message, extra = null) {
  console.error(`[examEngine read-only] ${message}`)
  if (extra) console.error(JSON.stringify(extra, null, 2))
  process.exitCode = 1
}

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed
  const separatorIndex = normalized.indexOf('=')
  if (separatorIndex === -1) return null

  const key = normalized.slice(0, separatorIndex).trim()
  let value = normalized.slice(separatorIndex + 1).trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return key ? [key, value] : null
}

function loadLocalEnv() {
  ENV_FILES.forEach((fileName) => {
    const filePath = resolve(REPO_ROOT, fileName)
    if (!existsSync(filePath)) return

    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(parseEnvLine)
      .filter(Boolean)
      .forEach(([key, value]) => {
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      })
  })
}

function isEmptyPayload(value) {
  if (!value || typeof value !== 'object') return true
  if (Object.keys(value).length === 0) return true

  const usefulArrays = [
    value.horariosDocentes,
    value.docentes,
    value.planesEstudio,
    value.correlatividades,
    value.alumnos,
  ]

  return usefulArrays.every((entry) => !Array.isArray(entry) || entry.length === 0)
}

function isColumnShapeError(error) {
  const text = String(error?.message ?? error ?? '').toLowerCase()
  return (
    text.includes('column') ||
    text.includes('schema cache') ||
    text.includes('payload compatible')
  )
}

function isSnapshotAvailabilityError(error) {
  const code = String(error?.code ?? '')
  const text = String(error?.message ?? error ?? '')
  return (
    code === 'NO_WORKSPACE_SNAPSHOT_FOUND' ||
    code === 'NO_WORKSPACE_SNAPSHOT_FOR_INSTITUTION' ||
    text.includes('NO_WORKSPACE_SNAPSHOT_FOUND') ||
    text.includes('NO_WORKSPACE_SNAPSHOT_FOR_INSTITUTION')
  )
}

function buildSafeSchemaDiagnostic(schema = {}) {
  return {
    columns: Array.isArray(schema.columns) ? schema.columns : [],
    payloadCandidateKeys: Array.isArray(schema.payloadCandidateKeys) ? schema.payloadCandidateKeys : [],
    timestampCandidateKeys: Array.isArray(schema.timestampCandidateKeys) ? schema.timestampCandidateKeys : [],
    idCandidateKeys: Array.isArray(schema.idCandidateKeys) ? schema.idCandidateKeys : [],
    institutionCandidateKeys: Array.isArray(schema.institutionCandidateKeys) ? schema.institutionCandidateKeys : [],
  }
}

function buildSafeAvailabilityDiagnostic(availability = {}) {
  return {
    tableReachable: availability.tableReachable === true,
    totalProbeRows: Number.isFinite(Number(availability.totalProbeRows))
      ? Number(availability.totalProbeRows)
      : 0,
    filteredProbeRows: availability.filteredProbeRows ?? null,
    columns: Array.isArray(availability.columns) ? availability.columns : [],
    payloadCandidateKeys: Array.isArray(availability.payloadCandidateKeys)
      ? availability.payloadCandidateKeys
      : [],
    institutionIdUsed: availability.institutionIdUsed === true,
    suggestedNextAction: availability.suggestedNextAction ?? null,
  }
}

async function readSnapshotWithSchemaFallback(supabase, { institutionId } = {}) {
  try {
    return await buildLegacyWorkspaceSnapshotFromSupabase({
      supabase,
      institutionId,
      limit: 1,
      orderBy: null,
    })
  } catch (error) {
    if (isSnapshotAvailabilityError(error)) {
      const availability = await inspectWorkspaceSnapshotsAvailability({ supabase, institutionId })
      const diagnostic = buildSafeAvailabilityDiagnostic(availability)
      console.error('[examEngine read-only] Diagnostico seguro de disponibilidad workspace_snapshots:')
      console.error(JSON.stringify(diagnostic, null, 2))

      if (
        diagnostic.totalProbeRows > 0 &&
        diagnostic.payloadCandidateKeys.length &&
        error?.code === 'NO_WORKSPACE_SNAPSHOT_FOR_INSTITUTION'
      ) {
        return buildLegacyWorkspaceSnapshotFromSupabase({
          supabase,
          limit: 1,
          payloadKey: diagnostic.payloadCandidateKeys[0],
          orderBy: null,
        })
      }

      throw error
    }

    if (!isColumnShapeError(error)) throw error

    const schema = await inspectWorkspaceSnapshotsSchema({ supabase, limit: 1 })
    const diagnostic = buildSafeSchemaDiagnostic(schema)
    console.error('[examEngine read-only] Diagnostico seguro de columnas workspace_snapshots:')
    console.error(JSON.stringify(diagnostic, null, 2))

    if (!diagnostic.payloadCandidateKeys.length) {
      throw error
    }

    return buildLegacyWorkspaceSnapshotFromSupabase({
      supabase,
      limit: 1,
      payloadKey: diagnostic.payloadCandidateKeys[0],
      idKey: diagnostic.idCandidateKeys[0],
      institutionKey: diagnostic.institutionCandidateKeys[0],
      timestampKey: diagnostic.timestampCandidateKeys[0],
      orderBy: null,
    })
  }
}

async function main() {
  if (process.env.CI === 'true') {
    fail('Este script es solo local/manual y no debe ejecutarse en CI.')
    return
  }

  loadLocalEnv()

  const envValidation = validateSupabaseReadOnlyEnv(process.env)
  if (!envValidation.valid) {
    fail('Variables de entorno invalidas para lectura read-only.', {
      errors: envValidation.errors,
      warnings: envValidation.warnings,
      config: envValidation.config,
    })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  try {
    const readResult = await readSnapshotWithSchemaFallback(supabase)

    if (isEmptyPayload(readResult.snapshot)) {
      fail('El ultimo workspace snapshot no tiene payload util para simular.')
      return
    }

    const startedAt = performance.now()
    const input = buildRegularExamInputFromWorkspaceSnapshot(readResult.snapshot)
    const contract = buildRegularExamPreviewIntegrationContract(input, {})
    const durationMs = performance.now() - startedAt
    const summary = buildExamEngineEfficiencySummary({
      contract,
      input,
      metadata: readResult.metadata,
      durationMs,
    })
    const printableSummary = {
      ...summary,
      createdAt: summary.createdAt ?? 'no disponible',
    }

    console.log(JSON.stringify(printableSummary, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la simulacion read-only.')
  }
}

await main()
