import {
  isParticipacionTitular,
  isParticipacionTribunalCruzado,
  isParticipacionVocalia,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import {
  getNivelAfinidadDocenteMesa,
  isAfinidadDebil,
} from '../rules/affinities.js'

function clean(value) {
  return String(value ?? '').trim()
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)

  return clean(
    docente.id ??
    docente.docenteId ??
    docente.teacherKey ??
    docente.dni ??
    docente.email ??
    docente.nombre,
  )
}

function getDocenteKeys(docente = {}) {
  return [
    docente.id,
    docente.docenteId,
    docente.teacherKey,
    docente.dni,
    docente.email,
    docente.nombre,
    docente.full_name,
    docente.profesor,
  ].map(normalizeText).filter(Boolean)
}

function getMesaId(mesa = {}) {
  return clean(mesa.id ?? mesa.mesaId ?? mesa.mesa)
}

function getParticipacionDocenteId(participacion = {}) {
  return clean(
    participacion.docenteId ??
    participacion.teacherKey ??
    participacion.teacherId ??
    participacion.docente?.id ??
    participacion.docente ??
    participacion.profesor,
  )
}

function buildDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

function buildMesaMap(mesas = []) {
  return mesas.reduce((map, mesa) => {
    const mesaId = getMesaId(mesa)
    if (mesaId) map.set(mesaId, mesa)
    return map
  }, new Map())
}

export function validarAfinidadVocales(docentes = [], mesas = [], participaciones = [], options = {}) {
  const docenteMap = buildDocenteMap(docentes)
  const mesaMap = buildMesaMap(mesas)
  const errors = []
  const warnings = []
  const resumenAfinidades = []

  participaciones.forEach((participacion) => {
    if (isParticipacionTitular(participacion) || isParticipacionTribunalCruzado(participacion)) return
    if (!isParticipacionVocalia(participacion)) return

    const docenteId = getParticipacionDocenteId(participacion)
    const mesaId = clean(participacion.mesaId ?? participacion.mesa_id)
    const docente = docenteMap.get(normalizeText(docenteId))
    const mesa = mesaMap.get(mesaId)

    if (!docente || !mesa) {
      warnings.push({
        code: 'VOCAL_AFINIDAD_NO_EVALUADA',
        message: 'No se pudo evaluar la afinidad del vocal por datos incompletos.',
        severity: 'warning',
        docenteId,
        mesaId,
        rol: participacion.rol,
      })
      resumenAfinidades.push({
        docenteId,
        mesaId,
        rol: participacion.rol,
        afinidadValida: false,
        nivelAfinidad: 'NO_EVALUADA',
        motivo: 'Datos incompletos para evaluar afinidad.',
      })
      return
    }

    const affinity = getNivelAfinidadDocenteMesa(docente, mesa, options)
    const resumen = {
      docenteId: getDocenteId(docente),
      mesaId,
      rol: participacion.rol,
      afinidadValida: affinity.afinidadValida,
      nivelAfinidad: affinity.nivelAfinidad,
      motivo: affinity.motivo,
    }
    resumenAfinidades.push(resumen)

    if (!affinity.afinidadValida) {
      errors.push({
        code: 'VOCAL_SIN_AFINIDAD',
        message: 'El vocal no tiene afinidad o idoneidad academica con la mesa.',
        severity: 'critical',
        docenteId: resumen.docenteId,
        mesaId,
        rol: participacion.rol,
        nivelAfinidad: affinity.nivelAfinidad,
        motivo: affinity.motivo,
      })
      return
    }

    if (isAfinidadDebil(affinity.nivelAfinidad)) {
      warnings.push({
        code: 'VOCAL_AFINIDAD_DEBIL',
        message: 'La afinidad del vocal es valida pero requiere revision institucional.',
        severity: 'warning',
        docenteId: resumen.docenteId,
        mesaId,
        rol: participacion.rol,
        nivelAfinidad: affinity.nivelAfinidad,
        motivo: affinity.motivo,
      })
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resumenAfinidades,
  }
}
