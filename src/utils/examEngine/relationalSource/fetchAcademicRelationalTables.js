// Solo I/O: lee el schema relacional nuevo (supabase/schema/02_academic_relational_schema.sql
// + 04_teacher_exam_date_exclusions.sql) para una institucion. Sin logica de negocio -- eso
// vive en mapAcademicRelationalRowsToSnapshot.js. El cliente Supabase se recibe inyectado
// para poder testear con un fake, nunca se importa el singleton acá.

const TABLES = [
  'careers',
  'study_plans',
  'subjects',
  'study_plan_subjects',
  'subject_prerequisites',
  'teacher_records',
  'teacher_subject_assignments',
  'course_schedules',
  'student_records',
  'student_career_plans',
  'teacher_exam_date_exclusions',
]

const TABLE_SELECT_COLUMNS = {
  careers: 'id, institution_id, name',
  study_plans: 'id, institution_id, career_id',
  subjects: 'id, institution_id, code, name',
  study_plan_subjects: 'id, institution_id, plan_id, subject_id, year_number, exam_required, exam_group, related_subject_codes',
  subject_prerequisites: 'id, institution_id, target_plan_subject_id, prerequisite_plan_subject_id, status',
  teacher_records: 'id, institution_id, first_name, last_name, full_name, national_id, dni, email, login_email, status, teaching_hours, specialty',
  teacher_subject_assignments: 'id, institution_id, plan_subject_id, teacher_id, role, status, valid_from, valid_until, exam_required',
  course_schedules: 'id, institution_id, plan_subject_id, teacher_id, weekday, starts_at, ends_at',
  student_records: 'id, institution_id, first_name, last_name, full_name, national_id, dni, email, phone, status, career, academic_year',
  student_career_plans: 'id, institution_id, student_id, career_id, plan_id, current_year, status',
  teacher_exam_date_exclusions: 'id, institution_id, teacher_id, excluded_date, reason',
}

const PAGE_SIZE = 500

async function fetchTable(supabase, table, institutionId, signal) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    signal?.throwIfAborted()
    let query = supabase.from(table).select(TABLE_SELECT_COLUMNS[table]).eq('institution_id', institutionId)
      .order('id').range(offset, offset + PAGE_SIZE - 1)
    if (table === 'subject_prerequisites') query = query.eq('status', 'active')
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    const page = Array.isArray(data) ? data : []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return { table, rows }
  }
}

export async function fetchAcademicRelationalTables({ supabase, institutionId, signal }) {
  if (!supabase) throw new Error('Falta el cliente Supabase.')
  if (!institutionId) throw new Error('Falta institutionId.')

  const results = await Promise.all(TABLES.map((table) => fetchTable(supabase, table, institutionId, signal)))
  return Object.fromEntries(results.map(({ table, rows }) => [table, rows]))
}
