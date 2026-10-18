import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ClipboardCheck, Printer, RefreshCcw, UserPlus, X } from 'lucide-react'
import {
  canPrintActa,
  enrollStudentAsAdmin,
  fetchExamActaRoster,
  fetchExamTablesOverview,
  formatArgentinaTime,
  getArgentinaDateKey,
  groupMesasByCareerAndYear,
} from '../../services/examActas.js'
import { buildExamActasPdf, formatActaDate } from '../../utils/examActaPdf.js'

const EMPTY_ARRAY = []

function clean(value) {
  return String(value ?? '').trim()
}

function todayKey() {
  return getArgentinaDateKey(new Date().toISOString())
}

function tribunalLabel(tribunal = {}) {
  const vocales = [tribunal.vocal1, tribunal.vocal2].filter(Boolean).join(' / ')
  return [tribunal.titular && `Titular: ${tribunal.titular}`, vocales && `Vocales: ${vocales}`].filter(Boolean).join(' · ') || 'Tribunal sin datos'
}

function actaFileName(label) {
  return `actas-${label}.pdf`.replace(/[^a-z0-9.-]+/gi, '-').toLowerCase()
}

function SpecialEnrollmentDialog({ mesa, students, onClose, onConfirm, busy }) {
  const [studentRecordId, setStudentRecordId] = useState('')
  const [reason, setReason] = useState('')
  const [search, setSearch] = useState('')
  const careerStudents = useMemo(() => {
    const term = clean(search).toLowerCase()
    return (students ?? EMPTY_ARRAY)
      .filter((student) => clean(student.record_id) && clean(student.carrera) === clean(mesa.carrera))
      .filter((student) => !term || `${student.apellido} ${student.nombre} ${student.full_name} ${student.dni}`.toLowerCase().includes(term))
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
            <p className="soft-title">Inscripcion especial</p>
            <h3 className="mt-1 text-lg font-bold text-slate-950">{mesa.materia}</h3>
            <p className="text-sm text-slate-600">{mesa.carrera} · {formatActaDate(mesa.inicio)} {formatArgentinaTime(mesa.inicio)}</p>
          </div>
          <button aria-label="Cerrar" className="btn-secondary" onClick={onClose} type="button"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Inscribe fuera del plazo del portal (hasta el dia de la mesa). El alumno tiene que ser regular y cumplir las demas reglas; queda registrado quien lo inscribio y el motivo.
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
          <option value="">{careerStudents.length ? 'Elegi un alumno' : 'No hay alumnos de esta carrera'}</option>
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

function ExamActasPage({ institutionId, institutionName = '', workspaceKey = 'main', canManage = false, students = EMPTY_ARRAY }) {
  const [mesas, setMesas] = useState(EMPTY_ARRAY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateKey, setDateKey] = useState(todayKey)
  const [showAllDates, setShowAllDates] = useState(false)
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

  const visibleMesas = useMemo(
    () => (showAllDates ? mesas : mesas.filter((mesa) => getArgentinaDateKey(mesa.inicio) === dateKey)),
    [dateKey, mesas, showAllDates],
  )
  const groups = useMemo(() => groupMesasByCareerAndYear(visibleMesas), [visibleMesas])
  const printableMesas = visibleMesas.filter(canPrintActa)

  async function printActas(targetMesas, label) {
    const withStudents = targetMesas.filter(canPrintActa)
    if (!withStudents.length) {
      toast.error('No hay mesas con alumnos inscriptos: no se genera ningun acta.')
      return
    }
    setPrinting(label)
    try {
      const actas = []
      for (const mesa of withStudents) {
        const alumnos = await fetchExamActaRoster({ institutionId, workspaceKey, examKey: mesa.mesa_id })
        if (alumnos.length) actas.push({ mesa, alumnos })
      }
      if (!actas.length) {
        toast.error('Las mesas ya no tienen alumnos inscriptos: no se genera ningun acta.')
        return
      }
      const doc = await buildExamActasPdf({ institutionName, actas })
      doc.save(actaFileName(label))
      const skipped = targetMesas.length - actas.length
      toast.success(`${actas.length} ${actas.length === 1 ? 'acta generada' : 'actas generadas'}${skipped ? `; ${skipped} sin inscriptos no se imprimen` : ''}.`)
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

  return (
    <div className="min-w-0 space-y-6">
      <section className="rise-in admin-module-heading">
        <span className="soft-title">Modulo</span>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-3xl font-bold text-slate-950">
              <ClipboardCheck className="h-7 w-7 text-teal-700" />
              Mesas y actas
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Mesas publicadas por carrera y año. El acta volante se genera solo para mesas con alumnos inscriptos.
            </p>
          </div>
          <button className="btn-secondary" disabled={loading} onClick={reload} type="button">
            <RefreshCcw className="h-4 w-4" />
            Actualizar
          </button>
        </div>
      </section>

      <section className="soft-card flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-slate-800">
            Fecha de examen
            <input
              className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={showAllDates}
              onChange={(event) => setDateKey(event.target.value)}
              type="date"
              value={dateKey}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input checked={showAllDates} onChange={(event) => setShowAllDates(event.target.checked)} type="checkbox" />
            Ver todas las fechas
          </label>
        </div>
        <button
          className="btn-primary"
          disabled={!printableMesas.length || Boolean(printing)}
          onClick={() => void printActas(visibleMesas, showAllDates ? 'todas' : dateKey)}
          title={printableMesas.length ? '' : 'Ninguna mesa de esta seleccion tiene inscriptos'}
          type="button"
        >
          <Printer className="h-4 w-4" />
          {printing ? 'Generando...' : `Imprimir actas (${printableMesas.length})`}
        </button>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando mesas publicadas...</p>
      ) : error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : groups.length === 0 ? (
        <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
          {showAllDates ? 'Todavia no hay mesas publicadas.' : 'No hay mesas publicadas para esta fecha.'}
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
                  return (
                    <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between" key={mesa.mesa_id}>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-950">{mesa.materia} <span className="text-sm font-normal text-slate-500">{mesa.materia_codigo}</span></p>
                        <p className="text-sm text-slate-600">
                          {formatActaDate(mesa.inicio)} {formatArgentinaTime(mesa.inicio)} · {mesa.llamado || 'Llamado'} · Aula {mesa.aula || 'a confirmar'}
                        </p>
                        <p className="text-xs text-slate-500">{tribunalLabel(mesa.tribunal)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${printable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {mesa.inscriptos} {Number(mesa.inscriptos) === 1 ? 'inscripto' : 'inscriptos'}
                        </span>
                        <button
                          className="btn-secondary"
                          disabled={!printable || Boolean(printing)}
                          onClick={() => void printActas([mesa], `${mesa.materia_codigo}-${getArgentinaDateKey(mesa.inicio)}`)}
                          title={printable ? '' : 'Sin inscriptos: no se genera acta'}
                          type="button"
                        >
                          <Printer className="h-4 w-4" />
                          {printable ? 'Imprimir acta' : 'Sin acta'}
                        </button>
                        {canManage && (
                          <button className="btn-secondary" onClick={() => setEnrollMesa(mesa)} type="button">
                            <UserPlus className="h-4 w-4" />
                            Inscripcion especial
                          </button>
                        )}
                      </div>
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
