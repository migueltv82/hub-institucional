import { TEMPLATE_V2_REQUIRED_KEYS } from './templateV2ValidationRules.js'

const SOURCE_CONFIGS = Object.freeze({
  planesEstudio: {
    templateName: 'plan_estudios',
    label: 'Plan de estudios',
  },
  horariosDocentes: {
    templateName: 'horarios_docentes',
    label: 'Horarios docentes',
  },
  docentes: {
    templateName: 'docentes',
    label: 'Docentes',
  },
  correlatividades: {
    templateName: 'correlatividades',
    label: 'Correlatividades',
  },
  alumnos: {
    templateName: 'alumnos_inscripciones',
    label: 'Alumnos / inscripciones',
  },
  docenteMateria: {
    templateName: 'docente_materia',
    label: 'Docente-materia',
  },
})

const SUBJECT_SOURCES = new Set([
  'planesEstudio',
  'horariosDocentes',
  'correlatividades',
  'alumnos',
  'docenteMateria',
])

const DUPLICATE_NAME_SOURCES = new Set([
  'planesEstudio',
  'horariosDocentes',
  'correlatividades',
  'docenteMateria',
])

const FIELD_ALIASES = Object.freeze({
  alumno_id: ['alumno_id', 'alumnoId', 'student_id', 'studentId', 'id', 'dni'],
  anio_cursada: ['anio_cursada', 'anioCursada', 'anio', 'año', 'ano', 'year', 'curso', 'nivel'],
  apellido: ['apellido', 'last_name', 'lastName'],
  carrera_id: [
    'carrera_id',
    'carreraId',
    'career_id',
    'careerId',
    'programa_id',
    'programaId',
    'carrera',
    'career',
    'programa',
    'nombre_carrera',
    'nombreCarrera',
  ],
  condicion: ['condicion', 'condición', 'condition', 'estado_regularidad'],
  correlativa_codigo: [
    'correlativa_codigo',
    'correlativaCodigo',
    'codigo_correlativa',
    'codigoCorrelativa',
    'materia_correlativa_codigo',
    'correlativa',
  ],
  dia: ['dia', 'día', 'diaSemana', 'dia_semana', 'day', 'weekday'],
  dni_docente: ['dni_docente', 'dniDocente', 'dni', 'documento', 'document'],
  docente_id: ['docente_id', 'docenteId', 'teacher_id', 'teacherId', 'profesor_id', 'profesorId', 'id'],
  estado_asignacion: ['estado_asignacion', 'estadoAsignacion', 'estado', 'situacion', 'situación'],
  estado_docente: ['estado_docente', 'estadoDocente', 'estado', 'situacion', 'situación'],
  hora_fin: ['hora_fin', 'horaFin', 'fin', 'hasta', 'end', 'endTime'],
  hora_inicio: ['hora_inicio', 'horaInicio', 'inicio', 'desde', 'start', 'startTime'],
  materia_codigo: [
    'materia_codigo',
    'materiaCodigo',
    'codigo_materia',
    'codigoMateria',
    'codigo',
    'código',
    'code',
    'subject_code',
    'subjectCode',
    'materia_id',
    'materiaId',
  ],
  materia_nombre: [
    'materia_nombre',
    'materiaNombre',
    'nombre_materia',
    'nombreMateria',
    'materia',
    'unidad_curricular',
    'unidadCurricular',
    'espacio',
    'asignatura',
    'subject_name',
    'subjectName',
    'nombre',
    'name',
  ],
  nombre: ['nombre', 'first_name', 'firstName'],
  plan_id: [
    'plan_id',
    'planId',
    'plan',
    'plan_estudio',
    'planEstudio',
    'plan_estudio_id',
    'planEstudioId',
  ],
  requisito: ['requisito', 'requirement', 'tipo_requisito'],
  requiere_mesa: ['requiere_mesa', 'requiereMesa', 'requiere mesa', 'requires_mesa', 'requiresMesa'],
  rol_en_materia: ['rol_en_materia', 'rolEnMateria', 'rol', 'role'],
  tipo_correlativa: ['tipo_correlativa', 'tipoCorrelativa', 'tipo', 'tipo_correlacion'],
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function hasValue(value) {
  return value !== undefined && value !== null && clean(value) !== ''
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeFieldName(value) {
  return normalizeToken(value)
}

function readField(row = {}, field) {
  if (!row || typeof row !== 'object') return undefined

  const aliases = FIELD_ALIASES[field] ?? [field]
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && hasValue(row[alias])) return row[alias]
  }

  const wanted = new Set(aliases.map(normalizeFieldName))
  const entry = Object.entries(row).find(([key, value]) => (
    wanted.has(normalizeFieldName(key)) && hasValue(value)
  ))
  return entry?.[1]
}

function fieldPresent(row = {}, field) {
  return hasValue(readField(row, field))
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function buildFieldStats(rows = [], requiredFields = []) {
  return requiredFields.reduce((stats, field) => {
    const presentRows = rows.filter((row) => fieldPresent(row, field)).length
    const missingRows = rows.length - presentRows
    stats[field] = {
      presentRows,
      missingRows,
      presentPercent: rows.length ? round2((presentRows / rows.length) * 100) : 0,
    }
    return stats
  }, {})
}

function compatibilityPercent(fieldStats = {}, totalRows = 0) {
  const fields = Object.keys(fieldStats)
  if (!totalRows || !fields.length) return 0
  const presentCells = fields.reduce((sum, field) => sum + fieldStats[field].presentRows, 0)
  return round2((presentCells / (totalRows * fields.length)) * 100)
}

function sourceRecommendation({ sourceKey, hasPlanId, hasMateriaCodigo, dependsOnMateriaNombre }) {
  if (sourceKey === 'docentes') {
    return 'Agregar docente_id estable y separar apellido/nombre para cruzar sin depender del nombre visible.'
  }
  if (sourceKey === 'alumnos') {
    return 'Agregar plan_id y materia_codigo a inscripciones para saber desde que plan rinde cada alumno.'
  }
  if (sourceKey === 'docenteMateria') {
    return 'Mantener docente_materia como fuente de titularidad, agregando plan_id, materia_codigo y docente_id.'
  }
  if (!hasPlanId && !hasMateriaCodigo) {
    return 'Agregar plan_id y materia_codigo; no usar materia_nombre como clave de cruce.'
  }
  if (!hasPlanId) {
    return 'Agregar plan_id para separar planes convivientes como LAB-2015 y LAB-2024.'
  }
  if (!hasMateriaCodigo) {
    return 'Agregar materia_codigo estable para no depender de materia_nombre.'
  }
  if (dependsOnMateriaNombre) {
    return 'Revisar cruces actuales y migrarlos a plan_id + materia_codigo.'
  }
  return 'La fuente tiene las claves principales v2; completar campos administrativos faltantes.'
}

function diagnoseSource(sourceKey, rows = []) {
  const config = SOURCE_CONFIGS[sourceKey]
  const templateName = config.templateName
  const requiredFields = TEMPLATE_V2_REQUIRED_KEYS[templateName] ?? []
  const fieldStats = buildFieldStats(rows, requiredFields)
  const presentFields = requiredFields.filter((field) => fieldStats[field]?.presentRows > 0)
  const missingFields = requiredFields.filter((field) => fieldStats[field]?.presentRows === 0)
  const partiallyMissingFields = requiredFields.filter((field) => (
    fieldStats[field]?.presentRows > 0 && fieldStats[field]?.missingRows > 0
  ))
  const hasPlanId = rows.length > 0 && rows.some((row) => fieldPresent(row, 'plan_id'))
  const hasMateriaCodigo = rows.length > 0 && rows.some((row) => fieldPresent(row, 'materia_codigo'))
  const hasMateriaNombre = rows.length > 0 && rows.some((row) => fieldPresent(row, 'materia_nombre'))
  const dependsOnMateriaNombre = SUBJECT_SOURCES.has(sourceKey) && hasMateriaNombre && (!hasPlanId || !hasMateriaCodigo)
  const compatibility = compatibilityPercent(fieldStats, rows.length)

  return {
    sourceKey,
    templateName,
    label: config.label,
    totalRows: rows.length,
    requiredFields,
    presentFields,
    missingFields,
    partiallyMissingFields,
    fieldStats,
    compatibilityPercent: compatibility,
    hasPlanId,
    hasMateriaCodigo,
    dependsOnMateriaNombre,
    nameMixingRisk: dependsOnMateriaNombre ? 'ALTO' : 'BAJO',
    recommendation: sourceRecommendation({
      sourceKey,
      hasPlanId,
      hasMateriaCodigo,
      dependsOnMateriaNombre,
    }),
  }
}

function buildMissingFields(templateDiagnostics = {}) {
  return Object.values(templateDiagnostics).flatMap((diagnostic) => (
    diagnostic.missingFields.map((field) => ({
      sourceKey: diagnostic.sourceKey,
      templateName: diagnostic.templateName,
      field,
      totalRows: diagnostic.totalRows,
    }))
  ))
}

function addWeakKey(weakKeys, risk) {
  weakKeys.push({
    severity: 'ALTO',
    ...risk,
  })
}

function buildWeakKeys(templateDiagnostics = {}) {
  return Object.values(templateDiagnostics).reduce((weakKeys, diagnostic) => {
    if (!SUBJECT_SOURCES.has(diagnostic.sourceKey) || diagnostic.totalRows === 0) return weakKeys

    if (diagnostic.dependsOnMateriaNombre && !diagnostic.hasPlanId && !diagnostic.hasMateriaCodigo) {
      addWeakKey(weakKeys, {
        sourceKey: diagnostic.sourceKey,
        templateName: diagnostic.templateName,
        code: 'MATERIA_NOMBRE_ONLY_OR_PRIMARY',
        weakKey: 'materia_nombre',
        reason: 'La fuente tiene nombre de materia pero no tiene plan_id ni materia_codigo.',
      })
      return weakKeys
    }

    if (!diagnostic.hasPlanId) {
      addWeakKey(weakKeys, {
        sourceKey: diagnostic.sourceKey,
        templateName: diagnostic.templateName,
        code: 'CROSS_WITHOUT_PLAN_ID',
        weakKey: 'materia_codigo + materia_nombre',
        reason: 'La fuente no puede separar planes convivientes porque falta plan_id.',
      })
    }

    if (!diagnostic.hasMateriaCodigo && diagnostic.dependsOnMateriaNombre) {
      addWeakKey(weakKeys, {
        sourceKey: diagnostic.sourceKey,
        templateName: diagnostic.templateName,
        code: 'CROSS_WITHOUT_MATERIA_CODIGO',
        weakKey: 'carrera + materia_nombre',
        reason: 'La fuente depende de nombres de materia para identificar espacios curriculares.',
      })
    }

    if (diagnostic.sourceKey === 'horariosDocentes' && diagnostic.dependsOnMateriaNombre) {
      addWeakKey(weakKeys, {
        sourceKey: diagnostic.sourceKey,
        templateName: diagnostic.templateName,
        code: 'DOCENTE_MATERIA_NOMBRE_WITHOUT_PLAN_ID',
        weakKey: 'docente + materia_nombre',
        reason: 'Los horarios docentes no deben definir titularidad ni plan por nombre de materia.',
      })
    }

    return weakKeys
  }, [])
}

function rowCareer(row = {}) {
  return clean(
    readField(row, 'carrera_id') ??
    readField(row, 'carrera_nombre') ??
    row.carrera ??
    row.carreraNombre ??
    row.nombreCarrera,
  )
}

function rowSubjectName(row = {}) {
  return clean(readField(row, 'materia_nombre'))
}

function rowSubjectCode(row = {}) {
  return clean(readField(row, 'materia_codigo'))
}

function rowYear(row = {}) {
  return clean(readField(row, 'anio_cursada'))
}

function rowPlanId(row = {}) {
  return clean(readField(row, 'plan_id'))
}

function rowLooksLikeLaboratorio(row = {}) {
  const text = normalizeText([
    rowCareer(row),
    rowPlanId(row),
    rowSubjectName(row),
    rowSubjectCode(row),
  ].join(' '))
  return text.includes('laboratorio') || /\blab\b/.test(text) || text.includes('lab2015') || text.includes('lab2024')
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function buildDuplicateNameRisks(snapshot = {}) {
  return Object.keys(SOURCE_CONFIGS).flatMap((sourceKey) => {
    if (!DUPLICATE_NAME_SOURCES.has(sourceKey)) return []

    const rows = asArray(snapshot[sourceKey])
    const groups = rows.reduce((map, row) => {
      const subject = rowSubjectName(row)
      if (!subject) return map
      const key = `${normalizeToken(rowCareer(row))}::${normalizeToken(subject)}`
      const group = map.get(key) ?? []
      group.push(row)
      map.set(key, group)
      return map
    }, new Map())

    return [...groups.values()]
      .filter((group) => group.length > 1)
      .map((group) => {
        const years = unique(group.map(rowYear))
        const codes = unique(group.map(rowSubjectCode))
        const planIds = unique(group.map(rowPlanId))
        const rowsWithoutPlanId = group.filter((row) => !rowPlanId(row)).length
        return {
          sourceKey,
          templateName: SOURCE_CONFIGS[sourceKey].templateName,
          code: 'DUPLICATE_MATERIA_NOMBRE',
          carrera: rowCareer(group[0]),
          materia_nombre: rowSubjectName(group[0]),
          rowCount: group.length,
          distinctYears: years.length,
          distinctCodes: codes.length,
          distinctPlanIds: planIds.length,
          rowsWithoutPlanId,
          risk: rowsWithoutPlanId > 0 || years.length > 1 || codes.length > 1 ? 'ALTO' : 'MEDIO',
          recommendation: 'Revisar si las filas pertenecen a planes distintos y separar por plan_id + materia_codigo.',
        }
      })
      .filter((risk) => risk.risk === 'ALTO')
      .slice(0, 50)
  })
}

function buildMultiPlanRisks(snapshot = {}) {
  return Object.keys(SOURCE_CONFIGS).flatMap((sourceKey) => {
    if (!SUBJECT_SOURCES.has(sourceKey)) return []

    const rows = asArray(snapshot[sourceKey])
    const laboratorioRows = rows.filter(rowLooksLikeLaboratorio)
    if (!laboratorioRows.length) return []

    const rowsWithoutPlanId = laboratorioRows.filter((row) => !rowPlanId(row)).length
    const rowsWithPlanId = laboratorioRows.length - rowsWithoutPlanId
    if (!rowsWithoutPlanId) return []

    return [{
      sourceKey,
      templateName: SOURCE_CONFIGS[sourceKey].templateName,
      code: 'MULTIPLAN_WITHOUT_PLAN_ID',
      carreraLike: 'Tecnicatura Superior en Laboratorio',
      affectedRows: rowsWithoutPlanId,
      rowsWithPlanId,
      suggestedPlanIds: ['LAB-2015', 'LAB-2024'],
      recommendation: 'Incorporar plan_id y asignar LAB-2015 o LAB-2024 segun cohorte, plan de origen o plantilla institucional.',
    }]
  })
}

function buildRecommendations({ missingFields, weakKeys, multiPlanRisks }) {
  const recommendations = [
    'Agregar plan_id a plantillas criticas: planesEstudio, horariosDocentes, correlatividades, alumnos y docenteMateria.',
    'Agregar materia_codigo estable a toda fuente que refiera materias.',
    'Crear y mantener equivalencias_planes para declarar puentes entre planes; no inferir equivalencias por nombres parecidos.',
    'Agregar plan_id a alumnos/inscripciones para saber desde que plan rinde cada alumno.',
    'No usar materia_nombre como clave de cruce; usar siempre plan_id + materia_codigo.',
    'Mantener docente_materia como fuente de titularidad; no usar horariosDocentes para definir titularidad institucional.',
  ]

  if (multiPlanRisks.length > 0) {
    recommendations.unshift('Separar Tecnicatura Superior en Laboratorio en LAB-2015 y LAB-2024 antes de integrar plantillas v2.')
  }
  if (missingFields.some((item) => item.field === 'plan_id')) {
    recommendations.push('Priorizar la carga de plan_id antes de migrar correlatividades o titulares a v2.')
  }
  if (weakKeys.length > 0) {
    recommendations.push('Revisar todos los cruces actuales que dependen de carrera + materia_nombre o docente + materia_nombre.')
  }

  return unique(recommendations)
}

function buildSummary({ snapshot, templateDiagnostics, missingFields, weakKeys, duplicateNameRisks, multiPlanRisks }) {
  const sourceDiagnostics = Object.values(templateDiagnostics)
  const totalRows = sourceDiagnostics.reduce((sum, diagnostic) => sum + diagnostic.totalRows, 0)
  const weightedCompatibility = totalRows
    ? sourceDiagnostics.reduce((sum, diagnostic) => (
      sum + diagnostic.compatibilityPercent * diagnostic.totalRows
    ), 0) / totalRows
    : 0

  return {
    sourcesChecked: sourceDiagnostics.length,
    totalRows,
    rowsBySource: Object.fromEntries(
      Object.keys(SOURCE_CONFIGS).map((sourceKey) => [sourceKey, asArray(snapshot[sourceKey]).length]),
    ),
    overallCompatibilityPercent: round2(weightedCompatibility),
    missingFields: missingFields.length,
    weakKeys: weakKeys.length,
    duplicateNameRisks: duplicateNameRisks.length,
    multiPlanRisks: multiPlanRisks.length,
    sourcesMissingPlanId: sourceDiagnostics
      .filter((diagnostic) => SUBJECT_SOURCES.has(diagnostic.sourceKey) && diagnostic.totalRows > 0 && !diagnostic.hasPlanId)
      .map((diagnostic) => diagnostic.sourceKey),
    sourcesMissingMateriaCodigo: sourceDiagnostics
      .filter((diagnostic) => SUBJECT_SOURCES.has(diagnostic.sourceKey) && diagnostic.totalRows > 0 && !diagnostic.hasMateriaCodigo)
      .map((diagnostic) => diagnostic.sourceKey),
    readyForTemplateV2: missingFields.length === 0 && weakKeys.length === 0 && multiPlanRisks.length === 0,
  }
}

function buildSafeWarnings(snapshot = {}) {
  const warnings = []
  if (!snapshot || typeof snapshot !== 'object') {
    warnings.push({
      code: 'SNAPSHOT_INVALIDO',
      message: 'No se recibio un snapshot valido para auditar templates v2.',
    })
  }
  if (asArray(snapshot.docenteMateria).length === 0) {
    warnings.push({
      code: 'DOCENTE_MATERIA_AUSENTE',
      message: 'No hay filas docenteMateria en el snapshot actual; se conservaria fallback hasta cargar plantilla v2.',
    })
  }
  return warnings
}

export function diagnoseTemplateV2Readiness(snapshot, options = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {}
  const templateDiagnostics = Object.fromEntries(
    Object.keys(SOURCE_CONFIGS).map((sourceKey) => [
      sourceKey,
      diagnoseSource(sourceKey, asArray(safeSnapshot[sourceKey])),
    ]),
  )
  const missingFields = buildMissingFields(templateDiagnostics)
  const weakKeys = buildWeakKeys(templateDiagnostics)
  const duplicateNameRisks = buildDuplicateNameRisks(safeSnapshot)
  const multiPlanRisks = buildMultiPlanRisks(safeSnapshot)
  const recommendations = buildRecommendations({ missingFields, weakKeys, multiPlanRisks })
  const warnings = options.includeWarnings === false ? [] : buildSafeWarnings(safeSnapshot)
  const errors = []

  return {
    summary: buildSummary({
      snapshot: safeSnapshot,
      templateDiagnostics,
      missingFields,
      weakKeys,
      duplicateNameRisks,
      multiPlanRisks,
    }),
    templateDiagnostics,
    missingFields,
    weakKeys,
    duplicateNameRisks,
    multiPlanRisks,
    recommendations,
    warnings,
    errors,
  }
}
