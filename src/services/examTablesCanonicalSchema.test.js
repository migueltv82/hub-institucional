import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SUPABASE_DIR = join(ROOT, 'supabase')
const SCHEMA_DIR = join(SUPABASE_DIR, 'schema')
const CONTRACT_PATH = join(ROOT, 'docs/contracts/exam_tables_canonical_model.md')
const EXAM_TABLES_SCHEMA = join(SCHEMA_DIR, '08_exam_tables.sql')
const STUDENT_PORTAL_SNAPSHOT_SCHEMA = join(SCHEMA_DIR, '05_student_portal_secure_read.sql')

const canonicalTables = [
  'exam_tables',
  'exam_table_subjects',
  'exam_teacher_assignments',
  'exam_enrollments',
  'exam_enrollment_events',
  'exam_table_events',
]

function readText(filePath) {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
}

function allSqlFiles() {
  return readdirSync(SUPABASE_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => join(entry.parentPath, entry.name))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getCreateTableBlock(source, tableName) {
  const pattern = new RegExp(
    `create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${escapeRegExp(tableName)}\\s*\\([\\s\\S]*?\\n\\);`,
    'i',
  )
  return source.match(pattern)?.[0] ?? ''
}

function expectCompositeForeignKey(source, columns, targetTable, targetColumns) {
  const from = columns.map(escapeRegExp).join('\\s*,\\s*')
  const to = targetColumns.map(escapeRegExp).join('\\s*,\\s*')
  expect(source).toMatch(new RegExp(`foreign\\s+key\\s*\\(\\s*${from}\\s*\\)\\s+references\\s+public\\.${escapeRegExp(targetTable)}\\s*\\(\\s*${to}\\s*\\)`, 'i'))
}

describe('canonical exam tables schema', () => {
  it('vincula asignaciones pendientes al ID legacy de la mesa sin cruzar tenant', () => {
    const snapshot = readText(STUDENT_PORTAL_SNAPSHOT_SCHEMA)
    const table = getCreateTableBlock(readText(EXAM_TABLES_SCHEMA), 'exam_tables')

    expect(table).toMatch(/legacy_exam_table_id\s+text/i)
    expect(snapshot).toMatch(/and\s+exists\s*\(\s*select\s+1\s+from\s+public\.exam_tables\s+mapped_table/i)
    expect(snapshot).toContain('mapped_table.institution_id = target_institution_id')
    expect(snapshot).toContain('mapped_table.workspace_key = normalized_workspace_key')
    expect(snapshot).toContain('lower(mapped_table.legacy_exam_table_id)')
    expect(snapshot).toMatch(/from\s+public\.exam_tables\s+mapped_table[\s\S]*?regexp_replace\([\s\S]*?\)\s*<>\s*''/i)
    expect(snapshot).toMatch(/from\s+public\.exam_teacher_assignments\s+assignment\s+join\s+public\.exam_tables\s+exam_table/i)
    expect(snapshot).toContain('exam_table.institution_id = assignment.institution_id')
    expect(snapshot).toContain('exam_table.workspace_key = assignment.workspace_key')
    expect(snapshot).toContain('exam_table.id = assignment.exam_table_id')
    expect(snapshot).toContain('lower(exam_table.legacy_exam_table_id)')
    expect(snapshot).toContain("assignment.confirmation_status <> 'confirmed'")
    expect(snapshot).not.toContain('assignment.deleted_at')
  })

  it('ubica el bloque canonico de mesas en schema numerado, no en repairs', () => {
    expect(existsSync(EXAM_TABLES_SCHEMA)).toBe(true)

    const schemaSource = readText(EXAM_TABLES_SCHEMA)
    expect(schemaSource).toContain('HUB-INSTITUCIONAL - EXAM TABLES CANONICAL SCHEMA')

    for (const tableName of canonicalTables) {
      expect(schemaSource).toMatch(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${tableName}\\b`, 'i'))
    }

    const repairFilesWithCanonicalTables = allSqlFiles()
      .filter((filePath) => filePath.includes(`${join('supabase', 'docs')}`))
      .filter((filePath) => {
        const source = readText(filePath)
        return canonicalTables.some((tableName) => new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${tableName}\\b`, 'i').test(source))
      })
      .map((filePath) => filePath.replace(ROOT, ''))

    expect(repairFilesWithCanonicalTables).toEqual([
      '\\supabase\\docs\\repair_06_exam_teacher_assignments.sql',
    ])
  })

  it('implementa las columnas contractuales y estados permitidos sin ampliar vocabularios', () => {
    const source = readText(EXAM_TABLES_SCHEMA)

    expect(getCreateTableBlock(source, 'exam_tables')).toMatch(/primary_career_id\s+uuid/i)
    expect(getCreateTableBlock(source, 'exam_tables')).toMatch(/primary_study_plan_id\s+uuid/i)
    expect(getCreateTableBlock(source, 'exam_table_subjects')).toMatch(/career_id\s+uuid\s+not\s+null/i)
    expect(getCreateTableBlock(source, 'exam_table_subjects')).toMatch(/study_plan_id\s+uuid/i)
    expect(getCreateTableBlock(source, 'exam_teacher_assignments')).toMatch(/exam_table_subject_id\s+uuid/i)
    expect(getCreateTableBlock(source, 'exam_teacher_assignments')).toMatch(/teacher_id\s+uuid/i)
    expect(getCreateTableBlock(source, 'exam_enrollments')).toMatch(/subject_id\s+text\s+not\s+null/i)
    expect(getCreateTableBlock(source, 'exam_enrollments')).toMatch(/program_id\s+text\s+not\s+null/i)
    expect(getCreateTableBlock(source, 'exam_enrollments')).toMatch(/deleted_at\s+timestamptz/i)

    expect(source).toMatch(/exam_tables_status_check[\s\S]*status\s+in\s*\(\s*'draft'\s*,\s*'teacher_review'\s*,\s*'confirmed'\s*,\s*'open'\s*,\s*'closed'\s*,\s*'cancelled'\s*,\s*'completed'\s*\)/i)
    expect(source).toMatch(/exam_enrollments_status_check[\s\S]*status\s+in\s*\(\s*'registered'\s*,\s*'cancelled'\s*\)/i)
    expect(source).toMatch(/exam_teacher_assignments_role_check[\s\S]*role\s+in\s*\(\s*'TITULAR'\s*,\s*'VOCAL_1'\s*,\s*'VOCAL_2'\s*,\s*'TRIBUNAL_CRUZADO'\s*\)/i)
  })

  it('cierra integridad multi-tenant con FKs compuestas y validadores estructurales', () => {
    const source = readText(EXAM_TABLES_SCHEMA)

    expectCompositeForeignKey(source, ['institution_id', 'primary_career_id'], 'careers', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'primary_study_plan_id'], 'study_plans', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'exam_table_id'], 'exam_tables', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'career_id'], 'careers', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'study_plan_id'], 'study_plans', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'study_plan_subject_id'], 'study_plan_subjects', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'subject_id'], 'subjects', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'exam_table_id', 'exam_table_subject_id'], 'exam_table_subjects', ['institution_id', 'exam_table_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'student_record_id'], 'student_records', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'student_career_plan_id'], 'student_career_plans', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'teacher_record_id'], 'teacher_records', ['institution_id', 'id'])

    expect(source).toContain('validate_exam_table_subject_integrity')
    expect(source).toContain('validate_exam_enrollment_integrity')
    expect(source).toContain('study_plan_subject_id')
    expect(source).toContain('student_career_plan_id')
  })

  it('define idempotencia estructural e indices canonicos sin consolidar la llave legacy textual', () => {
    const source = readText(EXAM_TABLES_SCHEMA)

    expect(source).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+exam_enrollments_registered_identity_key\s+on\s+public\.exam_enrollments\s*\(\s*institution_id\s*,\s*exam_table_subject_id\s*,\s*student_record_id\s*\)\s+where\s+status\s*=\s*'registered'/i)
    expect(source).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+exam_enrollments_client_mutation_key\s+on\s+public\.exam_enrollments\s*\(\s*institution_id\s*,\s*student_id\s*,\s*client_mutation_id\s*\)\s+where\s+client_mutation_id\s+is\s+not\s+null/i)
    expect(source).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+exam_tables_legacy_exam_table_key\s+on\s+public\.exam_tables\s*\(\s*institution_id\s*,\s*workspace_key\s*,\s*legacy_exam_table_id\s*\)\s+where\s+legacy_exam_table_id\s+is\s+not\s+null/i)
    expect(source).not.toMatch(/exam_enrollments.*exam_table_id\s+text/i)
  })

  it('habilita RLS default-deny y evita grants inseguros', () => {
    const source = readText(EXAM_TABLES_SCHEMA)

    for (const tableName of canonicalTables) {
      expect(source).toMatch(new RegExp(`alter\\s+table\\s+public\\.${tableName}\\s+enable\\s+row\\s+level\\s+security`, 'i'))
    }

    expect(source).toMatch(/revoke\s+all\s+on\s+public\.exam_tables[\s\S]*from\s+public,\s*anon,\s*authenticated/i)
    expect(source).toMatch(/grant\s+select\s+on[\s\S]*public\.exam_tables[\s\S]*to\s+authenticated/i)
    expect(source).not.toMatch(/grant\s+(?:insert|update|delete|all)[\s\S]*public\.exam_(?:tables|table_subjects|teacher_assignments|enrollments|enrollment_events|table_events)[\s\S]*to\s+(?:public|anon|authenticated)/i)
    expect(source).not.toMatch(/create\s+policy[\s\S]*members\s+read[\s\S]*exam_(?:tables|table_subjects|teacher_assignments|enrollments|enrollment_events|table_events)/i)
  })

  it('limita SELECT docente a identidad, membership y legajo del tenant/workspace', () => {
    const source = readText(EXAM_TABLES_SCHEMA)
    const policy = source.split('-- BEGIN teacher assignment SELECT policy')[1].split('-- END teacher assignment SELECT policy')[0]
    expect(policy).toContain('CREATE POLICY "exam_teacher_assignments teacher read own"')
    expect(policy).toMatch(/AS PERMISSIVE\s+FOR SELECT\s+TO authenticated/)
    for (const predicate of [
      'teacher_id = (SELECT auth.uid())',
      'public.is_member_of_institution(institution_id)',
      'institution.id = exam_teacher_assignments.institution_id',
      "institution.status = 'active'",
      'teacher.id = exam_teacher_assignments.teacher_record_id',
      'teacher.institution_id = exam_teacher_assignments.institution_id',
      'teacher.workspace_key = exam_teacher_assignments.workspace_key',
      'teacher.profile_id = exam_teacher_assignments.teacher_id',
      'profile.user_id = (SELECT auth.uid())',
      "profile.account_role = 'docente'",
      'profile.is_blocked = false',
    ]) expect(policy).toContain(predicate)
    expect(policy).not.toMatch(/is_super_admin|SECURITY DEFINER|GRANT|FOR (INSERT|UPDATE|DELETE|ALL)/i)
    expect(policy).not.toMatch(/(?:assignment|assignments)\.status|\bAND status\s*=/i)
  })

  it('mantiene upsert_exam_enrollment_from_portal en el bloque canonico 08 sin duplicados', () => {
    const functionPattern = /create\s+(?:or\s+replace\s+)?function\s+public\.upsert_exam_enrollment_from_portal\s*\(/i
    const filesWithRpc = allSqlFiles()
      .filter((filePath) => functionPattern.test(readText(filePath)))
      .map((filePath) => filePath.replace(ROOT, ''))

    expect(filesWithRpc).toEqual(['\\supabase\\schema\\08_exam_tables.sql'])
  })

  it('mantiene compatibilidad contractual con el documento aprobado', () => {
    const contract = readText(CONTRACT_PATH)
    const source = readText(EXAM_TABLES_SCHEMA)

    for (const tableName of canonicalTables) {
      expect(contract).toContain(tableName)
      expect(source).toContain(`public.${tableName}`)
    }

    expect(source).toContain('TRIBUNAL_CRUZADO')
    expect(source).toContain('exam_table_subject_id')
    expect(source).toContain('client_request_hash')
    expect(source).toContain('REMOTE MUTATIONS: NONE')
  })
})
