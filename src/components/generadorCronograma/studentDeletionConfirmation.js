function clean(value) {
  return String(value ?? '').trim()
}

export function getStudentConfirmationName(student) {
  return clean(student?.full_name)
    || [clean(student?.nombre), clean(student?.apellido)].filter(Boolean).join(' ')
    || clean(student?.email)
    || clean(student?.dni)
    || 'este alumno'
}

export function confirmStudentDeletion(student, confirmAction = window.confirm) {
  const studentName = getStudentConfirmationName(student)
  const firstConfirmation = confirmAction(
    `¿Querés eliminar a ${studentName} del padrón institucional?\n\nDejará de aparecer en el listado de alumnos. Su historial académico no se borrará automáticamente.`,
  )

  if (!firstConfirmation) return false

  return confirmAction(
    `CONFIRMACIÓN FINAL\n\n¿Eliminar a ${studentName}?\n\nEsta acción no se puede deshacer desde esta pantalla.`,
  )
}
