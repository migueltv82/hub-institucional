function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

export function normalizeText(value) {
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
const TEACHER_ID_FIELDS = ['docenteId', 'docente_id', 'teacherId', 'teacher_id', 'teacherKey', 'profesorId', 'profesor_id', 'id']
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
  return clean(firstValue(readField(row, ['anio', 'ano', 'year', 'nivel', 'curso'])))
}

function teacherName(row = {}) {
  return clean(firstValue(
    readField(row, TEACHER_NAME_FIELDS),
    [readField(row, ['nombre']), readField(row, ['apellido'])].map(clean).filter(Boolean).join(' '),
  ))
}

function teacherId(row = {}) {
  return clean(firstValue(readField(row, TEACHER_ID_FIELDS), teacherName(row)))
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

function simpleHash(value) {
  const text = clean(value)
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36).padStart(6, '0').slice(0, 6)
}

function anonymizeTeacher(row = {}) {
  const id = teacherId(row)
  const name = teacherName(row)
  const source = id || name || JSON.stringify(Object.keys(row).sort())
  return {
    docenteAnonId: `doc-${simpleHash(source)}`,
    tieneDocente: Boolean(id || name),
  }
}

function normalizedSubject(row = {}) {
  return {
    carrera: normalizeText(subjectCareer(row)) || 'sin carrera',
    materia: normalizeText(subjectName(row) || subjectCode(row)) || 'sin materia',
    materiaCodigo: normalizeText(subjectCode(row)),
  }
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(' ').filter(Boolean))
}

export function calculateSimilarity(left, right) {
  const leftTokens = tokenSet(left)
  const rightTokens = tokenSet(right)
  if (!leftTokens.size || !rightTokens.size) return 0

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return Number((intersection / union).toFixed(4))
}

function isDiscursivePractice(row = {}) {
  const name = normalizeText(subjectName(row))
  const isDiscursive = name.includes('discursivas') || name.includes('discrusivas')
  return isDiscursive && (/\biii\b/.test(name) || /\biv\b/.test(name))
}

function isProfessionalPractice(row = {}) {
  if (isDiscursivePractice(row)) return false
  const name = normalizeText(subjectName(row))
  return (
    name.includes('practica profesional') ||
    name.includes('practicas profesionales') ||
    name.includes('practica docente') ||
    name.includes('residencia') ||
    name.includes('practica profesionalizante')
  )
}

function buildScheduleIndexes(horariosDocentes = []) {
  const byCareerSubject = new Map()
  const bySubjectOnly = new Map()
  const rows = asArray(horariosDocentes).map((horario, index) => ({
    index,
    source: horario,
    normalized: normalizedSubject(horario),
    docente: anonymizeTeacher(horario),
    dia: normalizeText(readField(horario, ['dia', 'diaSemana', 'day', 'weekday'])),
    inicio: clean(readField(horario, ['inicio', 'horaInicio', 'desde', 'start', 'startTime'])),
    fin: clean(readField(horario, ['fin', 'horaFin', 'hasta', 'end', 'endTime'])),
    teacherKey: normalizeText(teacherId(horario) || teacherName(horario)),
    matchKeys: subjectMatchKeys(horario),
    subjectKeys: subjectOnlyKeys(horario),
  }))

  const add = (map, key, row) => {
    const current = map.get(key) ?? []
    current.push(row)
    map.set(key, current)
  }

  rows.forEach((row) => {
    row.matchKeys.forEach((key) => add(byCareerSubject, key, row))
    row.subjectKeys.forEach((key) => add(bySubjectOnly, key, row))
  })

  return { rows, byCareerSubject, bySubjectOnly }
}

function buildPlanIndexes(planesEstudio = []) {
  const byCareerSubject = new Map()
  const bySubjectOnly = new Map()
  const rows = asArray(planesEstudio).map((plan, index) => ({
    index,
    source: plan,
    normalized: normalizedSubject(plan),
    anio: subjectYear(plan),
    matchKeys: subjectMatchKeys(plan),
    subjectKeys: subjectOnlyKeys(plan),
    isProfessionalPractice: isProfessionalPractice(plan),
    isDiscursivePractice: isDiscursivePractice(plan),
  }))

  const add = (map, key, row) => {
    const current = map.get(key) ?? []
    current.push(row)
    map.set(key, current)
  }

  rows.forEach((row) => {
    row.matchKeys.forEach((key) => add(byCareerSubject, key, row))
    row.subjectKeys.forEach((key) => add(bySubjectOnly, key, row))
  })

  return { rows, byCareerSubject, bySubjectOnly }
}

function uniqueTeachers(scheduleRows = []) {
  return [...new Set(scheduleRows.map((row) => row.teacherKey).filter(Boolean))]
}

function findMatches(row, scheduleIndex) {
  const careerMatches = row.matchKeys.flatMap((key) => scheduleIndex.byCareerSubject.get(key) ?? [])
  const subjectOnlyMatches = row.subjectKeys.flatMap((key) => scheduleIndex.bySubjectOnly.get(key) ?? [])
  return {
    careerMatches: [...new Set(careerMatches)],
    subjectOnlyMatches: [...new Set(subjectOnlyMatches)],
  }
}

function findPlanMatches(row, planIndex) {
  const careerMatches = row.matchKeys.flatMap((key) => planIndex.byCareerSubject.get(key) ?? [])
  const subjectOnlyMatches = row.subjectKeys.flatMap((key) => planIndex.bySubjectOnly.get(key) ?? [])
  return {
    careerMatches: [...new Set(careerMatches)],
    subjectOnlyMatches: [...new Set(subjectOnlyMatches)],
  }
}

function findSimilarSchedules(planRow, scheduleRows = [], limit = 3) {
  const sameCareer = scheduleRows.filter((row) => row.normalized.carrera === planRow.normalized.carrera)
  const source = sameCareer.length ? sameCareer : scheduleRows

  return source
    .map((row) => ({
      carrera: row.normalized.carrera,
      materia: row.normalized.materia,
      score: calculateSimilarity(planRow.normalized.materia, row.normalized.materia),
      matchType: row.normalized.carrera === planRow.normalized.carrera ? 'misma_carrera' : 'otra_carrera',
    }))
    .filter((row) => row.score >= 0.45)
    .sort((left, right) => right.score - left.score || left.materia.localeCompare(right.materia))
    .slice(0, limit)
}

function findAdaptedSubject(planRow, input = {}) {
  const materias = asArray(input.materias)
  return materias.find((materia) => subjectMatchKeys(materia).some((key) => planRow.matchKeys.includes(key))) ??
    materias.find((materia) => subjectOnlyKeys(materia).some((key) => planRow.subjectKeys.includes(key))) ??
    null
}

function classifyPlanRow({ planRow, careerMatches, subjectOnlyMatches, similarMatches, adaptedSubject }) {
  const careerTeachers = uniqueTeachers(careerMatches)
  const subjectOnlyTeachers = uniqueTeachers(subjectOnlyMatches)
  const hasCareerMatch = careerMatches.length > 0
  const hasSubjectOnlyMatch = subjectOnlyMatches.length > 0
  const teacherCount = new Set([...careerTeachers, ...subjectOnlyTeachers]).size
  const hasTeacher = teacherCount > 0
  const requiresMesa = adaptedSubject?.requiereMesa !== false
  const requiereMesaSource = clean(adaptedSubject?.requiereMesaSource)
  const titularId = clean(adaptedSubject?.titularId ?? adaptedSubject?.titular_id)

  if (planRow.isProfessionalPractice && teacherCount > 1) return 'PRACTICA_PROFESIONAL_MULTIDOCENTE'
  if (!requiresMesa || requiereMesaSource === 'sinHorarioDocente') return 'MATERIA_NO_REQUERIDA'
  if (titularId && hasTeacher) return 'TITULAR_INFERIDO'
  if (!hasCareerMatch && hasSubjectOnlyMatch) return 'NOMBRE_CARRERA_NO_COINCIDE'
  if (!hasCareerMatch && similarMatches.length) return 'NOMBRE_MATERIA_NO_COINCIDE'
  if (!hasTeacher) return 'SIN_HORARIO_DOCENTE'
  if (hasTeacher && !titularId) return 'DOCENTE_NO_ENCONTRADO'
  return 'OTRO'
}

function recommendationForReason(reason) {
  const recommendations = {
    SIN_HORARIO_DOCENTE: 'Revisar si la materia debe tener horario/docente o si corresponde marcarla como no requerida.',
    NOMBRE_MATERIA_NO_COINCIDE: 'Normalizar nombre/codigo de materia entre plan de estudios y horarios docentes.',
    NOMBRE_CARRERA_NO_COINCIDE: 'Normalizar carrera entre plan de estudios y horarios docentes.',
    DOCENTE_NO_ENCONTRADO: 'Revisar plantilla docentes o columna profesor/docente en horarios.',
    DOCENTE_SIN_ESTADO_ACTIVO: 'Revisar estado activo/licencia/baja del docente.',
    MATERIA_NO_REQUERIDA: 'No requiere correccion si institucionalmente no debe generar mesa.',
    POSIBLE_DUPLICADO: 'Revisar duplicados en plan u horarios.',
    PRACTICA_PROFESIONAL_MULTIDOCENTE: 'Validar como excepcion institucional multidocente.',
    OTRO: 'Revisar manualmente el cruce plan-horarios-docentes.',
  }
  return recommendations[reason] ?? recommendations.OTRO
}

function safePlanExample(planRow, reason, similarMatches = []) {
  return {
    carrera: planRow.normalized?.carrera ?? planRow.carrera,
    materia: planRow.normalized?.materia ?? planRow.materia,
    anio: planRow.anio,
    motivo: reason,
    posibleCoincidenciaEnHorarios: similarMatches[0] ?? null,
    recomendacion: recommendationForReason(reason),
  }
}

function safeGroupExample(row) {
  return {
    carrera: row.carrera,
    materia: row.materia,
    anio: row.anio,
    cantidadDocentes: row.cantidadDocentes,
    motivo: row.motivo,
    requiereMesa: row.requiereMesa,
  }
}

function buildPlanDiagnostics({ planIndex, scheduleIndex, input }) {
  return planIndex.rows.map((planRow) => {
    const { careerMatches, subjectOnlyMatches } = findMatches(planRow, scheduleIndex)
    const similarMatches = careerMatches.length ? [] : findSimilarSchedules(planRow, scheduleIndex.rows)
    const adaptedSubject = findAdaptedSubject(planRow, input)
    const reason = classifyPlanRow({ planRow, careerMatches, subjectOnlyMatches, similarMatches, adaptedSubject })
    const docentes = uniqueTeachers(careerMatches.length ? careerMatches : subjectOnlyMatches)

    return {
      index: planRow.index,
      carrera: planRow.normalized.carrera,
      materia: planRow.normalized.materia,
      anio: planRow.anio,
      apareceEnHorariosPorCarreraMateria: careerMatches.length > 0,
      apareceEnHorariosSoloPorMateria: !careerMatches.length && subjectOnlyMatches.length > 0,
      tieneDocenteAsignado: docentes.length > 0,
      cantidadDocentes: docentes.length,
      requiereMesa: adaptedSubject?.requiereMesa !== false,
      requiereMesaSource: clean(adaptedSubject?.requiereMesaSource),
      titularInferido: Boolean(clean(adaptedSubject?.titularId ?? adaptedSubject?.titular_id)),
      motivo: reason,
      posiblesCoincidencias: similarMatches,
      isProfessionalPractice: planRow.isProfessionalPractice,
      isDiscursivePractice: planRow.isDiscursivePractice,
    }
  })
}

function buildScheduleDiagnostics({ scheduleIndex, planIndex }) {
  return scheduleIndex.rows.map((scheduleRow) => {
    const { careerMatches, subjectOnlyMatches } = findPlanMatches(scheduleRow, planIndex)
    return {
      index: scheduleRow.index,
      carrera: scheduleRow.normalized.carrera,
      materia: scheduleRow.normalized.materia,
      profesor: scheduleRow.docente,
      dia: scheduleRow.dia,
      inicio: scheduleRow.inicio,
      fin: scheduleRow.fin,
      matcheaPlanCarreraMateria: careerMatches.length > 0,
      matcheaPlanSoloMateria: !careerMatches.length && subjectOnlyMatches.length > 0,
      horarioHuerfano: careerMatches.length === 0 && subjectOnlyMatches.length === 0,
    }
  })
}

function countBy(rows, predicate) {
  return rows.filter(predicate).length
}

function topExamples(rows, reasons, limit = 30) {
  const wanted = new Set(reasons)
  return rows
    .filter((row) => wanted.has(row.motivo))
    .slice(0, limit)
    .map((row) => safePlanExample(row, row.motivo, row.posiblesCoincidencias))
}

function groupSummary(planRows, scheduleRows) {
  const multi = planRows.filter((row) => row.cantidadDocentes > 1)
  return {
    materiasPlanConTitularInferidoCorrectamente: countBy(planRows, (row) => row.titularInferido && row.tieneDocenteAsignado),
    materiasPlanSinHorarioAsociado: countBy(planRows, (row) => !row.apareceEnHorariosPorCarreraMateria && !row.apareceEnHorariosSoloPorMateria),
    materiasPlanConPosibleMatchNombreParecido: countBy(planRows, (row) => row.posiblesCoincidencias.length > 0),
    horariosDocentesHuerfanos: countBy(scheduleRows, (row) => row.horarioHuerfano),
    materiasConMasDeUnDocente: multi.length,
    materiasNoPracticasConMasDeUnDocente: multi.filter((row) => !row.isProfessionalPractice).length,
    practicasProfesionalesConMasDeUnDocente: multi.filter((row) => row.isProfessionalPractice).length,
    practicasDiscursivasIIIIVDetectadas: countBy(planRows, (row) => row.isDiscursivePractice),
  }
}

function buildGroupExamples(planRows) {
  const take = (predicate, limit = 20) => planRows.filter(predicate).slice(0, limit).map(safeGroupExample)

  return {
    materiasConTitularInferidoCorrectamente: take((row) => row.titularInferido && row.tieneDocenteAsignado),
    materiasPlanSinHorarioAsociado: take((row) => (
      !row.apareceEnHorariosPorCarreraMateria &&
      !row.apareceEnHorariosSoloPorMateria
    ), 30),
    materiasPlanConPosibleMatchNombreParecido: take((row) => row.posiblesCoincidencias.length > 0, 30),
    materiasConMasDeUnDocente: take((row) => row.cantidadDocentes > 1),
    materiasNoPracticasConMasDeUnDocente: take((row) => row.cantidadDocentes > 1 && !row.isProfessionalPractice),
    practicasProfesionalesConMasDeUnDocente: take((row) => row.cantidadDocentes > 1 && row.isProfessionalPractice),
    practicasDiscursivasIIIIVDetectadas: take((row) => row.isDiscursivePractice),
  }
}

function reasonCounts(planRows) {
  return planRows.reduce((counts, row) => {
    counts[row.motivo] = (counts[row.motivo] ?? 0) + 1
    return counts
  }, {})
}

function buildRecommendations(summary, reasons) {
  const recommendations = []
  if ((reasons.NOMBRE_MATERIA_NO_COINCIDE ?? 0) > 0 || (summary.horariosDocentesHuerfanos ?? 0) > 0) {
    recommendations.push('Corregir plan de estudios y horarios docentes para que carrera/materia usen el mismo codigo o nombre.')
  }
  if ((reasons.DOCENTE_NO_ENCONTRADO ?? 0) > 0) {
    recommendations.push('Revisar plantilla docentes contra la columna profesor/docente de horarios.')
  }
  if ((summary.materiasConMasDeUnDocente ?? 0) > 0) {
    recommendations.push('Agregar columna explicita rol_en_materia en la relacion docente_materia.')
  }
  if ((reasons.SIN_HORARIO_DOCENTE ?? 0) > 0 || (reasons.MATERIA_NO_REQUERIDA ?? 0) > 0) {
    recommendations.push('Definir institucionalmente que materias del plan no deben generar mesa o cargarles horario titular.')
  }
  if (!recommendations.length) recommendations.push('No se detectan correcciones criticas de plantilla para titularidad.')
  return recommendations
}

export function buildTemplateTitularSourcesDiagnosis({ snapshot = {}, input = {} } = {}) {
  const planIndex = buildPlanIndexes(snapshot.planesEstudio)
  const scheduleIndex = buildScheduleIndexes(snapshot.horariosDocentes)
  const planRows = buildPlanDiagnostics({ planIndex, scheduleIndex, input })
  const scheduleRows = buildScheduleDiagnostics({ scheduleIndex, planIndex })
  const summaryGroups = groupSummary(planRows, scheduleRows)
  const reasons = reasonCounts(planRows)
  const titularesFaltantesReales = planRows.filter((row) => (
    row.requiereMesa &&
    !row.titularInferido &&
    row.motivo !== 'MATERIA_NO_REQUERIDA'
  )).length

  const summary = {
    totalPlanesEstudio: planRows.length,
    totalHorariosDocentes: scheduleRows.length,
    materiasConTitularInferido: summaryGroups.materiasPlanConTitularInferidoCorrectamente,
    materiasSinHorarioNoRequeridas: reasons.MATERIA_NO_REQUERIDA ?? 0,
    titularesFaltantesReales,
    posiblesErroresEscritura: summaryGroups.materiasPlanConPosibleMatchNombreParecido,
    horariosHuerfanos: summaryGroups.horariosDocentesHuerfanos,
    materiasConMasDeUnDocente: summaryGroups.materiasConMasDeUnDocente,
    practicasProfesionalesMultidocente: summaryGroups.practicasProfesionalesConMasDeUnDocente,
    casosCriticosRequierenCorregirPlantilla: titularesFaltantesReales + summaryGroups.horariosDocentesHuerfanos + summaryGroups.materiasPlanConPosibleMatchNombreParecido,
  }

  return {
    summary,
    grupos: summaryGroups,
    gruposEjemplos: buildGroupExamples(planRows),
    motivos: reasons,
    ejemplosSeguros: topExamples(planRows, [
      'SIN_HORARIO_DOCENTE',
      'NOMBRE_MATERIA_NO_COINCIDE',
      'NOMBRE_CARRERA_NO_COINCIDE',
      'DOCENTE_NO_ENCONTRADO',
      'MATERIA_NO_REQUERIDA',
      'POSIBLE_DUPLICADO',
      'PRACTICA_PROFESIONAL_MULTIDOCENTE',
      'OTRO',
    ]),
    planRows,
    scheduleRows,
    horariosHuerfanosEjemplos: scheduleRows
      .filter((row) => row.horarioHuerfano)
      .slice(0, 30)
      .map((row) => ({
        carrera: row.carrera,
        materia: row.materia,
        dia: row.dia,
        inicio: row.inicio,
        fin: row.fin,
        docenteAnonId: row.profesor.docenteAnonId,
      })),
    recomendaciones: buildRecommendations(summaryGroups, reasons),
  }
}
