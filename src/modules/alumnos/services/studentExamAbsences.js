import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'
import { mapExamAbsenceRow } from '../lib/examAbsences.js'

export { mapExamAbsenceRow }

// F1b: ausentes del alumno en actas de examen (RPC get_student_exam_absences, solo filas propias). Se
// mapean al formato que lee getAbsencePenaltyForExam para explicar la mesa castigo antes de inscribirse.
// La regla que decide es exam_enrollment_assert_eligible en la base.

function clean(value) {
  return String(value ?? '').trim()
}

// Sin la migracion o sin sesion remota no hay ausentes que mostrar: el servidor igual decide al inscribir.
export async function fetchStudentExamAbsences({ institutionId, workspaceKey = 'main' }) {
  if (!isSupabaseConfigured || !supabase || !clean(institutionId)) return []
  const { data, error } = await supabase.rpc('get_student_exam_absences', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
  })
  if (error) return []
  return (Array.isArray(data) ? data : []).map(mapExamAbsenceRow)
}
