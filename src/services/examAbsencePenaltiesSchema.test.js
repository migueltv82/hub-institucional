import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SUPABASE_DIR = join(ROOT, 'supabase')
const SCHEMA_PATH = join(SUPABASE_DIR, 'schema/08_exam_tables.sql')
const BASELINE_MANIFEST = join(SUPABASE_DIR, 'baseline/BASELINE_MANIFEST.md')
const BASELINE_READINESS = join(ROOT, 'docs/BASELINE_READINESS.md')
const CONTRACT_PATH = join(ROOT, 'docs/contracts/exam_absence_penalties.md')

function readText(filePath) {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
}

function walkFiles(root, predicate, acc = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, acc)
    } else if (predicate(fullPath)) {
      acc.push(fullPath)
    }
  }
  return acc
}

function allSqlFiles() {
  return walkFiles(SUPABASE_DIR, (filePath) => filePath.endsWith('.sql'))
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

describe('exam absence penalties canonical schema', () => {
  it('versiona la tabla canonica aprobada y conserva la RPC de inscripcion en el mismo bloque 08', () => {
    const source = readText(SCHEMA_PATH)
    const tableBlock = getCreateTableBlock(source, 'exam_absence_penalties')
    const sqlSource = allSqlFiles().map(readText).join('\n')

    expect(tableBlock).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.exam_absence_penalties/i)
    expect(tableBlock).toMatch(/id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i)
    expect(source).toMatch(/create\s+(?:or\s+replace\s+)?function\s+public\.upsert_exam_enrollment_from_portal\s*\(/i)
    expect(sqlSource.match(/create\s+(?:or\s+replace\s+)?function\s+public\.upsert_exam_enrollment_from_portal\s*\(/ig)).toHaveLength(1)
  })

  it('expone el DTO minimo contractual sin depender de snapshot ni metadata de usuario', () => {
    const source = readText(SCHEMA_PATH)
    const tableBlock = getCreateTableBlock(source, 'exam_absence_penalties')

    const expectedColumns = [
      'institution_id uuid not null',
      'workspace_key text not null',
      'student_record_id uuid not null',
      'student_id uuid',
      'student_career_plan_id uuid',
      'subject_id text not null',
      'program_id text not null',
      'source_exam_table_id uuid',
      'source_exam_table_subject_id uuid',
      'source_enrollment_id uuid',
      'source_exam_result_id uuid',
      'blocked_exam_table_id uuid',
      'blocked_exam_table_subject_id uuid',
      'blocked_exam_period_key text',
      'blocked_exam_call_key text',
      'absent_at timestamptz not null',
      'penalty_from timestamptz not null',
      'penalty_until timestamptz',
      'status text not null',
      'scope_type text not null',
      'reason_code text not null',
      'source text not null',
      'source_event_key text not null',
      'absence_semantic_key text not null',
      'metadata jsonb not null',
      'created_at timestamptz not null',
    ]

    for (const column of expectedColumns) {
      expect(tableBlock).toMatch(new RegExp(escapeRegExp(column).replace(/\\ /g, '\\s+'), 'i'))
    }

    expect(source).not.toMatch(/raw_user_meta_data|user_metadata/i)
  })

  it('cierra FKs tenant-safe contra legajo, mesas, materias, inscripcion fuente y plan', () => {
    const source = readText(SCHEMA_PATH)

    expectCompositeForeignKey(source, ['institution_id', 'student_record_id'], 'student_records', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'student_career_plan_id'], 'student_career_plans', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'source_exam_table_id'], 'exam_tables', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'source_exam_table_id', 'source_exam_table_subject_id'], 'exam_table_subjects', ['institution_id', 'exam_table_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'source_enrollment_id'], 'exam_enrollments', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'blocked_exam_table_id'], 'exam_tables', ['institution_id', 'id'])
    expectCompositeForeignKey(source, ['institution_id', 'blocked_exam_table_id', 'blocked_exam_table_subject_id'], 'exam_table_subjects', ['institution_id', 'exam_table_id', 'id'])

    expect(source).toContain('validate_exam_absence_penalty_integrity')
    expect(source).toMatch(/student_record\.profile_id\s*=\s*new\.student_id/i)
    expect(source).toMatch(/student_plan\.student_id\s*=\s*new\.student_record_id/i)
    expect(source).toMatch(/enrollment\.id\s*=\s*new\.source_enrollment_id/i)
  })

  it('codifica estados, scopes, fail-closed pending_review y checks temporales', () => {
    const source = readText(SCHEMA_PATH)

    expect(source).toMatch(/exam_absence_penalties_status_check[\s\S]*status\s+in\s*\(\s*'active'\s*,\s*'pending_review'\s*,\s*'fulfilled'\s*,\s*'voided'\s*,\s*'expired'\s*\)/i)
    expect(source).toMatch(/exam_absence_penalties_scope_type_check[\s\S]*scope_type\s+in\s*\(\s*'next_exam_call_for_subject'\s*,\s*'specific_exam_table_subject'\s*\)/i)
    expect(source).toMatch(/status\s+in\s*\(\s*'active'\s*,\s*'pending_review'\s*\)[\s\S]*scope_type\s*=\s*'next_exam_call_for_subject'/i)
    expect(source).toMatch(/status\s+in\s*\(\s*'active'\s*,\s*'pending_review'\s*\)[\s\S]*scope_type\s*=\s*'specific_exam_table_subject'/i)
    expect(source).toMatch(/penalty_until\s+is\s+null\s+or\s+penalty_until\s+>=\s+penalty_from/i)
    expect(source).toMatch(/status\s+<>\s+'fulfilled'\s+or\s+fulfilled_at\s+is\s+not\s+null/i)
    expect(source).toMatch(/status\s+<>\s+'voided'[\s\S]*voided_at\s+is\s+not\s+null[\s\S]*void_reason\s+is\s+not\s+null/i)
  })

  it('mantiene idempotencia estructural para evento, ausencia semantica y destino bloqueado', () => {
    const source = readText(SCHEMA_PATH)

    expect(source).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+exam_absence_penalties_source_event_key\s+on\s+public\.exam_absence_penalties\s*\(\s*institution_id\s*,\s*source_event_key\s*\)/i)
    expect(source).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+exam_absence_penalties_semantic_key\s+on\s+public\.exam_absence_penalties\s*\(\s*institution_id\s*,\s*absence_semantic_key\s*\)/i)
    expect(source).toMatch(/exam_absence_penalties_active_call_key[\s\S]*student_record_id[\s\S]*subject_id[\s\S]*program_id[\s\S]*blocked_exam_period_key[\s\S]*blocked_exam_call_key/i)
    expect(source).toMatch(/exam_absence_penalties_active_subject_key[\s\S]*student_record_id[\s\S]*subject_id[\s\S]*program_id[\s\S]*blocked_exam_table_subject_id/i)
    expect(source).toMatch(/idx_exam_absence_penalties_eligibility[\s\S]*student_record_id[\s\S]*subject_id[\s\S]*program_id[\s\S]*status[\s\S]*penalty_from[\s\S]*penalty_until/i)
  })

  it('habilita RLS default-deny sin grants directos inseguros', () => {
    const source = readText(SCHEMA_PATH)
    const grantSelectBlock = source.match(/grant\s+select\s+on[\s\S]*?to\s+authenticated\s*;/i)?.[0] ?? ''

    expect(source).toMatch(/alter\s+table\s+public\.exam_absence_penalties\s+enable\s+row\s+level\s+security/i)
    expect(source).toMatch(/revoke\s+all\s+on[\s\S]*public\.exam_absence_penalties[\s\S]*from\s+public,\s*anon,\s*authenticated/i)
    expect(grantSelectBlock).not.toContain('public.exam_absence_penalties')
    expect(source).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*public\.exam_absence_penalties[\s\S]*to\s+(?:public|anon|authenticated)/i)
    expect(source).toMatch(/revoke\s+execute\s+on\s+function\s+public\.validate_exam_absence_penalty_integrity\s*\(\s*\)\s+from\s+public,\s*anon,\s*authenticated/i)
  })

  it('mantiene alineada la documentacion de contrato y baseline local', () => {
    const contract = readText(CONTRACT_PATH)
    const manifest = readText(BASELINE_MANIFEST)
    const readiness = readText(BASELINE_READINESS)

    expect(contract).toContain('exam_absence_penalties')
    expect(manifest).toContain('exam_absence_penalties')
    expect(readiness).toContain('exam_absence_penalties')
    expect(manifest).toContain('`supabase/schema/08_exam_tables.sql` | CANONICAL | Mesas de examen')
    expect(readiness).toContain('implementado localmente como `public.exam_absence_penalties` en `supabase/schema/08_exam_tables.sql`')
  })
})
