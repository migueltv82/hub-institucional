import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import {
  buildEmptyInstitutionOperationalMetrics,
  buildInstitutionOperationalMetrics,
  fetchSnapshotsByInstitution,
} from './institutionInsights.js'
import {
  buildStudentRecordsFromSnapshot,
  buildTeacherRecordsFromSnapshot,
} from './rosterRecords.js'

const LOCAL_SUPER_ADMIN_KEY = 'mesaflow.superadmin.store'
const institutionBaseColumns = 'id, name, slug, logo_url, status, created_at, memberships(role)'
const institutionColumnsWithPlan = 'id, name, slug, logo_url, plan_type, status, created_at, memberships(role)'
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

function normalizeEmail(value) {
  return clean(value).toLowerCase()
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

async function selectInstitutionWithPlanFallback(primaryQuery, fallbackQuery) {
  const { data, count, error } = await primaryQuery()
  if (!error) return { data, count, error }
  if (error.message?.includes('plan_type') || error.details?.includes('plan_type')) {
    return fallbackQuery()
  }
  return { data, count, error }
}

function createDemoStore() {
  const superAdminId = crypto.randomUUID()
  const institutionAId = crypto.randomUUID()
  const institutionBId = crypto.randomUUID()
  const sanMiguelAdminId = crypto.randomUUID()
  const belgranoAdminId = crypto.randomUUID()

  return {
    institutions: [
      {
        id: institutionAId,
        name: 'Instituto Superior de San Miguel',
        slug: 'instituto-superior-de-san-miguel',
        logo_url: '',
        plan_type: 'pro',
        status: 'active',
        created_at: '2026-04-15T10:00:00.000Z',
      },
      {
        id: institutionBId,
        name: 'Profesorado General Belgrano',
        slug: 'profesorado-general-belgrano',
        logo_url: '',
        plan_type: 'free',
        status: 'suspended',
        created_at: '2026-04-18T16:30:00.000Z',
      },
    ],
    users: [
      {
        id: superAdminId,
        email: 'desarrollo@institutosanmiguel.local',
        display_name: 'Super Admin Institutional Hub',
        role: 'superadmin',
        is_global_admin: true,
        is_blocked: false,
        created_at: '2026-04-15T09:45:00.000Z',
      },
      {
        id: sanMiguelAdminId,
        email: 'admin.sanmiguel@example.com',
        display_name: 'Admin San Miguel',
        role: 'admin_instituto',
        is_global_admin: false,
        is_blocked: false,
        created_at: '2026-04-15T10:05:00.000Z',
      },
      {
        id: belgranoAdminId,
        email: 'admin.belgrano@example.com',
        display_name: 'Admin Belgrano',
        role: 'admin_instituto',
        is_global_admin: false,
        is_blocked: false,
        created_at: '2026-04-18T16:35:00.000Z',
      },
    ],
    memberships: [
      {
        institution_id: institutionAId,
        user_id: sanMiguelAdminId,
        role: 'admin',
      },
      {
        institution_id: institutionBId,
        user_id: belgranoAdminId,
        role: 'owner',
      },
    ],
  }
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function migrateLegacyStore(store) {
  const institutions = Array.isArray(store?.institutions) ? store.institutions : []
  const users = Array.isArray(store?.users) ? store.users : []
  const memberships = Array.isArray(store?.memberships)
    ? store.memberships
    : users
        .filter((user) => user.tenant_id && user.role !== 'superadmin' && !user.is_global_admin)
        .map((user) => ({
          institution_id: user.tenant_id,
          user_id: user.id,
          role: 'admin',
        }))

  return {
    institutions,
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      display_name: user.display_name ?? user.email,
      role: user.role ?? 'admin_instituto',
      is_global_admin: Boolean(user.is_global_admin),
      is_blocked: Boolean(user.is_blocked),
      created_at: user.created_at ?? new Date().toISOString(),
    })),
    memberships,
  }
}

function readLocalStore() {
  try {
    const raw = localStorage.getItem(LOCAL_SUPER_ADMIN_KEY)
    if (!raw) {
      const seed = createDemoStore()
      localStorage.setItem(LOCAL_SUPER_ADMIN_KEY, JSON.stringify(seed))
      return seed
    }

    return migrateLegacyStore(JSON.parse(raw))
  } catch {
    return createDemoStore()
  }
}

function writeLocalStore(nextStore) {
  localStorage.setItem(LOCAL_SUPER_ADMIN_KEY, JSON.stringify(nextStore))
}

async function invokeAdminUsers(payload) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase no esta configurado en este entorno.')
  }

  // Operaciones sensibles de Auth, como crear usuarios o resetear contrasenas,
  // van a una Edge Function. El navegador nunca debe conocer el service_role key.
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: payload,
  })

  if (error) {
    let detail = error.message

    try {
      if (error.context && typeof error.context.json === 'function') {
        const errorBody = await error.context.json()
        detail = errorBody?.error ?? errorBody?.message ?? detail
      }
    } catch {
      // Supabase FunctionsHttpError no siempre permite leer el body mas de una vez.
    }

    throw new Error(`No se pudo completar la operacion en admin-users. ${getAdminUsersErrorHint(detail)}`)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function getAdminUsersErrorHint(detail) {
  const normalizedDetail = String(detail ?? '').trim()
  const lowerDetail = normalizedDetail.toLowerCase()

  if (lowerDetail.includes('failed to send a request') || lowerDetail.includes('404')) {
    return 'No llego respuesta de la Edge Function (puede ser un corte de red transitorio entre el navegador y Supabase). Antes de asumir que algo esta mal configurado, reintenta la accion y revisa `admin_audit_logs` para confirmar si de verdad no se ejecuto. Si el problema persiste en varios intentos, ahi si revisa que `admin-users` este desplegada y que `.env` apunte al project-ref correcto.'
  }

  if (lowerDetail.includes('service_role_key') || lowerDetail.includes('service_role') || lowerDetail.includes('service_role_key')) {
    return 'Falta configurar el secret `SERVICE_ROLE_KEY` de la Edge Function con la service_role key del proyecto Supabase actual.'
  }

  if (lowerDetail.includes('sesion invalida') || lowerDetail.includes('jwt')) {
    return 'Tu sesion no llego valida a la Edge Function. Cierra sesion, entra nuevamente como superadmin y reintenta.'
  }

  if (lowerDetail.includes('acceso denegado') || lowerDetail.includes('super admin')) {
    return 'La Edge Function respondio que tu usuario no tiene permisos de superadmin. Revisa `profiles.is_global_admin` para tu email.'
  }

  return `Detalle: ${normalizedDetail || 'Error desconocido.'}`
}

function buildInstitutionAdminCountMap(store) {
  return store.memberships.reduce((accumulator, membership) => {
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return accumulator
    }

    const membershipUser = store.users.find((user) => user.id === membership.user_id)
    if (membershipUser?.is_global_admin) {
      return accumulator
    }

    accumulator[membership.institution_id] = (accumulator[membership.institution_id] ?? 0) + 1
    return accumulator
  }, {})
}

function buildInstitutionAdminCountMapFromUsers(users) {
  return users.reduce((accumulator, user) => {
    if (user?.is_global_admin) {
      return accumulator
    }

    user.institutions.forEach((institution) => {
      if (institution.role !== 'owner' && institution.role !== 'admin') {
        return
      }

      accumulator[institution.id] = (accumulator[institution.id] ?? 0) + 1
    })

    return accumulator
  }, {})
}

function mapMembershipRowsByUser(membershipRows = []) {
  return membershipRows.reduce((accumulator, membership) => {
    const userId = membership?.user_id
    const institution = membership?.institutions
    if (!userId || !institution) {
      return accumulator
    }

    const currentMemberships = accumulator.get(userId) ?? []
    currentMemberships.push({
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
      status: institution.status,
      role: membership.role,
    })
    accumulator.set(userId, currentMemberships)
    return accumulator
  }, new Map())
}

async function fetchRemoteProfilesWithMemberships() {
  const [{ data: profiles, error: profilesError }, { data: membershipRows, error: membershipsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, email, display_name, account_role, is_global_admin, is_blocked, created_at')
      .order('email', { ascending: true }),
    supabase
      .from('memberships')
      .select(`
        user_id,
        role,
        institution_id,
        institutions(
          id,
          name,
          slug,
          status
        )
      `),
  ])

  if (profilesError) throw profilesError
  if (membershipsError) throw membershipsError

  const membershipsByUserId = mapMembershipRowsByUser(membershipRows ?? [])

  return (profiles ?? []).map((profile) => ({
    id: profile.user_id,
    email: profile.email,
    display_name: profile.display_name ?? profile.email,
    account_role: profile.account_role ?? 'admin_instituto',
    is_global_admin: Boolean(profile.is_global_admin),
    is_blocked: Boolean(profile.is_blocked),
    created_at: profile.created_at,
    institutions: profile.is_global_admin
      ? []
      : (membershipsByUserId.get(profile.user_id) ?? []),
  }))
}

function normalizeSearchTerm(value) {
  return normalizeText(value)
}

function normalizeUserRoleFilter(value) {
  const normalizedValue = normalizeText(value)

  if (['superadmin', 'superadmins'].includes(normalizedValue)) return 'superadmin'
  if (['administradores', 'administrators', 'admins', 'admin'].includes(normalizedValue)) return 'administrators'
  if (['docentes', 'teachers', 'teacher', 'docente', 'profesor'].includes(normalizedValue)) return 'teachers'
  if (['alumnos', 'students', 'student', 'alumno'].includes(normalizedValue)) return 'students'

  return null
}

function getUserRoleBucket(user) {
  if (user?.is_global_admin) return 'superadmin'

  const normalizedRole = normalizeText(user?.account_role ?? user?.role)

  if (['alumno', 'student'].includes(normalizedRole)) return 'students'
  if (['docente', 'teacher', 'profesor'].includes(normalizedRole)) return 'teachers'

  return 'administrators'
}

function buildUserRoleSummary(users) {
  const counts = {
    superadmin: 0,
    administrators: 0,
    teachers: 0,
    students: 0,
  }

  users.forEach((user) => {
    const roleBucket = getUserRoleBucket(user)
    counts[roleBucket] = (counts[roleBucket] ?? 0) + 1
  })

  return [
    {
      key: 'superadmin',
      label: 'Superadmins',
      description: 'Gobierno total de la plataforma.',
      count: counts.superadmin,
    },
    {
      key: 'administrators',
      label: 'Administradores',
      description: 'Usuarios con gestion institucional.',
      count: counts.administrators,
    },
    {
      key: 'teachers',
      label: 'Docentes',
      description: 'Accesos asociados a padrones docentes.',
      count: counts.teachers,
    },
    {
      key: 'students',
      label: 'Alumnos',
      description: 'Accesos asociados a padrones de alumnos.',
      count: counts.students,
    },
  ]
}

function hasEffectiveUserAccess(user) {
  if (user?.is_global_admin) return true
  return Array.isArray(user?.institutions) && user.institutions.length > 0
}

function paginateItems(items, page, pageSize) {
  const safePage = Math.max(page, 1)
  const safePageSize = Math.max(pageSize, 1)
  const total = items.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize)
  const currentPage = totalPages === 0 ? 1 : Math.min(safePage, totalPages)
  const from = (currentPage - 1) * safePageSize
  const to = from + safePageSize

  return {
    items: items.slice(from, to),
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
  }
}

function filterInstitutions(institutions, searchTerm, statusFilter = '') {
  const normalizedSearch = normalizeSearchTerm(searchTerm)
  const normalizedStatusFilter = normalizeText(statusFilter)

  const filteredByStatus = normalizedStatusFilter
    ? institutions.filter((institution) => normalizeText(institution.status) === normalizedStatusFilter)
    : institutions

  if (!normalizedSearch) return filteredByStatus

  return filteredByStatus.filter((institution) => (
    institution.name.toLowerCase().includes(normalizedSearch) ||
    institution.slug.toLowerCase().includes(normalizedSearch) ||
    institution.plan_type.toLowerCase().includes(normalizedSearch) ||
    institution.status.toLowerCase().includes(normalizedSearch)
  ))
}

function filterUsers(users, searchTerm) {
  const normalizedSearch = normalizeSearchTerm(searchTerm)
  if (!normalizedSearch) return users

  return users.filter((user) => {
    const institutionMatch = user.institutions.some((institution) => (
      institution.name.toLowerCase().includes(normalizedSearch) ||
      institution.slug.toLowerCase().includes(normalizedSearch)
    ))

    return (
      user.email.toLowerCase().includes(normalizedSearch) ||
      user.display_name.toLowerCase().includes(normalizedSearch) ||
      user.account_role.toLowerCase().includes(normalizedSearch) ||
      institutionMatch
    )
  })
}

function filterUsersDirectory(users, searchTerm, selectedRole) {
  const normalizedSearch = normalizeSearchTerm(searchTerm)
  const normalizedRole = normalizeUserRoleFilter(selectedRole)

  let scopedUsers = users

  if (normalizedRole) {
    scopedUsers = scopedUsers.filter((user) => user.role_bucket === normalizedRole)
  }

  if (!normalizedSearch) return scopedUsers

  return scopedUsers.filter((user) => {
    const institutionMatch = user.institutions.some((institution) => (
      normalizeText(institution.name).includes(normalizedSearch) ||
      normalizeText(institution.slug).includes(normalizedSearch)
    ))

    return (
      normalizeText(user.email).includes(normalizedSearch) ||
      normalizeText(user.display_name).includes(normalizedSearch) ||
      normalizeText(user.full_name).includes(normalizedSearch) ||
      normalizeText(user.first_name).includes(normalizedSearch) ||
      normalizeText(user.last_name).includes(normalizedSearch) ||
      normalizeText(user.account_role).includes(normalizedSearch) ||
      normalizeText(user.dni).includes(normalizedSearch) ||
      institutionMatch
    )
  })
}

function normalizeInstitution(institution, adminCount = 0) {
  return {
    id: institution.id,
    name: institution.name,
    slug: institution.slug,
    logo_url: institution.logo_url ?? '',
    plan_type: institution.plan_type ?? 'free',
    status: institution.status ?? 'active',
    created_at: institution.created_at,
    admin_count: adminCount,
  }
}

async function enrichInstitutionsWithOperationalMetrics({
  institutions,
  useRemote,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  if (!Array.isArray(institutions) || institutions.length === 0) {
    return []
  }

  let snapshotsByInstitution = new Map()

  try {
    snapshotsByInstitution = await fetchSnapshotsByInstitution({
      institutionIds: institutions.map((institution) => institution.id),
      useRemote,
      workspaceKey,
    })
  } catch (error) {
    console.warn('No se pudieron leer los snapshots institucionales para enriquecer el listado de instituciones.', error)
  }

  return institutions.map((institution) => {
    const snapshot = snapshotsByInstitution.get(institution.id)
    return snapshot
      ? buildInstitutionOperationalMetrics(institution, snapshot, workspaceKey)
      : buildEmptyInstitutionOperationalMetrics(institution)
  })
}

function buildLocalUserList(store) {
  return store.users
    .map((user) => {
      const institutions = user.is_global_admin
        ? []
        : store.memberships
        .filter((membership) => membership.user_id === user.id)
        .map((membership) => {
          const institution = store.institutions.find((entry) => entry.id === membership.institution_id)
          if (!institution) return null

          return {
            id: institution.id,
            name: institution.name,
            slug: institution.slug,
            status: institution.status,
            role: membership.role,
          }
        })
        .filter(Boolean)

      return {
        id: user.id,
        email: user.email,
        display_name: user.display_name ?? user.email,
        account_role: user.role ?? 'admin_instituto',
        is_global_admin: Boolean(user.is_global_admin),
        is_blocked: Boolean(user.is_blocked),
        created_at: user.created_at,
        institutions,
      }
    })
    .sort((left, right) => left.email.localeCompare(right.email))
}

function createEmptyRosterLookups() {
  return {
    studentsByEmail: new Map(),
    teachersByEmail: new Map(),
  }
}

function mergeRosterDirectoryEntry(previousEntry, nextEntry) {
  return {
    full_name: clean(previousEntry?.full_name || nextEntry?.full_name),
    first_name: clean(previousEntry?.first_name || nextEntry?.first_name),
    last_name: clean(previousEntry?.last_name || nextEntry?.last_name),
    dni: clean(previousEntry?.dni || nextEntry?.dni),
    careers: uniqueNonEmpty([
      ...(previousEntry?.careers ?? []),
      ...(nextEntry?.careers ?? []),
    ]),
  }
}

function setRosterLookupEntry(map, key, entry) {
  if (!key) return
  map.set(key, mergeRosterDirectoryEntry(map.get(key), entry))
}

function buildRosterLookupsFromRecords({
  studentRecords = [],
  teacherRecords = [],
}) {
  const lookups = createEmptyRosterLookups()

  studentRecords.forEach((record) => {
    setRosterLookupEntry(lookups.studentsByEmail, normalizeEmail(record?.email), {
      full_name: clean(record?.full_name),
      first_name: clean(record?.first_name),
      last_name: clean(record?.last_name),
      dni: clean(record?.dni),
      careers: uniqueNonEmpty([record?.career]),
    })
  })

  teacherRecords.forEach((record) => {
    setRosterLookupEntry(lookups.teachersByEmail, normalizeEmail(record?.login_email), {
      full_name: clean(record?.full_name),
      first_name: clean(record?.first_name),
      last_name: clean(record?.last_name),
      dni: clean(record?.dni),
    })
  })

  return lookups
}

function buildRosterLookupsFromSnapshotsByInstitution({
  snapshotsByInstitution,
  institutionIds,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  const studentRecords = []
  const teacherRecords = []

  institutionIds.forEach((institutionId) => {
    const snapshot = snapshotsByInstitution.get(institutionId)
    if (!snapshot) return

    studentRecords.push(...buildStudentRecordsFromSnapshot({
      snapshot,
      institutionId,
      workspaceKey,
    }))
    teacherRecords.push(...buildTeacherRecordsFromSnapshot({
      snapshot,
      institutionId,
      workspaceKey,
    }))
  })

  return buildRosterLookupsFromRecords({
    studentRecords,
    teacherRecords,
  })
}

async function fetchRosterLookupsFromSnapshots({
  institutionIds,
  useRemote,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  if (institutionIds.length === 0) {
    return createEmptyRosterLookups()
  }

  try {
    const snapshotsByInstitution = await fetchSnapshotsByInstitution({
      institutionIds,
      useRemote,
      workspaceKey,
    })

    return buildRosterLookupsFromSnapshotsByInstitution({
      snapshotsByInstitution,
      institutionIds,
      workspaceKey,
    })
  } catch (error) {
    console.warn('No se pudieron leer los snapshots para enriquecer el directorio de usuarios.', error)
    return createEmptyRosterLookups()
  }
}

async function fetchRemoteRosterLookups({
  institutionIds,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  if (institutionIds.length === 0) {
    return createEmptyRosterLookups()
  }

  const [{ data: studentRows, error: studentError }, { data: teacherRows, error: teacherError }] = await Promise.all([
    supabase
      .from('student_records')
      .select('institution_id, email, full_name, first_name, last_name, career, dni')
      .eq('workspace_key', workspaceKey)
      .in('institution_id', institutionIds),
    supabase
      .from('teacher_records')
      .select('institution_id, login_email, full_name, first_name, last_name, dni')
      .eq('workspace_key', workspaceKey)
      .in('institution_id', institutionIds),
  ])

  if (studentError) throw studentError
  if (teacherError) throw teacherError

  return buildRosterLookupsFromRecords({
    studentRecords: studentRows ?? [],
    teacherRecords: teacherRows ?? [],
  })
}

async function buildUserDirectoryRosterLookups({
  users,
  useRemote,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  const institutionIds = [...new Set(
    users.flatMap((user) => user.institutions.map((institution) => institution.id)).filter(Boolean)
  )]

  if (institutionIds.length === 0) {
    return createEmptyRosterLookups()
  }

  if (useRemote && isSupabaseConfigured && supabase) {
    try {
      return await fetchRemoteRosterLookups({
        institutionIds,
        workspaceKey,
      })
    } catch (error) {
      console.warn(
        'No se pudieron leer los padrones normalizados para el directorio de usuarios. Se usara el snapshot como respaldo.',
        error,
      )
    }
  }

  return fetchRosterLookupsFromSnapshots({
    institutionIds,
    useRemote,
    workspaceKey,
  })
}

function enrichUsersForDirectory(users, rosterLookups) {
  return users
    .map((user) => {
      const roleBucket = getUserRoleBucket(user)
      const email = normalizeEmail(user.email)
      const rosterEntry = roleBucket === 'students'
        ? rosterLookups.studentsByEmail.get(email)
        : roleBucket === 'teachers'
          ? rosterLookups.teachersByEmail.get(email)
          : null
      const fullName = clean(rosterEntry?.full_name || user.display_name || user.email) || user.email

      return {
        ...user,
        display_name: fullName,
        full_name: fullName,
        first_name: clean(rosterEntry?.first_name),
        last_name: clean(rosterEntry?.last_name),
        dni: clean(rosterEntry?.dni),
        role_bucket: roleBucket,
        can_manage_memberships: roleBucket === 'administrators',
      }
    })
    .sort((left, right) => (
      clean(left.display_name).localeCompare(clean(right.display_name), 'es', { sensitivity: 'base' }) ||
      clean(left.email).localeCompare(clean(right.email), 'es', { sensitivity: 'base' })
    ))
}

export function generateSecurePassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?'
  const randomValues = crypto.getRandomValues(new Uint32Array(length))

  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('')
}

export async function fetchSuperAdminSummary({ useRemote }) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    return {
      totalInstitutions: store.institutions.length,
      totalUsers: store.users.length,
      activeInstitutions: store.institutions.filter((institution) => institution.status === 'active').length,
      source: 'local',
    }
  }

  const [{ count: totalInstitutions, error: institutionsError }, { count: totalUsers, error: usersError }] = await Promise.all([
    supabase.from('institutions').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('user_id', { count: 'exact', head: true }),
  ])

  if (institutionsError) throw institutionsError
  if (usersError) throw usersError

  const { data: activeInstitutionsData, error: activeError } = await supabase
    .from('institutions')
    .select('id')
    .eq('status', 'active')

  if (activeError) throw activeError

  return {
    totalInstitutions: totalInstitutions ?? 0,
    totalUsers: totalUsers ?? 0,
    activeInstitutions: activeInstitutionsData?.length ?? 0,
    source: 'supabase',
  }
}

export async function getAllInstitutions({ useRemote }) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    const adminCountByInstitution = buildInstitutionAdminCountMap(store)

    return {
      institutions: [...store.institutions]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((institution) => normalizeInstitution(institution, adminCountByInstitution[institution.id] ?? 0)),
      source: 'local',
    }
  }

  const { data, error } = await selectInstitutionWithPlanFallback(
    () => supabase
      .from('institutions')
      .select(institutionColumnsWithPlan)
      .order('created_at', { ascending: false }),
    () => supabase
      .from('institutions')
      .select(institutionBaseColumns)
      .order('created_at', { ascending: false }),
  )

  if (error) throw error
  const { users } = await getAllUsersWithInstitutions({ useRemote: true })
  const adminCountByInstitution = buildInstitutionAdminCountMapFromUsers(users)

  return {
    institutions: (data ?? []).map((institution) => normalizeInstitution(
      institution,
      adminCountByInstitution[institution.id] ?? 0
    )),
    source: 'supabase',
  }
}

export async function getInstitutionsPage({
  page = 1,
  pageSize = 10,
  searchTerm = '',
  statusFilter = '',
  useRemote,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    const adminCountByInstitution = buildInstitutionAdminCountMap(store)
    const baseInstitutions = [...store.institutions]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((institution) => normalizeInstitution(
        institution,
        adminCountByInstitution[institution.id] ?? 0,
      ))
    const enrichedInstitutions = await enrichInstitutionsWithOperationalMetrics({
      institutions: baseInstitutions,
      useRemote: false,
      workspaceKey,
    })
    const filteredInstitutions = filterInstitutions(
      enrichedInstitutions,
      searchTerm,
      statusFilter,
    )
    const paginatedInstitutions = paginateItems(filteredInstitutions, page, pageSize)

    return {
      ...paginatedInstitutions,
      institutions: paginatedInstitutions.items,
      source: 'local',
    }
  }

  const normalizedSearch = normalizeSearchTerm(searchTerm)
  const safePage = Math.max(page, 1)
  const safePageSize = Math.max(pageSize, 1)
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  const buildQuery = (selectFields, includePlanFilter) => {
    let query = supabase
      .from('institutions')
      .select(selectFields, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    if (normalizedSearch) {
      const filters = [
        `name.ilike.%${normalizedSearch}%`,
        `slug.ilike.%${normalizedSearch}%`,
        `status.ilike.%${normalizedSearch}%`,
      ]

      if (includePlanFilter) {
        filters.push(`plan_type.ilike.%${normalizedSearch}%`)
      }

      query = query.or(filters.join(','))
    }

    return query
  }

  const { data, count, error } = await selectInstitutionWithPlanFallback(
    () => buildQuery(institutionColumnsWithPlan, true),
    () => buildQuery(institutionBaseColumns, false),
  )

  if (error) throw error

  const total = count ?? 0
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize)
  const { users } = await getAllUsersWithInstitutions({ useRemote: true })
  const adminCountByInstitution = buildInstitutionAdminCountMapFromUsers(users)
  const baseInstitutions = (data ?? []).map((institution) => normalizeInstitution(
    institution,
    adminCountByInstitution[institution.id] ?? 0
  ))
  const institutions = await enrichInstitutionsWithOperationalMetrics({
    institutions: baseInstitutions,
    useRemote: true,
    workspaceKey,
  })

  return {
    institutions,
    total,
    page: totalPages === 0 ? 1 : Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalPages,
    source: 'supabase',
  }
}

export async function getAllUsersWithInstitutions({ useRemote }) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    return {
      users: buildLocalUserList(store),
      source: 'local',
    }
  }

  return {
    users: await fetchRemoteProfilesWithMemberships(),
    source: 'supabase',
  }
}

export async function getUsersDirectoryPage({
  page = 1,
  pageSize = 10,
  searchTerm = '',
  selectedRole = null,
  useRemote,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
}) {
  const normalizedRole = normalizeUserRoleFilter(selectedRole)
  const { users: baseUsers, source } = await getAllUsersWithInstitutions({ useRemote })
  const scopedUsers = baseUsers.filter(hasEffectiveUserAccess)
  const rosterLookups = await buildUserDirectoryRosterLookups({
    users: scopedUsers,
    useRemote,
    workspaceKey,
  })
  const users = enrichUsersForDirectory(scopedUsers, rosterLookups)
  const filteredUsers = normalizedRole
    ? filterUsersDirectory(users, searchTerm, normalizedRole)
    : []
  const paginatedUsers = paginateItems(filteredUsers, page, pageSize)

  return {
    users: paginatedUsers.items,
    total: paginatedUsers.total,
    page: paginatedUsers.page,
    pageSize: paginatedUsers.pageSize,
    totalPages: paginatedUsers.totalPages,
    selectedRole: normalizedRole,
    roleSummary: buildUserRoleSummary(users),
    totalUsers: users.length,
    source,
  }
}

export async function getUsersPage({
  page = 1,
  pageSize = 10,
  searchTerm = '',
  useRemote,
}) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const filteredUsers = filterUsers(buildLocalUserList(readLocalStore()), searchTerm)
    const paginatedUsers = paginateItems(filteredUsers, page, pageSize)

    return {
      ...paginatedUsers,
      users: paginatedUsers.items,
      source: 'local',
    }
  }

  const normalizedSearch = normalizeSearchTerm(searchTerm)
  const safePage = Math.max(page, 1)
  const safePageSize = Math.max(pageSize, 1)
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  // La tabla de usuarios es una de las primeras en crecer en un SaaS multi-tenant,
  // por eso dejamos el rango directo en la consulta y no en memoria del cliente.
  let query = supabase
    .from('profiles')
    .select(`
      user_id,
      email,
      display_name,
      account_role,
      is_global_admin,
      is_blocked,
      created_at,
      memberships(
        role,
        institution_id,
        institutions(
          id,
          name,
          slug,
          status
        )
      )
    `, { count: 'exact' })
    .order('email', { ascending: true })
    .range(from, to)

  if (normalizedSearch) {
    query = query.or([
      `email.ilike.%${normalizedSearch}%`,
      `display_name.ilike.%${normalizedSearch}%`,
      `account_role.ilike.%${normalizedSearch}%`,
    ].join(','))
  }

  const { data, count, error } = await query

  if (error) throw error

  const total = count ?? 0
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize)

  return {
    users: (data ?? []).map((profile) => ({
      id: profile.user_id,
      email: profile.email,
      display_name: profile.display_name ?? profile.email,
      account_role: profile.account_role ?? 'admin_instituto',
      is_global_admin: Boolean(profile.is_global_admin),
      is_blocked: Boolean(profile.is_blocked),
      created_at: profile.created_at,
      institutions: profile.is_global_admin
        ? []
        : (profile.memberships ?? [])
        .map((membership) => {
          const institution = membership.institutions
          if (!institution) return null

          return {
            id: institution.id,
            name: institution.name,
            slug: institution.slug,
            status: institution.status,
            role: membership.role,
          }
        })
        .filter(Boolean),
    })),
    total,
    page: totalPages === 0 ? 1 : Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalPages,
    source: 'supabase',
  }
}

export async function createInstitutionWithAdmin({
  adminEmail,
  adminPassword,
  institutionName,
  logoUrl,
  planType,
  status = 'active',
  useRemote,
}) {
  const normalizedEmail = adminEmail.trim().toLowerCase()
  const normalizedName = institutionName.trim()
  const normalizedLogoUrl = logoUrl.trim()
  const slug = slugify(normalizedName)

  if (!normalizedName) {
    throw new Error('El nombre de la institucion es obligatorio.')
  }

  if (!normalizedEmail) {
    throw new Error('El email del administrador principal es obligatorio.')
  }

  if ((!useRemote || !isSupabaseConfigured || !supabase) && !adminPassword.trim()) {
    throw new Error('Debes definir una contrasena para el administrador principal.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()

    if (store.institutions.some((institution) => institution.slug === slug)) {
      throw new Error('Ya existe una institucion local con ese nombre.')
    }

    let adminUser = store.users.find((user) => user.email.toLowerCase() === normalizedEmail)
    const tenantId = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    const institution = {
      id: tenantId,
      name: normalizedName,
      slug,
      logo_url: normalizedLogoUrl,
      plan_type: planType,
      status,
      created_at: createdAt,
    }

    if (!adminUser) {
      adminUser = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        display_name: normalizedName,
        role: 'admin_instituto',
        is_global_admin: false,
        is_blocked: false,
        created_at: createdAt,
      }
      store.users.unshift(adminUser)
    }

    store.institutions.unshift(institution)
    store.memberships.push({
      institution_id: tenantId,
      user_id: adminUser.id,
      role: 'owner',
    })

    writeLocalStore(store)

    return {
      institution,
      adminUser,
      source: 'local',
    }
  }

  const data = await invokeAdminUsers({
    action: 'create_tenant_with_admin',
    institution_name: normalizedName,
    institution_slug: slug,
    institution_plan_type: planType,
    institution_status: status,
    institution_logo_url: normalizedLogoUrl || null,
    admin_email: normalizedEmail,
    admin_password: adminPassword,
    admin_display_name: normalizedName,
  })

  return {
    institution: {
      id: data?.institution_id,
      name: normalizedName,
      slug,
      logo_url: normalizedLogoUrl,
      plan_type: planType,
      status,
      created_at: data?.created_at ?? new Date().toISOString(),
    },
    adminUser: {
      id: data?.admin_user_id,
      email: normalizedEmail,
      role: 'admin_instituto',
      tenant_id: data?.institution_id,
      is_global_admin: false,
    },
    source: 'supabase',
  }
}

export async function createOrAssignInstitutionUser({
  email,
  password,
  displayName,
  institutionIds,
  role,
  useRemote,
}) {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedDisplayName = displayName.trim()
  const uniqueInstitutionIds = [...new Set(institutionIds.filter(Boolean))]

  if (!normalizedEmail) {
    throw new Error('El email del usuario es obligatorio.')
  }

  if (!normalizedDisplayName) {
    throw new Error('El nombre visible del usuario es obligatorio.')
  }

  if (uniqueInstitutionIds.length === 0) {
    throw new Error('Debes asignar al menos una institucion.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    let user = store.users.find((entry) => entry.email.toLowerCase() === normalizedEmail)

    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        display_name: normalizedDisplayName,
        role: 'admin_instituto',
        is_global_admin: false,
        is_blocked: false,
        created_at: new Date().toISOString(),
      }
      store.users.unshift(user)
    } else {
      user.display_name = normalizedDisplayName
    }

    uniqueInstitutionIds.forEach((institutionId) => {
      const existingMembership = store.memberships.find(
        (membership) => membership.institution_id === institutionId && membership.user_id === user.id
      )

      if (existingMembership) {
        existingMembership.role = role
        return
      }

      store.memberships.push({
        institution_id: institutionId,
        user_id: user.id,
        role,
      })
    })

    writeLocalStore(store)

    return {
      user,
      source: 'local',
    }
  }

  const data = await invokeAdminUsers({
    action: 'create_or_assign_institution_user',
    user_email: normalizedEmail,
    user_password: password.trim() || null,
    user_display_name: normalizedDisplayName,
    institution_ids: uniqueInstitutionIds,
    membership_role: role,
  })

  return {
    user: {
      id: data?.user_id,
      email: normalizedEmail,
      display_name: normalizedDisplayName,
      role: 'admin_instituto',
    },
    source: 'supabase',
  }
}

export async function updateInstitutionUser({
  userId,
  email,
  displayName,
  institutionIds,
  role,
  useRemote,
}) {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedDisplayName = displayName.trim()
  const uniqueInstitutionIds = [...new Set(institutionIds.filter(Boolean))]

  if (!userId) {
    throw new Error('El usuario a editar es obligatorio.')
  }

  if (!normalizedEmail) {
    throw new Error('El email del usuario es obligatorio.')
  }

  if (!normalizedDisplayName) {
    throw new Error('El nombre visible del usuario es obligatorio.')
  }

  if (uniqueInstitutionIds.length === 0) {
    throw new Error('Debes asignar al menos una institucion.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    const user = store.users.find((entry) => entry.id === userId)

    if (!user) {
      throw new Error('Usuario no encontrado localmente.')
    }

    const emailAlreadyUsed = store.users.some(
      (entry) => entry.id !== userId && entry.email.toLowerCase() === normalizedEmail
    )

    if (emailAlreadyUsed) {
      throw new Error('Ya existe otro usuario con ese email.')
    }

    user.email = normalizedEmail
    user.display_name = normalizedDisplayName

    const currentMemberships = store.memberships.filter((entry) => entry.user_id === userId)
    const selectedInstitutionIds = new Set(uniqueInstitutionIds)

    store.memberships = store.memberships.filter((entry) => (
      entry.user_id !== userId || selectedInstitutionIds.has(entry.institution_id)
    ))

    uniqueInstitutionIds.forEach((institutionId) => {
      const existingMembership = currentMemberships.find(
        (entry) => entry.institution_id === institutionId
      )

      if (existingMembership) {
        const storeMembership = store.memberships.find(
          (entry) => entry.user_id === userId && entry.institution_id === institutionId
        )

        if (storeMembership) {
          storeMembership.role = role
        }
        return
      }

      store.memberships.push({
        institution_id: institutionId,
        user_id: userId,
        role,
      })
    })

    writeLocalStore(store)

    return {
      user,
      source: 'local',
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, email, display_name')
    .eq('user_id', userId)
    .single()

  if (profileError) throw profileError

  if ((profile.email ?? '').toLowerCase() !== normalizedEmail) {
    throw new Error('Por ahora el email solo puede editarse en modo local.')
  }

  const { error: updateProfileError } = await supabase
    .from('profiles')
    .update({
      display_name: normalizedDisplayName,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (updateProfileError) throw updateProfileError

  const { data: membershipRows, error: membershipsError } = await supabase
    .from('memberships')
    .select('institution_id, role')
    .eq('user_id', userId)

  if (membershipsError) throw membershipsError

  const currentInstitutionIds = new Set((membershipRows ?? []).map((entry) => entry.institution_id))
  const nextInstitutionIds = new Set(uniqueInstitutionIds)

  for (const institutionId of uniqueInstitutionIds) {
    if (currentInstitutionIds.has(institutionId)) {
      const currentMembership = membershipRows.find((entry) => entry.institution_id === institutionId)

      if (currentMembership?.role !== role) {
        await updateUserInstitutionRole({
          userId,
          institutionId,
          role,
          useRemote: true,
        })
      }
      continue
    }

    const { error: insertMembershipError } = await supabase
      .from('memberships')
      .insert({
        user_id: userId,
        institution_id: institutionId,
        role,
      })

    if (insertMembershipError) throw insertMembershipError
  }

  for (const institutionId of currentInstitutionIds) {
    if (!nextInstitutionIds.has(institutionId)) {
      await removeUserInstitutionAccess({
        userId,
        institutionId,
        useRemote: true,
      })
    }
  }

  return {
    user: {
      id: userId,
      email: normalizedEmail,
      display_name: normalizedDisplayName,
      role: profile.account_role ?? 'admin_instituto',
    },
    source: 'supabase',
  }
}

export async function updateInstitution({ id, updates, useRemote }) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    const index = store.institutions.findIndex((institution) => institution.id === id)
    if (index === -1) throw new Error('Institucion no encontrada localmente.')

    const updatedInstitution = { ...store.institutions[index], ...updates }
    store.institutions[index] = updatedInstitution
    writeLocalStore(store)
    return { institution: updatedInstitution, source: 'local' }
  }

  const { data, error } = await supabase
    .from('institutions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return { institution: normalizeInstitution(data), source: 'supabase' }
}

export async function updateUserInstitutionRole({
  userId,
  institutionId,
  role,
  useRemote,
}) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    const membership = store.memberships.find(
      (entry) => entry.user_id === userId && entry.institution_id === institutionId
    )

    if (!membership) {
      throw new Error('La asignacion no existe localmente.')
    }

    membership.role = role
    writeLocalStore(store)
    return { success: true, source: 'local' }
  }

  const { error } = await supabase.rpc('update_membership_role', {
    target_user_id: userId,
    target_institution_id: institutionId,
    new_role: role,
  })

  if (error) throw error
  return { success: true, source: 'supabase' }
}

export async function removeUserInstitutionAccess({
  userId,
  institutionId,
  useRemote,
}) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    store.memberships = store.memberships.filter(
      (entry) => !(entry.user_id === userId && entry.institution_id === institutionId)
    )
    writeLocalStore(store)
    return { success: true, source: 'local' }
  }

  const { error } = await supabase.rpc('remove_user_membership', {
    target_user_id: userId,
    target_institution_id: institutionId,
  })

  if (error) throw error
  return { success: true, source: 'supabase' }
}

export async function toggleUserBlockedStatus({
  userId,
  shouldBlock,
  useRemote,
}) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    const user = store.users.find((entry) => entry.id === userId)

    if (!user) {
      throw new Error('Usuario no encontrado localmente.')
    }

    user.is_blocked = shouldBlock
    writeLocalStore(store)
    return { success: true, source: 'local' }
  }

  const { error } = await supabase.rpc('set_user_access_status', {
    target_user_id: userId,
    blocked: shouldBlock,
  })

  if (error) throw error
  return { success: true, source: 'supabase' }
}

export async function resetUserPassword({
  userId,
  newPassword,
  useRemote,
}) {
  if (!userId) {
    throw new Error('El usuario es obligatorio.')
  }

  if (!newPassword || newPassword.trim().length < 8) {
    throw new Error('La nueva contrasena debe tener al menos 8 caracteres.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    const user = store.users.find((entry) => entry.id === userId)

    if (!user) {
      throw new Error('Usuario no encontrado localmente.')
    }

    user.last_password_reset_at = new Date().toISOString()
    writeLocalStore(store)
    return { success: true, source: 'local' }
  }

  // No usamos fallback SQL para contrasenas: actualizar encrypted_password a mano
  // puede parecer exitoso pero dejar credenciales invalidas para Supabase Auth.
  await invokeAdminUsers({
    action: 'set_user_password',
    target_user_id: userId,
    new_password: newPassword.trim(),
  })

  return { success: true, source: 'supabase' }
}

export async function deleteUser({ userId, useRemote }) {
  if (!userId) {
    throw new Error('El usuario a eliminar es obligatorio.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    const user = store.users.find((entry) => entry.id === userId)

    if (!user) {
      throw new Error('Usuario no encontrado localmente.')
    }

    if (user.is_global_admin) {
      throw new Error('No se puede eliminar un usuario superadmin desde este panel.')
    }

    store.users = store.users.filter((entry) => entry.id !== userId)
    store.memberships = store.memberships.filter((entry) => entry.user_id !== userId)
    writeLocalStore(store)

    return { success: true, source: 'local' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, is_global_admin')
    .eq('user_id', userId)
    .single()

  if (profileError) throw profileError

  if (profile?.is_global_admin) {
    throw new Error('No se puede eliminar un usuario superadmin desde este panel.')
  }

  const { error } = await supabase.rpc('delete_institution_user', {
    target_user_id: userId,
  })

  if (error) throw error
  return { success: true, source: 'supabase' }
}

export async function deleteInstitution({ id, useRemote }) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    const store = readLocalStore()
    store.institutions = store.institutions.filter((institution) => institution.id !== id)
    store.memberships = store.memberships.filter((membership) => membership.institution_id !== id)
    writeLocalStore(store)
    return { success: true, source: 'local' }
  }

  const { error } = await supabase
    .from('institutions')
    .delete()
    .eq('id', id)

  if (error) throw error
  return { success: true, source: 'supabase' }
}
