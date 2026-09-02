import {
  ArrowRight,
  Building2,
  Database,
  GraduationCap,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { useSuperAdminSummary } from '../hooks/useSuperAdminSummary.js'

function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="max-w-3xl">
      <span className="soft-title">{eyebrow}</span>
      <h3 className="mt-2 text-2xl font-bold text-slate-950">{title}</h3>
      {description && (
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      )}
    </div>
  )
}

function OverviewMetricCard({ label, value, helper, icon: Icon, tone, accent }) {
  return (
    <article className={`metric-card h-full ${tone}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              {label}
            </p>
            <p className="mt-3 text-4xl font-bold text-slate-950">
              {value}
            </p>
          </div>
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
        <p className="mt-4 text-sm text-slate-500">{helper}</p>
      </div>
    </article>
  )
}

function SummaryTile({ label, value, helper, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white/90',
    cyan: 'border-cyan-200 bg-cyan-50/70',
    blue: 'border-blue-200 bg-blue-50/70',
    teal: 'border-teal-200 bg-teal-50/70',
    amber: 'border-amber-200 bg-amber-50/70',
  }[tone]

  return (
    <div className={`status-tile h-full ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      {helper && <p className="mt-1 text-sm text-slate-500">{helper}</p>}
    </div>
  )
}

function AccessCard({ to, title, description, icon: Icon }) {
  return (
    <NavLink className="soft-card flex h-full flex-col bg-white transition hover:-translate-y-0.5" to={to}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="soft-title">Modulo</span>
          <h4 className="mt-2 text-xl font-bold text-slate-950">{title}</h4>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-teal-700">
        Abrir modulo
        <ArrowRight className="h-4 w-4" />
      </span>
    </NavLink>
  )
}

function SuperAdminOverviewPage() {
  const { isRemoteSession } = useAuth()
  const {
    data: summary = {
      totalInstitutions: 0,
      totalAdministrators: 0,
      totalStudents: 0,
      totalTeachers: 0,
      totalUsers: 0,
      blockedUsers: 0,
      activeInstitutions: 0,
      source: 'local',
    },
    error,
  } = useSuperAdminSummary({ useRemote: isRemoteSession })

  const sourceLabel = summary.source === 'supabase' ? 'Supabase' : 'Demo local'
  const dashboardCards = [
    {
      key: 'institutions',
      label: 'Instituciones',
      value: summary.totalInstitutions,
      helper: `${summary.activeInstitutions} activas`,
      icon: Building2,
      tone: 'metric-card--cyan',
      accent: 'text-cyan-700',
    },
    {
      key: 'admins',
      label: 'Administradores',
      value: summary.totalAdministrators,
      helper: `${summary.blockedUsers} bloqueados`,
      icon: ShieldCheck,
      tone: 'metric-card--coral',
      accent: 'text-orange-700',
    },
    {
      key: 'students',
      label: 'Alumnos',
      value: summary.totalStudents,
      helper: 'Registros operativos',
      icon: GraduationCap,
      tone: 'metric-card--blue',
      accent: 'text-blue-700',
    },
    {
      key: 'teachers',
      label: 'Docentes',
      value: summary.totalTeachers,
      helper: 'Registros operativos',
      icon: UsersRound,
      tone: 'metric-card--teal',
      accent: 'text-teal-700',
    },
  ]

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Vision general"
          title="Dashboard ejecutivo"
          description="Esta portada muestra solo el estado global del sistema. El detalle institucional, los usuarios por rol y la auditoria viven en sus modulos."
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dashboardCards.map((card) => (
            <OverviewMetricCard
              key={card.key}
              label={card.label}
              value={card.value}
              helper={card.helper}
              icon={card.icon}
              tone={card.tone}
              accent={card.accent}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] xl:auto-rows-fr">
        <article className="soft-card workspace-gradient-panel flex h-full flex-col">
          <div className="border-b border-slate-200/70 pb-4">
            <span className="soft-title">Estado de plataforma</span>
            <h3 className="mt-2 text-3xl font-bold text-slate-950">
              Salud operativa del ecosistema
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Usa esta pantalla solo para entender el panorama general y entrar rapido al modulo correcto.
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              label="Usuarios"
              value={summary.totalUsers}
              helper="Cuentas registradas"
              tone="slate"
            />
            <SummaryTile
              label="Activas"
              value={summary.activeInstitutions}
              helper={`de ${summary.totalInstitutions} instituciones`}
              tone="cyan"
            />
            <SummaryTile
              label="Bloqueados"
              value={summary.blockedUsers}
              helper="Accesos inhabilitados"
              tone="amber"
            />
            <SummaryTile
              label="Fuente"
              value={sourceLabel}
              helper={isRemoteSession ? 'Sesion remota' : 'Sesion local'}
              tone="teal"
            />
          </div>
        </article>

        <article className="soft-card flex h-full flex-col bg-white">
          <div className="border-b border-slate-200 pb-4">
            <span className="soft-title">Uso recomendado</span>
            <h3 className="mt-2 text-3xl font-bold text-slate-950">
              Cada dato en su lugar
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Dashboard para resumen, instituciones para operacion institucional, usuarios para roles y auditoria para control tecnico.
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            <SummaryTile
              label="Instituciones"
              value="Activas"
              helper="Padrones, carreras y administradores"
              tone="cyan"
            />
            <SummaryTile
              label="Usuarios"
              value="Por rol"
              helper="Superadmins, admins, docentes y alumnos"
              tone="blue"
            />
            <SummaryTile
              label="Auditoria"
              value="Por institucion"
              helper="Metricas, drift y sincronizacion"
              tone="amber"
            />
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Accesos"
          title="Entrar al modulo correcto"
          description="Cada boton abre una vista enfocada. Asi evitamos repetir bloques y mantener todo amontonado en una sola pantalla."
        />

        <div className="grid gap-4 xl:grid-cols-3">
          <AccessCard
            to="/super-admin/instituciones"
            title="Instituciones"
            description="Lista de instituciones activas con alumnos, docentes, carreras y administradores."
            icon={Building2}
          />
          <AccessCard
            to="/super-admin/usuarios"
            title="Usuarios y accesos"
            description="Directorio de usuarios dividido por rol, con busqueda y gestion de accesos."
            icon={Users}
          />
          <AccessCard
            to="/super-admin/auditoria"
            title="Auditoria"
            description="Selector institucional, estado de padrones, drift y acciones de control."
            icon={Database}
          />
        </div>
      </section>

      {error && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error.message}
        </section>
      )}
    </div>
  )
}

export default SuperAdminOverviewPage
