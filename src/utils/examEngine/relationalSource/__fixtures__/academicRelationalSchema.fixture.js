// Filas crudas de ejemplo con la forma exacta del schema relacional
// (supabase/schema/02_academic_relational_schema.sql + 04_teacher_exam_date_exclusions.sql),
// tal como las devuelve fetchAcademicRelationalTables. No es forma de salida -- para eso
// esta comparison/__fixtures__/legacyWorkspaceSnapshot.fixture.js, que es un dominio distinto.

export const INSTITUTION_ID = 'inst-1'

export const academicRelationalSchemaFixture = {
  careers: [
    { id: 'career-ing', institution_id: INSTITUTION_ID, external_code: 'ING', name: 'PROFESORADO DE INGLES' },
  ],
  study_plans: [
    { id: 'plan-ing', institution_id: INSTITUTION_ID, career_id: 'career-ing', external_code: 'ING-PLAN', name: 'Plan 2015' },
  ],
  subjects: [
    { id: 'subject-ing01', institution_id: INSTITUTION_ID, code: 'ING01', name: 'Pedagogia' },
    { id: 'subject-ing02', institution_id: INSTITUTION_ID, code: 'ING02', name: 'Didactica General' },
    { id: 'subject-ing03', institution_id: INSTITUTION_ID, code: 'ING03', name: 'Ingles Gramatica 1' },
  ],
  study_plan_subjects: [
    { id: 'sps-ing01', institution_id: INSTITUTION_ID, plan_id: 'plan-ing', subject_id: 'subject-ing01', year_number: 1, exam_required: true, exam_group: '', related_subject_codes: '' },
    { id: 'sps-ing02', institution_id: INSTITUTION_ID, plan_id: 'plan-ing', subject_id: 'subject-ing02', year_number: 1, exam_required: true, exam_group: '', related_subject_codes: '' },
    { id: 'sps-ing03', institution_id: INSTITUTION_ID, plan_id: 'plan-ing', subject_id: 'subject-ing03', year_number: 1, exam_required: false, exam_group: '', related_subject_codes: '' },
  ],
  subject_prerequisites: [
    { id: 'req-1', institution_id: INSTITUTION_ID, target_plan_subject_id: 'sps-ing02', prerequisite_plan_subject_id: 'sps-ing01', status: 'active' },
  ],
  teacher_records: [
    { id: 'teacher-1', institution_id: INSTITUTION_ID, external_code: 'DOC1', first_name: 'Ana', last_name: 'Perez', national_id: '30111222', email: 'ana@example.com', status: 'active', teaching_hours: 10, specialty: 'Ingles' },
    { id: 'teacher-2', institution_id: INSTITUTION_ID, external_code: 'DOC2', first_name: 'Luis', last_name: 'Gomez', national_id: '30222333', email: 'luis@example.com', status: 'active', teaching_hours: null, specialty: '' },
    { id: 'teacher-3', institution_id: INSTITUTION_ID, external_code: 'DOC3', first_name: 'Marta', last_name: 'Diaz', national_id: '30333444', email: 'marta@example.com', status: 'active', teaching_hours: 6, specialty: '' },
  ],
  teacher_subject_assignments: [
    { id: 'tsa-1', institution_id: INSTITUTION_ID, plan_subject_id: 'sps-ing01', teacher_id: 'teacher-1', role: 'titular', status: 'active', valid_from: null, valid_until: null, exam_required: null },
  ],
  course_schedules: [
    { id: 'sch-1', institution_id: INSTITUTION_ID, plan_subject_id: 'sps-ing01', teacher_id: 'teacher-1', weekday: 1, starts_at: '18:00:00', ends_at: '20:00:00' },
    { id: 'sch-2', institution_id: INSTITUTION_ID, plan_subject_id: 'sps-ing01', teacher_id: 'teacher-1', weekday: 2, starts_at: '18:00:00', ends_at: '20:00:00' },
    { id: 'sch-3', institution_id: INSTITUTION_ID, plan_subject_id: 'sps-ing02', teacher_id: 'teacher-2', weekday: 1, starts_at: '19:00:00', ends_at: '21:00:00' },
    { id: 'sch-4', institution_id: INSTITUTION_ID, plan_subject_id: 'sps-ing02', teacher_id: 'teacher-2', weekday: 3, starts_at: '19:00:00', ends_at: '21:00:00' },
    { id: 'sch-5', institution_id: INSTITUTION_ID, plan_subject_id: 'sps-ing02', teacher_id: 'teacher-2', weekday: 5, starts_at: '19:00:00', ends_at: '21:00:00' },
  ],
  student_records: [
    { id: 'student-1', institution_id: INSTITUTION_ID, external_code: 'AL1', first_name: 'Sol', last_name: 'Vega', national_id: '40111222', email: 'sol@example.com', status: 'active' },
    { id: 'student-2', institution_id: INSTITUTION_ID, external_code: 'AL2', first_name: 'Ivo', last_name: 'Rey', national_id: '40222333', email: 'ivo@example.com', status: 'active' },
  ],
  student_career_plans: [
    { id: 'scp-1', institution_id: INSTITUTION_ID, student_id: 'student-1', career_id: 'career-ing', plan_id: 'plan-ing', current_year: 1, status: 'active' },
    // student-2 no tiene fila -- a proposito, para testear el caso "alumno sin plan".
  ],
  teacher_exam_date_exclusions: [
    { id: 'excl-1', institution_id: INSTITUTION_ID, teacher_id: 'teacher-3', excluded_date: '2026-10-15', reason: 'Licencia' },
  ],
}
