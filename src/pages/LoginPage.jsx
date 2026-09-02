import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Building2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Shield,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { signInToInstitution, signOutInstitutionSession } from '../services/auth'
import {
  fetchLoginInstitutions,
  persistActiveInstitutionId,
} from '../services/institutions'
import planningWorkspace from '../assets/planning-workspace.jpg'
import { useAuth } from '../auth/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import AppFooter from '../components/AppFooter.jsx'
import ProductBrand from '../components/ProductBrand.jsx'

function getTeacherTechnicalEmail({ dni, institutionId }) {
  return `${String(dni ?? '').trim().replace(/\s+/g, '')}@docentes.${institutionId}.local`.toLowerCase()
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { requestMagicLink, signInWithPassword } = useAuth()
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false)
  const [isLoadingInstitution, setIsLoadingInstitution] = useState(false)
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true)
  const [emailCooldown, setEmailCooldown] = useState(0)
  const [institutions, setInstitutions] = useState([])
  const [adminForm, setAdminForm] = useState({
    email: '',
    password: '',
  })
  const [institutionForm, setInstitutionForm] = useState({
    institutionId: '',
    email: '',
    password: '',
  })
  const [accessMode, setAccessMode] = useState('institution')
  const [showMagicLink, setShowMagicLink] = useState(false)
  const canUseInstitutionLogin = isSupabaseConfigured

  useEffect(() => {
    let cancelled = false

    async function loadInstitutions() {
      setIsLoadingInstitutions(true)

      try {
        const { institutions: nextInstitutions } = await fetchLoginInstitutions()
        if (cancelled) return

        setInstitutions(nextInstitutions)
        setInstitutionForm((prev) => ({
          ...prev,
          institutionId: prev.institutionId || nextInstitutions[0]?.id || '',
        }))
      } catch (error) {
        if (!cancelled) {
          toast.error(`No se pudieron cargar las instituciones: ${error.message}`)
        }
      } finally {
        if (!cancelled) setIsLoadingInstitutions(false)
      }
    }

    loadInstitutions()

    return () => {
      cancelled = true
    }
  }, [])

  const handleAdminChange = (event) => {
    const { name, value } = event.target
    setAdminForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleInstitutionChange = (event) => {
    const { name, value } = event.target
    setInstitutionForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleAdminSubmit = async (event) => {
    event.preventDefault()
    setIsLoadingAdmin(true)

    try {
      await signInWithPassword({
        email: adminForm.email,
        password: adminForm.password,
      })

      toast.success('Sesion iniciada correctamente')
      navigate('/super-admin')
    } catch (error) {
      toast.error(error.message || 'Error al iniciar sesion')
    } finally {
      setIsLoadingAdmin(false)
    }
  }

  const handleInstitutionSubmit = async (event) => {
    event.preventDefault()
    setIsLoadingInstitution(true)

    try {
      const { institution, accountRole } = await signInToInstitution({
        email: accessMode === 'teacher'
          ? getTeacherTechnicalEmail({
            dni: institutionForm.email,
            institutionId: institutionForm.institutionId,
          })
          : institutionForm.email,
        password: institutionForm.password,
        institutionId: institutionForm.institutionId,
      })

      const effectiveRole = String(accountRole ?? '').toLowerCase()
      if (accessMode === 'student' && !['alumno', 'student'].includes(effectiveRole)) {
        await signOutInstitutionSession().catch(() => {})
        throw new Error('Este acceso es solo para alumnos. Usa tus credenciales de estudiante o contacta a soporte.')
      }
      if (accessMode === 'teacher' && !['docente', 'profesor', 'teacher'].includes(effectiveRole)) {
        await signOutInstitutionSession().catch(() => {})
        throw new Error('Este acceso es solo para docentes. Usa tus credenciales docentes o contacta a soporte.')
      }

      persistActiveInstitutionId(institution.id)
      toast.success(`Bienvenido a ${institution.name}`)
      navigate('/app')
    } catch (error) {
      toast.error(error.message || 'Error al iniciar sesion')
    } finally {
      setIsLoadingInstitution(false)
    }
  }

  const handleMagicLinkRequested = async () => {
    await requestMagicLink(adminForm.email)
    toast.success('Enlace enviado. Revisa tu email.')
    setEmailCooldown(60)

    const timer = setInterval(() => {
      setEmailCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  return (
    <main className="login-shell">
      <section className="login-form-surface">
        <div className="login-panel">
          <header className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <ProductBrand className="mb-4" />
              <p className="soft-title">Acceso academico seguro</p>
              <h1 className="mt-2 max-w-2xl text-3xl font-extrabold leading-tight text-slate-950 md:text-4xl">
                {accessMode === 'admin'
                  ? 'Acceso de administracion.'
                  : accessMode === 'student'
                    ? 'Ingreso estudiantil.'
                    : accessMode === 'teacher'
                      ? 'Ingreso docente.'
                    : 'Ingreso por institucion.'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {accessMode === 'admin'
                  ? 'Panel reservado para administradores globales con permisos de gobierno.'
                  : accessMode === 'student'
                    ? 'Ingresa con tu cuenta de alumno y accede a tu portal educativo institucional.'
                    : accessMode === 'teacher'
                      ? 'Ingresa con tu cuenta docente para revisar horarios, mesas y alumnos vinculados.'
                    : 'Selecciona tu institucion, valida tu cuenta y trabaja en un entorno aislado y conectado.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className={accessMode === 'institution' ? 'login-admin-entry login-admin-entry--active' : 'login-admin-entry'}
                onClick={() => {
                  setAccessMode('institution')
                  setShowMagicLink(false)
                }}
                type="button"
              >
                <Building2 className="h-4 w-4" />
                Institucion
              </button>

              <button
                className={accessMode === 'student' ? 'login-admin-entry login-admin-entry--active' : 'login-admin-entry'}
                onClick={() => {
                  setAccessMode('student')
                  setShowMagicLink(false)
                }}
                type="button"
              >
                <UserRound className="h-4 w-4" />
                Alumnos
              </button>

              <button
                className={accessMode === 'teacher' ? 'login-admin-entry login-admin-entry--active' : 'login-admin-entry'}
                onClick={() => {
                  setAccessMode('teacher')
                  setShowMagicLink(false)
                }}
                type="button"
              >
                <UsersRound className="h-4 w-4" />
                Docentes
              </button>

              <button
                className={accessMode === 'admin' ? 'login-admin-entry login-admin-entry--active' : 'login-admin-entry'}
                onClick={() => {
                  setAccessMode('admin')
                  setShowMagicLink(false)
                }}
                type="button"
              >
                <Shield className="h-4 w-4" />
                Admin
              </button>
            </div>
          </header>

          <div className="login-card-grid">
            {accessMode === 'admin' && (
            <article className="auth-card auth-card--cyan">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-700">
                    Acceso maestro
                  </p>
                  <h2 className="mt-2 flex items-center gap-2 text-2xl font-extrabold text-slate-950">
                    <Shield className="h-6 w-6 text-cyan-700" />
                    Gobierno
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Administra instituciones, usuarios, roles, auditoria operativa y estado de cada cuenta.
                  </p>
                </div>
                <span className="status-chip border-cyan-200 bg-cyan-50 text-cyan-900">
                  Control
                </span>
              </div>

              <form onSubmit={handleAdminSubmit} className="mt-5 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    Email
                  </label>
                  <input
                    required
                    name="email"
                    type="email"
                    className="input-base py-2.5"
                    placeholder="admin@institutionalhub.com"
                    value={adminForm.email}
                    onChange={handleAdminChange}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-slate-400" />
                    Contrasena
                  </label>
                  <input
                    required
                    name="password"
                    type="password"
                    className="input-base py-2.5"
                    placeholder="********"
                    value={adminForm.password}
                    onChange={handleAdminChange}
                  />
                </div>

                <button
                  disabled={isLoadingAdmin}
                  className="btn-primary w-full"
                  type="submit"
                >
                  {isLoadingAdmin ? 'Ingresando...' : 'Entrar al centro de control'}
                  <LogIn className="ml-2 h-5 w-5" />
                </button>

                {isSupabaseConfigured && (
                  <div className="login-magic-box">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p>Acceso por correo sin contrasena.</p>
                      <button
                        type="button"
                        onClick={() => setShowMagicLink((current) => !current)}
                        className="text-sm font-extrabold text-cyan-700 hover:text-cyan-800"
                      >
                        {showMagicLink ? 'Ocultar' : 'Usar magic link'}
                      </button>
                    </div>

                    {showMagicLink && (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          className="input-base flex-1 py-2.5"
                          type="email"
                          value={adminForm.email}
                          onChange={(event) => setAdminForm((prev) => ({ ...prev, email: event.target.value }))}
                          placeholder="tu-email@dominio.com"
                        />
                        <button
                          className="btn-secondary"
                          disabled={emailCooldown > 0}
                          onClick={handleMagicLinkRequested}
                          type="button"
                        >
                          <Sparkles className="h-4 w-4" />
                          {emailCooldown > 0 ? `${emailCooldown}s` : 'Enviar'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </article>
            )}

            {(accessMode === 'institution' || accessMode === 'student' || accessMode === 'teacher') && (
            <article className="auth-card auth-card--blue">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">
                    {accessMode === 'student'
                      ? 'Acceso estudiantil'
                      : accessMode === 'teacher'
                        ? 'Acceso docente'
                        : 'Acceso tenant'}
                  </p>
                  <h2 className="mt-2 flex items-center gap-2 text-2xl font-extrabold text-slate-950">
                    {accessMode === 'student' ? (
                      <UserRound className="h-6 w-6 text-blue-700" />
                    ) : accessMode === 'teacher' ? (
                      <UsersRound className="h-6 w-6 text-blue-700" />
                    ) : (
                      <Building2 className="h-6 w-6 text-blue-700" />
                    )}
                    {accessMode === 'student' ? 'Alumno' : accessMode === 'teacher' ? 'Docente' : 'Institucion'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {accessMode === 'student'
                      ? 'Usa tu cuenta de alumno para abrir el portal del estudiante.'
                      : accessMode === 'teacher'
                        ? 'Usa tu cuenta docente para abrir el modulo de horarios, mesas y alumnos.'
                      : 'Selecciona la institucion, valida tu cuenta y trabaja sobre su espacio academico.'}
                  </p>
                </div>
                <span className="status-chip border-blue-200 bg-blue-50 text-blue-900">
                  {accessMode === 'student' ? 'Alumno' : accessMode === 'teacher' ? 'Docente' : 'Workspace'}
                </span>
              </div>

              <form onSubmit={handleInstitutionSubmit} className="mt-5 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    Institucion
                  </label>
                  <select
                    required
                    name="institutionId"
                    className="input-base py-2.5"
                    value={institutionForm.institutionId}
                    onChange={handleInstitutionChange}
                    disabled={!canUseInstitutionLogin || isLoadingInstitutions || institutions.length === 0}
                  >
                    {institutions.length === 0 && <option value="">Sin instituciones disponibles</option>}
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    {accessMode === 'teacher' ? 'DNI' : 'Email'}
                  </label>
                  <input
                    required
                    name="email"
                    type={accessMode === 'teacher' ? 'text' : 'email'}
                    className="input-base py-2.5"
                    placeholder={accessMode === 'teacher' ? '30111222' : 'usuario@institucion.edu'}
                    value={institutionForm.email}
                    onChange={handleInstitutionChange}
                    disabled={!canUseInstitutionLogin}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-slate-400" />
                    {accessMode === 'teacher' ? 'Contrasena inicial: DNI' : 'Contrasena'}
                  </label>
                  <input
                    required
                    name="password"
                    type="password"
                    className="input-base py-2.5"
                    placeholder="********"
                    value={institutionForm.password}
                    onChange={handleInstitutionChange}
                    disabled={!canUseInstitutionLogin}
                  />
                </div>

                {!canUseInstitutionLogin && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Configura Supabase para habilitar el acceso tenant con credenciales reales.
                  </div>
                )}

                <button
                  disabled={!canUseInstitutionLogin || isLoadingInstitution || isLoadingInstitutions}
                  className="btn-primary w-full"
                  type="submit"
                >
                  {isLoadingInstitution
                    ? 'Ingresando...'
                    : accessMode === 'student'
                      ? 'Entrar al portal de alumnos'
                      : accessMode === 'teacher'
                        ? 'Entrar al modulo docente'
                      : 'Entrar al workspace institucional'}
                  <LogIn className="ml-2 h-5 w-5" />
                </button>
              </form>
            </article>
            )}

            <aside className="login-insight-card">
              <div className="flex items-start gap-3">
                <span className="login-insight-dot bg-cyan-500" />
                <div>
                  <p className="font-extrabold text-slate-950">Aislamiento por institucion</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Cada cuenta trabaja solo sobre su tenant autorizado.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="login-insight-dot bg-lime-500" />
                <div>
                  <p className="font-extrabold text-slate-950">Workspace persistente</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    La carga academica se recupera por institucion y sesion.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="login-insight-dot bg-orange-500" />
                <div>
                  <p className="font-extrabold text-slate-950">Gobierno centralizado</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Usuarios, roles y estados se administran desde Super Admin.
                  </p>
                </div>
              </div>
            </aside>
          </div>

          <footer className="border-t border-slate-200 pt-3">
            <div className="flex items-center gap-3 text-xs text-slate-600 md:text-sm">
              <ShieldCheck className="h-5 w-5 text-cyan-600" />
              <p>Autenticacion protegida, aislamiento institucional y control de acceso centralizado.</p>
            </div>
            <AppFooter compact />
          </footer>
        </div>
      </section>

      <aside className="visual-panel">
        <div className="absolute inset-0 z-10 bg-slate-950/30" />
        <img
          className="absolute inset-0 h-full w-full object-cover opacity-[0.82]"
          src={planningWorkspace}
          alt="Workspace"
        />
        <div className="login-color-rail z-20">
          <span className="bg-cyan-400" />
          <span className="bg-blue-500" />
          <span className="bg-orange-400" />
          <span className="bg-lime-400" />
        </div>
        <div className="visual-caption z-20">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">
            Institutional Security Layer
          </p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-slate-950">
            Una puerta de entrada confiable para cada institucion.
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Gobierno, administracion y operacion academica comparten una misma base,
            con permisos separados y datos listos para operar.
          </p>
        </div>
      </aside>
    </main>
  )
}
