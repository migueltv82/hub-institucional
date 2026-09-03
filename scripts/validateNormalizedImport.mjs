import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'

const dataDir = path.resolve('public/plantillas/base-datos')

const definitions = {
  carreras: {
    required: ['carrera_codigo', 'carrera_nombre'],
    key: (row) => row.carrera_codigo,
  },
  planes_estudio: {
    required: ['plan_codigo', 'carrera_codigo', 'plan_nombre'],
    key: (row) => row.plan_codigo,
  },
  materias_plan: {
    required: ['plan_codigo', 'materia_codigo', 'materia_nombre'],
    key: (row) => `${row.plan_codigo}|${row.materia_codigo}`,
  },
  correlatividades: {
    required: ['plan_codigo', 'materia_destino_codigo', 'materia_requerida_codigo'],
    key: (row) => `${row.plan_codigo}|${row.materia_destino_codigo}|${row.materia_requerida_codigo}`,
  },
  equivalencias_planes: {
    required: ['plan_origen_codigo', 'materia_origen_codigo', 'plan_destino_codigo', 'materia_destino_codigo'],
    key: (row) => `${row.plan_origen_codigo}|${row.materia_origen_codigo}|${row.plan_destino_codigo}|${row.materia_destino_codigo}`,
  },
  docentes: {
    required: ['docente_codigo', 'apellido', 'nombre'],
    key: (row) => row.docente_codigo,
  },
  docente_materias: {
    required: ['plan_codigo', 'materia_codigo', 'docente_codigo'],
    key: (row) => `${row.plan_codigo}|${row.materia_codigo}|${row.docente_codigo}|${row.vigencia_desde}`,
  },
  horarios_cursada: {
    required: ['plan_codigo', 'materia_codigo', 'docente_codigo', 'dia', 'hora_inicio', 'hora_fin'],
    key: (row) => `${row.plan_codigo}|${row.materia_codigo}|${row.docente_codigo}|${row.dia}|${row.hora_inicio}|${row.hora_fin}`,
  },
  disponibilidad_docentes: {
    required: ['docente_codigo', 'dia', 'hora_desde', 'hora_hasta'],
    key: (row) => `${row.docente_codigo}|${row.dia}|${row.hora_desde}|${row.hora_hasta}`,
  },
  alumnos: {
    required: ['alumno_codigo', 'apellido', 'nombre'],
    key: (row) => row.alumno_codigo,
  },
  alumno_carrera_plan: {
    required: ['alumno_codigo', 'carrera_codigo', 'plan_codigo'],
    key: (row) => `${row.alumno_codigo}|${row.plan_codigo}`,
  },
  estado_academico_alumno: {
    required: ['alumno_codigo', 'plan_codigo', 'materia_codigo', 'condicion'],
    key: (row) => `${row.alumno_codigo}|${row.plan_codigo}|${row.materia_codigo}|${row.recorded_at}`,
  },
  llamados_examen: {
    required: ['llamado_codigo', 'fecha'],
    key: (row) => row.llamado_codigo,
  },
}

function clean(value) {
  return String(value ?? '').trim()
}

function readCsv(name, definition) {
  const filename = `${name}.csv`
  const filepath = path.join(dataDir, filename)
  if (!fs.existsSync(filepath)) {
    return { name, filename, rows: [], errors: [`No existe ${filename}.`] }
  }

  const content = fs.readFileSync(filepath, 'utf8')
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true })
  const errors = parsed.errors.map((error) => `${filename}: ${error.message} (fila ${error.row + 2}).`)
  const headers = parsed.meta.fields ?? []
  const missing = definition.required.filter((field) => !headers.includes(field))
  missing.forEach((field) => errors.push(`${filename}: falta la columna obligatoria ${field}.`))

  const rows = parsed.data.map((row, index) => ({
    ...row,
    _row: index + 2,
  }))
  const keys = new Map()
  rows.forEach((row) => {
    definition.required.forEach((field) => {
      if (!clean(row[field])) errors.push(`${filename}: falta ${field} en fila ${row._row}.`)
    })
    const key = definition.key(row)
    if (keys.has(key)) errors.push(`${filename}: clave duplicada ${key} en filas ${keys.get(key)} y ${row._row}.`)
    else if (key) keys.set(key, row._row)
  })

  return { name, filename, rows, errors }
}

function addReferenceErrors(errors, rows, filename, field, validValues, label) {
  rows.forEach((row) => {
    if (clean(row[field]) && !validValues.has(clean(row[field]))) {
      errors.push(`${filename}: ${label} inexistente "${row[field]}" en fila ${row._row}.`)
    }
  })
}

function detectCycles(rows) {
  const graph = new Map()
  rows.forEach((row) => {
    const source = `${row.plan_codigo}|${row.materia_destino_codigo}`
    const target = `${row.plan_codigo}|${row.materia_requerida_codigo}`
    const edges = graph.get(source) ?? []
    edges.push(target)
    graph.set(source, edges)
  })

  const visiting = new Set()
  const visited = new Set()
  const cycles = []
  function visit(node, chain = []) {
    if (visiting.has(node)) {
      cycles.push([...chain.slice(chain.indexOf(node)), node].join(' -> '))
      return
    }
    if (visited.has(node)) return
    visiting.add(node)
    ;(graph.get(node) ?? []).forEach((next) => visit(next, [...chain, node]))
    visiting.delete(node)
    visited.add(node)
  }
  graph.forEach((_, node) => visit(node))
  return [...new Set(cycles)]
}

const datasets = Object.entries(definitions).map(([name, definition]) => readCsv(name, definition))
const byName = Object.fromEntries(datasets.map((dataset) => [dataset.name, dataset]))
const errors = datasets.flatMap((dataset) => dataset.errors)
const warnings = []

const careerCodes = new Set(byName.carreras.rows.map((row) => clean(row.carrera_codigo)).filter(Boolean))
const planCodes = new Set(byName.planes_estudio.rows.map((row) => clean(row.plan_codigo)).filter(Boolean))
const subjectKeys = new Set(byName.materias_plan.rows.map((row) => `${clean(row.plan_codigo)}|${clean(row.materia_codigo)}`))
const teacherCodes = new Set(byName.docentes.rows.map((row) => clean(row.docente_codigo)).filter(Boolean))
const studentCodes = new Set(byName.alumnos.rows.map((row) => clean(row.alumno_codigo)).filter(Boolean))

addReferenceErrors(errors, byName.planes_estudio.rows, 'planes_estudio.csv', 'carrera_codigo', careerCodes, 'carrera')
addReferenceErrors(errors, byName.materias_plan.rows, 'materias_plan.csv', 'plan_codigo', planCodes, 'plan')
byName.correlatividades.rows.forEach((row) => {
  if (!subjectKeys.has(`${row.plan_codigo}|${row.materia_destino_codigo}`)) errors.push(`correlatividades.csv: materia destino inexistente "${row.plan_codigo}|${row.materia_destino_codigo}" en fila ${row._row}.`)
  if (!subjectKeys.has(`${row.plan_codigo}|${row.materia_requerida_codigo}`)) errors.push(`correlatividades.csv: materia requerida inexistente "${row.plan_codigo}|${row.materia_requerida_codigo}" en fila ${row._row}.`)
})
byName.equivalencias_planes.rows.forEach((row) => {
  if (!subjectKeys.has(`${row.plan_origen_codigo}|${row.materia_origen_codigo}`)) errors.push(`equivalencias_planes.csv: materia origen inexistente en fila ${row._row}.`)
  if (!subjectKeys.has(`${row.plan_destino_codigo}|${row.materia_destino_codigo}`)) errors.push(`equivalencias_planes.csv: materia destino inexistente en fila ${row._row}.`)
})
for (const name of ['docente_materias', 'horarios_cursada']) {
  byName[name].rows.forEach((row) => {
    if (!teacherCodes.has(clean(row.docente_codigo))) errors.push(`${name}.csv: docente inexistente "${row.docente_codigo}" en fila ${row._row}.`)
    if (!subjectKeys.has(`${row.plan_codigo}|${row.materia_codigo}`)) errors.push(`${name}.csv: materia inexistente "${row.plan_codigo}|${row.materia_codigo}" en fila ${row._row}.`)
  })
}
byName.alumno_carrera_plan.rows.forEach((row) => {
  if (!studentCodes.has(clean(row.alumno_codigo))) errors.push(`alumno_carrera_plan.csv: alumno inexistente "${row.alumno_codigo}" en fila ${row._row}.`)
  if (!careerCodes.has(clean(row.carrera_codigo))) errors.push(`alumno_carrera_plan.csv: carrera inexistente "${row.carrera_codigo}" en fila ${row._row}.`)
  if (!planCodes.has(clean(row.plan_codigo))) errors.push(`alumno_carrera_plan.csv: plan inexistente "${row.plan_codigo}" en fila ${row._row}.`)
})
byName.estado_academico_alumno.rows.forEach((row) => {
  if (!studentCodes.has(clean(row.alumno_codigo))) errors.push(`estado_academico_alumno.csv: alumno inexistente "${row.alumno_codigo}" en fila ${row._row}.`)
  if (!subjectKeys.has(`${row.plan_codigo}|${row.materia_codigo}`)) errors.push(`estado_academico_alumno.csv: materia inexistente en fila ${row._row}.`)
})

const cycles = detectCycles(byName.correlatividades.rows)
cycles.forEach((cycle) => errors.push(`correlatividades.csv: ciclo detectado ${cycle}.`))

if (!byName.estado_academico_alumno.rows.length) warnings.push('estado_academico_alumno.csv no contiene registros; no se cargaran notas ni condiciones.')
if (!byName.disponibilidad_docentes.rows.length) warnings.push('disponibilidad_docentes.csv no contiene registros.')
if (!byName.llamados_examen.rows.length) warnings.push('llamados_examen.csv no contiene registros.')

const summary = Object.fromEntries(datasets.map((dataset) => [dataset.name, dataset.rows.length]))
const report = {
  ok: errors.length === 0,
  generatedAt: new Date().toISOString(),
  dataDir: path.relative(process.cwd(), dataDir),
  summary,
  errors,
  warnings,
}

console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exitCode = 1
