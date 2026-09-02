import { parseDocenteMateriaRows } from '../comparison/parseDocenteMateriaRows.js'

export const DOCENTE_MATERIA_CANDIDATE_COLUMNS = [
  'carrera',
  'materia_codigo',
  'materia_nombre',
  'anio',
  'docente',
  'dni_docente',
  'rol_en_materia',
  'estado_asignacion',
  'vigencia_desde',
  'vigencia_hasta',
  'docente_reemplazado',
  'requiere_mesa',
  'observaciones',
  'origen',
  'nivel_confianza',
  'requiere_revision',
  'motivo_revision',
]

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
  'id',
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
const CAREER_ID_FIELDS = ['carreraId', 'carrera_id', 'careerId', 'career_id', 'programaId', 'programId']
const YEAR_FIELDS = ['anio', 'ano', 'year', 'nivel', 'curso']
const TEACHER_ID_FIELDS = ['docenteId', 'docente_id', 'teacherId', 'teacher_id', 'teacherKey', 'profesorId', 'profesor_id', 'id']
const TEACHER_NAME_FIELDS = [
  'profesor',
  'docente',
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
  'nombre',
  'name',
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

function subjectCode(row = {}) {
  return clean(firstValue(readField(row, SUBJECT_CODE_FIELDS), row.id))
}

function subjectName(row = {}) {
  return clean(firstValue(readField(row, SUBJECT_NAME_FIELDS), subjectCode(row)))
}

function subjectCareer(row = {}) {
  return clean(firstValue(readField(row, CAREER_FIELDS), readField(row, CAREER_ID_FIELDS)))
}

function subjectYear(row = {}) {
  return clean(firstValue(readField(row, YEAR_FIELDS)))
}

function subjectAliasKeys(row = {}) {
  return [...new Set([
    ...SUBJECT_CODE_FIELDS.map((field) => readField(row, [field])),
    ...SUBJECT_NAME_FIELDS.map((field) => readField(row, [field])),
    subjectCode(row),
    subjectName(row),
  ].map(normalizeToken).filter(Boolean))]
}

function careerAliasKeys(row = {}) {
  const keys = [
    readField(row, CAREER_ID_FIELDS),
    subjectCareer(row),
  ].map(normalizeToken).filter(Boolean)

  return [...new Set(keys.length ? keys : [''])]
}

function subjectMatchKeys(row = {}) {
  const aliases = subjectAliasKeys(row)
  if (!aliases.length) return []
  return careerAliasKeys(row).flatMap((careerKey) => aliases.map((alias) => `${careerKey}::${alias}`))
}

function subjectOnlyKeys(row = {}) {
  return subjectAliasKeys(row).map((key) => `subject::${key}`)
}

function teacherName(row = {}) {
  if (typeof row === 'string') return clean(row)
  return clean(firstValue(
    readField(row, TEACHER_NAME_FIELDS),
    [readField(row, ['nombre']), readField(row, ['apellido'])].map(clean).filter(Boolean).join(' '),
  ))
}

function teacherDocument(row = {}) {
  return clean(readField(row, TEACHER_DOCUMENT_FIELDS))
}

function teacherAliasValues(row = {}) {
  const name = teacherName(row)
  return [
    ...TEACHER_ID_FIELDS.map((field) => readField(row, [field])),
    ...TEACHER_DOCUMENT_FIELDS.map((field) => readField(row, [field])),
    ...TEACHER_NAME_FIELDS.map((field) => readField(row, [field])),
    name,
  ].map(clean).filter(Boolean)
}

function teacherKey(row = {}) {
  const document = teacherDocument(row)
  if (document) return `dni:${normalizeToken(document)}`
  const name = teacherName(row)
  if (name) return `name:${normalizeText(name)}`
  return ''
}

function simpleHash(value) {
  const text = clean(value)
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36).padStart(6, '0').slice(0, 6)
}

function docenteAnonId(row = {}) {
  const source = teacherKey(row) || JSON.stringify(Object.keys(row).sort())
  return `doc-${simpleHash(source)}`
}

function isDiscursivePracticeSubject(row = {}) {
  const name = normalizeText(subjectName(row))
  const isDiscursive = name.includes('discursivas') || name.includes('discursiva') || name.includes('discrusivas')
  return isDiscursive && (/\biii\b/.test(name) || /\biv\b/.test(name))
}

function isProfessionalPracticeSubject(row = {}) {
  if (isDiscursivePracticeSubject(row)) return false

  const career = normalizeText(subjectCareer(row))
  const name = normalizeText(subjectName(row))
  const isProfesorado = career.includes('profesorado')

  return isProfesorado && (
    name.includes('practica profesional') ||
    name.includes('practicas profesionales') ||
    name.includes('practica docente') ||
    name.includes('residencia') ||
    name.includes('practica profesionalizante')
  )
}

function addToMapList(map, key, value) {
  if (!key) return
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}

function buildScheduleRows(snapshot = {}) {
  return asArray(snapshot.horariosDocentes).map((horario, index) => ({
    index,
    rowNumber: index + 1,
    source: horario,
    matchKeys: subjectMatchKeys(horario),
    subjectOnlyKeys: subjectOnlyKeys(horario),
    teacherKey: teacherKey(horario),
    docente: teacherName(horario),
    dni_docente: teacherDocument(horario),
  }))
}

function buildScheduleIndex(scheduleRows = []) {
  return scheduleRows.reduce((index, row) => {
    row.matchKeys.forEach((key) => addToMapList(index.byCareerSubject, key, row))
    row.subjectOnlyKeys.forEach((key) => addToMapList(index.bySubjectOnly, key, row))
    return index
  }, {
    byCareerSubject: new Map(),
    bySubjectOnly: new Map(),
  })
}

function scheduleMatchesForPlan(plan = {}, scheduleIndex = {}) {
  const seen = new Set()
  const matches = []

  subjectMatchKeys(plan).forEach((key) => {
    asArray(scheduleIndex.byCareerSubject?.get(key)).forEach((row) => {
      const rowKey = row.rowNumber
      if (seen.has(rowKey)) return
      seen.add(rowKey)
      matches.push(row)
    })
  })

  if (matches.length) return matches

  subjectOnlyKeys(plan).forEach((key) => {
    asArray(scheduleIndex.bySubjectOnly?.get(key)).forEach((row) => {
      const rowKey = row.rowNumber
      if (seen.has(rowKey)) return
      seen.add(rowKey)
      matches.push(row)
    })
  })

  return matches
}

function buildTeacherLookup(docentes = []) {
  const lookup = new Map()

  asArray(docentes).forEach((docente) => {
    const name = teacherName(docente)
    const document = teacherDocument(docente)
    const record = {
      docente: name,
      dni_docente: document,
    }

    teacherAliasValues(docente).forEach((alias) => {
      const textKey = normalizeText(alias)
      const tokenKey = normalizeToken(alias)
      if (textKey) lookup.set(textKey, record)
      if (tokenKey) lookup.set(tokenKey, record)
    })
  })

  return lookup
}

function enrichTeacherFromDirectory(teacher = {}, teacherLookup = new Map()) {
  const aliases = [
    teacher.dni_docente,
    teacher.docente,
  ].map(clean).filter(Boolean)

  for (const alias of aliases) {
    const directoryRecord = teacherLookup.get(normalizeText(alias)) ?? teacherLookup.get(normalizeToken(alias))
    if (!directoryRecord) continue
    return {
      docente: teacher.docente || directoryRecord.docente,
      dni_docente: teacher.dni_docente || directoryRecord.dni_docente,
    }
  }

  return teacher
}

function uniqueTeachers(scheduleRows = [], teacherLookup = new Map()) {
  const map = new Map()

  scheduleRows.forEach((row) => {
    if (!row.teacherKey) return
    const current = map.get(row.teacherKey) ?? {
      docente: row.docente,
      dni_docente: row.dni_docente,
    }
    map.set(row.teacherKey, enrichTeacherFromDirectory({
      docente: current.docente || row.docente,
      dni_docente: current.dni_docente || row.dni_docente,
    }, teacherLookup))
  })

  return [...map.values()].sort((left, right) => (
    normalizeText(left.docente).localeCompare(normalizeText(right.docente)) ||
    clean(left.dni_docente).localeCompare(clean(right.dni_docente))
  ))
}

function baseCandidateRow(plan = {}) {
  return {
    carrera: subjectCareer(plan),
    materia_codigo: subjectCode(plan),
    materia_nombre: subjectName(plan),
    anio: subjectYear(plan),
    docente: '',
    dni_docente: '',
    rol_en_materia: '',
    estado_asignacion: '',
    vigencia_desde: '',
    vigencia_hasta: '',
    docente_reemplazado: '',
    requiere_mesa: '',
    observaciones: '',
    origen: '',
    nivel_confianza: '',
    requiere_revision: '',
    motivo_revision: '',
  }
}

function buildRowsForPlan({ plan, teachers }) {
  const base = baseCandidateRow(plan)

  if (!teachers.length) {
    return [{
      ...base,
      requiere_mesa: 'NO',
      observaciones: 'Materia del plan sin horario asociado; no requerida para mesa.',
      origen: 'PLAN_ESTUDIO',
      nivel_confianza: 'ALTA',
      requiere_revision: 'NO',
      motivo_revision: 'SIN_HORARIO_NO_REQUERIDA',
    }]
  }

  if (teachers.length === 1) {
    return [{
      ...base,
      docente: teachers[0].docente,
      dni_docente: teachers[0].dni_docente,
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
      observaciones: 'Titular inferido por unico docente en horarios.',
      origen: 'HORARIOS_DOCENTES',
      nivel_confianza: 'ALTA',
      requiere_revision: 'NO',
      motivo_revision: '',
    }]
  }

  const isProfessionalPractice = isProfessionalPracticeSubject(plan)
  const motivoRevision = isProfessionalPractice
    ? 'PRACTICA_PROFESIONAL_MULTIDOCENTE'
    : 'MULTIDOCENTE_NO_PRACTICA'
  const observaciones = isProfessionalPractice
    ? 'Practica profesional multidocente: definir titular para mesa.'
    : 'Requiere definir titular institucional.'

  return teachers.map((teacher) => ({
    ...base,
    docente: teacher.docente,
    dni_docente: teacher.dni_docente,
    rol_en_materia: '',
    estado_asignacion: 'ACTIVO',
    requiere_mesa: 'SI',
    observaciones,
    origen: 'HORARIOS_DOCENTES',
    nivel_confianza: 'MEDIA',
    requiere_revision: 'SI',
    motivo_revision: motivoRevision,
  }))
}

function buildOrphanHorarios(scheduleRows = [], planRows = []) {
  const planKeys = new Set(planRows.flatMap((plan) => subjectMatchKeys(plan)))
  const planSubjectOnlyKeys = new Set(planRows.flatMap((plan) => subjectOnlyKeys(plan)))

  return scheduleRows
    .filter((row) => (
      !row.matchKeys.some((key) => planKeys.has(key)) &&
      !row.subjectOnlyKeys.some((key) => planSubjectOnlyKeys.has(key))
    ))
    .map((row) => ({
      rowIndex: row.index,
      rowNumber: row.rowNumber,
      carrera: normalizeText(subjectCareer(row.source)) || 'sin carrera',
      materia: normalizeText(subjectName(row.source) || subjectCode(row.source)) || 'sin materia',
      dia: normalizeText(readField(row.source, ['dia', 'diaSemana', 'day', 'weekday'])),
      inicio: clean(readField(row.source, ['inicio', 'horaInicio', 'desde', 'start', 'startTime'])),
      fin: clean(readField(row.source, ['fin', 'horaFin', 'hasta', 'end', 'endTime'])),
      docenteAnonId: docenteAnonId(row.source),
      motivo: 'HORARIO_SIN_PLAN',
    }))
}

function buildOrphanWarnings(orphanHorarios = []) {
  return orphanHorarios.map((row) => ({
    rowIndex: row.rowIndex,
    rowNumber: row.rowNumber,
    code: 'HORARIO_HUERFANO',
    field: 'horariosDocentes',
    message: 'Horario docente no coincide con una materia del plan de estudios.',
    carrera: row.carrera,
    materia: row.materia,
    docenteAnonId: row.docenteAnonId,
  }))
}

function countRows(rows = [], predicate) {
  return rows.filter(predicate).length
}

function buildSummary({ snapshot, rows, orphanHorarios, parsed }) {
  const planes = asArray(snapshot.planesEstudio)

  return {
    totalPlanesEstudio: planes.length,
    totalHorariosDocentes: asArray(snapshot.horariosDocentes).length,
    totalRowsGenerated: rows.length,
    titularesInferidosAltaConfianza: countRows(rows, (row) => (
      row.rol_en_materia === 'TITULAR' &&
      row.nivel_confianza === 'ALTA' &&
      row.origen === 'HORARIOS_DOCENTES'
    )),
    materiasSinHorarioNoRequeridas: countRows(rows, (row) => row.motivo_revision === 'SIN_HORARIO_NO_REQUERIDA'),
    materiasMultidocenteNoPractica: countRows(planes, (plan) => {
      const planRows = rows.filter((row) => (
        normalizeToken(row.carrera) === normalizeToken(subjectCareer(plan)) &&
        normalizeToken(row.materia_codigo || row.materia_nombre) === normalizeToken(subjectCode(plan) || subjectName(plan)) &&
        row.motivo_revision === 'MULTIDOCENTE_NO_PRACTICA'
      ))
      return planRows.length > 0
    }),
    practicasProfesionalesMultidocente: countRows(planes, (plan) => {
      const planRows = rows.filter((row) => (
        normalizeToken(row.carrera) === normalizeToken(subjectCareer(plan)) &&
        normalizeToken(row.materia_codigo || row.materia_nombre) === normalizeToken(subjectCode(plan) || subjectName(plan)) &&
        row.motivo_revision === 'PRACTICA_PROFESIONAL_MULTIDOCENTE'
      ))
      return planRows.length > 0
    }),
    practicasDiscursivasDetectadas: countRows(planes, isDiscursivePracticeSubject),
    horariosHuerfanos: orphanHorarios.length,
    filasRequierenRevision: countRows(rows, (row) => row.requiere_revision === 'SI'),
    filasNoRequierenRevision: countRows(rows, (row) => row.requiere_revision === 'NO'),
    parserErrors: asArray(parsed.errors).length,
    parserWarnings: asArray(parsed.warnings).length,
  }
}

export function buildDocenteMateriaCandidateTemplate(snapshot = {}, options = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {}
  const scheduleRows = buildScheduleRows(safeSnapshot)
  const scheduleIndex = buildScheduleIndex(scheduleRows)
  const teacherLookup = buildTeacherLookup(safeSnapshot.docentes)
  const rows = asArray(safeSnapshot.planesEstudio).flatMap((plan) => buildRowsForPlan({
    plan,
    teachers: uniqueTeachers(scheduleMatchesForPlan(plan, scheduleIndex), teacherLookup),
  }))
  const orphanHorarios = buildOrphanHorarios(scheduleRows, asArray(safeSnapshot.planesEstudio))
  const orphanWarnings = buildOrphanWarnings(orphanHorarios)
  const parsed = parseDocenteMateriaRows(rows, {
    allowEmptyDocenteWhenNoRequiereMesa: true,
    source: options.source ?? 'docente_materia_candidate',
  })
  const warnings = [
    ...orphanWarnings,
    ...asArray(parsed.warnings),
  ]
  const errors = asArray(parsed.errors)

  return {
    rows,
    summary: buildSummary({ snapshot: safeSnapshot, rows, orphanHorarios, parsed }),
    warnings,
    errors,
    orphanHorarios,
  }
}
