import {
  summarizeStructuredTeacherSource,
} from './teacherStructuredSource.js'
import {
  inferTeachingHoursFromScheduleRow,
} from './rules/calculateTeacherAssignmentLimit.js'
import { buildTeacherBlockedDatesByTeacher } from './teacherBlockedDates.js'

const ACTIVE_STATUSES = new Set(['', 'ACTIVO', 'ACTIVE'])
const TITULAR_ROLES = new Set(['', 'TITULAR', 'REEMPLAZO'])

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
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

function normalizeId(prefix, value) {
  const token = normalizeToken(value)
  return token ? `${prefix}-${token}` : ''
}

function normalizeNumber(value) {
  if (value === undefined || value === null || clean(value) === '') return null
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function readTeacherName(row = {}) {
  return clean(
    row.docente ||
    row.profesor ||
    row.teacher_display_name ||
    row.teacherDisplayName ||
    row.teacherName ||
    row.teacher_name ||
    row.display_name ||
    row.displayName ||
    row.full_name ||
    row.fullName ||
    row.nombre,
  )
}

function readTeacherIdentity(row = {}) {
  return clean(
    row.docenteId ||
    row.docente_id ||
    row.teacher_record_id ||
    row.teacherRecordId ||
    row.teacherId ||
    row.teacher_id ||
    row.dni_docente ||
    row.dni ||
    row.documento ||
    readTeacherName(row),
  )
}

function teacherId(row = {}) {
  return normalizeId('teacher', readTeacherIdentity(row))
}

function readCareer(row = {}) {
  return clean(
    row.carrera ||
    row.career_name ||
    row.careerName ||
    row.nombreCarrera ||
    row.programa ||
    row.program ||
    row.career,
  )
}

function readPlan(row = {}) {
  return clean(row.plan || row.plan_nombre || row.planName || row.plan_id || row.planId)
}

function readSubjectCode(row = {}) {
  return clean(
    row.materia_codigo ||
    row.materiaCodigo ||
    row.codigo_materia ||
    row.codigoMateria ||
    row.subject_code ||
    row.subjectCode ||
    row.materia ||
    row.codigo,
  )
}

function readSubjectName(row = {}) {
  return clean(
    row.materia_nombre ||
    row.materiaNombre ||
    row.nombre_materia ||
    row.nombreMateria ||
    row.subject_name ||
    row.subjectName ||
    row.asignatura ||
    row.nombre ||
    readSubjectCode(row),
  )
}

function readYear(row = {}) {
  return clean(row.anio || row.ano || row.year || row.curso || row.nivel)
}

function readStatus(row = {}, fields = ['estado', 'status']) {
  const field = fields.find((candidate) => clean(row[candidate]))
  return clean(field ? row[field] : '').toUpperCase()
}

function isActive(row = {}, fields) {
  return ACTIVE_STATUSES.has(readStatus(row, fields))
}

function readRole(row = {}) {
  return clean(row.rol_en_materia || row.rolEnMateria || row.rol || row.role || 'TITULAR').toUpperCase()
}

function isGeneratedScheduleWorkload(row = {}) {
  return (
    normalizeToken(row.source || row.origen || row.fuente) === 'horariosdocentes' ||
    normalizeToken(row.observaciones || row.observation || row.notes).includes('generadodesdehorarios') ||
    normalizeToken(row.id).startsWith('cargadesdehorarios')
  )
}

function readTitularidad(row = {}, role = readRole(row)) {
  if (isGeneratedScheduleWorkload(row)) return false
  if (row.titularidad === false || row.es_titular === false || row.isTitular === false) return false
  const value = clean(row.titularidad ?? row.es_titular ?? row.isTitular)
  if (['false', 'no', '0'].includes(normalizeToken(value))) return false
  if (['true', 'si', '1', 'titular'].includes(normalizeToken(value))) return true
  return TITULAR_ROLES.has(role)
}

function readTeachingHours(row = {}, options = {}) {
  const explicit = normalizeNumber(
    row.horasCatedra ??
    row.horas_catedra ??
    row.teachingHours ??
    row.teaching_hours ??
    row.cargaHoraria ??
    row.carga_horaria,
  )
  if (explicit !== null) return explicit

  const inferred = inferTeachingHoursFromScheduleRow(row, options)
  return inferred.valid ? inferred.teachingHours : null
}

function readDay(row = {}) {
  return clean(row.dia || row.day || row.diaSemana || row.weekday)
}

function readShift(row = {}) {
  return clean(row.turno || row.shift || row.turnoDisponible).toUpperCase()
}

function readStart(row = {}) {
  return clean(row.hora_desde || row.horaDesde || row.inicio || row.desde || row.start || row.startTime)
}

function readEnd(row = {}) {
  return clean(row.hora_hasta || row.horaHasta || row.fin || row.hasta || row.end || row.endTime)
}

function isAvailable(row = {}) {
  if (row.disponible_mesa === false || row.disponible === false || row.available === false) return false
  const normalized = normalizeToken(row.disponible_mesa ?? row.disponible ?? row.available)
  return !['false', 'no', '0', 'nodisponible', 'unavailable'].includes(normalized)
}

function subjectKey({ carrera = '', materia = '', materiaNombre = '' } = {}) {
  const careerKey = normalizeToken(carrera)
  const subject = normalizeToken(materia || materiaNombre)
  return careerKey && subject ? `${careerKey}::${subject}` : ''
}

function ensureTeacher(context, row = {}, source = '') {
  const id = teacherId(row)
  if (!id) return null

  const existing = context.teacherMap.get(id) ?? {
    id,
    nombre: readTeacherName(row) || id,
    source,
    sources: [],
    carreras: [],
    materias: [],
    horasCatedra: 0,
    limiteAfectacion: 0,
  }

  const nextSources = unique([...existing.sources, source])
  const next = {
    ...existing,
    nombre: existing.nombre || readTeacherName(row) || id,
    source: nextSources.includes('structured') ? 'structured' : source,
    sources: nextSources,
  }
  context.teacherMap.set(id, next)
  return next
}

function pushMapArray(target, key, value) {
  if (!key) return
  const rows = target[key] ?? []
  rows.push(value)
  target[key] = rows
}

function addHours(context, id, career, hours) {
  const safeHours = Number(hours) || 0
  context.cargaHorariaPorDocente[id] = (context.cargaHorariaPorDocente[id] ?? 0) + safeHours
  context.cargaHorariaPorDocenteYCarrera[id] = context.cargaHorariaPorDocenteYCarrera[id] ?? {}
  context.cargaHorariaPorDocenteYCarrera[id][career] =
    (context.cargaHorariaPorDocenteYCarrera[id][career] ?? 0) + safeHours
  context.limiteAfectacionPorDocente[id] = safeHours > 0 || context.cargaHorariaPorDocente[id] > 0
    ? Math.floor(context.cargaHorariaPorDocente[id] / 2) + 1
    : 0
}

function addWorkloadRow(context, row = {}, source = 'structured', options = {}) {
  const id = teacherId(row)
  const docente = ensureTeacher(context, row, source)
  const carrera = readCareer(row)
  const materia = readSubjectCode(row)
  const materiaNombre = readSubjectName(row)
  const horasCatedra = readTeachingHours(row, options) ?? 0
  const role = readRole(row)
  const titularidad = readTitularidad(row, role)

  if (!docente || !carrera || (!materia && !materiaNombre) || horasCatedra <= 0) {
    context.warnings.push({
      code: 'INCOMPLETE_CONTEXT_WORKLOAD',
      source,
      missing: [
        !id ? 'docente' : '',
        !carrera ? 'carrera' : '',
        !materia && !materiaNombre ? 'materia' : '',
        horasCatedra <= 0 ? 'horas_catedra' : '',
      ].filter(Boolean),
    })
    return
  }

  const assignment = {
    docenteId: id,
    docente: docente.nombre,
    carrera,
    plan: readPlan(row),
    materia,
    materiaNombre,
    anio: readYear(row),
    rol: role,
    titularidad,
    horasCatedra,
    estado: readStatus(row, ['estado_asignacion', 'estadoAsignacion', 'estado', 'status']) || 'ACTIVO',
    source,
  }
  const key = subjectKey({ carrera, materia, materiaNombre })

  pushMapArray(context.materiasPorDocente, id, assignment)
  if (titularidad) pushMapArray(context.titularidadesPorMateria, key, assignment)
  addHours(context, id, carrera, horasCatedra)

  const teacher = context.teacherMap.get(id)
  context.teacherMap.set(id, {
    ...teacher,
    carreras: unique([...teacher.carreras, carrera]),
    materias: unique([...teacher.materias, materia || materiaNombre]),
    horasCatedra: context.cargaHorariaPorDocente[id],
    limiteAfectacion: context.limiteAfectacionPorDocente[id],
  })
}

function addAvailabilityRow(context, row = {}, source = 'structured') {
  const id = teacherId(row)
  const docente = ensureTeacher(context, row, source)
  const dia = readDay(row)
  const horaDesde = readStart(row)
  const horaHasta = readEnd(row)

  if (!docente || !dia || !horaDesde || !horaHasta) {
    context.warnings.push({
      code: 'INCOMPLETE_CONTEXT_AVAILABILITY',
      source,
      missing: [
        !id ? 'docente' : '',
        !dia ? 'dia' : '',
        !horaDesde || !horaHasta ? 'franja_horaria' : '',
      ].filter(Boolean),
    })
    return
  }

  const availability = {
    docenteId: id,
    docente: docente.nombre,
    dia,
    diaNormalizado: normalizeText(dia),
    turno: readShift(row),
    horaDesde,
    horaHasta,
    disponible: isAvailable(row),
    estado: readStatus(row, ['estado', 'status']) || 'ACTIVO',
    source,
  }

  if (!availability.disponible) return

  pushMapArray(context.disponibilidadPorDocente, id, availability)
  const days = new Set(context.diasAsistenciaPorDocente[id] ?? [])
  days.add(availability.diaNormalizado)
  context.diasAsistenciaPorDocente[id] = [...days]
}

function createEmptyContext({ source, structuredSummary }) {
  return {
    source,
    hasStructuredTeacherSource: Boolean(structuredSummary?.hasStructuredTeacherSource),
    hasLegacyTeacherScheduleSource: Boolean(structuredSummary?.hasLegacyTeacherScheduleSource),
    docentes: [],
    materiasPorDocente: {},
    titularidadesPorMateria: {},
    cargaHorariaPorDocente: {},
    cargaHorariaPorDocenteYCarrera: {},
    limiteAfectacionPorDocente: {},
    disponibilidadPorDocente: {},
    diasAsistenciaPorDocente: {},
    blockedDatesByTeacher: {},
    warnings: [],
    diagnostics: {
      source,
      counts: {
        docentes: 0,
        materiasPorDocente: 0,
        titularidadesPorMateria: 0,
        disponibilidadPorDocente: 0,
        blockedDates: 0,
        warnings: 0,
      },
      structured: structuredSummary
        ? {
            hasStructuredTeacherSource: structuredSummary.hasStructuredTeacherSource,
            hasLegacyTeacherScheduleSource: structuredSummary.hasLegacyTeacherScheduleSource,
            counts: structuredSummary.counts,
            warnings: structuredSummary.warnings,
          }
        : null,
    },
    teacherMap: new Map(),
  }
}

function finalizeContext(context) {
  const docentes = [...context.teacherMap.values()]
    .map((docente) => ({
      ...docente,
      carreras: unique(docente.carreras),
      materias: unique(docente.materias),
      horasCatedra: context.cargaHorariaPorDocente[docente.id] ?? docente.horasCatedra ?? 0,
      limiteAfectacion: context.limiteAfectacionPorDocente[docente.id] ?? docente.limiteAfectacion ?? 0,
    }))
    .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es', { sensitivity: 'base' }))

  const diagnostics = {
    ...context.diagnostics,
    counts: {
      docentes: docentes.length,
      materiasPorDocente: Object.values(context.materiasPorDocente).reduce((total, rows) => total + rows.length, 0),
      titularidadesPorMateria: Object.values(context.titularidadesPorMateria).reduce((total, rows) => total + rows.length, 0),
      disponibilidadPorDocente: Object.values(context.disponibilidadPorDocente).reduce((total, rows) => total + rows.length, 0),
      blockedDates: Object.values(context.blockedDatesByTeacher).reduce((total, rows) => total + rows.length, 0),
      warnings: context.warnings.length,
    },
  }

  return {
    source: context.source,
    hasStructuredTeacherSource: context.hasStructuredTeacherSource,
    hasLegacyTeacherScheduleSource: context.hasLegacyTeacherScheduleSource,
    docentes,
    materiasPorDocente: context.materiasPorDocente,
    titularidadesPorMateria: context.titularidadesPorMateria,
    cargaHorariaPorDocente: context.cargaHorariaPorDocente,
    cargaHorariaPorDocenteYCarrera: context.cargaHorariaPorDocenteYCarrera,
    limiteAfectacionPorDocente: context.limiteAfectacionPorDocente,
    disponibilidadPorDocente: context.disponibilidadPorDocente,
    diasAsistenciaPorDocente: context.diasAsistenciaPorDocente,
    blockedDatesByTeacher: context.blockedDatesByTeacher,
    warnings: context.warnings,
    diagnostics,
  }
}

function buildStructuredContext({
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  structuredSummary,
  options = {},
}) {
  const context = createEmptyContext({ source: 'structured', structuredSummary })
  asArray(cargaHorariaDocente)
    .filter((row) => isActive(row, ['estado_asignacion', 'estadoAsignacion', 'estado', 'status']))
    .forEach((row) => addWorkloadRow(context, row, 'structured', options))
  asArray(disponibilidadDocente)
    .filter((row) => isActive(row, ['estado', 'status']) && isAvailable(row))
    .forEach((row) => addAvailabilityRow(context, row, 'structured'))

  context.warnings.push(...asArray(structuredSummary?.warnings))
  return finalizeContext(context)
}

function buildLegacyContext({ horariosDocentes = [], structuredSummary, options = {} }) {
  const context = createEmptyContext({ source: asArray(horariosDocentes).length ? 'legacy' : 'missing', structuredSummary })
  const activeLegacyRows = asArray(horariosDocentes).filter((row) => (
    isActive(row, ['estado_asignacion', 'estadoAsignacion', 'estado', 'status']) &&
    isAvailable(row)
  ))

  activeLegacyRows.forEach((row) => {
    addWorkloadRow(context, row, 'legacy', options)
    addAvailabilityRow(context, row, 'legacy')
  })

  if (!activeLegacyRows.length) {
    context.warnings.push({
      code: 'MISSING_TEACHER_SOURCE',
      source: 'missing',
      missing: ['disponibilidadDocente', 'cargaHorariaDocente', 'horariosDocentes'],
    })
  }

  context.warnings.push(...asArray(structuredSummary?.warnings))
  return finalizeContext(context)
}

export function buildTeacherExamSourceContext({
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  fechasBloqueadasDocente = [],
  horariosDocentes = [],
  teacherSource,
  options = {},
} = {}) {
  const structuredSummary = teacherSource ?? summarizeStructuredTeacherSource({
    disponibilidadDocente,
    cargaHorariaDocente,
    horariosDocentes,
  })

  const context = structuredSummary.hasStructuredTeacherSource
    ? buildStructuredContext({
      disponibilidadDocente: structuredSummary.validAvailabilityRows ?? disponibilidadDocente,
      cargaHorariaDocente: structuredSummary.validWorkloadRows ?? cargaHorariaDocente,
      structuredSummary,
      options,
    })
    : buildLegacyContext({
      horariosDocentes,
      structuredSummary,
      options,
    })

  const blockedDatesByTeacher = buildTeacherBlockedDatesByTeacher({
    records: fechasBloqueadasDocente,
    docentes: context.docentes,
  })
  const blockedDates = Object.values(blockedDatesByTeacher).reduce((total, rows) => total + rows.length, 0)

  return {
    ...context,
    blockedDatesByTeacher,
    diagnostics: {
      ...context.diagnostics,
      counts: {
        ...context.diagnostics.counts,
        blockedDates,
      },
    },
  }
}
