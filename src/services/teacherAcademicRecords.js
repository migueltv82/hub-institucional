import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const AVAILABILITY_TABLE = 'teacher_availability_records'
const WORKLOAD_TABLE = 'teacher_workload_records'
const MISSING_ACADEMIC_SCHEMA_ERROR_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205'])
const VALID_TEACHER_ACADEMIC_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DRAFT'])
const VALID_TEACHER_ROLES = new Set(['TITULAR', 'CO_DOCENTE', 'AUXILIAR', 'SUPLENTE', 'REEMPLAZO'])

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isFalseLike(value) {
  if (value === false) return true
  return ['false', 'no', '0', 'sin titular', 'sin_titular'].includes(normalizeText(value))
}

function isGeneratedScheduleWorkload(row = {}) {
  const source = normalizeText(firstValue(row.source, row.fuente, row.origen, row.raw_payload?.source, row.raw_payload?.fuente, row.raw_payload?.origen))
  const observations = normalizeText(firstValue(row.observaciones, row.observacion, row.notes, row.raw_payload?.observaciones))
  const id = normalizeText(row.id)

  return (
    source === 'horarios_docentes' ||
    observations.includes('generado desde horarios') ||
    id.startsWith('carga-desde-horarios')
  )
}

function normalizeNumber(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function firstValue(...values) {
  return values.find((value) => clean(value) !== '')
}

export function normalizeTeacherAcademicStatus(value) {
  const normalized = clean(value || 'ACTIVE').toUpperCase()
  return VALID_TEACHER_ACADEMIC_STATUSES.has(normalized) ? normalized : 'ACTIVE'
}

export function normalizeTeacherRole(value) {
  const normalized = clean(value || 'TITULAR').toUpperCase().replace(/[\s-]+/g, '_')
  return VALID_TEACHER_ROLES.has(normalized) ? normalized : 'TITULAR'
}

function getWorkloadRole(row = {}) {
  if (isGeneratedScheduleWorkload(row)) return ''
  if (isFalseLike(row.titularidad) || isFalseLike(row.titularity) || isFalseLike(row.es_titular) || isFalseLike(row.isTitular)) return ''
  return normalizeTeacherRole(firstValue(row.rol, row.role, row.rol_en_materia))
}

function getWorkloadTitularity(row = {}) {
  if (isGeneratedScheduleWorkload(row)) return 'false'
  const explicitTitularity = firstValue(row.titularidad, row.titularity)
  if (
    isFalseLike(explicitTitularity) ||
    isFalseLike(row.es_titular) ||
    isFalseLike(row.isTitular)
  ) {
    return 'false'
  }
  return normalizeTeacherRole(firstValue(explicitTitularity, row.rol_en_materia, row.rol, row.role))
}

export function getCareerName(input = {}) {
  const rawCareer = input.career && typeof input.career === 'object' ? input.career : {}
  const rawCarrera = input.carrera && typeof input.carrera === 'object' ? input.carrera : {}

  return clean(firstValue(
    input.career_name,
    input.careerName,
    input.nombreCarrera,
    input.carrera_nombre,
    typeof input.carrera === 'string' ? input.carrera : '',
    typeof input.career === 'string' ? input.career : '',
    rawCareer.name,
    rawCareer.nombre,
    rawCarrera.name,
    rawCarrera.nombre,
    input.raw_payload?.career_name,
    input.raw_payload?.careerName,
    input.raw_payload?.nombreCarrera,
    input.raw_payload?.carrera_nombre,
    input.raw_payload?.carrera,
    input.raw_payload?.career,
    input.program_id,
    input.programa,
  ))
}

export function getWorkloadSubjectName(input = {}) {
  return clean(firstValue(
    input.subject_name,
    input.subjectName,
    input.materia_nombre,
    input.nombreMateria,
    input.nombre,
    input.materia,
    input.raw_payload?.subject_name,
    input.raw_payload?.subjectName,
    input.raw_payload?.materia_nombre,
    input.raw_payload?.nombreMateria,
  ))
}

function getTeacherName(row = {}) {
  return clean(firstValue(
    row.docente,
    row.profesor,
    row.nombre,
    row.teacher_display_name,
    row.displayName,
    row.display_name,
    row.teacherName,
    row.full_name,
    row.name,
    [row.nombre, row.apellido].map(clean).filter(Boolean).join(' '),
  ))
}

function getTeacherIdentity(row = {}) {
  return clean(firstValue(
    row.docenteId,
    row.docente_id,
    row.teacher_record_id,
    row.record_id,
    row.id_docente,
    row.dni_docente,
    row.dni,
    row.documento,
    getTeacherName(row),
  ))
}

function buildTeacherLookup(teachers = []) {
  const byIdentity = new Map()

  asArray(teachers).forEach((teacher) => {
    const recordId = clean(firstValue(teacher.record_id, teacher.docenteId, teacher.id))
    const dni = clean(firstValue(teacher.dni, teacher.documento))
    const name = getTeacherName(teacher)
    const value = {
      recordId,
      dni,
      name,
    }

    ;[recordId, dni, name].forEach((key) => {
      const normalizedKey = normalizeText(key)
      if (normalizedKey) byIdentity.set(normalizedKey, value)
    })
  })

  return byIdentity
}

function resolveTeacher(row, teacherLookup) {
  const identity = getTeacherIdentity(row)
  const teacher = teacherLookup.get(normalizeText(identity)) || teacherLookup.get(normalizeText(getTeacherName(row)))
  const teacherName = teacher?.name || getTeacherName(row)

  return {
    teacherRecordId: teacher?.recordId || clean(firstValue(row.teacher_record_id, row.docenteId, row.docente_id, row.record_id)) || null,
    teacherIdentity: teacher?.recordId || clean(identity || getTeacherName(row)),
    teacherName,
    teacherDisplayName: teacherName,
    teacherDni: teacher?.dni || clean(firstValue(row.dni_docente, row.dni, row.documento)),
  }
}

function hasMissingAcademicSchema(error) {
  const code = String(error?.code ?? '')
  const text = [error?.message, error?.details, error?.hint]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')

  if (MISSING_ACADEMIC_SCHEMA_ERROR_CODES.has(code)) return true

  return (
    (text.includes(AVAILABILITY_TABLE) || text.includes(WORKLOAD_TABLE)) &&
    (
      text.includes('does not exist') ||
      text.includes('not found') ||
      text.includes('could not find') ||
      text.includes('schema cache') ||
      text.includes('column')
    )
  )
}

function warnMissingAcademicSchema(operation, error) {
  console.warn(
    `No se pudo completar ${operation} porque faltan tablas academicas docentes en Supabase. Se mantiene el fallback al workspaceSnapshot.`,
    error,
  )
}

export function assertTeacherDisplayNames(rows = [], tableName = 'teacher academic records') {
  const missingRows = asArray(rows).filter((row) => !clean(row.teacher_display_name))
  if (missingRows.length === 0) return

  const error = new Error(`No se puede sincronizar ${tableName}: falta teacher_display_name en ${missingRows.length} fila(s).`)
  error.details = {
    tableName,
    missingField: 'teacher_display_name',
    missingCount: missingRows.length,
  }
  throw error
}

export function assertTeacherWorkloadRows(rows = []) {
  const requiredFields = ['teacher_display_name', 'career_name', 'subject_name', 'teaching_hours']
  const missing = asArray(rows).flatMap((row, index) => (
    requiredFields
      .filter((field) => {
        if (field === 'teaching_hours') return Number(row[field]) <= 0
        return !clean(row[field])
      })
      .map((field) => ({ index, field }))
  ))

  if (missing.length === 0) return

  const error = new Error(`No se puede sincronizar ${WORKLOAD_TABLE}: faltan campos requeridos antes del upsert.`)
  error.details = {
    tableName: WORKLOAD_TABLE,
    missing,
  }
  throw error
}

function canUseRemoteTeacherAcademicRecords({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

export function buildTeacherAvailabilityRowsFromSnapshot({
  disponibilidadDocente = [],
  docentes = [],
  institutionId,
  workspaceKey = 'main',
}) {
  const teacherLookup = buildTeacherLookup(docentes)

  return asArray(disponibilidadDocente)
    .map((row) => {
      const teacher = resolveTeacher(row, teacherLookup)
      const day = clean(firstValue(row.dia, row.day, row.diaSemana))
      const startTime = clean(firstValue(row.hora_desde, row.horaDesde, row.desde, row.inicio))
      const endTime = clean(firstValue(row.hora_hasta, row.horaHasta, row.hasta, row.fin))

      if (!teacher.teacherIdentity || !day || !startTime || !endTime || !teacher.teacherDisplayName) return null

      const source = clean(firstValue(row.source, row.fuente, 'workspace_snapshot'))

      return {
        institution_id: institutionId,
        workspace_key: workspaceKey,
        teacher_record_id: teacher.teacherRecordId,
        teacher_identity: teacher.teacherIdentity,
        teacher_display_name: teacher.teacherDisplayName,
        teacher_name: teacher.teacherName,
        teacher_dni: teacher.teacherDni,
        day_of_week: day,
        shift: clean(firstValue(row.turno, row.shift)),
        start_time: startTime,
        end_time: endTime,
        is_available: row.disponible === false || row.disponible_mesa === false ? false : true,
        reason: clean(firstValue(row.motivo, row.observacion, row.observaciones, row.reason)),
        status: normalizeTeacherAcademicStatus(firstValue(row.estado, row.status)),
        valid_from: clean(firstValue(row.vigencia_desde, row.vigenciaDesde, row.valid_from)),
        valid_until: clean(firstValue(row.vigencia_hasta, row.vigenciaHasta, row.valid_until)),
        source,
        raw_payload: row,
      }
    })
    .filter(Boolean)
}

export function buildTeacherWorkloadRowsFromSnapshot({
  cargaHorariaDocente = [],
  docentes = [],
  institutionId,
  workspaceKey = 'main',
}) {
  const teacherLookup = buildTeacherLookup(docentes)

  return asArray(cargaHorariaDocente)
    .map((row) => {
      const teacher = resolveTeacher(row, teacherLookup)
      const careerName = getCareerName(row)
      const programId = clean(firstValue(row.program_id, row.programa, careerName))
      const planId = clean(firstValue(row.plan_id, row.plan, row.planEstudio))
      const subjectId = clean(firstValue(row.subject_id, row.materia_codigo, row.materia, row.codigo))
      const subjectName = getWorkloadSubjectName(row) || subjectId
      const teachingHours = normalizeNumber(firstValue(row.horas_catedra, row.horasCatedra, row.teaching_hours, row.cargaHoraria))
      const source = clean(firstValue(row.source, row.fuente, 'workspace_snapshot'))

      if (!teacher.teacherIdentity || !programId || !careerName || !subjectId || !subjectName || !teachingHours || teachingHours <= 0 || !teacher.teacherDisplayName) return null

      return {
        institution_id: institutionId,
        workspace_key: workspaceKey,
        teacher_record_id: teacher.teacherRecordId,
        teacher_identity: teacher.teacherIdentity,
        teacher_display_name: teacher.teacherDisplayName,
        teacher_name: teacher.teacherName,
        teacher_dni: teacher.teacherDni,
        program_id: programId,
        career_name: careerName,
        plan_id: planId,
        subject_id: subjectId,
        subject_name: subjectName,
        academic_year: clean(firstValue(row.anio, row.ano, row.year, row.curso)),
        role: getWorkloadRole({ ...row, source }),
        titularity: getWorkloadTitularity({ ...row, source }),
        teaching_hours: teachingHours,
        status: normalizeTeacherAcademicStatus(firstValue(row.estado, row.estado_asignacion, row.status)),
        valid_from: clean(firstValue(row.vigencia_desde, row.vigenciaDesde, row.valid_from)),
        valid_until: clean(firstValue(row.vigencia_hasta, row.vigenciaHasta, row.valid_until)),
        source,
        raw_payload: row,
      }
    })
    .filter(Boolean)
}

function keyForAvailability(row) {
  return [
    normalizeText(row.teacher_identity),
    normalizeText(row.day_of_week),
    normalizeText(row.shift),
    clean(row.start_time),
    clean(row.end_time),
    clean(row.valid_from),
    clean(row.valid_until),
  ].join('::')
}

function keyForWorkload(row) {
  return [
    normalizeText(row.teacher_identity),
    normalizeText(row.program_id),
    normalizeText(row.plan_id),
    normalizeText(row.subject_id),
    clean(row.valid_from),
    clean(row.valid_until),
  ].join('::')
}

function uniqueRows(rows, keyForRow) {
  const byKey = new Map()
  rows.forEach((row) => {
    const key = keyForRow(row)
    if (!key || byKey.has(key)) return
    byKey.set(key, row)
  })
  return [...byKey.values()]
}

async function syncTableRows({
  tableName,
  rows,
  selectFields,
  conflictColumns,
  keyForRow,
  institutionId,
  workspaceKey,
}) {
  const { data: existingRows, error: existingError } = await supabase
    .from(tableName)
    .select(selectFields)
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (existingError) {
    if (hasMissingAcademicSchema(existingError)) {
      warnMissingAcademicSchema(`la lectura de ${tableName}`, existingError)
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
      if (hasMissingAcademicSchema(upsertError)) {
        warnMissingAcademicSchema(`la sincronizacion de ${tableName}`, upsertError)
        return { skipped: true, synced: 0, deleted: 0 }
      }
      throw upsertError
    }
  }

  const nextKeys = new Set(rows.map(keyForRow))
  const idsToDelete = asArray(existingRows)
    .filter((row) => !nextKeys.has(keyForRow(row)))
    .map((row) => row.id)
    .filter(Boolean)

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('id', idsToDelete)

    if (deleteError) {
      if (hasMissingAcademicSchema(deleteError)) {
        warnMissingAcademicSchema(`la limpieza de ${tableName}`, deleteError)
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

export async function syncTeacherAcademicRecords({
  institutionId,
  workspaceKey = 'main',
  snapshot,
  useRemote,
}) {
  if (!canUseRemoteTeacherAcademicRecords({ institutionId, useRemote })) {
    return {
      source: 'local',
      availability: { skipped: true, synced: 0, deleted: 0 },
      workload: { skipped: true, synced: 0, deleted: 0 },
    }
  }

  const availabilityRows = uniqueRows(
    buildTeacherAvailabilityRowsFromSnapshot({
      disponibilidadDocente: snapshot?.disponibilidadDocente,
      docentes: snapshot?.docentes,
      institutionId,
      workspaceKey,
    }),
    keyForAvailability,
  )
  const workloadRows = uniqueRows(
    buildTeacherWorkloadRowsFromSnapshot({
      cargaHorariaDocente: snapshot?.cargaHorariaDocente,
      docentes: snapshot?.docentes,
      institutionId,
      workspaceKey,
    }),
    keyForWorkload,
  )

  assertTeacherDisplayNames(availabilityRows, AVAILABILITY_TABLE)
  assertTeacherDisplayNames(workloadRows, WORKLOAD_TABLE)
  assertTeacherWorkloadRows(workloadRows)

  const [availability, workload] = await Promise.all([
    syncTableRows({
      tableName: AVAILABILITY_TABLE,
      rows: availabilityRows,
      selectFields: 'id, teacher_identity, day_of_week, shift, start_time, end_time, valid_from, valid_until',
      conflictColumns: ['institution_id', 'workspace_key', 'teacher_identity', 'day_of_week', 'shift', 'start_time', 'end_time', 'valid_from', 'valid_until'],
      keyForRow: keyForAvailability,
      institutionId,
      workspaceKey,
    }),
    syncTableRows({
      tableName: WORKLOAD_TABLE,
      rows: workloadRows,
      selectFields: 'id, teacher_identity, program_id, plan_id, subject_id, valid_from, valid_until',
      conflictColumns: ['institution_id', 'workspace_key', 'teacher_identity', 'program_id', 'plan_id', 'subject_id', 'valid_from', 'valid_until'],
      keyForRow: keyForWorkload,
      institutionId,
      workspaceKey,
    }),
  ])

  return {
    source: 'supabase',
    availability,
    workload,
  }
}

export function mapTeacherAvailabilityRecordToSnapshotRow(record = {}) {
  return {
    id: clean(record.id),
    docenteId: clean(record.teacher_record_id),
    docente: clean(firstValue(record.teacher_display_name, record.teacher_name)),
    dni_docente: clean(record.teacher_dni),
    dia: clean(record.day_of_week),
    turno: clean(record.shift),
    hora_desde: clean(record.start_time),
    hora_hasta: clean(record.end_time),
    disponible: record.is_available !== false,
    disponible_mesa: record.is_available !== false,
    motivo: clean(record.reason),
    observacion: clean(record.reason),
    estado: clean(record.status),
    vigencia_desde: clean(record.valid_from),
    vigencia_hasta: clean(record.valid_until),
    source: clean(record.source) || 'teacher_availability_records',
  }
}

export function mapTeacherWorkloadRecordToSnapshotRow(record = {}) {
  return {
    id: clean(record.id),
    docenteId: clean(record.teacher_record_id),
    docente: clean(firstValue(record.teacher_display_name, record.teacher_name)),
    dni_docente: clean(record.teacher_dni),
    carrera: clean(firstValue(record.career_name, record.program_id)),
    career_name: clean(firstValue(record.career_name, record.program_id)),
    plan: clean(record.plan_id),
    materia_codigo: clean(record.subject_id),
    materia: clean(record.subject_id),
    materia_nombre: clean(record.subject_name),
    anio: clean(record.academic_year),
    rol: clean(record.role),
    rol_en_materia: clean(record.role),
    titularidad: clean(record.titularity),
    horasCatedra: record.teaching_hours,
    estado: clean(record.status),
    estado_asignacion: clean(record.status),
    vigencia_desde: clean(record.valid_from),
    vigencia_hasta: clean(record.valid_until),
    source: clean(record.source) || 'teacher_workload_records',
  }
}

export async function fetchTeacherAcademicRecords({
  institutionId,
  workspaceKey = 'main',
  useRemote,
}) {
  if (!canUseRemoteTeacherAcademicRecords({ institutionId, useRemote })) {
    return {
      source: 'local',
      disponibilidadDocente: [],
      cargaHorariaDocente: [],
      skipped: true,
    }
  }

  const [availabilityResult, workloadResult] = await Promise.all([
    supabase
      .from(AVAILABILITY_TABLE)
      .select('id, teacher_record_id, teacher_identity, teacher_display_name, teacher_name, teacher_dni, day_of_week, shift, start_time, end_time, is_available, reason, status, valid_from, valid_until, source')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .order('teacher_name', { ascending: true }),
    supabase
      .from(WORKLOAD_TABLE)
      .select('id, teacher_record_id, teacher_identity, teacher_display_name, teacher_name, teacher_dni, program_id, career_name, plan_id, subject_id, subject_name, academic_year, role, titularity, teaching_hours, status, valid_from, valid_until, source')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .order('teacher_name', { ascending: true }),
  ])

  if (availabilityResult.error || workloadResult.error) {
    const error = availabilityResult.error || workloadResult.error
    if (hasMissingAcademicSchema(error)) {
      warnMissingAcademicSchema('la lectura de datos academicos docentes', error)
      return {
        source: 'supabase',
        disponibilidadDocente: [],
        cargaHorariaDocente: [],
        skipped: true,
      }
    }
    throw error
  }

  return {
    source: 'supabase',
    disponibilidadDocente: asArray(availabilityResult.data).map(mapTeacherAvailabilityRecordToSnapshotRow),
    cargaHorariaDocente: asArray(workloadResult.data).map(mapTeacherWorkloadRecordToSnapshotRow),
    skipped: false,
  }
}

export function mergeTeacherAcademicRecordsIntoSnapshot(snapshot, academicRecords) {
  if (!academicRecords || academicRecords.skipped) return snapshot

  return {
    ...snapshot,
    disponibilidadDocente: academicRecords.disponibilidadDocente.length > 0
      ? academicRecords.disponibilidadDocente
      : asArray(snapshot.disponibilidadDocente),
    cargaHorariaDocente: academicRecords.cargaHorariaDocente.length > 0
      ? academicRecords.cargaHorariaDocente
      : asArray(snapshot.cargaHorariaDocente),
  }
}

export function buildTeacherAcademicMigrationPlan(snapshot = {}) {
  const availabilityRows = buildTeacherAvailabilityRowsFromSnapshot({
    disponibilidadDocente: snapshot.disponibilidadDocente,
    docentes: snapshot.docentes,
    institutionId: 'migration-preview',
    workspaceKey: 'main',
  })
  const workloadRows = buildTeacherWorkloadRowsFromSnapshot({
    cargaHorariaDocente: snapshot.cargaHorariaDocente,
    docentes: snapshot.docentes,
    institutionId: 'migration-preview',
    workspaceKey: 'main',
  })

  return {
    availabilityRows,
    workloadRows,
    audit: {
      disponibilidadDocente: {
        total: asArray(snapshot.disponibilidadDocente).length,
        migratable: availabilityRows.length,
        incomplete: asArray(snapshot.disponibilidadDocente).length - availabilityRows.length,
      },
      cargaHorariaDocente: {
        total: asArray(snapshot.cargaHorariaDocente).length,
        migratable: workloadRows.length,
        incomplete: asArray(snapshot.cargaHorariaDocente).length - workloadRows.length,
      },
    },
  }
}
