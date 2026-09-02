import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildExamEngineShadowAudit,
  buildSafeExamEngineShadowAuditJson,
  renderExamEngineShadowAuditMarkdown,
} from '../src/utils/examEngine/audit/buildExamEngineShadowAudit.js'
import { sha256Hex } from '../src/utils/examEngine/adminReviewPromotionWorkflow.js'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const SCRIPT_DIR = dirname(SCRIPT_PATH)
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_REPORT_DIRECTORY = resolve(REPO_ROOT, 'docs', 'shadow-audits')

const VALUE_FLAGS = new Set(['--snapshot', '--career', '--callNumber', '--output'])
const BOOLEAN_FLAGS = new Set(['--anonymize', '--strict', '--no-write'])

function clean(value) {
  return String(value ?? '').trim()
}

function safeTimestamp(value) {
  return clean(value).replaceAll(/[:.]/g, '').replace('T', '_').replace('Z', '')
}

export function parseShadowAuditArguments(argv = []) {
  const options = {
    snapshot: '',
    career: '',
    callNumber: 1,
    anonymize: false,
    output: '',
    strict: false,
    noWrite: true,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (BOOLEAN_FLAGS.has(argument)) {
      if (argument === '--anonymize') options.anonymize = true
      if (argument === '--strict') options.strict = true
      if (argument === '--no-write') options.noWrite = true
      continue
    }
    if (!VALUE_FLAGS.has(argument)) throw new Error(`SHADOW_AUDIT_UNKNOWN_ARGUMENT:${argument}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`SHADOW_AUDIT_ARGUMENT_VALUE_REQUIRED:${argument}`)
    index += 1
    if (argument === '--snapshot') options.snapshot = value
    if (argument === '--career') options.career = value
    if (argument === '--callNumber') options.callNumber = Number(value)
    if (argument === '--output') options.output = value
  }

  if (!options.snapshot) throw new Error('SHADOW_AUDIT_SNAPSHOT_ARGUMENT_REQUIRED')
  if (![1, 2].includes(options.callNumber)) throw new Error('SHADOW_AUDIT_CALL_NUMBER_INVALID')
  if (options.noWrite !== true) throw new Error('SHADOW_AUDIT_NO_WRITE_REQUIRED')
  return options
}

function extractSnapshot(parsed) {
  if (parsed?.snapshot && typeof parsed.snapshot === 'object' && !Array.isArray(parsed.snapshot)) {
    return parsed.snapshot
  }
  if (parsed?.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)) {
    return parsed.payload
  }
  return parsed
}

function assertLocalJsonInput(filePath, fsApi) {
  if (!clean(filePath) || clean(filePath).includes('://')) throw new Error('SHADOW_AUDIT_LOCAL_SNAPSHOT_REQUIRED')
  if (extname(filePath).toLowerCase() !== '.json') throw new Error('SHADOW_AUDIT_SNAPSHOT_MUST_BE_JSON')
  if (!fsApi.existsSync(filePath)) throw new Error(`SHADOW_AUDIT_SNAPSHOT_NOT_FOUND:${filePath}`)
}

function assertSafeOutputPath({ inputPath, outputPath, expectedExtension }) {
  if (!outputPath) return
  if (resolve(outputPath) === resolve(inputPath)) throw new Error('SHADOW_AUDIT_OUTPUT_CANNOT_REPLACE_SNAPSHOT')
  if (extname(outputPath).toLowerCase() !== expectedExtension) {
    throw new Error(`SHADOW_AUDIT_OUTPUT_EXTENSION_REQUIRED:${expectedExtension}`)
  }
}

function buildDefaultMarkdownPath(now) {
  return resolve(
    DEFAULT_REPORT_DIRECTORY,
    `EXAM_ENGINE_SHADOW_AUDIT_${safeTimestamp(now)}.md`,
  )
}

function writeArtifact(filePath, content, fsApi) {
  fsApi.mkdirSync(dirname(filePath), { recursive: true })
  fsApi.writeFileSync(filePath, content, 'utf8')
}

export function runExamEngineShadowAuditCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  now = () => new Date().toISOString(),
  fsApi = { existsSync, mkdirSync, readFileSync, writeFileSync },
  writeReports = true,
} = {}) {
  const options = parseShadowAuditArguments(argv)
  const snapshotPath = resolve(cwd, options.snapshot)
  const generatedAt = now()
  const markdownPath = buildDefaultMarkdownPath(generatedAt)
  const jsonPath = options.output ? resolve(cwd, options.output) : ''
  assertLocalJsonInput(snapshotPath, fsApi)
  assertSafeOutputPath({ inputPath: snapshotPath, outputPath: markdownPath, expectedExtension: '.md' })
  assertSafeOutputPath({ inputPath: snapshotPath, outputPath: jsonPath, expectedExtension: '.json' })

  const originalFileContent = fsApi.readFileSync(snapshotPath, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(originalFileContent)
  } catch {
    throw new Error('SHADOW_AUDIT_SNAPSHOT_JSON_INVALID')
  }
  const snapshot = extractSnapshot(parsed)
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('SHADOW_AUDIT_SNAPSHOT_PAYLOAD_INVALID')
  }

  const audit = buildExamEngineShadowAudit({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    options: {
      anonymize: options.anonymize,
      callNumber: options.callNumber,
      career: options.career,
      strict: options.strict,
      now: () => generatedAt,
    },
  })
  const markdown = renderExamEngineShadowAuditMarkdown(audit)
  const safeJson = buildSafeExamEngineShadowAuditJson(audit)

  if (writeReports) {
    writeArtifact(markdownPath, `${markdown.trim()}\n`, fsApi)
    if (jsonPath) writeArtifact(jsonPath, `${JSON.stringify(safeJson, null, 2)}\n`, fsApi)
  }

  const finalFileContent = fsApi.readFileSync(snapshotPath, 'utf8')
  const sourceFileUnchanged = sha256Hex(originalFileContent) === sha256Hex(finalFileContent)
  if (!sourceFileUnchanged) throw new Error('SHADOW_AUDIT_SOURCE_FILE_CHANGED')

  const summary = {
    ok: audit.conclusion.safeForShadowAudit && (!options.strict || audit.conclusion.status === 'READY'),
    mode: audit.mode,
    sourceFileUnchanged,
    snapshotUnchanged: audit.safety.snapshotUnchanged,
    officialScheduleUnchanged: audit.safety.officialScheduleUnchanged,
    supabaseUsed: false,
    persistencePerformed: false,
    anonymized: audit.anonymized,
    conclusion: audit.conclusion.status,
    counts: {
      expectedSubjects: audit.expectedUniverse.count,
      generatedSubjects: audit.generated.count,
      omittedSubjects: audit.gaps.omitted.length,
      hardRuleViolations: audit.hardRules.total,
    },
    outputs: {
      markdown: writeReports ? markdownPath : null,
      json: writeReports && jsonPath ? jsonPath : null,
    },
  }

  return { audit, markdown, safeJson, summary }
}

function printFailure(error) {
  const message = error instanceof Error ? error.message : 'SHADOW_AUDIT_UNKNOWN_ERROR'
  console.error(JSON.stringify({
    ok: false,
    mode: 'READ_ONLY_SHADOW_AUDIT',
    message,
    supabaseUsed: false,
    persistencePerformed: false,
  }, null, 2))
}

function main() {
  try {
    const result = runExamEngineShadowAuditCli()
    console.log(JSON.stringify(result.summary, null, 2))
    if (!result.summary.ok) process.exitCode = 2
  } catch (error) {
    printFailure(error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) main()

