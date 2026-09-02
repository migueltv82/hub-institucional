import {
  FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
  buildFullAnonymizedWorkspaceSnapshotAuditPayload,
  buildFullWorkspaceSnapshotAuditSummary,
} from './workspaceSnapshotAuditAnonymizer.js'
import { sha256Hex } from '../../utils/examEngine/adminReviewPromotionWorkflow.js'

export const WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME = 'workspaceSnapshot.real.local.json'
export const FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_TEXT_FILE_NAME = 'workspaceSnapshot.real.full.anon.local.txt'
export {
  FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
  buildFullAnonymizedWorkspaceSnapshotAuditPayload,
  buildFullWorkspaceSnapshotAuditSummary,
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export function buildWorkspaceSnapshotAuditPayload({
  alumnos = [],
  horariosDocentes = [],
  docenteMateria = [],
  docentes = [],
  planesEstudio = [],
  correlatividades = [],
  fechaInicio = '',
  fechaFin = '',
  examType = 'regular',
  generationScope = {},
  regularCallRanges = {},
  selectedSpecialSubjectKeys = [],
} = {}) {
  return {
    alumnos: cloneJson(asArray(alumnos)),
    horariosDocentes: cloneJson(asArray(horariosDocentes)),
    docenteMateria: cloneJson(asArray(docenteMateria)),
    docentes: cloneJson(asArray(docentes)),
    planesEstudio: cloneJson(asArray(planesEstudio)),
    correlatividades: cloneJson(asArray(correlatividades)),
    fechaInicio: String(fechaInicio ?? ''),
    fechaFin: String(fechaFin ?? ''),
    examType,
    generationScope: cloneJson(generationScope ?? {}),
    regularCallRanges: cloneJson(regularCallRanges ?? {}),
    selectedSpecialSubjectKeys: cloneJson(asArray(selectedSpecialSubjectKeys)),
  }
}

export function buildWorkspaceSnapshotAuditSummary(snapshot = {}) {
  return {
    alumnos: asArray(snapshot.alumnos).length,
    docentes: asArray(snapshot.docentes).length,
    docenteMateria: asArray(snapshot.docenteMateria).length,
    docenteMateriaCount: asArray(snapshot.docenteMateria).length,
    horariosDocentes: asArray(snapshot.horariosDocentes).length,
    planesEstudio: asArray(snapshot.planesEstudio).length,
    correlatividades: asArray(snapshot.correlatividades).length,
    fechaInicio: String(snapshot.fechaInicio ?? ''),
    fechaFin: String(snapshot.fechaFin ?? ''),
    examType: snapshot.examType,
    generationScope: cloneJson(snapshot.generationScope ?? {}),
  }
}

export function serializeWorkspaceSnapshotAuditPayload(snapshot = {}) {
  return JSON.stringify(snapshot, null, 2)
}

const EMAIL_VALUE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const SECRET_VALUE_PATTERN = /(?:SUPABASE_SERVICE_ROLE_KEY|service[_-]?role[_-]?key|(?:eyJ[A-Za-z0-9_-]{20,}\.){2}[A-Za-z0-9_-]{20,})/i

function isSensitiveAuditField(key) {
  const normalized = String(key ?? '').toLowerCase().replaceAll(/[^a-z0-9]+/g, '')
  return normalized.includes('email')
    || normalized.includes('telefono')
    || normalized.includes('phone')
    || normalized.includes('document')
    || normalized.includes('password')
    || normalized.includes('secret')
    || normalized.includes('token')
    || ['dni', 'legajo', 'cuil', 'cuit', 'domicilio', 'address', 'rawpayload', 'rawdata'].includes(normalized)
}

function findUnsafeAuditValue(value, path = '') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = findUnsafeAuditValue(value[index], `${path}[${index}]`)
      if (result) return result
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (isSensitiveAuditField(key)) return { code: 'AUDIT_EXPORT_SENSITIVE_FIELD_DETECTED', path: `${path}.${key}` }
      const result = findUnsafeAuditValue(nestedValue, `${path}.${key}`)
      if (result) return result
    }
    return null
  }
  if (typeof value !== 'string') return null
  if (EMAIL_VALUE_PATTERN.test(value)) return { code: 'AUDIT_EXPORT_EMAIL_DETECTED', path }
  if (SECRET_VALUE_PATTERN.test(value)) return { code: 'AUDIT_EXPORT_SECRET_DETECTED', path }
  return null
}

export function validateFullAnonymizedWorkspaceSnapshotAuditPayload(snapshot) {
  const errors = []
  let serialized = ''
  let hash = ''
  let jsonSize = 0
  const metadata = snapshot?._auditExport

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    errors.push('AUDIT_EXPORT_PAYLOAD_REQUIRED')
  }
  if (!metadata || typeof metadata !== 'object') {
    errors.push('AUDIT_EXPORT_METADATA_MISSING')
  } else {
    if (metadata.anonymizationApplied !== true) errors.push('AUDIT_EXPORT_ANONYMIZATION_REQUIRED')
    if (!Array.isArray(metadata.includedSections) || metadata.includedSections.length === 0) {
      errors.push('AUDIT_EXPORT_INCLUDED_SECTIONS_INVALID')
    } else {
      metadata.includedSections.forEach((section) => {
        if (!Object.hasOwn(snapshot, section)) errors.push(`AUDIT_EXPORT_SECTION_MISSING:${section}`)
      })
    }
  }

  const unsafeValue = findUnsafeAuditValue(snapshot)
  if (unsafeValue) errors.push(unsafeValue.code)

  try {
    serialized = serializeWorkspaceSnapshotAuditPayload(snapshot)
    jsonSize = new TextEncoder().encode(serialized).byteLength
    if (jsonSize === 0) errors.push('AUDIT_EXPORT_EMPTY')
    hash = sha256Hex(serialized)
  } catch {
    errors.push('AUDIT_EXPORT_SERIALIZATION_FAILED')
  }

  const summary = buildFullWorkspaceSnapshotAuditSummary(snapshot)
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    serialized,
    diagnostics: {
      exportMode: summary.mode,
      fileName: FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
      jsonSize,
      hash,
      shortHash: hash.slice(0, 12),
      includedSectionsCount: summary.includedSections.length,
      missingSectionsCount: summary.missingSections.length,
      includedSections: summary.includedSections,
      missingSections: summary.missingSections,
      hasStructuredTeacherSource: summary.hasStructuredTeacherSource,
      hasLegacyTeacherSource: summary.hasLegacyTeacherSource,
      hasBlockedDates: summary.hasBlockedDates,
      hasAdminReviewEvents: summary.hasAdminReviewEvents,
      hasOfficialSchedule: summary.hasOfficialSchedule,
    },
  }
}

function requireValidFullAuditPayload(snapshot) {
  const prepared = validateFullAnonymizedWorkspaceSnapshotAuditPayload(snapshot)
  if (!prepared.valid) {
    throw new Error(`AUDIT_EXPORT_VALIDATION_FAILED:${prepared.errors.join(',')}`)
  }
  return prepared
}

export function downloadWorkspaceSnapshotAuditPayload(snapshot, {
  documentRef = document,
  urlRef = URL,
  fileName = WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
  mimeType = 'application/json;charset=utf-8',
  serialized = serializeWorkspaceSnapshotAuditPayload(snapshot),
  scheduleRevoke = (callback) => setTimeout(callback, 1000),
} = {}) {
  let objectUrl = ''
  let anchor = null
  try {
    const blob = new Blob([serialized], { type: mimeType })
    objectUrl = urlRef.createObjectURL(blob)
    anchor = documentRef.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    anchor.rel = 'noopener'
    documentRef.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    scheduleRevoke(() => urlRef.revokeObjectURL(objectUrl))
    return {
      fileName,
      jsonSize: new TextEncoder().encode(serialized).byteLength,
      downloadTriggered: true,
    }
  } catch {
    anchor?.remove?.()
    if (objectUrl) urlRef.revokeObjectURL(objectUrl)
    throw new Error('DOWNLOAD_TRIGGER_FAILED')
  }
}

export function downloadFullAnonymizedWorkspaceSnapshotAuditPayload(snapshot, options = {}) {
  const prepared = requireValidFullAuditPayload(snapshot)
  return downloadWorkspaceSnapshotAuditPayload(snapshot, {
    ...options,
    fileName: options.fileName ?? FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
    serialized: prepared.serialized,
  })
}

export function downloadFullAnonymizedWorkspaceSnapshotAuditText(snapshot, options = {}) {
  const prepared = requireValidFullAuditPayload(snapshot)
  return downloadWorkspaceSnapshotAuditPayload(snapshot, {
    ...options,
    fileName: options.fileName ?? FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_TEXT_FILE_NAME,
    mimeType: 'text/plain;charset=utf-8',
    serialized: prepared.serialized,
  })
}

export async function copyFullAnonymizedWorkspaceSnapshotAuditPayload(snapshot, {
  navigatorRef = navigator,
} = {}) {
  const prepared = requireValidFullAuditPayload(snapshot)
  try {
    if (typeof navigatorRef?.clipboard?.writeText !== 'function') throw new Error('CLIPBOARD_UNAVAILABLE')
    await navigatorRef.clipboard.writeText(prepared.serialized)
    return { ...prepared.diagnostics, copiedToClipboard: true }
  } catch {
    throw new Error('CLIPBOARD_EXPORT_FAILED')
  }
}

export async function saveFullAnonymizedWorkspaceSnapshotAuditPayload(snapshot, {
  windowRef = window,
} = {}) {
  const prepared = requireValidFullAuditPayload(snapshot)
  if (typeof windowRef?.showSaveFilePicker !== 'function') {
    throw new Error('FILE_SYSTEM_ACCESS_API_UNAVAILABLE')
  }

  try {
    const handle = await windowRef.showSaveFilePicker({
      suggestedName: FULL_ANONYMIZED_WORKSPACE_SNAPSHOT_AUDIT_FILE_NAME,
      types: [{
        description: 'Snapshot anonimizado JSON',
        accept: { 'application/json': ['.json'] },
      }],
    })
    const writable = await handle.createWritable()
    await writable.write(prepared.serialized)
    await writable.close()
    return { ...prepared.diagnostics, savedWithFilePicker: true }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('FILE_PICKER_CANCELLED')
    throw new Error('FILE_PICKER_EXPORT_FAILED')
  }
}
