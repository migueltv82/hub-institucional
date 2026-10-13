import { canonicalStorageUuid } from './sourceFileStoragePath.js'

function intentKey({ institutionId, workspaceKey, ownerUserId }) {
  if (!institutionId || !workspaceKey || !ownerUserId) throw new Error('Falta contexto para la limpieza del workspace.')
  return `mesaflow.storage-clear.v1:${JSON.stringify([institutionId, workspaceKey, ownerUserId])}`
}

// Persist before sending HTTP. A failed/ambiguous request keeps this intention
// across manual retries and remounts; no server response generates the identity.
export function getWorkspaceClearOperationId(context) {
  const key = intentKey(context)
  const pending = sessionStorage.getItem(key)
  if (pending) return canonicalStorageUuid(pending)
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, id)
  return id
}

export function completeWorkspaceClearIntent(context, operationId) {
  const key = intentKey(context)
  if (sessionStorage.getItem(key) === operationId) sessionStorage.removeItem(key)
}
