import { buildSubjectKey } from './teacherSubjects.js'

const EMPTY_ARRAY = []
const GENERIC_PROGRAM_LABELS = new Set([
  '',
  'carrera',
  'carreras',
  'programa',
  'program',
  'career',
  'sin carrera',
  'carrera sin especificar',
])

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeIdentity(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '')
}

function normalizeSubjectCode(value) {
  return normalizeIdentity(value)
}

function isGenericProgram(value) {
  return GENERIC_PROGRAM_LABELS.has(normalizeText(value))
}

function subjectExactKey(subject) {
  return buildSubjectKey(subject?.subjectId, subject?.programId)
}

function rosterCodeKey(roster) {
  return normalizeSubjectCode(roster?.subjectId)
}

function addSubjectCodeAlias(aliases, value) {
  const identity = normalizeSubjectCode(value)
  if (!identity) return

  aliases.add(identity)

  const withoutLeadingZero = identity.match(/^([a-z]+)0+(\d+)$/)
  if (withoutLeadingZero) {
    aliases.add(`${withoutLeadingZero[1]}${Number(withoutLeadingZero[2])}`)
  }

  const likelyZeroAsLetter = identity.match(/^([a-z]+)o(\d+)$/)
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

function codeAliasesOverlap(leftAliases, rightAliases) {
  return leftAliases.some((alias) => rightAliases.includes(alias))
}

function subjectCodeAliases(subject) {
  return getSubjectCodeAliases(subject?.subjectId)
}

function rosterCodeAliases(roster) {
  return getSubjectCodeAliases(roster?.subjectId)
}

function normalizeProgramKey(value) {
  return normalizeIdentity(value)
}

function subjectProgramKey(subject) {
  return normalizeProgramKey(subject?.programId || subject?.carrera)
}

function rosterProgramKey(roster) {
  return normalizeProgramKey(roster?.programId)
}

function getStudentIdentityAliases(student) {
  const aliases = new Set()
  const add = (type, value, normalizer = normalizeIdentity) => {
    const normalized = normalizer(value)
    if (normalized) aliases.add(`${type}:${normalized}`)
  }

  ;[
    student?.studentRecordId,
    student?.student_record_id,
    student?.recordId,
    student?.record_id,
  ].forEach((value) => add('record', value))

  ;[
    student?.studentId,
    student?.student_id,
    student?.profile_id,
    student?.user_id,
    student?.id,
  ].forEach((value) => add('account', value))

  add('email', student?.email, (value) => clean(value).toLowerCase())
  add('dni', student?.dni)

  if (aliases.size === 0) {
    add('name', student?.fullName || student?.full_name)
  }

  return Array.from(aliases)
}

function mergeStudentValues(existing, incoming) {
  const merged = { ...incoming, ...existing }

  Object.keys(merged).forEach((key) => {
    const existingValue = existing?.[key]
    const incomingValue = incoming?.[key]

    if (clean(existingValue) === '' && clean(incomingValue) !== '') {
      merged[key] = incomingValue
    }
  })

  return merged
}

function getScheduleMergeKey(schedule) {
  const parts = [
    schedule?.id,
    schedule?.dia || schedule?.day,
    schedule?.inicio || schedule?.desde || schedule?.start,
    schedule?.fin || schedule?.hasta || schedule?.end,
    schedule?.materiaCodigo || schedule?.materia_codigo || schedule?.materia || schedule?.subject_code || schedule?.subject_id,
    schedule?.carrera || schedule?.programa || schedule?.program || schedule?.program_id || schedule?.career,
    schedule?.aula || schedule?.classroom || schedule?.location,
  ].map((value) => normalizeText(value))

  return parts.some(Boolean) ? parts.join('::') : ''
}

function rosterToStudent(roster) {
  return {
    id: clean(roster.studentId),
    student_id: clean(roster.studentId),
    record_id: clean(roster.studentRecordId),
    student_record_id: clean(roster.studentRecordId),
    full_name: clean(roster.fullName),
    dni: clean(roster.dni),
    email: clean(roster.email),
    enrollment_id: clean(roster.enrollmentId),
  }
}

function mergeStudentRows(...studentLists) {
  const students = []
  const studentIndexByAlias = new Map()

  studentLists.flatMap((list) => list ?? EMPTY_ARRAY).forEach((student) => {
    const aliases = getStudentIdentityAliases(student)
    if (aliases.length === 0) return

    const existingIndex = aliases
      .map((alias) => studentIndexByAlias.get(alias))
      .find((index) => index !== undefined)

    if (existingIndex === undefined) {
      const nextIndex = students.length
      students.push(student)
      aliases.forEach((alias) => studentIndexByAlias.set(alias, nextIndex))
      return
    }

    const merged = mergeStudentValues(students[existingIndex], student)
    students[existingIndex] = merged
    getStudentIdentityAliases(merged).forEach((alias) => studentIndexByAlias.set(alias, existingIndex))
  })

  return students
}

function mergeScheduleRows(...scheduleLists) {
  const schedulesByKey = new Map()

  scheduleLists.flatMap((list) => list ?? EMPTY_ARRAY).filter(Boolean).forEach((schedule) => {
    const key = getScheduleMergeKey(schedule)
    if (key) schedulesByKey.set(key, schedule)
  })

  return Array.from(schedulesByKey.values())
}

function mergeRosterStudents(currentStudents = EMPTY_ARRAY, rosters = EMPTY_ARRAY) {
  return mergeStudentRows(currentStudents, rosters.map(rosterToStudent))
}

function getSubjectQuality(subject) {
  let score = 0
  if (!isGenericProgram(subject?.programId) && !isGenericProgram(subject?.carrera)) score += 8
  if ((subject?.schedules ?? EMPTY_ARRAY).length > 0) score += 4
  if (clean(subject?.nombre) && clean(subject?.nombre) !== clean(subject?.subjectId)) score += 2
  if (clean(subject?.anio)) score += 1
  if (Number(subject?.studentCount) > 0 || (subject?.students ?? EMPTY_ARRAY).length > 0) score += 1
  return score
}

function mergeSubjectData(existing, incoming) {
  const existingQuality = getSubjectQuality(existing)
  const incomingQuality = getSubjectQuality(incoming)
  const primary = incomingQuality > existingQuality ? incoming : existing
  const secondary = primary === incoming ? existing : incoming
  const schedules = mergeScheduleRows(primary.schedules, secondary.schedules)
  const students = mergeStudentRows(primary.students, secondary.students)

  return {
    ...secondary,
    ...primary,
    subjectId: clean(primary.subjectId || secondary.subjectId),
    programId: isGenericProgram(primary.programId) ? clean(secondary.programId) : clean(primary.programId),
    carrera: isGenericProgram(primary.carrera) ? clean(secondary.carrera) : clean(primary.carrera),
    nombre: clean(primary.nombre || secondary.nombre || primary.subjectId || secondary.subjectId),
    anio: clean(primary.anio || secondary.anio),
    schedules,
    students,
    studentCount: students.length || primary.studentCount || secondary.studentCount || 0,
  }
}

export function mapGroupToSubject(group) {
  return {
    id: group.key,
    subjectId: clean(group.code || group.subjectId || group.name),
    programId: clean(group.career || group.programId),
    nombre: clean(group.name || group.subjectName || group.code),
    carrera: clean(group.career || group.programId),
    anio: clean(group.year),
    role: clean(group.role),
    schedules: group.schedules ?? EMPTY_ARRAY,
    students: group.students ?? EMPTY_ARRAY,
    studentCount: (group.students ?? EMPTY_ARRAY).length,
    source: group.source,
  }
}

export function mergeTeacherSubjects({ assignedSubjects = EMPTY_ARRAY, subjectGroups = EMPTY_ARRAY }) {
  const subjectsByExactKey = new Map()

  function subjectHasGenericProgram(subject) {
    return isGenericProgram(subject.programId) || isGenericProgram(subject.carrera)
  }

  function findMergeCandidateKey(subject, { genericOnly = false, realOnly = false } = {}) {
    const codeAliases = subjectCodeAliases(subject)
    const candidates = Array.from(subjectsByExactKey.entries()).filter(([, current]) => {
      if (!codeAliasesOverlap(subjectCodeAliases(current), codeAliases)) return false

      const currentIsGeneric = subjectHasGenericProgram(current)
      if (genericOnly && !currentIsGeneric) return false
      if (realOnly && currentIsGeneric) return false

      return true
    })

    return candidates.length === 1 ? candidates[0][0] : ''
  }

  function upsertSubject(subject) {
    const exactKey = subjectExactKey(subject)
    if (!exactKey || exactKey === '::' || subjectCodeAliases(subject).length === 0) return

    const generic = subjectHasGenericProgram(subject)
    const sameExactSubject = subjectsByExactKey.get(exactKey)

    if (sameExactSubject) {
      subjectsByExactKey.set(exactKey, mergeSubjectData(sameExactSubject, subject))
      return
    }

    if (generic) {
      const realCandidateKey = findMergeCandidateKey(subject, { realOnly: true })
      if (realCandidateKey) {
        subjectsByExactKey.set(realCandidateKey, mergeSubjectData(subjectsByExactKey.get(realCandidateKey), subject))
        return
      }
    } else {
      const genericCandidateKey = findMergeCandidateKey(subject, { genericOnly: true })
      if (genericCandidateKey) {
        const genericSubject = subjectsByExactKey.get(genericCandidateKey)
        subjectsByExactKey.delete(genericCandidateKey)
        subjectsByExactKey.set(exactKey, mergeSubjectData(genericSubject, subject))
        return
      }
    }

    subjectsByExactKey.set(exactKey, subject)
  }

  subjectGroups.map(mapGroupToSubject).forEach(upsertSubject)
  assignedSubjects.forEach(upsertSubject)

  return Array.from(subjectsByExactKey.values())
    .filter((subject) => clean(subject.subjectId))
    .sort((a, b) => clean(a.nombre || a.subjectId).localeCompare(clean(b.nombre || b.subjectId), 'es', { sensitivity: 'base' }))
}

function findMatchingItemForRoster(items, roster, getCodeKey, getProgramKey) {
  const rosterCodes = rosterCodeAliases(roster)
  const sameCodeItems = items.filter((item) => codeAliasesOverlap(getCodeKey(item), rosterCodes))
  if (sameCodeItems.length === 0) return null

  const rosterProgram = rosterProgramKey(roster)
  const exactProgramItems = sameCodeItems.filter((item) => {
    const itemProgram = getProgramKey(item)
    return itemProgram && rosterProgram && itemProgram === rosterProgram
  })

  if (exactProgramItems.length === 1) return exactProgramItems[0]
  if (sameCodeItems.length === 1) return sameCodeItems[0]

  const genericProgramItems = sameCodeItems.filter((item) => isGenericProgram(getProgramKey(item)))
  return genericProgramItems.length === 1 ? genericProgramItems[0] : null
}

export function mergeSubjectsWithRosters(subjects = EMPTY_ARRAY, subjectRosters = EMPTY_ARRAY) {
  return subjects.map((subject) => {
    const matchedRosters = subjectRosters.filter((roster) => {
      const matchedSubject = findMatchingItemForRoster(subjects, roster, subjectCodeAliases, subjectProgramKey)
      return matchedSubject === subject
    })
    const students = mergeRosterStudents(subject.students, matchedRosters)

    return {
      ...subject,
      students,
      studentCount: students.length,
    }
  })
}

export function buildSubjectGroupsFromSubjects(subjects = EMPTY_ARRAY) {
  return subjects.map((subject) => {
    const students = mergeStudentRows(subject.students)
    const programId = clean(subject.programId || subject.carrera)
    const subjectId = clean(subject.subjectId || subject.code || subject.nombre)
    const key = subjectExactKey({ subjectId, programId })
      || `${normalizeText(programId)}::${normalizeSubjectCode(subjectId)}`

    return {
      key,
      career: clean(subject.carrera || programId),
      code: subjectId,
      name: clean(subject.nombre || subject.name || subjectId),
      year: clean(subject.anio || subject.year),
      role: clean(subject.role),
      schedules: mergeScheduleRows(subject.schedules),
      students,
      source: clean(subject.source) || (students.length > 0 ? 'relational' : 'none'),
      warnings: subject.warnings ?? EMPTY_ARRAY,
    }
  }).filter((group) => clean(group.key) && clean(group.code))
}

export function mergeSubjectGroupsWithRosters(
  subjectGroups = EMPTY_ARRAY,
  subjectRosters = EMPTY_ARRAY,
  { authoritative = false } = {},
) {
  const nextGroups = subjectGroups.map((group) => ({
    ...group,
    students: authoritative ? [] : (group.students ?? EMPTY_ARRAY),
    source: authoritative ? 'relational' : group.source,
  }))

  subjectRosters.forEach((roster) => {
    const matchedGroup = findMatchingItemForRoster(
      nextGroups,
      roster,
      (group) => getSubjectCodeAliases(group?.code),
      (group) => normalizeProgramKey(group?.career),
    )

    if (!matchedGroup) {
      nextGroups.push({
        key: `${rosterProgramKey(roster)}::${rosterCodeKey(roster)}`,
        career: clean(roster.programId),
        code: clean(roster.subjectId),
        name: clean(roster.subjectId),
        year: '',
        role: '',
        schedules: [],
        students: [rosterToStudent(roster)],
        source: 'relational',
        warnings: [],
      })
      return
    }

    matchedGroup.students = mergeRosterStudents(matchedGroup.students, [roster])
    matchedGroup.source = matchedGroup.source === 'none' ? 'relational' : matchedGroup.source
  })

  return buildSubjectGroupsFromSubjects(mergeTeacherSubjects({ subjectGroups: nextGroups }))
}
