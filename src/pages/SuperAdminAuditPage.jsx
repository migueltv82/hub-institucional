import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  Building2,
  Database,
  RefreshCw,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { useRosterAudit } from '../hooks/useRosterAudit.js'
import { useSuperAdminSummary } from '../hooks/useSuperAdminSummary.js'
import { resyncRosterFromSnapshot } from '../services/rosterAudit.js'

const EMPTY_ARRAY = []

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

function SummaryTile({ label, value, helper, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white/90',
    cyan: 'border-cyan-200 bg-cyan-50/70',
    teal: 'border-teal-200 bg-teal-50/70',
    amber: 'border-amber-200 bg-amber-50/70',
    sky: 'border-sky-200 bg-sky-50/70',
  }[tone]

  return (
    <div className={`status-tile h-full ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      {helper && <p className="mt-1 text-sm text-slate-500">{helper}</p>}
    </div>
  )
}

function AuditStatusBanner({ tone = 'slate', children }) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900',
  }[tone]

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${toneClass}`}>
      {children}
    </div>
  )
}

function AuditMetricCard({ label, value, helper, icon: Icon, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-950',
    sky: 'border-sky-200 bg-sky-50/80 text-sky-950',
    teal: 'border-teal-200 bg-teal-50/80 text-teal-950',
    amber: 'border-amber-200 bg-amber-50/90 text-amber-950',
  }[tone]

  return (
    <article className={`h-full rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-current" />}
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      {helper && <p className="mt-2 text-sm text-slate-600">{helper}</p>}
    </article>
  )
}

function renderStudentAuditItem(item) {
  const email = item?.email || 'sin-email'
  const fullName = item?.full_name || email
  const career = item?.career || 'Sin carrera'
  return `${fullName} | ${email} | ${career}`
}

function renderTeacherAuditItem(item) {
  const fullName = item?.full_name || 'Docente sin nombre'
  const dni = item?.dni || 'sin-dni'
  return `${fullName} | DNI ${dni}`
}

function AuditDiffBlock({ title, items = EMPTY_ARRAY, formatter }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-950">{title}</p>
        <span className="status-chip border-slate-200 bg-white text-slate-700">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sin registros para revisar.</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          {items.slice(0, 5).map((item, index) => (
            <p key={`${title}-${formatter(item)}-${index}`}>{formatter(item)}</p>
          ))}
          {items.length > 5 && (
            <p className="font-semibold text-slate-500">+ {items.length - 5} registros mas</p>
          )}
        </div>
      )}
    </div>
  )
}

function DatasetAuditCard({ title, audit, formatter }) {
  if (!audit) return null

  return (
    <article className="h-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{title}</p>
          <h4 className="mt-2 text-2xl font-bold text-slate-950">
            {audit.aligned ? 'Alineado' : 'Con desvio'}
          </h4>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Snapshot crudo: {audit.snapshotRows} filas. Esperado: {audit.expectedCount}. Guardado: {audit.actualCount}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
            Esperado {audit.expectedCount}
          </span>
          <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
            Guardado {audit.actualCount}
          </span>
          <span className={`status-chip ${
            audit.aligned
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}>
            {audit.aligned ? 'Sin drift' : `${audit.missingFromTable.length + audit.onlyInTable.length} diferencias`}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AuditDiffBlock
          title="Faltan en tabla"
          items={audit.missingFromTable}
          formatter={formatter}
        />
        <AuditDiffBlock
          title="Sobran en tabla"
          items={audit.onlyInTable}
          formatter={formatter}
        />
      </div>

      {audit.aligned && (
        <p className="mt-4 text-sm text-emerald-700">
          El snapshot y la tabla normalizada coinciden para este dataset.
        </p>
      )}
    </article>
  )
}

function SuperAdminAuditPage() {
  const {
    activeInstitutionId,
    isRemoteSession,
    setActiveInstitutionId,
  } = useAuth()
  const [isResyncingRoster, setIsResyncingRoster] = useState(false)
  const {
    data: summary = {
      institutions: [],
      source: 'local',
    },
  } = useSuperAdminSummary({ useRemote: isRemoteSession })
  const {
    data: rosterAudit,
    error: rosterAuditError,
    isFetching: isFetchingRosterAudit,
    refetch: refetchRosterAudit,
  } = useRosterAudit({
    institutionId: activeInstitutionId,
    useRemote: isRemoteSession,
  })

  const selectableInstitutions = summary.institutions ?? EMPTY_ARRAY
  const currentInstitution = selectableInstitutions.find((institution) => institution.id === activeInstitutionId) ?? null
  const sourceLabel = summary.source === 'supabase' ? 'Supabase' : 'Demo local'
  const rosterDrift = rosterAudit?.overall?.driftCount ?? 0
  const rosterIsAligned = Boolean(rosterAudit?.overall?.aligned)
  const auditIsReady = rosterAudit?.status === 'ready'
  const auditStatusClass = auditIsReady
    ? rosterIsAligned
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-slate-200 bg-slate-50 text-slate-700'
  const auditStatusLabel = !activeInstitutionId
    ? 'Sin institucion'
    : auditIsReady
      ? rosterIsAligned
        ? 'Estado alineado'
        : 'Revision pendiente'
      : rosterAudit?.status === 'schema-missing'
        ? 'Esquema incompleto'
        : rosterAudit?.status === 'local-only'
          ? 'Sesion local'
          : 'Esperando auditoria'

  async function handleResyncRoster() {
    if (!activeInstitutionId) {
      toast.error('Selecciona una institucion antes de re-sincronizar padrones.')
      return
    }

    try {
      setIsResyncingRoster(true)
      const result = await resyncRosterFromSnapshot({
        institutionId: activeInstitutionId,
        useRemote: isRemoteSession,
      })

      if (result.students?.skipped && result.teachers?.skipped) {
        toast.error('No se pudo sincronizar porque faltan las tablas normalizadas en Supabase.')
        return
      }

      const studentSummary = result.students?.skipped
        ? null
        : `${result.students?.synced ?? 0} alumnos`
      const teacherSummary = result.teachers?.skipped
        ? null
        : `${result.teachers?.synced ?? 0} docentes`
      const syncSummary = [studentSummary, teacherSummary].filter(Boolean).join(' y ')

      toast.success(`Padrones re-sincronizados${syncSummary ? `: ${syncSummary}.` : '.'}`)
      await refetchRosterAudit()
    } catch (syncError) {
      toast.error(syncError.message || 'No se pudo re-sincronizar el padron.')
    } finally {
      setIsResyncingRoster(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Auditoria"
          title="Control institucional"
          description="Esta pantalla concentra el monitoreo tecnico. Primero selecciona la institucion y despues revisa sus metricas, drift y sincronizacion."
        />

        <article className="soft-card bg-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <span className="soft-title">Institucion auditada</span>
              <h3 className="mt-2 text-3xl font-bold text-slate-950">
                {currentInstitution?.name ?? 'Selecciona una institucion'}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                El selector vive dentro de auditoria para que no dependas del dashboard ni de otra pantalla para controlar el sitio.
              </p>
            </div>

            <div className="w-full lg:max-w-md">
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Elegir institucion
              </label>
              <select
                className="input-base mt-2"
                value={activeInstitutionId ?? ''}
                onChange={(event) => setActiveInstitutionId(event.target.value || null)}
              >
                <option value="">Seleccionar institucion</option>
                {selectableInstitutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentInstitution && (
            <div className="mt-5 flex flex-wrap gap-2">
              <span className={`status-chip ${
                currentInstitution.status === 'active'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}>
                {currentInstitution.status === 'active' ? 'Activa' : 'Suspendida'}
              </span>
              <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
                {currentInstitution.slug}
              </span>
              <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
                Plan {currentInstitution.plan_type}
              </span>
              <span className={`status-chip ${auditStatusClass}`}>
                {auditStatusLabel}
              </span>
            </div>
          )}

          {selectableInstitutions.length === 0 && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Todavia no hay instituciones disponibles para auditar.
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AuditMetricCard
          label="Administradores"
          value={currentInstitution?.admin_count ?? 0}
          helper="Usuarios con gestion"
          icon={ShieldCheck}
          tone="slate"
        />
        <AuditMetricCard
          label="Carreras"
          value={currentInstitution?.active_career_count ?? 0}
          helper="Activas en snapshot"
          icon={Building2}
          tone="sky"
        />
        <AuditMetricCard
          label="Alumnos"
          value={currentInstitution?.student_count ?? 0}
          helper="Padron institucional"
          icon={Users}
          tone="sky"
        />
        <AuditMetricCard
          label="Docentes"
          value={currentInstitution?.teacher_count ?? 0}
          helper="Padron docente"
          icon={UsersRound}
          tone="teal"
        />
        <AuditMetricCard
          label="Diferencias"
          value={rosterDrift}
          helper={rosterIsAligned ? 'Sin desvio operativo' : 'Requiere revision'}
          icon={rosterIsAligned ? ShieldCheck : AlertTriangle}
          tone={rosterIsAligned ? 'slate' : 'amber'}
        />
        <AuditMetricCard
          label="Fuente"
          value={sourceLabel}
          helper={isRemoteSession ? 'Sesion remota' : 'Sesion local'}
          icon={Database}
          tone="slate"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2 xl:auto-rows-fr">
        <article className="soft-card flex h-full flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="soft-title">Estado actual</span>
            <span className={`status-chip ${auditStatusClass}`}>
              {auditStatusLabel}
            </span>
            <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
              {sourceLabel}
            </span>
          </div>

          <h3 className="mt-3 text-2xl font-bold text-slate-950">
            Revision de padrones institucionales
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Se compara el snapshot operativo con las tablas normalizadas para detectar drift y decidir si hace falta re-sincronizar.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SummaryTile
              label="Institucion"
              value={currentInstitution?.name ?? 'Sin seleccion'}
              helper={currentInstitution?.slug ?? 'Selecciona una institucion'}
              tone="cyan"
            />
            <SummaryTile
              label="Estado"
              value={
                auditIsReady
                  ? rosterIsAligned
                    ? 'Consistente'
                    : 'Con drift'
                  : 'Pendiente'
              }
              helper={
                rosterAudit?.snapshotUpdatedAt
                  ? `Snapshot ${new Date(rosterAudit.snapshotUpdatedAt).toLocaleString()}`
                  : 'Sin snapshot auditado'
              }
              tone="slate"
            />
            <SummaryTile
              label="Revision"
              value={rosterDrift}
              helper={rosterIsAligned ? 'Sin desvio operativo' : 'Diferencias detectadas'}
              tone="amber"
            />
          </div>
        </article>

        <article className="soft-card soft-card--tint-amber flex h-full flex-col">
          <span className="soft-title">Acciones</span>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">
            Control y sincronizacion
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Desde aqui actualizas el estado de auditoria o relanzas la sincronizacion cuando detectas drift.
          </p>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
            Institucion auditada: <strong className="text-slate-900">{currentInstitution?.name ?? 'Sin seleccion'}</strong>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              className="btn-secondary w-full"
              type="button"
              onClick={() => refetchRosterAudit()}
              disabled={!activeInstitutionId || isFetchingRosterAudit}
            >
              <RefreshCw className={`h-4 w-4 ${isFetchingRosterAudit ? 'animate-spin' : ''}`} />
              Actualizar estado
            </button>
            <button
              className="btn-primary w-full"
              type="button"
              onClick={handleResyncRoster}
              disabled={!activeInstitutionId || !isRemoteSession || isResyncingRoster}
            >
              <Database className="h-4 w-4" />
              {isResyncingRoster ? 'Re-sincronizando...' : 'Re-sincronizar padrones'}
            </button>
          </div>

          {!currentInstitution && (
            <NavLink className="btn-secondary mt-4 w-full" to="/super-admin/instituciones">
              <Building2 className="h-4 w-4" />
              Ir a instituciones
            </NavLink>
          )}

          {!isRemoteSession && (
            <p className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
              La re-sincronizacion solo queda habilitada con sesion remota en Supabase.
            </p>
          )}
        </article>
      </section>

      <section className="space-y-3">
        {!activeInstitutionId && (
          <AuditStatusBanner tone="amber">
            Selecciona una institucion para habilitar la auditoria.
          </AuditStatusBanner>
        )}

        {rosterAudit?.status === 'local-only' && (
          <AuditStatusBanner tone="cyan">
            {rosterAudit.message}
          </AuditStatusBanner>
        )}

        {rosterAudit?.status === 'schema-missing' && (
          <AuditStatusBanner tone="amber">
            {rosterAudit.message}
          </AuditStatusBanner>
        )}

        {rosterAudit?.status === 'ready' && (
          <AuditStatusBanner tone={rosterIsAligned ? 'emerald' : 'amber'}>
            {rosterIsAligned
              ? 'Los padrones normalizados estan alineados con el snapshot activo.'
              : `Se detectaron ${rosterDrift} diferencias entre snapshot y tablas normalizadas.`}
            {rosterAudit.snapshotUpdatedAt && (
              <span className="ml-2">
                Ultimo snapshot: {new Date(rosterAudit.snapshotUpdatedAt).toLocaleString()}
              </span>
            )}
          </AuditStatusBanner>
        )}

        {rosterAuditError && (
          <AuditStatusBanner tone="amber">
            {rosterAuditError.message || 'No se pudo cargar la auditoria de padrones.'}
          </AuditStatusBanner>
        )}
      </section>

      {rosterAudit?.students && rosterAudit?.teachers && (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <AuditMetricCard
              label="Alumnos esperados"
              value={rosterAudit.students.expectedCount}
              helper={`${rosterAudit.students.snapshotRows} filas en snapshot`}
              icon={Users}
              tone="sky"
            />
            <AuditMetricCard
              label="Alumnos guardados"
              value={rosterAudit.students.actualCount}
              helper={rosterAudit.students.aligned ? 'Alineado' : 'Con drift'}
              icon={Database}
              tone="sky"
            />
            <AuditMetricCard
              label="Docentes esperados"
              value={rosterAudit.teachers.expectedCount}
              helper={`${rosterAudit.teachers.snapshotRows} filas en snapshot`}
              icon={UsersRound}
              tone="teal"
            />
            <AuditMetricCard
              label="Docentes guardados"
              value={rosterAudit.teachers.actualCount}
              helper={rosterAudit.teachers.aligned ? 'Alineado' : 'Con drift'}
              icon={Database}
              tone="teal"
            />
            <AuditMetricCard
              label="Diferencias"
              value={rosterDrift}
              helper={rosterIsAligned ? 'Sin desvio operativo' : 'Requiere revision'}
              icon={rosterIsAligned ? ShieldCheck : AlertTriangle}
              tone={rosterIsAligned ? 'slate' : 'amber'}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <DatasetAuditCard
              title="Padron de alumnos"
              audit={rosterAudit.students}
              formatter={renderStudentAuditItem}
            />
            <DatasetAuditCard
              title="Padron de docentes"
              audit={rosterAudit.teachers}
              formatter={renderTeacherAuditItem}
            />
          </section>
        </>
      )}
    </div>
  )
}

export default SuperAdminAuditPage
