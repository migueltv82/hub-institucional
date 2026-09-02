import { sha256Hex } from '../../utils/examEngine/adminReviewPromotionWorkflow.js'

export const FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME = 'workspaceSnapshot.real.full.anon.local.json'

const EXPECTED_SECTIONS = Object.freeze([
  'carreras',
  'planesEstudio',
  'materias',
  'correlatividades',
  'alumnos',
  'students',
  'enrollments',
  'examEnrollments',
  'grades',
  'estadoAcademico',
  'academicStatusRows',
  'docentes',
  'teacherRecords',
  'cargaHorariaDocente',
  'disponibilidadDocente',
  'horariosDocentes',
  'docenteMateria',
  'fechasBloqueadasDocente',
  'adminReviewDecisions',
  'adminReviewDrafts',
  'adminReviewPromotions',
  'adminReviewApprovalRequests',
  'adminReviewSecondApprovals',
  'cronograma',
  'examGenerationConfig',
])

const TEACHER_SECTIONS = new Set(['docentes', 'teacherRecords', 'teacher_records'])
const STUDENT_SECTIONS = new Set(['alumnos', 'students', 'studentRecords', 'student_records'])
const CAREER_SECTIONS = new Set(['carreras', 'careers', 'programs'])
const SUBJECT_SECTIONS = new Set(['planesEstudio', 'materias', 'subjects', 'correlatividades'])
const ADMIN_SECTIONS = new Set([
  'adminReviewDecisions',
  'adminReviewDrafts',
  'adminReviewPromotions',
  'adminReviewApprovalRequests',
  'adminReviewSecondApprovals',
])

const TEACHER_ID_KEYS = new Set([
  'docenteid', 'teacherid', 'teacherrecordid', 'profesortitularid', 'titularid',
])
const TEACHER_NAME_KEYS = new Set([
  'docente', 'docentenombre', 'teachername', 'teacherdisplayname', 'profesor',
  'profesortitular', 'titular', 'nombredocente',
])
const STUDENT_ID_KEYS = new Set(['studentid', 'alumnoid', 'studentrecordid'])
const STUDENT_NAME_KEYS = new Set(['studentname', 'alumnonombre', 'nombrealumno'])
const CAREER_ID_KEYS = new Set(['careerid', 'carreraid', 'programid'])
const CAREER_NAME_KEYS = new Set([
  'carrera', 'career', 'careername', 'programname', 'nombrecarrera',
])
const SUBJECT_ID_KEYS = new Set(['subjectid', 'materiaid'])
const SUBJECT_CODE_KEYS = new Set([
  'materia', 'subjectcode', 'materiacodigo', 'codigomateria', 'codigo',
])
const SUBJECT_NAME_KEYS = new Set([
  'nombremateria', 'materianombre', 'subjectname',
])
const COURSE_KEYS = new Set(['curso', 'course', 'coursename', 'nombrecurso'])
const CORRELATIVE_KEYS = new Set([
  'correlativas', 'correlativasprevias', 'correlatives', 'prerequisites',
])
const SUBJECT_LIST_KEYS = new Set([
  'materias', 'subjects', 'examsubjects', 'pendingsubjects', 'materiashabilitadas',
  'materiaspendientes', 'materiasadeudadas', 'selectedspecialsubjectkeys',
])
const NOTE_KEYS = new Set([
  'reason', 'motivo', 'observacion', 'observaciones', 'notes', 'nota',
  'notas', 'comment', 'comments', 'comentario', 'comentarios',
])

const OMIT = Symbol('omit')

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '')
}

function normalizedKey(value) {
  return normalize(value)
}

function isPrimitiveIdentity(value) {
  return ['string', 'number'].includes(typeof value) && clean(value)
}

function valuesForKeys(row, keys) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return []
  return Object.entries(row)
    .filter(([key, value]) => keys.has(normalizedKey(key)) && isPrimitiveIdentity(value))
    .map(([, value]) => value)
}

function createAliasRegistry(displayPrefix, idPrefix) {
  let nextIndex = 0
  const tokenToRecord = new Map()
  const records = new Set()

  function register(values) {
    const tokens = [...new Set(asArray(values).filter(isPrimitiveIdentity).map(normalize).filter(Boolean))]
    if (!tokens.length) return null
    const matches = [...new Set(tokens.map((token) => tokenToRecord.get(token)).filter(Boolean))]
    let record = matches.sort((left, right) => left.index - right.index)[0]
    if (!record) {
      nextIndex += 1
      record = { index: nextIndex, tokens: new Set(), rawValues: new Set() }
      records.add(record)
    }
    matches.slice(1).forEach((other) => {
      other.tokens.forEach((token) => {
        record.tokens.add(token)
        tokenToRecord.set(token, record)
      })
      other.rawValues.forEach((value) => record.rawValues.add(value))
      records.delete(other)
    })
    asArray(values).filter(isPrimitiveIdentity).forEach((value) => {
      const token = normalize(value)
      if (!token) return
      record.tokens.add(token)
      record.rawValues.add(clean(value))
      tokenToRecord.set(token, record)
    })
    return record
  }

  function resolve(value) {
    if (!isPrimitiveIdentity(value)) return null
    return tokenToRecord.get(normalize(value)) ?? register([value])
  }

  function displayFor(value) {
    const record = resolve(value)
    return record ? `${displayPrefix}_${String(record.index).padStart(3, '0')}` : ''
  }

  function idFor(value) {
    const record = resolve(value)
    return record ? `${idPrefix}-anon-${String(record.index).padStart(3, '0')}` : ''
  }

  function hashedAliasLookup() {
    const lookup = {}
    records.forEach((record) => {
      record.rawValues.forEach((value) => {
        lookup[sha256Hex(normalize(value))] = `${displayPrefix}_${String(record.index).padStart(3, '0')}`
      })
    })
    return lookup
  }

  return { displayFor, hashedAliasLookup, idFor, register }
}

function sectionIdentityValues(row, section) {
  const genericIds = valuesForKeys(row, new Set(['id']))
  const genericNames = valuesForKeys(row, new Set([
    'nombre', 'name', 'fullname', 'displayname', 'firstname', 'nombres',
    'nombrecompleto', 'apellidoynombre',
  ]))
  const surname = valuesForKeys(row, new Set(['apellido', 'lastname', 'surname']))
  const fullNames = genericNames.flatMap((name) => surname.map((lastName) => `${name} ${lastName}`))
  return {
    teacher: TEACHER_SECTIONS.has(section) ? [...genericIds, ...genericNames, ...surname, ...fullNames] : [],
    student: STUDENT_SECTIONS.has(section) ? [...genericIds, ...genericNames, ...surname, ...fullNames] : [],
    career: CAREER_SECTIONS.has(section) ? [...genericIds, ...genericNames] : [],
    subject: SUBJECT_SECTIONS.has(section) ? [...genericIds, ...genericNames] : [],
    admin: ADMIN_SECTIONS.has(section) ? valuesForKeys(row, new Set(['userid', 'displayname', 'createdby', 'updatedby'])) : [],
  }
}

function collectAliases(value, section, registries) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAliases(item, section, registries))
    return
  }
  if (!value || typeof value !== 'object') return

  const contextual = sectionIdentityValues(value, section)
  registries.teacher.register([
    ...contextual.teacher,
    ...valuesForKeys(value, TEACHER_ID_KEYS),
    ...valuesForKeys(value, TEACHER_NAME_KEYS),
  ])
  registries.student.register([
    ...contextual.student,
    ...valuesForKeys(value, STUDENT_ID_KEYS),
    ...valuesForKeys(value, STUDENT_NAME_KEYS),
  ])
  registries.career.register([
    ...contextual.career,
    ...valuesForKeys(value, CAREER_ID_KEYS),
    ...valuesForKeys(value, CAREER_NAME_KEYS),
  ])
  registries.subject.register([
    ...contextual.subject,
    ...valuesForKeys(value, SUBJECT_ID_KEYS),
    ...valuesForKeys(value, SUBJECT_CODE_KEYS),
    ...valuesForKeys(value, SUBJECT_NAME_KEYS),
  ])
  registries.admin.register(contextual.admin)

  Object.values(value).forEach((nested) => collectAliases(nested, section, registries))
}

function shouldRemoveKey(key) {
  const normalized = normalizedKey(key)
  return normalized.includes('email')
    || normalized.includes('telefono')
    || normalized.includes('phone')
    || normalized.includes('document')
    || ['dni', 'legajo', 'cuil', 'cuit', 'domicilio', 'address'].includes(normalized)
    || normalized.includes('password')
    || normalized.includes('secret')
    || normalized.includes('token')
    || ['rawpayload', 'rawdata'].includes(normalized)
}

function transformPrimitive(value, key, section, registries) {
  const normalized = normalizedKey(key)
  if (value === null || value === undefined) return value
  if (NOTE_KEYS.has(normalized)) return clean(value) ? 'ANONYMIZED_NOTE' : value
  if (TEACHER_ID_KEYS.has(normalized)) return registries.teacher.idFor(value)
  if (TEACHER_NAME_KEYS.has(normalized)) return registries.teacher.displayFor(value)
  if (STUDENT_ID_KEYS.has(normalized)) return registries.student.idFor(value)
  if (STUDENT_NAME_KEYS.has(normalized)) return registries.student.displayFor(value)
  if (CAREER_ID_KEYS.has(normalized)) return registries.career.idFor(value)
  if (CAREER_NAME_KEYS.has(normalized)) return registries.career.displayFor(value)
  if (SUBJECT_ID_KEYS.has(normalized)) return registries.subject.idFor(value)
  if (SUBJECT_CODE_KEYS.has(normalized) || SUBJECT_NAME_KEYS.has(normalized)) {
    return registries.subject.displayFor(value)
  }
  if (COURSE_KEYS.has(normalized) && typeof value === 'string' && !/^\d+$/.test(value.trim())) {
    return registries.course.displayFor(value)
  }
  if (normalized === 'id') {
    if (TEACHER_SECTIONS.has(section)) return registries.teacher.idFor(value)
    if (STUDENT_SECTIONS.has(section)) return registries.student.idFor(value)
    if (CAREER_SECTIONS.has(section)) return registries.career.idFor(value)
    if (SUBJECT_SECTIONS.has(section)) return registries.subject.idFor(value)
    return registries.opaque.idFor(value)
  }
  if (['nombre', 'name', 'fullname', 'displayname', 'firstname', 'nombres', 'nombrecompleto', 'apellidoynombre'].includes(normalized)) {
    if (TEACHER_SECTIONS.has(section)) return registries.teacher.displayFor(value)
    if (STUDENT_SECTIONS.has(section)) return registries.student.displayFor(value)
    if (CAREER_SECTIONS.has(section)) return registries.career.displayFor(value)
    if (SUBJECT_SECTIONS.has(section)) return registries.subject.displayFor(value)
    if (ADMIN_SECTIONS.has(section)) return registries.admin.displayFor(value)
    if (section === 'uploadedFiles') return registries.file.displayFor(value)
  }
  if (['apellido', 'lastname', 'surname'].includes(normalized) && (TEACHER_SECTIONS.has(section) || STUDENT_SECTIONS.has(section))) {
    return ''
  }
  if ((normalized.endsWith('id') || normalized === 'targetid') && isPrimitiveIdentity(value)) {
    return registries.opaque.idFor(value)
  }
  if (typeof value === 'string' && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
    return 'REDACTED_EMAIL'
  }
  return value
}

function transformValue(value, key, section, registries) {
  const normalized = normalizedKey(key)
  if (Array.isArray(value)) {
    if (normalized === 'careers' || normalized === 'carreras') {
      return value.map((item) => (
        item && typeof item === 'object'
          ? transformValue(item, key, section, registries)
          : registries.career.displayFor(item)
      ))
    }
    if (CORRELATIVE_KEYS.has(normalized) || SUBJECT_LIST_KEYS.has(normalized)) {
      return value.map((item) => (
        item && typeof item === 'object'
          ? transformValue(item, key, section, registries)
          : registries.subject.displayFor(item)
      ))
    }
    if (normalized.endsWith('ids')) return value.map((item) => registries.opaque.idFor(item))
    return value.map((item) => transformValue(item, key, section, registries))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((result, [nestedKey, nestedValue]) => {
      if (shouldRemoveKey(nestedKey)) return result
      const transformed = transformValue(nestedValue, nestedKey, section, registries)
      if (transformed !== OMIT) result[nestedKey] = transformed
      return result
    }, {})
  }
  return transformPrimitive(value, key, section, registries)
}

function hasRows(snapshot, key) {
  return asArray(snapshot?.[key]).length > 0
}

export function buildFullAnonymizedWorkspaceSnapshotAuditPayload(snapshotPayload, {
  now = () => new Date().toISOString(),
} = {}) {
  if (!snapshotPayload || typeof snapshotPayload !== 'object' || Array.isArray(snapshotPayload)) {
    throw new Error('WORKSPACE_SNAPSHOT_AUDIT_PAYLOAD_REQUIRED')
  }

  const source = cloneJson(snapshotPayload)
  const registries = {
    teacher: createAliasRegistry('DOCENTE', 'teacher'),
    student: createAliasRegistry('ALUMNO', 'student'),
    career: createAliasRegistry('CARRERA', 'career'),
    subject: createAliasRegistry('MATERIA', 'subject'),
    course: createAliasRegistry('CURSO', 'course'),
    admin: createAliasRegistry('ADMIN', 'admin'),
    file: createAliasRegistry('ARCHIVO', 'file'),
    opaque: createAliasRegistry('ID', 'audit'),
  }

  Object.entries(source).forEach(([section, value]) => {
    if (section !== '_auditExport') collectAliases(value, section, registries)
  })

  const anonymized = Object.entries(source).reduce((result, [section, value]) => {
    if (section !== '_auditExport') result[section] = transformValue(value, section, section, registries)
    return result
  }, {})
  const includedSections = EXPECTED_SECTIONS.filter((section) => Object.hasOwn(source, section))
  const missingSections = EXPECTED_SECTIONS.filter((section) => !Object.hasOwn(source, section))
  const hasStructuredTeacherSource = hasRows(source, 'disponibilidadDocente') && hasRows(source, 'cargaHorariaDocente')
  const hasLegacyTeacherSource = hasRows(source, 'horariosDocentes')
  const hasBlockedDates = hasRows(source, 'fechasBloqueadasDocente')
  const hasAdminReviewEvents = [
    'adminReviewDecisions',
    'adminReviewDrafts',
    'adminReviewPromotions',
    'adminReviewApprovalRequests',
    'adminReviewSecondApprovals',
  ].some((section) => hasRows(source, section))
  const hasOfficialSchedule = hasRows(source, 'cronograma')
  const warnings = [
    ...(!hasStructuredTeacherSource ? ['STRUCTURED_TEACHER_SOURCE_INCOMPLETE_OR_MISSING'] : []),
    ...(!hasLegacyTeacherSource ? ['LEGACY_TEACHER_SOURCE_MISSING'] : []),
    ...(!hasBlockedDates ? ['TEACHER_BLOCKED_DATES_EMPTY_OR_MISSING'] : []),
    ...(!hasOfficialSchedule ? ['OFFICIAL_SCHEDULE_EMPTY_OR_MISSING'] : []),
  ]

  anonymized._auditExport = {
    source: 'DEV_AUDIT_SNAPSHOT_EXPORT',
    mode: 'FULL_ANONYMIZED_SHADOW_AUDIT',
    generatedAt: now(),
    anonymizationApplied: true,
    includedSections,
    missingSections,
    warnings,
    hasStructuredTeacherSource,
    hasLegacyTeacherSource,
    hasBlockedDates,
    hasAdminReviewEvents,
    hasOfficialSchedule,
    careerAliasLookup: registries.career.hashedAliasLookup(),
  }

  return anonymized
}

export function buildFullWorkspaceSnapshotAuditSummary(snapshot = {}) {
  const metadata = snapshot?._auditExport ?? {}
  return {
    mode: metadata.mode ?? null,
    anonymizationApplied: metadata.anonymizationApplied === true,
    includedSections: asArray(metadata.includedSections),
    missingSections: asArray(metadata.missingSections),
    warnings: asArray(metadata.warnings),
    hasStructuredTeacherSource: metadata.hasStructuredTeacherSource === true,
    hasLegacyTeacherSource: metadata.hasLegacyTeacherSource === true,
    hasBlockedDates: metadata.hasBlockedDates === true,
    hasAdminReviewEvents: metadata.hasAdminReviewEvents === true,
    hasOfficialSchedule: metadata.hasOfficialSchedule === true,
  }
}
