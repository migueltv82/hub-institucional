const DEFAULT_WORKSPACE_KEY = 'main'

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
    .replace(/[\u0300-\u036f]/g, '')
}

function isFalseLike(value) {
  if (value === false) return true
  return ['false', 'no', '0', 'sin titular', 'sin_titular'].includes(normalizeText(value))
}

function isGeneratedScheduleWorkload(row = {}) {
  const source = normalizeText(firstValue(row.source, row.fuente, row.origen, row.metadata?.source, row.metadata?.fuente, row.metadata?.origen))
  const observations = normalizeText(firstValue(row.observaciones, row.observacion, row.notes, row.metadata?.observaciones))
  const id = normalizeText(row.id)

  return (
    source === 'horarios_docentes' ||
    observations.includes('generado desde horarios') ||
    id.startsWith('carga-desde-horarios')
  )
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function firstValue(...values) {
  return values.find((value) => clean(value) !== '')
}

function uniqueBy(items, keyForItem) {
  const byKey = new Map()
  items.forEach((item) => {
    const key = keyForItem(item)
    if (!key || byKey.has(key)) return
    byKey.set(key, item)
  })
  return [...byKey.values()]
}

function normalizeSubjectId(value) {
  return clean(value).replace(/\s+/g, ' ')
}

function getProgramId(row = {}) {
  return clean(firstValue(
    row.program_id,
    row.programId,
    row.career,
    row.carrera,
    row.program,
    row.raw_payload?.career,
    row.raw_payload?.carrera,
  ))
}

function getSubjectId(row = {}) {
  return normalizeSubjectId(firstValue(
    row.subject_id,
    row.subjectId,
    row.materia,
    row.codigo,
    row.code,
    row.name,
    row.nombreMateria,
    row.raw_payload?.subject_id,
    row.raw_payload?.materia,
    row.metadata?.subject_id,
    row.metadata?.materia,
  ))
}

function getSubjectName(row = {}) {
  return clean(firstValue(
    row.subject_name,
    row.subjectName,
    row.nombreMateria,
    row.nombre,
    row.name,
    row.metadata?.subject_name,
    row.metadata?.nombreMateria,
    getSubjectId(row),
  ))
}

function getSubjectYear(row = {}) {
  return clean(firstValue(
    row.year,
    row.anio,
    row.ano,
    row.academic_year,
    row.metadata?.year,
    row.metadata?.anio,
  ))
}

function getTurno(row = {}) {
  return clean(firstValue(row.turno, row.shift, row.metadata?.turno, row.metadata?.shift, 'NOCHE')).toUpperCase()
}

function getDia(row = {}) {
  return clean(firstValue(row.dia, row.day, row.diaSemana, row.metadata?.dia, row.metadata?.day))
}

function getHoraDesde(row = {}) {
  return clean(firstValue(
    row.hora_desde,
    row.horaDesde,
    row.inicio,
    row.desde,
    row.metadata?.hora_desde,
    row.metadata?.horaDesde,
    row.metadata?.inicio,
    row.metadata?.desde,
  ))
}

function getHoraHasta(row = {}) {
  return clean(firstValue(
    row.hora_hasta,
    row.horaHasta,
    row.fin,
    row.hasta,
    row.metadata?.hora_hasta,
    row.metadata?.horaHasta,
    row.metadata?.fin,
    row.metadata?.hasta,
  ))
}

function getHorasCatedra(row = {}) {
  return clean(firstValue(
    row.horas_catedra,
    row.horasCatedra,
    row.teaching_hours,
    row.teachingHours,
    row.carga_horaria,
    row.cargaHoraria,
    row.metadata?.horas_catedra,
    row.metadata?.horasCatedra,
    row.metadata?.teaching_hours,
    row.metadata?.teachingHours,
    row.metadata?.carga_horaria,
    row.metadata?.cargaHoraria,
  ))
}

function getTeacherName(record = {}, fallback = '') {
  return clean(firstValue(
    record.full_name,
    record.display_name,
    record.nombre,
    [record.first_name, record.last_name].map(clean).filter(Boolean).join(' '),
    record.raw_payload?.full_name,
    record.raw_payload?.nombre,
    fallback,
  ))
}

function mapStudentRecordToSnapshotRow(record = {}) {
  return {
    record_id: record.id ?? null,
    email: clean(record.email).toLowerCase(),
    nombre: clean(record.first_name),
    apellido: clean(record.last_name),
    full_name: clean(record.full_name),
    carrera: clean(record.career),
    anio: clean(record.academic_year),
    dni: clean(record.dni),
    legajo: clean(record.legajo),
    telefono: clean(record.phone),
    estado: clean(record.status),
    raw: cloneJson(record.raw_payload ?? null),
  }
}

function mapTeacherRecordToSnapshotRow(record = {}) {
  const raw = record.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {}
  return {
    id: clean(record.id),
    docenteId: clean(record.id),
    email: clean(record.login_email).toLowerCase(),
    nombre: getTeacherName(record),
    apellido: clean(record.last_name),
    full_name: getTeacherName(record),
    dni: clean(record.dni),
    telefono: clean(record.phone),
    carrera: clean(firstValue(raw.carrera, raw.career)),
    carreras: asArray(firstValue(raw.carreras, raw.careers)),
    estado: clean(record.status),
    materias: asArray(raw.materias),
    raw: cloneJson(raw),
  }
}

function buildTeacherLookups(teacherRecords = []) {
  const byRecordId = new Map()
  const byTeacherUserId = new Map()
  const snapshotRows = teacherRecords.map(mapTeacherRecordToSnapshotRow)

  teacherRecords.forEach((record, index) => {
    const snapshotRow = snapshotRows[index]
    if (clean(record.id)) byRecordId.set(clean(record.id), snapshotRow)
    if (clean(record.teacher_id)) byTeacherUserId.set(clean(record.teacher_id), snapshotRow)
    if (clean(record.user_id)) byTeacherUserId.set(clean(record.user_id), snapshotRow)
  })

  return { snapshotRows, byRecordId, byTeacherUserId }
}

function buildSubjectRows({
  subjectTeacherAssignments = [],
  subjectEnrollments = [],
  examEnrollments = [],
  studentGrades = [],
  subjectCatalogRows = [],
} = {}) {
  const sourceRows = [
    ...asArray(subjectCatalogRows),
    ...asArray(subjectTeacherAssignments),
    ...asArray(subjectEnrollments),
    ...asArray(examEnrollments),
    ...asArray(studentGrades),
  ]

  return uniqueBy(
    sourceRows
      .map((row) => {
        const materia = getSubjectId(row)
        if (!materia) return null
        const carrera = getProgramId(row)
        return {
          id: clean(firstValue(row.id, row.subject_id, materia)),
          materia,
          codigo: materia,
          nombreMateria: getSubjectName(row),
          carrera,
          programa: carrera,
          anio: getSubjectYear(row),
          turno: getTurno(row),
          requiereMesa: true,
        }
      })
      .filter(Boolean),
    (row) => `${normalizeText(row.carrera)}::${normalizeText(row.materia)}`,
  )
}

function buildSchedulesFromAssignments({ assignments = [], teacherLookups }) {
  return asArray(assignments)
    .map((assignment, index) => {
      const subjectId = getSubjectId(assignment)
      if (!subjectId) return null

      const teacher = (
        teacherLookups.byRecordId.get(clean(assignment.teacher_record_id)) ||
        teacherLookups.byTeacherUserId.get(clean(assignment.teacher_id))
      )
      const teacherName = getTeacherName(teacher, `Docente asignado ${index + 1}`)
      const docenteId = clean(teacher?.docenteId || teacher?.id || assignment.teacher_record_id || assignment.teacher_id)

      return {
        docenteId,
        profesor: teacherName,
        nombre: teacherName,
        materia: subjectId,
        codigo: subjectId,
        nombreMateria: getSubjectName(assignment),
        carrera: getProgramId(assignment),
        dia: getDia(assignment),
        turno: getTurno(assignment),
        dni: clean(teacher?.dni),
      }
    })
    .filter(Boolean)
}

function buildTeacherLoadsFromAssignments({ assignments = [], teacherLookups }) {
  return asArray(assignments)
    .map((assignment, index) => {
      const subjectId = getSubjectId(assignment)
      if (!subjectId) return null

      const teacher = (
        teacherLookups.byRecordId.get(clean(assignment.teacher_record_id)) ||
        teacherLookups.byTeacherUserId.get(clean(assignment.teacher_id))
      )
      const teacherName = getTeacherName(teacher, `Docente asignado ${index + 1}`)

      return {
        docenteId: clean(teacher?.docenteId || teacher?.id || assignment.teacher_record_id || assignment.teacher_id),
        docente: teacherName,
        dni_docente: clean(teacher?.dni),
        carrera: getProgramId(assignment),
        materia_codigo: subjectId,
        materia_nombre: getSubjectName(assignment),
        horasCatedra: getHorasCatedra(assignment),
        rol_en_materia: clean(firstValue(assignment.rol_en_materia, assignment.role, assignment.metadata?.rol_en_materia, assignment.metadata?.role, 'TITULAR')),
        estado_asignacion: clean(firstValue(assignment.estado_asignacion, assignment.status, assignment.metadata?.estado_asignacion, assignment.metadata?.status, 'ACTIVO')),
        source: 'subject_teacher_assignments',
      }
    })
    .filter(Boolean)
}

function buildTeacherLoadsFromWorkloadRecords({ workloadRecords = [], teacherLookups }) {
  return asArray(workloadRecords)
    .map((record, index) => {
      const subjectId = getSubjectId(record)
      if (!subjectId) return null

      const teacher = (
        teacherLookups.byRecordId.get(clean(record.teacher_record_id)) ||
        teacherLookups.byTeacherUserId.get(clean(record.teacher_id))
      )
      const teacherName = clean(firstValue(record.teacher_display_name, record.teacher_name, getTeacherName(teacher, `Docente asignado ${index + 1}`)))
      const source = clean(firstValue(record.source, record.fuente, record.metadata?.source, 'teacher_workload_records'))
      const generatedFromSchedule = isGeneratedScheduleWorkload({ ...record, source })
      const explicitRole = clean(firstValue(record.role, record.rol, record.rol_en_materia))
      const explicitTitularity = clean(firstValue(record.titularity, record.titularidad))
      const role = generatedFromSchedule || isFalseLike(explicitTitularity) ? '' : explicitRole
      const titularity = generatedFromSchedule || isFalseLike(explicitTitularity)
        ? 'false'
        : clean(firstValue(explicitTitularity, explicitRole))

      return {
        id: clean(record.id),
        docenteId: clean(teacher?.docenteId || teacher?.id || record.teacher_record_id || record.teacher_identity),
        docente: teacherName,
        dni_docente: clean(firstValue(record.teacher_dni, teacher?.dni)),
        carrera: getProgramId(record),
        plan: clean(firstValue(record.plan_id, record.plan)),
        materia_codigo: subjectId,
        materia: subjectId,
        materia_nombre: getSubjectName(record),
        anio: getSubjectYear(record),
        horasCatedra: getHorasCatedra(record),
        rol: role,
        rol_en_materia: role,
        titularidad: titularity,
        estado: clean(firstValue(record.status, 'active')),
        estado_asignacion: clean(firstValue(record.status, 'active')),
        vigencia_desde: clean(firstValue(record.valid_from, record.vigencia_desde)),
        vigencia_hasta: clean(firstValue(record.valid_until, record.vigencia_hasta)),
        source,
      }
    })
    .filter(Boolean)
}

function buildTeacherAvailabilityFromAssignments({ assignments = [], teacherLookups }) {
  return asArray(assignments)
    .map((assignment, index) => {
      const dia = getDia(assignment)
      if (!dia) return null

      const teacher = (
        teacherLookups.byRecordId.get(clean(assignment.teacher_record_id)) ||
        teacherLookups.byTeacherUserId.get(clean(assignment.teacher_id))
      )
      const teacherName = getTeacherName(teacher, `Docente asignado ${index + 1}`)

      return {
        docenteId: clean(teacher?.docenteId || teacher?.id || assignment.teacher_record_id || assignment.teacher_id),
        docente: teacherName,
        dni_docente: clean(teacher?.dni),
        dia,
        turno: getTurno(assignment),
        hora_desde: getHoraDesde(assignment),
        hora_hasta: getHoraHasta(assignment),
        disponible_mesa: true,
        source: 'subject_teacher_assignments',
      }
    })
    .filter(Boolean)
}

function buildTeacherAvailabilityFromRecords({ availabilityRecords = [], teacherLookups }) {
  return asArray(availabilityRecords)
    .map((record, index) => {
      const dia = getDia(record) || clean(record.day_of_week)
      if (!dia) return null

      const teacher = (
        teacherLookups.byRecordId.get(clean(record.teacher_record_id)) ||
        teacherLookups.byTeacherUserId.get(clean(record.teacher_id))
      )
      const teacherName = clean(firstValue(record.teacher_display_name, record.teacher_name, getTeacherName(teacher, `Docente asignado ${index + 1}`)))

      return {
        id: clean(record.id),
        docenteId: clean(teacher?.docenteId || teacher?.id || record.teacher_record_id || record.teacher_identity),
        docente: teacherName,
        dni_docente: clean(firstValue(record.teacher_dni, teacher?.dni)),
        dia,
        turno: clean(firstValue(record.shift, record.turno, getTurno(record))),
        hora_desde: clean(firstValue(record.start_time, record.hora_desde, record.horaDesde)),
        hora_hasta: clean(firstValue(record.end_time, record.hora_hasta, record.horaHasta)),
        disponible: record.is_available !== false,
        disponible_mesa: record.is_available !== false,
        motivo: clean(firstValue(record.reason, record.motivo, record.observacion)),
        observacion: clean(firstValue(record.reason, record.motivo, record.observacion)),
        estado: clean(firstValue(record.status, 'active')),
        vigencia_desde: clean(firstValue(record.valid_from, record.vigencia_desde)),
        vigencia_hasta: clean(firstValue(record.valid_until, record.vigencia_hasta)),
        source: 'teacher_availability_records',
      }
    })
    .filter(Boolean)
}

function buildSchedulesFromTeacherPayloads(teachers = []) {
  return asArray(teachers).flatMap((teacher) => (
    asArray(teacher.materias).map((materia, index) => {
      const subjectId = typeof materia === 'string' ? materia : getSubjectId(materia)
      if (!subjectId) return null

      return {
        docenteId: clean(teacher.docenteId || teacher.id),
        profesor: getTeacherName(teacher),
        nombre: getTeacherName(teacher),
        materia: subjectId,
        codigo: subjectId,
        nombreMateria: typeof materia === 'string' ? subjectId : getSubjectName(materia),
        carrera: clean(firstValue(
          typeof materia === 'object' ? materia.carrera : '',
          teacher.carrera,
          teacher.carreras?.[0],
        )),
        dia: typeof materia === 'object' ? getDia(materia) : '',
        turno: typeof materia === 'object' ? getTurno(materia) : 'NOCHE',
        orden: index + 1,
        dni: clean(teacher.dni),
      }
    }).filter(Boolean)
  ))
}

function buildCorrelatividades(rows = []) {
  return asArray(rows)
    .map((row) => {
      const materia = getSubjectId(row)
      if (!materia) return null
      return {
        carrera: getProgramId(row),
        materia,
        codigo: materia,
        nombreMateria: getSubjectName(row),
        correlativas: asArray(firstValue(row.correlativas, row.correlatives, row.metadata?.correlativas)),
      }
    })
    .filter(Boolean)
}

function inferMissingData({ snapshot, rawCounts, dateSource }) {
  const missingData = []
  const causes = []
  const recommendations = []

  if (snapshot.planesEstudio.length === 0) {
    missingData.push({
      type: 'missing_subjects',
      message: 'No se pudieron reconstruir materias/planes de estudio desde tablas relacionales.',
    })
    causes.push('No hay materias o planes de estudio normalizados disponibles.')
    recommendations.push('Cargar o exponer tabla de materias/planes de estudio para el motor.')
  }

  if (snapshot.horariosDocentes.length === 0) {
    missingData.push({
      type: 'missing_teacher_assignments',
      message: 'No se pudieron reconstruir horarios/asignaciones docentes.',
    })
    causes.push('No hay asignaciones docentes por materia o raw_payload docente con materias.')
    recommendations.push('Cargar subject_teacher_assignments o disponibilidad docente por materia.')
  }

  if (snapshot.docentes.length === 0) {
    missingData.push({
      type: 'missing_teachers',
      message: 'No hay docentes reconstruibles desde teacher_records.',
    })
    causes.push('No hay padron docente normalizado accesible.')
    recommendations.push('Cargar teacher_records o sincronizar docentes desde el workspace.')
  }

  if (snapshot.correlatividades.length === 0) {
    causes.push('No hay correlatividades normalizadas disponibles.')
    recommendations.push('Exponer correlatividades desde snapshot o tabla relacional especifica.')
  }

  if (dateSource !== 'snapshot' && dateSource !== 'env') {
    causes.push('No hay fechas reales de examen en tablas relacionales; se uso rango default de auditoria.')
    recommendations.push('Definir fechas reales mediante snapshot o variables EXAM_ENGINE_AUDIT_FECHA_INICIO/FIN.')
  }

  if (rawCounts.subjectTeacherAssignments === 0 && rawCounts.subjectEnrollments > 0) {
    causes.push('Hay inscripciones por materia, pero no asignaciones docentes equivalentes.')
  }

  return { missingData, causes: [...new Set(causes)], recommendations: [...new Set(recommendations)] }
}

export function buildWorkspaceSnapshotFromRelationalData({
  studentRecords = [],
  teacherRecords = [],
  subjectTeacherAssignments = [],
  teacherAvailabilityRecords = [],
  teacherWorkloadRecords = [],
  subjectEnrollments = [],
  examEnrollments = [],
  studentGrades = [],
  subjectCatalogRows = [],
  correlativityRows = [],
  auditConfig = {},
} = {}) {
  const teacherLookups = buildTeacherLookups(teacherRecords)
  const docentes = teacherLookups.snapshotRows
  const assignmentSchedules = buildSchedulesFromAssignments({
    assignments: subjectTeacherAssignments,
    teacherLookups,
  })
  const workloadRecordRows = buildTeacherLoadsFromWorkloadRecords({
    workloadRecords: teacherWorkloadRecords,
    teacherLookups,
  })
  const assignmentLoadRows = buildTeacherLoadsFromAssignments({
      assignments: subjectTeacherAssignments,
      teacherLookups,
  })
  const cargaHorariaDocente = uniqueBy(
    [
      ...workloadRecordRows,
      ...assignmentLoadRows,
    ],
    (row) => [
      normalizeText(row.docenteId || row.docente),
      normalizeText(row.carrera),
      normalizeText(row.materia_codigo),
    ].join('::'),
  )
  const availabilityRecordRows = buildTeacherAvailabilityFromRecords({
    availabilityRecords: teacherAvailabilityRecords,
    teacherLookups,
  })
  const assignmentAvailabilityRows = buildTeacherAvailabilityFromAssignments({
      assignments: subjectTeacherAssignments,
      teacherLookups,
  })
  const disponibilidadDocente = uniqueBy(
    [
      ...availabilityRecordRows,
      ...assignmentAvailabilityRows,
    ],
    (row) => [
      normalizeText(row.docenteId || row.docente),
      normalizeText(row.dia),
      normalizeText(row.turno),
      normalizeText(row.hora_desde),
      normalizeText(row.hora_hasta),
    ].join('::'),
  )
  const payloadSchedules = assignmentSchedules.length > 0
    ? []
    : buildSchedulesFromTeacherPayloads(docentes)
  const horariosDocentes = uniqueBy(
    [...assignmentSchedules, ...payloadSchedules],
    (row) => [
      normalizeText(row.docenteId || row.profesor),
      normalizeText(row.carrera),
      normalizeText(row.materia),
    ].join('::'),
  )
  const planesEstudio = buildSubjectRows({
    subjectTeacherAssignments,
    subjectEnrollments,
    examEnrollments,
    studentGrades,
    subjectCatalogRows,
  })
  const alumnos = studentRecords.map(mapStudentRecordToSnapshotRow)
  const correlatividades = buildCorrelatividades(correlativityRows)
  const fechaInicio = clean(auditConfig.fechaInicio) || '2026-07-27'
  const fechaFin = clean(auditConfig.fechaFin) || '2026-08-07'
  const dateSource = clean(auditConfig.fechaInicio) && clean(auditConfig.fechaFin)
    ? 'env'
    : 'audit-default'
  const careers = [...new Set(planesEstudio.map((row) => clean(row.carrera)).filter(Boolean))]
  const snapshot = {
    alumnos,
    horariosDocentes,
    disponibilidadDocente,
    cargaHorariaDocente,
    docentes,
    planesEstudio,
    correlatividades,
    fechaInicio,
    fechaFin,
    examType: 'regular',
    generationScope: {
      careers,
      year: '',
      applyHalfPlusOneRule: true,
      allowSameDayRelatedSubjects: true,
      respectCorrelativities: true,
    },
    regularCallRanges: {
      first: {
        start: fechaInicio,
        end: fechaFin,
      },
    },
    selectedSpecialSubjectKeys: [],
  }
  const rawCounts = {
    studentRecords: asArray(studentRecords).length,
    teacherRecords: asArray(teacherRecords).length,
    subjectTeacherAssignments: asArray(subjectTeacherAssignments).length,
    teacherAvailabilityRecords: asArray(teacherAvailabilityRecords).length,
    teacherWorkloadRecords: asArray(teacherWorkloadRecords).length,
    subjectEnrollments: asArray(subjectEnrollments).length,
    examEnrollments: asArray(examEnrollments).length,
    studentGrades: asArray(studentGrades).length,
    subjectCatalogRows: asArray(subjectCatalogRows).length,
    correlativityRows: asArray(correlativityRows).length,
  }
  const { missingData, causes, recommendations } = inferMissingData({
    snapshot,
    rawCounts,
    dateSource,
  })

  return {
    snapshot,
    diagnostics: {
      source: 'supabase-relational',
      workspaceKey: clean(auditConfig.workspaceKey) || DEFAULT_WORKSPACE_KEY,
      counts: {
        carreras: careers.length,
        materias: planesEstudio.length,
        docentes: docentes.length,
        horariosDocentes: horariosDocentes.length,
        disponibilidadDocente: disponibilidadDocente.length,
        cargaHorariaDocente: cargaHorariaDocente.length,
        correlatividades: correlatividades.length,
        alumnos: alumnos.length,
        ...rawCounts,
      },
      dateSource,
      canRunPreview: planesEstudio.length > 0 && docentes.length > 0,
      missingData,
      causes,
      recommendations,
    },
  }
}

export function buildSafeRelationalAuditReport({
  tableReads = {},
  snapshotDiagnostics = {},
  efficiencySummary = null,
  previewRan = false,
} = {}) {
  const tableSummary = Object.entries(tableReads).reduce((acc, [tableName, result]) => {
    acc[tableName] = {
      ok: result?.ok === true,
      rows: Number(result?.rows ?? 0),
      used: Boolean(result?.used),
      error: result?.error ? clean(result.error) : null,
    }
    return acc
  }, {})

  return {
    source: 'supabase-relational-read-only',
    previewRan,
    tables: tableSummary,
    dataCounts: snapshotDiagnostics.counts ?? {},
    missingData: snapshotDiagnostics.missingData ?? [],
    principalesCausas: snapshotDiagnostics.causes ?? [],
    recommendations: [
      ...new Set([
        ...(snapshotDiagnostics.recommendations ?? []),
        ...(efficiencySummary?.recommendations ?? []),
      ]),
    ],
    ...(efficiencySummary ? { efficiency: efficiencySummary } : {}),
  }
}
