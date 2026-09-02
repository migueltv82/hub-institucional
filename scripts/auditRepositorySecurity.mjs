import { execFileSync } from 'node:child_process'
import { extname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const failures = []

const allowedTrackedBinaryFiles = new Set([
  'public/plantillas/plantilla-academica.xlsx',
  'public/plantillas/plantilla-alumnos.xlsx',
  'public/plantillas/plantilla-docentes.xlsx',
  'public/plantillas/plantilla_institucional_precargada_completa.xlsx',
  'src/assets/institutional-hub-logo-horizontal-web.png',
  'src/assets/planning-workspace.jpg',
])

const textExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ps1',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.webmanifest',
  '.xml',
])

const forbiddenTrackedPathRules = [
  [/^\.env$/i, 'environment file'],
  [/^\.env\.(?!example$)/i, 'environment file'],
  [/^dist(?:\/|$)/i, 'production build output'],
  [/^node_modules(?:\/|$)/i, 'dependencies directory'],
  [/^local-audit(?:\/|$)/i, 'local audit/private data directory'],
  [/^supabase\/\.temp(?:\/|$)/i, 'Supabase local CLI temp directory'],
  [/^tmp-dev-logs(?:\/|$)/i, 'temporary logs directory'],
  [/^\.tmp_/i, 'temporary file'],
  [/^fix\.(?:cjs|mjs|js)$/i, 'one-off patch script'],
  [/^(?:error|errores|debug|check_output)[^/]*\.(?:txt|log)$/i, 'debug/test output artifact'],
]

const forbiddenTextRules = [
  [/\bsb_secret_[A-Za-z0-9_-]+\b/, 'Supabase secret key'],
  [/-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/, 'private key material'],
  [/https:\/\/[a-z0-9]{20}\.supabase\.co/i, 'concrete Supabase project URL'],
  [/--project-ref[ \t]+[a-z0-9]{20}\b/i, 'concrete Supabase project ref'],
  [/\b(?:project|proyecto)(?:\s+ref)?(?:\s+actual)?[^.\n`'"]{0,80}\b[a-z0-9]{20}\b/i, 'concrete Supabase project ref'],
]

const serviceRoleAssignmentPattern = /\b((?:SUPABASE_)?SERVICE_ROLE_KEY|ADMIN_SERVICE_ROLE_KEY)[ \t]*=[ \t]*['"]?([^'"\s]+)/gi
const edgeFunctionPathPattern = /^supabase\/functions\/([^/]+)\/index\.ts$/i

function listTrackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))
}

function addFailure(filePath, reason) {
  failures.push(`${filePath}: ${reason}`)
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
      if (decoded?.role === 'service_role') addFailure(filePath, 'service_role JWT')
    } catch {
      // Ignore JWT-like strings that are not decodable JSON payloads.
    }
  }
}

function isPlaceholderSecret(value) {
  const normalized = String(value ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (!normalized) return true
  if (/^\$null$/i.test(normalized)) return true
  if (/^\.{2,}$/.test(normalized)) return true
  if (/^(?:TU_|tu-|your-|example|placeholder|env\()/i.test(normalized)) return true
  if (/^<.+>$/.test(normalized)) return true
  return false
}

function auditServiceRoleAssignments(filePath, content) {
  for (const match of content.matchAll(serviceRoleAssignmentPattern)) {
    const [, variableName, value] = match
    if (!isPlaceholderSecret(value)) addFailure(filePath, `${variableName} assignment`)
  }
}

function collectNoVerifyJwtFunctions() {
  const functionNames = new Set()
  const configPaths = ['supabase/config.toml', 'supabase/config/config.toml']

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue

    const lines = readFileSync(configPath, 'utf8').split(/\r?\n/)
    let currentFunction = null

    for (const line of lines) {
      const section = line.match(/^\s*\[functions\.("?)([^"\]]+)\1\]\s*$/)
      if (section) {
        currentFunction = section[2]
        continue
      }

      if (/^\s*\[/.test(line)) {
        currentFunction = null
        continue
      }

      if (currentFunction && /^\s*verify_jwt\s*=\s*false\s*(?:#.*)?$/i.test(line)) {
        functionNames.add(currentFunction)
      }
    }
  }

  return functionNames
}

function parseTomlSections(content) {
  const sections = new Map()
  let currentSection = ''

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue

    const section = line.match(/^\[([^\]]+)\]$/)
    if (section) {
      currentSection = section[1]
      if (!sections.has(currentSection)) sections.set(currentSection, new Map())
      continue
    }

    const setting = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
    if (setting) {
      if (!sections.has(currentSection)) sections.set(currentSection, new Map())
      sections.get(currentSection).set(setting[1], setting[2].trim())
    }
  }

  return sections
}

function getTomlSetting(sections, sectionName, settingName) {
  return sections.get(sectionName)?.get(settingName)
}

function auditSupabaseAuthConfig() {
  const configPath = 'supabase/config.toml'
  if (!existsSync(configPath)) return

  const sections = parseTomlSections(readFileSync(configPath, 'utf8'))
  const authSignup = getTomlSetting(sections, 'auth', 'enable_signup')
  const emailSignup = getTomlSetting(sections, 'auth.email', 'enable_signup')
  const anonymousSignIns = getTomlSetting(sections, 'auth', 'enable_anonymous_sign_ins')
  const securePasswordChange = getTomlSetting(sections, 'auth.email', 'secure_password_change')

  if (authSignup !== 'false') {
    addFailure(configPath, 'public Auth signup must be disabled for production')
  }

  if (emailSignup !== 'false') {
    addFailure(configPath, 'public Email signup must be disabled for production')
  }

  if (anonymousSignIns !== 'false') {
    addFailure(configPath, 'anonymous sign-ins must be disabled for production')
  }

  if (securePasswordChange !== 'true') {
    addFailure(configPath, 'secure password change must require recent authentication')
  }
}

function auditEdgeFunctionContent(filePath, content) {
  if (!edgeFunctionPathPattern.test(filePath)) return

  if (/['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/i.test(content)) {
    addFailure(filePath, 'Edge Function wildcard CORS origin')
  }

  if (/allowedOrigins\.has\(\s*['"]\*['"]\s*\)/i.test(content)) {
    addFailure(filePath, 'Edge Function wildcard CORS allow-list')
  }

  if (
    content.includes('Access-Control-Allow-Origin') &&
    !/['"]Vary['"]\s*:\s*['"]Origin['"]/i.test(content)
  ) {
    addFailure(filePath, 'Edge Function CORS response missing Vary: Origin')
  }
}

function auditAuthSignupPosture(filePath, content) {
  if (!filePath.startsWith('src/') || !content.includes('signInWithOtp')) return
  if (/\.(?:test|spec)\./i.test(filePath)) return

  const otpCalls = content.match(/signInWithOtp\s*\([\s\S]{0,700}?\)/g) ?? []
  if (otpCalls.length === 0) {
    addFailure(filePath, 'magic-link signInWithOtp call requires manual security review')
    return
  }

  for (const call of otpCalls) {
    if (!/shouldCreateUser\s*:\s*false/.test(call)) {
      addFailure(filePath, 'magic-link signInWithOtp must set shouldCreateUser: false')
    }
  }
}

function auditTrackedPath(filePath) {
  for (const [pattern, reason] of forbiddenTrackedPathRules) {
    if (pattern.test(filePath)) addFailure(filePath, reason)
  }

  if (/\.(?:xlsx|png|jpg|jpeg|gif|webp|ico)$/i.test(filePath) && !allowedTrackedBinaryFiles.has(filePath)) {
    addFailure(filePath, 'unexpected tracked binary asset')
  }
}

function auditTextContent(filePath) {
  const content = readFileSync(filePath, 'utf8')

  for (const [pattern, reason] of forbiddenTextRules) {
    if (pattern.test(content)) addFailure(filePath, reason)
  }

  auditServiceRoleAssignments(filePath, content)
  auditJwtTokens(filePath, content)
  auditEdgeFunctionContent(filePath, content)
  auditAuthSignupPosture(filePath, content)
}

for (const filePath of listTrackedFiles()) {
  auditTrackedPath(filePath)

  if (!existsSync(filePath)) {
    addFailure(filePath, 'tracked file missing from working tree; stage or restore this deletion')
    continue
  }

  if (textExtensions.has(extname(filePath).toLowerCase())) {
    auditTextContent(filePath)
  }
}

for (const functionName of collectNoVerifyJwtFunctions()) {
  const functionPath = `supabase/functions/${functionName}/index.ts`

  if (!existsSync(functionPath)) {
    addFailure(functionPath, 'verify_jwt=false configured but function source is missing')
    continue
  }

  const content = readFileSync(functionPath, 'utf8')
  if (!/assertBearerAuthorization\s*\(/.test(content)) {
    addFailure(functionPath, 'verify_jwt=false requires explicit Bearer authorization validation')
  }

  if (!/auth\.getUser\s*\(/.test(content)) {
    addFailure(functionPath, 'verify_jwt=false requires server-side user token validation')
  }

  if (!/\b(?:is_global_admin|account_role|memberships)\b/.test(content)) {
    addFailure(functionPath, 'verify_jwt=false requires explicit role or membership authorization')
  }
}

auditSupabaseAuthConfig()

if (failures.length > 0) {
  console.error('[repository-security-audit] FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('[repository-security-audit] OK')
