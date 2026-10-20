import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const STUDENT_ACCESS_BATCH_SIZE = 20
const MIN_STUDENT_ACCESS_BATCH_SIZE = 1
// D2: de a un lote. Dos lotes en paralelo escriben el mismo workspace y el lock del gateway de Storage rechaza a uno.
const STUDENT_ACCESS_CONCURRENCY = 1

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeStudentForAccess(student) {
  return {
    email: student.email,
    nombre: student.nombre,
    apellido: student.apellido,
    full_name: student.full_name,
    carrera: student.carrera,
    anio: student.anio,
    dni: student.dni,
    legajo: student.legajo,
  }
}

function hasExistingStudentAccess(student = {}) {
  return Boolean(clean(
    student.profile_id ??
    student.profileId ??
    student.user_id ??
    student.userId ??
    student.student_id ??
    student.studentId ??
    student.access_user_id ??
    student.accessUserId ??
    student.portal_user_id ??
    student.portalUserId,
  ))
}

function splitStudentsByAccessStatus(students = []) {
  return students.reduce((groups, student) => {
    if (hasExistingStudentAccess(student)) groups.withAccess.push(student)
    else groups.pending.push(student)
    return groups
  }, { pending: [], withAccess: [] })
}

export function applyStudentAccessResultsToRows(students = [], accessResults = []) {
  const resultsByEmail = new Map(
    (Array.isArray(accessResults) ? accessResults : [])
      .map((result) => [clean(result?.email).toLowerCase(), result])
      .filter(([email]) => Boolean(email)),
  )

  return (Array.isArray(students) ? students : []).map((student) => {
    const email = clean(student?.email ?? student?.correo ?? student?.mail).toLowerCase()
    const result = resultsByEmail.get(email)
    if (!result?.user_id) return student

    const studentRecordId = clean(result.student_record_id)
    const nextRecordId = studentRecordId || student.record_id
    const nextStudentRecordId = studentRecordId || student.student_record_id

    return {
      ...student,
      profile_id: student.profile_id ?? result.user_id,
      user_id: student.user_id ?? result.user_id,
      student_id: student.student_id ?? result.user_id,
      record_id: student.record_id ?? nextRecordId,
      student_record_id: student.student_record_id ?? nextStudentRecordId,
      login_email: student.login_email ?? email,
      access_status: 'active',
      access_updated_at: new Date().toISOString(),
    }
  })
}

function chunkRows(rows = [], size = STUDENT_ACCESS_BATCH_SIZE) {
  const chunks = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

function emptyAccessResult() {
  return {
    success: true,
    created: 0,
    updated: 0,
    failed: 0,
    results: [],
    errors: [],
    batches: 0,
  }
}

function mergeAccessResult(total, next = {}) {
  return {
    ...total,
    success: total.success !== false && next.success !== false,
    created: total.created + (Number(next.created) || 0),
    updated: total.updated + (Number(next.updated) || 0),
    failed: total.failed + (Number(next.failed) || 0),
    results: [
      ...(Array.isArray(total.results) ? total.results : []),
      ...(Array.isArray(next.results) ? next.results : []),
    ],
    errors: [
      ...(Array.isArray(total.errors) ? total.errors : []),
      ...(Array.isArray(next.errors) ? next.errors : []),
    ],
    batches: total.batches + (Number(next.batches) || 1),
  }
}

async function mapWithConcurrency(items = [], concurrency = 1, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

async function readInvokeErrorDetail(error) {
  let detail = error?.message || 'Error desconocido.'

  try {
    if (error?.context && typeof error.context.json === 'function') {
      const errorBody = await error.context.json()
      detail = errorBody?.error ?? errorBody?.message ?? detail
    }
  } catch {
    // Supabase puede no permitir leer el body dos veces.
  }

  return detail
}

function shouldRetryWithSmallerBatch(detail) {
  const text = String(detail ?? '').toLowerCase()
  return (
    text.includes('compute resources') ||
    text.includes('worker') ||
    text.includes('timeout') ||
    text.includes('resource') ||
    text.includes('function failed')
  )
}

async function invokeStudentBatch({ institutionId, students, batchSize }) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'bulk_create_students',
      institution_id: institutionId,
      students,
    },
  })

  if (error) {
    const detail = await readInvokeErrorDetail(error)
    if (students.length > MIN_STUDENT_ACCESS_BATCH_SIZE && shouldRetryWithSmallerBatch(detail)) {
      const smallerBatchSize = Math.max(MIN_STUDENT_ACCESS_BATCH_SIZE, Math.ceil(batchSize / 2))
      let retriedResult = emptyAccessResult()

      for (const chunk of chunkRows(students, smallerBatchSize)) {
        const chunkResult = await invokeStudentBatch({
          institutionId,
          students: chunk,
          batchSize: smallerBatchSize,
        })
        retriedResult = mergeAccessResult(retriedResult, chunkResult)
      }

      return retriedResult
    }

    throw new Error(`No se pudieron crear los accesos de alumnos. ${detail}`)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export async function provisionStudentAccess({ institutionId, students, useRemote }) {
  if (!institutionId) {
    throw new Error('No hay una institucion activa para crear accesos de alumnos.')
  }

  if (!Array.isArray(students) || students.length === 0) {
    throw new Error('Carga primero el padron de alumnos antes de crear accesos.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    throw new Error('La creacion de accesos requiere una sesion remota con Supabase configurado.')
  }

  const { pending, withAccess } = splitStudentsByAccessStatus(students)

  if (pending.length === 0) {
    return {
      ...emptyAccessResult(),
      skippedExisting: withAccess.length,
      totalRequested: students.length,
    }
  }

  let result = emptyAccessResult()
  const normalizedStudents = pending.map(normalizeStudentForAccess)

  const batchResults = await mapWithConcurrency(
    chunkRows(normalizedStudents),
    STUDENT_ACCESS_CONCURRENCY,
    (studentBatch) => invokeStudentBatch({
      institutionId,
      students: studentBatch,
      batchSize: STUDENT_ACCESS_BATCH_SIZE,
    }),
  )

  for (const batchResult of batchResults) {
    result = mergeAccessResult(result, batchResult)
  }

  return {
    ...result,
    skippedExisting: withAccess.length,
    totalRequested: students.length,
  }
}

// Decision de Miguel (20/10): cuentas de alumno que quedaron a medias (cuenta creada, legajo sin vincular)
// tras un corte en "Crear accesos". "Crear accesos" las rechaza a proposito; esta accion aparte las repara
// solo si la cuenta nunca se uso (la Edge valida todo). Se mandan los alumnos del padron sin acceso vinculado.
export const INCOMPLETE_ACCESS_PATTERN = /sin vinculo inequivoco|no autorizada o ambigua/i

export function hasIncompleteStudentAccess(result) {
  return Boolean(result?.needsRepair) ||
    (Array.isArray(result?.errors) && result.errors.some((entry) => INCOMPLETE_ACCESS_PATTERN.test(String(entry?.error ?? ''))))
}

export async function repairStudentAccess({ institutionId, students, useRemote }) {
  if (!institutionId) throw new Error('No hay una institucion activa para reparar accesos.')
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    throw new Error('Reparar accesos requiere una sesion remota con Supabase configurado.')
  }
  const emails = [...new Set(splitStudentsByAccessStatus(students).pending
    .map((student) => clean(student?.email ?? student?.correo ?? student?.mail).toLowerCase())
    .filter(Boolean))]
  if (emails.length === 0) return { repaired: 0, failed: 0, withoutAccount: 0, results: [], errors: [] }

  let merged = { repaired: 0, failed: 0, withoutAccount: 0, results: [], errors: [] }
  for (const batch of chunkRows(emails, 100)) {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'repair_student_access', institution_id: institutionId, emails: batch },
    })
    if (error) throw new Error(`No se pudieron reparar los accesos. ${await readInvokeErrorDetail(error)}`)
    if (data?.error) throw new Error(data.error)
    merged = {
      repaired: merged.repaired + (data?.repaired ?? 0),
      failed: merged.failed + (data?.failed ?? 0),
      withoutAccount: merged.withoutAccount + (data?.without_account ?? 0),
      results: [...merged.results, ...(data?.results ?? [])],
      errors: [...merged.errors, ...(data?.errors ?? [])],
    }
  }
  return merged
}
