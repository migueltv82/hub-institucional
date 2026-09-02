import { lazy, Suspense, useState } from 'react'
import toast from 'react-hot-toast'
import {
  KeyRound,
  LogOut,
  UserRound,
  Users,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { resolveSessionSlot } from '../lib/authStorage.js'
import ChangePasswordModal from '../components/ChangePasswordModal.jsx'
import SessionSlotsModal from '../components/SessionSlotsModal.jsx'
import AppFooter from '../components/AppFooter.jsx'
import ProductBrand from '../components/ProductBrand.jsx'

const GeneradorCronograma = lazy(() => import('../components/GeneradorCronograma.jsx'))

function DashboardPage() {
  const {
    user,
    activeInstitution,
    isRemoteSession,
    isLoading,
    isSuperAdmin,
    signOutRemote,
  } = useAuth()
  const [isAuthActionLoading, setIsAuthActionLoading] = useState(false)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [isSessionSlotsModalOpen, setIsSessionSlotsModalOpen] = useState(false)
  const displayName = user?.nombre ?? 'Usuario'
  const institutionName = activeInstitution?.name
    ?? (isLoading ? 'Cargando institucion...' : 'Sin institucion asignada')
  const canManageSessionSlots = isSuperAdmin || user?.accountRole === 'admin_instituto'

  async function handleSignOut() {
    try {
      setIsAuthActionLoading(true)
      await signOutRemote()
      toast.success('Sesion cerrada. Ya podes ingresar con otra cuenta.')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsAuthActionLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="dashboard-topbar rise-in">
        <div className="dashboard-topbar__identity">
          <ProductBrand className="dashboard-topbar__brand" />
          <div className="dashboard-topbar__institution">
            <span>Institucion activa</span>
            <strong>{institutionName}</strong>
          </div>
        </div>

        <div className="dashboard-topbar__session">
          <div className="dashboard-topbar__admin">
            <UserRound className="h-4 w-4 text-teal-700" />
            <div>
              <span>Admin conectado</span>
              <strong>{displayName}</strong>
            </div>
          </div>

          <div className="dashboard-topbar__actions">
            {canManageSessionSlots && (
              <button
                className="btn-secondary dashboard-topbar__button"
                onClick={() => setIsSessionSlotsModalOpen(true)}
                type="button"
              >
                <Users className="h-4 w-4" />
                Sesiones
              </button>
            )}
            <button
              className="btn-secondary dashboard-topbar__button"
              disabled={isAuthActionLoading || !isRemoteSession}
              onClick={() => setIsPasswordModalOpen(true)}
              type="button"
            >
              <KeyRound className="h-4 w-4" />
              Cambiar contrasena
            </button>
            <button
              className="btn-secondary dashboard-topbar__button"
              disabled={isAuthActionLoading || !isRemoteSession}
              onClick={handleSignOut}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Cambiar sesion
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <Suspense fallback={(
        <section className="work-surface p-5 md:p-6">
          <div className="soft-card">
            <span className="soft-title">Institutional Hub</span>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-950">Cargando workspace</h2>
            <p className="mt-2 text-sm text-slate-600">
              Estamos preparando el modulo principal de Institutional Hub.
            </p>
          </div>
        </section>
        )}
        >
          <GeneradorCronograma />
        </Suspense>
      </div>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
      {canManageSessionSlots && (
        <SessionSlotsModal
          isOpen={isSessionSlotsModalOpen}
          onClose={() => setIsSessionSlotsModalOpen(false)}
          currentSlot={resolveSessionSlot()}
        />
      )}
      <AppFooter />
    </main>
  )
}

export default DashboardPage
