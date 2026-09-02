import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const rootDir = process.cwd()
const distDir = join(rootDir, 'dist')
const failures = []

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
])

const forbiddenPathRules = [
  [/\.map$/i, 'source map file'],
  [/(^|[/\\])\.env(?:\.|$)/i, 'environment file'],
  [/\.(?:sql|ts|tsx|jsx|mjs|cjs)$/i, 'source/config file'],
  [/\.(?:test|spec)\./i, 'test file'],
  [/(^|[/\\])(?:__tests__|fixtures?|local-audit|scripts|supabase)(?:[/\\]|$)/i, 'development/support directory'],
  [/InternalPreview|RegularExamPreviewInternalPanel|DevAuditSnapshot|examEnginePreview\.worker/i, 'internal development tool'],
]

const forbiddenTextRules = [
  [/sourceMappingURL/i, 'source map reference'],
  [/\bsb_secret_[A-Za-z0-9_-]+\b/, 'Supabase secret key'],
  [/\b(?:SUPABASE_)?SERVICE_ROLE_KEY\s*=\s*['"]?[^'"\s]+/i, 'service role assignment'],
  [/\bADMIN_SERVICE_ROLE_KEY\s*=\s*['"]?[^'"\s]+/i, 'admin service role assignment'],
  [/VITE_DISABLE_AUTH\s*:\s*['"`]?true/i, 'production auth disable flag'],
  [/StudentCourseEnrollmentInternalPreview|TeacherCourseRosterInternalPreview|RegularExamPreviewInternalPanel|DevAuditSnapshotExport|examEnginePreview\.worker/i, 'internal development tool reference'],
]

function toRepoPath(filePath) {
  return relative(rootDir, filePath).replaceAll('\\', '/')
}

function collectFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) return collectFiles(fullPath)
    return [fullPath]
  })
}

function addFailure(filePath, reason, detail = '') {
  const suffix = detail ? ` (${detail})` : ''
  failures.push(`${toRepoPath(filePath)}: ${reason}${suffix}`)
}

function decodeBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64').toString('utf8')
}

function auditJwtTokens(filePath, content) {
  const jwtMatches = content.match(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g) ?? []

  for (const token of jwtMatches) {
    const [, payload] = token.split('.')
    try {
      const decoded = JSON.parse(decodeBase64Url(payload))
      if (decoded?.role === 'service_role') {
        addFailure(filePath, 'service_role JWT embedded in build')
      }
    } catch {
      // Ignore non-JSON JWT-like strings; the explicit secret patterns still run.
    }
  }
}

function auditTextFile(filePath) {
  const content = readFileSync(filePath, 'utf8')

  for (const [pattern, reason] of forbiddenTextRules) {
    if (pattern.test(content)) addFailure(filePath, reason)
  }

  auditJwtTokens(filePath, content)
}

if (!existsSync(distDir)) {
  console.error('[production-build-audit] dist directory does not exist. Run vite build first.')
  process.exit(1)
}

const files = collectFiles(distDir)

for (const filePath of files) {
  const repoPath = toRepoPath(filePath)

  for (const [pattern, reason] of forbiddenPathRules) {
    if (pattern.test(repoPath)) addFailure(filePath, reason)
  }

  if (textExtensions.has(extname(filePath).toLowerCase())) {
    auditTextFile(filePath)
  }
}

if (failures.length > 0) {
  console.error('[production-build-audit] FAILED')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`[production-build-audit] OK (${files.length} files checked)`)
