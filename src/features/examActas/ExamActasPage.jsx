import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, ClipboardCheck, Download, ImageUp, Printer, RefreshCcw, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import {
  canPrintActa,
  enrollStudentAsAdmin,
  fetchExamActaDetail,
  fetchExamActaRoster,
  fetchExamTablesOverview,
  formatArgentinaTime,
  formatRoomLabel,
  getArgentinaDateKey,
  groupMesasByCareerAndYear,
  shiftDateKey,
  summarizeExamDays,
  summarizeMesas,
} from '../../services/examActas.js'
import { buildExamActasPdf, formatActaDate } from '../../utils/examActaPdf.js'
import { EXAM_RESULT_LABELS } from '../../services/examActaResults.js'
import ExamActaEditor from './ExamActaEditor.jsx'
import { prepareLogoDataUrl, saveInstitutionLogo } from '../../services/institutionLogo.js'

const EMPTY_ARRAY = []
const ALL_CAREERS = ''

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function todayKey() {
  return getArgentinaDateKey(new Date().toISOString())
}

function formatDayLabel(dateKey) {
  const timestamp = Date.parse(`${dateKey}T12:00:00-03:00`)
  if (!Number.isFinite(timestamp)) return dateKey
  const label = new Date(timestamp).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatChipLabel(dateKey) {
  const timestamp = Date.parse(`${dateKey}T12:00:00-03:00`)
  if (!Number.isFinite(timestamp)) return dateKey
  return new Date(timestamp).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

function tribunalLabel(tribunal = {}) {
  const vocales = [tribunal.vocal1, tribunal.vocal2].filter(Boolean).join(' / ')
  return [tribunal.titular && `Titular: ${tribunal.titular}`, vocales && `Vocales: ${vocales}`].filter(Boolean).join(' · ') || 'Tribunal sin datos'
}

function actaFileName(label) {
  return `actas-${label}.pdf`.replace(/[^a-z0-9.-]+/gi, '-').toLowerCase()
}

function matchesSearch(mesa, term) {
  if (!term) return true
  const tribunal = mesa.tribunal ?? {}
  return normalize([mesa.materia, mesa.materia_codigo, tribunal.titular, tribunal.vocal1, tribunal.vocal2, mesa.aula].join(' ')).includes(term)
}

// Abre el PDF con el dialogo de impresion; si el navegador bloquea la ventana, lo descarga.
function openForPrinting(doc, fileName) {
  doc.autoPrint()
  const url = doc.output('bloburl')
  const opened = typeof window !== 'undefined' ? window.open(url, '_blank') : null
  if (!opened) {
    doc.save(fileName)
    return false
  }
  return true
}

function MesaRoster({ institutionId, workspaceKey, examKey }) {
  const [state, setState] = useState({ loading: true, error: '', detail: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let active = true
    fetchExamActaDetail({ institutionId, workspaceKey, examKey })
      .then((detail) => { if (active) setState({ loading: false, error: '', detail }) })
      .catch((error) => { if (active) setState({ loading: false, error: error.message, detail: null }) })
    return () => { active = false }
  }, [examKey, institutionId, workspaceKey, reloadKey])

  const alumnos = state.detail?.alumnos ?? EMPTY_ARRAY
  if (state.loading) return <p className="text-sm text-slate-500">Cargando inscriptos...</p>
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>
  if (!alumnos.length) return <p className="text-sm text-slate-500">No hay alumnos inscriptos.</p>
  const canEditActa = state.detail.puedeCargarNotas || state.detail.actaCerrada

  if (editing) {
    return (
      <div>
        <button className="btn-secondary" onClick={() => setEditing(false)} type="button">Volver a la lista</button>
        <ExamActaEditor
          examKey={examKey}
          institutionId={institutionId}
          isStaff
          key={reloadKey}
          onSaved={() => {
            setState((current) => ({ ...current, loading: true }))
            setReloadKey((value) => value + 1)
          }}
          roster={state.detail}
          workspaceKey={workspaceKey}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Nº</th>
              <th className="px-3 py-2">DNI</th>
              <th className="px-3 py-2">Apellido</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Inscripción</th>
              <th className="px-3 py-2">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((alumno, index) => (
              <tr className="border-t border-slate-100" key={`${alumno.dni}-${index}`}>
                <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                <td className="px-3 py-2">{alumno.dni || '-'}</td>
                <td className="px-3 py-2 font-semibold text-slate-900">{alumno.apellido || alumno.nombre || '-'}</td>
                <td className="px-3 py-2">{alumno.nombres || ''}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{alumno.inscripcion_especial ? 'Especial (admin)' : 'Portal'}</td>
                <td className="px-3 py-2 text-xs font-bold text-slate-700">
                  {alumno.resultado ? `${EXAM_RESULT_LABELS[alumno.resultado]}${alumno.nota !== null && alumno.nota !== undefined ? ` (${alumno.nota})` : ''}` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEditActa && (
        <button className="btn-secondary" onClick={() => setEditing(true)} type="button">
          {state.detail.actaCerrada ? 'Corregir acta (cerrada)' : 'Cargar notas'}
        </button>
      )}
    </div>
  )
}

function SpecialEnrollmentDialog({ mesa, students, onClose, onConfirm, busy }) {
  const [studentRecordId, setStudentRecordId] = useState('')
  const [reason, setReason] = useState('')
  const [search, setSearch] = useState('')
  const careerStudents = useMemo(() => {
    const term = normalize(search)
    return (students ?? EMPTY_ARRAY)
      .filter((student) => clean(student.record_id) && clean(student.carrera) === clean(mesa.carrera))
      .filter((student) => !term || normalize(`${student.apellido} ${student.nombre} ${student.full_name} ${student.dni}`).includes(term))
      .sort((a, b) => clean(a.apellido || a.full_name).localeCompare(clean(b.apellido || b.full_name), 'es'))
  }, [mesa.carrera, search, students])

  return (
    <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog">
      <form
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm({ studentRecordId, reason })
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="soft-title">Inscripción especial</p>
            <h3 className="mt-1 text-lg font-bold text-slate-950">{mesa.materia}</h3>
            <p className="text-sm text-slate-600">{mesa.carrera} · {formatActaDate(mesa.inicio)} {formatArgentinaTime(mesa.inicio)}</p>
          </div>
          <button aria-label="Cerrar" className="btn-secondary" onClick={onClose} type="button"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Inscribe fuera del plazo del portal (hasta el día de la mesa). El alumno tiene que ser regular y cumplir las demas reglas; queda registrado quien lo inscribio y el motivo.
        </p>
        <label className="mt-4 block text-sm font-semibold text-slate-800" htmlFor="special-enrollment-search">Buscar alumno</label>
        <input
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          id="special-enrollment-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Apellido, nombre o DNI"
          value={search}
        />
        <label className="mt-3 block text-sm font-semibold text-slate-800" htmlFor="special-enrollment-student">Alumno</label>
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          id="special-enrollment-student"
          onChange={(event) => setStudentRecordId(event.target.value)}
          required
          value={studentRecordId}
        >
          <option value="">{careerStudents.length ? 'Elegí un alumno' : 'No hay alumnos de esta carrera'}</option>
          {careerStudents.map((student) => (
            <option key={student.record_id} value={student.record_id}>
              {clean(student.apellido) ? `${student.apellido}, ${student.nombre}` : student.full_name} · DNI {student.dni || '-'}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-sm font-semibold text-slate-800" htmlFor="special-enrollment-reason">Motivo</label>
        <textarea
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          id="special-enrollment-reason"
          minLength={5}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Por ejemplo: pedido de la secretaria por certificado medico"
          required
          rows={2}
          value={reason}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} type="button">Cancelar</button>
          <button className="btn-primary" disabled={busy || !studentRecordId || clean(reason).length < 5} type="submit">
            <UserPlus className="h-4 w-4" />
            {busy ? 'Inscribiendo...' : 'Inscribir'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SummaryStat({ label, value, tone = 'text-slate-950' }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function InstitutionLogoCard({ institutionId, logo, canChange, onChange }) {
  const [saving, setSaving] = useState(false)

  async function save(nextLogo, message) {
    setSaving(true)
    try {
      onChange(await saveInstitutionLogo({ institutionId, logoDataUrl: nextLogo }))
      toast.success(message)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      await save(await prepareLogoDataUrl(file), 'Logo guardado: ya sale en las actas.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  if (!logo && !canChange) return null

  return (
    <section className="soft-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {logo ? (
          <img alt="Logo del colegio" className="h-14 max-w-[220px] object-contain" src={logo} />
        ) : (
          <div className="flex h-14 w-40 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-500">Sin logo</div>
        )}
        <div>
          <p className="text-sm font-bold text-slate-900">Logo del colegio</p>
          <p className="text-xs text-slate-600">{logo ? 'Sale en el encabezado de cada acta.' : 'Cargalo para que salga en el encabezado de las actas (PNG o JPG).'}</p>
        </div>
      </div>
      {canChange && (
        <div className="flex flex-wrap gap-2">
          <label className={`btn-secondary cursor-pointer ${saving ? 'pointer-events-none opacity-60' : ''}`}>
            <ImageUp className="h-4 w-4" />
            {saving ? 'Guardando...' : logo ? 'Cambiar logo' : 'Cargar logo'}
            <input accept="image/png,image/jpeg" aria-label="Archivo del logo" className="sr-only" disabled={saving} onChange={(event) => void handleFile(event)} type="file" />
          </label>
          {logo && (
            <button className="btn-secondary" disabled={saving} onClick={() => void save('', 'Logo quitado.')} type="button">
              <Trash2 className="h-4 w-4" />
              Quitar
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function ExamActasPage({
  institutionId,
  institutionName = '',
  institutionLogoUrl = '',
  workspaceKey = 'main',
  canManage = false,
  canChangeLogo = false,
  onLogoChange,
  students = EMPTY_ARRAY,
}) {
  const logo = institutionLogoUrl
  const [mesas, setMesas] = useState(EMPTY_ARRAY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateKey, setDateKey] = useState(todayKey)
  const [showAllDates, setShowAllDates] = useState(false)
  const [career, setCareer] = useState(ALL_CAREERS)
  const [search, setSearch] = useState('')
  const [openRoster, setOpenRoster] = useState('')
  const [printing, setPrinting] = useState('')
  const [enrollMesa, setEnrollMesa] = useState(null)
  const [enrolling, setEnrolling] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!institutionId) return undefined
    let active = true
    fetchExamTablesOverview({ institutionId, workspaceKey })
      .then((rows) => { if (active) { setMesas(rows); setError(''); setLoading(false) } })
      .catch((loadError) => { if (active) { setError(loadError.message); setLoading(false) } })
    return () => { active = false }
  }, [institutionId, workspaceKey, reloadToken])

  const reload = () => {
    setLoading(true)
    setReloadToken((token) => token + 1)
  }

  const examDays = useMemo(() => summarizeExamDays(mesas), [mesas])
  const upcomingDays = useMemo(() => {
    const today = todayKey()
    const upcoming = examDays.filter((day) => day.dateKey >= today)
    return (upcoming.length ? upcoming : examDays.slice(-8)).slice(0, 8)
  }, [examDays])
  const careers = useMemo(() => [...new Set(mesas.map((mesa) => clean(mesa.carrera)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [mesas])

  const dayMesas = useMemo(
    () => (showAllDates ? mesas : mesas.filter((mesa) => getArgentinaDateKey(mesa.inicio) === dateKey)),
    [dateKey, mesas, showAllDates],
  )
  const visibleMesas = useMemo(() => {
    const term = normalize(search)
    return dayMesas
      .filter((mesa) => !career || clean(mesa.carrera) === career)
      .filter((mesa) => matchesSearch(mesa, term))
  }, [career, dayMesas, search])
  const groups = useMemo(() => groupMesasByCareerAndYear(visibleMesas), [visibleMesas])
  const summary = summarizeMesas(visibleMesas)
  const selectionLabel = showAllDates ? 'todas' : dateKey

  async function buildActas(targetMesas) {
    const actas = []
    for (const mesa of targetMesas.filter(canPrintActa)) {
      const alumnos = await fetchExamActaRoster({ institutionId, workspaceKey, examKey: mesa.mesa_id })
      if (alumnos.length) actas.push({ mesa, alumnos })
    }
    return actas
  }

  async function outputActas(targetMesas, label, mode) {
    if (!targetMesas.some(canPrintActa)) {
      toast.error('No hay mesas con alumnos inscriptos: no se genera ningún acta.')
      return
    }
    setPrinting(label)
    try {
      const actas = await buildActas(targetMesas)
      if (!actas.length) {
        toast.error('Las mesas ya no tienen alumnos inscriptos: no se genera ningún acta.')
        return
      }
      const doc = await buildExamActasPdf({ institutionName, institutionLogo: logo, actas })
      const fileName = actaFileName(label)
      if (mode === 'download') doc.save(fileName)
      else if (!openForPrinting(doc, fileName)) toast.success('El navegador bloqueo la ventana de impresion: se descargo el PDF.')
      const skipped = targetMesas.length - actas.length
      toast.success(`${actas.length} ${actas.length === 1 ? 'acta' : 'actas'}${skipped ? `; ${skipped} ${skipped === 1 ? 'mesa sin inscriptos no se imprime' : 'mesas sin inscriptos no se imprimen'}` : ''}.`)
    } catch (printError) {
      toast.error(printError.message)
    } finally {
      setPrinting('')
    }
  }

  async function confirmSpecialEnrollment({ studentRecordId, reason }) {
    setEnrolling(true)
    try {
      await enrollStudentAsAdmin({ institutionId, workspaceKey, examKey: enrollMesa.mesa_id, studentRecordId, reason })
      toast.success('Alumno inscripto en la mesa.')
      setEnrollMesa(null)
      reload()
    } catch (enrollError) {
      toast.error(enrollError.message)
    } finally {
      setEnrolling(false)
    }
  }

  function selectDay(nextDateKey) {
    setShowAllDates(false)
    setDateKey(nextDateKey)
    setOpenRoster('')
  }

  return (
    <div className="min-w-0 space-y-6">
      <section className="rise-in admin-module-heading">
        <span className="soft-title">Módulo</span>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-3xl font-bold text-slate-950">
              <ClipboardCheck className="h-7 w-7 text-teal-700" />
              Mesas y actas
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Elegí el día, revisa las mesas por carrera y año, e imprimí las actas volantes. Las mesas sin alumnos inscriptos no generan acta.
            </p>
          </div>
          <button className="btn-secondary" disabled={loading} onClick={reload} type="button">
            <RefreshCcw className="h-4 w-4" />
            Actualizar
          </button>
        </div>
      </section>

      <InstitutionLogoCard canChange={canChangeLogo} institutionId={institutionId} logo={logo} onChange={(nextLogo) => onLogoChange?.(nextLogo)} />

      <section className="soft-card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <button aria-label="Día anterior" className="btn-secondary" disabled={showAllDates} onClick={() => selectDay(shiftDateKey(dateKey, -1))} type="button">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <label className="text-sm font-semibold text-slate-800">
              Fecha de examen
              <input
                className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={showAllDates}
                onChange={(event) => selectDay(event.target.value)}
                type="date"
                value={dateKey}
              />
            </label>
            <button aria-label="Día siguiente" className="btn-secondary" disabled={showAllDates} onClick={() => selectDay(shiftDateKey(dateKey, 1))} type="button">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="btn-secondary" onClick={() => selectDay(todayKey())} type="button">Hoy</button>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input checked={showAllDates} onChange={(event) => setShowAllDates(event.target.checked)} type="checkbox" />
              Ver todas las fechas
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={!summary.actas || Boolean(printing)}
              onClick={() => void outputActas(visibleMesas, selectionLabel, 'print')}
              title={summary.actas ? '' : 'Ninguna mesa de esta selección tiene inscriptos'}
              type="button"
            >
              <Printer className="h-4 w-4" />
              {printing === selectionLabel ? 'Generando...' : `Imprimir actas (${summary.actas})`}
            </button>
            <button
              className="btn-secondary"
              disabled={!summary.actas || Boolean(printing)}
              onClick={() => void outputActas(visibleMesas, selectionLabel, 'download')}
              type="button"
            >
              <Download className="h-4 w-4" />
              Descargar PDF
            </button>
          </div>
        </div>

        {upcomingDays.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Fechas con mesas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {upcomingDays.map((day) => {
                const selected = !showAllDates && day.dateKey === dateKey
                return (
                  <button
                    aria-pressed={selected}
                    className={`rounded-md border px-3 py-2 text-left text-xs ${selected ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                    key={day.dateKey}
                    onClick={() => selectDay(day.dateKey)}
                    type="button"
                  >
                    <span className="block font-bold capitalize">{formatChipLabel(day.dateKey)}</span>
                    <span>{day.mesas} {day.mesas === 1 ? 'mesa' : 'mesas'} · {day.actas} {day.actas === 1 ? 'acta' : 'actas'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="text-sm font-semibold text-slate-800">
            Carrera
            <select className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setCareer(event.target.value)} value={career}>
              <option value={ALL_CAREERS}>Todas las carreras</option>
              {careers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="flex-1 text-sm font-semibold text-slate-800">
            Buscar
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Materia, código, docente o aula"
              value={search}
            />
          </label>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700">{showAllDates ? 'Todas las fechas' : formatDayLabel(dateKey)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryStat label="Mesas" value={summary.mesas} />
            <SummaryStat label="Actas a imprimir" tone="text-teal-700" value={summary.actas} />
            <SummaryStat label="Sin inscriptos" tone="text-slate-500" value={summary.sinInscriptos} />
            <SummaryStat label="Alumnos" value={summary.alumnos} />
          </div>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando mesas publicadas...</p>
      ) : error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : groups.length === 0 ? (
        <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
          {mesas.length === 0 ? 'Todavía no hay mesas publicadas.' : 'No hay mesas para esta selección.'}
        </p>
      ) : (
        groups.map((group) => (
          <section className="soft-card space-y-4" key={group.carrera}>
            <h4 className="text-xl font-bold text-slate-950">{group.carrera}</h4>
            {group.anios.map((yearGroup) => (
              <div className="space-y-2" key={`${group.carrera}-${yearGroup.anio}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {yearGroup.anio ? `${yearGroup.anio}º año` : 'Año sin definir'}
                </p>
                {yearGroup.mesas.map((mesa) => {
                  const printable = canPrintActa(mesa)
                  const rosterOpen = openRoster === mesa.mesa_id
                  const label = `${mesa.materia_codigo}-${getArgentinaDateKey(mesa.inicio)}`
                  return (
                    <article className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" key={mesa.mesa_id}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-950">{mesa.materia} <span className="text-sm font-normal text-slate-500">{mesa.materia_codigo}</span></p>
                          <p className="text-sm text-slate-600">
                            {formatActaDate(mesa.inicio)} {formatArgentinaTime(mesa.inicio)} · {mesa.llamado || 'Llamado'} · {formatRoomLabel(mesa.aula)}
                          </p>
                          <p className="text-xs text-slate-500">{tribunalLabel(mesa.tribunal)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-bold ${printable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {mesa.inscriptos} {Number(mesa.inscriptos) === 1 ? 'inscripto' : 'inscriptos'}
                          </span>
                          {printable && (
                            <button aria-expanded={rosterOpen} className="btn-secondary" onClick={() => setOpenRoster(rosterOpen ? '' : mesa.mesa_id)} type="button">
                              <UsersRound className="h-4 w-4" />
                              {rosterOpen ? 'Ocultar inscriptos' : 'Ver inscriptos'}
                            </button>
                          )}
                          <button
                            className="btn-secondary"
                            disabled={!printable || Boolean(printing)}
                            onClick={() => void outputActas([mesa], label, 'print')}
                            title={printable ? '' : 'Sin inscriptos: no se genera acta'}
                            type="button"
                          >
                            <Printer className="h-4 w-4" />
                            {printing === label ? 'Generando...' : printable ? 'Imprimir acta' : 'Sin acta'}
                          </button>
                          {canManage && (
                            <button className="btn-secondary" onClick={() => setEnrollMesa(mesa)} type="button">
                              <UserPlus className="h-4 w-4" />
                              Inscripción especial
                            </button>
                          )}
                        </div>
                      </div>
                      {rosterOpen && <MesaRoster examKey={mesa.mesa_id} institutionId={institutionId} workspaceKey={workspaceKey} />}
                    </article>
                  )
                })}
              </div>
            ))}
          </section>
        ))
      )}

      {enrollMesa && (
        <SpecialEnrollmentDialog
          busy={enrolling}
          mesa={enrollMesa}
          onClose={() => setEnrollMesa(null)}
          onConfirm={(payload) => void confirmSpecialEnrollment(payload)}
          students={students}
        />
      )}
    </div>
  )
}

export default ExamActasPage
