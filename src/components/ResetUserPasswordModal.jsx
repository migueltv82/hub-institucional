import { useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, KeyRound, RefreshCw, X } from 'lucide-react'
import {
  generateSecurePassword,
  resetUserPassword,
} from '../services/superAdmin.js'
import { useAuth } from '../auth/AuthContext.jsx'

function ResetUserPasswordModal({ user, isOpen, onClose, onSuccess }) {
  const { isRemoteSession } = useAuth()
  const [temporaryPassword, setTemporaryPassword] = useState(() => generateSecurePassword())
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen || !user) return null

  function handleClose() {
    setTemporaryPassword(generateSecurePassword())
    onClose()
  }

  async function handleCopyTemporaryPassword() {
    await navigator.clipboard.writeText(temporaryPassword)
    toast.success('Contrasena temporal copiada')
  }

  async function handleResetPassword() {
    const confirmed = window.confirm(
      `Vas a reemplazar la contrasena de ${user.email}. La contrasena actual no se puede recuperar.`
    )

    if (!confirmed) return

    try {
      setIsSubmitting(true)
      await resetUserPassword({
        userId: user.id,
        newPassword: temporaryPassword,
        useRemote: isRemoteSession,
      })
      toast.success('Contrasena actualizada')
      await onSuccess?.()
      handleClose()
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
            <KeyRound className="text-cyan-600" />
            Resetear contrasena
          </h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600" type="button">
            <X size={20} />
          </button>
        </header>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-slate-950">{user.display_name}</p>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            No es posible ver la contrasena actual. Solo podes reemplazarla por una nueva contrasena temporal.
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Nueva contrasena temporal</label>
            <div className="flex gap-2">
              <input
                className="input-base bg-slate-50 font-mono text-xs"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setTemporaryPassword(generateSecurePassword())}
                className="btn-secondary p-2"
                title="Generar otra contrasena"
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                onClick={handleCopyTemporaryPassword}
                className="btn-secondary p-2"
                title="Copiar contrasena"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isSubmitting || temporaryPassword.trim().length < 8}
              className="btn-primary flex-1"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar contrasena'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResetUserPasswordModal
