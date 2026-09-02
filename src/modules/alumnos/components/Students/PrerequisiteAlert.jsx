import { useMemo } from 'react'
import { Lock } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStudentStore } from '../../stores/studentStore'
import { getPrerequisiteCheck } from '../../lib/prerequisites.js'

function getSubjectId(subject) {
  return subject?.canonical_subject_id || subject?.subject_id || subject?.code || subject?.id || subject?.subject?.canonical_subject_id || subject?.subject?.subject_id || subject?.subject?.code || subject?.subject?.id || null
}

function getSubjectName(subject) {
  return (
    subject?.name ||
    subject?.subject?.name ||
    subject?.prerequisite_subject?.name ||
    subject?.code ||
    'Materia sin nombre'
  )
}

// El texto es el requisito que FALTA cumplir, no una confirmacion de que ya
// esta cumplido -- por eso el prefijo "Requiere" y el icono de candado, para
// que no se confunda con un check de "ya la tenes".
function RequirementLabel({ type }) {
  const requirementLabel = type === 'regular'
    ? 'regular'
    : type === 'cursed'
      ? 'cursada'
      : 'aprobada'

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
      <Lock className="h-3 w-3" />
      Requiere {requirementLabel}
    </span>
  )
}

export default function PrerequisiteAlert({
  subject,
  subjectId,
  prerequisites: prerequisitesProp,
  enrollments: enrollmentsProp,
  grades: gradesProp,
  subjects: subjectsProp,
  compact = false,
  hideWhenClear = false,
  className = ''
}) {
  const store = useStudentStore(useShallow(state => ({
    prerequisites: state.prerequisites,
    enrollments: state.enrollments,
    grades: state.grades,
    subjects: state.subjects
  })))

  const check = useMemo(() => {
    return getPrerequisiteCheck({
      subjectId,
      subject,
      prerequisites: prerequisitesProp || store.prerequisites,
      enrollments: enrollmentsProp || store.enrollments,
      grades: gradesProp || store.grades,
      subjects: subjectsProp || store.subjects
    })
  }, [
    subjectId,
    subject,
    prerequisitesProp,
    enrollmentsProp,
    gradesProp,
    subjectsProp,
    store.prerequisites,
    store.enrollments,
    store.grades,
    store.subjects
  ])

  if (!check.hasPrerequisites) {
    if (hideWhenClear) return null

    return (
      <div className={`rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 ${className}`}>
        Esta materia no tiene correlatividades cargadas.
      </div>
    )
  }

  if (check.canEnroll) {
    if (hideWhenClear) return null

    return (
      <div className={`rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ${className}`}>
        Cumple las correlatividades requeridas.
      </div>
    )
  }

  return (
    <div className={`rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 ${className}`}>
      <div className="font-semibold">Correlatividades pendientes</div>
      {!compact && (
        <p className="mt-1 text-amber-800">
          Para inscribirse primero debe cumplir estas materias.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {check.missing.map(({ prerequisite, subject: requiredSubject, requirementType }) => (
          <div
            key={prerequisite?.id || `${getSubjectId(requiredSubject)}-${requirementType}`}
            className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-3 py-2 ring-1 ring-inset ring-amber-100"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-950">
                {getSubjectName(requiredSubject)}
              </div>
              {requiredSubject?.code && (
                <div className="text-xs text-slate-600">{requiredSubject.code}</div>
              )}
            </div>
            <RequirementLabel type={requirementType} />
          </div>
        ))}
      </div>
    </div>
  )
}
