import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchInstitutionStudentGrades, fetchStudentGrades, upsertStudentGrade } from './studentGrades.js'

const mocks = vi.hoisted(() => ({
  store: { student_grades: [] },
  nextId: 1,
  nextError: null,
  lastRpcParams: null,
}))

function applyEq(rows, column, value) {
  return rows.filter((row) => row[column] === value)
}

function createSelectQuery(tableName, initialRows) {
  const query = {
    rows: initialRows,
    select() {
      return this
    },
    eq(column, value) {
      this.rows = applyEq(this.rows, column, value)
      return this
    },
    is(column, value) {
      this.rows = this.rows.filter((row) => (row[column] ?? null) === value)
      return this
    },
    limit(count) {
      this.rows = this.rows.slice(0, count)
      return this
    },
    order() {
      return this
    },
    then(resolve) {
      return resolve({ data: mocks.nextError ? null : this.rows, error: mocks.nextError })
    },
  }

  return query
}

function createQuery(tableName) {
  return {
    select() {
      return createSelectQuery(tableName, [...mocks.store[tableName]])
    },
    insert(payload) {
      return {
        select: () => {
          if (mocks.nextError) return Promise.resolve({ data: null, error: mocks.nextError })

          const row = { id: `grade-${mocks.nextId++}`, lock_version: 1, ...payload }
          mocks.store[tableName].push(row)
          return Promise.resolve({ data: [row], error: null })
        },
      }
    },
    update(payload) {
      const filters = []
      const builder = {
        eq(column, value) {
          filters.push({ column, value })
          return builder
        },
        select: () => {
          if (mocks.nextError) return Promise.resolve({ data: null, error: mocks.nextError })

          const matches = mocks.store[tableName].filter((row) => (
            filters.every((filter) => row[filter.column] === filter.value)
          ))

          matches.forEach((row) => {
            Object.assign(row, payload)
            row.lock_version = (row.lock_version ?? 1) + 1
          })

          return Promise.resolve({ data: matches, error: null })
        },
      }
      return builder
    },
  }
}

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (tableName) => createQuery(tableName),
    rpc: (functionName, params) => {
      mocks.lastRpcParams = params
      if (mocks.nextError) return Promise.resolve({ data: null, error: mocks.nextError })
      if (functionName !== 'academic_teacher_upsert_student_grade') {
        return Promise.resolve({ data: null, error: { message: 'RPC no mockeada' } })
      }

      const existing = mocks.store.student_grades.find((row) => (
        row.institution_id === params.p_institution_id &&
        row.workspace_key === params.p_workspace_key &&
        row.student_id === params.p_student_id &&
        row.subject_id === params.p_subject_id &&
        row.program_id === params.p_program_id &&
        row.grade_type === params.p_grade_type &&
        row.attempt_number === params.p_attempt_number
      ))

      if (existing) {
        if (
          params.p_expected_lock_version != null &&
          existing.lock_version !== params.p_expected_lock_version
        ) {
          return Promise.resolve({ data: null, error: { message: 'ACADEMIC_LOCK_VERSION_CONFLICT' } })
        }

        Object.assign(existing, {
          grade_value: params.p_grade_value,
          subject_enrollment_id: params.p_subject_enrollment_id,
          ...(params.p_student_record_id ? { student_record_id: params.p_student_record_id } : {}),
          ...(params.p_academic_status ? { academic_status: params.p_academic_status } : {}),
        })
        existing.lock_version = (existing.lock_version ?? 1) + 1
        return Promise.resolve({ data: existing, error: null })
      }

      const row = {
        id: `grade-${mocks.nextId++}`,
        lock_version: 1,
        institution_id: params.p_institution_id,
        workspace_key: params.p_workspace_key,
        student_id: params.p_student_id,
        student_record_id: params.p_student_record_id,
        subject_enrollment_id: params.p_subject_enrollment_id,
        subject_id: params.p_subject_id,
        program_id: params.p_program_id,
        grade_type: params.p_grade_type,
        attempt_number: params.p_attempt_number,
        grade_value: params.p_grade_value,
        grade_scale: 'numeric_0_10',
        ...(params.p_academic_status ? { academic_status: params.p_academic_status } : {}),
      }
      mocks.store.student_grades.push(row)
      return Promise.resolve({ data: row, error: null })
    },
  },
}))

describe('studentGrades service', () => {
  beforeEach(() => {
    mocks.store.student_grades = []
    mocks.nextId = 1
    mocks.nextError = null
    mocks.lastRpcParams = null
  })

  it('lee las notas de una materia sin filas eliminadas', async () => {
    mocks.store.student_grades = [
      { id: 'grade-1', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING13', program_id: 'Profesorado de Ingles', deleted_at: null },
    ]

    const result = await fetchStudentGrades({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
    })

    expect(result).toEqual([
      expect.objectContaining({ id: 'grade-1' }),
    ])
  })

  it('crea la nota cuando no existe una fila previa para ese intento', async () => {
    const result = await upsertStudentGrade({
      institutionId: 'inst-1',
      studentId: 'student-1',
      studentRecordId: 'student-record-1',
      subjectEnrollmentId: '11111111-1111-4111-8111-111111111111',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      teacherId: 'teacher-1',
      gradeType: 'partial',
      attemptNumber: 1,
      gradeValue: 8,
    })

    expect(result.success).toBe(true)
    expect(result.grade).toEqual(expect.objectContaining({
      student_id: 'student-1',
      student_record_id: 'student-record-1',
      subject_enrollment_id: '11111111-1111-4111-8111-111111111111',
      grade_type: 'partial',
      attempt_number: 1,
      grade_value: 8,
      grade_scale: 'numeric_0_10',
    }))
    expect(mocks.store.student_grades).toHaveLength(1)
  })

  it('lee todas las notas activas de la institucion para el estado academico admin', async () => {
    mocks.store.student_grades = [
      { id: 'grade-1', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING06', deleted_at: null },
      { id: 'grade-2', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING10', deleted_at: null },
      { id: 'grade-other', institution_id: 'inst-2', workspace_key: 'main', subject_id: 'ING06', deleted_at: null },
      { id: 'grade-deleted', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING11', deleted_at: '2026-08-28' },
    ]

    const result = await fetchInstitutionStudentGrades({ institutionId: 'inst-1' })

    expect(result.map((grade) => grade.id)).toEqual(['grade-1', 'grade-2'])
  })

  it('omite un identificador legacy de inscripcion antes de llamar a la RPC UUID', async () => {
    const result = await upsertStudentGrade({
      institutionId: 'inst-1',
      studentId: 'e342c2ae-3275-4703-9ac9-ddc9b6268a77',
      subjectEnrollmentId: 'student-enrollment-e342c2ae-3275-4703-9ac9-ddc9b6268a77-ING06-1787793122768',
      subjectId: 'ING06',
      programId: 'Profesorado de Ingles',
      gradeType: 'partial',
      gradeValue: 8,
    })

    expect(result.success).toBe(true)
    expect(mocks.lastRpcParams.p_subject_enrollment_id).toBeNull()
  })

  it('actualiza la nota existente cuando el lock_version coincide', async () => {
    mocks.store.student_grades = [{
      id: 'grade-1',
      institution_id: 'inst-1',
      workspace_key: 'main',
      student_id: 'student-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      grade_type: 'final',
      attempt_number: 1,
      grade_value: 5,
      lock_version: 3,
    }]

    const result = await upsertStudentGrade({
      institutionId: 'inst-1',
      studentId: 'student-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      teacherId: 'teacher-1',
      gradeType: 'final',
      attemptNumber: 1,
      gradeValue: 9,
      lockVersion: 3,
    })

    expect(result.success).toBe(true)
    expect(result.grade).toEqual(expect.objectContaining({ id: 'grade-1', grade_value: 9, lock_version: 4 }))
    expect(mocks.store.student_grades).toHaveLength(1)
  })

  it('devuelve un conflicto cuando el lock_version no coincide con el de otro usuario', async () => {
    mocks.store.student_grades = [{
      id: 'grade-1',
      institution_id: 'inst-1',
      workspace_key: 'main',
      student_id: 'student-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      grade_type: 'final',
      attempt_number: 1,
      grade_value: 5,
      lock_version: 3,
    }]

    const result = await upsertStudentGrade({
      institutionId: 'inst-1',
      studentId: 'student-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      teacherId: 'teacher-1',
      gradeType: 'final',
      attemptNumber: 1,
      gradeValue: 9,
      lockVersion: 1,
    })

    expect(result).toEqual({ success: false, error: 'Otro usuario modifico esta nota. Recarga la pagina.' })
  })
})
