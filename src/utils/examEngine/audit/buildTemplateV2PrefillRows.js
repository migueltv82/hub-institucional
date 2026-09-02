import { inferTeachingHoursFromScheduleRow } from '../rules/calculateTeacherAssignmentLimit.js'
import { getInstitutionalSubjectAffinity } from '../rules/institutionalSubjectAffinities.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
}

function normalizeId(value, fallback = '') {
  const key = normalizeText(value || fallback)
  return key ? key.toUpperCase() : ''
}

function carreraId(value) {
  return normalizeId(value, 'CARRERA')
}

const INSTITUTIONAL_CAREERS = Object.freeze([
  { name: 'TECNICO SUPERIOR EN TURISMO', duration: 3, plans: [{ key: 'TURISMO-ACTUAL', name: 'Plan vigente' }] },
  {
    name: 'TECNICO SUPERIOR EN LABORATORIO',
    duration: 3,
    plans: [
      { key: 'LABORATORIO-2015', name: 'Plan 2015', year: 2015, coexistsWith: 'LABORATORIO-2024' },
      { key: 'LABORATORIO-2024', name: 'Plan 2024', year: 2024, coexistsWith: 'LABORATORIO-2015' },
    ],
  },
  { name: 'TECNICO SUPERIOR EN TRADUCTORADO', duration: 3, plans: [{ key: 'TRADUCTORADO-ACTUAL', name: 'Plan vigente' }] },
  { name: 'PROFESORADO DE INGLES', duration: 4, plans: [{ key: 'PROFESORADO-INGLES-ACTUAL', name: 'Plan vigente' }] },
  { name: 'PROFESORADO DE QUIMICA', duration: 4, plans: [{ key: 'PROFESORADO-QUIMICA-ACTUAL', name: 'Plan vigente' }] },
  { name: 'PROFESORADO DE GEOGRAFIA', duration: 4, plans: [{ key: 'PROFESORADO-GEOGRAFIA-ACTUAL', name: 'Plan vigente' }] },
])

function institutionalCareer(value) {
  const normalized = normalizeText(value)
  if (/trad/.test(normalized)) return INSTITUTIONAL_CAREERS[2]
  return INSTITUTIONAL_CAREERS.find((career) => careerNamesAreCompatible(career.name, value)) ?? null
}

function planIdForCareer(value) {
  const career = institutionalCareer(value)
  if (career) return career.plans.at(-1).key
  const id = carreraId(value)
  return id ? `${id}-ACTUAL` : ''
}

function planIdForRow(row = {}, careerName = '') {
  const explicit = clean(row.plan_id ?? row.planId)
  if (explicit) return explicit
  const career = institutionalCareer(careerName)
  if (career?.plans.length === 2) {
    const reference = normalizeText([
      row.plan, row.plan_nombre, row.anio_plan, row.materia_codigo, row.materia, row.codigo,
    ].filter(Boolean).join(' '))
    if (/(^|_)2015(_|$)|lab15/.test(reference)) return career.plans[0].key
    return career.plans[1].key
  }
  return planIdForCareer(careerName)
}

function materiaCodigo(value) {
  return normalizeId(value, 'MATERIA')
}

function docenteDisplayName(row = {}) {
  return clean(
    row.docente ??
    row.profesor ??
    row.full_name ??
    [row.nombre, row.apellido].filter(Boolean).join(' ') ??
    row.nombre_docente,
  )
}

function docenteId(row = {}) {
  const dni = clean(row.dni_docente ?? row.dni ?? row.documento ?? row.document_number)
  if (dni) return `DOC-${normalizeId(dni)}`

  const explicit = clean(row.docente_id ?? row.docenteId ?? row.id)
  if (explicit) return normalizeId(explicit)

  const name = docenteDisplayName(row)
  return name ? `DOC-${normalizeId(name)}` : ''
}

function alumnoId(row = {}) {
  const explicit = clean(row.alumno_id ?? row.alumnoId ?? row.id)
  if (explicit) return normalizeId(explicit)

  const dni = clean(row.dni ?? row.documento ?? row.document_number)
  if (dni) return `ALU-${normalizeId(dni)}`

  const email = clean(row.email ?? row.correo ?? row.mail)
  if (email) return `ALU-${normalizeId(email)}`

  return ''
}

function splitName(fullName = '') {
  const text = clean(fullName)
  if (!text) return { apellido: '', nombre: '' }

  if (text.includes(',')) {
    const [apellido, ...nombreParts] = text.split(',')
    return {
      apellido: clean(apellido),
      nombre: clean(nombreParts.join(',')),
    }
  }

  return {
    apellido: '',
    nombre: text,
  }
}

function scheduleKey(row = {}) {
  return [
    docenteId(row),
    carreraId(row.carrera),
    materiaCodigo(row.materia),
    normalizeText(row.dia),
    clean(row.inicio ?? row.hora_inicio),
    clean(row.fin ?? row.hora_fin),
  ].join('::')
}

function inferTurno(row = {}) {
  const explicit = clean(row.turno ?? row.turnos ?? row.shift)
  if (explicit) return explicit.toUpperCase()

  const start = clean(row.inicio ?? row.hora_inicio ?? row.desde)
  const hour = Number(start.split(':')[0])
  if (!Number.isFinite(hour)) return ''
  if (hour < 13) return 'MANANA'
  if (hour < 18) return 'TARDE'
  return 'NOCHE'
}

function getRows(sourceData = {}, key) {
  return Array.isArray(sourceData[key]) ? sourceData[key] : []
}

function uniqueRows(rows = [], keyFn) {
  const seen = new Set()
  const result = []

  rows.forEach((row) => {
    const key = keyFn(row)
    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(row)
  })

  return result
}

function careerTokens(value) {
  const stopWords = new Set([
    'de', 'del', 'la', 'las', 'el', 'los', 'en', 'para', 'y', 'e', 'con',
    'tecnico', 'tecnica', 'tecnicatura', 'superior', 'turno', 'noche',
  ])
  const aliases = {
    traductor: 'traductorado',
    traduccion: 'traductorado',
    laboratorios: 'laboratorio',
  }
  return normalizeText(value).split('_')
    .map((token) => aliases[token] ?? token)
    .filter((token) => token && !stopWords.has(token))
}

function careerNamesAreCompatible(left, right) {
  const leftTokens = careerTokens(left)
  const rightTokens = careerTokens(right)
  if (!leftTokens.length || !rightTokens.length) return false
  const leftSet = new Set(leftTokens)
  const rightSet = new Set(rightTokens)
  return leftTokens.every((token) => rightSet.has(token)) ||
    rightTokens.every((token) => leftSet.has(token))
}

function buildCareerCanonicalizer(planesEstudio = []) {
  const officialNames = uniqueRows(
    [
      ...INSTITUTIONAL_CAREERS.map((career) => career.name),
      ...planesEstudio.map((row) => clean(row.carrera)).filter(Boolean),
    ],
    normalizeText,
  )

  return (value) => {
    const name = clean(value)
    if (!name) return ''
    const institutional = institutionalCareer(name)
    if (institutional) return institutional.name
    const exact = officialNames.find((official) => normalizeText(official) === normalizeText(name))
    if (exact) return exact
    const compatible = officialNames.filter((official) => careerNamesAreCompatible(official, name))
    return compatible.length === 1 ? compatible[0] : name
  }
}

function canonicalizeCareerRows(rows = [], canonicalizeCareer) {
  return rows.map((row) => ({
    ...row,
    carrera: canonicalizeCareer(row.carrera),
  }))
}

function teacherNameKey(row = {}) {
  return docenteDisplayName(row).split(/[\s,]+/)
    .map(normalizeText)
    .filter(Boolean)
    .sort()
    .join('::')
}

function explicitTeacherId(row = {}) {
  return clean(row.docente_id ?? row.docenteId ?? row.teacherId ?? row.id)
}

function teacherDni(row = {}) {
  return clean(row.dni_docente ?? row.dni ?? row.documento ?? row.document_number)
}

function buildTeacherCanonicalizer({ docentes = [], horariosDocentes = [], docenteMateria = [] }) {
  const sourceRows = [...docentes, ...docenteMateria, ...horariosDocentes]
  const groups = new Map()

  sourceRows.forEach((row) => {
    const key = teacherNameKey(row)
    if (!key) return
    const rows = groups.get(key) ?? []
    rows.push(row)
    groups.set(key, rows)
  })

  const canonicalByName = new Map()
  const canonicalByAlias = new Map()
  groups.forEach((rows, nameKey) => {
    const dnis = [...new Set(rows.map(teacherDni).filter(Boolean))]
    const preferredProfile = rows.find((row) => docentes.includes(row)) ?? rows[0]
    const preferredExplicitId = explicitTeacherId(preferredProfile) ||
      rows.map(explicitTeacherId).find(Boolean)
    const canonicalId = dnis.length === 1
      ? `DOC-${normalizeId(dnis[0])}`
      : normalizeId(preferredExplicitId) || `DOC-${normalizeId(docenteDisplayName(preferredProfile))}`
    const canonicalName = docenteDisplayName(preferredProfile)
    const record = { id: canonicalId, name: canonicalName, dni: dnis.length === 1 ? dnis[0] : '' }

    if (dnis.length <= 1) canonicalByName.set(nameKey, record)
    rows.forEach((row) => {
      const aliases = [explicitTeacherId(row), teacherDni(row)].map(normalizeText).filter(Boolean)
      aliases.forEach((alias) => canonicalByAlias.set(alias, record))
    })
  })

  return (row = {}) => canonicalByAlias.get(normalizeText(teacherDni(row))) ??
    canonicalByAlias.get(normalizeText(explicitTeacherId(row))) ??
    canonicalByName.get(teacherNameKey(row)) ?? null
}

function canonicalizeTeacherRows(rows = [], canonicalizeTeacher) {
  return rows.map((row) => {
    const teacher = canonicalizeTeacher(row)
    if (!teacher) return row
    return {
      ...row,
      docente_id: teacher.id,
      docenteId: teacher.id,
      docente: teacher.name,
      profesor: teacher.name,
      dni_docente: teacher.dni || teacherDni(row),
    }
  })
}

function buildCareerPlanRows({ horariosDocentes, planesEstudio, alumnos, correlatividades, docenteMateria }) {
  const names = [
    ...horariosDocentes.map((row) => row.carrera),
    ...planesEstudio.map((row) => row.carrera),
    ...alumnos.map((row) => row.carrera),
    ...correlatividades.map((row) => row.carrera),
    ...docenteMateria.map((row) => row.carrera),
  ].map(clean).filter(Boolean)

  const durationByCareer = planesEstudio.reduce((map, row) => {
    const key = normalizeText(row.carrera)
    const year = Number(row.anio ?? row.year ?? row.anio_cursada)
    if (key && Number.isFinite(year)) map.set(key, Math.max(map.get(key) ?? 0, year))
    return map
  }, new Map())

  const institutionalRows = INSTITUTIONAL_CAREERS.flatMap((career) => career.plans.map((plan) => ({
    carrera_id: carreraId(career.name),
    carrera_nombre: career.name,
    duracion_anios: career.duration,
    plan_id: plan.key,
    plan_nombre: plan.name,
    anio_plan: plan.year ?? '',
    resolucion: '',
    estado_plan: 'VIGENTE',
    vigente_desde: '',
    vigente_hasta: '',
    convive_con_plan_id: plan.coexistsWith ?? '',
    observaciones: plan.year ? 'Plan activo institucional.' : 'Completar nombre, ano y resolucion del plan vigente.',
  })))
  const extraNames = names.filter((name) => !institutionalCareer(name))

  return uniqueRows([...institutionalRows, ...extraNames.map((name) => ({
    carrera_id: carreraId(name),
    carrera_nombre: name,
    duracion_anios: durationByCareer.get(normalizeText(name)) || '',
    plan_id: planIdForCareer(name),
    plan_nombre: 'Plan actual',
    anio_plan: '',
    resolucion: '',
    estado_plan: 'VIGENTE',
    vigente_desde: '',
    vigente_hasta: '',
    convive_con_plan_id: '',
    observaciones: 'Migrado desde plantillas cargadas; confirmar plan_id real.',
  }))], (row) => `${row.carrera_id}::${row.plan_id}`)
}

function buildPlanRows(planesEstudio = []) {
  return uniqueRows(planesEstudio.map((row) => {
    const carrera = clean(row.carrera)
    const materia = clean(row.materia)
    const materia_codigo = clean(row.materia_codigo) || materiaCodigo(materia)
    const institutionalAffinity = getInstitutionalSubjectAffinity(materia_codigo)
    return {
      plan_id: planIdForRow(row, carrera),
      carrera_id: carreraId(carrera),
      materia_codigo,
      materia_nombre: clean(row.nombreMateria ?? row.nombre ?? materia),
      grupo_afin_mesa: clean(row.grupo_afin_mesa ?? row.grupoAfinMesa) || institutionalAffinity?.grupoAfinMesa || '',
      codigos_materias_afines: clean(row.codigos_materias_afines ?? row.codigosMateriasAfines) || institutionalAffinity?.codigosMateriasAfines.join(', ') || '',
      anio_cursada: clean(row.anio ?? row.year),
      cuatrimestre: clean(row.cuatrimestre ?? row.semestre),
      regimen: clean(row.regimen ?? row.duracion ?? row.periodicidad).toUpperCase(),
      campo_formacion: '',
      formato: '',
      requiere_mesa: 'SI',
      tipo_mesa: 'REGULAR',
      orden_impresion: '',
      vigente_desde: '',
      vigente_hasta: '',
      observaciones: row.observaciones ?? '',
    }
  }), (row) => `${row.plan_id}::${row.materia_codigo}`)
}

function buildTeacherRows({ docentes, horariosDocentes, docenteMateria }) {
  const sourceRows = [
    ...docentes,
    ...horariosDocentes,
    ...docenteMateria,
  ]
  const scheduleHoursByTeacher = new Map()
  const seenBlocks = new Set()

  horariosDocentes.forEach((row) => {
    const key = scheduleKey(row)
    if (!key || seenBlocks.has(key)) return
    seenBlocks.add(key)

    const id = docenteId(row)
    const result = inferTeachingHoursFromScheduleRow({
      ...row,
      hora_inicio: row.inicio ?? row.hora_inicio,
      hora_fin: row.fin ?? row.hora_fin,
    })
    if (!id || !result.valid) return
    scheduleHoursByTeacher.set(id, (scheduleHoursByTeacher.get(id) ?? 0) + result.teachingHours)
  })

  return uniqueRows(sourceRows.map((row) => {
    const fullName = docenteDisplayName(row)
    const parsed = splitName(fullName)
    const id = docenteId(row)
    return {
      docente_id: id,
      apellido: clean(row.apellido ?? parsed.apellido),
      nombre: clean(row.nombre ?? parsed.nombre),
      dni_docente: clean(row.dni_docente ?? row.dni ?? row.documento),
      email: clean(row.email ?? row.correo ?? row.mail),
      telefono: clean(row.telefono ?? row.celular ?? row.phone),
      estado_docente: clean(row.estado_docente ?? row.estado ?? row.status).toUpperCase() || 'ACTIVO',
      horas_catedra: clean(row.horas_catedra ?? row.horasCatedra) || clean(scheduleHoursByTeacher.get(id)),
      especialidad: clean(row.especialidad),
      familias_idoneidad: clean(row.familias_idoneidad ?? row.grupo_afin_mesa ?? row.tipo_afinidad),
      idoneidad_academica_explicita: '',
      turnos_disponibles: clean(row.turnos_disponibles ?? row.turno ?? inferTurno(row)),
      observaciones: scheduleHoursByTeacher.has(id)
        ? 'Horas catedra inferidas desde horarios; confirmar valor oficial.'
        : clean(row.observaciones),
    }
  }), (row) => row.docente_id)
}

function mapLegacyRole(role = '') {
  const normalized = normalizeText(role)
  if (normalized.includes('titular')) return 'TITULAR'
  if (normalized.includes('suplente')) return 'SUPLENTE'
  if (normalized.includes('reemplazo')) return 'REEMPLAZO'
  if (normalized.includes('auxiliar')) return 'AUXILIAR'
  return 'CO_DOCENTE'
}

function buildTeacherSubjectRows(docenteMateria = [], horariosDocentes = []) {
  const explicitRows = docenteMateria.map((row) => {
    const carrera = clean(row.carrera)
    const materia = clean(row.materia)
    const role = clean(row.rol_en_materia ?? row.rolEnMateria ?? row.rol)
    return {
      plan_id: planIdForRow(row, carrera),
      carrera_id: carreraId(carrera),
      materia_codigo: clean(row.materia_codigo) || materiaCodigo(materia),
      materia_nombre: clean(row.nombreMateria ?? row.nombre_materia ?? row.nombre ?? materia),
      anio_cursada: clean(row.anio ?? row.anio_cursada),
      docente_id: docenteId(row),
      docente: docenteDisplayName(row),
      dni_docente: clean(row.dni_docente ?? row.dni ?? row.documento),
      rol_en_materia: mapLegacyRole(role),
      estado_asignacion: 'ACTIVO',
      vigencia_desde: '',
      vigencia_hasta: '',
      docente_reemplazado_id: '',
      docente_reemplazado: '',
      requiere_mesa: 'SI',
      observaciones: role.includes('VOCAL')
        ? 'Rol migrado desde matriz anterior; confirmar si corresponde titularidad, co-docencia o idoneidad.'
        : clean(row.observaciones),
    }
  })
  const explicitKeys = new Set(explicitRows.map((row) => (
    `${row.plan_id}::${row.materia_codigo}::${row.docente_id}`
  )))
  const teachersBySubject = horariosDocentes.reduce((groups, row) => {
    const carrera = clean(row.carrera)
    const materia = clean(row.materia)
    const key = `${planIdForRow(row, carrera)}::${clean(row.materia_codigo) || materiaCodigo(materia)}`
    const teachers = groups.get(key) ?? new Set()
    const teacher = docenteId(row)
    if (teacher) teachers.add(teacher)
    groups.set(key, teachers)
    return groups
  }, new Map())
  const inferredRows = horariosDocentes.map((row) => {
    const carrera = clean(row.carrera)
    const materia = clean(row.materia)
    const planId = planIdForRow(row, carrera)
    const subjectCode = clean(row.materia_codigo) || materiaCodigo(materia)
    const uniqueTeacher = (teachersBySubject.get(`${planId}::${subjectCode}`)?.size ?? 0) === 1
    return {
      plan_id: planId,
      carrera_id: carreraId(carrera),
      materia_codigo: subjectCode,
      materia_nombre: clean(row.nombreMateria ?? row.nombre ?? materia),
      anio_cursada: clean(row.anio ?? row.anio_cursada),
      docente_id: docenteId(row),
      docente: docenteDisplayName(row),
      dni_docente: clean(row.dni_docente ?? row.dni ?? row.documento),
      rol_en_materia: uniqueTeacher ? 'TITULAR' : '',
      estado_asignacion: 'ACTIVO',
      vigencia_desde: '',
      vigencia_hasta: '',
      docente_reemplazado_id: '',
      docente_reemplazado: '',
      requiere_mesa: 'SI',
      observaciones: uniqueTeacher
        ? 'Titular inferido por unico docente en horarios; confirmar valor institucional.'
        : 'Varios docentes detectados desde horarios; completar rol_en_materia mediante revision institucional.',
    }
  }).filter((row) => !explicitKeys.has(`${row.plan_id}::${row.materia_codigo}::${row.docente_id}`))

  return uniqueRows([...explicitRows, ...inferredRows], (row) => (
    `${row.plan_id}::${row.materia_codigo}::${row.docente_id}`
  ))
}

function buildScheduleRows(horariosDocentes = []) {
  return uniqueRows(horariosDocentes.map((row) => {
    const carrera = clean(row.carrera)
    const materia = clean(row.materia)
    return {
      plan_id: planIdForRow(row, carrera),
      carrera_id: carreraId(carrera),
      materia_codigo: clean(row.materia_codigo) || materiaCodigo(materia),
      materia_nombre: clean(row.nombreMateria ?? row.nombre ?? materia),
      anio_cursada: clean(row.anio ?? row.anio_cursada),
      docente_id: docenteId(row),
      docente: docenteDisplayName(row),
      dni_docente: clean(row.dni_docente ?? row.dni ?? row.documento),
      dia: clean(row.dia).toUpperCase(),
      hora_inicio: clean(row.inicio ?? row.hora_inicio),
      hora_fin: clean(row.fin ?? row.hora_fin),
      modalidad: '',
      sede: clean(row.aula ?? row.sede),
      comision: clean(row.comision),
      observaciones: clean(row.observaciones),
    }
  }), scheduleKey)
}

function buildAvailabilityRows(horariosDocentes = []) {
  return uniqueRows(horariosDocentes.map((row) => ({
    docente_id: docenteId(row),
    docente: docenteDisplayName(row),
    dni_docente: clean(row.dni_docente ?? row.dni ?? row.documento),
    dia: clean(row.dia).toUpperCase(),
    turno: inferTurno(row),
    hora_desde: clean(row.inicio ?? row.hora_inicio),
    hora_hasta: clean(row.fin ?? row.hora_fin),
    disponible_mesa: 'SI',
    motivo_no_disponible: '',
    observaciones: 'Inferido desde horarios docentes; confirmar disponibilidad real para mesas.',
  })), (row) => `${row.docente_id}::${row.dia}::${row.turno}::${row.hora_desde}::${row.hora_hasta}`)
}

function buildStudentRows(alumnos = []) {
  return uniqueRows(alumnos.map((row) => {
    const fullName = clean(row.full_name ?? row.nombreCompleto ?? row.nombre_completo)
    const parsed = splitName(fullName)
    const carrera = clean(row.carrera)
    return {
      alumno_id: alumnoId(row),
      apellido: clean(row.apellido ?? parsed.apellido),
      nombre: clean(row.nombre ?? parsed.nombre),
      dni: clean(row.dni ?? row.documento),
      email: clean(row.email ?? row.correo ?? row.mail).toLowerCase(),
      telefono: clean(row.telefono ?? row.celular ?? row.phone),
      carrera_id: carreraId(carrera),
      plan_id: planIdForRow(row, carrera),
      cohorte: clean(row.cohorte ?? row.anio_ingreso ?? row.anioIngreso),
      anio_ingreso: clean(row.anio_ingreso ?? row.anioIngreso ?? row.cohorte),
      anio_cursada: clean(row.anio_cursada ?? row.anioCursada ?? row.anio ?? row.year ?? row.curso),
      estado_academico: clean(row.estado_academico ?? row.estado ?? row.status).toUpperCase() || 'ACTIVO',
      materia_codigo: '',
      materia_nombre: '',
      condicion: '',
      regularidad_vigente: '',
      fecha_regularidad: '',
      observaciones: 'Migrado desde padron; completar materia_codigo y condicion para examEngine v2.',
    }
  }), (row) => row.alumno_id)
}

function buildCorrelativityRows(correlatividades = []) {
  return correlatividades.flatMap((row) => {
    const carrera = clean(row.carrera)
    const materia = clean(row.materia)
    const correlativas = Array.isArray(row.correlativas) ? row.correlativas : []

    return correlativas.map((correlativa) => ({
      plan_id: planIdForRow(row, carrera),
      carrera_id: carreraId(carrera),
      materia_codigo: clean(row.materia_codigo) || materiaCodigo(materia),
      materia_nombre: clean(row.nombreMateria ?? row.nombre ?? materia),
      correlativa_codigo: materiaCodigo(correlativa),
      correlativa_nombre: clean(correlativa),
      tipo_correlativa: '',
      requisito: '',
      observaciones: 'Migrado desde correlatividades anteriores; confirmar tipo y requisito.',
    }))
  })
}

function toIsoDate(value) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildCalendarRows({ fechaInicio, fechaFin, regularCallRanges }) {
  const ranges = []
  if (regularCallRanges?.first?.start && regularCallRanges?.first?.end) {
    ranges.push(['PRIMER_LLAMADO', regularCallRanges.first.start, regularCallRanges.first.end])
  }
  if (regularCallRanges?.second?.start && regularCallRanges?.second?.end) {
    ranges.push(['SEGUNDO_LLAMADO', regularCallRanges.second.start, regularCallRanges.second.end])
  }
  if (!ranges.length && fechaInicio && fechaFin) {
    ranges.push(['PRIMER_LLAMADO', fechaInicio, fechaFin])
  }

  return ranges.flatMap(([llamado, startRaw, endRaw]) => {
    const start = toIsoDate(startRaw)
    const end = toIsoDate(endRaw)
    if (!start || !end) return []

    const rows = []
    let current = start
    while (current <= end) {
      rows.push({
        llamado_id: `${llamado}-${current}-NOCHE`,
        llamado,
        fecha: current,
        turno: 'NOCHE',
        hora_inicio: '',
        hora_fin: '',
        sede: '',
        capacidad_mesas: '',
        habilitado: 'SI',
        observaciones: 'Migrado desde periodo configurado; completar horario, sede y capacidad.',
      })
      current = addDays(current, 1)
    }
    return rows
  })
}

function numericIdMap(values = []) {
  return new Map([...new Set(values.map(clean).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map((value, index) => [value, index + 1]))
}

function subjectReferenceKey(row = {}, prefix = '') {
  const planKey = clean(row[`${prefix}plan_id`] ?? row.plan_id)
  const codeKey = clean(row[`${prefix}materia_codigo`] ?? row.materia_codigo)
  return planKey && codeKey ? `${planKey}::${codeKey}` : ''
}

function applyNumericEntityIds(rowsByTemplate) {
  const careerIds = numericIdMap(rowsByTemplate.carreras_planes.map((row) => row.carrera_id))
  const planIds = numericIdMap(rowsByTemplate.carreras_planes.map((row) => row.plan_id))
  const teacherIds = numericIdMap(rowsByTemplate.docentes.map((row) => row.docente_id))
  const studentIds = numericIdMap(rowsByTemplate.alumnos_inscripciones.map((row) => row.alumno_id))
  const subjectKeys = [
    ...rowsByTemplate.plan_estudios,
    ...rowsByTemplate.docente_materia,
    ...rowsByTemplate.horarios_docentes,
    ...rowsByTemplate.correlatividades,
    ...rowsByTemplate.alumnos_inscripciones,
  ].map((row) => subjectReferenceKey(row)).filter(Boolean)
  const subjectIds = numericIdMap(subjectKeys)

  const careerId = (value) => careerIds.get(clean(value)) ?? ''
  const planId = (value) => planIds.get(clean(value)) ?? ''
  const teacherId = (value) => teacherIds.get(clean(value)) ?? ''
  const subjectId = (row, prefix = '') => subjectIds.get(subjectReferenceKey(row, prefix)) ?? ''

  return {
    ...rowsByTemplate,
    carreras_planes: rowsByTemplate.carreras_planes.map((row) => ({
      ...row,
      carrera_id: careerId(row.carrera_id),
      plan_id: planId(row.plan_id),
      convive_con_plan_id: planId(row.convive_con_plan_id),
    })),
    plan_estudios: rowsByTemplate.plan_estudios.map((row) => ({
      ...row,
      plan_id: planId(row.plan_id),
      carrera_id: careerId(row.carrera_id),
      materia_id: subjectId(row),
    })),
    equivalencias_planes: rowsByTemplate.equivalencias_planes.map((row) => ({
      ...row,
      carrera_id: careerId(row.carrera_id),
      materia_origen_id: subjectId({ plan_id: row.plan_origen_id, materia_codigo: row.materia_origen_codigo }),
      plan_origen_id: planId(row.plan_origen_id),
      materia_destino_id: subjectId({ plan_id: row.plan_destino_id, materia_codigo: row.materia_destino_codigo }),
      plan_destino_id: planId(row.plan_destino_id),
    })),
    docentes: rowsByTemplate.docentes.map((row) => ({ ...row, docente_id: teacherId(row.docente_id) })),
    docente_materia: rowsByTemplate.docente_materia.map((row) => ({
      ...row,
      plan_id: planId(row.plan_id),
      carrera_id: careerId(row.carrera_id),
      materia_id: subjectId(row),
      docente_id: teacherId(row.docente_id),
      docente_reemplazado_id: teacherId(row.docente_reemplazado_id),
    })),
    horarios_docentes: rowsByTemplate.horarios_docentes.map((row) => ({
      ...row,
      plan_id: planId(row.plan_id),
      carrera_id: careerId(row.carrera_id),
      materia_id: subjectId(row),
      docente_id: teacherId(row.docente_id),
    })),
    disponibilidad_docente: rowsByTemplate.disponibilidad_docente.map((row) => ({
      ...row,
      docente_id: teacherId(row.docente_id),
    })),
    alumnos_inscripciones: rowsByTemplate.alumnos_inscripciones.map((row) => ({
      ...row,
      alumno_id: studentIds.get(clean(row.alumno_id)) ?? '',
      carrera_id: careerId(row.carrera_id),
      plan_id: planId(row.plan_id),
      materia_id: subjectId(row),
    })),
    correlatividades: rowsByTemplate.correlatividades.map((row) => ({
      ...row,
      plan_id: planId(row.plan_id),
      carrera_id: careerId(row.carrera_id),
      materia_id: subjectId(row),
      correlativa_id: subjectId({ plan_id: row.plan_id, materia_codigo: row.correlativa_codigo }),
    })),
  }
}

export function buildTemplateV2PrefillRows(sourceData = {}) {
  const sourcePlanes = getRows(sourceData, 'planesEstudio')
  const canonicalizeCareer = buildCareerCanonicalizer(sourcePlanes)
  const sourceDocentes = getRows(sourceData, 'docentes')
  const sourceHorarios = getRows(sourceData, 'horariosDocentes')
  const sourceDocenteMateria = getRows(sourceData, 'docenteMateria')
  const canonicalizeTeacher = buildTeacherCanonicalizer({
    docentes: sourceDocentes,
    horariosDocentes: sourceHorarios,
    docenteMateria: sourceDocenteMateria,
  })
  const data = {
    horariosDocentes: canonicalizeTeacherRows(
      canonicalizeCareerRows(sourceHorarios, canonicalizeCareer),
      canonicalizeTeacher,
    ),
    planesEstudio: canonicalizeCareerRows(sourcePlanes, canonicalizeCareer),
    correlatividades: canonicalizeCareerRows(getRows(sourceData, 'correlatividades'), canonicalizeCareer),
    alumnos: canonicalizeCareerRows(getRows(sourceData, 'alumnos'), canonicalizeCareer),
    docentes: canonicalizeTeacherRows(sourceDocentes, canonicalizeTeacher),
    docenteMateria: canonicalizeTeacherRows(
      canonicalizeCareerRows(sourceDocenteMateria, canonicalizeCareer),
      canonicalizeTeacher,
    ),
  }

  return applyNumericEntityIds({
    carreras_planes: buildCareerPlanRows(data),
    docentes: buildTeacherRows(data),
    plan_estudios: buildPlanRows(data.planesEstudio),
    equivalencias_planes: [],
    docente_materia: buildTeacherSubjectRows(data.docenteMateria, data.horariosDocentes),
    horarios_docentes: buildScheduleRows(data.horariosDocentes),
    disponibilidad_docente: buildAvailabilityRows(data.horariosDocentes),
    alumnos_inscripciones: buildStudentRows(data.alumnos),
    correlatividades: buildCorrelativityRows(data.correlatividades),
    calendario_mesas: buildCalendarRows(sourceData),
  })
}
