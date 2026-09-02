import { diagnoseLegacyStudentCareerLinks } from '../../utils/academicDomain/legacyStudentCareerLinkDiagnostics.js'

export const STUDENT_COURSE_PREVIEW_STATE = Object.freeze({
  LOADING: 'LOADING',
  READY: 'READY',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  PARTIAL_RESULT: 'PARTIAL_RESULT',
  BLOCKED: 'BLOCKED',
  ERROR: 'ERROR',
})

const REJECTION_MESSAGES = Object.freeze({
  STUDENT_CAREER_ENROLLMENT_NOT_ACTIVE: ['El vinculo academico no esta activo.', 'Solicita a Administracion que revise tu vinculacion con la carrera y el plan.'],
  STUDENT_CAREER_ENROLLMENT_INACTIVE: ['El vinculo academico no esta activo.', 'Solicita a Administracion que revise tu vinculacion con la carrera y el plan.'],
  COURSE_OFFERING_NOT_OPEN: ['La oferta no esta abierta para inscripcion.', 'Consulta el periodo de inscripcion o comunicate con Administracion.'],
  OFFERING_NOT_OPEN: ['La oferta no esta abierta para inscripcion.', 'Consulta el periodo de inscripcion o comunicate con Administracion.'],
  COURSE_OFFERING_PLAN_MISMATCH: ['La oferta pertenece a otro plan de estudios.', 'Selecciona una materia correspondiente a tu plan activo.'],
  STUDY_PLAN_MISMATCH: ['La oferta pertenece a otro plan de estudios.', 'Selecciona una materia correspondiente a tu plan activo.'],
  CAREER_MISMATCH: ['La oferta pertenece a otra carrera.', 'Selecciona una materia correspondiente a tu carrera activa.'],
  SUBJECT_ALREADY_PASSED: ['La materia ya figura como aprobada.', 'Revisa tu historia academica o consulta con Administracion si el dato es incorrecto.'],
  PREREQUISITE_NOT_MET: ['Todavia no cumplis la correlatividad requerida.', 'Revisa tu historia academica o consulta con Administracion.'],
  PREREQUISITES_NOT_MET: ['Todavia no cumplis la correlatividad requerida.', 'Revisa tu historia academica o consulta con Administracion.'],
  ALREADY_ENROLLED: ['Ya existe una inscripcion para esta oferta.', 'Revisa el listado de inscripciones vigentes.'],
  CROSS_TENANT_ACCESS: ['La oferta pertenece a otra institucion.', 'Vuelve a seleccionar tu institucion activa.'],
  INSTITUTION_MISMATCH: ['La oferta pertenece a otra institucion.', 'Vuelve a seleccionar tu institucion activa.'],
  UNAUTHORIZED_ACTOR: ['La sesion no esta autorizada para esta operacion.', 'Vuelve a iniciar sesion o consulta con Administracion.'],
  ACADEMIC_COMMAND_FORBIDDEN: ['La sesion no esta autorizada para esta operacion.', 'Vuelve a iniciar sesion o consulta con Administracion.'],
  FIRST_YEAR_ENTRANT_REQUIRED: ['La inscripcion automatica es solo para ingresantes de primer ano.', 'Utiliza la inscripcion individual de materias.'],
  STUDENT_NOT_ACTIVE_FIRST_YEAR_ENTRANT: ['La inscripcion automatica es solo para ingresantes activos de primer ano.', 'Consulta tu vinculo academico o utiliza la inscripcion individual.'],
  NO_FIRST_YEAR_OFFERINGS: ['No hay ofertas abiertas de primer ano.', 'Consulta a Administracion por la apertura de ofertas.'],
  FIRST_YEAR_OFFERINGS_NOT_FOUND: ['No hay ofertas abiertas de primer ano.', 'Consulta a Administracion por la apertura de ofertas.'],
  CAPACITY_EXCEEDED: ['La oferta no tiene cupos disponibles.', 'Consulta si se abrira otra comision.'],
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function countRejections(commandRequests) {
  const counts = {}
  asArray(commandRequests).forEach((command) => {
    asArray(command?.result_payload?.rejections).forEach((rejection) => {
      const code = clean(rejection?.code) || 'UNKNOWN_REJECTION'
      counts[code] = (counts[code] ?? 0) + 1
    })
  })
  return counts
}

export function getEnrollmentRejectionMessage(code) {
  const normalized = clean(code).toUpperCase() || 'UNKNOWN_REJECTION'
  const [message, action] = REJECTION_MESSAGES[normalized] ?? [
    'La inscripcion fue rechazada por una validacion institucional.',
    'Conserva el codigo y consulta con Administracion.',
  ]
  return { code: normalized, message, action }
}

export function buildStudentCourseEnrollmentPreviewModel(rawData, { legacyInputs } = {}) {
  const raw = rawData && typeof rawData === 'object' ? rawData : {}
  const relations = asArray(raw.relations)
  const selectedRelation = relations.find((relation) => relation.id === raw.selectedRelationId)
    ?? relations[0]
    ?? null
  const offerings = asArray(raw.offerings).filter((offering) => (
    selectedRelation
    && offering.institution_id === selectedRelation.institution_id
    && offering.career_id === selectedRelation.career_id
    && offering.study_plan_id === selectedRelation.study_plan_id
  ))
  const enrollments = asArray(raw.enrollments).filter((enrollment) => (
    !selectedRelation || enrollment.student_id === selectedRelation.student_id
  ))
  const schedules = asArray(raw.schedules)
  const teachingAssignments = asArray(raw.teachingAssignments)
  const prerequisites = asArray(raw.prerequisites)
  const commandRequests = asArray(raw.commandRequests)
  const legacyDiagnostic = legacyInputs
    ? diagnoseLegacyStudentCareerLinks({
        ...legacyInputs,
        careers: asArray(raw.careers),
        studyPlans: asArray(raw.studyPlans),
      })
    : null
  const activeRelation = selectedRelation?.status === 'ACTIVE'
  const openOfferings = offerings.filter((offering) => offering.status === 'OPEN_FOR_ENROLLMENT')
  const firstYearOpenOfferings = openOfferings.filter((offering) => Number(offering.year_level) === 1)

  return {
    source: clean(raw.source) || 'local_student_course_enrollment_preview',
    actorMode: clean(raw.actorMode) || 'student',
    institution: raw.institution ?? null,
    relations,
    selectedRelation,
    careers: asArray(raw.careers),
    studyPlans: asArray(raw.studyPlans),
    academicYears: asArray(raw.academicYears),
    subjects: asArray(raw.subjects),
    offerings,
    schedules,
    teachingAssignments,
    prerequisites,
    enrollments,
    commandRequests,
    auditEvents: asArray(raw.auditEvents),
    warnings: asArray(raw.warnings),
    legacyDiagnostic,
    rejectionCounts: countRejections(commandRequests),
    metrics: {
      ...(raw.metrics ?? {}),
      duplicateRequestsAvoided: commandRequests.filter((command) => (
        command?.result_payload?.status === 'ALREADY_EXISTED'
        || Number(command?.result_payload?.existing_count) > 0
      )).length,
    },
    diagnostics: {
      status: !selectedRelation
        ? (legacyDiagnostic?.ambiguous?.count > 0 ? 'AMBIGUOUS' : 'INCOMPLETE')
        : activeRelation ? 'READY' : 'BLOCKED',
      activeRelation,
      firstYearEntrant: selectedRelation?.is_first_year_entrant === true,
      availableOfferings: openOfferings.length,
      firstYearOpenOfferings: firstYearOpenOfferings.length,
      existingEnrollments: enrollments.length,
      relationalLinkCommandAvailable: true,
      automaticLegacyLinkAllowed: legacyDiagnostic?.ready?.count > 0
        && legacyDiagnostic?.ambiguous?.count === 0,
    },
  }
}

export function getOfferingDetails(model, offeringId) {
  const offering = model?.offerings?.find((item) => item.id === offeringId)
  if (!offering) return null
  const enrollment = model.enrollments.find((item) => item.course_offering_id === offeringId) ?? null
  return {
    ...offering,
    enrollment,
    schedules: model.schedules.filter((item) => item.course_offering_id === offeringId),
    teachers: model.teachingAssignments.filter((item) => item.course_offering_id === offeringId),
    prerequisites: model.prerequisites.filter((item) => item.subject_id === offering.study_plan_subject_id),
  }
}
