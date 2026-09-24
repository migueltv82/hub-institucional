import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = join(process.cwd(), 'src')

const SENSITIVE_ACADEMIC_TABLES = [
  'student_grades',
  'subject_attendance_records',
  'subject_class_sessions',
]

const PORTAL_WRITE_PROTECTED_PREFIXES = [
  'src/modules/alumnos/',
  'src/modules/docentes/',
]

const PORTAL_WRITE_PROTECTED_FILES = new Set([
  'src/services/studentGrades.js',
  'src/services/subjectAttendance.js',
])

const ALLOWED_DIRECT_WRITE_FILES = new Set([
  // Admin/institution workspace synchronization and reviewed admin commands.
  'src/services/deletedPersonRecords.js',
  'src/services/examTeacherAssignments.js',
  'src/services/examEngineV21State.js',
  'src/services/legacyExamSessions.js',
  'src/services/legacySyncCommon.js',
  'src/services/rosterRecords.js',
  // Public feature switch only; app_settings RLS requires a superadmin to write.
  'src/services/relationalExamPreview.js',
  'src/services/sourceFiles.js',
  'src/services/studentFinancialStatus.js',
  'src/services/subjectEnrollments.js',
  'src/services/subjectTeacherAssignments.js',
  'src/services/superAdmin.js',
  'src/services/teacherAcademicRecords.js',
  'src/services/workspaceSnapshot.js',
])

const ALLOWED_SENSITIVE_DIRECT_WRITE_FILES = new Set([
  'src/services/workspaceSnapshot.js',
])

const ALLOWED_JSX_SUPABASE_CLIENT_FILES = new Set([
  'src/auth/AuthContext.jsx',
])

function toRepoPath(filePath) {
  return relative(process.cwd(), filePath).replaceAll('\\', '/')
}

function listSourceFiles(dir = SRC_DIR) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) return listSourceFiles(fullPath)
    if (!/\.[cm]?[jt]sx?$/.test(entry)) return []
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry)) return []
    return [fullPath]
  })
}

function hasDirectDatabaseWrite(source) {
  return /\.from\([\s\S]{0,220}?\)[\s\S]{0,260}?\.(?:insert|update|upsert|delete)\s*\(/.test(source)
}

function hasDirectStorageWrite(source) {
  return /\.storage[\s\S]{0,80}?\.from\([\s\S]{0,140}?\)[\s\S]{0,260}?\.(?:upload|remove)\s*\(/.test(source)
}

function mentionsSensitiveAcademicTable(source) {
  return SENSITIVE_ACADEMIC_TABLES.some((table) => (
    source.includes(`'${table}'`)
    || source.includes(`"${table}"`)
    || source.includes(`\`${table}\``)
  ))
}

function hasSupabaseClientImport(source) {
  return (
    /import\s*\{[^}]*\bsupabase\b[^}]*\}\s*from\s*['"][^'"]*\/lib\/supabase(?:Client)?(?:\.js)?['"]/.test(source)
    || /from\s*['"]@supabase\/supabase-js['"]/.test(source)
  )
}

function usesSupabaseClient(source) {
  return /\bsupabase\.(?:auth|from|rpc|functions|storage|channel|removeChannel|realtime)\b/.test(source)
}

describe('frontend Supabase write posture', () => {
  it('mantiene el cliente Supabase fuera de JSX de UI', () => {
    const offenders = listSourceFiles()
      .filter((filePath) => filePath.endsWith('.jsx'))
      .map((filePath) => ({ filePath, source: readFileSync(filePath, 'utf8') }))
      .filter(({ source }) => hasSupabaseClientImport(source) || usesSupabaseClient(source))
      .map(({ filePath }) => toRepoPath(filePath))
      .filter((filePath) => !ALLOWED_JSX_SUPABASE_CLIENT_FILES.has(filePath))

    expect(offenders).toEqual([])
  })

  it('mantiene una allowlist explicita de escrituras directas desde el cliente', () => {
    const offenders = listSourceFiles()
      .map((filePath) => ({ filePath, source: readFileSync(filePath, 'utf8') }))
      .filter(({ source }) => hasDirectDatabaseWrite(source) || hasDirectStorageWrite(source))
      .map(({ filePath }) => toRepoPath(filePath))
      .filter((filePath) => !ALLOWED_DIRECT_WRITE_FILES.has(filePath))

    expect(offenders).toEqual([])
  })

  it('no permite escrituras directas desde los portales alumno/docente', () => {
    const offenders = listSourceFiles()
      .map((filePath) => ({ filePath, source: readFileSync(filePath, 'utf8') }))
      .filter(({ source }) => hasDirectDatabaseWrite(source) || hasDirectStorageWrite(source))
      .map(({ filePath }) => toRepoPath(filePath))
      .filter((filePath) => (
        PORTAL_WRITE_PROTECTED_FILES.has(filePath)
        || PORTAL_WRITE_PROTECTED_PREFIXES.some((prefix) => filePath.startsWith(prefix))
      ))

    expect(offenders).toEqual([])
  })

  it('no permite reintroducir escrituras directas a notas o asistencia', () => {
    const offenders = listSourceFiles()
      .map((filePath) => ({ filePath, source: readFileSync(filePath, 'utf8') }))
      .filter(({ source }) => mentionsSensitiveAcademicTable(source) && hasDirectDatabaseWrite(source))
      .map(({ filePath }) => toRepoPath(filePath))
      .filter((filePath) => !ALLOWED_SENSITIVE_DIRECT_WRITE_FILES.has(filePath))

    expect(offenders).toEqual([])
  })
})
