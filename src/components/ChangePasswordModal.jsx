import { useState } from 'react'
import toast from 'react-hot-toast'
import { KeyRound, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

const initialForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

function ChangePasswordModal({ isOpen, onClose }) {
  const { changeOwnPassword } = useAuth()
  const [formData, setFormData] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  function handleClose() {
    setFormData(initialForm)
    onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('La confirmacion no coincide con la nueva contrasena.')
      return
    }

    try {
      setIsSubmitting(true)
      await changeOwnPassword({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      })
      toast.success('Contrasena actualizada correctamente')
      handleClose()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md bg-white shadow-2xl rise-in">
        <header className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="flex items-center gap-2 text-xl font-bold text-slate-950">
            <KeyRound className="text-cyan-600" />
            Cambiar contrasena
          </h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600" type="button">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700">Contrasena actual</label>
            <input
              required
              className="input-base"
              type="password"
              autoComplete="current-password"
              value={formData.currentPassword}
              onChange={(event) => setFormData((prev) => ({ ...prev, currentPassword: event.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700">Nueva contrasena</label>
            <input
              required
              className="input-base"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={formData.newPassword}
              onChange={(event) => setFormData((prev) => ({ ...prev, newPassword: event.target.value }))}
            />
            <p className="text-xs text-slate-500">Usa al menos 8 caracteres.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700">Confirmar nueva contrasena</label>
            <input
              required
              className="input-base"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={formData.confirmPassword}
              onChange={(event) => setFormData((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            />
          </div>

          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-950">
            Por seguridad, primero validamos tu contrasena actual y luego reemplazamos la credencial.
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ChangePasswordModal
