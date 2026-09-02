import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'

const sourceSnapshotPath = path.join('local-audit', 'workspaceSnapshot.real.local.json')
const laboratorioDir = path.join('local-audit', 'laboratorio-horarios-2026-1c')
const outputDir = path.join('local-audit', 'planilla-institucional-precargada')

const completeWorkbookPath = path.join(outputDir, 'plantilla_institucional_precargada_completa.xlsx')
const academicWorkbookPath = path.join(outputDir, 'plantilla_institucional_precargada_academica.xlsx')
const teachersWorkbookPath = path.join(outputDir, 'plantilla_institucional_precargada_docentes.xlsx')
const studentsWorkbookPath = path.join(outputDir, 'plantilla_institucional_precargada_alumnos.xlsx')

const carrerasPlanesColumns = [
  'carrera_id',
  'carrera_nombre',
  'duracion_anios',
  'plan_id',
  'plan_nombre',
  'anio_plan',
  'resolucion',
  'estado_plan',
  'vigente_desde',
  'vigente_hasta',
  'convive_con_plan_id',
  'observaciones',
]

const planEstudiosColumns = [
  'plan_id',
  'carrera_id',
  'materia_id',
  'materia_codigo',
  'materia_nombre',
  'grupo_afin_mesa',
  'codigos_materias_afines',
  'anio_cursada',
  'cuatrimestre',
  'regimen',
  'campo_formacion',
  'formato',
  'requiere_mesa',
  'tipo_mesa',
  'orden_impresion',
  'vigente_desde',
  'vigente_hasta',
  'observaciones',
]

const equivalenciasColumns = [
  'carrera_id',
  'plan_origen_id',
  'materia_origen_id',
  'materia_origen_codigo',
  'materia_origen_nombre',
  'plan_destino_id',
  'materia_destino_id',
  'materia_destino_codigo',
  'materia_destino_nombre',
  'tipo_equivalencia',
  'alcance',
  'requiere_resolucion',
  'observaciones',
]

const correlatividadesColumns = [
  'plan_id',
  'carrera_id',
  'materia_id',
  'materia_codigo',
  'materia_nombre',
  'correlativa_codigo',
  'correlativa_id',
  'correlativa_nombre',
  'tipo_correlativa',
  'requisito',
  'observaciones',
]

const docentesColumns = [
  'docente_id',
  'apellido',
  'nombre',
  'dni_docente',
  'email',
  'telefono',
  'estado_docente',
  'horas_catedra',
  'especialidad',
  'familias_idoneidad',
  'idoneidad_academica_explicita',
  'turnos_disponibles',
  'observaciones',
]

const docenteMateriaColumns = [
  'plan_id',
  'carrera_id',
  'materia_id',
  'materia_codigo',
  'materia_nombre',
  'anio_cursada',
  'docente_id',
  'docente',
  'dni_docente',
  'rol_en_materia',
  'estado_asignacion',
  'vigencia_desde',
  'vigencia_hasta',
  'docente_reemplazado_id',
  'docente_reemplazado',
  'requiere_mesa',
  'observaciones',
]

const horariosColumns = [
  'plan_id',
  'carrera_id',
  'materia_id',
  'materia_codigo',
  'materia_nombre',
  'anio_cursada',
  'docente_id',
  'docente',
  'dni_docente',
  'dia',
  'hora_inicio',
  'hora_fin',
  'modalidad',
  'sede',
  'comision',
  'observaciones',
]

const alumnosColumns = [
  'alumno_id',
  'apellido',
  'nombre',
  'dni',
  'email',
  'telefono',
  'carrera_id',
  'plan_id',
  'cohorte',
  'anio_ingreso',
  'anio_cursada',
  'estado_academico',
  'materia_id',
  'materia_codigo',
  'materia_nombre',
  'condicion',
  'regularidad_vigente',
  'fecha_regularidad',
  'observaciones',
]

const disponibilidadColumns = [
  'docente_id',
  'docente',
  'dni_docente',
  'dia',
  'turno',
  'hora_desde',
  'hora_hasta',
  'disponible_mesa',
  'motivo_no_disponible',
  'observaciones',
]

const calendarioColumns = [
  'llamado_id',
  'llamado',
  'fecha',
  'turno',
  'hora_inicio',
  'hora_fin',
  'sede',
  'capacidad_mesas',
  'habilitado',
  'observaciones',
]

const revisionColumns = ['tipo', 'referencia', 'detalle', 'accion_sugerida']

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function slug(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean)
  return clean(value).split(/[|,;]/).map(clean).filter(Boolean)
}

function readCsv(content) {
  return Papa.parse(content, { header: true, skipEmptyLines: true }).data
}

async function readCsvFile(filePath) {
  return readCsv(await readFile(filePath, 'utf8'))
}

function careerIdFor(career) {
  const value = normalize(career)
  if (value.includes('TRADUCTORADO')) return 'TRA'
  if (value.includes('TURISMO')) return 'TUR'
  if (value.includes('LABORATORIO')) return 'LAB'
  if (value.includes('QUIMICA')) return 'QUI'
  if (value.includes('GEOGRAFIA')) return 'GEO'
  if (value.includes('INGLES')) return 'ING'
  return slug(value).toUpperCase()
}

function planIdFor(career) {
  const id = careerIdFor(career)
  if (id === 'LAB') return ''
  return `${id}-PLAN`
}

function keyForCareerAndCode(career, code) {
  return `${careerIdFor(career)}::${normalize(code)}`
}

function personNameKeys({ apellido = '', nombre = '', fullName = '', docente = '', dni = '', id = '' }) {
  const keys = new Set()
  const last = clean(apellido)
  const first = clean(nombre)
  ;[fullName, docente, `${last} ${first}`, `${first} ${last}`, dni ? `dni:${dni}` : '', id ? `id:${id}` : '']
    .map(normalize)
    .filter(Boolean)
    .forEach((key) => keys.add(key))
  return [...keys]
}

function parseTeacherName(docente) {
  const parts = clean(docente).split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { apellido: clean(docente), nombre: '' }
  return { apellido: parts[0], nombre: parts.slice(1).join(' ') }
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\r\n;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function writeCsvRows(columns, rows) {
  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(',')),
  ].join('\n')
}

function addWorksheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name)
  sheet.columns = columns.map((header) => ({
    header,
    key: header,
    width: Math.min(Math.max(header.length + 4, 14), 46),
  }))
  rows.forEach((row) => sheet.addRow(row))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  }
}

async function writeWorkbook(filePath, sheets) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Codex'
  workbook.created = new Date()
  workbook.modified = new Date()
  for (const sheet of sheets) addWorksheet(workbook, sheet.name, sheet.columns, sheet.rows)
  await workbook.xlsx.writeFile(filePath)
}

const snapshot = JSON.parse(await readFile(sourceSnapshotPath, 'utf8'))
const labCarrerasPlanes = await readCsvFile(path.join(laboratorioDir, 'carreras_planes.csv'))
const labPlanEstudios = await readCsvFile(path.join(laboratorioDir, 'plan_estudios.csv'))
const labEquivalencias = await readCsvFile(path.join(laboratorioDir, 'equivalencias_planes.csv'))
const labDocentes = await readCsvFile(path.join(laboratorioDir, 'docentes.csv'))
const labDocenteMateria = await readCsvFile(path.join(laboratorioDir, 'docente_materia.csv'))
const labHorarios = await readCsvFile(path.join(laboratorioDir, 'horarios_docentes.csv'))
const labRevision = await readCsvFile(path.join(laboratorioDir, 'revision_manual.csv'))
const correctedDocenteMateria = await readCsvFile(path.join('local-audit', 'docente_materia.corrected.csv'))

const revisionRows = [...labRevision]
const snapshotPlanRows = (snapshot.planesEstudio ?? []).filter((row) => careerIdFor(row.carrera) !== 'LAB')
const planRows = snapshotPlanRows.map((row, index) => {
  const careerId = careerIdFor(row.carrera)
  return {
    plan_id: planIdFor(row.carrera),
    carrera_id: careerId,
    materia_id: clean(row.materia_id ?? row.materiaId ?? row.id) || `${careerId}-${clean(row.materia)}`,
    materia_codigo: clean(row.materia ?? row.materia_codigo),
    materia_nombre: clean(row.nombre ?? row.materia_nombre),
    grupo_afin_mesa: clean(row.grupo_afin_mesa ?? row.grupoAfinMesa),
    codigos_materias_afines: clean(row.codigos_materias_afines ?? row.codigosMateriasAfines),
    anio_cursada: clean(row.anio ?? row.anio_cursada),
    cuatrimestre: clean(row.cuatrimestre),
    regimen: clean(row.regimen) || 'ANUAL',
    campo_formacion: clean(row.campo_formacion),
    formato: clean(row.formato) || 'MATERIA',
    requiere_mesa: clean(row.requiere_mesa) || 'SI',
    tipo_mesa: clean(row.tipo_mesa) || 'REGULAR',
    orden_impresion: clean(row.orden_impresion) || String(index + 1),
    vigente_desde: '',
    vigente_hasta: '',
    observaciones: 'Precargado desde snapshot local.',
  }
})

const planEstudiosRows = [...planRows, ...labPlanEstudios]
const subjectByCareerCode = new Map(planEstudiosRows.map((row) => [keyForCareerAndCode(row.carrera_nombre ?? row.carrera ?? row.carrera_id, row.materia_codigo), row]))
for (const row of planEstudiosRows) {
  subjectByCareerCode.set(`${clean(row.carrera_id)}::${normalize(row.materia_codigo)}`, row)
}

const nonLabCareers = [...new Map(snapshotPlanRows.map((row) => [careerIdFor(row.carrera), row.carrera])).entries()]
const carrerasPlanesRows = [
  ...nonLabCareers.map(([careerId, career]) => ({
    carrera_id: careerId,
    carrera_nombre: career,
    duracion_anios: String(Math.max(...snapshotPlanRows.filter((row) => careerIdFor(row.carrera) === careerId).map((row) => Number(row.anio ?? 0)), 1)),
    plan_id: planIdFor(career),
    plan_nombre: 'Plan institucional',
    anio_plan: '',
    resolucion: '',
    estado_plan: 'VIGENTE',
    vigente_desde: '',
    vigente_hasta: '',
    convive_con_plan_id: '',
    observaciones: 'Precargado desde snapshot local.',
  })),
  ...labCarrerasPlanes,
]

const teacherRowsById = new Map()
const teacherIdByKey = new Map()

function registerTeacher(row) {
  const docente_id = clean(row.docente_id ?? row.docenteId ?? row.id) || `doc-${slug(row.docente ?? row.full_name ?? `${row.apellido} ${row.nombre}`)}`
  if (!docente_id) return null
  const existing = teacherRowsById.get(docente_id) ?? {}
  const merged = {
    docente_id,
    apellido: clean(row.apellido ?? existing.apellido),
    nombre: clean(row.nombre ?? existing.nombre),
    dni_docente: clean(row.dni_docente ?? row.dni ?? existing.dni_docente),
    email: clean(row.email ?? row.correo ?? existing.email),
    telefono: clean(row.telefono ?? existing.telefono),
    estado_docente: clean(row.estado_docente ?? row.estado ?? existing.estado_docente) || 'ACTIVO',
    horas_catedra: clean(row.horas_catedra ?? existing.horas_catedra),
    especialidad: clean(row.especialidad ?? existing.especialidad),
    familias_idoneidad: clean(row.familias_idoneidad ?? existing.familias_idoneidad),
    idoneidad_academica_explicita: clean(row.idoneidad_academica_explicita ?? existing.idoneidad_academica_explicita),
    turnos_disponibles: clean(row.turnos_disponibles ?? existing.turnos_disponibles) || 'NOCHE',
    observaciones: clean(row.observaciones ?? existing.observaciones),
  }
  teacherRowsById.set(docente_id, merged)
  personNameKeys({
    apellido: merged.apellido,
    nombre: merged.nombre,
    fullName: row.full_name,
    docente: row.docente,
    dni: merged.dni_docente,
    id: docente_id,
  }).forEach((key) => teacherIdByKey.set(key, docente_id))
  return merged
}

for (const teacher of snapshot.docentes ?? []) {
  registerTeacher({
    ...teacher,
    docente_id: teacher.id,
    dni_docente: teacher.dni,
    estado_docente: teacher.estado,
    observaciones: teacher.origen === 'manual' ? 'Precargado desde padron local manual.' : 'Precargado desde padron local.',
  })
}

for (const teacher of labDocentes) registerTeacher(teacher)

function findOrCreateTeacher(docente, dni = '') {
  const key = normalize(docente)
  const dniKey = clean(dni) ? normalize(`dni:${dni}`) : ''
  const existingId = teacherIdByKey.get(dniKey) ?? teacherIdByKey.get(key)
  if (existingId) return teacherRowsById.get(existingId)
  if (!key) return null
  const parsed = parseTeacherName(docente)
  return registerTeacher({
    docente_id: `doc-${slug(docente)}`,
    apellido: parsed.apellido,
    nombre: parsed.nombre,
    dni_docente: dni,
    estado_docente: 'ACTIVO',
    turnos_disponibles: 'NOCHE',
    observaciones: 'Docente creado desde titularidades corregidas; completar datos de padron.',
  })
}

const docenteMateriaRows = []
for (const row of correctedDocenteMateria) {
  if (careerIdFor(row.carrera) === 'LAB') continue
  const subject = subjectByCareerCode.get(keyForCareerAndCode(row.carrera, row.materia_codigo))
  const teacher = findOrCreateTeacher(row.docente, row.dni_docente)
  if (!subject) {
    revisionRows.push({
      tipo: 'materia_no_cruzada',
      referencia: `${row.carrera} ${row.materia_codigo}`,
      detalle: row.materia_nombre,
      accion_sugerida: 'Revisar codigo/carrera en plan_estudios antes de importar.',
    })
  }
  docenteMateriaRows.push({
    plan_id: clean(subject?.plan_id),
    carrera_id: clean(subject?.carrera_id) || careerIdFor(row.carrera),
    materia_id: clean(subject?.materia_id),
    materia_codigo: clean(subject?.materia_codigo ?? row.materia_codigo),
    materia_nombre: clean(subject?.materia_nombre ?? row.materia_nombre),
    anio_cursada: clean(subject?.anio_cursada ?? row.anio),
    docente_id: clean(teacher?.docente_id),
    docente: clean(row.docente),
    dni_docente: clean(row.dni_docente ?? teacher?.dni_docente),
    rol_en_materia: clean(row.rol_en_materia),
    estado_asignacion: clean(row.estado_asignacion),
    vigencia_desde: clean(row.vigencia_desde),
    vigencia_hasta: clean(row.vigencia_hasta),
    docente_reemplazado_id: '',
    docente_reemplazado: clean(row.docente_reemplazado),
    requiere_mesa: clean(row.requiere_mesa),
    observaciones: clean(row.observaciones || row.motivo_revision),
  })
}

docenteMateriaRows.push(...labDocenteMateria)

const horariosRows = []
for (const row of snapshot.horariosDocentes ?? []) {
  if (careerIdFor(row.carrera) === 'LAB') continue
  const subject = subjectByCareerCode.get(keyForCareerAndCode(row.carrera, row.materia))
  const teacher = findOrCreateTeacher(row.profesor, row.dni)
  horariosRows.push({
    plan_id: clean(subject?.plan_id),
    carrera_id: clean(subject?.carrera_id) || careerIdFor(row.carrera),
    materia_id: clean(subject?.materia_id),
    materia_codigo: clean(subject?.materia_codigo ?? row.materia),
    materia_nombre: clean(subject?.materia_nombre),
    anio_cursada: clean(subject?.anio_cursada),
    docente_id: clean(teacher?.docente_id),
    docente: clean(row.profesor),
    dni_docente: clean(row.dni ?? teacher?.dni_docente),
    dia: clean(row.dia),
    hora_inicio: clean(row.inicio ?? row.hora_inicio),
    hora_fin: clean(row.fin ?? row.hora_fin),
    modalidad: clean(row.modalidad) || 'PRESENCIAL',
    sede: clean(row.sede) || 'SAN MIGUEL',
    comision: clean(row.comision),
    observaciones: clean(row.observaciones),
  })
}
horariosRows.push(...labHorarios)

const hoursByTeacher = new Map()
for (const row of horariosRows) {
  if (!clean(row.docente_id)) continue
  const start = clean(row.hora_inicio)
  const end = clean(row.hora_fin)
  const minutes = start && end
    ? ((Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5))) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5))))
    : 0
  const catedra = Math.max(1, Math.round(minutes / 40))
  hoursByTeacher.set(row.docente_id, (hoursByTeacher.get(row.docente_id) ?? 0) + catedra)
}

for (const [id, teacher] of teacherRowsById) {
  if (!clean(teacher.horas_catedra) && hoursByTeacher.has(id)) teacher.horas_catedra = String(hoursByTeacher.get(id))
}

const docentesRows = [...teacherRowsById.values()]
  .filter((row) => !normalize(`${row.apellido} ${row.nombre}`).includes('VALIDACION'))
  .sort((a, b) => normalize(`${a.apellido} ${a.nombre}`).localeCompare(normalize(`${b.apellido} ${b.nombre}`)))

const correlatividadesRows = []
for (const row of snapshot.correlatividades ?? []) {
  if (careerIdFor(row.carrera) === 'LAB') continue
  const subject = subjectByCareerCode.get(keyForCareerAndCode(row.carrera, row.materia))
  const correlativas = splitList(row.correlativas)
  const values = correlativas.length ? correlativas : ['']
  for (const correlativaCode of values) {
    const correlativa = correlativaCode ? subjectByCareerCode.get(keyForCareerAndCode(row.carrera, correlativaCode)) : null
    correlatividadesRows.push({
      plan_id: clean(subject?.plan_id),
      carrera_id: clean(subject?.carrera_id) || careerIdFor(row.carrera),
      materia_id: clean(subject?.materia_id ?? row.id),
      materia_codigo: clean(subject?.materia_codigo ?? row.materia),
      materia_nombre: clean(subject?.materia_nombre ?? row.nombre),
      correlativa_codigo: clean(correlativa?.materia_codigo ?? correlativaCode),
      correlativa_id: clean(correlativa?.materia_id),
      correlativa_nombre: clean(correlativa?.materia_nombre),
      tipo_correlativa: '',
      requisito: '',
      observaciones: 'Precargado desde snapshot local.',
    })
  }
}

const alumnosRows = (snapshot.alumnos ?? []).map((row) => {
  const careerId = careerIdFor(row.carrera)
  return {
    alumno_id: clean(row.alumno_id ?? row.id),
    apellido: clean(row.apellido),
    nombre: clean(row.nombre),
    dni: clean(row.dni),
    email: clean(row.email),
    telefono: clean(row.telefono),
    carrera_id: careerId,
    plan_id: careerId === 'LAB' ? '' : planIdFor(row.carrera),
    cohorte: clean(row.cohorte),
    anio_ingreso: clean(row.anio_ingreso),
    anio_cursada: clean(row.anio),
    estado_academico: clean(row.estado).toUpperCase() || 'ACTIVO',
    materia_id: '',
    materia_codigo: '',
    materia_nombre: '',
    condicion: '',
    regularidad_vigente: '',
    fecha_regularidad: '',
    observaciones: careerId === 'LAB' ? 'Completar plan LAB-2015 o LAB-2024 si corresponde.' : 'Registro de padron sin inscripcion a materia.',
  }
})

const missingDni = docentesRows.filter((row) => !clean(row.dni_docente)).map((row) => `${row.apellido} ${row.nombre}`)
revisionRows.push({
  tipo: 'docentes_sin_dni',
  referencia: 'Planilla completa',
  detalle: missingDni.join('; '),
  accion_sugerida: 'Completar DNI, telefono y email donde falte.',
})

const completeSheets = [
  { name: 'carreras_planes', columns: carrerasPlanesColumns, rows: carrerasPlanesRows },
  { name: 'docentes', columns: docentesColumns, rows: docentesRows },
  { name: 'plan_estudios', columns: planEstudiosColumns, rows: planEstudiosRows },
  { name: 'equivalencias_planes', columns: equivalenciasColumns, rows: labEquivalencias },
  { name: 'docente_materia', columns: docenteMateriaColumns, rows: docenteMateriaRows },
  { name: 'horarios_docentes', columns: horariosColumns, rows: horariosRows },
  { name: 'disponibilidad_docente', columns: disponibilidadColumns, rows: [] },
  { name: 'alumnos_inscripciones', columns: alumnosColumns, rows: alumnosRows },
  { name: 'correlatividades', columns: correlatividadesColumns, rows: correlatividadesRows },
  { name: 'calendario_mesas', columns: calendarioColumns, rows: [] },
  { name: 'revision_manual', columns: revisionColumns, rows: revisionRows },
]

await mkdir(outputDir, { recursive: true })
await writeWorkbook(completeWorkbookPath, completeSheets)
await writeWorkbook(academicWorkbookPath, [
  { name: 'carreras_planes', columns: carrerasPlanesColumns, rows: carrerasPlanesRows },
  { name: 'plan_estudios', columns: planEstudiosColumns, rows: planEstudiosRows },
  { name: 'correlatividades', columns: correlatividadesColumns, rows: correlatividadesRows },
  { name: 'equivalencias_planes', columns: equivalenciasColumns, rows: labEquivalencias },
  { name: 'revision_manual', columns: revisionColumns, rows: revisionRows },
])
await writeWorkbook(teachersWorkbookPath, [
  { name: 'docentes', columns: docentesColumns, rows: docentesRows },
  { name: 'docente_materia', columns: docenteMateriaColumns, rows: docenteMateriaRows },
  { name: 'horarios_docentes', columns: horariosColumns, rows: horariosRows },
  { name: 'revision_manual', columns: revisionColumns, rows: revisionRows },
])
await writeWorkbook(studentsWorkbookPath, [
  { name: 'alumnos_inscripciones', columns: alumnosColumns, rows: alumnosRows },
  { name: 'revision_manual', columns: revisionColumns, rows: revisionRows },
])

for (const sheet of completeSheets) {
  await writeFile(path.join(outputDir, `${sheet.name}.csv`), writeCsvRows(sheet.columns, sheet.rows), 'utf8')
}

await writeFile(path.join(outputDir, 'README.md'), [
  '# Planilla institucional precargada',
  '',
  'Fuente: snapshot local actual + planes y horarios de Laboratorio cargados desde imagenes.',
  '',
  `Planilla completa: ${path.basename(completeWorkbookPath)}`,
  `Academica: ${path.basename(academicWorkbookPath)}`,
  `Docentes: ${path.basename(teachersWorkbookPath)}`,
  `Alumnos: ${path.basename(studentsWorkbookPath)}`,
  '',
  `Carreras/planes: ${carrerasPlanesRows.length}`,
  `Materias: ${planEstudiosRows.length}`,
  `Docentes: ${docentesRows.length}`,
  `Titularidades/roles: ${docenteMateriaRows.length}`,
  `Horarios docentes: ${horariosRows.length}`,
  `Alumnos: ${alumnosRows.length}`,
  `Correlatividades: ${correlatividadesRows.length}`,
  `Filas para revisar: ${revisionRows.length}`,
  '',
  'La hoja revision_manual marca los datos que conviene completar antes de usar el motor de mesas.',
].join('\n'), 'utf8')

console.log(JSON.stringify({
  completeWorkbookPath,
  academicWorkbookPath,
  teachersWorkbookPath,
  studentsWorkbookPath,
  carrerasPlanes: carrerasPlanesRows.length,
  planesEstudio: planEstudiosRows.length,
  docentes: docentesRows.length,
  docenteMateria: docenteMateriaRows.length,
  horariosDocentes: horariosRows.length,
  alumnos: alumnosRows.length,
  correlatividades: correlatividadesRows.length,
  revision: revisionRows.length,
}, null, 2))
