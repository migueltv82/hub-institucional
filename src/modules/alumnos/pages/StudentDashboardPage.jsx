import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  Download,
  LibraryBig,
  ListChecks,
  Pencil,
  Printer,
  Save,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useStudentStore } from '../stores/studentStore'
import { getStudentProfilePhoto } from '../services/studentProfile.js'
import StudentScheduleTimetable from '../components/StudentScheduleTimetable.jsx'
import { findEnrollmentForGrade, getEnrollmentGrades } from '../lib/gradeMatching.js'
import { getAttendanceSummaryForEnrollment } from '../lib/studentAttendance.js'
import {
  getAcademicStatusLabel,
  getLatestAcademicStatusForSubject,
  normalizeAcademicStatus,
} from '../lib/academicStatus.js'

const EMPTY_ARRAY = []
const APPROVED_CERTIFICATE_STATUSES = new Set(['approved', 'promocionado'])

function normalizeStatus(status) {
  return String(status || '').toLowerCase()
}

function getStudentName(student) {
  const parts = [student?.first_name, student?.last_name].filter(Boolean)
  return student?.full_name || student?.name || parts.join(' ') || 'Alumno'
}

function getStudentPhotoKey(student) {
  const identity = student?.id || student?.record_id || student?.email || getStudentName(student)
  return `student-dashboard-photo:${identity || 'current'}`
}

function getStudentProfileKey(student) {
  const identity = student?.id || student?.record_id || student?.email || getStudentName(student)
  return `student-dashboard-profile:${identity || 'current'}`
}

function buildStudentProfile(student) {
  const firstName = String(student?.first_name || student?.nombre || '').trim()
  const lastName = String(student?.last_name || student?.apellido || '').trim()

  return {
    nombre: firstName || getStudentName(student).split(/\s+/)[0] || '',
    apellido: lastName,
    domicilio: String(student?.domicilio || student?.address || student?.raw?.domicilio || student?.raw?.address || '').trim(),
    telefono: String(student?.telefono || student?.phone || student?.raw?.telefono || student?.raw?.phone || '').trim(),
    email: String(student?.email || student?.mail || student?.correo || '').trim(),
    photo: getStudentProfilePhoto(student),
  }
}

function readStoredStudentProfile(student) {
  const baseProfile = buildStudentProfile(student)
  let storedProfile = {}

  try {
    storedProfile = JSON.parse(window.localStorage.getItem(getStudentProfileKey(student)) || '{}')
  } catch {
    storedProfile = {}
  }

  const storedPhoto = storedProfile.photo || window.localStorage.getItem(getStudentPhotoKey(student)) || ''

  return {
    ...baseProfile,
    ...storedProfile,
    photo: storedPhoto,
  }
}

function getStudentNameFromProfile(profile, student) {
  const fullName = [profile?.nombre, profile?.apellido].filter(Boolean).join(' ').trim()
  return fullName || getStudentName(student)
}

function getSubjectId(subject) {
  const item = subject?.subject || subject
  return item?.canonical_subject_id || item?.subject_id || item?.code || item?.id
}

function getEnrollmentSubjectId(enrollment) {
  return enrollment?.canonical_subject_id || enrollment?.subject_id || enrollment?.subject?.canonical_subject_id || enrollment?.subject?.subject_id || enrollment?.subject?.code || enrollment?.subject?.id || ''
}

function getSubjectFromEnrollment(enrollment, subjects = []) {
  if (enrollment?.subject) return enrollment.subject
  return subjects.find((subject) => getSubjectId(subject) === getEnrollmentSubjectId(enrollment)) || null
}

function getProgramId(program) {
  return typeof program === 'string' ? program : program?.canonical_program_id || program?.program_id || program?.id
}

function matchesProgram(enrollment, programId) {
  return !programId || !enrollment?.program_id || enrollment.program_id === programId
}

function getSubjectCredits(subject) {
  return Number(subject?.subject?.credits ?? subject?.credits ?? 0) || 0
}

function getFinalGrade(enrollment, grades = []) {
  return getEnrollmentGrades(enrollment, grades).find((grade) => {
    const gradeType = getGradeType(grade)
    return gradeType === 'final' || grade.final_grade !== undefined
  })
}

function getGradeType(grade) {
  return normalizeStatus(grade?.grade_type || grade?.type || 'final')
}

function getGradeScore(grade) {
  const score = Number(grade?.score ?? grade?.grade_value ?? grade?.final_grade ?? grade?.value)
  return Number.isFinite(score) ? score : null
}

function getGradeDate(grade) {
  return grade?.final_date || grade?.fecha_final || grade?.graded_at || grade?.date || grade?.updated_at || grade?.created_at || ''
}

function getAcademicStatusFromRecord(record) {
  return normalizeAcademicStatus(record?.academic_status || record?.condition || record?.condicion)
}

function getAcademicDateTimestamp(record) {
  const timestamp = Date.parse(getGradeDate(record))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function sortByAcademicDate(left, right) {
  return getAcademicDateTimestamp(right) - getAcademicDateTimestamp(left)
}

function getRegularityGrade(enrollment, grades = []) {
  return getEnrollmentGrades(enrollment, grades)
    .filter((grade) => getAcademicStatusFromRecord(grade) === 'regular')
    .sort(sortByAcademicDate)[0] ?? null
}

function getExamDate(exam) {
  return exam?.exam_date || exam?.exam_session?.exam_date || exam?.date || null
}

function getExamId(exam) {
  return exam?.id || exam?.exam_session_id || exam?.exam_session?.id
}

function getSubjectLabelFromExam(exam) {
  return exam?.subject?.name || exam?.subject_name || exam?.nombreMateria || exam?.materia || 'Mesa de examen'
}

function formatDate(dateString) {
  if (!dateString) return 'Sin fecha'

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateString))
}

function formatShortDate(dateString) {
  if (!dateString) return ''

  const dateParts = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/)
  const date = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(dateString)
  if (Number.isNaN(date.getTime())) return String(dateString)

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date)
}

function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatNumber(value, digits = 1) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toFixed(digits)
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

function sanitizeFilePart(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'alumno'
}

function truncatePdfText(doc, text, maxWidth) {
  const value = String(text ?? '').trim() || '-'
  if (doc.getTextWidth(value) <= maxWidth) return value

  let next = value
  while (next.length > 1 && doc.getTextWidth(`${next}...`) > maxWidth) {
    next = next.slice(0, -1)
  }

  return `${next}...`
}

function normalizeSubject(item) {
  const subject = item?.subject || item

  return {
    ...subject,
    id: subject?.id || item?.subject_id || item?.id,
    subject_id: subject?.subject_id || item?.subject_id || subject?.code || '',
    canonical_subject_id: subject?.canonical_subject_id || item?.canonical_subject_id || subject?.subject_id || item?.subject_id || subject?.code || '',
    portal_subject_id: subject?.portal_subject_id || item?.portal_subject_id || subject?.id || item?.id || '',
    canonical_program_id: subject?.canonical_program_id || item?.canonical_program_id || subject?.program_id || item?.program_id || '',
    semester: Number(subject?.semester ?? item?.semester ?? 1) || 1,
    credits: Number(subject?.credits ?? item?.credits ?? 0) || 0,
    is_mandatory: item?.is_mandatory ?? subject?.is_mandatory ?? true,
    code: subject?.code ?? item?.code ?? '',
    name: subject?.name ?? item?.name ?? 'Materia sin nombre',
  }
}

function buildAcademicLabel(status) {
  const labels = {
    regular: {
      label: 'Regular',
      description: 'Puede cursar y rendir segun correlatividades.',
      tone: 'sky',
    },
    libre: {
      label: 'Libre',
      description: 'Debe regularizar su situacion academica.',
      tone: 'amber',
    },
    promoted: {
      label: 'Promocionado',
      description: 'Tiene condiciones academicas destacadas.',
      tone: 'emerald',
    },
    suspended: {
      label: 'Suspendido',
      description: 'Requiere revision administrativa.',
      tone: 'red',
    },
    inactive: {
      label: 'Inactivo',
      description: 'No registra actividad academica reciente.',
      tone: 'slate',
    },
  }

  return labels[normalizeStatus(status)] || labels.regular
}

function getSchedulesForSubject(classSchedules, subject) {
  const subjectId = getSubjectId(subject)
  if (!subjectId) return EMPTY_ARRAY

  return classSchedules.filter((schedule) => (
    schedule.subject_id === subjectId ||
    schedule.canonical_subject_id === subjectId ||
    (schedule.subject_code && subject.code && schedule.subject_code === subject.code)
  ))
}

function getEnrollmentForSubject(enrollments, subjectId, programId) {
  return enrollments.find((enrollment) => {
    const sameSubject = getEnrollmentSubjectId(enrollment) === subjectId
    const sameProgram = !programId || enrollment.program_id === programId
    const status = normalizeStatus(enrollment.status)
    return sameSubject && sameProgram && status !== 'dropped'
  })
}

function getSubjectYear(subject) {
  return subject?.semester ?? subject?.anio ?? subject?.ano ?? subject?.year ?? '-'
}

function getEnrollmentForAcademicSubject(enrollments, subject, programId) {
  return enrollments.find((enrollment) => {
    const sameSubject = getEnrollmentSubjectId(enrollment) === getSubjectId(subject)
    const sameProgram = !programId || enrollment.program_id === programId
    return sameSubject && sameProgram
  }) ?? null
}

function getCertificateAcademicStatus({ subject, enrollment, grade, grades, programId }) {
  const explicitStatus = normalizeAcademicStatus(
    grade?.academic_status ||
    grade?.condition ||
    grade?.condicion ||
    enrollment?.academic_status ||
    enrollment?.condition ||
    enrollment?.condicion,
  )

  if (explicitStatus !== 'pending') return explicitStatus

  const latestGradeStatus = getLatestAcademicStatusForSubject({
    subjectId: getSubjectId(subject),
    programId,
    grades,
  })

  if (latestGradeStatus !== 'pending') return latestGradeStatus

  const score = getGradeScore(grade)
  if (score !== null && score >= 6) return 'approved'
  if (score !== null) return 'failed'

  return 'pending'
}

function getRegularityDate({ enrollment, regularityGrade, certificateStatus }) {
  const explicitDate = regularityGrade?.regularity_date ||
    regularityGrade?.fecha_regularidad ||
    enrollment?.regularity_date ||
    enrollment?.fecha_regularidad ||
    ''

  if (explicitDate) return formatShortDate(explicitDate)

  const regularityYear = regularityGrade?.regular_year ||
    regularityGrade?.anio_regularidad ||
    enrollment?.regular_year ||
    enrollment?.anio_regularidad ||
    ''

  if (regularityYear) return String(regularityYear)

  if (regularityGrade || certificateStatus === 'regular') {
    return formatShortDate(getGradeDate(regularityGrade) || enrollment?.regularized_at || enrollment?.regular_at || '')
  }

  return ''
}

function getFinalDate(finalGrade) {
  return formatShortDate(getGradeDate(finalGrade))
}

function getCertificateStatusLabel(certificateStatus) {
  const normalized = normalizeAcademicStatus(certificateStatus)
  if (normalized === 'pending') return 'Pendiente'
  return getAcademicStatusLabel(normalized)
}

// Se exporta para probar la normalización del certificado sin montar toda la página.
// eslint-disable-next-line react-refresh/only-export-components
export function getAcademicRows({ subjects, enrollments, grades, programId }) {
  return subjects.map((subject) => {
    const enrollment = getEnrollmentForAcademicSubject(enrollments, subject, programId)
    const grade = getFinalGrade(enrollment, grades)
    const regularityGrade = getRegularityGrade(enrollment, grades)
    const score = getGradeScore(grade)
    const certificateStatus = getCertificateAcademicStatus({
      subject,
      enrollment,
      grade,
      grades,
      programId,
    })

    return {
      subject,
      year: getSubjectYear(subject),
      code: subject.code || '-',
      name: subject.name || 'Materia',
      score,
      letters: score === null ? '-' : scoreToWords(score),
      regularityDate: getRegularityDate({ enrollment, regularityGrade, certificateStatus }),
      finalDate: getFinalDate(grade),
      date: '',
      status: getCertificateStatusLabel(certificateStatus),
      certificateStatus,
      observation: enrollment?.observation || enrollment?.observacion || '-',
      plan: subject.plan || subject.plan_year || '-',
    }
  })
}

function getPrintableCertificate() {
  return document.querySelector('.student-certificate-document')
}

function printAcademicDocument() {
  const certificate = getPrintableCertificate()

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
    window.print()
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
          body { margin: 0; background: #fff; color: #020617; font-family: Arial, Helvetica, sans-serif; }
          .certificate-document { display: block; width: 100%; color: #020617; font-family: Arial, Helvetica, sans-serif; }
          .certificate-header { display: grid; grid-template-columns: 70px 1fr 70px; align-items: center; gap: 10px; text-align: center; }
          .certificate-logo-slot { display: flex; min-height: 58px; align-items: center; justify-content: center; border: 2px dashed #94a3b8; border-radius: 8px; color: #64748b; font-size: 8px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
          .certificate-heading h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 30px; line-height: 1; color: #020617; }
          .certificate-heading p { margin: 4px 0 0; font-size: 9px; font-weight: 700; color: #334155; }
          .certificate-kicker { font-family: Georgia, "Times New Roman", serif; font-size: 12px !important; font-weight: 700 !important; }
          .certificate-rule { margin: 8px auto 7px; height: 3px; max-width: 540px; border-top: 2px solid #020617; border-bottom: 1px solid #020617; }
          .certificate-text { margin: 5px 0; font-size: 10px; line-height: 1.28; text-align: justify; }
          .certificate-table-wrap { margin-top: 7px; }
          .certificate-table { width: 100%; border-collapse: collapse; font-size: 7px; }
          .certificate-table th, .certificate-table td { border: 1px solid #020617; padding: 1.4px 2.5px; line-height: 1.05; vertical-align: top; }
          .certificate-table th { background: #f8fafc; font-weight: 800; text-align: center; text-transform: uppercase; }
          .certificate-subject-cell { width: 32%; }
          .certificate-footer { margin-top: 8px; font-size: 9px; line-height: 1.25; text-align: justify; }
          .certificate-signatures { margin-top: 42px; display: grid; grid-template-columns: 1fr 1fr; gap: 96px; }
          .certificate-signatures span { display: block; border-top: 1px solid #020617; }
          .certificate-signatures p { margin-top: 6px; text-align: center; font-size: 8px; font-weight: 700; text-transform: uppercase; }
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

function statusConfig(status) {
  const normalized = normalizeStatus(status)

  if (['completed', 'approved', 'passed'].includes(normalized)) {
    return {
      label: 'Completada',
      className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    }
  }

  if (['active', 'enrolled'].includes(normalized)) {
    return {
      label: 'Cursando',
      className: 'bg-sky-100 text-sky-800 ring-sky-200',
    }
  }

  return {
    label: 'Disponible',
    className: 'bg-white text-slate-700 ring-slate-200',
  }
}

function StatCard({ label, value, helper, icon: Icon, tone = 'slate' }) {
  const accentClass = {
    slate: '',
    sky: 'metric-card--cyan',
    emerald: 'metric-card--lime',
    amber: 'metric-card--warning',
    red: 'metric-card--coral',
  }[tone]
  const iconClass = {
    slate: 'text-slate-500',
    sky: 'text-cyan-700',
    emerald: 'text-lime-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  }[tone]

  return (
    <div className={`metric-card ${accentClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
        {Icon && <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />}
      </div>
      <div className="mt-3 text-3xl font-extrabold text-slate-950">{value}</div>
      {helper && <div className="mt-1 text-sm text-slate-600">{helper}</div>}
    </div>
  )
}

function Section({ title, icon: Icon, action, children, className = '', tint = '' }) {
  const tintClass = tint ? `soft-card--tint-${tint}` : ''

  return (
    <section className={`soft-card ${tintClass} ${className}`}>
      <div className="-mx-4 -mt-4 flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4 md:-mx-5 md:-mt-5">
        <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-950">
          {Icon && (
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--student-lavender-tint)] text-[var(--student-lavender-ink)]">
              <Icon className="h-4 w-4" />
            </span>
          )}
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function EmptyBlock({ children }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
      {children}
    </div>
  )
}

function StudentDashboardContent({
  data,
  institution,
  onOpenSubjects,
  onSaveProfile,
  program,
  student,
}) {
  const initialProfile = useMemo(() => readStoredStudentProfile(student), [student])
  const [studentPhoto, setStudentPhoto] = useState(() => initialProfile.photo || '')
  const [photoError, setPhotoError] = useState('')
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [studentProfile, setStudentProfile] = useState(() => initialProfile)
  const [profileForm, setProfileForm] = useState(() => initialProfile)
  const programId = getProgramId(program)
  const programName = typeof program === 'string' ? program : program?.name
  const studentDni = String(student?.raw?.dni || student?.dni || '').trim()
  const institutionName = typeof institution === 'string' ? institution : institution?.name

  const enrollments = data?.enrollments ?? EMPTY_ARRAY
  const subjects = data?.subjects ?? EMPTY_ARRAY
  const grades = data?.grades ?? EMPTY_ARRAY
  const attendanceRecords = data?.attendanceRecords ?? EMPTY_ARRAY
  const exams = data?.exams ?? EMPTY_ARRAY
  const classSchedules = data?.classSchedules ?? EMPTY_ARRAY
  const examEnrollments = data?.examEnrollments ?? EMPTY_ARRAY
  const academicStatus = data?.academicStatus

  const calculateAverageGrade = useStudentStore((state) => state.calculateAverageGrade)
  const clearError = useStudentStore((state) => state.clearError)
  const clearSuccess = useStudentStore((state) => state.clearSuccess)
  const setSuccess = useStudentStore((state) => state.setSuccess)
  const error = useStudentStore((state) => state.error)
  const success = useStudentStore((state) => state.success)
  const loading = useStudentStore((state) => state.loading)

  async function persistStudentProfile(nextProfile) {
    await onSaveProfile?.(nextProfile)
    window.localStorage.setItem(getStudentProfileKey(student), JSON.stringify(nextProfile))
    if (nextProfile.photo) {
      window.localStorage.setItem(getStudentPhotoKey(student), nextProfile.photo)
    } else {
      window.localStorage.removeItem(getStudentPhotoKey(student))
    }
    setStudentProfile(nextProfile)
    setProfileForm(nextProfile)
    setStudentPhoto(nextProfile.photo || '')
  }

  function handleStudentPhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setPhotoError('Selecciona una imagen valida.')
      event.target.value = ''
      return
    }

    if (file.size > 2.5 * 1024 * 1024) {
      setPhotoError('La imagen no puede superar 2.5 MB.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const value = String(reader.result || '')
      const nextProfile = {
        ...studentProfile,
        photo: value,
      }
      setPhotoError('')
      try {
        await persistStudentProfile(nextProfile)
        setSuccess('Foto de perfil guardada.')
      } catch (saveError) {
        setPhotoError(saveError.message || 'No se pudo guardar la foto.')
      }
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  async function removeStudentPhoto() {
    if (!studentPhoto) return
    if (!window.confirm('¿Quieres eliminar tu foto de perfil?')) return

    setPhotoError('')
    try {
      await persistStudentProfile({
        ...studentProfile,
        photo: '',
      })
      setSuccess('Foto de perfil eliminada.')
    } catch (saveError) {
      setPhotoError(saveError.message || 'No se pudo eliminar la foto.')
    }
  }

  function handleProfileFieldChange(field) {
    return (event) => {
      setProfileForm((current) => ({
        ...current,
        [field]: event.target.value,
      }))
    }
  }

  async function saveStudentProfile() {
    const nextProfile = {
      ...profileForm,
      nombre: String(profileForm.nombre || '').trim(),
      apellido: String(profileForm.apellido || '').trim(),
      domicilio: String(profileForm.domicilio || '').trim(),
      telefono: String(profileForm.telefono || '').trim(),
      email: String(profileForm.email || '').trim(),
      photo: studentPhoto,
    }

    try {
      await persistStudentProfile(nextProfile)
      setSuccess('Datos personales guardados.')
      setIsEditingProfile(false)
    } catch (saveError) {
      setPhotoError(saveError.message || 'No se pudieron guardar los datos personales.')
    }
  }

  function cancelStudentProfileEdit() {
    setProfileForm(studentProfile)
    setStudentPhoto(studentProfile.photo || '')
    setPhotoError('')
    setIsEditingProfile(false)
  }

  const careerSubjects = useMemo(() => {
    return subjects
      .map(normalizeSubject)
      .filter((subject) => !programId || subject.program_id === programId)
      .sort((a, b) => Number(a.semester || 1) - Number(b.semester || 1) || String(a.name).localeCompare(b.name))
  }, [subjects, programId])

  const academicRows = useMemo(() => getAcademicRows({
    enrollments,
    grades,
    programId,
    subjects: careerSubjects,
  }), [careerSubjects, enrollments, grades, programId])

  const subjectPreview = useMemo(() => careerSubjects.slice(0, 4), [careerSubjects])

  const dashboard = useMemo(() => {
    const activeEnrollments = enrollments.filter((enrollment) =>
      matchesProgram(enrollment, programId) &&
      ['active', 'enrolled'].includes(normalizeStatus(enrollment.status))
    )
    const approvedSubjects = careerSubjects.filter((subject) => {
      const subjectId = getSubjectId(subject)
      const subjectProgramId = subject.canonical_program_id || subject.program_id || programId || ''
      const academicSubjectStatus = getLatestAcademicStatusForSubject({
        subjectId,
        programId: subjectProgramId,
        grades,
      })

      if (['approved', 'promocionado'].includes(academicSubjectStatus)) return true

      const enrollment = getEnrollmentForSubject(enrollments, subjectId, programId)
      return ['completed', 'approved', 'passed'].includes(normalizeStatus(enrollment?.status))
    })
    const finalGrades = enrollments
      .map((enrollment) => getFinalGrade(enrollment, grades))
      .map(getGradeScore)
      .filter((score) => score !== null)
    const calculatedAverage =
      finalGrades.length > 0
        ? finalGrades.reduce((total, score) => total + score, 0) / finalGrades.length
        : calculateAverageGrade()
    const completedCredits = approvedSubjects.reduce((total, subject) => total + getSubjectCredits(subject), 0)
    const progress = careerSubjects.length > 0
      ? Math.round((approvedSubjects.length / careerSubjects.length) * 100)
      : 0
    const upcomingExams = exams
      .filter((exam) => {
        const date = getExamDate(exam)
        return date && new Date(date) >= new Date()
      })
      .sort((a, b) => new Date(getExamDate(a)) - new Date(getExamDate(b)))
      .slice(0, 4)
    const registeredExamIds = new Set(
      examEnrollments
        .filter((item) => normalizeStatus(item.status) !== 'dropped')
        .map((item) => item.exam_session_id || item.exam_session?.id)
    )
    const approvedSubjectIds = new Set(approvedSubjects.map(getSubjectId))
    const pendingSubjects = careerSubjects.filter((subject) => !approvedSubjectIds.has(getSubjectId(subject)))
    const nextSubject =
      pendingSubjects.find((subject) => !getEnrollmentForSubject(activeEnrollments, getSubjectId(subject), programId)) ||
      pendingSubjects[0] ||
      null

    return {
      activeEnrollments,
      approvedSubjects,
      average: calculatedAverage,
      completedCredits,
      progress,
      upcomingExams,
      registeredExamIds,
      nextSubject,
    }
  }, [
    enrollments,
    grades,
    exams,
    examEnrollments,
    programId,
    careerSubjects,
    calculateAverageGrade,
  ])

  const academicLabel = buildAcademicLabel(academicStatus?.status)
  const progressValue = Math.min(100, Math.max(0, Math.round(dashboard.progress)))
  const completedSubjectCount = dashboard.approvedSubjects.length
  const totalSubjectCount = careerSubjects.length || subjects.length
  const nextExam = dashboard.upcomingExams[0]
  const certificateRows = academicRows
  const regularCertificateCount = certificateRows.filter((row) => row.certificateStatus === 'regular').length
  const approvedCertificateCount = certificateRows.filter((row) => APPROVED_CERTIFICATE_STATUSES.has(row.certificateStatus)).length
  const certificateSummary = `Resumen: ${approvedCertificateCount} materias aprobadas, ${regularCertificateCount} materias regulares, promedio ${formatNumber(academicStatus?.average_grade ?? dashboard.average, 1)}.`
  const studentName = getStudentNameFromProfile(studentProfile, student)

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
      { key: 'year', label: 'ANIO', width: 9 },
      { key: 'name', label: 'MATERIA', width: 56 },
      { key: 'regularityDate', label: 'REG.', width: 22 },
      { key: 'score', label: 'NOTA', width: 13 },
      { key: 'letters', label: 'LETRAS', width: 16 },
      { key: 'finalDate', label: 'FINAL', width: 18 },
      { key: 'status', label: 'ESTADO', width: 20 },
      { key: 'observation', label: 'OBSERVACIONES', width: 30 },
      { key: 'plan', label: 'PLAN', width: contentWidth - 184 },
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
    doc.text(institutionName || 'Institucion', centerX, 23, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text('ESTADO ACADEMICO INSTITUCIONAL', centerX, 29, { align: 'center' })
    doc.setDrawColor(2, 6, 23)
    doc.line(52, 32, pageWidth - 52, 32)
    doc.setLineWidth(0.5)
    doc.line(52, 34, pageWidth - 52, 34)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const certText = `Se hace constar que ${studentName}, estudiante de ${programName || 'carrera sin especificar'}, registra la siguiente situacion academica segun la informacion obrante en el sistema institucional.`
    doc.text(doc.splitTextToSize(certText, contentWidth), margin, 42)
    doc.text(doc.splitTextToSize(certificateSummary, contentWidth), margin, 53)

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
    rows.forEach((row) => {
      x = margin
      columns.forEach((column) => {
        doc.rect(x, y, column.width, rowHeight)
        const value = truncatePdfText(doc, row[column.key], column.width - 2)
        const align = column.key === 'name' || column.key === 'observation' ? 'left' : 'center'
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

  return (
    <main className="student-dashboard min-h-screen">
      <div className="student-dashboard__inner w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-12">
        <section className="student-profile-strip soft-card soft-card--tint-teal">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                {studentPhoto ? (
                  <img src={studentPhoto} alt={studentName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <UserRound className="h-6 w-6" />
                  </div>
                )}
                <label className="absolute -bottom-0.5 -right-0.5 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:text-slate-950">
                  <Camera className="h-3.5 w-3.5" />
                  <span className="sr-only">Cambiar foto</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={handleStudentPhotoChange} />
                </label>
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Carrera</p>
                  <p className="truncate text-slate-800">{programName || 'Sin carrera'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</p>
                  <p className="truncate text-slate-800">{studentProfile.email || 'Mail sin cargar'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">DNI</p>
                  <p className="truncate text-slate-800">{studentDni || 'Sin cargar'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Telefono</p>
                  <p className="truncate text-slate-800">{studentProfile.telefono || 'Sin cargar'}</p>
                </div>
                {photoError && <p className="col-span-full text-sm font-semibold text-red-700">{photoError}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary justify-center" onClick={() => setIsEditingProfile(true)}>
                <Pencil className="h-4 w-4" />
                Editar datos
              </button>
              <span className="hidden h-6 w-px bg-slate-200 sm:block" />
              <button type="button" className="btn-secondary justify-center" onClick={printAcademicDocument}>
                <Printer className="h-4 w-4" />
                Imprimir estado academico
              </button>
              <button type="button" className="btn-primary justify-center" onClick={downloadAcademicPdf}>
                <Download className="h-4 w-4" />
                PDF
              </button>
            </div>
          </div>

          {(nextExam || dashboard.nextSubject) && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-[var(--student-lavender)]/30 bg-[var(--student-lavender-tint)] px-3 py-2.5 text-sm text-[var(--student-lavender-ink)]">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--student-lavender-ink)]" />
              <p>
                <span className="font-extrabold">Proximo paso:</span>{' '}
                {nextExam
                  ? `${getSubjectLabelFromExam(nextExam)} - mesa el ${formatDate(getExamDate(nextExam))}.`
                  : `${dashboard.nextSubject?.name} - materia pendiente para seguir avanzando en la carrera.`}
              </p>
            </div>
          )}
        </section>

        {isEditingProfile && (
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase text-[var(--student-lavender-ink)]">Datos personales</p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-950">Editar informacion del estudiante</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={cancelStudentProfileEdit}>
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
                <button type="button" className="btn-primary" onClick={saveStudentProfile}>
                  <Save className="h-4 w-4" />
                  Guardar
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="h-28 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  {studentPhoto ? (
                    <img src={studentPhoto} alt={studentName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <UserRound className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <label className="btn-secondary w-28 cursor-pointer justify-center px-2">
                  <Camera className="h-4 w-4" />
                  Foto
                  <input type="file" accept="image/*" className="sr-only" onChange={handleStudentPhotoChange} />
                </label>
                {studentPhoto && (
                  <button
                    type="button"
                    className="btn-secondary w-28 justify-center border-red-200 px-2 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800"
                    onClick={removeStudentPhoto}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['nombre', 'Nombre'],
                  ['apellido', 'Apellido'],
                  ['domicilio', 'Domicilio'],
                  ['telefono', 'Telefono'],
                  ['email', 'Mail'],
                ].map(([field, label]) => (
                  <label key={field} className={field === 'domicilio' ? 'block md:col-span-2' : 'block'}>
                    <span className="text-sm font-semibold text-slate-700">{label}</span>
                    <input
                      className="input-base mt-2"
                      type={field === 'email' ? 'email' : 'text'}
                      value={profileForm[field] || ''}
                      onChange={handleProfileFieldChange(field)}
                    />
                  </label>
                ))}
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="font-semibold text-red-800">
              Cerrar
            </button>
          </div>
        )}

        {success && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>{success}</span>
            <button type="button" onClick={clearSuccess} className="font-semibold text-emerald-900">
              Cerrar
            </button>
          </div>
        )}

        {loading && (
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-200" />
            ))}
          </div>
        )}

        {!loading && (
          <>
            <section className="student-certificate-document certificate-document">
              <header className="certificate-header">
                <div className="certificate-logo-slot">Logo</div>
                <div className="certificate-heading">
                  <p className="certificate-kicker">Instituto</p>
                  <h2>{institutionName || 'Institucion'}</h2>
                  <p>Estado academico institucional</p>
                </div>
              </header>

              <div className="certificate-rule" />

              <p className="certificate-text">
                Se hace constar que <strong>{studentName}</strong>, estudiante de <strong>{programName || 'carrera sin especificar'}</strong>,
                registra la siguiente situacion academica segun la informacion obrante en el sistema institucional.
              </p>
              <p className="certificate-text">
                {certificateSummary}
              </p>

              <div className="certificate-table-wrap">
                <table className="certificate-table">
                  <thead>
                    <tr>
                      <th>Anio</th>
                      <th>Materia</th>
                      <th>Fecha regularidad</th>
                      <th colSpan="3">Final</th>
                      <th>Estado</th>
                      <th>Observaciones</th>
                      <th>Plan</th>
                    </tr>
                    <tr>
                      <th />
                      <th />
                      <th />
                      <th>Numeros</th>
                      <th>Letras</th>
                      <th>Fecha</th>
                      <th />
                      <th />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {certificateRows.map((row) => (
                      <tr key={`${row.code}-${row.name}`}>
                        <td>{row.year}</td>
                        <td className="certificate-subject-cell">{row.name}</td>
                        <td>{row.regularityDate || '-'}</td>
                        <td>{row.score === null ? '-' : row.score}</td>
                        <td>{row.letters}</td>
                        <td>{row.finalDate || '-'}</td>
                        <td>{row.status}</td>
                        <td>{row.observation}</td>
                        <td>{row.plan}</td>
                      </tr>
                    ))}
                    {certificateRows.length === 0 && (
                      <tr>
                        <td colSpan="9">No hay informacion academica cargada para emitir la constancia.</td>
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

            <section className="student-dashboard-stats mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Promedio"
                value={formatNumber(academicStatus?.average_grade ?? dashboard.average, 1)}
                helper={`${grades.length} calificaciones registradas`}
                icon={Award}
                tone="sky"
              />
              <StatCard
                label="Cursando"
                value={dashboard.activeEnrollments.length}
                helper="Inscripciones activas"
                icon={Clock3}
              />
              <StatCard
                label="Aprobadas"
                value={dashboard.approvedSubjects.length}
                helper={`${dashboard.completedCredits} creditos aprobados`}
                icon={CheckCircle2}
                tone="emerald"
              />
              <StatCard
                label={academicLabel.label}
                value={`${progressValue}%`}
                helper={academicLabel.description}
                icon={ListChecks}
                tone={academicLabel.tone}
              />
            </section>

            <Section title="Horario de cursada" icon={Clock3} className="student-dashboard-section mt-6" tint="sky">
              <StudentScheduleTimetable
                schedules={classSchedules}
                institutionName={institutionName}
                studentName={studentName}
              />
            </Section>

            <section className="mt-6 space-y-6">
              <div className="space-y-6">
                <Section
                  title="Avance de carrera"
                  icon={LibraryBig}
                  tint="teal"
                  className="student-career-progress"
                  action={
                    <Link className="inline-flex items-center gap-1 text-sm font-bold text-[var(--student-lavender-ink)] hover:opacity-80" to="/app/estado-academico">
                      Detalle
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  }
                >
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-slate-700">Progreso total</span>
                        <span className="font-extrabold text-slate-950">
                          {completedSubjectCount} de {totalSubjectCount || 0}
                        </span>
                      </div>
                      <div className="student-career-progress__track mt-3 h-4 overflow-hidden rounded-full bg-slate-100">
                        <div className="student-career-progress__bar h-full rounded-full" style={{ width: `${progressValue}%` }} />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Link
                        aria-label="Ver materias pendientes"
                        className="student-career-progress__metric student-career-progress__metric--pending rounded-xl border p-4"
                        to="/app/estado-academico?estado=pending#materias"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700">Pendientes</p>
                          <Clock3 className="h-5 w-5 text-amber-600" />
                        </div>
                        <p className="mt-3 text-3xl font-black text-slate-950">
                          {Math.max(0, (totalSubjectCount || 0) - completedSubjectCount)}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                          Ver materias por completar
                          <ArrowRight className="h-3.5 w-3.5" />
                        </p>
                      </Link>
                      <Link
                        aria-label="Ver materias aprobadas"
                        className="student-career-progress__metric student-career-progress__metric--approved rounded-xl border p-4"
                        to="/app/estado-academico?estado=approved#materias"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700">Aprobadas</p>
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <p className="mt-3 text-3xl font-black text-slate-950">{completedSubjectCount}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                          Ver finales aprobados
                          <ArrowRight className="h-3.5 w-3.5" />
                        </p>
                      </Link>
                    </div>
                  </div>
                </Section>

                <Section
                  title="Materias de la carrera"
                  icon={BookOpen}
                  action={
                    onOpenSubjects ? (
                      <button
                        type="button"
                        onClick={onOpenSubjects}
                        className="inline-flex items-center gap-1 text-sm font-bold text-[var(--student-lavender-ink)] hover:opacity-80"
                      >
                        Ver todas
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <Link className="inline-flex items-center gap-1 text-sm font-bold text-[var(--student-lavender-ink)] hover:opacity-80" to="/app/materias">
                        Ver todas
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )
                  }
                >
                  {careerSubjects.length > 0 ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {subjectPreview.map((subject) => {
                        const enrollment = getEnrollmentForSubject(enrollments, getSubjectId(subject), programId)
                        const subjectStatus = statusConfig(enrollment?.status)
                        const subjectSchedules = getSchedulesForSubject(classSchedules, subject)
                        const attendanceSummary = enrollment
                          ? getAttendanceSummaryForEnrollment(enrollment, attendanceRecords)
                          : null

                        return (
                          <div
                            key={subject.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-[var(--student-lavender)] hover:bg-white hover:shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold uppercase text-slate-500">
                                  {subject.code || 'Sin codigo'}
                                </p>
                                <h3 className="mt-2 text-lg font-semibold text-slate-950">{subject.name}</h3>
                              </div>
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${subjectStatus.className}`}>
                                {subjectStatus.label}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-3 text-sm text-slate-600">
                              <div>
                                <div className="font-semibold text-slate-900">Año</div>
                                <div>{subject.semester || '1'}</div>
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">Creditos</div>
                                <div>{subject.credits || 0}</div>
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">Tipo</div>
                                <div>{subject.is_mandatory ? 'Obligatoria' : 'Optativa'}</div>
                              </div>
                            </div>
                            <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="font-semibold text-slate-700">Asistencia</span>
                                <span className="font-extrabold text-slate-950">{attendanceSummary?.label ?? 'Sin registros'}</span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-[var(--student-lavender)]"
                                  style={{ width: `${attendanceSummary?.percentage ?? 0}%` }}
                                />
                              </div>
                            </div>
                            {subjectSchedules.length > 0 && (
                              <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
                                {subjectSchedules.map((schedule) => (
                                  <div key={schedule.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                                    <span className="font-semibold text-slate-900">
                                      {schedule.day}{[schedule.start, schedule.end].filter(Boolean).length > 0 ? ` ${[schedule.start, schedule.end].filter(Boolean).join('-')}` : ''}
                                    </span>
                                    <span className="truncate text-slate-600">{schedule.teacher || 'Docente sin cargar'}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyBlock>No hay materias cargadas para tu carrera actualmente.</EmptyBlock>
                  )}
                </Section>
              </div>

              <div className="space-y-6">
                <Section
                  title="Proximas mesas"
                  icon={CalendarDays}
                  tint="amber"
                  action={
                    <Link className="inline-flex items-center gap-1 text-sm font-bold text-[var(--student-lavender-ink)] hover:opacity-80" to="/app/mesas-examen">
                      Inscribirme
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  }
                >
                  {dashboard.upcomingExams.length > 0 ? (
                    <div className="space-y-3">
                      {dashboard.upcomingExams.map((exam) => {
                        const isRegistered = dashboard.registeredExamIds.has(getExamId(exam))

                        return (
                          <div
                            key={getExamId(exam)}
                            className="rounded-md border border-slate-200 bg-slate-50 p-4 transition hover:border-[var(--student-lavender)] hover:bg-white hover:shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-slate-950">{getSubjectLabelFromExam(exam)}</p>
                                <p className="mt-1 text-sm text-slate-600">{formatDate(getExamDate(exam))}</p>
                              </div>
                              <span className={`rounded-full px-2 py-1 text-xs font-bold ring-1 ring-inset ${
                                isRegistered
                                  ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
                                  : 'bg-white text-slate-700 ring-slate-200'
                              }`}>
                                {isRegistered ? 'Inscripto' : 'Disponible'}
                              </span>
                            </div>
                            {exam.location && <p className="mt-3 text-sm text-slate-600">{exam.location}</p>}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyBlock>No hay mesas proximas publicadas.</EmptyBlock>
                  )}
                </Section>

                <Section
                  title="Calificaciones recientes"
                  icon={Award}
                  action={
                    <Link className="inline-flex items-center gap-1 text-sm font-bold text-[var(--student-lavender-ink)] hover:opacity-80" to="/app/calificaciones">
                      Ver todas
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  }
                >
                  {grades.length > 0 ? (
                    <div className="space-y-3">
                      {grades.slice(0, 4).map((grade) => {
                        const enrollment = findEnrollmentForGrade(grade, enrollments)
                        const subject = getSubjectFromEnrollment(enrollment, subjects)
                        const score = getGradeScore(grade)

                        const scoreClass = score >= 7 ? 'text-emerald-700' : score >= 4 ? 'text-amber-700' : 'text-red-700'
                        const accentClass = score >= 7 ? 'border-l-emerald-400' : score >= 4 ? 'border-l-amber-400' : 'border-l-red-400'

                        return (
                          <div
                            key={grade.id}
                            className={`flex items-center justify-between gap-3 rounded-md border border-l-4 border-slate-200 px-4 py-3 transition hover:bg-slate-50 ${accentClass}`}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-950">
                                {subject?.name || grade.subject_name || 'Materia'}
                              </div>
                              <div className="text-sm text-slate-600">
                                {grade.grade_type || grade.type || 'Calificacion'}
                              </div>
                            </div>
                            <div className={`text-lg font-extrabold ${scoreClass}`}>
                              {score !== null ? formatNumber(score, 1) : 'N/A'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyBlock>Aun no hay calificaciones registradas.</EmptyBlock>
                  )}
                </Section>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

export default function StudentDashboardPage({
  student: studentProp,
  program: programProp,
  institution: institutionProp,
  onOpenSubjects,
}) {
  const outletContext = useOutletContext() ?? {}
  const { data, onSaveProfile: outletSaveProfile } = outletContext
  const student = studentProp || data?.currentStudent
  const program = programProp || data?.currentProgram
  const institution = institutionProp || data?.currentInstitution

  return (
    <StudentDashboardContent
      key={getStudentProfileKey(student)}
      data={data}
      institution={institution}
      onOpenSubjects={onOpenSubjects}
      onSaveProfile={outletSaveProfile}
      program={program}
      student={student}
    />
  )
}
