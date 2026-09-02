function WorkspaceContextSection({
  activeInstitution,
  useRemoteWorkspace,
}) {
  return (
    <>
      <section className="workspace-context-intro rise-in">
        <span className="soft-title">Preparacion</span>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="workspace-context__title text-3xl font-bold">
              Operacion academica centralizada
            </h3>
            <p className="workspace-context__description mt-3 max-w-3xl text-sm leading-6 md:text-base">
              El flujo contempla horarios docentes, planes de estudio, correlatividades,
              confirmacion operativa, exportacion segmentada y correcciones manuales.
            </p>
          </div>
          <div className="soft-card soft-card--tint-amber min-w-[240px] border-l-4 border-l-amber-500">
            <p className="workspace-context__label text-xs font-extrabold uppercase tracking-[0.16em]">
              Estado piloto
            </p>
            <p className="workspace-context__title mt-2 text-sm font-bold">
              Listo para trabajar con informacion real y persistencia remota por institucion.
            </p>
          </div>
        </div>
      </section>

      <section className="rise-in grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="soft-card workspace-gradient-panel workspace-context-card">
          <span className="soft-title">Contexto institucional</span>
          <h4 className="workspace-context__title mt-2 text-2xl font-bold">
            Espacio de trabajo por institucion
          </h4>
          <p className="workspace-context__description mt-2 max-w-2xl text-sm leading-6">
            Cada institucion mantiene su snapshot, archivos fuente y estado operativo.
            La institucion activa se define desde el inicio de sesion y este panel muestra
            el contexto autorizado.
          </p>
          <div className="workspace-context__institution mt-4 border px-4 py-4" style={{ borderRadius: 8 }}>
            <p className="workspace-context__label text-xs font-bold uppercase tracking-[0.16em]">
              Institucion activa
            </p>
            <p className="workspace-context__title mt-2 text-xl font-bold">
              {activeInstitution?.name ?? 'Sin institucion asignada'}
            </p>
            <p className="workspace-context__description mt-2 text-sm leading-6">
              {activeInstitution
                ? 'El workspace toma automaticamente esta institucion segun tu acceso.'
                : 'Todavia no hay una institucion disponible para este usuario.'}
            </p>
          </div>
        </article>

        <article className="soft-card soft-card--tint-sky workspace-context-card">
          <p className="workspace-context__label text-xs font-extrabold uppercase tracking-[0.16em]">
            Estado de aislamiento
          </p>
          <p className="workspace-context__title mt-2 text-2xl font-bold">
            {activeInstitution?.name ?? 'Sin institucion'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
              {useRemoteWorkspace ? 'RLS remoto' : 'Demo local'}
            </span>
            {activeInstitution?.role && (
              <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
                Rol {activeInstitution.role}
              </span>
            )}
            {activeInstitution?.isDemo && (
              <span className="status-chip border-cyan-200 bg-cyan-50 text-cyan-800">
                Institucion ficticia
              </span>
            )}
          </div>
          <p className="workspace-context__description mt-4 text-sm leading-6">
            {useRemoteWorkspace
              ? 'Las escrituras quedan aisladas por institution_id y protegidas por RLS.'
              : 'El workspace se guarda localmente por institucion para probar escenarios multi-tenant sin tocar produccion.'}
          </p>
        </article>
      </section>
    </>
  )
}

export default WorkspaceContextSection
