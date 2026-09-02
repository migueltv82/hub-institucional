import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTeacherSourceReadiness } from '../src/components/generadorCronograma/derivedState.js'
import { buildWorkspaceSnapshotFromRelationalData } from '../src/utils/examEngine/supabaseAudit/relationalWorkspaceSnapshot.js'

const TEST_SOURCE = 'codex_teacher_academic_validation'
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
const VALID_TEACHER_ACADEMIC_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DRAFT'])
const VALID_TEACHER_ROLES = new Set(['TITULAR', 'CO_DOCENTE', 'AUXILIAR', 'SUPLENTE', 'REEMPLAZO'])

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeTeacherAcademicStatus(value) {
  const normalized = clean(value || 'ACTIVE').toUpperCase()
  return VALID_TEACHER_ACADEMIC_STATUSES.has(normalized) ? normalized : 'ACTIVE'
}

function normalizeTeacherRole(value) {
  const normalized = clean(value || 'TITULAR').toUpperCase().replace(/[\s-]+/g, '_')
  return VALID_TEACHER_ROLES.has(normalized) ? normalized : 'TITULAR'
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

function getTeacherDisplayName(teacherRecord = {}) {
  return clean(
    teacherRecord.display_name ||
    teacherRecord.teacher_display_name ||
    teacherRecord.full_name ||
    teacherRecord.name ||
    [teacherRecord.first_name, teacherRecord.last_name].map(clean).filter(Boolean).join(' ') ||
    'Docente Validacion Supabase',
  )
}

function assertTeacherDisplayName(teacherRecord, context) {
  const teacherDisplayName = getTeacherDisplayName(teacherRecord)
  if (teacherDisplayName) return teacherDisplayName

  const error = new Error(`No se puede ${context}: falta teacher_display_name normalizable para el docente de prueba.`)
  error.details = {
    missingField: 'teacher_display_name',
    hasTeacherRecordId: Boolean(clean(teacherRecord?.id)),
    hasFullName: Boolean(clean(teacherRecord?.full_name)),
    hasDisplayName: Boolean(clean(teacherRecord?.display_name || teacherRecord?.teacher_display_name)),
  }
  throw error
}

function assertWorkloadPayload(payload) {
  const missingFields = [
    ['teacher_display_name', !clean(payload.teacher_display_name)],
    ['career_name', !clean(payload.career_name)],
    ['subject_name', !clean(payload.subject_name)],
    ['teaching_hours', Number(payload.teaching_hours) <= 0],
  ].filter(([, missing]) => missing).map(([field]) => field)

  if (missingFields.length === 0) return

  const error = new Error(`No se puede insertar teacher_workload_records: faltan campos requeridos antes del upsert.`)
  error.details = {
    missingFields,
    hasTeacherRecordId: Boolean(clean(payload.teacher_record_id)),
    hasSubjectId: Boolean(clean(payload.subject_id)),
  }
  throw error
}

function assertNoError(result, label) {
  if (result.error) {
    const error = new Error(`${label}: ${result.error.message}`)
    error.details = summarizeError(result.error)
    throw error
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

async function getOrCreateTeacherRecord({ supabase, institutionId, workspaceKey }) {
  const dni = '99945001'
  const existing = await supabase
    .from('teacher_records')
    .select('id, full_name, first_name, last_name, dni')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('dni', dni)
    .maybeSingle()

  assertNoError(existing, 'No se pudo leer teacher_records')
  if (existing.data?.id) return existing.data

  const inserted = await supabase
    .from('teacher_records')
    .insert({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      login_email: `validacion.${dni}@docentes.${institutionId}.local`,
      full_name: 'Docente Validacion Supabase',
      first_name: 'Docente',
      last_name: 'Validacion Supabase',
      dni,
      phone: '',
      status: 'activo',
      raw_payload: {
        source: TEST_SOURCE,
        note: 'Docente de prueba creado para validar disponibilidad/carga horaria relacional.',
      },
    })
    .select('id, full_name, first_name, last_name, dni')
    .single()

  assertNoError(inserted, 'No se pudo insertar teacher_records')
  return inserted.data
}

async function upsertAvailability({ supabase, institutionId, workspaceKey, teacher }) {
  const teacherDisplayName = assertTeacherDisplayName(teacher, 'insertar teacher_availability_records')
  const payload = {
    institution_id: institutionId,
    workspace_key: workspaceKey,
    teacher_record_id: teacher.id,
    teacher_identity: teacher.id,
    teacher_display_name: teacherDisplayName,
    teacher_name: teacherDisplayName,
    teacher_dni: teacher.dni,
    day_of_week: 'LUNES',
    shift: 'NOCHE',
    start_time: '18:00',
    end_time: '20:00',
    is_available: true,
    reason: 'Validacion real Supabase',
    status: normalizeTeacherAcademicStatus('active'),
    valid_from: '2026-07-01',
    valid_until: '2026-12-31',
    source: TEST_SOURCE,
    raw_payload: { source: TEST_SOURCE },
  }

  const result = await supabase
    .from('teacher_availability_records')
    .upsert(payload, {
      onConflict: 'institution_id,workspace_key,teacher_identity,day_of_week,shift,start_time,end_time,valid_from,valid_until',
    })
    .select('*')
    .single()

  assertNoError(result, 'No se pudo upsert teacher_availability_records')
  return result.data
}

async function upsertWorkload({ supabase, institutionId, workspaceKey, teacher }) {
  const teacherDisplayName = assertTeacherDisplayName(teacher, 'insertar teacher_workload_records')
  const careerName = 'Validacion Carrera'
  const subjectName = 'Validacion Supabase I'
  const payload = {
    institution_id: institutionId,
    workspace_key: workspaceKey,
    teacher_record_id: teacher.id,
    teacher_identity: teacher.id,
    teacher_display_name: teacherDisplayName,
    teacher_name: teacherDisplayName,
    teacher_dni: teacher.dni,
    program_id: careerName,
    career_name: careerName,
    plan_id: '2026',
    subject_id: 'VAL-SUPA-1',
    subject_name: subjectName,
    academic_year: '1',
    role: normalizeTeacherRole('titular'),
    titularity: normalizeTeacherRole('titular'),
    teaching_hours: 4,
    status: normalizeTeacherAcademicStatus('active'),
    valid_from: '2026-07-01',
    valid_until: '2026-12-31',
    source: TEST_SOURCE,
    raw_payload: { source: TEST_SOURCE },
  }

  assertWorkloadPayload(payload)

  const result = await supabase
    .from('teacher_workload_records')
    .upsert(payload, {
      onConflict: 'institution_id,workspace_key,teacher_identity,program_id,plan_id,subject_id,valid_from,valid_until',
    })
    .select('*')
    .single()

  assertNoError(result, 'No se pudo upsert teacher_workload_records')
  return result.data
}

async function readValidationRows({ supabase, institutionId, workspaceKey }) {
  const [teacherRecords, availability, workload] = await Promise.all([
    supabase
      .from('teacher_records')
      .select('id, login_email, full_name, first_name, last_name, dni, phone, status, raw_payload')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .eq('raw_payload->>source', TEST_SOURCE),
    supabase
      .from('teacher_availability_records')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .eq('source', TEST_SOURCE),
    supabase
      .from('teacher_workload_records')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .eq('source', TEST_SOURCE),
  ])

  assertNoError(teacherRecords, 'No se pudo leer teacher_records')
  assertNoError(availability, 'No se pudo leer teacher_availability_records')
  assertNoError(workload, 'No se pudo leer teacher_workload_records')

  return {
    teacherRecords: teacherRecords.data ?? [],
    availability: availability.data ?? [],
    workload: workload.data ?? [],
  }
}

function auditRows({ availability, workload }) {
  const availabilityTeachers = new Set(availability.map((row) => clean(row.teacher_identity)).filter(Boolean))
  const workloadTeachers = new Set(workload.map((row) => clean(row.teacher_identity)).filter(Boolean))
  const availabilityKeys = availability.map((row) => [
    row.teacher_identity,
    row.day_of_week,
    row.shift,
    row.start_time,
    row.end_time,
    row.valid_from,
    row.valid_until,
  ].join('::'))
  const workloadKeys = workload.map((row) => [
    row.teacher_identity,
    row.program_id,
    row.plan_id,
    row.subject_id,
    row.valid_from,
    row.valid_until,
  ].join('::'))

  return {
    duplicates: {
      availability: availabilityKeys.length - new Set(availabilityKeys).size,
      workload: workloadKeys.length - new Set(workloadKeys).size,
    },
    incomplete: {
      availability: availability.filter((row) => !clean(row.teacher_identity) || !clean(row.day_of_week) || !clean(row.start_time) || !clean(row.end_time)).length,
      workload: workload.filter((row) => !clean(row.teacher_identity) || !clean(row.program_id) || !clean(row.subject_id) || Number(row.teaching_hours) <= 0).length,
    },
    missingCrossData: {
      workloadWithoutAvailability: [...workloadTeachers].filter((teacherId) => !availabilityTeachers.has(teacherId)),
      availabilityWithoutWorkload: [...availabilityTeachers].filter((teacherId) => !workloadTeachers.has(teacherId)),
    },
  }
}

async function main() {
  const fileEnv = readEnvFiles()
  assertRequiredEnv(fileEnv)

  const supabaseUrl = pickEnv(fileEnv, 'VITE_SUPABASE_URL')
  const publishableKeyPresent = Boolean(pickEnv(fileEnv, 'VITE_SUPABASE_PUBLISHABLE_KEY'))
  const supabaseKey = pickEnv(fileEnv, 'SUPABASE_SERVICE_ROLE_KEY')
  const workspaceKey = pickEnv(fileEnv, 'SUPABASE_TEST_WORKSPACE_KEY') || DEFAULT_WORKSPACE_KEY
  const requestedInstitutionId = pickEnv(fileEnv, 'SUPABASE_TEST_INSTITUTION_ID')

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  const institution = await assertInstitutionExists(supabase, requestedInstitutionId)
  const institutionId = institution.id
  const teacher = await getOrCreateTeacherRecord({ supabase, institutionId, workspaceKey })
  const createdAvailability = await upsertAvailability({ supabase, institutionId, workspaceKey, teacher })
  const createdWorkload = await upsertWorkload({ supabase, institutionId, workspaceKey, teacher })
  const readRows = await readValidationRows({ supabase, institutionId, workspaceKey })
  const relationalSnapshot = buildWorkspaceSnapshotFromRelationalData({
    teacherRecords: readRows.teacherRecords,
    teacherAvailabilityRecords: readRows.availability,
    teacherWorkloadRecords: readRows.workload,
    auditConfig: { workspaceKey },
  })
  const teacherSourceReadiness = getTeacherSourceReadiness({
    docentes: relationalSnapshot.snapshot.docentes,
    disponibilidadDocente: relationalSnapshot.snapshot.disponibilidadDocente,
    cargaHorariaDocente: relationalSnapshot.snapshot.cargaHorariaDocente,
    horariosDocentes: relationalSnapshot.snapshot.horariosDocentes,
  })

  console.log(JSON.stringify({
    ok: true,
    source: TEST_SOURCE,
    envPresence: {
      ...buildEnvPresence(fileEnv),
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKeyPresent,
    },
    institution: {
      id: institution.id,
      name: institution.name ?? null,
      slug: institution.slug ?? null,
    },
    workspaceKey,
    created: {
      teacherRecord: {
        id: teacher.id,
        full_name: getTeacherDisplayName(teacher),
        dni: teacher.dni,
      },
      availability: {
        id: createdAvailability.id,
        teacher_identity: createdAvailability.teacher_identity,
        day_of_week: createdAvailability.day_of_week,
        start_time: createdAvailability.start_time,
        end_time: createdAvailability.end_time,
      },
      workload: {
        id: createdWorkload.id,
        teacher_identity: createdWorkload.teacher_identity,
        program_id: createdWorkload.program_id,
        subject_id: createdWorkload.subject_id,
        teaching_hours: createdWorkload.teaching_hours,
      },
    },
    readCounts: {
      teacherRecords: readRows.teacherRecords.length,
      availability: readRows.availability.length,
      workload: readRows.workload.length,
    },
    audit: auditRows(readRows),
    relationalSnapshot: {
      disponibilidadDocente: relationalSnapshot.snapshot.disponibilidadDocente.length,
      cargaHorariaDocente: relationalSnapshot.snapshot.cargaHorariaDocente.length,
      docentes: relationalSnapshot.snapshot.docentes.length,
      diagnostics: relationalSnapshot.diagnostics.counts,
    },
    teacherSourceReadiness: {
      source: teacherSourceReadiness.source,
      hasStructuredTeacherSource: teacherSourceReadiness.hasStructuredTeacherSource,
      hasLegacyTeacherScheduleSource: teacherSourceReadiness.hasLegacyTeacherScheduleSource,
      hasValidTeacherSource: teacherSourceReadiness.hasValidTeacherSource,
      message: teacherSourceReadiness.message,
      warnings: teacherSourceReadiness.warnings,
    },
  }, null, 2))
}

main().catch((error) => {
  const fileEnv = readEnvFiles()
  console.error(JSON.stringify({
    ok: false,
    message: error.message,
    envPresence: buildEnvPresence(fileEnv),
    details: error.details ?? null,
  }, null, 2))
  process.exitCode = 1
})
