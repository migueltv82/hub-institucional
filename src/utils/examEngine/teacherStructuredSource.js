const ACTIVE_STATUSES = new Set(['', 'ACTIVO', 'ACTIVE'])
const TITULAR_ROLES = new Set(['', 'TITULAR', 'REEMPLAZO'])

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalize(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeNumber(value) {
  if (value === undefined || value === null || clean(value) === '') return null
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) ? number : null
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
    row.fullName,
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

export function getStructuredTeacherIdentityKey(row = {}) {
  return normalize(readTeacherIdentity(row))
}

function readCareer(row = {}) {
  return clean(
    row.carrera ||
    row.career_name ||
    row.careerName ||
    row.nombreCarrera ||
    row.programa ||
    row.program,
  )
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

function readPlan(row = {}) {
  return clean(row.plan || row.plan_nombre || row.planName || row.plan_id || row.planId)
}

function readYear(row = {}) {
  return clean(row.anio || row.ano || row.year || row.curso || row.nivel)
}

function readTeachingHours(row = {}) {
  return normalizeNumber(
    row.horasCatedra ??
    row.horas_catedra ??
    row.teachingHours ??
    row.teaching_hours ??
    row.cargaHoraria ??
    row.carga_horaria,
  )
}

function readStatus(row = {}, fields = ['estado', 'status']) {
  return clean(fields.find((field) => clean(row[field])) ? row[fields.find((field) => clean(row[field]))] : '')
    .toUpperCase()
}

function isActiveRow(row = {}, fields) {
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

function isFalseLike(value) {
  if (value === false || value === 0) return true
  return ['false', 'no', '0'].includes(normalizeToken(value))
}

function isTitularWorkloadRow(row = {}) {
  if (isGeneratedScheduleWorkload(row)) return false
  if (isFalseLike(row.titularidad ?? row.es_titular ?? row.isTitular)) return false

  return TITULAR_ROLES.has(readRole(row))
}

function isAvailableRow(row = {}) {
  if (row.disponible_mesa === false || row.disponible === false || row.available === false) return false
  const normalized = normalizeToken(row.disponible_mesa ?? row.disponible ?? row.available)
  return !['false', 'no', '0', 'nodisponible', 'unavailable'].includes(normalized)
}

function readDay(row = {}) {
  return clean(row.dia || row.day || row.diaSemana || row.weekday)
}

function readStart(row = {}) {
  return clean(row.hora_desde || row.horaDesde || row.inicio || row.desde || row.start || row.startTime)
}

function readEnd(row = {}) {
  return clean(row.hora_hasta || row.horaHasta || row.fin || row.hasta || row.end || row.endTime)
}

function readShift(row = {}) {
  return clean(row.turno || row.shift || row.turnoDisponible)
}

export function summarizeStructuredTeacherSource({
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  horariosDocentes = [],
} = {}) {
  const availabilityRows = asArray(disponibilidadDocente)
  const workloadRows = asArray(cargaHorariaDocente)
  const legacyRows = asArray(horariosDocentes)
  const warnings = []
  const validAvailabilityRows = []
  const validWorkloadRows = []
  const titularRows = []

  availabilityRows.forEach((row, index) => {
    const hasTeacher = Boolean(readTeacherIdentity(row))
    const hasDay = Boolean(readDay(row))
    const hasTimeRange = Boolean(readStart(row) && readEnd(row))
    const active = isActiveRow(row, ['estado', 'status'])
    const available = isAvailableRow(row)

    if (!hasTeacher || !hasDay || !hasTimeRange) {
      warnings.push({
        code: 'INCOMPLETE_TEACHER_AVAILABILITY',
        source: 'disponibilidadDocente',
        rowIndex: index,
        missing: [
          !hasTeacher ? 'docente' : '',
          !hasDay ? 'dia' : '',
          !hasTimeRange ? 'franja_horaria' : '',
        ].filter(Boolean),
      })
      return
    }

    if (active && available) validAvailabilityRows.push(row)
  })

  workloadRows.forEach((row, index) => {
    const hasTeacher = Boolean(readTeacherIdentity(row))
    const hasCareer = Boolean(readCareer(row))
    const hasSubject = Boolean(readSubjectCode(row) || readSubjectName(row))
    const hours = readTeachingHours(row)
    const hasHours = hours !== null && hours > 0
    const active = isActiveRow(row, ['estado_asignacion', 'estadoAsignacion', 'estado', 'status'])

    if (!hasTeacher || !hasCareer || !hasSubject || !hasHours) {
      warnings.push({
        code: 'INCOMPLETE_TEACHER_WORKLOAD',
        source: 'cargaHorariaDocente',
        rowIndex: index,
        missing: [
          !hasTeacher ? 'docente' : '',
          !hasCareer ? 'carrera' : '',
          !hasSubject ? 'materia' : '',
          !hasHours ? 'horas_catedra' : '',
        ].filter(Boolean),
      })
      return
    }

    if (!active) return

    validWorkloadRows.push(row)
    if (isTitularWorkloadRow(row)) titularRows.push(row)
  })

  const availabilityTeacherKeys = new Set(validAvailabilityRows.map(getStructuredTeacherIdentityKey).filter(Boolean))
  const workloadTeacherKeys = new Set(validWorkloadRows.map(getStructuredTeacherIdentityKey).filter(Boolean))
  const workloadWithoutAvailability = [...workloadTeacherKeys].filter((key) => !availabilityTeacherKeys.has(key))
  const availabilityWithoutWorkload = [...availabilityTeacherKeys].filter((key) => !workloadTeacherKeys.has(key))

  if (workloadWithoutAvailability.length) {
    warnings.push({
      code: 'TEACHER_WORKLOAD_WITHOUT_AVAILABILITY',
      source: 'cargaHorariaDocente',
      count: workloadWithoutAvailability.length,
    })
  }

  if (availabilityWithoutWorkload.length) {
    warnings.push({
      code: 'TEACHER_AVAILABILITY_WITHOUT_WORKLOAD',
      source: 'disponibilidadDocente',
      count: availabilityWithoutWorkload.length,
    })
  }

  const hasStructuredTeacherSource = validAvailabilityRows.length > 0 &&
    validWorkloadRows.length > 0 &&
    titularRows.length > 0
  const hasLegacyTeacherScheduleSource = legacyRows.length > 0
  const source = hasStructuredTeacherSource
    ? 'structured'
    : hasLegacyTeacherScheduleSource
      ? 'legacy'
      : 'missing'

  return {
    source,
    hasStructuredTeacherSource,
    hasLegacyTeacherScheduleSource,
    hasValidTeacherSource: hasStructuredTeacherSource || hasLegacyTeacherScheduleSource,
    validAvailabilityRows,
    validWorkloadRows,
    titularRows,
    warnings,
    counts: {
      disponibilidadDocente: availabilityRows.length,
      cargaHorariaDocente: workloadRows.length,
      horariosDocentes: legacyRows.length,
      validAvailabilityRows: validAvailabilityRows.length,
      validWorkloadRows: validWorkloadRows.length,
      titularRows: titularRows.length,
      workloadWithoutAvailability: workloadWithoutAvailability.length,
      availabilityWithoutWorkload: availabilityWithoutWorkload.length,
    },
  }
}

export function buildLegacyScheduleRowsFromStructuredTeacherSource({
  cargaHorariaDocente = [],
  disponibilidadDocente = [],
} = {}) {
  const availabilityByTeacher = asArray(disponibilidadDocente).reduce((map, row) => {
    const key = getStructuredTeacherIdentityKey(row)
    if (!key) return map
    const rows = map.get(key) ?? []
    rows.push(row)
    map.set(key, rows)
    return map
  }, new Map())

  return asArray(cargaHorariaDocente).flatMap((load, loadIndex) => {
    const key = getStructuredTeacherIdentityKey(load)
    const availabilityRows = availabilityByTeacher.get(key) ?? []
    const rows = availabilityRows.length ? availabilityRows : [{}]
    const subjectCode = readSubjectCode(load)
    const subjectName = readSubjectName(load)
    const teacherName = readTeacherName(load)

    return rows.map((availability, availabilityIndex) => {
      const generatedFromSchedule = isGeneratedScheduleWorkload(load)

      return {
        id: `structured-${load.id ?? loadIndex}-${availability.id ?? availabilityIndex}`,
        docenteId: clean(load.docenteId || load.docente_id || load.teacher_record_id || load.teacherRecordId),
        profesor: teacherName,
        docente: teacherName,
        dni_docente: clean(load.dni_docente || load.dni || load.documento),
        carrera: readCareer(load),
        plan: readPlan(load),
        materia: subjectCode,
        codigo: subjectCode,
        nombreMateria: subjectName,
        anio: readYear(load),
        horasCatedra: readTeachingHours(load),
        rol_en_materia: generatedFromSchedule ? '' : clean(load.rol_en_materia || load.rolEnMateria || load.rol || load.role || 'TITULAR').toUpperCase(),
        ...(generatedFromSchedule ? { titularidad: false, es_titular: false, isTitular: false } : {}),
        estado_asignacion: clean(load.estado_asignacion || load.estadoAsignacion || load.estado || load.status || 'ACTIVO').toUpperCase(),
        dia: readDay(availability),
        turno: readShift(availability),
        inicio: readStart(availability),
        fin: readEnd(availability),
        disponible_mesa: isAvailableRow(availability),
        source: 'structured_teacher_source',
      }
    })
  })
}

export function resolveTeacherScheduleSourceForGeneration({
  horariosDocentes = [],
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
} = {}) {
  const summary = summarizeStructuredTeacherSource({
    disponibilidadDocente,
    cargaHorariaDocente,
    horariosDocentes,
  })
  const structuredRows = summary.hasStructuredTeacherSource
    ? buildLegacyScheduleRowsFromStructuredTeacherSource({
        disponibilidadDocente: summary.validAvailabilityRows,
        cargaHorariaDocente: summary.validWorkloadRows,
      }).filter((row) => row.disponible_mesa !== false)
    : []

  if (structuredRows.length) {
    return {
      source: 'structured',
      horariosDocentes: structuredRows,
      structuredRows,
      legacyRows: asArray(horariosDocentes),
      diagnostics: summary,
    }
  }

  return {
    source: asArray(horariosDocentes).length ? 'legacy' : 'missing',
    horariosDocentes: asArray(horariosDocentes),
    structuredRows,
    legacyRows: asArray(horariosDocentes),
    diagnostics: summary,
  }
}
