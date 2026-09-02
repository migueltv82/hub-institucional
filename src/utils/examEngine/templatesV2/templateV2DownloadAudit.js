import {
  TEMPLATE_V2_REQUIRED_KEYS,
  TEMPLATE_V2_UNIQUE_KEYS,
} from '../audit/templateV2ValidationRules.js'

const EXPECTED_TEMPLATES = [
  'carreras_planes',
  'plan_estudios',
  'equivalencias_planes',
  'docentes',
  'docente_materia',
  'horarios_docentes',
  'disponibilidad_docente',
  'alumnos_inscripciones',
  'correlatividades',
  'calendario_mesas',
]

const PLAN_AWARE_TEMPLATES = new Set([
  'carreras_planes',
  'plan_estudios',
  'docente_materia',
  'horarios_docentes',
  'alumnos_inscripciones',
  'correlatividades',
])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function csvHeader(content = '') {
  const firstLine = clean(content).split(/\r?\n/)[0] ?? ''
  return firstLine.split(',').map(clean).filter(Boolean)
}

function templatesFromPayload(payload = {}) {
  if (payload?.sheets) {
    return payload.sheets.map((sheet) => ({
      name: sheet.name,
      filename: sheet.filename,
      columns: asArray(sheet.columns),
      requiredColumns: asArray(sheet.requiredColumns),
      uniqueKey: asArray(sheet.uniqueKey),
      rows: asArray(sheet.rows),
      content: sheet.csv,
    }))
  }

  if (payload?.csvFiles) {
    return payload.csvFiles.map((file) => ({
      name: file.templateName,
      filename: file.filename,
      columns: asArray(file.columns).length ? asArray(file.columns) : csvHeader(file.content),
      requiredColumns: asArray(file.requiredColumns),
      uniqueKey: asArray(file.uniqueKey),
      rows: [],
      content: file.content,
    }))
  }

  if (payload?.templates && typeof payload.templates === 'object') {
    return Object.values(payload.templates).map((template) => ({
      name: template.name,
      filename: template.filename,
      columns: asArray(template.columns),
      requiredColumns: asArray(template.requiredColumns),
      uniqueKey: asArray(template.uniqueKey),
      rows: asArray(template.rows),
      content: template.csv,
    }))
  }

  return []
}

function addIssue(collection, templateName, code, message, details = {}) {
  collection.push({
    templateName,
    code,
    message,
    ...details,
  })
}

function hasColumns(columns = [], expected = []) {
  return expected.every((column) => columns.includes(column))
}

function laborHasPlansInRows(templates = []) {
  const serializedRows = JSON.stringify(templates.flatMap((template) => template.rows ?? []))
  const serializedContent = templates.map((template) => template.content ?? '').join('\n')
  const combined = `${serializedRows}\n${serializedContent}`
  return combined.includes('LAB15-') && combined.includes('LAB24-')
}

function auditTemplate(template = {}) {
  const errors = []
  const warnings = []
  const name = template.name
  const columns = asArray(template.columns)
  const requiredColumns = TEMPLATE_V2_REQUIRED_KEYS[name] ?? []
  const expectedUniqueKey = TEMPLATE_V2_UNIQUE_KEYS[name] ?? []
  const uniqueKey = asArray(template.uniqueKey)

  if (!hasColumns(columns, requiredColumns)) {
    addIssue(
      errors,
      name,
      'FALTAN_COLUMNAS_REQUERIDAS',
      'La plantilla descargable v2 no incluye todas las columnas requeridas.',
      {
        missingColumns: requiredColumns.filter((column) => !columns.includes(column)),
      },
    )
  }

  if (!hasColumns(uniqueKey, expectedUniqueKey)) {
    addIssue(
      errors,
      name,
      'UNIQUE_KEY_INCOMPLETA',
      'La clave unica esperada no coincide con el contrato v2.',
      {
        expectedUniqueKey,
        uniqueKey,
      },
    )
  }

  if (uniqueKey.length === 1 && uniqueKey[0] === 'materia_nombre') {
    addIssue(
      errors,
      name,
      'UNIQUE_KEY_SOLO_MATERIA_NOMBRE',
      'materia_nombre no puede ser clave unica.',
      { uniqueKey },
    )
  }

  if (PLAN_AWARE_TEMPLATES.has(name) && !columns.includes('plan_id')) {
    addIssue(
      errors,
      name,
      'FALTA_PLAN_ID',
      'La plantilla critica debe incluir plan_id.',
    )
  }

  return {
    name,
    filename: template.filename,
    valid: errors.length === 0,
    columns: cloneJson(columns),
    requiredColumns: cloneJson(requiredColumns),
    uniqueKey: cloneJson(uniqueKey),
    errors,
    warnings,
  }
}

export function auditTemplateV2DownloadsAgainstContract(payloadOrDefinition = {}) {
  const templates = templatesFromPayload(payloadOrDefinition)
  const byName = new Map(templates.map((template) => [template.name, template]))
  const templateResults = []
  const errors = []
  const warnings = []

  EXPECTED_TEMPLATES.forEach((templateName) => {
    const template = byName.get(templateName)
    if (!template) {
      addIssue(
        errors,
        templateName,
        'PLANTILLA_FALTANTE',
        'Falta una plantilla esperada por el contrato v2.',
      )
      return
    }

    const result = auditTemplate(template)
    templateResults.push(result)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
  })

  const laboratorioCovered = laborHasPlansInRows(templates)
  if (!laboratorioCovered) {
    addIssue(
      errors,
      'templates-v2',
      'LABORATORIO_NO_CONTEMPLADO',
      'Los ejemplos descargables deben incluir materias de los planes 2015 y 2024 de Laboratorio.',
    )
  }

  return {
    valid: errors.length === 0,
    summary: {
      expectedTemplates: EXPECTED_TEMPLATES.length,
      templatesFound: templates.length,
      templatesValid: templateResults.filter((result) => result.valid).length,
      laboratorioCovered,
      errors: errors.length,
      warnings: warnings.length,
    },
    templateResults,
    warnings,
    errors,
  }
}

export { EXPECTED_TEMPLATES as TEMPLATE_V2_EXPECTED_DOWNLOAD_TEMPLATES }
