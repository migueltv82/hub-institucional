import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_SOURCE = 'codex_teacher_academic_validation'
const DEFAULT_WORKSPACE_KEY = 'main'
const ENV_FILES = ['.env', '.env.local']
const VALIDATION_DNI = '99945001'
const VALIDATION_TEACHER_NAME = 'Docente Validacion Supabase'
const VALIDATION_CAREER_NAME = 'Validacion Carrera'
const VALIDATION_SUBJECT_ID = 'VAL-SUPA-1'
const VALIDATION_SUBJECT_NAME = 'Validacion Supabase I'

function clean(value) {
  return String(value ?? '').trim()
}

function parseEnvFile(envFileName) {
  const envPath = join(process.cwd(), envFileName)
  try {
    return readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .reduce((acc, line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return acc
        const separatorIndex = trimmed.indexOf('=')
        if (separatorIndex === -1) return acc
        const key = trimmed.slice(0, separatorIndex).trim()
        const rawValue = trimmed.slice(separatorIndex + 1).trim()
        acc[key] = rawValue.replace(/^['"]|['"]$/g, '')
        return acc
      }, {})
  } catch {
    return {}
  }
}

function readEnvFiles() {
  return ENV_FILES.reduce((acc, envFileName) => ({
    ...acc,
    ...parseEnvFile(envFileName),
  }), {})
}

function pickEnv(env, ...keys) {
  for (const key of keys) {
    const value = clean(process.env[key] ?? env[key])
    if (value) return value
  }
  return ''
}

function assertRequiredEnv(env) {
  const missing = [
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_TEST_INSTITUTION_ID',
  ].filter((key) => !pickEnv(env, key))

  if (missing.length > 0) {
    const error = new Error(`Faltan variables requeridas para limpiar validacion Supabase: ${missing.join(', ')}.`)
    error.details = {
      expectedFiles: ENV_FILES,
      required: missing,
    }
    throw error
  }
}

function assertNoError(result, label) {
  if (result.error) {
    const error = new Error(`${label}: ${result.error.message}`)
    error.details = {
      code: result.error.code ?? null,
      details: result.error.details ?? null,
      hint: result.error.hint ?? null,
    }
    throw error
  }
}

function dedupeById(rows = []) {
  return Array.from(
    rows.reduce((map, row) => {
      if (row?.id) map.set(row.id, row)
      return map
    }, new Map()).values(),
  )
}

async function collectRows(queryBuilders) {
  const results = await Promise.all(queryBuilders)
  results.forEach((result, index) => assertNoError(result, `No se pudo leer candidatos de limpieza #${index + 1}`))
  return dedupeById(results.flatMap((result) => result.data ?? []))
}

function selectColumns(table) {
  if (table === 'teacher_records') {
    return 'id, full_name, first_name, last_name, dni, login_email, raw_payload'
  }
  if (table === 'teacher_availability_records') {
    return 'id, teacher_record_id, teacher_identity, teacher_display_name, teacher_name, teacher_dni, reason, source'
  }
  return 'id, teacher_record_id, teacher_identity, teacher_display_name, teacher_name, teacher_dni, career_name, subject_id, subject_name, source'
}

async function deleteByIds({ supabase, table, ids, dryRun }) {
  if (ids.length === 0 || dryRun) {
    return { table, deleted: 0, skipped: dryRun ? ids.length : 0 }
  }

  const result = await supabase
    .from(table)
    .delete()
    .in('id', ids)
    .select('id')

  assertNoError(result, `No se pudo borrar ${table}`)
  return { table, deleted: result.data?.length ?? 0, skipped: 0 }
}

async function assertInstitutionExists({ supabase, institutionId }) {
  const result = await supabase
    .from('institutions')
    .select('id, name, slug')
    .eq('id', institutionId)
    .limit(1)

  assertNoError(result, 'No se pudo validar SUPABASE_TEST_INSTITUTION_ID en institutions')
  const institution = result.data?.[0]
  if (!institution?.id) {
    throw new Error('SUPABASE_TEST_INSTITUTION_ID no existe o no es accesible con la service role key provista.')
  }
  return institution
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const env = readEnvFiles()
  assertRequiredEnv(env)

  const supabaseUrl = pickEnv(env, 'VITE_SUPABASE_URL')
  const supabaseKey = pickEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const institutionId = pickEnv(env, 'SUPABASE_TEST_INSTITUTION_ID')
  const workspaceKey = pickEnv(env, 'SUPABASE_TEST_WORKSPACE_KEY') || DEFAULT_WORKSPACE_KEY

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const institution = await assertInstitutionExists({ supabase, institutionId })

  const teacherRows = await collectRows([
    supabase.from('teacher_records').select(selectColumns('teacher_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('raw_payload->>source', TEST_SOURCE),
    supabase.from('teacher_records').select(selectColumns('teacher_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('dni', VALIDATION_DNI),
    supabase.from('teacher_records').select(selectColumns('teacher_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('full_name', VALIDATION_TEACHER_NAME),
    supabase.from('teacher_records').select(selectColumns('teacher_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).ilike('login_email', `validacion.${VALIDATION_DNI}@docentes.%`),
  ])
  const teacherIds = teacherRows.map((row) => row.id)

  const availabilityQueries = [
    supabase.from('teacher_availability_records').select(selectColumns('teacher_availability_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('source', TEST_SOURCE),
    supabase.from('teacher_availability_records').select(selectColumns('teacher_availability_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('teacher_dni', VALIDATION_DNI),
    supabase.from('teacher_availability_records').select(selectColumns('teacher_availability_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('teacher_display_name', VALIDATION_TEACHER_NAME),
    supabase.from('teacher_availability_records').select(selectColumns('teacher_availability_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('reason', 'Validacion real Supabase'),
  ]
  const workloadQueries = [
    supabase.from('teacher_workload_records').select(selectColumns('teacher_workload_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('source', TEST_SOURCE),
    supabase.from('teacher_workload_records').select(selectColumns('teacher_workload_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('teacher_dni', VALIDATION_DNI),
    supabase.from('teacher_workload_records').select(selectColumns('teacher_workload_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('teacher_display_name', VALIDATION_TEACHER_NAME),
    supabase.from('teacher_workload_records').select(selectColumns('teacher_workload_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('subject_id', VALIDATION_SUBJECT_ID),
    supabase.from('teacher_workload_records').select(selectColumns('teacher_workload_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('subject_name', VALIDATION_SUBJECT_NAME),
    supabase.from('teacher_workload_records').select(selectColumns('teacher_workload_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('career_name', VALIDATION_CAREER_NAME),
  ]

  if (teacherIds.length > 0) {
    availabilityQueries.push(
      supabase.from('teacher_availability_records').select(selectColumns('teacher_availability_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).in('teacher_record_id', teacherIds),
      supabase.from('teacher_availability_records').select(selectColumns('teacher_availability_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).in('teacher_identity', teacherIds),
    )
    workloadQueries.push(
      supabase.from('teacher_workload_records').select(selectColumns('teacher_workload_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).in('teacher_record_id', teacherIds),
      supabase.from('teacher_workload_records').select(selectColumns('teacher_workload_records')).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).in('teacher_identity', teacherIds),
    )
  }

  const [availabilityRows, workloadRows] = await Promise.all([
    collectRows(availabilityQueries),
    collectRows(workloadQueries),
  ])

  const deletionResults = []
  deletionResults.push(await deleteByIds({
    supabase,
    table: 'teacher_workload_records',
    ids: workloadRows.map((row) => row.id),
    dryRun,
  }))
  deletionResults.push(await deleteByIds({
    supabase,
    table: 'teacher_availability_records',
    ids: availabilityRows.map((row) => row.id),
    dryRun,
  }))
  deletionResults.push(await deleteByIds({
    supabase,
    table: 'teacher_records',
    ids: teacherRows.map((row) => row.id),
    dryRun,
  }))

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    source: TEST_SOURCE,
    institution: {
      id: institution.id,
      name: institution.name ?? null,
      slug: institution.slug ?? null,
    },
    workspaceKey,
    matched: {
      teacher_records: teacherRows.length,
      teacher_availability_records: availabilityRows.length,
      teacher_workload_records: workloadRows.length,
    },
    deleted: Object.fromEntries(deletionResults.map((result) => [result.table, result.deleted])),
    skipped: Object.fromEntries(deletionResults.map((result) => [result.table, result.skipped])),
    teacherRecords: teacherRows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      dni: row.dni,
      login_email: row.login_email,
    })),
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error.message,
    details: error.details ?? null,
  }, null, 2))
  process.exitCode = 1
})
