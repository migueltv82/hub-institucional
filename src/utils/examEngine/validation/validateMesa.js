import { ESTADOS_MESA, LLAMADOS, MAX_SUBJECTS_PER_MESA } from '../constants.js'
import {
  normalizeLlamado,
  normalizeMesaExamen,
} from '../contracts.js'
import { normalizeTeacherName } from '../normalize/teachers.js'
import { isNonGroupableSubject } from '../normalize/subjects.js'
import {
  mesaTieneTitular,
  obtenerTitularMesa,
} from '../rules/roleConflicts.js'

// Mesa validation enforces hard single-table rules.

const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_MESA))
const LLAMADOS_VALIDOS = new Set(Object.values(LLAMADOS))

export function getMesaSubjects(mesa = {}) {
  return Array.isArray(mesa.materiasAgrupadas) && mesa.materiasAgrupadas.length
    ? mesa.materiasAgrupadas
    : [mesa]
}

function normalizeValidationOptions(options = {}) {
  if (Array.isArray(options)) return { docentes: options }
  return options && typeof options === 'object' ? options : {}
}

function getMesaId(mesa = {}) {
  return String(mesa.id ?? mesa.mesaId ?? mesa.mesa ?? '').trim()
}

export function normalizeMesaParaValidacion(mesa = {}) {
  const normalizedMesa = normalizeMesaExamen(mesa)

  return {
    ...mesa,
    ...normalizedMesa,
    fechaIso: normalizedMesa.fecha || mesa.fechaIso || '',
    inicio: normalizedMesa.hora || mesa.inicio || '',
    exam_call: normalizedMesa.llamado || mesa.exam_call || '',
    titular_id: normalizedMesa.titularId || mesa.titular_id || '',
    titularId: normalizedMesa.titularId || mesa.titularId || '',
    vocal1: normalizedMesa.vocal1Id || mesa.vocal1 || '',
    vocal2: normalizedMesa.vocal2Id || mesa.vocal2 || '',
  }
}

function docenteEstaActivo(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function getDocenteKeys(docente = {}) {
  return [
    docente.id,
    docente.docenteId,
    docente.titular_id,
    docente.dni,
    docente.email,
    docente.nombre,
    docente.full_name,
    docente.profesor,
  ].map(normalizeTeacherName).filter(Boolean)
}

function findDocenteByTitularId(docentes = [], titularId = '') {
  const titularKey = normalizeTeacherName(titularId)
  if (!titularKey) return null

  return docentes.find((docente) => getDocenteKeys(docente).includes(titularKey)) ?? null
}

function createTitularError({ code, mesa, severity = 'CRITICAL', titularId = obtenerTitularMesa(mesa) }) {
  return {
    valid: false,
    mesaId: getMesaId(mesa),
    titularId,
    error: code,
    severity,
  }
}

export function validarTitularObligatorio(mesa = {}, docentes = []) {
  const normalizedMesa = normalizeMesaParaValidacion(mesa)
  const titularId = obtenerTitularMesa(normalizedMesa)

  if (!mesaTieneTitular(normalizedMesa)) {
    return createTitularError({
      code: titularId ? 'TITULAR_A_DESIGNAR' : 'TITULAR_REQUIRED',
      mesa: normalizedMesa,
      titularId,
    })
  }

  if (Array.isArray(docentes) && docentes.length) {
    const docente = findDocenteByTitularId(docentes, titularId)

    if (!docente) {
      return createTitularError({ code: 'TITULAR_NOT_FOUND', mesa: normalizedMesa, titularId })
    }

    if (!docenteEstaActivo(docente)) {
      return createTitularError({ code: 'TITULAR_INACTIVE', mesa: normalizedMesa, titularId })
    }
  }

  return {
    valid: true,
    mesaId: getMesaId(normalizedMesa),
    titularId,
    severity: 'WARNING',
  }
}

function createMesaError({ code, message, mesaId, severity = 'critical', extra = {} }) {
  return {
    code,
    message,
    severity,
    mesaId,
    ...extra,
  }
}

function createMesaWarning({ code, message, mesaId, extra = {} }) {
  return {
    code,
    message,
    severity: 'warning',
    mesaId,
    ...extra,
  }
}

export function validateMesa(mesa = {}, options = {}) {
  const { docentes = [] } = normalizeValidationOptions(options)
  const normalizedMesa = normalizeMesaParaValidacion(mesa)
  const mesaId = getMesaId(normalizedMesa)
  const errors = []
  const warnings = []
  const subjects = getMesaSubjects(mesa)
  const titularValidation = validarTitularObligatorio(normalizedMesa, docentes)

  if (!titularValidation.valid) {
    errors.push(createMesaError({
      code: titularValidation.error,
      message: 'Mesa must have titular teacher.',
      mesaId: titularValidation.mesaId,
      extra: { titularId: titularValidation.titularId },
    }))
  }

  if (subjects.length > MAX_SUBJECTS_PER_MESA) {
    errors.push(createMesaError({
      code: 'MAX_GROUPED_SUBJECTS',
      message: `Mesa groups more than ${MAX_SUBJECTS_PER_MESA} subjects.`,
      mesaId,
    }))
  }

  if (subjects.some(isNonGroupableSubject) && subjects.length > 1) {
    errors.push(createMesaError({
      code: 'NON_GROUPABLE_SUBJECT',
      message: 'Practicas Discursivas III and IV cannot be grouped.',
      mesaId,
    }))
  }

  if (normalizedMesa.estado && !ESTADOS_VALIDOS.has(normalizedMesa.estado)) {
    warnings.push(createMesaWarning({
      code: 'INVALID_MESA_STATUS',
      message: 'Mesa status is not a canonical exam engine status.',
      mesaId,
      extra: { estado: normalizedMesa.estado },
    }))
  }

  if (normalizedMesa.llamado && !LLAMADOS_VALIDOS.has(normalizeLlamado(normalizedMesa.llamado))) {
    warnings.push(createMesaWarning({
      code: 'INVALID_LLAMADO',
      message: 'Mesa call is not a canonical exam engine call.',
      mesaId,
      extra: { llamado: normalizedMesa.llamado },
    }))
  }

  const titularKey = normalizeTeacherName(normalizedMesa.titularId)
  const vocal1Key = normalizeTeacherName(normalizedMesa.vocal1Id)
  const vocal2Key = normalizeTeacherName(normalizedMesa.vocal2Id)

  if (vocal1Key && vocal2Key && vocal1Key === vocal2Key) {
    errors.push(createMesaError({
      code: 'DUPLICATED_VOCALES',
      message: 'A mesa cannot have the same docente assigned as both vocales.',
      mesaId,
      extra: {
        vocal1Id: normalizedMesa.vocal1Id,
        vocal2Id: normalizedMesa.vocal2Id,
      },
    }))
  }

  if (titularKey && [vocal1Key, vocal2Key].some((vocalKey) => vocalKey && vocalKey === titularKey)) {
    errors.push(createMesaError({
      code: 'TITULAR_AS_VOCAL',
      message: 'The titular cannot be assigned as vocal in the same mesa.',
      mesaId,
      extra: { titularId: normalizedMesa.titularId },
    }))
  }

  return {
    valid: errors.length === 0,
    mesaId,
    errors,
    warnings,
    mesa: normalizedMesa,
  }
}
