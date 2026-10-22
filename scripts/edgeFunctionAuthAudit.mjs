// SEC.1: una Edge Function con verify_jwt=false tiene que validar la sesion por su cuenta.
// Las validaciones se buscan en index.ts y, si index.ts delega, en sus imports locales directos
// ('./archivo.js' en la misma carpeta). Sin comodines ni rutas '../'.

const LOCAL_IMPORT_PATTERN = /^\s*import\s[^'"]*from\s+['"](\.\/[A-Za-z0-9_-]+\.(?:js|mjs|ts))['"]/gm

export const AUTH_CHECKS = Object.freeze([
  {
    reason: 'verify_jwt=false requires explicit Bearer authorization validation',
    entry: /assertBearerAuthorization\s*\(/,
    // handler.js de source-file-storage valida el prefijo Bearer en linea, antes de cualquier otra cosa.
    delegated: /assertBearerAuthorization\s*\(|\.startsWith\(\s*['"]Bearer ['"]\s*\)/,
  },
  {
    reason: 'verify_jwt=false requires server-side user token validation',
    entry: /auth\.getUser\s*\(/,
    delegated: /auth\.getUser\s*\(/,
  },
  {
    reason: 'verify_jwt=false requires explicit role or membership authorization',
    entry: /\b(?:is_global_admin|account_role|memberships)\b/,
    delegated: /\b(?:is_global_admin|account_role|memberships)\b/,
  },
])

export function directLocalImports(content) {
  return [...content.matchAll(LOCAL_IMPORT_PATTERN)].map((match) => match[1])
}

// readSource(path) devuelve el contenido o null si el archivo no existe.
export function auditNoVerifyJwtFunction(functionName, readSource) {
  const entryPath = `supabase/functions/${functionName}/index.ts`
  const entry = readSource(entryPath)
  if (entry === null) return [{ path: entryPath, reason: 'verify_jwt=false configured but function source is missing' }]

  const delegated = directLocalImports(entry)
    .map((specifier) => readSource(`supabase/functions/${functionName}/${specifier.slice(2)}`))
    .filter((content) => content !== null)

  return AUTH_CHECKS
    .filter((check) => !check.entry.test(entry) && !delegated.some((content) => check.delegated.test(content)))
    .map((check) => ({ path: entryPath, reason: check.reason }))
}
