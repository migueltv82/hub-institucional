import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(path.resolve('supabase/migrations/20260823030535_teacher_remove_student_subject_records.sql'), 'utf8')
const resetSetup = fs.readFileSync(path.resolve('supabase/setup_multi_tenant/22_teacher_student_subject_academic_reset.sql'), 'utf8')
const resetMigration = fs.readFileSync(path.resolve('supabase/migrations/20260828162500_teacher_student_subject_academic_reset_snapshot_roster.sql'), 'utf8')
const edgeFunction = fs.readFileSync(path.resolve('supabase/functions/admin-users/index.ts'), 'utf8')
const fuzzyAuthorization = fs.readFileSync(path.resolve('supabase/migrations/20260823032555_teacher_remove_student_subject_fuzzy_authorization.sql'), 'utf8')

describe('eliminacion segura de alumno por docente', () => {
  it('ejecuta asistencia, notas e inscripcion en una sola funcion transaccional', () => {
    expect(migration).toContain('delete from public.subject_attendance_records')
    expect(migration).toContain('update public.student_grades')
    expect(migration).toContain("set status = 'dropped'")
    expect(migration).toContain('update public.subject_enrollments')
  })

  it('restringe la funcion de base exclusivamente al service role', () => {
    expect(migration).toMatch(/revoke all[\s\S]*from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute[\s\S]*to service_role/i)
    expect(migration).toContain('assignment.teacher_id = p_actor_id')
  })

  it('autoriza y elimina usando las mismas equivalencias legacy del portal docente', () => {
    expect(fuzzyAuthorization).toContain('academic_legacy_subject_key_matches')
    expect(fuzzyAuthorization).toContain('academic_legacy_program_key_matches')
    expect(fuzzyAuthorization).toContain('teacher_record.profile_id = p_actor_id')
    expect(fuzzyAuthorization).toMatch(/revoke all[\s\S]*from public, anon, authenticated/i)
  })

  it('exige reautenticacion por contraseña antes de llamar la transaccion', () => {
    expect(edgeFunction).toContain('signInWithPassword')
    expect(edgeFunction).toContain('passwordData.user?.id !== caller.id')
    expect(edgeFunction).toContain("teacher_remove_student_subject_records: handleTeacherRemoveStudentSubjectRecords")
    expect(edgeFunction).toContain("throw new Error(details || 'La base de datos rechazo la eliminacion solicitada.')")
  })
  it('reinicia notas, estado y asistencia sin exigir inscripcion relacional activa', () => {
    const handler = edgeFunction.match(/async function handleTeacherResetStudentSubjectAcademicRecords[\s\S]*?\n}/)?.[0] ?? ''

    expect(resetMigration).toContain('create or replace function public.teacher_reset_student_subject_academic_records')
    expect(resetMigration).toContain('delete from public.subject_attendance_records')
    expect(resetMigration).toContain('update public.student_grades')
    expect(resetMigration).toContain("enrollment.status in ('active', 'enrolled')")
    expect(resetSetup).not.toContain('El alumno no tiene una inscripcion activa en esta materia.')
    expect(resetMigration).not.toContain('El alumno no tiene una inscripcion activa en esta materia.')
    expect(resetMigration).not.toContain('update public.subject_enrollments')
    expect(resetMigration).not.toContain("status = 'dropped'")
    expect(resetMigration).toMatch(/revoke all[\s\S]*from public, anon, authenticated/i)
    expect(resetMigration).toMatch(/grant execute[\s\S]*to service_role/i)
    expect(edgeFunction).toContain('teacher_reset_student_subject_academic_records: handleTeacherResetStudentSubjectAcademicRecords')
    expect(handler).toContain('await assertCallerPassword(context.caller, password)')
    expect(handler).toContain("adminClient.rpc('teacher_reset_student_subject_academic_records'")
    expect(handler).toContain('stripStudentSubjectAcademicSnapshotData')
    expect(handler).toContain("throw new Error(details || 'La base de datos rechazo el reinicio solicitado.')")
  })
})
