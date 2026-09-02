import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'

const WORKSPACE_DIR = process.cwd()
const SOURCE_DIR = 'C:/Users/tinla/Desktop/PLANILLAS PARA LA APP'
const TEMPLATE_DIR = path.join(WORKSPACE_DIR, 'public', 'plantillas')
const AUDIT_DIR = path.join(WORKSPACE_DIR, 'local-audit')

const ACADEMIC_PATH = path.join(TEMPLATE_DIR, 'plantilla-academica.xlsx')
const TEACHERS_PATH = path.join(TEMPLATE_DIR, 'plantilla-docentes.xlsx')
const STUDENTS_PATH = path.join(TEMPLATE_DIR, 'plantilla-alumnos.xlsx')
const COMPLETE_PATH = path.join(TEMPLATE_DIR, 'plantilla_institucional_precargada_completa.xlsx')

const SOURCE_PLAN_PATH = path.join(SOURCE_DIR, 'PLAN DE ESTUDIOS.xlsx')
const SOURCE_CORRELATIVITIES_PATH = path.join(SOURCE_DIR, 'CORRELATIVIDADES.xlsx')
const SOURCE_TEACHERS_PATH = path.join(SOURCE_DIR, 'DOCENTES.xlsx')
const SOURCE_SCHEDULES_PATH = path.join(SOURCE_DIR, 'plantilla-horarios-profesores.xlsx')

const CAREER_ID = 'LAB'
const CAREER_NAME = 'TECNICO SUPERIOR EN LABORATORIO'
const CAMPUS = 'SAN MIGUEL'
const TEMPLATE_NOTE = 'Laboratorio cargado desde planillas fuente 2015/2024.'

const PLANS = [
  {
    sheetName: 'LABORATORIO 2015',
    sourceCareerName: 'TECNICO SUPERIOR EN LABORATORIO (PLAN 2015)',
    correlativityCareerName: 'TECNICO EN LABORATORIO (PLAN 2015)',
    planId: 'LAB-2015',
    planName: 'Plan 2015',
    year: '2015',
    status: 'CONVIVIENTE',
    coexistsWith: 'LAB-2024',
    startDate: '2015-03-01',
    observation: 'Plan cargado para mesas de examen de cohortes anteriores.',
  },
  {
    sheetName: 'LABORATORIO 2024',
    sourceCareerName: 'TECNICO SUPERIOR EN LABORATORIO (PLAN 2024)',
    correlativityCareerName: 'TECNICO EN LABORATORIO (PLAN 2024)',
    planId: 'LAB-2024',
    planName: 'Plan 2024',
    year: '2024',
    status: 'VIGENTE',
    coexistsWith: 'LAB-2015',
    startDate: '2024-03-01',
    observation: 'Plan vigente para los alumnos actuales de Laboratorio.',
  },
]

const EQUIVALENCE_PAIRS = [
  ['LAB01', 'LAB26'],
  ['LAB02', 'LAB27'],
  ['LAB03', 'LAB28'],
  ['LAB04', 'LAB29'],
  ['LAB05', 'LAB30'],
  ['LAB06', 'LAB31'],
  ['LAB07', 'LAB33'],
  ['LAB08', 'LAB32'],
  ['LAB09', 'LAB34'],
  ['LAB10', 'LAB35'],
  ['LAB11', 'LAB40'],
  ['LAB12', 'LAB37'],
  ['LAB13', 'LAB38'],
  ['LAB14', 'LAB39'],
  ['LAB15', 'LAB36'],
  ['LAB16', 'LAB41'],
  ['LAB17', 'LAB42'],
  ['LAB18', 'LAB43'],
  ['LAB19', 'LAB48'],
  ['LAB20', 'LAB45'],
  ['LAB21', 'LAB46'],
  ['LAB22', 'LAB47'],
  ['LAB23', 'LAB44'],
  ['LAB24', 'LAB49'],
]

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function normalizeHeader(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function cellText(value) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('text' in value) return clean(value.text)
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? '').join('')
    if ('result' in value) return clean(value.result)
    return clean(JSON.stringify(value))
  }
  return clean(value)
}

async function readWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  return workbook
}

function readRowsFromWorksheet(worksheet) {
  const headers = []
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnIndex) => {
    headers[columnIndex - 1] = normalizeHeader(cellText(cell.value))
  })

  const rows = []
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const record = { __rowNumber: rowNumber }
    let hasValue = false
    row.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
      const header = headers[columnIndex - 1] || `col_${columnIndex}`
      const value = cellText(cell.value).replace(/^"|"$/g, '')
      record[header] = clean(value)
      if (clean(value)) hasValue = true
    })
    if (hasValue) rows.push(record)
  })
  return rows
}

function readHeaders(worksheet) {
  const headers = []
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnIndex) => {
    headers[columnIndex - 1] = clean(cellText(cell.value))
  })
  return headers.filter(Boolean)
}

function sheetRows(workbook, sheetName) {
  const worksheet = workbook.getWorksheet(sheetName)
  if (!worksheet) throw new Error(`No existe la hoja ${sheetName}.`)
  return readRowsFromWorksheet(worksheet)
}

function rewriteSheet(workbook, sheetName, rows) {
  const worksheet = workbook.getWorksheet(sheetName)
  if (!worksheet) throw new Error(`No existe la hoja ${sheetName}.`)
  const headers = readHeaders(worksheet)
  workbook.removeWorksheet(worksheet.id)
  const replacement = workbook.addWorksheet(sheetName)
  replacement.views = [{ state: 'frozen', ySplit: 1 }]
  replacement.addRow(headers)
  replacement.getRow(1).font = { bold: true }
  rows.forEach((row) => {
    replacement.addRow(headers.map((header) => row[header] ?? ''))
  })
  replacement.columns.forEach((column) => {
    const header = clean(column.values?.[1])
    column.width = Math.min(Math.max(header.length + 2, 14), 36)
  })
}

function uuidFromSeed(seed) {
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 32).split('')
  hash[12] = '5'
  const variant = (Number.parseInt(hash[16], 16) & 0x3) | 0x8
  hash[16] = variant.toString(16)
  const text = hash.join('')
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`
}

function subjectId(planId, code) {
  return uuidFromSeed(`subject:${planId}:${normalize(code)}`)
}

function teacherId(row) {
  const dni = clean(row.dni || row.dni_docente)
  const name = normalize(`${row.apellido ?? ''} ${row.nombre ?? ''}` || row.docente)
  return uuidFromSeed(`teacher:${dni || name}`)
}

function byKey(rows, keyFn) {
  const map = new Map()
  rows.forEach((row) => {
    const key = keyFn(row)
    if (key) map.set(key, row)
  })
  return map
}

function timeToHHMM(value) {
  const raw = clean(value).replace(/^"|"$/g, '').replace('.', ':')
  const isoMatch = raw.match(/T(\d{2}):(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})\b/)
  if (!timeMatch) return raw
  return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
}

function isLabRow(row) {
  return normalize(row.carrera_id) === CAREER_ID || normalize(row.materia_codigo).startsWith('LAB')
}

function isLabSourceSchedule(row) {
  return normalize(row.carrera).includes('LABORATORIO') || normalize(row.materia).startsWith('LAB')
}

function splitCorrelatives(value) {
  return clean(value).split('|').map((item) => clean(item)).filter(Boolean)
}

function planForSourceCareer(career) {
  const normalized = normalize(career)
  return PLANS.find((plan) => normalized === normalize(plan.sourceCareerName) || normalized === normalize(plan.correlativityCareerName))
}

function buildLabSubjects(planRowsBySheet) {
  const rows = []
  PLANS.forEach((plan) => {
    const sourceRows = planRowsBySheet.get(plan.sheetName) ?? []
    sourceRows.forEach((row, index) => {
      const code = clean(row.materia)
      const name = clean(row.nombre)
      rows.push({
        plan_id: plan.planId,
        carrera_id: CAREER_ID,
        materia_id: subjectId(plan.planId, code),
        materia_codigo: code,
        materia_nombre: name,
        grupo_afin_mesa: '',
        codigos_materias_afines: '',
        anio_cursada: clean(row.anio),
        cuatrimestre: '',
        regimen: 'ANUAL',
        campo_formacion: '',
        formato: normalize(name).includes('PRACTICA') ? 'PRACTICA' : 'MATERIA',
        requiere_mesa: 'SI',
        tipo_mesa: 'REGULAR',
        orden_impresion: String(index + 1),
        vigente_desde: plan.startDate,
        vigente_hasta: '',
        observaciones: `${TEMPLATE_NOTE} ${plan.planName}.`,
      })
    })
  })
  return rows
}

function buildLabCareerPlanRows(existingRows) {
  const firstLabIndex = existingRows.findIndex((row) => normalize(row.carrera_id) === CAREER_ID)
  const withoutLab = existingRows.filter((row) => normalize(row.carrera_id) !== CAREER_ID)
  const labRows = PLANS.map((plan) => ({
    carrera_id: CAREER_ID,
    carrera_nombre: CAREER_NAME,
    duracion_anios: '3',
    plan_id: plan.planId,
    plan_nombre: plan.planName,
    anio_plan: plan.year,
    resolucion: '',
    estado_plan: plan.status,
    vigente_desde: plan.startDate,
    vigente_hasta: '',
    convive_con_plan_id: plan.coexistsWith,
    observaciones: plan.observation,
  }))

  if (firstLabIndex < 0) return [...withoutLab, ...labRows]
  return [
    ...withoutLab.slice(0, firstLabIndex),
    ...labRows,
    ...withoutLab.slice(firstLabIndex),
  ]
}

function buildLabEquivalenceRows(subjectByPlanCode) {
  return EQUIVALENCE_PAIRS.map(([oldCode, newCode]) => {
    const oldSubject = subjectByPlanCode.get(`LAB-2015::${oldCode}`)
    const newSubject = subjectByPlanCode.get(`LAB-2024::${newCode}`)
    if (!oldSubject || !newSubject) {
      throw new Error(`No se pudo crear equivalencia ${oldCode} -> ${newCode}.`)
    }
    return {
      carrera_id: CAREER_ID,
      plan_origen_id: 'LAB-2015',
      materia_origen_id: oldSubject.materia_id,
      materia_origen_codigo: oldSubject.materia_codigo,
      materia_origen_nombre: oldSubject.materia_nombre,
      plan_destino_id: 'LAB-2024',
      materia_destino_id: newSubject.materia_id,
      materia_destino_codigo: newSubject.materia_codigo,
      materia_destino_nombre: newSubject.materia_nombre,
      tipo_equivalencia: 'TOTAL',
      alcance: 'Cursada y final',
      requiere_resolucion: 'NO',
      observaciones: 'Equivalencia institucional Laboratorio 2015/2024.',
    }
  })
}

function buildLabCorrelativityRows(sourceRows, subjectByPlanCode) {
  const rows = []
  sourceRows
    .filter((row) => normalize(row.carrera).includes('LABORATORIO') || normalize(row.materia).startsWith('LAB'))
    .forEach((row) => {
      const plan = planForSourceCareer(row.carrera)
      if (!plan) throw new Error(`No se pudo determinar plan para correlatividad: ${row.carrera}`)
      const subject = subjectByPlanCode.get(`${plan.planId}::${clean(row.materia)}`)
      if (!subject) throw new Error(`No existe materia ${plan.planId} ${row.materia} para correlatividad.`)
      const prerequisites = splitCorrelatives(row.correlativas)
      if (!prerequisites.length) {
        rows.push({
          plan_id: plan.planId,
          carrera_id: CAREER_ID,
          materia_id: subject.materia_id,
          materia_codigo: subject.materia_codigo,
          materia_nombre: subject.materia_nombre,
          correlativa_codigo: '',
          correlativa_id: '',
          correlativa_nombre: '',
          tipo_correlativa: '',
          requisito: '',
          observaciones: '',
        })
        return
      }
      prerequisites.forEach((code) => {
        const prerequisite = subjectByPlanCode.get(`${plan.planId}::${code}`)
        if (!prerequisite) throw new Error(`No existe correlativa ${plan.planId} ${code} para ${subject.materia_codigo}.`)
        rows.push({
          plan_id: plan.planId,
          carrera_id: CAREER_ID,
          materia_id: subject.materia_id,
          materia_codigo: subject.materia_codigo,
          materia_nombre: subject.materia_nombre,
          correlativa_codigo: prerequisite.materia_codigo,
          correlativa_id: prerequisite.materia_id,
          correlativa_nombre: prerequisite.materia_nombre,
          tipo_correlativa: 'REGULAR',
          requisito: 'APROBADA',
          observaciones: '',
        })
      })
    })
  return rows
}

function buildTeacherIndex(existingTeachers, sourceTeachers) {
  const sourceByName = byKey(sourceTeachers, (row) => normalize(`${row.apellido} ${row.nombre}`))
  const teacherByName = new Map()
  const teacherRows = [...existingTeachers]

  existingTeachers.forEach((row) => {
    teacherByName.set(normalize(`${row.apellido} ${row.nombre}`), row)
  })

  const newTeacherNames = new Set()
  return {
    resolve(name) {
      const key = normalize(name)
      const existing = teacherByName.get(key)
      if (existing) return existing

      const source = sourceByName.get(key)
      if (!source) throw new Error(`El docente ${name} no existe en DOCENTES.xlsx.`)
      const teacher = {
        docente_id: teacherId(source),
        apellido: clean(source.apellido),
        nombre: clean(source.nombre),
        dni_docente: clean(source.dni),
        email: '',
        telefono: clean(source.telefono),
        estado_docente: clean(source.estado) || 'ACTIVO',
        horas_catedra: '',
        especialidad: '',
        familias_idoneidad: 'LABORATORIO',
        idoneidad_academica_explicita: '',
        turnos_disponibles: 'NOCHE',
        observaciones: 'Agregado desde DOCENTES.xlsx para Laboratorio.',
      }
      teacherRows.push(teacher)
      teacherByName.set(key, teacher)
      newTeacherNames.add(key)
      return teacher
    },
    rows() {
      return teacherRows
    },
    newTeachers() {
      return [...newTeacherNames].map((key) => teacherByName.get(key))
    },
  }
}

function buildLabSchedules(sourceRows, subjectByPlanCode, teacherIndex) {
  return sourceRows
    .filter(isLabSourceSchedule)
    .map((row) => {
      const plan = planForSourceCareer(row.carrera)
      if (!plan) throw new Error(`No se pudo determinar plan para horario: ${row.carrera}`)
      const subject = subjectByPlanCode.get(`${plan.planId}::${clean(row.materia)}`)
      if (!subject) throw new Error(`No existe materia ${plan.planId} ${row.materia} para horario.`)
      const teacher = teacherIndex.resolve(row.profesor)
      return {
        plan_id: plan.planId,
        carrera_id: CAREER_ID,
        materia_id: subject.materia_id,
        materia_codigo: subject.materia_codigo,
        materia_nombre: subject.materia_nombre,
        anio_cursada: subject.anio_cursada,
        docente_id: teacher.docente_id,
        docente: `${teacher.apellido} ${teacher.nombre}`,
        dni_docente: teacher.dni_docente,
        dia: normalize(row.dia),
        hora_inicio: timeToHHMM(row.inicio),
        hora_fin: timeToHHMM(row.fin),
        modalidad: 'PRESENCIAL',
        sede: CAMPUS,
        comision: '',
        observaciones: TEMPLATE_NOTE,
      }
    })
}

function buildLabAssignments(subjects, schedules, teacherById) {
  const schedulesBySubject = new Map()
  schedules.forEach((row) => {
    const list = schedulesBySubject.get(row.materia_id) ?? []
    list.push(row)
    schedulesBySubject.set(row.materia_id, list)
  })

  return subjects.map((subject) => {
    const subjectSchedules = schedulesBySubject.get(subject.materia_id) ?? []
    const teacherIds = [...new Set(subjectSchedules.map((row) => row.docente_id).filter(Boolean))]
    if (!teacherIds.length) {
      return {
        plan_id: subject.plan_id,
        carrera_id: subject.carrera_id,
        materia_id: subject.materia_id,
        materia_codigo: subject.materia_codigo,
        materia_nombre: subject.materia_nombre,
        anio_cursada: subject.anio_cursada,
        docente_id: '',
        docente: '',
        dni_docente: '',
        rol_en_materia: '',
        estado_asignacion: 'ACTIVO',
        vigencia_desde: '',
        vigencia_hasta: '',
        docente_reemplazado_id: '',
        docente_reemplazado: '',
        requiere_mesa: 'SI',
        observaciones: 'Sin horario/docente en fuente Laboratorio; completar titular antes de generar mesa.',
      }
    }
    if (teacherIds.length > 1) {
      throw new Error(`La materia ${subject.materia_codigo} tiene mas de un docente en horarios.`)
    }
    const teacher = teacherById.get(teacherIds[0])
    return {
      plan_id: subject.plan_id,
      carrera_id: subject.carrera_id,
      materia_id: subject.materia_id,
      materia_codigo: subject.materia_codigo,
      materia_nombre: subject.materia_nombre,
      anio_cursada: subject.anio_cursada,
      docente_id: teacher.docente_id,
      docente: `${teacher.apellido} ${teacher.nombre}`,
      dni_docente: teacher.dni_docente,
      rol_en_materia: '',
      estado_asignacion: 'ACTIVO',
      vigencia_desde: '',
      vigencia_hasta: '',
      docente_reemplazado_id: '',
      docente_reemplazado: '',
      requiere_mesa: 'SI',
      observaciones: `${TEMPLATE_NOTE} Docente detectado desde horarios; completar rol_en_materia si corresponde titularidad institucional.`,
    }
  })
}

function updateLabStudents(rows) {
  return rows.map((row) => {
    if (normalize(row.carrera_id) !== CAREER_ID) return row
    return {
      ...row,
      plan_id: 'LAB-2024',
      observaciones: clean(row.observaciones)
        ? `${row.observaciones} | Plan Laboratorio 2024 confirmado.`
        : 'Plan Laboratorio 2024 confirmado.',
    }
  })
}

function countDuplicateKeys(rows, keyFn) {
  const counts = new Map()
  rows.forEach((row) => {
    const key = keyFn(row)
    if (!key) return
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return [...counts.entries()].filter(([, count]) => count > 1)
}

function buildAudit(rowsBySheet) {
  return {
    counts: Object.fromEntries(Object.entries(rowsBySheet).map(([sheet, rows]) => [sheet, rows.length])),
    laboratorio: {
      carreras_planes: rowsBySheet.carreras_planes.filter((row) => normalize(row.carrera_id) === CAREER_ID).length,
      plan_estudios: rowsBySheet.plan_estudios.filter(isLabRow).length,
      equivalencias_planes: rowsBySheet.equivalencias_planes.filter((row) => normalize(row.carrera_id) === CAREER_ID).length,
      correlatividades: rowsBySheet.correlatividades.filter(isLabRow).length,
      docentes: rowsBySheet.docentes.filter((row) => normalize(row.familias_idoneidad).includes('LABORATORIO')).length,
      docente_materia: rowsBySheet.docente_materia.filter(isLabRow).length,
      horarios_docentes: rowsBySheet.horarios_docentes.filter(isLabRow).length,
      alumnos_inscripciones: rowsBySheet.alumnos_inscripciones.filter((row) => normalize(row.carrera_id) === CAREER_ID).length,
      alumnosPlan2024: rowsBySheet.alumnos_inscripciones.filter((row) => normalize(row.carrera_id) === CAREER_ID && row.plan_id === 'LAB-2024').length,
      asignacionesSinDocente: rowsBySheet.docente_materia
        .filter((row) => isLabRow(row) && !clean(row.docente_id))
        .map((row) => `${row.plan_id} ${row.materia_codigo} ${row.materia_nombre}`),
    },
    duplicates: {
      carreras_planes: countDuplicateKeys(rowsBySheet.carreras_planes, (row) => `${row.carrera_id}::${row.plan_id}`),
      plan_estudios_materia_id: countDuplicateKeys(rowsBySheet.plan_estudios, (row) => row.materia_id),
      docentes_docente_id: countDuplicateKeys(rowsBySheet.docentes, (row) => row.docente_id),
      docente_materia: countDuplicateKeys(rowsBySheet.docente_materia, (row) => `${row.materia_id}::${row.docente_id}`),
      horarios_docentes: countDuplicateKeys(rowsBySheet.horarios_docentes, (row) => `${row.materia_id}::${row.docente_id}::${row.dia}::${row.hora_inicio}::${row.hora_fin}`),
      alumnos: countDuplicateKeys(rowsBySheet.alumnos_inscripciones, (row) => `${row.alumno_id}::${row.materia_id}`),
      correlatividades: countDuplicateKeys(rowsBySheet.correlatividades, (row) => `${row.materia_id}::${row.correlativa_id}::${row.tipo_correlativa}`),
    },
  }
}

async function main() {
  const academicWorkbook = await readWorkbook(ACADEMIC_PATH)
  const teachersWorkbook = await readWorkbook(TEACHERS_PATH)
  const studentsWorkbook = await readWorkbook(STUDENTS_PATH)
  const completeWorkbook = await readWorkbook(COMPLETE_PATH)
  const sourcePlanWorkbook = await readWorkbook(SOURCE_PLAN_PATH)
  const sourceCorrelativityWorkbook = await readWorkbook(SOURCE_CORRELATIVITIES_PATH)
  const sourceTeachersWorkbook = await readWorkbook(SOURCE_TEACHERS_PATH)
  const sourceSchedulesWorkbook = await readWorkbook(SOURCE_SCHEDULES_PATH)

  const planRowsBySheet = new Map(PLANS.map((plan) => [
    plan.sheetName,
    readRowsFromWorksheet(sourcePlanWorkbook.getWorksheet(plan.sheetName)),
  ]))
  const sourceCorrelativityRows = readRowsFromWorksheet(sourceCorrelativityWorkbook.getWorksheet('Correlatividades'))
  const sourceTeacherRows = readRowsFromWorksheet(sourceTeachersWorkbook.getWorksheet('Docentes'))
  const sourceScheduleRows = readRowsFromWorksheet(sourceSchedulesWorkbook.getWorksheet('Horarios'))

  const currentRows = {
    carreras_planes: sheetRows(academicWorkbook, 'carreras_planes'),
    plan_estudios: sheetRows(academicWorkbook, 'plan_estudios'),
    equivalencias_planes: sheetRows(academicWorkbook, 'equivalencias_planes'),
    correlatividades: sheetRows(academicWorkbook, 'correlatividades'),
    calendario_mesas: sheetRows(academicWorkbook, 'calendario_mesas'),
    docentes: sheetRows(teachersWorkbook, 'docentes'),
    docente_materia: sheetRows(teachersWorkbook, 'docente_materia'),
    horarios_docentes: sheetRows(teachersWorkbook, 'horarios_docentes'),
    disponibilidad_docente: sheetRows(teachersWorkbook, 'disponibilidad_docente'),
    alumnos_inscripciones: sheetRows(studentsWorkbook, 'alumnos_inscripciones'),
  }

  const labSubjects = buildLabSubjects(planRowsBySheet)
  const subjectByPlanCode = byKey(labSubjects, (row) => `${row.plan_id}::${row.materia_codigo}`)
  const teacherIndex = buildTeacherIndex(currentRows.docentes, sourceTeacherRows)
  const labSchedules = buildLabSchedules(sourceScheduleRows, subjectByPlanCode, teacherIndex)
  const teacherById = byKey(teacherIndex.rows(), (row) => row.docente_id)
  const labAssignments = buildLabAssignments(labSubjects, labSchedules, teacherById)
  const labCorrelativities = buildLabCorrelativityRows(sourceCorrelativityRows, subjectByPlanCode)
  const labEquivalences = buildLabEquivalenceRows(subjectByPlanCode)

  const rowsBySheet = {
    carreras_planes: buildLabCareerPlanRows(currentRows.carreras_planes),
    plan_estudios: [
      ...currentRows.plan_estudios.filter((row) => !isLabRow(row)),
      ...labSubjects,
    ],
    equivalencias_planes: [
      ...currentRows.equivalencias_planes.filter((row) => normalize(row.carrera_id) !== CAREER_ID),
      ...labEquivalences,
    ],
    correlatividades: [
      ...currentRows.correlatividades.filter((row) => !isLabRow(row)),
      ...labCorrelativities,
    ],
    calendario_mesas: currentRows.calendario_mesas,
    docentes: teacherIndex.rows(),
    docente_materia: [
      ...currentRows.docente_materia.filter((row) => !isLabRow(row)),
      ...labAssignments,
    ],
    horarios_docentes: [
      ...currentRows.horarios_docentes.filter((row) => !isLabRow(row)),
      ...labSchedules,
    ],
    disponibilidad_docente: currentRows.disponibilidad_docente,
    alumnos_inscripciones: updateLabStudents(currentRows.alumnos_inscripciones),
  }

  rewriteSheet(academicWorkbook, 'carreras_planes', rowsBySheet.carreras_planes)
  rewriteSheet(academicWorkbook, 'plan_estudios', rowsBySheet.plan_estudios)
  rewriteSheet(academicWorkbook, 'equivalencias_planes', rowsBySheet.equivalencias_planes)
  rewriteSheet(academicWorkbook, 'correlatividades', rowsBySheet.correlatividades)
  rewriteSheet(academicWorkbook, 'calendario_mesas', rowsBySheet.calendario_mesas)

  rewriteSheet(teachersWorkbook, 'docentes', rowsBySheet.docentes)
  rewriteSheet(teachersWorkbook, 'docente_materia', rowsBySheet.docente_materia)
  rewriteSheet(teachersWorkbook, 'horarios_docentes', rowsBySheet.horarios_docentes)
  rewriteSheet(teachersWorkbook, 'disponibilidad_docente', rowsBySheet.disponibilidad_docente)

  rewriteSheet(studentsWorkbook, 'alumnos_inscripciones', rowsBySheet.alumnos_inscripciones)

  Object.entries(rowsBySheet).forEach(([sheetName, rows]) => {
    if (completeWorkbook.getWorksheet(sheetName)) rewriteSheet(completeWorkbook, sheetName, rows)
  })

  await academicWorkbook.xlsx.writeFile(ACADEMIC_PATH)
  await teachersWorkbook.xlsx.writeFile(TEACHERS_PATH)
  await studentsWorkbook.xlsx.writeFile(STUDENTS_PATH)
  await completeWorkbook.xlsx.writeFile(COMPLETE_PATH)

  const audit = {
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      plan: SOURCE_PLAN_PATH,
      correlativities: SOURCE_CORRELATIVITIES_PATH,
      teachers: SOURCE_TEACHERS_PATH,
      schedules: SOURCE_SCHEDULES_PATH,
    },
    newTeachers: teacherIndex.newTeachers().map((row) => ({
      docente_id: row.docente_id,
      apellido: row.apellido,
      nombre: row.nombre,
      dni_docente: row.dni_docente,
    })),
    ...buildAudit(rowsBySheet),
  }
  await mkdir(AUDIT_DIR, { recursive: true })
  await writeFile(
    path.join(AUDIT_DIR, 'laboratorio-template-merge-audit.json'),
    `${JSON.stringify(audit, null, 2)}\n`,
    'utf8',
  )

  console.log(JSON.stringify(audit, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
