// CAT.1 / I2c: catalogo academico (carreras, planes, materias, correlativas y plan de cada alumno) a partir
// de la planilla academica. Logica pura, sin red ni SQL: la usan la app (publicar catalogo por RPC) y el
// script scripts/buildAcademicCatalogSql.mjs (SQL para el SQL Editor). Fechas como texto AAAA-MM-DD o ''.

const PLAN_STATUS = { vigente: 'active', conviviente: 'active', activo: 'active', activa: 'active', cerrado: 'closed', cerrada: 'closed', borrador: 'draft' }
const REQUIRED_CONDITION = { regular: 'regular', aprobada: 'approved', aprobado: 'approved', approved: 'approved', cursada: 'enrolled', cursando: 'enrolled' }
const APPLIES_TO = { cursada: 'enrollment', cursar: 'enrollment', paracursar: 'enrollment', final: 'exam', rendir: 'exam', pararendir: 'exam', examen: 'exam' }
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

export function clean(value) {
  return String(value ?? '').trim()
}

export function cellText(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value && typeof value === 'object') {
    if ('result' in value) return cellText(value.result)
    if ('text' in value) return clean(value.text)
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
    return ''
  }
  return clean(value)
}

export function sheetRows(worksheet) {
  if (!worksheet) return []
  const headers = worksheet.getRow(1).values.map(cellText)
  const rows = []
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const record = { _fila: rowNumber }
    headers.forEach((header, column) => { if (header) record[header] = cellText(row.getCell(column).value) })
    if (Object.entries(record).some(([key, value]) => key !== '_fila' && value)) rows.push(record)
  }
  return rows
}

export function normalizeIdentity(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

export const ACCENTED = 'áàâãäåéèêëíìîïóòôõöúùûüñçý'
export const PLAIN = 'aaaaaaeeeeiiiiooooouuuuncy'
// Acepta Date, AAAA-MM-DD, DD/MM/AAAA y el numero de serie de Excel. Otra cosa: null con aviso.
export function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = clean(value)
  if (!text) return ''
  const iso = ISO_DATE.exec(text)
  if (iso) return text
  const local = LOCAL_DATE.exec(text)
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`
  if (/^\d{5}$/.test(text)) return new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000).toISOString().slice(0, 10)
  return null
}

function catalogDate(value, label, warnings) {
  const text = dateText(value)
  if (text === null) {
    warnings.push(`${label}: fecha "${clean(value)}" no reconocida; queda sin fecha.`)
    return ''
  }
  return text
}

function intOrNull(value, min, max) {
  const text = clean(value)
  if (!/^\d+$/.test(text)) return null
  const number = Number(text)
  return number >= min && number <= max ? number : null
}

function boolValue(value) {
  return ['si', 'sí', 'true', '1', 'yes', 'x'].includes(clean(value).toLowerCase())
}

// Arma el catalogo a partir de las filas crudas de carreras_planes y correlatividades, y de los
// planesEstudio que devuelve el mismo lector de planillas que usa la app: asi carrera y materia
// quedan escritas igual que en el snapshot (program_id/subject_id canonicos).
export function buildCatalog({ careersAndPlans = [], planesEstudio = [], correlatividades = [], studentPlans = [], withPrerequisites = false }) {
  const errors = []
  const warnings = []
  const careers = new Map()
  const plans = new Map()

  careersAndPlans.forEach((row) => {
    const careerCode = clean(row.carrera_id)
    const careerName = clean(row.carrera_nombre)
    const planCode = clean(row.plan_id)
    const label = `carreras_planes fila ${row._fila}`
    if (!careerCode || !careerName) {
      errors.push(`${label}: falta carrera_id o carrera_nombre.`)
      return
    }
    const previousName = careers.get(careerCode)?.name
    if (previousName && previousName !== careerName) {
      errors.push(`${label}: la carrera ${careerCode} tiene dos nombres ("${previousName}" y "${careerName}").`)
    }
    if (!careers.has(careerCode)) careers.set(careerCode, { code: careerCode, name: careerName, duration: row.duracion_anios })
    if (!planCode) {
      errors.push(`${label}: falta plan_id.`)
      return
    }
    if (plans.has(planCode) && plans.get(planCode).careerCode !== careerCode) {
      errors.push(`${label}: el plan ${planCode} aparece en dos carreras.`)
    }
    const rawStatus = clean(row.estado_plan).toLowerCase()
    if (rawStatus && !PLAN_STATUS[rawStatus]) warnings.push(`${label}: estado de plan "${row.estado_plan}" desconocido; se carga como activo.`)
    plans.set(planCode, {
      code: planCode,
      careerCode,
      name: clean(row.plan_nombre) || (clean(row.anio_plan) ? `Plan ${clean(row.anio_plan)}` : planCode),
      year: row.anio_plan,
      resolution: row.resolucion,
      status: PLAN_STATUS[rawStatus] ?? 'active',
      validFrom: catalogDate(row.vigente_desde, `${label} vigente_desde`, warnings),
      validUntil: catalogDate(row.vigente_hasta, `${label} vigente_hasta`, warnings),
    })
  })

  const careerNames = new Map()
  careers.forEach((career) => {
    // Mismo criterio que el SQL que vincula alumnos: dos nombres que normalizan igual serian ambiguos.
    const key = normalizeIdentity(career.name)
    if (careerNames.has(key) && careerNames.get(key) !== career.code) {
      errors.push(`carreras_planes: dos carreras con el mismo nombre "${career.name}" (${careerNames.get(key)} y ${career.code}).`)
    }
    careerNames.set(key, career.code)
  })

  const subjects = new Map()
  const planSubjects = new Map()
  planesEstudio.forEach((row) => {
    const planCode = clean(row.plan_id)
    const code = clean(row.materia)
    const name = clean(row.nombreMateria || row.nombre)
    const plan = plans.get(planCode)
    if (!plan) {
      errors.push(`plan_estudios: la materia ${code} usa el plan "${planCode}", que no esta en carreras_planes.`)
      return
    }
    if (clean(row.carrera) !== careers.get(plan.careerCode)?.name) {
      errors.push(`plan_estudios: la materia ${code} del plan ${planCode} no coincide con la carrera del plan.`)
    }
    if (!name) errors.push(`plan_estudios: la materia ${code} del plan ${planCode} no tiene materia_nombre.`)
    if (subjects.has(code) && subjects.get(code).name !== name) {
      warnings.push(`La materia ${code} tiene nombres distintos en dos planes; queda "${subjects.get(code).name}".`)
    } else if (!subjects.has(code)) {
      subjects.set(code, { code, name, externalId: clean(row.materia_id) })
    }
    const key = `${planCode}|${code}`
    if (planSubjects.has(key)) errors.push(`plan_estudios: la materia ${code} esta dos veces en el plan ${planCode}.`)
    const label = `plan_estudios ${planCode}/${code}`
    planSubjects.set(key, {
      planCode,
      code,
      row,
      validFrom: catalogDate(row.vigente_desde, `${label} vigente_desde`, warnings),
      validUntil: catalogDate(row.vigente_hasta, `${label} vigente_hasta`, warnings),
    })
  })

  const prerequisites = new Map()
  if (withPrerequisites) {
    const subjectIdToCode = new Map(planesEstudio.map((row) => [clean(row.materia_id), clean(row.materia)]))
    correlatividades.forEach((row) => {
      const target = subjectIdToCode.get(clean(row.materia_id)) || clean(row.materia_codigo)
      const required = subjectIdToCode.get(clean(row.correlativa_id)) || clean(row.correlativa_codigo)
      if (!required) return
      const label = `correlatividades fila ${row._fila}`
      let planCode = clean(row.plan_id)
      if (!planCode) {
        const candidates = [...planSubjects.values()].filter((item) => item.code === target).map((item) => item.planCode)
        if (candidates.length !== 1) {
          errors.push(`${label}: falta plan_id y la materia ${target} esta en ${candidates.length} planes.`)
          return
        }
        planCode = candidates[0]
      }
      const rawCondition = clean(row.requisito).toLowerCase()
      const rawType = normalizeIdentity(row.tipo_correlativa)
      if (rawCondition && !REQUIRED_CONDITION[rawCondition]) warnings.push(`${label}: requisito "${row.requisito}" desconocido; se carga como regular.`)
      if (rawType && !APPLIES_TO[rawType]) warnings.push(`${label}: tipo_correlativa "${row.tipo_correlativa}" desconocido; aplica a cursar y rendir.`)
      const appliesTo = APPLIES_TO[rawType] ?? 'enrollment_and_exam'
      if (!planSubjects.has(`${planCode}|${target}`)) errors.push(`${label}: la materia ${target} no esta en el plan ${planCode}.`)
      else if (!planSubjects.has(`${planCode}|${required}`)) errors.push(`${label}: la correlativa ${required} no esta en el plan ${planCode}.`)
      else if (target === required) errors.push(`${label}: la materia ${target} no puede ser correlativa de si misma.`)
      else prerequisites.set(`${planCode}|${target}|${required}|${appliesTo}`, { planCode, target, required, appliesTo, condition: REQUIRED_CONDITION[rawCondition] ?? 'regular' })
    })
  }

  const studentPlanRows = new Map()
  studentPlans.forEach((row) => {
    const dni = normalizeIdentity(row.dni)
    const planCode = clean(row.plan_id)
    if (!dni || !planCode) return
    if (!plans.has(planCode)) {
      errors.push(`alumnos_inscripciones fila ${row._fila}: el plan "${planCode}" no esta en la planilla academica.`)
      return
    }
    studentPlanRows.set(`${dni}|${planCode}`, { dni, planCode })
  })

  if (!careers.size) errors.push('La planilla no tiene carreras en carreras_planes.')
  if (!planSubjects.size) errors.push('La planilla no tiene materias validas en plan_estudios.')

  return {
    errors,
    warnings,
    careers: [...careers.values()],
    plans: [...plans.values()],
    subjects: [...subjects.values()],
    planSubjects: [...planSubjects.values()],
    prerequisites: [...prerequisites.values()],
    studentPlans: [...studentPlanRows.values()],
  }
}

// Payload de la RPC academic_admin_publish_catalog: mismas columnas que las tablas temporales del SQL.
export function buildCatalogPayload(catalog) {
  return {
    careers: catalog.careers.map((career) => ({ code: career.code, name: career.name, duration: intOrNull(career.duration, 1, 12) })),
    plans: catalog.plans.map((plan) => ({
      code: plan.code, career_code: plan.careerCode, name: plan.name, plan_year: intOrNull(plan.year, 1900, 2200),
      resolution: clean(plan.resolution) || null, status: plan.status, valid_from: plan.validFrom || null, valid_until: plan.validUntil || null,
    })),
    subjects: catalog.subjects.map((subject) => ({ code: subject.code, name: subject.name, external_id: subject.externalId || null })),
    plan_subjects: catalog.planSubjects.map(({ planCode, code, row, validFrom, validUntil }) => ({
      plan_code: planCode, code, year_number: intOrNull(row.anio_cursada ?? row.anio, 1, 12), term_number: intOrNull(row.cuatrimestre, 1, 4),
      regime: clean(row.regimen) || null, training_field: clean(row.campo_formacion) || null, format: clean(row.formato) || null,
      exam_required: boolValue(row.requiere_mesa), exam_type: clean(row.tipo_mesa) || null, exam_group: clean(row.grupo_afin_mesa) || null,
      related_codes: clean(row.codigos_materias_afines) || null, print_order: intOrNull(row.orden_impresion, 0, 100000),
      valid_from: validFrom || null, valid_until: validUntil || null,
    })),
    prerequisites: catalog.prerequisites.map((item) => ({ plan_code: item.planCode, target_code: item.target, required_code: item.required, applies_to: item.appliesTo, condition: item.condition })),
    student_plans: catalog.studentPlans.map((item) => ({ dni: item.dni, plan_code: item.planCode })),
  }
}

// Plan de cada alumno a partir de las inscripciones importadas (dni + plan_id), como --alumnos del script.
export function studentPlansFromEnrollments(inscripcionesAlumnos = []) {
  return (Array.isArray(inscripcionesAlumnos) ? inscripcionesAlumnos : [])
    .map((row, index) => ({ _fila: index + 2, dni: clean(row?.dni), plan_id: clean(row?.plan_id) }))
    .filter((row) => row.dni && row.plan_id)
}

// Mismo armado que el script (main de buildAcademicCatalogSql.mjs): hojas crudas de la planilla academica,
// planesEstudio del lector de la app y el plan de cada alumno (alumnos_inscripciones o el padron cargado).
export function buildCatalogFromWorkbook({ workbook, planesEstudio = [], studentPlans = [], withPrerequisites = false }) {
  return buildCatalog({
    careersAndPlans: sheetRows(workbook?.getWorksheet?.('carreras_planes')),
    planesEstudio,
    correlatividades: sheetRows(workbook?.getWorksheet?.('correlatividades')),
    studentPlans,
    withPrerequisites,
  })
}
