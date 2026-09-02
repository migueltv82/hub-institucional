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
const LEGACY_SUBJECT_ID = 'profesorado-de-ingles:ing08'
const LEGACY_PROGRAM_ID = 'profesorado-de-ingles'

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

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general'
}

function sameIdentity(left, right) {
  const leftValue = clean(left)
  const rightValue = clean(right)

  return Boolean(
    leftValue &&
    rightValue &&
    (
      leftValue === rightValue ||
      normalizeText(leftValue) === normalizeText(rightValue) ||
      slugify(leftValue) === slugify(rightValue)
    ),
  )
}

function getFirst(row, keys) {
  if (!row || typeof row !== 'object') return ''

  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && clean(value) !== '') return value
  }

  return ''
}

function subjectIdFor(programId, subjectId) {
  return `${slugify(programId)}:${slugify(subjectId)}`
}

function getCareer(row) {
  return clean(getFirst(row, ['carrera', 'programa', 'program', 'program_name', 'career']))
}

function getSubjectCode(row) {
  return clean(getFirst(row, ['materia', 'code', 'codigo', 'subject_code', 'subject_id']))
}

function getSubjectName(row) {
  return clean(getFirst(row, ['nombre', 'nombremateria', 'name', 'subject_name'])) || getSubjectCode(row)
}

function getSubjectCanonicalId(subject) {
  return clean(
    subject?.canonical_subject_id ||
    subject?.relational_subject_id ||
    subject?.subject_id ||
    subject?.code ||
    subject?.codigo ||
    subject?.materia,
  )
}

function getSubjectPortalId(subject) {
  return clean(subject?.portal_subject_id || subject?.id)
}

function getSubjectProgramId(subject) {
  return clean(
    subject?.canonical_program_id ||
    subject?.program_id ||
    subject?.carrera ||
    subject?.career,
  )
}

function getPlanCareers(plans) {
  const byKey = new Map()

  asArray(plans).forEach((row) => {
    const career = getCareer(row)
    const key = normalizeText(career)
    if (!career || !key || byKey.has(key)) return
    byKey.set(key, career)
  })

  return Array.from(byKey.values())
}

function resolveCareerAgainstPlan(rawCareer, planCareers = []) {
  const cleanedCareer = clean(rawCareer)
  if (!cleanedCareer) return ''

  const normalizedCareer = normalizeText(cleanedCareer)
  const careerSlug = slugify(cleanedCareer)
  if (!normalizedCareer) return cleanedCareer

  const exactMatch = planCareers.find((career) => (
    normalizeText(career) === normalizedCareer ||
    slugify(career) === careerSlug
  ))
  if (exactMatch) return exactMatch

  const partialMatches = planCareers.filter((career) => {
    const normalizedPlanCareer = normalizeText(career)
    const planCareerSlug = slugify(career)
    return (
      normalizedPlanCareer.includes(normalizedCareer) ||
      normalizedCareer.includes(normalizedPlanCareer) ||
      planCareerSlug.includes(careerSlug) ||
      careerSlug.includes(planCareerSlug)
    )
  })

  if (partialMatches.length === 1) return partialMatches[0]
  return cleanedCareer
}

function buildSubjects(plans, selectedCareer, planCareers = []) {
  return asArray(plans)
    .filter((row) => {
      if (!selectedCareer) return true
      const resolvedCareer = resolveCareerAgainstPlan(getCareer(row), planCareers) || getCareer(row)
      return sameIdentity(resolvedCareer, selectedCareer)
    })
    .map((row) => {
      const programId = resolveCareerAgainstPlan(getCareer(row), planCareers) || selectedCareer || 'Carrera general'
      const subjectCode = getSubjectCode(row)
      const subjectName = getSubjectName(row)
      const canonicalSubjectId = subjectCode || subjectName

      return {
        id: subjectIdFor(programId, canonicalSubjectId),
        portal_subject_id: subjectIdFor(programId, canonicalSubjectId),
        subject_id: canonicalSubjectId,
        canonical_subject_id: canonicalSubjectId,
        program_id: programId,
        canonical_program_id: programId,
        carrera: programId,
        code: canonicalSubjectId,
        name: subjectName || canonicalSubjectId || 'Materia sin nombre',
      }
    })
}

function findSubject(subjects, programId, subjectId) {
  const wantedSubjectId = clean(subjectId)
  if (!wantedSubjectId) return null

  return asArray(subjects).find((subject) => {
    const sameProgram = !programId || sameIdentity(getSubjectProgramId(subject), programId) || sameIdentity(subject.carrera, programId)
    const sameSubject = [
      getSubjectPortalId(subject),
      getSubjectCanonicalId(subject),
      subject.code,
      subject.name,
    ].some((value) => sameIdentity(value, wantedSubjectId))

    return sameProgram && sameSubject
  }) ?? null
}

function getRowSubjectId(row) {
  return clean(
    row?.subject_id ||
    row?.canonical_subject_id ||
    row?.relational_subject_id ||
    row?.subject?.canonical_subject_id ||
    row?.subject?.subject_id ||
    row?.subject?.code ||
    row?.subject?.id,
  )
}

function getRowProgramId(row) {
  return clean(
    row?.program_id ||
    row?.canonical_program_id ||
    row?.subject?.canonical_program_id ||
    row?.subject?.program_id ||
    row?.subject?.carrera ||
    row?.carrera,
  )
}

function matchesStudent(row, user) {
  if (!row || typeof row !== 'object') return false

  const email = getFirst(row, ['email', 'correo', 'mail'])
  const userId = getFirst(row, ['user_id', 'profile_id', 'student_id', 'id'])

  return (
    (email && normalizeText(email) === normalizeText(user?.email)) ||
    (userId && clean(userId) === clean(user?.id))
  )
}

function resolveEnrollmentSubject(row, subjects, selectedCareer, planCareers = []) {
  const subjectId = getRowSubjectId(row)
  if (subjectId) {
    const rowProgram = resolveCareerAgainstPlan(getRowProgramId(row), planCareers) || selectedCareer
    const subject = findSubject(subjects, rowProgram, subjectId)
    if (subject) return subject
  }

  const rowProgram = resolveCareerAgainstPlan(getCareer(row), planCareers) || selectedCareer
  return findSubject(subjects, rowProgram, getSubjectCode(row)) ||
    findSubject(subjects, rowProgram, getSubjectName(row)) ||
    row?.subject ||
    null
}

function normalizeLegacyEnrollmentFromSecureSnapshot({ snapshot, user, enrollmentId }) {
  const planCareers = getPlanCareers(snapshot?.planesEstudio)
  const selectedCareer = resolveCareerAgainstPlan(CANONICAL_PROGRAM_ID, planCareers) || CANONICAL_PROGRAM_ID
  const subjects = buildSubjects(snapshot?.planesEstudio, selectedCareer, planCareers)
  const row = asArray(snapshot?.enrollments).find((candidate) => clean(candidate?.id) === clean(enrollmentId))

  if (!row) {
    const error = new Error('La RPC segura no devolvio la fila legacy esperada para el alumno.')
    error.details = {
      enrollmentId,
      secureEnrollmentCount: asArray(snapshot?.enrollments).length,
    }
    throw error
  }

  if (!matchesStudent(row, user)) {
    const error = new Error('La fila legacy devuelta por la RPC segura no corresponde al alumno de prueba.')
    error.details = {
      enrollmentId,
      userId: user?.id,
      userEmail: user?.email,
    }
    throw error
  }

  const rawSubjectId = getRowSubjectId(row)
  const rawProgramId = getRowProgramId(row)
  const subject = resolveEnrollmentSubject(row, subjects, selectedCareer, planCareers)
  const canonicalProgramFromRow = resolveCareerAgainstPlan(rawProgramId, planCareers)
  const normalizedSubjectId = getSubjectCanonicalId(subject) || rawSubjectId
  const normalizedProgramId = getSubjectProgramId(subject) || canonicalProgramFromRow || rawProgramId || selectedCareer
  const portalSubjectId = getSubjectPortalId(subject) || (rawSubjectId.includes(':') ? rawSubjectId : '')

  return {
    raw: {
      subjectId: rawSubjectId,
      programId: rawProgramId,
    },
    normalized: {
      subjectId: normalizedSubjectId,
      programId: normalizedProgramId,
      portalSubjectId,
    },
  }
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

async function createClassSessionLikeTeacherService({ supabase, institutionId, workspaceKey, teacherUserId, sessionDate, cleanup }) {
  const result = await supabase
    .from('subject_class_sessions')
    .insert({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      subject_id: CANONICAL_SUBJECT_ID,
      program_id: CANONICAL_PROGRAM_ID,
      teacher_id: teacherUserId,
      session_date: sessionDate,
      topic: 'Validacion ida y vuelta alumno-docente',
    })
    .select('id, session_date')
    .single()

  assertNoError(result, 'No se pudo crear subject_class_sessions como subjectAttendance.js')
  cleanup.sessionIds.push(result.data.id)
  cleanup.auditEntityIds.push(result.data.id)
  return result.data
}

async function saveAttendanceLikeTeacherService({
  supabase,
  institutionId,
  workspaceKey,
  sessionId,
  studentUserId,
  subjectEnrollmentId,
  cleanup,
}) {
  const result = await supabase
    .from('subject_attendance_records')
    .upsert([{
      session_id: sessionId,
      institution_id: institutionId,
      workspace_key: workspaceKey,
      student_id: studentUserId,
      subject_enrollment_id: subjectEnrollmentId,
      status: 'present',
      observations: 'Validacion ida y vuelta alumno-docente',
    }], { onConflict: 'session_id,student_id' })
    .select('id, status')
    .single()

  assertNoError(result, 'No se pudo guardar subject_attendance_records como subjectAttendance.js')
  cleanup.attendanceRecordIds.push(result.data.id)
  cleanup.auditEntityIds.push(result.data.id)
  return result.data
}

async function upsertStudentGradeLikeTeacherService({
  supabase,
  institutionId,
  workspaceKey,
  studentUserId,
  studentRecordId,
  subjectEnrollmentId,
  teacherUserId,
  cleanup,
}) {
  const existingResult = await supabase
    .from('student_grades')
    .select('id, lock_version')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('student_id', studentUserId)
    .eq('subject_id', CANONICAL_SUBJECT_ID)
    .eq('program_id', CANONICAL_PROGRAM_ID)
    .eq('grade_type', 'final')
    .eq('attempt_number', 1)
    .is('deleted_at', null)
    .limit(1)

  assertNoError(existingResult, 'No se pudo leer student_grades antes de upsert')

  const existing = asArray(existingResult.data)[0]
  if (!existing) {
    const insertResult = await supabase
      .from('student_grades')
      .insert({
        institution_id: institutionId,
        workspace_key: workspaceKey,
        student_id: studentUserId,
        student_record_id: studentRecordId,
        subject_enrollment_id: subjectEnrollmentId,
        subject_id: CANONICAL_SUBJECT_ID,
        program_id: CANONICAL_PROGRAM_ID,
        teacher_id: teacherUserId,
        grade_type: 'final',
        attempt_number: 1,
        grade_value: 8,
        grade_scale: 'numeric_0_10',
        academic_status: 'regular',
        observations: 'Validacion ida y vuelta alumno-docente',
        client_mutation_id: `${TEST_SOURCE}:${subjectEnrollmentId}:grade`,
        metadata: {
          source: TEST_SOURCE,
          subject_enrollment_id: subjectEnrollmentId,
        },
      })
      .select('id, grade_value, academic_status')
      .single()

    assertNoError(insertResult, 'No se pudo insertar student_grades como studentGrades.js')
    cleanup.gradeIds.push(insertResult.data.id)
    cleanup.auditEntityIds.push(insertResult.data.id)
    return insertResult.data
  }

  const updateResult = await supabase
    .from('student_grades')
    .update({
      grade_value: 8,
      teacher_id: teacherUserId,
      student_record_id: studentRecordId,
      subject_enrollment_id: subjectEnrollmentId,
      academic_status: 'regular',
    })
    .eq('id', existing.id)
    .eq('lock_version', existing.lock_version)
    .select('id, grade_value, academic_status')
    .single()

  assertNoError(updateResult, 'No se pudo actualizar student_grades como studentGrades.js')
  cleanup.gradeIds.push(updateResult.data.id)
  cleanup.auditEntityIds.push(updateResult.data.id)
  return updateResult.data
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

function buildSnapshotTestRows({ runId, legacyStudent, legacyRecord }) {
  const planRow = {
    id: `${TEST_SOURCE}:${runId}:plan`,
    test_run_id: runId,
    source: TEST_SOURCE,
    carrera: CANONICAL_PROGRAM_ID,
    program_id: CANONICAL_PROGRAM_ID,
    materia: CANONICAL_SUBJECT_ID,
    codigo: CANONICAL_SUBJECT_ID,
    nombre: 'Idioma Ingles VIII',
    anio: 4,
  }
  const legacyEnrollmentId = `${TEST_SOURCE}:${runId}:legacy-enrollment`
  const legacyEnrollmentRow = {
    id: legacyEnrollmentId,
    test_run_id: runId,
    source: TEST_SOURCE,
    email: legacyStudent.email,
    student_id: legacyStudent.userId,
    profile_id: legacyStudent.userId,
    student_record_id: legacyRecord.id,
    subject_id: LEGACY_SUBJECT_ID,
    program_id: LEGACY_PROGRAM_ID,
    carrera: LEGACY_PROGRAM_ID,
    status: 'cursando',
  }
  const legacyStudentRow = {
    id: legacyRecord.id,
    test_run_id: runId,
    source: TEST_SOURCE,
    user_id: legacyStudent.userId,
    profile_id: legacyStudent.userId,
    email: legacyStudent.email,
    full_name: legacyStudent.fullName,
    dni: legacyStudent.dni,
    carrera: CANONICAL_PROGRAM_ID,
  }

  return {
    legacyEnrollmentId,
    rows: {
      planesEstudio: [planRow],
      enrollments: [legacyEnrollmentRow],
      alumnos: [legacyStudentRow],
      students: [legacyStudentRow],
    },
  }
}

function appendSnapshotRows(payload, rowsByKey) {
  const nextPayload = {
    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
  }

  Object.entries(rowsByKey).forEach(([key, rows]) => {
    const existingRows = asArray(nextPayload[key]).filter((row) => clean(row?.test_run_id) !== clean(rows[0]?.test_run_id))
    nextPayload[key] = existingRows.concat(rows)
  })

  return nextPayload
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

async function appendLegacyRowsToWorkspaceSnapshot({ supabase, institutionId, workspaceKey, ownerUserId, ownerEmail, runId, legacyStudent, legacyRecord, cleanup }) {
  const existingResult = await supabase
    .from('workspace_snapshots')
    .select('institution_id, workspace_key, owner_user_id, owner_email, payload')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  assertNoError(existingResult, 'No se pudo leer workspace_snapshots para preparar caso legacy')

  const { legacyEnrollmentId, rows } = buildSnapshotTestRows({
    runId,
    legacyStudent,
    legacyRecord,
  })
  const nextPayload = appendSnapshotRows(existingResult.data?.payload ?? {}, rows)

  const upsertResult = await supabase
    .from('workspace_snapshots')
    .upsert({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      owner_user_id: existingResult.data?.owner_user_id ?? ownerUserId,
      owner_email: existingResult.data?.owner_email ?? ownerEmail,
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'institution_id,workspace_key' })
    .select('institution_id')
    .single()

  assertNoError(upsertResult, 'No se pudo actualizar workspace_snapshots para caso legacy')
  cleanup.snapshotRunId = runId

  return { legacyEnrollmentId }
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
  await safe('academic_audit_logs', () => deleteByIds({ supabase, table: 'academic_audit_logs', column: 'entity_id', ids: cleanup.auditEntityIds }))

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
      const enrollment = await upsertSubjectEnrollmentFromPortal({
        supabase: serviceSupabase,
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

    await logger.run('Normalizar fila legacy slug y verificarla en roster docente', async () => {
      const { legacyEnrollmentId } = await appendLegacyRowsToWorkspaceSnapshot({
        supabase: serviceSupabase,
        institutionId,
        workspaceKey,
        ownerUserId: context.teacher.userId,
        ownerEmail: context.teacher.email,
        runId,
        legacyStudent: context.legacyStudent,
        legacyRecord: context.legacyStudentRecord,
        cleanup,
      })
      const secureSnapshot = await fetchStudentPortalSecureSnapshotLikeModel({
        supabase: context.legacyStudentClient,
        institutionId,
        workspaceKey,
      })
      const normalized = normalizeLegacyEnrollmentFromSecureSnapshot({
        snapshot: secureSnapshot.payload,
        user: {
          id: context.legacyStudent.userId,
          email: context.legacyStudent.email,
        },
        enrollmentId: legacyEnrollmentId,
      })

      if (normalized.raw.subjectId !== LEGACY_SUBJECT_ID) {
        const error = new Error('El caso legacy no partio de la fila slug esperada.')
        error.details = {
          expectedLegacySubjectId: LEGACY_SUBJECT_ID,
          actualRawSubjectId: normalized.raw.subjectId,
        }
        throw error
      }

      if (normalized.normalized.subjectId !== CANONICAL_SUBJECT_ID || normalized.normalized.programId !== CANONICAL_PROGRAM_ID) {
        const error = new Error('La fila legacy no normalizo a subject_id/program_id canonicos.')
        error.details = {
          raw: normalized.raw,
          normalized: normalized.normalized,
          expected: {
            subjectId: CANONICAL_SUBJECT_ID,
            programId: CANONICAL_PROGRAM_ID,
          },
        }
        throw error
      }

      const legacyEnrollment = await upsertSubjectEnrollmentFromPortal({
        supabase: serviceSupabase,
        institutionId,
        workspaceKey,
        studentUserId: context.legacyStudent.userId,
        studentRecordId: context.legacyStudentRecord.id,
        subjectId: normalized.normalized.subjectId,
        programId: normalized.normalized.programId,
        legacySnapshotId: legacyEnrollmentId,
        mutationLabel: 'legacy-normalized',
        runId,
        cleanup,
      })

      assertCanonicalEnrollment(legacyEnrollment, 'La inscripcion legacy normalizada', context.legacyStudentRecord.id)

      const roster = await fetchSubjectRosterLikeTeacherService({
        supabase: context.teacherClient,
        institutionId,
        workspaceKey,
        subjectId: CANONICAL_SUBJECT_ID,
        programId: CANONICAL_PROGRAM_ID,
      })

      assertRosterContains({
        roster,
        studentUserId: context.legacyStudent.userId,
        studentRecord: context.legacyStudentRecord,
        label: 'El alumno legacy normalizado',
      })

      return {
        summary: `${LEGACY_SUBJECT_ID} -> ${legacyEnrollment.subject_id} / ${legacyEnrollment.program_id}; roster=${roster.length}`,
        legacyEnrollment,
        teacherWrites: {
          classSessionId: teacherWrites.classSession.id,
          gradeId: teacherWrites.grade.id,
        },
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
