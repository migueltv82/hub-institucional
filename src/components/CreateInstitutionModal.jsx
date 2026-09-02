import { useState } from 'react'
import { Check, Copy, RefreshCw, ShieldCheck, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { createInstitutionWithAdmin, generateSecurePassword } from '../services/superAdmin'
import { useAuth } from '../auth/AuthContext'

export default function CreateInstitutionModal({ isOpen, onClose, onSuccess }) {
  const { isRemoteSession } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    adminEmail: '',
    adminPassword: generateSecurePassword(),
    planType: 'free',
  })

  if (!isOpen) return null

  const handleGeneratePass = () => {
    setFormData((prev) => ({ ...prev, adminPassword: generateSecurePassword() }))
    setCopied(false)
  }

  const handleCopyPass = () => {
    navigator.clipboard.writeText(formData.adminPassword)
    setCopied(true)
    toast.success('Contrasena copiada')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      await createInstitutionWithAdmin({
        institutionName: formData.name,
        adminEmail: formData.adminEmail,
        adminPassword: formData.adminPassword,
        planType: formData.planType,
        logoUrl: '',
        useRemote: isRemoteSession,
      })
      toast.success('Institucion creada y administrador asignado')
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-lg bg-white shadow-2xl rise-in">
        <header className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="flex items-center gap-2 text-xl font-bold text-slate-950">
            <ShieldCheck className="text-cyan-600" />
            Nueva Institucion
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" type="button">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700">Nombre del Instituto</label>
            <input
              required
              className="input-base"
              placeholder="Ej: Instituto San Miguel"
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-700">Plan Inicial</label>
              <select
                className="input-base"
                value={formData.planType}
                onChange={(event) => setFormData((prev) => ({ ...prev, planType: event.target.value }))}
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <span className="soft-title mb-3 block">Administrador inicial</span>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700">Email Admin</label>
                <input
                  required
                  type="email"
                  className="input-base"
                  placeholder="admin@sanmiguel.edu"
                  value={formData.adminEmail}
                  onChange={(event) => setFormData((prev) => ({ ...prev, adminEmail: event.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700">Contrasena de acceso</label>
                <div className="flex gap-2">
                  <input
                    required
                    readOnly
                    className="input-base bg-slate-50 font-mono text-xs"
                    value={formData.adminPassword}
                  />
                  <button
                    type="button"
                    onClick={handleGeneratePass}
                    className="btn-secondary p-2"
                    title="Generar otra"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button type="button" onClick={handleCopyPass} className="btn-secondary p-2">
                    {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Copia esta clave ahora. No se volvera a mostrar por seguridad.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-6">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
              {isSubmitting ? 'Creando...' : 'Dar de alta Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
