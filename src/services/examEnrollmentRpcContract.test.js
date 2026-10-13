import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const EXAM_SCHEMA = join(ROOT, 'supabase/schema/08_exam_tables.sql')
const STUDENT_PORTAL_READ_SCHEMA = join(ROOT, 'supabase/schema/05_student_portal_secure_read.sql')
const UPSERT_CONTRACT = join(ROOT, 'docs/contracts/upsert_exam_enrollment_from_portal.md')
const ABSENCE_CONTRACT = join(ROOT, 'docs/contracts/exam_absence_penalties.md')

function readText(filePath) {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getFunctionBlock(source, functionName) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${escapeRegExp(functionName)}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    'i',
  )
  return source.match(pattern)?.[0] ?? ''
}

describe('upsert_exam_enrollment_from_portal RPC contract', () => {
  it('la lectura segura muestra solo inscripciones de examen registradas del alumno', () => {
    const source = readText(STUDENT_PORTAL_READ_SCHEMA)
    const examRead = source.match(/from public\.exam_enrollments exam_enrollment[\s\S]*?\), '\[\]'::jsonb\)/i)?.[0] ?? ''

    expect(examRead).toMatch(/exam_enrollment\.student_id\s*=\s*caller_id/i)
    expect(examRead).toMatch(/exam_enrollment\.status\s*=\s*'registered'/i)
    expect(examRead).not.toMatch(/exam_enrollment\.status\s+in\s*\('active',\s*'enrolled'\)/i)
  })

  it('versiona la firma canonica de 14 parametros y DTO relacional', () => {
    const source = readText(EXAM_SCHEMA)
    const block = getFunctionBlock(source, 'upsert_exam_enrollment_from_portal')

    expect(block).toMatch(/create\s+or\s+replace\s+function\s+public\.upsert_exam_enrollment_from_portal\s*\(/i)
    expect(block).toMatch(/target_institution_id\s+uuid/i)
    expect(block).toMatch(/target_workspace_key\s+text/i)
    expect(block).toMatch(/actor_user_id\s+uuid/i)
    expect(block).toMatch(/target_student_id\s+uuid/i)
    expect(block).toMatch(/target_student_record_id\s+uuid\s+default\s+null/i)
    expect(block).toMatch(/target_exam_table_id\s+text/i)
    expect(block).toMatch(/target_subject_id\s+text\s+default\s+null/i)
    expect(block).toMatch(/target_program_id\s+text\s+default\s+null/i)
    expect(block).toMatch(/target_status\s+text\s+default\s+'registered'/i)
    expect(block).toMatch(/target_enrolled_at\s+timestamptz\s+default\s+null/i)
    expect(block).toMatch(/target_cancelled_at\s+timestamptz\s+default\s+null/i)
    expect(block).toMatch(/target_legacy_snapshot_id\s+text\s+default\s+null/i)
    expect(block).toMatch(/target_client_mutation_id\s+text\s+default\s+null/i)
    expect(block).toMatch(/target_metadata\s+jsonb\s+default\s+'\{\}'::jsonb/i)
    expect(block).toMatch(/returns\s+public\.exam_enrollments/i)
  })

  it('usa SECURITY DEFINER solo con hardening explicito y auth.uid obligatorio', () => {
    const source = readText(EXAM_SCHEMA)
    const block = getFunctionBlock(source, 'upsert_exam_enrollment_from_portal')

    expect(block).toMatch(/security\s+definer/i)
    expect(block).toMatch(/set\s+search_path\s*=\s*''/i)
    expect(block).toContain('(select auth.uid())')
    expect(block).toMatch(/authenticated_user_id\s+is\s+null/i)
    expect(block).toMatch(/authenticated_user_id\s+<>\s+actor_user_id/i)
    expect(block).not.toMatch(/raw_user_meta_data|user_metadata|account_role.*raw/i)
    expect(source).toMatch(/revoke\s+execute\s+on\s+function\s+public\.upsert_exam_enrollment_from_portal\s*\([^;]*\)\s+from\s+public,\s*anon,\s*authenticated/i)
    expect(source).toMatch(/grant\s+execute\s+on\s+function\s+public\.upsert_exam_enrollment_from_portal\s*\([^;]*\)\s+to\s+authenticated/i)
    expect(source).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.upsert_exam_enrollment_from_portal\s*\([^;]*\)\s+to\s+(?:public|anon|service_role)/i)
  })

  it('aplica auth, tenant isolation y vinculo alumno-legajo sin confiar en el caller', () => {
    const block = getFunctionBlock(readText(EXAM_SCHEMA), 'upsert_exam_enrollment_from_portal')

    expect(block).toMatch(/actor_user_id\s+<>\s+target_student_id/i)
    expect(block).toContain('from public.profiles profile')
    expect(block).toContain('join public.memberships membership')
    expect(block).toMatch(/profile\.is_blocked\s*=\s*false/i)
    expect(block).toMatch(/profile\.account_role\s+in\s+\('alumno',\s*'student'\)/i)
    expect(block).toContain('from public.student_records student_record')
    expect(block).toMatch(/student_record\.profile_id\s*=\s*target_student_id/i)
    expect(block).toMatch(/student_record\.institution_id\s*=\s*target_institution_id/i)
    expect(block).toMatch(/student_record\.workspace_key\s*=\s*clean_workspace_key/i)
  })

  it('valida mesa canonica, materia/carrera exacta y bloquea mesas no autoinscribibles', () => {
    const block = getFunctionBlock(readText(EXAM_SCHEMA), 'upsert_exam_enrollment_from_portal')

    expect(block).toContain('from public.exam_tables exam_table')
    expect(block).toContain('join public.exam_table_subjects table_subject')
    expect(block).toContain('join public.subjects subject')
    expect(block).toContain('join public.careers career')
    expect(block).toMatch(/exam_table\.status\s+in\s+\('confirmed',\s*'open'\)/i)
    expect(block).toMatch(/exam_table\.exam_type\s+<>\s+'special'/i)
    expect(block).toMatch(/exam_table\.metadata\s*->>\s*'inscription_mode'/i)
    expect(block).toMatch(/subject\.code\s*=\s*clean_subject_id/i)
    expect(block).toMatch(/career\.name\s*=\s*clean_program_id\s+or\s+career\.external_code\s*=\s*clean_program_id/i)
  })

  it('revalida mesa y ventana bajo lock despues de esperar, antes del replay o escritura', () => {
    const block = getFunctionBlock(readText(EXAM_SCHEMA), 'upsert_exam_enrollment_from_portal')
    const afterLock = block.slice(block.indexOf('perform pg_catalog.pg_advisory_xact_lock'))
    const guard = afterLock.slice(0, afterLock.indexOf('if clean_client_mutation_id is not null'))

    expect(guard).toMatch(/into\s+locked_exam_table[\s\S]*exam_table\.id\s*=\s*exam_context\.exam_table_id/i)
    expect(guard).toMatch(/exam_table\.institution_id\s*=\s*target_institution_id/i)
    expect(guard).toMatch(/exam_table\.workspace_key\s*=\s*clean_workspace_key/i)
    expect(guard).toMatch(/for\s+share;[\s\S]*if\s+not\s+found/i)
    expect(guard).toMatch(/locked_exam_table\.status\s+not\s+in\s*\('confirmed',\s*'open'\)/i)
    expect(guard).toContain("raise exception 'EXAM_TABLE_NOT_AVAILABLE'")
    expect(guard).toContain('revalidation_time := pg_catalog.clock_timestamp()')
    expect(guard).toContain('revalidation_time < locked_exam_table.enrollment_opens_at')
    expect(guard).toContain('revalidation_time > locked_exam_table.enrollment_closes_at')
    expect(guard).toContain("raise exception 'EXAM_ENROLLMENT_WINDOW_CLOSED'")
    expect(guard).not.toMatch(/insert\s+into\s+public\.exam_enrollments/i)
  })

  it('aplica regularidad, deuda, ausencia y correlativas en modo fail-closed', () => {
    const block = getFunctionBlock(readText(EXAM_SCHEMA), 'upsert_exam_enrollment_from_portal')

    expect(block).toContain('from public.student_grades grade')
    expect(block).toMatch(/grade\.academic_status\s*<>\s+'pending'/i)
    expect(block).toMatch(/latest_academic_status\s+is\s+distinct\s+from\s+'regular'/i)
    expect(block).toContain('from public.student_financial_status financial_status')
    expect(block).toMatch(/financial_status\.adeuda_cuota\s*=\s*true/i)
    expect(block).toContain('from public.exam_absence_penalties penalty')
    expect(block).toContain('BLOCKED_BY_ABSENCE_PENALTY')
    expect(block).toContain('from public.subject_prerequisites prerequisite')
    expect(block).toContain('left join lateral')
    expect(block).toMatch(/prerequisite\.target_plan_subject_id\s*=\s*exam_context\.study_plan_subject_id/i)
    expect(block).toMatch(/prerequisite\.status\s*=\s*'active'/i)
    expect(block).toMatch(/prerequisite\.applies_to\s+in\s+\('exam',\s*'enrollment_and_exam'\)/i)
    expect(block).toMatch(/latest_prerequisite_grade\.academic_status\s+not\s+in\s+\('approved',\s*'promocionado'\)/i)
    expect(block).toContain('EXAM_PREREQUISITES_NOT_MET')
    expect(block).not.toContain('EXAM_PREREQUISITES_SOURCE_NOT_AVAILABLE')
  })

  it('garantiza atomicidad, idempotencia, concurrencia y eventos append-only', () => {
    const block = getFunctionBlock(readText(EXAM_SCHEMA), 'upsert_exam_enrollment_from_portal')

    expect(block).toContain('pg_advisory_xact_lock')
    expect(block).toMatch(/select\s+\*\s+into\s+saved_row[\s\S]*for\s+update/i)
    expect(block).toMatch(/insert\s+into\s+public\.exam_enrollments/i)
    expect(block).toMatch(/on\s+conflict\s*\(\s*institution_id\s*,\s*exam_table_subject_id\s*,\s*student_record_id\s*\)\s+where\s+status\s*=\s*'registered'/i)
    expect(block).toMatch(/status\s*=\s*'cancelled'/i)
    expect(block).toMatch(/insert\s+into\s+public\.exam_enrollment_events/i)
    expect(block).toMatch(/event_type[\s\S]*clean_status/i)
    expect(block).toMatch(/lock_version\s*=\s*public\.exam_enrollments\.lock_version\s*\+\s*1/i)
  })

  it('mantiene alineados los contratos documentales relevantes', () => {
    const upsertContract = readText(UPSERT_CONTRACT)
    const absenceContract = readText(ABSENCE_CONTRACT)

    expect(upsertContract).toContain('upsert_exam_enrollment_from_portal')
    expect(upsertContract).toContain('target_student_record_id')
    expect(upsertContract).toContain('exam_absence_penalties')
    expect(absenceContract).toContain('BLOCKED_BY_ABSENCE_PENALTY')
    expect(absenceContract).toContain('La futura RPC debe consultar `exam_absence_penalties`')
  })
})
