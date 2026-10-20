import { useMemo, useState } from 'react'
import { Lock, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  EXAM_RESULT_LABELS,
  buildActaDraft,
  previewActaRow,
  saveExamActaResults,
  summarizeActa,
  validateActaRow,
} from '../../services/examActaResults.js'

const RESULT_CLASS = { approved: 'text-emerald-700', failed: 'text-rose-700', absent: 'text-slate-500' }

// F1a: carga del acta de examen final. La usa el titular (portal docente) y secretaria (Mesas y actas).
// Abierta: se edita y se cierra. Cerrada: solo secretaria corrige, con motivo. La base valida todo.
function ExamActaEditor({ institutionId, workspaceKey = 'main', examKey, roster, isStaff = false, onSaved }) {
  const alumnos = useMemo(() => roster?.alumnos ?? [], [roster])
  const initialRows = useMemo(() => buildActaDraft(alumnos), [alumnos])
  const [rows, setRows] = useState(initialRows)
  const [saving, setSaving] = useState('')
  const [reason, setReason] = useState('')
  const closed = Boolean(roster?.actaCerrada)
  const editable = closed ? isStaff : Boolean(roster?.puedeCargarNotas)
  const summary = summarizeActa(rows)
  const names = new Map(alumnos.map((alumno) => [String(alumno.inscripcion_id), alumno]))

  function updateRow(index, patch) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  async function save({ close = false } = {}) {
    if (close && !window.confirm(`Cerrar el acta: ${summary.aprobados} aprobados, ${summary.desaprobados} desaprobados y ${summary.ausentes} ausentes. Despues solo secretaria puede corregirla. ¿Confirmas?`)) return
    // Solo viajan las filas que cambiaron: una correccion de secretaria no marca como corregida toda el acta.
    const changed = rows.filter((row, index) => JSON.stringify(row) !== JSON.stringify(initialRows[index]))
    if (!changed.length && !close) {
      toast('No hay cambios para guardar.')
      return
    }
    setSaving(close ? 'close' : 'save')
    try {
      const result = await saveExamActaResults({ institutionId, workspaceKey, examKey, rows: changed, close, reason: closed ? reason : '' })
      toast.success(result.actaCerrada && close ? 'Acta cerrada.' : 'Acta guardada.')
      setReason('')
      onSaved?.(result)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving('')
    }
  }

  if (!alumnos.length) return <p className="mt-3 text-sm text-slate-500">Todavía no hay alumnos inscriptos.</p>

  return (
    <div className="mt-3 space-y-3">
      {closed && (
        <p className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <Lock className="h-4 w-4" />
          Acta cerrada.{isStaff ? ' Para corregir una nota escribi el motivo y guarda.' : ' Si hay un error, avisale a secretaria.'}
        </p>
      )}
      {!closed && !roster?.puedeCargarNotas && (
        <p className="text-sm text-slate-600">Las notas se cargan desde el día del examen.</p>
      )}
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Alumno</th>
              <th className="px-3 py-2">DNI</th>
              <th className="px-3 py-2">Escrito</th>
              <th className="px-3 py-2">Oral</th>
              <th className="px-3 py-2">Nota final</th>
              <th className="px-3 py-2">Ausente</th>
              <th className="px-3 py-2">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const alumno = names.get(row.inscripcion_id) ?? {}
              const preview = previewActaRow(row)
              const error = validateActaRow(row)
              const gradeInput = (field, label) => (
                <input
                  aria-label={`${label} de ${alumno.nombre || 'alumno'}`}
                  className="input-base w-20 py-1"
                  disabled={!editable || row.ausente}
                  inputMode="decimal"
                  onChange={(event) => updateRow(index, { [field]: event.target.value })}
                  value={row[field]}
                />
              )
              return (
                <tr key={row.inscripcion_id || index} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{alumno.nombre || '-'}</td>
                  <td className="px-3 py-2 text-slate-700">{alumno.dni || '-'}</td>
                  <td className="px-3 py-2">{gradeInput('escrito', 'Escrito')}</td>
                  <td className="px-3 py-2">{gradeInput('oral', 'Oral')}</td>
                  <td className="px-3 py-2">{gradeInput('nota', 'Nota final')}</td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Ausente: ${alumno.nombre || 'alumno'}`}
                      checked={row.ausente}
                      disabled={!editable}
                      onChange={(event) => updateRow(index, event.target.checked ? { ausente: true, escrito: '', oral: '', nota: '' } : { ausente: false })}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {error
                      ? <span className="text-xs font-bold text-rose-700">{error}</span>
                      : <span className={`font-bold ${RESULT_CLASS[preview.result] ?? 'text-slate-400'}`}>
                          {preview.result ? `${EXAM_RESULT_LABELS[preview.result]}${preview.final !== null ? ` (${preview.final})` : ''}` : 'Sin cargar'}
                        </span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-600">
          {summary.total} inscriptos: {summary.aprobados} aprobados, {summary.desaprobados} desaprobados, {summary.ausentes} ausentes
          {summary.sinCargar ? `, ${summary.sinCargar} sin cargar` : ''}. Se aprueba con 4 o mas; sin nota final se toma el promedio de escrito y oral.
        </p>
      </div>
      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          {closed && (
            <label className="min-w-72 flex-1 text-sm font-bold text-slate-700">
              Motivo de la corrección
              <input className="input-base mt-1 w-full py-2" onChange={(event) => setReason(event.target.value)} value={reason} />
            </label>
          )}
          <button className="btn-secondary" disabled={Boolean(saving) || (closed && reason.trim().length < 5)} onClick={() => save()} type="button">
            <Save className="h-4 w-4" />
            {saving === 'save' ? 'Guardando...' : closed ? 'Guardar corrección' : 'Guardar'}
          </button>
          {!closed && (
            <button className="btn-primary" disabled={Boolean(saving) || summary.sinCargar > 0} onClick={() => save({ close: true })} title={summary.sinCargar ? 'Carga a todos los inscriptos para cerrar' : ''} type="button">
              <Lock className="h-4 w-4" />
              {saving === 'close' ? 'Cerrando...' : 'Cerrar acta'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ExamActaEditor
