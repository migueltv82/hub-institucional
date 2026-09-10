export const DOCENTE_MATERIA_ROLES = Object.freeze({
  TITULAR: 'TITULAR',
  REEMPLAZO: 'REEMPLAZO',
  SUPLENTE: 'SUPLENTE',
  CO_DOCENTE: 'CO_DOCENTE',
  AUXILIAR: 'AUXILIAR',
})

export const DOCENTE_MATERIA_ESTADOS = Object.freeze({
  ACTIVO: 'ACTIVO',
  LICENCIA: 'LICENCIA',
  RENUNCIA: 'RENUNCIA',
  BAJA: 'BAJA',
  REEMPLAZADO: 'REEMPLAZADO',
})

export const DOCENTE_MATERIA_RESOLUTION_STATUS = Object.freeze({
  TITULAR_ACTIVO: 'TITULAR_ACTIVO',
  REEMPLAZO_ACTIVO: 'REEMPLAZO_ACTIVO',
  TITULAR_INFERIDO: 'TITULAR_INFERIDO',
  AMBIGUO_REQUIERE_REVISION: 'AMBIGUO_REQUIERE_REVISION',
  SIN_TITULAR_VIGENTE: 'SIN_TITULAR_VIGENTE',
  SIN_ASIGNACIONES: 'SIN_ASIGNACIONES',
})

const ROLE_ALIASES = {
  titular: DOCENTE_MATERIA_ROLES.TITULAR,
  titularvocal: DOCENTE_MATERIA_ROLES.TITULAR,
  titularvocalafin: DOCENTE_MATERIA_ROLES.TITULAR,
  titularyvocal: DOCENTE_MATERIA_ROLES.TITULAR,
  titularyvocalafin: DOCENTE_MATERIA_ROLES.TITULAR,
  profesortitular: DOCENTE_MATERIA_ROLES.TITULAR,
  docentetitular: DOCENTE_MATERIA_ROLES.TITULAR,
  reemplazo: DOCENTE_MATERIA_ROLES.REEMPLAZO,
  suplente: DOCENTE_MATERIA_ROLES.SUPLENTE,
  codocente: DOCENTE_MATERIA_ROLES.CO_DOCENTE,
  codocencia: DOCENTE_MATERIA_ROLES.CO_DOCENTE,
  auxiliar: DOCENTE_MATERIA_ROLES.AUXILIAR,
}

const STATUS_ALIASES = {
  activo: DOCENTE_MATERIA_ESTADOS.ACTIVO,
  activa: DOCENTE_MATERIA_ESTADOS.ACTIVO,
  licencia: DOCENTE_MATERIA_ESTADOS.LICENCIA,
  conlicencia: DOCENTE_MATERIA_ESTADOS.LICENCIA,
  renuncia: DOCENTE_MATERIA_ESTADOS.RENUNCIA,
  renunciado: DOCENTE_MATERIA_ESTADOS.RENUNCIA,
  baja: DOCENTE_MATERIA_ESTADOS.BAJA,
  inactivo: DOCENTE_MATERIA_ESTADOS.BAJA,
  reemplazado: DOCENTE_MATERIA_ESTADOS.REEMPLAZADO,
  reemplazada: DOCENTE_MATERIA_ESTADOS.REEMPLAZADO,
}

const SUBJECT_CODE_FIELDS = [
  'materia',
  'codigo',
  'code',
  'materiaCodigo',
  'materia_codigo',
  'codigoMateria',
  'codigo_materia',
  'subjectCode',
  'subject_code',
  'materiaId',
  'materia_id',
]

const SUBJECT_NAME_FIELDS = [
  'nombreMateria',
  'nombre_materia',
  'materiaNombre',
  'materia_nombre',
  'subjectName',
  'subject_name',
  'asignatura',
  'nombreAsignatura',
  'nombre_asignatura',
  'nombre',
  'name',
  'materia',
]

const CAREER_FIELDS = ['carrera', 'programa', 'program', 'career', 'nombreCarrera', 'nombre_carrera', 'careerName']
const TEACHER_ID_FIELDS = ['docenteId', 'docente_id', 'teacherId', 'teacher_id', 'teacherKey', 'profesorId', 'profesor_id']
const TEACHER_NAME_FIELDS = [
  'docente',
  'profesor',
  'docenteNombre',
  'docente_nombre',
  'nombreDocente',
  'nombre_docente',
  'teacherName',
  'teacher_name',
  'full_name',
  'fullName',
  'display_name',
  'displayName',
  'nombreCompleto',
  'nombre_completo',
  'apellidoNombre',
  'apellido_nombre',
]
const TEACHER_DOCUMENT_FIELDS = ['dni_docente', 'dniDocente', 'dni', 'documento', 'document', 'documentNumber']

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function hasValue(value) {
  return value !== undefined && value !== null && clean(value) !== ''
}

export function normalizeDocenteMateriaText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeDocenteMateriaText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function isUnconfirmedInferredDocenteMateria(row = {}) {
  const role = normalizeDocenteMateriaText(firstValue(row.rol_en_materia, row.rolEnMateria, row.rol, row.role))
  const confidence = normalizeDocenteMateriaText(firstValue(row.nivel_confianza, row.nivelConfianza, row.confidence))
  const reviewRequired = normalizeDocenteMateriaText(firstValue(row.requiere_revision, row.requiereRevision))
  const uniqueTeacherInferenceConfirmed = role.includes('titular') &&
    confidence === 'alta' &&
    ['no', 'false', '0'].includes(reviewRequired)

  if (uniqueTeacherInferenceConfirmed) return false

  const source = normalizeDocenteMateriaText(firstValue(row.source, row.origen, row.fuente))
  const observations = normalizeDocenteMateriaText(firstValue(
    row.observaciones,
    row.observacion,
    row.observation,
    row.notes,
  ))
  const confirmed = observations.includes('confirmado') ||
    observations.includes('declarado') ||
    observations.includes('no inferido')

  if (confirmed) return false

  return (
    observations.includes('titular inferido') ||
    observations.includes('titularidad inferida') ||
    observations.includes('detectado desde horarios') ||
    (source.includes('horarios') && source.includes('docentes'))
  )
}

function normalizeFieldName(value) {
  return normalizeToken(value)
}

function readField(row = {}, aliases = []) {
  if (!row || typeof row !== 'object') return undefined

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && hasValue(row[alias])) return row[alias]
  }

  const wanted = new Set(aliases.map(normalizeFieldName))
  const entry = Object.entries(row).find(([key, value]) => wanted.has(normalizeFieldName(key)) && hasValue(value))
  return entry?.[1]
}

function firstValue(...values) {
  return values.find(hasValue)
}

function uniqueValues(values) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function subjectCode(row = {}) {
  return clean(firstValue(readField(row, SUBJECT_CODE_FIELDS), row.id))
}

function subjectName(row = {}) {
  return clean(firstValue(readField(row, SUBJECT_NAME_FIELDS), subjectCode(row)))
}

function subjectCareer(row = {}) {
  return clean(readField(row, CAREER_FIELDS))
}

function subjectAliasKeys(row = {}) {
  return uniqueValues([
    ...SUBJECT_CODE_FIELDS.map((field) => readField(row, [field])),
    ...SUBJECT_NAME_FIELDS.map((field) => readField(row, [field])),
    subjectCode(row),
    subjectName(row),
  ]).map(normalizeToken).filter(Boolean)
}

function careerKey(row = {}) {
  return normalizeToken(subjectCareer(row))
}

function explicitSubjectId(row = {}) {
  return clean(readField(row, ['materia_id', 'materiaId', 'subject_id', 'subjectId']))
}

function teacherName(row = {}) {
  return clean(firstValue(
    readField(row, TEACHER_NAME_FIELDS),
    [readField(row, ['nombre']), readField(row, ['apellido'])].map(clean).filter(Boolean).join(' '),
  ))
}

function teacherDocument(row = {}) {
  return clean(readField(row, TEACHER_DOCUMENT_FIELDS))
}

function explicitTeacherId(row = {}) {
  return clean(readField(row, TEACHER_ID_FIELDS))
}

function lookupTeacherId(teacherNameToId = {}, value) {
  return teacherNameToId[normalizeDocenteMateriaText(value)] ?? teacherNameToId[normalizeToken(value)] ?? ''
}

function resolveTeacherId(row = {}, teacherNameToId = {}) {
  const aliases = uniqueValues([
    explicitTeacherId(row),
    teacherDocument(row),
    teacherName(row),
  ])

  for (const alias of aliases) {
    const id = lookupTeacherId(teacherNameToId, alias)
    if (id) return id
  }

  return explicitTeacherId(row)
}

export function normalizeDocenteMateriaRole(value) {
  const key = normalizeToken(value)
  return ROLE_ALIASES[key] ?? ''
}

export function normalizeDocenteMateriaEstado(value) {
  const key = normalizeToken(value)
  if (!key) return DOCENTE_MATERIA_ESTADOS.ACTIVO
  return STATUS_ALIASES[key] ?? ''
}

function readEstado(row = {}) {
  return normalizeDocenteMateriaEstado(readField(row, [
    'estado_asignacion',
    'estadoAsignacion',
    'estado',
    'status',
    'situacion',
  ]))
}

function parseDate(value) {
  const text = clean(value)
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return Number.NaN
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? Number.NaN : date
}

function isInvalidDate(value) {
  return typeof value === 'number' && Number.isNaN(value)
}

function isWithinVigencia(row = {}, referenceDate) {
  const reference = parseDate(referenceDate) || new Date()
  if (isInvalidDate(reference)) return false

  const from = parseDate(readField(row, ['vigencia_desde', 'vigenciaDesde', 'desde']))
  const to = parseDate(readField(row, ['vigencia_hasta', 'vigenciaHasta', 'hasta']))

  if (isInvalidDate(from) || isInvalidDate(to)) return false
  if (from && reference < from) return false
  if (to && reference > to) return false
  return true
}

function readRequiresMesa(row = {}) {
  const value = readField(row, ['requiere_mesa', 'requiereMesa', 'requiere mesa', 'requiresMesa', 'requiresmesa'])
  const normalized = normalizeToken(value)
  if (value === false || value === 0 || ['no', 'false', '0'].includes(normalized)) return false
  if (value === true || value === 1 || ['si', 'true', '1'].includes(normalized)) return true
  return undefined
}

export function isProfessionalPracticeSubject(subject = {}) {
  const carrera = normalizeDocenteMateriaText(subjectCareer(subject))
  const name = normalizeDocenteMateriaText(subjectName(subject))
  const isProfesorado = carrera.includes('profesorado')
  const isDiscursive = (name.includes('discursivas') || name.includes('discrusivas')) &&
    (/\biii\b/.test(name) || /\biv\b/.test(name))

  if (!isProfesorado || isDiscursive) return false

  return (
    name.includes('practica profesional') ||
    name.includes('practicas profesionales') ||
    name.includes('practica docente') ||
    name.includes('residencia')
  )
}

function assignmentMatchesPlan(assignment = {}, plan = {}) {
  const assignmentSubjectId = explicitSubjectId(assignment)
  const planSubjectId = explicitSubjectId(plan)
  if (assignmentSubjectId && planSubjectId) {
    return normalizeToken(assignmentSubjectId) === normalizeToken(planSubjectId)
  }

  const assignmentCareer = careerKey(assignment)
  const planCareer = careerKey(plan)
  if (assignmentCareer && planCareer && assignmentCareer !== planCareer) return false

  const planSubjects = new Set(subjectAliasKeys(plan))
  return subjectAliasKeys(assignment).some((key) => planSubjects.has(key))
}

function normalizeAssignment(row = {}, { teacherNameToId = {}, referenceDate } = {}) {
  const inferredFromSchedule = isUnconfirmedInferredDocenteMateria(row)
  const rawRole = inferredFromSchedule ? '' : clean(readField(row, ['rol_en_materia', 'rolEnMateria', 'rol', 'role']))
  const role = normalizeDocenteMateriaRole(rawRole)
  const estado = readEstado(row)
  const vigente = isWithinVigencia(row, referenceDate)

  return {
    row,
    role,
    roleProvided: Boolean(rawRole),
    inferredFromSchedule,
    estado,
    vigente,
    active: estado === DOCENTE_MATERIA_ESTADOS.ACTIVO && vigente,
    teacherId: resolveTeacherId(row, teacherNameToId),
    requiereMesa: readRequiresMesa(row),
    source: inferredFromSchedule
      ? 'docente_materia_inferida_desde_horarios'
      : clean(row.source) || 'docente_materia',
  }
}

function buildResolution({
  status,
  titularId = '',
  source = 'requiere_revision',
  match = 'docente_materia',
  matchedAssignments = [],
  requiresMesa,
}) {
  return {
    status,
    titularId,
    source,
    match,
    matchedAssignmentsCount: matchedAssignments.length,
    hasInferredFromScheduleAssignments: matchedAssignments.some((assignment) => assignment.inferredFromSchedule),
    requiresMesa,
  }
}

function uniqueAssignmentsByTeacher(assignments = []) {
  const seen = new Set()

  return assignments.filter((assignment, index) => {
    const teacherKey = assignment.teacherId
      ? `id:${assignment.teacherId}`
      : `unresolved:${normalizeToken(teacherName(assignment.row)) || index}`
    if (seen.has(teacherKey)) return false
    seen.add(teacherKey)
    return true
  })
}

export function resolveDocenteMateriaAssignment({
  plan = {},
  assignments = [],
  teacherNameToId = {},
  referenceDate,
} = {}) {
  const matchedAssignments = asArray(assignments)
    .filter((assignment) => assignmentMatchesPlan(assignment, plan))
    .map((assignment) => normalizeAssignment(assignment, { teacherNameToId, referenceDate }))

  if (!matchedAssignments.length) {
    return buildResolution({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_ASIGNACIONES,
      source: 'horariosDocentes',
      match: 'fallback_sin_docente_materia',
      matchedAssignments,
    })
  }

  const requiresMesa = matchedAssignments.find((assignment) => assignment.requiereMesa !== undefined)?.requiereMesa
  const activeTitulares = uniqueAssignmentsByTeacher(matchedAssignments.filter((assignment) => (
    assignment.role === DOCENTE_MATERIA_ROLES.TITULAR && assignment.active
  )))

  if (activeTitulares.length === 1 && activeTitulares[0].teacherId) {
    return buildResolution({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_ACTIVO,
      titularId: activeTitulares[0].teacherId,
      source: activeTitulares[0].source,
      matchedAssignments,
      requiresMesa,
    })
  }

  if (activeTitulares.length > 1) {
    return buildResolution({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.AMBIGUO_REQUIERE_REVISION,
      matchedAssignments,
      requiresMesa,
    })
  }

  const activeReplacements = uniqueAssignmentsByTeacher(matchedAssignments.filter((assignment) => (
    assignment.role === DOCENTE_MATERIA_ROLES.REEMPLAZO && assignment.active
  )))

  if (activeReplacements.length === 1 && activeReplacements[0].teacherId) {
    return buildResolution({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.REEMPLAZO_ACTIVO,
      titularId: activeReplacements[0].teacherId,
      source: activeReplacements[0].source,
      match: 'reemplazo_activo',
      matchedAssignments,
      requiresMesa,
    })
  }

  if (activeReplacements.length > 1) {
    return buildResolution({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.AMBIGUO_REQUIERE_REVISION,
      matchedAssignments,
      requiresMesa,
    })
  }

  const activeWithoutRole = uniqueAssignmentsByTeacher(
    matchedAssignments.filter((assignment) => (
      !assignment.inferredFromSchedule &&
      !assignment.role &&
      !assignment.roleProvided &&
      assignment.active
    )),
  )

  if (activeWithoutRole.length === 1 && activeWithoutRole[0].teacherId) {
    return buildResolution({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_INFERIDO,
      titularId: activeWithoutRole[0].teacherId,
      source: activeWithoutRole[0].source === 'docente_materia'
        ? 'inferido_unico_docente'
        : activeWithoutRole[0].source,
      matchedAssignments,
      requiresMesa,
    })
  }

  if (activeWithoutRole.length > 1 && isProfessionalPracticeSubject(plan) && activeWithoutRole[0].teacherId) {
    return buildResolution({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.TITULAR_INFERIDO,
      titularId: activeWithoutRole[0].teacherId,
      source: 'inferido_practica_profesional_cotitular',
      match: 'practica_profesional_multidocente',
      matchedAssignments,
      requiresMesa,
    })
  }

  if (activeWithoutRole.length > 1) {
    return buildResolution({
      status: DOCENTE_MATERIA_RESOLUTION_STATUS.AMBIGUO_REQUIERE_REVISION,
      matchedAssignments,
      requiresMesa,
    })
  }

  return buildResolution({
    status: DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_TITULAR_VIGENTE,
    matchedAssignments,
    requiresMesa,
  })
}

export function buildDocenteMateriaAssignmentSummary(assignments = [], { referenceDate } = {}) {
  const normalized = asArray(assignments).map((assignment) => normalizeAssignment(assignment, { referenceDate }))

  return {
    totalAsignacionesDocenteMateria: normalized.length,
    titularesExplicitos: normalized.filter((assignment) => assignment.role === DOCENTE_MATERIA_ROLES.TITULAR).length,
    reemplazosActivos: normalized.filter((assignment) => (
      assignment.role === DOCENTE_MATERIA_ROLES.REEMPLAZO && assignment.active
    )).length,
    licencias: normalized.filter((assignment) => assignment.estado === DOCENTE_MATERIA_ESTADOS.LICENCIA).length,
    renuncias: normalized.filter((assignment) => assignment.estado === DOCENTE_MATERIA_ESTADOS.RENUNCIA).length,
  }
}
