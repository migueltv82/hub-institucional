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
    // D1 P3: opcion tecnica, plegada por defecto para que no aparezca en la demo.
    <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label={`Modo base de datos de ${institution.name}`}>
      <summary className="cursor-pointer text-sm font-bold text-slate-700">Opciones avanzadas</summary>
      {/* Decisión de Miguel (20/10): no se borran instituciones desde la app; se suspenden. */}
      <p className="mt-3 text-sm text-slate-600">Para dejar de usar la institución, suspendela con el escudo de arriba: no borra ningún dato. El borrado definitivo de una institución de prueba lo hace el responsable técnico con el procedimiento de limpieza (runbook §8.0).</p>
      <p className="mt-3 font-bold text-slate-950">Modo base de datos</p>
      <p className="mt-1 text-sm text-slate-600">Los administradores ven alumnos, docentes, materias y mesas leídos de la base de datos, en lugar de las planillas cargadas.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn-secondary" type="button" role="switch"
          aria-label={`Habilitar modo base de datos para ${institution.name}`} aria-checked={setting.data === true}
          disabled={saving || setting.isPending || setting.isError} onClick={toggle}>
          {saving ? 'Guardando…' : setting.isPending ? 'Cargando…' : setting.data ? 'Habilitada' : 'Deshabilitada'}
        </button>
        {setting.data === true && !setting.isError && institution.status === 'active' && (
          <Link className="btn-primary" to="/app" onClick={() => setActiveInstitutionId(institution.id)}>Abrir panel admin</Link>
        )}
        {setting.isError && <button className="btn-secondary" type="button" onClick={() => setting.refetch()}>Reintentar</button>}
      </div>
      {(error || setting.isError) && <p role="alert" className="mt-2 text-sm text-red-700">{error || 'No se pudo consultar la habilitación.'}</p>}
    </details>
  )
}
