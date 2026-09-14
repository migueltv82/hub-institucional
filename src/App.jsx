import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import ProtectedSuperAdminRoute from './components/ProtectedSuperAdminRoute.jsx'
import PwaInstallPrompt from './components/PwaInstallPrompt.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import ImportantNoticeCenter from './components/ImportantNoticeCenter.jsx'
import { fetchPublicAppStatus } from './services/appConfig.js'
import { useAppTheme } from './hooks/useAppTheme.js'

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'))
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const StudentPortalModule = lazy(() => import('./modules/alumnos/StudentPortalModule.jsx'))
const TeacherPortalModule = lazy(() => import('./modules/docentes/TeacherPortalModule.jsx'))
const SuperAdminLayout = lazy(() => import('./pages/SuperAdminLayout.jsx'))
const SuperAdminOverviewPage = lazy(() => import('./pages/SuperAdminOverviewPage.jsx'))
const SuperAdminAuditPage = lazy(() => import('./pages/SuperAdminAuditPage.jsx'))
const SuperAdminInstitutionsPage = lazy(() => import('./pages/SuperAdminInstitutionsPage.jsx'))
const SuperAdminInstitutionRosterPage = lazy(() => import('./pages/SuperAdminInstitutionRosterPage.jsx'))
const SuperAdminUsersPage = lazy(() => import('./pages/SuperAdminUsersPage.jsx'))

function AppWorkspaceRouter() {
  const { user, profile } = useAuth()
  const accountRole = String(profile?.account_role ?? user?.accountRole ?? user?.role ?? '').toLowerCase()
  const isStudent = ['alumno', 'student'].includes(accountRole)
  const isTeacher = ['docente', 'profesor', 'teacher'].includes(accountRole)

  if (isTeacher) return <TeacherPortalModule />
  return isStudent ? <StudentPortalModule /> : <DashboardPage />
}

function AppStatusPanel({ title, message }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-4 md:p-6">
      <section className="panel w-full max-w-md text-center">
        <span className="soft-title">Institutional Hub</span>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
      </section>
    </main>
  )
}

// La app corre en modo local persistido; toda la navegacion relevante entra al workspace.
function App() {
  const { isLoading, isAuthenticated, isSuperAdmin } = useAuth()
  const { theme, toggleTheme } = useAppTheme()
  const {
    data: appStatus,
    error: appStatusError,
    isLoading: isAppStatusLoading,
  } = useQuery({
    queryKey: ['public-app-status'],
    queryFn: fetchPublicAppStatus,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  if (isLoading || isAppStatusLoading) {
    return (
      <>
        <ThemeToggle onToggle={toggleTheme} theme={theme} />
        <AppStatusPanel
          title="Preparando el entorno institucional"
          message="Estamos validando la sesion y cargando el espacio de trabajo."
        />
      </>
    )
  }

  if (appStatus?.maintenanceEnabled) {
    return (
      <>
        <ThemeToggle onToggle={toggleTheme} theme={theme} />
        <AppStatusPanel
          title="Plataforma en mantenimiento"
          message={appStatus.maintenanceMessage}
        />
      </>
    )
  }

  if (appStatusError) {
    return (
      <>
        <ThemeToggle onToggle={toggleTheme} theme={theme} />
        <AppStatusPanel
          title="No se pudo cargar esta vista"
          message={appStatusError.message}
        />
      </>
    )
  }

  return (
    <div className="min-h-dvh w-full text-slate-900">
      <ThemeToggle onToggle={toggleTheme} theme={theme} />
      <Toaster
        position="top-right"
        toastOptions={{
          style: theme === 'dark'
            ? { background: '#172320', color: '#f1f5f9', border: '1px solid #33413d' }
            : undefined,
          duration: 6000,
        }}
      />
      <ImportantNoticeCenter />
      <PwaInstallPrompt isAuthenticated={isAuthenticated} />
      <Suspense fallback={(
        <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-4 md:p-6">
          <section className="panel w-full max-w-md text-center">
            <span className="soft-title">Institutional Hub</span>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Cargando modulo</h1>
            <p className="mt-3 text-sm text-slate-600">
              Estamos preparando la siguiente capa operativa.
            </p>
          </section>
        </main>
      )}
      >
        <Routes>
          <Route path="/login" element={isAuthenticated ? <Navigate to={isSuperAdmin ? "/super-admin" : "/app"} /> : <LoginPage />} />
          <Route path="/app/*" element={isAuthenticated ? <AppWorkspaceRouter /> : <Navigate to="/login" />} />
          <Route path="/" element={<Navigate replace to={isAuthenticated ? (isSuperAdmin ? "/super-admin" : "/app") : "/login"} />} />
          <Route element={<ProtectedSuperAdminRoute />}>
            <Route path="/super-admin" element={<SuperAdminLayout />}>
              <Route index element={<SuperAdminOverviewPage />} />
              <Route path="auditoria" element={<SuperAdminAuditPage />} />
              <Route path="instituciones" element={<SuperAdminInstitutionsPage />} />
              <Route path="instituciones/:institutionId/alumnos" element={<SuperAdminInstitutionRosterPage audience="students" />} />
              <Route path="instituciones/:institutionId/docentes" element={<SuperAdminInstitutionRosterPage audience="teachers" />} />
              <Route path="usuarios" element={<SuperAdminUsersPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default App
