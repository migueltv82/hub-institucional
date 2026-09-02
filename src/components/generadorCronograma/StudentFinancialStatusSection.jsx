import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CircleDollarSign } from 'lucide-react'
import { fetchStudentRecords } from '../../services/rosterRecords.js'
import { fetchStudentFinancialStatus, upsertStudentFinancialStatus } from '../../services/studentFinancialStatus.js'

function StudentFinancialStatusSection({ institutionId, workspaceKey, useRemoteWorkspace }) {
  const [students, setStudents] = useState([])
  const [statusByRecordId, setStatusByRecordId] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [pendingRecordId, setPendingRecordId] = useState(null)

  const canManage = Boolean(institutionId && useRemoteWorkspace)

  useEffect(() => {
    if (!canManage) return

    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const [studentRows, statusRows] = await Promise.all([
          fetchStudentRecords({ institutionId, workspaceKey, useRemote: useRemoteWorkspace }),
          fetchStudentFinancialStatus({ institutionId, workspaceKey, useRemote: useRemoteWorkspace }),
        ])
        if (cancelled) return

        setStudents(studentRows)
        setStatusByRecordId(Object.fromEntries(statusRows.map((row) => [row.student_record_id, row.adeuda_cuota])))
      } catch (error) {
        if (!cancelled) toast.error(`No se pudo cargar el estado de pagos: ${error.message}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [canManage, institutionId, workspaceKey, useRemoteWorkspace])

  async function handleToggle(studentRecordId, nextValue) {
    setPendingRecordId(studentRecordId)
    try {
      await upsertStudentFinancialStatus({
        institutionId,
        workspaceKey,
        studentRecordId,
        adeudaCuota: nextValue,
        useRemote: useRemoteWorkspace,
      })
      setStatusByRecordId((prev) => ({ ...prev, [studentRecordId]: nextValue }))
    } catch (error) {
      toast.error(`No se pudo actualizar el estado: ${error.message}`)
    } finally {
      setPendingRecordId(null)
    }
  }

  if (!canManage) return null

  return (
    <section className="rise-in soft-card soft-card--tint-amber border-l-4 border-l-orange-500">
      <div>
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-orange-700">
          <CircleDollarSign className="h-4 w-4" />
          Estado de pagos
        </p>
        <h3 className="mt-2 text-xl font-extrabold text-slate-950">
          Adeuda cuota
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Marcado manual, sin integracion de pagos real. Un alumno marcado aca no puede inscribirse a mesas de examen
          hasta que se destilde.
        </p>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando padron...</p>
      ) : students.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No hay alumnos sincronizados todavia.</p>
      ) : (
        <div className="mt-4 max-h-96 overflow-y-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Alumno</th>
                <th className="px-3 py-2">Carrera</th>
                <th className="px-3 py-2 text-center">Adeuda cuota</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const adeudaCuota = Boolean(statusByRecordId[student.id])

                return (
                  <tr key={student.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-800">{student.full_name || student.email}</td>
                    <td className="px-3 py-2 text-slate-600">{student.career}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={adeudaCuota}
                        disabled={pendingRecordId === student.id}
                        onChange={(event) => handleToggle(student.id, event.target.checked)}
                        className="h-4 w-4 accent-orange-600"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default StudentFinancialStatusSection
