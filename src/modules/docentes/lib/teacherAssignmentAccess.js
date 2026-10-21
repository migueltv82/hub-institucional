// Gate Codex P1 (21/10): espejo en el portal docente de public.academic_teacher_assignment_grants_access (06).
// La base es la autoridad: esto solo decide que se muestra. "Hoy" en UTC, como current_date del servidor.

function clean(value) {
  return String(value ?? '').trim()
}

function isoDate(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(clean(value))
  return match ? match[1] : ''
}

function inWindow(startsOn, endsOn, today) {
  return (!startsOn || startsOn <= today) && (!endsOn || today <= endsOn)
}

export function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

export function isLeaveReplacement(assignment = {}) {
  const metadata = assignment.metadata ?? {}
  return Boolean(
    clean(assignment.replaces_assignment_id)
    || clean(metadata.leave_parent_assignment_id)
    || clean(assignment.source) === 'leave'
    || clean(assignment.source) === 'teacher_leave_replacement',
  )
}

// { visible, onLeave, effectiveRole }
// - Fuera de su propia vigencia (starts_on / ends_on de la fila o de su metadata) no se muestra.
// - Un titular en licencia se muestra "en licencia" solo durante el periodo; antes y despues, como titular.
export function teacherAssignmentAccessState(assignment = {}, today = utcToday()) {
  const metadata = assignment.metadata ?? {}
  const role = clean(assignment.role)
  const ownStartsOn = isoDate(assignment.starts_on ?? metadata.starts_on)
  const ownEndsOn = isoDate(assignment.ends_on ?? metadata.ends_on)
  if (!inWindow(ownStartsOn, ownEndsOn, today)) return { visible: false, onLeave: false, effectiveRole: role }

  if (role === 'licencia') {
    const onLeave = inWindow(isoDate(metadata.leave_starts_on), isoDate(metadata.leave_ends_on), today)
    return { visible: true, onLeave, effectiveRole: onLeave ? 'licencia' : clean(metadata.original_role) || 'titular' }
  }
  return { visible: true, onLeave: false, effectiveRole: role }
}
