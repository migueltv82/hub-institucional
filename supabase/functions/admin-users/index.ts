import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const defaultAllowedOrigins = new Set([
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

function getAllowedOrigins() {
  const rawOrigins =
    Deno.env.get('ADMIN_USERS_ALLOWED_ORIGINS') ??
    Deno.env.get('ALLOWED_ORIGINS') ??
    ''

  const configuredOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return configuredOrigins.length > 0
    ? new Set(configuredOrigins)
    : defaultAllowedOrigins
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true
  const allowedOrigins = getAllowedOrigins()
  return allowedOrigins.has(origin)
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin')
  const allowOrigin = origin && isAllowedOrigin(origin)
    ? origin
    : 'null'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function assertAllowedOrigin(req: Request) {
  const origin = req.headers.get('Origin')
  if (!isAllowedOrigin(origin)) {
    throw new HttpError('Origen no permitido para admin-users.', 403)
  }
}

function assertBearerAuthorization(req: Request) {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ') || authorization.slice('Bearer '.length).trim().length < 20) {
    throw new HttpError('Sesion invalida. Inicia sesion nuevamente.', 401)
  }
}

const fallbackCorsHeaders = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const membershipRoles = new Set(['owner', 'admin', 'editor', 'viewer'])
const planTypes = new Set(['free', 'pro', 'business'])
const institutionStatuses = new Set(['active', 'suspended'])

class HttpError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function badRequest(message: string) {
  return new HttpError(message, 400)
}

function jsonResponse(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : fallbackCorsHeaders),
      'Content-Type': 'application/json',
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${fieldName} es obligatorio.`)
  }

  return value.trim()
}

function normalizeEmail(value: unknown) {
  return requireString(value, 'El email').toLowerCase()
}

function getStudentPassword(value: unknown) {
  const password = String(value ?? '').trim().replace(/\s+/g, '')
  if (!password) return ''
  return password
}

function getStudentDisplayName(student: Record<string, unknown>, email: string) {
  const fullName = typeof student.full_name === 'string' ? student.full_name.trim() : ''
  const displayName = typeof student.display_name === 'string' ? student.display_name.trim() : ''
  const nombre = typeof student.nombre === 'string' ? student.nombre.trim() : ''
  const apellido = typeof student.apellido === 'string' ? student.apellido.trim() : ''
  return fullName || displayName || [nombre, apellido].filter(Boolean).join(' ') || email
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, columnName: string) {
  const message = String(error?.message ?? '').toLowerCase()
  const normalizedColumn = columnName.toLowerCase()

  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    (
      message.includes(normalizedColumn) &&
      (
        message.includes('does not exist') ||
        message.includes('no existe') ||
        message.includes('schema cache')
      )
    )
  )
}

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined, relationName: string) {
  const message = String(error?.message ?? '').toLowerCase()
  const normalizedRelation = relationName.toLowerCase()

  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (
      message.includes(normalizedRelation) &&
      (
        message.includes('does not exist') ||
        message.includes('no existe') ||
        message.includes('schema cache')
      )
    )
  )
}

function getTeacherDisplayName(teacher: Record<string, unknown>) {
  const fullName = typeof teacher.full_name === 'string' ? teacher.full_name.trim() : ''
  const displayName = typeof teacher.display_name === 'string' ? teacher.display_name.trim() : ''
  const nombre = typeof teacher.nombre === 'string' ? teacher.nombre.trim() : ''
  const apellido = typeof teacher.apellido === 'string' ? teacher.apellido.trim() : ''
  return fullName || displayName || [nombre, apellido].filter(Boolean).join(' ') || nombre
}

function getTeacherPassword(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, '')
}

function getTeacherTechnicalEmail({ dni, institutionId }: { dni: string; institutionId: string }) {
  return `${dni}@docentes.${institutionId}.local`.toLowerCase()
}

function sanitizeAuditMetadata(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (key.toLowerCase().includes('password')) {
        return [key, '[redacted]']
      }

      return [key, value]
    }),
  )
}

function getAuditTarget(action: string, payload: Record<string, unknown>, result: unknown) {
  const body = isRecord(result) ? result : {}

  if (action === 'create_tenant_with_admin') {
    return {
      target_type: 'institution',
      target_id: typeof body.institution_id === 'string' ? body.institution_id : null,
    }
  }

  if (action === 'create_or_assign_institution_user') {
    return {
      target_type: 'user',
      target_id: typeof body.user_id === 'string' ? body.user_id : null,
    }
  }

  if (action === 'bulk_create_students') {
    return {
      target_type: 'institution',
      target_id: typeof payload.institution_id === 'string' ? payload.institution_id : null,
    }
  }

  if (action === 'bulk_create_teachers') {
    return {
      target_type: 'institution',
      target_id: typeof payload.institution_id === 'string' ? payload.institution_id : null,
    }
  }

  if (action === 'set_user_password') {
    return {
      target_type: 'user',
      target_id: typeof payload.target_user_id === 'string' ? payload.target_user_id : null,
    }
  }

  if (
    action === 'student_portal_mutation' ||
    action === 'reset_student_academic_records' ||
    action === 'teacher_reset_student_subject_academic_records'
  ) {
    return {
      target_type: 'institution',
      target_id: typeof payload.institution_id === 'string' ? payload.institution_id : null,
    }
  }

  if (action === 'teacher_profile_update') {
    return {
      target_type: 'user',
      target_id: typeof body.user_id === 'string' ? body.user_id : null,
    }
  }

  return {
    target_type: null,
    target_id: null,
  }
}

async function recordAdminAudit({
  adminClient,
  caller,
  action,
  status,
  target,
  metadata,
  errorMessage = null,
}: {
  adminClient: ReturnType<typeof createClient>
  caller: { id: string; email?: string | null }
  action: string
  status: 'success' | 'error'
  target: { target_type: string | null; target_id: string | null }
  metadata: Record<string, unknown>
  errorMessage?: string | null
}) {
  try {
    const { error } = await adminClient
      .from('admin_audit_logs')
      .insert({
        actor_user_id: caller.id,
        actor_email: caller.email ?? null,
        action,
        status,
        target_type: target.target_type,
        target_id: target.target_id,
        metadata,
        error_message: errorMessage,
      })

    if (error) {
      console.warn('No se pudo registrar auditoria administrativa.', error.message)
    }
  } catch (error) {
    console.warn(
      'No se pudo registrar auditoria administrativa.',
      error instanceof Error ? error.message : error,
    )
  }
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getClients(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SERVICE_ROLE_KEY') ??
    Deno.env.get('ADMIN_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY o SERVICE_ROLE_KEY.')
  }

  const authorization = req.headers.get('Authorization') ?? ''

  // Cliente con anon key + JWT del navegador: solo sirve para identificar
  // al usuario que llama. No concede permisos administrativos por si mismo.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Cliente server-side con service role. Esta key nunca debe salir al frontend.
  // Se usa solo despues de validar que el caller sea superadmin.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return { userClient, adminClient }
}

async function getAuthenticatedContext(req: Request) {
  const { userClient, adminClient } = getClients(req)
  const { data: userData, error: userError } = await userClient.auth.getUser()

  if (userError || !userData.user) {
    throw new HttpError('Sesion invalida. Inicia sesion nuevamente.', 401)
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('is_global_admin, is_blocked, account_role, display_name, email')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (profileError) throw profileError

  if (profile?.is_blocked) {
    throw new HttpError('Tu usuario esta bloqueado. Contacta al administrador del sistema.', 403)
  }

  return { adminClient, caller: userData.user, profile }
}

async function requireStudentPortalMember(req: Request, institutionId: string) {
  if (!institutionId) {
    throw badRequest('La institucion es obligatoria para guardar cambios del alumno.')
  }

  const context = await getAuthenticatedContext(req)
  const role = String(context.profile?.account_role ?? '').toLowerCase()

  if (!['alumno', 'student'].includes(role)) {
    throw new HttpError('Acceso denegado: se requiere una cuenta de alumno.', 403)
  }

  const { data: membership, error: membershipError } = await context.adminClient
    .from('memberships')
    .select('role')
    .eq('institution_id', institutionId)
    .eq('user_id', context.caller.id)
    .maybeSingle()

  if (membershipError) throw membershipError

  if (!membership) {
    throw new HttpError('Acceso denegado: el alumno no pertenece a esta institucion.', 403)
  }

  return context
}

async function requireTeacherPortalMember(req: Request, institutionId: string) {
  if (!institutionId) {
    throw badRequest('La institucion es obligatoria para guardar cambios del docente.')
  }

  const context = await getAuthenticatedContext(req)
  const role = String(context.profile?.account_role ?? '').toLowerCase()

  if (!['docente', 'teacher'].includes(role)) {
    throw new HttpError('Acceso denegado: se requiere una cuenta docente.', 403)
  }

  const { data: membership, error: membershipError } = await context.adminClient
    .from('memberships')
    .select('role')
    .eq('institution_id', institutionId)
    .eq('user_id', context.caller.id)
    .maybeSingle()

  if (membershipError) throw membershipError
  if (!membership) {
    throw new HttpError('Acceso denegado: el docente no pertenece a esta institucion.', 403)
  }

  return context
}

async function requireInstitutionAdmin(req: Request, institutionId: string) {
  if (!institutionId) {
    throw badRequest('La institucion es obligatoria para crear accesos de alumnos.')
  }

  const context = await getAuthenticatedContext(req)

  if (context.profile?.is_global_admin) {
    return context
  }

  const { data: membership, error: membershipError } = await context.adminClient
    .from('memberships')
    .select('role')
    .eq('institution_id', institutionId)
    .eq('user_id', context.caller.id)
    .maybeSingle()

  if (membershipError) throw membershipError

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new HttpError('Acceso denegado: se requieren permisos de administrador institucional.', 403)
  }

  return context
}

async function requireSuperAdmin(req: Request) {
  const { userClient, adminClient } = getClients(req)
  const { data: userData, error: userError } = await userClient.auth.getUser()

  if (userError || !userData.user) {
    throw new HttpError('Sesion invalida. Inicia sesion nuevamente.', 401)
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('is_global_admin, is_blocked')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (profileError) throw profileError

  // La autorizacion fina no depende de verify_jwt de la Edge Function.
  // La funcion acepta CORS/preflight y valida aca contra public.profiles.
  if (!profile?.is_global_admin || profile?.is_blocked) {
    throw new HttpError('Acceso denegado: se requieren permisos de Super Admin.', 403)
  }

  return { adminClient, caller: userData.user }
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  let page = 1
  const perPage = 1000

  // Supabase Auth Admin no expone una busqueda directa por email en todos los planes/SDKs.
  // Para el piloto paginamos usuarios; en produccion con volumen alto conviene moverlo a backend propio.
  while (page <= 20) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const user = data.users.find((entry) => entry.email?.toLowerCase() === email)
    if (user) return user
    if (data.users.length < perPage) return null
    page += 1
  }

  return null
}

async function deleteAuthUsersByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  const normalizedEmail = email.toLowerCase()
  let page = 1
  const perPage = 1000

  while (page <= 20) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const matchingUsers = data.users.filter((entry) => entry.email?.toLowerCase() === normalizedEmail)

    for (const user of matchingUsers) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
      if (deleteError) throw deleteError
    }

    if (data.users.length < perPage) return
    page += 1
  }
}

async function createOrReuseAuthUser({
  adminClient,
  email,
  password,
  displayName,
}: {
  adminClient: ReturnType<typeof createClient>
  email: string
  password: string
  displayName: string
}) {
  const existingUser = await findAuthUserByEmail(adminClient, email)

  if (existingUser) {
    // Si el email ya existe, actualizamos metadata y opcionalmente la contrasena.
    // Esto permite reutilizar admins existentes sin duplicar cuentas Auth.
    const { error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
      ...(password?.trim() ? { password: password.trim() } : {}),
      email_confirm: true,
      user_metadata: {
        ...existingUser.user_metadata,
        full_name: displayName || existingUser.user_metadata?.full_name || email,
        account_role: existingUser.user_metadata?.account_role ?? 'admin_instituto',
      },
    })

    if (updateError) throw updateError
    return existingUser
  }

  // La creacion real de credenciales debe hacerse con Auth Admin API.
  // Evitamos insertar directo en auth.users porque genera usuarios que pueden no loguear.
  if (!password || password.trim().length < 8) {
    throw badRequest('La contrasena debe tener al menos 8 caracteres.')
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: password.trim(),
    email_confirm: true,
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {
      full_name: displayName || email,
      account_role: 'admin_instituto',
    },
  })

  if (error) throw error
  if (!data.user) throw new Error('Supabase no devolvio el usuario creado.')
  return data.user
}

async function upsertProfile({
  adminClient,
  userId,
  email,
  displayName,
}: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  email: string
  displayName: string
}) {
  const { error } = await adminClient
    .from('profiles')
    .upsert({
      user_id: userId,
      email,
      display_name: displayName || email,
      account_role: 'admin_instituto',
      is_global_admin: false,
      is_blocked: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw error
}

async function assignMemberships({
  adminClient,
  userId,
  institutionIds,
  role,
}: {
  adminClient: ReturnType<typeof createClient>
  userId: string
  institutionIds: string[]
  role: string
}) {
  if (!membershipRoles.has(role)) {
    throw badRequest(`Rol invalido: ${role}`)
  }

  const rows = [...new Set(institutionIds.filter(Boolean))].map((institutionId) => ({
    institution_id: institutionId,
    user_id: userId,
    role,
  }))

  if (rows.length === 0) {
    throw badRequest('Debes asignar al menos una institucion.')
  }

  const { error } = await adminClient
    .from('memberships')
    .upsert(rows, { onConflict: 'institution_id,user_id' })

  if (error) throw error
}

async function handleCreateTenantWithAdmin(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const institutionName = requireString(payload.institution_name, 'El nombre de la institucion')
  const slug = requireString(payload.institution_slug ?? slugify(institutionName), 'El slug de la institucion')
  const planType = typeof payload.institution_plan_type === 'string' && planTypes.has(payload.institution_plan_type)
    ? payload.institution_plan_type
    : 'free'
  const status = typeof payload.institution_status === 'string' && institutionStatuses.has(payload.institution_status)
    ? payload.institution_status
    : 'active'
  const logoUrl = typeof payload.institution_logo_url === 'string' && payload.institution_logo_url.trim()
    ? payload.institution_logo_url.trim()
    : null
  const email = normalizeEmail(payload.admin_email)
  const password = requireString(payload.admin_password, 'La contrasena inicial')
  const displayName = typeof payload.admin_display_name === 'string' && payload.admin_display_name.trim()
    ? payload.admin_display_name.trim()
    : institutionName

  const { data: institution, error: institutionError } = await adminClient
    .from('institutions')
    .insert({
      name: institutionName,
      slug,
      plan_type: planType,
      status,
      logo_url: logoUrl,
    })
    .select('id, created_at')
    .single()

  if (institutionError) throw institutionError

  const authUser = await createOrReuseAuthUser({
    adminClient,
    email,
    password,
    displayName,
  })

  await upsertProfile({
    adminClient,
    userId: authUser.id,
    email,
    displayName,
  })

  await assignMemberships({
    adminClient,
    userId: authUser.id,
    institutionIds: [institution.id],
    role: 'owner',
  })

  return {
    institution_id: institution.id,
    admin_user_id: authUser.id,
    created_at: institution.created_at,
  }
}

async function handleCreateOrAssignInstitutionUser(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const email = normalizeEmail(payload.user_email)
  const password = requireString(payload.user_password, 'La contrasena inicial')
  const displayName = requireString(payload.user_display_name, 'El nombre visible')
  const institutionIds = Array.isArray(payload.institution_ids)
    ? payload.institution_ids.filter((entry): entry is string => typeof entry === 'string')
    : []
  const role = requireString(payload.membership_role, 'El rol institucional')

  const authUser = await createOrReuseAuthUser({
    adminClient,
    email,
    password,
    displayName,
  })

  await upsertProfile({
    adminClient,
    userId: authUser.id,
    email,
    displayName,
  })

  await assignMemberships({
    adminClient,
    userId: authUser.id,
    institutionIds,
    role,
  })

  return {
    user_id: authUser.id,
    email,
    created_at: new Date().toISOString(),
  }
}

async function createOrReuseStudentAuthUser({
  adminClient,
  email,
  password,
  displayName,
}: {
  adminClient: ReturnType<typeof createClient>
  email: string
  password: string
  displayName: string
}) {
  if (password.length < 6) {
    throw badRequest(`El DNI usado como contrasena para ${email} debe tener al menos 6 caracteres.`)
  }

  const existingUser = await findAuthUserByEmail(adminClient, email)

  if (existingUser) {
    const { data: existingProfile, error: profileLookupError } = await adminClient
      .from('profiles')
      .select('account_role, is_global_admin')
      .eq('user_id', existingUser.id)
      .maybeSingle()

    if (profileLookupError) throw profileLookupError

    const existingRole = String(
      existingProfile?.account_role ?? existingUser.user_metadata?.account_role ?? '',
    ).toLowerCase()
    const canReuseAsStudent = !existingRole || ['alumno', 'student'].includes(existingRole)

    if (existingProfile?.is_global_admin || !canReuseAsStudent) {
      throw badRequest(`El email ${email} ya pertenece a un usuario con otro rol. No se modifico ese acceso.`)
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...existingUser.user_metadata,
        full_name: displayName || existingUser.user_metadata?.full_name || email,
        account_role: 'alumno',
      },
    })

    if (updateError) throw updateError
    return { user: existingUser, status: 'updated' }
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {
      full_name: displayName || email,
      account_role: 'alumno',
    },
  })

  if (error) throw error
  if (!data.user) throw new Error('Supabase no devolvio el usuario alumno creado.')
  return { user: data.user, status: 'created' }
}

async function createOrReuseTeacherAuthUser({
  adminClient,
  email,
  password,
  displayName,
  dni,
}: {
  adminClient: ReturnType<typeof createClient>
  email: string
  password: string
  displayName: string
  dni: string
}) {
  if (password.length < 6) {
    throw badRequest(`El DNI usado como contrasena para ${displayName} debe tener al menos 6 caracteres.`)
  }

  const existingUser = await findAuthUserByEmail(adminClient, email)

  if (existingUser) {
    const { data: existingProfile, error: profileLookupError } = await adminClient
      .from('profiles')
      .select('account_role, is_global_admin')
      .eq('user_id', existingUser.id)
      .maybeSingle()

    if (profileLookupError) throw profileLookupError

    const existingRole = String(
      existingProfile?.account_role ?? existingUser.user_metadata?.account_role ?? '',
    ).toLowerCase()
    const canReuseAsTeacher = !existingRole || ['docente', 'profesor', 'teacher'].includes(existingRole)

    if (existingProfile?.is_global_admin || !canReuseAsTeacher) {
      throw badRequest(`El DNI ${dni} ya pertenece a un usuario con otro rol. No se modifico ese acceso.`)
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...existingUser.user_metadata,
        full_name: displayName || existingUser.user_metadata?.full_name || email,
        account_role: 'docente',
        dni,
      },
    })

    if (updateError) throw updateError
    return { user: existingUser, status: 'updated' }
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {
      full_name: displayName || email,
      account_role: 'docente',
      dni,
    },
  })

  if (error) throw error
  if (!data.user) throw new Error('Supabase no devolvio el usuario docente creado.')
  return { user: data.user, status: 'created' }
}

async function linkStudentRecordsToProfile({
  adminClient,
  institutionId,
  email,
  userId,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  email: string
  userId: string
}) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !userId) return 0

  const { data, error } = await adminClient
    .from('student_records')
    .update({
      profile_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('institution_id', institutionId)
    .eq('email', normalizedEmail)
    .select('id')

  if (error) {
    if (isMissingColumnError(error, 'profile_id')) return 0
    throw error
  }

  return Array.isArray(data) ? data.length : 0
}

async function persistStudentRecord({
  adminClient,
  institutionId,
  student,
  email,
  displayName,
  userId,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  student: Record<string, unknown>
  email: string
  displayName: string
  userId: string
}) {
  const career = String(student.carrera ?? student.career ?? '').trim()
  const firstName = String(student.nombre ?? student.first_name ?? '').trim()
  const lastName = String(student.apellido ?? student.last_name ?? '').trim()
  const { data, error } = await adminClient
    .from('student_records')
    .upsert({
      institution_id: institutionId,
      workspace_key: 'main',
      profile_id: userId,
      email,
      full_name: displayName,
      first_name: firstName,
      last_name: lastName,
      career,
      academic_year: String(student.anio ?? student.academic_year ?? '').trim(),
      dni: getStudentPassword(student.dni ?? student.documento),
      legajo: String(student.legajo ?? '').trim(),
      phone: String(student.telefono ?? student.phone ?? '').trim(),
      status: String(student.estado ?? student.status ?? 'activo').trim() || 'activo',
      raw_payload: student,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'institution_id,workspace_key,email,career' })
    .select('id')
    .single()

  if (error) throw error
  return data?.id ?? null
}

async function persistAndLinkTeacherRecord({
  adminClient,
  institutionId,
  teacher,
  email,
  displayName,
  dni,
  userId,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  teacher: Record<string, unknown>
  email: string
  displayName: string
  dni: string
  userId: string
}) {
  const names = displayName.split(/\s+/).filter(Boolean)
  const payload = {
    institution_id: institutionId,
    workspace_key: 'main',
    login_email: email,
    full_name: displayName,
    first_name: String(teacher.nombre ?? teacher.first_name ?? names[0] ?? '').trim(),
    last_name: String(teacher.apellido ?? teacher.last_name ?? names.slice(1).join(' ')).trim(),
    dni,
    phone: String(teacher.telefono ?? teacher.phone ?? '').trim(),
    status: String(teacher.estado ?? teacher.status ?? 'activo').trim() || 'activo',
    raw_payload: teacher,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await adminClient
    .from('teacher_records')
    .upsert(payload, { onConflict: 'institution_id,workspace_key,dni' })
    .select('id')
    .single()
  if (error) throw error

  const { error: linkError } = await adminClient
    .from('teacher_records')
    .update({ profile_id: userId, login_email: email, updated_at: new Date().toISOString() })
    .eq('id', data.id)

  if (linkError && !isMissingColumnError(linkError, 'profile_id')) throw linkError
  return data.id
}

async function handleBulkCreateStudents(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const institutionId = requireString(payload.institution_id, 'La institucion')
  const students = Array.isArray(payload.students)
    ? payload.students.filter(isRecord)
    : []

  if (students.length === 0) {
    throw badRequest('Debes enviar al menos un alumno para crear accesos.')
  }

  const results: Array<Record<string, unknown>> = []
  const errors: Array<Record<string, unknown>> = []

  for (const [index, student] of students.entries()) {
    const rowNumber = index + 2

    try {
      const email = normalizeEmail(student.email ?? student.correo ?? student.mail)
      const password = getStudentPassword(student.dni ?? student.documento ?? student.password)
      const displayName = getStudentDisplayName(student, email)

      if (!password) {
        throw badRequest(`Fila ${rowNumber}: falta DNI para usar como contrasena inicial.`)
      }

      const { user, status } = await createOrReuseStudentAuthUser({
        adminClient,
        email,
        password,
        displayName,
      })

      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert({
          user_id: user.id,
          email,
          display_name: displayName,
          account_role: 'alumno',
          is_global_admin: false,
          is_blocked: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (profileError) throw profileError

      await assignMemberships({
        adminClient,
        userId: user.id,
        institutionIds: [institutionId],
        role: 'viewer',
      })

      const studentRecordId = await persistStudentRecord({
        adminClient,
        institutionId,
        student,
        email,
        displayName,
        userId: user.id,
      })

      const linkedStudentRecords = await linkStudentRecordsToProfile({
        adminClient,
        institutionId,
        email,
        userId: user.id,
      })

      results.push({
        email,
        user_id: user.id,
        linked_student_records: linkedStudentRecords,
        student_record_id: studentRecordId,
        status,
      })
    } catch (error) {
      errors.push({
        row: rowNumber,
        email: typeof student.email === 'string' ? student.email : null,
        error: error instanceof Error ? error.message : 'Error inesperado.',
      })
    }
  }

  return {
    success: errors.length === 0,
    created: results.filter((entry) => entry.status === 'created').length,
    updated: results.filter((entry) => entry.status === 'updated').length,
    failed: errors.length,
    results,
    errors,
  }
}

async function handleBulkCreateTeachers(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const institutionId = requireString(payload.institution_id, 'La institucion')
  const teachers = Array.isArray(payload.teachers)
    ? payload.teachers.filter(isRecord)
    : []

  if (teachers.length === 0) {
    throw badRequest('Debes enviar al menos un docente para crear accesos.')
  }

  const results: Array<Record<string, unknown>> = []
  const errors: Array<Record<string, unknown>> = []

  for (const [index, teacher] of teachers.entries()) {
    const rowNumber = index + 2

    try {
      const displayName = getTeacherDisplayName(teacher)
      const dni = getTeacherPassword(teacher.dni ?? teacher.documento)

      if (!displayName) {
        throw badRequest(`Fila ${rowNumber}: falta nombre del docente.`)
      }

      if (!dni) {
        throw badRequest(`Fila ${rowNumber}: falta DNI para usar como usuario y contrasena inicial.`)
      }

      const email = getTeacherTechnicalEmail({ dni, institutionId })
      const { user, status } = await createOrReuseTeacherAuthUser({
        adminClient,
        email,
        password: dni,
        displayName,
        dni,
      })

      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert({
          user_id: user.id,
          email,
          display_name: displayName,
          account_role: 'docente',
          is_global_admin: false,
          is_blocked: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (profileError) throw profileError

      await assignMemberships({
        adminClient,
        userId: user.id,
        institutionIds: [institutionId],
        role: 'viewer',
      })

      const teacherRecordId = await persistAndLinkTeacherRecord({
        adminClient,
        institutionId,
        teacher,
        email,
        displayName,
        dni,
        userId: user.id,
      })

      results.push({
        dni,
        display_name: displayName,
        user_id: user.id,
        teacher_record_id: teacherRecordId,
        status,
      })
    } catch (error) {
      errors.push({
        row: rowNumber,
        docente: getTeacherDisplayName(teacher) || null,
        dni: typeof teacher.dni === 'string' ? teacher.dni : null,
        error: error instanceof Error ? error.message : 'Error inesperado.',
      })
    }
  }

  return {
    success: errors.length === 0,
    created: results.filter((entry) => entry.status === 'created').length,
    updated: results.filter((entry) => entry.status === 'updated').length,
    failed: errors.length,
    results,
    errors,
  }
}

function getPayloadRecord(value: unknown, fieldName: string) {
  if (!isRecord(value)) {
    throw badRequest(`${fieldName} debe ser un objeto.`)
  }

  return value
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function getWorkspacePayload(value: unknown) {
  return isRecord(value) ? value : {}
}

function sameOwner(row: Record<string, unknown>, userId: string) {
  return row.profile_id === userId || row.student_id === userId
}

function upsertRecord(rows: Array<Record<string, unknown>>, nextRow: Record<string, unknown>, predicate: (row: Record<string, unknown>) => boolean) {
  let replaced = false
  const nextRows = rows.map((row) => {
    if (!predicate(row)) return row
    replaced = true
    return {
      ...row,
      ...nextRow,
      id: typeof row.id === 'string' ? row.id : nextRow.id,
    }
  })

  return replaced ? nextRows : [...nextRows, nextRow]
}

type AcademicTransitionConfig = {
  stage: string
  writeMode: string
  readMode: string
  dualWriteEnabled: boolean
  hybridReadEnabled: boolean
  relationalPrimaryEnabled: boolean
  snapshotFallbackEnabled: boolean
  snapshotWriteCompatEnabled: boolean
  strictDriftBlockEnabled: boolean
}

const defaultAcademicTransitionConfig: AcademicTransitionConfig = {
  stage: 'snapshot_only',
  writeMode: 'snapshot_only',
  readMode: 'snapshot_only',
  dualWriteEnabled: false,
  hybridReadEnabled: false,
  relationalPrimaryEnabled: false,
  snapshotFallbackEnabled: true,
  snapshotWriteCompatEnabled: true,
  strictDriftBlockEnabled: false,
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function getOptionalDateString(value: unknown) {
  const candidate = getOptionalString(value)
  if (!candidate) return null

  const timestamp = Date.parse(candidate)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}

const portalExamEligibleAcademicStatuses = new Set(['regular'])

function normalizePortalText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function samePortalText(left: unknown, right: unknown) {
  const leftValue = normalizePortalText(left)
  const rightValue = normalizePortalText(right)
  return Boolean(leftValue && rightValue && leftValue === rightValue)
}

function normalizePortalIdentity(value: unknown) {
  return normalizePortalText(value).replace(/[^a-z0-9]/g, '')
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(getOptionalString(value))
}

// Match exacto (sin normalizar mayusculas/tildes, sin comodin para vacio), igual que
// el RPC upsert_exam_enrollment_from_portal. samePortalText es solo para el VALOR del
// estado academico (regular/libre/etc), no para la identidad de materia/carrera.
function sameExactPortalId(left: unknown, right: unknown) {
  return getOptionalString(left) === getOptionalString(right)
}

function normalizePortalAcademicStatus(value: unknown) {
  const normalized = normalizePortalText(value)

  if (!normalized) return 'pending'
  if (normalized === 'regular') return 'regular'
  if (['libre', 'free'].includes(normalized)) return 'libre'
  if (['promocionado', 'promocionada', 'promoted'].includes(normalized)) return 'promocionado'
  if (['approved', 'passed', 'completed', 'aprobado', 'aprobada', 'finalizado', 'finalizada'].includes(normalized)) return 'approved'
  if (['failed', 'desaprobado', 'desaprobada', 'reprobado', 'reprobada'].includes(normalized)) return 'failed'
  if (['active', 'enrolled', 'cursando', 'inscripto', 'inscripta', 'pending', 'pendiente'].includes(normalized)) return 'pending'

  return normalized
}

async function resolveStudentRecordIdForPortalEnrollment({
  adminClient,
  institutionId,
  workspaceKey,
  callerId,
  callerEmail,
  programId,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  workspaceKey: string
  callerId?: string | null
  callerEmail?: string | null
  programId?: string | null
}) {
  const email = getOptionalString(callerEmail).toLowerCase()
  if (!email) return ''

  const { data, error } = await adminClient
    .from('student_records')
    .select('id, career')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('email', email)

  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  if (rows.length === 0) return ''

  const programKey = normalizePortalIdentity(programId)
  const careerMatches = programKey
    ? rows.filter((row) => normalizePortalIdentity(row?.career) === programKey)
    : []

  if (careerMatches.length === 1) return getOptionalString(careerMatches[0]?.id)

  const studentRecordIds = rows.map((row) => getOptionalString(row?.id)).filter(Boolean)
  const studentId = getOptionalString(callerId)
  if (studentId && isUuid(programId) && studentRecordIds.length > 0) {
    const { data: relationRows, error: relationError } = await adminClient
      .from('student_career_enrollments')
      .select('student_record_id')
      .eq('institution_id', institutionId)
      .eq('student_id', studentId)
      .eq('career_id', getOptionalString(programId))
      .in('student_record_id', studentRecordIds)
      .in('status', ['ACTIVE', 'PAUSED'])

    if (relationError) {
      if (!isMissingRelationError(relationError, 'student_career_enrollments')) throw relationError
    } else {
      const relationRecordIds = Array.from(new Set(
        (Array.isArray(relationRows) ? relationRows : [])
          .map((row) => getOptionalString(row?.student_record_id))
          .filter(Boolean),
      ))

      if (relationRecordIds.length === 1) return relationRecordIds[0]
    }
  }

  if (rows.length === 1) return getOptionalString(rows[0]?.id)

  return ''
}

function portalAcademicStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'pendiente',
    regular: 'regular',
    libre: 'libre',
    promocionado: 'promocionado',
    approved: 'aprobada',
    failed: 'desaprobada',
  }

  return labels[status] ?? status
}

function getPortalExamBlockedMessage(status: string) {
  if (status === 'pending') {
    return 'Todavia no hay condicion regular cargada para esta materia.'
  }

  if (status === 'promocionado' || status === 'approved') {
    return `La materia figura como ${portalAcademicStatusLabel(status)}; no requiere inscripcion a esta mesa.`
  }

  if (status === 'libre') {
    return 'La condicion cargada es libre; esta mesa requiere regularidad.'
  }

  return `La condicion cargada es ${portalAcademicStatusLabel(status)}; esta mesa requiere regularidad.`
}

function getSnapshotRowSubjectId(row: Record<string, unknown>) {
  const subject = isRecord(row.subject) ? row.subject : null
  return getOptionalString(
    row.canonical_subject_id ??
    row.subject_id ??
    row.subject_code ??
    row.materia ??
    row.codigo ??
    subject?.canonical_subject_id ??
    subject?.subject_id ??
    subject?.code ??
    subject?.id,
  )
}

function getSnapshotRowProgramId(row: Record<string, unknown>) {
  const subject = isRecord(row.subject) ? row.subject : null
  return getOptionalString(
    row.canonical_program_id ??
    row.program_id ??
    row.program ??
    row.carrera ??
    subject?.canonical_program_id ??
    subject?.program_id ??
    subject?.carrera,
  )
}

function snapshotRowMatchesSubjectProgram(row: Record<string, unknown>, subjectId: string, programId: string) {
  const rowSubjectId = getSnapshotRowSubjectId(row)
  const rowProgramId = getSnapshotRowProgramId(row)

  return Boolean(rowSubjectId) && sameExactPortalId(rowSubjectId, subjectId) && sameExactPortalId(rowProgramId, programId)
}

function getSnapshotAcademicStatus(row: Record<string, unknown>) {
  const explicitStatus = getOptionalString(
    row.academic_status ??
    row.estado_academico ??
    row.condicion ??
    row.estado ??
    row.status ??
    row.situacion,
  )

  return normalizePortalAcademicStatus(explicitStatus)
}

function getLatestSnapshotAcademicStatus({
  snapshot,
  callerId,
  subjectId,
  programId,
}: {
  snapshot: Record<string, unknown>
  callerId: string
  subjectId: string
  programId: string
}) {
  const rows = [
    ...asRecordArray(snapshot.grades),
    ...asRecordArray(snapshot.estadoAcademico),
    ...asRecordArray(snapshot.academicStatusRows),
    ...asRecordArray(snapshot.enrollments),
  ]

  const matchingRows = rows.filter((row) => (
    sameOwner(row, callerId) &&
    snapshotRowMatchesSubjectProgram(row, subjectId, programId)
  ))

  for (const row of matchingRows) {
    const status = getSnapshotAcademicStatus(row)
    if (status !== 'pending') return status
  }

  return 'pending'
}

async function getLatestRelationalAcademicStatus({
  adminClient,
  institutionId,
  workspaceKey,
  studentId,
  subjectId,
  programId,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  workspaceKey: string
  studentId: string
  subjectId: string
  programId: string
}) {
  const { data, error } = await adminClient
    .from('student_grades')
    .select('academic_status, updated_at, created_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('student_id', studentId)
    .eq('subject_id', subjectId)
    .eq('program_id', programId)
    .is('deleted_at', null)
    .neq('academic_status', 'pending')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    console.warn('No se pudo validar la condicion academica relacional para la mesa.', error)
    return null
  }

  const row = Array.isArray(data) ? data[0] : null
  return row ? normalizePortalAcademicStatus(row.academic_status) : null
}

async function assertPortalExamRegistrationEligibility({
  adminClient,
  snapshot,
  institutionId,
  workspaceKey,
  studentId,
  subjectId,
  programId,
}: {
  adminClient: ReturnType<typeof createClient>
  snapshot: Record<string, unknown>
  institutionId: string
  workspaceKey: string
  studentId: string
  subjectId: string
  programId: string
}) {
  if (!subjectId) {
    throw new HttpError('No se pudo determinar la materia canonica de la mesa.', 400)
  }

  const relationalStatus = await getLatestRelationalAcademicStatus({
    adminClient,
    institutionId,
    workspaceKey,
    studentId,
    subjectId,
    programId,
  })
  const academicStatus = relationalStatus ?? getLatestSnapshotAcademicStatus({
    snapshot,
    callerId: studentId,
    subjectId,
    programId,
  })

  if (!portalExamEligibleAcademicStatuses.has(academicStatus)) {
    throw new HttpError(getPortalExamBlockedMessage(academicStatus), 403)
  }
}

function getBooleanSetting(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }

  return fallback
}

function getStringSetting(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeAcademicTransitionConfig(value: unknown): AcademicTransitionConfig {
  if (!isRecord(value)) return defaultAcademicTransitionConfig

  return {
    stage: getStringSetting(value.stage, defaultAcademicTransitionConfig.stage),
    writeMode: getStringSetting(value.write_mode, defaultAcademicTransitionConfig.writeMode),
    readMode: getStringSetting(value.read_mode, defaultAcademicTransitionConfig.readMode),
    dualWriteEnabled: getBooleanSetting(value.dual_write_enabled, defaultAcademicTransitionConfig.dualWriteEnabled),
    hybridReadEnabled: getBooleanSetting(value.hybrid_read_enabled, defaultAcademicTransitionConfig.hybridReadEnabled),
    relationalPrimaryEnabled: getBooleanSetting(value.relational_primary_enabled, defaultAcademicTransitionConfig.relationalPrimaryEnabled),
    snapshotFallbackEnabled: getBooleanSetting(value.snapshot_fallback_enabled, defaultAcademicTransitionConfig.snapshotFallbackEnabled),
    snapshotWriteCompatEnabled: getBooleanSetting(value.snapshot_write_compat_enabled, defaultAcademicTransitionConfig.snapshotWriteCompatEnabled),
    strictDriftBlockEnabled: getBooleanSetting(value.strict_drift_block_enabled, defaultAcademicTransitionConfig.strictDriftBlockEnabled),
  }
}

async function getAcademicTransitionConfig(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from('app_settings')
    .select('value')
    .eq('key', 'academic_relational_transition')
    .maybeSingle()

  if (error) {
    console.warn('No se pudo leer academic_relational_transition. Se usara snapshot_only.', error.message)
    return defaultAcademicTransitionConfig
  }

  return normalizeAcademicTransitionConfig(data?.value)
}

function shouldDualWriteAcademics(config: AcademicTransitionConfig) {
  return Boolean(
    config.dualWriteEnabled ||
    shouldReadRelationalAcademics(config) ||
    ['dual_write', 'relational_primary'].includes(config.writeMode) ||
    ['hybrid_read', 'relational_primary'].includes(config.readMode),
  )
}

const studentPortalRelationalWriteRequiredMutations = new Set(['enroll_subject', 'withdraw_subject'])

function shouldRequireStudentPortalRelationalWrite(mutationType: string) {
  return studentPortalRelationalWriteRequiredMutations.has(mutationType)
}

function shouldReadRelationalAcademics(config: AcademicTransitionConfig) {
  return Boolean(
    config.hybridReadEnabled ||
    config.relationalPrimaryEnabled ||
    ['hybrid_read', 'relational_primary'].includes(config.readMode),
  )
}

function getRelationalErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return 'Error inesperado al sincronizar tablas academicas.'
}

function addTeacherRosterSubjectAlias(target: Set<string>, value: unknown) {
  const identity = normalizePortalIdentity(value)
  if (!identity) return

  target.add(identity)

  const withoutLeadingZero = identity.match(/^([a-z]+)0+(\d+)$/)
  if (withoutLeadingZero) {
    target.add(`${withoutLeadingZero[1]}${Number(withoutLeadingZero[2])}`)
  }

  const likelyZeroAsLetter = identity.match(/^([a-z]+)o(\d+)$/)
  if (likelyZeroAsLetter) {
    target.add(`${likelyZeroAsLetter[1]}0${likelyZeroAsLetter[2]}`)
    target.add(`${likelyZeroAsLetter[1]}${Number(likelyZeroAsLetter[2])}`)
  }
}

function getTeacherRosterSubjectAliases(value: unknown) {
  const aliases = new Set<string>()
  const raw = getOptionalString(value)

  addTeacherRosterSubjectAlias(aliases, raw)
  normalizePortalText(raw)
    .split(/[:|/\\]+/)
    .forEach((part) => addTeacherRosterSubjectAlias(aliases, part))

  return Array.from(aliases).filter(Boolean)
}

function teacherRosterSubjectMatches(left: unknown, right: unknown) {
  const leftAliases = getTeacherRosterSubjectAliases(left)
  const rightAliases = getTeacherRosterSubjectAliases(right)

  return leftAliases.some((alias) => rightAliases.includes(alias))
}

function teacherRosterProgramMatches(left: unknown, right: unknown) {
  const leftKey = normalizePortalIdentity(left)
  const rightKey = normalizePortalIdentity(right)

  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function getTeacherRosterIsoDate(value: unknown) {
  const raw = getOptionalString(value)
  if (!raw) return ''

  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return raw.slice(0, 10)
  return new Date(parsed).toISOString().slice(0, 10)
}

function isTeacherRosterAssignmentInActiveWindow(row: Record<string, unknown>, today: string) {
  const metadata = isRecord(row.metadata) ? row.metadata : {}
  const role = getOptionalString(row.role).toLowerCase()
  const source = getOptionalString(row.source).toLowerCase()
  const startsOn = getTeacherRosterIsoDate(metadata.leave_starts_on)
  const endsOn = getTeacherRosterIsoDate(metadata.leave_ends_on)
  const leaveIsCurrent = (!startsOn || startsOn <= today) && (!endsOn || today <= endsOn)

  if (role === 'licencia' && leaveIsCurrent) return false
  if (source === 'teacher_leave_replacement' && !leaveIsCurrent) return false

  return true
}

function getTeacherRosterCallerDisplayName(context: Awaited<ReturnType<typeof requireTeacherPortalMember>>) {
  const metadata = isRecord((context.caller as unknown as Record<string, unknown>).user_metadata)
    ? (context.caller as unknown as Record<string, unknown>).user_metadata as Record<string, unknown>
    : {}

  return getOptionalString(
    context.profile?.display_name ??
    metadata.full_name ??
    metadata.name ??
    context.caller.email,
  )
}

function teacherRosterRecordMatchesCaller({
  record,
  context,
  institutionId,
}: {
  record: Record<string, unknown>
  context: Awaited<ReturnType<typeof requireTeacherPortalMember>>
  institutionId: string
}) {
  const callerId = getOptionalString(context.caller.id)
  const callerEmail = getOptionalString(context.caller.email).toLowerCase()
  const callerName = normalizePortalIdentity(getTeacherRosterCallerDisplayName(context))
  const recordEmail = getOptionalString(record.login_email ?? record.email).toLowerCase()
  const recordDni = getOptionalString(record.dni)
  const technicalEmail = recordDni ? getTeacherTechnicalEmail({ dni: recordDni, institutionId }) : ''

  return (
    getOptionalString(record.profile_id) === callerId ||
    (callerEmail && (recordEmail === callerEmail || technicalEmail === callerEmail)) ||
    (callerName && normalizePortalIdentity(record.full_name) === callerName)
  )
}

function getTeacherRosterSubjectId(row: Record<string, unknown>) {
  const subject = isRecord(row.subject) ? row.subject : {}
  return getOptionalString(
    row.canonical_subject_id ??
    row.subject_id ??
    row.subject_code ??
    row.materia_codigo ??
    row.materiaCodigo ??
    row.codigo ??
    row.code ??
    row.materia ??
    subject.canonical_subject_id ??
    subject.subject_id ??
    subject.code ??
    subject.id,
  )
}

function getTeacherRosterProgramId(row: Record<string, unknown>) {
  const subject = isRecord(row.subject) ? row.subject : {}
  return getOptionalString(
    row.canonical_program_id ??
    row.program_id ??
    row.programa ??
    row.program ??
    row.carrera ??
    row.career ??
    subject.canonical_program_id ??
    subject.program_id ??
    subject.carrera ??
    subject.career,
  )
}

function snapshotTeacherRosterRowMatchesCaller({
  row,
  context,
  teacherRecords,
  institutionId,
}: {
  row: Record<string, unknown>
  context: Awaited<ReturnType<typeof requireTeacherPortalMember>>
  teacherRecords: Array<Record<string, unknown>>
  institutionId: string
}) {
  const callerId = getOptionalString(context.caller.id)
  const callerEmail = getOptionalString(context.caller.email).toLowerCase()
  const callerName = normalizePortalIdentity(getTeacherRosterCallerDisplayName(context))
  const teacherRecordIds = new Set(teacherRecords.map((record) => getOptionalString(record.id)).filter(Boolean))
  const teacherDnis = new Set(teacherRecords.map((record) => normalizePortalIdentity(record.dni)).filter(Boolean))
  const teacherNames = new Set(teacherRecords.map((record) => normalizePortalIdentity(record.full_name)).filter(Boolean))
  const teacherEmails = new Set(
    teacherRecords
      .flatMap((record) => [
        getOptionalString(record.login_email ?? record.email).toLowerCase(),
        getOptionalString(record.dni) ? getTeacherTechnicalEmail({ dni: getOptionalString(record.dni), institutionId }) : '',
      ])
      .filter(Boolean),
  )
  const rowTeacherId = getOptionalString(row.profile_id ?? row.teacher_profile_id ?? row.teacher_id)
  const rowTeacherRecordId = getOptionalString(row.teacher_record_id ?? row.teacherRecordId ?? row.docenteId ?? row.docente_id)
  const rowEmail = getOptionalString(row.teacher_email ?? row.email_docente ?? row.login_email ?? row.email).toLowerCase()
  const rowDni = normalizePortalIdentity(row.dni_docente ?? row.teacher_dni ?? row.documento ?? row.dni)
  const rowName = normalizePortalIdentity(
    row.docente ??
    row.profesor ??
    row.teacher_display_name ??
    row.teacher_name ??
    row.teacher ??
    row.nombre,
  )

  return (
    (rowTeacherId && rowTeacherId === callerId) ||
    (rowTeacherRecordId && teacherRecordIds.has(rowTeacherRecordId)) ||
    (rowEmail && (rowEmail === callerEmail || teacherEmails.has(rowEmail))) ||
    (rowDni && teacherDnis.has(rowDni)) ||
    (rowName && (rowName === callerName || teacherNames.has(rowName)))
  )
}

function addAccessibleTeacherRosterSubject(
  target: Array<{ subjectId: string; programId: string; source: string }>,
  subjectId: unknown,
  programId: unknown,
  source: string,
) {
  const cleanSubjectId = getOptionalString(subjectId)
  if (!cleanSubjectId) return

  const cleanProgramId = getOptionalString(programId)
  const exists = target.some((item) => (
    teacherRosterSubjectMatches(item.subjectId, cleanSubjectId) &&
    (
      teacherRosterProgramMatches(item.programId, cleanProgramId) ||
      (!item.programId && !cleanProgramId)
    )
  ))

  if (!exists) {
    target.push({ subjectId: cleanSubjectId, programId: cleanProgramId, source })
  }
}

function teacherRosterEnrollmentMatchesAccessibleSubject(
  enrollment: Record<string, unknown>,
  accessibleSubjects: Array<{ subjectId: string; programId: string; source: string }>,
) {
  const enrollmentSubjectId = getTeacherRosterSubjectId(enrollment)
  const enrollmentProgramId = getTeacherRosterProgramId(enrollment)
  const matchingSubjects = accessibleSubjects.filter((subject) => (
    teacherRosterSubjectMatches(subject.subjectId, enrollmentSubjectId)
  ))

  if (matchingSubjects.length === 0) return false
  if (matchingSubjects.some((subject) => teacherRosterProgramMatches(subject.programId, enrollmentProgramId))) return true

  const genericMatches = matchingSubjects.filter((subject) => !normalizePortalIdentity(subject.programId))
  return genericMatches.length === 1
}

function mapTeacherRosterStudentRecord(record: Record<string, unknown>) {
  return {
    id: getOptionalString(record.id),
    profileId: getOptionalString(record.profile_id),
    fullName: getOptionalString(record.full_name) ||
      [getOptionalString(record.first_name), getOptionalString(record.last_name)].filter(Boolean).join(' ').trim(),
    dni: getOptionalString(record.dni),
    email: getOptionalString(record.email),
  }
}

function addIdentityValue(target: Set<string>, value: unknown) {
  const normalized = getOptionalString(value).toLowerCase()
  if (normalized) target.add(normalized)
}

type StudentAcademicResetIdentity = {
  profileIds: Set<string>
  recordIds: Set<string>
  emails: Set<string>
  dnis: Set<string>
  names: Set<string>
}

function createEmptyStudentAcademicResetIdentity(): StudentAcademicResetIdentity {
  return {
    profileIds: new Set(),
    recordIds: new Set(),
    emails: new Set(),
    dnis: new Set(),
    names: new Set(),
  }
}

function getNestedPayload(row: Record<string, unknown>) {
  return isRecord(row.raw)
    ? row.raw
    : isRecord(row.raw_payload)
      ? row.raw_payload
      : {}
}

function getStudentAcademicResetIdentity(student: Record<string, unknown>) {
  const identity = createEmptyStudentAcademicResetIdentity()
  const raw = getNestedPayload(student)

  addIdentityValue(identity.profileIds, student.profile_id)
  addIdentityValue(identity.profileIds, student.user_id)
  addIdentityValue(identity.profileIds, student.student_id)
  addIdentityValue(identity.recordIds, student.student_record_id)
  addIdentityValue(identity.recordIds, student.record_id)
  addIdentityValue(identity.emails, student.email)
  addIdentityValue(identity.emails, student.student_email)
  addIdentityValue(identity.emails, raw.email)
  addIdentityValue(identity.dnis, student.dni)
  addIdentityValue(identity.dnis, student.documento)
  addIdentityValue(identity.dnis, raw.dni)
  addIdentityValue(identity.dnis, raw.documento)
  addIdentityValue(identity.names, student.full_name)
  addIdentityValue(identity.names, student.alumno)
  addIdentityValue(identity.names, student.nombre_completo)
  addIdentityValue(identity.names, [getOptionalString(student.nombre), getOptionalString(student.apellido)].filter(Boolean).join(' '))

  const hasAnyIdentity = [
    identity.profileIds,
    identity.recordIds,
    identity.emails,
    identity.dnis,
    identity.names,
  ].some((set) => set.size > 0)

  if (!hasAnyIdentity) {
    throw badRequest('No se pudo identificar al alumno para resetear su estado academico.')
  }

  return identity
}

function mergeStudentAcademicResetIdentity(
  identity: StudentAcademicResetIdentity,
  rows: Array<Record<string, unknown>>,
) {
  rows.forEach((row) => {
    const raw = getNestedPayload(row)
    addIdentityValue(identity.profileIds, row.profile_id)
    addIdentityValue(identity.recordIds, row.id)
    addIdentityValue(identity.emails, row.email)
    addIdentityValue(identity.dnis, row.dni)
    addIdentityValue(identity.dnis, raw.dni)
    addIdentityValue(identity.names, row.full_name)
    addIdentityValue(identity.names, [getOptionalString(row.first_name), getOptionalString(row.last_name)].filter(Boolean).join(' '))
  })
}

function recordMatchesStudentAcademicIdentity(row: Record<string, unknown>, identity: StudentAcademicResetIdentity) {
  const raw = getNestedPayload(row)
  const hasMatch = (set: Set<string>, values: unknown[]) => values.some((value) => {
    const normalized = getOptionalString(value).toLowerCase()
    return normalized && set.has(normalized)
  })

  return (
    hasMatch(identity.profileIds, [row.profile_id, row.user_id, row.student_id, raw.profile_id, raw.user_id, raw.student_id]) ||
    hasMatch(identity.recordIds, [row.student_record_id, row.record_id, raw.student_record_id, raw.record_id]) ||
    hasMatch(identity.emails, [row.email, row.student_email, row.correo, raw.email, raw.student_email]) ||
    hasMatch(identity.dnis, [row.dni, row.student_dni, row.documento, raw.dni, raw.documento]) ||
    hasMatch(identity.names, [
      row.alumno,
      row.full_name,
      row.nombre_completo,
      row.student_name,
      raw.alumno,
      raw.full_name,
      [getOptionalString(row.nombre), getOptionalString(row.apellido)].filter(Boolean).join(' '),
    ])
  )
}

function stripStudentAcademicSnapshotData(
  snapshot: Record<string, unknown>,
  identity: StudentAcademicResetIdentity,
) {
  const enrollments = asRecordArray(snapshot.enrollments)
  const examEnrollments = asRecordArray(snapshot.examEnrollments)
  const removedSubjectEnrollmentIds = new Set(
    enrollments
      .filter((row) => recordMatchesStudentAcademicIdentity(row, identity))
      .flatMap((row) => [row.id, row.relational_id, row.legacy_snapshot_id])
      .map((value) => getOptionalString(value).toLowerCase())
      .filter(Boolean),
  )
  const removedExamEnrollmentIds = new Set(
    examEnrollments
      .filter((row) => recordMatchesStudentAcademicIdentity(row, identity))
      .flatMap((row) => [row.id, row.relational_id, row.legacy_snapshot_id])
      .map((value) => getOptionalString(value).toLowerCase())
      .filter(Boolean),
  )
  const gradeMatchesStudent = (row: Record<string, unknown>) => (
    recordMatchesStudentAcademicIdentity(row, identity) ||
    removedSubjectEnrollmentIds.has(getOptionalString(row.enrollment_id).toLowerCase()) ||
    removedSubjectEnrollmentIds.has(getOptionalString(row.subject_enrollment_id).toLowerCase()) ||
    removedExamEnrollmentIds.has(getOptionalString(row.exam_enrollment_id).toLowerCase())
  )
  const attendanceMatchesStudent = (row: Record<string, unknown>) => (
    recordMatchesStudentAcademicIdentity(row, identity) ||
    removedSubjectEnrollmentIds.has(getOptionalString(row.subject_enrollment_id).toLowerCase())
  )

  return {
    ...snapshot,
    estadoAcademico: asRecordArray(snapshot.estadoAcademico).filter((row) => !recordMatchesStudentAcademicIdentity(row, identity)),
    academicStatusRows: asRecordArray(snapshot.academicStatusRows).filter((row) => !recordMatchesStudentAcademicIdentity(row, identity)),
    enrollments: enrollments.filter((row) => !recordMatchesStudentAcademicIdentity(row, identity)),
    grades: asRecordArray(snapshot.grades).filter((row) => !gradeMatchesStudent(row)),
    examEnrollments: examEnrollments.filter((row) => !recordMatchesStudentAcademicIdentity(row, identity)),
    attendanceRecords: asRecordArray(snapshot.attendanceRecords).filter((row) => !attendanceMatchesStudent(row)),
    subjectAttendanceRecords: asRecordArray(snapshot.subjectAttendanceRecords).filter((row) => !attendanceMatchesStudent(row)),
    academicStatus: isRecord(snapshot.academicStatus) && recordMatchesStudentAcademicIdentity(snapshot.academicStatus, identity)
      ? null
      : snapshot.academicStatus,
  }
}

function getSubjectAcademicResetSubjectId(row: Record<string, unknown>) {
  const subject = isRecord(row.subject) ? row.subject : {}
  const session = isRecord(row.session) ? row.session : {}

  return getOptionalString(
    row.canonical_subject_id ??
    row.subject_id ??
    row.subject_code ??
    row.materia_codigo ??
    row.materiaCodigo ??
    row.codigo ??
    row.code ??
    row.materia ??
    subject.canonical_subject_id ??
    subject.subject_id ??
    subject.code ??
    subject.id ??
    session.canonical_subject_id ??
    session.subject_id ??
    session.subject_code,
  )
}

function getSubjectAcademicResetProgramId(row: Record<string, unknown>) {
  const subject = isRecord(row.subject) ? row.subject : {}
  const session = isRecord(row.session) ? row.session : {}

  return getOptionalString(
    row.canonical_program_id ??
    row.program_id ??
    row.programa ??
    row.program ??
    row.carrera ??
    row.career ??
    subject.canonical_program_id ??
    subject.program_id ??
    subject.carrera ??
    subject.career ??
    session.canonical_program_id ??
    session.program_id ??
    session.program,
  )
}

function subjectAcademicResetRowMatchesSubjectProgram(row: Record<string, unknown>, subjectId: string, programId: string) {
  const rowSubjectId = getSubjectAcademicResetSubjectId(row)
  const rowProgramId = getSubjectAcademicResetProgramId(row)

  if (!rowSubjectId || !teacherRosterSubjectMatches(rowSubjectId, subjectId)) return false

  const targetProgramId = getOptionalString(programId)
  if (!targetProgramId && !rowProgramId) return true
  return teacherRosterProgramMatches(rowProgramId, targetProgramId)
}

function stripStudentSubjectAcademicSnapshotData(
  snapshot: Record<string, unknown>,
  identity: StudentAcademicResetIdentity,
  subjectId: string,
  programId: string,
) {
  const enrollments = asRecordArray(snapshot.enrollments)
  const targetSubjectEnrollmentIds = new Set(
    enrollments
      .filter((row) => (
        recordMatchesStudentAcademicIdentity(row, identity) &&
        subjectAcademicResetRowMatchesSubjectProgram(row, subjectId, programId)
      ))
      .flatMap((row) => [row.id, row.relational_id, row.legacy_snapshot_id, row.subject_enrollment_id])
      .map((value) => getOptionalString(value).toLowerCase())
      .filter(Boolean),
  )
  const matchesEnrollmentId = (row: Record<string, unknown>) => (
    targetSubjectEnrollmentIds.has(getOptionalString(row.enrollment_id).toLowerCase()) ||
    targetSubjectEnrollmentIds.has(getOptionalString(row.subject_enrollment_id).toLowerCase())
  )
  const matchesStudentAndSubject = (row: Record<string, unknown>) => (
    recordMatchesStudentAcademicIdentity(row, identity) &&
    subjectAcademicResetRowMatchesSubjectProgram(row, subjectId, programId)
  )
  const matchesAcademicRecord = (row: Record<string, unknown>) => (
    matchesStudentAndSubject(row) || matchesEnrollmentId(row)
  )

  return {
    ...snapshot,
    estadoAcademico: asRecordArray(snapshot.estadoAcademico).filter((row) => !matchesStudentAndSubject(row)),
    academicStatusRows: asRecordArray(snapshot.academicStatusRows).filter((row) => !matchesStudentAndSubject(row)),
    grades: asRecordArray(snapshot.grades).filter((row) => !matchesAcademicRecord(row)),
    attendanceRecords: asRecordArray(snapshot.attendanceRecords).filter((row) => !matchesAcademicRecord(row)),
    subjectAttendanceRecords: asRecordArray(snapshot.subjectAttendanceRecords).filter((row) => !matchesAcademicRecord(row)),
    academicStatus: isRecord(snapshot.academicStatus) && matchesStudentAndSubject(snapshot.academicStatus)
      ? null
      : snapshot.academicStatus,
  }
}

async function assertCallerPassword(caller: { id: string; email?: string | null }, password: string) {
  if (!caller?.id || !caller.email) {
    throw new HttpError('No se pudo identificar la cuenta actual.', 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const passwordClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: passwordData, error: passwordError } = await passwordClient.auth.signInWithPassword({
    email: caller.email,
    password,
  })

  if (passwordError || passwordData.user?.id !== caller.id) {
    throw new HttpError('La contrasena ingresada es incorrecta.', 401)
  }
}

async function fetchStudentRecordsForAcademicReset({
  adminClient,
  institutionId,
  workspaceKey,
  identity,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  workspaceKey: string
  identity: StudentAcademicResetIdentity
}) {
  const recordRows = new Map<string, Record<string, unknown>>()
  const addRows = (rows: unknown) => {
    asRecordArray(rows).forEach((row) => {
      const id = getOptionalString(row.id)
      if (id) recordRows.set(id, row)
    })
  }
  const queries = [
    { column: 'id', values: Array.from(identity.recordIds).filter(isUuid) },
    { column: 'profile_id', values: Array.from(identity.profileIds).filter(isUuid) },
    { column: 'email', values: Array.from(identity.emails) },
    { column: 'dni', values: Array.from(identity.dnis) },
  ]

  for (const query of queries) {
    if (query.values.length === 0) continue
    const { data, error } = await adminClient
      .from('student_records')
      .select('id, profile_id, email, full_name, first_name, last_name, dni, raw_payload')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .in(query.column, query.values)

    if (error) throw error
    addRows(data)
  }

  return Array.from(recordRows.values())
}

async function selectAcademicIdsByColumns({
  adminClient,
  table,
  institutionId,
  workspaceKey,
  filters,
}: {
  adminClient: ReturnType<typeof createClient>
  table: string
  institutionId: string
  workspaceKey: string
  filters: Array<{ column: string; values: string[] }>
}) {
  const ids = new Set<string>()

  for (const filter of filters) {
    const values = filter.values.filter(Boolean)
    if (values.length === 0) continue

    const { data, error } = await adminClient
      .from(table)
      .select('id')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .in(filter.column, values)
      .is('deleted_at', null)

    if (error) {
      if (
        isMissingRelationError(error, table) ||
        isMissingColumnError(error, filter.column) ||
        isMissingColumnError(error, 'deleted_at')
      ) continue
      throw error
    }

    asRecordArray(data).forEach((row) => {
      const id = getOptionalString(row.id)
      if (id) ids.add(id)
    })
  }

  return Array.from(ids)
}

async function updateAcademicRowsByIds({
  adminClient,
  table,
  ids,
  patch,
}: {
  adminClient: ReturnType<typeof createClient>
  table: string
  ids: string[]
  patch: Record<string, unknown>
}) {
  if (ids.length === 0) return 0

  const { data, error } = await adminClient
    .from(table)
    .update(patch)
    .in('id', ids)
    .select('id')

  if (error) {
    if (isMissingRelationError(error, table)) return 0
    throw error
  }

  return asRecordArray(data).length
}

async function deleteAcademicRowsByIds({
  adminClient,
  table,
  ids,
}: {
  adminClient: ReturnType<typeof createClient>
  table: string
  ids: string[]
}) {
  if (ids.length === 0) return 0

  const { data, error } = await adminClient
    .from(table)
    .delete()
    .in('id', ids)
    .select('id')

  if (error) {
    if (isMissingRelationError(error, table)) return 0
    throw error
  }

  return asRecordArray(data).length
}

async function recordStudentPortalDualWriteWarning({
  adminClient,
  caller,
  institutionId,
  mutationType,
  errorMessage,
  payload,
}: {
  adminClient: ReturnType<typeof createClient>
  caller: { id: string; email?: string | null }
  institutionId: string
  mutationType: string
  errorMessage: string
  payload: Record<string, unknown>
}) {
  await recordAdminAudit({
    adminClient,
    caller,
    action: 'student_portal_dual_write_warning',
    status: 'error',
    target: {
      target_type: 'institution',
      target_id: institutionId,
    },
    metadata: sanitizeAuditMetadata({
      mutation_type: mutationType,
      error: errorMessage,
      payload,
    }),
    errorMessage,
  })
}

async function writeSubjectEnrollmentRelational({
  adminClient,
  context,
  institutionId,
  workspaceKey,
  enrollment,
  mutationType,
  now,
}: {
  adminClient: ReturnType<typeof createClient>
  context: Awaited<ReturnType<typeof requireStudentPortalMember>>
  institutionId: string
  workspaceKey: string
  enrollment: Record<string, unknown>
  mutationType: string
  now: string
}) {
  const subjectId = requireString(enrollment.subject_id, 'La materia')
  const programId = getOptionalString(enrollment.program_id)
  const studentRecordId = getOptionalString(enrollment.student_record_id) || await resolveStudentRecordIdForPortalEnrollment({
    adminClient,
    institutionId,
    workspaceKey,
    callerId: context.caller.id,
    callerEmail: context.caller.email,
    programId,
  })
  const status = getOptionalString(enrollment.status) || (mutationType === 'withdraw_subject' ? 'dropped' : 'active')
  const legacySnapshotId = getOptionalString(enrollment.id)
  const clientMutationId = getOptionalString(enrollment.client_mutation_id) || legacySnapshotId || null

  const { data, error } = await adminClient.rpc('upsert_subject_enrollment_from_portal', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    actor_user_id: context.caller.id,
    target_student_id: context.caller.id,
    target_subject_id: subjectId,
    target_program_id: programId,
    target_student_record_id: studentRecordId || null,
    target_status: status,
    target_enrolled_at: getOptionalDateString(enrollment.enrolled_at) ?? getOptionalDateString(enrollment.created_at) ?? now,
    target_dropped_at: getOptionalDateString(enrollment.dropped_at),
    target_legacy_snapshot_id: legacySnapshotId || null,
    target_client_mutation_id: clientMutationId,
    target_metadata: {
      source: 'admin-users',
      mutation_type: mutationType,
      snapshot_row: enrollment,
    },
  })

  if (error) throw error
  return data
}

async function writeExamEnrollmentRelational({
  adminClient,
  context,
  institutionId,
  workspaceKey,
  enrollment,
  mutationType,
  now,
}: {
  adminClient: ReturnType<typeof createClient>
  context: Awaited<ReturnType<typeof requireStudentPortalMember>>
  institutionId: string
  workspaceKey: string
  enrollment: Record<string, unknown>
  mutationType: string
  now: string
}) {
  const examTableId = requireString(
    enrollment.exam_table_id ?? enrollment.exam_session_id ?? (isRecord(enrollment.exam_session) ? enrollment.exam_session.id : ''),
    'La mesa de examen',
  )
  const subjectId = getOptionalString(enrollment.subject_id)
  const programId = getOptionalString(enrollment.program_id)
  const studentRecordId = getOptionalString(enrollment.student_record_id)
  const status = getOptionalString(enrollment.status) || (mutationType === 'cancel_exam' ? 'cancelled' : 'registered')
  const legacySnapshotId = getOptionalString(enrollment.id)
  const clientMutationId = getOptionalString(enrollment.client_mutation_id) || legacySnapshotId || null

  const { data, error } = await adminClient.rpc('upsert_exam_enrollment_from_portal', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    actor_user_id: context.caller.id,
    target_student_id: context.caller.id,
    target_student_record_id: studentRecordId || null,
    target_exam_table_id: examTableId,
    target_subject_id: subjectId || null,
    target_program_id: programId,
    target_status: status,
    target_enrolled_at: getOptionalDateString(enrollment.enrolled_at) ?? getOptionalDateString(enrollment.created_at) ?? now,
    target_cancelled_at: getOptionalDateString(enrollment.cancelled_at) ?? getOptionalDateString(enrollment.dropped_at),
    target_legacy_snapshot_id: legacySnapshotId || null,
    target_client_mutation_id: clientMutationId,
    target_metadata: {
      source: 'admin-users',
      mutation_type: mutationType,
      snapshot_row: enrollment,
    },
  })

  if (error) throw error
  return data
}

async function writeStudentPortalRelational({
  adminClient,
  context,
  institutionId,
  workspaceKey,
  mutationType,
  result,
  now,
}: {
  adminClient: ReturnType<typeof createClient>
  context: Awaited<ReturnType<typeof requireStudentPortalMember>>
  institutionId: string
  workspaceKey: string
  mutationType: string
  result: Record<string, unknown> | null
  now: string
}) {
  if (!result) {
    throw new Error('No hay resultado de snapshot para sincronizar tablas academicas.')
  }

  if (mutationType === 'enroll_subject' || mutationType === 'withdraw_subject') {
    return writeSubjectEnrollmentRelational({
      adminClient,
      context,
      institutionId,
      workspaceKey,
      enrollment: result,
      mutationType,
      now,
    })
  }

  if (mutationType === 'register_exam' || mutationType === 'cancel_exam') {
    return writeExamEnrollmentRelational({
      adminClient,
      context,
      institutionId,
      workspaceKey,
      enrollment: result,
      mutationType,
      now,
    })
  }

  throw badRequest(`Tipo de cambio no soportado para tablas academicas: ${mutationType}`)
}

async function handleStudentPortalMutation(
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  context?: Awaited<ReturnType<typeof requireStudentPortalMember>>,
) {
  if (!context) {
    throw new HttpError('Sesion invalida. Inicia sesion nuevamente.', 401)
  }

  const institutionId = requireString(payload.institution_id, 'La institucion')
  const mutationType = requireString(payload.mutation_type, 'El tipo de cambio')
  const workspaceKey = typeof payload.workspace_key === 'string' && payload.workspace_key.trim()
    ? payload.workspace_key.trim()
    : 'main'
  const now = new Date().toISOString()
  const transitionConfig = await getAcademicTransitionConfig(adminClient)
  const dualWriteEnabled = shouldDualWriteAcademics(transitionConfig)
  const relationalWriteRequired = shouldRequireStudentPortalRelationalWrite(mutationType)
  const relationalWriteEnabled = dualWriteEnabled || relationalWriteRequired
  const snapshotWriteEnabled = transitionConfig.snapshotWriteCompatEnabled

  const { data: snapshotRow, error: snapshotError } = await adminClient
    .from('workspace_snapshots')
    .select('payload, owner_user_id, owner_email')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (snapshotError) throw snapshotError

  const snapshot = getWorkspacePayload(snapshotRow?.payload)
  let result: Record<string, unknown> | null = null
  const callerId = context.caller.id

  if (mutationType === 'enroll_subject') {
    const enrollment = getPayloadRecord(payload.enrollment, 'La inscripcion')
    const subjectId = requireString(enrollment.subject_id, 'La materia')
    const programId = requireString(enrollment.program_id, 'La carrera')
    const studentRecordId = getOptionalString(enrollment.student_record_id) || await resolveStudentRecordIdForPortalEnrollment({
      adminClient,
      institutionId,
      workspaceKey,
      callerId,
      callerEmail: context.caller.email,
      programId,
    })
    const nextEnrollment = {
      ...enrollment,
      id: typeof enrollment.id === 'string' && enrollment.id
        ? enrollment.id
        : `student-enrollment-${callerId}-${subjectId}-${Date.now()}`,
      profile_id: callerId,
      student_id: callerId,
      institution_id: institutionId,
      student_record_id: studentRecordId || undefined,
      subject_id: subjectId,
      program_id: programId,
      status: typeof enrollment.status === 'string' ? enrollment.status : 'active',
      enrolled_at: typeof enrollment.enrolled_at === 'string' ? enrollment.enrolled_at : now,
      created_at: typeof enrollment.created_at === 'string' ? enrollment.created_at : now,
      updated_at: now,
    }

    snapshot.enrollments = upsertRecord(
      asRecordArray(snapshot.enrollments),
      nextEnrollment,
      (row) => sameOwner(row, callerId) && row.subject_id === subjectId && row.program_id === programId,
    )
    result = nextEnrollment
  } else if (mutationType === 'withdraw_subject') {
    const enrollmentId = requireString(payload.enrollment_id, 'La inscripcion')
    const rows = asRecordArray(snapshot.enrollments)
    let found = false

    snapshot.enrollments = rows.map((row) => {
      if (row.id !== enrollmentId || !sameOwner(row, callerId)) return row
      found = true
      result = {
        ...row,
        status: 'dropped',
        dropped_at: now,
        updated_at: now,
      }
      return result
    })

    if (!found) {
      throw new HttpError('No se encontro una inscripcion propia para dar de baja.', 404)
    }
  } else if (mutationType === 'register_exam') {
    const examEnrollment = getPayloadRecord(payload.exam_enrollment, 'La inscripcion a mesa')
    const examSessionId = requireString(examEnrollment.exam_session_id, 'La mesa de examen')
    const examRows = asRecordArray(snapshot.cronograma)
    const examRow = examRows.find((row) => row.id === examSessionId || String(row.mesa ?? '') === examSessionId)
    const examType = getOptionalString(examRow?.exam_type ?? examRow?.tipoMesa).toLowerCase()
    const inscriptionMode = getOptionalString(examRow?.inscription_mode).toLowerCase()
    const subjectId = getOptionalString(
      examEnrollment.subject_id ??
      examEnrollment.canonical_subject_id ??
      examRow?.subject_id ??
      examRow?.canonical_subject_id ??
      examRow?.materia ??
      examRow?.codigo,
    )
    const programId = getOptionalString(
      examEnrollment.program_id ??
      examEnrollment.canonical_program_id ??
      examRow?.program_id ??
      examRow?.canonical_program_id ??
      examRow?.carrera,
    )

    if (examType === 'special' || examType === 'especial' || inscriptionMode === 'admin_only') {
      throw new HttpError('Esta mesa especial no admite autoinscripcion de alumnos. La inscripcion la gestiona administracion.', 403)
    }

    await assertPortalExamRegistrationEligibility({
      adminClient,
      snapshot,
      institutionId,
      workspaceKey,
      studentId: callerId,
      subjectId,
      programId,
    })

    const nextExamEnrollment = {
      ...examEnrollment,
      id: typeof examEnrollment.id === 'string' && examEnrollment.id
        ? examEnrollment.id
        : `student-exam-${callerId}-${examSessionId}-${Date.now()}`,
      profile_id: callerId,
      student_id: callerId,
      institution_id: institutionId,
      exam_session_id: examSessionId,
      exam_table_id: examSessionId,
      subject_id: subjectId,
      program_id: programId,
      status: typeof examEnrollment.status === 'string' ? examEnrollment.status : 'registered',
      created_at: typeof examEnrollment.created_at === 'string' ? examEnrollment.created_at : now,
      updated_at: now,
    }

    snapshot.examEnrollments = upsertRecord(
      asRecordArray(snapshot.examEnrollments),
      nextExamEnrollment,
      (row) => sameOwner(row, callerId) && row.exam_session_id === examSessionId,
    )
    result = nextExamEnrollment
  } else if (mutationType === 'cancel_exam') {
    const examEnrollmentId = requireString(payload.exam_enrollment_id, 'La inscripcion a mesa')
    const rows = asRecordArray(snapshot.examEnrollments)
    let found = false

    snapshot.examEnrollments = rows.map((row) => {
      if (row.id !== examEnrollmentId || !sameOwner(row, callerId)) return row
      found = true
      result = {
        ...row,
        status: 'dropped',
        dropped_at: now,
        updated_at: now,
      }
      return result
    })

    if (!found) {
      throw new HttpError('No se encontro una inscripcion propia a mesa para cancelar.', 404)
    }
  } else if (mutationType === 'update_profile') {
    const profile = getPayloadRecord(payload.profile, 'El perfil')
    const callerEmail = getOptionalString(context.caller.email).trim().toLowerCase()
    const photo = getOptionalString(profile.photo)

    if (!callerEmail) {
      throw new HttpError('La cuenta del alumno no tiene un email asociado.', 400)
    }

    if (photo && (!photo.startsWith('data:image/') || photo.length > 3_600_000)) {
      throw badRequest('La foto debe ser una imagen valida y no superar 2.5 MB.')
    }

    const nextProfile = {
      nombre: getOptionalString(profile.nombre).trim(),
      apellido: getOptionalString(profile.apellido).trim(),
      domicilio: getOptionalString(profile.domicilio).trim(),
      telefono: getOptionalString(profile.telefono).trim(),
      email: callerEmail,
      photo,
      updated_at: now,
    }
    const updateOwnRow = (row: Record<string, unknown>) => {
      if (getOptionalString(row.email).trim().toLowerCase() !== callerEmail) return row

      const raw = isRecord(row.raw) ? row.raw : isRecord(row.raw_payload) ? row.raw_payload : {}
      return {
        ...row,
        nombre: nextProfile.nombre || row.nombre,
        apellido: nextProfile.apellido || row.apellido,
        full_name: [nextProfile.nombre, nextProfile.apellido].filter(Boolean).join(' ').trim() || row.full_name,
        domicilio: nextProfile.domicilio,
        telefono: nextProfile.telefono,
        photo: nextProfile.photo,
        foto: '',
        photo_url: '',
        avatar_url: '',
        raw: {
          ...raw,
          domicilio: nextProfile.domicilio,
          telefono: nextProfile.telefono,
          photo: nextProfile.photo,
          foto: '',
          photo_url: '',
          avatar_url: '',
        },
      }
    }

    snapshot.alumnos = asRecordArray(snapshot.alumnos).map(updateOwnRow)
    snapshot.students = asRecordArray(snapshot.students).map(updateOwnRow)
    result = nextProfile
  } else {
    throw badRequest(`Tipo de cambio no soportado: ${mutationType}`)
  }

  if (snapshotWriteEnabled) {
    const { error: upsertError } = await adminClient
      .from('workspace_snapshots')
      .upsert({
        institution_id: institutionId,
        workspace_key: workspaceKey,
        owner_user_id: typeof snapshotRow?.owner_user_id === 'string' ? snapshotRow.owner_user_id : callerId,
        owner_email: typeof snapshotRow?.owner_email === 'string' ? snapshotRow.owner_email : context.caller.email ?? null,
        payload: snapshot,
        updated_at: now,
      })

    if (upsertError) throw upsertError
  }

  let relationalResult: unknown = null
  let relationalErrorMessage: string | null = null

  if (mutationType === 'update_profile') {
    const callerEmail = getOptionalString(context.caller.email).trim().toLowerCase()
    const profile = result ?? {}
    const { data: studentRecords, error: recordsError } = await adminClient
      .from('student_records')
      .select('id, raw_payload')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .eq('email', callerEmail)

    if (recordsError) throw recordsError
    if (!studentRecords?.length) {
      throw new HttpError('No se encontro el registro institucional del alumno.', 404)
    }

    for (const studentRecord of studentRecords) {
      const rawPayload = isRecord(studentRecord.raw_payload) ? studentRecord.raw_payload : {}
      const { error: updateError } = await adminClient
        .from('student_records')
        .update({
          first_name: getOptionalString(profile.nombre),
          last_name: getOptionalString(profile.apellido),
          full_name: [getOptionalString(profile.nombre), getOptionalString(profile.apellido)].filter(Boolean).join(' ').trim(),
          phone: getOptionalString(profile.telefono),
          raw_payload: {
            ...rawPayload,
            domicilio: getOptionalString(profile.domicilio),
            telefono: getOptionalString(profile.telefono),
            photo: getOptionalString(profile.photo),
            foto: '',
            photo_url: '',
            avatar_url: '',
          },
          updated_at: now,
        })
        .eq('id', studentRecord.id)
        .eq('institution_id', institutionId)

      if (updateError) throw updateError
    }

    relationalResult = studentRecords
  } else if (relationalWriteEnabled) {
    try {
      relationalResult = await writeStudentPortalRelational({
        adminClient,
        context,
        institutionId,
        workspaceKey,
        mutationType,
        result,
        now,
      })
    } catch (error) {
      relationalErrorMessage = getRelationalErrorMessage(error)

      await recordStudentPortalDualWriteWarning({
        adminClient,
        caller: context.caller,
        institutionId,
        mutationType,
        errorMessage: relationalErrorMessage,
        payload,
      })

      if (relationalWriteRequired || transitionConfig.strictDriftBlockEnabled || shouldReadRelationalAcademics(transitionConfig)) {
        throw new Error(`El snapshot se actualizo, pero fallo la sincronizacion relacional estricta. ${relationalErrorMessage}`)
      }
    }
  }

  return {
    success: true,
    mutation_type: mutationType,
    data: result,
    sources: {
      snapshot: snapshotWriteEnabled,
      relational: Boolean(relationalResult),
      relational_error: relationalErrorMessage,
    },
    transition: {
      stage: transitionConfig.stage,
      write_mode: transitionConfig.writeMode,
      read_mode: transitionConfig.readMode,
      dual_write_enabled: dualWriteEnabled,
      relational_write_enabled: relationalWriteEnabled,
      relational_write_required: relationalWriteRequired,
      strict_drift_block_enabled: transitionConfig.strictDriftBlockEnabled,
    },
    relational: relationalResult,
    warnings: relationalErrorMessage
      ? [`No se pudo sincronizar la tabla relacional: ${relationalErrorMessage}`]
      : [],
  }
}

async function fetchTeacherRosterTeacherRecords({
  adminClient,
  institutionId,
  workspaceKey,
  context,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  workspaceKey: string
  context: Awaited<ReturnType<typeof requireTeacherPortalMember>>
}) {
  const runQuery = (selectColumns: string) => adminClient
    .from('teacher_records')
    .select(selectColumns)
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  let { data, error } = await runQuery('id, profile_id, login_email, full_name, dni')

  if (isMissingColumnError(error, 'profile_id')) {
    ;({ data, error } = await runQuery('id, login_email, full_name, dni'))
  }

  if (error) {
    if (isMissingRelationError(error, 'teacher_records')) return []
    throw error
  }

  return asRecordArray(data).filter((record) => teacherRosterRecordMatchesCaller({
    record,
    context,
    institutionId,
  }))
}

async function fetchTeacherRosterSnapshot({
  adminClient,
  institutionId,
  workspaceKey,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  workspaceKey: string
}) {
  const { data, error } = await adminClient
    .from('workspace_snapshots')
    .select('payload, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error, 'workspace_snapshots')) return { payload: {}, updatedAt: null }
    throw error
  }

  return {
    payload: getWorkspacePayload(data?.payload),
    updatedAt: data?.updated_at ?? null,
  }
}

async function fetchTeacherRosterAssignments({
  adminClient,
  institutionId,
  workspaceKey,
}: {
  adminClient: ReturnType<typeof createClient>
  institutionId: string
  workspaceKey: string
}) {
  const { data, error } = await adminClient
    .from('subject_teacher_assignments')
    .select('id, teacher_id, teacher_record_id, subject_id, program_id, status, role, source, metadata')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('status', 'active')

  if (error) {
    if (isMissingRelationError(error, 'subject_teacher_assignments')) return []
    throw error
  }

  return asRecordArray(data)
}

function collectAccessibleTeacherRosterSubjects({
  assignments,
  snapshot,
  context,
  teacherRecords,
  institutionId,
}: {
  assignments: Array<Record<string, unknown>>
  snapshot: Record<string, unknown>
  context: Awaited<ReturnType<typeof requireTeacherPortalMember>>
  teacherRecords: Array<Record<string, unknown>>
  institutionId: string
}) {
  const accessibleSubjects: Array<{ subjectId: string; programId: string; source: string }> = []
  const today = new Date().toISOString().slice(0, 10)
  const callerId = getOptionalString(context.caller.id)
  const teacherRecordIds = new Set(teacherRecords.map((record) => getOptionalString(record.id)).filter(Boolean))

  assignments
    .filter((assignment) => (
      (
        getOptionalString(assignment.teacher_id) === callerId ||
        teacherRecordIds.has(getOptionalString(assignment.teacher_record_id))
      ) &&
      isTeacherRosterAssignmentInActiveWindow(assignment, today)
    ))
    .forEach((assignment) => addAccessibleTeacherRosterSubject(
      accessibleSubjects,
      assignment.subject_id,
      assignment.program_id,
      'subject_teacher_assignments',
    ))

  const snapshotRows = [
    ...asRecordArray(snapshot.docenteMateria),
    ...asRecordArray(snapshot.horariosDocentes),
    ...asRecordArray(snapshot.schedules),
    ...asRecordArray(snapshot.horarios),
  ]

  snapshotRows
    .filter((row) => snapshotTeacherRosterRowMatchesCaller({
      row,
      context,
      teacherRecords,
      institutionId,
    }))
    .forEach((row) => addAccessibleTeacherRosterSubject(
      accessibleSubjects,
      getTeacherRosterSubjectId(row),
      getTeacherRosterProgramId(row),
      'workspace_snapshot',
    ))

  return accessibleSubjects
}

function getTeacherRosterEnrollmentTimestamp(row: Record<string, unknown>) {
  const value = getOptionalString(row.updated_at ?? row.dropped_at ?? row.deleted_at ?? row.created_at)
  const timestamp = value ? Date.parse(value) : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getTeacherRosterEnrollmentIdentity(row: Record<string, unknown>) {
  const studentIdentity = getOptionalString(row.student_record_id ?? row.student_id)
  const subjectAlias = getTeacherRosterSubjectAliases(getTeacherRosterSubjectId(row)).sort()[0] ?? normalizePortalIdentity(getTeacherRosterSubjectId(row))
  const programIdentity = normalizePortalIdentity(getTeacherRosterProgramId(row))

  return `${studentIdentity}::${subjectAlias}::${programIdentity}`
}

function selectCurrentTeacherRosterEnrollments(rows: Array<Record<string, unknown>>) {
  const latestByIdentity = new Map<string, Record<string, unknown>>()

  rows.forEach((row, index) => {
    const identity = getTeacherRosterEnrollmentIdentity(row) || `row-${index}`
    const current = latestByIdentity.get(identity)
    if (!current || getTeacherRosterEnrollmentTimestamp(row) >= getTeacherRosterEnrollmentTimestamp(current)) {
      latestByIdentity.set(identity, row)
    }
  })

  return Array.from(latestByIdentity.values()).filter((row) => (
    ['active', 'enrolled'].includes(getOptionalString(row.status).toLowerCase()) &&
    !getOptionalString(row.deleted_at)
  ))
}

function mapSnapshotEnrollmentToTeacherRosterEnrollment(
  row: Record<string, unknown>,
  snapshotUpdatedAt: unknown,
) {
  return {
    ...row,
    id: getOptionalString(row.relational_id ?? row.id) ||
      `snapshot-${getOptionalString(row.profile_id ?? row.student_id)}-${getTeacherRosterSubjectId(row)}`,
    student_id: getOptionalString(row.student_id ?? row.profile_id ?? row.user_id),
    student_record_id: getOptionalString(row.student_record_id ?? row.record_id),
    subject_id: getTeacherRosterSubjectId(row),
    program_id: getTeacherRosterProgramId(row),
    status: getOptionalString(row.status ?? row.estado ?? row.situacion) || 'active',
    deleted_at: getOptionalString(row.deleted_at),
    dropped_at: getOptionalString(row.dropped_at),
    created_at: getOptionalString(row.created_at ?? row.enrolled_at ?? snapshotUpdatedAt),
    updated_at: getOptionalString(row.updated_at ?? row.created_at ?? row.enrolled_at ?? snapshotUpdatedAt),
    source: 'workspace_snapshot',
  }
}

async function fetchTeacherRosterStudentRecords({
  adminClient,
  enrollments,
}: {
  adminClient: ReturnType<typeof createClient>
  enrollments: Array<Record<string, unknown>>
}) {
  const records = {
    byId: new Map<string, ReturnType<typeof mapTeacherRosterStudentRecord>>(),
    byProfileId: new Map<string, ReturnType<typeof mapTeacherRosterStudentRecord>>(),
  }
  const recordIds = Array.from(new Set(enrollments.map((row) => getOptionalString(row.student_record_id)).filter(Boolean)))
  const profileIds = Array.from(new Set(enrollments.map((row) => getOptionalString(row.student_id)).filter(Boolean)))
  const addRecords = (rows: unknown) => {
    asRecordArray(rows).forEach((row) => {
      const mapped = mapTeacherRosterStudentRecord(row)
      if (mapped.id) records.byId.set(mapped.id, mapped)
      if (mapped.profileId) records.byProfileId.set(mapped.profileId, mapped)
    })
  }

  if (recordIds.length > 0) {
    let { data, error } = await adminClient
      .from('student_records')
      .select('id, profile_id, full_name, first_name, last_name, dni, email')
      .in('id', recordIds)

    if (isMissingColumnError(error, 'profile_id')) {
      ;({ data, error } = await adminClient
        .from('student_records')
        .select('id, full_name, first_name, last_name, dni, email')
        .in('id', recordIds))
    }

    if (error) {
      if (!isMissingRelationError(error, 'student_records')) throw error
    } else {
      addRecords(data)
    }
  }

  const missingProfileIds = profileIds.filter((profileId) => !records.byProfileId.has(profileId))
  if (missingProfileIds.length > 0) {
    const { data, error } = await adminClient
      .from('student_records')
      .select('id, profile_id, full_name, first_name, last_name, dni, email')
      .in('profile_id', missingProfileIds)

    if (error) {
      if (!isMissingColumnError(error, 'profile_id') && !isMissingRelationError(error, 'student_records')) throw error
    } else {
      addRecords(data)
    }
  }

  return records
}

async function fetchTeacherRosterStudentProfiles({
  adminClient,
  enrollments,
}: {
  adminClient: ReturnType<typeof createClient>
  enrollments: Array<Record<string, unknown>>
}) {
  const profileIds = Array.from(new Set(enrollments.map((row) => getOptionalString(row.student_id)).filter(isUuid)))
  if (profileIds.length === 0) return new Map<string, Record<string, unknown>>()

  const { data, error } = await adminClient
    .from('profiles')
    .select('user_id, email, display_name')
    .in('user_id', profileIds)

  if (error) throw error

  return new Map(
    asRecordArray(data)
      .map((row) => [getOptionalString(row.user_id), row])
      .filter(([userId]) => userId),
  )
}

async function handleTeacherSubjectRosters(
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  context?: Awaited<ReturnType<typeof requireTeacherPortalMember>>,
) {
  if (!context) throw new HttpError('Sesion invalida. Inicia sesion nuevamente.', 401)

  const institutionId = requireString(payload.institution_id, 'La institucion')
  const workspaceKey = getOptionalString(payload.workspace_key).trim() || 'main'
  const [teacherRecords, snapshotResult, assignments] = await Promise.all([
    fetchTeacherRosterTeacherRecords({ adminClient, institutionId, workspaceKey, context }),
    fetchTeacherRosterSnapshot({ adminClient, institutionId, workspaceKey }),
    fetchTeacherRosterAssignments({ adminClient, institutionId, workspaceKey }),
  ])
  const snapshot = snapshotResult.payload
  const accessibleSubjects = collectAccessibleTeacherRosterSubjects({
    assignments,
    snapshot,
    context,
    teacherRecords,
    institutionId,
  })

  if (accessibleSubjects.length === 0) {
    return {
      success: true,
      source: 'admin-users.teacher_subject_rosters',
      rosters: [],
      diagnostics: {
        teacher_records: teacherRecords.length,
        assignments: assignments.length,
        accessible_subjects: 0,
      },
    }
  }

  const { data: enrollmentRows, error: enrollmentError } = await adminClient
    .from('subject_enrollments')
    .select('id, student_id, student_record_id, subject_id, program_id, status, deleted_at, dropped_at, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (enrollmentError) throw enrollmentError

  const snapshotEnrollmentRows = asRecordArray(snapshot.enrollments)
    .map((row) => mapSnapshotEnrollmentToTeacherRosterEnrollment(row, snapshotResult.updatedAt))
    .filter((row) => getOptionalString(row.student_id) && getTeacherRosterSubjectId(row))
  const candidateEnrollmentRows = [
    ...asRecordArray(enrollmentRows),
    ...snapshotEnrollmentRows,
  ]
  const currentEnrollments = selectCurrentTeacherRosterEnrollments(
    candidateEnrollmentRows.filter((row) => (
      teacherRosterEnrollmentMatchesAccessibleSubject(row, accessibleSubjects)
    )),
  )
  const activeRelationalEnrollmentIds = new Map(
    selectCurrentTeacherRosterEnrollments(asRecordArray(enrollmentRows))
      .map((row) => [getTeacherRosterEnrollmentIdentity(row), getOptionalString(row.id)] as const)
      .filter(([identity, id]) => identity && id),
  )
  const [studentRecords, studentProfiles] = await Promise.all([
    fetchTeacherRosterStudentRecords({ adminClient, enrollments: currentEnrollments }),
    fetchTeacherRosterStudentProfiles({ adminClient, enrollments: currentEnrollments }),
  ])
  const rosters = currentEnrollments.map((enrollment) => {
    const studentId = getOptionalString(enrollment.student_id)
    const record = studentRecords.byId.get(getOptionalString(enrollment.student_record_id))
      ?? studentRecords.byProfileId.get(studentId)
    const profile = studentProfiles.get(studentId)
    const fullName = record?.fullName || getOptionalString(profile?.display_name) || getOptionalString(profile?.email)

    return {
      // El snapshot puede traer IDs compuestos que sirven como identidad
      // historica, pero no son validos para las RPC tipadas como uuid. Cuando
      // existe la inscripcion relacional equivalente, siempre publicamos su ID.
      enrollmentId: activeRelationalEnrollmentIds.get(getTeacherRosterEnrollmentIdentity(enrollment))
        || getOptionalString(enrollment.relational_id)
        || getOptionalString(enrollment.id),
      subjectId: getTeacherRosterSubjectId(enrollment),
      programId: getTeacherRosterProgramId(enrollment),
      studentId,
      studentRecordId: getOptionalString(enrollment.student_record_id) || record?.id || null,
      fullName: fullName || 'Alumno sin nombre registrado',
      dni: record?.dni || '',
      email: record?.email || getOptionalString(profile?.email),
    }
  })

  return {
    success: true,
    source: 'admin-users.teacher_subject_rosters',
    rosters,
    diagnostics: {
      teacher_records: teacherRecords.length,
      assignments: assignments.length,
      accessible_subjects: accessibleSubjects.length,
      enrollment_rows: asRecordArray(enrollmentRows).length,
      snapshot_enrollment_rows: snapshotEnrollmentRows.length,
      visible_rosters: rosters.length,
    },
  }
}

async function handleTeacherProfileUpdate(
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  context?: Awaited<ReturnType<typeof requireTeacherPortalMember>>,
) {
  if (!context) throw new HttpError('Sesion invalida. Inicia sesion nuevamente.', 401)

  const institutionId = requireString(payload.institution_id, 'La institucion')
  const workspaceKey = getOptionalString(payload.workspace_key).trim() || 'main'
  const profile = getPayloadRecord(payload.profile, 'El perfil')
  const email = normalizeEmail(profile.email)
  const phone = getOptionalString(profile.telefono).trim()
  const currentEmail = getOptionalString(context.caller.email).trim().toLowerCase()
  const now = new Date().toISOString()

  if (!/^\S+@\S+\.\S+$/.test(email)) throw badRequest('Ingresa un email valido.')
  if (phone.length > 40) throw badRequest('El telefono no puede superar los 40 caracteres.')

  const existingAuthUser = await findAuthUserByEmail(adminClient, email)
  if (existingAuthUser && existingAuthUser.id !== context.caller.id) {
    throw new HttpError('Ese email ya pertenece a otro usuario.', 409)
  }

  let { data: teacherRecord, error: teacherError } = await adminClient
    .from('teacher_records')
    .select('id, login_email, full_name, raw_payload')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('profile_id', context.caller.id)
    .limit(1)
    .maybeSingle()

  if (teacherError) throw teacherError

  if (!teacherRecord && currentEmail) {
    const fallback = await adminClient
      .from('teacher_records')
      .select('id, login_email, full_name, raw_payload')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .eq('login_email', currentEmail)
      .limit(1)
      .maybeSingle()
    if (fallback.error) throw fallback.error
    teacherRecord = fallback.data
  }

  if (!teacherRecord) {
    throw new HttpError('No se encontro tu registro docente en esta institucion.', 404)
  }

  const rawPayload = isRecord(teacherRecord.raw_payload) ? teacherRecord.raw_payload : {}
  const { error: recordError } = await adminClient
    .from('teacher_records')
    .update({
      profile_id: context.caller.id,
      login_email: email,
      phone,
      raw_payload: { ...rawPayload, email, telefono: phone, phone },
      updated_at: now,
    })
    .eq('id', teacherRecord.id)
    .eq('institution_id', institutionId)
  if (recordError) throw recordError

  const { error: profileError } = await adminClient
    .from('profiles')
    .update({ email, updated_at: now })
    .eq('user_id', context.caller.id)
  if (profileError) throw profileError

  const { error: authError } = await adminClient.auth.admin.updateUserById(context.caller.id, {
    email,
    email_confirm: true,
    user_metadata: {
      ...(isRecord(context.caller.user_metadata) ? context.caller.user_metadata : {}),
      phone,
    },
  })
  if (authError) throw authError

  const { data: snapshotRow, error: snapshotError } = await adminClient
    .from('workspace_snapshots')
    .select('payload')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()
  if (snapshotError) throw snapshotError

  if (isRecord(snapshotRow?.payload)) {
    const snapshot = { ...snapshotRow.payload }
    const updateOwnTeacher = (row: Record<string, unknown>) => {
      const rowEmail = getOptionalString(row.email ?? row.login_email).trim().toLowerCase()
      const rowProfileId = getOptionalString(row.profile_id ?? row.user_id)
      const rowRecordId = getOptionalString(row.record_id ?? row.id)
      if (rowProfileId !== context.caller.id && rowRecordId !== teacherRecord.id && rowEmail !== currentEmail) return row
      return { ...row, profile_id: context.caller.id, email, login_email: email, telefono: phone, phone }
    }
    snapshot.docentes = asRecordArray(snapshot.docentes).map(updateOwnTeacher)
    snapshot.teachers = asRecordArray(snapshot.teachers).map(updateOwnTeacher)

    const { error: snapshotUpdateError } = await adminClient
      .from('workspace_snapshots')
      .update({ payload: snapshot, updated_at: now })
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
    if (snapshotUpdateError) throw snapshotUpdateError
  }

  return { success: true, user_id: context.caller.id, email, telefono: phone }
}

async function handleSetUserPassword(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const userId = requireString(payload.target_user_id, 'El usuario')
  const password = requireString(payload.new_password, 'La nueva contrasena')

  if (password.length < 8) {
    throw badRequest('La nueva contrasena debe tener al menos 8 caracteres.')
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  })

  if (error) {
    // Usuarios creados por SQL directo durante pruebas pueden quedar inconsistentes.
    // Para admins institucionales intentamos repararlos recreando Auth y restaurando memberships.
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email, display_name, account_role, is_global_admin')
      .eq('user_id', userId)
      .maybeSingle()

    if (profileError) throw profileError

    if (!profile?.email) {
      throw error
    }

    if (profile.is_global_admin) {
      // No borramos/recreamos superadmins automaticamente: es demasiado riesgoso.
      // La recuperacion de superadmin esta documentada en README/setup.
      throw new Error(
        `No se pudo resetear este superadmin desde la reparacion automatica: ${error.message}`
      )
    }

    const { data: memberships, error: membershipsError } = await adminClient
      .from('memberships')
      .select('institution_id, role')
      .eq('user_id', userId)

    if (membershipsError) throw membershipsError

    await adminClient.auth.admin.deleteUser(userId)
    await deleteAuthUsersByEmail(adminClient, profile.email)

    const { data: recreated, error: recreateError } = await adminClient.auth.admin.createUser({
      email: profile.email.toLowerCase(),
      password,
      email_confirm: true,
      app_metadata: {
        provider: 'email',
        providers: ['email'],
      },
      user_metadata: {
        full_name: profile.display_name || profile.email,
        account_role: profile.account_role || 'admin_instituto',
      },
    })

    if (recreateError) throw recreateError
    if (!recreated.user) throw new Error('No se pudo recrear el usuario en Supabase Auth.')

    const { error: upsertProfileError } = await adminClient
      .from('profiles')
      .upsert({
        user_id: recreated.user.id,
        email: profile.email.toLowerCase(),
        display_name: profile.display_name || profile.email,
        account_role: profile.account_role || 'admin_instituto',
        is_global_admin: false,
        is_blocked: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertProfileError) throw upsertProfileError

    const membershipRows = (memberships ?? []).map((membership) => ({
      institution_id: membership.institution_id,
      user_id: recreated.user.id,
      role: membership.role,
    }))

    if (membershipRows.length > 0) {
      const { error: restoreMembershipsError } = await adminClient
        .from('memberships')
        .upsert(membershipRows, { onConflict: 'institution_id,user_id' })

      if (restoreMembershipsError) throw restoreMembershipsError
    }

    return {
      success: true,
      repaired_user: true,
      old_user_id: userId,
      new_user_id: recreated.user.id,
    }
  }

  const { error: profileError } = await adminClient
    .from('profiles')
    .update({
      is_blocked: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (profileError) throw profileError

  return { success: true }
}

async function handleResetStudentAcademicRecords(
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  context?: Awaited<ReturnType<typeof requireInstitutionAdmin>>,
) {
  if (!context) throw new HttpError('Sesion invalida. Inicia sesion nuevamente.', 401)

  const institutionId = requireString(payload.institution_id, 'La institucion')
  const workspaceKey = getOptionalString(payload.workspace_key).trim() || 'main'
  const student = getPayloadRecord(payload.student, 'El alumno')
  const password = requireString(payload.current_password, 'La contrasena actual')
  const now = new Date().toISOString()

  await assertCallerPassword(context.caller, password)

  const identity = getStudentAcademicResetIdentity(student)
  const studentRecords = await fetchStudentRecordsForAcademicReset({
    adminClient,
    institutionId,
    workspaceKey,
    identity,
  })
  mergeStudentAcademicResetIdentity(identity, studentRecords)

  const { data: snapshotRow, error: snapshotError } = await adminClient
    .from('workspace_snapshots')
    .select('payload, owner_user_id, owner_email')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (snapshotError) throw snapshotError

  if (isRecord(snapshotRow?.payload)) {
    const nextSnapshot = stripStudentAcademicSnapshotData(snapshotRow.payload, identity)
    const { error: updateSnapshotError } = await adminClient
      .from('workspace_snapshots')
      .update({ payload: nextSnapshot, updated_at: now })
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)

    if (updateSnapshotError) throw updateSnapshotError
  }

  const studentIds = Array.from(identity.profileIds).filter(isUuid)
  const studentRecordIds = Array.from(identity.recordIds).filter(isUuid)
  const subjectEnrollmentIds = await selectAcademicIdsByColumns({
    adminClient,
    table: 'subject_enrollments',
    institutionId,
    workspaceKey,
    filters: [
      { column: 'student_id', values: studentIds },
      { column: 'student_record_id', values: studentRecordIds },
    ],
  })
  const examEnrollmentIds = await selectAcademicIdsByColumns({
    adminClient,
    table: 'exam_enrollments',
    institutionId,
    workspaceKey,
    filters: [
      { column: 'student_id', values: studentIds },
      { column: 'student_record_id', values: studentRecordIds },
    ],
  })
  const gradeIds = await selectAcademicIdsByColumns({
    adminClient,
    table: 'student_grades',
    institutionId,
    workspaceKey,
    filters: [
      { column: 'student_id', values: studentIds },
      { column: 'student_record_id', values: studentRecordIds },
      { column: 'subject_enrollment_id', values: subjectEnrollmentIds },
      { column: 'exam_enrollment_id', values: examEnrollmentIds },
    ],
  })
  const attendanceIds = await selectAcademicIdsByColumns({
    adminClient,
    table: 'subject_attendance_records',
    institutionId,
    workspaceKey,
    filters: [
      { column: 'student_id', values: studentIds },
      { column: 'subject_enrollment_id', values: subjectEnrollmentIds },
    ],
  })

  const resetCounts = {
    grades: await updateAcademicRowsByIds({
      adminClient,
      table: 'student_grades',
      ids: gradeIds,
      patch: {
        deleted_at: now,
        deleted_by: context.caller.id,
        updated_by: context.caller.id,
      },
    }),
    subject_enrollments: await updateAcademicRowsByIds({
      adminClient,
      table: 'subject_enrollments',
      ids: subjectEnrollmentIds,
      patch: {
        status: 'dropped',
        dropped_at: now,
        deleted_at: now,
        deleted_by: context.caller.id,
        updated_by: context.caller.id,
      },
    }),
    exam_enrollments: await updateAcademicRowsByIds({
      adminClient,
      table: 'exam_enrollments',
      ids: examEnrollmentIds,
      patch: {
        status: 'cancelled',
        cancelled_at: now,
        deleted_at: now,
        deleted_by: context.caller.id,
        updated_by: context.caller.id,
      },
    }),
    attendance_records: await deleteAcademicRowsByIds({
      adminClient,
      table: 'subject_attendance_records',
      ids: attendanceIds,
    }),
  }

  return {
    success: true,
    action: 'reset_student_academic_records',
    student: {
      profile_ids: studentIds,
      student_record_ids: studentRecordIds,
      email: Array.from(identity.emails)[0] ?? null,
      dni: Array.from(identity.dnis)[0] ?? null,
    },
    reset_counts: resetCounts,
  }
}

async function handleTeacherRemoveStudentSubjectRecords(
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  context?: Awaited<ReturnType<typeof getAuthenticatedContext>>,
) {
  const institutionId = requireString(payload.institution_id, 'La institucion')
  const workspaceKey = getOptionalString(payload.workspace_key).trim() || 'main'
  const studentId = requireString(payload.student_id, 'El alumno')
  const subjectId = requireString(payload.subject_id, 'La materia')
  const programId = getOptionalString(payload.program_id).trim()
  const password = requireString(payload.current_password, 'La contrasena actual')
  const caller = context?.caller

  if (!caller?.id || !caller.email) {
    throw new HttpError('No se pudo identificar la cuenta docente.', 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const passwordClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: passwordData, error: passwordError } = await passwordClient.auth.signInWithPassword({
    email: caller.email,
    password,
  })

  if (passwordError || passwordData.user?.id !== caller.id) {
    throw new HttpError('La contrasena ingresada es incorrecta.', 401)
  }

  const { data, error } = await adminClient.rpc('teacher_remove_student_subject_records', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
    p_actor_id: caller.id,
    p_student_id: studentId,
    p_subject_id: subjectId,
    p_program_id: programId,
  })

  if (error) {
    const details = [error.message, error.details, error.hint]
      .map((value) => getOptionalString(value).trim())
      .filter(Boolean)
      .join(' ')
    throw new Error(details || 'La base de datos rechazo la eliminacion solicitada.')
  }
  return data
}

async function handleTeacherResetStudentSubjectAcademicRecords(
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  context?: Awaited<ReturnType<typeof requireTeacherPortalMember>>,
) {
  if (!context) throw new HttpError('Sesion invalida. Inicia sesion nuevamente.', 401)

  const institutionId = requireString(payload.institution_id, 'La institucion')
  const workspaceKey = getOptionalString(payload.workspace_key).trim() || 'main'
  const studentId = requireString(payload.student_id, 'El alumno')
  const subjectId = requireString(payload.subject_id, 'La materia')
  const programId = getOptionalString(payload.program_id).trim()
  const password = requireString(payload.current_password, 'La contrasena actual')

  await assertCallerPassword(context.caller, password)

  const { data, error } = await adminClient.rpc('teacher_reset_student_subject_academic_records', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
    p_actor_id: context.caller.id,
    p_student_id: studentId,
    p_subject_id: subjectId,
    p_program_id: programId,
  })

  if (error) {
    const details = [error.message, error.details, error.hint]
      .map((value) => getOptionalString(value).trim())
      .filter(Boolean)
      .join(' ')
    throw new Error(details || 'La base de datos rechazo el reinicio solicitado.')
  }

  const identity = getStudentAcademicResetIdentity({ student_id: studentId })
  const studentRecords = await fetchStudentRecordsForAcademicReset({
    adminClient,
    institutionId,
    workspaceKey,
    identity,
  })
  mergeStudentAcademicResetIdentity(identity, studentRecords)

  const { data: snapshotRow, error: snapshotError } = await adminClient
    .from('workspace_snapshots')
    .select('payload')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (snapshotError) throw snapshotError

  if (isRecord(snapshotRow?.payload)) {
    const nextSnapshot = stripStudentSubjectAcademicSnapshotData(
      snapshotRow.payload,
      identity,
      subjectId,
      programId,
    )
    const { error: updateSnapshotError } = await adminClient
      .from('workspace_snapshots')
      .update({ payload: nextSnapshot, updated_at: new Date().toISOString() })
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)

    if (updateSnapshotError) throw updateSnapshotError
  }

  return data
}

const actionHandlers: Record<string, (
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  context?: Awaited<ReturnType<typeof getAuthenticatedContext>>,
) => Promise<unknown>> = {
  create_tenant_with_admin: handleCreateTenantWithAdmin,
  create_or_assign_institution_user: handleCreateOrAssignInstitutionUser,
  bulk_create_students: handleBulkCreateStudents,
  bulk_create_teachers: handleBulkCreateTeachers,
  student_portal_mutation: handleStudentPortalMutation,
  reset_student_academic_records: handleResetStudentAcademicRecords,
  teacher_subject_rosters: handleTeacherSubjectRosters,
  teacher_profile_update: handleTeacherProfileUpdate,
  teacher_remove_student_subject_records: handleTeacherRemoveStudentSubjectRecords,
  teacher_reset_student_subject_academic_records: handleTeacherResetStudentSubjectAcademicRecords,
  set_user_password: handleSetUserPassword,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    try {
      assertAllowedOrigin(req)
      return new Response('ok', { headers: getCorsHeaders(req) })
    } catch (error) {
      return jsonResponse({
        error: error instanceof Error ? error.message : 'Origen no permitido.',
      }, error instanceof HttpError ? error.status : 403, req)
    }
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido.' }, 405, req)
  }

  let auditClient: ReturnType<typeof createClient> | null = null
  let auditCaller: { id: string; email?: string | null } | null = null
  let auditAction = 'unknown'
  let auditPayload: Record<string, unknown> = {}

  try {
    assertAllowedOrigin(req)
    assertBearerAuthorization(req)

    const requestBody = await req.json().catch(() => {
      throw badRequest('El cuerpo de la solicitud debe ser JSON valido.')
    })

    if (!isRecord(requestBody)) {
      throw badRequest('El cuerpo de la solicitud debe ser un objeto JSON.')
    }

    const { action, ...payload } = requestBody

    if (typeof action !== 'string' || action.trim() === '') {
      throw badRequest('La accion es obligatoria.')
    }

    auditAction = action
    auditPayload = payload

    const handler = actionHandlers[action]
    if (!handler) {
      throw badRequest(`Accion no soportada: ${action}`)
    }

    const authContext = action === 'student_portal_mutation'
      ? await requireStudentPortalMember(req, typeof payload.institution_id === 'string' ? payload.institution_id : '')
      : action === 'teacher_profile_update' || action === 'teacher_remove_student_subject_records' || action === 'teacher_reset_student_subject_academic_records' || action === 'teacher_subject_rosters'
        ? await requireTeacherPortalMember(req, typeof payload.institution_id === 'string' ? payload.institution_id : '')
      : action === 'bulk_create_students' || action === 'bulk_create_teachers' || action === 'reset_student_academic_records'
        ? await requireInstitutionAdmin(req, typeof payload.institution_id === 'string' ? payload.institution_id : '')
        : await requireSuperAdmin(req)
    const { adminClient, caller } = authContext
    auditClient = adminClient
    auditCaller = caller

    const result = await handler(adminClient, payload, authContext)
    await recordAdminAudit({
      adminClient,
      caller,
      action,
      status: 'success',
      target: getAuditTarget(action, payload, result),
      metadata: sanitizeAuditMetadata(payload),
    })

    return jsonResponse(result, 200, req)
  } catch (error) {
    if (auditClient && auditCaller) {
      await recordAdminAudit({
        adminClient: auditClient,
        caller: auditCaller,
        action: auditAction,
        status: 'error',
        target: getAuditTarget(auditAction, auditPayload, null),
        metadata: sanitizeAuditMetadata(auditPayload),
        errorMessage: error instanceof Error ? error.message : 'Error inesperado.',
      })
    }

    return jsonResponse({
      error: error instanceof Error ? error.message : 'Error inesperado.',
    }, error instanceof HttpError ? error.status : 500, req)
  }
})
