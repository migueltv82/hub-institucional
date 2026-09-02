import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { getCareerValues, getPrimaryCareer } from './careerCatalog.js'
import { getTeachersFromProfiles } from './teacherAccess.js'

const STUDENT_TABLE_NAME = 'student_records'
const TEACHER_TABLE_NAME = 'teacher_records'
const MISSING_ROSTER_SCHEMA_ERROR_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205'])

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

function canUseRemoteRoster({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

export function buildTeacherLoginEmail({ dni, institutionId }) {
  const normalizedDni = clean(dni).replace(/\s+/g, '')
  if (!normalizedDni || !institutionId) return null
  return `${normalizedDni.toLowerCase()}@docentes.${institutionId}.local`
}

export function isMissingRosterSchemaError(error) {
  const errorCode = String(error?.code ?? '')
  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()

  if (MISSING_ROSTER_SCHEMA_ERROR_CODES.has(errorCode)) {
    return true
  }

  return (
    (errorText.includes(STUDENT_TABLE_NAME) || errorText.includes(TEACHER_TABLE_NAME)) &&
    (
      errorText.includes('does not exist') ||
      errorText.includes('not found') ||
      errorText.includes('could not find') ||
      errorText.includes('schema cache')
    )
  )
}

function warnMissingRosterSchema(operation, error) {
  console.warn(
    `No se pudo completar ${operation} porque falta el esquema de padrones normalizados en Supabase. Se mantiene el fallback al snapshot.`,
    error,
  )
}

function getStudentCareer(student) {
  return clean(student?.carrera || student?.programa || student?.program || student?.career)
}

function getStudentAcademicYear(student) {
  return clean(student?.anio || student?.anio_cursada || student?.ano || student?.year || student?.curso)
}

function getStudentEmail(student) {
  const explicitEmail = clean(student?.email || student?.correo || student?.mail).toLowerCase()
  if (explicitEmail) return explicitEmail
  const stableId = clean(student?.alumno_id || student?.id || student?.dni || student?.documento)
  return stableId ? `${stableId.toLowerCase()}@alumnos.local` : ''
}

function getStudentFullName(student) {
  const fullName = clean(student?.full_name || student?.display_name || student?.nombre_completo)
  if (fullName) return fullName

  return [clean(student?.nombre || student?.first_name), clean(student?.apellido || student?.last_name)]
    .filter(Boolean)
    .join(' ')
}

function getTeacherFullName(teacher) {
  return clean(teacher?.full_name || teacher?.nombre || teacher?.display_name)
}

function getTeacherIdentityKey(teacher) {
  return clean(teacher?.dni || teacher?.documento) || normalizeText(getTeacherFullName(teacher))
}

function buildTeacherCareerMap(schedules = [], teacherProfiles = []) {
  const careerMap = new Map()
  const normalizedProfiles = asArray(teacherProfiles)

  normalizedProfiles.forEach((teacher) => {
    const teacherKey = getTeacherIdentityKey(teacher)
    if (!teacherKey) return

    const currentCareers = careerMap.get(teacherKey) ?? new Set()
    getCareerValues(teacher).forEach((career) => currentCareers.add(career))

    if (currentCareers.size > 0) {
      careerMap.set(teacherKey, currentCareers)
    }
  })

  asArray(schedules).forEach((schedule) => {
    const scheduleTeacherName = clean(schedule?.profesor || schedule?.docente || schedule?.nombre)
    const scheduleTeacherDni = clean(schedule?.dni || schedule?.documento)
    const matchingProfile = normalizedProfiles.find((teacher) => (
      (clean(teacher?.dni || teacher?.documento) && scheduleTeacherDni && clean(teacher?.dni || teacher?.documento) === scheduleTeacherDni) ||
      normalizeText(getTeacherFullName(teacher)) === normalizeText(scheduleTeacherName)
    ))
    const teacherKey = clean(matchingProfile?.dni || matchingProfile?.documento || scheduleTeacherDni)
      || normalizeText(getTeacherFullName(matchingProfile) || scheduleTeacherName)

    if (!teacherKey) return

    const currentCareers = careerMap.get(teacherKey) ?? new Set()
    const career = getPrimaryCareer(schedule)

    if (career) {
      currentCareers.add(career)
      careerMap.set(teacherKey, currentCareers)
    }
  })

  return careerMap
}

export function buildStudentRecordsFromSnapshot({ snapshot, institutionId, workspaceKey = 'main' }) {
  const records = new Map()
  const studentRows = asArray(snapshot?.alumnos).concat(asArray(snapshot?.students))

  studentRows.forEach((student) => {
    if (!student || typeof student !== 'object') return

    const email = getStudentEmail(student)
    const career = getStudentCareer(student)
    if (!email) return

    const recordKey = `${email}::${normalizeText(career)}`

    records.set(recordKey, {
      institution_id: institutionId,
      workspace_key: workspaceKey,
      email,
      full_name: getStudentFullName(student) || email,
      first_name: clean(student?.nombre || student?.first_name),
      last_name: clean(student?.apellido || student?.last_name),
      career,
      academic_year: getStudentAcademicYear(student),
      dni: clean(student?.dni || student?.documento || student?.document_number),
      legajo: clean(student?.legajo || student?.matricula || student?.student_number),
      phone: clean(student?.telefono || student?.celular || student?.phone),
      status: clean(student?.estado || student?.status) || 'activo',
      raw_payload: student,
    })
  })

  return Array.from(records.values())
}

export function buildTeacherRecordsFromSnapshot({ snapshot, institutionId, workspaceKey = 'main' }) {
  const teacherProfiles = asArray(snapshot?.docentes)
  const schedules = asArray(snapshot?.horariosDocentes)
  const teacherRows = getTeachersFromProfiles(teacherProfiles, schedules)
  const careerMap = buildTeacherCareerMap(schedules, teacherProfiles)
  const records = new Map()

  teacherRows.forEach((teacher) => {
    if (!teacher || typeof teacher !== 'object') return

    const identityKey = getTeacherIdentityKey(teacher)
    const fullName = getTeacherFullName(teacher)
    const dni = clean(teacher?.dni || teacher?.documento)
    if (!identityKey || !fullName || !dni) return

    const [firstName = '', ...lastNameParts] = fullName.split(/\s+/)
    const profile = teacher.profile && typeof teacher.profile === 'object' ? teacher.profile : null
    const mergedCareers = Array.from(new Set([
      ...getCareerValues(profile ?? {}),
      ...Array.from(careerMap.get(identityKey) ?? []),
      ...getCareerValues(teacher),
    ]))

    records.set(identityKey, {
      institution_id: institutionId,
      workspace_key: workspaceKey,
      login_email: buildTeacherLoginEmail({
        dni,
        institutionId,
      }),
      full_name: fullName,
      first_name: clean(profile?.nombre || profile?.first_name || firstName),
      last_name: clean(profile?.apellido || profile?.last_name || lastNameParts.join(' ')),
      dni,
      phone: clean(teacher?.telefono || teacher?.celular || teacher?.phone),
      status: clean(profile?.estado || profile?.status) || 'activo',
      raw_payload: {
        ...(profile ?? {}),
        carrera: mergedCareers[0] ?? '',
        carreras: mergedCareers,
        careers: mergedCareers,
        materias: asArray(teacher?.materias),
      },
    })
  })

  return Array.from(records.values())
}

function getStudentRecordKey(record) {
  return `${clean(record?.email).toLowerCase()}::${normalizeText(record?.career)}`
}

function getTeacherRecordKey(record) {
  return clean(record?.dni) || normalizeText(record?.full_name)
}

async function syncTableRows({
  tableName,
  rows,
  selectFields,
  conflictColumns,
  keyForRow,
  institutionId,
  workspaceKey,
  deleteMissing = true,
}) {
  const { data: existingRows, error: existingError } = await supabase
    .from(tableName)
    .select(selectFields)
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (existingError) {
    if (isMissingRosterSchemaError(existingError)) {
      warnMissingRosterSchema(`la lectura de ${tableName}`, existingError)
      return { skipped: true, synced: 0, deleted: 0 }
    }

    throw existingError
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from(tableName)
      .upsert(rows, {
        onConflict: conflictColumns.join(','),
      })

    if (upsertError) {
      if (isMissingRosterSchemaError(upsertError)) {
        warnMissingRosterSchema(`la sincronizacion de ${tableName}`, upsertError)
        return { skipped: true, synced: 0, deleted: 0 }
      }

      throw upsertError
    }
  }

  const nextKeys = new Set(rows.map(keyForRow))
  const idsToDelete = deleteMissing ? asArray(existingRows)
    .filter((row) => !nextKeys.has(keyForRow(row)))
    .map((row) => row.id) : []

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('id', idsToDelete)

    if (deleteError) {
      if (isMissingRosterSchemaError(deleteError)) {
        warnMissingRosterSchema(`la limpieza de ${tableName}`, deleteError)
        return { skipped: true, synced: rows.length, deleted: 0 }
      }

      throw deleteError
    }
  }

  return {
    skipped: false,
    synced: rows.length,
    deleted: idsToDelete.length,
  }
}

export async function syncRosterRecords({ institutionId, workspaceKey = 'main', snapshot, useRemote }) {
  if (!canUseRemoteRoster({ institutionId, useRemote })) {
    return {
      source: 'local',
      students: { skipped: true, synced: 0, deleted: 0 },
      teachers: { skipped: true, synced: 0, deleted: 0 },
    }
  }

  const studentRows = buildStudentRecordsFromSnapshot({
    snapshot,
    institutionId,
    workspaceKey,
  })
  const teacherRows = buildTeacherRecordsFromSnapshot({
    snapshot,
    institutionId,
    workspaceKey,
  })

  const [students, teachers] = await Promise.all([
    syncTableRows({
      tableName: STUDENT_TABLE_NAME,
      rows: studentRows,
      selectFields: 'id, email, career',
      conflictColumns: ['institution_id', 'workspace_key', 'email', 'career'],
      keyForRow: getStudentRecordKey,
      institutionId,
      workspaceKey,
      deleteMissing: false,
    }),
    syncTableRows({
      tableName: TEACHER_TABLE_NAME,
      rows: teacherRows,
      selectFields: 'id, dni, full_name',
      conflictColumns: ['institution_id', 'workspace_key', 'dni'],
      keyForRow: getTeacherRecordKey,
      institutionId,
      workspaceKey,
    }),
  ])

  return {
    source: 'supabase',
    students,
    teachers,
  }
}

export function mapStudentRecordToSnapshotRow(record) {
  const profileId = clean(record?.profile_id)

  return {
    record_id: record?.id ?? null,
    ...(profileId ? { profile_id: profileId, user_id: profileId, student_id: profileId } : {}),
    email: clean(record?.email).toLowerCase(),
    nombre: clean(record?.first_name),
    apellido: clean(record?.last_name),
    full_name: clean(record?.full_name),
    carrera: clean(record?.career),
    anio: clean(record?.academic_year),
    dni: clean(record?.dni),
    legajo: clean(record?.legajo),
    telefono: clean(record?.phone),
    estado: clean(record?.status),
    raw: record?.raw_payload ?? null,
  }
}

export function mapTeacherRecordToSnapshotRow(record) {
  const careers = getCareerValues({
    carrera: record?.raw_payload?.carrera,
    carreras: record?.raw_payload?.carreras,
    raw_payload: record?.raw_payload,
  })
  const profileId = clean(record?.profile_id)

  return {
    record_id: record?.id ?? null,
    ...(profileId ? { profile_id: profileId } : {}),
    email: clean(record?.login_email).toLowerCase(),
    nombre: clean(record?.first_name) || clean(record?.full_name),
    apellido: clean(record?.last_name),
    full_name: clean(record?.full_name),
    dni: clean(record?.dni),
    telefono: clean(record?.phone),
    carrera: careers[0] ?? '',
    carreras: careers,
    estado: clean(record?.status),
    raw: record?.raw_payload ?? null,
  }
}

export async function fetchStudentRecords({
  institutionId,
  workspaceKey = 'main',
  useRemote,
  email = null,
}) {
  if (!canUseRemoteRoster({ institutionId, useRemote })) {
    return []
  }

  function buildQuery(selectFields) {
    let query = supabase
      .from(STUDENT_TABLE_NAME)
      .select(selectFields)
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .order('career', { ascending: true })
      .order('full_name', { ascending: true })

    if (email) {
      query = query.eq('email', clean(email).toLowerCase())
    }

    return query
  }

  let { data, error } = await buildQuery('id, profile_id, email, full_name, first_name, last_name, career, academic_year, dni, legajo, phone, status, raw_payload')

  if (isMissingRosterSchemaError(error)) {
    ;({ data, error } = await buildQuery('id, email, full_name, first_name, last_name, career, academic_year, dni, legajo, phone, status, raw_payload'))
  }

  if (error) {
    if (isMissingRosterSchemaError(error)) {
      warnMissingRosterSchema(`la lectura de ${STUDENT_TABLE_NAME}`, error)
      return []
    }

    throw error
  }

  return asArray(data)
}

export async function fetchTeacherRecords({
  institutionId,
  workspaceKey = 'main',
  useRemote,
}) {
  if (!canUseRemoteRoster({ institutionId, useRemote })) {
    return []
  }

  function buildQuery(selectFields) {
    return supabase
      .from(TEACHER_TABLE_NAME)
      .select(selectFields)
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .order('full_name', { ascending: true })
  }

  let { data, error } = await buildQuery('id, profile_id, login_email, full_name, first_name, last_name, dni, phone, status, raw_payload')

  if (isMissingRosterSchemaError(error)) {
    ;({ data, error } = await buildQuery('id, login_email, full_name, first_name, last_name, dni, phone, status, raw_payload'))
  }

  if (error) {
    if (isMissingRosterSchemaError(error)) {
      warnMissingRosterSchema(`la lectura de ${TEACHER_TABLE_NAME}`, error)
      return []
    }

    throw error
  }

  return asArray(data)
}
