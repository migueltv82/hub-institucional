import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  Database,
  Home,
  Wrench,
} from 'lucide-react'
import { EXAM_GENERATION_TYPES } from '../utils/examEngine/constants.js'
import { crearRankingDocentesPorHoras } from '../utils/examEngine/scheduleDashboardUtils.js'
import { isSupabaseConfigured } from '../lib/supabase.js'
import { buildCareerCatalog } from '../services/careerCatalog.js'
import {
  archiveDeletedPerson,
  fetchDeletedPersonRecords,
  markDeletedPersonRestored,
} from '../services/deletedPersonRecords.js'
import { downloadSourceFiles } from '../services/sourceFiles.js'
import {
  getStudentDraftIdentity,
  getTeacherDraftIdentity,
  validateStudentDraft,
  validateTeacherDraft,
} from '../services/rosterDrafts.js'
import { applyStudentAccessResultsToRows, provisionStudentAccess } from '../services/studentAccess.js'
import { fetchInstitutionAcademicCanonicalData } from '../services/academicCanonicalData.js'
import { showImportantNotice } from '../services/importantNotice.js'
import {
  resetStudentAcademicRecords,
  resetStudentAcademicSnapshotData,
} from '../services/studentAcademicReset.js'
import { getTeachersFromProfiles, provisionTeacherAccess } from '../services/teacherAccess.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useCronogramaExports } from '../hooks/useCronogramaExports.js'
import { useCronogramaFiles } from '../hooks/useCronogramaFiles.js'
import { useWorkspacePersistence } from '../hooks/useWorkspacePersistence.js'
import AssetsSection from './generadorCronograma/AssetsSection.jsx'
import DeletedPersonRecordsSection from './generadorCronograma/DeletedPersonRecordsSection.jsx'
import { isDevAuditSnapshotRoleAuthorized } from './generadorCronograma/devAuditSnapshotAccess.js'
import InstitutionAdminOverview from './generadorCronograma/InstitutionAdminOverview.jsx'
import StudentAccessSection from './generadorCronograma/StudentAccessSection.jsx'
import StudentCareerDashboard from './generadorCronograma/StudentCareerDashboard.jsx'
import StudentRosterSection from './generadorCronograma/StudentRosterSection.jsx'
import StudentSubjectEnrollmentSection from './generadorCronograma/StudentSubjectEnrollmentSection.jsx'
import TeacherRosterSection from './generadorCronograma/TeacherRosterSection.jsx'
import TribunalMatrixDiagnosis from './generadorCronograma/TribunalMatrixDiagnosis.jsx'
import UploadsSection from './generadorCronograma/UploadsSection.jsx'
import WorkspaceDangerZone from './generadorCronograma/WorkspaceDangerZone.jsx'
import WorkspaceNotice from './generadorCronograma/WorkspaceNotice.jsx'
import WorkspaceSidebar from './generadorCronograma/WorkspaceSidebar.jsx'
import ExamEngineV21FieldTestPage from '../features/exams/ExamEngineV21FieldTestPage.jsx'
import {
  createInitialRegularCallRanges,
  initialFiles,
} from './generadorCronograma/config.js'
import {
  buildCargaHorariaDocenteFromHorarios,
  validateAvailabilityDraft,
  validateLoadDraft,
} from './generadorCronograma/teacherAcademicAdmin.js'
import { getCronogramaViewState } from './generadorCronograma/derivedState.js'
import { validateTeacherBlockedDateDraft } from '../utils/examEngine/teacherBlockedDates.js'
import {
  getPersistenceHeading,
  getPersistenceMessage,
} from './generadorCronograma/helpers.js'
import { confirmStudentDeletion } from './generadorCronograma/studentDeletionConfirmation.js'

const academicSnapshotKeys = [
  'students',
  'estadoAcademico',
  'academicStatusRows',
  'enrollments',
  'grades',
  'examEnrollments',
  'academicStatus',
]
const ACTIVE_WORKSPACE_VIEW_KEY = 'mesaflow.active-workspace-view'
const VALID_WORKSPACE_VIEWS = new Set(['dashboard', 'students', 'teachers', 'exam-engine-v21'])

const DevAuditSnapshotExport = import.meta.env.DEV
  ? lazy(() => import('./generadorCronograma/DevAuditSnapshotExport.jsx'))
  : null

const RegularExamPreviewInternalPanel = import.meta.env.DEV
  ? lazy(() => import('./examEnginePreview/RegularExamPreviewInternalPanel.jsx'))
  : null

const StudentCourseEnrollmentInternalPreview = import.meta.env.DEV
  ? lazy(() => import('../features/studentCourseEnrollment/StudentCourseEnrollmentInternalPreview.jsx'))
  : null

const TeacherCourseRosterInternalPreview = import.meta.env.DEV
  ? lazy(() => import('../features/teacherCourseRoster/TeacherCourseRosterInternalPreview.jsx'))
  : null

function readStoredWorkspaceView() {
  try {
    const storedView = localStorage.getItem(ACTIVE_WORKSPACE_VIEW_KEY)
    return VALID_WORKSPACE_VIEWS.has(storedView) ? storedView : 'dashboard'
  } catch {
    return 'dashboard'
  }
}

function normalizeValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

function getStudentKey(student, index) {
  return student.id ?? student.email ?? student.dni ?? `${student.nombre}-${student.apellido}-${index}`
}

function getTeacherProfileIdentity(teacher) {
  return getTeacherDraftIdentity(teacher).dni || normalizeValue(teacher?.full_name || [teacher?.nombre, teacher?.apellido].filter(Boolean).join(' '))
}

function GeneradorCronograma() {
  const {
    user,
    isRemoteSession,
    isSuperAdmin,
    institutions: authInstitutions,
    activeInstitutionId: authActiveInstitutionId,
    setActiveInstitutionId: setAuthActiveInstitutionId,
  } = useAuth()
  const [horariosDocentes, setHorariosDocentes] = useState([])
  const [docenteMateria, setDocenteMateria] = useState([])
  const [disponibilidadDocente, setDisponibilidadDocente] = useState([])
  const [cargaHorariaDocente, setCargaHorariaDocente] = useState([])
  const [fechasBloqueadasDocente, setFechasBloqueadasDocente] = useState([])
  const [docentes, setDocentes] = useState([])
  const [planesEstudio, setPlanesEstudio] = useState([])
  const [correlatividades, setCorrelatividades] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState(initialFiles)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [regularCallRanges, setRegularCallRanges] = useState(createInitialRegularCallRanges)
  const [examType, setExamType] = useState(EXAM_GENERATION_TYPES.REGULAR)
  const [generationScope, setGenerationScope] = useState({ careers: [], year: '', respectCorrelativities: true })
  const [selectedSpecialSubjectKeys, setSelectedSpecialSubjectKeys] = useState([])
  const [cronograma, setCronograma] = useState([])
  const [requiereRegeneracion, setRequiereRegeneracion] = useState(false)
  const [isProvisioningStudents, setIsProvisioningStudents] = useState(false)
  const [studentAccessResult, setStudentAccessResult] = useState(null)
  const [selectedStudentCareer, setSelectedStudentCareer] = useState('')
  const [isProvisioningTeachers, setIsProvisioningTeachers] = useState(false)
  const [teacherAccessResult, setTeacherAccessResult] = useState(null)
  const [deletedPersonRecords, setDeletedPersonRecords] = useState([])
  const [isLoadingDeletedPersons, setIsLoadingDeletedPersons] = useState(false)
  const [restoringDeletedPersonId, setRestoringDeletedPersonId] = useState('')
  const [academicSnapshotData, setAcademicSnapshotData] = useState({})
  const [institutionAcademicData, setInstitutionAcademicData] = useState({
    institutionId: '', loaded: false, grades: [], studentRecords: [],
  })
  const [isRefreshingInstitutionAcademicData, setIsRefreshingInstitutionAcademicData] = useState(false)
  const [adminReviewDecisions, setAdminReviewDecisions] = useState([])
  const [adminReviewDrafts, setAdminReviewDrafts] = useState([])
  const [adminReviewPromotions, setAdminReviewPromotions] = useState([])
  const [adminReviewApprovalRequests, setAdminReviewApprovalRequests] = useState([])
  const [adminReviewSecondApprovals, setAdminReviewSecondApprovals] = useState([])
  const [examEngineV21State, setExamEngineV21State] = useState(null)
  const [activeWorkspaceView, setActiveWorkspaceView] = useState(readStoredWorkspaceView)
  const [hasOpenedExamEngineV21, setHasOpenedExamEngineV21] = useState(false)
  const [activeDashboardSection, setActiveDashboardSection] = useState('overview')
  const [isClearingWorkspace, setIsClearingWorkspace] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_WORKSPACE_VIEW_KEY, activeWorkspaceView)
    } catch {
      // La navegacion sigue funcionando aunque el navegador bloquee localStorage.
    }
  }, [activeWorkspaceView])

  const hydrateWorkspaceState = useCallback((snapshot) => {
    const nextDocenteMateria = snapshot.docenteMateria ?? []
    setHorariosDocentes(snapshot.horariosDocentes)
    setDocenteMateria(nextDocenteMateria)
    setDisponibilidadDocente(snapshot.disponibilidadDocente ?? [])
    setCargaHorariaDocente(snapshot.cargaHorariaDocente ?? [])
    setFechasBloqueadasDocente(snapshot.fechasBloqueadasDocente ?? [])
    setDocentes(snapshot.docentes)
    setPlanesEstudio(snapshot.planesEstudio)
    setCorrelatividades(snapshot.correlatividades)
    setAlumnos(snapshot.alumnos)
    setUploadedFiles(snapshot.uploadedFiles)
    setFechaInicio(snapshot.fechaInicio)
    setFechaFin(snapshot.fechaFin)
    setRegularCallRanges(snapshot.examGenerationConfig?.regularCallRanges ?? createInitialRegularCallRanges())
    setExamType(snapshot.examGenerationConfig?.examType ?? EXAM_GENERATION_TYPES.REGULAR)
    setGenerationScope(snapshot.examGenerationConfig?.generationScope ?? { careers: [], year: '', respectCorrelativities: true })
    setSelectedSpecialSubjectKeys(snapshot.examGenerationConfig?.selectedSpecialSubjectKeys ?? [])
    setCronograma(snapshot.cronograma)
    setRequiereRegeneracion(snapshot.requiereRegeneracion)
    setAdminReviewDecisions(snapshot.adminReviewDecisions ?? [])
    setAdminReviewDrafts(snapshot.adminReviewDrafts ?? [])
    setAdminReviewPromotions(snapshot.adminReviewPromotions ?? [])
    setAdminReviewApprovalRequests(snapshot.adminReviewApprovalRequests ?? [])
    setAdminReviewSecondApprovals(snapshot.adminReviewSecondApprovals ?? [])
    setExamEngineV21State(snapshot.examEngineV21State ?? null)
    setAcademicSnapshotData(
      academicSnapshotKeys.reduce((accumulator, key) => {
        if (snapshot[key] !== undefined) {
          accumulator[key] = snapshot[key]
        }

        return accumulator
      }, {}),
    )
  }, [])

  const rankingDocentes = useMemo(
    () => crearRankingDocentesPorHoras(horariosDocentes, cronograma),
    [horariosDocentes, cronograma],
  )
  const teacherDirectoryRows = useMemo(
    () => [
      ...docenteMateria,
      ...cargaHorariaDocente,
      ...horariosDocentes,
    ],
    [docenteMateria, cargaHorariaDocente, horariosDocentes],
  )
  const teacherDirectory = useMemo(
    () => getTeachersFromProfiles(docentes, teacherDirectoryRows),
    [docentes, teacherDirectoryRows],
  )
  const careerOptions = useMemo(() => buildCareerCatalog({
    alumnos,
    correlatividades,
    cronograma,
    docentes,
    horariosDocentes,
    planesEstudio,
  }), [
    alumnos,
    correlatividades,
    cronograma,
    docentes,
    horariosDocentes,
    planesEstudio,
  ])
  const snapshotPayload = useMemo(() => ({
    ...academicSnapshotData,
    horariosDocentes,
    docenteMateria,
    disponibilidadDocente,
    cargaHorariaDocente,
    fechasBloqueadasDocente,
    docentes,
    planesEstudio,
    correlatividades,
    alumnos,
    uploadedFiles,
    fechaInicio,
    fechaFin,
    examGenerationConfig: {
      examType,
      generationScope,
      regularCallRanges,
      selectedSpecialSubjectKeys,
    },
    cronograma,
    adminReviewDecisions,
    adminReviewDrafts,
    adminReviewPromotions,
    adminReviewApprovalRequests,
    adminReviewSecondApprovals,
    examEngineV21State,
    requiereRegeneracion,
  }), [
    academicSnapshotData,
    adminReviewDecisions,
    adminReviewDrafts,
    adminReviewPromotions,
    adminReviewApprovalRequests,
    adminReviewSecondApprovals,
    examEngineV21State,
    alumnos,
    correlatividades,
    cronograma,
    examType,
    fechaFin,
    fechaInicio,
    generationScope,
    horariosDocentes,
    docenteMateria,
    disponibilidadDocente,
    cargaHorariaDocente,
    fechasBloqueadasDocente,
    docentes,
    planesEstudio,
    regularCallRanges,
    requiereRegeneracion,
    selectedSpecialSubjectKeys,
    uploadedFiles,
  ])

  const {
    activeInstitution,
    activeInstitutionId,
    institutions,
    isHydrating,
    isLoadingInstitutions,
    lastSyncedAt,
    clearWorkspaceNow,
    saveSnapshotNow,
    syncStatus,
    useRemoteWorkspace,
    canWriteRemoteWorkspace,
    workspaceKey,
    workspaceSource,
    isRelationalWorkspaceSource,
  } = useWorkspacePersistence({
    isRemoteSession,
    isSuperAdmin,
    ownerEmail: user?.email ?? null,
    ownerUserId: user?.id ?? null,
    onHydrate: hydrateWorkspaceState,
    snapshotPayload,
    contextInstitutions: authInstitutions,
    contextActiveInstitutionId: authActiveInstitutionId,
    onActiveInstitutionIdChange: setAuthActiveInstitutionId,
  })
  const courseEnrollmentLegacyInputs = useMemo(() => ({
    studentRecords: alumnos.map((row) => ({
      id: row.record_id ?? row.id,
      institution_id: activeInstitutionId,
      email: row.email,
      career: row.carrera ?? row.career,
    })),
    profiles: alumnos.flatMap((row) => {
      const userId = row.profile_id ?? row.user_id
      return userId ? [{
        user_id: userId,
        email: row.email,
        account_role: 'alumno',
      }] : []
    }),
    memberships: alumnos.flatMap((row) => {
      const userId = row.profile_id ?? row.user_id
      return userId && activeInstitutionId ? [{
        user_id: userId,
        institution_id: activeInstitutionId,
      }] : []
    }),
  }), [activeInstitutionId, alumnos])

  const {
    descargarKitExamEngineV2,
    descargarPlanillaPrecargada,
    descargarPlantillaDocentes,
    descargarPlantillaAlumnos,
  } = useCronogramaExports({
    academicData: academicSnapshotData,
    alumnos,
    careerOptions,
    correlatividades,
    cronograma,
    docenteMateria,
    docentes,
    fechaFin,
    fechaInicio,
    horariosDocentes,
    institution: activeInstitution,
    planesEstudio,
    regularCallRanges,
  })

  const canEditWorkspace = canWriteRemoteWorkspace
  const activeInstitutionName = activeInstitution?.name ?? ''
  const workspaceClearCounts = useMemo(() => ({
    alumnos: alumnos.length,
    cronograma: cronograma.length,
    docenteMateria: docenteMateria.length,
    docentes: docentes.length,
    horariosDocentes: horariosDocentes.length,
    planesEstudio: planesEstudio.length,
    uploadedFiles: Object.values(uploadedFiles ?? {}).filter(Boolean).length,
  }), [
    alumnos.length,
    cronograma.length,
    docenteMateria.length,
    docentes.length,
    horariosDocentes.length,
    planesEstudio.length,
    uploadedFiles,
  ])
  const {
    onUploadMaster,
    onUploadTeachers,
    onUploadStudents,
  } = useCronogramaFiles({
    activeInstitutionId,
    alumnos,
    correlatividades,
    cronogramaLength: cronograma.length,
    docenteMateria,
    horariosDocentes,
    docentes,
    planesEstudio,
    persistWorkspaceSnapshot: saveSnapshotNow,
    snapshotPayload,
    setAlumnos,
    setCargaHorariaDocente,
    setCorrelatividades,
    setDocenteMateria,
    setHorariosDocentes,
    setDisponibilidadDocente,
    setDocentes,
    setPlanesEstudio,
    setRequiereRegeneracion,
    setUploadedFiles,
    uploadedFiles,
    canEditWorkspace,
    useRemoteWorkspace,
    workspaceKey,
  })

  const borrarCargaWorkspace = useCallback(async () => {
    if (!canEditWorkspace) {
      toast.error('Tu rol actual no permite borrar la carga del workspace.')
      return
    }

    if (isClearingWorkspace) return

    const hasData = Object.values(workspaceClearCounts).some((count) => Number(count) > 0)
    if (!hasData) {
      toast.error('No hay datos cargados para borrar.')
      return
    }

    const institutionLabel = activeInstitutionName ? ` de ${activeInstitutionName}` : ''
    const firstConfirmation = window.confirm(
      `Esto va a eliminar toda la carga${institutionLabel}: docentes, planes, horarios, alumnos, titularidades, inscripciones, notas, asistencia y mesas. No borra usuarios, accesos ni la institucion activa. Esta accion no se puede deshacer. Continuar?`,
    )

    if (!firstConfirmation) return

    const typedConfirmation = window.prompt('Para confirmar el borrado escribi BORRAR')
    if (typedConfirmation !== 'BORRAR') {
      toast.error('Borrado cancelado.')
      return
    }

    setIsClearingWorkspace(true)

    try {
      const result = await clearWorkspaceNow()
      hydrateWorkspaceState(result.snapshot)
      setStudentAccessResult(null)
      setTeacherAccessResult(null)
      setActiveDashboardSection('data')
      toast.success('Carga eliminada. Ya podes volver a subir las planillas limpias.')
    } catch (error) {
      toast.error(`No se pudo eliminar la carga: ${error.message}`)
    } finally {
      setIsClearingWorkspace(false)
    }
  }, [
    activeInstitutionName,
    canEditWorkspace,
    clearWorkspaceNow,
    hydrateWorkspaceState,
    isClearingWorkspace,
    workspaceClearCounts,
  ])

  const publicarCronogramaFinalDesdeMotor = useCallback(async (publishedCronograma = []) => {
    if (!canEditWorkspace) {
      toast.error('Tu rol actual no permite publicar el cronograma final.')
      return false
    }

    if (!publishedCronograma.length) {
      toast.error('No hay mesas confirmadas para publicar.')
      return false
    }

    const nextSnapshot = {
      ...snapshotPayload,
      cronograma: publishedCronograma,
      requiereRegeneracion: false,
    }

    setCronograma(publishedCronograma)
    setRequiereRegeneracion(false)

    try {
      await saveSnapshotNow(nextSnapshot)
      return true
    } catch (error) {
      toast.error(`No se pudo guardar el cronograma final: ${error.message}`)
      return false
    }
  }, [canEditWorkspace, saveSnapshotNow, snapshotPayload])

  const persistirEstadoMotorMesas = useCallback(async (nextState) => {
    setExamEngineV21State(nextState)

    try {
      await saveSnapshotNow({
        ...snapshotPayload,
        examEngineV21State: nextState,
      }, {
        syncOperational: false,
      })
      return true
    } catch (error) {
      toast.error(`No se pudo guardar el avance del motor de mesas: ${error.message}`)
      return false
    }
  }, [saveSnapshotNow, snapshotPayload])

  const reiniciarProcesoMesasDesdeMotor = useCallback(() => {
    if (!canEditWorkspace) {
      toast.error('Tu rol actual no permite reiniciar el proceso de mesas.')
      return false
    }

    setCronograma([])
    setExamEngineV21State(null)
    setAcademicSnapshotData((current) => ({
      ...current,
      examEnrollments: [],
    }))
    return true
  }, [canEditWorkspace])

  async function crearAccesosAlumnos() {
    try {
      setIsProvisioningStudents(true)
      const result = await provisionStudentAccess({
        institutionId: activeInstitutionId,
        students: alumnos,
        useRemote: useRemoteWorkspace,
      })
      setStudentAccessResult(result)

      const hasLinkedResults = Array.isArray(result.results) && result.results.some((entry) => entry?.user_id)
      if (hasLinkedResults) {
        const nextAlumnos = applyStudentAccessResultsToRows(alumnos, result.results)
        setAlumnos(nextAlumnos)
        await saveSnapshotNow({ ...snapshotPayload, alumnos: nextAlumnos })
      }

      if (result.failed > 0) {
        toast.error(`Accesos procesados con ${result.failed} errores. Revisa DNI/email en el padron.`)
        return
      }

      toast.success(`Accesos listos: ${result.created} creados y ${result.updated} actualizados.`)
      showImportantNotice({
        tone: 'success',
        title: 'Accesos de alumnos listos',
        message: 'Los usuarios del portal alumno fueron procesados desde el padrÃ³n.',
        details: [
          `${result.created} accesos creados.`,
          `${result.updated} accesos actualizados.`,
          result.skippedExisting ? `${result.skippedExisting} alumnos omitidos porque ya tenÃ­an acceso vinculado.` : '',
          result.batches > 1 ? `Procesado en ${result.batches} tandas para evitar lÃ­mites de Supabase.` : '',
          'Si agregaste alumnos nuevos, ya podÃ©s entregarles email y DNI como credenciales iniciales.',
        ],
      })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsProvisioningStudents(false)
    }
  }

  async function crearAccesosDocentes() {
    try {
      setIsProvisioningTeachers(true)
      const result = await provisionTeacherAccess({
        institutionId: activeInstitutionId,
        schedules: teacherDirectoryRows,
        teacherProfiles: docentes,
        useRemote: useRemoteWorkspace,
      })
      setTeacherAccessResult(result)

      if (result.failed > 0) {
        toast.error(`Accesos docentes procesados con ${result.failed} errores. Revisa DNI en la planilla de docentes.`)
        return
      }

      toast.success(`Accesos docentes listos: ${result.created} creados y ${result.updated} actualizados.`)
      showImportantNotice({
        tone: 'success',
        title: 'Accesos docentes listos',
        message: 'Los usuarios del portal docente fueron procesados desde el padrÃ³n.',
        details: [
          `${result.created} accesos creados.`,
          `${result.updated} accesos actualizados.`,
          'Los docentes ya pueden ingresar al portal con las credenciales configuradas.',
        ],
      })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsProvisioningTeachers(false)
    }
  }

  const cargarBajasPadron = useCallback(async () => {
    if (!activeInstitutionId || !useRemoteWorkspace) {
      setDeletedPersonRecords([])
      return []
    }

    setIsLoadingDeletedPersons(true)
    try {
      const records = await fetchDeletedPersonRecords({
        institutionId: activeInstitutionId,
        workspaceKey,
        personTypes: ['student', 'teacher', 'admin'],
        useRemote: useRemoteWorkspace,
      })
      setDeletedPersonRecords(records)
      return records
    } catch (error) {
      toast.error(`No se pudieron cargar las bajas: ${error.message}`)
      return []
    } finally {
      setIsLoadingDeletedPersons(false)
    }
  }, [activeInstitutionId, useRemoteWorkspace, workspaceKey])

  useEffect(() => {
    if (!['students', 'teachers'].includes(activeWorkspaceView)) return
    const timeoutId = window.setTimeout(() => {
      cargarBajasPadron()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [activeWorkspaceView, cargarBajasPadron])

  async function crearAlumno(nextStudent) {
    const validation = validateStudentDraft({
      draft: nextStudent,
      students: alumnos,
    })

    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    const nextAlumnos = [...alumnos, validation.student]
    setAlumnos(nextAlumnos)

    try {
      await saveSnapshotNow({ ...snapshotPayload, alumnos: nextAlumnos })
    } catch (error) {
      toast.error(`Alumno agregado localmente, pero no se pudo guardar el alta: ${error.message}`)
      return false
    }

    toast.success('Alumno agregado al padron.')
    return true
  }

  async function actualizarAlumno(studentKey, nextStudent) {
    const currentStudent = alumnos.find((student, index) => getStudentKey(student, index) === studentKey)

    if (!currentStudent) {
      toast.error('No se encontro el alumno que intentas actualizar.')
      return false
    }

    const validation = validateStudentDraft({
      currentIdentity: getStudentDraftIdentity(currentStudent),
      draft: {
        ...currentStudent,
        ...nextStudent,
      },
      students: alumnos,
    })

    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    const previousCareer = normalizeValue(currentStudent.carrera ?? currentStudent.career ?? currentStudent.carrera_nombre)
    const nextCareer = normalizeValue(validation.student.carrera ?? validation.student.career ?? validation.student.carrera_nombre)
    const changedCareer = Boolean(previousCareer && nextCareer && previousCareer !== nextCareer)
    const nextAlumnos = alumnos.map((student, index) => (
      getStudentKey(student, index) === studentKey
        ? {
          ...student,
          ...validation.student,
        }
        : student
    ))

    setAlumnos(nextAlumnos)

    try {
      await saveSnapshotNow({ ...snapshotPayload, alumnos: nextAlumnos })
    } catch (error) {
      toast.error(`Alumno actualizado localmente, pero no se pudo guardar el cambio: ${error.message}`)
      return false
    }

    if (changedCareer) {
      showImportantNotice({
        tone: 'success',
        title: 'Alumno movido de carrera',
        message: `${validation.student.full_name || validation.student.email || 'El alumno'} fue actualizado correctamente.`,
        details: [
          `Carrera anterior: ${currentStudent.carrera ?? currentStudent.career ?? currentStudent.carrera_nombre ?? 'Sin carrera'}.`,
          `Nueva carrera: ${validation.student.carrera}.`,
          'El acceso del alumno se conserva; no se crea una cuenta nueva.',
        ],
      })
    }

    toast.success(changedCareer ? 'Alumno actualizado y movido de carrera.' : 'Alumno actualizado.')
    return true
  }

  async function borrarAlumno(studentKey) {
    const student = alumnos.find((entry, index) => getStudentKey(entry, index) === studentKey)

    if (!student) {
      toast.error('No se encontro el alumno que intentas eliminar.')
      return false
    }

    if (!confirmStudentDeletion(student)) return false

    try {
      await archiveDeletedPerson({
        institutionId: activeInstitutionId,
        workspaceKey,
        personType: 'student',
        person: student,
        deletedByEmail: user?.email,
        deletionSource: 'student_roster',
        useRemote: useRemoteWorkspace,
      })
    } catch (error) {
      toast.error(`No se elimino el alumno porque no se pudo registrar la baja: ${error.message}`)
      return false
    }

    const nextAlumnos = alumnos.filter((student, index) => getStudentKey(student, index) !== studentKey)

    try {
      await saveSnapshotNow({ ...snapshotPayload, alumnos: nextAlumnos })
    } catch (error) {
      toast.error(`La baja fue auditada, pero no se pudo guardar el padron actualizado: ${error.message}`)
      return false
    }

    setAlumnos(nextAlumnos)
    toast.success('Alumno eliminado del padron.')
    return true
  }

  async function restaurarAlumnoDesdeBaja(record) {
    const restoredStudent = record?.raw_payload

    if (!restoredStudent || typeof restoredStudent !== 'object') {
      toast.error('La baja no tiene datos suficientes para restaurar el alumno.')
      return false
    }

    const validation = validateStudentDraft({
      draft: restoredStudent,
      students: alumnos,
    })

    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    const nextAlumnos = [...alumnos, {
      ...restoredStudent,
      ...validation.student,
      estado: validation.student.estado || restoredStudent.estado || 'activo',
    }]

    setRestoringDeletedPersonId(record.id)
    try {
      await saveSnapshotNow({ ...snapshotPayload, alumnos: nextAlumnos })
      await markDeletedPersonRestored({
        id: record.id,
        restoredByEmail: user?.email,
        useRemote: useRemoteWorkspace,
      })
      setAlumnos(nextAlumnos)
      setDeletedPersonRecords((current) => current.filter((entry) => entry.id !== record.id))
      toast.success('Alumno restaurado en el padron.')
      return true
    } catch (error) {
      toast.error(`No se pudo restaurar el alumno: ${error.message}`)
      return false
    } finally {
      setRestoringDeletedPersonId('')
    }
  }

  async function crearDocente(nextTeacher) {
    const validation = validateTeacherDraft({
      draft: nextTeacher,
      teachers: docentes,
    })

    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    const nextDocentes = [...docentes, validation.teacher]
    setDocentes(nextDocentes)

    try {
      await saveSnapshotNow({ ...snapshotPayload, docentes: nextDocentes })
    } catch (error) {
      toast.error(`Docente agregado localmente, pero no se pudo guardar el alta: ${error.message}`)
      return false
    }

    toast.success('Docente agregado al padron.')
    return true
  }

  function actualizarDocente(teacherIdentity, nextTeacher) {
    const currentTeacher = docentes.find(
      (teacher) => getTeacherProfileIdentity(teacher) === teacherIdentity,
    )

    if (!currentTeacher) {
      toast.error('No se encontro el docente que intentas actualizar.')
      return false
    }

    const validation = validateTeacherDraft({
      currentIdentity: getTeacherDraftIdentity(currentTeacher),
      draft: {
        ...currentTeacher,
        ...nextTeacher,
      },
      teachers: docentes,
    })

    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    const previous = normalizeValue(
      currentTeacher.full_name || [currentTeacher.nombre, currentTeacher.apellido].filter(Boolean).join(' '),
    )
    const previousDni = normalizeValue(currentTeacher.dni)
    const validatedTeacher = validation.teacher

    setDocentes((current) => current.map((teacher) => {
      if (getTeacherProfileIdentity(teacher) !== teacherIdentity) return teacher

      return {
        ...teacher,
        ...validatedTeacher,
      }
    }))
    setHorariosDocentes((current) => current.map((schedule) => {
      const scheduleTeacher = normalizeValue(schedule.profesor || schedule.docente || schedule.nombre)
      const scheduleDni = normalizeValue(schedule.dni || schedule.documento)
      const isTargetSchedule = (
        (previousDni && scheduleDni === previousDni) ||
        scheduleTeacher === previous
      )

      if (!isTargetSchedule) return schedule

      return {
        ...schedule,
        profesor: validatedTeacher.full_name,
        dni: validatedTeacher.dni,
        telefono: validatedTeacher.telefono,
      }
    }))
    setRequiereRegeneracion(true)
    toast.success('Docente actualizado en sus horarios.')
    return true
  }

  async function borrarDocente(teacherIdentity) {
    if (!window.confirm('Borrar este docente y todos sus bloques de horarios?')) return false

    const currentTeacher = docentes.find(
      (teacher) => getTeacherProfileIdentity(teacher) === teacherIdentity,
    )

    if (!currentTeacher) {
      toast.error('No se encontro el docente que intentas eliminar.')
      return false
    }

    const target = normalizeValue(
      currentTeacher.full_name || [currentTeacher.nombre, currentTeacher.apellido].filter(Boolean).join(' '),
    )
    const targetDni = normalizeValue(currentTeacher.dni)

    try {
      await archiveDeletedPerson({
        institutionId: activeInstitutionId,
        workspaceKey,
        personType: 'teacher',
        person: currentTeacher,
        deletedByEmail: user?.email,
        deletionSource: 'teacher_roster',
        useRemote: useRemoteWorkspace,
      })
    } catch (error) {
      toast.error(`No se elimino el docente porque no se pudo registrar la baja: ${error.message}`)
      return false
    }

    const nextDocentes = docentes.filter((teacher) => getTeacherProfileIdentity(teacher) !== teacherIdentity)
    const nextHorariosDocentes = horariosDocentes.filter((schedule) => {
      const scheduleTeacher = normalizeValue(schedule.profesor || schedule.docente || schedule.nombre)
      const scheduleDni = normalizeValue(schedule.dni || schedule.documento)
      return !(
        (targetDni && scheduleDni === targetDni) ||
        scheduleTeacher === target
      )
    })
    const nextDisponibilidadDocente = disponibilidadDocente.filter((row) => {
      const rowTeacher = normalizeValue(row.docente || row.profesor || row.nombre)
      const rowDni = normalizeValue(row.dni_docente || row.dni || row.documento)
      return !(
        (targetDni && rowDni === targetDni) ||
        rowTeacher === target
      )
    })
    const nextCargaHorariaDocente = cargaHorariaDocente.filter((row) => {
      const rowTeacher = normalizeValue(row.docente || row.profesor || row.nombre)
      const rowDni = normalizeValue(row.dni_docente || row.dni || row.documento)
      return !(
        (targetDni && rowDni === targetDni) ||
        rowTeacher === target
      )
    })

    try {
      await saveSnapshotNow({
        ...snapshotPayload,
        docentes: nextDocentes,
        horariosDocentes: nextHorariosDocentes,
        disponibilidadDocente: nextDisponibilidadDocente,
        cargaHorariaDocente: nextCargaHorariaDocente,
      })
    } catch (error) {
      toast.error(`La baja fue auditada, pero no se pudo guardar el padron actualizado: ${error.message}`)
      return false
    }

    setDocentes(nextDocentes)
    setHorariosDocentes(nextHorariosDocentes)
    setDisponibilidadDocente(nextDisponibilidadDocente)
    setCargaHorariaDocente(nextCargaHorariaDocente)
    setRequiereRegeneracion(true)
    toast.success('Docente eliminado del padron y sus horarios.')
    return true
  }

  async function restaurarDocenteDesdeBaja(record) {
    const restoredTeacher = record?.raw_payload

    if (!restoredTeacher || typeof restoredTeacher !== 'object') {
      toast.error('La baja no tiene datos suficientes para restaurar el docente.')
      return false
    }

    const validation = validateTeacherDraft({
      draft: restoredTeacher,
      teachers: docentes,
    })

    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    const nextDocentes = [...docentes, {
      ...restoredTeacher,
      ...validation.teacher,
      estado: validation.teacher.estado || restoredTeacher.estado || 'activo',
    }]

    setRestoringDeletedPersonId(record.id)
    try {
      await saveSnapshotNow({ ...snapshotPayload, docentes: nextDocentes })
      await markDeletedPersonRestored({
        id: record.id,
        restoredByEmail: user?.email,
        useRemote: useRemoteWorkspace,
      })
      setDocentes(nextDocentes)
      setDeletedPersonRecords((current) => current.filter((entry) => entry.id !== record.id))
      setRequiereRegeneracion(true)
      toast.success('Docente restaurado en el padron.')
      return true
    } catch (error) {
      toast.error(`No se pudo restaurar el docente: ${error.message}`)
      return false
    } finally {
      setRestoringDeletedPersonId('')
    }
  }

  async function restaurarPersonaDesdeBaja(record) {
    if (record?.person_type === 'student') return restaurarAlumnoDesdeBaja(record)
    if (record?.person_type === 'teacher') return restaurarDocenteDesdeBaja(record)

    toast.error('La restauracion de administrativos requiere recuperar el usuario de Auth desde el panel superadmin.')
    return false
  }

  function createLocalId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  function marcarDatosDocentesPendientes() {
    if (cronograma.length) {
      setRequiereRegeneracion(true)
    }
  }

  function crearDisponibilidadDocente(draft) {
    const validation = validateAvailabilityDraft(draft)
    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    setDisponibilidadDocente((current) => [
      ...current,
      {
        id: createLocalId('disp-docente'),
        ...validation.value,
      },
    ])
    marcarDatosDocentesPendientes()
    toast.success('Disponibilidad docente agregada.')
    return true
  }

  function actualizarDisponibilidadDocente(rowId, draft) {
    const validation = validateAvailabilityDraft(draft)
    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    setDisponibilidadDocente((current) => current.map((row, index) => {
      const currentId = row.id ?? `availability-${index}`
      return currentId === rowId
        ? {
          ...row,
          ...validation.value,
        }
        : row
    }))
    marcarDatosDocentesPendientes()
    toast.success('Disponibilidad docente actualizada.')
    return true
  }

  function borrarDisponibilidadDocente(rowId) {
    setDisponibilidadDocente((current) => current.filter((row, index) => (row.id ?? `availability-${index}`) !== rowId))
    marcarDatosDocentesPendientes()
    toast.success('Disponibilidad docente borrada.')
  }

  function crearCargaHorariaDocente(draft) {
    const validation = validateLoadDraft(draft)
    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    setCargaHorariaDocente((current) => [
      ...current,
      {
        id: createLocalId('carga-docente'),
        ...validation.value,
      },
    ])
    marcarDatosDocentesPendientes()
    toast.success('Carga horaria docente agregada.')
    return true
  }

  function actualizarCargaHorariaDocente(rowId, draft) {
    const validation = validateLoadDraft(draft)
    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }

    setCargaHorariaDocente((current) => current.map((row, index) => {
      const currentId = row.id ?? `load-${index}`
      return currentId === rowId
        ? {
          ...row,
          ...validation.value,
        }
        : row
    }))
    marcarDatosDocentesPendientes()
    toast.success('Carga horaria docente actualizada.')
    return true
  }

  function borrarCargaHorariaDocente(rowId) {
    setCargaHorariaDocente((current) => current.filter((row, index) => (row.id ?? `load-${index}`) !== rowId))
    marcarDatosDocentesPendientes()
    toast.success('Carga horaria docente borrada.')
  }

  function generarCargaHorariaDesdeHorarios() {
    const result = buildCargaHorariaDocenteFromHorarios({
      cargaHorariaDocente,
      horariosDocentes,
    })

    if (result.generated === 0) {
      toast.error('No se encontraron horarios docentes validos para calcular horas catedra.')
      return false
    }

    setCargaHorariaDocente(result.rows)
    marcarDatosDocentesPendientes()
    toast.success(`Horas catedra generadas: ${result.generated} materias. Se preservaron ${result.preserved} cargas manuales.`)
    return true
  }

  function crearFechaBloqueadaDocente(draft) {
    const validation = validateTeacherBlockedDateDraft(draft)
    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }
    const now = new Date().toISOString()
    setFechasBloqueadasDocente((current) => [...current, {
      id: createLocalId('bloqueo-docente'),
      ...validation.value,
      createdAt: now,
      updatedAt: now,
    }])
    toast.success('Fecha bloqueada agregada.')
    return true
  }

  function actualizarFechaBloqueadaDocente(rowId, draft) {
    const validation = validateTeacherBlockedDateDraft(draft)
    if (!validation.ok) {
      toast.error(validation.error)
      return false
    }
    setFechasBloqueadasDocente((current) => current.map((row, index) => (
      (row.id ?? `teacher-block-${index}`) === rowId
        ? { ...row, ...validation.value, updatedAt: new Date().toISOString() }
        : row
    )))
    toast.success('Fecha bloqueada actualizada.')
    return true
  }

  function borrarFechaBloqueadaDocente(rowId) {
    setFechasBloqueadasDocente((current) => current.filter((row, index) => (
      (row.id ?? `teacher-block-${index}`) !== rowId
    )))
    toast.success('Fecha bloqueada borrada.')
  }

  const persistenceHeading = getPersistenceHeading({
    isLoadingInstitutions,
    isRemoteSession,
    isSupabaseConfigured,
    useRemoteWorkspace,
    workspaceSource,
  })
  const persistenceMessage = getPersistenceMessage({
    activeInstitution,
    isRemoteSession,
    isSupabaseConfigured,
    isLoadingInstitutions,
    lastSyncedAt,
    syncStatus,
    useRemoteWorkspace,
    workspaceSource,
  })

  const loadInstitutionAcademicData = useCallback(() => {
    if (isRelationalWorkspaceSource || !useRemoteWorkspace || !activeInstitutionId) {
      return Promise.resolve({ grades: [], studentRecords: [] })
    }

    return fetchInstitutionAcademicCanonicalData({
      institutionId: activeInstitutionId,
      workspaceKey,
      useRemote: useRemoteWorkspace,
    })
  }, [activeInstitutionId, isRelationalWorkspaceSource, useRemoteWorkspace, workspaceKey])

  const refreshInstitutionAcademicData = useCallback(async ({ notify = false } = {}) => {
    if (isRelationalWorkspaceSource || !useRemoteWorkspace || !activeInstitutionId) {
      setInstitutionAcademicData({
        institutionId: activeInstitutionId || '', loaded: false, grades: [], studentRecords: [],
      })
      return { grades: [], studentRecords: [] }
    }

    setIsRefreshingInstitutionAcademicData(true)
    try {
      const { grades, studentRecords } = await loadInstitutionAcademicData()
      setInstitutionAcademicData({
        institutionId: activeInstitutionId, loaded: true, grades, studentRecords,
      })
      if (notify) toast.success('Datos academicos actualizados.')
      return { grades, studentRecords }
    } catch (error) {
      console.warn('No se pudo sincronizar la fuente academica canonica con el panel administrador.', error)
      if (notify) toast.error(`No se pudieron actualizar los datos academicos: ${error.message}`)
      return null
    } finally {
      setIsRefreshingInstitutionAcademicData(false)
    }
  }, [activeInstitutionId, isRelationalWorkspaceSource, loadInstitutionAcademicData, useRemoteWorkspace])

  useEffect(() => {
    let cancelled = false

    if (isRelationalWorkspaceSource || !useRemoteWorkspace || !activeInstitutionId) {
      Promise.resolve().then(() => {
        if (!cancelled) setInstitutionAcademicData({
          institutionId: activeInstitutionId || '', loaded: false, grades: [], studentRecords: [],
        })
      })
      return () => { cancelled = true }
    }

    Promise.resolve().then(() => {
      if (cancelled) return
      setIsRefreshingInstitutionAcademicData(true)
      loadInstitutionAcademicData()
        .then(({ grades, studentRecords }) => {
          if (!cancelled) setInstitutionAcademicData({
            institutionId: activeInstitutionId, loaded: true, grades, studentRecords,
          })
        })
        .catch((error) => {
          console.warn('No se pudo sincronizar la fuente academica canonica con el panel administrador.', error)
          if (!cancelled) setInstitutionAcademicData({
            institutionId: activeInstitutionId, loaded: false, grades: [], studentRecords: [],
          })
        })
        .finally(() => {
          if (!cancelled) setIsRefreshingInstitutionAcademicData(false)
        })
    })

    return () => { cancelled = true }
  }, [activeInstitutionId, isRelationalWorkspaceSource, loadInstitutionAcademicData, selectedStudentCareer, useRemoteWorkspace])

  const descargarArchivosOriginales = useCallback(async () => {
    if (!useRemoteWorkspace) {
      toast.error('Los archivos originales no estan almacenados en el modo local.')
      return
    }

    try {
      const files = await downloadSourceFiles({
        institutionId: activeInstitutionId,
        workspaceKey,
        useRemote: true,
      })

      files.forEach(({ blob, fileName }) => {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = fileName
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
      })

      toast.success(`${files.length} archivo${files.length === 1 ? '' : 's'} original${files.length === 1 ? '' : 'es'} descargado${files.length === 1 ? '' : 's'}.`)
    } catch (error) {
      toast.error(`No se pudieron descargar los archivos originales: ${error.message}`)
    }
  }, [activeInstitutionId, useRemoteWorkspace, workspaceKey])
  const {
    checklist,
    teacherSourceReadiness,
  } = getCronogramaViewState({
    cargaHorariaDocente,
    cronograma,
    disponibilidadDocente,
    docentes,
    examType,
    fechaFin,
    fechaInicio,
    horariosDocentes,
    rankingDocentes,
    regularCallRanges,
    requiereRegeneracion,
    uploadedFiles,
    workspaceSource,
  })

  const masterWorkbookReady = Boolean(uploadedFiles.masterWorkbook)
  const dedicatedFilesReady = Boolean(uploadedFiles.docentesWorkbook && uploadedFiles.alumnosWorkbook)
  const dataReady = Boolean(masterWorkbookReady && dedicatedFilesReady && teacherSourceReadiness.hasValidTeacherSource && planesEstudio.length)
  const examEngineUploadedFiles = {
    ...uploadedFiles,
    masterWorkbook: masterWorkbookReady,
    horarios: Boolean(masterWorkbookReady && teacherSourceReadiness.hasValidTeacherSource),
    planes: Boolean(masterWorkbookReady && planesEstudio.length),
    correlatividades: Boolean(masterWorkbookReady),
  }

  function actualizarEstadosAcademicosAlumno({ student, records }) {
    const studentDni = normalizeValue(student?.dni)
    const studentEmail = normalizeValue(student?.email)
    setAcademicSnapshotData((current) => {
      let nextRows = [...(current.estadoAcademico ?? [])]
      records.forEach(({ subject, values }) => {
        const subjectId = String(subject?.id ?? subject?.subject_id ?? subject?.materia ?? subject?.code ?? '').trim()
        const matchesRecord = (row) => {
          const sameStudent = (
            (studentDni && normalizeValue(row.dni ?? row.student_dni) === studentDni) ||
            (studentEmail && normalizeValue(row.email ?? row.student_email) === studentEmail)
          )
          const rowSubjectId = String(row.subject_id ?? row.materia_id ?? row.materia ?? row.code ?? '').trim()
          return sameStudent && normalizeValue(rowSubjectId) === normalizeValue(subjectId)
        }
        const previousRecord = nextRows.find(matchesRecord)
        const nextRecord = {
          ...previousRecord,
          id: previousRecord?.id ?? createLocalId('estado-academico'),
          dni: student?.dni ?? '', email: student?.email ?? '',
          alumno: student?.full_name ?? [student?.nombre, student?.apellido].filter(Boolean).join(' '),
          subject_id: subjectId,
          materia: subject?.nombre ?? subject?.name ?? subject?.materia ?? subject?.code ?? subjectId,
          estado: values.aprobada ? 'aprobada' : (values.regular ? 'regular' : ''),
          regular: Boolean(values.regular), aprobada: Boolean(values.aprobada),
          anio_regularidad: values.anioRegularidad ?? '',
          ausente: Boolean(values.ausente), fecha_ausencia: values.ausente ? values.fechaAusencia : '',
          nota: values.nota, fecha: values.fecha,
          observaciones: values.observaciones ?? previousRecord?.observaciones ?? '',
          updated_at: new Date().toISOString(), updated_by: user?.email ?? user?.id ?? 'administracion',
          source: 'student_academic_editor',
        }
        nextRows = previousRecord
          ? nextRows.map((row) => (matchesRecord(row) ? nextRecord : row))
          : [...nextRows, nextRecord]
      })
      return { ...current, estadoAcademico: nextRows }
    })
    toast.success(`${records.length} cambios academicos guardados.`)
    return true
  }

  async function resetearEstadoAcademicoAlumno(student, { currentPassword } = {}) {
    if (!canEditWorkspace) {
      toast.error('Tu rol actual no permite resetear el estado academico.')
      return false
    }

    try {
      await resetStudentAcademicRecords({
        institutionId: activeInstitutionId,
        workspaceKey,
        student,
        currentPassword,
        useRemote: useRemoteWorkspace,
      })

      setAcademicSnapshotData((current) => resetStudentAcademicSnapshotData(current, student))
      toast.success('Estado academico reseteado por completo.')
      return true
    } catch (error) {
      toast.error(error.message)
      return false
    }
  }
  const examEngineDataReady = Boolean(
    masterWorkbookReady && dedicatedFilesReady &&
    teacherSourceReadiness.hasValidTeacherSource &&
    planesEstudio.length,
  )
  const hasSchedule = cronograma.length > 0
  const devAuditDetectedRole = isSuperAdmin
    ? 'superadmin'
    : activeInstitution?.role ?? user?.accountRole ?? user?.role ?? 'sin_rol'
  const devAuditRoleAuthorized = import.meta.env.DEV && isDevAuditSnapshotRoleAuthorized({
    isSuperAdmin,
    detectedRole: devAuditDetectedRole,
  })
  const showAdvancedSection = import.meta.env.DEV && devAuditRoleAuthorized
  const dashboardProgressItems = [
    { done: dataReady, label: 'Datos base' },
    { done: hasSchedule, label: 'Cronograma' },
  ]
  const completedDashboardItems = dashboardProgressItems.filter((item) => item.done).length
  const dashboardProgressPercentage = Math.round((completedDashboardItems / dashboardProgressItems.length) * 100)
  const selectWorkspaceView = (view) => {
    if (view === 'exam-engine-v21') setHasOpenedExamEngineV21(true)
    setActiveWorkspaceView(view)
  }
  const nextDashboardAction = !masterWorkbookReady
    ? { section: 'overview', label: 'Cargar plantilla institucional', helper: 'Desde Inicio' }
    : (!uploadedFiles.docentesWorkbook
      ? { view: 'teachers', label: 'Cargar plantilla docente', helper: 'Desde Docentes' }
      : (!uploadedFiles.alumnosWorkbook
        ? { view: 'students', label: 'Cargar plantilla de alumnos', helper: 'Desde Alumnos' }
        : (!teacherSourceReadiness.hasValidTeacherSource
          ? { view: 'teachers', label: 'Revisar datos docentes', helper: 'Falta fuente docente valida' }
          : { view: 'exam-engine-v21', label: 'Armar mesas', helper: 'Abrir el nuevo motor' })))
  const dashboardSections = [
    {
      key: 'overview',
      label: 'Inicio',
      helper: 'Institucion',
      icon: Home,
    },
    {
      key: 'data',
      label: 'Plantillas',
      helper: 'Descargas y limpieza',
      icon: Database,
    },
    ...(showAdvancedSection ? [{
      key: 'advanced',
      label: 'Avanzado',
      helper: devAuditRoleAuthorized ? 'Auditoria tecnica' : 'Diagnostico DEV',
      icon: Wrench,
    }] : []),
  ]

  return (
    <section className="work-surface admin-workspace-surface flex-1">
      <div className="admin-workspace-shell grid min-w-0 flex-1 gap-0 lg:grid-cols-[minmax(250px,288px)_minmax(0,1fr)]">
        <WorkspaceSidebar
          activeView={activeWorkspaceView}
          checklist={checklist}
          dataReady={dataReady}
          onSelectView={selectWorkspaceView}
          persistenceHeading={persistenceHeading}
          persistenceMessage={persistenceMessage}
          studentCount={alumnos.length}
          teacherCount={teacherDirectory.length}
        />

        <div className="admin-workspace-main min-w-0 space-y-5 p-3 sm:p-4 md:space-y-6 md:p-6 xl:p-8">
          {activeWorkspaceView === 'dashboard' ? (
            <>
              <div className="space-y-2">
                <WorkspaceNotice tone="sky">
                  Organiza el trabajo por secciones. Cambiar de seccion no borra archivos, fechas ni cronogramas.
                </WorkspaceNotice>

                {isRemoteSession && !isLoadingInstitutions && institutions.length === 0 && (
                  <WorkspaceNotice>
                    La sesion remota esta activa, pero este usuario todavia no tiene memberships.
                    Crea una institucion desde el panel Super Admin o ejecuta `00_base_schema.sql`
                    y luego las migraciones 01-12 listadas en `supabase/setup_multi_tenant/00_README.md`.
                  </WorkspaceNotice>
                )}

                {isHydrating && (
                  <WorkspaceNotice tone="sky">
                    Estamos recuperando el ultimo snapshot del workspace antes de que sigas trabajando.
                  </WorkspaceNotice>
                )}

                {!canEditWorkspace && (
                  <WorkspaceNotice tone="sky">
                    {isRelationalWorkspaceSource
                      ? 'Estas viendo datos reales del schema relacional nuevo en modo solo lectura. La edicion directa de padrones queda deshabilitada hasta conectar escrituras contra student_records y teacher_records.'
                      : 'Estas viendo este workspace en modo solo lectura. Tu rol actual permite consultar la informacion, pero no cargar archivos, editar, confirmar, regenerar ni borrar datos.'}
                  </WorkspaceNotice>
                )}
              </div>

              <section className="institution-dashboard-hero operational-dashboard-hero admin-dashboard-hero">
                <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`status-chip ${dataReady ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                        {dataReady ? 'Datos base listos' : 'Faltan planillas base'}
                      </span>
                      <span className="status-chip border-sky-200 bg-sky-50 text-sky-900">
                        {completedDashboardItems}/{dashboardProgressItems.length} etapas
                      </span>
                    </div>
                    <p className="soft-title mt-5">Administrador de institucion</p>
                    <h3 className="operational-dashboard-hero__title mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
                      Panel principal
                    </h3>
                    <p className="operational-dashboard-hero__description mt-3 max-w-3xl text-sm leading-6 md:text-base">
                      Vista central de la institucion, carreras, alumnos y docentes antes de entrar al armado de mesas.
                    </p>

                    <div className="mt-5 max-w-2xl">
                      <div className="operational-dashboard-hero__label flex items-center justify-between gap-3 text-xs font-extrabold uppercase tracking-[0.12em]">
                        <span>Avance operativo</span>
                        <span>{dashboardProgressPercentage}%</span>
                      </div>
                      <div className="operational-dashboard-hero__progress mt-2 h-2 overflow-hidden rounded-full">
                        <div className="h-full rounded-full bg-gradient-to-r from-teal-600 via-sky-500 to-amber-500" style={{ width: `${dashboardProgressPercentage}%` }} />
                      </div>
                    </div>
                  </div>

                  <aside className="dashboard-next-action">
                    <p className="operational-dashboard-hero__label text-xs font-extrabold uppercase tracking-[0.14em]">Siguiente accion</p>
                    <h4 className="operational-dashboard-hero__title mt-2 text-2xl font-extrabold">{nextDashboardAction.label}</h4>
                    <p className="operational-dashboard-hero__description mt-1 text-sm font-semibold">{nextDashboardAction.helper}</p>
                    <button
                      className="btn-primary mt-5 w-full"
                      type="button"
                      onClick={() => (
                        nextDashboardAction.view
                          ? selectWorkspaceView(nextDashboardAction.view)
                          : setActiveDashboardSection(nextDashboardAction.section)
                      )}
                    >
                      Ir ahora
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </aside>
                </div>

                <div className="mt-6 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  {dashboardSections.map((section) => {
                    const Icon = section.icon
                    const isActive = activeDashboardSection === section.key

                    return (
                      <button
                        key={section.key}
                        className={`dashboard-section-tab ${isActive ? 'dashboard-section-tab--active' : ''}`}
                        type="button"
                        onClick={() => setActiveDashboardSection(section.key)}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 text-left">
                          <span className="block text-sm font-extrabold">{section.label}</span>
                          <span className="mt-0.5 block text-xs font-semibold opacity-75">{section.helper}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              {activeDashboardSection === 'overview' && (
                <>
                  <UploadsSection
                    canEditWorkspace={canEditWorkspace}
                    canManageDataSource={isSuperAdmin}
                    isRelationalWorkspaceSource={isRelationalWorkspaceSource}
                    description="Subi la plantilla academica institucional con carreras, planes, materias y correlatividades."
                    onUploadMaster={onUploadMaster}
                    scope="institution"
                    title="Carga institucional"
                    uploadedFiles={uploadedFiles}
                  />

                  <InstitutionAdminOverview
                    activeInstitution={activeInstitution}
                    alumnos={alumnos}
                    cargaHorariaDocente={cargaHorariaDocente}
                    careerOptions={careerOptions}
                    docenteMateria={docenteMateria}
                    docentes={docentes}
                    horariosDocentes={horariosDocentes}
                    planesEstudio={planesEstudio}
                    teacherDirectory={teacherDirectory}
                    useRemoteWorkspace={useRemoteWorkspace}
                  />
                </>
              )}

              {activeDashboardSection === 'data' && (
                <>
                  <AssetsSection
                    onDownloadOriginals={descargarArchivosOriginales}
                    onDownloadKitExamEngineV2={descargarKitExamEngineV2}
                    onDownloadPrefilled={descargarPlanillaPrecargada}
                    onDownloadTeachers={descargarPlantillaDocentes}
                    onDownloadStudents={descargarPlantillaAlumnos}
                  />

                  <WorkspaceDangerZone
                    activeInstitutionName={activeInstitutionName}
                    canEditWorkspace={canEditWorkspace}
                    counts={workspaceClearCounts}
                    isClearing={isClearingWorkspace}
                    onClearWorkspace={borrarCargaWorkspace}
                    useRemoteWorkspace={useRemoteWorkspace}
                  />

                  <WorkspaceNotice tone={teacherSourceReadiness.hasValidTeacherSource ? 'sky' : 'amber'}>
                    {teacherSourceReadiness.message}
                    {teacherSourceReadiness.warnings.length > 0
                      ? ` Alertas: ${teacherSourceReadiness.warnings.slice(0, 3).join(' ')}`
                      : ''}
                  </WorkspaceNotice>

                  <TribunalMatrixDiagnosis
                    docenteMateria={docenteMateria}
                    horariosDocentes={horariosDocentes}
                    planesEstudio={planesEstudio}
                  />
                </>
              )}

              {activeDashboardSection === 'advanced' && showAdvancedSection && (
                <Suspense fallback={<WorkspaceNotice tone="sky">Cargando herramientas internas...</WorkspaceNotice>}>
                  {TeacherCourseRosterInternalPreview && (
                    <TeacherCourseRosterInternalPreview
                      detectedRole={devAuditDetectedRole}
                      hasAuthenticatedSession={isRemoteSession}
                      institutionId={activeInstitutionId}
                      isSuperAdmin={isSuperAdmin}
                      mode="admin"
                      user={user}
                    />
                  )}

                  {StudentCourseEnrollmentInternalPreview && (
                    <StudentCourseEnrollmentInternalPreview
                      detectedRole={devAuditDetectedRole}
                      hasAuthenticatedSession={isRemoteSession}
                      institutionId={activeInstitutionId}
                      isSuperAdmin={isSuperAdmin}
                      legacyInputs={courseEnrollmentLegacyInputs}
                      mode="admin"
                      user={user}
                    />
                  )}

                  {DevAuditSnapshotExport && (
                    <DevAuditSnapshotExport
                      detectedRole={devAuditDetectedRole}
                      devMode={import.meta.env.DEV}
                      isAdvancedSectionActive={activeDashboardSection === 'advanced'}
                      isSuperAdmin={isSuperAdmin}
                      snapshotPayload={snapshotPayload}
                      alumnos={alumnos}
                      correlatividades={correlatividades}
                      docenteMateria={docenteMateria}
                      docentes={docentes}
                      examType={examType}
                      fechaFin={fechaFin}
                      fechaInicio={fechaInicio}
                      generationScope={generationScope}
                      horariosDocentes={horariosDocentes}
                      planesEstudio={planesEstudio}
                      regularCallRanges={regularCallRanges}
                      selectedSpecialSubjectKeys={selectedSpecialSubjectKeys}
                    />
                  )}

                  {isSuperAdmin && RegularExamPreviewInternalPanel ? (
                    <RegularExamPreviewInternalPanel
                      alumnos={alumnos}
                      correlatividades={correlatividades}
                      docenteMateria={docenteMateria}
                      docentes={docentes}
                      examType={examType}
                      fechaFin={fechaFin}
                      fechaInicio={fechaInicio}
                      generationScope={generationScope}
                      horariosDocentes={horariosDocentes}
                      planesEstudio={planesEstudio}
                      regularCallRanges={regularCallRanges}
                      selectedSpecialSubjectKeys={selectedSpecialSubjectKeys}
                    />
                  ) : null}
                </Suspense>
              )}
            </>
          ) : activeWorkspaceView === 'exam-engine-v21' ? null : (
            <>
              <section className="rise-in admin-module-heading">
                <span className="soft-title">Modulo</span>
                <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-3xl font-bold text-slate-950">
                      {activeWorkspaceView === 'students' ? 'Padron de alumnos' : 'Padron de docentes'}
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                      {activeWorkspaceView === 'students'
                        ? 'Consulta, filtra y administra alumnos por nombre, apellido, DNI, carrera y anio. Desde este modulo tambien se crean sus accesos al portal.'
                        : 'Consulta, filtra y administra docentes por nombre, apellido, DNI, telefono y materias asociadas. Desde este modulo tambien se crean sus accesos al portal.'}
                    </p>
                  </div>
                  <div className={`soft-card w-full min-w-0 border-l-4 sm:w-auto sm:min-w-[240px] ${
                    activeWorkspaceView === 'students'
                      ? 'soft-card--tint-sky border-l-sky-500'
                      : 'soft-card--tint-teal border-l-teal-600'
                  }`}>
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-600">
                      Registros disponibles
                    </p>
                    <p className="mt-2 text-3xl font-extrabold text-slate-950">
                      {activeWorkspaceView === 'students' ? alumnos.length : teacherDirectory.length}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-700">
                      {activeWorkspaceView === 'students'
                        ? 'Registros listos para gestionar y provisionar accesos de alumnos.'
                        : 'Registros listos para gestionar y provisionar accesos de docentes.'}
                    </p>
                  </div>
                </div>
              </section>

              {activeWorkspaceView === 'students' ? (
                <>
                  <UploadsSection
                    canEditWorkspace={canEditWorkspace}
                    canManageDataSource={isSuperAdmin}
                    isRelationalWorkspaceSource={isRelationalWorkspaceSource}
                    description="SubÃ­ la plantilla general de alumnos. La carga agrega registros nuevos y actualiza los existentes."
                    onUploadStudents={onUploadStudents}
                    scope="students"
                    title="Carga de alumnos"
                    uploadedFiles={uploadedFiles}
                  />

                  {selectedStudentCareer ? (
                    <>
                      <StudentRosterSection
                        academicData={{
                          academicStatus: academicSnapshotData.academicStatus,
                          academicStatusRows: academicSnapshotData.academicStatusRows,
                          enrollments: academicSnapshotData.enrollments,
                          estadoAcademico: academicSnapshotData.estadoAcademico,
                          grades: institutionAcademicData.institutionId === activeInstitutionId && institutionAcademicData.loaded
                            ? institutionAcademicData.grades
                            : academicSnapshotData.grades,
                          studentRecords: institutionAcademicData.institutionId === activeInstitutionId && institutionAcademicData.loaded
                            ? institutionAcademicData.studentRecords
                            : [],
                          activeInstitution,
                          planesEstudio,
                        }}
                        alumnos={alumnos}
                        canEditWorkspace={canEditWorkspace}
                        canManageStudentFinancialStatus={Boolean(
                          isSuperAdmin || ['owner', 'admin'].includes(activeInstitution?.role),
                        )}
                        careerFilter={selectedStudentCareer}
                        careerOptions={careerOptions}
                        institutionId={activeInstitutionId}
                        isRefreshingAcademicData={isRefreshingInstitutionAcademicData}
                        onCreateStudent={crearAlumno}
                        onDeleteStudent={borrarAlumno}
                        onBackToAdmin={() => setSelectedStudentCareer('')}
                        onRefreshAcademicData={refreshInstitutionAcademicData}
                        onResetAcademicRecords={resetearEstadoAcademicoAlumno}
                        onUpdateAcademicRecords={actualizarEstadosAcademicosAlumno}
                        onUpdateStudent={actualizarAlumno}
                        useRemoteWorkspace={useRemoteWorkspace}
                        workspaceKey={workspaceKey}
                      />
                    </>
                  ) : (
                    <>
                      <StudentAccessSection
                        alumnos={alumnos}
                        extraActions={(
                          <StudentRosterSection
                            academicData={{ planesEstudio }}
                            alumnos={alumnos}
                            canEditWorkspace={canEditWorkspace}
                            careerOptions={careerOptions}
                            createOnly
                            onCreateStudent={crearAlumno}
                          />
                        )}
                        isLoading={isProvisioningStudents}
                        lastResult={studentAccessResult}
                        onProvisionStudents={crearAccesosAlumnos}
                        useRemoteWorkspace={useRemoteWorkspace}
                      />
                      <StudentCareerDashboard
                        alumnos={alumnos}
                        onSelectCareer={setSelectedStudentCareer}
                        planesEstudio={planesEstudio}
                      />
                      <DeletedPersonRecordsSection
                        records={deletedPersonRecords.filter((record) => record.person_type === 'student')}
                        isLoading={isLoadingDeletedPersons}
                        onRefresh={cargarBajasPadron}
                        onRestore={restaurarPersonaDesdeBaja}
                        restoringId={restoringDeletedPersonId}
                        title="Alumnos eliminados"
                        description="Alumnos dados de baja del padron activo. Restaurar recupera los datos guardados antes de la eliminacion."
                      />
                      {!isRelationalWorkspaceSource && (
                        <StudentSubjectEnrollmentSection
                          activeInstitution={activeInstitution}
                          alumnos={alumnos}
                          canEditWorkspace={canEditWorkspace}
                          planesEstudio={planesEstudio}
                        />
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <UploadsSection
                    canEditWorkspace={canEditWorkspace}
                    canManageDataSource={isSuperAdmin}
                    isRelationalWorkspaceSource={isRelationalWorkspaceSource}
                    description="Subi o reemplaza la plantilla de docentes, titularidades, horarios y disponibilidad desde este modulo."
                    onUploadTeachers={onUploadTeachers}
                    scope="teachers"
                    title="Carga docente"
                    uploadedFiles={uploadedFiles}
                  />

                  <TeacherRosterSection
                    activeInstitution={activeInstitution}
                    cargaHorariaDocente={cargaHorariaDocente}
                    disponibilidadDocente={disponibilidadDocente}
                    docenteMateria={docenteMateria}
                    fechasBloqueadasDocente={fechasBloqueadasDocente}
                    horariosDocentes={horariosDocentes}
                    docentes={docentes}
                    planesEstudio={planesEstudio}
                    canEditWorkspace={canEditWorkspace}
                    careerOptions={careerOptions}
                    isProvisioningTeachers={isProvisioningTeachers}
                    onCreateAvailability={crearDisponibilidadDocente}
                    onCreateLoad={crearCargaHorariaDocente}
                    onCreateBlockedDate={crearFechaBloqueadaDocente}
                    onDeleteAvailability={borrarDisponibilidadDocente}
                    onDeleteLoad={borrarCargaHorariaDocente}
                    onDeleteBlockedDate={borrarFechaBloqueadaDocente}
                    onGenerateLoadsFromSchedules={generarCargaHorariaDesdeHorarios}
                    onCreateTeacher={crearDocente}
                    onDeleteTeacher={borrarDocente}
                    onProvisionTeachers={crearAccesosDocentes}
                    onUpdateAvailability={actualizarDisponibilidadDocente}
                    onUpdateLoad={actualizarCargaHorariaDocente}
                    onUpdateBlockedDate={actualizarFechaBloqueadaDocente}
                    onUpdateTeacher={actualizarDocente}
                    lastAccessResult={teacherAccessResult}
                    useRemoteWorkspace={useRemoteWorkspace}
                  />
                  <DeletedPersonRecordsSection
                    records={deletedPersonRecords.filter((record) => record.person_type === 'teacher')}
                    isLoading={isLoadingDeletedPersons}
                    onRefresh={cargarBajasPadron}
                    onRestore={restaurarPersonaDesdeBaja}
                    restoringId={restoringDeletedPersonId}
                    title="Docentes eliminados"
                    description="Docentes dados de baja del padron activo. Restaurar recupera el perfil docente guardado antes de la eliminacion."
                  />
                </>
              )}
            </>
          )}

          {hasOpenedExamEngineV21 ? (
            <div className={activeWorkspaceView === 'exam-engine-v21' ? '' : 'hidden'}>
              <ExamEngineV21FieldTestPage
                canPublishOfficialSchedule={canEditWorkspace}
                dataReady={examEngineDataReady}
                institutionId={activeInstitutionId}
                mode={isRelationalWorkspaceSource ? 'preview' : undefined}
                onGoToUploads={() => selectWorkspaceView('dashboard')}
                onExamEngineStateChange={persistirEstadoMotorMesas}
                onPublishOfficialSchedule={publicarCronogramaFinalDesdeMotor}
                onResetExamProcess={reiniciarProcesoMesasDesdeMotor}
                uploadedFiles={examEngineUploadedFiles}
                workspaceKey={workspaceKey}
                workspaceSnapshot={snapshotPayload}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default GeneradorCronograma
