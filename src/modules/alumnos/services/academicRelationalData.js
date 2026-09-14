import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'
import {
  mapCanonicalExamEnrollment,
  mapCanonicalStudentGrade,
  mapCanonicalSubjectEnrollment,
} from '../../../services/academicCanonicalRows.js'

const DEFAULT_TRANSITION_CONFIG = {
  stage: 'snapshot_only',
  writeMode: 'snapshot_only',
  readMode: 'snapshot_only',
  dualWriteEnabled: false,
  hybridReadEnabled: false,
  relationalPrimaryEnabled: false,
  snapshotFallbackEnabled: true,
  snapshotWriteCompatEnabled: true,
  strictDriftBlockEnabled: false,
}

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeTransitionConfig(row) {
  if (!row || typeof row !== 'object') return DEFAULT_TRANSITION_CONFIG

  return {
    stage: clean(row.stage) || DEFAULT_TRANSITION_CONFIG.stage,
    writeMode: clean(row.write_mode) || DEFAULT_TRANSITION_CONFIG.writeMode,
    readMode: clean(row.read_mode) || DEFAULT_TRANSITION_CONFIG.readMode,
    dualWriteEnabled: Boolean(row.dual_write_enabled),
    hybridReadEnabled: Boolean(row.hybrid_read_enabled),
    relationalPrimaryEnabled: Boolean(row.relational_primary_enabled),
    snapshotFallbackEnabled: row.snapshot_fallback_enabled !== false,
    snapshotWriteCompatEnabled: row.snapshot_write_compat_enabled !== false,
    strictDriftBlockEnabled: Boolean(row.strict_drift_block_enabled),
  }
}

function canUseRemoteAcademicData({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

function isMissingRpcError(error, functionName) {
  const message = clean(error?.message).toLowerCase()
  return (
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    error?.code === 'PGRST204' ||
    message.includes(functionName.toLowerCase()) ||
    message.includes('could not find the function') ||
    message.includes('no se encontro la funcion')
  )
}

async function fetchStudentPortalGrades({ institutionId, workspaceKey, studentId }) {
  if (typeof supabase?.rpc === 'function') {
    const { data, error } = await supabase.rpc('academic_get_student_portal_grades', {
      p_institution_id: institutionId,
      p_workspace_key: workspaceKey,
    })

    if (!error) return { data, error: null }
    if (!isMissingRpcError(error, 'academic_get_student_portal_grades')) return { data: [], error }
  }

  return await supabase
    .from('student_grades')
    .select('id, institution_id, workspace_key, student_id, student_record_id, subject_enrollment_id, exam_enrollment_id, subject_id, program_id, grade_type, attempt_number, grade_value, grade_label, grade_scale, academic_status, observations, grading_period, legacy_snapshot_id, lock_version, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('student_id', studentId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
}

export function overlaySnapshotWithRelationalAcademicData({
  snapshot,
  relationalData,
  transitionConfig,
}) {
  const config = transitionConfig ?? DEFAULT_TRANSITION_CONFIG
  const fallbackEnabled = config.snapshotFallbackEnabled !== false
  const enrollments = asArray(relationalData?.enrollments)
  const examEnrollments = asArray(relationalData?.examEnrollments)
  const grades = asArray(relationalData?.grades)
  const enrollmentsLoaded = relationalData?.enrollmentsLoaded === true

  return {
    ...snapshot,
    // Las inscripciones administradas desde el panel son la fuente autoritativa.
    // Un arreglo vacio cargado correctamente significa "sin inscripciones" y
    // no debe hacer reaparecer filas antiguas del snapshot.
    enrollments: enrollmentsLoaded || enrollments.length > 0 || !fallbackEnabled
      ? enrollments
      : asArray(snapshot?.enrollments),
    examEnrollments: examEnrollments.length > 0 || !fallbackEnabled
      ? examEnrollments
      : asArray(snapshot?.examEnrollments),
    grades: grades.length > 0 || !fallbackEnabled
      ? grades
      : asArray(snapshot?.grades),
    academicRelationalSource: {
      stage: config.stage,
      readMode: config.readMode,
      usedRelational: enrollments.length > 0 || examEnrollments.length > 0 || grades.length > 0,
      fallbackEnabled,
      counts: {
        enrollments: enrollments.length,
        examEnrollments: examEnrollments.length,
        grades: grades.length,
      },
      enrollmentsLoaded,
    },
  }
}

export async function fetchAcademicTransitionConfig({ useRemote }) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    return DEFAULT_TRANSITION_CONFIG
  }

  const { data, error } = await supabase.rpc('get_academic_transition_config')

  if (error) {
    console.warn('No se pudo leer la configuracion de transicion academica. Se usara snapshot_only.', error)
    return DEFAULT_TRANSITION_CONFIG
  }

  const row = Array.isArray(data) ? data[0] : data
  return normalizeTransitionConfig(row)
}

export async function fetchAcademicRelationalSnapshotOverlay({
  institutionId,
  workspaceKey = 'main',
  user,
  useRemote,
}) {
  const transitionConfig = await fetchAcademicTransitionConfig({ useRemote })

  if (!canUseRemoteAcademicData({ institutionId, useRemote })) {
    return {
      transitionConfig,
      relationalData: {
        enrollments: [],
        enrollmentsLoaded: false,
        examEnrollments: [],
        grades: [],
      },
    }
  }

  const studentId = clean(user?.id)
  if (!studentId) {
    return {
      transitionConfig,
      relationalData: {
        enrollments: [],
        enrollmentsLoaded: false,
        examEnrollments: [],
        grades: [],
      },
    }
  }

  const readRelationalEnrollments = true
  const [
    { data: subjectRows, error: subjectError },
    { data: examRows, error: examError },
    { data: gradeRows, error: gradeError },
  ] = await Promise.all([
    readRelationalEnrollments
      ? supabase
          .from('subject_enrollments')
          .select('id, institution_id, workspace_key, student_id, student_record_id, subject_id, program_id, status, enrolled_at, dropped_at, legacy_snapshot_id, lock_version, created_at, updated_at')
          .eq('institution_id', institutionId)
          .eq('workspace_key', workspaceKey)
          .eq('student_id', studentId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    readRelationalEnrollments
      ? supabase
          .from('exam_enrollments')
          .select('id, institution_id, workspace_key, student_id, student_record_id, exam_table_id, subject_id, program_id, status, enrolled_at, cancelled_at, legacy_snapshot_id, lock_version, created_at, updated_at')
          .eq('institution_id', institutionId)
          .eq('workspace_key', workspaceKey)
          .eq('student_id', studentId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    // El libro docente escribe exclusivamente en student_grades mediante una
    // RPC segura. Por eso las calificaciones propias deben leerse siempre de
    // la fuente relacional, incluso mientras inscripciones y mesas continúan
    // en snapshot_only durante la transición.
    fetchStudentPortalGrades({ institutionId, workspaceKey, studentId }),
  ])

  if (subjectError || examError || gradeError) {
    console.warn('No se pudieron leer todas las tablas academicas relacionales. Se usara snapshot como fallback donde corresponda.', {
      subjectError,
      examError,
      gradeError,
    })
  }

  const enrollments = subjectError ? [] : asArray(subjectRows).map(mapCanonicalSubjectEnrollment)

  return {
    transitionConfig,
    relationalData: {
      enrollments,
      enrollmentsLoaded: readRelationalEnrollments && !subjectError,
      examEnrollments: examError ? [] : asArray(examRows).map(mapCanonicalExamEnrollment),
      grades: gradeError ? [] : asArray(gradeRows).map(mapCanonicalStudentGrade),
    },
  }
}

export { DEFAULT_TRANSITION_CONFIG }
