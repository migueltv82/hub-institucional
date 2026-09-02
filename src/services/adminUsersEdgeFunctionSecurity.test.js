import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const edgeFunction = readFileSync(
  join(process.cwd(), 'supabase/functions/admin-users/index.ts'),
  'utf8',
)
const supabaseConfig = readFileSync(
  join(process.cwd(), 'supabase/config.toml'),
  'utf8',
)
const functionConfig = readFileSync(
  join(process.cwd(), 'supabase/config/config.toml'),
  'utf8',
)
const deployDocs = readFileSync(
  join(process.cwd(), 'supabase/docs/deploy_admin_users.md'),
  'utf8',
)

describe('admin-users edge function security posture', () => {
  it('mantiene verify_jwt desactivado solo con validacion interna explicita', () => {
    expect(supabaseConfig).toMatch(/\[functions\.admin-users\][\s\S]*verify_jwt = false/)
    expect(functionConfig).toContain('verify_jwt = false')
    expect(deployDocs).toContain('--no-verify-jwt')
    expect(edgeFunction).toContain('assertBearerAuthorization(req)')
    expect(edgeFunction).toContain('await requireStudentPortalMember')
    expect(edgeFunction).toContain('await requireTeacherPortalMember')
    expect(edgeFunction).toContain('await requireInstitutionAdmin')
    expect(edgeFunction).toContain('await requireSuperAdmin')
  })

  it('no acepta wildcard CORS en admin-users', () => {
    expect(edgeFunction).not.toContain("allowedOrigins.has('*')")
    expect(edgeFunction).not.toContain("? '*' : origin")
  })

  it('sincroniza relacional cuando el portal ya lee tablas relacionales', () => {
    const dualWriteBody = edgeFunction.match(/function shouldDualWriteAcademics[\s\S]*?\n}/)?.[0] ?? ''
    const readRelationalBody = edgeFunction.match(/function shouldReadRelationalAcademics[\s\S]*?\n}/)?.[0] ?? ''

    expect(dualWriteBody).toContain('shouldReadRelationalAcademics(config)')
    expect(readRelationalBody).toContain('config.hybridReadEnabled')
    expect(readRelationalBody).toContain('config.relationalPrimaryEnabled')
    expect(readRelationalBody).toContain("['hybrid_read', 'relational_primary'].includes(config.readMode)")
    expect(edgeFunction).toContain('transitionConfig.strictDriftBlockEnabled || shouldReadRelationalAcademics(transitionConfig)')
  })

  it('obliga escritura relacional para inscripciones que alimentan el panel docente', () => {
    expect(edgeFunction).toContain("new Set(['enroll_subject', 'withdraw_subject'])")
    expect(edgeFunction).toContain('relationalWriteRequired = shouldRequireStudentPortalRelationalWrite(mutationType)')
    expect(edgeFunction).toContain('relationalWriteEnabled = dualWriteEnabled || relationalWriteRequired')
    expect(edgeFunction).toContain('if (relationalWriteRequired || transitionConfig.strictDriftBlockEnabled || shouldReadRelationalAcademics(transitionConfig))')
  })

  it('expone el padron de materias por Edge Function solo para docentes autenticados', () => {
    expect(edgeFunction).toContain('teacher_subject_rosters: handleTeacherSubjectRosters')
    expect(edgeFunction).toContain("action === 'teacher_profile_update' || action === 'teacher_remove_student_subject_records' || action === 'teacher_reset_student_subject_academic_records' || action === 'teacher_subject_rosters'")
    expect(edgeFunction).toContain('await requireTeacherPortalMember')
    expect(edgeFunction).toContain('teacherRosterEnrollmentMatchesAccessibleSubject')
    expect(edgeFunction).toContain('snapshot.enrollments')
    expect(edgeFunction).toContain('mapSnapshotEnrollmentToTeacherRosterEnrollment')
  })

  it('protege el reset academico total con permisos admin y contrasena actual', () => {
    expect(edgeFunction).toContain('reset_student_academic_records: handleResetStudentAcademicRecords')
    expect(edgeFunction).toContain("action === 'bulk_create_students' || action === 'bulk_create_teachers' || action === 'reset_student_academic_records'")
    expect(edgeFunction).toContain('await assertCallerPassword(context.caller, password)')
    expect(edgeFunction).toContain("table: 'student_grades'")
    expect(edgeFunction).toContain("table: 'subject_enrollments'")
    expect(edgeFunction).toContain("table: 'exam_enrollments'")
    expect(edgeFunction).toContain("table: 'subject_attendance_records'")
    expect(edgeFunction).toContain('stripStudentAcademicSnapshotData')
  })
})
