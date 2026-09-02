import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import { buildExamEngineEfficiencySummary } from '../../src/utils/examEngine/audit/efficiencySummary.js'
import {
  buildConfirmedWorkspaceEfficiencyReport,
  buildSnapshotNotFoundReport,
  readConfirmedWorkspaceSnapshot,
} from '../../src/utils/examEngine/supabaseAudit/confirmedWorkspaceEfficiency.js'
import {
  detectServiceRoleKey,
  validateSupabaseReadOnlyEnv,
} from '../../src/utils/examEngine/supabaseAudit/supabaseAuditSafety.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const ENV_FILES = ['.env.local', '.env']
const CONFIRMED_INSTITUTION_ID = '95dcde93-6065-4dd8-89af-fee40b9ce028'
const DEFAULT_WORKSPACE_KEY = 'main'
const ACCESS_TOKEN_KEYS = [
  'EXAM_ENGINE_AUDIT_ACCESS_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'VITE_SUPABASE_ACCESS_TOKEN',
]

function fail(message, extra = null) {
  console.error(`[examEngine confirmed workspace read-only] ${message}`)
  if (extra) console.error(JSON.stringify(extra, null, 2))
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
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

function pickAccessToken(env = process.env) {
  for (const key of ACCESS_TOKEN_KEYS) {
    const value = clean(env[key])
    if (value) return { key, value }
  }

  return null
}

function createReadOnlySupabaseClient({ supabaseUrl, supabaseKey, accessToken }) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(accessToken
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        }
      : {}),
  })
}

function validateAccessToken(tokenInfo) {
  if (!tokenInfo) {
    return {
      valid: true,
      warning: 'No se detecto JWT de usuario; la lectura depende de politicas anon/auth que permitan select.',
    }
  }

  if (detectServiceRoleKey(tokenInfo.value)) {
    return {
      valid: false,
      error: `El token ${tokenInfo.key} parece service_role y esta bloqueado.`,
    }
  }

  return {
    valid: true,
    warning: null,
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

  const tokenInfo = pickAccessToken()
  const tokenValidation = validateAccessToken(tokenInfo)
  if (!tokenValidation.valid) {
    fail(tokenValidation.error)
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const institutionId = clean(process.env.EXAM_ENGINE_AUDIT_INSTITUTION_ID) || CONFIRMED_INSTITUTION_ID
  const workspaceKey = clean(process.env.EXAM_ENGINE_AUDIT_WORKSPACE_KEY) || DEFAULT_WORKSPACE_KEY
  const supabase = createReadOnlySupabaseClient({
    supabaseUrl,
    supabaseKey,
    accessToken: tokenInfo?.value,
  })

  try {
    const readResult = await readConfirmedWorkspaceSnapshot({
      supabase,
      institutionId,
      workspaceKey,
    })

    if (!readResult.ok) {
      fail('No se pudo leer el workspace snapshot confirmado.', {
        ...buildSnapshotNotFoundReport({
          diagnostic: readResult.diagnostic,
          institutionId,
          workspaceKey,
        }),
        authContext: {
          keyType: envValidation.config.keyType,
          hasUserAccessToken: Boolean(tokenInfo),
          tokenWarning: tokenValidation.warning,
        },
      })
      return
    }

    const startedAt = performance.now()
    const input = buildRegularExamInputFromWorkspaceSnapshot(readResult.snapshot)
    const contract = buildRegularExamPreviewIntegrationContract(input, {})
    const durationMs = Math.round(performance.now() - startedAt)
    const summary = buildExamEngineEfficiencySummary({
      contract,
      input,
      metadata: {
        snapshotId: readResult.metadata.snapshotId,
        createdAt: readResult.metadata.updatedAt,
        institutionId: readResult.metadata.institutionId ?? institutionId,
        readOnly: true,
      },
      durationMs,
    })
    const report = buildConfirmedWorkspaceEfficiencyReport({
      metadata: readResult.metadata,
      snapshot: readResult.snapshot,
      input,
      summary,
      contract,
      durationMs,
    })

    console.log(JSON.stringify({
      ok: true,
      authContext: {
        keyType: envValidation.config.keyType,
        hasUserAccessToken: Boolean(tokenInfo),
        tokenWarning: tokenValidation.warning,
      },
      report,
    }, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la simulacion read-only.')
  }
}

await main()
