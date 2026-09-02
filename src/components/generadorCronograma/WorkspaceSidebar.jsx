import {
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Home,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { motion } from 'framer-motion'

function WorkspaceSidebar({
  activeView = 'dashboard',
  checklist,
  dataReady = false,
  onSelectView,
  persistenceHeading,
  persistenceMessage,
  studentCount = 0,
  teacherCount = 0,
}) {
  const completedSteps = checklist.filter((item) => item.done).length
  const progressPercentage = Math.round((completedSteps / Math.max(checklist.length, 1)) * 100)

  const workflowSteps = [
    { step: '1', label: 'Cargar plantilla maestra', done: dataReady },
    { step: '2', label: 'Definir fechas', done: checklist.find((i) => i.label.includes('Llamados') || i.label.includes('Periodo'))?.done },
    { step: '3', label: 'Armar mesas', done: activeView === 'exam-engine-v21' && dataReady },
    { step: '4', label: 'Exportar', done: false },
  ]

  const navItems = [
    {
      key: 'dashboard',
      label: 'Inicio',
      helper: dataReady ? 'Institucion lista' : 'Completar datos base',
      icon: Home,
      accent: 'text-sky-300',
    },
    {
      key: 'students',
      label: 'Alumnos',
      helper: `${studentCount} registrados`,
      icon: UsersRound,
      accent: 'text-cyan-300',
    },
    {
      key: 'teachers',
      label: 'Docentes',
      helper: `${teacherCount} registrados`,
      icon: GraduationCap,
      accent: 'text-teal-300',
    },
    {
      key: 'exam-engine-v21',
      label: 'Mesas',
      helper: dataReady ? 'Generar cronograma' : 'Completa carga primero',
      icon: Sparkles,
      accent: 'text-amber-300',
    },
  ]

  return (
    <aside className="admin-workspace-sidebar surface-night min-w-0 self-stretch border-b border-white/10 p-4 text-white md:p-5 lg:border-b-0 lg:border-r">
      <motion.div animate={{ opacity: 1, y: 0 }} className="min-w-0" initial={{ opacity: 0, y: 10 }} transition={{ duration: 0.35 }}>
        <div className="admin-sidebar-intro">
          <div className="flex items-center gap-2">
            <span className="live-dot" />
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-teal-200">
              Centro de mesas
            </span>
          </div>
          <h2 className="mt-3 text-3xl font-bold leading-tight">
            Panel admin
          </h2>
          <p className="admin-sidebar-description mt-3 text-sm leading-6 text-slate-300">
            Inicio institucional, alumnos, docentes y mesas en modulos separados.
          </p>
        </div>

        <div className="admin-sidebar-workflow mt-6 space-y-3">
          {workflowSteps.map(({ step, label, done }) => (
            <div key={step} className="flex items-center gap-3">
              <span
                className={`step-pill flex h-9 w-9 items-center justify-center text-sm font-extrabold ${
                  done ? 'step-pill--done' : 'bg-white text-slate-950'
                }`}
                style={{ borderRadius: 8 }}
              >
                {step}
              </span>
              <span className={`text-sm font-semibold ${done ? 'text-emerald-200' : 'text-slate-100'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="admin-sidebar-nav mt-8 border-t border-white/10 pt-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-200">
            Modulos
          </p>
          <div className="admin-sidebar-nav-grid mt-4 min-w-0 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeView === item.key
              const isBlocked = item.key === 'exam-engine-v21' && !dataReady

              return (
                <button
                  key={item.key}
                  className={`super-admin-nav text-left ${isActive ? 'super-admin-nav--active' : ''} ${
                    isBlocked ? 'opacity-80' : ''
                  }`}
                  type="button"
                  onClick={() => onSelectView?.(item.key)}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${item.accent}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{item.label}</span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-300">
                      {item.helper}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="admin-sidebar-checklist mt-8 border-t border-white/10 pt-5">
          <p className="flex items-center gap-2 text-sm font-bold">
            <ClipboardCheck className="h-4 w-4 text-amber-300" />
            Checklist de carga
          </p>
          <p className="mt-2 text-4xl font-extrabold">
            {completedSteps}/{checklist.length}
          </p>
          <p className="mt-1 text-sm text-slate-200">requisitos completados</p>
          <div className="progress-track mt-4">
            <div className="progress-fill" style={{ width: `${progressPercentage}%` }} />
          </div>

          <div className="mt-4 space-y-2">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <CheckCircle2
                  className={`h-4 w-4 shrink-0 ${item.done ? 'text-emerald-300' : 'text-slate-500'}`}
                />
                <span className={item.done ? 'text-white' : 'text-slate-300'}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-sidebar-save mt-6 border-t border-white/10 pt-5">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-200">
            <CalendarCheck2 className="h-3.5 w-3.5" />
            Guardado
          </p>
          <p className="mt-3 text-xl font-extrabold text-white">{persistenceHeading}</p>
          <p className="mt-2 text-sm leading-6 text-slate-200">{persistenceMessage}</p>
        </div>
      </motion.div>
    </aside>
  )
}

export default WorkspaceSidebar
