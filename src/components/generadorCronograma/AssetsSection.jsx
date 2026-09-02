import DownloadCard from './DownloadCard.jsx'

function AssetsSection({
  onDownloadOriginals,
  onDownloadKitExamEngineV2,
  onDownloadPrefilled,
  onDownloadTeachers,
  onDownloadStudents,
}) {
  return (
    <section className="rise-in">
      <div className="mb-3">
        <span className="soft-title">Assets</span>
        <p className="mt-2 text-sm text-slate-600">
          Material de arranque para una experiencia consistente desde el primer uso.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <DownloadCard
          accentClass="upload-card upload-card--teal hover:border-teal-300 md:col-span-2"
          eyebrow="Respaldo de la carga"
          title="Descargar Excel originales"
          description="Descarga los archivos que subiste y que estan almacenados para la institucion activa."
          iconClass="text-teal-700"
          onClick={onDownloadOriginals}
        />
        <DownloadCard
          accentClass="upload-card upload-card--violet hover:border-violet-300 md:col-span-2"
          eyebrow="Workbook Excel"
          title="Planilla institucional precargada"
          description="Archivo completo de respaldo con las mismas hojas de las plantillas separadas."
          iconClass="text-teal-700"
          onClick={onDownloadPrefilled}
        />
        <DownloadCard
          accentClass="upload-card upload-card--violet hover:border-violet-300"
          eyebrow="Workbook Excel"
          title="Plantilla academica"
          description="Carreras, planes, materias, afinidades, correlatividades y calendario."
          iconClass="text-violet-700"
          onClick={onDownloadKitExamEngineV2}
        />
        <DownloadCard
          eyebrow="Workbook Excel"
          title="Plantilla de docentes"
          description="Docentes, titularidades, materias, horarios y disponibilidad."
          onClick={onDownloadTeachers}
        />
        <DownloadCard
          eyebrow="Workbook Excel"
          title="Plantilla de alumnos"
          description="Alumnos, carreras, planes y materias que rinden."
          onClick={onDownloadStudents}
        />
      </div>
    </section>
  )
}

export default AssetsSection
