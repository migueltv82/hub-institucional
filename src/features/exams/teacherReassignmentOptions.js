import { teacherIsAvailableOnDate } from '../../utils/examEngine/rules/availability.js'
import { normalizeText } from '../../utils/examEngine/normalize/subjects.js'

function clean(value) {
  return String(value ?? '').trim()
}

function getExamTableId(mesa) {
  return clean(mesa?.draftMesaId ?? mesa?.exam_table_id ?? mesa?.id)
}

function getExamDate(mesa) {
  return clean(mesa?.fechaSugerida ?? mesa?.fecha ?? mesa?.metadata?.fecha)
}

function getCareer(mesa) {
  return clean(mesa?.carrera ?? mesa?.program_id ?? mesa?.metadata?.carrera)
}

function getTime(mesa, field) {
  return clean(mesa?.[field] ?? mesa?.metadata?.[field])
}

function minutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clean(value))
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function overlaps(left, right) {
  if (getExamDate(left) !== getExamDate(right)) return false

  const leftStart = minutes(getTime(left, 'inicio'))
  const leftEnd = minutes(getTime(left, 'fin'))
  const rightStart = minutes(getTime(right, 'inicio'))
  const rightEnd = minutes(getTime(right, 'fin'))

  // Sin franja precisa, dos mesas del mismo dia se consideran conflicto.
  if ([leftStart, leftEnd, rightStart, rightEnd].some((value) => value === null)) return true
  return leftStart < rightEnd && rightStart < leftEnd
}

function getAvailabilityEntries(teacher) {
  return [
    teacher?.dia,
    teacher?.day,
    teacher?.diasAsistencia,
    teacher?.diasDisponibles,
    teacher?.diasLaborales,
    teacher?.disponibilidad,
    teacher?.fechasDisponibles,
    teacher?.availability,
  ].flat().filter(Boolean)
}

function targetRoleFor(mesa, sourceRole) {
  if (sourceRole === 'TITULAR') {
    return { role: 'TITULAR', occupied: Boolean(clean(mesa?.titularId)) }
  }
  if (!clean(mesa?.vocal1Id)) return { role: 'VOCAL_1', occupied: false }
  if (!clean(mesa?.vocal2Id)) return { role: 'VOCAL_2', occupied: false }
  const role = sourceRole === 'VOCAL_2' ? 'VOCAL_2' : 'VOCAL_1'
  return { role, occupied: true }
}

/**
 * Propone movimientos individuales que no reemplazan a otro integrante.
 * La mesa destino debe pertenecer a la misma carrera y tener un puesto vacante.
 */
export function buildTeacherReassignmentOptions({
  objectedAssignment,
  mesas = [],
  teacher = {},
  teacherAssignments = [],
} = {}) {
  const sourceExamTableId = clean(objectedAssignment?.exam_table_id)
  const sourceRole = clean(objectedAssignment?.role)
  const sourceCareer = normalizeText(objectedAssignment?.metadata?.carrera)
  if (!sourceExamTableId || !sourceRole || !sourceCareer) return []
  const hasExplicitAvailability = getAvailabilityEntries(teacher).length > 0

  return mesas.flatMap((mesa) => {
    const targetExamTableId = getExamTableId(mesa)
    const targetDate = getExamDate(mesa)
    if (!targetExamTableId || targetExamTableId === sourceExamTableId || !targetDate) return []
    if (normalizeText(getCareer(mesa)) !== sourceCareer) return []
    if (hasExplicitAvailability && !teacherIsAvailableOnDate(teacher, targetDate)) return []

    const alreadyAssigned = teacherAssignments.some((assignment) => (
      clean(assignment?.exam_table_id) === targetExamTableId && assignment?.status !== 'inactive'
    ))
    if (alreadyAssigned) return []

    const hasConflict = teacherAssignments.some((assignment) => {
      if (clean(assignment?.exam_table_id) === sourceExamTableId || assignment?.status === 'inactive') return false
      return overlaps(assignment?.metadata ?? assignment, mesa)
    })
    if (hasConflict) return []

    const target = targetRoleFor(mesa, sourceRole)
    return [{
      sourceExamTableId,
      sourceRole,
      targetExamTableId,
      targetRole: target.role,
      fecha: targetDate,
      inicio: getTime(mesa, 'inicio'),
      fin: getTime(mesa, 'fin'),
      turno: getTime(mesa, 'turno'),
      carrera: getCareer(mesa),
      materia: clean(mesa?.materiaMesa ?? mesa?.materia ?? mesa?.metadata?.materia),
      requiresSwap: target.occupied,
      reason: target.occupied ? 'ROLE_SWAP_REQUIRED' : 'VACANT_ROLE_SAME_CAREER',
    }]
  }).sort((left, right) => (
    left.fecha.localeCompare(right.fecha) ||
    left.inicio.localeCompare(right.inicio) ||
    left.materia.localeCompare(right.materia)
  ))
}
