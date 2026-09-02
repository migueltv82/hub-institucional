import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { getCareerValues } from './careerCatalog.js'
import { buildStudentRecordsFromSnapshot, buildTeacherRecordsFromSnapshot } from './rosterRecords.js'
import {
  createEmptyWorkspaceSnapshot,
  fetchWorkspaceSnapshot,
  normalizeWorkspaceSnapshot,
} from './workspaceSnapshot.js'

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

function resolveCareerLabel(value) {
  return clean(value) || 'Sin carrera'
}

function getTeacherCareers(record) {
  const careers = getCareerValues(record?.raw_payload ?? record)
  return careers.length > 0 ? careers : ['Sin carrera']
}

function sortCareerBreakdown(left, right) {
  const leftTotal = left.student_count + left.teacher_count
  const rightTotal = right.student_count + right.teacher_count

  return (
    rightTotal - leftTotal ||
    right.student_count - left.student_count ||
    right.teacher_count - left.teacher_count ||
    left.name.localeCompare(right.name, 'es', { sensitivity: 'base' })
  )
}

export function buildInstitutionCareerBreakdown({
  students = [],
  teachers = [],
} = {}) {
  const breakdown = new Map()

  function upsertCareer(careerLabel, field) {
    const name = resolveCareerLabel(careerLabel)
    const key = normalizeText(name) || 'sin-carrera'
    const current = breakdown.get(key) ?? {
      key,
      name,
      student_count: 0,
      teacher_count: 0,
    }

    current[field] += 1
    breakdown.set(key, current)
  }

  students.forEach((student) => {
    upsertCareer(student?.career, 'student_count')
  })

  teachers.forEach((teacher) => {
    getTeacherCareers(teacher).forEach((career) => {
      upsertCareer(career, 'teacher_count')
    })
  })

  return Array.from(breakdown.values())
    .sort(sortCareerBreakdown)
    .map((career) => ({
      name: career.name,
      student_count: career.student_count,
      teacher_count: career.teacher_count,
    }))
}

export function buildEmptyInstitutionOperationalMetrics(institution) {
  return {
    ...institution,
    student_count: 0,
    teacher_count: 0,
    active_career_count: 0,
    career_breakdown: [],
  }
}

export function buildInstitutionOperationalMetrics(
  institution,
  snapshot,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
) {
  const safeSnapshot = snapshot ?? createEmptyWorkspaceSnapshot()
  const students = buildStudentRecordsFromSnapshot({
    snapshot: safeSnapshot,
    institutionId: institution.id,
    workspaceKey,
  })
  const teachers = buildTeacherRecordsFromSnapshot({
    snapshot: safeSnapshot,
    institutionId: institution.id,
    workspaceKey,
  })
  const careerBreakdown = buildInstitutionCareerBreakdown({
    students,
    teachers,
  })

  return {
    ...institution,
    student_count: new Set(students.map((student) => clean(student.email).toLowerCase()).filter(Boolean)).size,
    teacher_count: new Set(teachers.map((teacher) => clean(teacher.dni)).filter(Boolean)).size,
    active_career_count: careerBreakdown.length,
    career_breakdown: careerBreakdown,
  }
}

export async function fetchSnapshotsByInstitution({
  institutionIds,
  useRemote,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  const normalizedIds = institutionIds.filter(Boolean)
  const snapshots = new Map()

  if (normalizedIds.length === 0) {
    return snapshots
  }

  if (useRemote && isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('workspace_snapshots')
      .select('institution_id, payload')
      .eq('workspace_key', workspaceKey)
      .in('institution_id', normalizedIds)

    if (error) throw error

    ;(data ?? []).forEach((row) => {
      snapshots.set(row.institution_id, normalizeWorkspaceSnapshot(row.payload))
    })

    return snapshots
  }

  const localSnapshots = await Promise.all(
    normalizedIds.map(async (institutionId) => {
      const result = await fetchWorkspaceSnapshot({
        institutionId,
        workspaceKey,
        useRemote: false,
      })

      return [institutionId, result.snapshot]
    }),
  )

  localSnapshots.forEach(([institutionId, snapshot]) => {
    snapshots.set(institutionId, snapshot)
  })

  return snapshots
}
