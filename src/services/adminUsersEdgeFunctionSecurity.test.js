import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Git puede entregar CRLF en Windows: las comparaciones de este archivo usan LF.
const edgeFunction = readFileSync(
  join(process.cwd(), 'supabase/functions/admin-users/index.ts'),
  'utf8',
).replace(/\r\n/g, '\n')
const supabaseConfig = readFileSync(
  join(process.cwd(), 'supabase/config.toml'),
  'utf8',
)
const functionConfig = readFileSync(
  join(process.cwd(), 'supabase/config/config.toml'),
  'utf8',
)
const deployDocs = readFileSync(
  join(process.cwd(), 'supabase/docs/deploy_admin_users.md'),
  'utf8',
)
const foundationSchema = readFileSync(
  join(process.cwd(), 'supabase/schema/01_foundation.sql'),
  'utf8',
)
const academicOperationsSchema = readFileSync(
  join(process.cwd(), 'supabase/schema/07_academic_operations.sql'),
  'utf8',
)

function normalizeSql(source) {
  return source.replace(/\r\n/g, '\n')
}

function extractSqlBlock(source, startPattern, endPattern) {
  const normalizedSource = normalizeSql(source)
  const start = normalizedSource.search(startPattern)
  expect(start, `Debe encontrarse el inicio ${startPattern}`).toBeGreaterThanOrEqual(0)
  const rest = normalizedSource.slice(start)
  const end = rest.search(endPattern)
  expect(end, `Debe encontrarse el fin ${endPattern}`).toBeGreaterThanOrEqual(0)
  return rest.slice(0, end)
}

describe('admin-users edge function security posture', () => {
  it('vincula la inscripcion a materias con el JWT del alumno en SQL y en el caller', () => {
    const rpcBody = extractSqlBlock(
      academicOperationsSchema,
      /create or replace function public\.upsert_subject_enrollment_from_portal\(/i,
      /create or replace function public\.academic_teacher_create_class_session\(/i,
    )

    expect(rpcBody).toContain('authenticated_user_id uuid := (select auth.uid())')
    expect(rpcBody).toMatch(/authenticated_user_id\s+is\s+null\s+or\s+authenticated_user_id\s+<>\s+actor_user_id\s+or\s+actor_user_id\s+<>\s+target_student_id/i)
    expect(edgeFunction).toContain("context.userClient.rpc('upsert_subject_enrollment_from_portal'")
    expect(edgeFunction).not.toContain("adminClient.rpc('upsert_subject_enrollment_from_portal'")
  })

  it('no usa raw_user_meta_data.account_role como autoridad de perfiles', () => {
    const handleNewUserBody = extractSqlBlock(
      foundationSchema,
      /create or replace function public\.handle_new_user\(\)/i,
      /drop trigger if exists on_auth_user_created/i,
    )

    expect(handleNewUserBody).toContain('security definer')
    expect(handleNewUserBody).toContain("set search_path = ''")
    expect(handleNewUserBody).toContain("new.raw_app_meta_data ->> 'account_role'")
    expect(handleNewUserBody).toContain("coalesce(new.raw_app_meta_data ->> 'account_role', 'alumno')")
    expect(handleNewUserBody).not.toContain("new.raw_user_meta_data ->> 'account_role'")
    expect(foundationSchema).toContain('revoke execute on function public.handle_new_user() from public, anon, authenticated;')
  })

  it('conserva la asignacion administrativa legitima de roles fuera del trigger', () => {
    expect(edgeFunction).toContain('account_role: \'admin_instituto\'')
    expect(edgeFunction).toContain('account_role: \'alumno\'')
    expect(edgeFunction).toContain('account_role: \'docente\'')
    expect(edgeFunction).toContain('await upsertProfile')
    expect(edgeFunction).toContain('await assignMemberships')
  })

  it('mantiene verify_jwt desactivado solo con validacion interna explicita', () => {
    expect(supabaseConfig).toMatch(/\[functions\.admin-users\][\s\S]*verify_jwt = false/)
    expect(functionConfig).toContain('verify_jwt = false')
    expect(deployDocs).toContain('--no-verify-jwt')
    expect(edgeFunction).toContain('assertBearerAuthorization(req)')
    expect(edgeFunction).toContain('await requireStudentPortalMember')
    expect(edgeFunction).toContain('await requireTeacherPortalMember')
    expect(edgeFunction).toContain('await requireInstitutionAdmin')
    expect(edgeFunction).toContain('await requireSuperAdmin')
  })

  it('no acepta wildcard CORS en admin-users', () => {
    expect(edgeFunction).not.toContain("allowedOrigins.has('*')")
    expect(edgeFunction).not.toContain("? '*' : origin")
  })

  it('sincroniza relacional cuando el portal ya lee tablas relacionales', () => {
    const dualWriteBody = edgeFunction.match(/function shouldDualWriteAcademics[\s\S]*?\n}/)?.[0] ?? ''
    const readRelationalBody = edgeFunction.match(/function shouldReadRelationalAcademics[\s\S]*?\n}/)?.[0] ?? ''

    expect(dualWriteBody).toContain('shouldReadRelationalAcademics(config)')
    expect(readRelationalBody).toContain('config.hybridReadEnabled')
    expect(readRelationalBody).toContain('config.relationalPrimaryEnabled')
    expect(readRelationalBody).toContain("['hybrid_read', 'relational_primary'].includes(config.readMode)")
    expect(edgeFunction).toContain('transitionConfig.strictDriftBlockEnabled || shouldReadRelationalAcademics(transitionConfig)')
  })

  it('obliga escritura relacional para inscripciones que alimentan el panel docente', () => {
    expect(edgeFunction).toContain("new Set(['enroll_subject', 'withdraw_subject', 'register_exam', 'cancel_exam'])")
    expect(edgeFunction).toContain('relationalWriteRequired = shouldRequireStudentPortalRelationalWrite(mutationType)')
    expect(edgeFunction).toContain('relationalWriteEnabled = dualWriteEnabled || relationalWriteRequired')
    expect(edgeFunction).toContain('if (relationalWriteRequired || transitionConfig.strictDriftBlockEnabled || shouldReadRelationalAcademics(transitionConfig))')
  })

  it('expone el padron de materias por Edge Function solo para docentes autenticados', () => {
    expect(edgeFunction).toContain('teacher_subject_rosters: handleTeacherSubjectRosters')
    expect(edgeFunction).toContain("action === 'teacher_profile_update' || action === 'teacher_remove_student_subject_records' || action === 'teacher_reset_student_subject_academic_records' || action === 'teacher_subject_rosters'")
    expect(edgeFunction).toContain('await requireTeacherPortalMember')
    expect(edgeFunction).toContain('teacherRosterEnrollmentMatchesAccessibleSubject')
    expect(edgeFunction).toContain('snapshot.enrollments')
    expect(edgeFunction).toContain('mapSnapshotEnrollmentToTeacherRosterEnrollment')
  })

  it('I2d: re-crear accesos docentes no pisa contrasena ni bloqueo, y el alta con DNI exige cambiarla', () => {
    const teacherReuse = edgeFunction.slice(edgeFunction.indexOf('async function createOrReuseTeacherAuthUser('), edgeFunction.indexOf('async function linkStudentRecordsToProfile('))
    const existingBranch = teacherReuse.slice(teacherReuse.indexOf('if (existingUser) {'), teacherReuse.indexOf('const { data, error } = await adminClient.auth.admin.createUser({'))
    expect(existingBranch).toContain('updateUserById(existingUser.id, {')
    expect(existingBranch).not.toMatch(/\bpassword\b,/)
    expect(edgeFunction).toContain("...(status === 'created' ? { is_blocked: false } : {}),")
    expect(edgeFunction.match(/\[MUST_CHANGE_PASSWORD_FLAG\]: true,/g)).toHaveLength(2)
  })

  it('I2d: solo complete_initial_password_change limpia la marca, verificando la contrasena actual', () => {
    const handler = edgeFunction.slice(edgeFunction.indexOf('async function handleCompleteInitialPasswordChange('), edgeFunction.indexOf('async function handleSetUserPassword('))
    expect(edgeFunction).toContain('complete_initial_password_change: handleCompleteInitialPasswordChange')
    expect(edgeFunction).toContain("action === 'complete_initial_password_change'\n        ? await getAuthenticatedContext(req)")
    expect(handler).toContain('await assertCallerPassword(context.caller, currentPassword)')
    expect(handler.indexOf('assertCallerPassword')).toBeLessThan(handler.indexOf('updateUserById'))
    expect(handler).toContain('updateUserById(context.caller.id, {')
    expect(handler).toContain('[MUST_CHANGE_PASSWORD_FLAG]: false')
    expect(edgeFunction.match(/\[MUST_CHANGE_PASSWORD_FLAG\]: false/g)).toHaveLength(1)
  })

  it('I2f: el alta de institucion + admin valida antes de escribir y deshace todo si falla', () => {
    const handler = edgeFunction.slice(edgeFunction.indexOf('async function handleCreateTenantWithAdmin('), edgeFunction.indexOf('async function handleCreateOrAssignInstitutionUser('))
    const insertAt = handler.indexOf(".from('institutions')\n    .insert({")
    expect(insertAt).toBeGreaterThan(0)
    expect(handler.indexOf('await findReusableInstitutionAdmin(adminClient, email)')).toBeLessThan(insertAt)
    expect(handler.indexOf("throw badRequest('La contrasena debe tener al menos 8 caracteres.')")).toBeLessThan(insertAt)
    expect(handler).toContain("await adminClient.from('institutions').delete().eq('id', institution.id)")
    expect(handler).toContain('await discardProvisionalInstitutionAdmin(adminClient, createdUserId)')
    expect(handler).not.toContain('deleteUser(')
  })

  it('I2g: asignar usuario a institucion valida antes de crear el usuario y lo borra si la asignacion falla', () => {
    const handler = edgeFunction.slice(edgeFunction.indexOf('async function handleCreateOrAssignInstitutionUser('), edgeFunction.indexOf('async function createOrReuseStudentAuthUser({'))
    const createAt = handler.indexOf('await createInstitutionAdminUser(')
    expect(createAt).toBeGreaterThan(0)
    for (const guard of ['if (!membershipRoles.has(role))', 'if (institutionIds.length === 0)', "throw badRequest('Alguna de las instituciones elegidas no existe.')", 'await findReusableInstitutionAdmin(adminClient, email)']) {
      expect(handler.indexOf(guard)).toBeGreaterThan(-1)
      expect(handler.indexOf(guard)).toBeLessThan(createAt)
    }
    expect(handler).toContain('await discardProvisionalInstitutionAdmin(adminClient, createdUserId)')
    expect(handler).not.toContain('deleteUser(')
    expect(handler).toContain("await adminClient.from('memberships').upsert(previousMemberships.map(")
  })

  it('AUD.I2f P1: un admin en alta no se reutiliza y la compensacion solo borra cuentas que siguen en alta', () => {
    const create = edgeFunction.slice(edgeFunction.indexOf('async function createInstitutionAdminUser({'), edgeFunction.indexOf('// Fin de un alta nueva'))
    expect(create).toContain("app_metadata: { provider: 'email', providers: ['email'], [ADMIN_PROVISIONING_FLAG]: true }")
    const reusable = edgeFunction.slice(edgeFunction.indexOf('async function findReusableInstitutionAdmin('), edgeFunction.indexOf('async function createInstitutionAdminUser({'))
    expect(reusable.indexOf('assertNotInAdminProvisioning(existingUser)')).toBeLessThan(reusable.indexOf('await readReusableAdminProfile('))
    const discard = edgeFunction.slice(edgeFunction.indexOf('async function discardProvisionalInstitutionAdmin('), edgeFunction.indexOf('async function upsertProfile({'))
    expect(discard.indexOf('[ADMIN_PROVISIONING_FLAG] !== true) return false')).toBeGreaterThan(0)
    expect(discard.indexOf('[ADMIN_PROVISIONING_FLAG] !== true) return false')).toBeLessThan(discard.indexOf('deleteUser(userId)'))
    // Toda reutilizacion de cuentas (admin, docente, alumno y la reparacion de accesos) respeta el alta en curso.
    expect(edgeFunction.match(/assertNotInAdminProvisioning\((existingUser|user)\)/g)).toHaveLength(4)
    for (const handlerName of ['handleCreateTenantWithAdmin', 'handleCreateOrAssignInstitutionUser']) {
      const handler = edgeFunction.slice(edgeFunction.indexOf(`async function ${handlerName}(`))
      const body = handler.slice(0, handler.indexOf('\n}\n'))
      expect(body.indexOf('await finishInstitutionAdminProvisioning(adminClient, createdUser)')).toBeGreaterThan(body.indexOf('await assignMemberships({'))
    }
  })

  it('I2f/I2g: un admin existente se reutiliza sin tocar contrasena, rol global ni bloqueo', () => {
    const reusable = edgeFunction.slice(edgeFunction.indexOf('async function findReusableInstitutionAdmin('), edgeFunction.indexOf('async function createInstitutionAdminUser({'))
    const profileCheck = edgeFunction.slice(edgeFunction.indexOf('async function readReusableAdminProfile('), edgeFunction.indexOf('async function findReusableInstitutionAdmin('))
    // AUD.I2f P2: sin perfil no se reutiliza; el rol tiene que ser exactamente admin_instituto.
    expect(profileCheck).toContain('if (!existingProfile) {')
    expect(profileCheck).toContain("existingProfile.is_global_admin || String(existingProfile.account_role ?? '').toLowerCase() !== 'admin_instituto'")
    expect(profileCheck).toContain('if (existingProfile.is_blocked)')
    expect(profileCheck).not.toMatch(/\.(upsert|update|insert)\(/)
    expect(reusable).not.toMatch(/password|\.(upsert|update|insert)\(/)
    // AUD.I2f P2: el reutilizado no se reescribe y se revalida despues de recibir la membresia.
    expect(edgeFunction).not.toContain('markReusedInstitutionAdmin')
    for (const handlerName of ['handleCreateTenantWithAdmin', 'handleCreateOrAssignInstitutionUser']) {
      const handler = edgeFunction.slice(edgeFunction.indexOf(`async function ${handlerName}(`))
      const body = handler.slice(0, handler.indexOf('\n}\n'))
      expect(body.indexOf('if (existingUser) await readReusableAdminProfile(adminClient,')).toBeGreaterThan(body.indexOf('await assignMemberships({'))
    }
    expect(edgeFunction).not.toContain('createOrReuseAuthUser(')
  })

  it('D2: la provision masiva reintenta solo SOURCE_FILE_WORKSPACE_BUSY y solo sobre escrituras idempotentes', () => {
    const helper = edgeFunction.slice(edgeFunction.indexOf('function isWorkspaceBusyError('), edgeFunction.indexOf('function assertNotInAdminProvisioning('))
    expect(helper).toContain("record?.code === '55P03'")
    expect(helper).toContain("if (attempt >= attempts || !isWorkspaceBusyError(error)) throw error")
    const students = edgeFunction.slice(edgeFunction.indexOf('async function handleBulkCreateStudents('), edgeFunction.indexOf('async function handleBulkCreateTeachers('))
    const retried = students.slice(students.indexOf('await retryOnWorkspaceBusy(async () => {'))
    // La cuenta Auth se crea antes y fuera del reintento: nunca se crea dos veces.
    expect(students.indexOf('await createOrReuseStudentAuthUser({')).toBeLessThan(students.indexOf('await retryOnWorkspaceBusy(async () => {'))
    for (const write of ['persistStudentRecord({', 'persistStudentCareerPlan({', 'linkStudentRecordsToProfile({']) expect(retried).toContain(write)
    expect(retried).not.toContain('createUser(')
    const teachers = edgeFunction.slice(edgeFunction.indexOf('async function handleBulkCreateTeachers('), edgeFunction.indexOf('function getPayloadRecord('))
    expect(teachers.indexOf('await createOrReuseTeacherAuthUser({')).toBeLessThan(teachers.indexOf('await retryOnWorkspaceBusy(async () => {'))
    expect(teachers.slice(teachers.indexOf('await retryOnWorkspaceBusy(async () => {'))).toContain('persistAndLinkTeacherRecord({')
  })

  it('reparar accesos incompletos: accion aparte, solo admin institucional y solo cuentas nunca usadas y sin otra identidad', () => {
    const repair = edgeFunction.slice(edgeFunction.indexOf('async function handleRepairStudentAccess('), edgeFunction.indexOf('async function handleBulkCreateTeachers('))
    expect(edgeFunction).toContain("repair_student_access: handleRepairStudentAccess")
    expect(edgeFunction).toContain("|| action === 'repair_student_access'\n        ? await requireInstitutionAdmin(")
    for (const guard of [
      'assertNotInAdminProvisioning(user)',
      'user.app_metadata?.[MUST_CHANGE_PASSWORD_FLAG] !== true',
      "!['alumno', 'student'].includes(String(profile.account_role).toLowerCase())",
      "memberships.length !== 1 || memberships[0].institution_id !== institutionId || memberships[0].role !== 'viewer'",
      'if (records.some((record) => record.profile_id)) {',
      ".is('profile_id', null)",
    ]) expect(repair).toContain(guard)
    // No crea, borra ni cambia cuentas o contrasenas: solo vincula legajos sin duenio.
    expect(repair).not.toMatch(/createUser|deleteUser|updateUserById|password/)
    // El alta masiva sigue fallando cerrada ante legajos sin vincular (regla auditada).
    expect(edgeFunction).toContain('!records.length || records.some((record) => record.profile_id !== user.id)) {')
  })

  it('PB.4: el snapshot del portal alumno se escribe despues de la escritura relacional', () => {
    const handler = edgeFunction.slice(edgeFunction.indexOf('async function handleStudentPortalMutation('), edgeFunction.indexOf('async function fetchTeacherRosterTeacherRecords({'))
    const relationalAt = handler.indexOf('relationalResult = await writeStudentPortalRelational({')
    const snapshotAt = handler.indexOf(".from('workspace_snapshots')\n      .upsert({")
    expect(relationalAt).toBeGreaterThan(0)
    expect(snapshotAt).toBeGreaterThan(relationalAt)
    expect(handler.match(/\.from\('workspace_snapshots'\)\n\s+\.upsert\(/g)).toHaveLength(1)
    expect(handler).toContain('throw new HttpError(`No se guardo el cambio: ${relationalErrorMessage}`, 409)')
    expect(handler).not.toContain('El snapshot se actualizo, pero fallo')
  })

  it('protege el reset academico total con permisos admin y contrasena actual', () => {
    expect(edgeFunction).toContain('reset_student_academic_records: handleResetStudentAcademicRecords')
    expect(edgeFunction).toContain("action === 'bulk_create_students' || action === 'bulk_create_teachers' || action === 'reset_student_academic_records'")
    expect(edgeFunction).toContain('await assertCallerPassword(context.caller, password)')
    expect(edgeFunction).toContain("table: 'student_grades'")
    expect(edgeFunction).toContain("table: 'subject_enrollments'")
    expect(edgeFunction).toContain("table: 'exam_enrollments'")
    expect(edgeFunction).toContain("table: 'subject_attendance_records'")
    expect(edgeFunction).toContain('stripStudentAcademicSnapshotData')
  })

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('actualiza student_records por workspace email y carrera sin duplicados con finales %s', (_format, lineEnding) => {
    const source = edgeFunction.replace(/\r?\n/g, lineEnding)
    // Git puede entregar CRLF o LF; conservar el contenido y normalizar solo los saltos.
    const normalizedSource = source.replace(/\r\n/g, '\n')
    const persistStudentRecordMatch = normalizedSource.match(/async function persistStudentRecord[\s\S]*?\n}\n\nasync function persistStudentCareerPlan/)
    expect(persistStudentRecordMatch, 'Debe encontrarse el cuerpo de persistStudentRecord').not.toBeNull()
    const persistStudentRecordBody = persistStudentRecordMatch[0]

    expect(persistStudentRecordBody).toContain("const workspaceKey = 'main'")
    expect(persistStudentRecordBody).toContain("const career = getOptionalString(student.carrera ?? student.career)")
    expect(persistStudentRecordBody).toContain("select('id')")
    expect(persistStudentRecordBody).toContain(".eq('workspace_key', workspaceKey)")
    expect(persistStudentRecordBody).toContain(".eq('email', email)")
    expect(persistStudentRecordBody).toContain(".eq('career', career)")
    expect(persistStudentRecordBody).toContain("onConflict: 'institution_id,workspace_key,email,career'")
    expect(persistStudentRecordBody).not.toContain("onConflict: 'institution_id,external_code'")
  })

  it('corta en la Edge a miembros de una institucion suspendida (06.3)', () => {
    const helper = extractSqlBlock(edgeFunction, /async function assertInstitutionActive\(/, /\nasync function requireStudentPortalMember\(/)
    expect(helper).toContain(".from('institutions')")
    expect(helper).toContain("institution?.status !== 'active'")
    for (const name of ['requireStudentPortalMember', 'requireTeacherPortalMember', 'requireInstitutionAdmin']) {
      const body = extractSqlBlock(edgeFunction, new RegExp(`async function ${name}\\(`), /\n}\n/)
      expect(body, name).toContain('await assertInstitutionActive(context.adminClient, institutionId)')
    }
    const superAdminBody = extractSqlBlock(edgeFunction, /async function requireSuperAdmin\(/, /\n}\n/)
    expect(superAdminBody).not.toContain('assertInstitutionActive')
  })

  it('exige institucion activa en el helper RLS y en las RPC de autogestion del alumno (06.3)', () => {
    const helperBody = extractSqlBlock(foundationSchema, /create or replace function public\.is_member_of_institution\(/i, /\$\$;/)
    expect(helperBody).toContain('join public.institutions institution on institution.id = membership.institution_id')
    expect(helperBody).toContain("and institution.status = 'active'")
    const superAdminBody = extractSqlBlock(foundationSchema, /create or replace function public\.is_super_admin\(/i, /\$\$;/)
    expect(superAdminBody).not.toContain('institutions')
    const subjectRpc = extractSqlBlock(academicOperationsSchema, /create or replace function public\.upsert_subject_enrollment_from_portal\(/i, /\$\$;/)
    const examRpc = extractSqlBlock(readFileSync(join(process.cwd(), 'supabase/schema/08_exam_tables.sql'), 'utf8'), /create or replace function public\.upsert_exam_enrollment_from_portal\(/i, /\$\$;/)
    for (const body of [subjectRpc, examRpc]) {
      expect(body).toMatch(/join public\.institutions institution\s+on institution\.id = membership\.institution_id\s+and institution\.status = 'active'/)
    }
  })

  it('cancela mesas con id relacional y con su propio client_mutation_id (PB.1)', () => {
    const cancelBranch = extractSqlBlock(edgeFunction, /\} else if \(mutationType === 'cancel_exam'\) \{/, /\} else if \(mutationType === 'update_profile'\)/)
    expect(cancelBranch).toContain(".from('exam_enrollments')")
    expect(cancelBranch).toContain(".eq('student_id', callerId)")
    expect(cancelBranch).toContain('legacy_snapshot_id')
    const relationalWriter = extractSqlBlock(edgeFunction, /async function writeExamEnrollmentRelational\(/, /\nasync function writeStudentPortalRelational\(/)
    expect(relationalWriter).toMatch(/mutationType === 'cancel_exam'\s*\?\s*`\$\{legacySnapshotId \|\| examTableId\}:cancel_exam:\$\{now\}`/)
    const registerBranch = extractSqlBlock(edgeFunction, /\} else if \(mutationType === 'register_exam'\) \{/, /\} else if \(mutationType === 'cancel_exam'\)/)
    expect(registerBranch).toContain('result = asRecordArray(snapshot.examEnrollments).find(isSameExamEnrollment) ?? nextExamEnrollment')
  })

  it('da de baja cursadas con id relacional, solo propias, y devuelve la fila guardada al inscribir (PB.3)', () => {
    const withdrawBranch = extractSqlBlock(edgeFunction, /\} else if \(mutationType === 'withdraw_subject'\) \{/, /\} else if \(mutationType === 'register_exam'\)/)
    expect(withdrawBranch).toContain(".from('subject_enrollments')")
    expect(withdrawBranch).toContain(".eq('student_id', callerId)")
    expect(withdrawBranch).toContain(".eq('institution_id', institutionId)")
    expect(withdrawBranch).toContain('legacy_snapshot_id')
    const enrollBranch = extractSqlBlock(edgeFunction, /if \(mutationType === 'enroll_subject'\) \{/, /\} else if \(mutationType === 'withdraw_subject'\)/)
    expect(enrollBranch).toContain('result = asRecordArray(snapshot.enrollments).find(isSameSubjectEnrollment) ?? nextEnrollment')
  })
})
