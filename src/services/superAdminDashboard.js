import { getCareerValues } from './careerCatalog.js'
import {
  buildEmptyInstitutionOperationalMetrics,
  buildInstitutionOperationalMetrics,
  fetchSnapshotsByInstitution,
} from './institutionInsights.js'
import { buildStudentRecordsFromSnapshot, buildTeacherRecordsFromSnapshot } from './rosterRecords.js'
import { getAllInstitutions, getAllUsersWithInstitutions } from './superAdmin.js'
import { createEmptyWorkspaceSnapshot, fetchWorkspaceSnapshot } from './workspaceSnapshot.js'

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

function isStudentRole(role) {
  return ['alumno', 'student'].includes(normalizeText(role))
}

function isTeacherRole(role) {
  return ['docente', 'teacher', 'profesor'].includes(normalizeText(role))
}

function isAdministratorAccount(user) {
  if (user?.is_global_admin) return false
  const role = user?.account_role || user?.role
  return !isStudentRole(role) && !isTeacherRole(role)
}

function buildStudentDirectoryRows(snapshot, institutionId, workspaceKey = DEFAULT_WORKSPACE_KEY) {
  return buildStudentRecordsFromSnapshot({
    snapshot,
    institutionId,
    workspaceKey,
  }).map((student) => ({
    id: `${clean(student.email).toLowerCase()}::${normalizeText(student.career)}`,
    full_name: clean(student.full_name) || clean(student.email),
    email: clean(student.email).toLowerCase(),
    career: clean(student.career) || 'Sin carrera',
    academic_year: clean(student.academic_year) || 'Sin anio',
    dni: clean(student.dni),
    legajo: clean(student.legajo),
    phone: clean(student.phone),
    status: clean(student.status) || 'activo',
  }))
}

function buildTeacherDirectoryRows(snapshot, institutionId, workspaceKey = DEFAULT_WORKSPACE_KEY) {
  return buildTeacherRecordsFromSnapshot({
    snapshot,
    institutionId,
    workspaceKey,
  }).map((teacher) => {
    const careers = getCareerValues(teacher.raw_payload ?? {})

    return {
      id: clean(teacher.dni) || clean(teacher.login_email) || clean(teacher.full_name),
      full_name: clean(teacher.full_name) || 'Docente sin nombre',
      dni: clean(teacher.dni),
      phone: clean(teacher.phone),
      careers,
      careers_label: careers.join(' | ') || 'Sin carreras asociadas',
      status: clean(teacher.status) || 'activo',
    }
  })
}

export async function fetchSuperAdminDashboardData({
  useRemote,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  const [{ institutions, source }, { users }] = await Promise.all([
    getAllInstitutions({ useRemote }),
    getAllUsersWithInstitutions({ useRemote }),
  ])

  let snapshotsByInstitution = new Map()

  try {
    snapshotsByInstitution = await fetchSnapshotsByInstitution({
      institutionIds: institutions.map((institution) => institution.id),
      useRemote,
      workspaceKey,
    })
  } catch (error) {
    console.warn('No se pudieron leer los snapshots institucionales para el resumen del super admin.', error)
  }

  const institutionMetrics = institutions
    .map((institution) => {
      const snapshot = snapshotsByInstitution.get(institution.id)
      return snapshot
        ? buildInstitutionOperationalMetrics(institution, snapshot, workspaceKey)
        : buildEmptyInstitutionOperationalMetrics(institution)
    })
    .sort((left, right) => (
      Number(right.status === 'active') - Number(left.status === 'active') ||
      left.name.localeCompare(right.name, 'es', { sensitivity: 'base' })
    ))

  return {
    totalInstitutions: institutionMetrics.length,
    activeInstitutions: institutionMetrics.filter((institution) => institution.status === 'active').length,
    totalUsers: users.length,
    totalAdministrators: users.filter(isAdministratorAccount).length,
    totalStudents: institutionMetrics.reduce((total, institution) => total + institution.student_count, 0),
    totalTeachers: institutionMetrics.reduce((total, institution) => total + institution.teacher_count, 0),
    blockedUsers: users.filter((user) => user.is_blocked).length,
    institutions: institutionMetrics,
    source,
  }
}

export async function fetchInstitutionRosterDirectory({
  institutionId,
  audience = 'students',
  useRemote,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  if (!institutionId) {
    return {
      institutionId: null,
      audience,
      items: [],
      total: 0,
      source: 'none',
      updatedAt: null,
    }
  }

  const { snapshot, source, updatedAt } = await fetchWorkspaceSnapshot({
    institutionId,
    workspaceKey,
    useRemote,
  })

  const safeSnapshot = snapshot ?? createEmptyWorkspaceSnapshot()
  const baseRows = audience === 'teachers'
    ? buildTeacherDirectoryRows(safeSnapshot, institutionId, workspaceKey)
    : buildStudentDirectoryRows(safeSnapshot, institutionId, workspaceKey)

  const items = baseRows
    .sort((left, right) => (
      clean(left.full_name).localeCompare(clean(right.full_name), 'es', { sensitivity: 'base' }) ||
      clean(left.email || left.dni).localeCompare(clean(right.email || right.dni), 'es', { sensitivity: 'base' })
    ))

  return {
    institutionId,
    audience,
    items,
    total: items.length,
    source,
    updatedAt,
  }
}
