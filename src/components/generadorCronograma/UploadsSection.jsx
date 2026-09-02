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
  handler,
  item,
  uploadedFiles,
}) {
  const uploadedFile = uploadedFiles[item.key]

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
          {uploadedFile || 'Archivo pendiente.'}
        </div>
      </div>
      <div className="shrink-0">
        <label
          className={`btn-primary ${canEditWorkspace ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
          htmlFor={canEditWorkspace ? item.inputId : undefined}
        >
          <FileUp className="h-4 w-4" />
          {uploadedFile ? 'Reemplazar' : 'Cargar'}
        </label>
        <input
          id={item.inputId}
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
  description = 'Subi cada archivo en el orden sugerido. El sistema valida columnas y te avisa si falta algo antes de generar mesas.',
  onUploadMaster,
  onUploadTeachers,
  onUploadStudents,
  scope = 'all',
  title = 'Carga de datos base',
  uploadedFiles,
}) {
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
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>
      {itemKeys.map((key) => (
        <UploadCard
          key={key}
          canEditWorkspace={canEditWorkspace}
          handler={handlers[key]}
          item={{ ...UPLOAD_ITEMS[key], key }}
          uploadedFiles={uploadedFiles}
        />
      ))}
    </section>
  )
}

export default UploadsSection
