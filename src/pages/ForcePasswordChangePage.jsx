import { useState } from 'react'
import toast from 'react-hot-toast'
import { KeyRound, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { completeInitialPasswordChange } from '../services/initialPasswordChange.js'

const initialForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

// I2d: primer ingreso con el DNI como contrasena. Hasta cambiarla no se muestra el resto de la app.
function ForcePasswordChangePage() {
  const { signOutRemote, user } = useAuth()
  const [formData, setFormData] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const field = (key) => ({
    value: formData[key],
    onChange: (event) => setFormData((prev) => ({ ...prev, [key]: event.target.value })),
  })

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setIsSubmitting(true)
      await completeInitialPasswordChange(formData)
      toast.success('Contraseña actualizada. Ya podés usar la plataforma.')
    } catch (error) {
      toast.error(error.message)
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOutRemote()
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-4 md:p-6">
      <section className="panel w-full max-w-md rise-in">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900">
          <KeyRound className="text-cyan-600" />
          Cambia tu contraseña
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {user?.email ? <>Ingresaste como <strong>{user.email}</strong>. </> : null}
          Tu contraseña inicial es tu DNI. Antes de seguir, elegí una nueva de al menos 8 caracteres que no contenga tu DNI.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-bold text-slate-700">Contraseña actual (tu DNI)</span>
            <input autoComplete="current-password" className="input-base" required type="password" {...field('currentPassword')} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-bold text-slate-700">Nueva contraseña</span>
            <input autoComplete="new-password" className="input-base" minLength={8} required type="password" {...field('newPassword')} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-bold text-slate-700">Repeti la nueva contraseña</span>
            <input autoComplete="new-password" className="input-base" minLength={8} required type="password" {...field('confirmPassword')} />
          </label>
          <button className="btn-primary w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>

        <button className="btn-secondary mt-3 w-full" onClick={handleSignOut} type="button">
          <LogOut className="h-4 w-4" />
          Salir
        </button>
      </section>
    </main>
  )
}

export default ForcePasswordChangePage
