import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  BookOpenCheck,
  Building2,
  CalendarDays,
  Database,
  Download,
  GraduationCap,
  TriangleAlert,
  School,
  UsersRound,
} from 'lucide-react'
import {
  buildAdminInstitutionOverview,
  buildInstitutionScheduleRows,
  buildInstitutionScheduleTimetableGroups,
} from './adminInstitutionOverview.js'
import {
  exportarHorariosCursadaXlsx,
  imprimirHorarioCursada,
} from '../../utils/examEngine/scheduleExports.js'

function clean(value) {
  return String(value ?? '').trim()
}

function formatInstitutionStatus(status) {
  if (!status) return 'Sin estado'
  return status === 'active' ? 'Activa' : status
}

function InstitutionMetric({ icon: Icon, label, value, helper, tone = 'metric-card--blue' }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-sm text-slate-600">{helper}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0 text-slate-500" />
      </div>
    </article>
  )
}

function uniqueValues(rows = [], field) {
  const values = new Map()

  rows.forEach((row) => {
    const value = clean(row[field])
    if (!value || values.has(value.toLowerCase())) return
    values.set(value.toLowerCase(), value)
  })

  return Array.from(values.values())
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base', numeric: true }))
}

function formatYearLabel(year) {
  return year === 'Sin anio' ? year : `${year} ano`
}

function formatYearHeading(year) {
  const cleanYear = clean(year)
  if (!cleanYear || cleanYear === 'Sin anio') return 'SIN ANIO'
  return `${cleanYear} ANO`
}

function slugifyFilePart(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'horario'
}

export function ScheduleTimetableCell({ rows = [] }) {
  if (rows.length === 0) return <span className="text-xs font-semibold text-slate-300">-</span>

  return (
    <div className="flex min-h-16 min-w-0 flex-col justify-center gap-1.5">
      {rows.map((row) => (
        <div key={row.key} className="mx-auto min-w-0 p-1 text-center">
          <p className="break-words text-[11px] font-extrabold uppercase leading-tight text-slate-950 [overflow-wrap:anywhere] sm:text-xs lg:text-sm">{row.materia}</p>
          <p className="mt-1 break-words text-[10px] font-semibold leading-tight text-slate-700 [overflow-wrap:anywhere] sm:text-xs">Prof. {row.docente}</p>
          {row.aula && row.aula !== '-' && (
            <p className="mt-1 break-words text-[9px] font-bold uppercase leading-tight text-teal-700 [overflow-wrap:anywhere] sm:text-[10px]">Aula {row.aula}</p>
          )}
        </div>
      ))}
    </div>
  )
}

export function ScheduleTimetablePanel({ group, institutionName, onDownload, onPrint }) {
  return (
    <section className="border-t border-slate-200 pt-5" aria-label={`Horario ${group.carrera} ${group.anio}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-teal-700">{group.carrera}</p>
          <h5 className="mt-1 text-xl font-extrabold text-slate-950">{formatYearLabel(group.anio)}</h5>
          <p className="mt-1 text-sm font-semibold text-slate-500">{institutionName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="status-chip border-blue-200 bg-blue-50 text-blue-900">{group.rows.length} bloques</span>
          <button type="button" className="btn-secondary" onClick={() => onDownload(group)}>
            <Download className="h-4 w-4" />
            Descargar
          </button>
          <button type="button" className="btn-secondary" onClick={() => onPrint(group)}>
            Imprimir
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border-2 border-blue-800 bg-blue-800">
        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-center text-sm">
          <colgroup>
            <col className="w-[12%]" />
            {group.slots.map((slot) => (
              <col key={slot.key} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border border-blue-800 bg-blue-300 px-1 py-4 text-base font-extrabold leading-tight text-slate-950 [overflow-wrap:anywhere] sm:px-2 sm:text-lg lg:text-xl">
                {formatYearHeading(group.anio)}
              </th>
              {group.slots.map((slot) => (
                <th key={slot.key} className="break-words border border-blue-800 bg-blue-300 px-1 py-4 text-[9px] font-extrabold leading-tight text-slate-950 [overflow-wrap:anywhere] sm:text-[10px] lg:text-xs">
                  {slot.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.gridRows.map((day) => (
              <tr key={day.key}>
                <th className="break-words border border-blue-800 bg-blue-300 px-1 py-4 text-[11px] font-extrabold uppercase leading-tight text-slate-950 [overflow-wrap:anywhere] sm:px-2 sm:text-sm lg:text-base">
                  {day.label}
                </th>
                {day.cells.map((cell) => (
                  <td
                    key={cell.key}
                    colSpan={cell.colSpan}
                    className={`min-w-0 border border-blue-800 px-1 py-2 align-middle sm:px-1.5 lg:px-2 ${
                      cell.rows.length > 0 ? 'bg-white' : 'bg-slate-50'
                    }`}
                  >
                    <ScheduleTimetableCell rows={cell.rows} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function InstitutionAdminOverview({
  activeInstitution,
  alumnos = [],
  cargaHorariaDocente = [],
  careerOptions = [],
  docenteMateria = [],
  docentes = [],
  horariosDocentes = [],
  planesEstudio = [],
  teacherDirectory = [],
  useRemoteWorkspace = false,
}) {
  const [scheduleCareerFilter, setScheduleCareerFilter] = useState('')
  const [scheduleYearFilter, setScheduleYearFilter] = useState('')
  const overview = useMemo(() => buildAdminInstitutionOverview({
    alumnos,
    cargaHorariaDocente,
    careerOptions,
    docenteMateria,
    docentes,
    horariosDocentes,
    planesEstudio,
    teacherDirectory,
  }), [
    alumnos,
    cargaHorariaDocente,
    careerOptions,
    docenteMateria,
    docentes,
    horariosDocentes,
    planesEstudio,
    teacherDirectory,
  ])
  const scheduleRows = useMemo(() => buildInstitutionScheduleRows({
    horariosDocentes,
    planesEstudio,
  }), [
    horariosDocentes,
    planesEstudio,
  ])
  const scheduleCareerOptions = useMemo(() => uniqueValues(scheduleRows, 'carrera'), [scheduleRows])
  const scheduleYearOptions = useMemo(() => uniqueValues(
    scheduleCareerFilter
      ? scheduleRows.filter((row) => row.carrera === scheduleCareerFilter)
      : [],
    'anio',
  ), [scheduleCareerFilter, scheduleRows])
  const effectiveScheduleYearFilter = scheduleYearOptions.includes(scheduleYearFilter) ? scheduleYearFilter : ''
  const hasScheduleCareerSelection = Boolean(scheduleCareerFilter)
  const filteredScheduleRows = useMemo(() => {
    if (!scheduleCareerFilter) return []

    return scheduleRows.filter((row) => (
      row.carrera === scheduleCareerFilter &&
      (!effectiveScheduleYearFilter || row.anio === effectiveScheduleYearFilter)
    ))
  }, [effectiveScheduleYearFilter, scheduleCareerFilter, scheduleRows])
  const scheduleGroups = useMemo(
    () => buildInstitutionScheduleTimetableGroups(filteredScheduleRows),
    [filteredScheduleRows],
  )
  const institutionName = activeInstitution?.name ?? 'Sin institucion asignada'
  const institutionMeta = activeInstitution
    ? [
        clean(activeInstitution.slug),
        activeInstitution.plan_type ? `Plan ${activeInstitution.plan_type}` : '',
        formatInstitutionStatus(activeInstitution.status),
      ].filter(Boolean).join(' - ')
    : 'Workspace principal'
  const hasQualityNotes = (
    overview.quality.careersWithoutTeachers.length > 0 ||
    overview.quality.teachersWithoutCareer > 0 ||
    overview.quality.studentsWithoutCareer > 0
  )

  async function downloadFilteredSchedules() {
    if (!hasScheduleCareerSelection) {
      toast.error('Selecciona una carrera para descargar su horario.')
      return
    }

    if (filteredScheduleRows.length === 0) {
      toast.error('No hay horarios para descargar con esa seleccion.')
      return
    }

    try {
      const result = await exportarHorariosCursadaXlsx(filteredScheduleRows, {
        filename: 'horarios_cursada_visibles.xlsx',
        groups: scheduleGroups,
      })
      toast.success(`Horarios descargados: ${result.rows} bloques.`)
    } catch (error) {
      toast.error(error.message || 'No se pudieron descargar los horarios.')
    }
  }

  async function downloadScheduleGroup(group) {
    try {
      const filename = `horario_${slugifyFilePart(group.carrera)}_${slugifyFilePart(group.anio)}.xlsx`
      const result = await exportarHorariosCursadaXlsx(group.rows, {
        filename,
        groups: [group],
      })
      toast.success(`Horario descargado: ${result.rows} bloques.`)
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar el horario.')
    }
  }

  function printScheduleGroup(group) {
    try {
      imprimirHorarioCursada(group, {
        title: `${institutionName} - ${group.carrera} - ${formatYearLabel(group.anio)}`,
      })
    } catch (error) {
      toast.error(error.message || 'No se pudo imprimir el horario.')
    }
  }

  return (
    <section className="rise-in space-y-5" aria-label="Inicio del panel administrativo">
      <article className="soft-card workspace-gradient-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="soft-title">Datos de la institucion</p>
            <h4 className="mt-2 text-2xl font-extrabold text-slate-950">{institutionName}</h4>
            <p className="mt-2 text-sm font-semibold text-slate-600">{institutionMeta || 'Workspace principal'}</p>
          </div>
          <Building2 className="hidden h-6 w-6 shrink-0 text-sky-700 sm:block" />
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Modo</dt>
            <dd className="mt-1 text-sm font-bold text-slate-900">
              {useRemoteWorkspace ? 'Remoto por institucion' : 'Local por institucion'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Rol</dt>
            <dd className="mt-1 text-sm font-bold text-slate-900">{activeInstitution?.role ?? 'Sin rol'}</dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Horarios docentes</dt>
            <dd className="mt-1 text-sm font-bold text-slate-900">{overview.totals.schedules} bloques</dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Estado</dt>
            <dd className="mt-1 text-sm font-bold text-slate-900">
              {formatInstitutionStatus(activeInstitution?.status)}
            </dd>
          </div>
        </dl>
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InstitutionMetric
          icon={School}
          label="Carreras"
          value={overview.totals.careers}
          helper="Con datos cargados"
          tone="metric-card--cyan"
        />
        <InstitutionMetric
          icon={GraduationCap}
          label="Docentes"
          value={overview.totals.teachers}
          helper="Docentes unicos del padron"
          tone="metric-card--teal"
        />
        <InstitutionMetric
          icon={UsersRound}
          label="Alumnos"
          value={overview.totals.students}
          helper="Registros del padron"
          tone="metric-card--blue"
        />
        <InstitutionMetric
          icon={BookOpenCheck}
          label="Materias"
          value={overview.totals.subjects}
          helper="En planes de estudio"
          tone="metric-card--lime"
        />
      </div>

      <section className="space-y-4">
        <article className="soft-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="soft-title">Horarios</p>
              <div className="mt-2 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 shrink-0 text-teal-700" />
                <h4 className="text-2xl font-extrabold text-slate-950">Horarios por carrera y anio</h4>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[560px]">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Carrera</span>
                <select
                  className="input-base mt-2"
                  value={scheduleCareerFilter}
                  onChange={(event) => {
                    setScheduleCareerFilter(event.target.value)
                    setScheduleYearFilter('')
                  }}
                >
                  <option value="">Todas las carreras</option>
                  {scheduleCareerOptions.map((career) => (
                    <option key={career} value={career}>{career}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Anio</span>
                <select
                  className="input-base mt-2"
                  value={effectiveScheduleYearFilter}
                  onChange={(event) => setScheduleYearFilter(event.target.value)}
                  disabled={!hasScheduleCareerSelection}
                >
                  <option value="">Todos los anios</option>
                  {scheduleYearOptions.map((year) => (
                    <option key={year} value={year}>{formatYearLabel(year)}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="status-chip border-teal-200 bg-teal-50 text-teal-900">
              {hasScheduleCareerSelection
                ? `${filteredScheduleRows.length} de ${scheduleRows.length} bloques`
                : `${scheduleRows.length} bloques`}
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={downloadFilteredSchedules}
              disabled={!hasScheduleCareerSelection || filteredScheduleRows.length === 0}
            >
              <Download className="h-4 w-4" />
              Descargar visibles
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {!hasScheduleCareerSelection && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm font-semibold text-slate-600">
                Selecciona una carrera para ver su horario en grilla.
              </div>
            )}

            {scheduleGroups.map((group) => (
              <ScheduleTimetablePanel
                group={group}
                institutionName={institutionName}
                key={group.key}
                onDownload={downloadScheduleGroup}
                onPrint={printScheduleGroup}
              />
            ))}

            {hasScheduleCareerSelection && scheduleGroups.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm font-semibold text-slate-500">
                No hay horarios cargados para esa seleccion.
              </div>
            )}
          </div>
        </article>

        <article className="soft-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="soft-title">Distribucion por carrera</p>
              <h4 className="mt-2 text-2xl font-extrabold text-slate-950">Alumnos y docentes</h4>
            </div>
            <span className="status-chip border-sky-200 bg-sky-50 text-sky-900">
              {overview.careerRows.length} filas
            </span>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead>
                <tr className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-3">Carrera</th>
                  <th className="px-3 py-3 text-right">Docentes</th>
                  <th className="px-3 py-3 text-right">Alumnos</th>
                  <th className="px-3 py-3 text-right">Materias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.careerRows.map((row) => (
                  <tr key={row.key}>
                    <td className="max-w-[320px] break-words px-3 py-3 font-bold text-slate-950">{row.career}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-700">{row.teacherCount}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-700">{row.studentCount}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-700">{row.subjectCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {overview.careerRows.length === 0 && (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-600">
              <Database className="mb-3 h-5 w-5 text-slate-400" />
              Todavia no hay carreras cargadas en el workspace.
            </div>
          )}
        </article>

        {hasQualityNotes && (
          <article className="soft-card soft-card--tint-amber border-l-4 border-l-amber-500">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-amber-700">Datos a revisar</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {overview.quality.careersWithoutTeachers.length > 0
                    ? `Carreras sin docentes asignados: ${overview.quality.careersWithoutTeachers.join(', ')}. `
                    : ''}
                  {overview.quality.teachersWithoutCareer > 0
                    ? `${overview.quality.teachersWithoutCareer} docentes no tienen carrera asignada en el padron o no pudieron cruzarse con horarios. `
                    : ''}
                  {overview.quality.studentsWithoutCareer > 0
                    ? `${overview.quality.studentsWithoutCareer} alumnos no tienen carrera asignada.`
                    : ''}
                </p>
              </div>
            </div>
          </article>
        )}
      </section>
    </section>
  )
}

export default InstitutionAdminOverview
