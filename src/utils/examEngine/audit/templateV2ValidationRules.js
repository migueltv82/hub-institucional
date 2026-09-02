export const TEMPLATE_V2_REQUIRED_KEYS = Object.freeze({
  carreras_planes: [
    'carrera_id',
    'carrera_nombre',
    'plan_id',
    'plan_nombre',
    'anio_plan',
    'estado_plan',
  ],
  plan_estudios: [
    'plan_id',
    'carrera_id',
    'materia_id',
    'materia_codigo',
    'materia_nombre',
    'anio_cursada',
    'regimen',
    'requiere_mesa',
  ],
  equivalencias_planes: [
    'carrera_id',
    'plan_origen_id',
    'materia_origen_id',
    'materia_origen_codigo',
    'plan_destino_id',
    'materia_destino_id',
    'materia_destino_codigo',
    'tipo_equivalencia',
  ],
  docentes: [
    'docente_id',
    'apellido',
    'nombre',
    'dni_docente',
    'estado_docente',
    'horas_catedra',
  ],
  docente_materia: [
    'plan_id',
    'carrera_id',
    'materia_id',
    'materia_codigo',
    'materia_nombre',
    'docente_id',
    'rol_en_materia',
    'estado_asignacion',
    'requiere_mesa',
  ],
  horarios_docentes: [
    'plan_id',
    'carrera_id',
    'materia_id',
    'materia_codigo',
    'materia_nombre',
    'docente_id',
    'dia',
    'hora_inicio',
    'hora_fin',
  ],
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
    'carrera_id',
    'plan_id',
    'materia_id',
    'materia_codigo',
    'condicion',
  ],
  correlatividades: [
    'plan_id',
    'carrera_id',
    'materia_id',
    'materia_codigo',
    'correlativa_codigo',
    'correlativa_id',
    'tipo_correlativa',
    'requisito',
  ],
  calendario_mesas: [
    'llamado_id',
    'llamado',
    'fecha',
    'turno',
    'hora_inicio',
    'hora_fin',
    'habilitado',
  ],
})

export const TEMPLATE_V2_UNIQUE_KEYS = Object.freeze({
  carreras_planes: ['carrera_id', 'plan_id'],
  plan_estudios: ['materia_id'],
  equivalencias_planes: [
    'materia_origen_id',
    'materia_destino_id',
  ],
  docentes: ['docente_id'],
  docente_materia: ['materia_id', 'docente_id'],
  horarios_docentes: [
    'materia_id',
    'docente_id',
    'dia',
    'hora_inicio',
    'hora_fin',
  ],
  disponibilidad_docente: ['docente_id', 'dia', 'hora_desde', 'hora_hasta'],
  alumnos_inscripciones: ['alumno_id', 'materia_id'],
  correlatividades: ['materia_id', 'correlativa_id', 'tipo_correlativa'],
  calendario_mesas: ['llamado_id'],
})

export const TEMPLATE_V2_ALLOWED_VALUES = Object.freeze({
  estado_plan: ['VIGENTE', 'CONVIVIENTE', 'CERRADO', 'REEMPLAZADO'],
  regimen: ['ANUAL', 'CUATRIMESTRAL'],
  cuatrimestre: ['1', '2'],
  requiere_mesa: ['SI', 'NO', 'TRUE', 'FALSE', '1', '0', true, false, 1, 0],
  rol_en_materia: ['TITULAR', 'REEMPLAZO', 'SUPLENTE', 'CO_DOCENTE', 'AUXILIAR'],
  estado_asignacion: ['ACTIVO', 'LICENCIA', 'RENUNCIA', 'BAJA', 'REEMPLAZADO'],
})

const CRITICAL_SUBJECT_TEMPLATES = new Set([
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

function normalizeColumn(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
}

function normalizeValue(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return value
  return clean(value).toUpperCase()
}

function templatesFromDefinition(definition = {}) {
  if (!definition || typeof definition !== 'object') return {}
  return definition.templates && typeof definition.templates === 'object'
    ? definition.templates
    : definition
}

function columnsFor(template = {}) {
  return asArray(template.columns).map(normalizeColumn)
}

function uniqueKeyFor(template = {}) {
  const value = template.uniqueKey ?? template.unique_key ?? template.uniqueKeys ?? template.unique_keys
  if (Array.isArray(value) && Array.isArray(value[0])) return value[0].map(normalizeColumn)
  return asArray(value).map(normalizeColumn)
}

function rowsFor(template = {}) {
  return asArray(template.rows ?? template.sampleRows)
}

function hasAll(columns = [], expected = []) {
  const columnSet = new Set(columns)
  return expected.every((column) => columnSet.has(normalizeColumn(column)))
}

function missingColumns(columns = [], expected = []) {
  const columnSet = new Set(columns)
  return expected.map(normalizeColumn).filter((column) => !columnSet.has(column))
}

function addError(errors, templateName, code, message, details = {}) {
  errors.push({
    template: templateName,
    code,
    message,
    ...details,
  })
}

function rowValue(row = {}, field) {
  if (!row || typeof row !== 'object') return undefined
  const wanted = normalizeColumn(field)
  const entry = Object.entries(row).find(([key]) => normalizeColumn(key) === wanted)
  return entry?.[1]
}

function checkRequiredColumns({ templateName, template, errors }) {
  const required = TEMPLATE_V2_REQUIRED_KEYS[templateName]
  if (!required) return

  const missing = missingColumns(columnsFor(template), required)
  if (!missing.length) return

  addError(
    errors,
    templateName,
    'FALTAN_COLUMNAS_REQUERIDAS',
    'La plantilla no declara todas las columnas requeridas por templates v2.',
    { missing },
  )
}

function checkUniqueKey({ templateName, template, errors }) {
  const expectedKey = TEMPLATE_V2_UNIQUE_KEYS[templateName]
  if (!expectedKey) return

  const uniqueKey = uniqueKeyFor(template)
  if (!uniqueKey.length) {
    addError(
      errors,
      templateName,
      'FALTA_UNIQUE_KEY',
      'La plantilla debe declarar una clave unica.',
      { expectedKey },
    )
    return
  }

  if (uniqueKey.length === 1 && uniqueKey[0] === 'materia_nombre') {
    addError(
      errors,
      templateName,
      'UNIQUE_KEY_SOLO_MATERIA_NOMBRE',
      'Ninguna plantilla critica puede depender solo de materia_nombre.',
      { uniqueKey },
    )
  }

  if (CRITICAL_SUBJECT_TEMPLATES.has(templateName) && !hasAll(uniqueKey, expectedKey)) {
    addError(
      errors,
      templateName,
      'UNIQUE_KEY_INCOMPLETA',
      'La clave unica no incluye la clave canonica requerida por templates v2.',
      { expectedKey, uniqueKey },
    )
  }
}

function checkNoNameOnlyCriticalTemplate({ templateName, template, errors }) {
  if (!CRITICAL_SUBJECT_TEMPLATES.has(templateName)) return

  const columns = columnsFor(template)
  if (!columns.includes('materia_nombre')) return
  if (columns.includes('plan_id') && columns.includes('materia_codigo')) return

  addError(
    errors,
    templateName,
    'PLANTILLA_DEPENDE_DE_NOMBRE_MATERIA',
    'La plantilla declara materia_nombre pero no declara plan_id + materia_codigo.',
  )
}

function checkAllowedValues({ templateName, template, errors }) {
  const allowedValues = template.allowedValues ?? template.allowed_values ?? {}
  const rows = rowsFor(template)

  Object.entries(allowedValues).forEach(([field, values]) => {
    const allowed = TEMPLATE_V2_ALLOWED_VALUES[normalizeColumn(field)]
    if (!allowed) return

    const invalidDeclared = asArray(values)
      .map(normalizeValue)
      .filter((value) => !allowed.map(normalizeValue).includes(value))

    if (invalidDeclared.length) {
      addError(
        errors,
        templateName,
        'VALOR_PERMITIDO_INVALIDO',
        'La definicion declara valores permitidos fuera del contrato v2.',
        { field: normalizeColumn(field), invalidValues: invalidDeclared },
      )
    }
  })

  rows.forEach((row, rowIndex) => {
    Object.entries(TEMPLATE_V2_ALLOWED_VALUES).forEach(([field, allowed]) => {
      const value = rowValue(row, field)
      if (value === undefined || value === null || clean(value) === '') return

      const normalizedAllowed = allowed.map(normalizeValue)
      if (!normalizedAllowed.includes(normalizeValue(value))) {
        addError(
          errors,
          templateName,
          'VALOR_DE_FILA_INVALIDO',
          'Una fila contiene un valor fuera del contrato v2.',
          {
            field,
            rowIndex,
            rowNumber: rowIndex + 1,
          },
        )
      }
    })
  })
}

function checkDuplicateRows({ templateName, template, errors }) {
  const uniqueKey = uniqueKeyFor(template)
  const rows = rowsFor(template)
  if (!uniqueKey.length || !rows.length) return

  const seen = new Map()

  rows.forEach((row, rowIndex) => {
    const key = uniqueKey.map((field) => clean(rowValue(row, field))).join('::')
    if (!key.replaceAll('::', '')) return

    const previous = seen.get(key)
    if (previous !== undefined) {
      addError(
        errors,
        templateName,
        'UNIQUE_KEY_DUPLICADA',
        'La plantilla contiene filas duplicadas para su clave unica.',
        {
          uniqueKey,
          firstRowNumber: previous + 1,
          rowNumber: rowIndex + 1,
        },
      )
      return
    }

    seen.set(key, rowIndex)
  })
}

function buildSummary(templates = {}, errors = [], warnings = []) {
  return {
    templatesChecked: Object.keys(templates).length,
    errors: errors.length,
    warnings: warnings.length,
    valid: errors.length === 0,
  }
}

export function validateTemplateV2SchemaDefinition(definition = {}) {
  const templates = templatesFromDefinition(definition)
  const errors = []
  const warnings = []

  Object.keys(TEMPLATE_V2_REQUIRED_KEYS).forEach((templateName) => {
    const template = templates[templateName]
    if (!template) return

    checkRequiredColumns({ templateName, template, errors })
    checkUniqueKey({ templateName, template, errors })
    checkNoNameOnlyCriticalTemplate({ templateName, template, errors })
    checkAllowedValues({ templateName, template, errors })
    checkDuplicateRows({ templateName, template, errors })
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: buildSummary(templates, errors, warnings),
  }
}
