export const SOURCE_FILES_BUCKET = 'workspace-source-files'
export const SOURCE_FILE_DATASETS = Object.freeze(['masterWorkbook', 'docentesWorkbook', 'alumnosWorkbook', 'horarios', 'planes', 'correlatividades', 'alumnos', 'docentes', 'docenteMateria'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const resourcePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export function canonicalStorageSegment(value, pattern = resourcePattern) {
  if (typeof value !== 'string' || !value) throw new Error('Ruta de Storage no autorizada.')
  let decoded
  try { decoded = decodeURIComponent(value) } catch { throw new Error('Ruta de Storage no autorizada.') }
  if (decoded !== value || decoded.includes('%') || decoded.trim() !== decoded || decoded.normalize('NFKC') !== decoded || !pattern.test(decoded)) throw new Error('Ruta de Storage no autorizada.')
  return decoded
}
export function canonicalStorageUuid(value) { return canonicalStorageSegment(value, uuidPattern) }
export function sourceFileStoragePrefix({ institutionId, userId, workspaceKey, datasetKey }) {
  return [canonicalStorageUuid(institutionId), canonicalStorageUuid(userId), canonicalStorageSegment(workspaceKey), canonicalStorageSegment(datasetKey)].join('/') + '/'
}
export function buildSourceFileStoragePath(context, objectId = crypto.randomUUID()) {
  return sourceFileStoragePrefix(context) + canonicalStorageUuid(objectId)
}
export function assertSourceFileStoragePath({ storagePath, storageBucket, ...context }) {
  if (storageBucket !== SOURCE_FILES_BUCKET || typeof storagePath !== 'string') throw new Error('Ruta de Storage no autorizada.')
  const prefix = sourceFileStoragePrefix(context)
  if (!storagePath.startsWith(prefix)) throw new Error('Ruta de Storage no autorizada.')
  canonicalStorageUuid(storagePath.slice(prefix.length))
  return storagePath
}
export function sanitizeSourceFileName(value) {
  if (typeof value !== 'string' || value.length > 180) throw new Error('Nombre de archivo invalido.')
  let decoded
  try { decoded = decodeURIComponent(value) } catch { throw new Error('Nombre de archivo invalido.') }
  const hasControl = [...decoded].some((char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)
  if (!decoded || decoded !== value || decoded.includes('%') || /[/\\]/.test(decoded) || hasControl || decoded === '.' || decoded === '..' || decoded.normalize('NFKC') !== decoded) throw new Error('Nombre de archivo invalido.')
  const name = decoded.trim().replace(/[^\p{L}\p{N}._ -]/gu, '_')
  if (!name || name === '.' || name === '..') throw new Error('Nombre de archivo invalido.')
  return name
}
export function assertLegacySourceFileReadPath({ institutionId, workspaceKey, datasetKey, storageBucket, storagePath }) {
  canonicalStorageUuid(institutionId)
  canonicalStorageSegment(workspaceKey)
  if (!SOURCE_FILE_DATASETS.includes(datasetKey) || storageBucket !== SOURCE_FILES_BUCKET || typeof storagePath !== 'string') throw new Error('Ruta de Storage no autorizada.')
  const prefix = `${institutionId}/${workspaceKey}/${datasetKey}/`
  const suffix = storagePath.slice(prefix.length)
  if (!storagePath.startsWith(prefix) || suffix.trim() !== suffix || !/^[0-9]+-[A-Za-z0-9._-]+$/.test(suffix)) throw new Error('Ruta de Storage no autorizada.')
  return storagePath
}
export async function getSourceFileStorageUserId(client) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  return canonicalStorageUuid(data?.user?.id)
}
