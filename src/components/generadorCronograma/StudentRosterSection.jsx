import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, CircleDollarSign, Download, Pencil, Printer, RefreshCw, ShieldAlert, Trash2, UserPlus, UserRound, X } from 'lucide-react'
import PaginationControls from '../PaginationControls.jsx'
import { getPrimaryCareer, resolveCareerDisplayName } from '../../services/careerCatalog.js'
import { getStudentProfilePhoto } from '../../modules/alumnos/services/studentProfile.js'
import { fetchStudentRecords } from '../../services/rosterRecords.js'
import { canonicalizeStudent } from '../../services/academicCanonicalData.js'
import { fetchStudentFinancialStatus, upsertStudentFinancialStatus } from '../../services/studentFinancialStatus.js'

const PAGE_SIZE = 10
const RESET_CONFIRMATION_TEXT = 'BORRAR TODO'

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matchesField(value, filter) {
  return normalize(value).includes(normalize(filter))
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right)
}

function getFirst(row, keys) {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && clean(value) !== '') return value
  }

  return ''
}

function getStudentFullName(student) {
  return clean(student?.full_name) || [clean(student?.nombre), clean(student?.apellido)].filter(Boolean).join(' ')
}

function getAcademicRowSubject(row) {
  const subject = row?.subject
  return clean(subject?.name || subject?.nombre || subject?.code || row?.nombre || row?.nombremateria || row?.subject_name || row?.materia || row?.code || row?.subject_id)
}

function academicItemMatchesSubject(item, subject) {
  return (
    sameText(item.subject, subject?.nombre) ||
    sameText(item.subject, subject?.name) ||
    sameText(item.subject, subject?.materia) ||
    sameText(item.subject, subject?.code) ||
    sameText(item.subject, subject?.subject_id) ||
    sameText(item.subjectId, subject?.id) ||
    sameText(item.subjectId, subject?.subject_id)
  )
}

function getAcademicRowStatus(row) {
  const rawStatus = clean(getFirst(row, ['estado', 'status', 'situacion'])).toLowerCase()

  if (['aprobada', 'aprobado', 'approved', 'passed', 'completed', 'finalizada'].includes(rawStatus)) return 'aprobada'
  if (['promocionada', 'promocionado', 'promocion', 'promoted'].includes(rawStatus)) return 'promocionada'
  if (['ausente', 'absent'].includes(rawStatus)) return 'ausente'
  if (['desaprobada', 'desaprobado', 'failed'].includes(rawStatus)) return 'desaprobada'
  if (['equivalent', 'equivalente'].includes(rawStatus)) return 'equivalente'
  if (rawStatus === 'regular') return 'regular'
  if (['cursando', 'active', 'enrolled', 'inscripto', 'inscripta'].includes(rawStatus)) return 'cursando'
  if (['libre', 'abandonada', 'dropped', 'baja'].includes(rawStatus)) return 'libre'

  return rawStatus || 'sin estado'
}

function getAcademicRowScore(row) {
  const value = getFirst(row, ['nota', 'score', 'final_grade', 'calificacion', 'promedio'])
  const score = Number(String(value).replace(',', '.'))
  return Number.isFinite(score) ? score : null
}

function getAcademicRowDate(row) {
  return clean(getFirst(row, ['fecha', 'date', 'fecha_nota', 'graded_at', 'updated_at', 'created_at']))
}

function getAcademicRowObservation(row) {
  return clean(getFirst(row, ['observaciones', 'observacion', 'observations', 'observation']))
}

function getAcademicRowPlan(row) {
  return clean(getFirst(row, ['plan', 'plan_anio', 'plan_year']))
}

function getAcademicRowRegularYear(row) {
  return clean(getFirst(row, ['anio_regularidad', 'ano_regularidad', 'regular_year', 'anio_reg']))
}

function getAcademicRowAbsenceDate(row) {
  return clean(getFirst(row, ['fecha_ausencia', 'absence_date', 'absent_at']))
}

function isFinalApprovedStatus(status) {
  return ['aprobada', 'promocionada'].includes(status)
}

function getAcademicBoolean(row, keys, fallback = false) {
  const value = getFirst(row, keys)
  if (value === '') return fallback
  if (typeof value === 'boolean') return value
  return ['1', 'si', 'sí', 'true', 'x'].includes(normalizeText(value))
}

function formatShortDate(value) {
  const raw = clean(value)
  if (!raw) return ''

  const date = new Date(raw)
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(date)
  }

  return raw
}

function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function printAcademicDocument() {
  const certificate = document.querySelector('.certificate-document')

  if (!certificate) {
    window.print()
    return
  }

  const printFrame = document.createElement('iframe')
  printFrame.setAttribute('title', 'Estado academico para imprimir')
  Object.assign(printFrame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
  })
  document.body.appendChild(printFrame)

  const printWindow = printFrame.contentWindow
  const printDocument = printFrame.contentDocument || printWindow?.document

  if (!printWindow || !printDocument) {
    printFrame.remove()
    document.body.classList.add('printing-academic')

    const cleanup = () => {
      document.body.classList.remove('printing-academic')
      window.removeEventListener('afterprint', cleanup)
    }

    window.addEventListener('afterprint', cleanup)
    window.setTimeout(() => {
      window.print()
    }, 50)
    return
  }

  printDocument.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Estado academico</title>
        <style>
          @page { size: A4 portrait; margin: 9mm 9mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #fff;
            color: #020617;
            font-family: Arial, Helvetica, sans-serif;
          }
          .certificate-document {
            width: 100%;
            color: #020617;
            font-family: Arial, Helvetica, sans-serif;
          }
          .certificate-header {
            display: grid;
            grid-template-columns: 70px 1fr 70px;
            align-items: center;
            gap: 10px;
            text-align: center;
          }
          .certificate-logo-slot {
            display: flex;
            min-height: 58px;
            align-items: center;
            justify-content: center;
            border: 2px dashed #94a3b8;
            border-radius: 8px;
            color: #64748b;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          .certificate-heading h2 {
            margin: 0;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 30px;
            line-height: 1;
            color: #020617;
          }
          .certificate-heading p {
            margin: 4px 0 0;
            font-size: 9px;
            font-weight: 700;
            color: #334155;
          }
          .certificate-kicker {
            font-family: Georgia, "Times New Roman", serif;
            font-size: 12px !important;
            font-weight: 700 !important;
          }
          .certificate-rule {
            margin: 8px auto 7px;
            height: 3px;
            max-width: 540px;
            border-top: 2px solid #020617;
            border-bottom: 1px solid #020617;
          }
          .certificate-text {
            margin: 5px 0;
            font-size: 10px;
            line-height: 1.28;
            text-align: justify;
          }
          .certificate-table-wrap {
            margin-top: 7px;
          }
          .certificate-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 7px;
          }
          .certificate-table th,
          .certificate-table td {
            border: 1px solid #020617;
            padding: 1.4px 2.5px;
            line-height: 1.05;
            vertical-align: top;
          }
          .certificate-table th {
            background: #f8fafc;
            font-weight: 800;
            text-align: center;
            text-transform: uppercase;
          }
          .certificate-subject-cell {
            width: 38%;
          }
          .certificate-footer {
            margin-top: 8px;
            font-size: 9px;
            line-height: 1.25;
            text-align: justify;
          }
          .certificate-signatures {
            margin-top: 42px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 96px;
          }
          .certificate-signatures span {
            display: block;
            border-top: 1px solid #020617;
          }
          .certificate-signatures p {
            margin-top: 6px;
            text-align: center;
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>${certificate.outerHTML}</body>
    </html>
  `)
  printDocument.close()

  const cleanupFrame = () => {
    printWindow.removeEventListener('afterprint', cleanupFrame)
    printFrame.remove()
  }

  printWindow.addEventListener('afterprint', cleanupFrame)

  window.setTimeout(() => {
    printWindow.focus()
    printWindow.print()
    window.setTimeout(cleanupFrame, 1000)
  }, 250)
}

function truncatePdfText(doc, text, maxWidth) {
  const value = clean(text) || '-'
  if (doc.getTextWidth(value) <= maxWidth) return value

  let next = value
  while (next.length > 1 && doc.getTextWidth(`${next}...`) > maxWidth) {
    next = next.slice(0, -1)
  }

  return `${next}...`
}

function sanitizeFilePart(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'alumno'
}

function scoreToWords(score) {
  const words = {
    1: 'Uno',
    2: 'Dos',
    3: 'Tres',
    4: 'Cuatro',
    5: 'Cinco',
    6: 'Seis',
    7: 'Siete',
    8: 'Ocho',
    9: 'Nueve',
    10: 'Diez',
  }
  return words[Math.round(Number(score))] || ''
}

function academicRowMatchesStudent(row, student) {
  const rowEmail = getFirst(row, ['email', 'correo', 'mail'])
  const rowDni = getFirst(row, ['dni', 'documento', 'document_number'])
  const rowName = getFirst(row, ['full_name', 'display_name', 'nombre_completo', 'apellidoynombre', 'apellido_y_nombre'])
  const studentName = getStudentFullName(student)

  return (
    (rowEmail && sameText(rowEmail, student?.email)) ||
    (rowDni && sameText(rowDni, student?.dni)) ||
    (rowName && studentName && sameText(rowName, studentName))
  )
}

function enrollmentMatchesStudent(enrollment, student) {
  return (
    (enrollment?.student_email && sameText(enrollment.student_email, student?.email)) ||
    (enrollment?.email && sameText(enrollment.email, student?.email)) ||
    (enrollment?.student_dni && sameText(enrollment.student_dni, student?.dni)) ||
    (enrollment?.dni && sameText(enrollment.dni, student?.dni)) ||
    (enrollment?.student_id && sameText(enrollment.student_id, student?.id)) ||
    (enrollment?.profile_id && sameText(enrollment.profile_id, student?.id))
  )
}

function gradeMatchesStudent(grade, student) {
  const studentIds = [student?.profile_id, student?.user_id, student?.student_id, student?.id]
    .map(clean)
    .filter(Boolean)
  const gradeIds = [grade?.student_id, grade?.profile_id, grade?.user_id]
    .map(clean)
    .filter(Boolean)
  const studentRecordIds = [student?.record_id, student?.student_record_id, student?.alumno_id, student?.id]
    .map(clean)
    .filter(Boolean)
  const gradeRecordId = clean(grade?.student_record_id)

  return (
    gradeIds.some((id) => studentIds.some((studentId) => sameText(id, studentId))) ||
    (gradeRecordId && studentRecordIds.some((recordId) => sameText(gradeRecordId, recordId))) ||
    (grade?.email && sameText(grade.email, student?.email)) ||
    (grade?.dni && sameText(grade.dni, student?.dni))
  )
}

function getGradeTimestamp(grade) {
  const timestamp = new Date(grade?.updated_at ?? grade?.graded_at ?? grade?.created_at ?? 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getGradePriority(grade) {
  if (normalizeText(grade?.grade_type) === 'final') return 3
  if (clean(grade?.academic_status) && normalizeText(grade.academic_status) !== 'pending') return 2
  return 1
}

function mapRelationalGradeStatus(grade) {
  return getAcademicRowStatus({ status: grade?.academic_status })
}

function getSubjectFromEnrollment(enrollment, planSubjects) {
  if (enrollment?.subject) return enrollment.subject
  return planSubjects.find((subject) => (
    sameText(subject.materia, enrollment?.subject_id) ||
    sameText(subject.nombre, enrollment?.subject_id) ||
    sameText(subject.id, enrollment?.subject_id)
  ))
}

function resolveCareerAgainstPlan(rawCareer, planCareers = []) {
  const cleanedCareer = clean(rawCareer)
  if (!cleanedCareer) return ''

  const normalizedCareer = normalizeText(cleanedCareer)
  const exactMatch = planCareers.find((career) => normalizeText(career) === normalizedCareer)
  if (exactMatch) return exactMatch

  const partialMatches = planCareers.filter((career) => {
    const normalizedPlanCareer = normalizeText(career)
    return (
      normalizedPlanCareer.includes(normalizedCareer) ||
      normalizedCareer.includes(normalizedPlanCareer)
    )
  })

  return partialMatches.length === 1 ? partialMatches[0] : cleanedCareer
}

function formatManualDate(value) {
  const raw = clean(value)
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return isoDate ? `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}` : raw
}

function resolveStudentCareer(student = {}, planesEstudio = []) {
  const directCareer = getPrimaryCareer(student)
  if (directCareer) return resolveCareerAgainstPlan(
    directCareer,
    Array.from(new Set(planesEstudio.map((subject) => getPrimaryCareer(subject)).filter(Boolean))),
  )

  const careerId = clean(student.carrera_id ?? student.carreraId)
  if (!careerId) return ''
  return getPrimaryCareer(planesEstudio.find((subject) => (
    clean(subject.carrera_id ?? subject.carreraId) === careerId
  ))) || `Carrera ID ${careerId}`
}

function resolveStudentYear(student = {}) {
  const directYear = student.anio ?? student.año ?? student.year ?? student.curso ?? student.anio_cursada ?? student.anioCursada
  if (clean(directYear)) return clean(directYear)

  const observations = clean(student.observaciones ?? student.observation)
  return observations.match(/a(?:n|ñ)o cursado informado en padr(?:o|ó)n:\s*([^|]+)/i)?.[1]?.trim() ?? ''
}

function buildAcademicPlanSubjects(planesEstudio = [], studentCareer = '') {
  const planCareers = Array.from(new Set(planesEstudio.map((subject) => getPrimaryCareer(subject)).filter(Boolean)))
  const resolvedCareer = resolveCareerAgainstPlan(studentCareer, planCareers)
  let subjects = planesEstudio.filter((subject) => !resolvedCareer || sameText(getPrimaryCareer(subject), resolvedCareer))

  if (subjects.length === 0 && studentCareer) {
    subjects = planesEstudio.filter((subject) => {
      const subjectCareer = getPrimaryCareer(subject)
      return (
        normalizeText(subjectCareer).includes(normalizeText(studentCareer)) ||
        normalizeText(studentCareer).includes(normalizeText(subjectCareer))
      )
    })
  }

  return {
    resolvedCareer,
    subjects: subjects.length ? subjects : planesEstudio,
  }
}

function buildStudentAcademicDetail(student, academicData) {
  const studentCareer = resolveStudentCareer(student, academicData.planesEstudio ?? [])
  const { resolvedCareer, subjects: planSubjects } = buildAcademicPlanSubjects(academicData.planesEstudio ?? [], studentCareer)
  const career = resolvedCareer || studentCareer
  const academicRows = [
    ...(academicData.estadoAcademico ?? []),
    ...(academicData.academicStatusRows ?? []),
  ]
  const statusRows = academicRows.filter((row) => academicRowMatchesStudent(row, student))
  const enrollmentRows = (academicData.enrollments ?? []).filter((enrollment) => enrollmentMatchesStudent(enrollment, student))
  const gradeRows = (academicData.grades ?? [])
    .filter((grade) => gradeMatchesStudent(grade, student))
    .sort((left, right) => getGradePriority(right) - getGradePriority(left) || getGradeTimestamp(right) - getGradeTimestamp(left))
  const statusItems = statusRows.map((row) => {
    const status = getAcademicRowStatus(row)
    const approved = getAcademicBoolean(row, ['aprobada', 'aprobado'], isFinalApprovedStatus(status))
    return {
      subject: getAcademicRowSubject(row),
      subjectId: clean(row?.subject_id || row?.subject?.id || row?.id),
      status,
      score: approved ? getAcademicRowScore(row) : null,
      date: approved ? getAcademicRowDate(row) : '',
      observation: getAcademicRowObservation(row),
      plan: getAcademicRowPlan(row),
      regular: getAcademicBoolean(row, ['regular'], status === 'regular'),
      approved,
      regularYear: getAcademicRowRegularYear(row),
      absent: getAcademicBoolean(row, ['ausente', 'absent'], status === 'ausente'),
      absenceDate: getAcademicRowAbsenceDate(row),
    }
  }).filter((item) => item.subject)
  const enrollmentItems = enrollmentRows.map((enrollment) => {
    const status = getAcademicRowStatus(enrollment)
    const approved = getAcademicBoolean(enrollment, ['aprobada', 'aprobado'], isFinalApprovedStatus(status))
    const subject = getSubjectFromEnrollment(enrollment, planSubjects)
    return {
      subject: clean(subject?.name || subject?.nombre || enrollment?.subject_name || enrollment?.subject_id),
      subjectId: clean(enrollment?.subject_id || subject?.id || subject?.subject_id),
      status,
      score: approved ? getAcademicRowScore(enrollment) : null,
      date: approved ? getAcademicRowDate(enrollment) : '',
      observation: getAcademicRowObservation(enrollment),
      plan: getAcademicRowPlan(enrollment),
      regular: status === 'regular',
      approved,
      regularYear: getAcademicRowRegularYear(enrollment),
      absent: getAcademicBoolean(enrollment, ['ausente', 'absent'], status === 'ausente'),
      absenceDate: getAcademicRowAbsenceDate(enrollment),
    }
  }).filter((item) => item.subject)
  const baseItems = statusItems.length ? statusItems : enrollmentItems
  const gradeItems = gradeRows.reduce((itemsBySubject, grade) => {
    const subjectId = clean(grade?.subject_id)
    if (!subjectId || itemsBySubject.some((item) => sameText(item.subjectId, subjectId))) return itemsBySubject

    const subject = planSubjects.find((candidate) => (
      sameText(candidate?.id, subjectId) ||
      sameText(candidate?.subject_id, subjectId) ||
      sameText(candidate?.materia, subjectId) ||
      sameText(candidate?.code, subjectId)
    ))
    const score = grade?.grade_value ?? grade?.score
    const status = mapRelationalGradeStatus(grade)
    const gradingDate = grade?.graded_at || grade?.updated_at || grade?.created_at || ''
    const isRegular = status === 'regular'
    const isApproved = isFinalApprovedStatus(status)
    return [...itemsBySubject, {
      subject: clean(subject?.nombre || subject?.name || subject?.materia || subject?.code || subjectId),
      subjectId,
      status,
      score: isApproved && score !== null && score !== undefined && score !== '' ? Number(score) : null,
      // La fecha de carga docente representa la fecha de regularidad o de
      // aprobacion segun la condicion, no una fecha final generica.
      date: isApproved ? gradingDate : '',
      observation: clean(grade?.observations),
      plan: '',
      regular: isRegular,
      approved: isApproved,
      regularYear: isRegular ? gradingDate : '',
      absent: status === 'ausente',
      absenceDate: '',
    }]
  }, [])
  const items = [
    ...baseItems.filter((item) => !gradeItems.some((grade) => sameText(grade.subjectId, item.subjectId) || sameText(grade.subject, item.subject))),
    ...gradeItems,
  ]
  const completeItems = planSubjects.map((subject) => {
    const subjectLabel = clean(subject.nombre || subject.name || subject.materia || subject.code)
    const statusItem = items.find((item) => academicItemMatchesSubject(item, subject) || sameText(item.subject, subjectLabel))

    return {
      subject,
      subjectId: clean(subject.id || subject.subject_id || subject.materia || subject.code),
      subjectLabel,
      status: statusItem?.status || 'sin registro',
      score: statusItem?.score ?? null,
      date: statusItem?.date || '',
      observation: statusItem?.observation || '',
      plan: statusItem?.plan || clean(subject.plan || subject.plan_anio || subject.plan_year),
      regular: Boolean(statusItem?.regular),
      approved: Boolean(statusItem?.approved),
      regularYear: statusItem?.regularYear || '',
      absent: Boolean(statusItem?.absent),
      absenceDate: statusItem?.absenceDate || '',
    }
  })
  const currentSubjects = items.filter((item) => item.status === 'cursando')
  const approved = items.filter((item) => ['aprobada', 'promocionada'].includes(item.status))
  const scores = items.map((item) => item.score).filter(Number.isFinite)
  const average = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null

  return {
    career,
    planSubjects,
    items,
    completeItems,
    currentSubjects,
    approved,
    average,
  }
}

function getStudentKey(student, index) {
  return student.id ?? student.email ?? student.dni ?? `${student.nombre}-${student.apellido}-${index}`
}

function searchStudents(students, query, planesEstudio = []) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return []

  return students.filter((student) => {
    const fullName = [student.nombre, student.apellido, student.full_name].filter(Boolean).join(' ')
    const carrera = resolveStudentCareer(student, planesEstudio)
    const anio = resolveStudentYear(student)

    return (
      matchesField(fullName, normalizedQuery) ||
      matchesField(student.dni, normalizedQuery) ||
      matchesField(carrera, normalizedQuery) ||
      matchesField(anio, normalizedQuery) ||
      matchesField(student.email, normalizedQuery)
    )
  })
}

function buildStudentForm(student, planesEstudio = []) {
  return {
    nombre: student?.nombre ?? '',
    apellido: student?.apellido ?? '',
    dni: student?.dni ?? '',
    carrera: student ? resolveStudentCareer(student, planesEstudio) : '',
    anio: student ? resolveStudentYear(student) : '',
    email: student?.email ?? '',
    telefono: student?.telefono ?? student?.phone ?? '',
    estado: student?.estado ?? 'activo',
  }
}

function resolveCareerOptionLabel(career) {
  const cleaned = clean(career)
  return resolveCareerDisplayName(cleaned) || cleaned
}

function buildStudentCareerOptions(careers = []) {
  const byKey = new Map()

  careers.forEach((career) => {
    const label = resolveCareerOptionLabel(career)
    const key = normalizeText(label)
    if (!label || !key || byKey.has(key)) return
    byKey.set(key, label)
  })

  return Array.from(byKey.values())
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

function StudentEditModal({
  adeudaCuota = false,
  canManageFinancialStatus = false,
  careerOptions = [],
  financialStatusPending = false,
  form,
  isOpen,
  mode = 'edit',
  onChange,
  onClose,
  onDelete,
  onOpenAcademicDetail,
  onSubmit,
  onToggleFinancialStatus,
}) {
  if (!isOpen) return null
  const isCreating = mode === 'create'
  const selectedCareer = resolveCareerOptionLabel(getPrimaryCareer(form))
  const availableCareerOptions = buildStudentCareerOptions([
    ...careerOptions,
    selectedCareer,
  ])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase text-sky-700">
              {isCreating ? 'Nuevo alumno' : 'Editar alumno'}
            </p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Datos del padron</h3>
          </div>
          <button type="button" className="btn-secondary px-3 py-2" onClick={onClose} title="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            ['nombre', 'Nombre'],
            ['apellido', 'Apellido'],
            ['dni', 'DNI'],
            ['anio', 'Anio'],
            ['email', 'Email'],
            ['telefono', 'Telefono'],
          ].map(([field, label]) => (
            <label key={field} className="block">
              <span className="text-sm font-semibold text-slate-700">{label}</span>
              <input className="input-base mt-2" value={form[field]} onChange={onChange(field)} />
            </label>
          ))}
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Estado</span>
            <select className="input-base mt-2" value={form.estado} onChange={onChange('estado')}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
              {form.estado && !['activo', 'inactivo'].includes(form.estado) && (
                <option value={form.estado}>{form.estado}</option>
              )}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Carrera</span>
            <select className="input-base mt-2" value={selectedCareer} onChange={onChange('carrera')}>
              <option value="">Selecciona una carrera</option>
              {availableCareerOptions.map((career) => (
                <option key={career} value={career}>
                  {career}
                </option>
              ))}
            </select>
            {availableCareerOptions.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Carga primero una planilla con carreras para habilitar el alta consistente.
              </p>
            )}
          </label>
        </div>

        {!isCreating && (
          <div className={`mt-5 rounded-lg border p-4 ${adeudaCuota ? 'border-orange-300 bg-orange-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                  <CircleDollarSign className={`h-4 w-4 ${adeudaCuota ? 'text-orange-700' : 'text-emerald-700'}`} />
                  Estado para inscripción a finales
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {adeudaCuota
                    ? 'Adeuda cuota: las inscripciones a mesas finales están bloqueadas.'
                    : 'Sin deuda registrada: puede inscribirse si cumple las demás condiciones académicas.'}
                </p>
              </div>
              <button
                type="button"
                className={adeudaCuota ? 'btn-secondary border-emerald-300 text-emerald-800' : 'btn-secondary border-orange-300 text-orange-800'}
                disabled={!canManageFinancialStatus || financialStatusPending}
                onClick={() => onToggleFinancialStatus?.(!adeudaCuota)}
              >
                {financialStatusPending
                  ? 'Actualizando...'
                  : adeudaCuota
                    ? 'Marcar cuota al día'
                    : 'Marcar adeuda cuota'}
              </button>
            </div>
            {!canManageFinancialStatus && (
              <p className="mt-2 text-xs text-amber-800">
                El estado financiero se administra en una sesión remota con permisos de administrador.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {!isCreating ? (
            <div className="flex flex-wrap gap-2">
              {onOpenAcademicDetail ? (
                <button type="button" className="btn-secondary" onClick={onOpenAcademicDetail}>
                  Ver ficha académica
                </button>
              ) : null}
              {onDelete ? (
                <button type="button" className="btn-secondary text-red-700" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                  Eliminar alumno
                </button>
              ) : null}
            </div>
          ) : <span />}
          <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={onSubmit}>
            {isCreating ? 'Crear alumno' : 'Guardar cambios'}
          </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ResetAcademicRecordsDialog({
  isOpen,
  onClose,
  onConfirm,
  studentName,
}) {
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const canSubmit = confirmation.trim().toUpperCase() === RESET_CONFIRMATION_TEXT && clean(password)

  function handleClose() {
    if (isSubmitting) return
    setConfirmation('')
    setPassword('')
    onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit || isSubmitting) return

    setIsSubmitting(true)
    const result = await onConfirm(password)
    setIsSubmitting(false)

    if (result !== false) {
      setConfirmation('')
      setPassword('')
      onClose()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
      <form
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-5 shadow-2xl"
        onSubmit={handleSubmit}
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-950">Resetear estado academico</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Se borraran inscripciones a materias, inscripciones a mesas, notas, regularidades, aprobaciones, ausencias y fechas academicas de {studentName}.
            </p>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-bold text-slate-800">
            Escribi {RESET_CONFIRMATION_TEXT} para confirmar
          </span>
          <input
            className="input-base mt-2"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={isSubmitting}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-bold text-slate-800">Contrasena actual del administrador que solicita la accion</span>
          <input
            className="input-base mt-2"
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={isSubmitting}
          />
        </label>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-secondary border-red-300 bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? 'Reseteando...' : 'Confirmar borrado total'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function StudentAcademicDetailPage({
  academicData,
  canEditWorkspace,
  isRefreshingAcademicData = false,
  onBack,
  onRefreshAcademicData,
  onResetAcademicRecords,
  onUpdateAcademicRecords,
  student,
}) {
  const [academicDrafts, setAcademicDrafts] = useState({})
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  if (!student) return null

  const academicStudent = canonicalizeStudent(student, academicData.studentRecords ?? [])
  const detail = buildStudentAcademicDetail(academicStudent, academicData)
  const institutionName = clean(academicData.activeInstitution?.name || academicData.institutionName) || 'Institucion'
  const studentName = getStudentFullName(student) || student.email || 'Alumno'
  const approvedRows = detail.completeItems.filter((item) => ['aprobada', 'promocionada'].includes(item.status))
  const certificateRows = approvedRows.length ? approvedRows : detail.completeItems
  const draftFor = (item) => academicDrafts[item.subjectId] ?? {
    regular: item.regular,
    aprobada: item.approved,
    anioRegularidad: formatManualDate(item.regularYear),
    ausente: item.absent,
    fechaAusencia: formatManualDate(item.absenceDate),
    nota: item.approved ? item.score ?? '' : '',
    fecha: item.approved ? formatManualDate(item.date) : '',
    observaciones: item.observation || '',
  }
  const updateDraft = (item, field, value) => {
    setAcademicDrafts((current) => ({
      ...current,
      [item.subjectId]: {
        ...draftFor(item),
        ...(current[item.subjectId] ?? {}),
        [field]: value,
      },
    }))
  }
  const saveAllAcademicChanges = () => {
    const records = detail.completeItems.flatMap((item) => {
      const draft = academicDrafts[item.subjectId]
      if (!draft) return []
      const score = draft.nota === '' ? null : Number(String(draft.nota).replace(',', '.'))
      if (score !== null && (!Number.isFinite(score) || score < 1 || score > 10)) return []
      if (draft.aprobada && (score === null || !draft.fecha)) return []
      if (draft.ausente && !draft.fechaAusencia) return []
      return [{
        subject: item.subject,
        values: { ...draft, nota: draft.aprobada ? score : null, fecha: draft.aprobada ? draft.fecha : '' },
      }]
    })
    if (!records.length) return
    const saved = onUpdateAcademicRecords?.({ student: academicStudent, records })
    if (saved !== false) setAcademicDrafts({})
  }
  const resetAcademicRecords = async (currentPassword) => {
    const reset = await onResetAcademicRecords?.(academicStudent, { currentPassword })
    if (reset !== false) setAcademicDrafts({})
    return reset
  }
  async function downloadAcademicPdf() {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 8
    const contentWidth = pageWidth - (margin * 2)
    const centerX = pageWidth / 2
    const rows = certificateRows
    const tableTop = 64
    const footerTop = 248
    const headerHeight = 7
    const availableRowsHeight = footerTop - tableTop - headerHeight
    const rowHeight = Math.max(2.4, Math.min(4.2, availableRowsHeight / Math.max(rows.length, 1)))
    const columns = [
      { key: 'year', label: 'ANIO', width: 10 },
      { key: 'subject', label: 'MATERIA', width: 65 },
      { key: 'score', label: 'NUM.', width: 13 },
      { key: 'letters', label: 'LETRAS', width: 16 },
      { key: 'date', label: 'FECHA', width: 17 },
      { key: 'status', label: 'ESTADO', width: 20 },
      { key: 'observation', label: 'OBSERVACIONES', width: 37 },
      { key: 'plan', label: 'PLAN', width: contentWidth - 178 },
    ]

    doc.setTextColor(2, 6, 23)
    doc.setDrawColor(2, 6, 23)
    doc.setLineWidth(0.25)

    doc.setDrawColor(148, 163, 184)
    doc.setLineDashPattern([1.4, 1.4], 0)
    doc.roundedRect(margin, 10, 22, 18, 2, 2)
    doc.setLineDashPattern([], 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.text('LOGO', margin + 11, 20, { align: 'center' })

    doc.setFont('times', 'normal')
    doc.setFontSize(11)
    doc.text('Instituto', centerX, 13, { align: 'center' })
    doc.setFont('times', 'bold')
    doc.setFontSize(25)
    doc.text(institutionName, centerX, 23, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text('ESTADO ACADEMICO INSTITUCIONAL', centerX, 29, { align: 'center' })
    doc.setDrawColor(2, 6, 23)
    doc.line(52, 32, pageWidth - 52, 32)
    doc.setLineWidth(0.5)
    doc.line(52, 34, pageWidth - 52, 34)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const certText = `Se hace constar que ${studentName}, DNI ${student.dni || 'sin registrar'}, estudiante de ${detail.career || 'carrera sin especificar'}, registra la siguiente situacion academica segun la informacion obrante en el sistema institucional.`
    doc.text(doc.splitTextToSize(certText, contentWidth), margin, 42)
    const summary = `Resumen: ${detail.approved.length} materias aprobadas, ${detail.currentSubjects.length} materias en curso, promedio ${detail.average === null ? 'sin registrar' : detail.average.toFixed(1)}.`
    doc.text(doc.splitTextToSize(summary, contentWidth), margin, 53)

    let x = margin
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.8)
    columns.forEach((column) => {
      doc.rect(x, tableTop, column.width, headerHeight)
      doc.text(column.label, x + (column.width / 2), tableTop + 4.5, { align: 'center' })
      x += column.width
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(Math.max(4.5, Math.min(6.2, rowHeight + 1.8)))
    let y = tableTop + headerHeight
    rows.forEach((item) => {
      const values = {
        year: item.subject.anio ?? item.subject.ano ?? item.subject.year ?? '-',
        subject: item.subjectLabel || item.subject.materia || '-',
        score: item.score === null ? '-' : item.score,
        letters: item.score === null ? '-' : scoreToWords(item.score),
        date: formatShortDate(item.date) || '-',
        status: item.status,
        observation: item.observation || '-',
        plan: item.plan || '-',
      }
      x = margin
      columns.forEach((column) => {
        doc.rect(x, y, column.width, rowHeight)
        const value = truncatePdfText(doc, values[column.key], column.width - 2)
        const align = column.key === 'subject' || column.key === 'observation' ? 'left' : 'center'
        const textX = align === 'left' ? x + 1 : x + (column.width / 2)
        doc.text(String(value), textX, y + Math.max(1.8, rowHeight - 1), { align })
        x += column.width
      })
      y += rowHeight
    })

    if (rows.length === 0) {
      doc.rect(margin, y, contentWidth, 6)
      doc.text('No hay informacion academica cargada para emitir la constancia.', centerX, y + 4, { align: 'center' })
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const footerText = `A solicitud del interesado/a y para ser presentada ante las autoridades que correspondan, se expide la presente constancia a la fecha ${formatLongDate()}.`
    doc.text(doc.splitTextToSize(footerText, contentWidth), margin, footerTop + 7)

    doc.line(30, 282, 82, 282)
    doc.line(128, 282, 180, 282)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text('Firma autorizada', 56, 286, { align: 'center' })
    doc.text('Sello institucional', 154, 286, { align: 'center' })

    doc.save(`estado-academico-${sanitizeFilePart(studentName)}.pdf`)
  }

  return createPortal(
    <main className="fixed inset-0 z-[100] overflow-y-auto bg-slate-100 p-3 md:p-6">
    <section className="rise-in mx-auto max-w-[1800px] space-y-5">
      <div className="print-hidden flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="btn-secondary" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Volver al menu principal del administrador
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onRefreshAcademicData?.({ notify: true })}
            disabled={isRefreshingAcademicData}
            title="Vuelve a traer notas y estado academico sincronizados desde Supabase"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshingAcademicData ? 'animate-spin' : ''}`} />
            {isRefreshingAcademicData ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button type="button" className="btn-secondary border-red-300 text-red-700 hover:bg-red-50" onClick={() => setIsResetDialogOpen(true)} disabled={!canEditWorkspace}>
            Resetear estado academico
          </button>
          <button type="button" className="btn-primary" onClick={saveAllAcademicChanges} disabled={!canEditWorkspace || Object.keys(academicDrafts).length === 0}>
            Guardar todos los cambios
          </button>
          <button type="button" className="btn-secondary" onClick={printAcademicDocument}>
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button type="button" className="btn-primary" onClick={downloadAcademicPdf}>
            <Download className="h-4 w-4" />
            Descargar PDF
          </button>
        </div>
      </div>

      <article className="academic-print-root printable-page rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <section className="certificate-document">
          <header className="certificate-header">
            <div className="certificate-logo-slot">Logo</div>
            <div className="certificate-heading">
              <p className="certificate-kicker">Instituto</p>
              <h2>{institutionName}</h2>
              <p>Estado academico institucional</p>
            </div>
          </header>

          <div className="certificate-rule" />

          <p className="certificate-text">
            Se hace constar que <strong>{studentName}</strong>, DNI <strong>{student.dni || 'sin registrar'}</strong>,
            estudiante de <strong>{detail.career || 'carrera sin especificar'}</strong>, registra la siguiente situacion academica segun la informacion obrante en el sistema institucional.
          </p>
          <p className="certificate-text">
            Resumen: {detail.approved.length} materias aprobadas, {detail.currentSubjects.length} materias en curso,
            promedio {detail.average === null ? 'sin registrar' : detail.average.toFixed(1)}.
          </p>

          <div className="certificate-table-wrap">
            <table className="certificate-table">
              <thead>
                <tr>
                  <th rowSpan="2">Anio</th>
                  <th rowSpan="2">Materia</th>
                  <th colSpan="3">Calificaciones</th>
                  <th rowSpan="2">Estado</th>
                  <th rowSpan="2">Observaciones</th>
                  <th rowSpan="2">Plan</th>
                </tr>
                <tr>
                  <th>Numeros</th>
                  <th>Letras</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {certificateRows.map((item) => (
                  <tr key={item.subject.id || `${item.subject.materia}-${item.subjectLabel}`}>
                    <td>{item.subject.anio ?? item.subject.ano ?? item.subject.year ?? '-'}</td>
                    <td className="certificate-subject-cell">{item.subjectLabel || item.subject.materia || '-'}</td>
                    <td>{item.score === null ? '-' : item.score}</td>
                    <td>{item.score === null ? '-' : scoreToWords(item.score)}</td>
                    <td>{formatShortDate(item.date) || '-'}</td>
                    <td>{item.status}</td>
                    <td>{item.observation || '-'}</td>
                    <td>{item.plan || '-'}</td>
                  </tr>
                ))}
                {certificateRows.length === 0 && (
                  <tr>
                    <td colSpan="8">No hay informacion academica cargada para emitir la constancia.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="certificate-footer">
            A solicitud del interesado/a y para ser presentada ante las autoridades que correspondan, se expide la presente constancia a la fecha {formatLongDate()}.
          </p>

          <div className="certificate-signatures">
            <div>
              <span />
              <p>Firma autorizada</p>
            </div>
            <div>
              <span />
              <p>Sello institucional</p>
            </div>
          </div>
        </section>

        <div className="screen-academic-view flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-100 shadow-md ring-1 ring-slate-200">
              {getStudentProfilePhoto(student) ? (
                <img
                  src={getStudentProfilePhoto(student)}
                  alt={`Foto de ${getStudentFullName(student) || 'alumno'}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-9 w-9 text-slate-400" aria-label="Alumno sin foto de perfil" />
              )}
            </div>
            <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">Estado academico</p>
            <h3 className="mt-2 text-3xl font-extrabold text-slate-950">{getStudentFullName(student) || student.email}</h3>
            <p className="mt-2 text-sm text-slate-600">{detail.career || 'Carrera sin especificar'} · DNI {student.dni || 'sin DNI'}</p>
            <p className="mt-1 text-sm text-slate-600">{student.email || 'Sin email'}{student.telefono ? ` - ${student.telefono}` : ''}</p>
            </div>
          </div>
          <button type="button" className="btn-secondary px-3 py-2 print-hidden" onClick={onBack} title="Volver">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="screen-academic-view mt-5 grid gap-3 md:grid-cols-4">
          <div className="soft-card border-l-4 border-l-sky-500 bg-white">
            <p className="text-xs font-bold uppercase text-sky-700">Plan</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{detail.planSubjects.length}</p>
            <p className="text-xs text-slate-500">materias</p>
          </div>
          <div className="soft-card border-l-4 border-l-blue-600 bg-white">
            <p className="text-xs font-bold uppercase text-blue-700">Cursando</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{detail.currentSubjects.length}</p>
            <p className="text-xs text-slate-500">materias activas</p>
          </div>
          <div className="soft-card border-l-4 border-l-lime-500 bg-white">
            <p className="text-xs font-bold uppercase text-lime-700">Aprobadas</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{detail.approved.length}</p>
            <p className="text-xs text-slate-500">registradas</p>
          </div>
          <div className="soft-card border-l-4 border-l-orange-500 bg-white">
            <p className="text-xs font-bold uppercase text-orange-700">Promedio</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{detail.average === null ? '-' : detail.average.toFixed(1)}</p>
            <p className="text-xs text-slate-500">segun notas</p>
          </div>
        </div>

        <article className="screen-academic-view mt-5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Estado academico completo</p>
              <h4 className="mt-1 text-lg font-extrabold text-slate-950">Plan de estudios y situacion por materia</h4>
            </div>
            <p className="text-sm text-slate-500">{detail.completeItems.length} materias del plan</p>
          </div>
          <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[1180px] table-fixed border-collapse text-xs">
              <colgroup><col className="w-16" /><col className="w-14" /><col /><col className="w-20" /><col className="w-24" /><col className="w-20" /><col className="w-20" /><col className="w-28" /><col className="w-20" /><col className="w-28" /></colgroup>
              <thead className="bg-sky-100 text-left text-[11px] font-bold uppercase text-slate-700">
                <tr>
                  <th className="border border-slate-300 px-2 py-2">Código</th><th className="border border-slate-300 px-2 py-2">Año</th><th className="border border-slate-300 px-2 py-2">Materia</th><th className="border border-slate-300 px-2 py-2 text-center">Regular</th><th className="border border-slate-300 px-2 py-2">Fecha reg.</th><th className="border border-slate-300 px-2 py-2 text-center">Aprobada</th><th className="border border-slate-300 px-2 py-2">Nota</th><th className="border border-slate-300 px-2 py-2">Fecha final</th><th className="border border-slate-300 px-2 py-2 text-center">Ausente</th><th className="border border-slate-300 px-2 py-2">Fecha aus.</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {detail.completeItems.map((item) => {
                  const draft = draftFor(item)
                  const hasIncompleteFinal = draft.aprobada && !(draft.nota && draft.fecha)
                  const hasIncompleteAbsence = draft.ausente && !draft.fechaAusencia
                  return (
                  <tr key={item.subject.id || `${item.subject.materia}-${item.subjectLabel}`}>
                    <td className="border border-slate-200 px-2 py-1 font-bold">{item.subject.materia || item.subject.code || '-'}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center">{item.subject.anio ?? item.subject.ano ?? item.subject.year ?? '-'}</td>
                    <td className="border border-slate-200 px-2 py-1">{item.subjectLabel || '-'}</td>
                    <td className="border border-slate-200 px-2 py-1 text-center"><input aria-label={`Regular ${item.subjectLabel}`} className="h-4 w-4" type="checkbox" checked={draft.regular} disabled={!canEditWorkspace} onChange={(event) => updateDraft(item, 'regular', event.target.checked)} /></td>
                    <td className="border border-slate-200 p-1"><input aria-label={`Fecha de regularidad de ${item.subjectLabel}`} className="h-8 w-full rounded border border-slate-300 px-2" type="text" inputMode="numeric" placeholder="DD/MM/AAAA" value={draft.anioRegularidad} disabled={!canEditWorkspace || !draft.regular} onChange={(event) => updateDraft(item, 'anioRegularidad', event.target.value)} /></td>
                    <td className="border border-slate-200 px-2 py-1 text-center"><input aria-label={`Aprobada ${item.subjectLabel}`} className="h-4 w-4" type="checkbox" checked={draft.aprobada} disabled={!canEditWorkspace} onChange={(event) => updateDraft(item, 'aprobada', event.target.checked)} /></td>
                    <td className="border border-slate-200 p-1"><input aria-label={`Nota final de ${item.subjectLabel}`} className="h-8 w-full rounded border border-slate-300 px-2" type="text" inputMode="decimal" value={draft.nota} disabled={!canEditWorkspace || !draft.aprobada} onChange={(event) => updateDraft(item, 'nota', event.target.value)} /></td>
                    <td className="border border-slate-200 p-1"><input aria-label={`Fecha final de ${item.subjectLabel}`} className={`h-8 w-full rounded border px-2 ${hasIncompleteFinal ? 'border-amber-500' : 'border-slate-300'}`} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" value={draft.fecha} disabled={!canEditWorkspace || !draft.aprobada} onChange={(event) => updateDraft(item, 'fecha', event.target.value)} /></td>
                    <td className="border border-slate-200 px-2 py-1 text-center"><input aria-label={`Ausente ${item.subjectLabel}`} className="h-4 w-4" type="checkbox" checked={draft.ausente} disabled={!canEditWorkspace} onChange={(event) => updateDraft(item, 'ausente', event.target.checked)} /></td>
                    <td className="border border-slate-200 p-1"><input aria-label={`Fecha de ausencia de ${item.subjectLabel}`} className={`h-8 w-full rounded border px-2 ${hasIncompleteAbsence ? 'border-amber-500' : 'border-slate-300'}`} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" value={draft.fechaAusencia} disabled={!canEditWorkspace || !draft.ausente} onChange={(event) => updateDraft(item, 'fechaAusencia', event.target.value)} /></td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {detail.completeItems.length === 0 && (
              <p className="p-4 text-sm text-slate-500">No hay plan de estudios cargado para esta carrera.</p>
            )}
          </div>
        </article>

        <div className="screen-academic-view mt-5 grid gap-4 lg:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-extrabold text-slate-950">Materias que esta cursando</h4>
            <div className="mt-3 space-y-2">
              {detail.currentSubjects.map((item) => (
                <div key={item.subject} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {item.subject}
                </div>
              ))}
              {detail.currentSubjects.length === 0 && (
                <p className="text-sm text-slate-500">No hay materias en curso registradas para este alumno.</p>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-extrabold text-slate-950">Situacion por materia</h4>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {detail.items.map((item) => (
                <div key={`${item.subject}-${item.status}`} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800">{item.subject}</span>
                  <span className="status-chip border-slate-200 bg-white text-slate-700">
                    {item.status}{item.score === null ? '' : ` · ${item.score}`}
                  </span>
                </div>
              ))}
              {detail.items.length === 0 && (
                <p className="text-sm text-slate-500">Todavia no hay situacion academica cargada para este alumno.</p>
              )}
            </div>
          </article>
        </div>

        <article className="hidden">
          <h4 className="text-sm font-extrabold text-slate-950">Plan de estudios de la carrera</h4>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[720px] table-fixed divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Materia</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Anio</th>
                  <th className="px-4 py-3">Situacion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {detail.planSubjects.map((subject) => {
                  const subjectLabel = clean(subject.nombre || subject.name || subject.materia || subject.code)
                  const statusItem = detail.items.find((item) => (
                    sameText(item.subject, subjectLabel) ||
                    sameText(item.subject, subject.materia) ||
                    sameText(item.subject, subject.code)
                  ))

                  return (
                    <tr key={subject.id || `${subject.materia}-${subjectLabel}`}>
                      <td className="break-words px-4 py-3 font-semibold text-slate-900">{subject.materia || subject.code || '-'}</td>
                      <td className="break-words px-4 py-3 text-slate-700">{subjectLabel || '-'}</td>
                      <td className="break-words px-4 py-3 text-slate-700">{subject.anio ?? subject.ano ?? subject.year ?? '-'}</td>
                      <td className="break-words px-4 py-3 text-slate-700">{statusItem?.status || 'sin registro'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {detail.planSubjects.length === 0 && (
              <p className="p-4 text-sm text-slate-500">No hay plan de estudios cargado para esta carrera.</p>
            )}
          </div>
        </article>
      </article>
      <ResetAcademicRecordsDialog
        isOpen={isResetDialogOpen}
        onClose={() => setIsResetDialogOpen(false)}
        onConfirm={resetAcademicRecords}
        studentName={studentName}
      />
    </section>
    </main>,
    document.body,
  )
}

function StudentRosterSection({
  academicData = {},
  alumnos,
  canEditWorkspace = false,
  canManageStudentFinancialStatus = false,
  careerFilter = '',
  careerOptions = [],
  createOnly = false,
  embedded = false,
  institutionId = null,
  isRefreshingAcademicData = false,
  onCreateStudent,
  onDeleteStudent,
  onBackToAdmin,
  onRefreshAcademicData,
  onResetAcademicRecords,
  onUpdateAcademicRecords,
  sectionId = 'student-roster',
  onUpdateStudent,
  useRemoteWorkspace = false,
  workspaceKey = 'main',
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingStudent, setEditingStudent] = useState(null)
  const [modalMode, setModalMode] = useState('edit')
  const [form, setForm] = useState(buildStudentForm(null))
  const [page, setPage] = useState(1)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [financialRecords, setFinancialRecords] = useState([])
  const [financialStatusByRecordId, setFinancialStatusByRecordId] = useState({})
  const [pendingFinancialRecordId, setPendingFinancialRecordId] = useState(null)
  const planesEstudio = useMemo(
    () => academicData.planesEstudio ?? [],
    [academicData.planesEstudio],
  )
  const canManageFinancialStatus = Boolean(
    canEditWorkspace && canManageStudentFinancialStatus && institutionId && useRemoteWorkspace,
  )

  useEffect(() => {
    if (!canManageFinancialStatus) return

    let cancelled = false

    async function loadFinancialStatus() {
      try {
        const [studentRecords, statusRows] = await Promise.all([
          fetchStudentRecords({ institutionId, workspaceKey, useRemote: useRemoteWorkspace }),
          fetchStudentFinancialStatus({ institutionId, workspaceKey, useRemote: useRemoteWorkspace }),
        ])
        if (cancelled) return
        setFinancialRecords(studentRecords)
        setFinancialStatusByRecordId(Object.fromEntries(
          statusRows.map((row) => [row.student_record_id, Boolean(row.adeuda_cuota)]),
        ))
      } catch (error) {
        if (!cancelled) toast.error(`No se pudo cargar el estado de cuota: ${error.message}`)
      }
    }

    void loadFinancialStatus()
    return () => { cancelled = true }
  }, [canManageFinancialStatus, institutionId, useRemoteWorkspace, workspaceKey])

  const getFinancialRecord = (student) => {
    const explicitRecordId = clean(student?.record_id ?? student?.student_record_id)
    if (explicitRecordId) {
      const explicitMatch = financialRecords.find((record) => record.id === explicitRecordId)
      if (explicitMatch) return explicitMatch
    }

    const studentEmail = normalizeText(student?.email)
    const studentCareer = normalizeText(resolveStudentCareer(student, planesEstudio))
    return financialRecords.find((record) => (
      normalizeText(record.email) === studentEmail && normalizeText(record.career) === studentCareer
    )) ?? null
  }

  const editingFinancialRecord = editingStudent ? getFinancialRecord(editingStudent.student) : null
  const editingAdeudaCuota = Boolean(
    editingFinancialRecord && financialStatusByRecordId[editingFinancialRecord.id],
  )

  async function toggleEditingStudentFinancialStatus(nextValue) {
    if (!editingFinancialRecord || !canManageFinancialStatus) return
    setPendingFinancialRecordId(editingFinancialRecord.id)
    try {
      await upsertStudentFinancialStatus({
        institutionId,
        workspaceKey,
        studentRecordId: editingFinancialRecord.id,
        adeudaCuota: nextValue,
        useRemote: useRemoteWorkspace,
      })
      setFinancialStatusByRecordId((current) => ({
        ...current,
        [editingFinancialRecord.id]: nextValue,
      }))
      toast.success(nextValue
        ? 'Alumno bloqueado para inscripciones a mesas finales.'
        : 'Alumno habilitado por estado de cuota.')
    } catch (error) {
      toast.error(`No se pudo actualizar el estado de cuota: ${error.message}`)
    } finally {
      setPendingFinancialRecordId(null)
    }
  }

  const handleSearchChange = (event) => {
    setPage(1)
    setSearchQuery(event.target.value)
  }

  const startEditing = (student, index) => {
    setModalMode('edit')
    setEditingStudent({ student, index, key: getStudentKey(student, index) })
    setForm(buildStudentForm(student, planesEstudio))
  }

  const startCreating = () => {
    setModalMode('create')
    setEditingStudent(null)
    setForm(buildStudentForm(null))
  }

  const cancelEditing = () => {
    setEditingStudent(null)
    setModalMode('edit')
    setForm(buildStudentForm(null))
  }

  const handleFormChange = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }))
  }

  const submitEdit = async () => {
    const normalizedCareer = resolveCareerOptionLabel(form.carrera)
    const nextForm = {
      ...form,
      carrera: normalizedCareer,
    }

    if (modalMode === 'create') {
      const created = await onCreateStudent?.({
        ...nextForm,
        full_name: [nextForm.nombre, nextForm.apellido].filter(Boolean).join(' '),
      })

      if (created !== false) {
        cancelEditing()
      }

      return
    }

    if (!editingStudent) return

    const nextStudent = {
      ...editingStudent.student,
      ...nextForm,
      full_name: [nextForm.nombre, nextForm.apellido].filter(Boolean).join(' '),
    }

    const updated = await onUpdateStudent?.(editingStudent.key, nextStudent)

    if (updated !== false) {
      cancelEditing()
    }
  }

  const filteredStudents = useMemo(
    () => searchStudents(alumnos, searchQuery, planesEstudio),
    [alumnos, searchQuery, planesEstudio],
  )
  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE)
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages)
  const paginatedStudents = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredStudents.slice(start, start + PAGE_SIZE)
  }, [filteredStudents, safePage])
  const sectionClassName = embedded
    ? 'space-y-4'
    : 'rise-in soft-card soft-card--tint-sky border-l-4 border-l-sky-500'

  const careerStudents = useMemo(() => alumnos.filter((student) => (
    normalizeText(resolveStudentCareer(student, planesEstudio)) === normalizeText(careerFilter)
  )), [alumnos, careerFilter, planesEstudio])
  const visibleCareerStudents = useMemo(() => (
    searchQuery.trim() ? searchStudents(careerStudents, searchQuery, planesEstudio) : careerStudents
  ), [careerStudents, planesEstudio, searchQuery])
  const studentsByYear = useMemo(() => {
    const groups = new Map([['1', []], ['2', []], ['3', []], ['4', []]])
    visibleCareerStudents.forEach((student) => {
      const year = clean(resolveStudentYear(student))
      const key = ['1', '2', '3', '4'].includes(year) ? year : 'Sin año asignado'
      const rows = groups.get(key) ?? []
      rows.push(student)
      groups.set(key, rows)
    })
    return Array.from(groups.entries())
  }, [visibleCareerStudents])

  if (selectedStudent) {
    return (
      <StudentAcademicDetailPage
        academicData={academicData}
        canEditWorkspace={canEditWorkspace}
        isRefreshingAcademicData={isRefreshingAcademicData}
        student={selectedStudent}
        onBack={() => { setSelectedStudent(null); onBackToAdmin?.() }}
        onRefreshAcademicData={onRefreshAcademicData}
        onResetAcademicRecords={onResetAcademicRecords}
        onUpdateAcademicRecords={onUpdateAcademicRecords}
      />
    )
  }

  if (createOnly) {
    return (
      <>
        <button
          type="button"
          className="btn-secondary min-w-56"
          onClick={startCreating}
          disabled={!canEditWorkspace || careerOptions.length === 0}
        >
          <UserPlus className="h-4 w-4" />
          Nuevo alumno
        </button>

        <StudentEditModal
          adeudaCuota={false}
          canManageFinancialStatus={false}
          careerOptions={careerOptions}
          financialStatusPending={false}
          form={form}
          isOpen={modalMode === 'create'}
          mode={modalMode}
          onChange={handleFormChange}
          onClose={cancelEditing}
          onDelete={null}
          onOpenAcademicDetail={null}
          onSubmit={submitEdit}
          onToggleFinancialStatus={null}
        />
      </>
    )
  }

  if (careerFilter) {
    return (
      <section id={sectionId} className="space-y-5">
        <div className="student-career-heading rise-in soft-card soft-card--tint-sky border-l-4 border-l-sky-500">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <button type="button" className="mb-3 flex items-center gap-2 text-sm font-bold text-sky-700 hover:text-sky-900" onClick={onBackToAdmin}>
                <ArrowLeft className="h-4 w-4" /> Volver a carreras
              </button>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-sky-700">Alumnos por carrera</p>
              <h3 className="mt-2 text-2xl font-extrabold text-slate-950">{careerFilter}</h3>
              <p className="mt-2 text-sm text-slate-600">{careerStudents.length} alumnos distribuidos por año de cursado.</p>
            </div>
            <button type="button" className="btn-primary" onClick={startCreating} disabled={!canEditWorkspace || careerOptions.length === 0}>
              <UserPlus className="h-4 w-4" /> Nuevo alumno
            </button>
          </div>
          <label className="mt-5 block max-w-xl">
            <span className="text-sm font-semibold text-slate-700">Buscar dentro de la carrera</span>
            <input type="search" className="input-base mt-2" value={searchQuery} onChange={handleSearchChange} placeholder="Nombre, apellido, DNI o email" />
          </label>
        </div>

        <div className="student-year-grid grid gap-4 xl:grid-cols-2">
          {studentsByYear.map(([year, students]) => (
            <article key={year} className="student-year-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-extrabold text-slate-950">{year === 'Sin año asignado' ? year : `${year}.º año`}</h4>
                <span className="status-chip border-sky-200 bg-sky-50 text-sky-800">{students.length}</span>
              </div>
              <div className="mt-3 space-y-2">
                {students.length === 0 ? (
                  <p className="py-3 text-sm text-slate-500">No hay alumnos en este año.</p>
                ) : students.map((student) => {
                  const originalIndex = alumnos.indexOf(student)
                  const financialRecord = getFinancialRecord(student)
                  const owesFee = Boolean(financialRecord && financialStatusByRecordId[financialRecord.id])
                  return (
                    <button
                      key={getStudentKey(student, originalIndex)}
                      type="button"
                      className="student-year-row flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50"
                      onClick={() => startEditing(student, originalIndex)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-slate-900">{getStudentFullName(student) || student.email || 'Alumno sin nombre'}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">DNI {student.dni || '-'} · {student.email || 'Sin email'}</span>
                      </span>
                      {owesFee && <span className="status-chip shrink-0 border-orange-200 bg-orange-50 text-orange-800">Adeuda cuota</span>}
                    </button>
                  )
                })}
              </div>
            </article>
          ))}
        </div>

        <StudentEditModal
          adeudaCuota={editingAdeudaCuota}
          canManageFinancialStatus={Boolean(canManageFinancialStatus && editingFinancialRecord)}
          careerOptions={careerOptions}
          financialStatusPending={pendingFinancialRecordId === editingFinancialRecord?.id}
          form={form}
          isOpen={modalMode === 'create' || Boolean(editingStudent)}
          mode={modalMode}
          onChange={handleFormChange}
          onClose={cancelEditing}
          onDelete={editingStudent ? async () => {
            const deleted = await onDeleteStudent?.(editingStudent.key)
            if (deleted !== false) cancelEditing()
          } : null}
          onOpenAcademicDetail={editingStudent ? () => { setSelectedStudent(editingStudent.student); cancelEditing() } : null}
          onSubmit={submitEdit}
          onToggleFinancialStatus={toggleEditingStudentFinancialStatus}
        />
      </section>
    )
  }

  return (
    <section id={sectionId} className={sectionClassName}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-sky-700">
              Gestion de alumnos
            </p>
            <h3 className="mt-2 text-xl font-extrabold text-slate-950">Listado, edicion y alta manual de alumnos</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Administra el padron cargado desde la planilla de alumnos. Los cambios se guardan en el workspace activo.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={startCreating}
            disabled={!canEditWorkspace || careerOptions.length === 0}
          >
            <UserPlus className="h-4 w-4" />
            Nuevo alumno
          </button>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Buscar alumno</span>
          <input
            type="search"
            className="input-base mt-2"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Nombre, apellido, DNI, carrera, anio o email"
            autoFocus
          />
        </label>

        {searchQuery.trim() ? (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-700">{filteredStudents.length} alumnos encontrados</p>
              <p className="text-sm text-slate-500">Total cargados: {alumnos.length}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] table-fixed divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Apellido</th>
                    <th className="px-4 py-3">DNI</th>
                    <th className="px-4 py-3">Carrera</th>
                    <th className="px-4 py-3">Anio</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Telefono</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {paginatedStudents.map((student) => {
                    const originalIndex = alumnos.indexOf(student)
                    const rowKey = getStudentKey(student, originalIndex)

                    return (
                      <tr key={rowKey} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedStudent(student)}>
                        <td className="break-words px-4 py-3 font-medium text-slate-900">{student.nombre || student.full_name || '-'}</td>
                        <td className="break-words px-4 py-3 text-slate-700">{student.apellido || '-'}</td>
                        <td className="break-words px-4 py-3 text-slate-700">{student.dni || '-'}</td>
                        <td className="break-words px-4 py-3 text-slate-700">{resolveStudentCareer(student, planesEstudio) || '-'}</td>
                        <td className="break-words px-4 py-3 text-slate-700">{resolveStudentYear(student) || '-'}</td>
                        <td className="break-all px-4 py-3 text-slate-700">{student.email || '-'}</td>
                        <td className="break-words px-4 py-3 text-slate-700">{student.telefono || student.phone || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="btn-secondary px-3 py-2" onClick={(event) => { event.stopPropagation(); startEditing(student, originalIndex) }} disabled={!canEditWorkspace} title="Editar alumno">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button type="button" className="btn-secondary px-3 py-2 text-red-700" onClick={(event) => { event.stopPropagation(); onDeleteStudent?.(rowKey) }} disabled={!canEditWorkspace} title="Borrar alumno">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredStudents.length === 0 && (
              <div className="p-6 text-sm text-slate-500">
                No se encontraron alumnos con esos criterios.
              </div>
            )}
            {filteredStudents.length > PAGE_SIZE && (
              <div className="px-4 py-4">
                <PaginationControls
                  page={safePage}
                  pageSize={PAGE_SIZE}
                  total={filteredStudents.length}
                  totalPages={totalPages}
                  onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
                  onNext={() => setPage((current) => Math.min(current + 1, totalPages))}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Escribi un nombre, apellido, DNI, carrera, anio o email para buscar entre los {alumnos.length} alumnos cargados.
          </div>
        )}
      </div>

      <StudentEditModal
        adeudaCuota={editingAdeudaCuota}
        canManageFinancialStatus={Boolean(canManageFinancialStatus && editingFinancialRecord)}
        careerOptions={careerOptions}
        financialStatusPending={pendingFinancialRecordId === editingFinancialRecord?.id}
        form={form}
        isOpen={modalMode === 'create' || Boolean(editingStudent)}
        mode={modalMode}
        onChange={handleFormChange}
        onClose={cancelEditing}
        onDelete={editingStudent ? async () => {
          const deleted = await onDeleteStudent?.(editingStudent.key)
          if (deleted !== false) cancelEditing()
        } : null}
        onOpenAcademicDetail={editingStudent ? () => { setSelectedStudent(editingStudent.student); cancelEditing() } : null}
        onSubmit={submitEdit}
        onToggleFinancialStatus={toggleEditingStudentFinancialStatus}
      />
    </section>
  )
}

export default StudentRosterSection
