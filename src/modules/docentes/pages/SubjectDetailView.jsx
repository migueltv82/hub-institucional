import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BookOpenCheck, CalendarDays, CheckCircle2, ClipboardList, Pencil, RotateCcw, Save, Trash2, UsersRound, X, XCircle } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EmptyBlock, Section } from '../TeacherPortalModule.jsx'
import { fetchSubjectRoster } from '../services/subjectRoster.js'
import { buildSubjectDisplayIndex, buildSubjectKey } from '../services/teacherSubjects.js'
import {
  createClassSession,
  fetchAttendanceForSessions,
  fetchAttendanceForSession,
  fetchClassSessions,
  saveAttendanceForSession,
} from '../../../services/subjectAttendance.js'
import { fetchStudentGrades, upsertStudentGrade } from '../../../services/studentGrades.js'
import { resetStudentSubjectAcademicRecords } from '../services/teacherStudentAcademicReset.js'
import { removeStudentFromTeacherSubject } from '../services/teacherStudentRemoval.js'

const EMPTY_ARRAY = []

const DETAIL_TABS = [
  { key: 'alumnos', label: 'Alumnos', icon: UsersRound },
  { key: 'asistencia', label: 'Asistencia', icon: CalendarDays },
  { key: 'notas', label: 'Notas', icon: ClipboardList },
]

const GRADE_SLOTS = [
  { key: 'partial-1', label: 'Parcial 1', gradeType: 'partial', attemptNumber: 1 },
  { key: 'makeup-1', label: 'Recuperacion 1', gradeType: 'makeup', attemptNumber: 1 },
  { key: 'partial-2', label: 'Parcial 2', gradeType: 'partial', attemptNumber: 2 },
  { key: 'makeup-2', label: 'Recuperacion 2', gradeType: 'makeup', attemptNumber: 2 },
  { key: 'final', label: 'Nota final', gradeType: 'final', attemptNumber: 1 },
]

const FIRST_PARTIAL_SLOT = GRADE_SLOTS.find((slot) => slot.key === 'partial-1')
const SECOND_PARTIAL_SLOT = GRADE_SLOTS.find((slot) => slot.key === 'partial-2')
const FINAL_GRADE_SLOT = GRADE_SLOTS.find((slot) => slot.key === 'final')

const ATTENDANCE_STATUS_OPTIONS = [
  { value: 'present', label: 'Presente' },
  { value: 'absent', label: 'Ausente' },
]

const ACADEMIC_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'regular', label: 'Regular' },
  { value: 'libre', label: 'Libre' },
  { value: 'promocionado', label: 'Promocionado' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'failed', label: 'Desaprobado' },
]

const ACADEMIC_STATUS_LABELS = ACADEMIC_STATUS_OPTIONS.reduce((labels, option) => {
  labels[option.value] = option.label
  return labels
}, {})

function clean(value) {
  return String(value ?? '').trim()
}

function getTodayInputValue() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeIdentity(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '')
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right)
}

function addSubjectCodeAlias(aliases, value) {
  const identity = normalizeIdentity(value)
  if (!identity) return

  aliases.add(identity)

  const withoutLeadingZero = identity.match(/^([a-z]+)0+(\d+)$/)
  if (withoutLeadingZero) {
    aliases.add(`${withoutLeadingZero[1]}${Number(withoutLeadingZero[2])}`)
  }

  const likelyZeroAsLetter = identity.match(/^([a-z]+)o(\d+)$/)
  if (likelyZeroAsLetter) {
    const zeroVariant = `${likelyZeroAsLetter[1]}0${likelyZeroAsLetter[2]}`
    aliases.add(zeroVariant)
    aliases.add(`${likelyZeroAsLetter[1]}${Number(likelyZeroAsLetter[2])}`)
  }
}

function getSubjectCodeAliases(value) {
  const aliases = new Set()
  const raw = clean(value)

  addSubjectCodeAlias(aliases, raw)
  normalizeText(raw)
    .split(/[:|/\\]+/)
    .forEach((part) => addSubjectCodeAlias(aliases, part))

  return Array.from(aliases).filter(Boolean)
}

function subjectMatches(left, right) {
  const leftAliases = getSubjectCodeAliases(left)
  const rightAliases = getSubjectCodeAliases(right)
  return leftAliases.some((alias) => rightAliases.includes(alias))
}

function programMatches(left, right) {
  const leftKey = normalizeIdentity(left)
  const rightKey = normalizeIdentity(right)
  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function parseSubjectKey(subjectKey) {
  const [subjectIdPart, programIdPart] = String(subjectKey ?? '').split('__')
  return {
    subjectId: decodeURIComponent(subjectIdPart ?? ''),
    programId: decodeURIComponent(programIdPart ?? ''),
  }
}

function gradeCellKey(studentId, slot) {
  return `${studentId}::${slot.gradeType}::${slot.attemptNumber}`
}

function getGradeStoredValue(grade) {
  const value = grade?.grade_value ?? grade?.score ?? grade?.final_grade ?? grade?.partial_grade
  return value === null || value === undefined ? '' : value
}

function parseGradeInput(value) {
  const raw = clean(value).replace(',', '.')
  if (!raw) return { value: null, valid: true }

  const numericValue = Number(raw)
  return {
    value: Number.isFinite(numericValue) ? numericValue : null,
    valid: Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 10,
  }
}

function formatGradeValue(value) {
  return String(Math.round(Number(value) * 100) / 100)
}

function normalizeAttendanceStatus(status) {
  return clean(status).toLowerCase() === 'absent' ? 'absent' : 'present'
}

function getAttendanceStatusLabel(status) {
  return normalizeAttendanceStatus(status) === 'absent' ? 'Ausente' : 'Presente'
}

function getAttendanceBadgeClass(status) {
  return normalizeAttendanceStatus(status) === 'absent'
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function formatDateLabel(value) {
  const raw = clean(value)
  if (!raw) return '-'

  const [year, month, day] = raw.split('-').map((part) => Number(part))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return raw

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function getGradeForSlot(grades, studentId, slot) {
  return grades.find((grade) => (
    grade.student_id === studentId &&
    grade.grade_type === slot.gradeType &&
    Number(grade.attempt_number ?? 1) === slot.attemptNumber
  )) ?? null
}

function getGradeDisplayValue(grade) {
  const value = getGradeStoredValue(grade)
  return clean(value) || '-'
}

function getLatestStatusLabel(grades, studentId) {
  const studentGrades = grades
    .filter((grade) => grade.student_id === studentId)
    .sort((a, b) => new Date(b.updated_at ?? 0) - new Date(a.updated_at ?? 0))

  if (studentGrades.length === 0) return 'Sin estado'

  const status = studentGrades[0].academic_status
  return ACADEMIC_STATUS_LABELS[status] || status || 'Sin estado'
}

function isValidDetailTab(tab) {
  return DETAIL_TABS.some((item) => item.key === tab)
}

function getStudentName(student) {
  return clean(student?.full_name) ||
    [student?.nombre, student?.apellido].map(clean).filter(Boolean).join(' ') ||
    clean(student?.email) ||
    'Alumno sin nombre registrado'
}

function buildFallbackRoster({ groups = EMPTY_ARRAY, subjectId, programId }) {
  const sameSubjectGroups = groups.filter((item) => subjectMatches(item.code, subjectId))
  const group = sameSubjectGroups.find((item) => !programId || programMatches(item.career, programId) || sameText(item.career, programId))
    ?? sameSubjectGroups.find((item) => (item.students ?? EMPTY_ARRAY).length > 0)
    ?? (sameSubjectGroups.length === 1 ? sameSubjectGroups[0] : null)

  if (!group) return []

  return (group.students ?? EMPTY_ARRAY).map((student, index) => {
    const studentId = clean(student.id || student.student_id || student.profile_id || student.user_id || student.email || student.dni || `fallback-${index}`)

    return {
      enrollmentId: clean(student.enrollmentId || student.enrollment_id || `fallback-${group.key}-${studentId}`),
      studentId,
      studentRecordId: clean(student.record_id || student.student_record_id) || null,
      fullName: getStudentName(student),
      dni: clean(student.dni),
      isFallback: true,
    }
  })
}

function DetailTabs({ activeTab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {DETAIL_TABS.map((tab) => {
        const Icon = tab.icon

        return (
          <button
            key={tab.key}
            type="button"
            className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-extrabold transition ${
              activeTab === tab.key
                ? 'border-teal-700 bg-teal-700 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200'
            }`}
            onClick={() => onChange(tab.key)}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function StudentDetailModal({ student, grades, sessions = EMPTY_ARRAY, attendanceRecords = EMPTY_ARRAY, onClose }) {
  if (!student) return null

  const sortedSessions = [...sessions].sort((left, right) => String(right.session_date).localeCompare(String(left.session_date)))
  const attendanceRows = sortedSessions.map((session) => ({
    session,
    record: attendanceRecords.find((record) => record.session_id === session.id && record.student_id === student.studentId) ?? null,
  }))
  const loadedAttendanceRows = attendanceRows.filter((row) => row.record)
  const presentCount = loadedAttendanceRows.filter((row) => normalizeAttendanceStatus(row.record?.status) === 'present').length
  const absentCount = loadedAttendanceRows.filter((row) => normalizeAttendanceStatus(row.record?.status) === 'absent').length
  const attendancePercentage = loadedAttendanceRows.length > 0
    ? Math.round((presentCount / loadedAttendanceRows.length) * 100)
    : null

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <section
        className="modal-surface panel max-h-[90vh] w-full max-w-4xl overflow-y-auto bg-white shadow-2xl rise-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
      >
        <header className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-extrabold uppercase text-teal-700">Detalle del alumno</p>
            <h3 id="student-detail-title" className="mt-1 text-xl font-extrabold text-slate-950">{student.fullName}</h3>
            <p className="mt-1 text-sm text-slate-500">{student.dni ? `DNI ${student.dni}` : 'Sin DNI registrado'}</p>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="Cerrar detalle del alumno"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold uppercase text-slate-600">Asistencias</h4>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-extrabold text-teal-700">
                  {attendancePercentage === null ? 'Sin porcentaje' : `${attendancePercentage}% asistencia`}
                </span>
                {loadedAttendanceRows.length > 0 && (
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                    {presentCount} presentes / {absentCount} ausentes
                  </span>
                )}
              </div>
            </div>

            {attendanceRows.length === 0 ? (
              <EmptyBlock>No hay clases con asistencia guardada para esta materia.</EmptyBlock>
            ) : (
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Asistencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {attendanceRows.map(({ session, record }) => (
                      <tr key={session.id}>
                        <td className="px-4 py-3 font-semibold text-slate-950">{formatDateLabel(session.session_date)}</td>
                        <td className="px-4 py-3">
                          {record ? (
                            <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-extrabold ${getAttendanceBadgeClass(record.status)}`}>
                              {getAttendanceStatusLabel(record.status)}
                            </span>
                          ) : (
                            <span className="text-sm font-semibold text-slate-500">Sin cargar</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-extrabold uppercase text-slate-600">Notas</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Evaluacion</th>
                    <th className="px-4 py-3">Nota</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {GRADE_SLOTS.map((slot) => {
                    const grade = getGradeForSlot(grades, student.studentId, slot)
                    const status = slot.key === FINAL_GRADE_SLOT.key
                      ? ACADEMIC_STATUS_LABELS[grade?.academic_status] || grade?.academic_status || '-'
                      : '-'

                    return (
                      <tr key={slot.key}>
                        <td className="px-4 py-3 font-semibold text-slate-950">{slot.label}</td>
                        <td className="px-4 py-3 text-slate-700">{getGradeDisplayValue(grade)}</td>
                        <td className="px-4 py-3 text-slate-700">{status}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

function RemoveStudentModal({ student, onClose, onConfirm, isRemoving = false }) {
  const [step, setStep] = useState(1)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (!student) return null

  const confirmRemoval = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await onConfirm(student, password)
    } catch (removalError) {
      setError(removalError instanceof Error ? removalError.message : 'No se pudo completar la eliminación.')
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4" onMouseDown={() => !isRemoving && onClose()}>
      <section className="modal-surface panel w-full max-w-lg" role="dialog" aria-modal="true" aria-labelledby="remove-student-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="soft-title text-red-700">Confirmación {step} de 2</p>
            <h2 id="remove-student-title" className="mt-1 text-2xl font-extrabold text-slate-950">Eliminar de la materia</h2>
          </div>
          <button className="btn-secondary h-10 w-10 p-0" type="button" aria-label="Cerrar" disabled={isRemoving} onClick={onClose}><X className="h-4 w-4" /></button>
        </header>

        {step === 1 ? (
          <div className="mt-5 space-y-5">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">
              <p className="font-extrabold">¿Querés eliminar a {student.fullName} de esta materia?</p>
              <p className="mt-2">Se quitará su inscripción y dejará de aparecer en el portal docente. La cuenta institucional del alumno no será eliminada.</p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
              <button className="btn-secondary border-red-300 text-red-700 hover:bg-red-50" type="button" onClick={() => setStep(2)}>Continuar</button>
            </div>
          </div>
        ) : (
          <form className="mt-5 space-y-5" onSubmit={confirmRemoval}>
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-950">
              <p className="font-extrabold">Confirmación final</p>
              <p className="mt-2">También se eliminarán todas sus asistencias y notas de esta materia. Esta acción no se puede deshacer desde el portal.</p>
            </div>
            <label className="block text-sm font-bold text-slate-700">
              Ingresá tu contraseña docente
              <input
                autoComplete="current-password"
                autoFocus
                className="input-base mt-2"
                type="password"
                value={password}
                onChange={(event) => { setPassword(event.target.value); setError('') }}
                disabled={isRemoving}
                required
              />
            </label>
            {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button className="btn-secondary" type="button" disabled={isRemoving} onClick={() => { setStep(1); setPassword(''); setError('') }}>Volver</button>
              <button className="btn-secondary border-red-300 bg-red-600 text-white hover:bg-red-700" type="submit" disabled={isRemoving || !password}>
                <Trash2 className="h-4 w-4" />
                {isRemoving ? 'Eliminando...' : 'Eliminar alumno y sus registros'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

function ResetStudentRecordsModal({ student, onClose, onConfirm, isResetting = false }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (!student) return null

  const confirmReset = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await onConfirm(student, password)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'No se pudo completar el reinicio.')
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4" onMouseDown={() => !isResetting && onClose()}>
      <section className="modal-surface panel w-full max-w-lg" role="dialog" aria-modal="true" aria-labelledby="reset-student-records-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="soft-title text-amber-700">Confirmacion requerida</p>
            <h2 id="reset-student-records-title" className="mt-1 text-2xl font-extrabold text-slate-950">Reiniciar registros</h2>
          </div>
          <button className="btn-secondary h-10 w-10 p-0" type="button" aria-label="Cerrar" disabled={isResetting} onClick={onClose}><X className="h-4 w-4" /></button>
        </header>

        <form className="mt-5 space-y-5" onSubmit={confirmReset}>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p className="font-extrabold">Vas a reiniciar los registros de {student.fullName}.</p>
            <p className="mt-2">Se borraran las notas, la condicion final y las asistencias de esta materia. El alumno seguira inscripto.</p>
          </div>
          <label className="block text-sm font-bold text-slate-700">
            Ingresa tu contrasena docente
            <input
              autoComplete="current-password"
              autoFocus
              className="input-base mt-2"
              type="password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError('') }}
              disabled={isResetting}
              required
            />
          </label>
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button className="btn-secondary" type="button" disabled={isResetting} onClick={onClose}>Cancelar</button>
            <button className="btn-secondary border-amber-300 bg-amber-600 text-white hover:bg-amber-700" type="submit" disabled={isResetting || !password}>
              <RotateCcw className="h-4 w-4" />
              {isResetting ? 'Reiniciando...' : 'Reiniciar registros'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function AlumnosTab({
  roster,
  grades,
  sessions = EMPTY_ARRAY,
  attendanceRecords = EMPTY_ARRAY,
  onRemoveStudent,
  onResetStudentRecords,
  isRemovingStudent = false,
  isResettingStudentRecords = false,
  canResetStudentRecords = true,
}) {
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentToRemove, setStudentToRemove] = useState(null)
  const [studentToReset, setStudentToReset] = useState(null)

  if (roster.length === 0) {
    return <EmptyBlock>No hay alumnos inscriptos en esta materia todavia.</EmptyBlock>
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Alumno</th>
              <th className="px-4 py-3">DNI</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {roster.map((student) => (
              <tr key={student.enrollmentId}>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-left font-extrabold text-teal-700 underline-offset-4 transition hover:text-teal-900 hover:underline"
                    onClick={() => setSelectedStudent(student)}
                  >
                    {student.fullName}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-700">{student.dni || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{getLatestStatusLabel(grades, student.studentId)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center justify-end gap-2">
                    {canResetStudentRecords && onResetStudentRecords && (
                      <button
                        className="btn-secondary px-3 py-2 text-amber-700"
                        type="button"
                        title="Reiniciar notas, estado y asistencias"
                        aria-label={`Reiniciar notas, estado y asistencias de ${student.fullName}`}
                        disabled={isResettingStudentRecords || isRemovingStudent}
                        onClick={() => setStudentToReset(student)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      className="btn-secondary px-3 py-2 text-red-700"
                      type="button"
                      title="Eliminar alumno de la materia"
                      aria-label={`Eliminar a ${student.fullName} de la materia`}
                      disabled={isRemovingStudent || isResettingStudentRecords}
                      onClick={() => setStudentToRemove(student)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <StudentDetailModal
        student={selectedStudent}
        grades={grades}
        sessions={sessions}
        attendanceRecords={attendanceRecords}
        onClose={() => setSelectedStudent(null)}
      />
      <RemoveStudentModal
        student={studentToRemove}
        isRemoving={isRemovingStudent}
        onClose={() => setStudentToRemove(null)}
        onConfirm={async (student, password) => {
          await onRemoveStudent(student, password)
          setStudentToRemove(null)
        }}
      />
      <ResetStudentRecordsModal
        student={studentToReset}
        isResetting={isResettingStudentRecords}
        onClose={() => setStudentToReset(null)}
        onConfirm={async (student, password) => {
          await onResetStudentRecords(student, password)
          setStudentToReset(null)
        }}
      />
    </>
  )
}

function AsistenciaTab({
  roster,
  canPersistRecords = true,
  selectedDate,
  onChangeDate,
  attendanceDraft,
  onChangeStatus,
  onSaveAttendance,
  isSaving,
  isLoadingSession = false,
  feedback,
  hasExistingSession = false,
}) {
  if (!canPersistRecords) {
    return (
      <EmptyBlock>
        Esta lista viene del snapshot institucional. Para tomar asistencia, primero inscribi los alumnos en la materia desde la gestion academica.
      </EmptyBlock>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px]">
          <label className="text-xs font-bold uppercase text-slate-500">Fecha de clase</label>
          <input
            className="input-base mt-2"
            type="date"
            value={selectedDate}
            onChange={(event) => onChangeDate(event.target.value)}
          />
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          {hasExistingSession ? 'Editando asistencia guardada' : 'Se guardara como nueva clase'}
        </div>
      </div>

      {!selectedDate ? (
        <EmptyBlock>Selecciona una fecha para cargar asistencia.</EmptyBlock>
      ) : roster.length === 0 ? (
        <EmptyBlock>No hay alumnos inscriptos en esta materia todavia.</EmptyBlock>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Alumno</th>
                  <th className="px-4 py-3">Asistencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {roster.map((student) => {
                  const currentStatus = normalizeAttendanceStatus(attendanceDraft[student.studentId])

                  return (
                    <tr key={student.enrollmentId}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{student.fullName}</td>
                      <td className="px-4 py-3">
                        <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
                          {ATTENDANCE_STATUS_OPTIONS.map((option) => {
                            const isActive = currentStatus === option.value
                            const Icon = option.value === 'present' ? CheckCircle2 : XCircle

                            return (
                              <button
                                key={option.value}
                                type="button"
                                className={`inline-flex min-h-10 items-center gap-2 px-3 py-2 text-sm font-extrabold transition ${
                                  isActive
                                    ? option.value === 'present'
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-red-600 text-white'
                                    : 'bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                                onClick={() => onChangeStatus(student.studentId, option.value)}
                              >
                                <Icon className="h-4 w-4" />
                                {option.label}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {feedback && <p className="text-sm font-semibold text-amber-800">{feedback}</p>}

          <button type="button" className="btn-primary" onClick={onSaveAttendance} disabled={isSaving || isLoadingSession || !selectedDate}>
            {isSaving ? 'Guardando...' : 'Guardar asistencia'}
          </button>
        </div>
      )}
    </div>
  )
}

export function NotasTab({ roster, grades, onConfirmGrades, feedback, canPersistRecords = true, isSaving = false }) {
  const gradesByCell = useMemo(() => {
    const map = new Map()
    grades.forEach((grade) => {
      map.set(`${grade.student_id}::${grade.grade_type}::${grade.attempt_number}`, grade)
    })
    return map
  }, [grades])

  const [drafts, setDrafts] = useState({})
  const [statusDrafts, setStatusDrafts] = useState({})
  const [localFeedback, setLocalFeedback] = useState('')
  const [editMode, setEditMode] = useState(null)
  const hasStoredGrades = grades.length > 0
  const isEditing = editMode ?? !hasStoredGrades

  const getStoredOrDraftValue = (studentId, slot) => {
    const cellKey = gradeCellKey(studentId, slot)
    if (cellKey in drafts) return drafts[cellKey]

    const gradeRow = gradesByCell.get(cellKey)
    return getGradeStoredValue(gradeRow)
  }

  const getCalculatedFinalValue = (studentId) => {
    const firstPartial = parseGradeInput(getStoredOrDraftValue(studentId, FIRST_PARTIAL_SLOT))
    const secondPartial = parseGradeInput(getStoredOrDraftValue(studentId, SECOND_PARTIAL_SLOT))

    if (!firstPartial.valid || !secondPartial.valid || firstPartial.value === null || secondPartial.value === null) {
      return ''
    }

    return formatGradeValue((firstPartial.value + secondPartial.value) / 2)
  }

  const getDraftValue = (studentId, slot) => {
    if (slot.key === FINAL_GRADE_SLOT.key) {
      return getCalculatedFinalValue(studentId) || getStoredOrDraftValue(studentId, slot)
    }

    return getStoredOrDraftValue(studentId, slot)
  }

  const updateDraft = (studentId, slot, value) => {
    setDrafts((current) => ({ ...current, [gradeCellKey(studentId, slot)]: value }))
    setLocalFeedback('')
  }

  const getStatusValue = (studentId) => {
    const gradeRow = gradesByCell.get(gradeCellKey(studentId, FINAL_GRADE_SLOT))
    return statusDrafts[studentId] ?? gradeRow?.academic_status ?? 'pending'
  }

  const changeStatus = (studentId, status) => {
    setStatusDrafts((current) => ({ ...current, [studentId]: status }))
    setLocalFeedback('')
  }

  const handleConfirm = async () => {
    const rows = []

    for (const student of roster) {
      for (const slot of GRADE_SLOTS) {
        const cellKey = gradeCellKey(student.studentId, slot)
        const gradeRow = gradesByCell.get(cellKey)
        const rawValue = getDraftValue(student.studentId, slot)
        const parsed = parseGradeInput(rawValue)
        const isFinalSlot = slot.gradeType === 'final'
        const academicStatus = isFinalSlot ? getStatusValue(student.studentId) : undefined
        const hasValue = clean(rawValue) !== ''
        const hasDraft = cellKey in drafts
        const statusChanged = isFinalSlot && student.studentId in statusDrafts
        const partialsChanged = isFinalSlot && (
          gradeCellKey(student.studentId, FIRST_PARTIAL_SLOT) in drafts
          || gradeCellKey(student.studentId, SECOND_PARTIAL_SLOT) in drafts
        )
        const shouldPersist = hasDraft
          || statusChanged
          || partialsChanged
          || (!gradeRow && (hasValue || (isFinalSlot && academicStatus !== 'pending')))

        if (!parsed.valid) {
          setLocalFeedback('Las notas deben estar entre 0 y 10.')
          return
        }

        if (!shouldPersist) continue

        rows.push({
          studentId: student.studentId,
          studentRecordId: student.studentRecordId,
          subjectEnrollmentId: student.enrollmentId,
          slot,
          gradeValue: parsed.value,
          academicStatus,
          lockVersion: gradeRow?.lock_version,
        })
      }
    }

    if (rows.length === 0) {
      setLocalFeedback('No hay notas o condiciones para confirmar.')
      return
    }

    const result = await onConfirmGrades(rows)
    if (result?.success) {
      setDrafts({})
      setStatusDrafts({})
      setLocalFeedback('')
      setEditMode(false)
    }
  }

  const beginEditing = () => {
    setLocalFeedback('')
    setEditMode(true)
  }

  const cancelEditing = () => {
    setDrafts({})
    setStatusDrafts({})
    setLocalFeedback('')
    setEditMode(false)
  }

  if (roster.length === 0) {
    return <EmptyBlock>No hay alumnos inscriptos en esta materia todavia.</EmptyBlock>
  }

  if (!canPersistRecords) {
    return (
      <EmptyBlock>
        Esta lista viene del snapshot institucional. Para cargar notas y condicion final, primero inscribi los alumnos en la materia desde la gestion academica.
      </EmptyBlock>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-950">Carga de parciales y condicion final</p>
          <p className="mt-1 text-sm text-slate-600">
            {isEditing
              ? 'Editá las notas y la condición. Los cambios se publican para el alumno al confirmar.'
              : 'Carga confirmada. Para hacer cambios, habilitá nuevamente la edición.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-extrabold ${
            isEditing ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {isEditing ? 'Edición habilitada' : 'Carga confirmada'}
          </span>
          {isEditing ? (
            <>
              {hasStoredGrades && (
                <button type="button" className="btn-secondary" onClick={cancelEditing} disabled={isSaving}>
                  Cancelar edición
                </button>
              )}
              <button type="button" className="btn-primary" onClick={handleConfirm} disabled={isSaving}>
                <Save className="h-4 w-4" />
                {isSaving ? 'Guardando...' : (hasStoredGrades ? 'Confirmar cambios' : 'Confirmar carga')}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" onClick={beginEditing} disabled={isSaving}>
              <Pencil className="h-4 w-4" />
              Editar notas y condición
            </button>
          )}
        </div>
      </div>
      {(feedback || localFeedback) && <p className="text-sm font-semibold text-amber-800">{localFeedback || feedback}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[860px] table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Alumno</th>
              {GRADE_SLOTS.map((slot) => (
                <th key={slot.key} className="px-3 py-3">{slot.label}</th>
              ))}
              <th className="px-3 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {roster.map((student) => {
              return (
                <tr key={student.enrollmentId}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{student.fullName}</td>
                  {GRADE_SLOTS.map((slot) => (
                    <td key={slot.key} className="px-3 py-3">
                      <input
                        className={`input-base ${slot.key === FINAL_GRADE_SLOT.key || !isEditing ? 'bg-slate-50 font-semibold text-slate-700' : ''}`}
                        type="number"
                        min="0"
                        max="10"
                        step={slot.key === FINAL_GRADE_SLOT.key ? '0.01' : '0.5'}
                        value={getDraftValue(student.studentId, slot)}
                        onChange={(event) => updateDraft(student.studentId, slot, event.target.value)}
                        readOnly={slot.key === FINAL_GRADE_SLOT.key || !isEditing}
                        aria-label={`${student.fullName} - ${slot.label}`}
                        title={slot.key === FINAL_GRADE_SLOT.key ? 'Promedio automatico de Parcial 1 y Parcial 2' : undefined}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <select
                      className="input-base"
                      value={getStatusValue(student.studentId)}
                      onChange={(event) => changeStatus(student.studentId, event.target.value)}
                      disabled={!isEditing || isSaving}
                      aria-label={`${student.fullName} - Condición`}
                    >
                      {ACADEMIC_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SubjectDetailView({
  institutionId,
  teacherId,
  planesEstudio = EMPTY_ARRAY,
  fallbackSubjectStudentGroups = EMPTY_ARRAY,
}) {
  const { subjectKey } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { subjectId, programId } = useMemo(() => parseSubjectKey(subjectKey), [subjectKey])
  const queryClient = useQueryClient()
  const requestedTab = searchParams.get('tab')
  const activeTab = isValidDetailTab(requestedTab) ? requestedTab : 'alumnos'
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState(() => getTodayInputValue())
  const [attendanceDraft, setAttendanceDraft] = useState({})
  const [attendanceFeedback, setAttendanceFeedback] = useState('')
  const [gradesFeedback, setGradesFeedback] = useState('')
  const [isSavingAttendance, setIsSavingAttendance] = useState(false)
  const [isSavingGrades, setIsSavingGrades] = useState(false)
  const [isRemovingStudent, setIsRemovingStudent] = useState(false)
  const [isResettingStudentRecords, setIsResettingStudentRecords] = useState(false)

  const subjectDisplayIndex = useMemo(() => buildSubjectDisplayIndex(planesEstudio), [planesEstudio])
  const subjectDisplay = subjectDisplayIndex.get(buildSubjectKey(subjectId, programId)) ?? {}

  const rosterQuery = useQuery({
    queryKey: ['subject-roster', institutionId, subjectId, programId],
    queryFn: () => fetchSubjectRoster({ institutionId, subjectId, programId }),
    enabled: Boolean(institutionId && subjectId),
    staleTime: 0,
    refetchInterval: 1000 * 10,
    refetchOnMount: 'always',
  })

  const gradesQuery = useQuery({
    queryKey: ['subject-grades', institutionId, subjectId, programId],
    queryFn: () => fetchStudentGrades({ institutionId, subjectId, programId }),
    enabled: Boolean(institutionId && subjectId),
    staleTime: 1000 * 15,
  })

  const sessionsQuery = useQuery({
    queryKey: ['subject-sessions', institutionId, subjectId, programId, teacherId],
    queryFn: () => fetchClassSessions({ institutionId, subjectId, programId, teacherId }),
    enabled: Boolean(institutionId && subjectId),
    staleTime: 1000 * 15,
  })

  const remoteRoster = rosterQuery.data ?? EMPTY_ARRAY
  const fallbackRoster = useMemo(() => buildFallbackRoster({
    groups: fallbackSubjectStudentGroups,
    subjectId,
    programId,
  }), [fallbackSubjectStudentGroups, programId, subjectId])
  // Un resultado remoto vacio es autoritativo: significa que ya no hay una
  // inscripcion activa. El snapshot historico solo sirve si la consulta fallo.
  const usesFallbackRoster = rosterQuery.isError && fallbackRoster.length > 0
  const roster = usesFallbackRoster ? fallbackRoster : remoteRoster
  const grades = gradesQuery.data ?? EMPTY_ARRAY
  const sessions = sessionsQuery.data ?? EMPTY_ARRAY
  const sessionIds = useMemo(() => sessions.map((session) => session.id).filter(Boolean), [sessions])
  const attendanceRecordsQuery = useQuery({
    queryKey: ['subject-attendance-records', institutionId, subjectId, programId, teacherId, sessionIds],
    queryFn: () => fetchAttendanceForSessions(sessionIds),
    enabled: sessionIds.length > 0,
    staleTime: 1000 * 15,
  })
  const attendanceRecords = attendanceRecordsQuery.data ?? EMPTY_ARRAY
  const selectedAttendanceSession = useMemo(() => {
    if (!selectedAttendanceDate) return null
    return sessions.find((session) => session.session_date === selectedAttendanceDate) ?? null
  }, [selectedAttendanceDate, sessions])

  useEffect(() => {
    let cancelled = false

    async function loadAttendance() {
      if (!selectedAttendanceDate) {
        setAttendanceDraft({})
        return
      }

      if (!selectedAttendanceSession?.id) {
        const draft = {}
        roster.forEach((student) => {
          draft[student.studentId] = 'present'
        })
        setAttendanceDraft(draft)
        return
      }

      const records = await fetchAttendanceForSession(selectedAttendanceSession.id)
      if (cancelled) return

      const draft = {}
      roster.forEach((student) => {
        const record = records.find((row) => row.student_id === student.studentId)
        draft[student.studentId] = normalizeAttendanceStatus(record?.status)
      })
      setAttendanceDraft(draft)
    }

    loadAttendance()

    return () => {
      cancelled = true
    }
  }, [roster, selectedAttendanceDate, selectedAttendanceSession?.id])

  const handleTabChange = (nextTab) => {
    setSearchParams(nextTab === 'alumnos' ? {} : { tab: nextTab }, { replace: true })
  }

  const handleChangeAttendanceDate = (date) => {
    setSelectedAttendanceDate(date)
    setAttendanceFeedback('')
  }

  const handleChangeAttendanceStatus = (studentId, status) => {
    setAttendanceDraft((current) => ({ ...current, [studentId]: status }))
  }

  const handleSaveAttendance = async () => {
    if (!selectedAttendanceDate) {
      setAttendanceFeedback('Selecciona una fecha para guardar asistencia.')
      return
    }

    setIsSavingAttendance(true)
    setAttendanceFeedback('')

    try {
      let session = selectedAttendanceSession

      if (!session) {
        const sessionResult = await createClassSession({
          institutionId,
          subjectId,
          programId,
          teacherId,
          sessionDate: selectedAttendanceDate,
          topic: '',
        })

        if (!sessionResult.success || !sessionResult.session?.id) {
          setAttendanceFeedback(sessionResult.error || 'No se pudo crear la clase para esa fecha.')
          return
        }

        session = sessionResult.session
      }

      const records = roster.map((student) => ({
        studentId: student.studentId,
        subjectEnrollmentId: student.enrollmentId,
        status: normalizeAttendanceStatus(attendanceDraft[student.studentId]),
      }))

      const result = await saveAttendanceForSession({
        sessionId: session.id,
        institutionId,
        records,
      })

      if (result.success) {
        await queryClient.invalidateQueries({ queryKey: ['subject-sessions', institutionId, subjectId, programId, teacherId] })
        await queryClient.invalidateQueries({ queryKey: ['subject-attendance-records', institutionId, subjectId, programId, teacherId] })
      }

      setAttendanceFeedback(result.success ? 'Asistencia guardada.' : (result.error || 'No se pudo guardar la asistencia.'))
    } catch (error) {
      setAttendanceFeedback(error instanceof Error ? error.message : 'No se pudo guardar la asistencia.')
    } finally {
      setIsSavingAttendance(false)
    }
  }

  const handleConfirmGrades = async (rows) => {
    setIsSavingGrades(true)
    setGradesFeedback('')

    try {
      for (const row of rows) {
        const result = await upsertStudentGrade({
          institutionId,
          studentId: row.studentId,
          studentRecordId: row.studentRecordId,
          subjectEnrollmentId: row.subjectEnrollmentId,
          subjectId,
          programId,
          teacherId,
          gradeType: row.slot.gradeType,
          attemptNumber: row.slot.attemptNumber,
          gradeValue: row.gradeValue,
          academicStatus: row.academicStatus,
          lockVersion: row.lockVersion,
        })

        if (!result.success) {
          setGradesFeedback(result.error || 'No se pudieron guardar las notas.')
          return { success: false, error: result.error }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['subject-grades', institutionId, subjectId, programId] })
      setGradesFeedback('Notas confirmadas. El alumno ya puede ver la informacion en su portal.')
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron guardar las notas.'
      setGradesFeedback(message)
      return { success: false, error: message }
    } finally {
      setIsSavingGrades(false)
    }
  }

  const handleRemoveStudent = async (student, currentPassword) => {
    setIsRemovingStudent(true)
    try {
      const result = await removeStudentFromTeacherSubject({
        institutionId,
        studentId: student.studentId,
        subjectId,
        programId,
        currentPassword,
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['subject-roster', institutionId, subjectId, programId] }),
        queryClient.invalidateQueries({ queryKey: ['subject-grades', institutionId, subjectId, programId] }),
        queryClient.invalidateQueries({ queryKey: ['subject-attendance-records', institutionId, subjectId, programId] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-subject-rosters'] }),
        queryClient.invalidateQueries({ queryKey: ['student-portal'] }),
      ])

      return result
    } finally {
      setIsRemovingStudent(false)
    }
  }

  const handleResetStudentRecords = async (student, currentPassword) => {
    setIsResettingStudentRecords(true)
    setGradesFeedback('')
    setAttendanceFeedback('')

    try {
      const result = await resetStudentSubjectAcademicRecords({
        institutionId,
        studentId: student.studentId,
        subjectId,
        programId,
        currentPassword,
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['subject-grades', institutionId, subjectId, programId] }),
        queryClient.invalidateQueries({ queryKey: ['subject-attendance-records', institutionId, subjectId, programId, teacherId] }),
        queryClient.invalidateQueries({ queryKey: ['student-portal'] }),
      ])

      const message = `Registros de ${student.fullName} reiniciados.`
      setGradesFeedback(message)
      setAttendanceFeedback(message)
      return result
    } finally {
      setIsResettingStudentRecords(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/app/materias" className="inline-flex items-center gap-2 text-sm font-extrabold text-teal-700 hover:text-teal-900">
        <ArrowLeft className="h-4 w-4" />
        Volver a mis materias
      </Link>

      <Section
        title={subjectDisplay.nombre || subjectId || 'Materia'}
        icon={BookOpenCheck}
        action={<span className="text-xs font-bold uppercase text-slate-500">{subjectDisplay.carrera || programId}</span>}
      >
        <DetailTabs activeTab={activeTab} onChange={handleTabChange} />

        <div className="mt-4">
          {activeTab === 'alumnos' && (
            <AlumnosTab
              roster={roster}
              grades={grades}
              sessions={sessions}
              attendanceRecords={attendanceRecords}
              onRemoveStudent={handleRemoveStudent}
              onResetStudentRecords={handleResetStudentRecords}
              isRemovingStudent={isRemovingStudent}
              isResettingStudentRecords={isResettingStudentRecords}
              canResetStudentRecords={!usesFallbackRoster}
            />
          )}
          {activeTab === 'asistencia' && (
            <AsistenciaTab
              roster={roster}
              canPersistRecords={!usesFallbackRoster}
              selectedDate={selectedAttendanceDate}
              onChangeDate={handleChangeAttendanceDate}
              attendanceDraft={attendanceDraft}
              onChangeStatus={handleChangeAttendanceStatus}
              onSaveAttendance={handleSaveAttendance}
              isSaving={isSavingAttendance}
              isLoadingSession={sessionsQuery.isLoading}
              feedback={attendanceFeedback}
              hasExistingSession={Boolean(selectedAttendanceSession)}
            />
          )}
          {activeTab === 'notas' && (
            <NotasTab
              roster={roster}
              grades={grades}
              onConfirmGrades={handleConfirmGrades}
              feedback={gradesFeedback}
              canPersistRecords={!usesFallbackRoster}
              isSaving={isSavingGrades}
            />
          )}
        </div>
      </Section>
    </div>
  )
}
