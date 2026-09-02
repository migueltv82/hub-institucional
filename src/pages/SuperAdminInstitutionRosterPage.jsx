import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Building2, GraduationCap, Phone, Search, ShieldCheck, UsersRound } from 'lucide-react'
import { NavLink, useParams } from 'react-router-dom'
import PaginationControls from '../components/PaginationControls.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useInstitutionRosterDirectory } from '../hooks/useInstitutionRosterDirectory.js'
import { useSuperAdminSummary } from '../hooks/useSuperAdminSummary.js'

const PAGE_SIZE = 12

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matchesAudienceSearch(item, audience, searchTerm) {
  const normalizedSearch = normalizeText(searchTerm)
  if (!normalizedSearch) return true

  const commonFields = [
    item.full_name,
    item.status,
    item.phone,
  ]

  if (audience === 'teachers') {
    commonFields.push(item.dni, item.careers_label, ...(item.careers ?? []))
  } else {
    commonFields.push(item.email, item.career, item.academic_year, item.dni, item.legajo)
  }

  return commonFields.some((value) => normalizeText(value).includes(normalizedSearch))
}

function isActiveStatus(status) {
  return !['inactivo', 'inactive', 'bloqueado', 'blocked', 'suspendido', 'suspended', 'baja'].includes(normalizeText(status))
}

function StatTile({ label, value, helper, icon: Icon, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-950',
    blue: 'border-blue-200 bg-blue-50/90 text-blue-950',
    teal: 'border-teal-200 bg-teal-50/90 text-teal-950',
    amber: 'border-amber-200 bg-amber-50/90 text-amber-950',
  }[tone]

  return (
    <article className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-current" />}
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      {helper && <p className="mt-2 text-sm text-slate-600">{helper}</p>}
    </article>
  )
}

export default function SuperAdminInstitutionRosterPage({ audience = 'students' }) {
  const { institutionId } = useParams()
  const {
    activeInstitutionId,
    institutions,
    isRemoteSession,
    setActiveInstitutionId,
  } = useAuth()
  const [pageState, setPageState] = useState({ contextKey: '', page: 1 })
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const {
    data: summary,
  } = useSuperAdminSummary({ useRemote: isRemoteSession })
  const {
    data,
    error,
    isLoading,
    isFetching,
  } = useInstitutionRosterDirectory({
    institutionId,
    audience,
    useRemote: isRemoteSession,
  })

  useEffect(() => {
    if (institutionId && institutionId !== activeInstitutionId) {
      setActiveInstitutionId(institutionId)
    }
  }, [activeInstitutionId, institutionId, setActiveInstitutionId])

  const paginationContextKey = `${institutionId ?? 'none'}:${audience}`
  const page = pageState.contextKey === paginationContextKey ? pageState.page : 1
  const institution = useMemo(
    () => summary?.institutions?.find((entry) => entry.id === institutionId)
      ?? institutions.find((entry) => entry.id === institutionId)
      ?? null,
    [institutionId, institutions, summary?.institutions],
  )
  const items = useMemo(
    () => (data?.items ?? []).filter((item) => matchesAudienceSearch(item, audience, deferredSearchTerm)),
    [audience, data?.items, deferredSearchTerm],
  )
  const totalPages = items.length === 0 ? 0 : Math.ceil(items.length / PAGE_SIZE)
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages)
  const paginatedItems = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE
    return items.slice(from, from + PAGE_SIZE)
  }, [items, safePage])
  function updatePage(nextPage) {
    setPageState((current) => {
      const currentPage = current.contextKey === paginationContextKey ? current.page : 1
      const resolvedPage = typeof nextPage === 'function' ? nextPage(currentPage) : nextPage

      return {
        contextKey: paginationContextKey,
        page: resolvedPage,
      }
    })
  }

  const activeCount = items.filter((item) => isActiveStatus(item.status)).length
  const secondaryMetric = audience === 'teachers'
    ? new Set(items.flatMap((item) => item.careers ?? []).filter(Boolean)).size
    : new Set(items.map((item) => item.career).filter(Boolean)).size
  const tertiaryMetric = audience === 'teachers'
    ? items.filter((item) => item.phone).length
    : new Set(items.map((item) => item.academic_year).filter(Boolean)).size
  const title = audience === 'teachers' ? 'Docentes por institucion' : 'Alumnos por institucion'
  const description = audience === 'teachers'
    ? 'Consulta el padron docente operativo de la institucion seleccionada.'
    : 'Consulta el padron de alumnos cargado en la institucion seleccionada.'

  if (!institutionId) {
    return (
      <section className="soft-card">
        <h2 className="text-2xl font-bold text-slate-950">Selecciona una institucion</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Usa la barra lateral para abrir el padron de alumnos o docentes de una institucion.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <article className="soft-card workspace-gradient-panel">
          <span className="soft-title">Institucion activa</span>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">
            {institution?.name ?? 'Institucion no encontrada'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {description}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-chip border-slate-200 bg-white/90 text-slate-800">
              <Building2 className="h-4 w-4 text-cyan-700" />
              {institution?.slug ?? 'sin-slug'}
            </span>
            <span className={`status-chip ${
              institution?.status === 'active'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}>
              <ShieldCheck className="h-4 w-4" />
              {institution?.status === 'active' ? 'Activa' : 'Suspendida'}
            </span>
            {institution?.plan_type && (
              <span className="status-chip border-slate-200 bg-white/90 text-slate-700">
                Plan {institution.plan_type}
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <NavLink
              to={`/super-admin/instituciones/${institutionId}/alumnos`}
              className={`btn-secondary w-full ${audience === 'students' ? 'border-blue-300 bg-blue-50 text-blue-900' : ''}`}
              onClick={() => setActiveInstitutionId(institutionId)}
            >
              <GraduationCap className="h-4 w-4" />
              Alumnos
            </NavLink>
            <NavLink
              to={`/super-admin/instituciones/${institutionId}/docentes`}
              className={`btn-secondary w-full ${audience === 'teachers' ? 'border-teal-300 bg-teal-50 text-teal-900' : ''}`}
              onClick={() => setActiveInstitutionId(institutionId)}
            >
              <UsersRound className="h-4 w-4" />
              Docentes
            </NavLink>
          </div>
        </article>

        <article className="soft-card soft-card--tint-sky">
          <span className="soft-title">Navegacion operativa</span>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Esta vista usa el snapshot institucional como fuente operativa para mantener el padron visible incluso cuando todavia no se sincronizo a tablas auxiliares.
          </p>

          {data?.updatedAt && (
            <p className="mt-4 rounded-lg border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
              Ultima actualizacion del workspace: {new Date(data.updatedAt).toLocaleString()}
            </p>
          )}
        </article>
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatTile
          label={audience === 'teachers' ? 'Docentes' : 'Alumnos'}
          value={items.length}
          helper={audience === 'teachers' ? 'Registros visibles en el padron' : 'Registros visibles en el padron'}
          icon={audience === 'teachers' ? UsersRound : GraduationCap}
          tone={audience === 'teachers' ? 'teal' : 'blue'}
        />
        <StatTile
          label="Activos"
          value={activeCount}
          helper="Segun el estado operativo del padron"
          icon={ShieldCheck}
          tone="slate"
        />
        <StatTile
          label={audience === 'teachers' ? 'Carreras cubiertas' : 'Carreras'}
          value={secondaryMetric}
          helper={audience === 'teachers' ? 'Asignadas al equipo docente' : 'Con alumnos cargados'}
          icon={Building2}
          tone="amber"
        />
        <StatTile
          label={audience === 'teachers' ? 'Con telefono' : 'Anios'}
          value={tertiaryMetric}
          helper={audience === 'teachers' ? 'Docentes con contacto visible' : 'Anios academicos representados'}
          icon={Phone}
          tone="teal"
        />
      </section>

      <section className="soft-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="soft-title">Padron</span>
            <h3 className="mt-2 text-2xl font-bold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Usa la busqueda para filtrar nombres, carreras, contacto o identificadores.
            </p>
          </div>

          <label className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input-base pl-9"
              placeholder={audience === 'teachers' ? 'Buscar docente, DNI o carrera' : 'Buscar alumno, email o carrera'}
              type="search"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value)
                updatePage(1)
              }}
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error.message || 'No se pudo cargar el padron institucional.'}
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              {audience === 'teachers' ? (
                <tr>
                  <th className="px-4 py-3">Docente</th>
                  <th className="px-4 py-3">DNI</th>
                  <th className="px-4 py-3">Carreras</th>
                  <th className="px-4 py-3">Telefono</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-4 py-3">Alumno</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Carrera</th>
                  <th className="px-4 py-3">Anio</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!isLoading && paginatedItems.length === 0 && (
                <tr>
                  <td colSpan={audience === 'teachers' ? 5 : 5} className="px-4 py-12 text-center text-slate-500">
                    No hay registros para los filtros aplicados.
                  </td>
                </tr>
              )}

              {paginatedItems.map((item) => (
                audience === 'teachers' ? (
                  <tr key={item.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{item.full_name}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.dni || '-'}</td>
                    <td className="px-4 py-4 text-slate-700">{item.careers_label}</td>
                    <td className="px-4 py-4 text-slate-700">{item.phone || '-'}</td>
                    <td className="px-4 py-4">
                      <span className={`status-chip ${
                        isActiveStatus(item.status)
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}>
                        {item.status || 'sin estado'}
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{item.full_name}</p>
                      {item.dni && <p className="mt-1 text-xs text-slate-500">DNI {item.dni}</p>}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.email || '-'}</td>
                    <td className="px-4 py-4 text-slate-700">{item.career || '-'}</td>
                    <td className="px-4 py-4 text-slate-700">{item.academic_year || '-'}</td>
                    <td className="px-4 py-4">
                      <span className={`status-chip ${
                        isActiveStatus(item.status)
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}>
                        {item.status || 'sin estado'}
                      </span>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <PaginationControls
            page={safePage}
            pageSize={PAGE_SIZE}
            total={items.length}
            totalPages={totalPages}
            isFetching={isFetching}
            onPrevious={() => updatePage((current) => Math.max(current - 1, 1))}
            onNext={() => updatePage((current) => Math.min(current + 1, totalPages || 1))}
          />
        </div>
      </section>
    </div>
  )
}
