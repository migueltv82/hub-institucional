import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import { buildExamEngineEfficiencySummary } from '../../src/utils/examEngine/audit/efficiencySummary.js'
import {
  buildSafeRelationalAuditReport,
  buildWorkspaceSnapshotFromRelationalData,
} from '../../src/utils/examEngine/supabaseAudit/relationalWorkspaceSnapshot.js'
import { validateSupabaseReadOnlyEnv } from '../../src/utils/examEngine/supabaseAudit/supabaseAuditSafety.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const ENV_FILES = ['.env.local', '.env']
const DEFAULT_WORKSPACE_KEY = 'main'
const READ_RANGE_TO = 4999

const CORE_TABLES = [
  'institutions',
  'workspace_snapshots',
  'workspace_source_files',
  'student_records',
  'teacher_records',
  'subject_teacher_assignments',
  'exam_teacher_assignments',
  'subject_enrollments',
  'exam_enrollments',
  'student_grades',
]

const SUBJECT_CATALOG_TABLES = [
  'subjects',
  'study_plan_subjects',
  'curriculum_subjects',
  'career_subjects',
  'subject_catalog',
]

const CORRELATIVITY_TABLES = [
  'correlatividades',
  'correlativities',
  'subject_correlativities',
  'curriculum_correlativities',
]

const SAFE_EFFICIENCY_FIELDS = [
  'totalMaterias',
  'totalDocentes',
  'totalFechasDisponibles',
  'phase',
  'status',
  'totalPlanned',
  'totalUnassigned',
  'totalMesas',
  'mesasCompletas',
  'mesasConUnVocal',
  'mesasSinTribunal',
  'mesasSinFecha',
  'totalCriticalErrors',
  'totalWarnings',
  'totalPendingManualReview',
  'totalCompactadas',
  'completionRate',
  'conclusion',
  'recommendations',
]

function fail(message, extra = null) {
  console.error(`[examEngine relational read-only] ${message}`)
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

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function isMissingTableError(error) {
  const code = String(error?.code ?? '')
  const text = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  return (
    ['42P01', 'PGRST205'].includes(code) ||
    text.includes('does not exist') ||
    text.includes('could not find') ||
    text.includes('schema cache')
  )
}

function sanitizeError(error) {
  if (!error) return null
  if (isMissingTableError(error)) return 'table_not_available'
  return clean(error.message ?? error)
}

async function readTableRows(supabase, tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .range(0, READ_RANGE_TO)

  if (error) {
    return {
      ok: false,
      rows: 0,
      data: [],
      error: sanitizeError(error),
    }
  }

  const rows = asArray(data)
  return {
    ok: true,
    rows: rows.length,
    data: rows,
    error: null,
  }
}

function collectInstitutionIds(tableReads) {
  const scores = new Map()

  Object.values(tableReads).forEach((result) => {
    asArray(result?.data).forEach((row) => {
      const institutionId = clean(row?.institution_id || row?.institutionId || row?.id)
      if (!institutionId) return
      scores.set(institutionId, (scores.get(institutionId) ?? 0) + 1)
    })
  })

  return [...scores.entries()].sort((left, right) => right[1] - left[1])
}

function pickInstitutionId(tableReads) {
  const ranked = collectInstitutionIds({
    student_records: tableReads.student_records,
    teacher_records: tableReads.teacher_records,
    subject_teacher_assignments: tableReads.subject_teacher_assignments,
    subject_enrollments: tableReads.subject_enrollments,
    exam_enrollments: tableReads.exam_enrollments,
    student_grades: tableReads.student_grades,
    workspace_snapshots: tableReads.workspace_snapshots,
    institutions: tableReads.institutions,
  })

  return ranked[0]?.[0] ?? null
}

function filterByInstitution(rows, institutionId) {
  if (!institutionId) return asArray(rows)
  return asArray(rows).filter((row) => clean(row?.institution_id || row?.institutionId || row?.id) === institutionId)
}

function filterByWorkspace(rows, workspaceKey) {
  return asArray(rows).filter((row) => {
    const rowWorkspaceKey = clean(row?.workspace_key || row?.workspaceKey)
    return !rowWorkspaceKey || rowWorkspaceKey === workspaceKey
  })
}

function scopedRows(tableReads, tableName, institutionId, workspaceKey) {
  return filterByWorkspace(
    filterByInstitution(tableReads[tableName]?.data, institutionId),
    workspaceKey,
  )
}

function readSubjectCatalogRows(tableReads, institutionId, workspaceKey) {
  return SUBJECT_CATALOG_TABLES.flatMap((tableName) => scopedRows(tableReads, tableName, institutionId, workspaceKey))
}

function readCorrelativityRows(tableReads, institutionId, workspaceKey) {
  return CORRELATIVITY_TABLES.flatMap((tableName) => scopedRows(tableReads, tableName, institutionId, workspaceKey))
}

function pickSafeEfficiency(summary = {}) {
  return SAFE_EFFICIENCY_FIELDS.reduce((result, field) => {
    result[field] = summary[field]
    return result
  }, {})
}

function addEfficiencyCauses(summary = {}) {
  const causes = []

  if (Number(summary.mesasSinTribunal) > 0) {
    causes.push('Hay mesas sin tribunal completo.')
  }
  if (Number(summary.mesasSinFecha) > 0) {
    causes.push('Hay mesas sin fecha asignada.')
  }
  if (Number(summary.totalCriticalErrors) > 0) {
    causes.push('El preview reporta errores criticos.')
  }
  if (Number(summary.totalPendingManualReview) > 0) {
    causes.push('Hay elementos pendientes de revision manual.')
  }

  return causes
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
  const workspaceKey = clean(process.env.EXAM_ENGINE_AUDIT_WORKSPACE_KEY) || DEFAULT_WORKSPACE_KEY
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const tableNames = [
    ...CORE_TABLES,
    ...SUBJECT_CATALOG_TABLES,
    ...CORRELATIVITY_TABLES,
  ]
  const tableEntries = await Promise.all(
    tableNames.map(async (tableName) => [tableName, await readTableRows(supabase, tableName)]),
  )
  const tableReads = Object.fromEntries(tableEntries)
  const selectedInstitutionId = pickInstitutionId(tableReads)
  const subjectTeacherAssignments = scopedRows(tableReads, 'subject_teacher_assignments', selectedInstitutionId, workspaceKey)
  const subjectEnrollments = scopedRows(tableReads, 'subject_enrollments', selectedInstitutionId, workspaceKey)
  const examEnrollments = scopedRows(tableReads, 'exam_enrollments', selectedInstitutionId, workspaceKey)
  const studentGrades = scopedRows(tableReads, 'student_grades', selectedInstitutionId, workspaceKey)
  const teacherRecords = scopedRows(tableReads, 'teacher_records', selectedInstitutionId, workspaceKey)
  const studentRecords = scopedRows(tableReads, 'student_records', selectedInstitutionId, workspaceKey)
  const subjectCatalogRows = readSubjectCatalogRows(tableReads, selectedInstitutionId, workspaceKey)
  const correlativityRows = readCorrelativityRows(tableReads, selectedInstitutionId, workspaceKey)
  const { snapshot, diagnostics } = buildWorkspaceSnapshotFromRelationalData({
    studentRecords,
    teacherRecords,
    subjectTeacherAssignments,
    subjectEnrollments,
    examEnrollments,
    studentGrades,
    subjectCatalogRows,
    correlativityRows,
    auditConfig: {
      workspaceKey,
      fechaInicio: process.env.EXAM_ENGINE_AUDIT_FECHA_INICIO,
      fechaFin: process.env.EXAM_ENGINE_AUDIT_FECHA_FIN,
    },
  })

  CORE_TABLES
    .concat(SUBJECT_CATALOG_TABLES, CORRELATIVITY_TABLES)
    .forEach((tableName) => {
      tableReads[tableName].used = [
        'student_records',
        'teacher_records',
        'subject_teacher_assignments',
        'subject_enrollments',
        'exam_enrollments',
        'student_grades',
        ...SUBJECT_CATALOG_TABLES,
        ...CORRELATIVITY_TABLES,
      ].includes(tableName) && tableReads[tableName].rows > 0
    })

  let previewRan = false
  let safeEfficiency = null

  if (diagnostics.canRunPreview) {
    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const contract = buildRegularExamPreviewIntegrationContract(input, {})
    const summary = buildExamEngineEfficiencySummary({
      contract,
      input,
      metadata: {
        source: 'supabase-relational',
        readOnly: true,
      },
    })
    previewRan = true
    safeEfficiency = pickSafeEfficiency(summary)
    diagnostics.causes = [
      ...new Set([
        ...diagnostics.causes,
        ...addEfficiencyCauses(summary),
      ]),
    ]
  }

  const report = buildSafeRelationalAuditReport({
    tableReads,
    snapshotDiagnostics: diagnostics,
    efficiencySummary: safeEfficiency,
    previewRan,
  })

  console.log(JSON.stringify({
    ...report,
    selectedInstitutionDetected: Boolean(selectedInstitutionId),
    workspaceKey,
    dateSource: diagnostics.dateSource,
    decision: previewRan && safeEfficiency?.conclusion !== 'NO EFICIENTE'
      ? 'requiere revision antes de integracion productiva'
      : 'no integrar todavia',
  }, null, 2))
}

await main()
