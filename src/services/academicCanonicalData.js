import { fetchStudentRecords } from './rosterRecords.js'
import { fetchInstitutionStudentGrades } from './studentGrades.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value).toLowerCase()
}

function uniqueMatch(rows, predicate) {
  const matches = rows.filter(predicate)
  return matches.length === 1 ? matches[0] : null
}

export function findCanonicalStudentRecord(student, records = []) {
  const recordId = clean(student?.student_record_id ?? student?.record_id)
  if (recordId) {
    const match = records.find((record) => clean(record?.id) === recordId)
    if (match) return match
  }

  const profileId = clean(student?.profile_id ?? student?.user_id ?? student?.student_id)
  if (profileId) {
    const match = uniqueMatch(records, (record) => clean(record?.profile_id) === profileId)
    if (match) return match
  }

  const email = normalize(student?.email)
  const career = normalize(student?.carrera ?? student?.career)
  if (email && career) {
    const match = uniqueMatch(records, (record) => (
      normalize(record?.email) === email && normalize(record?.career) === career
    ))
    if (match) return match
  }

  const dni = normalize(student?.dni)
  if (dni) return uniqueMatch(records, (record) => normalize(record?.dni) === dni)
  if (email) return uniqueMatch(records, (record) => normalize(record?.email) === email)
  return null
}

export function canonicalizeStudent(student, records = []) {
  const record = findCanonicalStudentRecord(student, records)
  if (!record) return student

  return {
    ...student,
    // Contrato canónico: id visual/legacy se conserva, pero cada identidad
    // relacional tiene un único campo y significado en toda la aplicación.
    student_record_id: clean(record.id),
    record_id: clean(record.id),
    profile_id: clean(record.profile_id) || null,
    user_id: clean(record.profile_id) || null,
    student_id: clean(record.profile_id) || null,
    email: clean(record.email) || clean(student?.email),
    dni: clean(record.dni) || clean(student?.dni),
    full_name: clean(record.full_name) || clean(student?.full_name),
    carrera: clean(record.career) || clean(student?.carrera),
    anio: clean(record.academic_year) || clean(student?.anio),
    academic_identity_source: 'student_records',
  }
}

export function canonicalizeStudentRoster(students = [], records = []) {
  return students.map((student) => canonicalizeStudent(student, records))
}

export async function fetchInstitutionAcademicCanonicalData({
  institutionId,
  workspaceKey = 'main',
  useRemote,
}) {
  if (!useRemote || !institutionId) return { grades: [], studentRecords: [] }

  const [studentRecords, grades] = await Promise.all([
    fetchStudentRecords({ institutionId, workspaceKey, useRemote }),
    fetchInstitutionStudentGrades({ institutionId, workspaceKey }),
  ])

  return { grades, studentRecords }
}
