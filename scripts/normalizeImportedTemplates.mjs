import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'

const sourceDir = path.resolve('public/plantillas/importacion')
const outputDir = path.resolve('public/plantillas/base-datos')

function clean(value) {
  return String(value ?? '').trim()
}

function readRows(worksheet) {
  const headers = worksheet.getRow(1).values.slice(1).map(clean)
  const rows = []
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const record = {}
    headers.forEach((header, index) => {
      if (header) record[header] = clean(row.getCell(index + 1).value)
    })
    if (Object.values(record).some(Boolean)) rows.push(record)
  }
  return rows
}

function unique(rows, key) {
  return [...new Map(rows.map((row) => [key(row), row])).values()]
}

function csv(value) {
  const text = clean(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(filename, headers, rows) {
  const content = [headers.join(','), ...rows.map((row) => headers.map((header) => csv(row[header])).join(','))]
  fs.writeFileSync(path.join(outputDir, filename), `${content.join('\n')}\n`, 'utf8')
}

async function loadWorkbook(filename) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path.join(sourceDir, filename))
  return workbook
}

const academicWorkbook = await loadWorkbook('plantilla-academica (3).xlsx')
const studentWorkbook = await loadWorkbook('plantilla-alumnos (4) (1).xlsx')
const teacherWorkbook = await loadWorkbook('plantilla-docentes (5).xlsx')

const careersAndPlans = readRows(academicWorkbook.getWorksheet('carreras_planes'))
const subjects = readRows(academicWorkbook.getWorksheet('plan_estudios'))
const equivalences = readRows(academicWorkbook.getWorksheet('equivalencias_planes'))
const prerequisites = readRows(academicWorkbook.getWorksheet('correlatividades'))
const students = readRows(studentWorkbook.getWorksheet('alumnos_inscripciones'))
const teachers = readRows(teacherWorkbook.getWorksheet('docentes'))
const assignments = readRows(teacherWorkbook.getWorksheet('docente_materia'))
const schedules = readRows(teacherWorkbook.getWorksheet('horarios_docentes'))

writeCsv('carreras.csv', ['carrera_codigo', 'carrera_nombre', 'duracion_anios', 'estado', 'observaciones'], unique(
  careersAndPlans.filter((row) => row.carrera_id),
  (row) => row.carrera_id,
).map((row) => ({
  carrera_codigo: row.carrera_id,
  carrera_nombre: row.carrera_nombre,
  duracion_anios: row.duracion_anios,
  estado: row.estado_plan === 'VIGENTE' ? 'ACTIVA' : 'ACTIVA',
  observaciones: row.observaciones,
})))

writeCsv('planes_estudio.csv', ['plan_codigo', 'carrera_codigo', 'plan_nombre', 'anio_plan', 'resolucion', 'estado_plan', 'vigente_desde', 'vigente_hasta', 'convive_con_plan_codigo', 'observaciones'], unique(
  careersAndPlans.filter((row) => row.plan_id),
  (row) => row.plan_id,
).map((row) => ({
  plan_codigo: row.plan_id,
  carrera_codigo: row.carrera_id,
  plan_nombre: row.plan_nombre,
  anio_plan: row.anio_plan,
  resolucion: row.resolucion,
  estado_plan: row.estado_plan,
  vigente_desde: row.vigente_desde,
  vigente_hasta: row.vigente_hasta,
  convive_con_plan_codigo: row.convive_con_plan_id,
  observaciones: row.observaciones,
})))

writeCsv('materias_plan.csv', ['plan_codigo', 'materia_codigo', 'materia_nombre', 'anio_cursada', 'cuatrimestre', 'regimen', 'campo_formacion', 'formato', 'grupo_afin_mesa', 'codigos_materias_afines', 'requiere_mesa', 'tipo_mesa', 'orden_impresion', 'vigente_desde', 'vigente_hasta', 'observaciones'], subjects.map((row) => ({ ...row, plan_codigo: row.plan_id })))

writeCsv('equivalencias_planes.csv', ['plan_origen_codigo', 'materia_origen_codigo', 'plan_destino_codigo', 'materia_destino_codigo', 'tipo_equivalencia', 'alcance', 'requiere_resolucion', 'estado', 'vigente_desde', 'vigente_hasta', 'observaciones'], equivalences.map((row) => ({
  plan_origen_codigo: row.plan_origen_id,
  materia_origen_codigo: row.materia_origen_codigo,
  plan_destino_codigo: row.plan_destino_id,
  materia_destino_codigo: row.materia_destino_codigo,
  tipo_equivalencia: row.tipo_equivalencia,
  alcance: row.alcance,
  requiere_resolucion: row.requiere_resolucion,
  estado: 'ACTIVA',
  observaciones: row.observaciones,
})))

writeCsv('correlatividades.csv', ['plan_codigo', 'materia_destino_codigo', 'materia_requerida_codigo', 'tipo_correlativa', 'requisito', 'grupo_logico', 'aplica_para', 'estado', 'observaciones'], prerequisites.filter((row) => row.correlativa_codigo || row.correlativa_id).map((row) => ({
  plan_codigo: row.plan_id,
  materia_destino_codigo: row.materia_codigo,
  materia_requerida_codigo: row.correlativa_codigo || row.correlativa_id,
  tipo_correlativa: row.tipo_correlativa,
  requisito: row.requisito,
  aplica_para: 'CURSAR_Y_RENDIR',
  estado: 'ACTIVA',
  observaciones: row.observaciones,
})))

writeCsv('docentes.csv', ['docente_codigo', 'apellido', 'nombre', 'dni_docente', 'email', 'telefono', 'estado_docente', 'horas_catedra', 'especialidad', 'familias_idoneidad', 'idoneidad_academica_explicita', 'observaciones'], teachers.map((row) => ({ ...row, docente_codigo: row.docente_id })))

const teacherIds = new Set(teachers.map((row) => row.docente_id).filter(Boolean))
writeCsv('docente_materias.csv', ['plan_codigo', 'materia_codigo', 'docente_codigo', 'rol_en_materia', 'estado_asignacion', 'vigencia_desde', 'vigencia_hasta', 'docente_reemplazado_codigo', 'requiere_mesa', 'observaciones'], assignments.filter((row) => teacherIds.has(row.docente_id)).map((row) => ({
  plan_codigo: row.plan_id,
  materia_codigo: row.materia_codigo,
  docente_codigo: row.docente_id,
  rol_en_materia: row.rol_en_materia,
  estado_asignacion: row.estado_asignacion,
  vigencia_desde: row.vigencia_desde,
  vigencia_hasta: row.vigencia_hasta,
  docente_reemplazado_codigo: row.docente_reemplazado_id,
  requiere_mesa: row.requiere_mesa,
  observaciones: row.observaciones,
})))

writeCsv('horarios_cursada.csv', ['plan_codigo', 'materia_codigo', 'docente_codigo', 'dia', 'hora_inicio', 'hora_fin', 'modalidad', 'sede', 'comision', 'observaciones'], schedules.filter((row) => teacherIds.has(row.docente_id)).map((row) => ({
  plan_codigo: row.plan_id,
  materia_codigo: row.materia_codigo,
  docente_codigo: row.docente_id,
  dia: row.dia,
  hora_inicio: row.hora_inicio,
  hora_fin: row.hora_fin,
  modalidad: row.modalidad,
  sede: row.sede,
  comision: row.comision,
  observaciones: row.observaciones,
})))

const uniqueStudents = unique(students.filter((row) => row.alumno_id), (row) => row.alumno_id)
writeCsv('alumnos.csv', ['alumno_codigo', 'apellido', 'nombre', 'dni', 'email', 'telefono', 'estado', 'observaciones'], uniqueStudents.map((row) => ({
  alumno_codigo: row.alumno_id,
  apellido: row.apellido,
  nombre: row.nombre,
  dni: row.dni,
  email: row.email,
  telefono: row.telefono,
  estado: row.estado_academico,
  observaciones: row.observaciones,
})))

const studentTrajectories = unique(students.filter((row) => row.alumno_id && (row.carrera_id || row.plan_id)), (row) => `${row.alumno_id}|${row.carrera_id}|${row.plan_id}`)
writeCsv('alumno_carrera_plan.csv', ['alumno_codigo', 'carrera_codigo', 'plan_codigo', 'cohorte', 'anio_ingreso', 'anio_cursada', 'estado_trayectoria', 'vigente_desde', 'vigente_hasta', 'observaciones'], studentTrajectories.map((row) => ({
  alumno_codigo: row.alumno_id,
  carrera_codigo: row.carrera_id,
  plan_codigo: row.plan_id,
  cohorte: row.cohorte,
  anio_ingreso: row.anio_ingreso,
  anio_cursada: row.anio_cursada,
  estado_trayectoria: row.estado_academico,
  observaciones: row.observaciones,
})))

writeCsv('estado_academico_alumno.csv', ['alumno_codigo', 'plan_codigo', 'materia_codigo', 'condicion', 'regularidad_vigente', 'fecha_regularidad', 'fecha_aprobacion', 'nota', 'observaciones'], students.filter((row) => row.alumno_id && row.materia_codigo).map((row) => ({
  alumno_codigo: row.alumno_id,
  plan_codigo: row.plan_id,
  materia_codigo: row.materia_codigo,
  condicion: row.condicion,
  regularidad_vigente: row.regularidad_vigente,
  fecha_regularidad: row.fecha_regularidad,
  observaciones: row.observaciones,
})))

console.log(JSON.stringify({
  carreras: unique(careersAndPlans.filter((row) => row.carrera_id), (row) => row.carrera_id).length,
  planes: unique(careersAndPlans.filter((row) => row.plan_id), (row) => row.plan_id).length,
  materias: subjects.length,
  equivalencias: equivalences.length,
  correlatividades: prerequisites.filter((row) => row.correlativa_codigo || row.correlativa_id).length,
  docentes: teachers.length,
  docenteMaterias: assignments.filter((row) => teacherIds.has(row.docente_id)).length,
  horarios: schedules.filter((row) => teacherIds.has(row.docente_id)).length,
  alumnos: uniqueStudents.length,
  trayectorias: studentTrajectories.length,
  estadosAcademicos: students.filter((row) => row.alumno_id && row.materia_codigo).length,
}, null, 2))
