import { beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()
const select = vi.fn()
const single = vi.fn()
const eq = vi.fn()
const is = vi.fn()
const order = vi.fn()
const inFilter = vi.fn()
const update = vi.fn()

const queryBuilder = {
  insert,
  select,
  single,
  eq,
  is,
  order,
  in: inFilter,
  update,
}

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: vi.fn(() => queryBuilder),
  },
}))

describe('deletedPersonRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    single.mockResolvedValue({ data: { id: 'delete-1' }, error: null })
    select.mockReturnValue(queryBuilder)
    insert.mockReturnValue(queryBuilder)
    eq.mockReturnValue(queryBuilder)
    is.mockReturnValue(queryBuilder)
    inFilter.mockReturnValue(queryBuilder)
    order.mockResolvedValue({ data: [], error: null })
    update.mockReturnValue(queryBuilder)
  })

  it('registra una baja auditada en Supabase', async () => {
    const { archiveDeletedPerson } = await import('./deletedPersonRecords.js')
    const { supabase } = await import('../lib/supabase.js')

    const result = await archiveDeletedPerson({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      personType: 'student',
      person: {
        id: 'student-1',
        nombre: 'Ana',
        apellido: 'Perez',
        dni: '30111222',
        email: 'ana@example.com',
        estado: 'activo',
      },
      deletedByEmail: 'admin@example.com',
      deletionSource: 'student_roster',
      useRemote: true,
    })

    expect(supabase.from).toHaveBeenCalledWith('deleted_person_records')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      institution_id: 'inst-1',
      workspace_key: 'main',
      person_type: 'student',
      person_id: 'student-1',
      email: 'ana@example.com',
      dni: '30111222',
      display_name: 'Ana Perez',
      status: 'activo',
      deleted_by_email: 'admin@example.com',
      deletion_source: 'student_roster',
    }))
    expect(result).toEqual({ id: 'delete-1', source: 'supabase' })
  })

  it('lista bajas no restauradas por institucion, workspace y tipo', async () => {
    const rows = [{ id: 'delete-1', person_type: 'student', restored_at: null }]
    order.mockResolvedValueOnce({ data: rows, error: null })
    const { fetchDeletedPersonRecords } = await import('./deletedPersonRecords.js')

    await expect(fetchDeletedPersonRecords({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      personTypes: ['student'],
      useRemote: true,
    })).resolves.toEqual(rows)

    expect(eq).toHaveBeenCalledWith('institution_id', 'inst-1')
    expect(eq).toHaveBeenCalledWith('workspace_key', 'main')
    expect(is).toHaveBeenCalledWith('restored_at', null)
    expect(inFilter).toHaveBeenCalledWith('person_type', ['student'])
  })

  it('marca una baja como restaurada', async () => {
    const { markDeletedPersonRestored } = await import('./deletedPersonRecords.js')

    await expect(markDeletedPersonRestored({
      id: 'delete-1',
      restoredByEmail: 'admin@example.com',
      useRemote: true,
    })).resolves.toEqual({ success: true, source: 'supabase' })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      restored_at: expect.any(String),
      restored_by_email: 'admin@example.com',
    }))
    expect(eq).toHaveBeenCalledWith('id', 'delete-1')
  })

  it('bloquea la baja auditada si no hay sesion remota', async () => {
    const { archiveDeletedPerson } = await import('./deletedPersonRecords.js')

    await expect(archiveDeletedPerson({
      institutionId: 'inst-1',
      personType: 'teacher',
      person: { dni: '1', full_name: 'Docente' },
      useRemote: false,
    })).rejects.toThrow(/sesion remota/i)
  })
})
