import { lazy, Suspense, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Printer,
  Save,
  UsersRound,
  X,
  XCircle,
} from 'lucide-react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import AppFooter from '../../components/AppFooter.jsx'
import ProductBrand from '../../components/ProductBrand.jsx'
import SubjectDetailView from './pages/SubjectDetailView.jsx'
import SubjectsView from './pages/SubjectsView.jsx'
import { buildSubjectDisplayIndex, buildSubjectKey, fetchTeacherSubjects } from './services/teacherSubjects.js'
import { confirmTeacherExamAssignment, fetchTeacherExamAssignments } from './services/teacherExamAssignments.js'
import {
  buildTeacherScheduleGrids,
  buildTeacherWeeklyOverviewGrid,
  downloadWeeklySummaryPdf,
  imprimirResumenSemanal,
} from './services/teacherScheduleGrid.js'
import { isTeacherCourseRosterInternalPreviewEnabled } from '../../features/teacherCourseRoster/teacherCourseRosterPreviewAccess.js'
import {
  fetchTeacherPortalData,
} from './services/teacherPortalData.js'
import { fetchTeacherSubjectRosters } from './services/subjectRoster.js'
import { updateTeacherProfile, validateTeacherProfile } from './services/teacherProfile.js'
import { buildTeacherReassignmentOptions } from '../../features/exams/teacherReassignmentOptions.js'
import {
  buildSubjectGroupsFromSubjects,
  mergeSubjectGroupsWithRosters,
  mergeSubjectsWithRosters,
  mergeTeacherSubjects,
} from './services/teacherSubjectCards.js'

const EMPTY_ARRAY = []

const TeacherCourseRosterInternalPreview = import.meta.env.DEV
  ? lazy(() => import('../../features/teacherCourseRoster/TeacherCourseRosterInternalPreview.jsx'))
  : null

const baseNavItems = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/mesas', label: 'Mesas', icon: CalendarDays },
  { to: '/app/materias', label: 'Materias', icon: BookOpenCheck },
]

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeStatusToken(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '')
}

const CONFIRMED_EXAM_STATUS_TOKENS = new Set([
  'aprobada',
  'aprobado',
  'confirmed',
  'confirmada',
  'confirmado',
  'final',
  'finalconfirmed',
  'finalconfirmedminimum',
  'finalizada',
  'finalizado',
  'oficial',
  'oficializada',
  'oficializado',
  'published',
  'publishedtostudents',
  'publicada',
  'publicado',
  'tribunalcomplete',
  'tribunalcompleto',
  'tribunalminimum',
  'tribunalminimo',
])

function getDisplayExamStatus(exam) {
  const rawStatus = clean(exam?.estado || exam?.status || exam?.publication_status || exam?.estadoFinal)
  const status = normalizeStatusToken(rawStatus)
  if (CONFIRMED_EXAM_STATUS_TOKENS.has(status)) return 'confirmada'
  if (status) return rawStatus
  if (exam?.confirmada === false || exam?.confirmed === false || exam?.isOfficial === false) return 'pendiente'
  return 'confirmada'
}

function normalizeExamDatePart(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  }

  const rawDate = clean(value)
  if (!rawDate) return ''
  if (rawDate.includes('T')) return rawDate

  const isoDate = rawDate.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (isoDate) {
    const [, year, month, day] = isoDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const displayDate = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (displayDate) {
    const [, day, month, year] = displayDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return rawDate
}

function getExamDate(exam) {
  return normalizeExamDatePart(exam?.fechaIso || exam?.fecha_iso || exam?.exam_date || exam?.date || exam?.fechaSugerida || exam?.fecha) || null
}

function getExamSubject(exam) {
  return exam?.nombreMateria || exam?.materiaMesa || exam?.subject_name || exam?.materia || exam?.materiaId || exam?.subject?.name || 'Mesa de examen'
}

function getScheduleSubject(schedule) {
  return schedule?.nombreMateria || schedule?.subject_name || schedule?.materia || 'Materia'
}

function formatDate(dateString) {
  if (!dateString) return 'Sin fecha'

  // dateString es una fecha calendario sin hora ("2026-08-03"), que
  // new Date() parsea como medianoche UTC. Sin timeZone: 'UTC' aca,
  // Intl.DateTimeFormat la vuelve a interpretar en el huso horario local
  // del navegador y en husos negativos (America/Argentina) muestra el dia
  // anterior.
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateString))
}

function dayOrder(value) {
  const order = {
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
    domingo: 7,
  }

  return order[normalizeText(value)] ?? 99
}

function getScheduleDedupKey(schedule) {
  return [
    schedule?.dia || schedule?.day,
    schedule?.inicio || schedule?.desde || schedule?.start,
    schedule?.fin || schedule?.hasta || schedule?.end,
    schedule?.materiaCodigo || schedule?.materia_codigo || schedule?.materia || schedule?.subject_code || schedule?.subject_id,
    schedule?.carrera || schedule?.programa || schedule?.program || schedule?.program_id || schedule?.career,
    schedule?.aula || schedule?.classroom || schedule?.location,
  ].map((value) => normalizeText(value)).join('::')
}

function buildSchedulesFromSubjects(subjects = EMPTY_ARRAY) {
  const schedulesByKey = new Map()

  subjects.forEach((subject) => {
    ;(subject.schedules ?? EMPTY_ARRAY).forEach((schedule) => {
      const normalizedSchedule = {
        ...schedule,
        subjectId: clean(schedule.subjectId || subject.subjectId),
        programId: clean(schedule.programId || subject.programId),
        anio: clean(schedule.anio || subject.anio),
        carrera: clean(schedule.carrera || subject.carrera || subject.programId),
        materia: clean(schedule.materia || schedule.materiaCodigo || subject.subjectId),
        materiaCodigo: clean(schedule.materiaCodigo || schedule.materia_codigo || schedule.materia || subject.subjectId),
        nombreMateria: clean(schedule.nombreMateria || schedule.subject_name || subject.nombre || subject.subjectId),
        subject_name: clean(schedule.subject_name || schedule.nombreMateria || subject.nombre || subject.subjectId),
      }
      const key = getScheduleDedupKey(normalizedSchedule)
      if (key) schedulesByKey.set(key, normalizedSchedule)
    })
  })

  return Array.from(schedulesByKey.values()).sort((a, b) => (
    dayOrder(a.dia) - dayOrder(b.dia) ||
    clean(a.inicio).localeCompare(clean(b.inicio)) ||
    clean(getScheduleSubject(a)).localeCompare(clean(getScheduleSubject(b)), 'es', { sensitivity: 'base' })
  ))
}

export function Section({ title, icon: Icon, action, children }) {
  return (
    <section className="teacher-section rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="teacher-section__header flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-950">
          {Icon && <Icon className="h-4 w-4 text-teal-700" />}
          {title}
        </h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function EmptyBlock({ children }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
      {children}
    </div>
  )
}

function formatHours(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0 h'
  return `${number.toFixed(number % 1 === 0 ? 0 : 1)} h`
}

function StatCard({ label, value, helper, icon: Icon, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-950',
    teal: 'border-teal-200 bg-teal-50 text-teal-900',
    lime: 'border-lime-200 bg-lime-50 text-lime-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone]

  return (
    <article className={`teacher-stat-card rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-current" />}
      </div>
      <p className="mt-3 text-3xl font-extrabold">{value}</p>
      {helper && <p className="mt-1 text-sm text-slate-600">{helper}</p>}
    </article>
  )
}

function formatScheduleYearLabel(anio) {
  const value = clean(anio)
  if (!value) return ''
  return /^\d+$/.test(value) ? `${value}° Año` : value
}

const SCHEDULE_GRID_TONES = [
  {
    accent: 'teacher-schedule-grid--teal',
    border: 'border-teal-200',
    headerCell: 'bg-teal-50 text-teal-700',
    occupiedCell: 'bg-teal-50',
    occupiedText: 'text-teal-900',
  },
  {
    accent: 'teacher-schedule-grid--emerald',
    border: 'border-emerald-200',
    headerCell: 'bg-emerald-50 text-emerald-700',
    occupiedCell: 'bg-emerald-50',
    occupiedText: 'text-emerald-900',
  },
  {
    accent: 'teacher-schedule-grid--lime',
    border: 'border-lime-200',
    headerCell: 'bg-lime-50 text-lime-700',
    occupiedCell: 'bg-lime-50',
    occupiedText: 'text-lime-900',
  },
]

function TeacherScheduleGrid({ group, tone = 0 }) {
  const palette = SCHEDULE_GRID_TONES[tone % SCHEDULE_GRID_TONES.length]

  return (
    <article className={`teacher-schedule-grid rounded-lg border bg-white shadow-sm ${palette.accent} ${palette.border}`}>
      <header className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-bold uppercase text-slate-500">{group.carrera || 'Carrera sin especificar'}</p>
        <h3 className="mt-1 text-lg font-extrabold text-slate-950">{group.nombreMateria}</h3>
      </header>
      <div className="table-wrap m-4 border-0 shadow-none">
        <table className="w-full min-w-[480px] table-fixed border-separate border-spacing-0 text-center text-sm">
          <colgroup>
            <col className="w-28" />
            {group.slots.map((slot) => <col key={slot.key} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={`border-b border-slate-200 px-2 py-3 text-xs font-extrabold uppercase ${palette.headerCell}`}>Dia</th>
              {group.slots.map((slot) => (
                <th key={slot.key} className={`border-b border-slate-200 px-2 py-3 text-[11px] font-extrabold ${palette.headerCell}`}>
                  {slot.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.gridRows.map((day) => (
              <tr key={day.key}>
                <th className={`border-b border-slate-100 px-2 py-3 text-xs font-extrabold uppercase ${palette.headerCell}`}>
                  {day.label}
                </th>
                {day.cells.map((cell) => {
                  const row = cell.rows[0]
                  return (
                    <td
                      key={cell.key}
                      colSpan={cell.colSpan}
                      className={`border-b border-slate-100 px-2 py-3 align-middle ${row ? palette.occupiedCell : ''}`}
                    >
                      {row ? (
                        <span className={`text-xs font-extrabold ${palette.occupiedText}`}>
                          {formatScheduleYearLabel(row.anio)}
                          {row.aula && row.aula !== '-' ? ` · Aula ${row.aula}` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function TeacherWeeklyOverviewTable({ grid }) {
  const hasContent = grid.gridRows.some((day) => day.cells.some((cell) => cell.rows.length > 0))

  if (!hasContent) {
    return <EmptyBlock>No hay horarios cargados para este docente.</EmptyBlock>
  }

  return (
    <div className="table-wrap">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-center text-sm">
        <colgroup>
          <col className="w-28" />
          {grid.slots.map((slot) => <col key={slot.key} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="border-b border-slate-200 bg-teal-50 px-2 py-3 text-xs font-extrabold uppercase text-teal-700">Dia</th>
            {grid.slots.map((slot) => (
              <th key={slot.key} className="border-b border-slate-200 bg-teal-50 px-2 py-3 text-[11px] font-extrabold text-teal-700">
                {slot.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.gridRows.map((day) => (
            <tr key={day.key}>
              <th className="border-b border-slate-100 bg-teal-50 px-2 py-3 text-xs font-extrabold uppercase text-teal-700">
                {day.label}
              </th>
              {day.cells.map((cell) => {
                const row = cell.rows[0]
                return (
                  <td key={cell.key} colSpan={cell.colSpan} className="border-b border-slate-100 px-2 py-3 align-middle">
                    {row ? (
                      <div>
                        <p className="text-[11px] font-extrabold uppercase text-slate-950">{row.nombreMateria || row.materia}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase text-teal-700">
                          {[row.carrera, formatScheduleYearLabel(row.anio)].filter(Boolean).join(' · ')}
                        </p>
                        {row.aula && row.aula !== '-' && (
                          <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Aula {row.aula}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WeeklyScheduleSummaryModal({ isOpen, onClose, schedules }) {
  if (!isOpen) return null

  const overviewGrid = buildTeacherWeeklyOverviewGrid(schedules)
  const hasContent = overviewGrid.gridRows.some((day) => day.cells.some((cell) => cell.rows.length > 0))

  function handlePrint() {
    try {
      imprimirResumenSemanal(overviewGrid)
    } catch (error) {
      toast.error(error?.message || 'No se pudo abrir la ventana de impresion.')
    }
  }

  async function handleDownloadPdf() {
    try {
      await downloadWeeklySummaryPdf(overviewGrid)
      toast.success('Resumen semanal descargado en PDF.')
    } catch (error) {
      toast.error(error?.message === 'WEEKLY_SUMMARY_EMPTY'
        ? 'No hay horarios cargados para armar el resumen.'
        : 'No se pudo descargar el PDF.')
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <section
        className="modal-surface panel w-full max-w-7xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-summary-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="soft-title">Mi horario semanal</p>
            <h2 id="weekly-summary-title" className="mt-1 text-2xl font-extrabold text-slate-950">Resumen semanal</h2>
            <p className="mt-2 text-sm text-slate-600">Un horario general con todas tus materias, listo para imprimir o descargar.</p>
          </div>
          <button className="btn-secondary h-10 w-10 p-0" type="button" aria-label="Cerrar" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="mt-5 max-h-[65vh] overflow-y-auto pr-1">
          <TeacherWeeklyOverviewTable grid={overviewGrid} />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onClose}>Cerrar</button>
          <button className="btn-secondary" disabled={!hasContent} onClick={handlePrint} type="button">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button className="btn-primary" disabled={!hasContent} onClick={handleDownloadPdf} type="button">
            <Download className="h-4 w-4" />
            Descargar PDF
          </button>
        </div>
      </section>
    </div>
  )
}

export function DashboardView({ data }) {
  const schedules = data?.schedules ?? EMPTY_ARRAY
  const scheduleGrids = buildTeacherScheduleGrids(schedules)
  const stats = data?.stats ?? {}
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Horas semanales" value={formatHours(stats.weeklyHours)} helper={`${stats.scheduleBlocks ?? 0} bloques cargados`} icon={Clock3} tone="teal" />
        <StatCard label="Materias" value={stats.subjects ?? 0} helper={`${stats.careers ?? 0} carreras vinculadas`} icon={BookOpenCheck} tone="lime" />
        <StatCard label="Mesas" value={stats.exams ?? 0} helper={`${stats.confirmedExams ?? 0} confirmadas`} icon={CalendarDays} tone="amber" />
        <StatCard label="Alumnos" value={stats.subjectStudents ?? stats.students ?? 0} helper="Cursando materias del docente" icon={UsersRound} tone="emerald" />
      </section>

      <Section
        title="Mi horario semanal"
        icon={Clock3}
        action={(
          <button className="btn-secondary" onClick={() => setIsSummaryOpen(true)} type="button">
            <Download className="h-4 w-4" />
            Resumen semanal
          </button>
        )}
      >
        {scheduleGrids.length > 0 ? (
          <div className="space-y-6">
            {scheduleGrids.map((group, index) => (
              <TeacherScheduleGrid key={`${group.subjectKey}:${group.key}`} group={group} tone={index} />
            ))}
          </div>
        ) : (
          <EmptyBlock>No hay horarios cargados para este docente.</EmptyBlock>
        )}

        <WeeklyScheduleSummaryModal
          isOpen={isSummaryOpen}
          onClose={() => setIsSummaryOpen(false)}
          schedules={schedules}
        />
      </Section>
    </div>
  )
}

const EXAM_ROLE_LABELS = {
  TITULAR: 'Titular',
  VOCAL_1: 'Vocal 1',
  VOCAL_2: 'Vocal 2',
  VOCAL_EXTERNO: 'Vocal externo',
  TRIBUNAL_CRUZADO: 'Tribunal cruzado',
}

const CONFIRMATION_LABELS = {
  pending: 'Pendiente de tu confirmacion',
  confirmed: 'Confirmada',
  objected: 'Objetada',
}

const CONFIRMATION_BADGE_CLASSES = {
  pending: 'bg-amber-50 text-amber-900 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  objected: 'bg-rose-50 text-rose-900 ring-rose-200',
}

function ExamAssignmentConfirmationCard({ assignment, institutionId, onConfirmed, reassignmentOptions = EMPTY_ARRAY }) {
  const [notes, setNotes] = useState(assignment.teacher_notes ?? '')
  const [selectedOptionKey, setSelectedOptionKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const metadata = assignment.metadata ?? {}

  async function handleDecision(confirmationStatus) {
    const reassignmentOption = reassignmentOptions.find((option) => (
      `${option.targetExamTableId}:${option.targetRole}` === selectedOptionKey
    )) ?? null

    if (confirmationStatus === 'objected' && reassignmentOptions.length > 0 && !reassignmentOption) {
      toast.error('Selecciona una fecha alternativa para solicitar el cambio.')
      return
    }

    setIsSubmitting(true)
    const result = await confirmTeacherExamAssignment({
      institutionId,
      examTableId: assignment.exam_table_id,
      confirmationStatus,
      teacherNotes: notes,
      ...(reassignmentOption ? { reassignmentOption } : {}),
    })
    setIsSubmitting(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    const automaticReassignment = result.data?.automatic_reassignment === true
    toast.success(
      confirmationStatus === 'confirmed'
        ? 'Mesa confirmada.'
        : automaticReassignment
          ? `Cambio realizado automaticamente para el ${formatDate(result.data?.target_date)}.`
          : 'Objecion registrada. El cambio queda pendiente de revision administrativa.',
    )
    onConfirmed?.()
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">{metadata.carrera || 'Carrera'}</p>
          <h3 className="mt-2 text-lg font-bold text-slate-950">{metadata.materia || 'Mesa de examen'}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {formatDate(metadata.fecha)} &middot; Tu rol: {EXAM_ROLE_LABELS[assignment.role] ?? assignment.role}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ring-1 ${CONFIRMATION_BADGE_CLASSES[assignment.confirmation_status] ?? ''}`}>
          {CONFIRMATION_LABELS[assignment.confirmation_status] ?? assignment.confirmation_status}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-600">
        <p><strong className="text-slate-900">Titular:</strong> {metadata.titular || '-'}</p>
        <p><strong className="text-slate-900">Vocales:</strong> {[metadata.vocal1, metadata.vocal2].filter(Boolean).join(' / ') || '-'}</p>
      </div>
      <label className="mt-4 block text-xs font-bold text-slate-600">
        Observacion (opcional)
        <textarea
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900"
          disabled={isSubmitting}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Ej: no puedo esa fecha, prefiero otro horario, etc."
          rows={2}
          value={notes}
        />
      </label>
      {reassignmentOptions.length > 0 && (
        <label className="mt-4 block text-xs font-bold text-slate-600">
          Fecha alternativa para la reubicacion
          <select
            aria-label={`Fecha alternativa para ${metadata.materia || 'mesa de examen'}`}
            className="input-base mt-1"
            disabled={isSubmitting}
            onChange={(event) => setSelectedOptionKey(event.target.value)}
            value={selectedOptionKey}
          >
            <option value="">Seleccionar una mesa disponible</option>
            {reassignmentOptions.map((option) => (
              <option key={`${option.targetExamTableId}:${option.targetRole}`} value={`${option.targetExamTableId}:${option.targetRole}`}>
                {formatDate(option.fecha)} · {option.inicio || 'Horario a confirmar'} · {option.materia} · {EXAM_ROLE_LABELS[option.targetRole]}{option.requiresSwap ? ' · requiere intercambio' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {assignment.reassignment_status === 'requested' && (
        <p className="mt-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-900">
          Cambio solicitado para el {formatDate(assignment.requested_date)}. Pendiente de revision administrativa.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={isSubmitting} onClick={() => handleDecision('confirmed')} type="button">
          <CheckCircle2 className="h-4 w-4" />
          Confirmar
        </button>
        <button className="btn-secondary" disabled={isSubmitting} onClick={() => handleDecision('objected')} type="button">
          <XCircle className="h-4 w-4" />
          Objetar
        </button>
      </div>
    </article>
  )
}

export function ExamsView({ data, examAssignments = EMPTY_ARRAY, institutionId, onRefetchExamAssignments }) {
  const exams = data?.exams ?? EMPTY_ARRAY
  const snapshot = data?.workspaceSnapshot ?? {}
  const teacherIdentity = data?.currentTeacher?.raw ?? {}
  const teacherAvailability = (snapshot.disponibilidadDocente ?? []).filter((row) => {
    const currentIds = [teacherIdentity.id, teacherIdentity.record_id, data?.currentTeacher?.record_id].map(clean).filter(Boolean)
    const rowIds = [row.id, row.docenteId, row.docente_id, row.teacher_record_id].map(clean).filter(Boolean)
    const currentNames = [teacherIdentity.full_name, teacherIdentity.nombre, data?.currentTeacher?.full_name].map(normalizeText).filter(Boolean)
    const rowNames = [row.docente, row.nombre, row.teacher_name, row.teacher_display_name].map(normalizeText).filter(Boolean)
    return rowIds.some((id) => currentIds.includes(id)) || rowNames.some((name) => currentNames.includes(name))
  })
  const teacherForAvailability = {
    ...teacherIdentity,
    availability: teacherAvailability,
  }

  return (
    <div className="space-y-6">
      <Section title="Precronograma en revision" icon={CalendarDays}>
        {examAssignments.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {examAssignments.map((assignment) => {
              const calculatedOptions = buildTeacherReassignmentOptions({
                objectedAssignment: assignment,
                mesas: snapshot.cronograma ?? EMPTY_ARRAY,
                teacher: teacherForAvailability,
                teacherAssignments: examAssignments,
              })
              const publishedOptions = Array.isArray(assignment.metadata?.reassignment_options)
                ? assignment.metadata.reassignment_options
                : EMPTY_ARRAY
              return (
              <ExamAssignmentConfirmationCard
                key={assignment.id}
                assignment={assignment}
                institutionId={institutionId}
                onConfirmed={onRefetchExamAssignments}
                reassignmentOptions={calculatedOptions.length ? calculatedOptions : publishedOptions}
              />
              )
            })}
          </div>
        ) : (
          <EmptyBlock>No hay mesas publicadas para tu revision por el momento.</EmptyBlock>
        )}
      </Section>

      <Section title="Mesas asignadas" icon={CalendarDays}>
        {exams.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {exams.map((exam) => (
              <article key={exam.id ?? `${getExamSubject(exam)}-${getExamDate(exam)}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">{exam.carrera || 'Carrera'}</p>
                    <h3 className="mt-2 text-lg font-bold text-slate-950">{getExamSubject(exam)}</h3>
                    <p className="mt-1 text-sm text-slate-600">{formatDate(getExamDate(exam))} | {exam.inicio || exam.hora || 'Horario a definir'}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                    {getDisplayExamStatus(exam)}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <p><strong className="text-slate-900">Titular:</strong> {exam.profesorTitular || exam.titular || '-'}</p>
                  <p><strong className="text-slate-900">Vocales:</strong> {[exam.vocal1 || exam.primerVocal, exam.vocal2 || exam.segundoVocal].filter(Boolean).join(' / ') || '-'}</p>
                  <p><strong className="text-slate-900">Aula:</strong> {exam.aula || exam.location || '-'}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyBlock>No hay mesas asignadas para este docente.</EmptyBlock>
        )}
      </Section>
    </div>
  )
}

function TeacherPortalLayout({ data, examAssignments, onRefetchExamAssignments, subjects, subjectsLoading }) {
  const { user, isRemoteSession, isSuperAdmin, signOutRemote } = useAuth()
  const queryClient = useQueryClient()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ email: '', telefono: '' })
  const teacherName = data?.currentTeacher?.full_name || user?.nombre || 'Docente'
  const teacherEmail = data?.currentTeacher?.email || user?.email || ''
  const teacherPhone = data?.currentTeacher?.telefono || ''
  const courseRosterPreviewEnabled = import.meta.env.DEV && isTeacherCourseRosterInternalPreviewEnabled()
  const navItems = courseRosterPreviewEnabled
    ? [...baseNavItems, { to: '/app/docente/cursadas-preview', label: 'Mis materias', icon: BookOpenCheck }]
    : baseNavItems

  const openProfile = () => {
    setProfileForm({ email: teacherEmail, telefono: teacherPhone })
    setIsProfileOpen(true)
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    setIsSavingProfile(true)
    try {
      const profile = validateTeacherProfile(profileForm)
      await updateTeacherProfile({
        institutionId: data?.currentInstitution?.id,
        profile,
        useRemote: isRemoteSession,
      })
      await queryClient.invalidateQueries({ queryKey: ['teacher-portal'] })
      toast.success(profile.email !== teacherEmail
        ? 'Informacion actualizada. Tu proximo ingreso sera con el nuevo email.'
        : 'Informacion actualizada.')
      setIsProfileOpen(false)
    } catch (error) {
      toast.error(error?.message || 'No se pudo actualizar tu informacion.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  return (
    <div className="teacher-portal app-shell">
      <header className="teacher-portal-hero compact-hero rise-in">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <ProductBrand />
              <span className="status-chip border-teal-200 bg-teal-50 text-teal-900">
                <GraduationCap className="h-4 w-4 text-teal-700" />
                Portal docente
              </span>
            </div>

            <div>
              <h1 className="text-3xl font-extrabold leading-tight text-slate-950 md:text-4xl">
                {teacherName}
              </h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm leading-6 text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-teal-700" />
                  <strong>Institución:</strong> {data?.currentInstitution?.name || 'Falta cargar'}
                </span>
                <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-teal-700" /><strong>Email:</strong> {teacherEmail || 'Falta cargar'}</span>
                <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4 text-teal-700" /><strong>Teléfono:</strong> {teacherPhone || 'Falta cargar'}</span>
              </p>
            </div>
          </section>

          <nav className="teacher-portal-nav mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-4">
              {navItems.map((item) => {
                const Icon = item.icon

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => [
                      'teacher-portal-nav__item inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-extrabold transition',
                      isActive
                        ? 'teacher-portal-nav__item--active border-teal-700 bg-teal-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:text-slate-950',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                )
              })}
            <button className="teacher-profile-button inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-extrabold" type="button" onClick={openProfile}>
              <Pencil className="h-4 w-4" />
              Mi informacion
            </button>

            {isRemoteSession && (
              <button className="teacher-signout-button ml-auto inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-extrabold text-red-700" type="button" onClick={signOutRemote}>
                <LogOut className="h-4 w-4" />
                Cerrar sesion
              </button>
            )}
          </nav>
      </header>

      {isProfileOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={() => !isSavingProfile && setIsProfileOpen(false)}>
          <section className="modal-surface panel w-full max-w-lg" role="dialog" aria-modal="true" aria-labelledby="teacher-profile-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="soft-title">Perfil docente</p>
                <h2 id="teacher-profile-title" className="mt-1 text-2xl font-extrabold text-slate-950">Mi informacion</h2>
                <p className="mt-2 text-sm text-slate-600">Estos datos se guardan en tu registro institucional.</p>
              </div>
              <button className="btn-secondary h-10 w-10 p-0" type="button" aria-label="Cerrar" disabled={isSavingProfile} onClick={() => setIsProfileOpen(false)}><X className="h-4 w-4" /></button>
            </header>
            <form className="mt-5 space-y-4" onSubmit={saveProfile}>
              <label className="block text-sm font-bold text-slate-700">
                Email de acceso
                <span className="mt-2 flex items-center gap-2"><Mail className="h-4 w-4 text-teal-700" /><input className="input-base" type="email" required value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} /></span>
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Telefono
                <span className="mt-2 flex items-center gap-2"><Phone className="h-4 w-4 text-teal-700" /><input className="input-base" type="tel" maxLength={40} value={profileForm.telefono} onChange={(event) => setProfileForm((current) => ({ ...current, telefono: event.target.value }))} /></span>
              </label>
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Si cambias el email, el próximo inicio de sesión será con la nueva dirección.</p>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <button className="btn-secondary" type="button" disabled={isSavingProfile} onClick={() => setIsProfileOpen(false)}>Cancelar</button>
                <button className="btn-primary" type="submit" disabled={isSavingProfile}><Save className="h-4 w-4" />{isSavingProfile ? 'Guardando...' : 'Guardar cambios'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {!data?.currentTeacher?.matched && (
        <section className="teacher-portal-alert rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            No se encontro una coincidencia exacta entre tu usuario y el padron docente. Por seguridad, no se muestran datos de otros docentes.
          </p>
        </section>
      )}

      <div className="teacher-portal-content flex-1">
        <Routes>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardView data={data} />} />
          <Route
            path="mesas"
            element={(
              <ExamsView
                data={data}
                examAssignments={examAssignments}
                institutionId={data?.currentInstitution?.id}
                onRefetchExamAssignments={onRefetchExamAssignments}
              />
            )}
          />
          <Route path="materias" element={<SubjectsView subjects={subjects} isLoading={subjectsLoading} />} />
          <Route
            path="materias/:subjectKey"
            element={(
              <SubjectDetailView
                fallbackSubjectStudentGroups={data?.subjectStudentGroups}
                institutionId={data?.currentInstitution?.id}
                teacherId={user?.id}
                planesEstudio={data?.plans}
              />
            )}
          />
          {courseRosterPreviewEnabled && TeacherCourseRosterInternalPreview && (
            <Route
              path="cursadas-preview"
              element={(
                <Suspense fallback={null}>
                  <TeacherCourseRosterInternalPreview
                    detectedRole={user?.accountRole ?? user?.role}
                    hasAuthenticatedSession={isRemoteSession}
                    institutionId={data?.currentInstitution?.id}
                    isSuperAdmin={isSuperAdmin}
                    mode="teacher"
                    user={user}
                  />
                </Suspense>
              )}
            />
          )}
          <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
        </Routes>
      </div>

      <AppFooter />
    </div>
  )
}

export default function TeacherPortalModule() {
  const { user, isRemoteSession, isSuperAdmin, activeInstitution } = useAuth()
  const queryKey = useMemo(
    () => ['teacher-portal', user?.id, user?.email, isRemoteSession, isSuperAdmin, activeInstitution?.id],
    [user?.id, user?.email, isRemoteSession, isSuperAdmin, activeInstitution?.id],
  )
  const { data, error, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchTeacherPortalData({ user, isRemoteSession, isSuperAdmin, activeInstitution }),
    enabled: Boolean(user),
    staleTime: 1000 * 30,
  })
  const subjectsQuery = useQuery({
    queryKey: ['teacher-subjects', user?.id, activeInstitution?.id],
    queryFn: () => fetchTeacherSubjects({ institutionId: activeInstitution.id, teacherUserId: user.id }),
    enabled: Boolean(user?.id && activeInstitution?.id),
    staleTime: 1000 * 30,
  })
  const examAssignmentsQuery = useQuery({
    queryKey: ['teacher-exam-assignments', user?.id, activeInstitution?.id],
    queryFn: () => fetchTeacherExamAssignments({ institutionId: activeInstitution.id, teacherUserId: user.id }),
    enabled: Boolean(user?.id && activeInstitution?.id),
    staleTime: 1000 * 30,
  })
  const subjectRostersQuery = useQuery({
    queryKey: ['teacher-subject-rosters', user?.id, data?.currentInstitution?.id],
    queryFn: () => fetchTeacherSubjectRosters({ institutionId: data.currentInstitution.id }),
    enabled: Boolean(user?.id && data?.currentInstitution?.id),
    staleTime: 0,
    refetchInterval: 1000 * 10,
    refetchOnMount: 'always',
  })
  const subjectDisplayIndex = useMemo(
    () => buildSubjectDisplayIndex(data?.plans ?? EMPTY_ARRAY),
    [data?.plans],
  )
  const enrichedSubjects = useMemo(() => (
    (subjectsQuery.data ?? EMPTY_ARRAY).map((assignment) => {
      const subjectId = clean(assignment.subject_id)
      const programId = clean(assignment.program_id)
      const display = subjectDisplayIndex.get(buildSubjectKey(subjectId, programId)) ?? {}
      const today = new Date().toISOString().slice(0, 10)
      const startsOn = clean(assignment.metadata?.leave_starts_on)
      const endsOn = clean(assignment.metadata?.leave_ends_on)
      const leaveIsCurrent = (!startsOn || startsOn <= today) && (!endsOn || today <= endsOn)

      if (assignment.source === 'teacher_leave_replacement' && !leaveIsCurrent) return null

      return {
        id: assignment.id,
        subjectId,
        programId,
        nombre: display.nombre || subjectId,
        carrera: display.carrera || programId,
        anio: display.anio || '',
        role: assignment.role === 'licencia' && !leaveIsCurrent
          ? (assignment.metadata?.original_role || 'titular')
          : (assignment.role || ''),
        assignmentSource: assignment.source || '',
        leave: assignment.metadata || null,
      }
    }).filter(Boolean)
  ), [subjectsQuery.data, subjectDisplayIndex])
  const subjectRosters = subjectRostersQuery.data ?? EMPTY_ARRAY
  const subjectGroupsWithRosters = useMemo(() => (
    mergeSubjectGroupsWithRosters(
      data?.subjectStudentGroups ?? EMPTY_ARRAY,
      subjectRosters,
      { authoritative: subjectRostersQuery.isSuccess || subjectRostersQuery.isFetching },
    )
  ), [data?.subjectStudentGroups, subjectRosters, subjectRostersQuery.isFetching, subjectRostersQuery.isSuccess])
  const visibleSubjects = useMemo(() => {
    const mergedSubjects = mergeTeacherSubjects({
      assignedSubjects: enrichedSubjects,
      subjectGroups: subjectGroupsWithRosters,
    })

    return mergeSubjectsWithRosters(mergedSubjects, subjectRosters)
  }, [enrichedSubjects, subjectGroupsWithRosters, subjectRosters])
  const displaySubjectGroups = useMemo(
    () => buildSubjectGroupsFromSubjects(visibleSubjects),
    [visibleSubjects],
  )
  const displaySchedules = useMemo(
    () => buildSchedulesFromSubjects(visibleSubjects),
    [visibleSubjects],
  )
  const dataWithSubjectRosters = useMemo(() => {
    if (!data) return data

    return {
      ...data,
      schedules: displaySchedules,
      subjectStudentGroups: displaySubjectGroups,
    }
  }, [data, displaySchedules, displaySubjectGroups])

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-4 md:p-6">
        <section className="panel w-full max-w-md text-center">
          <span className="soft-title">Institutional Hub</span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Cargando portal docente</h1>
          <p className="mt-3 text-sm text-slate-600">Estamos preparando horarios, mesas y carreras vinculadas.</p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-4 md:p-6">
        <section className="panel w-full max-w-md text-center">
          <span className="soft-title">Institutional Hub</span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Error al cargar portal docente</h1>
          <p className="mt-3 text-sm text-slate-600">{error.message || 'No se pudo cargar el portal docente.'}</p>
        </section>
      </main>
    )
  }

  return (
    <TeacherPortalLayout
      data={dataWithSubjectRosters}
      examAssignments={examAssignmentsQuery.data ?? EMPTY_ARRAY}
      onRefetchExamAssignments={examAssignmentsQuery.refetch}
      subjects={visibleSubjects}
      subjectsLoading={(subjectsQuery.isLoading || subjectRostersQuery.isLoading) && visibleSubjects.length === 0}
    />
  )
}
