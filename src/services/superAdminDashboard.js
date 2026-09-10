import { getCareerValues } from './careerCatalog.js'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import {
  buildEmptyInstitutionOperationalMetrics,
  buildInstitutionOperationalMetrics,
  fetchSnapshotsByInstitution,
} from './institutionInsights.js'
import { buildStudentRecordsFromSnapshot, buildTeacherRecordsFromSnapshot } from './rosterRecords.js'
import { getAllInstitutions, getAllUsersWithInstitutions } from './superAdmin.js'
import { createEmptyWorkspaceSnapshot, fetchWorkspaceSnapshot } from './workspaceSnapshot.js'

const DEFAULT_WORKSPACE_KEY = 'main'
const RELATIONAL_PAGE_SIZE = 500
const ACTIVE_STATUS = new Set(['', 'active', 'activo'])

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

function fullName(row) {
  return [clean(row?.first_name), clean(row?.last_name)].filter(Boolean).join(' ')
}

function canUseRelationalRoster({ institutionId, useRemote, client }) {
  return Boolean(useRemote && institutionId && (client || (isSupabaseConfigured && supabase)))
}

async function fetchRelationalTable({ client, table, institutionId, select = '*' }) {
  const rows = []

  for (let offset = 0; ; offset += RELATIONAL_PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .eq('institution_id', institutionId)
      .order('id')
      .range(offset, offset + RELATIONAL_PAGE_SIZE - 1)

    if (error) throw new Error(`${table}: ${error.message}`)

    const page = Array.isArray(data) ? data : []
    rows.push(...page)
    if (page.length < RELATIONAL_PAGE_SIZE) return rows
  }
}

function buildRelationalStudentDirectoryRows({ students, studentCareerPlans, careersById }) {
  const plansByStudentId = new Map()

  studentCareerPlans.forEach((plan) => {
    const current = plansByStudentId.get(plan.student_id) ?? []
    current.push(plan)
    plansByStudentId.set(plan.student_id, current)
  })

  return students.flatMap((student) => {
    const plans = plansByStudentId.get(student.id) ?? []
    const activePlans = plans.filter((plan) => ACTIVE_STATUS.has(normalizeText(plan.status)))
    const displayPlans = activePlans.length > 0 ? activePlans : plans

    if (displayPlans.length === 0) {
      return [{
        id: student.id,
        full_name: fullName(student) || clean(student.email) || student.id,
        email: clean(student.email).toLowerCase(),
        career: 'Sin carrera',
        academic_year: 'Sin anio',
        dni: clean(student.national_id),
        legajo: clean(student.external_code),
        phone: clean(student.phone),
        status: clean(student.status) || 'active',
      }]
    }

    return displayPlans.map((plan) => {
      const career = careersById.get(plan.career_id)

      return {
        id: `${student.id}::${plan.id}`,
        full_name: fullName(student) || clean(student.email) || student.id,
        email: clean(student.email).toLowerCase(),
        career: clean(career?.name) || 'Sin carrera',
        academic_year: clean(plan.current_year) || clean(plan.cohort) || 'Sin anio',
        dni: clean(student.national_id),
        legajo: clean(student.external_code),
        phone: clean(student.phone),
        status: clean(student.status) || clean(plan.status) || 'active',
      }
    })
  })
}

function buildRelationalTeacherDirectoryRows({
  teachers,
  assignments,
  studyPlanSubjectsById,
  studyPlansById,
  careersById,
}) {
  const careersByTeacherId = new Map()

  assignments
    .filter((assignment) => ACTIVE_STATUS.has(normalizeText(assignment.status)))
    .forEach((assignment) => {
      const planSubject = studyPlanSubjectsById.get(assignment.plan_subject_id)
      const plan = planSubject ? studyPlansById.get(planSubject.plan_id) : null
      const career = plan ? careersById.get(plan.career_id) : null
      if (!career?.name) return

      const careers = careersByTeacherId.get(assignment.teacher_id) ?? new Set()
      careers.add(career.name)
      careersByTeacherId.set(assignment.teacher_id, careers)
    })

  return teachers.map((teacher) => {
    const careers = [...(careersByTeacherId.get(teacher.id) ?? new Set())]
      .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))

    return {
      id: teacher.id,
      full_name: fullName(teacher) || clean(teacher.email) || teacher.id,
      email: clean(teacher.email).toLowerCase(),
      dni: clean(teacher.national_id),
      phone: clean(teacher.phone),
      careers,
      careers_label: careers.join(' | ') || 'Sin carreras asociadas',
      status: clean(teacher.status) || 'active',
    }
  })
}

async function fetchRelationalRosterDirectory({
  institutionId,
  audience,
  client,
}) {
  const careers = await fetchRelationalTable({
    client,
    table: 'careers',
    institutionId,
    select: 'id, institution_id, name',
  })
  const careersById = new Map(careers.map((career) => [career.id, career]))

  if (audience === 'teachers') {
    const [teachers, assignments, studyPlanSubjects, studyPlans] = await Promise.all([
      fetchRelationalTable({
        client,
        table: 'teacher_records',
        institutionId,
        select: 'id, institution_id, first_name, last_name, national_id, email, phone, status',
      }),
      fetchRelationalTable({
        client,
        table: 'teacher_subject_assignments',
        institutionId,
        select: 'id, institution_id, teacher_id, plan_subject_id, role, status',
      }),
      fetchRelationalTable({
        client,
        table: 'study_plan_subjects',
        institutionId,
        select: 'id, institution_id, plan_id',
      }),
      fetchRelationalTable({
        client,
        table: 'study_plans',
        institutionId,
        select: 'id, institution_id, career_id',
      }),
    ])

    return buildRelationalTeacherDirectoryRows({
      teachers,
      assignments,
      studyPlanSubjectsById: new Map(studyPlanSubjects.map((row) => [row.id, row])),
      studyPlansById: new Map(studyPlans.map((row) => [row.id, row])),
      careersById,
    })
  }

  const [students, studentCareerPlans] = await Promise.all([
    fetchRelationalTable({
      client,
      table: 'student_records',
      institutionId,
      select: 'id, institution_id, external_code, first_name, last_name, national_id, email, phone, status',
    }),
    fetchRelationalTable({
      client,
      table: 'student_career_plans',
      institutionId,
      select: 'id, institution_id, student_id, career_id, current_year, cohort, status',
    }),
  ])

  return buildRelationalStudentDirectoryRows({ students, studentCareerPlans, careersById })
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
  client = supabase,
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

  if (canUseRelationalRoster({ institutionId, useRemote, client })) {
    try {
      const relationalRows = await fetchRelationalRosterDirectory({
        institutionId,
        audience,
        client,
      })
      const items = relationalRows
        .sort((left, right) => (
          clean(left.full_name).localeCompare(clean(right.full_name), 'es', { sensitivity: 'base' }) ||
          clean(left.email || left.dni).localeCompare(clean(right.email || right.dni), 'es', { sensitivity: 'base' })
        ))

      return {
        institutionId,
        audience,
        items,
        total: items.length,
        source: 'academic-relational-schema',
        updatedAt: null,
      }
    } catch (error) {
      console.warn('No se pudo leer el padron desde el schema relacional. Se mantiene el fallback al snapshot.', error)
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
