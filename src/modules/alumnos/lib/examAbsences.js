// F1b: ausente en un acta de examen -> fila que lee getAbsencePenaltyForExam (espejo de la regla de la base).
// Pura, sin red: la usa el servicio del portal y el harness local que compara servidor y espejo.

function clean(value) {
  return String(value ?? '').trim()
}

export function mapExamAbsenceRow(row = {}) {
  const absentAt = clean(row.absent_at)
  return {
    id: `exam-absence-${clean(row.id)}`,
    subject_id: clean(row.subject_id),
    canonical_subject_id: clean(row.subject_id),
    program_id: clean(row.program_id),
    canonical_program_id: clean(row.program_id),
    student_record_id: clean(row.student_record_id) || null,
    ausente: true,
    fecha_ausencia: absentAt,
    absent_at: absentAt,
    academic_status: 'pending',
    grade_type: 'exam_absence',
    source: 'exam_absence',
    updated_at: absentAt,
  }
}
