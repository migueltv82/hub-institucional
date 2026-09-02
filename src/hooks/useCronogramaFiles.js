import toast from 'react-hot-toast'
import { saveSourceFile } from '../services/sourceFiles.js'
import {
  parseTemplateV2MasterWorkbook,
  parseTemplateV2StudentsWorkbook,
  parseTemplateV2TeachersWorkbook,
} from '../utils/examEngine/templatesV2/importTemplateV2Workbook.js'

const defaultFileHandlers = {
  parseTemplateV2MasterWorkbook,
  parseTemplateV2StudentsWorkbook,
  parseTemplateV2TeachersWorkbook,
  saveSourceFile,
}

function clean(value) { return String(value ?? '').trim() }

function normalizeIdentityPart(value) {
  const text = clean(value)
  if (!text) return ''
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function firstClean(row = {}, fields = []) {
  for (const field of fields) {
    const value = clean(row[field])
    if (value) return value
  }
  return ''
}

const teacherIdFields = [
  'docente_id',
  'docenteId',
  'teacher_id',
  'teacherId',
  'teacher_record_id',
  'teacherRecordId',
  'record_id',
  'recordId',
  'id',
]

const teacherDniFields = ['dni_docente', 'dniDocente', 'dni', 'documento', 'document_number', 'documentNumber']
const teacherEmailFields = ['email', 'correo', 'mail']
const teacherNameFields = [
  'docente',
  'teacher',
  'teacher_name',
  'teacherName',
  'teacher_display_name',
  'teacherDisplayName',
  'full_name',
  'fullName',
  'nombre_completo',
  'nombreCompleto',
]

function teacherFullName(row = {}) {
  const directName = firstClean(row, teacherNameFields)
  if (directName) return directName
  const apellidoNombre = [row.apellido, row.nombre].map(clean).filter(Boolean).join(' ')
  if (apellidoNombre) return apellidoNombre
  return [row.last_name, row.first_name].map(clean).filter(Boolean).join(' ')
}

function teacherIdentity(row = {}) {
  const stableId = firstClean(row, teacherIdFields)
  if (stableId) return `id:${normalizeIdentityPart(stableId)}`
  const dni = firstClean(row, teacherDniFields)
  if (dni) return `dni:${normalizeIdentityPart(dni)}`
  const email = firstClean(row, teacherEmailFields)
  if (email) return `email:${normalizeIdentityPart(email)}`
  const fullName = teacherFullName(row)
  if (fullName) return `name:${normalizeIdentityPart(fullName)}`
  return ''
}

function subjectIdentity(row = {}) {
  return normalizeIdentityPart(firstClean(row, [
    'materia_id',
    'materiaId',
    'subject_id',
    'subjectId',
    'materia_codigo',
    'materiaCodigo',
    'codigo',
    'code',
    'materia',
    'materia_nombre',
    'materiaNombre',
    'subject_name',
    'subjectName',
  ]))
}

function careerIdentity(row = {}) {
  return normalizeIdentityPart(firstClean(row, [
    'carrera_id',
    'carreraId',
    'program_id',
    'programId',
    'plan_id',
    'planId',
    'carrera',
    'programa',
  ]))
}

function careerIdentityParts(row = {}) {
  return [
    'carrera_id',
    'carreraId',
    'program_id',
    'programId',
    'carrera',
    'carrera_nombre',
    'carreraNombre',
    'programa',
  ].map((field) => normalizeIdentityPart(row[field])).filter(Boolean)
}

function planIdentity(row = {}) {
  return normalizeIdentityPart(firstClean(row, [
    'plan_id',
    'planId',
    'plan_nombre',
    'planNombre',
    'anio_plan',
    'anioPlan',
  ]))
}

function academicSubjectIdentity(row = {}) {
  const id = firstClean(row, ['materia_id', 'materiaId', 'subject_id', 'subjectId', 'id'])
  if (id) return `id:${normalizeIdentityPart(id)}`
  return [
    'subject',
    planIdentity(row),
    careerIdentity(row),
    subjectIdentity(row),
  ].join('::')
}

function correlativityIdentity(row = {}) {
  return [
    'correlative',
    planIdentity(row),
    careerIdentity(row),
    subjectIdentity(row),
    normalizeIdentityPart(firstClean(row, ['correlativa_id', 'correlativaId', 'correlativa_codigo', 'correlativaCodigo'])),
    normalizeIdentityPart(firstClean(row, ['tipo_correlativa', 'tipoCorrelativa', 'requisito'])),
  ].join('::')
}

function careerMatches(row = {}, impactedCareers = new Set()) {
  return careerIdentityParts(row).some((part) => impactedCareers.has(part))
}

function teacherSubjectIdentity(row = {}) {
  const teacherKey = teacherIdentity(row)
  const subjectKey = subjectIdentity(row)
  if (!teacherKey || !subjectKey) return ''
  return [
    teacherKey,
    careerIdentity(row),
    subjectKey,
    normalizeIdentityPart(firstClean(row, ['rol_en_materia', 'rolEnMateria', 'rol', 'condicion'])),
  ].join('::')
}

function teacherScheduleIdentity(row = {}) {
  const teacherKey = teacherIdentity(row)
  const subjectKey = subjectIdentity(row)
  if (!teacherKey || !subjectKey) return ''
  return [
    teacherKey,
    careerIdentity(row),
    subjectKey,
    normalizeIdentityPart(firstClean(row, ['dia', 'day'])),
    normalizeIdentityPart(firstClean(row, ['hora_inicio', 'horaInicio', 'inicio', 'start'])),
    normalizeIdentityPart(firstClean(row, ['hora_fin', 'horaFin', 'fin', 'end'])),
  ].join('::')
}

function mergeRows(existing = [], incoming = [], keyFn) {
  const merged = new Map()
  let created = 0
  let updated = 0

  ;(Array.isArray(existing) ? existing : []).forEach((row, index) => {
    const key = keyFn(row) || `existing:${index}`
    merged.set(key, row)
  })

  ;(Array.isArray(incoming) ? incoming : []).forEach((row, index) => {
    const key = keyFn(row) || `incoming:${index}`
    if (merged.has(key)) updated += 1
    else created += 1
    merged.set(key, { ...(merged.get(key) ?? {}), ...row })
  })

  return { rows: [...merged.values()], created, updated }
}

function studentIdentity(student = {}) {
  const stableId = clean(student.alumno_id ?? student.id ?? student.dni ?? student.documento)
  if (stableId) return `id:${stableId.toLowerCase()}`
  return `email:${clean(student.email ?? student.correo).toLowerCase()}::${clean(student.carrera_id ?? student.carrera).toLowerCase()}`
}

export function mergeStudentRows(existing = [], incoming = []) {
  const merged = new Map(existing.map((student) => [studentIdentity(student), student]))
  let created = 0
  let updated = 0
  incoming.forEach((student) => {
    const key = studentIdentity(student)
    if (merged.has(key)) updated += 1
    else created += 1
    merged.set(key, { ...(merged.get(key) ?? {}), ...student })
  })
  return { rows: [...merged.values()], created, updated }
}

export function mergeTeacherWorkbookDatasets(snapshotPayload = {}, incomingDatasets = {}) {
  const docentes = mergeRows(snapshotPayload?.docentes, incomingDatasets?.docentes, teacherIdentity)
  const docenteMateria = mergeRows(
    snapshotPayload?.docenteMateria,
    incomingDatasets?.docenteMateria,
    teacherSubjectIdentity,
  )
  const horariosDocentes = mergeRows(
    snapshotPayload?.horariosDocentes,
    incomingDatasets?.horariosDocentes,
    teacherScheduleIdentity,
  )

  return {
    datasets: {
      docentes: docentes.rows,
      docenteMateria: docenteMateria.rows,
      horariosDocentes: horariosDocentes.rows,
    },
    created: {
      docentes: docentes.created,
      docenteMateria: docenteMateria.created,
      horariosDocentes: horariosDocentes.created,
    },
    updated: {
      docentes: docentes.updated,
      docenteMateria: docenteMateria.updated,
      horariosDocentes: horariosDocentes.updated,
    },
  }
}

export function mergeAcademicWorkbookDatasets(snapshotPayload = {}, incomingDatasets = {}) {
  const incomingPlanes = Array.isArray(incomingDatasets?.planesEstudio) ? incomingDatasets.planesEstudio : []
  const incomingCorrelatividades = Array.isArray(incomingDatasets?.correlatividades)
    ? incomingDatasets.correlatividades
    : []
  const impactedCareers = new Set(incomingPlanes.flatMap((row) => careerIdentityParts(row)))
  const existingPlanes = Array.isArray(snapshotPayload?.planesEstudio) ? snapshotPayload.planesEstudio : []
  const existingCorrelatividades = Array.isArray(snapshotPayload?.correlatividades) ? snapshotPayload.correlatividades : []

  const preservedPlanes = impactedCareers.size
    ? existingPlanes.filter((row) => !careerMatches(row, impactedCareers))
    : existingPlanes
  const preservedCorrelatividades = impactedCareers.size
    ? existingCorrelatividades.filter((row) => !careerMatches(row, impactedCareers))
    : existingCorrelatividades

  const planesEstudio = mergeRows(preservedPlanes, incomingPlanes, academicSubjectIdentity)
  const correlatividades = mergeRows(preservedCorrelatividades, incomingCorrelatividades, correlativityIdentity)

  return {
    datasets: {
      planesEstudio: planesEstudio.rows,
      correlatividades: correlatividades.rows,
    },
    created: {
      planesEstudio: planesEstudio.created,
      correlatividades: correlatividades.created,
    },
    updated: {
      planesEstudio: planesEstudio.updated,
      correlatividades: correlatividades.updated,
    },
    replacedCareers: impactedCareers.size,
  }
}

export function useCronogramaFiles({
  activeInstitutionId,
  canEditWorkspace = true,
  cronogramaLength,
  fileHandlers = defaultFileHandlers,
  persistWorkspaceSnapshot,
  setAlumnos,
  setCorrelatividades,
  setDocenteMateria,
  setDocentes,
  setHorariosDocentes,
  setPlanesEstudio,
  setRequiereRegeneracion,
  setUploadedFiles,
  snapshotPayload,
  useRemoteWorkspace,
  workspaceKey,
}) {
  async function persistFile({ file, datasetKey, datasets, nextUploadedFiles }) {
    if (useRemoteWorkspace) await fileHandlers.saveSourceFile({ institutionId: activeInstitutionId, workspaceKey, datasetKey, file, useRemote: true })
    const requiereRegeneracion = Boolean(cronogramaLength) || snapshotPayload?.requiereRegeneracion
    await persistWorkspaceSnapshot?.({ ...snapshotPayload, ...datasets, uploadedFiles: nextUploadedFiles, requiereRegeneracion })
    setUploadedFiles(nextUploadedFiles)
    if (requiereRegeneracion) setRequiereRegeneracion(true)
  }

  async function onUploadMaster(event) {
    if (!canEditWorkspace) {
      toast.error('Tu rol institucional es de solo lectura.')
      event.target.value = ''
      return
    }
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const { datasets, summary } = await fileHandlers.parseTemplateV2MasterWorkbook(file)
      const nextUploadedFiles = {
        ...snapshotPayload?.uploadedFiles,
        masterWorkbook: file.name,
      }
      const academicDatasets = mergeAcademicWorkbookDatasets(snapshotPayload, {
        planesEstudio: datasets.planesEstudio,
        correlatividades: datasets.correlatividades,
      })
      const mergedDatasets = { ...academicDatasets.datasets }
      const hasTeacherDatasets = Boolean(
        datasets.docentes?.length ||
        datasets.docenteMateria?.length ||
        datasets.horariosDocentes?.length,
      )
      const hasStudentDatasets = Boolean(datasets.alumnos?.length)
      const teacherDatasets = hasTeacherDatasets ? mergeTeacherWorkbookDatasets(snapshotPayload, datasets) : null
      const studentDatasets = hasStudentDatasets ? mergeStudentRows(snapshotPayload?.alumnos, datasets.alumnos) : null
      if (teacherDatasets) Object.assign(mergedDatasets, teacherDatasets.datasets)
      if (studentDatasets) mergedDatasets.alumnos = studentDatasets.rows

      await persistFile({ file, datasetKey: 'masterWorkbook', datasets: mergedDatasets, nextUploadedFiles })
      setCorrelatividades(academicDatasets.datasets.correlatividades)
      setPlanesEstudio(academicDatasets.datasets.planesEstudio)
      if (teacherDatasets) {
        setDocentes(teacherDatasets.datasets.docentes)
        setDocenteMateria(teacherDatasets.datasets.docenteMateria)
        setHorariosDocentes(teacherDatasets.datasets.horariosDocentes)
      }
      if (studentDatasets) setAlumnos(studentDatasets.rows)
      toast.success(`Carga maestra guardada: ${summary.planesEstudio} materias importadas, ${academicDatasets.datasets.planesEstudio.length} materias totales.`)
    } catch (error) {
      toast.error(`No se pudo cargar la plantilla maestra: ${error.message}`)
    } finally {
      event.target.value = ''
    }
  }

  async function onUploadTeachers(event) {
    if (!canEditWorkspace) { toast.error('Tu rol institucional es de solo lectura.'); event.target.value = ''; return }
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const { datasets } = await fileHandlers.parseTemplateV2TeachersWorkbook(file, { planesEstudio: snapshotPayload?.planesEstudio })
      const merged = mergeTeacherWorkbookDatasets(snapshotPayload, datasets)
      const nextUploadedFiles = { ...snapshotPayload?.uploadedFiles, docentesWorkbook: file.name }
      await persistFile({ file, datasetKey: 'docentesWorkbook', datasets: merged.datasets, nextUploadedFiles })
      setDocentes(merged.datasets.docentes); setDocenteMateria(merged.datasets.docenteMateria); setHorariosDocentes(merged.datasets.horariosDocentes)
      toast.success(`Carga docente acumulativa guardada: ${merged.created.docentes} docentes nuevos, ${merged.created.docenteMateria} titularidades nuevas, ${merged.created.horariosDocentes} horarios nuevos. Total: ${merged.datasets.docentes.length} docentes.`)
    } catch (error) { toast.error(`No se pudo cargar la plantilla de docentes: ${error.message}`) } finally { event.target.value = '' }
  }

  async function onUploadStudents(event) {
    if (!canEditWorkspace) { toast.error('Tu rol institucional es de solo lectura.'); event.target.value = ''; return }
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const { datasets } = await fileHandlers.parseTemplateV2StudentsWorkbook(file, { planesEstudio: snapshotPayload?.planesEstudio })
      const merged = mergeStudentRows(snapshotPayload?.alumnos, datasets.alumnos)
      const mergedDatasets = { alumnos: merged.rows }
      const nextUploadedFiles = { ...snapshotPayload?.uploadedFiles, alumnosWorkbook: file.name }
      await persistFile({ file, datasetKey: 'alumnosWorkbook', datasets: mergedDatasets, nextUploadedFiles })
      setAlumnos(merged.rows)
      toast.success(`Carga acumulativa guardada: ${merged.created} nuevos, ${merged.updated} actualizados, ${merged.rows.length} alumnos totales.`)
    } catch (error) { toast.error(`No se pudo cargar la plantilla de alumnos: ${error.message}`) } finally { event.target.value = '' }
  }

  return { onUploadMaster, onUploadStudents, onUploadTeachers }
}
