const MESSAGE_BY_CODE = Object.freeze({
  UNAUTHORIZED_ACTOR: ['La sesion no esta autorizada para gestionar vinculos.', 'Verifica el rol y la institucion activa.'],
  CROSS_TENANT_ACCESS: ['Los datos seleccionados pertenecen a otra institucion.', 'Selecciona alumno, padron y catalogo de la institucion activa.'],
  STUDENT_NOT_FOUND: ['No se encontro un alumno activo con esa identidad.', 'Revisa el usuario y su membership institucional.'],
  STUDENT_RECORD_NOT_FOUND: ['No se encontro un registro de padron activo.', 'Selecciona un registro institucional vigente.'],
  STUDENT_IDENTITY_CONFLICT: ['El usuario y el registro de padron contradicen un vinculo existente.', 'Revisa la identidad antes de continuar.'],
  CAREER_NOT_FOUND: ['La carrera no existe en la institucion.', 'Actualiza el catalogo y vuelve a seleccionar la carrera.'],
  STUDY_PLAN_NOT_FOUND: ['El plan de estudios no existe.', 'Selecciona un plan vigente.'],
  STUDY_PLAN_CAREER_MISMATCH: ['El plan no pertenece a la carrera seleccionada.', 'Selecciona un plan de esa carrera.'],
  ACTIVE_LINK_ALREADY_EXISTS: ['Ya existe un vinculo activo equivalente.', 'Revisa el historial; no es necesario crear otro vinculo.'],
  CONFLICTING_ACTIVE_LINK_EXISTS: ['Existe otro vinculo activo incompatible.', 'Corrige o invalida el vinculo anterior antes de crear uno nuevo.'],
  LINK_ALREADY_INVALIDATED: ['El vinculo ya fue invalidado.', 'Revisa el historial y evita repetir la operacion con otro requestId.'],
  REASON_REQUIRED: ['El motivo administrativo es obligatorio.', 'Describe la causa antes de confirmar.'],
  INVALID_ACADEMIC_YEAR: ['El ciclo o ano de ingreso no es valido.', 'Selecciona ciclos de la institucion y verifica el ano de ingreso.'],
  IDEMPOTENT_RESULT_REPLAYED: ['La solicitud ya habia sido procesada.', 'Se muestra el resultado almacenado; no se repitieron efectos.'],
  ACTIVE_COURSE_ENROLLMENTS_EXIST: ['El alumno conserva inscripciones de cursado activas.', 'Resolver esas inscripciones requiere una decision administrativa posterior.'],
})

function clean(value) {
  return String(value ?? '').trim()
}

export function getStudentCareerAdminMessage(code) {
  const normalized = clean(code).toUpperCase() || 'UNKNOWN_ADMIN_LINK_ERROR'
  const [message, action] = MESSAGE_BY_CODE[normalized] ?? [
    'La operacion no pudo completarse por una validacion administrativa.',
    'Conserva el codigo y revisa el historial de comandos.',
  ]
  return { code: normalized, message, action }
}

export function getStudentCareerAdminResultCode(result) {
  if (result?.data?.code) return clean(result.data.code).toUpperCase()
  const message = clean(result?.error?.message)
  const knownCode = Object.keys(MESSAGE_BY_CODE).find((code) => message.includes(code))
  return knownCode || clean(result?.error?.code).toUpperCase() || null
}

export function hasAmbiguousLegacyStudentLink(model) {
  return (model?.legacyDiagnostic?.rows ?? []).some((row) => (
    String(row?.status ?? '').startsWith('AMBIGUOUS_') || row?.status === 'DUPLICATED_MATCH'
  ))
}

export function findReadyLegacyStudentLink(model) {
  return (model?.legacyDiagnostic?.rows ?? []).find((row) => row?.status === 'READY_FOR_RELATIONAL_LINK') ?? null
}
