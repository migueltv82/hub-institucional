const REQUIRED_SHEETS = [
  'carreras_planes',
  'plan_estudios',
  'correlatividades',
]
const ALL_SHEETS = [
  ...REQUIRED_SHEETS,
  'docentes',
  'docente_materia',
  'horarios_docentes',
  'disponibilidad_docente',
  'alumnos_inscripciones',
]
const DEDICATED_FALLBACK_REQUIRED_HEADERS = {
  disponibilidad_docente: [
    'docente_id',
    'dia',
    'turno',
    'hora_desde',
    'hora_hasta',
    'disponible_mesa',
  ],
  alumnos_inscripciones: [
    'alumno_id',
    'materia_id',
    'carrera_id',
    'plan_id',
  ],
}

function clean(value) {
  return String(value ?? '').trim()
}

function cellValue(cell) {
  const value = cell?.value
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result ?? ''
    if ('formula' in value) return ''
    if ('text' in value) return value.text ?? ''
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
  }
  return value ?? ''
}

function rowsFromWorksheet(worksheet) {
  const headers = worksheet.getRow(1).values.map((value) => clean(value))
  const rows = []
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const record = {}
    headers.forEach((header, columnIndex) => {
      if (header) record[header] = cellValue(row.getCell(columnIndex))
    })
    if (Object.values(record).some((value) => clean(value))) rows.push(record)
  }
  return rows
}

function headersFromWorksheet(worksheet) {
  return worksheet.getRow(1).values.map((value) => clean(value)).filter(Boolean)
}

function findWorksheetByHeaders(workbook, sheetName) {
  const requiredHeaders = DEDICATED_FALLBACK_REQUIRED_HEADERS[sheetName]
  if (!requiredHeaders) return null

  return workbook.worksheets.find((worksheet) => {
    const headers = new Set(headersFromWorksheet(worksheet))
    return requiredHeaders.every((header) => headers.has(header))
  }) ?? null
}

function formatFoundSheets(workbook) {
  const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name).filter(Boolean)
  return sheetNames.length ? ` Hojas encontradas: ${sheetNames.join(', ')}.` : ''
}

function fullTeacherName(row = {}) {
  return clean(row.docente) || clean([row.apellido, row.nombre].filter(Boolean).join(' '))
}

function subjectId(row = {}) {
  return clean(row.materia_id ?? row.materiaId ?? row.id)
}

function subjectCode(row = {}) {
  return clean(row.materia_codigo ?? row.materiaCodigo ?? row.materia ?? row.codigo)
}

function subjectName(row = {}) {
  return clean(row.materia_nombre ?? row.materiaNombre ?? row.nombreMateria ?? row.nombre)
}

function buildSubjectById(rows = []) {
  const result = new Map()
  rows.forEach((row) => {
    const id = subjectId(row)
    if (id) result.set(id, row)
  })
  return result
}

function subjectCareerId(row = {}) {
  return clean(row.carrera_id ?? row.carreraId)
}

function parseBooleanLike(value, fallback = true) {
  const text = clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!text) return fallback
  if (['no', 'false', 'falso', '0', 'n'].includes(text)) return false
  if (['si', 'true', 'verdadero', '1', 's', 'y', 'yes'].includes(text)) return true
  return fallback
}

function normalizeIdentityPart(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }
  return ''
}

function getStudentImportIdentity(row = {}) {
  const explicitId = firstClean(row.alumno_id, row.alumnoId, row.id)
  if (explicitId) return explicitId

  const dni = normalizeIdentityPart(firstClean(row.dni, row.documento, row.document_number, row.documentNumber))
  if (dni) return `dni-${dni}`

  const email = normalizeIdentityPart(firstClean(row.email, row.correo, row.mail, row.login_email, row.loginEmail))
  if (email) return `email-${email}`

  const legajo = normalizeIdentityPart(firstClean(row.legajo, row.matricula, row.student_number, row.studentNumber))
  if (legajo) return `legajo-${legajo}`

  return ''
}

function hasStudentRosterIdentity(row = {}) {
  return Boolean(getStudentImportIdentity(row))
}

// planesEstudio ya trae cada materia con su carrera resuelta (nombre), por
// eso alcanza con leer carrera_id/carrera de esas filas para armar el mapa.
function buildCareerById(planesEstudio = []) {
  const result = new Map()
  planesEstudio.forEach((row) => {
    const careerId = subjectCareerId(row)
    const careerName = clean(row.carrera)
    if (careerId && careerName && !result.has(careerId)) result.set(careerId, careerName)
  })
  return result
}

function uniqueRows(rows, keyFn) {
  const seen = new Set()
  return rows.filter((row) => {
    const key = keyFn(row)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function loadXlsxWorkbook(file, label) {
  if (clean(file?.name).split('.').pop()?.toLowerCase() !== 'xlsx') throw new Error(`${label} debe ser un archivo XLSX.`)
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  return workbook
}

export async function parseTemplateV2MasterWorkbook(file) {
  const workbook = await loadXlsxWorkbook(file, 'La plantilla maestra')

  const missingSheets = REQUIRED_SHEETS.filter((name) => !workbook.getWorksheet(name))
  if (missingSheets.length) {
    throw new Error(`La plantilla maestra esta incompleta. Faltan hojas: ${missingSheets.join(', ')}.`)
  }

  const source = Object.fromEntries(ALL_SHEETS.map((name) => [
    name,
    workbook.getWorksheet(name) ? rowsFromWorksheet(workbook.getWorksheet(name)) : [],
  ]))
  const careerById = new Map(source.carreras_planes.map((row) => [clean(row.carrera_id), clean(row.carrera_nombre)]))
  const teacherById = new Map(source.docentes.map((row) => [clean(row.docente_id), row]))
  const subjectById = new Map(source.plan_estudios.map((row) => [clean(row.materia_id), row]))
  const careerName = (row) => careerById.get(clean(row.carrera_id)) ?? ''
  const subjectCode = (row) => clean(row.materia_codigo)
  const resolvedSubject = (row) => subjectById.get(clean(row.materia_id)) ?? row

  const planesEstudio = source.plan_estudios.map((row) => ({
    ...row,
    carrera: careerName(row),
    materia: subjectCode(row),
    nombre: clean(row.materia_nombre),
    nombreMateria: clean(row.materia_nombre),
    anio: row.anio_cursada,
  })).filter((row) => clean(row.materia_id) && row.carrera && row.materia)

  const docentes = source.docentes.map((row) => ({
    ...row,
    id: row.docente_id,
    docente: fullTeacherName(row),
  })).filter((row) => clean(row.docente_id))

  const docenteMateria = source.docente_materia.map((row) => {
    const teacher = teacherById.get(clean(row.docente_id)) ?? {}
    const subject = resolvedSubject(row)
    return {
      ...row,
      plan_id: subject.plan_id,
      carrera_id: subject.carrera_id,
      materia_codigo: subject.materia_codigo,
      materia_nombre: subject.materia_nombre,
      grupo_afin_mesa: subject.grupo_afin_mesa,
      codigos_materias_afines: subject.codigos_materias_afines,
      carrera: careerName(subject),
      materia: subjectCode(subject),
      nombreMateria: clean(subject.materia_nombre),
      docente: fullTeacherName(teacher) || clean(row.docente),
      dni: clean(teacher.dni_docente) || clean(row.dni_docente),
    }
  }).filter((row) => clean(row.materia_id) && clean(row.docente_id))

  const horariosDocentes = source.horarios_docentes.map((row) => {
    const teacher = teacherById.get(clean(row.docente_id)) ?? {}
    const subject = resolvedSubject(row)
    return {
      ...row,
      plan_id: subject.plan_id,
      carrera_id: subject.carrera_id,
      materia_codigo: subject.materia_codigo,
      materia_nombre: subject.materia_nombre,
      grupo_afin_mesa: subject.grupo_afin_mesa,
      codigos_materias_afines: subject.codigos_materias_afines,
      carrera: careerName(subject),
      materia: subjectCode(subject),
      nombreMateria: clean(subject.materia_nombre),
      profesor: fullTeacherName(teacher) || clean(row.docente),
      dni: clean(teacher.dni_docente) || clean(row.dni_docente),
      inicio: row.hora_inicio,
      fin: row.hora_fin,
    }
  }).filter((row) => clean(row.materia_id) && clean(row.docente_id))

  const disponibilidadDocente = buildAvailabilityRows(source.disponibilidad_docente, teacherById)

  const alumnos = uniqueRows(source.alumnos_inscripciones.map((row) => {
    const studentIdentity = getStudentImportIdentity(row)
    const subject = resolvedSubject(row)
    return {
      ...row,
      id: studentIdentity,
      alumno_id: clean(row.alumno_id) || studentIdentity,
      carrera_id: subject.carrera_id,
      materia_codigo: subject.materia_codigo,
      materia_nombre: subject.materia_nombre,
      carrera: careerName(subject),
      materia: subjectCode(subject),
    }
  }).filter(hasStudentRosterIdentity), (row) => getStudentImportIdentity(row))

  const correlativityGroups = new Map()
  source.correlatividades.forEach((row) => {
    if (!clean(row.materia_id)) return
    const subject = resolvedSubject(row)
    const key = `${clean(subject.plan_id)}::${clean(row.materia_id)}`
    const current = correlativityGroups.get(key) ?? {
      ...row,
      plan_id: subject.plan_id,
      carrera_id: subject.carrera_id,
      materia_codigo: subject.materia_codigo,
      materia_nombre: subject.materia_nombre,
      carrera: careerName(subject),
      materia: subjectCode(subject),
      nombre: clean(subject.materia_nombre),
      correlativas: [],
    }

    // Una fila sin correlativa_id NI correlativa_codigo significa "esta
    // materia no tiene correlativa", no "usar esta misma fila como
    // correlativa". El bug anterior (`?? row`) hacia que esas filas se
    // autorreferenciaran (ej: ING02 quedaba con su propio codigo como
    // correlativa), generando un requisito imposible de cumplir.
    const prerequisiteId = clean(row.correlativa_id)
    const prerequisiteCodeFallback = clean(row.correlativa_codigo)
    if (prerequisiteId || prerequisiteCodeFallback) {
      const prerequisiteSubject = prerequisiteId ? subjectById.get(prerequisiteId) : null
      const prerequisiteCode = prerequisiteSubject
        ? clean(prerequisiteSubject.materia_codigo)
        : prerequisiteCodeFallback
      if (prerequisiteCode) current.correlativas.push(prerequisiteCode)
    }

    correlativityGroups.set(key, current)
  })
  const correlatividades = [...correlativityGroups.values()]

  if (!planesEstudio.length) throw new Error('La hoja plan_estudios no contiene materias validas.')

  return {
    datasets: { alumnos, correlatividades, disponibilidadDocente, docenteMateria, docentes, horariosDocentes, planesEstudio },
    summary: {
      alumnos: alumnos.length,
      correlatividades: correlatividades.length,
      disponibilidadDocente: disponibilidadDocente.length,
      docenteMateria: docenteMateria.length,
      docentes: docentes.length,
      horariosDocentes: horariosDocentes.length,
      planesEstudio: planesEstudio.length,
    },
  }
}

function readDedicatedWorkbookSource(workbook, requiredSheets, label) {
  const source = {}
  const missing = []

  requiredSheets.forEach((name) => {
    const worksheet = workbook.getWorksheet(name) ?? findWorksheetByHeaders(workbook, name)
    if (!worksheet) {
      missing.push(name)
      return
    }

    source[name] = rowsFromWorksheet(worksheet)
  })

  if (missing.length) {
    throw new Error(`${label} esta incompleta. Faltan hojas: ${missing.join(', ')}.${formatFoundSheets(workbook)} Descarga la plantilla actual desde la app o usa una hoja con las columnas esperadas.`)
  }

  return source
}

function readOptionalWorkbookRows(workbook, sheetName) {
  const worksheet = workbook.getWorksheet(sheetName) ?? findWorksheetByHeaders(workbook, sheetName)
  return worksheet ? rowsFromWorksheet(worksheet) : []
}

function buildAvailabilityRows(sourceRows = [], teacherById = new Map()) {
  return sourceRows.map((row) => {
    const teacher = teacherById.get(clean(row.docente_id)) ?? {}
    const docente = fullTeacherName(teacher) || clean(row.docente)
    return {
      ...row,
      id: clean(row.disponibilidad_id || row.id),
      docenteId: clean(row.docente_id),
      docente_id: clean(row.docente_id),
      docente,
      profesor: docente,
      dni_docente: clean(teacher.dni_docente) || clean(row.dni_docente),
      dia: clean(row.dia),
      turno: clean(row.turno).toUpperCase(),
      hora_desde: clean(row.hora_desde),
      hora_hasta: clean(row.hora_hasta),
      disponible_mesa: parseBooleanLike(row.disponible_mesa, true),
      motivo_no_disponible: clean(row.motivo_no_disponible || row.motivo || row.reason),
      estado: clean(row.estado || row.status || 'ACTIVO'),
      vigencia_desde: clean(row.vigencia_desde || row.valid_from),
      vigencia_hasta: clean(row.vigencia_hasta || row.valid_until),
      observaciones: clean(row.observaciones || row.observacion),
      source: clean(row.source || row.fuente || 'disponibilidad_docente'),
    }
  }).filter((row) => clean(row.docente_id) && clean(row.docente) && clean(row.dia) && clean(row.hora_desde) && clean(row.hora_hasta))
}

export async function parseTemplateV2TeachersWorkbook(file, { planesEstudio = [] } = {}) {
  const workbook = await loadXlsxWorkbook(file, 'La plantilla de docentes')

  const source = readDedicatedWorkbookSource(workbook, ['docentes', 'docente_materia', 'horarios_docentes'], 'La plantilla de docentes')
  source.disponibilidad_docente = readOptionalWorkbookRows(workbook, 'disponibilidad_docente')
  const teacherById = new Map(source.docentes.map((row) => [clean(row.docente_id), row]))
  const subjectById = buildSubjectById(planesEstudio)
  const careerById = buildCareerById(planesEstudio)
  const docentes = source.docentes.map((row) => ({ ...row, id: row.docente_id, docente: fullTeacherName(row) }))
    .filter((row) => clean(row.docente_id))
  const enrich = (row, schedule = false) => {
    const teacher = teacherById.get(clean(row.docente_id)) ?? {}
    const subject = subjectById.get(clean(row.materia_id)) ?? row
    const code = subjectCode(subject) || subjectCode(row)
    const name = subjectName(subject) || subjectName(row)
    const careerId = clean(subject.carrera_id ?? subject.carreraId ?? row.carrera_id)
    return {
      ...row,
      ...subject,
      plan_id: clean(subject.plan_id ?? subject.planId ?? row.plan_id),
      carrera_id: careerId,
      carrera: clean(subject.carrera) || careerById.get(careerId) || '',
      materia_id: subjectId(subject) || clean(row.materia_id),
      materia_codigo: code,
      materia_nombre: name,
      docente: fullTeacherName(teacher) || clean(row.docente),
      profesor: schedule ? fullTeacherName(teacher) || clean(row.docente) : undefined,
      dni: clean(teacher.dni_docente) || clean(row.dni_docente),
      materia: code,
      nombreMateria: name,
      inicio: schedule ? row.hora_inicio : undefined,
      fin: schedule ? row.hora_fin : undefined,
    }
  }
  const docenteMateria = source.docente_materia.map((row) => enrich(row)).filter((row) => clean(row.materia_id) && clean(row.docente_id))
  const horariosDocentes = source.horarios_docentes.map((row) => enrich(row, true)).filter((row) => clean(row.materia_id) && clean(row.docente_id))
  const disponibilidadDocente = buildAvailabilityRows(source.disponibilidad_docente, teacherById)
  return {
    datasets: { disponibilidadDocente, docentes, docenteMateria, horariosDocentes },
    summary: {
      disponibilidadDocente: disponibilidadDocente.length,
      docentes: docentes.length,
      docenteMateria: docenteMateria.length,
      horariosDocentes: horariosDocentes.length,
    },
  }
}

export async function parseTemplateV2StudentsWorkbook(file, { planesEstudio = [] } = {}) {
  const workbook = await loadXlsxWorkbook(file, 'La plantilla de alumnos')

  const source = readDedicatedWorkbookSource(workbook, ['alumnos_inscripciones'], 'La plantilla de alumnos')
  const subjectById = buildSubjectById(planesEstudio)
  const careerById = buildCareerById(planesEstudio)
  const alumnos = uniqueRows(source.alumnos_inscripciones.map((row) => {
    const studentIdentity = getStudentImportIdentity(row)
    const subject = subjectById.get(clean(row.materia_id)) ?? row
    const code = subjectCode(subject) || subjectCode(row)
    const name = subjectName(subject) || subjectName(row)
    const careerId = clean(subject.carrera_id ?? subject.carreraId ?? row.carrera_id)
    return {
      ...row,
      ...subject,
      id: studentIdentity,
      alumno_id: clean(row.alumno_id) || studentIdentity,
      plan_id: clean(subject.plan_id ?? subject.planId ?? row.plan_id),
      carrera_id: careerId,
      carrera: clean(subject.carrera) || careerById.get(careerId) || '',
      materia_id: subjectId(subject) || clean(row.materia_id),
      materia_codigo: code,
      materia_nombre: name,
      materia: code,
      nombreMateria: name,
    }
  }).filter(hasStudentRosterIdentity), (row) => getStudentImportIdentity(row))
  return { datasets: { alumnos }, summary: { alumnos: alumnos.length } }
}
