import { lazy, Suspense, useDeferredValue, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  GraduationCap,
  PlusCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  UsersRound,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { NavLink } from 'react-router-dom'
import PaginationControls from '../components/PaginationControls.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { usePaginatedInstitutions } from '../hooks/usePaginatedInstitutions.js'
import { deleteInstitution, updateInstitution } from '../services/superAdmin.js'
import InstitutionPreviewControl from '../features/exams/components/InstitutionPreviewControl.jsx'

const CreateInstitutionModal = lazy(() => import('../components/CreateInstitutionModal.jsx'))

const PAGE_SIZE = 6

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

function CareerBreakdownTable({ careers = [] }) {
  if (careers.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
        Todavia no se detectaron carreras activas en el snapshot institucional.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="grid grid-cols-[minmax(0,1fr)_96px_96px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        <span>Carrera</span>
        <span className="text-right">Alumnos</span>
        <span className="text-right">Docentes</span>
      </div>

      {careers.map((career) => (
        <div
          key={career.name}
          className="grid grid-cols-[minmax(0,1fr)_96px_96px] gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-700 first:border-t-0"
        >
          <span className="font-semibold text-slate-950">{career.name}</span>
          <span className="text-right">{career.student_count}</span>
          <span className="text-right">{career.teacher_count}</span>
        </div>
      ))}
    </div>
  )
}

function SuperAdminInstitutionsPage() {
  const queryClient = useQueryClient()
  const { isRemoteSession, setActiveInstitutionId } = useAuth()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedInstitutionIds, setExpandedInstitutionIds] = useState([])
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const {
    data,
    error,
    isLoading,
    isFetching,
  } = usePaginatedInstitutions({
    page,
    pageSize: PAGE_SIZE,
    searchTerm: deferredSearchTerm,
    statusFilter: 'active',
    useRemote: isRemoteSession,
  })

  const institutions = data?.institutions ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 0
  const currentPage = data?.page ?? page

  function toggleInstitutionDetails(institutionId) {
    setExpandedInstitutionIds((current) => (
      current.includes(institutionId)
        ? current.filter((entry) => entry !== institutionId)
        : [...current, institutionId]
    ))
  }

  async function refreshData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'institutions', isRemoteSession] }),
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'summary', isRemoteSession] }),
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'users', isRemoteSession] }),
    ])
  }

  async function handleToggleStatus(institution) {
    const newStatus = institution.status === 'active' ? 'suspended' : 'active'
    const confirmMessage = newStatus === 'suspended'
      ? `Estas por bloquear el acceso a ${institution.name}.`
      : `Estas por volver a habilitar ${institution.name}.`

    if (!window.confirm(confirmMessage)) return

    try {
      await updateInstitution({
        id: institution.id,
        updates: { status: newStatus },
        useRemote: isRemoteSession,
      })
      toast.success(newStatus === 'active' ? 'Institucion habilitada' : 'Institucion bloqueada')
      await refreshData()
    } catch (mutationError) {
      toast.error(mutationError.message)
    }
  }

  async function handleDelete(institution) {
    if (!window.confirm(`Eliminar ${institution.name}? Esta accion no se puede deshacer.`)) return

    try {
      await deleteInstitution({ id: institution.id, useRemote: isRemoteSession })
      toast.success('Institucion eliminada correctamente')
      await refreshData()
    } catch (mutationError) {
      toast.error(mutationError.message)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-6 text-slate-600">Cargando instituciones...</div>
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        <p>{error.message || 'No se pudieron cargar las instituciones.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <span className="soft-title">Instituciones</span>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Instituciones activas</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Esta vista queda reservada para las instituciones operativas, con sus alumnos, docentes, carreras activas y administradores.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto sm:flex-row">
          <label className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input-base pl-9"
              placeholder="Buscar por nombre, slug o plan"
              type="search"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value)
                setPage(1)
              }}
            />
          </label>

          <button className="btn-primary w-full sm:w-auto" onClick={() => setIsModalOpen(true)} type="button">
            <PlusCircle className="h-4 w-4" />
            Crear nueva institucion
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white/86 px-4 py-3 text-sm text-slate-600">
        {total === 0
          ? 'No hay instituciones activas para el criterio aplicado.'
          : `Mostrando ${institutions.length} instituciones activas en esta pagina. Cada tarjeta resume alumnos, docentes, carreras y administradores.`}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {institutions.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-14 text-center text-slate-500 xl:col-span-2">
            No hay instituciones activas registradas.
          </div>
        )}

        {institutions.map((institution) => {
          const isExpanded = expandedInstitutionIds.includes(institution.id)
          const statusChipClass = institution.status === 'active'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-amber-200 bg-amber-50 text-amber-900'

          return (
            <article key={institution.id} className="soft-card flex h-full flex-col bg-white">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-2xl font-bold text-slate-950">{institution.name}</h3>
                    <span className={`status-chip ${statusChipClass}`}>
                      {institution.status === 'active' ? 'Activa' : 'Suspendida'}
                    </span>
                    <span className="status-chip border-slate-200 bg-slate-50 text-slate-700">
                      Plan {institution.plan_type}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{institution.slug}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Creada {institution.created_at ? new Date(institution.created_at).toLocaleDateString() : 'N/D'}
                  </p>
                </div>

                <div className="flex gap-2 self-start">
                  <button
                    className={`btn-secondary p-2 ${
                      institution.status === 'active'
                        ? 'text-amber-600 hover:bg-amber-50'
                        : 'text-emerald-600 hover:bg-emerald-50'
                    }`}
                    onClick={() => handleToggleStatus(institution)}
                    title={institution.status === 'active' ? 'Bloquear' : 'Habilitar'}
                    type="button"
                  >
                    {institution.status === 'active' ? (
                      <ShieldAlert className="h-4 w-4" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    className="btn-secondary p-2 text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(institution)}
                    title="Eliminar"
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <SummaryTile
                  label="Administradores"
                  value={institution.admin_count ?? 0}
                  helper="Usuarios con acceso de gestion"
                  tone="slate"
                />
                <SummaryTile
                  label="Carreras activas"
                  value={institution.active_career_count ?? 0}
                  helper="Detectadas en el snapshot"
                  tone="cyan"
                />
                <SummaryTile
                  label="Alumnos"
                  value={institution.student_count ?? 0}
                  helper="Personas en padron"
                  tone="blue"
                />
                <SummaryTile
                  label="Docentes"
                  value={institution.teacher_count ?? 0}
                  helper="Personas en padron"
                  tone="teal"
                />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <NavLink
                  className="btn-primary w-full"
                  to={`/super-admin/instituciones/${institution.id}/alumnos`}
                  onClick={() => setActiveInstitutionId(institution.id)}
                >
                  <GraduationCap className="h-4 w-4" />
                  Ver alumnos
                </NavLink>
                <NavLink
                  className="btn-secondary w-full"
                  to={`/super-admin/instituciones/${institution.id}/docentes`}
                  onClick={() => setActiveInstitutionId(institution.id)}
                >
                  <UsersRound className="h-4 w-4" />
                  Ver docentes
                </NavLink>
                <button
                  className="btn-secondary w-full"
                  type="button"
                  onClick={() => toggleInstitutionDetails(institution.id)}
                >
                  <Users className="h-4 w-4" />
                  {isExpanded ? 'Ocultar carreras' : 'Ver carreras'}
                </button>
              </div>

              <InstitutionPreviewControl institution={institution} />

              {isExpanded && (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-950">Distribucion por carrera</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Cantidad de alumnos y docentes detectados por carrera.
                      </p>
                    </div>
                    <span className="status-chip border-slate-200 bg-slate-50 text-slate-700">
                      {institution.active_career_count ?? 0}
                    </span>
                  </div>

                  <CareerBreakdownTable careers={institution.career_breakdown ?? []} />
                </div>
              )}
            </article>
          )
        })}
      </div>

      <PaginationControls
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        isFetching={isFetching}
        onNext={() => setPage((current) => current + 1)}
        onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
      />

      <Suspense fallback={null}>
        {isModalOpen && (
          <CreateInstitutionModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSuccess={refreshData}
          />
        )}
      </Suspense>
    </div>
  )
}

export default SuperAdminInstitutionsPage
