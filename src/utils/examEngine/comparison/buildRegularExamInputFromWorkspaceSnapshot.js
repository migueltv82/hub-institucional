import { EXAM_CALLS, EXAM_GENERATION_TYPES, TIPOS_PERIODO } from '../constants.js'
import {
  readExplicitTeachingHours,
  summarizeTeacherScheduleTeachingHours,
  TEACHER_ASSIGNMENT_RULE_MODES,
  TEACHING_HOURS_SOURCES,
} from '../rules/calculateTeacherAssignmentLimit.js'
import {
  DOCENTE_MATERIA_RESOLUTION_STATUS,
  buildDocenteMateriaAssignmentSummary,
  resolveDocenteMateriaAssignment,
} from './resolveDocenteMateriaAssignment.js'
import { buildTeacherExamSourceContext } from '../teacherExamSourceContext.js'
import { summarizeStructuredTeacherSource } from '../teacherStructuredSource.js'
import { getSubjectKey } from '../normalize/subjects.js'
import { getManualExamExclusion, isManualExamExcludedSubject } from '../rules/manualExamExclusions.js'

const DAY_NAMES_ES = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
]

const DAY_ALIASES = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
  dom: 'domingo',
  domingo: 'domingo',
  sun: 'domingo',
  sunday: 'domingo',
  lun: 'lunes',
  lunes: 'lunes',
  mon: 'lunes',
  monday: 'lunes',
  mar: 'martes',
  martes: 'martes',
  tue: 'martes',
  tuesday: 'martes',
  mie: 'miercoles',
  miercoles: 'miercoles',
  wed: 'miercoles',
  wednesday: 'miercoles',
  jue: 'jueves',
  jueves: 'jueves',
  thu: 'jueves',
  thursday: 'jueves',
  vie: 'viernes',
  viernes: 'viernes',
  fri: 'viernes',
  friday: 'viernes',
  sab: 'sabado',
  sabado: 'sabado',
  sat: 'sabado',
  saturday: 'sabado',
}

const TEACHER_ID_FIELDS = [
  'docenteId',
  'docente_id',
  'teacherId',
  'teacher_id',
  'teacherKey',
  'profesorId',
  'profesor_id',
]

const TEACHER_NAME_FIELDS = [
  'profesor',
  'docente',
  'docenteNombre',
  'nombreDocente',
  'teacherName',
  'teacher_name',
  'full_name',
  'fullName',
  'display_name',
  'displayName',
  'nombreCompleto',
  'apellidoNombre',
]

const SUBJECT_CODE_FIELDS = [
  'materia',
  'codigo',
  'code',
  'materiaCodigo',
  'codigoMateria',
  'subjectCode',
  'subject_code',
  'materiaId',
  'materia_id',
  'id',
]

const SUBJECT_NAME_FIELDS = [
  'nombreMateria',
  'materiaNombre',
  'subjectName',
  'subject_name',
  'asignatura',
  'nombreAsignatura',
  'nombre',
  'name',
  'materia',
]

const CAREER_FIELDS = ['carrera', 'programa', 'program', 'career', 'nombreCarrera', 'careerName']
const CAREER_ID_FIELDS = ['carreraId', 'carrera_id', 'careerId', 'career_id', 'programaId', 'programId']
const TURN_FIELDS = ['turno', 'shift', 'turnoDisponible', 'turnoDisponibilidad']
const DAY_FIELDS = ['dia', 'diaSemana', 'day', 'weekday', 'diaDisponible', 'diaAsistencia']
const START_FIELDS = ['inicio', 'horaInicio', 'hora_inicio', 'horaDesde', 'hora_desde', 'desde', 'start', 'startTime']
const END_FIELDS = ['fin', 'horaFin', 'hora_fin', 'horaHasta', 'hora_hasta', 'hasta', 'end', 'endTime']
const LOAD_SOURCE_FIELDS = ['source', 'fuente', 'origen']

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value instanceof Set) return value.size > 0
  return value !== undefined && value !== null && clean(value) !== ''
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeNameAlias(value) {
  const tokens = normalizeText(value)
    .split(' ')
    .map(normalizeToken)
    .filter(Boolean)
    .sort()

  return tokens.length ? `namekey:${tokens.join(':')}` : ''
}

function normalizeKey(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '')
}

function normalizeFieldName(value) {
  return normalizeToken(value)
}

function makeId(prefix, ...values) {
  const key = values.map(normalizeKey).filter(Boolean).join('-')
  return key ? `${prefix}-${key}` : ''
}

function firstValue(...values) {
  return values.find(hasValue)
}

function readField(row = {}, aliases = []) {
  if (!row || typeof row !== 'object') return undefined

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && hasValue(row[alias])) {
      return row[alias]
    }
  }

  const wanted = new Set(aliases.map(normalizeFieldName))
  const entry = Object.entries(row).find(([key, value]) => wanted.has(normalizeFieldName(key)) && hasValue(value))
  return entry?.[1]
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function uniqueValues(values) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function uniqueNormalizedValues(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function subjectCode(subject = {}) {
  return clean(firstValue(readField(subject, SUBJECT_CODE_FIELDS), subject.id))
}

function subjectName(subject = {}) {
  return clean(firstValue(readField(subject, SUBJECT_NAME_FIELDS), subjectCode(subject)))
}

function teacherSubjectName(row = {}, source = 'docentes') {
  return clean(firstValue(
    readField(row, ['nombreMateria', 'materiaNombre', 'subjectName', 'subject_name', 'asignatura', 'nombreAsignatura']),
    readField(row, ['materia', 'codigo', 'code']),
    ['horariosDocentes', 'carga_horaria_docente'].includes(source) ? subjectName(row) : '',
  ))
}

function subjectCareer(subject = {}) {
  return clean(firstValue(readField(subject, CAREER_FIELDS)))
}

function subjectCareerId(subject = {}) {
  return clean(firstValue(readField(subject, CAREER_ID_FIELDS), makeId('career', subjectCareer(subject))))
}

function subjectAliasValues(subject = {}) {
  return uniqueValues([
    ...SUBJECT_CODE_FIELDS.map((field) => readField(subject, [field])),
    ...SUBJECT_NAME_FIELDS.map((field) => readField(subject, [field])),
    subjectCode(subject),
    subjectName(subject),
  ])
}

function subjectAliasKeys(subject = {}) {
  return [...new Set(subjectAliasValues(subject).flatMap((value) => {
    const normalized = normalizeToken(value)
    if (!normalized) return []
    const match = normalized.match(/^([a-z]+)0*(\d+)$/)
    if (!match) return [normalized]
    const [, prefix, digits] = match
    return [normalized, `${prefix}${Number(digits)}`, `${prefix}${digits.padStart(2, '0')}`]
  }).filter(Boolean))]
}

function subjectCareerKeys(subject = {}) {
  const keys = [
    readField(subject, CAREER_ID_FIELDS),
    subjectCareerId(subject),
    subjectCareer(subject),
  ].map(normalizeToken).filter(Boolean)

  return [...new Set(keys.length ? keys : [''])]
}

function careerWords(value) {
  const stopWords = new Set([
    'de', 'del', 'la', 'las', 'el', 'los', 'en', 'para', 'y', 'e', 'con',
    'tecnico', 'tecnica', 'tecnicatura', 'superior', 'turno', 'noche',
    'manana', 'tarde', 'vespertino', 'matutino', 'presencial', 'virtual',
  ])
  const aliases = {
    traductado: 'traductorado',
    tradcutorado: 'traductorado',
    traductor: 'traductorado',
    traductores: 'traductorado',
    traduccion: 'traductorado',
    laboratorios: 'laboratorio',
  }
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((word) => aliases[word] ?? word)
    .filter((word) => word && !stopWords.has(word))
}

function careersAreCompatible(left, right) {
  const leftWords = careerWords(left)
  const rightWords = careerWords(right)
  if (!leftWords.length || !rightWords.length) return false
  const leftSet = new Set(leftWords)
  const rightSet = new Set(rightWords)
  return leftWords.every((word) => rightSet.has(word)) || rightWords.every((word) => leftSet.has(word))
}

function subjectWords(value) {
  const romanNumbers = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6' }
  const stopWords = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'para', 'y', 'e'])
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((word) => romanNumbers[word] ?? word)
    .filter((word) => word && !stopWords.has(word) && !(word.length <= 3 && /^[a-z]+$/.test(word)))
}

function subjectNamesAreCompatible(left, right) {
  const leftWords = subjectWords(left)
  const rightWords = subjectWords(right)
  if (!leftWords.length || !rightWords.length) return false
  const leftKey = leftWords.join(' ')
  const rightKey = rightWords.join(' ')
  if (leftKey === rightKey) return true
  if (Math.min(leftWords.length, rightWords.length) < 2) return false
  const leftSet = new Set(leftWords)
  const rightSet = new Set(rightWords)
  return leftWords.every((word) => rightSet.has(word)) || rightWords.every((word) => leftSet.has(word))
}

function subjectMatchKeys(subject = {}) {
  const aliases = subjectAliasKeys(subject)
  if (!aliases.length) return []

  return subjectCareerKeys(subject).flatMap((careerKey) => aliases.map((alias) => `${careerKey}::${alias}`))
}

function joinNameParts(row = {}) {
  const nombre = clean(readField(row, ['nombre', 'name', 'firstName', 'first_name']))
  const apellido = clean(readField(row, ['apellido', 'lastName', 'last_name', 'surname']))
  if (nombre && apellido) return `${nombre} ${apellido}`
  return nombre || apellido
}

function teacherName(teacher = {}) {
  if (typeof teacher === 'string') return clean(teacher)

  return clean(firstValue(
    readField(teacher, TEACHER_NAME_FIELDS),
    joinNameParts(teacher),
    readField(teacher, ['nombre', 'name']),
  ))
}

function teacherDocument(teacher = {}) {
  return clean(readField(teacher, [
    'dni_docente',
    'dniDocente',
    'dni',
    'documento',
    'document',
    'documentNumber',
    'numeroDocumento',
  ]))
}

function teacherEmail(teacher = {}) {
  return clean(readField(teacher, ['email', 'correo', 'mail', 'correoElectronico']))
}

function explicitTeacherId(teacher = {}, { allowRowId = true } = {}) {
  if (typeof teacher === 'string') return ''

  return clean(firstValue(
    readField(teacher, TEACHER_ID_FIELDS),
    allowRowId ? readField(teacher, ['id']) : '',
  ))
}

function teacherStableId(teacher = {}, { source = 'docentes', index = 0 } = {}) {
  if (typeof teacher === 'string') return makeId('doc', teacher)

  return clean(firstValue(
    explicitTeacherId(teacher, { allowRowId: source !== 'horariosDocentes' }),
    teacherDocument(teacher) ? makeId('doc', teacherDocument(teacher)) : '',
    teacherName(teacher) ? makeId('doc', teacherName(teacher)) : '',
    makeId('doc', source, index + 1),
  ))
}

function teacherAliasValues(teacher = {}, { id = '', source = 'docentes' } = {}) {
  if (typeof teacher === 'string') return uniqueValues([id, teacher])
  const displayName = teacherName(teacher)
  const joinedName = joinNameParts(teacher)

  return uniqueValues([
    id,
    explicitTeacherId(teacher, { allowRowId: source !== 'horariosDocentes' }),
    teacherDocument(teacher),
    teacherEmail(teacher),
    displayName,
    normalizeNameAlias(displayName),
    readField(teacher, ['full_name', 'fullName', 'display_name', 'displayName', 'nombreCompleto']),
    joinedName,
    normalizeNameAlias(joinedName),
  ])
}

function registerAlias(registry, id, alias) {
  const textKey = normalizeText(alias)
  const tokenKey = normalizeToken(alias)
  if (textKey) registry.aliasToId.set(textKey, id)
  if (tokenKey) registry.aliasToId.set(tokenKey, id)
}

function registerTeacherAliases(registry, id, aliases = []) {
  aliases.forEach((alias) => registerAlias(registry, id, alias))
}

function findExistingTeacherId(registry, aliases = []) {
  for (const alias of aliases) {
    const textKey = normalizeText(alias)
    const tokenKey = normalizeToken(alias)
    const existing = registry.aliasToId.get(textKey) ?? registry.aliasToId.get(tokenKey)
    if (existing) return existing
  }

  return ''
}

function normalizeTurno(value) {
  return normalizeText(value).toUpperCase()
}

function parseTimeToMinutes(value) {
  const text = clean(value)
  const match = text.match(/^(\d{1,2})(?::|\.|h)?\s*(\d{2})?$/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export function inferTurnoFromTime({ inicio } = {}) {
  const minutes = parseTimeToMinutes(inicio)
  if (minutes === null) return ''
  if (minutes < 13 * 60) return 'MANANA'
  if (minutes < 18 * 60) return 'TARDE'
  return 'NOCHE'
}

function resolveTurno(row = {}) {
  return normalizeTurno(readField(row, TURN_FIELDS)) || inferTurnoFromTime({
    inicio: readField(row, START_FIELDS),
    fin: readField(row, END_FIELDS),
  })
}

function normalizeDay(value) {
  const key = normalizeToken(value)
  return DAY_ALIASES[key] ?? ''
}

function fieldArray(row = {}, fields = []) {
  return fields.flatMap((field) => {
    const value = readField(row, [field])
    if (!hasValue(value)) return []
    if (Array.isArray(value)) return value
    if (value instanceof Set) return [...value]
    if (value && typeof value === 'object') {
      const looksLikeAvailabilityEntry = DAY_FIELDS.some((dayField) => hasValue(readField(value, [dayField])))
      if (looksLikeAvailabilityEntry) return [value]
      return Object.entries(value).filter(([, available]) => available).map(([key]) => key)
    }
    return [value]
  })
}

function extractDayValues(row = {}) {
  return uniqueNormalizedValues([
    readField(row, DAY_FIELDS),
    ...fieldArray(row, ['diasAsistencia', 'diasDisponibles', 'diasLaborales', 'disponibilidad']),
    ...fieldArray(row, ['availability', 'fechasDisponibles']).map((entry) => (
      entry && typeof entry === 'object'
        ? firstValue(readField(entry, DAY_FIELDS), readField(entry, ['fecha', 'fechaIso', 'date']))
        : entry
    )),
  ].map((value) => normalizeDay(value) || value))
}

function buildAvailabilityEntry(row = {}, source = 'horariosDocentes') {
  const day = normalizeDay(readField(row, DAY_FIELDS))
  if (!day) return null

  const turno = resolveTurno(row)

  return {
    dia: day,
    diaSemana: day,
    day,
    turno,
    shift: turno,
    inicio: clean(readField(row, START_FIELDS)),
    fin: clean(readField(row, END_FIELDS)),
    source,
  }
}

function extractAvailabilityEntries(row = {}, source = 'docentes') {
  const explicitEntries = fieldArray(row, ['availability', 'disponibilidad', 'fechasDisponibles'])
    .map((entry) => {
      if (entry && typeof entry === 'object') return buildAvailabilityEntry(entry, source)
      const day = normalizeDay(entry)
      return day ? { dia: day, diaSemana: day, day, turno: '', shift: '', inicio: '', fin: '', source } : null
    })
    .filter(Boolean)
  const rowEntry = buildAvailabilityEntry(row, source)

  return [rowEntry, ...explicitEntries].filter(Boolean)
}

function uniqueAvailability(entries = []) {
  const seen = new Set()
  const result = []

  entries.forEach((entry) => {
    const key = [
      entry.dia,
      entry.turno,
      entry.inicio,
      entry.fin,
      entry.source,
    ].map(clean).join('::')
    if (seen.has(key)) return
    seen.add(key)
    result.push(entry)
  })

  return result
}

function buildTeacherAssignmentEntry(row = {}, source = 'docentes') {
  const materia = subjectCode(row)
  const nombreMateria = teacherSubjectName(row, source)
  const carrera = subjectCareer(row)
  const carreraId = subjectCareerId(row)
  if (!materia && !nombreMateria && !carrera) return null

  return {
    materia,
    codigo: materia,
    materiaId: materia,
    nombreMateria,
    materiaNombre: nombreMateria,
    carrera,
    carreraId,
    source,
  }
}

function uniqueTeacherAssignments(assignments = []) {
  const seen = new Set()
  const result = []

  assignments.filter(Boolean).forEach((assignment) => {
    const key = [
      assignment.carreraId,
      assignment.carrera,
      assignment.materia,
      assignment.nombreMateria,
    ].map(normalizeText).join('::')
    if (seen.has(key)) return
    seen.add(key)
    result.push(assignment)
  })

  return result
}

function isGeneratedScheduleWorkload(row = {}) {
  return (
    normalizeToken(readField(row, LOAD_SOURCE_FIELDS)) === 'horariosdocentes' ||
    normalizeToken(row.observaciones || row.observation || row.notes).includes('generadodesdehorarios') ||
    normalizeToken(row.id).startsWith('cargadesdehorarios')
  )
}

function normalizeCargaHorariaAssignment(row = {}) {
  const generatedFromSchedule = isGeneratedScheduleWorkload(row)
  const explicitRole = readField(row, ['rol_en_materia', 'rolEnMateria', 'rol', 'role'])

  return {
    ...row,
    materia_codigo: clean(firstValue(
      readField(row, ['materia_codigo', 'materiaCodigo', 'codigo_materia', 'codigoMateria', 'materia', 'codigo', 'subject_code']),
      subjectCode(row),
    )),
    materia_nombre: clean(firstValue(
      readField(row, ['materia_nombre', 'materiaNombre', 'nombre_materia', 'nombreMateria', 'subject_name']),
      subjectName(row),
    )),
    docente: teacherName(row),
    dni_docente: teacherDocument(row),
    rol_en_materia: generatedFromSchedule ? '' : clean(explicitRole),
    ...(generatedFromSchedule ? { titularidad: false, es_titular: false, isTitular: false } : {}),
    estado_asignacion: clean(firstValue(readField(row, ['estado_asignacion', 'estadoAsignacion', 'estado', 'status']), 'ACTIVO')),
    source: clean(firstValue(readField(row, LOAD_SOURCE_FIELDS), 'carga_horaria_docente')),
  }
}

function buildNormalizedDocenteMateriaAssignments({ docenteMateria = [], cargaHorariaDocente = [] }) {
  return [
    ...asArray(docenteMateria),
    ...asArray(cargaHorariaDocente).map(normalizeCargaHorariaAssignment),
  ]
}

function isFalseLike(value) {
  if (value === false || value === 0) return true
  return ['false', 'no', 'inactivo', 'inactive'].includes(normalizeText(value))
}

function upsertTeacher(registry, teacher = {}, { source = 'docentes', index = 0 } = {}) {
  const nombre = teacherName(teacher)
  if (source === 'horariosDocentes' && !nombre) return null

  const aliases = teacherAliasValues(teacher, { source })
  const existingId = findExistingTeacherId(registry, aliases)
  const id = existingId || teacherStableId(teacher, { source, index })
  if (!id && !nombre) return null

  const existing = registry.byId.get(id) ?? {
    id,
    teacherKey: id,
    nombre: nombre || id,
    full_name: nombre || id,
    dni: '',
    email: '',
    carrera: '',
    carreras: [],
    nombreMateria: '',
    especialidad: '',
    gruposAfinidad: [],
    codigosMaterias: [],
    materiasAsignadas: [],
    activo: true,
    source,
    sources: [],
    diasAsistencia: [],
    diasDisponibles: [],
    turnosDisponibles: [],
    availability: [],
    horasCatedraDeclaradas: null,
  }
  const nextSources = uniqueValues([...existing.sources, source])
  // Un docente puede dictar en varias carreras (comun en institutos chicos): se
  // acumulan todas para no perder afinidad "misma carrera" fuera de la primera.
  const carreras = uniqueValues([
    ...existing.carreras,
    subjectCareer(teacher),
  ]).filter(Boolean)
  const days = uniqueNormalizedValues([
    ...existing.diasAsistencia,
    ...extractDayValues(teacher),
  ])
  const turnos = uniqueValues([
    ...existing.turnosDisponibles,
    resolveTurno(teacher),
    ...fieldArray(teacher, ['turnos', 'turnosDisponibles', 'disponibilidadTurnos', 'shifts']).map(normalizeTurno),
  ])
  const availability = uniqueAvailability([
    ...existing.availability,
    ...extractAvailabilityEntries(teacher, source),
  ])
  const materiasAsignadas = uniqueTeacherAssignments([
    ...existing.materiasAsignadas,
    buildTeacherAssignmentEntry(teacher, source),
  ])
  const explicitInactive = isFalseLike(readField(teacher, ['activo', 'active', 'isActive']))
  const explicitTeachingHours = ['horariosDocentes', 'carga_horaria_docente'].includes(source)
    ? { valid: false, value: null }
    : readExplicitTeachingHours(teacher)

  const next = {
    ...existing,
    nombre: existing.nombre || nombre || id,
    full_name: existing.full_name || nombre || id,
    dni: existing.dni || teacherDocument(teacher),
    email: existing.email || teacherEmail(teacher),
    carrera: existing.carrera || subjectCareer(teacher),
    carreras,
    nombreMateria: existing.nombreMateria || teacherSubjectName(teacher, source),
    especialidad: existing.especialidad || clean(readField(teacher, ['especialidad', 'especiality', 'area'])),
    gruposAfinidad: uniqueValues([
      ...existing.gruposAfinidad,
      readField(teacher, ['grupo_afin_mesa', 'grupoAfinMesa']),
    ]),
    codigosMaterias: uniqueValues([
      ...existing.codigosMaterias,
      readField(teacher, ['materia_codigo', 'materia', 'codigo']),
    ]),
    materiasAsignadas,
    materiasDictadas: materiasAsignadas,
    activo: existing.activo !== false && !explicitInactive,
    source: nextSources.includes('docentes') ? 'docentes' : 'horariosDocentes',
    sources: nextSources,
    diasAsistencia: days,
    diasDisponibles: days,
    turnosDisponibles: turnos,
    availability,
    horasCatedraDeclaradas: existing.horasCatedraDeclaradas ??
      (explicitTeachingHours.valid ? explicitTeachingHours.value : null),
  }

  registry.byId.set(id, next)
  registerTeacherAliases(registry, id, teacherAliasValues(teacher, { id, source }))
  return next
}

function buildTeachers({
  docentes,
  horariosDocentes,
  docenteMateria,
  disponibilidadDocente,
  cargaHorariaDocente,
}) {
  const registry = {
    byId: new Map(),
    aliasToId: new Map(),
  }

  asArray(docentes).forEach((docente, index) => upsertTeacher(registry, docente, { source: 'docentes', index }))
  asArray(horariosDocentes).forEach((horario, index) => upsertTeacher(registry, horario, {
    source: 'horariosDocentes',
    index,
  }))
  asArray(disponibilidadDocente).forEach((availability, index) => upsertTeacher(registry, availability, {
    source: 'disponibilidad_docente',
    index,
  }))
  asArray(cargaHorariaDocente).forEach((load, index) => upsertTeacher(registry, load, {
    source: 'carga_horaria_docente',
    index,
  }))
  asArray(docenteMateria).forEach((assignment, index) => upsertTeacher(registry, assignment, {
    source: 'docente_materia',
    index,
  }))

  const scheduleRowsByTeacherId = new Map()
  asArray(horariosDocentes).forEach((horario) => {
    const teacherId = findExistingTeacherId(
      registry,
      teacherAliasValues(horario, { source: 'horariosDocentes' }),
    )
    if (!teacherId) return
    const rows = scheduleRowsByTeacherId.get(teacherId) ?? []
    rows.push(horario)
    scheduleRowsByTeacherId.set(teacherId, rows)
  })
  const loadRowsByTeacherId = new Map()
  asArray(cargaHorariaDocente).forEach((load) => {
    const teacherId = findExistingTeacherId(
      registry,
      teacherAliasValues(load, { source: 'carga_horaria_docente' }),
    )
    if (!teacherId) return
    const rows = loadRowsByTeacherId.get(teacherId) ?? []
    rows.push(load)
    loadRowsByTeacherId.set(teacherId, rows)
  })

  const adaptedTeachers = [...registry.byId.values()].map((docente) => {
    const declaredHours = Number(docente.horasCatedraDeclaradas)
    const hasDeclaredHours = docente.horasCatedraDeclaradas !== null &&
      docente.horasCatedraDeclaradas !== undefined &&
      Number.isFinite(declaredHours) &&
      declaredHours >= 0
    const scheduleSummary = summarizeTeacherScheduleTeachingHours(
      scheduleRowsByTeacherId.get(docente.id) ?? [],
    )
    const loadSummary = summarizeTeacherScheduleTeachingHours(
      loadRowsByTeacherId.get(docente.id) ?? [],
    )
    const horasCatedra = hasDeclaredHours
      ? declaredHours
      : loadSummary.valid
        ? loadSummary.teachingHours
        : scheduleSummary.teachingHours
    const horasCatedraSource = hasDeclaredHours
      ? TEACHING_HOURS_SOURCES.EXPLICIT
      : loadSummary.valid
        ? loadSummary.source
        : scheduleSummary.source

    return {
      ...docente,
      horasCatedra,
      teachingHours: horasCatedra,
      horasCatedraSource,
      halfPlusOneRuleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
      teachingHoursDiagnostics: {
        validBlocks: scheduleSummary.validBlocks + loadSummary.validBlocks,
        invalidBlocks: scheduleSummary.invalidBlocks + loadSummary.invalidBlocks,
        duplicateBlocksIgnored: scheduleSummary.duplicateBlocksIgnored + loadSummary.duplicateBlocksIgnored,
        source: horasCatedraSource,
        scheduleValidBlocks: scheduleSummary.validBlocks,
        loadValidBlocks: loadSummary.validBlocks,
      },
    }
  })

  return {
    docentes: adaptedTeachers,
    teacherAliasToId: Object.fromEntries(registry.aliasToId.entries()),
  }
}

function addLookupValue(lookup, value, id) {
  const textKey = normalizeText(value)
  const tokenKey = normalizeToken(value)
  if (textKey) lookup[textKey] = id
  if (tokenKey) lookup[tokenKey] = id
}

function buildTeacherLookup(docentes = [], aliasToId = {}) {
  const lookup = { ...aliasToId }

  docentes.forEach((docente) => {
    teacherAliasValues(docente, { id: docente.id, source: docente.source }).forEach((alias) => (
      addLookupValue(lookup, alias, docente.id)
    ))
  })

  return lookup
}

function lookupTeacherId(teacherNameToId = {}, value) {
  return teacherNameToId[normalizeText(value)] ?? teacherNameToId[normalizeToken(value)] ?? ''
}

function resolveTeacherIdForSchedule(horario = {}, teacherNameToId = {}) {
  const aliases = teacherAliasValues(horario, { source: 'horariosDocentes' })

  for (const alias of aliases) {
    const id = lookupTeacherId(teacherNameToId, alias)
    if (id) return id
  }

  return clean(firstValue(explicitTeacherId(horario, { allowRowId: false }), makeId('doc', teacherName(horario))))
}

function addToSetMap(map, key, value) {
  if (!key || !value) return
  const values = map.get(key) ?? new Set()
  values.add(value)
  map.set(key, values)
}

function buildTitularIndex(horariosDocentes = [], teacherNameToId = {}) {
  return asArray(horariosDocentes).reduce((index, horario) => {
    const titularId = resolveTeacherIdForSchedule(horario, teacherNameToId)
    if (!titularId) return index

    subjectMatchKeys(horario).forEach((key) => addToSetMap(index.byCareerAndSubject, key, titularId))
    subjectAliasKeys(horario).forEach((key) => addToSetMap(index.bySubjectOnly, key, titularId))
    index.entries.push({
      titularId,
      carrera: subjectCareer(horario),
      subjectAliases: subjectAliasKeys(horario),
      subjectValues: subjectAliasValues(horario),
    })
    return index
  }, {
    byCareerAndSubject: new Map(),
    bySubjectOnly: new Map(),
    entries: [],
  })
}

function firstFromSet(values) {
  return values?.values().next().value ?? ''
}

function resolveTitularForPlan(plan = {}, titularIndex) {
  for (const key of subjectMatchKeys(plan)) {
    const candidates = titularIndex.byCareerAndSubject.get(key)
    if (candidates?.size === 1) {
      return { titularId: firstFromSet(candidates), source: 'horariosDocentes', match: 'career+subject' }
    }
  }

  const planAliases = new Set(subjectAliasKeys(plan))
  const compatibleCandidates = new Set(titularIndex.entries
    .filter((entry) => careersAreCompatible(subjectCareer(plan), entry.carrera))
    .filter((entry) => entry.subjectAliases.some((alias) => planAliases.has(alias)))
    .map((entry) => entry.titularId))
  if (compatibleCandidates.size === 1) {
    return {
      titularId: firstFromSet(compatibleCandidates),
      source: 'horariosDocentes',
      match: 'compatible-career+subject',
    }
  }

  const planSubjectValues = subjectAliasValues(plan)
  const compatibleNameCandidates = new Set(titularIndex.entries
    .filter((entry) => careersAreCompatible(subjectCareer(plan), entry.carrera))
    .filter((entry) => entry.subjectValues.some((scheduleValue) => (
      planSubjectValues.some((planValue) => subjectNamesAreCompatible(planValue, scheduleValue))
    )))
    .map((entry) => entry.titularId))
  if (compatibleNameCandidates.size === 1) {
    return {
      titularId: firstFromSet(compatibleNameCandidates),
      source: 'horariosDocentes',
      match: 'compatible-career+subject-name',
    }
  }

  for (const key of subjectAliasKeys(plan)) {
    const candidates = titularIndex.bySubjectOnly.get(key)
    if (candidates?.size === 1) {
      return { titularId: firstFromSet(candidates), source: 'horariosDocentes', match: 'unique-subject' }
    }
  }

  return { titularId: '', source: '', match: '' }
}

function planAllowsMesa(plan = {}) {
  if (plan.requiereMesa === false) return false
  if (plan.requiere_mesa === false) return false
  if (plan.requiresMesa === false) return false
  if (plan.noRequiereMesa === true) return false
  if (plan.excluida === true || plan.excluded === true) return false
  if (isManualExamExcludedSubject(plan)) return false
  return true
}

function buildSubjects({
  planesEstudio,
  horariosDocentes,
  docenteMateria,
  cargaHorariaDocente,
  teacherNameToId,
  referenceDate,
}) {
  const titularIndex = buildTitularIndex(horariosDocentes, teacherNameToId)
  const normalizedAssignments = buildNormalizedDocenteMateriaAssignments({
    docenteMateria,
    cargaHorariaDocente,
  })
  const hasDocenteMateria = normalizedAssignments.length > 0

  return asArray(planesEstudio).map((plan) => {
    const materia = subjectCode(plan)
    const carrera = subjectCareer(plan)
    const manualExamExclusion = getManualExamExclusion(plan)
    const scheduleTitular = resolveTitularForPlan(plan, titularIndex)
    const docenteMateriaResolution = hasDocenteMateria
      ? resolveDocenteMateriaAssignment({
          plan,
          assignments: normalizedAssignments,
          teacherNameToId,
          referenceDate,
        })
      : null
    const shouldUseFallback = !docenteMateriaResolution ||
      docenteMateriaResolution.status === DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_ASIGNACIONES ||
      (
        docenteMateriaResolution.status === DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_TITULAR_VIGENTE &&
        (
          !docenteMateriaResolution.hasInferredFromScheduleAssignments ||
          Boolean(scheduleTitular.titularId)
        )
      )
    const titular = !shouldUseFallback
      ? {
          titularId: docenteMateriaResolution.titularId,
          source: docenteMateriaResolution.source,
          match: docenteMateriaResolution.match,
        }
      : scheduleTitular
    const allowsMesa = planAllowsMesa(plan) && docenteMateriaResolution?.requiresMesa !== false
    const titularExiste = Boolean(lookupTeacherId(teacherNameToId, titular.titularId))
    const requiereMesa = allowsMesa
    const requiereMesaSource = (() => {
      if (!allowsMesa) {
        if (manualExamExclusion) return manualExamExclusion.reason
        return docenteMateriaResolution?.requiresMesa === false
          ? 'docente_materia_no_requiere_mesa'
          : 'planNoRequiereMesa'
      }
      if (titular.titularId && titularExiste) return titular.source
      if (!shouldUseFallback && docenteMateriaResolution) return 'requiere_revision'
      return titular.titularId ? 'titularInexistente' : 'sinHorarioDocente'
    })()

    return {
      id: clean(firstValue(readField(plan, ['id']), makeId('subject', carrera, materia || subjectName(plan)))),
      materia,
      codigo: materia,
      nombreMateria: subjectName(plan),
      carreraId: subjectCareerId(plan),
      carrera,
      anio: readField(plan, ['anio', 'año', 'year', 'nivel']) ?? '',
      requiereMesa,
      requiereMesaSource,
      turno: normalizeTurno(firstValue(readField(plan, TURN_FIELDS), 'NOCHE')),
      titularId: titular.titularId,
      titular_id: titular.titularId,
      titularSource: titular.source,
      titularMatch: titular.match,
      titularResolutionStatus: docenteMateriaResolution?.status ?? '',
      docenteMateriaAssignmentsCount: docenteMateriaResolution?.matchedAssignmentsCount ?? 0,
      manualExamExclusionReason: manualExamExclusion?.reason ?? '',
      manualExamExclusionMessage: manualExamExclusion?.message ?? '',
      grupo_afin_mesa: clean(readField(plan, [
        'grupo_afin_mesa',
        'grupoAfinMesa',
        'grupo_afinidad',
        'grupoAfinidad',
      ])),
      codigos_materias_afines: clean(readField(plan, [
        'codigos_materias_afines',
        'codigosMateriasAfines',
        'materias_afines',
        'materiasAfines',
      ])),
      source: 'planesEstudio',
    }
  })
}

function enrichTeacherAffinitiesFromSubjects(docentes = [], materias = []) {
  return docentes.map((docente) => {
    const teacherCodes = new Set(asArray(docente.codigosMaterias).map(normalizeToken).filter(Boolean))
    if (!teacherCodes.size) return docente
    const teacherCareers = uniqueValues([
      ...asArray(docente.carreras),
      subjectCareer(docente),
    ])

    const relatedSubjects = materias.filter((materia) => (
      teacherCodes.has(normalizeToken(subjectCode(materia))) &&
      (!teacherCareers.length || !subjectCareer(materia) || teacherCareers.some((career) => (
        careersAreCompatible(career, subjectCareer(materia))
      )))
    ))
    const gruposAfinidad = uniqueValues([
      ...asArray(docente.gruposAfinidad),
      ...relatedSubjects.map((materia) => materia.grupo_afin_mesa),
    ])

    return {
      ...docente,
      gruposAfinidad,
    }
  })
}

function buildCorrelativities(correlatividades = []) {
  return asArray(correlatividades).map((correlatividad) => ({
    carreraId: subjectCareerId(correlatividad),
    carrera: subjectCareer(correlatividad),
    materia: subjectCode(correlatividad),
    nombreMateria: subjectName(correlatividad),
    correlativas: asArray(firstValue(correlatividad.correlativas, correlatividad.correlatives)),
  }))
}

function parseIsoDate(value) {
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateRange(start, end) {
  const startDate = parseIsoDate(start)
  const endDate = parseIsoDate(end)
  if (!startDate || !endDate || startDate > endDate) return []

  const dates = []
  const current = new Date(startDate)
  while (current <= endDate) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

function callKeyFromRangeKey(key) {
  const normalized = normalizeKey(key)
  if (['second', 'segundo', 'segundo-llamado', '2'].includes(normalized)) return EXAM_CALLS.SECOND
  if (['special', 'especial', 'llamado-especial'].includes(normalized)) return EXAM_CALLS.SPECIAL
  return EXAM_CALLS.FIRST
}

function buildAvailableDates({ examType, fechaInicio, fechaFin, regularCallRanges }) {
  if (examType === EXAM_GENERATION_TYPES.SPECIAL) {
    return dateRange(fechaInicio, fechaFin).map((date) => ({
      fecha: toIsoDate(date),
      diaSemana: DAY_NAMES_ES[date.getDay()],
      llamado: EXAM_CALLS.SPECIAL,
      turno: 'NOCHE',
      disponible: true,
    }))
  }

  const ranges = regularCallRanges && typeof regularCallRanges === 'object'
    ? Object.entries(regularCallRanges)
    : [['first', { start: fechaInicio, end: fechaFin }]]

  return ranges.flatMap(([key, range = {}]) => (
    dateRange(range.start ?? range.inicio, range.end ?? range.fin).map((date) => ({
      fecha: toIsoDate(date),
      diaSemana: DAY_NAMES_ES[date.getDay()],
      llamado: callKeyFromRangeKey(key),
      turno: normalizeTurno(firstValue(range.turno, 'NOCHE')),
      disponible: true,
    }))
  ))
}

function buildConfig(snapshot = {}, fechasDisponibles = []) {
  const generationScope = {
    ...cloneJson(snapshot.generationScope ?? {}),
    halfPlusOneRuleMode: snapshot.generationScope?.halfPlusOneRuleMode ??
      TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
  }
  const tipoPeriodo = snapshot.examType === EXAM_GENERATION_TYPES.SPECIAL
    ? TIPOS_PERIODO.ESPECIAL
    : TIPOS_PERIODO.REGULAR
  const cantidadLlamados = new Set(fechasDisponibles.map((fecha) => fecha.llamado)).size || 1

  return {
    tipoPeriodo,
    cantidadLlamados,
    fechaInicio: clean(snapshot.fechaInicio),
    fechaFin: clean(snapshot.fechaFin),
    generationScope,
  }
}

function buildOptions(snapshot = {}) {
  const generationScope = snapshot.generationScope ?? {}
  const vocalPlanningMode = generationScope.vocalPlanningMode

  return {
    compact: 'safe',
    applyHalfPlusOneRule: generationScope.applyHalfPlusOneRule !== false,
    halfPlusOneRuleMode: generationScope.halfPlusOneRuleMode ??
      TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    allowSameDayRelatedSubjects: generationScope.allowSameDayRelatedSubjects !== false,
    respectCorrelativities: generationScope.respectCorrelativities !== false,
    selectedSpecialSubjectKeys: asArray(snapshot.selectedSpecialSubjectKeys),
    ...(vocalPlanningMode ? { vocalPlanningMode } : {}),
  }
}

function readSubjectYear(subject = {}) {
  return readField(subject, [
    'anio',
    'ano',
    'a\u00f1o',
    'year',
    'nivel',
    'curso',
    'anio_cursada',
    'anioCarrera',
    'anio_carrera',
  ])
}

function normalizeScopeYear(value) {
  const normalized = normalizeText(value)
  if (!normalized) return ''

  const explicitNumber = normalized.match(/\b0?([1-9])\b/)
  if (explicitNumber) return String(Number(explicitNumber[1]))

  const words = new Map([
    ['primer', '1'],
    ['primero', '1'],
    ['segundo', '2'],
    ['tercer', '3'],
    ['tercero', '3'],
    ['cuarto', '4'],
    ['quinto', '5'],
    ['i', '1'],
    ['ii', '2'],
    ['iii', '3'],
    ['iv', '4'],
    ['v', '5'],
  ])
  const word = normalized.split(' ').find((token) => words.has(token))
  if (word) return words.get(word)

  return normalized
}

function careerMatchesGenerationScope(subject = {}, selectedCareers = []) {
  const careerScopeKeys = asArray(selectedCareers).map(normalizeToken).filter(Boolean)
  if (!careerScopeKeys.length) return true

  const subjectCareerKeysForScope = [
    subjectCareer(subject),
    subjectCareerId(subject),
    readField(subject, CAREER_ID_FIELDS),
  ].map(normalizeToken).filter(Boolean)

  if (!subjectCareerKeysForScope.length) return false

  return careerScopeKeys.some((scopeKey) => (
    subjectCareerKeysForScope.some((subjectKey) => (
      subjectKey === scopeKey ||
      subjectKey.includes(scopeKey) ||
      scopeKey.includes(subjectKey)
    ))
  ))
}

function yearMatchesGenerationScope(subject = {}, selectedYear = '') {
  const scopeYear = normalizeScopeYear(selectedYear)
  if (!scopeYear) return true

  return normalizeScopeYear(readSubjectYear(subject)) === scopeYear
}

function subjectMatchesGenerationScope(subject = {}, generationScope = {}) {
  const selectedCareers = asArray(generationScope.careers).length
    ? generationScope.careers
    : [generationScope.career].filter(Boolean)

  return (
    careerMatchesGenerationScope(subject, selectedCareers) &&
    yearMatchesGenerationScope(subject, generationScope.year)
  )
}

function filterMateriasForGenerationScope(allMaterias = [], snapshot = {}) {
  if (snapshot.examType === EXAM_GENERATION_TYPES.SPECIAL) {
    const selectedSpecialSubjectKeys = new Set(
      asArray(snapshot.selectedSpecialSubjectKeys).map(normalizeKey),
    )
    return allMaterias.filter((materia) => selectedSpecialSubjectKeys.has(normalizeKey(getSubjectKey(materia))))
  }

  return allMaterias.filter((materia) => (
    subjectMatchesGenerationScope(materia, snapshot.generationScope ?? {})
  ))
}

function buildSubjectCodeLookup(materias = []) {
  return materias.reduce((lookup, materia) => {
    subjectAliasKeys(materia).forEach((key) => {
      lookup[key] = materia.id
    })
    return lookup
  }, {})
}

function buildAdapterDiagnostics({ snapshot = {}, docentes = [], materias = [] }) {
  const sourceDocentes = asArray(snapshot.docentes)
  const sourceHorarios = asArray(snapshot.horariosDocentes)
  const sourceDocenteMateria = asArray(snapshot.docenteMateria)
  const sourceDisponibilidadDocente = asArray(snapshot.disponibilidadDocente)
  const sourceCargaHorariaDocente = asArray(snapshot.cargaHorariaDocente)
  const normalizedAssignments = buildNormalizedDocenteMateriaAssignments({
    docenteMateria: sourceDocenteMateria,
    cargaHorariaDocente: sourceCargaHorariaDocente,
  })
  const derivedDocentes = docentes.filter((docente) => !docente.sources?.includes('docentes')).length
  const docenteMateriaSummary = buildDocenteMateriaAssignmentSummary(normalizedAssignments, {
    referenceDate: snapshot.fechaInicio,
  })
  const teacherSourceSummary = summarizeStructuredTeacherSource({
    disponibilidadDocente: sourceDisponibilidadDocente,
    cargaHorariaDocente: sourceCargaHorariaDocente,
    horariosDocentes: sourceHorarios,
  })

  return {
    teacherSource: {
      source: teacherSourceSummary.source,
      hasStructuredTeacherSource: teacherSourceSummary.hasStructuredTeacherSource,
      hasLegacyTeacherScheduleSource: teacherSourceSummary.hasLegacyTeacherScheduleSource,
      hasValidTeacherSource: teacherSourceSummary.hasValidTeacherSource,
      counts: teacherSourceSummary.counts,
      warnings: teacherSourceSummary.warnings,
    },
    sourceCounts: {
      docentes: sourceDocentes.length,
      horariosDocentes: sourceHorarios.length,
      docenteMateria: sourceDocenteMateria.length,
      disponibilidadDocente: sourceDisponibilidadDocente.length,
      cargaHorariaDocente: sourceCargaHorariaDocente.length,
      planesEstudio: asArray(snapshot.planesEstudio).length,
      correlatividades: asArray(snapshot.correlatividades).length,
    },
    adaptedCounts: {
      docentes: docentes.length,
      materias: materias.length,
      materiasConTitular: materias.filter((materia) => materia.titularId).length,
      materiasSinTitular: materias.filter((materia) => !materia.titularId).length,
      materiasQueRequierenMesa: materias.filter((materia) => materia.requiereMesa !== false).length,
      materiasExcluidasManualInstitucional: materias.filter((materia) => materia.manualExamExclusionReason).length,
      materiasSinHorarioDocente: materias.filter((materia) => materia.requiereMesaSource === 'sinHorarioDocente').length,
      materiasConTitularInexistente: materias.filter((materia) => materia.requiereMesaSource === 'titularInexistente').length,
      docentesDerivadosDeHorarios: derivedDocentes,
      docentesConDisponibilidad: docentes.filter((docente) => docente.diasAsistencia?.length).length,
      docentesConHorasCatedra: docentes.filter((docente) => Number(docente.horasCatedra) > 0).length,
      docentesSinHorasCatedra: docentes.filter((docente) => !(Number(docente.horasCatedra) > 0)).length,
      horasCatedraTotales: docentes.reduce((total, docente) => total + (Number(docente.horasCatedra) || 0), 0),
      bloquesHorariosDuplicadosIgnorados: docentes.reduce((
        total,
        docente,
      ) => total + (docente.teachingHoursDiagnostics?.duplicateBlocksIgnored ?? 0), 0),
      reglaMitadMasUno: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    },
    docenteMateria: {
      ...docenteMateriaSummary,
      materiasAmbiguas: materias.filter((materia) => (
        materia.titularResolutionStatus === DOCENTE_MATERIA_RESOLUTION_STATUS.AMBIGUO_REQUIERE_REVISION
      )).length,
      materiasSinTitularVigente: materias.filter((materia) => (
        materia.titularResolutionStatus === DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_TITULAR_VIGENTE
      )).length,
      materiasResueltasPorFallback: normalizedAssignments.length
        ? materias.filter((materia) => materia.titularSource === 'horariosDocentes').length
        : 0,
      asignacionesNormalizadas: normalizedAssignments.length,
    },
  }
}

export function buildRegularExamInputFromWorkspaceSnapshot(snapshot = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {}
  const teacherSource = summarizeStructuredTeacherSource({
    disponibilidadDocente: safeSnapshot.disponibilidadDocente,
    cargaHorariaDocente: safeSnapshot.cargaHorariaDocente,
    horariosDocentes: safeSnapshot.horariosDocentes,
  })
  const teacherExamSourceContext = buildTeacherExamSourceContext({
    disponibilidadDocente: safeSnapshot.disponibilidadDocente,
    cargaHorariaDocente: safeSnapshot.cargaHorariaDocente,
    horariosDocentes: safeSnapshot.horariosDocentes,
    teacherSource,
  })
  const useStructuredTeacherSource = teacherSource.hasStructuredTeacherSource
  const horariosDocentesForInput = useStructuredTeacherSource ? [] : safeSnapshot.horariosDocentes
  const cargaHorariaDocenteForInput = useStructuredTeacherSource
    ? teacherSource.validWorkloadRows
    : []
  const disponibilidadDocenteForInput = useStructuredTeacherSource
    ? teacherSource.validAvailabilityRows
    : []
  const teacherBuild = buildTeachers({
    docentes: safeSnapshot.docentes,
    horariosDocentes: horariosDocentesForInput,
    docenteMateria: safeSnapshot.docenteMateria,
    disponibilidadDocente: disponibilidadDocenteForInput,
    cargaHorariaDocente: cargaHorariaDocenteForInput,
  })
  const adaptedDocentes = teacherBuild.docentes
  const teacherNameToId = buildTeacherLookup(adaptedDocentes, teacherBuild.teacherAliasToId)
  const allMaterias = buildSubjects({
    planesEstudio: safeSnapshot.planesEstudio,
    // La fuente estructurada manda para disponibilidad y carga horaria, pero
    // horariosDocentes conserva la relacion historica materia-titular. Se usa
    // solamente como fallback cuando docente_materia/carga no resuelven esa
    // materia, sin mezclar sus horas ni su disponibilidad con la fuente nueva.
    horariosDocentes: safeSnapshot.horariosDocentes,
    docenteMateria: safeSnapshot.docenteMateria,
    cargaHorariaDocente: cargaHorariaDocenteForInput,
    teacherNameToId,
    referenceDate: safeSnapshot.fechaInicio,
  })
  const materias = filterMateriasForGenerationScope(allMaterias, safeSnapshot)
  const docentes = enrichTeacherAffinitiesFromSubjects(adaptedDocentes, allMaterias)
  const correlatividades = buildCorrelativities(safeSnapshot.correlatividades)
  const fechasDisponibles = buildAvailableDates(safeSnapshot)
  const config = buildConfig(safeSnapshot, fechasDisponibles)
  const options = buildOptions(safeSnapshot)
  const subjectCodeToId = buildSubjectCodeLookup(materias)

  return {
    docentes,
    materias,
    correlatividades,
    fechasDisponibles,
    config,
    options,
    metadata: {
      source: 'legacyWorkspaceSnapshot',
      teacherNameToId,
      subjectCodeToId,
      counts: {
        docentes: docentes.length,
        materias: materias.length,
        correlatividades: correlatividades.length,
        fechasDisponibles: fechasDisponibles.length,
      },
      adapterDiagnostics: buildAdapterDiagnostics({ snapshot: safeSnapshot, docentes, materias }),
      teacherSource: {
        source: teacherSource.source,
        hasStructuredTeacherSource: teacherSource.hasStructuredTeacherSource,
        hasLegacyTeacherScheduleSource: teacherSource.hasLegacyTeacherScheduleSource,
        hasValidTeacherSource: teacherSource.hasValidTeacherSource,
        counts: teacherSource.counts,
      },
      teacherExamSourceContext,
      teacherExamSourceContextMetadata: {
        source: teacherExamSourceContext.source,
        hasStructuredTeacherSource: teacherExamSourceContext.hasStructuredTeacherSource,
        hasLegacyTeacherScheduleSource: teacherExamSourceContext.hasLegacyTeacherScheduleSource,
        warnings: teacherExamSourceContext.warnings,
        diagnostics: teacherExamSourceContext.diagnostics,
      },
      warnings: teacherSource.warnings,
    },
  }
}
