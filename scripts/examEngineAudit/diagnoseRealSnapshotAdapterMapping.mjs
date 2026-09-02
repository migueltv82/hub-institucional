import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')

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
  lun: 'lunes',
  lunes: 'lunes',
  mar: 'martes',
  martes: 'martes',
  mie: 'miercoles',
  miercoles: 'miercoles',
  jue: 'jueves',
  jueves: 'jueves',
  vie: 'viernes',
  viernes: 'viernes',
  sab: 'sabado',
  sabado: 'sabado',
}

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
const TEACHER_ID_FIELDS = ['docenteId', 'docente_id', 'teacherId', 'teacher_id', 'teacherKey', 'profesorId', 'profesor_id', 'id']
const SUBJECT_CODE_FIELDS = ['materia', 'codigo', 'code', 'materiaCodigo', 'codigoMateria', 'subjectCode', 'subject_code', 'materiaId', 'materia_id', 'id']
const SUBJECT_NAME_FIELDS = ['nombreMateria', 'materiaNombre', 'subjectName', 'subject_name', 'asignatura', 'nombreAsignatura', 'nombre', 'name', 'materia']
const CAREER_FIELDS = ['carrera', 'programa', 'program', 'career', 'nombreCarrera', 'careerName']
const CAREER_ID_FIELDS = ['carreraId', 'carrera_id', 'careerId', 'career_id', 'programaId', 'programId']
const DAY_FIELDS = ['dia', 'diaSemana', 'day', 'weekday', 'diaDisponible', 'diaAsistencia']
const START_FIELDS = ['inicio', 'horaInicio', 'desde', 'start', 'startTime']
const END_FIELDS = ['fin', 'horaFin', 'hasta', 'end', 'endTime']

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

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function truncateKey(value, maxLength = 56) {
  const key = normalizeToken(value)
  if (key.length <= maxLength) return key
  return `${key.slice(0, maxLength)}...`
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

function subjectCareerId(row = {}) {
  return clean(readField(row, CAREER_ID_FIELDS))
}

function subjectAliasKeys(row = {}) {
  return unique([
    subjectCode(row),
    subjectName(row),
    ...SUBJECT_CODE_FIELDS.map((field) => readField(row, [field])),
    ...SUBJECT_NAME_FIELDS.map((field) => readField(row, [field])),
  ].map(normalizeToken))
}

function careerKeys(row = {}) {
  const keys = unique([
    subjectCareerId(row),
    subjectCareer(row),
  ].map(normalizeToken))
  return keys.length ? keys : ['']
}

function subjectMatchKeys(row = {}) {
  return careerKeys(row).flatMap((careerKey) => subjectAliasKeys(row).map((subjectKey) => `${careerKey}::${subjectKey}`))
}

function safeSubjectExample(row = {}) {
  return {
    carreraKey: truncateKey(subjectCareerId(row) || subjectCareer(row)),
    materiaKey: truncateKey(subjectCode(row) || subjectName(row)),
    hasCode: Boolean(subjectCode(row)),
    hasName: Boolean(subjectName(row)),
  }
}

function joinNameParts(row = {}) {
  const nombre = clean(readField(row, ['nombre', 'name', 'firstName', 'first_name']))
  const apellido = clean(readField(row, ['apellido', 'lastName', 'last_name', 'surname']))
  if (nombre && apellido) return `${nombre} ${apellido}`
  return nombre || apellido
}

function teacherName(row = {}) {
  if (typeof row === 'string') return clean(row)
  return clean(firstValue(readField(row, TEACHER_NAME_FIELDS), joinNameParts(row), readField(row, ['nombre', 'name'])))
}

function teacherIdentityKeys(row = {}) {
  if (typeof row === 'string') return [normalizeText(row), normalizeToken(row)].filter(Boolean)
  const displayName = teacherName(row)
  const joinedName = joinNameParts(row)

  return unique([
    ...TEACHER_ID_FIELDS.map((field) => readField(row, [field])),
    readField(row, ['dni', 'documento', 'document']),
    readField(row, ['email', 'correo', 'mail']),
    displayName,
    joinedName,
    normalizeNameAlias(displayName),
    normalizeNameAlias(joinedName),
  ].flatMap((value) => [normalizeText(value), normalizeToken(value)]))
}

function addToSetMap(map, key, value) {
  if (!key || !value) return
  const values = map.get(key) ?? new Set()
  values.add(value)
  map.set(key, values)
}

function buildHorarioSubjectIndex(horariosDocentes = []) {
  return asArray(horariosDocentes).reduce((index, horario) => {
    const teacherKey = normalizeToken(teacherName(horario))
    subjectMatchKeys(horario).forEach((key) => addToSetMap(index.byCareerSubject, key, teacherKey || 'sin-docente'))
    subjectAliasKeys(horario).forEach((key) => addToSetMap(index.bySubjectOnly, key, teacherKey || 'sin-docente'))
    return index
  }, {
    byCareerSubject: new Map(),
    bySubjectOnly: new Map(),
  })
}

function countSubjectMatches(planesEstudio = [], horarioIndex) {
  const noMatches = []
  let strictMatches = 0
  let looseMatches = 0
  let multipleTitulares = 0

  asArray(planesEstudio).forEach((plan) => {
    const strictCandidateSets = subjectMatchKeys(plan)
      .map((key) => horarioIndex.byCareerSubject.get(key))
      .filter(Boolean)
    const looseCandidateSets = subjectAliasKeys(plan)
      .map((key) => horarioIndex.bySubjectOnly.get(key))
      .filter(Boolean)
    const allCandidates = new Set([...strictCandidateSets, ...looseCandidateSets].flatMap((set) => [...set]))

    if (strictCandidateSets.length) {
      strictMatches += 1
    } else if (looseCandidateSets.some((set) => set.size === 1)) {
      looseMatches += 1
    } else {
      noMatches.push(safeSubjectExample(plan))
    }

    if (allCandidates.size > 1) multipleTitulares += 1
  })

  return {
    strictMatches,
    looseUniqueSubjectMatches: looseMatches,
    noMatchCount: noMatches.length,
    noMatchExamples: noMatches.slice(0, 20),
    multiplePossibleTitularCount: multipleTitulares,
  }
}

function buildSubjectsByCareer(planesEstudio = []) {
  const byCareer = new Map()

  asArray(planesEstudio).forEach((plan) => {
    const careerKey = truncateKey(subjectCareerId(plan) || subjectCareer(plan))
    const subjects = byCareer.get(careerKey) ?? new Set()
    subjectAliasKeys(plan).forEach((key) => subjects.add(key))
    byCareer.set(careerKey, subjects)
  })

  return [...byCareer.entries()]
    .map(([carreraKey, subjects]) => ({ carreraKey, materiasUnicas: subjects.size }))
    .sort((left, right) => right.materiasUnicas - left.materiasUnicas)
}

function getTeacherSourceMatchStats({ docentes = [], horariosDocentes = [] }) {
  const sourceTeacherKeys = new Set(asArray(docentes).flatMap(teacherIdentityKeys))
  const exactNames = new Set(asArray(docentes).map(teacherName).filter(Boolean))
  const normalizedNames = new Set(asArray(docentes).map((docente) => normalizeText(teacherName(docente))).filter(Boolean))
  const byName = new Map()
  let noTeacherNameInSchedule = 0
  let noProfileMatchByNormalizedIdentity = 0
  let matchedOnlyAfterNormalization = 0

  asArray(docentes).forEach((docente) => {
    const key = normalizeText(teacherName(docente))
    if (!key) return
    byName.set(key, (byName.get(key) ?? 0) + 1)
  })

  asArray(horariosDocentes).forEach((horario) => {
    const name = teacherName(horario)
    if (!name) {
      noTeacherNameInSchedule += 1
      return
    }

    const keys = teacherIdentityKeys(horario)
    if (!keys.some((key) => sourceTeacherKeys.has(key))) noProfileMatchByNormalizedIdentity += 1
    if (!exactNames.has(name) && normalizedNames.has(normalizeText(name))) matchedOnlyAfterNormalization += 1
  })

  return {
    sourceDuplicateNormalizedNameGroups: [...byName.values()].filter((count) => count > 1).length,
    sourceDuplicateNormalizedNameRows: [...byName.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
    noTeacherNameInSchedule,
    noProfileMatchByNormalizedIdentity,
    matchedOnlyAfterNormalization,
  }
}

function normalizeDay(value) {
  return DAY_ALIASES[normalizeToken(value)] ?? ''
}

function isTimeLike(value) {
  return /^\d{1,2}(:\d{2})?$/.test(clean(value))
}

function getAvailabilityStats({ snapshot = {}, input = {} }) {
  const horarios = asArray(snapshot.horariosDocentes)
  const docentes = asArray(input.docentes)
  const docenteById = new Map(docentes.flatMap((docente) => [
    [normalizeText(docente.id), docente],
    [normalizeToken(docente.id), docente],
  ]))

  const registrosConDiaValido = horarios.filter((horario) => normalizeDay(readField(horario, DAY_FIELDS))).length
  const registrosConInicioFinValidos = horarios.filter((horario) => (
    isTimeLike(readField(horario, START_FIELDS)) && isTimeLike(readField(horario, END_FIELDS))
  )).length
  const registrosConDiaInicioFinValidos = horarios.filter((horario) => (
    normalizeDay(readField(horario, DAY_FIELDS)) &&
    isTimeLike(readField(horario, START_FIELDS)) &&
    isTimeLike(readField(horario, END_FIELDS))
  )).length
  const docentesConDisponibilidadUsable = docentes.filter((docente) => (
    asArray(docente.diasAsistencia).length > 0 || asArray(docente.availability).length > 0
  )).length
  const materiasSinDisponibilidadTitular = asArray(input.materias).filter((materia) => {
    const docente = docenteById.get(normalizeText(materia.titularId)) ?? docenteById.get(normalizeToken(materia.titularId))
    if (!materia.titularId || !docente) return false
    return !asArray(docente.diasAsistencia).length && !asArray(docente.availability).length
  }).length

  return {
    registrosHorarios: horarios.length,
    registrosConDiaValido,
    registrosConInicioFinValidos,
    registrosConDiaInicioFinValidos,
    docentesConDisponibilidadUsable,
    materiasSinDisponibilidadTitular,
  }
}

function hasDiacritics(value) {
  return clean(value).normalize('NFD') !== clean(value).normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '')
}

function hasExtraSpaces(value) {
  return /\s{2,}|^\s|\s$/.test(String(value ?? ''))
}

function getNormalizationStats(snapshot = {}) {
  const subjectValues = [
    ...asArray(snapshot.planesEstudio).flatMap((row) => [subjectCareer(row), subjectCode(row), subjectName(row)]),
    ...asArray(snapshot.horariosDocentes).flatMap((row) => [subjectCareer(row), subjectCode(row), subjectName(row)]),
  ].filter(Boolean)
  const teacherValues = asArray(snapshot.horariosDocentes).map(teacherName).filter(Boolean)

  return {
    subjectOrCareerValuesWithDiacritics: subjectValues.filter(hasDiacritics).length,
    subjectOrCareerValuesWithCaseDifferences: subjectValues.filter((value) => clean(value) !== clean(value).toLowerCase()).length,
    subjectOrCareerValuesWithExtraSpaces: subjectValues.filter(hasExtraSpaces).length,
    scheduleTeacherValuesWithDiacritics: teacherValues.filter(hasDiacritics).length,
    scheduleTeacherValuesWithCaseDifferences: teacherValues.filter((value) => clean(value) !== clean(value).toLowerCase()).length,
    scheduleTeacherValuesWithExtraSpaces: teacherValues.filter(hasExtraSpaces).length,
  }
}

function buildReport(snapshot = {}) {
  const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
  const horarioIndex = buildHorarioSubjectIndex(snapshot.horariosDocentes)
  const subjectMatches = countSubjectMatches(snapshot.planesEstudio, horarioIndex)
  const teacherStats = getTeacherSourceMatchStats(snapshot)
  const adaptedDocentes = asArray(input.docentes)
  const adaptedMaterias = asArray(input.materias)

  return {
    source: {
      type: 'local-file',
      path: 'local-audit/workspaceSnapshot.real.local.json',
      counts: {
        alumnos: asArray(snapshot.alumnos).length,
        docentes: asArray(snapshot.docentes).length,
        horariosDocentes: asArray(snapshot.horariosDocentes).length,
        planesEstudio: asArray(snapshot.planesEstudio).length,
        correlatividades: asArray(snapshot.correlatividades).length,
      },
    },
    materiasDelPlan: {
      totalPlanesEstudio: asArray(snapshot.planesEstudio).length,
      materiasUnicasPorCarrera: buildSubjectsByCareer(snapshot.planesEstudio),
      materiasConCoincidenciaCarreraMateriaEnHorarios: subjectMatches.strictMatches,
      materiasConCoincidenciaMateriaUnicaSinCarrera: subjectMatches.looseUniqueSubjectMatches,
      materiasSinCoincidenciaEnHorarios: subjectMatches.noMatchCount,
      ejemplosSinMatch: subjectMatches.noMatchExamples,
    },
    titulares: {
      materiasConTitularInferido: adaptedMaterias.filter((materia) => materia.titularId).length,
      materiasSinTitularInferido: adaptedMaterias.filter((materia) => !materia.titularId).length,
      materiasQueRequierenMesa: adaptedMaterias.filter((materia) => materia.requiereMesa !== false).length,
      materiasSinHorarioMarcadasNoRequeridas: adaptedMaterias.filter((materia) => materia.requiereMesaSource === 'sinHorarioDocente').length,
      materiasConTitularInexistenteMarcadasNoRequeridas: adaptedMaterias.filter((materia) => materia.requiereMesaSource === 'titularInexistente').length,
      materiasConMasDeUnPosibleTitular: subjectMatches.multiplePossibleTitularCount,
      horariosConDocenteSinMatchEnTablaDocentes: teacherStats.noProfileMatchByNormalizedIdentity,
      motivosNoMatch: {
        horariosSinNombreDocente: teacherStats.noTeacherNameInSchedule,
        sinMatchPorIdentidadNormalizada: teacherStats.noProfileMatchByNormalizedIdentity,
      },
    },
    docentes: {
      totalDocentesFuente: asArray(snapshot.docentes).length,
      totalDocentesAdaptados: adaptedDocentes.length,
      docentesDerivadosDesdeHorarios: adaptedDocentes.filter((docente) => !asArray(docente.sources).includes('docentes')).length,
      duplicadosFuentePorNombreNormalizado: {
        grupos: teacherStats.sourceDuplicateNormalizedNameGroups,
        filas: teacherStats.sourceDuplicateNormalizedNameRows,
      },
      explicacion269Anterior: {
        docentesFuente: asArray(snapshot.docentes).length,
        filasHorariosDocentes: asArray(snapshot.horariosDocentes).length,
        totalSiCadaHorarioFueraDocente: asArray(snapshot.docentes).length + asArray(snapshot.horariosDocentes).length,
        causaProbable: 'el adaptador anterior usaba horario.id como docente.id cuando no habia docenteId',
      },
    },
    disponibilidad: getAvailabilityStats({ snapshot, input }),
    normalizacion: {
      ...getNormalizationStats(snapshot),
      horariosQueMatcheanSoloTrasNormalizarNombre: teacherStats.matchedOnlyAfterNormalization,
    },
    adapterActual: input.metadata?.adapterDiagnostics,
  }
}

function fail(message) {
  console.error(`[examEngine adapter diagnosis] ${message}`)
  process.exitCode = 1
}

function main() {
  if (!existsSync(LOCAL_SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json. Exporta el snapshot real desde el front dev-only antes de diagnosticar.')
    return
  }

  try {
    const snapshot = JSON.parse(readFileSync(LOCAL_SNAPSHOT_PATH, 'utf8'))
    console.log(JSON.stringify(buildReport(snapshot), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo diagnosticar el snapshot local.')
  }
}

main()
