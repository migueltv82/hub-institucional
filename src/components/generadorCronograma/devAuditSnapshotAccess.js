const DEV_AUDIT_AUTHORIZED_ROLES = new Set([
  'superadmin',
  'owner',
  'admin',
  'admin_instituto',
  'institution_admin',
  'administrador',
])

export function normalizeDevAuditSnapshotRole(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isDevAuditSnapshotRoleAuthorized({ isSuperAdmin = false, detectedRole } = {}) {
  return isSuperAdmin || DEV_AUDIT_AUTHORIZED_ROLES.has(normalizeDevAuditSnapshotRole(detectedRole))
}
