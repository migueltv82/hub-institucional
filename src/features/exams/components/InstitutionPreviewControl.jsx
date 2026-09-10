import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { saveRelationalPreviewSetting } from '../../../services/relationalExamPreview.js'
import { useRelationalPreviewSetting } from '../hooks/useRelationalPreviewSetting.js'

export default function InstitutionPreviewControl({ institution }) {
  const { isRemoteSession, isSuperAdmin, profile, setActiveInstitutionId } = useAuth()
  const allowed = Boolean(isRemoteSession && isSuperAdmin && profile?.is_global_admin && !profile?.is_blocked)
  const setting = useRelationalPreviewSetting(institution.id, allowed)
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    if (!allowed || saving || setting.isPending || setting.isError) return
    setSaving(true)
    setError('')
    try {
      await saveRelationalPreviewSetting({ institutionId: institution.id, enabled: !setting.data })
      await queryClient.invalidateQueries({ queryKey: ['relational-preview-setting'] })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSaving(false)
    }
  }

  if (!allowed) return null
  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label={`Schema relacional de ${institution.name}`}>
      <p className="font-bold text-slate-950">Schema relacional en panel admin</p>
      <p className="mt-1 text-sm text-slate-600">Hace que sus administradores vean alumnos, docentes, materias y mesas desde la base relacional nueva dentro de la UI existente.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn-secondary" type="button" role="switch"
          aria-label={`Habilitar schema relacional para ${institution.name}`} aria-checked={setting.data === true}
          disabled={saving || setting.isPending || setting.isError} onClick={toggle}>
          {saving ? 'Guardando...' : setting.isPending ? 'Cargando...' : setting.data ? 'Habilitada' : 'Deshabilitada'}
        </button>
        {setting.data === true && !setting.isError && institution.status === 'active' && (
          <Link className="btn-primary" to="/app" onClick={() => setActiveInstitutionId(institution.id)}>Abrir panel admin</Link>
        )}
        {setting.isError && <button className="btn-secondary" type="button" onClick={() => setting.refetch()}>Reintentar</button>}
      </div>
      {(error || setting.isError) && <p role="alert" className="mt-2 text-sm text-red-700">{error || 'No se pudo consultar la habilitacion.'}</p>}
    </section>
  )
}
