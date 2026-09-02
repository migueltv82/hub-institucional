const DOCENTE_A_DESIGNAR = 'A designar'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function sanitizeFilePart(value) {
  return clean(value)
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-zA-Z0-9_-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 80) || 'archivo'
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean)
  return clean(value)
    .split(/[|,;/]+/)
    .map(clean)
    .filter(Boolean)
}

function getCareer(row) {
  return clean(row?.carrera || row?.career || row?.programa || row?.program || row?.program_name)
}

function getSubjectCode(row) {
  return clean(row?.materia || row?.codigo || row?.code || row?.subject_code || row?.subject_id)
}

function subjectKey(carrera, materia) {
  return `${normalizeText(carrera)}::${normalizeText(materia).replaceAll(/[^a-z0-9]/g, '')}`
}

function getStudentName(student) {
  return clean(
    student?.full_name ||
    student?.display_name ||
    student?.apellido_y_nombre ||
    [student?.apellido || student?.last_name, student?.nombre || student?.first_name].filter(Boolean).join(', ') ||
    student?.email,
  )
}

function getTeacherName(teacher) {
  return clean(
    teacher?.full_name ||
    teacher?.display_name ||
    teacher?.profesor ||
    teacher?.nombre_completo ||
    [teacher?.nombre || teacher?.first_name, teacher?.apellido || teacher?.last_name].filter(Boolean).join(' ') ||
    teacher?.email,
  )
}

function getEmail(row) {
  return clean(row?.email || row?.correo || row?.mail || row?.login_email)
}

function sameText(a, b) {
  return Boolean(a || b) && normalizeText(a) === normalizeText(b)
}

function getVocalesLabel(mesa) {
  return [mesa?.vocal1, mesa?.vocal2]
    .map(clean)
    .filter((vocal) => vocal && vocal !== DOCENTE_A_DESIGNAR)
    .join(' / ') || DOCENTE_A_DESIGNAR
}

function matchesStudent(row, student) {
  const studentEmail = getEmail(student)
  const rowEmail = getEmail(row)
  const studentDni = clean(student?.dni || student?.documento)
  const rowDni = clean(row?.dni || row?.documento)
  const studentId = clean(student?.id || student?.profile_id || student?.student_id || student?.user_id)
  const rowIds = [
    row?.id,
    row?.profile_id,
    row?.student_id,
    row?.student_profile_id,
    row?.user_id,
    row?.auth_user_id,
  ].map(clean).filter(Boolean)

  return Boolean(
    (studentEmail && rowEmail && sameText(studentEmail, rowEmail)) ||
    (studentDni && rowDni && studentDni === rowDni) ||
    (studentId && rowIds.includes(studentId)),
  )
}

function statusText(row) {
  return normalizeText(row?.status || row?.estado || row?.situacion || row?.academic_status || row?.regularidad)
}

function parseScore(row) {
  const raw = clean(row?.score ?? row?.grade_value ?? row?.nota ?? row?.calificacion ?? row?.grade)
  if (!raw) return null
  const normalized = raw.replace(',', '.').match(/\d+(\.\d+)?/)
  if (!normalized) return null
  const value = Number(normalized[0])
  return Number.isFinite(value) ? value : null
}

function isApprovedAcademicRow(row) {
  const status = statusText(row)
  if (['aprobada', 'aprobado', 'promocionada', 'promocionado', 'final aprobado', 'final aprobada'].includes(status)) {
    return true
  }

  const score = parseScore(row)
  return score !== null && score >= 4
}

function isRegularAcademicRow(row) {
  const status = statusText(row)
  if ([
    'regular',
    'regularizada',
    'regularizado',
    'activo',
    'activa',
    'active',
    'en curso',
    'cursando',
    'inscripto',
    'inscripta',
    'registered',
    'aprobada',
    'aprobado',
    'promocionada',
    'promocionado',
  ].includes(status)) {
    return true
  }

  return isApprovedAcademicRow(row)
}

function getStudentAcademicRows(student, academicData = {}) {
  return [
    ...asArray(academicData.estadoAcademico),
    ...asArray(academicData.academicStatusRows),
    ...asArray(academicData.enrollments),
    ...asArray(academicData.grades),
  ].filter((row) => matchesStudent(row, student))
}

function buildStudentAcademicSets(student, academicData = {}) {
  const approved = new Set()
  const regular = new Set()

  getStudentAcademicRows(student, academicData).forEach((row) => {
    const carrera = getCareer(row) || getCareer(student)
    const materia = getSubjectCode(row)
    if (!materia) return

    const key = subjectKey(carrera, materia)
    if (isApprovedAcademicRow(row)) approved.add(key)
    if (isRegularAcademicRow(row)) regular.add(key)
  })

  return { approved, regular }
}

function getPrerequisitesBySubject(correlatividades = []) {
  const map = new Map()

  asArray(correlatividades).forEach((row) => {
    const carrera = getCareer(row)
    const materia = getSubjectCode(row)
    if (!carrera || !materia) return

    map.set(
      subjectKey(carrera, materia),
      splitList(row.correlativas ?? row.prerequisites ?? row.requisitosprevios),
    )
  })

  return map
}

function canStudentTakeExam({ approved, correlatividades, mesa, regular }) {
  const carrera = getCareer(mesa)
  const materia = getSubjectCode(mesa)
  const key = subjectKey(carrera, materia)

  if (!regular.has(key)) {
    return false
  }

  const prerequisites = correlatividades.get(key) ?? []
  return prerequisites.every((requiredCode) => approved.has(subjectKey(carrera, requiredCode)))
}

export function buildStudentExamRecipients({
  alumnos = [],
  correlatividades = [],
  cronograma = [],
  academicData = {},
}) {
  const prerequisitesBySubject = getPrerequisitesBySubject(correlatividades)
  const regularExams = asArray(cronograma).filter((mesa) => mesa.exam_type !== 'special')

  return asArray(alumnos)
    .map((student) => {
      const carrera = getCareer(student)
      const academicSets = buildStudentAcademicSets(student, academicData)
      const mesas = regularExams.filter((mesa) => (
        sameText(getCareer(mesa), carrera) &&
        canStudentTakeExam({
          approved: academicSets.approved,
          correlatividades: prerequisitesBySubject,
          mesa,
          regular: academicSets.regular,
        })
      ))

      return {
        email: getEmail(student),
        name: getStudentName(student),
        career: carrera,
        mesas,
        type: 'student',
      }
    })
    .filter((recipient) => recipient.mesas.length)
}

function getTeacherRoles(mesa, teacherName) {
  const roles = []
  if (sameText(mesa.profesorTitular, teacherName)) roles.push('Titular')
  if (sameText(mesa.vocal1, teacherName)) roles.push('Vocal 1')
  if (sameText(mesa.vocal2, teacherName)) roles.push('Vocal 2')
  return roles
}

export function buildTeacherExamRecipients({
  cronograma = [],
  docentes = [],
}) {
  const directory = new Map()

  asArray(docentes).forEach((teacher) => {
    const name = getTeacherName(teacher)
    if (!name) return
    directory.set(normalizeText(name), {
      email: getEmail(teacher),
      name,
    })
  })

  asArray(cronograma).forEach((mesa) => {
    ;[mesa.profesorTitular, mesa.vocal1, mesa.vocal2].forEach((name) => {
      const teacherName = clean(name)
      if (!teacherName || teacherName === DOCENTE_A_DESIGNAR) return

      const key = normalizeText(teacherName)
      if (!directory.has(key)) {
        directory.set(key, {
          email: '',
          name: teacherName,
        })
      }
    })
  })

  return [...directory.values()]
    .map((teacher) => {
      const mesas = asArray(cronograma)
        .map((mesa) => ({
          ...mesa,
          rolDocente: getTeacherRoles(mesa, teacher.name).join(', '),
        }))
        .filter((mesa) => mesa.rolDocente)

      return {
        ...teacher,
        mesas,
        type: 'teacher',
      }
    })
    .filter((recipient) => recipient.mesas.length)
}

function groupByCareer(cronograma, careerOptions = []) {
  const groups = new Map()

  asArray(careerOptions).forEach((career) => {
    const carrera = clean(career)
    if (!carrera) return
    const key = normalizeText(carrera)
    if (!groups.has(key)) groups.set(key, [carrera, []])
  })

  asArray(cronograma).forEach((mesa) => {
    const carrera = getCareer(mesa) || 'Carrera sin nombre'
    const key = normalizeText(carrera)
    if (!groups.has(key)) groups.set(key, [carrera, []])
    groups.get(key)[1].push(mesa)
  })

  return [...groups.values()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { sensitivity: 'base' }))
}

function getSubjectLabel(mesa) {
  return clean(mesa?.nombreMateria || mesa?.subject_name || mesa?.nombre || mesa?.materia || 'Materia')
}

function getCallLabel(mesa) {
  return clean(mesa?.llamado || mesa?.exam_call)
}

function getInstitutionName(institution) {
  return clean(institution?.name || institution?.institution_name || institution?.nombre) || 'Institucion'
}

async function loadLogoDataUrl(logoUrl) {
  const url = clean(logoUrl)
  if (!url) return null

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function drawLogo(doc, logoDataUrl, x, y) {
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', x, y, 22, 22, undefined, 'FAST')
    return
  }

  doc.setDrawColor(148, 163, 184)
  doc.setLineDashPattern([1.2, 1.2], 0)
  doc.roundedRect(x, y, 22, 22, 2, 2)
  doc.setLineDashPattern([], 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(100, 116, 139)
  doc.text('LOGO', x + 11, y + 12, { align: 'center' })
}

function drawHeader(doc, { institution, logoDataUrl, subtitle, title }) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const centerX = pageWidth / 2
  const institutionName = getInstitutionName(institution)

  drawLogo(doc, logoDataUrl, 12, 10)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(institutionName, centerX, 16, { align: 'center' })
  doc.setFontSize(10)
  doc.text(title, centerX, 23, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(subtitle, centerX, 29, { align: 'center' })
  doc.setDrawColor(15, 23, 42)
  doc.line(12, 36, pageWidth - 12, 36)
}

function drawFooter(doc) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 12, pageHeight - 10)
  doc.text('MesaFlow', pageWidth - 12, pageHeight - 10, { align: 'right' })
}

function ensurePageSpace(doc, state, neededHeight, headerOptions) {
  const pageHeight = doc.internal.pageSize.getHeight()

  if (state.y + neededHeight <= pageHeight - 20) return state

  drawFooter(doc)
  doc.addPage()
  drawHeader(doc, headerOptions)
  return { y: 44 }
}

function drawExamRows(doc, mesas, headerOptions, options = {}) {
  const margin = 12
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - (margin * 2)
  let state = { y: 44 }

  if (!mesas.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('No hay mesas para este destinatario.', margin, state.y)
    return
  }

  asArray(mesas).forEach((mesa) => {
    state = ensurePageSpace(doc, state, 24, headerOptions)

    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, state.y - 4, contentWidth, 20, 2, 2, 'FD')

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(`#${mesa.mesa ?? '-'} - ${getSubjectLabel(mesa)}`, margin + 3, state.y + 1)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    const details = [
      getCallLabel(mesa),
      `${mesa.fecha || '-'} ${mesa.dia || ''}`.trim(),
      `Estado: ${mesa.estado || 'pendiente'}`,
    ].filter(Boolean).join(' | ')
    doc.text(doc.splitTextToSize(details, contentWidth - 6), margin + 3, state.y + 6)

    const tribunal = options.teacherView
      ? `Participacion: ${mesa.rolDocente}`
      : `Titular: ${mesa.profesorTitular || '-'} | Vocales: ${getVocalesLabel(mesa)}`
    doc.text(doc.splitTextToSize(tribunal, contentWidth - 6), margin + 3, state.y + 11)

    if (mesa.observacionManual) {
      doc.setTextColor(146, 64, 14)
      doc.text(doc.splitTextToSize(`Observacion: ${mesa.observacionManual}`, contentWidth - 6), margin + 3, state.y + 16)
    }

    state.y += 24
  })
}

async function savePdf(doc, fileName, index = 0) {
  if (index > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, 120)
    })
  }
  doc.save(fileName)
}

async function createExamPdf({ institution, logoDataUrl, mesas, subtitle, title, teacherView = false }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const headerOptions = {
    institution,
    logoDataUrl,
    subtitle,
    title,
  }

  drawHeader(doc, headerOptions)
  drawExamRows(doc, mesas, headerOptions, { teacherView })
  drawFooter(doc)
  return doc
}

export async function exportarCronogramaCarrerasPdf({
  careerOptions = [],
  cronograma = [],
  institution = null,
}) {
  const groups = groupByCareer(cronograma, careerOptions)
    .filter(([, mesas]) => mesas.length > 0)
  if (!groups.length) throw new Error('No hay mesas para exportar.')

  const logoDataUrl = await loadLogoDataUrl(institution?.logo_url)

  for (let index = 0; index < groups.length; index += 1) {
    const [carrera, mesas] = groups[index]
    const doc = await createExamPdf({
      institution,
      logoDataUrl,
      mesas,
      subtitle: `${mesas.length} mesas generadas`,
      title: `Cronograma de mesas - ${carrera}`,
    })

    await savePdf(doc, `cronograma-mesas-${sanitizeFilePart(carrera)}.pdf`, index)
  }

  return {
    careers: groups.length,
  }
}

export async function exportarCronogramaDestinatariosPdf({
  academicData = {},
  alumnos = [],
  correlatividades = [],
  cronograma = [],
  docentes = [],
  institution = null,
}) {
  if (!asArray(cronograma).length) throw new Error('No hay mesas para exportar.')

  const logoDataUrl = await loadLogoDataUrl(institution?.logo_url)
  const studentRecipients = buildStudentExamRecipients({
    academicData,
    alumnos,
    correlatividades,
    cronograma,
  })
  const teacherRecipients = buildTeacherExamRecipients({
    cronograma,
    docentes,
  })
  const recipients = [
    ...studentRecipients,
    ...teacherRecipients,
  ]

  if (!recipients.length) {
    throw new Error('No hay alumnos habilitados ni docentes con participacion para generar PDFs personalizados.')
  }

  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index]
    const isTeacher = recipient.type === 'teacher'
    const doc = await createExamPdf({
      institution,
      logoDataUrl,
      mesas: recipient.mesas,
      subtitle: recipient.email ? `Destinatario: ${recipient.email}` : 'Destinatario sin email cargado',
      teacherView: isTeacher,
      title: isTeacher
        ? `Mesas asignadas - ${recipient.name}`
        : `Mesas habilitadas - ${recipient.name}`,
    })

    await savePdf(
      doc,
      `${isTeacher ? 'docente' : 'alumno'}-${sanitizeFilePart(recipient.name)}-${sanitizeFilePart(recipient.email || 'sin-email')}.pdf`,
      index,
    )
  }

  return {
    students: studentRecipients.length,
    teachers: teacherRecipients.length,
  }
}
