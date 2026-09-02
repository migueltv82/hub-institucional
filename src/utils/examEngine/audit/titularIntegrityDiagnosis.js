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
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeKey(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '')
}

function makeId(prefix, ...values) {
  const key = values.map(normalizeKey).filter(Boolean).join('-')
  return key ? `${prefix}-${key}` : ''
}

function normalizeNameAlias(value) {
  const tokens = normalizeText(value)
    .split(' ')
    .map(normalizeToken)
    .filter(Boolean)
    .sort()

  return tokens.length ? `namekey:${tokens.join(':')}` : ''
}

const TEACHER_ID_FIELDS = [
  'docenteId',
  'docente_id',
  'teacherId',
  'teacher_id',
  'teacherKey',
  'profesorId',
  'profesor_id',
  'id',
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
  'nombre',
  'name',
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

function hasValue(value) {
  return value !== undefined && value !== null && clean(value) !== ''
}

function readField(row = {}, aliases = []) {
  if (!row || typeof row !== 'object') return undefined

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && hasValue(row[alias])) return row[alias]
  }

  const wanted = new Set(aliases.map(normalizeToken))
  const entry = Object.entries(row).find(([key, value]) => wanted.has(normalizeToken(key)) && hasValue(value))
  return entry?.[1]
}

function firstValue(...values) {
  return values.find(hasValue)
}

function subjectCode(subject = {}) {
  return clean(firstValue(readField(subject, SUBJECT_CODE_FIELDS), subject.id))
}

function subjectName(subject = {}) {
  return clean(firstValue(readField(subject, SUBJECT_NAME_FIELDS), subjectCode(subject)))
}

function subjectCareer(subject = {}) {
  return clean(firstValue(readField(subject, CAREER_FIELDS), readField(subject, CAREER_ID_FIELDS)))
}

function subjectCareerId(subject = {}) {
  const career = subjectCareer(subject)
  return clean(firstValue(readField(subject, CAREER_ID_FIELDS), career ? makeId('career', career) : ''))
}

function subjectAliasKeys(subject = {}) {
  return [...new Set([
    ...SUBJECT_CODE_FIELDS.map((field) => readField(subject, [field])),
    ...SUBJECT_NAME_FIELDS.map((field) => readField(subject, [field])),
    subjectCode(subject),
    subjectName(subject),
  ].map(normalizeToken).filter(Boolean))]
}

function subjectCareerKeys(subject = {}) {
  const keys = [
    readField(subject, CAREER_ID_FIELDS),
    subjectCareerId(subject),
    subjectCareer(subject),
  ].map(normalizeToken).filter(Boolean)

  return [...new Set(keys.length ? keys : [''])]
}

function subjectMatchKeys(subject = {}) {
  const aliases = subjectAliasKeys(subject)
  if (!aliases.length) return []
  return subjectCareerKeys(subject).flatMap((careerKey) => aliases.map((alias) => `${careerKey}::${alias}`))
}

function teacherName(teacher = {}) {
  if (typeof teacher === 'string') return clean(teacher)
  return clean(firstValue(
    readField(teacher, TEACHER_NAME_FIELDS),
    [readField(teacher, ['nombre']), readField(teacher, ['apellido'])].map(clean).filter(Boolean).join(' '),
  ))
}

function teacherAliasValues(teacher = {}, id = '') {
  if (typeof teacher === 'string') return [id, teacher, normalizeNameAlias(teacher)].filter(Boolean)

  const name = teacherName(teacher)
  return [
    id,
    ...TEACHER_ID_FIELDS.map((field) => readField(teacher, [field])),
    ...TEACHER_NAME_FIELDS.map((field) => readField(teacher, [field])),
    readField(teacher, ['dni', 'documento', 'document']),
    readField(teacher, ['email', 'correo', 'mail']),
    name,
    normalizeNameAlias(name),
  ].map(clean).filter(Boolean)
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)
  return clean(firstValue(readField(docente, TEACHER_ID_FIELDS), docente.id, teacherName(docente)))
}

function buildTeacherLookup(docentes = []) {
  const lookup = new Map()
  const ids = new Set()

  asArray(docentes).forEach((docente) => {
    const id = getDocenteId(docente)
    if (!id) return
    ids.add(normalizeText(id))
    teacherAliasValues(docente, id).forEach((alias) => {
      const textKey = normalizeText(alias)
      const tokenKey = normalizeToken(alias)
      if (textKey) lookup.set(textKey, id)
      if (tokenKey) lookup.set(tokenKey, id)
    })
  })

  return { lookup, ids }
}

function resolveTeacherId(row = {}, teacherLookup = new Map()) {
  for (const alias of teacherAliasValues(row)) {
    const id = teacherLookup.get(normalizeText(alias)) ?? teacherLookup.get(normalizeToken(alias))
    if (id) return id
  }

  const fallback = clean(firstValue(
    readField(row, TEACHER_ID_FIELDS),
    teacherName(row),
  ))
  return fallback
}

function addAssignment(assignments, key, docenteId) {
  if (!key || !docenteId) return
  const set = assignments.get(key) ?? new Set()
  set.add(docenteId)
  assignments.set(key, set)
}

function buildSourceAssignments(snapshot = {}, teacherLookup = new Map()) {
  const assignments = new Map()

  asArray(snapshot.horariosDocentes).forEach((horario) => {
    const docenteId = resolveTeacherId(horario, teacherLookup)
    if (!docenteId) return
    subjectMatchKeys(horario).forEach((key) => addAssignment(assignments, key, docenteId))
    subjectAliasKeys(horario).forEach((key) => addAssignment(assignments, `subject::${key}`, docenteId))
  })

  return assignments
}

function assignedTeachersForSubject(subject = {}, assignments = new Map()) {
  const ids = new Set()
  subjectMatchKeys(subject).forEach((key) => {
    const values = assignments.get(key)
    if (!values) return
    values.forEach((value) => ids.add(value))
  })
  if (!ids.size) {
    subjectAliasKeys(subject).forEach((key) => {
      const values = assignments.get(`subject::${key}`)
      if (!values) return
      values.forEach((value) => ids.add(value))
    })
  }
  return [...ids]
}

function exampleForSubject(subject = {}, docentesCount = 0, estado = '', motivo = '') {
  return {
    carrera: normalizeText(subjectCareer(subject)) || 'sin carrera',
    materia: normalizeText(subjectName(subject)) || 'sin materia',
    cantidadDocentes: docentesCount,
    estado,
    motivo,
  }
}

function isDiscursivePracticeSubject(subject = {}) {
  const name = normalizeText(subjectName(subject))
  return name.includes('practicas discursivas iii') || name.includes('practicas discursivas iv')
}

export function isProfessionalPracticeSubject(subject = {}) {
  if (isDiscursivePracticeSubject(subject)) return false

  const name = normalizeText(subjectName(subject))
  return (
    name.includes('practica profesional') ||
    name.includes('practicas profesionales') ||
    name.includes('practica docente') ||
    name.includes('residencia') ||
    name.includes('practica profesionalizante')
  )
}

function subjectRequiresMesa(subject = {}) {
  return subject.requiereMesa !== false
}

function collectGeneratedMesas(contract = {}) {
  const preview = contract.preview ?? {}
  return [
    ...asArray(preview.plannedMesas),
    ...asArray(preview.unassignedMesas),
  ]
}

function mesaSubjectRows(mesa = {}, materiaByKey = new Map()) {
  const grouped = asArray(mesa.materiasAgrupadas)
  if (grouped.length) return grouped

  const found = subjectMatchKeys(mesa)
    .map((key) => materiaByKey.get(key))
    .find(Boolean)

  return found ? [found] : [mesa]
}

function buildMateriaByKey(materias = []) {
  const map = new Map()
  asArray(materias).forEach((materia) => {
    subjectMatchKeys(materia).forEach((key) => {
      if (!map.has(key)) map.set(key, materia)
    })
  })
  return map
}

function getMesaTitularIds(mesa = {}) {
  const titulares = asArray(mesa.titularesInvolucrados).length
    ? asArray(mesa.titularesInvolucrados)
    : [mesa.titularId ?? mesa.titular_id]

  return [...new Set(titulares.map(clean).filter(Boolean))]
}

function getMesaVocalIds(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].map(clean).filter(Boolean)
}

function titularMatchesAnyUniqueSubject(titularIds = [], subjects = [], assignments = new Map()) {
  return subjects.some((subject) => {
    const assigned = assignedTeachersForSubject(subject, assignments)
    return assigned.length === 1 && titularIds.some((titularId) => normalizeText(titularId) === normalizeText(assigned[0]))
  })
}

function titularMatchesAnyHorario(titularIds = [], subjects = [], assignments = new Map()) {
  return subjects.some((subject) => {
    const assigned = assignedTeachersForSubject(subject, assignments)
    return assigned.some((docenteId) => titularIds.some((titularId) => normalizeText(titularId) === normalizeText(docenteId)))
  })
}

function finalStatus({ mesasSinTitular, mesasTitularInvalido, materiasNoPracticasMasDeUnDocente, materiasSinDocente }) {
  if (mesasSinTitular > 0 || mesasTitularInvalido > 0) return 'TITULARIDAD_CRITICA'
  if (materiasNoPracticasMasDeUnDocente > 0 || materiasSinDocente > 0) return 'TITULARIDAD_CON_OBSERVACIONES'
  return 'TITULARIDAD_OK'
}

function correctionRecommendation(result) {
  if (result.resumen.mesasSinTitular > 0) return 'adaptador: bloquear o completar mesas sin titular antes de planificar.'
  if (result.validacionInstitucional.mesasTitularNoExisteEnDocentesAdaptados.total > 0) return 'adaptador/datos fuente: normalizar docentes y horarios para que el titular exista en docentes adaptados.'
  if (result.validacionInstitucional.mesasTitularComoVocal.total > 0) return 'algoritmo: impedir que titulares involucrados queden como vocales de la misma mesa.'
  if (result.validacionInstitucional.materiasNoPracticasConMasDeUnDocente.total > 0) return 'datos fuente/regla institucional: revisar materias no practicas con mas de un docente asignado.'
  if (result.validacionInstitucional.materiasConCeroDocentes.total > 0) return 'datos fuente/modulo docente: cargar horarios o docente titular para materias sin docente.'
  return 'sin correccion obligatoria de titularidad.'
}

export function buildTitularIntegrityDiagnosis({ snapshot = {}, input = {}, contract = {} } = {}) {
  const materias = asArray(input.materias)
  const docentes = asArray(input.docentes)
  const teacherData = buildTeacherLookup(docentes)
  const assignments = buildSourceAssignments(snapshot, teacherData.lookup)
  const materiaByKey = buildMateriaByKey(materias)
  const generatedMesas = collectGeneratedMesas(contract)

  const subjectRows = materias.map((materia) => {
    const assignedDocentes = assignedTeachersForSubject(materia, assignments)
    return {
      materia,
      assignedDocentes,
      isProfessionalPractice: isProfessionalPracticeSubject(materia),
      requiresMesa: subjectRequiresMesa(materia),
    }
  })

  const materiasUnDocente = subjectRows.filter((row) => row.assignedDocentes.length === 1)
  const materiasMasDeUnDocente = subjectRows.filter((row) => row.assignedDocentes.length > 1)
  const materiasSinDocente = subjectRows.filter((row) => row.assignedDocentes.length === 0)
  const nonPracticeMulti = materiasMasDeUnDocente.filter((row) => !row.isProfessionalPractice)
  const practiceMulti = materiasMasDeUnDocente.filter((row) => row.isProfessionalPractice)

  let mesasConTitular = 0
  let mesasSinTitular = 0
  let mesasTitularDerivadoUnico = 0
  let mesasTitularDerivadoHorario = 0
  let mesasTitularInvalido = 0
  const mesasSinTitularExamples = []
  const titularMissingExamples = []
  const titularAsVocalExamples = []

  generatedMesas.forEach((mesa) => {
    const titularIds = getMesaTitularIds(mesa)
    const subjects = mesaSubjectRows(mesa, materiaByKey)
    const vocalKeys = new Set(getMesaVocalIds(mesa).map(normalizeText))
    const hasTitular = titularIds.length > 0
    const titularMissing = titularIds.some((titularId) => !teacherData.ids.has(normalizeText(titularId)))
    const titularAsVocal = titularIds.some((titularId) => vocalKeys.has(normalizeText(titularId)))

    if (hasTitular) mesasConTitular += 1
    else {
      mesasSinTitular += 1
      mesasSinTitularExamples.push(exampleForSubject(subjects[0], 0, mesa.estado ?? 'sin_estado', 'mesa_sin_titular'))
    }

    if (hasTitular && titularMatchesAnyUniqueSubject(titularIds, subjects, assignments)) mesasTitularDerivadoUnico += 1
    if (hasTitular && titularMatchesAnyHorario(titularIds, subjects, assignments)) mesasTitularDerivadoHorario += 1

    if (!hasTitular || titularMissing || titularAsVocal) {
      mesasTitularInvalido += 1
      if (titularMissing) {
        titularMissingExamples.push(exampleForSubject(subjects[0], 0, mesa.estado ?? 'sin_estado', 'titular_no_existe_en_docentes_adaptados'))
      }
      if (titularAsVocal) {
        titularAsVocalExamples.push(exampleForSubject(subjects[0], 0, mesa.estado ?? 'sin_estado', 'titular_tambien_figura_como_vocal'))
      }
    }
  })

  const result = {
    resumen: {
      totalMateriasPlan: materias.length,
      materiasRequierenMesa: subjectRows.filter((row) => row.requiresMesa).length,
      materiasConUnSoloDocenteAsignado: materiasUnDocente.length,
      materiasConMasDeUnDocenteAsignado: materiasMasDeUnDocente.length,
      materiasSinDocenteAsignado: materiasSinDocente.length,
      totalMesasGeneradas: generatedMesas.length,
      mesasConTitular,
      mesasSinTitular,
      mesasConTitularDerivadoDesdeUnicoDocente: mesasTitularDerivadoUnico,
      mesasConTitularDerivadoDesdeHorarioDocente: mesasTitularDerivadoHorario,
      mesasConTitularInvalido: mesasTitularInvalido,
    },
    validacionInstitucional: {
      materiasNoPracticasConMasDeUnDocente: {
        total: nonPracticeMulti.length,
        ejemplos: nonPracticeMulti.slice(0, 20).map((row) => exampleForSubject(row.materia, row.assignedDocentes.length, 'observacion', 'materia_no_practica_con_mas_de_un_docente')),
      },
      practicasProfesionalesConMasDeUnDocente: {
        total: practiceMulti.length,
        ejemplos: practiceMulti.slice(0, 20).map((row) => exampleForSubject(row.materia, row.assignedDocentes.length, 'ok_excepcion', 'practica_profesional_multi_docente')),
      },
      materiasConCeroDocentes: {
        total: materiasSinDocente.length,
        ejemplos: materiasSinDocente.slice(0, 20).map((row) => exampleForSubject(row.materia, 0, row.requiresMesa ? 'critica' : 'observacion', 'materia_sin_docente_asignado')),
      },
      mesasTitularNoExisteEnDocentesAdaptados: {
        total: titularMissingExamples.length,
        ejemplos: titularMissingExamples.slice(0, 20),
      },
      mesasSinTitular: {
        total: mesasSinTitular,
        ejemplos: mesasSinTitularExamples.slice(0, 20),
      },
      mesasTitularComoVocal: {
        total: titularAsVocalExamples.length,
        ejemplos: titularAsVocalExamples.slice(0, 20),
      },
    },
    resultadoFinal: '',
    correccionConcreta: '',
  }

  result.resultadoFinal = finalStatus({
    mesasSinTitular,
    mesasTitularInvalido,
    materiasNoPracticasMasDeUnDocente: nonPracticeMulti.length,
    materiasSinDocente: materiasSinDocente.length,
  })
  result.correccionConcreta = correctionRecommendation(result)

  return result
}
