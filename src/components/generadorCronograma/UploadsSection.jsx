import { useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, FileUp } from 'lucide-react'

const UPLOAD_ITEMS = {
  masterWorkbook: {
    accentClass: 'upload-card--violet',
    description: 'Carreras, planes, materias, afinidades y correlatividades.',
    inputId: 'upload-master-workbook',
    label: 'Carga recomendada',
    title: 'Plantilla academica',
  },
  docentesWorkbook: {
    description: 'Docentes, titularidades, materias, horarios y disponibilidad.',
    inputId: 'upload-teachers-workbook',
    title: 'Plantilla de docentes',
  },
  alumnosWorkbook: {
    description: 'Alumnos, carreras, planes y materias que rinden.',
    inputId: 'upload-students-workbook',
    title: 'Plantilla de alumnos',
  },
}

const SCOPES = {
  all: ['masterWorkbook', 'docentesWorkbook', 'alumnosWorkbook'],
  institution: ['masterWorkbook'],
  students: ['alumnosWorkbook'],
  teachers: ['docentesWorkbook'],
}

function UploadCard({
  canEditWorkspace,
  disabledReasonId,
  handler,
  isRelationalWorkspaceSource,
  item,
  uploadedFiles,
}) {
  const inputRef = useRef(null)
  const inputId = `${item.inputId}-${useId()}`
  const uploadedFile = isRelationalWorkspaceSource ? null : uploadedFiles[item.key]
  const actionLabel = canEditWorkspace ? (uploadedFile ? 'Reemplazar' : 'Cargar') : 'Carga deshabilitada'

  return (
    <article className={`soft-card upload-card ${item.accentClass ?? ''} mb-4 flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center ${
      uploadedFile ? 'upload-card--ready' : ''
    }`}>
      <div className="min-w-0">
        {item.label && (
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-violet-700" />
            <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-700">
              {item.label}
            </span>
          </div>
        )}
        <h4 className={`${item.label ? 'mt-2' : ''} text-xl font-extrabold text-slate-950`}>{item.title}</h4>
        {item.description && (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            {item.description}
          </p>
        )}
        <div className={`file-name-pill mt-3 ${uploadedFile ? 'file-name-pill--ready' : ''}`}>
          {isRelationalWorkspaceSource ? 'Datos de la institución' : (uploadedFile || 'Archivo pendiente.')}
        </div>
      </div>
      <div className="shrink-0">
        <button
          type="button"
          className={`btn-primary ${canEditWorkspace ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
          aria-label={canEditWorkspace ? `${actionLabel} ${item.title.toLowerCase()}` : actionLabel}
          aria-describedby={!canEditWorkspace ? disabledReasonId : undefined}
          disabled={!canEditWorkspace}
          onClick={() => inputRef.current?.click()}
        >
          <FileUp aria-hidden="true" className="h-4 w-4" />
          {actionLabel}
        </button>
        <input
          ref={inputRef}
          id={inputId}
          aria-label={`Archivo de ${item.title.toLowerCase()}`}
          className="hidden"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={!canEditWorkspace}
          onChange={handler}
        />
      </div>
    </article>
  )
}

function UploadsSection({
  canEditWorkspace = true,
  canManageDataSource = false,
  description = 'Subi cada archivo en el orden sugerido. El sistema valida columnas y te avisa si falta algo antes de generar mesas.',
  isRelationalWorkspaceSource = false,
  onUploadMaster,
  onUploadTeachers,
  onUploadStudents,
  scope = 'all',
  title = 'Carga de datos base',
  uploadedFiles = {},
}) {
  const disabledReasonId = useId()
  const canUpload = canEditWorkspace && !isRelationalWorkspaceSource
  const handlers = {
    alumnosWorkbook: onUploadStudents,
    docentesWorkbook: onUploadTeachers,
    masterWorkbook: onUploadMaster,
  }
  const itemKeys = SCOPES[scope] ?? SCOPES.all

  return (
    <section className="rise-in">
      <div className="mb-3">
        <span className="soft-title">Paso 1 - Planillas</span>
        <h3 className="mt-2 text-2xl font-extrabold text-slate-950">{title}</h3>
        {canUpload && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        )}
      </div>
      {!canUpload && (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p id={disabledReasonId}>
            {isRelationalWorkspaceSource
              ? 'Esta vista consulta los datos de la institución y no permite cargar planillas. Los datos mostrados no representan un archivo Excel original almacenado.'
              : 'Tu rol permite consultar datos, pero no cargar planillas.'}
          </p>
          {isRelationalWorkspaceSource && (
            <p className="mt-2">
              {canManageDataSource
                ? 'Para cargar archivos, desactivá «Schema relacional en panel admin» en Instituciones y volvé a abrir el panel.'
                : 'Un superadmin debe desactivar «Schema relacional en panel admin» para volver al modo de carga de planillas.'}
            </p>
          )}
          {isRelationalWorkspaceSource && canManageDataSource && (
            <Link className="mt-3 inline-block font-bold underline underline-offset-4" to="/super-admin/instituciones">
              Configurar carga de planillas
            </Link>
          )}
        </div>
      )}
      {itemKeys.map((key) => (
        <UploadCard
          key={key}
          canEditWorkspace={canUpload}
          disabledReasonId={disabledReasonId}
          handler={handlers[key]}
          isRelationalWorkspaceSource={isRelationalWorkspaceSource}
          item={{ ...UPLOAD_ITEMS[key], key }}
          uploadedFiles={uploadedFiles}
        />
      ))}
    </section>
  )
}

export default UploadsSection
