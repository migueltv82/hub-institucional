import {
  fetchAccessibleInstitutions,
  readStoredActiveInstitutionId,
} from '../../../services/institutions.js'
import {
  fetchStudentRecords,
  fetchTeacherRecords,
  mapStudentRecordToSnapshotRow,
  mapTeacherRecordToSnapshotRow,
} from '../../../services/rosterRecords.js'
import { getCareerValues, resolveCareerDisplayName } from '../../../services/careerCatalog.js'
import { fetchWorkspaceSnapshot } from '../../../services/workspaceSnapshot.js'

export const TEACHER_WORKSPACE_KEY = 'main'
export const LEGACY_TEACHER_ROSTER_WARNING = 'LEGACY_STUDENT_ROSTER_BY_CAREER_YEAR'
export const LEGACY_TEACHER_ROSTER_WARNING_METADATA = Object.freeze({
  code: LEGACY_TEACHER_ROSTER_WARNING,
  sourceType: 'LEGACY_FALLBACK',
  safeForOfficialRoster: false,
  safeForInternalComparison: true,
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeIdentityText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '')
}

function normalizeStatusToken(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '')
}

const CONFIRMED_EXAM_STATUS_TOKENS = new Set([
  'aprobada',
  'aprobado',
  'confirmed',
  'confirmada',
  'confirmado',
  'final',
  'finalconfirmed',
  'finalconfirmedminimum',
  'finalizada',
  'finalizado',
  'oficial',
  'oficializada',
  'oficializado',
  'published',
  'publishedtostudents',
  'publicada',
  'publicado',
  'tribunalcomplete',
  'tribunalcompleto',
  'tribunalminimum',
  'tribunalminimo',
])

function looksLikeEmail(value) {
  return clean(value).includes('@')
}

function getFirst(row, keys) {
  if (!row || typeof row !== 'object') return ''

  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && clean(value) !== '') return value
  }

  return ''
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right)
}

function sameNonEmptyText(left, right) {
  return Boolean(clean(left) && clean(right) && sameText(left, right))
}

function sameIdentityText(left, right) {
  const leftValue = clean(left)
  const rightValue = clean(right)
  return Boolean(
    leftValue &&
    rightValue &&
    (
      sameText(leftValue, rightValue) ||
      normalizeIdentityText(leftValue) === normalizeIdentityText(rightValue)
    ),
  )
}

function getEmailLocalPart(value) {
  return clean(value).split('@')[0] ?? ''
}

function getUserDniCandidate(user) {
  const localPart = getEmailLocalPart(user?.email).replace(/\D/g, '')
  return localPart.length >= 6 ? localPart : ''
}

function isUsableDisplayName(value) {
  const cleaned = clean(value)
  if (!cleaned || looksLikeEmail(cleaned)) return false
  return normalizeText(cleaned).split(/\s+/).filter(Boolean).length >= 2
}

function getUserNameAliases(user) {
  const aliases = new Set()
  const displayName = clean(user?.nombre || user?.display_name || user?.full_name)
  if (!isUsableDisplayName(displayName)) return []

  aliases.add(displayName)
  const parts = displayName.split(/\s+/).filter(Boolean)
  if (parts.length === 2) aliases.add(`${parts[1]} ${parts[0]}`)

  return Array.from(aliases)
}

function getTeacherProfileId(teacherRecord) {
  return clean(teacherRecord?.profile_id || teacherRecord?.profileId || teacherRecord?.user_id || teacherRecord?.userId)
}

function getTeacherNameAliases(teacherRecord) {
  const aliases = new Set()
  const add = (value) => {
    const cleaned = clean(value)
    if (cleaned) aliases.add(cleaned)
  }

  add(teacherRecord?.full_name)
  add(teacherRecord?.nombre)
  add(teacherRecord?.raw?.full_name)
  add(teacherRecord?.raw?.nombre)
  add(teacherRecord?.raw?.display_name)

  const firstName = clean(teacherRecord?.nombre || teacherRecord?.raw?.nombre || teacherRecord?.raw?.first_name)
  const lastName = clean(teacherRecord?.apellido || teacherRecord?.raw?.apellido || teacherRecord?.raw?.last_name)

  add([firstName, lastName].filter(Boolean).join(' '))
  add([lastName, firstName].filter(Boolean).join(' '))

  return Array.from(aliases)
}

function includesAnyTeacherName(row, teacherNames = []) {
  if (!teacherNames.length) return false

  return [
    row.profesor,
    row.docente,
    row.nombre,
    row.profesorTitular,
    row.profesor_titular,
    row.docenteTitular,
    row.titular,
    row.titularNombre,
    row.vocal1,
    row.primerVocal,
    row.vocal2,
    row.segundoVocal,
  ].some((value) => teacherNames.some((teacherName) => sameIdentityText(value, teacherName)))
}

function matchesTeacherIdentity(row, user, teacherRecord = null) {
  if (!row || typeof row !== 'object') return false

  const rowProfileId = getFirst(row, ['profile_id', 'profileId', 'teacher_id', 'teacherId', 'user_id', 'userId'])
  if (sameNonEmptyText(rowProfileId, user?.id) || sameNonEmptyText(getTeacherProfileId(teacherRecord), user?.id)) return true

  const rowTeacherRecordId = getFirst(row, ['teacher_record_id', 'teacherRecordId', 'docenteId', 'docente_id', 'teacher_id', 'teacherId', 'record_id'])
  if (sameNonEmptyText(rowTeacherRecordId, teacherRecord?.record_id)) return true

  const teacherIds = [
    user?.id,
    getTeacherProfileId(teacherRecord),
    teacherRecord?.record_id,
  ].map(clean).filter(Boolean)
  const roleTeacherIds = [
    'titularId',
    'titular_id',
    'profesorTitularId',
    'profesor_titular_id',
    'vocal1Id',
    'vocal1_id',
    'primerVocalId',
    'primer_vocal_id',
    'vocal2Id',
    'vocal2_id',
    'segundoVocalId',
    'segundo_vocal_id',
  ].map((key) => clean(row[key])).filter(Boolean)
  if (roleTeacherIds.some((roleId) => teacherIds.some((teacherId) => sameNonEmptyText(roleId, teacherId)))) return true

  const email = getFirst(row, ['email', 'correo', 'mail'])
  if (sameNonEmptyText(email, user?.email) || sameNonEmptyText(email, teacherRecord?.email)) return true

  const dni = getFirst(row, ['dni', 'documento', 'document_number'])
  if (sameNonEmptyText(dni, teacherRecord?.dni) || sameNonEmptyText(dni, getUserDniCandidate(user))) return true

  return includesAnyTeacherName(row, [
    ...getTeacherNameAliases(teacherRecord),
    ...getUserNameAliases(user),
  ])
}

function teacherRecordHasScheduleSubject(row, teacherRecord) {
  if (!teacherRecord) return false

  const teacherCareers = new Set(getCareerValues(teacherRecord).map(normalizeIdentityText).filter(Boolean))
  const teacherSubjects = new Set(
    asArray(teacherRecord?.raw?.materias)
      .concat(asArray(teacherRecord?.materias))
      .flatMap((subject) => [normalizeText(subject), ...getSubjectCodeAliases(subject)])
      .filter(Boolean),
  )
  const rowCareer = normalizeIdentityText(getCareer(row))
  const rowSubjectValues = [
    getRowSubjectValue(row),
    getRowSubjectName(row),
    row?.materia,
    row?.materiaCodigo,
    row?.codigo,
    row?.subject_code,
  ]
    .flatMap((subject) => [normalizeText(subject), ...getSubjectCodeAliases(subject)])
    .filter(Boolean)

  return Boolean(
    teacherCareers.has(rowCareer) &&
    rowSubjectValues.some((subject) => teacherSubjects.has(subject)),
  )
}

function matchesTeacherSchedule(row, user, teacherRecord = null) {
  return matchesTeacherIdentity(row, user, teacherRecord) || teacherRecordHasScheduleSubject(row, teacherRecord)
}

function parseTimeToMinutes(value) {
  const [hours, minutes] = clean(value).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function getBlockHours(row) {
  const start = parseTimeToMinutes(row.inicio || row.desde)
  const end = parseTimeToMinutes(row.fin || row.hasta)
  if (start === null || end === null || end <= start) return 0
  return Math.round(((end - start) / 60) * 10) / 10
}

function getExamDate(exam) {
  return exam?.fechaIso || exam?.fecha_iso || exam?.exam_date || exam?.date || exam?.fecha || exam?.fechaSugerida || null
}

function getTeacherExamPublicationStatus(row) {
  const rawStatus = getFirst(row, ['estado', 'status', 'publication_status', 'estadoFinal'])
  const status = normalizeStatusToken(rawStatus)
  if (CONFIRMED_EXAM_STATUS_TOKENS.has(status)) return 'confirmada'
  if (status) return clean(rawStatus)
  if (row?.confirmada === false || row?.confirmed === false || row?.isOfficial === false) return 'pendiente'
  return 'confirmada'
}

function isConfirmedTeacherExam(row) {
  return getTeacherExamPublicationStatus(row) === 'confirmada'
}

function normalizeExamDatePart(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  }

  const rawDate = clean(value)
  if (!rawDate) return ''
  if (rawDate.includes('T')) return rawDate

  const isoDate = rawDate.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (isoDate) {
    const [, year, month, day] = isoDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const displayDate = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (displayDate) {
    const [, day, month, year] = displayDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return rawDate
}

function getCareer(row) {
  return clean(
    getFirst(row, [
      'carrera',
      'programa',
      'program',
      'program_id',
      'canonical_program_id',
      'program_name',
      'career',
      'career_name',
    ]) ||
    row?.subject?.carrera ||
    row?.subject?.career ||
    row?.subject?.program_id ||
    row?.subject?.canonical_program_id,
  )
}

function getStudentIdentityValues(student) {
  return [
    getFirst(student, ['email', 'correo', 'mail']),
    getFirst(student, ['dni', 'documento', 'document_number']),
    getFirst(student, ['legajo', 'matricula', 'student_number']),
    getFirst(student, ['student_record_id', 'record_id', 'id', 'student_id', 'profile_id', 'user_id']),
    getFirst(student, ['full_name', 'nombre_completo', 'display_name']),
    [getFirst(student, ['nombre', 'first_name']), getFirst(student, ['apellido', 'last_name'])].filter(Boolean).join(' '),
  ].map(clean).filter(Boolean)
}

function normalizeSubjectCode(value) {
  return normalizeIdentityText(value)
}

function addSubjectCodeAlias(aliases, value) {
  const normalized = normalizeSubjectCode(value)
  if (!normalized) return

  aliases.add(normalized)

  const withoutLeadingZero = normalized.match(/^([a-z]+)0+(\d+)$/)
  if (withoutLeadingZero) {
    aliases.add(`${withoutLeadingZero[1]}${Number(withoutLeadingZero[2])}`)
  }

  const likelyZeroAsLetter = normalized.match(/^([a-z]+)o(\d+)$/)
  if (likelyZeroAsLetter) {
    const zeroVariant = `${likelyZeroAsLetter[1]}0${likelyZeroAsLetter[2]}`
    aliases.add(zeroVariant)
    aliases.add(`${likelyZeroAsLetter[1]}${Number(likelyZeroAsLetter[2])}`)
  }
}

function getSubjectCodeAliases(value) {
  const aliases = new Set()
  const raw = clean(value)

  addSubjectCodeAlias(aliases, raw)
  normalizeText(raw)
    .split(/[:|/\\]+/)
    .forEach((part) => addSubjectCodeAlias(aliases, part))

  return Array.from(aliases).filter(Boolean)
}

function registerSubjectName({ byCareerAndCode, byCode, career, code, name }) {
  const cleanedName = clean(name)
  const aliases = getSubjectCodeAliases(code)
  if (!cleanedName || aliases.length === 0) return

  const normalizedCareer = clean(career) ? normalizeIdentityText(career) : ''

  aliases.forEach((alias) => {
    if (normalizedCareer) {
      const careerKey = `${normalizedCareer}::${alias}`
      if (!byCareerAndCode.has(careerKey)) {
        byCareerAndCode.set(careerKey, cleanedName)
      }
    }

    if (!byCode.has(alias)) {
      byCode.set(alias, cleanedName)
    }
  })
}

function buildSubjectNameIndexes(snapshot = {}) {
  const byCareerAndCode = new Map()
  const byCode = new Map()

  asArray(snapshot?.planesEstudio).forEach((planRow) => {
    registerSubjectName({
      byCareerAndCode,
      byCode,
      career: planRow?.carrera || planRow?.programa || planRow?.program,
      code: planRow?.materia || planRow?.codigo || planRow?.materiacodigo || planRow?.subject_code,
      name: planRow?.nombreMateria || planRow?.nombre || planRow?.nombremateria || planRow?.nombre_materia || planRow?.subject_name,
    })
  })

  asArray(snapshot?.cronograma).forEach((examRow) => {
    registerSubjectName({
      byCareerAndCode,
      byCode,
      career: examRow?.carrera || examRow?.programa || examRow?.program,
      code: examRow?.materia || examRow?.materiaId || examRow?.materia_id || examRow?.codigo || examRow?.materiacodigo || examRow?.subject_code,
      name: examRow?.nombreMateria || examRow?.materiaMesa || examRow?.materia_nombre || examRow?.subject_name || examRow?.subject?.name,
    })
  })

  asArray(snapshot?.correlatividades).forEach((correlativeRow) => {
    registerSubjectName({
      byCareerAndCode,
      byCode,
      career: correlativeRow?.carrera || correlativeRow?.programa || correlativeRow?.program,
      code: correlativeRow?.materia || correlativeRow?.codigo || correlativeRow?.materiacodigo || correlativeRow?.subject_code,
      name: correlativeRow?.nombreMateria || correlativeRow?.nombre || correlativeRow?.nombremateria || correlativeRow?.nombre_materia || correlativeRow?.subject_name,
    })
  })

  return { byCareerAndCode, byCode }
}

function resolveSubjectName({ career, subjectCode, currentName, indexes }) {
  const explicitName = clean(currentName)
  if (explicitName) return explicitName

  const codeAliases = getSubjectCodeAliases(subjectCode)
  if (codeAliases.length === 0) return clean(subjectCode)

  const normalizedCareer = clean(career) ? normalizeIdentityText(career) : ''

  if (normalizedCareer) {
    for (const alias of codeAliases) {
      const careerKey = `${normalizedCareer}::${alias}`
      if (indexes.byCareerAndCode.has(careerKey)) {
        return indexes.byCareerAndCode.get(careerKey)
      }
    }
  }

  for (const alias of codeAliases) {
    if (indexes.byCode.has(alias)) {
      return indexes.byCode.get(alias)
    }
  }

  return clean(subjectCode)
}

function enrichScheduleRow(row, subjectIndexes) {
  const subjectCode = clean(row?.materia || row?.codigo || row?.subject_code)
  const subjectName = resolveSubjectName({
    career: row?.carrera || row?.programa || row?.program,
    subjectCode,
    currentName: row?.nombreMateria || row?.subject_name,
    indexes: subjectIndexes,
  })

  return {
    ...row,
    materiaCodigo: subjectCode,
    nombreMateria: subjectName,
    subject_name: subjectName,
  }
}

function enrichExamRow(row, subjectIndexes) {
  const subjectCode = clean(row?.materia || row?.materiaId || row?.materia_id || row?.codigo || row?.subject_code)
  const subjectName = resolveSubjectName({
    career: row?.carrera || row?.programa || row?.program,
    subjectCode,
    currentName: row?.nombreMateria || row?.materiaMesa || row?.materia_nombre || row?.subject_name || row?.subject?.name,
    indexes: subjectIndexes,
  })
  const examDate = normalizeExamDatePart(getFirst(row, ['fechaIso', 'fecha_iso', 'exam_date', 'date', 'fechaSugerida', 'fecha']))
  const profesorTitular = clean(row?.profesorTitular || row?.profesor_titular || row?.docenteTitular || row?.titular || row?.titularNombre)

  return {
    ...row,
    materia: clean(row?.materia) || subjectCode,
    codigo: clean(row?.codigo) || subjectCode,
    materiaCodigo: subjectCode,
    nombreMateria: subjectName,
    subject_name: subjectName,
    fechaIso: clean(row?.fechaIso) || examDate,
    exam_date: clean(row?.exam_date) || examDate,
    date: clean(row?.date) || examDate,
    profesorTitular,
    vocal1: clean(row?.vocal1 || row?.primerVocal),
    vocal2: clean(row?.vocal2 || row?.segundoVocal),
    estadoOriginal: row?.estado,
    estado: getTeacherExamPublicationStatus(row),
  }
}

function enrichSubjectRow(row, subjectIndexes) {
  const subjectCode = clean(getFirst(row, [
    'materiaCodigo',
    'materia_codigo',
    'subject_id',
    'subjectId',
    'materia',
    'codigo',
    'subject_code',
  ]))
  const subjectName = resolveSubjectName({
    career: row?.carrera || row?.programa || row?.program || row?.career_name,
    subjectCode,
    currentName: getFirst(row, [
      'nombreMateria',
      'materia_nombre',
      'subject_name',
      'subjectName',
      'nombre',
      'name',
    ]),
    indexes: subjectIndexes,
  })

  return {
    ...row,
    materiaCodigo: subjectCode,
    nombreMateria: subjectName,
    subject_name: subjectName,
  }
}

function getRowSubjectValue(row) {
  return clean(getFirst(row, [
    'materia',
    'codigo',
    'materiacodigo',
    'materiaCodigo',
    'materia_codigo',
    'subject_code',
    'subject_id',
    'canonical_subject_id',
    'relational_subject_id',
    'portal_subject_id',
    'code',
    'nombreMateria',
    'nombre',
    'nombremateria',
    'subject_name',
  ]))
}

function getRowSubjectName(row) {
  return clean(getFirst(row, ['nombreMateria', 'nombre', 'nombremateria', 'nombre_materia', 'subject_name', 'name']))
}

function subjectMatches(row, subject) {
  const rowValues = [
    getRowSubjectValue(row),
    getRowSubjectName(row),
    row?.subject?.id,
    row?.subject?.subject_id,
    row?.subject?.canonical_subject_id,
    row?.subject?.relational_subject_id,
    row?.subject?.portal_subject_id,
    row?.subject?.code,
    row?.subject?.codigo,
    row?.subject?.materia,
    row?.subject?.name,
  ].map(clean).filter(Boolean)
  const subjectValues = [
    subject.code,
    subject.name,
    subject.id,
    subject.subject_id,
    subject.canonical_subject_id,
    subject.relational_subject_id,
    subject.portal_subject_id,
  ].map(clean).filter(Boolean)
  const subjectAliases = subjectValues.flatMap((value) => getSubjectCodeAliases(value))

  return rowValues.some((rowValue) => {
    if (subjectValues.some((subjectValue) => sameText(rowValue, subjectValue))) return true

    const rowAliases = getSubjectCodeAliases(rowValue)
    return rowAliases.some((alias) => subjectAliases.includes(alias))
  })
}

function rowMatchesStudent(row, student) {
  const rowIdentityValues = [
    getFirst(row, ['email', 'correo', 'mail']),
    getFirst(row, ['dni', 'documento', 'document_number']),
    getFirst(row, ['legajo', 'matricula', 'student_number']),
    getFirst(row, ['student_record_id', 'record_id', 'student_id', 'profile_id', 'user_id', 'id']),
    getFirst(row, ['full_name', 'nombre_completo', 'display_name', 'alumno', 'estudiante']),
  ].map(clean).filter(Boolean)

  if (rowIdentityValues.length === 0) return false

  const studentIdentityValues = getStudentIdentityValues(student)
  return rowIdentityValues.some((rowValue) => studentIdentityValues.some((studentValue) => sameText(rowValue, studentValue)))
}

function isActiveAcademicRow(row) {
  const status = clean(getFirst(row, ['estado', 'status', 'situacion'])).toLowerCase()
  if (!status) return true

  return ['cursando', 'regular', 'active', 'enrolled', 'inscripto', 'inscripta'].includes(status)
}

function findPlanSubject(plans, career, subject) {
  return asArray(plans).find((planRow) => {
    if (career && !sameIdentityText(getCareer(planRow), career)) return false

    return subjectMatches(planRow, subject)
  }) ?? null
}

function getStudentKey(student) {
  return clean(getFirst(student, ['student_record_id', 'record_id', 'id', 'student_id', 'profile_id', 'user_id', 'email', 'dni', 'legajo']))
    || normalizeText(getStudentIdentityValues(student)[0] ?? '')
}

function getSubjectGroupYear(row) {
  return clean(getFirst(row, ['anio', 'anio_cursada', 'ano', 'academic_year', 'year', 'curso']))
}

function getSubjectGroupRole(row) {
  return clean(getFirst(row, ['rol', 'role', 'rol_en_materia', 'titularidad']))
}

// Los horarios (horariosDocentes) siempre traen "carrera" (nombre
// descriptivo, ej. "PROFESORADO DE INGLES"), pero las asignaciones
// docente-materia (docenteMateria/cargaHorariaDocente) suelen traer
// solo "carrera_id" (el codigo corto, ej. "ING") sin nombre. Si la clave
// de agrupacion usara el nombre de carrera tal cual llega en cada fuente,
// la misma materia real generaba dos entradas (una por fuente) porque
// "profesoradodeingles" y "" (sin carrera) no matchean. Para evitar esto,
// la clave arma el componente de carrera priorizando el ID estable
// (carrera_id/program_id), presente en ambas fuentes, en vez del nombre.
function resolveSubjectGroupCareerName(value) {
  const cleaned = clean(value)
  if (!cleaned) return ''
  return resolveCareerDisplayName(cleaned) || cleaned
}

function getSubjectGroupCareerIdentity(row = {}, fallbackCareer = '') {
  const stableId = clean(getFirst(row, ['carrera_id', 'carreraId', 'program_id', 'programId']))
  return normalizeIdentityText(resolveSubjectGroupCareerName(stableId || fallbackCareer))
}

function getSubjectGroupKey({ careerKey, code, name }) {
  const subjectKey = getSubjectCodeAliases(code)[0] || normalizeText(name)
  if (!subjectKey && !careerKey) return ''
  return `${careerKey}::${subjectKey}`
}

function ensureSubjectGroup(groups, row) {
  const career = getCareer(row)
  const code = clean(row.materiaCodigo || row.materia_codigo || row.materia || row.codigo || row.subject_code || row.subject_id)
  const name = clean(row.nombreMateria || row.subject_name || row.materia_nombre || row.nombre || code)
  const careerKey = getSubjectGroupCareerIdentity(row, career)
  const key = getSubjectGroupKey({ careerKey, code, name })

  if (!key || key === '::') return null

  const current = groups.get(key) ?? {
    key,
    career,
    code,
    name: name || code || 'Materia',
    year: '',
    role: '',
    schedules: [],
    students: [],
    source: 'academic',
  }

  current.career = current.career || career
  current.year = current.year || getSubjectGroupYear(row)
  current.role = current.role || getSubjectGroupRole(row)
  current.source = current.source || clean(row.source)
  groups.set(key, current)

  return current
}

function buildSubjectStudentGroups({ schedules, subjectRows = [], students, snapshot }) {
  const groups = new Map()
  const academicRows = asArray(snapshot?.estadoAcademico)
    .concat(asArray(snapshot?.academicStatusRows))
    .concat(asArray(snapshot?.enrollments))

  schedules.forEach((schedule) => {
    const current = ensureSubjectGroup(groups, schedule)
    if (!current) return
    current.schedules.push(schedule)
  })

  subjectRows.forEach((row) => {
    ensureSubjectGroup(groups, row)
  })

  return Array.from(groups.values()).map((group) => {
    const planSubject = findPlanSubject(snapshot?.planesEstudio, group.career, group)
    const subjectYear = clean(getFirst(planSubject, ['anio', 'anio_cursada', 'ano', 'academic_year', 'year', 'curso'])) || group.year
    const activeSubjectRows = academicRows.filter((row) => (
      isActiveAcademicRow(row) &&
      (!group.career || !getCareer(row) || sameIdentityText(getCareer(row), group.career)) &&
      subjectMatches(row, group)
    ))
    const matchedStudents = activeSubjectRows.length > 0
      ? students.filter((student) => activeSubjectRows.some((row) => rowMatchesStudent(row, student)))
      : []
    const uniqueStudents = Array.from(new Map(matchedStudents.map((student) => [getStudentKey(student), student])).values())

    return {
      ...group,
      year: subjectYear,
      students: uniqueStudents.sort((a, b) => clean(a.full_name || a.nombre).localeCompare(clean(b.full_name || b.nombre), 'es', { sensitivity: 'base' })),
      source: activeSubjectRows.length > 0 ? 'academic' : 'none',
      warnings: [],
    }
  }).sort((a, b) => clean(a.name).localeCompare(clean(b.name), 'es', { sensitivity: 'base' }))
}

function getTeacherNames(snapshot, teacherRows = []) {
  if (asArray(teacherRows).length > 0) {
    return Array.from(new Set(
      asArray(teacherRows)
        .map((teacher) => clean(teacher.full_name || teacher.nombre))
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b))
  }

  const names = new Set()

  asArray(snapshot.horariosDocentes).forEach((row) => {
    const name = clean(row.profesor || row.docente || row.nombre)
    if (name) names.add(name)
  })

  asArray(snapshot.cronograma).forEach((exam) => {
    ;[
      exam.profesorTitular,
      exam.profesor_titular,
      exam.docenteTitular,
      exam.titular,
      exam.titularNombre,
      exam.vocal1,
      exam.primerVocal,
      exam.vocal2,
      exam.segundoVocal,
    ].forEach((name) => {
      const cleaned = clean(name)
      if (cleaned) names.add(cleaned)
    })
  })

  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

function getTeacherStats({ schedules, exams, students, subjectStudentGroups = [], teacherCareers = null }) {
  const careers = teacherCareers instanceof Set
    ? new Set(Array.from(teacherCareers))
    : new Set(schedules.map((row) => clean(row.carrera)).filter(Boolean))
  const subjects = subjectStudentGroups.length > 0
    ? new Set(subjectStudentGroups.map((group) => group.key).filter(Boolean))
    : new Set(schedules.map((row) => clean(row.materia)).filter(Boolean))
  const weeklyHours = schedules.reduce((total, row) => total + getBlockHours(row), 0)
  const confirmedExams = exams.filter(isConfirmedTeacherExam)

  return {
    weeklyHours,
    scheduleBlocks: schedules.length,
    careers: careers.size,
    subjects: subjects.size,
    exams: exams.length,
    confirmedExams: confirmedExams.length,
    students: students.length,
    subjectStudents: new Set(subjectStudentGroups.flatMap((group) => group.students.map(getStudentKey))).size,
  }
}

function getMatchedTeacherRecord(teacherRows, user) {
  const userDni = getUserDniCandidate(user)

  return asArray(teacherRows).find((teacher) => (
    sameNonEmptyText(getTeacherProfileId(teacher), user?.id) ||
    sameNonEmptyText(teacher?.email, user?.email) ||
    sameNonEmptyText(teacher?.dni, userDni) ||
    sameNonEmptyText(teacher?.full_name, user?.nombre) ||
    getTeacherNameAliases(teacher).some((name) => sameNonEmptyText(name, user?.nombre))
  )) ?? null
}

export function mapWorkspaceSnapshotToTeacherPortal({
  snapshot,
  user,
  activeInstitution,
  teacherRows = [],
  studentRows = [],
}) {
  const subjectIndexes = buildSubjectNameIndexes(snapshot)
  const teacherNames = getTeacherNames(snapshot, teacherRows)
  const matchedTeacherRecord = getMatchedTeacherRecord(teacherRows, user)
  const teacherAliases = getTeacherNameAliases(matchedTeacherRecord)
  const userAliases = getUserNameAliases(user)
  const matchedName = teacherNames.find((name) => (
    teacherAliases.some((alias) => sameNonEmptyText(name, alias)) ||
    userAliases.some((alias) => sameNonEmptyText(name, alias)) ||
    sameNonEmptyText(name, user?.email)
  ))
  const selectedTeacherName = matchedName || matchedTeacherRecord?.full_name || clean(user?.nombre) || 'Docente'
  const schedules = asArray(snapshot.horariosDocentes)
    .filter((row) => matchesTeacherSchedule(row, user, matchedTeacherRecord))
    .map((row) => enrichScheduleRow(row, subjectIndexes))
    .sort((a, b) => clean(a.dia).localeCompare(clean(b.dia)) || clean(a.inicio).localeCompare(clean(b.inicio)))
  const exams = asArray(snapshot.cronograma)
    .filter((exam) => matchesTeacherIdentity(exam, user, matchedTeacherRecord))
    .map((exam) => enrichExamRow(exam, subjectIndexes))
    .sort((a, b) => new Date(getExamDate(a) || 0) - new Date(getExamDate(b) || 0))
  const subjectRows = asArray(snapshot.docenteMateria)
    .concat(asArray(snapshot.cargaHorariaDocente))
    .filter((row) => matchesTeacherIdentity(row, user, matchedTeacherRecord) || teacherRecordHasScheduleSubject(row, matchedTeacherRecord))
    .map((row) => enrichSubjectRow(row, subjectIndexes))
    .sort((a, b) => clean(a.nombreMateria || a.materia).localeCompare(clean(b.nombreMateria || b.materia), 'es', { sensitivity: 'base' }))
  const teacherCareers = new Set(schedules.map((row) => clean(row.carrera)).filter(Boolean))
  exams.forEach((exam) => {
    const career = clean(exam.carrera)
    if (career) teacherCareers.add(career)
  })
  subjectRows.forEach((subject) => {
    const career = getCareer(subject)
    if (career) teacherCareers.add(career)
  })
  getCareerValues(matchedTeacherRecord ?? {}).forEach((career) => {
    teacherCareers.add(career)
  })
  const rosterStudents = asArray(studentRows).length
    ? asArray(studentRows)
    : asArray(snapshot.alumnos).concat(asArray(snapshot.students))
  const teacherCareerKeys = new Set(Array.from(teacherCareers).map(normalizeIdentityText).filter(Boolean))
  const students = rosterStudents
    .filter((student) => teacherCareerKeys.has(normalizeIdentityText(student.carrera || student.programa || student.program || student.career)))
  const subjectStudentGroups = buildSubjectStudentGroups({
    schedules,
    subjectRows,
    students,
    snapshot,
  })
  const developmentWarnings = Array.from(new Set(subjectStudentGroups.flatMap((group) => group.warnings ?? [])))
  const developmentWarningDetails = developmentWarnings.map((warning) => (
    warning === LEGACY_TEACHER_ROSTER_WARNING
      ? LEGACY_TEACHER_ROSTER_WARNING_METADATA
      : { code: warning }
  ))

  return {
    currentTeacher: {
      id: user?.id,
      record_id: matchedTeacherRecord?.record_id ?? null,
      email: matchedTeacherRecord?.email || user?.email,
      telefono: matchedTeacherRecord?.telefono || '',
      full_name: selectedTeacherName,
      matched: Boolean(matchedTeacherRecord || matchedName),
      raw: matchedTeacherRecord,
    },
    currentInstitution: activeInstitution,
    teacherNames: selectedTeacherName ? [selectedTeacherName] : [],
    teacherRows: asArray(teacherRows),
    schedules,
    exams,
    subjectRows,
    students,
    subjectStudentGroups,
    developmentWarnings,
    developmentWarningDetails,
    studentRows: rosterStudents,
    plans: asArray(snapshot.planesEstudio),
    stats: getTeacherStats({ schedules, exams, students, subjectStudentGroups, teacherCareers }),
    workspaceSnapshot: snapshot,
  }
}

export async function fetchTeacherPortalData({ user, isRemoteSession, isSuperAdmin, activeInstitution: providedActiveInstitution = null }) {
  let activeInstitution = providedActiveInstitution

  if (!activeInstitution) {
    const { institutions } = await fetchAccessibleInstitutions({
      isSuperAdmin,
      useRemote: isRemoteSession,
    })
    const storedInstitutionId = readStoredActiveInstitutionId()
    activeInstitution = institutions.find((institution) => institution.id === storedInstitutionId)
      ?? institutions[0]
      ?? null
  }

  if (!activeInstitution) {
    return mapWorkspaceSnapshotToTeacherPortal({
      snapshot: {},
      user,
      activeInstitution: null,
      teacherRows: [],
      studentRows: [],
    })
  }

  const [{ snapshot }, teacherRecords, studentRecords] = await Promise.all([
    fetchWorkspaceSnapshot({
      institutionId: activeInstitution.id,
      workspaceKey: TEACHER_WORKSPACE_KEY,
      useRemote: Boolean(isRemoteSession),
    }),
    fetchTeacherRecords({
      institutionId: activeInstitution.id,
      workspaceKey: TEACHER_WORKSPACE_KEY,
      useRemote: Boolean(isRemoteSession),
    }),
    fetchStudentRecords({
      institutionId: activeInstitution.id,
      workspaceKey: TEACHER_WORKSPACE_KEY,
      useRemote: Boolean(isRemoteSession),
    }),
  ])

  return mapWorkspaceSnapshotToTeacherPortal({
    snapshot,
    user,
    activeInstitution,
    teacherRows: teacherRecords.map(mapTeacherRecordToSnapshotRow),
    studentRows: studentRecords.map(mapStudentRecordToSnapshotRow),
  })
}

export function remapTeacherPortalData(data, teacherName) {
  return mapWorkspaceSnapshotToTeacherPortal({
    snapshot: data?.workspaceSnapshot ?? {},
    user: {
      id: data?.currentTeacher?.id,
      email: data?.currentTeacher?.email,
      nombre: teacherName,
    },
    activeInstitution: data?.currentInstitution ?? null,
    teacherRows: data?.teacherRows ?? [],
    studentRows: data?.studentRows ?? [],
  })
}
