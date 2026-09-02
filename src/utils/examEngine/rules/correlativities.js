import { compareIsoDates } from '../normalize/dates.js'
import { getSubjectKey } from '../normalize/subjects.js'

// Institutional rule: correlativities cannot be inverted.

export function buildMesaBySubjectKey(cronograma = []) {
  return cronograma.reduce((map, mesa) => {
    map.set(getSubjectKey(mesa), mesa)
    return map
  }, new Map())
}

export function validateCorrelativeOrder({ mesaPrevia, mesaPosterior } = {}) {
  if (!mesaPrevia || !mesaPosterior) {
    return { valid: true, warning: null, error: null }
  }

  const order = compareIsoDates(mesaPrevia.fechaIso, mesaPosterior.fechaIso)
  if (order > 0) {
    return {
      valid: false,
      warning: null,
      error: 'Correlativity order is inverted.',
    }
  }

  return {
    valid: true,
    warning: order === 0 ? 'Correlative subjects are scheduled on the same date.' : null,
    error: null,
  }
}

export function validateNoInvertedCorrelativities({ cronograma = [], correlatividades = [] } = {}) {
  const mesaBySubject = buildMesaBySubjectKey(cronograma)
  const errors = []
  const warnings = []

  correlatividades.forEach((row) => {
    const posterior = mesaBySubject.get(getSubjectKey(row))
    const previas = Array.isArray(row.correlativas) ? row.correlativas : []

    previas.forEach((previa) => {
      const previaMesa = mesaBySubject.get(getSubjectKey({ ...row, materia: previa, codigo: previa }))
      const result = validateCorrelativeOrder({ mesaPrevia: previaMesa, mesaPosterior: posterior })
      if (result.error) {
        errors.push({
          code: 'CORRELATIVITY_INVERTED',
          message: result.error,
          severity: 'critical',
          row,
        })
      }
      if (result.warning) warnings.push({ code: 'CORRELATIVITY_SAME_DAY', message: result.warning, row })
    })
  })

  return { valid: errors.length === 0, errors, warnings }
}
