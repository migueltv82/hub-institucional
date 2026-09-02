import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createClassSession,
  fetchAttendanceForSessions,
  fetchAttendanceForSession,
  fetchClassSessions,
  fetchStudentAttendanceRecords,
  saveAttendanceForSession,
} from './subjectAttendance.js'

const mocks = vi.hoisted(() => ({
  store: {
    subject_class_sessions: [],
    subject_attendance_records: [],
  },
  nextId: 1,
  nextError: null,
  lastAttendanceRpcParams: null,
}))

function createSelectQuery(tableName, initialRows) {
  const query = {
    rows: initialRows,
    select() {
      return this
    },
    eq(column, value) {
      this.rows = this.rows.filter((row) => row[column] === value)
      return this
    },
    in(column, values) {
      this.rows = this.rows.filter((row) => values.includes(row[column]))
      return this
    },
    order() {
      this.rows = [...this.rows].sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)))
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

          const row = { id: `${tableName}-${mocks.nextId++}`, ...payload }
          mocks.store[tableName].push(row)
          return Promise.resolve({ data: [row], error: null })
        },
      }
    },
    upsert(rows, { onConflict } = {}) {
      return {
        select: () => {
          if (mocks.nextError) return Promise.resolve({ data: null, error: mocks.nextError })

          const conflictColumns = String(onConflict ?? '').split(',').map((column) => column.trim()).filter(Boolean)
          const saved = rows.map((row) => {
            const existingIndex = mocks.store[tableName].findIndex((existing) => (
              conflictColumns.every((column) => existing[column] === row[column])
            ))

            if (existingIndex >= 0) {
              mocks.store[tableName][existingIndex] = { ...mocks.store[tableName][existingIndex], ...row }
              return mocks.store[tableName][existingIndex]
            }

            const created = { id: `${tableName}-${mocks.nextId++}`, ...row }
            mocks.store[tableName].push(created)
            return created
          })

          return Promise.resolve({ data: saved, error: null })
        },
      }
    },
  }
}

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (tableName) => createQuery(tableName),
    rpc: (functionName, params) => {
      if (mocks.nextError) return Promise.resolve({ data: null, error: mocks.nextError })

      if (functionName === 'academic_teacher_create_class_session') {
        const existing = mocks.store.subject_class_sessions.find((session) => (
          session.institution_id === params.p_institution_id &&
          session.workspace_key === params.p_workspace_key &&
          session.subject_id === params.p_subject_id &&
          session.program_id === params.p_program_id &&
          session.session_date === params.p_session_date
        ))
        if (existing) return Promise.resolve({ data: existing, error: null })

        const row = {
          id: `subject_class_sessions-${mocks.nextId++}`,
          institution_id: params.p_institution_id,
          workspace_key: params.p_workspace_key,
          subject_id: params.p_subject_id,
          program_id: params.p_program_id,
          teacher_id: 'teacher-1',
          session_date: params.p_session_date,
          topic: params.p_topic,
        }
        mocks.store.subject_class_sessions.push(row)
        return Promise.resolve({ data: row, error: null })
      }

      if (functionName === 'academic_teacher_upsert_attendance_records') {
        mocks.lastAttendanceRpcParams = params
        const saved = params.p_records.map((record) => {
          const existingIndex = mocks.store.subject_attendance_records.findIndex((existing) => (
            existing.session_id === params.p_session_id &&
            existing.student_id === record.student_id
          ))
          const row = {
            session_id: params.p_session_id,
            institution_id: 'inst-1',
            workspace_key: 'main',
            student_id: record.student_id,
            subject_enrollment_id: record.subject_enrollment_id,
            status: record.status || 'present',
            observations: record.observations ?? '',
          }

          if (existingIndex >= 0) {
            mocks.store.subject_attendance_records[existingIndex] = {
              ...mocks.store.subject_attendance_records[existingIndex],
              ...row,
            }
            return mocks.store.subject_attendance_records[existingIndex]
          }

          const created = { id: `subject_attendance_records-${mocks.nextId++}`, ...row }
          mocks.store.subject_attendance_records.push(created)
          return created
        })

        return Promise.resolve({ data: saved, error: null })
      }

      return Promise.resolve({ data: null, error: { message: 'RPC no mockeada' } })
    },
  },
}))

describe('subjectAttendance service', () => {
  beforeEach(() => {
    mocks.store.subject_class_sessions = []
    mocks.store.subject_attendance_records = []
    mocks.nextId = 1
    mocks.nextError = null
    mocks.lastAttendanceRpcParams = null
  })

  it('lee las clases de una materia ordenadas por fecha descendente', async () => {
    mocks.store.subject_class_sessions = [
      { id: 's-1', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING13', program_id: 'Profesorado de Ingles', teacher_id: 'teacher-1', session_date: '2026-03-01', topic: 'Clase 1' },
      { id: 's-2', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING13', program_id: 'Profesorado de Ingles', teacher_id: 'teacher-1', session_date: '2026-04-01', topic: 'Clase 2' },
    ]

    const result = await fetchClassSessions({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      teacherId: 'teacher-1',
    })

    expect(result.map((session) => session.id)).toEqual(['s-2', 's-1'])
  })

  it('crea una nueva clase', async () => {
    const result = await createClassSession({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      teacherId: 'teacher-1',
      sessionDate: '2026-05-01',
      topic: 'Presente perfecto',
    })

    expect(result.success).toBe(true)
    expect(result.session).toEqual(expect.objectContaining({
      subject_id: 'ING13',
      session_date: '2026-05-01',
      topic: 'Presente perfecto',
    }))
    expect(mocks.store.subject_class_sessions).toHaveLength(1)
  })

  it('lee la asistencia registrada para una clase', async () => {
    mocks.store.subject_attendance_records = [
      { id: 'rec-1', session_id: 'session-1', student_id: 'student-1', status: 'present' },
      { id: 'rec-2', session_id: 'session-2', student_id: 'student-2', status: 'absent' },
    ]

    const result = await fetchAttendanceForSession('session-1')
    expect(result).toEqual([expect.objectContaining({ id: 'rec-1', status: 'present' })])
  })

  it('lee la asistencia registrada para varias clases', async () => {
    mocks.store.subject_attendance_records = [
      { id: 'rec-1', session_id: 'session-1', student_id: 'student-1', status: 'present' },
      { id: 'rec-2', session_id: 'session-2', student_id: 'student-1', status: 'absent' },
      { id: 'rec-3', session_id: 'session-3', student_id: 'student-1', status: 'present' },
    ]

    const result = await fetchAttendanceForSessions(['session-1', 'session-2'])
    expect(result.map((record) => record.id)).toEqual(['rec-1', 'rec-2'])
  })

  it('guarda la asistencia de todo el curso en una sola llamada batch', async () => {
    const result = await saveAttendanceForSession({
      sessionId: 'session-1',
      institutionId: 'inst-1',
      records: [
        { studentId: 'student-1', subjectEnrollmentId: 'enroll-1', status: 'present' },
        { studentId: 'student-2', subjectEnrollmentId: 'enroll-2', status: 'absent', observations: 'Aviso medico' },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.records).toHaveLength(2)
    expect(mocks.store.subject_attendance_records).toEqual([
      expect.objectContaining({ session_id: 'session-1', student_id: 'student-1', status: 'present' }),
      expect.objectContaining({ session_id: 'session-1', student_id: 'student-2', status: 'absent', observations: 'Aviso medico' }),
    ])
  })

  it('omite identificadores legacy de inscripcion en el batch de asistencia', async () => {
    const result = await saveAttendanceForSession({
      sessionId: 'session-1',
      institutionId: 'inst-1',
      records: [{
        studentId: 'e342c2ae-3275-4703-9ac9-ddc9b6268a77',
        subjectEnrollmentId: 'student-enrollment-e342c2ae-3275-4703-9ac9-ddc9b6268a77-ING06-1787793122768',
        status: 'present',
      }],
    })

    expect(result.success).toBe(true)
    expect(mocks.lastAttendanceRpcParams.p_records[0].subject_enrollment_id).toBeNull()
  })

  it('actualiza registros existentes por session_id y student_id en vez de duplicarlos', async () => {
    mocks.store.subject_attendance_records = [
      { id: 'rec-1', session_id: 'session-1', student_id: 'student-1', status: 'present' },
    ]

    await saveAttendanceForSession({
      sessionId: 'session-1',
      institutionId: 'inst-1',
      records: [{ studentId: 'student-1', subjectEnrollmentId: 'enroll-1', status: 'late' }],
    })

    expect(mocks.store.subject_attendance_records).toHaveLength(1)
    expect(mocks.store.subject_attendance_records[0]).toEqual(expect.objectContaining({ id: 'rec-1', status: 'late' }))
  })

  it('lee la asistencia del alumno con los datos de la clase', async () => {
    mocks.store.subject_class_sessions = [
      { id: 'session-1', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING06', program_id: 'Profesorado de Ingles', teacher_id: 'teacher-1', session_date: '2026-05-01' },
    ]
    mocks.store.subject_attendance_records = [
      { id: 'rec-1', institution_id: 'inst-1', workspace_key: 'main', session_id: 'session-1', student_id: 'student-1', subject_enrollment_id: 'enroll-1', status: 'present' },
      { id: 'rec-2', institution_id: 'inst-1', workspace_key: 'main', session_id: 'session-1', student_id: 'student-2', subject_enrollment_id: 'enroll-2', status: 'absent' },
    ]

    const result = await fetchStudentAttendanceRecords({
      institutionId: 'inst-1',
      studentId: 'student-1',
    })

    expect(result).toEqual([
      expect.objectContaining({
        id: 'rec-1',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        session_date: '2026-05-01',
      }),
    ])
  })
})
