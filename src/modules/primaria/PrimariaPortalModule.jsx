import { useEffect } from 'react'
import { 
  GraduationCap, 
  BookOpenCheck, 
  ClipboardList, 
  UsersRound, 
  CalendarDays,
  Box,
  LogOut,
} from 'lucide-react'
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { usePrimStore } from './stores/primStore.js'
import PrimariaGradePage from './components/PrimariaGradePage.jsx'
import AppFooter from '../../components/AppFooter.jsx'
import ProductBrand from '../../components/ProductBrand.jsx'

// Items de navegación específicos para primaria
const baseNavItems = [
  { to: '/app/primario/1', label: '1° Grado', icon: GraduationCap },
  { to: '/app/primario/2', label: '2° Grado', icon: BookOpenCheck },
  { to: '/app/primario/3', label: '3° Grado', icon: ClipboardList },
  { to: '/app/primario/4', label: '4° Grado', icon: UsersRound },
  { to: '/app/primario/5', label: '5° Grado', icon: CalendarDays },
  { to: '/app/primario/6', label: '6° Grado', icon: Box },
]

function PrimariaPortalLayout() {
  const { user, activeInstitution, isRemoteSession, signOutRemote } = useAuth()
  const setProgress = usePrimStore((state) => state.setProgress)
  const currentGrade = usePrimStore((state) => state.currentGrade)

  useEffect(() => {
    if (!user?.id) return
    // Cargar datos iniciales del grado seleccionado
    const progress = usePrimStore.getState().progress[currentGrade]
    if (!progress?.actividades) setProgress(currentGrade, { actividades: 1 })
  }, [user?.id, currentGrade, setProgress])

  const studentName = user?.nombre || 'Estudiante'
  const firstName = String(studentName).trim().split(/\s+/)[0] || 'Estudiante'
  const institutionName = activeInstitution?.name || 'Institución'

  return (
    <div className="student-portal app-shell">
      <header className="student-portal-hero compact-hero rise-in">
        <div className="student-portal-hero__glow student-portal-hero__glow--one" aria-hidden="true" />
        <div className="student-portal-hero__glow student-portal-hero__glow--two" aria-hidden="true" />

        <section className="student-portal-welcome relative z-10">
          <div className="student-portal-brand-row">
            <ProductBrand />
            <span className="student-portal-badge">
              <GraduationCap className="h-4 w-4" />
              Mi espacio
            </span>
          </div>

          <div className="student-portal-greeting">
            <div className="student-portal-avatar" aria-hidden="true">{firstName[0].toUpperCase()}</div>
            <div className="min-w-0">
              <p className="student-portal-eyebrow">Hola, {firstName}</p>
              <h1>{studentName}</h1>
              <div className="student-portal-context">
                <span><Box className="h-3.5 w-3.5" />{institutionName}</span>
                <span className="capitalize">{new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </section>

        <nav
          className="student-portal-nav student-portal-nav--desktop relative z-10 mt-5 flex flex-wrap items-center gap-2 border-t pt-4"
          aria-label="Navegacion principal"
        >
          {baseNavItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => [
                  'student-portal-nav__item inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-extrabold transition',
                  isActive ? 'student-portal-nav__item--active' : 'student-portal-nav__item--idle',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}

          {isRemoteSession && (
            <button
              className="student-portal-signout ml-auto inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-extrabold transition"
              type="button"
              onClick={signOutRemote}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          )}
        </nav>
      </header>

      <div className="student-portal-content flex-1">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  )
}

export default function PrimariaPortalModule() {
  return (
    <Routes>
      <Route element={<PrimariaPortalLayout />}>
        <Route index element={<Navigate to="primario/1" replace />} />
        <Route path="primario/:grade" element={<PrimariaGradePage />} />
        <Route path="*" element={<Navigate to="primario/1" replace />} />
      </Route>
    </Routes>
  )
}