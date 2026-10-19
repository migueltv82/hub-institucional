import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { syncRosterRecords } from './rosterRecords.js'
import { retryThrownWorkspaceBusy, retryWhenWorkspaceBusy, serializeWorkspaceWrite } from './workspaceWriteGuard.js'
import { invokeSourceFileStorage } from './sourceFileStorageGateway.js'
import { canonicalStorageUuid } from './sourceFileStoragePath.js'
import {
  fetchTeacherAcademicRecords,
  mergeTeacherAcademicRecordsIntoSnapshot,
  syncTeacherAcademicRecords,
} from './teacherAcademicRecords.js'
import { fetchSubjectTeacherAssignments } from './subjectTeacherAssignments.js'
import { syncLegacySubjectPrerequisites } from './legacySubjectPrerequisites.js'
import { syncLegacySubjectsCatalog } from './legacySubjectsCatalog.js'
import { syncLegacyExamSessions } from './legacyExamSessions.js'

const TABLE_NAME = 'workspace_snapshots'
const datasetKeys = ['masterWorkbook', 'docentesWorkbook', 'alumnosWorkbook', 'horarios', 'planes', 'correlatividades', 'alumnos', 'docentes', 'docenteMateria']
const LOCAL_SNAPSHOT_PREFIX = 'mesaflow.workspace'
const DEBUG_WORKSPACE_SNAPSHOT = import.meta.env.DEV
const inFlightWorkspaceSnapshotFetches = new Map()
const MAX_LOCAL_SNAPSHOT_BYTES = 4_000_000
const MAX_REMOTE_AUTOSAVE_SNAPSHOT_BYTES = MAX_LOCAL_SNAPSHOT_BYTES
const disabledLocalSnapshotWrites = new Set()

// Este snapshot agrupa todo el estado operativo que antes vivia solo en memoria del cliente.
const emptySnapshot = {
  horariosDocentes: [],
  docenteMateria: [],
  disponibilidadDocente: [],
  cargaHorariaDocente: [],
  fechasBloqueadasDocente: [],
  docentes: [],
  planesEstudio: [],
  correlatividades: [],
  alumnos: [],
  students: [],
  estadoAcademico: [],
  academicStatusRows: [],
  enrollments: [],
  inscripcionesAlumnos: [],
  courseClassmates: [],
  grades: [],
  examEnrollments: [],
  academicStatus: null,
  adminReviewDecisions: [],
  adminReviewDrafts: [],
  adminReviewPromotions: [],
  adminReviewApprovalRequests: [],
  adminReviewSecondApprovals: [],
  examEngineV21State: null,
  uploadedFiles: {
    masterWorkbook: null,
    docentesWorkbook: null,
    alumnosWorkbook: null,
    horarios: null,
    planes: null,
    correlatividades: null,
    alumnos: null,
    docentes: null,
    docenteMateria: null,
  },
  fechaInicio: '',
  fechaFin: '',
  examGenerationConfig: {
    examType: 'regular',
    regularCallRanges: {
      first: {
        start: '',
        end: '',
      },
      second: {
        start: '',
        end: '',
      },
    },
    generationScope: {
      careers: [],
      year: '',
      applyHalfPlusOneRule: true,
      allowSameDayRelatedSubjects: true,
      respectCorrelativities: true,
    },
    selectedSpecialSubjectKeys: [],
  },
  cronograma: [],
  requiereRegeneracion: false,
}

export function createEmptyWorkspaceSnapshot() {
  return structuredClone(emptySnapshot)
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }

  return ''
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeIdentity(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function getTeacherProfileId(row = {}) {
  return firstClean(
    row.id,
    row.record_id,
    row.docente_id,
    row.docenteId,
    row.teacher_record_id,
    row.teacherRecordId,
    row.teacher_id,
    row.teacherId,
    row.user_id,
    row.userId,
  )
}

function getTeacherProfileName(row = {}) {
  const apellidoNombre = [row.apellido, row.nombre].map(clean).filter(Boolean).join(' ')
  const nombreApellido = [row.nombre, row.apellido].map(clean).filter(Boolean).join(' ')

  return firstClean(
    row.full_name,
    row.fullName,
    row.display_name,
    row.displayName,
    row.teacher_display_name,
    row.teacher_name,
    row.docente,
    row.profesor,
    apellidoNombre,
    nombreApellido,
    row.nombre,
    row.name,
  )
}

function getTeacherDni(row = {}) {
  return firstClean(row.dni, row.documento, row.dni_docente, row.document_number)
}

function getTeacherEmail(row = {}) {
  return firstClean(row.email, row.mail, row.correo, row.login_email)
}

function addTeacherProfileIndexKey(index, key, profile) {
  const normalized = normalizeText(key)
  if (normalized && !index.has(normalized)) index.set(normalized, profile)
}

function buildTeacherProfileIndex(docentes = []) {
  const index = new Map()

  normalizeArray(docentes).forEach((teacher) => {
    if (!teacher || typeof teacher !== 'object') return

    const profile = {
      id: getTeacherProfileId(teacher),
      name: getTeacherProfileName(teacher),
      dni: getTeacherDni(teacher),
      email: getTeacherEmail(teacher),
    }

    ;[
      profile.id,
      profile.dni,
      profile.email,
      profile.name,
      teacher.teacher_id,
      teacher.teacherId,
      teacher.user_id,
      teacher.userId,
    ].forEach((key) => addTeacherProfileIndexKey(index, key, profile))
  })

  return index
}

function findTeacherProfileForAssignment(assignment = {}, teacherIndex = new Map()) {
  const keys = [
    assignment.teacher_record_id,
    assignment.teacherRecordId,
    assignment.docenteId,
    assignment.docente_id,
    assignment.teacher_id,
    assignment.teacherId,
    assignment.user_id,
    assignment.userId,
    assignment.dni_docente,
    assignment.dni,
    assignment.teacher_display_name,
    assignment.teacher_name,
    assignment.docente,
    assignment.profesor,
  ]

  for (const key of keys) {
    const profile = teacherIndex.get(normalizeText(key))
    if (profile) return profile
  }

  return null
}

function planSubjectCode(row = {}) {
  return firstClean(
    row.materia_codigo,
    row.materiaCodigo,
    row.subject_code,
    row.subjectCode,
    row.materia,
    row.codigo,
    row.code,
    row.subject_id,
    row.subjectId,
    row.materia_id,
    row.materiaId,
    row.id,
  )
}

function planSubjectName(row = {}) {
  return firstClean(
    row.materia_nombre,
    row.materiaNombre,
    row.nombreMateria,
    row.subject_name,
    row.subjectName,
    row.nombre,
    row.name,
    row.asignatura,
    planSubjectCode(row),
  )
}

function planCareerName(row = {}) {
  return firstClean(
    row.carrera,
    row.carrera_nombre,
    row.nombreCarrera,
    row.career_name,
    row.careerName,
    row.program_name,
    row.programName,
    row.programa,
  )
}

function planCareerAliases(row = {}) {
  return [
    planCareerName(row),
    row.carrera_id,
    row.carreraId,
    row.program_id,
    row.programId,
    row.plan_id,
    row.planId,
  ].map(normalizeIdentity).filter(Boolean)
}

function planSubjectAliases(row = {}) {
  return [
    planSubjectCode(row),
    planSubjectName(row),
    row.materia_id,
    row.materiaId,
    row.subject_id,
    row.subjectId,
    row.id,
  ].map(normalizeIdentity).filter(Boolean)
}

function findPlanForSubjectAssignment(planesEstudio = [], assignment = {}) {
  const subjectKey = normalizeIdentity(firstClean(assignment.subject_id, assignment.subjectId, assignment.materia_codigo, assignment.materia))
  const programKey = normalizeIdentity(firstClean(assignment.program_id, assignment.programId, assignment.carrera, assignment.carrera_id))
  if (!subjectKey) return null

  const subjectMatches = normalizeArray(planesEstudio).filter((plan) => planSubjectAliases(plan).includes(subjectKey))
  const exact = subjectMatches.find((plan) => (
    !programKey || planCareerAliases(plan).includes(programKey)
  ))

  return exact ?? (subjectMatches.length === 1 ? subjectMatches[0] : null)
}

function normalizeAssignmentRole(value) {
  const normalized = clean(value).toLowerCase()
  return normalized || 'titular'
}

function mapSubjectTeacherAssignmentToSnapshotRow({
  assignment,
  planesEstudio = [],
  teacherIndex = new Map(),
}) {
  if (!assignment || typeof assignment !== 'object') return null

  const plan = findPlanForSubjectAssignment(planesEstudio, assignment)
  const teacher = findTeacherProfileForAssignment(assignment, teacherIndex)
  const teacherRecordId = firstClean(
    assignment.teacher_record_id,
    assignment.teacherRecordId,
    assignment.docenteId,
    assignment.docente_id,
    teacher?.id,
  )
  const teacherId = firstClean(assignment.teacher_id, assignment.teacherId, assignment.user_id, assignment.userId)
  const teacherName = firstClean(
    assignment.teacher_display_name,
    assignment.teacher_name,
    assignment.docente,
    assignment.profesor,
    teacher?.name,
  )
  const teacherDni = firstClean(assignment.dni_docente, assignment.dni, teacher?.dni)
  const subjectId = firstClean(assignment.subject_id, assignment.subjectId, assignment.materia_codigo, assignment.materia)
  const subjectCode = firstClean(planSubjectCode(plan ?? {}), subjectId)
  const subjectName = firstClean(
    planSubjectName(plan ?? {}),
    assignment.subject_name,
    assignment.subjectName,
    assignment.materia_nombre,
    assignment.nombreMateria,
    subjectCode,
  )
  const careerName = firstClean(planCareerName(plan ?? {}), assignment.program_id, assignment.programId, assignment.carrera)
  const role = normalizeAssignmentRole(firstClean(assignment.role, assignment.rol, assignment.rol_en_materia))

  if (!subjectCode || (!teacherRecordId && !teacherId && !teacherName && !teacherDni)) return null

  return {
    id: `subject-assignment:${firstClean(assignment.id, teacherRecordId, teacherId, subjectCode)}`,
    assignment_id: clean(assignment.id),
    teacher_id: teacherId,
    teacher_record_id: teacherRecordId,
    docenteId: teacherRecordId || teacherId,
    docente_id: teacherRecordId || teacherId,
    docente: teacherName,
    profesor: teacherName,
    full_name: teacherName,
    dni_docente: teacherDni,
    dni: teacherDni,
    carrera: careerName,
    program_id: firstClean(assignment.program_id, assignment.programId, careerName),
    plan: firstClean(assignment.plan_id, assignment.planId, plan?.plan_id, plan?.planId),
    plan_id: firstClean(assignment.plan_id, assignment.planId, plan?.plan_id, plan?.planId),
    materia_codigo: subjectCode,
    materia: subjectCode,
    subject_id: subjectId || subjectCode,
    materia_nombre: subjectName,
    nombreMateria: subjectName,
    rol: role,
    rol_en_materia: role,
    titularidad: role,
    estado: 'ACTIVE',
    estado_asignacion: 'ACTIVE',
    source: 'subject_teacher_assignments',
  }
}

function docenteMateriaMergeKey(row = {}) {
  const teacherKey = firstClean(
    row.teacher_record_id,
    row.teacherRecordId,
    row.docenteId,
    row.docente_id,
    row.teacher_id,
    row.teacherId,
    row.dni_docente,
    row.dni,
    row.docente,
    row.profesor,
    row.full_name,
  )
  const subjectKey = firstClean(row.materia_codigo, row.materiaCodigo, row.subject_id, row.subjectId, row.materia, row.codigo)
  const careerKey = firstClean(row.carrera, row.carrera_nombre, row.program_id, row.programId, row.carrera_id, row.carreraId)

  return [
    normalizeIdentity(teacherKey),
    normalizeIdentity(subjectKey),
    normalizeIdentity(careerKey),
  ].join('::')
}

export function mergeSubjectTeacherAssignmentsIntoSnapshot(snapshot, assignments = []) {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot)
  const teacherIndex = buildTeacherProfileIndex(normalizedSnapshot.docentes)
  const assignmentRows = normalizeArray(assignments)
    .map((assignment) => mapSubjectTeacherAssignmentToSnapshotRow({
      assignment,
      planesEstudio: normalizedSnapshot.planesEstudio,
      teacherIndex,
    }))
    .filter(Boolean)

  if (assignmentRows.length === 0) return normalizedSnapshot

  const mergedRows = new Map()
  ;[...normalizedSnapshot.docenteMateria, ...assignmentRows].forEach((row, index) => {
    const key = docenteMateriaMergeKey(row) || `row:${index}`
    if (!mergedRows.has(key) || row.source === 'subject_teacher_assignments') {
      mergedRows.set(key, row)
    }
  })

  return normalizeWorkspaceSnapshot({
    ...normalizedSnapshot,
    docenteMateria: Array.from(mergedRows.values()),
  })
}

async function mergeRemoteSubjectTeacherAssignments({
  snapshot,
  institutionId,
  workspaceKey,
  useRemote,
}) {
  try {
    const subjectTeacherAssignments = await fetchSubjectTeacherAssignments({
      institutionId,
      workspaceKey,
    })
    return mergeSubjectTeacherAssignmentsIntoSnapshot(snapshot, subjectTeacherAssignments)
  } catch (error) {
    logWorkspaceSnapshotDiagnostic('warn', 'fetch:subject-teacher-assignments-error', {
      destination: 'subject_teacher_assignments',
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
    return snapshot
  }
}

function getSnapshotCounts(payload) {
  return {
    alumnos: normalizeArray(payload?.alumnos).length,
    docentes: normalizeArray(payload?.docentes).length,
    docenteMateria: normalizeArray(payload?.docenteMateria).length,
    disponibilidadDocente: normalizeArray(payload?.disponibilidadDocente).length,
    cargaHorariaDocente: normalizeArray(payload?.cargaHorariaDocente).length,
    fechasBloqueadasDocente: normalizeArray(payload?.fechasBloqueadasDocente).length,
    horariosDocentes: normalizeArray(payload?.horariosDocentes).length,
    planesEstudio: normalizeArray(payload?.planesEstudio).length,
    correlatividades: normalizeArray(payload?.correlatividades).length,
    cronograma: normalizeArray(payload?.cronograma).length,
  }
}

function logWorkspaceSnapshotDiagnostic(level, event, details = {}) {
  if (!DEBUG_WORKSPACE_SNAPSHOT) return

  const logger = level === 'warn' ? console.warn : console.info
  logger(`[workspace-snapshot] ${event}`, details)
}

function normalizeUploadedFiles(uploadedFiles) {
  return datasetKeys.reduce((acc, key) => {
    acc[key] = uploadedFiles?.[key] ?? null
    return acc
  }, {})
}

function normalizeDateString(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeRegularCallRanges(ranges) {
  return {
    first: {
      start: normalizeDateString(ranges?.first?.start),
      end: normalizeDateString(ranges?.first?.end),
    },
    second: {
      start: normalizeDateString(ranges?.second?.start),
      end: normalizeDateString(ranges?.second?.end),
    },
  }
}

function normalizeExamGenerationConfig(config) {
  const examType = config?.examType === 'special' ? 'special' : 'regular'
  return {
    examType,
    generationScope: {
      careers: Array.isArray(config?.generationScope?.careers)
        ? config.generationScope.careers.filter((career) => typeof career === 'string')
        : (typeof config?.generationScope?.career === 'string' && config.generationScope.career ? [config.generationScope.career] : []),
      year: typeof config?.generationScope?.year === 'string' ? config.generationScope.year : '',
      applyHalfPlusOneRule: normalizeBoolean(config?.generationScope?.applyHalfPlusOneRule, true),
      allowSameDayRelatedSubjects: normalizeBoolean(config?.generationScope?.allowSameDayRelatedSubjects, true),
      respectCorrelativities: normalizeBoolean(config?.generationScope?.respectCorrelativities, true),
    },
    regularCallRanges: normalizeRegularCallRanges(config?.regularCallRanges),
    selectedSpecialSubjectKeys: normalizeArray(config?.selectedSpecialSubjectKeys),
  }
}

function canUseRemoteWorkspace({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

function workspaceSnapshotFetchKey({
  institutionId,
  workspaceKey,
  useRemote,
  preferLocalWhenNewer,
}) {
  return [
    clean(institutionId),
    clean(workspaceKey) || 'main',
    useRemote ? 'remote' : 'local',
    preferLocalWhenNewer ? 'prefer-local' : 'prefer-remote',
  ].join('::')
}

function clearInFlightWorkspaceSnapshotFetches({ institutionId, workspaceKey }) {
  const institutionKey = clean(institutionId)
  const workspace = clean(workspaceKey) || 'main'

  for (const key of inFlightWorkspaceSnapshotFetches.keys()) {
    if (key.startsWith(`${institutionKey}::${workspace}::`)) {
      inFlightWorkspaceSnapshotFetches.delete(key)
    }
  }
}

function assertRemoteWorkspaceContext({ institutionId, useRemote }) {
  if (!useRemote) return

  if (!institutionId) {
    throw new Error('No hay una institucion activa. Selecciona una institucion antes de sincronizar el workspace.')
  }

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase no esta configurado. No se puede sincronizar el workspace remoto.')
  }
}

function getLocalSnapshotStorageKey({ institutionId, workspaceKey }) {
  return `${LOCAL_SNAPSHOT_PREFIX}:${institutionId ?? 'demo'}:${workspaceKey}`
}

function isLocalStorageQuotaError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return error?.name === 'QuotaExceededError' ||
    error?.code === 22 ||
    error?.code === 1014 ||
    message.includes('quota') ||
    message.includes('exceeded the quota')
}

function readLocalSnapshot(params) {
  const storageKey = getLocalSnapshotStorageKey(params)

  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      logWorkspaceSnapshotDiagnostic('info', 'fetch:local-empty', {
        destination: 'localStorage',
        storageKey,
        source: 'local',
      })

      return {
        snapshot: createEmptyWorkspaceSnapshot(),
        updatedAt: null,
        source: 'local',
      }
    }

    const parsed = JSON.parse(raw)
    const snapshot = normalizeWorkspaceSnapshot(parsed.payload)
    logWorkspaceSnapshotDiagnostic('info', 'fetch:local-ok', {
      counts: getSnapshotCounts(snapshot),
      destination: 'localStorage',
      storageKey,
      source: 'local',
      updatedAt: parsed.updatedAt ?? null,
    })

    return {
      snapshot,
      updatedAt: parsed.updatedAt ?? null,
      source: 'local',
    }
  } catch (error) {
    logWorkspaceSnapshotDiagnostic('warn', 'fetch:local-error', {
      destination: 'localStorage',
      storageKey,
      source: 'local',
      errorMessage: error.message,
    })

    return {
      snapshot: createEmptyWorkspaceSnapshot(),
      updatedAt: null,
      source: 'local',
    }
  }
}

function writeLocalSnapshot(params, payload, explicitUpdatedAt = null) {
  const updatedAt = explicitUpdatedAt ?? new Date().toISOString()
  const storageKey = getLocalSnapshotStorageKey(params)
  const normalizedPayload = normalizeWorkspaceSnapshot(payload)

  if (disabledLocalSnapshotWrites.has(storageKey)) {
    logWorkspaceSnapshotDiagnostic('info', 'save:local-skipped-quota', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: 'localStorage',
      storageKey,
      source: 'local',
      updatedAt,
    })
    return {
      updatedAt,
      source: 'local',
      skippedLocalWrite: true,
      serializedSize: null,
    }
  }

  const serializedSnapshot = JSON.stringify({
    payload: normalizedPayload,
    updatedAt,
  })

  if (serializedSnapshot.length > MAX_LOCAL_SNAPSHOT_BYTES) {
    disabledLocalSnapshotWrites.add(storageKey)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // La limpieza del cache local es best-effort.
    }
    logWorkspaceSnapshotDiagnostic('warn', 'save:local-skipped-too-large', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: 'localStorage',
      size: serializedSnapshot.length,
      storageKey,
      source: 'local',
      updatedAt,
    })
    return {
      updatedAt,
      source: 'local',
      skippedLocalWrite: true,
      serializedSize: serializedSnapshot.length,
    }
  }

  try {
    localStorage.setItem(storageKey, serializedSnapshot)
    logWorkspaceSnapshotDiagnostic('info', 'save:local-ok', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: 'localStorage',
      storageKey,
      source: 'local',
      updatedAt,
    })
  } catch (error) {
    if (isLocalStorageQuotaError(error)) {
      disabledLocalSnapshotWrites.add(storageKey)
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // La limpieza del cache local es best-effort.
      }
    }

    logWorkspaceSnapshotDiagnostic('warn', 'save:local-error', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: 'localStorage',
      storageKey,
      source: 'local',
      errorMessage: error.message,
    })
    // Si falla localStorage igual devolvemos el flujo como local.
  }

  return {
    updatedAt,
    source: 'local',
    serializedSize: serializedSnapshot.length,
  }
}

export function normalizeWorkspaceSnapshot(payload) {
  if (!payload || typeof payload !== 'object') {
    return createEmptyWorkspaceSnapshot()
  }

  return {
    horariosDocentes: normalizeArray(payload.horariosDocentes),
    docenteMateria: normalizeArray(payload.docenteMateria),
    disponibilidadDocente: normalizeArray(payload.disponibilidadDocente),
    cargaHorariaDocente: normalizeArray(payload.cargaHorariaDocente),
    fechasBloqueadasDocente: normalizeArray(payload.fechasBloqueadasDocente),
    docentes: normalizeArray(payload.docentes),
    planesEstudio: normalizeArray(payload.planesEstudio),
    correlatividades: normalizeArray(payload.correlatividades),
    alumnos: normalizeArray(payload.alumnos),
    students: normalizeArray(payload.students),
    estadoAcademico: normalizeArray(payload.estadoAcademico),
    academicStatusRows: normalizeArray(payload.academicStatusRows),
    enrollments: normalizeArray(payload.enrollments),
    inscripcionesAlumnos: normalizeArray(payload.inscripcionesAlumnos),
    courseClassmates: normalizeArray(payload.courseClassmates),
    grades: normalizeArray(payload.grades),
    examEnrollments: normalizeArray(payload.examEnrollments),
    academicStatus: payload.academicStatus && typeof payload.academicStatus === 'object'
      ? payload.academicStatus
      : null,
    adminReviewDecisions: normalizeArray(payload.adminReviewDecisions),
    adminReviewDrafts: normalizeArray(payload.adminReviewDrafts),
    adminReviewPromotions: normalizeArray(payload.adminReviewPromotions),
    adminReviewApprovalRequests: normalizeArray(payload.adminReviewApprovalRequests),
    adminReviewSecondApprovals: normalizeArray(payload.adminReviewSecondApprovals),
    examEngineV21State: payload.examEngineV21State && typeof payload.examEngineV21State === 'object'
      ? payload.examEngineV21State
      : null,
    uploadedFiles: normalizeUploadedFiles(payload.uploadedFiles),
    fechaInicio: typeof payload.fechaInicio === 'string' ? payload.fechaInicio : '',
    fechaFin: typeof payload.fechaFin === 'string' ? payload.fechaFin : '',
    examGenerationConfig: normalizeExamGenerationConfig(payload.examGenerationConfig),
    cronograma: normalizeArray(payload.cronograma),
    requiereRegeneracion: Boolean(payload.requiereRegeneracion),
  }
}

async function fetchWorkspaceSnapshotUncached({ institutionId, workspaceKey, useRemote, preferLocalWhenNewer = true }) {
  if (!canUseRemoteWorkspace({ institutionId, useRemote })) {
    try {
      assertRemoteWorkspaceContext({ institutionId, useRemote })
    } catch (error) {
      logWorkspaceSnapshotDiagnostic('warn', 'fetch:context-error', {
        destination: TABLE_NAME,
        hasInstitutionId: Boolean(institutionId),
        useRemote,
        workspaceKey,
        errorMessage: error.message,
      })
      throw error
    }

    return readLocalSnapshot({ institutionId, workspaceKey })
  }

  const localSnapshot = readLocalSnapshot({ institutionId, workspaceKey })
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('payload, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (error) {
    logWorkspaceSnapshotDiagnostic('warn', 'fetch:supabase-error', {
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
    throw error
  }

  const remoteUpdatedAt = data?.updated_at ?? null
  const localIsNewer = Boolean(
    preferLocalWhenNewer &&
    localSnapshot.updatedAt &&
    (!remoteUpdatedAt || new Date(localSnapshot.updatedAt).getTime() > new Date(remoteUpdatedAt).getTime()),
  )
  if (localIsNewer) {
    logWorkspaceSnapshotDiagnostic('info', 'fetch:local-newer-than-supabase', {
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      localUpdatedAt: localSnapshot.updatedAt,
      remoteUpdatedAt,
      workspaceKey,
    })
    const snapshotWithAssignments = await mergeRemoteSubjectTeacherAssignments({
      snapshot: localSnapshot.snapshot,
      institutionId,
      workspaceKey,
      useRemote,
    })

    return {
      ...localSnapshot,
      snapshot: snapshotWithAssignments,
    }
  }

  const snapshot = normalizeWorkspaceSnapshot(data?.payload)
  let mergedSnapshot = snapshot

  const [academicRecordsResult, subjectAssignmentsResult] = await Promise.allSettled([
    fetchTeacherAcademicRecords({
      institutionId,
      workspaceKey,
      useRemote,
    }),
    fetchSubjectTeacherAssignments({
      institutionId,
      workspaceKey,
    }),
  ])

  if (academicRecordsResult.status === 'fulfilled') {
    mergedSnapshot = normalizeWorkspaceSnapshot(mergeTeacherAcademicRecordsIntoSnapshot(snapshot, academicRecordsResult.value))
  } else {
    const error = academicRecordsResult.reason
    logWorkspaceSnapshotDiagnostic('warn', 'fetch:teacher-academic-records-error', {
      destination: 'teacher_availability_records/teacher_workload_records',
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
    mergedSnapshot = snapshot
  }

  if (subjectAssignmentsResult.status === 'fulfilled') {
    mergedSnapshot = mergeSubjectTeacherAssignmentsIntoSnapshot(mergedSnapshot, subjectAssignmentsResult.value)
  } else {
    const error = subjectAssignmentsResult.reason
    logWorkspaceSnapshotDiagnostic('warn', 'fetch:subject-teacher-assignments-error', {
      destination: 'subject_teacher_assignments',
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
  }

  logWorkspaceSnapshotDiagnostic('info', 'fetch:supabase-ok', {
    counts: getSnapshotCounts(mergedSnapshot),
    destination: TABLE_NAME,
    hasInstitutionId: Boolean(institutionId),
    hasRow: Boolean(data),
    source: 'supabase',
    updatedAt: remoteUpdatedAt,
    useRemote,
    workspaceKey,
  })

  writeLocalSnapshot({ institutionId, workspaceKey }, mergedSnapshot, remoteUpdatedAt)

  return {
    snapshot: mergedSnapshot,
    updatedAt: remoteUpdatedAt,
    source: 'supabase',
  }
}

export async function fetchWorkspaceSnapshot({ institutionId, workspaceKey, useRemote, preferLocalWhenNewer = true }) {
  const key = workspaceSnapshotFetchKey({
    institutionId,
    workspaceKey,
    useRemote,
    preferLocalWhenNewer,
  })
  const inFlight = inFlightWorkspaceSnapshotFetches.get(key)
  if (inFlight) return inFlight

  const fetchPromise = fetchWorkspaceSnapshotUncached({
    institutionId,
    workspaceKey,
    useRemote,
    preferLocalWhenNewer,
  }).finally(() => {
    inFlightWorkspaceSnapshotFetches.delete(key)
  })
  inFlightWorkspaceSnapshotFetches.set(key, fetchPromise)
  return fetchPromise
}

export { isWorkspaceBusyError, retryWhenWorkspaceBusy, WORKSPACE_BUSY_MESSAGE } from './workspaceWriteGuard.js'

export function saveWorkspaceSnapshot(options = {}) {
  return serializeWorkspaceWrite(options, () => saveWorkspaceSnapshotNow(options))
}

async function saveWorkspaceSnapshotNow({
  institutionId,
  workspaceKey,
  ownerEmail,
  ownerUserId,
  payload,
  useRemote,
  syncOperational = true,
  allowLargeRemotePayload = true,
}) {
  clearInFlightWorkspaceSnapshotFetches({ institutionId, workspaceKey })

  if (!canUseRemoteWorkspace({ institutionId, useRemote })) {
    try {
      assertRemoteWorkspaceContext({ institutionId, useRemote })
    } catch (error) {
      logWorkspaceSnapshotDiagnostic('warn', 'save:context-error', {
        counts: getSnapshotCounts(payload),
        destination: TABLE_NAME,
        hasInstitutionId: Boolean(institutionId),
        useRemote,
        workspaceKey,
        errorMessage: error.message,
      })
      throw error
    }

    return writeLocalSnapshot({ institutionId, workspaceKey }, payload)
  }

  const normalizedPayload = normalizeWorkspaceSnapshot(payload)
  const updatedAt = new Date().toISOString()
  const storageKey = getLocalSnapshotStorageKey({ institutionId, workspaceKey })
  const localWritesWereDisabled = disabledLocalSnapshotWrites.has(storageKey)

  // El respaldo local es sincrono y ocurre antes de esperar la red. Si la vista
  // se desmonta o se recarga, la siguiente hidratacion conserva este estado.
  const localSaveResult = writeLocalSnapshot({ institutionId, workspaceKey }, normalizedPayload, updatedAt)

  const shouldSkipLargeRemoteAutosave = !allowLargeRemotePayload && (
    localWritesWereDisabled ||
    Number(localSaveResult.serializedSize) > MAX_REMOTE_AUTOSAVE_SNAPSHOT_BYTES
  )

  if (shouldSkipLargeRemoteAutosave) {
    logWorkspaceSnapshotDiagnostic('warn', 'save:supabase-skipped-too-large-autosave', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      serializedSize: localSaveResult.serializedSize,
      source: 'local',
      useRemote,
      workspaceKey,
    })

    return {
      updatedAt,
      source: 'local',
      skippedRemoteWrite: true,
    }
  }

  // Se usa upsert para que el mismo workspace se actualice sin requerir un create inicial.
  const { error } = await retryWhenWorkspaceBusy(() => supabase.from(TABLE_NAME).upsert({
    institution_id: institutionId,
    workspace_key: workspaceKey,
    owner_user_id: ownerUserId ?? null,
    owner_email: ownerEmail,
    payload: normalizedPayload,
    updated_at: updatedAt,
  }))

  if (error) {
    logWorkspaceSnapshotDiagnostic('warn', 'save:supabase-error', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
    throw error
  }

  if (!syncOperational) {
    logWorkspaceSnapshotDiagnostic('info', 'save:supabase-ok-skip-operational-sync', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      updatedAt,
      useRemote,
      workspaceKey,
    })

    return {
      updatedAt,
      source: 'supabase',
    }
  }

  try {
    await retryThrownWorkspaceBusy(() => syncRosterRecords({
      institutionId,
      workspaceKey,
      snapshot: normalizedPayload,
      useRemote,
    }))
  } catch (error) {
    logWorkspaceSnapshotDiagnostic('warn', 'roster-sync:error', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: 'student_records/teacher_records',
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
    throw error
  }

  try {
    await retryThrownWorkspaceBusy(() => syncTeacherAcademicRecords({
      institutionId,
      workspaceKey,
      snapshot: normalizedPayload,
      useRemote,
    }))
  } catch (error) {
    logWorkspaceSnapshotDiagnostic('warn', 'teacher-academic-sync:error', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: 'teacher_availability_records/teacher_workload_records',
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
    throw error
  }

  try {
    // En serie: en paralelo chocaban entre si contra el lock del workspace.
    const legacyContext = { institutionId, workspaceKey, snapshot: normalizedPayload, useRemote }
    await retryThrownWorkspaceBusy(() => syncLegacySubjectsCatalog(legacyContext))
    await retryThrownWorkspaceBusy(() => syncLegacySubjectPrerequisites(legacyContext))
    await retryThrownWorkspaceBusy(() => syncLegacyExamSessions(legacyContext))
  } catch (error) {
    logWorkspaceSnapshotDiagnostic('warn', 'legacy-prerequisites-sync:error', {
      counts: getSnapshotCounts(normalizedPayload),
      destination: 'legacy_subjects_catalog/legacy_subject_prerequisites/legacy_exam_sessions',
      hasInstitutionId: Boolean(institutionId),
      source: 'supabase',
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
    throw error
  }

  logWorkspaceSnapshotDiagnostic('info', 'save:supabase-ok', {
    counts: getSnapshotCounts(normalizedPayload),
    destination: TABLE_NAME,
    hasInstitutionId: Boolean(institutionId),
    source: 'supabase',
    updatedAt,
    useRemote,
    workspaceKey,
  })

  return {
    updatedAt,
    source: 'supabase',
  }
}

export async function clearWorkspaceData({ institutionId, workspaceKey, useRemote, operationId, resumeStorageClear = false }) {
  const emptyPayload = createEmptyWorkspaceSnapshot()
  if (!canUseRemoteWorkspace({ institutionId, useRemote })) {
    assertRemoteWorkspaceContext({ institutionId, useRemote })
    return { ...writeLocalSnapshot({ institutionId, workspaceKey }, emptyPayload), cleanup: [], snapshot: emptyPayload }
  }
  canonicalStorageUuid(operationId)
  const result = await invokeSourceFileStorage({ action: resumeStorageClear ? 'resume_clear' : 'begin_clear', institution_id: institutionId, workspace_key: workspaceKey, operation_id: operationId })
  if (result.clear_id !== operationId) throw new Error('Respuesta de limpieza no autorizada.')
  if (result.success !== true) throw new Error('No se pudo completar la limpieza del workspace.')
  clearInFlightWorkspaceSnapshotFetches({ institutionId, workspaceKey })
  // No client snapshot save, table delete or local empty write after the barrier.
  // The caller must reload current state: newer mutations may already exist.
  const current = await fetchWorkspaceSnapshot({ institutionId, workspaceKey, useRemote, preferLocalWhenNewer: false })
  return {
    ...current, reloadRequired: true,
    clearId: result.clear_id, cutoffRevision: result.cutoff_revision,
    cleanup: [{ tableName: 'workspace_source_files', target: 'storage', skipped: false, removed: result.removed || 0, warnings: [] }],
  }
}
