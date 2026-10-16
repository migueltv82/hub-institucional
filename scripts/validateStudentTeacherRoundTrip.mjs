import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_SOURCE = 'codex_student_teacher_round_trip'
const DEFAULT_WORKSPACE_KEY = 'main'
const ENV_FILES = ['.env', '.env.local']
const REQUIRED_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_TEST_INSTITUTION_ID',
  'SUPABASE_TEST_WORKSPACE_KEY',
]
const FORBIDDEN_SERVICE_ROLE_ENV_KEYS = [
  'VITE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_ADMIN_SERVICE_ROLE_KEY',
]

const CANONICAL_SUBJECT_ID = 'ING08'
const CANONICAL_PROGRAM_ID = 'PROFESORADO DE INGLES'

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
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

function buildEnvPresence(env) {
  return REQUIRED_ENV_KEYS.reduce((acc, key) => {
    acc[key] = Boolean(pickEnv(env, key))
    return acc
  }, {})
}

function assertRequiredEnv(env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !pickEnv(env, key))
  const forbidden = FORBIDDEN_SERVICE_ROLE_ENV_KEYS.filter((key) => Boolean(pickEnv(env, key)))

  if (forbidden.length > 0) {
    const error = new Error(`Variables service_role prohibidas con prefijo VITE_: ${forbidden.join(', ')}.`)
    error.details = {
      envPresence: buildEnvPresence(env),
      note: 'La service role key solo puede cargarse como SUPABASE_SERVICE_ROLE_KEY para scripts locales/backend.',
    }
    throw error
  }

  if (missing.length > 0) {
    const error = new Error(`Faltan variables requeridas para validacion real Supabase: ${missing.join(', ')}.`)
    error.details = {
      envPresence: buildEnvPresence(env),
      expectedFiles: ENV_FILES,
      note: 'SUPABASE_SERVICE_ROLE_KEY debe cargarse en el proceso o en .env.local, nunca como VITE_ ni en frontend.',
    }
    throw error
  }
}

function summarizeError(error) {
  if (!error) return null
  return {
    code: error.code ?? null,
    message: error.message ?? String(error),
    details: error.details ?? null,
    hint: error.hint ?? null,
  }
}

function assertNoError(result, label) {
  if (result.error) {
    const error = new Error(`${label}: ${result.error.message}`)
    error.details = summarizeError(result.error)
    throw error
  }
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function makeSupabaseClient(supabaseUrl, supabaseKey) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function makeRunId() {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

function makePassword(runId) {
  return `RoundTrip-${runId}-Aa1!`
}

function makeEmail({ runId, role, label }) {
  return `roundtrip.${role}.${label}.${runId}@example.com`
}

function makeDni(suffix) {
  return `99988${suffix}`
}

function createStepLogger() {
  const steps = []

  return {
    steps,
    async run(label, fn) {
      try {
        const details = await fn()
        const step = { label, ok: true, details: details ?? null }
        steps.push(step)
        console.log(`OK - ${label}${details?.summary ? `: ${details.summary}` : ''}`)
        return details
      } catch (error) {
        const step = {
          label,
          ok: false,
          error: error.message,
          details: error.details ?? null,
        }
        steps.push(step)
        console.log(`FALLA - ${label}: ${error.message}`)
        if (error.details) {
          console.log(JSON.stringify({ details: error.details }, null, 2))
        }
        throw error
      }
    },
  }
}

async function assertInstitutionExists(supabase, requestedInstitutionId) {
  const result = await supabase
    .from('institutions')
    .select('id, name, slug')
    .eq('id', requestedInstitutionId)
    .limit(1)

  assertNoError(result, 'No se pudo validar SUPABASE_TEST_INSTITUTION_ID en institutions')

  const institution = result.data?.[0]
  if (!institution?.id) {
    const error = new Error('SUPABASE_TEST_INSTITUTION_ID no existe o no es accesible con la service role key provista.')
    error.details = {
      institutionId: requestedInstitutionId,
    }
    throw error
  }

  return institution
}

async function createAuthUser({ supabase, email, password, displayName, accountRole, cleanup }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      account_role: accountRole,
      source: TEST_SOURCE,
    },
  })

  if (error) {
    const wrapped = new Error(`No se pudo crear usuario Auth ${accountRole}: ${error.message}`)
    wrapped.details = summarizeError(error)
    throw wrapped
  }

  const user = data?.user
  if (!user?.id) {
    throw new Error(`No se pudo crear usuario Auth ${accountRole}: Supabase no devolvio user.id.`)
  }

  cleanup.authUserIds.push(user.id)
  return user
}

async function signInUser({ supabaseUrl, publishableKey, email, password, label }) {
  const client = makeSupabaseClient(supabaseUrl, publishableKey)
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error) {
    const wrapped = new Error(`No se pudo iniciar sesion como ${label}: ${error.message}`)
    wrapped.details = summarizeError(error)
    throw wrapped
  }

  if (!data?.user?.id) {
    throw new Error(`No se pudo iniciar sesion como ${label}: Supabase no devolvio user.id.`)
  }

  return client
}

async function upsertProfileAndMembership({ supabase, institutionId, userId, email, displayName, accountRole }) {
  const profileResult = await supabase
    .from('profiles')
    .upsert({
      user_id: userId,
      email,
      display_name: displayName,
      account_role: accountRole,
      is_global_admin: false,
      is_blocked: false,
    }, { onConflict: 'user_id' })
    .select('user_id')
    .single()

  assertNoError(profileResult, `No se pudo upsert profiles para ${accountRole}`)

  const membershipResult = await supabase
    .from('memberships')
    .upsert({
      institution_id: institutionId,
      user_id: userId,
      role: 'viewer',
    }, { onConflict: 'institution_id,user_id' })
    .select('institution_id, user_id')
    .single()

  assertNoError(membershipResult, `No se pudo upsert memberships para ${accountRole}`)
}

async function insertStudentRecord({ supabase, institutionId, workspaceKey, student, cleanup }) {
  const result = await supabase
    .from('student_records')
    .insert({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      email: student.email,
      full_name: student.fullName,
      first_name: student.firstName,
      last_name: student.lastName,
      career: CANONICAL_PROGRAM_ID,
      academic_year: '4',
      dni: student.dni,
      legajo: student.legajo,
      phone: '',
      status: 'activo',
      raw_payload: {
        source: TEST_SOURCE,
        run_id: student.runId,
        note: 'Alumno efimero para validar ida y vuelta alumno-docente.',
      },
    })
    .select('id, email, full_name, dni, career')
    .single()

  assertNoError(result, 'No se pudo insertar student_records')
  cleanup.studentRecordIds.push(result.data.id)
  return result.data
}

async function insertTeacherRecord({ supabase, institutionId, workspaceKey, teacher, cleanup }) {
  const result = await supabase
    .from('teacher_records')
    .insert({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      login_email: teacher.email,
      full_name: teacher.fullName,
      first_name: teacher.firstName,
      last_name: teacher.lastName,
      dni: teacher.dni,
      phone: '',
      status: 'activo',
      raw_payload: {
        source: TEST_SOURCE,
        run_id: teacher.runId,
        note: 'Docente efimero para validar ida y vuelta alumno-docente.',
      },
    })
    .select('id, full_name, dni')
    .single()

  assertNoError(result, 'No se pudo insertar teacher_records')
  cleanup.teacherRecordIds.push(result.data.id)
  return result.data
}

async function insertTeacherAssignment({ supabase, institutionId, workspaceKey, teacherUserId, teacherRecordId, runId, cleanup }) {
  const result = await supabase
    .from('subject_teacher_assignments')
    .insert({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      subject_id: CANONICAL_SUBJECT_ID,
      program_id: CANONICAL_PROGRAM_ID,
      teacher_id: teacherUserId,
      teacher_record_id: teacherRecordId,
      source: TEST_SOURCE,
      status: 'active',
      metadata: {
        source: TEST_SOURCE,
        run_id: runId,
      },
    })
    .select('id')
    .single()

  assertNoError(result, 'No se pudo insertar subject_teacher_assignments')
  cleanup.assignmentIds.push(result.data.id)
  cleanup.auditEntityIds.push(result.data.id)
  return result.data
}

async function upsertSubjectEnrollmentFromPortal({
  supabase,
  institutionId,
  workspaceKey,
  studentUserId,
  studentRecordId,
  subjectId,
  programId,
  legacySnapshotId,
  mutationLabel,
  runId,
  cleanup,
}) {
  const result = await supabase.rpc('upsert_subject_enrollment_from_portal', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    actor_user_id: studentUserId,
    target_student_id: studentUserId,
    target_subject_id: subjectId,
    target_program_id: programId,
    target_student_record_id: studentRecordId,
    target_status: 'active',
    target_enrolled_at: new Date().toISOString(),
    target_dropped_at: null,
    target_legacy_snapshot_id: legacySnapshotId,
    target_client_mutation_id: `${TEST_SOURCE}:${runId}:${mutationLabel}`,
    target_metadata: {
      source: TEST_SOURCE,
      run_id: runId,
      mutation_label: mutationLabel,
    },
  })

  assertNoError(result, 'No se pudo ejecutar upsert_subject_enrollment_from_portal')

  const enrollment = result.data
  if (!enrollment?.id) {
    throw new Error('upsert_subject_enrollment_from_portal no devolvio id de inscripcion.')
  }

  cleanup.enrollmentIds.push(enrollment.id)
  cleanup.auditEntityIds.push(enrollment.id)
  return enrollment
}

function assertCanonicalEnrollment(enrollment, label, expectedStudentRecordId) {
  const failures = [
    ['subject_id', clean(enrollment?.subject_id) !== CANONICAL_SUBJECT_ID],
    ['program_id', clean(enrollment?.program_id) !== CANONICAL_PROGRAM_ID],
    ['student_record_id', clean(enrollment?.student_record_id) !== clean(expectedStudentRecordId)],
  ].filter(([, failed]) => failed).map(([field]) => field)

  if (failures.length === 0) return

  const error = new Error(`${label} no quedo en formato canonico compartido.`)
  error.details = {
    failures,
    expected: {
      subject_id: CANONICAL_SUBJECT_ID,
      program_id: CANONICAL_PROGRAM_ID,
      student_record_id: expectedStudentRecordId,
    },
    actual: {
      subject_id: enrollment?.subject_id ?? null,
      program_id: enrollment?.program_id ?? null,
      student_record_id: enrollment?.student_record_id ?? null,
    },
  }
  throw error
}

async function fetchSubjectRosterLikeTeacherService({ supabase, institutionId, workspaceKey, subjectId, programId }) {
  const enrollmentResult = await supabase
    .from('subject_enrollments')
    .select('id, student_id, student_record_id, subject_id, program_id, status, deleted_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('subject_id', subjectId)
    .eq('program_id', programId ?? '')
    .in('status', ['active', 'enrolled'])
    .is('deleted_at', null)

  assertNoError(enrollmentResult, 'No se pudo leer subject_enrollments como subjectRoster.js')

  const enrollments = asArray(enrollmentResult.data)
  const studentRecordIds = Array.from(new Set(
    enrollments.map((enrollment) => clean(enrollment.student_record_id)).filter(Boolean),
  ))
  const recordsById = new Map()

  if (studentRecordIds.length > 0) {
    const recordResult = await supabase
      .from('student_records')
      .select('id, full_name, dni, email')
      .in('id', studentRecordIds)

    assertNoError(recordResult, 'No se pudo leer student_records como subjectRoster.js')

    asArray(recordResult.data).forEach((record) => {
      recordsById.set(clean(record.id), record)
    })
  }

  return enrollments.map((enrollment) => {
    const record = recordsById.get(clean(enrollment.student_record_id))

    return {
      enrollmentId: clean(enrollment.id),
      studentId: clean(enrollment.student_id),
      studentRecordId: clean(enrollment.student_record_id) || null,
      fullName: clean(record?.full_name) || 'Alumno sin nombre registrado',
      dni: clean(record?.dni),
    }
  })
}

function assertRosterContains({ roster, studentUserId, studentRecord, label }) {
  const row = asArray(roster).find((candidate) => (
    clean(candidate.studentId) === clean(studentUserId) ||
    clean(candidate.studentRecordId) === clean(studentRecord.id)
  ))

  if (!row) {
    const error = new Error(`${label} no aparece en el roster docente.`)
    error.details = {
      expectedStudentId: studentUserId,
      expectedStudentRecordId: studentRecord.id,
      rosterCount: asArray(roster).length,
    }
    throw error
  }

  const missingIdentity = []
  if (clean(row.fullName) !== clean(studentRecord.full_name)) missingIdentity.push('fullName')
  if (clean(row.dni) !== clean(studentRecord.dni)) missingIdentity.push('dni')

  if (missingIdentity.length > 0) {
    const error = new Error(`${label} aparece en el roster, pero sin nombre/DNI correctos.`)
    error.details = {
      missingIdentity,
      expected: {
        fullName: studentRecord.full_name,
        dni: studentRecord.dni,
      },
      actual: {
        fullName: row.fullName,
        dni: row.dni,
      },
    }
    throw error
  }

  return row
}

function firstRpcRow(data) {
  return Array.isArray(data) ? data[0] : data
}

// Mismas RPC y parametros que src/services/subjectAttendance.js y src/services/studentGrades.js:
// el libro docente ya no escribe tablas directo (RLS lo deniega), solo via funciones seguras.
async function createClassSessionLikeTeacherService({ supabase, institutionId, workspaceKey, sessionDate, cleanup }) {
  const result = await supabase.rpc('academic_teacher_create_class_session', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
    p_subject_id: CANONICAL_SUBJECT_ID,
    p_program_id: CANONICAL_PROGRAM_ID,
    p_session_date: sessionDate,
    p_topic: 'Validacion ida y vuelta alumno-docente',
  })

  assertNoError(result, 'No se pudo crear la clase con academic_teacher_create_class_session')
  const session = firstRpcRow(result.data)
  if (!session?.id) throw new Error('academic_teacher_create_class_session no devolvio id de clase.')
  cleanup.sessionIds.push(session.id)
  cleanup.auditEntityIds.push(session.id)
  return session
}

async function saveAttendanceLikeTeacherService({ supabase, sessionId, studentUserId, subjectEnrollmentId, cleanup }) {
  const result = await supabase.rpc('academic_teacher_upsert_attendance_records', {
    p_session_id: sessionId,
    p_records: [{
      student_id: studentUserId,
      subject_enrollment_id: subjectEnrollmentId,
      status: 'present',
      observations: 'Validacion ida y vuelta alumno-docente',
    }],
  })

  assertNoError(result, 'No se pudo guardar la asistencia con academic_teacher_upsert_attendance_records')
  const record = asArray(result.data).find((row) => row?.student_id === studentUserId)
  if (!record?.id) throw new Error('academic_teacher_upsert_attendance_records no devolvio el registro del alumno.')
  cleanup.attendanceRecordIds.push(record.id)
  cleanup.auditEntityIds.push(record.id)
  return record
}

async function upsertStudentGradeLikeTeacherService({
  supabase,
  institutionId,
  workspaceKey,
  studentUserId,
  studentRecordId,
  subjectEnrollmentId,
  cleanup,
}) {
  const result = await supabase.rpc('academic_teacher_upsert_student_grade', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
    p_student_id: studentUserId,
    p_student_record_id: studentRecordId ?? null,
    p_subject_enrollment_id: subjectEnrollmentId,
    p_subject_id: CANONICAL_SUBJECT_ID,
    p_program_id: CANONICAL_PROGRAM_ID,
    p_grade_type: 'final',
    p_attempt_number: 1,
    p_grade_value: 8,
    p_academic_status: 'regular',
    p_expected_lock_version: null,
  })

  assertNoError(result, 'No se pudo guardar la nota con academic_teacher_upsert_student_grade')
  const grade = firstRpcRow(result.data)
  if (!grade?.id) throw new Error('academic_teacher_upsert_student_grade no devolvio id de nota.')
  cleanup.gradeIds.push(grade.id)
  cleanup.auditEntityIds.push(grade.id)
  return grade
}

async function fetchStudentPortalSecureSnapshotLikeModel({ supabase, institutionId, workspaceKey }) {
  const result = await supabase.rpc('get_student_portal_workspace_snapshot', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
  })

  assertNoError(result, 'No se pudo ejecutar get_student_portal_workspace_snapshot como studentPortalSecureReadModel.js')

  const row = Array.isArray(result.data) ? result.data[0] : result.data
  return {
    payload: row?.payload ?? {},
    updatedAt: row?.updated_at ?? null,
  }
}

async function readStudentSideGradeAndAttendance({
  supabase,
  institutionId,
  workspaceKey,
  studentUserId,
  sessionId,
}) {
  const gradeResult = await supabase
    .from('student_grades')
    .select('id, student_id, student_record_id, subject_enrollment_id, subject_id, program_id, grade_type, grade_value, academic_status')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('student_id', studentUserId)
    .eq('subject_id', CANONICAL_SUBJECT_ID)
    .eq('program_id', CANONICAL_PROGRAM_ID)
    .eq('grade_type', 'final')
    .eq('attempt_number', 1)
    .is('deleted_at', null)

  assertNoError(gradeResult, 'No se pudo leer student_grades con JWT de alumno')

  const attendanceResult = await supabase
    .from('subject_attendance_records')
    .select('id, session_id, student_id, subject_enrollment_id, status')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('student_id', studentUserId)
    .eq('session_id', sessionId)

  assertNoError(attendanceResult, 'No se pudo leer subject_attendance_records con JWT de alumno')

  const sessionResult = await supabase
    .from('subject_class_sessions')
    .select('id, subject_id, program_id, session_date')
    .eq('id', sessionId)
    .maybeSingle()

  assertNoError(sessionResult, 'No se pudo leer subject_class_sessions con JWT de alumno')

  return {
    grades: asArray(gradeResult.data),
    attendanceRecords: asArray(attendanceResult.data),
    classSession: sessionResult.data ?? null,
  }
}

function assertStudentSideRead({ secureSnapshot, relationalRead, studentRecord, grade, attendanceRecord }) {
  const ownStudentRows = asArray(secureSnapshot?.payload?.alumnos)
    .concat(asArray(secureSnapshot?.payload?.students))
    .filter((row) => clean(row?.id) === clean(studentRecord.id) || normalizeText(row?.email) === normalizeText(studentRecord.email))

  if (ownStudentRows.length === 0) {
    const error = new Error('La RPC segura del alumno no devolvio su fila de padron.')
    error.details = {
      expectedStudentRecordId: studentRecord.id,
      secureAlumnoCount: asArray(secureSnapshot?.payload?.alumnos).length,
      secureStudentsCount: asArray(secureSnapshot?.payload?.students).length,
    }
    throw error
  }

  const gradeVisible = asArray(relationalRead.grades).some((row) => (
    clean(row.id) === clean(grade.id) &&
    Number(row.grade_value) === Number(grade.grade_value) &&
    clean(row.academic_status) === 'regular'
  ))
  const attendanceVisible = asArray(relationalRead.attendanceRecords).some((row) => (
    clean(row.id) === clean(attendanceRecord.id) &&
    clean(row.status) === clean(attendanceRecord.status)
  ))

  if (!gradeVisible || !attendanceVisible || !relationalRead.classSession?.id) {
    const error = new Error('El alumno no puede releer la nota/asistencia cargadas por el docente.')
    error.details = {
      gradeVisible,
      attendanceVisible,
      classSessionVisible: Boolean(relationalRead.classSession?.id),
      readCounts: {
        grades: asArray(relationalRead.grades).length,
        attendanceRecords: asArray(relationalRead.attendanceRecords).length,
      },
    }
    throw error
  }
}

function removeSnapshotRowsForRun(payload, runId) {
  const nextPayload = {
    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
  }

  const snapshotArrayKeys = ['planesEstudio', 'enrollments', 'alumnos', 'students', 'grades', 'estadoAcademico', 'academicStatusRows']
  snapshotArrayKeys.forEach((key) => {
    if (!Array.isArray(nextPayload[key])) return
    nextPayload[key] = nextPayload[key].filter((row) => clean(row?.test_run_id) !== clean(runId))
  })

  return nextPayload
}

async function cleanupSnapshotRows({ supabase, institutionId, workspaceKey, runId }) {
  if (!runId) return

  const currentResult = await supabase
    .from('workspace_snapshots')
    .select('payload')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  assertNoError(currentResult, 'No se pudo leer workspace_snapshots durante limpieza')
  if (!currentResult.data) return

  const nextPayload = removeSnapshotRowsForRun(currentResult.data.payload ?? {}, runId)
  const updateResult = await supabase
    .from('workspace_snapshots')
    .update({
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  assertNoError(updateResult, 'No se pudo limpiar filas legacy de workspace_snapshots')
}

async function deleteByIds({ supabase, table, column = 'id', ids }) {
  const uniqueIds = Array.from(new Set(asArray(ids).map(clean).filter(Boolean)))
  if (uniqueIds.length === 0) return

  const result = await supabase
    .from(table)
    .delete()
    .in(column, uniqueIds)

  assertNoError(result, `No se pudo limpiar ${table}`)
}

async function cleanupTestData({ supabase, institutionId, workspaceKey, cleanup }) {
  const cleanupIssues = []
  const safe = async (label, fn) => {
    try {
      await fn()
    } catch (error) {
      cleanupIssues.push({
        label,
        error: error.message,
        details: error.details ?? null,
      })
    }
  }

  await safe('workspace_snapshots', () => cleanupSnapshotRows({
    supabase,
    institutionId,
    workspaceKey,
    runId: cleanup.snapshotRunId,
  }))
  await safe('subject_attendance_records', () => deleteByIds({ supabase, table: 'subject_attendance_records', ids: cleanup.attendanceRecordIds }))
  await safe('subject_class_sessions', () => deleteByIds({ supabase, table: 'subject_class_sessions', ids: cleanup.sessionIds }))
  await safe('student_grades', () => deleteByIds({ supabase, table: 'student_grades', ids: cleanup.gradeIds }))
  await safe('subject_enrollments', () => deleteByIds({ supabase, table: 'subject_enrollments', ids: cleanup.enrollmentIds }))
  await safe('subject_teacher_assignments', () => deleteByIds({ supabase, table: 'subject_teacher_assignments', ids: cleanup.assignmentIds }))
  await safe('student_records', () => deleteByIds({ supabase, table: 'student_records', ids: cleanup.studentRecordIds }))
  await safe('teacher_records', () => deleteByIds({ supabase, table: 'teacher_records', ids: cleanup.teacherRecordIds }))
  // academic_audit_logs existe en el schema legacy de examenes pero no en supabase/schema: solo se tolera su ausencia.
  await safe('academic_audit_logs', async () => {
    try {
      await deleteByIds({ supabase, table: 'academic_audit_logs', column: 'entity_id', ids: cleanup.auditEntityIds })
    } catch (error) {
      if (!['PGRST205', '42P01'].includes(error?.details?.code ?? error?.code)) throw error
    }
  })

  const userIds = Array.from(new Set(cleanup.authUserIds.map(clean).filter(Boolean)))
  await safe('memberships', async () => {
    if (userIds.length === 0) return
    const result = await supabase
      .from('memberships')
      .delete()
      .eq('institution_id', institutionId)
      .in('user_id', userIds)
    assertNoError(result, 'No se pudo limpiar memberships')
  })
  await safe('profiles', async () => {
    if (userIds.length === 0) return
    const result = await supabase
      .from('profiles')
      .delete()
      .in('user_id', userIds)
    assertNoError(result, 'No se pudo limpiar profiles')
  })

  for (const userId of userIds) {
    await safe(`auth.users ${userId}`, async () => {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      if (error) {
        const wrapped = new Error(error.message)
        wrapped.details = summarizeError(error)
        throw wrapped
      }
    })
  }

  return cleanupIssues
}

async function main() {
  const env = readEnvFiles()
  const logger = createStepLogger()
  const runId = makeRunId()
  const cleanup = {
    authUserIds: [],
    studentRecordIds: [],
    teacherRecordIds: [],
    assignmentIds: [],
    enrollmentIds: [],
    sessionIds: [],
    attendanceRecordIds: [],
    gradeIds: [],
    auditEntityIds: [],
    snapshotRunId: '',
  }

  let serviceSupabase = null
  let institutionId = ''
  let workspaceKey = DEFAULT_WORKSPACE_KEY
  let finalError = null
  let cleanupIssues = []

  console.log(JSON.stringify({
    script: 'validateStudentTeacherRoundTrip',
    envPresence: buildEnvPresence(env),
    serviceRoleLocalOnly: true,
  }, null, 2))

  try {
    await logger.run('Validar variables de entorno locales', async () => {
      assertRequiredEnv(env)
      return {
        summary: 'variables presentes; service_role solo en SUPABASE_SERVICE_ROLE_KEY',
      }
    })

    const supabaseUrl = pickEnv(env, 'VITE_SUPABASE_URL')
    const publishableKey = pickEnv(env, 'VITE_SUPABASE_PUBLISHABLE_KEY')
    const serviceRoleKey = pickEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
    institutionId = pickEnv(env, 'SUPABASE_TEST_INSTITUTION_ID')
    workspaceKey = pickEnv(env, 'SUPABASE_TEST_WORKSPACE_KEY') || DEFAULT_WORKSPACE_KEY
    serviceSupabase = makeSupabaseClient(supabaseUrl, serviceRoleKey)

    const context = await logger.run('Validar institucion de prueba y preparar usuarios', async () => {
      const institution = await assertInstitutionExists(serviceSupabase, institutionId)
      const teacherPassword = makePassword(runId)
      const canonicalStudentPassword = makePassword(`${runId}-canonical`)
      const legacyStudentPassword = makePassword(`${runId}-legacy`)
      const teacher = {
        runId,
        email: makeEmail({ runId, role: 'docente', label: 'teacher' }),
        fullName: 'Docente Round Trip',
        firstName: 'Docente',
        lastName: 'Round Trip',
        dni: makeDni('001'),
        password: teacherPassword,
      }
      const canonicalStudent = {
        runId,
        email: makeEmail({ runId, role: 'alumno', label: 'canonical' }),
        fullName: 'Alumno Round Trip Canonico',
        firstName: 'Alumno',
        lastName: 'Round Trip Canonico',
        dni: makeDni('002'),
        legajo: `RT-${runId}-CAN`,
        password: canonicalStudentPassword,
      }
      const legacyStudent = {
        runId,
        email: makeEmail({ runId, role: 'alumno', label: 'legacy' }),
        fullName: 'Alumno Round Trip Legacy',
        firstName: 'Alumno',
        lastName: 'Round Trip Legacy',
        dni: makeDni('003'),
        legajo: `RT-${runId}-LEG`,
        password: legacyStudentPassword,
      }

      const [teacherAuthUser, canonicalAuthUser, legacyAuthUser] = await Promise.all([
        createAuthUser({
          supabase: serviceSupabase,
          email: teacher.email,
          password: teacher.password,
          displayName: teacher.fullName,
          accountRole: 'docente',
          cleanup,
        }),
        createAuthUser({
          supabase: serviceSupabase,
          email: canonicalStudent.email,
          password: canonicalStudent.password,
          displayName: canonicalStudent.fullName,
          accountRole: 'alumno',
          cleanup,
        }),
        createAuthUser({
          supabase: serviceSupabase,
          email: legacyStudent.email,
          password: legacyStudent.password,
          displayName: legacyStudent.fullName,
          accountRole: 'alumno',
          cleanup,
        }),
      ])

      teacher.userId = teacherAuthUser.id
      canonicalStudent.userId = canonicalAuthUser.id
      legacyStudent.userId = legacyAuthUser.id

      await Promise.all([
        upsertProfileAndMembership({
          supabase: serviceSupabase,
          institutionId,
          userId: teacher.userId,
          email: teacher.email,
          displayName: teacher.fullName,
          accountRole: 'docente',
        }),
        upsertProfileAndMembership({
          supabase: serviceSupabase,
          institutionId,
          userId: canonicalStudent.userId,
          email: canonicalStudent.email,
          displayName: canonicalStudent.fullName,
          accountRole: 'alumno',
        }),
        upsertProfileAndMembership({
          supabase: serviceSupabase,
          institutionId,
          userId: legacyStudent.userId,
          email: legacyStudent.email,
          displayName: legacyStudent.fullName,
          accountRole: 'alumno',
        }),
      ])

      const [teacherRecord, canonicalStudentRecord, legacyStudentRecord] = await Promise.all([
        insertTeacherRecord({
          supabase: serviceSupabase,
          institutionId,
          workspaceKey,
          teacher,
          cleanup,
        }),
        insertStudentRecord({
          supabase: serviceSupabase,
          institutionId,
          workspaceKey,
          student: canonicalStudent,
          cleanup,
        }),
        insertStudentRecord({
          supabase: serviceSupabase,
          institutionId,
          workspaceKey,
          student: legacyStudent,
          cleanup,
        }),
      ])

      const assignment = await insertTeacherAssignment({
        supabase: serviceSupabase,
        institutionId,
        workspaceKey,
        teacherUserId: teacher.userId,
        teacherRecordId: teacherRecord.id,
        runId,
        cleanup,
      })

      const [teacherClient, canonicalStudentClient, legacyStudentClient] = await Promise.all([
        signInUser({
          supabaseUrl,
          publishableKey,
          email: teacher.email,
          password: teacher.password,
          label: 'docente',
        }),
        signInUser({
          supabaseUrl,
          publishableKey,
          email: canonicalStudent.email,
          password: canonicalStudent.password,
          label: 'alumno canonico',
        }),
        signInUser({
          supabaseUrl,
          publishableKey,
          email: legacyStudent.email,
          password: legacyStudent.password,
          label: 'alumno legacy',
        }),
      ])

      return {
        summary: `institucion=${institution.slug || institution.name || institution.id}, workspace=${workspaceKey}`,
        teacher,
        canonicalStudent,
        legacyStudent,
        teacherRecord,
        canonicalStudentRecord,
        legacyStudentRecord,
        assignment,
        teacherClient,
        canonicalStudentClient,
        legacyStudentClient,
      }
    })

    const canonicalEnrollment = await logger.run('Inscribir alumno con IDs canonicos desde RPC del portal', async () => {
      // La RPC exige auth.uid() = alumno (fix P1 identity binding): se llama con la sesion del alumno.
      const enrollment = await upsertSubjectEnrollmentFromPortal({
        supabase: context.canonicalStudentClient,
        institutionId,
        workspaceKey,
        studentUserId: context.canonicalStudent.userId,
        studentRecordId: context.canonicalStudentRecord.id,
        subjectId: CANONICAL_SUBJECT_ID,
        programId: CANONICAL_PROGRAM_ID,
        legacySnapshotId: `${TEST_SOURCE}:${runId}:canonical`,
        mutationLabel: 'canonical',
        runId,
        cleanup,
      })

      assertCanonicalEnrollment(enrollment, 'La inscripcion canonica', context.canonicalStudentRecord.id)

      return {
        summary: `${enrollment.subject_id} / ${enrollment.program_id}, con student_record_id`,
        enrollment,
      }
    })

    await logger.run('Leer roster docente por el camino de subjectRoster.js', async () => {
      const roster = await fetchSubjectRosterLikeTeacherService({
        supabase: context.teacherClient,
        institutionId,
        workspaceKey,
        subjectId: CANONICAL_SUBJECT_ID,
        programId: CANONICAL_PROGRAM_ID,
      })

      assertRosterContains({
        roster,
        studentUserId: context.canonicalStudent.userId,
        studentRecord: context.canonicalStudentRecord,
        label: 'El alumno canonico',
      })

      return {
        summary: `roster=${roster.length}, alumno canonico con nombre y DNI`,
        roster,
      }
    })

    const teacherWrites = await logger.run('Cargar asistencia y nota como docente, releer como alumno', async () => {
      const sessionDate = new Date().toISOString().slice(0, 10)
      const classSession = await createClassSessionLikeTeacherService({
        supabase: context.teacherClient,
        institutionId,
        workspaceKey,
        teacherUserId: context.teacher.userId,
        sessionDate,
        cleanup,
      })
      const attendanceRecord = await saveAttendanceLikeTeacherService({
        supabase: context.teacherClient,
        institutionId,
        workspaceKey,
        sessionId: classSession.id,
        studentUserId: context.canonicalStudent.userId,
        subjectEnrollmentId: canonicalEnrollment.enrollment.id,
        cleanup,
      })
      const grade = await upsertStudentGradeLikeTeacherService({
        supabase: context.teacherClient,
        institutionId,
        workspaceKey,
        studentUserId: context.canonicalStudent.userId,
        studentRecordId: context.canonicalStudentRecord.id,
        subjectEnrollmentId: canonicalEnrollment.enrollment.id,
        teacherUserId: context.teacher.userId,
        cleanup,
      })
      const secureSnapshot = await fetchStudentPortalSecureSnapshotLikeModel({
        supabase: context.canonicalStudentClient,
        institutionId,
        workspaceKey,
      })
      const relationalRead = await readStudentSideGradeAndAttendance({
        supabase: context.canonicalStudentClient,
        institutionId,
        workspaceKey,
        studentUserId: context.canonicalStudent.userId,
        sessionId: classSession.id,
      })

      assertStudentSideRead({
        secureSnapshot,
        relationalRead,
        studentRecord: context.canonicalStudentRecord,
        grade,
        attendanceRecord,
      })

      return {
        summary: `asistencia=${attendanceRecord.status}, nota=${grade.grade_value}, condicion=${grade.academic_status}`,
        classSession,
        attendanceRecord,
        grade,
      }
    })

  } catch (error) {
    finalError = error
  } finally {
    if (serviceSupabase) {
      cleanupIssues = await cleanupTestData({
        supabase: serviceSupabase,
        institutionId,
        workspaceKey,
        cleanup,
      })
    }
  }

  const ok = !finalError && cleanupIssues.length === 0
  console.log(JSON.stringify({
    ok,
    error: finalError
      ? {
          message: finalError.message,
          details: finalError.details ?? null,
        }
      : null,
    steps: logger.steps.map((step) => ({
      label: step.label,
      status: step.ok ? 'OK' : 'FALLA',
      summary: step.details?.summary ?? step.error ?? null,
    })),
    cleanup: cleanupIssues.length === 0 ? 'OK' : cleanupIssues,
  }, null, 2))

  if (finalError || cleanupIssues.length > 0) {
    process.exitCode = 1
  }
}

main()
