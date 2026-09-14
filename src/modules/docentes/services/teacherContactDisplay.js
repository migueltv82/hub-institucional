function clean(value) {
  return String(value ?? '').trim()
}

export function isTeacherTechnicalEmail(value) {
  const email = clean(value).toLowerCase()
  return /^[^@\s]+@docentes\.[^@\s]+\.local$/.test(email)
}

export function getTeacherVisibleEmail(value) {
  const email = clean(value)
  return isTeacherTechnicalEmail(email) ? '' : email
}
