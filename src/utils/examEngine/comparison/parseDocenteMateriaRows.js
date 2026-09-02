const CANONICAL_COLUMNS = [
  'carrera',
  'materia_codigo',
  'materia_nombre',
  'anio',
  'docente',
  'dni_docente',
  'rol_en_materia',
  'estado_asignacion',
  'vigencia_desde',
  'vigencia_hasta',
  'docente_reemplazado',
  'requiere_mesa',
  'observaciones',
]

const VALID_ROLES = new Set(['TITULAR', 'REEMPLAZO', 'SUPLENTE', 'CO_DOCENTE', 'AUXILIAR'])
const VALID_ESTADOS = new Set(['ACTIVO', 'LICENCIA', 'RENUNCIA', 'BAJA', 'REEMPLAZADO'])

const FIELD_ALIASES = {
  carrera: ['carrera', 'career', 'programa'],
  materia_codigo: ['materia_codigo', 'materiacodigo', 'codigo_materia', 'codigomateria', 'codigo', 'code'],
  materia_nombre: ['materia_nombre', 'materianombre', 'nombre_materia', 'nombremateria', 'materia', 'unidad_curricular', 'unidadcurricular', 'espacio', 'asignatura'],
  anio: ['anio', 'ano', 'curso', 'year'],
  docente: ['docente', 'profesor', 'apellido_nombre', 'apellidonombre', 'docente_nombre', 'docentenombre', 'nombre_docente', 'nombredocente'],
  dni_docente: ['dni_docente', 'dnidocente', 'dni', 'documento', 'document'],
  rol_en_materia: ['rol_en_materia', 'rolenmateria', 'rol', 'role'],
  estado_asignacion: ['estado_asignacion', 'estadoasignacion', 'estado', 'status', 'situacion'],
  vigencia_desde: ['vigencia_desde', 'vigenciadesde', 'desde'],
  vigencia_hasta: ['vigencia_hasta', 'vigenciahasta', 'hasta'],
  docente_reemplazado: ['docente_reemplazado', 'docentereemplazado', 'docente_reemplazado_id', 'docentereemplazadoid', 'reemplaza_a', 'reemplazaa'],
  requiere_mesa: ['requiere_mesa', 'requieremesa', 'requiere mesa', 'requires_mesa', 'requiresmesa'],
  observaciones: ['observaciones', 'observacion', 'notas', 'nota'],
  origen: ['origen', 'fuente', 'source'],
  nivel_confianza: ['nivel_confianza', 'nivelconfianza', 'confidence'],
  requiere_revision: ['requiere_revision', 'requiererevision'],
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeHeader(value) {
  return normalizeToken(value)
}

function normalizeEnumToken(value) {
  return normalizeText(value)
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .toUpperCase()
}

function normalizeRole(value) {
  const role = normalizeEnumToken(value)
  if (role === 'CODOCENTE' || role === 'CO_DOCENCIA') return 'CO_DOCENTE'
  if (role === 'REEMPLAZANTE') return 'REEMPLAZO'
  return role
}

function normalizeEstado(value) {
  const estado = normalizeEnumToken(value)
  if (estado === 'ACTIVA') return 'ACTIVO'
  if (estado === 'RENUNCIADO') return 'RENUNCIA'
  if (estado === 'INACTIVO') return 'BAJA'
  return estado
}

function isEmptyValue(value) {
  return clean(value) === ''
}

function isEmptyRow(row = {}) {
  if (!row || typeof row !== 'object') return true
  return Object.values(row).every(isEmptyValue)
}

function buildHeaderLookup(row = {}) {
  return Object.entries(row).reduce((lookup, [key, value]) => {
    lookup.set(normalizeHeader(key), value)
    return lookup
  }, new Map())
}

function readField(row = {}, field) {
  const lookup = buildHeaderLookup(row)
  for (const alias of FIELD_ALIASES[field] ?? [field]) {
    const value = lookup.get(normalizeHeader(alias))
    if (value !== undefined) return clean(value)
  }
  return ''
}

function parseDateLike(value) {
  const text = clean(value)
  if (!text) return { value: '', valid: true }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00`)
    const valid = !Number.isNaN(date.getTime()) && text === [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    return valid ? { value: text, valid: true } : { value: '', valid: false }
  }

  const dateParts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dateParts) {
    const day = Number(dateParts[1])
    const month = Number(dateParts[2])
    const year = Number(dateParts[3])
    const date = new Date(year, month - 1, day)
    const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    return {
      value: valid
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : '',
      valid,
    }
  }

  return { value: '', valid: false }
}

function parseRequiereMesa(value) {
  if (value === undefined || value === null || clean(value) === '') return { value: null, valid: true }
  if (value === true || value === 1) return { value: true, valid: true }
  if (value === false || value === 0) return { value: false, valid: true }

  const token = normalizeToken(value)
  if (['si', 'true', '1'].includes(token)) return { value: true, valid: true }
  if (['no', 'false', '0'].includes(token)) return { value: false, valid: true }
  return { value: null, valid: false }
}

function addIssue(collection, { rowIndex, code, field = '', message }) {
  collection.push({
    rowIndex,
    rowNumber: rowIndex + 1,
    code,
    field,
    message,
  })
}

function countBy(rows = [], predicate) {
  return rows.filter(predicate).length
}

function buildSummary({ inputRows, rows, errors, warnings, ignoredRows }) {
  const warningRowIndexes = new Set(warnings.map((warning) => warning.rowIndex))
  const errorRowIndexes = new Set(errors.map((error) => error.rowIndex))

  return {
    totalRowsRead: inputRows.length,
    ignoredRows,
    validRows: rows.length,
    errors: errors.length,
    warnings: warnings.length,
    rowsWithErrors: errorRowIndexes.size,
    rowsWithWarnings: warningRowIndexes.size,
    titularesActivos: countBy(rows, (row) => row.rol_en_materia === 'TITULAR' && row.estado_asignacion === 'ACTIVO'),
    reemplazosActivos: countBy(rows, (row) => row.rol_en_materia === 'REEMPLAZO' && row.estado_asignacion === 'ACTIVO'),
    suplentesActivos: countBy(rows, (row) => row.rol_en_materia === 'SUPLENTE' && row.estado_asignacion === 'ACTIVO'),
    coDocentesActivos: countBy(rows, (row) => row.rol_en_materia === 'CO_DOCENTE' && row.estado_asignacion === 'ACTIVO'),
    filasConEstadoInferido: countBy(rows, (row) => row.estadoInferido === true),
    filasConRolVacio: countBy(rows, (row) => !row.rol_en_materia),
    requiereMesaSi: countBy(rows, (row) => row.requiere_mesa === true),
    requiereMesaNo: countBy(rows, (row) => row.requiere_mesa === false),
  }
}

export function parseDocenteMateriaRows(rawRows = [], options = {}) {
  const inputRows = asArray(rawRows)
  const rows = []
  const errors = []
  const warnings = []
  let ignoredRows = 0

  inputRows.forEach((rawRow, rowIndex) => {
    if (isEmptyRow(rawRow)) {
      ignoredRows += 1
      return
    }

    const carrera = readField(rawRow, 'carrera')
    const materia_codigo = readField(rawRow, 'materia_codigo')
    const materia_nombre = readField(rawRow, 'materia_nombre')
    const anio = readField(rawRow, 'anio')
    const docente = readField(rawRow, 'docente')
    const dni_docente = readField(rawRow, 'dni_docente')
    const rawRol = readField(rawRow, 'rol_en_materia')
    const rawEstado = readField(rawRow, 'estado_asignacion')
    const observaciones = readField(rawRow, 'observaciones')
    const docente_reemplazado = readField(rawRow, 'docente_reemplazado')
    const desde = parseDateLike(readField(rawRow, 'vigencia_desde'))
    const hasta = parseDateLike(readField(rawRow, 'vigencia_hasta'))
    const requiereMesa = parseRequiereMesa(readField(rawRow, 'requiere_mesa'))
    const rowErrors = []

    const docenteVacioPermitido = options.allowEmptyDocenteWhenNoRequiereMesa === true && requiereMesa.value === false

    if (!carrera) addIssue(rowErrors, { rowIndex, code: 'FALTA_CARRERA', field: 'carrera', message: 'La carrera es obligatoria.' })
    if (!materia_nombre) addIssue(rowErrors, { rowIndex, code: 'FALTA_MATERIA_NOMBRE', field: 'materia_nombre', message: 'La materia_nombre es obligatoria.' })
    if (!docente && !docenteVacioPermitido) addIssue(rowErrors, { rowIndex, code: 'FALTA_DOCENTE', field: 'docente', message: 'El docente es obligatorio.' })

    const rol_en_materia = rawRol ? normalizeRole(rawRol) : ''
    if (!rawRol) {
      addIssue(warnings, {
        rowIndex,
        code: 'ROL_EN_MATERIA_VACIO',
        field: 'rol_en_materia',
        message: 'Rol vacio permitido; se resolvera con reglas institucionales o revision.',
      })
    } else if (!VALID_ROLES.has(rol_en_materia)) {
      addIssue(rowErrors, {
        rowIndex,
        code: 'ROL_EN_MATERIA_INVALIDO',
        field: 'rol_en_materia',
        message: 'El rol_en_materia no es valido para docente_materia.',
      })
    }

    const estadoInferido = !rawEstado
    const estado_asignacion = estadoInferido ? 'ACTIVO' : normalizeEstado(rawEstado)
    if (estadoInferido) {
      addIssue(warnings, {
        rowIndex,
        code: 'ESTADO_ASIGNACION_INFERIDO_ACTIVO',
        field: 'estado_asignacion',
        message: 'Estado vacio inferido como ACTIVO.',
      })
    } else if (!VALID_ESTADOS.has(estado_asignacion)) {
      addIssue(rowErrors, {
        rowIndex,
        code: 'ESTADO_ASIGNACION_INVALIDO',
        field: 'estado_asignacion',
        message: 'El estado_asignacion no es valido para docente_materia.',
      })
    }

    if (!desde.valid) {
      addIssue(warnings, {
        rowIndex,
        code: 'VIGENCIA_DESDE_INVALIDA',
        field: 'vigencia_desde',
        message: 'La fecha vigencia_desde no tiene formato valido y se ignora.',
      })
    }
    if (!hasta.valid) {
      addIssue(warnings, {
        rowIndex,
        code: 'VIGENCIA_HASTA_INVALIDA',
        field: 'vigencia_hasta',
        message: 'La fecha vigencia_hasta no tiene formato valido y se ignora.',
      })
    }
    if (desde.value && hasta.value && desde.value > hasta.value) {
      addIssue(warnings, {
        rowIndex,
        code: 'RANGO_VIGENCIA_INVALIDO',
        field: 'vigencia_hasta',
        message: 'vigencia_hasta es anterior a vigencia_desde y debe revisarse.',
      })
    }

    if (!requiereMesa.valid) {
      addIssue(warnings, {
        rowIndex,
        code: 'REQUIERE_MESA_INVALIDO',
        field: 'requiere_mesa',
        message: 'requiere_mesa no tiene valor reconocido y queda sin definir.',
      })
    }

    if (rowErrors.length) {
      errors.push(...rowErrors)
      return
    }

    rows.push({
      carrera,
      materia_codigo,
      materia_nombre,
      anio,
      docente,
      dni_docente,
      rol_en_materia,
      estado_asignacion,
      vigencia_desde: desde.value,
      vigencia_hasta: hasta.value,
      docente_reemplazado,
      requiere_mesa: requiereMesa.value,
      observaciones,
      origen: readField(rawRow, 'origen'),
      nivel_confianza: readField(rawRow, 'nivel_confianza'),
      requiere_revision: readField(rawRow, 'requiere_revision'),
      estadoInferido,
      rolVacio: !rawRol,
      source: options.source ?? 'docente_materia',
      sourceRowNumber: rowIndex + 1,
    })
  })

  return {
    rows,
    errors,
    warnings,
    summary: buildSummary({ inputRows, rows, errors, warnings, ignoredRows }),
  }
}

export {
  CANONICAL_COLUMNS as DOCENTE_MATERIA_CANONICAL_COLUMNS,
  VALID_ESTADOS as VALID_DOCENTE_MATERIA_ESTADOS,
  VALID_ROLES as VALID_DOCENTE_MATERIA_ROLES,
}
