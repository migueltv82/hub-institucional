import {
  getCareerValues,
  resolveCareerDisplayName,
} from '../../services/careerCatalog.js'

const UNASSIGNED_CAREER = 'Sin carrera'
const UNASSIGNED_YEAR = 'Sin anio'
const IGNORED_CAREER_LABELS = new Set([
  'validacion',
  'validacion carrera',
  'validacion carreras',
  'validaciones',
  'validation',
  'validation career',
  'validation careers',
])
const DAY_ORDER = new Map([
  ['lunes', 1],
  ['martes', 2],
  ['miercoles', 3],
  ['jueves', 4],
  ['viernes', 5],
  ['sabado', 6],
  ['domingo', 7],
])
const DEFAULT_TIMETABLE_DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']
export const DEFAULT_NIGHT_TIMETABLE_SLOTS = [
  { inicio: '18:20', fin: '19:00' },
  { inicio: '19:00', fin: '19:40' },
  { inicio: '19:40', fin: '20:20' },
  { inicio: '20:30', fin: '21:10' },
  { inicio: '21:10', fin: '21:50' },
  { inicio: '21:55', fin: '22:35' },
  { inicio: '22:35', fin: '23:10' },
]

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }

  return ''
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isIgnoredCareerLabel(value) {
  return IGNORED_CAREER_LABELS.has(normalizeText(value))
}

function isLikelyCareerAlias(value) {
  const compact = clean(value).replaceAll(/[^a-z0-9]/gi, '')
  return Boolean(compact) && (/^[a-z]{2,5}$/i.test(compact) || /^\d+$/.test(compact))
}

function normalizeIdentity(value) {
  return normalizeText(value).replaceAll(/\s+/g, '')
}

function getCareerId(row = {}) {
  return clean(row.carrera_id ?? row.carreraId ?? row.program_id ?? row.programId)
}

function getExplicitCareerName(row = {}) {
  const raw = row.raw ?? row.raw_payload ?? null
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : null

  return firstClean(
    row.carrera_nombre,
    row.carreraNombre,
    row.nombreCarrera,
    row.career_name,
    row.careerName,
    row.program_name,
    row.programName,
    raw?.carrera_nombre,
    raw?.carreraNombre,
    raw?.nombreCarrera,
    raw?.career_name,
    raw?.careerName,
    raw?.program_name,
    raw?.programName,
    profile?.carrera_nombre,
    profile?.carreraNombre,
    profile?.nombreCarrera,
    profile?.career_name,
    profile?.careerName,
    profile?.program_name,
    profile?.programName,
  )
}

function addCareerNameMapping(map, alias, name) {
  const cleanedAlias = clean(alias)
  const cleanedName = clean(name)

  if (!cleanedAlias || !cleanedName || isIgnoredCareerLabel(cleanedName)) return
  if (!map.has(cleanedAlias)) map.set(cleanedAlias, cleanedName)

  const normalizedAlias = normalizeText(cleanedAlias)
  if (normalizedAlias && !map.has(normalizedAlias)) map.set(normalizedAlias, cleanedName)
}

function getMappedCareerName(careerNamesById = new Map(), value) {
  const cleaned = clean(value)
  if (!cleaned) return ''

  return careerNamesById.get(cleaned) ?? careerNamesById.get(normalizeText(cleaned)) ?? ''
}

function resolveCareerLabel(value, careerNamesById = new Map()) {
  const mapped = getMappedCareerName(careerNamesById, value) || clean(value)
  return resolveCareerDisplayName(mapped) || mapped
}

function uniqueCareers(careers = []) {
  const byKey = new Map()

  careers.forEach((career) => {
    const cleaned = clean(career)
    const key = normalizeText(cleaned)

    if (!cleaned || !key || isIgnoredCareerLabel(cleaned) || byKey.has(key)) return
    byKey.set(key, cleaned)
  })

  return Array.from(byKey.values())
}

function getDirectCareers(row = {}, careerNamesById = new Map()) {
  const careers = [
    getMappedCareerName(careerNamesById, getCareerId(row)),
    getExplicitCareerName(row),
    ...getCareerValues(row).map((career) => resolveCareerLabel(career, careerNamesById)),
  ]
  const unique = uniqueCareers(careers)
  const descriptive = unique.filter((career) => !isLikelyCareerAlias(career))

  return descriptive.length > 0 ? descriptive : unique
}

function getSubjectLookupKeys(row = {}) {
  return [
    ['id', row.materia_id ?? row.materiaId ?? row.subject_id ?? row.subjectId ?? row.id],
    ['code', row.materia_codigo ?? row.materiaCodigo ?? row.subject_code ?? row.subjectCode],
    ['code', row.materia ?? row.codigo ?? row.code],
  ]
    .map(([kind, value]) => [kind, normalizeIdentity(value)])
    .filter(([, value]) => Boolean(value))
    .map(([kind, value]) => `${kind}:${value}`)
}

function buildCareerNamesById(planesEstudio = []) {
  return asArray(planesEstudio).reduce((map, row) => {
    const id = getCareerId(row)
    const rawName = firstClean(getExplicitCareerName(row), row.carrera, id)
    const name = resolveCareerDisplayName(rawName)
      || (isLikelyCareerAlias(rawName) ? resolveCareerDisplayName(id) : '')
      || rawName

    addCareerNameMapping(map, id, name)
    ;[
      row.carrera,
      row.programa,
      row.program,
      row.career,
      row.program_id,
      row.programId,
    ].forEach((alias) => {
      if (!isLikelyCareerAlias(alias)) return
      addCareerNameMapping(map, alias, name)
    })

    return map
  }, new Map())
}

function buildSubjectCareersByKey(planesEstudio = [], careerNamesById = new Map()) {
  const subjectCareers = new Map()

  asArray(planesEstudio).forEach((row) => {
    const targetCareers = getDirectCareers(row, careerNamesById)

    if (targetCareers.length === 0) return

    getSubjectLookupKeys(row).forEach((key) => {
      const current = subjectCareers.get(key) ?? new Map()
      targetCareers.forEach((career) => {
        const careerKey = normalizeText(career)
        if (careerKey && !current.has(careerKey)) current.set(careerKey, career)
      })
      subjectCareers.set(key, current)
    })
  })

  return subjectCareers
}

function getCareers(row = {}, careerNamesById = new Map(), subjectCareersByKey = new Map()) {
  const directCareers = getDirectCareers(row, careerNamesById)
  const descriptiveDirectCareers = directCareers.filter((career) => !isLikelyCareerAlias(career))

  if (descriptiveDirectCareers.length > 0) return descriptiveDirectCareers

  const careerId = getCareerId(row)
  const mappedCareer = getMappedCareerName(careerNamesById, careerId)
  if (mappedCareer && !isIgnoredCareerLabel(mappedCareer)) return [mappedCareer]

  const inferred = new Map()
  getSubjectLookupKeys(row).forEach((key) => {
    const matches = subjectCareersByKey.get(key)
    if (!matches) return

    matches.forEach((career, careerKey) => {
      if (!inferred.has(careerKey)) inferred.set(careerKey, career)
    })
  })

  const inferredCareers = Array.from(inferred.values())
  return inferredCareers.length > 0 ? inferredCareers : directCareers
}

function getStudentKey(student = {}, index = 0) {
  return clean(
    student.record_id ??
    student.alumno_id ??
    student.alumnoId ??
    student.id ??
    student.dni ??
    student.documento ??
    student.email,
  ) || `student:${index}`
}

function getTeacherName(teacher = {}) {
  const fullName = firstClean(
    teacher.full_name,
    teacher.display_name,
    teacher.nombre_completo,
    teacher.profesor,
    teacher.docente,
    teacher.teacher,
    teacher.teacher_name,
    teacher.teacherName,
    teacher.docente_nombre,
    teacher.docenteNombre,
  )
  if (fullName) return fullName

  const firstName = clean(teacher.nombre ?? teacher.first_name)
  const lastName = clean(teacher.apellido ?? teacher.last_name)
  const composedName = [firstName, lastName].filter(Boolean).join(' ')
  if (composedName) return composedName

  return clean(teacher.name)
}

function getTeacherDni(teacher = {}) {
  return clean(
    teacher.dni ??
    teacher.documento ??
    teacher.document_number ??
    teacher.profile?.dni ??
    teacher.profile?.documento,
  )
}

function createTeacherAliasIndex(teacherSources = []) {
  const aliases = new Map()

  teacherSources.forEach((teacher, index) => {
    const dni = getTeacherDni(teacher)
    const name = getTeacherName(teacher)
    const key = dni
      ? `dni:${normalizeIdentity(dni)}`
      : name
        ? `name:${normalizeText(name)}`
        : `teacher:${index}`

    if (dni) aliases.set(`dni:${normalizeIdentity(dni)}`, key)
    if (name) aliases.set(`name:${normalizeText(name)}`, key)
  })

  return aliases
}

function getTeacherKey(teacher = {}, aliases = new Map()) {
  const dni = getTeacherDni(teacher)
  const name = getTeacherName(teacher)
  const dniAlias = dni ? aliases.get(`dni:${normalizeIdentity(dni)}`) : ''
  const nameAlias = name ? aliases.get(`name:${normalizeText(name)}`) : ''

  if (dniAlias) return dniAlias
  if (nameAlias) return nameAlias
  if (dni) return `dni:${normalizeIdentity(dni)}`
  if (name) return `name:${normalizeText(name)}`
  return ''
}

function getSubjectKey(row = {}) {
  return clean(
    row.materia_codigo ??
    row.materiaCodigo ??
    row.subject_id ??
    row.subjectId ??
    row.subject_code ??
    row.codigo ??
    row.materia ??
    row.materia_nombre ??
    row.nombreMateria ??
    row.nombre,
  )
}

function getPlanSubjectCode(row = {}) {
  return firstClean(
    row.materia_codigo,
    row.materiaCodigo,
    row.subject_id,
    row.subjectId,
    row.materia_id,
    row.materiaId,
    row.subject_code,
    row.subjectCode,
    row.materia,
    row.codigo,
    row.code,
  )
}

function getPlanSubjectName(row = {}) {
  return firstClean(
    row.materia_nombre,
    row.materiaNombre,
    row.nombreMateria,
    row.subject_name,
    row.subjectName,
    row.asignatura,
    row.nombre,
    row.name,
  )
}

function getAcademicYear(row = {}, fallback = '') {
  return firstClean(
    row.anio,
    row.ano,
    row['a\u00f1o'],
    row.anio_cursada,
    row.anioCursada,
    row['a\u00f1o_cursada'],
    row.anio_plan,
    row.anioPlan,
    row.anio_materia,
    row.anioMateria,
    row.year,
    row.curso,
    row.nivel,
    row.academic_year,
    row.academicYear,
    fallback,
  )
}

function getScheduleSubjectCode(row = {}) {
  return firstClean(
    row.materia_codigo,
    row.materiaCodigo,
    row.subject_id,
    row.subjectId,
    row.materia_id,
    row.materiaId,
    row.subject_code,
    row.subjectCode,
    row.codigo,
    row.code,
    row.materia,
  )
}

function getScheduleSubjectName(row = {}) {
  return firstClean(
    row.materia_nombre,
    row.materiaNombre,
    row.nombreMateria,
    row.subject_name,
    row.subjectName,
    row.asignatura,
    row.nombre_materia,
  )
}

function getScheduleCareerName(row = {}, plan = null) {
  const directCareers = getCareerValues(row)

  const career = firstClean(
    plan?.carrera,
    row.carrera_nombre,
    row.carreraNombre,
    row.nombreCarrera,
    row.career_name,
    row.careerName,
    row.program_name,
    row.programName,
    directCareers.find((career) => !isLikelyCareerAlias(career)),
    row.carrera,
    directCareers[0],
    row.program_id,
    row.programId,
  )

  return resolveCareerDisplayName(career) || career
}

function getScheduleStart(row = {}) {
  return firstClean(row.inicio, row.hora_desde, row.horaDesde, row.desde, row.start)
}

function getScheduleEnd(row = {}) {
  return firstClean(row.fin, row.hora_hasta, row.horaHasta, row.hasta, row.end)
}

function buildSchedulePlanOptions(planesEstudio = []) {
  const careerNamesById = buildCareerNamesById(planesEstudio)
  const subjectCareersByKey = buildSubjectCareersByKey(planesEstudio, careerNamesById)

  return asArray(planesEstudio)
    .map((row, index) => {
      const careers = getCareers(row, careerNamesById, subjectCareersByKey)
      const carrera = careers[0] ?? ''
      const carreraId = getCareerId(row)
      const materiaCodigo = getPlanSubjectCode(row)
      const materiaNombre = getPlanSubjectName(row) || materiaCodigo
      const materiaId = firstClean(row.materia_id, row.materiaId, row.subject_id, row.subjectId, row.id)
      const planId = clean(row.plan_id ?? row.planId)

      return {
        key: firstClean(materiaId, `${planId}:${carrera}:${materiaCodigo}:${index}`),
        carrera,
        carreraId,
        carreraKey: normalizeText(carrera),
        planId,
        materiaId,
        materiaIdKey: normalizeIdentity(materiaId),
        materia_codigo: materiaCodigo,
        materiaKey: normalizeIdentity(materiaCodigo),
        materia_nombre: materiaNombre,
        materiaNameKey: normalizeText(materiaNombre),
        anio: getAcademicYear(row),
      }
    })
    .filter((plan) => (
      !isIgnoredCareerLabel(plan.carrera) &&
      (plan.materia_codigo || plan.materia_nombre)
    ))
}

function findPlanForSchedule(planOptions = [], schedule = {}) {
  const scheduleSubjectId = firstClean(
    schedule.materia_id,
    schedule.materiaId,
    schedule.subject_id,
    schedule.subjectId,
  )
  const scheduleSubjectIdKey = normalizeIdentity(scheduleSubjectId)
  const subjectCode = getScheduleSubjectCode(schedule)
  const subjectKey = normalizeIdentity(subjectCode)
  const subjectNameKey = normalizeText(getScheduleSubjectName(schedule) || subjectCode)
  const careerKeys = new Set([
    getCareerId(schedule),
    getScheduleCareerName(schedule),
    ...getCareerValues(schedule),
  ].map((value) => normalizeText(value)).filter(Boolean))
  const planId = clean(schedule.plan_id ?? schedule.planId)
  const matchesScheduleCareer = (option) => (
    careerKeys.has(normalizeText(option.carreraId)) ||
    careerKeys.has(option.carreraKey)
  )
  const matchesSchedulePlan = (option) => !planId || clean(option.planId) === planId
  const matchesScheduleSubject = (option) => (
    (scheduleSubjectIdKey && option.materiaIdKey === scheduleSubjectIdKey) ||
    (subjectKey && option.materiaKey === subjectKey) ||
    (subjectNameKey && option.materiaNameKey === subjectNameKey)
  )

  const scopedOptions = planId
    ? planOptions.filter((option) => matchesSchedulePlan(option))
    : planOptions

  const exactBySubjectId = scheduleSubjectIdKey
    ? scopedOptions.find((option) => (
        option.materiaIdKey === scheduleSubjectIdKey &&
        (!careerKeys.size || matchesScheduleCareer(option))
      ))
    : null
  if (exactBySubjectId) return exactBySubjectId

  const exactByCode = subjectKey
    ? scopedOptions.find((option) => (
        option.materiaKey === subjectKey &&
        (!careerKeys.size || matchesScheduleCareer(option))
      ))
    : null
  if (exactByCode) return exactByCode

  const exactByName = subjectNameKey
    ? scopedOptions.find((option) => (
        option.materiaNameKey === subjectNameKey &&
        (!careerKeys.size || matchesScheduleCareer(option))
      ))
    : null
  if (exactByName) return exactByName

  const scopedSubjectMatches = scopedOptions.filter((option) => matchesScheduleSubject(option))
  if (scopedSubjectMatches.length === 1) return scopedSubjectMatches[0]

  const subjectIdMatches = scheduleSubjectIdKey
    ? planOptions.filter((option) => option.materiaIdKey === scheduleSubjectIdKey)
    : []
  if (subjectIdMatches.length === 1) return subjectIdMatches[0]

  const codeMatches = subjectKey
    ? planOptions.filter((option) => option.materiaKey === subjectKey)
    : []
  if (codeMatches.length === 1) return codeMatches[0]

  const nameMatches = subjectNameKey
    ? planOptions.filter((option) => option.materiaNameKey === subjectNameKey)
    : []
  return nameMatches.length === 1 ? nameMatches[0] : null
}

function getScheduleDayOrder(day) {
  return DAY_ORDER.get(normalizeText(day)) ?? 99
}

function getYearOrder(year) {
  const match = clean(year).match(/\d+/)
  if (!match) return 99

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : 99
}

function timeToMinutes(value) {
  const [hours, minutes] = clean(value).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function formatSlotLabel(slot = {}) {
  return [clean(slot.inicio), clean(slot.fin)].filter(Boolean).join(' A ') || '-'
}

function normalizeTimetableSlot(slot = {}, index = 0) {
  const inicio = clean(slot.inicio)
  const fin = clean(slot.fin)
  return {
    key: `${inicio}:${fin}:${index}`,
    inicio,
    fin,
    startMinutes: timeToMinutes(inicio),
    endMinutes: timeToMinutes(fin),
    label: formatSlotLabel(slot),
  }
}

function slotCoversRange(slot, startMinutes, endMinutes) {
  return (
    Number.isFinite(slot.startMinutes) &&
    Number.isFinite(slot.endMinutes) &&
    Number.isFinite(startMinutes) &&
    Number.isFinite(endMinutes) &&
    slot.startMinutes >= startMinutes &&
    slot.endMinutes <= endMinutes
  )
}

function getSlotPlacement(row = {}, slots = []) {
  const startMinutes = timeToMinutes(row.inicio)
  const endMinutes = timeToMinutes(row.fin)
  const coveredIndexes = slots
    .map((slot, index) => (slotCoversRange(slot, startMinutes, endMinutes) ? index : -1))
    .filter((index) => index >= 0)

  if (coveredIndexes.length > 0) {
    return {
      startIndex: coveredIndexes[0],
      span: coveredIndexes[coveredIndexes.length - 1] - coveredIndexes[0] + 1,
    }
  }

  const exactIndex = slots.findIndex((slot) => clean(slot.inicio) === clean(row.inicio) && clean(slot.fin) === clean(row.fin))
  if (exactIndex >= 0) return { startIndex: exactIndex, span: 1 }

  const overlappingIndex = slots.findIndex((slot) => (
    Number.isFinite(slot.startMinutes) &&
    Number.isFinite(slot.endMinutes) &&
    Number.isFinite(startMinutes) &&
    Number.isFinite(endMinutes) &&
    slot.startMinutes < endMinutes &&
    slot.endMinutes > startMinutes
  ))

  return {
    startIndex: overlappingIndex >= 0 ? overlappingIndex : 0,
    span: 1,
  }
}

export function buildTimetableSlots(rows = []) {
  const slotsByKey = new Map(DEFAULT_NIGHT_TIMETABLE_SLOTS.map((slot, index) => {
    const normalized = normalizeTimetableSlot(slot, index)
    return [`${normalized.inicio}::${normalized.fin}`, normalized]
  }))

  asArray(rows).forEach((row) => {
    const startMinutes = timeToMinutes(row.inicio)
    const endMinutes = timeToMinutes(row.fin)
    const isCoveredByDefaults = Array.from(slotsByKey.values()).some((slot) => (
      slotCoversRange(slot, startMinutes, endMinutes)
    ))

    if (isCoveredByDefaults || !clean(row.inicio) || !clean(row.fin)) return

    const normalized = normalizeTimetableSlot({ inicio: row.inicio, fin: row.fin }, slotsByKey.size)
    slotsByKey.set(`${normalized.inicio}::${normalized.fin}`, normalized)
  })

  return Array.from(slotsByKey.values())
    .sort((left, right) => (
      (left.startMinutes ?? 9999) - (right.startMinutes ?? 9999) ||
      (left.endMinutes ?? 9999) - (right.endMinutes ?? 9999)
    ))
    .map((slot, index) => ({ ...slot, key: `${slot.inicio}:${slot.fin}:${index}` }))
}

export function buildTimetableDays(rows = []) {
  const dayLabels = new Map(DEFAULT_TIMETABLE_DAYS.map((day) => [normalizeText(day), day]))

  asArray(rows).forEach((row) => {
    const day = clean(row.dia)
    const key = normalizeText(day)
    if (day && !dayLabels.has(key)) dayLabels.set(key, day)
  })

  return Array.from(dayLabels.entries())
    .sort((left, right) => (
      getScheduleDayOrder(left[1]) - getScheduleDayOrder(right[1]) ||
      left[1].localeCompare(right[1], 'es', { sensitivity: 'base' })
    ))
    .map(([key, label]) => ({ key, label }))
}

export function buildTimetableGridRows(rows = [], slots = [], days = []) {
  return days.map((day) => {
    const placements = rows
      .filter((row) => normalizeText(row.dia) === day.key)
      .map((row) => ({ row, ...getSlotPlacement(row, slots) }))
      .sort((left, right) => left.startIndex - right.startIndex || right.span - left.span)
    const cells = []

    for (let slotIndex = 0; slotIndex < slots.length;) {
      const entries = placements.filter((placement) => placement.startIndex === slotIndex)

      if (entries.length === 0) {
        cells.push({
          key: `${day.key}:${slots[slotIndex].key}:empty`,
          colSpan: 1,
          rows: [],
        })
        slotIndex += 1
        continue
      }

      const span = Math.max(...entries.map((entry) => entry.span), 1)
      cells.push({
        key: `${day.key}:${slots[slotIndex].key}`,
        colSpan: span,
        rows: entries.map((entry) => entry.row),
      })
      slotIndex += span
    }

    return { ...day, cells }
  })
}

function getScheduleRowIdentity(row = {}) {
  return [
    normalizeText(row.carrera),
    normalizeText(row.anio),
    normalizeIdentity(row.materia_codigo || row.materia),
    normalizeText(row.materia),
    normalizeText(row.docente),
    normalizeText(row.dia),
    clean(row.inicio),
    clean(row.fin),
    normalizeText(row.aula),
  ].join('::')
}

function dedupeScheduleRows(rows = []) {
  const seen = new Set()

  return rows.filter((row) => {
    const key = getScheduleRowIdentity(row)
    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

export function buildInstitutionScheduleTimetableGroups(rows = []) {
  const groups = new Map()

  asArray(rows).forEach((row) => {
    const carrera = clean(row.carrera) || UNASSIGNED_CAREER
    const anio = clean(row.anio) || UNASSIGNED_YEAR
    const key = `${normalizeText(carrera)}::${normalizeText(anio)}`
    const current = groups.get(key) ?? { key, carrera, anio, rows: [] }
    current.rows.push(row)
    groups.set(key, current)
  })

  return Array.from(groups.values())
    .sort((left, right) => (
      left.carrera.localeCompare(right.carrera, 'es', { sensitivity: 'base' }) ||
      getYearOrder(left.anio) - getYearOrder(right.anio) ||
      left.anio.localeCompare(right.anio, 'es', { sensitivity: 'base', numeric: true })
    ))
    .map((group) => {
      const slots = buildTimetableSlots(group.rows)
      const days = buildTimetableDays(group.rows)

      return {
        ...group,
        slots,
        days,
        gridRows: buildTimetableGridRows(group.rows, slots, days),
      }
    })
}

export function buildInstitutionScheduleGrid(rows = []) {
  const safeRows = asArray(rows)
  const dayLabels = new Map()
  const slotLabels = new Map()

  safeRows.forEach((row) => {
    const day = clean(row.dia)
    const start = clean(row.inicio)
    const end = clean(row.fin)
    const slotKey = `${start}::${end}`
    const slotLabel = clean(row.horario) || [start, end].filter(Boolean).join(' - ') || '-'

    if (day && !dayLabels.has(normalizeText(day))) dayLabels.set(normalizeText(day), day)
    if (!slotLabels.has(slotKey)) {
      slotLabels.set(slotKey, {
        key: slotKey,
        inicio: start,
        fin: end,
        label: slotLabel,
      })
    }
  })

  const days = Array.from(dayLabels.entries())
    .sort((left, right) => (
      getScheduleDayOrder(left[1]) - getScheduleDayOrder(right[1]) ||
      left[1].localeCompare(right[1], 'es', { sensitivity: 'base' })
    ))
    .map(([key, label]) => ({ key, label }))
  const slots = Array.from(slotLabels.values())
    .sort((left, right) => (
      left.inicio.localeCompare(right.inicio, 'es', { sensitivity: 'base', numeric: true }) ||
      left.fin.localeCompare(right.fin, 'es', { sensitivity: 'base', numeric: true })
    ))

  return {
    days,
    slots: slots.map((slot) => {
      const cells = days.reduce((map, day) => {
        map[day.key] = safeRows.filter((row) => (
          normalizeText(row.dia) === day.key &&
          clean(row.inicio) === slot.inicio &&
          clean(row.fin) === slot.fin
        ))
        return map
      }, {})

      return { ...slot, cells }
    }),
  }
}

export function buildInstitutionScheduleRows({
  horariosDocentes = [],
  planesEstudio = [],
} = {}) {
  const planOptions = buildSchedulePlanOptions(planesEstudio)

  const rows = asArray(horariosDocentes)
    .map((schedule, index) => {
      if (!schedule || typeof schedule !== 'object') return null

      const plan = findPlanForSchedule(planOptions, schedule)
      const carrera = getScheduleCareerName(schedule, plan) || UNASSIGNED_CAREER
      if (isIgnoredCareerLabel(carrera)) return null

      const materiaCodigo = getScheduleSubjectCode(schedule)
      const materia = getScheduleSubjectName(schedule) || plan?.materia_nombre || materiaCodigo || '-'
      const anio = getAcademicYear(plan ?? {}, getAcademicYear(schedule)) || UNASSIGNED_YEAR
      const inicio = getScheduleStart(schedule)
      const fin = getScheduleEnd(schedule)

      return {
        key: clean(schedule.id) || [
          normalizeIdentity(carrera),
          normalizeIdentity(anio),
          normalizeIdentity(materiaCodigo || materia),
          normalizeIdentity(getTeacherName(schedule)),
          normalizeIdentity(schedule.dia),
          normalizeIdentity(inicio),
          index,
        ].join(':'),
        carrera,
        anio,
        materia,
        materia_codigo: materiaCodigo,
        docente: getTeacherName(schedule) || '-',
        dia: firstClean(schedule.dia, schedule.day, schedule.weekday, schedule.dia_semana) || '-',
        inicio,
        fin,
        horario: [inicio, fin].filter(Boolean).join(' - ') || '-',
        aula: firstClean(schedule.aula, schedule.room, schedule.ubicacion) || '-',
      }
    })
    .filter(Boolean)

  return dedupeScheduleRows(rows)
    .sort((left, right) => (
      left.carrera.localeCompare(right.carrera, 'es', { sensitivity: 'base' }) ||
      getYearOrder(left.anio) - getYearOrder(right.anio) ||
      getScheduleDayOrder(left.dia) - getScheduleDayOrder(right.dia) ||
      left.inicio.localeCompare(right.inicio, 'es', { sensitivity: 'base' }) ||
      left.materia.localeCompare(right.materia, 'es', { sensitivity: 'base' }) ||
      left.docente.localeCompare(right.docente, 'es', { sensitivity: 'base' })
    ))
}

function addCareerLabel(labels, career) {
  const cleaned = clean(career)
  if (!cleaned || isIgnoredCareerLabel(cleaned)) return ''

  const label = resolveCareerDisplayName(cleaned) || cleaned
  const key = normalizeText(label)
  if (!key || isIgnoredCareerLabel(label)) return ''
  if (!labels.has(key)) labels.set(key, label)
  return key
}

function addCareerOptionLabel(labels, career, careerNamesById, hasCanonicalCareerCatalog) {
  const label = resolveCareerLabel(career, careerNamesById)

  if (hasCanonicalCareerCatalog && isLikelyCareerAlias(label)) return ''
  return addCareerLabel(labels, label)
}

function addValueToCareerSet({ labels, sets, career, value }) {
  const key = addCareerLabel(labels, career)
  if (!key || !value) return

  const current = sets.get(key) ?? new Set()
  current.add(value)
  sets.set(key, current)
}

function addRowsToTeacherSets({
  rows,
  labels,
  sets,
  allTeacherKeys,
  knownTeacherKeys,
  careerNamesById,
  subjectCareersByKey,
  aliases,
  sourcePrefix,
  allowUnknownTeachers = true,
}) {
  asArray(rows).forEach((row) => {
    if (!row || typeof row !== 'object') return

    const teacherKey = getTeacherKey(row, aliases)
    if (!teacherKey) return
    if (!allowUnknownTeachers && knownTeacherKeys && !knownTeacherKeys.has(teacherKey)) return

    if (allowUnknownTeachers) allTeacherKeys.add(teacherKey)

    const careers = getCareers(row, careerNamesById, subjectCareersByKey)

    careers.forEach((career) => {
      addValueToCareerSet({ labels, sets, career, value: teacherKey })
    })

    if (careers.length === 0 && sourcePrefix === 'directory') {
      addValueToCareerSet({ labels, sets, career: UNASSIGNED_CAREER, value: teacherKey })
    }
  })
}

function addStudentRows({ alumnos, careerNamesById, subjectCareersByKey, labels, sets }) {
  asArray(alumnos).forEach((student, index) => {
    if (!student || typeof student !== 'object') return

    const studentKey = getStudentKey(student, index)
    const careers = getCareers(student, careerNamesById, subjectCareersByKey)
    const targetCareers = careers.length > 0 ? careers : [UNASSIGNED_CAREER]

    targetCareers.forEach((career) => {
      addValueToCareerSet({ labels, sets, career, value: studentKey })
    })
  })
}

function addSubjectRows({ planesEstudio, careerNamesById, labels, sets }) {
  asArray(planesEstudio).forEach((row) => {
    if (!row || typeof row !== 'object') return

    const subjectKey = getSubjectKey(row)
    if (!subjectKey) return

    getCareers(row, careerNamesById).forEach((career) => {
      addValueToCareerSet({ labels, sets, career, value: normalizeText(subjectKey) })
    })
  })
}

export function buildAdminInstitutionOverview({
  alumnos = [],
  cargaHorariaDocente = [],
  careerOptions = [],
  docenteMateria = [],
  docentes = [],
  horariosDocentes = [],
  planesEstudio = [],
  teacherDirectory = [],
} = {}) {
  const careerNamesById = buildCareerNamesById(planesEstudio)
  const subjectCareersByKey = buildSubjectCareersByKey(planesEstudio, careerNamesById)
  const careerLabels = new Map()
  const studentSets = new Map()
  const teacherSets = new Map()
  const subjectSets = new Map()
  const allStudentKeys = new Set()
  const allTeacherKeys = new Set()
  const scheduleRows = buildInstitutionScheduleRows({ horariosDocentes, planesEstudio })
  const hasCanonicalCareerCatalog = Array.from(careerNamesById.values())
    .some((career) => career && !isLikelyCareerAlias(career))

  asArray(careerOptions).forEach((career) => {
    addCareerOptionLabel(careerLabels, career, careerNamesById, hasCanonicalCareerCatalog)
  })
  asArray(planesEstudio).forEach((row) => {
    getCareers(row, careerNamesById, subjectCareersByKey).forEach((career) => addCareerLabel(careerLabels, career))
  })

  asArray(alumnos).forEach((student, index) => allStudentKeys.add(getStudentKey(student, index)))
  addStudentRows({ alumnos, careerNamesById, subjectCareersByKey, labels: careerLabels, sets: studentSets })
  addSubjectRows({ planesEstudio, careerNamesById, labels: careerLabels, sets: subjectSets })

  const hasTeacherDirectory = asArray(teacherDirectory).length > 0
  const hasTeacherProfiles = asArray(docentes).length > 0
  const teacherSources = hasTeacherDirectory
    ? asArray(teacherDirectory)
    : hasTeacherProfiles
      ? asArray(docentes)
      : [
          ...asArray(horariosDocentes),
          ...asArray(cargaHorariaDocente),
          ...asArray(docenteMateria),
        ]
  const aliases = createTeacherAliasIndex(teacherSources)
  const addTeacherRows = (rows, sourcePrefix, allowUnknownTeachers = true) => addRowsToTeacherSets({
    rows,
    labels: careerLabels,
    sets: teacherSets,
    allTeacherKeys,
    knownTeacherKeys: allTeacherKeys,
    careerNamesById,
    subjectCareersByKey,
    aliases,
    sourcePrefix,
    allowUnknownTeachers,
  })

  if (hasTeacherDirectory) {
    addTeacherRows(teacherDirectory, 'directory')
    addTeacherRows(docentes, 'profiles', false)
    addTeacherRows(horariosDocentes, 'schedules', false)
    addTeacherRows(cargaHorariaDocente, 'loads', false)
    addTeacherRows(docenteMateria, 'assignments', false)
  } else if (hasTeacherProfiles) {
    addTeacherRows(docentes, 'profiles')
    addTeacherRows(horariosDocentes, 'schedules', false)
    addTeacherRows(cargaHorariaDocente, 'loads', false)
    addTeacherRows(docenteMateria, 'assignments', false)
  } else {
    addTeacherRows(horariosDocentes, 'schedules')
    addTeacherRows(cargaHorariaDocente, 'loads')
    addTeacherRows(docenteMateria, 'assignments')
  }

  const rowKeys = new Set([
    ...careerLabels.keys(),
    ...studentSets.keys(),
    ...teacherSets.keys(),
    ...subjectSets.keys(),
  ])
  const careerRows = Array.from(rowKeys)
    .map((key) => ({
      career: careerLabels.get(key) ?? UNASSIGNED_CAREER,
      key,
      studentCount: studentSets.get(key)?.size ?? 0,
      teacherCount: teacherSets.get(key)?.size ?? 0,
      subjectCount: subjectSets.get(key)?.size ?? 0,
    }))
    .filter((row) => (
      row.career !== UNASSIGNED_CAREER ||
      row.studentCount > 0 ||
      row.teacherCount > 0 ||
      row.subjectCount > 0
    ))
    .sort((left, right) => {
      if (left.career === UNASSIGNED_CAREER) return 1
      if (right.career === UNASSIGNED_CAREER) return -1

      const byStudents = right.studentCount - left.studentCount
      const byTeachers = right.teacherCount - left.teacherCount
      return byStudents || byTeachers || left.career.localeCompare(right.career, 'es', { sensitivity: 'base' })
    })

  const unassignedRow = careerRows.find((row) => row.career === UNASSIGNED_CAREER) ?? {
    career: UNASSIGNED_CAREER,
    key: normalizeText(UNASSIGNED_CAREER),
    studentCount: 0,
    teacherCount: 0,
    subjectCount: 0,
  }
  const namedCareerRows = careerRows.filter((row) => row.career !== UNASSIGNED_CAREER)

  return {
    careerRows: namedCareerRows,
    quality: {
      careersWithoutTeachers: namedCareerRows
        .filter((row) => row.teacherCount === 0 && (row.studentCount > 0 || row.subjectCount > 0))
        .map((row) => row.career),
      studentsWithoutCareer: unassignedRow.studentCount,
      teachersWithoutCareer: unassignedRow.teacherCount,
    },
    totals: {
      careers: namedCareerRows.length,
      students: allStudentKeys.size,
      teachers: allTeacherKeys.size,
      subjects: Array.from(subjectSets.values()).reduce((total, subjects) => total + subjects.size, 0),
      schedules: scheduleRows.length,
    },
  }
}
