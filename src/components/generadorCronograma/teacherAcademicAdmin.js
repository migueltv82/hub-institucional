function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeNumber(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

const CATEDRA_MINUTES = 40
const GENERATED_FROM_SCHEDULE_TEXT = 'generado desde horarios'
const INFERRED_TITULAR_TEXT = 'titular inferido'
const INFERRED_TITULARITY_TEXT = 'titularidad inferida'
const DETECTED_FROM_SCHEDULE_TEXT = 'detectado desde horarios'

function readField(row = {}, fields = []) {
  const field = fields.find((candidate) => clean(row?.[candidate]))
  return clean(field ? row[field] : '')
}

function readHours(row = {}) {
  const value = row.horasCatedra ?? row.horas_catedra ?? row.teachingHours ?? row.carga_horaria
  if (!clean(value)) return null
  return normalizeNumber(value)
}

function timeToMinutes(value) {
  const text = clean(value)
  const match = text.match(/^(\d{1,2})(?::|\.)(\d{2})$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }

  return hours * 60 + minutes
}

export function readScheduleCatedraHours(row = {}) {
  const explicitHours = readHours(row)
  if (explicitHours !== null) return explicitHours

  const start = timeToMinutes(row.inicio ?? row.hora_inicio ?? row.horaDesde ?? row.hora_desde ?? row.desde)
  const end = timeToMinutes(row.fin ?? row.hora_fin ?? row.horaHasta ?? row.hora_hasta ?? row.hasta)
  if (start === null || end === null) return null

  const duration = end >= start ? end - start : end + (24 * 60) - start
  if (duration <= 0) return null

  return Math.max(1, Math.round(duration / CATEDRA_MINUTES))
}

function readCareer(row = {}) {
  return readField(row, ['carrera', 'carrera_nombre', 'programa', 'program', 'career', 'career_name', 'program_name'])
}

function readSubject(row = {}) {
  return readField(row, [
    'materia_nombre',
    'materiaNombre',
    'nombreMateria',
    'nombre_materia',
    'subject_name',
    'subjectName',
    'asignatura',
    'materia',
    'materia_codigo',
    'codigo',
  ])
}

function readSubjectCode(row = {}) {
  return readField(row, [
    'materia_codigo',
    'materiaCodigo',
    'codigo',
    'subject_code',
    'subjectCode',
    'materia',
    'subject_id',
    'subjectId',
  ])
}

function readSubjectName(row = {}) {
  return readField(row, [
    'materia_nombre',
    'materiaNombre',
    'nombreMateria',
    'nombre_materia',
    'subject_name',
    'subjectName',
    'asignatura',
    'nombre',
  ]) || readSubjectCode(row)
}

export function isGeneratedScheduleWorkload(row = {}) {
  return (
    normalize(row.source || row.origen || row.fuente) === 'horarios_docentes' ||
    normalize(row.observaciones || row.observation || row.notes).includes(GENERATED_FROM_SCHEDULE_TEXT) ||
    normalize(row.id).startsWith('carga-desde-horarios')
  )
}

export function isUnconfirmedInferredDocenteMateria(row = {}) {
  const source = normalize(row.source || row.origen || row.fuente)
  const observations = normalize(row.observaciones || row.observacion || row.observation || row.notes)
  const confirmed = observations.includes('confirmado') ||
    observations.includes('declarado') ||
    observations.includes('no inferido')

  if (confirmed) return false

  return (
    observations.includes(INFERRED_TITULAR_TEXT) ||
    observations.includes(INFERRED_TITULARITY_TEXT) ||
    observations.includes(DETECTED_FROM_SCHEDULE_TEXT) ||
    (source.includes('horarios') && source.includes('docentes'))
  )
}

function readPlan(row = {}) {
  return readField(row, ['plan', 'plan_id', 'planId', 'study_plan_id', 'studyPlanId'])
}

function readAcademicYear(row = {}) {
  return readField(row, ['anio', 'ano', 'year', 'curso', 'academic_year', 'academicYear'])
}

function roundCatedraHours(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return number > 0 ? Math.max(1, Math.round(number)) : 0
}

function firstCleanField(rows = [], fields = []) {
  for (const row of rows) {
    const value = readField(row, fields)
    if (value) return value
  }

  return ''
}

function pushUnique(list, value) {
  const cleaned = clean(value)
  if (cleaned && !list.includes(cleaned)) list.push(cleaned)
}

function pushAlias(list, value) {
  const normalized = normalize(value)
  if (normalized && !list.includes(normalized)) list.push(normalized)
}

function getTeacherAliases(row = {}) {
  const aliases = []
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : {}

  ;[
    row.docenteId,
    row.docente_id,
    row.teacher_record_id,
    row.teacherRecordId,
    row.record_id,
    row.id_docente,
    row.teacher_id,
    row.teacherId,
    row.user_id,
    row.userId,
    row.id,
    row.dni_docente,
    row.dni,
    row.documento,
    row.email,
    row.correo,
    row.mail,
    row.docente,
    row.profesor,
    row.full_name,
    row.nombre,
    getTeacherDisplayName(row),
    profile.docenteId,
    profile.docente_id,
    profile.teacher_record_id,
    profile.record_id,
    profile.id,
    profile.dni_docente,
    profile.dni,
    profile.documento,
    profile.email,
    profile.correo,
    profile.mail,
    profile.docente,
    profile.profesor,
    profile.full_name,
    profile.nombre,
    getTeacherDisplayName(profile),
  ].forEach((value) => pushAlias(aliases, value))

  return aliases
}

export function getTeacherDisplayName(teacher = {}) {
  return clean(
    teacher.full_name ||
    teacher.docente ||
    teacher.profesor ||
    [teacher.apellido, teacher.nombre].map(clean).filter(Boolean).join(' ') ||
    teacher.nombre ||
    [teacher.first_name, teacher.last_name].map(clean).filter(Boolean).join(' '),
  )
}

export function getTeacherIdentityKey(value = {}) {
  if (typeof value === 'string') return normalize(value)

  return normalize(
    value.docenteId ||
    value.docente_id ||
    value.teacherId ||
    value.teacher_id ||
    value.dni_docente ||
    value.dni ||
    value.documento ||
    getTeacherDisplayName(value),
  )
}

export function getAvailabilityTeacherKey(row = {}) {
  return getTeacherIdentityKey({
    docenteId: row.docenteId,
    docente_id: row.docente_id,
    dni_docente: row.dni_docente,
    docente: row.docente,
    profesor: row.profesor,
  })
}

export function getLoadTeacherKey(row = {}) {
  return getTeacherIdentityKey({
    docenteId: row.docenteId,
    docente_id: row.docente_id,
    dni_docente: row.dni_docente,
    docente: row.docente,
    profesor: row.profesor,
  })
}

function getLoadMergeKey(row = {}) {
  return [
    getLoadTeacherKey(row),
    normalize(readCareer(row)),
    normalize(readSubjectName(row) || readSubject(row) || readSubjectCode(row)),
  ].join('::')
}

function getScheduleSummaryKey(row = {}, teacherKey = '') {
  return [
    teacherKey,
    normalize(readCareer(row)),
    normalize(readSubjectName(row) || readSubject(row) || readSubjectCode(row)),
    normalize(row.dia || row.day || row.diaSemana),
    normalize(row.inicio ?? row.hora_inicio ?? row.horaDesde ?? row.hora_desde ?? row.desde),
    normalize(row.fin ?? row.hora_fin ?? row.horaHasta ?? row.hora_hasta ?? row.hasta),
  ].join('::')
}

function getAcademicSubjectKey(row = {}, teacherKey = '') {
  return [
    teacherKey,
    normalize(readCareer(row)),
    normalize(readSubjectName(row) || readSubject(row) || readSubjectCode(row)),
  ].join('::')
}

function readAssignmentRole(row = {}, { source = 'structured', roleOverride = '' } = {}) {
  if (roleOverride) return clean(roleOverride).toUpperCase()
  if (source === 'horarios_docentes' || isGeneratedScheduleWorkload(row)) return ''

  return readField(row, ['rol_en_materia', 'rol', 'role']).toUpperCase()
}

export function getTeacherOptionKey(teacher = {}) {
  return getTeacherIdentityKey({
    docenteId: teacher.docenteId || teacher.docente_id || teacher.id || teacher.record_id,
    dni: teacher.dni,
    dni_docente: teacher.dni_docente,
    documento: teacher.documento,
    nombre: getTeacherDisplayName(teacher),
  })
}

export function createEmptyAvailabilityDraft(defaultTeacher = '') {
  return {
    docente: defaultTeacher,
    dia: '',
    turno: 'NOCHE',
    hora_desde: '',
    hora_hasta: '',
    disponible_mesa: true,
    motivo_no_disponible: '',
    estado: 'activo',
    vigencia_desde: '',
    vigencia_hasta: '',
    observaciones: '',
  }
}

export function createEmptyLoadDraft(defaultTeacher = '') {
  return {
    docente: defaultTeacher,
    carrera: '',
    plan: '',
    materia_codigo: '',
    materia_nombre: '',
    anio: '',
    horasCatedra: '',
    rol_en_materia: 'TITULAR',
    estado_asignacion: 'ACTIVO',
    observaciones: '',
  }
}

export function validateAvailabilityDraft(draft = {}) {
  if (!clean(draft.docente)) return { ok: false, error: 'Selecciona o escribe el docente.' }
  if (!clean(draft.dia)) return { ok: false, error: 'La disponibilidad debe tener dia.' }
  if (!clean(draft.hora_desde) || !clean(draft.hora_hasta)) {
    return { ok: false, error: 'La disponibilidad debe tener franja horaria desde y hasta.' }
  }

  return {
    ok: true,
    value: {
      docente: clean(draft.docente),
      dia: clean(draft.dia),
      turno: clean(draft.turno || 'NOCHE').toUpperCase(),
      hora_desde: clean(draft.hora_desde),
      hora_hasta: clean(draft.hora_hasta),
      disponible_mesa: draft.disponible_mesa !== false,
      motivo_no_disponible: clean(draft.motivo_no_disponible),
      estado: clean(draft.estado || 'activo'),
      vigencia_desde: clean(draft.vigencia_desde),
      vigencia_hasta: clean(draft.vigencia_hasta),
      observaciones: clean(draft.observaciones),
    },
  }
}

export function validateLoadDraft(draft = {}) {
  if (!clean(draft.docente)) return { ok: false, error: 'Selecciona o escribe el docente.' }
  if (!clean(draft.carrera)) return { ok: false, error: 'La asignacion debe tener carrera.' }
  if (!clean(draft.materia_codigo) && !clean(draft.materia_nombre)) {
    return { ok: false, error: 'La asignacion debe tener materia.' }
  }

  const hours = normalizeNumber(draft.horasCatedra)
  if (hours === null || hours <= 0) {
    return { ok: false, error: 'La carga horaria debe ser mayor a cero.' }
  }

  return {
    ok: true,
    value: {
      docente: clean(draft.docente),
      carrera: clean(draft.carrera),
      plan: clean(draft.plan),
      materia_codigo: clean(draft.materia_codigo),
      materia_nombre: clean(draft.materia_nombre || draft.materia_codigo),
      anio: clean(draft.anio),
      horasCatedra: hours,
      rol_en_materia: clean(draft.rol_en_materia || 'TITULAR').toUpperCase(),
      estado_asignacion: clean(draft.estado_asignacion || 'ACTIVO').toUpperCase(),
      observaciones: clean(draft.observaciones),
    },
  }
}

export function buildTeacherAcademicSummary({
  teachers = [],
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  docenteMateria = [],
  horariosDocentes = [],
} = {}) {
  const summaries = new Map()
  const canonicalByAlias = new Map()

  function rememberAliases(key, row = {}) {
    if (!key) return
    getTeacherAliases(row).forEach((alias) => {
      if (!canonicalByAlias.has(alias)) canonicalByAlias.set(alias, key)
    })
    if (!canonicalByAlias.has(key)) canonicalByAlias.set(key, key)
  }

  function resolveTeacherKey(row = {}, fallbackKey = '') {
    const aliases = getTeacherAliases(row)
    const knownKey = aliases.map((alias) => canonicalByAlias.get(alias)).find(Boolean)
    const nextKey = knownKey || fallbackKey || aliases[0] || ''
    rememberAliases(nextKey, row)
    return nextKey
  }

  function ensureSummary(key, teacherName = '') {
    if (!key) return null
    const current = summaries.get(key) ?? {
      key,
      docente: teacherName,
      carreras: [],
      totalHoras: 0,
      horasDeclaradas: null,
      horasPorCarrera: {},
      horasSource: '',
      materias: [],
      materiasDetalle: [],
      profileCarreras: [],
      profileMaterias: [],
      disponibilidad: [],
      especialidad: '',
      familiasIdoneidad: '',
      idoneidadAcademica: '',
      turnosDisponibles: '',
      alertas: [],
    }
    if (!current.docente && teacherName) current.docente = teacherName
    summaries.set(key, current)
    return current
  }

  asArray(teachers).forEach((teacher) => {
    const key = resolveTeacherKey(teacher, getTeacherOptionKey(teacher))
    const summary = ensureSummary(key, getTeacherDisplayName(teacher))
    if (!summary) return

    const profile = teacher.profile && typeof teacher.profile === 'object' ? teacher.profile : teacher
    const declaredHours = readHours(teacher) ?? readHours(profile)
    if (declaredHours !== null) summary.horasDeclaradas = declaredHours
    summary.especialidad = summary.especialidad || readField(profile, ['especialidad', 'specialty'])
    summary.familiasIdoneidad = summary.familiasIdoneidad || readField(profile, ['familias_idoneidad', 'familiasIdoneidad', 'idoneidad_familias'])
    summary.idoneidadAcademica = summary.idoneidadAcademica || readField(profile, ['idoneidad_academica_explicita', 'idoneidadAcademicaExplicita', 'idoneidad_academica'])
    summary.turnosDisponibles = summary.turnosDisponibles || readField(profile, ['turnos_disponibles', 'turnosDisponibles', 'turnos'])
    asArray(teacher.carreras).forEach((career) => pushUnique(summary.profileCarreras, career))
    asArray(teacher.materias).forEach((subject) => pushUnique(summary.profileMaterias, subject))
  })

  function addAcademicAssignment(row = {}, { countHours = false, source = 'structured', hoursOverride = null, roleOverride = '' } = {}) {
    const key = resolveTeacherKey(row, getLoadTeacherKey(row))
    const summary = ensureSummary(key, clean(row.docente || row.profesor))
    if (!summary) return

    const hours = hoursOverride ?? readHours(row) ?? 0
    const career = readCareer(row) || 'Sin carrera'
    const subject = readSubject(row)
    const role = readAssignmentRole(row, { source, roleOverride })
    const status = readField(row, ['estado_asignacion', 'estado', 'status'])
    const hasExplicitCareerHours = (
      (summary.horasSource && summary.horasSource !== 'horarios_docentes') ||
      summary.horasDeclaradas !== null
    )

    if (countHours && hours > 0 && (source !== 'horarios_docentes' || !hasExplicitCareerHours)) {
      summary.totalHoras += hours
      summary.horasPorCarrera[career] = (summary.horasPorCarrera[career] ?? 0) + hours
      summary.horasSource = source
    }
    pushUnique(summary.carreras, career)
    pushUnique(summary.materias, subject)
    if (subject) {
      const detailKey = [career, subject, role, status].map(clean).join('::')
      const hasSubjectDetail = summary.materiasDetalle.some((detail) => (
        normalize(detail.carrera) === normalize(career) &&
        normalize(detail.materia) === normalize(subject)
      ))
      const hasSameRoleDetail = summary.materiasDetalle.some((detail) => (
        normalize(detail.carrera) === normalize(career) &&
        normalize(detail.materia) === normalize(subject) &&
        normalize(detail.rol) === normalize(role)
      ))
      if (!hasSubjectDetail || (role && !hasSameRoleDetail && !summary.materiasDetalle.some((detail) => detail.key === detailKey))) {
        summary.materiasDetalle.push({ key: detailKey, carrera: career, materia: subject, rol: role, estado: status, source })
      }
    }
  }

  asArray(docenteMateria).forEach((row) => {
    const inferredFromSchedule = isUnconfirmedInferredDocenteMateria(row)
    addAcademicAssignment(row, {
      countHours: readHours(row) !== null,
      source: inferredFromSchedule ? 'horarios_docentes' : 'docente_materia',
    })
  })

  const workloadSubjectKeysWithHours = new Set()
  asArray(cargaHorariaDocente).forEach((row) => {
    const source = isGeneratedScheduleWorkload(row) ? 'horarios_docentes' : 'carga_horaria'
    const teacherKey = resolveTeacherKey(row, getLoadTeacherKey(row))
    const hours = readHours(row)
    if (hours !== null && hours > 0) {
      workloadSubjectKeysWithHours.add(getAcademicSubjectKey(row, teacherKey))
    }
    addAcademicAssignment(row, { countHours: true, source })
  })

  const countedScheduleKeys = new Set()
  asArray(horariosDocentes).forEach((row) => {
    const scheduleHours = readScheduleCatedraHours(row)
    const teacherKey = resolveTeacherKey(row, getLoadTeacherKey(row))
    const scheduleKey = getScheduleSummaryKey(row, teacherKey)
    const subjectKey = getAcademicSubjectKey(row, teacherKey)
    const shouldCountHours = scheduleHours !== null &&
      !workloadSubjectKeysWithHours.has(subjectKey) &&
      !countedScheduleKeys.has(scheduleKey)
    if (shouldCountHours) countedScheduleKeys.add(scheduleKey)

    addAcademicAssignment(row, {
      countHours: shouldCountHours,
      source: 'horarios_docentes',
      hoursOverride: scheduleHours,
    })
  })

  asArray(disponibilidadDocente).forEach((row) => {
    const key = resolveTeacherKey(row, getAvailabilityTeacherKey(row))
    const summary = ensureSummary(key, clean(row.docente || row.profesor))
    if (!summary) return

    summary.disponibilidad.push({
      dia: clean(row.dia || row.day || row.diaSemana),
      turno: clean(row.turno || row.shift),
      desde: clean(row.hora_desde || row.horaDesde || row.inicio || row.desde),
      hasta: clean(row.hora_hasta || row.horaHasta || row.fin || row.hasta),
      disponible: row.disponible_mesa !== false,
    })
  })

  summaries.forEach((summary) => {
    if (summary.materiasDetalle.length > 0) {
      summary.carreras = []
      summary.materias = []
      summary.materiasDetalle.forEach((detail) => {
        pushUnique(summary.carreras, detail.carrera)
        pushUnique(summary.materias, detail.materia)
      })
    } else {
      summary.profileCarreras.forEach((career) => pushUnique(summary.carreras, career))
      summary.profileMaterias.forEach((subject) => pushUnique(summary.materias, subject))
    }

    if (summary.totalHoras === 0 && summary.horasDeclaradas !== null) {
      summary.totalHoras = summary.horasDeclaradas
    }
    if (summary.materias.length > 0 && summary.totalHoras <= 0) {
      summary.alertas.push('Tiene materias asignadas sin horas declaradas.')
    }
    if (summary.totalHoras > 0 && summary.disponibilidad.length === 0) {
      summary.alertas.push('Tiene carga horaria sin disponibilidad.')
    }
    if (summary.disponibilidad.length > 0 && summary.materias.length === 0) {
      summary.alertas.push('Tiene disponibilidad sin materias asignadas.')
    }
  })

  return Array.from(summaries.values())
    .sort((left, right) => clean(left.docente).localeCompare(clean(right.docente), 'es', { sensitivity: 'base' }))
}

export function buildTeacherAcademicAlerts({
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  docenteMateria = [],
  summaries = [],
} = {}) {
  const alerts = []

  asArray(docenteMateria).forEach((row, index) => {
    const label = clean(row.docente || row.profesor || `Fila ${index + 1}`)

    if (!clean(row.docente_id || row.docenteId || row.dni_docente || row.dni || row.docente || row.profesor)) {
      alerts.push(`Relacion docente-materia ${label} sin docente.`)
    }
    if (!readCareer(row)) {
      alerts.push(`Relacion docente-materia de ${label} sin carrera.`)
    }
    if (!readSubject(row)) {
      alerts.push(`Relacion docente-materia de ${label} sin materia.`)
    }
  })

  asArray(cargaHorariaDocente).forEach((row, index) => {
    const label = clean(row.docente || row.profesor || `Fila ${index + 1}`)
    const hours = normalizeNumber(row.horasCatedra ?? row.horas_catedra ?? row.teachingHours)

    if (!clean(row.carrera || row.programa || row.program)) {
      alerts.push(`Carga horaria de ${label} sin carrera.`)
    }
    if (!clean(row.materia_codigo || row.materia || row.codigo || row.materia_nombre || row.nombreMateria)) {
      alerts.push(`Carga horaria de ${label} sin materia.`)
    }
    if (hours === null || hours <= 0) {
      alerts.push(`Carga horaria de ${label} sin horas validas.`)
    }
  })

  asArray(disponibilidadDocente).forEach((row, index) => {
    const label = clean(row.docente || row.profesor || `Fila ${index + 1}`)

    if (!clean(row.dia || row.day || row.diaSemana)) {
      alerts.push(`Disponibilidad de ${label} sin dia.`)
    }
    if (
      !clean(row.hora_desde || row.horaDesde || row.inicio || row.desde) ||
      !clean(row.hora_hasta || row.horaHasta || row.fin || row.hasta)
    ) {
      alerts.push(`Disponibilidad de ${label} sin franja horaria completa.`)
    }
  })

  asArray(summaries).forEach((summary) => {
    summary.alertas.forEach((alert) => alerts.push(`${summary.docente || 'Docente'}: ${alert}`))
  })

  return [...new Set(alerts)]
}

export function buildCargaHorariaDocenteFromHorarios({
  cargaHorariaDocente = [],
  horariosDocentes = [],
} = {}) {
  const scheduleGroups = new Map()

  asArray(horariosDocentes).forEach((schedule) => {
    const hours = readScheduleCatedraHours(schedule)
    if (hours === null || hours <= 0) return

    const key = getLoadMergeKey(schedule)
    const career = readCareer(schedule)
    const subjectCode = readSubjectCode(schedule)
    const subjectName = readSubjectName(schedule)
    const teacherName = clean(schedule.docente || schedule.profesor || getTeacherDisplayName(schedule))

    if (!key || key === '::' || !teacherName || !career || (!subjectCode && !subjectName)) return

    const group = scheduleGroups.get(key) ?? {
      key,
      hours: 0,
      rows: [],
    }
    group.hours += hours
    group.rows.push(schedule)
    scheduleGroups.set(key, group)
  })

  const currentRows = asArray(cargaHorariaDocente)
  const currentByKey = new Map()
  currentRows.forEach((row) => {
    const key = getLoadMergeKey(row)
    if (key && key !== '::' && !currentByKey.has(key)) currentByKey.set(key, row)
  })

  const generatedRows = Array.from(scheduleGroups.values()).map((group, index) => {
    const rows = group.rows
    const firstRow = rows[0] ?? {}
    const existing = currentByKey.get(group.key)
    const existingIsGenerated = isGeneratedScheduleWorkload(existing)
    const existingRole = existing && !existingIsGenerated
      ? clean(existing.rol_en_materia || existing.rol || existing.role).toUpperCase()
      : ''
    const generatedOnlyFields = existing && !existingIsGenerated
      ? {}
      : {
          titularidad: false,
          es_titular: false,
          isTitular: false,
        }

    return {
      ...(existing ?? {}),
      id: existing?.id ?? `carga-desde-horarios-${index + 1}`,
      docenteId: firstCleanField(rows, ['docenteId', 'docente_id', 'teacher_record_id', 'record_id']),
      docente: firstCleanField(rows, ['docente', 'profesor', 'full_name', 'nombre']) || getTeacherDisplayName(firstRow),
      dni_docente: firstCleanField(rows, ['dni_docente', 'dni', 'documento']),
      carrera: readCareer(firstRow),
      plan: readPlan(firstRow),
      materia_codigo: readSubjectCode(firstRow),
      materia_nombre: readSubjectName(firstRow),
      anio: readAcademicYear(firstRow),
      horasCatedra: roundCatedraHours(group.hours),
      rol_en_materia: existingRole,
      estado_asignacion: clean(existing?.estado_asignacion || existing?.estado || 'ACTIVO').toUpperCase(),
      observaciones: clean(existing?.observaciones) || 'Generado desde horarios docentes.',
      source: existing && !existingIsGenerated ? clean(existing.source || existing.origen || 'carga_horaria_docente') : 'horarios_docentes',
      ...generatedOnlyFields,
    }
  })

  const generatedKeys = new Set(generatedRows.map(getLoadMergeKey))
  const manualRows = currentRows.filter((row) => !generatedKeys.has(getLoadMergeKey(row)))

  return {
    rows: [...manualRows, ...generatedRows]
      .sort((left, right) => (
        clean(left.docente || left.profesor).localeCompare(clean(right.docente || right.profesor), 'es', { sensitivity: 'base' }) ||
        clean(left.carrera).localeCompare(clean(right.carrera), 'es', { sensitivity: 'base' }) ||
        clean(left.materia_nombre || left.materia_codigo).localeCompare(clean(right.materia_nombre || right.materia_codigo), 'es', { sensitivity: 'base' })
      )),
    generated: generatedRows.length,
    preserved: manualRows.length,
  }
}

export function buildLegacyScheduleRowsFromStructuredTeacherSource({
  cargaHorariaDocente = [],
  disponibilidadDocente = [],
} = {}) {
  const availabilityByTeacher = asArray(disponibilidadDocente).reduce((map, row) => {
    const key = getAvailabilityTeacherKey(row)
    if (!key) return map
    const rows = map.get(key) ?? []
    rows.push(row)
    map.set(key, rows)
    return map
  }, new Map())

  return asArray(cargaHorariaDocente).flatMap((load, loadIndex) => {
    const key = getLoadTeacherKey(load)
    const availabilityRows = availabilityByTeacher.get(key) ?? []
    const rows = availabilityRows.length ? availabilityRows : [{}]
    const subjectCode = clean(load.materia_codigo || load.materiaCodigo || load.materia || load.codigo)
    const subjectName = clean(load.materia_nombre || load.materiaNombre || load.nombreMateria || load.nombre || subjectCode)
    const generatedFromSchedule = isGeneratedScheduleWorkload(load)

    return rows.map((availability, availabilityIndex) => ({
      id: `structured-${load.id ?? loadIndex}-${availability.id ?? availabilityIndex}`,
      docenteId: clean(load.docenteId || load.docente_id),
      profesor: clean(load.docente || load.profesor),
      docente: clean(load.docente || load.profesor),
      dni_docente: clean(load.dni_docente || load.dni),
      carrera: clean(load.carrera || load.programa || load.program),
      materia: subjectCode,
      codigo: subjectCode,
      nombreMateria: subjectName,
      anio: clean(load.anio || load.ano || load.year || load.curso),
      horasCatedra: load.horasCatedra ?? load.horas_catedra ?? load.teachingHours,
      rol_en_materia: generatedFromSchedule ? '' : clean(load.rol_en_materia || load.rol || 'TITULAR'),
      ...(generatedFromSchedule ? { titularidad: false, es_titular: false, isTitular: false } : {}),
      estado_asignacion: clean(load.estado_asignacion || load.estado || 'ACTIVO'),
      dia: clean(availability.dia || availability.day || availability.diaSemana),
      turno: clean(availability.turno || availability.shift),
      inicio: clean(availability.hora_desde || availability.horaDesde || availability.inicio || availability.desde),
      fin: clean(availability.hora_hasta || availability.horaHasta || availability.fin || availability.hasta),
      disponible_mesa: availability.disponible_mesa !== false,
      source: 'structured_teacher_source',
    }))
  })
}
