import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ deletes: [], upserts: [] }))

vi.mock('../lib/supabase.js', () => {
  const existing = {
    student_records: [{ id: 's-old', email: 'viejo@example.invalid', career: 'PROFESORADO DE INGLES' }],
    teacher_records: [{ id: 't-old', dni: '11111111', full_name: 'Docente Fuera De Planilla' }],
  }
  const from = (table) => {
    const query = {
      select: () => query,
      eq: () => query,
      then: (resolve) => resolve({ data: existing[table] ?? [], error: null }),
      upsert: (rows) => { calls.upserts.push({ table, count: rows.length }); return Promise.resolve({ error: null }) },
      delete: () => ({ in: (column, ids) => { calls.deletes.push({ table, ids }); return Promise.resolve({ error: null }) } }),
    }
    return query
  }
  return { isSupabaseConfigured: true, supabase: { from } }
})

const { syncRosterRecords } = await import('./rosterRecords.js')

describe('syncRosterRecords (PB.2)', () => {
  beforeEach(() => { calls.deletes.length = 0; calls.upserts.length = 0 })

  it('el autosave no borra legajos de alumnos ni de docentes que faltan en la planilla', async () => {
    const snapshot = {
      alumnos: [{ nombre: 'Ana', apellido: 'Uno', email: 'ana@example.invalid', carrera: 'PROFESORADO DE INGLES' }],
      docentes: [{ nombre: 'Docente', apellido: 'En Planilla', dni: '22222222', carreras: ['PROFESORADO DE INGLES'] }],
    }
    const result = await syncRosterRecords({ institutionId: 'a1000000-0000-4000-8000-000000000001', workspaceKey: 'main', snapshot, useRemote: true })
    expect(calls.deletes).toEqual([])
    expect(result.students.deleted).toBe(0)
    expect(result.teachers.deleted).toBe(0)
  })
})
