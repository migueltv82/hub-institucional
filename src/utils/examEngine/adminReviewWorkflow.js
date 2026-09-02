import { buildDateRange, getDayName } from './normalize/dates.js'
import { normalizeText } from './normalize/subjects.js'
import {
  detectarFamiliaMateria,
  getNivelAfinidadDocenteMesa,
} from './rules/affinities.js'
import { validateNoInvertedCorrelativities } from './rules/correlativities.js'
import { isTeacherBlockedOnDate } from './teacherBlockedDates.js'

export const PRE_SCHEDULE_STATES = Object.freeze({
  TRIBUNAL_INCOMPLETO: 'TRIBUNAL_INCOMPLETO',
  PENDIENTE_VOCALES: 'PENDIENTE_VOCALES',
  PENDIENTE_REVISION_ADMIN: 'PENDIENTE_REVISION_ADMIN',
})

export const GROUPING_TYPES = Object.freeze({
  SAME_TITULAR: 'SAME_TITULAR',
  SAME_AREA: 'SAME_AREA',
  CORRELATIVE_CHAIN: 'CORRELATIVE_CHAIN',
  CROSS_CAREER_AFFINITY: 'CROSS_CAREER_AFFINITY',
  HOMOLOGOUS_SUBJECT: 'HOMOLOGOUS_SUBJECT',
  MANUAL_ADMIN_GROUP: 'MANUAL_ADMIN_GROUP',
})

export const GROUPING_LEVELS = Object.freeze({
  SAME_SLOT_SHARED_TRIBUNAL: 'SAME_SLOT_SHARED_TRIBUNAL',
  SAME_DAY_CONSECUTIVE_SLOTS: 'SAME_DAY_CONSECUTIVE_SLOTS',
  SAME_DAY_SEPARATE_SLOTS: 'SAME_DAY_SEPARATE_SLOTS',
  ADMIN_GROUP_ONLY: 'ADMIN_GROUP_ONLY',
})

export const ADMIN_DECISIONS = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EDITED: 'EDITED',
})

const TRIBUNAL_ROLES_THAT_CONSUME_AFFECTATION = new Set([
  'VOCAL',
  'VOCAL_1',
  'VOCAL_2',
  'VOCAL_EXTERNO',
  'TRIBUNAL',
  'MIEMBRO_TRIBUNAL',
])

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return [...new Set(asArray(values).map(clean).filter(Boolean))]
}

function normalizeKey(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeTeacherKey(value) {
  return clean(value).startsWith('teacher-') ? clean(value) : `teacher-${normalizeKey(value)}`
}

function normalizeRole(value) {
  return clean(value).toUpperCase()
}

function subjectKey({ carrera = '', materia = '', materiaNombre = '' } = {}) {
  const careerKey = normalizeKey(carrera)
  const subject = normalizeKey(materia || materiaNombre)
  return careerKey && subject ? `${careerKey}::${subject}` : ''
}

function getSubjectName(row = {}) {
  return clean(row.materiaNombre ?? row.nombreMateria ?? row.nombre ?? row.materia_nombre ?? row.materia ?? row.codigo)
}

function getMesaId(row = {}, index = 0) {
  return clean(row.id) || `pre-${subjectKey(row) || index + 1}`
}

function dateEntries({ fechasDisponibles = [], fechaInicio = '', fechaFin = '' } = {}) {
  if (asArray(fechasDisponibles).length) {
    return asArray(fechasDisponibles)
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return {
            fechaIso: clean(entry.fechaIso ?? entry.fecha ?? entry.date),
            turno: clean(entry.turno ?? entry.shift).toUpperCase(),
          }
        }
        return { fechaIso: clean(entry), turno: '' }
      })
      .filter((entry) => entry.fechaIso)
  }

  return buildDateRange(fechaInicio, fechaFin).map((fechaIso) => ({ fechaIso, turno: '' }))
}

function findPlanRow(planesEstudio = [], assignment = {}) {
  const key = subjectKey(assignment)
  return asArray(planesEstudio).find((plan) => subjectKey({
    carrera: plan.carrera,
    materia: plan.materia ?? plan.codigo,
    materiaNombre: plan.nombreMateria ?? plan.nombre,
  }) === key) ?? {}
}

function findAvailabilityForDate(context = {}, docenteId = '', date = {}, requestedTurno = '') {
  const day = getDayName(date.fechaIso)
  const dateTurno = clean(date.turno || requestedTurno).toUpperCase()

  return asArray(context.disponibilidadPorDocente?.[docenteId]).find((availability) => {
    const sameDay = normalizeText(availability.diaNormalizado || availability.dia) === day
    const availabilityTurno = clean(availability.turno).toUpperCase()
    const turnoOk = !dateTurno || !availabilityTurno || availabilityTurno === dateTurno
    return sameDay && turnoOk && availability.disponible !== false
  })
}

function firstAvailableDateForTeacher({ context, docenteId, fechas, turno }) {
  for (const date of fechas) {
    const availability = findAvailabilityForDate(context, docenteId, date, turno)
    if (availability) return { date, availability }
  }
  return { date: null, availability: null }
}

function isConsumingRole(role) {
  return TRIBUNAL_ROLES_THAT_CONSUME_AFFECTATION.has(normalizeRole(role))
}

function isTitularRole(role) {
  return normalizeRole(role) === 'TITULAR'
}

function mesaTeacherIds(mesa = {}) {
  return [
    mesa.titularId,
    mesa.profesorTitularId,
    ...asArray(mesa.vocales).map((vocal) => vocal.docenteId),
  ].map(clean).filter(Boolean)
}

function hasSameSlot(left = {}, right = {}) {
  return clean(left.fechaIso) === clean(right.fechaIso) &&
    clean(left.inicio) === clean(right.inicio) &&
    clean(left.fin) === clean(right.fin)
}

function hasSameDay(left = {}, right = {}) {
  return clean(left.fechaIso) && clean(left.fechaIso) === clean(right.fechaIso)
}

function areConsecutiveSlots(left = {}, right = {}) {
  if (!hasSameDay(left, right)) return false
  return clean(left.fin) && clean(right.inicio) && clean(left.fin) === clean(right.inicio)
}

function groupingLevelFor(left = {}, right = {}) {
  if (hasSameSlot(left, right)) return GROUPING_LEVELS.SAME_SLOT_SHARED_TRIBUNAL
  if (areConsecutiveSlots(left, right) || areConsecutiveSlots(right, left)) {
    return GROUPING_LEVELS.SAME_DAY_CONSECUTIVE_SLOTS
  }
  if (hasSameDay(left, right)) return GROUPING_LEVELS.SAME_DAY_SEPARATE_SLOTS
  return GROUPING_LEVELS.ADMIN_GROUP_ONLY
}

function mesaForAffinity(mesa = {}) {
  return {
    carrera: mesa.carrera,
    materia: mesa.materia,
    nombreMateria: mesa.nombreMateria,
    nombre: mesa.nombreMateria,
  }
}

function areCorrelative(left = {}, right = {}, correlatividades = []) {
  const leftCode = normalizeKey(left.materia)
  const rightCode = normalizeKey(right.materia)
  const sameCareer = normalizeKey(left.carrera) === normalizeKey(right.carrera)
  if (!leftCode || !rightCode || !sameCareer) return false

  return asArray(correlatividades).some((row) => {
    const rowCode = normalizeKey(row.materia ?? row.codigo)
    const previas = asArray(row.correlativas).map(normalizeKey)
    return (rowCode === rightCode && previas.includes(leftCode)) ||
      (rowCode === leftCode && previas.includes(rightCode))
  })
}

function groupingTypeFor(left = {}, right = {}, correlatividades = []) {
  if (clean(left.titularId) && clean(left.titularId) === clean(right.titularId)) {
    return GROUPING_TYPES.SAME_TITULAR
  }

  if (areCorrelative(left, right, correlatividades)) return GROUPING_TYPES.CORRELATIVE_CHAIN

  const leftName = normalizeText(getSubjectName(left))
  const rightName = normalizeText(getSubjectName(right))
  if (leftName && leftName === rightName) return GROUPING_TYPES.HOMOLOGOUS_SUBJECT

  const sameFamily = detectarFamiliaMateria(mesaForAffinity(left)) === detectarFamiliaMateria(mesaForAffinity(right))
  if (sameFamily && detectarFamiliaMateria(mesaForAffinity(left)) !== 'GENERAL') {
    return GROUPING_TYPES.SAME_AREA
  }

  const affinity = getNivelAfinidadDocenteMesa(mesaForAffinity(left), mesaForAffinity(right))
  if (affinity.afinidadValida) return GROUPING_TYPES.CROSS_CAREER_AFFINITY

  return ''
}

function buildCorrelativeRowsForMesas(mesas = [], correlatividades = []) {
  const mesaKeys = new Set(asArray(mesas).map((mesa) => subjectKey(mesa)))
  return asArray(correlatividades).filter((row) => mesaKeys.has(subjectKey(row)))
}

function uniqueTeacherConflict(mesas = []) {
  const bySlot = new Map()
  const conflicts = []

  asArray(mesas).forEach((mesa) => {
    const slotKey = [mesa.fechaIso, mesa.inicio, mesa.fin].map(clean).join('::')
    if (!slotKey.replaceAll(':', '')) return

    const titularIds = new Set([mesa.titularId, mesa.profesorTitularId].map(clean).filter(Boolean))
    mesaTeacherIds(mesa).forEach((docenteId) => {
      if (titularIds.has(docenteId)) return
      const key = `${slotKey}::${docenteId}`
      if (bySlot.has(key)) conflicts.push(docenteId)
      bySlot.set(key, true)
    })
  })

  return [...new Set(conflicts)]
}

export function buildTitularOnlyPreSchedule({
  teacherExamSourceContext,
  planesEstudio = [],
  fechasDisponibles = [],
  fechaInicio = '',
  fechaFin = '',
  turno = '',
} = {}) {
  const context = teacherExamSourceContext ?? {}
  const fechas = dateEntries({ fechasDisponibles, fechaInicio, fechaFin })
  const mesas = []
  const warnings = []

  Object.entries(context.titularidadesPorMateria ?? {}).forEach(([, assignments]) => {
    const assignment = asArray(assignments)[0]
    if (!assignment) return

    const plan = findPlanRow(planesEstudio, assignment)
    const { date, availability } = firstAvailableDateForTeacher({
      context,
      docenteId: assignment.docenteId,
      fechas,
      turno,
    })

    if (!date || !availability) {
      warnings.push({
        code: 'TITULAR_WITHOUT_AVAILABLE_DATE',
        docenteId: assignment.docenteId,
        carrera: assignment.carrera,
        materia: assignment.materia,
      })
    }

    const blockedDate = isTeacherBlockedOnDate({
      blockedDatesByTeacher: context.blockedDatesByTeacher,
      teacherId: assignment.docenteId,
      teacherName: assignment.docente,
      date: date?.fechaIso,
      startTime: availability?.horaDesde,
      endTime: availability?.horaHasta,
    })
    if (blockedDate.blocked) {
      warnings.push({
        code: 'TITULAR_BLOCKED_DATE',
        docenteId: assignment.docenteId,
        date: date?.fechaIso,
      })
    }

    mesas.push({
      id: `pre-${subjectKey(assignment)}`,
      carrera: assignment.carrera,
      materia: assignment.materia,
      nombreMateria: assignment.materiaNombre || getSubjectName(plan),
      anio: assignment.anio || clean(plan.anio ?? plan.year ?? plan.nivel),
      plan: assignment.plan || clean(plan.plan),
      fechaIso: date?.fechaIso ?? '',
      turno: clean(availability?.turno || date?.turno || turno).toUpperCase(),
      inicio: clean(availability?.horaDesde),
      fin: clean(availability?.horaHasta),
      titularId: assignment.docenteId,
      titular: assignment.docente,
      profesorTitular: assignment.docente,
      vocales: [],
      estado: PRE_SCHEDULE_STATES.TRIBUNAL_INCOMPLETO,
      tribunalStatus: PRE_SCHEDULE_STATES.PENDIENTE_VOCALES,
      adminDecision: ADMIN_DECISIONS.PENDING,
      source: context.source,
      hardRuleViolations: [
        ...(date && availability ? [] : ['TITULAR_NOT_AVAILABLE']),
        ...(blockedDate.blocked ? ['TITULAR_BLOCKED_DATE', 'BLOCKED_DATE_CONFLICT'] : []),
      ],
    })
  })

  return {
    source: context.source ?? 'missing',
    mesas: mesas.sort((left, right) => (
      clean(left.fechaIso).localeCompare(clean(right.fechaIso)) ||
      clean(left.carrera).localeCompare(clean(right.carrera), 'es', { sensitivity: 'base' }) ||
      clean(left.materia).localeCompare(clean(right.materia), 'es', { sensitivity: 'base' })
    )),
    warnings,
    diagnostics: {
      totalMesas: mesas.length,
      titularesOnly: true,
      autoAssignedVocales: 0,
    },
  }
}

export function validateExamTableGroupingAgainstHardRules({
  grouping,
  correlatividades = [],
} = {}) {
  const mesas = asArray(grouping?.mesas)
  const hardRuleViolations = []
  const warnings = []

  if (mesas.length < 2) hardRuleViolations.push('GROUPING_REQUIRES_AT_LEAST_TWO_TABLES')
  mesas.forEach((mesa) => {
    if (!clean(mesa.titularId)) hardRuleViolations.push('TITULAR_REQUIRED')
    asArray(mesa.hardRuleViolations).forEach((violation) => hardRuleViolations.push(violation))
  })

  if (grouping?.level === GROUPING_LEVELS.SAME_SLOT_SHARED_TRIBUNAL) {
    const [first, ...rest] = mesas
    if (rest.some((mesa) => !hasSameSlot(first, mesa))) {
      hardRuleViolations.push('GROUPING_REQUIRES_SAME_DATE_SLOT')
    }
  }

  uniqueTeacherConflict(mesas).forEach((docenteId) => {
    hardRuleViolations.push(`TEACHER_SLOT_CONFLICT:${docenteId}`)
  })

  const correlativeValidation = validateNoInvertedCorrelativities({
    cronograma: mesas,
    correlatividades: buildCorrelativeRowsForMesas(mesas, correlatividades),
  })
  correlativeValidation.errors.forEach((error) => hardRuleViolations.push(error.code))
  correlativeValidation.warnings.forEach((warning) => warnings.push(warning))

  return {
    valid: hardRuleViolations.length === 0,
    canAccept: hardRuleViolations.length === 0,
    hardRuleViolations: [...new Set(hardRuleViolations)],
    warnings,
  }
}

export function suggestExamTableGroupings({
  preSchedule = [],
  correlatividades = [],
  adminDecisions = {},
} = {}) {
  const mesas = asArray(preSchedule)
  const suggestions = []

  for (let leftIndex = 0; leftIndex < mesas.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < mesas.length; rightIndex += 1) {
      const left = mesas[leftIndex]
      const right = mesas[rightIndex]
      const type = groupingTypeFor(left, right, correlatividades)
      if (!type) continue

      const level = groupingLevelFor(left, right)
      const groupId = `group-${getMesaId(left, leftIndex)}-${getMesaId(right, rightIndex)}`
      const base = {
        groupId,
        type,
        level,
        confidence: type === GROUPING_TYPES.SAME_TITULAR ? 0.95 : 0.75,
        mesas: [left, right],
        titular: clean(left.titularId) === clean(right.titularId) ? left.titular : '',
        careers: unique([left.carrera, right.carrera]),
        subjects: unique([left.materia, right.materia]),
        reasons: [type],
        warnings: [],
        hardRuleViolations: [],
        risks: [],
        estimatedBenefit: type === GROUPING_TYPES.SAME_TITULAR
          ? 'Reduce revision de mesas del mismo titular.'
          : 'Puede reducir carga administrativa si el tribunal es compatible.',
        estimatedAffectationSaving: level === GROUPING_LEVELS.SAME_SLOT_SHARED_TRIBUNAL ? 1 : 0,
        adminDecision: adminDecisions[groupId] ?? ADMIN_DECISIONS.PENDING,
        canAccept: false,
      }
      const validation = validateExamTableGroupingAgainstHardRules({ grouping: base, correlatividades })
      suggestions.push({
        ...base,
        warnings: validation.warnings,
        hardRuleViolations: validation.hardRuleViolations,
        canAccept: validation.canAccept,
      })
    }
  }

  return suggestions
}

export function updateExamTableGroupingDecision(grouping = {}, decision = ADMIN_DECISIONS.PENDING) {
  return {
    ...grouping,
    adminDecision: decision,
    accepted: decision === ADMIN_DECISIONS.ACCEPTED,
    rejected: decision === ADMIN_DECISIONS.REJECTED,
  }
}

export function buildTeacherAffectationLedger({
  teacherExamSourceContext,
  selections = [],
} = {}) {
  const context = teacherExamSourceContext ?? {}
  const ledger = {}

  asArray(context.docentes).forEach((docente) => {
    const limite = Number(context.limiteAfectacionPorDocente?.[docente.id] ?? docente.limiteAfectacion ?? 0)
    ledger[docente.id] = {
      docenteId: docente.id,
      docente: docente.nombre,
      horasCatedra: Number(context.cargaHorariaPorDocente?.[docente.id] ?? docente.horasCatedra ?? 0),
      limiteAfectacion: limite,
      afectacionesUsadas: 0,
      afectacionesRestantes: limite,
      selections: [],
    }
  })

  asArray(selections).forEach((selection) => {
    const docenteId = normalizeTeacherKey(selection.docenteId ?? selection.docente ?? selection.profesor)
    const entry = ledger[docenteId]
    if (!entry) return
    if (isTitularRole(selection.role ?? selection.rol)) return
    if (!isConsumingRole(selection.role ?? selection.rol)) return

    entry.afectacionesUsadas += 1
    entry.afectacionesRestantes = Math.max(0, entry.limiteAfectacion - entry.afectacionesUsadas)
    entry.selections.push({
      mesaId: selection.mesaId,
      fechaIso: selection.fechaIso,
      role: normalizeRole(selection.role ?? selection.rol),
    })
  })

  return ledger
}

function teacherAvailableForMesa(context = {}, docenteId = '', mesa = {}) {
  const dayAvailability = asArray(context.disponibilidadPorDocente?.[docenteId]).find((row) => (
    normalizeText(row.diaNormalizado || row.dia) === getDayName(mesa.fechaIso) &&
    row.disponible !== false
  ))
  const availability = asArray(context.disponibilidadPorDocente?.[docenteId]).find((row) => {
    const sameDay = normalizeText(row.diaNormalizado || row.dia) === getDayName(mesa.fechaIso)
    const sameTurn = !clean(mesa.turno) || !clean(row.turno) || clean(row.turno).toUpperCase() === clean(mesa.turno).toUpperCase()
    const sameRange = !clean(mesa.inicio) || !clean(row.horaDesde) || (
      clean(row.horaDesde) <= clean(mesa.inicio) &&
      (!clean(mesa.fin) || !clean(row.horaHasta) || clean(row.horaHasta) >= clean(mesa.fin))
    )
    return sameDay && sameTurn && sameRange && row.disponible !== false
  })

  return {
    disponibleEseDia: Boolean(dayAvailability),
    disponibleEnTurno: Boolean(availability && (!mesa.turno || !availability.turno || clean(availability.turno).toUpperCase() === clean(mesa.turno).toUpperCase())),
    availability,
  }
}

export function getTeacherAvailabilityForExamTable({
  teacherExamSourceContext,
  docenteId,
  mesa,
} = {}) {
  return teacherAvailableForMesa(teacherExamSourceContext ?? {}, normalizeTeacherKey(docenteId), mesa)
}

function hasSlotConflict(docenteId = '', mesa = {}, selections = []) {
  return asArray(selections).some((selection) => (
    normalizeTeacherKey(selection.docenteId ?? selection.docente ?? selection.profesor) === docenteId &&
    clean(selection.fechaIso) === clean(mesa.fechaIso) &&
    clean(selection.inicio) === clean(mesa.inicio) &&
    clean(selection.fin) === clean(mesa.fin)
  ))
}

export function recommendTribunalTeachers({
  teacherExamSourceContext,
  mesa,
  selections = [],
  acceptedGroupings = [],
} = {}) {
  const context = teacherExamSourceContext ?? {}
  const ledger = buildTeacherAffectationLedger({ teacherExamSourceContext: context, selections })

  return asArray(context.docentes)
    .filter((docente) => docente.id !== mesa?.titularId)
    .map((docente) => {
      const availability = teacherAvailableForMesa(context, docente.id, mesa)
      const blockedDate = isTeacherBlockedOnDate({
        blockedDatesByTeacher: context.blockedDatesByTeacher,
        teacherId: docente.id,
        teacherName: docente.nombre,
        date: mesa?.fechaIso,
        startTime: mesa?.inicio,
        endTime: mesa?.fin,
      })
      const workload = asArray(context.materiasPorDocente?.[docente.id])
      const affinityResults = workload.map((assignment) => getNivelAfinidadDocenteMesa(assignment, mesaForAffinity(mesa)))
      const bestAffinity = affinityResults.find((result) => result.afinidadValida) ?? affinityResults[0]
      const ledgerEntry = ledger[docente.id] ?? {
        horasCatedra: 0,
        limiteAfectacion: 0,
        afectacionesUsadas: 0,
        afectacionesRestantes: 0,
      }
      const conflictos = []
      const hardRuleViolations = []

      if (!availability.disponibleEseDia) hardRuleViolations.push('TEACHER_NOT_AVAILABLE_ON_DATE')
      if (!availability.disponibleEnTurno) hardRuleViolations.push('TEACHER_NOT_AVAILABLE_ON_SHIFT')
      if (blockedDate.blocked) hardRuleViolations.push('TEACHER_BLOCKED_DATE', 'VOCAL_BLOCKED_DATE', 'BLOCKED_DATE_CONFLICT')
      if (!bestAffinity?.afinidadValida) hardRuleViolations.push('VOCAL_WITHOUT_MINIMUM_AFFINITY')
      if (ledgerEntry.afectacionesRestantes <= 0) hardRuleViolations.push('TEACHER_AFFECTATION_LIMIT_EXCEEDED')
      if (hasSlotConflict(docente.id, mesa, selections)) hardRuleViolations.push('TEACHER_SLOT_CONFLICT')
      if (hardRuleViolations.includes('TEACHER_SLOT_CONFLICT')) conflictos.push('Misma fecha/franja ocupada.')
      if (blockedDate.blocked) conflictos.push('Fecha o franja bloqueada por administracion.')

      const eligible = hardRuleViolations.length === 0
      const score = [
        eligible ? 50 : 0,
        bestAffinity?.afinidadValida ? 25 : 0,
        availability.disponibleEnTurno ? 15 : 0,
        Math.max(0, ledgerEntry.afectacionesRestantes),
        asArray(acceptedGroupings).length ? 1 : 0,
      ].reduce((total, value) => total + value, 0)

      return {
        docente: {
          id: docente.id,
          nombre: docente.nombre,
        },
        disponibleEseDia: availability.disponibleEseDia,
        disponibleEnTurno: availability.disponibleEnTurno,
        areaAfin: bestAffinity?.afinidadValida ?? false,
        nivelAfinidad: bestAffinity?.nivelAfinidad ?? 'SIN_AFINIDAD',
        horasCatedra: ledgerEntry.horasCatedra,
        limiteAfectacion: ledgerEntry.limiteAfectacion,
        afectacionesUsadas: ledgerEntry.afectacionesUsadas,
        afectacionesRestantes: ledgerEntry.afectacionesRestantes,
        conflictos,
        hardRuleViolations,
        eligible,
        score,
        reasons: [
          availability.disponibleEseDia ? 'Disponible en la fecha.' : 'No disponible en la fecha.',
          bestAffinity?.motivo,
        ].filter(Boolean),
        warnings: eligible ? [] : ['No confirmable mientras tenga violaciones duras.'],
      }
    })
    .sort((left, right) => right.score - left.score || left.docente.nombre.localeCompare(right.docente.nombre, 'es', { sensitivity: 'base' }))
}

export function validateTribunalSelectionAgainstHardRules({
  teacherExamSourceContext,
  mesa,
  docenteId,
  role = 'VOCAL',
  selections = [],
} = {}) {
  if (isTitularRole(role)) {
    const docente = asArray(teacherExamSourceContext?.docentes).find((row) => (
      row.id === normalizeTeacherKey(docenteId)
    ))
    if (!docente) {
      return { valid: false, hardRuleViolations: ['TEACHER_NOT_FOUND'], warnings: [] }
    }
    const blockedDate = isTeacherBlockedOnDate({
      blockedDatesByTeacher: teacherExamSourceContext?.blockedDatesByTeacher,
      teacherId: docente.id,
      teacherName: docente.nombre,
      date: mesa?.fechaIso,
      startTime: mesa?.inicio,
      endTime: mesa?.fin,
    })
    return blockedDate.blocked
      ? {
          valid: false,
          hardRuleViolations: ['TEACHER_BLOCKED_DATE', 'TITULAR_BLOCKED_DATE', 'BLOCKED_DATE_CONFLICT'],
          warnings: [],
        }
      : {
          valid: true,
          hardRuleViolations: [],
          warnings: ['Titular obligatorio no consume cupo de afectacion.'],
        }
  }

  const [candidate] = recommendTribunalTeachers({
    teacherExamSourceContext,
    mesa,
    selections,
  }).filter((recommendation) => recommendation.docente.id === normalizeTeacherKey(docenteId))

  if (!candidate) {
    return {
      valid: false,
      hardRuleViolations: ['TEACHER_NOT_FOUND'],
      warnings: [],
    }
  }

  return {
    valid: candidate.hardRuleViolations.length === 0,
    hardRuleViolations: candidate.hardRuleViolations,
    warnings: candidate.warnings,
  }
}

export function applyTeacherTribunalSelection({
  teacherExamSourceContext,
  mesa,
  docenteId,
  role = 'VOCAL',
  selections = [],
} = {}) {
  const validation = validateTribunalSelectionAgainstHardRules({
    teacherExamSourceContext,
    mesa,
    docenteId,
    role,
    selections,
  })

  if (!validation.valid) {
    return {
      ok: false,
      selection: null,
      validation,
      ledger: buildTeacherAffectationLedger({ teacherExamSourceContext, selections }),
    }
  }

  const selection = {
    mesaId: mesa?.id,
    docenteId: normalizeTeacherKey(docenteId),
    role: normalizeRole(role),
    fechaIso: mesa?.fechaIso,
    inicio: mesa?.inicio,
    fin: mesa?.fin,
  }
  const nextSelections = [...asArray(selections), selection]

  return {
    ok: true,
    selection,
    selections: nextSelections,
    validation,
    ledger: buildTeacherAffectationLedger({
      teacherExamSourceContext,
      selections: nextSelections,
    }),
  }
}

export function validatePreScheduleHardRules({
  preSchedule = [],
  correlatividades = [],
} = {}) {
  const hardRuleViolations = []

  asArray(preSchedule).forEach((mesa) => {
    if (!clean(mesa.titularId)) hardRuleViolations.push('TITULAR_REQUIRED')
    if (asArray(mesa.vocales).length === 0) hardRuleViolations.push(`TRIBUNAL_INCOMPLETE:${mesa.id}`)
  })

  const correlativity = validateNoInvertedCorrelativities({ cronograma: preSchedule, correlatividades })
  correlativity.errors.forEach((error) => hardRuleViolations.push(error.code))

  return {
    valid: hardRuleViolations.length === 0,
    confirmable: false,
    hardRuleViolations: [...new Set(hardRuleViolations)],
    warnings: correlativity.warnings,
  }
}
