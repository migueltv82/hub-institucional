import {
  TEMPLATE_V2_DOWNLOAD_MIME_TYPES,
  buildTemplateV2CsvFiles,
  buildTemplateV2Manifest,
  buildTemplateV2ReadmeText,
  buildTemplateV2WorkbookDefinition,
} from './templateV2Downloads.js'

let excelModulePromise = null

async function loadExcelJS() {
  if (!excelModulePromise) {
    excelModulePromise = import('exceljs')
  }
  const module = await excelModulePromise
  return module.default ?? module
}

function createTextDownload({ content, fileName, mimeType, documentRef, urlRef }) {
  if (!documentRef || !urlRef) {
    throw new Error('No hay contexto de navegador disponible para descargar plantillas v2.')
  }

  const blob = new Blob([content], { type: mimeType })
  const objectUrl = urlRef.createObjectURL(blob)
  const anchor = documentRef.createElement('a')

  anchor.href = objectUrl
  anchor.download = fileName
  anchor.rel = 'noopener'
  documentRef.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  urlRef.revokeObjectURL(objectUrl)
}

function createBinaryDownload({ content, fileName, mimeType, documentRef, urlRef }) {
  if (!documentRef || !urlRef) {
    throw new Error('No hay contexto de navegador disponible para descargar plantillas v2.')
  }

  const blob = new Blob([content], { type: mimeType })
  const objectUrl = urlRef.createObjectURL(blob)
  const anchor = documentRef.createElement('a')

  anchor.href = objectUrl
  anchor.download = fileName
  anchor.rel = 'noopener'
  documentRef.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  urlRef.revokeObjectURL(objectUrl)
}

function normalizeSheetName(name = '', usedNames = new Set()) {
  const base = String(name || 'Hoja')
    .replaceAll(/[\\/*?:[\]]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Hoja'
  let candidate = base
  let counter = 2

  while (usedNames.has(candidate)) {
    const suffix = ` ${counter}`
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    counter += 1
  }

  usedNames.add(candidate)
  return candidate
}

function styleWorksheet(worksheet) {
  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).alignment = { vertical: 'middle' }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  }
}

const RELATED_MATERIA_COLUMNS = Object.freeze({
  docente_materia: { id: 'materia_id', fields: { plan_id: 'plan_id', carrera_id: 'carrera_id', materia_codigo: 'materia_codigo', materia_nombre: 'materia_nombre' } },
  horarios_docentes: { id: 'materia_id', fields: { plan_id: 'plan_id', carrera_id: 'carrera_id', materia_codigo: 'materia_codigo', materia_nombre: 'materia_nombre' } },
  alumnos_inscripciones: { id: 'materia_id', fields: { plan_id: 'plan_id', carrera_id: 'carrera_id', materia_codigo: 'materia_codigo', materia_nombre: 'materia_nombre' } },
  correlatividades: { id: 'materia_id', fields: { plan_id: 'plan_id', carrera_id: 'carrera_id', materia_codigo: 'materia_codigo', materia_nombre: 'materia_nombre' } },
})

const RELATED_DOCENTE_SHEETS = new Set([
  'docente_materia',
  'horarios_docentes',
  'disponibilidad_docente',
])

function columnNumber(worksheet, key) {
  return worksheet.columns.findIndex((column) => column.key === key) + 1
}

function columnLetter(number) {
  let value = number
  let result = ''
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

function lookupFormula({ rowNumber, localIdColumn, sourceSheet, sourceIdColumn, sourceValueColumn }) {
  const localId = `$${columnLetter(localIdColumn)}${rowNumber}`
  const sourceId = `$${columnLetter(sourceIdColumn)}:$${columnLetter(sourceIdColumn)}`
  const sourceValue = `$${columnLetter(sourceValueColumn)}:$${columnLetter(sourceValueColumn)}`
  return `IF(${localId}="","",IFERROR(INDEX(${sourceSheet}!${sourceValue},MATCH(${localId},${sourceSheet}!${sourceId},0)),""))`
}

function setLookupCell({ worksheet, rowNumber, targetKey, idKey, sourceWorksheet, sourceKey }) {
  const targetColumn = columnNumber(worksheet, targetKey)
  const localIdColumn = columnNumber(worksheet, idKey)
  const sourceIdColumn = columnNumber(sourceWorksheet, idKey)
  const sourceValueColumn = columnNumber(sourceWorksheet, sourceKey)
  if (![targetColumn, localIdColumn, sourceIdColumn, sourceValueColumn].every(Boolean)) return
  const cell = worksheet.getCell(rowNumber, targetColumn)
  const currentResult = cell.value ?? ''
  cell.value = {
    formula: lookupFormula({
      rowNumber,
      localIdColumn,
      sourceSheet: sourceWorksheet.name,
      sourceIdColumn,
      sourceValueColumn,
    }),
    result: currentResult,
  }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } }
}

function setTeacherNameCell(worksheet, rowNumber, teachers) {
  const targetColumn = columnNumber(worksheet, 'docente')
  const localIdColumn = columnNumber(worksheet, 'docente_id')
  const sourceIdColumn = columnNumber(teachers, 'docente_id')
  const surnameColumn = columnNumber(teachers, 'apellido')
  const nameColumn = columnNumber(teachers, 'nombre')
  if (![targetColumn, localIdColumn, sourceIdColumn, surnameColumn, nameColumn].every(Boolean)) return
  const localId = `$${columnLetter(localIdColumn)}${rowNumber}`
  const sourceId = `$${columnLetter(sourceIdColumn)}:$${columnLetter(sourceIdColumn)}`
  const match = `MATCH(${localId},docentes!${sourceId},0)`
  const cell = worksheet.getCell(rowNumber, targetColumn)
  const currentResult = cell.value ?? ''
  cell.value = {
    formula: `IF(${localId}="","",TRIM(IFERROR(INDEX(docentes!$${columnLetter(surnameColumn)}:$${columnLetter(surnameColumn)},${match}),"")&" "&IFERROR(INDEX(docentes!$${columnLetter(nameColumn)}:$${columnLetter(nameColumn)},${match}),"")))`,
    result: currentResult,
  }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } }
}

function applyAutomaticRelationships(workbook) {
  const subjects = workbook.getWorksheet('plan_estudios')
  const teachers = workbook.getWorksheet('docentes')
  if (!subjects || !teachers) return

  workbook.definedNames.add("'plan_estudios'!$C$2:$C$1000", 'ListaMateriaIds')
  workbook.definedNames.add("'docentes'!$A$2:$A$1000", 'ListaDocenteIds')

  const maxRows = 500
  const regimenColumn = columnNumber(subjects, 'regimen')
  const cuatrimestreColumn = columnNumber(subjects, 'cuatrimestre')
  for (let rowNumber = 2; rowNumber <= maxRows; rowNumber += 1) {
    subjects.getCell(rowNumber, regimenColumn).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"ANUAL,CUATRIMESTRAL"'],
      showErrorMessage: true,
      errorTitle: 'Regimen invalido',
      error: 'Elegir ANUAL o CUATRIMESTRAL.',
      showInputMessage: true,
      promptTitle: 'Regimen de cursada',
      prompt: 'Elegir si la materia es anual o cuatrimestral.',
    }
    subjects.getCell(rowNumber, cuatrimestreColumn).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"1,2"'],
      showInputMessage: true,
      promptTitle: 'Cuatrimestre',
      prompt: 'Elegir 1 o 2 solo si el regimen es CUATRIMESTRAL.',
    }
  }
  Object.entries(RELATED_MATERIA_COLUMNS).forEach(([sheetName, relationship]) => {
    const worksheet = workbook.getWorksheet(sheetName)
    if (!worksheet) return
    const idColumn = columnNumber(worksheet, relationship.id)
    for (let rowNumber = 2; rowNumber <= maxRows; rowNumber += 1) {
      const idCell = worksheet.getCell(rowNumber, idColumn)
      idCell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['ListaMateriaIds'],
        showInputMessage: true,
        promptTitle: 'Materia',
        prompt: 'Elegir el materia_id de la hoja plan_estudios.',
      }
      idCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
      Object.entries(relationship.fields).forEach(([targetKey, sourceKey]) => {
        setLookupCell({ worksheet, rowNumber, targetKey, idKey: relationship.id, sourceWorksheet: subjects, sourceKey })
      })
    }
  })

  const correlativities = workbook.getWorksheet('correlatividades')
  const equivalences = workbook.getWorksheet('equivalencias_planes')
  if (correlativities) {
    for (let rowNumber = 2; rowNumber <= maxRows; rowNumber += 1) {
      const idCell = correlativities.getCell(rowNumber, columnNumber(correlativities, 'correlativa_id'))
      idCell.dataValidation = { type: 'list', allowBlank: true, formulae: ['ListaMateriaIds'] }
      setLookupCell({ worksheet: correlativities, rowNumber, targetKey: 'correlativa_codigo', idKey: 'correlativa_id', sourceWorksheet: subjects, sourceKey: 'materia_codigo' })
      setLookupCell({ worksheet: correlativities, rowNumber, targetKey: 'correlativa_nombre', idKey: 'correlativa_id', sourceWorksheet: subjects, sourceKey: 'materia_nombre' })
    }
  }
  if (equivalences) {
    for (let rowNumber = 2; rowNumber <= maxRows; rowNumber += 1) {
      ;[
        ['materia_origen_id', 'plan_origen_id', 'materia_origen_codigo', 'materia_origen_nombre'],
        ['materia_destino_id', 'plan_destino_id', 'materia_destino_codigo', 'materia_destino_nombre'],
      ].forEach(([idKey, planKey, codeKey, nameKey]) => {
        const idCell = equivalences.getCell(rowNumber, columnNumber(equivalences, idKey))
        idCell.dataValidation = { type: 'list', allowBlank: true, formulae: ['ListaMateriaIds'] }
        setLookupCell({ worksheet: equivalences, rowNumber, targetKey: planKey, idKey, sourceWorksheet: subjects, sourceKey: 'plan_id' })
        setLookupCell({ worksheet: equivalences, rowNumber, targetKey: codeKey, idKey, sourceWorksheet: subjects, sourceKey: 'materia_codigo' })
        setLookupCell({ worksheet: equivalences, rowNumber, targetKey: nameKey, idKey, sourceWorksheet: subjects, sourceKey: 'materia_nombre' })
      })
      setLookupCell({ worksheet: equivalences, rowNumber, targetKey: 'carrera_id', idKey: 'materia_origen_id', sourceWorksheet: subjects, sourceKey: 'carrera_id' })
    }
  }

  RELATED_DOCENTE_SHEETS.forEach((sheetName) => {
    const worksheet = workbook.getWorksheet(sheetName)
    if (!worksheet) return
    const teacherIdColumn = columnNumber(worksheet, 'docente_id')
    for (let rowNumber = 2; rowNumber <= maxRows; rowNumber += 1) {
      worksheet.getCell(rowNumber, teacherIdColumn).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['ListaDocenteIds'],
      }
      setLookupCell({ worksheet, rowNumber, targetKey: 'dni_docente', idKey: 'docente_id', sourceWorksheet: teachers, sourceKey: 'dni_docente' })
      setTeacherNameCell(worksheet, rowNumber, teachers)
    }
  })
}

function addTemplateSheet(workbook, sheet, usedNames) {
  const worksheet = workbook.addWorksheet(normalizeSheetName(sheet.name, usedNames))
  worksheet.columns = sheet.columns.map((column) => ({
    header: column,
    key: column,
    width: Math.min(Math.max(String(column).length + 4, 16), 34),
  }))
  worksheet.addRows(sheet.rows)
  styleWorksheet(worksheet)
  return worksheet
}

function addReadmeSheet(workbook, readme, usedNames) {
  const worksheet = workbook.addWorksheet(normalizeSheetName('README', usedNames))
  worksheet.columns = [{ header: 'guia', key: 'guia', width: 120 }]
  String(readme ?? '').split('\n').forEach((line) => worksheet.addRow({ guia: line }))
  worksheet.getRow(1).font = { bold: true }
  return worksheet
}

function addManifestSheet(workbook, manifest, usedNames) {
  const worksheet = workbook.addWorksheet(normalizeSheetName('MANIFEST', usedNames))
  worksheet.columns = [
    { header: 'orden', key: 'orden', width: 10 },
    { header: 'plantilla', key: 'plantilla', width: 30 },
    { header: 'clave_unica', key: 'clave_unica', width: 42 },
    { header: 'columnas_requeridas', key: 'columnas_requeridas', width: 70 },
    { header: 'descripcion', key: 'descripcion', width: 80 },
  ]
  ;(manifest.templates ?? []).forEach((template) => {
    worksheet.addRow({
      orden: template.recommendedLoadOrder,
      plantilla: template.name,
      clave_unica: (template.uniqueKey ?? []).join(' + '),
      columnas_requeridas: (template.requiredColumns ?? []).join(', '),
      descripcion: template.description,
    })
  })
  styleWorksheet(worksheet)
  return worksheet
}

export async function buildTemplateV2XlsxBuffer(options = {}) {
  const ExcelJS = await loadExcelJS()
  const definition = buildTemplateV2WorkbookDefinition(options)
  const workbook = new ExcelJS.Workbook()
  const usedNames = new Set()

  workbook.creator = 'examEngine'
  workbook.created = new Date()
  workbook.modified = new Date()

  addReadmeSheet(workbook, definition.readme, usedNames)
  addManifestSheet(workbook, definition.manifest, usedNames)
  definition.sheets.forEach((sheet) => addTemplateSheet(workbook, sheet, usedNames))
  applyAutomaticRelationships(workbook)

  return workbook.xlsx.writeBuffer()
}

export async function downloadTemplateV2Workbook({
  documentRef = document,
  urlRef = URL,
  fileName = 'plantillas-exam-engine-v2.xlsx',
  options = {},
} = {}) {
  const buffer = await buildTemplateV2XlsxBuffer(options)
  createBinaryDownload({
    content: buffer,
    fileName,
    mimeType: TEMPLATE_V2_DOWNLOAD_MIME_TYPES.xlsx,
    documentRef,
    urlRef,
  })

  return {
    fileName,
    sheets: buildTemplateV2WorkbookDefinition(options).sheets.length + 2,
  }
}

export function downloadTemplateV2CsvBundle({
  documentRef = document,
  urlRef = URL,
  options = {},
} = {}) {
  const payload = buildTemplateV2AssetPayload(options)

  payload.files.forEach((file, index) => {
    const download = () => createTextDownload({
      content: file.content,
      fileName: file.filename,
      mimeType: file.mimeType,
      documentRef,
      urlRef,
    })

    if (index === 0 || typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
      download()
      return
    }

    window.setTimeout(download, index * 80)
  })

  return payload.summary
}

export function buildTemplateV2AssetPayload(options = {}) {
  const csvFiles = buildTemplateV2CsvFiles(options)
  const manifest = buildTemplateV2Manifest(options)
  const readme = buildTemplateV2ReadmeText(options)

  return {
    kind: 'examEngine.templatesV2.assetPayload',
    zipSupported: false,
    reason: 'No se agrega dependencia ZIP; se entrega definicion logica y archivos CSV independientes.',
    csvFiles,
    manifest,
    readme,
    files: [
      ...csvFiles,
      {
        templateName: 'templates_v2_manifest',
        filename: 'templates_v2_manifest.json',
        mimeType: TEMPLATE_V2_DOWNLOAD_MIME_TYPES.json,
        content: JSON.stringify(manifest, null, 2),
      },
      {
        templateName: 'README',
        filename: 'README.md',
        mimeType: TEMPLATE_V2_DOWNLOAD_MIME_TYPES.markdown,
        content: readme,
      },
    ],
    summary: {
      csvFiles: csvFiles.length,
      totalFiles: csvFiles.length + 2,
      includesManifest: true,
      includesReadme: true,
      includesZip: false,
      rule: manifest.rule,
    },
  }
}

export function downloadTemplateV2Readme({
  documentRef = document,
  urlRef = URL,
  fileName = 'README.templates-v2.md',
  options = {},
} = {}) {
  createTextDownload({
    content: buildTemplateV2ReadmeText(options),
    fileName,
    mimeType: TEMPLATE_V2_DOWNLOAD_MIME_TYPES.markdown,
    documentRef,
    urlRef,
  })
}

export function downloadTemplateV2Manifest({
  documentRef = document,
  urlRef = URL,
  fileName = 'templates_v2_manifest.json',
  options = {},
} = {}) {
  createTextDownload({
    content: JSON.stringify(buildTemplateV2Manifest(options), null, 2),
    fileName,
    mimeType: TEMPLATE_V2_DOWNLOAD_MIME_TYPES.json,
    documentRef,
    urlRef,
  })
}
