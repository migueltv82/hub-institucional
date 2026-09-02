import { useState } from 'react'
import { ClipboardCopy, Download, FileText, Save, ShieldCheck } from 'lucide-react'
import {
  FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
  FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_TEXT_FILE_NAME,
  buildFullAnonymizedWorkspaceSnapshotAuditPayload,
  buildWorkspaceSnapshotAuditPayload,
  buildWorkspaceSnapshotAuditSummary,
  copyFullAnonymizedWorkspaceSnapshotAuditPayload,
  downloadFullAnonymizedWorkspaceSnapshotAuditPayload,
  downloadFullAnonymizedWorkspaceSnapshotAuditText,
  downloadWorkspaceSnapshotAuditPayload,
  saveFullAnonymizedWorkspaceSnapshotAuditPayload,
  validateFullAnonymizedWorkspaceSnapshotAuditPayload,
} from './workspaceSnapshotAuditExport.js'
import {
  isDevAuditSnapshotRoleAuthorized,
  normalizeDevAuditSnapshotRole,
} from './devAuditSnapshotAccess.js'

function CountPill({ label, value }) {
  return (
    <span className="status-chip border-slate-200 bg-white text-slate-800">
      {label}: {value}
    </span>
  )
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function BooleanStatus({ label, value }) {
  return <li>{label}: <strong>{value ? 'Sí' : 'No'}</strong></li>
}

function DevAuditSnapshotExport({
  detectedRole,
  devMode = import.meta.env.DEV,
  isAdvancedSectionActive = true,
  isSuperAdmin = false,
  snapshotPayload,
  alumnos,
  correlatividades,
  docenteMateria,
  docentes,
  examType,
  fechaFin,
  fechaInicio,
  generationScope,
  horariosDocentes,
  planesEstudio,
  regularCallRanges,
  selectedSpecialSubjectKeys,
}) {
  const [exportStatus, setExportStatus] = useState(null)
  const [exportError, setExportError] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const normalizedDetectedRole = normalizeDevAuditSnapshotRole(detectedRole) || (isSuperAdmin ? 'superadmin' : 'sin_rol')
  const isAuthorized = isDevAuditSnapshotRoleAuthorized({ isSuperAdmin, detectedRole: normalizedDetectedRole })
  const snapshotAvailable = Boolean(
    snapshotPayload
    && typeof snapshotPayload === 'object'
    && !Array.isArray(snapshotPayload),
  )
  const detectedSectionCount = snapshotAvailable ? Object.keys(snapshotPayload).length : 0
  const filePickerAvailable = typeof window.showSaveFilePicker === 'function'
  const blockingReasons = [
    ...(!devMode ? ['DEV_MODE_FALSE'] : []),
    ...(!isAuthorized ? ['USER_NOT_SUPERADMIN'] : []),
    ...(!isAdvancedSectionActive ? ['ADVANCED_SECTION_NOT_ACTIVE'] : []),
    ...(!snapshotAvailable ? ['SNAPSHOT_PAYLOAD_MISSING'] : []),
  ]
  const diagnosticCodes = [
    ...blockingReasons,
    ...(!filePickerAvailable ? ['FILE_SYSTEM_API_NOT_AVAILABLE'] : []),
  ]
  const canExport = blockingReasons.length === 0

  const snapshot = buildWorkspaceSnapshotAuditPayload({
    alumnos,
    correlatividades,
    docenteMateria,
    docentes,
    examType,
    fechaFin,
    fechaInicio,
    generationScope,
    horariosDocentes,
    planesEstudio,
    regularCallRanges,
    selectedSpecialSubjectKeys,
  })
  const summary = buildWorkspaceSnapshotAuditSummary(snapshot)

  function handleExport() {
    downloadWorkspaceSnapshotAuditPayload(snapshot)
  }

  function prepareFullExport() {
    const fullSnapshot = buildFullAnonymizedWorkspaceSnapshotAuditPayload(snapshotPayload)
    const prepared = validateFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshot)
    if (!prepared.valid) {
      throw new Error(`AUDIT_EXPORT_VALIDATION_FAILED:${prepared.errors.join(',')}`)
    }
    return { fullSnapshot, prepared }
  }

  function recordPreparedExport(prepared, action, fileName) {
    const diagnostics = prepared.diagnostics
    setExportStatus({ ...diagnostics, action, fileName })
    setExportError('')
    console.info('[workspace-audit-export] exportacion preparada', {
      exportMode: diagnostics.exportMode,
      fileName,
      jsonSize: diagnostics.jsonSize,
      hash: diagnostics.shortHash,
      includedSectionsCount: diagnostics.includedSectionsCount,
      missingSectionsCount: diagnostics.missingSectionsCount,
    })
  }

  function recordExportError(error) {
    setExportStatus(null)
    setExportError(error instanceof Error ? error.message : 'AUDIT_EXPORT_UNKNOWN_ERROR')
  }

  function handleFullAnonymizedExport() {
    setIsExporting(true)
    try {
      const { fullSnapshot, prepared } = prepareFullExport()
      downloadFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshot)
      recordPreparedExport(prepared, 'Descarga JSON solicitada', FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME)
    } catch (error) {
      recordExportError(error)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleClipboardExport() {
    setIsExporting(true)
    try {
      const { fullSnapshot, prepared } = prepareFullExport()
      await copyFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshot)
      recordPreparedExport(prepared, 'Copiado al portapapeles', FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME)
    } catch (error) {
      recordExportError(error)
    } finally {
      setIsExporting(false)
    }
  }

  function handleTextExport() {
    setIsExporting(true)
    try {
      const { fullSnapshot, prepared } = prepareFullExport()
      downloadFullAnonymizedWorkspaceSnapshotAuditText(fullSnapshot)
      recordPreparedExport(prepared, 'Descarga TXT solicitada', FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_TEXT_FILE_NAME)
    } catch (error) {
      recordExportError(error)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleFilePickerExport() {
    setIsExporting(true)
    try {
      const { fullSnapshot, prepared } = prepareFullExport()
      await saveFullAnonymizedWorkspaceSnapshotAuditPayload(fullSnapshot)
      recordPreparedExport(prepared, 'Guardado con selector de archivo', FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME)
    } catch (error) {
      recordExportError(error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="rise-in border border-dashed border-sky-300 bg-sky-50 p-4 text-sm text-sky-950" style={{ borderRadius: 8 }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">
            Herramientas DEV de auditoría de snapshot
          </p>
          <h4 className="mt-1 text-lg font-bold text-slate-950">
            Snapshot real cargado en memoria
          </h4>
          <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div><dt className="inline font-semibold">Modo DEV: </dt><dd className="inline">{devMode ? 'sí' : 'no'}</dd></div>
            <div><dt className="inline font-semibold">Rol detectado: </dt><dd className="inline">{normalizedDetectedRole}</dd></div>
            <div><dt className="inline font-semibold">Permiso superadmin: </dt><dd className="inline">{isSuperAdmin ? 'sí' : 'no'}</dd></div>
            <div><dt className="inline font-semibold">Permiso de auditoría: </dt><dd className="inline">{isAuthorized ? 'sí' : 'no'}</dd></div>
            <div><dt className="inline font-semibold">Snapshot disponible: </dt><dd className="inline">{snapshotAvailable ? 'sí' : 'no'}</dd></div>
            <div><dt className="inline font-semibold">Secciones detectadas: </dt><dd className="inline">{detectedSectionCount}</dd></div>
            <div><dt className="inline font-semibold">Componente exportador: </dt><dd className="inline">montado</dd></div>
            <div><dt className="inline font-semibold">Sección avanzada activa: </dt><dd className="inline">{isAdvancedSectionActive ? 'sí' : 'no'}</dd></div>
          </dl>
          {diagnosticCodes.length > 0 ? (
            <div className="mt-3 border border-amber-300 bg-amber-50 p-2 text-amber-950" style={{ borderRadius: 8 }} role="status">
              <p className="font-semibold">Diagnóstico de disponibilidad</p>
              <ul className="mt-1 list-inside list-disc font-mono text-xs">
                {diagnosticCodes.map((code) => <li key={code}>{code}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <CountPill label="Alumnos" value={summary.alumnos} />
            <CountPill label="Docentes" value={summary.docentes} />
            <CountPill label="Docente-materia" value={summary.docenteMateria} />
            <CountPill label="Horarios" value={summary.horariosDocentes} />
            <CountPill label="Planes" value={summary.planesEstudio} />
            <CountPill label="Correlatividades" value={summary.correlatividades} />
          </div>
        </div>

        {canExport ? (
          <div className="flex shrink-0 flex-col gap-2">
          <button
            className="btn-secondary"
            onClick={handleExport}
            type="button"
          >
            <Download className="h-4 w-4" />
            Exportar snapshot parcial legacy
          </button>
          <button
            className="btn-primary"
            disabled={isExporting}
            onClick={handleFullAnonymizedExport}
            type="button"
          >
            <ShieldCheck className="h-4 w-4" />
            Exportar snapshot completo anonimizado para shadow audit
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="btn-secondary"
              disabled={isExporting}
              onClick={handleClipboardExport}
              type="button"
            >
              <ClipboardCopy className="h-4 w-4" />
              Copiar snapshot anonimizado al portapapeles
            </button>
            <button
              className="btn-secondary"
              disabled={isExporting}
              onClick={handleTextExport}
              type="button"
            >
              <FileText className="h-4 w-4" />
              Descargar snapshot anonimizado como TXT
            </button>
          </div>
          {filePickerAvailable ? (
            <button
              className="btn-secondary"
              disabled={isExporting}
              onClick={handleFilePickerExport}
              type="button"
            >
              <Save className="h-4 w-4" />
              Guardar snapshot anonimizado con selector de archivo
            </button>
          ) : (
            <p className="text-xs font-semibold text-sky-800">
              Selector de archivo no disponible en este navegador. Use descarga JSON/TXT.
            </p>
          )}
          </div>
        ) : (
          <div className="max-w-sm border border-slate-300 bg-white p-3 text-slate-700" style={{ borderRadius: 8 }}>
            Las herramientas de exportación permanecen bloqueadas hasta resolver los códigos de diagnóstico.
          </div>
        )}
      </div>

      {exportStatus ? (
        <div className="mt-4 border border-emerald-300 bg-emerald-50 p-3 text-emerald-950" style={{ borderRadius: 8 }} role="status">
          <p className="font-bold">Exportación preparada</p>
          <p className="mt-1">{exportStatus.action}. El navegador controla la ubicación final del archivo.</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div><dt className="font-semibold">Nombre sugerido</dt><dd>{exportStatus.fileName}</dd></div>
            <div><dt className="font-semibold">Tamaño aproximado</dt><dd>{formatBytes(exportStatus.jsonSize)}</dd></div>
            <div className="sm:col-span-2"><dt className="font-semibold">SHA-256</dt><dd className="break-all font-mono text-xs">{exportStatus.hash}</dd></div>
            <div><dt className="font-semibold">Secciones incluidas</dt><dd>{exportStatus.includedSectionsCount}</dd></div>
            <div><dt className="font-semibold">Secciones faltantes</dt><dd>{exportStatus.missingSectionsCount}</dd></div>
          </dl>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            <BooleanStatus label="Fuente docente estructurada" value={exportStatus.hasStructuredTeacherSource} />
            <BooleanStatus label="Fuente docente legacy" value={exportStatus.hasLegacyTeacherSource} />
            <BooleanStatus label="Fechas bloqueadas" value={exportStatus.hasBlockedDates} />
            <BooleanStatus label="Eventos administrativos" value={exportStatus.hasAdminReviewEvents} />
            <BooleanStatus label="Cronograma oficial incluido" value={exportStatus.hasOfficialSchedule} />
          </ul>
        </div>
      ) : null}

      {exportError ? (
        <div className="mt-4 border border-red-300 bg-red-50 p-3 font-semibold text-red-900" style={{ borderRadius: 8 }} role="alert">
          {exportError}
        </div>
      ) : null}
    </section>
  )
}

export default DevAuditSnapshotExport
