import { useMemo, useState } from 'react'
import { CheckSquare, Copy, Pencil, RefreshCw, ShieldCheck, UserPlus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  createOrAssignInstitutionUser,
  generateSecurePassword,
  updateInstitutionUser,
} from '../services/superAdmin'
import { useAuth } from '../auth/AuthContext'

function buildInitialFormData(initialUser = null) {
  return {
    email: initialUser?.email ?? '',
    displayName: initialUser?.display_name ?? '',
    password: generateSecurePassword(),
    role: initialUser?.institutions?.[0]?.role ?? 'admin',
    institutionIds: initialUser?.institutions?.map((institution) => institution.id) ?? [],
  }
}

export default function CreateInstitutionUserModal({
  institutions,
  initialUser = null,
  isOpen,
  onClose,
  onSuccess,
}) {
  const { isRemoteSession } = useAuth()
  const isEditing = Boolean(initialUser)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState(() => buildInitialFormData(initialUser))

  const sortedInstitutions = useMemo(
    () => [...institutions].sort((left, right) => left.name.localeCompare(right.name)),
    [institutions]
  )

  if (!isOpen) return null

  const handleGeneratePassword = () => {
    setFormData((prev) => ({ ...prev, password: generateSecurePassword() }))
  }

  const handleCopyPassword = async () => {
    await navigator.clipboard.writeText(formData.password)
    toast.success('Contrasena copiada')
  }

  const handleInstitutionToggle = (institutionId) => {
    setFormData((prev) => ({
      ...prev,
      institutionIds: prev.institutionIds.includes(institutionId)
        ? prev.institutionIds.filter((entry) => entry !== institutionId)
        : [...prev.institutionIds, institutionId],
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      if (isEditing) {
        await updateInstitutionUser({
          userId: initialUser.id,
          email: formData.email,
          displayName: formData.displayName,
          institutionIds: formData.institutionIds,
          role: formData.role,
          useRemote: isRemoteSession,
        })
      } else {
        await createOrAssignInstitutionUser({
          email: formData.email,
          password: formData.password,
          displayName: formData.displayName,
          institutionIds: formData.institutionIds,
          role: formData.role,
          useRemote: isRemoteSession,
        })
      }

      toast.success(isEditing ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente')
      onSuccess()
      onClose()
      setFormData(buildInitialFormData())
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-2xl bg-white shadow-2xl rise-in">
        <header className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="flex items-center gap-2 text-xl font-bold text-slate-950">
            {isEditing ? <Pencil className="text-cyan-600" /> : <UserPlus className="text-cyan-600" />}
            {isEditing ? 'Editar Usuario Institucional' : 'Nuevo Usuario Institucional'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700">Nombre visible</label>
              <input
                required
                className="input-base"
                placeholder="Ej: Maria Gomez"
                value={formData.displayName}
                onChange={(event) => setFormData((prev) => ({ ...prev, displayName: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700">Email</label>
              <input
                required
                type="email"
                className="input-base"
                placeholder="maria@institucion.edu"
                value={formData.email}
                disabled={isEditing && isRemoteSession}
                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              />
              {isEditing && isRemoteSession && (
                <p className="text-xs text-slate-500">
                  En sesion remota el email no se edita desde aqui para no desalinearlo con `auth.users`.
                </p>
              )}
            </div>
          </div>

          <div className={`grid gap-4 ${isEditing ? 'md:grid-cols-1' : 'md:grid-cols-[0.65fr_0.35fr]'}`}>
            {!isEditing && (
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700">Contrasena inicial</label>
                <div className="flex gap-2">
                  <input
                    className="input-base bg-slate-50 font-mono text-xs"
                    readOnly
                    value={formData.password}
                  />
                  <button type="button" onClick={handleGeneratePassword} className="btn-secondary p-2">
                    <RefreshCw size={16} />
                  </button>
                  <button type="button" onClick={handleCopyPassword} className="btn-secondary p-2">
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700">Rol institucional</label>
              <select
                className="input-base"
                value={formData.role}
                onChange={(event) => setFormData((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              {isEditing && (
                <p className="text-xs text-slate-500">
                  El rol seleccionado se aplicara a todas las instituciones marcadas para este usuario.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-cyan-700" />
              <p className="text-sm font-bold text-slate-900">Instituciones asignadas</p>
            </div>
            {sortedInstitutions.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                Primero crea al menos una institucion para poder asignarle acceso a este usuario.
              </div>
            ) : (
              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {sortedInstitutions.map((institution) => (
                  <label
                    key={institution.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition ${
                      formData.institutionIds.includes(institution.id)
                        ? 'border-cyan-300 bg-cyan-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.institutionIds.includes(institution.id)}
                      onChange={() => handleInstitutionToggle(institution.id)}
                    />
                    <span>
                      <strong className="block text-slate-950">{institution.name}</strong>
                      <span className="text-slate-500">{institution.slug}</span>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        institution.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {institution.status === 'active' ? 'Activa' : 'Suspendida'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              Un mismo usuario puede administrar varias instituciones.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || sortedInstitutions.length === 0}
              className="btn-primary flex-1"
            >
              {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Guardar usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
