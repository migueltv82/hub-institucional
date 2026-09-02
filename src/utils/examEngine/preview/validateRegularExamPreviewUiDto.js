import {
  hasOwn,
  PLANNED_ROW_REQUIRED_FIELDS,
  UI_ROOT_REQUIRED_FIELDS,
  UI_SUMMARY_REQUIRED_FIELDS,
  UNASSIGNED_ROW_REQUIRED_FIELDS,
} from './uiDtoShared.js'

function pushIssue(target, code, message, path = '') {
  target.push({ code, message, path })
}

function validateNoUnsafeValues(value, errors, path = 'dto', seen = new WeakSet()) {
  if (value === undefined) {
    pushIssue(errors, 'UNDEFINED_VALUE', 'El DTO visual contiene un valor undefined.', path)
    return
  }

  if (typeof value === 'function') {
    pushIssue(errors, 'FUNCTION_VALUE', 'El DTO visual contiene una funcion.', path)
    return
  }

  if (typeof value === 'symbol') {
    pushIssue(errors, 'SYMBOL_VALUE', 'El DTO visual contiene un symbol no serializable.', path)
    return
  }

  if (!value || typeof value !== 'object') return

  if (seen.has(value)) {
    pushIssue(errors, 'CIRCULAR_REFERENCE', 'El DTO visual contiene una referencia circular.', path)
    return
  }

  seen.add(value)

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      validateNoUnsafeValues(entry, errors, `${path}[${index}]`, seen)
    })
    return
  }

  Object.entries(value).forEach(([key, entry]) => {
    validateNoUnsafeValues(entry, errors, `${path}.${key}`, seen)
  })
}

function validateRequiredFields(object, fields, errors, path, code) {
  fields.forEach((field) => {
    if (!hasOwn(object, field)) {
      pushIssue(errors, code, `Falta el campo obligatorio ${path}.${field}.`, `${path}.${field}`)
    }
  })
}

function validateArraySection(value, errors, path) {
  if (!Array.isArray(value)) {
    pushIssue(errors, 'INVALID_ARRAY_SECTION', `${path} debe ser un array.`, path)
  }
}

function validatePlannedRows(rows = [], errors) {
  if (!Array.isArray(rows)) return
  rows.forEach((row, index) => {
    const path = `uiTables.planned[${index}]`
    validateRequiredFields(row, PLANNED_ROW_REQUIRED_FIELDS, errors, path, 'MISSING_PLANNED_ROW_FIELD')
    if (hasOwn(row, 'titular') && (!row.titular || typeof row.titular !== 'object' || Array.isArray(row.titular))) {
      pushIssue(errors, 'INVALID_PLANNED_TITULAR', `${path}.titular debe ser un objeto.`, `${path}.titular`)
    }
    if (hasOwn(row, 'vocales') && !Array.isArray(row.vocales)) {
      pushIssue(errors, 'INVALID_PLANNED_VOCALES', `${path}.vocales debe ser un array.`, `${path}.vocales`)
    }
  })
}

function validateUnassignedRows(rows = [], errors) {
  if (!Array.isArray(rows)) return
  rows.forEach((row, index) => {
    validateRequiredFields(row, UNASSIGNED_ROW_REQUIRED_FIELDS, errors, `uiTables.unassigned[${index}]`, 'MISSING_UNASSIGNED_ROW_FIELD')
  })
}

export function validateRegularExamPreviewUiDto(dto = {}) {
  const errors = []
  const warnings = []

  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
    pushIssue(errors, 'INVALID_DTO_ROOT', 'El DTO visual debe ser un objeto.', 'dto')
    return { valid: false, errors, warnings }
  }

  validateRequiredFields(dto, UI_ROOT_REQUIRED_FIELDS, errors, 'dto', 'MISSING_ROOT_FIELD')
  validateRequiredFields(dto.uiSummary, UI_SUMMARY_REQUIRED_FIELDS, errors, 'uiSummary', 'MISSING_UI_SUMMARY_FIELD')

  if (!dto.uiTables || typeof dto.uiTables !== 'object' || Array.isArray(dto.uiTables)) {
    pushIssue(errors, 'INVALID_UI_TABLES', 'uiTables debe ser un objeto.', 'uiTables')
  } else {
    validateArraySection(dto.uiTables.planned, errors, 'uiTables.planned')
    validateArraySection(dto.uiTables.unassigned, errors, 'uiTables.unassigned')
    validatePlannedRows(dto.uiTables.planned, errors)
    validateUnassignedRows(dto.uiTables.unassigned, errors)
  }

  ;[
    ['uiAlerts', dto.uiAlerts],
    ['uiTeacherSummary', dto.uiTeacherSummary],
    ['uiCareerSummary', dto.uiCareerSummary],
    ['uiCallSummary', dto.uiCallSummary],
    ['uiPendingReview', dto.uiPendingReview],
    ['uiRecommendations', dto.uiRecommendations],
  ].forEach(([path, value]) => {
    if (hasOwn(dto, path) && !Array.isArray(value)) {
      pushIssue(warnings, 'INVALID_SECONDARY_ARRAY', `${path} deberia ser un array.`, path)
    }
  })

  if (!dto.audit || typeof dto.audit !== 'object' || Array.isArray(dto.audit)) {
    pushIssue(errors, 'INVALID_AUDIT', 'audit debe ser un objeto.', 'audit')
  } else {
    if (hasOwn(dto.audit, 'raw')) {
      pushIssue(errors, 'AUDIT_RAW_NOT_ALLOWED', 'audit no debe contener raw.', 'audit.raw')
    }
    if (hasOwn(dto.audit.exportedReport, 'raw')) {
      pushIssue(errors, 'AUDIT_EXPORTED_RAW_NOT_ALLOWED', 'audit.exportedReport no debe contener raw.', 'audit.exportedReport.raw')
    }
    if (!hasOwn(dto.audit.exportValidation, 'valid')) {
      pushIssue(errors, 'MISSING_EXPORT_VALIDATION_VALID', 'audit.exportValidation.valid debe existir.', 'audit.exportValidation.valid')
    }
  }

  validateNoUnsafeValues(dto, errors)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

