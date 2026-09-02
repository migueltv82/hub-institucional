import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sql(fileName = '01_academic_relational_tables.sql') {
  return readFileSync(
    join(process.cwd(), 'supabase/setup_multi_tenant', fileName),
    'utf8',
  )
}

describe('teacher academic Supabase SQL', () => {
  it('crea tablas relacionales docentes con tenant, workspace y timestamps', () => {
    const text = sql()

    expect(text).toContain('create table if not exists public.teacher_availability_records')
    expect(text).toContain('create table if not exists public.teacher_workload_records')
    expect(text).toContain('institution_id uuid not null references public.institutions(id) on delete cascade')
    expect(text).toContain("workspace_key text not null default 'main'")
    expect(text).toContain("created_at timestamptz not null default timezone('utc', now())")
    expect(text).toContain("updated_at timestamptz not null default timezone('utc', now())")
  })

  it('define claves de deduplicacion y constraints de carga horaria', () => {
    const text = sql()

    expect(text).toContain('create unique index if not exists teacher_availability_records_unique_slot')
    expect(text).toContain('teacher_identity')
    expect(text).toContain('day_of_week')
    expect(text).toContain('start_time')
    expect(text).toContain('end_time')
    expect(text).toContain('create unique index if not exists teacher_workload_records_unique_assignment')
    expect(text).toContain('program_id')
    expect(text).toContain('plan_id')
    expect(text).toContain('subject_id')
    expect(text).toContain('constraint teacher_workload_records_teaching_hours_positive check (teaching_hours > 0)')
  })

  it('declara campos de visualizacion usados por fuentes docentes y sus backfills', () => {
    const text = sql()

    expect(text).toContain("teacher_display_name text not null default ''")
    expect(text).toContain("career_name text not null default ''")
    expect(text).toContain('add column if not exists teacher_display_name text not null default')
    expect(text).toContain('add column if not exists career_name text not null default')
    expect(text).toMatch(/insert into public\.teacher_availability_records \([\s\S]*teacher_display_name[\s\S]*teacher_name/)
    expect(text).toMatch(/insert into public\.teacher_workload_records \([\s\S]*teacher_display_name[\s\S]*career_name/)
    expect(text).toContain('teacher_display_name = excluded.teacher_display_name')
    expect(text).toContain('career_name = excluded.career_name')
  })

  it('habilita RLS y politicas multi-tenant de administracion academica', () => {
    const text = sql()

    expect(text).toContain('alter table public.teacher_availability_records enable row level security')
    expect(text).toContain('alter table public.teacher_workload_records enable row level security')
    expect(text).toContain('public.can_manage_academic_institution(institution_id)')
    expect(text).toContain('academic admins manage teacher availability records')
    expect(text).toContain('academic admins manage teacher workload records')
  })

  it('evita alterar enums dentro del mismo script para no romper transacciones de Supabase SQL Editor', () => {
    const text = sql()

    expect(text).not.toMatch(/alter\s+type\s+public\.academic_audit_entity_type\s+add\s+value/i)
    expect(text).toContain("audit_entity := 'subject_teacher_assignment'::public.academic_audit_entity_type")
  })

  it('usa literales sin casts ni funciones en indices parciales con status potencialmente text o enum', () => {
    const text = sql()

    expect(text).toContain('drop index if exists public.subject_teacher_assignments_unique_active')
    expect(text).toContain("where status = 'active'")
    expect(text).toContain('and deleted_at is null')
    expect(text).toContain("and status in ('active', 'enrolled')")
    expect(text).toContain("and status = 'registered'")
    expect(text).not.toContain("and status in ('active'::public.subject_enrollment_status")
    expect(text).not.toContain("and status = 'registered'::public.exam_enrollment_status")
    expect(text).not.toContain('lower(status::text)')
  })

  it('agrega columnas de enrollments usadas por backfill en tablas existentes', () => {
    const text = sql()

    expect(text).toContain("add column if not exists enrolled_at timestamptz not null default timezone('utc', now())")
    expect(text).toContain('add column if not exists dropped_at timestamptz')
    expect(text).toContain('add column if not exists cancelled_at timestamptz')
    expect(text).toContain("add column if not exists created_at timestamptz not null default timezone('utc', now())")
    expect(text).toContain("add column if not exists updated_at timestamptz not null default timezone('utc', now())")
    expect(text).not.toContain("'active'::public.subject_enrollment_status")
    expect(text).not.toContain("'registered'::public.exam_enrollment_status")
  })

  it('usa backfill dinamico para subject_id uuid o text en tablas academicas existentes', () => {
    const text = sql()

    expect(text).toContain('do $academic_backfill$')
    expect(text).toContain('execute replace($subject_enrollments_uuid$')
    expect(text).toContain('execute replace($subject_enrollments_text$')
    expect(text).toContain('execute replace($exam_enrollments_uuid$')
    expect(text).toContain('execute replace($exam_enrollments_text$')
    expect(text).toContain('execute replace(replace($student_grades_uuid$')
    expect(text).toContain('execute replace(replace($student_grades_text$')
    expect(text).toContain("and column_name = 'subject_id'")
    expect(text).toContain("and udt_name = 'uuid'")
    expect(text).toContain("public.academic_try_parse_uuid(row.value ->> 'subject_id')")
    expect(text).toContain('subject_enrollment_status_expression')
    expect(text).toContain('exam_enrollment_status_expression')
    expect(text).toContain('__SUBJECT_ENROLLMENT_STATUS__')
    expect(text).toContain('__EXAM_ENROLLMENT_STATUS__')
    expect(text).toContain('student_grade_type_expression')
    expect(text).toContain('student_academic_status_expression')
  })

  it('usa backfill dinamico para disponibilidad docente con horas time o text', () => {
    const text = sql()

    expect(text).toContain('create or replace function public.academic_try_parse_time')
    expect(text).toContain('create or replace function public.academic_try_parse_date')
    expect(text).toContain('do $teacher_availability_backfill$')
    expect(text).toContain("and table_name = 'teacher_availability_records'")
    expect(text).toContain("and column_name = 'start_time'")
    expect(text).toContain("and data_type = 'time without time zone'")
    expect(text).toContain('public.academic_try_parse_time')
    expect(text).toContain('__AVAILABILITY_START_TIME__')
    expect(text).toContain('__AVAILABILITY_END_TIME__')
    expect(text).toContain('__AVAILABILITY_VALID_FROM__')
    expect(text).toContain('__AVAILABILITY_VALID_UNTIL__')
  })

  it('usa backfill dinamico para vigencias de carga horaria docente date o text', () => {
    const text = sql()

    expect(text).toContain('do $teacher_workload_backfill$')
    expect(text).toContain("and table_name = 'teacher_workload_records'")
    expect(text).toContain("and column_name = 'valid_from'")
    expect(text).toContain("and column_name = 'valid_until'")
    expect(text).toContain('__WORKLOAD_VALID_FROM__')
    expect(text).toContain('__WORKLOAD_VALID_UNTIL__')
    expect(text).toContain('workload_valid_from_expression')
    expect(text).toContain('workload_valid_until_expression')
  })

  it('castea ids academicos a text antes de llamar helpers RLS docentes', () => {
    const text = sql()

    expect(text).toContain('public.academic_legacy_subject_key_matches(assignment.subject_id::text, target_subject_id)')
    expect(text).toContain("public.academic_legacy_program_key_matches(assignment.program_id::text, coalesce(target_program_id, ''))")
    expect(text).toContain('assignment.exam_table_id::text = target_exam_table_id')
    expect(text).toContain('public.can_teacher_access_subject(institution_id, workspace_key, subject_id::text, program_id::text)')
    expect(text).toContain('public.can_teacher_access_exam(institution_id, workspace_key, exam_table_id::text)')
    expect(text).not.toContain('public.can_teacher_access_subject(institution_id, workspace_key, subject_id, program_id)')
    expect(text).not.toContain('public.can_teacher_access_exam(institution_id, workspace_key, exam_table_id)')
  })

  it('agrega baja logica a subject_teacher_assignments para auditoria y reasignacion', () => {
    const base = sql()
    const patch = sql('07_subject_teacher_assignment_active_unique.sql')

    expect(base).toMatch(/alter table public\.subject_teacher_assignments[\s\S]*add column if not exists deleted_at timestamptz/)
    expect(base).toMatch(/create unique index if not exists subject_teacher_assignments_unique_active[\s\S]*where status = 'active'[\s\S]*and deleted_at is null/)
    expect(patch).toMatch(/alter table public\.subject_teacher_assignments[\s\S]*add column if not exists deleted_at timestamptz/)
    expect(patch).toMatch(/create unique index if not exists subject_teacher_assignments_unique_active[\s\S]*where status = 'active'[\s\S]*and deleted_at is null/)
  })

  it('incluye parche incremental para subject_id uuid legacy y policies dependientes', () => {
    const text = sql('09_subject_enrollments_subject_id_text.sql')

    expect(text).toContain("table_name = 'subject_enrollments'")
    expect(text).toContain("table_name = 'exam_tables'")
    expect(text).toContain("column_name = 'subject_id'")
    expect(text).toContain("udt_name = 'uuid'")
    expect(text).toContain('alter column subject_id type text using subject_id::text')
    expect(text).toContain('drop constraint if exists')
    expect(text).toContain('drop policy if exists exam_tables_read_by_subject on public.exam_tables')
    expect(text).toContain('create policy exam_tables_read_by_subject')
    expect(text).toContain('drop policy if exists "students read own class sessions"')
    expect(text).toContain('create policy "students read own class sessions"')
    expect(text).toContain('subject_enrollments_one_active_per_subject')
    expect(text).toContain("notify pgrst, 'reload schema'")
  })

  it('incluye RPC docente para padrones con ids legacy normalizados', () => {
    const text = sql('18_teacher_subject_roster_fuzzy_access.sql')
    const prerequisitesBlock = text.slice(0, text.indexOf('alter table public.student_records'))

    expect(text).toContain('academic_get_teacher_subject_rosters')
    expect(text).toContain('academic_legacy_subject_key_matches')
    expect(text).toContain('academic_legacy_program_key_matches')
    expect(text).toContain('add column if not exists profile_id uuid references public.profiles(user_id) on delete set null')
    expect(text).toContain('idx_student_records_profile')
    expect(text).toContain('idx_teacher_records_profile')
    expect(text).toContain('teacher_record.profile_id = auth.uid()')
    expect(text).toContain('public.workspace_snapshots snapshot')
    expect(text).toContain("snapshot.payload -> 'docenteMateria'")
    expect(text).toContain("snapshot.payload -> 'horariosDocentes'")
    expect(text).toContain('where enrollment.student_record_id is null')
    expect(text).toContain('set student_record_id = safe_matches.student_record_id')
    expect(text).toContain('academic_student_record_matches_enrollment_program')
    expect(text).toContain('student_career_enrollments')
    expect(text).toContain("career_link.status in ('ACTIVE', 'PAUSED')")
    expect(prerequisitesBlock).not.toContain("to_regclass('public.student_career_enrollments')")
    expect(text).toContain('public.can_teacher_access_subject(')
    expect(text).toContain("'teacher_subject_rosters'")
    expect(text).toContain("notify pgrst, 'reload schema'")
  })

  it('incluye comandos seguros para notas y asistencia docente sin escrituras directas', () => {
    const text = sql('20_teacher_gradebook_secure_commands.sql')
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260824000000_teacher_gradebook_secure_commands.sql'),
      'utf8',
    )

    expect(text).toContain('academic_teacher_create_class_session')
    expect(text).toContain('academic_teacher_upsert_attendance_records')
    expect(text).toContain('academic_teacher_upsert_student_grade')
    expect(text).toContain('academic_snapshot_has_subject_enrollment')
    expect(text).toContain("snapshot.payload -> 'enrollments'")
    expect(text).toContain('STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND')
    expect(text).toContain('public.can_teacher_access_subject')
    expect(text).toContain("enrollment.status in ('active', 'enrolled')")
    expect(text).toContain('target_enrollment.id')
    expect(text).toContain('revoke insert, update on public.student_grades from authenticated')
    expect(text).toContain('revoke insert, update on public.subject_class_sessions from authenticated')
    expect(text).toContain('revoke insert, update on public.subject_attendance_records from authenticated')
    expect(migration).toBe(text)
  })

  it('incluye migracion incremental para guardar notas y asistencia desde padron snapshot', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260828165000_teacher_gradebook_snapshot_roster_records.sql'),
      'utf8',
    )

    expect(migration).toContain('create or replace function public.academic_snapshot_has_subject_enrollment')
    expect(migration).toContain("snapshot.payload -> 'enrollments'")
    expect(migration).toContain('has_snapshot_enrollment')
    expect(migration).toContain('target_enrollment.id')
    expect(migration).toContain("notify pgrst, 'reload schema'")
  })

  it('incluye reset seguro del proceso de mesas sin borrar datos academicos base', () => {
    const text = sql('21_exam_process_reset.sql')
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260825000000_exam_process_reset.sql'),
      'utf8',
    )

    expect(text).toContain('create or replace function public.academic_admin_reset_exam_process')
    expect(text).toContain('public.can_manage_academic_institution(target_institution_id)')
    expect(text).toContain("'cronograma', '[]'::jsonb")
    expect(text).toContain("'examEnrollments', '[]'::jsonb")
    expect(text).toContain('update public.exam_teacher_assignments')
    expect(text).toContain("status = 'deleted'")
    expect(text).toContain('update public.exam_enrollments')
    expect(text).toContain("status = 'cancelled'::public.exam_enrollment_status")
    expect(text).toContain('delete from public.legacy_exam_sessions')
    expect(text).not.toMatch(/adminReview/i)
    expect(text).not.toContain('requiereRegeneracion')
    expect(text).not.toMatch(/delete\s+from\s+public\.(workspace_snapshots|student_records|teacher_records|subject_enrollments|student_grades|subject_attendance_records)/i)
    expect(migration).toBe(text)
  })

  it('incluye parche incremental para student_id apuntando a profiles.user_id', () => {
    const text = sql('10_academic_student_id_profile_fks.sql')

    expect(text).toContain("'subject_enrollments'")
    expect(text).toContain("'exam_enrollments'")
    expect(text).toContain("'student_grades'")
    expect(text).toContain("'subject_attendance_records'")
    expect(text).toContain("column_name = 'student_id'")
    expect(text).toContain('drop constraint if exists')
    expect(text).toContain('references public.profiles(user_id) on delete cascade not valid')
    expect(text).toContain("notify pgrst, 'reload schema'")
  })

  it('incluye parche incremental para student_record_id y bloqueo academico en mesas', () => {
    const text = sql('12_academic_exam_enrollment_student_record_and_condition.sql')

    expect(text).toContain('target_student_record_id uuid')
    expect(text).toContain('student_record_id')
    expect(text).toContain("latest_academic_status <> 'regular'")
    expect(text).toContain('Todavia no hay condicion regular cargada para esta materia.')
    expect(text).toContain('grant execute on function public.upsert_exam_enrollment_from_portal')
    expect(text).toContain("notify pgrst, 'reload schema'")
  })

  it('incluye backfill desde workspaceSnapshot sin borrar datos legacy', () => {
    const text = sql()

    expect(text).toContain("snapshot.payload -> 'disponibilidadDocente'")
    expect(text).toContain("snapshot.payload -> 'cargaHorariaDocente'")
    expect(text).toContain('on conflict (')
    expect(text).not.toMatch(/delete\s+from\s+public\.workspace_snapshots/i)
    expect(text).not.toMatch(/drop\s+table\s+if\s+exists\s+public\.workspace_snapshots/i)
  })
})
