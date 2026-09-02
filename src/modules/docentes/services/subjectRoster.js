import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeIdentity(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '')
}

function addSubjectCodeAlias(aliases, value) {
  const identity = normalizeIdentity(value)
  if (!identity) return

  aliases.add(identity)

  const withoutLeadingZero = identity.match(/^([a-z]+)0+(\d+)$/)
  if (withoutLeadingZero) {
    aliases.add(`${withoutLeadingZero[1]}${Number(withoutLeadingZero[2])}`)
  }

  const likelyZeroAsLetter = identity.match(/^([a-z]+)o(\d+)$/)
  if (likelyZeroAsLetter) {
    const zeroVariant = `${likelyZeroAsLetter[1]}0${likelyZeroAsLetter[2]}`
    aliases.add(zeroVariant)
    aliases.add(`${likelyZeroAsLetter[1]}${Number(likelyZeroAsLetter[2])}`)
  }
}

function getSubjectCodeAliases(value) {
  const aliases = new Set()
  const raw = clean(value)

  addSubjectCodeAlias(aliases, raw)
  normalizeText(raw)
    .split(/[:|/\\]+/)
    .forEach((part) => addSubjectCodeAlias(aliases, part))

  return Array.from(aliases).filter(Boolean)
}

function subjectMatches(left, right) {
  const leftAliases = getSubjectCodeAliases(left)
  const rightAliases = getSubjectCodeAliases(right)
  return leftAliases.some((alias) => rightAliases.includes(alias))
}

function programMatches(left, right) {
  const leftKey = normalizeIdentity(left)
  const rightKey = normalizeIdentity(right)
  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function getRosterSubjectId(row) {
  return clean(row?.subject_id || row?.subjectId || row?.canonical_subject_id || row?.canonicalSubjectId || row?.portal_subject_id || row?.portalSubjectId)
}

function getRosterProgramId(row) {
  return clean(row?.program_id || row?.programId || row?.canonical_program_id || row?.canonicalProgramId)
}

function canUseRemoteSubjectRoster({ institutionId }) {
  return Boolean(institutionId && isSupabaseConfigured && supabase)
}

function isMissingTeacherRosterRpcError(error) {
  const message = clean(error?.message).toLowerCase()
  return (
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    error?.code === 'PGRST204' ||
    message.includes('academic_get_teacher_subject_rosters') ||
    message.includes('could not find the function') ||
    message.includes('no se encontro la funcion')
  )
}

function isUnsupportedEdgeRosterError(error) {
  const message = clean(error?.message).toLowerCase()
  return (
    error?.code === 'PGRST202' ||
    message.includes('accion no soportada') ||
    message.includes('teacher_subject_rosters')
  )
}

function isMissingProfileIdColumn(error) {
  const message = clean(error?.message).toLowerCase()
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    (
      message.includes('profile_id') &&
      (
        message.includes('does not exist') ||
        message.includes('no existe') ||
        message.includes('schema cache')
      )
    )
  )
}

async function fetchStudentRecordsForEnrollments(enrollments) {
  const records = {
    byId: new Map(),
    byProfileId: new Map(),
  }
  const studentRecordIds = Array.from(new Set(
    asArray(enrollments).map((enrollment) => clean(enrollment.student_record_id)).filter(Boolean),
  ))
  const studentProfileIds = Array.from(new Set(
    asArray(enrollments).map((enrollment) => clean(enrollment.student_id)).filter(Boolean),
  ))

  if (studentRecordIds.length === 0 && studentProfileIds.length === 0) return records

  if (studentRecordIds.length > 0) {
    let { data: recordRows, error: recordError } = await supabase
      .from('student_records')
      .select('id, profile_id, full_name, dni, email')
      .in('id', studentRecordIds)

    if (isMissingProfileIdColumn(recordError)) {
      ;({ data: recordRows, error: recordError } = await supabase
        .from('student_records')
        .select('id, full_name, dni, email')
        .in('id', studentRecordIds))
    }

    if (recordError) {
      console.warn('No se pudo leer el padron de alumnos para el listado de la materia.', recordError)
    } else {
      asArray(recordRows).forEach((record) => {
        records.byId.set(clean(record.id), record)
        if (clean(record.profile_id)) records.byProfileId.set(clean(record.profile_id), record)
      })
    }
  }

  const missingProfileIds = studentProfileIds.filter((profileId) => !records.byProfileId.has(profileId))
  if (missingProfileIds.length > 0) {
    let { data: profileRows, error: profileError } = await supabase
      .from('student_records')
      .select('id, profile_id, full_name, dni, email')
      .in('profile_id', missingProfileIds)

    if (isMissingProfileIdColumn(profileError)) return records

    if (profileError) {
      console.warn('No se pudo resolver el padron de alumnos por perfil para el listado de la materia.', profileError)
    } else {
      asArray(profileRows).forEach((record) => {
        records.byId.set(clean(record.id), record)
        if (clean(record.profile_id)) records.byProfileId.set(clean(record.profile_id), record)
      })
    }
  }

  return records
}

function mapEnrollmentWithRecord(enrollment, recordsById) {
  const record = recordsById.byId?.get(clean(enrollment.student_record_id))
    ?? recordsById.byProfileId?.get(clean(enrollment.student_id))

  return {
    enrollmentId: clean(enrollment.id),
    subjectId: clean(enrollment.subject_id),
    programId: clean(enrollment.program_id),
    studentId: clean(enrollment.student_id),
    studentRecordId: clean(enrollment.student_record_id) || null,
    fullName: clean(record?.full_name) || 'Alumno sin nombre registrado',
    dni: clean(record?.dni),
    email: clean(record?.email),
  }
}

function mapRpcRosterRow(row) {
  return {
    enrollmentId: clean(row?.enrollmentId || row?.enrollment_id || row?.id),
    subjectId: getRosterSubjectId(row),
    programId: getRosterProgramId(row),
    studentId: clean(row?.studentId || row?.student_id),
    studentRecordId: clean(row?.studentRecordId || row?.student_record_id) || null,
    fullName: clean(row?.fullName || row?.full_name) || 'Alumno sin nombre registrado',
    dni: clean(row?.dni),
    email: clean(row?.email),
  }
}

function enrichActiveRosterWithRpc(roster, rpcRosters) {
  const rpcByEnrollmentId = new Map(
    asArray(rpcRosters)
      .map((row) => [clean(row.enrollmentId), row])
      .filter(([enrollmentId]) => enrollmentId),
  )

  return roster.map((row) => {
    const rpcRow = rpcByEnrollmentId.get(clean(row.enrollmentId))
    if (!rpcRow) return row

    return {
      ...row,
      studentId: clean(row.studentId) || clean(rpcRow.studentId),
      studentRecordId: clean(row.studentRecordId) || clean(rpcRow.studentRecordId) || null,
      fullName: row.fullName === 'Alumno sin nombre registrado'
        ? (clean(rpcRow.fullName) || row.fullName)
        : row.fullName,
      dni: clean(row.dni) || clean(rpcRow.dni),
      email: clean(row.email) || clean(rpcRow.email),
    }
  })
}

function removeUnresolvedRosterRows(roster) {
  return roster.filter((row) => row.fullName !== 'Alumno sin nombre registrado')
}

async function fetchTeacherSubjectRostersViaRpc({ institutionId, workspaceKey }) {
  if (typeof supabase?.rpc !== 'function') return null

  const { data, error } = await supabase.rpc('academic_get_teacher_subject_rosters', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
  })

  if (error) {
    if (isMissingTeacherRosterRpcError(error)) return null
    console.warn('No se pudo leer el padron docente por RPC. Se usara la lectura directa como fallback.', error)
    return null
  }

  const rows = Array.isArray(data)
    ? data
    : asArray(data?.rosters || data?.rows || data?.enrollments)

  return rows.map(mapRpcRosterRow)
}

async function fetchTeacherSubjectRostersViaEdge({ institutionId, workspaceKey }) {
  if (typeof supabase?.functions?.invoke !== 'function') return null

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'teacher_subject_rosters',
      institution_id: institutionId,
      workspace_key: workspaceKey,
    },
  })

  if (error) {
    if (isUnsupportedEdgeRosterError(error)) return null
    console.warn('No se pudo leer el padron docente por Edge Function. Se usara la lectura directa como fallback.', error)
    return null
  }

  if (data?.error) {
    if (isUnsupportedEdgeRosterError(data)) return null
    console.warn('La Edge Function no pudo devolver el padron docente. Se usara la lectura directa como fallback.', data)
    return null
  }

  const rows = Array.isArray(data)
    ? data
    : asArray(data?.rosters || data?.rows || data?.enrollments)

  return rows.map(mapRpcRosterRow)
}

async function fetchActiveEnrollmentRows({ institutionId, workspaceKey, subjectId = null, programId = null }) {
  let query = supabase
    .from('subject_enrollments')
    .select('id, student_id, student_record_id, subject_id, program_id, status, deleted_at, dropped_at, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (clean(subjectId)) query = query.eq('subject_id', subjectId)
  if (programId !== null && programId !== undefined) query = query.eq('program_id', programId ?? '')

  return query
}

function getEnrollmentTimestamp(row) {
  const value = row?.updated_at || row?.dropped_at || row?.deleted_at || row?.created_at
  const timestamp = value ? new Date(value).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getEnrollmentIdentity(row) {
  const studentIdentity = clean(row?.student_record_id || row?.student_id)
  const subjectIdentity = getSubjectCodeAliases(getRosterSubjectId(row)).sort()[0] ?? normalizeIdentity(getRosterSubjectId(row))
  return `${studentIdentity}::${subjectIdentity}::${normalizeIdentity(getRosterProgramId(row))}`
}

function selectCurrentActiveEnrollments(rows) {
  const latestByIdentity = new Map()

  asArray(rows).forEach((row, index) => {
    const identity = getEnrollmentIdentity(row) || `row-${index}`
    const current = latestByIdentity.get(identity)
    if (!current || getEnrollmentTimestamp(row) >= getEnrollmentTimestamp(current)) {
      latestByIdentity.set(identity, row)
    }
  })

  return Array.from(latestByIdentity.values()).filter((row) => (
    ['active', 'enrolled'].includes(clean(row?.status).toLowerCase())
    && !row?.deleted_at
  ))
}

function filterEnrollmentRowsForSubject(rows, { subjectId, programId }) {
  const subjectRows = asArray(rows).filter((row) => subjectMatches(getRosterSubjectId(row), subjectId))
  const programRows = subjectRows.filter((row) => programMatches(getRosterProgramId(row), programId))

  if (programRows.length > 0) return programRows
  return subjectRows.length === 1 ? subjectRows : []
}

export async function fetchSubjectRoster({ institutionId, workspaceKey = 'main', subjectId, programId }) {
  if (!canUseRemoteSubjectRoster({ institutionId }) || !clean(subjectId)) return []

  const edgeRosters = await fetchTeacherSubjectRostersViaEdge({ institutionId, workspaceKey })
  if (edgeRosters) {
    return filterEnrollmentRowsForSubject(edgeRosters, { subjectId, programId })
  }

  const { data: exactRows, error: exactError } = await fetchActiveEnrollmentRows({
    institutionId,
    workspaceKey,
    subjectId,
    programId: programId ?? '',
  })

  if (exactError) {
    console.warn('No se pudo validar directamente el listado activo de la materia. Se intentara la RPC docente.', exactError)
    const rpcRosters = await fetchTeacherSubjectRostersViaRpc({ institutionId, workspaceKey })
    return filterEnrollmentRowsForSubject(rpcRosters, { subjectId, programId })
  }

  let enrollments = selectCurrentActiveEnrollments(exactRows)

  if (enrollments.length === 0) {
    const { data: candidateRows, error: candidateError } = await fetchActiveEnrollmentRows({
      institutionId,
      workspaceKey,
    })

    if (candidateError) {
      console.warn('No se pudo leer el listado alternativo de alumnos inscriptos en la materia.', candidateError)
      return []
    }

    enrollments = filterEnrollmentRowsForSubject(
      selectCurrentActiveEnrollments(candidateRows),
      { subjectId, programId },
    )
  }

  const recordsById = await fetchStudentRecordsForEnrollments(enrollments)
  const roster = enrollments.map((enrollment) => mapEnrollmentWithRecord(enrollment, recordsById))
  const hasUnresolvedStudent = roster.some((row) => row.fullName === 'Alumno sin nombre registrado')

  if (!hasUnresolvedStudent) return roster

  const rpcRosters = await fetchTeacherSubjectRostersViaRpc({ institutionId, workspaceKey })
  return removeUnresolvedRosterRows(enrichActiveRosterWithRpc(roster, rpcRosters))
}

export async function fetchTeacherSubjectRosters({ institutionId, workspaceKey = 'main' }) {
  if (!canUseRemoteSubjectRoster({ institutionId })) return []

  const edgeRosters = await fetchTeacherSubjectRostersViaEdge({ institutionId, workspaceKey })
  if (edgeRosters) return edgeRosters

  const { data: enrollmentRows, error: enrollmentError } = await supabase
    .from('subject_enrollments')
    .select('id, student_id, student_record_id, subject_id, program_id, status, deleted_at, dropped_at, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (enrollmentError) {
    console.warn('No se pudo validar directamente el listado activo del docente. Se intentara la RPC.', enrollmentError)
    return await fetchTeacherSubjectRostersViaRpc({ institutionId, workspaceKey }) ?? []
  }

  const enrollments = selectCurrentActiveEnrollments(enrollmentRows)
  const recordsById = await fetchStudentRecordsForEnrollments(enrollments)
  const roster = enrollments.map((enrollment) => mapEnrollmentWithRecord(enrollment, recordsById))
  const hasUnresolvedStudent = roster.some((row) => row.fullName === 'Alumno sin nombre registrado')

  if (!hasUnresolvedStudent) return roster

  const rpcRosters = await fetchTeacherSubjectRostersViaRpc({ institutionId, workspaceKey })
  return removeUnresolvedRosterRows(enrichActiveRosterWithRpc(roster, rpcRosters))
}
