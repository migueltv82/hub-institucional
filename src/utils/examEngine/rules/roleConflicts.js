import { normalizeTeacherName } from '../normalize/teachers.js'

// A teacher cannot be titular and common vocal on the same date. That check
// is enforced by validateTribunals.js (TITULAR_AS_VOCAL /
// PARTICIPACION_TITULAR_COMO_VOCAL) against real ROLES_PARTICIPACION values.

const A_DESIGNAR_KEY = normalizeTeacherName('A designar')

function clean(value) {
  return String(value ?? '').trim()
}

export function obtenerTitularMesa(mesa = {}) {
  return clean(
    mesa.titular_id ??
    mesa.titularId ??
    mesa.presidente_id ??
    mesa.profesorTitular ??
    mesa.titular?.id ??
    mesa.titular?.nombre ??
    '',
  )
}

export function mesaTieneTitular(mesa = {}) {
  const titular = obtenerTitularMesa(mesa)
  if (!titular) return false
  return normalizeTeacherName(titular) !== A_DESIGNAR_KEY
}
