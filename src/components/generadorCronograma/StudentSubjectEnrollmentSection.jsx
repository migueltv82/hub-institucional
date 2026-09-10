import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, Trash2 } from 'lucide-react'
import {
  createSubjectEnrollment,
  dropSubjectEnrollment,
  fetchSubjectEnrollments,
  resolveStudentProfile,
  resolveStudentRecordId,
} from '../../services/subjectEnrollments.js'

function clean(value) {
  return String(value ?? '').trim()
}

function getStudentFullName(student) {
  return clean(student?.full_name) || [clean(student?.nombre), clean(student?.apellido)].filter(Boolean).join(' ')
}

function getStudentEmail(student) {
  return clean(student?.email || student?.correo || student?.mail)
}

function buildPlanOptions(planesEstudio = []) {
  return planesEstudio
    .map((plan) => ({
      key: [
        clean(plan.carrera),
        clean(plan.materia || plan.codigo),
        clean(plan.nombreMateria || plan.nombre),
      ].join('::'),
      carrera: clean(plan.carrera),
      materia_codigo: clean(plan.materia || plan.codigo),
      materia_nombre: clean(plan.nombreMateria || plan.nombre || plan.materia || plan.codigo),
      label: [
        clean(plan.carrera),
        clean(plan.materia || plan.codigo),
        clean(plan.nombreMateria || plan.nombre),
      ].filter(Boolean).join(' / '),
    }))
    .filter((plan) => plan.label)
}

function createEmptyDraft() {
  return {
    materiaLabel: '',
    alumnoNombre: '',
  }
}

function StudentSubjectEnrollmentSection({
  activeInstitution,
  alumnos = [],
  canEditWorkspace = false,
  isRelationalWorkspaceSource = false,
  planesEstudio = [],
  workspaceKey = 'main',
}) {
  const queryClient = useQueryClient()
  const [enrollments, setEnrollments] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [draft, setDraft] = useState(createEmptyDraft())
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [studentLabels, setStudentLabels] = useState(new Map())

  const institutionId = activeInstitution?.id ?? null
  const planOptions = useMemo(() => buildPlanOptions(planesEstudio), [planesEstudio])
  const studentOptions = useMemo(() => {
    const names = new Set()
    alumnos.forEach((student) => {
      const name = getStudentFullName(student)
      if (name) names.add(name)
    })
    return Array.from(names).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
  }, [alumnos])

  useEffect(() => {
    let cancelled = false

    async function loadEnrollments() {
      if (isRelationalWorkspaceSource) {
        setEnrollments([])
        setError('')
        setIsLoading(false)
        return
      }

      if (!institutionId) {
        setEnrollments([])
        return
      }

      setIsLoading(true)
      try {
        const data = await fetchSubjectEnrollments({ institutionId, workspaceKey })
        if (!cancelled) setEnrollments(data)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadEnrollments()

    return () => {
      cancelled = true
    }
  }, [institutionId, isRelationalWorkspaceSource, workspaceKey])

  useEffect(() => {
    let cancelled = false

    async function resolveStudentLabels() {
      if (isRelationalWorkspaceSource) {
        setStudentLabels(new Map())
        return
      }

      if (!institutionId || alumnos.length === 0) return

      const entries = await Promise.all(alumnos.map(async (student) => {
        const email = getStudentEmail(student)
        if (!email) return null

        const resolved = await resolveStudentProfile({ institutionId, workspaceKey, email })
        if (!resolved.success) return null

        return [resolved.profile.user_id, getStudentFullName(student)]
      }))

      if (!cancelled) {
        setStudentLabels(new Map(entries.filter(Boolean)))
      }
    }

    resolveStudentLabels()

    return () => {
      cancelled = true
    }
  }, [institutionId, isRelationalWorkspaceSource, workspaceKey, alumnos])

  function updateDraft(field) {
    return (event) => {
      const value = event.target.value
      setDraft((current) => ({ ...current, [field]: value }))
    }
  }

  const selectedPlan = planOptions.find((option) => option.label.toLowerCase() === clean(draft.materiaLabel).toLowerCase())
  const canSubmit = Boolean(selectedPlan && clean(draft.alumnoNombre))

  async function submit() {
    setError('')

    if (isRelationalWorkspaceSource) {
      setError('Las inscripciones materia por materia todavia no estan conectadas al schema relacional nuevo.')
      return
    }

    if (!institutionId) {
      setError('No hay una institucion activa.')
      return
    }

    if (!selectedPlan) {
      setError('Selecciona una materia.')
      return
    }

    const matchedStudent = alumnos.find((student) => getStudentFullName(student).toLowerCase() === clean(draft.alumnoNombre).toLowerCase())

    if (!matchedStudent) {
      setError('Selecciona un alumno valido de la lista.')
      return
    }

    const studentEmail = getStudentEmail(matchedStudent)

    if (!studentEmail) {
      setError('El alumno seleccionado no tiene un email cargado en la planilla.')
      return
    }

    setIsSaving(true)
    try {
      const resolved = await resolveStudentProfile({ institutionId, workspaceKey, email: studentEmail })

      if (!resolved.success) {
        setError(resolved.error)
        return
      }

      const studentRecordId = await resolveStudentRecordId({
        institutionId,
        workspaceKey,
        email: studentEmail,
        career: selectedPlan.carrera,
      })

      const created = await createSubjectEnrollment({
        institutionId,
        workspaceKey,
        subjectId: selectedPlan.materia_codigo,
        programId: selectedPlan.carrera,
        studentId: resolved.profile.user_id,
        studentRecordId: studentRecordId ?? matchedStudent.record_id ?? matchedStudent.student_record_id ?? null,
      })

      if (!created.success) {
        setError(created.error)
        return
      }

      setEnrollments((current) => [created.data, ...current.filter((enrollment) => enrollment.id !== created.data.id)])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher-subject-rosters'] }),
        queryClient.invalidateQueries({ queryKey: ['subject-roster'] }),
        queryClient.invalidateQueries({ queryKey: ['student-portal'] }),
      ])
      setDraft(createEmptyDraft())
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDrop(id) {
    if (isRelationalWorkspaceSource) return
    if (!canEditWorkspace) return

    const result = await dropSubjectEnrollment(id)

    if (!result.success) {
      setError(result.error)
      return
    }

    setEnrollments((current) => current.filter((enrollment) => enrollment.id !== id))
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teacher-subject-rosters'] }),
      queryClient.invalidateQueries({ queryKey: ['subject-roster'] }),
      queryClient.invalidateQueries({ queryKey: ['student-portal'] }),
    ])
  }

  function findPlanBySubject(subjectId, programId) {
    return planOptions.find((option) => option.materia_codigo === subjectId && option.carrera === programId)
  }

  function findStudentLabel(studentId) {
    return studentLabels.get(studentId) || studentId
  }

  if (isRelationalWorkspaceSource) return null

  return (
    <section className="rise-in soft-card soft-card--tint-sky border-l-4 border-l-sky-500 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpenCheck className="h-4 w-4 text-sky-700" />
        <h4 className="font-extrabold text-slate-950">Inscripcion de alumnos a materias</h4>
      </div>
      <p className="text-sm leading-6 text-slate-600">
        Inscribi a cada alumno materia por materia. Es lo que habilita al docente titular a verlo en su roster para cargar asistencia y notas.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Materia</span>
            <input
              className="input-base mt-2"
              list="subject-enrollment-plan-options"
              value={draft.materiaLabel}
              onChange={updateDraft('materiaLabel')}
              placeholder="Buscar materia por nombre"
              disabled={isRelationalWorkspaceSource || !canEditWorkspace || planOptions.length === 0}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Alumno</span>
            <input
              className="input-base mt-2"
              list="subject-enrollment-student-options"
              value={draft.alumnoNombre}
              onChange={updateDraft('alumnoNombre')}
              disabled={isRelationalWorkspaceSource || !canEditWorkspace}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-amber-700">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-primary" onClick={submit} disabled={isRelationalWorkspaceSource || !canEditWorkspace || !canSubmit || isSaving}>
            {isSaving ? 'Guardando...' : 'Inscribir alumno'}
          </button>
        </div>
      </div>

      <datalist id="subject-enrollment-plan-options">
        {planOptions.map((plan) => <option key={plan.key} value={plan.label} />)}
      </datalist>

      <datalist id="subject-enrollment-student-options">
        {studentOptions.map((student) => <option key={student} value={student} />)}
      </datalist>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[860px] table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Materia</th>
              <th className="px-4 py-3">Carrera</th>
              <th className="px-4 py-3">Alumno</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {enrollments.map((enrollment) => {
              const plan = findPlanBySubject(enrollment.subject_id, enrollment.program_id)
              return (
                <tr key={enrollment.id}>
                  <td className="break-words px-4 py-3 font-semibold text-slate-950">{plan?.materia_nombre || enrollment.subject_id}</td>
                  <td className="break-words px-4 py-3 text-slate-700">{enrollment.program_id || '-'}</td>
                  <td className="break-words px-4 py-3 text-slate-700">{findStudentLabel(enrollment.student_id)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">{enrollment.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-2 text-red-700"
                        onClick={() => handleDrop(enrollment.id)}
                        disabled={isRelationalWorkspaceSource || !canEditWorkspace}
                        title="Dar de baja inscripcion"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!isLoading && enrollments.length === 0 && (
          <div className="p-6 text-sm text-slate-500">No hay inscripciones cargadas.</div>
        )}
        {isLoading && (
          <div className="p-6 text-sm text-slate-500">Cargando inscripciones...</div>
        )}
      </div>
    </section>
  )
}

export default StudentSubjectEnrollmentSection
