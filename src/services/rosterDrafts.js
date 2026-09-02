function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeEmail(value) {
  return clean(value).toLowerCase()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function joinNameParts(nombre, apellido) {
  return [clean(nombre), clean(apellido)].filter(Boolean).join(' ')
}

function normalizeCareerList(value, fallback = '') {
  const byKey = new Map()

  asArray(value).forEach((career) => {
    const cleaned = clean(career)
    const key = normalizeText(cleaned)
    if (!cleaned || !key || byKey.has(key)) return
    byKey.set(key, cleaned)
  })

  const fallbackCareer = clean(fallback)
  const fallbackKey = normalizeText(fallbackCareer)

  if (fallbackCareer && fallbackKey && !byKey.has(fallbackKey)) {
    byKey.set(fallbackKey, fallbackCareer)
  }

  return Array.from(byKey.values())
}

export function normalizeStudentDraft(draft = {}) {
  const nombre = clean(draft?.nombre || draft?.first_name)
  const apellido = clean(draft?.apellido || draft?.last_name)
  const carrera = clean(draft?.carrera || draft?.programa || draft?.program || draft?.career)

  return {
    ...draft,
    nombre,
    apellido,
    full_name: joinNameParts(nombre, apellido) || clean(draft?.full_name),
    dni: clean(draft?.dni || draft?.documento || draft?.document_number),
    carrera,
    anio: clean(draft?.anio || draft?.ano || draft?.year || draft?.curso),
    email: normalizeEmail(draft?.email || draft?.correo || draft?.mail),
    telefono: clean(draft?.telefono || draft?.celular || draft?.phone),
    estado: clean(draft?.estado || draft?.status) || 'activo',
    legajo: clean(draft?.legajo || draft?.matricula || draft?.student_number),
    origen: clean(draft?.origen) || 'manual',
    created_manually: draft?.created_manually ?? true,
  }
}

export function getStudentDraftIdentity(student = {}) {
  const normalized = normalizeStudentDraft(student)
  const careerKey = normalizeText(normalized.carrera)

  return {
    emailCareer: normalized.email ? `${normalized.email}::${careerKey}` : '',
    dniCareer: normalized.dni ? `${normalized.dni}::${careerKey}` : '',
  }
}

export function validateStudentDraft({
  currentIdentity = null,
  draft,
  students = [],
}) {
  const student = normalizeStudentDraft(draft)

  if (!student.nombre) {
    return { ok: false, error: 'El nombre del alumno es obligatorio.' }
  }

  if (!student.apellido) {
    return { ok: false, error: 'El apellido del alumno es obligatorio.' }
  }

  if (!student.dni) {
    return { ok: false, error: 'El DNI del alumno es obligatorio.' }
  }

  if (!student.email || !student.email.includes('@')) {
    return { ok: false, error: 'El email del alumno es obligatorio y debe ser valido.' }
  }

  if (!student.carrera) {
    return { ok: false, error: 'La carrera del alumno es obligatoria.' }
  }

  const nextIdentity = getStudentDraftIdentity(student)
  const duplicate = students.some((existingStudent) => {
    const existingIdentity = getStudentDraftIdentity(existingStudent)
    const isCurrentRecord = (
      (currentIdentity?.emailCareer && existingIdentity.emailCareer === currentIdentity.emailCareer) ||
      (currentIdentity?.dniCareer && existingIdentity.dniCareer === currentIdentity.dniCareer)
    )

    if (isCurrentRecord) return false

    return (
      (nextIdentity.emailCareer && existingIdentity.emailCareer === nextIdentity.emailCareer) ||
      (nextIdentity.dniCareer && existingIdentity.dniCareer === nextIdentity.dniCareer)
    )
  })

  if (duplicate) {
    return {
      ok: false,
      error: 'Ya existe un alumno con el mismo email o DNI dentro de esa carrera.',
    }
  }

  return {
    ok: true,
    student,
  }
}

export function normalizeTeacherDraft(draft = {}) {
  const nombre = clean(draft?.nombre || draft?.first_name)
  const apellido = clean(draft?.apellido || draft?.last_name)
  const carreras = normalizeCareerList(
    draft?.carreras || draft?.careers,
    draft?.carrera || draft?.programa || draft?.program || draft?.career,
  )

  return {
    ...draft,
    nombre,
    apellido,
    full_name: joinNameParts(nombre, apellido) || clean(draft?.full_name),
    dni: clean(draft?.dni || draft?.documento),
    telefono: clean(draft?.telefono || draft?.celular || draft?.phone),
    carrera: carreras[0] ?? '',
    carreras,
    estado: clean(draft?.estado || draft?.status) || 'activo',
    origen: clean(draft?.origen) || 'manual',
    created_manually: draft?.created_manually ?? true,
  }
}

export function getTeacherDraftIdentity(teacher = {}) {
  const normalized = normalizeTeacherDraft(teacher)

  return {
    dni: normalized.dni,
    fullName: normalizeText(normalized.full_name),
  }
}

export function validateTeacherDraft({
  currentIdentity = null,
  draft,
  teachers = [],
}) {
  const teacher = normalizeTeacherDraft(draft)

  if (!teacher.nombre) {
    return { ok: false, error: 'El nombre del docente es obligatorio.' }
  }

  if (!teacher.apellido) {
    return { ok: false, error: 'El apellido del docente es obligatorio.' }
  }

  if (!teacher.dni) {
    return { ok: false, error: 'El DNI del docente es obligatorio.' }
  }

  if (teacher.carreras.length === 0) {
    return { ok: false, error: 'Selecciona al menos una carrera para el docente.' }
  }

  const nextIdentity = getTeacherDraftIdentity(teacher)
  const duplicate = teachers.some((existingTeacher) => {
    const existingIdentity = getTeacherDraftIdentity(existingTeacher)
    const isCurrentRecord = (
      currentIdentity?.dni &&
      existingIdentity.dni === currentIdentity.dni
    )

    if (isCurrentRecord) return false

    return nextIdentity.dni && existingIdentity.dni === nextIdentity.dni
  })

  if (duplicate) {
    return {
      ok: false,
      error: 'Ya existe un docente con ese DNI en el padron.',
    }
  }

  return {
    ok: true,
    teacher,
  }
}
