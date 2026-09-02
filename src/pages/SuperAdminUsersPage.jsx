import { lazy, Suspense, useDeferredValue, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  BookOpen,
  GraduationCap,
  KeyRound,
  Pencil,
  PlusCircle,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import PaginationControls from '../components/PaginationControls.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useUsersDirectoryPage } from '../hooks/usePaginatedUsers.js'
import {
  deleteUser,
  getAllInstitutions,
  removeUserInstitutionAccess,
  toggleUserBlockedStatus,
  updateUserInstitutionRole,
} from '../services/superAdmin.js'
import ResetUserPasswordModal from '../components/ResetUserPasswordModal.jsx'

const CreateInstitutionUserModal = lazy(() => import('../components/CreateInstitutionUserModal.jsx'))

const MEMBERSHIP_ROLES = ['owner', 'admin', 'editor', 'viewer']
const PAGE_SIZE = 8
const EMPTY_USERS = []
const EMPTY_ROLE_SUMMARY = []
const ROLE_OPTIONS = {
  superadmin: {
    icon: ShieldCheck,
    tone: 'metric-card--blue',
  },
  administrators: {
    icon: Users,
    tone: 'metric-card--teal',
  },
  teachers: {
    icon: BookOpen,
    tone: 'metric-card--coral',
  },
  students: {
    icon: GraduationCap,
    tone: 'metric-card--cyan',
  },
}

function normalizeRoleParam(value) {
  const normalizedValue = String(value ?? '').trim().toLowerCase()
  return ['superadmin', 'administrators', 'teachers', 'students'].includes(normalizedValue)
    ? normalizedValue
    : null
}

function buildInstitutionSummary(user) {
  if (user.is_global_admin && user.institutions.length === 0) {
    return 'Gobierno central'
  }

  if (user.institutions.length === 0) {
    return 'Sin instituciones asignadas'
  }

  return `${user.institutions.length} institucion${user.institutions.length === 1 ? '' : 'es'} asignada${user.institutions.length === 1 ? '' : 's'}`
}

function SuperAdminUsersPage() {
  const queryClient = useQueryClient()
  const { isRemoteSession } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [passwordUser, setPasswordUser] = useState(null)
  const [busyKey, setBusyKey] = useState('')
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const selectedRole = normalizeRoleParam(searchParams.get('rol'))

  const {
    data: usersPage,
    error,
    isLoading,
    isFetching,
  } = useUsersDirectoryPage({
    page,
    pageSize: PAGE_SIZE,
    searchTerm: deferredSearchTerm,
    selectedRole,
    useRemote: isRemoteSession,
  })

  const {
    data: institutionsCatalog,
  } = useQuery({
    queryKey: ['super-admin', 'institutions-catalog', isRemoteSession],
    queryFn: () => getAllInstitutions({ useRemote: isRemoteSession }),
  })

  const users = usersPage?.users ?? EMPTY_USERS
  const institutions = institutionsCatalog?.institutions ?? []
  const roleSummary = useMemo(() => usersPage?.roleSummary ?? EMPTY_ROLE_SUMMARY, [usersPage?.roleSummary])
  const currentPage = usersPage?.page ?? page
  const total = usersPage?.total ?? 0
  const totalPages = usersPage?.totalPages ?? 0
  const selectedRoleSummary = roleSummary.find((role) => role.key === selectedRole) ?? null

  const roleCards = useMemo(() => {
    const summaryByKey = new Map(roleSummary.map((role) => [role.key, role]))

    return Object.entries(ROLE_OPTIONS).map(([key, config]) => ({
      key,
      icon: config.icon,
      tone: config.tone,
      label: summaryByKey.get(key)?.label ?? key,
      description: summaryByKey.get(key)?.description ?? '',
      count: summaryByKey.get(key)?.count ?? 0,
      isActive: selectedRole === key,
    }))
  }, [roleSummary, selectedRole])

  async function refreshData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'users-directory', isRemoteSession] }),
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'users', isRemoteSession] }),
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'institutions', isRemoteSession] }),
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'institutions-catalog', isRemoteSession] }),
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'summary', isRemoteSession] }),
    ])
  }

  function handleRoleSelection(roleKey) {
    setPage(1)
    setSearchTerm('')
    setSearchParams({ rol: roleKey })
  }

  function clearRoleSelection() {
    setPage(1)
    setSearchTerm('')
    setSearchParams({})
  }

  async function handleRoleChange(user, institution, nextRole) {
    const actionKey = `role:${user.id}:${institution.id}`
    setBusyKey(actionKey)

    try {
      await updateUserInstitutionRole({
        userId: user.id,
        institutionId: institution.id,
        role: nextRole,
        useRemote: isRemoteSession,
      })
      toast.success(`Rol actualizado para ${institution.name}`)
      await refreshData()
    } catch (mutationError) {
      toast.error(mutationError.message)
    } finally {
      setBusyKey('')
    }
  }

  async function handleRemoveAccess(user, institution) {
    if (!window.confirm(`Quitar a ${user.display_name} de ${institution.name}?`)) return

    const actionKey = `remove:${user.id}:${institution.id}`
    setBusyKey(actionKey)

    try {
      await removeUserInstitutionAccess({
        userId: user.id,
        institutionId: institution.id,
        useRemote: isRemoteSession,
      })
      toast.success('Acceso eliminado correctamente')
      await refreshData()
    } catch (mutationError) {
      toast.error(mutationError.message)
    } finally {
      setBusyKey('')
    }
  }

  async function handleToggleBlocked(user) {
    const shouldBlock = !user.is_blocked
    const verb = shouldBlock ? 'bloquear' : 'habilitar'

    if (!window.confirm(`Estas por ${verb} la cuenta ${user.email}.`)) return

    const actionKey = `block:${user.id}`
    setBusyKey(actionKey)

    try {
      await toggleUserBlockedStatus({
        userId: user.id,
        shouldBlock,
        useRemote: isRemoteSession,
      })
      toast.success(shouldBlock ? 'Usuario bloqueado' : 'Usuario habilitado')
      await refreshData()
    } catch (mutationError) {
      toast.error(mutationError.message)
    } finally {
      setBusyKey('')
    }
  }

  function openPasswordReset(user) {
    setPasswordUser(user)
  }

  async function handleDeleteUser(user) {
    if (user.is_global_admin) {
      toast.error('No se puede eliminar un usuario superadmin desde este panel.')
      return
    }

    const confirmed = window.confirm(
      `Estas por eliminar definitivamente a ${user.display_name} (${user.email}). Esta accion quitara todos sus accesos.`
    )

    if (!confirmed) return

    const actionKey = `delete:${user.id}`
    setBusyKey(actionKey)

    try {
      await deleteUser({
        userId: user.id,
        useRemote: isRemoteSession,
      })
      toast.success('Usuario eliminado correctamente')
      await refreshData()
    } catch (mutationError) {
      toast.error(mutationError.message)
    } finally {
      setBusyKey('')
    }
  }

  if (isLoading) {
    return <div className="p-6 text-slate-600">Cargando roles y usuarios...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold text-slate-950">Usuarios y accesos</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Esta vista queda dedicada al directorio de usuarios por rol. Primero elegi el grupo y despues filtra por nombre,
            apellido, DNI o institucion para ubicar rapido cada acceso.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          {selectedRole && (
            <button className="btn-secondary w-full sm:w-auto" onClick={clearRoleSelection} type="button">
              Volver a roles
            </button>
          )}
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => {
              setSelectedUser(null)
              setIsModalOpen(true)
            }}
            type="button"
            disabled={institutions.length === 0}
          >
            <PlusCircle className="h-4 w-4" />
            Nuevo usuario
          </button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {roleCards.map((role) => {
          const Icon = role.icon

          return (
            <button
              key={role.key}
              className={`metric-card h-full w-full text-left ${role.tone} ${
                role.isActive ? 'border-cyan-300 bg-cyan-50/70 shadow-lg' : ''
              }`}
              onClick={() => handleRoleSelection(role.key)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{role.label}</p>
                  <p className="mt-3 text-4xl font-bold text-slate-950">{role.count}</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white/90 p-2 text-slate-700">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{role.description}</p>
            </button>
          )
        })}
      </section>

      {institutions.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No hay instituciones cargadas todavia. Crea una institucion antes de dar de alta usuarios.
        </div>
      )}

      {!selectedRole && (
        <section className="soft-card bg-white">
          <span className="soft-title">Seleccion guiada</span>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">Elegi un rol para empezar</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Superadmins, administradores, docentes y alumnos viven en el mismo directorio, pero se consultan por separado
            para no mezclar perfiles distintos en una sola lista.
          </p>
        </section>
      )}

      {selectedRole && (
        <>
          <section className="soft-card bg-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <span className="soft-title">Rol seleccionado</span>
                <h3 className="mt-2 text-2xl font-bold text-slate-950">
                  {selectedRoleSummary?.label ?? 'Usuarios'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedRoleSummary?.description ?? 'Directorio operativo filtrado por rol.'}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 lg:w-auto sm:flex-row">
                <label className="relative w-full sm:min-w-[320px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input-base pl-9"
                    placeholder="Buscar por nombre, apellido, DNI o institucion"
                    type="search"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value)
                      setPage(1)
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="status-chip border-cyan-200 bg-cyan-50 text-cyan-900">
                {total} resultado{total === 1 ? '' : 's'}
              </span>
              <span className="status-chip border-slate-200 bg-slate-50 text-slate-700">
                {usersPage?.totalUsers ?? 0} usuarios totales en la plataforma
              </span>
            </div>
          </section>

          {(selectedRole === 'teachers' || selectedRole === 'students') && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              Las altas de alumnos y docentes se originan desde sus padrones. Aqui solo se auditan cuentas, estados de acceso
              y vinculaciones institucionales.
            </div>
          )}
        </>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message || 'No se pudieron cargar los usuarios.'}
        </div>
      )}

      {selectedRole && (
        <div className="space-y-4">
          {users.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-14 text-center text-slate-500">
              No hay usuarios para este rol con el filtro actual.
            </div>
          )}

          {users.map((user) => (
            <article key={user.id} className="soft-card bg-white">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    {selectedRoleSummary?.label ?? 'Usuarios'}
                  </p>
                  <h4 className="mt-2 text-2xl font-bold text-slate-950">{user.display_name}</h4>
                  <p className="mt-2 break-all text-sm text-slate-500">{user.email}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{buildInstitutionSummary(user)}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
                      Rol base {user.account_role}
                    </span>
                    {user.dni && (
                      <span className="status-chip border-slate-200 bg-slate-50 text-slate-700">
                        DNI {user.dni}
                      </span>
                    )}
                    {user.is_global_admin && (
                      <span className="status-chip border-emerald-200 bg-emerald-50 text-emerald-900">
                        <ShieldCheck className="h-4 w-4" />
                        Superadmin
                      </span>
                    )}
                    {user.is_blocked ? (
                      <span className="status-chip border-red-200 bg-red-50 text-red-900">
                        <Ban className="h-4 w-4" />
                        Bloqueado
                      </span>
                    ) : (
                      <span className="status-chip border-cyan-200 bg-cyan-50 text-cyan-900">
                        Activo
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {user.can_manage_memberships && (
                    <button
                      className="btn-secondary w-full"
                      onClick={() => {
                        setSelectedUser(user)
                        setIsModalOpen(true)
                      }}
                      type="button"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar usuario
                    </button>
                  )}
                  <button
                    className={`btn-secondary w-full ${user.is_blocked ? 'text-emerald-700' : 'text-red-700'}`}
                    onClick={() => handleToggleBlocked(user)}
                    type="button"
                    disabled={busyKey === `block:${user.id}`}
                  >
                    {user.is_blocked ? <ShieldOff className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    {user.is_blocked ? 'Habilitar acceso' : 'Bloquear acceso'}
                  </button>
                  <button
                    className="btn-secondary w-full"
                    onClick={() => openPasswordReset(user)}
                    type="button"
                    disabled={busyKey === `password:${user.id}`}
                  >
                    <KeyRound className="h-4 w-4" />
                    Resetear contrasena
                  </button>
                  <button
                    className="btn-secondary w-full text-red-700"
                    onClick={() => handleDeleteUser(user)}
                    type="button"
                    disabled={user.is_global_admin || busyKey === `delete:${user.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar usuario
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Accesos institucionales
                </p>

                {user.institutions.length === 0 && (
                  <p className="text-sm text-slate-500">Sin instituciones asignadas.</p>
                )}

                {user.can_manage_memberships ? (
                  user.institutions.map((institution) => {
                    const roleActionKey = `role:${user.id}:${institution.id}`
                    const removeActionKey = `remove:${user.id}:${institution.id}`

                    return (
                      <div
                        key={`${user.id}-${institution.id}`}
                        className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_auto]"
                      >
                        <div>
                          <p className="font-semibold text-slate-950">{institution.name}</p>
                          <p className="text-sm text-slate-500">{institution.slug}</p>
                        </div>

                        <select
                          className="input-base w-full min-w-0 lg:min-w-[180px]"
                          value={institution.role}
                          disabled={busyKey === roleActionKey}
                          onChange={(event) => handleRoleChange(user, institution, event.target.value)}
                        >
                          {MEMBERSHIP_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>

                        <button
                          className="btn-secondary w-full text-red-700 lg:w-auto"
                          onClick={() => handleRemoveAccess(user, institution)}
                          type="button"
                          disabled={busyKey === removeActionKey}
                        >
                          <Trash2 className="h-4 w-4" />
                          Quitar acceso
                        </button>
                      </div>
                    )
                  })
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {user.institutions.map((institution) => (
                      <span
                        key={`${user.id}-${institution.id}`}
                        className="status-chip border-slate-200 bg-slate-50 text-slate-700"
                      >
                        {institution.name} | {institution.role}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedRole && (
        <PaginationControls
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={total}
          totalPages={totalPages}
          isFetching={isFetching}
          onNext={() => setPage((current) => current + 1)}
          onPrevious={() => setPage((current) => Math.max(current - 1, 1))}
        />
      )}

      <Suspense fallback={null}>
        {isModalOpen && (
          <CreateInstitutionUserModal
            institutions={institutions}
            initialUser={selectedUser}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false)
              setSelectedUser(null)
            }}
            onSuccess={refreshData}
          />
        )}
      </Suspense>

      <ResetUserPasswordModal
        user={passwordUser}
        isOpen={Boolean(passwordUser)}
        onClose={() => setPasswordUser(null)}
        onSuccess={refreshData}
      />
    </div>
  )
}

export default SuperAdminUsersPage
