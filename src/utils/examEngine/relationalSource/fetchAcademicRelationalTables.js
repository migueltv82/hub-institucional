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

async function fetchTable(supabase, table, institutionId) {
  let query = supabase.from(table).select('*').eq('institution_id', institutionId)
  if (table === 'subject_prerequisites') query = query.eq('status', 'active')

  const { data, error } = await query
  if (error) throw new Error(`${table}: ${error.message}`)
  return { table, rows: Array.isArray(data) ? data : [] }
}

export async function fetchAcademicRelationalTables({ supabase, institutionId }) {
  if (!supabase) throw new Error('Falta el cliente Supabase.')
  if (!institutionId) throw new Error('Falta institutionId.')

  const results = await Promise.all(TABLES.map((table) => fetchTable(supabase, table, institutionId)))
  return Object.fromEntries(results.map(({ table, rows }) => [table, rows]))
}
