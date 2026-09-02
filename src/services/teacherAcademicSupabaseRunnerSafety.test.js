import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function runnerText() {
  return readFileSync(
    join(process.cwd(), 'scripts/validateTeacherAcademicSupabase.mjs'),
    'utf8',
  )
}

describe('teacher academic Supabase runner safety', () => {
  it('requiere variables seguras para la validacion real', () => {
    const text = runnerText()

    expect(text).toContain("'VITE_SUPABASE_URL'")
    expect(text).toContain("'VITE_SUPABASE_PUBLISHABLE_KEY'")
    expect(text).toContain("'SUPABASE_SERVICE_ROLE_KEY'")
    expect(text).toContain("'SUPABASE_TEST_INSTITUTION_ID'")
    expect(text).toContain("'SUPABASE_TEST_WORKSPACE_KEY'")
    expect(text).toContain("const ENV_FILES = ['.env', '.env.local']")
  })

  it('bloquea service role con prefijo VITE', () => {
    const text = runnerText()

    expect(text).toContain('FORBIDDEN_SERVICE_ROLE_ENV_KEYS')
    expect(text).toContain("'VITE_SERVICE_ROLE_KEY'")
    expect(text).toContain("'VITE_SUPABASE_SERVICE_ROLE_KEY'")
    expect(text).toContain("'VITE_ADMIN_SERVICE_ROLE_KEY'")
    expect(text).toContain('Variables service_role prohibidas con prefijo VITE_')
  })

  it('reporta presencia de entorno sin imprimir valores de claves', () => {
    const text = runnerText()

    expect(text).toContain('envPresence')
    expect(text).toContain('Boolean(pickEnv(env, key))')
    expect(text).not.toContain('console.log(supabaseKey')
    expect(text).not.toContain('console.error(supabaseKey')
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY: supabaseKey')
  })

  it('normaliza teacher_display_name antes de upsert docente real', () => {
    const text = runnerText()

    expect(text).toContain('function getTeacherDisplayName')
    expect(text).toContain('function assertTeacherDisplayName')
    expect(text).toContain('teacher_display_name: teacherDisplayName')
    expect(text).toContain('teacher_name: teacherDisplayName')
    expect(text).toContain('falta teacher_display_name normalizable')
  })

  it('normaliza status docente antes de upsert real', () => {
    const text = runnerText()

    expect(text).toContain('function normalizeTeacherAcademicStatus')
    expect(text).toContain("new Set(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DRAFT'])")
    expect(text).toContain("status: normalizeTeacherAcademicStatus('active')")
    expect(text).not.toContain("status: 'active'")
  })

  it('incluye campos requeridos de carga horaria antes del upsert real', () => {
    const text = runnerText()

    expect(text).toContain("career_name: careerName")
    expect(text).toContain("subject_name: subjectName")
    expect(text).toContain('function normalizeTeacherRole')
    expect(text).toContain("new Set(['TITULAR', 'CO_DOCENTE', 'AUXILIAR', 'SUPLENTE', 'REEMPLAZO'])")
    expect(text).toContain("role: normalizeTeacherRole('titular')")
    expect(text).toContain('function assertWorkloadPayload')
    expect(text).toContain('faltan campos requeridos antes del upsert')
  })
})
