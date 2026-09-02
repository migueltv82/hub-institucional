import { DOCENTE_A_DESIGNAR } from '../constants.js'
import { normalizeText } from './subjects.js'

// Teacher normalization helpers. A designar is never treated as a real teacher.

export function getTeacherName(teacher = {}) {
  if (typeof teacher === 'string') return teacher.trim()

  return String(
    teacher.profesor ??
    teacher.docente ??
    teacher.full_name ??
    teacher.nombre ??
    teacher.display_name ??
    '',
  ).trim()
}

export function normalizeTeacherName(teacher) {
  return normalizeText(getTeacherName(teacher))
}

export function isAssignedTeacher(teacher) {
  const name = getTeacherName(teacher)
  return Boolean(name && name !== DOCENTE_A_DESIGNAR)
}

export function getTeacherAttendanceDays(teacherRows = []) {
  return teacherRows.reduce((map, row) => {
    const teacherKey = normalizeTeacherName(row)
    const day = normalizeText(row?.dia ?? row?.day)
    if (!teacherKey || !day) return map

    const days = map.get(teacherKey) ?? new Set()
    days.add(day)
    map.set(teacherKey, days)
    return map
  }, new Map())
}

export function getTeacherIdentity(teacher = {}) {
  return {
    key: normalizeTeacherName(teacher),
    name: getTeacherName(teacher),
    dni: String(teacher.dni ?? teacher.documento ?? '').trim(),
    email: String(teacher.email ?? teacher.correo ?? teacher.mail ?? '').trim(),
  }
}

