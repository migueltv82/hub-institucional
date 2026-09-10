import { describe, expect, it } from 'vitest'
import { fetchAcademicRelationalTables } from './fetchAcademicRelationalTables.js'

function createFakeSupabase(store, { errorTable } = {}) {
  const calls = []

  return {
    calls,
    from(table) {
      const query = {
        filters: [],
        order() { return this },
        range(from, to) { this.from = from; this.to = to; return this },
        eq(column, value) {
          this.filters.push({ column, value })
          return this
        },
        select() {
          calls.push({ table, operation: 'select' })
          return this
        },
        then(resolve) {
          if (errorTable === table) {
            return resolve({ data: null, error: { message: 'boom' } })
          }
          const rows = (store[table] ?? []).filter((row) => (
            this.filters.every((filter) => row[filter.column] === filter.value)
          ))
          return resolve({ data: rows.slice(this.from, this.to + 1), error: null })
        },
      }
      return query
    },
  }
}

describe('fetchAcademicRelationalTables', () => {
  it('pagina datos mayores al limite de la API sin truncarlos', async () => {
    const rows = Array.from({ length: 1203 }, (_, id) => ({ id, institution_id: 'inst-1' }))
    const result = await fetchAcademicRelationalTables({ supabase: createFakeSupabase({ student_records: rows }), institutionId: 'inst-1' })
    expect(result.student_records).toEqual(rows)
  })

  it('no inicia lecturas si la carga fue cancelada', async () => {
    const controller = new AbortController()
    controller.abort()
    const client = createFakeSupabase({})
    await expect(fetchAcademicRelationalTables({ supabase: client, institutionId: 'inst-1', signal: controller.signal })).rejects.toThrow()
    expect(client.calls).toEqual([])
  })
  it('lee todas las tablas filtrando por institution_id', async () => {
    const institutionId = 'inst-1'
    const store = {
      careers: [{ id: 'c1', institution_id: institutionId }, { id: 'c2', institution_id: 'otra' }],
      teacher_records: [{ id: 't1', institution_id: institutionId }],
    }
    const supabase = createFakeSupabase(store)

    const result = await fetchAcademicRelationalTables({ supabase, institutionId })

    expect(result.careers).toEqual([{ id: 'c1', institution_id: institutionId }])
    expect(result.teacher_records).toEqual([{ id: 't1', institution_id: institutionId }])
    expect(result.study_plans).toEqual([])
    expect(result.teacher_exam_date_exclusions).toEqual([])
  })

  it('institucion sin datos devuelve arrays vacios en todas las tablas, sin lanzar', async () => {
    const supabase = createFakeSupabase({})

    const result = await fetchAcademicRelationalTables({ supabase, institutionId: 'inst-vacia' })
    Object.values(result).forEach((rows) => expect(rows).toEqual([]))
  })

  it('nunca usa insert/update/upsert/delete/rpc', async () => {
    const supabase = createFakeSupabase({})
    supabase.from = new Proxy(supabase.from.bind(supabase), {
      apply(target, thisArg, args) {
        const query = Reflect.apply(target, thisArg, args)
        ;['insert', 'update', 'upsert', 'delete', 'rpc'].forEach((method) => {
          if (method in query) throw new Error(`No deberia existir ${method} en una query de solo lectura.`)
        })
        return query
      },
    })

    await fetchAcademicRelationalTables({ supabase, institutionId: 'inst-1' })
  })

  it('si una tabla devuelve error, rechaza identificando cual', async () => {
    const supabase = createFakeSupabase({}, { errorTable: 'course_schedules' })

    await expect(fetchAcademicRelationalTables({ supabase, institutionId: 'inst-1' }))
      .rejects.toThrow('course_schedules: boom')
  })

  it('exige supabase e institutionId', async () => {
    await expect(fetchAcademicRelationalTables({ institutionId: 'inst-1' })).rejects.toThrow('cliente Supabase')
    await expect(fetchAcademicRelationalTables({ supabase: createFakeSupabase({}) })).rejects.toThrow('institutionId')
  })
})
