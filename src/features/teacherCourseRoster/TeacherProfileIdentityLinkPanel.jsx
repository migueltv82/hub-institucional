import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import {
  getTeacherProfileLinkCandidates,
  linkTeacherRecordProfile,
} from '../../services/teacherProfileIdentityService.js'

export default function TeacherProfileIdentityLinkPanel({
  institutionId,
  onLinked,
  loadCandidates = getTeacherProfileLinkCandidates,
  linkIdentity = linkTeacherRecordProfile,
}) {
  const [data, setData] = useState(null)
  const [teacherRecordId, setTeacherRecordId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [reason, setReason] = useState('Vinculo administrativo verificado')
  const [state, setState] = useState('LOADING')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setState('LOADING')
    setMessage('')
    try {
      const next = await loadCandidates({ institutionId })
      setData(next)
      setState('READY')
    } catch (error) {
      setMessage(error?.message || 'No se pudieron cargar candidatos.')
      setState('ERROR')
    }
  }, [institutionId, loadCandidates])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const unlinkedProfiles = useMemo(() => data?.profiles?.filter((row) => !row.linkedTeacherRecordId) ?? [], [data])
  const unlinkedRecords = useMemo(() => data?.teacherRecords?.filter((row) => !row.profileId) ?? [], [data])

  async function submit(event) {
    event.preventDefault()
    setState('PROCESSING')
    setMessage('')
    try {
      const result = await linkIdentity({ teacherRecordId, profileId, reason })
      setTeacherRecordId('')
      setProfileId('')
      await load()
      setMessage(result.status === 'ALREADY_LINKED' ? 'El vinculo ya existia.' : 'Identidad docente vinculada y auditada.')
      await onLinked?.(profileId)
    } catch (error) {
      setMessage(error?.message || 'No se pudo vincular la identidad.')
      setState('ERROR')
    }
  }

  return (
    <section className="rounded-md border border-sky-200 bg-sky-50 p-4" data-testid="teacher-profile-identity-link-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-extrabold text-sky-950"><ShieldCheck className="h-5 w-5" />Identidad docente estructurada</h3>
          <p className="mt-1 text-sm text-sky-900">Vinculo explicito Profile ↔ TeacherRecord. No se infiere por nombre, email o DNI.</p>
        </div>
        <button className="btn-secondary" onClick={load} type="button"><RefreshCw className="h-4 w-4" />Actualizar</button>
      </div>

      {data && <p className="mt-3 text-xs font-bold uppercase text-sky-800">Profiles sin vinculo: {data.diagnostics.unlinkedProfiles} · fichas sin vinculo: {data.diagnostics.unlinkedTeacherRecords}</p>}

      <form className="mt-4 grid gap-3 lg:grid-cols-3" onSubmit={submit}>
        <label className="text-sm font-bold text-slate-700">Ficha docente
          <select className="input-base mt-2" value={teacherRecordId} onChange={(event) => setTeacherRecordId(event.target.value)} required>
            <option value="">Seleccionar ficha</option>
            {unlinkedRecords.map((row) => <option key={row.teacherRecordId} value={row.teacherRecordId}>{row.displayName} · {row.status}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700">Usuario docente
          <select className="input-base mt-2" value={profileId} onChange={(event) => setProfileId(event.target.value)} required>
            <option value="">Seleccionar Profile</option>
            {unlinkedProfiles.map((row) => <option key={row.profileId} value={row.profileId}>{row.displayName}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700">Motivo
          <input className="input-base mt-2" value={reason} onChange={(event) => setReason(event.target.value)} required />
        </label>
        <button className="btn-primary lg:col-span-3 lg:w-fit" disabled={state === 'PROCESSING' || !teacherRecordId || !profileId || !reason.trim()} type="submit"><Link2 className="h-4 w-4" />Vincular identidad</button>
      </form>
      {message && <p className={`mt-3 text-sm font-semibold ${state === 'ERROR' ? 'text-red-800' : 'text-sky-900'}`}>{message}</p>}
    </section>
  )
}
