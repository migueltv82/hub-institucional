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

const PAGE_SIZE = 500

async function fetchTable(supabase, table, institutionId, signal) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    signal?.throwIfAborted()
    let query = supabase.from(table).select('*').eq('institution_id', institutionId)
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
