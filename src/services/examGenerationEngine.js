import { buildRegularExamInputFromWorkspaceSnapshot } from '../utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { generateRegularExamPlan } from '../utils/examEngine/planning/generateRegular.js'

export const EXAM_GENERATION_ENGINE = Object.freeze({
  EXAM_ENGINE: 'examEngine',
})

const CALL_METADATA = {
  PRIMER_LLAMADO: {
    exam_call: 'first',
    llamado: 'Primer llamado',
    llamadoNumero: 1,
  },
  SEGUNDO_LLAMADO: {
    exam_call: 'second',
    llamado: 'Segundo llamado',
    llamadoNumero: 2,
  },
  LLAMADO_ESPECIAL: {
    exam_call: 'special',
    llamado: 'Llamado especial',
    llamadoNumero: 1,
  },
}

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
}

function parseIsoDate(value) {
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDisplayDate(value) {
  const date = parseIsoDate(value)
  if (!date) return clean(value)

  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('/')
}

function getDayLabel(value) {
  const date = parseIsoDate(value)
  if (!date) return ''
  return DAY_LABELS[date.getDay()] ?? ''
}

function getTeacherLabel(teacher = {}) {
  if (typeof teacher === 'string') return clean(teacher)

  return clean(
    teacher.nombre ||
    teacher.full_name ||
    teacher.fullName ||
    teacher.display_name ||
    teacher.displayName ||
    [teacher.nombre, teacher.apellido].filter(Boolean).join(' '),
  )
}

function buildTeacherNameById(docentes = []) {
  return docentes.reduce((map, teacher) => {
    const id = clean(teacher?.id ?? teacher?.docenteId ?? teacher?.teacherKey)
    const label = getTeacherLabel(teacher)
    if (id && label) map.set(id, label)
    return map
  }, new Map())
}

function buildSubjectById(materias = []) {
  return materias.reduce((map, subject) => {
    const id = clean(subject?.id ?? subject?.materiaId)
    if (id) map.set(id, subject)
    return map
  }, new Map())
}

function getTeacherName(teacherNameById, id, fallback) {
  const cleanId = clean(id)
  return teacherNameById.get(cleanId) || clean(fallback) || 'A designar'
}

function getCallMetadata(mesa = {}) {
  const key = normalizeKey(mesa.llamado || mesa.exam_call || 'PRIMER_LLAMADO').toUpperCase()
  if (['FIRST', 'PRIMERO', 'PRIMER', '1'].includes(key)) return CALL_METADATA.PRIMER_LLAMADO
  if (['SECOND', 'SEGUNDO', '2'].includes(key)) return CALL_METADATA.SEGUNDO_LLAMADO
  if (['SPECIAL', 'ESPECIAL'].includes(key)) return CALL_METADATA.LLAMADO_ESPECIAL
  return CALL_METADATA[key] ?? CALL_METADATA.PRIMER_LLAMADO
}

function getSubjectField(subjectById, subject = {}, field, fallback) {
  const linkedSubject = subjectById.get(clean(subject.materiaId ?? subject.id)) ?? {}
  return clean(
    subject[field] ??
    linkedSubject[field] ??
    subject[fallback] ??
    linkedSubject[fallback],
  )
}

function joinMesaSubjects(mesa = {}, field, fallback, subjectById = new Map()) {
  if (Array.isArray(mesa.materiasAgrupadas) && mesa.materiasAgrupadas.length) {
    const values = mesa.materiasAgrupadas
      .map((subject) => getSubjectField(subjectById, subject, field, fallback))
      .filter(Boolean)

    if (values.length) return values.join(' / ')
  }

  return getSubjectField(subjectById, mesa, field, fallback)
}

function formatDiagnosticMessage(item = {}) {
  return clean(item.message ?? item.mensaje ?? item.reason ?? item.code)
}

function collectMesaObservations(mesa = {}) {
  return [
    ...(Array.isArray(mesa.errors) ? mesa.errors : []),
    ...(Array.isArray(mesa.warnings) ? mesa.warnings : []),
  ].map(formatDiagnosticMessage).filter(Boolean).join(' | ')
}

export function adaptExamEngineMesaToCronograma(mesa = {}, index = 0, context = {}) {
  const teacherNameById = context.teacherNameById ?? new Map()
  const subjectById = context.subjectById ?? new Map()
  const call = getCallMetadata(mesa)
  const fechaIso = clean(mesa.fechaIso || mesa.fecha)
  const materia = joinMesaSubjects(mesa, 'codigo', 'materia', subjectById) ||
    joinMesaSubjects(mesa, 'materiaId', 'materia', subjectById)
  const nombreMateria = joinMesaSubjects(mesa, 'nombreMateria', 'materia', subjectById) || materia

  return {
    id: clean(mesa.id) || `exam-engine-${index + 1}`,
    mesa: index + 1,
    carrera: clean(mesa.carrera || mesa.carreraId),
    materia,
    nombreMateria,
    fechaIso,
    fecha: formatDisplayDate(fechaIso),
    dia: clean(mesa.dia || mesa.diaSemana) || getDayLabel(fechaIso),
    inicio: clean(mesa.inicio || mesa.hora),
    fin: clean(mesa.fin),
    profesorTitular: getTeacherName(teacherNameById, mesa.titularId, mesa.titularNombre || mesa.profesorTitular),
    vocal1: getTeacherName(teacherNameById, mesa.vocal1Id, mesa.vocal1),
    vocal2: getTeacherName(teacherNameById, mesa.vocal2Id, mesa.vocal2),
    aula: clean(mesa.aula) || 'A definir',
    estado: 'pendiente',
    exam_type: call === CALL_METADATA.LLAMADO_ESPECIAL ? 'special' : 'regular',
    exam_call: call.exam_call,
    llamado: call.llamado,
    llamadoNumero: call.llamadoNumero,
    turno: clean(mesa.turno),
    observacionManual: collectMesaObservations(mesa),
    origenMotor: EXAM_GENERATION_ENGINE.EXAM_ENGINE,
    engineMesaId: clean(mesa.id),
  }
}

function adaptDiagnostics(items = []) {
  return items.map((item) => ({
    codigo: clean(item.code),
    severidad: clean(item.severity),
    etapa: clean(item.stage),
    mensaje: formatDiagnosticMessage(item),
  }))
}

function adaptUnassignedMesas(items = []) {
  return items.map((mesa) => ({
    id: clean(mesa.id),
    carrera: clean(mesa.carrera || mesa.carreraId),
    materia: clean(mesa.materia || mesa.materiaId),
    llamado: clean(mesa.llamado || mesa.exam_call),
    motivo: collectMesaObservations(mesa) || 'No se pudo planificar con el nuevo examEngine.',
  }))
}

function buildExamEngineResult({ adaptedInput, plan }) {
  const teacherNameById = buildTeacherNameById(adaptedInput.docentes)
  const subjectById = buildSubjectById(adaptedInput.materias)
  const cronograma = plan.plannedMesas.map((mesa, index) => (
    adaptExamEngineMesaToCronograma(mesa, index, { teacherNameById, subjectById })
  ))
  const warnings = [
    ...(Array.isArray(adaptedInput.metadata?.warnings) ? adaptedInput.metadata.warnings : []),
    ...plan.warnings,
  ]
  const errors = plan.errors
  const exclusiones = [
    ...adaptUnassignedMesas(plan.unassignedMesas),
    ...adaptDiagnostics(plan.metadata?.candidateExclusions ?? []),
  ]

  return {
    cronograma,
    exclusiones,
    advertencias: adaptDiagnostics(warnings),
    conflictos: adaptDiagnostics(errors),
    metricas: {
      engine: EXAM_GENERATION_ENGINE.EXAM_ENGINE,
      generated: cronograma.length,
      totalDocentes: plan.summary?.totalDocentes ?? 0,
      totalMaterias: plan.summary?.totalMaterias ?? 0,
      totalUnassignedMesas: plan.summary?.totalUnassignedMesas ?? 0,
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      success: plan.success,
    },
    reporteGeneracion: {
      cronogramaGenerado: cronograma.length,
      exclusiones,
      advertencias: adaptDiagnostics(warnings),
      conflictos: adaptDiagnostics(errors),
      metricas: {
        engine: EXAM_GENERATION_ENGINE.EXAM_ENGINE,
        summary: plan.summary,
        adapterDiagnostics: adaptedInput.metadata?.adapterDiagnostics,
      },
      examEnginePlan: plan,
    },
  }
}

export function generateCronogramaWithExamEngine(input = {}) {
  const adaptedInput = buildRegularExamInputFromWorkspaceSnapshot(input)
  const plan = generateRegularExamPlan(adaptedInput)

  return buildExamEngineResult({ adaptedInput, plan })
}

export function generateCronogramaFromWorkspace(input = {}) {
  return generateCronogramaWithExamEngine(input)
}
