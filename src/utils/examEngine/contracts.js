// Public contracts for the new engine. These shapes should stay stable for UI and portals.

import {
  CANTIDADES_LLAMADOS,
  ESTADOS_MESA,
  LLAMADOS,
  ROLES_PARTICIPACION,
  TIPOS_PERIODO,
} from './constants.js'

const BASE_EXAM_PERIOD_CONFIG = {
  tipoPeriodo: TIPOS_PERIODO.REGULAR,
  cantidadLlamados: CANTIDADES_LLAMADOS.DOS,
  fechaInicio: '',
  fechaFin: '',
  descripcion: '',
}

const ROLE_ALIASES = new Map([
  ['TITULAR', ROLES_PARTICIPACION.TITULAR],
  ['PRESIDENTE', ROLES_PARTICIPACION.TITULAR],
  ['PROFESOR_TITULAR', ROLES_PARTICIPACION.TITULAR],
  ['VOCAL', ROLES_PARTICIPACION.VOCAL_1],
  ['VOCAL_1', ROLES_PARTICIPACION.VOCAL_1],
  ['VOCAL1', ROLES_PARTICIPACION.VOCAL_1],
  ['PRIMER_VOCAL', ROLES_PARTICIPACION.VOCAL_1],
  ['VOCAL_2', ROLES_PARTICIPACION.VOCAL_2],
  ['VOCAL2', ROLES_PARTICIPACION.VOCAL_2],
  ['SEGUNDO_VOCAL', ROLES_PARTICIPACION.VOCAL_2],
  ['VOCAL_EXTERNO', ROLES_PARTICIPACION.VOCAL_EXTERNO],
  ['VOCAL_EXTERNA', ROLES_PARTICIPACION.VOCAL_EXTERNO],
  ['EXTERNO', ROLES_PARTICIPACION.VOCAL_EXTERNO],
  ['TRIBUNAL_CRUZADO', ROLES_PARTICIPACION.TRIBUNAL_CRUZADO],
  ['TRIBUNAL_CROSS', ROLES_PARTICIPACION.TRIBUNAL_CRUZADO],
  ['CRUZADO', ROLES_PARTICIPACION.TRIBUNAL_CRUZADO],
])

const LLAMADO_ALIASES = new Map([
  ['1', LLAMADOS.PRIMERO],
  ['FIRST', LLAMADOS.PRIMERO],
  ['PRIMER', LLAMADOS.PRIMERO],
  ['PRIMERO', LLAMADOS.PRIMERO],
  ['PRIMER_LLAMADO', LLAMADOS.PRIMERO],
  ['LLAMADO_1', LLAMADOS.PRIMERO],
  ['2', LLAMADOS.SEGUNDO],
  ['SECOND', LLAMADOS.SEGUNDO],
  ['SEGUNDO', LLAMADOS.SEGUNDO],
  ['SEGUNDO_LLAMADO', LLAMADOS.SEGUNDO],
  ['LLAMADO_2', LLAMADOS.SEGUNDO],
  ['SPECIAL', LLAMADOS.ESPECIAL],
  ['ESPECIAL', LLAMADOS.ESPECIAL],
  ['LLAMADO_ESPECIAL', LLAMADOS.ESPECIAL],
])

function clean(value) {
  return String(value ?? '').trim()
}

function canonicalKey(value) {
  return clean(value)
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-zA-Z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .toUpperCase()
}

function normalizeDateString(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return clean(value)
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '')
}

export const MESA_OUTPUT_FIELDS = [
  'id',
  'mesa',
  'carrera',
  'materia',
  'nombreMateria',
  'fechaIso',
  'fecha',
  'dia',
  'inicio',
  'fin',
  'profesorTitular',
  'vocal1',
  'vocal2',
  'aula',
  'estado',
  'exam_type',
  'exam_call',
  'llamado',
  'llamadoNumero',
]

export function normalizeTipoPeriodo(value) {
  const key = canonicalKey(value)
  if (key === TIPOS_PERIODO.REGULAR) return TIPOS_PERIODO.REGULAR
  if (key === TIPOS_PERIODO.ESPECIAL || key === 'SPECIAL') return TIPOS_PERIODO.ESPECIAL
  return key
}

export function normalizeExamPeriodConfig(config = {}) {
  const safeConfig = config && typeof config === 'object' ? config : {}
  const baseConfig = {
    ...BASE_EXAM_PERIOD_CONFIG,
    ...safeConfig,
  }

  return {
    ...baseConfig,
    tipoPeriodo: normalizeTipoPeriodo(
      firstValue(safeConfig.tipoPeriodo, safeConfig.examType, BASE_EXAM_PERIOD_CONFIG.tipoPeriodo),
    ),
    cantidadLlamados: Number(
      firstValue(safeConfig.cantidadLlamados, BASE_EXAM_PERIOD_CONFIG.cantidadLlamados),
    ),
    fechaInicio: normalizeDateString(safeConfig.fechaInicio ?? baseConfig.fechaInicio),
    fechaFin: normalizeDateString(safeConfig.fechaFin ?? baseConfig.fechaFin),
    descripcion: clean(safeConfig.descripcion ?? baseConfig.descripcion),
  }
}

export function validateExamPeriodConfig(config = {}) {
  const normalizedConfig = normalizeExamPeriodConfig(config)
  const errors = []

  if (!Object.values(TIPOS_PERIODO).includes(normalizedConfig.tipoPeriodo)) {
    errors.push({
      code: 'INVALID_PERIOD_TYPE',
      message: 'tipoPeriodo must be REGULAR or ESPECIAL.',
      severity: 'critical',
      config: normalizedConfig,
    })
  }

  if (![CANTIDADES_LLAMADOS.UNO, CANTIDADES_LLAMADOS.DOS].includes(normalizedConfig.cantidadLlamados)) {
    errors.push({
      code: 'INVALID_CALL_COUNT',
      message: 'cantidadLlamados must be 1 or 2.',
      severity: 'critical',
      config: normalizedConfig,
    })
  }

  return {
    valid: errors.length === 0,
    config: normalizedConfig,
    errors,
  }
}

export function createDefaultExamPeriodConfig(overrides = {}) {
  return normalizeExamPeriodConfig({
    ...BASE_EXAM_PERIOD_CONFIG,
    ...overrides,
  })
}

export function normalizeRolParticipacion(rol) {
  const key = canonicalKey(rol)
  return ROLE_ALIASES.get(key) ?? key
}

export function normalizeLlamado(llamado) {
  const key = canonicalKey(llamado)
  return LLAMADO_ALIASES.get(key) ?? key
}

export function createParticipacionTribunal(data = {}) {
  const safeData = data && typeof data === 'object' ? data : {}

  return {
    docenteId: clean(firstValue(
      safeData.docenteId,
      safeData.teacherKey,
      safeData.teacherId,
      safeData.docente?.id,
      safeData.docente,
      safeData.profesor,
    )),
    mesaId: clean(firstValue(
      safeData.mesaId,
      safeData.mesa_id,
      safeData.mesa?.id,
      safeData.idMesa,
      safeData.id,
    )),
    materiaId: clean(firstValue(safeData.materiaId, safeData.materia_id, safeData.materia?.id)),
    carreraId: clean(firstValue(safeData.carreraId, safeData.carrera_id, safeData.carrera?.id)),
    rol: normalizeRolParticipacion(firstValue(safeData.rol, safeData.role, safeData.tipoParticipacion)),
    llamado: normalizeLlamado(firstValue(
      safeData.llamado,
      safeData.callKey,
      safeData.exam_call,
      safeData.mesa?.llamado,
      safeData.mesa?.exam_call,
    )),
    fecha: normalizeDateString(firstValue(
      safeData.fecha,
      safeData.fechaIso,
      safeData.date,
      safeData.mesa?.fechaIso,
      safeData.mesa?.fecha,
    )),
    turno: clean(firstValue(safeData.turno, safeData.shift)),
  }
}

export function isParticipacionVocalia(participacion = {}) {
  const rol = normalizeRolParticipacion(participacion.rol ?? participacion.role ?? participacion)
  return [
    ROLES_PARTICIPACION.VOCAL_1,
    ROLES_PARTICIPACION.VOCAL_2,
    ROLES_PARTICIPACION.VOCAL_EXTERNO,
  ].includes(rol)
}

export function isParticipacionTitular(participacion = {}) {
  const rol = normalizeRolParticipacion(participacion.rol ?? participacion.role ?? participacion)
  return rol === ROLES_PARTICIPACION.TITULAR
}

export function isParticipacionTribunalCruzado(participacion = {}) {
  const rol = normalizeRolParticipacion(participacion.rol ?? participacion.role ?? participacion)
  return rol === ROLES_PARTICIPACION.TRIBUNAL_CRUZADO
}

export function normalizeMesaExamen(mesa = {}) {
  const safeMesa = mesa && typeof mesa === 'object' ? mesa : {}

  return {
    id: clean(firstValue(safeMesa.id, safeMesa.mesaId, safeMesa.mesa)),
    materiaId: clean(firstValue(
      safeMesa.materiaId,
      safeMesa.materia_id,
      safeMesa.subject_id,
      safeMesa.materia?.id,
    )),
    materia: firstValue(safeMesa.materia, safeMesa.nombreMateria, safeMesa.subject_name) ?? '',
    carreraId: clean(firstValue(
      safeMesa.carreraId,
      safeMesa.carrera_id,
      safeMesa.program_id,
      safeMesa.carrera?.id,
    )),
    carrera: firstValue(safeMesa.carrera, safeMesa.programa, safeMesa.program, safeMesa.career) ?? '',
    fecha: normalizeDateString(firstValue(safeMesa.fechaIso, safeMesa.fecha, safeMesa.date)),
    hora: clean(firstValue(safeMesa.hora, safeMesa.inicio, safeMesa.time)),
    turno: clean(firstValue(safeMesa.turno, safeMesa.shift)),
    llamado: normalizeLlamado(firstValue(safeMesa.llamado, safeMesa.exam_call)),
    titularId: clean(firstValue(
      safeMesa.titular_id,
      safeMesa.titularId,
      safeMesa.presidente_id,
      safeMesa.profesorTitular,
      safeMesa.titular?.id,
      safeMesa.titular,
    )),
    vocal1Id: clean(firstValue(safeMesa.vocal1Id, safeMesa.vocal1_id, safeMesa.vocal1?.id, safeMesa.vocal1)),
    vocal2Id: clean(firstValue(safeMesa.vocal2Id, safeMesa.vocal2_id, safeMesa.vocal2?.id, safeMesa.vocal2)),
    estado: clean(firstValue(safeMesa.estado, safeMesa.status, ESTADOS_MESA.PENDIENTE)),
    alertas: Array.isArray(safeMesa.alertas) ? [...safeMesa.alertas] : [],
  }
}

export function createEmptyGenerationReport() {
  return {
    diagnostics: [],
    errors: [],
    warnings: [],
    exclusions: [],
    metrics: {
      generated: 0,
      errors: 0,
      warnings: 0,
    },
  }
}

export function createEngineResult({
  cronograma = [],
  diagnostics = null,
  report = createEmptyGenerationReport(),
} = {}) {
  const safeCronograma = Array.isArray(cronograma) ? cronograma : []
  const safeReport = report && typeof report === 'object'
    ? report
    : createEmptyGenerationReport()

  return {
    cronograma: safeCronograma,
    diagnostics,
    report: {
      ...createEmptyGenerationReport(),
      ...safeReport,
      metrics: {
        ...createEmptyGenerationReport().metrics,
        ...safeReport.metrics,
        generated: safeCronograma.length,
      },
    },
  }
}

export function getMesaOutputFields() {
  return [...MESA_OUTPUT_FIELDS]
}

export function assertMesaContract(mesa = {}) {
  const missing = MESA_OUTPUT_FIELDS.filter((field) => !(field in mesa))

  return {
    valid: missing.length === 0,
    missing,
  }
}
