import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import {
  buildStudentRecordsFromSnapshot,
  buildTeacherRecordsFromSnapshot,
  isMissingRosterSchemaError,
  syncRosterRecords,
} from './rosterRecords.js'
import { fetchWorkspaceSnapshot } from './workspaceSnapshot.js'

const DEFAULT_WORKSPACE_KEY = 'main'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function getStudentAuditKey(record) {
  return `${clean(record?.email).toLowerCase()}::${normalizeText(record?.career)}`
}

export function getTeacherAuditKey(record) {
  return clean(record?.dni)
}

function normalizeStudentAuditItem(record) {
  return {
    id: record?.id ?? null,
    email: clean(record?.email).toLowerCase(),
    full_name: clean(record?.full_name),
    career: clean(record?.career),
    updated_at: record?.updated_at ?? null,
  }
}

function normalizeTeacherAuditItem(record) {
  return {
    id: record?.id ?? null,
    dni: clean(record?.dni),
    full_name: clean(record?.full_name),
    updated_at: record?.updated_at ?? null,
  }
}

function buildRosterDiff({ expectedRows, actualRows, getKey, normalizeRow }) {
  const expectedMap = new Map(
    expectedRows
      .map((row) => {
        const key = getKey(row)
        return key ? [key, normalizeRow(row)] : null
      })
      .filter(Boolean),
  )
  const actualMap = new Map(
    actualRows
      .map((row) => {
        const key = getKey(row)
        return key ? [key, normalizeRow(row)] : null
      })
      .filter(Boolean),
  )

  const missingFromTable = Array.from(expectedMap.entries())
    .filter(([key]) => !actualMap.has(key))
    .map(([, row]) => row)
  const onlyInTable = Array.from(actualMap.entries())
    .filter(([key]) => !expectedMap.has(key))
    .map(([, row]) => row)

  return {
    aligned: missingFromTable.length === 0 && onlyInTable.length === 0,
    expectedCount: expectedMap.size,
    actualCount: actualMap.size,
    missingFromTable,
    onlyInTable,
  }
}

function createDatasetAudit({
  label,
  snapshotRows,
  expectedRows,
  actualRows = [],
  getKey,
  normalizeRow,
}) {
  const diff = buildRosterDiff({
    expectedRows,
    actualRows,
    getKey,
    normalizeRow,
  })

  return {
    label,
    snapshotRows,
    normalizedRows: expectedRows.length,
    storedRows: actualRows.length,
    aligned: diff.aligned,
    missingFromTable: diff.missingFromTable,
    onlyInTable: diff.onlyInTable,
    expectedCount: diff.expectedCount,
    actualCount: diff.actualCount,
  }
}

export function createRosterAuditReport({
  snapshot,
  snapshotUpdatedAt = null,
  source = 'local',
  actualStudentRows = [],
  actualTeacherRows = [],
  status = source === 'supabase' ? 'ready' : 'local-only',
  message = null,
}) {
  const snapshotStudents = asArray(snapshot?.alumnos).concat(asArray(snapshot?.students))
  const snapshotTeachers = asArray(snapshot?.docentes)
  const expectedStudentRows = buildStudentRecordsFromSnapshot({
    snapshot,
    institutionId: 'audit',
    workspaceKey: DEFAULT_WORKSPACE_KEY,
  })
  const expectedTeacherRows = buildTeacherRecordsFromSnapshot({
    snapshot,
    institutionId: 'audit',
    workspaceKey: DEFAULT_WORKSPACE_KEY,
  })
  const students = createDatasetAudit({
    label: 'alumnos',
    snapshotRows: snapshotStudents.length,
    expectedRows: expectedStudentRows,
    actualRows: actualStudentRows,
    getKey: getStudentAuditKey,
    normalizeRow: normalizeStudentAuditItem,
  })
  const teachers = createDatasetAudit({
    label: 'docentes',
    snapshotRows: snapshotTeachers.length,
    expectedRows: expectedTeacherRows,
    actualRows: actualTeacherRows,
    getKey: getTeacherAuditKey,
    normalizeRow: normalizeTeacherAuditItem,
  })
  const driftCount = (
    students.missingFromTable.length +
    students.onlyInTable.length +
    teachers.missingFromTable.length +
    teachers.onlyInTable.length
  )

  return {
    source,
    status,
    message,
    workspaceKey: DEFAULT_WORKSPACE_KEY,
    snapshotUpdatedAt,
    students,
    teachers,
    overall: {
      aligned: status === 'ready' ? students.aligned && teachers.aligned : false,
      driftCount,
    },
  }
}

async function fetchStudentAuditRows({ institutionId, workspaceKey }) {
  const { data, error } = await supabase
    .from('student_records')
    .select('id, email, full_name, career, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (error) throw error
  return asArray(data)
}

async function fetchTeacherAuditRows({ institutionId, workspaceKey }) {
  const { data, error } = await supabase
    .from('teacher_records')
    .select('id, dni, full_name, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (error) throw error
  return asArray(data)
}

export async function fetchRosterAudit({
  institutionId,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
  useRemote,
}) {
  if (!institutionId) {
    return {
      source: 'none',
      status: 'no-institution',
      message: 'Selecciona una institucion para auditar padrones.',
      workspaceKey,
      snapshotUpdatedAt: null,
      students: null,
      teachers: null,
      overall: {
        aligned: false,
        driftCount: 0,
      },
    }
  }

  const { snapshot, updatedAt } = await fetchWorkspaceSnapshot({
    institutionId,
    workspaceKey,
    useRemote,
  })

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    return createRosterAuditReport({
      snapshot,
      snapshotUpdatedAt: updatedAt,
      source: 'local',
      status: 'local-only',
      message: 'La auditoria comparativa requiere una sesion remota con Supabase.',
    })
  }

  try {
    const [actualStudentRows, actualTeacherRows] = await Promise.all([
      fetchStudentAuditRows({ institutionId, workspaceKey }),
      fetchTeacherAuditRows({ institutionId, workspaceKey }),
    ])

    return createRosterAuditReport({
      snapshot,
      snapshotUpdatedAt: updatedAt,
      source: 'supabase',
      status: 'ready',
      actualStudentRows,
      actualTeacherRows,
    })
  } catch (error) {
    if (isMissingRosterSchemaError(error)) {
      return createRosterAuditReport({
        snapshot,
        snapshotUpdatedAt: updatedAt,
        source: 'supabase',
        status: 'schema-missing',
        message: 'Faltan `student_records` o `teacher_records` en Supabase. Ejecuta el SQL multi-tenant actualizado.',
      })
    }

    throw error
  }
}

export async function resyncRosterFromSnapshot({
  institutionId,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
  useRemote,
}) {
  if (!institutionId) {
    throw new Error('No hay una institucion seleccionada para re-sincronizar padrones.')
  }

  const { snapshot } = await fetchWorkspaceSnapshot({
    institutionId,
    workspaceKey,
    useRemote,
  })

  return syncRosterRecords({
    institutionId,
    workspaceKey,
    snapshot,
    useRemote,
  })
}
