import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSubjectDisplayIndex, fetchTeacherSubjects } from './teacherSubjects.js'

const mocks = vi.hoisted(() => ({
  store: {
    subject_teacher_assignments: [],
  },
  nextError: null,
  missingDeletedAtOnce: false,
}))

function createQuery(tableName) {
  function applyFilters(query) {
    const data = mocks.store[tableName].filter((row) => (
      query.filters.every((filter) => row[filter.column] === filter.value)
    ))
    query.data = data
    query.error = mocks.nextError
  }

  const query = {
    filters: [],
    select() {
      return this
    },
    eq(column, value) {
      this.filters.push({ column, value })
      applyFilters(this)
      return this
    },
    is(column, value) {
      this.filters.push({ column, value })
      applyFilters(this)
      if (column === 'deleted_at' && mocks.missingDeletedAtOnce) {
        this.data = null
        this.error = { code: '42703', message: 'column subject_teacher_assignments.deleted_at does not exist' }
        mocks.missingDeletedAtOnce = false
      }
      return this
    },
  }

  return query
}

vi.mock('../../../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (tableName) => createQuery(tableName),
  },
}))

describe('teacherSubjects service', () => {
  beforeEach(() => {
    mocks.store.subject_teacher_assignments = []
    mocks.nextError = null
    mocks.missingDeletedAtOnce = false
  })

  it('lee solo las materias activas asignadas al docente', async () => {
    mocks.store.subject_teacher_assignments = [
      { id: 'assign-1', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING13', program_id: 'Profesorado de Ingles', teacher_id: 'teacher-1', status: 'active', deleted_at: null },
      { id: 'assign-2', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'HIS1', program_id: 'Profesorado de Historia', teacher_id: 'teacher-1', status: 'inactive' },
      { id: 'assign-3', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING13', program_id: 'Profesorado de Ingles', teacher_id: 'teacher-2', status: 'active' },
      { id: 'assign-4', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'QUI1', program_id: 'Profesorado de Quimica', teacher_id: 'teacher-1', status: 'active', deleted_at: '2026-08-11T00:00:00.000Z' },
    ]

    const result = await fetchTeacherSubjects({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      teacherUserId: 'teacher-1',
    })

    expect(result).toEqual([
      expect.objectContaining({ id: 'assign-1', subject_id: 'ING13', program_id: 'Profesorado de Ingles' }),
    ])
  })

  it('devuelve arreglo vacio si falta el id del docente', async () => {
    const result = await fetchTeacherSubjects({ institutionId: 'inst-1', teacherUserId: '' })
    expect(result).toEqual([])
  })

  it('reintenta sin deleted_at si la base todavia no tiene la columna', async () => {
    mocks.missingDeletedAtOnce = true
    mocks.store.subject_teacher_assignments = [
      { id: 'assign-1', institution_id: 'inst-1', workspace_key: 'main', subject_id: 'ING13', program_id: 'Profesorado de Ingles', teacher_id: 'teacher-1', status: 'active' },
    ]

    const result = await fetchTeacherSubjects({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      teacherUserId: 'teacher-1',
    })

    expect(result).toEqual([
      expect.objectContaining({ id: 'assign-1', subject_id: 'ING13' }),
    ])
  })

  it('devuelve arreglo vacio y no lanza si supabase responde error', async () => {
    mocks.nextError = { message: 'boom' }
    const result = await fetchTeacherSubjects({ institutionId: 'inst-1', teacherUserId: 'teacher-1' })
    expect(result).toEqual([])
  })

  it('arma el indice de materias por subjectId::programId desde planesEstudio', () => {
    const index = buildSubjectDisplayIndex([
      { carrera: 'Profesorado de Ingles', materia: 'ING13', nombre: 'Ingles III', anio: 3 },
      { carrera: '  Profesorado de Historia  ', codigo: 'HIS1', nombreMateria: 'Historia I', anio: '1' },
    ])

    expect(index.get('ING13::Profesorado de Ingles')).toEqual({
      nombre: 'Ingles III',
      carrera: 'Profesorado de Ingles',
      anio: '3',
    })
    expect(index.get('HIS1::Profesorado de Historia')).toEqual({
      nombre: 'Historia I',
      carrera: 'Profesorado de Historia',
      anio: '1',
    })
  })

  it('ignora filas de plan de estudio sin materia o carrera', () => {
    const index = buildSubjectDisplayIndex([
      { carrera: '', materia: 'ING13', nombre: 'Ingles III' },
      { carrera: 'Profesorado de Ingles', materia: '', nombre: 'Sin codigo' },
    ])

    expect(index.size).toBe(0)
  })
})
