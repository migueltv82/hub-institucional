import { EXAM_GENERATION_TYPES } from '../../utils/examEngine/constants.js'
import {
  buildTeacherAcademicAlerts,
  buildTeacherAcademicSummary,
} from './teacherAcademicAdmin.js'

function isRegularExam(examType) {
  return examType !== EXAM_GENERATION_TYPES.SPECIAL
}

function hasRegularCallRanges(regularCallRanges) {
  const firstReady = Boolean(
    regularCallRanges?.first?.start &&
    regularCallRanges?.first?.end,
  )
  const secondReady = Boolean(
    regularCallRanges?.second?.start &&
    regularCallRanges?.second?.end,
  )
  return regularCallRanges?.callCount === 1 ? firstReady : firstReady && secondReady
}

function hasInvalidRegularCallRanges(regularCallRanges) {
  const firstInvalid = Boolean(
    regularCallRanges?.first?.start &&
    regularCallRanges?.first?.end &&
    regularCallRanges.first.start > regularCallRanges.first.end,
  )
  const secondInvalid = Boolean(
    regularCallRanges?.second?.start &&
    regularCallRanges?.second?.end &&
    regularCallRanges.second.start > regularCallRanges.second.end,
  )

  return firstInvalid || (regularCallRanges?.callCount === 1 ? false : secondInvalid)
}

function hasSpecialPeriod({ fechaInicio, fechaFin }) {
  return Boolean(fechaInicio && fechaFin)
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeNumber(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function isActiveTeacher(teacher = {}) {
  const status = clean(teacher.estado || teacher.status || teacher.profile?.estado || teacher.profile?.status).toLowerCase()
  return !['baja', 'inactivo', 'inactive', 'renuncia', 'renunciado'].includes(status)
}

function hasSubjectValue(row = {}) {
  return Boolean(clean(row.materia_codigo || row.materiaCodigo || row.materia || row.codigo || row.materia_nombre || row.nombreMateria))
}

function isGeneratedScheduleWorkload(row = {}) {
  return (
    normalize(row.source || row.origen || row.fuente) === 'horarios_docentes' ||
    normalize(row.observaciones || row.observation || row.notes).includes('generado desde horarios') ||
    normalize(row.id).startsWith('carga-desde-horarios')
  )
}

function isFalseLike(value) {
  if (value === false || value === 0) return true
  return ['false', 'no', '0'].includes(normalize(value))
}

function isTitularAssignment(row = {}) {
  if (isGeneratedScheduleWorkload(row)) return false
  if (isFalseLike(row.titularidad ?? row.es_titular ?? row.isTitular)) return false

  const role = clean(row.rol_en_materia || row.rol || row.role).toUpperCase()
  return role === 'TITULAR' || role === 'REEMPLAZO' || role === ''
}

export function getTeacherSourceReadiness({
  docentes = [],
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  horariosDocentes = [],
  workspaceSource = '',
} = {}) {
  const activeTeachers = asArray(docentes).filter(isActiveTeacher)
  const validLoadRows = asArray(cargaHorariaDocente).filter((row) => {
    const hours = normalizeNumber(row.horasCatedra ?? row.horas_catedra ?? row.teachingHours)
    return Boolean(
      clean(row.docente || row.profesor || row.docenteId || row.docente_id) &&
      clean(row.carrera || row.programa || row.program) &&
      hasSubjectValue(row) &&
      hours !== null &&
      hours > 0,
    )
  })
  const titularRows = validLoadRows.filter(isTitularAssignment)
  const structuredSummary = buildTeacherAcademicSummary({
    teachers: activeTeachers,
    disponibilidadDocente,
    cargaHorariaDocente,
  })
  const warnings = buildTeacherAcademicAlerts({
    disponibilidadDocente,
    cargaHorariaDocente,
    summaries: structuredSummary,
  })
  const missing = []

  if (activeTeachers.length === 0) missing.push('docentes activos')
  if (asArray(disponibilidadDocente).length === 0) missing.push('disponibilidad docente')
  if (asArray(cargaHorariaDocente).length === 0) missing.push('carga horaria docente')
  if (validLoadRows.length === 0) missing.push('asignaciones con docente, carrera, materia y horas')
  if (titularRows.length === 0) missing.push('titularidades')

  const hasStructuredTeacherSource = missing.length === 0
  const hasLegacyTeacherScheduleSource = asArray(horariosDocentes).length > 0
  const hasValidTeacherSource = hasStructuredTeacherSource || hasLegacyTeacherScheduleSource
  const usesRelationalScheduleSource = workspaceSource === 'academic-relational-schema' && hasLegacyTeacherScheduleSource
  const source = hasStructuredTeacherSource
    ? 'structured'
    : hasLegacyTeacherScheduleSource
      ? (usesRelationalScheduleSource ? 'relational-schedules' : 'legacy')
      : 'missing'
  const message = (() => {
    if (source === 'structured') return 'Fuente docente estructurada activa: disponibilidad y carga horaria.'
    if (source === 'relational-schedules') return 'Fuente docente relacional activa: horarios de cursada.'
    if (source === 'legacy') return 'Usando fallback legacy: horarios docentes.'
    return `Falta fuente docente valida: ${missing.join(', ')}.`
  })()

  return {
    source,
    message,
    missing,
    warnings,
    hasStructuredTeacherSource,
    hasLegacyTeacherScheduleSource,
    hasValidTeacherSource,
    counts: {
      activeTeachers: activeTeachers.length,
      disponibilidadDocente: asArray(disponibilidadDocente).length,
      cargaHorariaDocente: asArray(cargaHorariaDocente).length,
      validLoadRows: validLoadRows.length,
      titularRows: titularRows.length,
      legacyRows: asArray(horariosDocentes).length,
    },
  }
}

export function createWorkspaceChecklist({
  examType = EXAM_GENERATION_TYPES.REGULAR,
  periodoDefinido,
  periodoInvalido,
  teacherSourceReadiness,
  uploadedFiles,
}) {
  return [
    {
      label: teacherSourceReadiness?.source === 'structured'
        ? 'Docentes de la plantilla maestra'
        : 'Datos docentes validos',
      done: Boolean(teacherSourceReadiness?.hasValidTeacherSource),
    },
    {
      label: 'Plantilla academica cargada',
      done: Boolean(uploadedFiles.masterWorkbook),
    },
    { label: 'Plantilla de docentes cargada', done: Boolean(uploadedFiles.docentesWorkbook) },
    { label: 'Plantilla de alumnos cargada', done: Boolean(uploadedFiles.alumnosWorkbook) },
    {
      label: isRegularExam(examType) ? 'Llamados definidos' : 'Periodo definido',
      done: Boolean(periodoDefinido && !periodoInvalido),
    },
  ]
}

export function getGenerationMessage({
  examType = EXAM_GENERATION_TYPES.REGULAR,
  periodoDefinido,
  periodoInvalido,
  puedeGenerar,
  requiereRegeneracion,
  teacherSourceReadiness,
}) {
  if (periodoInvalido) {
    return isRegularExam(examType)
      ? 'Cada llamado debe tener una fecha desde menor o igual a la fecha hasta.'
      : 'La fecha de inicio no puede quedar despues de la fecha fin.'
  }

  if (requiereRegeneracion) {
    return 'Cambiaste archivos o fechas. Regenera antes de exportar o publicar.'
  }

  if (puedeGenerar) {
    return 'Todo listo para armar el cronograma con la plantilla maestra.'
  }

  if (!teacherSourceReadiness?.hasValidTeacherSource) {
    return teacherSourceReadiness?.message ?? 'Antes de generar, carga una fuente docente valida.'
  }

  if (!periodoDefinido && isRegularExam(examType)) {
    return 'Antes de generar, completa el desde/hasta de los llamados seleccionados.'
  }

  return 'Antes de generar, carga la plantilla maestra y completa el periodo.'
}

export function getCronogramaViewState({
  cargaHorariaDocente = [],
  cronograma,
  disponibilidadDocente = [],
  docentes = [],
  examType = EXAM_GENERATION_TYPES.REGULAR,
  fechaFin,
  fechaInicio,
  horariosDocentes = [],
  rankingDocentes,
  regularCallRanges,
  requiereRegeneracion,
  uploadedFiles,
  workspaceSource = '',
}) {
  const mesasConfirmadas = cronograma.filter((mesa) => mesa.estado === 'confirmada')
  const mesasConAjusteManual = cronograma.filter((mesa) => mesa.ajusteManual)
  const topDocentes = rankingDocentes.slice(0, 5)
  const maxHorasDocente = topDocentes[0]?.horas ?? 0
  const teacherSourceReadiness = getTeacherSourceReadiness({
    docentes,
    disponibilidadDocente,
    cargaHorariaDocente,
    horariosDocentes,
    workspaceSource,
  })
  const masterWorkbookReady = Boolean(uploadedFiles.masterWorkbook && uploadedFiles.docentesWorkbook && uploadedFiles.alumnosWorkbook)
  const periodoInvalido = isRegularExam(examType)
    ? hasInvalidRegularCallRanges(regularCallRanges)
    : Boolean(fechaInicio && fechaFin && fechaInicio > fechaFin)
  const periodoDefinido = isRegularExam(examType)
    ? hasRegularCallRanges(regularCallRanges)
    : hasSpecialPeriod({ fechaInicio, fechaFin })
  const puedeGenerar = masterWorkbookReady &&
    teacherSourceReadiness.hasValidTeacherSource &&
    periodoDefinido &&
    !periodoInvalido
  const exportacionesHabilitadas = cronograma.length > 0 && !requiereRegeneracion
  const reporteConfirmadasHabilitado = exportacionesHabilitadas && mesasConfirmadas.length > 0

  return {
    checklist: createWorkspaceChecklist({
      examType,
      uploadedFiles,
      periodoDefinido,
      periodoInvalido,
      teacherSourceReadiness,
    }),
    exportacionesHabilitadas,
    maxHorasDocente,
    mensajeGeneracion: getGenerationMessage({
      examType,
      periodoDefinido,
      puedeGenerar,
      periodoInvalido,
      requiereRegeneracion,
      teacherSourceReadiness,
    }),
    mesasConAjusteManual,
    mesasConfirmadas,
    periodoInvalido,
    puedeGenerar,
    reporteConfirmadasHabilitado,
    teacherSourceReadiness,
    topDocentes,
  }
}
