import { createEmptyGenerationReport, normalizeLlamado } from '../contracts.js'

// Internal reports translate pipeline artifacts into an institutional review view.

const CRITICAL_SEVERITIES = new Set(['critical', 'error', 'fatal'])
const CALLS = ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO', 'LLAMADO_ESPECIAL']

const ACTIONS_BY_CODE = {
  MATERIA_SIN_TITULAR: 'Revisar titular de la materia.',
  TITULAR_REQUIRED: 'Revisar titular de la materia.',
  TITULAR_NOT_FOUND: 'Revisar titular de la materia.',
  TITULAR_INACTIVE: 'Revisar titular de la materia.',
  TITULAR_NO_DISPONIBLE: 'Agregar disponibilidad docente.',
  VOCAL_NO_DISPONIBLE: 'Agregar disponibilidad docente.',
  DOCENTE_SUPERPUESTO: 'Agregar disponibilidad docente.',
  SIN_FECHA_VALIDA: 'Agregar fechas disponibles para el llamado.',
  VOCAL_SIN_AFINIDAD: 'Asignar vocal con afinidad academica.',
  VOCAL_NOT_FOUND: 'Asignar vocal con afinidad academica.',
  DUPLICATED_VOCALES: 'Asignar vocal con afinidad academica.',
  TITULAR_AS_VOCAL: 'Asignar vocal con afinidad academica.',
  DOCENTE_EXCEDE_LIMITE_VOCALIAS: 'Revisar limite de vocalias por llamado.',
  CORRELATIVIDAD_CONFLICTIVA: 'Revisar correlatividad.',
  CORRELATIVIDAD_MISMO_DIA: 'Revisar correlatividad.',
  LLAMADO_NO_REQUERIDO: 'Revisar configuracion de llamados.',
  COMPACTACION_NO_SEGURA: 'Validar manualmente compactaciones omitidas por riesgo.',
  MATERIA_NO_AGRUPABLE: 'Validar manualmente compactaciones omitidas por riesgo.',
}

function clean(value) {
  return String(value ?? '').trim()
}

function clonePlain(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((entry) => clonePlain(entry, seen))
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'report')
      .map(([key, entry]) => [key, clonePlain(entry, seen)]),
  )
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function getSeverity(item = {}, fallback = 'warning') {
  return clean(item.severity || fallback).toLowerCase() || fallback
}

function isCritical(item = {}) {
  return CRITICAL_SEVERITIES.has(getSeverity(item))
}

function getMesaId(value = {}) {
  return clean(value.mesaId ?? value.id ?? value.mesa)
}

function getMateria(value = {}) {
  return clean(value.materia ?? value.nombreMateria ?? value.subjectName ?? value.materiaId)
}

function getCarrera(value = {}) {
  return clean(value.carrera ?? value.nombreCarrera ?? value.careerName ?? value.carreraId)
}

function getDocenteNombre(value = {}) {
  return clean(value.docenteNombre ?? value.nombreDocente ?? value.teacherName ?? value.docente?.nombre)
}

function suggestedActionFor(item = {}) {
  const code = clean(item.code)
  if (ACTIONS_BY_CODE[code]) return ACTIONS_BY_CODE[code]
  if (code.includes('CORRELATIVIDAD')) return 'Revisar correlatividad.'
  if (code.includes('FECHA')) return 'Agregar fechas disponibles para el llamado.'
  if (code.includes('DISPONIBLE') || code.includes('DISPONIBILIDAD')) return 'Agregar disponibilidad docente.'
  if (code.includes('TITULAR')) return 'Revisar titular de la materia.'
  if (code.includes('VOCAL') || code.includes('TRIBUNAL')) return 'Asignar vocal con afinidad academica.'
  return 'Revisar el caso en forma manual.'
}

function normalizeIssue(item = {}, defaultStage = '') {
  return {
    code: clean(item.code) || 'PIPELINE_ISSUE',
    message: clean(item.message) || clean(item.detail) || 'El pipeline informo una incidencia.',
    severity: getSeverity(item, 'warning'),
    mesaId: getMesaId(item),
    materia: getMateria(item),
    carrera: getCarrera(item),
    docenteId: clean(item.docenteId ?? item.teacherId ?? item.profesorId),
    docenteNombre: getDocenteNombre(item),
    stage: clean(item.stage) || defaultStage,
    llamado: normalizeLlamado(item.llamado ?? item.exam_call ?? item.callKey),
    fecha: clean(item.fecha ?? item.fechaIso ?? item.date),
    reason: clean(item.reason),
    limite: item.limite ?? null,
    vocaliasAsignadas: item.vocaliasAsignadas ?? null,
    suggestedAction: clean(item.suggestedAction) || suggestedActionFor(item),
  }
}

function collectMesaIssues(mesas = [], severity) {
  return mesas.flatMap((mesa) => [
    ...asArray(mesa.errors).map((error) => ({
      ...error,
      mesaId: error.mesaId ?? mesa.id,
      materia: error.materia ?? mesa.materia,
      carrera: error.carrera ?? mesa.carrera,
      llamado: error.llamado ?? mesa.llamado ?? mesa.exam_call,
      fecha: error.fecha ?? mesa.fecha ?? mesa.fechaIso,
      reason: error.reason ?? mesa.reason,
    })),
    ...asArray(mesa.warnings).map((warning) => ({
      ...warning,
      mesaId: warning.mesaId ?? mesa.id,
      materia: warning.materia ?? mesa.materia,
      carrera: warning.carrera ?? mesa.carrera,
      llamado: warning.llamado ?? mesa.llamado ?? mesa.exam_call,
      fecha: warning.fecha ?? mesa.fecha ?? mesa.fechaIso,
      reason: warning.reason ?? mesa.reason,
    })),
  ]).filter((issue) => (severity === 'critical' ? isCritical(issue) : !isCritical(issue)))
}

function issueKey(item = {}) {
  return [
    item.code,
    item.stage,
    item.mesaId,
    item.docenteId,
    item.message,
  ].join('::')
}

function dedupeIssues(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const key = issueKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeIssues(input = {}, severity) {
  const direct = severity === 'critical' ? asArray(input.errors) : asArray(input.warnings)
  const mesaIssues = [
    ...collectMesaIssues(input.plannedMesas, severity),
    ...collectMesaIssues(input.unassignedMesas, severity),
    ...collectMesaIssues(input.mesasCompactadas, severity),
  ]

  return dedupeIssues([...direct, ...mesaIssues].map((issue) => normalizeIssue(issue)))
}

function hasFechaTentativa(mesa = {}) {
  return Boolean(clean(mesa.fechaIso ?? mesa.fecha))
}

function countVocales(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id, mesa.vocal1, mesa.vocal2].filter(clean).length
}

function isMesaCompleta(mesa = {}) {
  return Boolean(clean(mesa.titularId ?? mesa.titular_id)) && countVocales(mesa) >= 2
}

function summarizeTables(input = {}) {
  const mesas = [...asArray(input.plannedMesas), ...asArray(input.unassignedMesas)]
  const porEstado = mesas.reduce((summary, mesa) => {
    const estado = clean(mesa.estado) || 'SIN_ESTADO'
    summary[estado] = (summary[estado] ?? 0) + 1
    return summary
  }, {})

  return {
    total: mesas.length,
    completas: mesas.filter(isMesaCompleta).length,
    conUnVocal: mesas.filter((mesa) => clean(mesa.titularId ?? mesa.titular_id) && countVocales(mesa) === 1).length,
    sinTribunal: mesas.filter((mesa) => !clean(mesa.titularId ?? mesa.titular_id) || countVocales(mesa) === 0).length,
    conFechaTentativa: mesas.filter(hasFechaTentativa).length,
    sinFechaTentativa: mesas.filter((mesa) => !hasFechaTentativa(mesa)).length,
    pendientesRevision: mesas.filter((mesa) => (
      clean(mesa.estado) === 'PENDIENTE_REVISION' ||
      asArray(mesa.errors).length > 0 ||
      asArray(mesa.warnings).length > 0 ||
      !isMesaCompleta(mesa) ||
      !hasFechaTentativa(mesa)
    )).length,
    porEstado,
  }
}

function createTeacherEntry(docenteId, nombre = '') {
  return {
    docenteId,
    nombre,
    titularidades: 0,
    vocalias: 0,
    tribunalesCruzados: 0,
    limiteVocaliasPorLlamado: null,
    enLimite: false,
    excedido: false,
    warnings: [],
  }
}

function addTeacher(summary, docenteId = '', nombre = '') {
  const key = clean(docenteId)
  if (!key) return null
  if (!summary.has(key)) summary.set(key, createTeacherEntry(key, clean(nombre)))
  const item = summary.get(key)
  if (!item.nombre && nombre) item.nombre = clean(nombre)
  return item
}

function getFinalMesasForReport(input = {}) {
  const finalMesas = [...asArray(input.plannedMesas), ...asArray(input.unassignedMesas)]
  if (finalMesas.length) return finalMesas

  const compactedMesas = asArray(input.mesasCompactadas)
  if (compactedMesas.length) return compactedMesas

  const repairedMesas = asArray(input.mesasReparadas)
  if (repairedMesas.length) return repairedMesas

  const vocalMesas = asArray(input.mesasConVocales)
  if (vocalMesas.length) return vocalMesas

  return asArray(input.mesasPreliminares)
}

function summarizeTeachers(input = {}) {
  const teachers = new Map()
  const mesas = getFinalMesasForReport(input)

  mesas.forEach((mesa) => {
    const titular = addTeacher(teachers, mesa.titularId ?? mesa.titular_id)
    if (titular) titular.titularidades += 1
    ;[mesa.vocal1Id, mesa.vocal2Id].filter(clean).forEach((docenteId) => {
      const vocal = addTeacher(teachers, docenteId)
      if (vocal) vocal.vocalias += 1
    })
    asArray(mesa.tribunalesCruzados).forEach((entry) => {
      const cruzado = addTeacher(teachers, entry.docenteId ?? entry.id ?? entry)
      if (cruzado) cruzado.tribunalesCruzados += 1
    })
  })

  asArray(input.metadata?.tribunalValidation?.participaciones).forEach((participacion) => {
    addTeacher(teachers, participacion.docenteId)
  })

  asArray(input.errors).concat(asArray(input.warnings)).forEach((issue) => {
    const teacher = addTeacher(teachers, issue.docenteId, issue.docenteNombre)
    if (teacher && !isCritical(issue)) teacher.warnings.push(normalizeIssue(issue))
  })

  asArray(input.metadata?.tribunalValidation?.errors).forEach((error) => {
    if (error.code !== 'DOCENTE_EXCEDE_LIMITE_VOCALIAS') return
    const teacher = addTeacher(teachers, error.docenteId)
    if (!teacher) return
    teacher.limiteVocaliasPorLlamado = error.limite ?? teacher.limiteVocaliasPorLlamado
    teacher.excedido = true
  })

  return [...teachers.values()].map((teacher) => ({
    ...teacher,
    enLimite: teacher.limiteVocaliasPorLlamado !== null && teacher.vocalias === teacher.limiteVocaliasPorLlamado,
  }))
}

function summarizeBy(items, keyGetter, initialData) {
  const map = new Map()
  items.forEach((mesa) => {
    const key = keyGetter(mesa)
    if (!key) return
    if (!map.has(key)) map.set(key, initialData(mesa, key))
    const row = map.get(key)
    row.totalMesas += 1
    if (isMesaCompleta(mesa)) row.completas += 1
    if (!hasFechaTentativa(mesa)) row.sinFecha += 1
  })
  return map
}

function countIssuesForGroup(issues = [], groupValue, field) {
  return issues.filter((issue) => clean(issue[field]) === clean(groupValue)).length
}

function summarizeCareers(input = {}, criticalErrors = [], warnings = []) {
  const mesas = [...asArray(input.plannedMesas), ...asArray(input.unassignedMesas)]
  const map = summarizeBy(
    mesas,
    (mesa) => clean(mesa.carreraId ?? mesa.carrera),
    (mesa, key) => ({
      carreraId: clean(mesa.carreraId) || key,
      carrera: clean(mesa.carrera) || key,
      totalMesas: 0,
      completas: 0,
      sinFecha: 0,
      errores: 0,
      advertencias: 0,
    }),
  )

  map.forEach((row) => {
    row.errores = countIssuesForGroup(criticalErrors, row.carrera, 'carrera') + countIssuesForGroup(criticalErrors, row.carreraId, 'carrera')
    row.advertencias = countIssuesForGroup(warnings, row.carrera, 'carrera') + countIssuesForGroup(warnings, row.carreraId, 'carrera')
  })

  return [...map.values()]
}

function summarizeCalls(input = {}, criticalErrors = [], warnings = []) {
  const mesas = [...asArray(input.plannedMesas), ...asArray(input.unassignedMesas)]
  const map = new Map(CALLS.map((llamado) => [llamado, {
    llamado,
    totalMesas: 0,
    conFecha: 0,
    sinFecha: 0,
    errores: 0,
    advertencias: 0,
  }]))
  const mesaCallIndex = new Map()

  mesas.forEach((mesa) => {
    const llamado = normalizeLlamado(mesa.llamado ?? mesa.exam_call)
    if (!llamado) return
    const mesaId = getMesaId(mesa)
    if (mesaId) mesaCallIndex.set(mesaId, llamado)
    if (!map.has(llamado)) map.set(llamado, { llamado, totalMesas: 0, conFecha: 0, sinFecha: 0, errores: 0, advertencias: 0 })
    const row = map.get(llamado)
    row.totalMesas += 1
    if (hasFechaTentativa(mesa)) row.conFecha += 1
    else row.sinFecha += 1
  })

  const addIssue = (issue, field) => {
    const normalizedCall = normalizeLlamado(issue.llamado) || mesaCallIndex.get(clean(issue.mesaId)) || 'SIN_LLAMADO'
    if (!map.has(normalizedCall)) {
      map.set(normalizedCall, {
        llamado: normalizedCall,
        totalMesas: 0,
        conFecha: 0,
        sinFecha: 0,
        errores: 0,
        advertencias: 0,
      })
    }
    map.get(normalizedCall)[field] += 1
  }

  criticalErrors.forEach((issue) => {
    addIssue(issue, 'errores')
  })
  warnings.forEach((issue) => {
    addIssue(issue, 'advertencias')
  })

  return [...map.values()].filter((row) => (
    row.totalMesas ||
    row.errores ||
    row.advertencias ||
    CALLS.includes(row.llamado)
  ))
}

function buildCompactationSummary(input = {}) {
  return {
    compactMode: input.summary?.compactMode ?? input.metadata?.compactMode ?? null,
    compactacionEjecutada: Boolean(input.metadata?.compactacionEjecutada),
    totalCompactaciones: Number(input.summary?.totalCompactaciones ?? asArray(input.metadata?.compactaciones).length) || 0,
    totalSkipped: asArray(input.metadata?.skippedCompactaciones).length,
    compactaciones: clonePlain(asArray(input.metadata?.compactaciones)),
    skipped: asArray(input.metadata?.skippedCompactaciones).map((item) => ({
      ...clonePlain(item),
      detail: clean(item.detail) || clean(item.reason) || 'Compactacion omitida.',
    })),
  }
}

function buildDatePlanningSummary(input = {}) {
  const stageSummary = input.summary?.stageSummaries?.tentativeDates ?? {}
  const unassigned = asArray(input.unassignedMesas)

  return {
    totalFechasTentativas: Number(stageSummary.mesasConFechaTentativa ?? input.plannedMesas?.length ?? 0) || 0,
    totalSinFecha: Number(stageSummary.mesasSinFecha ?? unassigned.length) || 0,
    conflictosDisponibilidad: Number(stageSummary.conflictosDisponibilidad ?? 0) || 0,
    conflictosCorrelatividad: Number(stageSummary.conflictosCorrelatividad ?? 0) || 0,
    mesasSinFecha: unassigned.map((mesa) => ({
      mesaId: getMesaId(mesa),
      materia: getMateria(mesa),
      carrera: getCarrera(mesa),
      llamado: normalizeLlamado(mesa.llamado ?? mesa.exam_call),
      reason: clean(mesa.reason),
      detail: clean(mesa.detail),
    })),
  }
}

function buildDecision(type, stage, mesaId, label, reason, impact = 'informativo', severity = 'info') {
  return { type, stage, mesaId: clean(mesaId), label, reason, impact, severity }
}

function buildDecisions(input = {}) {
  const decisions = []

  asArray(input.candidates).forEach((candidate) => {
    decisions.push(buildDecision('CANDIDATE_INCLUDED', 'BUILD_CANDIDATES', candidate.id, getMateria(candidate), 'Materia incluida como candidata.', 'Se intentara conformar mesa.'))
  })
  asArray(input.metadata?.candidateExclusions).forEach((item) => {
    decisions.push(buildDecision('CANDIDATE_EXCLUDED', 'BUILD_CANDIDATES', item.id ?? item.materiaId, getMateria(item), clean(item.reason) || 'Materia excluida.', 'Requiere revision si debia planificarse.', 'warning'))
  })
  asArray(input.mesasPreliminares).forEach((mesa) => {
    decisions.push(buildDecision('TITULAR_ASSIGNED', 'ASSIGN_TITULARES', mesa.id, getMateria(mesa), clean(mesa.titularId) ? 'Titular asignado.' : 'Mesa sin titular.', clean(mesa.titularId) ? 'Permite continuar tribunal.' : 'Bloquea tribunal.', clean(mesa.titularId) ? 'info' : 'critical'))
  })
  asArray(input.mesasConVocales).forEach((mesa) => {
    decisions.push(buildDecision('VOCALES_ASSIGNED', 'ASSIGN_VOCALES', mesa.id, getMateria(mesa), `${countVocales(mesa)} vocal(es) asignado(s).`, isMesaCompleta(mesa) ? 'Tribunal completo.' : 'Tribunal incompleto.', isMesaCompleta(mesa) ? 'info' : 'warning'))
  })
  asArray(input.metadata?.repairs).forEach((repair) => {
    decisions.push(buildDecision('MESA_REPAIRED', 'REPAIR_TRIBUNALS', repair.mesaId, clean(repair.action) || 'Mesa reparada.', clean(repair.reason) || 'Reparacion aplicada.', 'Mejora conformacion de tribunal.', 'info'))
  })
  asArray(input.metadata?.compactaciones).forEach((item) => {
    decisions.push(buildDecision('MESA_COMPACTADA', 'COMPACT_MESAS', item.targetMesaId, 'Mesa compactada', clean(item.motivo) || 'Compactacion aplicada.', 'Reduce cantidad de mesas.', item.tribunalCruzado ? 'warning' : 'info'))
  })
  asArray(input.metadata?.skippedCompactaciones).forEach((item) => {
    decisions.push(buildDecision('COMPACTACION_OMITIDA', 'COMPACT_MESAS', asArray(item.mesaIds).join('+'), 'Compactacion omitida', clean(item.detail) || clean(item.reason), 'Mantiene mesas separadas.', getSeverity(item, 'warning')))
  })
  asArray(input.plannedMesas).forEach((mesa) => {
    decisions.push(buildDecision('FECHA_TENTATIVA_ASIGNADA', 'PLAN_TENTATIVE_DATES', mesa.id, getMateria(mesa), `Fecha tentativa ${clean(mesa.fechaIso ?? mesa.fecha)}.`, 'Mesa disponible para revision.', 'info'))
    asArray(mesa.warnings).filter((warning) => warning.code === 'CORRELATIVIDAD_MISMO_DIA').forEach((warning) => {
      decisions.push(buildDecision('CORRELATIVA_MISMO_DIA', 'PLAN_TENTATIVE_DATES', mesa.id, getMateria(mesa), warning.message, 'Requiere validacion academica.', 'warning'))
    })
  })
  asArray(input.unassignedMesas).forEach((mesa) => {
    decisions.push(buildDecision('MESA_SIN_FECHA', 'PLAN_TENTATIVE_DATES', mesa.id, getMateria(mesa), clean(mesa.detail) || clean(mesa.reason) || 'Mesa sin fecha.', 'Requiere revision manual.', 'critical'))
  })

  return decisions
}

function buildPendingManualReview(input = {}, criticalErrors = [], warnings = []) {
  const items = []
  const push = (type, mesa = {}, reason = '', severity = 'warning') => {
    items.push({
      type,
      mesaId: getMesaId(mesa),
      materia: getMateria(mesa),
      carrera: getCarrera(mesa),
      llamado: normalizeLlamado(mesa.llamado ?? mesa.exam_call),
      reason,
      severity,
    })
  }

  ;[...asArray(input.plannedMesas), ...asArray(input.unassignedMesas), ...asArray(input.mesasPreliminares)].forEach((mesa) => {
    if (!clean(mesa.titularId ?? mesa.titular_id)) push('MESA_SIN_TITULAR', mesa, 'Mesa sin titular asignado.', 'critical')
    if (clean(mesa.titularId ?? mesa.titular_id) && countVocales(mesa) === 0) push('MESA_SIN_VOCALES', mesa, 'Mesa sin vocales asignados.')
    if (countVocales(mesa) === 1) push('MESA_CON_UN_VOCAL', mesa, 'Mesa con un solo vocal.')
    if (!hasFechaTentativa(mesa) && (asArray(input.plannedMesas).includes(mesa) || asArray(input.unassignedMesas).includes(mesa))) push('MESA_SIN_FECHA', mesa, 'Mesa sin fecha tentativa.', 'critical')
  })

  criticalErrors.concat(warnings).filter((issue) => issue.code.includes('CORRELATIVIDAD')).forEach((issue) => {
    items.push({ type: 'CORRELATIVIDAD', mesaId: issue.mesaId, materia: issue.materia, carrera: issue.carrera, llamado: '', reason: issue.message, severity: issue.severity })
  })
  criticalErrors.concat(warnings).filter((issue) => issue.code.includes('DISPONIBLE') || issue.code.includes('DISPONIBILIDAD')).forEach((issue) => {
    items.push({ type: 'DOCENTE_SIN_DISPONIBILIDAD', mesaId: issue.mesaId, materia: issue.materia, carrera: issue.carrera, llamado: '', reason: issue.message, severity: issue.severity, docenteId: issue.docenteId, docenteNombre: issue.docenteNombre })
  })
  asArray(input.metadata?.skippedCompactaciones).forEach((item) => {
    items.push({ type: 'COMPACTACION_OMITIDA', mesaId: asArray(item.mesaIds).join('+'), materia: '', carrera: '', llamado: '', reason: clean(item.detail) || clean(item.reason), severity: getSeverity(item, 'warning') })
  })
  asArray(input.metadata?.candidateExclusions).forEach((item) => {
    items.push({ type: 'MATERIA_EXCLUIDA', mesaId: '', materia: getMateria(item), carrera: getCarrera(item), llamado: normalizeLlamado(item.llamado), reason: clean(item.reason) || 'Materia excluida.', severity: 'warning' })
  })

  return dedupeIssues(items.map((item) => ({ ...item, code: item.type, stage: item.type })))
}

function buildRecommendations(input = {}, criticalErrors = [], warnings = [], pending = []) {
  const recommendations = new Set()
  const add = (value) => {
    if (clean(value)) recommendations.add(clean(value))
  }

  criticalErrors.concat(warnings).forEach((issue) => {
    if (issue.docenteNombre || issue.docenteId) {
      if (issue.code.includes('DISPONIBLE')) add(`Cargar disponibilidad del docente ${issue.docenteNombre || issue.docenteId}.`)
    }
    if (issue.materia && issue.code.includes('TITULAR')) add(`Revisar titularidad de la materia ${issue.materia}.`)
    if (issue.code.includes('FECHA')) add('Agregar fechas disponibles para el llamado.')
    if (issue.code.includes('TRIBUNAL') || issue.code.includes('VOCAL')) add('Revisar mesa sin tribunal conformado.')
    if (issue.code.includes('CORRELATIVIDAD')) add('Revisar correlatividades antes de aprobar el cronograma.')
  })

  pending.forEach((item) => {
    if (item.type === 'MESA_SIN_TITULAR' && item.materia) add(`Revisar titularidad de la materia ${item.materia}.`)
    if (item.type === 'MESA_SIN_FECHA') add('Agregar fechas disponibles para el llamado.')
    if (item.type === 'COMPACTACION_OMITIDA') add('Validar manualmente compactaciones omitidas por riesgo.')
    if (item.type === 'MATERIA_EXCLUIDA' && item.materia) add(`Revisar si la materia ${item.materia} debe incluirse en el periodo.`)
  })

  if (input.summary?.totalPlannedMesas > 0 && !recommendations.size) {
    add('Revisar institucionalmente el reporte antes de publicar el cronograma.')
  }

  return [...recommendations]
}

function getStatus({ criticalErrors, warnings, tablesSummary, datePlanningSummary }) {
  const hasSeverePending = (
    tablesSummary.sinTribunal > 0 ||
    datePlanningSummary.totalSinFecha > 0
  )
  if (criticalErrors.length > 0 || hasSeverePending) return 'CRITICAL'
  if (warnings.length > 0 || tablesSummary.conUnVocal > 0 || tablesSummary.pendientesRevision > 0) return 'WARNING'
  return 'OK'
}

function buildExecutiveSummary(input = {}, criticalErrors, warnings, tablesSummary, compactationSummary, datePlanningSummary) {
  return {
    totalMesasPlanificadas: asArray(input.plannedMesas).length,
    totalMesasSinFecha: datePlanningSummary.totalSinFecha,
    totalErroresCriticos: criticalErrors.length,
    totalAdvertencias: warnings.length,
    totalMesasCompletas: tablesSummary.completas,
    totalMesasConUnVocal: tablesSummary.conUnVocal,
    totalMesasSinTribunal: tablesSummary.sinTribunal,
    totalCompactaciones: compactationSummary.totalCompactaciones,
    compactMode: compactationSummary.compactMode,
    cantidadLlamados: input.summary?.cantidadLlamados ?? input.metadata?.cantidadLlamados ?? input.config?.cantidadLlamados ?? null,
    tipoPeriodo: input.summary?.tipoPeriodo ?? input.metadata?.tipoPeriodo ?? input.config?.tipoPeriodo ?? null,
  }
}

export function buildPipelineReport(input = {}) {
  const criticalErrors = normalizeIssues(input, 'critical')
  const warnings = normalizeIssues(input, 'warning')
  const tablesSummary = summarizeTables(input)
  const compactationSummary = buildCompactationSummary(input)
  const datePlanningSummary = buildDatePlanningSummary(input)
  const teachersSummary = summarizeTeachers(input)
  const careersSummary = summarizeCareers(input, criticalErrors, warnings)
  const callsSummary = summarizeCalls(input, criticalErrors, warnings)
  const decisions = buildDecisions(input)
  const pendingManualReview = buildPendingManualReview(input, criticalErrors, warnings)
  const recommendations = buildRecommendations(input, criticalErrors, warnings, pendingManualReview)
  const executiveSummary = buildExecutiveSummary(input, criticalErrors, warnings, tablesSummary, compactationSummary, datePlanningSummary)
  const status = getStatus({ criticalErrors, warnings, tablesSummary, datePlanningSummary })

  return {
    title: 'Reporte interno del pipeline de mesas de examen',
    generatedAt: new Date().toISOString(),
    status,
    executiveSummary,
    criticalErrors,
    warnings,
    decisions,
    tablesSummary,
    teachersSummary,
    careersSummary,
    callsSummary,
    compactationSummary,
    datePlanningSummary,
    pendingManualReview,
    recommendations,
    raw: clonePlain(input),
  }
}

export function createReportIssue({ code, message, severity = 'warning', detail = {} } = {}) {
  return {
    code,
    message,
    severity,
    detail,
  }
}

export function buildGenerationReport({
  diagnostics = [],
  errors = [],
  exclusions = [],
  warnings = [],
} = {}) {
  return {
    ...createEmptyGenerationReport(),
    diagnostics,
    errors,
    exclusions,
    warnings,
    metrics: {
      generated: 0,
      errors: errors.length,
      warnings: warnings.length,
    },
  }
}
