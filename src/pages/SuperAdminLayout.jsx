import { ArrowLeft, Building2, Database, KeyRound, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ChangePasswordModal from '../components/ChangePasswordModal.jsx'
import AppFooter from '../components/AppFooter.jsx'
import ProductBrand from '../components/ProductBrand.jsx'

const navItems = [
  {
    to: '/super-admin',
    end: true,
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    to: '/super-admin/instituciones',
    label: 'Instituciones',
    icon: Building2,
  },
  {
    to: '/super-admin/usuarios',
    label: 'Usuarios y accesos',
    icon: Users,
  },
  {
    to: '/super-admin/auditoria',
    label: 'Auditoria',
    icon: Database,
  },
]

function SuperAdminLayout() {
  const {
    isRemoteSession,
    user,
    signOutRemote,
  } = useAuth()
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)

  async function handleSignOut() {
    try {
      await signOutRemote()
      toast.success('Sesion cerrada correctamente.')
    } catch (error) {
      toast.error('Error al cerrar sesion: ' + error.message)
    }
  }

  return (
    <main className="app-shell">
      <section className="work-surface flex-1">
        <div className="grid flex-1 gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="surface-night flex min-h-full flex-col gap-6 border-b border-white/10 p-5 text-white lg:border-b-0 lg:border-r">
            <div>
              <ProductBrand className="brand-mark--dark" />
              <h1 className="mt-3 text-3xl font-bold">Centro de gobierno</h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Administra instituciones, usuarios, permisos y accesos con una capa de control centralizada.
              </p>
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) => `super-admin-nav ${isActive ? 'super-admin-nav--active' : ''}`}
                    end={item.end}
                    to={item.to}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>

            <div className="mt-auto border-t border-white/10 pt-5 text-white">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-200">
                Sesion
              </p>
              <p className="mt-3 text-lg font-extrabold">{user.nombre}</p>
              <p className="mt-1 text-sm text-slate-300">{user.email}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="status-chip border-white/10 bg-white/6 text-white">
                  <ShieldCheck className="h-4 w-4 text-cyan-300" />
                  GOBIERNO
                </span>
                <span className="status-chip border-white/10 bg-white/6 text-white">
                  {isRemoteSession ? 'Supabase' : 'Demo local'}
                </span>
              </div>
              <button
                className="btn-secondary mt-6 w-full justify-start border-white/10 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setIsPasswordModalOpen(true)}
                type="button"
                disabled={!isRemoteSession}
              >
                <KeyRound className="h-4 w-4" />
                Cambiar contrasena
              </button>
              <button
                className="btn-secondary mt-3 w-full justify-start border-white/10 bg-white/5 text-white hover:bg-white/10"
                onClick={handleSignOut}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesion
              </button>
            </div>
          </aside>

          <div className="min-w-0 space-y-6 p-5 md:p-6">
            <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <span className="soft-title">Backoffice</span>
                <h2 className="mt-2 text-3xl font-bold text-slate-950">Dashboard Super Admin</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Vista central de instituciones, usuarios y auditoria operativa.
                </p>
              </div>
              <NavLink className="btn-secondary self-start lg:self-auto" to="/app">
                <ArrowLeft className="h-4 w-4" />
                Volver al workspace
              </NavLink>
            </header>

            <Outlet />
          </div>
        </div>
      </section>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
      <AppFooter />
    </main>
  )
}

export default SuperAdminLayout
