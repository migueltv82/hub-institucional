import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

// I2a: historia academica previa (aprobadas, regulares, libres...). Se lee de la hoja historia_academica y se
// importa por la RPC academic_admin_import_student_history, que valida todo y nunca pisa notas del docente.

export const HISTORY_SHEET_NAME = 'historia_academica'
export const HISTORY_COLUMNS = Object.freeze(['dni', 'carrera', 'materia_codigo', 'condicion', 'nota', 'fecha', 'libro', 'folio'])
export const HISTORY_CHUNK_SIZE = 500

const COLUMN_ALIASES = Object.freeze({
  dni: ['dni', 'documento', 'nro_documento'],
  carrera: ['carrera', 'carrera_id', 'carrera_codigo'],
  materia: ['materia_codigo', 'materia', 'codigo_materia', 'materia_id'],
  condicion: ['condicion', 'estado', 'condicion_academica'],
  nota: ['nota', 'calificacion', 'nota_final'],
  fecha: ['fecha', 'fecha_examen', 'fecha_regularidad'],
  libro: ['libro'],
  folio: ['folio'],
})

export const HISTORY_REASONS = Object.freeze({
  FALTAN_DATOS: 'Faltan el DNI, la carrera o la materia.',
  CONDICION_INVALIDA: 'Condicion no valida. Usar: regular, libre, aprobada, promocionada o desaprobada.',
  NOTA_INVALIDA: 'La nota tiene que ser un numero de 0 a 10.',
  FECHA_INVALIDA: 'Fecha no valida o futura. Usar dd/mm/aaaa.',
  CARRERA_NO_ENCONTRADA: 'La carrera no existe en el catalogo de la institucion.',
  CARRERA_AMBIGUA: 'Hay mas de una carrera con ese nombre o codigo.',
  MATERIA_NO_ESTA_EN_EL_PLAN: 'La materia no esta en el plan de esa carrera.',
  ALUMNO_NO_ENCONTRADO: 'No hay un alumno con ese DNI en el padron.',
  ALUMNO_AMBIGUO: 'Hay mas de un legajo con ese DNI.',
  ALUMNO_DE_OTRA_CARRERA: 'El alumno con ese DNI tiene legajo en otra carrera: cargale el legajo de esta carrera.',
  ALUMNO_SIN_CUENTA: 'El alumno todavia no tiene acceso: crealo desde "Crear accesos" y volve a importar.',
  YA_TIENE_NOTAS_DEL_SISTEMA: 'La materia ya tiene notas cargadas por un docente: no se pisan.',
})

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// ExcelJS devuelve fechas como Date, numeros como number y celdas con formato como objetos.
function cellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    const day = String(value.getUTCDate()).padStart(2, '0')
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${value.getUTCFullYear()}`
  }
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result)
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
    if ('text' in value) return clean(value.text)
  }
  return clean(value)
}

function findHistorySheet(workbook) {
  const named = workbook.getWorksheet(HISTORY_SHEET_NAME)
  if (named) return named
  return workbook.worksheets.find((sheet) => {
    const headers = (sheet.getRow(1).values ?? []).map(normalizeHeader)
    return headers.includes('dni') && headers.some((header) => COLUMN_ALIASES.condicion.includes(header))
  }) ?? null
}

// Filas listas para la RPC: { fila, dni, carrera, materia, condicion, nota, fecha, libro, folio }.
export function readHistoryRowsFromWorkbook(workbook) {
  const sheet = findHistorySheet(workbook)
  if (!sheet) throw new Error(`La planilla no tiene la hoja "${HISTORY_SHEET_NAME}" (columnas: ${HISTORY_COLUMNS.join(', ')}).`)
  const headers = (sheet.getRow(1).values ?? []).map(normalizeHeader)
  const columnFor = (key) => headers.findIndex((header) => COLUMN_ALIASES[key].includes(header))
  const columns = Object.fromEntries(Object.keys(COLUMN_ALIASES).map((key) => [key, columnFor(key)]))
  const missing = ['dni', 'carrera', 'materia', 'condicion'].filter((key) => columns[key] < 0)
  if (missing.length) throw new Error(`A la hoja de historia le faltan columnas: ${missing.join(', ')}.`)

  const rows = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const value = (key) => (columns[key] < 0 ? '' : cellText(row.getCell(columns[key]).value))
    const item = { fila: String(rowNumber) }
    Object.keys(COLUMN_ALIASES).forEach((key) => { item[key] = value(key) })
    if (Object.keys(COLUMN_ALIASES).some((key) => item[key])) rows.push(item)
  })
  return rows
}

export async function parseStudentHistoryWorkbook(file) {
  if (clean(file?.name).split('.').pop()?.toLowerCase() !== 'xlsx') throw new Error('La historia academica tiene que ser un archivo XLSX.')
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const rows = readHistoryRowsFromWorkbook(workbook)
  if (!rows.length) throw new Error('La hoja de historia academica no tiene filas.')
  return rows
}

export async function buildStudentHistoryTemplateBuffer() {
  const excelModule = await import('exceljs')
  const ExcelJS = excelModule.default ?? excelModule
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(HISTORY_SHEET_NAME)
  sheet.addRow(HISTORY_COLUMNS)
  sheet.addRow(['30111222', 'PROFESORADO DE INGLES', 'ING01', 'aprobada', '8', '15/12/2024', '3', '27'])
  sheet.addRow(['30111222', 'PROFESORADO DE INGLES', 'ING02', 'regular', '', '20/11/2024', '', ''])
  sheet.getRow(1).font = { bold: true }
  sheet.columns.forEach((column) => { column.width = 22 })
  const help = workbook.addWorksheet('instrucciones')
  ;[
    ['Una fila por alumno y materia ya cursada o rendida.'],
    ['dni: el del padron de alumnos. El alumno tiene que tener acceso creado.'],
    ['carrera: nombre o codigo de la carrera, como figura en el plan de estudios.'],
    ['materia_codigo: el codigo de la materia en el plan.'],
    ['condicion: regular, libre, aprobada, promocionada o desaprobada.'],
    ['nota, fecha (dd/mm/aaaa), libro y folio son opcionales.'],
    ['Importar dos veces la misma planilla no duplica: actualiza.'],
    ['Si la materia ya tiene notas cargadas por un docente, la fila se omite.'],
  ].forEach((line) => help.addRow(line))
  help.getColumn(1).width = 90
  return workbook.xlsx.writeBuffer()
}

function assertRemote(institutionId) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Importar historia academica requiere Supabase configurado.')
  if (!clean(institutionId)) throw new Error('No hay una institucion activa.')
}

function translateError(error) {
  const message = clean(error?.message)
  if (error?.code === '42501') return 'Solo el owner, admin o editor de la institucion puede importar historia academica.'
  if (error?.code === 'PGRST202') return 'Falta actualizar la base de datos para importar historia academica. Avisale al responsable tecnico.'
  if (message.includes('STUDENT_HISTORY_TOO_MANY_ROWS')) return 'Demasiadas filas en un solo envio.'
  return 'No se pudo importar la historia academica.'
}

export function emptyHistoryImportReport() {
  return { procesadas: 0, importadas: 0, actualizadas: 0, omitidas: 0, rechazadas: 0, problemas: [] }
}

// Envia en lotes y suma los reportes. Si un lote falla, se corta y se informa lo ya importado.
export async function importStudentHistory({ institutionId, workspaceKey = 'main', rows = [], onProgress } = {}) {
  assertRemote(institutionId)
  const report = emptyHistoryImportReport()
  const list = Array.isArray(rows) ? rows : []
  for (let start = 0; start < list.length; start += HISTORY_CHUNK_SIZE) {
    const chunk = list.slice(start, start + HISTORY_CHUNK_SIZE)
    const { data, error } = await supabase.rpc('academic_admin_import_student_history', {
      p_institution_id: institutionId,
      p_workspace_key: workspaceKey,
      p_rows: chunk,
    })
    if (error) {
      const failure = new Error(translateError(error))
      failure.partialReport = report
      throw failure
    }
    for (const key of ['procesadas', 'importadas', 'actualizadas', 'omitidas', 'rechazadas']) report[key] += Number(data?.[key]) || 0
    report.problemas.push(...(Array.isArray(data?.problemas) ? data.problemas : []))
    onProgress?.({ done: Math.min(start + chunk.length, list.length), total: list.length })
  }
  return report
}

export function describeHistoryReason(reason) {
  return HISTORY_REASONS[reason] ?? reason
}
