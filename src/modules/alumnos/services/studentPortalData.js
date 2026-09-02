import {
  fetchAccessibleInstitutions,
  readStoredActiveInstitutionId,
} from '../../../services/institutions.js'
import {
  fetchStudentRecords,
  mapStudentRecordToSnapshotRow,
} from '../../../services/rosterRecords.js'
import { fetchWorkspaceSnapshot } from '../../../services/workspaceSnapshot.js'
import { fetchStudentAttendanceRecords } from '../../../services/subjectAttendance.js'
import {
  fetchAcademicRelationalSnapshotOverlay,
  overlaySnapshotWithRelationalAcademicData,
} from './academicRelationalData.js'
import { normalizeAcademicStatus } from '../lib/examEligibility.js'
import { classifyPrerequisites } from '../lib/prerequisiteGraph.js'
import {
  fetchStudentPortalSecureWorkspaceSnapshot,
  isStudentPortalAccount,
} from './studentPortalSecureReadModel.js'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'

export const STUDENT_WORKSPACE_KEY = 'main'

async function fetchStudentSubjectTeacherNotices({ institutionId, workspaceKey = 'main', useRemote }) {
  if (!useRemote || !institutionId || !isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.rpc('academic_get_student_subject_teacher_notices', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
  })
  if (error) {
    if (error.code !== 'PGRST202' && error.code !== '42883') {
      console.warn('No se pudieron cargar los reemplazos docentes.', error)
    }
    return []
  }
  return asArray(data)
}

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

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general'
}

function getFirst(row, keys) {
  if (!row || typeof row !== 'object') return ''

  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && clean(value) !== '') return value
  }

  return ''
}

function getStudentIdentityName(student) {
  const explicitFullName = clean(getFirst(student, ['full_name', 'display_name', 'nombre_completo']))
  if (explicitFullName) return explicitFullName

  const firstName = clean(getFirst(student, ['nombre', 'first_name']))
  const lastName = clean(getFirst(student, ['apellido', 'last_name']))
  return [firstName, lastName].filter(Boolean).join(' ')
}

function getStudentFullName(student, user) {
  return getStudentIdentityName(student) || user?.nombre || user?.email || 'Alumno'
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right)
}

function sameIdentity(left, right) {
  const leftValue = clean(left)
  const rightValue = clean(right)

  return Boolean(
    leftValue &&
    rightValue &&
    (
      leftValue === rightValue ||
      sameText(leftValue, rightValue) ||
      slugify(leftValue) === slugify(rightValue)
    ),
  )
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean)
  return clean(value)
    .replaceAll(',', '|')
    .replaceAll(';', '|')
    .split('|')
    .map(clean)
    .filter(Boolean)
}

function subjectIdFor(carrera, materia) {
  return `${slugify(carrera)}:${slugify(materia)}`
}

function getSubjectCanonicalId(subject) {
  return clean(
    subject?.canonical_subject_id ||
    subject?.relational_subject_id ||
    subject?.subject_id ||
    subject?.code ||
    subject?.codigo ||
    subject?.materia,
  )
}

function getSubjectPortalId(subject) {
  return clean(subject?.portal_subject_id || subject?.id)
}

function getSubjectProgramId(subject) {
  return clean(
    subject?.canonical_program_id ||
    subject?.program_id ||
    subject?.carrera ||
    subject?.career,
  )
}

function getSubjectCode(row) {
  return clean(getFirst(row, ['materia', 'code', 'codigo', 'subject_code', 'subject_id']))
}

function getSubjectName(row) {
  return clean(getFirst(row, ['nombre', 'nombremateria', 'name', 'subject_name'])) || getSubjectCode(row)
}

function getCareer(row) {
  return clean(getFirst(row, ['carrera', 'programa', 'program', 'program_name', 'career']))
}

function getStudentYear(student) {
  return clean(getFirst(student, ['anio', 'anio_cursada', 'ano', 'academic_year', 'year', 'curso']))
}

export function getPlanCareers(plans) {
  const byKey = new Map()

  asArray(plans).forEach((row) => {
    const career = getCareer(row)
    const key = normalizeText(career)

    if (!career || !key || byKey.has(key)) return
    byKey.set(key, career)
  })

  return Array.from(byKey.values())
}

function resolveCareerAgainstPlan(rawCareer, planCareers = []) {
  const cleanedCareer = clean(rawCareer)
  if (!cleanedCareer) return ''

  const normalizedCareer = normalizeText(cleanedCareer)
  const careerSlug = slugify(cleanedCareer)
  if (!normalizedCareer) return cleanedCareer

  const exactMatch = planCareers.find((career) => (
    normalizeText(career) === normalizedCareer ||
    slugify(career) === careerSlug
  ))
  if (exactMatch) return exactMatch

  const partialMatches = planCareers.filter((career) => {
    const normalizedPlanCareer = normalizeText(career)
    const planCareerSlug = slugify(career)
    return (
      normalizedPlanCareer.includes(normalizedCareer) ||
      normalizedCareer.includes(normalizedPlanCareer) ||
      planCareerSlug.includes(careerSlug) ||
      careerSlug.includes(planCareerSlug)
    )
  })

  if (partialMatches.length === 1) {
    return partialMatches[0]
  }

  return cleanedCareer
}

function matchesStudent(row, user) {
  if (!row || typeof row !== 'object') return false
  const email = getFirst(row, ['email', 'correo', 'mail'])
  const userId = getFirst(row, ['user_id', 'profile_id', 'student_id', 'id'])
  const fullName = getStudentIdentityName(row)

  return (
    (email && sameText(email, user?.email)) ||
    (userId && sameText(userId, user?.id)) ||
    (fullName && sameText(fullName, user?.nombre))
  )
}

function normalizeEnrollmentStatus(value) {
  const status = clean(value).toLowerCase()

  if (['aprobada', 'aprobado', 'approved', 'passed', 'completed', 'finalizada'].includes(status)) {
    return 'completed'
  }

  if (['cursando', 'regular', 'active', 'enrolled', 'inscripto', 'inscripta'].includes(status)) {
    return 'active'
  }

  if (['libre', 'abandonada', 'dropped', 'baja'].includes(status)) {
    return 'dropped'
  }

  return status || 'pending'
}

function parseScore(row) {
  const value = getFirst(row, ['nota', 'score', 'grade_value', 'final_grade', 'calificacion', 'promedio'])
  if (clean(value) === '') return null

  const score = Number(String(value).replace(',', '.'))
  return Number.isFinite(score) ? score : null
}

function getRegularityDate(row, academicStatus = normalizeAcademicStatus(getFirst(row, ['academic_status', 'estado_academico', 'condicion', 'estado', 'status', 'situacion']))) {
  const explicitDate = getFirst(row, ['fecha_regularidad', 'regularity_date', 'regularized_at', 'regular_at'])
  if (explicitDate) return explicitDate

  if (academicStatus === 'regular') {
    return getFirst(row, ['fecha', 'date'])
  }

  return ''
}

function getRegularityYear(row) {
  return getFirst(row, ['anio_regularidad', 'ano_regularidad', 'regular_year', 'anio_reg'])
}

function hasFinalAcademicEvent(row, academicStatus) {
  if (['approved', 'promocionado', 'failed', 'absent'].includes(academicStatus)) return true
  if (parseScore(row) !== null) return true
  return ['1', 'si', 'true', 'x'].includes(normalizeText(getFirst(row, ['ausente', 'absent'])))
}

function getFinalDate(row, academicStatus = normalizeAcademicStatus(getFirst(row, ['academic_status', 'estado_academico', 'condicion', 'estado', 'status', 'situacion']))) {
  const explicitDate = getFirst(row, ['fecha_final', 'final_date', 'fecha_nota', 'graded_at'])
  if (explicitDate) return explicitDate

  return hasFinalAcademicEvent(row, academicStatus) ? getFirst(row, ['fecha']) : ''
}

export function buildSubjects(plans, selectedCareer, planCareers = []) {
  return asArray(plans)
    .filter((row) => {
      if (!selectedCareer) return true
      const resolvedCareer = resolveCareerAgainstPlan(getCareer(row), planCareers) || getCareer(row)
      return sameIdentity(resolvedCareer, selectedCareer)
    })
    .map((row) => {
      const carrera = resolveCareerAgainstPlan(getCareer(row), planCareers) || selectedCareer || 'Carrera general'
      const code = getSubjectCode(row)
      const name = getSubjectName(row)
      const semester = Number(getFirst(row, ['anio', 'anio_cursada', 'ano', 'semester', 'cuatrimestre'])) || 1

      return {
        id: subjectIdFor(carrera, code || name),
        portal_subject_id: subjectIdFor(carrera, code || name),
        subject_id: code || name,
        canonical_subject_id: code || name,
        program_id: carrera,
        canonical_program_id: carrera,
        program_slug: slugify(carrera),
        carrera,
        code: code || name,
        name: name || code || 'Materia sin nombre',
        semester,
        credits: Number(getFirst(row, ['creditos', 'credits'])) || 0,
        hs_theory: Number(getFirst(row, ['hs_theory', 'horas_teoria'])) || 0,
        hs_practice: Number(getFirst(row, ['hs_practice', 'horas_practica'])) || 0,
        is_mandatory: true,
      }
    })
}

function findSubject(subjects, carrera, materia) {
  const id = subjectIdFor(carrera, materia)
  return subjects.find((subject) => sameIdentity(getSubjectPortalId(subject), id))
    ?? subjects.find((subject) => sameIdentity(getSubjectCanonicalId(subject), materia) && sameIdentity(getSubjectProgramId(subject), carrera))
    ?? subjects.find((subject) => sameText(subject.code, materia) && sameIdentity(subject.carrera, carrera))
    ?? subjects.find((subject) => sameText(subject.name, materia) && sameIdentity(subject.carrera, carrera))
    ?? null
}

function getRowSubjectId(row) {
  return clean(
    row?.subject_id ||
    row?.canonical_subject_id ||
    row?.relational_subject_id ||
    row?.subject?.canonical_subject_id ||
    row?.subject?.subject_id ||
    row?.subject?.code ||
    row?.subject?.id,
  )
}

function getRowProgramId(row) {
  return clean(
    row?.program_id ||
    row?.canonical_program_id ||
    row?.subject?.canonical_program_id ||
    row?.subject?.program_id ||
    row?.subject?.carrera,
  )
}

function getRowCareer(row, selectedCareer, planCareers = []) {
  return resolveCareerAgainstPlan(
    getCareer(row) || row?.subject?.carrera || row?.subject?.career,
    planCareers,
  ) || selectedCareer || ''
}

function resolveEnrollmentSubject(row, subjects, selectedCareer, planCareers = []) {
  const subjectId = getRowSubjectId(row)
  if (subjectId) {
    const rowCareer = getRowCareer(row, selectedCareer, planCareers)

    return subjects.find((subject) => {
      const sameSubject = (
        sameIdentity(getSubjectPortalId(subject), subjectId) ||
        sameIdentity(getSubjectCanonicalId(subject), subjectId) ||
        sameIdentity(subject.code, subjectId)
      )
      const sameProgram = !rowCareer || sameIdentity(getSubjectProgramId(subject), rowCareer) || sameIdentity(subject.carrera, rowCareer)

      return sameSubject && sameProgram
    })
      ?? row?.subject
      ?? null
  }

  const carrera = getRowCareer(row, selectedCareer, planCareers)
  const code = getSubjectCode(row) || clean(row?.subject?.code)
  const name = getSubjectName(row) || clean(row?.subject?.name)

  return findSubject(subjects, carrera, code)
    ?? findSubject(subjects, carrera, name)
    ?? row?.subject
    ?? null
}

function normalizeSnapshotEnrollments(rows, {
  institutionId,
  planCareers = [],
  programId,
  selectedCareer,
  subjects,
  user,
}) {
  return asArray(rows).flatMap((row, index) => {
    if (!matchesStudent(row, user)) return []

    const subject = resolveEnrollmentSubject(row, subjects, selectedCareer, planCareers)
    const rawSubjectId = getRowSubjectId(row)
    const rawProgramId = getRowProgramId(row)
    const canonicalProgramFromRow = resolveCareerAgainstPlan(rawProgramId, planCareers)
    const resolvedProgramId = getSubjectProgramId(subject) || canonicalProgramFromRow || rawProgramId || programId
    const resolvedCareer = getRowCareer(row, selectedCareer, planCareers) || subject?.carrera || ''

    if (programId && resolvedProgramId && !sameIdentity(resolvedProgramId, programId)) return []
    if (selectedCareer && resolvedCareer && !sameIdentity(resolvedCareer, selectedCareer)) return []

    const academicStatus = normalizeAcademicStatus(getFirst(row, ['academic_status', 'estado_academico', 'condicion', 'estado', 'status', 'situacion']))

    return [{
      ...row,
      id: clean(row?.id) || `snapshot-enrollment-${rawSubjectId || getSubjectCanonicalId(subject) || index}`,
      profile_id: clean(row?.profile_id || row?.student_id || row?.user_id) || user?.id,
      student_id: clean(row?.student_id || row?.profile_id || row?.user_id) || user?.id,
      institution_id: clean(row?.institution_id) || institutionId,
      program_id: resolvedProgramId,
      canonical_program_id: resolvedProgramId,
      subject_id: getSubjectCanonicalId(subject) || rawSubjectId || '',
      canonical_subject_id: getSubjectCanonicalId(subject) || rawSubjectId || '',
      portal_subject_id: getSubjectPortalId(subject) || (rawSubjectId.includes(':') ? rawSubjectId : ''),
      status: normalizeEnrollmentStatus(getFirst(row, ['estado', 'status', 'situacion'])),
      academic_status: academicStatus,
      enrolled_at: getFirst(row, ['enrolled_at', 'fecha', 'created_at']) || null,
      regularity_date: getRegularityDate(row, academicStatus) || null,
      regular_year: getRegularityYear(row) || null,
      final_date: getFinalDate(row, academicStatus) || null,
      subject: subject || row?.subject || null,
    }]
  })
}

function normalizeSnapshotGrades(rows, user, enrollmentIds = new Set()) {
  return asArray(rows)
    .filter((row) => {
      const enrollmentId = clean(row?.enrollment_id)
      if (enrollmentId && enrollmentIds.has(enrollmentId)) return true
      return matchesStudent(row, user)
    })
    .map((row, index) => ({
      ...row,
      id: clean(row?.id) || `snapshot-grade-${clean(row?.enrollment_id) || index}`,
      grade_type: clean(row?.grade_type || row?.type) || 'final',
    }))
}

function normalizeSnapshotExamEnrollments(rows, user) {
  return asArray(rows).filter((row) => matchesStudent(row, user))
}

function getScheduleSubjectCode(row) {
  return clean(getFirst(row, ['materia', 'materiaId', 'materia_id', 'code', 'codigo', 'materiacodigo', 'subject_code', 'subject_id']))
}

function getScheduleSubjectName(row) {
  return clean(getFirst(row, ['nombreMateria', 'materiaMesa', 'materia_nombre', 'nombre', 'nombremateria', 'name', 'subject_name'])) || getScheduleSubjectCode(row)
}

function getSubjectYear(subject) {
  return clean(subject?.semester ?? subject?.anio ?? subject?.ano ?? subject?.year)
}

function dayOrder(value) {
  const normalized = normalizeText(value)
  const order = {
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
    domingo: 7,
  }

  return order[normalized] ?? 99
}

function buildFallbackRequiredSubject(carrera, requiredCode) {
  return {
    id: subjectIdFor(carrera, requiredCode),
    portal_subject_id: subjectIdFor(carrera, requiredCode),
    subject_id: requiredCode,
    canonical_subject_id: requiredCode,
    program_id: carrera,
    canonical_program_id: carrera,
    code: requiredCode,
    name: requiredCode,
  }
}

// Solo hace falta cargar en el Excel la correlativa DIRECTA de cada materia
// (ej: Ingles II -> Ingles I, Ingles I -> Didactica General). Esta funcion
// deriva sola la cadena completa: para cada materia calcula que correlativas
// son inmediatas (alcanza con regular para cursar) y cuales son indirectas
// -heredadas transitivamente de la cadena, exigen aprobada incluso para
// cursar- y arma una entrada de prerequisito por cada una, aunque la
// indirecta no este escrita explicitamente en ninguna fila del Excel. Ver
// prerequisiteGraph.js.
export function buildPrerequisites(rows, subjects, selectedCareer, planCareers = []) {
  const direct = new Map()
  const carreraBySubjectId = new Map()

  asArray(rows).forEach((row) => {
    const carrera = resolveCareerAgainstPlan(getCareer(row), planCareers) || selectedCareer || 'Carrera general'
    if (selectedCareer && !sameIdentity(carrera, selectedCareer)) return

    const targetCode = getSubjectCode(row)
    const targetSubject = findSubject(subjects, carrera, targetCode) ?? {
      id: subjectIdFor(carrera, targetCode),
      portal_subject_id: subjectIdFor(carrera, targetCode),
      subject_id: targetCode,
      canonical_subject_id: targetCode,
      program_id: carrera,
      canonical_program_id: carrera,
      code: targetCode,
      name: getSubjectName(row),
    }
    const targetSubjectId = getSubjectCanonicalId(targetSubject) || targetCode
    carreraBySubjectId.set(targetSubjectId, carrera)

    const requiredCodes = splitList(row.correlativas ?? row.prerequisites ?? row.requisitosprevios).map((requiredCode) => {
      const requiredSubject = findSubject(subjects, carrera, requiredCode)
      return getSubjectCanonicalId(requiredSubject) || requiredCode
    })

    const list = direct.get(targetSubjectId) ?? []
    direct.set(targetSubjectId, list.concat(requiredCodes))
  })

  const classification = classifyPrerequisites(direct)
  const entries = []

  classification.forEach(({ immediate, indirect }, subjectId) => {
    const carrera = carreraBySubjectId.get(subjectId) || selectedCareer || 'Carrera general'

    const pushEntry = (requiredSubjectId, requirementType) => {
      const requiredSubject = findSubject(subjects, carrera, requiredSubjectId)
        ?? buildFallbackRequiredSubject(carrera, requiredSubjectId)

      entries.push({
        id: `${subjectId}:${requiredSubjectId}`,
        subject_id: subjectId,
        prerequisite_subject_id: requiredSubjectId,
        prerequisite_subject: requiredSubject,
        requirement_type: requirementType,
      })
    }

    immediate.forEach((code) => pushEntry(code, 'regular'))
    indirect.forEach((code) => pushEntry(code, 'approved'))
  })

  return entries
}

function buildAcademicRows(snapshot, user, subjects, selectedCareer, institutionId, programId, planCareers = []) {
  const snapshotEnrollments = normalizeSnapshotEnrollments(snapshot.enrollments, {
    institutionId,
    planCareers,
    programId,
    selectedCareer,
    subjects,
    user,
  })
  const rows = asArray(snapshot.estadoAcademico)
    .concat(asArray(snapshot.academicStatusRows))
    .filter((row) => matchesStudent(row, user))

  const enrollments = []
  const grades = []

  rows.forEach((row, index) => {
    const carrera = resolveCareerAgainstPlan(getCareer(row), planCareers) || selectedCareer || 'Carrera general'
    if (selectedCareer && !sameIdentity(carrera, selectedCareer)) return

    const code = getSubjectCode(row)
    if (!code) return

    const subject = findSubject(subjects, carrera, code)
    if (!subject) return

    const enrollmentId = clean(row.enrollment_id) || `snapshot-enrollment-${subject.id}-${index}`
    const status = normalizeEnrollmentStatus(getFirst(row, ['estado', 'status', 'situacion']))
    const academicStatus = normalizeAcademicStatus(getFirst(row, ['academic_status', 'estado_academico', 'condicion', 'estado', 'status', 'situacion']))
    const regularityDate = getRegularityDate(row, academicStatus)
    const regularityYear = getRegularityYear(row)
    const finalDate = getFinalDate(row, academicStatus)

    enrollments.push({
      id: enrollmentId,
      profile_id: user?.id,
      student_id: user?.id,
      institution_id: institutionId,
      program_id: getSubjectProgramId(subject) || programId,
      canonical_program_id: getSubjectProgramId(subject) || programId,
      subject_id: getSubjectCanonicalId(subject) || code,
      canonical_subject_id: getSubjectCanonicalId(subject) || code,
      portal_subject_id: getSubjectPortalId(subject),
      status,
      academic_status: academicStatus,
      enrolled_at: getFirst(row, ['created_at', 'enrolled_at']) || null,
      regularity_date: regularityDate || null,
      regular_year: regularityYear || null,
      final_date: finalDate || null,
      subject,
    })

    const score = parseScore(row)
    const isAbsent = ['1', 'si', 'true', 'x'].includes(normalizeText(getFirst(row, ['ausente', 'absent'])))
    if (score !== null || isAbsent) {
      grades.push({
        id: clean(row.grade_id) || `snapshot-grade-${enrollmentId}`,
        enrollment_id: enrollmentId,
        grade_type: 'final',
        score,
        max_score: 10,
        graded_at: finalDate || getFirst(row, ['graded_at', 'updated_at']) || null,
        final_date: finalDate || null,
        regularity_date: regularityDate || null,
        regular_year: regularityYear || null,
        subject_id: getSubjectCanonicalId(subject) || code,
        program_id: getSubjectProgramId(subject) || programId,
        academic_status: academicStatus,
        ausente: isAbsent,
        fecha_ausencia: getFirst(row, ['fecha_ausencia', 'absence_date', 'absent_at']) || null,
      })
    }
  })

  const snapshotGrades = normalizeSnapshotGrades(
    snapshot.grades,
    user,
    new Set(snapshotEnrollments.map((enrollment) => enrollment.id)),
  )

  return {
    enrollments: snapshotEnrollments.length ? snapshotEnrollments : enrollments,
    grades: snapshotGrades.length
      ? [...snapshotGrades, ...grades.filter((grade) => grade.ausente)]
      : grades,
  }
}

function normalizeStatusToken(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '')
}

function normalizeExamPublicationStatus(value) {
  const status = normalizeStatusToken(value)
  if (!status) return ''

  if ([
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
    'tribunalminimum',
  ].includes(status)) {
    return 'visible'
  }

  return status
}

function isStudentVisibleExam(row) {
  const rawStatus = getFirst(row, ['estado', 'status', 'publication_status', 'estadoFinal'])
  const status = normalizeExamPublicationStatus(rawStatus)

  if (status) return status === 'visible'
  if (row?.confirmada === false || row?.confirmed === false || row?.isOfficial === false) return false

  return true
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

function normalizeExamTimePart(value) {
  const rawTime = clean(value) || '08:00'
  const time = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)

  if (time) {
    const [, hour, minute, second = '00'] = time
    return `${hour.padStart(2, '0')}:${minute}:${second}`
  }

  return rawTime
}

function buildExamDate(row) {
  const date = normalizeExamDatePart(getFirst(row, ['exam_date', 'fechaIso', 'fecha_iso', 'date', 'fecha', 'fechaSugerida']))
  if (!date) return null
  if (date.includes('T')) return date

  const time = normalizeExamTimePart(getFirst(row, ['inicio', 'hora', 'time']))
  return `${date}T${time}`
}

function isGenericCareer(value) {
  return [
    '',
    'career',
    'carrera',
    'carrerageneral',
    'general',
    'program',
    'programa',
  ].includes(normalizeStatusToken(value))
}

function hasSubjectInCareer(row, subjects, career) {
  const code = getScheduleSubjectCode(row)
  const name = getScheduleSubjectName(row)

  return Boolean(
    findSubject(subjects, career, code) ||
    findSubject(subjects, career, name)
  )
}

function examMatchesSelectedCareer(row, subjects, selectedCareer, planCareers = []) {
  if (!selectedCareer) return true

  const rawCareer = getCareer(row)
  const carrera = resolveCareerAgainstPlan(rawCareer, planCareers) || rawCareer
  if (sameIdentity(carrera, selectedCareer)) return true

  return isGenericCareer(rawCareer) && hasSubjectInCareer(row, subjects, selectedCareer)
}

export function buildExams(cronograma, subjects, selectedCareer, institutionId, planCareers = []) {
  return asArray(cronograma)
    .filter(isStudentVisibleExam)
    .filter((row) => {
      const examType = clean(row.exam_type || row.tipoMesa).toLowerCase()
      const inscriptionMode = clean(row.inscription_mode).toLowerCase()
      return examType !== 'special' && examType !== 'especial' && inscriptionMode !== 'admin_only'
    })
    .filter((row) => examMatchesSelectedCareer(row, subjects, selectedCareer, planCareers))
    .map((row, index) => {
      const code = getScheduleSubjectCode(row)
      const subjectName = getScheduleSubjectName(row)
      const selectedCareerSubject = selectedCareer
        ? (findSubject(subjects, selectedCareer, code) ?? findSubject(subjects, selectedCareer, subjectName))
        : null
      const resolvedCareer = isGenericCareer(getCareer(row))
        ? ''
        : resolveCareerAgainstPlan(row.carrera, planCareers)
      const carrera = resolvedCareer || selectedCareerSubject?.carrera || selectedCareer || getCareer(row) || 'Carrera general'
      const subject = findSubject(subjects, carrera, code) ?? findSubject(subjects, carrera, subjectName) ?? selectedCareerSubject ?? {
        id: subjectIdFor(carrera, code || subjectName || index),
        portal_subject_id: subjectIdFor(carrera, code || subjectName || index),
        subject_id: code || subjectName || '',
        canonical_subject_id: code || subjectName || '',
        program_id: carrera,
        canonical_program_id: carrera,
        code,
        name: subjectName || code || 'Mesa de examen',
      }
      const examDate = buildExamDate(row)

      return {
        id: clean(row.id) || `snapshot-exam-${index}`,
        subject_id: getSubjectCanonicalId(subject) || code,
        canonical_subject_id: getSubjectCanonicalId(subject) || code,
        portal_subject_id: getSubjectPortalId(subject),
        program_id: getSubjectProgramId(subject) || carrera,
        canonical_program_id: getSubjectProgramId(subject) || carrera,
        institution_id: institutionId,
        exam_date: examDate,
        date: examDate,
        location: clean(row.aula) || 'A confirmar',
        max_students: Number(row.max_students) || 50,
        exam_type: clean(row.exam_type || row.tipoMesa) || 'regular',
        exam_call: clean(row.exam_call) || '',
        call_label: clean(row.llamado) || '',
        inscription_mode: clean(row.inscription_mode) || 'student_self_service',
        auto_enrollment_enabled: row.auto_enrollment_enabled !== false,
        subject,
        subject_name: subject.name,
        mesa: row.mesa,
        profesorTitular: row.profesorTitular,
      }
    })
}

function buildClassSchedules({ schedules, subjects, selectedCareer, studentYear, enrollments }) {
  const activeSubjectIds = new Set(
    asArray(enrollments)
      .filter((enrollment) => ['active', 'enrolled'].includes(normalizeEnrollmentStatus(enrollment.status)))
      .flatMap((enrollment) => [
        enrollment.subject_id,
        enrollment.canonical_subject_id,
        enrollment.subject?.subject_id,
        enrollment.subject?.canonical_subject_id,
        enrollment.subject?.id,
      ])
      .filter(Boolean),
  )
  const hasActiveSubjects = activeSubjectIds.size > 0

  return asArray(schedules)
    .flatMap((row, index) => {
      const career = resolveCareerAgainstPlan(getCareer(row), [selectedCareer]) || getCareer(row)
      if (selectedCareer && !sameIdentity(career, selectedCareer)) return []

      const subjectCode = getScheduleSubjectCode(row)
      const subject = findSubject(subjects, career, subjectCode) ?? findSubject(subjects, career, getScheduleSubjectName(row))
      const subjectId = getSubjectCanonicalId(subject) || subjectCode || getScheduleSubjectName(row) || String(index)
      const subjectYear = getSubjectYear(subject)

      if (hasActiveSubjects && !activeSubjectIds.has(subjectId)) return []
      if (!hasActiveSubjects && studentYear && subjectYear && !sameText(subjectYear, studentYear)) return []

      return [{
        id: clean(row.id) || `class-schedule-${index}`,
        day: clean(row.dia || row.day),
        start: clean(row.inicio || row.desde || row.start),
        end: clean(row.fin || row.hasta || row.end),
        classroom: clean(row.aula || row.sede || row.classroom || row.location),
        teacher: clean(row.profesor || row.docente || row.nombre),
        career,
        subject_id: subjectId,
        canonical_subject_id: subjectId,
        portal_subject_id: getSubjectPortalId(subject),
        subject_code: subject?.code || subjectCode,
        subject_name: subject?.name || getScheduleSubjectName(row) || subjectCode || 'Materia',
        subject_year: subjectYear,
        raw: row,
      }]
    })
    .sort((a, b) => (
      dayOrder(a.day) - dayOrder(b.day) ||
      clean(a.start).localeCompare(clean(b.start)) ||
      clean(a.subject_name).localeCompare(clean(b.subject_name), 'es', { sensitivity: 'base' })
    ))
}

function buildAcademicStatus(snapshot, enrollments, grades, user) {
  const explicitStatus = snapshot.academicStatus
    && typeof snapshot.academicStatus === 'object'
    && matchesStudent(snapshot.academicStatus, user)
    ? snapshot.academicStatus
    : null
  const finalScores = grades
    .filter((grade) => clean(grade.grade_type || grade.type || 'final') === 'final')
    .map((grade) => Number(grade.score ?? grade.grade_value ?? grade.final_grade))
    .filter(Number.isFinite)
  const completed = enrollments.filter((enrollment) => enrollment.status === 'completed')
  const average = finalScores.length
    ? finalScores.reduce((total, score) => total + score, 0) / finalScores.length
    : 0

  return {
    status: explicitStatus?.status ?? 'regular',
    average_grade: explicitStatus?.average_grade ?? average,
    total_credits_approved: explicitStatus?.total_credits_approved ?? completed.length,
    total_credits_enrolled: explicitStatus?.total_credits_enrolled ?? enrollments.length,
  }
}

function buildPrograms(students, selectedCareer, planCareers = []) {
  const programs = Array.from(new Set(
    students
      .map((student) => resolveCareerAgainstPlan(
        clean(getFirst(student, ['carrera', 'programa', 'program', 'career'])),
        planCareers,
      ))
      .filter(Boolean),
  )).map((career) => ({
    id: career,
    program_id: career,
    canonical_program_id: career,
    slug: slugify(career),
    name: career,
  }))

  if (programs.length > 0) {
    return programs
  }

  return [{
    id: selectedCareer,
    program_id: selectedCareer,
    canonical_program_id: selectedCareer,
    slug: slugify(selectedCareer),
    name: selectedCareer,
  }]
}

export function mapWorkspaceSnapshotToStudentStore({
  snapshot,
  user,
  activeInstitution,
  rosterRows = [],
  academicTransition = null,
  attendanceRecords = [],
}) {
  const students = asArray(rosterRows).length
    ? asArray(rosterRows)
    : asArray(snapshot.alumnos).concat(asArray(snapshot.students))
  const matchedStudents = students.filter((row) => matchesStudent(row, user))
  const matchedStudent = matchedStudents[0] ?? null
  const fullName = getStudentFullName(matchedStudent, user)
  const planCareers = getPlanCareers(snapshot.planesEstudio)
  const selectedCareer = resolveCareerAgainstPlan(
    clean(getFirst(matchedStudent, ['carrera', 'programa', 'program', 'career'])),
    planCareers,
  ) || getCareer(asArray(snapshot.planesEstudio)[0])
    || 'Carrera general'
  const programs = buildPrograms(matchedStudents, selectedCareer, planCareers)
  const program = programs[0]
  const subjects = buildSubjects(snapshot.planesEstudio, selectedCareer, planCareers)
  const prerequisites = buildPrerequisites(snapshot.correlatividades, subjects, selectedCareer, planCareers)
  const { enrollments, grades } = buildAcademicRows(
    snapshot,
    user,
    subjects,
    selectedCareer,
    activeInstitution?.id,
    program.id,
    planCareers,
  )
  const exams = buildExams(snapshot.cronograma, subjects, selectedCareer, activeInstitution?.id, planCareers)
  const classSchedules = buildClassSchedules({
    schedules: snapshot.horariosDocentes,
    subjects,
    selectedCareer,
    studentYear: getStudentYear(matchedStudent),
    enrollments,
  })

  return {
    currentStudent: {
      id: user?.id,
      profile_id: user?.id,
      user_id: user?.id,
      record_id: matchedStudent?.record_id ?? null,
      email: user?.email,
      full_name: fullName,
      first_name: clean(getFirst(matchedStudent, ['nombre', 'first_name'])) || user?.nombre || 'Alumno',
      last_name: clean(getFirst(matchedStudent, ['apellido', 'last_name'])),
      institution_id: activeInstitution?.id,
      role: 'student',
      raw: matchedStudent,
    },
    currentProgram: program,
    currentInstitution: activeInstitution,
    programs,
    subjects,
    prerequisites,
    enrollments,
    grades,
    attendanceRecords: asArray(attendanceRecords),
    exams,
    classSchedules,
    examEnrollments: normalizeSnapshotExamEnrollments(snapshot.examEnrollments, user),
    academicStatus: buildAcademicStatus(snapshot, enrollments, grades, user),
    accountStatus: snapshot.accountStatus ?? null,
    academicTransition,
    workspaceSnapshot: snapshot,
    rosterRows: students,
  }
}

export async function fetchStudentPortalData({ user, isRemoteSession, isSuperAdmin, activeInstitution: providedActiveInstitution = null }) {
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
    return mapWorkspaceSnapshotToStudentStore({
      snapshot: {},
      user,
      activeInstitution: null,
      rosterRows: [],
    })
  }

  const useSecureStudentRead = Boolean(isRemoteSession && !isSuperAdmin && isStudentPortalAccount(user))
  const [workspaceResult, studentRecords, academicOverlay, attendanceRecords, teacherNotices] = await Promise.all([
    useSecureStudentRead
      ? fetchStudentPortalSecureWorkspaceSnapshot({
          institutionId: activeInstitution.id,
          workspaceKey: STUDENT_WORKSPACE_KEY,
          useRemote: true,
        })
      : fetchWorkspaceSnapshot({
          institutionId: activeInstitution.id,
          workspaceKey: STUDENT_WORKSPACE_KEY,
          useRemote: Boolean(isRemoteSession),
          // El alumno nunca tiene ediciones locales propias que proteger (a
          // diferencia del admin, que puede tener cambios sin guardar en el
          // generador de cronograma). Si el navegador tiene una copia local
          // vieja/incompleta con fecha mas reciente, no debe tapar los datos
          // reales de Supabase.
          preferLocalWhenNewer: false,
        }),
    useSecureStudentRead
      ? Promise.resolve([])
      : fetchStudentRecords({
          institutionId: activeInstitution.id,
          workspaceKey: STUDENT_WORKSPACE_KEY,
          useRemote: Boolean(isRemoteSession),
        }),
    fetchAcademicRelationalSnapshotOverlay({
      institutionId: activeInstitution.id,
      workspaceKey: STUDENT_WORKSPACE_KEY,
      user,
      useRemote: Boolean(isRemoteSession),
    }),
    isRemoteSession
      ? fetchStudentAttendanceRecords({
          institutionId: activeInstitution.id,
          workspaceKey: STUDENT_WORKSPACE_KEY,
          studentId: user?.id,
        })
      : Promise.resolve([]),
    fetchStudentSubjectTeacherNotices({
      institutionId: activeInstitution.id,
      workspaceKey: STUDENT_WORKSPACE_KEY,
      useRemote: Boolean(isRemoteSession),
    }),
  ])
  const snapshot = workspaceResult?.snapshot ?? {}
  const rosterRows = studentRecords.map(mapStudentRecordToSnapshotRow)
  const effectiveSnapshot = overlaySnapshotWithRelationalAcademicData({
    snapshot,
    relationalData: academicOverlay.relationalData,
    transitionConfig: academicOverlay.transitionConfig,
  })

  const portalData = mapWorkspaceSnapshotToStudentStore({
    snapshot: effectiveSnapshot,
    user,
    activeInstitution,
    rosterRows,
    academicTransition: effectiveSnapshot.academicRelationalSource ?? null,
    attendanceRecords,
  })
  const noticeBySubject = new Map(teacherNotices.map((notice) => (
    [`${clean(notice.subjectId)}::${clean(notice.programId)}`, notice]
  )))
  portalData.subjects = portalData.subjects.map((subject) => ({
    ...subject,
    teacher_notice: noticeBySubject.get(`${clean(subject.canonical_subject_id || subject.subject_id || subject.code)}::${clean(subject.canonical_program_id || subject.program_id || portalData.currentProgram?.id)}`) ?? null,
  }))
  return portalData
}
