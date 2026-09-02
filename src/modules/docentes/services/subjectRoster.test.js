import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSubjectRoster, fetchTeacherSubjectRosters } from './subjectRoster.js'

const mocks = vi.hoisted(() => ({
  store: {
    subject_enrollments: [],
    student_records: [],
  },
  errors: {},
  rpcData: null,
  rpcError: null,
  edgeData: null,
  edgeError: null,
}))

function applyFilter(rows, filter) {
  if (filter.type === 'eq') {
    return rows.filter((row) => row[filter.column] === filter.value)
  }
  if (filter.type === 'in') {
    return rows.filter((row) => filter.values.includes(row[filter.column]))
  }
  if (filter.type === 'is') {
    return rows.filter((row) => (row[filter.column] ?? null) === filter.value)
  }
  return rows
}

function createQuery(tableName) {
  const query = {
    filters: [],
    select() {
      return this
    },
    eq(column, value) {
      this.filters.push({ type: 'eq', column, value })
      return this.resolve()
    },
    in(column, values) {
      this.filters.push({ type: 'in', column, values })
      return this.resolve()
    },
    is(column, value) {
      this.filters.push({ type: 'is', column, value })
      return this.resolve()
    },
    resolve() {
      const data = this.filters.reduce((rows, filter) => applyFilter(rows, filter), mocks.store[tableName])
      this.data = data
      this.error = mocks.errors[tableName] ?? null
      return this
    },
  }

  return query
}

vi.mock('../../../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (tableName) => createQuery(tableName),
    rpc: vi.fn(async (name) => {
      if (name !== 'academic_get_teacher_subject_rosters') {
        return { data: null, error: { code: '42883', message: 'unknown function' } }
      }

      if (mocks.rpcError) return { data: null, error: mocks.rpcError }
      if (mocks.rpcData) return { data: mocks.rpcData, error: null }

      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function academic_get_teacher_subject_rosters' } }
    }),
    functions: {
      invoke: vi.fn(async (name) => {
        if (name !== 'admin-users') {
          return { data: null, error: { message: 'unknown function' } }
        }

        if (mocks.edgeError) return { data: null, error: mocks.edgeError }
        if (mocks.edgeData) return { data: mocks.edgeData, error: null }

        return { data: null, error: { message: 'Accion no soportada: teacher_subject_rosters' } }
      }),
    },
  },
}))

describe('subjectRoster service', () => {
  beforeEach(() => {
    mocks.store.subject_enrollments = []
    mocks.store.student_records = []
    mocks.errors = {}
    mocks.rpcData = null
    mocks.rpcError = null
    mocks.edgeData = null
    mocks.edgeError = null
  })

  it('usa el padron seguro de la Edge Function aunque la lectura directa venga vacia por RLS', async () => {
    mocks.edgeData = {
      rosters: [{
        enrollmentId: 'edge-enroll-1',
        studentId: 'student-profile-1',
        studentRecordId: 'record-1',
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        fullName: 'Yamil Omar Abdelhamid Campos',
        dni: '45963378',
        email: 'yamil@example.com',
      }],
    }

    const result = await fetchTeacherSubjectRosters({
      institutionId: 'inst-1',
      workspaceKey: 'main',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'edge-enroll-1',
        subjectId: 'ING06',
        fullName: 'Yamil Omar Abdelhamid Campos',
      }),
    ])
  })

  it('filtra por materia cuando usa el padron seguro de la Edge Function en detalle', async () => {
    mocks.edgeData = {
      rosters: [
        {
          enrollmentId: 'edge-enroll-ing06',
          studentId: 'student-profile-1',
          studentRecordId: 'record-1',
          subjectId: 'profesorado-de-ingles:ing06',
          programId: 'profesorado-de-ingles',
          fullName: 'Alumno Ingles',
        },
        {
          enrollmentId: 'edge-enroll-ing07',
          studentId: 'student-profile-2',
          studentRecordId: 'record-2',
          subjectId: 'ING07',
          programId: 'profesorado-de-ingles',
          fullName: 'Otro Alumno',
        },
      ],
    }

    const result = await fetchSubjectRoster({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'edge-enroll-ing06',
        fullName: 'Alumno Ingles',
      }),
    ])
  })

  it('enriquece las inscripciones activas con nombre y dni del padron', async () => {
    mocks.store.subject_enrollments = [
      {
        id: 'enroll-1',
        student_id: 'student-1',
        student_record_id: 'record-1',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
        status: 'active',
        deleted_at: null,
      },
      {
        id: 'enroll-2',
        student_id: 'student-2',
        student_record_id: 'record-2',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
        status: 'dropped',
        deleted_at: null,
      },
    ]
    mocks.store.student_records = [
      { id: 'record-1', full_name: 'Ana Perez', dni: '30111222', email: 'ana@example.com' },
    ]

    const result = await fetchSubjectRoster({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'enroll-1',
        subjectId: 'ING13',
        programId: 'Profesorado de Ingles',
        studentId: 'student-1',
        studentRecordId: 'record-1',
        fullName: 'Ana Perez',
        dni: '30111222',
        email: 'ana@example.com',
      }),
    ])
  })

  it('excluye inscripciones huerfanas que no pueden resolverse a un alumno real', async () => {
    mocks.store.subject_enrollments = [
      {
        id: 'enroll-1',
        student_id: 'student-1',
        student_record_id: null,
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
        status: 'enrolled',
        deleted_at: null,
      },
    ]

    const result = await fetchSubjectRoster({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
    })

    expect(result).toEqual([])
  })

  it('lee todas las inscripciones visibles para cruzarlas en el dashboard docente', async () => {
    mocks.store.subject_enrollments = [
      {
        id: 'enroll-1',
        student_id: 'student-1',
        student_record_id: 'record-1',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        status: 'active',
        deleted_at: null,
      },
      {
        id: 'enroll-2',
        student_id: 'student-2',
        student_record_id: 'record-2',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING16',
        program_id: 'Profesorado de Ingles',
        status: 'dropped',
        deleted_at: null,
      },
    ]
    mocks.store.student_records = [
      { id: 'record-1', full_name: 'Yamil Abdelamhind Campos', dni: '45963378', email: 'yamil@example.com' },
    ]

    const result = await fetchTeacherSubjectRosters({
      institutionId: 'inst-1',
      workspaceKey: 'main',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'enroll-1',
        subjectId: 'ING06',
        programId: 'Profesorado de Ingles',
        fullName: 'Yamil Abdelamhind Campos',
      }),
    ])
  })

  it('no conserva alumnos de una RPC desactualizada si ya no tienen inscripcion activa', async () => {
    mocks.rpcData = {
      rosters: [{
        enrollmentId: 'enroll-rpc-1',
        studentId: 'student-1',
        studentRecordId: 'record-1',
        subjectId: 'profesorado-de-ingles:ing06',
        programId: 'profesorado-de-ingles',
        fullName: 'Yamil Abdelhamid Campos',
        dni: '45963378',
        email: 'yamil@example.com',
      }],
    }

    const result = await fetchSubjectRoster({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
    })

    expect(result).toEqual([])
  })

  it('no mantiene en el dashboard un alumno dado de baja aunque la RPC aun lo devuelva', async () => {
    mocks.rpcData = {
      rosters: [{
        enrollmentId: 'enroll-rpc-stale',
        studentId: 'student-1',
        studentRecordId: 'record-1',
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        fullName: 'Alumno dado de baja',
      }],
    }
    mocks.store.subject_enrollments = [{
      id: 'enroll-rpc-stale',
      student_id: 'student-1',
      student_record_id: 'record-1',
      institution_id: 'inst-1',
      workspace_key: 'main',
      subject_id: 'ING06',
      program_id: 'PROFESORADO DE INGLES',
      status: 'dropped',
      deleted_at: '2026-08-22T23:00:00.000Z',
    }]

    const result = await fetchTeacherSubjectRosters({ institutionId: 'inst-1', workspaceKey: 'main' })

    expect(result).toEqual([])
  })

  it('una baja reciente anula una inscripcion activa duplicada anterior', async () => {
    mocks.store.subject_enrollments = [
      {
        id: 'enroll-active-old',
        student_id: 'student-1',
        student_record_id: 'record-1',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        status: 'active',
        deleted_at: null,
        updated_at: '2026-08-20T10:00:00.000Z',
      },
      {
        id: 'enroll-dropped-new',
        student_id: 'student-1',
        student_record_id: 'record-1',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        status: 'dropped',
        deleted_at: '2026-08-22T23:00:00.000Z',
        dropped_at: '2026-08-22T23:00:00.000Z',
        updated_at: '2026-08-22T23:00:00.000Z',
      },
    ]
    mocks.store.student_records = [
      { id: 'record-1', full_name: 'Alumno de prueba', dni: '45963378' },
    ]

    const detail = await fetchSubjectRoster({
      institutionId: 'inst-1',
      subjectId: 'ING06',
      programId: 'Profesorado de Ingles',
    })
    const dashboard = await fetchTeacherSubjectRosters({ institutionId: 'inst-1' })

    expect(detail).toEqual([])
    expect(dashboard).toEqual([])
  })

  it('usa lectura directa si la RPC existe pero no devuelve alumnos', async () => {
    mocks.rpcData = { rosters: [] }
    mocks.store.subject_enrollments = [
      {
        id: 'enroll-active-ing06',
        student_id: 'student-profile-1',
        student_record_id: 'record-1',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING06',
        program_id: 'PROFESORADO DE INGLES',
        status: 'active',
        deleted_at: null,
      },
    ]
    mocks.store.student_records = [
      {
        id: 'record-1',
        profile_id: 'student-profile-1',
        full_name: 'Yamil Omar Abdelhamid Campos',
        dni: '45963378',
        email: 'yamilomarabdelhamidcampos@gmail.com',
      },
    ]

    const result = await fetchSubjectRoster({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'enroll-active-ing06',
        studentRecordId: 'record-1',
        fullName: 'Yamil Omar Abdelhamid Campos',
      }),
    ])
  })

  it('usa lectura directa de dashboard si la RPC existe pero viene vacia', async () => {
    mocks.rpcData = { rosters: [] }
    mocks.store.subject_enrollments = [
      {
        id: 'enroll-active-ing06',
        student_id: 'student-profile-1',
        student_record_id: 'record-1',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING06',
        program_id: 'PROFESORADO DE INGLES',
        status: 'active',
        deleted_at: null,
      },
    ]
    mocks.store.student_records = [
      {
        id: 'record-1',
        profile_id: 'student-profile-1',
        full_name: 'Yamil Omar Abdelhamid Campos',
        dni: '45963378',
        email: 'yamilomarabdelhamidcampos@gmail.com',
      },
    ]

    const result = await fetchTeacherSubjectRosters({
      institutionId: 'inst-1',
      workspaceKey: 'main',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'enroll-active-ing06',
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        fullName: 'Yamil Omar Abdelhamid Campos',
      }),
    ])
  })

  it('resuelve alumnos por profile_id si la inscripcion no tiene student_record_id', async () => {
    mocks.store.subject_enrollments = [
      {
        id: 'enroll-without-record',
        student_id: 'student-profile-1',
        student_record_id: null,
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        status: 'active',
        deleted_at: null,
      },
    ]
    mocks.store.student_records = [
      {
        id: 'record-1',
        profile_id: 'student-profile-1',
        full_name: 'Yamil Abdelhamid Campos',
        dni: '45963378',
        email: 'yamil@example.com',
      },
    ]

    const result = await fetchTeacherSubjectRosters({
      institutionId: 'inst-1',
      workspaceKey: 'main',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'enroll-without-record',
        studentId: 'student-profile-1',
        studentRecordId: null,
        fullName: 'Yamil Abdelhamid Campos',
      }),
    ])
  })

  it('recupera el nombre por RPC solo para una inscripcion que sigue activa', async () => {
    mocks.store.subject_enrollments = [{
      id: 'enroll-active-without-record',
      student_id: 'student-profile-1',
      student_record_id: null,
      institution_id: 'inst-1',
      workspace_key: 'main',
      subject_id: 'ING06',
      program_id: 'Profesorado de Ingles',
      status: 'active',
      deleted_at: null,
    }]
    mocks.rpcData = {
      rosters: [{
        enrollmentId: 'enroll-active-without-record',
        studentId: 'student-profile-1',
        subjectId: 'ING06',
        programId: 'Profesorado de Ingles',
        fullName: 'Yamil Campos',
        dni: '45963378',
      }],
    }

    const result = await fetchSubjectRoster({
      institutionId: 'inst-1',
      subjectId: 'ING06',
      programId: 'Profesorado de Ingles',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'enroll-active-without-record',
        fullName: 'Yamil Campos',
        dni: '45963378',
      }),
    ])
  })

  it('recupera el alumno aunque la inscripcion use subject_id legado y carrera slug', async () => {
    mocks.store.subject_enrollments = [
      {
        id: 'enroll-legacy-1',
        student_id: 'student-1',
        student_record_id: 'record-1',
        institution_id: 'inst-1',
        workspace_key: 'main',
        subject_id: 'profesorado-de-ingles:ing06',
        program_id: 'profesorado-de-ingles',
        status: 'active',
        deleted_at: null,
      },
    ]
    mocks.store.student_records = [
      { id: 'record-1', full_name: 'Yamil Abdelamhind Campos', dni: '45963378', email: 'yamil@example.com' },
    ]

    const result = await fetchSubjectRoster({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
    })

    expect(result).toEqual([
      expect.objectContaining({
        enrollmentId: 'enroll-legacy-1',
        subjectId: 'profesorado-de-ingles:ing06',
        programId: 'profesorado-de-ingles',
        fullName: 'Yamil Abdelamhind Campos',
      }),
    ])
  })

  it('devuelve arreglo vacio si falta subjectId', async () => {
    const result = await fetchSubjectRoster({ institutionId: 'inst-1', subjectId: '' })
    expect(result).toEqual([])
  })

  it('devuelve arreglo vacio si la consulta de inscripciones falla', async () => {
    mocks.errors.subject_enrollments = { message: 'boom' }
    const result = await fetchSubjectRoster({ institutionId: 'inst-1', subjectId: 'ING13', programId: 'Profesorado de Ingles' })
    expect(result).toEqual([])
  })
})
