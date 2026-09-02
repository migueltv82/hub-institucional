import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useShallow } from 'zustand/react/shallow'
import { useStudentStore } from '../../stores/studentStore'
import PrerequisiteAlert from './PrerequisiteAlert'
import { getPrerequisiteCheck } from '../../lib/prerequisites.js'
import { getYearCompletionGateCheck } from '../../lib/yearCompletionGate.js'

function getSubjectId(subject) {
  const item = subject?.subject || subject
  return item?.canonical_subject_id || item?.subject_id || item?.code || item?.id || ''
}

function getSubjectName(subject) {
  return subject?.name || subject?.subject?.name || 'Materia'
}

function getProgramId(program, fallback) {
  return fallback || (typeof program === 'string' ? program : program?.canonical_program_id || program?.program_id || program?.id || program?.name) || ''
}

function getStudentId(student, fallback) {
  return fallback || (typeof student === 'string' ? student : student?.id || student?.profile_id || student?.user_id) || ''
}

function getInstitutionId(institution, student, fallback) {
  return fallback || institution?.id || student?.institution_id || ''
}

function getEnrollmentSubjectId(enrollment) {
  return enrollment?.canonical_subject_id || enrollment?.subject_id || enrollment?.subject?.canonical_subject_id || enrollment?.subject?.subject_id || enrollment?.subject?.code || enrollment?.subject?.id || ''
}

function getEnrollmentStatus(enrollment) {
  return String(enrollment?.status || '').toLowerCase()
}

function buildLocalEnrollment({ subject, subjectId, programId, studentId, studentRecordId, institutionId }) {
  const now = new Date().toISOString()

  return {
    id: `local-${subjectId}-${Date.now()}`,
    profile_id: studentId,
    student_id: studentId,
    student_record_id: studentRecordId || null,
    subject_id: subjectId,
    canonical_subject_id: subjectId,
    portal_subject_id: subject?.portal_subject_id || subject?.id || '',
    program_id: programId,
    canonical_program_id: programId,
    institution_id: institutionId,
    status: 'active',
    enrolled_at: now,
    created_at: now,
    updated_at: now,
    subject
  }
}

export function YearCompletionGateAlert({ check, compact = false, className = '' }) {
  if (!check?.applies || check.canEnroll) return null

  const missingNames = check.missing
    .map((item) => item.name || item.code || item.subject_id || item.canonical_subject_id)
    .filter(Boolean)

  return (
    <div className={`rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 ${className}`}>
      <div className="font-semibold">Anios previos pendientes</div>
      {!compact && (
        <p className="mt-1 text-amber-800">
          Para cursar esta materia primero deben figurar aprobadas las materias requeridas de anios anteriores.
        </p>
      )}
      {missingNames.length > 0 && (
        <p className="mt-2 text-amber-800">
          Faltan: {missingNames.join(', ')}.
        </p>
      )}
    </div>
  )
}

export default function SubjectEnrollmentForm({
  subject,
  subjectId: subjectIdProp,
  programId: programIdProp,
  studentId: studentIdProp,
  institutionId: institutionIdProp,
  onEnroll,
  onSuccess,
  onError,
  disabled = false,
  showPrerequisites = true,
  submitLabel = 'Inscribirme',
  className = ''
}) {
  const {
    currentStudent,
    currentProgram,
    currentInstitution,
    enrollments,
    prerequisites,
    grades,
    subjects,
    loading,
    addEnrollment,
    setError,
    setSuccess,
    clearError
  } = useStudentStore(useShallow(state => ({
    currentStudent: state.currentStudent,
    currentProgram: state.currentProgram,
    currentInstitution: state.currentInstitution,
    enrollments: state.enrollments,
    prerequisites: state.prerequisites,
    grades: state.grades,
    subjects: state.subjects,
    loading: state.loading,
    addEnrollment: state.addEnrollment,
    setError: state.setError,
    setSuccess: state.setSuccess,
    clearError: state.clearError
  })))

  const subjectId = subjectIdProp || getSubjectId(subject)
  const programId = getProgramId(currentProgram, programIdProp)
  const studentId = getStudentId(currentStudent, studentIdProp)
  const institutionId = getInstitutionId(currentInstitution, currentStudent, institutionIdProp)

  const prerequisiteCheck = useMemo(() => {
    return getPrerequisiteCheck({
      subjectId,
      subject,
      prerequisites,
      enrollments,
      grades,
      subjects
    })
  }, [subjectId, subject, prerequisites, enrollments, grades, subjects])

  const yearGateCheck = useMemo(() => {
    return getYearCompletionGateCheck({ subject, subjects, grades })
  }, [subject, subjects, grades])

  const existingEnrollment = useMemo(() => {
    return enrollments.find(enrollment => {
      const sameSubject = getEnrollmentSubjectId(enrollment) === subjectId
      const sameProgram = !programId || enrollment.program_id === programId
      const activeStatus = ['active', 'completed', 'approved', 'passed', 'enrolled'].includes(
        getEnrollmentStatus(enrollment)
      )

      return sameSubject && sameProgram && activeStatus
    })
  }, [enrollments, subjectId, programId])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm({
    defaultValues: {
      subject_id: subjectId,
      program_id: programId,
      acknowledge: false
    }
  })

  useEffect(() => {
    reset({
      subject_id: subjectId,
      program_id: programId,
      acknowledge: false
    })
  }, [subjectId, programId, reset])

  const isBlocked =
    disabled ||
    loading ||
    isSubmitting ||
    !subjectId ||
    !programId ||
    !studentId ||
    Boolean(existingEnrollment) ||
    !prerequisiteCheck.canEnroll ||
    !yearGateCheck.canEnroll

  const onSubmit = async formValues => {
    clearError?.()

    if (!subjectId || !programId || !studentId) {
      const message = 'Faltan datos para completar la inscripcion.'
      setError(message)
      onError?.(message)
      return
    }

    if (existingEnrollment) {
      const message = 'Ya existe una inscripcion activa para esta materia.'
      setError(message)
      onError?.(message)
      return
    }

    if (!prerequisiteCheck.canEnroll) {
      const missingNames = prerequisiteCheck.missing
        .map(item => item.subject?.name)
        .filter(Boolean)
        .join(', ')
      const message = `No cumple correlatividades${missingNames ? `: ${missingNames}` : '.'}`
      setError(message)
      onError?.(message)
      return
    }

    if (!yearGateCheck.canEnroll) {
      const missingNames = yearGateCheck.missing.map(item => item.name).filter(Boolean).join(', ')
      const message = `Para cursar este anio hace falta tener aprobadas todas las materias de anios previos.${missingNames ? ` Faltan: ${missingNames}.` : ''}`
      setError(message)
      onError?.(message)
      return
    }

    const payload = {
      profile_id: studentId,
      student_id: studentId,
      student_record_id: currentStudent?.record_id || currentStudent?.student_record_id || undefined,
      subject_id: subjectId,
      canonical_subject_id: subjectId,
      portal_subject_id: subject?.portal_subject_id || subject?.id || undefined,
      program_id: programId,
      canonical_program_id: programId,
      institution_id: institutionId || undefined,
      status: 'active'
    }

    try {
      const result = onEnroll
        ? await onEnroll(payload, { subject, formValues })
        : buildLocalEnrollment({ subject, subjectId, programId, studentId, studentRecordId: currentStudent?.record_id || currentStudent?.student_record_id, institutionId })

      if (result === false || result?.success === false || result?.error) {
        throw new Error(result?.error?.message || result?.error || 'No se pudo registrar la inscripcion.')
      }

      const enrollment =
        result && typeof result === 'object'
          ? result.data ||
            result.enrollment ||
            (result.id || result.subject_id
              ? result
              : buildLocalEnrollment({ subject, subjectId, programId, studentId, studentRecordId: currentStudent?.record_id || currentStudent?.student_record_id, institutionId }))
          : buildLocalEnrollment({ subject, subjectId, programId, studentId, studentRecordId: currentStudent?.record_id || currentStudent?.student_record_id, institutionId })

      if (enrollment && typeof enrollment === 'object' && !existingEnrollment) {
        addEnrollment({
          ...enrollment,
          subject: enrollment.subject || subject
        })
      }

      setSuccess(`Inscripcion a ${getSubjectName(subject)} registrada.`)
      reset({
        subject_id: subjectId,
        program_id: programId,
        acknowledge: false
      })
      onSuccess?.(enrollment)
    } catch (error) {
      const message = error?.message || 'No se pudo registrar la inscripcion.'
      setError(message)
      onError?.(message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={`space-y-3 ${className}`}>
      <input type="hidden" {...register('subject_id', { required: true })} />
      <input type="hidden" {...register('program_id', { required: true })} />

      {showPrerequisites && (
        <PrerequisiteAlert
          subject={subject}
          subjectId={subjectId}
          compact
          hideWhenClear={false}
        />
      )}

      <YearCompletionGateAlert check={yearGateCheck} compact={!showPrerequisites} />

      {!studentId && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No hay alumno seleccionado en el store.
        </div>
      )}

      {!programId && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No hay carrera seleccionada para esta inscripcion.
        </div>
      )}

      {existingEnrollment && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Ya esta inscripto en esta materia.
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          {...register('acknowledge', {
            required: 'Debe confirmar que reviso la informacion de la materia.'
          })}
        />
        <span>Confirmo que revise la materia, carrera y correlatividades.</span>
      </label>

      {errors.acknowledge && (
        <p className="text-sm text-red-600">{errors.acknowledge.message}</p>
      )}

      <button
        type="submit"
        disabled={isBlocked}
        className="inline-flex w-full items-center justify-center rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      >
        {isSubmitting ? 'Registrando...' : existingEnrollment ? 'Ya inscripto' : submitLabel}
      </button>
    </form>
  )
}

